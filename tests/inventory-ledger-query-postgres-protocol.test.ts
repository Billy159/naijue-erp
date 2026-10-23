import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PostgresInventoryLedgerQueryReader } from "../adapters/postgres/src/inventory-ledger-query-reader.ts";
import type { PgInventoryLedgerQueryClient, PgInventoryLedgerQueryPool, PgInventoryLedgerQueryResult } from "../adapters/postgres/src/inventory-ledger-query-reader.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { inventoryLedgerBefore } from "../packages/application/src/inventory-ledger-query-validation.ts";
import { inventoryId, ledgerBatchId, ledgerEntry, ledgerParameters, ledgerNumberedParameters, ledgerDisplayEntry, ledgerRead, ledgerSnapshot, ledgerWarehouse } from "./support/synthetic-inventory-ledger-query.ts";
import type { InventoryLedgerEntry } from "../packages/application/src/inventory-ledger-query-contracts.ts";
import type { NativeRuntime26Capability } from "../packages/application/src/native-import-schema-contract.ts";

// SCRIPTED DRIVER ONLY: this does not connect to PostgreSQL or prove SQL execution, isolation, indexes or performance.
type Row = Record<string, unknown>;
const stages = (pool: ScriptedPool) => pool.calls.map(call => /\/\* inventory(?:-ledger|-admission)?:([a-z-]+) \*\//.exec(call.sql)?.[1] ?? call.sql);
const code = (expected: string) => (error: unknown) => error instanceof DomainError && error.code === expected;
function nativeEntry(entry: InventoryLedgerEntry): Row {
  const history = entry.source.kind === "HISTORY_REVISION" ? entry.source : null;
  return { id: entry.id, operation_id: entry.operationId, event_kind: entry.eventKind, warehouse_id: ledgerWarehouse.id, sku_id: ledgerParameters().skuId,
    quantity_delta: entry.quantityDelta, source_sales_line_id: entry.source.kind === "SALES" ? entry.source.salesLineId : null,
    source_sales_id: entry.source.kind === "SALES" ? entry.source.salesId : null, source_transfer_line_id: entry.source.kind === "TRANSFER" ? entry.source.transferLineId : null,
    source_transfer_id: entry.source.kind === "TRANSFER" ? entry.source.transferId : null, source_import_batch_id: entry.source.kind === "CUTOFF_BASELINE" ? entry.source.importBatchId : null,
    source_history_revision_id: history?.revisionId ?? null, source_history_sales_line_id: history?.documentKind === "SALES" ? history.salesLineId : null,
    source_history_transfer_line_id: history?.documentKind === "TRANSFER" ? history.transferLineId : null,
    history_revision_id: history?.revisionId ?? null, history_document_kind: history?.documentKind ?? null,
    history_revision_operation_id: history ? entry.operationId : null, history_revision_version: history ? entry.sourceDocumentVersion : null,
    history_sales_id: history?.documentKind === "SALES" ? history.salesId : null, history_revision_sales_id: history?.documentKind === "SALES" ? history.salesId : null,
    history_transfer_id: history?.documentKind === "TRANSFER" ? history.transferId : null, history_revision_transfer_id: history?.documentKind === "TRANSFER" ? history.transferId : null,
    history_sales_batch_id: history?.documentKind === "SALES" ? ledgerBatchId : null, history_transfer_batch_id: history?.documentKind === "TRANSFER" ? ledgerBatchId : null,
    endpoint: entry.source.endpoint, source_document_version: entry.sourceDocumentVersion, reverses_entry_id: entry.reversesEntryId, business_date: entry.businessDate, posted_at: entry.postedAt };
}
function historyEntries(): InventoryLedgerEntry[] {
  return [{ ...ledgerEntry(0), eventKind: "HISTORY_REVISION", sourceDocumentVersion: 2, source: { kind: "HISTORY_REVISION", documentKind: "SALES", revisionId: inventoryId("operation", 12000), salesId: inventoryId("sales", 12001), salesLineId: inventoryId("salesLine", 12002), endpoint: "SALES_WAREHOUSE" } },
    { ...ledgerEntry(1), eventKind: "HISTORY_REVISION", sourceDocumentVersion: 3, source: { kind: "HISTORY_REVISION", documentKind: "TRANSFER", revisionId: inventoryId("operation", 12003), transferId: inventoryId("transfer", 12004), transferLineId: inventoryId("transferLine", 12005), endpoint: "FROM" } }];
}
class ScriptedPool implements PgInventoryLedgerQueryPool, PgInventoryLedgerQueryClient {
  calls: { sql: string; values: unknown[] }[] = []; releases: (Error | boolean | undefined)[] = []; connects = 0;
  entries: InventoryLedgerEntry[] = [ledgerEntry(0), ledgerEntry(1, "TRANSFER"), ledgerEntry(2, "CUTOFF_BASELINE")];
  transform: ((stage: string, rows: Row[]) => Row[]) | undefined;
  failAt: string | undefined; failRollback = false; afterQuery: ((stage: string) => void) | undefined;
  async connect() { this.connects++; return this; }
  release(error?: Error | boolean) { this.releases.push(error); }
  async query(sql: string, values: unknown[] = []): Promise<PgInventoryLedgerQueryResult> {
    this.calls.push({ sql, values: structuredClone(values) }); const stage = /\/\* inventory(?:-ledger|-admission)?:([a-z-]+) \*\//.exec(sql)?.[1] ?? sql;
    if (stage === this.failAt || (stage === "ROLLBACK" && this.failRollback)) throw new Error(`SYNTHETIC PRIVATE ${stage} failure`);
    let rows: Row[];
    switch (stage) {
      case "warehouse": rows = [{ id: ledgerWarehouse.id, hall_id: ledgerWarehouse.hallId, name: ledgerWarehouse.label }]; break;
      case "sku": {
        const s = ledgerSnapshot(ledgerRead()).data.sku;
        rows = [{ id: s.id, sku_code: s.code, product_id: s.product.id, product_code: s.product.code, product_name: s.product.name,
          color_id: s.color.id, color_name: s.color.label, fit_id: s.fit.id, fit_code: s.fit.code, fit_name: s.fit.label,
          size_group_id: s.sizeGroup.id, size_group_name: s.sizeGroup.label, size_id: s.size.id, size_code: s.size.code, size_name: s.size.label, size_member: true }]; break;
      }
      case "publication": {
        const counts = { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 1 };
        rows = [{ id: ledgerBatchId, completed: true, final_approval: true, warehouse_published: true, sku_published: true,
          checkpoint: { sequence: 3, cursor: 4, counts, expected: counts } }]; break;
      }
      case "guards": rows = [{ integrity_guards_present: true }]; break;
      case "keys": rows = (values[0] as string[]).map((warehouseId, i) => ({ warehouse_id: warehouseId, sku_id: (values[1] as string[])[i], admitted: true, published_batch_id: ledgerBatchId,
        warehouse_basis: "POST_CUTOFF_CREATED", sku_basis: "POST_CUTOFF_CREATED", warehouse_created_operation_id: inventoryId("operation", 15000), sku_created_operation_id: inventoryId("operation", 15001) })); break;
      case "entries": {
        const after = values[3] === null ? null : { postedAt: values[3] as string, entryId: values[4] as InventoryLedgerEntry["id"] };
        rows = this.entries.filter(entry => after === null || inventoryLedgerBefore({ postedAt: entry.postedAt, entryId: entry.id }, after)).slice(0, Number(values[5])).map(nativeEntry); break;
      }
      case "filtered-count":
      case "numbered-entries": {
        const filtered = this.entries.filter(entry => {
          const d = entry.display!;
          return (values[3] === null || d.date >= String(values[3])) && (values[4] === null || d.date <= String(values[4]))
            && (values[5] === null || d.businessType === values[5]) && d.sourceNumber!.toLowerCase().includes(String(values[6]).toLowerCase());
        });
        rows = stage === "filtered-count" ? [{ total: String(filtered.length) }] : filtered.slice(Number(values[8]), Number(values[8]) + Number(values[7])).map(entry => ({
          ...nativeEntry(entry), display_date: entry.display!.date, display_business_type: entry.display!.businessType,
          display_source_number: entry.display!.sourceNumber, display_operator_account_id: entry.display!.operator.accountId, display_operator_name: entry.display!.operator.name
        })); break;
      }
      default: assert.ok(["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "COMMIT", "ROLLBACK"].includes(stage), `Unexpected scripted SQL stage ${stage}`); rows = [];
    }
    rows = this.transform?.(stage, rows) ?? rows; this.afterQuery?.(stage); return { rows, rowCount: rows.length };
  }
}

test("SCRIPTED ledger numbered: authority-scoped same-snapshot predicates/count and20 rows preserve exact source type and unknown transitions", async () => {
  const pool = new ScriptedPool(); pool.entries = Array.from({ length: 45 }, (_, n) => ledgerDisplayEntry(n));
  // Return type is a source fact even though the original synthetic delta is negative.
  const result = await new PostgresInventoryLedgerQueryReader(pool).readLedger(ledgerRead(ledgerNumberedParameters({ page: 2,
    filter: { dateFrom: "2026-10-21", dateTo: "2026-10-21", businessType: "RETURN", source: "synthetic-return" } })));
  assert.equal(result.data.filteredTotal, "45"); assert.equal(result.data.page, 2); assert.equal(result.data.entries.length, 20);
  assert.equal(result.data.entries[0]!.id, pool.entries[20]!.id); assert.equal(result.data.nextCursor, null);
  assert.deepEqual(result.data.entries[0]!.display!.balanceTransition, { state: "UNKNOWN", before: null, after: null, reason: "NO_RECORDED_BALANCE_TRANSITION" });
  assert.equal(result.data.entries[0]!.display!.navigation, "NOT_CHECKED"); assert.equal(result.data.entries[0]!.display!.operator.labelBasis, "CURRENT_REFERENCE");
  const count = pool.calls.find(c => c.sql.includes("inventory-ledger:filtered-count"))!, page = pool.calls.find(c => c.sql.includes("inventory-ledger:numbered-entries"))!;
  assert.equal(count.sql.slice(count.sql.indexOf("WITH ledger_display"), count.sql.indexOf(" SELECT count(*)")), page.sql.slice(page.sql.indexOf("WITH ledger_display"), page.sql.indexOf(" SELECT *")));
  assert.deepEqual(page.values.slice(0, 7), count.values); assert.deepEqual(page.values.slice(7), [20, "20"]);
  assert.ok(count.sql.includes("w.hall_id = $2::uuid") && count.sql.includes("l.sku_id = $3::uuid") && count.sql.includes("'Asia/Shanghai'") && count.sql.includes("l.business_date"));
  assert.ok(count.sql.includes("sh.business_type") && count.sql.includes("l.endpoint='TO'") && !count.sql.includes("quantity_delta>"));
  assert.ok(count.sql.includes("receipt.actor_account_id") && !count.sql.includes("created_by_account_id"));
  assert.ok(![count, page].some(c => /inventory_balance|SUM\(|INSERT INTO|UPDATE naijue|DELETE FROM/.test(c.sql)));
  assert.deepEqual(pool.releases, [undefined]); assert.equal(stages(pool).filter(s => s === "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY").length, 1);
});

test("SCRIPTED ledger numbered: filters, empty/out-of-range pages and exact count are independent of page rows", async () => {
  for (const [page, count] of [[1, 20], [3, 5], [4, 0]] as const) {
    const pool = new ScriptedPool(); pool.entries = Array.from({ length: 45 }, (_, n) => ledgerDisplayEntry(n));
    const snapshot = await new PostgresInventoryLedgerQueryReader(pool).readLedger(ledgerRead(ledgerNumberedParameters({ page })));
    assert.equal(snapshot.data.filteredTotal, "45"); assert.equal(snapshot.data.entries.length, count);
  }
  for (const filter of [{ dateFrom: "2026-10-22", dateTo: null, businessType: null, source: "" },
    { dateFrom: null, dateTo: null, businessType: "SALE" as const, source: "" },
    { dateFrom: null, dateTo: null, businessType: null, source: "';%_任意" }]) {
    const pool = new ScriptedPool(); pool.entries = [ledgerDisplayEntry()];
    const snapshot = await new PostgresInventoryLedgerQueryReader(pool).readLedger(ledgerRead(ledgerNumberedParameters({ filter })));
    assert.equal(snapshot.data.filteredTotal, "0"); assert.deepEqual(snapshot.data.entries, []);
    assert.ok(pool.calls.filter(c => c.sql.includes("ledger_display")).every(c => !c.sql.includes("';%_任意")));
  }
});

test("SCRIPTED ledger numbered: contradictory count/display or read failure rejects and releases without partial data", async () => {
  for (const mutation of ["count", "businessType", "operator", "identity", "unknown"] as const) {
    const pool = new ScriptedPool(); pool.entries = [ledgerDisplayEntry()];
    pool.transform = (stage, rows) => mutation === "count" && stage === "filtered-count" ? [{ total: "2" }]
      : stage !== "numbered-entries" ? rows : rows.map(row => ({ ...row,
        ...(mutation === "businessType" ? { display_business_type: "guessed-from-sign" } : {}),
        ...(mutation === "operator" ? { display_operator_account_id: "not-uuid" } : {}),
        ...(mutation === "identity" ? { sku_id: inventoryId("sku", 999) } : {}),
        ...(mutation === "unknown" ? { display_operator_account_id: null, display_operator_name: "fabricated operator" } : {}) }));
    await assert.rejects(new PostgresInventoryLedgerQueryReader(pool).readLedger(ledgerRead(ledgerNumberedParameters({ filter: {
      dateFrom: null, dateTo: null, businessType: null, source: "SYNTHETIC" } }))));
    assert.equal(stages(pool).at(-1), "ROLLBACK"); assert.deepEqual(pool.releases, [undefined]);
  }
  const failed = new ScriptedPool(); failed.entries = [ledgerDisplayEntry()]; failed.failAt = "numbered-entries";
  await assert.rejects(new PostgresInventoryLedgerQueryReader(failed).readLedger(ledgerRead(ledgerNumberedParameters())), /numbered-entries/);
  assert.equal(stages(failed).at(-1), "ROLLBACK"); assert.deepEqual(failed.releases, [undefined]);
});

test("SCRIPTED ledger native key admission: existing verified runtime and one same-snapshot exact key decision admit genuine new dimensions without granting legacy or fabricating entries", async () => {
  // Injected protocol test double only: this supplies no actual runtime/PG grant.
  const runtime = (pool: ScriptedPool, verify: () => void = () => {}): NativeRuntime26Capability => ({ profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady(client, purpose) {
    assert.equal(client, pool); assert.equal(purpose, "INVENTORY_ADMISSION"); assert.equal(stages(pool).at(-1), "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); verify();
  } });
  for (const [warehouseBasis, skuBasis] of [["CUTOFF_MEMBER", "POST_CUTOFF_CREATED"], ["POST_CUTOFF_CREATED", "CUTOFF_MEMBER"], ["POST_CUTOFF_CREATED", "POST_CUTOFF_CREATED"]]) {
    const pool = new ScriptedPool(); let ready = 0;
    pool.transform = (stage, rows) => stage === "publication" ? rows.map(row => ({ ...row, warehouse_published: warehouseBasis === "CUTOFF_MEMBER", sku_published: skuBasis === "CUTOFF_MEMBER" }))
      : stage === "keys" ? rows.map(row => ({ ...row, warehouse_basis: warehouseBasis, sku_basis: skuBasis,
        warehouse_created_operation_id: warehouseBasis === "CUTOFF_MEMBER" ? null : row.warehouse_created_operation_id, sku_created_operation_id: skuBasis === "CUTOFF_MEMBER" ? null : row.sku_created_operation_id })) : rows;
    const result = await new PostgresInventoryLedgerQueryReader(pool, runtime(pool, () => { ready++; })).readLedger(ledgerRead());
    assert.equal(ready, 1); assert.equal(result.data.entries[0]!.quantityDelta, "-9223372036854775808"); assert.equal(result.data.entries[0]!.postedAt, "2026-10-20T18:20:30.123456Z");
    const keys = pool.calls.filter(call => call.sql.includes("inventory-admission:keys")); assert.equal(keys.length, 1); assert.deepEqual(keys[0]!.values, [[ledgerWarehouse.id], [ledgerParameters().skuId]]); assert.deepEqual(pool.releases, [undefined]);
    assert.ok(pool.calls.every(call => !/\bINSERT\s+INTO|\bUPDATE\s+naijue_erp|\bDELETE\s+FROM/i.test(call.sql)));
  }
  const legacy = new ScriptedPool(); legacy.transform = (stage, rows) => stage === "publication" ? rows.map(row => ({ ...row, sku_published: false })) : rows;
  await assert.rejects(new PostgresInventoryLedgerQueryReader(legacy).readLedger(ledgerRead()), code("INVENTORY_NOT_READY")); assert.equal(stages(legacy).includes("keys"), false); assert.equal(stages(legacy).includes("entries"), false);
  const mutations: ((rows: Row[]) => Row[])[] = [
    rows => rows.map(row => ({ ...row, admitted: false })), rows => rows.map(row => ({ ...row, published_batch_id: inventoryId("operation", 999) })),
    rows => rows.map(row => ({ ...row, warehouse_id: inventoryId("warehouse", 999) })), rows => rows.map(row => ({ ...row, sku_created_operation_id: null })), _rows => []
  ];
  for (const mutate of mutations) { const pool = new ScriptedPool(); pool.transform = (stage, rows) => stage === "keys" ? mutate(rows) : rows;
    await assert.rejects(new PostgresInventoryLedgerQueryReader(pool, runtime(pool)).readLedger(ledgerRead())); assert.equal(stages(pool).includes("entries"), false); assert.equal(stages(pool).at(-1), "ROLLBACK"); assert.deepEqual(pool.releases, [undefined]);
  }
  const denied = new ScriptedPool(); await assert.rejects(new PostgresInventoryLedgerQueryReader(denied, runtime(denied, () => { throw Error("HOST_NOT_READY"); })).readLedger(ledgerRead()), /HOST_NOT_READY/);
  assert.deepEqual(stages(denied), ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "ROLLBACK"]);
  const booleanGrant = new ScriptedPool(); await assert.rejects(new PostgresInventoryLedgerQueryReader(booleanGrant, { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady() { return true; } } as unknown as NativeRuntime26Capability).readLedger(ledgerRead()), /without a boolean substitute/); assert.equal(stages(booleanGrant).includes("keys"), false);
  const empty = new ScriptedPool(); empty.entries = []; const result = await new PostgresInventoryLedgerQueryReader(empty, runtime(empty)).readLedger(ledgerRead()); assert.deepEqual(result.data.entries, []); assert.equal(result.data.nextCursor, null);
});

test("SCRIPTED ledger history revision: both exact historical variants preserve signed quantities, microsecond keyset and old baseline", async () => {
  const pool = new ScriptedPool(); pool.entries = [...historyEntries(), ledgerEntry(2, "CUTOFF_BASELINE")]; const reader = new PostgresInventoryLedgerQueryReader(pool);
  const first = await reader.readLedger(ledgerRead(ledgerParameters({ pageSize: 1 }))); assert.deepEqual(first.data.entries, [pool.entries[0]]); assert.ok(first.data.nextCursor);
  const second = await reader.readLedger(ledgerRead(ledgerParameters({ pageSize: 1, after: first.data.nextCursor }))); assert.deepEqual(second.data.entries, [pool.entries[1]]); assert.ok(second.data.nextCursor);
  const third = await reader.readLedger(ledgerRead(ledgerParameters({ pageSize: 1, after: second.data.nextCursor }))); assert.equal(third.data.entries[0]!.source.kind, "CUTOFF_BASELINE"); assert.equal(third.data.nextCursor, null);
  assert.equal(first.data.entries[0]!.quantityDelta, "-9223372036854775808"); assert.equal(first.data.entries[0]!.postedAt, "2026-10-20T18:20:30.123456Z");
  const sql = pool.calls.find(call => call.sql.includes("inventory-ledger:entries"))!.sql;
  assert.ok(sql.includes("LEFT JOIN naijue_erp.history_revision") && sql.includes("LEFT JOIN naijue_erp.history_sales_line") && sql.includes("LEFT JOIN naijue_erp.history_transfer_line"));
  assert.ok(sql.includes("l.warehouse_id = $1::uuid AND w.hall_id = $2::uuid AND l.sku_id = $3::uuid") && sql.includes("ORDER BY l.posted_at DESC, l.id DESC LIMIT $6"));
  assert.equal(/event_kind\s*(?:!=|<>)|OFFSET|COUNT\(/i.test(sql), false);
});

test("SCRIPTED ledger history revision: missing or mixed revision/source/operation/version/batch relationships reject the whole page", async () => {
  const mutations: ((row: Row) => Row)[] = [
    row => ({ ...row, history_revision_id: null }), row => ({ ...row, source_history_revision_id: null }),
    row => ({ ...row, history_revision_operation_id: inventoryId("operation", 999) }), row => ({ ...row, history_revision_version: 99 }),
    row => ({ ...row, history_revision_sales_id: inventoryId("sales", 999) }), row => ({ ...row, history_sales_batch_id: inventoryId("operation", 999) }),
    row => ({ ...row, source_import_batch_id: ledgerBatchId }), row => ({ ...row, source_history_transfer_line_id: inventoryId("transferLine", 999) }),
    row => ({ ...row, event_kind: "APPROVE" }), row => ({ ...row, source_document_version: 1, history_revision_version: 1 }),
    row => ({ ...row, reverses_entry_id: inventoryId("ledger", 999) }), row => ({ ...row, endpoint: "FROM" })
  ];
  for (const mutate of mutations) {
    const pool = new ScriptedPool(); pool.entries = historyEntries(); pool.transform = (stage, rows) => stage === "entries" ? rows.map((row, n) => n === 0 ? mutate(row) : row) : rows;
    await assert.rejects(new PostgresInventoryLedgerQueryReader(pool).readLedger(ledgerRead())); assert.equal(stages(pool).at(-1), "ROLLBACK"); assert.equal(stages(pool).includes("COMMIT"), false);
  }
  const pool = new ScriptedPool(); pool.entries = historyEntries(); pool.transform = (stage, rows) => stage === "entries" ? rows.map((row, n) => n === 1 ? { ...row, history_transfer_id: null } : row) : rows;
  await assert.rejects(new PostgresInventoryLedgerQueryReader(pool).readLedger(ledgerRead(ledgerParameters({ pageSize: 1 })))); assert.equal(stages(pool).at(-1), "ROLLBACK");
});

test("SCRIPTED ledger PG: inert constructor, same native exact-key RR READ ONLY snapshot and three distinct provenance variants", async () => {
  const pool = new ScriptedPool(); const reader = new PostgresInventoryLedgerQueryReader(pool); assert.equal(pool.connects, 0);
  const result = await reader.readLedger(ledgerRead()); assert.equal(pool.connects, 1);
  assert.deepEqual(stages(pool), ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "warehouse", "sku", "publication", "guards", "entries", "COMMIT"]);
  assert.deepEqual(pool.releases, [undefined]); assert.equal(result.readiness, "ready"); assert.notEqual(result.readReference, ledgerBatchId);
  assert.deepEqual(result.data.entries.map(entry => entry.source.kind), ["SALES", "TRANSFER", "CUTOFF_BASELINE"]);
  assert.equal(result.data.entries[0]!.quantityDelta, "-9223372036854775808"); assert.equal(result.data.entries[2]!.sourceDocumentVersion, null);
  assert.equal(result.data.sku.size.label, "170/M full native size"); assert.equal(result.data.sku.fit.label, "Y版（修身）"); assert.equal(result.data.entries[0]!.postedAt, "2026-10-20T18:20:30.123456Z");
  const page = pool.calls.find(call => call.sql.includes("inventory-ledger:entries"))!;
  assert.deepEqual(page.values, [ledgerWarehouse.id, ledgerWarehouse.hallId, ledgerParameters().skuId, null, null, 21]);
  assert.ok(page.sql.includes("l.warehouse_id = $1::uuid AND w.hall_id = $2::uuid AND l.sku_id = $3::uuid"));
  assert.throws(() => new PostgresInventoryLedgerQueryReader({} as PgInventoryLedgerQueryPool), /explicit PostgreSQL pool/);
});

test("SCRIPTED ledger PG: keyset pagination stays exact across same-timestamp ties and a new top entry without OFFSET/count", async () => {
  const pool = new ScriptedPool(); const reader = new PostgresInventoryLedgerQueryReader(pool);
  const first = await reader.readLedger(ledgerRead(ledgerParameters({ pageSize: 1 }))); assert.equal(first.data.entries.length, 1); assert.ok(first.data.nextCursor);
  pool.entries.unshift({ ...ledgerEntry(7), id: inventoryId("ledger", 11000), postedAt: "2026-10-20T18:20:30.123457Z" });
  const second = await reader.readLedger(ledgerRead(ledgerParameters({ pageSize: 1, after: first.data.nextCursor })));
  assert.equal(second.data.entries[0]!.id, ledgerEntry(1).id); assert.notEqual(second.data.entries[0]!.id, first.data.entries[0]!.id); assert.ok(second.data.nextCursor);
  const third = await reader.readLedger(ledgerRead(ledgerParameters({ pageSize: 1, after: second.data.nextCursor })));
  assert.equal(third.data.entries[0]!.source.kind, "CUTOFF_BASELINE"); assert.equal(third.data.nextCursor, null);
  const pages = pool.calls.filter(call => call.sql.includes("inventory-ledger:entries"));
  assert.deepEqual(pages[1]!.values.slice(3), [first.data.nextCursor.postedAt, first.data.nextCursor.entryId, 2]);
  assert.ok(pages.every(call => call.sql.includes("(l.posted_at, l.id) < ($4::timestamptz, $5::uuid)") && call.sql.includes("ORDER BY l.posted_at DESC, l.id DESC LIMIT $6") && !/OFFSET|COUNT|SUM\(/i.test(call.sql)));
});

test("SCRIPTED ledger PG: empty ready history is not missing key/publication proof; nullable/duplicate size code is not global identity", async () => {
  const pool = new ScriptedPool(); pool.entries = [];
  pool.transform = (stage, rows) => stage === "sku" ? rows.map(row => ({ ...row, size_code: null })) : rows;
  const result = await new PostgresInventoryLedgerQueryReader(pool).readLedger(ledgerRead());
  assert.deepEqual(result.data.entries, []); assert.equal(result.data.nextCursor, null); assert.equal(result.data.sku.size.code, null); assert.equal(result.readiness, "ready");
});

for (const [name, target, mutate, expected] of [
  ["stale hall", "warehouse", (rows: Row[]) => rows.map(row => ({ ...row, hall_id: inventoryId("hall", 999) })), "INVENTORY_INTEGRITY_FAILED"],
  ["stale warehouse label", "warehouse", rows => rows.map(row => ({ ...row, name: "stale invented label" })), "INVENTORY_INTEGRITY_FAILED"],
  ["missing authorized warehouse", "warehouse", _rows => [], "FORBIDDEN"],
  ["missing exact SKU", "sku", _rows => [], "SKU_NOT_FOUND"],
  ["wrong size group", "sku", rows => rows.map(row => ({ ...row, size_member: false })), "INVENTORY_INTEGRITY_FAILED"],
  ["missing publication guards", "guards", rows => rows.map(row => ({ ...row, integrity_guards_present: false })), "INVENTORY_INTEGRITY_FAILED"],
  ["no published cutoff", "publication", _rows => [], "INVENTORY_NOT_READY"],
  ["multiple published cutoffs", "publication", rows => [...rows, rows[0]!], "INVENTORY_INTEGRITY_FAILED"],
  ["incomplete final approval", "publication", rows => rows.map(row => ({ ...row, final_approval: false })), "INVENTORY_INTEGRITY_FAILED"],
  ["unpublished exact SKU", "publication", rows => rows.map(row => ({ ...row, sku_published: false })), "INVENTORY_NOT_READY"],
  ["unpublished exact warehouse", "publication", rows => rows.map(row => ({ ...row, warehouse_published: false })), "INVENTORY_NOT_READY"]
] satisfies [string, string, (rows: Row[]) => Row[], string][]) test(`SCRIPTED ledger PG: ${name} rejects before ledger disclosure`, async () => {
  const pool = new ScriptedPool(); pool.transform = (stage, rows) => stage === target ? mutate(rows) : rows;
  await assert.rejects(new PostgresInventoryLedgerQueryReader(pool).readLedger(ledgerRead()), code(expected)); assert.equal(stages(pool).at(-1), "ROLLBACK"); assert.ok(!stages(pool).includes("entries"));
});

for (const [name, mutate] of [
  ["wrong ledger warehouse", (row: Row) => ({ ...row, warehouse_id: inventoryId("warehouse", 999) })],
  ["wrong ledger SKU", row => ({ ...row, sku_id: inventoryId("sku", 999) })],
  ["mixed native source", row => ({ ...row, source_import_batch_id: ledgerBatchId })],
  ["missing source document", row => ({ ...row, source_sales_id: null })],
  ["zero delta", row => ({ ...row, quantity_delta: "0" })],
  ["invalid timestamp", row => ({ ...row, posted_at: "2026-02-30T00:00:00.000000Z" })],
  ["bad endpoint", row => ({ ...row, endpoint: "https://invented.example/" })]
] satisfies [string, (row: Row) => Row][]) test(`SCRIPTED ledger PG: ${name} rolls back rather than returning partial history`, async () => {
  const pool = new ScriptedPool(); pool.transform = (stage, rows) => stage === "entries" ? rows.map((row, n) => n === 0 ? mutate(row) : row) : rows;
  await assert.rejects(new PostgresInventoryLedgerQueryReader(pool).readLedger(ledgerRead())); assert.equal(stages(pool).at(-1), "ROLLBACK"); assert.ok(!stages(pool).includes("COMMIT"));
});

test("SCRIPTED ledger PG: corrupt look-ahead, staged baseline, missing native label and driver overfetch fail whole page", async () => {
  const cases: { pageSize: number; mutate: (stage: string, rows: Row[]) => Row[] }[] = [
    { pageSize: 1, mutate: (stage, rows) => stage === "entries" ? rows.map((row, n) => n === 1 ? { ...row, quantity_delta: "0" } : row) : rows },
    { pageSize: 20, mutate: (stage, rows) => stage === "entries" ? rows.map(row => row.source_import_batch_id ? { ...row, source_import_batch_id: inventoryId("operation", 999) } : row) : rows },
    { pageSize: 1, mutate: (stage, rows) => stage === "sku" ? rows.map(row => ({ ...row, fit_name: null })) : rows },
    { pageSize: 1, mutate: (stage, rows) => stage === "entries" ? [...rows, ...rows] : rows }
  ];
  for (const { pageSize, mutate } of cases) {
    const pool = new ScriptedPool(); pool.transform = mutate;
    await assert.rejects(new PostgresInventoryLedgerQueryReader(pool).readLedger(ledgerRead(ledgerParameters({ pageSize }))));
    assert.equal(stages(pool).at(-1), "ROLLBACK");
  }
});

test("SCRIPTED ledger PG: invalid scope/cursor/actor and preabort do not connect; midread abort prevents following queries", async () => {
  for (const read of [
    { ...ledgerRead(), scope: { ...ledgerRead().scope, warehouses: [{ ...ledgerWarehouse, id: inventoryId("warehouse", 999) }] } },
    { ...ledgerRead(), actor: { accountId: "invalid", hallId: null } as unknown as ReturnType<typeof ledgerRead>["actor"] },
    { ...ledgerRead(), parameters: { ...ledgerParameters(), after: { postedAt: "invalid", entryId: inventoryId("ledger", 3) } } }
  ]) { const pool = new ScriptedPool(); await assert.rejects(new PostgresInventoryLedgerQueryReader(pool).readLedger(read)); assert.equal(pool.connects, 0); }
  const controller = new AbortController(); controller.abort(); const before = new ScriptedPool();
  await assert.rejects(new PostgresInventoryLedgerQueryReader(before).readLedger(ledgerRead(undefined, controller.signal)), code("INVENTORY_READ_ABORTED")); assert.equal(before.connects, 0);
  const midController = new AbortController(); const mid = new ScriptedPool(); mid.afterQuery = stage => { if (stage === "sku") midController.abort(); };
  await assert.rejects(new PostgresInventoryLedgerQueryReader(mid).readLedger(ledgerRead(undefined, midController.signal)), code("INVENTORY_READ_ABORTED"));
  assert.equal(stages(mid).at(-1), "ROLLBACK"); assert.ok(!stages(mid).includes("publication"));
});

test("SCRIPTED ledger PG: query/BEGIN/uncertain COMMIT/rollback failures release exactly once without retry", async () => {
  for (const failAt of ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "entries", "COMMIT"]) {
    const pool = new ScriptedPool(); pool.failAt = failAt; await assert.rejects(new PostgresInventoryLedgerQueryReader(pool).readLedger(ledgerRead()), /SYNTHETIC/);
    assert.equal(pool.connects, 1); assert.equal(pool.releases.length, 1); assert.equal(pool.releases[0] instanceof Error, failAt !== "entries"); assert.ok(!stages(pool).includes("COMMIT") || failAt === "COMMIT");
  }
  const pool = new ScriptedPool(); pool.failAt = "entries"; pool.failRollback = true;
  await assert.rejects(new PostgresInventoryLedgerQueryReader(pool).readLedger(ledgerRead()), AggregateError); assert.ok(pool.releases[0] instanceof Error); assert.equal(pool.releases.length, 1);
});

test("D3 read outcome: ledger unknown COMMIT is discarded without rollback or retry", async () => {
  const pool = new ScriptedPool(); pool.failAt = "COMMIT";
  await assert.rejects(new PostgresInventoryLedgerQueryReader(pool).readLedger(ledgerRead()), /SYNTHETIC/);
  assert.equal(stages(pool).at(-1), "COMMIT"); assert.ok(!stages(pool).includes("ROLLBACK"));
  assert.equal(pool.connects, 1); assert.equal(pool.releases.length, 1); assert.ok(pool.releases[0] instanceof Error);
});

test("SOURCE CONTRACT ONLY ledger: no history materialization, aggregate, private imported payload, new database/pool or mutable source projection", () => {
  const source = readFileSync(new URL("../adapters/postgres/src/inventory-ledger-query-reader.ts", import.meta.url), "utf8");
  assert.ok(!/SELECT\s+\*|OFFSET|COUNT\(|SUM\(|INSERT INTO|UPDATE naijue_erp|DELETE FROM|\.listen\(|new Pool\(/i.test(source));
  assert.ok(!source.includes("readPublishedCutoffScope(") && !source.includes("readInventory(") && !source.includes("readDetail("));
  assert.ok(!/sl\.(?:sku_id|quantity|product_name_snapshot|is_current)|tl\.(?:sku_id|quantity|product_name_snapshot|is_current)/.test(source));
  assert.ok(source.includes("sl.sales_id AS source_sales_id") && source.includes("tl.transfer_id AS source_transfer_id"));
  assert.ok(source.includes("r.source_record_hash = b.source_hash") && !source.includes("b.source_hash AS"));
  assert.ok(source.includes("ORDER BY b.id LIMIT 2") && source.includes("LIMIT $6"));
  assert.ok(source.includes("s.size_id") && source.includes("m.size_group_id = p.size_group_id AND m.size_id = s.size_id"));
});

test("SCRIPTED ledger PG: abort while COMMIT completes suppresses direct-reader result without misreporting or rolling back completed read", async () => {
  const pool = new ScriptedPool(); const controller = new AbortController(); pool.afterQuery = stage => { if (stage === "COMMIT") controller.abort(); };
  await assert.rejects(new PostgresInventoryLedgerQueryReader(pool).readLedger(ledgerRead(undefined, controller.signal)), code("INVENTORY_READ_ABORTED"));
  assert.equal(stages(pool).at(-1), "COMMIT"); assert.equal(pool.releases.length, 1); assert.deepEqual(pool.releases, [undefined]);
});
