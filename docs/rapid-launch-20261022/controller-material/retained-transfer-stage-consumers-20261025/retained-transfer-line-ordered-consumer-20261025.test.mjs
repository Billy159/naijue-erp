// Synthetic retained-line protocol only. No real source/factory, database, privileges or server.
import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{runRetainedTransferLines,openRetainedTransferLineFiles,readRetainedLineWindow,LINE_WINDOW_READBACK_SQL}from'./retained-transfer-line-ordered-consumer-20261025.mjs';
import * as staging from'/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022/packages/application/src/import-v3-history-staging.ts';
import{historyClosureProjectionRow26}from'/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022/packages/application/src/history-typed-closure.ts';
import{transferLineSourceEvidence26}from'/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022/scripts/import-v3/native-transfer-line-source26.mjs';
import{PackedLineIndex}from'./transfer-final-document-join1/join-core.mjs';
const source={...staging,historyClosureProjectionRow26,transferLineSourceEvidence26},id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`,hash='a'.repeat(64),sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture({count=3,existing=false,missingParent=false,missingAlias=false,corrupt=false,unknown=false,applyUnknown=false,journalFail=false,mutate=false,wide=false}={}){
 const binding={batchId:id(1),fixedSourceNamespace:'SYNTHETIC-retained-transfer-lines',selectionSha256:hash};
 const selection={baseManifestSha256:hash,selectionSha256:hash,approvalSha256:hash,entity:'TRANSFER_LINE',source:'BASE_V2',path:'business/17历史调拨明细.csv',csvSha256:hash};
 const documents=[0,1].map(n=>({kind:'TRANSFER',sourceKey:`parent${n}`,headerSourceRowId:id(900000+n),headerId:id(800000+n)}));
 const packed=new PackedLineIndex(count,documents),parts={source:[],typed:[]},sizes={source:0,typed:0},prepared=[],fold=createHash('sha256');
 for(let n=0;n<count;n++){
  const d=documents[n%2],normalizedFields={'来源编号':`line${n}`,'单据来源编号':d.sourceKey,'原行号':String(n+1),'SKU来源编号':'canonical3','原数量':n%2?'3':'-2','原款号':'0007','原品名':wide?'x'.repeat(60000):'','原颜色名称':'','原版型名称':'','原完整尺码':'','原使用条码':'000099'};
  const input={source:{id:id(100+n),batchId:id(1),entityType:'TRANSFER_LINE',sourceKey:`line${n}`,fileRef:'SYNTHETIC.xlsx',sheet:'rows',rowNo:String(n+2),sourceFileSha256:hash,rowSha256:hash,rawFields:{...normalizedFields,'SKU来源编号':'old3'},normalizedFields,fieldProvenance:{schema_version:1,fields:{quantity:{origin:'ORIGINAL',reason:'literal original signed quantity',raw:normalizedFields['原数量']}}}},header:{sourceKey:d.sourceKey,nativeId:d.headerId},sku:{sourceKey:'canonical3',nativeId:id(4)}};
  const p=source.prepareV3HistoryChunk({batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selection,rows:[input]}).rows[0];prepared.push(p);fold.update(p.fingerprint+'\n');
  const s=historyClosureProjectionRow26('import_source_row',transferLineSourceEvidence26(p,selection)),t=historyClosureProjectionRow26('history_transfer_line',p.line),refs=[];
  for(const[role,value]of[['source',s],['typed',t]]){const bytes=Buffer.from(JSON.stringify(value)+'\n');refs.push({offset:sizes[role],bytes:bytes.length,sha256:sha(bytes)});parts[role].push(bytes);sizes[role]+=bytes.length;}
  packed.add(s,t,...refs);
 }
 packed.seal();const indexParts=[];await packed.write({async append(b){indexParts.push(Buffer.from(b));},async finish(){return{};}},()=>{});packed.clear();
 const blobs={index:Buffer.concat(indexParts),source:Buffer.concat(parts.source),typed:Buffer.concat(parts.typed)};
 const scope={binding,rows:count,parents:2,chunks:wide?2:Math.ceil(count/200),preparedFingerprintStreamSha256:fold.digest('hex'),...Object.fromEntries(Object.entries(blobs).map(([k,b])=>[k,{bytes:b.length,sha256:sha(b)}]))};
 const stored=new Set(existing?[prepared[0].source.id]:[]),calls=[],events=[];let writes=0,closed=0,grantClosed=0,indexReads=0;
 const options={source,scope,executionInput:{executionEnabled:true,action:'TRANSFER_LINE_RETAINED_ORIGINAL_STAGE_ONLY',writerSourceCommit:'b'.repeat(40)},
 retained:{async verifyIndex(){indexReads++;assert.equal(sha(blobs.index),scope.index.sha256);},async verify(){},async readRange(role,offset,bytes){const b=Buffer.from(blobs[role].subarray(offset,offset+bytes));if(corrupt&&role==='source')b[0]^=1;return b;},async close(){closed++;}},
 authority:{async verifyInputs(){},async assertExecutionAllowed(){},async authorizeStep(step){if(mutate)step.payload.rows[0].line.quantity='999';},async close(){grantClosed++;}},
 store:{async stage(chunk){writes++;source.validatePreparedHistoryChunk(chunk);calls.push(chunk.rows.map(r=>r.source.sourceKey));let inserted=0,replayed=0;
  if(unknown&&!applyUnknown)throw Error('unconfirmed commit');for(const r of chunk.rows){if(stored.has(r.source.id))replayed++;else{inserted++;stored.add(r.source.id);}}if(unknown)throw Error('unconfirmed commit');return{inserted,replayed};}},
 async readbackWindow(expected){return expected.map((e,i)=>{assert.ok(documents.some(d=>d.headerId===e.line.header_id&&d.headerSourceRowId===e.parentSourceRowId&&d.sourceKey===e.parentSourceKey));const yes=stored.has(e.source.id);return{ordinal:String(i+1),source_id:yes?e.source.id:null,line_id:yes?e.line.id:null,source_candidates:yes?'1':'0',source_equal:yes,line_equal:yes,parent_binding_match:!missingParent,sku_alias_match:!missingAlias};});},
 async recordProgress(e){events.push(e);if(journalFail&&e.event==='TRANSFER_LINE_CHUNK_COMMIT_RETURNED')throw Error('private fsync failure');}};
 return{options,prepared,calls,events,blobs,counts:()=>({writes,closed,grantClosed,indexReads})};
}
test('retained line consumer: original201 rows preserve200+1 chunks, exact replay, parent identities and old aliases',async()=>{
 const f=await fixture({count:201,existing:true}),r=await runRetainedTransferLines(f.options);assert.equal(r.status,'COMPLETE_ORIGINAL_TRANSFER_LINES_STAGE_AND_PER_CHUNK_RR_READBACK_NOT_PUBLICATION');assert.equal(r.inserted,200);assert.equal(r.replayed,1);assert.equal(r.readbackConfirmedRows,201);assert.deepEqual(f.calls.map(c=>c.length),[200,1]);assert.deepEqual(f.calls.flat(),f.prepared.map(p=>p.source.sourceKey));assert.equal(f.events[0].keys[0].oldSkuSourceId,'old3');assert.equal(f.events[0].keys[1].headerId,id(800001));assert.equal(f.events[0].keys[1].parentSourceRowId,id(900001));assert.deepEqual(f.counts(),{writes:2,closed:1,grantClosed:1,indexReads:1});
});
test('retained line consumer: actual parent or alias absence, changed retained range and source grant mutation stop before writes',async()=>{
 for(const flags of[{missingParent:true},{missingAlias:true},{corrupt:true},{mutate:true}]){const f=await fixture(flags),r=await runRetainedTransferLines(f.options);assert.equal(r.status,'STOPPED_PRESERVE_RETURNED_COMMITS_NO_RETRY');assert.equal(f.counts().writes,0);assert.equal(f.counts().closed,1);assert.equal(f.counts().grantClosed,1);}
});
test('retained line consumer: uncertain original chunk commit retains every parent/source/alias key without retry',async()=>{
 for(const applyUnknown of[false,true]){const f=await fixture({unknown:true,applyUnknown}),r=await runRetainedTransferLines(f.options);assert.equal(r.status,'STOPPED_CURRENT_ORIGINAL_CHUNK_OUTCOME_UNKNOWN_NO_RETRY');assert.equal(r.current.commitReturned,false);assert.equal(r.current.keys.length,3);assert.equal(r.current.firstIndex,0);assert.equal(r.current.lastIndex,2);assert.equal(r.commitReturnedRows,0);assert.equal(r.readbackConfirmedRows,0);assert.equal(f.counts().writes,1);}
});
test('retained line consumer: returned commit with journal failure is preserved and not called absent',async()=>{
 const f=await fixture({journalFail:true}),r=await runRetainedTransferLines(f.options);assert.equal(r.current.commitReturned,true);assert.equal(r.commitReturnedRows,3);assert.equal(r.inserted,3);assert.equal(r.readbackConfirmedRows,0);assert.equal(f.counts().writes,1);
});
test('retained line consumer: disabled draft and wrong packed metadata reject before stage',async()=>{
 const f=await fixture();f.options.executionInput.executionEnabled=false;let r=await runRetainedTransferLines(f.options);assert.equal(r.firstError.code,'LINE_T45_FIXED_ENABLED_INPUT_REQUIRED');assert.equal(f.counts().indexReads,0);assert.equal(f.counts().writes,0);
 const g=await fixture();g.options.scope.index.bytes++;r=await runRetainedTransferLines(g.options);assert.equal(r.firstError.code,'LINE_PACKED_INDEX_BYTES');assert.equal(g.counts().writes,0);
});
test('retained line file adapter: bounded authenticated private index and ranges reject file drift',async()=>{
 const{mkdtemp,writeFile,rm}=await import('node:fs/promises'),{join}=await import('node:path'),{fileURLToPath}=await import('node:url');const f=await fixture(),dir=await mkdtemp(fileURLToPath(new URL('./line-consumer-private-fixture-',import.meta.url)));let retained;
 try{const refs={};for(const[role,b]of Object.entries(f.blobs)){const path=join(dir,role);await writeFile(path,b,{mode:0o600});refs[role]={path,bytes:b.length,sha256:sha(b)};}
  retained=await openRetainedTransferLineFiles(refs);await retained.verifyIndex();assert.deepEqual(await retained.readRange('source',0,12),f.blobs.source.subarray(0,12));await writeFile(refs.typed.path,'changed');await assert.rejects(retained.verify(),e=>e.code==='LINE_RETAINED_FILE_CHANGED');await retained.close();
 }finally{await retained?.close();await rm(dir,{recursive:true});}
});
test('retained line readback: original-parent-source and alias filters are finite readonly and uncertain COMMIT does not retry',async()=>{
 assert.ok(LINE_WINDOW_READBACK_SQL.includes("hs.id=(e.facts->>'parentSourceRowId')::uuid"));assert.ok(LINE_WINDOW_READBACK_SQL.includes("a.old_source_sku_id=e.facts->>'oldSkuSourceId'"));
 for(const fail of[false,true]){const calls=[],released=[];const client={async query(sql){calls.push(sql);if(fail&&sql==='COMMIT')throw Error('commit unknown');return{rows:[]};},release(e){released.push(e);}};
  const issued={pool:{async connect(){return client;}},runtime26:{async assertReady(c,purpose){assert.equal(c,client);assert.equal(purpose,'IMPORT_STAGE');}}};
  if(fail)await assert.rejects(readRetainedLineWindow(issued,[{}]),/commit unknown/);else assert.deepEqual(await readRetainedLineWindow(issued,[{}]),[]);
  assert.deepEqual(calls,['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',LINE_WINDOW_READBACK_SQL,'COMMIT']);assert.equal(released.length,1);assert.equal(released[0] instanceof Error,fail);
 }
});

test('retained line consumer: original4MiB input budget splits wide rows below200 without trimming snapshots',async()=>{
 const f=await fixture({count:40,wide:true}),r=await runRetainedTransferLines(f.options);
 assert.equal(r.status,'COMPLETE_ORIGINAL_TRANSFER_LINES_STAGE_AND_PER_CHUNK_RR_READBACK_NOT_PUBLICATION');assert.equal(r.readbackConfirmedRows,40);assert.equal(f.calls.length,2);assert.ok(f.calls[0].length<200);assert.equal(f.calls.flat().length,40);assert.equal(f.prepared[0].line.product_name_snapshot.length,60000);
});
