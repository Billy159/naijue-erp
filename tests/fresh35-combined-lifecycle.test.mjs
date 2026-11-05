import {rewriteFresh35ModelModule} from './fixtures/fresh35-bootstrap-network-model.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {modelFresh35CombinedTransactionForTests,describeFresh35CombinedCompletion,runFresh35CombinedInstall} from '../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs';
import {publishFresh35CombinedRecord} from '../scripts/release/unified-install/fresh35-combined-record-v1.mjs';
const steps=[{name:'base35',sql:'SELECT 1'},{name:'hall',sql:'SELECT 2'},{name:'amount',sql:'SELECT 3'},{name:'catalog',sql:'SELECT 4'}];
function fixture(patch={}){const log=[];const io={current:async()=>{log.push('current')},emit:async e=>{log.push(e.state)},query:async sql=>{log.push(sql);return {command:sql.startsWith('BEGIN')?'BEGIN':'SELECT'}},observe:async()=>{log.push('observe');return {raw:'catalog'}},commit:async()=>{log.push('COMMIT');return {command:'COMMIT'}},rollback:async()=>{log.push('ROLLBACK');return {command:'ROLLBACK'}},quarantine:()=>{log.push('quarantine')},...patch};return {io,log}}
test('model runs base then hall then amount and full guard within one transaction',async()=>{const {io,log}=fixture();const r=await modelFresh35CombinedTransactionForTests(steps,io);assert.equal(r.state,'MODEL_ONLY_COMMITTED_UNPUBLISHED');assert.equal(r.installed,false);assert.equal(log.filter(x=>x==='COMMIT').length,1);assert.ok(log.indexOf('SELECT 4')<log.indexOf('observe'));assert.ok(log.indexOf('observe')<log.indexOf('COMMIT'));assert.ok(!log.includes('ROLLBACK'));assert.throws(()=>describeFresh35CombinedCompletion(r),/GENUINE/)});
test('ordinary schema failure acknowledges exactly one rollback and never commits',async()=>{const {io,log}=fixture();io.query=async sql=>{log.push(sql);if(sql==='SELECT 2')throw Error('DDL_FAILED');return {command:'BEGIN'}};await assert.rejects(modelFresh35CombinedTransactionForTests(steps,io),e=>e.installState==='ROLLED_BACK');assert.equal(log.filter(x=>x==='ROLLBACK').length,1);assert.ok(!log.includes('COMMIT'));assert.ok(!log.includes('SELECT 3'))});
test('rollback failure remains distinct from a confirmed rollback',async()=>{const {io,log}=fixture();io.query=async sql=>{if(sql==='SELECT 1')throw Error('DDL_FAILED');return {command:'BEGIN'}};io.rollback=async()=>{log.push('ROLLBACK');throw Error('DISCONNECTED')};await assert.rejects(modelFresh35CombinedTransactionForTests(steps,io),e=>e instanceof AggregateError&&e.installState==='ROLLBACK_UNCONFIRMED');assert.ok(!log.includes('COMMIT'))});
test('unknown COMMIT quarantines without rollback, replay or further SQL',async()=>{const {io,log}=fixture();io.commit=async()=>{log.push('COMMIT');throw Error('CONNECTION_LOST')};await assert.rejects(modelFresh35CombinedTransactionForTests(steps,io),e=>e.installState==='COMMIT_OUTCOME_UNKNOWN');assert.equal(log.filter(x=>x==='COMMIT').length,1);assert.ok(log.includes('quarantine'));assert.ok(!log.includes('ROLLBACK'))});
test('malformed COMMIT acknowledgement is unknown, never success',async()=>{const {io,log}=fixture();io.commit=async()=>({command:'ROLLBACK'});await assert.rejects(modelFresh35CombinedTransactionForTests(steps,io),e=>e.installState==='COMMIT_OUTCOME_UNKNOWN');assert.ok(log.includes('quarantine'));assert.ok(!log.includes('ROLLBACK'))});
test('post-commit journal failure is committed/unpublished, never rollback',async()=>{const {io,log}=fixture();io.emit=async e=>{log.push(e.state);if(e.state==='COMMITTED_UNPUBLISHED')throw Error('FSYNC_FAILED')};await assert.rejects(modelFresh35CombinedTransactionForTests(steps,io),e=>e.installState==='COMMITTED_UNPUBLISHED');assert.equal(log.filter(x=>x==='COMMIT').length,1);assert.ok(!log.includes('ROLLBACK'))});
test('failure writing COMMIT_PENDING rolls back before any commit submission',async()=>{const {io,log}=fixture();io.emit=async e=>{if(e.state==='COMMIT_PENDING')throw Error('JOURNAL_FAILED')};await assert.rejects(modelFresh35CombinedTransactionForTests(steps,io),e=>e.installState==='ROLLED_BACK');assert.ok(log.includes('ROLLBACK'));assert.ok(!log.includes('COMMIT'))});
test('source drift before beginning sends no SQL',async()=>{const {io,log}=fixture();io.current=async()=>{throw Error('SOURCE_CHANGED')};await assert.rejects(modelFresh35CombinedTransactionForTests(steps,io),e=>e.installState==='NOT_STARTED');assert.ok(!log.some(x=>x.startsWith('BEGIN')));assert.ok(!log.includes('COMMIT'));assert.ok(!log.includes('ROLLBACK'))});
test('caller objects cannot become a program, completion, authorization or record',async()=>{
 await assert.rejects(()=>runFresh35CombinedInstall({program:{},authorization:{},client:{},journalDirectory:'/tmp/no-install'}),/GENUINE_PROGRAM/);
 await assert.rejects(()=>publishFresh35CombinedRecord({state:'COMMITTED_UNPUBLISHED'}),/GENUINE_COMMITTED/);
});

test('safe installation diagnostic retains original and rollback codes before AggregateError without private text',async()=>{
 const {io}=fixture(),events=[];io.emit=async e=>events.push(e);
 io.query=async sql=>{if(sql==='SELECT 1')throw Object.assign(Error('PRIVATE SQL PARAMETER'),{code:'42501',detail:'PRIVATE DETAIL'});return{command:'BEGIN'}};
 io.rollback=async()=>{throw Object.assign(Error('PRIVATE ROLLBACK'),{code:'08006'})};
 const {describeFresh35CombinedInstallFailure:describe}=await import('../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs');
 await assert.rejects(modelFresh35CombinedTransactionForTests(steps,io),error=>{
  assert.equal(error.installState,'ROLLBACK_UNCONFIRMED');assert.deepEqual(describe(error),{stage:'STEP',step:'base35',originalSQLSTATE:'42501',originalInternalCode:null,rollbackSQLSTATE:'08006',rollbackInternalCode:null});return true;
 });
 const event=events.at(-1);assert.equal(event.stage,'STEP');assert.equal(event.originalSQLSTATE,'42501');assert.equal(event.rollbackSQLSTATE,'08006');assert.doesNotMatch(JSON.stringify(events),/PRIVATE|PARAMETER|DETAIL/);
});
test('safe installation diagnostic retains unknown commit outcome and filters arbitrary metadata',async()=>{
 const {io,log}=fixture();io.commit=async()=>{throw Object.assign(Error('PRIVATE COMMIT'),{code:'08006'})};
 const {describeFresh35CombinedInstallFailure:describe}=await import('../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs');
 await assert.rejects(modelFresh35CombinedTransactionForTests(steps,io),e=>{assert.equal(e.installState,'COMMIT_OUTCOME_UNKNOWN');assert.deepEqual(describe(e),{stage:'COMMIT',step:null,originalSQLSTATE:'08006',originalInternalCode:null,rollbackSQLSTATE:null,rollbackInternalCode:null});return true});assert(!log.includes('ROLLBACK'));
 assert.deepEqual(describe({installDiagnostic:{stage:'SECRET',step:'PRIVATE',originalSQLSTATE:'private SQL',originalInternalCode:'private SQL',rollbackSQLSTATE:null,rollbackInternalCode:null,detail:'PRIVATE'}}),{stage:'UNKNOWN',step:null,originalSQLSTATE:null,originalInternalCode:null,rollbackSQLSTATE:null,rollbackInternalCode:null});
});
test('native pg 8.23.1 protocol fields match healthy ReadyForQuery and reject pre-ready error-response timing without a server',async()=>{
 const {readFile}=await import('node:fs/promises'),{Client}=await import('pg'),s=await readFile(new URL('../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs',import.meta.url),'utf8');
 const body=s.slice(s.indexOf('function protocol('),s.indexOf('export function validateFresh35CombinedJournalPath'));
 const check=new Function('client','idle','need',body+';protocol(client,idle)');const need=(ok,code)=>{if(!ok)throw Error(code)},c=new Client({pipeline:false});
 c._handleReadyForQuery({status:'I'});check(c,true,need);c._handleReadyForQuery({status:'T'});check(c,false,need);
 let reject;const promise=new Promise((_r,j)=>reject=j);c.readyForQuery=false;c._activeQuery={handleError:error=>reject(error)};
 c._handleErrorMessage(Object.assign(Error('SYNTHETIC ERROR RESPONSE'),{code:'42501'}));await assert.rejects(promise,/SYNTHETIC/);assert.throws(()=>check(c,false,need),/EXCLUSIVE_IDLE_NATIVE_CLIENT_REQUIRED/);
 c._handleReadyForQuery({status:'E'});check(c,false,need);assert.equal(c.getTransactionStatus(),'E');
});
test('safe installation diagnostic publishes only module-constructed internal codes and exact failed step',async()=>{
 const {describeFresh35CombinedInstallFailure:describe}=await import('../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs');
 const {io}=fixture();io.query=async()=>({command:'WRONG'});
 await assert.rejects(modelFresh35CombinedTransactionForTests(steps,io),e=>{assert.equal(describe(e).stage,'BEGIN');assert.equal(describe(e).originalInternalCode,'FRESH35_COMBINED_NATIVE_BEGIN_ACK_REQUIRED');return true});
 const events=[],f=fixture().io;f.emit=async e=>events.push(e);f.query=async sql=>{if(sql==='SELECT 1')throw Object.assign(Error('PRIVATE'),{code:'FRESH35_COMBINED_FAKE_PUBLIC_CODE'});return{command:'BEGIN'}};
 await assert.rejects(modelFresh35CombinedTransactionForTests(steps,f),e=>{assert.equal(describe(e).step,steps[0].name);assert.equal(describe(e).originalInternalCode,null);return true});assert.equal(events.at(-1).errorCode,'INSTALL_ERROR');assert.doesNotMatch(JSON.stringify(events),/FAKE_PUBLIC_CODE|PRIVATE/);
});
test('safe installation diagnostic survives rollback acknowledgement and failure-journal wrappers',async()=>{
 const {describeFresh35CombinedInstallFailure:describe}=await import('../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs'),{io}=fixture();
 io.query=async sql=>{if(sql==='SELECT 1')throw Object.assign(Error('PRIVATE FIRST FAILURE'),{code:'42501'});return{command:'BEGIN'}};
 io.rollback=async()=>({command:'OTHER'});io.emit=async e=>{if(e.originalSQLSTATE)throw Error('PRIVATE JOURNAL FAILURE')};
 await assert.rejects(modelFresh35CombinedTransactionForTests(steps,io),e=>{assert(e instanceof AggregateError);assert.equal(e.installState,'ROLLBACK_UNCONFIRMED');const d=describe(e);assert.equal(d.stage,'STEP');assert.equal(d.step,'base35');assert.equal(d.originalSQLSTATE,'42501');assert.equal(d.rollbackInternalCode,'FRESH35_COMBINED_NATIVE_ROLLBACK_ACK_REQUIRED');assert.doesNotMatch(JSON.stringify(d),/PRIVATE|message|stack/);return true});
});

async function nativeRollbackWireModel(mode='delayed'){
 const {Client,DatabaseError}=await import('pg'),{readFile}=await import('node:fs/promises'),s=await readFile(new URL('../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs',import.meta.url),'utf8');
 const guards=s.slice(s.indexOf('function protocol('),s.indexOf('export function validateFresh35CombinedJournalPath'));
 const start=s.indexOf(' const originalQuery=Client.prototype.query'),end=s.indexOf('\n try{',start),rollbackStart=s.indexOf('rollback:async()=>{')+'rollback:async()=>{'.length,rollbackEnd=s.indexOf('},quarantine:',rollbackStart);
 const ioModule=await rewriteFresh35ModelModule({fs:await import('node:fs/promises')},'../../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs');
 const text=Buffer.from(ioModule.split(',')[1],'base64').toString('utf8')+"\nexport function testNativeAdapter(Client,DatabaseError,client,t){let quarantined=false,serverErrorPendingReady=false;"+s.slice(start,end)+";return{query,rollback:async()=>{"+s.slice(rollbackStart,rollbackEnd)+"}}}";
 const api=await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));const factory=api.testNativeAdapter;
 const client=new Client({pipeline:false}),calls=[],con=client.connection,need=(ok,code)=>{if(!ok)throw Error('FRESH35_COMBINED_'+code)};
 client.on('error',()=>{});client._attachListeners(con);client._connecting=true;con.emit('readyForQuery',{status:'I'});
 con.query=sql=>{calls.push(sql);queueMicrotask(()=>{
  if(sql.startsWith('BEGIN')){con.emit('commandComplete',{text:'BEGIN'});con.emit('readyForQuery',{status:'T'});return}
  if(sql==='ROLLBACK'){con.emit('commandComplete',{text:'ROLLBACK'});con.emit('readyForQuery',{status:'I'});return}
  const error=new DatabaseError(mode==='tagged'?'FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS_EXCLUSIVE_BACKENDS':mode==='fake_tag'?'FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS_PRIVATE_DYNAMIC':mode==='old_tag'?'FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS':mode==='wrong_sqlstate'?'FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS_EXCLUSIVE_BACKENDS':'SYNTHETIC PHYSICAL GUARD FAILURE',0,'error');error.code=mode==='wrong_sqlstate'?'42501':'55000';con.emit('errorMessage',error);
  if(mode==='same_batch')con.emit('readyForQuery',{status:'E'});
  else if(mode!=='timeout')setImmediate(()=>{if(mode==='end')con.emit('end');else if(mode==='error')con.emit('error',Error('SYNTHETIC DISCONNECT'));else con.emit('readyForQuery',{status:mode==='wrong_status'?'I':'E'})});
 })};
 const t={startsAt:Date.now()-1000,expiresAt:Date.now()+45080},adapter=factory(Client,DatabaseError,client,t,need);
 return{api,client,con,calls,adapter,deadline:t.expiresAt-45000,close:()=>{con.removeAllListeners();client.removeAllListeners();con.stream.destroy()}};
}

test('native rollback drain waits for actual delayed ReadyForQuery before one original rollback on same client',async()=>{
 for(const mode of ['delayed','same_batch']){
  const m=await nativeRollbackWireModel(mode);try{
   const io={current:async()=>{},emit:async()=>{},query:m.adapter.query,rollback:m.adapter.rollback,observe:async()=>{throw Error('MUST_NOT_OBSERVE')},commit:async()=>{throw Error('MUST_NOT_COMMIT')},quarantine:()=>{}};
   await assert.rejects(m.api.modelFresh35CombinedTransactionForTests([{name:'physical-empty-target',sql:'SYNTHETIC PHYSICAL SQL'}],io),e=>{assert.equal(e.installState,'ROLLED_BACK');assert.equal(e.code,'55000');return true});
   assert.deepEqual(m.calls,['BEGIN ISOLATION LEVEL READ COMMITTED','SYNTHETIC PHYSICAL SQL','ROLLBACK']);assert.equal(m.client.getTransactionStatus(),'I');assert.equal(m.con.listenerCount('readyForQuery'),1);assert.equal(m.client.listenerCount('end'),0);
  }finally{m.close()}
 }
});
test('native rollback drain close or connection error remains unconfirmed without sending rollback or retry',async()=>{
 for(const mode of ['end','error','wrong_status']){
  const m=await nativeRollbackWireModel(mode);try{
   await m.adapter.query('BEGIN ISOLATION LEVEL READ COMMITTED');await assert.rejects(()=>m.adapter.query('SYNTHETIC SQL'),e=>e.code==='55000');
   await assert.rejects(()=>m.adapter.rollback(),/ROLLBACK_READY_CONNECTION_LOST|ROLLBACK_TRANSACTION_STATE_REQUIRED/);
   assert.equal(m.calls.includes('ROLLBACK'),false);assert.equal(m.con.listenerCount('readyForQuery'),1);assert.equal(m.client.listenerCount('end'),0);
  }finally{m.close()}
 }
});
test('native rollback drain timeout respects original execution deadline and removes event listeners',async()=>{
 const m=await nativeRollbackWireModel('timeout');try{
  const io={current:async()=>{},emit:async()=>{},query:m.adapter.query,rollback:m.adapter.rollback,observe:async()=>{},commit:async()=>{},quarantine:()=>{}};
  await assert.rejects(m.api.modelFresh35CombinedTransactionForTests([{name:'physical-empty-target',sql:'SYNTHETIC SQL'}],io),e=>{assert.equal(e.installState,'ROLLBACK_UNCONFIRMED');assert.match(e.errors[1].message,/ROLLBACK_READY_TIMEOUT/);return true});
  assert.equal(m.calls.includes('ROLLBACK'),false);assert(Date.now()>=m.deadline);assert.equal(m.con.listenerCount('readyForQuery'),1);assert.equal(m.client.listenerCount('end'),0);
 }finally{m.close()}
});

test('native rollback drain preserves exact static physical predicate tag through the original flat child diagnostic output',async()=>{
 const {readFile}=await import('node:fs/promises'),entry=await readFile(new URL('../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',import.meta.url),'utf8');
 const start=entry.lastIndexOf('process.stderr.write('),end=entry.indexOf('process.exitCode=1;',start)+'process.exitCode=1;'.length;
 const render=new Function('error','process','describeFresh35CombinedInstallFailure',entry.slice(start,end));
 for(const mode of ['tagged','fake_tag','old_tag','wrong_sqlstate']){
  const m=await nativeRollbackWireModel(mode);try{
   let failure;try{await m.api.modelFresh35CombinedTransactionForTests([{name:'physical-empty-target',sql:'SYNTHETIC SQL'}],{current:async()=>{},emit:async()=>{},query:m.adapter.query,rollback:m.adapter.rollback})}catch(error){failure=error}
   const lines=[],p={stderr:{write:s=>lines.push(s)}};render(failure,p,m.api.describeFresh35CombinedInstallFailure);
   const result=JSON.parse(lines[0]);assert.equal(Object.keys(result).length,12);assert.equal(result.originalSQLSTATE,mode==='wrong_sqlstate'?'42501':'55000');assert.equal(result.installState,'ROLLED_BACK');assert.equal(result.originalInternalCode,mode==='tagged'?'FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS_EXCLUSIVE_BACKENDS':mode==='old_tag'?'FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS':null);assert.doesNotMatch(lines[0],/PRIVATE_DYNAMIC|SYNTHETIC SQL|message|detail|stack/);
   const {spawnSync}=await import('node:child_process');
   const python="import importlib.util, pathlib, sys, json; p=pathlib.Path('tests/test_fresh35_isolated_launcher.py'); s=importlib.util.spec_from_file_location('original_launcher_tests',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.InstallChildDiagnosticTests().capture(sys.stdin.buffer.read())))";
   const captured=spawnSync('python3',['-c',python],{input:lines[0],encoding:'utf8'});assert.equal(captured.status,0,captured.stderr);
   const persisted=JSON.parse(captured.stdout);assert.equal(persisted.diagnosticUnavailable,false);assert.equal(persisted.originalInternalCode,result.originalInternalCode);assert.equal(persisted.originalSQLSTATE,result.originalSQLSTATE);assert.equal(persisted.exitCode,1);assert.doesNotMatch(captured.stdout,/PRIVATE_DYNAMIC|SYNTHETIC SQL|SECRET_SENTINEL/);

  }finally{m.close()}
 }
});
