import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const MiB=1024*1024;
const manifest=(sizes)=>({identity_registry:{bytes:1},files:sizes.map(bytes=>({bytes})),reports:[],assets:[],source_files:[{bytes:1024*MiB}]});
test('whole size route uses actual existing materialization limits, never raw source files or row guesses',async()=>{
 const {wholePackageMaterializationLimit}=await import('../tools/unified-import/stream-import-cli.mjs');
 assert.equal(wholePackageMaterializationLimit(manifest([64*MiB]),2000),null);
 assert.equal(wholePackageMaterializationLimit(manifest([64*MiB+1]),2000),'FILE_BYTES');
 assert.equal(wholePackageMaterializationLimit(manifest([64*MiB,64*MiB,64*MiB,64*MiB]),2000),'PACKAGE_BYTES');
 assert.equal(wholePackageMaterializationLimit(manifest([64*MiB,64*MiB,64*MiB,64*MiB-2001]),2000),null);
 assert.equal(wholePackageMaterializationLimit(manifest([1]),2000),null);
});
test('oversize whole-import exits before preflight/credentials/host and names explicit stream command',async()=>{
 const d=await mkdtemp(join(tmpdir(),'large-whole-route-'));
 try{
  const pkg=join(d,'package');await mkdir(pkg);const bytes=JSON.stringify(manifest([64*MiB+1]));await writeFile(join(pkg,'manifest.json'),bytes);
  for(const n of ['target','admin'])await writeFile(join(d,n),'{}');
  const pin=createHash('sha256').update(bytes).digest('hex');
  const args=['tools/unified-import/cli.mjs','whole-import','--package',pkg,'--report',join(d,'report'),'--manifest-sha256',pin,'--target',join(d,'target'),'--admin',join(d,'admin'),'--connection',join(d,'MUST_NOT_READ'),'--scrypt-file',join(d,'MUST_NOT_READ_EITHER'),'--ack-exclusive-ddl-window'];
  const r=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(r.status,1);const out=JSON.parse(r.stdout);
  assert.equal(out.state,'NOT_STARTED');assert.equal(out.code,'WHOLE_PACKAGE_MATERIALIZATION_LIMIT');assert.equal(out.required_command,'stream-import');assert.equal(out.automatic_switch,false);assert.equal(out.business_database_writes,false);
  args[args.indexOf(pin)]='f'.repeat(64);const changed=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(JSON.parse(changed.stdout).code,'MANIFEST_HASH_MISMATCH');
 }finally{await rm(d,{recursive:true,force:true})}
});
test('both command help outputs distinguish bounded streaming and materialized small packages',()=>{
 for(const command of ['whole-import','stream-import','stream-verify']){
  const r=spawnSync(process.execPath,['tools/unified-import/cli.mjs',command,'--help'],{encoding:'utf8'});assert.equal(r.status,0);const h=JSON.parse(r.stdout);
  assert.equal(h.large_package_command,'stream-import');assert.equal(h.postgresql_acceptance,'NOT_RUN');assert.equal(h.package_loading,command==='whole-import'?'MATERIALIZED_SMALL_PACKAGE':'STREAMED_INDEX_AND_REQUESTS');
  assert.match(h.usage,/--explicit-zero-approval FILE --explicit-zero-approval-sha256 SHA/);
 }
});
