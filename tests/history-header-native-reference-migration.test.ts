import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// Synthetic SQL-source assertions only: these are not PostgreSQL execution proof.
const sql = readFileSync(new URL('../adapters/postgres/migrations/0012_history_header_native_reference.sql', import.meta.url), 'utf8');
test('schema12 uses actual typed nullable native FKs and immutable same-batch source identity', () => {
  for (const entity of ['hall', 'customer', 'staff']) {
    assert.match(sql, new RegExp(`native_${entity}_id uuid REFERENCES naijue_erp\\.${entity}\\(id\\)`));
    assert.match(sql, new RegExp(`UNIQUE \\(batch_id, entity_type, native_${entity}_id\\)`));
    assert.match(sql, new RegExp(`entity_type = '${entity.toUpperCase()}' AND native_${entity}_id IS NOT NULL`));
  }
  assert.match(sql, /PRIMARY KEY \(batch_id, entity_type, source_key\)/);
  assert.match(sql, /UNIQUE \(batch_id, source_row_id\)/);
  assert.match(sql, /FOREIGN KEY \(batch_id, source_row_id\) REFERENCES naijue_erp.import_source_row\(batch_id, id\)/);
  assert.match(sql, /length\(btrim\(source_key\)\) > 0/);
  assert.match(sql, /native_version integer NOT NULL CHECK \(native_version > 0\)/);
});
test('schema12 serializes cutoff then batch then typed native snapshot and strict source evidence', () => {
  const cutoff = sql.indexOf('PERFORM naijue_erp.cutoff_import_lock()');
  const batch = sql.indexOf('INTO STRICT b');
  const native = sql.indexOf('INTO STRICT hall_row');
  const source = sql.indexOf('INTO STRICT source');
  assert.ok(cutoff < batch && batch < native && native < source);
  assert.match(sql, /b.mapping_version <> 'V2_HISTORY_NULLABLE_1'/);
  assert.match(sql, /b.status NOT IN \('STAGED', 'VALIDATING'\)/);
  for (const entity of ['hall', 'customer', 'staff']) {
    assert.match(sql, new RegExp(`FROM naijue_erp\\.${entity} WHERE id = NEW.native_${entity}_id FOR SHARE`));
    assert.match(sql, new RegExp(`actual := to_jsonb\\(${entity}_row\\)`));
  }
  assert.match(sql, /actual IS DISTINCT FROM normalized_snapshot/);
  assert.match(sql, /actual->'version' IS DISTINCT FROM to_jsonb\(NEW.native_version\)/);
  assert.match(sql, /source.raw_fields->>'来源编号' = NEW.source_key/);
  assert.match(sql, /source.normalized_fields->>'来源编号' = NEW.source_key/);
  assert.match(sql, /source.field_provenance->>binding_key = native_id::text/);
  assert.match(sql, /evidence->'native_snapshot' = NEW.native_snapshot/);
  assert.match(sql, /IS DISTINCT FROM TRUE THEN/g);
  assert.match(sql, /jsonb_typeof\(NEW.native_snapshot->f.key\) IS DISTINCT FROM jsonb_typeof\(f.value\)/);
  assert.match(sql, /array_agg\(k ORDER BY k\) FROM jsonb_object_keys\(NEW.native_snapshot\)/);
  for (const entity of ['hall', 'customer', 'staff']) {
    assert.match(sql, new RegExp(`jsonb_populate_record\\(NULL::naijue_erp\\.${entity}, NEW.native_snapshot\\)`));
  }
  assert.ok(sql.indexOf('native snapshot has inexact keys') < sql.indexOf('normalized_snapshot := to_jsonb(jsonb_populate_record'));
  assert.ok(sql.indexOf("WHERE id = (NEW.native_snapshot->>'hall_id')::uuid FOR SHARE") < source);
  assert.ok(sql.indexOf("WHERE id = (NEW.native_snapshot->>'default_customer_id')::uuid FOR SHARE") < source);
  assert.ok(sql.indexOf("WHERE id = (NEW.native_snapshot->>'default_sales_warehouse_id')::uuid FOR SHARE") < source);
});
test('schema12 remains append-only source artifact with no native writes or import publication', () => {
  assert.match(sql, /BEFORE UPDATE OR DELETE ON naijue_erp.import_header_native_reference/);
  assert.match(sql, /BEFORE TRUNCATE ON naijue_erp.import_header_native_reference/);
  assert.match(sql, /REVOKE ALL ON naijue_erp.import_header_native_reference FROM PUBLIC/);
  assert.match(sql, /SQL SOURCE ONLY/);
  assert.doesNotMatch(sql, /(?:INSERT INTO|UPDATE|DELETE FROM) naijue_erp\.(?:hall|customer|staff|import_record)\b/);
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
});
test('schema12 checks reviewed enums, nullable contact and explicit same-batch relation identities', () => {
  assert.match(sql, /enum_fields := CASE WHEN NEW.entity_type = 'STAFF' THEN ARRAY\['角色','任职状态'\]/);
  assert.match(sql, /mapping->'raw' = source.raw_fields->enum_field/);
  assert.match(sql, /length\(btrim\(mapping->>'evidenceRef'\)\) > 0/);
  assert.match(sql, /mapping->'native' = actual->/);
  assert.match(sql, /actual->'contact' IS DISTINCT FROM/);
  assert.match(sql, /empty original relation cannot acquire a binding/);
  assert.match(sql, /r.import_batch_id = NEW.batch_id/);
  assert.match(sql, /r.source_entity_type = 'WAREHOUSE' AND r.source_key = relation_key/);
  assert.match(sql, /r.batch_id = NEW.batch_id AND r.source_key = relation_key/);
  assert.match(sql, /mapping->>'sourceKey' = relation_key AND mapping->>'nativeId' = relation_native/);
  assert.match(sql, /competing native source binding/);
});
