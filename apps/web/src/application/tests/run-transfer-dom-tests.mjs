import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.transfer-app-check-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLIFrameElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLDialogElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
let app, act;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'transfer-dom-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { createElement: h, createApplication, createRouteStylesheet, createDemoFrameWorkspaceRenderer, summary, detail, warehouse, uuid } = await import(pathToFileURL(output).href);
  ({ act } = await import(pathToFileURL(output).href));
  const host = document.getElementById('root');
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 12)); }); };
  const until = async (check, label) => { const deadline = Date.now() + 5000; while (!check() && Date.now() < deadline) await settle(); assert.ok(check(), label); };
  const click = async element => { assert.ok(element, 'Expected composed control'); await act(async () => element.click()); await settle(); };
  const button = text => [...host.querySelectorAll('button')].find(element => element.textContent.trim() === text);
  const navigation = text => [...host.querySelectorAll('.sidebar a')].find(element => element.textContent.trim() === text);
  const change = async (input, value) => { assert.ok(input); await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }); await settle(); };
  const submit = async () => { const form = host.querySelector('form[aria-label="调拨筛选"]'); assert.ok(form); await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await settle(); };
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  const denied = (status = 401) => json({ error: { code: status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', message: 'SYNTHETIC PRIVATE ERROR' } }, status);
  const principal = n => ({ accountId: uuid(900 + n), staffId: uuid(950 + n), loginName: `SYNTHETIC-TRANSFER-${n}`, role: 'WAREHOUSE', hallId: null, authVersion: n });
  let currentPrincipal = principal(1), listMode = 'success', detailMode = 'success';
  const calls = [], heldLists = [], heldDetails = [];
  const http = { origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null; const call = { url, body, signal: init.signal }; calls.push(call);
    assert.equal(init.credentials, 'same-origin'); assert.equal(init.mode, 'same-origin'); assert.equal(init.redirect, 'error');
    if (url.endsWith('/auth/session')) return json({ principal: currentPrincipal });
    if (url.endsWith('/transfers/query')) {
      if (listMode === 'unauthenticated') return denied();
      const count = Math.max(0, Math.min(body.pageSize, 21 - (body.page - 1) * body.pageSize));
      const result = { page: body.page, pageSize: body.pageSize, exactTotal: '21', items: Array.from({ length: count }, (_, i) => summary((body.page - 1) * body.pageSize + i + 1)) };
      if (listMode === 'hold') return new Promise(resolve => heldLists.push({ ...call, finish: (status = 200) => resolve(status !== 200 ? denied(status) : json(result)) }));
      return json(result);
    }
    if (url.endsWith('/transfers/detail/query')) {
      if (detailMode === 'unauthenticated') return denied();
      if (detailMode === 'forbidden') return denied(403);
      const result = detail(Number(body.transferId.slice(-12)));
      if (detailMode === 'hold') return new Promise(resolve => heldDetails.push({ ...call, finish: (status = 200) => resolve(status !== 200 ? denied(status) : json(result)) }));
      return json(result);
    }
    if (url.endsWith('/transfers/warehouses/query')) return json({ page: body.page, pageSize: body.pageSize, exactTotal: '1', items: [warehouse()] });
    if (url.endsWith('/products/basics/query')) return json({ productId: body.productId, code: 'SYNTHETIC-PRODUCT', name: 'SYNTHETIC PRODUCT DETAIL', categoryLabel: null, yearLabel: null, seasonLabel: null, supplierLabel: null, systemCode: null, retailPrice: null });
    throw new Error('Unexpected synthetic endpoint');
  } };
  const count = suffix => calls.filter(call => call.url.endsWith(suffix)).length;
  const sheet = name => createRouteStylesheet({ document, origin: http.origin, href: `/approved/${name}.css` });
  const routeStyles = sheet('transfers'), detailStyles = sheet('transfer-detail'), productStyles = sheet('transfer-product');
  const ready = async name => { const link = [...document.querySelectorAll('link[rel=stylesheet]')].find(element => element.href.endsWith(`/${name}.css`)); assert.ok(link, `Expected ${name} action stylesheet`); await act(async () => link.dispatchEvent(new Event('load'))); await settle(); };
  const hasStyle = name => [...document.querySelectorAll('link[rel=stylesheet]')].some(element => element.href.endsWith(`/${name}.css`));
  const presentation = { renderWorkspace: createDemoFrameWorkspaceRenderer(), renderRouteState: ({ controller, state }) => h('div', { 'data-test-state': state.phase },
    `SYNTHETIC ${state.phase}`, state.phase === 'loading' ? h('button', { onClick: () => controller.cancelRoute() }, 'SYNTHETIC cancel') : null,
    ['cancelled', 'error'].includes(state.phase) ? h('button', { onClick: () => { void controller.navigate(state.route); } }, 'SYNTHETIC retry') : null) };
  app = createApplication({ http, presentation, routes: { sales: { stylesheet: { load: async () => {}, dispose() {} } }, transfers: { stylesheet: routeStyles, detailStylesheet: detailStyles, product: { stylesheet: productStyles } } } });
  assert.equal(calls.length, 0); assert.equal(document.querySelectorAll('link').length, 0);
  await act(async () => app.mount(host)); await settle(); assert.equal(calls.length, 0);
  await act(async () => { await app.controller.authentication.resolveSession(); }); await settle();
  assert.equal(calls.length, 1); assert.equal(document.querySelectorAll('link').length, 0); assert.ok(host.querySelector('.demo-frame'));
  assert.equal(host.querySelectorAll('.sidebar a').length, 2); assert.equal(host.querySelectorAll('.sidebar button:disabled').length, 12);
  assert.deepEqual([...host.querySelectorAll('.sidebar button:disabled')].map(element => element.textContent).filter(text => ['客户', '供应商'].includes(text)), ['客户', '供应商']);
  assert.ok([...host.querySelectorAll('.sidebar button:disabled')].some(element => element.textContent === '新增销货单'));
  assert.ok([...host.querySelectorAll('.sidebar button:disabled')].some(element => element.textContent === '新增调拨单'));
  await click(navigation('调拨单列表')); assert.equal(count('/transfers/query'), 0); assert.equal(hasStyle('transfers'), true); assert.equal(hasStyle('transfer-detail'), false);
  await click(button('SYNTHETIC cancel')); await ready('transfers'); assert.equal(host.querySelector('.transfer-route'), null); assert.equal(count('/transfers/query'), 0);
  await click(button('SYNTHETIC retry')); await until(() => host.querySelectorAll('.transfer-list-table tbody tr').length === 20, 'One bounded transfer activation page');
  assert.equal(count('/transfers/query'), 1); assert.equal(count('/auth/session'), 1); assert.equal(count('/transfers/detail/query'), 0); assert.equal(count('/transfers/warehouses/query'), 0); assert.equal(count('/products/basics/query'), 0);
  assert.equal(calls.at(-1).body.pageSize, 20); await click(navigation('调拨单列表')); assert.equal(count('/transfers/query'), 1);
  console.log('PASS transfer app 1: actual first-party frame preserves disabled missing/new/edit routes and independent customer/supplier labels; auth alone stays inert; route cancellation discards late CSS, one explicit transfer activation reads one bounded page.');

  await click(host.querySelector('.tc-filter-toggle')); await change(host.querySelector('input[aria-label="调拨单号"]'), 'SYNTHETIC UNAPPLIED'); assert.equal(count('/transfers/query'), 1);
  const region = host.querySelector('[aria-label="调拨查询结果"]'); region.scrollTop = 130; region.scrollLeft = 45;
  const trigger = host.querySelector('.transfer-view'); trigger.focus(); await click(trigger);
  assert.equal(hasStyle('transfer-detail'), true); assert.equal(count('/transfers/detail/query'), 0); assert.equal(host.querySelector('.transfer-list').hidden, true);
  await click(button('返回列表')); await ready('transfer-detail'); assert.equal(count('/transfers/detail/query'), 0); assert.equal(region.scrollTop, 130); assert.equal(region.scrollLeft, 45); assert.equal(document.activeElement, trigger);
  assert.equal(host.querySelector('input[aria-label="调拨单号"]').value, 'SYNTHETIC UNAPPLIED');
  await click(trigger); await until(() => host.querySelector('.transfer-editor'), 'Inline transfer detail');
  assert.equal(host.querySelector('dialog'), null); assert.equal(count('/transfers/query'), 1); assert.equal(count('/transfers/detail/query'), 1); assert.match(host.textContent, /TEST 当前调出仓库完整名称/);
  assert.equal(hasStyle('transfer-product'), false); assert.equal(count('/products/basics/query'), 0);
  for (const label of ['保存', '审核', '作废', '导出', '打印', '操作历史']) assert.equal([...host.querySelectorAll('.transfer-editor button')].find(element => element.textContent.trim() === label).disabled, true);
  console.log('PASS transfer app 2: detail code/CSS/data activates only on click, remains an inline full-page read-only view, and cancelled preparation retains the executed list/draft/scroll/focus without a new list read.');

  const trace = label => { if (process.env.TRACE_APPLICATION_TRANSFER) console.log(`TRACE ${Date.now()} ${label}`); };
  trace('before first product preparation');
  await click(host.querySelector('.transfer-editor .mx-actions button')); await until(() => hasStyle('transfer-product'), 'Action-only product CSS');
  trace('product styles pending');
  assert.equal(count('/products/basics/query'), 0); await click(button('返回列表')); trace('returned while product CSS pending'); await ready('transfer-product'); trace('late product CSS ready'); assert.equal(host.querySelector('.iw-product-drawer'), null); assert.equal(count('/products/basics/query'), 0);
  await click(host.querySelector('.transfer-view')); await until(() => host.querySelector('.transfer-editor'), 'Reopen retained transfer row');
  trace('reopened inline detail');
  const productTrigger = host.querySelector('.transfer-editor .mx-actions button'); productTrigger.focus(); await click(productTrigger);
  trace(`opened shared product drawer: ${JSON.stringify({ text: host.querySelector('.iw-product-drawer')?.textContent, calls: calls.map(call => call.url) })}`);
  await until(() => host.textContent.includes('SYNTHETIC PRODUCT DETAIL'), 'Shared real product HTTP read after action style');
  trace('shared native product facts ready');
  assert.equal(count('/products/basics/query'), 1); assert.equal([...document.querySelectorAll('link')].filter(element => element.href.endsWith('/transfer-product.css')).length, 1);
  assert.equal([...document.querySelectorAll('link')].some(element => /product-drawer\.css$/.test(element.href)), false);
  await click(host.querySelector('[aria-label="关闭商品资料"]')); assert.ok(document.activeElement === productTrigger, 'Product close restores its focused action trigger'); await click(button('返回列表')); assert.equal(count('/transfers/query'), 1);
  console.log('PASS transfer app 3: optional product action waits one configured frame/body stylesheet, closes safely while pending, then uses the real lazy HTTP reader/shared drawer without any relative fallback CSS request or eager product reads.');

  detailMode = 'hold'; await click(host.querySelector('.transfer-view')); await until(() => heldDetails.length === 1, 'Pending detail read');
  await click(button('取消读取')); assert.equal(heldDetails[0].signal.aborted, true); await act(async () => heldDetails[0].finish(403)); await settle(); assert.ok(app.controller.authentication.getSnapshot().principal); assert.equal(app.controller.getSnapshot().phase, 'ready');
  await click(button('返回列表')); await click(host.querySelector('.transfer-view')); await until(() => heldDetails.length === 2, 'Second pending detail');
  await click(button('返回列表')); assert.equal(heldDetails[1].signal.aborted, true); detailMode = 'success'; await click(host.querySelectorAll('.transfer-view')[1]); await until(() => host.textContent.includes('TEST 当前商品 2'), 'New current detail');
  await act(async () => heldDetails[1].finish(401)); await settle(); assert.ok(app.controller.authentication.getSnapshot().principal); assert.equal(app.controller.getSnapshot().phase, 'ready'); assert.match(host.textContent, /TEST 当前商品 2/);
  await click(button('返回列表'));
  console.log('PASS transfer app 4: aborted/cancelled and closed/superseded detail late403/401s cannot expire the still-current route session or replace newer inline detail.');

  detailMode = 'forbidden'; await click(host.querySelector('.transfer-view')); await settle();
  assert.equal(app.controller.getSnapshot().phase, 'error'); assert.equal(app.controller.getSnapshot().route, 'transfers'); assert.ok(app.controller.authentication.getSnapshot().principal); assert.equal(host.querySelector('.transfer-route'), null);
  detailMode = 'success'; await click(button('SYNTHETIC retry')); await until(() => host.querySelector('.transfer-view'), 'Same-route retry after current403'); assert.equal(app.controller.getSnapshot().phase, 'ready'); assert.equal(count('/auth/session'), 1);
  listMode = 'hold'; await submit(); await until(() => heldLists.length === 1, 'Pending explicit list query');
  currentPrincipal = principal(2); await act(async () => { await app.controller.authentication.resolveSession(); }); await settle(); assert.equal(heldLists[0].signal.aborted, true); assert.equal(host.querySelector('.transfer-route'), null);
  await act(async () => heldLists[0].finish(401)); await settle(); assert.equal(app.controller.authentication.getSnapshot().principal.loginName, 'SYNTHETIC-TRANSFER-2');
  listMode = 'success'; await click(navigation('调拨单列表')); await until(() => host.querySelector('.transfer-view'), 'Fresh identity route'); detailMode = 'unauthenticated'; await click(host.querySelector('.transfer-view')); await settle();
  assert.equal(app.controller.authentication.getSnapshot().principal, null); assert.equal(host.querySelector('.demo-frame'), null); assert.match(host.textContent, /登录已失效/);
  assert.doesNotMatch(host.textContent, /SYNTHETIC PRIVATE ERROR|SYNTHETIC UNAPPLIED|TEST 当前商品/);
  await act(async () => app.dispose()); app = null; assert.equal(document.querySelectorAll('link').length, 0);
  console.log('PASS transfer app 5: current read-only403 clears route facts and permits same-route retry without destroying auth; identity replacement aborts children, old-scope401 is ignored, while a fresh current401 immediately clears auth/route facts despite its own abort cleanup.');

  currentPrincipal = principal(3); detailMode = 'success';
  app = createApplication({ http, presentation, routes: { transfers: { stylesheet: { load: async () => {}, dispose() {} }, detailStylesheet: { load: async () => {}, dispose() {} } } } });
  await act(async () => app.mount(host)); await act(async () => { await app.controller.authentication.resolveSession(); }); await settle(); await click(navigation('调拨单列表')); await until(() => host.querySelector('.transfer-view'), 'Transfer without optional product');
  await click(host.querySelector('.transfer-view')); await until(() => host.querySelector('.transfer-editor'), 'Read-only detail without product provider');
  assert.equal(host.querySelector('.transfer-editor .mx-actions button').disabled, true); assert.equal(count('/products/basics/query'), 1);
  await act(async () => app.dispose()); app = null;
  console.log('PASS transfer app 6: omitted product dependency leaves viewing explicitly disabled, not fixture/default-reader fallback; no edit/create/sales command route is activated.');
  console.log('All6 composed transfer application DOM groups passed. Real leaf/native mocked HTTP and shared drawer, not browser/layout/network/performance acceptance.');
} finally { if (app) await act(async () => app.dispose()); dom.window.close(); await rm(temporary, { recursive: true, force: true }); }
