import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { checkedProductActor, parseProductQuery, activeProductRead } from "./product-query-validation.ts";
import { partyName, partyRequestKey } from "./party-maintenance-validation.ts";
import { parseProductMaintenanceCandidates, parseProductMaintenanceCommand, parseProductMaintenanceCommandV2, parseProductMaintenanceMediaCommandV2, planProductImageWrites, productMaintenanceVersion, PRODUCT_MAINTENANCE_MAX_BARCODES, PRODUCT_MAINTENANCE_MAX_SKUS } from "./product-maintenance-validation.ts";
import { authorizeProductMaintenance } from "./product-maintenance-authorization.ts";
import { requestHash } from "./request-hash.ts";
import type { ActorContext } from "./ports.ts";
import type { ProductAggregate, ProductAuditObject, ProductBarcodeRecord, ProductMaintenanceAction, ProductMaintenanceDependencies, ProductMaintenanceDetail, ProductMaintenanceDetailV2, ProductMaintenanceResult, ProductSkuRecord, ProductStoredRecord, ProductMaintenanceImagesDto } from "./product-maintenance-ports.ts";
import type { DocumentProductSkuAppendInput, ProductSkuInput, ProductMaintenanceMediaCommandV2, ProductMaintenanceTransaction, ProductMaintenanceImageMetadata } from "./product-maintenance-ports.ts";

// Exact approved native 2026 scheme identity; descriptive CURRENT rows are not executable rules.
const BARCODE_2026_SCHEME_ID = "0e70e45e-1a51-4d44-afe8-0002cf3fb7ef";
async function generateNewSkuMainBarcodes(tx: ProductMaintenanceTransaction, product: ProductStoredRecord,
  added: readonly ProductSkuRecord[], barcodes: Map<string, ProductBarcodeRecord>, newId: ProductMaintenanceDependencies["newId"]): Promise<void> {
  if (product.defaultBarcodeSchemeId !== BARCODE_2026_SCHEME_ID || !/^\d{7}$/.test(product.systemItemCode ?? "")) return;
  const retainedMain = new Set([...barcodes.values()].filter(b => b.kind === "MAIN").map(b => b.skuId));
  const targets = added.filter(s => s.enabled && !retainedMain.has(s.id));
  if (!targets.length) return;
  requireDomain(typeof tx.readBarcodeGenerationReferences === "function", "PRODUCT_SPEC_GENERATION_NOT_READY", "Original transaction barcode reference reader required");
  const refs = await tx.readBarcodeGenerationReferences(product.id, BARCODE_2026_SCHEME_ID, targets);
  requireDomain(refs.scheme.id === BARCODE_2026_SCHEME_ID && refs.scheme.status === "CURRENT" && refs.scheme.codeLength === 15,
    "PRODUCT_REFERENCE_UNAVAILABLE", "Exact current 2026 scheme required");
  const index = (rows: readonly { readonly id: string; readonly code: string }[], ids: readonly string[]) => {
    const expected = new Set(ids), found = new Map(rows.map(row => [row.id, row.code]));
    requireDomain(rows.length === found.size && found.size === expected.size && rows.every(row => expected.has(row.id) && typeof row.code === "string"),
      "INVALID_DATABASE_VALUE", "Complete actual barcode reference codes required"); return found;
  };
  const colors = index(refs.colors, targets.map(s => s.colorId)), fits = index(refs.fits, targets.map(s => s.fitId)), sizes = index(refs.sizes, targets.map(s => s.sizeId));
  const used = new Set([...barcodes.values()].map(b => b.barcode)), pending: { sku: ProductSkuRecord; raw: string }[] = [];
  for (const sku of targets) {
    const color = colors.get(sku.colorId)!, fit = fits.get(sku.fitId)!, size = sizes.get(sku.sizeId)!;
    // Incomplete nonblank manual codes keep the saved SKU without a fabricated MAIN.
    if (!/^[YABCDE]$/.test(fit) || !/^\d{3}$/.test(color) || !/^\d{3}$/.test(size)) continue;
    const raw = `5${fit}${product.systemItemCode}${color}${size}`;
    requireDomain(!used.has(raw), "BARCODE_CONFLICT", "Generated barcode collides with a retained raw identity");
    used.add(raw); pending.push({ sku, raw });
  }
  requireDomain(barcodes.size + pending.length <= PRODUCT_MAINTENANCE_MAX_BARCODES, "PRODUCT_MAINTENANCE_TOO_LARGE", "Generated barcode bound exceeded");
  for (const { sku, raw } of pending) {
    const id = entityId("barcode", newId("barcode")); requireDomain(!barcodes.has(id), "BARCODE_CONFLICT", "Generated barcode id already exists");
    barcodes.set(id, { id, barcode: raw, skuId: sku.id, kind: "MAIN", schemeId: BARCODE_2026_SCHEME_ID, enabled: true });
  }
}
const coordinate = (row: { readonly colorId: string; readonly fitId: string; readonly sizeId: string }) => JSON.stringify([row.colorId, row.fitId, row.sizeId]);
function productFacts(p: ProductStoredRecord): ProductAuditObject {
  return { id: p.id, product_code: p.productCode, name: p.name, category_id: p.categoryId, supplier_id: p.supplierId, season_id: p.seasonId,
    size_group_id: p.sizeGroupId, year: p.year, system_item_code: p.systemItemCode, thickness: p.thickness, collar_pants_type: p.collarPantsType,
    default_barcode_scheme_id: p.defaultBarcodeSchemeId, enabled: p.enabled, deleted_at: p.deletedAt, version: p.version, ...p.prices, ...(Object.hasOwn(p, "seasonIds") ? { season_ids: p.seasonIds! } : {}) };
}
function skuFacts(s: ProductSkuRecord): ProductAuditObject {
  return { id: s.id, product_id: s.productId, color_id: s.colorId, fit_id: s.fitId, size_id: s.sizeId, sku_code: s.skuCode,
    enabled: s.enabled, version: s.version, created_operation_id: s.createdOperationId };
}
function newSkuRecord(item: Pick<ProductSkuInput, "skuCode" | "colorId" | "fitId" | "sizeId" | "enabled">, id: string, productId: string, operationId: string): ProductSkuRecord {
  return { id, productId, skuCode: item.skuCode, colorId: item.colorId, fitId: item.fitId, sizeId: item.sizeId,
    enabled: item.enabled, version: 1, createdOperationId: operationId };
}
function productRootDelta(previous: ProductStoredRecord | undefined, next: ProductStoredRecord) {
  const after: Record<string, ProductAuditObject[string]> = {}, before: Record<string, ProductAuditObject[string]> = {};
  const facts = productFacts(next), oldFacts = previous ? productFacts(previous) : null;
  for (const [key, value] of Object.entries(facts)) if (oldFacts === null || different(value, oldFacts[key]!)) {
    after[key] = value; if (oldFacts !== null) before[key] = oldFacts[key]!;
  }
  return { before, after };
}
function barcodeFacts(b: ProductBarcodeRecord): ProductAuditObject { return { id: b.id, barcode: b.barcode, sku_id: b.skuId, barcode_kind: b.kind, scheme_id: b.schemeId, enabled: b.enabled }; }
function imageFacts(i: ProductMaintenanceImageMetadata): ProductAuditObject { return { id: i.id, product_id: i.productId, file_ref: i.fileRef, mime: i.mime, byte_size: i.byteSize.toString(), display_order: i.displayOrder,
  created_at: i.createdAt, created_by_account_id: i.createdByAccountId, version: i.version, image_role: i.role, color_id: i.colorId }; }
const different = (a: unknown, b: unknown) => requestHash(a) !== requestHash(b);
function result(value: { readonly operationId: string; readonly kind: string; readonly targetId: string; readonly version: number }): ProductMaintenanceResult {
  requireDomain(value.kind === "PRODUCT", "INVALID_DATABASE_VALUE", "Invalid product receipt kind");
  return { operationId: entityId("operation", value.operationId), kind: "PRODUCT", targetId: entityId("product", value.targetId), version: productMaintenanceVersion(value.version) };
}
/** Borrowed original transaction only: no new authority, IDs, pool or commit.
 * D1's current parent-SAVE evidence must authorize this exact append purpose. */
export async function appendProductSkusInTransaction(tx: ProductMaintenanceTransaction, original: DocumentProductSkuAppendInput): Promise<{
  readonly result: ProductMaintenanceResult; readonly addedSkus: readonly ProductSkuRecord[];
}> {
  const input = structuredClone(original), actor = checkedProductActor(input.actor), productId = entityId("product", input.productId);
  const expectedVersion = productMaintenanceVersion(input.expectedVersion), operationId = entityId("operation", input.operationId), requestKey = partyRequestKey(input.requestKey);
  requireDomain(typeof input.completedAt === "string" && Number.isFinite(Date.parse(input.completedAt)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(input.completedAt), "INVALID_ACTION_TIME", "Trusted action time with timezone required");
  requireDomain(Array.isArray(input.skus) && input.skus.length > 0 && input.skus.length <= PRODUCT_MAINTENANCE_MAX_SKUS, "PRODUCT_SPEC_REQUIRED", "Only actual missing document specifications may be appended");
  const ids = new Set<string>(), codes = new Set<string>(), coordinates = new Set<string>();
  const skus = input.skus.map(row => {
    const id = entityId("sku", row.id); entityId("color", row.colorId); entityId("fit", row.fitId); entityId("size", row.sizeId);
    const code = partyName(row.skuCode), key = coordinate(row);
    requireDomain(row.productId === productId && row.version === 1 && row.createdOperationId === operationId && row.enabled === true
      && code === `NJNEW-${id.replaceAll("-", "").toLowerCase()}`, "INVALID_PRODUCT_MAINTENANCE", "Exact new document SKU identity, code and creation operation required");
    requireDomain(!ids.has(id) && !codes.has(code) && !coordinates.has(key), "PRODUCT_SPEC_CONFLICT", "Repeated new SKU identity, code or coordinate");
    ids.add(id); codes.add(code); coordinates.add(key); return newSkuRecord(row, id, productId, operationId);
  });
  const hash = requestHash({ kind: "DOCUMENT_SKU_APPEND_V1", actorAccountId: actor.accountId, productId, expectedVersion, skus });
  await authorizeProductMaintenance(tx.evidence, actor, "EDIT");
  const receipt = await tx.evidence.getReceipt(actor.accountId, requestKey, "PRODUCT");
  if (receipt) {
    requireDomain(receipt.requestHash === hash && receipt.action === "EDIT", "IDEMPOTENCY_CONFLICT", "Original append key has different content");
    await authorizeProductMaintenance(tx.evidence, actor, "EDIT");
    const saved = result(receipt.result);
    requireDomain(saved.operationId === operationId && saved.targetId === productId && saved.version === expectedVersion + 1, "INVALID_DATABASE_VALUE", "Append receipt differs from original operation");
    return { result: saved, addedSkus: skus };
  }
  const previous = await tx.load(productId);
  requireDomain(previous !== undefined, "PRODUCT_NOT_FOUND", "Product identity is unavailable");
  requireDomain(previous.product.version === expectedVersion, "VERSION_CONFLICT", "Product version changed");
  requireDomain(previous.product.deletedAt === null, "PRODUCT_DELETED", "Deleted product identity is retained read-only");
  requireDomain(previous.product.enabled, "PRODUCT_REFERENCE_UNAVAILABLE", "Document specification requires an enabled product");
  requireDomain(expectedVersion < 2147483647, "VERSION_STORAGE_OVERFLOW", "Product version exhausted");
  requireDomain(previous.skus.every(s => !ids.has(s.id) && !coordinates.has(coordinate(s)) && !codes.has(s.skuCode)), "PRODUCT_SPEC_CONFLICT", "Retained SKU identity, code or coordinate cannot be recreated or restored");
  const next: ProductAggregate = { product: { ...previous.product, version: expectedVersion + 1 }, skus: [...previous.skus, ...skus], barcodes: previous.barcodes };
  requireDomain(next.skus.length <= PRODUCT_MAINTENANCE_MAX_SKUS, "PRODUCT_MAINTENANCE_TOO_LARGE", "Saved aggregate would exceed readable SKU bound");
  await tx.validateReferences(previous, next);
  const { before, after } = productRootDelta(previous.product, next.product);
  before.skus = []; after.skus = skus.map(skuFacts);
  const completion = { operationId, actorAccountId: actor.accountId, requestKey, requestHash: hash, kind: "PRODUCT" as const, action: "EDIT" as const,
    targetId: productId, oldVersion: expectedVersion, newVersion: next.product.version, beforeValues: before, afterValues: after, completedAt: input.completedAt };
  requireDomain(typeof tx.evidence.prepare === "function", "MAINTENANCE_PREPARE_NOT_READY", "Original audit preparation is unavailable");
  await tx.evidence.prepare(completion); await tx.putProduct(next.product, previous.product);
  for (const sku of skus) await tx.putSku(sku, undefined);
  const saved = result(await tx.evidence.complete(completion));
  requireDomain(saved.operationId === operationId && saved.targetId === productId && saved.version === next.product.version, "INVALID_DATABASE_VALUE", "Product evidence differs from saved append");
  return { result: saved, addedSkus: skus };
}
/** Actual aggregate rules; persistence/evidence use one explicitly supplied D1 transaction. */
export function createProductMaintenanceService(dependencies: ProductMaintenanceDependencies) {
  if (typeof dependencies?.unitOfWork?.transaction !== "function" || typeof dependencies?.now !== "function" || typeof dependencies?.newId !== "function")
    throw new TypeError("Product maintenance requires an explicit transaction, clock and identifiers");
  async function images(tx: ProductMaintenanceTransaction, actor: ActorContext, command: ProductMaintenanceMediaCommandV2, productId: string, next: ProductAggregate, timestamp: string, signal: AbortSignal) {
    const existing = await tx.loadImages!(productId), old = new Map(existing.map(i => [i.id, i])), final = new Map(old);
    requireDomain(existing.length <= 1000 && old.size === existing.length && existing.every(i => i.productId === productId), "INVALID_DATABASE_VALUE", "Invalid locked image snapshot");
    const expiries: number[] = [];
    for (const change of command.imageChanges) {
      const previous = change.action === "ADD" ? undefined : old.get(change.id);
      if (change.action !== "ADD") requireDomain(previous && previous.version === change.expectedVersion, previous ? "VERSION_CONFLICT" : "PRODUCT_IMAGE_NOT_FOUND", "Image identity/version changed");
      if (change.action === "REMOVE") { final.delete(change.id); continue; }
      requireDomain(!previous || previous.version < 2147483647, "VERSION_STORAGE_OVERFLOW", "Image version exhausted");
      requireDomain(change.role !== null || previous?.role === null, "INVALID_PRODUCT_MEDIA_COMMAND", "Only an existing unknown role may remain unknown");
      let content = previous;
      if (change.action === "ADD" || change.action === "REPLACE") {
        activeProductRead(signal); const prepared = await dependencies.imageStage!.consume({ actor, productId: command.action === "CREATE" ? null : productId, commandKey: command.requestKey, uploadId: change.uploadId, signal }); activeProductRead(signal);
        const now = Date.parse(dependencies.now()), expiry = Date.parse(prepared.expiresAt);
        requireDomain(prepared.profile === "PRIVATE_PRODUCT_MEDIA_STAGE_V1" && prepared.uploadId === change.uploadId && prepared.actorAccountId === actor.accountId
          && prepared.productId === (command.action === "CREATE" ? null : productId) && prepared.commandKey === command.requestKey, "MEDIA_SCOPE_MISMATCH", "Stage differs from original product command");
        requireDomain(Number.isFinite(now) && Number.isFinite(expiry) && Number.isFinite(Date.parse(prepared.createdAt)) && now >= Date.parse(prepared.createdAt) && now < expiry, "UPLOAD_EXPIRED", "Stage is not currently valid");
        requireDomain(prepared.fileRef === `staged-product-media:${change.uploadId}` && ["image/png", "image/jpeg", "image/webp"].includes(prepared.original.mime)
          && typeof prepared.original.byteSize === "bigint" && prepared.original.byteSize > 0n && prepared.original.byteSize <= 8388608n && /^[a-f0-9]{64}$/.test(prepared.original.sha256)
          && prepared.thumbnail.mime === "image/webp" && typeof prepared.thumbnail.byteSize === "bigint" && prepared.thumbnail.byteSize > 0n && prepared.thumbnail.byteSize <= 262144n
          && /^[a-f0-9]{64}$/.test(prepared.thumbnail.sha256) && prepared.thumbnail.derivedFromOriginalSha256 === prepared.original.sha256, "PRODUCT_MEDIA_NOT_READY", "Verified original/thumbnail stage facts required");
        expiries.push(expiry);
        const id = previous?.id ?? entityId("product", dependencies.newImageId!());
        requireDomain(previous !== undefined || id !== change.uploadId && !final.has(id) && !old.has(id), "VERSION_CONFLICT", "Native image identity must be allocated independently");
        content = { id, productId, fileRef: prepared.fileRef, mime: prepared.original.mime, byteSize: prepared.original.byteSize, displayOrder: change.displayOrder,
          version: (previous?.version ?? 0) + 1, role: change.role, colorId: change.colorId, createdAt: previous?.createdAt ?? timestamp, createdByAccountId: previous?.createdByAccountId ?? (previous ? null : actor.accountId) };
      }
      requireDomain(content, "PRODUCT_IMAGE_NOT_FOUND", "Actual image is unavailable");
      final.set(content.id, { ...content, version: (previous?.version ?? 0) + 1, role: change.role, colorId: change.colorId, displayOrder: change.displayOrder });
    }
    requireDomain(final.size <= 1000, "PRODUCT_MAINTENANCE_TOO_LARGE", "Final image set exceeds readable bound");
    const colors = new Set(next.skus.map(s => s.colorId)), used = new Set<string>();
    for (const image of final.values()) {
      requireDomain(image.role === "COLOR" ? image.colorId !== null && colors.has(image.colorId) && !used.has(image.colorId) : image.colorId === null, "COLOR_IMAGE_CONFLICT", "Final image roles/colors conflict with actual SKU set");
      if (image.colorId !== null) used.add(image.colorId);
    }
    const before = existing.filter(i => !final.has(i.id) || different(imageFacts(i), imageFacts(final.get(i.id)!))).sort((a, b) => a.id.localeCompare(b.id));
    const after = [...final.values()].filter(i => !old.has(i.id) || different(imageFacts(i), imageFacts(old.get(i.id)!))).sort((a, b) => a.id.localeCompare(b.id));
    const plan = planProductImageWrites(before, after);
    requireDomain(plan.reinsertIds.length === 0 || typeof tx.assertImageColorSwapReady === "function", "PRODUCT_MEDIA_NOT_READY", "Actual color-swap guard capability required");
    return { before, after, expiries, reinsertIds: plan.reinsertIds };
  }
  async function detail(actorInput: ActorContext, input: unknown, contractVersion: 1 | 2): Promise<ProductMaintenanceDetail | ProductMaintenanceDetailV2> {
    const actor = checkedProductActor(actorInput), { productId } = parseProductQuery(input);
    return dependencies.unitOfWork.transaction(async tx => {
      await authorizeProductMaintenance(tx.evidence, actor, "DETAIL");
      requireDomain(contractVersion !== 2 || dependencies.unitOfWork.seasonContract === "product-season-array-v1", "PRODUCT_SEASON_NOT_READY", "Verified season array contract is unavailable");
      requireDomain(contractVersion !== 1 || dependencies.unitOfWork.seasonContract === undefined, "PRODUCT_EDIT_CONTRACT_UPGRADE_REQUIRED", "Use the multi-season editor contract");
      const aggregate = await tx.load(productId);
      requireDomain(aggregate, "PRODUCT_NOT_FOUND", "Product is unavailable"); const p = aggregate.product;
      const skus = new Map(aggregate.skus.map(s => [s.id, s]));
      const references = await tx.readReferences(p);
      requireDomain(references.categoryPath.length > 0 && references.categoryPath.at(-1)!.id === p.categoryId && references.sizeGroup.id === p.sizeGroupId
        && (references.supplier?.id ?? null) === p.supplierId && (references.season?.id ?? null) === p.seasonId
        && (references.defaultBarcodeScheme?.id ?? null) === p.defaultBarcodeSchemeId, "INVALID_DATABASE_VALUE", "Maintenance references differ from actual foreign keys");
      const legacy: ProductMaintenanceDetail = { productId, version: p.version, deletedAt: p.deletedAt, references,
        values: { productCode: p.productCode, name: p.name, categoryId: p.categoryId, supplierId: p.supplierId, seasonId: p.seasonId, sizeGroupId: p.sizeGroupId,
          year: p.year, systemItemCode: p.systemItemCode, thickness: p.thickness, collarPantsType: p.collarPantsType, defaultBarcodeSchemeId: p.defaultBarcodeSchemeId, enabled: p.enabled, prices: p.prices },
        skus: aggregate.skus.map(s => ({ id: s.id, expectedVersion: s.version, skuCode: s.skuCode, colorId: s.colorId, fitId: s.fitId, sizeId: s.sizeId, enabled: s.enabled })),
        barcodes: aggregate.barcodes.map(b => {
          const s = skus.get(b.skuId); requireDomain(s, "INVALID_DATABASE_VALUE", "Barcode has no actual SKU");
          return { id: b.id, barcode: b.barcode, colorId: s.colorId, fitId: s.fitId, sizeId: s.sizeId, kind: b.kind, schemeId: b.schemeId, enabled: b.enabled };
        }) };
      if (contractVersion === 1) return legacy;
      requireDomain(Object.hasOwn(p, "seasonIds") && (p.seasonIds === null || Array.isArray(p.seasonIds)), "INVALID_DATABASE_VALUE", "Season array column was not read");
      const seasons = references.seasons;
      requireDomain(Array.isArray(seasons) && seasons.length === (p.seasonIds?.length ?? 0)
        && new Set(seasons.map(s => s.id)).size === seasons.length && seasons.every(s => p.seasonIds?.includes(s.id)), "INVALID_DATABASE_VALUE", "Season references differ from stored members");
      const { seasonId: _legacySeason, ...values } = legacy.values;
      const { season: _legacyReference, seasons: _seasons, ...rest } = references;
      return { ...legacy, values: { ...values, seasonIds: p.seasonIds! }, references: { ...rest, seasons } };
    });
  }
  async function execute(actorInput: ActorContext, input: unknown, contractVersion: 1 | 2, signal = new AbortController().signal): Promise<ProductMaintenanceResult> {
    const actor = checkedProductActor(actorInput);
    const mediaCommand = contractVersion === 2 && input && typeof input === "object" && Object.hasOwn(input, "imageChanges") ? parseProductMaintenanceMediaCommandV2(input) : null;
    const command = mediaCommand ?? (contractVersion === 2 ? parseProductMaintenanceCommandV2(input) : parseProductMaintenanceCommand(input));
    const full = command.action === "CREATE" || command.action === "EDIT";
    const hash = requestHash({ kind: "PRODUCT", actorAccountId: actor.accountId, command, ...(contractVersion === 2 && full ? { contractVersion: 2 } : {}) });
    return dependencies.unitOfWork.transaction(async tx => {
      await authorizeProductMaintenance(tx.evidence, actor, command.action);
      const receipt = await tx.evidence.getReceipt(actor.accountId, command.requestKey, "PRODUCT");
      if (receipt) {
        requireDomain(receipt.requestHash === hash && receipt.action === command.action, "IDEMPOTENCY_CONFLICT", "Original product key has different content");
        await authorizeProductMaintenance(tx.evidence, actor, command.action); return result(receipt.result);
      }
      requireDomain(contractVersion !== 2 || dependencies.unitOfWork.seasonContract === "product-season-array-v1", "PRODUCT_SEASON_NOT_READY", "Verified season array contract is unavailable");
      requireDomain(contractVersion !== 1 || !full || dependencies.unitOfWork.seasonContract === undefined, "PRODUCT_EDIT_CONTRACT_UPGRADE_REQUIRED", "Use the multi-season editor contract");
      if (mediaCommand !== null) {
        requireDomain(dependencies.imageStage?.profile === "PRIVATE_PRODUCT_MEDIA_STAGE_V1" && typeof dependencies.imageStage.consume === "function"
          && typeof tx.assertImageWriteReady === "function" && typeof tx.assertImagesPrepared === "function" && typeof tx.loadImages === "function" && typeof tx.writeImages === "function"
          && (!mediaCommand.imageChanges.some(c => c.action === "ADD") || typeof dependencies.newImageId === "function"), "PRODUCT_MEDIA_NOT_READY", "Explicit actual stage and image-write capabilities required");
        activeProductRead(signal); await tx.assertImageWriteReady(); activeProductRead(signal);
      }
      const id = command.action === "CREATE" ? entityId("product", dependencies.newId("product")) : command.id;
      const previous = await tx.load(id);
      requireDomain(command.action === "CREATE" ? previous === undefined : previous !== undefined, command.action === "CREATE" ? "VERSION_CONFLICT" : "PRODUCT_NOT_FOUND", "Product identity is unavailable");
      if (command.action !== "CREATE") requireDomain(previous!.product.version === command.expectedVersion, "VERSION_CONFLICT", "Product version changed");
      requireDomain(!previous || previous.product.deletedAt === null, "PRODUCT_DELETED", "Deleted product identity is retained read-only");
      requireDomain(!previous || previous.product.version < 2147483647, "VERSION_STORAGE_OVERFLOW", "Product version exhausted");
      const timestamp = dependencies.now(), operationId = entityId("operation", dependencies.newId("operation"));
      requireDomain(typeof timestamp === "string" && Number.isFinite(Date.parse(timestamp)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp), "INVALID_ACTION_TIME", "Trusted action time with timezone required");
      let nextProduct: ProductStoredRecord;
      const skus = new Map((previous?.skus ?? []).map(s => [s.id, { ...s }])), barcodes = new Map((previous?.barcodes ?? []).map(b => [b.id, { ...b }]));
      if (command.action === "CREATE" || command.action === "EDIT") {
        requireDomain(command.values.systemItemCode !== null && command.values.systemItemCode.trim().length > 0, "PRODUCT_REQUIRED_FIELDS", "Manual system item code is required; never allocated");
        requireDomain(!previous || previous.product.productCode === command.values.productCode, "IMMUTABLE_PRODUCT_CODE", "Existing product code is read-only");
        if ("seasonIds" in command.values) {
          requireDomain(!previous || Object.hasOwn(previous.product, "seasonIds"), "INVALID_DATABASE_VALUE", "Actual season array is unavailable");
          requireDomain(command.values.seasonIds !== null || previous?.product.seasonIds === null, "PRODUCT_SEASON_UNKNOWN_RESET", "Known seasons cannot be changed to unknown");
          const seasonIds = previous?.product.seasonIds && command.values.seasonIds
            && !different([...previous.product.seasonIds].sort(), command.values.seasonIds) ? previous.product.seasonIds : command.values.seasonIds;
          nextProduct = { ...command.values, seasonIds, seasonId: previous?.product.seasonId ?? null, id, version: (previous?.product.version ?? 0) + 1, deletedAt: null };
        } else nextProduct = { ...command.values, id, version: (previous?.product.version ?? 0) + 1, deletedAt: null };
        const generated: { colorId: string; fitId: string; sizeId: string }[] = [];
        if ("skuSelection" in command && command.skuSelection !== undefined) {
          const selection = command.skuSelection;
          requireDomain(!previous || previous.product.sizeGroupId === nextProduct.sizeGroupId, "PRODUCT_SIZE_GROUP_MISMATCH", "Selection generation cannot migrate an existing product group");
          if (selection.colorIds.length && selection.fitIds.length) {
            requireDomain(typeof tx.readSkuSelectionSizes === "function", "PRODUCT_SPEC_GENERATION_NOT_READY", "Original transaction selection reader required");
            const rawSizes = await tx.readSkuSelectionSizes(id, nextProduct.sizeGroupId, selection);
            requireDomain(Array.isArray(rawSizes) && rawSizes.length > 0 && rawSizes.length <= PRODUCT_MAINTENANCE_MAX_SKUS, "PRODUCT_SPEC_REQUIRED", "Complete nonempty product size group required");
            const sizes = rawSizes.map(size => entityId("size", size));
            requireDomain(new Set(sizes).size === sizes.length, "INVALID_DATABASE_VALUE", "Repeated group member identity");
            requireDomain(BigInt(selection.colorIds.length) * BigInt(selection.fitIds.length) * BigInt(sizes.length) <= BigInt(PRODUCT_MAINTENANCE_MAX_SKUS), "PRODUCT_MAINTENANCE_TOO_LARGE", "Selected specifications exceed the existing SKU bound");
            const explicitNew = new Set(command.skus.filter(s => s.id === null).map(coordinate));
            const existing = new Set([...skus.values()].map(coordinate));
            for (const colorId of selection.colorIds) for (const fitId of selection.fitIds) for (const sizeId of sizes) {
              const spec = { colorId, fitId, sizeId }, key = coordinate(spec);
              requireDomain(!explicitNew.has(key), "PRODUCT_SPEC_CONFLICT", "Explicit and selected new specifications overlap");
              if (!existing.has(key)) generated.push(spec);
            }
            requireDomain(skus.size + command.skus.filter(s => s.id === null).length + generated.length <= PRODUCT_MAINTENANCE_MAX_SKUS, "PRODUCT_MAINTENANCE_TOO_LARGE", "Saved aggregate would exceed the existing SKU bound");
          }
        }
        for (const item of command.skus) {
          if (item.id === null) {
            requireDomain(![...skus.values()].some(s => coordinate(s) === coordinate(item)), "PRODUCT_SPEC_CONFLICT", "Existing SKU coordinate cannot be recreated");
            const skuId = entityId("sku", dependencies.newId("sku")); requireDomain(!skus.has(skuId), "PRODUCT_SPEC_CONFLICT", "New SKU id already exists");
            skus.set(skuId, newSkuRecord(item, skuId, id, operationId));
          } else {
            const old = skus.get(item.id);
            requireDomain(old && old.version === item.expectedVersion, "VERSION_CONFLICT", "SKU version changed");
            requireDomain(coordinate(old) === coordinate(item) && old.skuCode === item.skuCode, "IMMUTABLE_SKU_IDENTITY", "SKU coordinate/code cannot be rewritten");
            if (old.enabled !== item.enabled) { requireDomain(old.version < 2147483647, "VERSION_STORAGE_OVERFLOW", "SKU version exhausted"); skus.set(old.id, { ...old, enabled: item.enabled, version: old.version + 1 }); }
          }
        }
        for (const spec of generated) {
          const skuId = entityId("sku", dependencies.newId("sku"));
          requireDomain(!skus.has(skuId), "PRODUCT_SPEC_CONFLICT", "New SKU id already exists");
          skus.set(skuId, newSkuRecord({ ...spec, skuCode: `NJNEW-${skuId.replaceAll("-", "")}`, enabled: true }, skuId, id, operationId));
        }
        requireDomain(command.action !== "CREATE" || skus.size > 0, "PRODUCT_SPEC_REQUIRED", "New product requires a real SKU");
        const byCoordinate = new Map([...skus.values()].map(s => [coordinate(s), s]));
        for (const item of command.barcodes) {
          const sku = byCoordinate.get(coordinate(item)); requireDomain(sku, "PRODUCT_SPEC_NOT_FOUND", "Barcode needs a real retained SKU");
          if (item.id === null) {
            requireDomain(![...barcodes.values()].some(b => b.barcode === item.barcode), "BARCODE_CONFLICT", "Retained raw barcode already exists");
            const barcodeId = entityId("barcode", dependencies.newId("barcode")); requireDomain(!barcodes.has(barcodeId), "BARCODE_CONFLICT", "New barcode id already exists");
            barcodes.set(barcodeId, { id: barcodeId, barcode: item.barcode, skuId: sku.id, kind: item.kind, schemeId: item.schemeId, enabled: item.enabled });
          } else {
            const old = barcodes.get(item.id);
            requireDomain(old && old.barcode === item.barcode && old.skuId === sku.id && old.kind === item.kind && old.schemeId === item.schemeId,
              "IMMUTABLE_BARCODE_IDENTITY", "Existing raw barcode binding/provenance cannot change");
            barcodes.set(old.id, { ...old, enabled: item.enabled });
          }
        }
        if (contractVersion === 2) {
          const oldIds = new Set(previous?.skus.map(s => s.id) ?? []);
          await generateNewSkuMainBarcodes(tx, nextProduct, [...skus.values()].filter(s => !oldIds.has(s.id)), barcodes, dependencies.newId);
        }
        const main = new Set<string>();
        for (const b of barcodes.values()) if (b.enabled && b.kind === "MAIN") {
          requireDomain(!main.has(b.skuId), "BARCODE_CONFLICT", "Only one enabled main barcode per SKU"); main.add(b.skuId);
        }
      } else {
        const old = previous!.product;
        requireDomain(command.action !== "DISABLE" || old.enabled, "INVALID_PRODUCT_STATE", "Product is already disabled");
        requireDomain(command.action !== "RESTORE" || !old.enabled, "INVALID_PRODUCT_STATE", "Product is already enabled");
        if (command.action === "DELETE") await tx.assertCanDelete(previous!);
        nextProduct = { ...old, version: old.version + 1, enabled: command.action === "RESTORE" ? true : command.action === "DISABLE" ? false : old.enabled,
          deletedAt: command.action === "DELETE" ? timestamp : null };
      }
      const next: ProductAggregate = { product: nextProduct, skus: [...skus.values()], barcodes: [...barcodes.values()] };
      requireDomain(next.skus.length <= PRODUCT_MAINTENANCE_MAX_SKUS && next.barcodes.length <= PRODUCT_MAINTENANCE_MAX_BARCODES,
        "PRODUCT_MAINTENANCE_TOO_LARGE", "Saved aggregate would exceed the readable edit bound");
      await tx.validateReferences(previous, next);
      const imagePlan = mediaCommand !== null ? await images(tx, actor, mediaCommand, id, next, timestamp, signal) : null;
      const oldSkus = new Map((previous?.skus ?? []).map(s => [s.id, s])), oldBarcodes = new Map((previous?.barcodes ?? []).map(b => [b.id, b]));
      const changedSkus = next.skus.filter(s => !oldSkus.has(s.id) || different(s, oldSkus.get(s.id)!));
      const changedBarcodes = next.barcodes.filter(b => !oldBarcodes.has(b.id) || different(b, oldBarcodes.get(b.id)!));
      const { before, after } = productRootDelta(previous?.product, nextProduct);
      requireDomain(previous === undefined || Object.keys(after).some(key => key !== "version") || changedSkus.length > 0 || changedBarcodes.length > 0 || imagePlan !== null && (imagePlan.before.length > 0 || imagePlan.after.length > 0),
        "NO_PRODUCT_CHANGE", "No actual product changes supplied");
      if (changedSkus.length) { after.skus = changedSkus.map(skuFacts); before.skus = changedSkus.flatMap(s => oldSkus.has(s.id) ? [skuFacts(oldSkus.get(s.id)!)] : []); }
      if (changedBarcodes.length) { after.barcodes = changedBarcodes.map(barcodeFacts); before.barcodes = changedBarcodes.flatMap(b => oldBarcodes.has(b.id) ? [barcodeFacts(oldBarcodes.get(b.id)!)] : []); }
      if (imagePlan && (imagePlan.before.length || imagePlan.after.length)) { before.images = imagePlan.before.map(imageFacts); after.images = imagePlan.after.map(imageFacts); }
      const completion = { operationId, actorAccountId: actor.accountId, requestKey: command.requestKey, requestHash: hash,
        kind: "PRODUCT" as const, action: command.action, targetId: id, oldVersion: previous?.product.version ?? null, newVersion: nextProduct.version,
        beforeValues: previous ? before : null, afterValues: after, completedAt: timestamp };
      requireDomain(typeof tx.evidence.prepare === "function", "MAINTENANCE_PREPARE_NOT_READY", "Original audit preparation is unavailable");
      if (imagePlan) { activeProductRead(signal); requireDomain(imagePlan.expiries.every(t => Date.parse(dependencies.now()) < t), "UPLOAD_EXPIRED", "Image stage expired before mutation"); }
      await tx.evidence.prepare(completion);
      if (imagePlan) await tx.assertImagesPrepared!(completion);
      if (imagePlan?.reinsertIds.length) await tx.assertImageColorSwapReady!(completion);
      await tx.putProduct(nextProduct, previous?.product);
      for (const s of changedSkus) await tx.putSku(s, oldSkus.get(s.id));
      for (const b of changedBarcodes) await tx.putBarcode(b, oldBarcodes.get(b.id));
      if (imagePlan && (imagePlan.before.length || imagePlan.after.length)) await tx.writeImages!(imagePlan.before, imagePlan.after);
      const committed = await tx.evidence.complete(completion);
      const checked = result(committed);
      requireDomain(checked.operationId === operationId && checked.targetId === id && checked.version === nextProduct.version, "INVALID_DATABASE_VALUE", "Product evidence differs from saved aggregate"); return checked;
    });
  }
  return Object.freeze({
    async readImages(actorInput: ActorContext, input: unknown, signal: AbortSignal): Promise<ProductMaintenanceImagesDto> {
      const actor = checkedProductActor(actorInput), parameters = parseProductQuery(input); activeProductRead(signal);
      const snapshot = await dependencies.unitOfWork.transaction(async tx => {
        await authorizeProductMaintenance(tx.evidence, actor, "DETAIL"); activeProductRead(signal);
        requireDomain(typeof tx.readImageSnapshot === "function", "PRODUCT_MEDIA_NOT_READY", "Actual image metadata reader unavailable");
        const result = await tx.readImageSnapshot(parameters.productId); activeProductRead(signal);
        requireDomain(result, "PRODUCT_NOT_FOUND", "Product is unavailable"); return result;
      });
      activeProductRead(signal);
      requireDomain(snapshot.productId === parameters.productId && Array.isArray(snapshot.images) && snapshot.images.length <= 1000, "INVALID_DATABASE_VALUE", "Invalid product image snapshot");
      const version = productMaintenanceVersion(snapshot.version), ids = new Set<string>(), colors = new Set<string>();
      let previous: { order: number; id: string } | undefined;
      for (const image of snapshot.images) {
        const id = entityId("product", image.id); productMaintenanceVersion(image.version);
        requireDomain(!ids.has(id) && image.productId === parameters.productId && typeof image.fileRef === "string" && image.fileRef.length > 0
          && (image.role === null || ["MAIN", "WHITE_BACKGROUND", "HANG_TAG", "DETAIL", "COLOR"].includes(image.role))
          && (image.role === "COLOR" ? image.colorId !== null && !colors.has(image.colorId) : image.colorId === null)
          && Number.isInteger(image.displayOrder) && image.displayOrder >= -2147483648 && image.displayOrder <= 2147483647
          && (!previous || image.displayOrder > previous.order || image.displayOrder === previous.order && id > previous.id)
          && ["image/png", "image/jpeg", "image/webp"].includes(image.mime) && typeof image.byteSize === "bigint" && image.byteSize > 0n && image.byteSize <= 8388608n
          && typeof image.createdAt === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(image.createdAt) && Number.isFinite(Date.parse(image.createdAt)), "INVALID_DATABASE_VALUE", "Invalid actual image metadata");
        if (image.colorId !== null) { entityId("color", image.colorId); colors.add(image.colorId); }
        if (image.createdByAccountId !== null) entityId("account", image.createdByAccountId);
        ids.add(id); previous = { order: image.displayOrder, id };
      }
      const media = dependencies.media ?? null, links = new Map<string, string>();
      if (media !== null && typeof media.resolveAvailableThumbnails === "function" && snapshot.images.length) {
        let origin: URL; try { origin = new URL(media.deliveryOrigin); } catch { throw Error("Invalid controlled media origin"); }
        requireDomain(origin.protocol === "https:" && origin.origin === media.deliveryOrigin && !origin.username && !origin.password, "INVALID_DATABASE_VALUE", "Invalid controlled media origin");
        const resolved = await media.resolveAvailableThumbnails({ actor, grant: { productId: parameters.productId }, productId: parameters.productId, images: snapshot.images, signal }); activeProductRead(signal);
        requireDomain(Array.isArray(resolved) && resolved.length <= snapshot.images.length, "INVALID_DATABASE_VALUE", "Invalid controlled thumbnail batch");
        for (const entry of resolved) {
          const image = snapshot.images.find(i => i.id === entry.imageId); let url: URL; try { url = new URL(entry.url); } catch { throw Error("Invalid controlled thumbnail link"); }
          requireDomain(image && !links.has(entry.imageId) && entry.variant === "thumbnail" && url.origin === origin.origin && url.protocol === "https:"
            && !url.username && !url.password && !url.search && !url.hash && url.href === entry.url
            && url.pathname.endsWith(`/products/media/${parameters.productId}/${entry.imageId}/${url.pathname.split("/").at(-2)}/thumbnail`)
            && /^[a-f0-9]{64}$/.test(url.pathname.split("/").at(-2) ?? "") && !entry.url.includes(image.fileRef), "INVALID_DATABASE_VALUE", "Unsafe controlled thumbnail link");
          links.set(entry.imageId, entry.url);
        }
      }
      return { productId: parameters.productId, version, images: snapshot.images.map(image => ({ id: image.id, version: image.version, role: image.role,
        colorId: image.colorId, displayOrder: image.displayOrder, mime: image.mime, byteSize: image.byteSize.toString(), createdAt: image.createdAt,
        createdByAccountId: image.createdByAccountId, thumbnailUrl: links.get(image.id) ?? null, thumbnailState: links.has(image.id) ? "READY" : "UNAVAILABLE" })) };
    },
    async candidates(actorInput: ActorContext, input: unknown) {
      const actor = checkedProductActor(actorInput), query = parseProductMaintenanceCandidates(input);
      return dependencies.unitOfWork.transaction(async tx => {
        await authorizeProductMaintenance(tx.evidence, actor, "CANDIDATES"); return tx.readCandidates(query);
      });
    },
    detail: (actor: ActorContext, input: unknown): Promise<ProductMaintenanceDetail> => detail(actor, input, 1) as Promise<ProductMaintenanceDetail>,
    detailV2: (actor: ActorContext, input: unknown): Promise<ProductMaintenanceDetailV2> => detail(actor, input, 2) as Promise<ProductMaintenanceDetailV2>,
    execute: (actor: ActorContext, input: unknown) => execute(actor, input, 1),
    executeV2: (actor: ActorContext, input: unknown, signal?: AbortSignal) => execute(actor, input, 2, signal),
    async receipt(actorInput: ActorContext, requestKeyInput: string) {
      const actor = checkedProductActor(actorInput), key = partyRequestKey(requestKeyInput);
      return dependencies.unitOfWork.transaction(async tx => {
        await authorizeProductMaintenance(tx.evidence, actor, "RECEIPT"); const receipt = await tx.evidence.getReceipt(actor.accountId, key, "PRODUCT");
        requireDomain(receipt, "RECEIPT_NOT_FOUND", "Original receipt is unavailable");
        requireDomain(["CREATE", "EDIT", "DISABLE", "RESTORE", "DELETE"].includes(receipt.action), "INVALID_DATABASE_VALUE", "Invalid product receipt action");
        await authorizeProductMaintenance(tx.evidence, actor, receipt.action as ProductMaintenanceAction);
        return { requestKey: key, action: receipt.action, status: "COMMITTED" as const, completedAt: receipt.completedAt, result: result(receipt.result) };
      });
    }
  });
}
