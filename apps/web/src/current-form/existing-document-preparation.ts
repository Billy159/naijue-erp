import { SALES_PREPARE_MAX_REQUEST_BYTES, SALES_PREPARED_RESPONSE_MAX_BYTES, SALES_PREPARE_MAX_LINES, SALES_PREPARE_MAX_NOTE_LENGTH } from '../../../../packages/application/src/sales-payload-budget.ts';
import { TRANSFER_PREPARE_MAX_REQUEST_BYTES, TRANSFER_PREPARED_RESPONSE_MAX_BYTES, TRANSFER_PREPARE_MAX_LINES, TRANSFER_PREPARE_MAX_NOTE_LENGTH } from '../../../../packages/application/src/transfer-payload-budget.ts';
import type { NativeSalesExistingProposal } from '../../../../packages/application/src/native-sales-preparation.ts';
import type { NativeTransferExistingProposal } from '../../../../packages/application/src/native-transfer-preparation.ts';
import { businessDate, entityId, minorAmount, quantity } from '../../../../packages/domain/src/values.ts';
import { discountUnitPrice } from '../../../../packages/domain/src/sales-money.ts';
import { createHttpJsonQuery, type HttpQueryOptions } from '../transport/http-query.ts';
import type { SalesDraftDto } from '../sales/commands/contracts.ts';
import type { TransferDraftDto } from '../transfers/commands/contracts.ts';
import { frozenSnapshot, validateSalesDraft } from '../sales/commands/validation.ts';
import { validateTransferDraft } from '../transfers/commands/validation.ts';

// Pure bounded existing-document read boundary. Never imports a creator, editor,
// React/CSS, document allocator or command client. Factory construction is inert.
function moneyMinor(raw: string): string {
  if (typeof raw !== 'string' || raw.length > 102 || !/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) throw new TypeError('Invalid explicit yuan amount.');
  const [whole, fraction = ''] = raw.trim().split('.'); const value = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (value > 999999999999999999n) throw new TypeError('Amount exceeds native money boundary.'); return value.toString();
}
function keys(value: unknown, expected: readonly string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join() !== [...expected].sort().join()) throw new TypeError('Invalid native sales intent.');
}
export interface SalesExistingPreparation {
  prepareExisting(proposal: NativeSalesExistingProposal, signal: AbortSignal): Promise<{ readonly expectedVersion: number; readonly draft: SalesDraftDto }>;
}
function existingSalesMoney(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 19 || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) throw new TypeError('Invalid exact existing sales yuan text.');
  return moneyMinor(raw);
}
function checkedExistingSalesIntent(input: NativeSalesExistingProposal): NativeSalesExistingProposal {
  const value = structuredClone(input);
  keys(value, ['salesId', 'expectedVersion', 'businessType', 'businessDate', 'note', 'hallId', 'customerId', 'salespersonId', 'warehouseId', 'orderDiscount', 'lines', 'settlements']);
  entityId('sales', value.salesId);
  if (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 1 || value.expectedVersion > 2147483647 || !['SALE', 'RETURN', 'EXCHANGE'].includes(value.businessType)) throw new TypeError('Invalid existing sales target/version.');
  businessDate(value.businessDate); entityId('hall', value.hallId); entityId('customer', value.customerId); entityId('warehouse', value.warehouseId); if (value.salespersonId !== null) entityId('staff', value.salespersonId);
  if (value.note !== null && (typeof value.note !== 'string' || value.note.length > SALES_PREPARE_MAX_NOTE_LENGTH) || !Array.isArray(value.lines) || !value.lines.length || value.lines.length > SALES_PREPARE_MAX_LINES || !Array.isArray(value.settlements) || value.settlements.length > 3) throw new TypeError('Invalid bounded existing sales proposal.');
  const discount = existingSalesMoney(value.orderDiscount); if (value.businessType !== 'SALE' && discount !== '0') throw new TypeError('Non-sale discount must be zero.');
  const linePointers = new Set<string>(), settlementPointers = new Set<string>();
  for (const line of value.lines) {
    keys(line, ['existingLineId', 'skuId', 'quantity', 'dealPrice', 'pricingRule', 'discountTenths', 'isGift', 'zeroConfirmed']); entityId('sku', line.skuId);
    if (line.existingLineId !== null) { entityId('salesLine', line.existingLineId); if (linePointers.has(line.existingLineId)) throw new TypeError('Repeated existing sales pointer.'); linePointers.add(line.existingLineId); }
    if (typeof line.quantity !== 'string' || !(value.businessType === 'SALE' ? /^[1-9]\d{0,18}$/ : /^-?[1-9]\d{0,18}$/).test(line.quantity) || quantity(line.quantity) === 0n || typeof line.isGift !== 'boolean' || typeof line.zeroConfirmed !== 'boolean') throw new TypeError('Invalid existing sales quantity/intent.');
    if (line.pricingRule === 'UNIT_PRICE') { if (line.discountTenths !== null || line.dealPrice === null && !line.isGift) throw new TypeError('Ambiguous existing direct price.'); if (line.dealPrice !== null) existingSalesMoney(line.dealPrice); }
    else if (line.pricingRule !== 'DISCOUNT' || line.dealPrice !== null || !Number.isInteger(line.discountTenths) || line.discountTenths! < 0 || line.discountTenths! > 100) throw new TypeError('Ambiguous existing discount.');
  }
  for (const row of value.settlements) {
    keys(row, ['existingSettlementId', 'paymentAccountId', 'paymentMethodId', 'direction', 'amount']); entityId('paymentAccount', row.paymentAccountId); entityId('paymentMethod', row.paymentMethodId);
    if (row.existingSettlementId !== null) { entityId('settlement', row.existingSettlementId); if (settlementPointers.has(row.existingSettlementId)) throw new TypeError('Repeated settlement pointer.'); settlementPointers.add(row.existingSettlementId); }
    if (!['RECEIVE', 'REFUND'].includes(row.direction)) throw new TypeError('Explicit existing settlement direction required.'); existingSalesMoney(row.amount);
  }
  return frozenSnapshot(value);
}
export function checkedExistingSalesPreparation(value: unknown, intent: NativeSalesExistingProposal) {
  keys(value, ['expectedVersion', 'draft']); const response = value as { expectedVersion: number; draft: unknown };
  if (response.expectedVersion !== intent.expectedVersion) throw new TypeError('Existing sales preparation changed CAS.');
  const draft = validateSalesDraft(response.draft), h = draft.header;
  if (h.id !== intent.salesId || h.businessType !== intent.businessType || h.businessDate !== intent.businessDate || h.note !== intent.note || h.hallId !== intent.hallId || h.customerId !== intent.customerId || h.salespersonId !== intent.salespersonId || h.warehouseId !== intent.warehouseId || h.orderDiscount !== existingSalesMoney(intent.orderDiscount) || draft.lines.length !== intent.lines.length || draft.settlements.length !== intent.settlements.length) throw new TypeError('Existing sales preparation header mismatches explicit intent.');
  draft.lines.forEach((row, index) => {
    const original = intent.lines[index]!;
    const expectedPrice = original.isGift ? '0' : original.pricingRule === 'UNIT_PRICE' ? existingSalesMoney(original.dealPrice) : row.referencePrice === null ? null : discountUnitPrice(minorAmount(row.referencePrice), original.discountTenths!).toString();
    if (row.skuId !== original.skuId || row.quantity !== original.quantity || row.lineNo !== index + 1 || row.pricingRule !== original.pricingRule || row.discountTenths !== original.discountTenths || row.isGift !== original.isGift || row.zeroConfirmed !== original.zeroConfirmed || row.dealPrice !== expectedPrice
      || (original.existingLineId === null || row.id !== original.existingLineId) && (typeof row.snapshot.barcode !== 'string' || !row.snapshot.barcode.trim())) throw new TypeError('Existing sales prepared line mismatches intent.');
  });
  draft.settlements.forEach((row, index) => { const original = intent.settlements[index]!; if (row.lineNo !== index + 1 || row.paymentAccountId !== original.paymentAccountId || row.paymentMethodId !== original.paymentMethodId || row.direction !== original.direction || row.amount !== existingSalesMoney(original.amount)) throw new TypeError('Existing prepared settlement mismatches intent.'); });
  return Object.freeze({ expectedVersion: response.expectedVersion, draft });
}
/** Inert optional read provider. No CREATE proof, new document/number or SAVE key. */
export function createSalesExistingPreparationHttpClient(options: HttpQueryOptions): SalesExistingPreparation {
  const http = createHttpJsonQuery({ ...options, maxResponseBytes: Math.min(options.maxResponseBytes ?? SALES_PREPARED_RESPONSE_MAX_BYTES, SALES_PREPARED_RESPONSE_MAX_BYTES) }, SALES_PREPARE_MAX_REQUEST_BYTES);
  return Object.freeze({ prepareExisting(input: NativeSalesExistingProposal, signal: AbortSignal) { const intent = checkedExistingSalesIntent(input); return http.post('/sales/prepare-existing', intent, signal, value => checkedExistingSalesPreparation(value, intent)); } });
}
export interface TransferExistingPreparation {
  prepareExisting(proposal: NativeTransferExistingProposal, signal: AbortSignal): Promise<{ readonly expectedVersion: number; readonly draft: TransferDraftDto }>;
}
function existingTransferKeys(value: unknown, expected: readonly string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join() !== [...expected].sort().join()) throw new TypeError('Invalid existing transfer shape.');
}
function checkedExistingTransferIntent(input: NativeTransferExistingProposal): NativeTransferExistingProposal {
  const value = structuredClone(input); existingTransferKeys(value, ['transferId', 'expectedVersion', 'businessDate', 'note', 'fromWarehouseId', 'toWarehouseId', 'lines']);
  entityId('transfer', value.transferId); entityId('warehouse', value.fromWarehouseId); entityId('warehouse', value.toWarehouseId); businessDate(value.businessDate);
  if (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 1 || value.expectedVersion > 2147483647 || value.fromWarehouseId === value.toWarehouseId || value.note !== null && (typeof value.note !== 'string' || value.note.length > TRANSFER_PREPARE_MAX_NOTE_LENGTH) || !Array.isArray(value.lines) || !value.lines.length || value.lines.length > TRANSFER_PREPARE_MAX_LINES) throw new TypeError('Invalid existing transfer target/version/budget.');
  const pointers = new Set<string>();
  for (const line of value.lines) {
    existingTransferKeys(line, ['existingLineId', 'skuId', 'quantity']); entityId('sku', line.skuId);
    if (line.existingLineId !== null) { entityId('transferLine', line.existingLineId); if (pointers.has(line.existingLineId)) throw new TypeError('Repeated transfer pointer.'); pointers.add(line.existingLineId); }
    if (typeof line.quantity !== 'string' || !/^[1-9]\d{0,18}$/.test(line.quantity) || quantity(line.quantity) <= 0n) throw new TypeError('Positive exact transfer quantity required.');
  }
  return frozenSnapshot(value);
}
export function checkedExistingTransferPreparation(value: unknown, intent: NativeTransferExistingProposal) {
  existingTransferKeys(value, ['expectedVersion', 'draft']); const response = value as { expectedVersion: number; draft: unknown };
  if (response.expectedVersion !== intent.expectedVersion) throw new TypeError('Existing transfer preparation changed CAS.');
  const draft = validateTransferDraft(response.draft), h = draft.header;
  if (h.id !== intent.transferId || h.businessDate !== intent.businessDate || h.note !== intent.note || h.fromWarehouseId !== intent.fromWarehouseId || h.toWarehouseId !== intent.toWarehouseId || draft.lines.length !== intent.lines.length) throw new TypeError('Existing transfer prepared header mismatches intent.');
  draft.lines.forEach((row, index) => { const original = intent.lines[index]!; if (row.skuId !== original.skuId || row.quantity !== original.quantity || row.lineNo !== index + 1 || (original.existingLineId === null || row.id !== original.existingLineId) && (typeof row.snapshot.barcode !== 'string' || !row.snapshot.barcode.trim())) throw new TypeError('Existing transfer prepared line mismatches intent.'); });
  return Object.freeze({ expectedVersion: response.expectedVersion, draft });
}
/** Explicit optional read provider; original SAVE owns CAS/key/recovery separately. */
export function createTransferExistingPreparationHttpClient(options: HttpQueryOptions): TransferExistingPreparation {
  const http = createHttpJsonQuery({ ...options, maxResponseBytes: Math.min(options.maxResponseBytes ?? TRANSFER_PREPARED_RESPONSE_MAX_BYTES, TRANSFER_PREPARED_RESPONSE_MAX_BYTES) }, TRANSFER_PREPARE_MAX_REQUEST_BYTES);
  return Object.freeze({ prepareExisting(input: NativeTransferExistingProposal, signal: AbortSignal) { const intent = checkedExistingTransferIntent(input); return http.post('/transfers/prepare-existing', intent, signal, value => checkedExistingTransferPreparation(value, intent)); } });
}
