import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeCompactInventoryPage } from './compact-page.ts';
import { createCompactInventoryModel } from './compact-model.ts';
import { assertInventoryPage } from './model.ts';
import { InventoryWindowModel } from './windowing/model.ts';
import { testLayout, testViewport } from './windowing/fixtures.ts';
import { createInventoryRenderPlan } from './windowing/render-plan.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { InventoryParameters } from './contracts.ts';
// Explicit finite candidate protocol, not a real version/provider/HTTP/PG fixture.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = (value: string) => ({ knownQuantity: value, completeness: 'complete', unknownCells: 0 });
const parameters = (): InventoryParameters => ({ filter: { products: [], categories: [], warehouses: [], suppliers: [], fits: [], seasons: [] }, page: 1, pageSize: 100 });
const fixture = () => ({
  version: 'INVENTORY_COMPACT_PAGE_V1', readReference: 'SYNTHETIC_ONLY:READ:1', readVersion: 'SYNTHETIC_ONLY:INVENTORY:7', page: 1, pageSize: 100, exactTotalProducts: 2, allMatchesTotal: q('9007199254740991'),
  dictionary: {
    warehouses: [{ id: id(1), label: '已授权仓甲' }, { id: id(2), label: '已授权仓乙' }],
    sizeGroups: [{ id: id(10), label: '完整上衣组', sizes: [{ id: id(11), label: '165/S' }, { id: id(12), label: '170/M' }, { id: id(13), label: '175/L 无SKU' }] }, { id: id(14), label: '另一完整组', sizes: [{ id: id(15), label: '无尺码' }] }],
    colors: [{ id: id(20), label: '白色' }], fits: [{ id: id(21), label: 'Y版' }, { id: id(22), label: 'A版' }],
  },
  products: [{ id: id(30), code: '0001', name: '真实坐标的合成商品', categoryLabel: '分类', supplierLabel: '', seasonLabel: '', sizeGroupId: id(10), total: q('9007199254740991') }, { id: id(31), code: '0002', name: '零SKU商品仍在', categoryLabel: '', supplierLabel: '', seasonLabel: '', sizeGroupId: id(14), total: q('0') }],
  skuCoordinates: [{ skuId: id(40), productId: id(30), colorId: id(20), fitId: id(21), sizeId: id(11) }, { skuId: id(41), productId: id(30), colorId: id(20), fitId: id(22), sizeId: id(11) }, { skuId: id(42), productId: id(30), colorId: id(20), fitId: id(21), sizeId: id(12) }],
  balances: [{ warehouseId: id(1), skuId: id(40), quantity: '9007199254740993' }, { warehouseId: id(2), skuId: id(41), quantity: '-2' }, { warehouseId: id(2), skuId: id(42), quantity: '0' }],
  coverage: { state: 'complete', pageSkuCoordinates: 'complete', authorizedWarehouses: 'complete', balanceKeys: 'complete', absentBalance: 'KNOWN_ZERO_FOR_EXISTING_PAGE_SKU_ONLY' },
});
const rejected = (value: unknown, p = parameters()) => assert.throws(() => createCompactInventoryModel(value, p), error => error instanceof HttpQueryError && error.kind === 'malformed-response');
const address = (warehouse = 1, size = 11, fit = 21) => ({ productId: id(30), warehouseId: id(warehouse), colorId: id(20), fitId: id(fit), sizeId: id(size) });

test('finite complete page resolves exact SKU zero/negative/BigInt and full group NA without inventing variants', () => {
  const raw = fixture(), before = structuredClone(raw), wire = decodeCompactInventoryPage(raw, parameters()), model = createCompactInventoryModel(wire, parameters());
  assert.equal(model.readVersion, 'SYNTHETIC_ONLY:INVENTORY:7');
  assert.deepEqual(model.resolveCell(address()), { state: 'known', skuId: id(40), quantity: '9007199254740993' });
  assert.deepEqual(model.resolveCell(address(2, 11, 22)), { state: 'known', skuId: id(41), quantity: '-2' });
  assert.deepEqual(model.resolveCell(address(2)), { state: 'known', skuId: id(40), quantity: '0' }, 'missing sparse balance is zero only for real SKU and complete coverage');
  assert.deepEqual(model.resolveCell(address(2, 12)), { state: 'known', skuId: id(42), quantity: '0' }, 'explicit stored zero preserved');
  assert.deepEqual(model.resolveCell(address(1, 13)), { state: 'not-applicable' });
  assert.deepEqual(model.resolveCell(address(1, 12, 22)), { state: 'not-applicable' });
  assert.throws(() => model.resolveCell(address(99)), (error: unknown) => error instanceof HttpQueryError && error.code === 'COMPACT_CELL_OUTSIDE_LOADED_PAGE');
  assert.throws(() => model.resolveCell(address(1, 11, 99)), (error: unknown) => error instanceof HttpQueryError && error.code === 'COMPACT_CELL_OUTSIDE_LOADED_PAGE');
  assert.equal(model.page.products[0]!.sizes.length, 3); assert.equal(model.page.products[1]!.colorFits.length, 0);
  assert.equal(model.page.products[0]!.total.knownQuantity, '9007199254740991');
  assert.equal(model.page.products[0]!.colorFits[0]!.sizeTotals[id(12)]!.knownQuantity, '0');
  assertInventoryPage(model.page, parameters()); assert.deepEqual(raw, before);
  raw.balances[0]!.quantity = '9'; assert.equal((model.resolveCell(address()) as { quantity: string }).quantity, '9007199254740993', 'accepted model is detached from input mutation');
});

test('invalid version/dictionaries/coverage/references/duplicate keys/incomplete pages reject atomically', () => {
  const edits: ((v: ReturnType<typeof fixture>) => void)[] = [
    v => { v.readVersion = ''; }, v => { (v as unknown as { readVersion: null }).readVersion = null; }, v => { delete (v as Partial<typeof v>).readVersion; },
    v => { v.version = 'wrong'; }, v => { v.page = 2; }, v => { v.pageSize = 20; }, v => { v.exactTotalProducts = 3; },
    v => { v.coverage.state = 'unknown'; }, v => { v.coverage.pageSkuCoordinates = 'partial'; }, v => { v.coverage.authorizedWarehouses = 'partial'; }, v => { v.coverage.balanceKeys = 'partial'; }, v => { v.coverage.absentBalance = 'ASSUME_ZERO'; },
    v => { Object.assign(v.coverage, { basis: 'text is not proof' }); }, v => { v.dictionary.colors = []; }, v => { v.dictionary.fits = []; }, v => { v.dictionary.sizeGroups[0]!.sizes.pop(); v.skuCoordinates[0]!.sizeId = id(13); },
    v => { v.products[0]!.sizeGroupId = id(999); }, v => { v.balances[0]!.warehouseId = id(999); }, v => { v.balances[0]!.skuId = id(999); },
    v => { v.balances.push(v.balances[0]!); }, v => { v.skuCoordinates.push(v.skuCoordinates[0]!); }, v => { v.skuCoordinates.push({ ...v.skuCoordinates[0]!, skuId: id(999) }); },
    v => { v.dictionary.warehouses.push(v.dictionary.warehouses[0]!); }, v => { v.products[0]!.total = q('0'); }, v => { v.allMatchesTotal = q('0'); },
    v => { v.balances[0]!.quantity = '1.5'; }, v => { v.balances[0]!.quantity = 'NaN'; }, v => { v.balances[0]!.quantity = '01'; },
  ];
  for (const edit of edits) { const value = fixture(); edit(value); rejected(value); }
  rejected(null); rejected({ phase: 'loading' }); rejected({ phase: 'error' });
  const original = parameters(), filter = { ...original, filter: { ...original.filter, warehouses: [{ id: id(1), label: '客户端不作授权' }] } }; rejected(fixture(), filter);
});

test('window model uses the lazy page and keeps full-filter summary separate from current page', () => {
  for (const pageSize of [100, 200, 500] as const) {
    const p = { ...parameters(), pageSize }, wire = fixture(); wire.pageSize = pageSize;
    const model = createCompactInventoryModel(wire, p), product = model.page.products[0]!, row = product.colorFits[0]!.rows[0]!;
    assert.notEqual(row.cells[id(11)], row.cells[id(11)], 'virtual cells are ephemeral, no dense retained cache');
    assert.equal(Object.keys(row.cells).length, 3); assert.equal(Object.keys(row.cells).filter(s => row.cells[s]!.state === 'not-applicable').length, 1);
    const window = new InventoryWindowModel(model.page, { ...testLayout(), hideFit: true });
    const plan = createInventoryRenderPlan(window, testViewport(), 12, null); assert.ok(plan.sections.length);
    assert.equal(model.page.readReference, wire.readReference); assert.equal(model.page.warehouseLabels.join('/'), '已授权仓甲/已授权仓乙');
  }
  const p = { ...parameters(), page: 2 }, empty = fixture(); empty.page = 2; empty.exactTotalProducts = 100; empty.products = []; empty.skuCoordinates = []; empty.balances = []; empty.dictionary.sizeGroups = []; empty.dictionary.colors = []; empty.dictionary.fits = [];
  const model = createCompactInventoryModel(empty, p); assert.equal(model.page.products.length, 0); assert.equal(model.page.allMatchesTotal.knownQuantity, '9007199254740991', 'whole-filter total never replaced by empty current-page sum');
});

test('candidate bounded resources reject overflow rather than truncating', () => {
  const sizes = fixture(); sizes.dictionary.sizeGroups[0]!.sizes = Array.from({ length: 1001 }, (_, n) => ({ id: id(10000 + n), label: 'S' + n })); rejected(sizes);
  const skus = fixture(); skus.skuCoordinates = Array.from({ length: 50001 }, () => skus.skuCoordinates[0]!); rejected(skus);
  const balances = fixture(); balances.balances = Array.from({ length: 250001 }, () => balances.balances[0]!); rejected(balances);
  const work = fixture(); work.dictionary.warehouses = Array.from({ length: 1000 }, (_, n) => ({ id: id(100000 + n), label: 'W' + n })); work.dictionary.sizeGroups[0]!.sizes = Array.from({ length: 1000 }, (_, n) => ({ id: id(200000 + n), label: 'S' + n })); work.skuCoordinates[0]!.sizeId = id(200000); work.skuCoordinates[1]!.sizeId = id(200000); work.skuCoordinates[2]!.sizeId = id(200001); rejected(work);
});
