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
const dom = new JSDOM('<!doctype html><style data-inventory-inline data-demo-single-select-inline data-demo-multi-select-inline data-inventory-product-select-inline></style><div id="root"></div><button id="outside">outside</button>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
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
  const candidateData = (request, label = 'CURRENT CANDIDATE') => ({ page: request.read.parameters.page, exactTotal: 1, items: [{ id: `candidate-${label}`, label, code: `CODE-${label}`, name: label }] });
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
  await click(host.querySelector('.iw-product-field input')); await settle(); await type(host.querySelector('.iw-product-field input'), 'revoke'); await settle(220); const revokedCandidate = latest('candidate');
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
  let selected = [], fullSubmits = 0, uncancelledEnter = 0, categoryIds = [], candidateProductReader;
  const renderCandidate = async () => act(async () => root.render(h(StrictMode, null,
    h('form', { 'aria-label': 'candidate parent form', onSubmit: event => { event.preventDefault(); fullSubmits++; }, onKeyDown: event => { if (event.key === 'Enter' && !event.defaultPrevented) uncancelledEnter++; } },
      h(CandidateSelector, { scope, reader, productReader: candidateProductReader, kind: 'product', label: '商品', multiple: true, selected, categoryIds, onChange: value => { selected = value; void renderCandidate(); } })))));
  const input = () => host.querySelector('.iw-product-field input:not([type="hidden"])');
  const popup = () => host.querySelector('.arco-select[aria-expanded="true"]') ? host.querySelector('.arco-select-popup') : null;
  const dismiss = async () => act(async () => document.getElementById('outside').dispatchEvent(new Event('pointerdown', { bubbles: true })));
  await renderCandidate(); const beforeFirst = count('candidate');
  await click(input()); await settle(); assert.ok(popup()); assert.match(popup().textContent, /最近搜索/); assert.equal(count('candidate'), beforeFirst);
  assert.equal(host.querySelectorAll('.iw-search').length, 0); assert.doesNotMatch(popup().textContent, /选择商品|上一页|下一页|完成/);
  await type(input(), 'one'); await type(input(), 'two'); await settle(220);
  assert.equal(count('candidate'), beforeFirst + 1); const searched = latest('candidate');
  assert.equal(searched.read.parameters.search, 'two'); assert.equal(searched.read.parameters.pageSize, 20); assert.deepEqual(searched.read.parameters.categoryIds, []);
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  await act(async () => input().dispatchEvent(enter)); assert.equal(enter.defaultPrevented, true); assert.equal(uncancelledEnter, 0); assert.equal(fullSubmits, 0);
  await type(input(), 'three'); assert.equal(searched.read.signal.aborted, true); await settle(220);
  const superseding = latest('candidate'); assert.equal(count('candidate'), beforeFirst + 2);
  await resolve(searched, candidateData(searched, 'LATE SUPERSEDED CANDIDATE')); assert.doesNotMatch(host.textContent, /LATE SUPERSEDED/);
  await dismiss(); assert.equal(superseding.read.signal.aborted, true); await reject(superseding, 'LATE CLOSED CANDIDATE FAILURE'); await settle(); assert.equal(!!popup(), false);
  console.log('PASS candidate StrictMode/debounce: recent history sends no catalogue read; direct inline input starts only the latest bounded search; Enter never submits inventory; close aborts and rejects late facts.');

  await click(input()); await settle(); await type(input(), 'retry'); await settle(220); const reopenedCandidate = latest('candidate');
  await reject(reopenedCandidate, 'TEST CANDIDATE FAILURE'); assert.match(popup().textContent, /候选暂不可读取/);
  const beforeCandidateRetry = count('candidate'); await click(button('重试候选')); assert.equal(count('candidate'), beforeCandidateRetry + 1);
  const retriedCandidate = latest('candidate'); await resolve(retriedCandidate, candidateData(retriedCandidate));
  assert.equal(host.querySelectorAll('[data-product-id]').length, 1); assert.match(popup().textContent, /商品款号.*商品名称/);
  assert.match(host.querySelector('.inv-option-code').textContent, /CODE-CURRENT CANDIDATE/); assert.equal(host.querySelector('.inv-option-name').textContent, 'CURRENT CANDIDATE');
  const beforeSelect = count('candidate'); await click(host.querySelector('[data-product-id]')); await settle(220);
  assert.equal(count('candidate'), beforeSelect); assert.equal(selected.length, 1); assert.match(host.querySelector('.inv-tag').textContent, /CODE-CURRENT CANDIDATE/);
  assert.match(popup().textContent, /最近搜索/); assert.match(popup().textContent, /CODE-CURRENT CANDIDATE/);
  await click(button('清空')); assert.doesNotMatch(popup().textContent, /CODE-CURRENT CANDIDATE/); assert.match(popup().textContent, /暂无最近搜索/);
  await dismiss(); await settle(); await click(input()); await settle(); await type(input(), 'current'); await settle(220);
  const remounted = latest('candidate'); assert.deepEqual(remounted.read.parameters.selectedIds, ['candidate-CURRENT CANDIDATE']);
  await resolve(remounted, candidateData(remounted));
  const retainedNode = host.querySelector('[data-product-id]'); const retainedKey = Object.keys(retainedNode).find(key => key.startsWith('__reactProps$'));
  const retainedOptionClick = retainedNode[retainedKey].onClick;
  console.log('PASS candidate error/retry/history: retry recovers source-style code/name options; selection uses actual provider identities without rereading; code tags and bounded local recent history survive closing only.');

  categoryIds = ['TEST-CATEGORY', 'TEST-CATEGORY-2']; const beforeCategory = count('candidate'); await renderCandidate(); await settle(220);
  assert.equal(count('candidate'), beforeCategory + 1); const categoryRead = latest('candidate'); assert.deepEqual(categoryRead.read.parameters.categoryIds, categoryIds);
  const beforeRetained = selected; await act(async () => retainedOptionClick(new MouseEvent('click', { bubbles: true })));
  assert.equal(selected, beforeRetained, 'A retained old-query public option callback cannot change the current draft');
  await act(async () => candidateContext.replaceIdentity(identity('TEST-CANDIDATE', '2')));
  assert.equal(categoryRead.read.signal.aborted, true); assert.equal(!!popup(), false);
  await reject(categoryRead, 'LATE REVOKED CANDIDATE FAILURE'); assert.equal(!!popup(), false);
  await clear(); scope = candidateContext.createScope('TEST-CANDIDATE-RESTORED'); await renderCandidate(); await click(input()); await settle(); await type(input(), 'unmount'); await settle(220);
  const activeUnmount = latest('candidate'); assert.deepEqual(activeUnmount.read.identity, identity('TEST-CANDIDATE', '2'));
  await clear(); assert.equal(activeUnmount.read.signal.aborted, true); await reject(activeUnmount, 'LATE UNMOUNT CANDIDATE FAILURE');
  assert.equal(host.childElementCount, 0); candidateContext.clear();
  assert.ok(disposedQueries.every(query => { const state = query.getSnapshot(); return state.phase === 'disposed' && state.success === null && state.request === null && state.error === null; }));
  assert.ok(disposedScopes.every(value => !value.active)); assert.equal(productReads.length, 0);
  console.log('PASS final cleanup: category arrays reread only candidates; identity abort and real unmount immediately abort pending candidates; history/facts are cleared; no product prefetch occurs before active suggestions.');

  // Active-candidate facts are separate existing target-only ports, not per-row hydration.
  const previewContext = new ReadContext(identity('TEST-PREVIEW')); scope = previewContext.createScope('TEST-ACTIVE-PREVIEW'); selected = []; categoryIds = [];
  candidateProductReader = { readProductBasics: pending('previewBasics'), readProductSpecifications: pending('previewSpecs'), readProductImages: pending('previewImages'),
    readProductImage() { throw new Error('An original image must never prefetch.'); } };
  await renderCandidate(); await click(input()); await settle(); assert.equal(count('previewBasics'), 0);
  await type(input(), 'preview'); await settle(220); const previewCandidates = latest('candidate');
  const two = [{ id: 'PREVIEW-A', label: 'A Product A', code: 'CODE-A', name: 'Product A' }, { id: 'PREVIEW-B', label: 'B Product B', code: 'CODE-B', name: 'Product B' }];
  await resolve(previewCandidates, { page: 1, exactTotal: 2, items: two }); await settle();
  assert.equal(count('previewBasics'), 1); assert.equal(count('previewSpecs'), 1); assert.equal(count('previewImages'), 1);
  const oldFacts = ['previewBasics', 'previewSpecs', 'previewImages'].map(latest);
  for (const read of oldFacts) assert.equal(read.read.parameters.productId, 'PREVIEW-A');
  await act(async () => host.querySelector('[data-product-id="PREVIEW-B"]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
  await settle(); for (const read of oldFacts) assert.equal(read.read.signal.aborted, true);
  assert.equal(count('previewBasics'), 2); assert.equal(count('previewSpecs'), 2); assert.equal(count('previewImages'), 2);
  const basics = (id, name, price = null) => ({ productId: id, code: `FACT-${id}`, name, categoryLabel: null, yearLabel: null, seasonLabel: null, supplierLabel: null, systemCode: null, retailPrice: price });
  await resolve(oldFacts[0], basics('PREVIEW-A', 'LATE OLD PREVIEW', '99.99'));
  assert.doesNotMatch(host.textContent, /LATE OLD PREVIEW|99.99/);
  await resolve(latest('previewBasics'), basics('PREVIEW-B', 'CURRENT PREVIEW FACT', '12.34'));
  await resolve(latest('previewSpecs'), { productId: 'PREVIEW-B', sizeGroup: null, colors: [{ id: 'COLOR', label: 'Blue' }], fits: [{ id: 'FIT', label: 'Regular' }], sizes: [], skus: [] });
  await resolve(latest('previewImages'), { productId: 'PREVIEW-B', images: [] });
  assert.match(host.querySelector('.inv-preview').textContent, /CURRENT PREVIEW FACT/); assert.match(host.querySelector('.inv-preview').textContent, /12.34/);
  assert.match(host.querySelector('.inv-preview').textContent, /1 色/); assert.match(host.querySelector('.inv-preview').textContent, /该商品尚未提供图片/);
  await act(async () => input().dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true })));
  await act(async () => input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
  assert.equal(selected.length, 0, 'IME confirmation cannot choose a candidate');
  await act(async () => input().dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true })));
  await act(async () => input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
  assert.equal(selected.length, 0, 'The immediate post-composition Enter cannot choose a candidate'); await settle(50);
  const beforeEnterCandidates = count('candidate'); const beforeEnterFacts = count('previewBasics');
  const chooseEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  await act(async () => input().dispatchEvent(chooseEnter)); await settle();
  assert.equal(chooseEnter.defaultPrevented, true); assert.equal(fullSubmits, 0); assert.equal(count('candidate'), beforeEnterCandidates); assert.equal(count('previewBasics'), beforeEnterFacts);
  assert.equal(selected[0].id, 'PREVIEW-B'); assert.equal(host.querySelector('.inv-preview'), null);
  await clear(); previewContext.clear();
  console.log('PASS active preview: exactly one target gets basics/specifications/thumbnails; hover aborts prior target and ignores late facts; actual retail price is displayed; candidate Enter selects without inventory query or original-image fetch.');



  // The real inventory page reuses shared TreeSelect branches and warehouse tags.
  const referenceContext = new ReadContext(identity('TEST-REFERENCE-MULTI')); scope = referenceContext.createScope('TEST-REFERENCE-MULTI');
  await renderPage(); await settle();
  const refHost = label => host.querySelector(`[data-multi-label="${label}"]`);
  const refControl = label => refHost(label).querySelector('.iw-control, .arco-tree-select-view');
  const treeRows = label => [...refHost(label).querySelectorAll('.arco-tree-node')];
  const treeRow = (label, name) => treeRows(label).find(row => row.querySelector('.arco-tree-node-title')?.textContent === name);
  const checkbox = row => row?.querySelector('input[type=checkbox]');
  await click(refControl('商品分类')); await settle(); const categoryCandidates = latest('candidate');
  assert.equal(categoryCandidates.read.parameters.kind, 'category');
  await resolve(categoryCandidates, { page: 1, exactTotal: 4, items: [
    { id: 'CATEGORY-PARENT', label: 'Parent', parentId: null, depth: 0 },
    { id: 'CATEGORY-CHILD', label: 'Child', parentId: 'CATEGORY-PARENT', parentLabel: 'Parent', depth: 1 },
    { id: 'CATEGORY-OTHER', label: 'Other', parentId: null, depth: 0 },
    { id: 'CATEGORY-ORPHAN', label: 'Orphan Child', parentId: 'NOT-LOADED', parentLabel: 'Native Missing Parent', depth: 1 },
  ] });
  assert.ok(treeRow('商品分类', 'Native Missing Parent / Orphan Child'));
  assert.equal(!!treeRow('商品分类', 'Native Missing Parent'), false, 'A supplied parent label is a path, not a fabricated parent node');
  assert.equal(refHost('商品分类').querySelectorAll('.iw-search, .iw-pop-head, footer').length, 0);
  // Category ALL-minus is never synthesized, even when all named categories fit one page.
  await click(checkbox(treeRow('商品分类', 'Parent'))); assert.match(refHost('商品分类').textContent, /不能从全部范围排除单项/);
  await click([...refHost('商品分类').querySelectorAll('button')].find(button => button.textContent === '仅选择该项'));
  assert.match(refHost('商品分类').querySelector('.arco-tag').textContent, /Parent/);
  const parentNode = treeRow('商品分类', 'Parent'); if (parentNode.getAttribute('aria-expanded') !== 'true') await click(parentNode.querySelector('.arco-tree-node-switcher-icon[role="button"]'));
  await settle(); assert.ok(treeRow('商品分类', 'Child')); assert.equal(checkbox(treeRow('商品分类', 'Child')).checked, true);
  await click(checkbox(treeRow('商品分类', 'Child'))); assert.match(refHost('商品分类').textContent, /不支持只排除其中一个子分类/);
  await click([...refHost('商品分类').querySelectorAll('button')].find(button => button.textContent === '仅选择该项'));
  await click(checkbox(treeRow('商品分类', 'Other')));
  const beforeExplicitQuery = count('inventory'); await submit(); assert.equal(count('inventory'), beforeExplicitQuery + 1);
  assert.deepEqual(latest('inventory').read.parameters.filter.categories.map(item => item.id), ['CATEGORY-CHILD', 'CATEGORY-OTHER']);
  await resolve(latest('inventory'), await inventoryData(latest('inventory'), 'CATEGORY MULTI RESULT'));
  await click(refControl('仓库')); await settle(); assert.equal(refHost('商品分类').querySelector('.arco-tree-select').getAttribute('aria-expanded'), 'false');
  const warehouseCandidates = latest('candidate'); assert.equal(warehouseCandidates.read.parameters.kind, 'warehouse');
  await resolve(warehouseCandidates, { page: 1, exactTotal: 2, items: [{ id: 'WAREHOUSE-A', label: 'Warehouse A' }, { id: 'WAREHOUSE-B', label: 'Warehouse B' }] });
  await click(checkbox(treeRow('仓库', 'Warehouse A'))); assert.match(refHost('仓库').querySelector('.arco-tag').textContent, /Warehouse B/);
  assert.equal(refHost('仓库').querySelectorAll('.iw-search, .iw-pop-head, footer').length, 0);
  await submit(); assert.deepEqual(latest('inventory').read.parameters.filter.warehouses.map(item => item.id), ['WAREHOUSE-B']);
  await clear(); referenceContext.clear();
  console.log('PASS inventory shared filters: native category hierarchy preserves explicit multi-branch IDs, refuses ALL-minus/parent-minus-child, deliberate replacement works; warehouse source tags select a true subset; changing controls never auto-submits inventory.');

} finally {
  if (root && act) await act(async () => root.unmount());
  restoreDispose?.();
  dom.window.close();
  await rm(temporary, { recursive: true, force: true });
}
