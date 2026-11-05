import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
test('operator guide names both explicit modes and all target/role inputs',async()=>{
 const guide=await read('docs/standard-import-whole-package-v2/LOCAL-CODEX-RUNBOOK.md');
 const installer=await read('scripts/release/unified-install/record-whole-installation.mjs');
 for(const name of ['--install-reviewed-synthetic-config','--install-reviewed-local-config','runtimeLogin','expectedSystemIdentifier','expectedDatabaseOid']){
  assert.ok(installer.includes(name),`installer no longer exposes ${name}`);assert.ok(guide.includes(name),`guide missing ${name}`);
 }
 assert.match(guide,/新空库/);assert.match(guide,/不是原地升级/);assert.match(guide,/认证之前/);assert.match(guide,/普通.*CREATEROLE/);assert.match(guide,/真实 PostgreSQL/);
});
