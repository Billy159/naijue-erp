import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { PostgresInventoryLedgerQueryReader } from "../adapters/postgres/src/inventory-ledger-query-reader.ts";
import { createInventoryLedgerQueryHttpPlugin } from "../apps/api/src/inventory-ledger-query-http.ts";
import { createInventoryLedgerQueryService } from "../packages/application/src/inventory-ledger-query-service.ts";
import { checkedInventoryLedgerSnapshot, parseInventoryLedgerQuery } from "../packages/application/src/inventory-ledger-query-validation.ts";
import { inventoryActor, inventoryId, inventoryScope, ledgerBatchId, ledgerEntry, ledgerParameters, ledgerRead, ledgerSnapshot, ledgerWarehouse } from "../tests/support/synthetic-inventory-ledger-query.ts";

// Independent scripted protocol only. No network, database, server listener or schema execution.
type Row = Record<string, unknown>;
function rawEntry(n = 0, kind: "SALES" | "TRANSFER" | "CUTOFF_BASELINE" = "SALES"): Row {
  const e = ledgerEntry(n, kind); const p = e.source;
  return { id: e.id, operation_id: e.operationId, event_kind: e.eventKind, quantity_delta: e.quantityDelta,
    warehouse_id: ledgerWarehouse.id, sku_id: ledgerParameters().skuId,
    source_sales_line_id: p.kind === "SALES" ? p.salesLineId : null, source_sales_id: p.kind === "SALES" ? p.salesId : null,
    source_transfer_line_id: p.kind === "TRANSFER" ? p.transferLineId : null, source_transfer_id: p.kind === "TRANSFER" ? p.transferId : null,
    source_import_batch_id: p.kind === "CUTOFF_BASELINE" ? p.importBatchId : null, endpoint: p.endpoint,
    source_document_version: e.sourceDocumentVersion, reverses_entry_id: e.reversesEntryId, business_date: e.businessDate, posted_at: e.postedAt };
}
class Pool {
  calls: { stage: string; sql: string; values: unknown[] }[] = []; released: unknown[] = [];
  rows = [rawEntry()]; hook: (stage: string) => void = () => {}; onConnect: () => void = () => {};
  change: (stage: string, rows: Row[]) => Row[] = (_stage, rows) => rows;
  fail = ""; rollbackFails = false;
  async connect() { this.onConnect(); return this; }
  release(error?: unknown) { this.released.push(error); }
  async query(sql: string, values: unknown[] = []) {
    const stage = /inventory(?:-ledger)?:([a-z-]+)/.exec(sql)?.[1] ?? sql; this.calls.push({ stage, sql, values });
    if (stage === this.fail || (stage === "ROLLBACK" && this.rollbackFails)) throw new Error("synthetic private failure");
    const s = ledgerSnapshot(ledgerRead()).data.sku;
    const counts = { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 1 };
    let rows: Row[] = stage === "warehouse" ? [{ id: ledgerWarehouse.id, hall_id: ledgerWarehouse.hallId, name: ledgerWarehouse.label }]
      : stage === "sku" ? [{ id: s.id, sku_code: s.code, product_id: s.product.id, product_code: s.product.code, product_name: s.product.name,
        color_id: s.color.id, color_name: s.color.label, fit_id: s.fit.id, fit_code: s.fit.code, fit_name: s.fit.label,
        size_group_id: s.sizeGroup.id, size_group_name: s.sizeGroup.label, size_id: s.size.id, size_code: s.size.code, size_name: s.size.label, size_member: true }]
      : stage === "publication" ? [{ id: ledgerBatchId, completed: true, final_approval: true, warehouse_published: true, sku_published: true,
        checkpoint: { sequence: 2, cursor: 4, counts, expected: counts } }]
      : stage === "guards" ? [{ integrity_guards_present: true }]
      : stage === "entries" ? this.rows : [];
    rows = this.change(stage, rows); this.hook(stage); return { rows, rowCount: rows.length };
  }
}
const code = (name: string) => (e: any) => e?.code === name;

test("independent: direct reader suppresses result when cancellation arrives during COMMIT", async () => {
  const p = new Pool(); const c = new AbortController(); p.hook = s => { if (s === "COMMIT") c.abort(); };
  await assert.rejects(new PostgresInventoryLedgerQueryReader(p).readLedger(ledgerRead(undefined, c.signal)), code("INVENTORY_READ_ABORTED"));
  assert.equal(p.released.length, 1);
});

for (const stage of ["connect", "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "warehouse", "sku", "publication", "entries"]) {
  test(`independent: cancellation at ${stage} prevents later SQL and releases once`, async () => {
    const p = new Pool(); const c = new AbortController();
    if (stage === "connect") p.onConnect = () => c.abort(); else p.hook = s => { if (s === stage) c.abort(); };
    await assert.rejects(new PostgresInventoryLedgerQueryReader(p).readLedger(ledgerRead(undefined, c.signal)), code("INVENTORY_READ_ABORTED"));
    assert.equal(p.released.length, 1); assert.ok(!p.calls.some(call => call.stage === "COMMIT"));
    if (!["connect"].includes(stage)) assert.equal(p.calls.at(-1)?.stage, "ROLLBACK");
  });
}

test("independent: maximum page validates 201st row, returning exactly 200 and last-visible cursor", async () => {
  const p = new Pool(); p.rows = Array.from({ length: 201 }, (_, n) => rawEntry(n));
  const result = await new PostgresInventoryLedgerQueryReader(p).readLedger(ledgerRead(ledgerParameters({ pageSize: 200 })));
  assert.equal(result.data.entries.length, 200); assert.equal(result.data.nextCursor?.entryId, p.rows[199]!.id);
  assert.equal(p.calls.find(c => c.stage === "entries")!.values[5], 201);
});

test("independent: bytewise UUID and six-fraction timestamp pagination crosses ties without duplicates", async () => {
  const p = new Pool();
  const all = Array.from({ length: 13 }, (_, n) => ({ ...rawEntry(n, n % 3 === 0 ? "TRANSFER" : "SALES"),
    posted_at: n < 3 ? "2026-10-21T00:00:00.000001Z" : n < 9 ? "2026-10-20T18:20:30.123456Z" : "2026-10-20T18:20:30.123455Z" }));
  const stampKey = (s: unknown) => BigInt(String(s).replace(/[^0-9]/g, ""));
  const uuidKey = (s: unknown) => BigInt(`0x${String(s).replaceAll("-", "")}`);
  const cmp = (a: Row, b: Row) => {
    const t = stampKey(a.posted_at) - stampKey(b.posted_at); const i = uuidKey(a.id) - uuidKey(b.id);
    return t !== 0n ? t > 0n ? -1 : 1 : i > 0n ? -1 : i < 0n ? 1 : 0;
  };
  all.sort(cmp); const expected = all.map(e => e.id); const seen: unknown[] = [];
  p.change = (stage, rows) => {
    if (stage !== "entries") return rows;
    const call = p.calls.at(-1)!; const [warehouse, hall, sku, time, id, limit] = call.values;
    assert.equal(warehouse, ledgerWarehouse.id); assert.equal(hall, ledgerWarehouse.hallId); assert.equal(sku, ledgerParameters().skuId);
    assert.match(call.sql, /\(l\.posted_at, l\.id\) < \(\$4::timestamptz, \$5::uuid\)/);
    assert.match(call.sql, /ORDER BY l\.posted_at DESC, l\.id DESC LIMIT \$6/);
    assert.ok(!/OFFSET|COUNT\(|SUM\(/i.test(call.sql));
    return all.filter(r => time === null || cmp(r, { posted_at: time, id }) > 0).slice(0, Number(limit));
  };
  const reader = new PostgresInventoryLedgerQueryReader(p); let after: ReturnType<typeof ledgerParameters>["after"] = null;
  do {
    const page = await reader.readLedger(ledgerRead(ledgerParameters({ pageSize: 3, after })));
    seen.push(...page.data.entries.map(e => e.id)); after = page.data.nextCursor;
    if (seen.length === 3) all.unshift({ ...rawEntry(20), id: inventoryId("ledger", 30000), posted_at: "2026-10-21T00:00:00.000002Z" });
  } while (after !== null);
  assert.deepEqual(seen, expected); assert.equal(new Set(seen).size, 13);
});

for (const [name, mutate] of [
  ["out-of-order lookahead", (r: Row) => ({ ...r, id: inventoryId("ledger", 20000) })],
  ["cross-SKU lookahead", (r: Row) => ({ ...r, sku_id: inventoryId("sku", 999) })],
  ["unpublished baseline lookahead", (_r: Row) => ({ ...rawEntry(1, "CUTOFF_BASELINE"), source_import_batch_id: inventoryId("operation", 999) })],
  ["sales source wrong endpoint", (r: Row) => ({ ...r, endpoint: "FROM" })],
  ["transfer source missing owner", (_r: Row) => ({ ...rawEntry(1, "TRANSFER"), source_transfer_id: null })],
  ["baseline version not null", (_r: Row) => ({ ...rawEntry(1, "CUTOFF_BASELINE"), source_document_version: 1 })],
] as const) {
  test(`independent: ${name} rejects complete page before COMMIT`, async () => {
    const p = new Pool(); p.rows = [rawEntry(), mutate(rawEntry(1))];
    await assert.rejects(new PostgresInventoryLedgerQueryReader(p).readLedger(ledgerRead(ledgerParameters({ pageSize: 1 }))));
    assert.equal(p.calls.at(-1)?.stage, "ROLLBACK"); assert.ok(!p.calls.some(c => c.stage === "COMMIT"));
  });
}

test("independent: actual six-digit UTC timestamps preserve microseconds and reject invalid dates/offsets", () => {
  for (const postedAt of ["0001-01-01T00:00:00.000001Z", "2000-02-29T00:00:00.000999Z", "9999-12-31T23:59:59.999999Z"]) {
    const value = ledgerParameters({ after: { postedAt, entryId: inventoryId("ledger", 1) } }); assert.equal(value.after!.postedAt, postedAt);
  }
  for (const postedAt of ["1900-02-29T00:00:00.000001Z", "2026-12-31T24:00:00.000000Z", "2026-10-20T00:00:00.000001+00:00", "2026-10-20T00:00:00.0000010Z"]) {
    assert.throws(() => parseInventoryLedgerQuery({ ...ledgerParameters(), after: { postedAt, entryId: inventoryId("ledger", 1) } }), code("INVALID_INVENTORY_LEDGER_QUERY"));
  }
});

test("independent: cursor never grants a missing warehouse and forged hall scope is rejected", async () => {
  let reads = 0;
  const service = createInventoryLedgerQueryService({ authorization: { async authorize() { return { hallIds: [ledgerWarehouse.hallId], warehouses: [{ ...ledgerWarehouse, id: inventoryId("warehouse", 999) }] }; } },
    reader: { async readLedger(read) { reads++; return ledgerSnapshot(read); } } });
  await assert.rejects(service.readLedger(inventoryActor, ledgerParameters({ after: { postedAt: ledgerEntry().postedAt, entryId: ledgerEntry().id } }), new AbortController().signal), code("FORBIDDEN"));
  assert.equal(reads, 0); const p = new Pool();
  await assert.rejects(new PostgresInventoryLedgerQueryReader(p).readLedger({ ...ledgerRead(), scope: { ...inventoryScope, hallIds: [inventoryId("hall", 999)] } })); assert.equal(p.calls.length, 0);
});

test("independent: output labels stay current-reference and unknown/private fields fail closed", () => {
  for (const mutate of [(v: any) => { v.data.labelBasis = "HISTORICAL"; }, (v: any) => { v.data.entries[0].source.secret = "private"; },
    (v: any) => { v.data.entries[0].source.kind = "LEGACY"; }, (v: any) => { v.data.sku.size.private = "private"; }]) {
    const v = structuredClone(ledgerSnapshot(ledgerRead())); mutate(v); assert.throws(() => checkedInventoryLedgerSnapshot(v, ledgerParameters(), inventoryScope), code("INVALID_INVENTORY_LEDGER_RESPONSE"));
  }
});

test("independent: HTTP inject without listener protects private trusted errors and exact wire result", async () => {
  let privateError = false;
  const app = Fastify(); await app.register(createInventoryLedgerQueryHttpPlugin({ authenticate: async () => inventoryActor,
    dependencies: { authorization: { async authorize() { return inventoryScope; } }, reader: { async readLedger(read) { if (privateError) throw new Error("PRIVATE DATABASE password"); return ledgerSnapshot(read); } } } }));
  try {
    const good = await app.inject({ method: "POST", url: "/inventory/ledger/query", payload: ledgerParameters() }); assert.equal(good.statusCode, 200);
    assert.deepEqual(Object.keys(good.json()).sort(), ["pageSize", "labelBasis", "warehouse", "sku", "entries", "nextCursor"].sort());
    assert.equal(good.headers["cache-control"], "no-store"); assert.equal(good.json().entries[0].quantityDelta, "-9223372036854775808");
    privateError = true; const bad = await app.inject({ method: "POST", url: "/inventory/ledger/query", payload: ledgerParameters() });
    assert.equal(bad.statusCode, 500); assert.ok(!bad.body.includes("PRIVATE") && !bad.body.includes("password"));
  } finally { await app.close(); }
});
