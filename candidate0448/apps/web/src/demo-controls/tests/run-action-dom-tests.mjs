import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.action-dom-'));
const dom = new JSDOM('<!doctype html><div id="root"></div><button id="outside">outside</button>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLIFrameElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
dom.window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, cleanupAct;
let controller;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'action-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', logLevel: 'warning' });
  const { act, createElement: h, StrictMode, createRoot, DemoSingleSelectAction, ExclusivePopupController } = await import(pathToFileURL(output).href);
  cleanupAct = act;
  const host = document.getElementById('root');
  root = createRoot(host);
  controller = new ExclusivePopupController();
  const scope = new AbortController();
  const ownerships = new Map();
  const open = { inventory: false, transfer: false };
  const chosen = [];
  let value = '100';
  let disabled = false;
  let shown = true;
  const options = [100, 200, 500].map(size => ({ value: String(size), label: `${size}款/页`, disabled: size === 500 }));
  const setOpen = (key, next) => {
    if (!next) {
      ownerships.get(key)?.close();
      return;
    }
    if (ownerships.get(key)?.active) return;
    const ownership = controller.open({ signal: scope.signal, onClose: () => { open[key] = false; render(); } });
    ownerships.set(key, ownership);
    open[key] = !!ownership?.active;
    render();
  };
  const render = () => root.render(h(StrictMode, null, shown && ['inventory', 'transfer'].map(key => h('section', { key, 'data-control': key }, h(DemoSingleSelectAction, {
    label: key === 'inventory' ? '每页商品款数' : '每页调拨单数量',
    presentation: 'page-size', value, options, disabled, open: open[key],
    onOpenChange: next => setOpen(key, next), onChange: (next, option) => chosen.push([key, next, option.label]),
  })))));
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  const click = async element => { assert.ok(element); await act(async () => element.click()); await settle(); };
  const section = key => host.querySelector(`[data-control="${key}"]`);
  const view = key => section(key).querySelector('.arco-select-view');
  const combobox = key => section(key).querySelector('[role=combobox]');
  await act(async () => render());
  assert.equal(host.querySelectorAll('select').length, 0);
  assert.equal(host.querySelectorAll('.arco-select').length, 2, 'Both candidates use the real installed Arco leaf');
  assert.equal(host.querySelectorAll('[role=option]').length, 0, 'Closed controls have no detached popup');
  await click(view('inventory'));
  assert.equal(combobox('inventory').getAttribute('aria-expanded'), 'true');
  assert.equal(section('inventory').querySelector('.arco-trigger').style.width, '150px');
  assert.deepEqual([...section('inventory').querySelectorAll('[role=option]')].map(option => option.textContent), ['100款/页', '200款/页', '500款/页']);
  const closingOption = section('inventory').querySelectorAll('[role=option]')[1];
  await act(async () => view('transfer').click());
  await act(async () => closingOption.click());
  assert.deepEqual(chosen, [], 'An option in the old closing popup cannot commit after ownership replacement');
  await settle();
  assert.equal(combobox('inventory').getAttribute('aria-expanded'), 'false');
  assert.equal(combobox('transfer').getAttribute('aria-expanded'), 'true');
  assert.equal(section('inventory').querySelectorAll('[role=option]').length, 0);
  assert.equal(host.querySelectorAll('.arco-select-popup').length, 1, 'Opening B removes A, not two lingering popup trees');
  assert.ok(section('transfer').querySelector('.arco-trigger').closest('.demo-single-select'));
  assert.equal(document.body.querySelectorAll(':scope > .arco-trigger').length, 0, 'No document.body portal');
  console.log('PASS actual Arco leaf: StrictMode, caller options, source 150px popup, local portal and exclusive ownership.');

  await click(section('transfer').querySelectorAll('[role=option]')[2]);
  assert.deepEqual(chosen, [], 'Disabled options cannot commit');
  await click(section('transfer').querySelectorAll('[role=option]')[1]);
  assert.deepEqual(chosen, [['transfer', '200', '200款/页']]);
  assert.equal(section('transfer').querySelector('.ui-single-tag').textContent, '100款/页', 'Callback does not invent an applied value');
  assert.equal(combobox('transfer').getAttribute('aria-expanded'), 'false');
  value = '200'; await act(async () => render());
  assert.equal(section('transfer').querySelector('.ui-single-tag').textContent, '200款/页');
  await click(view('inventory'));
  await act(async () => { assert.equal(controller.outside(ownerships.get('inventory')), false); });
  assert.equal(combobox('inventory').getAttribute('aria-expanded'), 'true');
  await act(async () => { assert.equal(controller.outside(null), true); }); await settle();
  assert.equal(combobox('inventory').getAttribute('aria-expanded'), 'false');
  await click(view('inventory'));
  await act(async () => combobox('inventory').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }))); await settle();
  assert.equal(combobox('inventory').getAttribute('aria-expanded'), 'false');
  await click(view('inventory'));
  disabled = true; await act(async () => render()); await settle();
  assert.equal(controller.active, null);
  assert.ok(section('inventory').querySelector('.arco-select-disabled'));
  assert.equal(host.querySelectorAll('[role=option]').length, 0);
  disabled = false; await act(async () => render());
  assert.equal(combobox('inventory').getAttribute('aria-expanded'), 'false', 'Busy reversal cannot reopen stale intent');
  await click(view('transfer'));
  await act(async () => scope.abort()); await settle();
  assert.equal(controller.active, null);
  assert.equal(host.querySelectorAll('[role=option]').length, 0);
  shown = false; await act(async () => render()); await settle();
  assert.equal(host.querySelector('.arco-select'), null);
  assert.equal(document.querySelector('.arco-trigger'), null);
  console.log('PASS controlled value/disabled, outside, real Select Escape, scope disposal, interrupted reopening and popup unmount. Not browser geometry/pixel acceptance.');
} finally {
  if (root) await cleanupAct(async () => { controller?.dispose(); root.unmount(); });
  dom.window.close();
  await rm(temporary, { recursive: true, force: true });
}
