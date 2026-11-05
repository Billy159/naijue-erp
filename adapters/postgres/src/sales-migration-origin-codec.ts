/** Complete sealed migration snapshot decoder. Exact numeric text is produced in SQL before JSON parsing. */
import type {SalesDocument,SalesHeaderRow,SalesLineRow,SalesSettlementRow} from '../../../packages/domain/src/documents.ts';
import type {EntityId,EntityKind} from '../../../packages/domain/src/values.ts';
import {entityId,businessDate} from '../../../packages/domain/src/values.ts';
import {requireDomain} from '../../../packages/domain/src/errors.ts';
import {stringValue,nullableString,booleanValue,integerValue,versionFromSql,moneyFromSql,quantityFromSql,jsonObject} from './codec.ts';
const id = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> => entityId(kind, stringValue(value));
const nullableId = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> | null => value === null ? null : id(kind, value);
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  requireDomain(typeof value === "string" && choices.includes(value as T), "INVALID_DATABASE_VALUE", "Unexpected persisted enum value");
  return value as T;
}
function decodeHeader(row: Record<string, unknown>): SalesHeaderRow {
  return { id: id("sales", row.id), number: stringValue(row.number), businessType: choice(row.business_type, ["SALE", "RETURN", "EXCHANGE"]),
    businessDate: businessDate(stringValue(row.business_date)), hallId: nullableId("hall", row.hall_id), customerId: id("customer", row.customer_id),
    salespersonId: nullableId("staff", row.salesperson_id), warehouseId: id("warehouse", row.warehouse_id), status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]),
    version: versionFromSql(row.version), grossAmount: moneyFromSql(row.gross_amount), orderDiscount: moneyFromSql(row.order_discount), netDue: moneyFromSql(row.net_due),
    note: nullableString(row.note), responsibleStaffId: nullableId("staff", row.responsible_staff_id), createdByAccountId: nullableId("account", row.created_by_account_id), createdHallId: nullableId("hall", row.created_hall_id),
    createdAt: nullableString(row.created_at), updatedAt: nullableString(row.updated_at), approvedByAccountId: nullableId("account", row.approved_by_account_id), approvedAt: nullableString(row.approved_at),
    ...(row.unified_staff_columns === true ? { createdByStaffId: nullableId("staff", row.created_by_staff_id), approvedByStaffId: nullableId("staff", row.approved_by_staff_id) } : {}) };
}
function decodeLine(row: Record<string, unknown>): SalesLineRow {
  return { id: id("salesLine", row.id), salesId: id("sales", row.sales_id), lineNo: integerValue(row.line_no), skuId: id("sku", row.sku_id),
    quantity: quantityFromSql(row.quantity), referencePrice: row.reference_price === null ? null : moneyFromSql(row.reference_price), dealPrice: moneyFromSql(row.deal_price),
    pricingRule: row.pricing_rule === null ? null : choice(row.pricing_rule, ["UNIT_PRICE", "DISCOUNT"] as const),
    discountTenths: row.discount_tenths === null ? null : integerValue(row.discount_tenths),
    zeroConfirmed: row.zero_confirmed === null ? null : booleanValue(row.zero_confirmed),
    lineAmount: moneyFromSql(row.line_amount), allocatedDiscount: row.allocated_discount === null ? null : moneyFromSql(row.allocated_discount), isGift: row.is_gift === null ? null : booleanValue(row.is_gift), isCurrent: booleanValue(row.is_current),
    snapshot: { productCode: nullableString(row.product_code_snapshot), productName: nullableString(row.product_name_snapshot), colorName: nullableString(row.color_name_snapshot),
      fitName: nullableString(row.fit_name_snapshot), sizeName: nullableString(row.size_name_snapshot), barcode: nullableString(row.barcode_snapshot) } };
}
function decodeSettlement(row: Record<string, unknown>): SalesSettlementRow {
  return { id: id("settlement", row.id), salesId: id("sales", row.sales_id), lineNo: integerValue(row.line_no), paymentAccountId: id("paymentAccount", row.payment_account_id), paymentMethodId: nullableId("paymentMethod", row.payment_method_id_snapshot),
    direction: choice(row.direction, ["RECEIVE", "REFUND"]), amount: moneyFromSql(row.amount) };
}

export function decodeSealedSalesMigration(snapshot:Record<string,unknown>,salesId:EntityId<'sales'>):SalesDocument {
 const h=jsonObject(snapshot.header);
 requireDomain(h.id===salesId&&h.stock_basis==='CUTOFF_HISTORY'&&Array.isArray(snapshot.lines)&&Array.isArray(snapshot.settlements),'INVALID_BASELINE_ANCHOR','Complete same-target historical financial snapshot required');
 const header=decodeHeader({...h,unified_staff_columns:Object.hasOwn(h,'created_by_staff_id')});
 const lines=snapshot.lines.map(v=>decodeLine(jsonObject(v))),settlements=snapshot.settlements.map(v=>decodeSettlement(jsonObject(v)));
 requireDomain(lines.every(l=>l.salesId===salesId)&&settlements.every(r=>r.salesId===salesId)&&new Set(lines.map(l=>l.id)).size===lines.length&&new Set(settlements.map(r=>r.id)).size===settlements.length,'INVALID_BASELINE_ANCHOR','Unique owned sealed rows required');
 return {header,lines,settlements};
}
