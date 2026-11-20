import type { DemoMultiOption } from '../demo-controls/multi-select-contract.ts';
import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { Candidate, CandidateKind, CandidatePage, CandidateParameters, InventoryReader } from '../inventory/contracts.ts';

const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
export const INVENTORY_CANDIDATE_LIMIT = 200;
export interface InventoryCandidateSnapshot {
  readonly search: string;
  readonly phase: 'idle' | 'loading' | 'success' | 'error' | 'disposed';
  readonly items: readonly Candidate[];
  readonly exactTotal: number | null;
  readonly unfilteredTotal: number | null;
  readonly page: number;
  readonly hasMore: boolean;
  readonly limitReached: boolean;
  /** No catalogue revision exists: only one complete, unsearched page proves all. */
  readonly completeUniverse: boolean;
}
/** One open control owns this bounded read window. Never enumerates a catalogue. */
export class InventoryCandidates {
  readonly #scope: ReadScope;
  readonly kind: CandidateKind;
  readonly categoryIds: readonly string[];
  readonly selectedIds: () => readonly string[];
  readonly #query: LatestQuery<CandidateParameters, CandidatePage>;
  readonly #listeners = new Set<() => void>();
  readonly #onAbort = () => this.dispose();
  #generation = 0;
  #busy = false;
  #snapshot: InventoryCandidateSnapshot = Object.freeze({ search: '', phase: 'idle', items: [], exactTotal: null,
    unfilteredTotal: null, page: 0, hasMore: false, limitReached: false, completeUniverse: false });
  constructor(scope: ReadScope, reader: InventoryReader, kind: CandidateKind,
    categoryIds: readonly string[], selectedIds: () => readonly string[]) {
    this.#scope = scope; this.kind = kind; this.categoryIds = Object.freeze([...categoryIds]); this.selectedIds = selectedIds;
    this.#query = new LatestQuery({ scope, execute: async read => {
      const result = await reader.readCandidates(read);
      if (!Number.isSafeInteger(result.exactTotal) || result.exactTotal < 0 || result.page !== read.parameters.page
        || result.items.length !== Math.min(20, Math.max(0, result.exactTotal - (read.parameters.page - 1) * 20)) || new Set(result.items.map(item => item.id)).size !== result.items.length
        || result.items.some(item => !text(item.id) || !text(item.label) || item.disabled !== undefined && typeof item.disabled !== 'boolean'
          || kind === 'product' && (!text(item.code) || !text(item.name)))) {
        throw new TypeError('候选响应无效，请重新读取。');
      }
      return result;
    } });
    scope.signal.addEventListener('abort', this.#onAbort, { once: true });
    if (!scope.active) this.dispose();
  }
  getSnapshot = (): InventoryCandidateSnapshot => this.#snapshot;
  subscribe = (listener: () => void) => { if (this.#snapshot.phase === 'disposed') return () => {}; this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  reset(search: string): void {
    if (!this.#scope.active || this.#snapshot.phase === 'disposed') return;
    this.#generation++; this.#busy = false; this.#query.cancel();
    this.#publish({ search: search.trim(), phase: 'idle', items: [], exactTotal: null, unfilteredTotal: this.#snapshot.unfilteredTotal,
      page: 0, hasMore: false, limitReached: false, completeUniverse: false });
  }
  async loadNext(): Promise<void> {
    const before = this.#snapshot;
    if (!this.#scope.active || before.phase === 'disposed' || this.#busy || before.limitReached || before.page > 0 && !before.hasMore) return;
    const generation = this.#generation; this.#busy = true; this.#publish({ ...before, phase: 'loading' });
    try {
      const outcome = await this.#query.run({ kind: this.kind, search: before.search, page: before.page + 1, pageSize: 20,
        selectedIds: this.selectedIds(), categoryIds: this.categoryIds });
      if (generation !== this.#generation || !this.#scope.active || outcome.status === 'discarded') return;
      if (outcome.status === 'error') { this.#publish({ ...before, phase: 'error' }); return; }
      const data = outcome.data; const ids = new Set(before.items.map(item => item.id));
      if (before.exactTotal !== null && before.exactTotal !== data.exactTotal || data.items.some(item => ids.has(item.id))
        || data.items.length === 0 && before.items.length < data.exactTotal) throw new TypeError('候选范围已变化。');
      const items = Object.freeze([...before.items, ...data.items]);
      if (items.length > INVENTORY_CANDIDATE_LIMIT || items.length > data.exactTotal) throw new TypeError('候选窗口超出读取边界。');
      if (this.kind === 'category') {
        const byId = new Map(items.map(item => [item.id, item]));
        for (const item of items) {
          if (item.parentId !== null && !text(item.parentId) || item.parentId === item.id || (item.parentId === null) !== (item.depth === 0)
            || item.parentId !== null && (item.depth !== 1 || !text(item.parentLabel))
            || item.parentId && byId.has(item.parentId) && byId.get(item.parentId)?.depth !== 0) throw new TypeError('分类层级响应无效。');
        }
      }
      const hasMore = items.length < data.exactTotal;
      this.#publish({ search: before.search, phase: 'success', items, exactTotal: data.exactTotal,
        unfilteredTotal: before.search ? before.unfilteredTotal : data.exactTotal, page: data.page, hasMore,
        limitReached: hasMore && items.length >= INVENTORY_CANDIDATE_LIMIT,
        completeUniverse: !before.search && data.page === 1 && !hasMore });
    } catch { if (generation === this.#generation && this.#scope.active) this.#publish({ ...before, phase: 'error' }); }
    finally { if (generation === this.#generation) this.#busy = false; }
  }
  dispose(): void {
    if (this.#snapshot.phase === 'disposed') return;
    this.#generation++; this.#busy = false; this.#query.dispose();
    this.#scope.signal.removeEventListener('abort', this.#onAbort);
    this.#publish({ search: '', phase: 'disposed', items: [], exactTotal: null, unfilteredTotal: null, page: 0,
      hasMore: false, limitReached: false, completeUniverse: false });
    this.#listeners.clear();
  }
  #publish(value: InventoryCandidateSnapshot) { this.#snapshot = Object.freeze(value); for (const listener of [...this.#listeners]) { try { listener(); } catch { /* A view cannot compromise cancellation or ownership. */ } } }
}

/** Display only: preserve native IDs/canonical labels and never synthesize a parent row. */
export function inventoryMultiOption(item: Candidate, currentIds?: ReadonlySet<string>): DemoMultiOption {
  const orphanPath = item.parentId && currentIds && !currentIds.has(item.parentId) && item.parentLabel;
  return { id: item.id, name: orphanPath ? `${item.parentLabel} / ${item.label}` : item.label,
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }), ...(item.parentId === undefined ? {} : { parentId: item.parentId }) };
}
