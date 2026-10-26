import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveDraftReferences,validateDraftInput,draftQuantityCommand,draftMoneyCommand,historyResponseObservation,runDraftNormalHistory,assertCompleteHistoryPage} from './draft-normal-history-v16.mjs';
const id=n=>`00000000-0562-4000-8000-${String(n).padStart(12,'0')}`;
const ref=(kind,n)=>({kind,documentId:id(n),lineId:id(n+1),capturedVersion:1,capturedSourceStatus:'DRAFT',capturedQuantity:kind==='sales'?'2':'-3',proposedQuantity:kind==='sales'?'3':'-2'});
const before=(r)=>({kind:r.kind,documentId:r.documentId,version:1,sourceStatus:'DRAFT',baselineEffect:'EXCLUDED_NOT_EFFECTIVE',lines:[{lineId:r.lineId,quantity:r.capturedQuantity,dealPrice:'0.99',allocatedDiscount:null}],totals:{netDue:'0.99'},settlements:[{settlementId:id(70),direction:'RECEIVE',amount:'0.99'}]});
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

test('detail completeness compares canonical total text exactly for lines and settlements',()=>{
 for(const page of [{total:'0',items:[]},{total:'1',items:[{}]},{total:'2',items:[{},{}]}]){const original=structuredClone(page);assert.doesNotThrow(()=>assertCompleteHistoryPage(page));assert.deepEqual(page,original);}
});
test('detail completeness rejects invalid count text and incomplete or inconsistent pages',()=>{
 for(const total of [0,1,null,undefined,'','00','01','-1','+1','1.0','1e0',' 1','1 ','1\n','1\r\n'])assert.throws(()=>assertCompleteHistoryPage({total,items:[{}]}));
 for(const page of [{total:'1',items:[]},{total:'0',items:[{}]},{total:'2',items:[{}]},{total:'9007199254740993',items:[]}])assert.throws(()=>assertCompleteHistoryPage(page));
});

// Pure scripted continuation protocol, never a PostgreSQL/HTTP acceptance claim.
async function committedFixture({unbalanced=false,price='0.99'}={}){
 const {createHash}=await import('node:crypto');
 const sourceRoot='/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022';
 const {planHistoryRevision}=await import(sourceRoot+'/packages/application/src/history-revision-service.ts');
 const {requestHash}=await import(sourceRoot+'/packages/application/src/request-hash.ts');
 const input={contract:'B07_DRAFT_NORMAL_HISTORY_V16_1',patchLevel:'26_v16_history_responsible_from_v14',sourceRoot,origin:'https://synthetic-only.invalid',targetProfile:'ORIGINAL_PRESERVED_B07_COPY',copyRegistrationReference:'SYNTHETIC_ONLY',target:{database:'naijue_erp_test_19e00102',oid:'16385',role:'SYNTHETIC_NONOWNER'},actor:{accountId:id(30),hallId:null},references:{batchId:id(40),publishedOperationId:id(41),cases:[ref('sales',1),ref('transfers',10)]},maxRows:100,keys:{sales:'SYN_SALES',salesCas:'SYN_SALES_CAS',transfers:'SYN_TRANSFER',transfersCas:'SYN_TRANSFER_CAS',money:'SYN_MONEY',moneyCas:'SYN_MONEY_CAS'}};
 const originalCurrent=r=>({...before(r),previousRevisionId:null,responsibleStaffId:null,importBatchId:input.references.batchId,publishedOperationId:input.references.publishedOperationId,documentManifestHash:'a'.repeat(64),businessDate:'2020-01-02',warehouseId:r.kind==='sales'?id(50):null,fromWarehouseId:r.kind==='transfers'?id(50):null,toWarehouseId:r.kind==='transfers'?id(51):null,
  lines:[{lineId:r.lineId,skuId:id(60),quantity:r.capturedQuantity,...(r.kind==='sales'?{dealPrice:price,lineAmount:'0.99',allocatedDiscount:null}:{})}],totals:r.kind==='sales'?{grossAmount:'0.99',orderDiscount:'0.00',netDue:'0.99'}:null,settlements:r.kind==='sales'?[{settlementId:id(70),direction:'RECEIVE',amount:unbalanced?'0.01':'0.99'}]:[]});
 const current={sales:originalCurrent(input.references.cases[0]),transfers:originalCurrent(input.references.cases[1])};
 const tables={history_revision:[],audit_change:[],operation_receipt:[],history_sales_effective:[],history_transfer_effective:[],history_sales_line_effective:[],history_transfer_line_effective:[],history_sales_settlement_effective:[]};
 let sequence=100;
 function commit(command){
  const operationId=id(sequence++),revisionId=id(sequence++),plan=planHistoryRevision(current[command.kind],command,revisionId);
  const receipt={operationId,dataset:'HISTORY',kind:command.kind,documentId:command.documentId,revisionId,version:plan.toVersion,ledgerEntryIds:[]};
  tables.history_revision.push({id:revisionId,document_kind:command.kind==='sales'?'SALES':'TRANSFER',sales_id:command.kind==='sales'?command.documentId:null,transfer_id:command.kind==='transfers'?command.documentId:null,from_version:plan.fromVersion,to_version:plan.toVersion,actor_account_id:input.actor.accountId,request_key:command.requestKey,reason:command.reason,before_facts:plan.before,after_facts:plan.after,operation_id:operationId});
  tables.audit_change.push({id:operationId,operation_id:operationId,actor_account_id:input.actor.accountId,object_type:command.kind==='sales'?'HISTORY_SALES':'HISTORY_TRANSFER',object_id:command.documentId,action:'HISTORY_REVISE',old_version:plan.fromVersion,new_version:plan.toVersion,before_values:plan.before,after_values:plan.after});
  tables.operation_receipt.push({id:operationId,actor_account_id:input.actor.accountId,request_key:command.requestKey,request_hash:requestHash({actorAccountId:input.actor.accountId,command}),status:'COMMITTED',action:'HISTORY_REVISE',target_type:command.kind==='sales'?'HISTORY_SALES':'HISTORY_TRANSFER',target_id:command.documentId,result_data:receipt});
  const family=command.kind==='sales'?'sales':'transfer';tables[`history_${family}_effective`]=[{header_id:command.documentId,version:plan.toVersion,revision_id:revisionId}];
  for(const patch of command.lines){const key=`history_${family}_line_effective`,row={line_id:patch.lineId,revision_id:revisionId,...patch};tables[key]=[...tables[key].filter(r=>r.line_id!==patch.lineId),row];}
  for(const patch of command.settlements){tables.history_sales_settlement_effective=[...tables.history_sales_settlement_effective.filter(r=>r.settlement_id!==patch.settlementId),{settlement_id:patch.settlementId,revision_id:revisionId,amount:patch.amount}];}
  current[command.kind]=plan.after;return receipt;
 }
 const command=draftQuantityCommand(current.sales,input.references.cases[0],input.keys.sales),originalReceipt=commit(command);
 const originalRequest={contract:input.contract,target:input.target,actor:input.actor,phase:'DRAFT_SALES_QUANTITY_NO_STOCK',command};
 const requestBytes=Buffer.from(JSON.stringify(originalRequest,null,2)+'\n'),sha256=createHash('sha256').update(requestBytes).digest('hex');
 const reviseCalls=[],records=[],observations=[];
 const client={async query(sql,args=[]){
  if(sql.includes('current_user<>(SELECT'))return {rows:[{...input.target,nonowner:true,superuser:false,bypass_rls:false}]};
  if(sql.includes('SELECT h.id,h.batch_id'))return {rows:[{id:args[0],batch_id:args[1],source_status:'DRAFT',batch_status:'IMPORTED'}]};
  if(sql.startsWith('SELECT request_key'))return {rows:tables.operation_receipt.filter(r=>r.actor_account_id===args[0]&&args[1].includes(r.request_key)).map(r=>({request_key:r.request_key}))};
  if(sql.includes('history_numeric_current_facts'))return {rows:[{value:structuredClone(current[args[0]==='SALES'?'sales':'transfers'])}]};
  const table=/SELECT to_jsonb\(t\)::text AS value FROM naijue_erp\.([a-z_]+)/.exec(sql)?.[1];
  if(table)return {rows:(tables[table]??[]).map(row=>({value:JSON.stringify(row)}))};
  return {rows:[]};
 },release(){}};
 const response=(statusCode,value)=>({statusCode,json:()=>structuredClone(value)});
 const api={trustedOrigin:input.origin,app:{server:{listening:false},async inject(request){
  if(request.url==='/auth/session')return response(200,{principal:input.actor});
  const kind=request.url.includes('/sales/')?'sales':'transfers';
  if(request.url.endsWith('/detail/query')){const c=current[kind];return response(200,{dataset:'HISTORY',document:{documentId:c.documentId,version:c.version,sourceStatus:c.sourceStatus},lines:{total:String(c.lines.length),items:c.lines.map(l=>({id:l.lineId,...l}))},settlements:{total:String(c.settlements.length),items:c.settlements.map(row=>({id:row.settlementId,...row}))}});}
  const command=structuredClone(request.payload);reviseCalls.push(command);
  const old=tables.operation_receipt.find(r=>r.request_key===command.requestKey);
  if(old)return old.request_hash===requestHash({actorAccountId:input.actor.accountId,command})?response(200,old.result_data):response(409,{error:{code:'IDEMPOTENCY_CONFLICT'}});
  if(current[kind].version!==command.expectedVersion)return response(409,{error:{code:'VERSION_CONFLICT'}});
  return response(200,commit(command));
 }}};
 return {input,current,tables,reviseCalls,records,observations,originalRequest,originalReceipt,requestBytes,sha256,commit,planHistoryRevision,
  options:{api,pool:{async connect(){return client;}},runtime26:{async assertReady(){}},input,privateCookie:'SYNTHETIC_PRIVATE_COOKIE',recordRequest:async request=>records.push(structuredClone(request)),recordObservation:async observation=>observations.push(observation),readBackgroundFailureCount:()=>0,committedContinuation:{requestBytes,sha256}}};
}
test('committed continuation validates original bytes and refuses changed target/actor/key/version without calls',async()=>{
 const {validateCommittedDraftRequest,runDraftNormalHistoryCommittedContinuation}=await import('./draft-normal-history-v16.mjs');
 const {createHash}=await import('node:crypto');const f=await committedFixture();
 assert.deepEqual(validateCommittedDraftRequest(f.input,f.options.committedContinuation),f.originalRequest);
 for(const change of [r=>{r.target.role='OTHER';},r=>{r.actor.accountId=id(999);},r=>{r.command.requestKey='NEW_KEY';},r=>{r.command.expectedVersion=2;},r=>{r.command.lines[0].quantity='8';}]){
  const r=structuredClone(f.originalRequest);change(r);const requestBytes=Buffer.from(JSON.stringify(r));
  assert.throws(()=>validateCommittedDraftRequest(f.input,{requestBytes,sha256:createHash('sha256').update(requestBytes).digest('hex')}));
 }
 const broken={...f.options,committedContinuation:{requestBytes:Buffer.concat([f.requestBytes,Buffer.from(' ')]),sha256:f.sha256}};
 await assert.rejects(runDraftNormalHistoryCommittedContinuation(broken));assert.equal(f.reviseCalls.length,0);assert.equal(f.records.length,0);
});
test('committed continuation reuses exact first key and tail, writes only transfer v1 and money v2',async()=>{
 const {runDraftNormalHistoryCommittedContinuation}=await import('./draft-normal-history-v16.mjs');const f=await committedFixture(),original=Buffer.from(f.requestBytes);
 const result=await runDraftNormalHistoryCommittedContinuation(f.options);
 assert.equal(result.status,'PASS_ACTUAL_LIMITED_DRAFT_HISTORY_ONLY');assert.equal(result.recoveredFirstCase.version,2);assert.equal(result.recoveredFirstCase.originalRequestSha256,f.sha256);
 assert.deepEqual(f.reviseCalls[0],f.originalRequest.command);assert.equal(JSON.stringify(f.reviseCalls[0]),JSON.stringify(f.originalRequest.command));assert.deepEqual(f.requestBytes,original);
 assert.deepEqual(f.records.map(r=>[r.command.requestKey,r.command.expectedVersion]),[[f.input.keys.transfers,1],[f.input.keys.money,2]]);
 assert.equal(f.tables.history_revision.length,3);assert.equal(f.tables.operation_receipt.length,3);assert.equal(f.current.sales.version,3);assert.equal(f.current.transfers.version,2);
 assert.deepEqual(result.cases.map(c=>c.name),['DRAFT_TRANSFER_QUANTITY_NO_STOCK_CONSERVATION','DRAFT_SALES_MONEY_ONLY_NO_STOCK']);
 assert.ok(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE_COOKIE'));
});
test('committed continuation refuses inconsistent committed proof or another original key before replay',async()=>{
 const {runDraftNormalHistoryCommittedContinuation}=await import('./draft-normal-history-v16.mjs');
 for(const change of [f=>{f.tables.operation_receipt[0].request_hash='f'.repeat(64);},f=>{f.tables.history_revision[0].after_facts.version=3;},f=>{f.tables.audit_change[0].old_version=0;},f=>{f.tables.operation_receipt.push({...structuredClone(f.tables.operation_receipt[0]),request_key:f.input.keys.money});}]){
  const f=await committedFixture();change(f);await assert.rejects(runDraftNormalHistoryCommittedContinuation(f.options));assert.equal(f.reviseCalls.length,0);assert.equal(f.records.length,0);
 }
});
test('committed continuation stops if original-key replay produces any extra effect',async()=>{
 const {runDraftNormalHistoryCommittedContinuation}=await import('./draft-normal-history-v16.mjs');const f=await committedFixture();
 const inject=f.options.api.app.inject;let altered=false;
 f.options.api.app.inject=async request=>{const response=await inject(request);
  if(!altered&&request.url.endsWith('/sales/revise')){altered=true;f.tables.audit_change.push({...structuredClone(f.tables.audit_change[0]),id:id(999)});}return response;};
 await assert.rejects(runDraftNormalHistoryCommittedContinuation(f.options),error=>{assert.equal(error.b07Result.firstFailure.comparisonStage,'REPLAY_SNAPSHOT');return true;});
 assert.equal(f.reviseCalls.length,1);assert.equal(f.records.length,0);assert.equal(f.current.sales.version,2);assert.equal(f.current.transfers.version,1);
});

async function remainingMoneyFixture(options={}){
 const {createHash}=await import('node:crypto'),f=await committedFixture({unbalanced:true,...options});
 const pin=value=>{const requestBytes=Buffer.from(JSON.stringify(value,null,2)+'\n');return {requestBytes,sha256:createHash('sha256').update(requestBytes).digest('hex')};};
 const transferCommand=draftQuantityCommand(f.current.transfers,f.input.references.cases[1],f.input.keys.transfers),transferReceipt=f.commit(transferCommand);
 const transferRequest={contract:f.input.contract,target:f.input.target,actor:f.input.actor,phase:'DRAFT_TRANSFER_QUANTITY_NO_STOCK_CONSERVATION',command:transferCommand};
 const completed={status:'FAILED_OR_OUTCOME_UNCERTAIN_NO_AUTO_RETRY',firstFailure:{phase:'DRAFT_SALES_MONEY_ONLY_NO_STOCK',comparisonStage:'BUILD_COMMAND',requestKey:f.input.keys.transfers,code:'ERR_ASSERTION'},
 recoveredFirstCase:{status:'PASS_ORIGINAL_COMMITTED_KEY_DETAIL_REPLAY_CONFLICT_CAS_NO_NEW_WRITE',version:2,operationId:f.originalReceipt.operationId,revisionId:f.originalReceipt.revisionId,originalRequestSha256:f.sha256},
 cases:[{name:'DRAFT_TRANSFER_QUANTITY_NO_STOCK_CONSERVATION',status:'PASS_NORMAL_HISTORY_HTTP_CURRENT_FACTS_SOURCE_STOCK_AUDIT_RECEIPT_REPLAY_CAS',version:2,operationId:transferReceipt.operationId,revisionId:transferReceipt.revisionId,stockUnchanged:true}]};
 f.options.remainingMoneyContinuation={sales:{requestBytes:f.requestBytes,sha256:f.sha256},transfers:pin(transferRequest),completedCases:pin(completed)};return {...f,pin,completed,transferRequest};
}
test('explicit money correction balances existing amount while original price-only request is rejected by real planner',async()=>{
 const f=await committedFixture({unbalanced:true}),before=structuredClone(f.current.sales),command=draftMoneyCommand(before,f.input.keys.money);
 assert.deepEqual(command.settlements,[{settlementId:before.settlements[0].settlementId,amount:'0.99'}]);assert.equal(command.lines[0].dealPrice,'1.00');
 assert.throws(()=>f.planHistoryRevision(before,{...command,settlements:[]},id(900)),{code:'SETTLEMENT_MISMATCH'});
 assert.throws(()=>f.planHistoryRevision(before,{...command,settlements:[{...command.settlements[0],settlementId:id(999)}]},id(902)),{code:'HISTORY_REVISION_FOREIGN_ROW'});
 assert.throws(()=>f.planHistoryRevision(before,{...command,settlements:[{...command.settlements[0],direction:'REFUND'}]},id(903)),{code:'HISTORY_REVISION_INVALID'});
 assert.deepEqual(Object.keys(command.settlements[0]).sort(),['amount','settlementId']);
 const plan=f.planHistoryRevision(before,command,id(901));assert.equal(plan.moneyChanged,true);assert.deepEqual(plan.effects,[]);assert.deepEqual(before,f.current.sales);
 assert.deepEqual(plan.after.lines.map(row=>row.quantity),before.lines.map(row=>row.quantity));assert.deepEqual(plan.after.totals,before.totals);assert.equal(plan.after.settlements[0].direction,before.settlements[0].direction);
});
test('explicit money solver respects refund signs, first feasible existing row, zero and exact price bounds',async()=>{
 const f=await committedFixture({unbalanced:true}),b=structuredClone(f.current.sales);
 b.totals.netDue='-0.99';b.settlements[0].direction='REFUND';assert.equal(draftMoneyCommand(b,'SYN').settlements[0].amount,'0.99');
 b.totals.netDue='0.99';b.settlements.push({settlementId:id(71),direction:'RECEIVE',amount:'0.01'});
 assert.deepEqual(draftMoneyCommand(b,'SYN').settlements,[{settlementId:id(71),amount:'1.00'}]);
 b.totals.netDue='0.00';b.settlements=[{settlementId:id(70),direction:'RECEIVE',amount:'0.01'}];assert.equal(draftMoneyCommand(b,'SYN').settlements[0].amount,'0.00');
 b.totals.netDue='-0.99';assert.throws(()=>draftMoneyCommand(b,'SYN'));
 b.lines[0].dealPrice='9999999999999999.99';assert.throws(()=>draftMoneyCommand(b,'SYN'));
 for(const value of [null,'-0.00','1.001','01.00']){b.lines[0].dealPrice=value;assert.throws(()=>draftMoneyCommand(b,'SYN'));}
});
test('remaining money entry binds both completed v2 cases without replay and saves only original money key',async()=>{
 const {runDraftNormalHistoryRemainingMoneyContinuation}=await import('./draft-normal-history-v16.mjs'),f=await remainingMoneyFixture();
 const result=await runDraftNormalHistoryRemainingMoneyContinuation(f.options);
 assert.equal(result.status,'PASS_ACTUAL_LIMITED_DRAFT_HISTORY_ONLY');assert.equal(result.priorScopeNotReplayed,true);assert.equal(result.adoptedCompletedCases.salesVersion,2);assert.equal(result.adoptedCompletedCases.transferVersion,2);
 assert.deepEqual(f.records.map(r=>[r.command.requestKey,r.command.expectedVersion]),[[f.input.keys.money,2]]);assert.equal(f.current.sales.version,3);assert.equal(f.current.transfers.version,2);
 assert.ok(f.reviseCalls.every(c=>![f.input.keys.sales,f.input.keys.salesCas,f.input.keys.transfers,f.input.keys.transfersCas].includes(c.requestKey)));
 assert.equal(f.tables.history_sales_settlement_effective.length,1);assert.equal(f.tables.history_sales_settlement_effective[0].amount,'0.99');assert.equal(result.cases.length,1);
});
test('remaining money entry refuses incorrect second proof and reports build failure without stale prior key',async()=>{
 const {runDraftNormalHistoryRemainingMoneyContinuation}=await import('./draft-normal-history-v16.mjs');
 const wrong=await remainingMoneyFixture();wrong.tables.history_revision[1].actor_account_id=id(999);await assert.rejects(runDraftNormalHistoryRemainingMoneyContinuation(wrong.options));assert.equal(wrong.reviseCalls.length,0);assert.equal(wrong.records.length,0);
 const missing=await remainingMoneyFixture();missing.completed.cases[0].stockUnchanged=false;missing.options.remainingMoneyContinuation.completedCases=missing.pin(missing.completed);await assert.rejects(runDraftNormalHistoryRemainingMoneyContinuation(missing.options));assert.equal(missing.reviseCalls.length,0);
 const overflow=await remainingMoneyFixture({price:'9999999999999999.99'});await assert.rejects(runDraftNormalHistoryRemainingMoneyContinuation(overflow.options),error=>{assert.equal(error.b07Result.firstFailure.comparisonStage,'BUILD_COMMAND');assert.equal(error.b07Result.firstFailure.requestKey,null);return true;});assert.equal(overflow.records.length,0);assert.equal(overflow.reviseCalls.length,0);
});
test('remaining money entry never resaves an existing key and only recovers its exact original request',async()=>{
 const {runDraftNormalHistoryRemainingMoneyContinuation}=await import('./draft-normal-history-v16.mjs'),f=await remainingMoneyFixture();
 await runDraftNormalHistoryRemainingMoneyContinuation(f.options);const originalMoney=structuredClone(f.records[0]),beforeCounts=[f.tables.history_revision.length,f.tables.operation_receipt.length];f.records.length=0;f.reviseCalls.length=0;
 await assert.rejects(runDraftNormalHistoryRemainingMoneyContinuation(f.options));assert.equal(f.records.length,0);assert.equal(f.reviseCalls.length,0);
 f.options.remainingMoneyContinuation.money=f.pin(originalMoney);const result=await runDraftNormalHistoryRemainingMoneyContinuation(f.options);assert.equal(result.moneyRecoveryOnly,true);assert.equal(result.recoveredMoneyCase.version,3);assert.equal(f.records.length,0);
 assert.deepEqual([f.tables.history_revision.length,f.tables.operation_receipt.length],beforeCounts);assert.deepEqual(f.reviseCalls[0],originalMoney.command);
});
