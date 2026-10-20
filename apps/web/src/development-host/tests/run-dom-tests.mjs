import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.host-dom-'));
const dom = new JSDOM('<!doctype html><div id="naijue-erp-root"></div>', { url: 'https://synthetic.test/development/erp/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLIFrameElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLDialogElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
const configuration = { kind: 'naijue-erp-development-host', http: { origin: 'https://synthetic.test', basePath: '/api' }, assets: { basePath: '/development/erp/' }, routes: { inventory: true, sales: true, transfers: true }, session: { verifyOnMount: false } };
const assets = { entry: 'application.js', styles: { application: 'application.css', inventory: 'inventory.css', sales: 'sales.css', 'sales-detail': 'sales-detail.css', parties: 'parties.css', transfers: 'transfers.css', 'transfer-detail': 'transfer-detail.css', 'transfer-product': 'transfer-product.css' }, productDrawerStyles: 'chunks/product-drawer.css' };
let owner, act;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'dom-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const exported = await import(pathToFileURL(output).href);
  ({ act } = exported); const { mountDevelopmentHost, startDevelopmentHost, summary, detail, uuid } = exported;
  const root = document.getElementById('naijue-erp-root');
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 12)); }); };
  const until = async (check, label) => { const deadline = Date.now() + 5000; while (!check() && Date.now() < deadline) await settle(); assert.ok(check(), label); };
  const button = label => [...root.querySelectorAll('button')].find(element => element.textContent.trim() === label);
  const navigation = label => [...root.querySelectorAll('.sidebar a')].find(element => element.textContent.trim() === label);
  const click = async element => { assert.ok(element, 'Expected synthetic test control'); await act(async () => element.click()); await settle(); };
  const submit = async label => { const form = root.querySelector(`form[aria-label="${label}"]`); assert.ok(form); await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await settle(); };
  const link = name => [...document.querySelectorAll('link[rel=stylesheet]')].find(element => element.href.endsWith(`/${name}.css`));
  const style = async (name, event = 'load') => { assert.ok(link(name), `Expected ${name} CSS`); await act(async () => link(name).dispatchEvent(new Event(event))); await settle(); };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const failure = status => json({ error: { code: status === 401 ? 'UNAUTHENTICATED' : 'INVENTORY_NOT_READY', message: 'SYNTHETIC PRIVATE ERROR MUST NOT LEAK' } }, status);
  let principal = { accountId: uuid(900), staffId: uuid(901), loginName: 'SYNTHETIC-HOST-ONLY', role: 'ADMIN', hallId: null, authVersion: 1 };
  let transferMode = 'ready'; const calls = [], held = [];
  const fetch = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null; calls.push({ url, init, body });
    assert.equal(init.credentials, 'same-origin'); assert.equal(init.mode, 'same-origin'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    if (url.endsWith('/auth/session')) return json({ principal });
    if (url.endsWith('/inventory/query') || url.endsWith('/sales/query')) return failure(503);
    if (url.endsWith('/transfers/query')) {
      if (transferMode === 'hold') return new Promise(resolve => held.push({ signal: init.signal, finish: status => resolve(failure(status)) }));
      return json({ page: body.page, pageSize: body.pageSize, exactTotal: '1', items: [summary()] });
    }
    if (url.endsWith('/transfers/detail/query')) return json(detail());
    if (url.endsWith('/products/basics/query')) return json({ productId: body.productId, code: 'SYNTHETIC-PRODUCT', name: 'SYNTHETIC SHARED PRODUCT', categoryLabel: null, yearLabel: null, seasonLabel: null, supplierLabel: null, systemCode: null });
    throw new Error('Unexpected synthetic endpoint');
  };
  const environment = { document, location: dom.window.location, fetch };
  assert.throws(() => mountDevelopmentHost({ ...environment, configuration: { ...configuration, http: { origin: 'https://wrong.test', basePath: '/api' } }, assets }));
  assert.throws(() => mountDevelopmentHost({ ...environment, location: { protocol: 'http:', origin: 'http://synthetic.test' }, configuration, assets }));
  assert.equal(calls.length, 0); assert.equal(document.querySelectorAll('link').length, 0);
  await act(async () => { owner = mountDevelopmentHost({ ...environment, configuration, assets }); }); await settle();
  assert.equal(calls.length, 0); assert.equal(document.querySelectorAll('link').length, 0); assert.match(root.textContent, /尚未核验/);
  assert.throws(() => mountDevelopmentHost({ ...environment, configuration, assets }));
  await click(button('核验登录状态')); assert.equal(calls.length, 1); assert.equal(document.querySelectorAll('link').length, 0);
  assert.equal(root.querySelectorAll('.sidebar a').length, 3); assert.ok(root.querySelector('.demo-frame'));
  for (const label of ['新增调拨单', '新增销货单', '客户', '供应商', '商品信息']) assert.ok([...root.querySelectorAll('.sidebar button:disabled')].some(element => element.textContent === label));
  console.log('PASS host DOM 1: exact HTTPS origin and one-root ownership fail closed; real auth/frame mounts without account defaults, business reads, route CSS or auto-navigation; missing/new/write capabilities remain disabled.');

  await click(navigation('库存状况表')); assert.ok(link('inventory')); assert.equal(calls.length, 1);
  await click(button('取消加载')); await style('inventory'); assert.equal(owner.controller.getSnapshot().phase, 'cancelled'); assert.equal(root.querySelector('.iw-workbench'), null);
  await click(button('重新加载页面')); await until(() => root.querySelector('.iw-workbench'), 'Actual inventory page'); assert.equal(calls.length, 1);
  await submit('库存筛选'); assert.equal(calls.length, 2); assert.match(root.textContent, /未完成|未能完成|未就绪/); assert.doesNotMatch(root.textContent, /SYNTHETIC PRIVATE ERROR MUST NOT LEAK/);
  await click(button('关闭当前页')); assert.equal(owner.controller.getSnapshot().phase, 'home');
  await click(navigation('销货单列表')); assert.ok(link('sales')); assert.equal(link('sales-detail'), undefined); await style('sales', 'error');
  assert.equal(owner.controller.getSnapshot().phase, 'error'); assert.match(root.textContent, /页面未能加载/); await click(button('重试页面')); await style('sales');
  await until(() => root.querySelector('.sales-workbench'), 'Actual sales page'); assert.equal(calls.length, 2); assert.equal(link('sales-detail'), undefined);
  await submit('销货筛选'); assert.equal(calls.length, 3); assert.doesNotMatch(root.textContent, /SYNTHETIC PRIVATE ERROR MUST NOT LEAK/);
  console.log('PASS host DOM 2: inventory cancellation/late CSS and sales CSS failure/retry use real lazy routes; queries require explicit submit and 503 is not fabricated empty success.');

  await click(navigation('调拨单列表')); assert.ok(link('transfers')); assert.equal(link('transfer-detail'), undefined); assert.equal(link('transfer-product'), undefined); assert.equal(calls.length, 3);
  await style('transfers'); await until(() => root.querySelector('.transfer-view'), 'One actual bounded transfer first page'); assert.equal(calls.length, 4); assert.equal(calls.at(-1).body.pageSize, 20);
  await click(navigation('调拨单列表')); assert.equal(calls.length, 4);
  await click(root.querySelector('.transfer-view')); assert.ok(link('transfer-detail')); assert.equal(calls.length, 4); await style('transfer-detail');
  await until(() => root.querySelector('.transfer-editor'), 'Actual native transfer detail'); assert.equal(calls.length, 5); assert.equal(link('transfer-product'), undefined);
  await click(root.querySelector('.transfer-editor .mx-actions button')); await until(() => link('transfer-product'), 'Shared product action CSS'); assert.equal(calls.length, 5);
  await style('transfer-product'); await until(() => root.textContent.includes('SYNTHETIC SHARED PRODUCT'), 'Actual lazy product reader/drawer'); assert.equal(calls.length, 6);
  assert.equal([...document.querySelectorAll('link')].some(element => /chunks\/product-drawer\.css$/.test(element.href)), false);
  await click(root.querySelector('[aria-label="关闭商品资料"]')); await click(button('返回列表')); assert.equal(calls.length, 6);
  console.log('PASS host DOM 3: transfer navigation makes one bounded native query; detail and reused product drawer wait separate action CSS/code and real fixed HTTP adapters, without relative fallback CSS or extra list query.');

  await click(button('关闭当前页')); transferMode = 'hold'; await click(navigation('调拨单列表')); await until(() => held.length === 1, 'Held real-adapter transfer query');
  principal = { ...principal, accountId: uuid(902), authVersion: 2 };
  await act(async () => { await owner.controller.authentication.resolveSession(); }); await settle();
  assert.equal(held[0].signal.aborted, true); assert.equal(owner.controller.getSnapshot().phase, 'home');
  await act(async () => held[0].finish(401)); await settle(); assert.equal(owner.controller.authentication.getSnapshot().principal.accountId, uuid(902));
  await click(navigation('调拨单列表')); await until(() => held.length === 2, 'Fresh held transfer query'); await act(async () => held[1].finish(401)); await settle();
  assert.equal(owner.controller.authentication.getSnapshot().principal, null); assert.equal(root.querySelector('.demo-frame'), null);
  await act(async () => owner.dispose()); assert.equal(document.querySelectorAll('link').length, 0); assert.equal(root.childElementCount, 0);
  console.log('PASS host DOM 4: host preserves identity-scope invalidation, stale401 isolation, current401 expiry and deterministic root/CSS disposal.');

  const data = document.createElement('script'); data.id = 'naijue-erp-development-configuration'; data.type = 'application/json';
  data.textContent = JSON.stringify({ configuration: { ...configuration, routes: { inventory: true, sales: false, transfers: false }, session: { verifyOnMount: true } }, assets }); document.body.append(data);
  principal = { ...principal, accountId: uuid(903), authVersion: 3 };
  const before = calls.length;
  await act(async () => { owner = startDevelopmentHost(environment); }); await settle(); assert.equal(calls.length, before + 1); assert.equal(calls.at(-1).url, 'https://synthetic.test/api/auth/session');
  assert.equal(root.querySelectorAll('.sidebar a').length, 1); assert.equal(document.querySelectorAll('link').length, 0);
  await click(navigation('库存状况表')); await style('inventory'); await until(() => root.querySelector('.iw-workbench'), 'Page before bfcache invalidation');
  const oldController = owner.controller; const oldScope = oldController.getSnapshot().scope;
  await act(async () => dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }))); assert.equal(oldScope.active, false); assert.equal(oldController.getSnapshot().phase, 'disposed'); assert.equal(root.childElementCount, 0);
  await act(async () => dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }))); await settle();
  assert.notEqual(owner.controller, oldController); assert.equal(owner.controller.getSnapshot().phase, 'home'); assert.equal(calls.length, before + 2); assert.equal(document.querySelectorAll('link').length, 0);
  await act(async () => owner.dispose()); await act(async () => dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }))); assert.equal(calls.length, before + 2);
  data.textContent = JSON.stringify({ configuration, assets, principal: 'SYNTHETIC' }); assert.throws(() => startDevelopmentHost(environment));
  data.remove(); assert.throws(() => startDevelopmentHost(environment));
  console.log('PASS host DOM 5: explicit bootstrap session verification is exactly once per owner; false routes have no target; pagehide discards stale identity/read state and bfcache restore recreates only the configured unselected host; invalid payload never starts.');
  console.log('SYNTHETIC ONLY: mocked fetch, CSS events and jsdom; no browser, TLS/cookie, server, DB, pixel, timing or performance acceptance.');
} finally {
  if (owner) { if (act) await act(async () => owner.dispose()); else owner.dispose(); }
  dom.window.close(); await rm(temporary, { recursive: true, force: true });
}
