import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOGUE_PRICE_KEYS } from '../../../../packages/application/src/catalogue-price-input.ts';
import { parseProductDetailsPageQuery } from '../../../../packages/application/src/product-details-query-validation.ts';
import { productBarcodesResponse, productPricesResponse, productStockResponse } from './product-page-validation.ts';
import { createProductFullPageHttpReader } from './product-page-http-reader.ts';
import { captureProductFullPageConfiguration } from './product-page-configuration.ts';
import { guardedProductPageReader } from './product-page-reader.ts';
import { ReadContext } from '../loading/read-scope.ts';
import { LatestQuery } from '../loading/latest-query.ts';
import { HttpQueryError } from '../transport/http-query.ts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const productId = id(1);
const parameters = parseProductDetailsPageQuery({ productId, page: 1, pageSize: 50 });
const prices = () => ({ productId, version: 2, prices: Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key => [key, key === 'retail_price' ? '0.00' : null])) });
const barcodes = () => ({ productId, version: 2, page: 1, pageSize: 50, total: 1,
  defaultScheme: { state: 'UNAVAILABLE', reason: 'NO_PRODUCT_SCHEME_FIELD' },
  items: [{ id: id(2), barcode: '0001234567', skuId: id(3), skuCode: 'SKU-BLUE-A-S', colorId: id(4), fitId: id(5), sizeId: id(6), kind: 'CONFIRMED_OLD', schemeId: null, enabled: true }] });
const stock = () => ({ productId, page: 1, pageSize: 50, total: 5, items: ['KNOWN', 'UNKNOWN', 'MISSING', 'UNMAPPED', 'READ_FAILED'].map((state, n) => ({ warehouseId: id(7), warehouseName: '仓库', skuId: id(20 + n), state, quantity: state === 'KNOWN' ? '-9007199254740993' : null })) });

test('nine explicit exact yuan fields preserve null and zero; missing/extra/number/fraction rejects', () => {
  const data = productPricesResponse(prices(), { productId })!;
  assert.equal(data.prices.retail_price, '0.00'); assert.equal(data.prices.purchase_price, null);
  const missing = prices(); delete missing.prices.minimum_price;
  const numeric = prices(); (numeric.prices as Record<string, unknown>).retail_price = 0;
  const fraction = prices(); fraction.prices.retail_price = '1.001';
  for (const bad of [missing, numeric, fraction, { ...prices(), prices: { ...prices().prices, sku_price: '1.00' } }, { ...prices(), productId: id(99) }]) assert.throws(() => productPricesResponse(bad, { productId }));
});
test('raw leading-zero old barcode and absence of product scheme are not inferred or normalized', () => {
  assert.equal(productBarcodesResponse(barcodes(), parameters)!.items[0]!.barcode, '0001234567');
  assert.throws(() => productBarcodesResponse({ ...barcodes(), defaultScheme: { state: 'KNOWN', schemeId: id(8) } }, parameters));
  assert.throws(() => productBarcodesResponse({ ...barcodes(), total: 2 }, parameters));
  const duplicate = barcodes(); duplicate.total = 2; duplicate.items.push({ ...duplicate.items[0]!, id: id(99) });
  assert.throws(() => productBarcodesResponse(duplicate, parameters));
});
test('warehouse/SKU stock preserves five distinct states and never fills a missing quantity', () => {
  const data = productStockResponse(stock(), parameters)!;
  assert.equal(data.items[0]!.quantity, '-9007199254740993'); assert.equal(data.items[1]!.state, 'UNKNOWN');
  for (const state of ['UNKNOWN', 'MISSING', 'UNMAPPED', 'READ_FAILED']) assert.throws(() => productStockResponse({ ...stock(), total: 1, items: [{ ...stock().items[0], state, quantity: '0' }] }, parameters));
  assert.throws(() => productStockResponse({ ...stock(), total: 1, items: [{ ...stock().items[0], state: 'KNOWN', quantity: null }] }, parameters));
  const zero = { ...stock(), total: 1, items: [{ ...stock().items[0], quantity: '0' }] };
  assert.equal(productStockResponse(zero, parameters)!.items[0]!.quantity, '0');
});
test('explicit new tab opt-in has no construction IO and sends only the target/page fields', async () => {
  const ctx = new ReadContext({ accountId: id(100), sessionRevision: '1', permissionRevision: '1' }), scope = ctx.createScope('product', productId);
  const calls: { path: string; body: unknown }[] = [];
  const options = { origin: 'https://erp.example', basePath: '/api', fetch: async (path: string, init: RequestInit) => {
    calls.push({ path, body: JSON.parse(init.body as string) });
    const value = path.endsWith('/prices/query') ? prices() : path.endsWith('/barcodes/query') ? barcodes() : stock();
    return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
  } };
  const old = createProductFullPageHttpReader(options); assert.equal(old.prices, undefined); assert.equal(old.stock, undefined);
  const reader = createProductFullPageHttpReader(options, ['prices', 'barcodes', 'stock']); assert.equal(calls.length, 0);
  const query = new LatestQuery<typeof parameters, ReturnType<typeof productBarcodesResponse>>({ scope, execute: read => reader.barcodes!.read(read) });
  assert.equal((await query.run(parameters)).status, 'success');
  assert.deepEqual(calls, [{ path: 'https://erp.example/api/products/barcodes/query', body: parameters }]);
  ctx.clear();
});
test('six-tab config captures own methods without invoking getters or granting other tabs', () => {
  const options = { origin: 'https://erp.example', basePath: '/api', fetch: async () => { throw new Error('No construction IO'); } };
  const reader = createProductFullPageHttpReader(options, ['prices']);
  const config = captureProductFullPageConfiguration({ stylesheet: { load: async () => {}, dispose: () => {} }, reader, allowedTabs: ['base', 'specs', 'prices', 'images'], initialTab: 'prices' });
  assert.ok(config.reader.prices); assert.equal(config.reader.stock, undefined);
  let getters = 0; const malicious = Object.defineProperty({}, 'read', { enumerable: true, get() { getters++; return () => null; } });
  assert.throws(() => captureProductFullPageConfiguration({ ...config, reader: { prices: malicious } })); assert.equal(getters, 0);
});
test('new page capabilities preserve current denial clearing and independently scoped aborts', async () => {
  const ctx = new ReadContext({ accountId: id(100), sessionRevision: '1', permissionRevision: '1' }), scope = ctx.createScope('product', productId); let notices = 0;
  const reader = guardedProductPageReader(scope, { prices: { read: async () => { throw new HttpQueryError('forbidden', 'FORBIDDEN', 403); } } }, () => { notices++; assert.equal(scope.active, false); });
  await assert.rejects(() => reader.prices!.read({ parameters: { productId }, signal: scope.signal, entityId: productId, identity: scope.identity, routeInstanceId: scope.routeInstanceId }));
  assert.equal(notices, 1); ctx.clear();
});
