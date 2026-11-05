import {parseStrictJson,decodeUtf8} from "./unified-import-contract.ts";
import { createHash } from 'node:crypto';

/** Approval is a separately pinned operator input, never a package self-assertion. */
export interface HistoricalStaffHallApproval {
 readonly format_version:'HISTORICAL_STAFF_NULL_HALL_APPROVAL_V1';
 readonly source_namespace:string;
 readonly evidence_sha256:string;
 readonly staff:readonly {readonly source_key:string;readonly target_id:string;readonly source_refs:readonly {readonly file_sha256:string;readonly sheet:string|null;readonly row:number}[]}[];
}
const verified=new WeakSet<object>();
const wires=new WeakMap<object,{utf8:string;sha256:string}>();
const hash=/^[a-f0-9]{64}$/;const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function closed(v:unknown,keys:string[]):v is Record<string,any>{return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.sort().join('|');}
const text=(v:unknown)=>typeof v==='string'&&v.length>0&&v===v.trim()&&!/[\u0000-\u001f\u007f]/.test(v);
function refKey(refs:readonly {file_sha256:string;sheet:string|null;row:number}[]){return JSON.stringify(refs.map(r=>[r.file_sha256,r.sheet,r.row]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));}
export function readHistoricalStaffHallApproval(input:{bytes:Uint8Array;trustedSha256:string;sourceNamespace:string;sourceHashes:ReadonlySet<string>}):HistoricalStaffHallApproval {
 if(input.bytes.byteLength<1||input.bytes.byteLength>1048576)throw new Error('STAFF_HALL_APPROVAL_SIZE');
 if(!hash.test(input.trustedSha256)||createHash('sha256').update(input.bytes).digest('hex')!==input.trustedSha256)throw new Error('STAFF_HALL_APPROVAL_HASH');
 const v:unknown=parseStrictJson(decodeUtf8(input.bytes));
 if(!closed(v,['format_version','source_namespace','evidence_sha256','staff'])||v.format_version!=='HISTORICAL_STAFF_NULL_HALL_APPROVAL_V1'||v.source_namespace!==input.sourceNamespace||!text(v.source_namespace)||!hash.test(v.evidence_sha256)||!input.sourceHashes.has(v.evidence_sha256))throw new Error('STAFF_HALL_APPROVAL_SOURCE');
 if(!Array.isArray(v.staff)||v.staff.length===0||v.staff.length>1000)throw new Error('STAFF_HALL_APPROVAL_RECORDS');
 const keys=new Set<string>(),ids=new Set<string>();
 for(const row of v.staff){
  if(!closed(row,['source_key','target_id','source_refs'])||!text(row.source_key)||!uuid.test(row.target_id)||keys.has(row.source_key)||ids.has(row.target_id)||!Array.isArray(row.source_refs)||row.source_refs.length===0)throw new Error('STAFF_HALL_APPROVAL_RECORD');
  keys.add(row.source_key);ids.add(row.target_id);
  const seen=new Set<string>();for(const ref of row.source_refs){if(!closed(ref,['file_sha256','sheet','row'])||!hash.test(ref.file_sha256)||!input.sourceHashes.has(ref.file_sha256)||(ref.sheet!==null&&!text(ref.sheet))||!Number.isSafeInteger(ref.row)||ref.row<1||ref.row>2147483647)throw new Error('STAFF_HALL_APPROVAL_SOURCE');const key=JSON.stringify([ref.file_sha256,ref.sheet,ref.row]);if(seen.has(key))throw new Error('STAFF_HALL_APPROVAL_DUPLICATE_REF');seen.add(key);Object.freeze(ref);}
  Object.freeze(row.source_refs);Object.freeze(row);
 }
 Object.freeze(v.staff);Object.freeze(v);verified.add(v);wires.set(v,{utf8:Buffer.from(input.bytes).toString("utf8"),sha256:input.trustedSha256});return v as unknown as HistoricalStaffHallApproval;
}
export function historicalStaffNullHallApproved(approval:unknown,namespace:string,targetId:unknown,row:{source_key:string;source_refs:readonly {file_sha256:string;sheet:string|null;row:number}[];fields:Record<string,unknown>}):boolean{
 if(!approval||typeof approval!=='object'||!verified.has(approval))return false;
 const a=approval as HistoricalStaffHallApproval,f=row.fields;
 return a.source_namespace===namespace&&f.role==='SALESPERSON'&&f.employment_status==='离职'&&f.hall_id===null&&a.staff.some(r=>r.source_key===row.source_key&&r.target_id===targetId&&refKey(r.source_refs)===refKey(row.source_refs));
}

export function historicalStaffHallApprovalWire(approval:HistoricalStaffHallApproval):{utf8:string;sha256:string}{
 const wire=wires.get(approval);if(!wire)throw new Error("STAFF_HALL_APPROVAL_UNVERIFIED");return {...wire};
}

export function historicalStaffHallApprovalMatchesSource(approval:unknown,namespace:string,sourceHashes:ReadonlySet<string>):boolean {
 if(!approval||typeof approval!=="object"||!verified.has(approval))return false;
 const a=approval as HistoricalStaffHallApproval;return a.source_namespace===namespace&&sourceHashes.has(a.evidence_sha256)&&a.staff.every(r=>r.source_refs.every(ref=>sourceHashes.has(ref.file_sha256)));
}
