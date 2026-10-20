import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.sales-app-check-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLIFrameElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLDialogElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
let app, act;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'sales-dom-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { createElement: h, createApplication, ApplicationController, createRouteStylesheet, createDemoFrameWorkspaceRenderer, summary, detail, uuid, act: importedAct } = await import(pathToFileURL(output).href);
  act = importedAct;
  const host = document.getElementById('root');
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 12)); }); };
  const until = async (check, label) => { const deadline = Date.now() + 5000; while (!check() && Date.now() < deadline) await settle(); assert.ok(check(), label); };
  const click = async element => { assert.ok(element, 'Expected composed control'); assert.notEqual(element.disabled, true); await act(async () => element.click()); await settle(); };
  const button = text => [...host.querySelectorAll('button')].find(element => element.textContent.trim() === text && !element.closest('[hidden]'));
  const navigation = () => [...host.querySelectorAll('.sidebar a')].find(element => element.textContent.trim() === '销货单列表');
  const submit = async () => { const form = host.querySelector('form[aria-label="销货筛选"]'); assert.ok(form); await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await settle(); };
  const change = async (input, value) => { assert.ok(input); await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }); await settle(); };
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  const denied = () => json({ error: { code: 'UNAUTHENTICATED', message: 'SYNTHETIC PRIVATE ERROR' } }, 401);
  const principal = n => ({ accountId: uuid(900 + n), staffId: uuid(950 + n), loginName: `SYNTHETIC-SALES-${n}`, role: 'WAREHOUSE', hallId: null, authVersion: n });
  let currentPrincipal = principal(1), detailMode = 'success';
  const calls = [], heldDetails = [];
  const http = { origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null; const call = { url, body, signal: init.signal }; calls.push(call);
    assert.equal(init.credentials, 'same-origin'); assert.equal(init.mode, 'same-origin'); assert.equal(init.redirect, 'error');
    if (url.endsWith('/auth/session')) return json({ principal: currentPrincipal });
    if (url.endsWith('/sales/query')) return json({ page: body.page, pageSize: body.pageSize, exactTotal: '2', items: [summary(1), summary(2)] });
    if (url.endsWith('/sales/detail/query')) {
      if (detailMode === 'unauthenticated') return denied();
      const result = detail(Number(body.salesId.slice(-12)));
      if (detailMode === 'hold') return new Promise(resolve => heldDetails.push({ ...call, finish: (status = 200) => resolve(status === 401 ? denied() : json(result)) }));
      return json(result);
    }
    throw new Error('Unexpected synthetic endpoint');
  } };
  const count = suffix => calls.filter(call => call.url.endsWith(suffix)).length;
  const sheet = name => createRouteStylesheet({ document, origin: http.origin, href: `/approved/${name}.css` });
  const routeStyles = sheet('sales'), detailStyles = sheet('sales-detail');
  const style = name => [...document.querySelectorAll('link[rel=stylesheet]')].find(element => element.href.endsWith(`/${name}.css`));
  const styleEvent = async (name, event = 'load') => { const link = style(name); assert.ok(link, `Expected ${name} stylesheet`); await act(async () => link.dispatchEvent(new Event(event))); await settle(); };
  const presentation = { renderWorkspace: createDemoFrameWorkspaceRenderer(), renderRouteState: ({ controller, state }) => h('div', { 'data-test-state': state.phase }, `SYNTHETIC ${state.phase}`, state.phase === 'loading' ? h('button', { onClick: () => controller.cancelRoute() }, 'SYNTHETIC cancel') : null) };
  const configuration = { http, presentation, routes: { sales: { stylesheet: routeStyles, detailStylesheet: detailStyles } } };
  for (const detailStylesheet of [null, {}, { load: async () => {} }, { dispose() {} }, { load: 1, dispose() {} }]) assert.throws(() => new ApplicationController({ ...configuration, routes: { sales: { stylesheet: routeStyles, detailStylesheet } } }), TypeError);
  assert.equal(calls.length, 0); assert.equal(document.querySelectorAll('link').length, 0);
  app = createApplication(configuration); await act(async () => app.mount(host)); await settle();
  await act(async () => { await app.controller.authentication.resolveSession(); }); await settle();
  assert.equal(calls.length, 1); assert.equal(document.querySelectorAll('link').length, 0);
  await click(navigation()); assert.ok(style('sales')); assert.equal(style('sales-detail'), undefined); assert.equal(count('/sales/query'), 0);
  await styleEvent('sales'); await until(() => host.querySelector('.sales-workbench'), 'Actual sales route');
  assert.equal(count('/sales/query'), 0); assert.equal(count('/sales/detail/query'), 0); assert.equal(count('/sales/references/query'), 0);
  await submit(); assert.equal(count('/sales/query'), 1); assert.equal(host.querySelectorAll('.sales-list tbody tr').length, 2); assert.equal(style('sales-detail'), undefined);
  console.log('PASS sales app 1: malformed optional CSS capability fails closed; auth/route/query never loads detail styles or reads detail/references; actual list uses one explicit bounded query.');

  await click(host.querySelector('.tc-filter-toggle')); await change(host.querySelector('.tc-filter-secondary input'), 'SYNTHETIC UNAPPLIED');
  const list = host.querySelector('[data-document-list=sales]'), region = host.querySelector('.sales-results'); region.scrollTop = 180; region.scrollLeft = 90;
  const trigger = host.querySelector('.sales-view'); trigger.focus(); await click(trigger);
  assert.equal(list.hidden, true); assert.ok(style('sales-detail')); assert.equal(count('/sales/detail/query'), 0); assert.equal(host.querySelector('dialog'), null); assert.ok(button('返回列表'));
  await styleEvent('sales-detail', 'error'); assert.match(host.querySelector('.sales-detail-loading').textContent, /样式加载失败/); assert.equal(count('/sales/detail/query'), 0); assert.equal(style('sales-detail'), undefined);
  await click(button('重试加载')); assert.ok(style('sales-detail')); assert.equal(count('/sales/detail/query'), 0);
  await click(button('返回列表')); await styleEvent('sales-detail'); assert.equal(host.querySelector('.sales-detail-loading'), null); assert.equal(host.querySelector('.sales-detail-facts'), null); assert.equal(count('/sales/detail/query'), 0);
  assert.equal(list.hidden, false); assert.ok(document.activeElement === trigger); assert.equal(region.scrollTop, 180); assert.equal(region.scrollLeft, 90); assert.equal(host.querySelector('.tc-filter-secondary input').value, 'SYNTHETIC UNAPPLIED'); assert.equal(count('/sales/query'), 1);
  console.log('PASS sales app 2: action CSS failure stays local and retryable; visible Back works while retry is pending; late CSS cannot read/reopen, and retained list/draft/focus/scroll survive without refetch.');

  trigger.focus(); await click(trigger); await until(() => host.textContent.includes('TEST 保存商品 1'), 'Current full-page sales detail');
  assert.equal(host.querySelector('dialog'), null); assert.equal(host.querySelector('.sales-detail-facts').hasAttribute('aria-modal'), false); assert.equal(count('/sales/detail/query'), 1); assert.equal(list.hidden, true); assert.equal(document.querySelectorAll('link').length, 2);
  assert.equal([...document.querySelectorAll('link')].some(element => /(?:chunks\/|about:blank|detail\.css$)/.test(element.href) && !element.href.endsWith('/sales-detail.css')), false);
  for (const label of ['导出', '打印', '操作历史']) assert.equal([...host.querySelectorAll('.sales-detail-facts button')].find(element => element.textContent.trim() === label).disabled, true);
  await click(button('返回列表')); assert.equal(list.hidden, false); assert.ok(document.activeElement === trigger); assert.equal(count('/sales/query'), 1);
  console.log('PASS sales app 3: configured readiness reaches actual full-page read-only detail via one target HTTP read, no modal/history or relative CSS fallback; Back restores original list.');

  detailMode = 'hold'; await click(trigger); await until(() => heldDetails.length === 1, 'Pending composed detail'); await click(button('取消读取')); assert.equal(heldDetails[0].signal.aborted, true); await act(async () => heldDetails[0].finish(401)); await settle(); assert.ok(app.controller.authentication.getSnapshot().principal); assert.equal(app.controller.getSnapshot().phase, 'ready');
  await click(button('返回列表')); await click(trigger); await until(() => heldDetails.length === 2, 'Second pending composed detail'); await click(button('返回列表')); assert.equal(heldDetails[1].signal.aborted, true);
  detailMode = 'success'; await click(host.querySelectorAll('.sales-view')[1]); await until(() => host.textContent.includes('TEST 保存商品 2'), 'New target detail'); await act(async () => heldDetails[1].finish(401)); await settle(); assert.equal(app.controller.authentication.getSnapshot().principal.loginName, 'SYNTHETIC-SALES-1'); assert.match(host.querySelector('.sales-detail-facts').textContent, /TEST 保存商品 2/); await click(button('返回列表'));
  console.log('PASS sales app 4: cancel/Back abort current detail reads; abort-ignoring late401 cannot expire current identity or replace a newer target.');

  detailMode = 'hold'; await click(trigger); await until(() => heldDetails.length === 3, 'Detail before identity replacement'); currentPrincipal = principal(2);
  await act(async () => { await app.controller.authentication.resolveSession(); }); await settle(); assert.equal(heldDetails[2].signal.aborted, true); assert.equal(host.querySelector('.sales-route'), null); assert.equal(app.controller.getSnapshot().phase, 'home');
  await act(async () => heldDetails[2].finish(401)); await settle(); assert.equal(app.controller.authentication.getSnapshot().principal.loginName, 'SYNTHETIC-SALES-2');
  await click(navigation()); await until(() => host.querySelector('.sales-workbench'), 'Fresh-identity sales route'); await submit(); detailMode = 'unauthenticated'; await click(host.querySelector('.sales-view')); await until(() => app.controller.authentication.getSnapshot().principal === null, 'Fresh current401 expiry');
  assert.equal(host.querySelector('.sales-route'), null); assert.equal(host.querySelector('.demo-frame'), null); assert.doesNotMatch(host.textContent, /SYNTHETIC PRIVATE ERROR|SYNTHETIC UNAPPLIED|TEST 保存商品/);
  await act(async () => app.dispose()); app = null; assert.equal(document.querySelectorAll('link').length, 0);
  console.log('PASS sales app 5: identity replacement aborts old detail before publishing new principal; old401 is ignored, current401 clears authenticated facts, and disposal releases route plus action CSS.');

  currentPrincipal = principal(3); detailMode = 'success'; let disposed = 0, loaded = 0;
  const shared = { load: async () => { loaded++; }, dispose: () => { disposed++; } };
  app = createApplication({ http, presentation, routes: { sales: { stylesheet: shared } } }); await act(async () => app.mount(host)); await act(async () => { await app.controller.authentication.resolveSession(); }); await settle(); await click(navigation()); await until(() => host.querySelector('.sales-workbench'), 'Sales list without detail capability'); await submit();
  const beforeDisabled = count('/sales/detail/query'); for (const action of host.querySelectorAll('.sales-view,.sales-number')) { assert.equal(action.disabled, true); assert.match(action.title, /详情样式尚未配置/); await act(async () => action.click()); }
  assert.equal(count('/sales/detail/query'), beforeDisabled); assert.equal(host.querySelector('.sales-detail-loading'), null); assert.equal(document.querySelectorAll('link').length, 0); assert.equal(loaded, 1); await act(async () => app.dispose()); app = null; assert.equal(disposed, 1);
  const alias = new ApplicationController({ http, presentation, routes: { sales: { stylesheet: shared, detailStylesheet: shared } } }); alias.dispose(); alias.dispose(); assert.equal(disposed, 2); assert.equal(loaded, 1);
  console.log('PASS sales app 6: omitted detail capability preserves usable list but visibly disables both viewing controls, without fallback CSS/data; aliased route/action owners dispose exactly once and never load during cleanup.');
  console.log('All 6 composed sales application DOM groups passed. Mocked native HTTP/CSS events only, not browser/layout/network/performance or production acceptance.');
} finally { if (app) await act(async () => app.dispose()); dom.window.close(); await rm(temporary, { recursive: true, force: true }); }
