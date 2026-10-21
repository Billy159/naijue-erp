import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Actual ReactDOM/InventoryPageView, including StrictMode effect replay. JSDOM
// verifies event/focus/lifecycle contracts, not browser geometry or pixel parity.
const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.settings-popup-'));
const dom = new JSDOM('<!doctype html><style data-inventory-inline></style><div id="root"></div><button id="outside">outside</button>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLDialogElement', 'HTMLIFrameElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
dom.window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, act;
const listeners = new Map(['pointerdown', 'click', 'keydown'].map(type => [type, new Set()]));
const originalAdd = document.addEventListener, originalRemove = document.removeEventListener;
document.addEventListener = function (type, listener, options) {
  if (options === true || options?.capture) listeners.get(type)?.add(listener);
  return originalAdd.call(this, type, listener, options);
};
document.removeEventListener = function (type, listener, options) {
  if (options === true || options?.capture) listeners.get(type)?.delete(listener);
  return originalRemove.call(this, type, listener, options);
};
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'inventory-query-lifecycle-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const module = await import(pathToFileURL(output).href);
  const { createElement: h, StrictMode, createRoot, InventoryPageView, ReadContext, createSyntheticInventoryReader, createSyntheticProductReader } = module;
  ({ act } = module);
  const host = document.getElementById('root'), outside = document.getElementById('outside');
  const identity = revision => ({ accountId: 'TEST-SETTINGS', sessionRevision: revision, permissionRevision: revision });
  const context = new ReadContext(identity('1'));
  let scope = context.createScope('TEST-SETTINGS');
  const reads = [], productReads = [];
  const reader = createSyntheticInventoryReader({ delayMs: 0, productCount: 1, onRead: value => reads.push(value) });
  const productReader = createSyntheticProductReader({ delayMs: 0, onRead: value => productReads.push(value) });
  root = createRoot(host);
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  const render = async strict => act(async () => root.render(strict ? h(StrictMode, null, h(InventoryPageView, { scope, reader, productReader })) : h(InventoryPageView, { scope, reader, productReader })));
  const click = async element => { assert.ok(element); await act(async () => element.click()); };
  const button = text => [...host.querySelectorAll('button')].find(element => element.textContent.trim() === text);
  const popup = () => host.querySelector('.iw-settings');
  const trigger = () => button('显示设置');
  const counts = () => Object.fromEntries([...listeners].map(([type, values]) => [type, values.size]));
  const escape = async target => { const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); await act(async () => target.dispatchEvent(event)); return event; };
  const pointer = async target => act(async () => target.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true })));

  for (const strict of [false, true]) {
    await render(strict); await settle();
    const idle = counts();
    assert.ok(host.querySelector('form')); assert.equal(reads.length, 0); assert.equal(productReads.length, 0);
    trigger().focus(); await click(trigger());
    assert.equal(trigger().getAttribute('aria-expanded'), 'true');
    assert.equal(document.activeElement === popup().querySelector('input'), true, 'Opening must focus the first existing display-setting checkbox');
    assert.deepEqual([...popup().querySelectorAll('label')].map(element => element.textContent), ['商品分类', '供应商', '版型', '尺码组', '季节', '颜色小计', '商品合计', '显示尺码组说明']);
    await pointer(popup().querySelector('input')); assert.ok(popup(), 'Inside pointerdown cannot dismiss');
    const key = await escape(document.activeElement);
    assert.equal(key.defaultPrevented, true); assert.equal(!!popup(), false); assert.equal(document.activeElement === trigger(), true);
    assert.deepEqual(counts(), idle, 'Closing must release settings document listeners');
    const idleEscape = await escape(outside); assert.equal(idleEscape.defaultPrevented, false, 'No inactive popup may consume Escape');
    console.log(`PASS settings ${strict ? 'StrictMode' : 'default'}: exact existing controls, first-checkbox focus, inside hit testing, Escape default cancellation and trigger focus return; no idle listeners/reads.`);

    await click(trigger()); await click(popup().querySelector('input'));
    assert.ok(popup(), 'Changing a display checkbox must leave its popup open');
    const beforeReset = [...popup().querySelectorAll('input')].map(input => input.checked);
    await click(button('恢复默认')); assert.ok(popup());
    assert.notDeepEqual([...popup().querySelectorAll('input')].map(input => input.checked), beforeReset);
    await click(button('关闭')); assert.equal(!!popup(), false); assert.equal(document.activeElement === trigger(), true);
    await click(trigger()); await click(trigger()); assert.equal(!!popup(), false); assert.equal(document.activeElement === trigger(), true);
    const closeOnFocus = event => { if (event.target.matches('.iw-settings input')) button('关闭').click(); };
    host.addEventListener('focusin', closeOnFocus);
    await click(trigger()); host.removeEventListener('focusin', closeOnFocus);
    assert.equal(!!popup(), false, 'Closing during initial focus must not revive the popup'); assert.deepEqual(counts(), idle);
    await click(trigger()); outside.focus(); await pointer(outside);
    assert.equal(!!popup(), false); assert.equal(document.activeElement === outside, true, 'Outside dismissal cannot steal outside focus');
    await click(trigger()); outside.focus(); await click(outside);
    assert.equal(!!popup(), false); assert.equal(document.activeElement === outside, true, 'Keyboard/synthetic outside click must also dismiss without returning focus');
    assert.deepEqual(counts(), idle); assert.equal(reads.length, 0); assert.equal(productReads.length, 0);
    console.log(`PASS settings ${strict ? 'StrictMode' : 'default'}: checkbox/reset stay open; explicit close and trigger toggle return focus; outside pointer/click preserve outside focus; all actions make zero business reads.`);

    // With a genuine pending candidate, clicking settings via pointerdown uses
    // its existing outside lifecycle. This patch must not start candidate reads.
    await click(host.querySelector('.iw-product-field .iw-control')); await settle();
    const beforeSettings = reads.length;
    await pointer(trigger()); await click(trigger());
    assert.equal(!!host.querySelector('.iw-product-field [role=dialog]'), false);
    assert.ok(popup()); assert.equal(reads.length, beforeSettings);
    await pointer(host.querySelector('.iw-product-field .iw-control'));
    assert.equal(!!popup(), false); assert.deepEqual(counts(), idle);
    await act(async () => root.render(null)); await settle();
    // Candidate read above is expected once. Separate from display-only actions.
    assert.ok(reads.every(read => read.kind === 'product')); reads.length = 0;
  }

  await render(true); const idle = counts();
  await click(trigger()); await act(async () => context.replaceIdentity(identity('2')));
  assert.equal(!!popup(), false); assert.equal(!!host.querySelector('form'), false); assert.deepEqual(counts(), idle);
  outside.focus(); assert.equal((await escape(outside)).defaultPrevented, false);
  scope = context.createScope('TEST-SETTINGS-RESTORED'); await render(true);
  assert.equal(trigger().getAttribute('aria-expanded'), 'false'); assert.equal(!!popup(), false);
  await click(trigger()); await click(button('关闭')); assert.equal(document.activeElement === trigger(), true);
  await click(trigger()); await act(async () => root.render(null));
  assert.equal(scope.active, true, 'Settings unmount must not dispose the caller-owned scope');
  assert.deepEqual(counts(), idle); assert.equal((await escape(outside)).defaultPrevented, false);
  await render(true); assert.equal(!!popup(), false); await click(trigger()); assert.ok(popup());
  await click(button('关闭')); assert.equal(reads.length, 0); assert.equal(productReads.length, 0); await act(async () => context.clear());
  console.log('PASS settings identity/unmount: scope abort resets visibility/removes listeners synchronously, restored scopes never reopen stale intent, unmount preserves the parent scope, a fresh StrictMode mount still opens/closes. No inventory/product prefetch.');
} finally {
  if (root && act) await act(async () => root.unmount());
  document.addEventListener = originalAdd; document.removeEventListener = originalRemove;
  dom.window.close(); await rm(temporary, { recursive: true, force: true });
}
