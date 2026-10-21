import { TRANSFER_COMMAND_MAX_REQUEST_BYTES } from "../../../packages/application/src/transfer-payload-budget.ts";
import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import Fastify from "fastify";
import type { TransferActor, TransferAuthorization, TransferDependencies, TransferReferences, TransferRole, TransferUnitOfWork } from "../../../packages/application/src/transfer-ports.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { sid } from "../../../tests/support/synthetic-fixtures.ts";
import { actor, draft as syntheticDraft, fixture, ids } from "../../../tests/support/synthetic-transfer.ts";
import { exactJson } from "./sales-http.ts";
import { createTransferHttpPlugin } from "./transfer-http.ts";
import type { TransferHttpOptions } from "./transfer-http.ts";

interface WireDraft { header: Record<string, unknown>; lines: Record<string, unknown>[] }
function draft(): WireDraft { return JSON.parse(exactJson(syntheticDraft())) as WireDraft; }
function save(value = draft(), requestKey = "save", expectedVersion: number | null = null): Record<string, unknown> {
  return { action: "SAVE", requestKey, expectedVersion, draft: value };
}
async function setup(t: TestContext, options: {
  authenticate?: TransferHttpOptions["authenticate"]; authorize?: TransferAuthorization["assertAllowed"];
  references?: TransferReferences; unitOfWork?: TransferUnitOfWork;
} = {}) {
  const data = fixture();
  const app = Fastify({ logger: false });
  let authenticated: TransferActor | null = actor;
  const dependencies: TransferDependencies = { ...data.dependencies,
    unitOfWork: options.unitOfWork ?? data.dependencies.unitOfWork,
    references: options.references ?? data.dependencies.references,
    authorization: { async assertAllowed(context, action, document, previous, tx) {
      await data.dependencies.authorization.assertAllowed(context, action, document, previous, tx);
      await options.authorize?.(context, action, document, previous, tx);
    } }
  };
  app.register(createTransferHttpPlugin({ authenticate: options.authenticate ?? (async () => authenticated), dependencies }));
  t.after(() => app.close());
  await app.ready();
  const post = (body: unknown) => app.inject({ method: "POST", url: "/transfers/commands", headers: { "content-type": "application/json" }, payload: exactJson(body) });
  const command = (action: "APPROVE" | "UNAPPROVE" | "VOID", expectedVersion: number, requestKey = action.toLowerCase()) => post({ action, requestKey, expectedVersion, transferId: ids.transfer });
  return { ...data, app, post, command, authenticateAs: (value: TransferActor | null) => { authenticated = value; } };
}

test("SYNTHETIC transfer HTTP: save/approve/unapprove/edit/reapprove is two-ended and never listens", async t => {
  const f = await setup(t); const value = draft();
  const from = f.balance(ids.fromWarehouse, ids.sku)!; const to = f.balance(ids.toWarehouse, ids.sku)!;
  const moved = BigInt(value.lines[0]!.quantity as string);
  assert.equal(f.app.server.listening, false);
  const saved = await f.post(save(value)); assert.equal(saved.statusCode, 200, saved.body); assert.equal(saved.json().version, 1);
  assert.equal(f.balance(ids.fromWarehouse, ids.sku), from); assert.equal(f.balance(ids.toWarehouse, ids.sku), to);
  assert.equal(f.document().header.createdByAccountId, actor.accountId); assert.equal(f.document().header.createdHallId, actor.hallId);
  assert.equal(f.document().header.createdRole, actor.role);
  const approved = await f.command("APPROVE", 1); assert.equal(approved.statusCode, 200, approved.body); assert.equal(approved.json().ledgerEntryIds.length, value.lines.length * 2);
  assert.equal(f.balance(ids.fromWarehouse, ids.sku), from - moved); assert.equal(f.balance(ids.toWarehouse, ids.sku), to + moved);
  assert.equal((await f.command("UNAPPROVE", 2)).statusCode, 200);
  assert.equal(f.balance(ids.fromWarehouse, ids.sku), from); assert.equal(f.balance(ids.toWarehouse, ids.sku), to);
  value.header.note = "SYNTHETIC HTTP EDIT";
  assert.equal((await f.post(save(value, "edit", 3))).statusCode, 200);
  assert.equal((await f.command("APPROVE", 4, "reapprove")).statusCode, 200);
  assert.equal(f.document().header.version, 5); assert.equal(f.document().header.createdRole, actor.role);
  assert.equal(f.app.server.listening, false);
});
test("SYNTHETIC transfer HTTP: all security and reference providers are mandatory", () => {
  assert.throws(() => createTransferHttpPlugin({} as TransferHttpOptions), /explicit trusted authentication/);
  const dependencies = fixture().dependencies;
  for (const key of ["unitOfWork", "authorization", "references", "now", "newId"] as const) {
    const incomplete = { ...dependencies }; delete (incomplete as Partial<TransferDependencies>)[key];
    assert.throws(() => createTransferHttpPlugin({ authenticate: async () => actor, dependencies: incomplete }), /explicit trusted authentication/);
  }
  assert.throws(() => createTransferHttpPlugin({ authenticate: async () => actor, dependencies: { ...dependencies, references: {} as TransferReferences } }), /reference validation/);
});
test("SYNTHETIC transfer HTTP: unauthenticated requests do not touch storage", async t => {
  let calls = 0;
  const f = await setup(t, { authenticate: async () => null, unitOfWork: { async transaction() { calls++; throw new Error("Must not execute"); } } });
  for (const [method, url] of [["POST", "/transfers/commands"], ["GET", "/transfers/receipts/save"]] as const) {
    const response = await f.app.inject({ method, url }); assert.equal(response.statusCode, 401); assert.equal(response.json().error.code, "UNAUTHENTICATED");
    assert.equal(response.headers["cache-control"], "no-store");
  }
  assert.equal(calls, 0);
});
test("SYNTHETIC transfer HTTP: invalid trusted identities and roles fail closed without leaking authentication details", async t => {
  for (const authenticate of [
    async () => ({ ...actor, accountId: "INVALID" }) as TransferActor,
    async () => ({ ...actor, hallId: "INVALID" }) as TransferActor,
    async () => ({ ...actor, role: "admin" }) as unknown as TransferActor,
    async () => ({ accountId: actor.accountId, hallId: actor.hallId }) as TransferActor,
    async () => Object.create(actor) as TransferActor,
    async () => { throw new DomainError("FORBIDDEN", "PRIVATE AUTHENTICATION DETAIL"); }
  ]) {
    const f = await setup(t, { authenticate }); const before = f.store.snapshot();
    const response = await f.post(save()); assert.equal(response.statusCode, 500); assert.equal(response.json().error.code, "INTERNAL_ERROR");
    assert.ok(!response.body.includes("PRIVATE")); assert.deepEqual(f.store.snapshot(), before);
  }
});
test("SYNTHETIC transfer HTTP: request identity is never accepted, authentication receives metadata only", async t => {
  let observed: unknown;
  const f = await setup(t, { authenticate: async input => { observed = input; assert.ok(Object.isFrozen(input.headers)); return actor; } });
  const before = f.store.snapshot();
  for (const field of ["actor", "role", "accountId", "hallId", "createdByAccountId", "createdHallId", "createdRole"]) {
    const response = await f.post({ ...save(), [field]: field === "actor" ? actor : "SPOOF" });
    assert.equal(response.statusCode, 400); assert.equal(response.json().error.code, "INVALID_HTTP_INPUT");
  }
  assert.deepEqual(Object.keys(observed as object).sort(), ["headers", "ip", "method", "url"]);
  assert.deepEqual(f.store.snapshot(), before);
});
test("SYNTHETIC transfer HTTP: trusted actor role and creation identity are isolated before asynchronous providers run", async t => {
  const data = fixture();
  const shared: { accountId: TransferActor["accountId"]; hallId: TransferActor["hallId"]; role: TransferRole } = { ...actor };
  const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createTransferHttpPlugin({ authenticate: async () => shared, dependencies: { ...data.dependencies,
    unitOfWork: { async transaction(work) {
      shared.accountId = sid("account", 999); shared.hallId = null; shared.role = "ADMIN";
      return data.store.transaction(work);
    } },
    authorization: { async assertAllowed(context, action, document, previous, tx) {
      assert.deepEqual(context, actor);
      await data.dependencies.authorization.assertAllowed(context, action, document, previous, tx);
    } }
  } }));
  await app.ready();
  const response = await app.inject({ method: "POST", url: "/transfers/commands", headers: { "content-type": "application/json" }, payload: exactJson(save()) });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(data.document().header.createdByAccountId, actor.accountId); assert.equal(data.document().header.createdHallId, actor.hallId);
  assert.equal(data.document().header.createdRole, actor.role);
});
test("SYNTHETIC transfer HTTP: each accepted role comes from authentication, not request defaults", async t => {
  for (const role of ["ADMIN", "WAREHOUSE", "SALESPERSON"] as const) {
    const f = await setup(t, { authenticate: async () => ({ ...actor, role }) });
    const response = await f.post(save()); assert.equal(response.statusCode, 200, response.body); assert.equal(f.document().header.createdRole, role);
  }
});
test("SYNTHETIC transfer HTTP: exact key replay and receipts expose only current-authorized result fields", async t => {
  let receiptChecked = false;
  const f = await setup(t, { authorize: async (_actor, action, document, _previous, tx) => {
    if (action === "APPROVE" && "status" in document.header && document.header.status === "APPROVED") { assert.ok(tx); receiptChecked = true; }
  } });
  assert.equal((await f.post(save())).statusCode, 200); const approved = await f.command("APPROVE", 1); const before = f.store.snapshot();
  assert.deepEqual((await f.command("APPROVE", 1)).json(), approved.json());
  const recovered = await f.app.inject({ url: "/transfers/receipts/approve" });
  assert.equal(recovered.statusCode, 200, recovered.body); assert.deepEqual(recovered.json().result, approved.json());
  assert.deepEqual(Object.keys(recovered.json()).sort(), ["action", "completedAt", "requestKey", "result", "status"]);
  assert.equal(recovered.headers["cache-control"], "no-store"); assert.ok(receiptChecked); assert.deepEqual(f.store.snapshot(), before);
});
test("SYNTHETIC transfer HTTP: receipt ownership and revoked current permission are checked", async t => {
  const f = await setup(t); await f.post(save()); const before = f.store.snapshot();
  f.authenticateAs({ ...actor, accountId: sid("account", 999) });
  assert.equal((await f.app.inject({ url: "/transfers/receipts/save" })).statusCode, 404);
  f.authenticateAs(actor); f.revokeAccess();
  assert.equal((await f.app.inject({ url: "/transfers/receipts/save" })).statusCode, 403);
  assert.equal((await f.post(save())).statusCode, 403); assert.deepEqual(f.store.snapshot(), before);
});
test("SYNTHETIC transfer HTTP: current hall visibility is checked without treating stored creator role as caller authority", async t => {
  const f = await setup(t); f.authenticateAs({ ...actor, role: "ADMIN" }); await f.post(save());
  f.authenticateAs({ ...actor, hallId: ids.otherHall }); const before = f.store.snapshot();
  assert.equal((await f.app.inject({ url: "/transfers/receipts/save" })).statusCode, 403);
  assert.equal((await f.post(save(draft(), "edit", 1))).statusCode, 403); assert.deepEqual(f.store.snapshot(), before);
});
test("SYNTHETIC transfer HTTP: receipt recovery rechecks authorization but does not revalidate reference/effect commands", async t => {
  let referenceChecks = 0;
  const f = await setup(t, { references: { async assertValid() { referenceChecks++; } } });
  await f.post(save()); assert.equal(referenceChecks, 1);
  const recovered = await f.app.inject({ url: "/transfers/receipts/save" }); assert.equal(recovered.statusCode, 200);
  assert.equal(referenceChecks, 1);
});
test("SYNTHETIC transfer HTTP: changed-key contents and stale expectedVersion are conflicts, VOID does not post stock", async t => {
  const f = await setup(t); await f.post(save()); const before = f.store.snapshot(); const value = draft(); value.header.note = "CHANGED";
  const changed = await f.post(save(value)); assert.equal(changed.statusCode, 409); assert.equal(changed.json().error.code, "IDEMPOTENCY_CONFLICT");
  const stale = await f.command("APPROVE", 2); assert.equal(stale.statusCode, 409); assert.equal(stale.json().error.code, "VERSION_CONFLICT");
  assert.deepEqual(f.store.snapshot(), before);
  const voided = await f.command("VOID", 1); assert.equal(voided.statusCode, 200); assert.equal(voided.json().status, "VOID"); assert.deepEqual(voided.json().ledgerEntryIds, []);
});
test("SYNTHETIC transfer HTTP: semantic transfer/reference failures use explicit safe client statuses and roll back", async t => {
  for (const mutate of [
    (value: WireDraft) => { value.header.toWarehouseId = value.header.fromWarehouseId; },
    (value: WireDraft) => { value.lines = []; },
    (value: WireDraft) => { value.lines[0]!.quantity = "0"; },
    (value: WireDraft) => { value.lines[0]!.quantity = "-2"; },
    (value: WireDraft) => { value.lines[0]!.transferId = sid("transfer", 999); },
    (value: WireDraft) => { value.lines.push({ ...value.lines[0]! }); }
  ]) {
    const f = await setup(t); const before = f.store.snapshot(); const value = draft(); mutate(value);
    const response = await f.post(save(value)); assert.equal(response.statusCode, 422, response.body); assert.deepEqual(f.store.snapshot(), before);
  }
  for (const field of ["fromWarehouseId", "toWarehouseId", "skuId"] as const) {
    const f = await setup(t); const before = f.store.snapshot(); const value = draft();
    if (field === "skuId") value.lines[0]!.skuId = sid("sku", 999);
    else value.header[field] = sid("warehouse", 999);
    const response = await f.post(save(value)); assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().error.code, field === "skuId" ? "SKU_UNAVAILABLE" : "WAREHOUSE_UNAVAILABLE"); assert.deepEqual(f.store.snapshot(), before);
  }
});
test("SYNTHETIC transfer HTTP: missing inventory and historical posting basis are explicit conflicts, never manufactured stock", async t => {
  const f = await setup(t); await f.post(save()); f.store.removeBalance(ids.toWarehouse, ids.sku); const before = f.store.snapshot();
  const missing = await f.command("APPROVE", 1); assert.equal(missing.statusCode, 409); assert.equal(missing.json().error.code, "INVENTORY_NOT_READY");
  assert.deepEqual(f.store.snapshot(), before);
  const g = await setup(t); await g.post(save());
  g.store.seedDocument({ ...g.document(), header: { ...g.document().header, status: "APPROVED" } }, "CUTOFF_HISTORY");
  const history = g.store.snapshot(); const response = await g.command("UNAPPROVE", 1);
  assert.equal(response.statusCode, 409); assert.equal(response.json().error.code, "HISTORICAL_POSTING_NOT_IMPLEMENTED"); assert.deepEqual(g.store.snapshot(), history);
});
test("SYNTHETIC transfer HTTP: receipt failure rolls back and preserves the same original key for caller-directed retry", async t => {
  const f = await setup(t); const before = f.store.snapshot(); f.store.failNextAt = "receipt";
  const response = await f.post(save()); assert.equal(response.statusCode, 500); assert.equal(response.json().error.code, "INTERNAL_ERROR");
  assert.deepEqual(f.store.snapshot(), before); assert.equal((await f.post(save())).statusCode, 200);
});

const invalidInputs: ReadonlyArray<readonly [string, (body: Record<string, unknown>, value: WireDraft) => void]> = [
  ["missing version", body => { delete body.expectedVersion; }],
  ["numeric-string version", body => { body.expectedVersion = "1"; }],
  ["fractional version", body => { body.expectedVersion = 1.5; }],
  ["unsafe version", body => { body.expectedVersion = 9007199254740992; }],
  ["zero version", body => { body.expectedVersion = 0; }],
  ["empty key", body => { body.requestKey = ""; }],
  ["key whitespace", body => { body.requestKey = " save "; }],
  ["unknown action", body => { body.action = "APPROVE_WITH_DEBT"; }],
  ["client stock effects", body => { body.ledger = []; }],
  ["client transfer id on SAVE", body => { body.transferId = ids.transfer; }],
  ["header status", (_body, value) => { value.header.status = "APPROVED"; }],
  ["header creator account", (_body, value) => { value.header.createdByAccountId = actor.accountId; }],
  ["header creator hall", (_body, value) => { value.header.createdHallId = actor.hallId; }],
  ["header creator role", (_body, value) => { value.header.createdRole = "ADMIN"; }],
  ["header action time", (_body, value) => { value.header.createdAt = "2026-10-20T00:00:00Z"; }],
  ["header missing note", (_body, value) => { delete value.header.note; }],
  ["numeric note", (_body, value) => { value.header.note = 0; }],
  ["malformed warehouse", (_body, value) => { value.header.fromWarehouseId = "123"; }],
  ["invalid calendar date", (_body, value) => { value.header.businessDate = "2026-02-30"; }],
  ["numeric quantity", (_body, value) => { value.lines[0]!.quantity = 2; }],
  ["fractional quantity", (_body, value) => { value.lines[0]!.quantity = "2.0"; }],
  ["exponent quantity", (_body, value) => { value.lines[0]!.quantity = "2e0"; }],
  ["leading-zero quantity", (_body, value) => { value.lines[0]!.quantity = "02"; }],
  ["negative-zero quantity", (_body, value) => { value.lines[0]!.quantity = "-0"; }],
  ["overflow quantity", (_body, value) => { value.lines[0]!.quantity = "9223372036854775808"; }],
  ["fractional line position", (_body, value) => { value.lines[0]!.lineNo = 1.1; }],
  ["string line position", (_body, value) => { value.lines[0]!.lineNo = "1"; }],
  ["missing current marker", (_body, value) => { delete value.lines[0]!.isCurrent; }],
  ["noncurrent incoming row", (_body, value) => { value.lines[0]!.isCurrent = false; }],
  ["snapshot extra key", (_body, value) => { (value.lines[0]!.snapshot as Record<string, unknown>).hidden = true; }],
  ["line sales-only field", (_body, value) => { value.lines[0]!.dealPrice = "0"; }],
  ["sales-only settlements", (_body, value) => { (value as unknown as Record<string, unknown>).settlements = []; }]
];
for (const [name, mutate] of invalidInputs) {
  test(`SYNTHETIC transfer HTTP: rejects ${name} without coercion or writes`, async t => {
    let calls = 0;
    const f = await setup(t, { unitOfWork: { async transaction() { calls++; throw new Error("Malformed requests must not reach storage"); } } });
    const value = draft(); const body = save(value); mutate(body, value);
    const response = await f.post(body); assert.ok([400, 422].includes(response.statusCode), response.body); assert.equal(calls, 0);
  });
}
test("SYNTHETIC transfer HTTP: transition commands accept neither SAVE payload nor nullable version", async t => {
  let calls = 0;
  const f = await setup(t, { unitOfWork: { async transaction() { calls++; throw new Error("Must not execute"); } } });
  for (const body of [
    { action: "APPROVE", requestKey: "approve", expectedVersion: null, transferId: ids.transfer },
    { action: "VOID", requestKey: "void", expectedVersion: 1, draft: draft() },
    { action: "UNAPPROVE", requestKey: "unapprove", expectedVersion: 1, transferId: ids.transfer, draft: draft() }
  ]) assert.equal((await f.post(body)).statusCode, 400);
  assert.equal(calls, 0);
});
test("SYNTHETIC transfer HTTP: malformed JSON/media/body limits and extra query fields are rejected", async t => {
  let calls = 0;
  const f = await setup(t, { unitOfWork: { async transaction() { calls++; throw new Error("Must not execute"); } } });
  const responses = await Promise.all([
    f.app.inject({ method: "POST", url: "/transfers/commands?role=ADMIN", payload: save() }),
    f.app.inject({ url: "/transfers/receipts/save?accountId=spoof" }),
    f.app.inject({ url: "/transfers/receipts/not%20canonical" }),
    f.app.inject({ method: "POST", url: "/transfers/commands", headers: { "content-type": "application/json" }, payload: "{" }),
    f.app.inject({ method: "POST", url: "/transfers/commands", headers: { "content-type": "application/json" }, payload: '{"__proto__":{}}' }),
    f.app.inject({ method: "POST", url: "/transfers/commands", headers: { "content-type": "application/json" }, payload: "" })
  ]);
  for (const response of responses) assert.equal(response.statusCode, 400, response.body);
  assert.equal((await f.app.inject({ method: "POST", url: "/transfers/commands", payload: "text" })).statusCode, 415);
  assert.equal((await f.app.inject({ method: "POST", url: "/transfers/commands", headers: { "content-type": "application/json" }, payload: JSON.stringify({ padding: "x".repeat(TRANSFER_COMMAND_MAX_REQUEST_BYTES) }) })).statusCode, 413);
  assert.equal(calls, 0);
});
test("SYNTHETIC transfer HTTP: bigint quantity reaches trusted references exactly, without a numeric round trip", async t => {
  const exact = "9007199254740993"; let checked = false;
  const f = await setup(t, { references: { async assertValid(_tx, _actor, _action, _previous, proposed) {
    assert.equal(proposed.lines[0]!.quantity, BigInt(exact)); assert.equal(typeof proposed.lines[0]!.quantity, "bigint"); checked = true;
  } } });
  const value = draft(); value.lines[0]!.quantity = exact;
  const response = await f.post(save(value)); assert.equal(response.statusCode, 200, response.body); assert.ok(checked);
  assert.equal(f.document().lines[0]!.quantity.toString(), exact);
});
test("SYNTHETIC transfer HTTP: unknown provider errors never leak diagnostic text or arbitrary error codes", async t => {
  for (const failure of [new Error("PRIVATE SQL CREDENTIAL DETAIL"), new DomainError("INTERNAL_PROVIDER_DETAIL", "PRIVATE PROVIDER DETAIL")]) {
    const f = await setup(t, { authorize: async () => { throw failure; } }); const before = f.store.snapshot();
    const response = await f.post(save()); assert.equal(response.statusCode, 500); assert.deepEqual(response.json(), { error: { code: "INTERNAL_ERROR", message: "The request could not be completed" } });
    assert.ok(!response.body.includes("PRIVATE")); assert.deepEqual(f.store.snapshot(), before);
  }
});
