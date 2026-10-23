import type { ProductManagementCandidate, ProductManagementCandidateKind, ProductManagementCandidatePage, ProductManagementCandidateQuery,
  ProductManagementListPage, ProductManagementListQuery, ProductManagementReadGrant, ProductManagementScopedRead,
  TrustedProductManagementSnapshotReader } from "../../../packages/application/src/product-management-query-ports.ts";
import { activeProductManagementRead, checkedProductManagementCandidatePage, checkedProductManagementGrant, checkedProductManagementListPage,
  parseProductManagementCandidateQuery, parseProductManagementListQuery } from "../../../packages/application/src/product-management-query-validation.ts";
import { checkedProductActor } from "../../../packages/application/src/product-query-validation.ts";
import { COMPLETE_SCOPE_DECISION } from "../../../packages/application/src/inventory-cutoff-import.ts";
import { checkedNativeRuntime26Capability, type NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import { DomainError, requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { booleanValue, integerValue, nullableString, stringValue } from "./codec.ts";
import { decodeImportCheckpoint } from "./inventory-cutoff-import-store.ts";
import { GUARD_CAPABILITY } from "./inventory-publication-guards.ts";
import type { PgProductQueryClient, PgProductQueryPool, PgProductQueryResult } from "./product-query-reader.ts";
import { catalogueRetainedDeleteEnabled, productSeasonArrayEnabled, productSeasonLabelJoin, type ProductSeasonArrayCapability, type CatalogueRetainedDeleteCapability } from "./product-query-reader.ts";
import { readInventoryKeyAdmissions } from "./inventory-key-admission-reader.ts";

export type PgProductManagementQueryPool = PgProductQueryPool;
type Query = (sql: string, values?: unknown[]) => Promise<PgProductQueryResult>;
type Row = Record<string, unknown>;
function integrity(condition: unknown, message: string): asserts condition { requireDomain(condition, "PRODUCT_MANAGEMENT_INTEGRITY_FAILED", message); }
function one(rows: readonly Row[]): Row { integrity(rows.length === 1, "Expected one product management evidence row"); return rows[0]!; }
function count(value: unknown): number {
  const text = stringValue(value); integrity(/^(?:0|[1-9]\d*)$/.test(text) && BigInt(text) <= BigInt(Number.MAX_SAFE_INTEGER), "Invalid exact product count"); return Number(text);
}
function scopeValues(grant: ProductManagementReadGrant): unknown[] { return [grant.kind === "all", grant.kind === "products" ? grant.productIds : []]; }
const scope = (retainedDelete: boolean) => `WITH authorized_products AS (SELECT p.* FROM naijue_erp.product p WHERE ${retainedDelete ? "p.deleted_at IS NULL AND " : ""}($1::boolean OR p.id = ANY($2::uuid[])))`;
const matched = (retainedDelete: boolean, seasonArray: boolean) => `${scope(retainedDelete)}, matched_products AS (SELECT p.* FROM authorized_products p
  WHERE (cardinality($3::uuid[]) = 0 OR p.id = ANY($3::uuid[]))
  AND (cardinality($4::uuid[]) = 0 OR p.category_id = ANY($4::uuid[]) OR EXISTS (
    SELECT 1 FROM naijue_erp.product_category c WHERE c.id = p.category_id AND c.parent_id = ANY($4::uuid[])))
  AND (cardinality($5::integer[]) = 0 OR p.year = ANY($5::integer[]))
  AND (cardinality($6::uuid[]) = 0 OR ${seasonArray ? "p.season_ids && $6::uuid[]" : "p.season_id = ANY($6::uuid[])"})
  AND (cardinality($7::uuid[]) = 0 OR p.supplier_id = ANY($7::uuid[]))
  AND (cardinality($8::uuid[]) = 0 OR EXISTS (SELECT 1 FROM naijue_erp.sku s WHERE s.product_id = p.id AND s.fit_id = ANY($8::uuid[])))
  AND (cardinality($9::text[]) = 0 OR p.thickness = ANY($9::text[]))
  AND (cardinality($10::text[]) = 0 OR p.collar_pants_type = ANY($10::text[])))`;
function listValues(grant: ProductManagementReadGrant, parameters: ProductManagementListQuery): unknown[] {
  const f = parameters.filter; return [...scopeValues(grant), f.productIds, f.categoryIds, f.years, f.seasonIds, f.supplierIds, f.fitIds, f.thicknesses, f.shapeCodes];
}
/** Reuses the existing complete cutoff publication contract, not a new readiness flag or fixture.
 * Checks the ENTIRE matched product scope and ALL native warehouses before any absence becomes 0.
 * A catalogue-only read never executes this inventory path. */
async function stockReadiness(query: Query, values: unknown[], matchedSql: string, runtime26?: NativeRuntime26Capability): Promise<void> {
  const rows = (await query(`/* product-management:publication */ SELECT b.id, b.checkpoint, b.completed_at IS NOT NULL AS completed,
    EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = b.id AND r.status = 'IMPORTED'
      AND r.target_type = 'IMPORT_BATCH' AND r.target_id = b.id AND r.source_entity_type = 'INVENTORY_SCOPE_APPROVAL'
      AND r.source_key = 'FINAL_COMPLETE_SCOPE' AND r.decision_reason = $1 AND r.source_record_hash = b.source_hash
      AND r.source_file_ref = b.source_manifest_ref) AS final_approval
    FROM naijue_erp.import_batch b WHERE b.status = 'IMPORTED' AND b.inventory_mode = 'CUTOFF_STOCK_BASELINE' ORDER BY b.id LIMIT 2`, [COMPLETE_SCOPE_DECISION])).rows;
  requireDomain(rows.length > 0, "PRODUCT_MANAGEMENT_STOCK_NOT_READY", "Complete all-warehouse inventory publication is unavailable");
  integrity(rows.length === 1, "Multiple published inventory scopes");
  const publication = rows[0]!, batchId = entityId("operation", stringValue(publication.id));
  integrity(booleanValue(publication.completed) && booleanValue(publication.final_approval), "Final complete inventory approval is unavailable");
  const checkpoint = decodeImportCheckpoint(publication.checkpoint);
  integrity(checkpoint.sequence > 0 && Object.entries(checkpoint.expected).every(([key, expected]) => checkpoint.counts[key as keyof typeof checkpoint.counts] === expected)
    && checkpoint.cursor === Object.values(checkpoint.counts).reduce((sum, amount) => sum + amount, 0), "Published inventory checkpoint is incomplete");
  integrity(booleanValue(one((await query(GUARD_CAPABILITY)).rows).integrity_guards_present), "Sparse inventory guards are unavailable");
  const row = one((await query(`/* product-management:stock-coverage */ ${matchedSql}
    SELECT EXISTS (SELECT 1 FROM naijue_erp.warehouse w WHERE NOT EXISTS (
      SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = $11::uuid AND r.status = 'IMPORTED' AND r.target_type = 'WAREHOUSE' AND r.target_id = w.id)) AS uncovered_warehouse,
    EXISTS (SELECT 1 FROM naijue_erp.sku s JOIN matched_products p ON p.id = s.product_id WHERE NOT EXISTS (
      SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = $11::uuid AND r.status = 'IMPORTED' AND r.target_type = 'SKU' AND r.target_id = s.id)) AS uncovered_sku,
    EXISTS (SELECT 1 FROM naijue_erp.sku s JOIN matched_products p ON p.id = s.product_id WHERE NOT EXISTS (
      SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id = p.size_group_id AND m.size_id = s.size_id)) AS invalid_size,
    EXISTS (SELECT 1 FROM matched_products p WHERE NOT EXISTS (SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id = p.size_group_id)) AS missing_sizes,
    EXISTS (SELECT 1 FROM naijue_erp.inventory_balance b JOIN naijue_erp.sku s ON s.id = b.sku_id JOIN matched_products p ON p.id = s.product_id
      WHERE b.version <= 0 OR b.last_operation_id IS NULL) AS invalid_balance`, [...values, batchId])).rows);
  const additionalWarehouses = booleanValue(row.uncovered_warehouse), additionalSkus = booleanValue(row.uncovered_sku);
  if (additionalWarehouses || additionalSkus) {
    requireDomain(runtime26 !== undefined, "PRODUCT_MANAGEMENT_STOCK_NOT_READY", "Requested all-warehouse stock is outside the complete published scope");
    await stockAdditions(query, values, matchedSql, batchId, additionalWarehouses, additionalSkus);
  }
  integrity(!booleanValue(row.invalid_size) && !booleanValue(row.missing_sizes) && !booleanValue(row.invalid_balance), "Native inventory facts are inconsistent");
}
/** Qualify only non-cutoff dimensions through the original public SQL decision.
 * One real opposite-dimension witness avoids a warehouses × SKUs expansion.
 * All identities are checked in bounded batches on the same RR snapshot. */
async function stockAdditions(query: Query, values: unknown[], matchedSql: string, batchId: string, warehouses: boolean, skus: boolean): Promise<void> {
  const admissions = async (keys: { warehouseId: string; skuId: string }[]) => {
    try { return await readInventoryKeyAdmissions({ query }, keys); }
    catch (error) {
      if (error instanceof DomainError && error.code === "INVENTORY_INTEGRITY_FAILED")
        throw new DomainError("PRODUCT_MANAGEMENT_INTEGRITY_FAILED", "Invalid native inventory admission evidence");
      throw error;
    }
  };
  if (warehouses) {
    let witness = (await query(`/* product-management:stock-sku-witness */ SELECT s.id FROM naijue_erp.import_record r
      JOIN naijue_erp.sku s ON s.id=r.target_id WHERE r.import_batch_id=$1::uuid AND r.status='IMPORTED' AND r.target_type='SKU'
      ORDER BY s.id LIMIT 1`, [batchId])).rows;
    let basis: "CUTOFF_MEMBER" | "POST_CUTOFF_CREATED" = "CUTOFF_MEMBER", operationId: string | null = null;
    if (!witness.length) {
      witness = (await query(`/* product-management:stock-native-sku-witness */ SELECT s.id,s.created_operation_id
        FROM naijue_erp.sku s WHERE s.created_operation_id IS NOT NULL ORDER BY s.id LIMIT 1`)).rows;
      basis = "POST_CUTOFF_CREATED";
    }
    requireDomain(witness.length > 0, "PRODUCT_MANAGEMENT_STOCK_NOT_READY", "No retained native SKU witness is available for warehouse qualification");
    const sku = one(witness), skuId = entityId("sku", stringValue(sku.id));
    if (basis === "POST_CUTOFF_CREATED") operationId = entityId("operation", stringValue(sku.created_operation_id));
    let cursor: string | null = null, checked = 0;
    for (;;) {
      const rows = (await query(`/* product-management:stock-additional-warehouses */ SELECT w.id FROM naijue_erp.warehouse w
        WHERE NOT EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=$1::uuid AND r.status='IMPORTED' AND r.target_type='WAREHOUSE' AND r.target_id=w.id)
        AND ($2::uuid IS NULL OR w.id>$2::uuid) ORDER BY w.id LIMIT 1000`, [batchId, cursor])).rows;
      integrity(rows.length <= 1000 && (rows.length > 0 || checked > 0), "Uncovered warehouse qualification returned an invalid identity batch");
      if (!rows.length) break;
      const keys = rows.map(row => { const warehouseId = entityId("warehouse", stringValue(row.id)); integrity(cursor === null || warehouseId > cursor, "Warehouse qualification did not advance"); cursor = warehouseId; return { warehouseId, skuId }; });
      for (const decision of await admissions(keys)) {
        requireDomain(decision.admitted, "PRODUCT_MANAGEMENT_STOCK_NOT_READY", "New warehouse creation is not qualified");
        integrity(decision.publishedBatchId === batchId && decision.warehouseBasis === "POST_CUTOFF_CREATED" && decision.skuBasis === basis
          && (basis === "CUTOFF_MEMBER" || decision.skuCreatedOperationId === operationId), "Warehouse admission differs from its native witness");
      }
      checked += rows.length; if (rows.length < 1000) break;
    }
  }
  if (skus) {
    const warehouseId = entityId("warehouse", stringValue(one((await query(`/* product-management:stock-warehouse-witness */ SELECT id FROM naijue_erp.warehouse ORDER BY id LIMIT 1`)).rows).id));
    let cursor: string | null = null, checked = 0;
    for (;;) {
      const rows = (await query(`/* product-management:stock-additional-skus */ ${matchedSql} SELECT s.id FROM naijue_erp.sku s JOIN matched_products p ON p.id=s.product_id
        WHERE NOT EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=$11::uuid AND r.status='IMPORTED' AND r.target_type='SKU' AND r.target_id=s.id)
        AND ($12::uuid IS NULL OR s.id>$12::uuid) ORDER BY s.id LIMIT 1000`, [...values, batchId, cursor])).rows;
      integrity(rows.length <= 1000 && (rows.length > 0 || checked > 0), "Uncovered SKU qualification returned an invalid identity batch");
      if (!rows.length) break;
      const keys = rows.map(row => { const skuId = entityId("sku", stringValue(row.id)); integrity(cursor === null || skuId > cursor, "SKU qualification did not advance"); cursor = skuId; return { warehouseId, skuId }; });
      for (const decision of await admissions(keys)) {
        requireDomain(decision.admitted, "PRODUCT_MANAGEMENT_STOCK_NOT_READY", "New SKU creation is not qualified");
        integrity(decision.publishedBatchId === batchId && decision.skuBasis === "POST_CUTOFF_CREATED", "SKU admission differs from its published creation basis");
      }
      checked += rows.length; if (rows.length < 1000) break;
    }
  }
}
/** Native schema has no product created_at. Ordering is explicitly product_code COLLATE C,id;
 * original Demo's created-time ordering is not invented. Construction performs no I/O.
 * Abort checks stop subsequent work; pool acquisition/in-flight SQL require host driver timeouts. */
export class PostgresProductManagementQueryReader implements TrustedProductManagementSnapshotReader {
  private readonly pool: PgProductManagementQueryPool;
  private readonly retainedDelete: boolean; private readonly seasonArray: boolean;
  private readonly runtime26: NativeRuntime26Capability | undefined;
  constructor(pool: PgProductManagementQueryPool, capability: CatalogueRetainedDeleteCapability | null = null, seasonCapability: ProductSeasonArrayCapability | null = null, runtime26?: NativeRuntime26Capability) {
    if (typeof pool?.connect !== "function") throw new TypeError("Product management reader requires an explicit PostgreSQL pool");
    this.pool = pool; this.retainedDelete = catalogueRetainedDeleteEnabled(pool, capability); this.seasonArray = productSeasonArrayEnabled(pool, seasonCapability);
    this.runtime26 = checkedNativeRuntime26Capability(runtime26);
  }
  private async snapshot<T>(signal: AbortSignal, work: (query: Query, client: PgProductQueryClient) => Promise<T>): Promise<T> {
    activeProductManagementRead(signal); const client = await this.pool.connect(); let began = false, committing = false; let discard: Error | undefined;
    const query: Query = (sql, values = []) => { activeProductManagementRead(signal); return client.query(sql, values); };
    try {
      activeProductManagementRead(signal); await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
      const result = await work(query, client); activeProductManagementRead(signal); committing = true; await query("COMMIT"); began = false;
      activeProductManagementRead(signal); return result;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error("Product management snapshot failed");
      if (began) try { await client.query("ROLLBACK"); } catch (rollbackError) {
        discard = rollbackError instanceof Error ? rollbackError : new Error("Product management rollback failed");
        throw new AggregateError([error, rollbackError], "Product management read and rollback failed; client discarded");
      }
      throw error;
    } finally { client.release(discard); }
  }
  async readList(read: ProductManagementScopedRead<ProductManagementListQuery>): Promise<ProductManagementListPage> {
    checkedProductActor(read.actor); const grant = checkedProductManagementGrant(read.grant), parameters = parseProductManagementListQuery(read.parameters);
    return this.snapshot(read.signal, async (query, client) => {
      if (grant.totalStock === "all-warehouses" && this.runtime26) { await this.runtime26.assertReady(client, "INVENTORY_ADMISSION"); activeProductManagementRead(read.signal); }
      const values = listValues(grant, parameters), matchedSql = matched(this.retainedDelete, this.seasonArray);
      const status = one((await query(`/* product-management:count */ ${matchedSql} SELECT count(*)::text AS exact_total,
        EXISTS (SELECT 1 FROM matched_products p JOIN naijue_erp.product_category c ON c.id = p.category_id
          JOIN naijue_erp.product_category parent ON parent.id = c.parent_id WHERE parent.parent_id IS NOT NULL) AS invalid_category_tree FROM matched_products`, values)).rows);
      integrity(!booleanValue(status.invalid_category_tree), "Native categories exceed the two-level contract");
      const total = count(status.exact_total);
      if (grant.totalStock === "all-warehouses") await stockReadiness(query, values, matchedSql, this.runtime26);
      const rows = (await query(`/* product-management:page */ ${matchedSql}
        SELECT p.id, p.product_code, p.name, c.name AS category_name, p.year, se.name AS season_name, su.name AS supplier_name,
          p.thickness, p.retail_price::text FROM matched_products p JOIN naijue_erp.product_category c ON c.id = p.category_id
        ${productSeasonLabelJoin(this.seasonArray)} LEFT JOIN naijue_erp.supplier su ON su.id = p.supplier_id
        ORDER BY p.product_code COLLATE "C", p.id LIMIT $11 OFFSET $12`, [...values, parameters.pageSize, (parameters.page - 1) * parameters.pageSize])).rows;
      integrity(rows.length <= parameters.pageSize, "Unbounded product page");
      const ids = rows.map(row => entityId("product", stringValue(row.id)));
      const fitRows = ids.length ? (await query(`/* product-management:fits */ SELECT DISTINCT s.product_id, f.id, f.name, f.code COLLATE "C" AS code
        FROM naijue_erp.sku s JOIN naijue_erp.fit f ON f.id = s.fit_id WHERE s.product_id = ANY($1::uuid[])
        ORDER BY s.product_id, f.code COLLATE "C", f.id LIMIT 50001`, [ids])).rows : [];
      requireDomain(fitRows.length <= 50_000, "PRODUCT_MANAGEMENT_READ_TOO_LARGE", "Product page specifications exceed response bound");
      const fits = new Map<string, { id: string; label: string }[]>();
      for (const row of fitRows) {
        const productId = entityId("product", stringValue(row.product_id)); integrity(ids.includes(productId), "Fit belongs to another product page");
        const fit = { id: entityId("fit", stringValue(row.id)), label: stringValue(row.name) };
        const productFits = fits.get(productId) ?? []; integrity(!productFits.some(value => value.id === fit.id), "Repeated product fit");
        productFits.push(fit); fits.set(productId, productFits);
      }
      const stockRows = grant.totalStock === "all-warehouses" && ids.length ? (await query(`/* product-management:stock */ SELECT p.id,
        coalesce(sum(b.quantity), 0)::text AS quantity FROM naijue_erp.product p LEFT JOIN naijue_erp.sku s ON s.product_id = p.id
        LEFT JOIN naijue_erp.inventory_balance b ON b.sku_id = s.id WHERE p.id = ANY($1::uuid[]) GROUP BY p.id ORDER BY p.id`, [ids])).rows : [];
      const totals = new Map<string, string>();
      for (const row of stockRows) { const id = entityId("product", stringValue(row.id)); integrity(ids.includes(id) && !totals.has(id), "Mismatched total stock target"); totals.set(id, stringValue(row.quantity)); }
      integrity(grant.totalStock !== "all-warehouses" || totals.size === ids.length, "Missing exact all-warehouse stock result");
      const result = { page: parameters.page, pageSize: parameters.pageSize, exactTotal: total, items: rows.map(row => {
        const id = entityId("product", stringValue(row.id));
        return { id, code: stringValue(row.product_code), name: stringValue(row.name), categoryLabel: nullableString(row.category_name), year: row.year === null ? null : integerValue(row.year),
          seasonLabel: nullableString(row.season_name), supplierLabel: nullableString(row.supplier_name), fits: fits.get(id) ?? [], thickness: nullableString(row.thickness),
          retailPrice: nullableString(row.retail_price), totalStock: grant.totalStock === "all-warehouses" ? totals.get(id)! : null };
      }) };
      try { return checkedProductManagementListPage(result); } catch { throw new Error("Invalid native product management list response"); }
    });
  }
  async readCandidates(read: ProductManagementScopedRead<ProductManagementCandidateQuery>): Promise<ProductManagementCandidatePage> {
    checkedProductActor(read.actor); const grant = checkedProductManagementGrant(read.grant), parameters = parseProductManagementCandidateQuery(read.parameters);
    return this.snapshot(read.signal, async query => {
      const candidates = candidateSource(parameters.kind, this.seasonArray);
      const sql = `${scope(this.retainedDelete)}, native_candidates AS (${candidates}), matched_candidates AS (SELECT * FROM native_candidates
        WHERE (cardinality($3::text[]) = 0 OR id = ANY($3::text[])) AND ($4::text = '' OR strpos(lower(search_text), lower($4::text)) > 0))`;
      const values = [...scopeValues(grant), parameters.selectedIds, parameters.search];
      const total = count(one((await query(`/* product-management:candidate-count */ ${sql} SELECT count(*)::text AS exact_total FROM matched_candidates`, values)).rows).exact_total);
      const rows = (await query(`/* product-management:candidate-page */ ${sql} SELECT * FROM matched_candidates ORDER BY sort_text COLLATE "C", id LIMIT $5 OFFSET $6`,
        [...values, parameters.pageSize, (parameters.page - 1) * parameters.pageSize])).rows;
      const items: ProductManagementCandidate[] = rows.map(row => {
        if (parameters.kind === "category") integrity(row.parent_parent_id === null, "Native categories exceed the two-level contract");
        return { id: stringValue(row.id), label: stringValue(row.label),
        ...(parameters.kind === "product" ? { code: stringValue(row.code), name: stringValue(row.name) } : {}),
        ...(parameters.kind === "category" ? { parentId: nullableString(row.parent_id), depth: row.parent_id === null ? 0 as const : 1 as const,
          ...(row.parent_name === null ? {} : { parentLabel: stringValue(row.parent_name) }) } : {}) };
      });
      try { return checkedProductManagementCandidatePage({ page: parameters.page, pageSize: 20, exactTotal: total, items }, parameters.kind); }
      catch { throw new Error("Invalid native product management candidates response"); }
    });
  }
}
/** Only fixed trusted SQL fragments are selected by validated enum. No client field becomes SQL.
 * Dictionary options are native values related to authorized products, not all-account enumeration. */
function candidateSource(kind: ProductManagementCandidateKind, seasonArray: boolean): string {
  switch (kind) {
    case "product": return `SELECT p.id::text, p.product_code || ' ' || p.name AS label, p.product_code AS code, p.name,
      p.product_code || ' ' || p.name || ' ' || coalesce(p.system_item_code, '') AS search_text, p.product_code AS sort_text FROM authorized_products p`;
    case "category": return `SELECT DISTINCT c.id::text, c.name AS label, c.parent_id::text, parent.name AS parent_name, parent.parent_id::text AS parent_parent_id,
      coalesce(parent.name || ' / ', '') || c.name AS search_text, coalesce(parent.name || ' / ', '') || c.name AS sort_text
      FROM authorized_products p JOIN naijue_erp.product_category child ON child.id = p.category_id
      JOIN naijue_erp.product_category c ON c.id = child.id OR c.id = child.parent_id
      LEFT JOIN naijue_erp.product_category parent ON parent.id = c.parent_id`;
    case "year": return `SELECT DISTINCT p.year::text AS id, p.year::text || '年' AS label, p.year::text AS search_text, p.year::text AS sort_text FROM authorized_products p WHERE p.year IS NOT NULL`;
    case "season": return `SELECT DISTINCT d.id::text, d.name AS label, d.code || ' ' || d.name AS search_text, d.code AS sort_text FROM authorized_products p ${seasonArray ? "CROSS JOIN LATERAL unnest(p.season_ids) selected(season_id) JOIN naijue_erp.season d ON d.id=selected.season_id" : "JOIN naijue_erp.season d ON d.id = p.season_id"}`;
    case "supplier": return `SELECT DISTINCT d.id::text, d.name AS label, d.code || ' ' || d.name AS search_text, d.code AS sort_text FROM authorized_products p JOIN naijue_erp.supplier d ON d.id = p.supplier_id WHERE d.enabled = true`;
    case "fit": return `SELECT DISTINCT d.id::text, d.name AS label, d.code || ' ' || d.name AS search_text, d.code AS sort_text FROM authorized_products p JOIN naijue_erp.sku s ON s.product_id = p.id JOIN naijue_erp.fit d ON d.id = s.fit_id WHERE d.enabled = true`;
    case "thickness": return `SELECT DISTINCT p.thickness AS id, p.thickness AS label, p.thickness AS search_text, p.thickness AS sort_text FROM authorized_products p WHERE p.thickness IS NOT NULL`;
    case "shape": return `SELECT DISTINCT p.collar_pants_type AS id, p.collar_pants_type AS label, p.collar_pants_type AS search_text, p.collar_pants_type AS sort_text FROM authorized_products p WHERE p.collar_pants_type IS NOT NULL`;
  }
}
