import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../loading/read-scope.ts';
import { assertInventoryPage, createInventoryQuery, formatQuantity, totalLabel, totalOf } from './model.ts';
import { emptyInventoryFilter, type InventoryPage, type InventoryParameters } from './contracts.ts';
import { createSyntheticInventoryReader } from '../../preview/synthetic-reader.ts';
const identity = { accountId: 'SYNTHETIC-ACCOUNT', sessionRevision: 'SYNTHETIC-SESSION', permissionRevision: 'SYNTHETIC-PERMISSION' };
const parameters = (): InventoryParameters => ({ filter: emptyInventoryFilter(), page: 1, pageSize: 100 });
function setup(count = 3) {
  const context = new ReadContext(identity);
  const scope = context.createScope('SYNTHETIC-INVENTORY');
  const reads: string[] = [];
  const reader = createSyntheticInventoryReader({ productCount: count, delayMs: 0, onRead: event => reads.push(event.kind) });
  return { context, scope, reader, reads, query: createInventoryQuery(scope, reader) };
}
test('inventory does not read before explicit run; bounded products and exact full-filter summary', async () => {
  const s = setup(103); assert.deepEqual(s.reads, []); assert.equal(s.query.getSnapshot().phase, 'idle');
  const result = await s.query.run(parameters()); assert.equal(result.status, 'success');
  const data = s.query.getSnapshot().success!.data;
  assert.equal(data.products.length, 100); assert.equal(data.exactTotalProducts, 103); assert.equal(s.reads.length, 1);
  await s.query.run({ ...parameters(), page: 2 });
  assert.equal(s.query.getSnapshot().success!.data.products.length, 3);
  assert.deepEqual(s.query.getSnapshot().success!.data.allMatchesTotal, data.allMatchesTotal);
  s.context.clear();
});
test('preserves full size labels, FIT identities, unknown/zero/negative/nonexistent specifications', async () => {
  const s = setup(); await s.query.run(parameters()); const p = s.query.getSnapshot().success!.data.products[0]!;
  assert.equal(p.sizes[1]!.label, '165/S'); assert.equal(p.sizes[2]!.label, '170/M');
  assert.deepEqual([...new Set(p.colorFits.map(group => group.fit.label))], ['Y版（修身）', 'A版（标准）']);
  const cells = Object.values(p.colorFits[0]!.rows[0]!.cells);
  assert.ok(cells.some(cell => cell.state === 'known' && cell.quantity === '-2'));
  assert.ok(cells.some(cell => cell.state === 'known' && cell.quantity === '0'));
  assert.ok(cells.some(cell => cell.state === 'unknown'));
  assert.ok(cells.some(cell => cell.state === 'not-applicable'));
  assert.equal(p.total.completeness, 'incomplete'); s.context.clear();
});
test('integer totals never coerce unknown to zero and keep large exact values', () => {
  const total = totalOf([{ state: 'known', skuId: 'SYNTHETIC-A', quantity: '9007199254740993' }, { state: 'known', skuId: 'SYNTHETIC-B', quantity: '-2' }, { state: 'unknown', skuId: 'SYNTHETIC-C', reason: 'SYNTHETIC missing quantity' }, { state: 'not-applicable' }]);
  assert.equal(total.knownQuantity, '9007199254740991'); assert.equal(total.unknownCells, 1); assert.match(totalLabel(total), /已核/);
  assert.equal(formatQuantity('-9007199254740993'), '-9,007,199,254,740,993');
  assert.throws(() => formatQuantity('1.1')); assert.throws(() => formatQuantity('NaN'));
});
test('filter draft mutation cannot relabel executed facts; failure preserves its own prior scope', async () => {
  const s = setup(); const input = parameters(); await s.query.run(input);
  const previous = s.query.getSnapshot().success!;
  const changed = { ...parameters(), filter: { ...emptyInventoryFilter(), products: [{ id: 'test-product-2', label: 'SYNTHETIC SELECTED PRODUCT' }] } };
  s.reader.failNextInventory(); assert.equal((await s.query.run(changed)).status, 'error');
  assert.equal(s.query.getSnapshot().success, previous); assert.equal(s.query.getSnapshot().request!.parameters.filter.products[0]!.id, 'test-product-2');
  assert.equal(previous.parameters.filter.products.length, 0); s.context.clear();
});
test('missing cell, malformed integer and pagination mismatch fail instead of zero-success', async () => {
  const s = setup(); await s.query.run(parameters()); const data = s.query.getSnapshot().success!.data;
  const missing = structuredClone(data) as unknown as { products: { colorFits: { rows: { cells: Record<string, unknown> }[] }[] }[] };
  delete missing.products[0]!.colorFits[0]!.rows[0]!.cells['test-size-0'];
  assert.throws(() => assertInventoryPage(missing as unknown as InventoryPage, parameters()), /缺少明确状态|库存格数量/);
  const falseComplete = structuredClone(data);
  Object.assign(falseComplete.allMatchesTotal, { completeness: 'complete', unknownCells: 0 });
  assert.throws(() => assertInventoryPage(falseComplete, parameters()), /不能隐藏|不一致/);
  assert.throws(() => assertInventoryPage({ ...data, page: 2 }, parameters()), /分页/);
  assert.throws(() => assertInventoryPage({ ...data, exactTotalProducts: 4 }, parameters()), /条数/);
  s.context.clear();
});
test('identity replacement clears inventory references and stops future scope reads', async () => {
  const s = setup(); await s.query.run(parameters()); s.context.replaceIdentity({ ...identity, permissionRevision: 'SYNTHETIC-CHANGED' });
  assert.equal(s.query.getSnapshot().phase, 'disposed'); assert.equal(s.query.getSnapshot().success, null);
  assert.equal((await s.query.run(parameters())).status, 'discarded'); assert.equal(s.reads.length, 1);
});
test('candidate fixture is paged and independent from inventory reads', async () => {
  const s = setup(103);
  const result = await s.reader.readCandidates({ parameters: { kind: 'product', search: '', page: 1, pageSize: 20, selectedIds: ['test-product-103'], categoryId: null }, signal: s.scope.signal, identity: s.scope.identity, routeInstanceId: s.scope.routeInstanceId, entityId: null });
  assert.equal(result.items.length, 20); assert.equal(result.exactTotal, 103); assert.deepEqual(s.reads, ['product']); assert.equal(s.query.getSnapshot().phase, 'idle'); s.context.clear();
});
