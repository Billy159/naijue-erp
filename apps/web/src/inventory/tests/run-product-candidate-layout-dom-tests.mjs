import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../../..');
const temporary = await mkdtemp(path.join(here, '.product-filter-layout-'));
const css = async entry => {
  const result = await build({ entryPoints: [path.join(repo, entry)], bundle: true, write: false, minify: true, metafile: true, logLevel: 'warning' });
  for (const input of Object.keys(result.metafile.inputs)) assert.doesNotMatch(input, /dist\/css\/arco\.css|\/es\/style\/index\.css$/, 'No global Arco reset');
  return result.outputFiles[0].text;
};
const portable = await build({ absWorkingDir: path.join(repo, 'apps/web/preview-core-pages'), entryPoints: ['main.tsx'], outdir: path.join(temporary, 'portable'), bundle: true, platform: 'browser', target: 'es2022', format: 'iife', minify: true, write: false, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.url': '"about:blank"' }, logLevel: 'warning' });
const portableCss = portable.outputFiles.find(file => file.path.endsWith('.css'))?.text;
assert.ok(portableCss); assert.match(portableCss, /inventory-product-select/);
const coreBuilder = await readFile(path.join(repo, 'apps/web/preview-core-pages/build.mjs'), 'utf8');
assert.match(coreBuilder, /data-inventory-product-select-inline/);
const previewBuilder = await readFile(path.join(repo, 'apps/web/build-preview.mjs'), 'utf8');
assert.match(previewBuilder, /data-inventory-product-select-inline/); assert.match(previewBuilder, /readFile\(path.join\(outdir, 'chunks\/product-candidate-action.css'\)/);
const scenarios = [{ name: 'actual-portable-graph', css: portableCss }, { name: 'actual-split-inventory-action', css: await css('apps/web/src/application/styles/shell.css') + await css('apps/web/src/application/styles/inventory.css') + await css('apps/web/src/components/product-candidate-action.css') }];
const dom = new JSDOM('<!doctype html><style></style><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLIFrameElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; dom.window.ResizeObserver = globalThis.ResizeObserver;
dom.window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: text => ({ width: text.length * 7 }) });
let root;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'product-candidate-layout-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', logLevel: 'warning' });
  const { act, createElement: h, StrictMode, useState, createRoot, ProductCandidateAction, ReadContext } = await import(pathToFileURL(output).href);
  const host = document.getElementById('root'); root = createRoot(host);
  const calls = [];
  const reader = { readInventory() { throw new Error('No implicit inventory query.'); }, async readCandidates(read) { calls.push(read); return { page: 1, exactTotal: 2, items: [{ id: 'NATIVE-A', label: 'not parsed', code: 'CODE WITH SPACE', name: 'Native Name' }, { id: 'NATIVE-B', label: 'also not parsed', code: 'B', name: 'Other Name' }] }; } };
  const productReader = { async readProductBasics(read) { return { productId: read.parameters.productId, code: 'CODE WITH SPACE', name: 'Native Name', categoryLabel: 'Category', seasonLabel: 'Season', yearLabel: null, supplierLabel: null, systemCode: null, retailPrice: '12.34' }; }, async readProductSpecifications(read) { return { productId: read.parameters.productId, sizeGroup: null, colors: [{ id: 'BLUE', label: 'Blue' }], fits: [{ id: 'REGULAR', label: 'Regular' }], sizes: [], skus: [] }; }, async readProductImages(read) { return { productId: read.parameters.productId, images: [] }; }, readProductImage() { throw new Error('No original image prefetch.'); } };
  function Harness({ scope }) { const [selected, setSelected] = useState([]); const [search, setSearch] = useState('026'); return h('section', { className: 'demo-ui' }, h('div', { className: 'iw-workbench' }, h('form', { className: 'iw-query' }, h('div', { className: 'iw-query-row' }, h('div', { className: 'iw-field iw-product-field inventory-product-control' }, h('label', null, '商品'), h(ProductCandidateAction, { scope, activationScope: scope, reader, productReader, kind: 'product', label: '商品', selected, categoryIds: [], onChange: setSelected, search, onSearch: setSearch, onOpen() {}, open: true, focusOnMount: false })))))); }
  for (const scenario of scenarios) {
    document.querySelector('style').textContent = scenario.css;
    const context = new ReadContext({ accountId: 'TEST-LAYOUT', sessionRevision: '1', permissionRevision: '1' }); const scope = context.createScope(`LAYOUT-${scenario.name}`);
    await act(async () => root.render(h(StrictMode, null, h(Harness, { key: scenario.name, scope }))));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 260)); });
    const grid = host.querySelector('.inv-menu-grid'), heading = host.querySelector('.inv-result-heading'), code = host.querySelector('.inv-option-code'), name = host.querySelector('.inv-option-name');
    assert.ok(grid && heading && code && name); assert.equal(code.textContent, 'CODE WITH SPACE'); assert.equal(name.textContent, 'Native Name');
    assert.equal(host.querySelectorAll('.arco-select-view input').length, 1); assert.equal(host.querySelectorAll('.inv-menu-list input:not([type=checkbox])').length, 0); assert.equal(host.querySelectorAll('.iw-pop-head, .iw-popover footer').length, 0);
    assert.equal(getComputedStyle(grid).display, 'grid'); assert.equal(getComputedStyle(grid).gap, '8px');
    assert.equal(getComputedStyle(heading).gridTemplateColumns, '170px minmax(0,1fr)'); assert.equal(getComputedStyle(code).width, '170px');
    assert.equal(getComputedStyle(host.querySelector('.arco-select-checkbox')).display, 'none');
    assert.equal(getComputedStyle(host.querySelector('.arco-select-view')).minHeight, '32px'); assert.equal(getComputedStyle(host.querySelector('.arco-select-view')).maxHeight, '32px');
    assert.equal(getComputedStyle(host.querySelector('.arco-select-view input')).fontSize, '13px');
    const preview = host.querySelector('.inv-preview'); assert.ok(preview); assert.match(preview.textContent, /商品资料.*该商品尚未提供图片.*12.34/); assert.equal(getComputedStyle(preview).padding, '8px 10px');
    assert.equal(getComputedStyle(host.querySelector('.inv-preview-info')).gridTemplateColumns, 'repeat(2,minmax(0,1fr))');
    console.log(JSON.stringify({ scenario: scenario.name, cssSha256: createHash('sha256').update(scenario.css).digest('hex'), inputCount: 1, code: code.textContent, headingColumns: getComputedStyle(heading).gridTemplateColumns, previewColumns: getComputedStyle(host.querySelector('.inv-preview-info')).gridTemplateColumns }));
    await act(async () => host.querySelector('[data-product-id="NATIVE-A"]').click());
    assert.match(host.querySelector('.inv-tag').textContent, /CODE WITH SPACE/); assert.match(host.querySelector('.inv-history-menu').textContent, /最近搜索.*清空.*CODE WITH SPACE/);
    assert.equal(getComputedStyle(host.querySelector('.inv-tag')).height, '23px');
    await act(async () => root.render(null)); context.clear();
    console.log(`PASS source product Select DOM/CSS and history tags: ${scenario.name}`);
  }
  assert.equal(calls.length, 2, 'One bounded candidate read per actual open scenario; no full inventory query or all-catalog pass');
  console.log('PASS source-derived product finder DOM/CSS in actual portable and split stylesheet graphs. JSDOM computed declarations are not real-browser geometry, screenshots or pixel-parity acceptance.');
} finally { if (root) await (await import('react')).act(async () => root.unmount()); dom.window.close(); await rm(temporary, { recursive: true, force: true }); }
