import { IMPORT_V2_TABLES } from './import-v2-contract.ts';
import { HISTORY_MAPPING_VERSION } from './history-storage-contract.ts';
import type { ImportSourceEvidence, JsonObject } from './history-storage-contract.ts';
import type { HeaderNativeBinding } from './import-v3-history-header.ts';
import { mapHistoryTemporal } from './history-temporal-mapping.ts';
import { requestHash } from './request-hash.ts';
export type HistoryHeaderNativeReferenceEntity = 'HALL'|'CUSTOMER'|'STAFF';
export interface HistoryHeaderNativeReferenceSelection {
  baseManifestSha256:string; selectionSha256:string; approvalSha256:string; entity:HistoryHeaderNativeReferenceEntity;
  source:'BASE_V2'; path:string; csvSha256:string;
}
export interface HistoryHeaderReferenceEnumMapping { raw:string; native:string|boolean; evidenceRef:string }
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

export function prepareV3HistoryHeaderNativeReferenceChunk(inputs:readonly HistoryHeaderNativeReferenceInput[]):PreparedHistoryHeaderNativeReferenceChunk {
  require(Array.isArray(inputs)&&inputs.length>0&&inputs.length<=HISTORY_HEADER_NATIVE_REFERENCE_CHUNK_LIMIT,'HISTORY_HEADER_REFERENCE_CHUNK_LIMIT');
  const cloned=structuredClone(inputs),first=cloned[0]!;
  require(new TextEncoder().encode(JSON.stringify(cloned)).byteLength<=4*1024*1024,'HISTORY_HEADER_REFERENCE_BYTE_LIMIT');
  const identities=new Set<string>(),ids=new Set<string>(),positions=new Set<string>(),targets=new Set<string>();
  const rows=cloned.map(input=>{
    const {source:s,selection,nativeSnapshot:n}=input,entity=selection.entity;
    const table=IMPORT_V2_TABLES.find(t=>t.entity===entity);
    require(['HALL','CUSTOMER','STAFF'].includes(entity)&&table&&selection.source==='BASE_V2'&&selection.path===table.file
      &&[selection.baseManifestSha256,selection.selectionSha256,selection.approvalSha256,selection.csvSha256].every(hash),'HISTORY_HEADER_REFERENCE_SELECTION');
    require(input.batchId===first.batchId&&input.fixedSourceNamespace===first.fixedSourceNamespace&&requestHash(selection)===requestHash(first.selection),'HISTORY_HEADER_REFERENCE_MIXED_BATCH');
    require(uuid(input.batchId)&&text(input.fixedSourceNamespace)&&s.batchId===input.batchId&&uuid(s.id)&&s.entityType===entity&&text(s.sourceKey)
      &&text(s.fileRef)&&text(s.sheet)&&typeof s.rowNo==='string'&&/^[1-9]\d*$/.test(s.rowNo)&&BigInt(s.rowNo)<=9223372036854775807n
      &&hash(s.sourceFileSha256)&&hash(s.rowSha256),'HISTORY_HEADER_REFERENCE_SOURCE');
    const raw=s.rawFields,v=s.normalizedFields;
    require(raw&&v&&Object.keys(v).length===table!.columns.length&&table!.columns.every(c=>Object.hasOwn(v,c.name)
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
    for(const c of table!.columns)fields[c.name]={origin:raw[c.name]===''?'UNKNOWN':'ORIGINAL',reason:raw[c.name]===''?'SOURCE_EMPTY':'SOURCE_PRESERVED',raw:raw[c.name]!};
    require(n&&Object.keys(n).length===columns[entity].length&&columns[entity].every(k=>Object.hasOwn(n,k))&&uuid(n.id)
      &&Number.isSafeInteger(n.version)&&(n.version as number)>0&&(n.version as number)<=2147483647&&text(n.name),'HISTORY_HEADER_REFERENCE_NATIVE_SNAPSHOT');
    const expectedEnums=entity==='STAFF'?['角色','任职状态']:['状态'];
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
      require(n.code===raw['原编码']&&text(n.code)&&n.name===raw['名称']&&typeof n.enabled==='boolean','HISTORY_HEADER_REFERENCE_NATIVE_FIELDS');enumValue('状态',n.enabled);
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
