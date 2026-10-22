/** Scripted SQL protocol only. No PostgreSQL, migration, durability or release proof. */
import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresHistoryRevisionPosting } from "../adapters/postgres/src/inventory-posting-balances.ts";
import type { HistoryRevisionPostingContext, HistoryRevisionPostingEffect } from "../packages/application/src/inventory-posting.ts";
import type { InventoryAdmissionRuntime } from "../adapters/postgres/src/inventory-key-admission-reader.ts";
import type { PgSalesClient } from "../adapters/postgres/src/sales-unit-of-work.ts";

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context: HistoryRevisionPostingContext = { operationId: id(1), revisionId: id(2), actorAccountId: id(3),
  kind: "sales", documentId: id(4), toVersion: 2, businessDate: "2020-01-02", postedAt: "2026-10-22T07:00:00Z" };
const effect = (n = 10, delta = "-2"): HistoryRevisionPostingEffect => ({ ledgerEntryId: id(n), lineId: id(n + 100),
  warehouseId: id(20), skuId: id(30), endpoint: "SALES_WAREHOUSE", quantityDelta: delta });
interface Options { absent?: boolean; admitted?: boolean; priorLedger?: boolean; publication?: boolean; guards?: boolean; writeCount?: number }
function protocol(options: Options = {}) {
  const calls: { sql: string; values: unknown[] }[] = [], capabilities: unknown[] = [];
  const counts = { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 1 };
  const client: Pick<PgSalesClient, "query"> = { async query(sql, values = []) {
    calls.push({ sql, values }); let rows: Record<string, unknown>[] = [], rowCount = 1;
    if (sql.startsWith("SELECT naijue_erp.inventory_key_lock")) { /* same exact key lock namespace */ }
    else if (sql.includes("FOR UPDATE OF b")) rows = options.absent ? [] : (values[0] as string[]).map((w, index) => ({ warehouse_id: w,
      sku_id: (values[1] as string[])[index], quantity: index === 0 ? "10" : "7", version: 4, last_operation_id: null, updated_at: "2026-10-20T00:00:00.000000Z" }));
    else if (sql.includes("posting:publication")) rows = options.publication === false ? [] : [{ id: id(40), completed: true, final_approval: true,
      checkpoint: { sequence: 2, cursor: 4, counts, expected: counts } }];
    else if (sql.includes("posting:guards")) rows = [{ integrity_guards_present: options.guards !== false }];
    else if (sql.includes("inventory-admission:keys")) rows = [{ warehouse_id: id(20), sku_id: id(30), admitted: options.admitted !== false,
      published_batch_id: id(40), warehouse_basis: "CUTOFF_MEMBER", sku_basis: "POST_CUTOFF_CREATED", warehouse_created_operation_id: null, sku_created_operation_id: id(41) }];
    else if (sql.includes("posting:admitted-unused-key")) rows = [{ balance_absent: true, ledger_absent: options.priorLedger !== true }];
    else if (sql.includes("history-posting:ledger") || sql.startsWith("UPDATE naijue_erp.inventory_balance") || sql.startsWith("INSERT INTO naijue_erp.inventory_balance")) rowCount = options.writeCount ?? 1;
    else throw Error(`Unexpected SQL: ${sql}`);
    return { rows, rowCount };
  } };
  const runtime: InventoryAdmissionRuntime = { profile: "EXACT24", async assertReady(actual) { assert.strictEqual(actual === client || actual.query !== undefined, true); capabilities.push(actual); } };
  return { calls, client, capabilities, post: createPostgresHistoryRevisionPosting(runtime).post };
}
const ledgerCalls = (p: ReturnType<typeof protocol>) => p.calls.filter(c => c.sql.includes("history-posting:ledger"));

test("amount-only history correction keeps unknown original date and performs no SQL/capability calls", async () => {
  const p = protocol(); assert.deepEqual(await p.post(p.client, { ...context, businessDate: null }, []), { ledgerEntryIds: [] });
  assert.equal(p.calls.length, 0); assert.equal(p.capabilities.length, 0);
  assert.throws(() => createPostgresHistoryRevisionPosting({ profile: "EXACT23", async assertReady() {} }), /exact24/);
});
test("invalid nonzero effects/date/transfer conservation fail before touching caller client", async () => {
  for (const [ctx, effects] of [
    [{ ...context, businessDate: null }, [effect()]], [context, [effect(10, "0")]], [context, [effect(), effect()]],
    [{ ...context, kind: "transfers" }, [{ ...effect(), endpoint: "FROM" }]],
    [{ ...context, kind: "transfers" }, [{ ...effect(), endpoint: "FROM" }, { ...effect(11, "3"), warehouseId: id(21), endpoint: "TO" }]],
    [{ ...context, kind: "transfers" }, [{ ...effect(), endpoint: "FROM" }, { ...effect(11, "2"), lineId: effect().lineId, endpoint: "TO" }]]
  ] as readonly (readonly [HistoryRevisionPostingContext, readonly HistoryRevisionPostingEffect[]])[]) {
    const p = protocol(); await assert.rejects(p.post(p.client, ctx, effects)); assert.equal(p.calls.length, 0); assert.equal(p.capabilities.length, 0);
  }
});
test("existing balances receive exact original-client revision deltas, source IDs and one CAS per real line", async () => {
  const p = protocol(), effects = [effect(), effect(11, "1")];
  assert.deepEqual(await p.post(p.client, context, effects), { ledgerEntryIds: [id(10), id(11)] });
  assert.strictEqual(p.capabilities[0], p.client);
  const ledgers = ledgerCalls(p), balances = p.calls.filter(c => c.sql.startsWith("UPDATE naijue_erp.inventory_balance"));
  assert.equal(ledgers.length, 2); assert.deepEqual(ledgers[0]!.values, [id(10), id(1), id(20), id(30), "-2", id(2), id(110), null, "SALES_WAREHOUSE", 2, "2020-01-02", context.postedAt]);
  assert.deepEqual(balances.map(c => c.values.slice(2, 4)), [["8", 5], ["9", 6]]);
  assert.deepEqual(balances.map(c => c.values[6]), [4, 5]);
  assert.ok(p.calls.every(c => !/^(?:BEGIN|COMMIT|ROLLBACK)/.test(c.sql) && !/sales_header|history_sales_header/.test(c.sql)));
  assert.equal(p.calls.filter(c => c.sql.startsWith("SELECT naijue_erp.inventory_key_lock")).length, 1);
});
test("transfer corrections conserve quantity at the two distinct original endpoints", async () => {
  const p = protocol(), from = { ...effect(), endpoint: "FROM" as const }, to = { ...effect(11, "2"), lineId: from.lineId, warehouseId: id(21), endpoint: "TO" as const };
  await p.post(p.client, { ...context, kind: "transfers" }, [from, to]);
  assert.deepEqual(ledgerCalls(p).map(c => c.values.slice(6, 9)), [[null, from.lineId, "FROM"], [null, from.lineId, "TO"]]);
  const quantities = p.calls.filter(c => c.sql.startsWith("UPDATE naijue_erp.inventory_balance")).map(c => BigInt(c.values[2] as string));
  assert.equal(quantities.reduce((a, b) => a + b), 17n);
  assert.deepEqual(p.calls.filter(c => c.sql.startsWith("SELECT naijue_erp.inventory_key_lock")).map(c => c.values[0]), [id(20), id(21)]);
});
test("admitted unpublished-key first use persists only actual negative delta and version one", async () => {
  const p = protocol({ absent: true }); await p.post(p.client, context, [effect()]);
  const insert = p.calls.find(c => c.sql.startsWith("INSERT INTO naijue_erp.inventory_balance"))!;
  assert.deepEqual(insert.values, [id(20), id(30), "-2", 1, id(1), context.postedAt]);
  assert.ok(p.calls.findIndex(c => c.sql.includes("posting:admitted-unused-key")) < p.calls.findIndex(c => c.sql.includes("history-posting:ledger")));
  assert.equal(p.calls.filter(c => c.sql.includes("posting:publication")).length, 1);
});
test("unpublished scope, missing guards, unadmitted key and prior-ledger missing balance reject before writes", async () => {
  for (const options of [{ publication: false }, { guards: false }, { admitted: false }, { priorLedger: true }]) {
    const p = protocol({ absent: true, ...options }); await assert.rejects(p.post(p.client, context, [effect()]));
    assert.equal(ledgerCalls(p).length, 0); assert.ok(p.calls.every(c => !/^(?:INSERT|UPDATE)/.test(c.sql)));
  }
});
test("append failure is propagated to original transaction owner without balance write or local rollback", async () => {
  const p = protocol({ writeCount: 0 }); await assert.rejects(p.post(p.client, context, [effect()]), { code: "INVENTORY_INTEGRITY_FAILED" });
  assert.ok(p.calls.every(c => !c.sql.startsWith("UPDATE naijue_erp.inventory_balance") && c.sql !== "ROLLBACK"));
});
