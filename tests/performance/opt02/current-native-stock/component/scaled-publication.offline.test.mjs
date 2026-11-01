/** Protocol/source/acknowledgement mocks only: NO PG, genuine commit or publication. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {buildScaledReferenceFixture} from './scaled-fixture.mjs';import {buildReferenceFixture} from './fixture.mjs';
import {createScaledReferencePublication,verifyScaledReferenceAcknowledgement} from './scaled-publication.mjs';
const f=buildScaledReferenceFixture(),stamp='2026-11-01T10:00:00.000Z',micro='2026-11-01T10:00:00.000000Z';
const options=()=>({fixture:f,pool:{async connect(){throw Error('no actual PG')}},readArtifact:async path=>Buffer.from(f.artifacts.find(x=>x.path===path).utf8),now:()=>stamp,beforeCommand:async()=>{},onAcknowledged:async()=>{}});
function ack(index,alter=()=>undefined){const command=f.commands[index],result=f.expectedResults[index],calls=[];
 const facts=[{id:result.operationId,actor_account_id:command.actorAccountId,request_key:command.requestKey,request_hash:f.commandHashes[index],action:command.action,target_type:'IMPORT',target_id:f.batchId,status:'COMMITTED',result_data:result,completed_at:micro},
 {operation_id:result.operationId,actor_account_id:command.actorAccountId,object_type:'IMPORT',object_id:f.batchId,action:command.action,new_version:index+1,old_version:index===0?null:index,occurred_at:micro,before_values:index===0?null:f.checkpoints[index-1],after_values:f.checkpoints[index]}];
 return{calls,async query(text,values){const n=calls.length;calls.push({text,values});assert.deepEqual(values,[result.operationId]);let rows=n<2?[structuredClone(facts[n])]:result.ledgerEntryIds.map(id=>({id}));return{rows:alter(n,rows)??rows};}};
}
test('producer has no external service/SQL/cap injection and old/clone fixture never reaches pool',()=>{
 for(const fixture of [buildReferenceFixture(),structuredClone(f),{}])assert.throws(()=>createScaledReferencePublication({...options(),fixture}));
 for(const extra of ['service','issuer','sql','authority'])assert.throws(()=>createScaledReferencePublication({...options(),[extra]:{}}));
});
test('before-command rejection makes zero original store sends and prevents second attempt',async()=>{
 const original=Error('host preflight blocked');let sends=0,acks=0;const pub=createScaledReferencePublication({...options(),pool:{async connect(){sends++;throw Error('must not connect')}},beforeCommand:async()=>{throw original},onAcknowledged:async()=>{acks++}});
 await assert.rejects(pub.execute(),e=>e===original);await assert.rejects(pub.execute(),/ONE_REFERENCE_PUBLICATION_ATTEMPT_NO_REPLAY/);assert.equal(sends,0);assert.equal(acks,0);
});
test('original store transport failure stops publication once without acknowledgement or fake success',async()=>{
 const original=Error('original pool unavailable');let sends=0,steps=0,acks=0;const pub=createScaledReferencePublication({...options(),pool:{async connect(){sends++;throw original}},beforeCommand:async i=>{assert.equal(i,0);steps++},onAcknowledged:async()=>{acks++}});
 await assert.rejects(pub.execute(),e=>e===original);await assert.rejects(pub.execute(),/ONE_REFERENCE_PUBLICATION_ATTEMPT_NO_REPLAY/);assert.equal(sends,1);assert.equal(steps,1);assert.equal(acks,0);
});
test('scripted acknowledgement checks exact original4 receipt/audit/checkpoint/ledger contracts',async()=>{
 for(let i=0;i<4;i++){const q=ack(i),r=await verifyScaledReferenceAcknowledgement(f,q.query,i,f.expectedResults[i],stamp);assert.equal(q.calls.length,3);assert.equal(r.receiptObserved,true);assert.equal(r.auditObserved,true);assert.equal(r.cursor,[0,102,106,107][i]);assert.equal(r.ledgerEffects,i===2?4:0);}
});
test('receipt/audit identity, request hash, actor, clock, status and exact checkpoint mutations all refuse',async()=>{
 for(let i=0;i<4;i++)for(const [step,key,value] of [[0,'status','PENDING'],[0,'request_hash','0'.repeat(64)],[0,'actor_account_id',f.native.ids.supplier],[0,'completed_at','2026-11-01T10:00:00Z'],[0,'target_id',f.native.ids.product],
 [1,'old_version',999],[1,'new_version',999],[1,'before_values',{}],[1,'after_values',{}],[1,'occurred_at','wrong'],[1,'object_type','PRODUCT']]){
  const q=ack(i,(n,rows)=>n===step?[{...rows[0],[key]:value}]:undefined);await assert.rejects(verifyScaledReferenceAcknowledgement(f,q.query,i,f.expectedResults[i],stamp));assert.equal(q.calls.length,step+1);
 }
});
test('missing/duplicate/extra/changed ledger effects and original error cannot become commit proof',async()=>{
 for(const i of [0,1,2,3]){const q=ack(i,n=>n===2?[{id:f.native.ids.productOperation}]:undefined);await assert.rejects(verifyScaledReferenceAcknowledgement(f,q.query,i,f.expectedResults[i],stamp));}
 for(const rows of [[],[{},{}]]){const q=ack(0,n=>n===0?rows:undefined);await assert.rejects(verifyScaledReferenceAcknowledgement(f,q.query,0,f.expectedResults[0],stamp));}
 let sends=0;const never=async()=>{sends++;return{rows:[]}};for(const index of [-1,4,'0'])await assert.rejects(verifyScaledReferenceAcknowledgement(f,never,index,f.expectedResults[0],stamp));await assert.rejects(verifyScaledReferenceAcknowledgement(f,never,0,{...f.expectedResults[0],cursor:1},stamp));assert.equal(sends,0);
 const original=Error('original readback failure');await assert.rejects(verifyScaledReferenceAcknowledgement(f,async()=>{throw original},0,f.expectedResults[0],stamp),e=>e===original);
});
test('new producer preserves original service/store plus execute and ACK sequence after only brand/name renames',async()=>{
 const old=await readFile(new URL('./publication.mjs',import.meta.url),'utf8');const current=await readFile(new URL('./scaled-publication.mjs',import.meta.url),'utf8');
 const normalized=current.replace("import { need, freeze } from './fixture.mjs';\nimport { assertScaledFixture } from './scaled-fixture.mjs';","import { assertFixture, need, freeze } from './fixture.mjs';")
 .replace("import { createScaledCheckedAuthorizer } from './scaled-authorizer.mjs';","import { createReferenceSourceAuthorizer } from './authorizer.mjs';")
 .replaceAll('createScaledReferencePublication','createReferencePublication').replaceAll('verifyScaledReferenceAcknowledgement','verifyReferenceAcknowledgement').replaceAll('assertScaledFixture(input)','assertFixture(input)').replaceAll('createScaledCheckedAuthorizer','createReferenceSourceAuthorizer').replaceAll('all303','all105').replaceAll('four nonzero +196 absent','four nonzero +two absent');
 assert.equal(normalized,old);assert.ok(current.includes('new PostgresCutoffImportStore(pool)'));assert.ok(current.includes('createCutoffImportService('));
});
