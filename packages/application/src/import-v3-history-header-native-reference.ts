import { historyClosureRowHash } from './history-typed-closure.ts';
import { IMPORT_V2_TABLES } from './import-v2-contract.ts';
import { HISTORY_MAPPING_VERSION } from './history-storage-contract.ts';
import type { ImportSourceEvidence, JsonObject } from './history-storage-contract.ts';
import type { HeaderNativeBinding } from './import-v3-history-header.ts';
import { mapHistoryTemporal } from './history-temporal-mapping.ts';
import { requestHash } from './request-hash.ts';
export type HistoryHeaderNativeReferenceEntity = 'HALL'|'CUSTOMER'|'STAFF';
export type HistoryHeaderNativeReferenceSelection = {
  baseManifestSha256:string; selectionSha256:string; approvalSha256:string; path:string;
} & ({ entity:HistoryHeaderNativeReferenceEntity; source:'BASE_V2'; csvSha256:string }
  | { entity:'CUSTOMER'; source:'HISTORICAL_CUSTOMER_SUPPLEMENT_V1'; sourceFileSha256:string });
export interface HistoryHeaderReferenceEnumMapping { raw:string|boolean; native:string|boolean; evidenceRef:string }
export interface HistoryHeaderNativeReferenceInput {
  batchId:string; fixedSourceNamespace:string; selection:HistoryHeaderNativeReferenceSelection; source:ImportSourceEvidence;
  /** Full explicit current native record; compared under row lock only when first binding is written. */
  nativeSnapshot:JsonObject;
  bindings:Readonly<Record<string,HeaderNativeBinding|undefined>>;
  /** Reviewed exact source-to-native enum decisions; never implicit translations. */
  enumMappings:Readonly<Record<string,HistoryHeaderReferenceEnumMapping|undefined>>;
}
export interface PreparedHistoryHeaderNativeReference {
  source:ImportSourceEvidence; entity:HistoryHeaderNativeReferenceEntity; nativeSnapshot:JsonObject;
  nativeId:string; nativeVersion:number; fingerprint:string; fieldProvenance:JsonObject;
}
export interface PreparedHistoryHeaderNativeReferenceChunk {
  batchId:string; fixedSourceNamespace:string; mappingVersion:typeof HISTORY_MAPPING_VERSION;
  selection:HistoryHeaderNativeReferenceSelection;
  rows:readonly {input:HistoryHeaderNativeReferenceInput;prepared:PreparedHistoryHeaderNativeReference}[];
}
export interface HistoryHeaderNativeReferenceStore { stage(chunk:PreparedHistoryHeaderNativeReferenceChunk):Promise<{inserted:number;replayed:number}> }
const require=(ok:unknown,code:string):void=>{if(!ok)throw Error(code);};
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=65536&&!v.includes('\0');
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const hash=(v:unknown):boolean=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const nullableText=(v:unknown):boolean=>v===null||typeof v==='string'&&v.length<=65536&&!v.includes('\0');
const columns={HALL:['id','name','default_customer_id','default_sales_warehouse_id','enabled','version'],
  CUSTOMER:['id','code','name','enabled','version','created_at','updated_at'],STAFF:['id','name','hall_id','role','contact','employment_status','version']} as const;
export const HISTORY_HEADER_NATIVE_REFERENCE_CHUNK_LIMIT=100;

/** Pure exact-source validation only; an outside source grant and actual26
 * same-client capability are still mandatory before any persistence. */
export function assertExactHistoricalCustomerReference(input:HistoryHeaderNativeReferenceInput):void {
  const {selection,source:s,nativeSnapshot:n}=input,raw=s.rawFields;
  if(selection.source!=='HISTORICAL_CUSTOMER_SUPPLEMENT_V1')throw Error('EXACT2_HISTORICAL_CUSTOMER_SELECTION');
  const pins=[
    ['HIST-CUSTOMER:7d256f74-8a8b-d420-2749-a9ca70e21f9d','4278c80d-c380-1561-cfc4-3e1ee0dcfe5f','2e5bd72a-c1cb-4090-90be-091deb49bb2e','1','a6f9b9d9548895debb47fc18c69833230e4d7fb49d384d2f18a351e09c792dc7','92f132ff61524e363d31b4ae4a44a1707f2fb40c7db9122756876438d1b50c57'],
    ['HIST-CUSTOMER:d315fc13-fee5-82ca-5716-83fe0e96d5c3','055e00fc-8309-b3d2-e71e-94f8a31c1626','f8a29ce8-e296-4b95-9612-ca7bb62507bd','2','c51d7bf8b1a87420b7d2cbc80fd8935a0f18f491963da31c7ce5f3ca58144fb6','19858e4e8dfb13864c22f9f3997134f4393f224527f68f5d4a3fd0dcbdce635e']
  ] as const;
  const pin=pins.find(x=>x[0]===s.sourceKey);
  const selectionKeys=['entity','source','path','baseManifestSha256','selectionSha256','approvalSha256','sourceFileSha256'];
  require(selection.source==='HISTORICAL_CUSTOMER_SUPPLEMENT_V1'&&selection.entity==='CUSTOMER'
    &&Object.keys(selection).length===selectionKeys.length&&selectionKeys.every(k=>Object.hasOwn(selection,k))
    &&selection.path==='dictionaries/historical-customers.json'
    &&selection.sourceFileSha256==='79305bfcb0545e5bc26601f839508be2b64a6637cd6fb1ef1819c6989fc38e65'
    &&selection.approvalSha256==='e471ccdef09f385688d8f5709e072a033d471f0c6fdba8b7bb1b49ad55a9408a'
    &&hash(selection.baseManifestSha256)&&hash(selection.selectionSha256),'EXACT2_HISTORICAL_CUSTOMER_SELECTION');
  const keys=['sourceKey','originalCode','originalName','enabled','historicalOnly','visibleInCurrentCustomerList','originalPartyIdentity','sourceDocumentNumber'];
  require(pin&&s.entityType==='CUSTOMER'&&s.id===pin[1]&&s.rowNo===pin[3]&&s.rowSha256===pin[4]
    &&s.fileRef===selection.path&&s.sheet==='JSON_ARRAY_ITEMS'&&s.sourceFileSha256===selection.sourceFileSha256
    &&Object.keys(raw).length===keys.length&&keys.every(k=>Object.hasOwn(raw,k))
    &&requestHash(raw)===requestHash(s.normalizedFields)
    &&raw.sourceKey===s.sourceKey&&raw.originalPartyIdentity===s.sourceKey.slice(14)
    &&raw.enabled===false&&raw.historicalOnly===true&&raw.visibleInCurrentCustomerList===false
    &&historyClosureRowHash({relation:'HISTORICAL_CUSTOMER_SUPPLEMENT_V1',key:s.sourceKey,projection:raw})===pin[5],
  'EXACT2_HISTORICAL_CUSTOMER_SOURCE');
  require(pin&&requestHash(n)===requestHash({id:pin[2],code:raw.originalCode,name:raw.originalName,enabled:false,version:1,created_at:null,updated_at:null})
    &&Object.keys(input.bindings).length===0,'EXACT2_HISTORICAL_CUSTOMER_NATIVE');
  const mapping=input.enumMappings.enabled;
  require(Object.keys(input.enumMappings).length===1&&mapping&&mapping.raw===false&&mapping.native===false
    &&mapping.evidenceRef===selection.approvalSha256,'EXACT2_HISTORICAL_CUSTOMER_BOOLEAN_EVIDENCE');
}

export function prepareV3HistoryHeaderNativeReferenceChunk(inputs:readonly HistoryHeaderNativeReferenceInput[]):PreparedHistoryHeaderNativeReferenceChunk {
  require(Array.isArray(inputs)&&inputs.length>0&&inputs.length<=HISTORY_HEADER_NATIVE_REFERENCE_CHUNK_LIMIT,'HISTORY_HEADER_REFERENCE_CHUNK_LIMIT');
  const cloned=structuredClone(inputs),first=cloned[0]!;
  require(new TextEncoder().encode(JSON.stringify(cloned)).byteLength<=4*1024*1024,'HISTORY_HEADER_REFERENCE_BYTE_LIMIT');
  const identities=new Set<string>(),ids=new Set<string>(),positions=new Set<string>(),targets=new Set<string>();
  const rows=cloned.map(input=>{
    const {source:s,selection,nativeSnapshot:n}=input,entity=selection.entity;
    const table=IMPORT_V2_TABLES.find(t=>t.entity===entity);
    const historical=selection.source==='HISTORICAL_CUSTOMER_SUPPLEMENT_V1';
    if(historical)assertExactHistoricalCustomerReference(input);
    else require(['HALL','CUSTOMER','STAFF'].includes(entity)&&table&&selection.source==='BASE_V2'&&selection.path===table.file
      &&[selection.baseManifestSha256,selection.selectionSha256,selection.approvalSha256,selection.csvSha256].every(hash),'HISTORY_HEADER_REFERENCE_SELECTION');
    require(input.batchId===first.batchId&&input.fixedSourceNamespace===first.fixedSourceNamespace&&requestHash(selection)===requestHash(first.selection),'HISTORY_HEADER_REFERENCE_MIXED_BATCH');
    require(uuid(input.batchId)&&text(input.fixedSourceNamespace)&&s.batchId===input.batchId&&uuid(s.id)&&s.entityType===entity&&text(s.sourceKey)
      &&text(s.fileRef)&&text(s.sheet)&&typeof s.rowNo==='string'&&/^[1-9]\d*$/.test(s.rowNo)&&BigInt(s.rowNo)<=9223372036854775807n
      &&hash(s.sourceFileSha256)&&hash(s.rowSha256),'HISTORY_HEADER_REFERENCE_SOURCE');
    const raw=s.rawFields,v=s.normalizedFields;
    if(!historical)require(raw&&v&&Object.keys(v).length===table!.columns.length&&table!.columns.every(c=>Object.hasOwn(v,c.name)
      &&typeof v[c.name]==='string'&&(v[c.name] as string).length<=65536&&!(v[c.name] as string).includes('\0')
      &&(!c.required||v[c.name]!=='')&&Object.hasOwn(raw,c.name)&&raw[c.name]===v[c.name])
      &&raw['来源编号']===s.sourceKey&&v['来源编号']===s.sourceKey,'HISTORY_HEADER_REFERENCE_EXACT_ORIGINAL_COLUMNS');
    require(s.fieldProvenance.schema_version===1&&s.fieldProvenance.fields&&typeof s.fieldProvenance.fields==='object'
      &&!Array.isArray(s.fieldProvenance.fields),'HISTORY_HEADER_REFERENCE_PROVENANCE');
    const fields:JsonObject={...(s.fieldProvenance.fields as JsonObject)};
    for(const field of Object.values(fields)){
      const f=field as JsonObject;require(f&&['ORIGINAL','MIGRATION_DERIVED','UNKNOWN'].includes(String(f.origin))&&typeof f.reason==='string'
        &&Object.hasOwn(f,'raw')&&(f.origin!=='MIGRATION_DERIVED'||text(f.evidence_ref)),'HISTORY_HEADER_REFERENCE_PROVENANCE');
    }
    for(const c of historical?Object.keys(raw).map(name=>({name})):table!.columns)fields[c.name]={origin:raw[c.name]===''?'UNKNOWN':'ORIGINAL',reason:raw[c.name]===''?'SOURCE_EMPTY':'SOURCE_PRESERVED',raw:raw[c.name]!};
    require(n&&Object.keys(n).length===columns[entity].length&&columns[entity].every(k=>Object.hasOwn(n,k))&&uuid(n.id)
      &&Number.isSafeInteger(n.version)&&(n.version as number)>0&&(n.version as number)<=2147483647&&text(n.name),'HISTORY_HEADER_REFERENCE_NATIVE_SNAPSHOT');
    const expectedEnums=historical?['enabled']:entity==='STAFF'?['角色','任职状态']:['状态'];
    require(Object.keys(input.enumMappings).length===expectedEnums.length&&expectedEnums.every(k=>Object.hasOwn(input.enumMappings,k)),'HISTORY_HEADER_REFERENCE_ENUM_MAPPING');
    const enumValue=(field:string,target:unknown):void=>{
      const m=input.enumMappings[field];require(m&&m.raw===raw[field]&&m.native===target&&text(m.evidenceRef),'HISTORY_HEADER_REFERENCE_ENUM_MAPPING');
    };
    const expectedRelations=entity==='HALL'?['默认客户来源编号','默认销货仓来源编号']:entity==='STAFF'?['所属厅来源编号']:[];
    require(Object.keys(input.bindings).every(k=>expectedRelations.includes(k)),'HISTORY_HEADER_REFERENCE_RELATION_MAPPING');
    const relation=(field:string,column:string):void=>{
      const b=input.bindings[field],sourceKey=v[field],nativeId=n[column];
      if(sourceKey===''){require(nativeId===null&&b===undefined,'HISTORY_HEADER_REFERENCE_RELATION_MAPPING');return;}
      require(text(sourceKey)&&b&&b.sourceKey===sourceKey&&uuid(b.nativeId)&&b.nativeId===nativeId,'HISTORY_HEADER_REFERENCE_RELATION_MAPPING');
    };
    if(entity==='HALL'){
      require(n.name===raw['厅名称']&&typeof n.enabled==='boolean','HISTORY_HEADER_REFERENCE_NATIVE_FIELDS');enumValue('状态',n.enabled);
      relation('默认客户来源编号','default_customer_id');relation('默认销货仓来源编号','default_sales_warehouse_id');
    }else if(entity==='CUSTOMER'){
      require(n.code===raw[historical?'originalCode':'原编码']&&text(n.code)&&n.name===raw[historical?'originalName':'名称']&&typeof n.enabled==='boolean','HISTORY_HEADER_REFERENCE_NATIVE_FIELDS');enumValue(historical?'enabled':'状态',n.enabled);
      for(const k of ['created_at','updated_at'])require(n[k]===null||typeof n[k]==='string'&&mapHistoryTemporal(n[k] as string,'DATETIME').instant!==null,'HISTORY_HEADER_REFERENCE_NATIVE_TIMESTAMP');
    }else{
      require(n.name===raw['姓名']&&n.contact===(raw['联系方式']===''?null:raw['联系方式'])&&nullableText(n.contact)&&text(n.role)&&text(n.employment_status),'HISTORY_HEADER_REFERENCE_NATIVE_FIELDS');
      enumValue('角色',n.role);enumValue('任职状态',n.employment_status);relation('所属厅来源编号','hall_id');
    }
    const bindingJson:JsonObject={};for(const [field,binding] of Object.entries(input.bindings))if(binding)bindingJson[field]={sourceKey:binding.sourceKey,nativeId:binding.nativeId};
    const enumJson:JsonObject={};for(const [field,mapping] of Object.entries(input.enumMappings))if(mapping)enumJson[field]={raw:mapping.raw,native:mapping.native,evidenceRef:mapping.evidenceRef};
    const proof:JsonObject={validator_version:'V3_HISTORY_HEADER_NATIVE_REFERENCE_1',native_id:n.id!,native_version:n.version!,native_snapshot:n,bindings:bindingJson,enum_mappings:enumJson};
    const nativeKey=entity==='HALL'?'native_hall_id':entity==='CUSTOMER'?'native_customer_id':'native_staff_id';
    // No competing native binding may be smuggled through original provenance.
    require(['native_hall_id','native_customer_id','native_staff_id'].every(k=>!Object.hasOwn(s.fieldProvenance,k)||k===nativeKey&&s.fieldProvenance[k]===n.id),'HISTORY_HEADER_REFERENCE_COMPETING_NATIVE_BINDING');
    const fieldProvenance:JsonObject={...s.fieldProvenance,schema_version:1,fields,[nativeKey]:n.id!,header_native_reference:proof};
    const identity=JSON.stringify([entity,s.sourceKey]),position=JSON.stringify([s.sourceFileSha256,s.sheet,s.rowNo]),target=JSON.stringify([entity,n.id]);
    require(!identities.has(identity)&&!ids.has(s.id)&&!positions.has(position)&&!targets.has(target),'HISTORY_HEADER_REFERENCE_DUPLICATE');
    identities.add(identity);ids.add(s.id);positions.add(position);targets.add(target);
    const prepared={source:s,entity,nativeSnapshot:n,nativeId:n.id as string,nativeVersion:n.version as number,
      fingerprint:requestHash({selection,source:s,nativeSnapshot:n,fieldProvenance}),fieldProvenance};
    return {input,prepared};
  });
  return {batchId:first.batchId,fixedSourceNamespace:first.fixedSourceNamespace,mappingVersion:HISTORY_MAPPING_VERSION,selection:structuredClone(first.selection),rows};
}
export function validatePreparedHistoryHeaderNativeReferenceChunk(chunk:PreparedHistoryHeaderNativeReferenceChunk):void {
  const expected=prepareV3HistoryHeaderNativeReferenceChunk(chunk.rows.map(r=>r.input));
  require(chunk.batchId===expected.batchId&&chunk.fixedSourceNamespace===expected.fixedSourceNamespace&&chunk.mappingVersion===expected.mappingVersion
    &&requestHash(chunk.selection)===requestHash(expected.selection)&&requestHash(chunk.rows.map(r=>r.prepared))===requestHash(expected.rows.map(r=>r.prepared)),'HISTORY_HEADER_REFERENCE_PREPARED_CHANGED');
}
export async function stageV3HistoryHeaderNativeReferences(inputs:readonly HistoryHeaderNativeReferenceInput[],options:{mode?:'DRY_RUN'|'STAGE';store?:HistoryHeaderNativeReferenceStore;
  authorizeReferenceChunk?:(chunk:PreparedHistoryHeaderNativeReferenceChunk)=>Promise<void>}={}):Promise<{mode:'DRY_RUN'|'STAGE';rows:number;inserted:number;replayed:number;published:false;importReady:false}> {
  const chunk=prepareV3HistoryHeaderNativeReferenceChunk(inputs);
  if(options.mode===undefined||options.mode==='DRY_RUN')return {mode:'DRY_RUN',rows:chunk.rows.length,inserted:0,replayed:0,published:false,importReady:false};
  require(options.mode==='STAGE'&&options.store&&options.authorizeReferenceChunk,'HISTORY_HEADER_REFERENCE_EXPLICIT_AUTHORIZATION_REQUIRED');
  await options.authorizeReferenceChunk!(structuredClone(chunk));const result=await options.store!.stage(chunk);
  return {mode:'STAGE',rows:chunk.rows.length,...result,published:false,importReady:false};
}
