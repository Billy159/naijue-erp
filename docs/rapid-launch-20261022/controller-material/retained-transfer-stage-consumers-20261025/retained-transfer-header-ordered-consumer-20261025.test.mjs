// Scripted consumer protocol only. Real retained ONE-row fixture; no PG/authorization/job.
import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';import{createHash}from'node:crypto';
import{runRetainedTransferHeaders}from'./retained-transfer-header-ordered-consumer-20261025.mjs';
import * as staging from '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022/packages/application/src/import-v3-history-header-staging.ts';
import{transferHeaderProjection26}from'/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022/scripts/import-v3/native-transfer-header-source26.mjs';
const source={...staging,transferHeaderProjection26};const w=JSON.parse(await readFile(new URL('./TRANSFER-HEADER-RETAINED-WINDOW-20261025.json',import.meta.url)));
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture({existing=false,unknown=false,conflict=false,mutate=false,corrupt=false,progressFails=false}={}){
 const blobs={source:Buffer.from(JSON.stringify(w.sourceProjection)+'\n'),typed:Buffer.from(JSON.stringify(w.typedProjection)+'\n'),document:Buffer.from(JSON.stringify(w.documentAllocation)+'\n')};
 const entry={headerId:w.documentAllocation.headerId,headerSourceRowId:w.documentAllocation.headerSourceRowId,sourceKey:w.documentAllocation.sourceKey};
 for(const[k,b]of Object.entries(blobs))entry[k]={offset:0,bytes:b.length,sha256:sha(b)};
 const index=Buffer.from(JSON.stringify(entry)+'\n');const scope={binding:w.binding,rows:1,chunks:1,preparedFingerprintStreamSha256:sha(w.sourceProjection.projection.field_provenance.history_header_staging.fingerprint+'\n'),index:{bytes:index.length,sha256:sha(index)},...Object.fromEntries(Object.entries(blobs).map(([k,b])=>[k,{bytes:b.length}]))};
 let present=existing,stages=0,reads=0,closed=0,authorityClosed=0;const events=[];
 const options={source,scope,executionInput:{executionEnabled:true,action:'TRANSFER_HEADER_RETAINED_ORIGINAL_STAGE_ONLY',writerSourceCommit:'a'.repeat(40)},retained:{async indexBytes(){return index;},async verify(){},async readRange(role){return corrupt&&role==='typed'?Buffer.alloc(blobs[role].length):blobs[role];},async close(){closed++;}},
 authority:{async verifyInputs(){},async assertExecutionAllowed(){},async authorizeStep(payload){if(mutate)payload.payload.rows[0].prepared.header.note='mutation';},async close(){authorityClosed++;}},
 store:{async stage(chunk){stages++;source.validatePreparedHistoryHeaderChunk(chunk);if(unknown)throw Error('unknown commit');const replay=present;present=true;return{inserted:replay?0:1,replayed:replay?1:0};}},
 async readbackWindow(expected){reads++;return expected.map((e,i)=>({ordinal:String(i+1),source_id:present?e.source.id:null,header_id:present?e.header.id:null,source_candidates:present?'1':'0',source_equal:present,header_equal:present&&!conflict}));},
 async recordProgress(event){events.push(event);if(progressFails&&event.event==='HEADER_CHUNK_COMMIT_RETURNED')throw Error('fsync fail');}};
 return{options,counts:()=>({stages,reads,closed,authorityClosed}),events};
}
test('retained header serial consumer: original stage and exact existing replay retain complete identity and close',async()=>{
 for(const existing of[false,true]){const f=fixture({existing}),r=await runRetainedTransferHeaders(f.options);assert.equal(r.status,'COMPLETE_ORIGINAL_HEADER_STAGE_AND_PER_CHUNK_RR_READBACK_NOT_PUBLICATION');assert.equal(r.inserted,existing?0:1);assert.equal(r.replayed,existing?1:0);assert.equal(r.readbackConfirmedRows,1);assert.deepEqual(f.counts(),{stages:1,reads:2,closed:1,authorityClosed:1});assert.equal(f.events[0].keys[0].headerId,w.documentAllocation.headerId);}
});
test('retained header serial consumer: changed range, mutated source authority and exact before conflict deny without writes',async()=>{
 for(const flags of[{corrupt:true},{mutate:true},{existing:true,conflict:true}]){const f=fixture(flags),r=await runRetainedTransferHeaders(f.options);assert.equal(r.status,'STOPPED_PRESERVE_RETURNED_COMMITS_NO_RETRY');assert.equal(f.counts().stages,0);assert.equal(f.counts().closed,1);assert.equal(f.counts().authorityClosed,1);}
});
test('retained header serial consumer: unknown original commit keeps complete original chunk keys and never retries',async()=>{
 const f=fixture({unknown:true}),r=await runRetainedTransferHeaders(f.options);assert.equal(r.status,'STOPPED_CURRENT_ORIGINAL_CHUNK_OUTCOME_UNKNOWN_NO_RETRY');assert.equal(f.counts().stages,1);assert.equal(r.current.commitReturned,false);assert.equal(r.current.keys[0].sourceRowId,w.documentAllocation.headerSourceRowId);assert.equal(r.readbackConfirmedRows,0);
});
test('retained header serial consumer: postcommit journal failure preserves returned commit separately from readback',async()=>{
 const f=fixture({progressFails:true}),r=await runRetainedTransferHeaders(f.options);assert.equal(r.status,'STOPPED_PRESERVE_RETURNED_COMMITS_NO_RETRY');assert.equal(r.current.commitReturned,true);assert.equal(r.commitReturnedRows,1);assert.equal(r.inserted,1);assert.equal(r.readbackConfirmedRows,0);assert.equal(f.counts().stages,1);
});

test('retained header serial consumer: disabled draft refuses before retained reads or stage',async()=>{
 const f=fixture();f.options.executionInput.executionEnabled=false;const r=await runRetainedTransferHeaders(f.options);
 assert.equal(r.firstError.code,'HEADER_T45_FIXED_ENABLED_INPUT_REQUIRED');assert.equal(f.counts().stages,0);assert.equal(f.counts().reads,0);
});

test('retained header file adapter: exact private fixture ranges, drift refusal and owned handle close',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const{join}=await import('node:path');const{fileURLToPath}=await import('node:url');
 const{openRetainedTransferHeaderFiles}=await import('./retained-transfer-header-ordered-consumer-20261025.mjs');
 const dir=await mkdtemp(fileURLToPath(new URL('./header-consumer-private-fixture-',import.meta.url)));let retained;
 try{
  const refs={};for(const role of['index','source','typed','document']){const value=Buffer.from(`SYNTHETIC-${role}\n`),path=join(dir,role);await writeFile(path,value,{mode:0o600});refs[role]={path,bytes:value.length};}
  retained=await openRetainedTransferHeaderFiles(refs);assert.equal((await retained.indexBytes()).toString(),'SYNTHETIC-index\n');assert.equal((await retained.readRange('source',0,9)).toString(),'SYNTHETIC');
  await writeFile(refs.typed.path,'changed fixture');await assert.rejects(retained.verify(),e=>e.code==='HEADER_RETAINED_FILE_CHANGED');
  await retained.close();await assert.rejects(retained.readRange('source',0,1),e=>e.code==='HEADER_RETAINED_FILES_CLOSED');
 }finally{await retained?.close();await rm(dir,{recursive:true});}
});

test('retained header readback adapter: finite readonly RR and uncertain COMMIT never rollback or retry',async()=>{
 const{readRetainedHeaderWindow,HEADER_WINDOW_READBACK_SQL}=await import('./retained-transfer-header-ordered-consumer-20261025.mjs');
 for(const fail of[false,true]){const calls=[],releases=[];const client={async query(sql,params){calls.push({sql,params});if(fail&&sql==='COMMIT')throw Error('unknown readonly commit');return{rows:sql===HEADER_WINDOW_READBACK_SQL?[{ordinal:'1'}]:[]};},release(error){releases.push(error);}};
  const issued={pool:{async connect(){return client;}},runtime26:{async assertReady(actual,purpose){assert.equal(actual,client);assert.equal(purpose,'IMPORT_STAGE');}}};
  if(fail)await assert.rejects(readRetainedHeaderWindow(issued,[{source:w.sourceProjection.projection,header:w.typedProjection.projection}]),/unknown readonly commit/);
  else assert.deepEqual(await readRetainedHeaderWindow(issued,[{source:w.sourceProjection.projection,header:w.typedProjection.projection}]),[{ordinal:'1'}]);
  assert.deepEqual(calls.map(c=>c.sql),['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',HEADER_WINDOW_READBACK_SQL,'COMMIT']);assert.equal(releases.length,1);assert.equal(releases[0] instanceof Error,fail);
 }
});
