import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {validateApprovedInput,approvedQuantityCommand,assertApprovedInventory,assertPkRollbackEvidence,runApprovedNormalHistory} from './approved-normal-history-v16.mjs';
const sourceRoot='/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022';
const {planHistoryRevision}=await import(pathToFileURL(resolve(sourceRoot,'packages/application/src/history-revision-service.ts')).href);
const id=n=>`00000000-0711-4000-8000-${String(n).padStart(12,'0')}`;
const reference=kind=>({kind,documentId:id(kind==='sales'?1:2),lineId:id(kind==='sales'?3:4),capturedVersion:1,capturedSourceStatus:'APPROVED',capturedQuantity:kind==='sales'?'2':'3',proposedQuantity:kind==='sales'?'3':'4'});
const input=()=>({contract:'B07_SYN_APPROVED_NORMAL_HISTORY_V1',profile:'B07_SYN_APPROVED_V1',sourceKind:'SYNTHETIC_ONLY',realSourceImportVerified:false,sourceRoot,origin:'https://syn-only.invalid',target:{database:'naijue_erp_test_b07_syn_approved_20261027_01',oid:'99999',role:'syn_ordinary'},actor:{accountId:id(10),hallId:null},references:{batchId:id(11),publishedOperationId:id(12),cases:[reference('sales'),reference('transfers')]},maxRows:100,keys:Object.fromEntries(['sales','salesCas','transfers','transfersCas','rollback'].map(k=>[k,'B07_SYN_APPROVED_V1_'+k.toUpperCase()]))});
function current(kind){const r=reference(kind);return {kind,documentId:r.documentId,version:1,previousRevisionId:null,importBatchId:id(11),publishedOperationId:id(12),documentManifestHash:'a'.repeat(64),sourceStatus:'APPROVED',baselineEffect:'INCLUDED_APPROVED',businessDate:'2024-11-18',responsibleStaffId:null,warehouseId:kind==='sales'?id(20):null,fromWarehouseId:kind==='transfers'?id(20):null,toWarehouseId:kind==='transfers'?id(21):null,lines:[{lineId:r.lineId,skuId:id(30),quantity:r.capturedQuantity,...(kind==='sales'?{dealPrice:'1.00',lineAmount:'2.00',allocatedDiscount:null}:{})}],totals:kind==='sales'?{grossAmount:'32.00',orderDiscount:'0.00',netDue:'32.00'}:null,settlements:kind==='sales'?[{settlementId:id(31),direction:'RECEIVE',amount:'32.00'}]:[]};}
test('new input cannot silently adopt real source or old07 and fresh keys are explicit',()=>{
 assert.equal(validateApprovedInput(input()).sourceKind,'SYNTHETIC_ONLY');
 for(const change of [x=>x.sourceKind='REAL',x=>x.realSourceImportVerified=true,x=>x.target.database='naijue_erp_test_19e00102',x=>x.references.cases[0].capturedSourceStatus='DRAFT',x=>x.keys.rollback=x.keys.sales]){const x=input();change(x);assert.throws(()=>validateApprovedInput(x));}
});
test('real planner gives approved sales negative difference and two opposite transfer endpoints without changing source money',()=>{
 for(const kind of ['sales','transfers']){const before=current(kind),command=approvedQuantityCommand(before,reference(kind),input().keys[kind]);const plan=planHistoryRevision(before,command,id(40));
 assert.deepEqual(plan.effects.map(e=>e.quantityDelta),kind==='sales'?['-1']:['-1','1']);
 assert.deepEqual(plan.after.totals,before.totals);assert.deepEqual(plan.after.settlements,before.settlements);assert.equal(plan.after.sourceStatus,'APPROVED');assert.equal(before.version,1);
 if(kind==='transfers')assert.notEqual(plan.effects[0].warehouseId,plan.effects[1].warehouseId);
 }
 const bad=current('sales');bad.businessDate=null;assert.throws(()=>approvedQuantityCommand(bad,reference('sales'),'key'));
 const stale=current('sales');stale.version=2;assert.throws(()=>approvedQuantityCommand(stale,reference('sales'),'key'));
});
function posting(kind){const before=current(kind),command=approvedQuantityCommand(before,reference(kind),input().keys[kind]),plan=planHistoryRevision(before,command,id(40));const receipt={operationId:id(41),revisionId:id(40),ledgerEntryIds:plan.effects.map((_,i)=>id(50+i))};
 const stock={inventory_ledger:[],inventory_balance:[{warehouse_id:id(20),sku_id:id(30),quantity:'-7',version:'1',last_operation_id:id(12)}]};
 const after=structuredClone(stock);
 for(const [i,e] of plan.effects.entries()){after.inventory_ledger.push({id:receipt.ledgerEntryIds[i],event_kind:'HISTORY_REVISION',operation_id:id(41),source_history_revision_id:id(40),source_document_version:2,warehouse_id:e.warehouseId,sku_id:e.skuId,endpoint:e.endpoint,quantity_delta:e.quantityDelta,business_date:before.businessDate,source_history_sales_line_id:kind==='sales'?e.lineId:null,source_history_transfer_line_id:kind==='transfers'?e.lineId:null,source_import_batch_id:null,source_sales_line_id:null,source_transfer_line_id:null,reverses_entry_id:null});
  let b=after.inventory_balance.find(b=>b.warehouse_id===e.warehouseId);if(!b){b={warehouse_id:e.warehouseId,sku_id:e.skuId,quantity:'0',version:'0',last_operation_id:null};after.inventory_balance.push(b);}b.quantity=(BigInt(b.quantity)+BigInt(e.quantityDelta)).toString();b.version=(BigInt(b.version)+1n).toString();b.last_operation_id=receipt.operationId;}
 return {stock,after,plan,receipt};
}
test('inventory assertions check actual signs, first-use balance, exact versions and retained rows',()=>{
 for(const kind of ['sales','transfers']){const x=posting(kind);assertApprovedInventory(x.stock,x.after,x.plan,x.receipt);
  const wrong=structuredClone(x.after);wrong.inventory_balance[0].quantity='-6';assert.throws(()=>assertApprovedInventory(x.stock,wrong,x.plan,x.receipt));
  const bad=structuredClone(x.after);bad.inventory_ledger[0].source_document_version=1;assert.throws(()=>assertApprovedInventory(x.stock,bad,x.plan,x.receipt));}
});
test('rollback evidence requires real PK error AFTER first ledger and balance, rollback and zero commit',()=>{
 const ok={errorCode:'23505',firstLedgerInserted:1,firstBalancePersisted:1,secondLedgerAttempted:1,rolledBack:true,commits:0};assertPkRollbackEvidence(ok);
 for(const field of Object.keys(ok)){const x={...ok,[field]:field==='errorCode'?'FAKE':field==='rolledBack'?false:field==='commits'?1:0};assert.throws(()=>assertPkRollbackEvidence(x));}
});
test('protocol fake only: first 500 or unknown ACK stops once, persists original request before HTTP, no follow-up SAVE',async()=>{
 for(const status of [500,503]){const i=input(),events=[];let writes=0,released=0;
 const api={trustedOrigin:i.origin,app:{server:{listening:false},async inject(req){if(req.method==='GET')return {statusCode:200,json:()=>({principal:i.actor})};writes++;events.push('HTTP');return {statusCode:status,json:()=>({error:{code:status===503?'HISTORY_REVISION_COMMIT_OUTCOME_UNKNOWN':'INTERNAL_ERROR'}})};}}};
 const pool={async connect(){return {async query(sql,args){let rows=[];
  if(sql.includes('current_database()'))rows=[{...i.target,nonowner:true,superuser:false,bypass_rls:false}];
  else if(sql.includes('history_numeric_current_facts'))rows=[{value:current('sales')}];
  else if(sql.includes('inventory-admission:keys'))rows=args[0].map((warehouse_id,n)=>({warehouse_id,sku_id:args[1][n],admitted:true,published_batch_id:i.references.batchId,warehouse_basis:'CUTOFF_MEMBER',sku_basis:'CUTOFF_MEMBER',warehouse_created_operation_id:null,sku_created_operation_id:null}));
  return {rows,rowCount:rows.length};},release(){released++;}};}};
 const runtime26={profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(){}};
 let error;try{await runApprovedNormalHistory({api,pool,runtime26,input:i,privateCookie:'TEST_ONLY',recordRequest:async()=>events.push('REQUEST'),recordObservation:async()=>{},readBackgroundFailureCount:async()=>0,now:()=>new Date().toISOString()});}catch(e){error=e;}
 assert.equal(writes,1,error?.stack);assert.deepEqual(events,['REQUEST','HTTP']);assert.equal(error.approvedHistoryResult.status,'FAILED_STOP_NO_RETRY');assert.equal(error.approvedHistoryResult.requestKey,i.keys.sales);assert.ok(released>0);
 }
});

import {readFile} from 'node:fs/promises';
import {createSynRollbackObserver,validateOriginalRollbackContinuation} from './approved-normal-history-v16.mjs';
test('rollback raw observer records first ledger+balance then actual second23505 and rollback, without replacing raw identity',async()=>{
 const observer=createSynRollbackObserver(),ids={operation:id(70),revision:id(71),firstLedger:id(72),collisionLedger:id(73)},calls=[];
 const duplicate=Object.assign(Error('PRIVATE_PG_DETAIL'),{code:'23505'});
 const raw={async query(sql,values){calls.push({sql,values});if(sql.includes('history-posting:ledger')&&values[0]===ids.collisionLedger)throw duplicate;return {rowCount:1,rows:[]};},on(){},release(){}};
 const query=raw.query;assert.equal(observer.attachRawClient(raw),raw);const wrappedQuery=raw.query;assert.notEqual(wrappedQuery,query);assert.equal(observer.attachRawClient(raw),raw);assert.equal(raw.query,wrappedQuery);
 // A separate original leased object is frozen by issuer; observer never sees/mutates it.
 const lease=Object.freeze({query:(...args)=>raw.query(...args),release:()=>raw.release()});const leases=new WeakSet([lease]);
 observer.start(ids);assert.equal(leases.has(lease),true);await lease.query('BEGIN ISOLATION LEVEL READ COMMITTED');
 await lease.query('/* history-posting:ledger */ INSERT INTO naijue_erp.inventory_ledger',[ids.firstLedger,'PRIVATE_VALUES']);
 await lease.query('UPDATE naijue_erp.inventory_balance SET quantity=$1',['PRIVATE_VALUES']);
 await assert.rejects(lease.query('/* history-posting:ledger */ INSERT INTO naijue_erp.inventory_ledger',[ids.collisionLedger,'PRIVATE_VALUES']),e=>e===duplicate);
 await lease.query('ROLLBACK');const evidence=observer.finish();assertPkRollbackEvidence(evidence);assert.equal(Object.isFrozen(lease),true);assert.equal(JSON.stringify(evidence).includes('PRIVATE'),false);assert.equal(evidence.commits,0);
 assert.equal(calls[1].values[1],'PRIVATE_VALUES','Original args preserved for driver, never exported');
});
test('rollback observer refuses missing first endpoint, wrong-client second endpoint and committed partial transaction',async()=>{
 for(const mode of ['missing-first','other-client','commit']){const observer=createSynRollbackObserver(),ids={operation:id(70),revision:id(71),firstLedger:id(72),collisionLedger:id(73)};
  const raw=()=>({async query(){return {rowCount:1,rows:[]};}}),one=observer.attachRawClient(raw()),two=observer.attachRawClient(raw());observer.start(ids);
  if(mode!=='missing-first'){await one.query('/* history-posting:ledger */ INSERT',[ids.firstLedger]);await one.query('UPDATE naijue_erp.inventory_balance SET quantity=1');}
  if(mode==='other-client')await assert.rejects(two.query('/* history-posting:ledger */ INSERT',[ids.collisionLedger]),/same actual driver transaction/);
  if(mode==='commit')await one.query('COMMIT');assert.throws(()=>assertPkRollbackEvidence(observer.finish()));
 }
});
test('actual original store readiness accepts the original frozen issuer lease, while old wrapper demonstrably loses WeakMap identity',async()=>{
 const {PostgresHistoryRevisionStore}=await import(pathToFileURL(resolve(sourceRoot,'adapters/postgres/src/history-revision-store.ts')).href);
 const currentFacts=current('transfers'),command=approvedQuantityCommand(currentFacts,reference('transfers'),input().keys.transfers),actor=input().actor;
 const originalError=Object.assign(Error('REACHED_ORIGINAL_CLIENT_SQL'),{code:'TEST_STOP'});let businessQueries=0,checks=0;
 const raw={async query(sql){if(sql.startsWith('SELECT pg_advisory')){businessQueries++;throw originalError;}return {rows:[],rowCount:0};},release(){}};
 const lease=Object.freeze(raw),leases=new WeakMap([[lease,true]]),runtime26={profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(client){checks++;if(!leases.has(client))throw Object.assign(Error('Original issuer lease required'),{code:'NATIVE_RUNTIME26_NOT_READY'});}};
 const grant={dataset:'HISTORY',kind:'transfers',documentId:command.documentId,actorAccountId:actor.accountId};
 const direct=PostgresHistoryRevisionStore.forRuntime26({async connect(){return lease;}},{runtime26,newId:()=>id(80)});
 await assert.rejects(direct.revise(actor,command,grant,'2026-10-27T00:00:00.000Z',new AbortController().signal),e=>e===originalError);assert.equal(businessQueries,1);
 const wrapped=PostgresHistoryRevisionStore.forRuntime26({async connect(){return {query:(...args)=>lease.query(...args),release:()=>lease.release()};}},{runtime26,newId:()=>id(80)});
 await assert.rejects(wrapped.revise(actor,command,grant,'2026-10-27T00:00:00.000Z',new AbortController().signal),e=>e.code==='HISTORY_REVISION_SCHEMA_NOT_READY');assert.equal(businessQueries,1);assert.ok(checks>=3);
});
test('rollback-only continuation binds exact original04 bytes/IDs and adopts two priorPASS cases, no rekey or actor substitution',async()=>{
 const dir='/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-private-data/rapid-launch-20261022/b07-syn-approved-20261027-01/credential-continuation-04/';
 const originalRequestBytes=await readFile(dir+'REQUEST-DIRECT_SERVICE_ACTUAL_SECOND_ENDPOINT_PK_ROLLBACK.json'),priorApprovedResult=JSON.parse(await readFile(dir+'APPROVED-ACTUAL-RESULT.json','utf8')),approved=JSON.parse(await readFile(dir+'APPROVED-INPUT.json','utf8'));
 const continuation={originalRequestBytes,priorApprovedResult},request=validateOriginalRollbackContinuation(approved,continuation);assert.equal(request.command.expectedVersion,2);assert.equal(request.command.lines[0].quantity,'5');
 const changed=Buffer.from(originalRequestBytes);changed[changed.length-3]^=1;assert.throws(()=>validateOriginalRollbackContinuation(approved,{...continuation,originalRequestBytes:changed}));
 const actorChanged=structuredClone(approved);actorChanged.actor.accountId=id(90);assert.throws(()=>validateOriginalRollbackContinuation(actorChanged,continuation));
 const stale=structuredClone(priorApprovedResult);stale.cases[0].version=1;assert.throws(()=>validateOriginalRollbackContinuation(approved,{...continuation,priorApprovedResult:stale}));
});

import {runApprovedOriginalRollbackOnly} from './approved-normal-history-v16.mjs';
test('rollback-only original committed key recovery returns before any service execution, HTTP, driver observation or new request',async()=>{
 const dir='/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-private-data/rapid-launch-20261022/b07-syn-approved-20261027-01/credential-continuation-04/';
 const originalRequestBytes=await readFile(dir+'REQUEST-DIRECT_SERVICE_ACTUAL_SECOND_ENDPOINT_PK_ROLLBACK.json'),priorApprovedResult=JSON.parse(await readFile(dir+'APPROVED-ACTUAL-RESULT.json','utf8')),approved=JSON.parse(await readFile(dir+'APPROVED-INPUT.json','utf8')),original=JSON.parse(originalRequestBytes);
 const {requestHash}=await import(pathToFileURL(resolve(sourceRoot,'packages/application/src/request-hash.ts')).href);let recorded=0,released=0;const queries=[];
 const pool={async connect(){return {async query(sql){queries.push(sql);let rows=[];
  if(sql.includes('current_database()'))rows=[{...approved.target,nonowner:true,superuser:false,bypass_rls:false}];
  else if(sql.startsWith('SELECT id,action,target_type,target_id,status,request_hash,result_data'))rows=[{id:original.companionIds.operation,action:'HISTORY_REVISE',target_type:'HISTORY_TRANSFER',target_id:original.command.documentId,status:'COMMITTED',request_hash:requestHash({actorAccountId:approved.actor.accountId,command:original.command}),result_data:{operationId:original.companionIds.operation}}];
  else assert.ok(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ'||sql==='COMMIT');return {rows,rowCount:rows.length};},release(){released++;}};}};
 const result=await runApprovedOriginalRollbackOnly({pool,runtime26:{profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(){}},input:approved,rollbackContinuation:{originalRequestBytes,priorApprovedResult},recordRequest:async()=>{recorded++;},recordObservation:async()=>{},readBackgroundFailureCount:async()=>0,now:()=>new Date().toISOString()});
 assert.equal(result.status,'ORIGINAL_ROLLBACK_KEY_COMMITTED_READONLY_RECOVERY_NO_EXECUTION');assert.equal(recorded,0);assert.equal(released,1);assert.equal(result.normalCasesReexecuted,false);assert.equal(queries.some(s=>/^\s*(INSERT|UPDATE|DELETE)/.test(s)),false);
});
