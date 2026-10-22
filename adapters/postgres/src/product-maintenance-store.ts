import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { CATALOGUE_PRICE_KEYS } from "../../../packages/application/src/catalogue-price-input.ts";
import type { CataloguePriceKey } from "../../../packages/application/src/catalogue-price-input.ts";
import type { ProductAggregate, ProductBarcodeRecord, ProductDetailReferences, ProductMaintenanceCandidate, ProductMaintenanceCandidatePage, ProductMaintenanceCandidateQuery, ProductMaintenanceEvidence, ProductMaintenanceTransaction, ProductMaintenanceUnitOfWork, ProductSkuRecord, ProductStoredRecord } from "../../../packages/application/src/product-maintenance-ports.ts";
import { parseProductMaintenanceCandidates, PRODUCT_MAINTENANCE_MAX_BARCODES, PRODUCT_MAINTENANCE_MAX_SKUS } from "../../../packages/application/src/product-maintenance-validation.ts";
import type { PgProductQueryResult } from "./product-query-reader.ts";
import type { MaintenancePgUnitOfWork } from "./maintenance-command-unit-of-work.ts";
import { booleanValue, integerValue, nullableString, stringValue, versionFromSql } from "./codec.ts";

export interface PgProductMaintenanceContext {
  readonly client: { query(sql: string, values?: unknown[]): Promise<PgProductQueryResult> };
  readonly evidence: ProductMaintenanceEvidence;
}
/** D1's central transaction driver supplies this structure. No local pool/BEGIN/receipt writer. */
export interface PgProductMaintenanceDriver { transaction<T>(work: (context: PgProductMaintenanceContext) => Promise<T>): Promise<T> }
type SharedDriverCompatibility = MaintenancePgUnitOfWork extends PgProductMaintenanceDriver ? true : never;
const sharedDriverCompatible: SharedDriverCompatibility = true; void sharedDriverCompatible;
export interface ProductDeletionGuard { assertCanDelete(context: PgProductMaintenanceContext, product: ProductAggregate): Promise<void> }
const uuid = (value: unknown): string => entityId("product", stringValue(value));
function storedPrice(value: unknown): string | null {
  if (value === null) return null;
  requireDomain(typeof value === "string" && /^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(value), "INVALID_DATABASE_VALUE", "Invalid stored product price"); return value;
}
function productRow(r: Record<string, unknown>): ProductStoredRecord {
  const prices = {} as Record<CataloguePriceKey, string | null>; for (const k of CATALOGUE_PRICE_KEYS) prices[k] = storedPrice(r[k]);
  return { id: uuid(r.id), productCode: stringValue(r.product_code), name: stringValue(r.name), categoryId: uuid(r.category_id),
    supplierId: r.supplier_id === null ? null : uuid(r.supplier_id), seasonId: r.season_id === null ? null : uuid(r.season_id), sizeGroupId: uuid(r.size_group_id),
    year: r.year === null ? null : integerValue(r.year), systemItemCode: nullableString(r.system_item_code), thickness: nullableString(r.thickness),
    collarPantsType: nullableString(r.collar_pants_type), defaultBarcodeSchemeId: r.default_barcode_scheme_id === null ? null : uuid(r.default_barcode_scheme_id),
    enabled: booleanValue(r.enabled), version: versionFromSql(r.version), deletedAt: nullableString(r.deleted_at), prices };
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
export class PostgresProductMaintenanceUnitOfWork implements ProductMaintenanceUnitOfWork {
  private readonly driver: PgProductMaintenanceDriver; private readonly deletion: ProductDeletionGuard | null;
  constructor(driver: PgProductMaintenanceDriver, options: { readonly deletionGuard: ProductDeletionGuard | null }) {
    if (typeof driver?.transaction !== "function" || !options || !Object.hasOwn(options, "deletionGuard")
      || (options.deletionGuard !== null && typeof options.deletionGuard?.assertCanDelete !== "function")) throw new TypeError("Product maintenance requires D1 driver and explicit deletion guard availability");
    this.driver = driver; this.deletion = options.deletionGuard;
  }
  transaction<T>(work: (tx: ProductMaintenanceTransaction) => Promise<T>): Promise<T> {
    return this.driver.transaction(async context => {
      const tx = new ProductTransaction(context, this.deletion);
      try { return await work(tx); } finally { tx.close(); }
    });
  }
}
class ProductTransaction implements ProductMaintenanceTransaction {
  readonly evidence: ProductMaintenanceEvidence; private active = true; private loadedId: string | undefined;
  private readonly context: PgProductMaintenanceContext; private readonly deletion: ProductDeletionGuard | null;
  constructor(context: PgProductMaintenanceContext, deletion: ProductDeletionGuard | null) { this.context = context; this.evidence = context.evidence; this.deletion = deletion; }
  close(): void { this.active = false; }
  private query(sql: string, values: unknown[] = []) { requireDomain(this.active, "TRANSACTION_CLOSED", "Product transaction is closed"); return this.context.client.query(sql, values); }
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
    return { categoryPath, sizeGroup: { id: uuid(r.size_group_id), name: stringValue(r.size_group_name) },
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
      "barcode-schemes": simple("barcode_scheme", "true"), years: distinct("year"), thicknesses: distinct("thickness"), "collar-pants-types": distinct("collar_pants_type")
    };
    const d = definitions[q.kind];
    const rows = (await this.query(`WITH matched AS (SELECT ${d.id} AS id,${d.name} AS name,${d.code} AS code,${d.parent} AS parent_id,${d.version} AS version
      FROM ${d.from} WHERE ${d.where} AND (strpos(lower(${d.name}),lower($1::text))>0 OR strpos(lower(COALESCE(${d.code},'')),lower($1::text))>0)),
      page AS (SELECT * FROM matched ORDER BY name COLLATE "C",id COLLATE "C" LIMIT $2 OFFSET $3)
      SELECT (SELECT count(*)::text FROM matched) AS total,COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY name COLLATE "C",id COLLATE "C") FROM page),'[]'::jsonb) AS items`,
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
    const rows = (await this.query(`SELECT ${ROOT_COLUMNS.map(k => CATALOGUE_PRICE_KEYS.includes(k as CataloguePriceKey) ? `${k}::text AS ${k}` : k === "deleted_at" ? `to_char(deleted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS deleted_at` : k).join(", ")}
      FROM naijue_erp.product WHERE id=$1::uuid FOR UPDATE`, [id])).rows;
    requireDomain(rows.length <= 1, "INVALID_DATABASE_VALUE", "Product identity is not unique"); if (!rows[0]) return undefined;
    const p = productRow(rows[0]); requireDomain(p.id === id, "INVALID_DATABASE_VALUE", "Mismatched product");
    const s = (await this.query(`SELECT id, product_id, sku_code, color_id, fit_id, size_id, enabled, version, created_operation_id
      FROM naijue_erp.sku WHERE product_id=$1::uuid ORDER BY id LIMIT $2 FOR UPDATE`, [id, PRODUCT_MAINTENANCE_MAX_SKUS + 1])).rows;
    requireDomain(s.length <= PRODUCT_MAINTENANCE_MAX_SKUS, "PRODUCT_MAINTENANCE_TOO_LARGE", "SKU edit bound exceeded");
    const b = (await this.query(`SELECT b.id,b.barcode,b.sku_id,b.barcode_kind,b.scheme_id,b.enabled FROM naijue_erp.sku_barcode b
      JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE s.product_id=$1::uuid ORDER BY b.id LIMIT $2 FOR UPDATE OF b`, [id, PRODUCT_MAINTENANCE_MAX_BARCODES + 1])).rows;
    requireDomain(b.length <= PRODUCT_MAINTENANCE_MAX_BARCODES, "PRODUCT_MAINTENANCE_TOO_LARGE", "Barcode edit bound exceeded");
    const skus = s.map(skuRow), barcodes = b.map(barcodeRow), ids = new Set(skus.map(row => row.id));
    requireDomain(ids.size === skus.length && skus.every(row => row.productId === id) && barcodes.every(row => ids.has(row.skuId)), "INVALID_DATABASE_VALUE", "Invalid aggregate child identity");
    return { product: p, skus, barcodes };
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
    requireDomain(next.id === this.loadedId && next.version === (previous?.version ?? 0) + 1, "TRANSACTION_SCOPE", "Write one locked product version");
    const parameters = rootValues(next);
    try {
      const written = previous ? await this.query(`UPDATE naijue_erp.product SET ${ROOT_COLUMNS.slice(1).map((k, i) => `${k}=$${i + 2}`).join(",")}
        WHERE id=$1::uuid AND version=$${parameters.length + 1}`, [...parameters, previous.version])
        : await this.query(`INSERT INTO naijue_erp.product(${ROOT_COLUMNS.join(",")}) VALUES(${parameters.map((_, i) => `$${i + 1}`).join(",")})`, parameters);
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
