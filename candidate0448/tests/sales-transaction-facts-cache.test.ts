/** SYNTHETIC original UOW/locked-reference protocol; no PG or timing claims. */
import assert from "node:assert/strict";
import test from "node:test";
import type { SalesTransaction } from "../packages/application/src/ports.ts";
import type { SalesDocument, SalesDraft } from "../packages/domain/src/documents.ts";
import { createNativeTransactionSalesBusinessRules } from "../packages/application/src/sales-native-facts.ts";
import { minorAmount, quantity, version } from "../packages/domain/src/values.ts";
import { actor, ids, sid } from "./support/synthetic-fixtures.ts";
import { cacheDraft, h06, salesFactsFixture } from "./support/sales-facts-cache-fixture.ts";
const ready = async (tx: SalesTransaction) => { await tx.getReceipt(ids.account, "SYNTHETIC-cache"); await tx.getSales(ids.sales); };
const resolve = (tx: SalesTransaction, selections = [{ skuId: h06.sku }]) => tx.resolveDocumentSkus!({
  scope: { kind: "SALES", documentId: ids.sales, operationId: sid("operation", 20000), actor, completedAt: "2026-10-29T00:00:00Z" }, selections, newId: kind => sid(kind, 20001)
});

test("cache: economics and labels are checked every call; identity runs before hits; immutable facts and independent Maps", async () => {
  const f = salesFactsFixture();
  await f.original.transaction(async tx => {
    await ready(tx);
    let identities = 0;
    const identity = tx.getCurrentSalesIdentity!.bind(tx);
    tx.getCurrentSalesIdentity = async id => { identities++; return identity(id); };
    const d = cacheDraft(), rules = createNativeTransactionSalesBusinessRules();
    await rules.assertDraftChange(undefined, { ...d, header: { ...d.header, salespersonId: sid("staff", 16) } }, tx);
    const first = await tx.getCurrentSalesReferenceFacts!(d);
    for (const change of [
      { ...d, header: { ...d.header, note: "changed" } },
      { ...d, lines: d.lines.map(l => ({ ...l, quantity: quantity("3") })) },
      { ...d, lines: d.lines.map(l => ({ ...l, dealPrice: minorAmount("90") })) },
      { ...d, header: { ...d.header, orderDiscount: minorAmount("1") } }
    ]) assert.equal(await tx.getCurrentSalesReferenceFacts!(change), first);
    // The previous staff-bearing draft was a distinct reference key.
    assert.equal(f.count("native-sales-facts:schema"), 2);
    const staffed = { ...d, header: { ...d.header, salespersonId: sid("staff", 16) } };
    await rules.assertDraftChange(undefined, staffed, tx);
    const before = f.count("native-sales-facts:schema");
    await assert.rejects(async () => rules.assertDraftChange(undefined, { ...staffed, lines: staffed.lines.map(l => ({ ...l, quantity: quantity("0") })) }, tx), { code: "INVALID_SALES_QUANTITY" });
    await assert.rejects(async () => rules.assertDraftChange(undefined, { ...staffed, lines: staffed.lines.map(l => ({ ...l, snapshot: { ...l.snapshot, productName: "FORGED" } })) }, tx), { code: "SALES_SNAPSHOT_MISMATCH" });
    await assert.rejects(async () => rules.assertDraftChange(undefined, { ...staffed, lines: staffed.lines.map(l => ({ ...l, pricingRule: "DISCOUNT", discountTenths: 50 })) }, tx), { code: "DISCOUNT_PRICE_MISMATCH" });
    assert.equal(f.count("native-sales-facts:schema"), before);
    assert.ok(Object.isFrozen(first) && Object.isFrozen(first.skus) && Object.isFrozen(first.skus[0]!.snapshot));
    const one = await tx.getCurrentSalesSnapshots!([h06.sku, h06.sku]);
    (one as Map<unknown, unknown>).clear();
    const two = await tx.getCurrentSalesSnapshots!([h06.sku]);
    assert.equal(two.size, 1); assert.ok(Object.isFrozen(two.get(h06.sku))); assert.notEqual(one, two);
    assert.equal(f.count("native-transfer-snapshots:schema"), 1);
    assert.equal(identities, 12);
    tx.getCurrentSalesIdentity = async () => { throw Object.assign(Error("SYNTHETIC revoked"), { code: "FORBIDDEN" }); };
    await assert.rejects(() => tx.getCurrentSalesReferenceFacts!(staffed), { code: "FORBIDDEN" });
    await assert.rejects(() => tx.getCurrentSalesSnapshots!([h06.sku]), { code: "FORBIDDEN" });
  });
});

test("cache: every reference, observation, row membership and supplied version changes the exact key", async () => {
  const f = salesFactsFixture(), d = cacheDraft();
  const changes: SalesDraft[] = [
    ...([['hallId', 'hall'], ['warehouseId', 'warehouse'], ['customerId', 'customer'], ['salespersonId', 'staff']] as const)
      .map(([key, kind], i) => ({ ...d, header: { ...d.header, [key]: sid(kind, 21000 + i) } })),
    { ...d, lines: d.lines.map(l => ({ ...l, skuId: sid("sku", 21010) })) },
    { ...d, lines: d.lines.map(l => ({ ...l, snapshot: { ...l.snapshot, barcode: "SYNTHETIC-OTHER" } })) },
    { ...d, lines: d.lines.map(l => ({ ...l, id: sid("salesLine", 21011) })) },
    { ...d, settlements: d.settlements.map(r => ({ ...r, paymentAccountId: sid("paymentAccount", 21012) })) },
    { ...d, settlements: d.settlements.map(r => ({ ...r, paymentMethodId: sid("paymentMethod", 21013) })) },
    { ...d, header: { ...d.header, version: 2 } } as SalesDraft,
    { ...d, lines: [...d.lines.map(l => ({ ...l, isCurrent: false })), ...d.lines.map(l => ({ ...l, id: sid("salesLine", 21014) }))] }
  ];
  await f.original.transaction(async tx => {
    await ready(tx); await tx.getCurrentSalesReferenceFacts!(d);
    for (const changed of changes) {
      const before = f.count("native-sales-facts:schema");
      await tx.getCurrentSalesReferenceFacts!(changed);
      assert.equal(f.count("native-sales-facts:schema"), before + 1);
    }
    for (const invalid of [
      { ...d, lines: d.lines.map(l => ({ ...l, salesId: sid("sales", 99) })) },
      { ...d, lines: [...d.lines, ...d.lines] },
      { ...d, lines: [] },
      { ...d, lines: d.lines.map(l => ({ ...l, skuId: "invalid" })) },
      { ...d, settlements: d.settlements.map(r => ({ ...r, salesId: sid("sales", 99) })) },
      { ...d, settlements: Array(4).fill(d.settlements[0]) }
    ]) {
      const before = f.calls.length;
      await assert.rejects(() => tx.getCurrentSalesReferenceFacts!(invalid as SalesDraft));
      assert.equal(f.calls.length, before);
    }
    const snapshotBefore = f.count("native-transfer-snapshots:schema");
    await tx.getCurrentSalesSnapshots!([h06.sku]);
    await tx.getCurrentSalesSnapshots!([h06.sku, ids.sku2]);
    await tx.getCurrentSalesSnapshots!([ids.sku2, h06.sku, h06.sku]);
    assert.equal(f.count("native-transfer-snapshots:schema"), snapshotBefore + 2);
    await assert.rejects(() => tx.getCurrentSalesSnapshots!([]), { code: "INVALID_LINES" });
    await assert.rejects(() => tx.getCurrentSalesSnapshots!(["invalid" as never]), { code: "INVALID_ID" });
    await assert.rejects(() => tx.getCurrentSalesSnapshots!(Array.from({ length: 201 }, (_, i) => sid("sku", 23000 + i))), { code: "INVALID_LINES" });
    await assert.rejects(() => tx.getReceipt(sid("account", 99), "other"), { code: "TRANSACTION_SCOPE" });
    await assert.rejects(() => tx.getSales(sid("sales", 99)), { code: "TRANSACTION_SCOPE" });
    await assert.rejects(() => tx.getCurrentSalesReferenceFacts!({ ...d, header: { ...d.header, id: sid("sales", 99) } }), { code: "TRANSACTION_SCOPE" });
  });
});

test("cache: failures are retried; successful and failed specification resolutions invalidate both entries", async () => {
  const f = salesFactsFixture(), d = cacheDraft();
  await f.original.transaction(async tx => {
    await ready(tx);
    f.fail("native-sales-facts:product"); await assert.rejects(() => tx.getCurrentSalesReferenceFacts!(d), /SYNTHETIC read failed/);
    await tx.getCurrentSalesReferenceFacts!(d); assert.equal(f.count("native-sales-facts:schema"), 2);
    f.fail("native-transfer-snapshots:main"); await assert.rejects(() => tx.getCurrentSalesSnapshots!([h06.sku]), /SYNTHETIC read failed/);
    await tx.getCurrentSalesSnapshots!([h06.sku]); assert.equal(f.count("native-transfer-snapshots:schema"), 2);
    await resolve(tx);
    await tx.getCurrentSalesReferenceFacts!(d); await tx.getCurrentSalesSnapshots!([h06.sku]);
    assert.equal(f.count("native-sales-facts:schema"), 3); assert.equal(f.count("native-transfer-snapshots:schema"), 3);
    await assert.rejects(() => resolve(tx, [{ skuId: "invalid" as never }]));
    await tx.getCurrentSalesReferenceFacts!(d); await tx.getCurrentSalesSnapshots!([h06.sku]);
    assert.equal(f.count("native-sales-facts:schema"), 4); assert.equal(f.count("native-transfer-snapshots:schema"), 4);
  });
});

test("cache: close rejects hits and in-flight publication; transactions and clients never share entries", async () => {
  const f = salesFactsFixture(), d = cacheDraft(); let escaped: SalesTransaction | undefined;
  for (let i = 0; i < 2; i++) await f.original.transaction(async tx => {
    await ready(tx); escaped = tx; await tx.getCurrentSalesReferenceFacts!(d); await tx.getCurrentSalesSnapshots!([h06.sku]);
  });
  assert.equal(f.count("native-sales-facts:schema"), 2); assert.equal(f.count("native-transfer-snapshots:schema"), 2);
  const before = f.calls.length;
  await assert.rejects(() => escaped!.getCurrentSalesReferenceFacts!(d), { code: "TRANSACTION_SCOPE" });
  await assert.rejects(() => escaped!.getCurrentSalesSnapshots!([h06.sku]), { code: "TRANSACTION_SCOPE" });
  assert.equal(f.calls.length, before);
  const other = salesFactsFixture();
  await other.original.transaction(async tx => { await ready(tx); await tx.getCurrentSalesReferenceFacts!(d); });
  assert.equal(other.count("native-sales-facts:schema"), 1);
  let release!: () => void, pending!: Promise<unknown>;
  f.pause("native-transfer-snapshots:targets", new Promise<void>(r => { release = r; }));
  await f.original.transaction(async tx => {
    await ready(tx); pending = tx.getCurrentSalesSnapshots!([h06.sku]);
    // Consume expected rejection immediately; the callback completes before the held read.
    void pending.catch(() => {});
    await new Promise<void>(r => setImmediate(r));
  });
  release(); await assert.rejects(() => pending, { code: "TRANSACTION_CLOSED" });
});


test("cache: loaded retained snapshots cannot be replaced through caller aliases or another document version", async () => {
  const f = salesFactsFixture(), d = cacheDraft();
  const historical = (v: number, label: string): SalesDocument => ({ ...d, header: { ...d.header, version: version(v), status: "DRAFT", responsibleStaffId: null,
    createdByAccountId: ids.account, createdHallId: ids.hall, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z", approvedByAccountId: null, approvedAt: null },
    lines: d.lines.map(l => ({ ...l, snapshot: { ...l.snapshot, productName: label } })) });
  let oldFacts: unknown;
  f.seedHistorical(historical(1, "SYNTHETIC original observation"));
  await f.original.transaction(async tx => {
    await tx.getReceipt(ids.account, "SYNTHETIC-v1"); const loaded = await tx.getSales(ids.sales);
    const first = await tx.getCurrentSalesReferenceFacts!(d); oldFacts = first;
    assert.equal(first.retainedLines[0]!.snapshot.productName, "SYNTHETIC original observation");
    Object.assign(loaded!.document.lines[0]!.snapshot, { productName: "FORGED caller alias" });
    assert.equal(await tx.getCurrentSalesReferenceFacts!(d), first);
    assert.equal(first.retainedLines[0]!.snapshot.productName, "SYNTHETIC original observation");
  });
  f.seedHistorical(historical(2, "SYNTHETIC later observation"));
  await f.original.transaction(async tx => {
    await tx.getReceipt(ids.account, "SYNTHETIC-v2"); await tx.getSales(ids.sales);
    const later = await tx.getCurrentSalesReferenceFacts!(d);
    assert.notEqual(later, oldFacts); assert.equal(later.retainedLines[0]!.snapshot.productName, "SYNTHETIC later observation");
  });
  assert.equal(f.count("native-sales-facts:schema"), 2);
});

test("cache: a specification generation change rejects an in-flight facts read before publication", async () => {
  const f = salesFactsFixture(), d = cacheDraft();
  let release!: () => void;
  f.pause("native-sales-facts:product", new Promise<void>(r => { release = r; }));
  await f.original.transaction(async tx => {
    await ready(tx); const pending = tx.getCurrentSalesReferenceFacts!(d); void pending.catch(() => {});
    await new Promise<void>(r => setImmediate(r));
    await resolve(tx); f.unpause(); release();
    await assert.rejects(() => pending, { code: "TRANSACTION_SCOPE" });
    await tx.getCurrentSalesReferenceFacts!(d); await tx.getCurrentSalesReferenceFacts!(d);
    assert.equal(f.count("native-sales-facts:schema"), 2);
  });
});
