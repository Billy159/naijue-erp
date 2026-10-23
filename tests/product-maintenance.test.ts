/** Synthetic aggregate rules, not real-engine/schema/host evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { appendProductSkusInTransaction, createProductMaintenanceService } from "../packages/application/src/product-maintenance-service.ts";
import type { ProductAggregate, ProductAuditObject, ProductBarcodeInput, ProductMaintenanceDependencies, ProductMaintenanceEvidence, ProductMaintenanceTransaction, ProductSkuInput, ProductWriteValues } from "../packages/application/src/product-maintenance-ports.ts";
import { CATALOGUE_PRICE_KEYS } from "../packages/application/src/catalogue-price-input.ts";
import { requireDomain } from "../packages/domain/src/errors.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
import type { ProductMaintenanceImageSnapshot } from "../packages/application/src/product-maintenance-ports.ts";
import type { ControlledProductMedia } from "../packages/application/src/product-query-ports.ts";
import { parseProductMaintenanceCommandV2, parseProductMaintenanceMediaCommandV2, orderProductImageWrites, planProductImageWrites } from "../packages/application/src/product-maintenance-validation.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";
import type { DocumentProductSkuAppendInput, ProductImageChange, ProductMaintenanceImageMetadata, ProductMaintenanceMediaCommandV2 } from "../packages/application/src/product-maintenance-ports.ts";
const gid = (n: number) => sid("product", n);
function imageService(snapshot: ProductMaintenanceImageSnapshot | null, media: ControlledProductMedia | null = null, denied = false, failed = false, missing = false) {
  let reads = 0; const unused = async (): Promise<never> => { throw Error("UNEXPECTED_WRITE_OR_DETAIL"); };
  const tx: ProductMaintenanceTransaction = { evidence: { async assertAllowed(_actor, kind, action) { assert.equal(kind, "PRODUCT"); assert.equal(action, "DETAIL"); requireDomain(!denied, "FORBIDDEN", "SYNTHETIC DENIED"); }, getReceipt: unused, complete: unused },
    ...(!missing ? { async readImageSnapshot() { reads++; if (failed) throw Error("PRIVATE_SQL"); return snapshot; } } : {}),
    load: unused, readReferences: unused, readCandidates: unused, validateReferences: unused, assertCanDelete: unused, putProduct: unused, putSku: unused, putBarcode: unused };
  return { service: createProductMaintenanceService({ unitOfWork: { async transaction(work) { return work(tx); } }, now: () => "UNUSED", newId: () => "UNUSED", media }), reads: () => reads };
}
const imageSnapshot = (): ProductMaintenanceImageSnapshot => ({ productId: gid(12001), version: 7, images: [{ id: gid(12002), productId: gid(12001), version: 3,
  fileRef: "PRIVATE_ORIGINAL_REF", role: null, colorId: null, mime: "image/png", byteSize: 68n, displayOrder: -3, createdAt: "2026-10-22T00:00:00.123456Z", createdByAccountId: null }] });
test("W15 richer images preserve actual root/image versions, unknown role/creator and only safe optional thumbnail links", async () => {
  const snapshot = imageSnapshot(), f = imageService(snapshot), input = { productId: snapshot.productId }, signal = new AbortController().signal;
  const result = await f.service.readImages(actor, input, signal); assert.equal(f.reads(), 1); assert.equal(result.version, 7); assert.equal(result.images[0]!.version, 3);
  assert.equal(result.images[0]!.role, null); assert.equal(result.images[0]!.createdByAccountId, null); assert.equal(result.images[0]!.displayOrder, -3);
  assert.equal(result.images[0]!.byteSize, "68"); assert.equal(result.images[0]!.thumbnailState, "UNAVAILABLE"); assert.equal(result.images[0]!.thumbnailUrl, null);
  assert.doesNotMatch(JSON.stringify(result), /fileRef|PRIVATE|productId.*productId/);
  let originalReads = 0, oldBatches = 0;
  const media: ControlledProductMedia = { deliveryOrigin: "https://synthetic.invalid", async resolveThumbnails() { oldBatches++; return []; }, async resolveOriginal() { originalReads++; throw Error("NOT_REQUESTED"); },
    async resolveAvailableThumbnails(read) { return [{ imageId: read.images[0]!.id, variant: "thumbnail", url: `https://synthetic.invalid/api/products/media/${snapshot.productId}/${snapshot.images[0]!.id}/${"a".repeat(64)}/thumbnail` }]; } };
  const ready = await imageService(snapshot, media).service.readImages(actor, input, signal); assert.equal(ready.images[0]!.thumbnailState, "READY"); assert.equal(originalReads, 0); assert.equal(oldBatches, 0);
});
test("W15 richer images distinguish real empty, unavailable snapshot, failure, forbidden and malformed metadata", async () => {
  const snapshot = imageSnapshot(), input = { productId: snapshot.productId }, signal = new AbortController().signal;
  assert.deepEqual(await imageService({ ...snapshot, images: [] }).service.readImages(actor, input, signal), { productId: snapshot.productId, version: 7, images: [] });
  await assert.rejects(imageService(null).service.readImages(actor, input, signal), { code: "PRODUCT_NOT_FOUND" });
  await assert.rejects(imageService(snapshot, null, false, true).service.readImages(actor, input, signal), /PRIVATE_SQL/);
  await assert.rejects(imageService(snapshot, null, false, false, true).service.readImages(actor, input, signal), { code: "PRODUCT_MEDIA_NOT_READY" });
  const denied = imageService(snapshot, null, true); await assert.rejects(denied.service.readImages(actor, input, signal), { code: "FORBIDDEN" }); assert.equal(denied.reads(), 0);
  for (const images of [[snapshot.images[0]!, snapshot.images[0]!], [{ ...snapshot.images[0]!, colorId: gid(1) }], [{ ...snapshot.images[0]!, byteSize: 0n }]])
    await assert.rejects(imageService({ ...snapshot, images }).service.readImages(actor, input, signal));
  await assert.rejects(imageService(snapshot).service.readImages(actor, { ...input, role: "ADMIN" }, signal), { code: "INVALID_PRODUCT_QUERY" });
});
function values(): ProductWriteValues {
  return { productCode: "ORIGINAL_00001", name: "SYNTHETIC PRODUCT", categoryId: gid(801), supplierId: gid(802), seasonId: gid(803), sizeGroupId: gid(804),
    year: 2026, systemItemCode: "0000123", thickness: null, collarPantsType: null, defaultBarcodeSchemeId: gid(805), enabled: true,
    prices: Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key => [key, key === "retail_price" ? "0.00" : null])) as ProductWriteValues["prices"] };
}
function sku(colorId = gid(806)): ProductSkuInput { return { id: null, expectedVersion: null, skuCode: `SKU-${colorId}`, colorId, fitId: gid(807), sizeId: gid(808), enabled: true }; }
function barcode(item: ProductSkuInput, raw = "000012345 "): ProductBarcodeInput { return { id: null, barcode: raw, colorId: item.colorId, fitId: item.fitId, sizeId: item.sizeId, kind: "MAIN", schemeId: gid(805), enabled: true }; }
function command(key = "create") { const s = sku(); return { action: "CREATE" as const, requestKey: key, values: values(), skus: [s], barcodes: [barcode(s)] }; }
function fixture(prepareMode: "ready" | "missing" | "fail" = "ready", seasonMode = false) {
  let sequence = 900, product: ProductAggregate | undefined, allow = true, failComplete = false, references = true, deletable = true;
  const receipts = new Map<string, NonNullable<Awaited<ReturnType<ProductMaintenanceEvidence["getReceipt"]>>>>();
  const audit: { before: ProductAuditObject | null; after: ProductAuditObject }[] = []; let writes = 0;
  const dependencies: ProductMaintenanceDependencies = { now: () => "2026-10-22T06:00:00.000Z", newId: kind => sid(kind, sequence++), unitOfWork: {
    ...(seasonMode ? { seasonContract: "product-season-array-v1" as const } : {}),
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
        async readReferences(p) { return { ...(Object.hasOwn(p, "seasonIds") ? { seasons: (p.seasonIds ?? []).map(id => ({ id, name: `SYNTHETIC ${id}` })) } : {}), categoryPath: [{ id: p.categoryId, name: "SYNTHETIC CATEGORY" }], sizeGroup: { id: p.sizeGroupId, name: "SYNTHETIC GROUP" },
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
  return { dependencies, service: createProductMaintenanceService(dependencies), state: () => structuredClone(product), receipts, audit, writes: () => writes,
    activate: () => Object.defineProperty(dependencies.unitOfWork, "seasonContract", { value: "product-season-array-v1" }), seed: (value: ProductAggregate) => { product = structuredClone(value); }, revoke: () => { allow = false; }, fault: (value: boolean) => { failComplete = value; }, badReferences: () => { references = false; }, unknownStock: () => { deletable = false; } };
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

function commandV2(key = "v2", seasons: readonly string[] | null = [gid(850), gid(803)]) {
  const { seasonId: _scalar, ...data } = values(); return { ...command(key), values: { ...data, seasonIds: seasons } };
}
function appendInput(): DocumentProductSkuAppendInput {
  const operationId = gid(42000), productId = gid(41000), skuId = gid(42001);
  return { actor, productId, expectedVersion: 7, operationId, requestKey: `doc-spec:${gid(41999)}:${productId}`,
    completedAt: "2026-10-23T14:00:00.000000Z", skus: [{ id: skuId, productId, skuCode: `NJNEW-${skuId.replaceAll("-", "")}`,
      colorId: gid(806), fitId: gid(807), sizeId: gid(810), enabled: true, version: 1, createdOperationId: operationId }] };
}
function appendFixture(mode: "ready" | "missing" | "fail" = "ready") {
  const f = fixture(mode, true), input = appendInput();
  const imported = { id: gid(41001), productId: input.productId, skuCode: "SOURCE-0000123 ", colorId: gid(806), fitId: gid(807), sizeId: gid(808), enabled: false, version: 3, createdOperationId: null };
  const prior: ProductAggregate = { product: { ...values(), id: input.productId, seasonIds: null, version: 7, deletedAt: null }, skus: [imported],
    barcodes: [{ id: gid(41002), barcode: "00001 retained ", skuId: imported.id, kind: "CONFIRMED_OLD", schemeId: null, enabled: false }] };
  f.seed(prior);
  return { ...f, input, prior, append: (value = input) => f.dependencies.unitOfWork.transaction(tx => appendProductSkusInTransaction(tx, value)) };
}
test("v11 group append: one PRODUCT EDIT preserves master/source identity, prepares exact SKU9 and replays original key", async () => {
  const f = appendFixture(), { result, addedSkus } = await f.append(), state = f.state()!;
  assert.deepEqual(state.product, { ...f.prior.product, version: 8 }); assert.deepEqual(state.skus[0], f.prior.skus[0]); assert.deepEqual(state.barcodes, f.prior.barcodes);
  assert.deepEqual(addedSkus, f.input.skus); assert.equal(result.operationId, f.input.operationId); assert.equal(result.version, 8);
  assert.deepEqual(f.audit[0]!.before, { version: 7, skus: [] });
  const after = f.audit[0]!.after; assert.deepEqual(Object.keys(after).sort(), ["skus", "version"]);
  assert.deepEqual(after.skus, [{ id: f.input.skus[0]!.id, product_id: f.input.productId, sku_code: f.input.skus[0]!.skuCode, color_id: gid(806), fit_id: gid(807), size_id: gid(810), enabled: true, version: 1, created_operation_id: f.input.operationId }]);
  assert.equal(f.receipts.get(f.input.requestKey)!.requestHash, requestHash({ kind: "DOCUMENT_SKU_APPEND_V1", actorAccountId: actor.accountId,
    productId: f.input.productId, expectedVersion: 7, skus: f.input.skus }));
  const writes = f.writes(); assert.deepEqual(await f.append(), { result, addedSkus }); assert.equal(f.writes(), writes); assert.equal(f.audit.length, 1);
  await assert.rejects(f.append({ ...f.input, skus: [{ ...f.input.skus[0]!, sizeId: gid(811) }] }), { code: "IDEMPOTENCY_CONFLICT" });
});
test("v11 group append: original CAS and identity conflicts reject without restoring or replacing an existing SKU", async () => {
  for (const change of [{ expectedVersion: 6 }, { skus: [{ ...appendInput().skus[0]!, sizeId: gid(808) }] }]) {
    const f = appendFixture(); await assert.rejects(f.append({ ...f.input, ...change })); assert.deepEqual(f.state(), f.prior); assert.equal(f.writes(), 0);
  }
  for (const change of [{ version: 2 }, { enabled: false }, { createdOperationId: gid(49999) }, { productId: gid(49998) }, { skuCode: "invented-legacy-code" }]) {
    const f = appendFixture(); await assert.rejects(f.append({ ...f.input, skus: [{ ...f.input.skus[0]!, ...change }] })); assert.equal(f.writes(), 0);
  }
  const f = appendFixture(); f.badReferences();
  await assert.rejects(f.append(), { code: "PRODUCT_SIZE_GROUP_MISMATCH" }); assert.equal(f.audit.length, 0); assert.equal(f.writes(), 0);
});
test("v11 group append: missing/failing evidence and enclosing SAVE failure retain no product or receipt mutations", async () => {
  for (const mode of ["missing", "fail"] as const) { const f = appendFixture(mode); await assert.rejects(f.append()); assert.deepEqual(f.state(), f.prior); assert.equal(f.writes(), 0); }
  const f = appendFixture();
  await assert.rejects(f.dependencies.unitOfWork.transaction(async tx => { await appendProductSkusInTransaction(tx, f.input); throw Error("SYNTHETIC_PARENT_SAVE_FAILED"); }), /PARENT_SAVE_FAILED/);
  assert.deepEqual(f.state(), f.prior); assert.equal(f.audit.length, 0); assert.equal(f.receipts.size, 0); assert.equal(f.writes(), 0);
  f.revoke(); await assert.rejects(f.append(), { code: "FORBIDDEN" });
  assert.equal(f.writes(), 0);
});
test("all-size seam: existing V2 EDIT appends an absent size, preserves imported SKU identity/NULL creation, and reopens with original versions", async () => {
  const f = fixture("ready", true), productId = gid(40000), oldSku = { id: gid(40001), productId, skuCode: "SOURCE-KEEP-0001", colorId: gid(806), fitId: gid(807), sizeId: gid(808), enabled: true, version: 3, createdOperationId: null };
  const oldBarcode = { id: gid(40002), barcode: "000001 SOURCE", skuId: oldSku.id, kind: "MAIN" as const, schemeId: gid(805), enabled: true };
  // Explicit synthetic pre-existing imported aggregate; no runtime mutation of a creation identity.
  f.seed({ product: { ...values(), id: productId, seasonIds: [], version: 7, deletedAt: null }, skus: [oldSku], barcodes: [oldBarcode] });
  const c = commandV2("unused", []), added = { ...sku(), skuCode: "SYNTHETIC-NEW-SIZE-170", sizeId: gid(810) };
  const edit = { action: "EDIT", requestKey: "all-size-append", id: productId, expectedVersion: 7, values: c.values, skus: [added], barcodes: [] };
  const saved = await f.service.executeV2(actor, edit), state = f.state()!;
  assert.equal(saved.version, 8); assert.deepEqual(state.skus.find(s => s.id === oldSku.id), oldSku); assert.deepEqual(state.barcodes, [oldBarcode]);
  const fresh = state.skus.find(s => s.sizeId === added.sizeId)!;
  assert.notEqual(fresh.id, oldSku.id); assert.equal(fresh.version, 1); assert.equal(fresh.createdOperationId, saved.operationId);
  assert.deepEqual(f.audit[0]!.before!.skus, []); assert.equal((f.audit[0]!.after.skus as unknown[]).length, 1); assert.ok(!Object.hasOwn(f.audit[0]!.after, "barcodes"));
  const reopened = await f.service.detailV2(actor, { productId });
  assert.equal(reopened.version, 8); assert.equal(reopened.skus.find(s => s.id === oldSku.id)!.expectedVersion, 3);
  assert.equal(reopened.skus.find(s => s.id === fresh.id)!.expectedVersion, 1);
  const snapshot = f.state(), writes = f.writes();
  await assert.rejects(f.service.executeV2(actor, { ...edit, requestKey: "stale-product", skus: [{ ...added, sizeId: gid(812), skuCode: "SYNTHETIC-NEXT-SIZE" }] }), { code: "VERSION_CONFLICT" });
  await assert.rejects(f.service.executeV2(actor, { ...edit, requestKey: "rebind-imported", expectedVersion: 8,
    skus: [{ ...added, id: oldSku.id, expectedVersion: 3 }] }), { code: "IMMUTABLE_SKU_IDENTITY" });
  assert.deepEqual(f.state(), snapshot); assert.equal(f.writes(), writes);
  assert.deepEqual(await f.service.executeV2(actor, edit), saved); assert.equal(f.writes(), writes);
});
function mediaFixture(options: { stage?: boolean; guard?: boolean; proof?: boolean; swap?: boolean; prepare?: "ready" | "missing" | "fail" } = {}) {
  const base = fixture(options.prepare ?? "ready", true), original = base.dependencies.unitOfWork;
  let images: readonly ProductMaintenanceImageMetadata[] = [], native = 18000, badStage = "", failImages = false;
  const events: string[] = [], consumed: string[] = [];
  const deps: ProductMaintenanceDependencies = { ...base.dependencies, newImageId: () => gid(native++),
    ...(options.stage === false ? {} : { imageStage: { profile: "PRIVATE_PRODUCT_MEDIA_STAGE_V1" as const, async consume(i) {
      consumed.push(i.uploadId); if (badStage === "failure") throw Error("SYNTHETIC_STAGE_FAULT");
      return { profile: "PRIVATE_PRODUCT_MEDIA_STAGE_V1" as const, uploadId: i.uploadId, actorAccountId: i.actor.accountId, productId: badStage === "scope" ? gid(1) : i.productId, commandKey: i.commandKey,
        fileRef: `staged-product-media:${i.uploadId}`, createdAt: "2026-10-22T05:00:00Z", expiresAt: badStage === "expired" ? "2026-10-22T05:01:00Z" : "2026-10-23T05:00:00Z",
        original: { mime: "image/png" as const, byteSize: 68n, sha256: "a".repeat(64) }, thumbnail: { mime: "image/webp" as const, byteSize: 60n, sha256: "b".repeat(64), derivedFromOriginalSha256: "a".repeat(64) } };
    } } }),
    unitOfWork: { seasonContract: "product-season-array-v1", async transaction(work) {
      const before = structuredClone(images);
      try { return await original.transaction(tx => work({ ...tx, evidence: { ...tx.evidence,
        ...(tx.evidence.prepare ? { async prepare(c) { events.push("prepare"); await tx.evidence.prepare!(c); } } : {}),
        async complete(c) { events.push("receipt"); return tx.evidence.complete(c); } },
        async assertImageWriteReady() { events.push("image-proof"); requireDomain(options.guard !== false, "PRODUCT_MEDIA_NOT_READY", "SYNTHETIC_MISSING_PROOF"); },
        async assertImagesPrepared(c) { assert.equal(c.kind, "PRODUCT"); assert.ok(events.includes("prepare")); requireDomain(options.proof !== false, "PRODUCT_MEDIA_NOT_READY", "SYNTHETIC_PRIVATE_PREPARED_PROOF_DENIED"); events.push("prepared-proof"); },
        async assertImageColorSwapReady() { assert.ok(events.includes("prepared-proof")); requireDomain(options.swap === true, "PRODUCT_MEDIA_NOT_READY", "SYNTHETIC_V4_GUARD_MISSING"); events.push("swap-proof"); },
        async loadImages() { events.push("image-lock"); return images; },
        async putProduct(n, p) { events.push("root"); return tx.putProduct(n, p); },
        async writeImages(b, a) { events.push("images"); if (failImages) throw Error("SYNTHETIC_IMAGE_FAULT"); const ids = new Set(b.map(i => i.id)); images = [...images.filter(i => !ids.has(i.id)), ...a]; }
      })); } catch (error) { images = before; throw error; }
    } }
  };
  return { ...base, service: createProductMaintenanceService(deps), events, consumed, images: () => structuredClone(images), seedImages: (i: readonly ProductMaintenanceImageMetadata[]) => { images = structuredClone(i); }, stageFault: (v: string) => { badStage = v; }, imageFault: () => { failImages = true; } };
}
const addImage = (role: "MAIN" | "COLOR" = "MAIN", uploadId = gid(17001)): ProductImageChange => ({ action: "ADD", uploadId, role, colorId: role === "COLOR" ? gid(806) : null, displayOrder: -2 });
function mediaCreate(key = "media-new", changes: readonly ProductImageChange[] = [addImage()]) { return { ...commandV2(key), imageChanges: changes }; }
function mediaEdit(id: string, version: number, changes: readonly ProductImageChange[], key = "media-edit"): ProductMaintenanceMediaCommandV2 {
  return { action: "EDIT", id, expectedVersion: version, requestKey: key, values: commandV2().values, skus: [], barcodes: [], imageChanges: changes };
}
test("W17 media parser preserves old V2 exact parse/hash and rejects malformed extension without implicit normalization", () => {
  const old = commandV2(), parsed = parseProductMaintenanceCommandV2(old), media = parseProductMaintenanceMediaCommandV2({ ...old, imageChanges: [] });
  assert.ok(!Object.hasOwn(parsed, "imageChanges")); assert.notEqual(requestHash(parsed), requestHash(media));
  assert.throws(() => parseProductMaintenanceCommandV2(media), { code: "INVALID_PRODUCT_MAINTENANCE" });
  for (const imageChanges of [[{ ...addImage(), role: null }], [{ ...addImage(), colorId: gid(2) }], [{ ...addImage(), fileRef: "PRIVATE" }], [{ action: "REMOVE", id: gid(1), expectedVersion: 1 }, { action: "REMOVE", id: gid(1), expectedVersion: 1 }]])
    assert.throws(() => parseProductMaintenanceMediaCommandV2({ ...old, imageChanges }), { code: "INVALID_PRODUCT_MEDIA_COMMAND" });
});
test("W17 legacy V2 receipt survives missing media capability; adding empty imageChanges under its original key conflicts", async () => {
  const f = mediaFixture({ stage: false, guard: false }), old = commandV2("original-old-key"), saved = await f.service.executeV2(actor, old), hash = f.receipts.get(old.requestKey)!.requestHash;
  assert.deepEqual(await f.service.executeV2(actor, old), saved); assert.equal(f.receipts.get(old.requestKey)!.requestHash, hash); assert.equal(f.consumed.length, 0);
  await assert.rejects(f.service.executeV2(actor, { ...old, imageChanges: [] }), { code: "IDEMPOTENCY_CONFLICT" });
  await assert.rejects(f.service.executeV2(actor, { ...old, requestKey: "new-explicit-media-key", imageChanges: [] }), { code: "PRODUCT_MEDIA_NOT_READY" });
});
test("W17 image create prepares complete actual row facts before one root CAS and receipt; original replay consumes no stage twice", async () => {
  const f = mediaFixture(), c = mediaCreate(), saved = await f.service.executeV2(actor, c), image = f.images()[0]!;
  assert.notEqual(image.id, (c.imageChanges[0] as { uploadId: string }).uploadId); assert.equal(image.version, 1); assert.equal(image.createdByAccountId, actor.accountId);
  assert.ok(f.events.indexOf("prepare") < f.events.indexOf("root") && f.events.indexOf("root") < f.events.indexOf("images") && f.events.indexOf("images") < f.events.indexOf("receipt"));
  assert.ok(f.events.indexOf("prepare") < f.events.indexOf("prepared-proof") && f.events.indexOf("prepared-proof") < f.events.indexOf("root"));
  const row = (f.audit[0]!.after.images as readonly Record<string, unknown>[])[0]!;
  assert.deepEqual(Object.keys(row).sort(), ["id", "product_id", "file_ref", "mime", "byte_size", "display_order", "created_at", "created_by_account_id", "version", "image_role", "color_id"].sort()); assert.equal(row.byte_size, "68");
  assert.deepEqual(await f.service.executeV2(actor, c), saved); assert.equal(f.consumed.length, 1); assert.equal(f.images().length, 1);
  await assert.rejects(f.service.executeV2(actor, { ...c, imageChanges: [] }), { code: "IDEMPOTENCY_CONFLICT" });
});
test("W17 replacement/metadata/removal preserve native image provenance and enforce actual image CAS, never delete blobs", async () => {
  const f = mediaFixture(), saved = await f.service.executeV2(actor, mediaCreate()), initial = f.images()[0]!;
  await f.service.executeV2(actor, mediaEdit(saved.targetId, 1, [{ action: "REPLACE", id: initial.id, expectedVersion: 1, uploadId: gid(17002), role: "DETAIL", colorId: null, displayOrder: 5 }]));
  const replaced = f.images()[0]!; assert.equal(replaced.id, initial.id); assert.equal(replaced.version, 2); assert.equal(replaced.createdAt, initial.createdAt); assert.equal(replaced.createdByAccountId, initial.createdByAccountId);
  await assert.rejects(f.service.executeV2(actor, mediaEdit(saved.targetId, 2, [{ action: "REMOVE", id: initial.id, expectedVersion: 1 }], "stale-image")), { code: "VERSION_CONFLICT" });
  await f.service.executeV2(actor, mediaEdit(saved.targetId, 2, [{ action: "EDIT_METADATA", id: initial.id, expectedVersion: 2, role: "WHITE_BACKGROUND", colorId: null, displayOrder: 0 }], "metadata"));
  assert.equal(f.images()[0]!.version, 3); assert.equal(f.consumed.length, 2);
  await f.service.executeV2(actor, mediaEdit(saved.targetId, 3, [{ action: "REMOVE", id: initial.id, expectedVersion: 3 }], "remove")); assert.deepEqual(f.images(), []);
  assert.deepEqual(f.audit.at(-1)!.after.images, []); assert.equal((f.audit.at(-1)!.before!.images as unknown[]).length, 1);
});
test("W17 media stage/schema/prepare faults fail before mutation and image/receipt faults roll back the original aggregate", async () => {
  for (const options of [{ stage: false }, { guard: false }, { proof: false }, { prepare: "missing" as const }, { prepare: "fail" as const }]) {
    const f = mediaFixture(options); await assert.rejects(f.service.executeV2(actor, mediaCreate())); assert.equal(f.writes(), 0); assert.equal(f.images().length, 0);
  }
  for (const reason of ["scope", "expired", "failure"]) { const f = mediaFixture(); f.stageFault(reason); await assert.rejects(f.service.executeV2(actor, mediaCreate())); assert.equal(f.writes(), 0); }
  for (const mode of ["image", "receipt"] as const) { const f = mediaFixture(); if (mode === "image") f.imageFault(); else f.fault(true); await assert.rejects(f.service.executeV2(actor, mediaCreate())); assert.equal(f.state(), undefined); assert.deepEqual(f.images(), []); assert.equal(f.audit.length, 0); }
});
test("W17 final color uniqueness/membership and legacy unknown role are checked against actual retained images", async () => {
  const f = mediaFixture(), saved = await f.service.executeV2(actor, mediaCreate("color", [addImage("COLOR")])), image = f.images()[0]!;
  await assert.rejects(f.service.executeV2(actor, mediaEdit(saved.targetId, 1, [addImage("COLOR", gid(17003))])), { code: "COLOR_IMAGE_CONFLICT" });
  await assert.rejects(f.service.executeV2(actor, mediaEdit(saved.targetId, 1, [{ action: "EDIT_METADATA", id: image.id, expectedVersion: 1, role: "COLOR", colorId: gid(999), displayOrder: 0 }])), { code: "COLOR_IMAGE_CONFLICT" });
  f.seedImages([{ ...image, role: null, colorId: null, createdByAccountId: null }]);
  await f.service.executeV2(actor, mediaEdit(saved.targetId, 1, [{ action: "REPLACE", id: image.id, expectedVersion: 1, uploadId: gid(17004), role: null, colorId: null, displayOrder: 0 }]));
  assert.equal(f.images()[0]!.role, null); assert.equal(f.images()[0]!.createdByAccountId, null);
  const a = { ...image, role: "COLOR" as const, colorId: gid(1) }, b = { ...image, id: gid(2), role: "COLOR" as const, colorId: gid(2) };
  assert.throws(() => orderProductImageWrites([a, b], [{ ...a, version: a.version + 1, colorId: gid(2) }, { ...b, version: b.version + 1, colorId: gid(1) }]), { code: "PRODUCT_MEDIA_NOT_READY" });
});
test("W18 color-cycle plan selects only closed cycle IDs and exact final rows without a temporary role", () => {
  const template = imageSnapshot().images[0]!, before = [1, 2, 3].map(n => ({ ...template, id: gid(19000 + n), role: "COLOR" as const, colorId: gid(19100 + n) }));
  const after = before.map((i, n) => ({ ...i, version: i.version + 1, colorId: before[(n + 1) % before.length]!.colorId }));
  const free = { ...template, id: gid(19500), role: "MAIN" as const, displayOrder: 5, version: 1 };
  const plan = planProductImageWrites(before, [...after, free]); assert.deepEqual(new Set(plan.reinsertIds), new Set(before.map(i => i.id)));
  assert.equal(plan.ordered.length, 4); assert.ok(plan.ordered.every(i => i.role === "COLOR" || i.id === free.id));
  assert.throws(() => planProductImageWrites(before, [{ ...after[0]!, createdByAccountId: gid(1) }, ...after.slice(1)]), { code: "INVALID_PRODUCT_MEDIA_COMMAND" });
  assert.throws(() => planProductImageWrites(before, [{ ...after[0]!, version: before[0]!.version + 2 }, ...after.slice(1)]), { code: "INVALID_PRODUCT_MEDIA_COMMAND" });
});
test("W18 two/three image cycles keep IDs creator/time and one version, require actual v4 proof, and roll back on failure", async () => {
  for (const count of [2, 3]) {
    const f = mediaFixture({ swap: true }), colors = Array.from({ length: count }, (_, n) => gid(806 + n));
    const c = { ...mediaCreate(`cycle-${count}`, colors.map((colorId, n) => ({ action: "ADD" as const, uploadId: gid(17100 + n), role: "COLOR" as const, colorId, displayOrder: n }))), skus: colors.map(color => sku(color)), barcodes: [] };
    const saved = await f.service.executeV2(actor, c), before = f.images(); f.seedImages(before.map((i, n) => n === 0 ? { ...i, createdByAccountId: null } : i)); const actualBefore = f.images();
    f.events.length = 0;
    const changed = actualBefore.map((i, n) => ({ action: "EDIT_METADATA" as const, id: i.id, expectedVersion: i.version, role: "COLOR" as const, colorId: actualBefore[(n + 1) % count]!.colorId, displayOrder: i.displayOrder }));
    const swapCommand = mediaEdit(saved.targetId, 1, changed, `swap-${count}`), result = await f.service.executeV2(actor, swapCommand); assert.equal(result.version, 2);
    assert.ok(f.events.indexOf("prepared-proof") < f.events.indexOf("swap-proof") && f.events.indexOf("swap-proof") < f.events.indexOf("root"));
    for (const old of actualBefore) { const next = f.images().find(i => i.id === old.id)!; assert.equal(next.version, old.version + 1); assert.equal(next.createdAt, old.createdAt); assert.equal(next.createdByAccountId, old.createdByAccountId); }
    const audit = f.audit.at(-1)!; assert.equal((audit.before!.images as unknown[]).length, count); assert.equal((audit.after.images as unknown[]).length, count);
    const eventCount = f.events.length; assert.deepEqual(await f.service.executeV2(actor, swapCommand), result); assert.equal(f.events.length, eventCount);
    f.imageFault(); const state = f.state(), images = f.images();
    const reverse = f.images().map((i, n) => ({ ...changed[n]!, id: i.id, expectedVersion: i.version, colorId: actualBefore.find(b => b.id === i.id)!.colorId }));
    await assert.rejects(f.service.executeV2(actor, mediaEdit(saved.targetId, 2, reverse, `rollback-${count}`))); assert.deepEqual(f.state(), state); assert.deepEqual(f.images(), images);
  }
  const missing = mediaFixture(), colors = [gid(806), gid(807)], saved = await missing.service.executeV2(actor, { ...mediaCreate("missing-v4", colors.map((colorId, n) => ({ ...addImage("COLOR", gid(17500 + n)), colorId }))), skus: colors.map(c => sku(c)), barcodes: [] });
  const before = missing.images(), count = missing.writes(); await assert.rejects(missing.service.executeV2(actor, mediaEdit(saved.targetId, 1, before.map((i, n) => ({ action: "EDIT_METADATA", id: i.id, expectedVersion: i.version, role: "COLOR", colorId: before[1 - n]!.colorId, displayOrder: 0 })))), { code: "PRODUCT_MEDIA_NOT_READY" });
  assert.equal(missing.writes(), count); assert.deepEqual(missing.images(), before);
});
test("season v2: canonical multi-set uses one root CAS, prepared audit and original receipt; clear and known-to-unknown differ", async () => {
  const f = fixture("ready", true), c = commandV2(), saved = await f.service.executeV2(actor, c);
  assert.deepEqual(f.state()!.product.seasonIds, [gid(803), gid(850)]); assert.equal(f.state()!.product.seasonId, null);
  assert.deepEqual(f.audit[0]!.after.season_ids, [gid(803), gid(850)]); assert.ok(!Object.hasOwn(f.audit[0]!.after, "seasons"));
  assert.deepEqual(await f.service.executeV2(actor, commandV2("v2", [gid(803), gid(850)])), saved); assert.equal(f.audit.length, 1);
  const edit = { action: "EDIT", requestKey: "edit-v2", id: saved.targetId, expectedVersion: 1, values: c.values, skus: [], barcodes: [] };
  await assert.rejects(f.service.executeV2(actor, edit), { code: "NO_PRODUCT_CHANGE" });
  await assert.rejects(f.service.executeV2(actor, { ...edit, expectedVersion: 2 }), { code: "VERSION_CONFLICT" });
  await assert.rejects(f.service.executeV2(actor, { ...edit, values: { ...c.values, seasonIds: null } }), { code: "PRODUCT_SEASON_UNKNOWN_RESET" });
  const clear = await f.service.executeV2(actor, { ...edit, values: { ...c.values, seasonIds: [] } }); assert.equal(clear.version, 2);
  assert.deepEqual(f.audit[1]!.before!.season_ids, [gid(803), gid(850)]); assert.deepEqual(f.audit[1]!.after.season_ids, []);
  await f.service.execute(actor, { action: "DISABLE", requestKey: "disable-old", id: saved.targetId, expectedVersion: 2 });
  assert.deepEqual(f.state()!.product.seasonIds, []); assert.equal(f.state()!.product.seasonId, null);
});
test("season v2: unknown remains NULL, actual legacy scalar remains immutable, editor members match and explicit clear records NULL to []", async () => {
  const f = fixture(), original = await f.service.execute(actor, command()), state = f.state()!; f.activate(); f.seed({ ...state, product: { ...state.product, seasonIds: null } });
  const c = commandV2("unused", null), edit = { action: "EDIT", requestKey: "keep-unknown", id: original.targetId, expectedVersion: 1, values: { ...c.values, name: "RENAMED" }, skus: [], barcodes: [] };
  await f.service.executeV2(actor, edit); assert.equal(f.state()!.product.seasonIds, null); assert.equal(f.state()!.product.seasonId, gid(803));
  assert.ok(!Object.hasOwn(f.audit[1]!.after, "season_ids"));
  const read = await f.service.detailV2(actor, { productId: original.targetId }); assert.equal(read.values.seasonIds, null); assert.deepEqual(read.references.seasons, []);
  assert.ok(!Object.hasOwn(read.values, "seasonId")); assert.ok(!Object.hasOwn(read.references, "season"));
  await f.service.executeV2(actor, { ...edit, requestKey: "clear-unknown", expectedVersion: 2, values: { ...edit.values, seasonIds: [] } });
  assert.equal(f.audit[2]!.before!.season_ids, null); assert.deepEqual(f.audit[2]!.after.season_ids, []); assert.equal(f.state()!.product.seasonId, gid(803));
});
test("season v2: unavailable and malformed inputs fail without writes; activation rejects scalar editor but recovers committed original key", async () => {
  const f = fixture(); await assert.rejects(f.service.executeV2(actor, commandV2()), { code: "PRODUCT_SEASON_NOT_READY" }); assert.equal(f.writes(), 0);
  const original = command(), saved = await f.service.execute(actor, original), old = f.state()!; f.activate(); f.seed({ ...old, product: { ...old.product, seasonIds: [gid(803)] } });
  assert.deepEqual(await f.service.execute(actor, original), saved);
  await assert.rejects(f.service.execute(actor, { ...original, requestKey: "new-old" }), { code: "PRODUCT_EDIT_CONTRACT_UPGRADE_REQUIRED" });
  await assert.rejects(f.service.detail(actor, { productId: saved.targetId }), { code: "PRODUCT_EDIT_CONTRACT_UPGRADE_REQUIRED" });
  await assert.rejects(f.service.executeV2(actor, commandV2(original.requestKey)), { code: "IDEMPOTENCY_CONFLICT" });
  const count = f.writes();
  for (const seasons of [undefined, null, [gid(803), gid(803)], [null], [[gid(803)]], ["bad"], new Array(1)]) {
    await assert.rejects(f.service.executeV2(actor, { ...commandV2(), values: { ...commandV2().values, seasonIds: seasons } }), { code: "INVALID_PRODUCT_MAINTENANCE" });
  }
  await assert.rejects(f.service.executeV2(actor, { ...commandV2(), values: { ...commandV2().values, seasonId: gid(803) } }), { code: "INVALID_PRODUCT_MAINTENANCE" }); assert.equal(f.writes(), count);
  for (const mode of ["missing", "fail"] as const) { const g = fixture(mode, true); await assert.rejects(g.service.executeV2(actor, commandV2())); assert.equal(g.writes(), 0); }
  const h = fixture("ready", true); h.fault(true); await assert.rejects(h.service.executeV2(actor, commandV2())); assert.equal(h.state(), undefined); assert.equal(h.receipts.size, 0);
});
test("season v2: stored set order is preserved when unchanged; no reorder-only version or invented audit", async () => {
  const f = fixture("ready", true), c = commandV2(), saved = await f.service.executeV2(actor, c), state = f.state()!;
  f.seed({ ...state, product: { ...state.product, seasonIds: [gid(850), gid(803)] } });
  const edit = { action: "EDIT", requestKey: "reorder", id: saved.targetId, expectedVersion: 1, values: c.values, skus: [], barcodes: [] };
  await assert.rejects(f.service.executeV2(actor, edit), { code: "NO_PRODUCT_CHANGE" });
  await f.service.executeV2(actor, { ...edit, values: { ...edit.values, name: "OTHER CHANGE" } });
  assert.deepEqual(f.state()!.product.seasonIds, [gid(850), gid(803)]); assert.ok(!Object.hasOwn(f.audit[1]!.after, "season_ids"));
  const detail = await f.service.detailV2(actor, { productId: saved.targetId }); assert.deepEqual(detail.references.seasons.map(s => s.id), [gid(850), gid(803)]);
});
