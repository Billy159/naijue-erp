// T45-only caller supplies the existing normal factory, ONE normal session,
// ordinary pool and genuine runtime26 issuer. No connections, credentials,
// fixture source, listener or schema are created here.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertCompleteHistoryPage,historyResponseObservation} from './draft-normal-history-v16.mjs';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x);
const stable=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const same=(a,b,msg)=>assert.equal(stable(a),stable(b),msg);
const key=r=>`${r.warehouse_id}/${r.sku_id}`;
const immutable=['import_batch','import_source_row','import_record','import_record_accounting_claim','import_history_closure_manifest','import_history_document_manifest','history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line','product','sku','sku_barcode','warehouse','hall'];
const effective=['history_sales_effective','history_transfer_effective','history_sales_line_effective','history_transfer_line_effective','history_sales_settlement_effective'];
export function validateApprovedInput(input){
 assert.equal(input.contract,'B07_SYN_APPROVED_NORMAL_HISTORY_V1');assert.equal(input.profile,'B07_SYN_APPROVED_V1');
 assert.equal(input.sourceKind,'SYNTHETIC_ONLY');assert.equal(input.realSourceImportVerified,false);
 assert.match(input.target.database,/^naijue_erp_test_b07_syn_approved_[a-z0-9_]+$/);assert.match(input.target.oid,/^[1-9]\d*$/);
 assert.equal(typeof input.target.role,'string');assert.ok(input.target.role.length>0);
 assert.ok(uuid(input.actor.accountId)&&(input.actor.hallId===null||uuid(input.actor.hallId)));
 assert.ok(uuid(input.references.batchId)&&uuid(input.references.publishedOperationId));
 assert.deepEqual(input.references.cases.map(r=>r.kind),['sales','transfers']);
 for(const r of input.references.cases){assert.ok(uuid(r.documentId)&&uuid(r.lineId));assert.equal(r.capturedSourceStatus,'APPROVED');assert.equal(r.capturedVersion,1);assert.equal(r.capturedQuantity,r.kind==='sales'?'2':'3');assert.equal(r.proposedQuantity,r.kind==='sales'?'3':'4');}
 assert.deepEqual(Object.keys(input.keys).sort(),['rollback','sales','salesCas','transfers','transfersCas']);
 assert.equal(new Set(Object.values(input.keys)).size,5);for(const k of Object.values(input.keys))assert.match(k,/^B07_SYN_APPROVED_V1_[A-Z0-9_]+$/);
 assert.ok(Number.isInteger(input.maxRows)&&input.maxRows>0&&input.maxRows<=10000);
 assert.equal(typeof input.sourceRoot,'string');assert.equal(typeof input.origin,'string');return input;
}
export function approvedQuantityCommand(current,reference,requestKey){
 assert.equal(current.kind,reference.kind);assert.equal(current.documentId,reference.documentId);assert.equal(current.sourceStatus,'APPROVED');assert.equal(current.baselineEffect,'INCLUDED_APPROVED');
 assert.ok(current.businessDate!==null);assert.equal(current.version,reference.capturedVersion);
 const line=current.lines.find(l=>l.lineId===reference.lineId);assert.ok(line);assert.equal(line.quantity,reference.capturedQuantity);
 return {kind:current.kind,documentId:current.documentId,expectedVersion:current.version,requestKey,
  reason:'明确SYN隔离验证：更正原已审核历史数量差额，保留来源、金额、单位与端仓身份。',lines:[{lineId:line.lineId,quantity:reference.proposedQuantity}],totals:null,settlements:[]};
}
const added=(before,after)=>{const old=new Set(before.map(stable));assert.ok(before.every(r=>after.some(a=>stable(a)===stable(r))),'Retained append-only row mutated');return after.filter(r=>!old.has(stable(r)));};
export function assertApprovedInventory(before,after,plan,receipt){
 const fresh=added(before.inventory_ledger,after.inventory_ledger);assert.equal(fresh.length,plan.effects.length);
 assert.equal(new Set(receipt.ledgerEntryIds).size,fresh.length);same([...receipt.ledgerEntryIds].sort(),fresh.map(r=>r.id).sort());
 const expected=new Map();
 for(const effect of plan.effects){
  const matches=fresh.filter(r=>r.source_history_revision_id===receipt.revisionId&&r.endpoint===effect.endpoint&&r.warehouse_id===effect.warehouseId&&r.sku_id===effect.skuId);
  assert.equal(matches.length,1);const row=matches[0];assert.equal(row.operation_id,receipt.operationId);assert.equal(row.event_kind,'HISTORY_REVISION');
  assert.equal(row.source_document_version,plan.toVersion);assert.equal(row.quantity_delta,effect.quantityDelta);assert.equal(row.business_date,plan.before.businessDate);
  assert.equal(row.source_history_sales_line_id,plan.before.kind==='sales'?effect.lineId:null);assert.equal(row.source_history_transfer_line_id,plan.before.kind==='transfers'?effect.lineId:null);
  for(const field of ['source_import_batch_id','source_sales_line_id','source_transfer_line_id','reverses_entry_id'])assert.equal(row[field],null);
  const k=key(row),v=expected.get(k)??{delta:0n,count:0};v.delta+=BigInt(effect.quantityDelta);v.count++;expected.set(k,v);
 }
 if(plan.before.kind==='transfers')assert.equal(plan.effects.reduce((n,e)=>n+BigInt(e.quantityDelta),0n),0n);
 const old=new Map(before.inventory_balance.map(r=>[key(r),r])),next=new Map(after.inventory_balance.map(r=>[key(r),r]));
 for(const k of new Set([...old.keys(),...next.keys()])){
  const delta=expected.get(k),a=old.get(k),b=next.get(k);
  if(!delta){same(a,b,'Unrelated stock key changed');continue;}
  assert.ok(b);assert.equal(BigInt(b.quantity),(a?BigInt(a.quantity):0n)+delta.delta);
  assert.equal(BigInt(b.version),(a?BigInt(a.version):0n)+BigInt(delta.count));assert.equal(b.last_operation_id,receipt.operationId);
 }
 for(const k of expected.keys())assert.ok(next.has(k));
}
export function assertPkRollbackEvidence(evidence){
 assert.equal(evidence.errorCode,'23505');assert.equal(evidence.firstLedgerInserted,1);assert.equal(evidence.firstBalancePersisted,1);
 assert.equal(evidence.secondLedgerAttempted,1);assert.equal(evidence.rolledBack,true);assert.equal(evidence.commits,0);
}
export async function runApprovedNormalHistory({api,pool,runtime26,input:raw,privateCookie,recordRequest,recordObservation,readBackgroundFailureCount,now}){
 const input=validateApprovedInput(structuredClone(raw));assert.equal(api.trustedOrigin,input.origin);assert.equal(api.app.server.listening,false);
 assert.equal(typeof privateCookie,'string');assert.ok(privateCookie&&!/[\r\n]/.test(privateCookie));
 for(const fn of [recordRequest,recordObservation,readBackgroundFailureCount,now])assert.equal(typeof fn,'function');
 const at=p=>import(pathToFileURL(resolve(input.sourceRoot,p)).href);
 const {checkedNativeRuntime26Capability}=await at('packages/application/src/native-import-schema-contract.ts');assert.ok(checkedNativeRuntime26Capability(runtime26));
 const {planHistoryRevision,parseHistoryRevisionCommand,createHistoryRevisionService}=await at('packages/application/src/history-revision-service.ts');
 const {requestHash}=await at('packages/application/src/request-hash.ts');
 const {readInventoryKeyAdmissions}=await at('adapters/postgres/src/inventory-key-admission-reader.ts');
 const {PostgresHistoryRevisionStore}=await at('adapters/postgres/src/history-revision-store.ts');
 const {createSourceConfirmedHistoryRevisionAuthorization}=await at('apps/api/src/history-revision-authorization.ts');
 const headers={origin:input.origin,cookie:privateCookie},signal=new AbortController().signal;
 let phase='NORMAL_SESSION',requestKey=null;
 const report={status:'STARTED',sourceKind:'SYNTHETIC_ONLY',realSourceImportVerified:false,cases:[],automaticRetry:false,
  notTested:['Real-source APPROVED sample/import','Originally NULL-date approved money','Actual UNKNOWN COMMIT','Full roles/browser/HTTPS/formal business']};
 const http=async(url,payload)=>{const response=await api.app.inject({method:'POST',url,headers,payload});await recordObservation({phase,requestKey,...historyResponseObservation(response)});return response;};
 async function reading(work){const c=await pool.connect();let began=false,ended=false,discard;
  try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');began=true;await runtime26.assertReady(c,'HISTORY_REVISION');
   const identity=(await c.query(`SELECT current_database() AS database,current_user AS role,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
    current_user<>(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS nonowner,
    (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass_rls`)).rows;
   assert.equal(identity.length,1);const {nonowner,superuser,bypass_rls,...target}=identity[0];same(target,input.target);assert.equal(nonowner,true);assert.equal(superuser,false);assert.equal(bypass_rls,false);
   const value=await work(c);await runtime26.assertReady(c,'HISTORY_REVISION');ended=true;await c.query('COMMIT');return value;
  }catch(e){if(!began||ended)discard=e;if(began&&!ended)try{await c.query('ROLLBACK');}catch(r){discard=r;throw new AggregateError([e,r]);}throw e;}finally{c.release(discard);}}
 async function snapshot(reference){return reading(async c=>{
  const rows=async(sql,values=[])=>{const r=(await c.query(sql,values)).rows;assert.ok(r.length<=input.maxRows,'Never truncate QA proof');return r.map(r=>r.value).sort((a,b)=>stable(a).localeCompare(stable(b)));};
  const sources={},projections={};for(const t of immutable)sources[t]=await rows(`SELECT to_jsonb(t)::text AS value FROM naijue_erp.${t} t LIMIT ${input.maxRows+1}`);
  for(const t of effective)projections[t]=await rows(`SELECT to_jsonb(t)::text AS value FROM naijue_erp.${t} t LIMIT ${input.maxRows+1}`);
  const stock={inventory_ledger:await rows(`SELECT to_jsonb(t)||jsonb_build_object('quantity_delta',t.quantity_delta::text,'business_date',to_char(t.business_date,'YYYY-MM-DD')) AS value FROM naijue_erp.inventory_ledger t LIMIT ${input.maxRows+1}`),
   inventory_balance:await rows(`SELECT to_jsonb(t)||jsonb_build_object('quantity',t.quantity::text,'version',t.version::text) AS value FROM naijue_erp.inventory_balance t LIMIT ${input.maxRows+1}`)};
  const revisions=await rows(`SELECT to_jsonb(t)::text AS value FROM naijue_erp.history_revision t LIMIT ${input.maxRows+1}`),audits=await rows(`SELECT to_jsonb(t)::text AS value FROM naijue_erp.audit_change t LIMIT ${input.maxRows+1}`),receipts=await rows(`SELECT to_jsonb(t)::text AS value FROM naijue_erp.operation_receipt t LIMIT ${input.maxRows+1}`);
  const identity=await rows(`SELECT jsonb_build_object('accountId',a.id,'staffId',a.staff_id,'enabled',a.login_enabled,'version',a.version,'authVersion',a.auth_version,'staffVersion',s.version,'employment',s.employment_status,'hallId',s.hall_id,'role',s.role) AS value FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id LIMIT ${input.maxRows+1}`);
  const facts=(await c.query('SELECT naijue_erp.history_numeric_current_facts($1::text,$2::uuid) AS value',[reference.kind==='sales'?'SALES':'TRANSFER',reference.documentId])).rows;assert.equal(facts.length,1);const current=facts[0].value;
  assert.equal(current.importBatchId,input.references.batchId);assert.equal(current.publishedOperationId,input.references.publishedOperationId);assert.equal(current.sourceStatus,'APPROVED');assert.equal(current.baselineEffect,'INCLUDED_APPROVED');
  const chosen=current.lines.find(l=>l.lineId===reference.lineId);assert.ok(chosen);const warehouses=current.kind==='sales'?[current.warehouseId]:[current.fromWarehouseId,current.toWarehouseId];
  const admission=await readInventoryKeyAdmissions(c,warehouses.map(warehouseId=>({warehouseId,skuId:chosen.skuId})));
  for(let i=0;i<admission.length;i++){assert.equal(admission[i].admitted,true);assert.equal(admission[i].publishedBatchId,input.references.batchId);
   const k=`${warehouses[i]}/${chosen.skuId}`;if(!stock.inventory_balance.some(r=>key(r)===k))assert.equal(stock.inventory_ledger.some(r=>key(r)===k),false,'Missing used balance cannot be zero');}
  return {sources,projections,stock,revisions,audits,receipts,identity,current,admission};
 });}
 async function detail(reference,expected){const r=await http(`/imported-history/${reference.kind}/detail/query`,{documentId:reference.documentId,linePage:1,linePageSize:200,settlementPage:1,settlementPageSize:200});assert.equal(r.statusCode,200);const d=r.json();assert.equal(d.dataset,'HISTORY');assert.equal(d.document.documentId,reference.documentId);assert.equal(d.document.version,expected.version);assert.equal(d.document.sourceStatus,'APPROVED');assert.equal(d.document.businessDate,expected.businessDate);assertCompleteHistoryPage(d.lines);assertCompleteHistoryPage(d.settlements);
  assert.equal(d.lines.items.length,expected.lines.length);for(const row of expected.lines){const got=d.lines.items.find(r=>r.id===row.lineId);assert.ok(got);assert.equal(got.quantity,row.quantity);assert.equal(got.skuId,row.skuId);}
  assert.equal(d.settlements.items.length,expected.settlements.length);for(const row of expected.settlements){const got=d.settlements.items.find(r=>r.id===row.settlementId);assert.ok(got);assert.equal(got.amount,row.amount);assert.equal(got.direction,row.direction);}return d;}
 const revise=(kind,command)=>http(`/imported-history/${kind}/revise`,command);
 try{
  const session=await api.app.inject({method:'GET',url:'/auth/session',headers});assert.equal(session.statusCode,200);const principal=session.json().principal;same({accountId:principal.accountId,hallId:principal.hallId},input.actor);
  await reading(async c=>assert.equal((await c.query('SELECT request_key FROM naijue_erp.operation_receipt WHERE actor_account_id=$1::uuid AND request_key=ANY($2::text[])',[input.actor.accountId,Object.values(input.keys)])).rows.length,0,'Fresh SYN run only; recover existing keys separately without resave'));
  for(const reference of input.references.cases){phase=`NORMAL_HTTP_${reference.kind}`;requestKey=null;const before=await snapshot(reference);
   const command=parseHistoryRevisionCommand(approvedQuantityCommand(before.current,reference,input.keys[reference.kind]));requestKey=command.requestKey;
   await recordRequest({contract:input.contract,target:input.target,actor:input.actor,phase,command});
   const response=await revise(reference.kind,command);assert.equal(response.statusCode,200,'Stop on failure or unknown COMMIT; retain original key, never auto-retry');const receipt=response.json();
   assert.equal(receipt.kind,reference.kind);assert.equal(receipt.dataset,'HISTORY');assert.equal(receipt.documentId,reference.documentId);assert.equal(receipt.version,before.current.version+1);assert.ok(uuid(receipt.operationId)&&uuid(receipt.revisionId));
   const plan=planHistoryRevision(before.current,command,receipt.revisionId),after=await snapshot(reference);
   same(after.current,plan.after);same(after.sources,before.sources);same(after.identity,before.identity);same(after.admission,before.admission);assertApprovedInventory(before.stock,after.stock,plan,receipt);
   const newRevision=added(before.revisions,after.revisions).map(JSON.parse),newAudit=added(before.audits,after.audits).map(JSON.parse),newReceipt=added(before.receipts,after.receipts).map(JSON.parse);
   assert.equal(newRevision.length,1);assert.equal(newAudit.length,1);assert.equal(newReceipt.length,1);
   assert.equal(newRevision[0].id,receipt.revisionId);assert.equal(newRevision[0].operation_id,receipt.operationId);assert.equal(newRevision[0].actor_account_id,input.actor.accountId);assert.equal(newRevision[0].reason,command.reason);same(newRevision[0].before_facts,before.current);same(newRevision[0].after_facts,plan.after);
   assert.equal(newAudit[0].operation_id,receipt.operationId);assert.equal(newAudit[0].actor_account_id,input.actor.accountId);assert.equal(newAudit[0].action,'HISTORY_REVISE');assert.equal(newAudit[0].object_id,reference.documentId);assert.equal(newAudit[0].old_version,plan.fromVersion);assert.equal(newAudit[0].new_version,plan.toVersion);same(newAudit[0].before_values,before.current);same(newAudit[0].after_values,plan.after);
   assert.equal(newReceipt[0].id,receipt.operationId);assert.equal(newReceipt[0].status,'COMMITTED');assert.equal(newReceipt[0].request_key,command.requestKey);assert.equal(newReceipt[0].request_hash,requestHash({actorAccountId:input.actor.accountId,command}));same(newReceipt[0].result_data,receipt);assert.equal(newReceipt[0].action,'HISTORY_REVISE');assert.equal(newReceipt[0].target_id,reference.documentId);assert.equal(newAudit[0].occurred_at,newReceipt[0].completed_at);for(const row of after.stock.inventory_ledger.filter(r=>r.operation_id===receipt.operationId))assert.equal(row.posted_at,newReceipt[0].completed_at);for(const row of after.stock.inventory_balance.filter(r=>r.last_operation_id===receipt.operationId))assert.equal(row.updated_at,newReceipt[0].completed_at);
   for(const table of effective){const idKey=table.endsWith('_line_effective')?'line_id':table.endsWith('_settlement_effective')?'settlement_id':'header_id',own=table===`history_${reference.kind==='sales'?'sales':'transfer'}_effective`?[reference.documentId]:table===`history_${reference.kind==='sales'?'sales':'transfer'}_line_effective`?[reference.lineId]:[];const allowed=new Set(own),unrelated=rows=>rows.filter(r=>!allowed.has(JSON.parse(r)[idKey]));same(unrelated(before.projections[table]),unrelated(after.projections[table]));}
   await detail(reference,plan.after);
   const list=await http(`/imported-history/${reference.kind}/query`,{batchId:input.references.batchId,number:'',businessDateFrom:null,businessDateTo:null,sourceStatus:null,hallId:null,warehouseId:null,customerId:null,salespersonId:null,fromWarehouseId:null,toWarehouseId:null,page:1,pageSize:20});assert.equal(list.statusCode,200);const page=list.json().documents;assertCompleteHistoryPage(page);assert.ok(page.items.some(d=>d.documentId===reference.documentId&&d.version===receipt.version));
   same(await snapshot(reference),after,'Four POST readers must not write business facts');
   phase=`REPLAY_CONFLICT_CAS_${reference.kind}`;const replay=await revise(reference.kind,command);assert.equal(replay.statusCode,200);same(replay.json(),receipt);same(await snapshot(reference),after);
   const conflict=await revise(reference.kind,{...command,reason:command.reason+' conflict'});assert.equal(conflict.statusCode,409);assert.equal(conflict.json().error.code,'IDEMPOTENCY_CONFLICT');same(await snapshot(reference),after);
   const cas=await revise(reference.kind,{...command,requestKey:input.keys[`${reference.kind}Cas`]});assert.equal(cas.statusCode,409);assert.equal(cas.json().error.code,'VERSION_CONFLICT');same(await snapshot(reference),after);
   report.cases.push({kind:reference.kind,status:'PASS_NORMAL_HTTP_SYN_APPROVED_DELTA_READBACK_AUDIT_REPLAY_CAS',operationId:receipt.operationId,revisionId:receipt.revisionId,version:receipt.version,ledgerEntryIds:receipt.ledgerEntryIds});
  }
  phase='DIRECT_SERVICE_ACTUAL_SECOND_ENDPOINT_PK_ROLLBACK';const reference=input.references.cases[1],before=await snapshot(reference),current=before.current,line=current.lines.find(l=>l.lineId===reference.lineId);
  const command={kind:'transfers',documentId:reference.documentId,expectedVersion:current.version,requestKey:input.keys.rollback,reason:'明确SYN隔离事务验证：第二端真实ledger主键冲突，要求整笔回滚。',lines:[{lineId:line.lineId,quantity:(BigInt(line.quantity)+1n).toString()}],totals:null,settlements:[]};requestKey=command.requestKey;
  const collision=before.stock.inventory_ledger.find(r=>r.source_history_revision_id===report.cases[1].revisionId&&r.endpoint==='TO');assert.ok(collision);
  const ids={operation:randomUUID(),revision:randomUUID(),firstLedger:randomUUID()};
  await reading(async c=>{for(const [table,id] of [['operation_receipt',ids.operation],['history_revision',ids.revision],['inventory_ledger',ids.firstLedger]])assert.equal((await c.query(`SELECT id FROM naijue_erp.${table} WHERE id=$1::uuid`,[id])).rows.length,0);});
  const evidence={errorCode:null,firstLedgerInserted:0,firstBalancePersisted:0,secondLedgerAttempted:0,rolledBack:false,commits:0};let generatedLedger=0;
  const samePool={async connect(){const c=await pool.connect();return {async query(sql,args){if(sql.includes('/* history-posting:ledger */')&&args?.[0]===collision.id)evidence.secondLedgerAttempted++;
   const r=await c.query(sql,args);if(sql.includes('/* history-posting:ledger */')&&args?.[0]===ids.firstLedger){assert.equal(r.rowCount,1);evidence.firstLedgerInserted++;}
   if(evidence.firstLedgerInserted===1&&evidence.secondLedgerAttempted===0&&/^\s*(INSERT INTO|UPDATE) naijue_erp\.inventory_balance/.test(sql)){assert.equal(r.rowCount,1);evidence.firstBalancePersisted++;}
   if(sql==='ROLLBACK')evidence.rolledBack=true;if(sql==='COMMIT')evidence.commits++;return r;},release(error){c.release(error);}};}};
  const service=createHistoryRevisionService({authorization:createSourceConfirmedHistoryRevisionAuthorization(pool,runtime26),now,
   store:PostgresHistoryRevisionStore.forRuntime26(samePool,{runtime26,newId:kind=>kind==='operation'?ids.operation:kind==='revision'?ids.revision:++generatedLedger===1?ids.firstLedger:collision.id})});
  await recordRequest({contract:input.contract,target:input.target,actor:input.actor,phase,command,companionIds:{...ids,collisionLedger:collision.id}});
  let failure;try{await service.execute(input.actor,command,signal);}catch(e){failure=e;evidence.errorCode=e.code;}
  assert.ok(failure,'Expected actual second-endpoint PK conflict');assertPkRollbackEvidence(evidence);same(await snapshot(reference),before,'Actual partial endpoint work must fully roll back, including the retained collision row');
  report.cases.push({kind:'transfers',status:'PASS_DIRECT_SERVICE_ACTUAL_SECOND_ENDPOINT_PK_FULL_ROLLBACK',evidence});
  assert.equal(await readBackgroundFailureCount(),0);report.status='PASS_ACTUAL_SYN_APPROVED_LIMITED_SCOPE';return report;
 }catch(e){report.status='FAILED_STOP_NO_RETRY';report.failedPhase=phase;report.requestKey=requestKey;report.errorCode=typeof e.code==='string'?e.code:null;await recordObservation({phase,requestKey,status:report.status,errorCode:report.errorCode});e.approvedHistoryResult=report;throw e;}
}
