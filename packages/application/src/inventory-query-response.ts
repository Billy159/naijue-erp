import { Buffer } from "node:buffer";
import type { InventoryCandidatePage, InventoryCandidateQuery, InventoryQuery, InventoryQueryCandidate, InventoryQueryColorFit, InventoryQueryPage, InventoryQueryProduct, InventoryQueryRow, InventoryReadScope, InventoryReadSnapshot, InventorySelection, InventoryStockCell, InventoryStockTotal } from "./inventory-query-contracts.ts";
import { equalTotal, exactInteger, idValue, numberValue, record, rejectInventoryResponse as reject, stockTotal, sumTotals, textValue } from "./inventory-query-validation.ts";
import type { EntityKind } from "../../domain/src/values.ts";

const ZERO: InventoryStockTotal = Object.freeze({ knownQuantity: "0", unknownCells: 0, completeness: "complete" });
function list(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) reject(); return value; }
function selection(kind: EntityKind, value: unknown): InventorySelection {
  const row = record(value, ["id", "label"], [], reject);
  return Object.freeze({ id: idValue(kind, row.id, reject), label: textValue(row.label, reject) });
}
function selectionList(kind: EntityKind, value: unknown): readonly InventorySelection[] {
  const result = list(value, 1000).map(item => selection(kind, item));
  if (new Set(result.map(item => item.id)).size !== result.length) reject();
  return Object.freeze(result);
}
function totalsBySize(value: unknown, sizes: readonly InventorySelection[]): Readonly<Record<string, InventoryStockTotal>> {
  const row = record(value, sizes.map(size => size.id), [], reject);
  return Object.freeze(Object.fromEntries(sizes.map(size => [size.id, stockTotal(row[size.id])])));
}
function cell(value: unknown): InventoryStockCell {
  const state = record(value, ["state"], ["skuId", "quantity", "reason"], reject).state;
  if (state === "known") {
    const row = record(value, ["state", "skuId", "quantity"], [], reject);
    exactInteger(row.quantity, true);
    return Object.freeze({ state, skuId: idValue("sku", row.skuId, reject), quantity: row.quantity as string });
  }
  if (state === "unknown") {
    const row = record(value, ["state", "skuId", "reason"], [], reject);
    return Object.freeze({ state, skuId: idValue("sku", row.skuId, reject), reason: textValue(row.reason, reject) });
  }
  if (state !== "not-applicable") reject();
  record(value, ["state"], [], reject);
  return Object.freeze({ state });
}
function cellTotal(value: InventoryStockCell): InventoryStockTotal {
  if (value.state === "not-applicable") return ZERO;
  if (value.state === "known") return { knownQuantity: value.quantity, unknownCells: 0, completeness: "complete" };
  return { knownQuantity: "0", unknownCells: 1, completeness: "incomplete" };
}
interface MatrixBudget { units: number; readonly skuCoordinates: Map<string, string> }
function spend(budget: MatrixBudget, units: number): void {
  budget.units += units;
  if (budget.units > 1_000_000) reject(); // Technical validation-work budget; never truncate a matrix.
}
function product(value: unknown, scope: InventoryReadScope, query: InventoryQuery, budget: MatrixBudget): InventoryQueryProduct {
  const row = record(value, ["id", "code", "name", "categoryLabel", "supplierLabel", "seasonLabel", "sizeGroup", "sizes", "colorFits", "sizeTotals", "total"], [], reject);
  spend(budget, 1);
  const id = idValue("product", row.id, reject);
  if (query.filter.productIds.length && !query.filter.productIds.includes(id)) reject();
  const sizes = selectionList("size", row.sizes);
  spend(budget, sizes.length);
  const variants = new Set<string>();
  const colorFits = list(row.colorFits, 10000).map(item => {
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
    const rows = warehouses.map((item, index): InventoryQueryRow => {
      const row = record(item, ["warehouse", "cells", "total"], [], reject);
      const warehouse = selection("warehouse", row.warehouse); const authorized = scope.warehouses[index];
      if (!authorized || warehouse.id !== authorized.id || warehouse.label !== authorized.label) reject();
      const rawCells = record(row.cells, sizes.map(size => size.id), [], reject);
      spend(budget, 1 + sizes.length);
      const cells: Record<string, InventoryStockCell> = {};
      for (const size of sizes) {
        const value = cell(rawCells[size.id]); const identity = value.state === "not-applicable" ? "absent" : value.skuId;
        const coordinate = `${variant}:${size.id}`;
        if (coordinates.has(size.id) && coordinates.get(size.id) !== identity) reject();
        coordinates.set(size.id, identity);
        if (value.state !== "not-applicable") {
          const previous = budget.skuCoordinates.get(value.skuId);
          if (previous !== undefined && previous !== coordinate) reject();
          budget.skuCoordinates.set(value.skuId, coordinate);
        }
        cells[size.id] = value;
      }
      const total = stockTotal(row.total); equalTotal(total, sumTotals(Object.values(cells).map(cellTotal)));
      return Object.freeze({ warehouse, cells: Object.freeze(cells), total });
    });
    const sizeTotals = totalsBySize(group.sizeTotals, sizes);
    for (const size of sizes) equalTotal(sizeTotals[size.id]!, sumTotals(rows.map(row => cellTotal(row.cells[size.id]!))));
    const total = stockTotal(group.total); equalTotal(total, sumTotals(rows.map(row => row.total)));
    return Object.freeze({ color, fit, rows: Object.freeze(rows), sizeTotals, total }) satisfies InventoryQueryColorFit;
  });
  const sizeTotals = totalsBySize(row.sizeTotals, sizes);
  for (const size of sizes) equalTotal(sizeTotals[size.id]!, sumTotals(colorFits.map(group => group.sizeTotals[size.id]!)));
  const total = stockTotal(row.total); equalTotal(total, sumTotals(colorFits.map(group => group.total)));
  return Object.freeze({ id, code: textValue(row.code, reject), name: textValue(row.name, reject),
    categoryLabel: textValue(row.categoryLabel, reject, true), supplierLabel: textValue(row.supplierLabel, reject, true),
    seasonLabel: textValue(row.seasonLabel, reject, true), sizeGroup: selection("sizeGroup", row.sizeGroup), sizes,
    colorFits: Object.freeze(colorFits), sizeTotals, total });
}
function envelope(value: unknown): { row: Record<string, unknown>; readReference: string; readiness: "ready" | "incomplete" } {
  const row = record(value, ["readReference", "readiness", "data"], [], reject);
  const readReference = textValue(row.readReference, reject, false, 200);
  // Header-safe opaque reference. It is not accepted as a permission token on later requests.
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(readReference) || (row.readiness !== "ready" && row.readiness !== "incomplete")) reject();
  return { row, readReference, readiness: row.readiness };
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
  if (readiness !== (allMatchesTotal.completeness === "complete" ? "ready" : "incomplete")) reject();
  const pageTotal = sumTotals(products.map(row => row.total));
  if (allMatchesTotal.unknownCells < pageTotal.unknownCells) reject();
  if (exactTotalProducts === 0 || products.length === exactTotalProducts) equalTotal(allMatchesTotal, pageTotal);
  const data: InventoryQueryPage = Object.freeze({ page: query.page, pageSize: query.pageSize, exactTotalProducts,
    products: Object.freeze(products), warehouseLabels: Object.freeze(warehouseLabels), allMatchesTotal, readReference });
  return Object.freeze({ readReference, readiness, data });
}
export function checkedCandidateSnapshot(value: unknown, query: InventoryCandidateQuery, scope: InventoryReadScope): InventoryReadSnapshot<InventoryCandidatePage> {
  const { row: envelopeRow, readReference, readiness } = envelope(value);
  const row = record(envelopeRow.data, ["items", "exactTotal", "page"], [], reject);
  if (row.page !== query.page) reject();
  const exactTotal = numberValue(row.exactTotal, 0, reject);
  const items = list(row.items, 20).map((item): InventoryQueryCandidate => {
    const candidate = record(item, ["id", "label"], ["disabled", "parentLabel", "depth"], reject);
    const id = idValue(query.kind, candidate.id, reject); const label = textValue(candidate.label, reject);
    if (query.kind === "warehouse" && !scope.warehouses.some(warehouse => warehouse.id === id && warehouse.label === label)) reject();
    if (Object.hasOwn(candidate, "disabled") && typeof candidate.disabled !== "boolean") reject();
    if (Object.hasOwn(candidate, "depth") && candidate.depth !== 0 && candidate.depth !== 1) reject();
    return Object.freeze({ id, label, ...(Object.hasOwn(candidate, "disabled") ? { disabled: candidate.disabled as boolean } : {}),
      ...(Object.hasOwn(candidate, "parentLabel") ? { parentLabel: textValue(candidate.parentLabel, reject) } : {}),
      ...(Object.hasOwn(candidate, "depth") ? { depth: candidate.depth as 0 | 1 } : {}) });
  });
  if (items.length !== pageLength(exactTotal, query.page, 20) || new Set(items.map(item => item.id)).size !== items.length
    || (query.kind === "warehouse" && exactTotal > scope.warehouses.length)) reject();
  return Object.freeze({ readReference, readiness, data: Object.freeze({ items: Object.freeze(items), exactTotal, page: query.page }) });
}
