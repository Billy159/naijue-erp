// T45-only explicit execution. No pool, listener, login, fixture, migration or publication is created.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const stable=value=>JSON.stringify(value,(_key,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const same=(a,b,message)=>assert.equal(stable(a),stable(b),message);
const sorted=rows=>[...rows].sort((a,b)=>stable(a).localeCompare(stable(b)));
const headerTables={sales:'history_sales_header',transfers:'history_transfer_header'};
const immutable=['import_batch','import_source_row','import_record','import_record_accounting_claim','import_history_closure_manifest','import_history_document_manifest','history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line','product','sku','sku_barcode','warehouse','hall'];
const effective=['history_sales_effective','history_transfer_effective','history_sales_line_effective','history_transfer_line_effective','history_sales_settlement_effective'];
const safeHttpCodes=new Set(['UNAUTHENTICATED','FORBIDDEN','INVALID_AUTH_INPUT','BODY_TOO_LARGE','INVALID_JSON','UNSUPPORTED_MEDIA_TYPE',
 'HISTORY_REVISION_INVALID','HISTORY_REVISION_EMPTY','HISTORY_REVISION_FOREIGN_ROW','HISTORY_REVISION_QUANTITY_OVERFLOW',
 'INVALID_ACTOR_CONTEXT','IMPORTED_HISTORY_FORBIDDEN','VERSION_CONFLICT','IDEMPOTENCY_CONFLICT','SETTLEMENT_MISMATCH',
 'HISTORY_REVISION_BUSINESS_DATE_UNKNOWN','HISTORY_REVISION_NOT_FOUND','HISTORY_REVISION_ABORTED','HISTORY_REVISION_BASELINE_UNPROVEN',
 'HISTORY_REVISION_SCHEMA_NOT_READY','HISTORY_REVISION_STORE_NOT_READY','HISTORY_REVISION_COMMIT_OUTCOME_UNKNOWN','INTERNAL_ERROR',
 'IMPORTED_HISTORY_INVALID_QUERY','IMPORTED_HISTORY_READ_ABORTED','IMPORTED_HISTORY_UNAVAILABLE']);
export function assertCompleteHistoryPage(page){
 assert.ok(typeof page.total==='string'&&/^(?:0|[1-9]\d*)(?![\s\S])/.test(page.total),'History page total must be canonical nonnegative integer text');
 assert.equal(BigInt(page.items.length),BigInt(page.total),'Full selected document rows must fit original detail page');
}
export function historyResponseObservation(response){
 let jsonParseable=false,errorCode=null;
 try{const value=response.json();jsonParseable=true;const code=value?.error?.code;if(safeHttpCodes.has(code))errorCode=code;}catch{}
 return {statusCode:Number.isInteger(response.statusCode)&&response.statusCode>=100&&response.statusCode<=599?response.statusCode:null,jsonParseable,errorCode};
}
export function resolveDraftReferences(plan,artifacts){
 const read=ref=>{assert.ok(Object.hasOwn(artifacts,ref.artifact));return ref.jsonPointer.split('/').slice(1).reduce((v,k)=>{const key=k.replace(/~1/g,'/').replace(/~0/g,'~');assert.ok(v!==null&&v!==undefined&&Object.hasOwn(v,key),'Original private JSON Pointer missing');return v[key];},artifacts[ref.artifact]);};
 assert.equal(plan.status,'ACTUAL_CAPTURE_REFERENCES_BOUND_DRAFT_ONLY_NOT_EXECUTABLE');
 const cases=plan.cases.map(c=>({kind:c.kind,documentId:read(c.documentId),lineId:read(c.lineChange.lineId),capturedVersion:read(c.capturedOriginalVersion),capturedSourceStatus:read(c.capturedOriginalStatus),capturedQuantity:read(c.lineChange.capturedQuantity),proposedQuantity:c.lineChange.proposedQuantity}));
 assert.deepEqual(cases.map(c=>c.kind),['sales','transfers']);
 for(const c of cases){assert.ok(uuid(c.documentId)&&uuid(c.lineId));assert.equal(c.capturedSourceStatus,'DRAFT');assert.equal(c.capturedVersion,1);}
 return {batchId:read(plan.batch.id),publishedOperationId:read(plan.batch.publishReceiptId),cases};
}
export function validateDraftInput(input){
 assert.equal(input.contract,'B07_DRAFT_NORMAL_HISTORY_V16_1');
 assert.equal(input.patchLevel,'26_v16_history_responsible_from_v14');
 if(input.targetProfile==='ORIGINAL_PRESERVED_B07_COPY'){
  assert.equal(input.target.database,'naijue_erp_test_19e00102');assert.match(input.target.oid,/^[1-9][0-9]*$/);assert.equal(typeof input.target.role,'string');
  assert.equal(typeof input.copyRegistrationReference,'string');assert.ok(input.copyRegistrationReference.length>0,'C original preserved-copy current target registration required');
 }else assert.deepEqual(input.target,{database:'erp_qa_rapid26_native_20261023_01',oid:'1032586',role:'erp_qa_v14_core_runtime_20261024_01'});
 assert.ok(input.actor&&uuid(input.actor.accountId)&&(input.actor.hallId===null||uuid(input.actor.hallId)));
 assert.ok(input.references&&uuid(input.references.batchId)&&uuid(input.references.publishedOperationId));
 assert.deepEqual(input.references.cases.map(c=>c.kind),['sales','transfers']);
 assert.ok(Number.isInteger(input.maxRows)&&input.maxRows>0&&input.maxRows<=10000);
 assert.deepEqual(Object.keys(input.keys).sort(),['money','moneyCas','sales','salesCas','transfers','transfersCas']);
 assert.equal(new Set(Object.values(input.keys)).size,6);
 for(const c of input.references.cases){assert.ok(uuid(c.documentId)&&uuid(c.lineId));assert.equal(c.capturedSourceStatus,'DRAFT');assert.equal(c.capturedVersion,1);}
 return input;
}
export function draftQuantityCommand(before,reference,key){
 assert.equal(before.sourceStatus,'DRAFT');assert.equal(before.baselineEffect,'EXCLUDED_NOT_EFFECTIVE');assert.equal(before.kind,reference.kind);assert.equal(before.documentId,reference.documentId);
 assert.equal(before.version,reference.capturedVersion,'Current effective version differs: recover original request, never change key/version blindly');
 // JSONB captures encode bigint values as JSON numbers; the current-facts
 // helper returns bigint::text. Compare exact integer values without changing
 // either capture or command, and never round an unsafe JSON number.
 const captured=reference.capturedQuantity;
 assert.ok(typeof captured==='number'?Number.isSafeInteger(captured):typeof captured==='string'&&/^(?:0|-?[1-9]\d*)$/.test(captured),'Original captured quantity must be an exact integer');
 const line=before.lines.find(l=>l.lineId===reference.lineId);assert.ok(line);assert.equal(line.quantity,String(captured));
 return {kind:before.kind,documentId:before.documentId,expectedVersion:before.version,requestKey:key,
  reason:before.kind==='sales'?'隔离QA：受控更正原未审核历史销货行数量，保留原来源、金额与身份，验证零库存影响。':'隔离QA：受控更正原未审核历史调拨行数量，保留原来源与端仓，验证零库存影响及守恒。',
  lines:[{lineId:line.lineId,quantity:reference.proposedQuantity}],totals:null,settlements:[]};
}
const MAX_HISTORY_CENTS=10n**18n-1n;
function historyCents(value,nonnegative=false){
 assert.ok(typeof value==='string'&&/^-?(?:0|[1-9]\d{0,15})\.\d{2}(?![\s\S])/.test(value)&&value!=='-0.00','Exact canonical historical money required');
 const cents=BigInt(value.replace('.',''));assert.ok(!nonnegative||cents>=0n);return cents;
}
const moneyText=cents=>(cents/100n).toString()+'.'+(cents%100n).toString().padStart(2,'0');
export function draftMoneyCommand(before,key){
 assert.equal(before.kind,'sales');assert.equal(before.sourceStatus,'DRAFT');assert.equal(before.baselineEffect,'EXCLUDED_NOT_EFFECTIVE');
 const line=before.lines[0];assert.ok(line&&uuid(line.lineId));
 const price=historyCents(line.dealPrice,true)+1n;assert.ok(price<=MAX_HISTORY_CENTS,'Price increment exceeds exact money boundary');
 const signed=before.settlements.reduce((sum,row)=>{assert.ok(uuid(row.settlementId)&&['RECEIVE','REFUND'].includes(row.direction));return sum+(row.direction==='RECEIVE'?1n:-1n)*historyCents(row.amount,true);},0n);
 const delta=historyCents(before.totals.netDue)-signed,settlements=[];
 if(delta!==0n){
  for(const row of before.settlements){const amount=historyCents(row.amount,true)+(row.direction==='RECEIVE'?1n:-1n)*delta;
   if(amount>=0n&&amount<=MAX_HISTORY_CENTS){settlements.push({settlementId:row.settlementId,amount:moneyText(amount)});break;}}
  assert.equal(settlements.length,1,'No legal existing settlement amount can balance this explicit correction');
 }
 return {kind:'sales',documentId:before.documentId,expectedVersion:before.version,requestKey:key,
  reason:settlements.length?'隔离QA：明确修订原成交价0.01及同单既有结算金额，使修改后结算与原应收守恒；不改来源身份、结算账号方向、数量及库存。':'隔离QA：仅更正原未审核历史销货行成交价0.01，数量与结算不变，验证金额单改不影响库存。',
  lines:[{lineId:line.lineId,dealPrice:moneyText(price)}],totals:null,settlements};
}
function pinnedDraftJson(continuation){
 assert.ok(continuation&&Object.getPrototypeOf(continuation)===Object.prototype);
 assert.deepEqual(Object.keys(continuation).sort(),['requestBytes','sha256']);assert.ok(continuation.requestBytes instanceof Uint8Array);
 const bytes=Buffer.from(continuation.requestBytes);assert.ok(bytes.length>0&&bytes.length<=65536);
 assert.equal(typeof continuation.sha256,'string');assert.match(continuation.sha256,/^[a-f0-9]{64}(?![\s\S])/);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),continuation.sha256,'Original private bytes differ from registered SHA');
 const text=bytes.toString('utf8');assert.ok(Buffer.from(text,'utf8').equals(bytes));
 try{return JSON.parse(text);}catch{throw Error('B07_ORIGINAL_PRIVATE_JSON_INVALID');}
}
function recordedRequest(input,pin){const request=pinnedDraftJson(pin);
 assert.deepEqual(Object.keys(request).sort(),['actor','command','contract','phase','target']);
 assert.equal(request.contract,input.contract);same(request.target,input.target);same(request.actor,input.actor);return request;
}
export function validateCommittedDraftRequest(input,continuation,kind='sales'){
 assert.ok(['sales','transfers'].includes(kind));const request=recordedRequest(input,continuation);
 assert.equal(request.phase,kind==='sales'?'DRAFT_SALES_QUANTITY_NO_STOCK':'DRAFT_TRANSFER_QUANTITY_NO_STOCK_CONSERVATION');
 const command=request.command,reference=input.references.cases[kind==='sales'?0:1];
 assert.equal(command.kind,kind);assert.equal(command.documentId,reference.documentId);assert.equal(command.expectedVersion,1);
 assert.equal(command.requestKey,input.keys[kind]);same(command.lines,[{lineId:reference.lineId,quantity:reference.proposedQuantity}]);
 assert.equal(command.totals,null);same(command.settlements,[]);return request;
}
export async function runDraftNormalHistory(options){return runDraftNormalHistoryCore(options,null);}
export async function runDraftNormalHistoryCommittedContinuation(options){
 const input=validateDraftInput(structuredClone(options.input));
 const original=validateCommittedDraftRequest(input,options.committedContinuation);
 const committedContinuation={sha256:options.committedContinuation.sha256};
 return runDraftNormalHistoryCore({...options,committedContinuation},original);
}
export const REGISTERED_MONEY_RETRY_PINS=Object.freeze({
 moneyRequest:{bytes:957,sha256:'c33b1b48334eceb6439ebe4d2d9e554cdbeeae3abb8513c8ac96967ede59db28'},
 noCommitProof:{bytes:1193,sha256:'c6642963ba44c22ed9cede312e86dbe1c6e73d8fadb72a12746bae82355ed866'},
});
export function validateMoneyNoCommitProof(proof,input){
 assert.equal(proof.status,'PASS_CHILD02_MONEY_ORIGINAL_KEY_RECEIPT_READONLY');assert.equal(proof.businessDML,0);assert.equal(proof.HTTPAttempted,false);assert.equal(proof.setupRetried,false);assert.equal(proof.transactionReadOnly,true);assert.equal(proof.diagnosticRollbackReturned,true);assert.equal(proof.clientsEnded,true);
 const identity=proof.identity;assert.equal(identity.database,input.target.database);assert.equal(identity.oid,input.target.oid);assert.equal(identity.role,input.target.role);assert.equal(identity.session_user,input.target.role);
 assert.equal(identity.address,null);assert.equal(identity.port,null);assert.equal(identity.readonly,'on');assert.equal(identity.isolation,'repeatable read');assert.equal(identity.nonowner,true);assert.equal(identity.superuser,false);assert.equal(identity.bypass,false);
 same(proof.receipts,{receipts:2,committed:2});same(proof.originalReceipt,[]);same(proof.revisions,{all_revisions:2,qa_key_revisions:2});same(proof.safeQa,[{version:3,auth_version:3,login_enabled:true}]);same(proof.currentVersions,{sales_version:2,transfer_version:2});return proof;
}
export async function runDraftNormalHistoryRegisteredMoneyRetry(options){
 const input=validateDraftInput(structuredClone(options.input)),retry=options.registeredMoneyRetry;
 assert.ok(retry&&Object.getPrototypeOf(retry)===Object.prototype);assert.deepEqual(Object.keys(retry).sort(),['money','outcome']);
 const outcome=pinnedDraftJson(retry.outcome);validateMoneyNoCommitProof(outcome,input);
 // Parent fixes these pins to REGISTERED_MONEY_RETRY_PINS. The isolated protocol
 // primitive also validates the supplied registered bytes, identity and no-commit facts.
 assert.ok(!options.remainingMoneyContinuation?.money,'Original money request has only one registered source');
 return prepareRemainingMoneyContinuation(options,{money:retry.money,outcomeSha256:retry.outcome.sha256});
}
export async function runDraftNormalHistoryRemainingMoneyContinuation(options){return prepareRemainingMoneyContinuation(options,null);}
async function prepareRemainingMoneyContinuation(options,registeredRetry){

 const input=validateDraftInput(structuredClone(options.input)),pins=registeredRetry?{...options.remainingMoneyContinuation,money:registeredRetry.money}:options.remainingMoneyContinuation;
 assert.ok(pins&&Object.getPrototypeOf(pins)===Object.prototype);assert.deepEqual(Object.keys(pins).sort(),(pins.money?['completedCases','money','sales','transfers']:['completedCases','sales','transfers']).sort());
 const sales=validateCommittedDraftRequest(input,pins.sales),transfers=validateCommittedDraftRequest(input,pins.transfers,'transfers'),completed=pinnedDraftJson(pins.completedCases);
 assert.equal(completed.status,'FAILED_OR_OUTCOME_UNCERTAIN_NO_AUTO_RETRY');assert.equal(completed.firstFailure?.phase,'DRAFT_SALES_MONEY_ONLY_NO_STOCK');assert.equal(completed.firstFailure?.comparisonStage,'BUILD_COMMAND');
 assert.equal(completed.recoveredFirstCase?.status,'PASS_ORIGINAL_COMMITTED_KEY_DETAIL_REPLAY_CONFLICT_CAS_NO_NEW_WRITE');assert.equal(completed.recoveredFirstCase.version,2);assert.equal(completed.recoveredFirstCase.originalRequestSha256,pins.sales.sha256);
 assert.equal(completed.cases?.length,1);assert.equal(completed.cases[0].name,'DRAFT_TRANSFER_QUANTITY_NO_STOCK_CONSERVATION');assert.equal(completed.cases[0].status,'PASS_NORMAL_HISTORY_HTTP_CURRENT_FACTS_SOURCE_STOCK_AUDIT_RECEIPT_REPLAY_CAS');assert.equal(completed.cases[0].version,2);assert.equal(completed.cases[0].stockUnchanged,true);
 let money=null;if(pins.money){money=recordedRequest(input,pins.money);assert.equal(money.phase,'DRAFT_SALES_MONEY_ONLY_NO_STOCK');assert.equal(money.command.kind,'sales');assert.equal(money.command.documentId,input.references.cases[0].documentId);assert.equal(money.command.requestKey,input.keys.money);assert.equal(money.command.expectedVersion,2);}
 return runDraftNormalHistoryCore(options,null,{sales,transfers,completed,money,completedSha256:pins.completedCases.sha256,registeredRetry});
}
async function runDraftNormalHistoryCore({api,pool,runtime26,input:raw,privateCookie,recordRequest,recordObservation,readBackgroundFailureCount,committedContinuation},recoveredRequest,remainingMoney=null){
 const input=validateDraftInput(structuredClone(raw));assert.equal(api.trustedOrigin,input.origin);assert.equal(api.app.server.listening,false);
 assert.equal(typeof privateCookie,'string');assert.ok(privateCookie&&!/[\r\n]/.test(privateCookie));assert.equal(typeof recordRequest,'function');assert.equal(typeof recordObservation,'function');assert.equal(typeof readBackgroundFailureCount,'function');
 const at=p=>import(pathToFileURL(resolve(input.sourceRoot,p)).href);
 const {planHistoryRevision,parseHistoryRevisionCommand}=await at('packages/application/src/history-revision-service.ts');
 const {requestHash}=await at('packages/application/src/request-hash.ts');
 const headers={origin:input.origin,cookie:privateCookie};
 const observe=async(response,requestKey)=>{const value={phase,requestKey,comparisonStage,...historyResponseObservation(response)};result.lastHttpObservation=value;await recordObservation(value);};
 const http=async(kind,command)=>{const response=await api.app.inject({method:'POST',url:`/imported-history/${kind}/revise`,headers,payload:command});await observe(response,command.requestKey);return response;};
 const signal=new AbortController().signal;
 async function reading(work){
  const c=await pool.connect();let began=false,commitAttempted=false,discard;
  try{
   // The existing current-facts helper takes row locks: regular RR, no business DML.
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');began=true;await runtime26.assertReady(c,'HISTORY_REVISION');
   const identity=(await c.query(`SELECT current_database() AS database,current_user AS role,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
    current_user<>(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS nonowner,
    (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass_rls`)).rows;
   assert.equal(identity.length,1);const {nonowner,superuser,bypass_rls,...target}=identity[0];assert.deepEqual(target,input.target);assert.equal(nonowner,true);assert.equal(superuser,false);assert.equal(bypass_rls,false);const result=await work(c);await runtime26.assertReady(c,'HISTORY_REVISION');commitAttempted=true;await c.query('COMMIT');return result;
  }catch(e){if(!began||commitAttempted)discard=e;if(began&&!commitAttempted)try{await c.query('ROLLBACK');}catch(rollback){discard=rollback;throw new AggregateError([e,rollback],'B07 readback rollback failed');}throw e;}finally{c.release(discard);}
 }
 async function snapshot(document=null){return reading(async c=>{
  const rows=async(sql,values=[])=>{const r=(await c.query(sql,values)).rows;assert.ok(r.length<=input.maxRows,'Bounded QA snapshot exceeded; never truncate and pass');return sorted(r.map(x=>x.value));};
  const sources={};for(const table of immutable)sources[table]=await rows(`SELECT to_jsonb(t)::text AS value FROM naijue_erp.${table} t LIMIT ${input.maxRows+1}`);
  const projections={};for(const table of effective)projections[table]=await rows(`SELECT to_jsonb(t)::text AS value FROM naijue_erp.${table} t LIMIT ${input.maxRows+1}`);
  const stock={};for(const table of ['inventory_ledger','inventory_balance'])stock[table]=await rows(`SELECT to_jsonb(t)::text AS value FROM naijue_erp.${table} t LIMIT ${input.maxRows+1}`);
  const revisions=await rows(`SELECT to_jsonb(t)::text AS value FROM naijue_erp.history_revision t LIMIT ${input.maxRows+1}`);
  const audits=await rows(`SELECT to_jsonb(t)::text AS value FROM naijue_erp.audit_change t LIMIT ${input.maxRows+1}`);
  const receipts=await rows(`SELECT to_jsonb(t)::text AS value FROM naijue_erp.operation_receipt t LIMIT ${input.maxRows+1}`);
  const identity=await rows(`SELECT jsonb_build_object('accountId',a.id,'staffId',a.staff_id,'enabled',a.login_enabled,'version',a.version,'authVersion',a.auth_version,'staffVersion',s.version,'employment',s.employment_status,'hallId',s.hall_id,'role',s.role) AS value FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id ORDER BY a.id LIMIT ${input.maxRows+1}`);
  let current=null;if(document){const r=(await c.query('SELECT naijue_erp.history_numeric_current_facts($1::text,$2::uuid) AS value',[document.kind==='sales'?'SALES':'TRANSFER',document.documentId])).rows;assert.equal(r.length,1);current=r[0].value;}
  return {sources,projections,stock,revisions,audits,receipts,identity,current};
 });}
 async function readDetail(kind,documentId){
  const r=await api.app.inject({method:'POST',url:`/imported-history/${kind}/detail/query`,headers,payload:{documentId,linePage:1,linePageSize:200,settlementPage:1,settlementPageSize:200}});
  await observe(r,key);
  assert.equal(r.statusCode,200,'Normal HISTORY detail read must succeed');const d=r.json();assert.equal(d.dataset,'HISTORY');assert.ok(d.document);assert.equal(d.document.documentId,documentId);
  assertCompleteHistoryPage(d.lines);assertCompleteHistoryPage(d.settlements);return d;
 }
 const session=await api.app.inject({method:'GET',url:'/auth/session',headers});assert.equal(session.statusCode,200);const principal=session.json().principal;
 assert.equal(principal.accountId,input.actor.accountId);assert.equal(principal.hallId,input.actor.hallId);
 const result={status:'STARTED',actualHrev:false,cases:[],notTested:['APPROVED sales quantity delta','APPROVED transfer opposite-endpoint stock delta and real second-endpoint rollback','Originally NULL-date approved money case','Actual UNKNOWN COMMIT not induced','Full roles/browser/HTTPS/formal business acceptance'],automaticRetry:false,fixtureCreated:false,sourceChanged:false};
 let phase='EXACT_TARGET_REGISTERED_HISTORY_PRESENCE',key=null,comparisonStage='PRECHECK',moneyAlreadyCommitted=false;
 try{
  await reading(async c=>{
   for(const r of input.references.cases){
    const rows=(await c.query(`SELECT h.id,h.batch_id,h.source_status,b.status AS batch_status FROM naijue_erp.${headerTables[r.kind]} h JOIN naijue_erp.import_batch b ON b.id=h.batch_id WHERE h.id=$1::uuid AND h.batch_id=$2::uuid`,[r.documentId,input.references.batchId])).rows;
    assert.equal(rows.length,1,'B07_REGISTERED_PUBLISHED_DRAFTS_MISSING_IN_TARGET');assert.equal(rows[0].source_status,'DRAFT');assert.equal(rows[0].batch_status,'IMPORTED');
   }
   const keys=(await c.query('SELECT request_key FROM naijue_erp.operation_receipt WHERE actor_account_id=$1::uuid AND request_key=ANY($2::text[])',[input.actor.accountId,Object.values(input.keys)])).rows;
   if(remainingMoney){moneyAlreadyCommitted=keys.some(r=>r.request_key===input.keys.money);
    same(keys.map(r=>r.request_key).sort(),[input.keys.sales,input.keys.transfers,...(moneyAlreadyCommitted?[input.keys.money]:[])].sort(),'Only completed quantity keys and an explicitly recovered money key may exist');
    assert.ok(!moneyAlreadyCommitted||remainingMoney.money,'B07_MONEY_ORIGINAL_KEY_PRESENT_READONLY_RECOVERY_REQUIRED');
    if(remainingMoney.registeredRetry)assert.equal(moneyAlreadyCommitted,false,'Known no-commit proof is no longer current; recover the original key without a new save');
    else assert.ok(moneyAlreadyCommitted||!remainingMoney.money,'B07_RECORDED_MONEY_OUTCOME_REVIEW_REQUIRED');
   }else if(recoveredRequest){assert.equal(keys.length,1,'Only the original committed sales key may exist');assert.equal(keys[0].request_key,input.keys.sales);}
   else assert.equal(keys.length,0,'B07 original keys already present: recover recorded original commands; do not rerun this carrier');
  });
  async function executeCase(name,reference,buildCommand,casKey,originalRequest=null){
   phase=name;key=null;comparisonStage='BEFORE_SNAPSHOT';const before=await snapshot(reference);comparisonStage='BUILD_COMMAND';const command=parseHistoryRevisionCommand(buildCommand(before.current));key=command.requestKey;
   comparisonStage='PUBLICATION_BINDING';
   assert.equal(before.current.importBatchId,input.references.batchId);assert.equal(before.current.publishedOperationId,input.references.publishedOperationId);
   await recordRequest({contract:input.contract,target:input.target,actor:input.actor,phase:name,command:structuredClone(command)}); // C persists privately before first write.
   comparisonStage='FIRST_RESPONSE';const response=await http(reference.kind,originalRequest?.command??command);let receipt;
   if(response.statusCode===503&&response.json()?.error?.code==='HISTORY_REVISION_COMMIT_OUTCOME_UNKNOWN'){
    // No resend here. Read exact committed outcome and return original-key recovery material to T45.
    const original=await reading(async c=>(await c.query(`SELECT status,request_hash,result_data FROM naijue_erp.operation_receipt WHERE actor_account_id=$1::uuid AND request_key=$2 AND target_id=$3::uuid`,[input.actor.accountId,command.requestKey,command.documentId])).rows);
    if(original.length===1&&original[0].status==='COMMITTED'&&original[0].request_hash===requestHash({actorAccountId:input.actor.accountId,command})){
     result.confirmedCommittedRecovery={phase:name,requestKey:command.requestKey,result:original[0].result_data};
    }
    throw Error('B07_UNKNOWN_ACK_STOP_USE_PRIVATE_RECORDED_ORIGINAL_KEY_ONLY');
   }
   assert.equal(response.statusCode,200,'Historical revision failed: stop and preserve original request, never use LIVE SAVE');receipt=response.json();
   comparisonStage='RECEIPT';
   assert.equal(receipt.dataset,'HISTORY');assert.equal(receipt.documentId,command.documentId);assert.equal(receipt.version,before.current.version+1);assert.deepEqual(receipt.ledgerEntryIds,[]);
   comparisonStage='PLAN';const expected=planHistoryRevision(before.current,command,receipt.revisionId);assert.deepEqual(expected.effects,[]);
   comparisonStage='AFTER_SNAPSHOT';const after=await snapshot(reference);comparisonStage='CURRENT_FACTS';same(after.current,expected.after,'Current numeric facts differ from original planner');comparisonStage='SOURCE_IDENTITY_STOCK';same(after.sources,before.sources,'Original source/reference/publication mutated');same(after.identity,before.identity,'Actor/staff changed');same(after.stock,before.stock,'DRAFT or money-only revision changed stock');
   comparisonStage='COMMITTED_COUNTS';
   assert.equal(after.revisions.length,before.revisions.length+1);assert.equal(after.audits.length,before.audits.length+1);assert.equal(after.receipts.length,before.receipts.length+1);
   comparisonStage='UNRELATED_EFFECTIVE';for(const table of effective){
    const idKey=table.endsWith('_line_effective')?'line_id':table.endsWith('_settlement_effective')?'settlement_id':'header_id';
    const own=table===`history_${reference.kind==='sales'?'sales':'transfer'}_effective`?[command.documentId]
      :table===`history_${reference.kind==='sales'?'sales':'transfer'}_line_effective`?command.lines.map(l=>l.lineId)
      :table==='history_sales_settlement_effective'&&reference.kind==='sales'?command.settlements.map(s=>s.settlementId):[];
    const allowed=new Set(own),unrelated=rows=>rows.filter(v=>!allowed.has(JSON.parse(v)[idKey]));
    same(unrelated(after.projections[table]),unrelated(before.projections[table]),'Unrelated historical effective rows changed');
   }
   comparisonStage='AUDIT_RECEIPT';for(const table of ['revisions','audits','receipts']){const present=new Set(after[table]);assert.ok(before[table].every(row=>present.has(row)),'Retained revision/audit/receipt mutated');}
   const added=(next,old)=>next.filter(v=>!new Set(old).has(v)).map(v=>JSON.parse(v));
   const newRevision=added(after.revisions,before.revisions),newAudit=added(after.audits,before.audits),newReceipt=added(after.receipts,before.receipts);
   assert.equal(newRevision.length,1);assert.equal(newRevision[0].id,receipt.revisionId);assert.equal(newRevision[0].reason,command.reason);assert.equal(newRevision[0].actor_account_id,input.actor.accountId);
   assert.equal(newAudit.length,1);assert.equal(newAudit[0].operation_id,receipt.operationId);assert.equal(newAudit[0].actor_account_id,input.actor.accountId);
   assert.equal(newReceipt.length,1);assert.equal(newReceipt[0].id,receipt.operationId);assert.equal(newReceipt[0].request_key,command.requestKey);assert.equal(newReceipt[0].request_hash,requestHash({actorAccountId:input.actor.accountId,command}));
   await verifyCaseTail(name,reference,command,receipt,before.current,after,casKey,originalRequest?.command??command);
   result.cases.push({name,status:'PASS_NORMAL_HISTORY_HTTP_CURRENT_FACTS_SOURCE_STOCK_AUDIT_RECEIPT_REPLAY_CAS',operationId:receipt.operationId,revisionId:receipt.revisionId,version:receipt.version,stockUnchanged:true});result.actualHrev=true;
  }
  async function verifyCaseTail(name,reference,command,receipt,beforeCurrent,after,casKey,replayCommand=command){
   comparisonStage='DETAIL_RESPONSE';const detail=await readDetail(reference.kind,command.documentId);comparisonStage='DETAIL_VALUES';assert.equal(detail.document.version,receipt.version);assert.equal(detail.document.sourceStatus,beforeCurrent.sourceStatus);
   for(const patch of command.lines){const row=detail.lines.items.find(l=>l.id===patch.lineId);assert.ok(row);for(const [field,value] of Object.entries(patch))if(field!=='lineId')assert.equal(row[field],value);}
   if(command.settlements.length){same(detail.settlements.items.map(row=>row.id),beforeCurrent.settlements.map(row=>row.settlementId),'Historical settlement order changed');
    for(const patch of command.settlements){const row=detail.settlements.items.find(row=>row.id===patch.settlementId),old=beforeCurrent.settlements.find(row=>row.settlementId===patch.settlementId);assert.ok(row&&old);assert.equal(row.amount,patch.amount);assert.equal(row.direction,old.direction);}}
   phase=name+'_ORIGINAL_KEY';comparisonStage='REPLAY_RESPONSE';const replay=await http(reference.kind,replayCommand);assert.equal(replay.statusCode,200);same(replay.json(),receipt);comparisonStage='REPLAY_SNAPSHOT';same(await snapshot(reference),after,'Original-key replay caused second write');
   comparisonStage='CONFLICT_RESPONSE';const changed=await http(reference.kind,{...command,reason:command.reason+'（幂等冲突校验）'});assert.equal(changed.statusCode,409);assert.equal(changed.json().error.code,'IDEMPOTENCY_CONFLICT');comparisonStage='CONFLICT_SNAPSHOT';same(await snapshot(reference),after);
   comparisonStage='CAS_RESPONSE';const stale=await http(reference.kind,{...command,requestKey:casKey});assert.equal(stale.statusCode,409);assert.equal(stale.json().error.code,'VERSION_CONFLICT');comparisonStage='CAS_SNAPSHOT';same(await snapshot(reference),after);
  }
  function bindCommitted(reference,recorded,after,requireCurrent=true){
   const command=parseHistoryRevisionCommand(recorded.command);same(command,recorded.command);
   assert.equal(command.kind,reference.kind);assert.equal(command.documentId,reference.documentId);
   const receiptRows=after.receipts.map(JSON.parse).filter(r=>r.actor_account_id===input.actor.accountId&&r.request_key===command.requestKey);
   assert.equal(receiptRows.length,1);const stored=receiptRows[0],receipt=stored.result_data,targetType=reference.kind==='sales'?'HISTORY_SALES':'HISTORY_TRANSFER';
   assert.equal(stored.status,'COMMITTED');assert.equal(stored.action,'HISTORY_REVISE');assert.equal(stored.target_type,targetType);assert.equal(stored.target_id,reference.documentId);
   assert.equal(stored.request_hash,requestHash({actorAccountId:input.actor.accountId,command}));
   assert.ok(uuid(receipt.operationId)&&uuid(receipt.revisionId));assert.equal(stored.id,receipt.operationId);
   assert.equal(receipt.dataset,'HISTORY');assert.equal(receipt.kind,reference.kind);assert.equal(receipt.documentId,reference.documentId);assert.equal(receipt.version,command.expectedVersion+1);assert.deepEqual(receipt.ledgerEntryIds,[]);
   const revisions=after.revisions.map(JSON.parse).filter(r=>r.operation_id===receipt.operationId||r.id===receipt.revisionId),audits=after.audits.map(JSON.parse).filter(r=>r.operation_id===receipt.operationId);
   assert.equal(revisions.length,1);assert.equal(audits.length,1);const revision=revisions[0],audit=audits[0],before=revision.before_facts;
   assert.equal(revision.id,receipt.revisionId);assert.equal(revision.operation_id,receipt.operationId);assert.equal(revision.document_kind,reference.kind==='sales'?'SALES':'TRANSFER');
   assert.equal(revision.sales_id,reference.kind==='sales'?reference.documentId:null);assert.equal(revision.transfer_id,reference.kind==='transfers'?reference.documentId:null);
   assert.equal(revision.actor_account_id,input.actor.accountId);assert.equal(revision.request_key,command.requestKey);assert.equal(revision.reason,command.reason);assert.equal(revision.from_version,command.expectedVersion);assert.equal(revision.to_version,receipt.version);
   assert.equal(before.importBatchId,input.references.batchId);assert.equal(before.publishedOperationId,input.references.publishedOperationId);
   if(command.expectedVersion===1)same(command,draftQuantityCommand(before,reference,command.requestKey));
   else {assert.equal(command.expectedVersion,2);assert.equal(command.requestKey,input.keys.money);same(command,draftMoneyCommand(before,input.keys.money));}
   const expected=planHistoryRevision(before,command,receipt.revisionId);assert.deepEqual(expected.effects,[]);same(revision.after_facts,expected.after);
   if(requireCurrent)same(after.current,expected.after);
   assert.equal(audit.id,receipt.operationId);assert.equal(audit.actor_account_id,input.actor.accountId);assert.equal(audit.object_type,targetType);assert.equal(audit.object_id,reference.documentId);assert.equal(audit.action,'HISTORY_REVISE');assert.equal(audit.old_version,command.expectedVersion);assert.equal(audit.new_version,receipt.version);
   same(audit.before_values,expected.before);same(audit.after_values,expected.after);return {command,receipt,before,afterFacts:expected.after};
  }
  const [sales,transfer]=input.references.cases;
  if(remainingMoney){
   result.executionScope='REMAINING_MONEY_ONLY_SAME_TARGET';result.priorScopeNotReplayed=true;
   phase='BIND_BOTH_COMMITTED_QUANTITY_CASES';key=null;comparisonStage='ORIGINAL_REQUEST_BINDING';
   const salesSnapshot=await snapshot(sales),transferSnapshot=await snapshot(transfer);
   const salesProof=bindCommitted(sales,remainingMoney.sales,salesSnapshot,!moneyAlreadyCommitted),transferProof=bindCommitted(transfer,remainingMoney.transfers,transferSnapshot);
   assert.equal(salesProof.receipt.version,2);assert.equal(transferProof.receipt.version,2);
   for(const [proof,prior] of [[salesProof,remainingMoney.completed.recoveredFirstCase],[transferProof,remainingMoney.completed.cases[0]]]){assert.equal(prior.operationId,proof.receipt.operationId);assert.equal(prior.revisionId,proof.receipt.revisionId);assert.equal(prior.version,2);}
   result.adoptedCompletedCases={sourceSha256:remainingMoney.completedSha256,salesVersion:2,transferVersion:2,status:'PRIOR_COMPLETE_SCOPES_BOUND_NO_REPLAY'};
   if(moneyAlreadyCommitted){
    phase='RECOVER_COMMITTED_MONEY_ONLY';key=input.keys.money;comparisonStage='ORIGINAL_REQUEST_BINDING';
    const proof=bindCommitted(sales,remainingMoney.money,salesSnapshot);same(proof.before,salesProof.afterFacts,'Money recovery must descend from the original sales quantity v2');
    await verifyCaseTail('DRAFT_SALES_MONEY_ONLY_NO_STOCK',sales,proof.command,proof.receipt,proof.before,salesSnapshot,input.keys.moneyCas,remainingMoney.money.command);
    result.recoveredMoneyCase={status:'PASS_ORIGINAL_COMMITTED_MONEY_NO_NEW_WRITE',version:3,operationId:proof.receipt.operationId,revisionId:proof.receipt.revisionId};result.moneyRecoveryOnly=true;result.actualHrev=true;
   }else{
    if(remainingMoney.registeredRetry){
     const original=remainingMoney.money;result.registeredOriginalMoneyRetry={originalRequestOnly:true,noCommitProofSha256:remainingMoney.registeredRetry.outcomeSha256};
     await executeCase('DRAFT_SALES_MONEY_ONLY_NO_STOCK',sales,before=>{assert.equal(before.version,2);same(parseHistoryRevisionCommand(original.command),original.command);same(original.command,draftMoneyCommand(before,input.keys.money));return original.command;},input.keys.moneyCas,original);
    }else await executeCase('DRAFT_SALES_MONEY_ONLY_NO_STOCK',sales,before=>{assert.equal(before.version,2);return draftMoneyCommand(before,input.keys.money);},input.keys.moneyCas);
    result.moneyRecoveryOnly=false;
   }
   assert.equal(await readBackgroundFailureCount(),0);result.status='PASS_ACTUAL_LIMITED_DRAFT_HISTORY_ONLY';return result;
  }
  if(recoveredRequest){
   phase='RECOVER_COMMITTED_SALES_QUANTITY';key=input.keys.sales;comparisonStage='ORIGINAL_REQUEST_BINDING';
   const after=await snapshot(sales),{command,receipt,before}=bindCommitted(sales,recoveredRequest,after);assert.equal(receipt.version,2);
   const transferCurrent=(await snapshot(transfer)).current;assert.equal(transferCurrent.version,1);assert.equal(transferCurrent.kind,'transfers');assert.equal(transferCurrent.documentId,transfer.documentId);assert.equal(transferCurrent.importBatchId,input.references.batchId);assert.equal(transferCurrent.publishedOperationId,input.references.publishedOperationId);
   await verifyCaseTail('DRAFT_SALES_QUANTITY_NO_STOCK',sales,command,receipt,before,after,input.keys.salesCas,recoveredRequest.command);
   result.recoveredFirstCase={status:'PASS_ORIGINAL_COMMITTED_KEY_DETAIL_REPLAY_CONFLICT_CAS_NO_NEW_WRITE',operationId:receipt.operationId,revisionId:receipt.revisionId,version:2,
    originalRequestSha256:committedContinuation.sha256,priorChecks:'Original07 stopped at DETAIL_RESPONSE after current/source/stock/audit checks; no reconstructed prewrite snapshot claimed'};result.actualHrev=true;
  }else {await executeCase('DRAFT_SALES_QUANTITY_NO_STOCK',sales,before=>draftQuantityCommand(before,sales,input.keys.sales),input.keys.salesCas);}
  await executeCase('DRAFT_TRANSFER_QUANTITY_NO_STOCK_CONSERVATION',transfer,before=>draftQuantityCommand(before,transfer,input.keys.transfers),input.keys.transfersCas);
  await executeCase('DRAFT_SALES_MONEY_ONLY_NO_STOCK',sales,before=>draftMoneyCommand(before,input.keys.money),input.keys.moneyCas);
  assert.equal(await readBackgroundFailureCount(),0);result.status='PASS_ACTUAL_LIMITED_DRAFT_HISTORY_ONLY';return result;
 }catch(error){result.status='FAILED_OR_OUTCOME_UNCERTAIN_NO_AUTO_RETRY';result.firstFailure={phase,requestKey:key,comparisonStage,code:error?.code==='ERR_ASSERTION'||safeHttpCodes.has(error?.code)?error.code:'ASSERTION_OR_READBACK_FAILURE'};Object.defineProperty(error,'b07Result',{value:result});throw error;}
}
