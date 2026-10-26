/** Concrete all11 composition for the original source host. No SQL, mapping,
 * source recapture, native ID allocation or executable authority is invented. */
import {readFile,lstat,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isAbsolute,resolve,dirname} from 'node:path';
import {createReadStream} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {historySettlementRequestHash as capture} from '../../packages/application/src/import-v3-history-settlement.ts';
import {prepareHistorySettlementChunk} from '../../packages/application/src/import-v3-history-settlement.ts';
import {prepareHistorySalesDetailChunk} from '../../packages/application/src/import-v3-history-sales-detail.ts';
import {prepareNativePartyImportChunk} from '../../packages/application/src/native-party-import.ts';
import {openReviewedPartySource26} from './native-party-source26.mjs';
import {openReviewedCatalogueSource26} from './native-source-authorizers.mjs';
import {openReviewedProductSource26} from './native-product-source26.mjs';
import {openReviewedSkuSource26} from './native-sku-source26.mjs';
import {openReviewedStockSource26} from './native-stock-source26.mjs';
import {openReviewedPaymentSource26} from './native-payment-source26.mjs';
import {openReviewedTransferLineSource26,capturedTransferLineRows26,transferLineSourceEvidence26} from './native-transfer-line-source26.mjs';
import {openCapturedSalesSettlementSource} from '../import-v2/authorized-sales-detail-reader.mjs';
import {openAuthorizedHistoryClosureReader26,HISTORY_CLOSURE_SOURCE_GROUPS} from '../import-v2/authorized-history-closure-reader.mjs';
import {readCoreImportContinuation26} from './run.mjs';
import {prepareFullPayloadData26,prepareFullSourceBindings26,writeFullSourceBindings26} from './prepare-native-bindings.mjs';
import {validateExecutableSourceHostJob26} from './production-source-host.mjs';
import {validateCutoffImportCommand,stableImportId} from '../../packages/application/src/inventory-cutoff-import.ts';
import {captureHistoryTypedClosurePlan} from '../../packages/application/src/history-typed-publication.ts';
import {openReviewedProductEvidenceSource} from './native-source-authorizers.mjs';
import {createPostgresHistorySalesDetailBindingResolver26} from '../../adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts';
import {createPostgresHistorySettlementBindingResolver26} from '../../adapters/postgres/src/import-v3-history-settlement-staging-store.ts';
import {validatePreparedNativeBarcode,nativeBarcodeSourceEvidence,validateNativeBarcodeSchemeInitializationRows26} from '../../packages/application/src/native-barcode-import.ts';
import {prepareV3HistoryChunk,validatePreparedHistoryChunk} from '../../packages/application/src/import-v3-history-staging.ts';
import {prepareV3HistoryHeaderChunk,validatePreparedHistoryHeaderChunk} from '../../packages/application/src/import-v3-history-header-staging.ts';
import {transferHeaderProjection26} from './native-transfer-header-source26.mjs';
import {parseV2Csv,v2MoneyApprovalSet} from '../../packages/application/src/import-v2.ts';
import {encodeHistoryClosureValue} from '../../packages/application/src/history-typed-closure.ts';
import {nativeProductImportEvidences26} from '../../packages/application/src/native-product-import.ts';
import {validatePreparedNativeSkuImport26,nativeSkuAliasEvidence26} from '../../packages/application/src/native-sku-import.ts';
import {validatePreparedNativeStockGroup,nativeStockSourceEvidence,nativeStockPublicationContributor26} from '../../packages/application/src/native-stock-contributor-import.ts';
import {historyClosureProjectionRow26,historyClosureRowHash} from '../../packages/application/src/history-typed-closure.ts';

const RETAINED_HEADER_HELPERS={'sales-header-closure-session-20261026.mjs': 'c708c30c8329a6e9c68d473d5154b4ea981d23f71a6580c814ce1dec109e1772', 'prepare-retained-sales-header-window-20261026.mjs': '89c6149ed32c02fd3e41e41f372e864d16fcd5b4864f6be4a16ff57d02bdcd1c', 'prepare-retained-transfer-header-window-20261025-v2.mjs': 'aaea814af3db254c4801a7e07cadef7ddefd056d2b2f56f0a11c09c38ae70eac'};
const RETAINED_NATIVE_HELPER_SHA256='6f87f87f5acbeee6930924cc13073b54194d7301d113421ec381009334f65b22';
export const providerVersion='NATIVE_IMPORT_PRODUCTION_PROVIDERS_26_V1';
export const sourceGroups=Object.freeze([...HISTORY_CLOSURE_SOURCE_GROUPS]);
const must=(ok,code,group)=>{if(!ok)throw Object.assign(Error(code),{code,...(group?{group}:{})});};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function own(value,key){const d=Object.getOwnPropertyDescriptor(value??{},key);must(d?.enumerable&&Object.hasOwn(d,'value'),'PRODUCTION_PROVIDER26_OWN_INPUT');return d.value;}
function methods(value,names){return Object.fromEntries(names.map(key=>{const fn=own(value,key);must(typeof fn==='function','PRODUCTION_PROVIDER26_CAPABILITY_REQUIRED');return[key,fn.bind(value)];}));}
const recipeOpeners=Object.freeze({PARTIES:openReviewedPartySource26,CATALOGUE:openReviewedCatalogueSource26,PRODUCTS:openReviewedProductSource26,
 SKUS:openReviewedSkuSource26,STOCK_CONTRIBUTORS:openReviewedStockSource26,PAYMENT:openReviewedPaymentSource26,TRANSFER_LINES:openReviewedTransferLineSource26});
const stages=Object.freeze({PARTIES:['PARTY','chunks'],CATALOGUE:['CATALOGUE','chunks'],PRODUCTS:['PRODUCT','chunks'],SKUS:['SKU','rows'],
 BARCODES:['BARCODE','rows'],STOCK_CONTRIBUTORS:['STOCK_CONTRIBUTOR','groups'],PAYMENT:['PAYMENT','chunks'],HEADERS:['HEADER','chunks'],
 SALES_DETAILS:['SALES_DETAIL','chunks'],SETTLEMENTS:['SETTLEMENT','chunks'],TRANSFER_LINES:['TRANSFER_LINES','chunks']});
const same=(a,b)=>['dev','ino','mode','size','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);
/** A signed finite logical-file map changes IO location only. Identity is the
 * exact original logical path AND original bytes/SHA, not basename/prefix. */
export function sourceFileResolver26(recipe){
 if(!Object.hasOwn(recipe,'fileLocations'))return undefined;
 capture(recipe.fileLocations);const entries=structuredClone(recipe.fileLocations),byPath=new Map();
 must(Array.isArray(entries),'PRODUCTION_FILE_LOCATION26_SHAPE');
 for(const entry of entries){const l=entry.logical,p=entry.physical;must(typeof l?.path==='string'&&isAbsolute(l.path)&&Number.isSafeInteger(l.bytes)&&l.bytes>0&&hash(l.sha256)&&!byPath.has(l.path),'PRODUCTION_FILE_LOCATION26_LOGICAL');
  must(p===null||p&&typeof p.path==='string'&&isAbsolute(p.path)&&p.bytes===l.bytes&&p.sha256===l.sha256,'PRODUCTION_FILE_LOCATION26_IDENTITY');byPath.set(l.path,entry);}
 return async ref=>{must(typeof ref?.path==='string'&&hash(ref.sha256),'PRODUCTION_FILE_LOCATION26_REQUEST');const e=byPath.get(ref.path);
  must(e&&e.logical.sha256===ref.sha256&&(ref.bytes===undefined||ref.bytes===e.logical.bytes),'PRODUCTION_FILE_LOCATION26_NOT_LISTED');
  must(e.physical!==null,'PRODUCTION_FILE_LOCATION26_UNAVAILABLE');return structuredClone(e.physical);};
}
async function pinnedSmall(path,pin,resolveFile){
 must(typeof path==='string'&&isAbsolute(path)&&hash(pin),'PRODUCTION_PROVIDER26_OUTSIDE_PIN');
 const physical=resolveFile?await resolveFile({path,sha256:pin}):{path};
 const before=await lstat(physical.path);must(before.isFile()&&!before.isSymbolicLink()&&before.size<=4194304&&(physical.bytes===undefined||before.size===physical.bytes),'PRODUCTION_PROVIDER26_INPUT_FILE');
 const bytes=await readFile(physical.path);must(bytes.length===before.size&&same(before,await lstat(physical.path))&&createHash('sha256').update(bytes).digest('hex')===pin,'PRODUCTION_PROVIDER26_INPUT_CHANGED');
 return bytes;
}
/** Select only the uncommitted suffix of C's original complete command chain.
 * progress is the original locked adapter readback, never a count-only shortcut.
 * No receipt, checkpoint, request key or command body is created or rewritten. */
export function selectProductionContinuation26({binding,commands,progress}){
 capture({binding,commands,progress});const original=structuredClone(commands),p=structuredClone(progress);
 must(Array.isArray(original)&&original.length>=3&&p.actorAccountId===binding.actorAccountId&&p.fixedSourceNamespace===binding.fixedSourceNamespace
  &&p.selectionSha256===binding.selectionSha256&&Array.isArray(p.committedOperations)&&Array.isArray(p.claims)&&Array.isArray(p.records)
  &&Array.isArray(p.coreClaims)&&p.coreClaims.length===22&&Array.isArray(p.coreWarehouses)&&p.coreWarehouses.length===22,'PRODUCTION_CONTINUATION26_PROOF_REQUIRED');
 const first=original[0],last=original.at(-1);must(first.action==='IMPORT_BIND_FULL_SOURCE'&&last.action==='IMPORT_PUBLISH'&&original.slice(1,-1).every(c=>c.action==='IMPORT_CHUNK'),'PRODUCTION_CONTINUATION26_COMMAND_CHAIN');
 const targets=['WAREHOUSE','SKU','INVENTORY_LEDGER','IMPORT_BATCH'],birth={sequence:1,cursor:22,counts:{WAREHOUSE:22,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0},expected:{}};
 let checkpoint=birth,prefix=0,bound=false;const used=new Set(p.coreClaims.map(c=>c.importRecordId)),recordMap=new Map(p.records.map(r=>[r.importRecordId,r]));
 must(used.size===22&&recordMap.size===p.records.length&&p.records.length===p.claims.length&&p.coreClaims.every(c=>p.claims.some(x=>capture(x)===capture(c))),'PRODUCTION_CONTINUATION26_CLAIM_SCOPE');
 for(const op of p.committedOperations){
  must(capture(op.beforeCheckpoint)===capture(checkpoint)&&op.checkpoint.sequence===checkpoint.sequence+1,'PRODUCTION_CONTINUATION26_CHAIN_GAP');
  const owned=p.claims.filter(c=>c.operationId===op.operationId);
  if(op.action==='IMPORT_INITIALIZE_BARCODE_SCHEMES'){
   must(!bound&&owned.length===0&&op.checkpoint.cursor===checkpoint.cursor&&capture(op.checkpoint.counts)===capture(checkpoint.counts)&&capture(op.checkpoint.expected)===capture(checkpoint.expected),'PRODUCTION_CONTINUATION26_INITIALIZATION_ORDER');checkpoint=op.checkpoint;continue;
  }
  const command=original[prefix];must(command&&op.action===command.action&&op.requestKey===command.requestKey&&op.requestHash===requestHash(command)
   &&op.operationId===stableImportId('operation',binding.actorAccountId,command.requestKey)&&command.actorAccountId===binding.actorAccountId&&command.batchId===binding.batchId
   &&command.expectedSequence===checkpoint.sequence&&command.expectedCursor===checkpoint.cursor,'PRODUCTION_CONTINUATION26_PREFIX_CONFLICT');
  const nextCounts={...checkpoint.counts};let expected=checkpoint.expected;
  if(command.action==='IMPORT_BIND_FULL_SOURCE'){
   must(!bound&&owned.length===0&&capture(p.fullBinding)===capture(command.fullBinding),'PRODUCTION_CONTINUATION26_BINDING_CONFLICT');bound=true;expected=command.fullBinding.inventoryExpectedCounts;
  }else if(command.action==='IMPORT_CHUNK'){
   must(bound&&owned.length===command.items.length,'PRODUCTION_CONTINUATION26_CLAIM_SCOPE');
   for(const item of command.items){const ledger=item.targetType==='INVENTORY_LEDGER',recordId=ledger?stableImportId('source',binding.fixedSourceNamespace,item.sourceEntityType,item.sourceKey):item.nativeRecord?.id,
     targetId=ledger?stableImportId('baseline',binding.fixedSourceNamespace,item.sourceEntityType,item.sourceKey):item.targetId,claim=owned.find(c=>c.importRecordId===recordId),record=recordMap.get(recordId);
    must(claim&&record&&!used.has(recordId)&&claim.targetType===item.targetType&&claim.targetId===targetId&&claim.checkpointSequence===op.checkpoint.sequence
     &&record.targetType===item.targetType&&record.targetId===targetId&&record.sourceEntityType===item.sourceEntityType&&record.sourceKey===item.sourceKey
     &&record.sourceRecordHash===item.sourceRecordHash&&record.sourceFileRef===item.sourceFileRef,'PRODUCTION_CONTINUATION26_ITEM_CONFLICT');used.add(recordId);nextCounts[item.targetType]++;
   }
  }else{
   must(bound&&prefix===original.length-1&&owned.length===1&&owned[0].targetType==='IMPORT_BATCH'&&owned[0].targetId===binding.batchId
    &&owned[0].checkpointSequence===op.checkpoint.sequence&&!used.has(owned[0].importRecordId),'PRODUCTION_CONTINUATION26_PUBLICATION_CONFLICT');
   used.add(owned[0].importRecordId);nextCounts.IMPORT_BATCH++;
  }
  const after={sequence:checkpoint.sequence+1,cursor:checkpoint.cursor+owned.length,counts:nextCounts,expected};
  must(capture(op.checkpoint)===capture(after)&&op.result.operationId===op.operationId&&op.result.batchId===binding.batchId&&op.result.sequence===after.sequence&&op.result.cursor===after.cursor,'PRODUCTION_CONTINUATION26_RESULT_CONFLICT');
  checkpoint=after;prefix++;
 }
 must(capture(checkpoint)===capture(p.checkpoint)&&used.size===p.claims.length&&p.claims.length===checkpoint.cursor
  &&targets.every(t=>p.claims.filter(c=>c.targetType===t).length===checkpoint.counts[t])&&bound===(p.fullBinding!==null),'PRODUCTION_CONTINUATION26_CURRENT_CHECKPOINT');
 const imported=prefix===original.length;must((p.status==='IMPORTED')===imported,'PRODUCTION_CONTINUATION26_PUBLICATION_CONFLICT');
 const remaining=original.slice(prefix);if(remaining.length)must(remaining[0].expectedSequence===checkpoint.sequence&&remaining[0].expectedCursor===checkpoint.cursor,'PRODUCTION_CONTINUATION26_CURRENT_CHECKPOINT');
 return{remaining,prefix,imported,result:imported?structuredClone(p.committedOperations.at(-1).result):null};
}
/** Only already-claimed native memberships have a current original target/
 * source/record proof here. Other STAGE rows are deliberately not guessed from
 * a count or discarded from the full closure. Call after genuine authorization. */
export function unclaimedNativeStage26({group,payload,progress}){
 if(!['PARTIES','SKUS'].includes(group))return payload;
 const records=progress.records??[],prove=(source,targetType,targetId,record)=>{
  const found=records.find(r=>r.importRecordId===record?.id||r.sourceEntityType===targetType&&r.sourceKey===source.sourceKey);
  if(!found)return false;
  must(record&&found.importRecordId===record.id&&found.targetType===targetType&&found.targetId===targetId
   &&found.sourceEntityType===source.entityType&&found.sourceKey===source.sourceKey&&found.sourceRecordHash===source.rowSha256&&found.sourceFileRef===source.fileRef,
   'PRODUCTION_CONTINUATION26_STAGE_CONTENT_CONFLICT');
  if(targetType==='WAREHOUSE')must(progress.warehouses.some(w=>w.targetId===targetId&&capture(w.nativeRecord)===capture(record)),'PRODUCTION_CONTINUATION26_STAGE_CONTENT_CONFLICT');
  return true;
 };
 if(group==='SKUS')return records.some(r=>r.targetType==='SKU')&&prove(payload.canonicalSource,'SKU',payload.nativeSku.id,payload.importRecord)?null:payload;
 const rows=payload.rows.filter(row=>row.entity!=='WAREHOUSE'||!prove(row.input.source,'WAREHOUSE',row.nativeId,row.input.warehouseRecord));
 return rows.length===payload.rows.length?payload:rows.length?prepareNativePartyImportChunk(rows.map(row=>row.input)):null;
}
/** Inputs are DATA only. Authority is separately supplied reviewed executable
 * code, never derived from the input/CORE/source manifest's own checksum.
 * RETAINED recipes consume already captured prepared/closure rows under that
 * authority; REVIEWED recipes invoke the actual original readers below. */
export function createProductionSourceProvider26(inputs,authority){return createOriginalProductionSources26(inputs,{authority});}
function createOriginalProductionSources26(inputs,{authority,sourcePreparation}){
 capture(inputs);const fixed=structuredClone(inputs),inputDigest=capture(fixed);
 const a=sourcePreparation?null:methods(authority,['verifyInputs','assertGroupAllowed','assertExecutionAllowed','authorizeStep','assertAllowed','authorizeNativeCommand',
  'openRetained','capturedOptions','openRetainedClosure','coreProjection','mainCommands','authorizeProductSource','close','now']);
 must(fixed.version==='PRODUCTION_SOURCE_PROVIDER26_INPUT_V1'&&fixed.binding?.phase==='FULL_SOURCE_CONTINUATION_26_V1'
  &&(sourcePreparation?fixed.binding.authorizedPayloadHash===null||hash(fixed.binding.authorizedPayloadHash):hash(fixed.binding.authorizedPayloadHash))&&hash(fixed.binding.coreSourceDigest)&&fixed.binding.authorizedPayloadHash!==fixed.binding.coreSourceDigest,
  'PRODUCTION_PROVIDER26_FULL_BINDING_REQUIRED');
 must(fixed.core?.receiptId===fixed.binding.coreReceiptId&&fixed.core?.coreSourceDigest===fixed.binding.coreSourceDigest,
  'PRODUCTION_PROVIDER26_CORE_RECEIPT_REQUIRED');
 for(const group of sourceGroups){const r=own(fixed.producers,group);must(r&&['REVIEWED','RETAINED','CAPTURED_C144'].includes(r.mode),'PRODUCTION_PROVIDER26_GROUP_REQUIRED',group);
  if(r.mode==='REVIEWED')must(Object.hasOwn(recipeOpeners,group),'PRODUCTION_PROVIDER26_RETAINED_GROUP_REQUIRED',group);
  if(r.mode==='CAPTURED_C144')must(['SALES_DETAILS','SETTLEMENTS'].includes(group),'PRODUCTION_PROVIDER26_CAPTURED_GROUP',group);}
 must(Reflect.ownKeys(fixed.producers).length===sourceGroups.length,'PRODUCTION_PROVIDER26_GROUP_REQUIRED');
 let opened=false,warehouseItems=sourcePreparation?structuredClone(sourcePreparation.warehouses):fixed.warehouses;
 return Object.freeze({providerVersion,sourceGroups,async openSourceSession({binding,sources,database,signal}){
  must(!opened,'PRODUCTION_PROVIDER26_SESSION_ALREADY_OPEN');opened=true;
  must(signal instanceof AbortSignal&&!signal.aborted&&requestHash(binding)===requestHash(fixed.binding),'PRODUCTION_PROVIDER26_BINDING_CHANGED');
  must(sourcePreparation?database===undefined:typeof database?.ready==='function','PRODUCTION_PROVIDER26_ORIGINAL_DATABASE_REQUIRED');binding=structuredClone(binding);
  let closed=false,closing,closure,preflightDone=false,stepsStarted=false;const readers=new Map(),disposers=[],issued=new Set(),coreSourceIds=new Set();
  const active=()=>must(!closed&&!signal.aborted,'PRODUCTION_PROVIDER26_CLOSED');
  const checked=async(fn,...args)=>{active();must(await fn(...args)===undefined,'PRODUCTION_PROVIDER26_AUTHORITY_RESULT');active();};
  async function close(){if(closing)return closing;closed=true;closing=(async()=>{const errors=[];
   for(const dispose of [...disposers].reverse())try{await dispose();}catch(error){errors.push(error);}
   try{if(a)await a.close();else await sourcePreparation.close();}catch(error){errors.push(error);}readers.clear();issued.clear();if(errors.length)throw new AggregateError(errors,'Production provider26 cleanup failed');})();return closing;}
  async function verify(){active();if(a)await checked(a.verifyInputs,{inputDigest,binding:structuredClone(binding),core:structuredClone(fixed.core)});else{await sourcePreparation.verify();active();}}
  const context={binding:structuredClone(binding),sources:structuredClone(sources),signal,database};
  async function retainedBarcodeReader(recipe){
   // A real file reader under the original group/step authority. It does not
   // issue a grant, allocate an identity, or open the raw source snapshot.
   let ended=false,closingSource,rowsStarted=false,closureStarted=false,closureReader,closureSignal;
   const files=[],members=new Map(),ranges=new Map();let records,manifest,permutations,preparedFile;
   const current=()=>{active();must(!ended,'PRODUCTION_BARCODE26_CLOSED');};
   async function closeSource(){if(closingSource)return closingSource;ended=true;closingSource=(async()=>{
    const errors=[];if(closureReader)try{await closureReader.close();}catch(error){errors.push(error);}
    for(const file of [...files].reverse())try{await file.fd.close();}catch(error){errors.push(error);}
    files.length=0;members.clear();ranges.clear();if(records)records.length=0;
    records=undefined;manifest=undefined;permutations=undefined;preparedFile=undefined;
    if(errors.length)throw new AggregateError(errors,'Retained barcode source cleanup failed');
   })();return closingSource;}
   // Register before the first async open. A late FileHandle is closed before
   // registration if the original owner closed or cancelled during that open.
   disposers.push(closeSource);
   const descriptor=(ref,maximum)=>must(ref&&Object.getPrototypeOf(ref)===Object.prototype
    &&Reflect.ownKeys(ref).length===3&&['path','bytes','sha256'].every(k=>Object.hasOwn(ref,k))
    &&typeof ref.path==='string'&&isAbsolute(ref.path)&&Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&ref.bytes<=maximum&&hash(ref.sha256),'PRODUCTION_BARCODE26_FILE_DESCRIPTOR');
   async function regular(path){let p=resolve(path),leaf=true;for(;;){current();const st=await lstat(p);current();
    must(!st.isSymbolicLink()&&(leaf?st.isFile():st.isDirectory()),'PRODUCTION_BARCODE26_FILE_PATH');leaf=false;
    const parent=dirname(p);if(parent===p)return;p=parent;}}
   async function hold(ref,maximum){descriptor(ref,maximum);const locate=sourceFileResolver26(recipe);if(locate)ref=await locate(ref);current();await regular(ref.path);current();const before=await lstat(ref.path);current();
    must(before.size===ref.bytes,'PRODUCTION_BARCODE26_FILE_SIZE');
    const fd=await open(ref.path,constants.O_RDONLY|constants.O_NOFOLLOW);
    if(ended||closed||signal.aborted){await fd.close();current();}
    const file={fd,path:ref.path,stat:before};files.push(file);
    const actual=await fd.stat();current();must(same(before,actual)&&same(before,await lstat(ref.path)),'PRODUCTION_BARCODE26_FILE_CHANGED');current();return file;
   }
   async function verifyFiles(){current();for(const file of files){
    const fdStat=await file.fd.stat();current();const pathStat=await lstat(file.path);current();
    must(pathStat.isFile()&&!pathStat.isSymbolicLink()&&same(file.stat,fdStat)&&same(file.stat,pathStat),'PRODUCTION_BARCODE26_FILE_CHANGED');}}
   async function metadata(ref,maximum){const file=await hold(ref,maximum),bytes=await file.fd.readFile();current();
    must(bytes.length===ref.bytes&&createHash('sha256').update(bytes).digest('hex')===ref.sha256,'PRODUCTION_BARCODE26_METADATA_CHANGED');
    await verifyFiles();return bytes;}
   async function verifySource(){current();await verify();await verifyFiles();current();}
   function checkPrepared(row,entry){
    current();validatePreparedNativeBarcode(row);
    must(row.batchId===binding.batchId&&row.fixedSourceNamespace===binding.fixedSourceNamespace&&row.selection.selectionSha256===binding.selectionSha256
     &&row.fingerprint===entry.prepared.fingerprint&&row.source.id===entry.sourceRowId&&row.source.sourceKey===entry.sourceKey
     &&row.nativeBarcodeId===entry.nativeBarcodeId&&row.source.rowSha256===entry.original.sha256,'PRODUCTION_BARCODE26_MEMBERSHIP');
    const scheme=permutations.schemes.rows.find(s=>s.native.id===row.scheme.id);
    must(scheme&&capture(scheme.native)===capture(row.scheme.snapshot),'PRODUCTION_BARCODE26_SCHEME');
    for(const [actual,expected]of [[historyClosureProjectionRow26('import_source_row',nativeBarcodeSourceEvidence(row)),entry.source],
      [historyClosureProjectionRow26('sku_barcode',row.nativeBarcode),entry.typed]])
     must(actual.relation===expected.relation&&actual.key===expected.key&&historyClosureRowHash(actual)===expected.sha256,'PRODUCTION_BARCODE26_PROJECTION_CHANGED');
   }
   async function readRecord(ref){
    current();const entry=ranges.get(ref.offset);
    must(ref.file==='prepared'&&entry&&ref.bytes===entry.prepared.bytes&&ref.sha256===entry.prepared.sha256,'PRODUCTION_BARCODE26_RANGE');
    const bytes=Buffer.allocUnsafe(ref.bytes);let position=0;
    while(position<bytes.length){current();const result=await preparedFile.fd.read(bytes,position,bytes.length-position,ref.offset+position);current();
     must(result.bytesRead>0,'PRODUCTION_BARCODE26_SHORT_READ');position+=result.bytesRead;}
    must(bytes[bytes.length-1]===10&&createHash('sha256').update(bytes).digest('hex')===ref.sha256,'PRODUCTION_BARCODE26_RANGE_CHANGED');
    const row=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes.subarray(0,-1)));current();return row;
   }
   try{
    descriptor(recipe.closureHelper,4194304);
    must(recipe.closureHelper.bytes===14592&&recipe.closureHelper.sha256===RETAINED_NATIVE_HELPER_SHA256,'PRODUCTION_BARCODE26_HELPER_PIN');
    const helperBytes=await pinnedSmall(recipe.closureHelper.path,recipe.closureHelper.sha256,sourceFileResolver26(recipe));current();must(helperBytes.length===recipe.closureHelper.bytes,'PRODUCTION_BARCODE26_HELPER_PIN');
    const helper=await import(pathToFileURL((await sourceFileResolver26(recipe)?.(recipe.closureHelper)??recipe.closureHelper).path).href);current();const makeClosure=own(helper,'createRetainedNativeClosureSession26');
    must(typeof makeClosure==='function','PRODUCTION_BARCODE26_HELPER_PIN');
    manifest=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await metadata(recipe.descriptor,4194304)));current();
    must(manifest.version==='ORIGINAL_BARCODE15018_APPROVED_SOURCE_CAPTURE_26_V1'&&Number.isSafeInteger(manifest.selectedRows)&&manifest.selectedRows>0&&manifest.selectedRows<=15018
     &&manifest.selectedRows===fixed.closureScope.expectedSourceEntityCounts.BARCODE&&manifest.selectedRows===fixed.closureScope.expectedCounts.barcodes
     &&manifest.summary?.rows===manifest.selectedRows&&capture(manifest.binding)===capture(Object.fromEntries(['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'].map(k=>[k,binding[k]]))),'PRODUCTION_BARCODE26_CAPTURE_BINDING');
    const indexBytes=await metadata(manifest.artifacts.index,64*1024*1024);current();records=[];let start=0;
    while(start<indexBytes.length){const end=indexBytes.indexOf(10,start);must(end>start&&end-start<=4194304,'PRODUCTION_BARCODE26_INDEX_LINE');
     records.push(JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(indexBytes.subarray(start,end))));start=end+1;
     must(records.length<=manifest.selectedRows,'PRODUCTION_BARCODE26_INDEX_COUNT');}
    must(records.length===manifest.selectedRows,'PRODUCTION_BARCODE26_INDEX_COUNT');
    permutations=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await metadata(manifest.artifacts.permutations,4194304)));current();
    const original={historyClosureProjectionRow26,historyClosureRowHash,historySettlementRequestHash:capture,validatePreparedNativeBarcode,nativeBarcodeSourceEvidence,validateNativeBarcodeSchemeInitializationRows26};
    // Construct now to validate the exact approved index/order/schema before
    // opening the prepared body. It does not read any prepared range yet.
    closureReader=makeClosure({original,index:{...manifest,records,permutations},readRecord,verify:verifySource,close:async()=>{},current:()=>{current();must(!closureSignal?.aborted,'PRODUCTION_BARCODE26_CLOSED');}});
    for(const entry of records){must(!members.has(entry.sourceRowId),'PRODUCTION_BARCODE26_MEMBERSHIP');members.set(entry.sourceRowId,entry);ranges.set(entry.prepared.offset,entry);}
    preparedFile=await hold(manifest.artifacts.prepared,manifest.selectedRows*4194304);current();await verifySource();
    return{verify:verifySource,async authorize(row){current();capture(row);const entry=members.get(row?.source?.id);must(entry,'PRODUCTION_BARCODE26_MEMBERSHIP');checkPrepared(row,entry);await verifySource();},
     async *rows(){current();must(!rowsStarted,'PRODUCTION_BARCODE26_SINGLE_ROWS');rowsStarted=true;await verifySource();
      for(const entry of records){const row=await readRecord({file:'prepared',offset:entry.prepared.offset,bytes:entry.prepared.bytes,sha256:entry.prepared.sha256});current();checkPrepared(row,entry);yield row;current();}await verifySource();},
     async openClosure(scope,ctx){current();must(!closureStarted&&capture(scope)===capture(fixed.closureScope)&&ctx?.group==='BARCODES'&&ctx.signal instanceof AbortSignal&&!ctx.signal.aborted,'PRODUCTION_BARCODE26_CLOSURE_SCOPE');
      closureStarted=true;closureSignal=ctx.signal;await verifySource();current();must(!closureSignal.aborted,'PRODUCTION_BARCODE26_CLOSED');return closureReader;},close:closeSource};
   }catch(error){try{await closeSource();}catch(cleanup){throw new AggregateError([error,cleanup],'Retained barcode source open and cleanup failed');}throw error;}
  }
  async function retainedProjectionFiles(refs,current,resolveFile){
   const held=new Map();let ended=false,closingFiles;
   const closeFiles=async()=>{if(closingFiles)return closingFiles;ended=true;closingFiles=(async()=>{const r=await Promise.allSettled([...held.values()].map(f=>f.fd.close()));held.clear();const errors=r.filter(x=>x.status==='rejected');if(errors.length)throw new AggregateError(errors.map(x=>x.reason),'Retained projection close failed');})();return closingFiles;};
   disposers.push(closeFiles);
   const check=()=>{current();must(!ended,'PRODUCTION_RETAINED_PROJECTION26_CLOSED');};
   try{for(const [key,logical]of Object.entries(refs)){check();const ref=resolveFile?await resolveFile(logical):logical;check();must(typeof ref.path==='string'&&isAbsolute(ref.path)&&Number.isSafeInteger(ref.bytes)&&ref.bytes>=0&&ref.bytes<=1024*1024*1024&&hash(ref.sha256),'PRODUCTION_RETAINED_PROJECTION26_REF');
     const stat=await lstat(ref.path);check();must(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0&&stat.size===ref.bytes,'PRODUCTION_RETAINED_PROJECTION26_PRIVATE');
     const fd=await open(ref.path,constants.O_RDONLY|constants.O_NOFOLLOW);if(ended||closed||signal.aborted){await fd.close();check();}held.set(key,{ref,stat,fd});check();must(same(stat,await fd.stat()),'PRODUCTION_RETAINED_PROJECTION26_CHANGED');}
    const verifyFiles=async()=>{check();await verify();for(const f of held.values()){must(same(f.stat,await f.fd.stat())&&same(f.stat,await lstat(f.ref.path)),'PRODUCTION_RETAINED_PROJECTION26_CHANGED');check();}};
    const bytes=async(key,ref,max=4194304)=>{check();const f=held.get(key);must(f&&Number.isSafeInteger(ref.offset)&&ref.offset>=0&&Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&ref.bytes<=max&&ref.offset+ref.bytes<=f.ref.bytes,'PRODUCTION_RETAINED_PROJECTION26_RANGE');
     const b=Buffer.allocUnsafe(ref.bytes);let n=0;while(n<b.length){const got=await f.fd.read(b,n,b.length-n,ref.offset+n);check();must(got.bytesRead>0,'PRODUCTION_RETAINED_PROJECTION26_EOF');n+=got.bytesRead;}
     if(ref.sha256!==undefined)must(createHash('sha256').update(b).digest('hex')===ref.sha256,'PRODUCTION_RETAINED_PROJECTION26_SHA');return b;};
    return{verify:verifyFiles,bytes,async json(key,ref){return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await bytes(key,ref)));},
     async metadata(key,max=80*1024*1024){const f=held.get(key);must(f,'PRODUCTION_RETAINED_PROJECTION26_REF');return bytes(key,{offset:0,...f.ref},max);},close:closeFiles};
   }catch(e){await closeFiles();throw e;}
  }
  async function retainedTransferLinesReader(recipe){
   const spec=recipe.retainedTransferLines;let ended=false,closingSource,files,index,closureSignal,iterated=false,closureStarted=false;const ordinals=new Map();
   const current=()=>{active();must(!ended&&!closureSignal?.aborted,'PRODUCTION_RETAINED_TRANSFER26_CLOSED');};
   const closeSource=async()=>{if(closingSource)return closingSource;ended=true;closingSource=(async()=>{ordinals.clear();index=null;await files?.close();})();return closingSource;};disposers.push(closeSource);
   try{must(spec&&spec.rows>0&&spec.rows<=261641&&spec.rows===fixed.closureScope.expectedSourceEntityCounts.TRANSFER_LINE&&spec.rows===fixed.closureScope.expectedCounts.history_transfer_line,'PRODUCTION_RETAINED_TRANSFER26_COUNTS');
    files=await retainedProjectionFiles({index:spec.index,source:spec.source,typed:spec.typed},current,sourceFileResolver26(recipe));current();index=await files.metadata('index',80*1024*1024);current();
    must(index.length>=64&&index.subarray(0,9).toString('ascii')==='TL26JOIN1'&&index.readUInt32LE(12)===1,'PRODUCTION_RETAINED_TRANSFER26_INDEX');
    const rows=index.readUInt32LE(16),headers=index.readUInt32LE(20),recordBytes=index.readUInt32LE(24),records=index.readUInt32LE(28),sourceOrderBytes=index.readUInt32LE(32),typedOrderBytes=index.readUInt32LE(36),directoryBytes=index.readUInt32LE(40);
    must(rows===spec.rows&&headers>0&&headers<=14279&&recordBytes===256&&records===rows*256&&sourceOrderBytes===rows*4&&typedOrderBytes===rows*4&&directoryBytes===headers*36&&index.readUInt32LE(44)===64&&index.length===64+records+sourceOrderBytes+typedOrderBytes+directoryBytes,'PRODUCTION_RETAINED_TRANSFER26_INDEX');
    const key=(n,source)=>{const at=64+n*256,len=index[at+(source?60:61)];must(len>0&&len<=64,'PRODUCTION_RETAINED_TRANSFER26_KEY');return new TextDecoder('utf8',{fatal:true}).decode(index.subarray(at+(source?64:128),at+(source?64:128)+len));};
    const refs=(n,source)=>{const at=64+n*256,offset=Number(index.readBigUInt64LE(at+(source?4:16))),bytes=index.readUInt32LE(at+(source?12:24));must(Number.isSafeInteger(offset)&&Number.isSafeInteger(bytes)&&bytes>0&&bytes<=4194304&&offset+bytes<=spec[source?'source':'typed'].bytes,'PRODUCTION_RETAINED_TRANSFER26_RANGE');return{offset,bytes,sha256:index.subarray(at+(source?192:224),at+(source?224:256)).toString('hex')};};
    const typedIds=new Set(),coverage={source:[],typed:[]};for(let n=0;n<rows;n++){current();const sourceId=key(n,true),typedId=key(n,false);must(!ordinals.has(sourceId)&&!typedIds.has(typedId)&&index.readUInt32LE(64+n*256)<headers,'PRODUCTION_RETAINED_TRANSFER26_DUPLICATE');ordinals.set(sourceId,n);typedIds.add(typedId);coverage.source.push(refs(n,true));coverage.typed.push(refs(n,false));}
    for(const role of ['source','typed']){let end=0;for(const ref of coverage[role].sort((a,b)=>a.offset-b.offset)){must(ref.offset===end,'PRODUCTION_RETAINED_TRANSFER26_RANGE_GAP');end+=ref.bytes;}must(end===spec[role].bytes,'PRODUCTION_RETAINED_TRANSFER26_EOF');}typedIds.clear();coverage.source.length=0;coverage.typed.length=0;
    // The packed record starts with its document ordinal, shared by all
    // lines of that header; it is independent of physical record position.
    const directoryStart=64+records+sourceOrderBytes+typedOrderBytes;
    const checkHeaderIdentity=(headerId,ordinal)=>{const headerAt=directoryStart+ordinal*36;must(typeof headerId==='string'&&headerId.replaceAll('-','')===index.subarray(headerAt,headerAt+16).toString('hex'),'PRODUCTION_RETAINED_TRANSFER26_HEADER_IDENTITY');};
    const rawRow=async(n,source)=>{current();const role=source?'source':'typed',raw=await files.json(role,refs(n,source)),relation=source?'import_source_row':'history_transfer_line';current();const row=historyClosureProjectionRow26(relation,raw.projection);must(raw.relation===relation&&raw.key===row.key&&row.key===key(n,source)&&row.projection.batch_id===binding.batchId,'PRODUCTION_RETAINED_TRANSFER26_MEMBER');
     if(!source)checkHeaderIdentity(row.projection.header_id,index.readUInt32LE(64+n*256));return row;};
    const restore=async n=>{const sr=await rawRow(n,true),tr=await rawRow(n,false),s=sr.projection,t=tr.projection,fp=s.field_provenance.history_staging,provenance={...s.field_provenance};delete provenance.history_staging;
     must(s.entity_type==='TRANSFER_LINE'&&fp?.selection?.selectionSha256===binding.selectionSha256&&fp.validator_version==='V3_TRANSFER_LINE_STAGE_1'&&t.source_row_id===s.id,'PRODUCTION_RETAINED_TRANSFER26_SCOPE');
     const source={id:s.id,batchId:s.batch_id,entityType:s.entity_type,sourceKey:s.source_key,fileRef:s.file_ref,sheet:s.sheet,rowNo:s.row_no,sourceFileSha256:s.source_file_sha256,rowSha256:s.row_sha256,rawFields:s.raw_fields,normalizedFields:s.normalized_fields,fieldProvenance:provenance};
     const chunk=prepareV3HistoryChunk({batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selection:fp.selection,rows:[{source,header:{sourceKey:s.normalized_fields['单据来源编号'],nativeId:t.header_id},sku:{sourceKey:s.normalized_fields['SKU来源编号'],nativeId:t.sku_id}}]}),row=chunk.rows[0];
     must(row.fingerprint===fp.fingerprint&&historyClosureRowHash(historyClosureProjectionRow26('import_source_row',transferLineSourceEvidence26(row,chunk.selection)))===historyClosureRowHash(sr)
      &&historyClosureRowHash(historyClosureProjectionRow26('history_transfer_line',row.line))===historyClosureRowHash(tr),'PRODUCTION_RETAINED_TRANSFER26_ORIGINAL_CHANGED');return chunk;};
    const verifyFiles=async()=>{current();await files.verify();current();};await verifyFiles();
    return{verify:verifyFiles,async authorize(chunk){current();validatePreparedHistoryChunk(chunk);for(const row of chunk.rows){const n=ordinals.get(row.source.id);must(n!==undefined,'PRODUCTION_RETAINED_TRANSFER26_MEMBER');const original=await restore(n);must(capture(original.rows[0])===capture(row)&&capture(original.selection)===capture(chunk.selection),'PRODUCTION_RETAINED_TRANSFER26_ORIGINAL_CHANGED');}await verifyFiles();},
     async *chunks(){current();must(!iterated,'PRODUCTION_RETAINED_TRANSFER26_SINGLE_STAGE');iterated=true;for(let n=0;n<rows;n++){const chunk=await restore(n);current();yield chunk;current();}await verifyFiles();},
     async openClosure(scope,ctx){current();must(!closureStarted&&capture(scope)===capture(fixed.closureScope)&&ctx?.group==='TRANSFER_LINES'&&ctx.signal instanceof AbortSignal&&!ctx.signal.aborted,'PRODUCTION_RETAINED_TRANSFER26_SCOPE');closureStarted=true;closureSignal=ctx.signal;
      let childClosed=false;const childCurrent=()=>{current();must(!childClosed,'PRODUCTION_RETAINED_TRANSFER26_CHILD_CLOSED');},childVerify=async()=>{childCurrent();await verifyFiles();childCurrent();};
      const stream=async function*(kind){await childVerify();let count=0;for await(const row of capturedTransferLineRows26(index,kind,async ref=>{childCurrent();const row=await files.json(kind==='sourceRows'?'source':'typed',ref);childCurrent();if(kind==='typedRows')checkHeaderIdentity(row.projection?.header_id,ref.ordinal);return row;},childCurrent)){childCurrent();must(row.projection.batch_id===binding.batchId,'PRODUCTION_RETAINED_TRANSFER26_SCOPE');if(kind==='sourceRows')must(row.projection.entity_type==='TRANSFER_LINE'&&row.projection.field_provenance.history_staging.selection.selectionSha256===binding.selectionSha256,'PRODUCTION_RETAINED_TRANSFER26_SCOPE');yield row;childCurrent();count++;}must(count===rows,'PRODUCTION_RETAINED_TRANSFER26_COUNTS');await childVerify();};
      return{verify:childVerify,sourceRows:()=>stream('sourceRows'),typedRows:()=>stream('typedRows'),async *documents(){await childVerify();},close:async()=>{childClosed=true;}};},close:closeSource};
   }catch(error){try{await closeSource();}catch(cleanup){throw new AggregateError([error,cleanup],'Retained transfer line open failed');}throw error;}
  }
  async function retainedHeadersReader(recipe){
   const spec=recipe.retainedHeaders;let ended=false,closingSource,closureSignal,composed,iterated=false;const owned=[];
   const current=()=>{active();must(!ended&&!closureSignal?.aborted,'PRODUCTION_RETAINED_HEADERS26_CLOSED');};
   const closeSource=async()=>{if(closingSource)return closingSource;ended=true;closingSource=(async()=>{const results=await Promise.allSettled([...owned].reverse().map(x=>x.close()));const errors=results.filter(x=>x.status==='rejected');if(errors.length)throw new AggregateError(errors.map(x=>x.reason),'Retained headers cleanup failed');})();return closingSource;};
   disposers.push(closeSource);
   async function helper(ref,name){current();const bytes=await pinnedSmall(ref?.path,ref?.sha256,sourceFileResolver26(recipe));current();must(bytes.length===ref.bytes&&ref.sha256===RETAINED_HEADER_HELPERS[name],'PRODUCTION_RETAINED_HEADERS26_HELPER_PIN');return import(pathToFileURL((await sourceFileResolver26(recipe)?.(ref)??ref).path).href);}
   try{
    must(spec?.sales&&spec.transfer&&spec.sales.rows===fixed.closureScope.expectedCounts.history_sales_header&&spec.transfer.rows===fixed.closureScope.expectedCounts.history_transfer_header,'PRODUCTION_RETAINED_HEADERS26_COUNTS');
    must(resolve(dirname(spec.helpers.closure.path),'prepare-retained-sales-header-window-20261026.mjs')===spec.helpers.salesWindow.path,'PRODUCTION_RETAINED_HEADERS26_HELPER_DEPENDENCY');
    const locate=sourceFileResolver26(recipe);if(locate){const closureCode=await locate(spec.helpers.closure),windowCode=await locate(spec.helpers.salesWindow);current();must(resolve(dirname(closureCode.path),'prepare-retained-sales-header-window-20261026.mjs')===windowCode.path,'PRODUCTION_RETAINED_HEADERS26_HELPER_DEPENDENCY');}
    // Pin both relative closure dependencies before importing the existing pure
    // composition. Nothing is fetched or copied from the retained body files.
    const salesWindow=await helper(spec.helpers.salesWindow,'prepare-retained-sales-header-window-20261026.mjs'),headerClosure=await helper(spec.helpers.closure,'sales-header-closure-session-20261026.mjs'),transferWindow=await helper(spec.helpers.transferWindow,'prepare-retained-transfer-header-window-20261025-v2.mjs');current();
    const files=await retainedProjectionFiles({salesIndex:spec.sales.index,KNOWN25811:spec.sales.partitions.KNOWN25811,MAPPED2471:spec.sales.partitions.MAPPED2471,
     transferIndex:spec.transfer.index,transferSource:spec.transfer.source,transferTyped:spec.transfer.typed,transferDocument:spec.transfer.document},current,sourceFileResolver26(recipe));owned.push(files);current();
    const index=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await files.metadata('salesIndex',64*1024*1024)));current();
    const short=Object.fromEntries(['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'].map(k=>[k,binding[k]]));
    must(index.rows===spec.sales.rows&&capture(index.binding)===capture(short)&&capture(index.partitions)===capture(spec.sales.partitions),'PRODUCTION_RETAINED_HEADERS26_INDEX_BINDING');
    const raw=await files.metadata('transferIndex',16*1024*1024);current();must(raw.at(-1)===10,'PRODUCTION_RETAINED_HEADERS26_INDEX_LF');
    const entries=new TextDecoder('utf8',{fatal:true}).decode(raw).slice(0,-1).split('\n').map(line=>JSON.parse(line));
    must(entries.length===spec.transfer.rows&&entries.length>0&&entries.length<=14279,'PRODUCTION_RETAINED_HEADERS26_TRANSFER_COUNT');
    for(const field of ['headerId','headerSourceRowId','sourceKey'])must(new Set(entries.map(e=>e[field])).size===entries.length,'PRODUCTION_RETAINED_HEADERS26_DUPLICATE');
    entries.sort((a,b)=>a.source.offset-b.source.offset);
    for(const role of ['source','typed','document']){let offset=0;for(const e of entries){const ref=e[role];must(ref&&ref.offset===offset&&Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&ref.bytes<=4194304&&hash(ref.sha256),'PRODUCTION_RETAINED_HEADERS26_TRANSFER_RANGES');offset+=ref.bytes;}must(offset===spec.transfer[role].bytes,'PRODUCTION_RETAINED_HEADERS26_TRANSFER_EOF');}
    const salesMembers=new Map(index.entries.map(e=>[e.sourceRowId,e])),transferMembers=new Map(entries.map(e=>[e.headerSourceRowId,e]));
    const sourceCodec={historyClosureProjectionRow26,historyClosureRowHash,encodeHistoryClosureValue};
    const prepared=async e=>{current();return files.json(e.partition,{offset:e.offset,bytes:e.bytes});};
    const checkSales=(p,e)=>{const out=salesWindow.salesHeaderProjection26(historyClosureProjectionRow26,p);must(e&&p.fingerprint===e.fingerprint&&capture(out.document)===capture(e.document)&&historyClosureRowHash(out.sourceRow)===e.source.sha256&&historyClosureRowHash(out.typedRow)===e.typed.sha256,'PRODUCTION_RETAINED_HEADERS26_SALES_MEMBER');return out;};
    const transfer=async e=>{current();const values={};for(const role of ['source','typed','document'])values[role]=await files.json('transfer'+role[0].toUpperCase()+role.slice(1),e[role]);current();
     must(values.source.key===e.headerSourceRowId&&values.typed.key===e.headerId&&values.document.headerId===e.headerId&&values.document.headerSourceRowId===e.headerSourceRowId&&values.document.sourceKey===e.sourceKey,'PRODUCTION_RETAINED_HEADERS26_TRANSFER_MEMBER');
     return transferWindow.prepareRetainedTransferHeaderProjectionWindow({prepareV3HistoryHeaderChunk,validatePreparedHistoryHeaderChunk,transferHeaderProjection26},{version:'EXISTING_TRANSFER_HEADER_RETAINED_SINGLE_WINDOW_V1',binding:short,sourceProjection:values.source,typedProjection:values.typed,documentAllocation:values.document});};
    const verifyFiles=async()=>{current();await files.verify();current();};
    const sales=headerClosure.createSalesHeaderClosureSession({index,sourceCodec,readPrepared:(partition,range)=>files.json(partition,range),verify:verifyFiles,close:async()=>{},current});owned.push(sales);
    let sourceComplete=false,sourceStarted=false;const cache=new Map(),sourceOrder=[...entries].sort((a,b)=>Buffer.compare(Buffer.from(a.headerSourceRowId),Buffer.from(b.headerSourceRowId))),typedOrder=[...entries].sort((a,b)=>Buffer.compare(Buffer.from(a.headerId),Buffer.from(b.headerId)));let cacheBytes=0;
    const transferClosure={verify:verifyFiles,async *sourceRows(){current();must(!sourceStarted,'PRODUCTION_RETAINED_HEADERS26_SINGLE_SOURCE');sourceStarted=true;await verifyFiles();
      for(const e of sourceOrder){const restored=await transfer(e),out=restored.retainedProjection;current();cacheBytes+=encodeHistoryClosureValue(out.typedRow).length;must(cacheBytes<=64*1024*1024,'PRODUCTION_RETAINED_HEADERS26_CACHE_BOUND');cache.set(e.headerId,out.typedRow);yield out.sourceRow;current();}await verifyFiles();sourceComplete=true;},
     async *typedRows(){current();must(sourceComplete&&cache.size===entries.length,'PRODUCTION_RETAINED_HEADERS26_SOURCE_FIRST');for(const e of typedOrder){current();yield cache.get(e.headerId);current();}await verifyFiles();},
     async *documents(){await verifyFiles();for(const e of typedOrder){const d=await files.json('transferDocument',e.document);current();must(d.headerId===e.headerId&&d.headerSourceRowId===e.headerSourceRowId&&d.sourceKey===e.sourceKey&&d.kind==='TRANSFER','PRODUCTION_RETAINED_HEADERS26_DOCUMENT');yield d;current();}},
     async close(){cache.clear();sourceOrder.length=0;typedOrder.length=0;cacheBytes=0;}};owned.push(transferClosure);
    composed=headerClosure.composeHeaderClosureSessions({sales,transfer:transferClosure,current});owned.push(composed);await verifyFiles();let moneyApprovals;
    const money=async()=>{if(moneyApprovals)return moneyApprovals;const bytes=await pinnedSmall(spec.sales.money.path,spec.sales.money.sha256,sourceFileResolver26(recipe));current();must(bytes.length===spec.sales.money.bytes&&bytes.length<=1048576,'PRODUCTION_RETAINED_HEADERS26_MONEY');
     const columns=['file','sheet','row','sourceId','entity','documentSourceId','field','rawValue','excessFromNearestCent','candidateExactCentValue','sourceFileSha256','decision','provenance','toleranceCurrencyUnits','corroboratingDocumentSourceId'],approvals=[];let header;
     async function* text(){yield new TextDecoder('utf8',{fatal:true}).decode(bytes);}for await(const cells of parseV2Csv(text())){current();if(!header){must(capture(cells)===capture(columns),'PRODUCTION_RETAINED_HEADERS26_MONEY_COLUMNS');header=cells;continue;}must(cells.length===header.length,'PRODUCTION_RETAINED_HEADERS26_MONEY_WIDTH');const row=Object.fromEntries(header.map((k,n)=>[k,cells[n]]));approvals.push({fileSha256:row.sourceFileSha256,sheet:row.sheet,row:row.row,sourceId:row.sourceId,field:row.field,rawValue:row.rawValue,exactCentValue:row.candidateExactCentValue});}
     moneyApprovals=v2MoneyApprovalSet(approvals,approvals);must(moneyApprovals.size===32,'PRODUCTION_RETAINED_HEADERS26_MONEY_COUNT');return moneyApprovals;};
    return{verify:verifyFiles,async authorize(chunk){current();validatePreparedHistoryHeaderChunk(chunk);for(const row of chunk.rows){const p=row.prepared;if(p.entity==='SALES_HEADER')checkSales(p,salesMembers.get(p.source.id));else{const entry=transferMembers.get(p.source.id);must(entry,'PRODUCTION_RETAINED_HEADERS26_TRANSFER_MEMBER');const out=transferHeaderProjection26(p),restored=await transfer(entry);must(capture(out)===capture(restored.retainedProjection),'PRODUCTION_RETAINED_HEADERS26_TRANSFER_MEMBER');}}await verifyFiles();},
     async *chunks(){current();must(!iterated,'PRODUCTION_RETAINED_HEADERS26_SINGLE_STAGE');iterated=true;const approvals=await money();for(const e of index.entries){const value=await prepared(e),out=salesWindow.prepareRetainedSalesHeaderWindow({prepareV3HistoryHeaderChunk,validatePreparedHistoryHeaderChunk,historyClosureProjectionRow26},{binding:short,items:[{partition:e.partition,value}],moneyApprovals:approvals});checkSales(out.chunk.rows[0].prepared,e);yield out.chunk;current();}
      for(const e of entries){const out=await transfer(e);current();yield out.chunk;current();}await verifyFiles();},
     async openClosure(scope,ctx){current();must(!closureSignal&&capture(scope)===capture(fixed.closureScope)&&ctx?.group==='HEADERS'&&ctx.signal instanceof AbortSignal&&!ctx.signal.aborted,'PRODUCTION_RETAINED_HEADERS26_SCOPE');closureSignal=ctx.signal;await verifyFiles();return composed;},close:closeSource};
   }catch(error){try{await closeSource();}catch(cleanup){throw new AggregateError([error,cleanup],'Retained headers open failed');}throw error;}
  }
  async function retainedNativeReader(group,recipe){
   // Only the original prepared files are consumed. The bounded in-memory
   // projection index is derived during this authorized pass, never from raw
   // workbooks, CSV re-mapping, new IDs or a substitute source authority.
   const spec=recipe.retainedNative,original={historyClosureProjectionRow26,historyClosureRowHash,historySettlementRequestHash:capture,
    nativeProductImportEvidences26,validatePreparedNativeSkuImport26,nativeSkuAliasEvidence26,
    validatePreparedNativeStockGroup,nativeStockSourceEvidence,nativeStockPublicationContributor26};
   const caps={PRODUCTS:30,SKUS:14999,STOCK_CONTRIBUTORS:38303};
   must(caps[group]&&spec&&spec.records>0&&Number.isSafeInteger(spec.records)&&spec.records<=caps[group]
    &&spec.sourceRows===fixed.closureScope.expectedSourceEntityCounts[group==='PRODUCTS'?'PRODUCT':group==='SKUS'?'SKU':'INVENTORY_BASELINE']
    &&spec.typedRows===(group==='PRODUCTS'?spec.sourceRows:group==='SKUS'?spec.records+spec.sourceRows:fixed.closureScope.expectedCounts.import_stock_contributor)
    &&Array.isArray(spec.files)&&spec.files.length>0&&spec.files.length<=(group==='PRODUCTS'?30:1),'PRODUCTION_RETAINED_NATIVE26_SPEC');
   let ended=false,closingSource,build,closureReader,closureSignal,iterated=false;const held=new Map(),entries=[],members=new Map();
   const current=()=>{active();must(!ended&&!closureSignal?.aborted,'PRODUCTION_RETAINED_NATIVE26_CLOSED');};
   const closeSource=async()=>{if(closingSource)return closingSource;ended=true;closingSource=(async()=>{const errors=[];
    if(closureReader)try{await closureReader.close();}catch(e){errors.push(e);}for(const f of held.values())try{await f.fd.close();}catch(e){errors.push(e);}
    held.clear();entries.length=0;members.clear();if(errors.length)throw new AggregateError(errors,'Retained native cleanup failed');})();return closingSource;};
   disposers.push(closeSource);
   async function verifyFiles(){current();await verify();for(const f of held.values()){must(same(f.stat,await f.fd.stat())&&same(f.stat,await lstat(f.ref.path)),'PRODUCTION_RETAINED_NATIVE26_CHANGED');current();}}
   const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
   const decode=bytes=>JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));
   async function range(ref){current();const f=held.get(ref.file);must(f&&Number.isSafeInteger(ref.offset)&&ref.offset>=0&&Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&ref.bytes<=4194304&&ref.offset+ref.bytes<=f.ref.bytes,'PRODUCTION_RETAINED_NATIVE26_RANGE');
    const bytes=Buffer.allocUnsafe(ref.bytes);let n=0;while(n<bytes.length){const got=await f.fd.read(bytes,n,bytes.length-n,ref.offset+n);current();must(got.bytesRead>0,'PRODUCTION_RETAINED_NATIVE26_EOF');n+=got.bytesRead;}
    must(sha(bytes)===ref.sha256,'PRODUCTION_RETAINED_NATIVE26_RANGE_SHA');return decode(bytes);}
   let helper;
   async function ensureIndex(){current();if(build)return build;build=(async()=>{
    const records=[];let sourceRows=0,typedRows=0;
    for(const [file,f]of held){
     const digest=createHash('sha256');let position=0,pending=Buffer.alloc(0),offset=0;
     const append=(bytes)=>{current();const prepared=decode(bytes),ref={file,offset,bytes:bytes.length,sha256:sha(bytes)};
      const entry=helper.captureRetainedNativeClosureRecord26(original,{group,binding,ref,prepared});
      if(sourcePreparation)must(sourcePreparation.observePrepared(group,prepared,spec.files[Number(file)],entry)===undefined,'SOURCE_PREPARATION26_OBSERVER_RESULT');
      must(!members.has(entry.preparedHash),'PRODUCTION_RETAINED_NATIVE26_DUPLICATE');members.set(entry.preparedHash,entry);records.push(entry);offset+=bytes.length;
      sourceRows+=entry.sources.length;typedRows+=entry.typed.length;must(records.length<=spec.records&&sourceRows<=spec.sourceRows&&typedRows<=spec.typedRows,'PRODUCTION_RETAINED_NATIVE26_COUNT');};
     if(group==='PRODUCTS'){must(f.ref.bytes<=4194304,'PRODUCTION_RETAINED_NATIVE26_RECORD_BOUND');const bytes=Buffer.allocUnsafe(f.ref.bytes);while(position<bytes.length){const got=await f.fd.read(bytes,position,bytes.length-position,position);current();must(got.bytesRead>0,'PRODUCTION_RETAINED_NATIVE26_EOF');position+=got.bytesRead;}digest.update(bytes);append(bytes);}
     else{while(position<f.ref.bytes){const bytes=Buffer.allocUnsafe(Math.min(262144,f.ref.bytes-position)),got=await f.fd.read(bytes,0,bytes.length,position);current();must(got.bytesRead>0,'PRODUCTION_RETAINED_NATIVE26_EOF');position+=got.bytesRead;const read=bytes.subarray(0,got.bytesRead);digest.update(read);pending=Buffer.concat([pending,read]);let end;
       while((end=pending.indexOf(10))>=0){must(end>0&&end+1<=4194304,'PRODUCTION_RETAINED_NATIVE26_RECORD_BOUND');append(pending.subarray(0,end+1));pending=pending.subarray(end+1);}must(pending.length<=4194304,'PRODUCTION_RETAINED_NATIVE26_RECORD_BOUND');}
      must(pending.length===0,'PRODUCTION_RETAINED_NATIVE26_FINAL_LF');}
     must(position===f.ref.bytes&&offset===f.ref.bytes&&digest.digest('hex')===f.ref.sha256,'PRODUCTION_RETAINED_NATIVE26_FILE_SHA');current();
    }
    must(records.length===spec.records&&sourceRows===spec.sourceRows&&typedRows===spec.typedRows,'PRODUCTION_RETAINED_NATIVE26_COUNT');await verifyFiles();entries.push(...records);
    const index={version:'RETAINED_NATIVE_CLOSURE_INDEX_26_V1',group,binding:Object.fromEntries(['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'].map(k=>[k,binding[k]])),
     files:Object.fromEntries([...held].map(([key,f])=>[key,f.ref])),expected:{records:spec.records,sourceRows,typedRows},records};
    closureReader=helper.createRetainedNativeClosureSession26({original,index,readRecord:range,verify:verifyFiles,close:async()=>{},current});
   })();return build;}
   try{
    const helperBytes=await pinnedSmall(recipe.closureHelper?.path,recipe.closureHelper?.sha256,sourceFileResolver26(recipe));current();
    must(recipe.closureHelper.bytes===helperBytes.length&&recipe.closureHelper.sha256===RETAINED_NATIVE_HELPER_SHA256,'PRODUCTION_RETAINED_NATIVE26_HELPER_PIN');
    helper=await import(pathToFileURL((await sourceFileResolver26(recipe)?.(recipe.closureHelper)??recipe.closureHelper).path).href);current();
    for(let n=0;n<spec.files.length;n++){let ref=spec.files[n];const locate=sourceFileResolver26(recipe);if(locate)ref=await locate(ref);current();must(typeof ref.path==='string'&&isAbsolute(ref.path)&&Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&ref.bytes<=256*1024*1024&&hash(ref.sha256),'PRODUCTION_RETAINED_NATIVE26_FILE_REF');
     const stat=await lstat(ref.path);current();must(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0&&stat.size===ref.bytes,'PRODUCTION_RETAINED_NATIVE26_PRIVATE_FILE');
     const fd=await open(ref.path,constants.O_RDONLY|constants.O_NOFOLLOW);if(ended||closed||signal.aborted){await fd.close();current();}held.set(String(n),{ref,stat,fd});current();must(same(stat,await fd.stat()),'PRODUCTION_RETAINED_NATIVE26_CHANGED');}
    await verifyFiles();
    return {verify:verifyFiles,...(sourcePreparation?{async prepareFacts(){await ensureIndex();await verifyFiles();}}:{}),async authorize(prepared){await ensureIndex();current();const entry=members.get(capture(prepared));must(entry&&entry.fingerprint===prepared.fingerprint,'PRODUCTION_RETAINED_NATIVE26_MEMBERSHIP');
      const actual=helper.captureRetainedNativeClosureRecord26(original,{group,binding,ref:entry.ref,prepared});must(capture(actual)===capture(entry),'PRODUCTION_RETAINED_NATIVE26_MEMBERSHIP');await verifyFiles();},
     async *[stages[group][1]](){current();must(!iterated,'PRODUCTION_RETAINED_NATIVE26_SINGLE_STAGE');iterated=true;await ensureIndex();for(const entry of entries){const prepared=await range(entry.ref);current();yield prepared;current();}await verifyFiles();},
     async openClosure(scope,ctx){current();must(!closureSignal&&capture(scope)===capture(fixed.closureScope)&&ctx?.group===group&&ctx.signal instanceof AbortSignal&&!ctx.signal.aborted,'PRODUCTION_RETAINED_NATIVE26_SCOPE');closureSignal=ctx.signal;await ensureIndex();return closureReader;},close:closeSource};
   }catch(error){try{await closeSource();}catch(cleanup){throw new AggregateError([error,cleanup],'Retained native open failed');}throw error;}
  }
  async function capturedReader(group,recipe){
   const opts=await (a??sourcePreparation.capturedIO).capturedOptions(group,structuredClone(recipe),context);active();
   must(opts?.capturedSource&&(sourcePreparation||typeof opts.resolveNativeBinding==='function')&&opts.batchId===binding.batchId&&opts.fixedSourceNamespace===binding.fixedSourceNamespace,
    'PRODUCTION_PROVIDER26_CAPTURED_NATIVE_AUTHORITY_REQUIRED',group);
   const raw=await openCapturedSalesSettlementSource(opts,group==='SALES_DETAILS'?'SALES_LINE':'SETTLEMENT',{resolveFile:sourceFileResolver26(recipe)});
   if(closed||signal.aborted){await raw.close();active();}
   const prepare=group==='SALES_DETAILS'?prepareHistorySalesDetailChunk:prepareHistorySettlementChunk;
   return {verify,authorize:raw.authorize.bind(raw),close:raw.close.bind(raw),
    async *chunks(){must(!sourcePreparation,'SOURCE_PREPARATION26_STAGE_ITERATION_FORBIDDEN');let batch=[],selection,moneyApprovals;const size=recipe.chunkRows;
     must(Number.isSafeInteger(size)&&size>0&&size<=100,'PRODUCTION_PROVIDER26_CAPTURED_CHUNK_BOUND');
     const flush=()=>prepare({batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selection,moneyApprovals,rows:batch});
     for await(const row of raw.rows()){
      active();if(selection===undefined){selection=row.selection;moneyApprovals=row.moneyApprovals;}
      must(capture(row.selection)===capture(selection)&&capture(row.moneyApprovals)===capture(moneyApprovals),'PRODUCTION_PROVIDER26_CAPTURED_CONTEXT');
      const entity=group==='SALES_DETAILS'?'SALES_LINE':'SETTLEMENT';
      const native=await opts.resolveNativeBinding({entity,sourceKey:row.source.sourceKey,rawFields:row.source.rawFields,normalizedFields:row.source.normalizedFields});active();
      batch.push({source:row.source,...native});if(batch.length===size){const prepared=flush();await raw.authorize(prepared);active();yield prepared;batch=[];}
     }
     if(batch.length){const prepared=flush();await raw.authorize(prepared);active();yield prepared;}
    },async openClosure(scope,ctx){return (a??sourcePreparation.capturedIO).openRetainedClosure(group,structuredClone(recipe),scope,ctx);}};
  }
  const openSources=Object.fromEntries(sourceGroups.map(group=>[group,async(scope,ctx)=>{
   active();must(preflightDone&&requestHash(scope)===requestHash(fixed.closureScope)&&ctx?.group===group,'PRODUCTION_PROVIDER26_CLOSURE_SCOPE');
   const result=await readers.get(group).openClosure(scope,ctx);active();return result;
  }]));
  async function openGroup(group){
   if(sourcePreparation)sourcePreparation.phase('OPEN_GROUP_'+group);
   must(!readers.has(group),'PRODUCTION_PROVIDER26_SOURCE_REUSED');
     const recipe=fixed.producers[group];let raw;
     if(recipe.mode==='REVIEWED')raw=await recipeOpeners[group](structuredClone(recipe.options),{resolveFile:sourceFileResolver26(recipe)});
     else if(recipe.mode==='CAPTURED_C144')raw=await capturedReader(group,recipe);
     else if(group==='BARCODES'&&Object.hasOwn(recipe,'closureHelper'))raw=await retainedBarcodeReader(recipe);
     else if(group==='TRANSFER_LINES'&&Object.hasOwn(recipe,'retainedTransferLines'))raw=await retainedTransferLinesReader(recipe);
     else if(group==='HEADERS'&&Object.hasOwn(recipe,'retainedHeaders'))raw=await retainedHeadersReader(recipe);
     else if(Object.hasOwn(recipe,'retainedNative'))raw=await retainedNativeReader(group,recipe);
     else {must(a,'SOURCE_PREPARATION26_REAL_RETAINED_READER_REQUIRED');raw=await a.openRetained(group,structuredClone(recipe),context);}
     const closeMethod=Object.getOwnPropertyDescriptor(raw??{},'close');if(!(group==='BARCODES'&&Object.hasOwn(recipe,'closureHelper'))&&!Object.hasOwn(recipe,'retainedNative')&&!Object.hasOwn(recipe,'retainedHeaders')&&!Object.hasOwn(recipe,'retainedTransferLines')&&closeMethod?.enumerable&&Object.hasOwn(closeMethod,'value')&&typeof closeMethod.value==='function')disposers.push(closeMethod.value.bind(raw));
     active();must(raw&&!issued.has(raw),'PRODUCTION_PROVIDER26_SOURCE_REUSED');issued.add(raw);
     const [kind,iterator]=stages[group];void kind;
     const reader=methods(raw,['verify','authorize','openClosure','close',iterator]);
     if(group==='PARTIES'){
      const projection=a?await a.coreProjection(structuredClone(fixed.core),structuredClone(binding)):await sourcePreparation.coreProjection(binding.authorizedPayloadHash);active();
      must(projection?.authorizedPayloadHash===binding.authorizedPayloadHash,'PRODUCTION_PROVIDER26_CORE_PROJECTION');
      const bind=methods(raw,['bindCoreContinuation','authorizePartyChunk']);await checked(bind.bindCoreContinuation,projection);
      must(Array.isArray(projection.coreMembers)&&projection.coreMembers.length===115,'PRODUCTION_PROVIDER26_CORE_PROJECTION');
      for(const member of projection.coreMembers){must(typeof member.sourceRowId==='string'&&!coreSourceIds.has(member.sourceRowId),'PRODUCTION_PROVIDER26_CORE_PROJECTION');coreSourceIds.add(member.sourceRowId);}
      reader.authorize=bind.authorizePartyChunk;
     }
     if(sourcePreparation&&Object.hasOwn(raw,'prepareFacts'))reader.prepareFacts=own(raw,'prepareFacts').bind(raw);
     readers.set(group,reader);await checked(reader.verify);
  }
  async function preflight(){
   active();must(!preflightDone,'PRODUCTION_PROVIDER26_PREFLIGHT_ALREADY_COMPLETE');
   try{await verify();
    // All group grants, including six real schemes and historical hall decisions,
    // must resolve BEFORE any source constructor or database activation.
    if(a)for(const group of sourceGroups)await checked(a.assertGroupAllowed,group,structuredClone(fixed.producers[group]),structuredClone(binding));
    if(!Array.isArray(warehouseItems)){
     must(warehouseItems&&Number.isSafeInteger(warehouseItems.bytes)&&warehouseItems.bytes>0&&warehouseItems.bytes<=4194304,'PRODUCTION_PROVIDER26_CORE_DATA_REQUIRED');
     const bytes=await pinnedSmall(warehouseItems.path,warehouseItems.sha256,sourceFileResolver26(fixed.producers.PARTIES));active();must(bytes.length===warehouseItems.bytes,'PRODUCTION_PROVIDER26_CORE_DATA_REQUIRED');
     const data=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));
     must(data.dataComplete===true&&Array.isArray(data.missing)&&data.missing.length===0&&data.publicationAuthorized===false
      &&data.identity?.batchId===binding.batchId&&data.identity.coreReceiptId===binding.coreReceiptId&&data.identity.coreSourceDigest===binding.coreSourceDigest
      &&Array.isArray(data.warehouses)&&data.warehouses.length===53,'PRODUCTION_PROVIDER26_CORE_DATA_REQUIRED');warehouseItems=data.warehouses;
    }
    for(const group of sourcePreparation?['PRODUCTS','SKUS','STOCK_CONTRIBUTORS']:sourceGroups)await openGroup(group);
    const scope=fixed.closureScope;must(scope?.batchId===binding.batchId&&scope.fixedSourceNamespace===binding.fixedSourceNamespace
     &&scope.selectionSha256===binding.selectionSha256&&scope.authorizedPayloadHash===binding.authorizedPayloadHash,'PRODUCTION_PROVIDER26_CLOSURE_SCOPE');
    preflightDone=true;if(sourcePreparation){await verify();return;}closure=await openAuthorizedHistoryClosureReader26({scope,openSources,trustedSelectionSha256:binding.selectionSha256,trustedAuthorizedPayloadHash:binding.authorizedPayloadHash});
    disposers.push(()=>closure.close());await verify();
   }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Production provider26 preflight and cleanup failed');}throw error;}
  }
  async function authorizeStep(step){
   active();must(preflightDone,'PRODUCTION_PROVIDER26_PREFLIGHT_REQUIRED');capture(step);const snapshot=structuredClone(step),before=capture(snapshot);
   const group=sourceGroups.find(g=>stages[g][0]===snapshot.kind);
   if(group)await checked(readers.get(group).authorize,snapshot.payload);
   else must(['MAIN','CLOSURE'].includes(snapshot.kind),'PRODUCTION_PROVIDER26_STEP_KIND');
   await checked(a.authorizeStep,snapshot,structuredClone(binding));must(capture(snapshot)===before,'PRODUCTION_PROVIDER26_STEP_MUTATED');
  }
  async function* main(phase,progress){
   let count=0;
   for await(const original of a.mainCommands(phase,{binding:structuredClone(binding),core:structuredClone(fixed.core),progress:structuredClone(progress)})){
    active();capture(original);const command=structuredClone(original);
    must(command.batchId===binding.batchId&&command.actorAccountId===binding.actorAccountId
     &&(phase==='BIND'?command.action==='IMPORT_BIND_FULL_SOURCE':phase==='ACCOUNT'?command.action==='IMPORT_CHUNK':command.action==='IMPORT_PUBLISH'),
     'PRODUCTION_PROVIDER26_MAIN_PHASE');
    if(phase==='BIND')must(command.fullBinding?.coreReceiptId===binding.coreReceiptId&&command.fullBinding?.coreSourceDigest===binding.coreSourceDigest
     &&command.fullBinding?.authorizedPayloadHash===binding.authorizedPayloadHash,'PRODUCTION_PROVIDER26_MAIN_CORE_BINDING');
    if(phase==='ACCOUNT'){
     const carried=new Set(progress.warehouses.map(item=>item.nativeRecord.id));
     must(Array.isArray(command.items)&&command.items.every(item=>item.targetType!=='WAREHOUSE'||!carried.has(item.nativeRecord?.id)),
      'PRODUCTION_PROVIDER26_CORE_CLAIM_REPEATED');
    }
    if(phase!=='ACCOUNT')must(++count===1,'PRODUCTION_PROVIDER26_MAIN_PHASE');else count++;
    await checked(a.authorizeNativeCommand,binding.actorAccountId,command);yield {kind:'MAIN',payload:command};
   }
   must(count>0||progress.committedOperations?.some(op=>op.action===(phase==='BIND'?'IMPORT_BIND_FULL_SOURCE':phase==='ACCOUNT'?'IMPORT_CHUNK':'IMPORT_PUBLISH')),'PRODUCTION_PROVIDER26_MAIN_COMMAND_REQUIRED');
  }
  if(sourcePreparation)return{preflight,close,openSources,
   async collectNativeFacts(){must(preflightDone,'PRODUCTION_PROVIDER26_PREFLIGHT_REQUIRED');for(const group of ['PRODUCTS','SKUS','STOCK_CONTRIBUTORS']){sourcePreparation.phase('NATIVE_FACTS_'+group);const reader=readers.get(group);must(typeof reader?.prepareFacts==='function','SOURCE_PREPARATION26_NATIVE_CAPTURE_REQUIRED');await reader.prepareFacts();active();}},
   async bindRealData(data){sourcePreparation.phase('DATA_DERIVATION');must(preflightDone&&readers.size===3,'SOURCE_PREPARATION26_DATA_BIND_ORDER');const prepared=prepareFullPayloadData26(data);await sourcePreparation.verifyDerivedData(prepared,data);active();
    binding.authorizedPayloadHash=fixed.binding.authorizedPayloadHash=fixed.closureScope.authorizedPayloadHash=prepared.authorizedPayloadHash;context.binding=structuredClone(binding);
    for(const group of ['PARTIES','PAYMENT'])fixed.producers[group].options.authorizedPayloadHash=prepared.authorizedPayloadHash;fixed.producers.CATALOGUE.options.binding.authorizedPayloadHash=prepared.authorizedPayloadHash;
    sourcePreparation.setDerivedInput(fixed,binding);for(const group of sourceGroups)if(!readers.has(group))await openGroup(group);active();return structuredClone(fixed.closureScope);
   }};
  return {preflight,close,openSources,closureScope:structuredClone(fixed.closureScope),bootstrap26:null,
   nativeProductSourceReader:{resolveFile:sourceFileResolver26(fixed.producers.PRODUCTS),async authorize(payload){await checked(a.authorizeProductSource,payload,structuredClone(binding));}},
   now:a.now,
   async assertExecutionAllowed(actual){must(requestHash(actual)===requestHash(binding),'PRODUCTION_PROVIDER26_BINDING_CHANGED');await verify();await checked(a.assertExecutionAllowed,structuredClone(actual));},
   async authorizeNativeCommand(actor,command){await checked(a.authorizeNativeCommand,actor,command);},
   async assertAllowed(actor,command){await checked(a.assertAllowed,actor,command);},authorizeStep,
   async *steps(){
    active();must(preflightDone&&!stepsStarted,'PRODUCTION_PROVIDER26_PREFLIGHT_REQUIRED');stepsStarted=true;
    const runtime=database.ready();
    const progress=await readCoreImportContinuation26({pool:runtime.pool,runtime26:runtime.runtime26,binding,
     assertExecutionAllowed:actual=>a.assertExecutionAllowed(actual),warehouses:warehouseItems});active();
    // The original adapter proves immutable birth22 and the full current
    // receipt/audit/claim chain. C's complete signed commands retain their IDs.
    yield* main('BIND',progress);
    if(progress.status==='IMPORTED')return structuredClone(progress.committedOperations.at(-1).result);
    for(const group of sourceGroups){const [kind,iterator]=stages[group],reader=readers.get(group);
     for await(const original of reader[iterator]()){
      active();let payload=original;
      if(group==='PARTIES'){
       const rows=original.rows.filter(row=>!coreSourceIds.has(row.input.source.id));if(!rows.length)continue;
       payload=prepareNativePartyImportChunk(rows.map(row=>row.input));
      }
      let step={kind,payload};await authorizeStep(step);active();
      const pending=unclaimedNativeStage26({group,payload,progress});if(pending===null)continue;
      if(pending!==payload){step={kind,payload:pending};await authorizeStep(step);active();}
      yield step;
     }
    }
    yield* main('ACCOUNT',progress);
    const expected=await closure.expected();active();const step={kind:'CLOSURE',payload:expected};await authorizeStep(step);yield step;
    yield* main('PUBLISH',progress);
   }};
 }});
}
/** Operator supplies the exact small INPUT pin separately, like the original
 * host config. Its reviewed authority module supplies capabilities only; it
 * does not replace this provider's11 factories, mapper calls or step order. */
export async function openSourceSession(context){
 const file=process.env.NAIJUE_IMPORT_PROVIDER26_INPUT_FILE,pin=process.env.NAIJUE_IMPORT_PROVIDER26_INPUT_SHA256;
 const bytes=await pinnedSmall(file,pin),inputs=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));
 const moduleBytes=await pinnedSmall(inputs.authorityModule?.path,inputs.authorityModule?.sha256);void moduleBytes;
 const module=await import(pathToFileURL(inputs.authorityModule.path).href),open=own(module,'openProductionSourceAuthority26');
 must(typeof open==='function','PRODUCTION_PROVIDER26_CAPABILITY_REQUIRED');
 const authority=await open({binding:structuredClone(context.binding),inputFile:file,trustedInputSha256:pin,signal:context.signal});
 try{return await createProductionSourceProvider26(inputs,authority).openSourceSession(context);}
 catch(error){try{await authority.close();}catch(cleanup){throw new AggregateError([error,cleanup],'Production authority26 construction failed');}throw error;}
}


/** Original retained C144 IO composition, shared by execution and explicit
 * source-only preparation. The caller supplies a real pinned-input verifier;
 * this object issues no execution/native/DB permission. */
function originalCapturedSourceIO26({binding,fixed,signal,verify,active,code,owned,captured}){
 const sourceScope=Object.fromEntries(['batchId','fixedSourceNamespace','selectionSha256'].map(k=>[k,binding[k]]));
 const verifyRecipe=async(group,recipe,actualBinding)=>{await verify();must(sourceGroups.includes(group)&&capture(actualBinding)===capture(binding)&&capture(recipe)===capture(fixed.producers[group]),'PRODUCTION_AUTHORITY26_GROUP_SCOPE');};
 return{
   async capturedOptions(group,recipe,context){await verifyRecipe(group,recipe,context.binding);
    must(['SALES_DETAILS','SETTLEMENTS'].includes(group)&&recipe.supportModules&&typeof recipe.sourceRoot==='string'&&isAbsolute(recipe.sourceRoot),'PRODUCTION_AUTHORITY26_CAPTURED_INPUT_REQUIRED');
    const makeTransport=await code(recipe.supportModules.transport,'openRetainedSalesSettlementFiles',sourceFileResolver26(recipe));
    const makeOptions=await code(recipe.supportModules.options,'prepareRetainedSalesOptions',sourceFileResolver26(recipe));
    const resolveFile=sourceFileResolver26(recipe),physicalSource=resolveFile?await resolveFile(recipe.source):recipe.source,physicalTyped=resolveFile?await resolveFile(recipe.typed):recipe.typed;
    const transport=await owned(()=>makeTransport({source:{...recipe.source,...physicalSource},typed:{...recipe.typed,...physicalTyped}},signal));let indexed;
    const ensureIndex=()=>indexed??=(async()=>{active();await transport.buildTypedIndex();active();})();
    const expected={entity:recipe.entity,binding:structuredClone(binding),manifestRef:recipe.manifestRef,moneyRef:recipe.moneyRef,trustedApprovalSha256:recipe.trustedApprovalSha256};
    const capturedAuthority={async verify(actual){await verify();must(actual.batchId===binding.batchId&&actual.fixedSourceNamespace===binding.fixedSourceNamespace
      &&actual.selection?.entity===recipe.entity&&actual.selection.selectionSha256===binding.selectionSha256&&capture(actual.manifest)===capture(recipe.manifestRef)
      &&capture(actual.source)===capture(recipe.source)&&capture(actual.typed)===capture(recipe.typed),'PRODUCTION_AUTHORITY26_CAPTURED_SCOPE');await transport.verify();},close:()=>transport.close()};
    const options=await makeOptions({sourceRoot:recipe.sourceRoot,...expected,signal,capturedAuthority,
     authority:{async verifyInputs(actual){await verify();must(capture(actual)===capture(expected),'PRODUCTION_AUTHORITY26_CAPTURED_SCOPE');}}},{resolveFile});active();
    options.capturedSource.read={async *sourceRows(descriptor){must(capture(descriptor)===capture(recipe.source),'PRODUCTION_AUTHORITY26_CAPTURED_SCOPE');await ensureIndex();yield*transport.sourceRows({...recipe.source,...physicalSource});},async typedRow(descriptor,key){must(capture(descriptor)===capture(recipe.typed),'PRODUCTION_AUTHORITY26_CAPTURED_SCOPE');await ensureIndex();return transport.typedRow({...recipe.typed,...physicalTyped},key);}};
    let resolver;if(context.database?.ready)options.resolveNativeBinding=async query=>{await verify();const runtime=context.database.ready();
     resolver??=(group==='SALES_DETAILS'?createPostgresHistorySalesDetailBindingResolver26:createPostgresHistorySettlementBindingResolver26)(runtime.pool,sourceScope,runtime.runtime26);
     const result=await resolver(query);active();return result;};
    captured.set(group,{transport,recipe,options});return options;
   },
   async openRetainedClosure(group,recipe,scope,context){await verifyRecipe(group,recipe,binding);must(capture(scope)===capture(fixed.closureScope)&&context?.group===group
     &&context.signal instanceof AbortSignal&&!context.signal.aborted,'PRODUCTION_AUTHORITY26_CLOSURE_SCOPE');const state=captured.get(group);
    must(state&&recipe.supportModules?.closure,'PRODUCTION_AUTHORITY26_CAPTURED_INPUT_REQUIRED');
    const locate=sourceFileResolver26(recipe);if(locate){const dependency=recipe.supportModules.closureWindow;must(dependency,'PRODUCTION_AUTHORITY26_CLOSURE_DEPENDENCY');const closureFile=await locate(recipe.supportModules.closure),windowFile=await locate(dependency);active();must(resolve(dirname(closureFile.path),'prepare-retained-sales-header-window-20261026.mjs')===windowFile.path,'PRODUCTION_AUTHORITY26_CLOSURE_DEPENDENCY');await code(dependency,'salesHeaderProjection26',locate);}
    const makeClosure=await code(recipe.supportModules.closure,'createCapturedSalesChildClosureSession',locate);
    const current=()=>{active();must(!context.signal.aborted,'PRODUCTION_AUTHORITY26_CLOSED');};const streams=new Set();
    const closeStreams=async()=>{await Promise.all([...streams].map(async stream=>{const ended=stream.closed?Promise.resolve():new Promise(resolve=>stream.once('close',resolve));stream.destroy();await ended;}));streams.clear();};
    const rows=async function*(logical,relation){current();const locate=sourceFileResolver26(recipe),ref=locate?{...logical,...await locate(logical)}:logical;current();const before=await lstat(ref.path);current();must(before.isFile()&&!before.isSymbolicLink()&&before.size===ref.bytes,'PRODUCTION_AUTHORITY26_CAPTURED_FILE');
     const digest=createHash('sha256');let pendingBytes=Buffer.alloc(0),bytes=0,count=0,previous;
     const stream=createReadStream(ref.path);streams.add(stream);try{for await(const chunk of stream){current();bytes+=chunk.length;must(bytes<=ref.bytes,'PRODUCTION_AUTHORITY26_CAPTURED_FILE');digest.update(chunk);pendingBytes=Buffer.concat([pendingBytes,chunk]);let end;
      while((end=pendingBytes.indexOf(10))>=0){must(end>0&&end+1<=4194304,'PRODUCTION_AUTHORITY26_CAPTURED_LINE');const raw=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(pendingBytes.subarray(0,end)));pendingBytes=pendingBytes.subarray(end+1);
       const row=historyClosureProjectionRow26(relation,raw.projection);must(capture(raw)===capture(row)&&(previous===undefined||Buffer.compare(Buffer.from(previous),Buffer.from(row.key))<0)&&++count<=ref.rows,'PRODUCTION_AUTHORITY26_CAPTURED_ROW');previous=row.key;yield row;current();}
      must(pendingBytes.length<4194304,'PRODUCTION_AUTHORITY26_CAPTURED_LINE');}
      must(bytes===ref.bytes&&count===ref.rows&&pendingBytes.length===0&&digest.digest('hex')===ref.sha256&&same(before,await lstat(ref.path)),'PRODUCTION_AUTHORITY26_CAPTURED_EOF');current();
     }finally{const ended=stream.closed?Promise.resolve():new Promise(resolve=>stream.once('close',resolve));stream.destroy();await ended;streams.delete(stream);}};
    return owned(()=>makeClosure({entity:recipe.entity,binding:sourceScope,expectedRows:recipe.source.rows,sourceRows:()=>rows(recipe.source,'import_source_row'),
     typedRows:()=>rows(recipe.typed,recipe.entity==='SALES_LINE'?'history_sales_line':'history_sales_settlement'),sourceCodec:{historyClosureProjectionRow26},
     verify:async()=>{await verify();await state.transport.verify();},close:closeStreams,current}));
   },

 };
}

/** Only the exact controller-recorded human decision may close the absent
 * warehouse quantities for this batch. Original represented signed totals are
 * retained; no zero SKU, contributor or source row is generated. */
export function confirmedZeroWarehouseScope26({binding,warehouses,representedTotals,decision}){
 capture({binding,warehouses,representedTotals,decision});
 must(decision?.version==='C_EXACT24_WAREHOUSE_BASELINE_ZERO_USER_DECISION_V1'&&decision.status==='EXPLICIT_USER_CONFIRMED'
  &&decision.scope==='ONLY_THESE_EXACT24_WAREHOUSES_IN_THIS_BATCH_BASELINE'&&decision.source?.type==='DIRECT_HUMAN_REPLY_IN_CONTROLLER_CHAT'
  &&typeof decision.source.questionCallId==='string'&&decision.source.questionCallId.length>0&&capture(decision.binding)===capture(binding)
  &&Array.isArray(decision.warehouses)&&decision.warehouses.length===24&&Array.isArray(warehouses)&&warehouses.length===53&&Array.isArray(representedTotals),'SOURCE_PREPARATION26_EXACT_ZERO_DECISION');
 const totals=new Map();for(const row of representedTotals){must(typeof row.sourceKey==='string'&&!totals.has(row.sourceKey)&&typeof row.signedQuantity==='string'&&/^-?(?:0|[1-9]\d*)$/.test(row.signedQuantity),'SOURCE_PREPARATION26_WAREHOUSE_SCOPE');totals.set(row.sourceKey,row.signedQuantity);}
 const zero=new Map(),ids=new Set();for(const row of decision.warehouses){must(row.signedQuantity==='0'&&typeof row.sourceKey==='string'&&typeof row.nativeId==='string'&&!zero.has(row.sourceKey)&&!ids.has(row.nativeId)&&!totals.has(row.sourceKey),'SOURCE_PREPARATION26_EXACT_ZERO_DECISION');zero.set(row.sourceKey,row);ids.add(row.nativeId);}
 const keys=new Set(),nativeIds=new Set();const rows=warehouses.map(w=>{must(!keys.has(w.sourceKey)&&!nativeIds.has(w.targetId),'SOURCE_PREPARATION26_WAREHOUSE_SCOPE');keys.add(w.sourceKey);nativeIds.add(w.targetId);
  if(totals.has(w.sourceKey))return{sourceKey:w.sourceKey,nativeId:w.targetId,signedQuantity:totals.get(w.sourceKey)};
  const approved=zero.get(w.sourceKey);must(approved&&approved.nativeId===w.targetId,'SOURCE_PREPARATION26_EXACT_ZERO_DECISION');return{sourceKey:w.sourceKey,nativeId:w.targetId,signedQuantity:approved.signedQuantity};});
 must(totals.size===29&&zero.size===24&&[...totals.keys(),...zero.keys()].every(k=>keys.has(k)),'SOURCE_PREPARATION26_EXACT_ZERO_DECISION');return rows;
}

/** Bounded source-only diagnostics. Counters observe existing yields without
 * retaining, cloning, hashing or exposing a row. No execution capability. */
export function createSourcePreparationProgress26(){
 const started=performance.now(),elapsed=()=>Math.max(0,Math.floor(performance.now()-started));
 const counter=()=>({count:0,started:false,done:false,lastProgressElapsedMs:0});
 const groups=Object.fromEntries(sourceGroups.map(group=>[group,{sourceRows:counter(),typedRows:counter(),documents:counter()}]));
 const merged={sourceRows:counter(),typedRows:counter()},nativeFacts=Object.fromEntries(['PRODUCTS','SKUS','STOCK_CONTRIBUTORS'].map(group=>[group,{records:0,sourceRows:0}]));
 let stage='PREPARER_NOT_ENTERED';
 async function* rows(input,state,kind){
  state.started=true;state.lastProgressElapsedMs=elapsed();
  if(kind)stage=kind==='sourceRows'?'PREPARER_SOURCE_STREAM':'PREPARER_TYPED_STREAM';
  for await(const row of input){state.count++;state.lastProgressElapsedMs=elapsed();yield row;}
  state.done=true;state.lastProgressElapsedMs=elapsed();
  if(kind)stage=kind==='sourceRows'?'PREPARER_SOURCE_DONE':'PREPARER_TYPED_DONE';
 }
 return Object.freeze({
  nativeFact(group,sourceRows){const state=nativeFacts[group];state.records++;state.sourceRows+=sourceRows;},
  factories(original){return Object.fromEntries(sourceGroups.map(group=>[group,async(...args)=>{
   const raw=await original[group](...args);if(raw===null||typeof raw!=='object')return raw;const descriptors=Object.getOwnPropertyDescriptors(raw);
   // Leave malformed protocol bags to the original shared reader unchanged.
   if(Object.getPrototypeOf(raw)!==Object.prototype||Reflect.ownKeys(raw).length!==5||!['verify','sourceRows','typedRows','documents','close'].every(key=>descriptors[key]?.enumerable&&Object.hasOwn(descriptors[key],'value')&&typeof descriptors[key].value==='function'))return raw;
   const wrapped={...raw};for(const kind of ['sourceRows','typedRows','documents']){const fn=descriptors[kind].value;wrapped[kind]=()=>rows(fn(),groups[group][kind]);}return wrapped;
  }]));},
  streams(original){stage='PREPARER_BEFORE_FIRST_SOURCE';return{...original,sourceRows:rows(original.sourceRows,merged.sourceRows,'sourceRows'),typedRows:rows(original.typedRows,merged.typedRows,'typedRows')};},
  returned(){stage='PREPARER_RETURNED';},
  snapshot(){return{version:'SOURCE_PREPARATION_PROGRESS26_V1',stage,elapsedMs:elapsed(),nativeFacts:Object.fromEntries(Object.entries(nativeFacts).map(([group,value])=>[group,{...value}])),merged:Object.fromEntries(Object.entries(merged).map(([kind,value])=>[kind,{...value}])),groups:sourceGroups.map(group=>({group,...Object.fromEntries(Object.entries(groups[group]).map(([kind,value])=>[kind,{...value}]))}))};}
 });
}

/** Explicit original-source preparation. This entry has no database/runtime,
 * execution authority, stage/execute methods or substitute payload hash. The
 * original frozen D1 helpers derive the DATA hash and command files only after
 * genuine original files, membership facts and all11 streams have closed. */
export async function prepareProductionSourceOnly26({preparationFile,trustedPreparationSha256,signal}){
 let preparationPhase='SCOPE';const progress=createSourcePreparationProgress26();
 try{
 must(signal instanceof AbortSignal&&!signal.aborted,'SOURCE_PREPARATION26_ABORTED');
 const scopeBytes=await pinnedSmall(preparationFile,trustedPreparationSha256),scope=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(scopeBytes));capture(scope);
 const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 const keys=['version','registrationId','deadlineUtc','input','verifiedCurrent','warehouseStockScope','artifactRows','sourceManifestRef','requestKeys','chunkRows','baselineBusinessDate','outputParent'];
 must(exact(scope,keys)&&scope.version==='PRODUCTION_SOURCE_ONLY_PREPARATION26_V1'&&typeof scope.registrationId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(scope.registrationId)
  &&typeof scope.deadlineUtc==='string'&&Number.isFinite(Date.parse(scope.deadlineUtc))&&isAbsolute(scope.outputParent)&&typeof scope.sourceManifestRef==='string'&&scope.sourceManifestRef.length>0,'SOURCE_PREPARATION26_SCOPE');
 let closed=false,session;const resources=[],pinned=new Map(),captured=new Map();
 const active=()=>must(!closed&&!signal.aborted&&Date.now()<Date.parse(scope.deadlineUtc),'SOURCE_PREPARATION26_ABORTED');
 const holdSmall=async(ref,resolveFile)=>{active();must(exact(ref,['path','bytes','sha256'])&&ref.bytes>0&&ref.bytes<=4194304,'SOURCE_PREPARATION26_METADATA_REF');
  const physical=resolveFile?await resolveFile(ref):ref,bytes=await pinnedSmall(ref.path,ref.sha256,resolveFile);active();must(bytes.length===ref.bytes,'SOURCE_PREPARATION26_METADATA_REF');const stat=await lstat(physical.path);active();pinned.set(ref.path,{physical,stat});return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));};
 const verify=async()=>{active();for(const f of pinned.values()){must(same(f.stat,await lstat(f.physical.path)),'SOURCE_PREPARATION26_INPUT_CHANGED');active();}};
 const closeResources=async()=>{const results=await Promise.allSettled([...resources].reverse().map(r=>r.close()));resources.length=0;const errors=results.filter(r=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Source preparation IO close failed');};
 const owned=async openSource=>{active();const raw=await openSource();must(typeof raw?.close==='function','SOURCE_PREPARATION26_RESOURCE');let closing;const resource={...raw,close(){return closing??=Promise.resolve().then(()=>raw.close());}};
  resources.push(resource);if(closed||signal.aborted){await resource.close();active();}return resource;};
 const code=async(ref,name,resolveFile)=>{active();const physical=resolveFile?await resolveFile(ref):ref,bytes=await pinnedSmall(ref.path,ref.sha256,resolveFile);active();must(bytes.length===ref.bytes,'SOURCE_PREPARATION26_MODULE_PIN');const module=await import(pathToFileURL(physical.path).href);active();const fn=own(module,name);must(typeof fn==='function','SOURCE_PREPARATION26_MODULE_PIN');return fn;};
 let input,core,coreData,short;const skuMemberships=[],baselineItems=[],contributors=[],effectiveGroups=[],coverage=new Map(),warehouseTotals=new Map(),warehouseUnits=new Map(),skuIdentities=new Map(),warehouseIdentities=new Map();let stockSelection;
 const observePrepared=(group,p,logical,entry)=>{active();progress.nativeFact(group,entry.sources.length);coverage.set(logical.path,(coverage.get(logical.path)??0)+entry.sources.length);
  if(group==='SKUS'){const s=p.canonicalSource;must(!skuIdentities.has(s.sourceKey),'SOURCE_PREPARATION26_DUPLICATE_SKU');skuIdentities.set(s.sourceKey,p.nativeSku.id);skuMemberships.push({targetType:'SKU',targetId:p.nativeSku.id,sourceEntityType:s.entityType,sourceKey:s.sourceKey,sourceRecordHash:s.rowSha256,sourceFileRef:s.fileRef,nativeRecord:structuredClone(p.importRecord)});}
  if(group==='STOCK_CONTRIBUTORS'){
   must(warehouseIdentities.get(p.warehouse.sourceKey)===p.warehouse.nativeId&&skuIdentities.get(p.sku.canonicalSourceKey)===p.sku.nativeId,'SOURCE_PREPARATION26_STOCK_NATIVE_IDENTITY');
   if(stockSelection)must(capture(stockSelection)===capture(p.selection),'SOURCE_PREPARATION26_STOCK_SELECTION');else stockSelection=structuredClone(p.selection);
   const key=p.canonicalStock['来源编号'],sourceUnit=p.contributors[0].lineage.sourceUnit;
   effectiveGroups.push({canonicalStockSourceKey:key,warehouseSourceKey:p.warehouse.sourceKey,canonicalSkuSourceKey:p.sku.canonicalSourceKey,warehouseId:p.warehouse.nativeId,skuId:p.sku.nativeId,signedQuantity:p.signedQuantity,sourceUnit,contributorCount:p.contributors.length,effectiveRowHash:requestHash(p.canonicalStock)});
   baselineItems.push({targetType:'INVENTORY_LEDGER',warehouseId:p.warehouse.nativeId,skuId:p.sku.nativeId,quantity:BigInt(p.signedQuantity),businessDate:scope.baselineBusinessDate,sourceEntityType:'INVENTORY_BASELINE',sourceKey:key,sourceRecordHash:requestHash(p.canonicalStock),sourceFileRef:p.selection.path});
   warehouseTotals.set(p.warehouse.sourceKey,(warehouseTotals.get(p.warehouse.sourceKey)??0n)+BigInt(p.signedQuantity));
   for(const c of p.contributors){const s=c.source,l=c.lineage;contributors.push({sourceRowId:s.id,sourceKey:s.sourceKey,sourceFileSha256:s.sourceFileSha256,rowSha256:s.rowSha256,fileRef:s.fileRef,sheet:s.sheet,rowNo:s.rowNo,warehouseSourceKey:p.warehouse.sourceKey,canonicalSkuSourceKey:p.sku.canonicalSourceKey,oldSkuSourceId:l.oldSkuSourceId,canonicalStockSourceKey:key,warehouseId:p.warehouse.nativeId,skuId:p.sku.nativeId,signedQuantity:l.signedQuantity,sourceUnit:l.sourceUnit});const unitKey=JSON.stringify([p.warehouse.sourceKey,l.sourceUnit]);warehouseUnits.set(unitKey,(warehouseUnits.get(unitKey)??0n)+BigInt(l.signedQuantity));}
  }
 };
 try{
  pinned.set(preparationFile,{physical:{path:preparationFile},stat:await lstat(preparationFile)});active();preparationPhase='INPUT';input=await holdSmall(scope.input);
  must(input.version==='PRODUCTION_SOURCE_PROVIDER26_INPUT_V1'&&input.binding?.phase==='FULL_SOURCE_CONTINUATION_26_V1'&&input.producers&&Object.keys(input.producers).length===11,'SOURCE_PREPARATION26_INPUT');
  must(scope.baselineBusinessDate===input.binding.cutoffAt.slice(0,10),'SOURCE_PREPARATION26_BASELINE_DATE');
  short=Object.fromEntries(['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'].map(k=>[k,input.binding[k]]));
  preparationPhase='CORE_DATA';coreData=await holdSmall(input.core.coreProjection,sourceFileResolver26(input.producers.PARTIES));
  must(coreData.dataComplete===true&&coreData.publicationAuthorized===false&&Array.isArray(coreData.missing)&&coreData.missing.length===0&&coreData.identity?.batchId===short.batchId
   &&coreData.identity.coreReceiptId===input.core.receiptId&&coreData.identity.coreSourceDigest===input.core.coreSourceDigest&&Array.isArray(coreData.warehouses)&&coreData.warehouses.length===53,'SOURCE_PREPARATION26_CORE_DATA');
  must(['batchId','actorAccountId','fixedSourceNamespace','selectionSha256','coreReceiptId','coreSourceDigest'].every(k=>coreData.identity[k]===(k==='coreReceiptId'?input.core.receiptId:k==='coreSourceDigest'?input.core.coreSourceDigest:input.binding[k])),'SOURCE_PREPARATION26_CORE_DATA');
  for(const w of coreData.warehouses){must(!warehouseIdentities.has(w.sourceKey),'SOURCE_PREPARATION26_CORE_DATA');warehouseIdentities.set(w.sourceKey,w.targetId);}
  core={coreReceiptId:input.core.receiptId,coreSourceDigest:input.core.coreSourceDigest,coreMembers:coreData.coreMembers,staffProofs:coreData.staffProofs,coreMaintenanceBinding:coreData.coreMaintenanceBinding};
  // Verify current original readback BEFORE any large source pass. A receipt
  // summary or a reconstructed birth22 object is not a current-chain proof.
  preparationPhase='VERIFIED_CURRENT';const current=await holdSmall(scope.verifiedCurrent);must(current.actorAccountId===input.binding.actorAccountId&&current.fixedSourceNamespace===short.fixedSourceNamespace&&current.selectionSha256===short.selectionSha256
   &&Array.isArray(current.coreClaims)&&current.coreClaims.length===22&&Array.isArray(current.coreWarehouses)&&current.coreWarehouses.length===22&&Array.isArray(current.records)&&Array.isArray(current.committedOperations)&&current.claims?.length===current.checkpoint?.cursor,'SOURCE_PREPARATION26_VERIFIED_CURRENT_REQUIRED');
  let warehouseScope,zeroDecision;
  preparationPhase='WAREHOUSE_SCOPE_INPUT';if(scope.warehouseStockScope!==null){const saved=await holdSmall(scope.warehouseStockScope);if(Array.isArray(saved)){must(saved.length===53,'SOURCE_PREPARATION26_WAREHOUSE_SCOPE');warehouseScope=saved;}else{zeroDecision=saved;must(saved?.version==='C_EXACT24_WAREHOUSE_BASELINE_ZERO_USER_DECISION_V1'&&saved.status==='EXPLICIT_USER_CONFIRMED'&&capture(saved.binding)===capture(short),'SOURCE_PREPARATION26_EXACT_ZERO_DECISION');}}
  const preparation={warehouses:coreData.warehouses,verify,close:closeResources,observePrepared,phase(value){preparationPhase=value;},
   async coreProjection(payloadHash){await verify();must(hash(payloadHash),'SOURCE_PREPARATION26_REAL_DATA_HASH_REQUIRED');return{authorizedPayloadHash:payloadHash,coreMembers:structuredClone(core.coreMembers),staffProofs:structuredClone(core.staffProofs),coreMaintenanceBinding:structuredClone(core.coreMaintenanceBinding),verify};},
   async verifyDerivedData(prepared,data){await verify();must(prepared.authorizedPayloadHash===prepareFullPayloadData26(data).authorizedPayloadHash&&capture(data.core)===capture(core)
    &&data.stock.contributors.length===contributors.length&&data.stock.effectiveGroups.length===effectiveGroups.length,'SOURCE_PREPARATION26_REAL_DATA_HASH_REQUIRED');},
   setDerivedInput(fixed,binding){this.capturedIO=originalCapturedSourceIO26({binding,fixed,signal,verify,active,code,owned,captured});},capturedIO:null};
  preparationPhase='SOURCE_SESSION';const provider=createOriginalProductionSources26(input,{sourcePreparation:preparation});session=await provider.openSourceSession({binding:structuredClone(input.binding),sources:{},signal});
  await session.preflight();await session.collectNativeFacts();await verify();
  preparationPhase='WAREHOUSE_SCOPE';const unrepresented=coreData.warehouses.filter(w=>!warehouseTotals.has(w.sourceKey)).map(w=>({sourceKey:w.sourceKey,nativeId:w.targetId}));
  if(zeroDecision)warehouseScope=confirmedZeroWarehouseScope26({binding:short,warehouses:coreData.warehouses,representedTotals:[...warehouseTotals].map(([sourceKey,total])=>({sourceKey,signedQuantity:total.toString()})),decision:zeroDecision});
  if(!warehouseScope){return{status:'NEEDS_EXPLICIT_COMPLETE_WAREHOUSE_STOCK_SCOPE',registrationId:scope.registrationId,originalSourceFilesVerified:true,nativeSkus:skuMemberships.length,effectiveGroups:effectiveGroups.length,contributors:contributors.length,
    unrepresentedWarehouses:unrepresented,notInferredZero:true,authorizedPayloadHashGenerated:false,executionAuthorizationIssued:false,executionReady:false};}
  for(const row of warehouseScope){const w=coreData.warehouses.find(w=>w.sourceKey===row.sourceKey&&w.targetId===row.nativeId);must(w&&typeof row.signedQuantity==='string','SOURCE_PREPARATION26_WAREHOUSE_SCOPE');
   if(warehouseTotals.has(row.sourceKey))must(BigInt(row.signedQuantity)===warehouseTotals.get(row.sourceKey),'SOURCE_PREPARATION26_WAREHOUSE_SCOPE');}
  preparationPhase='ARTIFACT_COVERAGE';const groups=sourceGroups.map(group=>({group,artifacts:input.producers[group].fileLocations.filter(e=>e.kind!=='CODE').map(e=>{
   const observed=coverage.get(e.logical.path),declared=scope.artifactRows?.[group]?.[e.logical.path];
   const rows=observed??declared??(['METADATA','CORE_DATA'].includes(e.kind)?0:undefined);
   must(Number.isSafeInteger(rows)&&rows>=0&&(e.kind!=='DATA'||rows>0)&&(observed===undefined||declared===undefined||observed===declared),'SOURCE_PREPARATION26_ARTIFACT_COVERAGE_REQUIRED');
   // Coverage is the ORIGINAL exact artifact bytes, not a substitute root or
   // self-selected payload hash. Declared member rows bind the accepted file;
   // the original all11 builder independently closes actual stream counts.
   return{logicalRole:e.roles.join('+'),bytes:e.logical.bytes,sha256:e.logical.sha256,rows,memberCoverage:{rows,sha256:e.logical.sha256}};
  })}));
  if(zeroDecision){const ref=scope.warehouseStockScope;groups.find(g=>g.group==='STOCK_CONTRIBUTORS').artifacts.push({logicalRole:'exact24-user-approved-zero-baseline',bytes:ref.bytes,sha256:ref.sha256,rows:24,memberCoverage:{rows:24,sha256:ref.sha256}});}
  preparationPhase='DATA_ASSEMBLY';const data={binding:short,core,groups,expectedCounts:input.closureScope.expectedCounts,expectedSourceEntityCounts:input.closureScope.expectedSourceEntityCounts,
   inventoryExpectedCounts:{WAREHOUSE:53,SKU:skuMemberships.length,INVENTORY_LEDGER:baselineItems.length,IMPORT_BATCH:1},
   stock:{effectiveStockCsvSha256:stockSelection.csvSha256,contributorLineageCsvSha256:stockSelection.lineageCsvSha256,contributors,effectiveGroups,warehouses:warehouseScope,
    warehouseUnits:[...warehouseUnits].map(([key,total])=>{const [warehouseSourceKey,sourceUnit]=JSON.parse(key);return{warehouseSourceKey,sourceUnit,signedQuantity:total.toString()};})}};
  const closureScope=await session.bindRealData(data);await verify();
  const {consumeAuthorizedHistoryClosureStreams26}=await import('../import-v2/authorized-history-closure-reader.mjs');
  preparationPhase='ALL11_CLOSURE';const prepared=await consumeAuthorizedHistoryClosureStreams26({scope:closureScope,openSources:progress.factories(session.openSources),trustedSelectionSha256:short.selectionSha256,trustedAuthorizedPayloadHash:closureScope.authorizedPayloadHash},
   async originalStreams=>{preparationPhase='ORIGINAL_BINDINGS_AND_STREAMS';const streams=progress.streams(originalStreams);const result=await prepareFullSourceBindings26({data,sourceRows:streams.sourceRows,typedRows:streams.typedRows,documents:streams.documents,warehouses:coreData.warehouses,skuMemberships,baselineItems,
    verifiedCurrent:current,actorAccountId:input.binding.actorAccountId,sourceManifestRef:scope.sourceManifestRef,requestKeys:scope.requestKeys,chunkRows:scope.chunkRows});progress.returned();return result;});
  await verify();preparationPhase='PRIVATE_WRITER';const written=await writeFullSourceBindings26({outputParent:scope.outputParent,registrationId:scope.registrationId,prepared});await verify();
  return{status:'ORIGINAL_FULL_SOURCE_BINDINGS_PREPARED_NOT_EXECUTION_AUTHORIZED',...written,sourceGroups:11,nativeSkus:skuMemberships.length,baselineItems:baselineItems.length,unrepresentedWarehouses:unrepresented,
   executionAuthorizationIssued:false,executionReady:false,DBConnected:false,MAINOrPublishExecuted:false};
 }finally{try{await session?.close();}finally{await closeResources();closed=true;}}
 }catch(error){
  // Only a fixed code-path enum leaves this entry. Preserve the original error
  // object/code; never attach paths, row values, messages or source bodies.
  if(error&&typeof error==='object'&&Object.isExtensible(error)&&!Object.hasOwn(error,'sourcePreparationPhase'))Object.defineProperty(error,'sourcePreparationPhase',{value:preparationPhase,enumerable:true});
  if(error&&typeof error==='object'&&Object.isExtensible(error)&&!Object.hasOwn(error,'sourcePreparationProgress'))Object.defineProperty(error,'sourcePreparationProgress',{value:progress.snapshot(),enumerable:true});
  throw error;
 }
}

/** Concrete original authority entry. The input pin authenticates DATA only;
 * C's separately supplied execution-authorization pin is mandatory. No Pool,
 * runtime issuer, schema probe, signature substitute or caller callback grants. */
export async function openProductionSourceAuthority26({binding,inputFile,trustedInputSha256,signal}) {
 must(signal instanceof AbortSignal&&!signal.aborted,'PRODUCTION_AUTHORITY26_CLOSED');
 const inputStat=await lstat(inputFile),inputBytes=await pinnedSmall(inputFile,trustedInputSha256),fixed=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(inputBytes));
 capture(fixed);must(capture(fixed.binding)===capture(binding)&&binding.phase==='FULL_SOURCE_CONTINUATION_26_V1'
  &&hash(binding.authorizedPayloadHash)&&binding.authorizedPayloadHash!==binding.coreSourceDigest,'PRODUCTION_AUTHORITY26_FULL_BINDING_REQUIRED');
 const externalPin=process.env.NAIJUE_IMPORT_EXECUTION26_AUTHORIZATION_SHA256,authorization=fixed.executionAuthorization;
 must(hash(externalPin)&&authorization?.sha256===externalPin,'PRODUCTION_AUTHORITY26_C_EXECUTION_PIN_REQUIRED');
 let closed=false,closing,job,grant;const files=new Map(),resources=new Set(),pending=new Set(),commands=new Map(),captured=new Map();
 const inputDigest=capture(fixed),dataDigest=capture(Object.fromEntries(['version','binding','core','closureScope','warehouses','producers'].map(k=>[k,fixed[k]])));
 const active=()=>must(!closed&&!signal.aborted&&(!job||Date.now()<Date.parse(job.deadlineUtc)),'PRODUCTION_AUTHORITY26_CLOSED');
 const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 async function metadata(ref,maximum=4194304,reviver,resolveFile){active();must(exact(ref,['path','bytes','sha256'])&&Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&ref.bytes<=maximum,'PRODUCTION_AUTHORITY26_METADATA_REF');
  const physical=resolveFile?await resolveFile(ref):ref;active();const before=await lstat(physical.path);active();const bytes=await pinnedSmall(ref.path,ref.sha256,resolveFile);active();const stat=await lstat(physical.path);active();must(bytes.length===ref.bytes&&same(before,stat),'PRODUCTION_AUTHORITY26_METADATA_CHANGED');
  files.set(ref.path,{ref:structuredClone(ref),stat,physicalPath:physical.path});return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes),reviver);}
 async function unchanged(path){active();const f=files.get(path);must(f&&same(f.stat,await lstat(f.physicalPath??path)),'PRODUCTION_AUTHORITY26_METADATA_CHANGED');active();}
 async function verify(){active();for(const path of [inputFile,authorization.path,grant.job.path])await unchanged(path);active();}
 async function close(){if(closing)return closing;closed=true;closing=(async()=>{const failures=[];
  await Promise.allSettled([...pending]);for(const resource of [...resources].reverse())try{await resource.close();}catch(error){failures.push(error);}
  resources.clear();captured.clear();commands.clear();files.clear();if(failures.length)throw new AggregateError(failures,'Production authority26 cleanup failed');})();return closing;}
 async function owned(openSource){active();let operation;operation=(async()=>{const raw=await openSource();
  must(typeof raw?.close==='function','PRODUCTION_AUTHORITY26_SOURCE_REQUIRED');let closingResource;
  const resource={...raw,close(){if(!closingResource)closingResource=Promise.resolve().then(()=>raw.close());return closingResource;}};
  if(closed||signal.aborted){await resource.close();active();}resources.add(resource);return resource;})();pending.add(operation);
  try{return await operation;}finally{pending.delete(operation);}}
 async function code(ref,name,resolveFile){const physical=resolveFile?await resolveFile(ref):ref;active();const bytes=await pinnedSmall(ref?.path,ref?.sha256,resolveFile);active();must(bytes.length===ref.bytes,'PRODUCTION_AUTHORITY26_MODULE_PIN');
  const module=await import(pathToFileURL(physical.path).href);active();const fn=own(module,name);must(typeof fn==='function','PRODUCTION_AUTHORITY26_MODULE_REQUIRED');return fn;}
 const revive=(_key,value)=>value&&typeof value==='object'&&Object.keys(value).length===1&&Object.hasOwn(value,'__bigint')
  ? (must(typeof value.__bigint==='string'&&/^(?:0|-?[1-9]\d*)$/.test(value.__bigint),'PRODUCTION_AUTHORITY26_COMMAND_INTEGER'),BigInt(value.__bigint)):value;
 try{
  files.set(inputFile,{ref:{path:inputFile,bytes:inputBytes.length,sha256:trustedInputSha256},stat:inputStat});must(same(inputStat,await lstat(inputFile)),'PRODUCTION_AUTHORITY26_METADATA_CHANGED');active();
  grant=await metadata(authorization);
  must(exact(grant,['version','decision','issuingAuthority','realImportExecutionAuthorized','job','sourceInputDigest','groups','mainCommands'])
   &&grant.version==='C_PRODUCTION_SOURCE_EXECUTION26_AUTHORIZATION_V1'&&grant.decision==='AUTHORIZE_EXACT_REGISTERED_FULL_SOURCE_EXECUTION'
   &&grant.issuingAuthority==='C'&&grant.realImportExecutionAuthorized===true&&grant.sourceInputDigest===dataDigest
   &&Array.isArray(grant.groups)&&grant.groups.length===sourceGroups.length&&new Set(grant.groups).size===sourceGroups.length
   &&sourceGroups.every(g=>grant.groups.includes(g)),'PRODUCTION_AUTHORITY26_C_EXECUTION_SCOPE');
  const rawJob=await metadata(grant.job);job=validateExecutableSourceHostJob26(rawJob);
  must(capture(job.binding)===capture(binding)&&job.registrationId.length>0&&fixed.authorityModule?.sha256===job.providers.sha256
   &&(!process.env.NAIJUE_IMPORT_JOB_FILE||process.env.NAIJUE_IMPORT_JOB_FILE===grant.job.path),'PRODUCTION_AUTHORITY26_REGISTERED_JOB');
  must(exact(grant.mainCommands,['BIND','ACCOUNT','PUBLISH'])&&Array.isArray(grant.mainCommands.ACCOUNT)&&grant.mainCommands.ACCOUNT.length>0
   &&grant.mainCommands.ACCOUNT.length+2<=job.maxSteps,'PRODUCTION_AUTHORITY26_MAIN_INPUTS_REQUIRED');
  const byPhase={};for(const [phase,refs]of [['BIND',[grant.mainCommands.BIND]],['ACCOUNT',grant.mainCommands.ACCOUNT],['PUBLISH',[grant.mainCommands.PUBLISH]]]){
   byPhase[phase]=[];for(const ref of refs){const command=await metadata(ref,4194304,revive);capture(command);validateCutoffImportCommand(command);
    must(command.action===(phase==='BIND'?'IMPORT_BIND_FULL_SOURCE':phase==='ACCOUNT'?'IMPORT_CHUNK':'IMPORT_PUBLISH')
     &&command.actorAccountId===binding.actorAccountId&&command.batchId===binding.batchId&&!commands.has(command.requestKey),'PRODUCTION_AUTHORITY26_MAIN_SCOPE');
    commands.set(command.requestKey,{command,digest:capture(command),file:ref.path});byPhase[phase].push(command);
   }
  }
  const bind=byPhase.BIND[0],full=bind.fullBinding,publish=byPhase.PUBLISH[0];
  must(full.authorizedPayloadHash===binding.authorizedPayloadHash&&full.coreReceiptId===binding.coreReceiptId&&full.coreSourceDigest===binding.coreSourceDigest
   &&capture(full.historyExpectedCounts)===capture(fixed.closureScope.expectedCounts)&&full.inventoryExpectedCounts.WAREHOUSE===53
   &&full.inventoryExpectedCounts.IMPORT_BATCH===1&&full.inventoryExpectedCounts.INVENTORY_LEDGER>0
   &&new Set(full.sourceClosurePins.map(p=>p.group)).size===sourceGroups.length&&sourceGroups.every(g=>full.sourceClosurePins.some(p=>p.group===g)),
   'PRODUCTION_AUTHORITY26_FULL_SOURCE_FACTS_REQUIRED');
  const plan=captureHistoryTypedClosurePlan(publish.historyClosure);
  must(plan.authorizedPayloadHash===binding.authorizedPayloadHash&&plan.selectionSha256===binding.selectionSha256
   &&capture(plan.expectedCounts)===capture(fixed.closureScope.expectedCounts)&&capture(plan.sourceEntityCounts)===capture(fixed.closureScope.expectedSourceEntityCounts)
   &&publish.approval.sourceHash===binding.selectionSha256,'PRODUCTION_AUTHORITY26_PUBLICATION_FACTS_REQUIRED');
  let sequence=bind.expectedSequence+1,cursor=bind.expectedCursor;const totals={WAREHOUSE:22,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:1},identities=new Set(),targets=new Set();
  for(const command of byPhase.ACCOUNT){must(command.expectedSequence===sequence&&command.expectedCursor===cursor,'PRODUCTION_AUTHORITY26_COMMAND_CHAIN');
   for(const item of command.items){const source=JSON.stringify([item.sourceEntityType,item.sourceKey]),target=item.targetType==='INVENTORY_LEDGER'?JSON.stringify([item.targetType,item.warehouseId,item.skuId]):JSON.stringify([item.targetType,item.targetId]);
    must(!identities.has(source)&&!targets.has(target),'PRODUCTION_AUTHORITY26_DUPLICATE_MAIN');identities.add(source);targets.add(target);totals[item.targetType]++;}
   sequence++;cursor+=command.items.length;
  }
  must(publish.expectedSequence===sequence&&publish.expectedCursor===cursor&&capture(totals)===capture(full.inventoryExpectedCounts),'PRODUCTION_AUTHORITY26_COMMAND_CHAIN');
  must(fixed.warehouses&&fixed.core.coreProjection,'PRODUCTION_AUTHORITY26_CORE_DATA_REQUIRED');
  const projectionData=await metadata(fixed.core.coreProjection,4194304,undefined,sourceFileResolver26(fixed.producers.PARTIES));let projection=projectionData,warehouses=fixed.warehouses;
  if(projectionData.dataComplete===true){
   must(projectionData.publicationAuthorized===false&&Array.isArray(projectionData.missing)&&projectionData.missing.length===0
    &&exact(projectionData.identity,['batchId','actorAccountId','fixedSourceNamespace','selectionSha256','coreReceiptId','coreSourceDigest'])
    &&Object.entries(projectionData.identity).every(([key,value])=>binding[key]===value)&&projectionData.cutoffAt===binding.cutoffAt
    &&projectionData.target?.database===binding.target.database&&projectionData.target.role===binding.target.role
    &&Array.isArray(projectionData.originalCoreClaimRecordIds)&&new Set(projectionData.originalCoreClaimRecordIds).size===22,'PRODUCTION_AUTHORITY26_CORE_DATA_REQUIRED');
   projection={authorizedPayloadHash:binding.authorizedPayloadHash,coreMembers:projectionData.coreMembers,staffProofs:projectionData.staffProofs,coreMaintenanceBinding:projectionData.coreMaintenanceBinding};
   if(!Array.isArray(warehouses)){must(capture(warehouses)===capture(fixed.core.coreProjection),'PRODUCTION_AUTHORITY26_CORE_DATA_REQUIRED');warehouses=projectionData.warehouses;}
  }
  must(Array.isArray(warehouses)&&warehouses.length===53,'PRODUCTION_AUTHORITY26_CORE_DATA_REQUIRED');
  must(exact(projection,['authorizedPayloadHash','coreMembers','staffProofs','coreMaintenanceBinding'])&&projection.authorizedPayloadHash===binding.authorizedPayloadHash
   &&Array.isArray(projection.coreMembers)&&projection.coreMembers.length===115&&Array.isArray(projection.staffProofs)&&projection.staffProofs.length===49
   &&capture(projection.coreMaintenanceBinding)===capture(full.coreMaintenanceBinding),'PRODUCTION_AUTHORITY26_CORE_DATA_REQUIRED');
  const members=new Map(full.coreMaintenanceBinding.members.map(m=>[m.sourceRowId,m]));
  must(new Set(projection.coreMembers.map(m=>m.sourceRowId)).size===115&&projection.coreMembers.every(m=>exact(m,['sourceRowId','entity','sourceKey','nativeId'])
   &&capture(m)===capture(Object.fromEntries(['sourceRowId','entity','sourceKey','nativeId'].map(k=>[k,members.get(m.sourceRowId)?.[k]])))), 'PRODUCTION_AUTHORITY26_CORE_MEMBER');
  const proofs=new Set();for(const proof of projection.staffProofs){must(exact(proof,['sourceRowId','bootstrapAccounts'])&&!proofs.has(proof.sourceRowId)
    &&members.get(proof.sourceRowId)?.entity==='STAFF','PRODUCTION_AUTHORITY26_CORE_PROOF');proofs.add(proof.sourceRowId);
   const safe=value=>{if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){must(!/password|credential|token|secret|salt/i.test(key),'PRODUCTION_AUTHORITY26_UNSAFE_CORE_PROOF');safe(child);}};safe(proof.bootstrapAccounts);}
  async function groupAllowed(group,recipe,actualBinding){await verify();must(grant.groups.includes(group)&&capture(actualBinding)===capture(binding)
   &&capture(recipe)===capture(fixed.producers[group]),'PRODUCTION_AUTHORITY26_GROUP_SCOPE');}
  const baselineItems=new Map(byPhase.ACCOUNT.flatMap(c=>c.items).filter(i=>i.targetType==='INVENTORY_LEDGER').map(i=>[i.sourceKey,i])),stockGroups=new Map();
  async function mainAllowed(actor,command){await verify();
   if(command.action==='IMPORT_CHUNK'&&fixed.closureScope.expectedSourceEntityCounts.INVENTORY_BASELINE>0)must(stockGroups.size===baselineItems.size,'PRODUCTION_AUTHORITY26_STOCK_MAIN_INCOMPLETE');capture(command);validateCutoffImportCommand(command);const expected=commands.get(command.requestKey);
   must(actor===binding.actorAccountId&&command.actorAccountId===actor&&expected&&capture(command)===expected.digest,'PRODUCTION_AUTHORITY26_MAIN_NOT_AUTHORIZED');await unchanged(expected.file);}
  const originalCaptured=originalCapturedSourceIO26({binding,fixed,signal,verify,active,code,owned,captured});
  let productSource;
  const authority={
   async verifyInputs(actual){await verify();must(actual.inputDigest===inputDigest&&capture(actual.binding)===capture(binding)&&capture(actual.core)===capture(fixed.core),'PRODUCTION_AUTHORITY26_INPUT_CHANGED');},
   assertGroupAllowed:groupAllowed,
   async assertExecutionAllowed(actual){await verify();must(capture(actual)===capture(binding),'PRODUCTION_AUTHORITY26_BINDING_CHANGED');},
   async authorizeStep(step,actualBinding){await verify();must(capture(actualBinding)===capture(binding)&&step&&Object.keys(step).sort().join(',')==='kind,payload','PRODUCTION_AUTHORITY26_STEP_SCOPE');capture(step);
    if(step.kind==='MAIN')return mainAllowed(binding.actorAccountId,step.payload);
    if(step.kind==='CLOSURE'){must(capture(captureHistoryTypedClosurePlan(step.payload.plan))===capture(plan),'PRODUCTION_AUTHORITY26_CLOSURE_NOT_AUTHORIZED');return;}
    const group=sourceGroups.find(g=>stages[g][0]===step.kind);must(group&&grant.groups.includes(group),'PRODUCTION_AUTHORITY26_STEP_SCOPE');
    if(group==='STOCK_CONTRIBUTORS'){
     const prepared=step.payload;validatePreparedNativeStockGroup(prepared);const key=prepared.canonicalStock['来源编号'],item=baselineItems.get(key);
     must(item&&item.sourceEntityType==='INVENTORY_BASELINE'&&item.warehouseId===prepared.warehouse.nativeId&&item.skuId===prepared.sku.nativeId
      &&item.quantity===BigInt(prepared.signedQuantity),'PRODUCTION_AUTHORITY26_STOCK_MAIN_MISMATCH');
     const prior=stockGroups.get(key);must(prior===undefined||prior===capture(prepared),'PRODUCTION_AUTHORITY26_STOCK_MAIN_MISMATCH');stockGroups.set(key,capture(prepared));
    }
    const p=step.payload.input??step.payload;must(p.batchId===binding.batchId&&p.fixedSourceNamespace===binding.fixedSourceNamespace
     &&p.selection?.selectionSha256===binding.selectionSha256,'PRODUCTION_AUTHORITY26_STEP_SCOPE');
   },
   assertAllowed:mainAllowed,authorizeNativeCommand:mainAllowed,
   async openRetained(group,recipe,context){await groupAllowed(group,recipe,context.binding);
    // Only explicit original reader options can select these existing genuine
    // factories. A retained path alone never becomes a producer or raw fallback.
    must(Object.hasOwn(recipeOpeners,group)&&recipe.options,'PRODUCTION_AUTHORITY26_RETAINED_READER_INPUT_REQUIRED');
    return owned(()=>recipeOpeners[group](structuredClone(recipe.options),{resolveFile:sourceFileResolver26(recipe)}));
   },
   async capturedOptions(group,recipe,context){await groupAllowed(group,recipe,context.binding);must(context.database?.ready,'PRODUCTION_AUTHORITY26_CAPTURED_INPUT_REQUIRED');return originalCaptured.capturedOptions(group,recipe,context);},
   async openRetainedClosure(group,recipe,scope,context){await groupAllowed(group,recipe,binding);return originalCaptured.openRetainedClosure(group,recipe,scope,context);},
   async coreProjection(core,actualBinding){await verify();must(capture(core)===capture(fixed.core)&&capture(actualBinding)===capture(binding),'PRODUCTION_AUTHORITY26_CORE_DATA_REQUIRED');await unchanged(fixed.core.coreProjection.path);
    return{...structuredClone(projection),async verify(){await verify();await unchanged(fixed.core.coreProjection.path);}};
   },
   async *mainCommands(phase,{binding:actual,core,progress}){await verify();must(Object.hasOwn(byPhase,phase)&&capture(actual)===capture(binding)&&capture(core)===capture(fixed.core),'PRODUCTION_AUTHORITY26_CURRENT_CHECKPOINT');
    const selected=selectProductionContinuation26({binding,commands:[...byPhase.BIND,...byPhase.ACCOUNT,...byPhase.PUBLISH],progress});
    const expected=new Map(warehouses.map(w=>[w.nativeRecord?.id,w]));
    must(progress.warehouses.length+progress.remainingWarehouses.length===warehouses.length,'PRODUCTION_AUTHORITY26_WAREHOUSE_IDENTITY');
    const seen=new Set();for(const item of [...progress.warehouses,...progress.remainingWarehouses]){must(!seen.has(item.nativeRecord?.id)&&capture(expected.get(item.nativeRecord?.id))===capture(item),'PRODUCTION_AUTHORITY26_WAREHOUSE_IDENTITY');seen.add(item.nativeRecord.id);}
    const committed=new Set(progress.warehouses.map(item=>item.nativeRecord.id)),remaining=new Map(progress.remainingWarehouses.map(item=>[item.nativeRecord.id,item]));
    const accounted=selected.remaining.filter(c=>c.action==='IMPORT_CHUNK').flatMap(command=>command.items.filter(item=>item.targetType==='WAREHOUSE'));
    must(accounted.length===remaining.size&&accounted.every(item=>!committed.has(item.nativeRecord?.id)&&capture(item)===capture(remaining.get(item.nativeRecord.id))),'PRODUCTION_AUTHORITY26_WAREHOUSE_IDENTITY');
    for(const command of selected.remaining.filter(c=>byPhase[phase].some(original=>original.requestKey===c.requestKey))){await mainAllowed(binding.actorAccountId,command);yield structuredClone(command);active();}
   },
   async authorizeProductSource(payload){await verify();const options=fixed.producers.PRODUCTS.productEvidenceSource;must(options,'PRODUCTION_AUTHORITY26_PRODUCT_EVIDENCE_REQUIRED');
    productSource??=await owned(()=>openReviewedProductEvidenceSource(structuredClone(options),{resolveFile:sourceFileResolver26(fixed.producers.PRODUCTS)}));await productSource.authorize(payload);active();
   },close,now(){active();return new Date().toISOString();}
  };
  await verify();return authority;
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Production authority26 construction and cleanup failed');}throw error;}
}
