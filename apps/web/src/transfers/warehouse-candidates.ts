import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { TransferWarehouse, TransferWarehousePage, TransferWarehouseParameters, TransferWarehouseReader } from './contracts.ts';
import { guardedTransferRead } from './model.ts';
import { transferWarehousesResponse } from './response-validation.ts';

export const WAREHOUSE_CANDIDATE_PAGE_SIZE = 20;
export const WAREHOUSE_CANDIDATE_LIMIT = 200;
export interface WarehouseCandidateSnapshot {
  readonly search: string;
  readonly phase: 'idle' | 'loading' | 'success' | 'error' | 'disposed';
  readonly items: readonly TransferWarehouse[];
  readonly exactTotal: string | null;
  readonly unfilteredTotal: string | null;
  readonly page: number;
  readonly hasMore: boolean;
  readonly limitReached: boolean;
  /** Only a complete, unsearched single response proves the entire set. The
   * existing API does not supply a cross-page catalogue snapshot/revision. */
  readonly completeUniverse: boolean;
  readonly error: unknown | null;
}

/** One popup activation, no shared cache or background enumeration. Every next
 * page requires another explicit scroll. Search/close/identity abort and detach
 * stale transports, and a synchronous busy guard serializes repeated scrolls. */
export class WarehouseCandidates {
  readonly #scope: ReadScope;
  readonly #query: LatestQuery<TransferWarehouseParameters, TransferWarehousePage>;
  readonly #listeners = new Set<() => void>();
  readonly #onAbort = () => this.dispose();
  #generation = 0;
  #busy = false;
  #snapshot: WarehouseCandidateSnapshot = Object.freeze({ search: '', phase: 'idle', items: [], exactTotal: null, unfilteredTotal: null,
    page: 0, hasMore: false, limitReached: false, completeUniverse: false, error: null });

  constructor(scope: ReadScope, parent: ReadScope, reader: TransferWarehouseReader) {
    this.#scope = scope;
    this.#query = new LatestQuery({ scope, execute: read => guardedTransferRead(parent,
      async () => transferWarehousesResponse(await reader.readWarehouses(read), read.parameters)) });
    scope.signal.addEventListener('abort', this.#onAbort, { once: true });
    if (!scope.active) this.dispose();
  }
  getSnapshot = (): WarehouseCandidateSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };

  reset(search: string): void {
    if (!this.#scope.active || this.#snapshot.phase === 'disposed') return;
    ++this.#generation; this.#busy = false; this.#query.cancel();
    this.#publish({ search, phase: 'idle', items: [], exactTotal: null, unfilteredTotal: this.#snapshot.unfilteredTotal,
      page: 0, hasMore: false, limitReached: false, completeUniverse: false, error: null });
  }

  async loadNext(): Promise<void> {
    const before = this.#snapshot;
    if (!this.#scope.active || before.phase === 'disposed' || this.#busy || before.limitReached || before.page > 0 && !before.hasMore) return;
    const generation = this.#generation; this.#busy = true;
    this.#publish({ ...before, phase: 'loading', error: null });
    try {
      const outcome = await this.#query.run({ search: before.search, selectedIds: [], page: before.page + 1, pageSize: WAREHOUSE_CANDIDATE_PAGE_SIZE });
      if (generation !== this.#generation || !this.#scope.active || outcome.status === 'discarded') return;
      if (outcome.status === 'error') { this.#publish({ ...before, phase: 'error', error: outcome.error }); return; }
      const data = outcome.data;
      const ids = new Set(before.items.map(item => item.id));
      if (before.exactTotal !== null && before.exactTotal !== data.exactTotal || data.items.some(item => ids.has(item.id))) {
        throw new TypeError('Warehouse candidates changed between pages.');
      }
      const items = Object.freeze([...before.items, ...data.items]);
      if (items.length > WAREHOUSE_CANDIDATE_LIMIT) throw new TypeError('Warehouse candidate display limit exceeded.');
      const hasMore = BigInt(items.length) < BigInt(data.exactTotal);
      this.#publish({ search: before.search, phase: 'success', items, exactTotal: data.exactTotal,
        unfilteredTotal: before.search === '' ? data.exactTotal : before.unfilteredTotal, page: data.page, hasMore,
        limitReached: hasMore && items.length >= WAREHOUSE_CANDIDATE_LIMIT,
        completeUniverse: before.search === '' && data.page === 1 && !hasMore, error: null });
    } catch (error: unknown) {
      if (generation === this.#generation && this.#scope.active) this.#publish({ ...before, phase: 'error', error });
    } finally { if (generation === this.#generation) this.#busy = false; }
  }

  dispose(): void {
    if (this.#snapshot.phase === 'disposed') return;
    ++this.#generation; this.#busy = false; this.#query.dispose();
    this.#scope.signal.removeEventListener('abort', this.#onAbort);
    this.#publish({ search: '', phase: 'disposed', items: [], exactTotal: null, unfilteredTotal: null,
      page: 0, hasMore: false, limitReached: false, completeUniverse: false, error: null });
    this.#listeners.clear();
  }
  #publish(snapshot: WarehouseCandidateSnapshot): void {
    this.#snapshot = Object.freeze(snapshot);
    for (const listener of [...this.#listeners]) listener();
  }
}
