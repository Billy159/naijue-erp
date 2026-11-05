import {requestHash} from '../packages/application/src/request-hash.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {isolatedClientOptions} from '../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs';
test('isolated native client has an explicit owner TCP target and no inherited PG configuration',()=>{
 const proposal={host:'127.0.0.1',port:57639,database:'synthetic_fresh35_20261105_r91',owner:'fresh35_owner_20261105_r91'};
 const options=isolatedClientOptions({proposal},'0'.repeat(64));assert.equal(options.host,'127.0.0.1');assert.equal(options.ssl,false);assert.equal(options.user,proposal.owner);assert.equal(options.connectionTimeoutMillis,5000);
 for(const password of ['',null,'real:secret','0'.repeat(63)])assert.throws(()=>isolatedClientOptions({proposal},password));
 assert.throws(()=>isolatedClientOptions({proposal:{...proposal,host:'localhost'}},'0'.repeat(64)));
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
 for(const argv of [['node',entry,'--verify-host'],['node',entry,'--verify-host-rollback'],['node',entry,'--verify-host-commit','a'.repeat(64)]])assert.doesNotThrow(()=>check({argv},root,need));
 for(const argv of [['node',entry,'--verify-host-commit'],['node',entry,'--verify-host-commit','bad'],['node',entry,'--verify-host-rollback','a'.repeat(64)],['node','/other','--verify-host'],['node',entry,'--verify-host-commit','a'.repeat(64),'extra']])assert.throws(()=>check({argv},root,need),/FIXED_ENTRY_REQUIRED/);
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
