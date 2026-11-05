import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadFresh35CombinedRecordEnvelope,validateFresh35CombinedRecord,publishFresh35CombinedRecord} from '../scripts/release/unified-install/fresh35-combined-record-v1.mjs';
import {resolveFresh35ReferenceInputPaths,loadFresh35CombinedSource} from '../scripts/release/unified-install/fresh35-combined-source-v1.mjs';
import {bindFresh35CombinedTarget,describeFresh35CombinedTarget} from '../scripts/release/unified-install/fresh35-combined-target-v1.mjs';
import {buildFresh35CombinedCatalog} from '../scripts/release/unified-install/fresh35-combined-catalog-v1.mjs';
import {compileFresh35CombinedProgram,describeFresh35CombinedProgram} from '../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs';
import {openReviewedFresh35Host,verifyFresh35InstalledV1,consumeFresh35VerificationV1,fresh35HostContext} from '../tools/unified-import/fresh35-host-session.mjs';
import {withReviewedWholeSession,sameActiveWholeHostSession} from '../tools/unified-import/whole-host-session.mjs';
import {withVerifiedFresh35AdmissionV1,assertWholeSalesAdmissionV1} from '../scripts/release/unified-install/whole-sales-admission-v1.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const proof={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'7703999999999999999',database_oid:'16384',database_name:'synthetic_fresh35_20261105_r9',catalog_sha256:'a'.repeat(64)};
function client(){let status='I',closed=0;const calls=[];return {calls,get closed(){return closed},on(){},readyForQuery:true,_queryable:true,_ending:false,pipeline:false,_activeQuery:null,_queryQueue:[],_sentQueryQueue:[],getTransactionStatus(){return status},async query(sql){calls.push(sql);if(sql.startsWith('BEGIN')){status='T';return {command:'BEGIN'}}if(sql==='ROLLBACK'||sql==='COMMIT'){status='I';return {command:sql}}return {command:'SELECT'}},async end(){closed++}}}
let cached;async function binding(){return cached??=(async()=>{
 const startsAt=Date.now()-1000,expiresAt=startsAt+1200000;
 const target=bindFresh35CombinedTarget({proposal:{database:proof.database_name,owner:'fresh35_owner_20261105_r9',controller:'fresh35_controller_20261105_r9',runtime:'fresh35_runtime_20261105_r9',admin:'fresh35_admin_20261105_r9',host:'127.0.0.1',port:57639,workspaceDirectory:'/tmp/cloud-pg-fresh35-20261105-r9'},physical:{systemIdentifier:proof.system_identifier,databaseOid:proof.database_oid,serverVersionNum:'170011',postmasterStart:new Date(startsAt).toISOString().replace('T',' ').replace('Z','+00')},startsAt,expiresAt});
 const paths=await resolveFresh35ReferenceInputPaths(resolve(root,'../reference-inputs'));
 const source=await loadFresh35CombinedSource(root,paths),catalog=await buildFresh35CombinedCatalog(source,target,paths),program=await compileFresh35CombinedProgram({source,target,catalog}),d=describeFresh35CombinedProgram(program);
 const record={format:'FRESH35_COMBINED_INSTALLATION_RECORD_V1',installedAt:new Date().toISOString(),binding:{sourceSetSha256:d.sourceSetSha256,targetSha256:d.targetSha256},target:describeFresh35CombinedTarget(target),transactionReceipt:{nonce:'a'.repeat(48),database:proof.database_name,actor:'fresh35_owner_20261105_r9',transactionId:'123',backendPid:1234},programSha256:d.programSha256,catalogSpecSha256:d.catalogSha256,catalogSha256:proof.catalog_sha256,authorizationSha256:'b'.repeat(64),state:'COMMITTED_AND_CATALOG_CHECKED'};
 return {program,record,target};
 })()}
test('fixed record is required before configuration, any connection, or host work',async()=>{
 let accessed=false;const config=new Proxy({},{get(){accessed=true;throw Error('credentials must not be inspected')}});
 await assert.rejects(loadFresh35CombinedRecordEnvelope(),/FRESH35_PROTECTED_RECORD_REQUIRED|ORDINARY_RUNTIME_REQUIRED/);
 await assert.rejects(openReviewedFresh35Host(config,root,proof,()=>{accessed=true},{referenceDirectory:resolve(root,'../reference-inputs')}),/FRESH35_PROTECTED_RECORD_REQUIRED|ORDINARY_RUNTIME_REQUIRED/);
 assert.equal(accessed,false);
});
test('valid-looking record data checks exact source/program/physical receipt without granting authority',async()=>{
 const {record,program}=await binding();assert.equal(validateFresh35CombinedRecord(record,program).catalogSha256,proof.catalog_sha256);
 for(const mutate of [r=>r.target={...r.target,physical:{...r.target.physical,databaseOid:'16385'}},r=>r.programSha256='c'.repeat(64),r=>r.binding.sourceSetSha256='c'.repeat(64),r=>r.transactionReceipt.actor='postgres',r=>r.state='STAGED',r=>r.catalogSha256='invalid']){
  const r=structuredClone(record);mutate(r);assert.throws(()=>validateFresh35CombinedRecord(r,program),/FRESH35_COMBINED_RECORD_/);
 }
 assert.throws(()=>fresh35HostContext(record),/GENUINE_FIXED_CONTEXT_REQUIRED/);
 assert.throws(()=>consumeFresh35VerificationV1(record,{}),/VERIFIED_INSTANCE_REQUIRED/);
 await assert.rejects(publishFresh35CombinedRecord(record),/GENUINE_COMMITTED_COMPLETION/);
});
test('expired record target cannot reconstruct a live host binding',async()=>{
 const {record}=await binding(),{proposal,physical,startsAt,expiresAt}=record.target;
 assert.throws(()=>bindFresh35CombinedTarget({proposal,physical,startsAt,expiresAt},expiresAt),/TWENTY_MINUTE_WINDOW/);
});
test('caller-supplied verifier and model client cannot mint a Fresh35 verification or admission',async()=>{
 const c=client();let called=false;
 await assert.rejects(withReviewedWholeSession(c,{},proof,proof,()=>{called=true},gate=>verifyFresh35InstalledV1(gate,{}),'FRESH35_RETIRED152_V1',{fresh35ExpiresAt:Date.now()+10000}),/PHYSICAL_SESSION_REQUIRED/);
 assert.equal(called,false);assert.equal(c.closed,1);assert.deepEqual(c.calls,['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','ROLLBACK']);
 assert.equal(sameActiveWholeHostSession(c,c),false);
 await assert.rejects(withVerifiedFresh35AdmissionV1({...proof,source_profile_sha256:'a'.repeat(64)},c,c,proof,()=>{called=true}),/VERIFIED_INSTANCE_REQUIRED/);
 assert.throws(()=>assertWholeSalesAdmissionV1({profile:'FRESH35_EXECUTION_ADMISSION_V1'},proof),/ADMISSION_REQUIRED/);
 assert.equal(called,false);
});
test('Fresh35 shared wire owns one cleanup and refuses commit after its original deadline',async()=>{
 const c=client();
 await assert.rejects(withReviewedWholeSession(c,{},proof,proof,async controlled=>{
  await controlled.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  await new Promise(r=>setTimeout(r,40));
  await controlled.query('COMMIT');
 },()=>proof,'FRESH35_RETIRED152_V1',{fresh35ExpiresAt:Date.now()+20}),/WINDOW_EXPIRED|CONNECTION_UNAVAILABLE/);
 assert.equal(c.closed,1);assert.equal(c.calls.includes('COMMIT'),false);
});

test('F01 protected loader retains its original byte hash and nanosecond identity, never a replacement baseline (private OS model)',async()=>{
 const fs=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const dir=await fs.mkdtemp(join(tmpdir(),'record-snapshot-model-')),path=join(dir,'record.json');
 const value={format:'FRESH35_COMBINED_INSTALLATION_RECORD_V1',installedAt:'2026-11-05T00:00:00Z',binding:{},target:{format:'FRESH35_COMBINED_TARGET_BINDING_V1'},transactionReceipt:{},programSha256:'a'.repeat(64),catalogSpecSha256:'b'.repeat(64),catalogSha256:'c'.repeat(64),authorizationSha256:'d'.repeat(64),state:'COMMITTED_AND_CATALOG_CHECKED'};
 const bytes=Buffer.from(JSON.stringify(value)+'\n');await fs.writeFile(path,bytes);
 const source=await fs.readFile(new URL('../scripts/release/unified-install/fresh35-combined-record-v1.mjs',import.meta.url),'utf8'),tail=source.slice(source.indexOf('export async function loadFresh35CombinedRecordEnvelope'));
 const prefix=`import * as fs from 'node:fs/promises';import {constants} from 'node:fs';import {createHash} from 'node:crypto';import {parseStrictJson} from ${JSON.stringify(new URL('../packages/application/src/unified-import-contract.ts',import.meta.url).href)};
 const process={getuid:()=>501,geteuid:()=>501},FRESH35_COMBINED_RECORD_PATH=${JSON.stringify(path)},protectedEnvelopes=new WeakMap();
 const need=(ok,code)=>{if(!ok)throw Error('MODEL_'+code)},hash=b=>createHash('sha256').update(b).digest('hex'),closed=(o,keys)=>need(o&&Object.keys(o).sort().join(',')===[...keys].sort().join(','),'CLOSED');
 async function assertTrustedRootPath(){}const normalized=s=>Object.create(s,{uid:{value:0n},mode:{value:s.mode&~0o022n}});
 async function lstat(p,options){return normalized(await fs.lstat(p,options))}async function open(p,flags){const f=await fs.open(p,flags);return {stat:async options=>normalized(await f.stat(options)),readFile:(...args)=>f.readFile(...args),close:()=>f.close()}}const readFile=(...args)=>fs.readFile(...args);
 `;
 try{
  const api=await import('data:text/javascript;base64,'+Buffer.from(prefix+tail).toString('base64'));
  const envelope=await api.loadFresh35CombinedRecordEnvelope(),snapshot=api.describeFresh35ProtectedRecordSnapshot(envelope),{createHash}=await import('node:crypto');
  assert.equal(snapshot.sha256,createHash('sha256').update(bytes).digest('hex'));assert(Object.isFrozen(snapshot));await api.assertFresh35ProtectedRecordSnapshotCurrent(envelope,true);
  const realRecord=await import('../scripts/release/unified-install/fresh35-combined-record-v1.mjs');assert.throws(()=>realRecord.describeFresh35ProtectedRecordSnapshot(envelope),/FIXED_PROTECTED_ENVELOPE/);
  assert.throws(()=>api.describeFresh35ProtectedRecordSnapshot(structuredClone(envelope)),/FIXED_PROTECTED_ENVELOPE/);
  await fs.writeFile(path+'.new',bytes);await fs.rename(path+'.new',path);await assert.rejects(()=>api.assertFresh35ProtectedRecordSnapshotCurrent(envelope),/GENERATION_CHANGED/);assert.equal(api.describeFresh35ProtectedRecordSnapshot(envelope),snapshot);
  const second=await api.loadFresh35CombinedRecordEnvelope();await fs.writeFile(path,'CHANGED');await assert.rejects(()=>api.assertFresh35ProtectedRecordSnapshotCurrent(second,true),/GENERATION_CHANGED|BYTES_CHANGED/);
  await fs.writeFile(path,bytes);const third=await api.loadFresh35CombinedRecordEnvelope();await fs.rm(path);await assert.rejects(()=>api.assertFresh35ProtectedRecordSnapshotCurrent(third),/ENOENT/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
