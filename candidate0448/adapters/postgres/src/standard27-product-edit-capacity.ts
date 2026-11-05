import { isDeepStrictEqual } from 'node:util';
import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { entityId } from '../../../packages/domain/src/values.ts';
import { CATALOGUE_PRICE_KEYS,validateCompleteCataloguePrices } from '../../../packages/application/src/catalogue-price-input.ts';
import { requestHash } from '../../../packages/application/src/request-hash.ts';
import type { MaintenanceCompletion } from '../../../packages/application/src/maintenance-commit-ports.ts';
import { assertProductEvidencePendingCapacity } from './catalogue-completeness.ts';
import { safeStandard27CapacitySnapshot } from './standard27-product-create-capacity.ts';
import { standardRootProofSql } from './standard-catalogue-completeness27.ts';
/** Restricted source consumer ONLY. An independent host must verify original
 * transaction lifetime, published RLS visibility, exact catalog and all writer
 * serialization. No issuer or app integration exists. This covers only a first
 * root-only edit of a version-1 unchanged imported product with no SKU/image or
 * prior product audit/receipt; all populated or maintained products fail closed. */
export interface Standard27ImportedEmptyEditCapability {readonly profile:'STANDARD27_IMPORTED_EMPTY_EDIT_CAPACITY_V1';readonly assertReady:(client:object)=>Promise<void>}
type Client={query:(sql:string,values?:unknown[])=>Promise<{rows:readonly Record<string,unknown>[]}>};
const fail=(v:unknown,m:string):void=>requireDomain(v,'PRODUCT_EVIDENCE_CAPACITY_NOT_READY',m);
export function createStandard27ImportedEmptyEditCapacity(client:Client,capability:Standard27ImportedEmptyEditCapability,assertActive:()=>void){
 if(!client||typeof client.query!=='function'||!capability||Object.getPrototypeOf(capability)!==Object.prototype||Reflect.ownKeys(capability).sort().join(',')!=='assertReady,profile'||typeof assertActive!=='function')throw TypeError('Exact original client, host capability and guard required');
 const profile=Object.getOwnPropertyDescriptor(capability,'profile'),verify=Object.getOwnPropertyDescriptor(capability,'assertReady');if(!profile?.enumerable||!('value'in profile)||profile.value!=='STANDARD27_IMPORTED_EMPTY_EDIT_CAPACITY_V1'||!verify?.enumerable||!('value'in verify)||typeof verify.value!=='function')throw TypeError('Exact EDIT host capability required');
 const active=()=>{const r:unknown=assertActive();if(r!==undefined)throw TypeError('Active guard cannot return an authority substitute')};const ready=async()=>{active();const r:unknown=await verify.value(client);if(r!==undefined)throw TypeError('Host proof must throw or return undefined');active()};
 let admitted:{operationId:string;fingerprint:string}|undefined,busy=false,failed=false;
 return Object.freeze({async assertPendingCapacity(input:MaintenanceCompletion){active();fail(!busy&&!failed,'Capacity scope busy or poisoned');busy=true;try{
  const p=safeStandard27CapacitySnapshot(input) as MaintenanceCompletion;entityId('product',p.targetId);
  fail(p.kind==='PRODUCT'&&p.action==='EDIT'&&p.oldVersion===1&&p.newVersion===2&&p.beforeValues!==null&&typeof p.beforeValues==='object'&&!Array.isArray(p.beforeValues)&&p.afterValues!==null&&typeof p.afterValues==='object'&&!Array.isArray(p.afterValues),'Only unchanged imported first EDIT is supported');
  const before=p.beforeValues!,after=p.afterValues;fail(before.version===1&&after.version===2&&isDeepStrictEqual(Object.keys(before).sort(),Object.keys(after).sort())&&!['skus','barcodes','images'].some(k=>Object.hasOwn(before,k)||Object.hasOwn(after,k))&&(!Object.hasOwn(after,'id')||(before.id===p.targetId&&after.id===p.targetId)),'Root-only matching audit delta required');
  fail(typeof p.operationId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.operationId)&&typeof p.actorAccountId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.actorAccountId)&&typeof p.requestKey==='string'&&p.requestKey.trim().length>0&&typeof p.requestHash==='string'&&/^[a-f0-9]{64}$/.test(p.requestHash)&&typeof p.completedAt==='string'&&Number.isFinite(Date.parse(p.completedAt)),'Complete pending operation identity required');
  const fingerprint=requestHash(p);if(admitted){fail(admitted.operationId===p.operationId&&admitted.fingerprint===fingerprint,'Only original admitted EDIT may replay');await ready();return;}assertProductEvidencePendingCapacity({count:0,bytes:0},before,after);
  await ready();await client.query('/* std27-product-edit:lock */ SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::pg_catalog.text,0))',[`naijue:product:${p.targetId}`]);await ready();
  const roots=(await client.query(standardRootProofSql('PRODUCT'),[[p.targetId],2,[...CATALOGUE_PRICE_KEYS]])).rows;await ready();fail(roots.length===1&&roots[0]!.product_id===p.targetId&&roots[0]!.proof_valid===true,'Unchanged original imported root required');
  const source=validateCompleteCataloguePrices(roots[0]!.source_prices),actual=validateCompleteCataloguePrices(Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k=>[k,roots[0]![k]])));fail(CATALOGUE_PRICE_KEYS.every(k=>source[k]===actual[k]),'Original price evidence mismatch');
  const pricePairs=CATALOGUE_PRICE_KEYS.map(k=>`'${k}',p.${k}::text`).join(',');
  const rows=(await client.query(`/* std27-product-edit-empty-snapshot */ SELECT naijue_erp.standard_business_ready() AS published,pg_catalog.current_setting('transaction_isolation') AS isolation,pg_catalog.current_setting('transaction_read_only') AS read_only,
   EXISTS(SELECT 1 FROM naijue_erp.sku s WHERE s.product_id=$1::uuid) AS sku_exists,
   EXISTS(SELECT 1 FROM naijue_erp.product_image i WHERE i.product_id=$1::uuid) AS image_exists,
   EXISTS(SELECT 1 FROM naijue_erp.audit_change a WHERE a.object_type='PRODUCT' AND a.object_id=$1::uuid) AS audit_exists,
   EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.target_type='PRODUCT' AND r.target_id=$1::uuid) AS receipt_exists,
   COALESCE((SELECT NOT EXISTS(SELECT 1 FROM jsonb_each($2::jsonb) e(key,value) WHERE NOT (v.root ? e.key) OR (v.root->e.key) IS DISTINCT FROM e.value) FROM (SELECT to_jsonb(p)||jsonb_build_object(${pricePairs}) AS root FROM naijue_erp.product p WHERE p.id=$1::uuid AND p.version=1) v),false) AS before_matches`,[p.targetId,JSON.stringify(before)])).rows;await ready();
  fail(rows.length===1&&rows[0]!.published===true&&rows[0]!.isolation==='read committed'&&rows[0]!.read_only==='off'&&rows[0]!.before_matches===true&&['sku_exists','image_exists','audit_exists','receipt_exists'].every(k=>rows[0]![k]===false),'Empty unmodified root and exact before image required');
  admitted={operationId:p.operationId,fingerprint};
 }catch(error){failed=true;throw error;}finally{busy=false;}}});
}
