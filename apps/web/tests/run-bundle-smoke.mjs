import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
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
assert.doesNotMatch(await readFile(new URL('../dist-preview/main.css', import.meta.url), 'utf8'), /iw-workbench|pd-tabs/);
assert.doesNotMatch(await readFile(new URL('../dist-preview/inventory-route.css', import.meta.url), 'utf8'), /pd-tabs/);
console.log('PASS split graph: startup excludes inventory/detail leaves; inventory excludes drawer/tab code; drawer excludes inactive tab code; startup/route CSS exclude detail styles.');
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error));
virtualConsole.on('error', (...args) => errors.push(args));
const dom = new JSDOM(html, { url: 'https://synthetic.test/', runScripts: 'dangerously', virtualConsole });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, label) {
  const deadline = Date.now() + 15000;
  while (!predicate()) { if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`); await pause(25); }
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
  document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => document.querySelectorAll('.mx-product-row').length === 3, 'synthetic inventory query');
  assert.equal(document.querySelectorAll('.mx-product-row').length, 3);
  assert.match(document.querySelector('.preview-diagnostics').textContent, /库存读取 1 · 候选读取 0/);
  assert.match(document.querySelector('.preview-diagnostics').textContent, /商品资料读取 0/);
  document.querySelector('.mx-view').click(); await waitFor(() => document.querySelector('.iw-product-drawer')?.textContent.includes('TEST-SYSTEM-1'), 'default product tab facts');
  const drawer = document.querySelector('.iw-product-drawer'); assert.ok(drawer); assert.match(drawer.textContent, /TEST-SYSTEM-1/);
  assert.match(document.querySelector('.preview-diagnostics').textContent, /商品资料读取 1/);
  const tabs = [...drawer.querySelectorAll('[role=tab]')]; assert.deepEqual(tabs.map(tab => tab.textContent), ['基础资料', '规格', '图片']);
  tabs[1].click(); await waitFor(() => drawer.querySelectorAll('.pd-spec-section').length === 3, 'three frozen specification sections'); assert.deepEqual([...drawer.querySelectorAll('.pd-spec-section h3')].map(node => node.textContent), ['颜色', '尺码组', '版型']); assert.equal(drawer.querySelector('table'), null);
  tabs[2].click(); await waitFor(() => drawer.querySelector('img[loading=lazy]'), 'image thumbnail list'); assert.ok(drawer.querySelector('img[loading=lazy]')); assert.match(document.querySelector('.preview-diagnostics').textContent, /商品资料读取 3/);
  drawer.querySelector('.pd-thumbnail').click(); await waitFor(() => drawer.querySelector('.pd-image-preview img'), 'explicit original image'); assert.ok(drawer.querySelector('.pd-image-preview img')); assert.match(document.querySelector('.preview-diagnostics').textContent, /商品资料读取 4/);
  drawer.querySelector('button[aria-label="关闭图片预览"]').click(); document.querySelector('button[aria-label="关闭商品资料"]').click(); await pause(20);
  assert.equal(document.querySelector('.iw-product-drawer'), null);
  // Hidden FIT is the frozen default: -2 + 3 is a read-only, multi-SKU aggregate.
  const mergedStock = document.querySelector('[data-inventory-product="test-product-1"]').querySelectorAll('.mx-stock')[1];
  assert.equal(mergedStock.textContent, '1'); assert.equal(mergedStock.dataset.inventorySourceCount, '2'); assert.equal(mergedStock.disabled, true);
  assert.match(mergedStock.title, /跨版型汇总.*显示版型后查看/);
  assert.equal(document.querySelector('.mx-stock.mx-negative'), null);
  mergedStock.click(); await pause(20); assert.equal(document.querySelector('.preview-dialog'), null, 'A multi-SKU aggregate cannot open an arbitrary source ledger');
  const settingsButton = [...document.querySelectorAll('button')].find(button => button.textContent === '显示设置');
  assert.ok(settingsButton); settingsButton.click();
  await waitFor(() => document.querySelector('.iw-settings'), 'display settings');
  const fitSetting = [...document.querySelectorAll('.iw-settings label')].find(label => label.textContent === '版型')?.querySelector('input');
  assert.ok(fitSetting); assert.equal(fitSetting.checked, false); fitSetting.click();
  await waitFor(() => document.querySelector('.mx-stock.mx-negative'), 'explicit FIT reveals original negative stock');
  [...document.querySelectorAll('.iw-settings button')].find(button => button.textContent === '关闭').click();
  const negative = document.querySelector('.mx-stock.mx-negative');
  assert.equal(negative.textContent, '-2'); assert.equal(negative.dataset.inventorySourceCount, '1'); assert.equal(negative.disabled, false);
  assert.match(document.querySelector('.preview-diagnostics').textContent, /库存读取 1 · 候选读取 0 · 商品资料读取 4/);
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
  console.log('PASS built portable HTML: starts with zero reads; explicit menu opens idle route; query renders 3 synthetic products; three product tabs read lazily and full image only on click; hidden-FIT aggregates cannot dispatch arbitrary SKU actions; explicit FIT reveals original negative stock without reads and its exact cell callback says unavailable; close/reopen clears old facts; no jsdom runtime errors.');
  console.log('This is actual bundled-code DOM smoke, not a real browser, screenshot, network waterfall or pixel/performance acceptance.');
} finally { dom.window.close(); }
