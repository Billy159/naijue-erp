/** Synthetic native-fact seam only: no PostgreSQL, SKU creation or cross-group admission claim. */
import assert from "node:assert/strict";
import test from "node:test";
import { createNativeSalesPreparation, createNativeSalesExistingPreparation, createNativeManualSalesBusinessRules } from "../packages/application/src/native-sales-preparation.ts";
import type { NativeSalesCreateProposal, NativeSalesExistingProposal } from "../packages/application/src/native-sales-preparation.ts";
import { createNativeTransferPreparation, createNativeTransferExistingPreparation, createNativeManualTransferReferences } from "../packages/application/src/native-transfer-preparation.ts";
import { createSalesService } from "../packages/application/src/sales-service.ts";
import { createSalesActionAuthorization } from "../packages/application/src/sales-authorization.ts";
import { createTransferService } from "../packages/application/src/transfer-service.ts";
import type { SalesDependencies } from "../packages/application/src/ports.ts";
import type { TransferDependencies } from "../packages/application/src/transfer-ports.ts";
import type { SalesDocument, SkuSnapshot } from "../packages/domain/src/documents.ts";
import type { EntityId } from "../packages/domain/src/values.ts";
import { minorAmount, version } from "../packages/domain/src/values.ts";
import { requireDomain } from "../packages/domain/src/errors.ts";
import { SyntheticStore } from "./support/synthetic-store.ts";
import { actor, ids, sid, snapshot, syntheticSalesIdentity } from "./support/synthetic-fixtures.ts";
import { fixture as transferFixture, actor as transferActor, ids as transferIds } from "./support/synthetic-transfer.ts";

// Known native facts are seeded independently of request lines. Unknown UUIDs never acquire a fact.
const small = sid("sku", 31001), unsized = sid("sku", 31002), missing = sid("sku", 31999);
function catalogue(original: EntityId<"sku">): ReadonlyMap<EntityId<"sku">, SkuSnapshot> {
  return new Map([
    [original, { ...snapshot, sizeName: "SYNTHETIC 170/M", barcode: "0031000000" }],
    [small, { ...snapshot, sizeName: "SYNTHETIC 160/S", barcode: "0031000001" }],
    [unsized, { ...snapshot, sizeName: "SYNTHETIC 无尺码", barcode: "0031000002" }]
  ]);
}
function selected(facts: ReadonlyMap<EntityId<"sku">, SkuSnapshot>, wanted: readonly EntityId<"sku">[]) {
  return new Map([...new Set(wanted)].map(id => {
    const actual = facts.get(id); requireDomain(actual, "SKU_UNAVAILABLE", "Synthetic selected SKU is absent");
    return [id, { ...actual }] as const;
  }));
}

test("native size editing: sales full proposal appends known 160/S and unsized SKUs, preserving signed economics and old observations", async () => {
  const store = new SyntheticStore(); store.seedIdentity(syntheticSalesIdentity());
  const facts = catalogue(ids.sku), productId = sid("product", 31003); let next = 32000;
  const dependencies: SalesDependencies = {
    authorization: createSalesActionAuthorization(), rules: createNativeManualSalesBusinessRules(),
    now: () => "2026-10-23T12:00:00.000000Z", newId: kind => sid(kind, next++),
    unitOfWork: { transaction(work) { return store.transaction(original => {
      let loaded: SalesDocument | undefined;
      return work({ ...original,
        async getSales(id) { const row = await original.getSales(id); loaded = row?.document; return row; },
        async getCurrentSalesSnapshots(wanted) { return selected(facts, wanted); },
        async getCurrentSalesReferenceFacts(draft) {
          return { salesId: draft.header.id, hall: { id: ids.hall, enabled: true },
            warehouse: { id: ids.warehouse, hallId: ids.hall, enabled: true }, customer: { id: ids.customer, enabled: true },
            salesperson: null, paymentAccounts: [],
            skus: [...facts].map(([id, value]) => ({ id, productId, enabled: true, snapshot: value })),
            products: [{ id: productId, enabled: true, referencePrice: minorAmount("125"), minimumPrice: null }],
            barcodes: [...facts].map(([skuId, value]) => ({ raw: value.barcode!, skuId, enabled: true })),
            retainedLines: (loaded?.lines ?? []).filter(row => row.isCurrent).map(row => ({ id: row.id, skuId: row.skuId, snapshot: row.snapshot })) };
        }
      });
    }); } }
  };
  const line = (skuId: string, quantity: string) => ({ skuId, quantity, dealPrice: "1.25", pricingRule: "UNIT_PRICE" as const,
    discountTenths: null, isGift: false, zeroConfirmed: false });
  const initial: NativeSalesCreateProposal = { businessType: "EXCHANGE", businessDate: "2026-10-23", note: null,
    hallId: ids.hall, customerId: ids.customer, salespersonId: null, warehouseId: ids.warehouse, orderDiscount: "0.00",
    lines: [line(ids.sku, "1")], settlements: [] };
  const first = await createNativeSalesPreparation(dependencies).prepareCreate(actor, initial);
  const service = createSalesService(dependencies);
  await service.execute({ actor, action: "SAVE", expectedVersion: null, requestKey: "size-sales-initial", draft: first });
  const before = store.snapshot();
  const proposal: NativeSalesExistingProposal = { ...initial, salesId: first.header.id, expectedVersion: 1, settlements: [],
    lines: [{ ...line(ids.sku, "1"), existingLineId: first.lines[0]!.id },
      { ...line(small, "2"), existingLineId: null }, { ...line(unsized, "-1"), existingLineId: null }] };
  const preparation = createNativeSalesExistingPreparation(dependencies);
  await assert.rejects(preparation.prepareExisting(actor, { ...proposal, lines: [{ ...proposal.lines[1]!, skuId: missing }] }), { code: "SKU_UNAVAILABLE" });
  assert.deepEqual(store.snapshot(), before);
  const prepared = await preparation.prepareExisting(actor, proposal);
  assert.deepEqual(store.snapshot(), before);
  assert.deepEqual(prepared.draft.lines.map(row => row.skuId), [ids.sku, small, unsized]);
  assert.deepEqual(prepared.draft.lines.map(row => row.quantity), [1n, 2n, -1n]);
  assert.deepEqual(prepared.draft.lines.map(row => row.lineAmount), [125n, 250n, -125n]);
  assert.equal(prepared.draft.header.netDue, 250n);
  assert.equal(prepared.draft.lines[0]!.id, first.lines[0]!.id);
  assert.deepEqual(prepared.draft.lines[0]!.snapshot, first.lines[0]!.snapshot);
  assert.equal(prepared.draft.lines[1]!.snapshot.sizeName, "SYNTHETIC 160/S");
  assert.equal(prepared.draft.lines[2]!.snapshot.sizeName, "SYNTHETIC 无尺码");
  const command = { actor, action: "SAVE" as const, expectedVersion: version(prepared.expectedVersion), requestKey: "size-sales-edit", draft: prepared.draft };
  const saved = await service.execute(command); assert.equal(saved.version, 2);
  const once = store.snapshot(); assert.deepEqual(await service.execute(command), saved); assert.deepEqual(store.snapshot(), once);
  assert.equal(once.headers.get(first.header.id)!.version, 2); assert.equal(once.receipts.size, 2); assert.equal(once.audit.length, 2);
  assert.equal(once.lines.size, 3); assert.deepEqual(once.balances, before.balances); assert.deepEqual(once.ledger, before.ledger);
});

test("native size editing: transfer full proposal replaces the original SKU with known 160/S and unsized SKUs and retains old history", async () => {
  const f = transferFixture(), facts = catalogue(transferIds.sku);
  for (const id of [small, unsized]) f.store.seedSku({ id, enabled: true });
  const dependencies: TransferDependencies = { ...f.dependencies, references: createNativeManualTransferReferences(),
    unitOfWork: { transaction(work) { return f.store.transaction(tx => work({ ...tx,
      async getCurrentTransferSnapshots(wanted) { return selected(facts, wanted); }
    })); } } };
  const initial = { businessDate: "2026-10-23", note: null, fromWarehouseId: transferIds.fromWarehouse,
    toWarehouseId: transferIds.toWarehouse, lines: [{ skuId: transferIds.sku, quantity: "1" }] };
  const first = await createNativeTransferPreparation(dependencies).prepareCreate(transferActor, initial);
  const service = createTransferService(dependencies);
  await service.execute({ actor: transferActor, action: "SAVE", expectedVersion: null, requestKey: "size-transfer-initial", draft: first });
  const before = f.store.snapshot();
  const proposal = { ...initial, transferId: first.header.id, expectedVersion: 1,
    lines: [{ existingLineId: first.lines[0]!.id, skuId: small, quantity: "2" }, { existingLineId: null, skuId: unsized, quantity: "3" }] };
  const preparation = createNativeTransferExistingPreparation(dependencies);
  await assert.rejects(preparation.prepareExisting(transferActor, { ...proposal, lines: [{ ...proposal.lines[0]!, skuId: missing }] }), { code: "SKU_UNAVAILABLE" });
  assert.deepEqual(f.store.snapshot(), before);
  const prepared = await preparation.prepareExisting(transferActor, proposal);
  assert.deepEqual(f.store.snapshot(), before);
  assert.deepEqual(prepared.draft.lines.map(row => row.skuId), [small, unsized]);
  assert.deepEqual(prepared.draft.lines.map(row => row.quantity), [2n, 3n]);
  assert.ok(prepared.draft.lines.every(row => row.id !== first.lines[0]!.id));
  assert.equal(prepared.draft.lines[0]!.snapshot.sizeName, "SYNTHETIC 160/S");
  assert.equal(prepared.draft.lines[1]!.snapshot.sizeName, "SYNTHETIC 无尺码");
  const command = { actor: transferActor, action: "SAVE" as const, expectedVersion: version(prepared.expectedVersion), requestKey: "size-transfer-edit", draft: prepared.draft };
  const saved = await service.execute(command); assert.equal(saved.version, 2);
  const once = f.store.snapshot(); assert.deepEqual(await service.execute(command), saved); assert.deepEqual(f.store.snapshot(), once);
  const document = once.transfers.get(first.header.id)!.document;
  const retained = document.lines.find(row => row.id === first.lines[0]!.id)!;
  assert.equal(retained.isCurrent, false); assert.equal(retained.skuId, transferIds.sku); assert.deepEqual(retained.snapshot, first.lines[0]!.snapshot);
  assert.equal(document.lines.filter(row => row.isCurrent).length, 2); assert.equal(once.receipts.size, 2); assert.equal(once.audit.length, 2);
  assert.deepEqual(once.balances, before.balances); assert.deepEqual(once.ledger, before.ledger);
});
