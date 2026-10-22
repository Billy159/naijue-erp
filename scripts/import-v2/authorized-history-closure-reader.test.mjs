/** Trusted composition protocol fakes only. Never proof of production source authority/OOXML or PG. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openAuthorizedHistoryClosureReader,HISTORY_CLOSURE_SOURCE_GROUPS,HISTORY_CLOSURE_SOURCE_GROUP_ENTITIES,HISTORY_CLOSURE_SOURCE_GROUP_RELATIONS} from './authorized-history-closure-reader.mjs';
import {historyClosureProjectionSpec,historyClosureProjectionRow,HISTORY_CLOSURE_SOURCE_ENTITIES} from '../../packages/application/src/history-typed-closure.ts';
import {PostgresHistoryTypedClosureStore} from '../../adapters/postgres/src/history-typed-closure.ts';

const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`,selection='a'.repeat(64),payload='b'.repeat(64);
const projection=(relation,values)=>({...Object.fromEntries(historyClosureProjectionSpec().find(s=>s.relation===relation).columns.map(c=>[c,c==='row_no'?'1':c==='quantity'?'2':null])),...values});
const row=(relation,values)=>historyClosureProjectionRow(relation,projection(relation,values));
function fixture(hooks={}) {
 const source=(n,entity,key,parent)=>row('import_source_row',{id:id(n),batch_id:id(1),entity_type:entity,source_key:key,file_ref:'SYNTHETIC.xlsx',sheet:'SYNTHETIC',source_file_sha256:selection,row_sha256:selection,raw_fields:{来源编号:key,...(parent?{单据来源编号:parent}:{})},normalized_fields:{来源编号:key,...(parent?{单据来源编号:parent}:{})},field_provenance:{schema_version:1,literal:'SYNTHETIC_PROTOCOL_ONLY'}});
 const sources={HEADERS:[source(10,'SALES_HEADER','A'),source(11,'SALES_HEADER','B')],SALES_DETAILS:[source(12,'SALES_LINE','line-A','A'),source(13,'SALES_LINE','line-B','B')]};
 const typed={HEADERS:[row('history_sales_header',{id:id(20),batch_id:id(1),source_row_id:id(10)}),row('history_sales_header',{id:id(21),batch_id:id(1),source_row_id:id(11)})],SALES_DETAILS:[row('history_sales_line',{id:id(30),batch_id:id(1),source_row_id:id(12),header_id:id(20)}),row('history_sales_line',{id:id(31),batch_id:id(1),source_row_id:id(13),header_id:id(21)})]};
 const documents=[{kind:'SALES',sourceKey:'A',headerSourceRowId:id(10),headerId:id(20)},{kind:'SALES',sourceKey:'B',headerSourceRowId:id(11),headerId:id(21)}];
 const events=[],sessions=[];
 const scope={batchId:id(1),fixedSourceNamespace:'synthetic.composite18',selectionSha256:selection,authorizedPayloadHash:payload,expectedCounts:{history_sales_header:2,history_sales_line:2,history_sales_settlement:0,history_transfer_header:0,history_transfer_line:0,import_source_row:4,import_sku_alias:0,import_stock_contributor:0,barcodes:0},expectedSourceEntityCounts:{...Object.fromEntries(HISTORY_CLOSURE_SOURCE_ENTITIES.map(e=>[e,0])),SALES_HEADER:2,SALES_LINE:2}};
 const openSources=Object.fromEntries(HISTORY_CLOSURE_SOURCE_GROUPS.map(group=>[group,async providerScope=>{
  events.push(group+':open');await hooks.open?.(group,providerScope);const session={
   async verify(phase){assert.equal(this,undefined);events.push(group+':verify:'+phase);await hooks.verify?.(group,phase);},
   async *sourceRows(){assert.equal(this,undefined);events.push(group+':source:start');for(const r of sources[group]??[]){yield r;await hooks.afterSource?.(group,r);}events.push(group+':source:complete');},
   async *typedRows(){assert.equal(this,undefined);events.push(group+':typed:start');for(const r of typed[group]??[])yield r;events.push(group+':typed:complete');},
   async *documents(){assert.equal(this,undefined);events.push(group+':documents:start');if(group==='HEADERS')for(const d of documents)yield d;events.push(group+':documents:complete');},
   async close(){assert.equal(this,undefined);events.push(group+':close:start');await hooks.close?.(group);events.push(group+':close:done');}
  };sessions.push(session);return await hooks.session?.(group,session)??session;
 }]));
 return {options:{scope,openSources,trustedSelectionSha256:selection,trustedAuthorizedPayloadHash:payload},events,sources,typed,documents,sessions};
}
const closed=(f)=>f.events.filter(e=>e.endsWith(':close:done')).length;

test('all11 groups cover24 entities explicitly, including zero groups; every request/replay freshly verifies and completely consumes both streams and allocations',async()=>{
 const f=fixture(),a=await openAuthorizedHistoryClosureReader(f.options),first=await a.expected();
 assert.equal(HISTORY_CLOSURE_SOURCE_GROUPS.length,11);assert.equal(first.documents.length,2);assert.equal(closed(f),11);
 const all=Object.values(HISTORY_CLOSURE_SOURCE_GROUP_ENTITIES).flat();assert.equal(all.length,24);assert.equal(new Set(all).size,24);assert.deepEqual(all.toSorted(),[...HISTORY_CLOSURE_SOURCE_ENTITIES].toSorted());
 const typed=Object.values(HISTORY_CLOSURE_SOURCE_GROUP_RELATIONS).flat();assert.equal(typed.length,30);assert.equal(new Set(typed).size,30);assert.deepEqual(['import_source_row',...typed].toSorted(),historyClosureProjectionSpec().map(r=>r.relation).toSorted());
 for(const group of HISTORY_CLOSURE_SOURCE_GROUPS)for(const suffix of ['verify:BEFORE_READ','source:complete','typed:complete','documents:complete','verify:AFTER_READ','close:done'])assert.ok(f.events.includes(group+':'+suffix),group+':'+suffix);
 await a.authorizeStage(first);await a.authorizeStage(first);assert.equal(closed(f),33);assert.equal(f.events.filter(e=>e.endsWith(':open')).length,33);
 await a.close();await assert.rejects(a.expected(),/CLOSED/);
});
test('missing or report/bool source group, bad independent pins and raw getter/symbol scope reject before provider calls',async()=>{
 for(const kind of ['missing','report','pin','payload','getter','symbol','nested-getter']){
  const f=fixture();let reads=0;
  if(kind==='missing')delete f.options.openSources.PARTIES;
  if(kind==='report')f.options.openSources.PARTIES={passed:true,report:{count:0}};
  if(kind==='pin')f.options.trustedSelectionSha256='c'.repeat(64);
  if(kind==='payload')f.options.trustedAuthorizedPayloadHash='c'.repeat(64);
  if(kind==='getter')Object.defineProperty(f.options,'scope',{get(){reads++;return {};},enumerable:true});
  if(kind==='symbol')Object.defineProperty(f.options.scope,Symbol('hidden'),{value:true});
  if(kind==='nested-getter')Object.defineProperty(f.options.scope.expectedCounts,'barcodes',{get(){reads++;return 0;},enumerable:true});
  await assert.rejects(openAuthorizedHistoryClosureReader(f.options));assert.deepEqual(f.events,[],kind);assert.equal(reads,0,kind);
 }
});
test('constructor captures config/scope; provider-held scope and queued row mutation never alter local expected input',async()=>{
 const control=fixture(),reference=await(await openAuthorizedHistoryClosureReader(control.options)).expected();
 const f=fixture({open:async(_g,scope)=>{scope.expectedCounts.import_source_row=999;},afterSource:async(_g,r)=>{r.projection.raw_fields.changed='LATE_MUTATION';}});
 const a=await openAuthorizedHistoryClosureReader(f.options);f.options.scope.expectedCounts.import_source_row=999;f.options.openSources.PARTIES=async()=>{throw Error('LATE_CONFIG');};
 const got=await a.expected();assert.deepEqual(got,reference);assert.equal(closed(f),11);
 // Returned input is its own captured snapshot, never a provider/session object.
 got.documents[0].sourceKey='CALLER_MUTATION';assert.equal(reference.documents[0].sourceKey,'A');await a.close();
});
test('incomplete source/typed/allocation, duplicate, wrongly grouped, crossed-document and raw getter cannot grant; every opened source is awaited closed',async()=>{
 for(const kind of ['incomplete','typed-incomplete','allocation-incomplete','duplicate','group','crossed','getter','bool-verify']){
  let reads=0;const f=fixture({session:async(g,s)=>{
   if(kind==='incomplete'&&g==='SALES_DETAILS')s.sourceRows=async function*(){throw Error('SOURCE_INCOMPLETE');};
   if(kind==='typed-incomplete'&&g==='SALES_DETAILS')s.typedRows=async function*(){throw Error('TYPED_INCOMPLETE');};
   if(kind==='allocation-incomplete'&&g==='HEADERS')s.documents=async function*(){throw Error('ALLOCATION_INCOMPLETE');};
   if(kind==='bool-verify'&&g==='PARTIES')s.verify=async()=>true;
  }});
  if(kind==='duplicate')f.sources.SALES_DETAILS.push(structuredClone(f.sources.SALES_DETAILS[0]));
  if(kind==='group'){f.sources.PARTIES=[f.sources.HEADERS.shift()];}
  if(kind==='crossed'){f.typed.SALES_DETAILS[0].projection.header_id=id(21);f.typed.SALES_DETAILS[1].projection.header_id=id(20);}
  if(kind==='getter')Object.defineProperty(f.sources.HEADERS[0].projection,'raw_fields',{get(){reads++;throw Error('GETTER');},enumerable:true});
  const a=await openAuthorizedHistoryClosureReader(f.options);await assert.rejects(a.expected());assert.equal(closed(f),11,kind);assert.equal(reads,0);await a.close();
 }
});
test('provider-held session callback mutation cannot replace captured verification, streams or awaited close',async()=>{
 let held;const f=fixture({session:async(g,s)=>{if(g==='PARTIES')held=s;},open:async g=>{if(g==='CATALOGUE')for(const key of ['verify','sourceRows','typedRows','documents','close'])held[key]=()=>{throw Error('LATE_SESSION_MUTATION');};}});
 const a=await openAuthorizedHistoryClosureReader(f.options);assert.equal((await a.expected()).documents.length,2);assert.equal(closed(f),11);await a.close();
});
test('construction failure closes every already-opened source; invalid returned session still awaits its captured close',async()=>{
 for(const invalid of [false,true]){
  const f=fixture({open:async g=>{if(!invalid&&g==='PRODUCTS')throw Error('FACTORY_FAILED');},session:async(g,s)=>{if(invalid&&g==='PRODUCTS')return {close:s.close,passed:true};}});
  const a=await openAuthorizedHistoryClosureReader(f.options);await assert.rejects(a.expected());assert.equal(closed(f),invalid?3:2);await a.close();
 }
});
test('one returned session cannot masquerade as two independently required groups or be closed twice',async()=>{
 let held;const f=fixture({session:async(g,s)=>{if(g==='PARTIES')held=s;if(g==='CATALOGUE')return held;}});
 const a=await openAuthorizedHistoryClosureReader(f.options);await assert.rejects(a.expected(),/SESSION_REUSED/);assert.equal(closed(f),1);await a.close();
});
test('replay must open a fresh session; a cached already-closed source session is rejected without closing it again',async()=>{
 const f=fixture();let held;const real=f.options.openSources.PARTIES;f.options.openSources.PARTIES=async(...args)=>held??(held=await real(...args));
 const a=await openAuthorizedHistoryClosureReader(f.options);await a.expected();assert.equal(closed(f),11);
 await assert.rejects(a.expected(),/SESSION_REUSED/);assert.equal(closed(f),11);await a.close();
});
test('provider late verification/close failure prevents authorization; source denial occurs before a STAGE connection',async()=>{
 const good=fixture(),input=await(await openAuthorizedHistoryClosureReader(good.options)).expected();
 for(const kind of ['late-verify','close','wrong-plan']){
  const f=fixture({verify:async(g,phase)=>{if(kind==='late-verify'&&g==='HEADERS'&&phase==='AFTER_READ')throw Error('SOURCE_CHANGED');},close:async g=>{if(kind==='close'&&g==='PARTIES')throw Error('CLOSE_FAILED');}});
  const a=await openAuthorizedHistoryClosureReader(f.options),clone=structuredClone(input);if(kind==='wrong-plan')clone.plan.typedManifestSha256='0'.repeat(64);
  let connections=0;const store=new PostgresHistoryTypedClosureStore({async connect(){connections++;throw Error('UNEXPECTED_DB');}},{authorizeStage:a.authorizeStage});
  await assert.rejects(store.stage(clone));assert.equal(connections,0,kind);assert.equal(f.events.filter(e=>e.endsWith(':close:start')).length,11);await a.close();
 }
});
test('close during an in-flight read cancels the grant and awaits all opened sessions; concurrent calls never overlap producers',async()=>{
 let entered,release;const started=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});
 const f=fixture({verify:async(g,phase)=>{if(g==='HEADERS'&&phase==='BEFORE_READ'){entered();await gate;}}}),a=await openAuthorizedHistoryClosureReader(f.options);
 const pending=a.expected();await started;await assert.rejects(a.expected(),/BUSY/);const stop=a.close();release();await assert.rejects(pending,/CLOSED|ABORT/);await stop;
 assert.equal(closed(f),11);assert.equal(f.events.filter(e=>e.endsWith(':open')).length,11);
});
test('cancellation while a factory is still opening awaits and closes the newly returned resource before close resolves',async()=>{
 let enter,release;const started=new Promise(r=>{enter=r;}),wait=new Promise(r=>{release=r;});
 const f=fixture({open:async g=>{if(g==='PARTIES'){enter();await wait;}}}),a=await openAuthorizedHistoryClosureReader(f.options),pending=a.expected();
 await started;const closing=a.close();release();await assert.rejects(pending,/CLOSED/);await closing;
 assert.equal(closed(f),1);assert.equal(f.events.filter(e=>e.endsWith(':open')).length,1);
});
test('cancellation while a typed iterator is paused awaits iterator return and every provider close before close resolves',async()=>{
 let enter,release,returned=false;const started=new Promise(r=>{enter=r;}),wait=new Promise(r=>{release=r;});
 const f=fixture({session:async(g,s)=>{if(g==='HEADERS')s.typedRows=async function*(){try{enter();await wait;yield f.typed.HEADERS[0];}finally{returned=true;}};}});
 const a=await openAuthorizedHistoryClosureReader(f.options),pending=a.expected();await started;const closing=a.close();release();await assert.rejects(pending,/CLOSED/);await closing;
 assert.equal(returned,true);assert.equal(closed(f),11);
});
test('close in the final cleanup microtask still prevents a successfully computed plan from escaping as a grant',async()=>{
 let a,closing;const f=fixture({session:async(g,s)=>{
  if(g==='PARTIES'){const original=s.close;s.close=()=>{const p=original();p.then(()=>queueMicrotask(()=>{closing=a.close();}));return p;};}
 }});
 a=await openAuthorizedHistoryClosureReader(f.options);await assert.rejects(a.expected(),/CLOSED/);await closing;assert.equal(closed(f),11);
});
test('fixed16MiB merge-head bound rejects before a partial expected plan; opened sources all close',async()=>{
 const f=fixture(),filler='x'.repeat(3584*1024);
 for(const [index,group]of ['PARTIES','CATALOGUE','PRODUCTS','SKUS','BARCODES'].entries()){
  const original=structuredClone(f.sources.HEADERS[0].projection);Object.assign(original,{id:id(90+index),entity_type:HISTORY_CLOSURE_SOURCE_GROUP_ENTITIES[group][0],field_provenance:{schema_version:1,filler}});
  f.sources[group]=[historyClosureProjectionRow('import_source_row',original)];
 }
 const a=await openAuthorizedHistoryClosureReader(f.options);await assert.rejects(a.expected(),/BUFFER_LIMIT/);assert.equal(closed(f),11);await a.close();
});
test('primary source failure and all cleanup failures remain observable; no early cleanup failure skips later sources',async()=>{
 const f=fixture({verify:async(g,p)=>{if(g==='HEADERS'&&p==='AFTER_READ')throw Error('SYNTHETIC_PRIMARY');},close:async g=>{if(g==='PARTIES'||g==='PRODUCTS')throw Error('SYNTHETIC_CLOSE_'+g);}});
 const a=await openAuthorizedHistoryClosureReader(f.options);
 await assert.rejects(a.expected(),e=>e instanceof AggregateError&&e.errors.length===3&&e.errors.some(x=>x.message==='SYNTHETIC_PRIMARY')&&e.errors.some(x=>x.message==='SYNTHETIC_CLOSE_PARTIES')&&e.errors.some(x=>x.message==='SYNTHETIC_CLOSE_PRODUCTS'));
 assert.equal(f.events.filter(e=>e.endsWith(':close:start')).length,11);await a.close();
});

const failureLeaves=error=>error instanceof AggregateError?error.errors.flatMap(failureLeaves):[error];
function failingReturnStream(values,error,onReturn){
 let index=0;
 return {[Symbol.asyncIterator](){return this;},async next(){return index<values.length?{done:false,value:values[index++]}:{done:true};},async return(){onReturn();await Promise.resolve();throw error;}};
}
test('expected consumer rejection after a canonical source yield retains primary, iterator return and session close errors before any STAGE connection',async()=>{
 const reference=fixture(),good=await openAuthorizedHistoryClosureReader(reference.options),input=await good.expected();await good.close();
 const iteratorError=Error('SOURCE_ITERATOR_RETURN_FAILED'),sessionError=Error('SOURCE_SESSION_CLOSE_FAILED');let returnAttempts=0,connections=0;
 const f=fixture({session:async(g,s)=>{if(g==='SALES_DETAILS')s.sourceRows=()=>failingReturnStream(f.sources.SALES_DETAILS,iteratorError,()=>{returnAttempts++;});},close:async g=>{await Promise.resolve();if(g==='SALES_DETAILS')throw sessionError;}});
 // Full canonical shape/key passes rowCapture. The pure expected consumer rejects the
 // original parent mismatch only AFTER merge has yielded this source row to it.
 f.sources.SALES_DETAILS[0].projection.raw_fields.单据来源编号='WRONG_ORIGINAL_PARENT';
 assert.deepEqual(historyClosureProjectionRow('import_source_row',f.sources.SALES_DETAILS[0].projection),f.sources.SALES_DETAILS[0]);
 const a=await openAuthorizedHistoryClosureReader(f.options),store=new PostgresHistoryTypedClosureStore({async connect(){connections++;throw Error('UNEXPECTED_DB');}},{authorizeStage:a.authorizeStage});
 try{await assert.rejects(store.stage(input),error=>{
  const leaves=failureLeaves(error);assert.equal(leaves[0].code,'INVALID_HISTORY_CLOSURE_EXPECTED');
  assert.deepEqual(leaves.slice(1),[iteratorError,sessionError]);return true;
 });}finally{await a.close();}
 assert.equal(returnAttempts,1);assert.equal(connections,0);assert.equal(f.events.filter(e=>e.endsWith(':close:start')).length,11);assert.equal(closed(f),10);
});
test('documents consumer body rejection retains documents return and session close errors and awaits every opened session',async()=>{
 const reference=fixture(),good=await openAuthorizedHistoryClosureReader(reference.options),input=await good.expected();await good.close();
 const iteratorError=Error('DOCUMENTS_ITERATOR_RETURN_FAILED'),sessionError=Error('DOCUMENTS_SESSION_CLOSE_FAILED');let returnAttempts=0,connections=0;
 const f=fixture({session:async(g,s)=>{if(g==='PARTIES')s.documents=()=>failingReturnStream(f.documents,iteratorError,()=>{returnAttempts++;});},close:async g=>{await Promise.resolve();if(g==='PARTIES')throw sessionError;}});
 const a=await openAuthorizedHistoryClosureReader(f.options),store=new PostgresHistoryTypedClosureStore({async connect(){connections++;throw Error('UNEXPECTED_DB');}},{authorizeStage:a.authorizeStage});
 try{await assert.rejects(store.stage(input),error=>{
  const leaves=failureLeaves(error);assert.equal(leaves[0].message,'HISTORY_CLOSURE_READER_DOCUMENT_GROUP');
  assert.deepEqual(leaves.slice(1),[iteratorError,sessionError]);return true;
 });}finally{await a.close();}
 assert.equal(returnAttempts,1);assert.equal(connections,0);assert.equal(f.events.filter(e=>e.endsWith(':close:start')).length,11);assert.equal(closed(f),10);
});
test('typed consumer rejection retains every pending iterator cleanup failure and awaits a blocked session close',async()=>{
 const reference=fixture(),good=await openAuthorizedHistoryClosureReader(reference.options),input=await good.expected();await good.close();
 const headerError=Error('HEADER_TYPED_RETURN_FAILED'),lineError=Error('LINE_TYPED_RETURN_FAILED'),sessionError=Error('TYPED_SESSION_CLOSE_FAILED');
 let headerReturns=0,lineReturns=0,connections=0,enter,release,settled=false;
 const started=new Promise(r=>{enter=r;}),gate=new Promise(r=>{release=r;});
 const f=fixture({session:async(g,s)=>{
  if(g==='HEADERS')s.typedRows=()=>failingReturnStream(f.typed.HEADERS,headerError,()=>{headerReturns++;});
  if(g==='SALES_DETAILS')s.typedRows=()=>failingReturnStream(f.typed.SALES_DETAILS,lineError,()=>{lineReturns++;});
 },close:async g=>{if(g==='TRANSFER_LINES'){enter();await gate;}if(g==='HEADERS')throw sessionError;}});
 // Same canonical row key and full projection, but header A points to source B.
 // The expected consumer rejects it while two provider iterators remain pending.
 f.typed.HEADERS[0].projection.source_row_id=id(11);
 assert.deepEqual(historyClosureProjectionRow('history_sales_header',f.typed.HEADERS[0].projection),f.typed.HEADERS[0]);
 const a=await openAuthorizedHistoryClosureReader(f.options),store=new PostgresHistoryTypedClosureStore({async connect(){connections++;throw Error('UNEXPECTED_DB');}},{authorizeStage:a.authorizeStage});
 const pending=store.stage(input);pending.then(()=>{settled=true;},()=>{settled=true;});
 const checked=assert.rejects(pending,error=>{
  const leaves=failureLeaves(error);assert.equal(leaves[0].code,'INVALID_HISTORY_CLOSURE_EXPECTED');
  assert.deepEqual(leaves.slice(1),[headerError,lineError,sessionError]);return true;
 });
 await started;assert.equal(settled,false);assert.equal(headerReturns,1);assert.equal(lineReturns,1);
 const closing=a.close();let closeSettled=false;closing.then(()=>{closeSettled=true;});await Promise.resolve();assert.equal(closeSettled,false);
 release();await checked;await closing;
 assert.equal(connections,0);assert.equal(f.events.filter(e=>e.endsWith(':close:start')).length,11);assert.equal(closed(f),10);
});
test('a falsy thrown provider error is still a primary refusal and is retained with cleanup failures',async()=>{
 for(const primary of [undefined,null,false,0,'']){
  const cleanup=Error('FALSY_PRIMARY_CLEANUP');
  const f=fixture({verify:async(g,p)=>{if(g==='HEADERS'&&p==='BEFORE_READ')throw primary;},close:async g=>{if(g==='HEADERS')throw cleanup;}}),a=await openAuthorizedHistoryClosureReader(f.options);
  try{await assert.rejects(a.expected(),error=>{assert.ok(error instanceof AggregateError);assert.deepEqual(error.errors,[primary,cleanup]);return true;});}finally{await a.close();}
  assert.equal(f.events.filter(e=>e.endsWith(':close:start')).length,11);
 }
});
