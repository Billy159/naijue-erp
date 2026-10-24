import type { ProductBarcodeDetails, ProductBarcodePage, ProductBarcodeQuery, ProductDefaultScheme, ProductDetailsScopedRead, ProductDetailsSnapshotReader, ProductPriceDetails } from "../../../packages/application/src/product-details-query-ports.ts";
import { checkedProductDetailsScope } from "../../../packages/application/src/product-details-query-validation.ts";
import type { ProductQuery } from "../../../packages/application/src/product-query-ports.ts";
import { activeProductRead } from "../../../packages/application/src/product-query-validation.ts";
import { CATALOGUE_PRICE_KEYS } from "../../../packages/application/src/catalogue-price-input.ts";
import type { CataloguePriceKey } from "../../../packages/application/src/catalogue-price-input.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { booleanValue, nullableString, stringValue, versionFromSql } from "./codec.ts";
import type { PgProductQueryClient, PgProductQueryPool, PgProductQueryResult } from "./product-query-reader.ts";
import { catalogueRetainedDeleteEnabled, type CatalogueRetainedDeleteCapability } from "./product-query-reader.ts";
import { checkedNativeRuntime26Capability, type NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";

type Query = (sql: string, values?: unknown[]) => Promise<PgProductQueryResult>;
function count(value: unknown): number {
  requireDomain(typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER), "INVALID_DATABASE_VALUE", "Invalid exact barcode count");
  return Number(value);
}
function product(rows: readonly Record<string, unknown>[], expected: string): { productId: string; version: number } | null {
  requireDomain(rows.length <= 1, "INVALID_DATABASE_VALUE", "Product target is not unique");
  const row = rows[0]; if (!row) return null;
  const productId = entityId("product", stringValue(row.id));
  requireDomain(productId === expected, "INVALID_DATABASE_VALUE", "Mismatched product identity");
  return { productId, version: versionFromSql(row.version) };
}
function price(value: unknown): string | null {
  if (value === null) return null;
  requireDomain(typeof value === "string" && /^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(value), "INVALID_DATABASE_VALUE", "Invalid exact stored price"); return value;
}
/** Bounded target-only RR reads. New columns require the host's verified capability. */
export class PostgresProductDetailsQueryReader implements ProductDetailsSnapshotReader {
  private readonly pool: PgProductQueryPool;
  private readonly retainedDelete: boolean;
  private readonly runtime26: NativeRuntime26Capability | undefined;
  constructor(pool: PgProductQueryPool, capability: CatalogueRetainedDeleteCapability | null = null, runtime26?: NativeRuntime26Capability) {
    if (typeof pool?.connect !== "function") throw new TypeError("Product details require an explicit PostgreSQL pool");
    this.pool = pool; this.retainedDelete = catalogueRetainedDeleteEnabled(pool, capability);
    this.runtime26 = checkedNativeRuntime26Capability(runtime26);
    if (this.runtime26 !== undefined && !this.retainedDelete) throw new TypeError("Native product details require the original retained catalogue capability");
  }
  private async snapshot<T>(signal: AbortSignal, work: (query: Query, client: PgProductQueryClient) => Promise<T>): Promise<T> {
    activeProductRead(signal); const client = await this.pool.connect(); let began = false, committing = false; let discard: Error | undefined;
    const query: Query = (sql, values = []) => { activeProductRead(signal); return client.query(sql, values); };
    try {
      await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
      const result = await work(query, client); activeProductRead(signal); committing = true; await client.query("COMMIT"); return result;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error("Product details snapshot failed");
      if (began && !committing) try { await client.query("ROLLBACK"); }
      catch (rollbackError) { discard = rollbackError instanceof Error ? rollbackError : new Error("Product details rollback failed"); throw new AggregateError([error, rollbackError], "Product details and rollback failed"); }
      throw error;
    } finally { client.release(discard); }
  }
  async readPrices(read: ProductDetailsScopedRead<ProductQuery>): Promise<ProductPriceDetails | null> {
    checkedProductDetailsScope(read); requireDomain(read.intent.kind === "prices", "FORBIDDEN", "Price-tab grant required");
    return this.snapshot(read.signal, async query => {
      const rows = (await query(`SELECT p.id, p.version, ${CATALOGUE_PRICE_KEYS.map(key => `p.${key}::text AS ${key}`).join(", ")}
        FROM naijue_erp.product p WHERE p.id = $1::uuid${this.retainedDelete ? " AND p.deleted_at IS NULL" : ""}`, [read.parameters.productId])).rows;
      const target = product(rows, read.parameters.productId); if (target === null) return null;
      const prices = {} as Record<CataloguePriceKey, string | null>;
      for (const key of CATALOGUE_PRICE_KEYS) prices[key] = price(rows[0]![key]);
      return { ...target, prices: Object.freeze(prices) };
    });
  }
  async readBarcodes(read: ProductDetailsScopedRead<ProductBarcodeQuery>): Promise<ProductBarcodePage | null> {
    checkedProductDetailsScope(read); requireDomain(read.intent.kind === "barcodes", "FORBIDDEN", "Barcode-tab grant required");
    const p = read.parameters;
    return this.snapshot(read.signal, async (query, client) => {
      if (this.runtime26 !== undefined) await this.runtime26.assertReady(client, "PRODUCT_SEASONS_READ");
      const targets = (await query(`SELECT p.id, p.version${this.runtime26 === undefined ? "" : ", p.default_barcode_scheme_id"} FROM naijue_erp.product p WHERE p.id = $1::uuid${this.retainedDelete ? " AND p.deleted_at IS NULL" : ""}`, [p.productId])).rows;
      const target = product(targets, p.productId);
      if (target === null) return null;
      const defaultScheme: ProductDefaultScheme = this.runtime26 === undefined
        ? { state: "UNAVAILABLE", reason: "NO_PRODUCT_SCHEME_FIELD" }
        : targets[0]!.default_barcode_scheme_id === null ? { state: "NOT_SET" }
        : { state: "AVAILABLE", schemeId: entityId("product", stringValue(targets[0]!.default_barcode_scheme_id)) };
      if (p.skuId !== undefined) {
        const skus = (await query("SELECT s.id, s.product_id FROM naijue_erp.sku s WHERE s.id = $1::uuid AND s.product_id = $2::uuid", [p.skuId, p.productId])).rows;
        requireDomain(skus.length <= 1 && skus.every(s => s.id === p.skuId && s.product_id === p.productId), "INVALID_DATABASE_VALUE", "Invalid SKU target membership");
        if (skus.length === 0) return null;
      }
      const counts = (await query(`SELECT count(*)::text AS total FROM naijue_erp.sku_barcode b
        JOIN naijue_erp.sku s ON s.id = b.sku_id WHERE s.product_id = $1::uuid${p.skuId === undefined ? "" : " AND s.id = $2::uuid"}`, p.skuId === undefined ? [p.productId] : [p.productId, p.skuId])).rows;
      requireDomain(counts.length === 1, "INVALID_DATABASE_VALUE", "Expected one barcode count"); const total = count(counts[0]!.total);
      const rows = (await query(`SELECT b.id, b.barcode, b.sku_id, b.barcode_kind, b.scheme_id, b.enabled,
        s.product_id, s.sku_code, s.color_id, s.fit_id, s.size_id FROM naijue_erp.sku_barcode b
        JOIN naijue_erp.sku s ON s.id = b.sku_id WHERE s.product_id = $1::uuid${p.skuId === undefined ? "" : " AND s.id = $4::uuid"}
        ORDER BY b.barcode COLLATE "C", b.id LIMIT $2 OFFSET $3`, p.skuId === undefined ? [p.productId, p.pageSize, (p.page - 1) * p.pageSize] : [p.productId, p.pageSize, (p.page - 1) * p.pageSize, p.skuId])).rows;
      requireDomain(rows.length === Math.min(p.pageSize, Math.max(0, total - (p.page - 1) * p.pageSize)), "INVALID_DATABASE_VALUE", "Inconsistent barcode page");
      const ids = new Set<string>(), rawCodes = new Set<string>();
      const items = rows.map((row): ProductBarcodeDetails => {
        const id = entityId("barcode", stringValue(row.id)), barcode = stringValue(row.barcode);
        requireDomain(row.product_id === p.productId && (p.skuId === undefined || row.sku_id === p.skuId) && barcode.length > 0 && !ids.has(id) && !rawCodes.has(barcode)
          && (row.barcode_kind === "MAIN" || row.barcode_kind === "CONFIRMED_OLD"), "INVALID_DATABASE_VALUE", "Invalid retained barcode identity");
        ids.add(id); rawCodes.add(barcode); const scheme = nullableString(row.scheme_id), skuCode = stringValue(row.sku_code);
        requireDomain(skuCode.length > 0, "INVALID_DATABASE_VALUE", "Missing SKU code");
        return { id, barcode, skuId: entityId("sku", stringValue(row.sku_id)), skuCode, colorId: entityId("color", stringValue(row.color_id)),
          fitId: entityId("fit", stringValue(row.fit_id)), sizeId: entityId("size", stringValue(row.size_id)), kind: row.barcode_kind,
          schemeId: scheme === null ? null : entityId("product", scheme), enabled: booleanValue(row.enabled) };
      });
      return { ...target, page: p.page, pageSize: p.pageSize, total, items, defaultScheme, ...(p.skuId === undefined ? {} : { skuId: p.skuId }) };
    });
  }
}
