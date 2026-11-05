import type { SalesCommand, ActorContext } from "../../../packages/application/src/ports.ts";
import type { SalesDraft, SalesLineRow, SalesSettlementRow, SkuSnapshot } from "../../../packages/domain/src/documents.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { businessDate, entityId, minorAmount, quantity, version } from "../../../packages/domain/src/values.ts";
import type { EntityKind, EntityId } from "../../../packages/domain/src/values.ts";
import { parseNativeSalesSaveProposal } from '../../../packages/application/src/native-sales-preparation.ts';

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
function discountTenths(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) invalid();
  return value;
}
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
function snapshot(value: unknown, retainUnknown: boolean): SkuSnapshot {
  const row = object(value, ["productCode", "productName", "colorName", "fitName", "sizeName", "barcode"]);
  const label = retainUnknown ? nullableString : string;
  return { productCode: label(row.productCode), productName: label(row.productName), colorName: label(row.colorName),
    fitName: label(row.fitName), sizeName: label(row.sizeName), barcode: nullableString(row.barcode) };
}
function line(value: unknown, retainUnknown: boolean): SalesLineRow {
  const row = object(value, ["id", "salesId", "lineNo", "skuId", "quantity", "referencePrice", "dealPrice", "pricingRule", "discountTenths", "zeroConfirmed", "lineAmount", "allocatedDiscount", "isGift", "snapshot", "isCurrent"]);
  if (row.isCurrent !== true) invalid();
  return { id: id("salesLine", row.id), salesId: id("sales", row.salesId), lineNo: integer(row.lineNo), skuId: id("sku", row.skuId),
    quantity: quantity(string(row.quantity)), referencePrice: row.referencePrice === null ? null : minorAmount(string(row.referencePrice)),
    dealPrice: minorAmount(string(row.dealPrice)), pricingRule: retainUnknown && row.pricingRule === null ? null : choice(row.pricingRule, ["UNIT_PRICE", "DISCOUNT"]),
    discountTenths: discountTenths(row.discountTenths), zeroConfirmed: retainUnknown && row.zeroConfirmed === null ? null : boolean(row.zeroConfirmed), lineAmount: minorAmount(string(row.lineAmount)), allocatedDiscount: retainUnknown && row.allocatedDiscount === null ? null : minorAmount(string(row.allocatedDiscount)),
    isGift: retainUnknown && row.isGift === null ? null : boolean(row.isGift), snapshot: snapshot(row.snapshot, retainUnknown), isCurrent: true };
}
function settlement(value: unknown, retainUnknown: boolean): SalesSettlementRow {
  const row = object(value, ["id", "salesId", "lineNo", "paymentAccountId", "paymentMethodId", "direction", "amount"]);
  return { id: id("settlement", row.id), salesId: id("sales", row.salesId), lineNo: integer(row.lineNo),
    paymentAccountId: id("paymentAccount", row.paymentAccountId), paymentMethodId: retainUnknown && row.paymentMethodId === null ? null : id("paymentMethod", row.paymentMethodId), direction: choice(row.direction, ["RECEIVE", "REFUND"]), amount: minorAmount(string(row.amount)) };
}
function draft(value: unknown, retainUnknown: boolean): SalesDraft {
  const row = object(value, ["header", "lines", "settlements"]);
  const header = object(row.header, ["id", "number", "businessType", "businessDate", "hallId", "customerId", "salespersonId", "warehouseId", "grossAmount", "orderDiscount", "netDue", "note"]);
  return { header: { id: id("sales", header.id), number: string(header.number), businessType: choice(header.businessType, ["SALE", "RETURN", "EXCHANGE"]),
    businessDate: businessDate(string(header.businessDate)), hallId: header.hallId === null ? null : id("hall", header.hallId), customerId: id("customer", header.customerId),
    salespersonId: header.salespersonId === null ? null : id("staff", header.salespersonId), warehouseId: id("warehouse", header.warehouseId),
    grossAmount: minorAmount(string(header.grossAmount)), orderDiscount: minorAmount(string(header.orderDiscount)), netDue: minorAmount(string(header.netDue)), note: nullableString(header.note) },
    lines: array(row.lines).map(value => line(value, retainUnknown)), settlements: array(row.settlements).map(value => settlement(value, retainUnknown)) };
}
export function parseSalesCommand(body: unknown, actor: ActorContext): SalesCommand {
  // Select the exact key set before constructing any trusted command. No stripping/coercion/defaults.
  if (body === null || typeof body !== "object" || Array.isArray(body)) invalid();
  const action = choice((body as Record<string, unknown>).action, ["SAVE", "APPROVE", "UNAPPROVE", "VOID"]);
  if(action==='SAVE'&&Object.hasOwn(body,'proposal')){
    const row=object(body,['action','requestKey','expectedVersion','proposal']),proposal=parseNativeSalesSaveProposal(row.proposal);
    const expectedVersion=row.expectedVersion===null?null:version(integer(row.expectedVersion));
    if((proposal.salesId===null)!==(expectedVersion===null))invalid();
    return {actor,action,requestKey:parseRequestKey(row.requestKey),expectedVersion,proposal};
  }
  const row = object(body, ["action", "requestKey", "expectedVersion", action === "SAVE" ? "draft" : "salesId"]);
  const requestKey = parseRequestKey(row.requestKey);
  if (action === "SAVE") {
    const expectedVersion = row.expectedVersion === null ? null : version(integer(row.expectedVersion));
    // Structural compatibility only: the locked ordinary service compares each
    // nullable retained fact with its actual prior row. A nonnull version is NOT
    // authority to invent nulls on new/changed rows or bypass economics.
    return { actor, action, requestKey, expectedVersion, draft: draft(row.draft, expectedVersion !== null) };
  }
  return { actor, action, requestKey, expectedVersion: version(integer(row.expectedVersion)), salesId: id("sales", row.salesId) };
}
export function assertNoQuery(query: unknown): void {
  if (query === null || typeof query !== "object" || Array.isArray(query) || Object.keys(query).length !== 0) invalid();
}
