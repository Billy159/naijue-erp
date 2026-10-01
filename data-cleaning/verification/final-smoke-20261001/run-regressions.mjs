import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=process.cwd(), backend=process.argv.includes('--backend'),code=readFileSync('server/run-tests.mjs','utf8');
if(backend&&!process.env.POSTGRES_DB?.startsWith('demo_8877_'))throw Error('Isolated database required');
const label=backend?'runtime':'frontend';
const list=JSON.parse('['+code.match(new RegExp('const '+label+'=\\[([^\\]]+)\\]'))[1].replaceAll("'",'"')+']');
const results=[];
for(const file of list){const t=Date.now(),r=spawnSync(process.execPath,[...(backend?['--import','tsx']:[]),resolve(backend?'server/runtime':'frontend/verification',file)],{cwd:root,env:process.env,encoding:'utf8',timeout:240000,maxBuffer:4*1024*1024});results.push({file,exit:r.status,seconds:(Date.now()-t)/1000,stdout:r.stdout,stderr:r.stderr,error:r.error?.message});console.log(r.status===0?'PASS':'FAIL',file);}
writeFileSync(resolve('data-cleaning/verification/final-smoke-20261001',backend?'backend-regressions.json':'frontend-regressions.json'),JSON.stringify(results,null,2)+'\n');
if(results.some(r=>r.exit!==0))process.exitCode=1;
