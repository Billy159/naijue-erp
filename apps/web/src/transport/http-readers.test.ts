import assert from 'node:assert/strict';
import test from 'node:test';
import type { CandidateParameters, InventoryPage, InventoryParameters } from '../inventory/contracts.ts';
import { emptyInventoryFilter } from '../inventory/contracts.ts';
import { createInventoryQuery } from '../inventory/model.ts';
import type { ProductBasics, ProductSpecifications } from '../inventory/product-contracts.ts';
import type { QueryRead } from '../loading/latest-query.ts';
import { ReadContext } from '../loading/read-scope.ts';
import { createHttpJsonQuery } from './http-query.ts';
import { createInventoryHttpReader, createProductHttpReader, HttpQueryError, type HttpQueryOptions, type QueryFetch } from './index.ts';

const origin = 'https://erp.example.test';
const identity = { accountId: 'TEST-ACCOUNT', sessionRevision: 'TEST-SESSION', permissionRevision: 'TEST-PERMISSION' };
const inventoryParameters = (): InventoryParameters => ({ filter: emptyInventoryFilter(), page: 1, pageSize: 100 });
const candidateParameters: CandidateParameters = { kind: 'product', search: '完整标签', page: 1, pageSize: 20, selectedIds: [], categoryId: null };
const target = { productId: '00000000-0000-4000-8000-000000000001' };
const imageTarget = { ...target, imageId: '00000000-0000-4000-8000-000000000002' };
const basics: ProductBasics = { ...target, code: 'TEST-001', name: '测试商品', categoryLabel: null, yearLabel: null, seasonLabel: '原始季节标签', supplierLabel: null, systemCode: null };
const specs: ProductSpecifications = { ...target, sizeGroup: { id: 'group', label: '上衣' }, colors: [{ id: 'blue', label: '蓝' }],
  fits: [{ id: 'Y', label: 'Y版（修身）' }, { id: 'A', label: 'A版（标准）' }], sizes: [{ id: 'size', label: '165/S' }],
  skus: [{ id: 'sku-Y', colorId: 'blue', fitId: 'Y', sizeId: 'size' }, { id: 'sku-A', colorId: 'blue', fitId: 'A', sizeId: 'size' }] };
function read<P>(parameters: P, controller = new AbortController()): QueryRead<P> {
  return { parameters, identity, signal: controller.signal, routeInstanceId: 'TEST-ROUTE', entityId: null };
}
function json(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } }); }
function options(fetch: QueryFetch, extra: Partial<HttpQueryOptions> = {}): HttpQueryOptions { return { fetch, origin, basePath: '/api', ...extra }; }
function inventoryPage(): InventoryPage {
  const total = { knownQuantity: '-9007199254740993', completeness: 'incomplete' as const, unknownCells: 1 };
  const totals = { s1: { knownQuantity: '-9007199254740993', completeness: 'complete' as const, unknownCells: 0 },
    s2: { knownQuantity: '0', completeness: 'complete' as const, unknownCells: 0 },
    s3: { knownQuantity: '0', completeness: 'incomplete' as const, unknownCells: 1 },
    s4: { knownQuantity: '0', completeness: 'complete' as const, unknownCells: 0 } };
  return { page: 1, pageSize: 100, exactTotalProducts: 1, warehouseLabels: ['授权仓库完整标签'], readReference: 'TEST-READ', allMatchesTotal: total,
    products: [{ id: target.productId, code: 'TEST-001', name: '测试商品', categoryLabel: '分类', supplierLabel: '供应商', seasonLabel: '季节',
      sizeGroup: { id: 'group', label: '上衣组' }, sizes: [{ id: 's1', label: '165/S' }, { id: 's2', label: '170/M' }, { id: 's3', label: '175/L' }, { id: 's4', label: '180/XL' }],
      colorFits: [{ color: { id: 'blue', label: '蓝' }, fit: { id: 'Y', label: 'Y版（修身）' }, total, sizeTotals: totals,
        rows: [{ warehouse: { id: 'warehouse', label: '授权仓库完整标签' }, total,
          cells: { s1: { state: 'known', skuId: 'sku-1', quantity: '-9007199254740993' }, s2: { state: 'known', skuId: 'sku-2', quantity: '0' },
            s3: { state: 'unknown', skuId: 'sku-3', reason: '来源覆盖尚未核实' }, s4: { state: 'not-applicable' } } }] }], sizeTotals: totals, total }] };
}
function errorKind(kind: HttpQueryError['kind'], code?: string, status?: number): (error: unknown) => boolean {
  return error => { assert.ok(error instanceof HttpQueryError); assert.equal(error.kind, kind);
    if (code) assert.equal(error.code, code); if (status !== undefined) assert.equal(error.status, status); return true; };
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function flush(): Promise<void> { await new Promise<void>(resolve => setImmediate(resolve)); }

test('constructors are inert; exact same-origin POSTs use session credentials/no-store and only projected DTO fields', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: QueryFetch = async (url, init) => { calls.push({ url, init }); return json(url.endsWith('/candidates/query')
    ? { items: [{ id: target.productId, label: '完整标签', disabled: false, parentLabel: '父分类', depth: 1 }], exactTotal: 1, page: 1 } : inventoryPage()); };
  const reader = createInventoryHttpReader(options(fetch)); assert.equal(calls.length, 0);
  const parameters = { ...inventoryParameters(), actor: { role: 'admin' }, identity: { accountId: 'untrusted' } };
  const result = await reader.readInventory(read(parameters));
  assert.deepEqual(result, inventoryPage());
  assert.equal(result.products[0]!.sizes[0]!.label, '165/S');
  assert.equal(result.products[0]!.colorFits[0]!.rows[0]!.cells.s1!.state, 'known');
  assert.deepEqual(JSON.parse(calls[0]!.init.body as string), inventoryParameters());
  assert.equal(calls[0]!.url, `${origin}/api/inventory/query`);
  const init = calls[0]!.init;
  assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'same-origin'); assert.equal(init.mode, 'same-origin');
  assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal);
  assert.deepEqual(init.headers, { Accept: 'application/json', 'Content-Type': 'application/json' });
  await reader.readCandidates(read(candidateParameters));
  assert.equal(calls[1]!.url, `${origin}/api/inventory/candidates/query`);
  assert.deepEqual(JSON.parse(calls[1]!.init.body as string), candidateParameters); assert.equal(calls.length, 2);
});

test('base configuration rejects foreign/ambiguous URLs before any request and permits explicit root/prefix', async () => {
  let calls = 0; const fetch: QueryFetch = async () => { calls++; return json(null); };
  for (const bad of ['//other.example', 'https://other.example', '/api/../escape', '/api\\escape', '/api?x=1', '/api#hash', '/%2f%2fevil', '/api//x', '/api%2Fother', '/api x']) {
    assert.throws(() => createInventoryHttpReader(options(fetch, { basePath: bad })), TypeError);
  }
  for (const bad of ['https://u:p@erp.example.test', `${origin}/path`, `${origin}/`, `${origin}?token=secret`, 'data:text/html,x', 'null']) {
    assert.throws(() => createProductHttpReader(options(fetch, { origin: bad })), TypeError);
  }
  for (const bad of [0, NaN, Infinity, 32 * 1024 * 1024 + 1]) assert.throws(() => createInventoryHttpReader(options(fetch, { maxResponseBytes: bad })), TypeError);
  assert.throws(() => createProductHttpReader(options(fetch, { timeoutMs: 0 })), TypeError);
  assert.equal(calls, 0);
  const urls: string[] = [];
  for (const basePath of ['', '/', '/api/', '/erp-v1/read_only']) {
    const reader = createProductHttpReader(options(async url => { urls.push(url); return json(null); }, { basePath }));
    assert.equal(await reader.readProductBasics(read(target)), null);
    assert.equal(new URL(urls.at(-1)!).origin, origin);
  }
});

test('product tabs and individual image read use four exact routes and no eager related reads', async () => {
  const calls: { url: string; body: unknown }[] = [];
  const reader = createProductHttpReader(options(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    return json(url.endsWith('/basics/query') ? basics : url.endsWith('/specifications/query') ? specs
      : url.endsWith('/images/query') ? { ...target, images: [] } : { ...imageTarget, url: 'https://media.example.test/original.png' });
  }));
  assert.equal(calls.length, 0);
  assert.deepEqual(await reader.readProductBasics(read({ ...target, role: 'admin' })), basics);
  assert.equal(calls.length, 1);
  const specifications = await reader.readProductSpecifications(read(target));
  assert.deepEqual(specifications, specs); assert.equal(specifications!.sizes[0]!.label, '165/S'); assert.equal(specifications!.skus.length, 2);
  assert.deepEqual(await reader.readProductImages(read(target)), { ...target, images: [] }); assert.equal(calls.length, 3);
  assert.deepEqual(await reader.readProductImage(read(imageTarget)), { ...imageTarget, url: 'https://media.example.test/original.png' });
  assert.deepEqual(calls.map(call => call.url.replace(`${origin}/api`, '')), ['/products/basics/query', '/products/specifications/query', '/products/images/query', '/products/image/query']);
  assert.deepEqual(calls.map(call => call.body), [target, target, target, imageTarget]);
});

test('HTTP 401/403/409/503 and capability failures remain distinct; safe known code only, no server details or automatic retries', async () => {
  const cases = [[401, 'unauthenticated', 'UNAUTHENTICATED'], [403, 'forbidden', 'FORBIDDEN'], [409, 'conflict', 'CONFLICT'],
    [503, 'unavailable', 'INVENTORY_NOT_READY'], [404, 'not-found', 'PRODUCT_IMAGE_NOT_FOUND'], [501, 'not-implemented', 'PRODUCT_MEDIA_NOT_IMPLEMENTED'],
    [400, 'invalid-request', 'INVALID_PRODUCT_QUERY'], [408, 'aborted', 'PRODUCT_READ_ABORTED'], [413, 'too-large', 'PRODUCT_READ_TOO_LARGE'], [500, 'http', 'INTERNAL_ERROR']] as const;
  let calls = 0;
  for (const [status, kind, code] of cases) {
    const reader = createProductHttpReader(options(async () => { calls++; return json({ error: { code, message: 'secret SQL account password diagnostic' } }, status); }));
    await assert.rejects(reader.readProductBasics(read(target)), error => {
      errorKind(kind, code, status)(error); assert.doesNotMatch(String(error), /secret|password|SQL/); assert.equal((error as Error).cause, undefined); return true;
    });
  }
  assert.equal(calls, cases.length);
  const reader = createProductHttpReader(options(async () => json({ error: { code: 'secret-exception-with-private-data', message: 'private detail' } }, 403)));
  await assert.rejects(reader.readProductBasics(read(target)), errorKind('forbidden', 'FORBIDDEN', 403));
  const html = createInventoryHttpReader(options(async () => new Response('<html>login</html>', { status: 401 })));
  await assert.rejects(html.readInventory(read(inventoryParameters())), errorKind('unauthenticated', 'UNAUTHENTICATED', 401));
});

test('network failure is sanitized and POST is never retried', async () => {
  let calls = 0;
  const reader = createInventoryHttpReader(options(async () => { calls++; throw new Error('private host, token and account diagnostic'); }));
  await assert.rejects(reader.readInventory(read(inventoryParameters())), error => {
    errorKind('network', 'NETWORK_ERROR')(error); assert.doesNotMatch(String(error), /private|token|account/); return true;
  });
  assert.equal(calls, 1);
});

test('malformed success is not an empty/zero success; invalid quantities, totals, fields, targets and media fail closed', async () => {
  const malformedInventory: unknown[] = [null, {}, { ...inventoryPage(), warehouseLabels: [42] }, { ...inventoryPage(), actor: 'leaked' },
    { ...inventoryPage(), page: 2 }, { ...inventoryPage(), exactTotalProducts: 2 }];
  const missing = structuredClone(inventoryPage()); delete (missing.products[0]!.colorFits[0]!.rows[0]!.cells as Record<string, unknown>).s3; malformedInventory.push(missing);
  const quantity = structuredClone(inventoryPage()); Object.assign(quantity.products[0]!.colorFits[0]!.rows[0]!.cells.s1!, { quantity: -9007199254740993 }); malformedInventory.push(quantity);
  const unknownZero = structuredClone(inventoryPage()); Object.assign(unknownZero.allMatchesTotal, { unknownCells: 0, completeness: 'complete' }); malformedInventory.push(unknownZero);
  for (const value of malformedInventory) {
    const reader = createInventoryHttpReader(options(async () => json(value)));
    await assert.rejects(reader.readInventory(read(inventoryParameters())), errorKind('malformed-response', 'INVALID_RESPONSE'));
  }
  for (const value of [undefined, { ...basics, productId: 'other' }, { ...basics, systemCode: '' }, { ...basics, yearLabel: 2026 }, { ...basics, privateField: 'leaked' }]) {
    const reader = createProductHttpReader(options(async () => json(value)));
    await assert.rejects(reader.readProductBasics(read(target)), errorKind('malformed-response'));
  }
  const unsafe = createProductHttpReader(options(async () => json({ ...target, images: [{ id: imageTarget.imageId, label: '图片', thumbnailUrl: 'javascript:alert(1)' }] })));
  await assert.rejects(unsafe.readProductImages(read(target)), errorKind('malformed-response'));
  const wrongImage = createProductHttpReader(options(async () => json({ ...imageTarget, imageId: 'other', url: 'https://media.example.test/x.png' })));
  await assert.rejects(wrongImage.readProductImage(read(imageTarget)), errorKind('malformed-response'));
});

test('candidate response verifies complete shape, exact page, labels, duplicates and option types', async () => {
  for (const value of [{ items: [], exactTotal: 1, page: 1 }, { items: [], exactTotal: 0, page: 2 }, { items: [{ id: 'a', label: '' }], exactTotal: 1, page: 1 },
    { items: [{ id: 'a', label: 'A', disabled: 'false' }], exactTotal: 1, page: 1 }, { items: [{ id: 'a', label: 'A', depth: 2 }], exactTotal: 1, page: 1 },
    { items: [{ id: 'a', label: 'A' }, { id: 'a', label: 'A' }], exactTotal: 2, page: 1 }]) {
    const reader = createInventoryHttpReader(options(async () => json(value)));
    await assert.rejects(reader.readCandidates(read(candidateParameters)), errorKind('malformed-response'));
  }
});

test('HTTP content, malformed UTF-8/JSON, unexpected empty success and observable redirects are rejected', async () => {
  const responses = [new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{', { headers: { 'Content-Type': 'application/json' } }), new Response(null, { status: 204 }),
    new Response(new Uint8Array([0xff]), { headers: { 'Content-Type': 'application/json' } })];
  for (const response of responses) {
    const reader = createProductHttpReader(options(async () => response));
    await assert.rejects(reader.readProductBasics(read(target)), errorKind('malformed-response'));
  }
  for (const overrides of [{ redirected: true }, { url: 'https://other.example.test/query' }, { url: `${origin}/sign-in` }]) {
    const response = json(basics); for (const [key, value] of Object.entries(overrides)) Object.defineProperty(response, key, { value });
    const reader = createProductHttpReader(options(async () => response));
    await assert.rejects(reader.readProductBasics(read(target)), errorKind('malformed-response', 'UNEXPECTED_REDIRECT'));
  }
});

test('decoded response stream and declared response size are bounded and cancelled, without truncating facts', async () => {
  let cancelled = 0;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(' '.repeat(100))); }, cancel() { cancelled++; } });
  const reader = createProductHttpReader(options(async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }), { maxResponseBytes: 16 }));
  await assert.rejects(reader.readProductBasics(read(target)), errorKind('too-large', 'RESPONSE_TOO_LARGE')); assert.equal(cancelled, 1);
  const declared = createProductHttpReader(options(async () => new Response('null', { headers: { 'Content-Type': 'application/json', 'Content-Length': '100' } }), { maxResponseBytes: 16 }));
  await assert.rejects(declared.readProductBasics(read(target)), errorKind('too-large', 'RESPONSE_TOO_LARGE'));
  const invalidLength = createProductHttpReader(options(async () => new Response('null', { headers: { 'Content-Type': 'application/json', 'Content-Length': 'private' } })));
  await assert.rejects(invalidLength.readProductBasics(read(target)), errorKind('malformed-response'));
});

test('request JSON size is bounded before fetch; full unmodified labels count as UTF-8 bytes', async () => {
  let calls = 0;
  const reader = createInventoryHttpReader(options(async () => { calls++; return json(inventoryPage()); }));
  const parameters = { ...inventoryParameters(), filter: { ...emptyInventoryFilter(), products: [{ id: 'a', label: '完整'.repeat(20_000) }] } };
  await assert.rejects(reader.readInventory(read(parameters)), errorKind('too-large', 'REQUEST_TOO_LARGE')); assert.equal(calls, 0);
});

test('caller cancellation forwards to fetch and detaches immediately even when mocked fetch ignores it', async () => {
  const controller = new AbortController(), pending = deferred<Response>(); let forwarded: AbortSignal | null | undefined;
  const reader = createProductHttpReader(options(async (_url, init) => { forwarded = init.signal; return pending.promise; }));
  const result = reader.readProductBasics(read(target, controller)); await flush(); controller.abort('private reason');
  await assert.rejects(result, errorKind('aborted', 'QUERY_ABORTED')); assert.equal(forwarded?.aborted, true);
  let cancelled = 0;
  pending.resolve(new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { 'Content-Type': 'application/json' } }));
  await flush(); assert.equal(cancelled, 1);
  const already = createProductHttpReader(options(async () => { throw new Error('must not call fetch'); }));
  await assert.rejects(already.readProductBasics(read(target, controller)), errorKind('aborted'));
});

test('stalled response body cancellation and total timeout are bounded', async () => {
  let cancelled = 0;
  const controller = new AbortController();
  const reader = createProductHttpReader(options(async () => new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { 'Content-Type': 'application/json' } })));
  const result = reader.readProductBasics(read(target, controller)); await flush(); controller.abort();
  await assert.rejects(result, errorKind('aborted')); assert.equal(cancelled, 1);
  let signal: AbortSignal | null | undefined;
  const timeout = createProductHttpReader(options(async (_url, init) => { signal = init.signal; return new Promise<Response>(() => {}); }, { timeoutMs: 10 }));
  await assert.rejects(timeout.readProductBasics(read(target)), errorKind('timeout', 'QUERY_TIMEOUT')); assert.equal(signal?.aborted, true);
  const bodyTimeout = createProductHttpReader(options(async () => new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { 'Content-Type': 'application/json' } }), { timeoutMs: 10 }));
  await assert.rejects(bodyTimeout.readProductBasics(read(target)), errorKind('timeout')); assert.equal(cancelled, 2);
});

test('LatestQuery retains old executed facts on HTTP failure and discards superseded/closed HTTP reads', async () => {
  const context = new ReadContext(identity), scope = context.createScope('HTTP-TEST');
  const first = deferred<Response>(), second = deferred<Response>(); let calls = 0;
  const reader = createInventoryHttpReader(options(async () => { calls++; if (calls === 1) return first.promise; if (calls === 2) return second.promise; return json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403); }));
  const query = createInventoryQuery(scope, reader);
  const old = query.run(inventoryParameters()); await flush();
  const current = query.run(inventoryParameters()); await flush(); second.resolve(json(inventoryPage()));
  assert.equal((await current).status, 'success'); assert.equal((await old).status, 'discarded');
  first.resolve(json({ ...inventoryPage(), readReference: 'OLD' })); await flush();
  assert.equal(query.getSnapshot().success!.data.readReference, 'TEST-READ');
  const previous = query.getSnapshot().success;
  assert.equal((await query.run(inventoryParameters())).status, 'error'); assert.equal(query.getSnapshot().success, previous);
  assert.equal((query.getSnapshot().error as HttpQueryError).kind, 'forbidden'); assert.equal(calls, 3);
  context.clear(); assert.equal(query.getSnapshot().phase, 'disposed'); assert.equal(query.getSnapshot().success, null);
  assert.equal((await query.run(inventoryParameters())).status, 'discarded'); assert.equal(calls, 3);
});


test('LatestQuery scope disposal cancels a pending HTTP body, clears facts and permits no late publication', async () => {
  const context = new ReadContext(identity), scope = context.createScope('CLOSING-HTTP-TEST');
  let calls = 0, cancelled = 0;
  const reader = createInventoryHttpReader(options(async () => {
    calls++;
    return calls === 1 ? json(inventoryPage()) : new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { 'Content-Type': 'application/json' } });
  }));
  const query = createInventoryQuery(scope, reader);
  assert.equal((await query.run(inventoryParameters())).status, 'success');
  const pending = query.run(inventoryParameters()); await flush(); context.clear();
  assert.equal((await pending).status, 'discarded'); await flush();
  assert.equal(cancelled, 1); assert.equal(query.getSnapshot().phase, 'disposed');
  assert.equal(query.getSnapshot().success, null); assert.equal(query.getSnapshot().error, null); assert.equal(calls, 2);
});


test('zero-byte chunk streams and oversized exact integer text also fail closed within technical bounds', async () => {
  let cancelled = 0, chunks = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { chunks++; controller.enqueue(new Uint8Array()); }, cancel() { cancelled++; } });
  const reader = createProductHttpReader(options(async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } })));
  await assert.rejects(reader.readProductBasics(read(target)), errorKind('too-large', 'RESPONSE_TOO_LARGE'));
  assert.equal(cancelled, 1); assert.ok(chunks <= 65_538);
  const page = structuredClone(inventoryPage()); Object.assign(page.products[0]!.colorFits[0]!.rows[0]!.cells.s1!, { quantity: '9'.repeat(101) });
  const inventory = createInventoryHttpReader(options(async () => json(page)));
  await assert.rejects(inventory.readInventory(read(inventoryParameters())), errorKind('malformed-response'));
});


function matrixPage(value = '1'): InventoryPage {
  const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
  const total = (value: string | bigint) => ({ knownQuantity: String(value), unknownCells: 0, completeness: 'complete' as const });
  const sum = total(BigInt(value) * 2n);
  return { page: 1, pageSize: 100, exactTotalProducts: 1, warehouseLabels: ['Warehouse 6', 'Warehouse 7'], readReference: 'read-1', allMatchesTotal: sum,
    products: [{ id: id(1), code: '001', name: 'Product', categoryLabel: '', supplierLabel: '', seasonLabel: '', sizeGroup: { id: id(2), label: 'Group' },
      sizes: [{ id: id(3), label: '165/S' }], sizeTotals: { [id(3)]: sum }, total: sum,
      colorFits: [{ color: { id: id(8), label: 'Blue' }, fit: { id: id(9), label: 'Y' }, sizeTotals: { [id(3)]: sum }, total: sum,
        rows: [6, 7].map(valueId => ({ warehouse: { id: id(valueId), label: `Warehouse ${valueId}` },
          cells: { [id(3)]: { state: 'known' as const, skuId: id(4), quantity: value } }, total: total(value) })) }] }] };
}
async function inventoryResult(data: InventoryPage, parameters = inventoryParameters()): Promise<InventoryPage> {
  return createInventoryHttpReader(options(async () => json(data))).readInventory(read(parameters));
}

test('inventory rejects different SKU or absent-vs-existing identity for one coordinate across warehouses', async () => {
  assert.deepEqual(await inventoryResult(matrixPage()), matrixPage());
  const conflictingSku = structuredClone(matrixPage());
  Object.assign(Object.values(conflictingSku.products[0]!.colorFits[0]!.rows[1]!.cells)[0]!, { skuId: imageTarget.imageId });
  await assert.rejects(inventoryResult(conflictingSku), errorKind('malformed-response', 'INVALID_RESPONSE'));
  const conflictingPresence = structuredClone(matrixPage('0'));
  const second = conflictingPresence.products[0]!.colorFits[0]!.rows[1]!;
  Object.assign(second, { cells: Object.fromEntries(Object.keys(second.cells).map(key => [key, { state: 'not-applicable' }])) });
  await assert.rejects(inventoryResult(conflictingPresence), errorKind('malformed-response', 'INVALID_RESPONSE'));
  // Coverage may differ by warehouse without changing the underlying actual SKU.
  const unknown = structuredClone(matrixPage('0')), product = unknown.products[0]!, group = product.colorFits[0]!, row = group.rows[1]!;
  const cell = Object.values(row.cells)[0]!;
  assert.equal(cell.state, 'known');
  Object.assign(row, { cells: Object.fromEntries(Object.keys(row.cells).map(key => [key, { state: 'unknown', skuId: cell.state === 'known' ? cell.skuId : '', reason: 'Unproven coverage' }])),
    total: { knownQuantity: '0', unknownCells: 1, completeness: 'incomplete' } });
  const incomplete = { knownQuantity: '0', unknownCells: 1, completeness: 'incomplete' };
  Object.assign(group, { total: incomplete, sizeTotals: Object.fromEntries(product.sizes.map(size => [size.id, incomplete])) });
  Object.assign(product, { total: incomplete, sizeTotals: Object.fromEntries(product.sizes.map(size => [size.id, incomplete])) });
  Object.assign(unknown, { allMatchesTotal: incomplete });
  assert.deepEqual(await inventoryResult(unknown), unknown);
});

test('inventory prevents a SKU being reused by a different product even when every total is exact', async () => {
  const page = structuredClone(matrixPage()), product = structuredClone(page.products[0]!);
  Object.assign(product, { id: imageTarget.imageId, code: '002' });
  Object.assign(page, { products: [...page.products, product], exactTotalProducts: 2, allMatchesTotal: { knownQuantity: '4', unknownCells: 0, completeness: 'complete' } });
  await assert.rejects(inventoryResult(page), errorKind('malformed-response', 'INVALID_RESPONSE'));
  for (const row of product.colorFits[0]!.rows) Object.assign(Object.values(row.cells)[0]!, { skuId: '00000000-0000-4000-8000-000000000099' });
  assert.deepEqual(await inventoryResult(page), page);
});

test('known cells enforce signed-bigint bounds while exact aggregate totals may exceed those bounds', async () => {
  for (const quantity of ['9223372036854775808', '-9223372036854775809']) {
    await assert.rejects(inventoryResult(matrixPage(quantity)), errorKind('malformed-response', 'INVALID_RESPONSE'));
  }
  for (const quantity of ['9223372036854775807', '-9223372036854775808']) {
    const page = matrixPage(quantity), result = await inventoryResult(page);
    assert.equal(result.allMatchesTotal.knownQuantity, String(BigInt(quantity) * 2n));
    assert.equal(result.products[0]!.sizes[0]!.label, '165/S'); assert.deepEqual(result, page);
  }
});

test('warehouse header labels/count/order and warehouse IDs must agree throughout the matrix', async () => {
  for (const labels of [['Different Warehouse', 'Warehouse 7'], ['Warehouse 6'], ['Warehouse 7', 'Warehouse 6']]) {
    await assert.rejects(inventoryResult({ ...matrixPage(), warehouseLabels: labels }), errorKind('malformed-response', 'INVALID_RESPONSE'));
  }
  const page = structuredClone(matrixPage()), product = structuredClone(page.products[0]!);
  Object.assign(product, { id: imageTarget.imageId, code: '002' });
  for (const row of product.colorFits[0]!.rows) Object.assign(Object.values(row.cells)[0]!, { skuId: '00000000-0000-4000-8000-000000000099' });
  Object.assign(product.colorFits[0]!.rows[0]!.warehouse, { id: '00000000-0000-4000-8000-000000000100' });
  Object.assign(page, { products: [...page.products, product], exactTotalProducts: 2, allMatchesTotal: { knownQuantity: '4', unknownCells: 0, completeness: 'complete' } });
  await assert.rejects(inventoryResult(page), errorKind('malformed-response', 'INVALID_RESPONSE'));
});

test('inventory result also respects executed product/fit/warehouse IDs and the bounded opaque read reference', async () => {
  const page = matrixPage(), product = page.products[0]!, group = product.colorFits[0]!;
  for (const filter of [{ ...emptyInventoryFilter(), products: [{ id: imageTarget.imageId, label: 'Client label is not a scope grant' }] },
    { ...emptyInventoryFilter(), fits: [{ id: imageTarget.imageId, label: 'Wrong fit' }] },
    { ...emptyInventoryFilter(), warehouses: [{ id: imageTarget.imageId, label: 'Wrong warehouse' }] }]) {
    await assert.rejects(inventoryResult(page, { ...inventoryParameters(), filter }), errorKind('malformed-response'));
  }
  const filter = { ...emptyInventoryFilter(), products: [{ id: product.id, label: 'Untrusted display label' }], fits: [{ id: group.fit.id, label: 'Another client label' }],
    warehouses: [...group.rows].reverse().map(row => ({ id: row.warehouse.id, label: 'Untrusted warehouse label' })) };
  assert.deepEqual(await inventoryResult(page, { ...inventoryParameters(), filter }), page);
  await assert.rejects(inventoryResult({ ...page, page: 2, exactTotalProducts: 101 }, { ...inventoryParameters(), page: 2, filter }), errorKind('malformed-response'));
  await assert.rejects(inventoryResult({ ...page, readReference: 'not header safe\nreference' }), errorKind('malformed-response'));
  await assert.rejects(inventoryResult({ ...page, readReference: 'x'.repeat(201) }), errorKind('malformed-response'));
});

test('monotonic deadline stops continuously resolved stream chunks without waiting for the timer task', async t => {
  let now = 0, chunks = 0, cancelled = 0;
  t.mock.method(performance, 'now', () => now);
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { chunks++; if (chunks >= 5) now = 2; controller.enqueue(new Uint8Array()); }, cancel() { cancelled++; } });
  const reader = createProductHttpReader(options(async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }), { timeoutMs: 1 }));
  await assert.rejects(reader.readProductBasics(read(target)), errorKind('timeout', 'QUERY_TIMEOUT'));
  assert.equal(cancelled, 1); assert.ok(chunks <= 6);
});

test('deadline cannot publish a success after synchronous JSON decode/parse or DTO validation returns', async t => {
  await t.test('elapsed during JSON parsing', async t => {
    let now = 0;
    t.mock.method(performance, 'now', () => now);
    const parse = JSON.parse;
    t.mock.method(JSON, 'parse', (text: string) => { const value = parse(text) as unknown; now = 2; return value; });
    const reader = createProductHttpReader(options(async () => json(basics), { timeoutMs: 1 }));
    await assert.rejects(reader.readProductBasics(read(target)), errorKind('timeout', 'QUERY_TIMEOUT'));
  });
  await t.test('elapsed during DTO validation', async t => {
    let now = 0;
    t.mock.method(performance, 'now', () => now);
    const http = createHttpJsonQuery(options(async () => json(basics), { timeoutMs: 1 }));
    await assert.rejects(http.post('/products/basics/query', target, new AbortController().signal, value => { now = 2; return value; }), errorKind('timeout', 'QUERY_TIMEOUT'));
  });
});
