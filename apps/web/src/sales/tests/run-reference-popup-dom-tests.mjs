import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(path.join(here, '.reference-popup-tmp-'));
const dom = new JSDOM('<!doctype html><div id="root"></div><button id="outside">Outside</button>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLDialogElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const registered = new Map();
const add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
document.addEventListener = (type, listener, options) => {
  if ((type === 'pointerdown' || type === 'keydown') && options === true) registered.set(listener, type);
  return add(type, listener, options);
};
document.removeEventListener = (type, listener, options) => {
  if ((type === 'pointerdown' || type === 'keydown') && options === true) registered.delete(listener);
  return remove(type, listener, options);
};
let root;
try {
  const output = path.join(temp, 'dom-entry.mjs');
  await build({ entryPoints: [path.join(here, 'dom-entry.tsx')], outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { act, createElement, StrictMode, createRoot, SalesPageHost, ReadContext, createSalesHttpReader, createSalesFilterReferenceHttpReader, summary, detail, uuid } = await import(pathToFileURL(output).href);
  const host = document.getElementById('root'), outside = document.getElementById('outside');
  const candidates = [], lists = [], details = [];
  const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  const options = { origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.endsWith('/sales/references/query')) {
      assert.equal(candidates.filter(call => !call.done && !call.signal.aborted).length, 0, 'An old popup transport must abort before its replacement starts');
      return new Promise(resolve => {
        const call = { body, signal: init.signal, done: false, finish: label => { call.done = true; resolve(json({ page: body.page, exactTotal: '1', items: [{ id: uuid(11), label }] })); } };
        candidates.push(call);
      });
    }
    if (url.endsWith('/sales/query')) { lists.push(body); return json({ page: body.page, pageSize: body.pageSize, exactTotal: '1', items: [summary(1)] }); }
    if (url.endsWith('/sales/detail/query')) { details.push(body); return json(detail(1)); }
    throw new Error('Unexpected synthetic endpoint');
  } };
  const reader = createSalesHttpReader(options), references = createSalesFilterReferenceHttpReader(options);
  const context = new ReadContext({ accountId: 'TEST-REFERENCE-POPUP', sessionRevision: '1', permissionRevision: '1' });
  const scope = context.createScope('TEST-REFERENCE-ROUTE');
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); };
  const click = async element => { assert.ok(element); await act(async () => element.click()); await settle(); };
  const pointer = async element => { assert.ok(element); await act(async () => element.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))); await settle(); };
  const key = async (element, value) => {
    const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
    await act(async () => element.dispatchEvent(event)); await settle(); return event;
  };
  const trigger = label => host.querySelector(`button[aria-label="${label}"]`);
  const popup = () => host.querySelector('[role="dialog"]');
  const submit = async () => { await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await settle(); };
  const mount = async () => {
    root = createRoot(host);
    await act(async () => root.render(createElement(StrictMode, null, createElement(SalesPageHost, { scope, reader, references, loadDetailStyles: async () => {} })))); await settle();
    assert.equal(registered.size, 2, 'Exactly one page host owns outside and Escape listeners after StrictMode replay');
  };
  await mount(); assert.equal(candidates.length, 0); assert.equal(lists.length, 0);
  await click(trigger('营业厅')); assert.equal(candidates.length, 1); assert.equal(host.querySelectorAll('[role="dialog"]').length, 1);
  assert.deepEqual(candidates[0].body, { kind: 'hall', search: '', page: 1, pageSize: 20 });
  await pointer(host.querySelector('input[aria-label="搜索营业厅"]')); assert.equal(candidates[0].signal.aborted, false);
  await click(trigger('营业员')); assert.equal(candidates.length, 2); assert.equal(candidates[0].signal.aborted, true); assert.equal(candidates[1].signal.aborted, false);
  assert.equal(host.querySelectorAll('[role="dialog"]').length, 1); assert.equal(popup().getAttribute('aria-label'), '选择营业员');
  assert.equal(trigger('营业厅').getAttribute('aria-expanded'), 'false'); assert.equal(document.activeElement, host.querySelector('input[aria-label="搜索营业员"]'));
  await act(async () => candidates[0].finish('TEST STALE HALL')); await settle(); assert.doesNotMatch(host.textContent, /TEST STALE HALL/);
  console.log('PASS reference popup 1: StrictMode opens one bounded native transport; replacement synchronously aborts the old owner, keeps one dialog and ignores late facts.');

  outside.focus(); await pointer(outside); assert.equal(popup(), null); assert.equal(candidates[1].signal.aborted, true); assert.equal(document.activeElement, outside);
  await act(async () => candidates[1].finish('TEST STALE SALESPERSON')); await settle(); assert.equal(popup(), null); assert.doesNotMatch(host.textContent, /TEST STALE SALESPERSON/);
  await click(trigger('营业厅')); assert.equal(candidates.length, 3);
  const escaped = await key(host.querySelector('input[aria-label="搜索营业厅"]'), 'Escape');
  assert.equal(escaped.defaultPrevented, true); assert.equal(popup(), null); assert.equal(candidates[2].signal.aborted, true); assert.equal(document.activeElement, trigger('营业厅'));
  await click(trigger('营业厅')); assert.equal(candidates.length, 4); outside.focus(); await key(outside, 'Escape');
  assert.equal(popup(), null); assert.equal(candidates[3].signal.aborted, true); assert.equal(document.activeElement, outside, 'Escape must not steal focus already moved outside');
  console.log('PASS reference popup 2: outside and Escape abort/detach, reopening reads once, and focus returns only from inside the dismissed control.');

  await click(host.querySelector('.tc-filter-toggle')); await click(trigger('客户')); assert.equal(candidates.length, 5);
  const advancedToggle = host.querySelector('.tc-filter-toggle'); advancedToggle.focus(); await click(advancedToggle);
  assert.equal(candidates[4].signal.aborted, true); assert.equal(popup(), null); assert.equal(trigger('客户'), null); assert.equal(document.activeElement, advancedToggle);
  await click(trigger('营业厅')); assert.equal(candidates.length, 6); await click(trigger('关闭营业厅选择'));
  assert.equal(candidates[5].signal.aborted, true); assert.equal(document.activeElement, trigger('营业厅'));
  await click(trigger('营业厅')); assert.equal(candidates.length, 7); await act(async () => candidates[6].finish('TEST CHOSEN HALL')); await settle();
  await click([...popup().querySelectorAll('button')].find(button => button.textContent === 'TEST CHOSEN HALL'));
  assert.equal(popup(), null); assert.equal(trigger('营业厅').textContent, 'TEST CHOSEN HALL⌄'); assert.equal(lists.length, 0);
  console.log('PASS reference popup 3: advanced-filter removal and explicit close clean up without hidden focus; choosing a reference only edits the draft.');

  await submit(); assert.equal(lists.length, 1); await click(trigger('营业厅')); assert.equal(candidates.length, 8);
  await click(host.querySelector('.sales-view')); assert.equal(candidates[7].signal.aborted, true); assert.equal(popup(), null); assert.ok(host.querySelector('.sales-detail-page'));
  assert.equal(host.querySelector('[data-document-list="sales"]').hidden, true); assert.equal(document.activeElement.textContent, '返回列表');
  await act(async () => candidates[7].finish('TEST LATE DETAIL INTERRUPTION')); await settle();
  await click([...host.querySelectorAll('button')].find(button => button.textContent === '返回列表')); assert.equal(popup(), null); assert.equal(lists.length, 1); assert.equal(details.length, 1);
  await click(trigger('营业厅')); assert.equal(candidates.length, 9); await act(async () => root.unmount()); root = null;
  assert.equal(candidates[8].signal.aborted, true); assert.equal(registered.size, 0); assert.equal((await key(outside, 'Escape')).defaultPrevented, false);
  await act(async () => candidates[8].finish('TEST LATE UNMOUNT')); await settle(); assert.equal(host.textContent, '');
  console.log('PASS reference popup 4: entering detail and route unmount abort pending candidates, drop late completions, preserve the retained list and release page listeners.');

  await mount(); await click(trigger('营业员')); assert.equal(candidates.length, 10);
  await act(async () => context.replaceIdentity({ accountId: 'TEST-REFERENCE-POPUP', sessionRevision: '2', permissionRevision: '2' })); await settle();
  assert.equal(candidates[9].signal.aborted, true); assert.equal(popup(), null); assert.equal(registered.size, 0); assert.match(host.textContent, /旧身份结果已清除/);
  await act(async () => candidates[9].finish('TEST LATE REVOKED')); await settle(); assert.doesNotMatch(host.textContent, /TEST LATE REVOKED/); assert.equal(candidates.length, 10);
  assert.equal((await key(outside, 'Escape')).defaultPrevented, false);
  await act(async () => root.unmount()); root = null;
  console.log('PASS reference popup 5: same-account identity/permission revocation aborts the transport and listener ownership immediately; late completion cannot reopen or reread.');
  console.log('All 5 focused synthetic reference-popup DOM groups passed. No real browser, production data, Demo appearance or performance acceptance.');
} finally {
  if (root) await (await import('react')).act(async () => root.unmount());
  dom.window.close(); await rm(temp, { recursive: true, force: true });
}
