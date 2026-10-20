import { DomainError } from "../../domain/src/errors.ts";
import { businessDate, entityId } from "../../domain/src/values.ts";
import type { EntityId, EntityKind } from "../../domain/src/values.ts";
import { TRANSFER_QUERY_MAX_PAGE_SIZE } from "./transfer-query-ports.ts";
import type { TransferDetailQuery, TransferListQuery, TransferReadScope, TransferReadScopeClause } from "./transfer-query-ports.ts";

export function invalidTransferQuery(): never { throw new DomainError("INVALID_TRANSFER_QUERY", "Invalid transfer read parameters"); }
function record(value: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalidTransferQuery();
  const row = value as Record<string, unknown>;
  if (!keys.every(key => Object.hasOwn(row, key)) || Object.keys(row).some(key => !keys.includes(key) && !optional.includes(key))) invalidTransferQuery();
  return row;
}
function id<K extends EntityKind>(kind: K, value: unknown): EntityId<K> {
  try { if (typeof value !== "string") invalidTransferQuery(); return entityId(kind, value); } catch { return invalidTransferQuery(); }
}
const nullableId = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> | null => value === null ? null : id(kind, value);
function date(value: unknown) {
  try { if (value === null) return null; if (typeof value !== "string") invalidTransferQuery(); return businessDate(value); } catch { return invalidTransferQuery(); }
}
export function parseTransferListQuery(value: unknown): TransferListQuery {
  const row = record(value, ["filter", "page", "pageSize"]);
  const f = record(row.filter, ["startDate", "endDate", "status", "fromWarehouseId", "toWarehouseId", "number"]);
  const startDate = date(f.startDate); const endDate = date(f.endDate);
  if (startDate !== null && endDate !== null && startDate > endDate) invalidTransferQuery();
  if (f.status !== null && !["DRAFT", "APPROVED", "VOID"].includes(f.status as string)) invalidTransferQuery();
  if (f.number !== null && (typeof f.number !== "string" || f.number.length < 1 || f.number.length > 200 || f.number.trim() !== f.number || /[\u0000-\u001f\u007f]/.test(f.number))) invalidTransferQuery();
  if (typeof row.page !== "number" || !Number.isSafeInteger(row.page) || row.page < 1
    || typeof row.pageSize !== "number" || !Number.isSafeInteger(row.pageSize) || row.pageSize < 1 || row.pageSize > TRANSFER_QUERY_MAX_PAGE_SIZE
    || !Number.isSafeInteger(row.page * row.pageSize)) invalidTransferQuery();
  return Object.freeze({ page: row.page, pageSize: row.pageSize, filter: Object.freeze({ startDate, endDate,
    status: f.status as TransferListQuery["filter"]["status"], fromWarehouseId: nullableId("warehouse", f.fromWarehouseId),
    toWarehouseId: nullableId("warehouse", f.toWarehouseId), number: f.number as string | null }) });
}
export function parseTransferDetailQuery(value: unknown): TransferDetailQuery {
  const row = record(value, ["transferId"]); return Object.freeze({ transferId: id("transfer", row.transferId) });
}
export function checkedTransferReadScope(value: TransferReadScope): TransferReadScope {
  try {
    if (value?.kind === "all") { record(value, ["kind"]); return Object.freeze({ kind: "all" }); }
    const row = record(value, ["kind", "clauses"]);
    if (row.kind !== "restricted" || !Array.isArray(row.clauses) || row.clauses.length > 1000) throw new Error("Invalid scope");
    const clauses = row.clauses.map(value => {
      const clause = record(value, [], ["fromHallId", "toHallId", "fromWarehouseId", "toWarehouseId", "createdByAccountId", "createdHallId", "createdRole"]);
      if (!Object.keys(clause).length) throw new Error("Empty scope clause");
      const result: Record<string, string> = {};
      for (const [key, kind] of [["fromHallId", "hall"], ["toHallId", "hall"], ["fromWarehouseId", "warehouse"], ["toWarehouseId", "warehouse"], ["createdByAccountId", "account"], ["createdHallId", "hall"]] as const) {
        if (Object.hasOwn(clause, key)) result[key] = id(kind, clause[key]);
      }
      if (Object.hasOwn(clause, "createdRole")) {
        if (typeof clause.createdRole !== "string" || !["ADMIN", "WAREHOUSE", "SALESPERSON"].includes(clause.createdRole)) throw new Error("Invalid creation role");
        result.createdRole = clause.createdRole;
      }
      return Object.freeze(result) as TransferReadScopeClause;
    });
    if (!clauses.length) throw new DomainError("FORBIDDEN", "No authorized transfer scope");
    return Object.freeze({ kind: "restricted", clauses: Object.freeze(clauses) });
  } catch (error) {
    if (error instanceof DomainError && error.code === "FORBIDDEN") throw error;
    throw new Error("Invalid trusted transfer read scope");
  }
}
export function activeTransferRead(signal: AbortSignal): void {
  if (signal.aborted) throw new DomainError("TRANSFER_READ_ABORTED", "Transfer read is no longer active");
}
