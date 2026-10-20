import { businessDate, entityId, quantity } from '../../../../packages/domain/src/values.ts';
import type { EntityKind } from '../../../../packages/domain/src/values.ts';
import type { TransferDetailDto, TransferDetailQuery, TransferListDto, TransferListQuery, TransferWarehousePage, TransferWarehouseParameters } from './contracts.ts';

function invalid(): never { throw new TypeError('Invalid native transfer response.'); }
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== fields.length || fields.some(key => !Object.hasOwn(row, key))) invalid();
  return row;
}
function text(value: unknown): asserts value is string { if (typeof value !== 'string') invalid(); }
function named(value: unknown): asserts value is string { text(value); if (!value.trim()) invalid(); }
function id(kind: EntityKind, value: unknown): asserts value is string { text(value); entityId(kind, value); }
function nullableId(kind: EntityKind, value: unknown) { if (value !== null) id(kind, value); }
function integer(value: unknown, minimum = 1): asserts value is number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) invalid(); }
function exact(value: unknown): asserts value is string { text(value); if (value.length > 100 || !/^(?:0|[1-9]\d*)$/.test(value)) invalid(); }
function nullableText(value: unknown) { if (value !== null) text(value); }
function consistent(facts: Map<string, string>, key: string, values: readonly unknown[]) {
  const value = JSON.stringify(values); const known = facts.get(key); if (known !== undefined && known !== value) invalid(); facts.set(key, value);
}
function choice(value: unknown, allowed: readonly unknown[]) { if (!allowed.includes(value)) invalid(); }
function array(value: unknown, maximum: number): readonly unknown[] { if (!Array.isArray(value) || value.length > maximum) invalid(); return value; }
function stamp(value: unknown) {
  text(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) invalid();
}
const baseFields = ['id', 'number', 'businessDate', 'fromWarehouseId', 'toWarehouseId', 'status', 'version'] as const;
const referenceFields = ['fromWarehouseName', 'toWarehouseName', 'fromHallName', 'toHallName', 'createdByName', 'approvedByName'] as const;
function header(row: Record<string, unknown>) {
  id('transfer', row.id); named(row.number); text(row.businessDate); businessDate(row.businessDate);
  id('warehouse', row.fromWarehouseId); id('warehouse', row.toWarehouseId); if (row.fromWarehouseId === row.toWarehouseId) invalid();
  choice(row.status, ['DRAFT', 'APPROVED', 'VOID']); integer(row.version);
}
function references(row: Record<string, unknown>) { referenceFields.slice(0, -1).forEach(field => named(row[field])); nullableText(row.approvedByName); }
function page(row: Record<string, unknown>, parameters: { readonly page: number; readonly pageSize: number }, items: readonly unknown[]) {
  integer(row.page); integer(row.pageSize); exact(row.exactTotal);
  if (row.page !== parameters.page || row.pageSize !== parameters.pageSize) invalid();
  const remaining = BigInt(row.exactTotal) - BigInt(parameters.page - 1) * BigInt(parameters.pageSize);
  const expected = remaining < 0n ? 0n : remaining < BigInt(parameters.pageSize) ? remaining : BigInt(parameters.pageSize);
  if (BigInt(items.length) !== expected) invalid();
}
export function transferListResponse(value: unknown, parameters: Readonly<TransferListQuery>): TransferListDto {
  const result = record(value, ['page', 'pageSize', 'exactTotal', 'items']); const items = array(result.items, parameters.pageSize); page(result, parameters, items);
  const seen = new Set<string>();
  for (const value of items) {
    const row = record(value, [...baseFields, 'createdByAccountId', 'createdAt', ...referenceFields, 'updatedAt', 'totalQuantity']); header(row); references(row);
    id('account', row.createdByAccountId); stamp(row.createdAt); stamp(row.updatedAt); exact(row.totalQuantity);
    const f = parameters.filter;
    if ((f.startDate !== null && (row.businessDate as string) < f.startDate) || (f.endDate !== null && (row.businessDate as string) > f.endDate)
      || (f.number !== null && !(row.number as string).toLowerCase().includes(f.number.toLowerCase()))
      || (f.statuses.length > 0 && !f.statuses.includes(row.status as never))
      || (f.fromWarehouseIds.length > 0 && !f.fromWarehouseIds.includes(row.fromWarehouseId as never))
      || (f.toWarehouseIds.length > 0 && !f.toWarehouseIds.includes(row.toWarehouseId as never))) invalid();
    const key = row.id as string; if (seen.has(key)) invalid(); seen.add(key);
  }
  return value as TransferListDto;
}
export function transferDetailResponse(value: unknown, parameters: Readonly<TransferDetailQuery>): TransferDetailDto {
  const result = record(value, ['document', 'stockBasis', 'references', 'catalog']); choice(result.stockBasis, ['RUNTIME_LEDGER', 'CUTOFF_HISTORY']);
  const document = record(result.document, ['header', 'lines']);
  const h = record(document.header, [...baseFields, 'note', 'createdByAccountId', 'createdHallId', 'createdRole', 'createdAt', 'updatedAt', 'approvedByAccountId', 'approvedAt']); header(h);
  if (h.id !== parameters.transferId) invalid(); nullableText(h.note); id('account', h.createdByAccountId); nullableId('hall', h.createdHallId);
  choice(h.createdRole, ['ADMIN', 'WAREHOUSE', 'SALESPERSON']); stamp(h.createdAt); stamp(h.updatedAt); nullableId('account', h.approvedByAccountId); if (h.approvedAt !== null) stamp(h.approvedAt);
  const names = record(result.references, referenceFields); references(names);
  if ((h.approvedByAccountId === null) !== (names.approvedByName === null)) invalid();
  const lines = array(document.lines, 2000); const lineIds = new Set<string>(); const lineNos = new Set<number>(); const lineSkus = new Set<string>(); let previousLine = 0;
  for (const value of lines) {
    const row = record(value, ['id', 'transferId', 'lineNo', 'skuId', 'quantity', 'snapshot', 'isCurrent']);
    id('transferLine', row.id); id('transfer', row.transferId); id('sku', row.skuId); integer(row.lineNo); exact(row.quantity); quantity(row.quantity);
    if (row.transferId !== parameters.transferId || row.isCurrent !== true || row.quantity === '0' || lineIds.has(row.id) || lineNos.has(row.lineNo) || row.lineNo < previousLine) invalid();
    lineIds.add(row.id); lineNos.add(row.lineNo); lineSkus.add(row.skuId); previousLine = row.lineNo;
    const snapshot = record(row.snapshot, ['productCode', 'productName', 'colorName', 'fitName', 'sizeName', 'barcode']);
    [snapshot.productCode, snapshot.productName, snapshot.colorName, snapshot.fitName, snapshot.sizeName].forEach(text); nullableText(snapshot.barcode);
  }
  const catalog = record(result.catalog, ['skus', 'sizeGroups']); const groups = new Map<string, Set<string>>();
  let memberCount = 0; const sizeFacts = new Map<string, string>();
  for (const value of array(catalog.sizeGroups, 2000)) {
    const row = record(value, ['sizeGroupId', 'code', 'name', 'members']); id('sizeGroup', row.sizeGroupId); named(row.code); named(row.name);
    if (groups.has(row.sizeGroupId)) invalid(); const members = new Set<string>(); let previousOrder = -Infinity;
    for (const value of array(row.members, 20000)) {
      const member = record(value, ['sizeId', 'code', 'name', 'displayOrder']); id('size', member.sizeId); nullableText(member.code); named(member.name); integer(member.displayOrder, Number.MIN_SAFE_INTEGER);
      if (members.has(member.sizeId) || member.displayOrder < previousOrder || ++memberCount > 20000) invalid();
      consistent(sizeFacts, member.sizeId, [member.code, member.name]);
      members.add(member.sizeId); previousOrder = member.displayOrder;
    }
    groups.set(row.sizeGroupId, members);
  }
  const skus = new Map<string, Record<string, unknown>>(); const dimensions = new Set<string>(); const actualTuples = new Set<string>(); const groupIds = new Set<string>();
  const productFacts = new Map<string, string>(); const colorFacts = new Map<string, string>(); const fitFacts = new Map<string, string>();
  for (const value of array(catalog.skus, 20000)) {
    const row = record(value, ['skuId', 'productId', 'productCode', 'productName', 'colorId', 'colorName', 'fitId', 'fitName', 'sizeId', 'sizeGroupId']);
    for (const [field, kind] of [['skuId', 'sku'], ['productId', 'product'], ['colorId', 'color'], ['fitId', 'fit'], ['sizeId', 'size'], ['sizeGroupId', 'sizeGroup']] as const) id(kind, row[field]);
    [row.productCode, row.productName, row.colorName, row.fitName].forEach(named);
    consistent(productFacts, row.productId as string, [row.productCode, row.productName, row.sizeGroupId]);
    consistent(colorFacts, row.colorId as string, [row.colorName]); consistent(fitFacts, row.fitId as string, [row.fitName]);
    const tuple = JSON.stringify([row.productId, row.colorId, row.fitId]); const dimension = JSON.stringify([row.productId, row.colorId, row.fitId, row.sizeId]);
    if (skus.has(row.skuId as string) || dimensions.has(dimension) || !groups.get(row.sizeGroupId as string)?.has(row.sizeId as string)) invalid();
    skus.set(row.skuId as string, row); dimensions.add(dimension); groupIds.add(row.sizeGroupId as string); if (lineSkus.has(row.skuId as string)) actualTuples.add(tuple);
  }
  if ([...lineSkus].some(sku => !skus.has(sku)) || groups.size !== groupIds.size) invalid();
  for (const row of skus.values()) if (!actualTuples.has(JSON.stringify([row.productId, row.colorId, row.fitId]))) invalid();
  return value as TransferDetailDto;
}
export function transferWarehousesResponse(value: unknown, parameters: Readonly<TransferWarehouseParameters>): TransferWarehousePage {
  const result = record(value, ['page', 'pageSize', 'exactTotal', 'items']); const items = array(result.items, parameters.pageSize); page(result, parameters, items);
  const seen = new Set<string>(); const halls = new Map<string, string>();
  for (const value of items) {
    const row = record(value, ['id', 'name', 'hallId', 'hallName', 'enabled', 'hallEnabled']); id('warehouse', row.id); named(row.name); id('hall', row.hallId); named(row.hallName);
    choice(row.enabled, [true, false]); choice(row.hallEnabled, [true, false]);
    consistent(halls, row.hallId, [row.hallName, row.hallEnabled]);
    if (seen.has(row.id) || (parameters.selectedIds.length > 0 && !parameters.selectedIds.includes(row.id as never))
      || (parameters.search && !row.name.includes(parameters.search) && !row.hallName.includes(parameters.search))) invalid();
    seen.add(row.id);
  }
  return value as TransferWarehousePage;
}
