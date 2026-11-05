import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir = new URL('../adapters/postgres/patches/', import.meta.url);
const body = s => s.match(/CREATE OR REPLACE FUNCTION naijue_erp\.standard_whole_package_closed_v2\(root_operation uuid\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)[1];
const read = name => readFile(new URL(name, dir), 'utf8');
const candidate = () => read('0027_standard_whole_closure_batch_binding_candidate.sql');
test('batch binding successor requires exact independently reviewed singleton predecessor', async () => {
  const prior = await read('0027_standard_whole_closure_singletons_candidate.sql'), next = await candidate();
  assert.ok(next.includes(createHash('sha256').update(body(prior)).digest('hex')));
  assert.match(next, /WHOLE_BATCH_CLOSURE_PREDECESSOR_DIFFERS/);
  assert.match(next, /p\.proowner IS DISTINCT FROM current_user::regrole::oid/);
  assert.equal((next.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 1);
});
test('each published batch binds immutable INIT source identity, lifecycle and precise expected counts', async () => {
  const s = body(await candidate());
  for (const field of ['source_manifest_ref', 'cutoff_at', 'mapping_version', 'inventory_mode', 'created_at', 'completed_at']) assert.match(s, new RegExp('b\\.' + field + ' IS DISTINCT FROM'));
  assert.match(s, /b\.checkpoint->'expected' IS DISTINCT FROM\s+\(CASE WHEN b\.id=baseline_id THEN init->'payload'->'expected' ELSE init->'payload'->'expected_documents' END\)/);
  assert.match(s, /WHOLE_BATCH_INITIALIZATION_BINDING_INVALID/);
  assert.match(s, /'STANDARD_INITIAL_EXPLICIT_KEYS_V1' ELSE 'DOCUMENT_CONVERSION_V1'/);
  assert.match(s, /'CUTOFF_STOCK_BASELINE' ELSE 'DOCUMENT_CONVERSION'/);
});
test('batch successor retains every existing singleton, marker, receipt and batch predicate', async () => {
  const previous = body(await read('0027_standard_whole_closure_singletons_candidate.sql')), next = body(await candidate());
  for (const line of previous.split('\n').filter(x => x.trim())) assert.ok(next.includes(line), line);
  assert.doesNotMatch(next, /pg_current_xact_id\(\)|FOR (?:UPDATE|SHARE)|INSERT INTO|UPDATE naijue_erp/);
  assert.doesNotMatch(await candidate(), /GRANT |REVOKE |DISABLE TRIGGER|ALTER ROLE/);
});
