/** SYNTHETIC pg lock/sequence protocol simulator. NOT PostgreSQL-engine evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import type { PgSalesPool, PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { PostgresPartyUnitOfWork } from "../adapters/postgres/src/party-maintenance-store.ts";
import { createPartyMaintenanceService } from "../packages/application/src/party-maintenance-service.ts";
import { createApprovedPartyCodeAllocator, PARTY_SEQUENCE_MAX } from "../packages/application/src/party-numbering.ts";
import { createSourcePartyAuthorization } from "../packages/application/src/party-maintenance-policy.ts";
import type { PartyKind } from "../packages/application/src/party-maintenance-ports.ts";
import { partyActor, partyId } from "./support/party-synthetic-store.ts";

function numberingProtocol() {
  const rows = { CUSTOMER: new Map<string, Record<string, unknown>>(), SUPPLIER: new Map<string, Record<string, unknown>>() };
  const sequences = { CUSTOMER: { value: 1n, called: false }, SUPPLIER: { value: 1n, called: false } };
  const receipts = new Map<string, Record<string, unknown>>(); const locks = new Map<string, Promise<void>>();
  const calls: { sql: string; values: unknown[] }[] = []; let id = 100; let failAudit = false;
  const pool: PgSalesPool = { async connect() {
    const unlockers: (() => void)[] = []; const owned = new Set<string>();
    const pendingRows: { kind: PartyKind; row: Record<string, unknown> }[] = []; const pendingReceipts: { key: string; row: Record<string, unknown> }[] = [];
    const unlock = () => { for (const release of unlockers.splice(0)) release(); owned.clear(); };
    return {
      async query(sql: string, values: unknown[] = []): Promise<PgSalesResult> {
        calls.push({ sql, values: structuredClone(values) });
        const kind: PartyKind = sql.includes("supplier") ? "SUPPLIER" : "CUSTOMER";
        if (sql.startsWith("BEGIN")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_advisory_xact_lock")) {
          const key = String(values[0]); if (owned.has(key)) return { rows: [], rowCount: 1 };
          const previous = locks.get(key) ?? Promise.resolve(); let release!: () => void;
          const current = new Promise<void>(resolve => { release = resolve; }); locks.set(key, previous.then(() => current)); await previous;
          owned.add(key); unlockers.push(release); return { rows: [], rowCount: 1 };
        }
        if (sql.includes("FROM naijue_erp.operation_receipt")) { const found = receipts.get(JSON.stringify(values)); return { rows: found ? [structuredClone(found)] : [], rowCount: found ? 1 : 0 }; }
        if (sql.includes("last_value::text")) return { rows: [{ last_value: sequences[kind].value.toString(), is_called: sequences[kind].called }], rowCount: 1 };
        if (sql.startsWith("SELECT code FROM")) {
          const prefix = kind === "CUSTOMER" ? "KH" : "GYS";
          const matching = [...rows[kind].values()].map(row => String(row.code)).filter(code => new RegExp(`^${prefix}[0-9]+$`).test(code));
          matching.sort((a, b) => {
            const x = a.slice(prefix.length).replace(/^0+/, "") || "0"; const y = b.slice(prefix.length).replace(/^0+/, "") || "0";
            return y.length - x.length || (x < y ? 1 : x > y ? -1 : 0);
          }); return { rows: matching.length ? [{ code: matching[0] }] : [], rowCount: matching.length ? 1 : 0 };
        }
        if (sql.startsWith("SELECT setval")) {
          assert.ok(owned.has(`naijue:party-code:${kind}`)); sequences[kind] = { value: BigInt(String(values[0])), called: true };
          return { rows: [{ allocated: String(values[0]) }], rowCount: 1 };
        }
        if (sql.includes("WHERE id = $1 FOR UPDATE")) {
          const found = rows[kind].get(String(values[0])); return { rows: found ? [structuredClone(found)] : [], rowCount: found ? 1 : 0 };
        }
        if (/^INSERT INTO naijue_erp\.(customer|supplier) /.test(sql)) {
          assert.ok(![...rows[kind].values(), ...pendingRows.filter(row => row.kind === kind).map(row => row.row)].some(row => row.code === values[1]), "Synthetic native code uniqueness");
          pendingRows.push({ kind, row: { id: values[0], code: values[1], name: values[2], enabled: values[3], version: values[4], created_at: values[5], updated_at: values[6] } }); return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith("INSERT INTO naijue_erp.audit_change")) { if (failAudit) throw new Error("SYNTHETIC AFTER-RESERVATION AUDIT FAILURE"); return { rows: [], rowCount: 1 }; }
        if (sql.startsWith("INSERT INTO naijue_erp.operation_receipt")) {
          pendingReceipts.push({ key: JSON.stringify([values[1], values[2]]), row: { id: values[0], actor_account_id: values[1], request_key: values[2], request_hash: values[3], action: values[4], target_type: values[5], target_id: values[6], status: "COMMITTED", result_data: JSON.parse(String(values[7])), completed_at: values[8] } }); return { rows: [], rowCount: 1 };
        }
        if (sql === "COMMIT") { for (const { kind, row } of pendingRows) rows[kind].set(String(row.id), row); for (const receipt of pendingReceipts) receipts.set(receipt.key, receipt.row); unlock(); return { rows: [], rowCount: 0 }; }
        if (sql === "ROLLBACK") { unlock(); return { rows: [], rowCount: 0 }; }
        throw new Error(`Unsupported synthetic numbering query: ${sql}`);
      },
      release() { unlock(); }
    };
  } };
  const service = createPartyMaintenanceService({ unitOfWork: new PostgresPartyUnitOfWork(pool), authorization: createSourcePartyAuthorization(), codes: createApprovedPartyCodeAllocator(), now: () => "2026-10-20T17:00:00.000Z", newId: kind => partyId(kind, ++id) });
  const create = (kind: PartyKind, requestKey: string) => service.execute({ actor: partyActor, kind, requestKey, action: "CREATE", name: "SYNTHETIC SAME NAME" });
  const seed = (kind: PartyKind, code: string, enabled = false) => { const id = partyId(kind === "CUSTOMER" ? "customer" : "supplier", ++idCounter); rows[kind].set(id, { id, code, name: "SYNTHETIC IMPORT", enabled, version: 7, created_at: null, updated_at: null }); };
  let idCounter = 5000;
  return { create, service, rows, sequences, calls, seed, fail: (value: boolean) => { failAudit = value; } };
}
test("SYNTHETIC approved numbering pg protocol: existing/imported exact-prefix codes advance independent counters without rewriting", async () => {
  const f = numberingProtocol();
  f.seed("CUSTOMER", "KH000099"); f.seed("CUSTOMER", "KH0000000000000098"); f.seed("CUSTOMER", "KH999x"); f.seed("CUSTOMER", "kh999999");
  f.seed("SUPPLIER", "GYS000009"); f.seed("SUPPLIER", "KH999999");
  const before = [...f.rows.CUSTOMER.values()].map(row => structuredClone(row));
  assert.equal((await f.create("CUSTOMER", "customer")).code, "KH000100"); assert.equal((await f.create("SUPPLIER", "supplier")).code, "GYS000010");
  for (const row of before) assert.deepEqual(f.rows.CUSTOMER.get(String(row.id)), row);
  const highest = f.calls.find(call => call.sql.startsWith("SELECT code FROM naijue_erp.customer"))!;
  assert.match(highest.sql, /WHERE code ~ '\^KH\[0-9\]\+\$'/); assert.match(highest.sql, /ORDER BY length\(ltrim/); assert.doesNotMatch(highest.sql, /::(?:numeric|bigint)|enabled/);
});
test("SYNTHETIC approved numbering pg protocol: simultaneous customer/supplier creates never duplicate and both start at one", async () => {
  const f = numberingProtocol(); const outcomes = await Promise.all(Array.from({ length: 20 }, (_, i) => [f.create("CUSTOMER", `c${i}`), f.create("SUPPLIER", `s${i}`)]).flat());
  for (const [kind, prefix] of [["CUSTOMER", "KH"], ["SUPPLIER", "GYS"]] as const) {
    const codes = outcomes.filter(row => row.kind === kind).map(row => row.code).sort(); assert.equal(new Set(codes).size, 20); assert.equal(codes[0], `${prefix}000001`); assert.equal(codes.at(-1), `${prefix}000020`);
  }
  assert.ok(f.calls.some(call => call.values[0] === "naijue:party-code:CUSTOMER")); assert.ok(f.calls.some(call => call.values[0] === "naijue:party-code:SUPPLIER"));
});
test("SYNTHETIC approved numbering pg protocol: rollback consumes reservation, replay consumes none, gaps are allowed", async () => {
  const f = numberingProtocol(); f.fail(true); await assert.rejects(f.create("CUSTOMER", "retry"), /AFTER-RESERVATION/);
  assert.equal(f.rows.CUSTOMER.size, 0); assert.equal(f.sequences.CUSTOMER.value, 1n); assert.equal(f.sequences.CUSTOMER.called, true);
  f.fail(false); const saved = await f.create("CUSTOMER", "retry"); assert.equal(saved.code, "KH000002");
  const count = f.calls.filter(call => call.sql.startsWith("SELECT setval")).length;
  assert.deepEqual(await f.create("CUSTOMER", "retry"), saved); assert.equal(f.calls.filter(call => call.sql.startsWith("SELECT setval")).length, count);
});
test("SYNTHETIC approved numbering pg protocol: codes grow beyond six digits and explicitly stop at sequence storage exhaustion", async () => {
  const f = numberingProtocol(); f.seed("CUSTOMER", "KH999999"); assert.equal((await f.create("CUSTOMER", "million")).code, "KH1000000");
  f.seed("SUPPLIER", `GYS${PARTY_SEQUENCE_MAX}`); const before = f.calls.filter(call => call.sql.startsWith("SELECT setval")).length;
  await assert.rejects(f.create("SUPPLIER", "exhausted"), (error: unknown) => (error as { code: string }).code === "PARTY_CODE_EXHAUSTED");
  assert.equal(f.calls.filter(call => call.sql.startsWith("SELECT setval")).length, before); assert.equal(f.rows.SUPPLIER.size, 1);
});
