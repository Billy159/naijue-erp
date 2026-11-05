import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,access,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {inspectPackageDirectory} from '../tools/unified-import/package-reader.ts';
import {writeLargeSyntheticPackage} from './fixtures/unified-import/large-synthetic-package.mjs';

async function childPreflight(root,report,pin){
 const command=`import {streamPreflight} from './tools/unified-import/stream-preflight.mjs';const start=performance.now();const r=await streamPreflight(process.argv[1],process.argv[2],{expectedManifestSha256:process.argv[3],allowSynthetic:true});console.log(JSON.stringify({result:r,elapsed_ms:performance.now()-start,heap:process.memoryUsage().heapUsed,rss:process.memoryUsage().rss}));`;
 const child=spawn(process.execPath,['--max-old-space-size=128','--input-type=module','-e',command,root,report,pin],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);const status=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});assert.equal(status,0,err);return JSON.parse(out.trim().split('\n').at(-1));
}

test('near-real complete synthetic package streams under bounded heap', {skip:process.env.RUN_WHOLE_SCALE!=='1'}, async()=>{
 const parent=await mkdtemp(join(tmpdir(),'whole-stream-'));try{
  const start=performance.now();const p=await writeLargeSyntheticPackage(join(parent,'package'));const generateMs=performance.now()-start;
  assert.deepEqual(Object.fromEntries(['sales_header','sales_line','sales_settlement','transfer_header','transfer_line','inventory_baseline','product'].map(k=>[k,p.counts[k]])),{sales_header:28894,sales_line:83399,sales_settlement:26382,transfer_header:14835,transfer_line:273948,inventory_baseline:42227,product:2970});
  const metric=await childPreflight(join(parent,'package'),join(parent,'report'),p.manifestSha256);assert.equal(metric.result.issue_count,0);assert.equal(metric.result.checks_passed,true);assert.equal(metric.result.complete_package_validation,true);assert.equal(metric.result.import_eligible,false);for(const [k,v] of Object.entries(p.counts))assert.equal(metric.result.counts[k],v,k);
  console.log(JSON.stringify({synthetic_only:true,generated_bytes:p.bytes,generate_ms:generateMs,preflight_ms:metric.elapsed_ms,heap_bytes:metric.heap,rss_bytes:metric.rss,peak_rss_bytes:metric.result.peak_rss_bytes,index_bytes:metric.result.index_bytes,timings_ms:metric.result.timings_ms}));
  if(process.env.SCALE_COORD_PATH){const marker=process.env.SCALE_COORD_PATH;await writeFile(marker,JSON.stringify({synthetic_only:true,package:join(parent,'package'),report:join(parent,'report'),manifest_sha256:p.manifestSha256,metrics:metric.result}),{flag:'wx',mode:0o600});for(;;){try{await access(marker+'.done');break;}catch{}await new Promise(r=>setTimeout(r,1000));}}
 }catch(error){if(process.env.SCALE_COORD_PATH)try{await writeFile(process.env.SCALE_COORD_PATH,JSON.stringify({synthetic_only:true,package:join(parent,'package'),report:join(parent,'report'),state:'FAILED_PRESERVED'}),{flag:'wx',mode:0o600});}catch{}throw error;}finally{let release=!process.env.SCALE_COORD_PATH;if(!release)try{await access(process.env.SCALE_COORD_PATH+'.done');release=true;}catch{}if(release)await rm(parent,{recursive:true,force:true});}
});

test('small deterministic workload validates before large run',async()=>{
 const parent=await mkdtemp(join(tmpdir(),'whole-stream-smoke-'));try {const p=await writeLargeSyntheticPackage(join(parent,'package'),{scale:'smoke'});const original=await inspectPackageDirectory(join(parent,'package'),{expectedManifestSha256:p.manifestSha256,allowSynthetic:true});assert.equal(original.valid,true,JSON.stringify(original.issues));const result=(await childPreflight(join(parent,'package'),join(parent,'report'),p.manifestSha256)).result;if(result.issue_count){const {readFile}=await import('node:fs/promises');throw Error(await readFile(join(parent,'report/issues.jsonl'),'utf8'));}assert.equal(result.checks_passed,true);assert.equal(result.counts.sales_line,29);assert.equal(result.counts.transfer_line,31);assert.equal(result.counts.color,20);assert.equal(result.counts.fit,8);assert.equal(result.counts.size,12);const rows=(await readFile(join(parent,'package/sales_line.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert(rows.some(r=>r.fields.quantity.startsWith('-')));assert(rows.some(r=>!r.fields.quantity.startsWith('-')));assert(new Set(rows.map(r=>r.fields.product_name_snapshot.length)).size>1);assert(new Set(rows.map(r=>r.fields.sku_id)).size>1);}finally{await rm(parent,{recursive:true,force:true});}
});
