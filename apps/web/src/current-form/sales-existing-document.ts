import type { NativeSalesExistingProposal } from '../../../../packages/application/src/native-sales-preparation.ts';
import type { CurrentFormProduct, CurrentSalesReferenceItem } from '../../../../packages/application/src/current-form-ports.ts';
import { entityId, minorAmount } from '../../../../packages/domain/src/values.ts';
import { discountUnitPrice } from '../../../../packages/domain/src/sales-money.ts';
import { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { createCurrentFormHttpReader } from './http-reader.ts';
import type { SalesDetailDto } from '../sales/contracts.ts';
import type { SalesEditorSession } from '../sales/commands/editor-session.ts';
import { salesInputMoney, type SalesFormInput } from '../sales/commands/form-model.ts';
import { frozenSnapshot } from '../sales/commands/validation.ts';
import { checkedExistingSalesPreparation, type SalesExistingPreparation } from './existing-document-preparation.ts';
import { SalesProposalSession, salesProposalMoney, type SalesProposal } from './sales-proposal.ts';

type Reader = ReturnType<typeof createCurrentFormHttpReader>;
class DisplayedPriceChanged extends Error {}
function yuanMinor(raw: string): string { const [whole, fraction = ''] = raw.trim().split('.'); return (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'))).toString(); }
export interface SalesExistingDocumentSnapshot { readonly phase: 'idle' | 'loading' | 'ready' | 'unavailable'; readonly proposal: SalesProposalSession | null; readonly preparing: boolean; readonly notice: string | null; readonly disposed: boolean }
/** One saved-document proposal under the original authenticated session. Original
 * row keys are retained pointers; local new-row keys never become native IDs. */
export class SalesExistingDocumentSession {
  readonly owner: SalesEditorSession; #original: SalesDetailDto | null;
  get original(): SalesDetailDto | null { return this.#original; }
  readonly #scope: ReadScope; readonly #reader: Reader; readonly #preparation: SalesExistingPreparation; #initialInput: SalesFormInput | null; #inputReference: SalesFormInput | null; readonly #initialDirty: boolean;
  readonly #listeners = new Set<() => void>(); #unsubscribe: (() => void) | null = null; #request: AbortController | null = null; #sequence = 0;
  #state: SalesExistingDocumentSnapshot = Object.freeze({ phase: 'idle', proposal: null, preparing: false, notice: null, disposed: false });
  constructor(options: { readonly owner: SalesEditorSession; readonly scope: ReadScope; readonly reader: Reader; readonly preparation: SalesExistingPreparation; readonly original: SalesDetailDto; readonly input: SalesFormInput; readonly dirty: boolean }) {
    this.owner = options.owner; this.#original = options.original; this.#reader = options.reader; this.#preparation = options.preparation; this.#initialInput = frozenSnapshot(options.input); this.#inputReference = options.input; this.#initialDirty = options.dirty;
    this.#scope = new ReadScope(options.scope.identity, `${options.scope.routeInstanceId}:existing-sales:${options.original.document.header.id}:${options.original.document.header.version}`, options.original.document.header.id, () => {});
    const abort = () => this.dispose(); options.scope.signal.addEventListener('abort', abort, { once: true });
    this.#scope.signal.addEventListener('abort', () => options.scope.signal.removeEventListener('abort', abort), { once: true });
    if (!options.scope.active) this.dispose();
  }
  readonly getSnapshot = (): SalesExistingDocumentSnapshot => this.#state;
  readonly subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  get hasDirtyDraft(): boolean { return !this.#state.disposed && this.owner.getSnapshot().command.write.phase !== 'committed' && !!this.#state.proposal && (this.#state.proposal.getSnapshot().dirty || !!this.#state.proposal.getSnapshot().lineEdit || Object.values(this.#state.proposal.getSnapshot().entries).flat().some(entry => !!entry.product || !!entry.query.trim())); }
  canLeave(): boolean { return this.owner.getSnapshot().command.write.phase === 'committed' || !this.#state.preparing && !this.hasDirtyDraft; }
  async initialize(): Promise<void> {
    if (this.#state.disposed || this.#state.phase !== 'idle') return;
    const input = this.#initialInput; if (!input || !this.#original) return; const document = this.#original.document;
    if (this.#original!.stockBasis !== 'RUNTIME_LEDGER' || document.header.status !== 'DRAFT' || document.lines.length > 200 || !input.lines.length || input.lines.length > 200 || input.settlements.length > 3) { this.#unavailable(); return; }
    const originals = new Map<string, SalesDetailDto['document']['lines'][number]>(document.lines.map(line => [line.id, line])), settlements = new Map<string, SalesDetailDto['document']['settlements'][number]>(document.settlements.map(row => [row.id, row]));
    if (new Set(input.lines.map(line => line.id)).size !== input.lines.length || input.lines.some(line => !originals.has(line.id)) || input.settlements.some(row => !settlements.has(row.id) || settlements.get(row.id)!.paymentMethodId === null)) { this.#unavailable(); return; }
    const request = new AbortController(), sequence = ++this.#sequence; this.#request = request; this.#publish({ phase: 'loading' });
    try {
      const ids = [...new Set(input.lines.map(line => originals.get(line.id)!.skuId))];
      const rows = await this.#reader.readSkuBatch({ context: { kind: 'SALES', hallId: document.header.hallId }, skuIds: ids }, AbortSignal.any([request.signal, this.#scope.signal]));
      if (!this.#current(sequence, request)) return;
      if (this.owner.getSnapshot().input !== this.#inputReference) { this.#unavailable(); return; }
      if (rows.length !== ids.length || rows.some((row, index) => row.id !== ids[index]) || new Set(rows.map(row => row.id)).size !== rows.length) throw new TypeError('Incomplete actual saved SKU relation.');
      const byId = new Map(rows.map(row => [row.id, row])), h = document.header, names = this.#original!.referenceNames;
      const products = new Map<string, CurrentFormProduct>();
      for (const sku of rows) {
        if (products.has(sku.productId)) continue;
        for (let page = 1; ; page++) {
          const found = await this.#reader.readProducts({ context: { kind: 'SALES', hallId: h.hallId }, search: sku.productCode, page, pageSize: 20 }, AbortSignal.any([request.signal, this.#scope.signal]));
          if (!this.#current(sequence, request)) return;
          const actual = found.items.find(product => product.id === sku.productId);
          if (actual) { products.set(actual.id, actual); break; }
          if (BigInt(page) * 20n >= found.exactTotal) break;
        }
      }
      if (this.owner.getSnapshot().input !== this.#inputReference) { this.#unavailable(); return; }

      const reference = (id: string, name: string | null, patch: Partial<CurrentSalesReferenceItem> = {}): CurrentSalesReferenceItem => ({ id, name: name ?? '未提供', code: null, hallId: null, hallName: null, paymentMethodId: null, paymentMethodName: null, ...patch });
      const draft: SalesProposal = { businessType: h.businessType, businessDate: input.businessDate, note: input.note, orderDiscount: input.orderDiscount,
        hall: reference(h.hallId, names.hallName, { hallId: h.hallId, hallName: names.hallName }), customer: reference(h.customerId, names.customerName), salesperson: h.salespersonId ? reference(h.salespersonId, names.salespersonName) : null, warehouse: reference(h.warehouseId, names.warehouseName),
        lines: input.lines.map(raw => {
          const original = originals.get(raw.id)!, sku = byId.get(original.skuId); if (!sku) throw new TypeError('Missing actual saved SKU.');
          const currentProduct = products.get(sku.productId);
          const product: CurrentFormProduct = { ...(currentProduct?.sizeGroupId ? { sizeGroupId: currentProduct.sizeGroupId } : {}), id: sku.productId, code: sku.productCode, name: sku.productName, retailPrice: original.referencePrice === null ? null : salesInputMoney(original.referencePrice), minimumPriceAvailability: 'UNAVAILABLE' };
          return { key: raw.id, sku, product, sourceSnapshot: original.snapshot, quantity: raw.quantity, dealPrice: raw.dealPrice, pricingRule: raw.pricingRule, discount: raw.discount, isGift: raw.isGift, zeroConfirmed: raw.zeroConfirmed };
        }),
        settlements: input.settlements.map(raw => { const original = settlements.get(raw.id)!, names = this.#original!.settlementNames.find(row => row.settlementId === original.id), methodId = entityId('paymentMethod', original.paymentMethodId!); return { key: raw.id, method: reference(methodId, names?.methodNameSnapshot ?? names?.currentMethodName ?? null), account: reference(original.paymentAccountId, names?.accountNameSnapshot ?? names?.currentAccountName ?? null, { paymentMethodId: methodId, paymentMethodName: names?.methodNameSnapshot ?? names?.currentMethodName ?? null }), direction: raw.direction, amount: raw.amount }; }) };
      const proposal = new SalesProposalSession(this.#scope, this.#reader, error => { if (error.kind === 'unauthenticated') this.owner.expireExistingIdentity(); });
      if (!proposal.initializeFromSaved(draft, this.#initialDirty)) throw new TypeError('Saved proposal initialization failed.');
      let previous = proposal.getSnapshot();
      this.#unsubscribe = proposal.subscribe(() => { const current = proposal.getSnapshot(); if (current.disposed) { this.dispose(); return; } if (current.draft !== previous.draft || current.entries !== previous.entries || current.lineEdit !== previous.lineEdit) { previous = current; this.cancelPreparation(); } else this.#publish({}); });
      this.#publish({ phase: 'ready', proposal, notice: null });
    } catch (error) {
      if (!this.#current(sequence, request)) return;
      if (error instanceof HttpQueryError && error.kind === 'unauthenticated') this.owner.expireExistingIdentity(); else this.#unavailable();
    } finally { if (this.#request === request) this.#request = null; }
  }
  cancelPreparation(): void { this.#sequence++; this.#request?.abort(); this.#request = null; if (!this.#state.disposed) this.#publish({ preparing: false, notice: null }); }
  async save(): Promise<boolean> {
    const proposal = this.#state.proposal;
    if (this.#state.disposed || this.#state.phase !== 'ready' || this.#state.preparing || !proposal || !this.owner.editable) return false;
    if (!this.hasDirtyDraft && !this.owner.commands.hasDirtyDraft) { this.#publish({ notice: '内容未改变，无需保存。' }); return false; }
    if (proposal.hasSpecificationInputs && this.#original) {
      const intent = proposal.saveProposal(this.#original.document.header.id, new Set(this.#original.document.lines.map(row => row.id as string)), new Set(this.#original.document.settlements.map(row => row.id as string))); if (!intent) return false;
      const captured = proposal.getSnapshot(), ownerInput = this.owner.getSnapshot().input, request = new AbortController(), sequence = ++this.#sequence; this.#request = request;
      this.#publish({ preparing: true, notice: null });
      try {
        return await this.owner.commands.submitProposal({ ...intent, note: captured.draft.note === (this.#original.document.header.note ?? '') ? this.#original.document.header.note : intent.note }, () => this.#current(sequence, request)
          && this.owner.getSnapshot().input === ownerInput && this.owner.getSnapshot().command.editor?.detail === this.#original && proposal.getSnapshot().draft === captured.draft
          && proposal.getSnapshot().entries === captured.entries && proposal.getSnapshot().lineEdit === captured.lineEdit);
      } finally { if (this.#request === request) { this.#request = null; if (!this.#state.disposed) this.#publish({ preparing: false }); } }
    }
    const value = proposal.validate(); if (!value) return false;
    let intent: NativeSalesExistingProposal;
    try {
      if (!value.hall || !value.customer || !value.warehouse) throw new TypeError('Missing actual saved references.');
      const toYuan = (raw: string) => { const text = raw.trim(); if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new TypeError('Invalid yuan input.'); const [whole, fraction = ''] = text.split('.'); const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0')); if (minor > 999999999999999999n) throw new TypeError('Yuan input exceeds native boundary.'); return salesInputMoney(minor.toString()); };
      const tenths = (raw: string) => { if (!/^\d{1,2}(?:\.\d)?$/.test(raw.trim())) throw new TypeError('Invalid explicit discount.'); const [whole, fraction = '0'] = raw.trim().split('.'); const result = Number(whole) * 10 + Number(fraction); if (result > 100) throw new TypeError('Invalid discount.'); return result; };
      const originalLines = new Set<string>(this.#original!.document.lines.map(line => line.id)), originalSettlements = new Set<string>(this.#original!.document.settlements.map(row => row.id));
      intent = frozenSnapshot({ ...(value.responsible ? { responsibleStaffId: value.responsible.id } : {}), salesId: this.#original!.document.header.id, expectedVersion: this.#original!.document.header.version,
        businessType: value.businessType, businessDate: value.businessDate, hallId: value.hall.id, customerId: value.customer.id, salespersonId: value.salesperson?.id ?? null, warehouseId: value.warehouse.id, orderDiscount: toYuan(value.orderDiscount),
        note: value.note === (this.#original!.document.header.note ?? '') ? this.#original!.document.header.note : value.note,
        lines: value.lines.map(line => { if (!line.sku) throw new TypeError('Local specifications must use SAVE proposal.'); return ({ existingLineId: originalLines.has(line.key) ? line.key : null, skuId: line.sku.id, quantity: line.quantity, dealPrice: line.pricingRule === 'DISCOUNT' ? null : line.isGift ? '0.00' : toYuan(line.dealPrice), pricingRule: line.pricingRule, discountTenths: line.pricingRule === 'DISCOUNT' ? tenths(line.discount) : null, isGift: line.isGift, zeroConfirmed: line.zeroConfirmed }); }),
        settlements: value.settlements.map(row => { if (!row.account || !row.method || row.account.paymentMethodId !== row.method.id) throw new TypeError('Incomplete actual settlement.'); return { existingSettlementId: originalSettlements.has(row.key) ? row.key : null, paymentAccountId: row.account.id, paymentMethodId: row.method.id, direction: row.direction, amount: toYuan(row.amount) }; }) });
    } catch { this.#publish({ notice: '请完成原单的实际规格、价格及收退款资料；输入已保留，未发送保存。' }); return false; }
    const request = new AbortController(), sequence = ++this.#sequence; this.#request = request; const captured = proposal.getSnapshot(), ownerInput = this.owner.getSnapshot().input;
    this.#publish({ preparing: true, notice: '正在核实旧单资料，尚未发送保存。' });
    const stillCurrent = () => this.#current(sequence, request) && proposal.getSnapshot().draft === captured.draft && proposal.getSnapshot().entries === captured.entries && proposal.getSnapshot().lineEdit === captured.lineEdit;
    try {
      const response = checkedExistingSalesPreparation(await this.#preparation.prepareExisting(intent, AbortSignal.any([request.signal, this.#scope.signal])), intent);
      if (!stillCurrent() || this.owner.getSnapshot().input !== ownerInput || !this.owner.editable) return false;
      this.#validateOriginalFacts(response.draft, intent);
      this.#validateDisplayedAmounts(response.draft, value);
      return await this.owner.applyExistingPrepared(this, response, ownerInput, stillCurrent);
    } catch (error) {
      if (!stillCurrent()) return false;
      if (error instanceof HttpQueryError && error.kind === 'unauthenticated') this.owner.expireExistingIdentity();
      else this.#publish({ notice: error instanceof DisplayedPriceChanged ? '当前参考价或金额已变化，未发送保存。原输入已保留，请重新选择商品并核对价格、折扣和金额后再保存。' : error instanceof HttpQueryError && error.kind === 'forbidden' ? '本次提案无权准备，原输入已保留；未采用任何草稿，也未发送保存。' : '旧单资料准备未完成，输入已保留；请处理资料或版本问题后明确重试。' });
      return false;
    } finally { if (this.#request === request) { this.#request = null; if (!this.#state.disposed) this.#publish({ preparing: false }); } }
  }
  markUnchanged(): void { const proposal = this.#state.proposal; if (proposal) proposal.markUnchanged(proposal.getSnapshot().draft); this.#publish({ notice: '内容未改变，无需保存。' }); }
  #validateOriginalFacts(draft: import('../sales/commands/contracts.ts').SalesDraftDto, intent: NativeSalesExistingProposal): void {
    if (draft.header.number !== this.#original!.document.header.number) throw new TypeError('Existing sales number changed.');
    const lines = new Map<string, SalesDetailDto['document']['lines'][number]>(this.#original!.document.lines.map(line => [line.id, line])), settlements = new Map<string, SalesDetailDto['document']['settlements'][number]>(this.#original!.document.settlements.map(row => [row.id, row]));
    draft.lines.forEach((line, index) => { const selected = intent.lines[index]!, original = selected.existingLineId === null ? undefined : lines.get(selected.existingLineId); if (selected.existingLineId !== null && !original) throw new TypeError('Foreign original line pointer.'); if (original?.skuId === selected.skuId) { if (line.id !== original.id || line.referencePrice !== original.referencePrice || (['productCode', 'productName', 'colorName', 'fitName', 'sizeName', 'barcode'] as const).some(key => line.snapshot[key] !== original.snapshot[key])) throw new TypeError('Retained sales identity/snapshot/reference changed.'); } else if (lines.has(line.id)) throw new TypeError('New sales row reused old identity.'); });
    draft.settlements.forEach((row, index) => { const selected = intent.settlements[index]!, original = selected.existingSettlementId === null ? undefined : settlements.get(selected.existingSettlementId); if (selected.existingSettlementId !== null && !original) throw new TypeError('Foreign settlement pointer.'); if (original?.paymentAccountId === selected.paymentAccountId) { if (row.id !== original.id || row.paymentMethodId !== original.paymentMethodId) throw new TypeError('Retained settlement identity/method changed.'); } else if (settlements.has(row.id)) throw new TypeError('New settlement reused old identity.'); });
  }
  #validateDisplayedAmounts(draft: import('../sales/commands/contracts.ts').SalesDraftDto, proposal: SalesProposal): void {
    const totals = salesProposalMoney(proposal);
    if (!totals || draft.header.grossAmount !== totals.grossMinor || draft.header.orderDiscount !== totals.orderDiscountMinor || draft.header.netDue !== totals.netDueMinor) throw new DisplayedPriceChanged();
    const originals = new Map<string, SalesDetailDto['document']['lines'][number]>(this.#original!.document.lines.map(row => [row.id, row]));
    proposal.lines.forEach((row, index) => {
      const prepared = draft.lines[index]!, reference = row.product.retailPrice === null ? null : yuanMinor(row.product.retailPrice);
      const [whole, fraction = '0'] = row.discount.trim().split('.');
      const price = row.isGift ? '0' : row.pricingRule === 'UNIT_PRICE' ? yuanMinor(row.dealPrice) : reference === null ? null : discountUnitPrice(minorAmount(reference), Number(whole) * 10 + Number(fraction)).toString();
      if (!row.sku || price === null || prepared.dealPrice !== price || prepared.lineAmount !== (BigInt(row.quantity) * BigInt(price)).toString()
        || originals.get(row.key)?.skuId !== row.sku.id && reference !== null && prepared.referencePrice !== reference) throw new DisplayedPriceChanged();
    });
  }
  #unavailable(): void { this.#publish({ phase: 'unavailable', notice: '原单实际规格或保存资料未完整读到，保留原编辑页；新增和改选暂不可用。' }); }
  #current(sequence: number, request: AbortController): boolean { return !this.#state.disposed && this.#scope.active && sequence === this.#sequence && this.#request === request && !request.signal.aborted; }
  #publish(patch: Partial<SalesExistingDocumentSnapshot>): void { this.#state = Object.freeze({ ...this.#state, ...patch }); for (const listener of [...this.#listeners]) { try { listener(); } catch { /* owner cleanup still runs */ } } }
  dispose(): void { if (this.#state.disposed) return; this.#sequence++; this.#request?.abort(); this.#request = null; this.#unsubscribe?.(); this.#unsubscribe = null; this.#original = null; this.#initialInput = null; this.#inputReference = null; const proposal = this.#state.proposal; this.#publish({ disposed: true, preparing: false, proposal: null, notice: null }); proposal?.dispose(); this.#scope.dispose(); this.#listeners.clear(); }
}
