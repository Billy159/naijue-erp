import {createHash} from 'node:crypto';
import {decodeUtf8,parseStrictJson} from './unified-import-contract.ts';

import {parseHistoricalSalesHallEvidence} from './historical-sales-hall-evidence.ts';
import type {HistoricalSalesHallEvidence} from './historical-sales-hall-evidence.ts';
export {parseHistoricalSalesHallEvidence,buildHistoricalSalesHallEvidence} from './historical-sales-hall-evidence.ts';
export type {HistoricalSalesHallEvidence} from './historical-sales-hall-evidence.ts';
type Ref={readonly file_sha256:string;readonly sheet:string|null;readonly row:number};
export interface HistoricalSalesHallApproval {
 readonly format_version:'HISTORICAL_SALES_HALL_APPROVAL_V1';readonly source_namespace:string;readonly evidence_sha256:string;
 readonly records:readonly {readonly source_key:string;readonly target_id:string;readonly source_refs:readonly Ref[];readonly evidence:HistoricalSalesHallEvidence}[];
}
const verified=new WeakMap<object,{readonly utf8:string;readonly sha256:string;readonly records:ReadonlyMap<string,HistoricalSalesHallApproval['records'][number]>}>();
const keys=['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','warehouse_hall_id_at_capture','warehouse_version','captured_at','has_difference','review_required'];
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=65536&&!/[\u0000-\u001f\u007f]/.test(v);
const closed=(v:unknown,fields:readonly string[]):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===fields.length&&fields.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value');});
const fail=(ok:unknown,code:string):void=>{if(!ok)throw Error(code);};
const refKey=(refs:readonly Ref[])=>JSON.stringify(refs.map(r=>[r.file_sha256,r.sheet,r.row]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
const same=(a:HistoricalSalesHallEvidence,b:HistoricalSalesHallEvidence)=>keys.every(k=>a[k as keyof HistoricalSalesHallEvidence]===b[k as keyof HistoricalSalesHallEvidence]);
function validRefs(value:unknown,sourceHashes:ReadonlySet<string>):value is Ref[]{
 if(!Array.isArray(value)||value.length===0||value.length>100)return false;const seen=new Set<string>();
 return value.every(r=>{if(!closed(r,['file_sha256','sheet','row'])||!hash(r.file_sha256)||!sourceHashes.has(r.file_sha256)||(r.sheet!==null&&!text(r.sheet))||!Number.isSafeInteger(r.row)||r.row<1||r.row>2147483647)return false;const key=JSON.stringify([r.file_sha256,r.sheet,r.row]);if(seen.has(key))return false;seen.add(key);return true;});
}
/** Trusted digest must be supplied outside the package by the source review.
 * Matching hashes bind bytes; they do not create or fabricate a warehouse observation. */
export function readHistoricalSalesHallApproval(input:{bytes:Uint8Array;trustedSha256:string;sourceNamespace:string;sourceHashes:ReadonlySet<string>}):HistoricalSalesHallApproval {
 fail(input.bytes.byteLength>0&&input.bytes.byteLength<=64*1024*1024,'HISTORICAL_HALL_APPROVAL_SIZE');
 fail(hash(input.trustedSha256)&&createHash('sha256').update(input.bytes).digest('hex')===input.trustedSha256,'HISTORICAL_HALL_APPROVAL_HASH');
 const v=parseStrictJson(decodeUtf8(input.bytes));fail(closed(v,['format_version','source_namespace','evidence_sha256','records']),'HISTORICAL_HALL_APPROVAL_SHAPE');
 const o=v as Record<string,any>;fail(o.format_version==='HISTORICAL_SALES_HALL_APPROVAL_V1'&&text(o.source_namespace)&&o.source_namespace===input.sourceNamespace&&hash(o.evidence_sha256)&&input.sourceHashes.has(o.evidence_sha256),'HISTORICAL_HALL_APPROVAL_SOURCE');
 fail(Array.isArray(o.records)&&o.records.length>0&&o.records.length<=250000,'HISTORICAL_HALL_APPROVAL_RECORDS');
 const records=new Map<string,HistoricalSalesHallApproval['records'][number]>(),sourceKeys=new Set<string>();
 for(const row of o.records){fail(closed(row,['source_key','target_id','source_refs','evidence'])&&text(row.source_key)&&uuid(row.target_id)&&!records.has(row.target_id)&&!sourceKeys.has(row.source_key)&&validRefs(row.source_refs,input.sourceHashes),'HISTORICAL_HALL_APPROVAL_RECORD');
  const evidence=parseHistoricalSalesHallEvidence(row.evidence);for(const r of row.source_refs)Object.freeze(r);Object.freeze(row.source_refs);row.evidence=evidence;Object.freeze(row);records.set(row.target_id,row);sourceKeys.add(row.source_key);
 }
 Object.freeze(o.records);Object.freeze(o);verified.set(o,{utf8:decodeUtf8(input.bytes),sha256:input.trustedSha256,records});return o as HistoricalSalesHallApproval;
}
export function historicalSalesHallApprovalMatchesSource(approval:unknown,namespace:string,sourceHashes:ReadonlySet<string>):boolean {
 if(!approval||typeof approval!=='object'||!verified.has(approval))return false;const a=approval as HistoricalSalesHallApproval;
 return a.source_namespace===namespace&&sourceHashes.has(a.evidence_sha256)&&a.records.every(r=>r.source_refs.every(ref=>sourceHashes.has(ref.file_sha256)));
}
export function validateHistoricalSalesHallEvidence(value:unknown,context:{sourceNamespace:string;sourceKey:string;targetId:unknown;sourceRefs:readonly Ref[];fields:Record<string,unknown>;approval:HistoricalSalesHallApproval|undefined;warehouse?:Record<string,unknown>}):HistoricalSalesHallEvidence {
 const evidence=parseHistoricalSalesHallEvidence(value),a=context.approval,proof=a&&verified.get(a),expected=proof&&typeof context.targetId==='string'?proof.records.get(context.targetId):undefined;
 fail(a&&proof&&a.source_namespace===context.sourceNamespace&&expected&&expected.source_key===context.sourceKey&&refKey(expected.source_refs)===refKey(context.sourceRefs)&&same(expected.evidence,evidence),'HISTORICAL_HALL_APPROVAL_REQUIRED');
 fail(context.fields.stock_basis==='CUTOFF_HISTORY'&&context.fields.warehouse_id===evidence.warehouse_id&&context.fields.hall_id===evidence.selected_hall_id,'HISTORICAL_HALL_FIELDS_DIFFER');
 if(context.warehouse&&evidence.warehouse_version!==null)fail(context.warehouse.id===evidence.warehouse_id&&context.warehouse.hall_id===evidence.warehouse_hall_id_at_capture&&context.warehouse.version===evidence.warehouse_version,'HISTORICAL_HALL_CAPTURE_STALE');
 return evidence;
}
export function historicalSalesHallApprovalWire(approval:HistoricalSalesHallApproval):{utf8:string;sha256:string}{const p=verified.get(approval);if(!p)throw Error('HISTORICAL_HALL_APPROVAL_UNVERIFIED');return {utf8:p.utf8,sha256:p.sha256};}
