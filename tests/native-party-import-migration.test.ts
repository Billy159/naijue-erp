import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const migration = await readFile(new URL('../adapters/postgres/migrations/0013_native_party_import.sql', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../adapters/postgres/migrations/0006_party_maintenance.sql', import.meta.url), 'utf8');
const fn = (source: string, name: string) => source.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION naijue_erp\\.${name}\\(\\)[\\s\\S]*?\\n\\$\\$;`))![0];
test('0013 narrowly extends only native INSERT while preserving both original 0006 runtime bodies verbatim', () => {
  for (const name of ['keep_party_native_identity', 'validate_party_native_commit']) {
    const before = fn(runtime, name), after = fn(migration, name), originalTail = before.slice(before.indexOf('BEGIN\n') + 6);
    assert.ok(after.endsWith(originalTail), `${name} runtime tail must be byte-identical`);
    assert.match(after, /IF TG_OP = 'INSERT' AND naijue_erp\.is_native_party_import_insert/);
  }
  const identity = fn(migration, 'keep_party_native_identity');
  assert.ok(identity.indexOf("'naijue:party-code:'") < identity.indexOf('RETURN NEW;'));
  assert.ok(!/ALTER SEQUENCE|CREATE SEQUENCE|setval|nextval|DISABLE TRIGGER|session_replication_role/.test(migration));
});
test('typed same-batch original/native references are deferred but immutable and closed-scope commit guarded', () => {
  assert.match(migration, /FOREIGN KEY \(batch_id,source_row_id\) REFERENCES naijue_erp\.import_source_row\(batch_id,id\) DEFERRABLE INITIALLY DEFERRED/);
  for (const kind of ['hall', 'customer', 'supplier', 'staff', 'warehouse']) assert.match(migration, new RegExp(`REFERENCES naijue_erp\\.${kind}\\(id\\) DEFERRABLE INITIALLY DEFERRED`));
  assert.match(migration, /is_native_party_import_insert\(kind text, snapshot jsonb\) RETURNS boolean LANGUAGE sql SECURITY DEFINER/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION naijue_erp\.is_native_party_import_insert\(text,jsonb\) TO PUBLIC/);
  assert.match(migration, /REVOKE ALL ON naijue_erp\.native_party_import_evidence FROM PUBLIC/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON naijue_erp\.native_party_import_evidence/); assert.match(migration, /BEFORE TRUNCATE ON naijue_erp\.native_party_import_evidence/);
  assert.match(migration, /import_source_key_lock\(b.source_name,NEW.entity_type,NEW.source_key\)/);
  assert.match(migration, /prior.source_name=b.source_name AND e.entity_type=NEW.entity_type AND e.source_key=NEW.source_key/);
  assert.match(migration, /other_source.id<>NEW.source_row_id/);
  assert.match(migration, /other_source.entity_type=NEW.entity_type AND other_source.source_key=NEW.source_key/);
  assert.match(migration, /creation_xid IS DISTINCT FROM pg_current_xact_id\(\)/); assert.match(migration, /imported_at IS DISTINCT FROM transaction_timestamp\(\)/);
  assert.match(migration, /actual IS DISTINCT FROM NEW.native_snapshot/); assert.match(migration, /to_jsonb\(s\) IS DISTINCT FROM to_jsonb\(jsonb_populate_record/);
  assert.match(migration, /EXISTS\(SELECT 1 FROM naijue_erp\.import_batch WHERE status='IMPORTED'\)/);
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp\.validate_native_party_import_commit/);
});
test('warehouse commits exact same-batch hall/source/import_record and neither creates app auth nor fake live receipts', () => {
  assert.match(migration, /warehouse lacks exact same-batch original hall identity/); assert.match(migration, /to_jsonb\(actual_record\) IS DISTINCT FROM to_jsonb\(jsonb_populate_record/);
  assert.match(migration, /NEW\."authorization" IS DISTINCT FROM jsonb_build_object/); assert.match(migration, /sourceRowId.*NEW.source_row_id/);
  assert.ok(!/INSERT INTO naijue_erp\.(user_account|operation_receipt|audit_change|inventory_ledger|inventory_balance)/.test(migration));
  assert.ok(!/ALTER TABLE naijue_erp\.(hall|warehouse|customer|supplier)|DROP CONSTRAINT/.test(migration));
});
