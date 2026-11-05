import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { SalesReference, SalesReferenceKind, SalesReferencePage, SalesReferenceParameters, SalesReferenceReader } from './contracts.ts';
import { salesReferencesResponse } from './response-validation.ts';

export const SALES_REFERENCE_CANDIDATE_PAGE_SIZE = 20;
export const SALES_REFERENCE_CANDIDATE_LIMIT = 200;

export interface SalesReferenceCandidateSnapshot {
  readonly search: string;
  readonly phase: 'idle' | 'loading' | 'success' | 'error' | 'disposed';
  readonly items: readonly SalesReference[];
  readonly exactTotal: string | null;
  readonly unfilteredTotal: string | null;
  readonly page: number;
  readonly hasMore: boolean;
  readonly limitReached: boolean;
  /** Only an unsearched, complete first response proves the entire set. The
   * reference API does not provide a consistent cross-page catalogue revision. */
  readonly completeUniverse: boolean;
  readonly error: unknown | null;
}

/** One popup activation, with no shared cache or background enumeration. Each
 * page requires an explicit caller action; search, close and identity changes
 * detach stale transports even when their reader ignores AbortSignal. */
export class SalesReferenceCandidates {
  readonly #scope: ReadScope;
  readonly #kind: SalesReferenceKind;
  readonly #query: LatestQuery<SalesReferenceParameters, SalesReferencePage>;
  readonly #listeners = new Set<() => void>();
  readonly #onAbort = () => this.dispose();
  #generation = 0;
  #busy = false;
  #snapshot: SalesReferenceCandidateSnapshot = Object.freeze({ search: '', phase: 'idle', items: Object.freeze([]),
    exactTotal: null, unfilteredTotal: null, page: 0, hasMore: false, limitReached: false, completeUniverse: false, error: null });

  constructor(scope: ReadScope, reader: SalesReferenceReader, kind: SalesReferenceKind) {
    this.#scope = scope;
    this.#kind = kind;
    this.#query = new LatestQuery({ scope, execute: async read => salesReferencesResponse(await reader.readReferences(read), read.parameters) });
    scope.signal.addEventListener('abort', this.#onAbort, { once: true });
    if (!scope.active) this.dispose();
  }

  getSnapshot = (): SalesReferenceCandidateSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => {
    if (this.#snapshot.phase === 'disposed') return () => {};
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  /** Editing/searching never fetches implicitly. Call loadNext for the first
   * page after reset, and again only for an explicit next-page request. */
  reset(search: string): void {
    if (!this.#scope.active || this.#snapshot.phase === 'disposed') return;
    ++this.#generation; this.#busy = false; this.#query.cancel();
    this.#publish({ search: search.trim(), phase: 'idle', items: Object.freeze([]), exactTotal: null,
      unfilteredTotal: this.#snapshot.unfilteredTotal, page: 0, hasMore: false, limitReached: false, completeUniverse: false, error: null });
  }

  async loadNext(): Promise<void> {
    const before = this.#snapshot;
    if (!this.#scope.active || before.phase === 'disposed' || this.#busy || before.limitReached || before.page > 0 && !before.hasMore) return;
    const generation = this.#generation;
    // Set before publishing, so repeated/reentrant scrolls cannot start reads.
    this.#busy = true;
    this.#publish({ ...before, phase: 'loading', error: null });
    try {
      if (generation !== this.#generation || !this.#scope.active) return;
      const outcome = await this.#query.run({ kind: this.#kind, search: before.search, page: before.page + 1, pageSize: SALES_REFERENCE_CANDIDATE_PAGE_SIZE });
      if (generation !== this.#generation || !this.#scope.active || outcome.status === 'discarded') return;
      if (outcome.status === 'error') { this.#publish({ ...before, phase: 'error', error: outcome.error }); return; }
      const data = outcome.data;
      const ids = new Set(before.items.map(item => item.id));
      if (before.exactTotal !== null && before.exactTotal !== data.exactTotal || data.items.some(item => ids.has(item.id))) {
        throw new TypeError('Sales reference candidates changed between pages.');
      }
      const items = Object.freeze([...before.items, ...data.items]);
      if (items.length > SALES_REFERENCE_CANDIDATE_LIMIT) throw new TypeError('Sales reference candidate display limit exceeded.');
      const hasMore = BigInt(items.length) < BigInt(data.exactTotal);
      this.#publish({ search: before.search, phase: 'success', items, exactTotal: data.exactTotal,
        unfilteredTotal: before.search === '' ? data.exactTotal : before.unfilteredTotal, page: data.page, hasMore,
        limitReached: hasMore && items.length >= SALES_REFERENCE_CANDIDATE_LIMIT,
        completeUniverse: before.search === '' && data.page === 1 && !hasMore, error: null });
    } catch (error: unknown) {
      if (generation === this.#generation && this.#scope.active) this.#publish({ ...before, phase: 'error', error });
    } finally { if (generation === this.#generation) this.#busy = false; }
  }

  dispose(): void {
    if (this.#snapshot.phase === 'disposed') return;
    ++this.#generation; this.#busy = false; this.#query.dispose();
    this.#scope.signal.removeEventListener('abort', this.#onAbort);
    this.#publish({ search: '', phase: 'disposed', items: Object.freeze([]), exactTotal: null, unfilteredTotal: null,
      page: 0, hasMore: false, limitReached: false, completeUniverse: false, error: null });
    this.#listeners.clear();
  }

  #publish(snapshot: SalesReferenceCandidateSnapshot): void {
    this.#snapshot = Object.freeze(snapshot);
    for (const listener of [...this.#listeners]) {
      try { listener(); } catch { /* A subscriber must not compromise read invalidation or cleanup. */ }
    }
  }
}
