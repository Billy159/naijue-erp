import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { entityId } from '../../../packages/domain/src/values.ts';
import { CATALOGUE_PRICE_KEYS, validateCompleteCataloguePrices } from '../../../packages/application/src/catalogue-price-input.ts';
import { SALES_NATIVE_FACT_MAX_LINES, SALES_NATIVE_FACT_QUERY_BATCH_SIZE } from '../../../packages/application/src/sales-native-facts.ts';
import { checkedRuntime27CommandCapability } from '../../../packages/application/src/runtime27-command-capability.ts';
import type { Runtime27CommandCapability } from '../../../packages/application/src/runtime27-command-capability.ts';
import type { NativeCatalogueCompletenessVerifier, NativeSalesFactQuery } from './sales-native-facts.ts';
import type { PgSalesClient } from './sales-unit-of-work.ts';
import { requestHash } from '../../../packages/application/src/request-hash.ts';
import type { MaintenanceCompletion } from '../../../packages/application/src/maintenance-commit-ports.ts';
import { readDocumentAppendEvidence } from './maintenance-command-unit-of-work.ts';
import type { DocumentAppendEvidence } from './maintenance-command-unit-of-work.ts';
import { assertProductEvidencePendingCapacity } from './catalogue-completeness.ts';
import { safeStandard27CapacitySnapshot } from './standard27-product-create-capacity.ts';

const complete=(condition:unknown,message:string):void=>requireDomain(condition,'NATIVE_CATALOGUE_FACTS_UNAVAILABLE',message);
/** Ordinary retained business catalogue reads on the original authorized client.
 * Published visibility remains enforced by the database RLS and runtime host;
 * source-import and audit-history tables are not required for business reads. */
export function createStandardCatalogue27TransactionProof(client: PgSalesClient, capability: Runtime27CommandCapability,
  assertActive:()=>void): Readonly<StandardCatalogue27TransactionProof> {
  const runtime=checkedRuntime27CommandCapability(capability);
  if(typeof client?.query!=='function'||typeof assertActive!=='function')throw new TypeError('Original client and transaction guard required');
  const active=()=>{const result:unknown=assertActive();if(result!==undefined)throw new TypeError('Transaction guard cannot return success substitute');};
  const query:NativeSalesFactQuery=async(sql,values)=>{active();const result=await client.query(sql,values);active();return result;};
  const verifier:NativeCatalogueCompletenessVerifier=Object.freeze({async assertComplete(context:Parameters<NativeCatalogueCompletenessVerifier['assertComplete']>[0]) {
    active();complete(context.query===query,'Business catalogue requires its original transaction query');
    const ids=[...new Set(context.productIds.map(v=>entityId('product',v)))].sort();
    complete(ids.length>0&&ids.length<=SALES_NATIVE_FACT_MAX_LINES,'Bounded nonempty product set required');
    await runtime.assertReady(client,'CATALOGUE_READ');active();
    for(let offset=0;offset<ids.length;offset+=SALES_NATIVE_FACT_QUERY_BATCH_SIZE){
      const batch=ids.slice(offset,offset+SALES_NATIVE_FACT_QUERY_BATCH_SIZE);
      const rows=(await query(`/* business-catalogue27:products */ SELECT p.id AS product_id FROM naijue_erp.product p
        WHERE p.id=ANY($1::uuid[]) AND p.deleted_at IS NULL ORDER BY p.id FOR SHARE OF p`,[batch])).rows;
      const found=new Set<string>();
      for(const row of rows){complete(typeof row.product_id==='string'&&batch.includes(row.product_id as typeof batch[number])&&!found.has(row.product_id),'Missing, foreign or repeated product');found.add(row.product_id as string);}
      complete(found.size===batch.length,'Visible retained product required');
    }
  }});
  const assertExistingSkus=async(skuIds:readonly string[]):Promise<void>=>{
    active();const ids=[...new Set(skuIds.map(v=>entityId('sku',v)))].sort();
    complete(ids.length>0&&ids.length<=SALES_NATIVE_FACT_MAX_LINES,'Bounded nonempty SKU set required');
    await runtime.assertReady(client,'CATALOGUE_READ');active();
    const products=new Set<ReturnType<typeof entityId<'product'>>>();
    for(let offset=0;offset<ids.length;offset+=SALES_NATIVE_FACT_QUERY_BATCH_SIZE){
      const batch=ids.slice(offset,offset+SALES_NATIVE_FACT_QUERY_BATCH_SIZE);
      const rows=(await query(`/* business-catalogue27:skus */ SELECT s.id AS sku_id,p.id AS product_id FROM naijue_erp.sku s
        JOIN naijue_erp.product p ON p.id=s.product_id AND p.deleted_at IS NULL
        WHERE s.id=ANY($1::uuid[]) ORDER BY s.id FOR SHARE OF s,p`,[batch])).rows;
      const found=new Set<string>();
      for(const row of rows){complete(typeof row.sku_id==='string'&&batch.includes(row.sku_id as typeof batch[number])&&!found.has(row.sku_id),'Missing, foreign or repeated SKU');
        complete(typeof row.product_id==='string','Actual visible SKU product required');found.add(row.sku_id as string);products.add(entityId('product',row.product_id as string));}
      complete(found.size===batch.length,'Visible SKU and its actual product required');
    }
    await verifier.assertComplete({query,productIds:[...products]});active();
  };
  const baselines=new Map<string,number>(), admitted=new Map<string,string>(), appended=new Set<string>();
  const captureDocumentAppendBaseline=async(productIds:readonly string[])=>{
    active();const ids=[...new Set(productIds.map(id=>entityId('product',id)))].sort();
    complete(ids.length>0 && ids.length===productIds.length && ids.every(id=>!baselines.has(id)),'Unique original product baseline required');
    await verifier.assertComplete({query,productIds:ids});
    const rows=(await query(`/* business-catalogue27:append-baseline */ SELECT id,version FROM naijue_erp.product
      WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE`,[ids])).rows;
    const found=new Set<string>();for(const row of rows){complete(typeof row.id==='string'&&ids.includes(row.id as typeof ids[number])&&!found.has(row.id)
      &&typeof row.version==='number'&&Number.isInteger(row.version)&&row.version>0&&row.version<2147483647,'Exact original locked product version required');found.add(row.id as string);baselines.set(row.id as string,row.version as number);}
    complete(found.size===ids.length,'Complete locked product baseline required');active();
  };
  const assertPendingCapacity=async(input:MaintenanceCompletion)=>{
    active();const p=safeStandard27CapacitySnapshot(input) as MaintenanceCompletion;
    complete(p.kind==='PRODUCT'&&p.action==='EDIT'&&p.oldVersion!==null&&p.newVersion===p.oldVersion+1&&baselines.get(p.targetId)===p.oldVersion&&!appended.has(p.targetId), 'Original locked product version required');
    const fingerprint=requestHash(p),prior=admitted.get(p.operationId);complete(prior===undefined||prior===fingerprint,'Pending append operation changed');
    assertProductEvidencePendingCapacity({count:0,bytes:0},p.beforeValues,p.afterValues);admitted.set(p.operationId,fingerprint);active();
  };
  const registerDocumentAppend=(proof:DocumentAppendEvidence)=>{
    active();const {completion}=readDocumentAppendEvidence(proof,client);
    complete(baselines.get(completion.targetId)===completion.oldVersion&&!appended.has(completion.targetId)&&admitted.get(completion.operationId)===requestHash(completion),'Original same-client admitted append required');
    appended.add(completion.targetId);
  };
  return Object.freeze({query,verifier,assertExistingSkus,captureDocumentAppendBaseline,assertPendingCapacity,registerDocumentAppend});
}

export interface StandardCatalogue27TransactionProof {
 readonly query:NativeSalesFactQuery;readonly verifier:NativeCatalogueCompletenessVerifier;
 assertExistingSkus(skuIds:readonly string[]):Promise<void>;
 captureDocumentAppendBaseline(productIds:readonly string[]):Promise<void>;
 assertPendingCapacity(completion:MaintenanceCompletion):Promise<void>;
 registerDocumentAppend(proof:DocumentAppendEvidence):void;
}

export function standardRootProofSql(kind:'PRODUCT'|'SKU'):string {
 const table=kind==='PRODUCT'?'product':'sku';
 return `/* standard-catalogue27:exact-imported-${kind.toLowerCase()}-roots */ WITH roots AS MATERIALIZED (
        SELECT p.* FROM naijue_erp.${table} p WHERE p.id=ANY($1::uuid[]) ORDER BY p.id FOR SHARE OF p
      ) SELECT p.id AS root_id, ${kind==='PRODUCT' ? `p.id AS product_id, ${CATALOGUE_PRICE_KEYS.map(k=>`p.${k}::text AS ${k}`).join(',')},` : 'p.id AS sku_id, p.product_id,'}
        (SELECT jsonb_object_agg(k,item->'fields'->k) FROM unnest($3::text[]) k WHERE item->'fields' ? k) AS source_prices,
        ((naijue_erp.standard_business_ready() AND b.status='IMPORTED' AND b.completed_at IS NOT NULL
          AND b.inventory_mode='CUTOFF_STOCK_BASELINE' AND b.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
          AND s.status='IMPORTED' AND s.reviewed_at IS NOT NULL AND s.source_system=b.source_name
          AND s.source_entity_type='${kind}' AND s.target_type='${kind}' AND s.target_id=p.id
          AND s.source_record_hash ~ '^[0-9a-f]{64}$' AND b.source_hash ~ '^[0-9a-f]{64}$'
          AND length(s.source_key)>0 AND length(btrim(s.source_file_ref))>0
          AND s.decision_reason::jsonb=jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id)
          AND r.status='COMMITTED' AND r.target_type='IMPORT' AND r.target_id=b.id AND r.action='IMPORT_CHUNK'
          AND r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND r.result_data->>'phase'='MASTER'
          AND r.result_data->>'packageManifestSha256'=b.source_hash AND r.result_data->>'batchId'=b.id::text
          AND r.result_data->'sourceRecordIds' ? s.id::text
          AND a.object_type=r.target_type AND a.object_id=r.target_id AND a.action=r.action
          AND a.actor_account_id=r.actor_account_id AND a.occurred_at=r.completed_at
          AND a.after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND a.after_values->>'phase'='MASTER'
          AND a.after_values->'request'->>'namespace'=b.source_name
          AND a.after_values->'request'->>'package_manifest_sha256'=b.source_hash
          AND item->>'id'=s.id::text AND item->>'source_key'=s.source_key
          AND item->>'entity_type'=s.source_entity_type AND item->>'target_type'=s.target_type
          AND item->>'target_id'=s.target_id::text AND item->>'source_hash'=s.source_record_hash
          AND item->>'file_ref'=s.source_file_ref AND item->'fields'->>'id'=p.id::text
          AND item->>'identity_basis' IN ('EXISTING_VERIFIED','STABLE_IMPORT_ID_V1')
          AND jsonb_typeof(item->'source_refs')='array' AND jsonb_array_length(item->'source_refs')>0
          AND s.source_record_hash=encode(sha256(convert_to(jsonb_build_object('source_key',s.source_key,
            'fields',item->'fields','source_refs',item->'source_refs')::text,'UTF8')),'hex')
          AND to_jsonb(p)=to_jsonb(jsonb_populate_record(NULL::naijue_erp.${table},item->'fields'))
          ${kind==='PRODUCT' ? 'AND p.deleted_at IS NULL' : ''}) IS TRUE) AS proof_valid
        FROM roots p JOIN naijue_erp.import_record s ON s.target_type='${kind}' AND s.target_id=p.id
        JOIN naijue_erp.import_batch b ON b.id=s.import_batch_id
        JOIN naijue_erp.operation_receipt r ON r.id=(s.decision_reason::jsonb->>'operationId')::uuid
        JOIN naijue_erp.audit_change a ON a.operation_id=r.id
        CROSS JOIN LATERAL jsonb_array_elements(a.after_values->'records') item
        WHERE item->>'id'=s.id::text ORDER BY p.id,s.id LIMIT $2`;
}
