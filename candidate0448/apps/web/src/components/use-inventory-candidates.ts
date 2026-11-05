import { useEffect, useState, useSyncExternalStore } from 'react';
import type { CandidateKind, InventoryReader } from '../inventory/contracts.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { InventoryCandidates, type InventoryCandidateSnapshot } from './inventory-candidates.ts';
const idle: InventoryCandidateSnapshot = Object.freeze({ search: '', phase: 'idle', items: [], exactTotal: null, unfilteredTotal: null,
  page: 0, hasMore: false, limitReached: false, completeUniverse: false });
const empty = () => idle; const none = () => () => {};
/** Effect-owned model: replay never leaves a permanent render-time subscription. */
export function useInventoryCandidates(scope: ReadScope | null, reader: InventoryReader, kind: CandidateKind, categoryIds: readonly string[], selectedIds: () => readonly string[]) {
  const [owned, setOwned] = useState<{ scope: ReadScope; reader: InventoryReader; kind: CandidateKind; key: string; query: InventoryCandidates } | null>(null);
  const key = categoryIds.join('\0');
  useEffect(() => {
    if (!scope) return;
    const query = new InventoryCandidates(scope, reader, kind, categoryIds, selectedIds); setOwned({ scope, reader, kind, key, query });
    return () => query.dispose();
  }, [scope, reader, kind, key]);
  const query = owned?.scope === scope && owned.reader === reader && owned.kind === kind && owned.key === key && scope?.active ? owned.query : null;
  const snapshot = useSyncExternalStore(query?.subscribe ?? none, query?.getSnapshot ?? empty, query?.getSnapshot ?? empty);
  return { query, snapshot };
}
