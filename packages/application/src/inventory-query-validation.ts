import { DomainError } from "../../domain/src/errors.ts";
import { entityId, quantity } from "../../domain/src/values.ts";
import type { EntityId, EntityKind } from "../../domain/src/values.ts";
import type { InventoryCandidateKind, InventoryCandidateQuery, InventoryQuery, InventoryReadScope, InventoryStockTotal } from "./inventory-query-contracts.ts";

// Technical request/response resource bounds, not business quantity or catalog-size rules.
export const INVENTORY_MAX_SELECTIONS = 100;
const KINDS = ["product", "category", "warehouse", "supplier", "fit", "season"] as const;
export function rejectInventoryInput(): never { throw new DomainError("INVALID_INVENTORY_INPUT", "Invalid inventory read parameters"); }
export function rejectInventoryResponse(): never { throw new DomainError("INVALID_INVENTORY_RESPONSE", "Invalid trusted inventory response"); }
type Reject = () => never;
export function record(value: unknown, required: readonly string[], optional: readonly string[] = [], reject: Reject = rejectInventoryInput): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) reject();
  const result = value as Record<string, unknown>;
  if (!required.every(key => Object.hasOwn(result, key)) || Object.keys(result).some(key => !required.includes(key) && !optional.includes(key))) reject();
  return result;
}
export function textValue(value: unknown, reject: Reject = rejectInventoryInput, empty = false, max = 1000): string {
  if (typeof value !== "string" || (!empty && value.length === 0) || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) reject();
  return value;
}
export function numberValue(value: unknown, min: number, reject: Reject = rejectInventoryInput): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) reject();
  return value;
}
export function idValue<K extends EntityKind>(kind: K, value: unknown, reject: Reject = rejectInventoryInput): EntityId<K> {
  try { return entityId(kind, textValue(value, reject, false, 36)); } catch { return reject(); }
}
function arrayValue(value: unknown, max: number, reject: Reject): unknown[] {
  if (!Array.isArray(value) || value.length > max) reject();
  return value;
}
function selections<K extends EntityKind>(kind: K, value: unknown): readonly EntityId<K>[] {
  const ids = arrayValue(value, INVENTORY_MAX_SELECTIONS, rejectInventoryInput).map(item => {
    const selected = record(item, ["id", "label"]);
    textValue(selected.label);
    return idValue(kind, selected.id);
  });
  if (new Set(ids).size !== ids.length) rejectInventoryInput();
  return Object.freeze(ids);
}
function pagination(page: unknown, pageSize: unknown, allowed: readonly number[]): { page: number; pageSize: number } {
  const parsedPage = numberValue(page, 1);
  const size = numberValue(pageSize, 1);
  if (!allowed.includes(size) || !Number.isSafeInteger(parsedPage * size)) rejectInventoryInput();
  return { page: parsedPage, pageSize: size };
}
export function parseInventoryQuery(value: unknown): InventoryQuery {
  const row = record(value, ["filter", "page", "pageSize"]);
  const filter = record(row.filter, ["products", "category", "warehouses", "suppliers", "fits", "seasons"]);
  const category = filter.category === null ? null : record(filter.category, ["id", "label"]);
  if (category) textValue(category.label);
  const page = pagination(row.page, row.pageSize, [100, 200, 500]);
  return Object.freeze({ page: page.page, pageSize: page.pageSize as InventoryQuery["pageSize"], filter: Object.freeze({
    productIds: selections("product", filter.products), categoryId: category ? idValue("category", category.id) : null,
    warehouseIds: selections("warehouse", filter.warehouses), supplierIds: selections("supplier", filter.suppliers),
    fitIds: selections("fit", filter.fits), seasonIds: selections("season", filter.seasons)
  }) });
}
export function parseInventoryCandidateQuery(value: unknown): InventoryCandidateQuery {
  const row = record(value, ["kind", "search", "page", "pageSize", "selectedIds", "categoryId"]);
  if (!KINDS.includes(row.kind as InventoryCandidateKind)) rejectInventoryInput();
  const kind = row.kind as InventoryCandidateKind;
  const selectedIds = arrayValue(row.selectedIds, INVENTORY_MAX_SELECTIONS, rejectInventoryInput).map(id => idValue(kind, id));
  if (new Set(selectedIds).size !== selectedIds.length) rejectInventoryInput();
  const page = pagination(row.page, row.pageSize, [20]);
  return Object.freeze({ kind, search: textValue(row.search, rejectInventoryInput, true, 200), page: page.page, pageSize: 20,
    selectedIds: Object.freeze(selectedIds), categoryId: row.categoryId === null ? null : idValue("category", row.categoryId) });
}
export function checkedInventoryScope(value: InventoryReadScope): InventoryReadScope {
  const reject = rejectInventoryResponse;
  const scope = record(value, ["hallIds", "warehouses"], [], reject);
  const hallIds = arrayValue(scope.hallIds, 1000, reject).map(id => idValue("hall", id, reject));
  const warehouses = arrayValue(scope.warehouses, 1000, reject).map(item => {
    const row = record(item, ["id", "hallId", "label"], [], reject);
    return Object.freeze({ id: idValue("warehouse", row.id, reject), hallId: idValue("hall", row.hallId, reject), label: textValue(row.label, reject) });
  });
  if (new Set(hallIds).size !== hallIds.length || new Set(warehouses.map(row => row.id)).size !== warehouses.length
    || warehouses.some(row => !hallIds.includes(row.hallId))) reject();
  if (!hallIds.length || !warehouses.length) throw new DomainError("FORBIDDEN", "No authorized inventory scope");
  return Object.freeze({ hallIds: Object.freeze(hallIds), warehouses: Object.freeze(warehouses) });
}
export function exactInteger(value: unknown, cell: boolean): bigint {
  const text = textValue(value, rejectInventoryResponse, false, 100);
  if (!/^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(text)) rejectInventoryResponse();
  try { return cell ? quantity(text) : BigInt(text); } catch { return rejectInventoryResponse(); }
}
export function stockTotal(value: unknown): InventoryStockTotal {
  const row = record(value, ["knownQuantity", "completeness", "unknownCells"], [], rejectInventoryResponse);
  exactInteger(row.knownQuantity, false);
  if (row.unknownCells !== 0 || row.completeness !== "complete") rejectInventoryResponse();
  return Object.freeze({ knownQuantity: row.knownQuantity as string, completeness: "complete", unknownCells: 0 });
}
export function sumTotals(values: readonly InventoryStockTotal[]): InventoryStockTotal {
  let known = 0n;
  for (const value of values) { known += BigInt(value.knownQuantity); }
  return Object.freeze({ knownQuantity: known.toString(), completeness: "complete", unknownCells: 0 });
}

export function equalTotal(actual: InventoryStockTotal, expected: InventoryStockTotal): void {
  if (actual.knownQuantity !== expected.knownQuantity || actual.unknownCells !== expected.unknownCells || actual.completeness !== expected.completeness) rejectInventoryResponse();
}
