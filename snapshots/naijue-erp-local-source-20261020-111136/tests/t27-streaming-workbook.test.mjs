import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,open,readFile,rm,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {tmpdir} from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import {createStreamingWorkbook} from '../frontend/export-workbook-stream.js';

function byteView(value){return typeof value==='string'?Buffer.from(value):Buffer.from(value.buffer,value.byteOffset,value.byteLength);}
function directoryHandle(root,metrics){
  return {
    async getDirectoryHandle(name,{create}={}){const target=path.join(root,name);if(create)await mkdir(target,{recursive:true});return directoryHandle(target,metrics);},
    async getFileHandle(name,{create}={}){const target=path.join(root,name);if(create){const handle=await open(target,'a');await handle.close();}return {
      async createWritable(){const handle=await open(target,'w'),kind=target.endsWith('.xlsx')?'output':'spool';return {
        async write(value){const bytes=byteView(value);metrics[kind].maxWriteBytes=Math.max(metrics[kind].maxWriteBytes,bytes.byteLength);metrics[kind].writes++;await handle.write(bytes);},
        async close(){await handle.close();},async abort(){await handle.close();try{await rm(target,{force:true});}catch{}},
      };},
      async getFile(){return {stream:()=>Readable.toWeb(createReadStream(target,{highWaterMark:64*1024}))};},
    };},
    async removeEntry(name,{recursive}={}){await rm(path.join(root,name),{recursive:!!recursive,force:true});},
  };
}

test('T27 large workbook writes a synthetic 50,000-row export in 25-row bounded disk batches',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'t27-export-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const metrics={spool:{writes:0,maxWriteBytes:0},output:{writes:0,maxWriteBytes:0}},storage={getDirectory:async()=>directoryHandle(root,metrics)};
  const taskId='t27-capacity-'+Date.now(),outputPath=path.join(root,'large.xlsx'),saveHandle={createWritable:async()=>directoryHandle(root,metrics).getFileHandle('large.xlsx',{create:true}).then(file=>file.createWritable())};
  const writer=await createStreamingWorkbook({taskId,sheets:[{name:'流水',headers:['流水 ID','业务日','商品码','SKU ID','数量','描述']}],saveHandle,storage});
  const before=process.memoryUsage().rss;let peak=before,written=0;
  for(let page=0;page<250;page++){
    const rows=Array.from({length:200},(_,index)=>{const n=page*200+index+1;return [`ledger-${n}`,'2026-10-04','000120',`sku-${n}`,String(n),'隔离样本🙂'.repeat(5)];});
    await writer.append(0,rows);written+=rows.length;
    if(page%5===0)peak=Math.max(peak,process.memoryUsage().rss);
  }
  assert.equal(written,50_000);assert.equal(writer.rowCounts[0],50_000);
  const finished=await writer.finish();peak=Math.max(peak,process.memoryUsage().rss);
  assert.deepEqual(finished,[50_000]);assert(metrics.spool.writes>=2000);assert(metrics.spool.maxWriteBytes<64*1024);
  const outputBytes=(await stat(outputPath)).size,afterWriteRss=process.memoryUsage().rss;
  const archive=await JSZip.loadAsync(await readFile(outputPath));
  const xml=await archive.file('xl/worksheets/sheet1.xml').async('string');
  assert.equal((xml.match(/<row r=/g)||[]).length,50_001);
  assert.match(xml,/000120/);assert.equal(await stat(path.join(root,'t27-output-spools',taskId)).then(()=>true,()=>false),false,'temporary spool directory should be removed after finish');
  assert.equal(metrics.output.writes>0,true);
  t.diagnostic(JSON.stringify({syntheticRows:written,workbookBytes:outputBytes,spoolWriteCalls:metrics.spool.writes,maxSpoolWriteBytes:metrics.spool.maxWriteBytes,
    maxOutputWriteBytes:metrics.output.maxWriteBytes,rssBeforeBytes:before,rssPeakDuringWriteBytes:peak,rssAfterWriteBytes:afterWriteRss,
    rowBatchLimit:25,inputPageLimit:200,completeRowCount:50_001,realDatabaseUsed:false,serverUsed:false}));
});
