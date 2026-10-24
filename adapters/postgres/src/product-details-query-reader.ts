import type { ProductBarcodeDetails, ProductBarcodePage, ProductBarcodeQuery, ProductBarcodeQueryResult, ProductBarcodeRecordQuery, ProductBarcodeSkuPage, ProductBarcodeSkuQuery, ProductDefaultScheme, ProductDetailsScopedRead, ProductDetailsSnapshotReader, ProductPriceDetails } from "../../../packages/application/src/product-details-query-ports.ts";
import { checkedProductBarcodeSkuPage, checkedProductDetailsScope } from "../../../packages/application/src/product-details-query-validation.ts";
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
  private async skuPage(query: Query, p: ProductBarcodeSkuQuery, target: { productId: string; version: number }, defaultScheme: ProductDefaultScheme): Promise<ProductBarcodeSkuPage> {
    const counts = (await query("SELECT count(*)::text AS total FROM naijue_erp.sku s WHERE s.product_id = $1::uuid", [p.productId])).rows;
    requireDomain(counts.length === 1, "INVALID_DATABASE_VALUE", "Expected one SKU total");
    const totalSkus = count(counts[0]!.total);
    const rows = (await query(`SELECT s.id, s.product_id, s.sku_code, s.enabled, s.color_id, c.name AS color_label,
      s.fit_id, f.name AS fit_label, s.size_id, z.name AS size_label FROM naijue_erp.sku s
      LEFT JOIN naijue_erp.color c ON c.id=s.color_id LEFT JOIN naijue_erp.fit f ON f.id=s.fit_id LEFT JOIN naijue_erp.size z ON z.id=s.size_id
      WHERE s.product_id=$1::uuid ORDER BY s.sku_code COLLATE "C" NULLS LAST, s.id LIMIT $2 OFFSET $3`, [p.productId, p.pageSize, (p.page - 1) * p.pageSize])).rows;
    requireDomain(rows.length === Math.min(p.pageSize, Math.max(0, totalSkus - (p.page - 1) * p.pageSize)), "INVALID_DATABASE_VALUE", "Inconsistent SKU page");
    const skuIds = rows.map(row => {
      requireDomain(row.product_id === p.productId, "INVALID_DATABASE_VALUE", "SKU page contains another product");
      return entityId("sku", stringValue(row.id));
    });
    requireDomain(new Set(skuIds).size === skuIds.length, "INVALID_DATABASE_VALUE", "Duplicate SKU page target");
    const summaries = skuIds.length === 0 ? [] : (await query(`WITH ranked AS (
      SELECT b.*, row_number() OVER (PARTITION BY b.sku_id,b.barcode_kind ORDER BY b.barcode COLLATE "C",b.id) AS kind_order,
        row_number() OVER (PARTITION BY b.sku_id,b.barcode_kind,b.enabled ORDER BY b.barcode COLLATE "C",b.id) AS state_order
      FROM naijue_erp.sku_barcode b WHERE b.sku_id=ANY($1::uuid[]))
      SELECT sku_id,count(*)::text AS binding_count,
        (count(*) FILTER (WHERE barcode_kind='MAIN' AND enabled))::text AS enabled_main_count,
        (count(*) FILTER (WHERE barcode_kind='MAIN' AND NOT enabled))::text AS disabled_main_count,
        (count(*) FILTER (WHERE barcode_kind='CONFIRMED_OLD'))::text AS confirmed_old_count,
        (jsonb_agg(jsonb_build_object('id',id,'barcode',barcode,'kind',barcode_kind,'schemeId',scheme_id,'enabled',enabled))
          FILTER (WHERE barcode_kind='MAIN' AND enabled AND state_order=1))->0 AS enabled_main,
        (jsonb_agg(jsonb_build_object('id',id,'barcode',barcode,'kind',barcode_kind,'schemeId',scheme_id,'enabled',enabled))
          FILTER (WHERE barcode_kind='CONFIRMED_OLD' AND kind_order=1))->0 AS first_confirmed_old
      FROM ranked GROUP BY sku_id ORDER BY sku_id`, [skuIds])).rows;
    const bySku = new Map<string, Record<string, unknown>>();
    for (const row of summaries) {
      const skuId = entityId("sku", stringValue(row.sku_id));
      requireDomain(skuIds.includes(skuId) && !bySku.has(skuId), "INVALID_DATABASE_VALUE", "Unexpected SKU binding summary");
      const enabledMainCount = count(row.enabled_main_count);
      requireDomain(enabledMainCount <= 1 && (enabledMainCount === 0) === (row.enabled_main === null), "INVALID_DATABASE_VALUE", "Invalid enabled MAIN cardinality for one SKU");
      bySku.set(skuId, row);
    }
    const items = rows.map((row, index) => {
      const skuId = skuIds[index]!, summary = bySku.get(skuId);
      return { skuId, skuCode: stringValue(row.sku_code), skuEnabled: booleanValue(row.enabled),
        colorId: entityId("color", stringValue(row.color_id)), colorLabel: nullableString(row.color_label),
        fitId: entityId("fit", stringValue(row.fit_id)), fitLabel: nullableString(row.fit_label),
        sizeId: entityId("size", stringValue(row.size_id)), sizeLabel: nullableString(row.size_label),
        bindingCount: summary === undefined ? 0 : count(summary.binding_count), main: summary === undefined ? null : summary.enabled_main,
        disabledMainCount: summary === undefined ? 0 : count(summary.disabled_main_count), confirmedOldCount: summary === undefined ? 0 : count(summary.confirmed_old_count),
        firstConfirmedOld: summary === undefined ? null : summary.first_confirmed_old };
    });
    return checkedProductBarcodeSkuPage({ kind: "SKU_PAGE", ...target, page: p.page, pageSize: p.pageSize, totalSkus, defaultScheme, items }, p);
  }
  readBarcodes(read: ProductDetailsScopedRead<ProductBarcodeRecordQuery>): Promise<ProductBarcodePage | null>;
  readBarcodes(read: ProductDetailsScopedRead<ProductBarcodeSkuQuery>): Promise<ProductBarcodeSkuPage | null>;
  readBarcodes(read: ProductDetailsScopedRead<ProductBarcodeQuery>): Promise<ProductBarcodeQueryResult | null>;
  async readBarcodes(read: ProductDetailsScopedRead<ProductBarcodeQuery>): Promise<ProductBarcodeQueryResult | null> {
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
      if (p.view === "SKU") return this.skuPage(query, p, target, defaultScheme);
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
