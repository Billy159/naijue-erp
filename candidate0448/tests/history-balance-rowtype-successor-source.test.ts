/** Source-only candidate contracts; these do not connect to PostgreSQL. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const prior = read('adapters/postgres/patches/0026-history-revision-current-base.sql');
const next = read('adapters/postgres/patches/0027_history_balance_rowtype_successor.sql');
const match = prior.match(/CREATE FUNCTION naijue_erp\.validate_history_numeric_balance_commit\(\) RETURNS trigger LANGUAGE plpgsql\s+SET search_path=pg_catalog,naijue_erp AS \$\$([\s\S]*?)\$\$;/);
assert.ok(match?.[1]);
const before = match[1];
const oldDeclaration = 'revision naijue_erp.history_revision%ROWTYPE';
const newDeclaration = 'revision record';
const after = before.replace(oldDeclaration, newDeclaration);
test('exact predecessor is changed only by the single legacy composite type declaration', () => {
  assert.equal(before.split(oldDeclaration).length, 2);
  assert.equal(sha(before), 'fab0bf7a3f1681d6034b09dbb5c7ad8efa606c6fa82f24fc101bc5b70636a837');
  assert.equal(sha(after), 'e7c3b1082f5c5fd5b6634c8db26df08af2e6e7296a7297a5b1af28aa76e6d703');
  assert.ok(next.includes(sha(before)) && next.includes(sha(after)));
});
test('ordinary dispatch remains before strict legacy revision read and original validations remain byte-identical', () => {
  const dispatch = "IF r.target_type NOT IN ('HISTORY_SALES','HISTORY_TRANSFER') THEN RETURN NULL; END IF;";
  const historicalRead = 'SELECT * INTO STRICT revision FROM naijue_erp.history_revision';
  assert.ok(after.indexOf(dispatch) >= 0 && after.indexOf(dispatch) < after.indexOf(historicalRead));
  assert.match(after, /revision\.changed_at<>r\.completed_at/);
  assert.match(after, /l\.source_history_revision_id IS DISTINCT FROM revision\.id/);
  assert.match(after, /x\.xmin::text::bigint=mod\(pg_current_xact_id\(\)::text::numeric,4294967296\)::bigint/);
  assert.equal(after.replace(newDeclaration, oldDeclaration), before);
});
test('successor requires pinned invoker, owner, language, hardened path and preserves all non-body metadata', () => {
  assert.match(next, /pg_catalog\.pg_get_functiondef\(before_routine\.oid\)/);
  assert.match(next, /before_routine\.proowner IS DISTINCT FROM current_user::regrole::oid/);
  assert.match(next, /before_routine\.prosecdef/);
  assert.match(next, /search_path=pg_catalog, naijue_erp, pg_temp/);
  assert.match(next, /to_jsonb\(after_routine\)-'prosrc'.*IS DISTINCT FROM.*to_jsonb\(before_routine\)-'prosrc'/);
  assert.match(next, /HISTORY_BALANCE_ROWTYPE_DECLARATION_DIFFERS/);
  assert.match(next, /exclusive schema-writer window/);
  assert.match(next, /downstream body-hash pins need separate reconciliation/);
  assert.doesNotMatch(next, /\b(?:GRANT|REVOKE|DROP|ALTER|TRUNCATE|DISABLE|INSERT|UPDATE|DELETE)\b/i);
  assert.match(next, /COMMIT;\s*$/);
});
test('source-level branch model preserves legacy dispatch', () => {
  const needsLegacy = (kind: string) => ['HISTORY_SALES', 'HISTORY_TRANSFER'].includes(kind);
  for (const kind of ['SALES', 'TRANSFER', 'IMPORT']) assert.equal(needsLegacy(kind), false);
  for (const kind of ['HISTORY_SALES', 'HISTORY_TRANSFER']) assert.equal(needsLegacy(kind), true);
});

test('candidate is not silently admitted into old or whole-package profiles', async () => {
  const { WHOLE_INSTALL_PATCHES } = await import(new URL('../scripts/release/unified-install/render-whole-package-local.mjs', import.meta.url).href);
  const { loadWholeCatalogSpec } = await import(new URL('../scripts/release/unified-install/whole-catalog-gate.mjs', import.meta.url).href);
  const { renderWholeSearchPathHardening } = await import(new URL('../scripts/release/unified-install/whole-search-path-source.mjs', import.meta.url).href);
  assert.equal(WHOLE_INSTALL_PATCHES.includes('0027_history_balance_rowtype_successor.sql'), false);
  const catalog = await loadWholeCatalogSpec(process.cwd());
  const signature = 'naijue_erp.validate_history_numeric_balance_commit()';
  const pinned = catalog.pins.filter((p: { signature: string }) => p.signature === signature);
  assert.equal(pinned.length, 1);
  assert.equal(pinned[0].sha256, sha(before));
  const hardening = await renderWholeSearchPathHardening(process.cwd());
  assert.equal(hardening.split(sha(before)).length - 1, 2);
  assert.equal(hardening.includes(sha(after)), false);
  const legacy = read('adapters/postgres/src/native-import-accounting-capability.ts');
  assert.ok(legacy.includes(`('validate_history_numeric_balance_commit','${sha(before)}')`));
  assert.equal(legacy.includes(sha(after)), false);
});

test('the registered history reader does not reinterpret schema27 as schema19', async () => {
  const { assertHistoryPublicationSchema19 } = await import('../packages/application/src/history-typed-publication.ts');
  const v19 = Array.from({ length: 19 }, (_, i) => i + 1);
  const v27 = Array.from({ length: 27 }, (_, i) => i + 1);
  assert.doesNotThrow(() => assertHistoryPublicationSchema19(v19));
  assert.throws(() => assertHistoryPublicationSchema19(v27), { code: 'HISTORY_PUBLICATION_SCHEMA_NOT_READY' });
  const reader = read('adapters/postgres/src/imported-history-query-reader.ts');
  const check = reader.indexOf('assertHistoryPublicationSchema19(versions[0]!.versions)');
  const guard = reader.indexOf('await assertNativeImportAccountingSchema19Guards(guardedClient)');
  assert.ok(check >= 0 && guard > check);
});
