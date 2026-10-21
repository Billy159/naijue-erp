import { SALES_PREPARE_MAX_REQUEST_BYTES, SALES_PREPARED_RESPONSE_MAX_BYTES, SALES_PREPARE_MAX_LINES, SALES_PREPARE_MAX_NOTE_LENGTH } from '../../../../packages/application/src/sales-payload-budget.ts';
import type { NativeSalesCreateProposal } from '../../../../packages/application/src/native-sales-preparation.ts';
import { businessDate, entityId, minorAmount, quantity } from '../../../../packages/domain/src/values.ts';
import { discountUnitPrice } from '../../../../packages/domain/src/sales-money.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { createHttpJsonQuery, HttpQueryError, type HttpQueryOptions } from '../transport/http-query.ts';
import { SalesEditorSession } from '../sales/commands/editor-session.ts';
import type { SalesDraftDto } from '../sales/commands/contracts.ts';
import { validateSalesDraft, frozenSnapshot } from '../sales/commands/validation.ts';
import { salesInputMoney } from '../sales/commands/form-model.ts';
import { SalesProposalSession, type SalesProposal } from './sales-proposal.ts';
export interface SalesCreatePreparation { prepareCreate(proposal: NativeSalesCreateProposal, signal: AbortSignal): Promise<SalesDraftDto> }
function moneyMinor(raw: string): string {
  if (typeof raw !== 'string' || raw.length > 102 || !/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) throw new TypeError('Invalid explicit yuan amount.');
  const [whole, fraction = ''] = raw.trim().split('.'); const value = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (value > 999999999999999999n) throw new TypeError('Amount exceeds native money boundary.'); return value.toString();
}
const yuan = (raw: string) => salesInputMoney(moneyMinor(raw));
function tenths(raw: string): number {
  if (!/^\d{1,2}(?:\.\d)?$/.test(raw.trim())) throw new TypeError('Invalid explicit discount.');
  const [whole, fraction = '0'] = raw.trim().split('.'); const result = Number(whole) * 10 + Number(fraction);
  if (result > 100) throw new TypeError('Invalid explicit discount.'); return result;
}
export function salesPreparationIntent(proposal: SalesProposal): NativeSalesCreateProposal {
  if (!proposal.hall || !proposal.customer || !proposal.warehouse) throw new TypeError('Required current references missing.');
  return checkedIntent({ businessType: proposal.businessType, businessDate: proposal.businessDate, note: proposal.note === '' ? null : proposal.note,
    hallId: proposal.hall.id, customerId: proposal.customer.id, salespersonId: proposal.salesperson?.id ?? null, warehouseId: proposal.warehouse.id,
    orderDiscount: yuan(proposal.orderDiscount), lines: proposal.lines.map(row => ({ skuId: row.sku.id, quantity: row.quantity,
      dealPrice: row.pricingRule === 'DISCOUNT' ? null : row.isGift ? '0.00' : yuan(row.dealPrice), pricingRule: row.pricingRule,
      discountTenths: row.pricingRule === 'DISCOUNT' ? tenths(row.discount) : null, isGift: row.isGift, zeroConfirmed: row.zeroConfirmed })),
    settlements: proposal.settlements.map(row => ({ paymentAccountId: row.account.id, paymentMethodId: row.method.id, direction: row.direction, amount: yuan(row.amount) })) });
}
function keys(value: unknown, expected: readonly string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join() !== [...expected].sort().join()) throw new TypeError('Invalid native sales intent.');
}
function checkedIntent(input: NativeSalesCreateProposal): NativeSalesCreateProposal {
  const value = structuredClone(input);
  keys(value, ['businessType', 'businessDate', 'note', 'hallId', 'customerId', 'salespersonId', 'warehouseId', 'orderDiscount', 'lines', 'settlements']);
  if (!['SALE', 'RETURN', 'EXCHANGE'].includes(value.businessType) || value.note !== null && (typeof value.note !== 'string' || value.note.length > SALES_PREPARE_MAX_NOTE_LENGTH)) throw new TypeError('Invalid SALE intent.');
  businessDate(value.businessDate); entityId('hall', value.hallId); entityId('customer', value.customerId); entityId('warehouse', value.warehouseId); if (value.salespersonId !== null) entityId('staff', value.salespersonId);
  if (value.businessType !== 'SALE' && moneyMinor(value.orderDiscount) !== '0' || yuan(value.orderDiscount) !== value.orderDiscount || !Array.isArray(value.lines) || !value.lines.length || value.lines.length > SALES_PREPARE_MAX_LINES || !Array.isArray(value.settlements) || value.settlements.length > 3) throw new TypeError('Invalid bounded sales intent.');
  for (const row of value.lines) {
    keys(row, ['skuId', 'quantity', 'dealPrice', 'pricingRule', 'discountTenths', 'isGift', 'zeroConfirmed']); entityId('sku', row.skuId);
    if (!(value.businessType === 'SALE' ? /^[1-9]\d{0,18}$/ : /^-?[1-9]\d{0,18}$/).test(row.quantity) || quantity(row.quantity) === 0n || typeof row.isGift !== 'boolean' || typeof row.zeroConfirmed !== 'boolean') throw new TypeError('Invalid sales line.');
    if (row.pricingRule === 'UNIT_PRICE') { if (row.discountTenths !== null || row.dealPrice === null || yuan(row.dealPrice) !== row.dealPrice || row.isGift && row.dealPrice !== '0.00') throw new TypeError('Ambiguous direct price.'); }
    else if (row.pricingRule !== 'DISCOUNT' || row.dealPrice !== null || !Number.isInteger(row.discountTenths) || row.discountTenths! < 0 || row.discountTenths! > 100) throw new TypeError('Ambiguous discount intent.');
  }
  for (const row of value.settlements) {
    keys(row, ['paymentAccountId', 'paymentMethodId', 'direction', 'amount']); entityId('paymentAccount', row.paymentAccountId); entityId('paymentMethod', row.paymentMethodId);
    if (!['RECEIVE', 'REFUND'].includes(row.direction) || yuan(row.amount) !== row.amount) throw new TypeError('Invalid settlement intent.');
  }
  return frozenSnapshot(value);
}
function checkedPreparation(value: unknown, intent: NativeSalesCreateProposal): SalesDraftDto {
  const draft = validateSalesDraft(value), h = draft.header;
  if (h.businessType !== intent.businessType || h.businessDate !== intent.businessDate || h.note !== intent.note || h.hallId !== intent.hallId || h.customerId !== intent.customerId || h.salespersonId !== intent.salespersonId || h.warehouseId !== intent.warehouseId || h.orderDiscount !== moneyMinor(intent.orderDiscount)
    || draft.lines.length !== intent.lines.length || draft.settlements.length !== intent.settlements.length) throw new TypeError('Preparation header does not match intent.');
  draft.lines.forEach((row, index) => {
    const original = intent.lines[index]!;
    if (row.skuId !== original.skuId || row.quantity !== original.quantity || row.lineNo !== index + 1 || row.pricingRule !== original.pricingRule || row.discountTenths !== original.discountTenths || row.isGift !== original.isGift || row.zeroConfirmed !== original.zeroConfirmed
      || original.dealPrice !== null && row.dealPrice !== moneyMinor(original.dealPrice) || typeof row.snapshot.barcode !== 'string' || !row.snapshot.barcode.trim()) throw new TypeError('Preparation line does not match intent.');
  });
  draft.settlements.forEach((row, index) => { const original = intent.settlements[index]!; if (row.lineNo !== index + 1 || row.paymentAccountId !== original.paymentAccountId || row.paymentMethodId !== original.paymentMethodId || row.direction !== original.direction || row.amount !== moneyMinor(original.amount)) throw new TypeError('Preparation settlement does not match intent.'); });
  return draft;
}
/** Native preparation is read-only; SAVE retains the existing uncertain-write transport. */
export function createSalesPreparationHttpClient(options: HttpQueryOptions): SalesCreatePreparation {
  const http = createHttpJsonQuery({ ...options, maxResponseBytes: Math.min(options.maxResponseBytes ?? SALES_PREPARED_RESPONSE_MAX_BYTES, SALES_PREPARED_RESPONSE_MAX_BYTES) }, SALES_PREPARE_MAX_REQUEST_BYTES);
  return Object.freeze({ prepareCreate(input: NativeSalesCreateProposal, signal: AbortSignal) {
    const intent = checkedIntent(input); return http.post('/sales/prepare-create', intent, signal, value => checkedPreparation(value, intent));
  } });
}
export interface SalesCreateSnapshot { readonly preparing: boolean; readonly notice: string | null; readonly disposed: boolean; readonly nativeHandoff: boolean }
export class SalesNewDocumentSession {
  readonly proposal: SalesProposalSession; readonly editor: SalesEditorSession;
  readonly #scope: ReadScope; readonly #preparation: SalesCreatePreparation; readonly #onAccessFailure: ((error: HttpQueryError) => void) | undefined;
  readonly #listeners = new Set<() => void>(); #unsubscribe: () => void; #request: AbortController | null = null; #sequence = 0;
  #state: SalesCreateSnapshot = Object.freeze({ preparing: false, notice: null, disposed: false, nativeHandoff: false });
  constructor(options: { readonly scope: ReadScope; readonly proposal: SalesProposalSession; readonly editor: SalesEditorSession; readonly preparation: SalesCreatePreparation; readonly onAccessFailure?: (error: HttpQueryError) => void }) {
    if (!options.proposal.matchesIdentity(options.scope) || !options.editor.matchesIdentity(options.scope)) throw new TypeError('Sales preparation and commands must share identity.');
    this.proposal = options.proposal; this.editor = options.editor; this.#scope = options.scope; this.#preparation = options.preparation; this.#onAccessFailure = options.onAccessFailure;
    let previous = this.proposal.getSnapshot().draft;
    this.#unsubscribe = this.proposal.subscribe(() => { const state = this.proposal.getSnapshot(); if (state.disposed) this.dispose(); else if (state.draft !== previous) { previous = state.draft; this.cancelPreparation(); } });
    this.#scope.signal.addEventListener('abort', this.dispose, { once: true });
  }
  readonly getSnapshot = (): SalesCreateSnapshot => this.#state;
  readonly subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  #publish(patch: Partial<SalesCreateSnapshot>): void { this.#state = Object.freeze({ ...this.#state, ...patch }); for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Preserve invalidation. */ } } }
  cancelPreparation(): void { this.#sequence++; this.#request?.abort(); this.#request = null; if (!this.#state.disposed) this.#publish({ preparing: false, notice: null }); }
  async save(): Promise<boolean> {
    if (this.#state.disposed || this.#state.nativeHandoff || this.#state.preparing || !this.#scope.active || this.editor.getSnapshot().command.editor || !this.editor.canLeave()) return false;
    const proposal = this.proposal.validate(); if (!proposal) return false;
    let intent: NativeSalesCreateProposal;
    try { intent = salesPreparationIntent(proposal); } catch { this.#publish({ notice: '价格或收退输入不符合原生金额边界（最多3笔收退），未发送准备或保存请求。' }); return false; }
    const sequence = ++this.#sequence, request = new AbortController(); this.#request = request;
    this.#publish({ preparing: true, notice: '正在核实原生九价完整性凭据、最低价及新单资料；尚未发送保存命令。' });
    try {
      const prepared = await this.#preparation.prepareCreate(intent, AbortSignal.any([request.signal, this.#scope.signal]));
      if (request.signal.aborted || sequence !== this.#sequence || this.#state.disposed || !this.#scope.active || this.proposal.getSnapshot().draft !== proposal) return false;
      const draft = checkedPreparation(prepared, intent);
      // Never silently accept a changed discount basis/price after the user's Save click.
      proposal.lines.forEach((row, index) => { if (!row.isGift && row.pricingRule === 'DISCOUNT') {
        if (row.product.retailPrice === null || draft.lines[index]!.referencePrice !== moneyMinor(row.product.retailPrice)
          || draft.lines[index]!.dealPrice !== discountUnitPrice(minorAmount(moneyMinor(row.product.retailPrice)), tenths(row.discount)).toString()) throw new TypeError('Current reference price changed.');
      } });
      if (!this.editor.openPreparedCreate(draft)) { this.#publish({ notice: '已有未解决单据，未发送新的保存命令。' }); return false; }
      this.#publish({ preparing: false, notice: null, nativeHandoff: true }); return await this.editor.save();
    } catch (error) {
      if (request.signal.aborted || sequence !== this.#sequence || this.#state.disposed || !this.#scope.active) return false;
      if (error instanceof HttpQueryError && ['unauthenticated', 'forbidden'].includes(error.kind)) { this.#scope.dispose(); try { this.#onAccessFailure?.(error); } catch { /* Cleared first. */ } return false; }
      this.#publish({ notice: '原生新单准备失败或价格已变化，未发送保存命令。请核实九价完整性凭据、最低价、主条码与当前资料；输入仍保留。' }); return false;
    } finally { if (this.#request === request) { this.#request = null; if (!this.#state.disposed) this.#publish({ preparing: false }); } }
  }
  readonly dispose = (): void => { if (this.#state.disposed) return; this.cancelPreparation(); this.#unsubscribe(); this.#scope.signal.removeEventListener('abort', this.dispose); this.#publish({ disposed: true, preparing: false, notice: null }); this.#listeners.clear(); };
}
