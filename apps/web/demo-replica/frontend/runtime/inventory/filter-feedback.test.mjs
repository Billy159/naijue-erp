import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Test actual runtime components, not a reconstructed helper. Geometry is a DOM
// test double; this suite does not establish browser or frozen-Demo visual parity.
const here = path.dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(path.join(here, '.filter-feedback-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://filter-feedback.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.innerWidth = 1440; globalThis.innerHeight = 1000;
globalThis.pageXOffset = 0; globalThis.pageYOffset = 0;
window.matchMedia = media => ({ matches: false, media, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
HTMLElement.prototype.scrollTo = function () {};
HTMLElement.prototype.scrollIntoView = function () {};
HTMLElement.prototype.getBoundingClientRect = function () { return { x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 32, width: 300, height: 32, toJSON() { return this; } }; };
window.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: text => ({ width: String(text).length * 7 }) });
const output = path.join(temp, 'entry.mjs');
await build({
  stdin: { contents: "export {CandidateSelect} from './candidates.tsx'; export {SourceMulti} from '../documents/source-controls.tsx'; export {ReadContext} from '../../../../src/loading/read-scope.ts';", resolveDir: here, sourcefile: 'entry.tsx', loader: 'tsx' },
  outfile: output, bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic',
  external: ['react', 'react-dom', 'react-dom/*'],
  banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
  plugins: [{ name: 'test-only-css', setup(b) {
    b.onResolve({ filter: /\.css(?:\?inline)?$/ }, a => ({ path: a.path, namespace: 'css' }));
    b.onLoad({ filter: /.*/, namespace: 'css' }, () => ({ loader: 'js', contents: 'export default "";' }));
  } }], logLevel: 'warning',
});
const { CandidateSelect, SourceMulti, ReadContext } = await import(pathToFileURL(output).href);
const { act, createElement: h, useState } = await import('react');
const { createRoot } = await import('react-dom/client');
const host = document.getElementById('root');
let root; const contexts = [];
const settle = async (ms = 50) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
const click = async element => { assert.ok(element, 'real Arco click target exists'); await act(async () => element.click()); await settle(); };
const input = async (element, value) => { assert.ok(element); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); }); await settle(220); };
const titleNode = (shadow, text) => [...shadow.querySelectorAll('.arco-tree-node')].find(node => node.querySelector('.arco-tree-node-title')?.textContent === text);
const checked = node => !!node?.querySelector('.arco-checkbox-checked');
const noMatch = (shadow, label) => [...shadow.querySelectorAll('.inv-filter-empty')].filter(node => node.textContent === (label === '商品分类' ? '暂无数据' : '没有匹配的' + label));
const uid = n => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
afterEach(async () => { if (root) { await act(async () => root.unmount()); root = null; } for (const context of contexts.splice(0)) context.clear(); });
after(async () => { dom.window.close(); await rm(temp, { recursive: true, force: true }); });

for (const [kind, label] of [['supplier', '供应商'], ['fit', '版型'], ['warehouse', '仓库'], ['category', '商品分类']]) {
  test(`N34-I01 ${kind}: current successful zero has explicit feedback beside pinned All; pending/failure are not zero`, async () => {
    const context = new ReadContext({ accountId: uid(1), sessionRevision: '1', permissionRevision: '1' }); contexts.push(context);
    const scope = context.createScope('FILTER-FEEDBACK-' + kind), reads = [], changes = [];
    let inventoryReads = 0;
    const reader = {
      readInventory() { inventoryReads++; throw new Error('Candidate searches must not query inventory.'); },
      readCandidates(read) { return new Promise((resolve, reject) => reads.push({ ...read, resolve, reject })); },
    };
    root = createRoot(host);
    await act(async () => root.render(h(CandidateSelect, { kind, value: null, categoryIds: [], scope, reader, productReader: {}, onChange: value => changes.push(value), onAccessFailure(error) { throw error; } })));
    await settle(); assert.equal(reads.length, 0, 'closed candidate is idle');
    const shadow = host.firstElementChild.shadowRoot;
    await click(shadow.querySelector('.arco-tree-select-view'));
    assert.equal(reads.length, 1); assert.equal(reads[0].parameters.kind, kind);
    assert.deepEqual(reads[0].parameters.selectedIds, []); assert.deepEqual(reads[0].parameters.categoryIds, []);
    assert.equal(reads[0].parameters.pageSize, 20); assert.equal(reads[0].identity, scope.identity);
    assert.equal(noMatch(shadow, label).length, 0, 'unknown/loading is not an empty success');
    await act(async () => reads[0].resolve({ page: 1, exactTotal: 1, items: [{ id: uid(10), label: '现有' + label }] })); await settle();
    const allLabel = kind === 'category' ? '全部分类' : '全部' + label;
    assert.ok(checked(titleNode(shadow, allLabel)));
    assert.equal(noMatch(shadow, label).length, 0, 'positive success has no zero explanation');
    const search = shadow.querySelector('.arco-tree-select-view input');
    await input(search, 'ZZZ_NOT_FOUND_827'); assert.equal(reads.length, 2);
    assert.equal(reads[1].parameters.search, 'ZZZ_NOT_FOUND_827');
    assert.equal(noMatch(shadow, label).length, 0, 'new search does not reuse old match state');
    await act(async () => reads[1].resolve({ page: 1, exactTotal: 0, items: [] })); await settle();
    assert.match(shadow.querySelector('.inv-filter-tools').textContent, /匹配 0 项/);
    assert.deepEqual([...shadow.querySelectorAll('.arco-tree-node-title')].map(node => node.textContent), [allLabel]);
    assert.ok(checked(titleNode(shadow, allLabel)), 'All stays checked even though it is not a search result');
    assert.equal(noMatch(shadow, label).length, 1, 'original zero-result explanation is rendered outside the All menu');
    assert.equal(shadow.querySelector('[role=alert]'), null);
    await input(search, 'ZZZ_READ_FAILURE_827'); assert.equal(reads.length, 3);
    assert.equal(noMatch(shadow, label).length, 0, 'prior successful zero cannot label a newer pending intent');
    await act(async () => reads[2].reject(new Error('explicit synthetic unavailable'))); await settle();
    assert.match(shadow.querySelector('[role=alert]').textContent, /读取失败/);
    assert.equal(noMatch(shadow, label).length, 0, 'read failure is never a successful zero');
    assert.ok(checked(titleNode(shadow, allLabel)), 'failure preserves selection');
    await click(shadow.querySelector('[role=alert] button')); assert.equal(reads.length, 4);
    assert.deepEqual(reads[3].parameters, reads[2].parameters, 'retry retains the failing candidate intent');
    await act(async () => reads[3].resolve({ page: 1, exactTotal: 0, items: [] })); await settle();
    assert.equal(noMatch(shadow, label).length, 1); assert.equal(shadow.querySelector('[role=alert]'), null);
    assert.deepEqual(changes, [], 'feedback and retry never mutate the draft filter');
    assert.equal(inventoryReads, 0, 'candidate read is not an inventory query');
  });
}

test('N34-S02 status: deselecting draft keeps canonical order, shows matched3/selected2, and excludes All from matches', async () => {
  const items = [{ id: 'DRAFT', label: '未审核' }, { id: 'APPROVED', label: '已审核' }, { id: 'VOID', label: '已作废' }];
  let selected; const changes = [];
  function Harness() { const [value, setValue] = useState([]); selected = value; return h(SourceMulti, { label: '状态', selected: value, items, change(next) { changes.push(next); setValue(next); } }); }
  root = createRoot(host); await act(async () => root.render(h(Harness))); await settle();
  const shadow = host.firstElementChild.shadowRoot;
  await click(shadow.querySelector('.arco-tree-select-view'));
  assert.deepEqual([...shadow.querySelectorAll('.arco-tree-node-title')].map(node => node.textContent), ['全部状态', '未审核', '已审核', '已作废']);
  assert.ok(checked(titleNode(shadow, '全部状态')));
  await click(titleNode(shadow, '未审核').querySelector('.arco-checkbox'));
  assert.deepEqual(selected.map(row => row.id), ['APPROVED', 'VOID']); assert.equal(changes.length, 1);
  assert.deepEqual([...shadow.querySelectorAll('.arco-tree-node-title')].map(node => node.textContent), ['全部状态', '未审核', '已审核', '已作废'], 'pinned selections never reorder the catalogue');
  assert.equal(checked(titleNode(shadow, '全部状态')), false); assert.equal(checked(titleNode(shadow, '未审核')), false);
  assert.ok(checked(titleNode(shadow, '已审核'))); assert.ok(checked(titleNode(shadow, '已作废')));
  assert.equal(shadow.querySelector('.inv-filter-tools').textContent, '匹配 3 项 · 已选 2 项', '3 counts actual statuses, not the All sentinel');
  await input(shadow.querySelector('.arco-tree-select-view input'), '已审核');
  assert.equal(shadow.querySelector('.inv-filter-tools').textContent, '匹配 1 项 · 已选 2 项', 'count tracks existing local predicate, not selection');
  assert.deepEqual(selected.map(row => row.id), ['APPROVED', 'VOID']); assert.equal(changes.length, 1);
});

test('remote and explicitly incomplete SourceMulti candidates do not invent a total from loaded or pinned options', async () => {
  for (const props of [{ search() {}, loading: true }, { itemsComplete: false }]) {
    root = createRoot(host); await act(async () => root.render(h(SourceMulti, { label: '客户', selected: [{ id: uid(20), label: '原选择' }], items: [], change() { throw Error('no selection interaction'); }, ...props }))); await settle();
    const shadow = host.firstElementChild.shadowRoot; await click(shadow.querySelector('.arco-tree-select-view'));
    assert.equal(shadow.querySelector('.inv-filter-tools').textContent, '已选 1 项');
    assert.doesNotMatch(shadow.querySelector('.inv-filter-tools').textContent, /匹配/);
    await act(async () => root.unmount()); root = null;
  }
});
