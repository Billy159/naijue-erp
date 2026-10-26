import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveDraftReferences,validateDraftInput,draftQuantityCommand,draftMoneyCommand,historyResponseObservation,runDraftNormalHistory} from './draft-normal-history-v16.mjs';
const id=n=>`00000000-0562-4000-8000-${String(n).padStart(12,'0')}`;
const ref=(kind,n)=>({kind,documentId:id(n),lineId:id(n+1),capturedVersion:1,capturedSourceStatus:'DRAFT',capturedQuantity:kind==='sales'?'2':'-3',proposedQuantity:kind==='sales'?'3':'-2'});
const before=(r)=>({kind:r.kind,documentId:r.documentId,version:1,sourceStatus:'DRAFT',baselineEffect:'EXCLUDED_NOT_EFFECTIVE',lines:[{lineId:r.lineId,quantity:r.capturedQuantity,dealPrice:'0.99',allocatedDiscount:null}],totals:{netDue:'0.99'},settlements:[{direction:'RECEIVE',amount:'0.99'}]});
test('HTTP observation exposes only valid status, JSON boolean and explicit error-code whitelist',()=>{
 const hidden='SYNTHETIC_PRIVATE_BODY_HEADER_COOKIE_MESSAGE';
 const response={statusCode:500,body:hidden,headers:{cookie:hidden},json:()=>({error:{code:'INTERNAL_ERROR',message:hidden},extra:hidden})};
 assert.deepEqual(historyResponseObservation(response),{statusCode:500,jsonParseable:true,errorCode:'INTERNAL_ERROR'});
 assert.deepEqual(historyResponseObservation({...response,json:()=>({error:{code:hidden}})}),{statusCode:500,jsonParseable:true,errorCode:null});
 assert.deepEqual(historyResponseObservation({...response,statusCode:'500',json:()=>{throw Error(hidden);}}),{statusCode:null,jsonParseable:false,errorCode:null});
});
test('first failed revision HTTP is recorded before unchanged assertion, with no automatic retry',async()=>{
 const input={contract:'B07_DRAFT_NORMAL_HISTORY_V16_1',patchLevel:'26_v16_history_responsible_from_v14',sourceRoot:'/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022',origin:'https://synthetic-only.invalid',targetProfile:'ORIGINAL_PRESERVED_B07_COPY',copyRegistrationReference:'SYNTHETIC_ONLY',target:{database:'naijue_erp_test_19e00102',oid:'16385',role:'SYNTHETIC_NONOWNER'},actor:{accountId:id(30),hallId:null},references:{batchId:id(40),publishedOperationId:id(41),cases:[ref('sales',1),ref('transfers',10)]},maxRows:100,keys:{sales:'SYN_SALES',salesCas:'SYN_SALES_CAS',transfers:'SYN_TRANSFER',transfersCas:'SYN_TRANSFER_CAS',money:'SYN_MONEY',moneyCas:'SYN_MONEY_CAS'}};
 const current={...before(input.references.cases[0]),importBatchId:input.references.batchId,publishedOperationId:input.references.publishedOperationId};
 const events=[],client={async query(sql,args){
  if(sql.includes('current_user<>(SELECT'))return {rows:[{...input.target,nonowner:true,superuser:false,bypass_rls:false}]};
  if(sql.includes('SELECT h.id,h.batch_id'))return {rows:[{id:args[0],batch_id:args[1],source_status:'DRAFT',batch_status:'IMPORTED'}]};
  if(sql.includes('history_numeric_current_facts'))return {rows:[{value:current}]};
  return {rows:[]};
 },release(){}};
 const api={trustedOrigin:input.origin,app:{server:{listening:false},async inject(request){
  if(request.url==='/auth/session')return {statusCode:200,json:()=>({principal:input.actor})};
  events.push('HTTP');return {statusCode:500,headers:{cookie:'PRIVATE_HEADER'},body:'PRIVATE_BODY',json:()=>({error:{code:'INTERNAL_ERROR',message:'PRIVATE_MESSAGE'}})};
 }}};
 await assert.rejects(runDraftNormalHistory({api,pool:{async connect(){return client;}},runtime26:{async assertReady(){}},input,privateCookie:'PRIVATE_COOKIE',recordRequest:async()=>{events.push('REQUEST');},recordObservation:async value=>{events.push('OBSERVATION');assert.deepEqual(value,{phase:'DRAFT_SALES_QUANTITY_NO_STOCK',requestKey:'SYN_SALES',comparisonStage:'FIRST_RESPONSE',statusCode:500,jsonParseable:true,errorCode:'INTERNAL_ERROR'});},readBackgroundFailureCount:()=>0}),error=>{
  assert.equal(error.code,'ERR_ASSERTION');assert.equal(error.b07Result.firstFailure.comparisonStage,'FIRST_RESPONSE');
  assert.equal(error.b07Result.lastHttpObservation.statusCode,500);assert.ok(!JSON.stringify(error.b07Result).includes('PRIVATE_'));return true;
 });
 assert.deepEqual(events,['REQUEST','HTTP','OBSERVATION']);
});
test('actual capture JSON integer quantities compare exactly with current helper bigint text',()=>{
 for(const [kind,n] of [['sales',1],['transfers',10]]){
  const r=ref(kind,n),current=before(r),captured={...r,capturedQuantity:Number(r.capturedQuantity)};
  const copy=structuredClone(captured);
  const command=draftQuantityCommand(current,captured,'SYNTHETIC_SAME_CAPTURE_KEY');
  assert.equal(command.lines[0].quantity,r.proposedQuantity);assert.deepEqual(captured,copy);
  assert.throws(()=>draftQuantityCommand({...current,lines:[{...current.lines[0],quantity:'8'}]},captured,'SYNTHETIC_SAME_CAPTURE_KEY'));
  for(const value of [Number.MAX_SAFE_INTEGER+1,1.5,null,true,'02','-0'])assert.throws(()=>draftQuantityCommand(current,{...r,capturedQuantity:value},'SYNTHETIC_SAME_CAPTURE_KEY'));
 }
});
test('B07 v16 finite preparation keeps original DRAFT quantities, source state, line identity and exact money-only intent',()=>{
 for(const r of [ref('sales',1),ref('transfers',10)]){
  const b=before(r),copy=structuredClone(b),command=draftQuantityCommand(b,r,'SYNTHETIC_FIXED_HISTORY_KEY');
  assert.equal(command.documentId,r.documentId);assert.deepEqual(command.lines,[{lineId:r.lineId,quantity:r.proposedQuantity}]);assert.equal(command.expectedVersion,1);assert.equal(command.totals,null);assert.deepEqual(command.settlements,[]);assert.deepEqual(b,copy);
  assert.throws(()=>draftQuantityCommand({...b,sourceStatus:'APPROVED'},r,'same'));
  assert.throws(()=>draftQuantityCommand({...b,version:2},r,'same'));
 }
 const b=before(ref('sales',1)),copy=structuredClone(b),money=draftMoneyCommand(b,'SYNTHETIC_FIXED_MONEY_KEY');
 assert.deepEqual(money.lines,[{lineId:id(2),dealPrice:'1.00'}]);assert.equal(money.totals,null);assert.deepEqual(money.settlements,[]);assert.deepEqual(b,copy);
 assert.throws(()=>draftMoneyCommand({...b,settlements:[]},'same'));
});
test('B07 v16 reference input cannot silently transplant live IDs, substitute target or invent captured fields',()=>{
 const input={contract:'B07_DRAFT_NORMAL_HISTORY_V16_1',patchLevel:'26_v16_history_responsible_from_v14',target:{database:'erp_qa_rapid26_native_20261023_01',oid:'1032586',role:'erp_qa_v14_core_runtime_20261024_01'},actor:{accountId:id(30),hallId:null},references:{batchId:id(40),publishedOperationId:id(41),cases:[ref('sales',1),ref('transfers',10)]},maxRows:100,keys:{sales:'SYN_SALES',salesCas:'SYN_SALES_CAS',transfers:'SYN_TRANSFER',transfersCas:'SYN_TRANSFER_CAS',money:'SYN_MONEY',moneyCas:'SYN_MONEY_CAS'}};
 assert.doesNotThrow(()=>validateDraftInput(input));
 assert.throws(()=>validateDraftInput({...input,target:{...input.target,database:'OTHER_TARGET'}}));
 assert.throws(()=>validateDraftInput({...input,keys:{...input.keys,liveSave:'SYN_LIVE'}}));
 const pointer=key=>({artifact:'private',jsonPointer:'/'+key});
 const plan={status:'ACTUAL_CAPTURE_REFERENCES_BOUND_DRAFT_ONLY_NOT_EXECUTABLE',batch:{id:pointer('batch'),publishReceiptId:pointer('published')},cases:input.references.cases.map((r,i)=>({kind:r.kind,documentId:pointer('doc'+i),capturedOriginalVersion:pointer('version'+i),capturedOriginalStatus:pointer('status'+i),lineChange:{lineId:pointer('line'+i),capturedQuantity:pointer('qty'+i),proposedQuantity:r.proposedQuantity}}))};
 const values={batch:id(40),published:id(41)};for(const [i,r] of input.references.cases.entries())Object.assign(values,{['doc'+i]:r.documentId,['version'+i]:1,['status'+i]:'DRAFT',['line'+i]:r.lineId,['qty'+i]:r.capturedQuantity});
 assert.deepEqual(resolveDraftReferences(plan,{private:values}),input.references);delete values.line0;assert.throws(()=>resolveDraftReferences(plan,{private:values}));
});
