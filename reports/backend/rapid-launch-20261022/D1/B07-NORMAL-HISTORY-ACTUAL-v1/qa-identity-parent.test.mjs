import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {relocateOriginalChild,runOriginalChild,waitForPurposeGate,pinned,prepareOrdinaryConfiguration,ordinaryDriver,runB07QaIdentityParent} from './qa-identity-parent.mjs';
const P='/Users/billy/Desktop/Workspace/project-007-业务管理系统';
const B=P+'/work/local-takeover-20261021-control/reports/controller/rapid-launch-20261022/server-execution';
test('unfilled live registration template refuses before client import or private output creation',async()=>{
 const template=JSON.parse(await readFile(new URL('./QA-IDENTITY-PARENT-REGISTRATION.template.json',import.meta.url),'utf8'));
 await assert.rejects(runB07QaIdentityParent(template),/^Error: B07_LIVE_FIXTURE_REGISTRATION_REQUIRED$/);
});
test('original two child sources change only exact unique B literal and still parse without executing',async()=>{
 for(const [dir,name] of [['B07-EXISTING-COPY-V16-UPGRADE-SUCCESSOR-20261026','upgrade-v16-only.mjs'],['B07-ORDINARY-RUNTIME-ACL-PREPARATION-20261026','ordinary-role-only.mjs']]){
  const source=await readFile(join(B,dir,name),'utf8');const old="B=P+'/work/local-takeover-20261021-control/reports/controller/rapid-launch-20261022/server-execution/"+dir+"'";
  const relocated=relocateOriginalChild(source,old,'/private/tmp/b07-synthetic-only-child-output');
  assert.equal(relocated.replace('B="/private/tmp/b07-synthetic-only-child-output"',old),source);
  assert.equal(spawnSync(process.execPath,['--check','--input-type=module'],{input:relocated}).status,0);
  assert.throws(()=>relocateOriginalChild(source+old,old,'/private/tmp/b07-synthetic-only-child-output'));
 }
});
test('bounded child awaits actual process completion and refuses failure or timeout without driver output',async()=>{
 await runOriginalChild({node:process.execPath,source:'process.exitCode=0',timeoutMs:1000});
 await assert.rejects(runOriginalChild({node:process.execPath,source:'console.error("SYNTHETIC_PRIVATE_DETAIL");process.exitCode=2',timeoutMs:1000}),/^Error: B07_ORIGINAL_CHILD_FAILED_OR_UNKNOWN$/);
 await assert.rejects(runOriginalChild({node:process.execPath,source:'setInterval(()=>{},1000)',timeoutMs:1000}),/^Error: B07_ORIGINAL_CHILD_FAILED_OR_UNKNOWN$/);
});
test('missing gate never admits a fake review; changed private input fails pin',async()=>{
 const d=await mkdtemp(join(tmpdir(),'b07-parent-offline-only-'));
 await assert.rejects(waitForPurposeGate(join(d,'not-written-gate.json'),0),/^Error: B07_CURRENT_PURPOSE_GATE_NOT_READY$/);
 const path=join(d,'synthetic-config.json'),bytes=Buffer.from('{"synthetic":true}');await writeFile(path,bytes,{mode:0o600,flag:'wx'});
 const ref={path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};assert.deepEqual(await pinned(ref),bytes);
 await writeFile(path,Buffer.alloc(bytes.length,32));await assert.rejects(pinned(ref),/^Error: B07_PARENT_PIN_CHANGED$/);
});
test('PG trust config uses distinct RAM-only shape values and ordinary sessions override diagnostic read-only locally',()=>{
 const target={database:'naijue_erp_test_19e00102',unix_socket_directories:'/private/tmp/nj-b07-synthetic-only',port:55676};
 const template={postgres:{target:{database:target.database,host:target.unix_socket_directories,port:target.port,user:'synthetic_nonowner',ssl:false,password:null}}};
 const a=prepareOrdinaryConfiguration(template,target),b=prepareOrdinaryConfiguration(template,target);
 assert.equal(template.postgres.target.password,null);assert.ok(a.postgres.target.password.length>0);assert.notEqual(a.postgres.target.password,b.postgres.target.password);
 assert.throws(()=>prepareOrdinaryConfiguration({...template,postgres:{target:{...template.postgres.target,password:'not-permitted-on-disk'}}},target));
 class FakePool{constructor(config){this.config=config;}}
 const pool=ordinaryDriver(FakePool)({...a.postgres.target,options:'untrusted-ignored'});
 assert.equal(pool.config.options,'-c default_transaction_read_only=off');assert.equal(pool.config.user,'synthetic_nonowner');assert.equal(pool.config.host,target.unix_socket_directories);
});
