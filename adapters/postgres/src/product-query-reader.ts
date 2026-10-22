import type { Pool } from "pg";
import type { ProductBasicsDto, ProductImageMetadata, ProductImageMetadataSet, ProductImageMime, ProductImageQuery, ProductQuery, ProductScopedRead, ProductSelection, ProductSpecificationsDto, TrustedProductSnapshotReader } from "../../../packages/application/src/product-query-ports.ts";
import { activeProductRead, checkedProductActor, checkedProductGrant, parseProductImageQuery, parseProductQuery } from "../../../packages/application/src/product-query-validation.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { EntityKind } from "../../../packages/domain/src/values.ts";
import { integerValue, nullableString, stringValue } from "./codec.ts";

export interface PgProductQueryResult { readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }
export interface PgProductQueryClient {
  query(text: string, values?: unknown[]): Promise<PgProductQueryResult>;
  release(error?: Error | boolean): void;
}
export interface PgProductQueryPool { connect(): Promise<PgProductQueryClient> }
/** Host-owned startup proof, bound to this exact pool/target. The host must
 * verify actual retained-delete columns/constraints and runtime access before
 * issuing this capability. A migration number alone is insufficient. */
export interface CatalogueRetainedDeleteCapability {
  readonly profile: "catalogue-retained-delete-v22";
  readonly assertVerified: (pool: PgProductQueryPool) => void;
}
export function catalogueRetainedDeleteEnabled(pool: PgProductQueryPool, capability: CatalogueRetainedDeleteCapability | null): boolean {
  if (capability === null) return false;
  if (typeof capability !== "object" || Array.isArray(capability) || Object.getPrototypeOf(capability) !== Object.prototype
    || Reflect.ownKeys(capability).length !== 2) throw new TypeError("Explicit verified catalogue schema capability required");
  const profile = Object.getOwnPropertyDescriptor(capability, "profile"), verifier = Object.getOwnPropertyDescriptor(capability, "assertVerified");
  if (!profile || !("value" in profile) || profile.value !== "catalogue-retained-delete-v22" || !verifier || !("value" in verifier) || typeof verifier.value !== "function")
    throw new TypeError("Explicit verified catalogue schema capability required");
  // No discovery, async startup, or retry here. The D1 host owns verification;
  // callers cannot activate new-column SQL using an unverified version flag.
  if (Object.prototype.toString.call(verifier.value) === "[object AsyncFunction]") throw new TypeError("Catalogue schema proof must be synchronously verified by the host");
  const result: unknown = verifier.value(pool);
  if (result !== undefined) {
    if (result instanceof Promise) void result.catch(() => {});
    throw new TypeError("Catalogue schema proof must be synchronously verified by the host");
  }
  return true;
}
/** D1 issues this only after exact schema, reference guards, access and conversion verification. */
export interface ProductSeasonArrayCapability {
  readonly profile: "product-season-array-v1";
  readonly assertVerified: (target: object) => void;
}
export function productSeasonArrayEnabled(target: object, capability: ProductSeasonArrayCapability | null): boolean {
  if (capability === null) return false;
  if (typeof capability !== "object" || Array.isArray(capability) || Object.getPrototypeOf(capability) !== Object.prototype
    || Reflect.ownKeys(capability).length !== 2) throw new TypeError("Verified product season capability required");
  const p = Object.getOwnPropertyDescriptor(capability, "profile"), v = Object.getOwnPropertyDescriptor(capability, "assertVerified");
  if (!p || !("value" in p) || p.value !== "product-season-array-v1" || !v || !("value" in v) || typeof v.value !== "function"
    || Object.prototype.toString.call(v.value) === "[object AsyncFunction]") throw new TypeError("Synchronous product season proof required");
  const result: unknown = v.value(target);
  if (result !== undefined) { if (result instanceof Promise) void result.catch(() => {}); throw new TypeError("Synchronous product season proof required"); }
  return true;
}
/** One aggregate row per product, including NULL/empty. Never expands product or stock rows. */
export function productSeasonLabelJoin(array: boolean): string {
  return array ? `LEFT JOIN LATERAL (SELECT string_agg(d.name,'、' ORDER BY d.display_order,d.id) AS name
    FROM naijue_erp.season d WHERE d.id=ANY(p.season_ids)) se ON true`
    : "LEFT JOIN naijue_erp.season se ON se.id = p.season_id";
}
type PgPoolCompatibility = Pool extends PgProductQueryPool ? true : never;
const pgPoolCompatibility: PgPoolCompatibility = true; void pgPoolCompatibility;
/** Technical response safeguards, not catalogue/business maxima. Overflow fails, never truncates. */
export const PRODUCT_READ_MAX_SKUS = 5000;
export const PRODUCT_READ_MAX_GROUP_MEMBERS = 1000;
export const PRODUCT_READ_MAX_IMAGES = 1000;
type Query = (sql: string, values?: unknown[]) => Promise<PgProductQueryResult>;
function text(value: unknown): string {
  const result = stringValue(value); requireDomain(result.trim().length > 0, "INVALID_DATABASE_VALUE", "Missing persisted product label"); return result;
}
function optionalText(value: unknown): string | null { const result = nullableString(value); return result === null ? null : text(result); }
function retailPrice(value: unknown): string | null {
  if (value === null) return null;
  requireDomain(typeof value === "string" && /^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(value), "INVALID_DATABASE_VALUE", "Invalid exact native retail price");
  return value;
}
function id(kind: EntityKind, value: unknown): string { return entityId(kind, stringValue(value)); }
function oneOrMissing(rows: readonly Record<string, unknown>[]): Record<string, unknown> | null {
  requireDomain(rows.length <= 1, "INVALID_DATABASE_VALUE", "Product target is not unique"); return rows[0] ?? null;
}
function bounded(rows: readonly unknown[], maximum: number): void {
  requireDomain(rows.length <= maximum, "PRODUCT_READ_TOO_LARGE", "Product target exceeds technical response bound");
}
function metadata(row: Record<string, unknown>, productId: string): ProductImageMetadata {
  const mime = stringValue(row.mime);
  requireDomain(["image/png", "image/jpeg", "image/webp"].includes(mime), "INVALID_DATABASE_VALUE", "Invalid persisted image MIME");
  const bytes = stringValue(row.byte_size);
  requireDomain(/^[1-9]\d*$/.test(bytes) && BigInt(bytes) <= 8388608n, "INVALID_DATABASE_VALUE", "Invalid persisted image byte size");
  const target = id("product", row.product_id);
  requireDomain(target === productId, "INVALID_DATABASE_VALUE", "Image belongs to another product");
  return Object.freeze({ id: id("product", row.id), productId: target, fileRef: text(row.file_ref), mime: mime as ProductImageMime,
    byteSize: BigInt(bytes), displayOrder: integerValue(row.display_order) });
}
const IMAGE_COLUMNS = "i.id, i.product_id, i.file_ref, i.mime, i.byte_size::text, i.display_order";
/** Actual parameterized PostgreSQL read SQL, using an injected existing pool. Construction does not
 * connect, run migrations, seed data or start a server. Every public call has one RR READ ONLY
 * snapshot; target bounds and set queries prevent full-catalog loading or N+1 reads.
 * AbortSignal checks stop callback work between calls; they do not cancel an in-flight pg query
 * or pool acquisition. The trusted host must configure database/pool timeouts separately. */
export class PostgresProductQueryReader implements TrustedProductSnapshotReader {
  private readonly pool: PgProductQueryPool;
  private readonly retainedDelete: boolean; private readonly seasonArray: boolean;
  constructor(pool: PgProductQueryPool, capability: CatalogueRetainedDeleteCapability | null = null, seasonCapability: ProductSeasonArrayCapability | null = null) {
    if (typeof pool?.connect !== "function") throw new TypeError("Product query reader requires an explicit PostgreSQL pool");
    this.pool = pool; this.retainedDelete = catalogueRetainedDeleteEnabled(pool, capability); this.seasonArray = productSeasonArrayEnabled(pool, seasonCapability);
  }
  private validate<P extends ProductQuery>(read: ProductScopedRead<P>, parameters: P): void {
    checkedProductActor(read.actor); checkedProductGrant(read.grant, parameters); activeProductRead(read.signal);
  }
  private async snapshot<T>(signal: AbortSignal, work: (query: Query) => Promise<T>): Promise<T> {
    activeProductRead(signal);
    const client = await this.pool.connect(); let began = false; let committing = false; let discard: Error | undefined;
    const query: Query = (sql, values = []) => { activeProductRead(signal); return client.query(sql, values); };
    try {
      activeProductRead(signal); await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
      const result = await work(query); activeProductRead(signal); committing = true; await query("COMMIT"); return result;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error("Product snapshot failed");
      if (began) {
        try { await client.query("ROLLBACK"); }
        catch (rollbackError) {
          discard = rollbackError instanceof Error ? rollbackError : new Error("Product rollback failed");
          throw new AggregateError([error, rollbackError], "Product read and rollback failed; client discarded");
        }
      }
      throw error;
    } finally { client.release(discard); }
  }
  async readBasics(read: ProductScopedRead<ProductQuery>): Promise<ProductBasicsDto | null> {
    const parameters = parseProductQuery(read.parameters); this.validate(read, parameters);
    return this.snapshot(read.signal, async query => {
      const row = oneOrMissing((await query(`SELECT p.id, p.product_code, p.name, p.year, p.system_item_code, p.retail_price::text,
        c.name AS category_name, se.name AS season_name, su.name AS supplier_name
        FROM naijue_erp.product p JOIN naijue_erp.product_category c ON c.id = p.category_id
        ${productSeasonLabelJoin(this.seasonArray)} LEFT JOIN naijue_erp.supplier su ON su.id = p.supplier_id
        WHERE p.id = $1::uuid${this.retainedDelete ? " AND p.deleted_at IS NULL" : ""}`, [parameters.productId])).rows);
      if (row === null) return null;
      requireDomain(id("product", row.id) === parameters.productId, "INVALID_DATABASE_VALUE", "Mismatched product target");
      return { productId: parameters.productId, code: text(row.product_code), name: text(row.name), categoryLabel: text(row.category_name),
        yearLabel: row.year === null ? null : String(integerValue(row.year)), systemCode: optionalText(row.system_item_code),
        seasonLabel: optionalText(row.season_name), supplierLabel: optionalText(row.supplier_name), retailPrice: retailPrice(row.retail_price) };
    });
  }
  async readSpecifications(read: ProductScopedRead<ProductQuery>): Promise<ProductSpecificationsDto | null> {
    const parameters = parseProductQuery(read.parameters); this.validate(read, parameters);
    return this.snapshot(read.signal, async query => {
      const row = oneOrMissing((await query(`SELECT p.id, p.size_group_id, g.name AS size_group_name
        FROM naijue_erp.product p JOIN naijue_erp.size_group g ON g.id = p.size_group_id WHERE p.id = $1::uuid${this.retainedDelete ? " AND p.deleted_at IS NULL" : ""}`, [parameters.productId])).rows);
      if (row === null) return null;
      requireDomain(id("product", row.id) === parameters.productId, "INVALID_DATABASE_VALUE", "Mismatched product target");
      const groupId = id("sizeGroup", row.size_group_id);
      const memberRows = (await query(`SELECT s.id, s.name, m.display_order FROM naijue_erp.size_group_member m
        JOIN naijue_erp.size s ON s.id = m.size_id WHERE m.size_group_id = $1::uuid
        ORDER BY m.display_order, s.id LIMIT $2`, [groupId, PRODUCT_READ_MAX_GROUP_MEMBERS + 1])).rows;
      bounded(memberRows, PRODUCT_READ_MAX_GROUP_MEMBERS);
      const sizes = memberRows.map(member => { integerValue(member.display_order); return { id: id("size", member.id), label: text(member.name) }; });
      const sizeIds = new Set(sizes.map(size => size.id));
      requireDomain(sizeIds.size === sizes.length, "INVALID_DATABASE_VALUE", "Repeated group size identity");
      const skuRows = (await query(`SELECT s.id, s.product_id, s.color_id, s.fit_id, s.size_id,
        c.name AS color_name, f.name AS fit_name, m.size_id AS member_size_id
        FROM naijue_erp.sku s JOIN naijue_erp.color c ON c.id = s.color_id JOIN naijue_erp.fit f ON f.id = s.fit_id
        LEFT JOIN naijue_erp.size_group_member m ON m.size_group_id = $2::uuid AND m.size_id = s.size_id
        WHERE s.product_id = $1::uuid
        ORDER BY c.code COLLATE "C", c.id, f.code COLLATE "C", f.id, m.display_order, s.size_id, s.id LIMIT $3`,
        [parameters.productId, groupId, PRODUCT_READ_MAX_SKUS + 1])).rows;
      bounded(skuRows, PRODUCT_READ_MAX_SKUS);
      const colors = new Map<string, ProductSelection>(); const fits = new Map<string, ProductSelection>();
      const skuIds = new Set<string>(); const coordinates = new Set<string>();
      const skus = skuRows.map(sku => {
        const skuId = id("sku", sku.id); const productId = id("product", sku.product_id);
        const colorId = id("color", sku.color_id); const fitId = id("fit", sku.fit_id); const sizeId = id("size", sku.size_id);
        requireDomain(productId === parameters.productId && sku.member_size_id === sizeId && sizeIds.has(sizeId), "INVALID_DATABASE_VALUE", "SKU size is outside its product group");
        const coordinate = JSON.stringify([productId, colorId, fitId, sizeId]);
        requireDomain(!skuIds.has(skuId) && !coordinates.has(coordinate), "INVALID_DATABASE_VALUE", "Repeated persisted SKU identity or coordinate");
        skuIds.add(skuId); coordinates.add(coordinate);
        const colorName = text(sku.color_name), fitName = text(sku.fit_name);
        requireDomain((!colors.has(colorId) || colors.get(colorId)!.label === colorName) && (!fits.has(fitId) || fits.get(fitId)!.label === fitName), "INVALID_DATABASE_VALUE", "Inconsistent persisted specification labels");
        colors.set(colorId, { id: colorId, label: colorName }); fits.set(fitId, { id: fitId, label: fitName });
        return { id: skuId, colorId, fitId, sizeId };
      });
      return { productId: parameters.productId, sizeGroup: { id: groupId, label: text(row.size_group_name) },
        colors: [...colors.values()], fits: [...fits.values()], sizes, skus };
    });
  }
  async readImages(read: ProductScopedRead<ProductQuery>): Promise<ProductImageMetadataSet | null> {
    const parameters = parseProductQuery(read.parameters); this.validate(read, parameters);
    return this.snapshot(read.signal, async query => {
      const product = oneOrMissing((await query(`SELECT p.id, p.name FROM naijue_erp.product p WHERE p.id = $1::uuid${this.retainedDelete ? " AND p.deleted_at IS NULL" : ""}`, [parameters.productId])).rows);
      if (product === null) return null;
      requireDomain(id("product", product.id) === parameters.productId, "INVALID_DATABASE_VALUE", "Mismatched product target");
      const rows = (await query(`SELECT ${IMAGE_COLUMNS} FROM naijue_erp.product_image i WHERE i.product_id = $1::uuid
        ORDER BY i.display_order, i.id LIMIT $2`, [parameters.productId, PRODUCT_READ_MAX_IMAGES + 1])).rows;
      bounded(rows, PRODUCT_READ_MAX_IMAGES);
      const images = rows.map(row => metadata(row, parameters.productId));
      requireDomain(new Set(images.map(image => image.id)).size === images.length, "INVALID_DATABASE_VALUE", "Repeated image relation identity");
      return { productId: parameters.productId, productName: text(product.name), images };
    });
  }
  async readImage(read: ProductScopedRead<ProductImageQuery>): Promise<ProductImageMetadata | null> {
    const parameters = parseProductImageQuery(read.parameters); this.validate(read, parameters);
    return this.snapshot(read.signal, async query => {
      const row = oneOrMissing((await query(`SELECT ${IMAGE_COLUMNS} FROM naijue_erp.product_image i
        JOIN naijue_erp.product p ON p.id = i.product_id WHERE p.id = $1::uuid AND i.id = $2::uuid${this.retainedDelete ? " AND p.deleted_at IS NULL" : ""}`, [parameters.productId, parameters.imageId])).rows);
      if (row === null) return null;
      const result = metadata(row, parameters.productId);
      requireDomain(result.id === parameters.imageId, "INVALID_DATABASE_VALUE", "Mismatched image target"); return result;
    });
  }
  async readCurrentImage(read: ProductScopedRead<ProductImageQuery>): Promise<ProductImageMetadata | null> {
    // Capability was verified against this actual pool by the constructor. Legacy reads remain separate.
    requireDomain(this.retainedDelete, "PRODUCT_MEDIA_NOT_READY", "Retained-delete-aware media reader unavailable");
    return this.readImage(read);
  }
}
