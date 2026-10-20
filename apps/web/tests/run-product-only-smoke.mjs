import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import jsdom from 'jsdom';
const { JSDOM, requestInterceptor, VirtualConsole } = jsdom;

const file = new URL('../dist-preview/product-drawer-only-preview-test-only.html', import.meta.url);
const html = await readFile(file, 'utf8');
assert.ok(Buffer.byteLength(html, 'utf8') <= 262144, 'Actual HTML must fit the 256KiB limit.');
assert.doesNotMatch(html, /<script[^>]+\bsrc\s*=|<link[^>]+\bhref\s*=/i, 'Standalone must not request remote scripts/styles.');
assert.match(html, /connect-src 'none'/);
const errors = [];
const requested = [];
const childUrl = 'https://synthetic.test/product-only-frame';
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(String(error)));
virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
// Execute the actual generated HTML in an iframe, with a separate parent URL.
// The one child-document request is supplied in memory; no HTTP server or network.
const dom = new JSDOM(`<iframe title="TEST ONLY product preview" src="${childUrl}"></iframe>`, {
  url: 'https://synthetic.test/space?parent=unchanged#page',
  runScripts: 'dangerously',
  resources: { interceptors: [requestInterceptor(request => {
    requested.push(request.url);
    if (request.url === childUrl) return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
    throw new Error(`Unexpected resource request: ${request.url}`);
  })] },
  virtualConsole,
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, label) {
  const deadline = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await pause(20);
  }
}
try {
  const parentUrl = dom.window.location.href;
  const frame = dom.window.document.querySelector('iframe');
  await waitFor(() => frame.contentDocument?.querySelector('.product-only-diagnostics'), 'actual child preview shell');
  const window = frame.contentWindow;
  const document = window.document;
  const initialChildUrl = window.location.href;
  const counts = () => {
    const output = document.querySelector('.product-only-diagnostics');
    return ['base', 'specs', 'images', 'original'].map(kind => Number(output.getAttribute(`data-read-${kind}`)));
  };
  const unchangedUrls = () => {
    assert.equal(dom.window.location.href, parentUrl, 'Parent URL must stay unchanged.');
    assert.equal(window.location.href, initialChildUrl, 'Child URL must stay unchanged.');
  };
  assert.match(document.body.textContent, /TEST ONLY/);
  assert.match(document.body.textContent, /不是完整库存页面/);
  assert.equal(document.querySelectorAll('[data-product-id]').length, 3);
  assert.equal(document.querySelector('.iw-product-drawer'), null);
  assert.deepEqual(counts(), [0, 0, 0, 0]);
  await pause(250);
  assert.deepEqual(counts(), [0, 0, 0, 0], 'Idle shell must never read product facts.');
  unchangedUrls();
  console.log('PASS actual inline HTML in child iframe: TEST ONLY shell, 3 generated product actions, zero initial/idle reads, unchanged parent/child URL.');

  const firstTrigger = document.querySelector('[data-product-id="test-product-1"]');
  firstTrigger.click();
  await waitFor(() => document.querySelector('.iw-product-drawer')?.textContent.includes('TEST-SYSTEM-1'), 'first actual basics read');
  let drawer = document.querySelector('.iw-product-drawer');
  assert.ok(drawer.hasAttribute('open'));
  assert.deepEqual(counts(), [1, 0, 0, 0]);
  const tabs = [...drawer.querySelectorAll('[role=tab]')];
  assert.deepEqual(tabs.map(tab => tab.textContent), ['基础资料', '规格', '图片']);
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  tabs[1].click();
  await waitFor(() => drawer.querySelectorAll('.pd-skus tbody tr').length === 28, '28 legal actual specification rows');
  assert.deepEqual(counts(), [1, 1, 0, 0]);
  assert.match(drawer.querySelector('.pd-skus').textContent, /165\/S/);
  assert.match(drawer.querySelector('.pd-skus').textContent, /170\/M/);
  assert.equal(new Set([...drawer.querySelectorAll('[data-sku-id]')].map(row => row.dataset.skuId)).size, 28);
  tabs[2].click();
  await waitFor(() => drawer.querySelector('img[loading=lazy]'), 'actual thumbnail list');
  assert.deepEqual(counts(), [1, 1, 1, 0]);
  assert.equal(drawer.querySelector('.pd-image-preview'), null);
  await pause(250);
  assert.deepEqual(counts(), [1, 1, 1, 0], 'Listing a thumbnail must not read the original.');
  const thumbnail = drawer.querySelector('.pd-thumbnail');
  thumbnail.click();
  await waitFor(() => drawer.querySelector('.pd-image-preview img'), 'explicit full image read');
  assert.deepEqual(counts(), [1, 1, 1, 1]);
  drawer.querySelector('.pd-image-preview').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await waitFor(() => !drawer.querySelector('.pd-image-preview'), 'Escape closes image only');
  assert.ok(document.querySelector('.iw-product-drawer'), 'Image Escape must retain the product drawer.');
  assert.equal(document.activeElement, thumbnail, 'Image close returns focus to thumbnail.');
  drawer.querySelector('[aria-label="关闭商品资料"]').click();
  await waitFor(() => !document.querySelector('.iw-product-drawer'), 'drawer close');
  assert.equal(document.activeElement, firstTrigger);
  assert.deepEqual(counts(), [1, 1, 1, 1]);
  unchangedUrls();
  console.log('PASS actual drawer: basics/specifications/images are isolated reads; 28 legal SKU rows; original read only after thumbnail click; image Escape retains drawer; close restores focus; URLs unchanged.');

  document.querySelector('[data-product-id="test-product-2"]').click();
  await waitFor(() => document.querySelector('.iw-product-drawer')?.textContent.includes('TEST-SYSTEM-2'), 'second target basics');
  drawer = document.querySelector('.iw-product-drawer');
  assert.doesNotMatch(drawer.textContent, /TEST-SYSTEM-1/);
  [...drawer.querySelectorAll('[role=tab]')][2].click();
  await waitFor(() => drawer.textContent.includes('暂无图片'), 'explicit empty image state');
  assert.deepEqual(counts(), [2, 1, 2, 1]);
  assert.equal(drawer.querySelector('.pd-thumbnail'), null);
  drawer.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await waitFor(() => !document.querySelector('.iw-product-drawer'), 'drawer Escape close');

  firstTrigger.click();
  await waitFor(() => document.querySelector('.iw-product-drawer [role=tab]'), 'reopened tab controls');
  drawer = document.querySelector('.iw-product-drawer');
  await waitFor(() => counts()[0] === 3, 'reopen starts a fresh base read');
  assert.equal(drawer.querySelector('.pd-fields'), null, 'Old product facts are not reused while reading.');
  drawer.querySelector('[aria-label="关闭商品资料"]').click();
  await waitFor(() => !document.querySelector('.iw-product-drawer'), 'close during pending base read');
  await pause(300);
  assert.equal(document.querySelector('.iw-product-drawer'), null, 'Late read may not revive the closed drawer.');
  assert.deepEqual(counts(), [3, 1, 2, 1]);
  unchangedUrls();
  assert.deepEqual(requested, [childUrl], 'All runtime code/styles/data remain inline; the child HTML was loaded from memory only.');
  assert.deepEqual(errors, []);
  console.log('PASS target change/empty images/reopen/interruption: no stale facts, fresh read, close cancels pending work, no revival, no runtime errors or external resource requests.');
  console.log(JSON.stringify({ file: file.pathname, bytes: Buffer.byteLength(html, 'utf8'), sha256: createHash('sha256').update(html, 'utf8').digest('hex') }, null, 2));
  console.log('jsdom bundled-code DOM smoke only. Not native-browser, screenshot, exact pixel/layout, network-waterfall, performance, real data or Space integration acceptance.');
} finally {
  dom.window.close();
}
