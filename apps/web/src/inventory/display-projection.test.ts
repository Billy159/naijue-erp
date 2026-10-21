import assert from 'node:assert/strict';
import test from 'node:test';
import { makeSyntheticInventoryProduct } from '../../preview/synthetic-reader.ts';
import { emptyInventoryFilter, type InventoryProduct, type StockCell } from './contracts.ts';
import { knownDisplaySources, projectInventoryColors } from './display-projection.ts';
import { totalOf } from './model.ts';

const product = () => makeSyntheticInventoryProduct(1, emptyInventoryFilter());

test('screenshot-shaped two FIT × two warehouse rows become two display rows without changing the total 35', () => {
  const input = product();
  const quantities = [[['-2', '0', '7'], ['3', '0', '7']], [['3', '0', '7'], ['3', '0', '7']]];
  const groups = input.colorFits.slice(0, 2).map((group, groupIndex) => {
    const rows = group.rows.map((row, rowIndex) => {
      const cells: Record<string, StockCell> = Object.fromEntries(input.sizes.map((size, index) => {
        const original = row.cells[size.id]!;
        return [size.id, index < 3 && original.state === 'known' ? { ...original, quantity: quantities[groupIndex]![rowIndex]![index]! } : { state: 'not-applicable' }];
      }));
      return { warehouse: row.warehouse, cells, total: totalOf(Object.values(cells)) };
    });
    return { ...group, rows, sizeTotals: Object.fromEntries(input.sizes.map(size => [size.id, totalOf(rows.map(row => row.cells[size.id]!))])), total: totalOf(rows.flatMap(row => Object.values(row.cells))) };
  });
  const fixture = { ...input, colorFits: groups, sizeTotals: Object.fromEntries(input.sizes.map(size => [size.id, totalOf(groups.flatMap(group => group.rows.map(row => row.cells[size.id]!)))])), total: totalOf(groups.flatMap(group => group.rows.flatMap(row => Object.values(row.cells)))) };
  const [projected] = projectInventoryColors(fixture);
  assert.equal(projected!.rows.length, 2);
  assert.deepEqual(projected!.rows.map(row => input.sizes.slice(0, 3).map(size => { const cell = row.cells[size.id]!; return cell.state === 'known' && cell.quantity; })), [['1', '0', '14'], ['6', '0', '14']]);
  assert.deepEqual(projected!.rows.map(row => row.total.knownQuantity), ['15', '20']);
  assert.equal(fixture.total.knownQuantity, '35');
  assert.equal(projected!.total.knownQuantity, '35');
});

test('hidden FIT projects only real product/color/warehouse/size identities and retains every source', () => {
  const input = product();
  const before = structuredClone(input);
  const projected = projectInventoryColors(input);
  assert.equal(projected.length, 2);
  assert.deepEqual(projected.map(group => group.color.id), ['test-color-blue', 'test-color-gray']);
  const blue = projected[0]!;
  assert.equal(blue.fit, null);
  assert.deepEqual(blue.rows.map(row => row.warehouse.id), ['test-warehouse-main', 'test-warehouse-store']);
  assert.deepEqual(blue.sources, input.colorFits.slice(0, 2));
  assert.deepEqual(Object.keys(blue.rows[0]!.cells), input.sizes.map(size => size.id));
  const cell = blue.rows[0]!.cells['test-size-1']!;
  assert.equal(cell.state, 'known');
  if (cell.state !== 'known') throw new Error('Expected real SKU sources');
  assert.equal(cell.quantity, '1'); // -2 in Y + 3 in A, never clamp negatives.
  assert.equal('skuId' in cell, false, 'A display group is not a made-up SKU');
  const sources = knownDisplaySources(cell);
  assert.equal(sources.length, 2);
  assert.deepEqual(sources.map(source => source.fit.id), ['test-fit-Y', 'test-fit-A']);
  assert.equal(sources[0]!.cell, input.colorFits[0]!.rows[0]!.cells['test-size-1']);
  assert.equal(sources[1]!.cell, input.colorFits[1]!.rows[0]!.cells['test-size-1']);
  assert.ok(sources.every(source => source.productId === input.id && source.color.id === blue.color.id && source.warehouse.id === blue.rows[0]!.warehouse.id && source.size.id === 'test-size-1'));
  assert.equal(blue.rows[0]!.sources[0]!.row, input.colorFits[0]!.rows[0]);
  assert.deepEqual(input, before, 'Canonical facts, identities and totals are immutable');
  assert.equal(projected.reduce((sum, group) => sum + BigInt(group.total.knownQuantity), 0n).toString(), input.total.knownQuantity);
  for (const size of input.sizes) assert.equal(projected.reduce((sum, group) => sum + BigInt(group.sizeTotals[size.id]!.knownQuantity), 0n).toString(), input.sizeTotals[size.id]!.knownQuantity);
});

test('projection keeps exact large signed sums, zero and non-applicable source states', () => {
  const input = structuredClone(product());
  const [y, a] = input.colorFits;
  const yCells = y!.rows[0]!.cells as Record<string, StockCell>;
  const aCells = a!.rows[0]!.cells as Record<string, StockCell>;
  yCells['test-size-0'] = { state: 'known', skuId: 'EXACT-Y', quantity: '9007199254740993' };
  aCells['test-size-0'] = { state: 'known', skuId: 'EXACT-A', quantity: '-2' };
  yCells['test-size-1'] = { state: 'known', skuId: 'ZERO-Y', quantity: '-2' };
  aCells['test-size-1'] = { state: 'known', skuId: 'ZERO-A', quantity: '2' };
  yCells['test-size-2'] = { state: 'not-applicable' };
  aCells['test-size-2'] = { state: 'known', skuId: 'ONLY-A', quantity: '0' };
  yCells['test-size-3'] = { state: 'known', skuId: 'NEGATIVE-Y', quantity: '-5' };
  aCells['test-size-3'] = { state: 'known', skuId: 'NEGATIVE-A', quantity: '2' };
  const row = projectInventoryColors(input)[0]!.rows[0]!;
  assert.deepEqual(row.cells['test-size-0']!.state === 'known' && row.cells['test-size-0']!.quantity, '9007199254740991');
  assert.deepEqual(row.cells['test-size-1']!.state === 'known' && row.cells['test-size-1']!.quantity, '0');
  assert.deepEqual(row.cells['test-size-2']!.state === 'known' && row.cells['test-size-2']!.quantity, '0');
  assert.deepEqual(row.cells['test-size-3']!.state === 'known' && row.cells['test-size-3']!.quantity, '-3');
  assert.equal(row.cells['test-size-2']!.sources.length, 2, 'Explicit absent source fact is retained too');
  assert.deepEqual(knownDisplaySources(row.cells['test-size-2']!).map(source => source.cell.skuId), ['ONLY-A']);
  assert.equal(row.cells['test-size-7']!.state, 'not-applicable');
  assert.equal(row.total.knownQuantity, totalOf([...(Object.values(yCells)), ...Object.values(aCells)]).knownQuantity);
});

test('projection does not cross-join disjoint source warehouses and preserves first-seen source order', () => {
  const input = product();
  const [y, a] = input.colorFits;
  const sparse = { ...input, colorFits: [{ ...y!, rows: [y!.rows[1]!] }, { ...a!, rows: [a!.rows[0]!] }] };
  const projected = projectInventoryColors(sparse);
  assert.equal(projected.length, 1);
  assert.deepEqual(projected[0]!.rows.map(row => row.warehouse.id), ['test-warehouse-store', 'test-warehouse-main']);
  assert.ok(projected[0]!.rows.every(row => knownDisplaySources(row.cells['test-size-0']!).length === 1));
  const otherId = { ...sparse, id: 'OTHER-REAL-PRODUCT', code: sparse.code, name: sparse.name };
  assert.ok(knownDisplaySources(projectInventoryColors(otherId)[0]!.rows[0]!.cells['test-size-0']!).every(source => source.productId === 'OTHER-REAL-PRODUCT'));
});

test('missing, unknown, malformed integer and missing SKU sources never become a zero projection', () => {
  for (const invalid of [undefined, { state: 'unknown' }, { state: 'known', skuId: 'BAD', quantity: 'NaN' }, { state: 'known', skuId: '', quantity: '0' }]) {
    const input = structuredClone(product());
    (input.colorFits[0]!.rows[0]!.cells as Record<string, unknown>)['test-size-0'] = invalid;
    assert.throws(() => projectInventoryColors(input as InventoryProduct), /未完整核实|整数文本|SKU 身份缺失/);
  }
});
