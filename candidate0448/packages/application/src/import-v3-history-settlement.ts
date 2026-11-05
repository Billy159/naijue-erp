import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { IMPORT_V2_TABLES } from "./import-v2-contract.ts";
import { v2Cents,v2ApprovedCents,v2MoneyApprovalSet } from "./import-v2.ts";
import type { MoneyApproval } from "./import-v2.ts";
import { stableImportId } from "./inventory-cutoff-import.ts";
import { HISTORY_MAPPING_VERSION } from "./history-storage-contract.ts";
import type { ImportSourceEvidence,JsonObject } from "./history-storage-contract.ts";
import type { HistorySalesHeaderBinding } from "./import-v3-history-sales-detail.ts";
import { NATIVE_PAYMENT_COLUMNS } from "./native-payment-import.ts";
import { requestHash } from "./request-hash.ts";
export const HISTORY_SETTLEMENT_VERSION="V3_HISTORY_SETTLEMENT_STAGE_1";
export interface HistoryPaymentBinding {entity:"PAYMENT_METHOD"|"PAYMENT_ACCOUNT";sourceKey:string;nativeId:string;sourceRowId:string;sourceFileSha256:string;rowSha256:string;fingerprint:string;nativeSnapshot:JsonObject}
export interface HistorySettlementSelection {entity:"SETTLEMENT";source:"BASE_V2";path:"business/15历史收退记录.csv";baseManifestSha256:string;selectionSha256:string;approvalSha256:string;csvSha256:string;moneyApprovalSha256:string}
export interface HistorySettlementRow {source:ImportSourceEvidence;header:HistorySalesHeaderBinding;account:HistoryPaymentBinding;method:HistoryPaymentBinding|null}
export interface HistorySettlementChunk {batchId:string;fixedSourceNamespace:string;selection:HistorySettlementSelection;moneyApprovals:ReadonlyMap<string,MoneyApproval>;rows:HistorySettlementRow[]}
export interface PreparedHistorySettlementRow extends HistorySettlementRow {settlement:JsonObject;fieldProvenance:JsonObject;fingerprint:string}
export interface PreparedHistorySettlementChunk {input:HistorySettlementChunk;mappingVersion:typeof HISTORY_MAPPING_VERSION;rows:PreparedHistorySettlementRow[];fingerprint:string}
export interface HistorySettlementStagingStore {stage(chunk:PreparedHistorySettlementChunk):Promise<{inserted:number;replayed:number}>}
const must=(ok:unknown,message:string):void=>requireDomain(ok,"HISTORY_SETTLEMENT_INPUT",message);
const hash=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const text=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=65536&&!v.includes("\0");
const cents=(n:bigint)=>`${n<0n?"-":""}${(n<0n?-n:n)/100n}.${((n<0n?-n:n)%100n).toString().padStart(2,"0")}`;
/** Descriptor-only lossless preclone validation, including Map intrinsic entries. */
export function historySettlementRequestHash(value:unknown):string {
 const seen=new Set<object>();
 const plain=(v:unknown):unknown=>{
  if(v===null||typeof v==="string"||typeof v==="boolean"||typeof v==="bigint")return v;
  if(typeof v==="number"){must(Number.isSafeInteger(v),"Safe evidence integers only");return v;}
  must(typeof v==="object"&&!seen.has(v as object),"Acyclic plain evidence required");const o=v as object;seen.add(o);let out:unknown;
  if(Object.getPrototypeOf(o)===Map.prototype){must(Reflect.ownKeys(o).length===0,"Map overrides/hidden fields forbidden");
   const entries=[...Map.prototype.entries.call(o) as MapIterator<[unknown,unknown]>];must(entries.every(([k])=>typeof k==="string"),"Exact approval map keys required");
   entries.sort(([a],[b])=>(a as string)<(b as string)?-1:(a as string)>(b as string)?1:0);out={map_entries:entries.map(([k,x])=>[k,plain(x)])};
  }else{
   must(Array.isArray(o)||Object.getPrototypeOf(o)===Object.prototype,"Plain evidence only");const keys=Reflect.ownKeys(o);
   if(Array.isArray(o))must(keys.length===o.length+1&&keys.every(k=>k==="length"||typeof k==="string"&&/^(0|[1-9]\d*)$/.test(k)&&Number(k)<o.length),"Dense unextended evidence array required");
   const entries=keys.filter(k=>!Array.isArray(o)||k!=="length").map(key=>{const d=Object.getOwnPropertyDescriptor(o,key)!;
    must(typeof key==="string"&&"value" in d&&d.enumerable,"Own enumerable data fields only");return [key as string,plain(d.value)] as const;});
   out=Array.isArray(o)?entries.map(([,x])=>x):Object.fromEntries(entries);
  }seen.delete(o);return out;
 };return requestHash(plain(value));
}
const exact=(value:object,keys:string[])=>must(Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k)),"Exact complete fields required");
function payment(binding:HistoryPaymentBinding,entity:HistoryPaymentBinding["entity"],sourceKey:unknown):void {
 exact(binding,["entity","sourceKey","nativeId","sourceRowId","sourceFileSha256","rowSha256","fingerprint","nativeSnapshot"]);
 entityId("paymentAccount",binding.nativeId);entityId("operation",binding.sourceRowId);
 must(binding.entity===entity&&binding.sourceKey===sourceKey&&text(binding.sourceKey)&&[binding.sourceFileSha256,binding.rowSha256,binding.fingerprint].every(hash),"Exact typed payment source identity required");
 exact(binding.nativeSnapshot,[...NATIVE_PAYMENT_COLUMNS[entity]]);must(binding.nativeSnapshot.id===binding.nativeId&&binding.nativeSnapshot.version===1,"Exact immutable original payment creation snapshot required");
}
export function prepareHistorySettlementChunk(original:HistorySettlementChunk):PreparedHistorySettlementChunk {
 historySettlementRequestHash(original);const input=structuredClone(original);exact(input,["batchId","fixedSourceNamespace","selection","moneyApprovals","rows"]);entityId("operation",input.batchId);
 const sel=input.selection;exact(sel,["entity","source","path","baseManifestSha256","selectionSha256","approvalSha256","csvSha256","moneyApprovalSha256"]);
 must(sel.entity==="SETTLEMENT"&&sel.source==="BASE_V2"&&sel.path==="business/15历史收退记录.csv"&&text(input.fixedSourceNamespace)
  &&[sel.baseManifestSha256,sel.selectionSha256,sel.approvalSha256,sel.csvSha256,sel.moneyApprovalSha256].every(hash),"Exact independent settlement selection required");
 must(input.moneyApprovals instanceof Map&&input.moneyApprovals.size===32,"Whole32 exact-cell approval map required");
 const approvals=[...input.moneyApprovals.values()],checked=v2MoneyApprovalSet(approvals,approvals);must(historySettlementRequestHash(checked)===historySettlementRequestHash(input.moneyApprovals),"Approval keys/identities changed");
 const moneyFingerprint=historySettlementRequestHash(input.moneyApprovals);
 must(Array.isArray(input.rows)&&input.rows.length>0&&input.rows.length<=100
  &&Buffer.byteLength(JSON.stringify(input,(_k,v:unknown)=>v instanceof Map?[...v.entries()]:v))<=4*1024*1024,"Bounded1–100/4MiB settlement rows required");
 const columns=IMPORT_V2_TABLES.find(t=>t.entity==="SETTLEMENT")!.columns,optional="原收款方式来源编号";
 const ids=new Set<string>(),keys=new Set<string>(),positions=new Set<string>(),lines=new Set<string>();
 const rows=input.rows.map((row):PreparedHistorySettlementRow=>{
  exact(row,["source","header","account","method"]);const s=row.source,n=s.normalizedFields,raw=s.rawFields,p=s.fieldProvenance;
  entityId("operation",s.id);must(s.batchId===input.batchId&&s.entityType==="SETTLEMENT"&&text(s.sourceKey)&&text(s.fileRef)&&text(s.sheet)
   &&typeof s.rowNo==="string"&&/^[1-9]\d*$/.test(s.rowNo)&&BigInt(s.rowNo)<=9223372036854775807n&&hash(s.sourceFileSha256)&&hash(s.rowSha256),"Exact original settlement occurrence required");
  const present=Object.hasOwn(raw,optional),names=columns.filter(c=>c.name!==optional||present).map(c=>c.name);exact(raw,names);exact(n,names);
  must(columns.filter(c=>c.name!==optional||present).every(c=>typeof raw[c.name]==="string"&&typeof n[c.name]==="string"&&(raw[c.name] as string).length<=65536&&(n[c.name] as string).length<=65536
    &&!(raw[c.name] as string).includes("\0")&&!(n[c.name] as string).includes("\0")&&(!c.required||n[c.name]!=="")&&(c.name==="金额"||raw[c.name]===n[c.name]))
    &&raw.来源编号===s.sourceKey&&n.来源编号===s.sourceKey,"Only an exactly approved money cell may differ from original; optional own-key retained");
  exact(p,["schema_version","fields"]);must(p.schema_version===1&&p.fields&&typeof p.fields==="object"&&!Array.isArray(p.fields),"Unaugmented original provenance required");
  const fields=structuredClone(p.fields) as JsonObject;exact(fields,names);
  for(const [key,value] of Object.entries(raw)){const f=fields[key] as JsonObject;must(f&&f.origin==="ORIGINAL"&&text(f.reason)&&Object.hasOwn(f,"raw")&&requestHash(f.raw)===requestHash(value),"Original cell provenance differs");}
  const h=row.header;exact(h,["sourceKey","nativeId","sourceRowId","sourceFileSha256","rowSha256","version"]);entityId("sales",h.nativeId);entityId("operation",h.sourceRowId);
  must(h.sourceKey===n.单据来源编号&&h.version===1&&hash(h.sourceFileSha256)&&hash(h.rowSha256),"Exact original same-batch header binding required");
  payment(row.account,"PAYMENT_ACCOUNT",n.账户来源编号);
  const originalMethod=present?n[optional]:undefined;
  if(originalMethod===undefined||originalMethod==="")must(row.method===null,"Unknown original method is NULL, never inferred from account");else{must(row.method!==null,"Explicit nonempty original method needs typed binding");payment(row.method!,"PAYMENT_METHOD",originalMethod);}
  must(typeof n.原收退行号==="string"&&/^[1-9]\d*$/.test(n.原收退行号)&&BigInt(n.原收退行号)<=2147483647n,"Original positive row number required");
  must(n.方向==="收款"||n.方向==="退款","Explicit original receive/refund direction required");
  const amount=raw.金额===n.金额?v2Cents(n.金额 as string):v2ApprovedCents({fileSha256:s.sourceFileSha256,sheet:s.sheet,row:s.rowNo,sourceId:s.sourceKey,field:"金额",rawValue:raw.金额 as string,exactCentValue:n.金额 as string},input.moneyApprovals);
  must(amount>=0n,"Settlement amount is independent nonnegative absolute cents");
  if(raw.金额!==n.金额)fields.金额={origin:"MIGRATION_DERIVED",reason:"EXACT_APPROVED_MONEY_CELL",raw:raw.金额!,parsed:cents(amount),evidence_ref:"provenance/approved-money-tail-overlay.csv",approval_sha256:sel.moneyApprovalSha256};
  const settlement:JsonObject={id:stableImportId("history-sales-settlement",input.fixedSourceNamespace,s.sourceKey),source_row_id:s.id,batch_id:input.batchId,header_id:h.nativeId,line_no:Number(n.原收退行号),
   payment_account_id:row.account.nativeId,direction:n.方向==="收款"?"RECEIVE":"REFUND",amount:cents(amount),account_name_snapshot:n.原账户显示名===""?null:n.原账户显示名!,method_name_snapshot:n.原方式显示名===""?null:n.原方式显示名!,payment_method_id_snapshot:row.method?.nativeId??null};
  const position=JSON.stringify([s.sourceFileSha256,s.sheet,s.rowNo]),line=JSON.stringify([h.nativeId,settlement.line_no]);
  must(!ids.has(s.id)&&!keys.has(s.sourceKey)&&!positions.has(position)&&!lines.has(line),"Duplicate settlement original/line identity");ids.add(s.id);keys.add(s.sourceKey);positions.add(position);lines.add(line);
  const fieldProvenance:JsonObject={...p,fields,history_settlement_mapping:{validator_version:HISTORY_SETTLEMENT_VERSION,selection:{...sel},money_approval_fingerprint:moneyFingerprint}};
  return {...row,settlement,fieldProvenance,fingerprint:historySettlementRequestHash({selection:sel,source:s,header:h,account:row.account,method:row.method,settlement,fieldProvenance,moneyFingerprint})};
 });
 const result={input,mappingVersion:HISTORY_MAPPING_VERSION,rows,fingerprint:historySettlementRequestHash({input,rows,moneyFingerprint})};
 must(Buffer.byteLength(JSON.stringify(result,(_k,v:unknown)=>v instanceof Map?[...v.entries()]:v))<=4*1024*1024,"Prepared settlement proof exceeds4MiB");return result;
}
export function validatePreparedHistorySettlementChunk(chunk:PreparedHistorySettlementChunk):void {
 historySettlementRequestHash(chunk);must(historySettlementRequestHash(prepareHistorySettlementChunk(chunk.input))===historySettlementRequestHash(chunk),"Prepared settlement facts changed at SQL boundary");
}
export async function stageHistorySettlementChunk(input:HistorySettlementChunk,options:{mode?:"DRY_RUN"|"STAGE";store?:HistorySettlementStagingStore;authorize?:(chunk:PreparedHistorySettlementChunk)=>Promise<void>}={}) {
 const chunk=prepareHistorySettlementChunk(input);if(options.mode===undefined||options.mode==="DRY_RUN")return{mode:"DRY_RUN",rows:chunk.rows.length,inserted:0,replayed:0,published:false,importReady:false};
 must(options.mode==="STAGE"&&options.store&&options.authorize,"STAGE needs independent exact source/binding authorization");await options.authorize!(structuredClone(chunk));return{mode:"STAGE",rows:chunk.rows.length,...await options.store!.stage(chunk),published:false,importReady:false};
}
