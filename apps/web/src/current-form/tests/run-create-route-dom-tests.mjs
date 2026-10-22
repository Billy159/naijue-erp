import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)), temp = await mkdtemp(path.join(here, '.dom-tmp-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLIFrameElement', 'Element', 'SVGElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'getComputedStyle']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window); globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); dom.window.HTMLElement.prototype.scrollIntoView = () => {};
let root;
try {
  const output = path.join(temp, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'create-route-entry.tsx')], outfile: output, bundle: true, platform: 'node', format: 'esm', external: ['react', 'react/*', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { act, createElement, createRoot, ReadContext, prepareTransferSession, prepareTransferRoute, draft, result, DemoFrame } = await import(pathToFileURL(output).href);
  const host = document.getElementById('root'); root = createRoot(host);
  const inFrame = view => createElement(DemoFrame, { navigation: { transfer: { selected: true, onActivate() {} } }, breadcrumb: [{id:'inventory-management',label:'库存管理'},{id:'transfers',label:'调拨单列表'}] }, view);
  const nav = label => Array.from(host.querySelectorAll('.sidebar a')).find(el => el.textContent === label);
  const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const native = { ...draft(), lines: [{ ...draft().lines[0], quantity: '2' }] };
  const warehouse = n => ({ id: uuid(n), name: `TEST warehouse ${n}`, hallId: uuid(90), hallName: 'TEST hall', enabled: true, hallEnabled: true, hasNonzeroInventory: false });
  const product = { id: uuid(3), code: 'TEST', name: 'TEST product', retailPrice: null, minimumPriceAvailability: 'UNAVAILABLE' };
  const sku = { id: native.lines[0].skuId, skuCode: 'TEST-SKU', productId: uuid(3), productCode: 'TEST', productName: 'TEST product', colorId: uuid(5), colorName: 'TEST red', fitId: uuid(6), fitName: 'TEST fit', sizeId: uuid(7), sizeName: '165/S', sizeGroupId: uuid(8), barcodeAvailability: 'UNAVAILABLE' };
  const calls = []; let styles = 0, keys = 0;
  const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  const http = { origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, body });
    if (url.endsWith('/transfers/query')) return json({ page: body.page, pageSize: body.pageSize, exactTotal: '0', items: [] });
    if (url.endsWith('/transfers/prepare-create')) {
      assert.deepEqual(body, { businessDate: native.header.businessDate, note: native.header.note, fromWarehouseId: native.header.fromWarehouseId, toWarehouseId: native.header.toWarehouseId, lines: [{ skuId: sku.id, quantity: '2' }] }); return json(native);
    }
    if (url.endsWith('/transfers/commands')) { assert.equal(body.action, 'SAVE'); assert.equal(body.expectedVersion, null); return json(result(body)); }
    const items = url.endsWith('/transfer-warehouses/query') ? [warehouse(20), warehouse(21)] : url.endsWith('/products/query') ? [product] : url.endsWith('/product-skus/query') ? [sku] : assert.fail(`Unexpected request ${url}`);
    return json({ page: body.page, pageSize: 20, exactTotal: String(items.length), items });
  } };
  const context = new ReadContext({ accountId: uuid(99), sessionRevision: 'test', permissionRevision: 'test' }), scope = context.createScope('app-session');
  const input = { scope, http, principal: { accountId: uuid(99), staffId: uuid(98), loginName: 'TEST', role: 'ADMIN', hallId: null, authVersion: 1 }, configuration: { transfers: { stylesheet: { async load() {}, dispose() {} }, detailStylesheet: { async load() { styles++; }, dispose() {} }, commands: { newRequestKey: () => `TEST.route:${++keys}`, manualCreate: true } } } };
  const session = prepareTransferSession(input, () => assert.fail('Unexpected auth failure')), route = session.prepare(input);
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  const button = label => [...host.querySelectorAll('button')].find(el => el.textContent.trim() === label && !el.closest('[hidden]'));
  const until = async (test, label) => { for (let i = 0; i < 100 && !test(); i++) await settle(); assert.ok(test(), label); };
  const click = async el => { assert.ok(el); assert.equal(Boolean(el.disabled), false, el.textContent); await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))); await settle(); };
  const change = async (el, value) => { assert.ok(el); await act(async () => { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }); };
  await act(async () => root.render(inFrame(createElement(route.View, { scope: context.createScope('route') })))); await settle(); assert.equal(styles, 0); assert.ok(calls.every(call => call.url.endsWith('/transfers/query')));
  await click(nav('新增调拨单')); await until(() => button('选择调出仓库'), 'actual NEW route opens proposal'); assert.equal(styles, 1);
  assert.equal(host.querySelector('.breadcrumb').textContent, '库存管理 / 新增调拨单');
  assert.equal(host.querySelector('.sidebar [aria-current=page]').textContent, '新增调拨单');
  await click(button('选择调出仓库')); await click(button('TEST warehouse 20 · TEST hall')); await click(button('选择调入仓库')); await click(button('TEST warehouse 21 · TEST hall'));
  await click(button('添加商品规格')); await click(button('TEST product')); await click(button('TEST · TEST red · TEST fit · 165/S')); await click(button('关闭候选'));
  await change(host.querySelector('[aria-label="单据日期"]'), native.header.businessDate); await change(host.querySelector('[aria-label="备注"]'), native.header.note); await change(host.querySelector('[aria-label="TEST-SKU 数量"]'), '2');
  assert.equal(session.canLeave(), false);
  await click(nav('新增调拨单')); assert.equal(host.querySelector('[aria-label="TEST-SKU 数量"]').value, '2');
  await click(nav('调拨单列表')); assert.ok(host.querySelector('.transfer-proposal-editor')); assert.match(host.textContent, /当前有未保存输入/);
  await click(button('保存')); await until(() => session.workspace.getSnapshot().write.phase === 'committed', 'real SAVE boundary committed');
  assert.equal(calls.filter(call => call.url.endsWith('/transfers/prepare-create')).length, 1); assert.equal(calls.filter(call => call.url.endsWith('/transfers/commands')).length, 1);
  assert.ok(host.querySelector('.transfer-command-editor')); assert.match(host.textContent, /原操作已确认/); assert.equal(session.canLeave(), true);
  await click(nav('调拨单列表')); assert.equal(host.querySelector('.transfer-list').hidden, false); assert.equal(host.querySelector('.breadcrumb').textContent, '库存管理 / 调拨单列表');
  await act(async () => root.render(null));
  const revisited = session.prepare(input); await act(async () => root.render(createElement(revisited.View, { scope: context.createScope('route-revisited') }))); await settle();
  assert.ok(button('新增调拨单')); await click(button('新增调拨单')); await until(() => button('选择调出仓库'), 'NEW after committed route detach opens clean proposal, not prior saved document');
  assert.equal(host.querySelector('[aria-label="选择调出仓库"]').textContent, '选择调出仓库'); assert.equal(host.querySelector('[aria-label="单据日期"]').value, ''); await click(button('取消新增')); assert.equal(calls.filter(call => call.url.endsWith('/transfers/commands')).length, 1);
  await act(async () => root.unmount()); root = createRoot(host);
  const readonly = prepareTransferRoute({ ...input, configuration: { transfers: { ...input.configuration.transfers, commands: undefined } } });
  await act(async () => root.render(inFrame(createElement(readonly.View, { scope: context.createScope('readonly') })))); await settle(); assert.equal(button('新增调拨单').disabled, true); assert.equal(nav('新增调拨单'), undefined);
  for (const deniedPath of ['/transfer-warehouses/query', '/transfers/prepare-create']) {
    await act(async () => root.render(null));
    const deniedContext = new ReadContext({ accountId: uuid(99), sessionRevision: `denied-${deniedPath}`, permissionRevision: 'test' });
    let accessFailures = 0; const beforeWrites = calls.filter(call => call.url.endsWith('/transfers/commands')).length;
    const deniedInput = { ...input, scope: deniedContext.createScope('denied-session'), http: { ...http, fetch: async (url, init) => url.endsWith(deniedPath)
      ? new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'SYNTHETIC denied' } }), { status: 403, headers: { 'content-type': 'application/json' } }) : http.fetch(url, init) } };
    const deniedSession = prepareTransferSession(deniedInput, error => { assert.equal(error.kind, 'forbidden'); accessFailures++; deniedContext.clear(); });
    const deniedRoute = deniedSession.prepare(deniedInput);
    await act(async () => root.render(createElement(deniedRoute.View, { scope: deniedContext.createScope('denied-route') }))); await settle();
    await click(button('新增调拨单')); await until(() => button('选择调出仓库'), 'denied route proposal opens');
    await click(button('选择调出仓库'));
    if (deniedPath.endsWith('prepare-create')) {
      await click(button('TEST warehouse 20 · TEST hall')); await click(button('选择调入仓库')); await click(button('TEST warehouse 21 · TEST hall'));
      await click(button('添加商品规格')); await click(button('TEST product')); await click(button('TEST · TEST red · TEST fit · 165/S')); await click(button('关闭候选'));
      await change(host.querySelector('[aria-label="单据日期"]'), native.header.businessDate); await change(host.querySelector('[aria-label="备注"]'), native.header.note); await change(host.querySelector('[aria-label="TEST-SKU 数量"]'), '2');
      await click(button('保存'));
    }
    await until(() => accessFailures === 1, '403 invokes actual application session access-failure hook');
    assert.equal(deniedSession.workspace.getSnapshot().disposed, true); assert.equal(calls.filter(call => call.url.endsWith('/transfers/commands')).length, beforeWrites);
    await act(async () => root.render(null));
    const renewedContext = new ReadContext({ accountId: uuid(99), sessionRevision: `renewed-${deniedPath}`, permissionRevision: 'renewed' });
    const renewedInput = { ...input, scope: renewedContext.createScope('renewed-session') };
    const renewed = prepareTransferSession(renewedInput, () => assert.fail('renewed permission unexpectedly denied')).prepare(renewedInput);
    await act(async () => root.render(createElement(renewed.View, { scope: renewedContext.createScope('renewed-route') }))); await settle();
    await click(button('新增调拨单')); await until(() => button('选择调出仓库'), 'fresh authenticated route can create after access-failure reset'); await click(button('取消新增'));
    await act(async () => { root.render(null); renewedContext.clear(); });
  }
  console.log('PASS actual route403 recovery: candidate and preparation denial invoke same application access-failure path, no SAVE, fresh authorized session can reopen NEW.');
  console.log('PASS actual transfer application route: opt-in NEW → real candidates → native prepare HTTP → actual SAVE/workspace UI; dirty navigation guard, clean reopen, default read-only unchanged.');
  await act(async () => root.unmount()); root = null; context.clear();
} finally { if (root) root.unmount(); dom.window.close(); await rm(temp, { recursive: true, force: true }); }
