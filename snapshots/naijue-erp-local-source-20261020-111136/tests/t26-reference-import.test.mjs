import test from 'node:test';
import assert from 'node:assert/strict';
import {createReferenceImportController} from '../frontend/reference-import-service.mjs';
const batch={batchId:'T26-TEST',source:{name:'synthetic',sha256:'a'.repeat(64)},rows:[{rowKey:'2',kind:'payments',payload:{id:'SYNTHETIC'}}]};
const preview={preflightHash:'h',rows:[{rowKey:'2',status:'READY'}]};
test('Lost response preserves original request; another confirm cannot replace its identity; recovery clears pending',async()=>{
 const calls=[],completed=[];let original;
 const client={pending:()=>[],request:async(path,input)=>{calls.push(path);if(path.endsWith('preflight'))return preview;original=input.requestKey;throw Object.assign(new Error('结果待核实'),{code:'PENDING_VERIFICATION',requestId:original});},result:async(id,op)=>{assert.equal(id,original);assert.equal(op,'imports.referenceCommit');return {resolution:'COMMITTED',originalResponse:{batchId:batch.batchId,rows:[{rowKey:'2',status:'COMMITTED'}]}};},complete:id=>completed.push(id)};
 const c=createReferenceImportController(client);c.load(batch);await c.preflight();await assert.rejects(c.confirm(),/结果待核实/);assert.equal(c.state.pendingId,original);
 await assert.rejects(c.confirm(),/先查询/);assert.equal(c.state.pendingId,original);assert.equal(calls.filter(p=>p.endsWith('commit')).length,1);
 await c.recover();assert.equal(c.state.pendingId,'');assert.equal(c.state.result.batchId,batch.batchId);assert.deepEqual(completed,[original]);
});
test('Stale preflight response clears confirmable rows while preserving uploaded data',async()=>{
 const c=createReferenceImportController({pending:()=>[],request:async path=>{if(path.endsWith('preflight'))return preview;throw Object.assign(new Error('重新预检'),{code:'PREFLIGHT_CHANGED'});}});
 c.load(batch);await c.preflight();await assert.rejects(c.confirm(),/重新预检/);assert.equal(c.state.preview,null);assert.deepEqual(c.state.selected,[]);assert.equal(c.state.batch,batch);assert.equal(c.state.pendingId,'');
});
test('Reload recovers persisted original request and keeps file replacement closed until resolution',()=>{
 const c=createReferenceImportController({pending:()=>[{requestId:'original',operationId:'imports.referenceCommit',objectId:batch.batchId}]});c.restorePending();assert.equal(c.state.pendingId,'original');assert.equal(c.state.queryBatchId,batch.batchId);assert.throws(()=>c.load(batch),/先查询/);
});
