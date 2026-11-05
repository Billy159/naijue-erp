import assert from 'node:assert/strict';
import test from 'node:test';
import type { InventoryPage, StockCell } from '../contracts.ts';
import { assertInventoryPage } from '../model.ts';
import { emptyInventoryFilter } from '../contracts.ts';
import { InventoryWindowModel, MAX_INVENTORY_OVERSCAN, inventoryColorFitKey, inventorySectionKey } from './model.ts';
import { syntheticPage, testAddress, testLayout, testViewport } from './fixtures.ts';

test('canonical rows/section order and exact source totals survive windowing without cell traversal', () => {
  let cellReads = 0;
  const base = syntheticPage(3, 2, 3, 6, () => cellReads++);
  const other = { ...base.products[1]!, sizeGroup: { id: 'other-group', label: '其他组' } };
  const data = { ...base, products: [base.products[0]!, other, base.products[2]!] };
  const model = new InventoryWindowModel(data, testLayout());
  assert.equal(cellReads, 0);
  assert.equal(model.sections.length, 2);
  assert.deepEqual(model.sections[0]!.products.map(product => product.id), ['product-0', 'product-2']);
  assert.deepEqual(model.sections[1]!.products.map(product => product.id), ['product-1']);
  assert.equal(model.sections[0]!.key, inventorySectionKey(data.products[0]!));
  assert.equal(model.metadata.rowCount, 2 + 3 * (6 + 1));
  const window = model.window(testViewport());
  assert.equal(cellReads, 0);
  assert.equal(window.rows[0]!.kind, 'section-header');
  assert.equal(model.data, data);
  assert.equal(model.data.allMatchesTotal, data.allMatchesTotal);
  const warehouse = model.rows.find(row => row.kind === 'warehouse')!;
  assert.ok(warehouse.kind === 'warehouse');
  assert.equal(warehouse.source, data.products[0]!.colorFits[0]!.rows[0]);
  assert.equal(warehouse.product.total, data.products[0]!.total);
  assert.equal(model.metadata.allocatedCellDescriptors, 0);
  assert.equal(model.cellTarget(testAddress())!.readReference, data.readReference);
  assert.equal(cellReads, 1);
});

test('100/200/500 product synthetic pages have bounded visible work, not fabricated latency', () => {
  const evidence: object[] = [];
  for (const productCount of [100, 200, 500]) {
    let cellReads = 0;
    const data = syntheticPage(productCount, 4, 8, 12, () => cellReads++);
    // Demonstrate these are complete DTOs with exact totals, not truncated cells.
    assertInventoryPage(data, { page: 1, pageSize: data.pageSize, filter: emptyInventoryFilter() });
    cellReads = 0;
    const model = new InventoryWindowModel(data, testLayout());
    const view = model.window(testViewport({ scrollTop: 2_000, scrollLeft: 120 }));
    const visibleWarehouseRows = view.rows.filter(row => row.kind === 'warehouse').length;
    const columnCount = view.sections[0]!.columns.length;
    assert.equal(cellReads, 0, 'Index and viewport must not read any stock cells.');
    assert.equal(model.rows.length, 1 + productCount * 33);
    assert.equal(model.metadata.indexedWarehouseRows, productCount * 32);
    assert.ok(view.rows.length <= Math.ceil(280 / 20) + 1 + 2 * 2);
    assert.ok(columnCount <= Math.ceil(160 / 40) + 1 + 2 * 1);
    assert.equal(columnCount, 6);
    assert.ok(visibleWarehouseRows * columnCount <= 19 * 7);
    assert.equal(data.allMatchesTotal.knownQuantity, String(productCount * 4 * 8 * 12));
    evidence.push({ products: productCount, logicalRows: model.rows.length, windowRows: view.rows.length, sizeColumns: columnCount, potentialVisibleStockCells: visibleWarehouseRows * columnCount });
  }
  assert.deepEqual(evidence.map(item => (item as { windowRows: number }).windowRows), [15, 15, 15]);
  // Structural evidence only. No elapsed times, browser nodes, or UX claims.
});

test('column window stays bounded as size axes grow and retains exact offscreen cells', () => {
  for (const sizes of [12, 120, 1200]) {
    let reads = 0;
    const data = syntheticPage(1, 1, 2, sizes, () => reads++);
    const model = new InventoryWindowModel(data, testLayout({ sizeWidth: size => size.id === 'size-0' ? 60 : 40 }));
    const window = model.window(testViewport({ scrollLeft: 100, overscanColumns: 2 }));
    assert.ok(window.sections[0]!.columns.length <= 9);
    assert.equal(reads, 0);
    assert.equal(model.metadata.columnCount, sizes);
    assert.equal(model.resolveCell(testAddress({ sizeId: `size-${sizes - 1}` }))!.cell.state, 'known');
    assert.equal(reads, 1);
  }
});

test('half-open windows handle boundaries, empty data, zero viewport and invalid geometry', () => {
  const model = new InventoryWindowModel(syntheticPage(1, 1, 1, 6), testLayout());
  const view = testViewport({ height: 20, width: 280, overscanRows: 0, overscanColumns: 0 });
  assert.deepEqual(model.window(view).rows.map(row => row.kind), ['section-header']);
  assert.deepEqual(model.window({ ...view, scrollTop: 20, height: 28 }).rows.map(row => row.kind), ['warehouse']);
  assert.deepEqual(model.window({ ...view, scrollTop: 48, height: 28 }).rows.map(row => row.kind), ['product-total']);
  assert.deepEqual(model.window({ ...view, scrollLeft: 40 }).sections[0]!.columns.map(column => column.index), [1]);
  const zero = model.window(testViewport({ height: 0, width: 0 }));
  assert.equal(zero.rows.length, 0); assert.equal(zero.sections.length, 0); assert.equal(zero.stickyHeader, null);
  const beyond = model.window(testViewport({ scrollTop: model.totalHeight + 100 }));
  assert.equal(beyond.rows.length, 0); assert.equal(beyond.stickyHeader, null);
  assert.equal(beyond.range.before + beyond.range.after, model.totalHeight);
  const empty = new InventoryWindowModel(syntheticPage(0), testLayout()).window(testViewport());
  assert.equal(empty.rows.length, 0); assert.equal(empty.range.totalExtent, 0);
  assert.throws(() => model.window(testViewport({ overscanRows: MAX_INVENTORY_OVERSCAN + 1 })), /Overscan/);
  assert.throws(() => model.window(testViewport({ scrollTop: NaN })), /scrollTop/);
  assert.throws(() => model.window(testViewport({ overscanColumns: 0.1 })), /Overscan/);
  assert.throws(() => new InventoryWindowModel(syntheticPage(), testLayout({ sizeWidth: 0 })), /size width/);
  assert.throws(() => new InventoryWindowModel(syntheticPage(), testLayout({ heights: { ...testLayout().heights, warehouse: -1 } })), /row height/);
});

test('collapse takes immutable snapshots, preserves canonical IDs/totals, and describes reveal without expanding', () => {
  const data = syntheticPage(2);
  const products = new Set(['product-0']);
  const colors = new Set([inventoryColorFitKey('product-1', 'color-0', 'fit-0')]);
  const layout = testLayout({ collapsedProducts: products, collapsedColors: colors, subtotal: true, total: false });
  const model = new InventoryWindowModel(data, layout);
  products.clear(); colors.clear();
  assert.equal(model.rows.filter(row => row.kind === 'warehouse').length, 3);
  const collapsed = model.rows.find(row => row.kind === 'product-total')!;
  assert.ok(collapsed.kind === 'product-total'); assert.equal(collapsed.reason, 'collapsed'); assert.equal(collapsed.product.total, data.products[0]!.total);
  const hidden = model.resolveCell(testAddress())!;
  assert.equal(hidden.rowIndex, null); assert.equal(hidden.reveal.productId, 'product-0');
  const groupHidden = model.scrollToCell(testAddress({ productId: 'product-1' }), testViewport())!;
  assert.equal(groupHidden.kind, 'hidden');
  assert.equal(groupHidden.location.reveal.colorFitKey, inventoryColorFitKey('product-1', 'color-0', 'fit-0'));
  assert.equal(model.data.allMatchesTotal, data.allMatchesTotal);
  assert.equal(model.rows.filter(row => row.kind === 'color-total').length, 2);
  assert.notEqual(inventoryColorFitKey('a,b', 'c', 'd'), inventoryColorFitKey('a', 'b,c', 'd'));
});

test('sticky header metadata includes external offset and push-off by the next section', () => {
  const base = syntheticPage(2, 1, 1, 2);
  const data = { ...base, products: [base.products[0]!, { ...base.products[1]!, sizeGroup: { id: 'second', label: 'second' } }] };
  const model = new InventoryWindowModel(data, testLayout());
  const boundary = model.sections[0]!.height;
  const nearEnd = model.window(testViewport({ scrollTop: boundary - 25, height: 30, stickyHeaderOffset: 10, overscanRows: 0 }));
  assert.equal(nearEnd.stickyHeader!.section.index, 0);
  assert.equal(nearEnd.stickyHeader!.top, 5);
  const next = model.window(testViewport({ scrollTop: boundary - 10, height: 30, stickyHeaderOffset: 10 }));
  assert.equal(next.stickyHeader!.section.index, 1); assert.equal(next.stickyHeader!.top, 10);
  assert.ok(next.sections.some(section => section.section.index === next.stickyHeader!.section.index));
});

test('logical focus skips nonexistent SKU coordinates, preserves warehouse/size identities and stays in a section', () => {
  const data = syntheticPage(2, 1, 3, 6);
  const cells = data.products[0]!.colorFits[0]!.rows[0]!.cells as Record<string, StockCell>;
  cells['size-1'] = { state: 'not-applicable' };
  const secondRow = data.products[0]!.colorFits[0]!.rows[1]!.cells as Record<string, StockCell>;
  secondRow['size-0'] = { state: 'not-applicable' };
  const model = new InventoryWindowModel(data, testLayout());
  assert.equal(model.moveFocus(testAddress(), 'right')!.sizeId, 'size-2');
  assert.equal(model.moveFocus(testAddress(), 'down')!.warehouseId, 'warehouse-2');
  assert.equal(model.moveFocus(testAddress(), 'right', 2)!.sizeId, 'size-3');
  assert.equal(model.moveFocus(testAddress({ sizeId: 'size-3' }), 'row-start')!.sizeId, 'size-0');
  assert.equal(model.moveFocus(testAddress(), 'row-end')!.sizeId, 'size-5');
  assert.deepEqual(model.moveFocus(testAddress(), 'left'), testAddress());
  assert.equal(model.cellTarget(testAddress({ sizeId: 'size-1' })), null);
  assert.equal(model.resolveCell(testAddress({ productId: 'absent' })), null);
  assert.equal(model.resolveCell(testAddress({ warehouseId: 'absent' })), null);
  assert.throws(() => model.moveFocus(testAddress(), 'right', 0), /steps/);
  const end = testAddress({ productId: 'product-1', warehouseId: 'warehouse-2' });
  assert.deepEqual(model.moveFocus(end, 'down'), end);
  const collapsed = new InventoryWindowModel(data, testLayout({ collapsedProducts: new Set(['product-0']) }));
  assert.equal(collapsed.moveFocus(testAddress(), 'right'), null);
});

test('scroll-to-cell computes axis coordinates without mounting all cells or fabricating missing quantities', () => {
  const model = new InventoryWindowModel(syntheticPage(100, 4, 8, 120), testLayout());
  const viewport = testViewport({ stickyHeaderOffset: 10 });
  const address = testAddress({ productId: 'product-80', warehouseId: 'warehouse-5', sizeId: 'size-90' });
  const plan = model.scrollToCell(address, viewport)!;
  assert.equal(plan.kind, 'visible');
  assert.ok(plan.kind === 'visible');
  const view = model.window({ ...viewport, scrollTop: plan.scrollTop, scrollLeft: plan.scrollLeft });
  assert.ok(view.rows.some(row => row.index === plan.location.rowIndex));
  assert.ok(view.sections.some(section => section.columns.some(column => column.size.id === address.sizeId)));
  const row = model.rows[plan.location.rowIndex!]!;
  assert.ok(row.top >= plan.scrollTop + 30);
  assert.ok(row.top + row.height <= plan.scrollTop + viewport.height);
  const unchanged = model.scrollToCell(address, { ...viewport, scrollTop: plan.scrollTop, scrollLeft: plan.scrollLeft })!;
  assert.ok(unchanged.kind === 'visible'); assert.equal(unchanged.scrollTop, plan.scrollTop); assert.equal(unchanged.scrollLeft, plan.scrollLeft);
  for (const alignment of ['start', 'center', 'end'] as const) {
    const aligned = model.scrollToCell(address, viewport, alignment)!;
    assert.ok(aligned.kind === 'visible'); assert.ok(aligned.scrollTop >= 0); assert.ok(aligned.scrollLeft >= 0);
  }
  const invalid = syntheticPage(1, 1, 1, 2);
  delete (invalid.products[0]!.colorFits[0]!.rows[0]!.cells as Record<string, StockCell>)['size-0'];
  assert.throws(() => new InventoryWindowModel(invalid, testLayout()).resolveCell(testAddress()), /missing is never zero/);
});

test('a changing data reference cannot relabel an old canonical read', () => {
  const data = syntheticPage(1);
  const model = new InventoryWindowModel(data, testLayout());
  const replacement: InventoryPage = { ...data, readReference: 'second-read' };
  assert.equal(new InventoryWindowModel(replacement, testLayout()).cellTarget(testAddress())!.readReference, 'second-read');
  assert.equal(model.cellTarget(testAddress())!.readReference, 'synthetic-window-read-1');
});

test('ID-based scroll anchors survive preceding collapse and fall back when their row is hidden', () => {
  const data = syntheticPage(10, 2, 3, 6);
  const original = new InventoryWindowModel(data, testLayout());
  const address = testAddress({ productId: 'product-7', warehouseId: 'warehouse-1' });
  const location = original.resolveCell(address)!;
  const top = original.rows[location.rowIndex!]!.top;
  const viewport = testViewport({ scrollTop: top + 5 - 30, stickyHeaderOffset: 10 });
  const anchor = original.captureScrollAnchor(viewport)!;
  assert.equal(anchor.rowKey, original.rows[location.rowIndex!]!.key);
  assert.equal(anchor.offsetWithinRow, 5);
  const changed = new InventoryWindowModel(data, testLayout({ collapsedProducts: new Set(['product-0']) }));
  const restored = changed.restoreScrollAnchor(anchor, viewport)!;
  const newLocation = changed.resolveCell(address)!;
  assert.equal(restored, changed.rows[newLocation.rowIndex!]!.top + 5 - 30);
  const hidden = new InventoryWindowModel(data, testLayout({ collapsedColors: new Set([inventoryColorFitKey('product-7', 'color-0', 'fit-0')]) }));
  const hiddenTop = hidden.restoreScrollAnchor(anchor, viewport)!;
  const total = hidden.rows.find(row => row.kind === 'color-total' && row.product.id === 'product-7')!;
  assert.equal(hiddenTop, total.top - 30);
  const empty = new InventoryWindowModel(syntheticPage(0), testLayout());
  assert.equal(empty.captureScrollAnchor(testViewport()), null);
  assert.equal(empty.restoreScrollAnchor(anchor, testViewport()), null);
});

test('single inline projection follows frozen Demo detail and collapse structure, independent of window edges', () => {
  const data = syntheticPage(2, 2, 3, 6);
  const expanded = new InventoryWindowModel(data, testLayout({ subtotal: true }));
  assert.ok(expanded.rows.every(row => ['section-header', 'warehouse', 'color-total', 'product-total'].includes(row.kind)));
  const firstRows = expanded.rows.filter(row => 'product' in row && row.firstInProduct);
  assert.equal(firstRows.length, 2);
  assert.ok(firstRows.every(row => row.kind === 'warehouse'));
  const detail = expanded.rows.filter(row => row.kind === 'warehouse');
  assert.equal(detail.filter(row => row.firstInColorFit).length, 4);
  assert.ok(detail.filter(row => row.rowIndexInGroup > 0).every(row => !row.firstInColorFit && !row.firstInProduct));
  const middle = expanded.window(testViewport({ scrollTop: detail[1]!.top, height: 28, overscanRows: 0 }));
  assert.equal(middle.rows[0]!.kind, 'warehouse');
  assert.ok(middle.rows[0]!.kind === 'warehouse');
  assert.equal(middle.rows[0]!.firstInProduct, false);
  assert.equal(middle.rows[0]!.firstInColorFit, false);
  const collapsed = new InventoryWindowModel(data, testLayout({ collapsedProducts: new Set(['product-0']) }));
  const productRows = collapsed.rows.filter(row => 'product' in row && row.product.id === 'product-0');
  assert.equal(productRows.length, 1);
  assert.ok(productRows[0]!.kind === 'product-total');
  assert.equal(productRows[0]!.reason, 'collapsed');
  assert.equal(productRows[0]!.firstInProduct, true);
  const foldedColor = new InventoryWindowModel(data, testLayout({ collapsedColors: new Set([inventoryColorFitKey('product-0', 'color-0', 'fit-0')]) }));
  const first = foldedColor.rows[1]!;
  assert.ok(first.kind === 'color-total');
  assert.equal(first.reason, 'collapsed');
  assert.equal(first.firstInProduct, true); assert.equal(first.firstInColorFit, true);
});

test('optional source section description is outside thead and never pins thead prematurely', () => {
  const model = new InventoryWindowModel(syntheticPage(1, 1, 2, 2), testLayout({ heights: { ...testLayout().heights, 'section-description': 32 } }));
  assert.equal(model.rows[0]!.kind, 'section-description');
  assert.equal(model.rows[1]!.kind, 'section-header');
  assert.equal(model.sections[0]!.headerTop, 32);
  assert.equal(model.window(testViewport({ height: 20 })).stickyHeader, null);
  const pinned = model.window(testViewport({ scrollTop: 32 }));
  assert.equal(pinned.stickyHeader!.row.kind, 'section-header');
  assert.equal(pinned.stickyHeader!.row.index, 1);
  assert.equal(model.resolveCell(testAddress())!.rowIndex, 2);
});

test('cached variable row measurements preserve actual geometry without measuring or materializing cells', () => {
  let reads = 0;
  const model = new InventoryWindowModel(syntheticPage(2, 2, 3, 6, () => reads++), testLayout({ measuredRowHeight: row => row.kind === 'warehouse' && row.firstInProduct ? 71 : row.kind === 'section-header' ? 31 : undefined }));
  assert.equal(model.sections[0]!.headerHeight, 31);
  assert.equal(model.rows[1]!.height, 71);
  for (const scrollTop of [0, 30, 31, 70, 101, 102, 200, 300]) {
    const height = 57;
    const expected = model.rows.filter(row => row.top + row.height > scrollTop && row.top < scrollTop + height);
    const actual = model.window(testViewport({ scrollTop, height, overscanRows: 0 }));
    assert.deepEqual(actual.rows, expected);
  }
  assert.equal(reads, 0);
  assert.throws(() => new InventoryWindowModel(syntheticPage(), testLayout({ measuredRowHeight: () => -1 })), /row height/);
});

function anchorBoundaryFixture() {
  const base = syntheticPage(2, 1, 5, 2);
  const data = { ...base, products: [base.products[0]!, { ...base.products[1]!, sizeGroup: { id: 'other', label: 'other' } }] };
  const layout = testLayout({ heights: { ...testLayout().heights, 'section-description': 32 } });
  return { data, layout };
}

test('anchor capture/restore is exactly idempotent at the reported 220px description/header boundary', () => {
  const { data, layout } = anchorBoundaryFixture();
  const model = new InventoryWindowModel(data, layout);
  assert.equal(model.sections[1]!.top, 220);
  for (const stickyHeaderOffset of [0, 10]) {
    for (const delta of [-32, -25, -20, -15, -10, -5, -1, 0, 1, 10, 20, 31, 32, 33, 40, 51, 52, 53]) {
      const viewport = testViewport({ height: 60, scrollTop: 220 + delta, overscanRows: 0, stickyHeaderOffset });
      const anchor = model.captureScrollAnchor(viewport)!;
      assert.equal(model.restoreScrollAnchor(anchor, viewport), viewport.scrollTop, `delta=${delta}, chrome=${stickyHeaderOffset}`);
    }
  }
  const viewport = testViewport({ height: 60, scrollTop: 205, overscanRows: 0 });
  const anchor = model.captureScrollAnchor(viewport)!;
  assert.equal(model.rows.find(row => row.key === anchor.rowKey)!.kind, 'section-description');
  assert.equal(anchor.offsetWithinRow, 0);
  assert.equal(anchor.insetBelowChrome, 15);
  assert.equal(model.restoreScrollAnchor(anchor, viewport), 205);
});

test('anchor identity round trips across every physical scroll offset with descriptions and measured header heights', () => {
  const { data, layout } = anchorBoundaryFixture();
  const model = new InventoryWindowModel(data, {
    ...layout,
    measuredRowHeight: row => row.kind === 'section-header' ? row.key.includes('other') ? 17 : 31 : row.kind === 'warehouse' && row.firstInProduct ? 43 : undefined,
  });
  assert.deepEqual(model.sections.map(section => section.headerHeight), [31, 17]);
  for (const stickyHeaderOffset of [0, 10]) {
    for (const height of [60, 95]) {
      for (let scrollTop = 0; scrollTop <= model.totalHeight - height; scrollTop++) {
        const viewport = testViewport({ height, scrollTop, stickyHeaderOffset });
        const anchor = model.captureScrollAnchor(viewport)!;
        assert.equal(model.restoreScrollAnchor(anchor, viewport), scrollTop, `top=${scrollTop}, height=${height}, chrome=${stickyHeaderOffset}`);
      }
    }
  }
});

test('a description anchor retains its captured body-edge context across preceding collapse and measurement reflow', () => {
  const { data, layout } = anchorBoundaryFixture();
  const original = new InventoryWindowModel(data, layout);
  for (const stickyHeaderOffset of [0, 10]) {
    for (const delta of [-20, -15, -10, -5]) {
      const viewport = testViewport({ height: 60, scrollTop: 220 + delta, stickyHeaderOffset });
      const anchor = original.captureScrollAnchor(viewport)!;
      const capturedRow = original.rows.find(row => row.key === anchor.rowKey)!;
      assert.equal(capturedRow.kind, 'section-description');
      for (const changed of [
        new InventoryWindowModel(data, { ...layout, collapsedProducts: new Set(['product-0']) }),
        new InventoryWindowModel(data, { ...layout, measuredRowHeight: row => row.kind === 'warehouse' && row.product.id === 'product-0' ? 35 : undefined }),
      ]) {
        const row = changed.rows.find(row => row.key === anchor.rowKey)!;
        const restored = changed.restoreScrollAnchor(anchor, viewport)!;
        assert.equal(row.top + anchor.offsetWithinRow - restored, stickyHeaderOffset + anchor.insetBelowChrome);
        assert.equal(restored - viewport.scrollTop, row.top - capturedRow.top);
        const restoredViewport = { ...viewport, scrollTop: restored };
        assert.equal(changed.restoreScrollAnchor(changed.captureScrollAnchor(restoredViewport)!, restoredViewport), restored);
      }
    }
  }
  const invalid = original.captureScrollAnchor(testViewport())!;
  assert.throws(() => original.restoreScrollAnchor({ ...invalid, insetBelowChrome: NaN }, testViewport()), /anchor inset/);
});

test('normal-row anchors use the current fully pinned header height after measurement or collapse reflow', () => {
  const data = syntheticPage(10, 2, 3, 6);
  const original = new InventoryWindowModel(data, testLayout());
  const address = testAddress({ productId: 'product-7', warehouseId: 'warehouse-1' });
  const originalRow = original.rows[original.resolveCell(address)!.rowIndex!]!;
  const viewport = testViewport({ height: 120, scrollTop: originalRow.top + 5 - 20 });
  const anchor = original.captureScrollAnchor(viewport)!;
  assert.equal(anchor.offsetWithinRow, 5);
  assert.equal(anchor.headerContext!.mode, 'pinned');
  for (const headerHeight of [8, 40]) {
    for (const collapsedProducts of [new Set<string>(), new Set(['product-0'])]) {
      const changed = new InventoryWindowModel(data, testLayout({ collapsedProducts, measuredRowHeight: row => row.kind === 'section-header' ? headerHeight : undefined }));
      const row = changed.rows[changed.resolveCell(address)!.rowIndex!]!;
      for (const stickyHeaderOffset of [0, 10]) {
        const nextViewport = { ...viewport, stickyHeaderOffset };
        const restored = changed.restoreScrollAnchor(anchor, nextViewport)!;
        assert.equal(row.top + 5 - restored, stickyHeaderOffset + headerHeight);
        const recaptured = changed.captureScrollAnchor({ ...nextViewport, scrollTop: restored })!;
        assert.equal(recaptured.rowKey, anchor.rowKey);
        assert.equal(recaptured.offsetWithinRow, 5);
      }
    }
  }
});

test('boundary anchors retain their transition phase without becoming hidden by grown or shrunk headers', () => {
  const { data, layout } = anchorBoundaryFixture();
  const original = new InventoryWindowModel(data, layout);
  for (const stickyHeaderOffset of [0, 10]) {
    for (const delta of [-20, -15, -10, -5, 0, 5]) {
      const viewport = testViewport({ height: 60, scrollTop: 220 + delta, stickyHeaderOffset });
      const anchor = original.captureScrollAnchor(viewport)!;
      for (const headerHeight of [7, 40]) {
        const changed = new InventoryWindowModel(data, { ...layout, measuredRowHeight: row => row.kind === 'section-header' ? headerHeight : undefined });
        const row = changed.rows.find(row => row.key === anchor.rowKey)!;
        const restored = changed.restoreScrollAnchor(anchor, viewport)!;
        const current = changed.window({ ...viewport, scrollTop: restored });
        const bodyEdge = Math.max(stickyHeaderOffset, current.stickyHeader ? current.stickyHeader.top + current.stickyHeader.section.headerHeight : 0);
        assert.equal(row.top + anchor.offsetWithinRow - restored, bodyEdge, `delta=${delta}, chrome=${stickyHeaderOffset}, header=${headerHeight}`);
        const recaptured = changed.captureScrollAnchor({ ...viewport, scrollTop: restored })!;
        assert.equal(recaptured.rowKey, anchor.rowKey);
        assert.equal(recaptured.offsetWithinRow, anchor.offsetWithinRow);
      }
    }
  }
});
