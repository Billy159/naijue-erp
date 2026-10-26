import { COMPLETE_SCOPE_DECISION } from "../../../packages/application/src/inventory-cutoff-import.ts";
import { requestHash } from "../../../packages/application/src/request-hash.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { CATALOGUE_PRICE_KEYS } from "../../../packages/application/src/catalogue-price-input.ts";
import type { CataloguePriceKey } from "../../../packages/application/src/catalogue-price-input.ts";
import type { ProductAggregate, ProductBarcodeRecord, ProductDetailReferences, ProductMaintenanceCandidate, ProductMaintenanceCandidatePage, ProductMaintenanceCandidateQuery, ProductMaintenanceEvidence, ProductMaintenanceTransaction, ProductMaintenanceUnitOfWork, ProductSkuRecord, ProductStoredRecord } from "../../../packages/application/src/product-maintenance-ports.ts";
import { parseProductMaintenanceCandidates, parseProductSeasonIds, PRODUCT_MAINTENANCE_MAX_BARCODES, PRODUCT_MAINTENANCE_MAX_SKUS, planProductImageWrites } from "../../../packages/application/src/product-maintenance-validation.ts";
import { productSeasonArrayEnabled, type ProductSeasonArrayCapability, type PgProductQueryResult } from "./product-query-reader.ts";
import type { MaintenancePgUnitOfWork } from "./maintenance-command-unit-of-work.ts";
import type { ProductMaintenanceImageSnapshot, ProductMaintenanceImageMetadata, ProductSkuSelection } from "../../../packages/application/src/product-maintenance-ports.ts";
import { booleanValue, integerValue, nullableString, stringValue, versionFromSql } from "./codec.ts";

export interface PgProductMaintenanceContext {
  readonly client: { query(sql: string, values?: unknown[]): Promise<PgProductQueryResult> };
  readonly evidence: ProductMaintenanceEvidence;
}
/** D1's central transaction driver supplies this structure. No local pool/BEGIN/receipt writer. */
export interface PgProductMaintenanceDriver { transaction<T>(work: (context: PgProductMaintenanceContext) => Promise<T>): Promise<T> }
/** D1-issued proof of actual image schema/guards/ACL and original same-client prepared closure. */
export interface ProductMediaWriteCapability {
  readonly profile: "product-media-write-v22";
  readonly assertVerified: (driver: object) => void;
  readonly assertReady: (context: PgProductMaintenanceContext) => Promise<void>;
  readonly assertPrepared: (context: PgProductMaintenanceContext, completion: Parameters<ProductMaintenanceEvidence["complete"]>[0]) => Promise<void>;
}
/** Independent v4 approval/actual guard proof. An ordinary image/schema capability cannot enable it. */
export interface ProductImageColorSwapCapability {
  readonly profile: "product-image-color-swap-v4";
  readonly assertVerified: (driver: object) => void;
  readonly assertReady: (context: PgProductMaintenanceContext, completion: Parameters<ProductMaintenanceEvidence["complete"]>[0]) => Promise<void>;
}
function colorSwapCapability(driver: object, proof: ProductImageColorSwapCapability | null): ProductImageColorSwapCapability | null {
  if (proof === null) return null;
  if (typeof proof !== "object" || Array.isArray(proof) || Object.getPrototypeOf(proof) !== Object.prototype || Reflect.ownKeys(proof).length !== 3) throw TypeError("Explicit actual color-swap guard capability required");
  for (const key of ["profile", "assertVerified", "assertReady"]) if (!Object.getOwnPropertyDescriptor(proof, key) || !("value" in Object.getOwnPropertyDescriptor(proof, key)!)) throw TypeError("Color-swap proof requires own data properties");
  if (proof.profile !== "product-image-color-swap-v4" || typeof proof.assertVerified !== "function" || typeof proof.assertReady !== "function" || Object.prototype.toString.call(proof.assertVerified) === "[object AsyncFunction]") throw TypeError("Actual approved color-swap proof required");
  const result: unknown = proof.assertVerified(driver);
  if (result !== undefined) { if (result instanceof Promise) void result.catch(() => {}); throw TypeError("Color-swap startup proof must already be verified"); }
  return Object.freeze({ profile: proof.profile, assertVerified: proof.assertVerified, assertReady: proof.assertReady });
}
function mediaCapability(driver: object, proof: ProductMediaWriteCapability | null): ProductMediaWriteCapability | null {
  if (proof === null) return null;
  if (typeof proof !== "object" || Array.isArray(proof) || Object.getPrototypeOf(proof) !== Object.prototype || Reflect.ownKeys(proof).length !== 4) throw TypeError("Explicit verified image-write capability required");
  for (const key of ["profile", "assertVerified", "assertReady", "assertPrepared"]) if (!Object.getOwnPropertyDescriptor(proof, key) || !("value" in Object.getOwnPropertyDescriptor(proof, key)!)) throw TypeError("Image proof requires own data properties");
  if (proof.profile !== "product-media-write-v22" || typeof proof.assertVerified !== "function" || typeof proof.assertReady !== "function" || typeof proof.assertPrepared !== "function"
    || Object.prototype.toString.call(proof.assertVerified) === "[object AsyncFunction]") throw TypeError("Actual image-write proof required");
  const result: unknown = proof.assertVerified(driver);
  if (result !== undefined) { if (result instanceof Promise) void result.catch(() => {}); throw TypeError("Image startup proof must already be verified"); }
  return Object.freeze({ profile: proof.profile, assertVerified: proof.assertVerified, assertReady: proof.assertReady, assertPrepared: proof.assertPrepared });
}
type SharedDriverCompatibility = MaintenancePgUnitOfWork extends PgProductMaintenanceDriver ? true : never;
const sharedDriverCompatible: SharedDriverCompatibility = true; void sharedDriverCompatible;
export interface ProductDeletionGuard { assertCanDelete(context: PgProductMaintenanceContext, product: ProductAggregate): Promise<void> }
const uuid = (value: unknown): string => entityId("product", stringValue(value));
function imageFingerprint(i: ProductMaintenanceImageMetadata): string {
  const milliseconds = Date.parse(i.createdAt), fraction = i.createdAt.match(/\.(\d{1,6})(?:Z|[+-]\d\d:\d\d)$/)?.[1] ?? "";
  requireDomain(Number.isFinite(milliseconds), "INVALID_DATABASE_VALUE", "Actual image creation time required");
  // PostgreSQL emits six fractional digits; preserve microseconds while comparing equivalent ISO encodings.
  const micros = BigInt(milliseconds) * 1000n + BigInt(fraction.padEnd(6, "0").slice(3));
  return requestHash({ ...i, createdAt: micros.toString(), byteSize: i.byteSize.toString() });
}
function storedPrice(value: unknown): string | null {
  if (value === null) return null;
  requireDomain(typeof value === "string" && /^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(value), "INVALID_DATABASE_VALUE", "Invalid stored product price"); return value;
}
function storedSeasons(input: unknown): readonly string[] | null {
  try { parseProductSeasonIds(input); } catch { requireDomain(false, "INVALID_DATABASE_VALUE", "Invalid stored season array"); }
  return input === null ? null : Object.freeze([...(input as string[])]);
}
function productRow(r: Record<string, unknown>, seasonArray: boolean): ProductStoredRecord {
  const prices = {} as Record<CataloguePriceKey, string | null>; for (const k of CATALOGUE_PRICE_KEYS) prices[k] = storedPrice(r[k]);
  return { id: uuid(r.id), productCode: stringValue(r.product_code), name: stringValue(r.name), categoryId: uuid(r.category_id),
    supplierId: r.supplier_id === null ? null : uuid(r.supplier_id), seasonId: r.season_id === null ? null : uuid(r.season_id), sizeGroupId: uuid(r.size_group_id),
    year: r.year === null ? null : integerValue(r.year), systemItemCode: nullableString(r.system_item_code), thickness: nullableString(r.thickness),
    collarPantsType: nullableString(r.collar_pants_type), defaultBarcodeSchemeId: r.default_barcode_scheme_id === null ? null : uuid(r.default_barcode_scheme_id),
    enabled: booleanValue(r.enabled), version: versionFromSql(r.version), deletedAt: nullableString(r.deleted_at), prices, ...(seasonArray ? { seasonIds: storedSeasons(r.season_ids) } : {}) };
}
function skuRow(r: Record<string, unknown>): ProductSkuRecord {
  return { id: uuid(r.id), productId: uuid(r.product_id), skuCode: stringValue(r.sku_code), colorId: uuid(r.color_id), fitId: uuid(r.fit_id), sizeId: uuid(r.size_id),
    enabled: booleanValue(r.enabled), version: versionFromSql(r.version), createdOperationId: r.created_operation_id === null ? null : uuid(r.created_operation_id) };
}
function barcodeRow(r: Record<string, unknown>): ProductBarcodeRecord {
  requireDomain(r.barcode_kind === "MAIN" || r.barcode_kind === "CONFIRMED_OLD", "INVALID_DATABASE_VALUE", "Invalid barcode kind");
  return { id: uuid(r.id), barcode: stringValue(r.barcode), skuId: uuid(r.sku_id), kind: r.barcode_kind,
    schemeId: r.scheme_id === null ? null : uuid(r.scheme_id), enabled: booleanValue(r.enabled) };
}
const ROOT_COLUMNS = ["id", "product_code", "name", "category_id", "supplier_id", "season_id", "size_group_id", "year", "system_item_code", "thickness", "collar_pants_type", "default_barcode_scheme_id", "enabled", "version", "deleted_at", ...CATALOGUE_PRICE_KEYS] as const;
function rootValues(p: ProductStoredRecord): unknown[] {
  return [p.id, p.productCode, p.name, p.categoryId, p.supplierId, p.seasonId, p.sizeGroupId, p.year, p.systemItemCode, p.thickness,
    p.collarPantsType, p.defaultBarcodeSchemeId, p.enabled, p.version, p.deletedAt, ...CATALOGUE_PRICE_KEYS.map(k => p.prices[k])];
}

/** Same full publication certificate as maintained-catalogue26. Source presence,
 * a STAGE receipt, and created_operation_id alone never grant child visibility.
 * Predicates run before the original LIMIT/row locks, on the borrowed client. */
const committedBefore = (alias: string): string => `(pg_current_xact_id_if_assigned() IS NULL OR age(${alias}.xmin)>age(pg_current_xact_id_if_assigned()::xid))`;
const fullPublication = `b.mapping_version='V2_HISTORY_NULLABLE_1' AND b.status='IMPORTED'
 AND b.history_validation_passed IS TRUE AND b.history_actual_counts=b.history_expected_counts
 AND b.checkpoint->'counts'=b.checkpoint->'expected' AND b.checkpoint->'counts'->>'IMPORT_BATCH'='1'
 AND b.completed_at IS NOT NULL AND m.validator_version='HISTORY_TYPED_CLOSURE_V1'
 AND m.selection_sha256=b.source_hash AND m.authorized_payload_hash=b.history_payload_hash AND m.expected_counts=b.history_expected_counts
 AND m.document_count=(SELECT count(*) FROM naijue_erp.import_history_document_manifest md WHERE md.batch_id=b.id)
 AND ${committedBefore("b")} AND ${committedBefore("s")} AND ${committedBefore("m")}
 AND EXISTS(SELECT 1 FROM naijue_erp.import_record f
 JOIN naijue_erp.import_record_accounting_claim c ON c.import_batch_id=f.import_batch_id AND c.import_record_id=f.id AND c.target_type=f.target_type AND c.target_id=f.target_id
 JOIN naijue_erp.operation_receipt r ON r.id=c.operation_id JOIN naijue_erp.audit_change a ON a.operation_id=r.id
 WHERE f.import_batch_id=b.id AND f.target_type='IMPORT_BATCH' AND f.target_id=b.id AND f.status='IMPORTED'
 AND f.source_entity_type='INVENTORY_SCOPE_APPROVAL' AND f.source_key='FINAL_COMPLETE_SCOPE'
 AND f.source_record_hash=b.source_hash AND f.source_file_ref=b.source_manifest_ref AND f.decision_reason=$3::text
 AND c.checkpoint_sequence=(b.checkpoint->>'sequence')::integer AND r.target_type='IMPORT' AND r.target_id=b.id
 AND r.action='IMPORT_PUBLISH' AND r.status='COMMITTED' AND r.result_data->>'status'='IMPORTED' AND r.result_data->>'batchId'=b.id::text
 AND r.result_data->>'sequence'=b.checkpoint->>'sequence' AND r.result_data->>'cursor'=b.checkpoint->>'cursor'
 AND a.object_type='IMPORT' AND a.object_id=b.id AND a.action=r.action AND a.actor_account_id=r.actor_account_id
 AND a.occurred_at=r.completed_at AND ${committedBefore("r")} AND ${committedBefore("a")} AND ${committedBefore("f")} AND ${committedBefore("c")})`;
function publishedChild(binding: string): string {
  return `EXISTS(SELECT 1 FROM naijue_erp.import_source_row s
    JOIN naijue_erp.import_batch b ON b.id=s.batch_id
    JOIN naijue_erp.import_history_closure_manifest m ON m.batch_id=b.id
    WHERE ${binding} AND (${fullPublication}))`;
}
const visibleSku = `(${committedBefore("sku")} AND (
  (sku.created_operation_id IS NULL AND ${publishedChild(`s.entity_type='SKU'
    AND s.field_provenance->'native_sku_import'->>'native_sku_id'=sku.id::text
    AND s.field_provenance->'native_sku_import'->'native_sku'->>'product_id'=sku.product_id::text
    AND EXISTS(SELECT 1 FROM naijue_erp.import_sku_alias x JOIN naijue_erp.import_record f
      ON f.import_batch_id=x.batch_id AND f.source_entity_type='SKU' AND f.source_key=x.canonical_source_key
      AND f.target_type='SKU' AND f.target_id=x.canonical_sku_id AND f.status='IMPORTED'
      WHERE x.batch_id=s.batch_id AND x.source_row_id=s.id AND x.canonical_sku_id=sku.id)`)})
  OR (sku.created_operation_id IS NOT NULL AND naijue_erp.native_creation_operation_valid('SKU',sku.id,sku.created_operation_id)
    AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id
      WHERE r.id=sku.created_operation_id AND ${committedBefore("r")} AND ${committedBefore("a")}))))`;
const visibleBarcode = `(${committedBefore("bc")} AND (
  ${publishedChild(`s.entity_type='BARCODE' AND s.field_provenance->>'native_sku_id'=bc.sku_id::text
    AND s.field_provenance->>'native_barcode'=bc.barcode
    AND s.field_provenance->'native_barcode_import'->'native_barcode'->>'id'=bc.id::text`)}
  OR EXISTS(SELECT 1 FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id
    WHERE a.object_type='PRODUCT' AND a.object_id=$1::uuid AND a.action IN ('CREATE','EDIT')
      AND r.target_type=a.object_type AND r.target_id=a.object_id AND r.action=a.action AND r.status='COMMITTED'
      AND r.actor_account_id=a.actor_account_id AND r.completed_at=a.occurred_at
      AND r.result_data->>'operationId'=r.id::text AND r.result_data->>'kind'='PRODUCT'
      AND r.result_data->>'targetId'=$1::text AND r.result_data->>'version'=a.new_version::text
      AND ${committedBefore("r")} AND ${committedBefore("a")}
      AND NOT coalesce(a.before_values->'barcodes','[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id',bc.id::text))
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(a.after_values->'barcodes') item
        WHERE item-'enabled'=to_jsonb(bc)-'enabled'))))`;

export class PostgresProductMaintenanceUnitOfWork implements ProductMaintenanceUnitOfWork {
  readonly seasonContract?: "product-season-array-v1";
  private readonly driver: PgProductMaintenanceDriver; private readonly deletion: ProductDeletionGuard | null;
  private readonly imageCapability: ProductMediaWriteCapability | null;
  private readonly swapCapability: ProductImageColorSwapCapability | null;
  constructor(driver: PgProductMaintenanceDriver, options: { readonly deletionGuard: ProductDeletionGuard | null; readonly seasonCapability?: ProductSeasonArrayCapability | null; readonly mediaWriteCapability?: ProductMediaWriteCapability | null; readonly imageColorSwapCapability?: ProductImageColorSwapCapability | null }) {
    if (typeof driver?.transaction !== "function" || !options || !Object.hasOwn(options, "deletionGuard")
      || (options.deletionGuard !== null && typeof options.deletionGuard?.assertCanDelete !== "function")) throw new TypeError("Product maintenance requires D1 driver and explicit deletion guard availability");
    this.driver = driver; this.deletion = options.deletionGuard;
    this.imageCapability = mediaCapability(driver, options.mediaWriteCapability ?? null);
    this.swapCapability = colorSwapCapability(driver, options.imageColorSwapCapability ?? null);
    if (productSeasonArrayEnabled(driver, options.seasonCapability ?? null)) this.seasonContract = "product-season-array-v1";
  }
  transaction<T>(work: (tx: ProductMaintenanceTransaction) => Promise<T>): Promise<T> {
    return this.driver.transaction(async context => {
      const tx = new ProductTransaction(context, this.deletion, this.seasonContract !== undefined, this.imageCapability, this.swapCapability);
      try { return await work(tx); } finally { tx.close(); }
    });
  }
}
/** Internal borrowed scope. The caller owns actual runtime/evidence authority and
 * the surrounding transaction; closing this leaf never releases or commits it. */
export async function withProductMaintenanceTransaction<T>(context: PgProductMaintenanceContext,
  work: (tx: ProductMaintenanceTransaction) => Promise<T>, options: { readonly seasonArray: boolean }): Promise<T> {
  if (typeof context?.client?.query !== "function" || typeof context?.evidence?.assertAllowed !== "function"
    || typeof work !== "function" || typeof options?.seasonArray !== "boolean") throw new TypeError("Original borrowed product context and explicit season contract required");
  const tx = new ProductTransaction(context, null, options.seasonArray, null, null);
  try { return await work(tx); } finally { tx.close(); }
}
class ProductTransaction implements ProductMaintenanceTransaction {
  readonly evidence: ProductMaintenanceEvidence; private active = true; private loadedId: string | undefined;
  private readonly seasonArray: boolean;
  private readonly context: PgProductMaintenanceContext; private readonly deletion: ProductDeletionGuard | null;
  private readonly imageCapability: ProductMediaWriteCapability | null; private imagesReady = false;
  private loadedImages: readonly ProductMaintenanceImageMetadata[] | undefined;
  private imagesWritten = false;
  private imagesPrepared = false;
  private preparedImagesHash: string | undefined; private swapReady = false;
  private readonly swapCapability: ProductImageColorSwapCapability | null;
  constructor(context: PgProductMaintenanceContext, deletion: ProductDeletionGuard | null, seasonArray: boolean, imageCapability: ProductMediaWriteCapability | null, swapCapability: ProductImageColorSwapCapability | null) { this.seasonArray = seasonArray; this.context = context; this.evidence = context.evidence; this.deletion = deletion; this.imageCapability = imageCapability; this.swapCapability = swapCapability; }
  close(): void { this.active = false; }
  private query(sql: string, values: unknown[] = []) { requireDomain(this.active, "TRANSACTION_CLOSED", "Product transaction is closed"); return this.context.client.query(sql, values); }
  async assertImageWriteReady(): Promise<void> {
    requireDomain(this.active && this.imageCapability !== null && typeof this.evidence.prepare === "function", "PRODUCT_MEDIA_NOT_READY", "Verified prepared image-write capability unavailable");
    if (this.imagesReady) return;
    const proof: unknown = this.imageCapability.assertReady(this.context);
    requireDomain(proof instanceof Promise, "PRODUCT_MEDIA_NOT_READY", "Same-client asynchronous image proof required");
    const result: unknown = await proof; requireDomain(this.active && result === undefined, "PRODUCT_MEDIA_NOT_READY", "Same-client image proof failed"); this.imagesReady = true;
  }
  async assertImagesPrepared(completion: Parameters<ProductMaintenanceEvidence["complete"]>[0]): Promise<void> {
    requireDomain(this.active && this.imagesReady && !this.imagesPrepared && this.imageCapability !== null, "PRODUCT_MEDIA_NOT_READY", "Original image preflight context required");
    const proof: unknown = this.imageCapability.assertPrepared(this.context, completion);
    requireDomain(proof instanceof Promise, "PRODUCT_MEDIA_NOT_READY", "Actual same-client prepared proof required");
    const result: unknown = await proof;
    requireDomain(this.active && result === undefined, "PRODUCT_MEDIA_NOT_READY", "Actual prepared image proof failed"); this.imagesPrepared = true; this.preparedImagesHash = requestHash(completion);
  }
  async assertImageColorSwapReady(completion: Parameters<ProductMaintenanceEvidence["complete"]>[0]): Promise<void> {
    requireDomain(this.active && this.imagesPrepared && !this.swapReady && this.swapCapability !== null && this.preparedImagesHash === requestHash(completion), "PRODUCT_MEDIA_NOT_READY", "Actual prepared context and approved color-swap guard required");
    const proof: unknown = this.swapCapability.assertReady(this.context, completion);
    requireDomain(proof instanceof Promise, "PRODUCT_MEDIA_NOT_READY", "Same-client color-swap proof required");
    const result: unknown = await proof; requireDomain(this.active && result === undefined, "PRODUCT_MEDIA_NOT_READY", "Actual color-swap guard proof failed"); this.swapReady = true;
  }
  async loadImages(productId: string): Promise<readonly ProductMaintenanceImageMetadata[]> {
    requireDomain(this.imagesReady && productId === this.loadedId && this.loadedImages === undefined, "TRANSACTION_SCOPE", "Load images once under the original product lock");
    const rows = (await this.query(`/* product-maintenance:locked-images */ SELECT id,product_id,file_ref,mime,byte_size::text AS byte_size,display_order,version,image_role,color_id,
      to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,created_by_account_id
      FROM naijue_erp.product_image WHERE product_id=$1::uuid ORDER BY id LIMIT 1001 FOR UPDATE`, [productId])).rows;
    requireDomain(rows.length <= 1000, "PRODUCT_MAINTENANCE_TOO_LARGE", "Actual image edit bound exceeded");
    const images = rows.map(r => {
      const role = r.image_role, colorId = r.color_id === null ? null : uuid(r.color_id), mime = stringValue(r.mime), size = stringValue(r.byte_size), order = integerValue(r.display_order), createdAt = stringValue(r.created_at);
      requireDomain(uuid(r.product_id) === productId && (role === null || ["MAIN", "WHITE_BACKGROUND", "HANG_TAG", "DETAIL", "COLOR"].includes(role as string)) && (role === "COLOR") === (colorId !== null)
        && ["image/png", "image/jpeg", "image/webp"].includes(mime) && /^[1-9]\d{0,6}$/.test(size) && BigInt(size) <= 8388608n && order >= -2147483648 && order <= 2147483647
        && /(?:Z|[+-]\d\d:\d\d)$/.test(createdAt) && Number.isFinite(Date.parse(createdAt)), "INVALID_DATABASE_VALUE", "Invalid actual image row");
      return Object.freeze({ id: uuid(r.id), productId, fileRef: stringValue(r.file_ref), mime: mime as ProductMaintenanceImageMetadata["mime"], byteSize: BigInt(size), displayOrder: order,
        version: versionFromSql(r.version), role: role as ProductMaintenanceImageMetadata["role"], colorId, createdAt, createdByAccountId: r.created_by_account_id === null ? null : uuid(r.created_by_account_id) });
    });
    requireDomain(new Set(images.map(i => i.id)).size === images.length, "INVALID_DATABASE_VALUE", "Duplicate actual image identity"); this.loadedImages = images; return images;
  }
  async writeImages(before: readonly ProductMaintenanceImageMetadata[], after: readonly ProductMaintenanceImageMetadata[]): Promise<void> {
    requireDomain(this.imagesReady && this.imagesPrepared && this.loadedImages !== undefined && !this.imagesWritten, "TRANSACTION_SCOPE", "Verified prepared and locked image snapshot required"); this.imagesWritten = true;
    const expectedFinal = new Map(this.loadedImages.map(i => [i.id, i]));
    const old = new Map(before.map(i => [i.id, i])), following = new Map(after.map(i => [i.id, i]));
    requireDomain(old.size === before.length && following.size === after.length && before.every(i => this.loadedImages!.some(actual => actual.id === i.id && imageFingerprint(actual) === imageFingerprint(i))), "TRANSACTION_SCOPE", "Image before facts differ from locked rows");
    const plan = planProductImageWrites(before, after), reinsert = new Set(plan.reinsertIds);
    requireDomain(reinsert.size === 0 || this.swapReady, "PRODUCT_MEDIA_NOT_READY", "Cycle writes require the actual approved guard");
    try {
      for (const i of before) if (!following.has(i.id) || reinsert.has(i.id)) { const result = await this.query("DELETE FROM naijue_erp.product_image WHERE id=$1::uuid AND product_id=$2::uuid AND version=$3", [i.id, this.loadedId, i.version]); requireDomain(result.rowCount === 1, "VERSION_CONFLICT", "Image removal did not match original version"); }
      for (const i of plan.ordered) {
        const previous = old.get(i.id);
        requireDomain(i.productId === this.loadedId && i.version === (previous?.version ?? 0) + 1 && (!previous || i.createdAt === previous.createdAt && i.createdByAccountId === previous.createdByAccountId), "TRANSACTION_SCOPE", "Image identity/version/provenance changed");
        const values = [i.id, i.productId, i.fileRef, i.mime, i.byteSize.toString(), i.displayOrder, i.createdAt, i.createdByAccountId, i.version, i.role, i.colorId];
        const result = previous && !reinsert.has(i.id) ? await this.query(`UPDATE naijue_erp.product_image SET file_ref=$3,mime=$4,byte_size=$5::bigint,display_order=$6,version=$9,image_role=$10,color_id=$11::uuid
          WHERE id=$1::uuid AND product_id=$2::uuid AND created_at=$7::timestamptz AND created_by_account_id IS NOT DISTINCT FROM $8::uuid AND version=$12`, [...values, previous.version])
          : await this.query("INSERT INTO naijue_erp.product_image(id,product_id,file_ref,mime,byte_size,display_order,created_at,created_by_account_id,version,image_role,color_id) VALUES($1::uuid,$2::uuid,$3,$4,$5::bigint,$6,$7::timestamptz,$8::uuid,$9,$10,$11::uuid)", values);
        requireDomain(result.rowCount === 1, "VERSION_CONFLICT", "Image write did not match original version");
      }
      for (const i of before) expectedFinal.delete(i.id); for (const i of after) expectedFinal.set(i.id, i);
      this.loadedImages = undefined; const actual = await this.loadImages(this.loadedId!);
      requireDomain(actual.length === expectedFinal.size && actual.every(i => {
        const expected = expectedFinal.get(i.id); return expected && imageFingerprint(i) === imageFingerprint(expected);
      }), "INVALID_DATABASE_VALUE", "Actual final image snapshot differs from prepared rows");
    } catch (error) { if ((error as { code?: string }).code === "23505") requireDomain(false, "COLOR_IMAGE_CONFLICT", "Color image already exists"); throw error; }
  }
  async readImageSnapshot(productId: string): Promise<ProductMaintenanceImageSnapshot | null> {
    uuid(productId);
    const rows = (await this.query(`/* product-maintenance:images */ SELECT p.id,p.version,COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.display_order,i.id)
      FROM (SELECT i.id,i.product_id,i.file_ref,i.mime,i.byte_size::text AS byte_size,i.display_order,i.version,i.image_role,i.color_id,
        to_char(i.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,i.created_by_account_id,
        (i.image_role IS DISTINCT FROM 'COLOR' OR EXISTS(SELECT 1 FROM naijue_erp.sku s WHERE s.product_id=p.id AND s.color_id=i.color_id)) AS valid_color
        FROM naijue_erp.product_image i WHERE i.product_id=p.id ORDER BY i.display_order,i.id LIMIT 1001) i),'[]'::jsonb) AS images
      FROM naijue_erp.product p WHERE p.id=$1::uuid AND p.deleted_at IS NULL`, [productId])).rows;
    requireDomain(rows.length <= 1, "INVALID_DATABASE_VALUE", "Unique product metadata required"); if (!rows.length) return null;
    const root = rows[0]!; requireDomain(uuid(root.id) === productId && Array.isArray(root.images) && root.images.length <= 1000, "INVALID_DATABASE_VALUE", "Bounded actual image snapshot required");
    const ids = new Set<string>(), colors = new Set<string>(); let previous: { order: number; id: string } | undefined;
    const images = root.images.map((input): ProductMaintenanceImageMetadata => {
      requireDomain(input && typeof input === "object" && !Array.isArray(input), "INVALID_DATABASE_VALUE", "Actual image metadata required"); const r = input as Record<string, unknown>;
      const id = uuid(r.id), role = r.image_role, colorId = r.color_id === null ? null : uuid(r.color_id), displayOrder = integerValue(r.display_order), mime = stringValue(r.mime), bytes = stringValue(r.byte_size), createdAt = stringValue(r.created_at), fileRef = stringValue(r.file_ref);
      requireDomain(!ids.has(id) && uuid(r.product_id) === productId && fileRef.length > 0 && fileRef.length <= 4096 && !fileRef.includes("\0")
        && (role === null || ["MAIN", "WHITE_BACKGROUND", "HANG_TAG", "DETAIL", "COLOR"].includes(role as string))
        && (role === "COLOR" ? colorId !== null && !colors.has(colorId) && r.valid_color === true : colorId === null)
        && displayOrder >= -2147483648 && displayOrder <= 2147483647 && (!previous || displayOrder > previous.order || displayOrder === previous.order && id > previous.id)
        && ["image/png", "image/jpeg", "image/webp"].includes(mime) && /^[1-9]\d{0,6}$/.test(bytes) && BigInt(bytes) <= 8388608n
        && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(createdAt) && Number.isFinite(Date.parse(createdAt)), "INVALID_DATABASE_VALUE", "Invalid actual image facts");
      ids.add(id); if (colorId !== null) colors.add(colorId); previous = { order: displayOrder, id };
      return { id, productId, fileRef, mime: mime as ProductMaintenanceImageMetadata["mime"], byteSize: BigInt(bytes), displayOrder,
        version: versionFromSql(r.version), role: role as ProductMaintenanceImageMetadata["role"], colorId, createdAt, createdByAccountId: r.created_by_account_id === null ? null : uuid(r.created_by_account_id) };
    });
    return { productId, version: versionFromSql(root.version), images };
  }
  async readReferences(p: ProductStoredRecord): Promise<ProductDetailReferences> {
    requireDomain(p.id === this.loadedId, "TRANSACTION_SCOPE", "Read references for the locked product only");
    const rows = (await this.query(`SELECT su.id AS supplier_id,su.name AS supplier_name,su.enabled AS supplier_enabled,
      se.id AS season_id,se.name AS season_name,g.id AS size_group_id,g.name AS size_group_name,
      b.id AS scheme_id,b.name AS scheme_name,b.rule_version,b.status AS scheme_status
      FROM naijue_erp.product p LEFT JOIN naijue_erp.supplier su ON su.id=p.supplier_id LEFT JOIN naijue_erp.season se ON se.id=p.season_id
      JOIN naijue_erp.size_group g ON g.id=p.size_group_id LEFT JOIN naijue_erp.barcode_scheme b ON b.id=p.default_barcode_scheme_id WHERE p.id=$1::uuid`, [p.id])).rows;
    requireDomain(rows.length === 1, "INVALID_DATABASE_VALUE", "Product references are unavailable"); const r = rows[0]!;
    const path = (await this.query(`WITH RECURSIVE category_path AS (
      SELECT c.id,c.parent_id,c.name,ARRAY[c.id] AS trail,false AS cyclic,0 AS depth FROM naijue_erp.product_category c WHERE c.id=$1::uuid
      UNION ALL SELECT c.id,c.parent_id,c.name,p.trail||c.id,c.id=ANY(p.trail),p.depth+1 FROM category_path p
      JOIN naijue_erp.product_category c ON c.id=p.parent_id WHERE NOT p.cyclic AND p.depth<4999)
      SELECT id,parent_id,name,cyclic FROM category_path ORDER BY depth DESC`, [p.categoryId])).rows;
    requireDomain(path.length > 0 && path.length <= 5000 && path[0]!.parent_id === null && path.every(c => c.cyclic === false), "PRODUCT_REFERENCE_UNAVAILABLE", "Category path is cyclic/incomplete or exceeds technical bound");
    const categoryPath = path.map(c => ({ id: uuid(c.id), name: stringValue(c.name) }));
    const schemeId = nullableString(r.scheme_id);
    requireDomain(schemeId === null || r.scheme_status === "CURRENT" || r.scheme_status === "HISTORICAL", "INVALID_DATABASE_VALUE", "Invalid descriptive scheme status");
    const seasons = this.seasonArray ? (await this.query("SELECT id,name FROM naijue_erp.season WHERE id=ANY($1::uuid[]) ORDER BY display_order,id", [p.seasonIds])).rows.map(s => ({ id: uuid(s.id), name: stringValue(s.name) })) : undefined;
    requireDomain(seasons === undefined || seasons.length === (p.seasonIds?.length ?? 0), "INVALID_DATABASE_VALUE", "Incomplete actual season references");
    return { ...(seasons === undefined ? {} : { seasons }), categoryPath, sizeGroup: { id: uuid(r.size_group_id), name: stringValue(r.size_group_name) },
      supplier: r.supplier_id === null ? null : { id: uuid(r.supplier_id), name: stringValue(r.supplier_name), enabled: booleanValue(r.supplier_enabled) },
      season: r.season_id === null ? null : { id: uuid(r.season_id), name: stringValue(r.season_name) },
      defaultBarcodeScheme: schemeId === null ? null : { id: uuid(schemeId), name: stringValue(r.scheme_name), ruleVersion: stringValue(r.rule_version), status: r.scheme_status as "CURRENT" | "HISTORICAL" } };
  }
  async readCandidates(input: ProductMaintenanceCandidateQuery): Promise<ProductMaintenanceCandidatePage> {
    const q = parseProductMaintenanceCandidates(input);
    const simple = (table: string, where: string, code = "NULL::text", parent = "NULL::text", version = "NULL::integer") => ({ from: `naijue_erp.${table} m`, where, id: "m.id::text", name: "m.name", code, parent, version });
    const distinct = (column: "year" | "thickness" | "collar_pants_type") => ({ from: `(SELECT DISTINCT ${column}::text AS value FROM naijue_erp.product WHERE deleted_at IS NULL AND ${column} IS NOT NULL) m`, where: "true", id: "m.value", name: "m.value", code: "NULL::text", parent: "NULL::text", version: "NULL::integer" });
    // Closed server mapping; neither table names nor expressions are accepted from the HTTP body.
    const definitions = {
      categories: simple("product_category", "m.deleted_at IS NULL", "NULL::text", "m.parent_id::text", "m.version"),
      suppliers: simple("supplier", "m.enabled", "m.code", "NULL::text", "m.version"),
      seasons: simple("season", "true", "m.code"), "size-groups": simple("size_group", "true", "m.code"),
      colors: simple("color", "m.enabled AND m.deleted_at IS NULL", "m.code", "NULL::text", "m.version"),
      fits: simple("fit", "m.enabled AND m.deleted_at IS NULL", "m.code", "NULL::text", "m.version"),
      "barcode-schemes": simple("barcode_scheme", "true"),
      years: { ...distinct("year"), from: `(SELECT year::text AS value FROM (
        SELECT generate_series(2015,EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::integer + 1) AS year
        UNION SELECT year FROM naijue_erp.product WHERE deleted_at IS NULL AND year IS NOT NULL) years) m` },
      thicknesses: distinct("thickness"), "collar-pants-types": distinct("collar_pants_type")
    };
    const d = definitions[q.kind];
    const order = q.kind === "years" ? 'name::integer DESC,id COLLATE "C"' : 'name COLLATE "C",id COLLATE "C"';
    const rows = (await this.query(`WITH matched AS (SELECT ${d.id} AS id,${d.name} AS name,${d.code} AS code,${d.parent} AS parent_id,${d.version} AS version
      FROM ${d.from} WHERE ${d.where} AND (strpos(lower(${d.name}),lower($1::text))>0 OR strpos(lower(COALESCE(${d.code},'')),lower($1::text))>0)),
      page AS (SELECT * FROM matched ORDER BY ${order} LIMIT $2 OFFSET $3)
      SELECT (SELECT count(*)::text FROM matched) AS total,COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY ${order}) FROM page),'[]'::jsonb) AS items`,
    [q.search, q.pageSize, (q.page - 1) * q.pageSize])).rows;
    requireDomain(rows.length === 1 && typeof rows[0]!.total === "string" && /^(?:0|[1-9]\d*)$/.test(rows[0]!.total)
      && BigInt(rows[0]!.total) <= BigInt(Number.MAX_SAFE_INTEGER) && Array.isArray(rows[0]!.items), "INVALID_DATABASE_VALUE", "Invalid maintenance candidate page");
    const total = Number(rows[0]!.total), raw = rows[0]!.items as unknown[];
    requireDomain(raw.length === Math.min(q.pageSize, Math.max(0, total - (q.page - 1) * q.pageSize)), "INVALID_DATABASE_VALUE", "Inconsistent maintenance candidate count");
    const seen = new Set<string>();
    const items = raw.map((value): ProductMaintenanceCandidate => {
      requireDomain(value && typeof value === "object" && !Array.isArray(value), "INVALID_DATABASE_VALUE", "Invalid candidate object"); const r = value as Record<string, unknown>;
      const id = stringValue(r.id), name = stringValue(r.name);
      requireDomain(id.length > 0 && name.length > 0 && !seen.has(id), "INVALID_DATABASE_VALUE", "Invalid duplicate/empty candidate identity"); seen.add(id);
      if (!["years", "thicknesses", "collar-pants-types"].includes(q.kind)) uuid(id);
      return { id, name, code: nullableString(r.code), parentId: r.parent_id === null ? null : uuid(r.parent_id), version: r.version === null ? null : versionFromSql(r.version) };
    });
    return { kind: q.kind, page: q.page, pageSize: q.pageSize, total, items };
  }
  async load(id: string): Promise<ProductAggregate | undefined> {
    entityId("product", id); requireDomain(this.loadedId === undefined, "TRANSACTION_SCOPE", "Load one product aggregate per command"); this.loadedId = id;
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`naijue:product:${id}`]);
    const rows = (await this.query(`SELECT ${[...ROOT_COLUMNS, ...(this.seasonArray ? ["season_ids"] : [])].map(k => CATALOGUE_PRICE_KEYS.includes(k as CataloguePriceKey) ? `${k}::text AS ${k}` : k === "deleted_at" ? `to_char(deleted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS deleted_at` : k).join(", ")}
      FROM naijue_erp.product WHERE id=$1::uuid FOR UPDATE`, [id])).rows;
    requireDomain(rows.length <= 1, "INVALID_DATABASE_VALUE", "Product identity is not unique"); if (!rows[0]) return undefined;
    const p = productRow(rows[0], this.seasonArray); requireDomain(p.id === id, "INVALID_DATABASE_VALUE", "Mismatched product");
    const s = (await this.query(`SELECT id, product_id, sku_code, color_id, fit_id, size_id, enabled, version, created_operation_id
      FROM naijue_erp.sku WHERE product_id=$1::uuid AND ${visibleSku} ORDER BY id LIMIT $2 FOR UPDATE`, [id, PRODUCT_MAINTENANCE_MAX_SKUS + 1, COMPLETE_SCOPE_DECISION])).rows;
    requireDomain(s.length <= PRODUCT_MAINTENANCE_MAX_SKUS, "PRODUCT_MAINTENANCE_TOO_LARGE", "SKU edit bound exceeded");
    const b = (await this.query(`SELECT bc.id,bc.barcode,bc.sku_id,bc.barcode_kind,bc.scheme_id,bc.enabled FROM naijue_erp.sku_barcode bc
      WHERE bc.sku_id=ANY($4::uuid[]) AND ${visibleBarcode} ORDER BY bc.id LIMIT $2 FOR UPDATE OF bc`,
    [id, PRODUCT_MAINTENANCE_MAX_BARCODES + 1, COMPLETE_SCOPE_DECISION, s.map(row => uuid(row.id))])).rows;
    requireDomain(b.length <= PRODUCT_MAINTENANCE_MAX_BARCODES, "PRODUCT_MAINTENANCE_TOO_LARGE", "Barcode edit bound exceeded");
    const skus = s.map(skuRow), barcodes = b.map(barcodeRow), ids = new Set(skus.map(row => row.id));
    requireDomain(ids.size === skus.length && skus.every(row => row.productId === id) && barcodes.every(row => ids.has(row.skuId)), "INVALID_DATABASE_VALUE", "Invalid aggregate child identity");
    return { product: p, skus, barcodes };
  }
  async readBarcodeGenerationReferences(productId: string, schemeId: string, skus: readonly ProductSkuRecord[]) {
    requireDomain(productId === this.loadedId && skus.length > 0 && skus.length <= PRODUCT_MAINTENANCE_MAX_SKUS
      && skus.every(s => s.productId === productId), "TRANSACTION_SCOPE", "Barcode codes require the original product context");
    const rows = (await this.query("/* product-barcode:scheme */ SELECT id,status,code_length FROM naijue_erp.barcode_scheme WHERE id=$1::uuid FOR SHARE", [schemeId])).rows;
    requireDomain(rows.length === 1 && rows[0]!.id === schemeId, "PRODUCT_REFERENCE_UNAVAILABLE", "Actual barcode scheme unavailable");
    const codes = async (table: "color" | "fit" | "size", ids: readonly string[]) => {
      const selected = [...new Set(ids)].sort();
      const rows = (await this.query(`/* product-barcode:codes */ SELECT id,code FROM naijue_erp.${table} WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE`, [selected])).rows;
      requireDomain(rows.length === selected.length && new Set(rows.map(r => uuid(r.id))).size === selected.length && rows.every(r => selected.includes(uuid(r.id))),
        "PRODUCT_REFERENCE_UNAVAILABLE", "Complete original SKU encoding references required");
      return rows.map(row => ({ id: uuid(row.id), code: row.code }));
    };
    return { scheme: { id: uuid(rows[0]!.id), status: stringValue(rows[0]!.status), codeLength: rows[0]!.code_length === null ? null : integerValue(rows[0]!.code_length) },
      colors: (await codes("color", skus.map(s => s.colorId))).map(row => ({ ...row, code: stringValue(row.code) })),
      fits: (await codes("fit", skus.map(s => s.fitId))).map(row => ({ ...row, code: stringValue(row.code) })),
      sizes: (await codes("size", skus.map(s => s.sizeId))).map(row => ({ ...row, code: nullableString(row.code) })) };
  }
  async readSkuSelectionSizes(productId: string, sizeGroupId: string, selection: ProductSkuSelection): Promise<readonly string[]> {
    requireDomain(productId === this.loadedId, "TRANSACTION_SCOPE", "Selection must use the original locked product");
    const group = (await this.query("/* product-selection:group */ SELECT id FROM naijue_erp.size_group WHERE id=$1::uuid FOR SHARE", [sizeGroupId])).rows;
    requireDomain(group.length === 1 && group[0]!.id === sizeGroupId, "PRODUCT_REFERENCE_UNAVAILABLE", "Actual product size group unavailable");
    for (const [table, ids] of [["color", selection.colorIds], ["fit", selection.fitIds]] as const) {
      const rows = (await this.query(`/* product-selection:references */ SELECT id,enabled,deleted_at IS NULL AS retained FROM naijue_erp.${table} WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE`, [[...ids]])).rows;
      requireDomain(rows.length === ids.length && new Set(rows.map(r => uuid(r.id))).size === ids.length
        && rows.every(r => ids.includes(uuid(r.id)) && r.enabled === true && r.retained === true), "PRODUCT_REFERENCE_UNAVAILABLE", "Selected color and fit must be enabled and retained");
    }
    const rows = (await this.query(`/* product-selection:members */ SELECT m.size_id FROM naijue_erp.size_group_member m
      JOIN naijue_erp.size z ON z.id=m.size_id WHERE m.size_group_id=$1::uuid ORDER BY m.size_id LIMIT $2 FOR SHARE OF m,z`, [sizeGroupId, PRODUCT_MAINTENANCE_MAX_SKUS + 1])).rows;
    requireDomain(rows.length <= PRODUCT_MAINTENANCE_MAX_SKUS, "PRODUCT_MAINTENANCE_TOO_LARGE", "Complete group exceeds the existing SKU bound");
    const sizes = rows.map(r => uuid(r.size_id));
    requireDomain(sizes.length > 0 && new Set(sizes).size === sizes.length, "PRODUCT_SPEC_REQUIRED", "Complete nonempty group required");
    return sizes;
  }
  async validateReferences(previous: ProductAggregate | undefined, next: ProductAggregate): Promise<void> {
    const p = next.product;
    requireDomain(p.id === this.loadedId, "TRANSACTION_SCOPE", "Reference check must match locked product");
    const category = (await this.query("SELECT id FROM naijue_erp.product_category WHERE id=$1::uuid AND deleted_at IS NULL FOR SHARE", [p.categoryId])).rows;
    requireDomain(category.length === 1 && category[0]!.id === p.categoryId, "PRODUCT_REFERENCE_UNAVAILABLE", "Product category is unavailable");
    if (p.supplierId !== null) {
      const rows = (await this.query("SELECT id,enabled FROM naijue_erp.supplier WHERE id=$1::uuid FOR SHARE", [p.supplierId])).rows;
      requireDomain(rows.length === 1 && rows[0]!.id === p.supplierId && (previous?.product.supplierId === p.supplierId || rows[0]!.enabled === true), "PRODUCT_REFERENCE_UNAVAILABLE", "New supplier selection must be enabled");
    }
    const groups = (await this.query("SELECT id FROM naijue_erp.size_group WHERE id=$1::uuid FOR SHARE", [p.sizeGroupId])).rows;
    requireDomain(groups.length === 1 && groups[0]!.id === p.sizeGroupId, "PRODUCT_REFERENCE_UNAVAILABLE", "Product size group is unavailable");
    if (p.seasonId !== null) {
      const rows = (await this.query("SELECT id FROM naijue_erp.season WHERE id=$1::uuid FOR SHARE", [p.seasonId])).rows;
      requireDomain(rows.length === 1 && rows[0]!.id === p.seasonId, "PRODUCT_REFERENCE_UNAVAILABLE", "Season is unavailable");
    }
    if (this.seasonArray) {
      requireDomain(Object.hasOwn(p, "seasonIds"), "INVALID_DATABASE_VALUE", "Actual season array required");
      const selected = storedSeasons(p.seasonIds);
      if (selected?.length) {
        const rows = (await this.query("SELECT id FROM naijue_erp.season WHERE id=ANY($1::uuid[]) ORDER BY id FOR KEY SHARE", [[...selected].sort()])).rows;
        requireDomain(rows.length === selected.length && new Set(rows.map(r => uuid(r.id))).size === selected.length && rows.every(r => selected.includes(uuid(r.id))), "PRODUCT_REFERENCE_UNAVAILABLE", "Selected season is unavailable");
      }
    }
    const schemes = [...new Set([p.defaultBarcodeSchemeId, ...next.barcodes.map(b => b.schemeId)].filter((id): id is string => id !== null))];
    if (schemes.length) {
      const rows = (await this.query("SELECT id FROM naijue_erp.barcode_scheme WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [schemes])).rows;
      requireDomain(rows.length === schemes.length && rows.every(r => schemes.includes(uuid(r.id))), "PRODUCT_REFERENCE_UNAVAILABLE", "Explicit barcode scheme is unavailable");
    }
    const sizes = [...new Set(next.skus.map(s => s.sizeId))];
    if (sizes.length) {
      const rows = (await this.query("SELECT size_id FROM naijue_erp.size_group_member WHERE size_group_id=$1::uuid AND size_id=ANY($2::uuid[]) ORDER BY size_id FOR SHARE", [p.sizeGroupId, sizes])).rows;
      requireDomain(rows.length === sizes.length && rows.every(r => sizes.includes(uuid(r.size_id))), "PRODUCT_SIZE_GROUP_MISMATCH", "SKU size is outside product size group");
    }
    const oldIds = new Set(previous?.skus.map(s => s.id) ?? []);
    for (const [table, key] of [["color", "colorId"], ["fit", "fitId"]] as const) {
      const ids = [...new Set(next.skus.map(s => s[key]))]; if (!ids.length) continue;
      const rows = (await this.query(`SELECT id,enabled,deleted_at IS NULL AS retained FROM naijue_erp.${table} WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE`, [ids])).rows;
      const byId = new Map(rows.map(r => [uuid(r.id), r]));
      requireDomain(byId.size === ids.length && next.skus.every(s => { const r = byId.get(s[key]); return r?.retained === true && (oldIds.has(s.id) || r.enabled === true); }),
        "PRODUCT_REFERENCE_UNAVAILABLE", "New SKU requires valid enabled color/fit");
    }
  }
  async assertCanDelete(previous: ProductAggregate): Promise<void> {
    requireDomain(this.deletion !== null, "PRODUCT_DELETE_NOT_READY", "Trusted product deletion proof is unavailable");
    const rows = (await this.query(`SELECT EXISTS(SELECT 1 FROM naijue_erp.sku s WHERE s.product_id=$1::uuid AND (
      EXISTS(SELECT 1 FROM naijue_erp.sales_line l WHERE l.sku_id=s.id) OR EXISTS(SELECT 1 FROM naijue_erp.transfer_line l WHERE l.sku_id=s.id)
      OR EXISTS(SELECT 1 FROM naijue_erp.history_sales_line l WHERE l.sku_id=s.id) OR EXISTS(SELECT 1 FROM naijue_erp.history_transfer_line l WHERE l.sku_id=s.id))) AS referenced`, [previous.product.id])).rows;
    requireDomain(rows.length === 1 && rows[0]!.referenced === false, "PRODUCT_IN_USE", "Product has retained business references");
    await this.deletion.assertCanDelete(this.context, previous);
  }
  async putProduct(next: ProductStoredRecord, previous: ProductStoredRecord | undefined): Promise<void> {
    requireDomain(!this.imagesReady || this.imagesPrepared, "PRODUCT_MEDIA_NOT_READY", "Actual same-client prepared image proof required before root mutation");
    requireDomain(next.id === this.loadedId && next.version === (previous?.version ?? 0) + 1, "TRANSACTION_SCOPE", "Write one locked product version");
    let columns: readonly string[] = ROOT_COLUMNS, parameters = rootValues(next);
    if (this.seasonArray) {
      requireDomain(Object.hasOwn(next, "seasonIds") && (!previous || next.seasonId === previous.seasonId) && (previous !== undefined || next.seasonId === null), "INVALID_DATABASE_VALUE", "Array contract preserves legacy season provenance");
      storedSeasons(next.seasonIds);
      columns = [...ROOT_COLUMNS, "season_ids"]; parameters = [...parameters, next.seasonIds];
      if (previous) { const index = columns.indexOf("season_id"); columns = columns.filter((_, i) => i !== index); parameters = parameters.filter((_, i) => i !== index); }
    }
    try {
      const written = previous ? await this.query(`UPDATE naijue_erp.product SET ${columns.slice(1).map((k, i) => `${k}=$${i + 2}`).join(",")}
        WHERE id=$1::uuid AND version=$${parameters.length + 1}`, [...parameters, previous.version])
        : await this.query(`INSERT INTO naijue_erp.product(${columns.join(",")}) VALUES(${parameters.map((_, i) => `$${i + 1}`).join(",")})`, parameters);
      requireDomain(written.rowCount === 1, "VERSION_CONFLICT", "Product write did not match exact version");
    } catch (error) { if ((error as { code?: string }).code === "23505") requireDomain(false, "PRODUCT_CODE_CONFLICT", "Product code already exists"); throw error; }
  }
  async putSku(next: ProductSkuRecord, previous: ProductSkuRecord | undefined): Promise<void> {
    requireDomain(next.productId === this.loadedId, "TRANSACTION_SCOPE", "SKU belongs to locked product");
    const parameters = [next.id, next.productId, next.skuCode, next.colorId, next.fitId, next.sizeId, next.enabled, next.version, next.createdOperationId];
    try {
      const written = previous ? await this.query(`UPDATE naijue_erp.sku SET enabled=$7,version=$8 WHERE id=$1::uuid AND product_id=$2::uuid
        AND sku_code=$3 AND color_id=$4::uuid AND fit_id=$5::uuid AND size_id=$6::uuid AND created_operation_id IS NOT DISTINCT FROM $9::uuid AND version=$10`, [...parameters, previous.version])
        : await this.query("INSERT INTO naijue_erp.sku(id,product_id,sku_code,color_id,fit_id,size_id,enabled,version,created_operation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", parameters);
      requireDomain(written.rowCount === 1, "VERSION_CONFLICT", "SKU write did not match exact version");
    } catch (error) { if ((error as { code?: string }).code === "23505") requireDomain(false, "PRODUCT_SPEC_CONFLICT", "SKU coordinate/code already exists"); throw error; }
  }
  async putBarcode(next: ProductBarcodeRecord, previous: ProductBarcodeRecord | undefined): Promise<void> {
    const parameters = [next.id, next.barcode, next.skuId, next.kind, next.schemeId, next.enabled];
    try {
      const written = previous ? await this.query(`UPDATE naijue_erp.sku_barcode SET enabled=$6 WHERE id=$1::uuid AND barcode=$2 AND sku_id=$3::uuid
        AND barcode_kind=$4 AND scheme_id IS NOT DISTINCT FROM $5::uuid AND enabled=$7`, [...parameters, previous.enabled])
        : await this.query("INSERT INTO naijue_erp.sku_barcode(id,barcode,sku_id,barcode_kind,scheme_id,enabled) VALUES($1,$2,$3,$4,$5,$6)", parameters);
      requireDomain(written.rowCount === 1, "VERSION_CONFLICT", "Barcode write did not match retained binding");
    } catch (error) { if ((error as { code?: string }).code === "23505") requireDomain(false, "BARCODE_CONFLICT", "Raw barcode/main binding already exists"); throw error; }
  }
}
