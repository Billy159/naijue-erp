import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { checkedProductActor, parseProductQuery, activeProductRead } from "./product-query-validation.ts";
import { partyRequestKey } from "./party-maintenance-validation.ts";
import { parseProductMaintenanceCandidates, parseProductMaintenanceCommand, parseProductMaintenanceCommandV2, productMaintenanceVersion, PRODUCT_MAINTENANCE_MAX_BARCODES, PRODUCT_MAINTENANCE_MAX_SKUS } from "./product-maintenance-validation.ts";
import { authorizeProductMaintenance } from "./product-maintenance-authorization.ts";
import { requestHash } from "./request-hash.ts";
import type { ActorContext } from "./ports.ts";
import type { ProductAggregate, ProductAuditObject, ProductBarcodeRecord, ProductMaintenanceAction, ProductMaintenanceDependencies, ProductMaintenanceDetail, ProductMaintenanceDetailV2, ProductMaintenanceResult, ProductSkuRecord, ProductStoredRecord, ProductMaintenanceImagesDto } from "./product-maintenance-ports.ts";

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
function barcodeFacts(b: ProductBarcodeRecord): ProductAuditObject { return { id: b.id, barcode: b.barcode, sku_id: b.skuId, barcode_kind: b.kind, scheme_id: b.schemeId, enabled: b.enabled }; }
const different = (a: unknown, b: unknown) => requestHash(a) !== requestHash(b);
function result(value: { readonly operationId: string; readonly kind: string; readonly targetId: string; readonly version: number }): ProductMaintenanceResult {
  requireDomain(value.kind === "PRODUCT", "INVALID_DATABASE_VALUE", "Invalid product receipt kind");
  return { operationId: entityId("operation", value.operationId), kind: "PRODUCT", targetId: entityId("product", value.targetId), version: productMaintenanceVersion(value.version) };
}
/** Actual aggregate rules; persistence/evidence use one explicitly supplied D1 transaction. */
export function createProductMaintenanceService(dependencies: ProductMaintenanceDependencies) {
  if (typeof dependencies?.unitOfWork?.transaction !== "function" || typeof dependencies?.now !== "function" || typeof dependencies?.newId !== "function")
    throw new TypeError("Product maintenance requires an explicit transaction, clock and identifiers");
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
  async function execute(actorInput: ActorContext, input: unknown, contractVersion: 1 | 2): Promise<ProductMaintenanceResult> {
    const actor = checkedProductActor(actorInput), command = contractVersion === 2 ? parseProductMaintenanceCommandV2(input) : parseProductMaintenanceCommand(input);
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
        requireDomain(!previous || previous.product.productCode === command.values.productCode, "IMMUTABLE_PRODUCT_CODE", "Existing product code is read-only");
        if ("seasonIds" in command.values) {
          requireDomain(!previous || Object.hasOwn(previous.product, "seasonIds"), "INVALID_DATABASE_VALUE", "Actual season array is unavailable");
          requireDomain(command.values.seasonIds !== null || previous?.product.seasonIds === null, "PRODUCT_SEASON_UNKNOWN_RESET", "Known seasons cannot be changed to unknown");
          const seasonIds = previous?.product.seasonIds && command.values.seasonIds
            && !different([...previous.product.seasonIds].sort(), command.values.seasonIds) ? previous.product.seasonIds : command.values.seasonIds;
          nextProduct = { ...command.values, seasonIds, seasonId: previous?.product.seasonId ?? null, id, version: (previous?.product.version ?? 0) + 1, deletedAt: null };
        } else nextProduct = { ...command.values, id, version: (previous?.product.version ?? 0) + 1, deletedAt: null };
        for (const item of command.skus) {
          if (item.id === null) {
            requireDomain(![...skus.values()].some(s => coordinate(s) === coordinate(item)), "PRODUCT_SPEC_CONFLICT", "Existing SKU coordinate cannot be recreated");
            const skuId = entityId("sku", dependencies.newId("sku")); requireDomain(!skus.has(skuId), "PRODUCT_SPEC_CONFLICT", "New SKU id already exists");
            skus.set(skuId, { id: skuId, productId: id, skuCode: item.skuCode, colorId: item.colorId, fitId: item.fitId, sizeId: item.sizeId,
              enabled: item.enabled, version: 1, createdOperationId: operationId });
          } else {
            const old = skus.get(item.id);
            requireDomain(old && old.version === item.expectedVersion, "VERSION_CONFLICT", "SKU version changed");
            requireDomain(coordinate(old) === coordinate(item) && old.skuCode === item.skuCode, "IMMUTABLE_SKU_IDENTITY", "SKU coordinate/code cannot be rewritten");
            if (old.enabled !== item.enabled) { requireDomain(old.version < 2147483647, "VERSION_STORAGE_OVERFLOW", "SKU version exhausted"); skus.set(old.id, { ...old, enabled: item.enabled, version: old.version + 1 }); }
          }
        }
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
      const oldSkus = new Map((previous?.skus ?? []).map(s => [s.id, s])), oldBarcodes = new Map((previous?.barcodes ?? []).map(b => [b.id, b]));
      const changedSkus = next.skus.filter(s => !oldSkus.has(s.id) || different(s, oldSkus.get(s.id)!));
      const changedBarcodes = next.barcodes.filter(b => !oldBarcodes.has(b.id) || different(b, oldBarcodes.get(b.id)!));
      const after: Record<string, ProductAuditObject[string]> = {}, before: Record<string, ProductAuditObject[string]> = {};
      const facts = productFacts(nextProduct), oldFacts = previous ? productFacts(previous.product) : null;
      for (const [key, value] of Object.entries(facts)) if (oldFacts === null || different(value, oldFacts[key]!)) {
        after[key] = value; if (oldFacts !== null) before[key] = oldFacts[key]!;
      }
      requireDomain(previous === undefined || Object.keys(after).some(key => key !== "version") || changedSkus.length > 0 || changedBarcodes.length > 0,
        "NO_PRODUCT_CHANGE", "No actual product changes supplied");
      if (changedSkus.length) { after.skus = changedSkus.map(skuFacts); before.skus = changedSkus.flatMap(s => oldSkus.has(s.id) ? [skuFacts(oldSkus.get(s.id)!)] : []); }
      if (changedBarcodes.length) { after.barcodes = changedBarcodes.map(barcodeFacts); before.barcodes = changedBarcodes.flatMap(b => oldBarcodes.has(b.id) ? [barcodeFacts(oldBarcodes.get(b.id)!)] : []); }
      const completion = { operationId, actorAccountId: actor.accountId, requestKey: command.requestKey, requestHash: hash,
        kind: "PRODUCT" as const, action: command.action, targetId: id, oldVersion: previous?.product.version ?? null, newVersion: nextProduct.version,
        beforeValues: previous ? before : null, afterValues: after, completedAt: timestamp };
      requireDomain(typeof tx.evidence.prepare === "function", "MAINTENANCE_PREPARE_NOT_READY", "Original audit preparation is unavailable");
      await tx.evidence.prepare(completion);
      await tx.putProduct(nextProduct, previous?.product);
      for (const s of changedSkus) await tx.putSku(s, oldSkus.get(s.id));
      for (const b of changedBarcodes) await tx.putBarcode(b, oldBarcodes.get(b.id));
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
    executeV2: (actor: ActorContext, input: unknown) => execute(actor, input, 2),
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
