import {createHash} from 'node:crypto';
import {decodeUtf8,parseStrictJson,TABLE_SCHEMAS,validateMoneyString} from './unified-import-contract.ts';
import {canonicalRequestValue} from './canonical-request-value.ts';
import {isRetainedHistoricalSalesDocument} from './unified-import-historical-sales.ts';
type Ref={readonly file_sha256:string;readonly sheet:string|null;readonly row:number};
type Row={readonly source_key:string;readonly source_refs:readonly Ref[];readonly fields:Record<string,unknown>};
export interface HistoricalSettlementRetentionDocument {
 readonly sales_source_key:string;readonly sales_id:string;readonly source_refs:readonly Ref[];
 readonly business_type:'SALE'|'RETURN';readonly status:'APPROVED';
 readonly gross_amount:string;readonly order_discount:string;readonly net_due:string;
 readonly settlements:readonly Row[];
}
export interface HistoricalSettlementRetentionApproval {
 readonly format_version:'HISTORICAL_SETTLEMENT_RETENTION_V1';readonly source_namespace:string;
 /** An already registered real source file used by these facts, never this proof. */
 readonly evidence_sha256:string;readonly documents:readonly HistoricalSettlementRetentionDocument[];
}
const verified=new WeakMap<object,{utf8:string;sha256:string;documents:ReadonlyMap<string,HistoricalSettlementRetentionDocument>}>();
const hash=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const text=(s:unknown):s is string=>typeof s==='string'&&s.length>0&&s.length<=65536&&!/[\u0000-\u001f\u007f]/.test(s);
const closed=(x:unknown,keys:string[]):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).sort().join('|')===keys.sort().join('|');
const cents=(s:string)=>BigInt(s.replace('.',''));
const refsKey=(r:readonly Ref[])=>canonicalRequestValue([...r].sort((a,b)=>canonicalRequestValue(a).localeCompare(canonicalRequestValue(b))));
function validRefs(value:unknown,pins:ReadonlySet<string>):value is readonly Ref[]{
 return Array.isArray(value)&&value.length>0&&value.length<=100&&new Set(value.map(x=>canonicalRequestValue(x))).size===value.length&&value.every(r=>closed(r,['file_sha256','sheet','row'])&&hash(r.file_sha256)&&pins.has(r.file_sha256)&&(r.sheet===null||text(r.sheet))&&Number.isSafeInteger(r.row)&&Number(r.row)>0&&Number(r.row)<=2147483647);
}
function freeze<T>(x:T):T{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x;}
export function readHistoricalSettlementRetentionApproval(input:{bytes:Uint8Array;trustedSha256:string;sourceNamespace:string;sourceHashes:ReadonlySet<string>}):HistoricalSettlementRetentionApproval {
 if(input.bytes.byteLength<1||input.bytes.byteLength>4*1024*1024||!hash(input.trustedSha256)||createHash('sha256').update(input.bytes).digest('hex')!==input.trustedSha256)throw Error('HISTORICAL_SETTLEMENT_APPROVAL_HASH');
 const value=parseStrictJson(decodeUtf8(input.bytes));
 if(!closed(value,['format_version','source_namespace','evidence_sha256','documents'])||value.format_version!=='HISTORICAL_SETTLEMENT_RETENTION_V1'||!text(value.source_namespace)||value.source_namespace!==input.sourceNamespace||!hash(value.evidence_sha256)||!input.sourceHashes.has(value.evidence_sha256)||!Array.isArray(value.documents)||value.documents.length!==25)throw Error('HISTORICAL_SETTLEMENT_APPROVAL_SOURCE');
 const documents=new Map<string,HistoricalSettlementRetentionDocument>(),keys=new Set<string>(),settlementIds=new Set<string>(),settlementKeys=new Set<string>();let usedEvidence=false,count=0;
 for(const d of value.documents){
  if(!closed(d,['sales_source_key','sales_id','source_refs','business_type','status','gross_amount','order_discount','net_due','settlements'])||!text(d.sales_source_key)||!uuid(d.sales_id)||!validRefs(d.source_refs,input.sourceHashes)||!['SALE','RETURN'].includes(String(d.business_type))||d.status!=='APPROVED'||!validateMoneyString(d.gross_amount)||!validateMoneyString(d.order_discount)||!validateMoneyString(d.net_due)||!Array.isArray(d.settlements)||d.settlements.length<1||documents.has(d.sales_id)||keys.has(d.sales_source_key))throw Error('HISTORICAL_SETTLEMENT_APPROVAL_DOCUMENT');
  let total=0n,last=0;usedEvidence ||= d.source_refs.some(r=>r.file_sha256===value.evidence_sha256);
  for(const row of d.settlements){
   if(!closed(row,['source_key','fields','source_refs'])||!text(row.source_key)||!validRefs(row.source_refs,input.sourceHashes)||!closed(row.fields,Object.keys(TABLE_SCHEMAS.sales_settlement!)))throw Error('HISTORICAL_SETTLEMENT_APPROVAL_ROW');
   const f=row.fields;
   if(!uuid(f.id)||f.sales_id!==d.sales_id||!Number.isSafeInteger(f.line_no)||Number(f.line_no)<=last||!['RECEIVE','REFUND'].includes(String(f.direction))||!validateMoneyString(f.amount)||f.amount.startsWith('-')||settlementIds.has(f.id)||settlementKeys.has(row.source_key))throw Error('HISTORICAL_SETTLEMENT_APPROVAL_ROW');
   last=Number(f.line_no);total+=(f.direction==='REFUND'?-1n:1n)*cents(f.amount);settlementIds.add(f.id);settlementKeys.add(row.source_key);count++;usedEvidence ||= row.source_refs.some(r=>r.file_sha256===value.evidence_sha256);
  }
  if(total===cents(d.net_due))throw Error('HISTORICAL_SETTLEMENT_DIFFERENCE_REQUIRED');
  keys.add(d.sales_source_key);documents.set(d.sales_id,d as unknown as HistoricalSettlementRetentionDocument);
 }
 if(count!==27||!usedEvidence)throw Error('HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED');
 freeze(value);verified.set(value,{utf8:decodeUtf8(input.bytes),sha256:input.trustedSha256,documents});return value as unknown as HistoricalSettlementRetentionApproval;
}
export function historicalSettlementRetentionMatchesSource(approval:HistoricalSettlementRetentionApproval,namespace:string,pins:ReadonlySet<string>):boolean {
 return verified.has(approval)&&approval.source_namespace===namespace&&pins.has(approval.evidence_sha256)&&approval.documents.every(d=>[...d.source_refs,...d.settlements.flatMap(s=>s.source_refs)].every(r=>pins.has(r.file_sha256)));
}
export function historicalSettlementRetentionWire(approval:HistoricalSettlementRetentionApproval):{utf8:string;sha256:string}{const proof=verified.get(approval);if(!proof)throw Error('HISTORICAL_SETTLEMENT_APPROVAL_UNVERIFIED');return {utf8:proof.utf8,sha256:proof.sha256};}
export function historicalSettlementRetentionMatches(approval:HistoricalSettlementRetentionApproval|undefined,input:{namespace:string;header:Row;headerId:unknown;settlements:readonly Row[];explicitCleanedSourceProfile?:boolean}):boolean {
 const proof=approval&&verified.get(approval),d=proof?.documents.get(String(input.headerId)),h=input.header;
 if(!proof||!approval||approval.source_namespace!==input.namespace||!d||!isRetainedHistoricalSalesDocument(h,input.explicitCleanedSourceProfile)||h.source_key!==d.sales_source_key||refsKey(h.source_refs)!==refsKey(d.source_refs))return false;
 for(const key of ['business_type','status','gross_amount','order_discount','net_due'] as const)if(h.fields[key]!==d[key])return false;
 const actual=[...input.settlements].sort((a,b)=>Number(a.fields.line_no)-Number(b.fields.line_no));
 return actual.length===d.settlements.length&&actual.every((r,i)=>{const s=d.settlements[i]!;return r.source_key===s.source_key&&canonicalRequestValue(r.fields)===canonicalRequestValue(s.fields)&&refsKey(r.source_refs)===refsKey(s.source_refs)});
}
