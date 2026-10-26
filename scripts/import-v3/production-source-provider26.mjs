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
import {openReviewedTransferLineSource26} from './native-transfer-line-source26.mjs';
import {openAuthorizedSalesDetailReader} from '../import-v2/authorized-sales-detail-reader.mjs';
import {openAuthorizedSettlementReader} from '../import-v2/authorized-settlement-reader.mjs';
import {openAuthorizedHistoryClosureReader26,HISTORY_CLOSURE_SOURCE_GROUPS} from '../import-v2/authorized-history-closure-reader.mjs';
import {readCoreImportContinuation26} from './run.mjs';
import {validateExecutableSourceHostJob26} from './production-source-host.mjs';
import {validateCutoffImportCommand} from '../../packages/application/src/inventory-cutoff-import.ts';
import {captureHistoryTypedClosurePlan} from '../../packages/application/src/history-typed-publication.ts';
import {openReviewedProductEvidenceSource} from './native-source-authorizers.mjs';
import {createPostgresHistorySalesDetailBindingResolver26} from '../../adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts';
import {createPostgresHistorySettlementBindingResolver26} from '../../adapters/postgres/src/import-v3-history-settlement-staging-store.ts';
import {validatePreparedNativeBarcode,nativeBarcodeSourceEvidence,validateNativeBarcodeSchemeInitializationRows26} from '../../packages/application/src/native-barcode-import.ts';
import {historyClosureProjectionRow26,historyClosureRowHash} from '../../packages/application/src/history-typed-closure.ts';

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
async function pinnedSmall(path,pin){
 must(typeof path==='string'&&isAbsolute(path)&&hash(pin),'PRODUCTION_PROVIDER26_OUTSIDE_PIN');
 const before=await lstat(path);must(before.isFile()&&!before.isSymbolicLink()&&before.size<=4194304,'PRODUCTION_PROVIDER26_INPUT_FILE');
 const bytes=await readFile(path);must(bytes.length===before.size&&same(before,await lstat(path))&&createHash('sha256').update(bytes).digest('hex')===pin,'PRODUCTION_PROVIDER26_INPUT_CHANGED');
 return bytes;
}
/** Inputs are DATA only. Authority is separately supplied reviewed executable
 * code, never derived from the input/CORE/source manifest's own checksum.
 * RETAINED recipes consume already captured prepared/closure rows under that
 * authority; REVIEWED recipes invoke the actual original readers below. */
export function createProductionSourceProvider26(inputs,authority){
 capture(inputs);const fixed=structuredClone(inputs),inputDigest=capture(fixed);
 const a=methods(authority,['verifyInputs','assertGroupAllowed','assertExecutionAllowed','authorizeStep','assertAllowed','authorizeNativeCommand',
  'openRetained','capturedOptions','openRetainedClosure','coreProjection','mainCommands','authorizeProductSource','close','now']);
 must(fixed.version==='PRODUCTION_SOURCE_PROVIDER26_INPUT_V1'&&fixed.binding?.phase==='FULL_SOURCE_CONTINUATION_26_V1'
  &&hash(fixed.binding.authorizedPayloadHash)&&hash(fixed.binding.coreSourceDigest)&&fixed.binding.authorizedPayloadHash!==fixed.binding.coreSourceDigest,
  'PRODUCTION_PROVIDER26_FULL_BINDING_REQUIRED');
 must(fixed.core?.receiptId===fixed.binding.coreReceiptId&&fixed.core?.coreSourceDigest===fixed.binding.coreSourceDigest,
  'PRODUCTION_PROVIDER26_CORE_RECEIPT_REQUIRED');
 for(const group of sourceGroups){const r=own(fixed.producers,group);must(r&&['REVIEWED','RETAINED','CAPTURED_C144'].includes(r.mode),'PRODUCTION_PROVIDER26_GROUP_REQUIRED',group);
  if(r.mode==='REVIEWED')must(Object.hasOwn(recipeOpeners,group),'PRODUCTION_PROVIDER26_RETAINED_GROUP_REQUIRED',group);
  if(r.mode==='CAPTURED_C144')must(['SALES_DETAILS','SETTLEMENTS'].includes(group),'PRODUCTION_PROVIDER26_CAPTURED_GROUP',group);}
 must(Reflect.ownKeys(fixed.producers).length===sourceGroups.length,'PRODUCTION_PROVIDER26_GROUP_REQUIRED');
 let opened=false,warehouseItems=fixed.warehouses;
 return Object.freeze({providerVersion,sourceGroups,async openSourceSession({binding,sources,database,signal}){
  must(!opened,'PRODUCTION_PROVIDER26_SESSION_ALREADY_OPEN');opened=true;
  must(signal instanceof AbortSignal&&!signal.aborted&&requestHash(binding)===requestHash(fixed.binding),'PRODUCTION_PROVIDER26_BINDING_CHANGED');
  must(typeof database?.ready==='function','PRODUCTION_PROVIDER26_ORIGINAL_DATABASE_REQUIRED');
  let closed=false,closing,closure,preflightDone=false,stepsStarted=false;const readers=new Map(),disposers=[],issued=new Set(),coreSourceIds=new Set();
  const active=()=>must(!closed&&!signal.aborted,'PRODUCTION_PROVIDER26_CLOSED');
  const checked=async(fn,...args)=>{active();must(await fn(...args)===undefined,'PRODUCTION_PROVIDER26_AUTHORITY_RESULT');active();};
  async function close(){if(closing)return closing;closed=true;closing=(async()=>{const errors=[];
   for(const dispose of [...disposers].reverse())try{await dispose();}catch(error){errors.push(error);}
   try{await a.close();}catch(error){errors.push(error);}readers.clear();issued.clear();if(errors.length)throw new AggregateError(errors,'Production provider26 cleanup failed');})();return closing;}
  async function verify(){active();await checked(a.verifyInputs,{inputDigest,binding:structuredClone(binding),core:structuredClone(fixed.core)});}
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
   async function hold(ref,maximum){descriptor(ref,maximum);await regular(ref.path);current();const before=await lstat(ref.path);current();
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
    must(recipe.closureHelper.bytes===14879&&recipe.closureHelper.sha256==='c366469ba18d1b0be26b3478b8cd54ede013268d88feb644b36802c9b6e38ca6','PRODUCTION_BARCODE26_HELPER_PIN');
    const helperBytes=await pinnedSmall(recipe.closureHelper.path,recipe.closureHelper.sha256);current();must(helperBytes.length===recipe.closureHelper.bytes,'PRODUCTION_BARCODE26_HELPER_PIN');
    const helper=await import(pathToFileURL(recipe.closureHelper.path).href);current();const makeClosure=own(helper,'createRetainedNativeClosureSession26');
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
  async function capturedReader(group,recipe){
   const opts=await a.capturedOptions(group,structuredClone(recipe),context);active();
   must(opts?.capturedSource&&typeof opts.resolveNativeBinding==='function'&&opts.batchId===binding.batchId&&opts.fixedSourceNamespace===binding.fixedSourceNamespace,
    'PRODUCTION_PROVIDER26_CAPTURED_NATIVE_AUTHORITY_REQUIRED',group);
   const raw=await (group==='SALES_DETAILS'?openAuthorizedSalesDetailReader:openAuthorizedSettlementReader)(opts);
   if(closed||signal.aborted){await raw.close();active();}
   const prepare=group==='SALES_DETAILS'?prepareHistorySalesDetailChunk:prepareHistorySettlementChunk;
   return {verify,authorize:raw.authorize.bind(raw),close:raw.close.bind(raw),
    async *chunks(){let batch=[],selection,moneyApprovals;const size=recipe.chunkRows;
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
    },async openClosure(scope,ctx){return a.openRetainedClosure(group,structuredClone(recipe),scope,ctx);}};
  }
  const openSources=Object.fromEntries(sourceGroups.map(group=>[group,async(scope,ctx)=>{
   active();must(preflightDone&&requestHash(scope)===requestHash(fixed.closureScope)&&ctx?.group===group,'PRODUCTION_PROVIDER26_CLOSURE_SCOPE');
   const result=await readers.get(group).openClosure(scope,ctx);active();return result;
  }]));
  async function preflight(){
   active();must(!preflightDone,'PRODUCTION_PROVIDER26_PREFLIGHT_ALREADY_COMPLETE');
   try{await verify();
    // All group grants, including six real schemes and historical hall decisions,
    // must resolve BEFORE any source constructor or database activation.
    for(const group of sourceGroups)await checked(a.assertGroupAllowed,group,structuredClone(fixed.producers[group]),structuredClone(binding));
    if(!Array.isArray(warehouseItems)){
     must(warehouseItems&&Number.isSafeInteger(warehouseItems.bytes)&&warehouseItems.bytes>0&&warehouseItems.bytes<=4194304,'PRODUCTION_PROVIDER26_CORE_DATA_REQUIRED');
     const bytes=await pinnedSmall(warehouseItems.path,warehouseItems.sha256);active();must(bytes.length===warehouseItems.bytes,'PRODUCTION_PROVIDER26_CORE_DATA_REQUIRED');
     const data=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));
     must(data.dataComplete===true&&Array.isArray(data.missing)&&data.missing.length===0&&data.publicationAuthorized===false
      &&data.identity?.batchId===binding.batchId&&data.identity.coreReceiptId===binding.coreReceiptId&&data.identity.coreSourceDigest===binding.coreSourceDigest
      &&Array.isArray(data.warehouses)&&data.warehouses.length===53,'PRODUCTION_PROVIDER26_CORE_DATA_REQUIRED');warehouseItems=data.warehouses;
    }
    for(const group of sourceGroups){
     const recipe=fixed.producers[group];let raw;
     if(recipe.mode==='REVIEWED')raw=await recipeOpeners[group](structuredClone(recipe.options));
     else if(recipe.mode==='CAPTURED_C144')raw=await capturedReader(group,recipe);
     else if(group==='BARCODES'&&Object.hasOwn(recipe,'closureHelper'))raw=await retainedBarcodeReader(recipe);
     else raw=await a.openRetained(group,structuredClone(recipe),context);
     const closeMethod=Object.getOwnPropertyDescriptor(raw??{},'close');if(!(group==='BARCODES'&&Object.hasOwn(recipe,'closureHelper'))&&closeMethod?.enumerable&&Object.hasOwn(closeMethod,'value')&&typeof closeMethod.value==='function')disposers.push(closeMethod.value.bind(raw));
     active();must(raw&&!issued.has(raw),'PRODUCTION_PROVIDER26_SOURCE_REUSED');issued.add(raw);
     const [kind,iterator]=stages[group];void kind;
     const reader=methods(raw,['verify','authorize','openClosure','close',iterator]);
     if(group==='PARTIES'){
      const projection=await a.coreProjection(structuredClone(fixed.core),structuredClone(binding));active();
      must(projection?.authorizedPayloadHash===binding.authorizedPayloadHash,'PRODUCTION_PROVIDER26_CORE_PROJECTION');
      const bind=methods(raw,['bindCoreContinuation','authorizePartyChunk']);await checked(bind.bindCoreContinuation,projection);
      must(Array.isArray(projection.coreMembers)&&projection.coreMembers.length===115,'PRODUCTION_PROVIDER26_CORE_PROJECTION');
      for(const member of projection.coreMembers){must(typeof member.sourceRowId==='string'&&!coreSourceIds.has(member.sourceRowId),'PRODUCTION_PROVIDER26_CORE_PROJECTION');coreSourceIds.add(member.sourceRowId);}
      reader.authorize=bind.authorizePartyChunk;
     }
     readers.set(group,reader);await checked(reader.verify);
    }
    const scope=fixed.closureScope;must(scope?.batchId===binding.batchId&&scope.fixedSourceNamespace===binding.fixedSourceNamespace
     &&scope.selectionSha256===binding.selectionSha256&&scope.authorizedPayloadHash===binding.authorizedPayloadHash,'PRODUCTION_PROVIDER26_CLOSURE_SCOPE');
    preflightDone=true;closure=await openAuthorizedHistoryClosureReader26({scope,openSources,trustedSelectionSha256:binding.selectionSha256,trustedAuthorizedPayloadHash:binding.authorizedPayloadHash});
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
   must(count>0,'PRODUCTION_PROVIDER26_MAIN_COMMAND_REQUIRED');
  }
  return {preflight,close,openSources,closureScope:structuredClone(fixed.closureScope),bootstrap26:null,
   nativeProductSourceReader:{async authorize(payload){await checked(a.authorizeProductSource,payload,structuredClone(binding));}},
   now:a.now,
   async assertExecutionAllowed(actual){must(requestHash(actual)===requestHash(binding),'PRODUCTION_PROVIDER26_BINDING_CHANGED');await verify();await checked(a.assertExecutionAllowed,structuredClone(actual));},
   async authorizeNativeCommand(actor,command){await checked(a.authorizeNativeCommand,actor,command);},
   async assertAllowed(actor,command){await checked(a.assertAllowed,actor,command);},authorizeStep,
   async *steps(){
    active();must(preflightDone&&!stepsStarted,'PRODUCTION_PROVIDER26_PREFLIGHT_REQUIRED');stepsStarted=true;
    const runtime=database.ready();
    const progress=await readCoreImportContinuation26({pool:runtime.pool,runtime26:runtime.runtime26,binding,
     assertExecutionAllowed:actual=>a.assertExecutionAllowed(actual),warehouses:warehouseItems});active();
    // The existing helper proves real22 claims and leaves only31 genuine new
    // warehouse claims. C's reviewed command producer receives this readback.
    yield* main('BIND',progress);
    for(const group of sourceGroups){const [kind,iterator]=stages[group],reader=readers.get(group);
     for await(const original of reader[iterator]()){
      active();let payload=original;
      if(group==='PARTIES'){
       const rows=original.rows.filter(row=>!coreSourceIds.has(row.input.source.id));if(!rows.length)continue;
       payload=prepareNativePartyImportChunk(rows.map(row=>row.input));
      }
      const step={kind,payload};await authorizeStep(step);active();yield step;
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
 async function metadata(ref,maximum=4194304,reviver){active();must(exact(ref,['path','bytes','sha256'])&&Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&ref.bytes<=maximum,'PRODUCTION_AUTHORITY26_METADATA_REF');
  const before=await lstat(ref.path);active();const bytes=await pinnedSmall(ref.path,ref.sha256);active();const stat=await lstat(ref.path);active();must(bytes.length===ref.bytes&&same(before,stat),'PRODUCTION_AUTHORITY26_METADATA_CHANGED');
  files.set(ref.path,{ref:structuredClone(ref),stat});return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes),reviver);}
 async function unchanged(path){active();const f=files.get(path);must(f&&same(f.stat,await lstat(path)),'PRODUCTION_AUTHORITY26_METADATA_CHANGED');active();}
 async function verify(){active();for(const path of [inputFile,authorization.path,grant.job.path])await unchanged(path);active();}
 async function close(){if(closing)return closing;closed=true;closing=(async()=>{const failures=[];
  await Promise.allSettled([...pending]);for(const resource of [...resources].reverse())try{await resource.close();}catch(error){failures.push(error);}
  resources.clear();captured.clear();commands.clear();files.clear();if(failures.length)throw new AggregateError(failures,'Production authority26 cleanup failed');})();return closing;}
 async function owned(openSource){active();let operation;operation=(async()=>{const raw=await openSource();
  must(typeof raw?.close==='function','PRODUCTION_AUTHORITY26_SOURCE_REQUIRED');let closingResource;
  const resource={...raw,close(){if(!closingResource)closingResource=Promise.resolve().then(()=>raw.close());return closingResource;}};
  if(closed||signal.aborted){await resource.close();active();}resources.add(resource);return resource;})();pending.add(operation);
  try{return await operation;}finally{pending.delete(operation);}}
 async function code(ref,name){const bytes=await pinnedSmall(ref?.path,ref?.sha256);active();must(bytes.length===ref.bytes,'PRODUCTION_AUTHORITY26_MODULE_PIN');
  const module=await import(pathToFileURL(ref.path).href);active();const fn=own(module,name);must(typeof fn==='function','PRODUCTION_AUTHORITY26_MODULE_REQUIRED');return fn;}
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
  const projectionData=await metadata(fixed.core.coreProjection);let projection=projectionData,warehouses=fixed.warehouses;
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
  async function mainAllowed(actor,command){await verify();capture(command);validateCutoffImportCommand(command);const expected=commands.get(command.requestKey);
   must(actor===binding.actorAccountId&&command.actorAccountId===actor&&expected&&capture(command)===expected.digest,'PRODUCTION_AUTHORITY26_MAIN_NOT_AUTHORIZED');await unchanged(expected.file);}
  const sourceScope=Object.fromEntries(['batchId','fixedSourceNamespace','selectionSha256'].map(k=>[k,binding[k]]));
  let productSource;
  const authority={
   async verifyInputs(actual){await verify();must(actual.inputDigest===inputDigest&&capture(actual.binding)===capture(binding)&&capture(actual.core)===capture(fixed.core),'PRODUCTION_AUTHORITY26_INPUT_CHANGED');},
   assertGroupAllowed:groupAllowed,
   async assertExecutionAllowed(actual){await verify();must(capture(actual)===capture(binding),'PRODUCTION_AUTHORITY26_BINDING_CHANGED');},
   async authorizeStep(step,actualBinding){await verify();must(capture(actualBinding)===capture(binding)&&step&&Object.keys(step).sort().join(',')==='kind,payload','PRODUCTION_AUTHORITY26_STEP_SCOPE');capture(step);
    if(step.kind==='MAIN')return mainAllowed(binding.actorAccountId,step.payload);
    if(step.kind==='CLOSURE'){must(capture(captureHistoryTypedClosurePlan(step.payload.plan))===capture(plan),'PRODUCTION_AUTHORITY26_CLOSURE_NOT_AUTHORIZED');return;}
    const group=sourceGroups.find(g=>stages[g][0]===step.kind);must(group&&grant.groups.includes(group),'PRODUCTION_AUTHORITY26_STEP_SCOPE');
    const p=step.payload.input??step.payload;must(p.batchId===binding.batchId&&p.fixedSourceNamespace===binding.fixedSourceNamespace
     &&p.selection?.selectionSha256===binding.selectionSha256,'PRODUCTION_AUTHORITY26_STEP_SCOPE');
   },
   assertAllowed:mainAllowed,authorizeNativeCommand:mainAllowed,
   async openRetained(group,recipe,context){await groupAllowed(group,recipe,context.binding);
    // Only explicit original reader options can select these existing genuine
    // factories. A retained path alone never becomes a producer or raw fallback.
    must(Object.hasOwn(recipeOpeners,group)&&recipe.options,'PRODUCTION_AUTHORITY26_RETAINED_READER_INPUT_REQUIRED');
    return owned(()=>recipeOpeners[group](structuredClone(recipe.options)));
   },
   async capturedOptions(group,recipe,context){await groupAllowed(group,recipe,context.binding);
    must(['SALES_DETAILS','SETTLEMENTS'].includes(group)&&recipe.supportModules&&typeof recipe.sourceRoot==='string'&&isAbsolute(recipe.sourceRoot)&&context.database?.ready,'PRODUCTION_AUTHORITY26_CAPTURED_INPUT_REQUIRED');
    const makeTransport=await code(recipe.supportModules.transport,'openRetainedSalesSettlementFiles');
    const makeOptions=await code(recipe.supportModules.options,'prepareRetainedSalesOptions');
    const transport=await owned(()=>makeTransport({source:recipe.source,typed:recipe.typed},signal));let indexed;
    const ensureIndex=()=>indexed??=(async()=>{active();await transport.buildTypedIndex();active();})();
    const expected={entity:recipe.entity,binding:structuredClone(binding),manifestRef:recipe.manifestRef,moneyRef:recipe.moneyRef,trustedApprovalSha256:recipe.trustedApprovalSha256};
    const capturedAuthority={async verify(actual){await verify();must(actual.batchId===binding.batchId&&actual.fixedSourceNamespace===binding.fixedSourceNamespace
      &&actual.selection?.entity===recipe.entity&&actual.selection.selectionSha256===binding.selectionSha256&&capture(actual.manifest)===capture(recipe.manifestRef)
      &&capture(actual.source)===capture(recipe.source)&&capture(actual.typed)===capture(recipe.typed),'PRODUCTION_AUTHORITY26_CAPTURED_SCOPE');await transport.verify();},close:()=>transport.close()};
    const options=await makeOptions({sourceRoot:recipe.sourceRoot,...expected,signal,capturedAuthority,
     authority:{async verifyInputs(actual){await verify();must(capture(actual)===capture(expected),'PRODUCTION_AUTHORITY26_CAPTURED_SCOPE');}}});active();
    options.capturedSource.read={async *sourceRows(descriptor){await ensureIndex();yield*transport.sourceRows(descriptor);},async typedRow(descriptor,key){await ensureIndex();return transport.typedRow(descriptor,key);}};
    let resolver;options.resolveNativeBinding=async query=>{await verify();const runtime=context.database.ready();
     resolver??=(group==='SALES_DETAILS'?createPostgresHistorySalesDetailBindingResolver26:createPostgresHistorySettlementBindingResolver26)(runtime.pool,sourceScope,runtime.runtime26);
     const result=await resolver(query);active();return result;};
    captured.set(group,{transport,recipe,options});return options;
   },
   async openRetainedClosure(group,recipe,scope,context){await groupAllowed(group,recipe,binding);must(capture(scope)===capture(fixed.closureScope)&&context?.group===group
     &&context.signal instanceof AbortSignal&&!context.signal.aborted,'PRODUCTION_AUTHORITY26_CLOSURE_SCOPE');const state=captured.get(group);
    must(state&&recipe.supportModules?.closure,'PRODUCTION_AUTHORITY26_CAPTURED_INPUT_REQUIRED');
    const makeClosure=await code(recipe.supportModules.closure,'createCapturedSalesChildClosureSession');
    const current=()=>{active();must(!context.signal.aborted,'PRODUCTION_AUTHORITY26_CLOSED');};const streams=new Set();
    const closeStreams=async()=>{await Promise.all([...streams].map(async stream=>{const ended=stream.closed?Promise.resolve():new Promise(resolve=>stream.once('close',resolve));stream.destroy();await ended;}));streams.clear();};
    const rows=async function*(ref,relation){current();const before=await lstat(ref.path);current();must(before.isFile()&&!before.isSymbolicLink()&&before.size===ref.bytes,'PRODUCTION_AUTHORITY26_CAPTURED_FILE');
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
   async coreProjection(core,actualBinding){await verify();must(capture(core)===capture(fixed.core)&&capture(actualBinding)===capture(binding),'PRODUCTION_AUTHORITY26_CORE_DATA_REQUIRED');await unchanged(fixed.core.coreProjection.path);
    return{...structuredClone(projection),async verify(){await verify();await unchanged(fixed.core.coreProjection.path);}};
   },
   async *mainCommands(phase,{binding:actual,core,progress}){await verify();must(Object.hasOwn(byPhase,phase)&&capture(actual)===capture(binding)&&capture(core)===capture(fixed.core)
     &&progress?.checkpoint?.sequence===bind.expectedSequence&&progress.checkpoint.cursor===bind.expectedCursor
     &&progress.warehouses?.length===22&&progress.remainingWarehouses?.length===31,'PRODUCTION_AUTHORITY26_CURRENT_CHECKPOINT');
    const expected=new Map(warehouses.map(w=>[w.nativeRecord?.id,w]));
    for(const item of [...progress.warehouses,...progress.remainingWarehouses])must(capture(expected.get(item.nativeRecord?.id))===capture(item),'PRODUCTION_AUTHORITY26_WAREHOUSE_IDENTITY');
    const remaining=new Map(progress.remainingWarehouses.map(item=>[item.nativeRecord.id,item]));
    const accounted=byPhase.ACCOUNT.flatMap(command=>command.items.filter(item=>item.targetType==='WAREHOUSE'));
    must(accounted.length===remaining.size&&accounted.every(item=>remaining.has(item.nativeRecord?.id)&&capture(item)===capture(remaining.get(item.nativeRecord.id))),
     'PRODUCTION_AUTHORITY26_WAREHOUSE_IDENTITY');
    for(const command of byPhase[phase]){await mainAllowed(binding.actorAccountId,command);yield structuredClone(command);active();}
   },
   async authorizeProductSource(payload){await verify();const options=fixed.producers.PRODUCTS.productEvidenceSource;must(options,'PRODUCTION_AUTHORITY26_PRODUCT_EVIDENCE_REQUIRED');
    productSource??=await owned(()=>openReviewedProductEvidenceSource(structuredClone(options)));await productSource.authorize(payload);active();
   },close,now(){active();return new Date().toISOString();}
  };
  await verify();return authority;
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Production authority26 construction and cleanup failed');}throw error;}
}
