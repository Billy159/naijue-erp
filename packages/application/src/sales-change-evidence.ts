import type { SalesDocument, SalesLineRow, SalesSettlementRow } from "../../domain/src/documents.ts";
import type { SalesAuditValues } from "./ports.ts";

const headerFields = ["number", "businessType", "businessDate", "hallId", "salespersonId", "customerId", "warehouseId", "status",
  "grossAmount", "orderDiscount", "netDue", "note", "updatedAt", "approvedByAccountId", "approvedAt"] as const;
const lineFields = ["id", "salesId", "lineNo", "skuId", "quantity", "referencePrice", "dealPrice", "pricingRule", "discountTenths",
  "zeroConfirmed", "lineAmount", "allocatedDiscount", "isGift", "isCurrent"] as const;
const snapshotFields = ["productCode", "productName", "colorName", "fitName", "sizeName", "barcode"] as const;
const settlementFields = ["id", "salesId", "lineNo", "paymentAccountId", "direction", "amount"] as const;

/** Explicit native-value comparisons, not display/JSON coercions or audit reconstruction. */
export function sameSalesLine(left: SalesLineRow, right: SalesLineRow): boolean {
  return lineFields.every(field => left[field] === right[field])
    && snapshotFields.every(field => left.snapshot[field] === right.snapshot[field]);
}
export function sameSalesSettlement(left: SalesSettlementRow, right: SalesSettlementRow): boolean {
  return settlementFields.every(field => left[field] === right[field]);
}

/** Evidence only. Native document rows remain the source of truth. */
export function salesChangeEvidence(previous: SalesDocument | undefined, next: SalesDocument): {
  readonly before: SalesAuditValues | null; readonly after: SalesAuditValues;
} {
  const changedHeaders = headerFields.filter(field => previous === undefined || previous.header[field] !== next.header[field]);
  const oldLines = new Map(previous?.lines.map(line => [line.id, line]) ?? []);
  const changedLines = new Set(next.lines.filter(line => {
    const old = oldLines.get(line.id);
    return old === undefined || !sameSalesLine(old, line);
  }).map(line => line.id));
  const oldSettlements = new Map(previous?.settlements.map(row => [row.id, row]) ?? []);
  const nextSettlements = new Map(next.settlements.map(row => [row.id, row]));
  const changedSettlements = new Set(next.settlements.filter(row => {
    const old = oldSettlements.get(row.id);
    return old === undefined || !sameSalesSettlement(old, row);
  }).map(row => row.id));
  for (const row of previous?.settlements ?? []) if (!nextSettlements.has(row.id)) changedSettlements.add(row.id);

  const values = (document: SalesDocument): SalesAuditValues => ({
    header: { version: document.header.version, ...Object.fromEntries(changedHeaders.map(field => [field, document.header[field]])) },
    lines: document.lines.filter(line => changedLines.has(line.id)).map(({ id, lineNo, skuId, quantity, referencePrice, dealPrice,
      pricingRule, discountTenths, zeroConfirmed, lineAmount, allocatedDiscount, isGift, snapshot, isCurrent }) => ({ id, lineNo, skuId, quantity,
      referencePrice, dealPrice, pricingRule, discountTenths, zeroConfirmed, lineAmount, allocatedDiscount, isGift,
      snapshot: { productCode: snapshot.productCode, productName: snapshot.productName, colorName: snapshot.colorName,
        fitName: snapshot.fitName, sizeName: snapshot.sizeName, barcode: snapshot.barcode }, isCurrent })),
    settlements: document.settlements.filter(row => changedSettlements.has(row.id)).map(({ id, salesId, lineNo, paymentAccountId, direction, amount }) => ({
      id, salesId, lineNo, paymentAccountId, direction, amount }))
  });
  return { before: previous ? values(previous) : null, after: values(next) };
}
