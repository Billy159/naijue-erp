import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.category-branch-'));
const styles = await build({ entryPoints: [path.join(here, '../multi-select.css')], bundle: true, write: false, logLevel: 'warning' });
const tokens = await readFile(path.join(here, '../../demo-presentation/tokens.css'), 'utf8');
const dom = new JSDOM('<!doctype html><style></style><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
dom.window.document.querySelector('style').textContent = tokens + styles.outputFiles[0].text;
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLIFrameElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'innerWidth', 'innerHeight', 'pageXOffset', 'pageYOffset']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; dom.window.ResizeObserver = globalThis.ResizeObserver;
dom.window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: text => ({ width: text.length * 7 }) });
const nativeRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
dom.window.HTMLElement.prototype.getBoundingClientRect = function () { return this.classList.contains('demo-multi-select') ? { x: 0, y: 0, width: 640, height: 32, left: 0, top: 0, right: 640, bottom: 32, toJSON() {} } : nativeRect.call(this); };
let root;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'category-branch-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', logLevel: 'warning' });
  const { act, createElement: h, StrictMode, createRoot, CategoryBranchHarness, categories } = await import(pathToFileURL(output).href);
  const host = document.getElementById('root'); root = createRoot(host);
  const changes = [], refusals = []; let sequence = 0, current;
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); }); };
  const render = async props => { current = props; await act(async () => root.render(h(StrictMode, null, h(CategoryBranchHarness, { ...props, onChange: ids => changes.push([...ids]), onRefusal: (id, reason) => refusals.push({ id, reason }) })))); await settle(); };
  const mount = async props => { changes.length = 0; refusals.length = 0; await render({ ...props, key: ++sequence }); };
  const click = async element => { assert.ok(element); await act(async () => { element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }); await settle(); };
  const node = title => [...host.querySelectorAll('.arco-tree-node')].find(row => row.querySelector('.arco-tree-node-title-text')?.textContent === title);
  const title = name => node(name)?.querySelector('.arco-tree-node-title');
  const checked = name => node(name)?.querySelector('input[type="checkbox"]')?.checked;
  const value = () => JSON.parse(host.querySelector('[data-canonical]').textContent);
  const tags = () => [...host.querySelectorAll('.arco-tree-select-view .arco-input-tag-tag')].map(tag => tag.textContent);
  const expand = async name => { if (node(name)?.getAttribute('aria-expanded') !== 'true') await click(node(name)?.querySelector('.arco-tree-node-switcher-icon[role="button"]')); };

  await mount({ initial: ['b1'] });
  assert.equal(host.querySelectorAll('.arco-tree').length, 1); assert.ok(host.querySelector('.demo-multi-select--category-branches'));
  assert.ok(node('未载入父类 / 裙装')); assert.equal(node('absent'), undefined);
  assert.equal(node('上装').getAttribute('aria-expanded'), 'false');
  assert.equal(getComputedStyle(node('上装').querySelector('.arco-tree-node-switcher')).display, 'flex');
  assert.equal(getComputedStyle(host.querySelector('.arco-tree')).maxHeight, '320px');
  await expand('上装'); assert.ok(node('衬衫')); assert.ok(node('针织'));
  assert.equal(node('衬衫').getAttribute('aria-level'), '1');
  await click(title('上装')); assert.deepEqual(value(), ['b1', 'a']); assert.equal(changes.length, 1);
  assert.equal(checked('衬衫'), true); assert.equal(checked('针织'), true);
  assert.ok(tags().some(text => text.includes('上装'))); assert.ok(!tags().some(text => text.includes('衬衫') || text.includes('针织')));
  console.log('PASS category branch1: real current-only hierarchy/switchers/indentation and320px source list; parent selection projects known child checks while canonical tags/payload retain only explicit branch IDs.');

  await click(title('衬衫')); assert.deepEqual(value(), ['b1', 'a']); assert.deepEqual(refusals.at(-1), { id: 'a1', reason: 'branch-exclusion' }); assert.equal(changes.length, 1);
  await click(host.querySelector('p[role="status"] button')); assert.deepEqual(value(), ['a1']); assert.equal(checked('上装'), false); assert.equal(checked('衬衫'), true); assert.equal(checked('针织'), false);
  await click(title('针织')); assert.deepEqual(value(), ['a1', 'a2']); assert.equal(checked('上装'), false); assert.equal(host.querySelector('.arco-checkbox-indeterminate'), null);
  await click(title('上装')); assert.deepEqual(value(), ['a']);
  await click(title('全部分类')); assert.deepEqual(value(), []); assert.equal(checked('全部分类'), true);
  console.log('PASS category branch2: covered-child exclusion is refused without replacement; only a separate deliberate positive-only button changes it; all loaded children never fabricate parent/halfcheck; choosing parent removes only proven redundant child IDs.');

  let allTree;
  await mount({ initial: [], completeUniverse: true, onTree: menu => { allTree = menu; } });
  assert.equal(checked('全部分类'), true); assert.equal(checked('上装'), false); assert.equal(checked('下装'), false);
  await expand('上装'); assert.equal(checked('衬衫'), false); assert.equal(checked('针织'), false);
  await act(async () => allTree.props.onCheck([], { node: { props: { _key: 'a' } }, checked: false }));
  assert.deepEqual(value(), []); assert.equal(changes.length, 0); assert.deepEqual(refusals.at(-1), { id: 'a', reason: undefined });
  await click(title('上装')); assert.deepEqual(value(), ['a']); assert.equal(checked('全部分类'), false); assert.equal(checked('衬衫'), true);
  await click(title('全部分类')); assert.deepEqual(value(), []); assert.equal(checked('上装'), false); assert.equal(checked('衬衫'), false);
  await click(title('衬衫')); assert.deepEqual(value(), ['a1']); assert.equal(checked('上装'), false); assert.equal(checked('衬衫'), true); assert.equal(host.querySelector('.arco-checkbox-indeterminate'), null);
  await mount({ initial: categories.map(option => option.id), completeUniverse: true });
  assert.deepEqual(value(), categories.map(option => option.id)); assert.equal(checked('全部分类'), false); assert.ok(!tags().some(text => text.includes('全部分类')));
  console.log('PASS category branch3: only standalone ALL is checked for unrestricted scope; a positive parent/child check chooses exactly that ID, false callbacks cannot approximate ALL-minus, and every positive ID remains distinct from unrestricted scope including uncategorized rows.');

  await mount({ initial: ['b1'] }); assert.equal(node('停用分类').querySelector('input').disabled, true); await click(title('停用分类')); assert.deepEqual(value(), ['b1']); assert.equal(changes.length, 0);
  await mount({ initial: ['disabled'] }); assert.equal(node('停用分类').querySelector('input').disabled, false); await click(title('停用分类')); assert.deepEqual(value(), []);
  await mount({ initial: ['a', 'a1'], options: categories.map(option => option.id === 'a1' ? { ...option, disabled: true } : option) }); await expand('上装');
  const redundantTag = [...host.querySelectorAll('.arco-tree-select-view .arco-input-tag-tag')].find(tag => tag.querySelector('.arco-tag-content')?.textContent === '衬衫');
  await click(redundantTag?.querySelector('.arco-tag-close-btn')); assert.deepEqual(value(), ['a']); assert.equal(checked('衬衫'), true); assert.equal(refusals.length, 0);
  console.log('PASS category branch4: disabled candidates cannot be newly selected; an already-selected disabled token remains visible/removable, and last removal truthfully returns ALL.');

  const orphan = categories.find(option => option.id === 'a1');
  await mount({ initial: ['a'], options: [orphan], selectedOptions: [categories.find(option => option.id === 'a')] });
  assert.equal(node('上装'), undefined); assert.ok(node('衬衫')); assert.equal(node('衬衫').getAttribute('aria-level'), '0'); assert.equal(checked('衬衫'), true);
  await click(title('衬衫')); assert.deepEqual(refusals.at(-1), { id: 'a1', reason: 'branch-exclusion' }); assert.deepEqual(value(), ['a']);
  await click(host.querySelector('.arco-tree-select-view .arco-tag-close-btn')); assert.deepEqual(value(), []);
  console.log('PASS category branch5: absent parents are not invented or hydrated; retained native parent ID still proves child coverage, and its selected-only tag can be removed without adopting projected IDs.');

  for (const options of [[{ id: 'bad', name: 'bad', parentId: 'bad' }], [{ id: 'p', name: 'p', parentId: 'q' }, { id: 'q', name: 'q', parentId: 'p' }], [{ id: 'p', name: 'p', parentId: null }, { id: 'c', name: 'c', parentId: 'p' }, { id: 'g', name: 'g', parentId: 'c' }]]) {
    await mount({ initial: [], options, selectedOptions: [] }); assert.match(host.querySelector('[role="alert"]').textContent, /分类层级数据无效/); assert.equal(host.querySelector('.arco-tree'), null); assert.equal(changes.length, 0);
  }
  console.log('PASS category branch6: malformed self-links, known cycles and unsupported depth fail closed with a visible message rather than fabricating nodes/partial checks or emitting a filter.');

  let capturedTree;
  await mount({ initial: ['b1'], onTree: menu => { capturedTree = menu; } }); const retained = title('上装'); const staleTree = capturedTree;
  const check = tree => tree.props.onCheck([], { node: { props: { _key: 'a' } }, checked: true });
  await render({ ...current, open: false }); await click(retained);
  await act(async () => check(staleTree)); assert.equal(changes.length, 0); assert.deepEqual(value(), ['b1']);
  await render({ ...current, open: true }); await act(async () => check(staleTree)); assert.equal(changes.length, 0);
  await act(async () => check(capturedTree)); assert.deepEqual(value(), ['b1', 'a']); assert.equal(changes.length, 1);
  await act(async () => root.unmount()); root = null; await act(async () => check(capturedTree)); assert.equal(changes.length, 1);
  console.log('PASS category branch7: actual public Tree callbacks retained across close/reopen/unmount cannot mutate a later activation; only its current callback commits, without an implicit query/read.');
  console.log('All7 synthetic category-branch groups passed with actual installed TreeSelect/Tree leaves and component-only CSS. No catalog reads, network, browser layout/pixels, performance, DB or full frozen-Demo semantic equivalence is claimed.');
} finally { if (root) await (await import('react')).act(async () => root.unmount()); dom.window.close(); await rm(temporary, { recursive: true, force: true }); }
