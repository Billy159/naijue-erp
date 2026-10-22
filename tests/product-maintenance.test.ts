/** Synthetic aggregate rules, not real-engine/schema/host evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { createProductMaintenanceService } from "../packages/application/src/product-maintenance-service.ts";
import type { ProductAggregate, ProductAuditObject, ProductBarcodeInput, ProductMaintenanceDependencies, ProductMaintenanceEvidence, ProductMaintenanceTransaction, ProductSkuInput, ProductWriteValues } from "../packages/application/src/product-maintenance-ports.ts";
import { CATALOGUE_PRICE_KEYS } from "../packages/application/src/catalogue-price-input.ts";
import { requireDomain } from "../packages/domain/src/errors.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const gid = (n: number) => sid("product", n);
function values(): ProductWriteValues {
  return { productCode: "ORIGINAL_00001", name: "SYNTHETIC PRODUCT", categoryId: gid(801), supplierId: gid(802), seasonId: gid(803), sizeGroupId: gid(804),
    year: 2026, systemItemCode: "0000123", thickness: null, collarPantsType: null, defaultBarcodeSchemeId: gid(805), enabled: true,
    prices: Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key => [key, key === "retail_price" ? "0.00" : null])) as ProductWriteValues["prices"] };
}
function sku(colorId = gid(806)): ProductSkuInput { return { id: null, expectedVersion: null, skuCode: `SKU-${colorId}`, colorId, fitId: gid(807), sizeId: gid(808), enabled: true }; }
function barcode(item: ProductSkuInput, raw = "000012345 "): ProductBarcodeInput { return { id: null, barcode: raw, colorId: item.colorId, fitId: item.fitId, sizeId: item.sizeId, kind: "MAIN", schemeId: gid(805), enabled: true }; }
function command(key = "create") { const s = sku(); return { action: "CREATE" as const, requestKey: key, values: values(), skus: [s], barcodes: [barcode(s)] }; }
function fixture(prepareMode: "ready" | "missing" | "fail" = "ready") {
  let sequence = 900, product: ProductAggregate | undefined, allow = true, failComplete = false, references = true, deletable = true;
  const receipts = new Map<string, NonNullable<Awaited<ReturnType<ProductMaintenanceEvidence["getReceipt"]>>>>();
  const audit: { before: ProductAuditObject | null; after: ProductAuditObject }[] = []; let writes = 0;
  const dependencies: ProductMaintenanceDependencies = { now: () => "2026-10-22T06:00:00.000Z", newId: kind => sid(kind, sequence++), unitOfWork: {
    async transaction(work) {
      let prepared: Parameters<ProductMaintenanceEvidence["complete"]>[0] | undefined;
      const before = structuredClone(product), receiptBefore = structuredClone(receipts), auditLength = audit.length, writeCount = writes;
      const evidence: ProductMaintenanceEvidence = {
        async assertAllowed() { requireDomain(allow, "FORBIDDEN", "SYNTHETIC DENIAL"); },
        async getReceipt(_actor, key) { return receipts.get(key); },
        ...(prepareMode === "missing" ? {} : { async prepare(c: Parameters<ProductMaintenanceEvidence["complete"]>[0]) { if (prepareMode === "fail") throw Error("SYNTHETIC PREPARE FAILURE"); assert.equal(prepared, undefined); prepared = structuredClone(c); } }),
        async complete(c) { assert.deepEqual(c, prepared);
          if (failComplete) throw Error("SYNTHETIC RECEIPT FAULT");
          const result = { operationId: c.operationId, kind: c.kind, targetId: c.targetId, version: c.newVersion };
          audit.push({ before: c.beforeValues, after: c.afterValues }); receipts.set(c.requestKey, { requestHash: c.requestHash, action: c.action, result, completedAt: c.completedAt }); return result;
        }
      };
      const tx: ProductMaintenanceTransaction = { evidence,
        async load(id) { return product?.product.id === id ? structuredClone(product) : undefined; },
        async readReferences(p) { return { categoryPath: [{ id: p.categoryId, name: "SYNTHETIC CATEGORY" }], sizeGroup: { id: p.sizeGroupId, name: "SYNTHETIC GROUP" },
          supplier: p.supplierId === null ? null : { id: p.supplierId, name: "SYNTHETIC SUPPLIER", enabled: true }, season: p.seasonId === null ? null : { id: p.seasonId, name: "SYNTHETIC SEASON" },
          defaultBarcodeScheme: p.defaultBarcodeSchemeId === null ? null : { id: p.defaultBarcodeSchemeId, name: "SYNTHETIC SCHEME", ruleVersion: "1", status: "CURRENT" } }; },
        async readCandidates(q) { return { ...q, total: 0, items: [] }; },
        async validateReferences() { requireDomain(references, "PRODUCT_SIZE_GROUP_MISMATCH", "SYNTHETIC MISMATCH"); },
        async assertCanDelete() { requireDomain(deletable, "PRODUCT_DELETE_NOT_READY", "SYNTHETIC UNKNOWN STOCK"); },
        async putProduct(next, previous) { assert.ok(prepared, "audit must precede business mutation"); requireDomain(!previous || product?.product.version === previous.version, "VERSION_CONFLICT", "fixture CAS"); writes++; product = { product: structuredClone(next), skus: product?.skus ?? [], barcodes: product?.barcodes ?? [] }; },
        async putSku(next) { writes++; if (!product) throw Error("Missing root"); product = { ...product, skus: [...product.skus.filter(s => s.id !== next.id), structuredClone(next)] }; },
        async putBarcode(next) { writes++; if (!product) throw Error("Missing root"); product = { ...product, barcodes: [...product.barcodes.filter(b => b.id !== next.id), structuredClone(next)] }; }
      };
      try { return await work(tx); } catch (error) { product = before; receipts.clear(); for (const [k, v] of receiptBefore) receipts.set(k, v); audit.length = auditLength; writes = writeCount; throw error; }
    }
  } };
  return { service: createProductMaintenanceService(dependencies), state: () => structuredClone(product), receipts, audit, writes: () => writes,
    revoke: () => { allow = false; }, fault: (value: boolean) => { failComplete = value; }, badReferences: () => { references = false; }, unknownStock: () => { deletable = false; } };
}
test("prepared product: root and SKU/barcode writes require prepared exact evidence; missing/failing capability writes nothing", async () => {
  for (const mode of ["missing", "fail"] as const) { const f = fixture(mode); await assert.rejects(f.service.execute(actor, command()), mode === "missing" ? { code: "MAINTENANCE_PREPARE_NOT_READY" } : /SYNTHETIC PREPARE FAILURE/); assert.equal(f.writes(), 0); assert.equal(f.state(), undefined); assert.equal(f.receipts.size, 0); }
  const f = fixture(), c = command(), saved = await f.service.execute(actor, c); assert.deepEqual(await f.service.execute(actor, c), saved); assert.equal(f.audit.length, 1); assert.equal(f.writes(), 3);
});
test("product write: exact nine-price/actual SKU/raw barcode save, creation proof and original-key replay", async () => {
  const f = fixture(), c = command(), other = sku(gid(809)); c.skus.push(other); c.barcodes.push(barcode(other, "00009999"));
  const saved = await f.service.execute(actor, c), state = f.state()!;
  assert.equal(saved.version, 1); assert.equal(state.skus.length, 2); assert.equal(state.barcodes.length, 2);
  assert.equal(state.product.prices.purchase_price, null); assert.equal(state.product.prices.retail_price, "0.00");
  assert.equal(state.barcodes[0]!.barcode, "000012345 "); assert.ok(state.skus.every(s => s.createdOperationId === saved.operationId));
  const afterSkus = f.audit[0]!.after.skus as readonly ProductAuditObject[];
  assert.ok(afterSkus.every(s => s.product_id === saved.targetId && s.created_operation_id === saved.operationId));
  const writes = f.writes(); assert.deepEqual(await f.service.execute(actor, c), saved); assert.equal(f.writes(), writes); assert.equal(f.receipts.size, 1);
  assert.deepEqual((await f.service.receipt(actor, c.requestKey)).result, saved);
});
test("product write: root edit/sparse audit and default-scheme changes never rewrite existing barcode provenance", async () => {
  const f = fixture(), saved = await f.service.execute(actor, command()), prior = f.state()!;
  const nextValues = { ...values(), name: "EDITED", defaultBarcodeSchemeId: gid(811), prices: { ...values().prices, retail_price: null } };
  const edited = await f.service.execute(actor, { action: "EDIT", requestKey: "edit", id: saved.targetId, expectedVersion: 1,
    values: nextValues, skus: [], barcodes: [] });
  assert.equal(edited.version, 2); assert.equal(f.state()!.product.prices.retail_price, null);
  assert.deepEqual(f.state()!.barcodes, prior.barcodes); assert.deepEqual(f.state()!.skus, prior.skus);
  assert.equal(f.audit[1]!.before!.retail_price, "0.00"); assert.equal(f.audit[1]!.after.retail_price, null);
  assert.equal(f.audit[1]!.after.default_barcode_scheme_id, gid(811)); assert.ok(!Object.hasOwn(f.audit[1]!.after, "barcodes"));
  await assert.rejects(f.service.execute(actor, { action: "EDIT", requestKey: "no-change", id: saved.targetId, expectedVersion: 2,
    values: nextValues, skus: [], barcodes: [] }), { code: "NO_PRODUCT_CHANGE" });
});
test("product write: invalid explicit price/identity inputs fail before persistence", async () => {
  for (const c of [
    { ...command(), actor }, { ...command(), values: { ...values(), prices: { retail_price: "0.00" } } },
    { ...command(), values: { ...values(), defaultBarcodeSchemeId: null } }, { ...command(), skus: [] },
    { ...command(), skus: [sku(), sku()] }, { ...command(), values: { ...values(), prices: { ...values().prices, retail_price: "0.001" } } }
  ]) { const f = fixture(); await assert.rejects(f.service.execute(actor, c)); assert.equal(f.state(), undefined); assert.equal(f.receipts.size, 0); }
});
test("product write: CAS, original-code/coordinate/binding conflicts and current denial preserve native facts", async () => {
  const f = fixture(), c = command(), saved = await f.service.execute(actor, c), prior = f.state()!;
  const base = { action: "EDIT", requestKey: "edit", id: saved.targetId, expectedVersion: 1, values: values(), skus: [], barcodes: [] };
  await assert.rejects(f.service.execute(actor, { ...base, expectedVersion: 2 }), { code: "VERSION_CONFLICT" });
  await assert.rejects(f.service.execute(actor, { ...base, values: { ...values(), productCode: "CHANGED" } }), { code: "IMMUTABLE_PRODUCT_CODE" });
  await assert.rejects(f.service.execute(actor, { ...base, skus: [{ ...sku(), id: prior.skus[0]!.id, expectedVersion: 1, sizeId: gid(999) }] }), { code: "IMMUTABLE_SKU_IDENTITY" });
  await assert.rejects(f.service.execute(actor, { ...base, barcodes: [{ ...barcode(sku(), "CHANGED"), id: prior.barcodes[0]!.id }] }), { code: "IMMUTABLE_BARCODE_IDENTITY" });
  await assert.rejects(f.service.execute(actor, { ...c, values: { ...values(), name: "DIFFERENT" } }), { code: "IDEMPOTENCY_CONFLICT" });
  assert.deepEqual(f.state(), prior); f.revoke();
  await assert.rejects(f.service.execute(actor, c), { code: "FORBIDDEN" }); await assert.rejects(f.service.receipt(actor, c.requestKey), { code: "FORBIDDEN" });
});
test("product write: reference/receipt faults roll back root plus all children; unknown stock cannot authorize delete", async () => {
  const f = fixture(); f.fault(true); await assert.rejects(f.service.execute(actor, command())); assert.equal(f.state(), undefined); assert.equal(f.receipts.size, 0);
  f.fault(false); const saved = await f.service.execute(actor, command()), prior = f.state()!; f.unknownStock();
  await assert.rejects(f.service.execute(actor, { action: "DELETE", requestKey: "delete", id: saved.targetId, expectedVersion: 1 }), { code: "PRODUCT_DELETE_NOT_READY" }); assert.deepEqual(f.state(), prior);
  const g = fixture(); g.badReferences(); await assert.rejects(g.service.execute(actor, command()), { code: "PRODUCT_SIZE_GROUP_MISMATCH" }); assert.equal(g.writes(), 0);
});
