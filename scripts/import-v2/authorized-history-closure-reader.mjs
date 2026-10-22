/** Trusted-host composition ONLY. No SQL, file loader, native decision grant or production defaults.
 * Each factory MUST be an independently approved complete source+mapping producer, including
 * full original OOXML verification for HEADERS. A report/count/bool is never a factory or grant.
 * Production native providers are not implemented by this module. Synthetic protocol providers
 * exercise composition, never establish the missing production authority or header completion.
 */
import {buildHistoryTypedClosureExpected,captureHistoryTypedClosureStageInput,encodeHistoryClosureValue,historyClosureProjectionRow,HISTORY_CLOSURE_SOURCE_ENTITIES} from '../../packages/application/src/history-typed-closure.ts';
import {HISTORY_COUNT_KEYS} from '../../packages/application/src/history-storage-contract.ts';
const fail=code=>{throw Error('HISTORY_CLOSURE_READER_'+code);};
const entities={PARTIES:['HALL','WAREHOUSE','STAFF','CUSTOMER','SUPPLIER'],CATALOGUE:['CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON'],PRODUCTS:['PRODUCT'],SKUS:['SKU'],BARCODES:['BARCODE'],STOCK_CONTRIBUTORS:['INVENTORY_BASELINE'],PAYMENT:['PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL'],HEADERS:['SALES_HEADER','TRANSFER_HEADER'],SALES_DETAILS:['SALES_LINE'],SETTLEMENTS:['SETTLEMENT'],TRANSFER_LINES:['TRANSFER_LINE']};
for(const list of Object.values(entities))Object.freeze(list);
export const HISTORY_CLOSURE_SOURCE_GROUP_ENTITIES=Object.freeze(entities);
export const HISTORY_CLOSURE_SOURCE_GROUPS=Object.freeze(Object.keys(entities));
const relations={PARTIES:['native_party_import_evidence','import_header_native_reference','hall','warehouse','staff','customer','supplier'],CATALOGUE:['import_native_catalogue_binding','product_category','color','fit','size','size_group','size_group_member','season'],PRODUCTS:['product'],SKUS:['sku','import_sku_alias'],BARCODES:['sku_barcode','barcode_scheme'],STOCK_CONTRIBUTORS:['import_stock_contributor'],PAYMENT:['import_native_payment_binding','payment_method_identity','payment_account_identity','payment_account_hall'],HEADERS:['history_sales_header','history_transfer_header'],SALES_DETAILS:['history_sales_line'],SETTLEMENTS:['history_sales_settlement'],TRANSFER_LINES:['history_transfer_line']};
for(const list of Object.values(relations))Object.freeze(list);
export const HISTORY_CLOSURE_SOURCE_GROUP_RELATIONS=Object.freeze(relations);
const SESSION_KEYS=['verify','sourceRows','typedRows','documents','close'];
const MAX_BUFFERED_BYTES=16*1024*1024,MAX_DOCUMENT_BYTES=64*1024*1024,MAX_DOCUMENTS=100000;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&!v.includes('\0')&&Buffer.byteLength(v,'utf8')<=n;
function own(value,keys,code){
 if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)fail(code);
 const names=Reflect.ownKeys(value);
 if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))fail(code);
 const captured={};
 for(const key of names){const d=Object.getOwnPropertyDescriptor(value,key);if(!d.enumerable||!Object.hasOwn(d,'value'))fail(code);captured[key]=d.value;}
 return captured;
}
function counts(value,keys){
 const c=own(value,keys,'SCOPE_COUNTS');
 if(keys.some(k=>!Number.isSafeInteger(c[k])||Object.is(c[k],-0)||c[k]<0||c[k]>2147483645))fail('SCOPE_COUNTS');
 return c;
}
function scopeCapture(value,selection,payload){
 const s=own(value,['batchId','fixedSourceNamespace','selectionSha256','authorizedPayloadHash','expectedCounts','expectedSourceEntityCounts'],'SCOPE');
 // Recursive descriptor inspection precedes clone and every provider invocation.
 encodeHistoryClosureValue(s);
 if(!uuid(s.batchId)||!text(s.fixedSourceNamespace,1024)||!hash(s.selectionSha256)||!hash(s.authorizedPayloadHash)
  ||s.selectionSha256!==selection||s.authorizedPayloadHash!==payload)fail('INDEPENDENT_SCOPE_PIN');
 s.expectedCounts=counts(s.expectedCounts,HISTORY_COUNT_KEYS);s.expectedSourceEntityCounts=counts(s.expectedSourceEntityCounts,HISTORY_CLOSURE_SOURCE_ENTITIES);
 if(Object.values(s.expectedSourceEntityCounts).reduce((a,b)=>a+b,0)!==s.expectedCounts.import_source_row)fail('SCOPE_COUNTS');
 for(const [entity,table]of [['SALES_HEADER','history_sales_header'],['TRANSFER_HEADER','history_transfer_header'],['SALES_LINE','history_sales_line'],['TRANSFER_LINE','history_transfer_line'],['SETTLEMENT','history_sales_settlement'],['BARCODE','barcodes']])if(s.expectedSourceEntityCounts[entity]!==s.expectedCounts[table])fail('SCOPE_COUNTS');
 if(s.expectedCounts.history_sales_header+s.expectedCounts.history_transfer_header>MAX_DOCUMENTS)fail('DOCUMENT_LIMIT');
 return structuredClone(s);
}
const order=row=>Buffer.from(row.relation+'\0'+row.key,'utf8');
function rowCapture(value,group,kind,batchId){
 const raw=own(value,['relation','key','projection'],'ROW');
 if(typeof raw.relation!=='string'||typeof raw.key!=='string')fail('ROW');
 const canonical=historyClosureProjectionRow(raw.relation,raw.projection);
 if(raw.key!==canonical.key)fail('ROW_KEY');
 const p=canonical.projection;
 if(kind==='sourceRows'?(canonical.relation!=='import_source_row'||!entities[group].includes(p.entity_type)):!relations[group].includes(canonical.relation))fail('ROW_GROUP');
 if(Object.hasOwn(p,'batch_id')&&p.batch_id!==batchId)fail('ROW_BATCH');
 const bytes=encodeHistoryClosureValue(canonical).byteLength;
 return {row:structuredClone(canonical),bytes};
}
function allocationCapture(value){
 const d=own(value,['kind','sourceKey','headerSourceRowId','headerId'],'DOCUMENT');encodeHistoryClosureValue(d);
 if(!['SALES','TRANSFER'].includes(d.kind)||!text(d.sourceKey,65536)||!uuid(d.headerSourceRowId)||!uuid(d.headerId))fail('DOCUMENT');
 return structuredClone(d);
}
function sameInput(actual,expected){
 if(actual.batchId!==expected.batchId||actual.fixedSourceNamespace!==expected.fixedSourceNamespace
  ||!encodeHistoryClosureValue(actual.plan).equals(encodeHistoryClosureValue(expected.plan))||actual.documents.length!==expected.documents.length)fail('NOT_AUTHORIZED');
 const docs=new Map(expected.documents.map(d=>[d.kind+'/'+d.headerId,d]));
 for(const d of actual.documents){const e=docs.get(d.kind+'/'+d.headerId);if(!e||!encodeHistoryClosureValue(d).equals(encodeHistoryClosureValue(e)))fail('NOT_AUTHORIZED');}
}
/** Every operation opens new independent producers. No successful observation is cached as a grant.
 * Factories and sessions are captured bare functions: provider-held callback objects/scope clones
 * cannot rewrite the local input. Session close must release only its own temporary resources.
 * Explicit zero groups still verify, drain both complete streams and close; absence is not zero.
 */
export async function openAuthorizedHistoryClosureReader(options){
 const config=own(options,['scope','openSources','trustedSelectionSha256','trustedAuthorizedPayloadHash'],'OPTIONS');
 if(!hash(config.trustedSelectionSha256)||!hash(config.trustedAuthorizedPayloadHash))fail('INDEPENDENT_SCOPE_PIN');
 const scope=scopeCapture(config.scope,config.trustedSelectionSha256,config.trustedAuthorizedPayloadHash);
 const factories=own(config.openSources,HISTORY_CLOSURE_SOURCE_GROUPS,'ALL_SOURCE_FACTORIES_REQUIRED');
 if(Object.values(factories).some(f=>typeof f!=='function'))fail('ALL_SOURCE_FACTORIES_REQUIRED');
 let closed=false,active=false,done;const abort=new AbortController(),seenSessions=new WeakSet();
 const assertOpen=()=>{if(closed||abort.signal.aborted)fail('CLOSED');};
 async function verify(session,phase){const fn=session.verify;const result=await fn(phase);if(result!==undefined)fail('VERIFY_MUST_NOT_RETURN_A_PASSED_FLAG');assertOpen();}
 const iteratorState=(rows,code)=>{
  if(!rows)fail(code);
  const asyncMethod=rows[Symbol.asyncIterator],sync=typeof asyncMethod!=='function';
  const method=sync?rows[Symbol.iterator]:asyncMethod;
  if(typeof method!=='function')fail(code);
  const iterator=Reflect.apply(method,rows,[]);if(!iterator||typeof iterator.next!=='function')fail(code);
  return {iterator,sync,done:false};
 };
 // Operation-owned diagnostics survive AsyncIteratorClose: on a consumer throw,
 // for-await preserves its primary error even when the generator's return rejects.
 // Never rely on code after a generator finally to report return-path failures.
 const closeIterator=async(state,cleanup)=>{
  if(state.done)return;
  try{
   const close=state.iterator.return;
   if(close!==undefined&&close!==null){
    if(typeof close!=='function')fail('ITERATOR_RETURN');
    const result=await Reflect.apply(close,state.iterator,[]);
    if(result===null||(typeof result!=='object'&&typeof result!=='function'))fail('ITERATOR_RETURN');
   }
  }catch(error){cleanup.push(error);}
 };
 async function* merge(sessions,kind,cleanup){
  const states=[];let buffered=0,previous;
  const next=async state=>{
   if(state.head)buffered-=state.head.bytes;
   const item=await state.iterator.next();assertOpen();state.head=undefined;
   if(item.done){state.done=true;return;}
   const head=rowCapture(item.value,state.group,kind,scope.batchId),key=order(head.row);
   if(state.previous&&Buffer.compare(state.previous,key)>=0)fail('PROVIDER_ORDER');state.previous=key;state.head=head;
   buffered+=head.bytes;if(buffered>MAX_BUFFERED_BYTES)fail('BUFFER_LIMIT');
  };
  try{
   for(const session of sessions){const fn=session[kind],state={group:session.group,...iteratorState(fn(),'ROW_STREAM_REQUIRED')};
    states.push(state);await next(state);
   }
   for(;;){
    let picked;
    for(const state of states)if(state.head&&(!picked||Buffer.compare(order(state.head.row),order(picked.head.row))<0))picked=state;
    if(!picked)break;const key=order(picked.head.row);
    if(previous&&Buffer.compare(previous,key)>=0)fail('GLOBAL_ROW_ORDER');previous=key;
    yield picked.head.row;await next(picked);
   }
  }finally{for(const state of states)await closeIterator(state,cleanup);}
 }
 async function expected(){
  const sessions=[],closers=[];let result,primary,failed=false;const cleanup=[];
  try{
   for(const group of HISTORY_CLOSURE_SOURCE_GROUPS){
    assertOpen();const factory=factories[group],raw=await factory(structuredClone(scope),{group,signal:abort.signal});
    if(raw&&typeof raw==='object'){if(seenSessions.has(raw))fail('SESSION_REUSED');seenSessions.add(raw);}
    // Capture a valid close callback even when another returned field violates the protocol.
    const close=raw&&typeof raw==='object'?Object.getOwnPropertyDescriptor(raw,'close'):undefined;
    if(close&&Object.hasOwn(close,'value')&&typeof close.value==='function')closers.push(close.value);
    const captured=own(raw,SESSION_KEYS,'SOURCE_SESSION_REQUIRED');
    if(SESSION_KEYS.some(k=>typeof captured[k]!=='function'))fail('SOURCE_SESSION_REQUIRED');
    sessions.push({...captured,group});assertOpen();
   }
   for(const session of sessions)await verify(session,'BEFORE_READ');
   const documents=[];let documentBytes=0;
   for(const session of sessions){const fn=session.documents,state=iteratorState(fn(),'DOCUMENT_STREAM_REQUIRED');
    try{for(;;){
     const item=await state.iterator.next();assertOpen();if(item.done){state.done=true;break;}
     const value=state.sync?await item.value:item.value;assertOpen();if(session.group!=='HEADERS')fail('DOCUMENT_GROUP');
     const d=allocationCapture(value);documentBytes+=encodeHistoryClosureValue(d).byteLength;
     if(documents.length>=MAX_DOCUMENTS||documentBytes>MAX_DOCUMENT_BYTES)fail('DOCUMENT_LIMIT');documents.push(d);
    }}finally{await closeIterator(state,cleanup);}
   }
   result=await buildHistoryTypedClosureExpected({...scope,documents,sourceRows:merge(sessions,'sourceRows',cleanup),typedRows:merge(sessions,'typedRows',cleanup)});assertOpen();
   for(const session of sessions)await verify(session,'AFTER_READ');
  }catch(error){primary=error;failed=true;}
  finally{for(const close of closers.reverse())try{await close();}catch(error){cleanup.push(error);}}
  if(cleanup.length)throw new AggregateError(failed?[primary,...cleanup]:cleanup,'History source cleanup failed');if(failed)throw primary;
  assertOpen();return result;
 }
 async function run(operation){
  assertOpen();if(active)fail('BUSY');active=true;let finish;done=new Promise(resolve=>{finish=resolve;});
  try{const result=await operation();assertOpen();return result;}finally{active=false;finish();}
 }
 return Object.freeze({
  expected:()=>run(expected),
  async authorizeStage(original){assertOpen();const captured=captureHistoryTypedClosureStageInput(original);return run(async()=>sameInput(captured,await expected()));},
  async close(){closed=true;abort.abort();if(done)await done;}
 });
}
