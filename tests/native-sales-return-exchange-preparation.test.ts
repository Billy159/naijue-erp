import Fastify from "fastify";
import { createSalesHttpPlugin, exactJson } from "../apps/api/src/sales-http.ts";
import { parseSalesCreateProposal } from "../apps/api/src/sales-preparation-input.ts";
/** SYNTHETIC only: no database execution or real catalogue publication. */
import assert from "node:assert/strict";
import test from "node:test";
import { createNativeSalesPreparation, createNativeManualSalesBusinessRules } from "../packages/application/src/native-sales-preparation.ts";
import type { NativeSalesCreateProposal } from "../packages/application/src/native-sales-preparation.ts";
import { createNativeTransactionSalesBusinessRules } from "../packages/application/src/sales-native-facts.ts";
import { salesPreparedDraftFitsSaveBudget } from "../packages/application/src/sales-payload-budget.ts";
import { createSalesService } from "../packages/application/src/sales-service.ts";
import type { SalesDependencies } from "../packages/application/src/ports.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { minorAmount, quantity, version } from "../packages/domain/src/values.ts";
import { actor, ids, sid, snapshot } from "./support/synthetic-fixtures.ts";
import { SyntheticStore } from "./support/synthetic-store.ts";
const product = sid("product", 100), method = sid("paymentMethod", 101);
const proposal = (): NativeSalesCreateProposal => ({ businessType: "SALE", businessDate: "2026-10-21", note: null,
  hallId: ids.hall, warehouseId: ids.warehouse, customerId: ids.customer, salespersonId: null, orderDiscount: "0.00",
  lines: [{ skuId: ids.sku, quantity: "2", dealPrice: "1.25", pricingRule: "UNIT_PRICE", discountTenths: null, isGift: false, zeroConfirmed: false }],
  settlements: [{ paymentAccountId: ids.payment, paymentMethodId: method, direction: "RECEIVE", amount: "2.50" }] });
function setup() {
  const store = new SyntheticStore(); let sequence = 1000, allowed = true, complete = true, minimum = null as ReturnType<typeof minorAmount> | null;
  let label = snapshot.productName, lookups = 0, priceAvailable = true;
  const dependencies: SalesDependencies = { now: () => "2026-10-21T12:00:00Z", newId: kind => sid(kind, sequence++),
    rules: createNativeManualSalesBusinessRules(), authorization: { async assertAllowed() {
      if (!allowed) throw new DomainError("FORBIDDEN", "SYNTHETIC denied");
    } }, unitOfWork: { transaction(work) { return store.transaction(tx => work({ ...tx,
      async getCurrentSalesSnapshots(skuIds) { lookups++; return new Map(skuIds.map(id => [id, { ...snapshot, productName: label, barcode: "000123" }])); },
      async getCurrentSalesReferenceFacts(draft) {
        lookups++; if (!complete) throw new DomainError("NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "SYNTHETIC missing proof");
        return { salesId: draft.header.id, hall: { id: ids.hall, enabled: true }, customer: { id: ids.customer, enabled: true },
          warehouse: { id: ids.warehouse, hallId: ids.hall, enabled: true }, salesperson: null,
          skus: [...new Set(draft.lines.map(row => row.skuId))].map(id => ({ id, productId: product, enabled: true, snapshot: { ...snapshot, productName: label } })),
          products: priceAvailable ? [{ id: product, enabled: true, referencePrice: minorAmount("125"), minimumPrice: minimum }] : [],
          paymentAccounts: [{ id: ids.payment, methodId: method, enabled: true, methodEnabled: true }],
          barcodes: draft.lines.map(row => ({ raw: "000123", skuId: row.skuId, enabled: true })), retainedLines: [] };
      }
    })); } } };
  return { store, dependencies, prepare: createNativeSalesPreparation(dependencies), revoke: () => { allowed = false; },
    unprove: () => { complete = false; }, minimum: (value: string) => { minimum = minorAmount(value); },
    removePrice: () => { priceAvailable = false; }, label: (value: string) => { label = value; }, lookups: () => lookups };
}
const independent = (businessType: "RETURN" | "EXCHANGE", counts = businessType === "RETURN" ? ["-2"] : ["-2", "3"]): NativeSalesCreateProposal => {
  const base = proposal(); return { ...base, businessType, settlements: [], lines: counts.map(count => ({ ...base.lines[0]!, quantity: count })) };
};
for (const businessType of ["RETURN", "EXCHANGE"] as const) {
  test(`SYNTHETIC ${businessType} prepare → SAVE → replay; unbalanced settlement is rejected only at APPROVE`, async () => {
    const h = setup(), before = h.store.snapshot(); const input = independent(businessType);
    const draft = await h.prepare.prepareCreate(actor, input); assert.deepEqual(h.store.snapshot(), before);
    const expected = businessType === "RETURN" ? -250n : 125n;
    assert.equal(draft.header.businessType, businessType); assert.equal(draft.header.grossAmount, expected); assert.equal(draft.header.netDue, expected);
    assert.equal(draft.header.orderDiscount, 0n); assert.ok(draft.lines.every(row => row.allocatedDiscount === 0n));
    assert.deepEqual(draft.lines.map(row => row.quantity.toString()), input.lines.map(row => row.quantity));
    const service = createSalesService(h.dependencies), command = { action: "SAVE" as const, actor, expectedVersion: null, requestKey: "signed-save", draft };
    const saved = await service.execute(command); assert.deepEqual(await service.execute(command), saved);
    await assert.rejects(service.execute({ actor, action: "APPROVE", salesId: draft.header.id, expectedVersion: version(1), requestKey: "unbalanced" }), { code: "SETTLEMENT_MISMATCH" });
    assert.equal(h.store.snapshot().receipts.size, 1); assert.equal(h.store.snapshot().ledger.length, 0);
    const native = createNativeTransactionSalesBusinessRules();
    for (const line of draft.lines) assert.equal(native.inventoryDelta({ ...draft, header: h.store.snapshot().headers.get(draft.header.id)! }, line), -line.quantity);
  });
  test(`SYNTHETIC ${businessType} signed semantics allow either nonzero sign, preserve line discount, forbid whole discount/zero/overflow`, async () => {
    const h = setup(); const draft = await h.prepare.prepareCreate(actor, { ...independent(businessType, ["1", "-1"]),
      lines: independent(businessType, ["1", "-1"]).lines.map(row => ({ ...row, dealPrice: null, pricingRule: "DISCOUNT", discountTenths: 50 })) });
    assert.deepEqual(draft.lines.map(row => row.lineAmount), [63n, -63n]); assert.equal(draft.header.netDue, 0n);
    for (const input of [ { ...independent(businessType), orderDiscount: "0.01" }, independent(businessType, ["0"]) ])
      await assert.rejects(setup().prepare.prepareCreate(actor, input));
    const overflow = independent(businessType, ["-2"]);
    await assert.rejects(setup().prepare.prepareCreate(actor, { ...overflow, lines: overflow.lines.map(row => ({ ...row, dealPrice: "9999999999999999.99" })) }), { code: "MONEY_STORAGE_OVERFLOW" });
  });
  test(`SYNTHETIC ${businessType} authorization, missing proof/price, snapshots and size budgets stay closed`, async () => {
    for (const [change, code] of [ [(h: ReturnType<typeof setup>) => h.revoke(), "FORBIDDEN"],
      [(h: ReturnType<typeof setup>) => h.unprove(), "NATIVE_CATALOGUE_FACTS_UNAVAILABLE"],
      [(h: ReturnType<typeof setup>) => h.removePrice(), "PRODUCT_PRICING_UNAVAILABLE"] ] as const) {
      const h = setup(); change(h); await assert.rejects(h.prepare.prepareCreate(actor, independent(businessType)), { code });
      assert.equal(h.store.snapshot().headers.size, 0); if (code === "FORBIDDEN") assert.equal(h.lookups(), 0);
    }
    const h = setup(); const input = independent(businessType, Array.from({ length: 200 }, (_, index) => index % 2 ? "1" : "-1"));
    const draft = await h.prepare.prepareCreate(actor, { ...input, note: "\u0001".repeat(10000) });
    assert.ok(salesPreparedDraftFitsSaveBudget(draft)); assert.equal(draft.lines.length, 200);
    h.label("很长".repeat(200000)); await assert.rejects(h.prepare.prepareCreate(actor, independent(businessType)), { code: "SALES_PAYLOAD_TOO_LARGE" });
  });
  test(`SYNTHETIC ${businessType} real native preparation through HTTP preserves signed DTO and reuses SAVE`, async t => {
    const h = setup(), app = Fastify(); t.after(() => app.close());
    app.register(createSalesHttpPlugin({ dependencies: h.dependencies, authenticate: async () => actor, preparation: h.prepare }));
    const response = await app.inject({ method: "POST", url: "/sales/prepare-create", payload: independent(businessType) });
    assert.equal(response.statusCode, 200); const draft = response.json(); assert.equal(draft.header.businessType, businessType);
    assert.equal(draft.lines[0].quantity, "-2"); assert.equal(draft.lines[0].allocatedDiscount, "0");
    const command = { action: "SAVE", requestKey: "signed-http", expectedVersion: null, draft };
    const post = () => app.inject({ method: "POST", url: "/sales/commands", headers: { "content-type": "application/json" }, payload: exactJson(command) });
    const saved = await post(); assert.equal(saved.statusCode, 200); assert.deepEqual((await post()).json(), saved.json());
    assert.throws(() => parseSalesCreateProposal({ ...independent(businessType), originalSalesId: ids.sales }));
    h.revoke(); assert.equal((await app.inject({ method: "POST", url: "/sales/prepare-create", payload: independent(businessType) })).statusCode, 403);
  });
}
test("SYNTHETIC negative RETURN approves with stock=-q and no original sales association", async () => {
  const h = setup(); h.store.seedBalance({ warehouseId: ids.warehouse, skuId: ids.sku, quantity: quantity("0"), version: version(1), lastOperationId: null, updatedAt: "2026-10-21T00:00:00Z" });
  const draft = await h.prepare.prepareCreate(actor, { ...independent("RETURN"), settlements: [{ ...proposal().settlements[0]!, direction: "REFUND" }] });
  const service = createSalesService(h.dependencies); await service.execute({ actor, action: "SAVE", requestKey: "return-save", expectedVersion: null, draft });
  await service.execute({ actor, action: "APPROVE", requestKey: "return-approve", expectedVersion: version(1), salesId: draft.header.id });
  assert.equal(h.store.snapshot().ledger.length, 1); assert.equal(h.store.snapshot().ledger[0]!.quantityDelta, 2n);
});
