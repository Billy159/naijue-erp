import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// The original baseline is retained unchanged outside this evidence directory.
const here = path.dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(path.join(here, '.repro-tmp-'));
const dom = new JSDOM('<!doctype html><div id="root"></div><button id="outside">Outside</button>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
try {
  const output = path.join(temp, 'sales-popup-entry.mjs');
  await build({ entryPoints: [path.join(here, 'sales-popup-entry.tsx')], outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', logLevel: 'warning' });
  const { act, createElement, StrictMode, createRoot, SalesPopupProbe, ReadContext } = await import(pathToFileURL(output).href);
  const host = document.getElementById('root'); root = createRoot(host);
  const context = new ReadContext({ accountId: 'TEST-SELF-CHECK', sessionRevision: '1', permissionRevision: '1' });
  const scope = context.createScope('TEST-SALES-REFERENCE-PROBE');
  const held = [];
  const reader = { readReferences: read => new Promise(resolve => held.push({ read, resolve })) };
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); };
  const click = async element => { assert.ok(element); await act(async () => element.click()); await settle(); };
  await act(async () => root.render(createElement(StrictMode, null, createElement(SalesPopupProbe, { scope, reader })))); await settle();
  assert.equal(held.length, 0);
  await click(host.querySelector('[aria-label="营业厅"]')); assert.equal(held.length, 1);
  await act(async () => document.getElementById('outside').dispatchEvent(new Event('pointerdown', { bubbles: true })));
  await click(document.getElementById('outside'));
  const afterOutside = { popupCount: host.querySelectorAll('[role="dialog"]').length, requestAborted: held[0].read.signal.aborted };
  await click(host.querySelector('[aria-label="营业员"]')); assert.equal(held.length, 2);
  const afterSecond = { popupCount: host.querySelectorAll('[role="dialog"]').length, transportStarts: held.length, firstRequestAborted: held[0].read.signal.aborted, secondRequestAborted: held[1].read.signal.aborted };
  assert.deepEqual(afterOutside, { popupCount: 0, requestAborted: true });
  assert.deepEqual(afterSecond, { popupCount: 1, transportStarts: 2, firstRequestAborted: true, secondRequestAborted: false });
  await act(async () => context.clear()); await settle();
  const afterRevocation = { popupCount: host.querySelectorAll('[role="dialog"]').length, allRequestsAborted: held.every(item => item.read.signal.aborted) };
  assert.deepEqual(afterRevocation, { popupCount: 0, allRequestsAborted: true });
  const observation = { afterOutside, afterSecond, afterRevocation };
  console.log(JSON.stringify(observation, null, 2));
  await writeFile(path.join(here, 'fixed-observations.json'), `${JSON.stringify(observation, null, 2)}\n`);
  await act(async () => root.unmount()); root = null;
} finally {
  if (root) await (await import('react')).act(async () => root.unmount());
  dom.window.close(); await rm(temp, { recursive: true, force: true });
}
