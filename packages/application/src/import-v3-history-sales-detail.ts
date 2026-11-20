import { requireDomain } from "../../domain/src/errors.ts";
import { IMPORT_V2_TABLES } from "./import-v2-contract.ts";
import { HISTORY_MAPPING_VERSION, isHistoryQuantity } from "./history-storage-contract.ts";
import type { ImportSourceEvidence, JsonObject } from "./history-storage-contract.ts";
import { v2Cents, v2ApprovedCents, v2MoneyApprovalSet } from "./import-v2.ts";
import type { MoneyApproval } from "./import-v2.ts";
import { stableImportId } from "./inventory-cutoff-import.ts";
import { requestHash } from "./request-hash.ts";

export const HISTORY_SALES_DETAIL_VERSION = "V3_SALES_LINE_STAGE_1";
export const HISTORY_SALES_DETAIL_CHUNK_LIMIT = 100;
export interface HistorySalesDetailSelection {
  readonly entity:"SALES_LINE"; readonly source:"BASE_V2"; readonly path:"business/14历史销货明细.csv";
  readonly baseManifestSha256:string; readonly selectionSha256:string; readonly approvalSha256:string;
  readonly csvSha256:string; readonly aliasCsvSha256:string; readonly moneyApprovalSha256:string;
}
export interface HistorySalesHeaderBinding {
  readonly sourceKey:string; readonly nativeId:string; readonly sourceRowId:string;
  readonly sourceFileSha256:string; readonly rowSha256:string; readonly version:1;
}
export interface HistorySalesSkuBinding {
  readonly oldSourceSkuKey:string; readonly canonicalSourceKey:string; readonly nativeId:string;
  readonly aliasSourceRowId:string; readonly importRecordId:string;
}
export interface HistorySalesDetailRow {
  readonly source:ImportSourceEvidence; readonly header:HistorySalesHeaderBinding; readonly sku:HistorySalesSkuBinding;
}
export interface HistorySalesDetailChunk {
  readonly batchId:string; readonly fixedSourceNamespace:string; readonly selection:HistorySalesDetailSelection;
  /** Whole independently pinned 32-cell set, not a tolerance or a per-chunk subset. */
  readonly moneyApprovals:ReadonlyMap<string,MoneyApproval>; readonly rows:readonly HistorySalesDetailRow[];
}
export interface PreparedHistorySalesDetailRow {
  readonly source:ImportSourceEvidence; readonly header:HistorySalesHeaderBinding; readonly sku:HistorySalesSkuBinding;
  readonly line:JsonObject; readonly fieldProvenance:JsonObject; readonly fingerprint:string;
}
export interface PreparedHistorySalesDetailChunk {
  readonly input:HistorySalesDetailChunk; readonly mappingVersion:typeof HISTORY_MAPPING_VERSION;
  readonly rows:readonly PreparedHistorySalesDetailRow[]; readonly fingerprint:string;
}
export interface HistorySalesDetailStagingStore {
  stage(input:PreparedHistorySalesDetailChunk):Promise<{inserted:number;replayed:number}>;
}
const hash=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const text=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=65536&&!v.includes("\0");
const must=(ok:unknown,code:string,message:string):void=>requireDomain(ok,code,message);
const centsText=(n:bigint)=>`${n<0n?"-":""}${(n<0n?-n:n)/100n}.${((n<0n?-n:n)%100n).toString().padStart(2,"0")}`;
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v,(_k,x:unknown)=>x instanceof Map?[...x.entries()]:x)).byteLength;
const approvalEntries=(map:ReadonlyMap<string,MoneyApproval>)=>[...map.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0);
/** requestHash intentionally rejects Map prototypes. Encode every Map entry,
 * never JSON.stringify(Map) (which would silently hide the approval set). */
export function historySalesDetailRequestHash(value:unknown):string{
  const plain=(v:unknown):unknown=>v instanceof Map?approvalEntries(v).map(([k,x])=>[k,plain(x)]):Array.isArray(v)?v.map(plain):
    v!==null&&typeof v==="object"&&Object.getPrototypeOf(v)===Object.prototype?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,plain(x)])):v;
  return requestHash(plain(value));
}
/** Phase A only. No settlement/payment binding, live SAVE, stock effect or publication. */
export function prepareHistorySalesDetailChunk(original:HistorySalesDetailChunk):PreparedHistorySalesDetailChunk {
  const input=structuredClone(original),sel=input.selection;
  must(uuid(input.batchId)&&text(input.fixedSourceNamespace),"HISTORY_SALES_DETAIL_BATCH","Exact batch/namespace required");
  must(sel?.entity==="SALES_LINE"&&sel.source==="BASE_V2"&&sel.path==="business/14历史销货明细.csv"
    &&[sel.baseManifestSha256,sel.selectionSha256,sel.approvalSha256,sel.csvSha256,sel.aliasCsvSha256,sel.moneyApprovalSha256].every(hash),
    "HISTORY_SALES_DETAIL_SELECTION","Exact authenticated sales-line/alias/money selections required; SETTLEMENT is not implemented");
  must(Array.isArray(input.rows)&&input.rows.length>0&&input.rows.length<=HISTORY_SALES_DETAIL_CHUNK_LIMIT&&bytes(input)<=4*1024*1024,
    "HISTORY_SALES_DETAIL_CHUNK_LIMIT","Bounded 1–100 rows / 4 MiB UTF-8 chunk required");
  must(input.moneyApprovals instanceof Map&&input.moneyApprovals.size===32,"HISTORY_SALES_DETAIL_MONEY_APPROVAL","Complete 32-cell approved map required");
  const approvals=[...input.moneyApprovals.values()];
  const structural=v2MoneyApprovalSet(approvals,approvals);
  must(requestHash(approvalEntries(structural))===requestHash(approvalEntries(input.moneyApprovals)),"HISTORY_SALES_DETAIL_MONEY_APPROVAL","Approval keys/identities changed");
  const moneyFingerprint=requestHash(approvalEntries(input.moneyApprovals));
  const columns=IMPORT_V2_TABLES.find(t=>t.entity==="SALES_LINE")!.columns;
  const ids=new Set<string>(),keys=new Set<string>(),positions=new Set<string>(),lineKeys=new Set<string>();
  const rows=input.rows.map(({source:s,header,sku}):PreparedHistorySalesDetailRow=>{
    must(s&&uuid(s.id)&&s.batchId===input.batchId&&s.entityType==="SALES_LINE"&&text(s.sourceKey)&&text(s.fileRef)&&text(s.sheet)
      &&typeof s.rowNo==="string"&&/^[1-9][0-9]*$/.test(s.rowNo)&&BigInt(s.rowNo)<=9223372036854775807n
      &&hash(s.sourceFileSha256)&&hash(s.rowSha256),"HISTORY_SALES_DETAIL_SOURCE","Exact original occurrence required");
    const n=s.normalizedFields,raw=s.rawFields,p=s.fieldProvenance;
    must(n&&raw&&Object.keys(n).length===columns.length&&columns.every(c=>Object.hasOwn(n,c.name)&&typeof n[c.name]==="string"
      &&(n[c.name] as string).length<=65536&&!(n[c.name] as string).includes("\0")&&(!c.required||n[c.name]!=="")),
      "HISTORY_SALES_DETAIL_COLUMNS","Exact complete nineteen-column literal normalized row required");
    must(columns.every(c=>Object.hasOwn(raw,c.name)&&typeof raw[c.name]==="string"&&(c.logicalType==="MONEY"||c.name==="SKU来源编号"||raw[c.name]===n[c.name]))
      &&n["来源编号"]===s.sourceKey&&raw["来源编号"]===s.sourceKey&&raw["绑定范围"]!=="PRODUCT"&&n["绑定范围"]!=="PRODUCT",
      "HISTORY_SALES_DETAIL_RAW","Nonmoney source cells cannot be missing/rewritten; only verified SKU alias may differ");
    must(p?.schema_version===1&&p.fields&&typeof p.fields==="object"&&!Array.isArray(p.fields)&&!Object.hasOwn(p,"history_sales_detail_staging")
      &&!Object.hasOwn(p,"history_sales_detail_mapping"),"HISTORY_SALES_DETAIL_PROVENANCE","Unaugmented versioned original provenance required");
    const fields=structuredClone(p.fields) as JsonObject;
    for(const [key,value] of Object.entries(raw)){
      const f=fields[key] as JsonObject|undefined;
      must(f&&["ORIGINAL","MIGRATION_DERIVED","UNKNOWN"].includes(String(f.origin))&&typeof f.reason==="string"&&Object.hasOwn(f,"raw")
        &&requestHash(f.raw)===requestHash(value)&&(f.origin!=="MIGRATION_DERIVED"||text(f.evidence_ref)),"HISTORY_SALES_DETAIL_PROVENANCE","Every original raw cell needs exact provenance");
    }
    must(header&&uuid(header.nativeId)&&uuid(header.sourceRowId)&&header.sourceKey===n["单据来源编号"]&&header.version===1
      &&hash(header.sourceFileSha256)&&hash(header.rowSha256),"HISTORY_SALES_DETAIL_HEADER","Explicit source-backed initial sales header binding required");
    must(sku&&uuid(sku.nativeId)&&uuid(sku.aliasSourceRowId)&&uuid(sku.importRecordId)&&text(sku.oldSourceSkuKey)
      &&sku.oldSourceSkuKey===raw["SKU来源编号"]&&sku.canonicalSourceKey===n["SKU来源编号"]&&text(sku.canonicalSourceKey),
      "HISTORY_SALES_DETAIL_SKU","Explicit old alias→canonical source→native SKU/record binding required");
    if(raw["SKU来源编号"]!==n["SKU来源编号"])fields["SKU来源编号"]={origin:"MIGRATION_DERIVED",reason:"VERIFIED_OLD_TO_CANONICAL_ALIAS",raw:raw["SKU来源编号"]!,
      evidence_ref:"mappings/old-to-canonical-sku-15121.csv",alias_csv_sha256:sel.aliasCsvSha256};
    const value=(field:string)=>n[field] as string;
    const nullable=(field:string)=>value(field)===""?null:value(field);
    const money=(field:string,optional=false):string|null=>{
      const originalValue=raw[field] as string,normalized=value(field);
      if(normalized===""){must(optional&&originalValue==="","HISTORY_SALES_DETAIL_MONEY","Required money cannot be unknown or silently cleared");return null;}
      let cents:bigint;
      if(originalValue===normalized)cents=v2Cents(normalized);
      else{cents=v2ApprovedCents({fileSha256:s.sourceFileSha256,sheet:s.sheet,row:s.rowNo,sourceId:s.sourceKey,field,rawValue:originalValue,exactCentValue:normalized},input.moneyApprovals);
        fields[field]={origin:"MIGRATION_DERIVED",reason:"EXACT_APPROVED_MONEY_CELL",raw:originalValue,parsed:centsText(cents),
          evidence_ref:"provenance/approved-money-tail-overlay.csv",approval_sha256:sel.moneyApprovalSha256};}
      return centsText(cents);
    };
    const bool=(field:string):boolean|null=>{const v=value(field);must(["","是","否"].includes(v),"HISTORY_SALES_DETAIL_ENUM","Explicit 是/否/unknown only");return v===""?null:v==="是";};
    must(/^[1-9][0-9]*$/.test(value("原行号"))&&BigInt(value("原行号"))<=2147483647n&&isHistoryQuantity(value("原数量"))&&value("原数量")!=="0",
      "HISTORY_SALES_DETAIL_QUANTITY","Positive original line number and explicit nonzero signed bigint sales quantity required");
    const discount=value("原折扣十分位");
    must(discount===""||(/^(?:0|[1-9][0-9]*)$/.test(discount)&&BigInt(discount)<=100n),"HISTORY_SALES_DETAIL_DISCOUNT","Discount tenths is explicit 0–100 or historical NULL");
    must(["","UNIT_PRICE","DISCOUNT"].includes(value("原定价方式")),"HISTORY_SALES_DETAIL_PRICING","Unknown historical pricing is NULL, not an inferred live default");
    const line:JsonObject={id:stableImportId("history-sales-line",input.fixedSourceNamespace,s.sourceKey),batch_id:input.batchId,source_row_id:s.id,header_id:header.nativeId,
      line_no:Number(value("原行号")),sku_id:sku.nativeId,quantity:value("原数量"),reference_price:money("原参考价",true),deal_price:money("原成交单价"),line_amount:money("原行金额"),
      allocated_discount:money("原分摊优惠",true),is_gift:bool("原赠品标记"),pricing_method_source:nullable("原定价方式"),discount_tenths:discount===""?null:Number(discount),ordinary_zero_confirmed:bool("原普通零价确认"),
      product_code_snapshot:nullable("原款号"),product_name_snapshot:nullable("原品名"),color_name_snapshot:nullable("原颜色名称"),fit_name_snapshot:nullable("原版型名称"),size_name_snapshot:nullable("原完整尺码"),barcode_snapshot:nullable("原使用条码")};
    const position=JSON.stringify([s.sourceFileSha256,s.sheet,s.rowNo]),lineKey=JSON.stringify([header.nativeId,line.line_no]);
    must(!ids.has(s.id)&&!keys.has(s.sourceKey)&&!positions.has(position)&&!lineKeys.has(lineKey),"HISTORY_SALES_DETAIL_DUPLICATE","Duplicate original occurrence/native line key");
    ids.add(s.id);keys.add(s.sourceKey);positions.add(position);lineKeys.add(lineKey);
    const fieldProvenance:JsonObject={...p,fields,history_sales_detail_mapping:{validator_version:HISTORY_SALES_DETAIL_VERSION,selection:{...sel},money_approval_fingerprint:moneyFingerprint}};
    const fingerprint=requestHash({selection:sel,source:s,header,sku,line,fieldProvenance,moneyFingerprint});
    return {source:s,header,sku,line,fieldProvenance,fingerprint};
  });
  const result:PreparedHistorySalesDetailChunk={input,mappingVersion:HISTORY_MAPPING_VERSION,rows,fingerprint:historySalesDetailRequestHash({input,rows,moneyFingerprint})};
  must(bytes(result)<=4*1024*1024,"HISTORY_SALES_DETAIL_CHUNK_LIMIT","Prepared proof must fit 4 MiB UTF-8 bound");return result;
}
export function validatePreparedHistorySalesDetailChunk(chunk:PreparedHistorySalesDetailChunk):void{
  const actual=prepareHistorySalesDetailChunk(chunk.input);
  must(historySalesDetailRequestHash(actual)===historySalesDetailRequestHash(chunk),"HISTORY_SALES_DETAIL_PREPARED_CHANGED","SQL boundary independently recomputes every source/binding/typed value");
}
export async function stageHistorySalesDetailChunk(input:HistorySalesDetailChunk,options:{mode?:"DRY_RUN"|"STAGE";store?:HistorySalesDetailStagingStore;
  authorize?:(chunk:PreparedHistorySalesDetailChunk)=>Promise<void>}={}):Promise<{mode:"DRY_RUN"|"STAGE";rows:number;inserted:number;replayed:number;published:false;importReady:false}>{
  const chunk=prepareHistorySalesDetailChunk(input);
  if(options.mode===undefined||options.mode==="DRY_RUN")return {mode:"DRY_RUN",rows:chunk.rows.length,inserted:0,replayed:0,published:false,importReady:false};
  must(options.mode==="STAGE"&&options.store&&options.authorize,"HISTORY_SALES_DETAIL_AUTHORIZATION","STAGE requires independent exact-source/binding authorization");
  await options.authorize!(structuredClone(chunk));const result=await options.store!.stage(chunk);
  return {mode:"STAGE",rows:chunk.rows.length,...result,published:false,importReady:false};
}
