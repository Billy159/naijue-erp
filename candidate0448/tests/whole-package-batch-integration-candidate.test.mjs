import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const url = new URL('../scripts/release/unified-install/whole-closure-integration-candidate.mjs', import.meta.url);
const hash = s => createHash('sha256').update(s).digest('hex');
test('combined initializer candidate is one transaction with both guarded successors then exact access verifier', async () => {
  const { renderWholeBatchClosureIntegrationCandidate } = await import(url);
  const r = await renderWholeBatchClosureIntegrationCandidate(process.cwd());
  assert.equal((r.sql.match(/^BEGIN;$/gm) || []).length, 1); assert.equal((r.sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.equal((r.sql.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 2);
  assert.ok(r.sql.indexOf('WHOLE_CLOSURE_PREDECESSOR_DIFFERS') < r.sql.indexOf('WHOLE_BATCH_CLOSURE_PREDECESSOR_DIFFERS'));
  assert.ok(r.sql.indexOf('WHOLE_BATCH_CLOSURE_PREDECESSOR_DIFFERS') < r.sql.indexOf('WHOLE_INSTALL_SOURCE_DIFFERS'));
  assert.equal(r.manifest.sqlSha256, hash(r.sql)); assert.equal(r.manifest.engineExecuted, false);
  assert.equal(r.manifest.runtimeCatalogAdmitted, false); assert.equal(r.manifest.admissionDisposition, 'REFUSED_PENDING_VERSIONED_INSTALLATION_REVIEW');
});
test('catalog proposal changes one exact routine pin without fabricating a trusted spec or installation record', async () => {
  const { renderWholeBatchClosureIntegrationCandidate } = await import(url);
  const r = await renderWholeBatchClosureIntegrationCandidate(process.cwd());
  assert.equal(r.catalogPinProposal.changes.length, 1);
  assert.equal(r.catalogPinProposal.changes[0].signature, 'naijue_erp.standard_whole_package_closed_v2(uuid)');
  assert.equal(r.catalogPinProposal.independentlyReviewed, false);
  assert.equal(r.catalogPinProposal.installedCatalogSha256, null);
  assert.equal(r.catalogPinProposal.sourceSpecSha256, null);
  const { before, after } = r.manifest.routineChanges[0];
  assert.equal(r.catalogPinProposal.changes[0].before, before); assert.equal(r.catalogPinProposal.changes[0].after, after);
  const original = await readFile('adapters/postgres/patches/0027_standard_import_whole_package_access_v2.sql', 'utf8');
  assert.equal(r.accessSql.replace(after, before), original);
  assert.equal((r.accessSql.match(/^GRANT /gm) || []).length, 2); assert.equal((r.accessSql.match(/^REVOKE /gm) || []).length, 8);
});
test('batch candidate drift fails closed and original singleton output remains stable', async () => {
  const m = await import(url);
  const sources = await m.readWholeClosureIntegrationSources(process.cwd());
  const batch = await readFile('adapters/postgres/patches/0027_standard_whole_closure_batch_binding_candidate.sql', 'utf8');
  assert.throws(() => m.compileWholeBatchClosureIntegrationCandidate(sources, batch + '\n'), /WHOLE_BATCH_INTEGRATION_SOURCE_DIFFERS/);
  assert.equal(m.compileWholeClosureIntegrationCandidate(sources).manifest.sqlSha256, 'd0e7188b09614310945137599e30e3521f6601c782177c3c257541bbb9071ead');
});
