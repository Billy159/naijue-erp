import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createOutputJob,getOutputJob,outputJobStaleAfterMs,sweepStaleOutputJobs,updateOutputJob} from '../server/domain/outputs/jobs.ts';
import {cleanupStaleStreamingWorkbookSpools,createStreamingWorkbook,outputSpoolStaleAfterMs} from '../frontend/export-workbook-stream.js';

class MemoryFile {
  constructor(){this.kind='file';this.value='';this.lastModified=Date.now();}
  async createWritable(){
    this.value='';
    return {
      write:async chunk=>{this.value+=typeof chunk==='string'?chunk:new TextDecoder().decode(chunk);this.lastModified=Date.now();},
      close:async()=>{},
      abort:async()=>{this.value='';this.lastModified=Date.now();},
    };
  }
  async getFile(){return {lastModified:this.lastModified,text:async()=>this.value,stream:()=>new Blob([this.value]).stream()};}
}

class MemoryDirectory {
  constructor(){this.kind='directory';this.children=new Map();}
  async getDirectoryHandle(name,{create=false}={}){
    let entry=this.children.get(name);
    if(!entry&&create){entry=new MemoryDirectory();this.children.set(name,entry);}
    if(!entry||entry.kind!=='directory')throw Object.assign(new Error('not found'),{name:'NotFoundError'});
    return entry;
  }
  async getFileHandle(name,{create=false}={}){
    let entry=this.children.get(name);
    if(!entry&&create){entry=new MemoryFile();this.children.set(name,entry);}
    if(!entry||entry.kind!=='file')throw Object.assign(new Error('not found'),{name:'NotFoundError'});
    return entry;
  }
  async removeEntry(name){if(!this.children.has(name))throw Object.assign(new Error('not found'),{name:'NotFoundError'});this.children.delete(name);}
  async *entries(){for(const item of this.children.entries())yield item;}
}

async function writeFile(directory,name,value){
  const file=await directory.getFileHandle(name,{create:true}),writer=await file.createWritable();
  await writer.write(value);await writer.close();return file;
}

test('T27 interrupted export becomes failed within lease bound and stale OPFS spool is reclaimed',async()=>{
  const actor='t27-recovery-'+randomUUID(),taskId=randomUUID(),createdAt=Date.now()-outputJobStaleAfterMs-1000;
  createOutputJob(actor,{taskId,kind:'ledger',totalUnits:400},createdAt);
  updateOutputJob(actor,taskId,{completedUnits:100,phase:'分批写入',status:'running'},createdAt+1);
  assert.equal(getOutputJob(actor,taskId,createdAt+outputJobStaleAfterMs).status,'running');
  assert.equal(sweepStaleOutputJobs(createdAt+outputJobStaleAfterMs+1),1);
  const staleJob=getOutputJob(actor,taskId,createdAt+outputJobStaleAfterMs+1);
  assert.equal(staleJob.status,'failed');
  assert.equal(staleJob.phase,'任务中断，已超时结束');
  assert.match(staleJob.error,/5 分钟/);
  assert.equal(getOutputJob(actor,taskId,createdAt+outputJobStaleAfterMs+2).status,'failed');

  const root=new MemoryDirectory(),storage={getDirectory:async()=>root};
  const parent=await root.getDirectoryHandle('t27-output-spools',{create:true});
  const abandonedId=randomUUID(),activeId=randomUUID(),legacyId=randomUUID();
  const saveHandle={createWritable:async()=>{throw new Error('finish must not run in this interruption simulation');}};
  const abandoned=await createStreamingWorkbook({taskId:abandonedId,sheets:[{name:'流水',headers:['流水 ID']}],saveHandle,storage});
  await abandoned.append(0,[['partial-1'],['partial-2']]);
  // Simulate abrupt page termination: deliberately call neither finish nor abort.
  const abandonedDir=await parent.getDirectoryHandle(abandonedId);
  const staleLease=JSON.parse(await (await abandonedDir.getFileHandle('lease.json')).getFile().then(file=>file.text()));
  await writeFile(abandonedDir,'lease.json',JSON.stringify({...staleLease,lastTouchedAt:Date.now()-outputSpoolStaleAfterMs-1}));

  const active=await createStreamingWorkbook({taskId:activeId,sheets:[{name:'流水',headers:['流水 ID']}],saveHandle,storage});
  await active.append(0,[['still-active']]);

  const legacyDir=await parent.getDirectoryHandle(legacyId,{create:true});
  const legacySheet=await writeFile(legacyDir,'sheet-1.xml','<partial-workbook/>');
  legacySheet.lastModified=Date.now()-outputSpoolStaleAfterMs-1;

  const finalUserWorkbook='completed user workbook bytes';
  const removed=await cleanupStaleStreamingWorkbookSpools({storage,now:Date.now(),staleAfterMs:outputSpoolStaleAfterMs});
  assert.deepEqual(new Set(removed),new Set([abandonedId,legacyId]));
  assert.equal(parent.children.has(abandonedId),false);
  assert.equal(parent.children.has(legacyId),false);
  assert.equal(parent.children.has(activeId),true);
  assert.equal(finalUserWorkbook,'completed user workbook bytes','cleanup is limited to the OPFS spool tree');
});
