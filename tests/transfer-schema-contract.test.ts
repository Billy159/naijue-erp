/** SQL-TEXT CONTRACT CHECKS ONLY. Not a SQL parser, PostgreSQL execution, locking, or constraint-engine evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const ddl = await readFile(new URL("../adapters/postgres/migrations/0004_transfer_runtime.sql", import.meta.url), "utf8");
const original = await readFile(new URL("../adapters/postgres/migrations/0001_runtime_sales.sql", import.meta.url), "utf8");
const pricing = await readFile(new URL("../adapters/postgres/migrations/0002_sales_pricing_facts.sql", import.meta.url), "utf8");
const adapter = await readFile(new URL("../adapters/postgres/src/transfer-unit-of-work.ts", import.meta.url), "utf8");
const postingBalances = await readFile(new URL("../adapters/postgres/src/inventory-posting-balances.ts", import.meta.url), "utf8");
const label = "transfer pg SQL-text contract, NOT engine evidence: ";
function table(name: string): string {
  const start = ddl.indexOf(`CREATE TABLE naijue_erp.${name} (`);
  assert.ok(start >= 0, `Missing native table ${name}`);
  const end = ddl.indexOf("\n);", start); assert.ok(end > start);
  return ddl.slice(start, end);
}
function body(name: string): string {
  const start = ddl.indexOf(`CREATE FUNCTION naijue_erp.${name}(`);
  assert.ok(start >= 0, `Missing function ${name}`);
  const end = ddl.indexOf("\n$$;", start); assert.ok(end > start);
  return ddl.slice(start, end);
}
const statements = ddl.split("\n").filter(line => !line.trimStart().startsWith("--")).join("\n");

test(label + "0004 is additive and immutable sales migrations stay byte-for-byte unchanged", () => {
  assert.equal(createHash("sha256").update(original).digest("hex"), "7ebdaec27630149f20ad6aa67075c2c688a2ed40bcc4718c031987d9af3a5cbf");
  assert.equal(createHash("sha256").update(pricing).digest("hex"), "14136328eafaf6db8957959d595226a51d6036c5dd44c21e70830c0640b88c98");
  assert.match(ddl, /^-- VERSION 0004:/); assert.match(ddl, /Not executed against PostgreSQL; no engine evidence/);
  assert.match(statements, /BEGIN;/); assert.match(statements, /COMMIT;/);
  assert.deepEqual([...statements.matchAll(/INSERT INTO ([\w.]+)/g)].map(match => match[1]), ["naijue_erp.schema_migration"]);
  assert.match(statements, /VALUES \(4,/);
  assert.doesNotMatch(statements, /DROP (?:TABLE|SCHEMA)|TRUNCATE|ALTER TABLE naijue_erp\.(?:sales_header|sales_line|auth_session)|DISABLE TRIGGER/i);
  assert.doesNotMatch(adapter, /new Pool|connectionString|process\.env|readFile|0004_transfer_runtime|listen\(/);
});

test(label + "native transfer headers store trusted runtime provenance without sales money/customer fields", () => {
  const header = table("transfer_header");
  for (const side of ["from", "to"]) assert.match(header, new RegExp(`${side}_warehouse_id uuid NOT NULL REFERENCES naijue_erp.warehouse\\(id\\)`));
  assert.match(header, /CHECK \(from_warehouse_id <> to_warehouse_id\)/);
  assert.match(header, /status IN \('DRAFT', 'APPROVED', 'VOID'\)/);
  assert.match(header, /version integer NOT NULL CHECK \(version > 0\), note text/);
  assert.match(header, /created_by_account_id uuid NOT NULL REFERENCES naijue_erp.user_account\(id\)/);
  assert.match(header, /created_hall_id uuid REFERENCES naijue_erp.hall\(id\)/);
  assert.match(header, /created_role IN \('ADMIN', 'WAREHOUSE', 'SALESPERSON'\)/);
  assert.match(header, /created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL/);
  assert.match(header, /approved_by_account_id uuid REFERENCES naijue_erp.user_account\(id\), approved_at timestamptz/);
  assert.match(header, /stock_basis IN \('RUNTIME_LEDGER', 'CUTOFF_HISTORY'\)/);
  assert.doesNotMatch(header, /jsonb|customer|salesperson|amount|price|discount|payment|settlement/);
});

test(label + "native lines retain positive bigint quantities, actual SKU identity, snapshots and inactive provenance", () => {
  const line = table("transfer_line");
  assert.match(line, /transfer_id uuid NOT NULL REFERENCES naijue_erp.transfer_header\(id\)/);
  assert.match(line, /sku_id uuid NOT NULL REFERENCES naijue_erp.sku\(id\)/);
  assert.match(line, /quantity bigint NOT NULL CHECK \(quantity > 0\)/);
  assert.match(line, /line_no integer NOT NULL CHECK \(line_no > 0\)/);
  for (const snapshot of ["product_code", "product_name", "color_name", "fit_name", "size_name"]) assert.match(line, new RegExp(`${snapshot}_snapshot text NOT NULL`));
  assert.match(line, /barcode_snapshot text, is_current boolean NOT NULL/);
  assert.match(line, /current_line_no integer GENERATED ALWAYS AS \(CASE WHEN is_current THEN line_no END\) STORED/);
  assert.match(line, /CONSTRAINT transfer_line_current_position UNIQUE \(transfer_id, current_line_no\) DEFERRABLE INITIALLY DEFERRED/);
  assert.doesNotMatch(line, /jsonb|99999|UNIQUE \(transfer_id, sku_id\)/);
  const guard = body("keep_transfer_line_owner");
  assert.match(guard, /TG_OP = 'DELETE'/);
  assert.match(guard, /NEW.id IS DISTINCT FROM OLD.id OR NEW.transfer_id IS DISTINCT FROM OLD.transfer_id/);
});

test(label + "generic target/object IDs have closed kind checks and generated real target FKs", () => {
  assert.match(ddl, /receipt_target_kind CHECK \(target_type IN \('SALES', 'TRANSFER'\)\)/);
  assert.match(ddl, /audit_object_kind CHECK \(object_type IN \('SALES', 'TRANSFER'\)\)/);
  for (const [prefix, kind, target] of [["target", "SALES", "sales"], ["target", "TRANSFER", "transfer"], ["object", "SALES", "sales"], ["object", "TRANSFER", "transfer"]]) {
    assert.match(ddl, new RegExp(`${prefix}_${target}_id uuid GENERATED ALWAYS AS \\(CASE WHEN ${prefix}_type = '${kind}' THEN ${prefix}_id END\\) STORED REFERENCES naijue_erp.${target}_header\\(id\\)`));
  }
  assert.match(ddl, /DROP CONSTRAINT operation_receipt_target_id_fkey/);
  assert.match(ddl, /DROP CONSTRAINT audit_change_object_id_fkey/);
  assert.doesNotMatch(ddl, /DROP COLUMN (?:target_id|object_id)|DROP CONSTRAINT operation_receipt_actor_account_id_request_key_key/);
  assert.match(original, /UNIQUE \(actor_account_id, request_key\)/);
});

test(label + "reciprocal deferred receipt/audit references include kind, target, actor and action", () => {
  assert.match(ddl, /receipt_kind_identity UNIQUE \(id, actor_account_id, target_type, target_id, action\)/);
  assert.match(ddl, /audit_kind_identity UNIQUE \(operation_id, object_type, object_id\)/);
  assert.match(ddl, /FOREIGN KEY \(operation_id, actor_account_id, object_type, object_id, action\)\s+REFERENCES naijue_erp.operation_receipt \(id, actor_account_id, target_type, target_id, action\) DEFERRABLE INITIALLY DEFERRED/);
  assert.match(ddl, /FOREIGN KEY \(id, target_type, target_id\) REFERENCES naijue_erp.audit_change \(operation_id, object_type, object_id\) DEFERRABLE INITIALLY DEFERRED/);
  assert.match(ddl, /CREATE UNIQUE INDEX audit_transfer_document_version[^;]+\(object_id, new_version\) WHERE object_type = 'TRANSFER'/);
  assert.doesNotMatch(ddl, /DROP (?:CONSTRAINT receipt_requires_audit|TRIGGER immutable_(?:ledger|audit|receipt))/);
});

test(label + "result shape requires salesId or transferId by kind and rejects missing/null identity", () => {
  assert.match(ddl, /a.attname = 'result_data'/);
  assert.match(ddl, /c.contype = 'c'/);
  assert.match(ddl, /receipt_result_by_kind CHECK/);
  assert.match(ddl, /result_data \?& ARRAY\['operationId', 'version', 'status', 'ledgerEntryIds'\]/);
  assert.match(ddl, /jsonb_typeof\(result_data->'operationId'\) = 'string'/);
  assert.match(ddl, /\(result_data->>'operationId'\) IS NOT DISTINCT FROM id::text/);
  assert.match(ddl, /jsonb_typeof\(result_data->'version'\) = 'number'/);
  for (const [kind, target, other] of [["SALES", "salesId", "transferId"], ["TRANSFER", "transferId", "salesId"]]) {
    assert.match(ddl, new RegExp(`WHEN '${kind}' THEN result_data \\? '${target}' AND NOT \\(result_data \\? '${other}'\\)`));
    assert.match(ddl, new RegExp(`jsonb_typeof\\(result_data->'${target}'\\) = 'string' AND \\(result_data->>'${target}'\\) IS NOT DISTINCT FROM target_id::text`));
  }
});

test(label + "ledger union is exclusive, FK-backed and preserves sales and exact reversal uniqueness", () => {
  assert.match(ddl, /ALTER COLUMN source_sales_line_id DROP NOT NULL/);
  assert.match(ddl, /ADD COLUMN source_transfer_line_id uuid REFERENCES naijue_erp.transfer_line\(id\)/);
  assert.match(ddl, /source_sales_line_id IS NOT NULL AND source_transfer_line_id IS NULL AND endpoint = 'SALES_WAREHOUSE'/);
  assert.match(ddl, /source_sales_line_id IS NULL AND source_transfer_line_id IS NOT NULL AND endpoint IN \('FROM', 'TO'\)/);
  assert.match(ddl, /UNIQUE \(operation_id, source_transfer_line_id, endpoint\)/);
  assert.match(original, /source_sales_line_id uuid NOT NULL REFERENCES naijue_erp.sales_line\(id\)/);
  assert.match(original, /UNIQUE \(operation_id, source_sales_line_id, endpoint\)/);
  assert.match(original, /reverses_entry_id uuid UNIQUE REFERENCES naijue_erp.inventory_ledger\(id\)/);
  assert.doesNotMatch(ddl, /DROP CONSTRAINT inventory_ledger_(?:source_sales_line_id_fkey|reverses_entry_id_key|reverses_entry_id_fkey|check)|DROP TRIGGER immutable_ledger/);
});

test(label + "original sales functions stay unchanged behind source/receipt kind dispatch", () => {
  assert.doesNotMatch(ddl, /CREATE(?: OR REPLACE)? FUNCTION naijue_erp.validate_sales_(?:effect|commit)\(/);
  assert.match(ddl, /CREATE TRIGGER validate_sales_ledger_source[^;]+WHEN \(NEW.source_sales_line_id IS NOT NULL\) EXECUTE FUNCTION naijue_erp.validate_sales_effect\(\)/);
  assert.match(ddl, /CREATE TRIGGER validate_transfer_ledger_source[^;]+WHEN \(NEW.source_transfer_line_id IS NOT NULL\) EXECUTE FUNCTION naijue_erp.validate_transfer_effect\(\)/);
  assert.match(ddl, /CREATE CONSTRAINT TRIGGER sales_receipt_final_consistency[^;]+DEFERRABLE INITIALLY DEFERRED[^;]+WHEN \(NEW.target_type = 'SALES'\) EXECUTE FUNCTION naijue_erp.validate_sales_commit\(\)/);
  assert.match(ddl, /CREATE CONSTRAINT TRIGGER transfer_receipt_final_consistency[^;]+WHEN \(NEW.target_type = 'TRANSFER'\) EXECUTE FUNCTION naijue_erp.validate_transfer_commit\(\)/);
  const coherence = body("validate_ledger_receipt_source");
  assert.match(coherence, /r.target_type <> 'SALES'/); assert.match(coherence, /r.target_type <> 'TRANSFER'/);
  assert.match(coherence, /owner_id IS DISTINCT FROM r.target_id OR NEW.event_kind <> r.action/);
  assert.match(coherence, /NEW.source_document_version::text IS DISTINCT FROM r.result_data->>'version'/);
});

test(label + "transfer insertion checks current native header/line, endpoint, quantity, date, version and runtime state", () => {
  const effect = body("validate_transfer_effect");
  assert.match(effect, /SELECT \* INTO STRICT ln[^;]+transfer_line[^;]+FOR SHARE/);
  assert.match(effect, /SELECT \* INTO STRICT h[^;]+transfer_header[^;]+FOR UPDATE/);
  assert.match(effect, /h.stock_basis <> 'RUNTIME_LEDGER' OR NOT ln.is_current OR ln.sku_id <> NEW.sku_id/);
  assert.match(effect, /WHEN 'FROM' THEN -ln.quantity::numeric WHEN 'TO' THEN ln.quantity::numeric/);
  assert.match(effect, /WHEN 'FROM' THEN h.from_warehouse_id WHEN 'TO' THEN h.to_warehouse_id/);
  assert.match(effect, /NEW.quantity_delta::numeric IS DISTINCT FROM expected_delta OR h.business_date <> NEW.business_date/);
  assert.match(effect, /h.version::bigint \+ 1 <> NEW.source_document_version/);
  assert.match(effect, /NEW.event_kind = 'APPROVE' AND h.status <> 'DRAFT'/);
  assert.match(effect, /NEW.event_kind = 'UNAPPROVE' AND h.status <> 'APPROVED'/);
  assert.match(effect, /inventory_balance[^;]+FOR UPDATE/);
  assert.match(effect, /IF NOT FOUND THEN RAISE EXCEPTION 'transfer inventory coverage is not ready'/);
});

test(label + "one reversal means exact original kind, line, endpoint, warehouse, SKU, date, version and signed inverse", () => {
  const reversal = body("validate_exact_native_reversal");
  assert.match(reversal, /original.event_kind <> 'APPROVE'/);
  assert.match(reversal, /original.source_sales_line_id IS DISTINCT FROM NEW.source_sales_line_id/);
  assert.match(reversal, /original.source_transfer_line_id IS DISTINCT FROM NEW.source_transfer_line_id/);
  assert.match(reversal, /original.endpoint IS DISTINCT FROM NEW.endpoint/);
  assert.match(reversal, /original.warehouse_id <> NEW.warehouse_id OR original.sku_id <> NEW.sku_id/);
  assert.match(reversal, /original.business_date <> NEW.business_date/);
  assert.match(reversal, /original.quantity_delta::numeric \+ NEW.quantity_delta::numeric <> 0/);
  assert.match(body("validate_transfer_effect"), /original.source_document_version <> h.version/);
});

test(label + "final receipts require exact sorted ledger IDs and one FROM/TO pair per current actual line", () => {
  const commit = body("validate_transfer_commit");
  assert.match(commit, /jsonb_agg\(id::text ORDER BY id\)/);
  assert.match(commit, /jsonb_agg\(value ORDER BY value\)/);
  assert.match(commit, /current_lines = 0 OR actual_ids <> receipt_ids/);
  assert.match(commit, /NEW.action IN \('SAVE', 'VOID'\) AND count_effects <> 0/);
  assert.match(commit, /NEW.action IN \('APPROVE', 'UNAPPROVE'\) AND count_effects <> current_lines \* 2/);
  assert.match(commit, /CROSS JOIN \(VALUES \('FROM'\), \('TO'\)\) required\(endpoint\)/);
  assert.match(commit, /l.source_transfer_line_id = tl.id AND l.endpoint = required.endpoint/);
  assert.match(commit, /l.source_sales_line_id IS NOT NULL OR tl.transfer_id IS DISTINCT FROM h.id OR NOT tl.is_current/);
  assert.match(commit, /l.event_kind <> NEW.action OR l.source_document_version <> h.version OR l.sku_id <> tl.sku_id OR l.business_date <> h.business_date/);
  assert.match(commit, /b.last_operation_id IS DISTINCT FROM NEW.id/);
});

test(label + "final status, version, actors, times and selected native header key fields agree", () => {
  const commit = body("validate_transfer_commit");
  assert.match(commit, /NEW.result_data->>'version' IS DISTINCT FROM h.version::text OR NEW.result_data->>'status' IS DISTINCT FROM h.status/);
  assert.match(commit, /a.new_version <> h.version OR a.actor_account_id <> NEW.actor_account_id OR a.object_type <> 'TRANSFER'/);
  assert.match(commit, /h.updated_at IS DISTINCT FROM NEW.completed_at OR a.occurred_at IS DISTINCT FROM NEW.completed_at/);
  assert.match(commit, /h.approved_by_account_id IS DISTINCT FROM NEW.actor_account_id OR h.approved_at IS DISTINCT FROM NEW.completed_at/);
  assert.match(commit, /h.created_by_account_id IS DISTINCT FROM NEW.actor_account_id OR h.created_at IS DISTINCT FROM NEW.completed_at/);
  assert.match(commit, /l.posted_at IS DISTINCT FROM NEW.completed_at/);
  assert.match(commit, /WHEN 'APPROVE' THEN 'APPROVED' WHEN 'VOID' THEN 'VOID' ELSE 'DRAFT'/);
  assert.match(commit, /WHEN 'UNAPPROVE' THEN 'APPROVED' ELSE 'DRAFT'/);
  assert.match(commit, /a.after_values->'header' IS DISTINCT FROM naijue_erp.transfer_header_audit_values\(h\)/);
  const header = body("validate_transfer_header_commit");
  assert.match(header, /r.target_type <> 'TRANSFER' OR r.target_id <> NEW.id OR r.actor_account_id <> a.actor_account_id OR r.action <> a.action/);
  assert.match(header, /a.after_values->'header' IS DISTINCT FROM naijue_erp.transfer_header_audit_values\(NEW\)/);
  assert.match(header, /a.old_version IS DISTINCT FROM OLD.version OR a.before_values->'header' IS DISTINCT FROM naijue_erp.transfer_header_audit_values\(OLD\)/);
  assert.match(ddl, /transfer_header_command_consistency AFTER INSERT OR UPDATE[^;]+DEFERRABLE INITIALLY DEFERRED/);
});

test(label + "sparse changed-line audits never require full-document or previous-draft reconstruction", () => {
  const commit = body("validate_transfer_commit");
  assert.match(commit, /before_lines := COALESCE\(a.before_values->'lines', '\[\]'::jsonb\)/);
  assert.match(commit, /after_lines := a.after_values->'lines'/);
  assert.match(commit, /NEW.action <> 'SAVE' AND \(before_lines <> '\[\]'::jsonb OR after_lines <> '\[\]'::jsonb\)/);
  assert.match(commit, /LEFT JOIN naijue_erp.transfer_line ln ON ln.id::text = delta.value->>'id' AND ln.transfer_id = h.id/);
  assert.match(commit, /delta.value IS DISTINCT FROM naijue_erp.transfer_line_audit_values\(ln\)/);
  assert.match(commit, /NOT EXISTS \(SELECT 1 FROM jsonb_array_elements\(after_lines\) AS next\(value\) WHERE next.value->>'id' = prior.value->>'id'\)/);
  assert.match(commit, /GROUP BY delta.value->>'id' HAVING COUNT\(\*\) > 1/);
  assert.match(commit, /WHERE next.value = prior.value/);
  assert.doesNotMatch(ddl, /canonical_transfer_audit|transfer_native_audit|assert_transfer_final_snapshot|previous_snapshot|SELECT after_values INTO/);
  const singleRow = body("transfer_line_audit_values");
  assert.match(singleRow, /'quantity', \(source_row\).quantity::text/);
  assert.match(singleRow, /'isCurrent', \(source_row\).is_current/);
  assert.doesNotMatch(singleRow, /jsonb_agg|FROM naijue_erp.transfer_line/);
});

test(label + "every material native line mutation requires exact OLD/NEW sparse SAVE evidence", () => {
  const mutation = body("validate_transfer_line_commit");
  assert.match(mutation, /transfer_line_audit_values\(OLD\) IS NOT DISTINCT FROM naijue_erp.transfer_line_audit_values\(NEW\) THEN RETURN NULL/);
  assert.match(mutation, /h.stock_basis <> 'RUNTIME_LEDGER' OR h.status <> 'DRAFT' OR a.action <> 'SAVE'/);
  assert.match(mutation, /r.target_type <> 'TRANSFER' OR r.target_id <> h.id OR r.action <> 'SAVE' OR r.actor_account_id <> a.actor_account_id/);
  assert.match(mutation, /object_type = 'TRANSFER' AND object_id = h.id AND new_version = h.version/);
  assert.match(mutation, /after_count <> 1 OR after_line IS DISTINCT FROM naijue_erp.transfer_line_audit_values\(NEW\)/);
  assert.match(mutation, /IF TG_OP = 'INSERT' THEN\s+IF before_count <> 0/);
  assert.match(mutation, /before_count <> 1 OR before_line IS DISTINCT FROM naijue_erp.transfer_line_audit_values\(OLD\)/);
  assert.match(ddl, /transfer_line_command_consistency AFTER INSERT OR UPDATE[^;]+DEFERRABLE INITIALLY DEFERRED[^;]+validate_transfer_line_commit/);
});

test(label + "creator/owner provenance cannot mutate and posting actions cannot edit native business facts", () => {
  const guard = body("keep_transfer_header_provenance");
  assert.match(guard, /NEW.stock_basis <> 'RUNTIME_LEDGER'/);
  assert.match(guard, /NEW.version <> 1 OR NEW.status <> 'DRAFT'/);
  assert.match(guard, /NEW.created_by_account_id, NEW.created_hall_id, NEW.created_role, NEW.created_at, NEW.stock_basis/);
  assert.match(guard, /OLD.created_by_account_id, OLD.created_hall_id, OLD.created_role, OLD.created_at, OLD.stock_basis/);
  assert.match(guard, /NEW.version::bigint <> OLD.version::bigint \+ 1 OR OLD.status = 'VOID'/);
  assert.match(guard, /OLD.status = 'APPROVED' AND NEW.status <> 'DRAFT'/);
  assert.match(guard, /NOT \(OLD.status = 'DRAFT' AND NEW.status = 'DRAFT'\)/);
  assert.match(guard, /NEW.number, NEW.business_date, NEW.from_warehouse_id, NEW.to_warehouse_id, NEW.note/);
  assert.match(body("validate_transfer_header_commit"), /a.before_values->'header' IS DISTINCT FROM naijue_erp.transfer_header_audit_values\(OLD\)/);
});

test(label + "transfer-only cumulative balance guard preserves negative quantities and unproven missing coverage", () => {
  const balance = body("validate_transfer_balance_commit");
  assert.match(balance, /OLD.last_operation_id IS NOT DISTINCT FROM NEW.last_operation_id THEN RETURN NULL/);
  assert.match(balance, /IF r.target_type <> 'TRANSFER' THEN RETURN NULL/);
  assert.match(balance, /SUM\(quantity_delta::numeric\)/);
  assert.match(balance, /final_balance.quantity::numeric <> OLD.quantity::numeric \+ total/);
  assert.match(balance, /final_balance.version::numeric <> OLD.version::numeric \+ effects/);
  assert.doesNotMatch(statements, /INSERT INTO naijue_erp.inventory_balance|GREATEST\(|CHECK \(quantity_delta > 0\)|ALTER TABLE naijue_erp.inventory_balance[^;]+(?:DEFAULT|CHECK)/);
  assert.doesNotMatch(adapter, /INSERT INTO naijue_erp.inventory_balance|GREATEST\(|Math\.max/);
  assert.match(adapter, /new PostgresPostingBalances/);
  assert.match(postingBalances, /this.provenZero.has\(identity\) && first && row.version === 1/);
  assert.match(postingBalances, /schema_migration WHERE version = 8/);
  assert.match(postingBalances, /ORDER BY b.warehouse_id, b.sku_id FOR UPDATE OF b/);
  assert.match(postingBalances, /WHERE warehouse_id = \$1 AND sku_id = \$2 AND version = \$7/);
});
