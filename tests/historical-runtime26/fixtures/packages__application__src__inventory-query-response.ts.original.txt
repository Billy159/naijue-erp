import { DomainError } from "../../domain/src/errors.ts";
import { Buffer } from "node:buffer";
import type { InventoryCandidatePage, InventoryCandidateQuery, InventoryQuery, InventoryQueryCandidate, InventoryQueryColorFit, InventoryQueryPage, InventoryQueryProduct, InventoryQueryRow, InventoryReadScope, InventoryReadSnapshot, InventorySelection, InventoryStockCell, InventoryStockTotal, InventoryOutputFrame, InventoryOutputSummary } from "./inventory-query-contracts.ts";
import { equalTotal, exactInteger, idValue, numberValue, record, rejectInventoryResponse as reject, stockTotal, sumTotals, textValue } from "./inventory-query-validation.ts";
import type { EntityKind } from "../../domain/src/values.ts";
import { INVENTORY_MATRIX_CHUNK_MAX_UNITS, INVENTORY_PRODUCT_MAX_SIZES, INVENTORY_PRODUCT_MAX_VARIANTS } from "./inventory-query-contracts.ts";

function list(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) reject(); return value; }
function selection(kind: EntityKind, value: unknown): InventorySelection {
  const row = record(value, ["id", "label"], [], reject);
  return Object.freeze({ id: idValue(kind, row.id, reject), label: textValue(row.label, reject) });
}
function selectionList(kind: EntityKind, value: unknown): readonly InventorySelection[] {
  const result = list(value, INVENTORY_PRODUCT_MAX_SIZES).map(item => selection(kind, item));
  if (new Set(result.map(item => item.id)).size !== result.length) reject();
  return Object.freeze(result);
}
function sizeRecord(value: unknown, sizeIds: readonly string[], sizeIdSet: ReadonlySet<string>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) reject();
  const row = value as Record<string, unknown>;
  if (!sizeIds.every(id => Object.hasOwn(row, id)) || Object.keys(row).some(id => !sizeIdSet.has(id))) reject();
  return row;
}
function totalsBySize(value: unknown, sizeIds: readonly string[], sizeIdSet: ReadonlySet<string>): Readonly<Record<string, InventoryStockTotal>> {
  const row = sizeRecord(value, sizeIds, sizeIdSet);
  return Object.freeze(Object.fromEntries(sizeIds.map(id => [id, stockTotal(row[id])])));
}
function checkedTotal(total: InventoryStockTotal, sum: bigint): InventoryStockTotal {
  equalTotal(total, Object.freeze({ knownQuantity: sum.toString(), unknownCells: 0, completeness: "complete" }));
  return total;
}
function cell(value: unknown): InventoryStockCell {
  const state = record(value, ["state"], ["skuId", "quantity"], reject).state;
  if (state === "known") {
    const row = record(value, ["state", "skuId", "quantity"], [], reject);
    exactInteger(row.quantity, true);
    return Object.freeze({ state, skuId: idValue("sku", row.skuId, reject), quantity: row.quantity as string });
  }
  if (state !== "not-applicable") reject();
  record(value, ["state"], [], reject);
  return Object.freeze({ state });
}
interface MatrixBudget { units: number; readonly skuCoordinates: Map<string, string> }
function spend(budget: MatrixBudget, units: number): void {
  budget.units += units;
  if (budget.units > INVENTORY_MATRIX_CHUNK_MAX_UNITS) reject(); // Never truncate a matrix.
}
function product(value: unknown, scope: InventoryReadScope, query: InventoryQuery, budget: MatrixBudget): InventoryQueryProduct {
  const row = record(value, ["id", "code", "name", "categoryLabel", "supplierLabel", "seasonLabel", "sizeGroup", "sizes", "colorFits", "sizeTotals", "total"], [], reject);
  spend(budget, 1);
  const id = idValue("product", row.id, reject);
  if (query.filter.productIds.length && !query.filter.productIds.includes(id)) reject();
  const sizes = selectionList("size", row.sizes);
  // A returned inventory product must have verified size columns; an empty array
  // is not a proven zero-stock product and cannot satisfy the web read contract.
  if (sizes.length === 0) reject();
  spend(budget, sizes.length);
  const sizeIds = sizes.map(size => size.id), sizeIdSet = new Set(sizeIds);
  const productSizeSums = sizeIds.map(() => 0n); let productSum = 0n;
  const variants = new Set<string>();
  const colorFits = list(row.colorFits, INVENTORY_PRODUCT_MAX_VARIANTS).map(item => {
    spend(budget, 1);
    const group = record(item, ["color", "fit", "rows", "sizeTotals", "total"], [], reject);
    const color = selection("color", group.color); const fit = selection("fit", group.fit);
    if (query.filter.fitIds.length && !query.filter.fitIds.some(id => id === fit.id)) reject();
    const variant = `${id}:${color.id}:${fit.id}`;
    if (variants.has(variant)) reject(); variants.add(variant);
    const warehouses = list(group.rows, scope.warehouses.length);
    if (warehouses.length !== scope.warehouses.length) reject();
    // Same coordinate must be either a nonexistent SKU in every warehouse, or the identical actual SKU.
    const coordinates = new Map<string, string>();
    const variantSizeSums = sizeIds.map(() => 0n); let variantSum = 0n;
    const rows = warehouses.map((item, index): InventoryQueryRow => {
      const row = record(item, ["warehouse", "cells", "total"], [], reject);
      const warehouse = selection("warehouse", row.warehouse); const authorized = scope.warehouses[index];
      if (!authorized || warehouse.id !== authorized.id || warehouse.label !== authorized.label) reject();
      const rawCells = sizeRecord(row.cells, sizeIds, sizeIdSet);
      spend(budget, 1 + sizes.length);
      const cells: Record<string, InventoryStockCell> = {}; let rowSum = 0n;
      for (let sizeIndex = 0; sizeIndex < sizes.length; sizeIndex++) {
        const size = sizes[sizeIndex]!;
        const value = cell(rawCells[size.id]); const identity = value.state === "not-applicable" ? "absent" : value.skuId;
        const coordinate = `${variant}:${size.id}`;
        if (coordinates.has(size.id) && coordinates.get(size.id) !== identity) reject();
        coordinates.set(size.id, identity);
        if (value.state !== "not-applicable") {
          const previous = budget.skuCoordinates.get(value.skuId);
          if (previous !== undefined && previous !== coordinate) reject();
          budget.skuCoordinates.set(value.skuId, coordinate);
          const exact = BigInt(value.quantity); rowSum += exact; variantSizeSums[sizeIndex] = variantSizeSums[sizeIndex]! + exact;
        }
        cells[size.id] = value;
      }
      const total = checkedTotal(stockTotal(row.total), rowSum); variantSum += rowSum;
      return Object.freeze({ warehouse, cells: Object.freeze(cells), total });
    });
    const sizeTotals = totalsBySize(group.sizeTotals, sizeIds, sizeIdSet);
    for (const [index, sizeId] of sizeIds.entries()) {
      checkedTotal(sizeTotals[sizeId]!, variantSizeSums[index]!);
      productSizeSums[index] = productSizeSums[index]! + variantSizeSums[index]!;
    }
    const total = checkedTotal(stockTotal(group.total), variantSum); productSum += variantSum;
    return Object.freeze({ color, fit, rows: Object.freeze(rows), sizeTotals, total }) satisfies InventoryQueryColorFit;
  });
  const sizeTotals = totalsBySize(row.sizeTotals, sizeIds, sizeIdSet);
  for (const [index, sizeId] of sizeIds.entries()) checkedTotal(sizeTotals[sizeId]!, productSizeSums[index]!);
  const total = checkedTotal(stockTotal(row.total), productSum);
  return Object.freeze({ id, code: textValue(row.code, reject), name: textValue(row.name, reject),
    categoryLabel: textValue(row.categoryLabel, reject, true), supplierLabel: textValue(row.supplierLabel, reject, true),
    seasonLabel: textValue(row.seasonLabel, reject, true), sizeGroup: selection("sizeGroup", row.sizeGroup), sizes,
    colorFits: Object.freeze(colorFits), sizeTotals, total });
}
function envelope(value: unknown): { row: Record<string, unknown>; readReference: string; readiness: "ready" } {
  const row = record(value, ["readReference", "readiness", "data"], [], reject);
  const readReference = textValue(row.readReference, reject, false, 200);
  // Header-safe opaque reference. It is not accepted as a permission token on later requests.
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(readReference) || (row.readiness !== "ready" && row.readiness !== "incomplete")) reject();
  if (row.readiness !== "ready") throw new DomainError("INVENTORY_NOT_READY", "Complete inventory scope is not ready for publication");
  return { row, readReference, readiness: "ready" };
}
function pageLength(total: number, page: number, size: number): number { return Math.min(size, Math.max(0, total - (page - 1) * size)); }
export function checkedInventorySnapshot(value: unknown, query: InventoryQuery, scope: InventoryReadScope): InventoryReadSnapshot<InventoryQueryPage> {
  const { row: envelopeRow, readReference, readiness } = envelope(value);
  const row = record(envelopeRow.data, ["page", "pageSize", "exactTotalProducts", "products", "warehouseLabels", "allMatchesTotal", "readReference"], [], reject);
  if (row.page !== query.page || row.pageSize !== query.pageSize || row.readReference !== readReference) reject();
  const exactTotalProducts = numberValue(row.exactTotalProducts, 0, reject);
  if (query.filter.productIds.length && exactTotalProducts > query.filter.productIds.length) reject();
  const budget: MatrixBudget = { units: 0, skuCoordinates: new Map() };
  const products = list(row.products, query.pageSize).map(value => product(value, scope, query, budget));
  if (products.length !== pageLength(exactTotalProducts, query.page, query.pageSize) || new Set(products.map(row => row.id)).size !== products.length) reject();
  for (let i = 1; i < products.length; i++) {
    const previous = products[i - 1]!; const current = products[i]!;
    const codeOrder = Buffer.compare(Buffer.from(previous.code), Buffer.from(current.code));
    if (codeOrder > 0 || (codeOrder === 0 && previous.id >= current.id)) reject();
  }
  const warehouseLabels = list(row.warehouseLabels, scope.warehouses.length).map(label => textValue(label, reject));
  if (warehouseLabels.length !== scope.warehouses.length || warehouseLabels.some((label, index) => label !== scope.warehouses[index]!.label)) reject();
  const allMatchesTotal = stockTotal(row.allMatchesTotal);
  const pageTotal = sumTotals(products.map(row => row.total));
  if (exactTotalProducts === 0 || products.length === exactTotalProducts) equalTotal(allMatchesTotal, pageTotal);
  const data: InventoryQueryPage = Object.freeze({ page: query.page, pageSize: query.pageSize, exactTotalProducts,
    products: Object.freeze(products), warehouseLabels: Object.freeze(warehouseLabels), allMatchesTotal, readReference });
  return Object.freeze({ readReference, readiness, data });
}
export async function* checkedInventoryOutputFrames(values: AsyncIterable<unknown>, query: InventoryQuery, scope: InventoryReadScope): AsyncIterable<InventoryOutputFrame> {
  let summary: InventoryOutputSummary | undefined, completion: Extract<InventoryOutputFrame, { kind: "complete" }> | undefined, completed = false, count = 0, sum = 0n, previous: InventoryQueryProduct | undefined;
  const ids = new Set<string>(), budget: MatrixBudget = { units: 0, skuCoordinates: new Map() };
  for await (const value of values) {
    if (completed) reject();
    const kind = record(value, ["kind"], ["readReference", "exactTotalProducts", "warehouseLabels", "allMatchesTotal", "product", "emittedProducts"], reject).kind;
    if (!summary) {
      const row = record(value, ["kind", "readReference", "exactTotalProducts", "warehouseLabels", "allMatchesTotal"], [], reject);
      const reference = textValue(row.readReference, reject, false, 200); if (kind !== "summary" || !/^[A-Za-z0-9._:-]{1,200}$/.test(reference)) reject();
      const exactTotalProducts = numberValue(row.exactTotalProducts, 0, reject); if (query.filter.productIds.length && exactTotalProducts > query.filter.productIds.length) reject();
      const labels = list(row.warehouseLabels, scope.warehouses.length).map(v => textValue(v, reject));
      if (labels.length !== scope.warehouses.length || labels.some((v, i) => v !== scope.warehouses[i]!.label)) reject();
      summary = Object.freeze({ kind: "summary", readReference: reference, exactTotalProducts, warehouseLabels: Object.freeze(labels), allMatchesTotal: stockTotal(row.allMatchesTotal) });
      yield summary; continue;
    }
    if (kind === "product") {
      const row = record(value, ["kind", "product"], [], reject); if (count % 100 === 0) budget.units = 0;
      const current = product(row.product, scope, query, budget);
      if (ids.has(current.id) || ++count > summary.exactTotalProducts) reject(); ids.add(current.id);
      if (previous) { const order = Buffer.compare(Buffer.from(previous.code), Buffer.from(current.code)); if (order > 0 || order === 0 && previous.id >= current.id) reject(); }
      previous = current; sum += BigInt(current.total.knownQuantity); yield Object.freeze({ kind: "product", product: current }); continue;
    }
    const row = record(value, ["kind", "readReference", "exactTotalProducts", "emittedProducts", "allMatchesTotal"], [], reject);
    if (kind !== "complete" || row.readReference !== summary.readReference || row.exactTotalProducts !== summary.exactTotalProducts
      || row.emittedProducts !== count || count !== summary.exactTotalProducts || sum.toString() !== summary.allMatchesTotal.knownQuantity) reject();
    equalTotal(stockTotal(row.allMatchesTotal), summary.allMatchesTotal); completed = true;
    completion = Object.freeze({ kind: "complete", readReference: summary.readReference, exactTotalProducts: count, emittedProducts: count, allMatchesTotal: summary.allMatchesTotal });
  }
  if (!summary || !completion) reject(); yield completion;
}
export function checkedCandidateSnapshot(value: unknown, query: InventoryCandidateQuery, scope: InventoryReadScope): InventoryReadSnapshot<InventoryCandidatePage> {
  const { row: envelopeRow, readReference, readiness } = envelope(value);
  const row = record(envelopeRow.data, ["items", "exactTotal", "page"], [], reject);
  if (row.page !== query.page) reject();
  const exactTotal = numberValue(row.exactTotal, 0, reject);
  const items = list(row.items, 20).map((item): InventoryQueryCandidate => {
    const required = query.kind === "product" ? ["id", "label", "code", "name"]
      : query.kind === "category" ? ["id", "label", "parentId", "depth"] : ["id", "label"];
    const candidate = record(item, required, query.kind === "category" ? ["disabled", "parentLabel"] : ["disabled"], reject);
    const id = idValue(query.kind, candidate.id, reject); const label = textValue(candidate.label, reject);
    if (query.kind === "warehouse" && !scope.warehouses.some(warehouse => warehouse.id === id && warehouse.label === label)) reject();
    if (Object.hasOwn(candidate, "disabled") && typeof candidate.disabled !== "boolean") reject();
    if (query.kind === "category") {
      if (candidate.depth !== 0 && candidate.depth !== 1) reject();
      const parentId = candidate.parentId === null ? null : idValue("category", candidate.parentId, reject);
      if (parentId === id || (parentId === null) !== (candidate.depth === 0)
        || Object.hasOwn(candidate, "parentLabel") !== (parentId !== null)) reject();
    }
    return Object.freeze({ id, label,
      ...(query.kind === "product" ? { code: textValue(candidate.code, reject), name: textValue(candidate.name, reject) } : {}),
      ...(query.kind === "category" ? { parentId: candidate.parentId === null ? null : idValue("category", candidate.parentId, reject) } : {}),
      ...(Object.hasOwn(candidate, "disabled") ? { disabled: candidate.disabled as boolean } : {}),
      ...(Object.hasOwn(candidate, "parentLabel") ? { parentLabel: textValue(candidate.parentLabel, reject) } : {}),
      ...(Object.hasOwn(candidate, "depth") ? { depth: candidate.depth as 0 | 1 } : {}) });
  });
  if (items.length !== pageLength(exactTotal, query.page, 20) || new Set(items.map(item => item.id)).size !== items.length
    || (query.kind === "warehouse" && exactTotal > scope.warehouses.length)) reject();
  return Object.freeze({ readReference, readiness, data: Object.freeze({ items: Object.freeze(items), exactTotal, page: query.page }) });
}
