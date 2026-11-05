/** Focused synthetic metadata/source tests for B0703's exact projection successor.
 * No PostgreSQL, genuine authority, application request or old suite replay. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNativeRuntime26Issuer,NATIVE_RUNTIME26_V16_FROM_V14_METADATA_PROBE,NATIVE_RUNTIME26_V16_FROM_V15_METADATA_PROBE,
 NATIVE_RUNTIME26_V20_METADATA_PROBE,NATIVE_RUNTIME26_V21_EFFECTIVE_VALUE_FROM_V16_V14_METADATA_PROBE} from './native-import-accounting-capability.ts';

const oldBody='c06027597f11a9cf7f2ae06bf5e47e5c21349b54851fb21df6895ef22a2855b7';
const newBody='4fbbebd6b335359b80c7df38efc99a30cb666902158c3e1f911e3c869ebac363';
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const oldSource=readFileSync(new URL('../patches/0026-history-revision-current-base.sql',import.meta.url),'utf8');
const patch=readFileSync(new URL('../patches/0026-history-effective-value-disambiguation.sql',import.meta.url),'utf8');
const definition=(source:string)=>source.match(/CREATE OR REPLACE FUNCTION naijue_erp\.history_effective_writes_closed\(\)[\s\S]*?AS \$\$(.*?)\$\$;/s)!;
test('B07 projection successor changes only three explicit SRF aliases and preserves exact guard body',()=>{
 const old=definition(oldSource),next=definition(patch);assert.ok(old&&next);
 assert.equal(sha(old[1]!),oldBody);assert.equal(sha(next[1]!),newBody);
 assert.equal((next[0].match(/AS fact\(item\)/g)??[]).length,3);
 const reverted=next[0].replace(/SELECT fact\.item INTO STRICT expected FROM jsonb_array_elements\(revision\.after_facts->'(lines|settlements)'\) AS fact\(item\) WHERE fact\.item->>'(lineId|settlementId)'=value->>'(line_id|settlement_id)';/g,
  (_all,group,key,column)=>`SELECT item INTO STRICT expected FROM jsonb_array_elements(revision.after_facts->'${group}') item WHERE item->>'${key}'=value->>'${column}';`);
 assert.equal(reverted,old[0]);
 assert.equal((patch.match(/CREATE OR REPLACE FUNCTION/g)??[]).length,1);
 assert.ok(!/\b(?:ALTER|GRANT|REVOKE|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:TABLE|FUNCTION|ON|INTO|naijue_erp)/i.test(patch));
 assert.ok(patch.includes('prokind IN(\'f\',\'p\'))<>129'));
 assert.ok(patch.includes(oldBody)&&patch.includes(newBody));
 assert.ok(patch.startsWith('-- B0703')&&patch.trimEnd().endsWith('COMMIT;'));
});
test('B07 exact metadata derivation substitutes one body, retaining old 129/130/131 profiles',()=>{
 const p=NATIVE_RUNTIME26_V21_EFFECTIVE_VALUE_FROM_V16_V14_METADATA_PROBE;
 assert.equal(p.replace(newBody,oldBody),NATIVE_RUNTIME26_V16_FROM_V14_METADATA_PROBE);
 assert.equal(p.split(newBody).length,2);assert.ok(p.includes("jsonb_array_length(manifest->'routines')=129"));
 for(const old of [NATIVE_RUNTIME26_V16_FROM_V14_METADATA_PROBE,NATIVE_RUNTIME26_V16_FROM_V15_METADATA_PROBE,NATIVE_RUNTIME26_V20_METADATA_PROBE]){
  assert.ok(old.includes(oldBody));assert.ok(!old.includes(newBody));
 }
});
function fixture(installedBody=newBody,settings:{catalogDrift?:boolean;targetDrift?:boolean;purposes?:string[];profile?:string}={}){
 const directory=mkdtempSync(join(tmpdir(),'b07-projection-issuer-only-'));
 const independent=join(directory,'independent.json'),reviewFile=join(directory,'review.json');
 const receipt=JSON.stringify({result:'PASS',notice:'SYNTHETIC_ONLY_NOT_REAL_APPROVAL'});writeFileSync(independent,receipt,{mode:0o600});
 const target={database:'B07_SYNTHETIC_ONLY',databaseOid:'123',actingRole:'synthetic_nonowner',sessionUser:'synthetic_nonowner',serverAddress:null,serverPort:null,postmasterStart:'2026-10-26 00:00:00+00'};
 const digest='a'.repeat(64),review={version:'C_NATIVE_RUNTIME26_REVIEW_V1',decision:'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA',target,
  catalog:{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V1',sha256:digest,patchLevel:settings.profile??'26_v21_history_effective_value_from_v16_v14'},
  purposes:settings.purposes??['HISTORY_REVISION'],scope:'EXACT_TARGET_METADATA_ONLY',independentReview:{path:independent,sha256:sha(receipt),result:'PASS'},realImportExecutionAuthorized:false};
 const body=JSON.stringify(review);writeFileSync(reviewFile,body,{mode:0o600});const calls:string[]=[];
 const pool={async connect(){return {async query(sql:string){calls.push(sql);return {rows:[{
  identity:{database:target.database,database_oid:target.databaseOid,database_owner:'synthetic_owner',current_user:target.actingRole,session_user:target.sessionUser,server_version_num:'170011',server_addr:null,server_port:null,postmaster_start:settings.targetDrift?'changed':target.postmasterStart,replication_role:'origin'},
  migration_versions:Array.from({length:26},(_,i)=>i+1),catalog_sha256:settings.catalogDrift?'b'.repeat(64):digest,
  source_routines_match:sql.includes(`('history_effective_writes_closed','${installedBody}')`)
 }],rowCount:1};},release(){}};}};
 return {pool,calls,options:{reviewFile,trustedReviewSha256:sha(body)},cleanup:()=>rmSync(directory,{recursive:true,force:true})};
}
test('B07 new profile selects exact qualified body and real lease purposes without falling back',async()=>{
 const f=fixture();try{
  const issuer=await createNativeRuntime26Issuer(f.pool,f.options);const c=await issuer.pool.connect();
  await issuer.runtime26.assertReady(c,'HISTORY_REVISION');c.release();
  assert.ok(f.calls.length>0&&f.calls.every(sql=>sql===NATIVE_RUNTIME26_V21_EFFECTIVE_VALUE_FROM_V16_V14_METADATA_PROBE));
  assert.equal(issuer.categoryOrderWrite,undefined);
 }finally{f.cleanup();}
 for(const [body,settings] of [[oldBody,{}],[newBody,{catalogDrift:true}],[newBody,{targetDrift:true}],[newBody,{profile:'26_v16_history_responsible_from_v14'}]] as const){
  const f=fixture(body,settings);try{await assert.rejects(createNativeRuntime26Issuer(f.pool,f.options),{code:'NATIVE_RUNTIME26_NOT_READY'});}finally{f.cleanup();}
 }
 const read=fixture(newBody,{purposes:['HISTORY_READ']});try{
  const issuer=await createNativeRuntime26Issuer(read.pool,read.options),c=await issuer.pool.connect();
  await assert.rejects(issuer.runtime26.assertReady(c,'HISTORY_REVISION'),{code:'NATIVE_RUNTIME26_NOT_READY'});c.release();
 }finally{read.cleanup();}
});
