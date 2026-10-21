import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadContext } from '../loading/read-scope.ts';
import type { QueryRead } from '../loading/latest-query.ts';
import type { CandidateKind, CandidatePage, CandidateParameters, InventoryReader } from '../inventory/contracts.ts';
import { InventoryCandidates, inventoryMultiOption } from './inventory-candidates.ts';
function fixture(kind: CandidateKind = 'product') {
  const context = new ReadContext({ accountId: 'TEST', sessionRevision: '1', permissionRevision: '1' });
  const scope = context.createScope('TEST');
  const requests: { read: QueryRead<CandidateParameters>; resolve: (data: CandidatePage) => void }[] = [];
  const reader: InventoryReader = { readInventory() { throw new Error('Not an inventory query.'); }, readCandidates: read => new Promise(resolve => requests.push({ read, resolve })) };
  const model = new InventoryCandidates(scope, reader, kind, ['CATEGORY-A', 'CATEGORY-B'], () => ['SELECTED']);
  const respond = (total: number, ids?: readonly string[]) => { const request = requests.at(-1)!; const page = request.read.parameters.page;
    request.resolve({ page, exactTotal: total, items: (ids ?? Array.from({ length: Math.min(20, Math.max(0, total - (page - 1) * 20)) }, (_, index) => `${page}-${index}`)).map(id => ({ id, label: `label ${id}`, code: `CODE ${id}`, name: `Name ${id}` })) }); };
  return { context, scope, requests, model, respond };
}
test('candidate window is idle until explicitly started, bounded20, selected IDs/categories preserved, no next-page prefetch', async () => {
  const f = fixture(); assert.equal(f.requests.length, 0); f.model.reset('  query  '); assert.equal(f.requests.length, 0);
  const one = f.model.loadNext(); assert.equal(f.requests.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0]!.read.parameters)), { kind: 'product', search: 'query', page: 1, pageSize: 20, selectedIds: ['SELECTED'], categoryIds: ['CATEGORY-A', 'CATEGORY-B'] });
  f.respond(21); await one; assert.equal(f.model.getSnapshot().items.length, 20); assert.equal(f.requests.length, 1); assert.equal(f.model.getSnapshot().completeUniverse, false);
  const two = f.model.loadNext(); f.respond(21); await two; assert.equal(f.model.getSnapshot().items.length, 21); assert.equal(f.model.getSnapshot().completeUniverse, false); await f.model.loadNext(); assert.equal(f.requests.length, 2); f.context.clear();
});
test('candidate all is proven only by one complete unsearched page, never accumulated or searched subset', async () => {
  const f = fixture(); const first = f.model.loadNext(); f.respond(2); await first; assert.equal(f.model.getSnapshot().completeUniverse, true);
  f.model.reset('CODE'); const searched = f.model.loadNext(); f.respond(2); await searched; assert.equal(f.model.getSnapshot().completeUniverse, false); assert.equal(f.model.getSnapshot().unfilteredTotal, 2); f.context.clear();
});
test('candidate search and scope disposal abort immediately and cannot publish late data', async () => {
  const f = fixture(); const old = f.model.loadNext(); const oldRead = f.requests[0]!; f.model.reset('new'); assert.equal(oldRead.read.signal.aborted, true);
  oldRead.resolve({ page: 1, exactTotal: 0, items: [] }); await old; assert.equal(f.model.getSnapshot().search, 'new'); assert.equal(f.model.getSnapshot().phase, 'idle');
  const current = f.model.loadNext(); f.context.clear(); assert.equal(f.requests[1]!.read.signal.aborted, true); f.respond(1); await current;
  assert.equal(f.model.getSnapshot().phase, 'disposed'); assert.deepEqual(f.model.getSnapshot().items, []); assert.equal(f.model.getSnapshot().exactTotal, null);
});
test('candidate rendering window stops at200 without pretending exactTotal is truncated', async () => {
  const f = fixture(); for (let page = 1; page <= 10; page++) { const read = f.model.loadNext(); f.respond(999); await read; }
  const state = f.model.getSnapshot(); assert.equal(state.items.length, 200); assert.equal(state.exactTotal, 999); assert.equal(state.limitReached, true); assert.equal(state.completeUniverse, false);
  await f.model.loadNext(); assert.equal(f.requests.length, 10); f.context.clear();
});
test('candidate drift, duplicate identities and malformed known category relationships fail closed', async () => {
  const f = fixture(); const first = f.model.loadNext(); f.respond(21); await first; const next = f.model.loadNext(); f.respond(21, ['1-0']); await next;
  assert.equal(f.model.getSnapshot().phase, 'error'); assert.equal(f.model.getSnapshot().items.length, 20); f.context.clear();
  const category = fixture('category'); const read = category.model.loadNext(); category.requests[0]!.resolve({ page: 1, exactTotal: 2, items: [
    { id: 'A', label: 'A', parentId: 'B', parentLabel: 'B', depth: 1 }, { id: 'B', label: 'B', parentId: 'A', parentLabel: 'A', depth: 1 },
  ] }); await read; assert.equal(category.model.getSnapshot().phase, 'error'); assert.deepEqual(category.model.getSnapshot().items, []); category.context.clear();
});

test('orphan category labels use only the supplied parent path without inventing parent nodes or changing canonical labels', () => {
  const child = { id: 'CHILD', label: 'Native Child', parentId: 'PARENT', parentLabel: 'Native Parent', depth: 1 as const, disabled: true };
  assert.deepEqual(inventoryMultiOption(child, new Set(['CHILD'])), { id: 'CHILD', name: 'Native Parent / Native Child', parentId: 'PARENT', disabled: true });
  assert.equal(inventoryMultiOption(child, new Set(['PARENT', 'CHILD'])).name, 'Native Child');
  assert.equal(inventoryMultiOption({ id: 'UNKNOWN', label: 'Only Native Label', parentId: 'NOT-LOADED' }, new Set(['UNKNOWN'])).name, 'Only Native Label');
  assert.equal(inventoryMultiOption({ id: 'WAREHOUSE', label: 'Warehouse' }).name, 'Warehouse');
  assert.equal(child.label, 'Native Child');
});
