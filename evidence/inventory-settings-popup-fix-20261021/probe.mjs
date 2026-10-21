import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const evidence = path.dirname(fileURLToPath(import.meta.url));
const phase = process.argv[2]; assert.ok(['before', 'after'].includes(phase));
const require = createRequire(path.join(repo, 'package.json'));
const { build } = require('esbuild'), { JSDOM } = require('jsdom');
const temporary = await mkdtemp(path.join(evidence, '.probe-'));
const dom = new JSDOM('<!doctype html><style data-inventory-inline></style><div id="root"></div><button id="outside">outside</button>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLDialogElement', 'HTMLIFrameElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
dom.window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, act;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.join(repo, 'apps/web/src/inventory/tests/inventory-query-lifecycle-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning', plugins: phase === 'before' ? [{ name: 'baseline-page-only', setup(build) { build.onLoad({ filter: /\/inventory-page\.tsx$/ }, async args => ({ contents: await readFile(path.join(evidence, 'before-inventory-page.tsx'), 'utf8'), loader: 'tsx', resolveDir: path.dirname(args.path) })); } }] : [] });
  const module = await import(pathToFileURL(output).href);
  const { createElement: h, StrictMode, createRoot, InventoryPageView, ReadContext, createSyntheticInventoryReader, createSyntheticProductReader } = module;
  ({ act } = module);
  const host = document.getElementById('root'), outside = document.getElementById('outside');
  const findings = [];
  for (const strict of [false, true]) {
    const context = new ReadContext({ accountId: 'TEST-SETTINGS-PROBE', sessionRevision: '1', permissionRevision: '1' });
    const scope = context.createScope(`TEST-SETTINGS-PROBE-${strict}`), reads = [];
    const view = h(InventoryPageView, { scope, reader: createSyntheticInventoryReader({ delayMs: 0, onRead: read => reads.push(read) }), productReader: createSyntheticProductReader({ delayMs: 0 }) });
    root = createRoot(host); await act(async () => root.render(strict ? h(StrictMode, null, view) : view));
    const trigger = [...host.querySelectorAll('button')].find(element => element.textContent.trim() === '显示设置');
    trigger.focus(); await act(async () => trigger.click());
    const focusedFirstCheckbox = document.activeElement === host.querySelector('.iw-settings input');
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => document.activeElement.dispatchEvent(event));
    const escapeClosed = !host.querySelector('.iw-settings'), escapeReturnedFocus = document.activeElement === trigger;
    if (escapeClosed) await act(async () => trigger.click());
    outside.focus(); await act(async () => { outside.dispatchEvent(new Event('pointerdown', { bubbles: true })); outside.click(); });
    const observation = { strict, focusedFirstCheckbox, escapeClosed, escapePrevented: event.defaultPrevented, escapeReturnedFocus, outsideClosed: !host.querySelector('.iw-settings'), outsideFocusPreserved: document.activeElement === outside, reads: reads.length };
    findings.push(observation); console.log(JSON.stringify(observation));
    if (phase === 'before') { assert.equal(observation.focusedFirstCheckbox, false); assert.equal(observation.escapeClosed, false); assert.equal(observation.escapePrevented, false); assert.equal(observation.outsideClosed, false); }
    else { for (const [key, value] of Object.entries(observation)) if (!['strict', 'reads'].includes(key)) assert.equal(value, true, key); }
    assert.equal(reads.length, 0);
    await act(async () => root.unmount()); root = null; context.clear();
  }
  await writeFile(path.join(evidence, `${phase}-observations.json`), JSON.stringify(findings, null, 2) + '\n');
} finally {
  if (root && act) await act(async () => root.unmount());
  dom.window.close(); await rm(temporary, { recursive: true, force: true });
}
