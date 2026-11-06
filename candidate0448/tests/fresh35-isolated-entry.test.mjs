import {requestHash} from '../packages/application/src/request-hash.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {isolatedClientOptions} from '../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs';
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
 const serialize=new Function('error','process','describeFresh35CombinedInstallFailure','describeWholePackageFailure',source.slice(start,end));
 const emit=error=>{const lines=[],process={stderr:{write:line=>lines.push(line)}};serialize(error,process,()=>({stage:'UNKNOWN',step:null,originalSQLSTATE:null,originalInternalCode:null,rollbackSQLSTATE:null,rollbackInternalCode:null}),describeWholePackageFailure);assert.equal(process.exitCode,1);assert.equal(lines.length,1);return JSON.parse(lines[0])};
 const actual=emit(rejected);assert.equal(actual.validationCode,'IMPORT_FAILED');assert.equal(actual.validationSQLSTATE,'42501');assert.equal(actual.validationStep,'LOCK_AND_INSPECT');assert.equal(actual.validationInternalCode,null);assert.doesNotMatch(JSON.stringify(actual),/PRIVATE|parameter|business|detail|validationResult/);
 const forged=emit(Object.assign(Error('PRIVATE'),{validationResult:{...result},validationSQLSTATE:'42501',validationStep:'OTHER',validationInternalCode:'NOT_ALLOWED'}));
 for(const key of ['validationSQLSTATE','validationStep','validationInternalCode'])assert.equal(forged[key],null,'unbranded supplied fields cannot become diagnostics');
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
 const ok=await scenario();assert.ifError(ok.error);assert.equal(ok.opened,3);assert.equal(ok.lines.length,1);assert.equal(JSON.parse(ok.lines[0]).syntheticImportVerified,true);assert.equal(JSON.parse(ok.lines[0]).businessVerified,false);
 assert.deepEqual(ok.iterations.map(rows=>rows.at(-1).request.payload.expected_sequence),[4,4,5,4,4]);assert.ok(ok.iterations.every(rows=>rows.at(-1).request.request_key==='original-final-key'));
 assert.equal(ok.iterations[1][0].request.payload.rows.length,0);assert.equal(ok.iterations[3][0].request.payload.rows.length,1);assert.equal(JSON.parse(ok.lines[0]).retainedHeaders,25);assert.equal(JSON.parse(ok.lines[0]).retainedSettlements,27);
 for(const bad of [{badApprovalState:'COMMITTED'},{badApprovalCode:'PERMISSION_DENIED'},{missingState:'UNKNOWN'},{missingCode:'CONNECTION_FAILED'}]){const r=await scenario(bad);assert(r.error);assert.equal(r.opened,1);assert.equal(r.lines.length,0);assert.equal(r.disposed,1);}
 const rollback=await scenario({stage:'rollback'});assert.ifError(rollback.error);assert.equal(rollback.opened,1);assert.equal(rollback.executed,3);const rb=JSON.parse(rollback.lines[0]);assert.equal(rb.state,'FRESH35_SYNTHETIC_ROLLBACK_VERIFIED');assert.equal(rb.syntheticImportVerified,false);assert.equal(rb.fixtureBindingSha256,requestHash(rb.fixtureBinding));
 for(const stage of ['all','rollback'])for(const finalCode of ['PERMISSION_DENIED','IMPORT_FAILED','STANDARD_PUBLICATION_INCOMPLETE',undefined]){const rejected=await scenario({stage,finalCode:finalCode??null});assert.match(rejected.error?.message??'',/SYNTHETIC_FINAL_FAILURE_ROLLBACK_REQUIRED/);assert.equal(rejected.error.validationStage,'FINAL_PUBLISH');assert.equal(rejected.error.validationCode,finalCode??null);assert.equal(rejected.executed,3,'No COMMIT after wrong final classification');assert.equal(rejected.opened,1);assert.equal(rejected.lines.length,0);assert.equal(rejected.disposed,1);}
 assert.equal(rb.failedAttempt.finalFailureStage,'FINAL_PUBLISH');assert.equal(rb.failedAttempt.finalFailureCode,'STANDARD_BATCH_CAS_OR_SOURCE_CONFLICT');
 const commit=await scenario({stage:'commit',expectedBindingSha256:rb.fixtureBindingSha256});assert.ifError(commit.error);assert.equal(commit.opened,3);assert.equal(commit.executed,2);assert.equal(JSON.parse(commit.lines[0]).fixtureBindingSha256,rb.fixtureBindingSha256);assert.equal(JSON.parse(commit.lines[0]).connectionCleanup,'CLOSED');
 const secretDrift=await scenario({stage:'commit',privateCredential:'other-synthetic-hash',expectedBindingSha256:rb.fixtureBindingSha256});assert.match(secretDrift.error.message,/STAGE_BINDING_CHANGED/);assert.equal(secretDrift.executed,0);assert.equal(secretDrift.lines.length,0);assert(!commit.lines[0].includes('synthetic-hash'));
 const drift=await scenario({stage:'commit',expectedBindingSha256:'0'.repeat(64)});assert.match(drift.error.message,/STAGE_BINDING_CHANGED/);assert.equal(drift.executed,0);assert.equal(drift.opened,1);assert.equal(drift.lines.length,0);
 const unknown=await scenario({firstState:'UNKNOWN'});assert.match(unknown.error.message,/SYNTHETIC_FINAL_FAILURE_ROLLBACK_REQUIRED/);assert.equal(unknown.opened,1);assert.equal(unknown.lines.length,0);assert.equal(unknown.disposed,1);
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
