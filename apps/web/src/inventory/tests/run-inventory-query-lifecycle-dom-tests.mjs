import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Real React19 StrictMode and actual inventory/candidate components. Deferred
// transports deliberately ignore AbortSignal to exercise late success/failure.
// JSDOM proves lifecycle/event contracts, not browser implicit submission/layout.
const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.inventory-query-lifecycle-'));
const dom = new JSDOM('<!doctype html><style data-inventory-inline data-demo-single-select-inline></style><div id="root"></div><button id="outside">outside</button>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLDialogElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLIFrameElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
dom.window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, act, restoreDispose;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'inventory-query-lifecycle-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const module = await import(pathToFileURL(output).href);
  const { createElement: h, StrictMode, createRoot, InventoryPageView, CandidateSelector, ReadContext, ReadScope, LatestQuery, createSyntheticInventoryReader, createSyntheticProductReader } = module;
  ({ act } = module);
  const host = document.getElementById('root');
  const requests = [], disposedQueries = [], disposedScopes = [];
  const queryDispose = LatestQuery.prototype.dispose, scopeDispose = ReadScope.prototype.dispose;
  LatestQuery.prototype.dispose = function () { if (this.getSnapshot().phase !== 'disposed') disposedQueries.push(this); return queryDispose.call(this); };
  ReadScope.prototype.dispose = function () { if (this.active) disposedScopes.push(this); return scopeDispose.call(this); };
  restoreDispose = () => { LatestQuery.prototype.dispose = queryDispose; ReadScope.prototype.dispose = scopeDispose; };
  const pending = kind => read => new Promise((resolve, reject) => requests.push({ kind, read, resolve, reject }));
  const reader = { readInventory: pending('inventory'), readCandidates: pending('candidate') };
  const fixture = createSyntheticInventoryReader({ productCount: 1, delayMs: 0 });
  const productReads = [];
  const productReader = createSyntheticProductReader({ delayMs: 0, onRead: event => productReads.push(event) });
  const identity = (accountId, revision = '1') => ({ accountId, sessionRevision: revision, permissionRevision: revision });
  const context = new ReadContext(identity('TEST-INVENTORY-LIFECYCLE'));
  let scope = context.createScope('TEST-INVENTORY-LIFECYCLE');
  root = createRoot(host);
  const settle = async (ms = 20) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
  const click = async element => { assert.ok(element, 'Expected clickable element'); await act(async () => element.click()); };
  const button = text => [...host.querySelectorAll('button')].find(element => element.textContent.trim() === text);
  const renderPage = async () => act(async () => root.render(h(StrictMode, null, h(InventoryPageView, { scope, reader, productReader }))));
  const clear = async () => act(async () => root.render(null));
  const submit = async () => { const form = host.querySelector('form[aria-label="库存筛选"]'); assert.ok(form); await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); };
  const latest = kind => requests.findLast(request => request.kind === kind);
  const count = kind => requests.filter(request => request.kind === kind).length;
  const resolve = async (request, value) => { await act(async () => request.resolve(value)); await settle(); };
  const reject = async (request, message) => { await act(async () => request.reject(new Error(message))); await settle(); };
  const inventoryData = async (request, name) => {
    const data = await fixture.readInventory({ ...request.read, signal: new AbortController().signal });
    return { ...data, products: data.products.map(product => ({ ...product, name })) };
  };
  const succeedInventory = async (request, name) => resolve(request, await inventoryData(request, name));
  const candidateData = (request, label = 'CURRENT CANDIDATE') => ({ page: request.read.parameters.page, exactTotal: 1, items: [{ id: `candidate-${label}`, label }] });
  const type = async (input, value) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await renderPage(); await settle();
  assert.ok(host.querySelector('form')); assert.equal(scope.active, true); assert.equal(requests.length, 0);
  assert.doesNotMatch(host.textContent, /当前读取范围已关闭/);
  assert.ok(disposedQueries.length >= 1, 'Replay must permanently dispose its abandoned query');
  await submit(); assert.equal(count('inventory'), 1); const first = latest('inventory');
  assert.equal(first.read.signal.aborted, false); assert.deepEqual(first.read.identity, identity('TEST-INVENTORY-LIFECYCLE'));
  await succeedInventory(first, 'CURRENT INVENTORY FACT'); assert.match(host.textContent, /CURRENT INVENTORY FACT/);
  assert.equal(count('candidate'), 0); assert.equal(productReads.length, 0);
  console.log('PASS inventory StrictMode: replay abandons its old query but keeps the visible form live; idle makes no reads; one explicit submit starts exactly one bounded transport.');

  await click(button('刷新')); const failed = latest('inventory'); await reject(failed, 'TEST inventory failure');
  assert.match(host.querySelector('[role=alert]').textContent, /TEST inventory failure/); assert.match(host.textContent, /CURRENT INVENTORY FACT/);
  const beforeRetry = count('inventory'); await click(button('重试')); assert.equal(count('inventory'), beforeRetry + 1);
  await succeedInventory(latest('inventory'), 'RECOVERED INVENTORY FACT'); assert.equal(host.querySelector('[role=alert]'), null);
  await click(button('刷新')); const cancelled = latest('inventory'); await click(button('取消本次读取'));
  assert.equal(cancelled.read.signal.aborted, true); await reject(cancelled, 'LATE CANCELLED INVENTORY FAILURE');
  assert.match(host.textContent, /RECOVERED INVENTORY FACT/); assert.doesNotMatch(host.textContent, /LATE CANCELLED/);
  console.log('PASS inventory retry/cancel: error retains labelled prior success; one retry recovers; cancellation aborts and ignores a late rejected transport.');

  await click(button('刷新')); const closed = latest('inventory'); const beforeClose = count('inventory');
  await clear(); assert.equal(closed.read.signal.aborted, true); assert.equal(scope.active, true, 'The page must not dispose its caller-owned parent');
  await reject(closed, 'LATE CLOSED INVENTORY FAILURE'); assert.equal(host.childElementCount, 0);
  await renderPage(); await settle(); assert.ok(host.querySelector('form')); assert.equal(count('inventory'), beforeClose);
  assert.doesNotMatch(host.textContent, /RECOVERED INVENTORY FACT|LATE CLOSED/);
  await submit(); assert.equal(count('inventory'), beforeClose + 1); await succeedInventory(latest('inventory'), 'REOPENED INVENTORY FACT');
  console.log('PASS inventory route close/reopen: unmount aborts immediately without closing the parent; late failure cannot reattach; reopening is fresh and waits for its own explicit query.');

  await click(button('刷新')); const replaced = latest('inventory'); const oldParent = scope;
  const otherContext = new ReadContext(identity('TEST-OTHER-IDENTITY', '2'));
  scope = otherContext.createScope('TEST-OTHER-ROUTE'); await renderPage();
  assert.equal(oldParent.active, true); assert.equal(replaced.read.signal.aborted, true); assert.doesNotMatch(host.textContent, /REOPENED INVENTORY FACT/);
  await reject(replaced, 'LATE REPLACED INVENTORY FAILURE'); assert.equal(host.querySelector('[role=alert]'), null);
  await submit(); const other = latest('inventory'); assert.deepEqual(other.read.identity, identity('TEST-OTHER-IDENTITY', '2'));
  await succeedInventory(other, 'OTHER IDENTITY FACT');
  await click(host.querySelector('.iw-product-field .iw-control')); await settle(); const revokedCandidate = latest('candidate');
  await click(button('刷新')); const revokedInventory = latest('inventory');
  await act(async () => otherContext.replaceIdentity(identity('TEST-OTHER-IDENTITY', '3')));
  assert.equal(revokedInventory.read.signal.aborted, true); assert.equal(revokedCandidate.read.signal.aborted, true);
  assert.equal(host.querySelector('form'), null); assert.equal(host.querySelector('.mx-stock'), null); assert.match(host.textContent, /旧身份结果已清除/);
  await reject(revokedInventory, 'LATE REVOKED INVENTORY FAILURE'); await resolve(revokedCandidate, candidateData(revokedCandidate, 'LATE REVOKED CANDIDATE'));
  assert.doesNotMatch(host.textContent, /OTHER IDENTITY FACT|LATE REVOKED/);
  scope = otherContext.createScope('TEST-RESTORED-ROUTE'); await renderPage(); await submit();
  assert.deepEqual(latest('inventory').read.identity, identity('TEST-OTHER-IDENTITY', '3'));
  await succeedInventory(latest('inventory'), 'RESTORED IDENTITY FACT'); assert.match(host.textContent, /RESTORED IDENTITY FACT/);
  await clear(); otherContext.clear(); context.clear();
  console.log('PASS inventory identity: active-parent replacement clears prior facts and aborts; permission/session revocation aborts inventory and candidate reads together; a new scope reads only the new identity.');

  const candidateContext = new ReadContext(identity('TEST-CANDIDATE'));
  scope = candidateContext.createScope('TEST-CANDIDATE');
  let selected = [], fullSubmits = 0, uncancelledEnter = 0, categoryId = null;
  const renderCandidate = async () => act(async () => root.render(h(StrictMode, null,
    h('form', { 'aria-label': 'candidate parent form', onSubmit: event => { event.preventDefault(); fullSubmits++; }, onKeyDown: event => { if (event.key === 'Enter' && !event.defaultPrevented) uncancelledEnter++; } },
      h(CandidateSelector, { scope, reader, kind: 'product', label: '商品', multiple: true, selected, categoryId, onChange: value => { selected = value; void renderCandidate(); } })))));
  const control = () => host.querySelector('.iw-control');
  const popup = () => host.querySelector('[role=dialog]');
  await renderCandidate(); const beforeFirst = count('candidate');
  // Closing during input attachment precedes the zero-delay candidate start.
  const closeOnFocus = event => { if (event.target.matches('.iw-search')) host.querySelector('[aria-label="关闭商品选择"]').click(); };
  host.addEventListener('focusin', closeOnFocus); await click(control()); await settle(); host.removeEventListener('focusin', closeOnFocus);
  assert.equal(popup(), null); assert.equal(count('candidate'), beforeFirst);
  await click(control()); await settle(); assert.equal(count('candidate'), beforeFirst + 1);
  const opening = latest('candidate'); assert.equal(opening.read.signal.aborted, false);
  assert.equal(opening.read.parameters.search, ''); assert.equal(opening.read.parameters.pageSize, 20);
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  await act(async () => host.querySelector('.iw-search').dispatchEvent(enter));
  assert.equal(enter.defaultPrevented, true); assert.equal(uncancelledEnter, 0); assert.equal(fullSubmits, 0);
  await type(host.querySelector('.iw-search'), 'one'); await type(host.querySelector('.iw-search'), 'two');
  assert.equal(opening.read.signal.aborted, true); await settle(220);
  assert.equal(count('candidate'), beforeFirst + 2); const searched = latest('candidate'); assert.equal(searched.read.parameters.search, 'two');
  await click(host.querySelector('[aria-label="关闭商品选择"]')); assert.equal(searched.read.signal.aborted, true); assert.equal(popup(), null);
  await reject(searched, 'LATE CLOSED CANDIDATE FAILURE'); assert.equal(popup(), null);
  await resolve(opening, candidateData(opening, 'LATE SUPERSEDED CANDIDATE')); assert.doesNotMatch(host.textContent, /LATE SUPERSEDED/);
  console.log('PASS candidate StrictMode/debounce: close-before-start sends nothing; one open sends one actual transport; rapid search starts only its latest bounded read; Enter is default-cancelled before the parent form; close rejects late facts/failures.');

  await click(control()); await settle(); const reopenedCandidate = latest('candidate');
  assert.equal(count('candidate'), beforeFirst + 3); assert.equal(reopenedCandidate.read.parameters.search, '');
  await reject(reopenedCandidate, 'TEST CANDIDATE FAILURE'); assert.match(popup().textContent, /候选暂不可读取/);
  const beforeCandidateRetry = count('candidate'); await click(button('重试')); assert.equal(count('candidate'), beforeCandidateRetry + 1);
  const retriedCandidate = latest('candidate'); await resolve(retriedCandidate, candidateData(retriedCandidate));
  assert.equal(host.querySelectorAll('.iw-option-list input').length, 1); assert.doesNotMatch(popup().textContent, /正在加载候选|候选暂不可读取/);
  const beforeSelect = count('candidate'); await click(host.querySelector('.iw-option-list input')); await settle(220);
  assert.equal(count('candidate'), beforeSelect); assert.match(control().textContent, /CURRENT CANDIDATE/);
  await click(button('完成')); assert.equal(popup(), null); assert.equal(document.activeElement, control());
  await click(control()); await settle(); const remounted = latest('candidate'); assert.equal(count('candidate'), beforeSelect + 1);
  assert.deepEqual(remounted.read.parameters.selectedIds, ['candidate-CURRENT CANDIDATE']);
  await resolve(remounted, candidateData(remounted));
  console.log('PASS candidate error/retry/reopen: one retry recovers actual options; selecting keeps labels without rereading; completion returns focus; reopening starts fresh and sends current selected IDs.');

  categoryId = 'TEST-CATEGORY'; const beforeCategory = count('candidate'); await renderCandidate(); await settle();
  assert.equal(count('candidate'), beforeCategory + 1); const categoryRead = latest('candidate'); assert.equal(categoryRead.read.parameters.categoryId, 'TEST-CATEGORY');
  await act(async () => candidateContext.replaceIdentity(identity('TEST-CANDIDATE', '2')));
  assert.equal(categoryRead.read.signal.aborted, true); assert.equal(popup(), null);
  await reject(categoryRead, 'LATE REVOKED CANDIDATE FAILURE'); assert.equal(popup(), null);
  await clear(); scope = candidateContext.createScope('TEST-CANDIDATE-RESTORED'); await renderCandidate(); await click(control()); await settle();
  const activeUnmount = latest('candidate'); assert.deepEqual(activeUnmount.read.identity, identity('TEST-CANDIDATE', '2'));
  await clear(); assert.equal(activeUnmount.read.signal.aborted, true); await reject(activeUnmount, 'LATE UNMOUNT CANDIDATE FAILURE');
  assert.equal(host.childElementCount, 0); candidateContext.clear();
  assert.ok(disposedQueries.every(query => { const state = query.getSnapshot(); return state.phase === 'disposed' && state.success === null && state.request === null && state.error === null; }));
  assert.ok(disposedScopes.every(value => !value.active));
  assert.equal(productReads.length, 0);
  console.log('PASS final cleanup: category changes reread only candidates; identity abort and real unmount immediately abort pending candidates; late failure is ignored; disposed queries retain no request/success/error references, and no product prefetch occurs.');
} finally {
  if (root && act) await act(async () => root.unmount());
  restoreDispose?.();
  dom.window.close();
  await rm(temporary, { recursive: true, force: true });
}
