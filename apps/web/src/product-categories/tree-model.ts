import type { CategoryOrderCommand } from '../../../../packages/application/src/catalogue-maintenance-ports.ts';
import type { CatalogueSettingsCategory } from '../product-settings/colors/contracts.ts';

export interface CategoryTreeIndex {
  readonly byId: ReadonlyMap<string, CatalogueSettingsCategory>;
  readonly children: ReadonlyMap<string | null, readonly CatalogueSettingsCategory[]>;
}
export function categoryTreeIndex(items: readonly CatalogueSettingsCategory[]): CategoryTreeIndex {
  const byId = new Map(items.map(item => [item.id, item]));
  const children = new Map<string | null, CatalogueSettingsCategory[]>();
  for (const item of items) { const siblings = children.get(item.parentId) ?? []; siblings.push(item); children.set(item.parentId, siblings); }
  for (const siblings of children.values()) siblings.sort((a, b) => a.displayOrder - b.displayOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { byId, children };
}
export function categoryPath(index: CategoryTreeIndex, id: string): readonly CatalogueSettingsCategory[] {
  const path: CatalogueSettingsCategory[] = [], seen = new Set<string>();
  let current = index.byId.get(id);
  while (current && !seen.has(current.id)) { path.push(current); seen.add(current.id); current = current.parentId === null ? undefined : index.byId.get(current.parentId); }
  return path.reverse();
}
export interface CategoryTreeRow { readonly item: CatalogueSettingsCategory; readonly depth: number; readonly position: number; readonly siblings: number; readonly expanded: boolean }
/** KMP state can be copied at a branch: each child's path starts at its parent's
 * matched prefix without repeatedly materializing every ancestor name. This keeps
 * the authorized 5000-deep native tree from repeating quadratic ancestor-path walks. */
function matchingCategoryPaths(index: CategoryTreeIndex, query: string): ReadonlySet<string> {
  const prefix = Array<number>(query.length).fill(0);
  for (let offset = 1, matched = 0; offset < query.length; offset++) {
    while (matched && query[offset] !== query[matched]) matched = prefix[matched - 1]!;
    if (query[offset] === query[matched]) matched++;
    prefix[offset] = matched;
  }
  const scan = (text: string, matched: number): { matched: number; found: boolean } => {
    for (let offset = 0; offset < text.length; offset++) {
      while (matched && text[offset] !== query[matched]) matched = prefix[matched - 1]!;
      if (text[offset] === query[matched]) matched++;
      if (matched === query.length) return { matched, found: true };
    }
    return { matched, found: false };
  };
  const matching = new Set<string>(), visited: CatalogueSettingsCategory[] = [];
  const pending = (index.children.get(null) ?? []).map(item => ({ item, matched: 0, found: false }));
  while (pending.length) {
    const row = pending.pop()!;
    let state = { matched: row.matched, found: row.found };
    if (!state.found && row.item.parentId !== null) state = scan(' / ', state.matched);
    if (!state.found) state = scan(row.item.name.toLocaleLowerCase(), state.matched);
    visited.push(row.item);
    if (state.found) matching.add(row.item.id);
    for (const child of index.children.get(row.item.id) ?? []) pending.push({ item: child, ...state });
  }
  // Preorder reversed always visits children before parents. Add each ancestor once,
  // including context for a cross-segment path match, without walking every path.
  for (let offset = visited.length - 1; offset >= 0; offset--) {
    const item = visited[offset]!;
    if (matching.has(item.id) && item.parentId !== null) matching.add(item.parentId);
  }
  return matching;
}
/** Flat iterative presentation of the exact native hierarchy: no two-level truncation,
 * name-based identity, reparenting, fake 'all' node or recursive render depth limit. */
export function visibleCategoryRows(index: CategoryTreeIndex, expanded: ReadonlySet<string>, search: string): readonly CategoryTreeRow[] {
  const query = search.trim().toLocaleLowerCase(), matching = query ? matchingCategoryPaths(index, query) : new Set<string>();
  const result: CategoryTreeRow[] = [], roots = index.children.get(null) ?? [];
  const pending = roots.map((item, position) => ({ item, depth: 0, position: position + 1, siblings: roots.length })).reverse();
  while (pending.length) {
    const row = pending.pop()!;
    if (query && !matching.has(row.item.id)) continue;
    const children = index.children.get(row.item.id) ?? [], open = query ? children.some(child => matching.has(child.id)) : expanded.has(row.item.id);
    result.push({ ...row, expanded: open });
    if (open) for (let position = children.length - 1; position >= 0; position--) pending.push({ item: children[position]!, depth: row.depth + 1, position: position + 1, siblings: children.length });
  }
  return result;
}

/** Build from the complete authorized tree, never its searched/visible rows. */
export function categoryReorderDraft(index: CategoryTreeIndex, movedId: string, targetId: string, placement: 'before' | 'after'): Omit<Extract<CategoryOrderCommand, { readonly action: 'REORDER' }>, 'requestKey'> | null {
  const moved = index.byId.get(movedId), target = index.byId.get(targetId);
  if (!moved || !target || movedId === targetId || moved.parentId !== target.parentId) return null;
  const siblings = index.children.get(moved.parentId) ?? [], orderedIds = siblings.filter(item => item.id !== movedId).map(item => item.id);
  const position = orderedIds.indexOf(targetId); if (position < 0) return null;
  orderedIds.splice(position + (placement === 'after' ? 1 : 0), 0, movedId);
  if (orderedIds.every((id, position) => id === siblings[position]?.id)) return null;
  return { action: 'REORDER', parentId: moved.parentId, movedId, expectedSiblings: siblings.map(item => ({ id: item.id, expectedVersion: item.version })), orderedIds };
}
