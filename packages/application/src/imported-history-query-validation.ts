import { DomainError } from '../../domain/src/errors.ts';
import { entityId } from '../../domain/src/values.ts';
import { isExactHistoryMoney, isHistoryQuantity } from './history-storage-contract.ts';
import type { ActorContext } from './ports.ts';
import { importedHistoryPageSizes } from './imported-history-query-ports.ts';
import type { ImportedHistoryDetail, ImportedHistoryDetailQuery, ImportedHistoryHeader, ImportedHistoryKind, ImportedHistoryLine, ImportedHistoryList, ImportedHistoryListQuery, ImportedHistoryPage, ImportedHistoryPageSize, ImportedHistoryPerson, ImportedHistoryReadGrant, ImportedHistoryReadIntent, ImportedHistorySalesLine, ImportedHistoryScope, ImportedHistorySettlement } from './imported-history-query-ports.ts';

type Reject = () => never;
export function invalidImportedHistoryQuery(): never { throw new DomainError('IMPORTED_HISTORY_INVALID_QUERY', 'Invalid historical query'); }
function forbidden(): never { throw new DomainError('IMPORTED_HISTORY_FORBIDDEN', 'Explicit historical grant required'); }
function invalidResponse(): never { throw new DomainError('IMPORTED_HISTORY_INVALID_RESPONSE', 'Invalid historical response'); }
/** Reject accessors/symbols/non-enumerable keys BEFORE reading any value. */
function bag(value: unknown, keys: readonly string[], reject: Reject): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== keys.length) reject();
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) reject();
    result[key] = d.value;
  }
  return result;
}
function dense(value: unknown, max: number, reject: Reject): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max
    || Reflect.ownKeys(value).length !== value.length + 1) reject();
  return Array.from({ length: value.length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) reject(); return d.value;
  });
}
function id(value: unknown, reject: Reject): string {
  if (typeof value !== 'string') reject();
  try { return entityId('operation', value as string); } catch { return reject(); }
}
function nullableId(value: unknown, reject: Reject): string | null { return value === null ? null : id(value, reject); }
function text(value: unknown, reject: Reject): string {
  if (typeof value !== 'string' || value.includes('\0') || value.length > 65536) reject(); return value as string;
}
function nullableText(value: unknown, reject: Reject): string | null { return value === null ? null : text(value, reject); }
function positive(value: unknown, reject: Reject): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 2147483645) reject(); return value as number;
}
function enumValue<T extends string>(value: unknown, values: readonly T[], reject: Reject): T {
  if (!values.includes(value as T)) reject(); return value as T;
}
function date(value: unknown, reject: Reject): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d\d-\d\d$/.test(value)
    || !Number.isFinite(Date.parse(value + 'T00:00:00.000Z')) || new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) !== value) reject();
  return value as string;
}
function stamp(value: unknown, instant: boolean): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !(instant ? /^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/ : /^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}$/).test(value)) invalidResponse();
  const local = (value as string).slice(0, 26), ms = local.slice(0, 23) + 'Z';
  if (!Number.isFinite(Date.parse(ms)) || new Date(ms).toISOString() !== ms) invalidResponse();
  return value as string;
}
function paging(page: unknown, size: unknown, reject: Reject): { page: number; pageSize: ImportedHistoryPageSize } {
  const n = positive(page, reject);
  if (!importedHistoryPageSizes.includes(size as ImportedHistoryPageSize) || !Number.isSafeInteger((n - 1) * (size as number))) reject();
  return { page: n, pageSize: size as ImportedHistoryPageSize };
}
export function checkedImportedHistoryKind(value: unknown): ImportedHistoryKind { return enumValue(value, ['sales', 'transfers'], invalidImportedHistoryQuery); }
export function parseImportedHistoryListQuery(value: unknown, kind: ImportedHistoryKind): ImportedHistoryListQuery {
  checkedImportedHistoryKind(kind);
  const r = bag(value, ['batchId', 'number', 'businessDateFrom', 'businessDateTo', 'sourceStatus', 'hallId', 'warehouseId', 'customerId', 'salespersonId', 'fromWarehouseId', 'toWarehouseId', 'page', 'pageSize'], invalidImportedHistoryQuery);
  const number = text(r.number, invalidImportedHistoryQuery);
  if (number.length > 200 || /[\u0000-\u001f\u007f]/u.test(number)) invalidImportedHistoryQuery();
  const from = date(r.businessDateFrom, invalidImportedHistoryQuery), to = date(r.businessDateTo, invalidImportedHistoryQuery);
  if (from !== null && to !== null && from > to) invalidImportedHistoryQuery();
  if ((kind === 'sales' ? [r.fromWarehouseId, r.toWarehouseId] : [r.hallId, r.warehouseId, r.customerId, r.salespersonId]).some(v => v !== null)) invalidImportedHistoryQuery();
  return Object.freeze({ batchId: nullableId(r.batchId, invalidImportedHistoryQuery), number,
    businessDateFrom: from, businessDateTo: to, sourceStatus: r.sourceStatus === null ? null : enumValue(r.sourceStatus, ['DRAFT', 'APPROVED', 'VOID'], invalidImportedHistoryQuery),
    ...Object.fromEntries(['hallId', 'warehouseId', 'customerId', 'salespersonId', 'fromWarehouseId', 'toWarehouseId'].map(k => [k, nullableId(r[k], invalidImportedHistoryQuery)])),
    ...paging(r.page, r.pageSize, invalidImportedHistoryQuery) }) as unknown as ImportedHistoryListQuery;
}
export function parseImportedHistoryDetailQuery(value: unknown, kind: ImportedHistoryKind): ImportedHistoryDetailQuery {
  checkedImportedHistoryKind(kind);
  const r = bag(value, ['documentId', 'linePage', 'linePageSize', 'settlementPage', 'settlementPageSize'], invalidImportedHistoryQuery);
  const lines = paging(r.linePage, r.linePageSize, invalidImportedHistoryQuery), settlements = paging(r.settlementPage, r.settlementPageSize, invalidImportedHistoryQuery);
  if (kind === 'transfers' && settlements.page !== 1) invalidImportedHistoryQuery();
  return Object.freeze({ documentId: id(r.documentId, invalidImportedHistoryQuery), linePage: lines.page, linePageSize: lines.pageSize, settlementPage: settlements.page, settlementPageSize: settlements.pageSize });
}
export function checkedImportedHistoryIntent(value: ImportedHistoryReadIntent): ImportedHistoryReadIntent {
  const r = bag(value, ['kind', 'operation', 'parameters'], invalidImportedHistoryQuery), kind = checkedImportedHistoryKind(r.kind);
  if (r.operation === 'list') return Object.freeze({ kind, operation: 'list', parameters: parseImportedHistoryListQuery(r.parameters, kind) });
  if (r.operation === 'detail') return Object.freeze({ kind, operation: 'detail', parameters: parseImportedHistoryDetailQuery(r.parameters, kind) });
  return invalidImportedHistoryQuery();
}
export function checkedImportedHistoryActor(value: ActorContext): ActorContext {
  const r = bag(value, ['accountId', 'hallId'], forbidden);
  return Object.freeze({ accountId: entityId('account', id(r.accountId, forbidden)), hallId: r.hallId === null ? null : entityId('hall', id(r.hallId, forbidden)) });
}
export function checkedImportedHistoryGrant(value: ImportedHistoryReadGrant, intent: ImportedHistoryReadIntent, actor: ActorContext): ImportedHistoryReadGrant {
  const r = bag(value, ['dataset', 'actorAccountId', 'kind', 'operation', 'targetId', 'scope'], forbidden);
  if (r.dataset !== 'HISTORY' || r.actorAccountId !== actor.accountId || r.kind !== intent.kind || r.operation !== intent.operation || r.targetId !== (intent.operation === 'detail' ? intent.parameters.documentId : null)) forbidden();
  let scope: ImportedHistoryScope;
  const scopeKind = Object.getOwnPropertyDescriptor(r.scope ?? {}, 'kind');
  if (scopeKind && Object.hasOwn(scopeKind, 'value') && scopeKind.value === 'ALL') { bag(r.scope, ['kind'], forbidden); scope = Object.freeze({ kind: 'ALL' }); }
  else {
    const s = bag(r.scope, ['kind', 'hallIds'], forbidden);
    if (s.kind !== 'HALL_IDS' || intent.kind !== 'sales') forbidden();
    const hallIds = dense(s.hallIds, 5000, forbidden).map(v => id(v, forbidden));
    if (new Set(hallIds).size !== hallIds.length) forbidden();
    scope = Object.freeze({ kind: 'HALL_IDS', hallIds: Object.freeze(hallIds) });
  }
  return Object.freeze({ dataset: 'HISTORY', actorAccountId: actor.accountId, kind: intent.kind, operation: intent.operation, targetId: r.targetId as string | null, scope });
}
export function activeImportedHistoryRead(signal: AbortSignal): void {
  if (!(signal instanceof AbortSignal)) throw new TypeError('Explicit historical AbortSignal required');
  if (signal.aborted) throw new DomainError('IMPORTED_HISTORY_READ_ABORTED', 'Historical read aborted');
}
function money(value: unknown): string { if (!isExactHistoryMoney(value)) invalidResponse(); return value as string; }
function nullableMoney(value: unknown): string | null { return value === null ? null : money(value); }
function nullableBoolean(value: unknown): boolean | null { if (value !== null && typeof value !== 'boolean') invalidResponse(); return value as boolean | null; }
function person(value: unknown): ImportedHistoryPerson {
  const r = bag(value, ['state', 'staffId'], invalidResponse), state = enumValue(r.state, ['UNKNOWN', 'UNRESOLVED', 'BOUND'], invalidResponse), staffId = nullableId(r.staffId, invalidResponse);
  if ((state === 'BOUND') !== (staffId !== null)) invalidResponse(); return Object.freeze({ state, staffId });
}
const headerKeys = ['dataset', 'kind', 'batchId', 'documentId', 'version', 'number', 'businessDate', 'sourceStatus', 'note', 'createdBy', 'approvedBy', 'responsibleStaffId', 'responsibleName', 'createdHallId', 'createdHallProvenance', 'createdLocalAt', 'updatedLocalAt', 'approvedLocalAt', 'createdInstant', 'updatedInstant', 'approvedInstant'];
export function validateImportedHistoryHeader(value: unknown, kind: ImportedHistoryKind, grant: ImportedHistoryReadGrant): ImportedHistoryHeader {
  const r = bag(value, [...headerKeys, ...(kind === 'sales' ? ['businessType', 'hallId', 'customerId', 'warehouseId', 'salespersonId', 'grossAmount', 'orderDiscount', 'netDue'] : ['fromWarehouseId', 'toWarehouseId'])], invalidResponse);
  if (r.dataset !== 'HISTORY' || r.kind !== kind) invalidResponse();
  const createdHallId = nullableId(r.createdHallId, invalidResponse), createdHallProvenance = enumValue(r.createdHallProvenance, ['ORIGINAL', 'MIGRATION_DERIVED', 'UNKNOWN'], invalidResponse);
  if ((createdHallProvenance === 'UNKNOWN') !== (createdHallId === null)) invalidResponse();
  const responsibleStaffId = nullableId(r.responsibleStaffId, invalidResponse), responsibleName = nullableText(r.responsibleName, invalidResponse);
  if (responsibleStaffId === null && responsibleName !== null) invalidResponse();
  const base = { dataset: 'HISTORY' as const, batchId: id(r.batchId, invalidResponse), documentId: id(r.documentId, invalidResponse), version: positive(r.version, invalidResponse), number: text(r.number, invalidResponse), businessDate: date(r.businessDate, invalidResponse), sourceStatus: enumValue(r.sourceStatus, ['DRAFT', 'APPROVED', 'VOID'], invalidResponse), note: nullableText(r.note, invalidResponse), createdBy: person(r.createdBy), approvedBy: person(r.approvedBy), createdHallId, createdHallProvenance, createdLocalAt: stamp(r.createdLocalAt, false), updatedLocalAt: stamp(r.updatedLocalAt, false), approvedLocalAt: stamp(r.approvedLocalAt, false), createdInstant: stamp(r.createdInstant, true), updatedInstant: stamp(r.updatedInstant, true), approvedInstant: stamp(r.approvedInstant, true) };
  const responsible = { responsibleStaffId, responsibleName };
  if (grant.targetId !== null && base.documentId !== grant.targetId) invalidResponse();
  if (kind === 'sales') {
    const hallId = id(r.hallId, invalidResponse);
    if (grant.scope.kind === 'HALL_IDS' && !grant.scope.hallIds.includes(hallId)) invalidResponse();
    return Object.freeze({ ...base, ...responsible, kind, hallId, businessType: enumValue(r.businessType, ['SALE', 'RETURN', 'EXCHANGE'], invalidResponse), customerId: id(r.customerId, invalidResponse), warehouseId: id(r.warehouseId, invalidResponse), salespersonId: nullableId(r.salespersonId, invalidResponse), grossAmount: money(r.grossAmount), orderDiscount: money(r.orderDiscount), netDue: money(r.netDue) });
  }
  const fromWarehouseId = id(r.fromWarehouseId, invalidResponse), toWarehouseId = id(r.toWarehouseId, invalidResponse);
  if (fromWarehouseId === toWarehouseId || grant.scope.kind !== 'ALL') invalidResponse();
  return Object.freeze({ ...base, ...responsible, kind, fromWarehouseId, toWarehouseId });
}
export function validateImportedHistoryLine(value: unknown, kind: ImportedHistoryKind): ImportedHistoryLine | ImportedHistorySalesLine {
  const r = bag(value, ['id', 'lineNo', 'skuId', 'quantity', 'productCodeSnapshot', 'productNameSnapshot', 'colorNameSnapshot', 'fitNameSnapshot', 'sizeNameSnapshot', 'barcodeSnapshot', ...(kind === 'sales' ? ['referencePrice', 'dealPrice', 'lineAmount', 'allocatedDiscount', 'isGift', 'pricingMethodSource', 'discountTenths', 'ordinaryZeroConfirmed'] : [])], invalidResponse);
  if (!isHistoryQuantity(r.quantity)) invalidResponse();
  const base: ImportedHistoryLine = Object.freeze({ id: id(r.id, invalidResponse), lineNo: positive(r.lineNo, invalidResponse), skuId: id(r.skuId, invalidResponse), quantity: r.quantity as string,
    productCodeSnapshot: nullableText(r.productCodeSnapshot, invalidResponse), productNameSnapshot: nullableText(r.productNameSnapshot, invalidResponse), colorNameSnapshot: nullableText(r.colorNameSnapshot, invalidResponse), fitNameSnapshot: nullableText(r.fitNameSnapshot, invalidResponse), sizeNameSnapshot: nullableText(r.sizeNameSnapshot, invalidResponse), barcodeSnapshot: nullableText(r.barcodeSnapshot, invalidResponse) });
  if (kind === 'transfers') return base;
  if (r.discountTenths !== null && (!Number.isInteger(r.discountTenths) || (r.discountTenths as number) < 0 || (r.discountTenths as number) > 100)) invalidResponse();
  return Object.freeze({ ...base, referencePrice: nullableMoney(r.referencePrice), dealPrice: money(r.dealPrice), lineAmount: money(r.lineAmount), allocatedDiscount: nullableMoney(r.allocatedDiscount), isGift: nullableBoolean(r.isGift), pricingMethodSource: nullableText(r.pricingMethodSource, invalidResponse), discountTenths: r.discountTenths as number | null, ordinaryZeroConfirmed: nullableBoolean(r.ordinaryZeroConfirmed) });
}
export function validateImportedHistorySettlement(value: unknown): ImportedHistorySettlement {
  const r = bag(value, ['id', 'lineNo', 'paymentAccountId', 'direction', 'amount', 'accountNameSnapshot', 'methodNameSnapshot', 'paymentMethodIdSnapshot'], invalidResponse), amount = money(r.amount);
  if (amount.startsWith('-')) invalidResponse();
  return Object.freeze({ id: id(r.id, invalidResponse), lineNo: positive(r.lineNo, invalidResponse), paymentAccountId: id(r.paymentAccountId, invalidResponse), direction: enumValue(r.direction, ['RECEIVE', 'REFUND'], invalidResponse), amount, accountNameSnapshot: nullableText(r.accountNameSnapshot, invalidResponse), methodNameSnapshot: nullableText(r.methodNameSnapshot, invalidResponse), paymentMethodIdSnapshot: nullableId(r.paymentMethodIdSnapshot, invalidResponse) });
}
function page<T>(value: unknown, n: number, size: ImportedHistoryPageSize, item: (v: unknown) => T, identity: (v: T) => string): ImportedHistoryPage<T> {
  const r = bag(value, ['page', 'pageSize', 'total', 'items'], invalidResponse);
  if (r.page !== n || r.pageSize !== size || typeof r.total !== 'string' || !/^(0|[1-9]\d{0,127})$/.test(r.total)) invalidResponse();
  const values = dense(r.items, size, invalidResponse).map(item), remaining = BigInt(r.total as string) - BigInt(n - 1) * BigInt(size);
  if (values.length !== Number(remaining < 0n ? 0n : remaining > BigInt(size) ? BigInt(size) : remaining) || new Set(values.map(identity)).size !== values.length) invalidResponse();
  return Object.freeze({ page: n, pageSize: size, total: r.total as string, items: Object.freeze(values) });
}
export function validateImportedHistoryList(value: unknown, intent: Extract<ImportedHistoryReadIntent, { operation: 'list' }>, grant: ImportedHistoryReadGrant): ImportedHistoryList {
  const r = bag(value, ['dataset', 'kind', 'documents'], invalidResponse);
  if (r.dataset !== 'HISTORY' || r.kind !== intent.kind) invalidResponse();
  const q = intent.parameters, documents = page(r.documents, q.page, q.pageSize, v => validateImportedHistoryHeader(v, intent.kind, grant), v => v.documentId);
  for (const d of documents.items) {
    if (q.batchId !== null && q.batchId !== d.batchId || q.sourceStatus !== null && q.sourceStatus !== d.sourceStatus
      || q.businessDateFrom !== null && (d.businessDate === null || d.businessDate < q.businessDateFrom)
      || q.businessDateTo !== null && (d.businessDate === null || d.businessDate > q.businessDateTo) || !d.number.includes(q.number)) invalidResponse();
    if (d.kind === 'sales' && ['hallId', 'customerId', 'warehouseId', 'salespersonId'].some(k => q[k as keyof ImportedHistoryListQuery] !== null && q[k as keyof ImportedHistoryListQuery] !== d[k as keyof typeof d])) invalidResponse();
    if (d.kind === 'transfers' && (q.fromWarehouseId !== null && d.fromWarehouseId !== q.fromWarehouseId || q.toWarehouseId !== null && d.toWarehouseId !== q.toWarehouseId)) invalidResponse();
  }
  return Object.freeze({ dataset: 'HISTORY', kind: intent.kind, documents });
}
export function validateImportedHistoryDetail(value: unknown, intent: Extract<ImportedHistoryReadIntent, { operation: 'detail' }>, grant: ImportedHistoryReadGrant): ImportedHistoryDetail {
  const r = bag(value, ['dataset', 'kind', 'document', 'lines', 'settlements'], invalidResponse);
  if (r.dataset !== 'HISTORY' || r.kind !== intent.kind) invalidResponse();
  const q = intent.parameters, document = r.document === null ? null : validateImportedHistoryHeader(r.document, intent.kind, grant);
  if (document !== null && document.documentId !== q.documentId) invalidResponse();
  const lines = page(r.lines, q.linePage, q.linePageSize, v => validateImportedHistoryLine(v, intent.kind), v => v.id);
  const settlements = page(r.settlements, q.settlementPage, q.settlementPageSize, validateImportedHistorySettlement, v => v.id);
  for (const values of [lines.items, settlements.items]) for (let i = 1; i < values.length; i++) if (values[i - 1]!.lineNo >= values[i]!.lineNo) invalidResponse();
  if (document === null && (lines.total !== '0' || settlements.total !== '0') || intent.kind === 'transfers' && settlements.total !== '0') invalidResponse();
  return Object.freeze({ dataset: 'HISTORY', kind: intent.kind, document, lines, settlements });
}
