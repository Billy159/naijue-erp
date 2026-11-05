import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = new URL('../adapters/postgres/patches/', import.meta.url);
const candidate = () => readFile(new URL('0027_standard_whole_closure_singletons_candidate.sql', base), 'utf8');
const body = s => s.match(/CREATE OR REPLACE FUNCTION naijue_erp\.standard_whole_package_closed_v2\(root_operation uuid\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)?.[1];
test('candidate replaces only closure after exact installed predecessor and owner check', async () => {
  const s = await candidate(), original = body(await readFile(new URL('0027_standard_import_whole_package_v2.sql', base), 'utf8'));
  assert.ok(original); assert.ok(body(s));
  assert.ok(s.includes(createHash('sha256').update(original).digest('hex')));
  assert.match(s, /WHOLE_CLOSURE_PREDECESSOR_DIFFERS/);
  assert.match(s, /p\.proowner IS DISTINCT FROM current_user::regrole::oid/);
  assert.equal((s.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 1);
  assert.doesNotMatch(s, /GRANT |DISABLE TRIGGER|CREATE TABLE|ALTER ROLE|session_replication_role\s*=/i);
});
test('closure independently requires exactly one seal, stage and final publication in order', async () => {
  const s = body(await candidate());
  for (const predicate of ['rank=3 AND baseline_sealed', 'rank>3 AND NOT baseline_sealed', 'rank=4 AND documents_staged', 'rank>4 AND NOT documents_staged', 'documents_published']) assert.ok(s.includes(predicate), predicate);
  assert.match(s, /WHOLE_SINGLETON_PHASE_INVALID/);
  assert.match(s, /baseline_sealed:=baseline_sealed OR rank=3/);
  assert.match(s, /documents_staged:=documents_staged OR rank=4/);
  assert.match(s, /documents_published:=documents_published OR rank=6/);
  assert.match(s, /NOT baseline_sealed OR NOT documents_staged OR NOT documents_published/);
});
test('child marker has the exact generated root and numeric ordinal with no caller extras', async () => {
  const s = body(await candidate());
  assert.match(s, /ordinal>0 AND a\.after_values->'whole_package_v2' IS DISTINCT FROM\s+jsonb_build_object\('root_operation',root_operation,'ordinal',ordinal\)/);
  assert.match(s, /WHOLE_CHILD_MARKER_INVALID/);
});
test('candidate preserves read-only committed inspection and original receipt/batch closure checks', async () => {
  const original = body(await readFile(new URL('0027_standard_import_whole_package_v2.sql', base), 'utf8')), s = body(await candidate());
  for (const line of original.split('\n').filter(x => /OR r\.|OR a\.|OR b\.|SELECT count\(\*\) FROM naijue_erp.import_batch/.test(x))) assert.ok(s.includes(line), line);
  assert.doesNotMatch(s, /pg_current_xact_id\(\)|FOR (?:UPDATE|SHARE)|INSERT INTO|UPDATE naijue_erp/);
  assert.match(await candidate(), /SET search_path=pg_catalog,naijue_erp,pg_temp/);
});
