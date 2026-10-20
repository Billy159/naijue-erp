import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.dom-check-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLIFrameElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLDialogElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
let app;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'dom-entry.tsx')], outfile: output, bundle: true,
    platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { act, createElement: h, createApplication, ApplicationController, createRouteStylesheet } = await import(pathToFileURL(output).href);
  const host = document.getElementById('root');
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 12)); }); };
  const click = async element => { assert.ok(element, 'Expected synthetic control'); await act(async () => element.click()); await settle(); };
  const button = label => [...host.querySelectorAll('button')].find(element => element.textContent.trim() === label);
  const submit = async form => { assert.ok(form); await act(async () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))); await settle(); };
  const change = async (input, value) => { assert.ok(input); await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  }); await settle(); };
  const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  let currentPrincipal = null;
  const principal = (n, role = 'ADMIN', authVersion = 1) => ({ accountId: uuid(n), staffId: uuid(n + 10), loginName: `SYNTHETIC-${n}`, role, hallId: null, authVersion });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const error = (code, status) => json({ error: { code, message: 'SYNTHETIC SERVER ERROR MUST NOT LEAK' } }, status);
  const calls = []; const held = []; const heldPartyWrites = []; const receipts = new Map();
  let inventoryMode = 'hold', salesMode = 'unavailable', partyMode = 'normal', receiptMode = 'normal', keyCount = 0;
  const partyRows = {
    customers: [{ id: uuid(101), code: ' SYNTHETIC-OLD-CUSTOMER ', name: 'SYNTHETIC CUSTOMER', enabled: true, version: 7, createdAt: null, updatedAt: null }],
    suppliers: [{ id: uuid(201), code: ' SYNTHETIC-OLD-SUPPLIER ', name: 'SYNTHETIC SUPPLIER', enabled: true, version: 4, createdAt: null, updatedAt: null }],
  };
  const http = { origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.credentials, 'same-origin'); assert.equal(init.mode, 'same-origin'); assert.equal(init.redirect, 'error');
    if (url.endsWith('/auth/session')) return json({ principal: currentPrincipal });
    if (url.endsWith('/auth/login')) { currentPrincipal = principal(1); return json({ principal: currentPrincipal, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }); }
    if (url.endsWith('/auth/logout') || url.endsWith('/auth/password')) { currentPrincipal = null; return new Response(null, { status: 204 }); }
    if (url.endsWith('/inventory/query')) {
      if (inventoryMode === 'hold') return new Promise(resolve => held.push({ signal: init.signal, finish: (status = 503) => resolve(error(status === 401 ? 'UNAUTHENTICATED' : 'INVENTORY_NOT_READY', status)) }));
      return error('INVENTORY_NOT_READY', 503);
    }
    if (url.endsWith('/sales/query')) return error(salesMode === 'unauthenticated' ? 'UNAUTHENTICATED' : 'SERVICE_UNAVAILABLE', salesMode === 'unauthenticated' ? 401 : 503);
    const u = new URL(url); const [, , family, leaf, key] = u.pathname.split('/');
    if (family === 'customers' || family === 'suppliers') {
      const rows = partyRows[family];
      if (leaf === 'commands') {
        const command = JSON.parse(init.body);
        if (receipts.has(command.requestKey)) return json(receipts.get(command.requestKey).result);
        assert.equal(command.action, 'EDIT', 'Only explicitly exercised atomic edit is allowed in this synthetic host');
        const prior = rows.find(row => row.id === command.id); assert.ok(prior); assert.equal(command.expectedVersion, prior.version);
        const next = { ...prior, name: command.name, enabled: command.enabled, version: prior.version + 1 }; rows[rows.indexOf(prior)] = next;
        const result = { operationId: uuid(901), kind: family === 'customers' ? 'CUSTOMER' : 'SUPPLIER', partyId: next.id, version: next.version, code: next.code, enabled: next.enabled };
        receipts.set(command.requestKey, { requestKey: command.requestKey, action: command.action, status: 'COMMITTED', completedAt: '2026-10-20T12:00:00Z', result });
        if (partyMode === 'lost-response') { partyMode = 'normal'; throw new Error('SYNTHETIC connection loss after commit'); }
        if (partyMode === 'hold-write') return new Promise(resolve => heldPartyWrites.push({ signal: init.signal, finish: () => resolve(json(result)) }));
        return json(result);
      }
      if (leaf === 'receipts') return receiptMode === 'absent' ? error('RECEIPT_NOT_FOUND', 404) : json(receipts.get(decodeURIComponent(key)));
      if (leaf) return json(rows.find(row => row.id === leaf));
      const search = u.searchParams; const page = Number(search.get('page')), pageSize = Number(search.get('pageSize'));
      const matching = rows.filter(row => (search.get('enabled') !== 'ENABLED' || row.enabled) && (search.get('enabled') !== 'DISABLED' || !row.enabled)
        && `${row.name}${row.code}`.includes(search.get('search') ?? ''));
      return json({ items: matching.slice((page - 1) * pageSize, page * pageSize), total: matching.length, page, pageSize });
    }
    throw new Error('Unexpected mocked endpoint');
  } };
  // Test-only plain semantic renderer. It is deliberately NOT a proposed production/Demo layout.
  const presentation = {
    renderWorkspace: ({ controller, state, routeContent }) => h('section', { 'data-synthetic-host': '' },
      h('nav', { 'aria-label': 'SYNTHETIC NAVIGATION' }, [null, ...controller.routes].map(route => h('button', { key: route ?? 'home', type: 'button', onClick: () => { void controller.navigate(route); } }, `TEST ${route ?? 'home'}`))),
      state.notice === 'cannot-leave' ? h('p', { role: 'alert' }, 'TEST cannot leave unresolved party work') : null,
      h('main', { 'data-route': state.route ?? 'home' }, routeContent)),
    renderRouteState: ({ controller, state }) => h('div', { 'data-phase': state.phase }, `TEST ${state.phase}`,
      state.phase === 'loading' ? h('button', { onClick: () => controller.cancelRoute() }, 'TEST cancel loading') : null,
      ['error', 'cancelled'].includes(state.phase) ? h('button', { onClick: () => { void controller.navigate(state.route); } }, 'TEST retry route') : null),
  };
  const styles = {}; const styleLoads = []; let styleMode = 'hold'; const heldStyles = [];
  for (const key of ['inventory', 'sales', 'parties']) styles[key] = { load: async () => {
    styleLoads.push(key);
    if (key === 'inventory' && styleMode === 'hold') return new Promise((resolve, reject) => heldStyles.push({ resolve, reject }));
    if (key === 'inventory' && styleMode === 'fail') throw new Error('SYNTHETIC PRIVATE STYLE EXCEPTION');
  }, dispose: () => {} };
  const configuration = { http, presentation, routes: { inventory: { stylesheet: styles.inventory, actions: {} }, sales: { stylesheet: styles.sales }, parties: { stylesheet: styles.parties, newRequestKey: () => uuid(999 + ++keyCount) } } };
  assert.throws(() => new ApplicationController({ ...configuration, presentation: undefined }));
  assert.throws(() => new ApplicationController({ ...configuration, http: { ...http, origin: 'http://synthetic.test' } }));
  assert.throws(() => new ApplicationController({ ...configuration, routes: { sales: {} } }));
  app = createApplication(configuration);
  assert.equal(calls.length, 0); assert.equal(styleLoads.length, 0);
  await act(async () => app.mount(host)); await settle();
  assert.equal(calls.length, 0); assert.equal(styleLoads.length, 0); assert.equal(host.querySelector('main'), null);
  assert.match(host.textContent, /尚未核验/); assert.equal(await app.controller.navigate('inventory'), false);
  await click(button('核验登录状态')); assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://synthetic.test/api/auth/session'); assert.equal(host.querySelector('main'), null);
  console.log('PASS DOM 1: missing host/config/providers fail closed; construction/mount/anonymous verification performs zero business imports, styles or reads.');

  await change(host.querySelector('input[name=loginName]'), 'SYNTHETIC-1');
  const secret = host.querySelector('input[name=password]'); await change(secret, 'SYNTHETIC-password');
  await submit(host.querySelector('form[aria-label="账号登录"]'));
  assert.equal(secret.value, ''); assert.match(host.textContent, /SYNTHETIC-1/); assert.ok(button('TEST inventory')); assert.ok(button('TEST customers'));
  assert.deepEqual(styleLoads, []); assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[1].init.body), { loginName: 'SYNTHETIC-1', password: 'SYNTHETIC-password' });
  await click(button('TEST inventory')); assert.equal(app.controller.getSnapshot().phase, 'loading'); assert.deepEqual(styleLoads, ['inventory']); assert.equal(calls.length, 2);
  await click(button('TEST cancel loading')); assert.equal(app.controller.getSnapshot().phase, 'cancelled');
  await act(async () => heldStyles[0].resolve()); await settle(); assert.equal(host.querySelector('.iw-workbench'), null); assert.equal(calls.length, 2);
  styleMode = 'ready'; await click(button('TEST retry route')); assert.ok(host.querySelector('.iw-workbench')); assert.match(host.textContent, /等待查询/); assert.equal(calls.length, 2); assert.deepEqual(styleLoads, ['inventory']);
  console.log('PASS DOM 2: real login form reuses auth/password clearing; only chosen leaf CSS activates; cancellation prevents late code/CSS from mounting; inventory waits for explicit query.');

  await submit(host.querySelector('form[aria-label="库存筛选"]')); assert.equal(held.length, 1);
  const oldScope = app.controller.getSnapshot().scope;
  await click(button('TEST sales')); assert.equal(oldScope.active, false); assert.equal(held[0].signal.aborted, true);
  assert.deepEqual(styleLoads, ['inventory', 'sales']); assert.ok(host.querySelector('.sales-workbench')); assert.equal(calls.length, 3);
  await act(async () => held[0].finish()); await settle(); assert.equal(app.controller.getSnapshot().route, 'sales'); assert.equal(host.querySelector('.iw-workbench:not(.sales-workbench)'), null);
  await submit(host.querySelector('form[aria-label="销货筛选"]')); assert.equal(calls.length, 4); assert.match(host.textContent, /查询未完成|未能完成|not available/); assert.doesNotMatch(host.textContent, /SYNTHETIC SERVER ERROR MUST NOT LEAK/);
  assert.doesNotMatch(host.textContent, /共 0 张/);
  console.log('PASS DOM 3: route replacement aborts prior real HTTP reader; late responses cannot restore old route; 503 remains a local failure, not empty success or raw server text.');

  await click(button('TEST inventory')); await submit(host.querySelector('form[aria-label="库存筛选"]')); const stale = held[1];
  currentPrincipal = principal(2, 'WAREHOUSE', 2);
  await act(async () => { await app.controller.authentication.resolveSession(); }); await settle();
  assert.equal(stale.signal.aborted, true); assert.equal(app.controller.getSnapshot().phase, 'home'); assert.equal(host.querySelector('.iw-workbench'), null);
  await act(async () => stale.finish(401)); await settle(); assert.equal(app.controller.authentication.getSnapshot().principal.accountId, uuid(2));
  await click(button('TEST sales')); salesMode = 'unauthenticated'; await submit(host.querySelector('form[aria-label="销货筛选"]'));
  assert.equal(app.controller.authentication.getSnapshot().principal, null); assert.equal(host.querySelector('main'), null); assert.match(host.textContent, /登录已失效/);
  console.log('PASS DOM 4: verification/account/permission changes clear scopes before new identity; stale 401 cannot expire newer identity; current business 401 clears all authenticated content.');

  currentPrincipal = principal(3, 'SALESPERSON'); await act(async () => { await app.controller.authentication.resolveSession(); }); await settle();
  assert.equal(button('TEST customers'), undefined); assert.equal(await app.controller.navigate('customers'), false); assert.equal(styleLoads.filter(key => key === 'parties').length, 0);
  currentPrincipal = principal(4, 'WAREHOUSE'); await act(async () => { await app.controller.authentication.resolveSession(); }); await settle();
  const beforePartyActivation = calls.length;
  await click(button('TEST customers')); assert.ok(host.querySelector('.party-workbench')); assert.equal(styleLoads.filter(key => key === 'parties').length, 1);
  assert.equal(calls.length, beforePartyActivation + 1); assert.match(calls.at(-1).url, /\/customers\?/);
  assert.equal(new URL(calls.at(-1).url).searchParams.get('enabled'), 'ENABLED'); assert.equal(new URL(calls.at(-1).url).searchParams.get('pageSize'), '20');
  assert.ok(host.querySelector('.arco-table')); assert.match(host.textContent, /SYNTHETIC CUSTOMER/); assert.doesNotMatch(host.textContent, /SYNTHETIC SUPPLIER/);
  const partyReads = calls.length;
  await click(button('新增客户')); const partyDialog = () => host.querySelector('.arco-modal[role="dialog"]');
  await change(partyDialog().querySelector('input[aria-label="客户名称"]'), 'SYNTHETIC DIRTY CUSTOMER');
  assert.equal(calls.length, partyReads); assert.equal(keyCount, 0);
  await click(button('TEST sales')); assert.equal(app.controller.getSnapshot().route, 'customers'); assert.match(host.textContent, /TEST cannot leave/);
  await click(partyDialog().querySelector('.arco-modal-close-icon')); await click(button('放弃本次填写'));
  await click(button('TEST suppliers')); assert.equal(app.controller.getSnapshot().route, 'suppliers'); assert.equal(calls.length, partyReads + 1); assert.match(calls.at(-1).url, /\/suppliers\?/);
  assert.match(host.textContent, /SYNTHETIC SUPPLIER/); assert.doesNotMatch(host.textContent, /SYNTHETIC CUSTOMER/);
  await click(button('TEST customers')); assert.equal(calls.length, partyReads + 1); assert.doesNotMatch(host.textContent, /SYNTHETIC DIRTY CUSTOMER/);
  await click(button('新增客户')); assert.ok(partyDialog()); await click(button('TEST suppliers')); assert.equal(partyDialog(), null);
  await click(button('TEST customers')); assert.equal(partyDialog(), null); assert.equal(keyCount, 0);
  await click(host.querySelector('.party-edit')); assert.match(calls.at(-1).url, new RegExp(`/customers/${uuid(101)}$`));
  await change(partyDialog().querySelector('input[aria-label="客户名称"]'), ' SYNTHETIC ATOMIC EDIT ');
  await click(partyDialog().querySelector('[role="switch"][aria-label="使用状态"]')); assert.equal(partyDialog().querySelector('[role="switch"]').getAttribute('aria-checked'), 'false');
  partyMode = 'lost-response'; await click(button('确定'));
  const writeCalls = () => calls.filter(call => call.url.endsWith('/commands'));
  const original = JSON.parse(writeCalls().at(-1).init.body);
  assert.deepEqual(Object.keys(original).sort(), ['action', 'enabled', 'expectedVersion', 'id', 'name', 'requestKey']);
  assert.equal(original.action, 'EDIT'); assert.equal(original.name, ' SYNTHETIC ATOMIC EDIT '); assert.equal(original.enabled, false); assert.equal(original.expectedVersion, 7); assert.equal(keyCount, 1);
  assert.equal(partyRows.customers[0].version, 8); assert.equal(partyDialog().querySelector('input[aria-label="客户名称"]').disabled, true); assert.equal(partyDialog().querySelector('[role="switch"]').disabled, true);
  await click(button('TEST sales')); assert.equal(app.controller.getSnapshot().route, 'customers'); assert.match(host.textContent, /TEST cannot leave/);
  receiptMode = 'absent'; await click(button('查询原操作回执')); assert.match(partyDialog().textContent, /不代表未提交/); assert.equal(keyCount, 1);
  receiptMode = 'normal'; await click(button('重放原请求')); assert.deepEqual(JSON.parse(writeCalls().at(-1).init.body), original); assert.equal(keyCount, 1); assert.equal(partyRows.customers[0].version, 8); assert.equal(partyDialog(), null);
  await click(button('TEST suppliers')); await click(host.querySelector('.party-edit')); await change(partyDialog().querySelector('input[aria-label="供应商名称"]'), 'SYNTHETIC PENDING OLD IDENTITY');
  partyMode = 'hold-write'; await click(button('确定')); const pendingPartyWrite = heldPartyWrites.at(-1); assert.ok(pendingPartyWrite);
  currentPrincipal = principal(44, 'WAREHOUSE', 2); await act(async () => { await app.controller.authentication.resolveSession(); }); await settle();
  assert.equal(pendingPartyWrite.signal.aborted, true); assert.equal(partyDialog(), null); assert.equal(host.querySelector('.party-workbench'), null);
  await act(async () => pendingPartyWrite.finish()); await settle(); assert.equal(app.controller.getSnapshot().phase, 'home'); assert.doesNotMatch(host.textContent, /SYNTHETIC PENDING OLD IDENTITY|SYNTHETIC ATOMIC EDIT/);
  partyMode = 'normal';
  console.log('PASS DOM 5: actual Arco parties load only the activated bounded normal-status page; kinds remain independent; clean modal cannot resurrect after route leave; dirty/uncertain work blocks navigation; atomic name+enabled EDIT preserves key/bytes across lost response, absent receipt and exact replay; identity change aborts pending command and discards late facts.');

  await click(button('修改密码')); const dialog = host.querySelector('.auth-password-dialog'); assert.ok(dialog);
  await change(dialog.querySelector('input[name=currentPassword]'), 'SYNTHETIC-old'); await change(dialog.querySelector('input[name=newPassword]'), 'SYNTHETIC-new'); await change(dialog.querySelector('input[name=confirmPassword]'), 'SYNTHETIC-new');
  await submit(dialog.querySelector('form')); assert.equal(app.controller.authentication.getSnapshot().principal, null); assert.equal(host.querySelector('main'), null); assert.match(host.textContent, /密码修改成功/);
  currentPrincipal = principal(5); await act(async () => { await app.controller.authentication.resolveSession(); }); await settle();
  await click(button('退出登录')); assert.equal(app.controller.authentication.getSnapshot().principal, null); assert.match(host.textContent, /已退出登录/);
  await act(async () => app.dispose()); app = null; assert.equal(host.childNodes.length, 0);
  console.log('PASS DOM 6: composed password/logout flows reuse authentication, invalidate all scopes/drafts, clear forms and unmount the one actual React root.');

  // Real link lifecycle without resource loading: jsdom does not fetch external resources here.
  const originalLinks = document.head.querySelectorAll('link').length;
  assert.throws(() => createRouteStylesheet({ document, origin: http.origin, href: 'https://other.test/route.css' }));
  const sheet = createRouteStylesheet({ document, origin: http.origin, href: '/assets/synthetic-route.css' });
  assert.equal(document.head.querySelectorAll('link').length, originalLinks);
  const first = sheet.load(), second = sheet.load(); assert.equal(first, second);
  const link = document.head.querySelector('link'); link.dispatchEvent(new dom.window.Event('error')); await assert.rejects(first);
  const retry = sheet.load(); const ready = document.head.querySelector('link'); ready.dispatchEvent(new dom.window.Event('load')); await retry;
  sheet.dispose(); assert.equal(document.head.querySelectorAll('link').length, originalLinks); await assert.rejects(sheet.load());
  console.log('PASS DOM 7: explicit same-origin CSS links are inert, deduplicated, failure-retryable and removed on owner disposal; no resource/browser/network loading used.');
  let attempts = 0;
  currentPrincipal = principal(6);
  app = createApplication({ ...configuration, routes: { inventory: { actions: {}, stylesheet: { load: async () => { if (++attempts === 1) throw new Error('SYNTHETIC PRIVATE STYLE EXCEPTION'); }, dispose: () => { throw new Error('SYNTHETIC cleanup failure'); } } }, sales: { stylesheet: styles.sales } } });
  await act(async () => app.mount(host)); await settle();
  await act(async () => { await app.controller.authentication.resolveSession(); }); await settle();
  const beforeFailure = calls.length;
  await click(button('TEST inventory')); assert.equal(app.controller.getSnapshot().phase, 'error'); assert.equal(host.querySelector('.iw-workbench'), null); assert.doesNotMatch(host.textContent, /PRIVATE STYLE EXCEPTION/); assert.equal(calls.length, beforeFailure);
  await click(button('TEST retry route')); assert.equal(app.controller.getSnapshot().phase, 'ready'); assert.equal(attempts, 2); assert.equal(calls.length, beforeFailure);
  const failedScope = app.controller.getSnapshot().scope; await click(button('TEST home')); assert.equal(failedScope.active, false);
  assert.equal(await app.controller.navigate('transfer'), false);
  await act(async () => app.dispose()); app = null; assert.equal(host.childNodes.length, 0);
  console.log('PASS DOM 8: route CSS failure is local, safe and explicitly retryable without business reads; unavailable transfer is not fabricated; failed host cleanup cannot prevent root disposal.');
  console.log('All 8 synthetic application DOM groups passed. Not real-browser/network/Demo pixels/performance/production acceptance.');
} finally { if (app) app.dispose(); dom.window.close(); await rm(temporary, { recursive: true, force: true }); }
