import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOGUE_PRICE_KEYS } from '../../../../packages/application/src/catalogue-price-input.ts';
import { parseProductDetailsPageQuery } from '../../../../packages/application/src/product-details-query-validation.ts';
import { productBarcodesResponse, productPricesResponse, productStockResponse } from './product-page-validation.ts';
import { createProductFullPageHttpReader } from './product-page-http-reader.ts';
import { captureProductFullPageConfiguration } from './product-page-configuration.ts';
import { guardedProductPageReader } from './product-page-reader.ts';
import { ReadContext } from '../loading/read-scope.ts';
import { LatestQuery, type QueryRead } from '../loading/latest-query.ts';
import type { DictionarySchemeQuery } from '../../../../packages/application/src/dictionary-read-ports.ts';
import { HttpQueryError } from '../transport/http-query.ts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const productId = id(1);
const parameters = parseProductDetailsPageQuery({ productId, page: 1, pageSize: 50 });
const prices = () => ({ productId, version: 2, prices: Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key => [key, key === 'retail_price' ? '0.00' : null])) });
const barcodes = () => ({ productId, version: 2, page: 1, pageSize: 50, total: 1,
  defaultScheme: { state: 'UNAVAILABLE', reason: 'NO_PRODUCT_SCHEME_FIELD' },
  items: [{ id: id(2), barcode: '0001234567', skuId: id(3), skuCode: 'SKU-BLUE-A-S', colorId: id(4), fitId: id(5), sizeId: id(6), kind: 'CONFIRMED_OLD', schemeId: null, enabled: true }] });
const stock = () => ({ productId, page: 1, pageSize: 50, total: 5, items: ['KNOWN', 'UNKNOWN', 'MISSING', 'UNMAPPED', 'READ_FAILED'].map((state, n) => ({ warehouseId: id(7), warehouseName: '仓库', skuId: id(20 + n), state, quantity: state === 'KNOWN' ? '-9007199254740993' : null })) });

const skuPage = () => ({ kind: 'SKU_PAGE', productId, version: 2, page: 1, pageSize: 50, totalSkus: 1,
  defaultScheme: { state: 'NOT_SET' }, items: [{ skuId: id(3), skuCode: ' 000SKU ', skuEnabled: false,
    colorId: id(4), colorLabel: null, fitId: id(5), fitLabel: 'A版', sizeId: id(6), sizeLabel: '165/S',
    bindingCount: 0, main: null, disabledMainCount: 0, confirmedOldCount: 0, firstConfirmedOld: null }] });

test('P10 SKU mode response maps its frozen validator into the browser error contract and preserves null versus zero', () => {
  const query = { ...parameters, view: 'SKU' as const };
  const parsed = productBarcodesResponse(skuPage(), query)!;
  assert.equal(parsed.totalSkus, 1); assert.equal(parsed.items[0]!.skuCode, ' 000SKU ');
  assert.equal(parsed.items[0]!.skuEnabled, false); assert.equal(parsed.items[0]!.bindingCount, 0); assert.equal(parsed.items[0]!.colorLabel, null);
  assert.equal(productBarcodesResponse(null, query), null);
  assert.equal(productBarcodesResponse({ ...skuPage(), items: [], totalSkus: 0 }, query)!.totalSkus, 0);
  for (const [value, request] of [[barcodes(), query], [skuPage(), parameters], [{ ...skuPage(), productId: id(99) }, query]] as const) {
    assert.throws(() => productBarcodesResponse(value, request), (error: unknown) => error instanceof HttpQueryError && error.kind === 'malformed-response');
  }
});

test('P10 SKU detail echo and every record use the requested native SKU while old responses remain closed', () => {
  const query = { ...parameters, skuId: id(3) }, page = { ...barcodes(), skuId: id(3) };
  assert.equal(productBarcodesResponse(page, query)!.items[0]!.barcode, '0001234567');
  assert.equal(productBarcodesResponse(null, query), null);
  assert.equal(productBarcodesResponse({ ...page, total: 0, items: [] }, query)!.total, 0);
  assert.ok(!Object.hasOwn(productBarcodesResponse(barcodes(), parameters)!, 'skuId'));
  for (const value of [barcodes(), { ...page, skuId: id(99) }, { ...page, items: [{ ...page.items[0]!, skuId: id(99) }] }]) assert.throws(() => productBarcodesResponse(value, query));
  assert.throws(() => productBarcodesResponse(page, parameters));
});

test('P10 SKU LatestQuery HTTP branch preserves exact new modes and the original body with no construction request', async () => {
  const bodies: unknown[] = [];
  const reader = createProductFullPageHttpReader({ origin: 'https://erp.example', basePath: '/api', fetch: async (_url, options) => {
    const body = JSON.parse(String(options?.body)); bodies.push(body);
    return new Response(JSON.stringify(body.view === 'SKU' ? skuPage() : body.skuId ? { ...barcodes(), skuId: body.skuId } : barcodes()), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } }, ['barcodes']);
  assert.equal(bodies.length, 0);
  const context = new ReadContext({ accountId: id(50), sessionRevision: '1', permissionRevision: '1' }), scope = context.createScope('p10-new-http', productId);
  try {
    for (const query of [{ ...parameters, view: 'SKU' as const }, { ...parameters, skuId: id(3) }, parameters]) {
      const owner = new LatestQuery<typeof query, Awaited<ReturnType<NonNullable<typeof reader.barcodes>['read']>>>({ scope, execute: read => {
        assert.equal(Object.getPrototypeOf(read.parameters), null); assert.equal(Object.isFrozen(read.parameters), true);
        return reader.barcodes!.read(read);
      } });
      try { const result = await owner.run(query); assert.equal(result.status, 'success', `Real frozen null-prototype query chain failed before HTTP; captured calls=${bodies.length}`); }
      finally { owner.dispose(); }
    }
    assert.deepEqual(bodies, [{ ...parameters, view: 'SKU' }, { ...parameters, skuId: id(3) }, parameters]);
  } finally { context.clear(); }
});

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

test('P10 default scheme three closed variants preserve native FK, actual null and legacy absence', () => {
  for (const defaultScheme of [{state:'UNAVAILABLE',reason:'NO_PRODUCT_SCHEME_FIELD'},{state:'AVAILABLE',schemeId:id(8)},{state:'NOT_SET'}]) {
    const value={...barcodes(),defaultScheme};
    assert.deepEqual(productBarcodesResponse(value,parameters)!.defaultScheme,defaultScheme);
    assert.equal(productBarcodesResponse(value,parameters)!.items[0]!.barcode,'0001234567');
  }
  for (const defaultScheme of [null,{}, {state:'AVAILABLE'}, {state:'AVAILABLE',schemeId:null}, {state:'AVAILABLE',schemeId:'CURRENT'}, {state:'AVAILABLE',schemeId:id(8),reason:'NO_PRODUCT_SCHEME_FIELD'}, {state:'NOT_SET',schemeId:id(8)}, {state:'UNAVAILABLE',reason:'OTHER'}, {state:'UNAVAILABLE',reason:'NO_PRODUCT_SCHEME_FIELD',schemeId:id(8)}]) {
    assert.throws(()=>productBarcodesResponse({...barcodes(),defaultScheme},parameters));
  }
});

test('P10 scheme description is explicit own capability with no construction IO and current denial owner', async () => {
  const ctx=new ReadContext({accountId:id(100),sessionRevision:'1',permissionRevision:'1'}),scope=ctx.createScope('product',productId);
  let calls=0,notices=0,deny=false,rejectLate:((error:unknown)=>void)|null=null;
  const readBarcodeScheme=async (read:QueryRead<DictionarySchemeQuery>)=>{calls++;assert.equal(read.parameters.schemeId,id(8));if(deny)throw new HttpQueryError('forbidden','FORBIDDEN',403);if(calls===2)return await new Promise<null>((_,reject)=>{rejectLate=reject;});return null;};
  const plain={stylesheet:{load:async()=>{},dispose(){}},reader:{barcodes:{read:async()=>null}},allowedTabs:['barcodes'],initialTab:'barcodes'};
  assert.equal(captureProductFullPageConfiguration(plain).reader.barcodes!.schemeReader,undefined);
  const configured=captureProductFullPageConfiguration({...plain,reader:{barcodes:{read:async()=>null,schemeReader:{readBarcodeScheme}}}});
  assert.equal(calls,0);
  const reader=guardedProductPageReader(scope,configured.reader,()=>{notices++;assert.equal(scope.active,false);});
  const controller=new AbortController();
  const input={parameters:{schemeId:id(8)},identity:scope.identity,routeInstanceId:scope.routeInstanceId,entityId:productId,signal:controller.signal};
  assert.equal(await reader.barcodes!.schemeReader!.readBarcodeScheme(input),null);
  const pending=reader.barcodes!.schemeReader!.readBarcodeScheme(input);controller.abort();assert.ok(rejectLate);(rejectLate as (error:unknown)=>void)(new HttpQueryError('forbidden','FORBIDDEN',403));await assert.rejects(pending);assert.equal(notices,0);assert.equal(scope.active,true);
  deny=true;await assert.rejects(()=>reader.barcodes!.schemeReader!.readBarcodeScheme({...input,signal:new AbortController().signal}));assert.equal(notices,1);assert.equal(calls,3);ctx.clear();
});
