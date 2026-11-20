import { checkedProductManagementCandidates } from './query-controller.ts';
import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { ProductManagementCandidateKind, ProductManagementCandidatePage, ProductManagementCandidateQuery, ProductManagementReader } from './contracts.ts';

type Candidate = ProductManagementCandidatePage['items'][number];
export interface ProductCandidateSnapshot {
  readonly search: string; readonly phase: 'idle'|'loading'|'success'|'error'|'disposed'; readonly items: readonly Candidate[];
  readonly exactTotal: number|null; readonly page: number; readonly hasMore: boolean; readonly limitReached: boolean; readonly completeUniverse: boolean;
}
export const PRODUCT_CANDIDATE_WINDOW = 200;
/** A bounded popup window, not an eager dictionary cache. Cross-page completeness is not
 * claimed without a server revision; only one full unsearched page proves an ALL universe. */
export class ProductCandidateWindow {
  readonly #scope: ReadScope; readonly #query: LatestQuery<ProductManagementCandidateQuery, ProductManagementCandidatePage>;
  readonly #listeners = new Set<() => void>(); readonly #kind: ProductManagementCandidateKind;
  readonly #abort = () => this.dispose(); #generation = 0; #busy = false;
  #state: ProductCandidateSnapshot = Object.freeze({ search: '', phase: 'idle', items: [], exactTotal: null, page: 0, hasMore: false, limitReached: false, completeUniverse: false });
  constructor(scope: ReadScope, reader: ProductManagementReader, kind: ProductManagementCandidateKind) {
    this.#scope = scope; this.#kind = kind; this.#query = new LatestQuery({ scope, execute: async read => checkedProductManagementCandidates(await reader.readCandidates(read), read.parameters) });
    scope.signal.addEventListener('abort', this.#abort, { once: true }); if (!scope.active) this.dispose();
  }
  getSnapshot = () => this.#state;
  subscribe = (listener: () => void) => { if (this.#state.phase === 'disposed') return () => {}; this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  reset(search: string): void {
    if (!this.#scope.active) return; this.#generation++; this.#busy = false; this.#query.cancel();
    this.#publish({ search: search.trim(), phase: 'idle', items: [], exactTotal: null, page: 0, hasMore: false, limitReached: false, completeUniverse: false });
  }
  async loadNext(): Promise<void> {
    const before = this.#state;
    if (!this.#scope.active || this.#busy || before.limitReached || before.page > 0 && !before.hasMore) return;
    const generation = this.#generation; this.#busy = true; this.#publish({ ...before, phase: 'loading' });
    try {
      const result = await this.#query.run({ kind: this.#kind, search: before.search, page: before.page + 1, pageSize: 20, selectedIds: [] });
      if (generation !== this.#generation || !this.#scope.active || result.status === 'discarded') return;
      if (result.status === 'error') { this.#publish({ ...before, phase: 'error' }); return; }
      const data = result.data, ids = new Set(before.items.map(item => item.id));
      if (before.exactTotal !== null && before.exactTotal !== data.exactTotal || data.items.some(item => ids.has(item.id))) throw new TypeError('Candidate scope changed.');
      const items = Object.freeze([...before.items, ...data.items]);
      if (items.length > PRODUCT_CANDIDATE_WINDOW || items.length > data.exactTotal || !data.items.length && items.length < data.exactTotal) throw new TypeError('Invalid candidate window.');
      const hasMore = items.length < data.exactTotal;
      this.#publish({ search: before.search, phase: 'success', items, exactTotal: data.exactTotal, page: data.page, hasMore,
        limitReached: hasMore && items.length >= PRODUCT_CANDIDATE_WINDOW, completeUniverse: !before.search && data.page === 1 && !hasMore });
    } catch { if (generation === this.#generation && this.#scope.active) this.#publish({ ...before, phase: 'error' }); }
    finally { if (generation === this.#generation) this.#busy = false; }
  }
  dispose(): void {
    if (this.#state.phase === 'disposed') return; this.#generation++; this.#busy = false; this.#query.dispose(); this.#scope.signal.removeEventListener('abort', this.#abort);
    this.#publish({ search: '', phase: 'disposed', items: [], exactTotal: null, page: 0, hasMore: false, limitReached: false, completeUniverse: false }); this.#listeners.clear();
  }
  #publish(state: ProductCandidateSnapshot) { this.#state = Object.freeze(state); for (const listener of [...this.#listeners]) { try { listener(); } catch { /* View failure cannot retain old identity facts. */ } } }
}
