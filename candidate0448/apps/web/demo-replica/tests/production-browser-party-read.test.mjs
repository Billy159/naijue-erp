/** Actual preview JSON-line transport, synthetic data only. No PG, role grants, real credentials or business writes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {validateList,validateCandidates,validateDetail} from '../../src/parties/response-validation.ts';
const origin='https://synthetic-management.invalid';
async function fixture(t){
 const child=spawn(process.execPath,['--experimental-transform-types',fileURLToPath(new URL('./production-browser-fixture.mjs',import.meta.url))],{stdio:['pipe','pipe','pipe']});
 const lines=createInterface({input:child.stdout,crlfDelay:Infinity}),waiting=[];let failed=false;
 const terminate=()=>{failed=true;for(const waiter of waiting.splice(0))waiter.reject(new Error('Preview bridge stopped'));};
 child.stderr.resume();child.once('error',terminate);child.once('exit',terminate);
 lines.on('line',line=>{const waiter=waiting.shift();if(!waiter)return terminate();try{waiter.resolve(JSON.parse(line));}catch{waiter.reject(new Error('Invalid preview envelope'));}});
 t.after(async()=>{const closed=once(child,'close');child.stdin.end();const timer=setTimeout(()=>child.kill('SIGTERM'),1500);try{await closed;}finally{clearTimeout(timer);lines.close();}});
 return async(path,method='GET',body)=>{
  if(failed)throw new Error('Preview bridge unavailable');
  let timer;const response=new Promise((resolve,reject)=>{waiting.push({resolve,reject});timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('Preview bridge response deadline'));},5000);});
  child.stdin.write(JSON.stringify({url:path.startsWith('https:')?path:origin+path,method,headers:{},...(body===undefined?{}:{body:JSON.stringify(body)})})+'\n');
  try{return await response;}finally{clearTimeout(timer);}
 };
}
for(const [path,kind]of [['customers','CUSTOMER'],['suppliers','SUPPLIER']])test(`preview outer bridge forwards finite GET ${path} list/candidates/detail without changing readonly semantics`,{timeout:15000},async t=>{
 const request=await fixture(t),list=await request(`/api/${path}?search=&enabled=ALL&page=1&pageSize=20`);
 assert.equal(list.status,200,list.body);assert.equal(list.headers['cache-control'],'no-store');
 const query={search:'',enabled:'ALL',page:1,pageSize:20},page=validateList(JSON.parse(list.body),query);
 assert.equal(page.page,1);assert.equal(page.pageSize,20);assert.ok(page.total>0);assert.ok(page.items.length>0);
 const candidates=await request(`/api/${path}/candidates?search=&page=1&pageSize=20`);assert.equal(candidates.status,200,candidates.body);
 const candidatePage=validateCandidates(JSON.parse(candidates.body),{search:'',page:1,pageSize:20});
 const enabled=await request(`/api/${path}?search=&enabled=ENABLED&page=1&pageSize=20`);assert.equal(enabled.status,200,enabled.body);
 const enabledPage=validateList(JSON.parse(enabled.body),{...query,enabled:'ENABLED'});
 assert.deepEqual(candidatePage.items,enabledPage.items.map(({id,code,name})=>({id,code,name}))); // Candidates are exact three-field enabled references, not records with kind/enabled.
 const record=page.items[0],detail=await request(`/api/${path}/${record.id}`);assert.equal(detail.status,200,detail.body);assert.deepEqual(validateDetail(JSON.parse(detail.body),record.id),record);
 const invalid=await request(`/api/${path}?role=ADMIN`);assert.equal(invalid.status,400,invalid.body); // Original query validation, no fabricated success.
});
test('preview finite party GET addition cannot open commands receipts unknown routes or foreign origins',{timeout:15000},async t=>{
 const request=await fixture(t);
 for(const [path,method]of [
  ['/api/customers/commands','POST'],['/api/suppliers/commands','POST'],
  ['/api/customers/receipts/unknown','GET'],['/api/suppliers/receipts/unknown','GET'],
  ['/api/customers/not-an-id','GET'],['/api/customers/------------------------------------','GET'],
  ['/api/customers/00000000-0000-4000-8000-000000910000/extra','GET'],['/api/not-a-party','GET'],
  ['https://other.invalid/api/customers','GET']
 ]){const response=await request(path,method,method==='POST'?{action:'CREATE',name:'MUST_NOT_WRITE'}:undefined);assert.equal(response.status,501,response.body);assert.equal(JSON.parse(response.body).error,'SYNTHETIC_READ_ONLY');}
});
