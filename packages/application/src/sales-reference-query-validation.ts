import type { SalesFilterReferenceQuery } from "./sales-query-ports.ts";
import { invalidSalesQuery } from "./sales-query-validation.ts";

export function parseSalesFilterReferenceQuery(value: unknown): SalesFilterReferenceQuery {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalidSalesQuery();
  const row = value as Record<string, unknown>;
  const keys = ["kind", "search", "page", "pageSize"];
  if (Object.keys(row).length !== keys.length || !keys.every(key => Object.hasOwn(row, key))) invalidSalesQuery();
  if (!["hall", "salesperson", "customer", "warehouse"].includes(row.kind as string)
    || typeof row.search !== "string" || row.search.length > 200 || row.search.trim() !== row.search || /[\u0000-\u001f\u007f]/.test(row.search)
    || typeof row.page !== "number" || !Number.isSafeInteger(row.page) || row.page < 1
    || row.pageSize !== 20 || !Number.isSafeInteger(row.page * 20)) invalidSalesQuery();
  return Object.freeze({ kind: row.kind as SalesFilterReferenceQuery["kind"], search: row.search, page: row.page, pageSize: 20 });
}
