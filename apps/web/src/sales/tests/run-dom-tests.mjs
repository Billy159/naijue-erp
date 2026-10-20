import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(path.join(here, '.dom-tmp-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLDialogElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
try {
  const output = path.join(temp, 'dom-entry.mjs');
  await build({ entryPoints: [path.join(here, 'dom-entry.tsx')], outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { act, createElement, StrictMode, createRoot, SalesPageHost, ReadContext, createSalesHttpReader, summary, detail, uuid } = await import(pathToFileURL(output).href);
  const host = document.getElementById('root'); root = createRoot(host);
  const calls = []; const candidateCalls = []; let failList = false; let holdSize = false; let heldSize; let holdDetails = false; const heldDetails = [];
  const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  const reader = createSalesHttpReader({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, body, signal: init.signal });
    if (url.endsWith('/sales/query')) {
      if (failList) { failList = false; return new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } }); }
      const result = { page: body.page, pageSize: body.pageSize, exactTotal: '21', items: Array.from({ length: Math.max(0, Math.min(body.pageSize, 21 - (body.page - 1) * body.pageSize)) }, (_, i) => summary((body.page - 1) * body.pageSize + i + 1)) };
      if (holdSize) return new Promise(resolve => { heldSize = () => resolve(json(result)); });
      return json(result);
    }
    if (url.endsWith('/sales/detail/query')) {
      const n = Number(body.salesId.slice(-12));
      if (holdDetails) return new Promise(resolve => heldDetails.push({ body, signal: init.signal, finish: () => resolve(json(detail(n))) }));
      return json(detail(n));
    }
    throw new Error('Unexpected mocked endpoint');
  } });
  const references = { readReferences: async read => { candidateCalls.push(read); return { page: read.parameters.page, exactTotal: '1', items: [{ id: uuid(11), label: 'TEST 厅' }] }; } };
  const context = new ReadContext({ accountId: 'TEST-DOM', sessionRevision: '1', permissionRevision: '1' }); const scope = context.createScope('TEST-SALES-ROUTE');
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); };
  const click = async element => { assert.ok(element, 'Expected clickable element'); await act(async () => element.click()); await settle(); };
  const button = text => [...host.querySelectorAll('button')].find(element => element.textContent.trim() === text);
  const submit = async () => { await act(async () => host.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))); await settle(); };
  const changeSize = async size => { const field = host.querySelector('select[aria-label="每页销货单数"]'); await act(async () => { field.value = String(size); field.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); await settle(); };
  await act(async () => root.render(createElement(SalesPageHost, { scope, reader, references }))); await settle();
  assert.equal(calls.length, 0); assert.equal(candidateCalls.length, 0); assert.match(host.textContent, /等待查询/); assert.match(host.textContent, /尚未查询/); assert.doesNotMatch(host.textContent, /共 0 张/);
  assert.deepEqual([...host.querySelector('select[aria-label="每页销货单数"]').options].map(option => option.value), ['20', '50', '100', '200']);
  await click(button('高级筛选 ⌄')); assert.equal(calls.length, 0); assert.equal(candidateCalls.length, 0);
  console.log('PASS DOM 1: idle/advanced expansion reads nothing; actual 20/50/100/200 page sizes and approved primary/advanced filters.');
  await click(host.querySelector('button[aria-label="营业厅"]')); assert.equal(candidateCalls.length, 1); assert.equal(candidateCalls[0].parameters.kind, 'hall'); assert.equal(candidateCalls[0].parameters.pageSize, 20);
  await act(async () => host.querySelector('[role="dialog"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); assert.equal(host.querySelector('[role="dialog"]'), null); assert.equal(document.activeElement, host.querySelector('button[aria-label="营业厅"]'));
  assert.equal(calls.length, 0); await submit(); assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://synthetic.test/api/sales/query');
  assert.equal(host.querySelectorAll('.sales-list tbody tr').length, 20); assert.match(host.textContent, /共 21 张/); assert.match(host.textContent, /-9007199254740993.01/);
  console.log('PASS DOM 2: only clicked bounded reference port reads; Escape restores focus; explicit query uses real mocked HTTP and exact negative money.');
  await click(host.querySelector('button[aria-label="下一页"]')); assert.equal(calls.at(-1).body.page, 2); assert.equal(host.querySelectorAll('.sales-list tbody tr').length, 1); assert.match(host.textContent, /21–21/);
  await click(button('重置')); assert.equal(calls.length, 2);
  failList = true; await changeSize(50); assert.ok(host.querySelector('[role="alert"]')); assert.equal(host.querySelector('select[aria-label="每页销货单数"]').value, '20'); assert.match(host.textContent, /保留上次成功结果/); assert.equal(host.querySelectorAll('.sales-list tbody tr').length, 1);
  await click(button('重试')); assert.equal(calls.at(-1).body.pageSize, 50); assert.equal(host.querySelector('select[aria-label="每页销货单数"]').value, '50'); assert.equal(host.querySelectorAll('.sales-list tbody tr').length, 21);
  console.log('PASS DOM 3: server document pagination, reset without read, failed page-size keeps marked prior scope; retry applies new size only on success.');
  const region = host.querySelector('.sales-results'); region.scrollTop = 180; region.scrollLeft = 90;
  const trigger = host.querySelector('.sales-view'); trigger.focus(); const beforeDetail = calls.length; await click(trigger);
  assert.equal(calls.length, beforeDetail + 1); assert.equal(calls.at(-1).url, 'https://synthetic.test/api/sales/detail/query');
  const dialog = () => host.querySelector('.sales-detail-dialog'); assert.ok(dialog()); assert.match(dialog().textContent, /TEST 保存商品 1/); assert.match(dialog().textContent, /165\/S/); assert.match(dialog().textContent, /Y版（修身）/); assert.match(dialog().textContent, /001234567890123/); assert.match(dialog().textContent, /未记录/); assert.match(dialog().textContent, /-9007199254740993.01/);
  assert.equal(dialog().querySelectorAll('input,select,textarea').length, 0); assert.doesNotMatch([...dialog().querySelectorAll('button')].map(element => element.textContent).join(' '), /保存|编辑|作废|扫码|审核/); assert.doesNotMatch(dialog().textContent, /原销售单|账户余额|欠款|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  await click(host.querySelector('button[aria-label="关闭销货单详情"]')); assert.equal(dialog(), null); assert.equal(document.activeElement, trigger); assert.equal(region.scrollTop, 180); assert.equal(region.scrollLeft, 90); assert.equal(calls.length, beforeDetail + 1);
  console.log('PASS DOM 4: detail only on click; stored snapshots/full labels/barcode/unknown metadata/exact return economics; no mutations; close retains executed list, scroll and focus.');
  await click(host.querySelectorAll('.sales-number')[1]); assert.match(dialog().textContent, /TEST 保存商品 2/); assert.doesNotMatch(dialog().textContent, /TEST 保存商品 1/);
  await act(async () => dialog().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await settle(); assert.equal(dialog(), null);
  holdDetails = true; await click(host.querySelector('.sales-view')); assert.equal(heldDetails.length, 1); await click(button('取消读取')); assert.equal(heldDetails[0].signal.aborted, true); assert.match(dialog().textContent, /读取已取消/); await act(async () => heldDetails[0].finish()); await settle(); assert.doesNotMatch(dialog().textContent, /TEST 保存商品/);
  await click(button('重新读取')); assert.equal(heldDetails.length, 2); await click(host.querySelector('button[aria-label="关闭销货单详情"]')); assert.equal(heldDetails[1].signal.aborted, true); await act(async () => heldDetails[1].finish()); await settle(); assert.equal(dialog(), null);
  console.log('PASS DOM 5: new target is independent; Escape/cancel/close abort and discard late ignored-signal responses; cancelled facts do not reappear.');
  holdDetails = false; holdSize = true; await changeSize(100); assert.ok(button('取消本次读取')); await click(button('取消本次读取')); holdSize = false; await act(async () => heldSize()); await settle();
  assert.equal(host.querySelector('select[aria-label="每页销货单数"]').value, '50'); await submit(); assert.equal(calls.at(-1).body.pageSize, 50);
  holdDetails = true; await click(host.querySelector('.sales-view')); const pending = heldDetails.at(-1); await act(async () => context.replaceIdentity({ accountId: 'OTHER', sessionRevision: '2', permissionRevision: '2' })); await settle();
  assert.equal(pending.signal.aborted, true); assert.equal(dialog(), null); assert.equal(host.querySelectorAll('.sales-list tbody tr').length, 0); assert.match(host.textContent, /旧身份结果已清除/); await act(async () => pending.finish()); await settle(); assert.doesNotMatch(host.textContent, /TEST 保存商品/);
  console.log('PASS DOM 6: cancelling page-size retains applied size; identity/session/permission replacement clears list/detail and discards late facts.');
  await act(async () => root.unmount()); root = createRoot(host); holdDetails = false;
  const strictContext = new ReadContext({ accountId: 'TEST-STRICT', sessionRevision: '1', permissionRevision: '1' }); const strictScope = strictContext.createScope('TEST-STRICT');
  await act(async () => root.render(createElement(StrictMode, null, createElement(SalesPageHost, { scope: strictScope, reader, references })))); await settle(); await submit(); assert.equal(host.querySelectorAll('.sales-list tbody tr').length, 20);
  await click(host.querySelector('.sales-view')); assert.match(dialog().textContent, /TEST 保存商品 1/); await click(host.querySelector('button[aria-label="关闭销货单详情"]'));
  await click(host.querySelector('button[aria-label="营业厅"]')); assert.match(host.querySelector('[role="dialog"]').textContent, /TEST 厅/);
  await act(async () => strictContext.clear()); await act(async () => root.unmount()); root = null;
  console.log('PASS DOM 7: StrictMode setup/cleanup replay does not dispose the live route, detail or reference lifecycle.');
  console.log('All 7 synthetic DOM groups passed. No real browser, network, server, login, PostgreSQL, Demo pixels or performance acceptance.');
} finally { if (root) root.unmount(); dom.window.close(); await rm(temp, { recursive: true, force: true }); }
