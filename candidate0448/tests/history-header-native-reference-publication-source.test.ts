import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const migration=readFileSync(new URL('../adapters/postgres/migrations/0012_history_header_native_reference.sql',import.meta.url),'utf8');
const sql=migration.slice(migration.indexOf('CREATE FUNCTION naijue_erp.guard_header_native_reference_publication'));
test('schema12 additive publisher covers every nonempty header native and warehouse original identity',()=>{
  assert.match(sql,/NEW.mapping_version <> 'V2_HISTORY_NULLABLE_1' OR NEW.status <> 'IMPORTED'/);
  assert.match(sql,/PERFORM naijue_erp.cutoff_import_lock\(\)/);
  for(const field of ['所属厅来源编号','客户来源编号','营业员来源编号','原创建厅编号','仓库来源编号','调出仓来源编号','调入仓来源编号'])assert.ok(sql.includes(field));
  assert.match(sql,/v.native_id IS NULL OR NOT EXISTS/);assert.match(sql,/jsonb_typeof\(s.normalized_fields->v.field\) IS DISTINCT FROM 'string'/);
  assert.match(sql,/r.entity_type=v.entity AND r.source_key=s.normalized_fields->>v.field/);
  assert.match(sql,/r.source_entity_type='WAREHOUSE' AND r.target_type='WAREHOUSE' AND r.status='IMPORTED'/);
});
test('schema12 publisher uses binding-time directory relations, not mutable current native facts',()=>{
  for(const column of ['default_customer_id','default_sales_warehouse_id','hall_id'])assert.ok(sql.includes(column));
  assert.match(sql,/d.native_snapshot->>v.native_column/);assert.match(sql,/historical native directory has incomplete original relation coverage/);
  assert.doesNotMatch(sql,/FROM naijue_erp\.(?:hall|customer|staff)\b/);assert.doesNotMatch(sql,/native_version\s*[=<>]/);
  assert.match(sql,/CREATE TRIGGER import_batch_history_header_native_reference_publication BEFORE INSERT OR UPDATE/);
  assert.doesNotMatch(sql,/(?:DROP|REPLACE).*guard_history_publication/);
  const old=readFileSync(new URL('../adapters/postgres/migrations/0011_history_storage.sql',import.meta.url),'utf8');
  assert.match(old,/CREATE TRIGGER import_batch_history_publication/);assert.match(old,/history_actual_counts IS DISTINCT FROM NEW.history_expected_counts/);
});

test('schema12 publisher refuses orphan dictionary source evidence before checking its relations',()=>{
  assert.match(sql,/s.entity_type IN \('HALL','CUSTOMER','STAFF'\) AND NOT EXISTS/);
  assert.match(sql,/r.source_row_id=s.id AND r.entity_type=s.entity_type AND r.source_key=s.source_key/);
  assert.ok(sql.indexOf('historical native dictionary source lacks exact reference directory coverage')<sql.indexOf('historical native directory has incomplete original relation coverage'));
  assert.doesNotMatch(sql,/FROM naijue_erp\.(?:hall|customer|staff)\b/);
});
