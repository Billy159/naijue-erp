/** SYNTHETIC native hierarchy, not the user's catalogue. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryPath, categoryTreeIndex, visibleCategoryRows } from './tree-model.ts';
import type { CatalogueSettingsCategory } from '../product-settings/colors/contracts.ts';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const node = (n: number, parent: number | null, name: string, displayOrder = 0): CatalogueSettingsCategory => ({ id: id(n), parentId: parent === null ? null : id(parent), name, displayOrder, version: 1, code: null, productCount: null, childCount: n === 1 || n === 2 ? 1 : 0 });
test('native third-level parent IDs and signed order retained; same names do not merge', () => {
  const index = categoryTreeIndex([node(1, null, '同名', 2), node(2, 1, '中层', -3), node(3, 2, '叶子', -8), node(4, null, '同名', -1)]);
  assert.deepEqual(visibleCategoryRows(index, new Set(), '').map(row => row.item.id), [id(4), id(1)]);
  assert.deepEqual(visibleCategoryRows(index, new Set([id(1), id(2)]), '').map(row => [row.item.id, row.depth]), [[id(4), 0], [id(1), 0], [id(2), 1], [id(3), 2]]);
  assert.deepEqual(categoryPath(index, id(3)).map(item => item.id), [id(1), id(2), id(3)]);
  assert.equal(index.byId.size, 4);
});
test('search exact authorized paths retains ancestors without reparenting or needing all branches expanded', () => {
  const index = categoryTreeIndex([node(1, null, 'ROOT'), node(2, 1, 'MIDDLE'), node(3, 2, 'TARGET'), node(4, null, 'OTHER')]);
  const rows = visibleCategoryRows(index, new Set(), 'target'); assert.deepEqual(rows.map(row => [row.item.id, row.depth]), [[id(1), 0], [id(2), 1], [id(3), 2]]);
  assert.deepEqual(visibleCategoryRows(index, new Set(), 'root / middle').map(row => row.item.id), [id(1), id(2), id(3)]);
  assert.deepEqual(visibleCategoryRows(index, new Set(), 'missing'), []);
});
test('streamed path matching preserves cross-segment/repeated-prefix semantics and branch isolation', () => {
  const index = categoryTreeIndex([node(1, null, 'ABABA'), node(2, 1, 'ABABAC'), node(3, 2, 'TARGET'), node(4, null, 'OTHER'), node(5, 4, 'ABABAC')]);
  for (const search of ['aba / ababac', 'abac / target', 'aba / aba', 'other / ababac', '/ target', 'ababa / ababac / target', 'ababa / other']) {
    const matching = new Set<string>();
    for (const item of index.byId.values()) { const path = categoryPath(index, item.id); if (path.map(value => value.name).join(' / ').toLocaleLowerCase().includes(search)) for (const ancestor of path) matching.add(ancestor.id); }
    assert.deepEqual(new Set(visibleCategoryRows(index, new Set(), search).map(row => row.item.id)), matching, search);
  }
});
test('5000-level native tree search is iterative and bounded without materializing every ancestor path', { timeout: 5000 }, () => {
  const count = 5000;
  const items: CatalogueSettingsCategory[] = Array.from({ length: count }, (_, offset) => ({ id: id(offset + 1), parentId: offset ? id(offset) : null, name: offset === count - 1 ? 'DEEP TARGET' : 'NATIVE', displayOrder: -offset, version: 1, code: null, productCount: null, childCount: offset === count - 1 ? 0 : 1 }));
  const index = categoryTreeIndex(items), start = performance.now(), rows = visibleCategoryRows(index, new Set(), 'native / deep target');
  assert.equal(rows.length, count); assert.equal(rows.at(-1)!.depth, count - 1); assert.equal(rows.at(-1)!.item.id, id(count));
  assert.ok(performance.now() - start < 1000, 'synthetic pure-model search should not consume seconds or a quadratic path walk');
});
