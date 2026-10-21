/** SYNTHETIC HTTP boundary tests. No listener, database or real catalogue. */
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createSalesHttpPlugin, exactJson } from "./sales-http.ts";
import type { SalesHttpOptions } from "./sales-http.ts";
import { parseSalesCreateProposal } from "./sales-preparation-input.ts";
import { SALES_COMMAND_MAX_REQUEST_BYTES, SALES_PREPARE_MAX_REQUEST_BYTES } from "../../../packages/application/src/sales-payload-budget.ts";
import { actor, fixture as baseFixture, ids, sid, syntheticDraft, SYNTHETIC_RULES } from "../../../tests/support/synthetic-fixtures.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
function fixture() {
  const f = baseFixture(); let sequence = 5000;
  const dependencies: SalesHttpOptions["dependencies"] = { unitOfWork: f.store, rules: SYNTHETIC_RULES,
    authorization: { async assertAllowed() {} }, now: () => "2026-10-21T12:00:00Z", newId: kind => sid(kind, sequence++) };
  return { ...f, dependencies };
}
const proposal = () => ({ businessType: "SALE", businessDate: "2026-10-21", note: null, hallId: ids.hall, warehouseId: ids.warehouse,
  customerId: ids.customer, salespersonId: null, orderDiscount: "0.00", lines: [{ skuId: ids.sku, quantity: "1", dealPrice: "1.25",
    pricingRule: "UNIT_PRICE", discountTenths: null, isGift: false, zeroConfirmed: false }], settlements: [] });
test("SYNTHETIC preparation HTTP is absent by default; explicit provider gets only strict proposal and trusted actor", async t => {
  const f = fixture(), app = Fastify(); t.after(() => app.close()); let calls = 0;
  app.register(createSalesHttpPlugin({ dependencies: f.dependencies, authenticate: async () => actor })); await app.ready();
  assert.equal((await app.inject({ method: "POST", url: "/sales/prepare-create", payload: proposal() })).statusCode, 404);
  const opted = Fastify(); t.after(() => opted.close()); opted.register(createSalesHttpPlugin({ dependencies: f.dependencies, authenticate: async () => actor,
    preparation: { async prepareCreate(actual, input) { calls++; assert.deepEqual(actual, actor); assert.deepEqual(input, proposal()); return syntheticDraft(); } } }));
  const response = await opted.inject({ method: "POST", url: "/sales/prepare-create", payload: proposal() });
  assert.equal(response.statusCode, 200); assert.equal(response.headers["cache-control"], "no-store"); assert.equal(response.json().lines[0].dealPrice, "125");
  for (const input of [{ ...proposal(), actor }, { ...proposal(), lines: [{ ...proposal().lines[0], snapshot: {} }] }, { ...proposal(), minimumPrice: null }])
    assert.equal((await opted.inject({ method: "POST", url: "/sales/prepare-create", payload: input })).statusCode, 400);
  assert.equal(calls, 1); assert.equal(f.store.snapshot().headers.size, 0);
});
test("SYNTHETIC new native fact failures are explicit 409; oversized response/preparation explicitly 413 and auth denies before provider", async t => {
  for (const code of ["NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "SALES_REFERENCE_UNAVAILABLE", "SALES_SNAPSHOT_MISMATCH", "BARCODE_UNAVAILABLE", "NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE"]) {
    const app = Fastify(); t.after(() => app.close()); app.register(createSalesHttpPlugin({ dependencies: fixture().dependencies, authenticate: async () => actor,
      preparation: { async prepareCreate() { throw new DomainError(code, "PRIVATE PROVIDER DETAIL"); } } }));
    const response = await app.inject({ method: "POST", url: "/sales/prepare-create", payload: proposal() }); assert.equal(response.statusCode, 409); assert.equal(response.json().error.code, code); assert.ok(!response.body.includes("PRIVATE"));
  }
  const app = Fastify(); t.after(() => app.close()); let signedIn = true, calls = 0;
  app.register(createSalesHttpPlugin({ dependencies: fixture().dependencies, authenticate: async () => signedIn ? actor : null,
    preparation: { async prepareCreate() { calls++; const draft = syntheticDraft(); return { ...draft, header: { ...draft.header, note: "字".repeat(SALES_COMMAND_MAX_REQUEST_BYTES) } }; } } }));
  assert.equal((await app.inject({ method: "POST", url: "/sales/prepare-create", payload: proposal() })).statusCode, 413);
  assert.equal((await app.inject({ method: "POST", url: "/sales/prepare-create", payload: { ...proposal(), note: "x".repeat(SALES_PREPARE_MAX_REQUEST_BYTES) } })).statusCode, 413);
  signedIn = false; assert.equal((await app.inject({ method: "POST", url: "/sales/prepare-create", payload: proposal() })).statusCode, 401); assert.equal(calls, 1);
});
test("SYNTHETIC proposal parser rejects nonliteral booleans, extra snapshot fields, omitted null intent and >3 settlement rows", () => {
  for (const input of [{ ...proposal(), lines: [{ ...proposal().lines[0], zeroConfirmed: "true" }] },
    { ...proposal(), lines: [{ ...proposal().lines[0], discountTenths: undefined }] },
    { ...proposal(), settlements: Array.from({ length: 4 }, () => ({ paymentAccountId: ids.payment, paymentMethodId: sid("paymentMethod", 50), direction: "RECEIVE", amount: "0.00" })) }])
    assert.throws(() => parseSalesCreateProposal(input));
});
