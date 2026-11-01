import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
// Deterministic synthetic layout fixture: JSDOM has no geometry. This drives
// the actual measured-window path; it is not browser pixel/performance evidence.
function installSyntheticInventoryGeometry(window) {
  const prototype = window.HTMLElement.prototype, rectangle = prototype.getBoundingClientRect;
  const width = Object.getOwnPropertyDescriptor(window.Element.prototype, 'clientWidth')?.get;
  const height = Object.getOwnPropertyDescriptor(window.Element.prototype, 'clientHeight')?.get;
  Object.defineProperty(prototype, 'clientWidth', { configurable: true, get() { return this.matches('.iw-results') ? 1400 : width?.call(this) ?? 0; } });
  Object.defineProperty(prototype, 'clientHeight', { configurable: true, get() { return this.matches('.iw-results') ? 600 : height?.call(this) ?? 0; } });
  prototype.getBoundingClientRect = function () {
    if (this.closest('.inventory-source-matrix')) {
      const w = this.matches('th.mx-product') ? 300 : this.matches('th.mx-color') ? 116 : this.matches('th.mx-warehouse') ? 152 : this.matches('th.ui-action-cell') ? 70 : this.matches('th') ? 76 : 0;
      const h = this.matches('tr') ? 36 : this.matches('h3') ? 24 : 0;
      if (w || h) return { x: 0, y: 0, left: 0, top: 0, right: w, bottom: h, width: w, height: h, toJSON() {} };
    }
    return rectangle.call(this);
  };
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  prototype.scrollIntoView = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
}
const html = await readFile(new URL('../dist-preview/inventory-preview-test-only.html', import.meta.url), 'utf8');
const metafile = JSON.parse(await readFile(new URL('../dist-preview/metafile.json', import.meta.url), 'utf8'));
function staticInputs(entry) {
  const visited = new Set(), inputs = new Set();
  const visit = key => {
    if (visited.has(key)) return;
    visited.add(key);
    const output = metafile.outputs[key]; assert.ok(output, `Missing output ${key}`);
    Object.keys(output.inputs).forEach(input => inputs.add(input));
    for (const dependency of output.imports ?? []) if (dependency.kind !== 'dynamic-import' && !dependency.external) visit(dependency.path);
  };
  visit(entry); return [...inputs].join('\n');
}
assert.doesNotMatch(staticInputs('dist-preview/main.js'), /inventory-page|product-drawer|product-tab-|synthetic-product-reader/);
assert.doesNotMatch(staticInputs('dist-preview/inventory-route.js'), /product-drawer\.tsx|product-tab-|synthetic-product-reader/);
assert.doesNotMatch(staticInputs('dist-preview/product-drawer.js'), /product-tab-basics|product-tab-specifications|product-tab-images|synthetic-product-reader/);
const mainCss = await readFile(new URL('../dist-preview/main.css', import.meta.url), 'utf8');
assert.doesNotMatch(mainCss, /iw-workbench|pd-tabs|\.pd-panel|\.pc-spec-stack|\.product-source-photos/, 'Shared startup controls never pull in inventory workspace or product detail/tab presentation');
for (const component of ['checkbox', 'drawer', 'breadcrumb']) assert.match(mainCss, new RegExp(`\\.arco-${component}`), `DemoFrame startup retains installed Arco ${component} styling`);
assert.match(mainCss, /\.erp-overlay-anchor\{[^}]*z-index:1050(?:[;}])/, 'Shared overlay anchor keeps its authored1050 stacking boundary');
const mainCssInputs = Object.keys(metafile.outputs['dist-preview/main.css'].inputs);
for (const required of ['@arco-design/web-react/dist/css/arco.css', 'components/standard-controls.css', 'components/standard-overlay.css', 'components/standard-breadcrumb.css']) assert.ok(mainCssInputs.some(file => file.endsWith(required)), `Exact startup CSS provenance: ${required}`);
for (const input of mainCssInputs) assert.doesNotMatch(input, /inventory\/inventory\.css|inventory\/product-drawer\.css|product-tab-|synthetic-product-reader/, 'Startup CSS does not claim lazy business/action styles');
assert.doesNotMatch(await readFile(new URL('../dist-preview/inventory-route.css', import.meta.url), 'utf8'), /pd-tabs/);
console.log('PASS split graph: startup excludes inventory/detail leaves; inventory excludes drawer/tab code; drawer excludes inactive tab code; startup/route CSS exclude detail styles.');
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error));
virtualConsole.on('error', (...args) => errors.push(args));
const dom = new JSDOM(html, { url: 'https://synthetic.test/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole, beforeParse(window) {
  installSyntheticInventoryGeometry(window);
  window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
} });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, label) {
  const deadline = Date.now() + 15000;
  while (!predicate()) { if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}: ${errors.map(String).join('; ')}`); await pause(25); }
}
try {
  const document = dom.window.document;
  await waitFor(() => document.querySelector('.preview-diagnostics'), 'preview shell');
  assert.match(document.body.textContent, /TEST ONLY/);
  assert.match(document.querySelector('.preview-diagnostics').textContent, /库存读取 0 · 候选读取 0/);
  assert.equal(document.querySelector('.iw-workbench'), null);
  document.querySelector('a[href="#inventory"]').click();
  await waitFor(() => document.querySelector('.iw-workbench'), 'explicit inventory route');
  assert.ok(document.querySelector('.iw-workbench'));
  assert.match(document.querySelector('.iw-results').textContent, /等待查询/);
  assert.match(document.querySelector('.preview-diagnostics').textContent, /库存读取 0 · 候选读取 0/);
  assert.ok(document.querySelector('style[data-demo-single-select-inline]'));
  const firstEnabledPageSize = document.querySelector('.iw-page-size-trigger');
  assert.equal(firstEnabledPageSize.disabled, false, 'The first visible trigger is ready for its first interaction');
  firstEnabledPageSize.click();
  await waitFor(() => document.querySelectorAll('.iw-page-size-host [role=option]').length === 3, 'portable inline shared page-size action');
  assert.deepEqual([...document.querySelectorAll('.iw-page-size-host [role=option]')].map(option => option.textContent), ['100款/页', '200款/页', '500款/页']);
  assert.equal(document.querySelector('link[data-demo-single-select-styles]'), null, 'Portable action must use actual inlined CSS, never an about:blank relative stylesheet');
  document.querySelector('.iw-page-size-host [role=combobox]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await waitFor(() => document.querySelector('.iw-page-size-host [role=combobox]')?.getAttribute('aria-expanded') === 'false', 'portable page-size dismissal');
  assert.match(document.querySelector('.preview-diagnostics').textContent, /库存读取 0 · 候选读取 0/);
  console.log('PASS built portable page-size: first visible enabled click opens the shared actual Arco action with exact options, dedicated inline CSS and no stylesheet/data request; Escape closes it.');
  document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => document.querySelectorAll('.mx-product-row').length === 3, 'synthetic inventory query');
  assert.equal(document.querySelectorAll('.mx-product-row').length, 3);
  assert.match(document.querySelector('.preview-diagnostics').textContent, /库存读取 1 · 候选读取 0/);
  assert.match(document.querySelector('.preview-diagnostics').textContent, /商品资料读取 0/);
  document.querySelector('.mx-view').click(); await waitFor(() => document.querySelector('.erp-product-drawer')?.textContent.includes('TEST-SYSTEM-1'), 'default product tab facts');
  const drawer = document.querySelector('.erp-product-drawer'); assert.ok(drawer); assert.match(drawer.textContent, /TEST-SYSTEM-1/);
  assert.match(document.querySelector('.preview-diagnostics').textContent, /商品资料读取 1/);
  const tabs = [...drawer.querySelectorAll('[role=tab]')]; assert.deepEqual(tabs.map(tab => tab.textContent), ['基础资料', '规格', '图片']);
  tabs[1].click(); await waitFor(() => drawer.querySelectorAll('.pc-spec-section').length === 3, 'three frozen specification sections'); assert.deepEqual([...drawer.querySelectorAll('.pc-spec-section h3')].map(node => node.textContent), ['颜色', '尺码组', '版型']); assert.equal(drawer.querySelector('table'), null);
  tabs[2].click(); await waitFor(() => drawer.querySelector('img[loading=lazy]'), 'image thumbnail list'); assert.ok(drawer.querySelector('img[loading=lazy]'));
  console.log(JSON.stringify({ phase: 'image-list-dom-committed', diagnostic: document.querySelector('.preview-diagnostics').textContent, colors: [...drawer.querySelectorAll('.pc-color-photo-name')].map(node => node.textContent), statuses: [...drawer.querySelectorAll('[role=status]')].map(node => node.textContent) }));
  // A committed thumbnail alone does not prove that the color child's
  // specifications query is ready or its callback counter has committed.
  // Wait for the actual child result, not a timing guess or parent-only DOM.
  await waitFor(() => drawer.querySelectorAll('.pc-color-photo-name').length === 2, 'image-tab current color references');
  assert.deepEqual([...drawer.querySelectorAll('.pc-color-photo-name')].map(node => node.textContent), ['测试蓝', '测试灰']);
  assert.match(document.querySelector('.preview-diagnostics').textContent, /商品资料读取 4(?:\D|$)/);
  console.log(JSON.stringify({ phase: 'image-color-result-ready', diagnostic: document.querySelector('.preview-diagnostics').textContent, colors: [...drawer.querySelectorAll('.pc-color-photo-name')].map(node => node.textContent) }));
  assert.equal(drawer.querySelector('.arco-image-preview'), null, 'List and color references do not open or prefetch an original preview');
  const expectedOriginal = drawer.querySelector('img[loading=lazy]').getAttribute('src');
  assert.match(expectedOriginal, /^data:image\/png;base64,/, 'The known synthetic thumbnail has actual bytes, never a null-src readiness shortcut');
  drawer.querySelector('.pc-arco-photo-preview').click();
  await waitFor(() => drawer.querySelector('.arco-image-preview-img')?.getAttribute('src') === expectedOriginal, 'explicit original image response is attached');
  assert.ok(drawer.querySelector('.arco-image-preview-img')); assert.match(document.querySelector('.preview-diagnostics').textContent, /商品资料读取 5(?:\D|$)/);
  drawer.querySelector('.arco-image-preview-close-btn').click(); document.querySelector('button[aria-label="关闭商品资料"]').click(); await pause(20);
  assert.equal(document.querySelector('.erp-product-drawer'), null);
  // Hidden FIT is the frozen default: -2 + 3 is a read-only, multi-SKU aggregate.
  const mergedStock = document.querySelector('[data-inventory-product="test-product-1"]').querySelectorAll('.mx-stock')[1];
  assert.equal(mergedStock.textContent, '1'); assert.equal(mergedStock.dataset.inventorySourceCount, '2'); assert.equal(mergedStock.getAttribute('role'), 'button'); assert.equal(mergedStock.getAttribute('aria-disabled'), 'false');
  assert.match(mergedStock.title, /选择要查看的版型资料/);
  assert.equal(document.querySelector('.mx-stock.mx-negative'), null);
  mergedStock.click(); await waitFor(() => document.querySelector('dialog.inventory-source-choice[open]'), 'explicit FIT source choice'); assert.equal(document.querySelector('.preview-dialog'), null, 'A multi-SKU aggregate cannot open an arbitrary source ledger'); const sourceChoice = document.querySelector('dialog.inventory-source-choice'); assert.deepEqual([...sourceChoice.querySelectorAll('button')].map(node => node.textContent), ['Y版（修身） · TEST-001', 'A版（标准） · TEST-001', '关闭']); [...sourceChoice.querySelectorAll('button')].at(-1).click(); await pause(25); assert.equal(document.querySelector('.preview-dialog'), null); assert.equal(document.querySelector('dialog.inventory-source-choice'), null);
  mergedStock.click(); await waitFor(() => document.querySelector('dialog.inventory-source-choice[open]'), 'deliberate exact FIT choice'); [...document.querySelectorAll('dialog.inventory-source-choice button')].find(node => node.textContent.startsWith('A版')).click(); await waitFor(() => document.querySelector('.preview-dialog'), 'one exact chosen-FIT callback'); assert.match(document.querySelector('.preview-dialog').textContent, /A版（标准） · 165\/S/); assert.match(document.querySelector('.preview-dialog').textContent, /仓库：测试总仓/); document.querySelector('button[aria-label=关闭提示]').click(); await pause(25);
  const settingsButton = [...document.querySelectorAll('button')].find(button => button.textContent === '显示设置');
  assert.ok(settingsButton); settingsButton.click();
  await waitFor(() => document.querySelector('.iw-settings'), 'display settings');
  const fitSetting = [...document.querySelectorAll('.iw-settings label')].find(label => label.textContent === '版型')?.querySelector('input');
  assert.ok(fitSetting); assert.equal(fitSetting.checked, false); fitSetting.click();
  await waitFor(() => document.querySelector('.mx-stock.mx-negative'), 'explicit FIT reveals original negative stock');
  const closeSettings = document.querySelector('.inventory-source-settings [data-i=pop-close]'); assert.ok(closeSettings); closeSettings.click(); await pause(25); assert.equal(document.querySelector('.iw-settings'), null, 'The source footer Close dismisses its own popup');
  const negative = document.querySelector('.mx-stock.mx-negative');
  assert.equal(negative.textContent, '-2'); assert.equal(negative.dataset.inventorySourceCount, '1'); assert.equal(negative.getAttribute('aria-disabled'), 'false');
  assert.match(document.querySelector('.preview-diagnostics').textContent, /库存读取 2 · 候选读取 0 · 商品资料读取 5/);
  negative.click();
  await waitFor(() => document.querySelector('.preview-dialog'), 'ledger unavailable notice');
  assert.match(document.querySelector('.preview-dialog').textContent, /库存流水尚未接入/);
  assert.match(document.querySelector('.preview-dialog').textContent, /TEST-001 测试上衣1 · 测试蓝 · Y版（修身） · 165\/S/);
  assert.match(document.querySelector('.preview-dialog').textContent, /仓库：测试总仓/);
  document.querySelector('button[aria-label=关闭提示]').click();
  document.querySelector('.shell-text-button').click();
  await waitFor(() => document.querySelector('.iw-workbench') === null, 'inventory close');
  assert.equal(document.querySelectorAll('.mx-stock').length, 0);
  document.querySelector('a[href="#inventory"]').click();
  await waitFor(() => document.querySelector('.iw-results'), 'fresh inventory reopen');
  assert.match(document.querySelector('.iw-results').textContent, /等待查询/);
  assert.equal(document.querySelectorAll('.mx-stock').length, 0);
  assert.deepEqual(errors, []);
  console.log('PASS built portable HTML: starts with zero reads; explicit menu opens idle route; query renders 3 synthetic products; three product tabs read lazily and full image only on click; hidden-FIT aggregates cannot dispatch arbitrary SKU actions; explicit FIT performs one bounded applied-scope refresh and reveals original negative stock and its exact cell callback says unavailable; close/reopen clears old facts; no jsdom runtime errors.');
  console.log('This is actual bundled-code DOM smoke, not a real browser, screenshot, network waterfall or pixel/performance acceptance.');
} finally { dom.window.close(); }
