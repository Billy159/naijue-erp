import {createHash} from 'node:crypto';
import {requestHash} from './request-hash.ts';
import {decodeUtf8,parseStrictJson} from './unified-import-contract.ts';

import {parseHistoricalSalesHallEvidence,parseHistoricalHallSourceCapture} from './historical-sales-hall-evidence.ts';
import type {HistoricalSalesHallEvidence,HistoricalHallSourceCapture,HistoricalSalesHallEvidenceV2} from './historical-sales-hall-evidence.ts';
export {parseHistoricalSalesHallEvidence,buildHistoricalSalesHallEvidence,buildHistoricalSalesHallEvidenceV2,parseHistoricalHallSourceCapture} from './historical-sales-hall-evidence.ts';
export type {HistoricalSalesHallEvidence} from './historical-sales-hall-evidence.ts';
type Ref={readonly file_sha256:string;readonly sheet:string|null;readonly row:number};
export interface HistoricalSalesHallApproval {
 readonly format_version:'HISTORICAL_SALES_HALL_APPROVAL_V1'|'HISTORICAL_SALES_HALL_APPROVAL_V2';readonly source_namespace:string;readonly evidence_sha256:string;
 readonly source_captures?:readonly HistoricalHallSourceCapture[];readonly identity_bridges?:readonly HistoricalHallIdentityBridge[];readonly resolutions?:readonly HistoricalHallResolution[];
 readonly records:readonly {readonly source_key:string;readonly target_id:string;readonly source_refs:readonly Ref[];readonly evidence:HistoricalSalesHallEvidence}[];
}
const verified=new WeakMap<object,{readonly utf8:string;readonly sha256:string;readonly records:ReadonlyMap<string,HistoricalSalesHallApproval['records'][number]>}>();
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=65536&&!/[\u0000-\u001f\u007f]/.test(v);
const closed=(v:unknown,fields:readonly string[]):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===fields.length&&fields.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value');});
const fail=(ok:unknown,code:string):void=>{if(!ok)throw Error(code);};
const refKey=(refs:readonly Ref[])=>JSON.stringify(refs.map(r=>[r.file_sha256,r.sheet,r.row]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
const same=(a:HistoricalSalesHallEvidence,b:HistoricalSalesHallEvidence)=>requestHash(a)===requestHash(b);
function validRefs(value:unknown,sourceHashes:ReadonlySet<string>):value is Ref[]{
 if(!Array.isArray(value)||value.length===0||value.length>100)return false;const seen=new Set<string>();
 return value.every(r=>{if(!closed(r,['file_sha256','sheet','row'])||!hash(r.file_sha256)||!sourceHashes.has(r.file_sha256)||(r.sheet!==null&&!text(r.sheet))||!Number.isSafeInteger(r.row)||r.row<1||r.row>2147483647)return false;const key=JSON.stringify([r.file_sha256,r.sheet,r.row]);if(seen.has(key))return false;seen.add(key);return true;});
}
/** Trusted digest must be supplied outside the package by the source review.
 * Matching hashes bind bytes; they do not create or fabricate a warehouse observation. */
export function readHistoricalSalesHallApproval(input:{bytes:Uint8Array;trustedSha256:string;sourceNamespace:string;sourceHashes:ReadonlySet<string>}):HistoricalSalesHallApproval {
 fail(input.bytes.byteLength>0&&input.bytes.byteLength<=64*1024*1024,'HISTORICAL_HALL_APPROVAL_SIZE');
 fail(hash(input.trustedSha256)&&createHash('sha256').update(input.bytes).digest('hex')===input.trustedSha256,'HISTORICAL_HALL_APPROVAL_HASH');
 const v=parseStrictJson(decodeUtf8(input.bytes));const v2=(v as any)?.format_version==='HISTORICAL_SALES_HALL_APPROVAL_V2';fail(closed(v,['format_version','source_namespace','evidence_sha256','records',...(v2?['source_captures','identity_bridges','resolutions']:[])]),'HISTORICAL_HALL_APPROVAL_SHAPE');
 const o=v as Record<string,any>;fail((o.format_version==='HISTORICAL_SALES_HALL_APPROVAL_V1'||v2)&&text(o.source_namespace)&&o.source_namespace===input.sourceNamespace&&hash(o.evidence_sha256)&&input.sourceHashes.has(o.evidence_sha256),'HISTORICAL_HALL_APPROVAL_SOURCE');
 fail(Array.isArray(o.records)&&o.records.length>0&&o.records.length<=250000,'HISTORICAL_HALL_APPROVAL_RECORDS');
 const members=v2?readV2Members(o,input.sourceHashes,input.sourceNamespace):undefined;
 const records=new Map<string,HistoricalSalesHallApproval['records'][number]>(),sourceKeys=new Set<string>();
 for(const row of o.records){fail(closed(row,['source_key','target_id','source_refs','evidence'])&&text(row.source_key)&&uuid(row.target_id)&&!records.has(row.target_id)&&!sourceKeys.has(row.source_key)&&validRefs(row.source_refs,input.sourceHashes),'HISTORICAL_HALL_APPROVAL_RECORD');
  const evidence=parseHistoricalSalesHallEvidence(row.evidence);fail((evidence.format_version==='HISTORICAL_SALES_HALL_EVIDENCE_V2')===v2,'HISTORICAL_HALL_APPROVAL_VERSION');if(members)members.check(evidence as HistoricalSalesHallEvidenceV2);for(const r of row.source_refs)Object.freeze(r);Object.freeze(row.source_refs);row.evidence=evidence;Object.freeze(row);records.set(row.target_id,row);sourceKeys.add(row.source_key);
 }
 if(members)members.finish();
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
 if(context.warehouse){const snapshot=evidence.format_version==='HISTORICAL_SALES_HALL_EVIDENCE_V2'?evidence.target_snapshot:{warehouse_id:evidence.warehouse_id,hall_id:evidence.warehouse_hall_id_at_capture,version:evidence.warehouse_version};if(snapshot.version!==null)fail(context.warehouse.id===snapshot.warehouse_id&&context.warehouse.hall_id===snapshot.hall_id&&context.warehouse.version===snapshot.version,'HISTORICAL_HALL_CAPTURE_STALE');}
 return evidence;
}
export function historicalSalesHallApprovalWire(approval:HistoricalSalesHallApproval):{utf8:string;sha256:string}{const p=verified.get(approval);if(!p)throw Error('HISTORICAL_HALL_APPROVAL_UNVERIFIED');return {utf8:p.utf8,sha256:p.sha256};}

export interface HistoricalHallIdentityBridge {
 readonly evidence_sha256:string;readonly record_key:string;readonly entity_type:'WAREHOUSE';readonly source_namespace:string;readonly warehouse_source_key:string;readonly runtime_warehouse_id:string;
 readonly target_namespace:string;readonly target_warehouse_id:string;readonly source_capture_sha256:string;readonly hall_links:readonly {readonly runtime_hall_id:string;readonly target_hall_id:string}[];
 readonly source_refs:readonly Ref[];readonly scope:'FIXED_CAPTURE_SCOPE_ONLY';
}
export interface HistoricalHallResolution {
 readonly evidence_sha256:string;readonly record_key:string;readonly source_namespace:string;readonly warehouse_source_key:string;readonly runtime_warehouse_id:string;
 readonly target_namespace:string;readonly target_warehouse_id:string;readonly source_capture_sha256:string;readonly selected_target_hall_id:string;readonly runtime_hall_ids:readonly string[];
 readonly source_refs:readonly Ref[];readonly scope:'FIXED_CAPTURE_SCOPE_ONLY';
}
const deepFreeze=<T>(v:T):T=>{if(v&&typeof v==='object'){Object.values(v).forEach(deepFreeze);Object.freeze(v)}return v};
const memberKey=(r:Record<string,any>)=>JSON.stringify([r.evidence_sha256,r.record_key]);
const hallSet=(ids:readonly string[])=>JSON.stringify([...ids].sort());
function readV2Members(o:Record<string,any>,sourceHashes:ReadonlySet<string>,namespace:string){
 const captures=new Map<string,HistoricalHallSourceCapture>(),bridges=new Map<string,HistoricalHallIdentityBridge>(),resolutions=new Map<string,HistoricalHallResolution>();
 const usedCapture=new Set<string>(),usedBridge=new Set<string>(),usedResolution=new Set<string>();
 for(const name of ['source_captures','identity_bridges','resolutions'])fail(Array.isArray(o[name])&&o[name].length<=250000,'HISTORICAL_HALL_MEMBERS_REQUIRED');
 for(const raw of o.source_captures){const c=parseHistoricalHallSourceCapture(raw),key=requestHash(c);fail(sourceHashes.has(c.capture_evidence_sha256)&&!captures.has(key),'HISTORICAL_HALL_CAPTURE_MEMBER_INVALID');captures.set(key,c);}
 const common=(r:Record<string,any>)=>hash(r.evidence_sha256)&&sourceHashes.has(r.evidence_sha256)&&text(r.record_key)&&text(r.source_namespace)&&text(r.warehouse_source_key)&&uuid(r.runtime_warehouse_id)&&r.target_namespace===namespace&&uuid(r.target_warehouse_id)&&hash(r.source_capture_sha256)&&sourceHashes.has(r.source_capture_sha256)&&r.scope==='FIXED_CAPTURE_SCOPE_ONLY'&&validRefs(r.source_refs,sourceHashes);
 for(const r of o.identity_bridges){
  fail(closed(r,['evidence_sha256','record_key','entity_type','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','hall_links','source_refs','scope'])&&common(r)&&r.entity_type==='WAREHOUSE'&&Array.isArray(r.hall_links)&&r.hall_links.length>=1&&r.hall_links.length<=100&&r.hall_links.every((h:unknown)=>closed(h,['runtime_hall_id','target_hall_id'])&&uuid(h.runtime_hall_id)&&uuid(h.target_hall_id))&&new Set(r.hall_links.map((h:any)=>h.runtime_hall_id)).size===r.hall_links.length&&!bridges.has(memberKey(r)),'HISTORICAL_HALL_BRIDGE_MEMBER_INVALID');bridges.set(memberKey(r),deepFreeze(r));
 }
 for(const r of o.resolutions){
  fail(closed(r,['evidence_sha256','record_key','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','selected_target_hall_id','runtime_hall_ids','source_refs','scope'])&&common(r)&&uuid(r.selected_target_hall_id)&&Array.isArray(r.runtime_hall_ids)&&r.runtime_hall_ids.length>1&&r.runtime_hall_ids.length<=100&&r.runtime_hall_ids.every(uuid)&&new Set(r.runtime_hall_ids).size===r.runtime_hall_ids.length&&!resolutions.has(memberKey(r)),'HISTORICAL_HALL_RESOLUTION_MEMBER_INVALID');resolutions.set(memberKey(r),deepFreeze(r));
 }
 deepFreeze(o.source_captures);deepFreeze(o.identity_bridges);deepFreeze(o.resolutions);
 return {check(e:HistoricalSalesHallEvidenceV2){
  const c=e.source_capture,ck=requestHash(c),bk=memberKey(e.identity_bridge),b=bridges.get(bk);
  fail(captures.has(ck),'HISTORICAL_HALL_CAPTURE_MEMBER_REQUIRED');
  fail(b&&b.source_namespace===c.source_namespace&&b.warehouse_source_key===c.warehouse_source_key&&b.runtime_warehouse_id===c.runtime_warehouse_id&&b.target_warehouse_id===e.warehouse_id&&b.source_capture_sha256===c.capture_evidence_sha256&&hallSet(b.hall_links.map(h=>h.runtime_hall_id))===hallSet(c.runtime_hall_ids),'HISTORICAL_HALL_BRIDGE_REQUIRED');
  usedCapture.add(ck);usedBridge.add(bk);
  if(c.runtime_hall_ids.length===1)fail(b!.hall_links[0]!.target_hall_id===e.selected_hall_id&&!e.review_required&&!e.has_difference,'HISTORICAL_HALL_BRIDGE_HALL_DIFFERS');
  else if(e.resolution){const rk=memberKey(e.resolution),r=resolutions.get(rk);fail(r&&r.source_namespace===c.source_namespace&&r.warehouse_source_key===c.warehouse_source_key&&r.runtime_warehouse_id===c.runtime_warehouse_id&&r.target_warehouse_id===e.warehouse_id&&r.source_capture_sha256===c.capture_evidence_sha256&&r.selected_target_hall_id===e.selected_hall_id&&hallSet(r.runtime_hall_ids)===hallSet(c.runtime_hall_ids)&&b!.hall_links.some(h=>h.target_hall_id===e.selected_hall_id)&&e.has_difference&&!e.review_required,'HISTORICAL_HALL_RESOLUTION_REQUIRED');usedResolution.add(rk);}
  else fail(e.review_required&&e.has_difference,'HISTORICAL_HALL_RESOLUTION_REQUIRED');
 },finish(){fail(usedCapture.size===captures.size&&usedBridge.size===bridges.size&&usedResolution.size===resolutions.size,'HISTORICAL_HALL_UNUSED_MEMBER');}};
}
