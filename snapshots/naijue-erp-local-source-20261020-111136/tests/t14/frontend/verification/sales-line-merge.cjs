const assert = require('node:assert/strict');
const M = require('../sales-model.js');
const K = require('../sales-core.js');

const product = (fitId = 'fit-a') => ({
  id: '026MS5133001', uuid: 'fixture-product', name: '针织衫', price: 898, unit: '件',
  fitId, fit: fitId === 'fit-a' ? 'A版（标准）' : 'B版',
  colorIds: ['gray'], colors: ['纯灰色'], sizeIds: ['165'], sizes: ['165/S'],
  skuByCell: { 'gray|165': 'sku-' + fitId },
});
const row = (changes = {}) => ({
  ...M.line(product(), 0, 0, 1, 89800),
  ...changes,
});
const doc = () => ({ businessType: '销售', lines: [] });

{
  const d = doc();
  const original = row({ quantity: 2 });
  M.add(d, original);
  M.add(d, row());
  assert.equal(d.lines.length, 1, '相同 SKU 与定价规则只保留一行');
  assert.equal(d.lines[0].quantity, 3);
  assert.equal(d.lines[0].id, original.id);
}

{
  const d = doc();
  const first = row({ quantity: 2 });
  const second = row({ colorId: 'other', color: '另一颜色' });
  d.lines.push(first, second);
  M.replace(d, second.id, { ...second, colorId: first.colorId, color: first.color });
  assert.equal(d.lines.length, 1, '编辑成相同明细后自动合并');
  assert.equal(d.lines[0].quantity, 3);
}

{
  const d = doc();
  M.add(d, row());
  M.add(d, row({ fitId: 'fit-b', fit: 'B版' }));
  M.add(d, row({ gift: true, priceCents: 0 }));
  M.add(d, row({ priceCents: 80000 }));
  M.add(d, row({ pricingRule: 'discount', discountTenths: 100 }));
  assert.equal(d.lines.length, 5, '不同版型、赠品、价格和折扣规则须分行');
}

{
  const d = doc();
  M.add(d, row({ note: '门店预订' }));
  M.add(d, row({ note: '顾客自提' }));
  assert.equal(d.lines.length, 1, '备注不同不应拆开相同销售明细');
  assert.equal(d.lines[0].quantity, 2);
  assert.equal(d.lines[0].note, '门店预订；顾客自提', '合并时保留两条备注');
}

{
  const d = doc();
  M.add(d, row({ gift: true, priceCents: 0, pricingRule: 'discount', discountTenths: 80, previousPrice: 71840 }));
  M.add(d, row({ gift: true, priceCents: 0, previousPrice: 89800 }));
  assert.equal(d.lines.length, 1, '相同赠品不因原销售折扣不同而分行');
  assert.equal(d.lines[0].quantity, 2);
  assert.equal(d.lines[0].previousPrice, null, '合并后不擅自恢复其中一笔原价');
}

{
  const d = doc();
  const gift = row({ gift: true, priceCents: 0 });
  d.lines.push(gift);
  const records = [];
  M.scan(d, product(), 0, 0, records, 'BARCODE');
  assert.equal(d.lines.length, 2, '扫码不应把正常销售累加到赠品行');
  assert.equal(gift.quantity, 1);
  assert.equal(d.lines.find(line => !line.gift).quantity, 1);
}

{
  const d = doc();
  d.lines.push(row({ quantity: 2 }), row({ quantity: 1 }));
  assert.equal(M.collapse(d).ok, true);
  assert.equal(d.lines.length, 1);
  assert.equal(d.lines[0].quantity, 3);
}

{
  const d = doc();
  d.lines.push(row({ quantity: 99999 }), row({ quantity: 1 }));
  assert.match(M.collapse(d).error, /99999/);
  assert.deepEqual(d.lines.map(line => line.quantity), [99999, 1], '数量溢出时不能部分合并');
}

{
  const d = { ...M.fresh(), date: '2026-09-29', storeId: 'hall-a', warehouseId: 'hall-a-warehouse', customerId: 'customer', salespersonId: 'staff', lines: [row()] };
  const catalog = { stores: [{ id: 'hall-a', enabled: true }], customers: [{ id: 'customer', enabled: true, usage: ['customer'] }], staff: [{ id: 'staff', storeId: 'hall-a', enabled: true, employmentStatus: '在职', role: '营业员' }], payments: [] };
  const warehouses = [{ id: 'hall-a-warehouse', storeId: 'hall-a', enabled: true }, { id: 'hall-b-warehouse', storeId: 'hall-b', enabled: true }];
  assert.equal(K.validation(d, catalog, warehouses.map(x => x.id), warehouses), '');
  assert.equal(K.validation({ ...d, warehouseId: 'hall-b-warehouse' }, catalog, warehouses.map(x => x.id), warehouses), '', '正常出库仓可跨营业厅选择');
  assert.match(K.validation({ ...d, warehouseId: 'missing-warehouse' }, catalog, warehouses.map(x => x.id), warehouses), /正常出库仓/);
  assert.match(K.validation({ ...d, warehouseId: 'hall-b-warehouse' }, catalog, ['hall-a-warehouse'], warehouses.map(x => ({ ...x, enabled: x.id !== 'hall-b-warehouse' }))), /正常出库仓/);
  assert.equal(K.validation(d, { ...catalog, staff: [{ ...catalog.staff[0], storeId: 'hall-b', role: '管理员' }] }, warehouses.map(x => x.id), warehouses), '', '在职人员可跨营业厅选择');
  assert.match(K.validation(d, { ...catalog, staff: [{ ...catalog.staff[0], employmentStatus: '离职' }] }, warehouses.map(x => x.id), warehouses), /在职营业员/);
  assert.match(K.validation(d, { ...catalog, customers: [{ ...catalog.customers[0], usage: ['supplier'] }] }, warehouses.map(x => x.id), warehouses), /正常客户/);
}

console.log('sales-line-merge: OK');

// Correcting a price through the identity editor must replace its old input validation.
{
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '..', 'sales-current.js'), 'utf8');
  const start = source.indexOf('function confirmIdentity()'), end = source.indexOf('function entryRow(', start);
  assert(start >= 0 && end > start);
  const original = row({ priceCents: null });
  const d = { lines: [original] };
  const U = {
    identityEdit: { id: original.id, query: product().id, draft: { ...original, priceCents: 44900 } },
    rawPrices: { [original.id]: 'bad', unrelated: 'still invalid' },
    priceErrors: { [original.id]: true, unrelated: true }, error: '',
  };
  const ctx = vm.createContext({
    U, M, p: () => product(), window: { REAL_DATA_MODE: true },
    entryDoc: () => d, mapMergedRecords() {}, repaintLines() {},
    $: () => ({ textContent: '' }),
  });
  for (const file of ['product-identity.js', 'product-finder.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx, { filename: file });
  ctx.window.PRODUCT_IDENTITY.install({ version: 1, productCodes: [], products: [{ productId: 'fixture-product', code: product().id }],
    skus: [{ skuId: 'sku-fit-a', productId: 'fixture-product', productCode: product().id, fitId: 'fit-a', enabled: true, codes: [],
      options: { COLOR: { id: 'gray' }, SIZE: { id: '165' } } }] });
  ctx.PRODUCT_FINDER = ctx.window.PRODUCT_FINDER;
  assert.equal(ctx.PRODUCT_FINDER.validSpec(product(), 0, 0), true);
  assert.equal(ctx.PRODUCT_FINDER.validSpec({ ...product(), uuid: 'wrong-product' }, 0, 0), false, '身份校验拒绝其他商品的 SKU');
  const syncStart = source.indexOf('function syncLineSku('), syncEnd = source.indexOf('\n', syncStart);
  assert(syncStart >= 0 && syncEnd > syncStart, '实际 SKU 同步函数须存在');
  vm.runInContext(source.slice(syncStart, syncEnd) + '\n' + source.slice(start, end) + '\nglobalThis.confirmIdentity=confirmIdentity;', ctx);
  ctx.confirmIdentity();
  assert.equal(d.lines[0].priceCents, 44900);
  assert.equal(d.lines[0].skuId, 'sku-fit-a', '接受价格修正时仍保持对应 SKU');
  assert.equal(U.identityEdit, null);
  assert.equal(U.rawPrices[original.id], undefined, 'the accepted price replaces the old invalid input');
  assert.equal(U.priceErrors[original.id], undefined, 'an accepted price correction must allow save and audit');
  assert.equal(U.priceErrors.unrelated, true, 'unrelated validation errors remain');
  U.identityEdit = { id: original.id, query: product().id, draft: { ...d.lines[0], priceCents: null } };
  U.rawPrices[original.id] = 'bad'; U.priceErrors[original.id] = true;
  ctx.confirmIdentity();
  assert(U.identityEdit, 'invalid replacements remain in the editor');
  assert.equal(U.priceErrors[original.id], true, 'rejected corrections keep validation');
}
console.log('sales-identity-price-correction: OK');
