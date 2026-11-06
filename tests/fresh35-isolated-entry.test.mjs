import {requestHash} from '../packages/application/src/request-hash.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {isolatedClientOptions,isolatedEntryFailure} from '../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs';
test('normal COMMITTED-only guard retains original branded result diagnostics and rejects unknown or already committed without retry (no PG)',async()=>{
 const {executeWholePackage,describeWholePackageFailure}=await import('../tools/unified-import/whole-package-client.ts');
 const source=await readFile(new URL('../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',import.meta.url),'utf8');
 const line=source.split('\n').find(l=>l.includes('SYNTHETIC_IMPORT_COMMIT_REQUIRED')&&l.includes('result.state'));assert(line);
 const guard=new Function('result','need',line),need=new Function(source.split('\n').find(l=>l.startsWith('const need='))+';return need')();
 const meta={batchId:'11111111-1111-4111-8111-111111111111',documentBatchId:'22222222-2222-4222-8222-222222222222',packageSha256:'a'.repeat(64),planSha256:'b'.repeat(64),namespace:'synthetic',cutoffAt:'2026-11-02T04:00:00Z'};
 const request=(n,batch,payload)=>({protocol:'STANDARD_IMPORT_SQL_V1',operation_id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),request_key:'diagnostic-'+n,batch_id:batch,plan_sha256:meta.planSha256,package_manifest_sha256:meta.packageSha256,namespace:meta.namespace,cutoff_at:meta.cutoffAt,payload});
 for(const mode of ['COMMITTED','ROLLED_BACK','UNKNOWN','ALREADY_COMMITTED']){
  const calls=[];let discarded=0;const client={async query(sql){calls.push(sql);if(mode==='UNKNOWN'&&sql==='COMMIT')throw Error('PRIVATE transport detail');return{command:sql==='SET CONSTRAINTS ALL IMMEDIATE'?'SET':sql.startsWith('BEGIN')?'BEGIN':sql}},async discard(){discarded++}};
  const kernel={async lockAndInspect(){return mode==='ALREADY_COMMITTED'?{state:'COMMITTED',packageSha256:meta.packageSha256,planSha256:meta.planSha256,summary:{PRIVATE:'not exported'}}:{state:'ABSENT'}},async initialize(){},async applyStep(){if(mode==='ROLLED_BACK')throw Object.assign(Error('HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED'),{code:'23514',detail:'PRIVATE SQL values'})},async summarize(){return{PRIVATE:'not exported'}}};
  async function* steps(){yield{method:'publish',request:request(2,meta.batchId,{phase:'BASELINE'})};yield{method:'documentChunk',request:request(3,meta.documentBatchId,{mode:'STAGE',rows:[]})};yield{method:'publish',request:request(4,meta.documentBatchId,{phase:'DOCUMENTS'})}}
  const result=await executeWholePackage(client,meta,request(1,meta.batchId,{document_batch_id:meta.documentBatchId}),steps(),kernel);assert.equal(result.state,mode);
  if(mode==='COMMITTED'){assert.doesNotThrow(()=>guard(result,need));continue;}
  let error;try{guard(result,need)}catch(e){error=e}assert(error);assert.equal(error.message,'FRESH35_ISOLATED_SYNTHETIC_IMPORT_COMMIT_REQUIRED');assert.equal(error.validationResult,result,'retain the genuine WeakMap key, never a reconstructed DTO');
  const receipt=isolatedEntryFailure(error),diagnostic=describeWholePackageFailure(result);assert.equal(Object.keys(receipt).length,15);assert.equal(receipt.validationStage,null);
  assert.equal(receipt.validationCode,mode==='ALREADY_COMMITTED'?'UNEXPECTED_ALREADY_COMMITTED':result.code);assert.equal(receipt.validationSQLSTATE,diagnostic?.sqlState??null);assert.equal(receipt.validationStep,diagnostic?.stage??null);assert.equal(receipt.validationInternalCode,diagnostic?.staticCode??null);
  assert.doesNotMatch(JSON.stringify(receipt),/PRIVATE|summary|detail|SQL values|stack/);
  if(mode==='UNKNOWN'){assert.equal(discarded,1);assert.equal(calls.includes('ROLLBACK'),false);assert.equal(receipt.validationStep,'COMMIT');}
  if(mode==='ROLLED_BACK'){assert.equal(calls.at(-1),'ROLLBACK');assert.equal(receipt.validationSQLSTATE,'23514');assert.equal(receipt.validationStep,'STEP');}
 }
});
test('rollback CLI uses sequential native wires for every expected SQL error and independent absence readback (no PG)',async()=>{
 const {Client}=await import('pg'),{withReviewedWholeSession}=await import('../tools/unified-import/whole-host-session.mjs');
 const {executeWholePackage}=await import('../tools/unified-import/whole-package-client.ts'),{inspectWholePackage}=await import('../tools/unified-import/whole-package-inspect.ts');
 const source=await readFile(new URL('../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',import.meta.url),'utf8');
 const start=source.indexOf('  const stage='),end=source.indexOf('\n }\n const authorization=',start),AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 const names=['root','workspace','standardTarget','config','HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256','join','openReviewedFresh35Host','assertWholeSalesAdmissionV1','buildSyntheticFresh35WholePackageFixture','encodedScrypt','executeWholePackage','createWholePackageSqlKernel','inspectWholePackage','reconcileWholePackage','need','process','historicalSettlementRetentionWire','describeFresh35CombinedProgram','program','requestHash'];
 const run=new AsyncFunction(...names,source.slice(start,end));
 const need=new Function(source.split('\n').find(line=>line.startsWith('const need='))+';return need')();
 async function scenario({unknown=false,disposeFails=false,wrongApprovalCode=false,readbackUnknown=false,closeFails=false}={}){
  const target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'7703999999999999999',database_oid:'16384',database_name:'synthetic_fresh35_20261105_r9',catalog_sha256:'a'.repeat(64)};
  const meta={batchId:'11111111-1111-4111-8111-111111111111',documentBatchId:'22222222-2222-4222-8222-222222222222',packageSha256:'a'.repeat(64),planSha256:'b'.repeat(64),namespace:'synthetic',cutoffAt:'2026-11-02T04:00:00Z'};
  const wire={sha256:'c'.repeat(64),utf8:'SYNTHETIC_ONLY'},encoded='SYNTHETIC_ONLY',connections=[],events=[],output=[],executed=[],inspected=[],records=new WeakMap();let disposed=0;
  const request=(n,batch,payload)=>({protocol:'STANDARD_IMPORT_SQL_V1',operation_id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),request_key:'native-cli-'+n,batch_id:batch,plan_sha256:meta.planSha256,package_manifest_sha256:meta.packageSha256,namespace:meta.namespace,cutoff_at:meta.cutoffAt,payload});
  const initialize=request(1,meta.batchId,{admin:{},document_batch_id:meta.documentBatchId,historical_settlement_retention_approval:wire});
  const steps=[{method:'publish',request:request(2,meta.batchId,{phase:'BASELINE'})},{method:'documentChunk',request:request(3,meta.documentBatchId,{mode:'STAGE',rows:[]})},{method:'documentChunk',request:request(4,meta.documentBatchId,{mode:'CHUNK',rows:[{entity_type:'SALES_SETTLEMENT',fields:{sales_id:'retained-0'}}]})},{method:'publish',request:request(5,meta.documentBatchId,{phase:'DOCUMENTS',expected_sequence:4})}];
  const fixture={fixtureBinding:{manifestSha256:meta.packageSha256,planSha256:meta.planSha256,initializerSha256:requestHash({initialize,encodedScrypt:encoded}),stepsSha256:'d'.repeat(64)},retainedSalesIds:Array.from({length:25},(_,i)=>'retained-'+i),historicalSettlementRetentionApproval:{synthetic:true},identity:meta,program:{initialize,steps:{async *[Symbol.asyncIterator](){for(const step of steps)yield structuredClone(step)}}},async dispose(){disposed++;events.push('fixture-dispose');if(disposeFails)throw Error('PRIVATE cleanup path or credential')}};
  const open=async(_config,_root,_target,work)=>{
   assert(connections.every(r=>r.closed===1),'previous raw client must close before opening another');
   const c=new Client({pipeline:false}),con=c.connection,record={number:connections.length+1,sent:[],closed:0,nextError:null},timers=[];connections.push(record);events.push('open-'+record.number);
   c.on('error',()=>{});c._attachListeners(con);c._connecting=true;con.emit('readyForQuery',{status:'I'});
   const end=c.end.bind(c);c.end=async(...args)=>{record.closed++;events.push('close-'+record.number);await end(...args);if(closeFails&&record.number===1)throw Error('PRIVATE native close failure')};
   con.query=sql=>{record.sent.push(sql);queueMicrotask(()=>{
    if(sql.startsWith('SELECT ')){con.emit('errorMessage',Object.assign(Error(record.nextError),{code:'23514'}));if(!unknown)timers.push(setTimeout(()=>con.emit('readyForQuery',{status:'E'}),5))}
    else{const command=sql.startsWith('BEGIN')?'BEGIN':sql.startsWith('SET ')?'SET':sql;con.emit('commandComplete',{text:command});con.emit('readyForQuery',{status:command==='BEGIN'?'T':command==='SET'?'T':'I'})}
   })};
   try{return await withReviewedWholeSession(c,{},target,target,async controlled=>{
    const observer={query:(...args)=>controlled.query(...args),discard:()=>controlled.discard()};records.set(observer,record);return work(observer,{});
   },()=>target,'FRESH35_RETIRED152_V1',{fresh35ExpiresAt:Date.now()+(unknown?30:1000)})}
   finally{for(const timer of timers)clearTimeout(timer);con.stream.destroy()}
  };
  const fail=(client,code)=>{records.get(client).nextError=code;return client.query('SELECT naijue_erp.standard_whole_package_finish_v2($1::uuid)::text AS result_json')};
  const kernel=()=>({async lockAndInspect(){return{state:'ABSENT'}},async initialize(client,_id,init){if(init.payload.historical_settlement_retention_approval.sha256==='0'.repeat(64))await fail(client,wrongApprovalCode?'PERMISSION_DENIED':'HISTORICAL_SETTLEMENT_APPROVAL_HASH')},async applyStep(client,step){if(step.method==='documentChunk'&&step.request.payload.mode==='CHUNK'&&step.request.payload.rows.length===0)await fail(client,'HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED');if(step.method==='publish'&&step.request.payload.phase==='DOCUMENTS'&&step.request.payload.expected_sequence!==4)await fail(client,'STANDARD_BATCH_CAS_OR_SOURCE_CONFLICT')},async summarize(){return{}}});
  const execute=async(...args)=>{const result=await executeWholePackage(...args);executed.push(result);return result},inspect=async(...args)=>{const result=await inspectWholePackage(...args);inspected.push(result);return readbackUnknown?{state:'UNKNOWN'}:result};
  let error;try{await run('/source','/owned',target,{},'MODEL_V2',(...p)=>p.join('/'),open,()=>{},async()=>fixture,encoded,execute,kernel,inspect,async()=>{throw Error('UNEXPECTED_RECONCILE')},need,{argv:['node','entry','--verify-host-rollback'],getuid:()=>1234,stdout:{write:line=>output.push(line)}},()=>wire,()=>({sourceSetSha256:'1'.repeat(64),programSha256:'2'.repeat(64),targetSha256:'3'.repeat(64)}),{},requestHash)}catch(e){error=e}
  assert(connections.every(r=>r.closed===1));assert.equal(disposed,1);assert.equal(events.at(-1),'fixture-dispose');assert(connections.every(r=>!r.sent.includes('COMMIT')));
  return{error,connections,events,output,executed,inspected};
 }
 const ok=await scenario();assert.ifError(ok.error);assert.equal(ok.connections.length,6);assert.equal(ok.executed.length,3);assert.equal(ok.inspected.length,3);assert.equal(ok.inspected.every(r=>r.state==='ABSENT'),true);assert.equal(JSON.parse(ok.output[0]).rollbackVerified,true);
 assert.deepEqual(ok.executed.map(r=>r.code),['HISTORICAL_SETTLEMENT_APPROVAL_HASH','HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED','STANDARD_BATCH_CAS_OR_SOURCE_CONFLICT']);
 for(const options of [{unknown:true},{wrongApprovalCode:true},{unknown:true,disposeFails:true},{wrongApprovalCode:true,closeFails:true}]){const r=await scenario(options);assert(r.error);assert.equal(r.connections.length,1);assert.equal(r.executed.length,1);assert.equal(r.output.length,0);assert.equal(r.error.validationStage,'BAD_APPROVAL','first classified error survives fixture or native cleanup failure');const receipt=isolatedEntryFailure(r.error);assert.equal(receipt.validationSQLSTATE,'23514');assert.equal(receipt.validationStep,'INITIALIZE');assert.equal(receipt.validationCode,options.wrongApprovalCode?'PERMISSION_DENIED':'TRANSACTION_OUTCOME_UNKNOWN');}
 const absent=await scenario({readbackUnknown:true,disposeFails:true});assert.equal(absent.connections.length,2);assert.match(absent.error.message,/FRESH35_ISOLATED_SYNTHETIC_BAD_APPROVAL_ABSENCE_REQUIRED/);assert.equal(absent.output.length,0);
 const absentReceipt=isolatedEntryFailure(absent.error);assert.equal(absentReceipt.validationCode,'FRESH35_ISOLATED_SYNTHETIC_BAD_APPROVAL_ABSENCE_REQUIRED');assert.equal(absentReceipt.validationStage,'BAD_APPROVAL');assert.equal(absentReceipt.validationSQLSTATE,null);assert.doesNotMatch(JSON.stringify(absentReceipt),/PRIVATE|credential|path/);
 const cleanup=await scenario({disposeFails:true});assert.equal(cleanup.connections.length,6);assert.equal(cleanup.output.length,0);assert.equal(isolatedEntryFailure(cleanup.error).validationCode,'FRESH35_ISOLATED_SYNTHETIC_FIXTURE_CLEANUP_FAILED');
});
test('entry failure JSON exports only private branded finite diagnostic and keeps the bad approval assertion closed (no PG)',async()=>{
 const {executeWholePackage,describeWholePackageFailure}=await import('../tools/unified-import/whole-package-client.ts');
 const source=await readFile(new URL('../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',import.meta.url),'utf8');
 const batch='11111111-1111-4111-8111-111111111111',documents='22222222-2222-4222-8222-222222222222',identity={batchId:batch,documentBatchId:documents,packageSha256:'a'.repeat(64),planSha256:'b'.repeat(64),namespace:'synthetic',cutoffAt:'2026-11-02T04:00:00Z'};
 const initialize={protocol:'STANDARD_IMPORT_SQL_V1',operation_id:'33333333-3333-4333-8333-333333333333',request_key:'synthetic',batch_id:batch,package_manifest_sha256:identity.packageSha256,plan_sha256:identity.planSha256,namespace:identity.namespace,cutoff_at:identity.cutoffAt,payload:{document_batch_id:documents}};
 const client={async query(sql){return{command:sql.startsWith('BEGIN')?'BEGIN':sql}},async discard(){}},kernel={async lockAndInspect(){throw Object.assign(Error('PRIVATE SQL parameter business value'),{code:'42501',detail:'PRIVATE_DETAIL'})},async initialize(){},async applyStep(){},async summarize(){}};
 const result=await executeWholePackage(client,identity,initialize,(async function*(){})(),kernel);assert.deepEqual(result,{state:'ROLLED_BACK',code:'IMPORT_FAILED'});
 const assertion=new Function('badApprovalResult',source.split('\n').find(line=>line.includes("'FRESH35_ISOLATED_SYNTHETIC_BAD_APPROVAL_ROLLBACK_REQUIRED'")));
 let rejected;try{assertion(result)}catch(error){rejected=error}assert(rejected);assert.equal(rejected.validationStage,'BAD_APPROVAL');
 const marker='try{await main()}catch(error){',start=source.indexOf(marker)+marker.length,end=source.indexOf('process.exitCode=1;',start)+'process.exitCode=1;'.length;assert(start>=marker.length&&end>start);
 const serialize=new Function('error','process','isolatedEntryFailure',source.slice(start,end));
 const emit=error=>{const lines=[],process={stderr:{write:line=>lines.push(line)}};serialize(error,process,isolatedEntryFailure);assert.equal(process.exitCode,1);assert.equal(lines.length,1);return JSON.parse(lines[0])};
 const actual=emit(rejected);assert.equal(actual.validationCode,'IMPORT_FAILED');assert.equal(actual.validationSQLSTATE,'42501');assert.equal(actual.validationStep,'LOCK_AND_INSPECT');assert.equal(actual.validationInternalCode,null);assert.doesNotMatch(JSON.stringify(actual),/PRIVATE|parameter|business|detail|validationResult/);
 const forged=emit(Object.assign(Error('PRIVATE'),{validationResult:{...result},validationSQLSTATE:'42501',validationStep:'OTHER',validationInternalCode:'NOT_ALLOWED'}));
 for(const key of ['validationSQLSTATE','validationStep','validationInternalCode'])assert.equal(forged[key],null,'unbranded supplied fields cannot become diagnostics');
 for(const [code,stage] of [['SYNTHETIC_BAD_APPROVAL_ABSENCE_REQUIRED','BAD_APPROVAL'],['SYNTHETIC_MISSING_SETTLEMENT_ABSENCE_REQUIRED','MISSING_SETTLEMENT'],['SYNTHETIC_FINAL_FAILURE_ABSENCE_REQUIRED','FINAL_PUBLISH'],['SYNTHETIC_RETENTION_FIXTURE_BINDING_REQUIRED',null],['SYNTHETIC_FIXTURE_CLEANUP_FAILED',null]]){
  const exact='FRESH35_ISOLATED_'+code,r=emit(Error(exact));assert.equal(r.validationCode,exact);assert.match(exact,/^[A-Z][A-Z0-9_]{0,80}$/);assert.equal(r.validationStage,stage);assert.equal(r.validationSQLSTATE,null);assert.equal(r.validationStep,null);assert.equal(r.validationInternalCode,null);
 }
 for(const message of ['PRIVATE credential path','FRESH35_ISOLATED_NOT_A_DECLARED_CODE','FRESH35_ISOLATED_SYNTHETIC_BAD_APPROVAL_ABSENCE_REQUIRED PRIVATE'])assert.equal(emit(Error(message)).validationCode,null);
 let accessed=0;const accessor=Error();Object.defineProperty(accessor,'message',{get(){accessed++;return 'PRIVATE'}});assert.equal(emit(accessor).validationCode,null);assert.equal(accessed,0);
});
test('isolated native client has an explicit owner TCP target and no inherited PG configuration',()=>{
 const proposal={host:'127.0.0.1',port:57639,database:'synthetic_fresh35_20261105_r91',owner:'fresh35_owner_20261105_r91'};
 const options=isolatedClientOptions({proposal},'0'.repeat(64));assert.equal(options.host,'127.0.0.1');assert.equal(options.ssl,false);assert.equal(options.user,proposal.owner);assert.equal(options.connectionTimeoutMillis,5000);
 for(const password of ['',null,'real:secret','0'.repeat(63)])assert.throws(()=>isolatedClientOptions({proposal},password));
 assert.throws(()=>isolatedClientOptions({proposal:{...proposal,host:'localhost'}},'0'.repeat(64)));
});
test('isolated V1 entry explicitly refuses production purpose/ordinary fields before generic target binding',async()=>{
 const s=await readFile(new URL('../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',import.meta.url),'utf8');
 const line=s.split('\n').find(l=>l.includes("'SYNTHETIC_V1_TARGET_REQUIRED'"));assert(line);
 const check=new Function('input','need',line),need=(ok,code)=>{if(!ok)throw Error(code)};
 const input={proposal:{},physical:{},startsAt:1,expiresAt:2};assert.doesNotThrow(()=>check(input,need));
 for(const extra of [{purpose:'PRODUCTION_NEW_EMPTY_EXACT35'},{ordinary:{}},{purpose:'PRODUCTION_NEW_EMPTY_EXACT35',ordinary:{}}])assert.throws(()=>check({...input,...extra},need),/SYNTHETIC_V1_TARGET_REQUIRED/);
 assert(s.indexOf(line)<s.indexOf('const target=bindFresh35CombinedTarget(input)'));
});
test('isolated bridge publishes only genuine completion and separates ordinary host verification',async()=>{
 const s=await readFile(new URL('../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',import.meta.url),'utf8');
 assert.match(s,/loadFresh35CombinedAuthorization\(program\)/);assert.match(s,/runFresh35CombinedInstall\(/);assert.match(s,/describeFresh35CombinedCompletion\(completion\)/);assert.match(s,/publishFresh35CombinedRecord\(completion\)/);assert.match(s,/process\.setuid\(a.postgresUid\)/);assert.match(s,/openReviewedFresh35Host\(/);assert.match(s,/assertWholeSalesAdmissionV1\(admission,standardTarget,client\)/);assert.match(s,/businessVerified:false/);assert.doesNotMatch(s,/modelFresh35CombinedTransactionForTests|writeFile|GRANT|CREATE ROLE/);
});
test('host output refuses a successful callback when physical connection cleanup failed',async()=>{
 const s=await readFile(new URL('../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',import.meta.url),'utf8');
 const start=s.lastIndexOf("need(verification.cleanup==='CLOSED'");
 const end=s.indexOf('return;',start)+'return;'.length;
 assert.ok(start>=0&&end>start,'the actual entry must check connection cleanup before emitting success');
 // Execute the actual post-host output block, keeping the tested condition at
 // the CLI seam instead of duplicating its logic in a separate model.
 const output=new Function('verification','need','process','failed','stage','fixtureBinding','fixtureBindingSha256',s.slice(start,end));
 const lines=[],processStub={getuid:()=>1234,stdout:{write:line=>lines.push(line)}};
 const need=(ok,code)=>{if(!ok)throw Error(code)};
 for(const cleanup of ['CLOSE_FAILED',undefined]){
  assert.throws(()=>output({result:{state:'FRESH35_CONTROLLER_HOST_VERIFIED'},cleanup},need,processStub),/CONTROLLER_HOST_CLEANUP_UNCONFIRMED/);
  assert.equal(lines.length,0);
 }
 output({cleanup:'CLOSED',host_verification:{profile:'verified'},result:{importState:'COMMITTED',replayState:'ALREADY_COMMITTED',readbackState:'VERIFIED',settlementRetentionVerified:true,retainedHeaders:25,retainedSettlements:27}},need,processStub,{result:{state:'ROLLED_BACK'}},'all',{},'b'.repeat(64));
 assert.equal(lines.length,1);assert.equal(JSON.parse(lines[0]).state,'FRESH35_CONTROLLER_HOST_VERIFIED');assert.equal(JSON.parse(lines[0]).connectionCleanup,'CLOSED');
});
test('fixed synthetic CLI stages retain original keys, stop uncertain outcomes and require every connection to close',async()=>{
 const s=await readFile(new URL('../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',import.meta.url),'utf8');
 const start=s.indexOf('  const stage=');
 const end=s.indexOf("\n }\n const authorization=",start);
 assert.ok(start>=0&&end>start);
 const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 const names=['root','workspace','standardTarget','config','HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256','join','openReviewedFresh35Host','assertWholeSalesAdmissionV1','buildSyntheticFresh35WholePackageFixture','encodedScrypt','executeWholePackage','createWholePackageSqlKernel','inspectWholePackage','reconcileWholePackage','need','process','historicalSettlementRetentionWire','describeFresh35CombinedProgram','program','requestHash'];
 const run=new AsyncFunction(...names,s.slice(start,end));
 async function scenario({firstState='ROLLED_BACK',finalCode='STANDARD_BATCH_CAS_OR_SOURCE_CONFLICT',closeFailureAt=0,readbackState='VERIFIED',badApprovalState='ROLLED_BACK',badApprovalCode='HISTORICAL_SETTLEMENT_APPROVAL_HASH',missingState='ROLLED_BACK',missingCode='STANDARD_PUBLICATION_INCOMPLETE',privateCredential='synthetic-hash',stage='all',expectedBindingSha256}={}){
  let opened=0,executed=0,disposed=0;const lines=[],iterations=[],initialize={request_key:'original-key',package_manifest_sha256:'c'.repeat(64),plan_sha256:'d'.repeat(64),payload:{historical_settlement_retention_approval:{sha256:'a'.repeat(64),utf8:'SYNTHETIC ONLY'}}};
  const steps={async *[Symbol.asyncIterator](){yield {method:'documentChunk',request:{payload:{mode:'CHUNK',rows:[{entity_type:'SALES_SETTLEMENT',fields:{sales_id:'synthetic-retained-0'}}]},request_key:'original-chunk-key'}};yield {method:'publish',request:{payload:{phase:'DOCUMENTS',expected_sequence:4},request_key:'original-final-key'}}}};
  const fixture={fixtureBinding:{manifestSha256:initialize.package_manifest_sha256,planSha256:initialize.plan_sha256,initializerSha256:requestHash({initialize,encodedScrypt:privateCredential}),stepsSha256:'e'.repeat(64)},retainedSalesIds:Array.from({length:25},(_,i)=>'synthetic-retained-'+i),historicalSettlementRetentionApproval:{syntheticModelOnly:true},identity:{batchId:'same-batch'},program:{initialize,steps},expectedCounts:{},totals:{},dispose:async()=>{disposed++}};
  const need=(ok,code)=>{if(!ok)throw Error(code)};
  const args=['/source','/owned',{}, {},'profile-v2',(...p)=>p.join('/'),async(_config,_root,_target,work,options)=>{const n=++opened;assert.equal(options.sourceProfileSha256,'profile-v2');return {result:await work({},{}),cleanup:n===closeFailureAt?'CLOSE_FAILED':'CLOSED',host_verification:{profile:'verified'}}},()=>{},async(_target,_hash,options)=>{assert.equal(options.targetCapturedAt,null);assert.equal(options.variant,'settlement-retention25');return fixture;},privateCredential,async(_client,_id,init,steps)=>{const n=executed++;assert.equal(init.request_key,initialize.request_key);if(n===0&&stage!=='commit'){assert.notEqual(init,initialize);assert.equal(init.payload.historical_settlement_retention_approval.sha256,'0'.repeat(64));}else assert.equal(init,initialize);const rows=[];for await(const step of steps)rows.push(step);iterations.push(rows);return stage==='commit'?{state:n===0?'COMMITTED':'ALREADY_COMMITTED'}:n===0?{state:badApprovalState,code:badApprovalCode}:n===1?{state:missingState,code:missingCode}:{state:n===2?firstState:n===3?'COMMITTED':'ALREADY_COMMITTED',...(n===2?{code:finalCode}:{})}},()=>({}),async()=>({state:'ABSENT'}),async()=>({state:readbackState}),need,{argv:['node','entry',stage==='rollback'?'--verify-host-rollback':stage==='commit'?'--verify-host-commit':'--verify-host',...(stage==='commit'?[expectedBindingSha256??requestHash({format:'FRESH35_SYNTHETIC_RETENTION25_STAGE_BINDING_V1',sourceSetSha256:'1'.repeat(64),installProgramSha256:'2'.repeat(64),targetSha256:'3'.repeat(64),...fixture.fixtureBinding})]:[])],getuid:()=>1234,stdout:{write:x=>lines.push(x)}},()=>structuredClone(initialize.payload.historical_settlement_retention_approval),()=>({sourceSetSha256:'1'.repeat(64),programSha256:'2'.repeat(64),targetSha256:'3'.repeat(64)}),{},requestHash];
  let error;try{await run(...args)}catch(e){error=e}
  return {opened,executed,disposed,lines,iterations,error};
 }
 const ok=await scenario();assert.ifError(ok.error);assert.equal(ok.opened,8);assert.equal(ok.lines.length,1);assert.equal(JSON.parse(ok.lines[0]).syntheticImportVerified,true);assert.equal(JSON.parse(ok.lines[0]).businessVerified,false);
 assert.deepEqual(ok.iterations.map(rows=>rows.at(-1).request.payload.expected_sequence),[4,4,5,4,4]);assert.ok(ok.iterations.every(rows=>rows.at(-1).request.request_key==='original-final-key'));
 assert.equal(ok.iterations[1][0].request.payload.rows.length,0);assert.equal(ok.iterations[3][0].request.payload.rows.length,1);assert.equal(JSON.parse(ok.lines[0]).retainedHeaders,25);assert.equal(JSON.parse(ok.lines[0]).retainedSettlements,27);
 for(const bad of [{badApprovalState:'COMMITTED'},{badApprovalCode:'PERMISSION_DENIED'},{missingState:'UNKNOWN'},{missingCode:'CONNECTION_FAILED'}]){const r=await scenario(bad);assert(r.error);assert.equal(r.opened,Object.hasOwn(bad,'missingState')||Object.hasOwn(bad,'missingCode')?3:1);assert.equal(r.lines.length,0);assert.equal(r.disposed,1);}
 const rollback=await scenario({stage:'rollback'});assert.ifError(rollback.error);assert.equal(rollback.opened,6);assert.equal(rollback.executed,3);const rb=JSON.parse(rollback.lines[0]);assert.equal(rb.state,'FRESH35_SYNTHETIC_ROLLBACK_VERIFIED');assert.equal(rb.syntheticImportVerified,false);assert.equal(rb.fixtureBindingSha256,requestHash(rb.fixtureBinding));
 for(const stage of ['all','rollback'])for(const finalCode of ['PERMISSION_DENIED','IMPORT_FAILED','STANDARD_PUBLICATION_INCOMPLETE',undefined]){const rejected=await scenario({stage,finalCode:finalCode??null});assert.match(rejected.error?.message??'',/SYNTHETIC_FINAL_FAILURE_ROLLBACK_REQUIRED/);assert.equal(rejected.error.validationStage,'FINAL_PUBLISH');assert.equal(rejected.error.validationCode,finalCode??null);assert.equal(rejected.executed,3,'No COMMIT after wrong final classification');assert.equal(rejected.opened,5);assert.equal(rejected.lines.length,0);assert.equal(rejected.disposed,1);}
 assert.equal(rb.failedAttempt.finalFailureStage,'FINAL_PUBLISH');assert.equal(rb.failedAttempt.finalFailureCode,'STANDARD_BATCH_CAS_OR_SOURCE_CONFLICT');
 const commit=await scenario({stage:'commit',expectedBindingSha256:rb.fixtureBindingSha256});assert.ifError(commit.error);assert.equal(commit.opened,3);assert.equal(commit.executed,2);assert.equal(JSON.parse(commit.lines[0]).fixtureBindingSha256,rb.fixtureBindingSha256);assert.equal(JSON.parse(commit.lines[0]).connectionCleanup,'CLOSED');
 const secretDrift=await scenario({stage:'commit',privateCredential:'other-synthetic-hash',expectedBindingSha256:rb.fixtureBindingSha256});assert.match(secretDrift.error.message,/STAGE_BINDING_CHANGED/);assert.equal(secretDrift.executed,0);assert.equal(secretDrift.lines.length,0);assert(!commit.lines[0].includes('synthetic-hash'));
 const drift=await scenario({stage:'commit',expectedBindingSha256:'0'.repeat(64)});assert.match(drift.error.message,/STAGE_BINDING_CHANGED/);assert.equal(drift.executed,0);assert.equal(drift.opened,1);assert.equal(drift.lines.length,0);
 const unknown=await scenario({firstState:'UNKNOWN'});assert.match(unknown.error.message,/SYNTHETIC_FINAL_FAILURE_ROLLBACK_REQUIRED/);assert.equal(unknown.opened,5);assert.equal(unknown.lines.length,0);assert.equal(unknown.disposed,1);
 const unclosed=await scenario({closeFailureAt:2});assert.match(unclosed.error.message,/CONTROLLER_HOST_CLEANUP_UNCONFIRMED/);assert.equal(unclosed.opened,2);assert.equal(unclosed.lines.length,0);
 const wrong=await scenario({readbackState:'VERIFICATION_FAILED'});assert.match(wrong.error.message,/SYNTHETIC_NEW_CONNECTION_READBACK_REQUIRED/);assert.equal(wrong.lines.length,0);
});

test('split commit mode accepts only the original fixed entry and one64hex expected rollback binding',async()=>{
 const s=await readFile(new URL('../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',import.meta.url),'utf8'),line=s.split('\n').find(l=>l.includes("'--verify-host-commit'].includes(process.argv[2])"));assert(line);
 const check=new Function('process','root','need',line),root='/fixed',entry=root+'/scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',need=(ok,c)=>{if(!ok)throw Error(c)};
 for(const argv of [['node',entry,'--bootstrap-observer'],['node',entry,'--verify-host'],['node',entry,'--verify-host-rollback'],['node',entry,'--verify-host-commit','a'.repeat(64)]])assert.doesNotThrow(()=>check({argv},root,need));
 for(const argv of [['node',entry,'--bootstrap-observer','extra'],['node',entry,'--verify-host-commit'],['node',entry,'--verify-host-commit','bad'],['node',entry,'--verify-host-rollback','a'.repeat(64)],['node','/other','--verify-host'],['node',entry,'--verify-host-commit','a'.repeat(64),'extra']])assert.throws(()=>check({argv},root,need),/FIXED_ENTRY_REQUIRED/);
});

test('bootstrap observer CLI emits only bound bootstrap SQL after source/target validation and before any catalog/client/record path',async()=>{
 const s=await readFile(new URL('../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',import.meta.url),'utf8');
 const marker=" if(process.argv[2]==='--bootstrap-observer')",start=s.indexOf(marker),end=s.indexOf('\n',start),lines=[];
 assert(start>s.indexOf('const target=bindFresh35CombinedTarget(input)'));
 assert(start>s.indexOf('SOURCE_SET_DIFFERS'));assert(start<s.indexOf('const catalog=await buildFresh35CombinedCatalog'));
 assert(start<s.indexOf('new Client('));
 const render=new Function('process','fresh35CombinedBootstrapObserverSql','target',s.slice(start,end)+'throw Error("MUST_RETURN");');
 const target=Object.freeze({test:'already-bound-token'});
 render({argv:['node','fixed','--bootstrap-observer'],stdout:{write:x=>lines.push(x)}},actual=>{assert.equal(actual,target);return 'BEGIN; SYNTHETIC ONLY; COMMIT;\n'},target);
 assert.deepEqual(lines,['BEGIN; SYNTHETIC ONLY; COMMIT;\n']);
 assert.throws(()=>render({argv:['node','fixed','--bootstrap-observer'],stdout:{write:x=>lines.push(x)}},()=>{throw Error('SOURCE_REFUSED')},target),/SOURCE_REFUSED/);
 assert.equal(lines.length,1,'failure never emits partial SQL or an execution record');
});


test('isolated application bootstrap reads one original private hash before dropping UID and never defaults to dummy',async()=>{
 const s=await readFile(new URL('../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',import.meta.url),'utf8');
 const start=s.indexOf('  const applicationInput='),end=s.indexOf('  const config=',start);assert(start>=0&&end>start&&end<s.indexOf('  process.setgroups'));
 const {isNodeScryptPasswordHash,NODE_SCRYPT_DUMMY_HASH}=await import('../packages/authentication/src/passwords.ts');
 const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor,run=new AsyncFunction('privateText','join','workspace','isNodeScryptPasswordHash','NODE_SCRYPT_DUMMY_HASH','need',s.slice(start,end)+'return encodedScrypt;');
 const modelHash=NODE_SCRYPT_DUMMY_HASH.slice(0,-1)+'1',need=(ok,code)=>{if(!ok)throw Error(code)};
 for(const input of [undefined,'',NODE_SCRYPT_DUMMY_HASH+'\n',modelHash,modelHash+'\nextra'])await assert.rejects(()=>run(async()=>{if(input===undefined)throw Error('PRIVATE_INPUT_REQUIRED');return input},(...x)=>x.join('/'),'/owned',isNodeScryptPasswordHash,NODE_SCRYPT_DUMMY_HASH,need));
 assert.equal(await run(async path=>{assert.equal(path,'/owned/credentials/synthetic-application-scrypt.txt');return modelHash+'\n'},(...x)=>x.join('/'),'/owned',isNodeScryptPasswordHash,NODE_SCRYPT_DUMMY_HASH,need),modelHash);
 const {requestHash}=await import('../packages/application/src/request-hash.ts');assert.notEqual(requestHash({initialize:{},encodedScrypt:modelHash}),requestHash({initialize:{},encodedScrypt:NODE_SCRYPT_DUMMY_HASH}));
});

test('safe installation diagnostic stderr exposes only closed fields and no original private exception data',async()=>{
 const s=await readFile(new URL('../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',import.meta.url),'utf8');
 const start=s.lastIndexOf('process.stderr.write('),end=s.indexOf('process.exitCode=1;',start)+'process.exitCode=1;'.length;
 const {describeFresh35CombinedInstallFailure,modelFresh35CombinedTransactionForTests}=await import('../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs');
 const render=new Function('error','process','describeFresh35CombinedInstallFailure',s.slice(start,end)),lines=[],p={stderr:{write:s=>lines.push(s)},exitCode:0};
 let failure;try{await modelFresh35CombinedTransactionForTests([{name:'physical-empty-target',sql:'SYNTHETIC'}],{current:async()=>{},emit:async()=>{},query:async sql=>{if(sql.startsWith('BEGIN'))return{command:'BEGIN'};throw Object.assign(Error('PRIVATE SQL'),{code:'42501',detail:'PRIVATE DETAIL'})},rollback:async()=>{throw Object.assign(Error('PRIVATE ROLLBACK'),{code:'08006'})}})}catch(error){failure=error}render(failure,p,describeFresh35CombinedInstallFailure);
 const out=JSON.parse(lines[0]);assert.equal(p.exitCode,1);assert.equal(out.stage,'STEP');assert.equal(out.step,'physical-empty-target');assert.equal(out.originalSQLSTATE,'42501');assert.equal(out.rollbackSQLSTATE,'08006');assert.equal(out.automaticRetry,false);assert.equal(Object.keys(out).length,12);assert.doesNotMatch(lines[0],/PRIVATE|DETAIL|message|stack/);
 lines.length=0;render({installState:'PRIVATE',installDiagnostic:{stage:'PRIVATE',step:'PRIVATE',originalSQLSTATE:'PRIVATE'}},p,describeFresh35CombinedInstallFailure);assert.equal(JSON.parse(lines[0]).installState,null);assert.equal(JSON.parse(lines[0]).stage,'UNKNOWN');
});
