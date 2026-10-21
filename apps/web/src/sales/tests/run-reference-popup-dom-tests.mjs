import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(path.join(here, '.reference-popup-tmp-'));
// Readiness markers are attached only to real locally bundled action CSS.
const inlineActionStyles = await Promise.all(['single-select', 'multi-select'].map(async name => {
  const css = await build({ entryPoints: [path.join(here, `../../demo-controls/${name}.css`)], bundle: true, write: false, logLevel: 'warning' });
  return css.outputFiles[0].text;
}));
const dom = new JSDOM('<!doctype html><style data-demo-single-select-inline></style><style data-demo-multi-select-inline></style><div id="root"></div><button id="outside">Outside</button>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
dom.window.document.querySelector('style[data-demo-single-select-inline]').textContent = inlineActionStyles[0];
dom.window.document.querySelector('style[data-demo-multi-select-inline]').textContent = inlineActionStyles[1];
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLDialogElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLIFrameElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'innerWidth', 'innerHeight', 'pageXOffset', 'pageYOffset']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
dom.window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; dom.window.ResizeObserver = globalThis.ResizeObserver;
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: text => ({ width: text.length * 7 }) });
const nativeRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
dom.window.HTMLElement.prototype.getBoundingClientRect = function () { return this.classList.contains('demo-multi-select') ? { x: 0, y: 0, width: this.closest('[data-multi-label]')?.dataset.multiLabel === '客户' ? 160 : 640, height: 32, left: 0, top: 0, right: 640, bottom: 32, toJSON() {} } : nativeRect.call(this); };
// Control only the domain's exact 160ms debounce; Arco/React timers stay native.
const nativeSetTimeout = globalThis.setTimeout, nativeClearTimeout = globalThis.clearTimeout;
const remoteDebounces = new Map();
globalThis.setTimeout = (callback, delay, ...args) => {
  if (delay !== 160) return nativeSetTimeout(callback, delay, ...args);
  const token = {}; remoteDebounces.set(token, () => callback(...args)); return token;
};
globalThis.clearTimeout = token => { if (!remoteDebounces.delete(token)) nativeClearTimeout(token); };
const registered = new Map();
const add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
document.addEventListener = (type, listener, options) => {
  if ((type === 'pointerdown' || type === 'keydown') && options === true) registered.set(listener, type);
  return add(type, listener, options);
};
document.removeEventListener = (type, listener, options) => {
  if ((type === 'pointerdown' || type === 'keydown') && options === true) registered.delete(listener);
  return remove(type, listener, options);
};
let root;
try {
  const output = path.join(temp, 'dom-entry.mjs');
  await build({ entryPoints: [path.join(here, 'dom-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { act, createElement, StrictMode, createRoot, SalesPageHost, ReadContext, createSalesHttpReader, createSalesFilterReferenceHttpReader, summary, detail, uuid } = await import(pathToFileURL(output).href);
  const host = document.getElementById('root'), outside = document.getElementById('outside');
  const candidates = [], lists = [], details = [];
  const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  const options = { origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.endsWith('/sales/references/query')) {
      assert.equal(candidates.filter(call => !call.done && !call.signal.aborted).length, 0, 'An old popup transport must abort before its replacement starts');
      return new Promise(resolve => {
        const base = { hall: 11, salesperson: 14, customer: 12, warehouse: 13 }[body.kind];
        const call = { body, signal: init.signal, done: false, finish: (label, { total = 3, items = Array.from({ length: Math.min(20, total - (body.page - 1) * 20) }, (_, index) => ({ id: uuid(base + ((body.page - 1) * 20 + index) * 100), label: index === 0 ? label : `${label} ${index + 1}` })) } = {}) => { call.done = true; resolve(json({ page: body.page, exactTotal: String(total), items })); } };
        candidates.push(call);
      });
    }
    if (url.endsWith('/sales/query')) { lists.push(body); return json({ page: body.page, pageSize: body.pageSize, exactTotal: '1', items: [{ ...summary(1), salespersonId: uuid(14), salespersonName: 'TEST 营业员' }] }); }
    if (url.endsWith('/sales/detail/query')) { details.push(body); return json(detail(1)); }
    throw new Error('Unexpected synthetic endpoint');
  } };
  const reader = createSalesHttpReader(options), references = createSalesFilterReferenceHttpReader(options);
  const context = new ReadContext({ accountId: 'TEST-REFERENCE-POPUP', sessionRevision: '1', permissionRevision: '1' });
  const scope = context.createScope('TEST-REFERENCE-ROUTE');
  const settle = async (ms = 50) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); };
  const focus = async element => { assert.ok(element); await act(async () => element.focus()); };
  const click = async element => { assert.ok(element, 'Expected clickable element'); await act(async () => { element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }); await settle(); };
  const pointer = async element => { assert.ok(element); await act(async () => element.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))); await settle(); };
  const key = async (element, value) => {
    const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
    await act(async () => element.dispatchEvent(event)); await settle(); return event;
  };
  const multi = label => host.querySelector(`[data-multi-label="${label}"]`);
  const trigger = label => multi(label)?.querySelector(`[aria-label="${label}，多选"]`);
  const input = label => multi(label)?.querySelector('input');
  const popup = () => host.querySelector('.sales-reference-menu');
  const tree = label => multi(label)?.querySelector('.arco-tree');
  const nodes = label => [...multi(label).querySelectorAll('.arco-tree-node-title')];
  const open = async label => { await click(trigger(label)); await settle(); };
  const close = async label => { await key(input(label) ?? trigger(label), 'Escape'); };
  const complete = async (call, label, config) => { await act(async () => call.finish(label, config)); await settle(); };
  const bottom = async label => { const element = tree(label); assert.ok(element); Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 640 }); Object.defineProperty(element, 'clientHeight', { configurable: true, value: 288 }); element.scrollTop = 352; await act(async () => { element.dispatchEvent(new Event('scroll')); element.dispatchEvent(new Event('scroll')); }); await settle(); };
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  const type = async (label, text, ms = 200) => { await act(async () => { setter.call(input(label), text); input(label).dispatchEvent(new Event('input', { bubbles: true })); }); await settle(ms); if (ms >= 160) { await act(async () => { for (const [token, run] of [...remoteDebounces]) { remoteDebounces.delete(token); run(); } }); await settle(); } };
  const submit = async () => { await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await settle(); };
  const assertFocus = (element, message) => assert.ok(document.activeElement === element, message);
  const assertClosed = label => { assert.equal(tree(label), null); assert.equal(trigger(label).getAttribute('aria-expanded'), 'false'); };
  const render = async (referenceReader = references) => { await act(async () => root.render(createElement(StrictMode, null, createElement(SalesPageHost, { scope, reader, references: referenceReader, loadDetailStyles: async () => {} })))); await settle(); };
  const mount = async () => {
    root = createRoot(host);
    await render();
    assert.equal(registered.size, 2, 'Exactly one page host owns outside and Escape listeners after StrictMode replay');
  };
  await mount(); assert.equal(candidates.length, 0); assert.equal(lists.length, 0);
  assert.equal(host.querySelector('.demo-multi-select'), null, 'Idle controls remain lightweight shells');
  assert.equal(document.querySelector('link[data-demo-multi-select-styles]'), null, 'Inlined readiness needs no stylesheet network');
  await open('营业厅'); assert.equal(candidates.length, 1); const firstHall = candidates.at(-1);
  assert.deepEqual(firstHall.body, { kind: 'hall', search: '', page: 1, pageSize: 20 });
  await pointer(input('营业厅')); assert.equal(firstHall.signal.aborted, false);
  await open('状态'); assert.equal(firstHall.signal.aborted, true); assert.equal(popup(), null); assert.ok(tree('状态')); assert.equal(candidates.length, 1); assert.equal(registered.size, 2);
  assert.match(multi('状态').querySelector('.inv-filter-tools').textContent, /匹配 3 项 · 已选 3 项/);
  for (const term of ['已审核', 'APPROVED', 'yishenhe', 'YSH']) { await type('状态', term, 200); assert.deepEqual(nodes('状态').map(node => node.textContent), ['全部状态', '已审核']); }
  await type('状态', '', 200); assert.equal(candidates.length, 1, 'Static Chinese/native-ID/pinyin/initial search never reads references');
  await complete(firstHall, 'TEST STALE HALL'); assert.doesNotMatch(host.textContent, /TEST STALE HALL/);
  await open('营业厅'); assertClosed('状态'); assert.equal(candidates.length, 2); const replacedHall = candidates.at(-1);
  await open('营业员'); assert.equal(candidates.length, 3); const firstPerson = candidates.at(-1);
  assert.equal(replacedHall.signal.aborted, true); assert.equal(firstPerson.signal.aborted, false);
  assert.equal(host.querySelectorAll('.sales-reference-menu').length, 1); assert.ok(multi('营业员').contains(popup())); assertClosed('营业厅');
  assertFocus(input('营业员'), 'New reference input receives focus');
  await complete(replacedHall, 'TEST STALE REPLACED HALL'); assert.doesNotMatch(host.textContent, /TEST STALE REPLACED HALL/);
  console.log('PASS reference popup 1: StrictMode opens one bounded transport; static↔reference and reference replacement synchronously abort old owners, retain one local tree and one listener pair, and reject late facts.');

  await focus(outside); await pointer(outside); assert.equal(popup(), null); assert.equal(firstPerson.signal.aborted, true); assertFocus(outside, 'Outside dismissal must retain outside focus');
  await complete(firstPerson, 'TEST STALE SALESPERSON'); assert.equal(popup(), null); assert.doesNotMatch(host.textContent, /TEST STALE SALESPERSON/);
  const beforeEscape = candidates.length; await open('营业厅'); assert.equal(candidates.length, beforeEscape + 1); const escapedRead = candidates.at(-1);
  const escaped = await key(input('营业厅'), 'Escape');
  assert.equal(escaped.defaultPrevented, true); assert.equal(popup(), null); assert.equal(escapedRead.signal.aborted, true); assertFocus(input('营业厅'), 'Escape restores only the dismissed control input');
  await open('营业厅'); const outsideEscapeRead = candidates.at(-1); await focus(outside); await key(outside, 'Escape');
  assert.equal(popup(), null); assert.equal(outsideEscapeRead.signal.aborted, true); assertFocus(outside, 'Escape must not steal focus already moved outside');
  // A reference's remote/search window must never masquerade as the full catalogue.
  await open('营业厅'); await complete(candidates.at(-1), 'TEST LARGE HALL', { total: 205 });
  assert.match(popup().querySelector('.inv-filter-tools').textContent, /匹配 205 项 · 已选 205 项/);
  assert.equal(nodes('营业厅').length, 21); const beforeIdleCandidates = candidates.length; await settle(200); assert.equal(candidates.length, beforeIdleCandidates, 'Open never auto-enumerates later candidate pages');
  await click(nodes('营业厅')[1]); assert.match(popup().textContent, /候选尚未完整确认/); assert.match(popup().textContent, /仅选择该项/); assert.match(trigger('营业厅').textContent, /全部营业厅/);
  await click([...popup().querySelectorAll('button')].find(button => button.textContent === '仅选择该项'));
  assert.match(popup().querySelector('.inv-filter-tools').textContent, /已选 1 项/); assert.match(trigger('营业厅').textContent, /TEST LARGE HALL/);
  await click(nodes('营业厅')[0]); assert.match(trigger('营业厅').textContent, /全部营业厅/); assert.match(popup().querySelector('.inv-filter-tools').textContent, /已选 205 项/); assert.doesNotMatch(popup().textContent, /已选 0 项/);
  const beforeDebounce = candidates.length; await type('营业厅', 'OLD', 50); assert.equal(candidates.length, beforeDebounce, 'Remote search waits the 160ms debounce'); assert.equal(remoteDebounces.size, 1);
  await type('营业厅', 'NEW', 200); assert.equal(candidates.length, beforeDebounce + 1); assert.equal(candidates.at(-1).body.search, 'NEW'); const searchedRead = candidates.at(-1);
  await complete(searchedRead, 'TEST SEARCHED HALL', { total: 1 });
  assert.match(popup().querySelector('.inv-filter-tools').textContent, /匹配 1 项 · 已选 205 项/);
  await click(nodes('营业厅')[1]); assert.match(popup().textContent, /搜索匹配结果不代表全部营业厅/); assert.match(trigger('营业厅').textContent, /全部营业厅/);
  await click([...popup().querySelectorAll('button')].find(button => button.textContent === '仅选择该项')); await settle();
  assert.match(trigger('营业厅').textContent, /TEST SEARCHED HALL/); assert.equal(candidates.at(-1).body.search, ''); await complete(candidates.at(-1), 'TEST LARGE HALL', { total: 205 });
  await type('营业厅', 'STALE', 200); const oldSearch = candidates.at(-1); await type('营业厅', 'FRESH', 200); const freshSearch = candidates.at(-1); assert.equal(oldSearch.signal.aborted, true);
  await complete(oldSearch, 'TEST STALE SEARCH', { total: 1 }); assert.doesNotMatch(popup().textContent, /TEST STALE SEARCH/);
  await complete(freshSearch, 'TEST FRESH SEARCH', { total: 1, items: [{ id: uuid(211), label: 'TEST FRESH SEARCH' }] }); assert.match(popup().textContent, /TEST FRESH SEARCH/); assert.match(trigger('营业厅').textContent, /TEST SEARCHED HALL/, 'Selected labels survive a different search result');
  await type('营业厅', 'NO-MATCH', 200); await complete(candidates.at(-1), 'unused', { total: 0 }); assert.match(popup().textContent, /匹配 0 项 · 已选 1 项/); assert.match(popup().textContent, /没有匹配候选/); assert.match(trigger('营业厅').textContent, /TEST SEARCHED HALL/);
  await close('营业厅'); await open('营业厅'); await complete(candidates.at(-1), 'TEST LARGE HALL', { total: 205 });
  await click(nodes('营业厅')[0]);
  for (let page = 2; page <= 10; page++) {
    const beforeScroll = candidates.length; await bottom('营业厅'); assert.equal(candidates.length, beforeScroll + 1, 'Repeated bottom scroll starts one page only'); assert.equal(candidates.at(-1).body.page, page); assert.equal(candidates.at(-1).body.pageSize, 20);
    await complete(candidates.at(-1), 'TEST LARGE HALL', { total: 205 }); assert.equal(nodes('营业厅').length, page * 20 + 1);
  }
  assert.match(popup().querySelector('.inv-filter-tools').textContent, /匹配 205 项 · 已选 205 项/); assert.match(popup().textContent, /已加载 200 项/);
  assert.ok([...tree('营业厅').querySelectorAll('input[type="checkbox"]')].every(input => input.checked));
  const atCandidateCap = candidates.length; await bottom('营业厅'); assert.equal(candidates.length, atCandidateCap, 'The candidate display cap never starts page 11');
  await click(nodes('营业厅')[1]); assert.match(popup().textContent, /候选尚未完整确认/); assert.match(trigger('营业厅').textContent, /全部营业厅/); await close('营业厅'); assert.equal(lists.length, 0);
  console.log('PASS reference popup 2: outside/Escape abort and restore only in-control focus; debounced remote search aborts stale generations, retains selected labels, and never promotes filtered/cross-page/200-capped windows to ALL; explicit positive-only resolution and bottom-scroll bounded pages work.');

  await click(host.querySelector('.tc-filter-toggle')); const beforeAdvanced = candidates.length; await open('客户'); assert.equal(candidates.length, beforeAdvanced + 1); const advancedRead = candidates.at(-1);
  const advancedToggle = host.querySelector('.tc-filter-toggle'); await focus(advancedToggle); await click(advancedToggle);
  assert.equal(advancedRead.signal.aborted, true); assert.equal(popup(), null); assert.equal(trigger('客户'), undefined); assertFocus(advancedToggle, 'Removing advanced filter must not focus its hidden trigger');
  await open('营业厅'); const explicitCloseRead = candidates.at(-1); await close('营业厅');
  assert.equal(explicitCloseRead.signal.aborted, true); assertFocus(input('营业厅'), 'Explicit Escape close returns reference focus');
  await open('营业厅'); await complete(candidates.at(-1), 'TEST CHOSEN HALL');
  assert.match(popup().querySelector('.inv-filter-tools').textContent, /匹配 3 项 · 已选 3 项/);
  assert.ok([...tree('营业厅').querySelectorAll('input[type="checkbox"]')].every(input => input.checked));
  assert.ok(trigger('营业厅').classList.contains('inv-all-selected'), 'ALL has the native all-selected visual projection');
  await click(nodes('营业厅')[3]); await settle(350);
  assert.match(popup().querySelector('.inv-filter-tools').textContent, /匹配 3 项 · 已选 2 项/);
  assert.equal(multi('营业厅').querySelectorAll('.arco-tag').length, 2, 'A wide control fits two real tags rather than forcing one');
  assert.doesNotMatch(trigger('营业厅').textContent, /更多/); await close('营业厅'); assert.equal(lists.length, 0);
  await open('状态'); await click(nodes('状态').find(node => node.textContent === '已作废')); await close('状态');
  await open('业务类型'); await click(nodes('业务类型').find(node => node.textContent === '销售')); await close('业务类型');
  await click(host.querySelector('.tc-filter-toggle'));
  for (const [label, kind] of [['营业员', 'salesperson'], ['客户', 'customer'], ['出库仓', 'warehouse']]) {
    await open(label); assert.equal(candidates.at(-1).body.kind, kind); await complete(candidates.at(-1), `TEST CHOSEN ${label}`); await click(nodes(label)[3]); await settle(350);
    if (label === '客户') { assert.equal(multi(label).querySelectorAll('.inv-filter-count').length, 1); assert.equal(multi(label).querySelector('.inv-filter-count').textContent, '+1 更多'); assert.equal(multi(label).querySelector('.inv-filter-count').title, 'TEST CHOSEN 客户 2'); }
    await close(label);
  }
  assert.equal(lists.length, 0, 'Every checkbox edit is draft-only');
  await submit(); assert.equal(lists.length, 1);
  assert.deepEqual(lists[0].filter, { startDate: null, endDate: null, statuses: ['DRAFT', 'APPROVED'], businessTypes: ['RETURN', 'EXCHANGE'], hallIds: [uuid(11), uuid(111)], salespersonIds: [uuid(14), uuid(114)], customerIds: [uuid(12), uuid(112)], warehouseIds: [uuid(13), uuid(113)], number: null });
  assert.equal(host.querySelectorAll('.sales-list tbody tr').length, 1, 'Plural selections remain compatible with strict list-membership validation');
  console.log('PASS reference popup 3: advanced removal/explicit close clean up without hidden focus; genuine checked ALL and fitted plural tags edit only draft; explicit query carries all six plural dimensions and native RETURN+EXCHANGE grouping.');

  await open('营业厅'); const interruptedRead = candidates.at(-1); await click(host.querySelector('.sales-view'));
  assert.equal(interruptedRead.signal.aborted, true); assert.equal(popup(), null); assert.ok(host.querySelector('.sales-detail-page'));
  assert.equal(host.querySelector('[data-document-list="sales"]').hidden, true); assert.equal(document.activeElement.textContent, '返回列表');
  await complete(interruptedRead, 'TEST LATE DETAIL INTERRUPTION');
  await click([...host.querySelectorAll('button')].find(button => button.textContent === '返回列表')); assert.equal(popup(), null); assert.equal(lists.length, 1); assert.equal(details.length, 1);
  await open('营业厅'); const unmountedRead = candidates.at(-1); await act(async () => root.unmount()); root = null;
  assert.equal(unmountedRead.signal.aborted, true); assert.equal(registered.size, 0); assert.equal((await key(outside, 'Escape')).defaultPrevented, false);
  await complete(unmountedRead, 'TEST LATE UNMOUNT'); assert.equal(host.textContent, '');
  console.log('PASS reference popup 4: entering detail and route unmount abort pending candidates, drop late completions, preserve the retained applied list and release page listeners.');

  await mount(); await open('营业厅'); const previousProviderRead = candidates.at(-1), beforeProviderChange = candidates.length;
  const replacementReferences = createSalesFilterReferenceHttpReader(options); await render(replacementReferences);
  assert.equal(previousProviderRead.signal.aborted, true, 'Changing the reader invalidates its popup child immediately'); assert.equal(popup(), null); assert.equal(candidates.length, beforeProviderChange, 'Provider replacement does not start an implicit read');
  await complete(previousProviderRead, 'TEST LATE PREVIOUS PROVIDER'); assert.doesNotMatch(host.textContent, /TEST LATE PREVIOUS PROVIDER/);
  await open('营业员'); assert.equal(candidates.length, beforeProviderChange + 1); const revokedRead = candidates.at(-1), beforeRevocation = candidates.length;
  await act(async () => context.replaceIdentity({ accountId: 'TEST-REFERENCE-POPUP', sessionRevision: '2', permissionRevision: '2' })); await settle();
  assert.equal(revokedRead.signal.aborted, true); assert.equal(popup(), null); assert.equal(registered.size, 0); assert.match(host.textContent, /旧身份结果已清除/);
  await complete(revokedRead, 'TEST LATE REVOKED'); assert.doesNotMatch(host.textContent, /TEST LATE REVOKED/); assert.equal(candidates.length, beforeRevocation);
  assert.equal((await key(outside, 'Escape')).defaultPrevented, false);
  await act(async () => root.unmount()); root = null;
  console.log('PASS reference popup 5: open-reader replacement aborts without implicit reads or stale labels; same-account identity/permission revocation aborts the transport and listener ownership immediately; late completion cannot reopen or reread.');
  console.log('All 5 focused synthetic reference-popup DOM groups passed. No real browser, production data, Demo appearance or performance acceptance.');
} finally {
  if (root) await (await import('react')).act(async () => root.unmount());
  globalThis.setTimeout = nativeSetTimeout; globalThis.clearTimeout = nativeClearTimeout;
  dom.window.close(); await rm(temp, { recursive: true, force: true });
}
