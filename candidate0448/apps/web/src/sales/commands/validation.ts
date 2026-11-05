import { allocateSalesDiscount, discountUnitPrice } from '../../../../../packages/domain/src/sales-money.ts';
import { parseNativeSalesSaveProposal } from '../../../../../packages/application/src/native-sales-preparation.ts';
import { businessDate, minorAmount, quantity } from '../../../../../packages/domain/src/values.ts';
import type { SalesDetailDto } from '../contracts.ts';
import type { SalesCommandDto, SalesCommandReceiptDto, SalesCommandResultDto, SalesDraftDto } from './contracts.ts';

function invalid(): never { throw new TypeError('Invalid native sales command contract.'); }
export function frozenSnapshot<T>(value: T): T {
  const copy = structuredClone(value);
  function freeze(item: unknown): void { if (item && typeof item === 'object') { for (const child of Object.values(item)) freeze(child); Object.freeze(item); } }
  freeze(copy); return copy;
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) invalid(); return row;
}
export function validSalesId(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value); }
/** Native-key subset: dot-only path segments normalize outside the receipt route.
 * Refuse them before allocation/dispatch rather than generate an unrecoverable key. */
export function validRequestKey(value: unknown): value is string { return typeof value === 'string' && value !== '.' && value !== '..' && /^[A-Za-z0-9._:-]{1,200}$/.test(value); }
function version(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1; }
function text(value: unknown): asserts value is string { if (typeof value !== 'string') invalid(); }
function id(value: unknown): asserts value is string { if (!validSalesId(value)) invalid(); }
function exact(value: unknown, unsigned = false): asserts value is string {
  if (typeof value !== 'string' || value.length > 100 || !(unsigned ? /^(?:0|[1-9]\d*)$/ : /^(?:0|[1-9]\d*|-[1-9]\d*)$/).test(value)) invalid();
}
function positive(value: unknown): asserts value is number { if (!version(value)) invalid(); }
function array(value: unknown, maximum: number): readonly unknown[] { if (!Array.isArray(value) || value.length > maximum) invalid(); return value; }
function choice(value: unknown, choices: readonly unknown[]): void { if (!choices.includes(value)) invalid(); }

/** Existing native arithmetic only. Current product minimum/enabled/reference scope
 * remains trusted server policy; this is not a catalogue fact resolver. */
export interface SalesDraftValidationContext {
  readonly previous?: SalesDraftDto;
  /** Wire shape only: non-null CAS and the backend's locked prior-fact comparison
   * are required. This flag never grants permission or authorizes null changes. */
  readonly existingWire?: true;
  readonly requireCompletePricing?: true;
  /** Read-only verified original-history projection, never a SAVE field. */
  readonly historicalSaleOrigin?: SalesDetailDto['historicalSaleOrigin'];
}
const economicFields = ['id', 'salesId', 'lineNo', 'skuId', 'quantity', 'referencePrice', 'dealPrice', 'pricingRule', 'discountTenths', 'zeroConfirmed', 'lineAmount', 'allocatedDiscount', 'isGift', 'isCurrent'] as const;
const snapshotFields = ['productCode', 'productName', 'colorName', 'fitName', 'sizeName', 'barcode'] as const;
function sameEconomics(previous: SalesDraftDto, next: SalesDraftDto): boolean {
  return (['businessType', 'grossAmount', 'orderDiscount', 'netDue'] as const).every(key => previous.header[key] === next.header[key])
    && previous.lines.length === next.lines.length && next.lines.every((line, index) => {
      const old = previous.lines[index]; return old !== undefined && economicFields.every(key => old[key] === line[key]);
    });
}
export function validateSalesDraft(value: unknown, context: SalesDraftValidationContext = {}): SalesDraftDto {
  const copy: unknown = structuredClone(value);
  const root = object(copy, ['header', 'lines', 'settlements']);
  const h = object(root.header, ['id', 'number', 'businessType', 'businessDate', 'hallId', 'customerId', 'salespersonId', 'warehouseId', 'grossAmount', 'orderDiscount', 'netDue', 'note', ...(typeof root.header === 'object' && root.header !== null && Object.hasOwn(root.header, 'responsibleStaffId') ? ['responsibleStaffId'] : [])]);
  if (Object.hasOwn(h, 'responsibleStaffId') && h.responsibleStaffId !== null) id(h.responsibleStaffId);
  id(h.id); text(h.number); if (!h.number.length) invalid(); choice(h.businessType, ['SALE', 'RETURN', 'EXCHANGE']); text(h.businessDate); businessDate(h.businessDate);
  if (h.hallId !== null || !(context.existingWire || context.previous?.header.hallId === null)) id(h.hallId); id(h.customerId); if (h.salespersonId !== null) id(h.salespersonId); id(h.warehouseId);
  exact(h.grossAmount); exact(h.orderDiscount, true); exact(h.netDue); if (h.note !== null) text(h.note);
  const lines = array(root.lines, 2000); if (!lines.length) invalid();
  const signedSale = h.businessType === 'SALE' && lines.some(value => !!value && typeof value === 'object' && typeof (value as { quantity?: unknown }).quantity === 'string' && (value as { quantity: string }).quantity.startsWith('-'));
  const mixedSale = signedSale && lines.some(value => !!value && typeof value === 'object' && typeof (value as { quantity?: unknown }).quantity === 'string' && /^[1-9]\d{0,18}$/.test((value as { quantity: string }).quantity));
  if (signedSale && !context.existingWire && !context.previous && (!mixedSale || h.orderDiscount !== '0')) invalid();
  if (signedSale && context.previous && !context.previous.lines.some(line => line.quantity.startsWith('-')) && (!mixedSale || h.orderDiscount !== '0')) invalid();
  const lineIds = new Set<string>(); const gross: ReturnType<typeof minorAmount>[] = [];
  let previousLine = 0, unknownEconomics = false;
  for (const value of lines) {
    const row = object(value, ['id', 'salesId', 'lineNo', 'skuId', 'quantity', 'referencePrice', 'dealPrice', 'pricingRule', 'discountTenths', 'zeroConfirmed', 'lineAmount', 'allocatedDiscount', 'isGift', 'snapshot', 'isCurrent']);
    id(row.id); id(row.skuId); positive(row.lineNo); exact(row.quantity); const q = quantity(row.quantity);
    if (row.salesId !== h.id || row.isCurrent !== true || lineIds.has(row.id) || row.lineNo <= previousLine || q === 0n || h.businessType === 'SALE' && q < 0n && !signedSale) invalid();
    previousLine = row.lineNo; lineIds.add(row.id);
    if (row.referencePrice !== null) exact(row.referencePrice, true); exact(row.dealPrice, true); exact(row.lineAmount); if (row.allocatedDiscount !== null) exact(row.allocatedDiscount, true);
    choice(row.pricingRule, [null, 'UNIT_PRICE', 'DISCOUNT']); choice(row.zeroConfirmed, [null, true, false]); choice(row.isGift, [null, true, false]);
    const incomplete = row.pricingRule === null || row.zeroConfirmed === null || row.isGift === null || row.allocatedDiscount === null;
    unknownEconomics ||= incomplete;
    if (incomplete && (context.requireCompletePricing || !context.existingWire && !context.previous)) invalid();
    if (row.discountTenths !== null && (typeof row.discountTenths !== 'number' || !Number.isInteger(row.discountTenths) || row.discountTenths < 0 || row.discountTenths > 100)) invalid();
    if (!incomplete) {
      if (row.pricingRule === 'UNIT_PRICE') { if (row.discountTenths !== null) invalid(); }
      else {
        if (typeof row.discountTenths !== 'number' || !Number.isInteger(row.discountTenths) || row.discountTenths < 0 || row.discountTenths > 100) invalid();
        if (!row.isGift && (row.referencePrice === null || discountUnitPrice(minorAmount(row.referencePrice as string), row.discountTenths) !== BigInt(row.dealPrice))) invalid();
      }
      if (row.isGift ? row.dealPrice !== '0' : row.dealPrice === '0' && !row.zeroConfirmed) invalid();
      if (BigInt(row.lineAmount) !== q * BigInt(row.dealPrice)) invalid();
    }

    gross.push(minorAmount(row.lineAmount));
    const s = object(row.snapshot, ['productCode', 'productName', 'colorName', 'fitName', 'sizeName', 'barcode']);
    const old = context.previous?.lines.find(line => line.id === row.id && line.skuId === row.skuId);
    for (const key of snapshotFields) {
      if (s[key] !== null) text(s[key]);
      else if (key !== 'barcode' && !context.existingWire && (!old || old.snapshot[key] !== null)) invalid();
    }
    if (old && snapshotFields.some(key => old.snapshot[key] !== s[key])) invalid();
  }
  const discount = minorAmount(h.orderDiscount); const sum = gross.reduce((total, amount) => total + amount, 0n);
  if (h.businessType !== 'SALE' && discount !== 0n) invalid();
  const preservedOrigin = context.existingWire && context.historicalSaleOrigin?.kind === 'SIGNED_SALE';
  if (preservedOrigin && (h.businessType !== 'SALE' || context.historicalSaleOrigin!.originalOrderDiscount !== h.orderDiscount || BigInt(h.grossAmount as string) !== sum || BigInt(h.netDue as string) !== sum - discount)) invalid();
  const shares = unknownEconomics || preservedOrigin || signedSale && discount !== 0n ? null : h.businessType === 'SALE' && !signedSale ? allocateSalesDiscount(gross, discount) : lines.map(() => 0n);
  if (signedSale && (BigInt(h.grossAmount as string) !== sum || BigInt(h.netDue as string) !== sum - discount)) invalid();
  if (signedSale && context.previous?.lines.some(line => line.quantity.startsWith('-')) && h.orderDiscount !== context.previous.header.orderDiscount) invalid();
  if (shares !== null && (lines.some((line, index) => BigInt((line as Record<string, string>).allocatedDiscount!) !== shares[index]) || BigInt(h.grossAmount) !== sum || BigInt(h.netDue) !== sum - discount)) invalid();
  if (unknownEconomics && !context.existingWire) {
    if (!context.previous) invalid();
    for (const value of lines) {
      const row = value as SalesDraftDto['lines'][number];
      if (row.pricingRule !== null && row.zeroConfirmed !== null && row.isGift !== null && row.allocatedDiscount !== null) continue;
      const old = context.previous.lines.find(line => line.id === row.id);
      if (!old || economicFields.some(key => old[key] !== row[key])) invalid();
    }
    if (BigInt(h.grossAmount as string) !== sum || BigInt(h.netDue as string) !== sum - discount) invalid();
  }
  const settlementIds = new Set<string>(); const positions = new Set<number>();
  for (const value of array(root.settlements, context.previous || context.existingWire ? 2000 : 3)) {
    const row = object(value, ['id', 'salesId', 'lineNo', 'paymentAccountId', 'paymentMethodId', 'direction', 'amount']);
    id(row.id); id(row.paymentAccountId); if (row.paymentMethodId !== null) id(row.paymentMethodId); positive(row.lineNo); choice(row.direction, ['RECEIVE', 'REFUND']); exact(row.amount, true);
    if (row.paymentMethodId === null && (!context.existingWire && (!context.previous?.settlements.some(old =>
      (['id', 'salesId', 'lineNo', 'paymentAccountId', 'paymentMethodId', 'direction', 'amount'] as const).every(key => old[key] === row[key]))))) invalid();
    if (row.paymentMethodId === null && context.requireCompletePricing) invalid();
    if (row.salesId !== h.id || settlementIds.has(row.id) || positions.has(row.lineNo)) invalid(); settlementIds.add(row.id); positions.add(row.lineNo);
  }
  return frozenSnapshot(copy as SalesDraftDto);
}
export function validateSalesCommand(value: unknown): SalesCommandDto {
  const copy: unknown = structuredClone(value);
  const action = (copy as { action?: unknown } | null)?.action;
  choice(action, ['SAVE', 'APPROVE', 'UNAPPROVE', 'VOID']);
  const proposal = action === 'SAVE' && Object.hasOwn(copy as object, 'proposal');
  const row = object(copy, ['action', 'requestKey', 'expectedVersion', action === 'SAVE' ? proposal ? 'proposal' : 'draft' : 'salesId']);
  if (!validRequestKey(row.requestKey)) invalid();
  if (action === 'SAVE') {
    if (row.expectedVersion !== null && !version(row.expectedVersion)) invalid();
    if (proposal) {
      const parsed = parseNativeSalesSaveProposal(row.proposal);
      if ((parsed.salesId === null) !== (row.expectedVersion === null)) invalid();
      row.proposal = parsed;
    } else row.draft = validateSalesDraft(row.draft, row.expectedVersion === null ? {} : { existingWire: true });
  } else { if (!version(row.expectedVersion)) invalid(); id(row.salesId); }
  return frozenSnapshot(copy as SalesCommandDto);
}
export function validateSalesResult(value: unknown, command: SalesCommandDto): SalesCommandResultDto {
  const row = object(value, ['operationId', 'salesId', 'version', 'status', 'ledgerEntryIds']);
  id(row.operationId); id(row.salesId); positive(row.version);
  const salesId = command.action === 'SAVE' ? 'proposal' in command ? command.proposal.salesId : command.draft.header.id : command.salesId;
  const expected = command.expectedVersion === null ? 1 : command.expectedVersion + 1;
  if (!Number.isSafeInteger(expected) || salesId !== null && row.salesId !== salesId || row.version !== expected
    || row.status !== ({ SAVE: 'DRAFT', APPROVE: 'APPROVED', UNAPPROVE: 'DRAFT', VOID: 'VOID' } as const)[command.action]) invalid();
  const entries = array(row.ledgerEntryIds, 2000); entries.forEach(id);
  if (new Set(entries).size !== entries.length || (command.action === 'SAVE' || command.action === 'VOID' ? entries.length !== 0 : entries.length === 0)) invalid();
  return frozenSnapshot(value as SalesCommandResultDto);
}
export function validateSalesReceipt(value: unknown, command: SalesCommandDto): SalesCommandReceiptDto {
  const row = object(value, ['requestKey', 'action', 'status', 'completedAt', 'result']);
  if (row.requestKey !== command.requestKey || row.action !== command.action || row.status !== 'COMMITTED'
    || typeof row.completedAt !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(row.completedAt) || !Number.isFinite(Date.parse(row.completedAt))) invalid();
  const result = validateSalesResult(row.result, command);
  return frozenSnapshot({ requestKey: command.requestKey, action: command.action, status: 'COMMITTED', completedAt: row.completedAt, result });
}
export function draftFromSalesDetail(detail: SalesDetailDto, requireCompletePricing = false): SalesDraftDto {
  const h = detail.document.header;
  if (h.hallId === null && detail.stockBasis !== 'CUTOFF_HISTORY') invalid();
  if (detail.historicalSaleOrigin && (detail.stockBasis !== 'CUTOFF_HISTORY' || h.businessType !== 'SALE' || detail.historicalSaleOrigin.kind !== 'SIGNED_SALE' || detail.historicalSaleOrigin.originalOrderDiscount !== h.orderDiscount)) invalid();
  if (detail.stockBasis !== 'CUTOFF_HISTORY' && h.businessType === 'SALE' && detail.document.lines.some(line => line.quantity.startsWith('-')) && (!detail.document.lines.some(line => /^[1-9]\d{0,18}$/.test(line.quantity)) || h.orderDiscount !== '0')) invalid();
  return validateSalesDraft({ header: { id: h.id, number: h.number, businessType: h.businessType, businessDate: h.businessDate, hallId: h.hallId, customerId: h.customerId,
    salespersonId: h.salespersonId, warehouseId: h.warehouseId, grossAmount: h.grossAmount, orderDiscount: h.orderDiscount, netDue: h.netDue, note: h.note },
  lines: detail.document.lines, settlements: detail.document.settlements }, { existingWire: true, ...(detail.historicalSaleOrigin ? { historicalSaleOrigin: detail.historicalSaleOrigin } : {}), ...(requireCompletePricing ? { requireCompletePricing: true } : {}) });
}
export function settlementBalanced(draft: SalesDraftDto): boolean {
  return draft.settlements.reduce((sum, row) => sum + (row.direction === 'RECEIVE' ? BigInt(row.amount) : -BigInt(row.amount)), 0n) === BigInt(draft.header.netDue);
}
