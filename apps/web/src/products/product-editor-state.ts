import { parseProductMaintenanceCommand, parseProductMaintenanceCommandV2, parseProductMaintenanceMediaCommandV2 } from '../../../../packages/application/src/product-maintenance-validation.ts';
import { snapshotQueryParameters } from '../loading/query-parameters.ts';
import { ProductMaintenanceError, type ProductEditorDraft, type ProductEditorOptions, type ProductEditorWriteState, type ProductMaintenanceCommand, type ProductMaintenanceResult, type ProductWriteValues, type ProductSkuInput, type ProductBarcodeInput } from './product-editor-contracts.ts';

const initial = (): ProductEditorWriteState => Object.freeze({ phase: 'idle', command: null, result: null, receipt: null, recovery: 'unqueried', error: null });
/** One immutable request key/body while an outcome is uncertain. No automatic write retry. */
export class ProductEditorController {
  readonly #options: ProductEditorOptions;
  readonly #listeners = new Set<() => void>();
  #state = initial();
  #sequence = 0;
  #preparedKey:string|null=null;
  readonly #abort = () => this.dispose();
  constructor(options: ProductEditorOptions) {
    if (typeof options.newRequestKey !== 'function' || typeof options.onRecoveryRequired !== 'function' || typeof options.onAccessFailure !== 'function') throw new TypeError('Explicit product editor session owners are required.');
    if (options.originalCommand !== undefined) {
      const command = snapshotQueryParameters(options.originalCommand);
      const parse = options.client.contractVersion === 2 ? (Object.hasOwn(command,'imageChanges') ? parseProductMaintenanceMediaCommandV2 : parseProductMaintenanceCommandV2) : parseProductMaintenanceCommand;
      // Validate through the existing versioned contract, retaining the exact
      // original field/array order and payload rather than rebuilding a request.
      parse(command);
      if ((command.action === 'CREATE' ? null : command.id) !== options.scope.entityId) throw new TypeError('Original product command does not match this editor target.');
      this.#state = Object.freeze({ ...initial(), phase: 'uncertain', command });
    }
    this.#options = options; options.scope.signal.addEventListener('abort', this.#abort, { once: true });
    if (!options.scope.active) this.dispose();
  }
  getSnapshot = () => this.#state;
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  #publish(state: ProductEditorWriteState) {
    this.#state = Object.freeze(state);
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* A view notification cannot change a command outcome or prevent identity cleanup. */ } }
  }
  #active(sequence: number) { return this.#options.scope.active && this.#state.phase !== 'disposed' && sequence === this.#sequence; }
  /** Stage and the eventual media command share one unsubmitted draft key. */
  reserveRequestKey():string{
    if(!this.#options.scope.active||!['idle','rejected'].includes(this.#state.phase))throw new Error('当前商品操作尚未完成。');
    return this.#preparedKey??=this.#options.newRequestKey();
  }
  async submit(draft: ProductEditorDraft): Promise<void> {
    if (!this.#options.scope.active || !['idle', 'rejected'].includes(this.#state.phase)) throw new Error('当前商品操作尚未完成，请先查回原请求结果。');
    const parse = this.#options.client.contractVersion === 2 ? (Object.hasOwn(draft,'imageChanges')?parseProductMaintenanceMediaCommandV2:parseProductMaintenanceCommandV2) : parseProductMaintenanceCommand;
    const command = snapshotQueryParameters(parse({ ...draft, requestKey: Object.hasOwn(draft,'imageChanges')?(this.#preparedKey??this.#options.newRequestKey()):this.#options.newRequestKey() }));
    await this.#execute(command);
  }
  async retryOriginal(): Promise<void> {
    if (this.#state.phase !== 'uncertain' || !this.#state.command || !this.#options.scope.active) throw new Error('当前没有可按原请求恢复的商品操作。');
    await this.#execute(this.#state.command);
  }
  async #execute(command: ProductMaintenanceCommand): Promise<void> {
    const sequence = ++this.#sequence;
    this.#publish({ ...initial(), phase: 'submitting', command });
    try {
      const result = await this.#options.client.execute(command, this.#options.scope.signal);
      if (!this.#active(sequence)) return;
      this.#checkResult(result, command);
      this.#publish({ ...this.#state, phase: 'committed', result, error: null });
    } catch (error) { if (this.#active(sequence)) this.#fail(error, false); }
  }
  async recover(): Promise<void> {
    if (this.#state.phase !== 'uncertain' || !this.#state.command || !this.#options.scope.active) throw new Error('当前没有待查回的商品操作。');
    const command = this.#state.command, sequence = ++this.#sequence;
    this.#publish({ ...this.#state, phase: 'checking', error: null });
    try {
      const receipt = await this.#options.client.receipt(command, this.#options.scope.signal);
      if (!this.#active(sequence)) return;
      if (receipt.requestKey !== command.requestKey || receipt.action !== command.action || receipt.status !== 'COMMITTED') throw new ProductMaintenanceError('malformed-response', 'INVALID_PRODUCT_RECEIPT', 'read');
      this.#checkResult(receipt.result, command);
      this.#publish({ ...this.#state, phase: 'committed', result: receipt.result, receipt, recovery: 'found', error: null });
    } catch (error) { if (this.#active(sequence)) this.#fail(error, true); }
  }
  #checkResult(result: ProductMaintenanceResult, command: ProductMaintenanceCommand) {
    if (result.kind !== 'PRODUCT' || result.version !== (command.action === 'CREATE' ? 1 : command.expectedVersion + 1) || command.action !== 'CREATE' && result.targetId !== command.id) throw new ProductMaintenanceError('malformed-response', 'INVALID_PRODUCT_RESULT', 'uncertain');
  }
  #fail(raw: unknown, read: boolean) {
    const error = raw instanceof ProductMaintenanceError ? raw : new ProductMaintenanceError('network', 'PRODUCT_OUTCOME_UNKNOWN', read ? 'read' : 'uncertain');
    this.#publish({ ...this.#state, phase: read || error.outcome === 'uncertain' ? 'uncertain' : 'rejected', error,
      recovery: read ? error.kind === 'not-found' && error.code === 'RECEIPT_NOT_FOUND' ? 'absent' : 'failed' : this.#state.recovery });
    if (error.kind === 'unauthenticated' || error.kind === 'forbidden') {
      this.dispose(); this.#options.onAccessFailure(error);
    }
  }
  /** Caller must reload the authoritative aggregate before editing a committed version. */
  resetAfterReload(productId: string, version: number) {
    if (this.#state.phase !== 'committed' || !this.#state.result || productId !== this.#state.result.targetId || !Number.isSafeInteger(version) || version > 2147483647 || version < this.#state.result.version) throw new Error('请先读取已保存的商品版本。');
    this.#preparedKey=null;
    this.#publish(initial());
  }
  dispose() {
    if (this.#state.phase === 'disposed') return;
    const pending = ['submitting', 'checking', 'uncertain'].includes(this.#state.phase) ? this.#state.command : null;
    ++this.#sequence; this.#options.scope.signal.removeEventListener('abort', this.#abort);
    this.#publish({ ...initial(), phase: 'disposed' }); this.#listeners.clear();
    if (pending) this.#options.onRecoveryRequired(pending, this.#options.scope.identity);
  }
}

/** Equal season sets are the same draft, while UNKNOWN and explicit empty are distinct. */
export function productEditorDraftFingerprint(draft:{readonly values:ProductWriteValues;readonly skus:readonly ProductSkuInput[];readonly barcodes:readonly ProductBarcodeInput[]}):string {
 const values='seasonIds' in draft.values?{...draft.values,seasonIds:draft.values.seasonIds===null?null:[...draft.values.seasonIds].sort()}:draft.values;
 return JSON.stringify({values,skus:draft.skus,barcodes:draft.barcodes});
}

export interface ProductSpecSelection {readonly colors:readonly string[];readonly fits:readonly string[]}
export function actualSpecSelection(skus:readonly ProductSkuInput[]):ProductSpecSelection {const active=skus.filter(s=>s.enabled);return {colors:[...new Set(active.map(s=>s.colorId))],fits:[...new Set(active.map(s=>s.fitId))]};}
export function hasUnresolvedSpecSelection(selection:ProductSpecSelection,skus:readonly ProductSkuInput[]):boolean {const actual=actualSpecSelection(skus);return selection.colors.some(id=>!actual.colors.includes(id))||selection.fits.some(id=>!actual.fits.includes(id));}
