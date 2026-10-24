import { businessDate, entityId, quantity } from '../../../../packages/domain/src/values.ts';
import type { EntityKind } from '../../../../packages/domain/src/values.ts';
import type { SalesDetailDto, SalesDetailQuery, SalesListDto, SalesListQuery, SalesReferencePage, SalesReferenceParameters } from './contracts.ts';

function invalid(): never { throw new TypeError('Invalid sales read response.'); }
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== fields.length || fields.some(key => !Object.hasOwn(row, key))) invalid();
  return row;
}
function text(value: unknown): asserts value is string { if (typeof value !== 'string') invalid(); }
function id(kind: EntityKind, value: unknown): asserts value is string { text(value); entityId(kind, value); }
function nullableId(kind: EntityKind, value: unknown): void { if (value !== null) id(kind, value); }
function integer(value: unknown, minimum = 1): asserts value is number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) invalid(); }
function exact(value: unknown, unsigned = false): asserts value is string {
  text(value); if (value.length > 100 || !(unsigned ? /^(?:0|[1-9]\d*)$/ : /^(?:0|[1-9]\d*|-[1-9]\d*)$/).test(value)) invalid();
}
function choice(value: unknown, allowed: readonly unknown[]): void { if (!allowed.includes(value)) invalid(); }
function array(value: unknown, maximum: number): readonly unknown[] { if (!Array.isArray(value) || value.length > maximum) invalid(); return value; }
function nullableText(value: unknown): void { if (value !== null) text(value); }
function stamp(value: unknown): void {
  text(value); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) invalid();
}
const summaryFields = ['id', 'number', 'businessType', 'businessDate', 'hallId', 'salespersonId', 'customerId', 'warehouseId', 'status', 'version', 'grossAmount', 'orderDiscount', 'netDue', 'responsibleStaffId'] as const;
function header(row: Record<string, unknown>): void {
  id('sales', row.id); text(row.number); text(row.businessDate); businessDate(row.businessDate);
  choice(row.businessType, ['SALE', 'RETURN', 'EXCHANGE']); choice(row.status, ['DRAFT', 'APPROVED', 'VOID']);
  id('hall', row.hallId); nullableId('staff', row.salespersonId); nullableId('staff', row.responsibleStaffId); id('customer', row.customerId); id('warehouse', row.warehouseId); integer(row.version);
  exact(row.grossAmount); exact(row.orderDiscount); exact(row.netDue);
}
function page(row: Record<string, unknown>, parameters: { page: number; pageSize: number }, items: readonly unknown[]): void {
  integer(row.page); integer(row.pageSize); exact(row.exactTotal, true);
  if (row.page !== parameters.page || row.pageSize !== parameters.pageSize) invalid();
  const remaining = BigInt(row.exactTotal) - BigInt(parameters.page - 1) * BigInt(parameters.pageSize);
  const expected = remaining < 0n ? 0n : remaining < BigInt(parameters.pageSize) ? remaining : BigInt(parameters.pageSize);
  if (BigInt(items.length) !== expected) invalid();
}
export function salesListResponse(value: unknown, parameters: Readonly<SalesListQuery>): SalesListDto {
  const result = record(value, ['page', 'pageSize', 'exactTotal', 'items']); const items = array(result.items, parameters.pageSize); page(result, parameters, items);
  const seen = new Set<string>();
  for (const value of items) {
    const row = record(value, [...summaryFields, 'hallName', 'warehouseName', 'customerName', 'salespersonName', 'responsibleName', 'createdByName', 'quantity', 'incomingQuantity', 'outgoingQuantity', 'updatedAt']); header(row);
    exact(row.quantity); exact(row.incomingQuantity, true); exact(row.outgoingQuantity, true); stamp(row.updatedAt);
    if (BigInt(row.quantity) !== BigInt(row.outgoingQuantity) - BigInt(row.incomingQuantity)) invalid();
    for (const label of [row.hallName, row.warehouseName, row.customerName, row.createdByName]) text(label); nullableText(row.salespersonName); nullableText(row.responsibleName);
    const f = parameters.filter;
    for (const [expected, actual] of [[f.statuses, row.status], [f.businessTypes, row.businessType], [f.hallIds, row.hallId], [f.salespersonIds, row.salespersonId], [f.customerIds, row.customerId], [f.warehouseIds, row.warehouseId]] as const) {
      if (expected.length && !(expected as readonly unknown[]).includes(actual)) invalid();
    }
    // Deterministic Unicode default lowercase, not the viewing browser's locale.
    // PostgreSQL lower is database-locale-dependent; Unicode edge parity still
    // needs real-engine verification. Other filter/identity checks stay strict.
    if ((f.startDate !== null && (row.businessDate as string) < f.startDate) || (f.endDate !== null && (row.businessDate as string) > f.endDate)
      || (f.number !== null && !(row.number as string).toLowerCase().includes(f.number.toLowerCase()))) invalid();
    const key = row.id as string; if (seen.has(key)) invalid(); seen.add(key);
  }
  return value as SalesListDto;
}
export function salesDetailResponse(value: unknown, parameters: Readonly<SalesDetailQuery>): SalesDetailDto {
  const result = record(value, ['document', 'stockBasis', 'referenceNames', 'settlementNames']); choice(result.stockBasis, ['RUNTIME_LEDGER', 'CUTOFF_HISTORY']);
  const document = record(result.document, ['header', 'lines', 'settlements']);
  const h = record(document.header, [...summaryFields, 'note', 'createdByAccountId', 'createdHallId', 'createdAt', 'updatedAt', 'approvedByAccountId', 'approvedAt']); header(h);
  if (h.id !== parameters.salesId) invalid(); nullableText(h.note); id('account', h.createdByAccountId); nullableId('hall', h.createdHallId);
  stamp(h.createdAt); stamp(h.updatedAt); nullableId('account', h.approvedByAccountId); if (h.approvedAt !== null) stamp(h.approvedAt);
  const names = record(result.referenceNames, ['hallName', 'salespersonName', 'customerName', 'warehouseName', 'responsibleName', 'createdByName']);
  [names.hallName, names.customerName, names.warehouseName, names.createdByName].forEach(text); nullableText(names.salespersonName); nullableText(names.responsibleName);
  if ((h.salespersonId === null) !== (names.salespersonName === null)) invalid();
  const lineIds = new Set<string>(); const lineNos = new Set<number>(); let previousLine = 0;
  for (const value of array(document.lines, 2000)) {
    const row = record(value, ['id', 'salesId', 'lineNo', 'skuId', 'quantity', 'referencePrice', 'dealPrice', 'pricingRule', 'discountTenths', 'zeroConfirmed', 'lineAmount', 'allocatedDiscount', 'isGift', 'snapshot', 'isCurrent']);
    id('salesLine', row.id); id('sales', row.salesId); id('sku', row.skuId); integer(row.lineNo); exact(row.quantity); quantity(row.quantity);
    if (row.salesId !== parameters.salesId || row.isCurrent !== true || lineIds.has(row.id) || lineNos.has(row.lineNo) || row.lineNo < previousLine) invalid();
    lineIds.add(row.id); lineNos.add(row.lineNo); previousLine = row.lineNo;
    if (row.referencePrice !== null) exact(row.referencePrice, true); exact(row.dealPrice, true); exact(row.lineAmount); exact(row.allocatedDiscount);
    choice(row.pricingRule, [null, 'UNIT_PRICE', 'DISCOUNT']);
    if (row.discountTenths !== null) { integer(row.discountTenths, 0); if (row.discountTenths > 100) invalid(); }
    choice(row.zeroConfirmed, [null, true, false]); choice(row.isGift, [true, false]);
    const snapshot = record(row.snapshot, ['productCode', 'productName', 'colorName', 'fitName', 'sizeName', 'barcode']);
    [snapshot.productCode, snapshot.productName, snapshot.colorName, snapshot.fitName, snapshot.sizeName].forEach(text); nullableText(snapshot.barcode);
  }
  const settlementIds = new Set<string>(); const settlementAccounts = new Map<string, string>(); const settlementNos = new Set<number>(); let previousSettlement = 0;
  for (const value of array(document.settlements, 3)) {
    const row = record(value, ['id', 'salesId', 'lineNo', 'paymentAccountId', 'paymentMethodId', 'direction', 'amount']);
    id('settlement', row.id); id('sales', row.salesId); id('paymentAccount', row.paymentAccountId); nullableId('paymentMethod', row.paymentMethodId); integer(row.lineNo); exact(row.amount, true); choice(row.direction, ['RECEIVE', 'REFUND']);
    if (row.salesId !== parameters.salesId || settlementIds.has(row.id) || settlementNos.has(row.lineNo) || row.lineNo < previousSettlement) invalid();
    settlementIds.add(row.id); settlementAccounts.set(row.id, row.paymentAccountId); settlementNos.add(row.lineNo); previousSettlement = row.lineNo;
  }
  const settlementNames = array(result.settlementNames, 3); const seenNames = new Set<string>();
  if (settlementNames.length !== settlementIds.size) invalid();
  for (const value of settlementNames) {
    const row = record(value, ['settlementId', 'paymentAccountId', 'accountNameSnapshot', 'methodNameSnapshot', 'currentAccountName', 'currentMethodName']);
    id('settlement', row.settlementId); id('paymentAccount', row.paymentAccountId);
    [row.accountNameSnapshot, row.methodNameSnapshot, row.currentAccountName, row.currentMethodName].forEach(text);
    if (seenNames.has(row.settlementId) || settlementAccounts.get(row.settlementId) !== row.paymentAccountId) invalid();
    seenNames.add(row.settlementId);
  }
  return value as SalesDetailDto;
}
export function salesReferencesResponse(value: unknown, parameters: Readonly<SalesReferenceParameters>): SalesReferencePage {
  const result = record(value, ['page', 'exactTotal', 'items']); const items = array(result.items, parameters.pageSize);
  page({ ...result, pageSize: parameters.pageSize }, parameters, items);
  const seen = new Set<string>(); const kinds = { hall: 'hall', salesperson: 'staff', customer: 'customer', warehouse: 'warehouse' } as const;
  for (const value of items) { const row = record(value, ['id', 'label']); id(kinds[parameters.kind], row.id); text(row.label); if (!row.label.trim() || seen.has(row.id)) invalid(); seen.add(row.id); }
  return value as SalesReferencePage;
}
