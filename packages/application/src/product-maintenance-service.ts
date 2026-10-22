import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { checkedProductActor, parseProductQuery } from "./product-query-validation.ts";
import { partyRequestKey } from "./party-maintenance-validation.ts";
import { parseProductMaintenanceCandidates, parseProductMaintenanceCommand, productMaintenanceVersion, PRODUCT_MAINTENANCE_MAX_BARCODES, PRODUCT_MAINTENANCE_MAX_SKUS } from "./product-maintenance-validation.ts";
import { authorizeProductMaintenance } from "./product-maintenance-authorization.ts";
import { requestHash } from "./request-hash.ts";
import type { ActorContext } from "./ports.ts";
import type { ProductAggregate, ProductAuditObject, ProductBarcodeRecord, ProductMaintenanceAction, ProductMaintenanceDependencies, ProductMaintenanceDetail, ProductMaintenanceResult, ProductSkuRecord, ProductStoredRecord } from "./product-maintenance-ports.ts";

const coordinate = (row: { readonly colorId: string; readonly fitId: string; readonly sizeId: string }) => JSON.stringify([row.colorId, row.fitId, row.sizeId]);
function productFacts(p: ProductStoredRecord): ProductAuditObject {
  return { id: p.id, product_code: p.productCode, name: p.name, category_id: p.categoryId, supplier_id: p.supplierId, season_id: p.seasonId,
    size_group_id: p.sizeGroupId, year: p.year, system_item_code: p.systemItemCode, thickness: p.thickness, collar_pants_type: p.collarPantsType,
    default_barcode_scheme_id: p.defaultBarcodeSchemeId, enabled: p.enabled, deleted_at: p.deletedAt, version: p.version, ...p.prices };
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
  return Object.freeze({
    async candidates(actorInput: ActorContext, input: unknown) {
      const actor = checkedProductActor(actorInput), query = parseProductMaintenanceCandidates(input);
      return dependencies.unitOfWork.transaction(async tx => {
        await authorizeProductMaintenance(tx.evidence, actor, "CANDIDATES"); return tx.readCandidates(query);
      });
    },
    async detail(actorInput: ActorContext, input: unknown): Promise<ProductMaintenanceDetail> {
      const actor = checkedProductActor(actorInput), { productId } = parseProductQuery(input);
      return dependencies.unitOfWork.transaction(async tx => {
        await authorizeProductMaintenance(tx.evidence, actor, "DETAIL"); const aggregate = await tx.load(productId);
        requireDomain(aggregate, "PRODUCT_NOT_FOUND", "Product is unavailable"); const p = aggregate.product;
        const skus = new Map(aggregate.skus.map(s => [s.id, s]));
        const references = await tx.readReferences(p);
        requireDomain(references.categoryPath.length > 0 && references.categoryPath.at(-1)!.id === p.categoryId && references.sizeGroup.id === p.sizeGroupId
          && (references.supplier?.id ?? null) === p.supplierId && (references.season?.id ?? null) === p.seasonId
          && (references.defaultBarcodeScheme?.id ?? null) === p.defaultBarcodeSchemeId, "INVALID_DATABASE_VALUE", "Maintenance references differ from actual foreign keys");
        return { productId, version: p.version, deletedAt: p.deletedAt, references,
          values: { productCode: p.productCode, name: p.name, categoryId: p.categoryId, supplierId: p.supplierId, seasonId: p.seasonId, sizeGroupId: p.sizeGroupId,
            year: p.year, systemItemCode: p.systemItemCode, thickness: p.thickness, collarPantsType: p.collarPantsType, defaultBarcodeSchemeId: p.defaultBarcodeSchemeId, enabled: p.enabled, prices: p.prices },
          skus: aggregate.skus.map(s => ({ id: s.id, expectedVersion: s.version, skuCode: s.skuCode, colorId: s.colorId, fitId: s.fitId, sizeId: s.sizeId, enabled: s.enabled })),
          barcodes: aggregate.barcodes.map(b => {
            const s = skus.get(b.skuId); requireDomain(s, "INVALID_DATABASE_VALUE", "Barcode has no actual SKU");
            return { id: b.id, barcode: b.barcode, colorId: s.colorId, fitId: s.fitId, sizeId: s.sizeId, kind: b.kind, schemeId: b.schemeId, enabled: b.enabled };
          }) };
      });
    },
    async execute(actorInput: ActorContext, input: unknown): Promise<ProductMaintenanceResult> {
      const actor = checkedProductActor(actorInput), command = parseProductMaintenanceCommand(input);
      const hash = requestHash({ kind: "PRODUCT", actorAccountId: actor.accountId, command });
      return dependencies.unitOfWork.transaction(async tx => {
        await authorizeProductMaintenance(tx.evidence, actor, command.action);
        const receipt = await tx.evidence.getReceipt(actor.accountId, command.requestKey, "PRODUCT");
        if (receipt) {
          requireDomain(receipt.requestHash === hash && receipt.action === command.action, "IDEMPOTENCY_CONFLICT", "Original product key has different content");
          await authorizeProductMaintenance(tx.evidence, actor, command.action); return result(receipt.result);
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
          requireDomain(!previous || previous.product.productCode === command.values.productCode, "IMMUTABLE_PRODUCT_CODE", "Existing product code is read-only");
          nextProduct = { ...command.values, id, version: (previous?.product.version ?? 0) + 1, deletedAt: null };
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
    },
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
