import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { INVENTORY_MATRIX_CHUNK_MAX_UNITS, INVENTORY_PRODUCT_MAX_SIZES, INVENTORY_PRODUCT_MAX_VARIANTS, INVENTORY_TEXT_MAX_CHARS, INVENTORY_TOTAL_MAX_CHARS } from "../../../packages/application/src/inventory-query-contracts.ts";
import type { InventoryCandidatePage, InventoryCandidateQuery, InventoryQuery, InventoryQueryCandidate, InventoryQueryColorFit, InventoryQueryPage, InventoryQueryProduct, InventoryReadScope, InventoryReadSnapshot, InventoryScopedRead, InventorySelection, InventoryStockCell, InventoryStockTotal, InventoryOutputFrame, TrustedInventorySnapshotReader } from "../../../packages/application/src/inventory-query-contracts.ts";
import { checkedInventoryActor } from "../../../packages/application/src/inventory-query-service.ts";
import { checkedCandidateSnapshot, checkedInventorySnapshot } from "../../../packages/application/src/inventory-query-response.ts";
import { checkedInventoryScope, parseInventoryCandidateQuery, parseInventoryQuery, record } from "../../../packages/application/src/inventory-query-validation.ts";
import { COMPLETE_SCOPE_DECISION } from "../../../packages/application/src/inventory-cutoff-import.ts";
import { DomainError, requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { EntityKind } from "../../../packages/domain/src/values.ts";
import { booleanValue, integerValue, quantityFromSql, stringValue, versionFromSql } from "./codec.ts";
import { decodeImportCheckpoint } from "./inventory-cutoff-import-store.ts";
import { GUARD_CAPABILITY } from "./inventory-publication-guards.ts";
import { productSeasonArrayEnabled, productSeasonLabelJoin, type ProductSeasonArrayCapability } from "./product-query-reader.ts";
import { checkedNativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import { readInventoryKeyAdmissions } from "./inventory-key-admission-reader.ts";

export interface PgInventoryQueryResult { readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }
export interface PgInventoryQueryClient {
  query(text: string, values?: unknown[]): Promise<PgInventoryQueryResult>;
  release(error?: Error | boolean): void;
}
export interface PgInventoryQueryPool { connect(): Promise<PgInventoryQueryClient> }
type PgPoolCompatibility = Pool extends PgInventoryQueryPool ? true : never;
const pgPoolCompatibility: PgPoolCompatibility = true; void pgPoolCompatibility;
/** Technical response/work limits, not business catalogue maxima. Overflow fails the whole read. */
export const INVENTORY_READ_MAX_PAGE_SIZES = 50_000;
export const INVENTORY_READ_MAX_PAGE_SKUS = 50_000;
export const INVENTORY_READ_MAX_PAGE_BALANCES = 250_000;
export const INVENTORY_READ_MAX_MATRIX_UNITS = INVENTORY_MATRIX_CHUNK_MAX_UNITS;
type Query = (sql: string, values?: unknown[]) => Promise<PgInventoryQueryResult>;
type Row = Record<string, unknown>;
const id = (kind: EntityKind, value: unknown): string => entityId(kind, stringValue(value));
function integrity(condition: unknown, message: string): asserts condition {
  requireDomain(condition, "INVENTORY_INTEGRITY_FAILED", message);
}
function active(signal: AbortSignal): void {
  requireDomain(!signal.aborted, "INVENTORY_READ_ABORTED", "Inventory read no longer active");
}
function label(value: unknown): string {
  const text = stringValue(value);
  integrity(text.trim().length > 0 && text.length <= INVENTORY_TEXT_MAX_CHARS && !/[\u0000-\u001f\u007f]/.test(text), "Invalid native inventory label");
  return text;
}
function aggregate(value: unknown): bigint {
  const text = stringValue(value);
  integrity(/^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(text) && text.length <= INVENTORY_TOTAL_MAX_CHARS, "Invalid exact inventory aggregate");
  return BigInt(text);
}
function count(value: unknown): number {
  const result = aggregate(value);
  integrity(result >= 0n && result <= BigInt(Number.MAX_SAFE_INTEGER), "Inventory count cannot be represented by the native DTO");
  return Number(result);
}
function one(result: PgInventoryQueryResult): Row { integrity(result.rows.length === 1, "Expected one native inventory evidence row"); return result.rows[0]!; }
function bounded(rows: { readonly length: number }, maximum: number): void {
  requireDomain(rows.length <= maximum, "INVENTORY_READ_TOO_LARGE", "Inventory page exceeds a technical response bound");
}
function total(value: bigint): InventoryStockTotal { return { knownQuantity: value.toString(), completeness: "complete", unknownCells: 0 }; }
function totalOf(values: readonly InventoryStockTotal[]): InventoryStockTotal { return total(values.reduce((sum, value) => sum + BigInt(value.knownQuantity), 0n)); }
function quantities(sizes: readonly InventorySelection[], groups: readonly { readonly sizeTotals: Readonly<Record<string, InventoryStockTotal>> }[]): Readonly<Record<string, InventoryStockTotal>> {
  return Object.fromEntries(sizes.map(size => [size.id, totalOf(groups.map(group => group.sizeTotals[size.id]!))]));
}
function checkedParameters(value: InventoryQuery): InventoryQuery {
  // Reuse the public parser's ID, uniqueness, pagination and selection bounds without accepting labels as facts.
  const input = record(value, ["filter", "page", "pageSize"]);
  const filter = record(input.filter, ["productIds", "categoryIds", "warehouseIds", "supplierIds", "fitIds", "seasonIds"]);
  const selections = (value: unknown) => Array.isArray(value) ? value.map(id => ({ id, label: "native-id" })) : value;
  return parseInventoryQuery({ page: input.page, pageSize: input.pageSize, filter: {
    products: selections(filter.productIds), categories: selections(filter.categoryIds),
    warehouses: selections(filter.warehouseIds), suppliers: selections(filter.supplierIds), fits: selections(filter.fitIds), seasons: selections(filter.seasonIds)
  } });
}
function inventoryScope(scope: InventoryReadScope, parameters: InventoryQuery): InventoryReadScope {
  const checked = checkedInventoryScope(scope);
  requireDomain(parameters.filter.warehouseIds.every(id => checked.warehouses.some(warehouse => warehouse.id === id)), "FORBIDDEN", "Requested warehouse is outside authorized inventory scope");
  return parameters.filter.warehouseIds.length === 0 ? checked : checkedInventoryScope({ hallIds: checked.hallIds,
    warehouses: checked.warehouses.filter(warehouse => parameters.filter.warehouseIds.includes(warehouse.id)) });
}

async function publishedBatch(query: Query): Promise<string> {
  // Publication did the one full source/balance reconciliation. The immutable final receipt below is
  // constant-size evidence; do NOT materialize all W+SKU members or re-count source history per page.
  const rows = (await query(`/* inventory:publication */ SELECT b.id, b.checkpoint, b.completed_at IS NOT NULL AS completed,
    EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = b.id AND r.status = 'IMPORTED'
      AND r.target_type = 'IMPORT_BATCH' AND r.target_id = b.id AND r.source_entity_type = 'INVENTORY_SCOPE_APPROVAL'
      AND r.source_key = 'FINAL_COMPLETE_SCOPE' AND r.decision_reason = $1 AND r.source_record_hash = b.source_hash
      AND r.source_file_ref = b.source_manifest_ref) AS final_approval
    FROM naijue_erp.import_batch b WHERE b.status = 'IMPORTED' AND b.inventory_mode = 'CUTOFF_STOCK_BASELINE' ORDER BY b.id LIMIT 2`, [COMPLETE_SCOPE_DECISION])).rows;
  requireDomain(rows.length > 0, "INVENTORY_NOT_READY", "No completely published inventory takeover is available");
  integrity(rows.length === 1, "Multiple published initial scopes are not legal");
  const row = rows[0]!; const batchId = id("operation", row.id);
  integrity(booleanValue(row.completed) && booleanValue(row.final_approval), "Published complete-scope approval is unavailable");
  const checkpoint = decodeImportCheckpoint(row.checkpoint);
  integrity(checkpoint.sequence > 0 && Object.entries(checkpoint.expected).every(([kind, expected]) => checkpoint.counts[kind as keyof typeof checkpoint.counts] === expected)
    && checkpoint.cursor === Object.values(checkpoint.counts).reduce((sum, value) => sum + value, 0), "Published checkpoint is incomplete");
  integrity(booleanValue(one(await query(GUARD_CAPABILITY)).integrity_guards_present), "Native sparse inventory guards are unavailable");
  return batchId;
}
async function verifyWarehouses(query: Query, scope: InventoryReadScope, batchId: string, runtime26?: NativeRuntime26Capability): Promise<void> {
  const rows = (await query(`/* inventory:warehouses */ SELECT w.id, w.hall_id, w.name,
    EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = $3::uuid AND r.status = 'IMPORTED'
      AND r.target_type = 'WAREHOUSE' AND r.target_id = w.id) AS published
    FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id = w.hall_id
    WHERE w.id = ANY($1::uuid[]) AND w.hall_id = ANY($2::uuid[]) ORDER BY w.id LIMIT 1001`,
  [scope.warehouses.map(row => row.id), scope.hallIds, batchId])).rows;
  integrity(rows.length === scope.warehouses.length, "Authorized warehouse/hall facts are stale or unavailable");
  const seen = new Set<string>(), additional: string[] = [];
  for (const row of rows) {
    const warehouseId = id("warehouse", row.id); const nativeHallId = id("hall", row.hall_id);
    const authorized = scope.warehouses.find(item => item.id === warehouseId);
    integrity(authorized && !seen.has(warehouseId) && authorized.hallId === nativeHallId && authorized.label === label(row.name), "Authorized warehouse identity or display facts differ from native data");
    if (!booleanValue(row.published)) {
      requireDomain(runtime26 !== undefined, "INVENTORY_NOT_READY", "Authorized warehouse is outside the completely published scope"); additional.push(warehouseId);
    }
    seen.add(warehouseId);
  }
  if (additional.length) {
    // A real retained cutoff member is only a qualification witness. It never
    // replaces a selected business SKU or supplies stock/identity to the DTO.
    const witness = (await query(`/* inventory:admission-witness */ SELECT s.id FROM naijue_erp.import_record r
      JOIN naijue_erp.sku s ON s.id=r.target_id WHERE r.import_batch_id=$1::uuid AND r.status='IMPORTED' AND r.target_type='SKU'
      ORDER BY s.id LIMIT 1`, [batchId])).rows;
    requireDomain(witness.length > 0, "INVENTORY_NOT_READY", "No retained native SKU witness is available for warehouse qualification"); integrity(witness.length === 1, "Invalid warehouse qualification witness");
    const skuId = id("sku", witness[0]!.id), decisions = await readInventoryKeyAdmissions({ query }, additional.map(warehouseId => ({ warehouseId, skuId })));
    for (const decision of decisions) { requireDomain(decision.admitted, "INVENTORY_NOT_READY", "New warehouse creation is not qualified"); integrity(decision.publishedBatchId === batchId && decision.warehouseBasis === "POST_CUTOFF_CREATED" && decision.skuBasis === "CUTOFF_MEMBER", "New warehouse admission differs from its cutoff/creation witness"); }
  }
}

/** Fixed positions keep every warehouse/hall/filter/batch value parameterized across all set queries.
 * Catalogues have no hall ownership column: warehouse/hall intersection bounds the stock relation,
 * while the native product catalogue is shared. No stock-presence predicate hides zero-stock products. */
const catalog = (seasonArray: boolean) => `WITH published_scope AS (
  SELECT id FROM naijue_erp.import_batch WHERE id = $8::uuid AND status = 'IMPORTED' AND inventory_mode = 'CUTOFF_STOCK_BASELINE'
), authorized_warehouses AS (
  SELECT w.id FROM naijue_erp.warehouse w WHERE w.id = ANY($1::uuid[]) AND w.hall_id = ANY($2::uuid[]) AND EXISTS (SELECT 1 FROM published_scope)
), matched_products AS (
  SELECT p.id, p.size_group_id FROM naijue_erp.product p WHERE EXISTS (SELECT 1 FROM authorized_warehouses)
    AND (cardinality($3::uuid[]) = 0 OR p.id = ANY($3::uuid[])) AND (cardinality($4::uuid[]) = 0 OR p.category_id = ANY($4::uuid[]) OR EXISTS (
      SELECT 1 FROM naijue_erp.product_category category WHERE category.id = p.category_id AND category.parent_id = ANY($4::uuid[])))
    AND (cardinality($5::uuid[]) = 0 OR p.supplier_id = ANY($5::uuid[]))
    AND (cardinality($7::uuid[]) = 0 OR ${seasonArray ? "p.season_ids && $7::uuid[]" : "p.season_id = ANY($7::uuid[])"})
    AND (cardinality($6::uuid[]) = 0 OR EXISTS (SELECT 1 FROM naijue_erp.sku sf WHERE sf.product_id = p.id AND sf.fit_id = ANY($6::uuid[])))
), filtered_skus AS (
  SELECT s.id, s.product_id, s.color_id, s.fit_id, s.size_id, p.size_group_id FROM naijue_erp.sku s JOIN matched_products p ON p.id = s.product_id
    WHERE cardinality($6::uuid[]) = 0 OR s.fit_id = ANY($6::uuid[])
)`;
function parameters(scope: InventoryReadScope, filter: InventoryQuery["filter"], batchId: string): unknown[] {
  return [scope.warehouses.map(row => row.id), scope.hallIds, filter.productIds, filter.categoryIds, filter.supplierIds, filter.fitIds, filter.seasonIds, batchId];
}
async function verifyAdditionalSkus(query: Query, prefix: string, values: unknown[], relation: "filtered_skus" | "candidate_skus"): Promise<void> {
  const warehouseId = (values[0] as readonly string[])[0]!, batchId = id("operation", values[7]), cursorParameter = values.length + 1;
  let cursor: string | null = null, checked = 0;
  for (;;) {
    const rows = (await query(`/* inventory:additional-skus */ ${prefix} SELECT s.id FROM ${relation} s
      WHERE NOT EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=$8::uuid AND r.status='IMPORTED' AND r.target_type='SKU' AND r.target_id=s.id)
        AND ($${cursorParameter}::uuid IS NULL OR s.id>$${cursorParameter}::uuid) ORDER BY s.id LIMIT 1000`, [...values, cursor])).rows;
    integrity(rows.length <= 1000, "New SKU qualification batch exceeds the existing exact-key bound"); if (!rows.length) { integrity(checked > 0, "Uncovered SKU proof returned no matching identities"); return; }
    const keys = rows.map(row => { const skuId = id("sku", row.id); integrity(cursor === null || skuId > cursor, "New SKU qualification did not advance"); cursor = skuId; return { warehouseId, skuId }; });
    // Every authorized warehouse was qualified above. One such exact native
    // dimension suffices for the public function's independent SKU basis.
    const decisions = await readInventoryKeyAdmissions({ query }, keys);
    for (const decision of decisions) { requireDomain(decision.admitted, "INVENTORY_NOT_READY", "New SKU creation is not qualified"); integrity(decision.publishedBatchId === batchId && decision.skuBasis === "POST_CUTOFF_CREATED", "New SKU admission differs from its cutoff/creation basis"); }
    checked += keys.length;
    if (rows.length < 1000) return;
  }
}
async function catalogStatus(query: Query, values: unknown[], seasonArray: boolean, runtime26?: NativeRuntime26Capability): Promise<{ exactTotal: number; allMatchesTotal: InventoryStockTotal }> {
  const row = one(await query(`/* inventory:catalog-status */ ${catalog(seasonArray)}
    SELECT (SELECT count(*)::text FROM matched_products) AS exact_total,
    EXISTS (SELECT 1 FROM naijue_erp.product_category child JOIN naijue_erp.product_category parent ON parent.id = child.parent_id
      WHERE parent.parent_id IS NOT NULL) AS invalid_category_tree,
    EXISTS (SELECT 1 FROM matched_products p WHERE NOT EXISTS (SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id = p.size_group_id)) AS missing_sizes,
    EXISTS (SELECT 1 FROM filtered_skus s WHERE NOT EXISTS (SELECT 1 FROM naijue_erp.import_record r
      WHERE r.import_batch_id = $8::uuid AND r.status = 'IMPORTED' AND r.target_type = 'SKU' AND r.target_id = s.id)) AS uncovered_sku,
    EXISTS (SELECT 1 FROM filtered_skus s WHERE NOT EXISTS (
      SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id = s.size_group_id AND m.size_id = s.size_id)) AS invalid_sku_size,
    EXISTS (SELECT 1 FROM naijue_erp.inventory_balance b JOIN filtered_skus s ON s.id = b.sku_id
      JOIN authorized_warehouses w ON w.id = b.warehouse_id WHERE b.version <= 0 OR b.last_operation_id IS NULL) AS invalid_balance,
    (SELECT coalesce(sum(b.quantity), 0)::text FROM naijue_erp.inventory_balance b
      JOIN filtered_skus s ON s.id = b.sku_id JOIN authorized_warehouses w ON w.id = b.warehouse_id) AS quantity`, values));
  // This is over the WHOLE requested filter, never just the visible product IDs.
  if (booleanValue(row.uncovered_sku)) {
    requireDomain(runtime26 !== undefined, "INVENTORY_NOT_READY", "Filtered catalogue contains SKU identities outside the published complete scope");
    await verifyAdditionalSkus(query, catalog(seasonArray), values, "filtered_skus");
  }
  integrity(!booleanValue(row.invalid_category_tree) && !booleanValue(row.missing_sizes) && !booleanValue(row.invalid_sku_size) && !booleanValue(row.invalid_balance), "Filtered native inventory facts are inconsistent");
  return { exactTotal: count(row.exact_total), allMatchesTotal: total(aggregate(row.quantity)) };
}
/** Candidate options do not return stock or infer any absent balance. Validate only the returned
 * native IDs and the catalogue relationships they denote, never broad off-search stock readiness. */
async function verifyCandidateMembership(query: Query, values: unknown[], kind: InventoryCandidateQuery["kind"], ids: readonly string[], seasonArray: boolean, runtime26?: NativeRuntime26Capability): Promise<void> {
  if (ids.length === 0 || kind === "warehouse" || kind === "category") return;
  const target = { product: "p.id = ANY($9::uuid[])",
    supplier: "native.supplier_id = ANY($9::uuid[])", season: seasonArray ? "native.season_ids && $9::uuid[]" : "native.season_id = ANY($9::uuid[])",
    fit: "EXISTS (SELECT 1 FROM naijue_erp.sku actual WHERE actual.product_id = p.id AND actual.fit_id = ANY($9::uuid[]))" }[kind];
  const fit = kind === "fit" ? "WHERE s.fit_id = ANY($9::uuid[])" : "";
  const candidateScope = `${catalog(seasonArray)}, candidate_products AS (
    SELECT p.id, p.size_group_id FROM matched_products p JOIN naijue_erp.product native ON native.id = p.id WHERE ${target}
  ), candidate_skus AS (
    SELECT s.id, s.product_id, s.size_id FROM naijue_erp.sku s JOIN candidate_products p ON p.id = s.product_id ${fit}
  )`;
  const row = one(await query(`/* inventory:candidate-integrity */ ${candidateScope} SELECT
    EXISTS (SELECT 1 FROM candidate_products p WHERE NOT EXISTS (
      SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id = p.size_group_id)) AS missing_sizes,
    EXISTS (SELECT 1 FROM candidate_products p JOIN naijue_erp.product native ON native.id = p.id
      JOIN naijue_erp.product_category child ON child.id = native.category_id
      JOIN naijue_erp.product_category parent ON parent.id = child.parent_id WHERE parent.parent_id IS NOT NULL) AS invalid_category_tree,
    EXISTS (SELECT 1 FROM candidate_skus s WHERE NOT EXISTS (SELECT 1 FROM naijue_erp.import_record r
      WHERE r.import_batch_id = $8::uuid AND r.status = 'IMPORTED' AND r.target_type = 'SKU' AND r.target_id = s.id)) AS uncovered_sku,
    EXISTS (SELECT 1 FROM candidate_skus s JOIN candidate_products p ON p.id = s.product_id WHERE NOT EXISTS (
      SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id = p.size_group_id AND m.size_id = s.size_id)) AS invalid_sku_size`, [...values, ids]));
  if (booleanValue(row.uncovered_sku)) {
    requireDomain(runtime26 !== undefined, "INVENTORY_NOT_READY", "Returned candidate denotes SKU identities outside the published scope");
    await verifyAdditionalSkus(query, candidateScope, [...values, ids], "candidate_skus");
  }
  integrity(!booleanValue(row.missing_sizes) && !booleanValue(row.invalid_category_tree) && !booleanValue(row.invalid_sku_size), "Returned native candidate catalogue relationships are inconsistent");
}

interface ProductFacts { readonly row: Row; readonly id: string; readonly groupId: string; readonly sizes: InventorySelection[]; readonly skus: SkuFacts[] }
interface SkuFacts { readonly id: string; readonly color: InventorySelection; readonly fit: InventorySelection; readonly sizeId: string }
function pageProducts(productRows: readonly Row[], sizeRows: readonly Row[], skuRows: readonly Row[], balanceRows: readonly Row[], scope: InventoryReadScope): InventoryQueryProduct[] {
  const products = new Map<string, ProductFacts>();
  for (const row of productRows) {
    const productId = id("product", row.id); integrity(!products.has(productId), "Repeated native product identity");
    products.set(productId, { row, id: productId, groupId: id("sizeGroup", row.size_group_id), sizes: [], skus: [] });
  }
  for (const row of sizeRows) {
    const product = products.get(id("product", row.product_id)); const sizeId = id("size", row.size_id);
    integrity(product && product.groupId === id("sizeGroup", row.size_group_id) && !product.sizes.some(size => size.id === sizeId), "Invalid page size-group membership");
    integerValue(row.display_order); product.sizes.push({ id: sizeId, label: label(row.size_name) });
  }
  const skuIds = new Set<string>(); const coordinates = new Set<string>();
  for (const row of skuRows) {
    const product = products.get(id("product", row.product_id)); const skuId = id("sku", row.id); const sizeId = id("size", row.size_id);
    const color = { id: id("color", row.color_id), label: label(row.color_name) }; const fit = { id: id("fit", row.fit_id), label: label(row.fit_name) };
    const coordinate = JSON.stringify([product?.id, color.id, fit.id, sizeId]);
    integrity(product && product.sizes.some(size => size.id === sizeId) && !skuIds.has(skuId) && !coordinates.has(coordinate), "Native SKU identity or coordinate is inconsistent");
    skuIds.add(skuId); coordinates.add(coordinate); product.skus.push({ id: skuId, color, fit, sizeId });
  }
  const balances = new Map<string, string>();
  for (const row of balanceRows) {
    const warehouseId = id("warehouse", row.warehouse_id); const skuId = id("sku", row.sku_id); const key = `${warehouseId}:${skuId}`;
    integrity(scope.warehouses.some(warehouse => warehouse.id === warehouseId) && skuIds.has(skuId) && !balances.has(key), "Page balance is outside its requested formal key");
    versionFromSql(row.version); id("operation", row.last_operation_id);
    balances.set(key, quantityFromSql(row.quantity).toString());
  }
  let units = 0;
  return [...products.values()].map(product => {
    integrity(product.sizes.length > 0, "Native product size columns are unavailable"); bounded(product.sizes, INVENTORY_PRODUCT_MAX_SIZES);
    const variants = new Map<string, { color: InventorySelection; fit: InventorySelection; skus: Map<string, string> }>();
    for (const sku of product.skus) {
      const key = `${sku.color.id}:${sku.fit.id}`; const previous = variants.get(key);
      if (previous) {
        integrity(previous.color.label === sku.color.label && previous.fit.label === sku.fit.label, "Native specification labels are inconsistent");
        previous.skus.set(sku.sizeId, sku.id);
      } else variants.set(key, { color: sku.color, fit: sku.fit, skus: new Map([[sku.sizeId, sku.id]]) });
    }
    bounded([...variants.keys()], INVENTORY_PRODUCT_MAX_VARIANTS);
    units += 1 + product.sizes.length + variants.size * (1 + scope.warehouses.length * (1 + product.sizes.length));
    bounded({ length: units }, INVENTORY_READ_MAX_MATRIX_UNITS);
    const colorFits: InventoryQueryColorFit[] = [...variants.values()].map(variant => {
      const rows = scope.warehouses.map(warehouse => {
        const cells: Record<string, InventoryStockCell> = {}; let sum = 0n;
        for (const size of product.sizes) {
          const skuId = variant.skus.get(size.id);
          if (skuId === undefined) cells[size.id] = { state: "not-applicable" };
          else {
            // Only catalogStatus + immutable publication + verified warehouse scope make this absence exact zero.
            const quantity = balances.get(`${warehouse.id}:${skuId}`) ?? "0";
            cells[size.id] = { state: "known", skuId, quantity }; sum += BigInt(quantity);
          }
        }
        return { warehouse: { id: warehouse.id, label: warehouse.label }, cells, total: total(sum) };
      });
      const sizeTotals = Object.fromEntries(product.sizes.map(size => [size.id, total(rows.reduce((sum, row) => {
        const cell = row.cells[size.id]!; return sum + (cell.state === "known" ? BigInt(cell.quantity) : 0n);
      }, 0n))]));
      return { color: variant.color, fit: variant.fit, rows, sizeTotals, total: totalOf(rows.map(row => row.total)) };
    });
    return { id: product.id, code: label(product.row.product_code), name: label(product.row.name), categoryLabel: label(product.row.category_name),
      supplierLabel: product.row.supplier_name === null ? "" : label(product.row.supplier_name), seasonLabel: product.row.season_name === null ? "" : label(product.row.season_name),
      sizeGroup: { id: product.groupId, label: label(product.row.size_group_name) }, sizes: product.sizes, colorFits,
      sizeTotals: quantities(product.sizes, colorFits), total: totalOf(colorFits.map(group => group.total)) };
  });
}

const productSelection = (seasonArray: boolean) => `SELECT p.id, p.product_code, p.name, p.size_group_id, g.name AS size_group_name, c.name AS category_name,
          su.name AS supplier_name, se.name AS season_name FROM matched_products mp JOIN naijue_erp.product p ON p.id = mp.id
        JOIN naijue_erp.product_category c ON c.id = p.category_id JOIN naijue_erp.size_group g ON g.id = p.size_group_id
        LEFT JOIN naijue_erp.supplier su ON su.id = p.supplier_id ${productSeasonLabelJoin(seasonArray)}`;
async function productMatrices(query: Query, values: unknown[], products: Row[], input: InventoryQuery, scope: InventoryReadScope, seasonArray: boolean): Promise<InventoryQueryProduct[]> {
  bounded(products, input.pageSize); const pageIds = products.map(row => id("product", row.id));
  let sizes: Row[] = []; let skus: Row[] = []; let balances: Row[] = [];
  if (pageIds.length) {
    sizes = (await query(`/* inventory:sizes */ SELECT p.id AS product_id, p.size_group_id, m.size_id, s.name AS size_name, m.display_order
      FROM naijue_erp.product p JOIN naijue_erp.size_group_member m ON m.size_group_id = p.size_group_id
      JOIN naijue_erp.size s ON s.id = m.size_id WHERE p.id = ANY($1::uuid[])
      ORDER BY p.id, m.display_order, s.id LIMIT $2`, [pageIds, INVENTORY_READ_MAX_PAGE_SIZES + 1])).rows;
    bounded(sizes, INVENTORY_READ_MAX_PAGE_SIZES);
    skus = (await query(`/* inventory:skus */ SELECT s.id, s.product_id, s.color_id, s.fit_id, s.size_id, c.name AS color_name, f.name AS fit_name
      FROM naijue_erp.sku s JOIN naijue_erp.color c ON c.id = s.color_id JOIN naijue_erp.fit f ON f.id = s.fit_id
      JOIN naijue_erp.product p ON p.id = s.product_id LEFT JOIN naijue_erp.size_group_member m ON m.size_group_id = p.size_group_id AND m.size_id = s.size_id
      WHERE s.product_id = ANY($1::uuid[]) AND (cardinality($2::uuid[]) = 0 OR s.fit_id = ANY($2::uuid[]))
      ORDER BY p.id, c.code COLLATE "C", c.id, f.code COLLATE "C", f.id, m.display_order, s.size_id, s.id LIMIT $3`,
    [pageIds, input.filter.fitIds, INVENTORY_READ_MAX_PAGE_SKUS + 1])).rows;
    bounded(skus, INVENTORY_READ_MAX_PAGE_SKUS);
    balances = (await query(`/* inventory:balances */ ${catalog(seasonArray)}
      SELECT b.warehouse_id, b.sku_id, b.quantity::text, b.version, b.last_operation_id FROM naijue_erp.inventory_balance b
      JOIN filtered_skus s ON s.id = b.sku_id JOIN authorized_warehouses w ON w.id = b.warehouse_id
      WHERE s.product_id = ANY($9::uuid[]) ORDER BY b.warehouse_id, b.sku_id LIMIT $10`,
    [...values, pageIds, INVENTORY_READ_MAX_PAGE_BALANCES + 1])).rows;
    bounded(balances, INVENTORY_READ_MAX_PAGE_BALANCES);
  }
  return pageProducts(products, sizes, skus, balances, scope);
}

/** Injected native PostgreSQL protocol reader. No Pool construction, legacy projection, source-file read,
 * migration, server, import or write. Each call has one RR READ ONLY snapshot and fixed set-query count.
 * Signals stop subsequent work, not an already-running SQL query or pool acquisition; host timeouts remain required. */
export class PostgresInventoryQueryReader implements TrustedInventorySnapshotReader {
  private readonly pool: PgInventoryQueryPool;
  private readonly seasonArray: boolean;
  private readonly runtime26: NativeRuntime26Capability | undefined;
  constructor(pool: PgInventoryQueryPool, seasonArray: ProductSeasonArrayCapability | null = null, runtime26?: NativeRuntime26Capability) {
    if (typeof pool?.connect !== "function") throw new TypeError("Inventory query reader requires an explicit PostgreSQL pool");
    this.pool = pool; this.seasonArray = productSeasonArrayEnabled(pool, seasonArray); this.runtime26 = checkedNativeRuntime26Capability(runtime26);
  }
  private async snapshot<T>(signal: AbortSignal, work: (query: Query) => Promise<T>): Promise<T> {
    active(signal); const client = await this.pool.connect(); let began = false; let committing = false; let committed = false; let discard: Error | undefined;
    const query: Query = (sql, values = []) => { active(signal); return client.query(sql, values); };
    try {
      active(signal); await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
      if (this.runtime26) { await this.runtime26.assertReady(client, "INVENTORY_ADMISSION"); active(signal); }
      const result = await work(query); active(signal); committing = true; await query("COMMIT"); committed = true; active(signal); return result;
    } catch (error) {
      if (!committed && (!began || committing)) discard = error instanceof Error ? error : new Error("Inventory snapshot failed");
      // An attempted COMMIT has an unknown outcome; discard it, never issue a second transaction-ending command.
      // A confirmed COMMIT followed by cancellation only suppresses the response; the connection is healthy.
      if (began && !committing) try { await client.query("ROLLBACK"); } catch (rollbackError) {
        discard = rollbackError instanceof Error ? rollbackError : new Error("Inventory rollback failed");
        throw new AggregateError([error, rollbackError], "Inventory read and rollback failed; connection discarded");
      }
      throw error;
    } finally { client.release(discard); }
  }
  private async *streamSnapshot<T>(signal: AbortSignal, work: (query: Query) => AsyncIterable<T>): AsyncIterable<T> {
    active(signal); const client = await this.pool.connect(); let began = false, committing = false, committed = false;
    let discard: Error | undefined, failure: unknown;
    const query: Query = (sql, values = []) => { active(signal); return client.query(sql, values); };
    try {
      active(signal); await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
      if (this.runtime26) { await this.runtime26.assertReady(client, "INVENTORY_ADMISSION"); active(signal); }
      for await (const frame of work(query)) { active(signal); yield frame; active(signal); }
      active(signal); committing = true; await query("COMMIT"); committed = true; active(signal);
    } catch (error) {
      failure = error; if (!committed && (!began || committing)) discard = error instanceof Error ? error : new Error("Inventory output snapshot failed"); throw error;
    } finally {
      try {
        // Generator return on cancellation also leaves a transaction to close.
        if (began && !committing) try { await client.query("ROLLBACK"); }
        catch (error) { discard = error instanceof Error ? error : new Error("Inventory output rollback failed"); throw new AggregateError([...(failure === undefined ? [] : [failure]), error], "Inventory output rollback failed; client discarded"); }
      } finally { client.release(discard); }
    }
  }
  async *readInventoryOutput(read: InventoryScopedRead<InventoryQuery>): AsyncIterable<InventoryOutputFrame> {
    checkedInventoryActor(read.actor); const input = { ...checkedParameters(read.parameters), page: 1, pageSize: 100 as const }, scope = inventoryScope(read.scope, input), seasonArray = this.seasonArray;
    let completion: Extract<InventoryOutputFrame, { kind: "complete" }> | undefined; const runtime26 = this.runtime26;
    yield* this.streamSnapshot<InventoryOutputFrame>(read.signal, async function* (query) {
      const batchId = await publishedBatch(query); await verifyWarehouses(query, scope, batchId, runtime26);
      const values = parameters(scope, input.filter, batchId), status = await catalogStatus(query, values, seasonArray, runtime26), readReference = `inventory:${randomUUID()}`;
      const warehouseLabels = scope.warehouses.map(w => w.label);
      yield { kind: "summary", readReference, exactTotalProducts: status.exactTotal, warehouseLabels, allMatchesTotal: status.allMatchesTotal };
      let count = 0, sum = 0n, lastCode: string | null = null, lastId: string | null = null;
      while (count < status.exactTotal) {
        const products = (await query(`/* inventory:output-products */ ${catalog(seasonArray)} ${productSelection(seasonArray)}
          WHERE ($9::text IS NULL OR (p.product_code COLLATE "C",p.id) > ($9::text COLLATE "C",$10::uuid))
          ORDER BY p.product_code COLLATE "C",p.id LIMIT $11`, [...values, lastCode, lastId, 100])).rows;
        const pageInput = { ...input, page: count / 100 + 1 }, matrices = await productMatrices(query, values, products, input, scope, seasonArray);
        const page = checkedInventorySnapshot({ readReference, readiness: "ready", data: { page: pageInput.page, pageSize: 100, exactTotalProducts: status.exactTotal,
          products: matrices, warehouseLabels, allMatchesTotal: status.allMatchesTotal, readReference } }, pageInput, scope).data;
        for (const product of page.products) {
          if (lastCode !== null) { const order = Buffer.compare(Buffer.from(lastCode), Buffer.from(product.code)); integrity(order < 0 || order === 0 && lastId! < product.id, "Inventory output keyset did not advance"); }
          lastCode = product.code; lastId = product.id; count++; sum += BigInt(product.total.knownQuantity);
          yield { kind: "product", product };
        }
      }
      integrity(count === status.exactTotal && sum.toString() === status.allMatchesTotal.knownQuantity, "Complete inventory output differs from full-filter summary");
      completion = { kind: "complete", readReference, exactTotalProducts: count, emittedProducts: count, allMatchesTotal: status.allMatchesTotal };
    });
    // The transaction generator returns normally only after confirmed COMMIT.
    active(read.signal); integrity(completion, "Complete inventory output is unavailable"); yield completion;
  }
  async readInventory(read: InventoryScopedRead<InventoryQuery>): Promise<InventoryReadSnapshot<InventoryQueryPage>> {
    checkedInventoryActor(read.actor); const input = checkedParameters(read.parameters); const scope = inventoryScope(read.scope, input);
    return this.snapshot(read.signal, async query => {
      const batchId = await publishedBatch(query); await verifyWarehouses(query, scope, batchId, this.runtime26);
      const values = parameters(scope, input.filter, batchId); const status = await catalogStatus(query, values, this.seasonArray, this.runtime26);
      const products = (await query(`/* inventory:products */ ${catalog(this.seasonArray)}
        ${productSelection(this.seasonArray)}
        ORDER BY p.product_code COLLATE "C", p.id LIMIT $9 OFFSET $10::bigint`, [...values, input.pageSize, String((input.page - 1) * input.pageSize)])).rows;
      const matrices = await productMatrices(query, values, products, input, scope, this.seasonArray);
      const readReference = `inventory:${randomUUID()}`;
      return checkedInventorySnapshot({ readReference, readiness: "ready", data: { page: input.page, pageSize: input.pageSize, exactTotalProducts: status.exactTotal,
        products: matrices, warehouseLabels: scope.warehouses.map(row => row.label), allMatchesTotal: status.allMatchesTotal, readReference } }, input, scope);
    });
  }
  async readCandidates(read: InventoryScopedRead<InventoryCandidateQuery>): Promise<InventoryReadSnapshot<InventoryCandidatePage>> {
    checkedInventoryActor(read.actor); const input = parseInventoryCandidateQuery(read.parameters); const scope = checkedInventoryScope(read.scope);
    if (input.kind === "warehouse") requireDomain(input.selectedIds.every(id => scope.warehouses.some(warehouse => warehouse.id === id)), "FORBIDDEN", "Selected warehouse is outside authorized inventory scope");
    return this.snapshot(read.signal, async query => {
      const batchId = await publishedBatch(query); await verifyWarehouses(query, scope, batchId, this.runtime26);
      const filter: InventoryQuery["filter"] = { productIds: [], categoryIds: input.kind === "category" || input.kind === "warehouse" ? [] : input.categoryIds,
        warehouseIds: [], supplierIds: [], fitIds: [], seasonIds: [] };
      const values = parameters(scope, filter, batchId);
      const source = candidateSource(input.kind, this.seasonArray); values.push(input.search);
      const exactTotal = count(one(await query(`/* inventory:candidate-count */ ${catalog(this.seasonArray)} SELECT count(*)::text AS exact_total ${source.from} WHERE ${source.where}`, [...values])).exact_total);
      const rows = (await query(`/* inventory:candidates */ ${catalog(this.seasonArray)} SELECT ${source.columns} ${source.from} WHERE ${source.where}
        ORDER BY ${source.order} LIMIT $10 OFFSET $11::bigint`, [...values, 20, String((input.page - 1) * 20)])).rows;
      bounded(rows, 20);
      if (input.kind === "category") for (const row of rows) integrity(booleanValue(row.category_valid), "Returned native category is outside the supported two-level hierarchy");
      const items: InventoryQueryCandidate[] = rows.map(row => ({ id: id(input.kind, row.id), label: label(row.label),
        ...(row.disabled === null ? {} : { disabled: booleanValue(row.disabled) }),
        ...(row.parent_label === null ? {} : { parentLabel: label(row.parent_label) }),
        ...(row.depth === undefined ? {} : { depth: integerValue(row.depth) as 0 | 1 }),
        ...(input.kind === "product" ? { code: label(row.code), name: label(row.name) } : {}),
        ...(input.kind === "category" ? { parentId: row.parent_id === null ? null : id("category", row.parent_id) } : {}) }));
      await verifyCandidateMembership(query, values.slice(0, 8), input.kind, items.map(item => item.id), this.seasonArray, this.runtime26);
      return checkedCandidateSnapshot({ readReference: `inventory:${randomUUID()}`, readiness: "ready", data: { items, exactTotal, page: input.page } }, input, scope);
    });
  }
}
interface CandidateSource { readonly columns: string; readonly from: string; readonly where: string; readonly order: string }
function candidateSource(kind: InventoryCandidateQuery["kind"], seasonArray: boolean): CandidateSource {
  switch (kind) {
    case "warehouse": return { columns: "r.id, r.name AS label, NOT r.enabled AS disabled, NULL::text AS parent_label", from: "FROM naijue_erp.warehouse r JOIN authorized_warehouses w ON w.id = r.id",
      where: "strpos(r.name, $9::text) > 0", order: "array_position($1::uuid[], r.id), r.id" };
    case "product": return { columns: "r.id, r.product_code || ' ' || r.name AS label, r.product_code AS code, r.name, NOT r.enabled AS disabled, NULL::text AS parent_label", from: "FROM naijue_erp.product r JOIN matched_products p ON p.id = r.id",
      where: "(strpos(r.product_code, $9::text) > 0 OR strpos(r.name, $9::text) > 0 OR strpos(r.system_item_code, $9::text) > 0)", order: 'r.product_code COLLATE "C", r.id' };
    case "category": return { columns: "r.id, r.name AS label, r.parent_id, NULL::boolean AS disabled, parent.name AS parent_label, CASE WHEN r.parent_id IS NULL THEN 0 ELSE 1 END AS depth, (r.parent_id IS NULL OR (parent.id IS NOT NULL AND parent.parent_id IS NULL)) AS category_valid", from: "FROM naijue_erp.product_category r LEFT JOIN naijue_erp.product_category parent ON parent.id = r.parent_id",
      where: "EXISTS (SELECT 1 FROM authorized_warehouses) AND strpos(r.name, $9::text) > 0", order: 'r.display_order, r.name COLLATE "C", r.id' };
    case "fit": return { columns: "r.id, r.name AS label, NOT r.enabled AS disabled, NULL::text AS parent_label", from: "FROM naijue_erp.fit r",
      where: "EXISTS (SELECT 1 FROM filtered_skus s WHERE s.fit_id = r.id) AND (strpos(r.code, $9::text) > 0 OR strpos(r.name, $9::text) > 0)", order: 'r.code COLLATE "C", r.id' };
    case "supplier": return { columns: "r.id, r.name AS label, NOT r.enabled AS disabled, NULL::text AS parent_label", from: "FROM naijue_erp.supplier r",
      where: "EXISTS (SELECT 1 FROM matched_products p JOIN naijue_erp.product native ON native.id = p.id WHERE native.supplier_id = r.id) AND (strpos(r.code, $9::text) > 0 OR strpos(r.name, $9::text) > 0)", order: 'r.code COLLATE "C", r.id' };
    case "season": return { columns: "r.id, r.name AS label, NULL::boolean AS disabled, NULL::text AS parent_label", from: "FROM naijue_erp.season r",
      where: `EXISTS (SELECT 1 FROM matched_products p JOIN naijue_erp.product native ON native.id = p.id WHERE ${seasonArray ? "r.id = ANY(native.season_ids)" : "native.season_id = r.id"}) AND (strpos(r.code, $9::text) > 0 OR strpos(r.name, $9::text) > 0)`, order: 'r.display_order, r.code COLLATE "C", r.id' };
    default: throw new DomainError("INVALID_INVENTORY_INPUT", "Unsupported inventory candidate kind");
  }
}
