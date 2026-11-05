import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const gateUrl = new URL('../scripts/release/unified-install/whole-batch-closure-catalog-v1.mjs', import.meta.url);
const recordUrl = new URL('../scripts/release/unified-install/whole-batch-closure-record-v1.mjs', import.meta.url);
test('versioned source spec changes only final closure pin and binds predecessor/combined artifact', async () => {
  const { loadWholeBatchClosureSpecV1 } = await import(gateUrl);
  const { loadWholeCatalogSpec } = await import('../scripts/release/unified-install/whole-catalog-gate.mjs');
  const before = await loadWholeCatalogSpec(process.cwd()), after = await loadWholeBatchClosureSpecV1(process.cwd());
  assert.equal(after.pins.length, before.pins.length);
  const changes = after.pins.filter((p, i) => JSON.stringify(p) !== JSON.stringify(before.pins[i]));
  assert.equal(changes.length, 1); assert.equal(changes[0].signature, 'naijue_erp.standard_whole_package_closed_v2(uuid)');
  assert.equal(after.predecessor_source_spec_sha256, before.source_spec_sha256);
  assert.notEqual(after.source_spec_sha256, before.source_spec_sha256);
  assert.equal(after.combined_sql_sha256, 'aa7df2d099845c2f3f177999c08111b46266f0188fd1e674fb66785ff1608a5c');
  assert.equal(new Set(after.installation_sources.map(p => p.path)).size, after.installation_sources.length);
  assert.ok(after.installation_sources.some(p => p.path.endsWith('whole-batch-closure-record-v1.mjs')));
  assert.ok(Object.isFrozen(after)); assert.ok(Object.isFrozen(after.pins));
});
test('versioned record validation binds exact format, predecessor, successor and final body', async () => {
  const { validateWholeBatchClosureRecordV1 } = await import(recordUrl);
  const spec = { source_spec_sha256: 'a'.repeat(64), predecessor_source_spec_sha256: 'b'.repeat(64), closure_body_sha256: 'c'.repeat(64) };
  const value = { format: 'WHOLE_BATCH_CLOSURE_INSTALLATION_RECORD_V1', installedAt: '2026-11-04T00:00:00Z', predecessorSourceSpecSha256: spec.predecessor_source_spec_sha256, closureBodySha256: spec.closure_body_sha256, binding: { system_identifier: '1', database_oid: '2', database_name: 'synthetic_whole_a', owner: 'owner', controller: 'controller', runtime_login: 'runtime', server_version_num: '170000', catalog_sha256: 'd'.repeat(64), source_spec_sha256: spec.source_spec_sha256 } };
  assert.equal(validateWholeBatchClosureRecordV1(value, spec).source_spec_sha256, spec.source_spec_sha256);
  for (const change of [{ format: 'WHOLE_INSTALLATION_RECORD_V1' }, { predecessorSourceSpecSha256: 'e'.repeat(64) }, { closureBodySha256: 'e'.repeat(64) }, { approval: true }])
    assert.throws(() => validateWholeBatchClosureRecordV1({ ...value, ...change }, spec));
  assert.throws(() => validateWholeBatchClosureRecordV1({ ...value, binding: { ...value.binding, source_spec_sha256: 'e'.repeat(64) } }, spec));
});
test('forged source spec refuses before any catalog query and cannot supply its own approval', async () => {
  const { verifyWholeBatchClosureInstalledV1 } = await import(gateUrl);
  await assert.rejects(verifyWholeBatchClosureInstalledV1({ query() { assert.fail('No SQL for forged spec'); } }, {}), /WHOLE_BATCH_GENUINE_SOURCE_SPEC_REQUIRED/);
  const source = await readFile(gateUrl, 'utf8');
  assert.match(source, /loadWholeBatchClosureRecordV1\(spec\)/);
  assert.match(source, /WHOLE_CATALOG_QUERY/);
  assert.doesNotMatch(source, /writeFile|new Client|new Pool|process\.env/);
  const recordSource = await readFile(recordUrl, 'utf8');
  assert.match(recordSource, /O_NOFOLLOW/); assert.match(recordSource, /validateInstallationFileMetadata/);
  assert.doesNotMatch(recordSource, /writeFile|mkdir|process\.env/);
});
