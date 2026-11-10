import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {validateFresh35Admin154Record,describeFresh35Admin154Record,ADMIN154_PREDECESSOR_RECORD_SHA256,ADMIN154_PREDECESSOR_SOURCE_SHA256,ADMIN154_PATCH_SHA256} from '../scripts/release/unified-install/fresh35-admin154-record-v1.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
function specimen(){
 const expected={predecessor:{recordSha256:ADMIN154_PREDECESSOR_RECORD_SHA256,sourceSetSha256:ADMIN154_PREDECESSOR_SOURCE_SHA256,programSha256:'1'.repeat(64),catalogSha256:'2'.repeat(64),targetSha256:'3'.repeat(64)},
  successor:{patchSqlSha256:ADMIN154_PATCH_SHA256,sourceSetSha256:'4'.repeat(64),catalogSpecSha256:'5'.repeat(64),modelSha256:'6'.repeat(64)},
  physical:{systemIdentifier:'7703999999999999999',databaseOid:'42',database:'SYNTHETIC_MODEL_ONLY',serverVersionNum:'170011',postmasterStart:'2026-11-11 01:00:00.123456+00'},owner:'SYNTHETIC_OWNER'};
 const value={format:'FRESH35_A53_ADMIN154_SUCCESSOR_RECORD_V1',predecessor:structuredClone(expected.predecessor),successor:{...expected.successor,catalogSha256:'7'.repeat(64)},physical:structuredClone(expected.physical),
  transactionReceipt:{nonce:'8'.repeat(48),database:expected.physical.database,actor:expected.owner,transactionId:'123',backendPid:123},appliedAt:'2026-11-11T01:00:01.000001Z',authorizationSha256:'9'.repeat(64)};
 return {expected,value};
}
test('record preserves the real predecessor while separately binding the exact new source/model/epoch and native receipt',()=>{
 const {expected,value}=specimen(),parsed=validateFresh35Admin154Record(value,expected);assert.deepEqual(parsed,value);assert(Object.isFrozen(parsed.successor));
 const previous=structuredClone(value);previous.physical.postmasterStart='2026-11-11 01:00:00.123455+00';
 assert.equal(validateFresh35Admin154Record(previous,expected).physical.postmasterStart,previous.physical.postmasterStart,'a later service epoch preserves the exact earlier DDL witness');
 assert.throws(()=>describeFresh35Admin154Record(parsed),/PROTECTED_RECORD_REQUIRED/,'parsed JSON is not a loaded protected record');
 for(const mutate of [
  x=>x.predecessor.recordSha256='0'.repeat(64),x=>x.predecessor.sourceSetSha256='0'.repeat(64),x=>x.predecessor.catalogSha256='0'.repeat(64),
  x=>x.successor.patchSqlSha256='0'.repeat(64),x=>x.successor.sourceSetSha256='0'.repeat(64),x=>x.successor.catalogSpecSha256='0'.repeat(64),x=>x.successor.modelSha256='0'.repeat(64),
  x=>x.physical.postmasterStart='2026-11-11 01:00:00.123457+00',x=>x.physical.databaseOid='43',
  x=>x.transactionReceipt.actor='SYNTHETIC_OTHER',x=>x.transactionReceipt.backendPid=0,x=>x.successor.publicExecute=true,x=>x.format='FRESH35_COMBINED_INSTALLATION_RECORD_V2',
 ]){const bad=structuredClone(value);mutate(bad);assert.throws(()=>validateFresh35Admin154Record(bad,expected),/FRESH35_ADMIN154_/);}
});
// Model only OS ownership/path policy. JSON parsing, exact comparisons and
// native file identities/replace detection are the actual production functions.
async function protectedModel(){
 const dir=await mkdtemp(join(tmpdir(),'admin154-protected-model-')),record=join(dir,'record.json'),auth=join(dir,'auth.json');
 const url=new URL('../scripts/release/unified-install/fresh35-admin154-record-v1.mjs',import.meta.url);
 let text=await readFile(url,'utf8');
 const stub=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
 const io=stub("import * as fs from 'node:fs/promises';export const readFile=fs.readFile;const root=s=>Object.create(s,{uid:{value:0n}});export async function lstat(p,o){return root(await fs.lstat(p,o))}export async function open(p,f){const h=await fs.open(p,f);return{stat:async o=>root(await h.stat(o)),readFile:(...a)=>h.readFile(...a),close:()=>h.close()}} ");
 text=text.replace("'node:fs/promises'",JSON.stringify(io)).replace("'./trusted-install-path.mjs'",JSON.stringify(stub('export async function assertTrustedRootPath(){}')));
 text=text.replace(/export const ADMIN154_RECORD_PATH=.*?;/,'export const ADMIN154_RECORD_PATH='+JSON.stringify(record)+';')
  .replace(/export const ADMIN154_AUTHORIZATION_PATH=.*?;/,'export const ADMIN154_AUTHORIZATION_PATH='+JSON.stringify(auth)+';');
 text=text.replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g,(_m,_q,p)=>'from '+JSON.stringify(new URL(p,url).href));
 return {api:await import(stub(text)),record,auth,close:()=>rm(dir,{recursive:true,force:true})};
}
test('fixed protected loading refuses digest/record replacement and separate operation authorities cannot be interchanged',async()=>{
 const m=await protectedModel();try{
  const {value,expected}=specimen(),bytes=JSON.stringify(value)+'\n';await writeFile(m.record,bytes,{mode:0o644});
  const token=await m.api.loadFresh35Admin154Record(expected,hash(bytes));assert.equal(m.api.describeFresh35Admin154Record(token).sha256,hash(bytes));
  await assert.rejects(m.api.loadFresh35Admin154Record(expected,'0'.repeat(64)),/RECORD_SHA_DIFFERS/);
  const binding={format:'SYNTHETIC_EXACT_SETUP_BINDING',initializerSha256:'a'.repeat(64)},deadline=Date.now()+60000;
  const authority={format:'FRESH35_A53_ADMIN154_EXECUTION_AUTHORIZATION_V1',decision:'AUTHORIZE_EXACT_ADMIN_PROVISION_ONLY',binding,startsAt:Date.now()-1000,expiresAt:deadline-1000,independentSafetyReviewSha256:'b'.repeat(64),authorizationReference:'SYNTHETIC MODEL ONLY'};
  await writeFile(m.auth,JSON.stringify(authority),{mode:0o644});
  const a=await m.api.loadFresh35Admin154Authorization(binding,'ADMIN_PROVISION_ONLY',deadline);await m.api.assertFresh35Admin154AuthorizationCurrent(a);
  await assert.rejects(m.api.loadFresh35Admin154Authorization(binding,'FIRST_REAL_BUSINESS_IMPORT',deadline),/EXACT_OPERATION_AUTHORIZATION_REQUIRED/);
  await assert.rejects(m.api.loadFresh35Admin154Authorization({...binding,initializerSha256:'c'.repeat(64)},'ADMIN_PROVISION_ONLY',deadline),/EXACT_OPERATION_AUTHORIZATION_REQUIRED/);
  await assert.rejects(m.api.loadFresh35Admin154Authorization(binding,'ADMIN_PROVISION_ONLY',authority.expiresAt-1),/AUTHORIZATION_WINDOW/);
  await writeFile(m.auth,JSON.stringify({...authority,authorizationReference:'CHANGED MODEL'}));await assert.rejects(m.api.assertFresh35Admin154AuthorizationCurrent(a),/EVIDENCE_CHANGED/);
  await writeFile(m.record,bytes+' ');await assert.rejects(m.api.assertFresh35Admin154RecordCurrent(token),/EVIDENCE_CHANGED/);
 }finally{await m.close();}
});
