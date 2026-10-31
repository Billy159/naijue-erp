import { parseCurrentFormBarcodeQuery } from '../../../../packages/application/src/current-form-validation.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { DocumentScanOptions, DocumentScanSnapshot } from './document-scan-contracts.ts';

/** One explicit exact lookup at a time. No queue/retry, business write, cache or
 * product-search fallback. A changed draft target invalidates the pending read. */
export class DocumentScanController {
  readonly #options: DocumentScanOptions;
  readonly #listeners = new Set<() => void>();
  #request: AbortController | null = null;
  #state: DocumentScanSnapshot = Object.freeze({ phase: 'idle', barcode: '', message: '扫描条码，回车录入；成功后可继续扫描。' });
  constructor(options: DocumentScanOptions) {
    if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 120_000)) throw new TypeError('Invalid scan lookup timeout.');
    this.#options = options;
    options.scope.signal.addEventListener('abort', this.dispose, { once: true });
    if (!options.scope.active) this.dispose();
  }
  readonly getSnapshot = () => this.#state;
  readonly subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  #publish(phase: DocumentScanSnapshot['phase'], barcode: string, message: string) {
    this.#state = Object.freeze({ phase, barcode, message });
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Keep other invalidation listeners. */ } }
  }
  async scan(barcode: string): Promise<boolean> {
    if (!this.#options.scope.active || this.#state.phase === 'disposed' || this.#request) return false;
    const target = this.#options.target();
    if (!target) { this.#publish('blocked', barcode, '请先选择本单所需的营业厅和仓库。'); return false; }
    let query;
    try { query = parseCurrentFormBarcodeQuery({ context: target.context, barcode }); }
    catch { this.#publish('blocked', barcode, '请输入有效原条码；不支持控制字符或超过 512 个字符。'); return false; }
    const request = new AbortController(); this.#request = request;
    const signal = AbortSignal.any([request.signal, this.#options.scope.signal]);
    const deadline = this.#options.timeoutMs === undefined ? null : performance.now() + this.#options.timeoutMs;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let detachAbort = () => {};
    this.#publish('loading', barcode, '正在核对当前条码与实际规格…');
    try {
      // Settle cancellation even if a custom reader ignores its AbortSignal.
      const result = await new Promise<Awaited<ReturnType<DocumentScanOptions['resolve']>>>((resolve, reject) => {
        const interrupted = () => reject(new HttpQueryError(timedOut ? 'timeout' : 'aborted', timedOut ? 'SCAN_LOOKUP_TIMEOUT' : 'SCAN_LOOKUP_ABORTED'));
        signal.addEventListener('abort', interrupted, { once: true });
        detachAbort = () => signal.removeEventListener('abort', interrupted);
        if (signal.aborted) { interrupted(); return; }
        if (this.#options.timeoutMs !== undefined) timer = setTimeout(() => { timedOut = true; request.abort(); }, this.#options.timeoutMs);
        Promise.resolve().then(() => this.#options.resolve(query, signal)).then(resolve, reject);
      });
      if (deadline !== null && performance.now() >= deadline) { timedOut = true; request.abort(); throw new HttpQueryError('timeout', 'SCAN_LOOKUP_TIMEOUT'); }
      if (signal.aborted || this.#request !== request || !this.#options.scope.active) return false;
      if (this.#options.target()?.key !== target.key) { this.#publish('blocked', barcode, '当前单据输入或目标已改变，请重新扫描。'); return false; }
      if (result.barcode !== barcode) throw new TypeError('Wrong exact barcode result.');
      if (result.state === 'NOT_FOUND') { this.#publish('not-found', barcode, '未找到这个原条码，未录入任何明细。'); return false; }
      if (result.state === 'UNAVAILABLE') { this.#publish('unavailable', barcode, '这个条码或规格当前不可用，未录入明细。'); return false; }
      if (result.state !== 'FOUND') throw new TypeError('Unknown exact barcode state.');
      const applied = this.#options.apply(result);
      if (signal.aborted || this.getSnapshot().phase === 'disposed') return false;
      this.#publish(applied.ok ? 'accepted' : 'blocked', barcode, applied.message);
      return applied.ok;
    } catch (error) {
      if (timedOut && this.#request === request && this.#options.scope.active) {
        this.#publish('error', barcode, '条码核对超时，未录入明细。请检查连接后重新扫码。'); return false;
      }
      if (signal.aborted || this.#request !== request || !this.#options.scope.active) return false;
      if (error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) {
        this.#options.scope.dispose();
        try { this.#options.onAccessFailure?.(error); } catch { /* Identity is already invalidated. */ }
        return false;
      }
      this.#publish('error', barcode, '条码核对未完成，未录入明细。保留原码，可再次回车重试。'); return false;
    } finally { clearTimeout(timer); detachAbort(); if (this.#request === request) this.#request = null; }
  }
  readonly dispose = () => {
    if (this.#state.phase === 'disposed') return;
    this.#request?.abort(); this.#request = null;
    this.#options.scope.signal.removeEventListener('abort', this.dispose);
    this.#publish('disposed', '', '扫码已关闭。'); this.#listeners.clear();
  };
}
