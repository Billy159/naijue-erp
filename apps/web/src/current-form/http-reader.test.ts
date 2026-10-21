import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentFormHttpReader } from './http-reader.ts';
import { entityId } from '../../../../packages/domain/src/values.ts';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const hall = entityId('hall', uuid(1)), method = entityId('paymentMethod', uuid(2)), productId = entityId('product', uuid(3)), skuId = entityId('sku', uuid(4));
const reference = { kind: 'hall' as const, hallId: null, search: '', page: 1, pageSize: 20 as const };
const productQuery = { context: { kind: 'TRANSFER' as const }, search: '', page: 1, pageSize: 20 as const };
const item = { id: hall, name: '完整厅名', code: null, hallId: hall, hallName: '完整厅名', paymentMethodId: null, paymentMethodName: null };
const product = { id: productId, code: 'ORIGINAL', name: '完整商品', retailPrice: null, minimumPriceAvailability: 'UNAVAILABLE' };
const sku = { id: skuId, skuCode: 'ORIGINAL SKU', productId, productCode: 'ORIGINAL', productName: '完整商品', colorId: uuid(5), colorName: '红', fitId: uuid(6), fitName: '修身', sizeId: uuid(7), sizeName: '165/S', sizeGroupId: uuid(8), barcodeAvailability: 'UNAVAILABLE' };
const page = (items: unknown[], other = {}) => ({ page: 1, pageSize: 20, exactTotal: String(items.length), items, ...other });
const signal = () => new AbortController().signal;
function setup(response: unknown, status = 200) {
 const requests: { url: string; init: RequestInit }[] = [];
 const reader = createCurrentFormHttpReader({ origin: 'https://erp.example', basePath: '/api', fetch: async (url, init) => {
  requests.push({ url, init }); return new Response(JSON.stringify(response), { status, headers: { 'content-type': 'application/json' } });
 } }); return { reader, requests };
}
test('CURRENT browser proposals: construction inert; strict body and same-origin session request', async () => {
 const f = setup(page([item])); assert.equal(f.requests.length, 0);
 const result = await f.reader.readSalesReferences(reference, signal()); assert.equal(result.exactTotal, 1n); assert.ok(Object.isFrozen(result.items));
 const request = f.requests[0]!; assert.equal(request.url, 'https://erp.example/api/current-form/sales-references/query');
 assert.equal(request.init.credentials, 'same-origin'); assert.equal(request.init.mode, 'same-origin'); assert.equal(request.init.cache, 'no-store');
 assert.deepEqual(JSON.parse(request.init.body as string), reference);
});
test('CURRENT browser proposals: invalid query and preabort never fetch, no browser actor authority', async () => {
 const f = setup(page([]));
 assert.throws(() => f.reader.readSalesReferences({ ...reference, actor: { accountId: hall } } as never, signal()));
 const controller = new AbortController(); controller.abort();
 await assert.rejects(() => f.reader.readSalesReferences(reference, controller.signal), { kind: 'aborted' }); assert.equal(f.requests.length, 0);
});
test('CURRENT browser proposals: account identity/selected method/availability must match', async () => {
 const query = { ...reference, kind: 'paymentAccount' as const, hallId: hall, paymentMethodId: method };
 const account = { ...item, id: uuid(9), hallId: null, hallName: null, paymentMethodId: method, paymentMethodName: '现金' };
 const f = setup(page([account], { recommendationAvailability: 'UNAVAILABLE' }));
 assert.equal((await f.reader.readSalesReferences(query, signal())).recommendationAvailability, 'UNAVAILABLE');
 for (const value of [page([account]), page([{ ...account, paymentMethodId: uuid(99) }], { recommendationAvailability: 'AVAILABLE' }), page([account], { recommendationAvailability: 'UNKNOWN' })]) {
  await assert.rejects(() => setup(value).reader.readSalesReferences(query, signal()), { kind: 'malformed-response' });
 }
});
test('CURRENT browser proposals: staff may belong another hall without being filtered client-side', async () => {
 const f = setup(page([{ ...item, id: uuid(9), hallId: uuid(99), hallName: '另一厅' }]));
 const r = await f.reader.readSalesReferences({ ...reference, kind: 'salesperson', hallId: hall }, signal()); assert.equal(r.items.length, 1);
});
test('CURRENT browser proposals: exact bigint counts, count-page consistency, unknown keys and IDs rejected', async () => {
 const twenty = Array.from({ length: 20 }, (_, i) => ({ ...item, id: uuid(i + 20), hallId: uuid(i + 20) }));
 assert.equal((await setup(page(twenty, { exactTotal: '9007199254740993' })).reader.readSalesReferences(reference, signal())).exactTotal, 9007199254740993n);
 assert.equal((await setup(page([item], { page: 2, exactTotal: '21' })).reader.readSalesReferences({ ...reference, page: 2 }, signal())).items.length, 1);
 for (const value of [page([item], { page: 2 }), page([item], { exactTotal: 1 }), page([item], { exactTotal: '01' }), page([item], { exactTotal: '2' }),
  page([item, item]), page([{ ...item, id: 'fake' }]), page([{ ...item, secret: 'private' }]), page([item], { grantedRole: 'ADMIN' }),
  page([item], { recommendationAvailability: 'AVAILABLE' })]) await assert.rejects(() => setup(value).reader.readSalesReferences(reference, signal()), { kind: 'malformed-response' });
});
test('CURRENT browser proposals: product zero distinct from unknown, no invented minima', async () => {
 assert.equal((await setup(page([product])).reader.readProducts(productQuery, signal())).items[0]!.retailPrice, null);
 assert.equal((await setup(page([{ ...product, retailPrice: '0.00' }])).reader.readProducts(productQuery, signal())).items[0]!.retailPrice, '0.00');
 for (const change of [{ retailPrice: 0 }, { retailPrice: '1.234' }, { minimumPriceAvailability: 'AVAILABLE' }, { minimumPrice: '0.00' }])
  await assert.rejects(() => setup(page([{ ...product, ...change }])).reader.readProducts(productQuery, signal()), { kind: 'malformed-response' });
});
test('CURRENT browser proposals: SKU page binds product and batch binds exact order/set', async () => {
 const query = { context: productQuery.context, productId, page: 1, pageSize: 20 as const };
 assert.equal((await setup(page([sku])).reader.readProductSkus(query, signal())).items[0]!.sizeName, '165/S');
 await assert.rejects(() => setup(page([{ ...sku, productId: uuid(99) }])).reader.readProductSkus(query, signal()), { kind: 'malformed-response' });
 const batch = { context: productQuery.context, skuIds: [skuId, entityId('sku', uuid(10))] };
 const second = { ...sku, id: uuid(10) };
 assert.equal((await setup([sku, second]).reader.readSkuBatch(batch, signal())).length, 2);
 for (const items of [[second, sku], [sku], [sku, sku], [sku, { ...second, barcodeAvailability: 'AVAILABLE' }]])
  await assert.rejects(() => setup(items).reader.readSkuBatch(batch, signal()), { kind: 'malformed-response' });
});
test('CURRENT browser proposals: transfer source may be disabled with stock, target must enabled', async () => {
 const warehouse = { id: uuid(11), name: '仓', hallId: hall, hallName: '厅', enabled: false, hallEnabled: false, hasNonzeroInventory: true };
 const query = { direction: 'FROM' as const, search: '', page: 1, pageSize: 20 as const };
 assert.equal((await setup(page([warehouse])).reader.readTransferWarehouses(query, signal())).items.length, 1);
 await assert.rejects(() => setup(page([{ ...warehouse, hasNonzeroInventory: false }])).reader.readTransferWarehouses(query, signal()), { kind: 'malformed-response' });
 await assert.rejects(() => setup(page([warehouse])).reader.readTransferWarehouses({ ...query, direction: 'TO' }, signal()), { kind: 'malformed-response' });
});
test('CURRENT browser proposals: HTTP conflicts stay safe and no retry occurs', async () => {
 const f = setup({ error: { code: 'SKU_UNAVAILABLE', message: 'PRIVATE DATA' } }, 409);
 await assert.rejects(() => f.reader.readSkuBatch({ context: productQuery.context, skuIds: [skuId] }, signal()), error => {
  assert.ok(error instanceof Error); assert.equal((error as Error & { kind: string }).kind, 'conflict'); assert.ok(!error.message.includes('PRIVATE')); return true;
 }); assert.equal(f.requests.length, 1);
});
test('CURRENT browser proposals: payment method references retain native identity and no account metadata', async () => {
 const query = { ...reference, kind: 'paymentMethod' as const, hallId: hall };
 const methodItem = { id: method, name: '原始收款方式', code: null, hallId: null, hallName: null, paymentMethodId: null, paymentMethodName: null };
 assert.equal((await setup(page([methodItem])).reader.readSalesReferences(query, signal())).items[0]!.id, method);
 await assert.rejects(() => setup(page([{ ...methodItem, paymentMethodId: method, paymentMethodName: '猜补' }])).reader.readSalesReferences(query, signal()), { kind: 'malformed-response' });
});
