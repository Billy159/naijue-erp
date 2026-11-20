import { DomainError } from "../../domain/src/errors.ts";
import { businessDate, entityId } from "../../domain/src/values.ts";
import type { EntityId, EntityKind } from "../../domain/src/values.ts";
import { SALES_QUERY_MAX_FILTER_IDS } from "./sales-query-ports.ts";
import type { SalesDetailQuery, SalesHistoryQuery, SalesListQuery, SalesReadScope, SalesReadScopeClause } from "./sales-query-ports.ts";

export function invalidSalesQuery(): never { throw new DomainError("INVALID_SALES_QUERY", "Invalid sales read parameters"); }
function record(value: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalidSalesQuery();
  const row = value as Record<string, unknown>;
  if (!keys.every(key => Object.hasOwn(row, key)) || Object.keys(row).some(key => !keys.includes(key) && !optional.includes(key))) invalidSalesQuery();
  return row;
}
function id<K extends EntityKind>(kind: K, value: unknown): EntityId<K> {
  try { if (typeof value !== "string") invalidSalesQuery(); return entityId(kind, value); } catch { return invalidSalesQuery(); }
}
function selections<T>(value: unknown, maximum: number, parse: (value: unknown) => T): readonly T[] {
  if (!Array.isArray(value) || value.length > maximum) invalidSalesQuery();
  for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) invalidSalesQuery();
  // Array.from visits holes rather than silently preserving a sparse selection.
  const result = Array.from(value, parse);
  if (new Set(result).size !== result.length) invalidSalesQuery();
  return Object.freeze(result);
}
function ids<K extends EntityKind>(kind: K, value: unknown): readonly EntityId<K>[] {
  return selections(value, SALES_QUERY_MAX_FILTER_IDS, value => id(kind, value));
}
function choices<T extends string>(value: unknown, allowed: readonly T[]): readonly T[] {
  return selections(value, allowed.length, value => {
    if (typeof value !== "string" || !allowed.includes(value as T)) invalidSalesQuery();
    return value as T;
  });
}
function date(value: unknown) {
  try { if (value === null) return null; if (typeof value !== "string") invalidSalesQuery(); return businessDate(value); } catch { return invalidSalesQuery(); }
}
function pagination(row: Record<string, unknown>): Pick<SalesListQuery, "page" | "pageSize"> {
  if (typeof row.page !== "number" || !Number.isSafeInteger(row.page) || row.page < 1
    || typeof row.pageSize !== "number" || ![20, 50, 100, 200].includes(row.pageSize) || !Number.isSafeInteger(row.page * row.pageSize)) invalidSalesQuery();
  return { page: row.page, pageSize: row.pageSize as SalesListQuery["pageSize"] };
}
export function parseSalesListQuery(value: unknown): SalesListQuery {
  const row = record(value, ["filter", "page", "pageSize"]);
  const f = record(row.filter, ["startDate", "endDate", "statuses", "businessTypes", "hallIds", "salespersonIds", "customerIds", "warehouseIds", "number"]);
  const startDate = date(f.startDate); const endDate = date(f.endDate);
  if (startDate !== null && endDate !== null && startDate > endDate) invalidSalesQuery();
  if (f.number !== null && (typeof f.number !== "string" || f.number.length < 1 || f.number.length > 200 || f.number.trim() !== f.number || /[\u0000-\u001f\u007f]/.test(f.number))) invalidSalesQuery();
  return Object.freeze({ ...pagination(row), filter: Object.freeze({ startDate, endDate,
    statuses: choices(f.statuses, ["DRAFT", "APPROVED", "VOID"] as const), businessTypes: choices(f.businessTypes, ["SALE", "RETURN", "EXCHANGE"] as const),
    hallIds: ids("hall", f.hallIds), salespersonIds: ids("staff", f.salespersonIds), customerIds: ids("customer", f.customerIds),
    warehouseIds: ids("warehouse", f.warehouseIds), number: f.number as string | null }) });
}
export function parseSalesDetailQuery(value: unknown): SalesDetailQuery {
  const row = record(value, ["salesId"]); return Object.freeze({ salesId: id("sales", row.salesId) });
}
export function parseSalesHistoryQuery(value: unknown): SalesHistoryQuery {
  const row = record(value, ["salesId", "page", "pageSize"]); return Object.freeze({ salesId: id("sales", row.salesId), ...pagination(row) });
}
export function checkedSalesReadScope(value: SalesReadScope): SalesReadScope {
  try {
    if (value?.kind === "all") { record(value, ["kind"]); return Object.freeze({ kind: "all" }); }
    const row = record(value, ["kind", "clauses"]);
    if (row.kind !== "restricted" || !Array.isArray(row.clauses) || row.clauses.length > 1000) throw new Error("Invalid scope");
    const clauses = row.clauses.map(value => {
      const clause = record(value, [], ["hallId", "warehouseId", "salespersonId", "createdByAccountId", "createdHallId"]);
      if (!Object.keys(clause).length) throw new Error("Empty scope clause");
      const result: Record<string, string> = {};
      for (const [key, kind] of [["hallId", "hall"], ["warehouseId", "warehouse"], ["salespersonId", "staff"], ["createdByAccountId", "account"], ["createdHallId", "hall"]] as const) {
        if (Object.hasOwn(clause, key)) result[key] = id(kind, clause[key]);
      }
      return Object.freeze(result) as SalesReadScopeClause;
    });
    // An empty grant set is a denied scope, never shorthand for all records.
    if (!clauses.length) throw new DomainError("FORBIDDEN", "No authorized sales scope");
    return Object.freeze({ kind: "restricted", clauses: Object.freeze(clauses) });
  } catch (error) {
    if (error instanceof DomainError && error.code === "FORBIDDEN") throw error;
    throw new Error("Invalid trusted sales read scope");
  }
}
export function activeSalesRead(signal: AbortSignal): void {
  if (signal.aborted) throw new DomainError("SALES_READ_ABORTED", "Sales read is no longer active");
}
