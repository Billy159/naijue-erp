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
 const output=new Function('verification','need','process','failed',s.slice(start,end));
 const lines=[],processStub={getuid:()=>1234,stdout:{write:line=>lines.push(line)}};
 const need=(ok,code)=>{if(!ok)throw Error(code)};
 for(const cleanup of ['CLOSE_FAILED',undefined]){
  assert.throws(()=>output({result:{state:'FRESH35_CONTROLLER_HOST_VERIFIED'},cleanup},need,processStub),/CONTROLLER_HOST_CLEANUP_UNCONFIRMED/);
  assert.equal(lines.length,0);
 }
 output({cleanup:'CLOSED',host_verification:{profile:'verified'},result:{importState:'COMMITTED',replayState:'ALREADY_COMMITTED',readbackState:'VERIFIED'}},need,processStub,{result:{state:'ROLLED_BACK'}});
 assert.equal(lines.length,1);assert.equal(JSON.parse(lines[0]).state,'FRESH35_CONTROLLER_HOST_VERIFIED');
});
test('fixed synthetic CLI stages retain original keys, stop uncertain outcomes and require every connection to close',async()=>{
 const s=await readFile(new URL('../scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',import.meta.url),'utf8');
 const start=s.indexOf('  const options={referenceDirectory:');
 const end=s.indexOf("\n }\n const authorization=",start);
 assert.ok(start>=0&&end>start);
 const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 const names=['root','workspace','standardTarget','config','HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256','join','openReviewedFresh35Host','assertWholeSalesAdmissionV1','buildSyntheticFresh35WholePackageFixture','NODE_SCRYPT_DUMMY_HASH','executeWholePackage','createWholePackageSqlKernel','inspectWholePackage','reconcileWholePackage','need','process'];
 const run=new AsyncFunction(...names,s.slice(start,end));
 async function scenario({firstState='ROLLED_BACK',closeFailureAt=0,readbackState='VERIFIED'}={}){
  let opened=0,executed=0,disposed=0;const lines=[],iterations=[],initialize={request_key:'original-key'};
  const steps={async *[Symbol.asyncIterator](){yield {method:'publish',request:{payload:{phase:'DOCUMENTS',expected_sequence:4},request_key:'original-final-key'}}}};
  const fixture={identity:{batchId:'same-batch'},program:{initialize,steps},expectedCounts:{},totals:{},dispose:async()=>{disposed++}};
  const need=(ok,code)=>{if(!ok)throw Error(code)};
  const args=['/source','/owned',{}, {},'profile-v2',(...p)=>p.join('/'),async(_config,_root,_target,work,options)=>{const n=++opened;assert.equal(options.sourceProfileSha256,'profile-v2');return {result:await work({},{}),cleanup:n===closeFailureAt?'CLOSE_FAILED':'CLOSED',host_verification:{profile:'verified'}}},()=>{},async(_target,_hash,options)=>{assert.equal(options.targetCapturedAt,null);return fixture;},'synthetic-hash',async(_client,_id,init,steps)=>{assert.equal(init,initialize);const rows=[];for await(const step of steps)rows.push(step);iterations.push(rows);return {state:executed++===0?firstState:executed===2?'COMMITTED':'ALREADY_COMMITTED'}},()=>({}),async()=>({state:'ABSENT'}),async()=>({state:readbackState}),need,{getuid:()=>1234,stdout:{write:x=>lines.push(x)}}];
  let error;try{await run(...args)}catch(e){error=e}
  return {opened,executed,disposed,lines,iterations,error};
 }
 const ok=await scenario();assert.ifError(ok.error);assert.equal(ok.opened,3);assert.equal(ok.lines.length,1);assert.equal(JSON.parse(ok.lines[0]).syntheticImportVerified,true);assert.equal(JSON.parse(ok.lines[0]).businessVerified,false);
 assert.deepEqual(ok.iterations.map(rows=>rows[0].request.payload.expected_sequence),[5,4,4]);assert.ok(ok.iterations.every(rows=>rows[0].request.request_key==='original-final-key'));
 const unknown=await scenario({firstState:'UNKNOWN'});assert.match(unknown.error.message,/SYNTHETIC_FINAL_FAILURE_ROLLBACK_REQUIRED/);assert.equal(unknown.opened,1);assert.equal(unknown.lines.length,0);assert.equal(unknown.disposed,1);
 const unclosed=await scenario({closeFailureAt:2});assert.match(unclosed.error.message,/CONTROLLER_HOST_CLEANUP_UNCONFIRMED/);assert.equal(unclosed.opened,2);assert.equal(unclosed.lines.length,0);
 const wrong=await scenario({readbackState:'VERIFICATION_FAILED'});assert.match(wrong.error.message,/SYNTHETIC_NEW_CONNECTION_READBACK_REQUIRED/);assert.equal(wrong.lines.length,0);
});
