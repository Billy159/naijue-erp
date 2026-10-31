import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyInventoryFilter, type InventoryOutputData, type InventoryProduct, type StockTotal } from './contracts.ts';
import { createInventoryOutputReader, createInventoryPrintHtml, inventoryWorkbookRows, createInventoryPrintHtmlAsync, inventoryWorkbookRowsAsync, inventoryWorkbookRowsStream, createInventoryPrintHtmlStream } from './output-adapter.ts';
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
  let downloads = 0, completedDownload!: () => void;
  const downloadCompleted = new Promise<void>(resolve => { completedDownload = resolve; });
  dom.window.HTMLAnchorElement.prototype.click = function () { assert.equal(this.download, '库存状况.xlsx'); downloads++; completedDownload(); };
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
    let mode = 'pending', releaseSuccessfulRead!: () => void;
    // Distinguish a started native read from a completed XLSX download.
    const successfulReadGate = new Promise<void>(resolve => { releaseSuccessfulRead = resolve; });
    const capability = { onAccessFailure: () => assert.fail('Unexpected access failure'), reader: { readOutput: async (request: { parameters: unknown; signal: AbortSignal }) => {
      seen.push(request.parameters); signals.push(request.signal);
      if (mode === 'pending') return new Promise(() => {});
      if (mode === 'success') { await successfulReadGate; return data; }
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
    await click('导出', dialog); assert.equal(seen.length, 4); assert.equal(downloads, 0);
    assert.equal(workbooks.length, 0, 'A held native read cannot publish an XLSX');
    assert.equal((dialog.querySelector('button[type="submit"]') as HTMLButtonElement).disabled, true);
    releaseSuccessfulRead();
    // The reader, lazy workbook import, cooperative rows/ZIP and final copy all
    // complete asynchronously. One 20ms sleep is not their completion contract.
    let completionTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await act!(async () => { await Promise.race([downloadCompleted, new Promise<never>((_resolve, reject) => {
        completionTimeout = setTimeout(() => reject(new Error('Native inventory XLSX did not reach link.click: ' + JSON.stringify({
          seen: seen.length, downloads, workbooks: workbooks.length, aborted: signals.map(signal => signal.aborted),
          dialogOpen: dialog.hasAttribute('open'), dialogText: dialog.textContent,
          submitDisabled: (dialog.querySelector('button[type="submit"]') as HTMLButtonElement | null)?.disabled,
          visibleError: (dialog.querySelector('[role="alert"]') as HTMLElement | null)?.hidden === false,
        }))), 10_000);
      })]); });
    } finally { if (completionTimeout !== undefined) clearTimeout(completionTimeout); }
    assert.equal(downloads, 1); assert.equal(host.querySelector('dialog'), null);
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


test('replica stream keeps A/B/A global sections and exact full rows without readOutput DTO collection', async () => {
 const products=[product(1),product(2),product(3)];(products[1] as {sizeGroup:{id:string;label:string}}).sizeGroup={id:id(200_001),label:'下装'};
 const expected:InventoryOutputData={...(frames(products)[0] as unknown as InventoryOutputData),products};
 const settings={category:true,supplier:false,fit:false,sizeGroup:false,season:false,subtotal:true,total:true,sizeDescription:true};
 let calls=0;const source=reader(async()=>{calls++;return response(frames(products));});
 const streaming={readOutput:async()=>{throw Error('whole DTO consumer must not run');},streamOutput:source.streamOutput!};
 const rows=[];for await(const row of inventoryWorkbookRowsStream(streaming,read(),settings))rows.push(row);
 assert.deepEqual(rows,inventoryWorkbookRows(expected,filter,settings));assert.equal(calls,1);
 assert.equal(await createInventoryPrintHtmlStream(streaming,read(),settings),createInventoryPrintHtml(expected,filter,settings));assert.equal(calls,2);
});

test('replica incremental parser backpressures each product and closes an early consumer', async () => {
 const values=frames([product(1),product(2),product(3)]);let produced=0,cancelled=false;
 const source=reader(async()=>new Response(new ReadableStream({pull(controller){if(produced<values.length)controller.enqueue(encode([values[produced++]]));else controller.close();},cancel(){cancelled=true;}},{highWaterMark:0}),{headers:{'content-type':'application/x-ndjson'}}));
 const iterator=source.streamOutput!(read())[Symbol.asyncIterator]();assert.equal(produced,0);assert.equal((await iterator.next()).value?.kind,'summary');assert.equal(produced,1);assert.equal((await iterator.next()).value?.kind,'product');assert.equal(produced,2);await iterator.return?.();assert.equal(cancelled,true);assert.equal(produced,2);
});

test('replica rows and print publish nothing until complete AND EOF; post-complete failure and cancellation discard projections', async () => {
 const settings={category:true,supplier:false,fit:true,sizeGroup:false,season:false,subtotal:true,total:true,sizeDescription:true};
 let transport!:ReadableStreamDefaultController<Uint8Array>;const source=reader(async()=>new Response(new ReadableStream({start(controller){transport=controller;controller.enqueue(encode(frames()));}}),{headers:{'content-type':'application/x-ndjson'}}));
 let published=false;const rows=inventoryWorkbookRowsStream(source,read(),settings),first=rows.next().then(value=>{published=true;return value;});await new Promise(resolve=>setTimeout(resolve,10));assert.equal(published,false);transport.close();assert.deepEqual((await first).value,['奈爵服饰 库存状况']);await rows.return(undefined);
 let broken!:ReadableStreamDefaultController<Uint8Array>;const failed=reader(async()=>new Response(new ReadableStream({start(controller){broken=controller;controller.enqueue(encode(frames()));}}),{headers:{'content-type':'application/x-ndjson'}}));const preview=createInventoryPrintHtmlStream(failed,read(),settings);await new Promise(resolve=>setTimeout(resolve,5));broken.error(Error('after-complete network failure'));await assert.rejects(preview,HttpQueryError);
 const invalidFrames=frames();invalidFrames[2]={...invalidFrames[2]!,readReference:'WRONG'};await assert.rejects(inventoryWorkbookRowsStream(reader(async()=>response(invalidFrames)),read(),settings).next(),malformed);
 const abort=new AbortController();let cancelled=false;const stalled=reader(async()=>new Response(new ReadableStream({start(controller){controller.enqueue(encode(frames().slice(0,2)));},cancel(){cancelled=true;}}),{headers:{'content-type':'application/x-ndjson'}}));const pending=inventoryWorkbookRowsStream(stalled,read(abort.signal),settings).next();await new Promise(resolve=>setTimeout(resolve,5));abort.abort();await assert.rejects(pending,error=>error instanceof HttpQueryError&&error.kind==='aborted');assert.equal(cancelled,true);
});


test('replica representative synthetic stream reports source bytes and row work without a memory/performance PASS claim', async t => {
 const products=Array.from({length:100},(_,index)=>product(index+1,8,20,'9007199254740993')),values=frames(products),bytes=encode(values);
 const source=reader(async()=>new Response(bytes,{headers:{'content-type':'application/x-ndjson'}}));const settings={category:true,supplier:false,fit:false,sizeGroup:false,season:false,subtotal:true,total:true,sizeDescription:true};
 const started=performance.now();let rows=0,maxRowBytes=0;for await(const row of inventoryWorkbookRowsStream(source,read(),settings)){rows++;maxRowBytes=Math.max(maxRowBytes,new TextEncoder().encode(JSON.stringify(row)).byteLength);}
 assert.equal(rows,804);t.diagnostic(JSON.stringify({environment:'Node24 synthetic single operation; not browser or real HTTP',sourceBytes:bytes.byteLength,rows,maxRowBytes,elapsedMs:Math.round((performance.now()-started)*100)/100,heapMeasured:false,peakMemoryPass:false}));
});


test('replica async row seam produces the original XLSX with exact text identities after validated EOF', async () => {
 const {createOriginalWorkbook}=await import('../../demo-replica/frontend/runtime/common/original-workbook.ts');const {createRequire}=await import('node:module');const JSZip=createRequire(new URL('../../demo-replica/frontend/runtime/common/original-workbook.ts',import.meta.url))('jszip');
 const settings={category:true,supplier:false,fit:true,sizeGroup:false,season:false,subtotal:true,total:true,sizeDescription:true};const signal=new AbortController().signal;
 const bytes=await createOriginalWorkbook(inventoryWorkbookRowsStream(reader(async()=>response(frames())),read(signal),settings),'库存状况',signal);
 const zip=await JSZip.loadAsync(bytes),sheet=await zip.file('xl/worksheets/sheet1.xml')!.async('string'),workbook=await zip.file('xl/workbook.xml')!.async('string');
 assert.match(workbook,/name="库存状况"/);assert.match(sheet,/0001/);assert.match(sheet,/-9007199254740993/);assert.match(sheet,/t="inlineStr"/);assert.doesNotMatch(sheet,/颜色小计|商品合计|<script>/);assert.equal((sheet.match(/<row r=/g)??[]).length,6);
});

test('PF01 rejects row accumulation before EOF, closes producer and publishes no partial workbook rows',async()=>{
 const settings={category:true,supplier:false,fit:false,sizeGroup:false,season:false,subtotal:true,total:true,sizeDescription:true};let closed=false,published=0;const data=product(1,10001,1,'1'),summary={readReference:'budget',exactTotalProducts:1,warehouseLabels:['合成仓'],allMatchesTotal:data.total};
 const source={readOutput:async()=>{throw Error('not used');},async *streamOutput(){try{yield {kind:'summary' as const,...summary};yield {kind:'product' as const,product:data};yield {kind:'complete' as const,...summary};}finally{closed=true;}}};
 await assert.rejects(async()=>{for await(const row of inventoryWorkbookRowsStream(source,read(),settings)){published++;}},/浏览器导出预算/);assert.equal(published,0);assert.equal(closed,true);
});
