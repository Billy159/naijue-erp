import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryWindowModel } from './model.ts';
import { createInventoryRenderPlan, inventoryDOMScrollTop, inventoryModelViewport } from './render-plan.ts';
import { syntheticPage, testAddress, testLayout, testViewport } from './fixtures.ts';

for (const count of [100, 200, 500]) test(`native-table plan is bounded for ${count} complete products`, () => {
  let reads = 0;
  const page = syntheticPage(count, 4, 8, 12, () => reads++);
  const model = new InventoryWindowModel(page, testLayout());
  const plan = createInventoryRenderPlan(model, testViewport(), 12);
  assert.equal(reads, 0);
  assert.equal(model.metadata.rowCount, count * 33 + 1);
  assert.equal(plan.sections.length, 1);
  assert.ok(plan.sections[0]!.body.filter(part => part.kind === 'row').length <= 15);
  assert.equal(plan.sections[0]!.columns.filter(part => part.kind === 'column').length, 5);
  assert.equal(plan.height, model.totalHeight + 12);
  assert.equal(plan.sections[0]!.body.reduce((height, part) => height + (part.kind === 'row' ? part.row.height : part.height), 0), model.sections[0]!.height - 20);
});
test('retained logical focus adds one row and at most one column, not its intervening inventory', () => {
  const model = new InventoryWindowModel(syntheticPage(500, 4, 8, 12), testLayout());
  const plan = createInventoryRenderPlan(model, testViewport(), 12, testAddress({ productId: 'product-499', sizeId: 'size-11' }));
  const section = plan.sections[0]!;
  assert.ok(section.body.filter(part => part.kind === 'row').length <= 16);
  assert.equal(section.columns.filter(part => part.kind === 'column').length, 6);
  const last = section.body.findLast(part => part.kind === 'row');
  assert.equal(last?.kind === 'row' && last.row.kind === 'warehouse' && last.row.product.id, 'product-499');
  assert.equal(section.columns.reduce((width, part) => width + (part.kind === 'column' ? part.column.width : part.width), 0), model.sections[0]!.sizeExtent);
});
test('section margins remain outside table rows and both axes preserve complete extents', () => {
  const page = syntheticPage(3);
  const products = page.products.map((product, index) => ({ ...product, sizeGroup: { id: `group-${index}`, label: `group ${index}` } }));
  const model = new InventoryWindowModel({ ...page, products }, testLayout());
  const second = model.sections[1]!;
  const viewport = testViewport({ scrollTop: second.top + 12, height: 80, overscanRows: 0 });
  assert.equal(inventoryModelViewport(model, viewport, 12).scrollTop, second.top);
  assert.equal(inventoryDOMScrollTop(model, second.top, 12), second.top + 12);
  const plan = createInventoryRenderPlan(model, viewport, 12);
  assert.equal(plan.height, model.totalHeight + 36);
  assert.ok(plan.sections.some(section => section.section.index === 1 && section.top === second.top + 12));
  assert.equal(inventoryModelViewport(model, testViewport({ scrollTop: second.top + 6, height: 6 }), 12).height, 0);
  assert.throws(() => createInventoryRenderPlan(model, viewport, Number.NaN), /section gap/);
});
test('collapsed targets never retain a hidden warehouse row; indexed columns fail safely', () => {
  const model = new InventoryWindowModel(syntheticPage(), testLayout({ collapsedProducts: new Set(['product-2']) }));
  const plan = createInventoryRenderPlan(model, testViewport(), 12, testAddress({ productId: 'product-2' }));
  assert.equal(plan.sections.flatMap(section => section.body).some(part => part.kind === 'row' && part.row.kind === 'warehouse' && part.row.product.id === 'product-2'), false);
  assert.equal(model.column(-1, 0), null);
  assert.equal(model.column(0, 100), null);
  assert.equal(model.column(0, 2)?.left, 80);
});

test('original invalid viewport cannot be sanitized by section-coordinate translation', () => {
  const model = new InventoryWindowModel(syntheticPage(), testLayout());
  for (const fields of [{ scrollTop: -1 }, { scrollTop: Infinity }, { height: -1 }, { height: Infinity }, { width: NaN }, { scrollLeft: -1 }]) {
    assert.throws(() => createInventoryRenderPlan(model, testViewport(fields), 12), RangeError);
  }
});

test('section margins and transformed scroll positions cannot overflow safe geometry', () => {
  const page = syntheticPage();
  const products = page.products.map((product, index) => ({ ...product, sizeGroup: { id: `group-${index}`, label: `group ${index}` } }));
  const model = new InventoryWindowModel({ ...page, products }, testLayout());
  for (const gap of [Number.MAX_VALUE, 1e16]) {
    assert.throws(() => createInventoryRenderPlan(model, testViewport(), gap), /safe geometry/);
    assert.throws(() => inventoryDOMScrollTop(model, 1, gap), /safe geometry/);
  }
  assert.throws(() => createInventoryRenderPlan(model, testViewport({ scrollTop: Number.MAX_VALUE, height: Number.MAX_VALUE }), 12), /finite/);
  assert.throws(() => inventoryDOMScrollTop(model, Number.MAX_VALUE, 12), /safe geometry/);
});
