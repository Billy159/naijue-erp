import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const moduleUrl = new URL('../scripts/release/unified-install/whole-closure-integration-candidate.mjs', import.meta.url);
const load = () => import(moduleUrl);
const hash = s => createHash('sha256').update(s).digest('hex');
test('candidate composes real closure and exact access verification into one atomic SQL unit', async () => {
  const { renderWholeClosureIntegrationCandidate } = await load();
  const result = await renderWholeClosureIntegrationCandidate(process.cwd());
  assert.equal((result.sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((result.sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.ok(result.sql.indexOf('WHOLE_CLOSURE_PREDECESSOR_DIFFERS') < result.sql.indexOf('CREATE OR REPLACE FUNCTION'));
  assert.ok(result.sql.indexOf('CREATE OR REPLACE FUNCTION') < result.sql.indexOf('WHOLE_INSTALL_SOURCE_DIFFERS'));
  assert.ok(result.sql.indexOf('WHOLE_INSTALL_DEFERRED_TRIGGER_REQUIRED') < result.sql.lastIndexOf('COMMIT;'));
  assert.equal(result.manifest.engineExecuted, false);
  assert.equal(result.manifest.reviewed, false);
  assert.equal(result.manifest.runtimeCatalogAdmitted, false);
  assert.equal(result.manifest.sqlSha256, hash(result.sql));
  assert.equal(result.manifest.routineChanges.length, 1);
  assert.notEqual(result.manifest.routineChanges[0].before, result.manifest.routineChanges[0].after);
});
test('candidate access successor changes only the exact closure pin; retains all permissions and metadata guards', async () => {
  const { renderWholeClosureIntegrationCandidate } = await load();
  const result = await renderWholeClosureIntegrationCandidate(process.cwd());
  const original = await readFile('adapters/postgres/patches/0027_standard_import_whole_package_access_v2.sql', 'utf8');
  const { before, after } = result.manifest.routineChanges[0];
  assert.equal(result.accessSql.replace(after, before), original);
  assert.match(result.accessSql, /WHOLE_INSTALL_ROLE_UNSAFE/);
  assert.match(result.accessSql, /WHOLE_INSTALL_METADATA_DIFFERS/);
  assert.match(result.accessSql, /WHOLE_INSTALL_ACL_UNSAFE/);
  assert.match(result.accessSql, /WHOLE_INSTALL_DEFERRED_TRIGGER_REQUIRED/);
});
test('any byte drift of initializer kernel, candidate or access predecessor blocks rendering', async () => {
  const { compileWholeClosureIntegrationCandidate, readWholeClosureIntegrationSources } = await load();
  const sources = await readWholeClosureIntegrationSources(process.cwd());
  for (const name of Object.keys(sources)) assert.throws(() => compileWholeClosureIntegrationCandidate({ ...sources, [name]: sources[name] + '\n' }), /WHOLE_CLOSURE_INTEGRATION_SOURCE_DIFFERS/);
});
test('renderer leaves existing initializer and runtime catalog wiring untouched', async () => {
  const { WHOLE_INSTALL_PATCHES } = await import('../scripts/release/unified-install/render-whole-package-local.mjs');
  assert.equal(WHOLE_INSTALL_PATCHES.some(p => p.includes('singletons_candidate')), false);
  const s = await readFile(moduleUrl, 'utf8');
  assert.doesNotMatch(s, /new Client|new Pool|\.connect\(|writeFile|execFile|spawn\(/);
});
