/** SQL-TEXT CONTRACT CHECKS ONLY. No SQL parser, PostgreSQL execution or engine evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const ddl = await readFile(new URL("../adapters/postgres/migrations/0006_party_maintenance.sql", import.meta.url), "utf8");
const original = await readFile(new URL("../adapters/postgres/migrations/0001_runtime_sales.sql", import.meta.url), "utf8");
const adapter = await readFile(new URL("../adapters/postgres/src/party-maintenance-store.ts", import.meta.url), "utf8");
const label = "party SQL-TEXT only, NOT engine evidence: ";
function body(name: string): string { const start = ddl.indexOf(`CREATE FUNCTION naijue_erp.${name}(`); assert.ok(start >= 0); const end = ddl.indexOf("\n$$;", start); assert.ok(end > start); return ddl.slice(start, end); }
test(label + "additive 0006, physically separate approved native fields, no seeds or re-coding", () => {
  assert.equal(createHash("sha256").update(original).digest("hex"), "7ebdaec27630149f20ad6aa67075c2c688a2ed40bcc4718c031987d9af3a5cbf");
  assert.match(ddl, /^-- VERSION 0006:/); assert.match(ddl, /Not executed against PostgreSQL; no engine evidence/);
  assert.match(original, /CREATE TABLE naijue_erp.customer \([\s\S]*?code text NOT NULL UNIQUE/); assert.match(original, /CREATE TABLE naijue_erp.supplier \([\s\S]*?code text NOT NULL UNIQUE/);
  const sql = ddl.split("\n").filter(line => !line.trimStart().startsWith("--")).join("\n");
  assert.deepEqual([...sql.matchAll(/INSERT INTO ([\w.]+)/g)].map(match => match[1]), ["naijue_erp.schema_migration"]);
  assert.doesNotMatch(sql, /CREATE TABLE|ADD COLUMN (?:usage|tags)|UPDATE naijue_erp\.(?:customer|supplier)\b|DROP (?:TABLE|SCHEMA)|TRUNCATE|DISABLE TRIGGER/);
  assert.match(sql, /VALUES \(6,/); assert.doesNotMatch(adapter, /new Pool|connectionString|process\.env|listen\(|readFile|0006_party/);
});
test(label + "closed CUSTOMER/SUPPLIER kinds have native generated FKs and constrained actions", () => {
  for (const [prefix, type, kind, target] of [["target", "target_type", "CUSTOMER", "customer"], ["target", "target_type", "SUPPLIER", "supplier"], ["object", "object_type", "CUSTOMER", "customer"], ["object", "object_type", "SUPPLIER", "supplier"]]) assert.match(ddl, new RegExp(`${prefix}_${target}_id uuid GENERATED ALWAYS AS \\(CASE WHEN ${type} = '${kind}' THEN ${prefix}_id END\\) STORED REFERENCES naijue_erp.${target}\\(id\\)`));
  assert.match(ddl, /target_type IN \('SALES', 'TRANSFER', 'CUSTOMER', 'SUPPLIER'\)/);
  assert.match(ddl, /target_type IN \('CUSTOMER', 'SUPPLIER'\) AND action IN \('CREATE', 'EDIT', 'DISABLE', 'RESTORE'\)/);
  assert.match(ddl, /object_type IN \('CUSTOMER', 'SUPPLIER'\) AND action IN \('CREATE', 'EDIT', 'DISABLE', 'RESTORE'\)/);
  assert.doesNotMatch(ddl, /DROP CONSTRAINT (?:receipt_requires_same_kind_audit|audit_receipt_kind_coherence|receipt_requires_audit)/);
  assert.match(ddl, /audit_customer_version/); assert.match(ddl, /audit_supplier_version/);
});
test(label + "runtime provenance preserves native ids/codes/creation time and bans hard delete", () => {
  const guard = body("keep_party_native_identity");
  assert.match(guard, /TG_OP = 'DELETE'/); assert.match(guard, /ROW\(NEW.id, NEW.code, NEW.created_at\) IS DISTINCT FROM ROW\(OLD.id, OLD.code, OLD.created_at\)/);
  assert.match(guard, /NEW.version::bigint <> OLD.version::bigint \+ 1/); assert.match(guard, /NEW.created_at IS NULL/);
  assert.match(ddl, /customer_native_identity BEFORE INSERT OR UPDATE OR DELETE/); assert.match(ddl, /supplier_native_identity BEFORE INSERT OR UPDATE OR DELETE/);
});
test(label + "enabled-hall default dependency is checked both ways under actual customer row locking", () => {
  assert.match(body("keep_party_native_identity"), /TG_TABLE_NAME = 'customer' AND OLD.enabled AND NOT NEW.enabled[\s\S]*WHERE enabled AND default_customer_id = NEW.id/);
  const hall = body("check_hall_default_customer_enabled"); assert.match(hall, /NEW.enabled AND NEW.default_customer_id IS NOT NULL/); assert.match(hall, /WHERE id = NEW.default_customer_id FOR SHARE/); assert.match(hall, /IF NOT customer_enabled/);
  assert.match(ddl, /BEFORE INSERT OR UPDATE OF default_customer_id, enabled ON naijue_erp.hall/);
});
test(label + "sparse native audit coherence does not build a full snapshot platform", () => {
  const native = body("validate_party_native_commit"); assert.match(native, /a.old_version IS DISTINCT FROM OLD.version/);
  assert.match(native, /jsonb_each\(prior_values\) WHERE value IS DISTINCT FROM next_values->key/); assert.match(native, /jsonb_each\(next_values\) WHERE value IS DISTINCT FROM prior_values->key/);
  assert.match(native, /a.before_values IS DISTINCT FROM expected_before/); assert.match(native, /a.after_values IS DISTINCT FROM expected_after/);
  assert.match(native, /a.action = 'EDIT'/); assert.match(native, /a.action = 'DISABLE'/); assert.match(native, /a.action = 'RESTORE'/);
  assert.match(native, /final_version IS DISTINCT FROM NEW.version/); assert.doesNotMatch(native, /lag\(|snapshot|previous_audit|version_history/i);
  assert.match(ddl, /customer_command_consistency AFTER INSERT OR UPDATE[\s\S]*DEFERRABLE INITIALLY DEFERRED/);
});
test(label + "party result and deferred receipts match final native facts with no inventory effect", () => {
  const receipt = body("validate_party_receipt_commit"); assert.match(receipt, /FROM naijue_erp.customer WHERE id = NEW.target_id/); assert.match(receipt, /FROM naijue_erp.supplier WHERE id = NEW.target_id/);
  assert.match(receipt, /a.object_type <> NEW.target_type/); assert.match(receipt, /a.actor_account_id <> NEW.actor_account_id/);
  assert.match(receipt, /NEW.result_data->>'version' IS DISTINCT FROM native_version::text/); assert.match(receipt, /NEW.result_data->>'code' IS DISTINCT FROM native_code/);
  assert.match(receipt, /EXISTS \(SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id\)/);
  assert.match(ddl, /party_receipt_final_consistency AFTER INSERT[\s\S]*WHEN \(NEW.target_type IN \('CUSTOMER', 'SUPPLIER'\)\)/);
  assert.match(ddl, /\) IS TRUE\)/);
});

test(label + "approved independent KH/GYS counters are native bigint sequences, not a general numbering platform", () => {
  for (const kind of ["customer", "supplier"]) assert.match(ddl, new RegExp(`CREATE SEQUENCE naijue_erp.${kind}_code_sequence AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;`));
  assert.match(ddl, /Six digits is a MINIMUM display width, not a 999999 business limit/);
  assert.match(ddl, /failed commands can leave gaps/);
  assert.match(body("keep_party_native_identity"), /PERFORM pg_advisory_xact_lock\(hashtextextended\('naijue:party-code:'/);
  assert.doesNotMatch(ddl, /CREATE TABLE .*number|ALTER TABLE naijue_erp\.(?:customer|supplier).*code/i);
});
test(label + "allocation uses the matching transaction lock and advances past exact imported suffixes without rewriting", () => {
  assert.match(adapter, /naijue:party-code:\$\{kind\}/); assert.match(adapter, /this.loaded\?\.kind === kind && this.loaded.previous === undefined/);
  assert.match(adapter, /last_value::text AS last_value, is_called FROM naijue_erp/);
  assert.match(adapter, /WHERE code ~ '\^\$\{prefix\}\[0-9\]\+\$'/);
  assert.match(adapter, /ORDER BY length\(ltrim\(substring/);
  assert.match(adapter, /SELECT setval\('naijue_erp.\$\{sequence\}'::regclass, \$1::bigint, true\)::text AS allocated/);
  assert.match(adapter, /reserved\?\.allocated === next.toString\(\)/);
});

test(label + "atomic EDIT allows changed name, state or both but rejects only a fully unchanged pair", () => {
  const native = body("validate_party_native_commit");
  assert.match(native, /a.action = 'EDIT' AND \(NEW.name IS NOT DISTINCT FROM OLD.name AND NEW.enabled IS NOT DISTINCT FROM OLD.enabled\)/);
  assert.doesNotMatch(native, /a.action = 'EDIT' AND \(NEW.name IS NOT DISTINCT FROM OLD.name OR NEW.enabled IS DISTINCT FROM OLD.enabled\)/);
  assert.match(body("keep_party_native_identity"), /TG_TABLE_NAME = 'customer' AND OLD.enabled AND NOT NEW.enabled/);
});
