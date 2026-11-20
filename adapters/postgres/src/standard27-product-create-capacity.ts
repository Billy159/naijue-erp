import { types as utilTypes } from 'node:util';
import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { entityId } from '../../../packages/domain/src/values.ts';
import { requestHash } from '../../../packages/application/src/request-hash.ts';
import type { MaintenanceCompletion } from '../../../packages/application/src/maintenance-commit-ports.ts';
import { assertProductEvidencePendingCapacity } from './catalogue-completeness.ts';

/** Consumer-only CREATE slice. No issuer is implemented here and this module is
 * not wired to the application. The trusted host MUST independently verify on
 * the original client exact target, roles, RLS, schema, publication helpers,
 * operation triggers and all authorized writer/serialization invariants, and
 * bind the original transaction lifetime (not merely a reusable pooled client).
 * The lock is cooperative; the snapshot cannot prevent later phantom inserts. A
 * callback or successful unit test is not such a proof. EDIT and imported
 * historical roots deliberately remain unavailable. */
export interface Standard27ProductCreateCapacityCapability {
 readonly profile:'STANDARD27_PRODUCT_CREATE_CAPACITY_V1';
 readonly assertReady:(client:object)=>Promise<void>;
}
type Client={query:(sql:string,values?:unknown[])=>Promise<{rows:readonly Record<string,unknown>[]}>};
const fail=(x:unknown,m:string):void=>requireDomain(x,'PRODUCT_EVIDENCE_CAPACITY_NOT_READY',m);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function safeStandard27CapacitySnapshot(value:unknown):unknown {
 let nodes=0,rawBytes=0; const add=(s:string)=>{rawBytes+=Buffer.byteLength(s);if(rawBytes>16*1024*1024)throw TypeError('Bounded evidence required');}; const visit=(v:unknown,depth:number):unknown=>{
  if(++nodes>50000||depth>32)throw TypeError('Bounded data evidence required');
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='string'){add(v);return v;}
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(typeof v!=='object'||utilTypes.isProxy(v))throw TypeError('Data evidence required');
  const array=Array.isArray(v);if(!array&&Object.getPrototypeOf(v)!==Object.prototype)throw TypeError('Plain evidence required');
  const keys=Reflect.ownKeys(v);if(keys.some(k=>typeof k!=='string'))throw TypeError('String fields required');
  if(array){const a=v as unknown[];if(keys.length!==a.length+1||keys.at(-1)!=='length')throw TypeError('Dense array required');return Array.from({length:a.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(a,String(i));if(!d||!d.enumerable||!('value'in d))throw TypeError('Own data required');return visit(d.value,depth+1)});}
  const out:Record<string,unknown>={};for(const k of keys as string[]){add(k);if(['__proto__','prototype','constructor'].includes(k))throw TypeError('Safe field required');const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!d.enumerable||!('value'in d))throw TypeError('Own data required');out[k]=visit(d.value,depth+1)}return out;
 };const result=visit(value,0);if(Buffer.byteLength(JSON.stringify(result))>16*1024*1024)throw TypeError('Bounded evidence required');return result;
}
export function createStandard27ProductCreateCapacity(client:Client,capability:Standard27ProductCreateCapacityCapability,assertActive:()=>void){
 if(!client||typeof client.query!=='function'||!capability||Object.getPrototypeOf(capability)!==Object.prototype||Reflect.ownKeys(capability).sort().join(',')!=='assertReady,profile'||typeof assertActive!=='function')throw TypeError('Exact original client, host capability and guard required');
 const profile=Object.getOwnPropertyDescriptor(capability,'profile'),verify=Object.getOwnPropertyDescriptor(capability,'assertReady');
 if(!profile?.enumerable||!('value'in profile)||profile.value!=='STANDARD27_PRODUCT_CREATE_CAPACITY_V1'||!verify?.enumerable||!('value'in verify)||typeof verify.value!=='function')throw TypeError('Exact CREATE host capability required');
 const active=()=>{const r:unknown=assertActive();if(r!==undefined)throw TypeError('Active guard cannot return an authority substitute')};
 const ready=async()=>{active();const r:unknown=await verify.value(client);if(r!==undefined)throw TypeError('Host proof must throw or return undefined');active()};
 let admitted:{operationId:string;fingerprint:string}|undefined;let busy=false,failed=false;
 return Object.freeze({async assertPendingCapacity(input:MaintenanceCompletion){
  active();fail(!busy&&!failed,'Capacity scope busy or poisoned');busy=true;try {const p=safeStandard27CapacitySnapshot(input) as MaintenanceCompletion;entityId('product',p.targetId);
  fail(p.kind==='PRODUCT'&&p.action==='CREATE'&&p.oldVersion===null&&p.newVersion===1&&p.beforeValues===null&&p.afterValues!==null&&typeof p.afterValues==='object'&&!Array.isArray(p.afterValues)&&p.afterValues.id===p.targetId&&p.afterValues.version===1,'Exact first CREATE evidence required');
  fail(typeof p.operationId==='string'&&UUID.test(p.operationId)&&typeof p.actorAccountId==='string'&&UUID.test(p.actorAccountId)&&typeof p.requestKey==='string'&&p.requestKey.trim().length>0&&typeof p.requestHash==='string'&&/^[a-f0-9]{64}$/.test(p.requestHash)&&typeof p.completedAt==='string'&&Number.isFinite(Date.parse(p.completedAt)),'Complete pending operation identity required');
  const fingerprint=requestHash(p);if(admitted){fail(admitted.operationId===p.operationId&&admitted.fingerprint===fingerprint,'Only the original admitted CREATE may replay');await ready();return;}
  assertProductEvidencePendingCapacity({count:0,bytes:0},p.beforeValues,p.afterValues);
  await ready();await client.query('/* std27-product-create:lock */ SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::pg_catalog.text,0))',[`naijue:product:${p.targetId}`]);await ready();
  const rows=(await client.query(`/* std27-product-create-snapshot */ SELECT naijue_erp.standard_business_ready() AS published,pg_catalog.current_setting('transaction_isolation') AS isolation,pg_catalog.current_setting('transaction_read_only') AS read_only,
    EXISTS(SELECT 1 FROM naijue_erp.product p WHERE p.id=$1::uuid) AS product_exists,
    EXISTS(SELECT 1 FROM naijue_erp.import_record i WHERE i.target_type='PRODUCT' AND i.target_id=$1::uuid) AS source_exists,
    EXISTS(SELECT 1 FROM naijue_erp.audit_change a WHERE a.object_type='PRODUCT' AND a.object_id=$1::uuid) AS audit_exists,
    EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.target_type='PRODUCT' AND r.target_id=$1::uuid) AS receipt_exists`,[p.targetId])).rows;
  await ready();fail(Array.isArray(rows)&&rows.length===1,'One exact CREATE snapshot required');const row=rows[0]!;
  fail(row.published===true&&row.isolation==='read committed'&&row.read_only==='off'&&['product_exists','source_exists','audit_exists','receipt_exists'].every(k=>row[k]===false),'Published empty original identity required');
  admitted={operationId:p.operationId,fingerprint};
  }catch(error){failed=true;throw error;}finally{busy=false;}
 }});
}
