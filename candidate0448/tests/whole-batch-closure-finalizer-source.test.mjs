import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const url = new URL('../scripts/release/unified-install/finalize-whole-batch-closure-v1.mjs', import.meta.url);
test('finalizer main remains unconditionally disabled until independent pre-Node launch assurance exists', async () => {
  const s = await readFile(url, 'utf8');
  // First executable statement, not an environment flag or caller-supplied token.
  // This does not assert safety of Node startup or static module evaluation.
  assert.match(s, /async function main\(\) \{\s*throw Error\('FINALIZE_TRUSTED_PRE_NODE_LAUNCH_REQUIRED'\);/);
});
test('finalizer consumes independent fixed root review evidence, never creates approval from observation', async () => {
  const s = await readFile(url, 'utf8');
  assert.match(s, /whole-batch-closure-review-v1\.json/);
  assert.match(s, /assertTrustedRootTree\(root\)/);
  assert.match(s, /verifyWholeCatalogPacket\(raw, review\.record\.binding, spec\.source_spec_sha256\)/);
  assert.match(s, /publishInstallationRecord\(WHOLE_BATCH_CLOSURE_RECORD_V1_PATH/);
  assert.doesNotMatch(s, /catalog_sha256:\s*(?:hash|createHash)|GRANT |REVOKE |CREATE ROLE|spawn\(/);
});
test('finalizer is explicit, root-only, no-overwrite, source-stable and read-only toward PostgreSQL', async () => {
  const s = await readFile(url, 'utf8');
  assert.match(s, /--finalize-reviewed-batch-closure-v1/);
  assert.match(s, /process\.getuid\?\.\(\) === 0/);
  assert.match(s, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(s, /query\('ROLLBACK'\)/);
  assert.doesNotMatch(s, /query\('COMMIT'\)/);
  assert.match(s, /FINALIZE_SOURCE_CHANGED/);
  assert.match(s, /FINALIZE_REVIEW_CHANGED/);
  assert.match(s, /O_NOFOLLOW/);
  assert.match(s, /noConcurrentDdlAclAdminChanges !== true/);
});
test('review validator accepts only separately supplied exact reviewed binding, not observation or approval flags', async () => {
  const { validateWholeBatchFinalizerReview } = await import(url);
  const spec = { source_spec_sha256: 'a'.repeat(64), predecessor_source_spec_sha256: 'b'.repeat(64), closure_body_sha256: 'c'.repeat(64), combined_sql_sha256: 'd'.repeat(64) };
  const record = { format: 'WHOLE_BATCH_CLOSURE_INSTALLATION_RECORD_V1', installedAt: '2026-11-04T00:00:00Z', predecessorSourceSpecSha256: spec.predecessor_source_spec_sha256, closureBodySha256: spec.closure_body_sha256, binding: { system_identifier: '1', database_oid: '2', database_name: 'synthetic_whole_a', owner: 'owner', controller: 'controller', runtime_login: 'runtime', server_version_num: '170000', catalog_sha256: 'e'.repeat(64), source_spec_sha256: spec.source_spec_sha256 } };
  const review = { format: 'WHOLE_BATCH_CLOSURE_INDEPENDENT_REVIEW_V1', combinedSqlSha256: spec.combined_sql_sha256, record };
  const checked = validateWholeBatchFinalizerReview(review, spec);
  assert.deepEqual(checked, review); assert.notEqual(checked.record, record);
  for (const bad of [{ identity: record.binding, catalog: {} }, { ...review, approved: true }, { ...review, combinedSqlSha256: 'f'.repeat(64) }, { ...review, record: { ...record, predecessorSourceSpecSha256: 'f'.repeat(64) } }]) assert.throws(() => validateWholeBatchFinalizerReview(bad, spec));
});
