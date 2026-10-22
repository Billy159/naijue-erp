/** EXPLICIT SYNTHETIC pg protocol only. No PostgreSQL connection or engine evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresPartyUnitOfWork } from "../adapters/postgres/src/party-maintenance-store.ts";
import { createPartyMaintenanceService } from "../packages/application/src/party-maintenance-service.ts";
import { createSourcePartyAuthorization } from "../packages/application/src/party-maintenance-policy.ts";
import type { PgSalesPool, PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";
import type { PartyTransaction } from "../packages/application/src/party-maintenance-ports.ts";
import { partyActor, partyId } from "./support/party-synthetic-store.ts";
import { version } from "../packages/domain/src/values.ts";

function protocol(respond: (sql: string, parameters: unknown[]) => PgSalesResult | Promise<PgSalesResult> = () => ({ rows: [], rowCount: 1 }), exact26 = false) {
  const calls: { sql: string; parameters: unknown[] }[] = []; const releases: (Error | boolean | undefined)[] = [];
  let connects = 0; const pool: PgSalesPool = { async connect() { connects++; return { async query(sql, parameters = []) { calls.push({ sql, parameters: structuredClone(parameters) }); return respond(sql, parameters); }, release(error) { releases.push(error); } }; } };
  return { store: new PostgresPartyUnitOfWork(pool, exact26 ? { profile: "historical-customer-exact2-v26", assertVerified(target) { assert.equal(target, pool); } } : null), calls, releases, connects: () => connects };
}
const native = { id: partyId("customer", 30), code: " 000007-OLD ", name: "SYNTHETIC NATIVE", enabled: true, version: 7, created_at: null, updated_at: null };
const noRows = { rows: [], rowCount: 1 };
function dependencies(store: PostgresPartyUnitOfWork) { let seq = 100; return { unitOfWork: store, authorization: createSourcePartyAuthorization(), codes: { async allocateCustomerCode() { return "SYNTHETIC-CODE"; }, async allocateSupplierCode() { return "SYNTHETIC-CODE"; } }, now: () => "2026-10-20T16:00:00.000Z", newId: <K extends Parameters<typeof partyId>[0]>(kind: K) => partyId(kind, ++seq) }; }

test("SYNTHETIC party pg protocol: construction is inert and create atomically writes native audit receipt", async () => {
  const f = protocol(); assert.equal(f.connects(), 0);
  const result = await createPartyMaintenanceService(dependencies(f.store)).execute({ actor: partyActor, kind: "CUSTOMER", action: "CREATE", requestKey: "create", name: "SYNTHETIC NEW" });
  assert.equal(result.version, 1); assert.equal(f.calls[0]!.sql, "BEGIN ISOLATION LEVEL READ COMMITTED"); assert.equal(f.calls.at(-1)!.sql, "COMMIT");
  const locks = f.calls.filter(call => call.sql.includes("pg_advisory_xact_lock"));
  assert.equal(locks[0]!.parameters[0], `naijue:receipt:${JSON.stringify([partyActor.accountId, "create"])}`);
  assert.match(String(locks[1]!.parameters[0]), /^naijue:customer:/);
  assert.deepEqual(f.calls.filter(call => call.sql.startsWith("INSERT")).map(call => call.sql.match(/INSERT INTO ([\w.]+)/)![1]), ["naijue_erp.customer", "naijue_erp.audit_change", "naijue_erp.operation_receipt"]);
  const audit = f.calls.find(call => call.sql.includes("INSERT INTO naijue_erp.audit_change"))!;
  assert.equal(audit.parameters[3], "CUSTOMER"); assert.equal(audit.parameters[6], null); assert.equal(audit.parameters[8], null);
  assert.deepEqual(JSON.parse(audit.parameters[9] as string), { version: 1, code: "SYNTHETIC-CODE", name: "SYNTHETIC NEW", enabled: true });
  assert.deepEqual(f.releases, [undefined]);
});
test("SYNTHETIC party pg protocol: supplier creation writes supplier only, no shared identity collection", async () => {
  const f = protocol(); await createPartyMaintenanceService(dependencies(f.store)).execute({ actor: partyActor, kind: "SUPPLIER", action: "CREATE", requestKey: "create", name: "SYNTHETIC SUPPLIER" });
  assert.ok(f.calls.some(call => call.sql.startsWith("INSERT INTO naijue_erp.supplier"))); assert.ok(!f.calls.some(call => /(?:FROM|INTO) naijue_erp.customer\b/.test(call.sql)));
});
test("SYNTHETIC party pg protocol: global actor/key conflicts with SALES or other party kinds before target access", async () => {
  for (const target_type of ["SALES", "TRANSFER", "SUPPLIER"]) {
    const f = protocol(sql => sql.includes("FROM naijue_erp.operation_receipt") ? { rows: [{ target_type }], rowCount: 1 } : noRows);
    await assert.rejects(f.store.transaction(tx => tx.getReceipt(partyActor.accountId, "global", "CUSTOMER")), (error: unknown) => (error as { code: string }).code === "IDEMPOTENCY_CONFLICT");
    assert.equal(f.calls.at(-1)!.sql, "ROLLBACK"); assert.ok(!f.calls.some(call => call.sql.includes("FROM naijue_erp.customer")));
  }
});
test("SYNTHETIC party pg protocol: native edit locks row, preserves original code/null time and CAS uses old version", async () => {
  const f = protocol(sql => sql.includes("FROM naijue_erp.customer WHERE id") ? { rows: [native], rowCount: 1 } : noRows);
  await createPartyMaintenanceService(dependencies(f.store)).execute({ actor: partyActor, kind: "CUSTOMER", action: "EDIT", requestKey: "edit", id: native.id, expectedVersion: version(7), enabled: true, name: "SYNTHETIC RENAMED" });
  const select = f.calls.find(call => call.sql.includes("FROM naijue_erp.customer WHERE id"))!; assert.match(select.sql, /FOR UPDATE/);
  const update = f.calls.find(call => call.sql.startsWith("UPDATE naijue_erp.customer"))!;
  assert.match(update.sql, /WHERE id = \$1 AND version = \$8 AND code = \$2/); assert.doesNotMatch(update.sql, /SET code/);
  assert.equal(update.parameters[1], native.code); assert.equal(update.parameters[5], null); assert.equal(update.parameters[7], 7);
  const audit = f.calls.find(call => call.sql.includes("INSERT INTO naijue_erp.audit_change"))!;
  assert.deepEqual(JSON.parse(audit.parameters[8] as string), { version: 7, name: native.name }); assert.deepEqual(JSON.parse(audit.parameters[9] as string), { version: 8, name: "SYNTHETIC RENAMED" });
});
test("SYNTHETIC party pg protocol: zero-row CAS rolls back without audit or receipt", async () => {
  const f = protocol(sql => sql.includes("FROM naijue_erp.customer WHERE id") ? { rows: [native], rowCount: 1 } : sql.startsWith("UPDATE") ? { rows: [], rowCount: 0 } : noRows);
  await assert.rejects(createPartyMaintenanceService(dependencies(f.store)).execute({ actor: partyActor, kind: "CUSTOMER", action: "EDIT", requestKey: "stale", id: native.id, expectedVersion: version(7), enabled: true, name: "SYNTHETIC CHANGED" }), (error: unknown) => (error as { code: string }).code === "VERSION_CONFLICT");
  assert.equal(f.calls.at(-1)!.sql, "ROLLBACK"); assert.ok(!f.calls.some(call => call.sql.startsWith("INSERT")));
});
test("SYNTHETIC party pg protocol: trusted enabled-hall default check blocks mutation", async () => {
  const f = protocol(sql => sql.includes("FROM naijue_erp.customer WHERE id") ? { rows: [native], rowCount: 1 } : sql.includes("SELECT EXISTS") ? { rows: [{ used: true }], rowCount: 1 } : noRows);
  await assert.rejects(createPartyMaintenanceService(dependencies(f.store)).execute({ actor: partyActor, kind: "CUSTOMER", action: "DISABLE", requestKey: "disable", id: native.id, expectedVersion: version(7) }), (error: unknown) => (error as { code: string }).code === "CUSTOMER_DEFAULT_IN_USE");
  assert.match(f.calls.find(call => call.sql.includes("SELECT EXISTS"))!.sql, /WHERE enabled AND default_customer_id = \$1/);
  assert.ok(!f.calls.some(call => call.sql.startsWith("UPDATE")));
});
test("SYNTHETIC party pg protocol: bounded one-statement search is parameterized, separate and keeps empty-page totals", async () => {
  const f = protocol(sql => sql.includes("LEFT JOIN LATERAL") ? { rows: [{ id: null, total: "21" }], rowCount: 1 } : noRows);
  const text = "%' OR true --";
  const result = await f.store.transaction(tx => tx.searchSuppliers({ search: text, enabled: "ENABLED", page: 3, pageSize: 20 }));
  assert.equal(result.total, 21); assert.deepEqual(result.items, []);
  const call = f.calls.find(call => call.sql.includes("LEFT JOIN LATERAL"))!;
  assert.match(call.sql, /FROM naijue_erp.supplier/); assert.doesNotMatch(call.sql, /customer|OR true --/);
  assert.match(call.sql, /ORDER BY name COLLATE "C", id LIMIT \$3 OFFSET \$4/); assert.deepEqual(call.parameters, [text, true, 20, 40]);
});
test("SYNTHETIC party pg protocol: commit uncertainty discards connection, no hidden retry", async () => {
  const failure = new Error("SYNTHETIC COMMIT UNCERTAINTY"); const f = protocol(sql => { if (sql === "COMMIT") throw failure; return noRows; });
  await assert.rejects(f.store.transaction(async () => 1), failure); assert.equal(f.connects(), 1); assert.deepEqual(f.releases, [failure]);
  assert.deepEqual(f.calls.map(call => call.sql), ["BEGIN ISOLATION LEVEL READ COMMITTED", "COMMIT"]);
});
test("SYNTHETIC party pg protocol: rollback failure aggregates and discards, escaped handles cannot query", async () => {
  const f = protocol(sql => { if (sql === "ROLLBACK") throw new Error("SYNTHETIC ROLLBACK FAILURE"); return noRows; });
  await assert.rejects(f.store.transaction(async () => { throw new Error("SYNTHETIC COMMAND FAILURE"); }), AggregateError); assert.ok(f.releases[0] instanceof Error);
  const clean = protocol(); let escaped: PartyTransaction | undefined; await clean.store.transaction(async tx => { escaped = tx; }); const count = clean.calls.length;
  await assert.rejects(escaped!.getCustomer(native.id), (error: unknown) => (error as { code: string }).code === "TRANSACTION_CLOSED"); assert.equal(clean.calls.length, count);
});

test("SYNTHETIC atomic party pg protocol: combined EDIT is one guarded native CAS with one sparse audit and receipt", async () => {
  const f = protocol(sql => sql.includes("FROM naijue_erp.customer WHERE id") ? { rows: [native], rowCount: 1 } : sql.includes("SELECT EXISTS") ? { rows: [{ used: false }], rowCount: 1 } : noRows);
  const result = await createPartyMaintenanceService(dependencies(f.store)).execute({ actor: partyActor, kind: "CUSTOMER", action: "EDIT", requestKey: "atomic-pair", id: native.id, expectedVersion: version(7), name: "ATOMIC NAME", enabled: false });
  assert.equal(result.version, 8); assert.equal(result.enabled, false);
  const writes = f.calls.filter(call => call.sql.startsWith("UPDATE naijue_erp.customer")); assert.equal(writes.length, 1); assert.equal(writes[0]!.parameters[2], "ATOMIC NAME"); assert.equal(writes[0]!.parameters[3], false); assert.equal(writes[0]!.parameters[7], 7);
  const guardIndex = f.calls.findIndex(call => call.sql.includes("SELECT EXISTS")); const updateIndex = f.calls.indexOf(writes[0]!); assert.ok(guardIndex >= 0 && guardIndex < updateIndex);
  const audit = f.calls.find(call => call.sql.startsWith("INSERT INTO naijue_erp.audit_change"))!; assert.equal(audit.parameters[5], "EDIT");
  assert.deepEqual(JSON.parse(audit.parameters[8] as string), { version: 7, name: native.name, enabled: true }); assert.deepEqual(JSON.parse(audit.parameters[9] as string), { version: 8, name: "ATOMIC NAME", enabled: false });
  assert.equal(f.calls.filter(call => call.sql.startsWith("INSERT INTO naijue_erp.operation_receipt")).length, 1); assert.equal(f.calls.at(-1)!.sql, "COMMIT");
});
test("SYNTHETIC atomic party pg protocol: dependency rejection precedes all rename/state/audit/receipt writes", async () => {
  const f = protocol(sql => sql.includes("FROM naijue_erp.customer WHERE id") ? { rows: [native], rowCount: 1 } : sql.includes("SELECT EXISTS") ? { rows: [{ used: true }], rowCount: 1 } : noRows);
  await assert.rejects(createPartyMaintenanceService(dependencies(f.store)).execute({ actor: partyActor, kind: "CUSTOMER", action: "EDIT", requestKey: "blocked-pair", id: native.id, expectedVersion: version(7), name: "NOT WRITTEN", enabled: false }), (error: unknown) => (error as { code: string }).code === "CUSTOMER_DEFAULT_IN_USE");
  assert.ok(!f.calls.some(call => call.sql.startsWith("UPDATE") || call.sql.startsWith("INSERT"))); assert.equal(f.calls.at(-1)!.sql, "ROLLBACK");
});

test("historical exact2: locked current load prevents RESTORE/EDIT/DISABLE and legacy maintenance count/page shares source exclusion", async () => {
  for (const action of ["RESTORE", "DISABLE", "EDIT"] as const) {
    const f = protocol(() => noRows, true);
    const base = { actor: partyActor, kind: "CUSTOMER" as const, requestKey: action, id: native.id, expectedVersion: version(7) };
    const command = action === "EDIT" ? { ...base, action, name: "SYNTHETIC", enabled: false } : { ...base, action };
    await assert.rejects(createPartyMaintenanceService(dependencies(f.store)).execute(command), { code: "PARTY_NOT_FOUND" });
    const load = f.calls.find(q => q.sql.includes("FROM naijue_erp.customer WHERE id"))!; assert.match(load.sql, /AND NOT naijue_erp.is_exact_historical_customer_only\(customer.id\) FOR UPDATE/);
    assert.ok(f.calls.every(q => !/^(INSERT|UPDATE)/.test(q.sql))); assert.equal(f.calls.at(-1)!.sql, "ROLLBACK");
  }
  for (const enabled of ["ALL", "ENABLED", "DISABLED"] as const) {
    const f = protocol(sql => sql.includes("totals.total") ? { rows: [{ ...native, enabled: enabled === "ENABLED", total: "1" }], rowCount: 1 } : noRows, true);
    const page = await f.store.transaction(tx => tx.searchCustomers({ search: "", enabled, page: 1, pageSize: 20 }));
    assert.equal(page.items[0]!.enabled, enabled === "ENABLED"); const query = f.calls.find(q => q.sql.includes("totals.total"))!;
    assert.equal(query.sql.match(/NOT naijue_erp.is_exact_historical_customer_only\(customer.id\)/g)?.length, 2);
  }
});
test("historical exact2: final party put refuses true or malformed proof, ordinary disabled customer can restore", async () => {
  for (const proof of [true, null]) {
    const f = protocol(sql => sql.includes("FROM naijue_erp.customer WHERE id") ? { rows: [{ ...native, enabled: false }], rowCount: 1 }
      : sql.includes("AS historical_only") ? { rows: [{ historical_only: proof }], rowCount: 1 } : noRows, true);
    await assert.rejects(createPartyMaintenanceService(dependencies(f.store)).execute({ actor: partyActor, kind: "CUSTOMER", action: "RESTORE", requestKey: "restore", id: native.id, expectedVersion: version(7) }), { code: proof === null ? "INVALID_DATABASE_VALUE" : "PARTY_NOT_FOUND" });
    assert.ok(f.calls.every(q => !/^(INSERT|UPDATE)/.test(q.sql)));
  }
  const f = protocol(sql => sql.includes("FROM naijue_erp.customer WHERE id") ? { rows: [{ ...native, enabled: false }], rowCount: 1 }
    : sql.includes("AS historical_only") ? { rows: [{ historical_only: false }], rowCount: 1 } : noRows, true);
  const result = await createPartyMaintenanceService(dependencies(f.store)).execute({ actor: partyActor, kind: "CUSTOMER", action: "RESTORE", requestKey: "restore-current", id: native.id, expectedVersion: version(7) }); assert.equal(result.enabled, true);
  const proofIndex = f.calls.findIndex(q => q.sql.includes("AS historical_only")), writeIndex = f.calls.findIndex(q => q.sql.startsWith("UPDATE")); assert.ok(proofIndex >= 0 && proofIndex < writeIndex);
});
