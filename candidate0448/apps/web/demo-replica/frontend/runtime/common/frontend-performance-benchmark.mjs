// Fixed synthetic Node benchmark. Not browser/API latency or a production performance acceptance.
import {performance} from 'node:perf_hooks';
import {mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {createOriginalWorkbook} from './original-workbook.ts';
import {BoundedReadPool,runBoundedReads} from '../../../../src/loading/bounded-read-pool.ts';
const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.pf01-baseline-'));
const baselineHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const rows=Array.from({length:1000},(_,i)=>Array.from({length:10},(_,j)=>j===0?String(i).padStart(7,'0'):`中文&${i}-${j}`));
const records=[];const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
try{
 const source=execFileSync('git',['show',baselineHead+':apps/web/demo-replica/frontend/runtime/common/original-workbook.ts'],{encoding:'utf8'});
 // esbuild only transpiles the exact exported baseline for this test; no application build.
 const {build}=await import('esbuild');await build({stdin:{contents:source,loader:'ts',resolveDir:here},outfile:path.join(temp,'baseline.mjs'),format:'esm',platform:'node',bundle:true,packages:'external'});const original=(await import(pathToFileURL(path.join(temp,'baseline.mjs')))).createOriginalWorkbook;
 for(const [name,mode]of [['baseline','baseline'],['bounded','new']])for(let round=0;round<30;round++){
  global.gc?.();const before=process.memoryUsage(),start=performance.now();let active=0,peak=0,requests=0;const sample={...before};
  const memory=()=>{const m=process.memoryUsage();for(const k of Object.keys(m))sample[k]=Math.max(sample[k],m[k]);};
  const request=async()=>{requests++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));memory();active--;return 1;};
  const signal=new AbortController().signal,pool=new BoundedReadPool();if(mode==='baseline')await Promise.all(Array.from({length:100},request));else await runBoundedReads(Array.from({length:100}),signal,(_x,_i,s)=>pool.read(s,request));const pasteMs=performance.now()-start;
  const skuStart=performance.now();if(mode==='baseline'){for(let i=0;i<50;i++)await request();}else await runBoundedReads(Array.from({length:50}),signal,(_x,_i,s)=>pool.read(s,request));const skuMs=performance.now()-skuStart;
  const exportStart=performance.now();const bytes=await (mode==='baseline'?original:createOriginalWorkbook)(rows,'同输入');memory();records.push({name,round,pasteMs,skuMs,exportMs:performance.now()-exportStart,requests,peak,zipBytes:bytes.byteLength,sample});
 }
 console.log(JSON.stringify({environment:{node:process.version,platform:process.platform,arch:process.arch,baselineHead,kind:'synthetic Node timers; baseline exact HEAD workbook; paste Promise.all and SKU sequential algorithms from source; not actual browser/HTTP; memory sampled at phase/request boundaries, not true transient peak'},input:{rounds:30,pasteCodes:100,skuPages:50,rows:1000,cells:10000},results:['baseline','bounded'].map(name=>{const set=records.filter(x=>x.name===name);return {name,paste:{p50:percentile(set.map(x=>x.pasteMs),.5),p95:percentile(set.map(x=>x.pasteMs),.95)},sku:{p50:percentile(set.map(x=>x.skuMs),.5),p95:percentile(set.map(x=>x.skuMs),.95)},export:{p50:percentile(set.map(x=>x.exportMs),.5),p95:percentile(set.map(x=>x.exportMs),.95)},requests:set[0].requests,maxConcurrency:Math.max(...set.map(x=>x.peak)),maxSampledMemory:Object.fromEntries(Object.keys(set[0].sample).map(k=>[k,Math.max(...set.map(x=>x.sample[k]))]))};}),raw:records},null,2));
}finally{await rm(temp,{recursive:true,force:true});}
