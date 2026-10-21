import type { NativeSalesCreateProposal } from "../../../packages/application/src/native-sales-preparation.ts";
import { SALES_PREPARE_MAX_LINES, SALES_PREPARE_MAX_NOTE_LENGTH } from "../../../packages/application/src/sales-payload-budget.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  requireDomain(value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype, "INVALID_HTTP_INPUT", "Expected proposal object");
  const row = value as Record<string, unknown>;
  requireDomain(Object.keys(row).length === keys.length && keys.every(key => Object.hasOwn(row, key)), "INVALID_HTTP_INPUT", "Unexpected or missing proposal fields");
  return row;
}
const text = (value: unknown): string => { requireDomain(typeof value === "string", "INVALID_HTTP_INPUT", "Expected text"); return value; };
const nullable = (value: unknown): string | null => value === null ? null : text(value);
const boolean = (value: unknown): boolean => { requireDomain(typeof value === "boolean", "INVALID_HTTP_INPUT", "Expected explicit boolean"); return value; };
export function parseSalesCreateProposal(input: unknown): NativeSalesCreateProposal {
  const row = object(input, ["businessType", "businessDate", "note", "hallId", "customerId", "salespersonId", "warehouseId", "orderDiscount", "lines", "settlements"]);
  requireDomain((row.businessType === "SALE" || row.businessType === "RETURN" || row.businessType === "EXCHANGE") && Array.isArray(row.lines) && row.lines.length > 0 && row.lines.length <= SALES_PREPARE_MAX_LINES
    && Array.isArray(row.settlements) && row.settlements.length <= 3, "INVALID_HTTP_INPUT", "Bounded sales input required");
  const note = nullable(row.note); requireDomain(note === null || note.length <= SALES_PREPARE_MAX_NOTE_LENGTH, "INVALID_HTTP_INPUT", "Note exceeds limit");
  return { businessType: row.businessType, businessDate: text(row.businessDate), note, hallId: text(row.hallId), customerId: text(row.customerId),
    salespersonId: nullable(row.salespersonId), warehouseId: text(row.warehouseId), orderDiscount: text(row.orderDiscount),
    lines: row.lines.map(value => {
      const line = object(value, ["skuId", "quantity", "dealPrice", "pricingRule", "discountTenths", "isGift", "zeroConfirmed"]);
      requireDomain((line.pricingRule === "UNIT_PRICE" || line.pricingRule === "DISCOUNT") && (line.discountTenths === null
        || typeof line.discountTenths === "number" && Number.isInteger(line.discountTenths) && line.discountTenths >= 0 && line.discountTenths <= 100),
      "INVALID_HTTP_INPUT", "Explicit pricing rule required");
      return { skuId: text(line.skuId), quantity: text(line.quantity), dealPrice: nullable(line.dealPrice), pricingRule: line.pricingRule,
        discountTenths: line.discountTenths, isGift: boolean(line.isGift), zeroConfirmed: boolean(line.zeroConfirmed) };
    }), settlements: row.settlements.map(value => {
      const settlement = object(value, ["paymentAccountId", "paymentMethodId", "direction", "amount"]);
      requireDomain(settlement.direction === "RECEIVE" || settlement.direction === "REFUND", "INVALID_HTTP_INPUT", "Explicit direction required");
      return { paymentAccountId: text(settlement.paymentAccountId), paymentMethodId: text(settlement.paymentMethodId), direction: settlement.direction, amount: text(settlement.amount) };
    }) };
}
