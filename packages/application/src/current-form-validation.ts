import { DomainError } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import type { EntityId, EntityKind } from "../../domain/src/values.ts";
import type { ActorContext } from "./ports.ts";
import { CURRENT_FORM_MAX_TARGET_SKUS } from "./current-form-ports.ts";
import type { CurrentFormContext, CurrentFormProductQuery, CurrentFormProductSkuQuery, CurrentFormReadGrant,
  CurrentFormSearch, CurrentFormSkuBatchQuery, CurrentSalesReferenceQuery, CurrentTransferWarehouseQuery } from "./current-form-ports.ts";

function invalid(): never { throw new DomainError("INVALID_CURRENT_FORM_QUERY", "Invalid current form query"); }
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) invalid();
  return value as Record<string, unknown>;
}
function id<K extends EntityKind>(kind: K, value: unknown): EntityId<K> {
  try { if (typeof value !== "string") invalid(); return entityId(kind, value); } catch { return invalid(); }
}
function paging(row: Record<string, unknown>): { readonly page: number; readonly pageSize: 20 } {
  if (typeof row.page !== "number" || !Number.isSafeInteger(row.page) || row.page < 1
    || row.pageSize !== 20 || !Number.isSafeInteger(row.page * 20)) invalid();
  return { page: row.page, pageSize: 20 };
}
function search(row: Record<string, unknown>): CurrentFormSearch {
  if (typeof row.search !== "string" || row.search.length > 200 || row.search.trim() !== row.search || /[\x00-\x1f\x7f]/.test(row.search)) invalid();
  return { ...paging(row), search: row.search };
}
function context(value: unknown): CurrentFormContext {
  if (value && typeof value === "object" && "kind" in value && value.kind === "TRANSFER") {
    record(value, ["kind"]); return Object.freeze({ kind: "TRANSFER" });
  }
  const row = record(value, ["kind", "hallId"]); if (row.kind !== "SALES") invalid();
  return Object.freeze({ kind: "SALES", hallId: id("hall", row.hallId) });
}
export function parseCurrentSalesReferenceQuery(value: unknown): CurrentSalesReferenceQuery {
  const accountKind = value !== null && typeof value === "object" && !Array.isArray(value)
    && (value as Record<string, unknown>).kind === "paymentAccount";
  const row = record(value, accountKind ? ["kind", "hallId", "paymentMethodId", "search", "page", "pageSize"]
    : ["kind", "hallId", "search", "page", "pageSize"]);
  if (row.kind === "hall") {
    if (row.hallId !== null) invalid();
    return Object.freeze({ ...search(row), kind: "hall", hallId: null });
  }
  const hallId = id("hall", row.hallId);
  if (row.kind === "paymentAccount") return Object.freeze({ ...search(row), kind: "paymentAccount", hallId,
    paymentMethodId: id("paymentMethod", row.paymentMethodId) });
  if (row.kind !== "customer" && row.kind !== "salesperson" && row.kind !== "warehouse") invalid();
  return Object.freeze({ ...search(row), kind: row.kind, hallId });
}
export function parseCurrentTransferWarehouseQuery(value: unknown): CurrentTransferWarehouseQuery {
  const row = record(value, ["direction", "search", "page", "pageSize"]); if (row.direction !== "FROM" && row.direction !== "TO") invalid();
  return Object.freeze({ ...search(row), direction: row.direction });
}
export function parseCurrentFormProductQuery(value: unknown): CurrentFormProductQuery {
  const row = record(value, ["context", "search", "page", "pageSize"]); return Object.freeze({ ...search(row), context: context(row.context) });
}
export function parseCurrentFormProductSkuQuery(value: unknown): CurrentFormProductSkuQuery {
  const row = record(value, ["context", "productId", "page", "pageSize"]);
  return Object.freeze({ ...paging(row), context: context(row.context), productId: id("product", row.productId) });
}
export function parseCurrentFormSkuBatchQuery(value: unknown): CurrentFormSkuBatchQuery {
  const row = record(value, ["context", "skuIds"]);
  if (!Array.isArray(row.skuIds) || row.skuIds.length < 1 || row.skuIds.length > CURRENT_FORM_MAX_TARGET_SKUS) invalid();
  const skuIds = row.skuIds.map((value: unknown) => id("sku", value)); if (new Set(skuIds).size !== skuIds.length) invalid();
  return Object.freeze({ context: context(row.context), skuIds: Object.freeze(skuIds) });
}
export function checkedCurrentFormActor(value: ActorContext): ActorContext {
  try {
    if (!value || !Object.hasOwn(value, "hallId")) invalid();
    return Object.freeze({ accountId: id("account", value.accountId), hallId: value.hallId === null ? null : id("hall", value.hallId) });
  } catch { throw new TypeError("Invalid trusted current form actor"); }
}
export function checkedCurrentFormGrant(value: CurrentFormReadGrant): CurrentFormReadGrant {
  try {
    if (value?.kind === "all") { record(value, ["kind"]); return Object.freeze({ kind: "all" }); }
    const row = record(value, ["kind", "hallIds"]);
    if (row.kind !== "halls" || !Array.isArray(row.hallIds) || row.hallIds.length < 1 || row.hallIds.length > 1000) invalid();
    const hallIds = row.hallIds.map((value: unknown) => id("hall", value)); if (new Set(hallIds).size !== hallIds.length) invalid();
    return Object.freeze({ kind: "halls", hallIds: Object.freeze(hallIds) });
  } catch { throw new DomainError("FORBIDDEN", "Current form authorization did not supply a valid grant"); }
}
export function activeCurrentFormRead(signal: AbortSignal): void {
  if (signal.aborted) throw new DomainError("CURRENT_FORM_READ_ABORTED", "Current form read is no longer active");
}
