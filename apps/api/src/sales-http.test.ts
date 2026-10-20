import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import Fastify from "fastify";
import type { ActorContext, SalesAuthorization, SalesBusinessRules, SalesDependencies, SalesUnitOfWork } from "../../../packages/application/src/ports.ts";
import { createCandidateSalesBusinessRules } from "../../../packages/application/src/sales-business-rules.ts";
import { minorAmount } from "../../../packages/domain/src/values.ts";
import { DomainError, requireDomain } from "../../../packages/domain/src/errors.ts";
import type { SalesBusinessType } from "../../../packages/domain/src/documents.ts";
import { actor, fixture, ids, sid, syntheticDraft, SYNTHETIC_RULES } from "../../../tests/support/synthetic-fixtures.ts";
import { createSalesHttpPlugin, exactJson } from "./sales-http.ts";
import type { SalesHttpOptions } from "./sales-http.ts";

interface WireDraft { header: Record<string, unknown>; lines: Record<string, unknown>[]; settlements: Record<string, unknown>[] }
function draft(businessType: SalesBusinessType = "SALE"): WireDraft { return JSON.parse(exactJson(syntheticDraft(businessType))) as WireDraft; }
function save(value = draft(), requestKey = "save", expectedVersion: number | null = null): Record<string, unknown> {
  return { action: "SAVE", requestKey, expectedVersion, draft: value };
}
async function setup(t: TestContext, options: {
  authenticate?: SalesHttpOptions["authenticate"]; authorize?: SalesAuthorization["assertAllowed"];
  rules?: SalesBusinessRules; unitOfWork?: SalesUnitOfWork;
} = {}) {
  const data = fixture();
  const app = Fastify({ logger: false });
  let allowed = true; let authenticated: ActorContext | null = actor; let sequence = 2000;
  const dependencies: SalesDependencies = {
    unitOfWork: options.unitOfWork ?? data.store, rules: options.rules ?? SYNTHETIC_RULES,
    authorization: { async assertAllowed(context, action, document) {
      requireDomain(allowed, "FORBIDDEN", "SYNTHETIC permission revoked");
      // EXCLUSIVELY SYNTHETIC finite reference set, not an ERP permission policy.
      requireDomain(document.header.hallId === ids.hall && document.header.warehouseId === ids.warehouse
        && document.header.customerId === ids.customer && document.lines.every(row => [ids.sku, ids.sku2].includes(row.skuId))
        && document.settlements.every(row => row.paymentAccountId === ids.payment), "FORBIDDEN", "SYNTHETIC unknown/unauthorized reference");
      await options.authorize?.(context, action, document);
    } }, now: () => "2026-10-20T12:00:00Z", newId: kind => sid(kind, sequence++)
  };
  app.register(createSalesHttpPlugin({ authenticate: options.authenticate ?? (async () => authenticated), dependencies }));
  t.after(() => app.close());
  await app.ready();
  const post = (body: unknown) => app.inject({ method: "POST", url: "/sales/commands", headers: { "content-type": "application/json" }, payload: exactJson(body) });
  const command = (action: "APPROVE" | "UNAPPROVE" | "VOID", expectedVersion: number, requestKey = action.toLowerCase()) => post({ action, requestKey, expectedVersion, salesId: ids.sales });
  return { ...data, app, post, command, revoke: () => { allowed = false; }, authenticateAs: (value: ActorContext | null) => { authenticated = value; } };
}

for (const businessType of ["SALE", "RETURN", "EXCHANGE"] as const) {
  test(`SYNTHETIC HTTP ${businessType}: save/approve/unapprove/edit/reapprove, no original-sale reference and no listener`, async t => {
    const f = await setup(t);
    assert.equal(f.app.server.listening, false);
    const value = draft(businessType);
    const saved = await f.post(save(value)); assert.equal(saved.statusCode, 200); assert.equal(saved.json().version, 1);
    assert.equal(f.balance(), 0n);
    assert.equal(f.document().header.createdByAccountId, actor.accountId);
    assert.equal(f.document().header.createdHallId, actor.hallId);
    const approved = await f.command("APPROVE", 1); assert.equal(approved.statusCode, 200); assert.equal(approved.json().status, "APPROVED");
    assert.equal(f.balance(), businessType === "SALE" ? -2n : 2n);
    assert.equal((await f.command("UNAPPROVE", 2)).statusCode, 200); assert.equal(f.balance(), 0n);
    value.header.note = "SYNTHETIC HTTP EDIT";
    assert.equal((await f.post(save(value, "edit", 3))).statusCode, 200);
    assert.equal((await f.command("APPROVE", 4, "reapprove")).statusCode, 200);
    assert.equal(f.document().header.version, 5);
    assert.equal(f.app.server.listening, false);
  });
}
test("SYNTHETIC HTTP: missing providers fail closed; unauthenticated requests never touch storage", async t => {
  assert.throws(() => createSalesHttpPlugin({} as SalesHttpOptions), /explicit trusted authentication/);
  let calls = 0;
  const f = await setup(t, { authenticate: async () => null, unitOfWork: { async transaction() { calls++; throw new Error("Must not execute"); } } });
  for (const [method, url] of [["POST", "/sales/commands"], ["GET", "/sales/receipts/save"]] as const) {
    const response = await f.app.inject({ method, url }); assert.equal(response.statusCode, 401); assert.equal(response.json().error.code, "UNAUTHENTICATED");
    assert.equal(response.headers["cache-control"], "no-store");
  }
  assert.equal(calls, 0);
});
test("SYNTHETIC HTTP: malformed server-derived actor fails closed instead of taking identity from the body", async t => {
  for (const authenticate of [
    async () => ({ accountId: "NOT-A-UUID", hallId: null }) as ActorContext,
    async () => { throw new DomainError("INVALID_ID", "PRIVATE AUTHENTICATION DETAIL"); }
  ]) {
    const f = await setup(t, { authenticate });
    const response = await f.post(save()); assert.equal(response.statusCode, 500); assert.equal(response.json().error.code, "INTERNAL_ERROR"); assert.equal(f.store.snapshot().headers.size, 0);
  }
});
test("SYNTHETIC HTTP: actor cannot be spoofed, and auth receives request metadata only", async t => {
  let observed: unknown;
  const f = await setup(t, { authenticate: async input => { observed = input; return actor; } });
  const response = await f.post({ ...save(), actor: { accountId: sid("account", 999), hallId: null } });
  assert.equal(response.statusCode, 400); assert.equal(response.json().error.code, "INVALID_HTTP_INPUT");
  assert.deepEqual(Object.keys(observed as object).sort(), ["headers", "ip", "method", "url"]);
  assert.equal(f.store.snapshot().headers.size, 0);
});
test("SYNTHETIC HTTP: exact key replay and receipt lookup recover the original result without new mutations", async t => {
  const f = await setup(t); const saved = await f.post(save()); assert.equal(saved.statusCode, 200);
  const approved = await f.command("APPROVE", 1); const before = f.store.snapshot();
  assert.deepEqual((await f.command("APPROVE", 1)).json(), approved.json());
  const recovered = await f.app.inject({ url: "/sales/receipts/approve" });
  assert.equal(recovered.statusCode, 200); assert.deepEqual(recovered.json().result, approved.json());
  assert.deepEqual(Object.keys(recovered.json()).sort(), ["action", "completedAt", "requestKey", "result", "status"]);
  assert.deepEqual(f.store.snapshot(), before); assert.equal(f.balance(), -2n);
});
test("SYNTHETIC HTTP: receipt is account-scoped and rechecks current access after revocation", async t => {
  const f = await setup(t); await f.post(save()); const before = f.store.snapshot();
  f.authenticateAs({ ...actor, accountId: sid("account", 999) });
  assert.equal((await f.app.inject({ url: "/sales/receipts/save" })).statusCode, 404);
  f.authenticateAs(actor); f.revoke();
  assert.equal((await f.app.inject({ url: "/sales/receipts/save" })).statusCode, 403);
  assert.equal((await f.post(save())).statusCode, 403); assert.deepEqual(f.store.snapshot(), before);
});
test("SYNTHETIC HTTP: key content conflicts and stale versions return 409 without changing state", async t => {
  const f = await setup(t); await f.post(save()); const before = f.store.snapshot();
  const changed = draft(); changed.header.note = "CHANGED";
  const conflict = await f.post(save(changed)); assert.equal(conflict.statusCode, 409); assert.equal(conflict.json().error.code, "IDEMPOTENCY_CONFLICT");
  const stale = await f.command("APPROVE", 2); assert.equal(stale.statusCode, 409); assert.equal(stale.json().error.code, "VERSION_CONFLICT");
  assert.deepEqual(f.store.snapshot(), before);
});
test("SYNTHETIC HTTP: approval requires exact settlement equality, not debt or overpayment", async t => {
  for (const amount of ["249", "251"]) {
    const f = await setup(t); const value = draft(); value.settlements[0]!.amount = amount;
    assert.equal((await f.post(save(value))).statusCode, 200); const before = f.store.snapshot();
    const response = await f.command("APPROVE", 1); assert.equal(response.statusCode, 422); assert.equal(response.json().error.code, "SETTLEMENT_MISMATCH");
    assert.deepEqual(f.store.snapshot(), before);
  }
});
test("SYNTHETIC HTTP: proposed reference scope is checked by injected server authorization", async t => {
  for (const reference of ["hallId", "warehouseId", "customerId"]) {
    const f = await setup(t); await f.post(save()); const before = f.store.snapshot(); const value = draft(); value.header[reference] = sid("hall", 999);
    const response = await f.post(save(value, "move", 1)); assert.equal(response.statusCode, 403); assert.deepEqual(f.store.snapshot(), before);
  }
  const f = await setup(t); const value = draft(); value.settlements[0]!.paymentAccountId = sid("paymentAccount", 999);
  assert.equal((await f.post(save(value))).statusCode, 403); assert.equal(f.store.snapshot().headers.size, 0);
});
test("SYNTHETIC HTTP: historical cutoff modifications remain explicitly unsupported", async t => {
  const f = await setup(t); await f.post(save());
  f.store.seedCutoffHistory({ ...f.document(), header: { ...f.document().header, status: "APPROVED" } });
  const before = f.store.snapshot(); const response = await f.command("UNAPPROVE", 1);
  assert.equal(response.statusCode, 409); assert.equal(response.json().error.code, "HISTORICAL_POSTING_NOT_IMPLEMENTED"); assert.deepEqual(f.store.snapshot(), before);
});
test("SYNTHETIC HTTP: saved-draft VOID changes no inventory; approved edits stay rejected", async t => {
  const f = await setup(t); await f.post(save()); assert.equal((await f.command("VOID", 1)).statusCode, 200); assert.equal(f.balance(), 0n);
  const g = await setup(t); await g.post(save()); await g.command("APPROVE", 1);
  assert.equal((await g.post(save(draft(), "edit", 2))).json().error.code, "INVALID_STATE");
});

const invalidInputs: ReadonlyArray<readonly [string, (body: Record<string, unknown>, value: WireDraft) => void]> = [
  ["missing version", body => { delete body.expectedVersion; }],
  ["numeric-string version", body => { body.expectedVersion = "1"; }],
  ["fractional version", body => { body.expectedVersion = 1.5; }],
  ["unsafe version", body => { body.expectedVersion = 9007199254740992; }],
  ["empty key", body => { body.requestKey = ""; }],
  ["noncanonical key", body => { body.requestKey = " save "; }],
  ["unknown action", body => { body.action = "APPROVE_WITH_DEBT"; }],
  ["server stock effects", body => { body.ledger = []; }],
  ["header status", (_body, value) => { value.header.status = "APPROVED"; }],
  ["original-sale link", (_body, value) => { value.header.originalSalesId = ids.sales; }],
  ["malformed reference", (_body, value) => { value.header.customerId = "123"; }],
  ["invalid real date", (_body, value) => { value.header.businessDate = "2026-02-30"; }],
  ["numeric money", (_body, value) => { value.header.netDue = 250; }],
  ["decimal money", (_body, value) => { value.header.netDue = "2.50"; }],
  ["exponent money", (_body, value) => { value.header.netDue = "25e1"; }],
  ["leading-zero money", (_body, value) => { value.header.netDue = "0250"; }],
  ["negative-zero money", (_body, value) => { value.header.netDue = "-0"; }],
  ["numeric quantity", (_body, value) => { value.lines[0]!.quantity = 2; }],
  ["fractional quantity", (_body, value) => { value.lines[0]!.quantity = "2.0"; }],
  ["overflow quantity", (_body, value) => { value.lines[0]!.quantity = "9223372036854775808"; }],
  ["fractional line position", (_body, value) => { value.lines[0]!.lineNo = 1.1; }],
  ["string boolean", (_body, value) => { value.lines[0]!.isGift = "false"; }],
  ["missing pricing intent", (_body, value) => { delete value.lines[0]!.pricingRule; }],
  ["null pricing intent", (_body, value) => { value.lines[0]!.pricingRule = null; }],
  ["unknown pricing intent", (_body, value) => { value.lines[0]!.pricingRule = "APPROXIMATE_RATIO"; }],
  ["missing zero confirmation", (_body, value) => { delete value.lines[0]!.zeroConfirmed; }],
  ["string zero confirmation", (_body, value) => { value.lines[0]!.zeroConfirmed = "true"; }],
  ["null zero confirmation", (_body, value) => { value.lines[0]!.zeroConfirmed = null; }],
  ["fractional entered discount", (_body, value) => { value.lines[0]!.discountTenths = 50.5; }],
  ["string entered discount", (_body, value) => { value.lines[0]!.discountTenths = "50"; }],
  ["out of range entered discount", (_body, value) => { value.lines[0]!.discountTenths = 101; }],
  ["noncurrent incoming row", (_body, value) => { value.lines[0]!.isCurrent = false; }],
  ["snapshot unknown field", (_body, value) => { (value.lines[0]!.snapshot as Record<string, unknown>).hidden = true; }],
  ["settlement unknown field", (_body, value) => { value.settlements[0]!.balance = "0"; }],
  ["negative settlement", (_body, value) => { value.settlements[0]!.amount = "-250"; }],
  ["foreign line owner", (_body, value) => { value.lines[0]!.salesId = sid("sales", 999); }]
];
for (const [name, mutate] of invalidInputs) {
  test(`SYNTHETIC HTTP: rejects ${name} without coercion or writes`, async t => {
    const f = await setup(t); const value = draft(); const body = save(value); mutate(body, value);
    const response = await f.post(body); assert.ok([400, 422].includes(response.statusCode), response.body);
    assert.equal(f.store.snapshot().headers.size, 0); assert.equal(f.store.snapshot().receipts.size, 0);
  });
}
test("SYNTHETIC HTTP: unknown query fields and malformed transport are rejected", async t => {
  const f = await setup(t);
  const responses = await Promise.all([
    f.app.inject({ method: "POST", url: "/sales/commands?actor=spoof", payload: save() }),
    f.app.inject({ url: "/sales/receipts/save?accountId=spoof" }),
    f.app.inject({ method: "POST", url: "/sales/commands", headers: { "content-type": "application/json" }, payload: "{" }),
    f.app.inject({ method: "POST", url: "/sales/commands", headers: { "content-type": "application/json" }, payload: '{"__proto__":{}}' }),
    f.app.inject({ method: "POST", url: "/sales/commands", headers: { "content-type": "application/json" }, payload: "" })
  ]);
  for (const response of responses) assert.equal(response.statusCode, 400, response.body);
  assert.equal((await f.app.inject({ method: "POST", url: "/sales/commands", payload: "text" })).statusCode, 415);
  assert.equal((await f.app.inject({ method: "POST", url: "/sales/commands", headers: { "content-type": "application/json" }, payload: JSON.stringify({ padding: "x".repeat(65_536) }) })).statusCode, 413);
  assert.equal(f.store.snapshot().headers.size, 0);
});
test("SYNTHETIC HTTP: exact money/quantity arrive as bigint, and JSON never rounds bigint", async t => {
  const exact = "900719925474099312345678901234567890"; let checked = false;
  const f = await setup(t, { rules: { ...SYNTHETIC_RULES, assertDraftChange(_previous, value) {
    assert.equal(value.header.grossAmount, BigInt(exact)); assert.equal(value.lines[0]!.quantity, 2n); checked = true;
  } } });
  const value = draft(); value.header.grossAmount = exact;
  assert.equal((await f.post(save(value))).statusCode, 200); assert.equal(checked, true);
  assert.equal(f.document().header.grossAmount.toString(), exact);
  assert.deepEqual(JSON.parse(exactJson({ amount: BigInt(exact), quantity: -2n })), { amount: exact, quantity: "-2" });
});
test("SYNTHETIC HTTP: unexpected provider failures do not leak details and original key can retry", async t => {
  const f = await setup(t); f.store.failNextAt = "receipt";
  const response = await f.post(save()); assert.equal(response.statusCode, 500); assert.deepEqual(response.json(), { error: { code: "INTERNAL_ERROR", message: "The request could not be completed" } });
  assert.equal(f.store.snapshot().headers.size, 0); assert.equal((await f.post(save())).statusCode, 200);
});
test("SYNTHETIC HTTP: unknown provider DomainError is not exposed as a client-supplied status or text", async t => {
  const f = await setup(t, { authorize: async () => { throw new DomainError("INTERNAL_PROVIDER_DETAIL", "PRIVATE PROVIDER DIAGNOSTIC"); } });
  const response = await f.post(save()); assert.equal(response.statusCode, 500); assert.equal(response.json().error.code, "INTERNAL_ERROR"); assert.ok(!response.body.includes("PRIVATE"));
});


test("candidate policy / SYNTHETIC HTTP: explicit discount metadata persists and economics errors use allowlisted responses", async t => {
  const productId = sid("product", 999);
  const rules = createCandidateSalesBusinessRules({
    sku: id => [ids.sku, ids.sku2].includes(id) ? { id, productId, enabled: true } : undefined,
    productPricing: id => id === productId ? { id, enabled: true, referencePrice: minorAmount("125"), minimumPrice: null } : undefined,
    assertDocumentReferences(document) {
      requireDomain(document.header.customerId === ids.customer && document.header.warehouseId === ids.warehouse
        && document.settlements.every(row => row.paymentAccountId === ids.payment), "FORBIDDEN", "SYNTHETIC references only");
    }
  });
  const f = await setup(t, { rules }); const value = draft();
  Object.assign(value.lines[0]!, { pricingRule: "DISCOUNT", discountTenths: 50, dealPrice: "63", lineAmount: "126" });
  Object.assign(value.header, { grossAmount: "126", netDue: "126" }); value.settlements[0]!.amount = "126";
  const incorrect = structuredClone(value); incorrect.lines[0]!.dealPrice = "62";
  const rejected = await f.post(save(incorrect));
  assert.equal(rejected.statusCode, 422); assert.equal(rejected.json().error.code, "DISCOUNT_PRICE_MISMATCH");
  assert.equal(f.store.snapshot().headers.size, 0);
  assert.equal((await f.post(save(value))).statusCode, 200);
  assert.equal((await f.command("APPROVE", 1)).statusCode, 200);
  assert.equal(f.document().lines[0]?.pricingRule, "DISCOUNT"); assert.equal(f.document().lines[0]?.discountTenths, 50);
  assert.equal(f.document().lines[0]?.zeroConfirmed, false); assert.equal(f.document().header.netDue, 126n);
  assert.equal(f.balance(), -2n); assert.equal(f.app.server.listening, false);
});
