// Bounded independent React/JSDOM probes. No production changes or real I/O.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.resolve(here, '../..');
const temporary = await mkdtemp(path.join(here, '.probe-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLDialogElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, act;
const observations = [];
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ absWorkingDir: rootPath, stdin: { contents: "export { act, createElement, StrictMode } from 'react'; export { createRoot } from 'react-dom/client'; export { SalesPageHost } from './apps/web/src/sales/sales-route.tsx'; export { ReadContext } from './apps/web/src/loading/read-scope.ts'; export { detail, summary, uuid } from './apps/web/src/sales/tests/fixtures.ts';", resolveDir: rootPath, sourcefile: 'independent-probe-entry.tsx', loader: 'tsx' }, outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const exports = await import(pathToFileURL(output).href);
  const { createElement: h, createRoot, SalesPageHost, ReadContext, summary, detail, uuid } = exports;
  act = exports.act;
  const host = document.getElementById('root');
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); };
  const click = async element => { assert.ok(element, 'Expected control'); await act(async () => element.click()); await settle(); };
  const button = text => [...host.querySelectorAll('button')].find(item => item.textContent.trim() === text && !item.closest('[hidden]'));
  const submit = async () => { await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await settle(); };
  const record = (name, actual, expected) => { observations.push({ name, actual, expected, passed: actual === expected }); console.log(`${actual === expected ? 'PASS' : 'FAIL'}: ${name}: actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)}`); };
  const fresh = async () => {
    if (root) await act(async () => root.unmount());
    root = createRoot(host);
    const context = new ReadContext({ accountId: 'INDEPENDENT-SYNTHETIC', sessionRevision: '1', permissionRevision: '1' });
    const scope = context.createScope('INDEPENDENT-SALES');
    const calls = [], heldLists = [], heldReferences = [], heldStyles = [];
    let holdList = false, holdReference = false, holdStyle = false;
    const reader = {
      readList: async read => { calls.push({ kind: 'list', read }); const result = { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: '2', items: [summary(1), summary(2)] }; if (holdList) return new Promise(resolve => heldLists.push({ read, finish: () => resolve({ ...result, items: [{ ...summary(1), number: 'LATE-OLD-LIST' }, summary(2)] }) })); return result; },
      readDetail: async read => { calls.push({ kind: 'detail', read }); return detail(Number(read.parameters.salesId.slice(-12))); },
    };
    const references = { readReferences: async read => { calls.push({ kind: 'reference', read }); const result = { page: 1, exactTotal: '1', items: [{ id: uuid(11), label: 'INDEPENDENT CANDIDATE' }] }; if (holdReference) return new Promise(resolve => heldReferences.push({ read, finish: () => resolve(result) })); return result; } };
    const loadDetailStyles = async () => { calls.push({ kind: 'style' }); if (holdStyle) return new Promise(resolve => heldStyles.push({ finish: resolve })); };
    const render = async configured => { await act(async () => root.render(h(SalesPageHost, { scope, reader, references, ...(configured ? { loadDetailStyles } : {}) }))); await settle(); };
    await render(true); await submit(); assert.equal(host.querySelectorAll('.sales-list tbody tr').length, 2);
    return { context, scope, calls, heldLists, heldReferences, heldStyles, render, holdList: () => { holdList = true; }, holdReference: () => { holdReference = true; }, holdStyle: () => { holdStyle = true; } };
  };

  {
    const state = await fresh(); state.holdList(); await submit(); assert.equal(state.heldLists.length, 1);
    const trigger = host.querySelector('.sales-view'); trigger.focus(); await click(trigger);
    record('Opening full-page detail aborts prior pending list refresh', state.heldLists[0].read.signal.aborted, true);
    await act(async () => state.heldLists[0].finish()); await settle();
    await click(button('返回列表'));
    record('Ignored-signal late list cannot replace retained executed rows', host.textContent.includes('LATE-OLD-LIST'), false);
    record('Back restores original trigger after list reveal', document.activeElement === trigger && !trigger.closest('[hidden]'), true);
    record('Detail and Back do not initiate hidden list refresh', state.calls.filter(item => item.kind === 'list').length, 2);
  }

  {
    const state = await fresh(); state.holdReference(); await click(host.querySelector('button[aria-label="营业厅"]'));
    assert.equal(state.heldReferences.length, 1); assert.ok(host.querySelector('.sales-reference-options'));
    await click(host.querySelector('.sales-view'));
    record('Entering full-page detail aborts a pending list-reference read', state.heldReferences[0].read.signal.aborted, true);
    record('Entering detail removes hidden-list candidate popover', host.querySelector('.sales-reference-options') === null, true);
    await act(async () => state.heldReferences[0].finish()); await settle();
    await click(button('返回列表'));
    record('Late reference cannot restore a stale popup on Back', host.querySelector('.sales-reference-options') === null, true);
  }

  for (const phase of ['pending-style', 'loaded-detail']) {
    const state = await fresh(); if (phase === 'pending-style') state.holdStyle();
    const trigger = host.querySelector('.sales-view'); trigger.focus(); await click(trigger);
    await state.render(false);
    const list = host.querySelector('[data-document-list="sales"]');
    record(`Removing optional style capability during ${phase} leaves list usable`, list.hidden, false);
    record(`Removing capability during ${phase} disables both detail activations`, [...host.querySelectorAll('.sales-number,.sales-view')].every(item => item.disabled), true);
    if (phase === 'pending-style') { const before = state.calls.filter(item => item.kind === 'detail').length; await act(async () => state.heldStyles[0].finish()); await settle(); record('Revoked pending style cannot start a detail read', state.calls.filter(item => item.kind === 'detail').length, before); }
  }

  await writeFile(path.join(here, process.env.RESULT_NAME ?? 'dom-observations.json'), JSON.stringify({ testedAt: new Date().toISOString(), observations, limits: 'Bounded actual React/JSDOM with synthetic injected readers/style promises. No browser, server, database, network or measured performance.' }, null, 2) + '\n');
  assert.equal(observations.filter(item => !item.passed).length, 0, 'Independent lifecycle observations failed');
} finally { if (root) await act(async () => root.unmount()); dom.window.close(); await rm(temporary, { recursive: true, force: true }); }
