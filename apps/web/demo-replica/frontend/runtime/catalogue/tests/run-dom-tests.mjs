import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Synthetic transport + real module DOM lifecycle only. No browser, server or DB.
const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.runtime-dom-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLDialogElement','HTMLButtonElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = media => ({ matches: false, media, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
const { act } = await import('react');
const { ReadContext } = await import(pathToFileURL(path.resolve(here, '../../../../../src/loading/read-scope.ts')).href);
const { createCatalogueMaintenanceHttpClient } = await import(pathToFileURL(path.resolve(here, '../../../../../src/product-settings/catalogue-maintenance-http-client.ts')).href);
let dispose;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.resolve(here, '../entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react','react-dom','react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', logLevel: 'warning' });
  const { mountCatalogue, mountBarcodeSchemeDetail } = await import(pathToFileURL(output).href);
  const original = await readFile(path.resolve(here, '../../../inventory-workbench.js'), 'utf8');
  const pagerSource = original.slice(original.indexOf('function paginationMarkup('), original.indexOf('window.INVENTORY_PAGER='));
  const renderPager = Function(`${pagerSource};return paginationMarkup`)();
  const requests = [], changes = [], failures = [], recoveries = [];
  const http = { origin: 'https://synthetic.test', basePath: '', fetch: (url, init) => new Promise((resolve, reject) => requests.push({ url, init, resolve, reject })) };
  const sid = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  const resolve = async (request, data, status = 200) => { await act(async () => request.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }))); await settle(); };
  const latest = suffix => requests.findLast(request => request.url.endsWith(suffix));
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  const click = async node => { assert.ok(node); await act(async () => node.click()); await settle(); };
  const type = async (node, value) => { assert.ok(node); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); }); await settle(); };
  const entry = (value, name = `颜色${value}`, version = 1) => ({ id: sid(value), code: String(value).padStart(3, '0'), name, enabled: true, version });
  const page = (request, total, name) => { const input = JSON.parse(request.init.body); return { page: input.page, pageSize: input.pageSize, total, items: Array.from({ length: Math.min(input.pageSize, Math.max(0, total - (input.page - 1) * input.pageSize)) }, (_, i) => entry((input.page - 1) * input.pageSize + i + 1, name)) }; };
  const host = document.getElementById('root');
  let scope, context, leave;
  async function mount(route, maintenance) {
    if (dispose) await act(async () => dispose());
    context?.clear();
    context = new ReadContext({ accountId: sid(900), sessionRevision: '1', permissionRevision: '1' }); scope = context.createScope(route);
    const options = { scope, http, onAccessFailure: kind => failures.push(kind), onCanLeaveChange: guard => { leave = guard; }, onChanged: kind => changes.push(kind), renderPager, categoryControlCss: '', mountEmpty: () => () => {}, ...(maintenance ? { maintenance } : {}) };
    await act(async () => { dispose = await mountCatalogue(host, route, options); }); await settle();
  }
  await mount('product-settings');
  assert.equal(requests.length, 1); assert.ok(latest('/catalogue-settings-read/colors/query'));
  const cancelled = requests.at(-1); await click(button('取消')); assert.equal(cancelled.init.signal.aborted, true);
  await resolve(cancelled, page(cancelled, 1, 'CANCELLED RESULT')); assert.doesNotMatch(host.textContent, /CANCELLED RESULT/);
  await click(button('重试加载资料'));
  await resolve(requests.at(-1), page(requests.at(-1), 21));
  await click(document.querySelector('[data-catalogue="next"]'));
  assert.equal(JSON.parse(requests.at(-1).init.body).page, 2);
  await resolve(requests.at(-1), page(requests.at(-1), 21));
  assert.equal(host.querySelectorAll('tbody tr').length, 1); assert.match(host.textContent, /共 21 条/);
  const search = host.querySelector('#pc-dict-search'); search.focus();
  await type(search, 'old'); const old = requests.at(-1);
  await type(search, 'new'); const current = requests.at(-1);
  assert.equal(old.init.signal.aborted, true);
  await resolve(current, page(current, 1, 'NEW RESULT')); await resolve(old, page(old, 1, 'STALE RESULT'));
  assert.match(host.textContent, /NEW RESULT/); assert.doesNotMatch(host.textContent, /STALE RESULT/); assert.equal(document.activeElement, search);
  await click(button('尺码组')); const groups = requests.at(-1); assert.ok(groups.url.endsWith('/dictionary-read/size-groups/query'));
  await resolve(groups, { page: 1, pageSize: 20, total: 1, items: [{ id: sid(50), name: '原尺码组', sizes: [{ id: sid(51), name: '030', displayOrder: -1 }] }] });
  assert.match(host.textContent, /030/); assert.equal(button('新增尺码组'), undefined);
  await click(button('季节')); assert.ok(requests.at(-1).url.endsWith('/dictionary-read/seasons/query'));
  const late = requests.at(-1); await act(async () => dispose()); await resolve(late, { page: 1, pageSize: 20, total: 1, items: [{ id: sid(60), name: 'LATE CLOSED' }] }); assert.equal(host.childElementCount, 0);

  const client = createCatalogueMaintenanceHttpClient(http, 'COLOR');
  await mount('product-settings', { COLOR: { kind: 'COLOR', client, allowedActions: ['CREATE','EDIT','DELETE'], newRequestKey: () => sid(100), onRecoveryRequired: command => recoveries.push(command) } });
  await resolve(requests.at(-1), page(requests.at(-1), 0)); await click(button('新增颜色'));
  await type(document.querySelector('#pc-dict-name input'), '白色'); await type(document.querySelector('#pc-dict-code input'), '001'); await click(button('确定'));
  const unknown = latest('/catalogue/colors/commands'); assert.ok(unknown); const originalBody = unknown.init.body;
  await act(async () => unknown.reject(new Error('synthetic disconnected response'))); await settle();
  assert.equal(leave(), false); assert.ok(button('查回原请求结果')); await click(button('按原请求重试'));
  assert.equal(latest('/catalogue/colors/commands').init.body, originalBody, 'unknown retry retains exact request key/body');
  await resolve(requests.at(-1), { operationId: sid(101), kind: 'COLOR', targetId: sid(1), version: 1 });
  const verification = latest('/catalogue-settings-read/colors/query'); assert.equal(JSON.parse(verification.init.body).search, '001');
  await resolve(verification, { page: 1, pageSize: 20, total: 1, items: [entry(1, '白色')] });
  await resolve(requests.at(-1), page(requests.at(-1), 1, '白色'));
  assert.equal(document.querySelector('#pc-dict-form'), null); assert.deepEqual(changes, ['COLOR']); assert.equal(recoveries.length, 0);

  await mount('barcode-schemes');
  const scheme = { id: sid(80), name: '原历史方案', barcodeType: 'Code128', ruleDescription: '来源原值', codeLength: null, ruleVersion: 'source', status: 'HISTORICAL', applicability: null };
  await resolve(requests.at(-1), { page: 1, pageSize: 20, total: 1, items: [scheme] });
  assert.equal(latest('/dictionary-read/barcode-scheme/query'), undefined);
  await click(button('查看')); assert.equal(JSON.parse(requests.at(-1).init.body).schemeId, scheme.id);
  await resolve(requests.at(-1), scheme); assert.match(document.querySelector('.pc-rule').textContent, /来源原值/); assert.doesNotMatch(document.querySelector('.pc-rule').textContent, /识别码/);
  await click(button('关闭'));

  await act(async () => dispose()); context.clear();
  context = new ReadContext({ accountId: sid(900), sessionRevision: '2', permissionRevision: '2' }); scope = context.createScope('product-scheme-detail', sid(80));
  const listsBeforeConsumer = requests.filter(request => request.url.endsWith('/dictionary-read/barcode-schemes/query')).length;
  await act(async () => { dispose = await mountBarcodeSchemeDetail(host, scheme.id, { scope, http, onAccessFailure: kind => failures.push(kind) }, () => {}); }); await settle();
  assert.ok(requests.at(-1).url.endsWith('/dictionary-read/barcode-scheme/query'));
  assert.equal(requests.filter(request => request.url.endsWith('/dictionary-read/barcode-schemes/query')).length, listsBeforeConsumer, 'product consumer does not fetch or mount the scheme list');
  const lateDetail = requests.at(-1); await act(async () => dispose()); await resolve(lateDetail, scheme); assert.equal(document.querySelector('.pc-rule'), null);

  await mount('product-categories');
  await resolve(requests.at(-1), { total: 1, items: [{ id: sid(70), parentId: null, name: '真实根分类', displayOrder: -3, version: 2, code: null, productCount: null, childCount: 0 }] });
  assert.match(host.textContent, /未知/); assert.equal(host.querySelector('[data-cat="name"]').value, '真实根分类');
  // Revoked identity clears every live route leaf; no stale source fallback.
  await act(async () => context.clear()); await settle(); assert.equal(host.childElementCount, 0);
  console.log('PASS replica catalogue: current-tab-only reads, authoritative paging/total, stale cancellation/focus, readonly source IDs/sizes, unmount discard, original-key unknown retry/version readback, lazy scheme details/native unknowns, category null counts and identity cleanup. Synthetic DOM only.');
} finally {
  if (dispose) await act(async () => dispose());
  dom.window.close(); await rm(temporary, { recursive: true, force: true });
}
