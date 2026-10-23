import { documentCreatedSkuCode, parseDocumentSkuSelection } from '../../../packages/application/src/document-specification.ts';
import type { DocumentSpecificationResolution, DocumentSpecification } from '../../../packages/application/src/document-specification.ts';
import { appendProductSkusInTransaction } from '../../../packages/application/src/product-maintenance-service.ts';
import type { ProductSkuRecord } from '../../../packages/application/src/product-maintenance-ports.ts';
import { DomainError, requireDomain } from '../../../packages/domain/src/errors.ts';
import { entityId } from '../../../packages/domain/src/values.ts';
import type { EntityId } from '../../../packages/domain/src/values.ts';
import type { NativeRuntime26Capability } from '../../../packages/application/src/native-import-schema-contract.ts';
import type { MaintainedCatalogue26TransactionProof } from './catalogue-completeness.ts';
import { withDocumentSpecificationMaintenanceContext } from './maintenance-command-unit-of-work.ts';
import { withProductMaintenanceTransaction } from './product-maintenance-store.ts';
import type { PgSalesClient, PgSalesPool } from './sales-unit-of-work.ts';
import { integerValue } from './codec.ts';

const tuple = (s: DocumentSpecification) => JSON.stringify([s.productId,s.colorId,s.fitId,s.sizeId]);
/** No connection or transaction ownership. Only the original document adapter
 * calls this after locking its receipt/target and checking current SAVE access. */
export async function resolveNativeDocumentSpecifications(context: {
  readonly pool: PgSalesPool; readonly client: PgSalesClient; readonly runtime: NativeRuntime26Capability;
  readonly catalogue: MaintainedCatalogue26TransactionProof; readonly assertBound: () => void;
}, input: DocumentSpecificationResolution): Promise<readonly EntityId<'sku'>[]> {
  context.assertBound();
  const selections = input.selections.map(parseDocumentSkuSelection);
  requireDomain(selections.length > 0 && selections.length <= 200,'INVALID_LINES','Only actual nonzero document rows may resolve specifications');
  const specifications = new Map<string,DocumentSpecification>();
  for (const selected of selections) if (selected.spec) specifications.set(tuple(selected.spec),selected.spec);
  if (!specifications.size) return selections.map(s => entityId('sku',s.skuId!));
  await context.runtime.assertReady(context.client,'PRODUCT_MAINTENANCE'); context.assertBound();
  await context.runtime.assertReady(context.client,'PRODUCT_SEASONS_READ'); context.assertBound();
  const query = async (sql: string, values: unknown[] = []) => { context.assertBound(); const r = await context.client.query(sql,values);context.assertBound();return r; };
  const products = [...new Set([...specifications.values()].map(s=>s.productId))].sort();
  const versions = new Map<string,number>();
  for (const productId of products) {
    await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`naijue:product:${productId}`]);
    const roots = (await query('/* document-specification:product */ SELECT id,size_group_id,version,enabled,deleted_at FROM naijue_erp.product WHERE id=$1::uuid FOR UPDATE',[productId])).rows;
    requireDomain(roots.length===1 && roots[0]!.id===productId && roots[0]!.enabled===true && roots[0]!.deleted_at===null,
      'PRODUCT_REFERENCE_UNAVAILABLE','Actual enabled product is required');
    versions.set(productId,integerValue(roots[0]!.version));
    entityId('sizeGroup',roots[0]!.size_group_id as string);
  }
  const resolved = new Map<string,EntityId<'sku'>>(), missing = new Map<string,DocumentSpecification[]>();
  for (const [coordinate,s] of [...specifications].sort(([a],[b])=>a.localeCompare(b))) {
    const actual = (await query(`/* document-specification:member */ SELECT p.id FROM naijue_erp.product p
      JOIN naijue_erp.size_group_member m ON m.size_group_id=p.size_group_id AND m.size_id=$4::uuid
      JOIN naijue_erp.size z ON z.id=m.size_id JOIN naijue_erp.color c ON c.id=$2::uuid
      JOIN naijue_erp.fit f ON f.id=$3::uuid WHERE p.id=$1::uuid AND p.enabled AND p.deleted_at IS NULL
        AND c.enabled AND c.deleted_at IS NULL AND f.enabled AND f.deleted_at IS NULL FOR SHARE OF p,m,z,c,f`,[s.productId,s.colorId,s.fitId,s.sizeId])).rows;
    requireDomain(actual.length===1 && actual[0]!.id===s.productId,'PRODUCT_SIZE_GROUP_MISMATCH','Selection must belong to the actual current product group');
    const rows = (await query(`/* document-specification:tuple */ SELECT id,enabled FROM naijue_erp.sku
      WHERE product_id=$1::uuid AND color_id=$2::uuid AND fit_id=$3::uuid AND size_id=$4::uuid FOR UPDATE`,[s.productId,s.colorId,s.fitId,s.sizeId])).rows;
    requireDomain(rows.length<=1,'PRODUCT_SPEC_CONFLICT','Actual specification must be unique');
    if (rows.length) {
      requireDomain(rows[0]!.enabled===true,'PRODUCT_REFERENCE_UNAVAILABLE','A disabled specification cannot be recreated or restored by document SAVE');
      resolved.set(coordinate,entityId('sku',rows[0]!.id as string));
    } else { const list=missing.get(s.productId)??[];list.push(s);missing.set(s.productId,list); }
  }
  if (missing.size) await context.catalogue.captureDocumentAppendBaseline([...missing.keys()]);
  const generated = new Set<string>([input.scope.documentId,input.scope.operationId]);
  const fresh = (kind:'sku'|'operation') => { const id=entityId(kind,input.newId(kind));
    requireDomain(!generated.has(id),'INVALID_ID','Actual distinct new entity identities required');generated.add(id);return id; };
  for (const [productId,specs] of missing) {
    const operationId=fresh('operation'), requestKey=`doc-spec:${input.scope.operationId}:${productId}`;
    const skus: ProductSkuRecord[]=specs.map(s=>{const id=fresh('sku');resolved.set(tuple(s),entityId('sku',id));
      return {id,productId,colorId:s.colorId,fitId:s.fitId,sizeId:s.sizeId,skuCode:documentCreatedSkuCode(id),enabled:true,version:1,createdOperationId:operationId};});
    const skuFacts=skus.map(s=>({id:s.id,product_id:s.productId,color_id:s.colorId,fit_id:s.fitId,size_id:s.sizeId,
      sku_code:s.skuCode,enabled:true,version:1,created_operation_id:operationId}));
    try {
      const appended=await withDocumentSpecificationMaintenanceContext({ ...context, append:{parent:input.scope,productId,operationId,requestKey,
        expectedVersion:versions.get(productId)!,skuFacts} }, borrowed=>withProductMaintenanceTransaction(borrowed,
          tx=>appendProductSkusInTransaction(tx,{actor:input.scope.actor,productId,expectedVersion:versions.get(productId)!,operationId,requestKey,
            completedAt:input.scope.completedAt,skus}),{seasonArray:true}));
      context.catalogue.registerDocumentAppend(appended.proof);
    } catch(error) {
      if(error!==null && typeof error==='object' && 'code' in error && error.code==='23505')
        throw new DomainError('PRODUCT_SPEC_CONFLICT','New specification identity/code conflicts; the original SAVE must roll back');
      throw error;
    }
  }
  if (missing.size) await context.catalogue.verifier.assertComplete({productIds:[...missing.keys()].map(id=>entityId('product',id)),query:context.catalogue.query});
  context.assertBound();
  return selections.map(s=>s.spec?resolved.get(tuple(s.spec))!:entityId('sku',s.skuId));
}
