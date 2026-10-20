/** Synthetic facts/identities only. Candidate-source formulas, not Demo runtime or real PG evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { createCandidateSalesBusinessRules } from "../packages/application/src/sales-business-rules.ts";
import type { ProductSalesPricingFacts, SalesRuleFactResolver } from "../packages/application/src/sales-business-rules.ts";
import type { SalesBusinessType, SalesDraft, SalesLineRow } from "../packages/domain/src/documents.ts";
import { requireDomain } from "../packages/domain/src/errors.ts";
import { allocateSalesDiscount } from "../packages/domain/src/sales-money.ts";
import { minorAmount, multiplyMoney, quantity, version } from "../packages/domain/src/values.ts";
import { actor, fixture, ids, sid, snapshot, syntheticDraft } from "./support/synthetic-fixtures.ts";
const money = (value: number | string | bigint) => minorAmount(String(value));
const productId = sid("product", 900);
function facts(overrides: Partial<SalesRuleFactResolver> = {}): SalesRuleFactResolver {
  return {
    sku(id) { return [ids.sku, ids.sku2].includes(id) ? { id, productId, enabled: true } : undefined; },
    productPricing(id) { return id === productId ? { id, enabled: true, referencePrice: money(200), minimumPrice: null } : undefined; },
    assertDocumentReferences(document) {
      requireDomain(document.header.hallId === ids.hall && document.header.warehouseId === ids.warehouse
        && document.header.customerId === ids.customer && document.settlements.every(row => row.paymentAccountId === ids.payment),
      "SYNTHETIC_REFERENCE", "Only explicit synthetic header/account identities exist");
    }, ...overrides
  };
}
function line(index: number, q: string, price: number, changes: Partial<SalesLineRow> = {}): SalesLineRow {
  return { id: sid("salesLine", 100 + index), salesId: ids.sales, lineNo: index + 1, skuId: index % 2 === 0 ? ids.sku : ids.sku2,
    quantity: quantity(q), referencePrice: money(200), dealPrice: money(price), pricingRule: "UNIT_PRICE", discountTenths: null, zeroConfirmed: false,
    lineAmount: multiplyMoney(money(price), quantity(q)), allocatedDiscount: money(0), isGift: false, snapshot, isCurrent: true, ...changes };
}
function draft(businessType: SalesBusinessType, input: readonly SalesLineRow[], discount = 0): SalesDraft {
  const gross = money(input.reduce((sum, row) => sum + row.lineAmount, 0n));
  const shares = businessType === "SALE" ? allocateSalesDiscount(input.map(row => row.lineAmount), money(discount)) : input.map(() => money(0));
  const due = gross - BigInt(discount);
  return { ...syntheticDraft(businessType), header: { ...syntheticDraft(businessType).header, businessType, grossAmount: gross, orderDiscount: money(discount), netDue: money(due) },
    lines: input.map((row, index) => ({ ...row, allocatedDiscount: shares[index]! })),
    settlements: due === 0n ? [] : [{ id: sid("settlement", 500), salesId: ids.sales, lineNo: 1, paymentAccountId: ids.payment, direction: due < 0n ? "REFUND" : "RECEIVE", amount: money(due < 0n ? -due : due) }] };
}
const rules = () => createCandidateSalesBusinessRules(facts());
const check = (value: SalesDraft) => rules().assertDraftChange(undefined, value);
const save = (value: SalesDraft, requestKey = "save") => ({ action: "SAVE" as const, actor, requestKey, expectedVersion: null, draft: value });
const approve = () => ({ action: "APPROVE" as const, actor, requestKey: "approve", salesId: ids.sales, expectedVersion: version(1) });

test("candidate adapter / synthetic: unit-first discount rounding and gross survive save/approve with negative inventory", async () => {
  const f = fixture({ rules: rules() });
  const value = draft("SALE", [line(0, "3", 13, { referencePrice: money(25), pricingRule: "DISCOUNT", discountTenths: 50 })]);
  await f.service.execute(save(value)); assert.equal(f.balance(), 0n);
  await f.service.execute(approve()); assert.equal(f.balance(), -3n);
  assert.equal(f.document().header.netDue, 39n);
  assert.equal(f.document().lines[0]?.pricingRule, "DISCOUNT");
  assert.equal(f.document().lines[0]?.discountTenths, 50);
});
test("candidate adapter / synthetic: SALE positive; RETURN and EXCHANGE share independent signed-row acceptance", () => {
  assert.throws(() => check(draft("RETURN", [line(0, "0", 100)])), { code: "INVALID_SALES_QUANTITY" });
  const negativeSale = { ...draft("RETURN", [line(0, "-1", 100)]), header: { ...draft("RETURN", [line(0, "-1", 100)]).header, businessType: "SALE" as const } };
  assert.throws(() => check(negativeSale), { code: "INVALID_SALES_QUANTITY" });
  for (const type of ["RETURN", "EXCHANGE"] as const) for (const q of ["-2", "2"]) {
    const value = draft(type, [line(0, q, 100)]);
    assert.doesNotThrow(() => check(value));
    const document = { ...value, header: { ...value.header, ...fixtureDocumentHeader() } };
    assert.equal(rules().inventoryDelta(document, value.lines[0]!), -BigInt(q));
  }
});
function fixtureDocumentHeader() { return { status: "DRAFT" as const, version: version(1), createdByAccountId: actor.accountId, createdHallId: actor.hallId,
  createdAt: "2026-10-20T12:00:00Z", updatedAt: "2026-10-20T12:00:00Z", approvedByAccountId: null, approvedAt: null }; }

test("candidate adapter / synthetic: direct deal prices may differ within one product and preserve old reference snapshots", () => {
  let lookups = 0;
  const policy = createCandidateSalesBusinessRules(facts({ productPricing(id) { lookups++; return { id, enabled: true, referencePrice: money(999), minimumPrice: money(10) }; } }));
  const value = draft("SALE", [line(0, "1", 100, { referencePrice: money(200) }), line(1, "1", 150, { referencePrice: money(300) })]);
  assert.doesNotThrow(() => policy.assertDraftChange(undefined, value));
  assert.equal(lookups, 1, "Each product supplies one uniform catalogue-price fact, never SKU overrides");
});
test("candidate adapter / synthetic: missing trusted catalog/reference providers and unknown facts fail closed", () => {
  assert.throws(() => createCandidateSalesBusinessRules({} as SalesRuleFactResolver), { code: "MISSING_SALES_FACT_PROVIDER" });
  const value = draft("SALE", [line(0, "1", 100)]);
  for (const resolver of [facts({ sku: () => undefined }), facts({ sku: id => ({ id, productId, enabled: false }) })]) {
    assert.throws(() => createCandidateSalesBusinessRules(resolver).assertDraftChange(undefined, value), { code: "SKU_UNAVAILABLE" });
  }
  for (const product of [undefined, { id: productId, enabled: false, referencePrice: money(100), minimumPrice: null },
    { id: productId, enabled: true, referencePrice: money(100) }, { id: productId, enabled: true, minimumPrice: null },
    { id: productId, enabled: true, referencePrice: null, minimumPrice: money(-1) }]) {
    const policy = createCandidateSalesBusinessRules(facts({ productPricing: () => product as ProductSalesPricingFacts | undefined }));
    assert.throws(() => policy.assertDraftChange(undefined, value), { code: "PRODUCT_PRICING_UNAVAILABLE" });
  }
  const missingAccount = { ...value, settlements: value.settlements.map(row => ({ ...row, paymentAccountId: sid("paymentAccount", 999) })) };
  assert.throws(() => check(missingAccount), { code: "SYNTHETIC_REFERENCE" });
});
test("candidate adapter / synthetic: ordinary zero requires confirmation and still respects positive minimum", () => {
  const zero = draft("SALE", [line(0, "1", 0)]);
  assert.throws(() => check(zero), { code: "ZERO_PRICE_NOT_CONFIRMED" });
  const confirmed = { ...zero, lines: zero.lines.map(row => ({ ...row, zeroConfirmed: true })) };
  assert.doesNotThrow(() => check(confirmed));
  const minimum = createCandidateSalesBusinessRules(facts({ productPricing: id => ({ id, enabled: true, referencePrice: money(200), minimumPrice: money(1) }) }));
  assert.throws(() => minimum.assertDraftChange(undefined, confirmed), { code: "BELOW_MINIMUM_PRICE" });
  assert.doesNotThrow(() => minimum.assertDraftChange(undefined, { ...zero, lines: zero.lines.map(row => ({ ...row, isGift: true })) }));
  assert.throws(() => check(draft("SALE", [line(0, "1", 1, { isGift: true })])), { code: "INVALID_GIFT_PRICE" });
});
test("candidate adapter / synthetic: explicit pricing metadata is not inferred from ratios or old zero prices", () => {
  for (const changes of [{ pricingRule: null }, { zeroConfirmed: null }]) {
    assert.throws(() => check(draft("SALE", [line(0, "1", 100, changes)])), { code: "UNKNOWN_PRICING_FACTS" });
  }
  assert.throws(() => check(draft("SALE", [line(0, "1", 100, { discountTenths: 50 })])), { code: "INVALID_LINE_DISCOUNT" });
  for (const changes of [{ referencePrice: null }, { dealPrice: money(99) }]) {
    assert.throws(() => check(draft("SALE", [line(0, "1", 100, { pricingRule: "DISCOUNT", discountTenths: 50, ...changes })])), { code: "DISCOUNT_PRICE_MISMATCH" });
  }
  // Actual candidate exempts gifts from discount-price equality, not from gift-zero rules.
  assert.doesNotThrow(() => check(draft("SALE", [line(0, "1", 0, { pricingRule: "DISCOUNT", discountTenths: 50, referencePrice: null, isGift: true })])));
});
test("candidate adapter / synthetic: exact gross, allocated shares and header totals reject forged economics", () => {
  const value = draft("SALE", [line(0, "1", 100), line(1, "1", 100), line(2, "1", 100)], 2);
  assert.deepEqual(value.lines.map(row => row.allocatedDiscount), [1n, 1n, 0n]);
  check(value);
  assert.throws(() => check({ ...value, lines: value.lines.map((row, index) => index === 0 ? { ...row, lineAmount: money(99) } : row) }), { code: "LINE_AMOUNT_MISMATCH" });
  assert.throws(() => check({ ...value, lines: value.lines.map((row, index) => ({ ...row, allocatedDiscount: money(index === 2 ? 1 : 0) })) }), { code: "DISCOUNT_ALLOCATION_MISMATCH" });
  assert.throws(() => check({ ...value, header: { ...value.header, grossAmount: money(301) } }), { code: "DOCUMENT_AMOUNT_MISMATCH" });
  assert.throws(() => check({ ...value, header: { ...value.header, netDue: money(297) } }), { code: "DOCUMENT_AMOUNT_MISMATCH" });
  assert.throws(() => check({ ...value, lines: [...value.lines].reverse() }), { code: "INVALID_ALLOCATION_ORDER" });
});
test("candidate adapter / synthetic: independent return and exchange prohibit whole discounts", () => {
  for (const type of ["RETURN", "EXCHANGE"] as const) {
    const value = draft(type, [line(0, "-1", 100), line(1, "2", 60)]);
    assert.doesNotThrow(() => check(value));
    assert.throws(() => check({ ...value, header: { ...value.header, orderDiscount: money(1) } }), { code: "INDEPENDENT_RETURN_DISCOUNT" });
  }
});
test("candidate adapter / synthetic: fully discounted sale plus gift posts inventory with zero due and no settlement rows", async () => {
  const f = fixture({ rules: rules() });
  const value = draft("SALE", [line(0, "1", 100), line(1, "1", 200), line(2, "2", 0, { isGift: true })], 300);
  await f.service.execute(save(value)); await f.service.execute(approve());
  assert.equal(f.document().header.netDue, 0n); assert.equal(f.document().settlements.length, 0);
  assert.deepEqual(f.document().lines.map(row => row.allocatedDiscount), [100n, 200n, 0n]);
  assert.equal(f.balance(ids.sku), -3n); assert.equal(f.balance(ids.sku2), -1n);
});
test("candidate adapter / synthetic: zero-net exchange, no original sale and no settlement required", async () => {
  const f = fixture({ rules: rules() });
  await f.service.execute(save(draft("EXCHANGE", [line(0, "-1", 50), line(1, "1", 50)])));
  await f.service.execute(approve());
  assert.equal(f.balance(ids.sku), 1n); assert.equal(f.balance(ids.sku2), -1n);
});
test("candidate adapter / synthetic: mixed receive/refund uses signed net, not sum of absolutes", async () => {
  const f = fixture({ rules: rules() }); const value = draft("SALE", [line(0, "1", 50)]);
  const mixed = { ...value, settlements: [{ ...value.settlements[0]!, amount: money(60) }, { ...value.settlements[0]!, id: sid("settlement", 501), lineNo: 2, direction: "REFUND" as const, amount: money(10) }] };
  await f.service.execute(save(mixed)); await f.service.execute(approve()); assert.equal(f.balance(), -1n);
});
test("candidate adapter / synthetic: unbalanced saved refund is allowed but approval needs exact equality", async () => {
  const f = fixture({ rules: rules() }); const value = draft("RETURN", [line(0, "-2", 40), line(1, "1", 30)]);
  const mismatch = { ...value, settlements: value.settlements.map(row => ({ ...row, amount: money(49) })) };
  await f.service.execute(save(mismatch));
  await assert.rejects(() => f.service.execute(approve()), { code: "SETTLEMENT_MISMATCH" });
  assert.equal(f.balance(), 0n); assert.equal(f.document().header.status, "DRAFT");
});
test("candidate adapter / synthetic: absolute zero RECEIVE or REFUND adapts to signed zero with valid references", async () => {
  for (const direction of ["RECEIVE", "REFUND"] as const) {
    const f = fixture({ rules: rules() }); const value = draft("SALE", [line(0, "1", 0, { isGift: true })]);
    await f.service.execute(save({ ...value, settlements: [{ id: sid("settlement", 500), salesId: ids.sales, lineNo: 1, paymentAccountId: ids.payment, direction, amount: money(0) }] }));
    await f.service.execute(approve()); assert.equal(f.balance(), -1n);
  }
});
test("candidate adapter / synthetic: approved rows stay read-only; unapprove/edit/reapprove retains pricing audit evidence", async () => {
  const f = fixture({ rules: rules() }); const initial = draft("SALE", [line(0, "1", 100)]);
  await f.service.execute(save(initial)); await f.service.execute(approve());
  const changed = draft("SALE", [line(0, "1", 50, { pricingRule: "DISCOUNT", discountTenths: 25, zeroConfirmed: true })]);
  await assert.rejects(() => f.service.execute({ ...save(changed, "bad-edit"), expectedVersion: version(2) }), { code: "INVALID_STATE" });
  await f.service.execute({ action: "UNAPPROVE", actor, requestKey: "unapprove", salesId: ids.sales, expectedVersion: version(2) });
  await f.service.execute({ ...save(changed, "edit"), expectedVersion: version(3) });
  await f.service.execute({ ...approve(), requestKey: "reapprove", expectedVersion: version(4) });
  assert.equal(f.balance(), -1n);
  const edit = f.store.snapshot().audit.find(row => row.action === "SAVE" && row.before !== null)!;
  assert.equal(edit.before?.lines[0]?.pricingRule, "UNIT_PRICE"); assert.equal(edit.after.lines[0]?.pricingRule, "DISCOUNT");
  assert.equal(edit.after.lines[0]?.discountTenths, 25); assert.equal(edit.after.lines[0]?.zeroConfirmed, true);
});
test("candidate adapter / synthetic: zero confirmation and entered discount are part of original-key identity", async () => {
  for (const change of [{ zeroConfirmed: true }, { pricingRule: "DISCOUNT" as const, discountTenths: 50 }]) {
    const f = fixture({ rules: rules() }); const value = draft("SALE", [line(0, "1", 100)]);
    await f.service.execute(save(value));
    await assert.rejects(() => f.service.execute(save({ ...value, lines: value.lines.map(row => ({ ...row, ...change })) })), { code: "IDEMPOTENCY_CONFLICT" });
  }
});


test("candidate adapter / synthetic: retained inactive unknown pricing is provenance, not active economics", () => {
  const value = draft("SALE", [line(0, "1", 100)]);
  const retained = line(1, "-1", 0, { skuId: sid("sku", 999), pricingRule: null, discountTenths: null, zeroConfirmed: null, isCurrent: false });
  const policy = createCandidateSalesBusinessRules(facts({ assertDocumentReferences(document) {
    assert.ok(document.lines.every(row => row.isCurrent));
    assert.equal(document.lines.length, 1);
  } }));
  const document = { ...value, header: { ...value.header, ...fixtureDocumentHeader() }, lines: [retained, ...value.lines] };
  assert.doesNotThrow(() => policy.assertReferencesAndEconomics(document));
});
