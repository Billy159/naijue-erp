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
import { minorAmount } from "../packages/domain/src/values.ts";
import { actor, ids, sid, snapshot } from "./support/synthetic-fixtures.ts";
import { SyntheticStore } from "./support/synthetic-store.ts";
const product = sid("product", 100), method = sid("paymentMethod", 101);
const proposal = (): NativeSalesCreateProposal => ({ businessType: "SALE", businessDate: "2026-10-21", note: null,
  hallId: ids.hall, warehouseId: ids.warehouse, customerId: ids.customer, salespersonId: null, orderDiscount: "0.00",
  lines: [{ skuId: ids.sku, quantity: "2", dealPrice: "1.25", pricingRule: "UNIT_PRICE", discountTenths: null, isGift: false, zeroConfirmed: false }],
  settlements: [{ paymentAccountId: ids.payment, paymentMethodId: method, direction: "RECEIVE", amount: "2.50" }] });
function setup() {
  const store = new SyntheticStore(); let sequence = 1000, allowed = true, complete = true, minimum = null as ReturnType<typeof minorAmount> | null;
  let label = snapshot.productName, lookups = 0;
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
          products: [{ id: product, enabled: true, referencePrice: minorAmount("125"), minimumPrice: minimum }],
          paymentAccounts: [{ id: ids.payment, methodId: method, enabled: true, methodEnabled: true }],
          barcodes: draft.lines.map(row => ({ raw: "000123", skuId: row.skuId, enabled: true })), retainedLines: [] };
      }
    })); } } };
  return { store, dependencies, prepare: createNativeSalesPreparation(dependencies), revoke: () => { allowed = false; },
    unprove: () => { complete = false; }, minimum: (value: string) => { minimum = minorAmount(value); },
    label: (value: string) => { label = value; }, lookups: () => lookups };
}
test("SYNTHETIC native SALES prepare is read-only; existing SAVE persists native draft and receipt exactly once", async () => {
  const h = setup(), before = h.store.snapshot(); const draft = await h.prepare.prepareCreate(actor, proposal());
  assert.deepEqual(h.store.snapshot(), before); assert.equal(draft.header.grossAmount, 250n); assert.equal(draft.lines[0]!.referencePrice, 125n);
  assert.equal(draft.lines[0]!.snapshot.barcode, "000123"); assert.match(draft.header.number, /^V2-XS-/);
  const command = { action: "SAVE" as const, actor, expectedVersion: null, requestKey: "native-save", draft };
  const service = createSalesService(h.dependencies); const result = await service.execute(command);
  assert.deepEqual(await service.execute(command), result); assert.equal(h.store.snapshot().headers.size, 1);
  assert.equal(h.store.snapshot().receipts.size, 1); assert.equal(h.store.snapshot().ledger.length, 0);
});
test("SYNTHETIC authorization precedes sensitive preparation facts; missing persisted proof fails closed", async () => {
  const h = setup(); h.revoke(); await assert.rejects(h.prepare.prepareCreate(actor, proposal()), { code: "FORBIDDEN" }); assert.equal(h.lookups(), 0);
  const missing = setup(); missing.unprove(); await assert.rejects(missing.prepare.prepareCreate(actor, proposal()), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" });
  assert.equal(missing.store.snapshot().headers.size, 0); assert.equal(missing.store.snapshot().receipts.size, 0);
});
test("SYNTHETIC revoked proof, scope, changed label and minimum between preparation/SAVE are revalidated with no writes", async () => {
  for (const change of [(h: ReturnType<typeof setup>) => h.revoke(), (h: ReturnType<typeof setup>) => h.unprove(),
    (h: ReturnType<typeof setup>) => h.minimum("126"), (h: ReturnType<typeof setup>) => h.label("SYNTHETIC renamed")]) {
    const h = setup(), draft = await h.prepare.prepareCreate(actor, proposal()), before = h.store.snapshot(); change(h);
    await assert.rejects(createSalesService(h.dependencies).execute({ action: "SAVE", actor, expectedVersion: null, requestKey: "stale", draft }));
    assert.deepEqual(h.store.snapshot(), before);
  }
});
test("SYNTHETIC discount uses current product reference, exact half-up arithmetic and deterministic allocation", async () => {
  const h = setup(), input = proposal(); const draft = await h.prepare.prepareCreate(actor, { ...input, orderDiscount: "0.01",
    lines: [{ ...input.lines[0]!, dealPrice: null, pricingRule: "DISCOUNT", discountTenths: 50 }, { ...input.lines[0]!, quantity: "1" }] });
  assert.equal(draft.lines[0]!.dealPrice, 63n); assert.equal(draft.header.grossAmount, 251n); assert.equal(draft.header.netDue, 250n);
  assert.deepEqual(draft.lines.map(row => row.allocatedDiscount), [1n, 0n]);
});
test("SYNTHETIC 200 lines, Chinese native labels and 10k escaped note fit SAVE; oversized native label explicitly rejects", async () => {
  const h = setup(), input = proposal(); h.label("中文商品标签");
  const draft = await h.prepare.prepareCreate(actor, { ...input, note: "\u0001".repeat(10000), lines: Array.from({ length: 200 }, () => input.lines[0]!) });
  assert.equal(draft.lines.length, 200); assert.ok(salesPreparedDraftFitsSaveBudget(draft));
  h.label("很长".repeat(200000)); await assert.rejects(h.prepare.prepareCreate(actor, input), { code: "SALES_PAYLOAD_TOO_LARGE" });
  assert.equal(h.store.snapshot().headers.size, 0);
});
test("SYNTHETIC invalid signed SALE, ambiguous pricing, unconfirmed zero, wrong selected method reject", async () => {
  const input = proposal();
  for (const changed of [{ ...input, lines: [{ ...input.lines[0]!, quantity: "-1" }] },
    { ...input, lines: [{ ...input.lines[0]!, discountTenths: 50 }] },
    { ...input, lines: [{ ...input.lines[0]!, dealPrice: "0.00" }] },
    { ...input, settlements: [{ ...input.settlements[0]!, paymentMethodId: sid("paymentMethod", 999) }] }]) {
    const h = setup(); await assert.rejects(h.prepare.prepareCreate(actor, changed)); assert.equal(h.store.snapshot().headers.size, 0);
  }
});
test("SYNTHETIC manual SAVE cannot replace prepared MAIN with null or forge a new reference snapshot", async () => {
  for (const change of ["barcode", "reference"] as const) {
    const h = setup(), prepared = await h.prepare.prepareCreate(actor, proposal());
    const draft = { ...prepared, lines: prepared.lines.map(row => change === "barcode"
      ? { ...row, snapshot: { ...row.snapshot, barcode: null } } : { ...row, referencePrice: minorAmount("999") }) };
    await assert.rejects(createSalesService(h.dependencies).execute({ actor, action: "SAVE", expectedVersion: null, requestKey: "forged", draft }), { code: "SALES_SNAPSHOT_MISMATCH" });
    assert.equal(h.store.snapshot().headers.size, 0);
  }
});
test("SYNTHETIC preparation rejects calculated SQL monetary overflow rather than handing off an unsavable draft", async () => {
  const h = setup(), input = proposal();
  await assert.rejects(h.prepare.prepareCreate(actor, { ...input, lines: [{ ...input.lines[0]!, dealPrice: "9999999999999999.99", quantity: "2" }] }), { code: "MONEY_STORAGE_OVERFLOW" });
  assert.equal(h.store.snapshot().headers.size, 0);
});
