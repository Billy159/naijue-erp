import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runAdmin154Setup} from '../tools/unified-import/admin154-setup-cli.mjs';
import {runStreamImport,runWholeImport} from '../tools/unified-import/stream-import-cli.mjs';
const sha='a'.repeat(64);
test('admin154 CLI exposes separate setup and REAL import help through the real command entry',()=>{
 for(const command of ['admin-provision-only','stream-import']){
  const p=spawnSync(process.execPath,[new URL('../tools/unified-import/cli.mjs',import.meta.url).pathname,command,'--help'],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);const help=JSON.parse(p.stdout);assert.match(help.usage,/admin154-successor-sha256/);
  assert.equal(help.postgresql_acceptance,'NOT_RUN');
  if(command==='admin-provision-only'){assert.equal(help.business_import,false);assert.equal(help.request_format,'FIRST_ADMIN_SETUP_V1');}
 }
});
test('admin154 setup rejects incomplete, duplicate, unacknowledged or malformed selections before input or connection access',async()=>{
 await assert.rejects(runAdmin154Setup([]),/OPTION_REQUIRED/);
 await assert.rejects(runAdmin154Setup(['--prepare-only','--prepare-only']),/OPTION_DUPLICATE/);
 await assert.rejects(runAdmin154Setup(['--allow-synthetic']),/OPTION_INVALID/);
 const args=['--request','/NONEXISTENT','--connection','/NONEXISTENT','--target','/NONEXISTENT','--scrypt-file','/NONEXISTENT','--fresh35-reference-inputs','/NONEXISTENT','--admin154-successor-sha256',sha,'--current-service-sha256',sha,'--capacity-expires-at',String(Date.now()+60000)];
 await assert.rejects(runAdmin154Setup(args),/EXCLUSIVE_DDL_WINDOW_ACK_REQUIRED/);
 args[args.indexOf('--current-service-sha256')+1]='bad';await assert.rejects(runAdmin154Setup([...args,'--ack-exclusive-ddl-window']),/OPTION_INVALID/);
});
test('admin154 REAL entry rejects legacy, whole, synthetic and missing successor selections before protected record access',async()=>{
 const base=['--target-profile','FRESH35_A53_ADMIN154_FIRST_IMPORT_V1'];
 await assert.rejects(runStreamImport(base),/OPTION_REQUIRED/);
 const args=[...base,'--admin154-successor-sha256',sha,'--current-service-sha256',sha,'--capacity-expires-at',String(Date.now()+60000),'--provision-receipt','/NONEXISTENT'];
 await assert.rejects(runStreamImport([...args,'--allow-synthetic']),/OPTION_INVALID/);
 await assert.rejects(runWholeImport(args),/OPTION_INVALID/);
 await assert.rejects(runStreamImport(['--target-profile','FRESH35_PRODUCTION_REAL_IMPORT_V1','--admin154-successor-sha256',sha]),/OPTION_INVALID/);
});
