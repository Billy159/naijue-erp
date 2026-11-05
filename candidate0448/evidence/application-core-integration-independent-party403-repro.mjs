import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Minimal real composed-party reproduction. All HTTP and CSS are synthetic;
// there are no transfers, browsers, listeners, real credentials or external reads.
const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.application-core-independent-party403-'));
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
  const host = document.getElementById('root'); const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const principal = { accountId: uuid(900), staffId: uuid(901), loginName: 'INDEPENDENT-PARTY403', role: 'WAREHOUSE', hallId: null, authVersion: 1 };
  const record = { id: uuid(401), code: 'INDEPENDENT-CUSTOMER', name: 'INDEPENDENT CUSTOMER', enabled: true, version: 1, createdAt: null, updatedAt: null };
  let keys = 0; const writes = [], calls = [];
  const http = { origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    calls.push(url); const parsed = new URL(url);
    if (url.endsWith('/auth/session')) return json({ principal });
    if (parsed.pathname === '/api/customers') return json({ page: 1, pageSize: 20, total: 1, items: [record] });
    if (parsed.pathname === `/api/customers/${record.id}`) return json(record);
    if (url.endsWith('/customers/commands')) { writes.push(JSON.parse(init.body)); throw new Error('Synthetic lost response after dispatch: outcome unknown'); }
    if (parsed.pathname.startsWith('/api/customers/receipts/')) return json({ error: { code: 'FORBIDDEN', message: 'Synthetic forbidden' } }, 403);
    throw new Error('Unexpected mocked endpoint');
  } };
  const presentation = { renderWorkspace: ({ routeContent }) => h('main', null, routeContent), renderRouteState: ({ state }) => h('p', null, state.phase) };
  app = createApplication({ http, presentation, routes: { parties: { stylesheet: { load: async () => {}, dispose() {} }, newRequestKey: () => uuid(990 + ++keys) } } });
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 12)); });
  const until = async (check, description) => { const deadline = Date.now() + 5000; while (!check() && Date.now() < deadline) await settle(); assert.ok(check(), description); };
  const button = label => [...host.querySelectorAll('button')].find(element => element.textContent.trim() === label);
  const click = async element => { assert.ok(element); await act(async () => element.click()); await settle(); };
  await act(async () => app.mount(host)); await act(async () => app.controller.authentication.resolveSession()); await act(async () => app.controller.navigate('customers'));
  await until(() => host.querySelector('.party-edit'), 'Customer page'); await click(host.querySelector('.party-edit'));
  await until(() => host.querySelector('input[aria-label="客户名称"]'), 'Customer editor');
  const input = host.querySelector('input[aria-label="客户名称"]');
  await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, 'INDEPENDENT ORIGINAL UNKNOWN COMMAND'); input.dispatchEvent(new Event('input', { bubbles: true })); }); await settle(); await click(button('确定'));
  await until(() => button('查询原操作回执'), 'Unknown operation receipt action'); assert.equal(keys, 1); assert.equal(writes.length, 1);
  const before = { appPhase: app.controller.getSnapshot().phase, route: app.controller.getSnapshot().route, authenticated: !!app.controller.authentication.getSnapshot().principal, input: host.querySelector('input[aria-label="客户名称"]').value, originalCommand: writes[0], replayVisible: !!button('重放原请求') };
  await click(button('查询原操作回执'));
  const after = { appPhase: app.controller.getSnapshot().phase, route: app.controller.getSnapshot().route, authenticated: !!app.controller.authentication.getSnapshot().principal, input: host.querySelector('input[aria-label="客户名称"]')?.value ?? null, replayVisible: !!button('重放原请求'), keys, writes: writes.length };
  console.log(JSON.stringify({ status: 'OPEN DEFECT: pre-existing party403 destroys unresolved-command recovery', before, after, calls, expected: 'A receipt403 does not prove the original dispatched command was rejected or did not commit. Preserve exact original command/key and recovery state; do not reclassify it as a safe disposable read-only transfer route.' }, null, 2));
  assert.ok(after.authenticated && after.appPhase === 'ready' && after.replayVisible && after.input === before.input, 'OPEN DEFECT: current party receipt403 cleared auth/editor/original-operation recovery');
} finally { if (app) await act(async () => app.dispose()); dom.window.close(); await rm(temporary, { recursive: true, force: true }); }
