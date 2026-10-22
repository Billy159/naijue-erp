import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)), temp = await mkdtemp(path.join(here, '.pagination-dom-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLIFrameElement', 'Element', 'SVGElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'getComputedStyle']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window); globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
let root;
try {
  const output = path.join(temp, 'entry.mjs');
  await build({ stdin: { resolveDir: here, sourcefile: path.join(here, 'pagination-entry.tsx'), contents: `
export { act, createElement, StrictMode } from 'react'; export { createRoot } from 'react-dom/client';
export { ReadContext } from '../../loading/read-scope.ts';
export { StandardPagination } from '../standard-pagination.tsx';
export { InventoryPagination } from '../pagination.tsx';
export { SalesPagination } from '../../sales/sales-pagination.tsx';
export { TransferPagination } from '../../transfers/pagination.tsx';
export { PartyPagination } from '../../parties/party-pagination.tsx';
export { StoreSettingsPagination } from '../../settings/stores/pagination.tsx';
export { CataloguePagination } from '../../product-settings/colors/pagination.tsx';
export { DictionaryPagination } from '../../product-settings/size-groups/pagination.tsx';` }, outfile: output, bundle: true, platform: 'node', format: 'esm', external: ['react', 'react/*', 'react-dom', 'react-dom/*'], jsx: 'automatic', loader: { '.css': 'empty' }, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'warning' });
  const modules = await import(pathToFileURL(output).href), { act, createElement, StrictMode, createRoot, ReadContext } = modules;
  const host = document.getElementById('root'); root = createRoot(host);
  const context = new ReadContext({ accountId: 'TEST-PAGER', sessionRevision: '1', permissionRevision: '1' });
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); };
  const requested = [], sizes = [];
  const props = { scope: context.createScope('pagination'), page: 1, pageSize: 20, total: 205, busy: false, onPage: page => requested.push(page), onPageSize: size => sizes.push(size) };
  const render = async (name, extra = {}) => { await act(async () => root.render(createElement(StrictMode, null, createElement(modules[name], { ...props, pageSize: name === 'InventoryPagination' ? 100 : 20, ...extra })))); await settle(); };
  const click = async element => { assert.ok(element, 'Pager target exists'); await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true }))); await settle(); };
  for (const name of ['InventoryPagination', 'SalesPagination', 'TransferPagination', 'PartyPagination', 'StoreSettingsPagination', 'CataloguePagination', 'DictionaryPagination']) {
    const total = /Sales|Transfer/.test(name) ? '205' : 205;
    await render(name, { total });
    assert.ok(host.querySelector('.arco-pagination'), `${name}: known safe total must use actual shared Arco Pagination`);
    assert.equal(requested.length, 0, 'Construction/render must not request a page');
    await click(host.querySelector('[aria-label="下一页"]')); assert.equal(requested.pop(), 2, `${name}: next page uses the domain callback`);
    assert.equal(host.querySelector('.arco-pagination-item-active')?.textContent.trim(), '1', 'Requested page is not shown as executed before parent response');
    await render(name, { total, page: 2 });
    assert.equal(host.querySelector('.arco-pagination-item-active')?.textContent.trim(), '2');
    await render(name, { total, busy: true }); await click(host.querySelector('[aria-label="下一页"]')); assert.equal(requested.length, 0, 'Busy cannot request another page');
    await render(name, { total: null }); assert.ok(host.querySelector('.arco-pagination') === null, 'Unknown total is not converted into zero/estimated Arco total');
  }
  console.log('PASS Pagination 1: all seven real consumers use actual Arco for known safe totals, controlled executed page, busy and honest null.');
  await render('InventoryPagination');
  const keyboardNext = host.querySelector('[aria-label="下一页"]');
  assert.equal(keyboardNext.tabIndex, 0);
  await act(async () => { keyboardNext.focus(); keyboardNext.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true })); });
  await settle(); assert.equal(requested.pop(), 2); assert.ok(document.activeElement === keyboardNext);
  for (const name of ['SalesPagination', 'TransferPagination']) {
    await render(name, { total: '9007199254740995' });
    assert.ok(host.querySelector('.arco-pagination') === null, 'Arco number-only total must not receive rounded large integer');
    assert.ok(host.querySelector('[data-pagination-mode="exact-bigint"]'));
    assert.match(host.textContent, /9,007,199,254,740,995/);
    await click(host.querySelector('[aria-label="下一页"]')); assert.equal(requested.pop(), 2);
    const last = [...host.querySelectorAll('[aria-label]')].find(element => element.getAttribute('aria-label') === '第450359962737050页');
    assert.ok(last?.disabled, 'Page beyond exact safe domain offset/end stays unavailable');
  }
  console.log('PASS Pagination 2: large exact totals retain original string/BigInt path and prohibit unsafe last-page offsets.');
  await render('SalesPagination', { total: '205' });
  const jump = host.querySelector('input[aria-label="目标页码"]'), setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const typeJump = async text => { await act(async () => { setter.call(jump, text); jump.dispatchEvent(new Event('input', { bubbles: true })); }); await settle(); };
  await typeJump('3'); await act(async () => jump.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))); await settle(); assert.equal(requested.pop(), 3);
  for (const text of ['', '0', '01', '-1', '2.5', '12', '9007199254740993']) { await typeJump(text); await act(async () => jump.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))); await settle(); assert.equal(requested.length, 0); }
  await typeJump('2'); await act(async () => context.clear()); await click([...host.querySelectorAll('button')].find(element => element.textContent === '跳转')); assert.equal(requested.length, 0, 'Identity invalidation blocks a stale mounted callback before rerender');
  console.log('PASS Pagination 3: shared string jump validation, Enter, invalid forms, no eager callback and live scope revocation guard.');
  const simpleContext = new ReadContext({ accountId: 'TEST-SIMPLE', sessionRevision: '1', permissionRevision: '1' }); const simpleScope = simpleContext.createScope('local-detail-paging');
  const raw = async extra => { await act(async () => root.render(createElement(StrictMode, null, createElement(modules.StandardPagination, { label: 'SYN simple local pager', scope: simpleScope, page: 1, pageSize: 40, total: 83, disabled: false, hideOnSinglePage: false, showJump: false, simple: true, stepText: true, onPage: page => requested.push(page), ...extra })))); await settle(); };
  await raw({}); assert.ok(host.querySelector('.arco-pagination-simple')); assert.equal(host.querySelector('input'), null, 'Simple mode must not introduce an editable Arco jumper'); assert.equal(host.querySelector('.arco-pagination-jumper').textContent, '1/3');
  await click(host.querySelector('[aria-label="下一页"]')); assert.equal(requested.pop(), 2); assert.equal(host.querySelector('.arco-pagination-jumper').textContent, '1/3', 'Simple mode remains executed/controlled');
  await raw({ total: 0 }); assert.equal(host.querySelector('nav'), null, 'An empty local result has no fictitious1/0 pager'); await raw({ total: null }); assert.equal(host.querySelector('nav'), null, 'Simple mode cannot invent an unknown total');
  await raw({ total: '9007199254740995' }); assert.ok(host.querySelector('[data-pagination-mode="exact-bigint"]')); assert.equal(host.querySelector('.arco-pagination'), null, 'Opting into simple mode cannot convert a large exact total to Number');
  await raw({}); await act(async () => simpleContext.clear()); await click(host.querySelector('[aria-label="下一页"]')); assert.equal(requested.length, 0);
  console.log('PASS Pagination 4: explicit simple local mode has readonly page text/no new input, honest empty/unknown, controlled requests, unchanged exact BigInt fallback and live revocation.');
  await act(async () => root.unmount()); root = null;
  console.log('All 4 synthetic pagination DOM groups passed. Actual browser, server errors/late response and full visual remain separate.');
} finally { if (root) root.unmount(); dom.window.close(); await rm(temp, { recursive: true, force: true }); }
