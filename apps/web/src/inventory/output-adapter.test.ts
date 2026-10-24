import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyInventoryFilter, type InventoryOutputData, type InventoryProduct, type StockTotal } from './contracts.ts';
import { createInventoryOutputReader, createInventoryPrintHtml, inventoryWorkbookRows, createInventoryPrintHtmlAsync, inventoryWorkbookRowsAsync } from './output-adapter.ts';
import { HttpQueryError } from '../transport/http-query.ts';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const total = (value: string): StockTotal => ({ knownQuantity: value, completeness: 'complete', unknownCells: 0 });
function product(index = 1, warehouses = 2, sizeCount = 2, quantity = '-9007199254740993'): InventoryProduct {
  const sizes = Array.from({ length: sizeCount }, (_, size) => ({ id: id(300_000 + size), label: `尺码${size}` }));
  const rows = Array.from({ length: warehouses }, (_, warehouse) => ({ warehouse: { id: id(400_000 + warehouse), label: `仓库${warehouse}` },
    cells: Object.fromEntries(sizes.map((size, number) => [size.id, { state: 'known' as const, skuId: id(1_000_000 + index * 1000 + number), quantity }])), total: total(String(BigInt(quantity) * BigInt(sizeCount))) }));
  const sizeTotals = Object.fromEntries(sizes.map(size => [size.id, total(String(BigInt(quantity) * BigInt(warehouses)))]));
  const sum = total(String(BigInt(quantity) * BigInt(sizeCount * warehouses)));
  return { id: id(100_000 + index), code: `000${index}`, name: '商品😀<script>', categoryLabel: '', supplierLabel: '', seasonLabel: '', sizeGroup: { id: id(200_000), label: '上装' }, sizes,
    colorFits: [{ color: { id: id(500_000), label: '蓝' }, fit: { id: id(600_000), label: 'A版' }, rows, sizeTotals, total: sum }], sizeTotals, total: sum };
}
const filter = emptyInventoryFilter();
const read = (signal = new AbortController().signal) => ({ parameters: filter, signal, identity: { accountId: id(1), sessionRevision: '1', permissionRevision: '1' }, routeInstanceId: 'output-test', entityId: null });
function frames(products: readonly InventoryProduct[] = [product()]) {
  const allMatchesTotal = total(products.reduce((sum, item) => sum + BigInt(item.total.knownQuantity), 0n).toString());
  return [{ kind: 'summary', readReference: 'READ_1', exactTotalProducts: products.length, warehouseLabels: products[0]?.colorFits[0]?.rows.map(row => row.warehouse.label) ?? [], allMatchesTotal },
    ...products.map(item => ({ kind: 'product', product: item })),
    { kind: 'complete', readReference: 'READ_1', exactTotalProducts: products.length, emittedProducts: products.length, allMatchesTotal }];
}
const encode = (values: readonly unknown[]) => new TextEncoder().encode(values.map(value => JSON.stringify(value)).join('\n') + '\n');
const response = (values: readonly unknown[]) => new Response(encode(values), { headers: { 'content-type': 'application/x-ndjson' } });
const reader = (fetch: (url: string, init: RequestInit) => Promise<Response>) => createInventoryOutputReader({ origin: 'https://erp.example', basePath: '/api', fetch });
const malformed = (error: unknown) => error instanceof HttpQueryError && error.kind === 'malformed-response';

test('one full-filter POST, multibyte fragments and exact quantities; construction does no I/O', async () => {
  let calls = 0;
  const bytes = encode(frames());
  const output = reader(async (url, init) => {
    calls++; assert.equal(url, 'https://erp.example/api/inventory/output/query');
    assert.deepEqual(JSON.parse(init.body as string), { filter });
    assert.equal(init.credentials, 'same-origin'); assert.equal(init.cache, 'no-store');
    let offset = 0;
    return new Response(new ReadableStream({ pull(controller) { if (offset === bytes.length) controller.close(); else { controller.enqueue(bytes.subarray(offset, offset + 7)); offset = Math.min(bytes.length, offset + 7); } } }), { headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } });
  });
  assert.equal(calls, 0);
  const data = await output.readOutput(read());
  assert.equal(calls, 1); assert.equal(data.products[0]!.colorFits[0]!.rows[0]!.cells[id(300_000)]!.state, 'known');
  assert.equal(data.products[0]!.total.knownQuantity, '-36028797018963972');
  assert.equal(data.products[0]!.name, '商品😀<script>');
});

test('complete is held until normal EOF; a post-complete transport failure cannot succeed', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>, settled = false;
  const output = reader(async () => new Response(new ReadableStream({ start(value) { controller = value; controller.enqueue(encode(frames())); } }), { headers: { 'content-type': 'application/x-ndjson' } }));
  const pending = output.readOutput(read()).then(value => { settled = true; return value; });
  await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(settled, false);
  controller.close(); assert.equal((await pending).exactTotalProducts, 1);
  let broken!: ReadableStreamDefaultController<Uint8Array>;
  const failed = reader(async () => new Response(new ReadableStream({ start(value) { broken = value; broken.enqueue(encode(frames())); } }), { headers: { 'content-type': 'application/x-ndjson' } })).readOutput(read());
  await new Promise(resolve => setTimeout(resolve, 10)); broken.error(new Error('synthetic stream failure'));
  await assert.rejects(failed, HttpQueryError);
});

test('missing/extra/reordered frames, false counts/sums/references and malformed product facts reject', async () => {
  const original = frames();
  const cases: unknown[][] = [[], original.slice(0, -1), original.slice(1), [...original, original[2]], [original[1], original[0], original[2]], [...original, { kind: 'error' }]];
  for (const [key, value] of [['readReference', 'OTHER'], ['exactTotalProducts', 2], ['emittedProducts', 0], ['allMatchesTotal', total('0')]] as const) cases.push([original[0], original[1], { ...original[2], [key]: value }]);
  cases.push([original[0], original[1], original[1], original[2]]);
  const bad = structuredClone(product());
  (bad.colorFits[0]!.rows[0]!.cells as Record<string, unknown>)[id(300_000)] = { state: 'known', skuId: id(999), quantity: '0' };
  cases.push([original[0], { kind: 'product', product: bad }, original[2]]);
  for (const value of cases) await assert.rejects(reader(async () => response(value)).readOutput(read()), malformed);
  await assert.rejects(reader(async () => new Response(encode(frames()).subarray(0, -4), { headers: { 'content-type': 'application/x-ndjson' } })).readOutput(read()), malformed);
  await assert.rejects(reader(async () => new Response('{}', { headers: { 'content-type': 'application/json' } })).readOutput(read()), malformed);
});

test('cross-product native SKU and warehouse scope consistency remain enforced', async () => {
  const first = product(1), duplicateSku = structuredClone(product(2));
  for (const row of duplicateSku.colorFits[0]!.rows) (row.cells as Record<string, unknown>)[id(300_000)] = { ...row.cells[id(300_000)], skuId: first.colorFits[0]!.rows[0]!.cells[id(300_000)]!.state === 'known' ? id(1_001_000) : '' };
  const wrongWarehouse = structuredClone(product(2));
  (wrongWarehouse.colorFits[0]!.rows[0]!.warehouse as { id: string }).id = id(999);
  for (const second of [duplicateSku, wrongWarehouse]) await assert.rejects(reader(async () => response(frames([first, second]))).readOutput(read()), malformed);
});

test('cancellation detaches a stalled read and late permission failure; current denial remains distinct', async () => {
  let release!: (value: Response) => void;
  const abort = new AbortController();
  const pending = reader(() => new Promise(resolve => { release = resolve; })).readOutput(read(abort.signal));
  await Promise.resolve(); abort.abort();
  await assert.rejects(pending, error => error instanceof HttpQueryError && error.kind === 'aborted');
  release(new Response(null, { status: 403 }));
  let canceled = false;
  const abort2 = new AbortController();
  const reading = reader(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(encode(frames().slice(0, 1))); }, cancel() { canceled = true; } }), { headers: { 'content-type': 'application/x-ndjson' } })).readOutput(read(abort2.signal));
  await new Promise(resolve => setTimeout(resolve, 5)); abort2.abort();
  await assert.rejects(reading, error => error instanceof HttpQueryError && error.kind === 'aborted'); assert.equal(canceled, true);
  await assert.rejects(reader(async () => new Response(null, { status: 403 })).readOutput(read()), error => error instanceof HttpQueryError && error.kind === 'forbidden');
  await assert.rejects(createInventoryOutputReader({ origin: 'https://erp.example', basePath: '/api', timeoutMs: 5, fetch: () => new Promise(() => {}) }).readOutput(read()), error => error instanceof HttpQueryError && error.kind === 'timeout');
});

test('full output larger than the ordinary 32MiB JSON limit has no whole-stream cap', async () => {
  const products = Array.from({ length: 8 }, (_, index) => product(index + 1, 400, 100, '1'));
  const values = frames(products), bytes = encode(values);
  assert.ok(bytes.byteLength > 32 * 1024 * 1024);
  const data = await reader(async () => new Response(bytes, { headers: { 'content-type': 'application/x-ndjson' } })).readOutput(read());
  assert.equal(data.products.length, 8); assert.equal(data.allMatchesTotal.knownQuantity, '320000');
});

test('default export omits subtotal/total; full print expands native rows and honors source settings', async () => {
  const data: InventoryOutputData = await reader(async () => response(frames())).readOutput(read());
  const settings = { category: true, supplier: false, fit: false, sizeGroup: false, season: false, subtotal: true, total: true, sizeDescription: true };
  const rows = inventoryWorkbookRows(data, filter, settings);
  assert.equal(rows.filter(row => row[0] === '0001').length, 2);
  assert.equal(rows.flat().includes('商品合计'), false); assert.equal(rows.flat().includes('颜色小计'), false);
  assert.equal(rows.flat().includes('-9007199254740993'), true);
  const html = createInventoryPrintHtml(data, filter, settings);
  assert.match(html, /A4 landscape;margin:9mm/); assert.match(html, /class="mx-subtotal"/); assert.match(html, /class="mx-total"/);
  assert.equal((html.match(/data-inventory-product=/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<button|role="button"|<th>操作|<script>/); assert.match(html, /&lt;script&gt;/);
  const plain = createInventoryPrintHtml(data, filter, { ...settings, subtotal: false, total: false, sizeDescription: false });
  assert.doesNotMatch(plain, /class="mx-subtotal"|class="mx-total"/); assert.match(plain, /<h3 hidden>/);
});

test('first click opens deferred native output; cancel/retry keep executed filters and page drafts', async () => {
  const { build } = await import('esbuild');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { JSDOM } = require('jsdom');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const { join, dirname } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url)), temporary = await mkdtemp(join(here, 'tests/.output-consumer-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/' });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'IS_REACT_ACT_ENVIRONMENT']) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : (dom.window as unknown as Record<string, unknown>)[key] });
  }
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const originalCreateURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const workbooks: Blob[] = [];
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (blob: Blob) => { workbooks.push(blob); return 'blob:synthetic-output'; } });
  let downloads = 0;
  dom.window.HTMLAnchorElement.prototype.click = function () { assert.equal(this.download, '库存状况.xlsx'); downloads++; };
  let root: { render(value: unknown): void; unmount(): void } | undefined, act: ((work: () => Promise<void> | void) => Promise<void>) | undefined;
  try {
    const output = join(temporary, 'entry.mjs');
    await build({ stdin: { contents: "export {createElement,act,StrictMode} from 'react';export {createRoot} from 'react-dom/client';export {InventoryPageView} from './inventory-page.tsx';export {ReadContext} from '../loading/read-scope.ts';", resolveDir: here, sourcefile: 'output-consumer-entry.tsx' }, outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
    const entry = await import(pathToFileURL(output).href); act = entry.act;
    const host = dom.window.document.getElementById('root')!;
    root = entry.createRoot(host);
    const ctx = new entry.ReadContext({ accountId: id(1), sessionRevision: '1', permissionRevision: '1' }), scope = ctx.createScope('output-consumer');
    const native = product(), allMatchesTotal = native.total, data = { readReference: 'UI_READ', exactTotalProducts: 1, warehouseLabels: ['仓库0', '仓库1'], allMatchesTotal, products: [native] };
    const selected = { id: native.id, label: `${native.code} ${native.name}` };
    const seen: unknown[] = [], signals: AbortSignal[] = [];
    let mode = 'pending';
    const capability = { onAccessFailure: () => assert.fail('Unexpected access failure'), reader: { readOutput: async (request: { parameters: unknown; signal: AbortSignal }) => {
      seen.push(request.parameters); signals.push(request.signal);
      if (mode === 'pending') return new Promise(() => {});
      if (mode === 'success') return data;
      throw new Error('synthetic unavailable');
    } } };
    await act!(async () => { root!.render(entry.createElement(entry.StrictMode, null, entry.createElement(entry.InventoryPageView, { scope, initialProduct: selected,
      reader: { readInventory: async (request: { parameters: { page: number; pageSize: number } }) => ({ ...data, page: request.parameters.page, pageSize: request.parameters.pageSize }), readCandidates: async () => ({ items: [], exactTotal: 0, page: 1 }) }, productReader: {}, output: capability }))); });
    const click = async (text: string, within: ParentNode = host) => { const button = Array.from(within.querySelectorAll('button')).find(value => value.textContent === text); assert.ok(button); await act!(async () => { button.click(); }); };
    const settle = async () => { await act!(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
    await settle(); assert.equal(seen.length, 0);
    await click('重置'); assert.match(host.textContent!, /条件已修改/);
    await click('导出'); await settle();
    let dialog = host.querySelector('dialog.iw-export-dialog')!;
    assert.ok(dialog.hasAttribute('open')); assert.match(dialog.textContent!, /默认库存明细/); assert.equal(seen.length, 0);
    await click('导出', dialog); assert.equal(seen.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(seen[0])), { ...filter, products: [selected] });
    await click('取消', dialog); assert.equal(signals[0]!.aborted, true); assert.equal(host.querySelector('dialog'), null); assert.match(host.textContent!, /条件已修改/);
    mode = 'failed'; await click('导出'); await settle(); dialog = host.querySelector('dialog')!;
    await click('导出', dialog); await settle(); assert.match(dialog.textContent!, /导出失败/); assert.ok(dialog.querySelector('input[value="default"]:checked'));
    await click('重新导出', dialog); await settle(); assert.equal(seen.length, 3); assert.match(host.textContent!, /条件已修改/);
    await click('取消', dialog);
    mode = 'success'; await click('导出'); await settle(); dialog = host.querySelector('dialog')!;
    await click('导出', dialog); await settle(); assert.equal(downloads, 1); assert.equal(host.querySelector('dialog'), null);
    const workbook = new Uint8Array(await workbooks[0]!.arrayBuffer());
    assert.deepEqual([...workbook.subarray(0, 2)], [0x50, 0x4b]);
    const xml = new TextDecoder().decode(workbook); assert.match(xml, /0001<\/t>/); assert.match(xml, /-9007199254740993/); assert.doesNotMatch(xml, /商品合计/);
    await click('打印'); await settle(); assert.equal(seen.length, 5); dialog = host.querySelector('dialog.iw-print-dialog')!;
    const frame = dialog.querySelector('iframe')!; assert.match(frame.srcdoc, /打印全部展开/); assert.doesNotMatch(frame.srcdoc, /<button|<th>操作/);
    await act!(async () => { frame.dispatchEvent(new dom.window.Event('load')); });
    assert.equal([...dialog.querySelectorAll('button')].find(button => button.textContent === '打印')!.disabled, false);
    await click('关闭', dialog); assert.match(host.textContent!, /条件已修改/);
    await act!(async () => { ctx.clear(); });
  } finally {
    if (root && act) await act(async () => { root!.unmount(); });
    dom.window.close();
    if (originalCreateURL) Object.defineProperty(URL, 'createObjectURL', originalCreateURL); else Reflect.deleteProperty(URL, 'createObjectURL');
    for (const [key, descriptor] of globals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    await rm(temporary, { recursive: true, force: true });
  }
});


test('F03 cooperative rows are lazy across products and cancellation releases the producer before later products', async () => {
  let firstReads=0,secondReads=0;
  const a=product(1),b=product(2),first={...a,get colorFits(){firstReads++;return a.colorFits;}},second={...b,get colorFits(){secondReads++;return b.colorFits;}};
  const data:InventoryOutputData={readReference:'NEW-ASYNC-ROWS',exactTotalProducts:2,warehouseLabels:['仓库0','仓库1'],allMatchesTotal:total((BigInt(a.total.knownQuantity)+BigInt(b.total.knownQuantity)).toString()),products:[first,second]};
  const abort=new AbortController(),settings={category:true,supplier:false,fit:false,sizeGroup:false,season:false,subtotal:false,total:true,sizeDescription:false};
  const iterator=inventoryWorkbookRowsAsync(data,filter,settings,abort.signal);
  assert.equal(firstReads,0);assert.equal(secondReads,0);
  for(let i=0;i<4;i++)await iterator.next();assert.equal(firstReads,0);assert.equal(secondReads,0);
  const row=await iterator.next();assert.equal(row.done,false);assert.equal(row.value![0],'0001');assert.ok(row.value!.includes('-9007199254740993'));assert.ok(firstReads>0);assert.equal(secondReads,0);
  abort.abort();await assert.rejects(iterator.next(),error=>error instanceof HttpQueryError&&error.kind==='aborted');assert.equal(secondReads,0);
});

test('F03 cooperative print preserves native full-model output and abort never publishes partial HTML', async () => {
  const products=[product(1),product(2)],data:InventoryOutputData={readReference:'NEW-ASYNC-PRINT',exactTotalProducts:2,warehouseLabels:['仓库0','仓库1'],allMatchesTotal:total(products.reduce((sum,p)=>sum+BigInt(p.total.knownQuantity),0n).toString()),products};
  const settings={category:true,supplier:false,fit:true,sizeGroup:false,season:false,subtotal:true,total:true,sizeDescription:true};
  assert.equal(await createInventoryPrintHtmlAsync(data,filter,settings,new AbortController().signal),createInventoryPrintHtml(data,filter,settings));
  const abort=new AbortController(),pending=createInventoryPrintHtmlAsync(data,filter,settings,abort.signal);abort.abort();await assert.rejects(pending,error=>error instanceof HttpQueryError&&error.kind==='aborted');
});

test('F03 cooperative buffered NDJSON work yields for active cancellation and still requires complete EOF', async () => {
  const products=Array.from({length:150},(_,i)=>product(i+1,2,4,'-1')),bytes=encode(frames(products));let canceled=false;
  const abort=new AbortController();
  const pending=reader(async()=>new Response(new ReadableStream({start(controller){controller.enqueue(bytes);},cancel(){canceled=true;}}),{headers:{'content-type':'application/x-ndjson'}})).readOutput(read(abort.signal));
  const timer=setTimeout(()=>abort.abort(),0);
  try{await assert.rejects(pending,error=>error instanceof HttpQueryError&&error.kind==='aborted');assert.equal(canceled,true);}finally{clearTimeout(timer);}
});
