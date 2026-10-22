/** Ordinary reviewed party source26. Account bootstrap metadata has a separate
 * private first-STAGE authority and cannot enter through this component reader. */
import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {join,resolve,dirname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareNativePartyImportChunk,validatePreparedNativePartyImportChunk,nativePartyStandaloneImportSource,NATIVE_PARTY_IMPORT_VERSION} from '../../packages/application/src/native-party-import.ts';
import {historyClosureProjectionRow26} from '../../packages/application/src/history-typed-closure.ts';
import {historyHeaderNativeReferenceEvidence} from '../../adapters/postgres/src/import-v3-history-header-native-reference-store.ts';
import {historySettlementRequestHash as checkedHash} from '../../packages/application/src/import-v3-history-settlement.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {openHistoricalCustomerSource} from './historical-customer-source.mjs';

const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value');});
const must=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const digest=b=>createHash('sha256').update(b).digest('hex'),same=(a,b)=>['dev','ino','size','mode','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);
const order=(a,b)=>Buffer.compare(Buffer.from(a.relation+'\0'+a.key),Buffer.from(b.relation+'\0'+b.key));
async function regular(path){must(typeof path==='string'&&isAbsolute(path),'PARTY_SOURCE26_PATH');let p=resolve(path),first=true;for(;;){const s=await lstat(p);must(!s.isSymbolicLink()&&(first?s.isFile():s.isDirectory()),'PARTY_SOURCE26_REGULAR');first=false;const parent=dirname(p);if(parent===p)return;p=parent;}}

export async function openReviewedPartySource26(options){
 must(exact(options,['binding','authorizedPayloadHash','source','historical','chunkRows']),'PARTY_SOURCE26_OPTIONS');
 checkedHash(options.binding);const o={...options,binding:structuredClone(options.binding)};
 must(exact(o.binding,['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'])&&uuid(o.binding.batchId)&&typeof o.binding.fixedSourceNamespace==='string'&&o.binding.fixedSourceNamespace.length>0&&typeof o.binding.cutoffAt==='string'&&hash(o.binding.selectionSha256)
  &&(o.authorizedPayloadHash===null||hash(o.authorizedPayloadHash))&&Number.isSafeInteger(o.chunkRows)&&o.chunkRows>0&&o.chunkRows<=100,'PARTY_SOURCE26_SCOPE');
 must(exact(o.source,['directory','trustedManifestSha256','reviewRecordFile','trustedReviewRecordSha256'])&&(o.historical===null||exact(o.historical,['sourceFile','candidateFile','reviewFile','contractFile','trustedReviewSha256'])),'PARTY_SOURCE26_ARTIFACT_OPTIONS');
 const source={...o.source},historicalOptions=o.historical===null?null:{...o.historical};
 must(typeof source.directory==='string'&&isAbsolute(source.directory),'PARTY_SOURCE26_PATH');
 let closed=false,historicalReader;const files=[],chunks=[],fingerprints=new Set(),inputs=new Map(),nativeIds=new Set(),sourceIds=new Set(),positions=new Set(),codes=new Set(),recordIds=new Set();
 const counts={HALL:0,WAREHOUSE:0,STAFF:0,CUSTOMER:0,SUPPLIER:0};
 const active=()=>must(!closed,'PARTY_SOURCE26_CLOSED');
 async function load(path,pin,limit){must(hash(pin),'PARTY_SOURCE26_OUTSIDE_PIN');await regular(path);const stat=await lstat(path);must(stat.size>0&&stat.size<=limit,'PARTY_SOURCE26_FILE_LIMIT');const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW),file={path,stat,fd};files.push(file);const bytes=await fd.readFile();must(bytes.length===stat.size&&digest(bytes)===pin&&same(stat,await fd.stat())&&same(stat,await lstat(path)),'PARTY_SOURCE26_FILE_CHANGED');return {value:JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes)),bytes:bytes.length};}
 async function verify(){active();for(const f of files){await regular(f.path);must(same(f.stat,await f.fd.stat())&&same(f.stat,await lstat(f.path)),'PARTY_SOURCE26_FILE_CHANGED');}if(historicalReader)await historicalReader.verify();active();}
 async function close(){closed=true;chunks.length=0;for(const m of [fingerprints,inputs,nativeIds,sourceIds,positions,codes,recordIds])m.clear();const errors=[];try{if(historicalReader)await historicalReader.close();}catch(e){errors.push(e);}for(const f of files)try{await f.fd.close();}catch(e){errors.push(e);}files.length=0;if(errors.length)throw new AggregateError(errors,'Party source26 close failed');}
 function add(input){
  const entity=input.source.entityType,key=JSON.stringify([entity,input.source.sourceKey]),position=JSON.stringify([input.source.sourceFileSha256,input.source.sheet,input.source.rowNo]);
  must(Object.hasOwn(counts,entity)&&input.batchId===o.binding.batchId&&input.source.batchId===o.binding.batchId&&input.fixedSourceNamespace===o.binding.fixedSourceNamespace&&input.selection.selectionSha256===o.binding.selectionSha256,'PARTY_SOURCE26_ROW_SCOPE');
  must(!Object.hasOwn(input.source.fieldProvenance?.fields??{},'bootstrap_accounts'),'PARTY_SOURCE26_BOOTSTRAP_NOT_COVERED');
  must(!inputs.has(key)&&!sourceIds.has(input.source.id)&&!nativeIds.has(input.nativeSnapshot.id)&&!positions.has(position),'PARTY_SOURCE26_GLOBAL_DUPLICATE');
  if(['CUSTOMER','SUPPLIER'].includes(entity)){const code=JSON.stringify([entity,input.nativeSnapshot.code]);must(!codes.has(code),'PARTY_SOURCE26_GLOBAL_DUPLICATE_CODE');codes.add(code);}
  if(entity==='WAREHOUSE'){must(input.warehouseRecord&&!recordIds.has(input.warehouseRecord.id),'PARTY_SOURCE26_GLOBAL_DUPLICATE_RECORD');recordIds.add(input.warehouseRecord.id);}
  prepareNativePartyImportChunk([input]);inputs.set(key,input);sourceIds.add(input.source.id);nativeIds.add(input.nativeSnapshot.id);positions.add(position);counts[entity]++;
 }
 function append(group){for(let i=0;i<group.length;i+=o.chunkRows){const chunk=prepareNativePartyImportChunk(group.slice(i,i+o.chunkRows));must(!fingerprints.has(chunk.fingerprint),'PARTY_SOURCE26_DUPLICATE_CHUNK');fingerprints.add(chunk.fingerprint);chunks.push(chunk);}}
 try{
  const manifest=await load(join(source.directory,'review-candidate-manifest.json'),source.trustedManifestSha256,4194304),m=manifest.value;
  const review=await load(source.reviewRecordFile,source.trustedReviewRecordSha256,4194304),a=review.value;
  const bound=v=>['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'].every(k=>v?.[k]===o.binding[k]);
  must(m.version==='NATIVE_BINDING_REVIEW_CANDIDATE_V1'&&bound(m)&&Array.isArray(m.files)&&Number.isSafeInteger(m.parties)&&m.parties>0&&m.parties<=10000,'PARTY_SOURCE26_MANIFEST');
  must(a.version==='C_NATIVE_BINDING_PARTIAL_REVIEW_PIN_V1'&&a.decision==='ACCEPT_EXACT_QB_REVIEWED_PARTIAL_ARTIFACT_SCOPE'&&bound(a.binding)&&a.manifestSha256===source.trustedManifestSha256&&a.manifestBytes===manifest.bytes&&a.closedToUnreviewedComponents===true&&a.realNativeCommandsOrImportAuthorizedByThisPinAlone===false&&Array.isArray(a.components),'PARTY_SOURCE26_COMPONENT_REVIEW');
  const selected=m.files.filter(f=>f.name==='party-reference-candidates.json'),accepted=a.components.filter(c=>c.component==='party-reference-candidates.json');
  must(selected.length===1&&accepted.length===1&&selected[0].sha256===accepted[0].sha256&&Number.isSafeInteger(selected[0].bytes)&&selected[0].bytes>0&&selected[0].bytes<=16777216,'PARTY_SOURCE26_COMPONENT_REVIEW');
  const component=await load(join(source.directory,'party-reference-candidates.json'),selected[0].sha256,16777216),ordinary=component.value;
  must(component.bytes===selected[0].bytes&&Array.isArray(ordinary)&&ordinary.length===m.parties,'PARTY_SOURCE26_COVERAGE');
  for(const original of ordinary){checkedHash(original);must(original.selection?.source==='BASE_V2'&&!Object.hasOwn(original,'schemaProfile'),'PARTY_SOURCE26_ORIGINAL_PROFILE');must(!Object.hasOwn(original.source?.fieldProvenance?.fields??{},'bootstrap_accounts'),'PARTY_SOURCE26_BOOTSTRAP_NOT_COVERED');prepareNativePartyImportChunk([original]);
   const input=structuredClone(original);input.schemaProfile='EXACT26';if(input.source.entityType==='WAREHOUSE')input.nativeSnapshot.created_operation_id=null;add(input);}
  let historicalCount=0;
  if(historicalOptions){const {batchId,fixedSourceNamespace,selectionSha256}=o.binding;historicalReader=await openHistoricalCustomerSource({...historicalOptions,binding:{batchId,fixedSourceNamespace,selectionSha256}});
   for await(const row of historicalReader.rows()){await historicalReader.authorizeRow(row);add({batchId,fixedSourceNamespace,schemaProfile:'EXACT26',selection:row.selection,source:row.source,nativeSnapshot:row.nativeSnapshot,bindings:{},enumMappings:{enabled:{raw:false,native:false,evidenceRef:historicalOptions.trustedReviewSha256}}});historicalCount++;}
   must(historicalCount===2,'PARTY_SOURCE26_HISTORICAL_COVERAGE');}
  // All relationships resolve inside the full accepted party set. Keep the
  // hall/warehouse cycle in one transaction, regardless of ordinary chunk size.
  const targets={HALL:{'默认客户来源编号':'CUSTOMER','默认销货仓来源编号':'WAREHOUSE'},WAREHOUSE:{'所属厅来源编号':'HALL'},STAFF:{'所属厅来源编号':'HALL'},CUSTOMER:{},SUPPLIER:{}};
  for(const input of inputs.values())for(const [field,binding]of Object.entries(input.bindings)){const target=targets[input.source.entityType]?.[field],row=inputs.get(JSON.stringify([target,binding?.sourceKey]));must(row&&row.nativeSnapshot.id===binding.nativeId,'PARTY_SOURCE26_RELATION');}
  const all=[...inputs.values()];for(const entity of ['CUSTOMER','SUPPLIER']){append(all.filter(r=>r.source.entityType===entity&&r.selection.source==='BASE_V2'));}
  append(all.filter(r=>r.selection.source==='HISTORICAL_CUSTOMER_SUPPLEMENT_V1'));
  const hallWarehouse=all.filter(r=>['HALL','WAREHOUSE'].includes(r.source.entityType));must(hallWarehouse.length<=100,'PARTY_SOURCE26_ATOMIC_BOUND');
  if(hallWarehouse.length){const chunk=prepareNativePartyImportChunk(hallWarehouse);must(!fingerprints.has(chunk.fingerprint),'PARTY_SOURCE26_DUPLICATE_CHUNK');chunks.push(chunk);fingerprints.add(chunk.fingerprint);}
  append(all.filter(r=>r.source.entityType==='STAFF'));must(chunks.reduce((n,c)=>n+c.rows.length,0)===ordinary.length+historicalCount,'PARTY_SOURCE26_COVERAGE');await verify();
  return {report:Object.freeze({kind:'REVIEWED_ORDINARY_PARTY_SOURCE26_REFERENCE_ONLY_V1',ordinaryParties:ordinary.length,historicalCustomers:historicalCount,rows:inputs.size,counts:Object.freeze({...counts}),chunks:chunks.length,bootstrapAccountsCovered:false,executionAuthorized:false,newNativeUUIDs:0,noSql:true}),verify,
   async *chunks(){await verify();for(const chunk of chunks){active();yield structuredClone(chunk);}await verify();},
   async authorize(input){active();const before=checkedHash(input),chunk=structuredClone(input);validatePreparedNativePartyImportChunk(chunk);must(fingerprints.has(chunk.fingerprint),'PARTY_SOURCE26_NOT_AUTHORIZED');for(const row of chunk.rows){const expected=inputs.get(JSON.stringify([row.entity,row.input.source.sourceKey]));must(expected&&requestHash(expected)===requestHash(row.input),'PARTY_SOURCE26_ROW_CHANGED');}await verify();must(checkedHash(input)===before,'PARTY_SOURCE26_INPUT_CHANGED');},
   async openClosure(scope,context){checkedHash(scope);const s=structuredClone(scope);await verify();must(context?.group==='PARTIES'&&!context.signal?.aborted&&s.batchId===o.binding.batchId&&s.fixedSourceNamespace===o.binding.fixedSourceNamespace&&s.selectionSha256===o.binding.selectionSha256&&hash(o.authorizedPayloadHash)&&s.authorizedPayloadHash===o.authorizedPayloadHash,'PARTY_SOURCE26_CLOSURE_SCOPE');
    let sessionClosed=false;const current=()=>{active();must(!sessionClosed&&!context.signal?.aborted,'PARTY_SOURCE26_CLOSED');},sourceRows=[],typedRows=[];
    for(const chunk of chunks)for(const row of chunk.rows){const original=row.headerReference?historyHeaderNativeReferenceEvidence(row.headerReference,0):{source:nativePartyStandaloneImportSource(row)};sourceRows.push(historyClosureProjectionRow26('import_source_row',original.source));
     if(original.reference)typedRows.push(historyClosureProjectionRow26('import_header_native_reference',original.reference));
     const intent={batch_id:o.binding.batchId,source_row_id:row.input.source.id,entity_type:row.entity,source_key:row.input.source.sourceKey,native_id:row.nativeId,native_snapshot:row.nativeSnapshot,source_snapshot:original.source,selection:row.input.selection,warehouse_record:row.input.warehouseRecord??null,authorization:row.authorization,row_fingerprint:row.fingerprint,validator_version:NATIVE_PARTY_IMPORT_VERSION};
     for(const [entity,column]of [['HALL','native_hall_id'],['WAREHOUSE','native_warehouse_id'],['STAFF','native_staff_id'],['CUSTOMER','native_customer_id'],['SUPPLIER','native_supplier_id']])intent[column]=row.entity===entity?row.nativeId:null;
     typedRows.push(historyClosureProjectionRow26('native_party_import_evidence',intent),historyClosureProjectionRow26(row.entity.toLowerCase(),row.nativeSnapshot));}
    sourceRows.sort(order);typedRows.sort(order);return {async verify(){current();await verify();current();},async *sourceRows(){for(const row of sourceRows){current();yield structuredClone(row);}},async *typedRows(){for(const row of typedRows){current();yield structuredClone(row);}},async *documents(){current();},async close(){sessionClosed=true;sourceRows.length=0;typedRows.length=0;}};
   },close};
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Party source26 construction and cleanup failed');}throw error;}
}
