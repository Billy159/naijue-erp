import test from "node:test";
import assert from "node:assert/strict";
import { createPartyMaintenanceService } from "../packages/application/src/party-maintenance-service.ts";
import { parsePartyCommand, parsePartySearch } from "../packages/application/src/party-maintenance-validation.ts";
import type { PartyActor, PartyCommand, PartyDependencies, PartyKind } from "../packages/application/src/party-maintenance-ports.ts";
import { version } from "../packages/domain/src/values.ts";
import { partyActor, partyFixture, partyId } from "./support/party-synthetic-store.ts";

const create = (kind: PartyKind = "CUSTOMER", key = "create", name = "SYNTHETIC SAME NAME"): PartyCommand => ({ actor: partyActor, kind, action: "CREATE", requestKey: key, name });
const query = { search: "", enabled: "ALL", page: 1, pageSize: 20 };
const error = (code: string) => (value: unknown) => (value as { code: string }).code === code;
test("SYNTHETIC party: complete separate create/edit/disable/restore lifecycle and sparse audit", async () => {
  const f = partyFixture(); const service = createPartyMaintenanceService(f.dependencies);
  const first = await service.execute(create()); const supplier = await service.execute(create("SUPPLIER", "supplier"));
  assert.notEqual(first.partyId, supplier.partyId); assert.equal(f.customers().length, 1); assert.equal(f.suppliers().length, 1);
  assert.equal(f.customers()[0]!.name, f.suppliers()[0]!.name);
  await service.execute({ actor: partyActor, kind: "CUSTOMER", action: "EDIT", requestKey: "edit", id: first.partyId, expectedVersion: version(1), name: "SYNTHETIC CHANGED" });
  assert.deepEqual(f.audits()[2]!.before, { version: 1, name: "SYNTHETIC SAME NAME" }); assert.deepEqual(f.audits()[2]!.after, { version: 2, name: "SYNTHETIC CHANGED" });
  const disabled = await service.execute({ actor: partyActor, kind: "CUSTOMER", action: "DISABLE", requestKey: "disable", id: first.partyId, expectedVersion: version(2) });
  assert.equal(disabled.enabled, false); assert.equal(disabled.code, first.code);
  assert.deepEqual(f.audits()[3]!.after, { version: 3, enabled: false });
  const restored = await service.execute({ actor: partyActor, kind: "CUSTOMER", action: "RESTORE", requestKey: "restore", id: first.partyId, expectedVersion: version(3) });
  assert.equal(restored.version, 4); assert.equal(restored.enabled, true); assert.equal(f.suppliers()[0]!.version, 1);
  assert.equal((await service.receipt(partyActor, "CUSTOMER", "create")).result.version, 1);
  assert.equal((await service.detail(partyActor, "CUSTOMER", first.partyId)).version, 4);
});
test("SYNTHETIC party: exact replay returns original result after later edits, with no extra writes", async () => {
  const f = partyFixture(); const service = createPartyMaintenanceService(f.dependencies); const command = create();
  const first = await service.execute(command);
  await service.execute({ actor: partyActor, kind: "CUSTOMER", action: "DISABLE", requestKey: "later", id: first.partyId, expectedVersion: version(1) });
  assert.deepEqual(await service.execute(command), first); assert.equal(f.receipts().length, 2); assert.equal(f.customers()[0]!.version, 2);
  await assert.rejects(service.execute(create("CUSTOMER", "create", "DIFFERENT")), error("IDEMPOTENCY_CONFLICT"));
  await assert.rejects(service.execute(create("SUPPLIER", "create")), error("IDEMPOTENCY_CONFLICT"));
});
test("SYNTHETIC party: replay and receipt reauthorize current actor role, role/hall are not part of fingerprint", async () => {
  const f = partyFixture(); const service = createPartyMaintenanceService(f.dependencies); const first = await service.execute(create());
  const warehouse: PartyActor = { ...partyActor, role: "WAREHOUSE", hallId: partyId("hall", 8) };
  assert.deepEqual(await service.execute({ ...create(), actor: warehouse }), first);
  const salesperson: PartyActor = { ...partyActor, role: "SALESPERSON" };
  await assert.rejects(service.execute({ ...create(), actor: salesperson }), error("FORBIDDEN"));
  await assert.rejects(service.receipt(salesperson, "CUSTOMER", "create"), error("FORBIDDEN"));
});
test("SYNTHETIC party: enabled-hall default blocks disable, not harmless edit, and references remain retained", async () => {
  const f = partyFixture(); const service = createPartyMaintenanceService(f.dependencies); const first = await service.execute(create()); f.defaults.add(first.partyId);
  await assert.rejects(service.execute({ actor: partyActor, kind: "CUSTOMER", action: "DISABLE", requestKey: "blocked", id: first.partyId, expectedVersion: version(1) }), error("CUSTOMER_DEFAULT_IN_USE"));
  assert.equal(f.receipts().length, 1); assert.equal(f.audits().length, 1);
  await service.execute({ actor: partyActor, kind: "CUSTOMER", action: "EDIT", requestKey: "rename", id: first.partyId, expectedVersion: version(1), name: "RENAMED" });
  f.defaults.clear(); await service.execute({ actor: partyActor, kind: "CUSTOMER", action: "DISABLE", requestKey: "disabled", id: first.partyId, expectedVersion: version(2) });
  assert.equal(f.customers().length, 1); assert.equal(f.customers()[0]!.id, first.partyId);
});
test("SYNTHETIC party: CAS rejects concurrent different operations while duplicate requests converge", async () => {
  const f = partyFixture(); const service = createPartyMaintenanceService(f.dependencies);
  const [a, b] = await Promise.all([service.execute(create()), service.execute(create())]); assert.deepEqual(a, b); assert.equal(f.customers().length, 1);
  const outcomes = await Promise.allSettled(["one", "two"].map(requestKey => service.execute({ actor: partyActor, kind: "CUSTOMER", action: "EDIT", requestKey, id: a.partyId, expectedVersion: version(1), name: requestKey })));
  assert.equal(outcomes.filter(row => row.status === "fulfilled").length, 1); assert.equal(f.customers()[0]!.version, 2);
});
test("SYNTHETIC party: transaction failures roll back native row/audit/receipt together", async () => {
  for (const point of ["AUDIT", "RECEIPT"] as const) {
    const f = partyFixture(); const service = createPartyMaintenanceService(f.dependencies); f.fail(point);
    await assert.rejects(service.execute(create()), /SYNTHETIC/); assert.deepEqual(f.customers(), []); assert.deepEqual(f.audits(), []); assert.deepEqual(f.receipts(), []);
    f.fail(null); assert.equal((await service.execute(create())).version, 1);
  }
});
test("SYNTHETIC party: historical original code and unknown creation time remain verbatim", async () => {
  const f = partyFixture(); const id = partyId("customer", 12);
  f.seedCustomer({ id, code: " 000123-old ", name: "OLD", enabled: true, version: version(7), createdAt: null, updatedAt: null });
  const service = createPartyMaintenanceService(f.dependencies);
  await service.execute({ actor: partyActor, kind: "CUSTOMER", action: "EDIT", requestKey: "old", id, expectedVersion: version(7), name: "NEW" });
  assert.equal(f.customers()[0]!.code, " 000123-old "); assert.equal(f.customers()[0]!.createdAt, null);
  assert.ok(!Object.hasOwn(f.audits()[0]!.after, "code"));
});
test("SYNTHETIC party: same exact code is legal across separate tables; duplicate within one is rejected", async () => {
  const f = partyFixture(); const service = createPartyMaintenanceService({ ...f.dependencies, codes: { async allocateCustomerCode() { return "0001"; }, async allocateSupplierCode() { return "0001"; } } });
  await service.execute(create()); await service.execute(create("SUPPLIER", "supplier"));
  await assert.rejects(service.execute(create("CUSTOMER", "duplicate")), error("PARTY_CODE_CONFLICT"));
  assert.equal(f.customers().length, 1); assert.equal(f.suppliers().length, 1);
});
test("SYNTHETIC party: candidates are enabled-only and minimal; maintenance lists are separate and paged", async () => {
  const f = partyFixture(); const service = createPartyMaintenanceService(f.dependencies);
  for (let i = 0; i < 21; i++) await service.execute(create("CUSTOMER", `c${i}`, `C${String(i).padStart(2, "0")}`));
  await service.execute(create("SUPPLIER", "s1", "SUPPLIER ONLY"));
  const id = f.customers()[0]!.id; await service.execute({ actor: partyActor, kind: "CUSTOMER", action: "DISABLE", requestKey: "off", id, expectedVersion: version(1) });
  const list = await service.search(partyActor, "CUSTOMER", { ...query, page: 2 }); assert.equal(list.total, 21); assert.equal(list.items.length, 1);
  const candidates = await service.search({ ...partyActor, role: "SALESPERSON" }, "CUSTOMER", { search: "", page: 1, pageSize: 20 }, true);
  assert.equal(candidates.total, 20); assert.deepEqual(Object.keys(candidates.items[0]!).sort(), ["code", "id", "name"]);
  assert.equal((await service.search(partyActor, "SUPPLIER", query)).total, 1);
  await assert.rejects(service.search({ ...partyActor, role: "SALESPERSON" }, "CUSTOMER", query), error("FORBIDDEN"));
});
test("SYNTHETIC party: no absent implicit providers, guessed code, hidden fields, coercion or dual usage", async () => {
  for (const key of ["unitOfWork", "authorization", "codes", "now", "newId"] as const) { const f = partyFixture(); const deps = { ...f.dependencies }; delete (deps as Partial<PartyDependencies>)[key]; assert.throws(() => createPartyMaintenanceService(deps), /explicit/); }
  const valid = { action: "CREATE", requestKey: "key", name: "NAME" };
  for (const additional of [{ code: "CUSTOM" }, { enabled: false }, { usage: ["customer", "supplier"] }, { actor: partyActor }, { kind: "SUPPLIER" }, { createdAt: "x" }]) assert.throws(() => parsePartyCommand({ ...valid, ...additional }, partyActor, "CUSTOMER"));
  for (const name of ["", "   ", null, 123, "\0"]) assert.throws(() => parsePartyCommand({ ...valid, name }, partyActor, "CUSTOMER"));
  for (const input of [{ ...query, page: "1" }, { ...query, page: 0 }, { ...query, pageSize: 10 }, { ...query, enabled: true }, { ...query, usage: "supplier" }]) assert.throws(() => parsePartySearch(input, false));
  const f = partyFixture(); const service = createPartyMaintenanceService({ ...f.dependencies, codes: { async allocateCustomerCode() { return ""; }, async allocateSupplierCode() { return ""; } } });
  await assert.rejects(service.execute(create()), error("INVALID_ALLOCATED_CODE")); assert.equal(f.customers().length, 0);
});
