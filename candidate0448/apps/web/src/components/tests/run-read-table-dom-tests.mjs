import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)), temporary = await mkdtemp(path.join(here, '.read-table-dom-'));
const dom = new JSDOM('<div id="root"></div><button id="outside">SYN outside</button>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLIFrameElement', 'Element', 'SVGElement', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'getComputedStyle']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window); globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
let root, cleanup;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ stdin: { resolveDir: here, contents: "export{act,createElement,StrictMode}from'react';export{createRoot}from'react-dom/client';export{StandardReadTable}from'../standard-read-table.tsx';export{UIButton}from'../standard-controls.tsx';", loader: 'tsx' }, outfile: output, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/*', 'react-dom', 'react-dom/*'], loader: { '.css': 'empty' }, banner: { js: "import{createRequire}from'node:module';const require=createRequire(import.meta.url);" }, logLevel: 'warning' });
  const { act, createElement: h, StrictMode, createRoot, StandardReadTable, UIButton } = await import(pathToFileURL(output).href); cleanup = act;
  const host = document.getElementById('root'); root = createRoot(host); const events = [];
  const data = [{ id: 'SYN-line-a', name: 'SYN repeated SKU', value: '9007199254740993' }, { id: 'SYN-line-b', name: 'SYN repeated SKU', value: '' }];
  const columns = [
    { title: 'SYN name', render: (_, row) => row.name, onCell: row => ({ onClick: () => events.push('cell:' + row.id) }) },
    { title: 'SYN exact value', render: (_, row) => ({ props: { title: row.value }, children: row.value }) },
    { title: 'SYN action', render: (_, row) => h(UIButton, { type: 'button', onClick: () => events.push('button:' + row.id) }, '查看') },
  ];
  const render = async (plain, rows = data) => { await act(async () => root.render(h(StrictMode, null, h(StandardReadTable, { label: 'SYN shared table', tableClassName: 'syn-table', rows, columns, ...(plain ? { plainCellContent: true } : {}), onRow: row => ({ onClick: () => events.push('row:' + row.id) }) })))); await act(async () => new Promise(resolve => setTimeout(resolve, 20))); };
  const rows = () => [...host.querySelectorAll('tbody tr:not(.arco-table-empty-row)')];
  await render(false); assert.ok(host.querySelector('.arco-table')); assert.equal(host.querySelectorAll('.arco-table-cell-wrap-value').length, 6, 'Default ordinary-list rendering is unchanged');
  assert.equal(host.querySelector('table').getAttribute('aria-label'), 'SYN shared table'); assert.ok(host.querySelector('table.syn-table')); assert.equal(host.querySelectorAll('thead th').length, 3);
  await render(true); assert.equal(host.querySelectorAll('.arco-table-cell-wrap-value').length, 0); assert.equal(host.querySelectorAll('tbody td').length, 6); assert.equal(host.querySelectorAll('tbody .arco-table-cell').length, 6, 'Arco still owns the cell layout div');
  const originalRow = rows()[0], trigger = originalRow.querySelector('button'); trigger.focus();
  await render(true, [...data].reverse()); assert.equal(rows()[1], originalRow); assert.equal(rows()[1].querySelector('button'), trigger); assert.equal(document.activeElement, trigger, 'Stable official renderer/components preserve captured action node and focus');
  assert.equal(rows()[1].cells[1].title, '9007199254740993'); assert.equal(rows()[1].cells[1].textContent, '9007199254740993'); assert.equal(rows()[0].cells[1].title, ''); assert.equal(rows()[0].cells[1].textContent, '', 'Empty string is not replaced by a placeholder');
  await act(async () => trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))); assert.deepEqual(events.splice(0), ['button:SYN-line-a', 'row:SYN-line-a']);
  await act(async () => rows()[1].cells[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))); assert.deepEqual(events.splice(0), ['cell:SYN-line-a', 'row:SYN-line-a']);
  const outside = document.getElementById('outside'); outside.focus(); await render(true); assert.equal(document.activeElement, outside);
  await act(async () => root.render(null)); trigger.dispatchEvent(new MouseEvent('click', { bubbles: true })); assert.equal(events.length, 0); assert.equal(host.childElementCount, 0);
  console.log('PASS shared read-only table: explicit plain mode uses official Arco body.cell only; default wrappers unchanged; real headers/td/layout/title, exact/empty text, line.id row/node identity, action/cell/row events, newer focus and stale unmount verified in StrictMode. No editable Table contract or browser claim.');
} finally { if (root) await cleanup(async () => root.unmount()); dom.window.close(); await rm(temporary, { recursive: true, force: true }); }
