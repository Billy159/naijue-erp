import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.party-receipt403-independent-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLIFrameElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLDialogElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = media => ({ matches: false, media, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
let app, act;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'application-core-integration-independent-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { createApplication, createElement: h, uuid } = await import(pathToFileURL(output).href); ({ act } = await import(pathToFileURL(output).href));
  const host = document.getElementById('root');
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  const until = async (check, label) => { const deadline = Date.now() + 5000; while (!check() && Date.now() < deadline) await settle(); assert.ok(check(), label); };
  const button = label => [...host.querySelectorAll('button')].find(element => element.textContent.trim() === label);
  const click = async element => { assert.ok(element); await act(async () => element.click()); await settle(); };
  const change = async (element, value) => { assert.ok(element); await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); }); await settle(); };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const deny = status => json({ error: { code: status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', message: 'PRIVATE RESPONSE MUST NOT LEAK' } }, status);
  const principal = n => ({ accountId: uuid(800 + n), staffId: uuid(850 + n), loginName: `INDEPENDENT-RECOVERY-${n}`, role: 'WAREHOUSE', hallId: null, authVersion: n });
  const originalRecord = { id: uuid(501), code: ' ORIGINAL CODE ', name: ' ORIGINAL NAME ', enabled: true, version: 7, createdAt: null, updatedAt: null };
  let currentPrincipal = principal(1), currentRecord = { ...originalRecord }, commandMode = 'uncertain', receiptMode = 'forbidden', keys = 0;
  const sent = [], calls = [], held = [];
  const result = command => ({ operationId: uuid(601), kind: 'CUSTOMER', partyId: command.id, version: command.expectedVersion + 1, code: currentRecord.code, enabled: command.enabled });
  const http = { origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    calls.push({ url, signal: init.signal }); const parsed = new URL(url);
    if (url.endsWith('/auth/session')) return json({ principal: currentPrincipal });
    if (parsed.pathname === '/api/customers') return json({ page: Number(parsed.searchParams.get('page')), pageSize: Number(parsed.searchParams.get('pageSize')), total: 1, items: [currentRecord] });
    if (parsed.pathname === `/api/customers/${originalRecord.id}`) return json(currentRecord);
    if (url.endsWith('/customers/commands')) {
      const command = JSON.parse(init.body); sent.push({ raw: init.body, command, signal: init.signal });
      if (commandMode === 'uncertain') throw new Error('Synthetic lost response after dispatch');
      if (commandMode !== 'success') return deny(commandMode === 'unauthenticated' ? 401 : 403);
      const response = result(command); currentRecord = { ...currentRecord, name: command.name, enabled: command.enabled, version: response.version }; return json(response);
    }
    if (parsed.pathname.startsWith('/api/customers/receipts/')) {
      if (receiptMode === 'hold') return new Promise(resolve => held.push({ signal: init.signal, finish: status => resolve(deny(status)) }));
      if (receiptMode === 'absent') return json({ error: { code: 'RECEIPT_NOT_FOUND', message: 'Absent' } }, 404);
      return deny(receiptMode === 'unauthenticated' ? 401 : 403);
    }
    throw new Error('Unexpected mocked endpoint');
  } };
  const presentation = { renderWorkspace: ({ routeContent }) => h('main', null, routeContent), renderRouteState: ({ state }) => h('p', null, state.phase) };
  app = createApplication({ http, presentation, routes: { parties: { stylesheet: { load: async () => {}, dispose() {} }, newRequestKey: () => uuid(900 + ++keys) } } });
  await act(async () => app.mount(host));
  const resetIdentity = async n => { currentPrincipal = principal(n); currentRecord = { ...originalRecord }; commandMode = 'uncertain'; receiptMode = 'forbidden'; await act(async () => app.controller.authentication.resolveSession()); await act(async () => app.controller.navigate('customers')); await until(() => host.querySelector('.party-edit'), 'Fresh customer list'); };
  const makeUnknown = async name => { await click(host.querySelector('.party-edit')); await until(() => host.querySelector('input[aria-label="客户名称"]'), 'Customer editor'); await change(host.querySelector('input[aria-label="客户名称"]'), name); await click(host.querySelector('[role="switch"][aria-label="使用状态"]')); await click(button('确定')); await until(() => button('查询原操作回执'), 'Unknown original operation'); return sent.at(-1); };
  const assertOriginal = original => { const input = host.querySelector('input[aria-label="客户名称"]'); assert.ok(input); assert.equal(input.value, original.command.name); assert.ok(input.disabled); assert.equal(host.querySelector('[role="switch"]').getAttribute('aria-checked'), 'false'); assert.ok(host.querySelector('[role="switch"]').disabled); assert.ok(button('重放原请求')); assert.ok(app.controller.authentication.getSnapshot().principal); assert.equal(app.controller.getSnapshot().phase, 'ready'); };

  await resetIdentity(1); const first = await makeUnknown('  EXACT ORIGINAL NAME / 甲  '), firstKeys = keys, firstWrites = sent.length; const partyScope = app.controller.getSnapshot().scope;
  assert.deepEqual(first.command, { action: 'EDIT', requestKey: uuid(901), id: originalRecord.id, expectedVersion: 7, name: '  EXACT ORIGINAL NAME / 甲  ', enabled: false });
  await click(button('查询原操作回执')); assertOriginal(first); assert.ok(app.controller.getSnapshot().scope === partyScope, 'Receipt403 must retain original route scope'); assert.equal(sent.length, firstWrites); assert.equal(keys, firstKeys);
  receiptMode = 'absent'; await click(button('查询原操作回执')); assertOriginal(first); assert.match(host.textContent, /不代表未提交/);
  commandMode = 'forbidden'; await click(button('重放原请求')); assertOriginal(first); assert.equal(sent.at(-1).raw, first.raw); assert.equal(keys, firstKeys); assert.equal(sent.length, firstWrites + 1);
  let navigated; await act(async () => { navigated = await app.controller.navigate(null); }); assert.equal(navigated, false); assert.equal(app.controller.getSnapshot().notice, 'cannot-leave');
  commandMode = 'success'; await click(button('重放原请求')); await until(() => !host.querySelector('.arco-modal'), 'Validated replay commit closes editor');
  assert.equal(sent.at(-1).raw, first.raw); assert.equal(keys, firstKeys); assert.equal(sent.length, firstWrites + 2); assert.equal(currentRecord.version, 8); assert.equal(currentRecord.name, first.command.name); assert.equal(currentRecord.enabled, false);
  console.log('PASS independent party1: actual composed receipt403/404 and replay403 retain locked original target/CAS/name/enabled/key; navigation stays guarded; explicit successful replay sends byte-identical body/key and accepts only its native result.');

  for (const status of [401, 403]) {
    await resetIdentity(10 + status); const original = await makeUnknown(`OLD UNKNOWN ${status}`); receiptMode = 'hold'; const priorHeld = held.length;
    await click(button('查询原操作回执')); await until(() => held.length === priorHeld + 1, 'Held original receipt read'); const pending = held.at(-1); assert.equal(pending.signal.aborted, false);
    currentPrincipal = principal(20 + status); await act(async () => app.controller.authentication.resolveSession()); await settle(); assert.equal(pending.signal.aborted, true); assert.equal(host.querySelector('.arco-modal'), null);
    await act(async () => pending.finish(status)); await settle(); assert.equal(app.controller.authentication.getSnapshot().principal.loginName, currentPrincipal.loginName); assert.equal(app.controller.getSnapshot().phase, 'home'); assert.doesNotMatch(host.textContent, new RegExp(original.command.name));
  }
  console.log('PASS independent party2: actual composed stale abort-ignoring receipt401/403 after trusted identity replacement cannot expire the new principal, resurrect old editor or restore original operation.');

  for (const action of ['receipt', 'replay']) {
    await resetIdentity(action === 'receipt' ? 31 : 32); await makeUnknown(`CURRENT401 ${action}`);
    if (action === 'receipt') { receiptMode = 'unauthenticated'; await click(button('查询原操作回执')); }
    else { commandMode = 'unauthenticated'; await click(button('重放原请求')); }
    await until(() => !app.controller.authentication.getSnapshot().principal, `Current ${action}401 expires auth`); assert.equal(host.querySelector('.arco-modal'), null); assert.equal(host.querySelector('main'), null); assert.equal(app.controller.getSnapshot().phase, 'home'); assert.match(host.textContent, /登录已失效/); assert.doesNotMatch(host.textContent, /CURRENT401|PRIVATE RESPONSE MUST NOT LEAK/);
  }
  console.log('PASS independent party3: current receipt401 and replay401 still expire global authentication and clear both workspace/editor/recovery surfaces; raw denial text never renders.');
  await act(async () => app.dispose()); app = null; assert.equal(host.childNodes.length, 0);
  console.log('All three independent composed party recovery groups passed. Mocked HTTP/CSS only, no network/browser/server/DB or aggregate compiler.');
} finally { if (app) await act(async () => app.dispose()); dom.window.close(); await rm(temporary, { recursive: true, force: true }); }
