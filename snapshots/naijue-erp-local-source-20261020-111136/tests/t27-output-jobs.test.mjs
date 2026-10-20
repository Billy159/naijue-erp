import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createOutputJob,getOutputJob,updateOutputJob} from '../server/domain/outputs/jobs.ts';

const id=()=>randomUUID();

test('T27 export jobs expose monotonic progress and allow the transport request key',()=>{
  const actor='t27-job-owner',taskId=id(),created=createOutputJob(actor,{taskId,kind:'ledger',totalUnits:500},Date.now());
  assert.equal(created.status,'queued');assert.equal(created.totalUnits,500);
  const progress=updateOutputJob(actor,taskId,{requestKey:id(),completedUnits:100,phase:'分页写入',status:'running',rows:{sheet1:100}},Date.now()+1);
  assert.equal(progress.completedUnits,100);assert.equal(progress.rows.sheet1,100);
  assert.throws(()=>updateOutputJob(actor,taskId,{completedUnits:99,phase:'回退',status:'running'},Date.now()+2),error=>error.code==='VALIDATION');
  const completed=updateOutputJob(actor,taskId,{completedUnits:500,phase:'完成校验',status:'completed',rows:{sheet1:501}},Date.now()+3);
  assert.equal(completed.status,'completed');assert.equal(getOutputJob(actor,taskId).rows.sheet1,501);
  assert.throws(()=>updateOutputJob(actor,taskId,{completedUnits:500,phase:'重复',status:'running'},Date.now()+4),error=>error.code==='EXPORT_JOB_FINAL');
});

test('T27 export job identifiers do not reveal progress across authenticated actors',()=>{
  const owner='t27-owner-'+id(),other='t27-other-'+id(),taskId=id();
  createOutputJob(owner,{taskId,kind:'documents',totalUnits:25},Date.now());
  assert.throws(()=>getOutputJob(other,taskId),error=>error.code==='NOT_FOUND'&&error.statusCode===404);
  assert.throws(()=>updateOutputJob(other,taskId,{completedUnits:1,phase:'探测',status:'running'},Date.now()+1),error=>error.code==='NOT_FOUND');
  assert.throws(()=>createOutputJob(other,{taskId,kind:'documents',totalUnits:25},Date.now()+2),error=>error.code==='SCOPE');
});
