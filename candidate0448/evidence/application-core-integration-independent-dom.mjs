import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Entirely local mocked DOM/HTTP/CSS events. No resources loader, listener or browser.
const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.application-core-independent-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLIFrameElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLDialogElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = media => ({ matches: false, media, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
let app, root, act;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'application-core-integration-independent-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { createElement: h, StrictMode, renderToStaticMarkup, createRoot, createApplication, ApplicationController, createDemoFrameWorkspaceRenderer, createRouteStylesheet, ProductDrawerHost, ReadContext, summary, detail, warehouse, uuid } = await import(pathToFileURL(output).href);
  ({ act } = await import(pathToFileURL(output).href));
  const host = document.getElementById('root');
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 12)); });
  const until = async (check, description) => { const deadline = Date.now() + 5000; while (!check() && Date.now() < deadline) await settle(); assert.ok(check(), description); };
  const click = async element => { assert.ok(element, 'Expected independent probe control'); await act(async () => element.click()); await settle(); };
  const button = text => [...host.querySelectorAll('button')].find(element => element.textContent.trim() === text);
  const change = async (element, value) => { assert.ok(element); await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); }); await settle(); };
  const submit = async form => { assert.ok(form); await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await settle(); };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const denied = status => json({ error: { code: status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', message: 'PRIVATE ERROR NEVER DISPLAY' } }, status);
  const principal = revision => ({ accountId: uuid(900 + revision), staffId: uuid(950 + revision), loginName: `INDEPENDENT-${revision}`, role: 'WAREHOUSE', hallId: null, authVersion: revision });
  let currentPrincipal = principal(1), productMode = 'hold', listMode = 'success', detailMode = 'success', partyMode = 'success';
  let requestKeys = 0;
  const calls = [], products = [], lists = [], commands = [];
  const partyRecord = { id: uuid(401), code: 'INDEPENDENT-CUSTOMER', name: 'INDEPENDENT CUSTOMER', enabled: true, version: 1, createdAt: null, updatedAt: null };
  const http = { origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null; const call = { url, body, signal: init.signal }; calls.push(call);
    assert.equal(init.mode, 'same-origin'); assert.equal(init.credentials, 'same-origin'); assert.equal(init.redirect, 'error');
    if (url.endsWith('/auth/session')) return json({ principal: currentPrincipal });
    if (url.endsWith('/transfers/query')) {
      const result = { page: body.page, pageSize: body.pageSize, exactTotal: '1', items: [summary(1)] };
      if (listMode === 'hold') return new Promise(resolve => lists.push({ ...call, finish: status => resolve(status === 200 ? json(result) : denied(status)) }));
      if (listMode === 'forbidden') return denied(403);
      return json(result);
    }
    if (url.endsWith('/transfers/detail/query')) return detailMode === 'forbidden' ? denied(403) : json(detail(1));
    if (url.endsWith('/transfers/warehouses/query')) return json({ page: body.page, pageSize: body.pageSize, exactTotal: '1', items: [warehouse()] });
    if (url.endsWith('/products/basics/query')) {
      const facts = { productId: body.productId, code: 'INDEPENDENT-PRODUCT', name: 'INDEPENDENT PRODUCT FACTS', categoryLabel: null, yearLabel: null, seasonLabel: null, supplierLabel: null, systemCode: null };
      if (productMode === 'hold') return new Promise(resolve => products.push({ ...call, finish: status => resolve(status === 200 ? json(facts) : denied(status)) }));
      return productMode === 'success' ? json(facts) : denied(productMode === 'forbidden' ? 403 : 401);
    }
    if (url.endsWith('/sales/query')) return denied(403);
    const parsed = new URL(url);
    if (parsed.pathname === '/api/customers') return json({ page: Number(parsed.searchParams.get('page')), pageSize: Number(parsed.searchParams.get('pageSize')), total: 1, items: [partyRecord] });
    if (parsed.pathname === `/api/customers/${partyRecord.id}`) return json(partyRecord);
    if (parsed.pathname === '/api/customers/commands') { commands.push(body); throw new Error('Synthetic lost command response'); }
    if (parsed.pathname.startsWith('/api/customers/receipts/')) return partyMode === 'forbidden' ? denied(403) : json({ error: { code: 'RECEIPT_NOT_FOUND', message: 'Not found' } }, 404);
    throw new Error(`Unexpected mocked endpoint: ${url}`);
  } };
  const count = suffix => calls.filter(call => call.url.endsWith(suffix)).length;
  const sheet = name => createRouteStylesheet({ document, origin: http.origin, href: `/approved/${name}.css` });
  const findSheet = name => [...document.querySelectorAll('link')].find(link => link.href.endsWith(`/${name}.css`));
  const eventSheet = async (name, event) => { const link = findSheet(name); assert.ok(link, `Expected ${name} link`); await act(async () => link.dispatchEvent(new Event(event))); await settle(); };
  const noopSheet = () => ({ load: async () => {}, dispose() {} });
  const presentation = { renderWorkspace: createDemoFrameWorkspaceRenderer(), renderRouteState: ({ controller, state }) => h('section', { 'data-independent-phase': state.phase }, state.phase,
    state.phase === 'loading' ? h('button', { onClick: () => controller.cancelRoute() }, 'Independent cancel route') : null,
    ['error', 'cancelled'].includes(state.phase) ? h('button', { onClick: () => { void controller.navigate(state.route); } }, 'Independent retry route') : null) };

  // Pure presentation cannot inspect/authenticate the principal or activate capabilities.
  let navigations = 0;
  const staticMarkup = renderToStaticMarkup(createDemoFrameWorkspaceRenderer()({ principal: principal(1), controller: { routes: ['transfers', 'customers', 'suppliers'], navigate() { navigations++; } }, state: { route: 'customers', notice: null }, routeContent: h('p', null, 'INDEPENDENT CONTENT') }));
  assert.equal(navigations, 0); assert.equal(calls.length, 0); assert.match(staticMarkup, /客户<\/a>/); assert.match(staticMarkup, /供应商<\/a>/); assert.doesNotMatch(staticMarkup, /往来单位|INDEPENDENT-1|auth-panel/);
  const missing = new ApplicationController({ http, presentation, routes: {} });
  await missing.authentication.resolveSession(); const beforeMissing = calls.length;
  assert.deepEqual(missing.routes, []); assert.equal(await missing.navigate('transfers'), false); assert.equal(calls.length, beforeMissing); assert.equal(document.querySelectorAll('link').length, 0); missing.dispose(); calls.length = 0;
  console.log('PASS independent 1: pure shared frame has separate customers/suppliers, no identity work or automatic navigation; omitted transfer capability rejects activation without styles or business reads.');

  const routeSheet = sheet('independent-transfer'), detailSheet = sheet('independent-detail'), productSheet = sheet('independent-product');
  app = createApplication({ http, presentation, routes: { transfers: { stylesheet: routeSheet, detailStylesheet: detailSheet, product: { stylesheet: productSheet } }, sales: { stylesheet: noopSheet() }, parties: { stylesheet: noopSheet(), newRequestKey: () => uuid(990 + ++requestKeys) } } });
  assert.equal(calls.length, 0); await act(async () => app.mount(host)); await settle(); assert.equal(calls.length, 0); assert.equal(document.querySelectorAll('link').length, 0);
  await act(async () => app.controller.authentication.resolveSession()); await settle(); assert.equal(count('/auth/session'), 1); assert.equal(document.querySelectorAll('link').length, 0);
  assert.ok(host.querySelector('.auth-session')); assert.ok(host.querySelector('.demo-frame')); assert.equal(host.querySelector('.topbar .auth-session'), null);
  await act(async () => { void app.controller.navigate('transfers'); }); await until(() => findSheet('independent-transfer'), 'Explicit transfer stylesheet');
  await eventSheet('independent-transfer', 'error'); assert.equal(app.controller.getSnapshot().phase, 'error'); assert.equal(count('/transfers/query'), 0);
  await click(button('Independent retry route')); await eventSheet('independent-transfer', 'load'); await until(() => host.querySelector('.transfer-view'), 'First native transfer page');
  assert.equal(count('/transfers/query'), 1); assert.equal(calls.find(call => call.url.endsWith('/transfers/query')).body.pageSize, 20);
  assert.equal(count('/transfers/detail/query'), 0); assert.equal(count('/transfers/warehouses/query'), 0); assert.equal(count('/products/basics/query'), 0); assert.equal(findSheet('independent-detail'), undefined); assert.equal(findSheet('independent-product'), undefined);
  await act(async () => app.controller.navigate('transfers')); await settle(); assert.equal(count('/transfers/query'), 1);
  console.log('PASS independent 2: construction/mount/auth are inert; explicit transfer route CSS failure/retry creates exactly one bounded first-page native read, with hidden detail/product/candidate CSS and reads absent.');

  await click(host.querySelector('.transfer-view')); await eventSheet('independent-detail', 'error'); assert.ok(button('重试加载')); assert.equal(app.controller.getSnapshot().phase, 'ready'); assert.equal(count('/transfers/detail/query'), 0);
  await click(button('重试加载')); await click(button('返回列表')); await eventSheet('independent-detail', 'load'); assert.equal(count('/transfers/detail/query'), 0);
  await click(host.querySelector('.transfer-view')); await until(() => host.querySelector('.transfer-editor'), 'Native transfer detail'); assert.equal(count('/transfers/detail/query'), 1); assert.equal(count('/transfers/query'), 1);
  await click(host.querySelector('.transfer-editor .mx-actions button')); await eventSheet('independent-product', 'error'); assert.ok(button('重试商品样式')); assert.equal(count('/products/basics/query'), 0);
  await click(button('重试商品样式')); await click(button('取消商品查看')); await eventSheet('independent-product', 'load'); assert.equal(host.querySelector('.iw-product-drawer'), null); assert.equal(count('/products/basics/query'), 0);
  await click(host.querySelector('.transfer-editor .mx-actions button')); await until(() => products.length === 1, 'Product native HTTP read after configured CSS');
  assert.equal(document.querySelectorAll('link').length, 3); assert.ok([...document.querySelectorAll('link')].every(link => link.href.includes('/approved/')));
  await click(host.querySelector('[aria-label="关闭商品资料"]')); assert.equal(products[0].signal.aborted, true); await act(async () => products[0].finish(401)); await settle();
  assert.ok(app.controller.authentication.getSnapshot().principal); assert.equal(app.controller.getSnapshot().phase, 'ready'); assert.equal(host.querySelector('.iw-product-drawer'), null);
  await click(host.querySelector('.transfer-editor .mx-actions button')); await until(() => products.length === 2, 'Second scoped product read'); await click(button('取消读取')); assert.equal(products[1].signal.aborted, true);
  await act(async () => products[1].finish(403)); await settle(); assert.ok(app.controller.getSnapshot().scope.active); assert.ok(app.controller.authentication.getSnapshot().principal);
  await click(host.querySelector('[aria-label="关闭商品资料"]'));
  console.log('PASS independent 3: detail/product CSS failures retry locally; cancel ignores late readiness; real configured product read never inserts relative fallback CSS; closed/cancelled product late401/403 cannot clear current auth/route.');

  productMode = 'success'; await click(host.querySelector('.transfer-editor .mx-actions button')); await until(() => host.textContent.includes('INDEPENDENT PRODUCT FACTS'), 'Completed synchronous native product response after configured CSS');
  await click(host.querySelector('[aria-label="关闭商品资料"]'));
  productMode = 'forbidden'; await click(host.querySelector('.transfer-editor .mx-actions button')); await until(() => app.controller.getSnapshot().phase === 'error', 'Current product403 route failure');
  assert.equal(app.controller.getSnapshot().route, 'transfers'); assert.ok(app.controller.authentication.getSnapshot().principal); assert.equal(host.querySelector('.transfer-route'), null);
  productMode = 'success'; await click(button('Independent retry route')); await until(() => host.querySelector('.transfer-view'), 'Same-menu transfer retry');
  assert.equal(count('/auth/session'), 1); const retainedScope = app.controller.getSnapshot().scope;
  listMode = 'hold'; await submit(host.querySelector('form[aria-label="调拨筛选"]')); await until(() => lists.length === 1, 'Held current transfer query');
  await act(async () => app.controller.navigate('sales')); await settle(); assert.equal(lists[0].signal.aborted, true); assert.equal(retainedScope.active, false);
  await act(async () => lists[0].finish(401)); await settle(); assert.ok(app.controller.authentication.getSnapshot().principal); assert.equal(app.controller.getSnapshot().route, 'sales');
  const salesScope = app.controller.getSnapshot().scope; await submit(host.querySelector('form[aria-label="销货筛选"]')); assert.equal(app.controller.getSnapshot().phase, 'ready'); assert.equal(app.controller.getSnapshot().scope, salesScope); assert.ok(salesScope.active); assert.ok(app.controller.authentication.getSnapshot().principal);
  listMode = 'success'; await act(async () => app.controller.navigate('transfers')); await until(() => host.querySelector('.transfer-view'), 'Transfer return'); await click(host.querySelector('.transfer-view')); await until(() => host.querySelector('.transfer-editor'), 'Product fresh401 detail');
  productMode = 'unauthenticated'; await click(host.querySelector('.transfer-editor .mx-actions button')); await until(() => !app.controller.authentication.getSnapshot().principal, 'Fresh product401 global expiry');
  assert.equal(host.querySelector('.demo-frame'), null); assert.doesNotMatch(host.textContent, /PRIVATE ERROR NEVER DISPLAY|INDEPENDENT PRODUCT FACTS/);
  console.log('PASS independent 4: fresh product403 is transfer-local and same-menu retryable; superseded list401 is ignored; sales403 is not generalized into route disposal; fresh product401 clears the whole authenticated workspace.');

  currentPrincipal = principal(2); await act(async () => app.controller.authentication.resolveSession()); await act(async () => app.controller.navigate('customers')); await until(() => host.querySelector('.party-edit'), 'Independent real party route');
  await click(host.querySelector('.party-edit')); await until(() => host.querySelector('.arco-modal input[aria-label="客户名称"]'), 'Real party editor');
  await change(host.querySelector('.arco-modal input[aria-label="客户名称"]'), 'INDEPENDENT ORIGINAL UNCERTAIN'); await click(button('确定')); await until(() => button('查询原操作回执'), 'Unknown operation recovery');
  assert.equal(requestKeys, 1); assert.equal(commands.length, 1); const original = { ...commands[0] }; const partyScope = app.controller.getSnapshot().scope;
  await click(button('查询原操作回执')); assert.equal(app.controller.getSnapshot().phase, 'ready'); assert.ok(app.controller.getSnapshot().scope === partyScope, 'Party scope retained for absent receipt'); assert.ok(partyScope.active); assert.ok(app.controller.authentication.getSnapshot().principal);
  assert.equal(host.querySelector('.arco-modal input[aria-label="客户名称"]').value, original.name); assert.ok(button('重放原请求')); let leftParty; await act(async () => { leftParty = await app.controller.navigate('sales'); }); assert.equal(leftParty, false); assert.equal(app.controller.getSnapshot().notice, 'cannot-leave');
  await click(button('重放原请求')); assert.equal(commands.length, 2); assert.deepEqual(commands[1], original); assert.equal(requestKeys, 1);
  await act(async () => app.dispose()); app = null; assert.equal(document.querySelectorAll('link').length, 0); assert.equal(host.childNodes.length, 0);
  console.log('PASS independent 5: absent party receipt preserves unknown command identity/content, dirty editor and navigation guard; exact replay reuses the original key; app disposal clears DOM and configured stylesheet owners. Current party403 defect is separately reproduced, not accepted by this pass.');

  // Shared module code is already cached from the real action above. Each new
  // attachment must still await its own explicit CSS owner, including disposal.
  const context = new ReadContext({ accountId: 'INDEPENDENT', sessionRevision: '1', permissionRevision: '1' });
  let scope = context.createScope('independent-style-a'), opened = true, loader;
  const reads = [], reader = { readProductBasics: read => new Promise(resolve => reads.push({ read, resolve })), readProductSpecifications: async () => null, readProductImages: async () => null, readProductImage: async () => { throw new Error('Unexpected image'); } };
  root = createRoot(host);
  const draw = () => root.render(h(StrictMode, null, opened ? h(ProductDrawerHost, { parentScope: scope, product: { id: 'INDEPENDENT-PRODUCT', label: 'INDEPENDENT PRODUCT' }, reader, loadStyles: loader, close() { opened = false; draw(); } }) : null));
  const ownerA = sheet('independent-owner-a'); loader = ownerA.load; await act(async () => draw()); await until(() => findSheet('independent-owner-a'), 'Configured attachment A'); assert.equal(reads.length, 0);
  await eventSheet('independent-owner-a', 'load'); await until(() => reads.length === 1, 'Exactly one StrictMode transport for attachment A');
  await click(host.querySelector('[aria-label="关闭商品资料"]')); assert.ok(reads.every(item => item.read.signal.aborted));
  const ownerB = sheet('independent-owner-b'); loader = ownerB.load; scope = context.createScope('independent-style-b'); opened = true; await act(async () => draw()); await until(() => findSheet('independent-owner-b'), 'Configured attachment B'); assert.equal(reads.length, 1);
  await act(async () => ownerB.dispose()); await until(() => button('重试加载'), 'Pending configured style disposal failure'); assert.equal(reads.length, 1); assert.equal(findSheet('independent-owner-b'), undefined);
  await click(host.querySelector('[aria-label="关闭商品资料"]')); ownerA.dispose(); context.clear(); await act(async () => root.unmount()); root = null; assert.equal(document.querySelectorAll('link').length, 0);
  console.log('PASS independent 6: cached shared product code does not bypass a different attachment stylesheet; StrictMode starts one real read; pending stylesheet disposal cannot mount content or fall back to a relative CSS fetch.');
  console.log('All six independent integration groups passed. Synthetic DOM/static bundling only, not browser visual/network/performance/DB/server acceptance.');
} finally {
  if (app) await act(async () => app.dispose());
  if (root) await act(async () => root.unmount());
  dom.window.close(); await rm(temporary, { recursive: true, force: true });
}
