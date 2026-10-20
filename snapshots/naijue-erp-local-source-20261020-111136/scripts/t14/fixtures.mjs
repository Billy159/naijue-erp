import assert from 'node:assert/strict';
import {copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileRecords, sha256, safeFile} from '../files.mjs';

export function loadFixtures(root) {
  const manifest = JSON.parse(readFileSync(join(root, 'config/t14/fixtures.json'), 'utf8'));
  assert.equal(manifest.frontend.length, 19); assert.equal(manifest.backend.length, 11);
  assert.equal(new Set(manifest.frontend).size, 19); assert.equal(new Set(manifest.backend).size, 11);
  const backup = resolve(root, manifest.backup.path);
  assert.equal(sha256(readFileSync(backup)), manifest.backup.sha256, 'sealed backup checksum');
  const metadata = JSON.parse(readFileSync(resolve(root, manifest.metadata), 'utf8'));
  assert.equal(metadata.sha256, manifest.backup.sha256); assert.equal(metadata.tableFingerprints.length, 89);
  for (const test of manifest.testProvenance) assert.equal(sha256(readFileSync(safeFile(root, test.path))), test.sha256, test.path);
  const demo = resolve(root, '../奈爵服饰-8877-Demo');
  for (const original of manifest.originals) assert.equal(sha256(readFileSync(safeFile(demo, original.path))), original.sha256, 'sealed original checksum');
  return {manifest, backup, metadata, demo};
}

export function prepareWorkspace(root, run, fixtures) {
  const workspace = join(run, 'regression'); mkdirSync(workspace, {recursive: true});
  cpSync(join(root, 'frontend'), join(workspace, 'frontend'), {recursive: true, filter: path => !path.includes('/assets/product-media')});
  cpSync(join(root, 'tests/t14/frontend/verification'), join(workspace, 'frontend/verification'), {recursive: true});
  cpSync(join(root, 'references/frozen-baseline/server/runtime'), join(workspace, 'server/runtime'), {recursive: true});
  cpSync(join(root, 'references/frozen-baseline/server/domain'), join(workspace, 'server/domain'), {recursive: true});
  copyFileSync(join(root, 'references/frozen-baseline/server/adapter.mjs'), join(workspace, 'server/adapter.mjs'));
  cpSync(join(root, 'references/frozen-baseline/data-cleaning/size-mapping'), join(workspace, 'data-cleaning/size-mapping'),
    {recursive: true, filter: path => !path.endsWith('.xlsx')});
  for (const original of fixtures.manifest.originals) {
    const dest = join(workspace, original.path); mkdirSync(dirname(dest), {recursive: true});
    copyFileSync(safeFile(fixtures.demo, original.path), dest);
    assert.equal(sha256(readFileSync(dest)), original.sha256);
  }
  mkdirSync(join(workspace, 'data-cleaning/verification/consolidation-20261001'), {recursive: true});
  writeFileSync(join(workspace, 'package.json'), '{"type":"module"}\n');
  writeFileSync(join(workspace, 'frontend/package.json'), '{"type":"commonjs"}\n');
  // The historical db.ts stays in the non-shipping harness. Refuse all old fallbacks there too.
  const db = join(workspace, 'server/runtime/db.ts');
  const originalDb = readFileSync(db, 'utf8');
  const strictDb = `for (const k of ['APP_ENV','POSTGRES_DB','POSTGRES_HOST','POSTGRES_PORT','POSTGRES_USER','PSQL_BIN']) if (!process.env[k]) throw Error('T14_LEGACY_CONFIG_REQUIRED');
if (!['qa','stage','local'].includes(process.env.APP_ENV!) || !/^demo_8877_t14_[a-z0-9_]+$/.test(process.env.POSTGRES_DB!)) throw Error('T14_LEGACY_TARGET_FORBIDDEN');
` + originalDb.replace("process.env.POSTGRES_DB||'business_management'", 'process.env.POSTGRES_DB!')
    .replace("process.env.PSQL_BIN||'psql'", 'process.env.PSQL_BIN!')
    .replace("process.env.POSTGRES_HOST||'127.0.0.1'", 'process.env.POSTGRES_HOST!')
    .replace("process.env.POSTGRES_PORT||'5432'", 'process.env.POSTGRES_PORT!')
    .replace('process.env.POSTGRES_USER||process.env.USER!', 'process.env.POSTGRES_USER!');
  writeFileSync(db, strictDb);
  const runtime = join(workspace, 'server/runtime/runtime.ts');
  const originalRuntime = readFileSync(runtime, 'utf8');
  const fixtureRuntime = originalRuntime.replace("export const RUNTIME='v2_runtime_stage03c';",
    "export const RUNTIME=process.env.T14_BARCODE_FIXTURE_SCHEMA||'v2_runtime_stage03c';\nif(process.env.T14_BARCODE_FIXTURE_SCHEMA&&!/^v2_runtime_t14_[a-z0-9_]+$/.test(RUNTIME))throw Error('T14_BARCODE_FIXTURE_SCHEMA_INVALID');");
  assert.notEqual(fixtureRuntime, originalRuntime); writeFileSync(runtime, fixtureRuntime);
  return {workspace, inputs: fileRecords(workspace), adaptations: [{path: 'server/runtime/db.ts',
    reason: 'test harness only: explicit configuration and guarded PSQL_BIN; remove all legacy database and OS-user fallbacks',
    before: sha256(originalDb), after: sha256(strictDb)}, {path: 'server/runtime/runtime.ts',
    reason: 'test harness only: legacy C8/C9 freeze probe uses a disposable barcode-table copy for its EXCLUSIVE LOCK; restored historical tables remain read-only',
    before: sha256(originalRuntime), after: sha256(fixtureRuntime)}]};
}
