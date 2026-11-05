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
 const start=s.indexOf("  need(verification.cleanup==='CLOSED'");
 const end=s.indexOf('\n }',start);
 assert.ok(start>=0&&end>start,'the actual entry must check connection cleanup before emitting success');
 // Execute the actual post-host output block, keeping the tested condition at
 // the CLI seam instead of duplicating its logic in a separate model.
 const output=new Function('verification','need','process',s.slice(start,end));
 const lines=[],processStub={getuid:()=>1234,stdout:{write:line=>lines.push(line)}};
 const need=(ok,code)=>{if(!ok)throw Error(code)};
 for(const cleanup of ['CLOSE_FAILED',undefined]){
  assert.throws(()=>output({result:{state:'FRESH35_CONTROLLER_HOST_VERIFIED'},cleanup},need,processStub),/CONTROLLER_HOST_CLEANUP_UNCONFIRMED/);
  assert.equal(lines.length,0);
 }
 output({cleanup:'CLOSED',host_verification:{profile:'verified'}},need,processStub);
 assert.equal(lines.length,1);assert.equal(JSON.parse(lines[0]).state,'FRESH35_CONTROLLER_HOST_VERIFIED');
});
