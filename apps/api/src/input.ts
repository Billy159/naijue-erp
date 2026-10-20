import type { SalesCommand, ActorContext } from "../../../packages/application/src/ports.ts";
import type { SalesDraft, SalesLineRow, SalesSettlementRow, SkuSnapshot } from "../../../packages/domain/src/documents.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { businessDate, entityId, minorAmount, quantity, version } from "../../../packages/domain/src/values.ts";
import type { EntityKind, EntityId } from "../../../packages/domain/src/values.ts";

/** Transport validation only. Reference existence/scope and economics remain trusted server policy. */
function invalid(): never { throw new DomainError("INVALID_HTTP_INPUT", "Request does not match the sales HTTP contract"); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || !keys.every(key => Object.hasOwn(record, key))) invalid();
  return record;
}
function string(value: unknown): string { if (typeof value !== "string") invalid(); return value; }
function nullableString(value: unknown): string | null { return value === null ? null : string(value); }
function integer(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) invalid(); return value; }
function boolean(value: unknown): boolean { if (typeof value !== "boolean") invalid(); return value; }
function id<K extends EntityKind>(kind: K, value: unknown): EntityId<K> { return entityId(kind, string(value)); }
function array(value: unknown): unknown[] { if (!Array.isArray(value)) invalid(); return value; }
function choice<const T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) invalid();
  return value as T;
}
export function parseRequestKey(value: unknown): string {
  const key = string(value);
  // The exact caller key is preserved, never trimmed, generated, or replaced on retry.
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(key)) invalid();
  return key;
}
function snapshot(value: unknown): SkuSnapshot {
  const row = object(value, ["productCode", "productName", "colorName", "fitName", "sizeName", "barcode"]);
  return { productCode: string(row.productCode), productName: string(row.productName), colorName: string(row.colorName),
    fitName: string(row.fitName), sizeName: string(row.sizeName), barcode: nullableString(row.barcode) };
}
function line(value: unknown): SalesLineRow {
  const row = object(value, ["id", "salesId", "lineNo", "skuId", "quantity", "referencePrice", "dealPrice", "lineAmount", "allocatedDiscount", "isGift", "snapshot", "isCurrent"]);
  if (row.isCurrent !== true) invalid();
  return { id: id("salesLine", row.id), salesId: id("sales", row.salesId), lineNo: integer(row.lineNo), skuId: id("sku", row.skuId),
    quantity: quantity(string(row.quantity)), referencePrice: row.referencePrice === null ? null : minorAmount(string(row.referencePrice)),
    dealPrice: minorAmount(string(row.dealPrice)), lineAmount: minorAmount(string(row.lineAmount)), allocatedDiscount: minorAmount(string(row.allocatedDiscount)),
    isGift: boolean(row.isGift), snapshot: snapshot(row.snapshot), isCurrent: true };
}
function settlement(value: unknown): SalesSettlementRow {
  const row = object(value, ["id", "salesId", "lineNo", "paymentAccountId", "direction", "amount"]);
  return { id: id("settlement", row.id), salesId: id("sales", row.salesId), lineNo: integer(row.lineNo),
    paymentAccountId: id("paymentAccount", row.paymentAccountId), direction: choice(row.direction, ["RECEIVE", "REFUND"]), amount: minorAmount(string(row.amount)) };
}
function draft(value: unknown): SalesDraft {
  const row = object(value, ["header", "lines", "settlements"]);
  const header = object(row.header, ["id", "number", "businessType", "businessDate", "hallId", "customerId", "salespersonId", "warehouseId", "grossAmount", "orderDiscount", "netDue", "note"]);
  return { header: { id: id("sales", header.id), number: string(header.number), businessType: choice(header.businessType, ["SALE", "RETURN", "EXCHANGE"]),
    businessDate: businessDate(string(header.businessDate)), hallId: id("hall", header.hallId), customerId: id("customer", header.customerId),
    salespersonId: header.salespersonId === null ? null : id("staff", header.salespersonId), warehouseId: id("warehouse", header.warehouseId),
    grossAmount: minorAmount(string(header.grossAmount)), orderDiscount: minorAmount(string(header.orderDiscount)), netDue: minorAmount(string(header.netDue)), note: nullableString(header.note) },
    lines: array(row.lines).map(line), settlements: array(row.settlements).map(settlement) };
}
export function parseSalesCommand(body: unknown, actor: ActorContext): SalesCommand {
  // Select the exact key set before constructing any trusted command. No stripping/coercion/defaults.
  if (body === null || typeof body !== "object" || Array.isArray(body)) invalid();
  const action = choice((body as Record<string, unknown>).action, ["SAVE", "APPROVE", "UNAPPROVE", "VOID"]);
  const row = object(body, ["action", "requestKey", "expectedVersion", action === "SAVE" ? "draft" : "salesId"]);
  const requestKey = parseRequestKey(row.requestKey);
  if (action === "SAVE") return { actor, action, requestKey, expectedVersion: row.expectedVersion === null ? null : version(integer(row.expectedVersion)), draft: draft(row.draft) };
  return { actor, action, requestKey, expectedVersion: version(integer(row.expectedVersion)), salesId: id("sales", row.salesId) };
}
export function assertNoQuery(query: unknown): void {
  if (query === null || typeof query !== "object" || Array.isArray(query) || Object.keys(query).length !== 0) invalid();
}
