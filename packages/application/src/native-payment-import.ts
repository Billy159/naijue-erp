import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { IMPORT_V2_TABLES } from "./import-v2-contract.ts";
import { HISTORY_MAPPING_VERSION } from "./history-storage-contract.ts";
import type { ImportSourceEvidence, JsonObject } from "./history-storage-contract.ts";
import { requestHash } from "./request-hash.ts";
export const NATIVE_PAYMENT_IMPORT_VERSION="NATIVE_PAYMENT_IMPORT_V1";
export type NativePaymentEntity="PAYMENT_METHOD"|"PAYMENT_ACCOUNT"|"PAYMENT_ACCOUNT_HALL";
export interface NativePaymentReference {entity:"PAYMENT_METHOD"|"PAYMENT_ACCOUNT"|"HALL";sourceKey:string;nativeId:string;nativeSnapshot:JsonObject}
export interface NativePaymentSelection {entity:NativePaymentEntity;source:"BASE_V2";path:string;baseManifestSha256:string;selectionSha256:string;approvalSha256:string;csvSha256:string}
export interface NativePaymentImportRow {source:ImportSourceEvidence;nativeId:string|null;enabledMapping:{raw:string;native:boolean;evidenceRef:string}|null;references:Record<string,NativePaymentReference>}
export interface NativePaymentImportChunk {batchId:string;fixedSourceNamespace:string;selection:NativePaymentSelection;rows:NativePaymentImportRow[]}
export interface PreparedNativePaymentRow extends NativePaymentImportRow {entity:NativePaymentEntity;nativeSnapshot:JsonObject;fingerprint:string;fieldProvenance:JsonObject}
export interface PreparedNativePaymentImportChunk {input:NativePaymentImportChunk;mappingVersion:typeof HISTORY_MAPPING_VERSION;rows:PreparedNativePaymentRow[];fingerprint:string}
export interface NativePaymentImportResult {inserted:number;replayed:number;nativeCurrentMatchesCreation:boolean}
export interface NativePaymentImportStore {stage(input:PreparedNativePaymentImportChunk):Promise<NativePaymentImportResult>}
const must=(ok:unknown,message:string):void=>requireDomain(ok,"NATIVE_PAYMENT_INPUT",message);
const text=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=65536&&!v.includes("\0");
const hash=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
/** Descriptor traversal BEFORE clone/hash: getters, symbols, hidden keys and sparse/extended arrays are not JSON evidence. */
export function validateNativePaymentRaw(value:unknown):void {
  const seen=new Set<object>();
  const visit=(v:unknown):void=>{
    if(v===null||typeof v==="string"||typeof v==="boolean")return;
    if(typeof v==="number"){must(Number.isSafeInteger(v),"Safe integer evidence numbers only");return;}
    must(typeof v==="object"&&!seen.has(v as object),"Acyclic plain data required");const o=v as object;seen.add(o);
    must(Array.isArray(o)||Object.getPrototypeOf(o)===Object.prototype,"Plain data only");
    const keys=Reflect.ownKeys(o);
    if(Array.isArray(o))must(keys.length===o.length+1&&keys.every(k=>k==="length"||typeof k==="string"&&/^(0|[1-9]\d*)$/.test(k)&&Number(k)<o.length),"Dense unextended array required");
    for(const key of keys){const d=Object.getOwnPropertyDescriptor(o,key)!;must(typeof key==="string"&&"value" in d&&(d.enumerable||Array.isArray(o)&&key==="length"),"Own enumerable data fields required");if(key!=="length"||!Array.isArray(o))visit(d.value);}
    seen.delete(o);
  };visit(value);
}
const exact=(v:object,keys:string[])=>must(Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),"Exact complete object fields required");
export const NATIVE_PAYMENT_COLUMNS={PAYMENT_METHOD:["id","name","enabled","version"],PAYMENT_ACCOUNT:["id","name","payment_method_id","enabled","version"],PAYMENT_ACCOUNT_HALL:["payment_account_id","hall_id"]} as const;
function reference(ref:NativePaymentReference,entity:NativePaymentReference["entity"],key:unknown):void {
  exact(ref,["entity","sourceKey","nativeId","nativeSnapshot"]);entityId("paymentMethod",ref.nativeId);
  must(ref.entity===entity&&ref.sourceKey===key&&text(ref.sourceKey)&&ref.nativeSnapshot.id===ref.nativeId,"Exact typed source/native reference required");
  exact(ref.nativeSnapshot,entity==="HALL"?["id","name","default_customer_id","default_sales_warehouse_id","enabled","version"]:[...NATIVE_PAYMENT_COLUMNS[entity]]);
  must(text(ref.nativeSnapshot.name)&&typeof ref.nativeSnapshot.enabled==="boolean"&&Number.isSafeInteger(ref.nativeSnapshot.version)&&(ref.nativeSnapshot.version as number)>0,"Complete dependency snapshot required");
  if(entity==="PAYMENT_ACCOUNT")entityId("paymentMethod",ref.nativeSnapshot.payment_method_id as string);
  if(entity==="HALL")for(const column of ["default_customer_id","default_sales_warehouse_id"])if(ref.nativeSnapshot[column]!==null)entityId("hall",ref.nativeSnapshot[column] as string);
}
export function prepareNativePaymentImportChunk(original:NativePaymentImportChunk):PreparedNativePaymentImportChunk {
  validateNativePaymentRaw(original);const input=structuredClone(original);exact(input,["batchId","fixedSourceNamespace","selection","rows"]);entityId("operation",input.batchId);
  const sel=input.selection,table=IMPORT_V2_TABLES.find(t=>t.entity===sel?.entity);
  exact(sel,["entity","source","path","baseManifestSha256","selectionSha256","approvalSha256","csvSha256"]);
  must(["PAYMENT_METHOD","PAYMENT_ACCOUNT","PAYMENT_ACCOUNT_HALL"].includes(sel.entity)&&table&&sel.source==="BASE_V2"&&sel.path===table.file&&text(input.fixedSourceNamespace)
    &&[sel.baseManifestSha256,sel.selectionSha256,sel.approvalSha256,sel.csvSha256].every(hash),"Exact authenticated payment selection required");
  must(Array.isArray(input.rows)&&input.rows.length>0&&input.rows.length<=100&&Buffer.byteLength(JSON.stringify(input))<=4*1024*1024,"Bounded1–100 /4MiB chunk required");
  const identities=new Set<string>(),ids=new Set<string>(),positions=new Set<string>(),targets=new Set<string>();
  return prepareRows();
  function prepareRows():PreparedNativePaymentImportChunk {
    const prepared=input.rows.map((row):PreparedNativePaymentRow=>{
      exact(row,["source","nativeId","enabledMapping","references"]);const s=row.source;entityId("operation",s.id);
      must(s.batchId===input.batchId&&s.entityType===sel.entity&&text(s.sourceKey)&&text(s.fileRef)&&text(s.sheet)&&typeof s.rowNo==="string"&&/^[1-9]\d*$/.test(s.rowNo)
        &&BigInt(s.rowNo)<=9223372036854775807n&&hash(s.sourceFileSha256)&&hash(s.rowSha256),"Exact same-batch original occurrence required");
      const raw=s.rawFields;exact(raw,table!.columns.map(c=>c.name));exact(s.normalizedFields,table!.columns.map(c=>c.name));
      must(table!.columns.every(c=>typeof raw[c.name]==="string"&&(raw[c.name] as string).length<=65536&&!(raw[c.name] as string).includes("\0")&&(!c.required||text(raw[c.name])))
        &&requestHash(raw)===requestHash(s.normalizedFields),"Original payment cells cannot be missing or rewritten");
      must(s.sourceKey===(sel.entity==="PAYMENT_ACCOUNT_HALL"?JSON.stringify([raw.账户来源编号,raw.厅来源编号]):raw.来源编号),"Raw source identity differs");
      const p=s.fieldProvenance;exact(p,["schema_version","fields"]);must(p.schema_version===1&&p.fields&&typeof p.fields==="object"&&!Array.isArray(p.fields),"Unaugmented original provenance required");
      const fields=p.fields as JsonObject;exact(fields,Object.keys(raw));
      for(const [key,value] of Object.entries(raw)){const f=fields[key] as JsonObject;must(f&&f.origin==="ORIGINAL"&&text(f.reason)&&Object.hasOwn(f,"raw")&&requestHash(f.raw)===requestHash(value),"Original field provenance differs");}
      const n:JsonObject={},r=row.references;const kind=sel.entity;
      if(kind!=="PAYMENT_ACCOUNT_HALL"){
        entityId("paymentMethod",row.nativeId as string);must(row.nativeId!==s.sourceKey,"Independent native identity required");
        const m=row.enabledMapping;must(m&&m.raw===raw.状态&&typeof m.native==="boolean"&&text(m.evidenceRef),"Explicit reviewed state mapping required");
        if(m)exact(m,["raw","native","evidenceRef"]);n.id=row.nativeId;n.name=kind==="PAYMENT_METHOD"?raw.方式名称!:raw.账户显示名称!;n.enabled=m!.native;n.version=1;
      }else must(row.nativeId===null&&row.enabledMapping===null,"Recommendation has only its real composite key, no active/permission flag");
      if(kind==="PAYMENT_METHOD")exact(r,[]);
      else if(kind==="PAYMENT_ACCOUNT"){
        exact(r,["收款方式来源编号"]);reference(r.收款方式来源编号!,"PAYMENT_METHOD",raw.收款方式来源编号);n.payment_method_id=r.收款方式来源编号!.nativeId;
      }else{
        exact(r,["账户来源编号","厅来源编号"]);reference(r.账户来源编号!,"PAYMENT_ACCOUNT",raw.账户来源编号);reference(r.厅来源编号!,"HALL",raw.厅来源编号);
        n.payment_account_id=r.账户来源编号!.nativeId;n.hall_id=r.厅来源编号!.nativeId;
      }
      const target=kind+"/"+JSON.stringify(n.id??[n.payment_account_id,n.hall_id]),position=JSON.stringify([s.sourceFileSha256,s.sheet,s.rowNo]);
      must(!identities.has(s.sourceKey)&&!ids.has(s.id)&&!positions.has(position)&&!targets.has(target),"Duplicate source/native/occurrence identity");
      identities.add(s.sourceKey);ids.add(s.id);positions.add(position);targets.add(target);
      const fingerprint=requestHash({namespace:input.fixedSourceNamespace,selection:sel,source:s,nativeSnapshot:n,enabledMapping:row.enabledMapping,references:r});
      const fieldProvenance:JsonObject={...p,native_payment_import:{validator_version:NATIVE_PAYMENT_IMPORT_VERSION,selection:{...sel},fixed_source_namespace:input.fixedSourceNamespace,
        native_snapshot:n,enabled_mapping:row.enabledMapping?{...row.enabledMapping}:null,references:structuredClone(r) as unknown as JsonObject,evidence_fingerprint:fingerprint}};
      return {...row,entity:kind,nativeSnapshot:n,fingerprint,fieldProvenance};
    });
    const result={input,mappingVersion:HISTORY_MAPPING_VERSION,rows:prepared,fingerprint:requestHash({input,rows:prepared})};
    must(Buffer.byteLength(JSON.stringify(result))<=4*1024*1024,"Prepared evidence exceeds4MiB");return result;
  }
}
export function validatePreparedNativePaymentImportChunk(chunk:PreparedNativePaymentImportChunk):void {
  validateNativePaymentRaw(chunk);must(requestHash(prepareNativePaymentImportChunk(chunk.input))===requestHash(chunk),"Prepared payment input changed at SQL boundary");
}
export async function stageNativePaymentImport(input:NativePaymentImportChunk,options:{mode?:"DRY_RUN"|"STAGE";store?:NativePaymentImportStore;authorize?:(chunk:PreparedNativePaymentImportChunk)=>Promise<void>}={}) {
  const chunk=prepareNativePaymentImportChunk(input);
  if(options.mode===undefined||options.mode==="DRY_RUN")return {mode:"DRY_RUN",rows:chunk.rows.length,inserted:0,replayed:0,published:false,importReady:false};
  must(options.mode==="STAGE"&&options.store&&options.authorize,"STAGE requires independent exact whole-source authorization");
  await options.authorize!(structuredClone(chunk));const result=await options.store!.stage(chunk);
  return {mode:"STAGE",rows:chunk.rows.length,inserted:result.inserted,replayed:result.replayed,published:false,importReady:false};
}
