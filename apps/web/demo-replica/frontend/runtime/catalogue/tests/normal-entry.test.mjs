import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Actual normal ready-pages/session/client/controller integration, with finite
// in-memory HTTP responses only. No browser, server, database or global preview switch.
const here = path.dirname(fileURLToPath(import.meta.url)), temp = await mkdtemp(path.join(here, '.normal-entry-'));
const dom = new JSDOM('<!doctype html><div id="page"></div>', { url: 'https://catalogue.test/', pretendToBeVisual: true });
for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLDialogElement','HTMLButtonElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = media => ({ matches: false, media, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
const { act } = await import('react');
let pages, session, current, scope;
try {
  const output = path.join(temp, 'normal.mjs');
  await build({ stdin: { contents: "export {createReadyPageMounts} from '../../common/ready-pages.tsx';export {createReplicaSession} from '../../common/session.ts';export {createCatalogueCommandSession} from '../session.ts';", resolveDir: here, sourcefile: 'normal.tsx', loader: 'tsx' }, outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react','react-dom','react-dom/*'], jsx: 'automatic', banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" }, plugins: [{ name: 'nonvisual-source-css', setup(b) { b.onResolve({ filter: /\.css(?:\?inline)?$/ }, args => ({ path: args.path, namespace: 'css' })); b.onLoad({ filter: /.*/, namespace: 'css' }, () => ({ contents: 'export default "";', loader: 'js' })); } }], logLevel: 'warning' });
  const { createReadyPageMounts, createReplicaSession, createCatalogueCommandSession } = await import(pathToFileURL(output).href);
  const sid = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
  const calls = [], receipts = new Map(), colors = [], changes = [];
  const fits = [{ id: sid(80), code: 'A', name: 'SYNTHETIC FIT', version: 1, enabled: true }];
  let role = 'ADMIN', authVersion = 1, keys = 500, sequence = 0, disconnect = false;
  let readbackMode = 'normal', lateRead;
  const category = { id: sid(70), parentId: null, name: 'SYNTHETIC ROOT', displayOrder: 0, version: 2, code: null, productCount: null, childCount: 0 };
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const http = { origin: 'https://catalogue.test', basePath: '/api', timeoutMs: 100, fetch: async (url, init) => {
    const endpoint = new URL(url).pathname.slice(4), body = init.body ? JSON.parse(init.body) : null; calls.push({ endpoint, method: init.method, body });
    if (endpoint === '/auth/session') return json({ principal: { accountId: sid(900), staffId: sid(901), loginName: 'SYNTHETIC-ONLY', role, hallId: role === 'SALESPERSON' ? sid(902) : null, authVersion } });
    if (endpoint === '/catalogue-settings-read/categories/query') return json({ total: 1, items: [{ ...category }] });
    if (/^\/catalogue-settings-read\/(colors|fits)\/query$/.test(endpoint)) {
      const rows = endpoint.includes('/colors/') ? colors : fits;
      const filtered = rows.filter(row => (row.code + row.name).includes(body.search));
      if (body.search === '999') {
        if (readbackMode === 'network' && body.page === 2) throw new Error('synthetic read disconnected');
        if (readbackMode === 'forbidden') return json({ error: { code: 'FORBIDDEN' } }, 403);
        if ((readbackMode === 'timeout' || readbackMode === 'late') && body.page === 2) return new Promise(resolve => { lateRead = () => resolve(json({ page: body.page, pageSize: body.pageSize, total: filtered.length, items: filtered.slice((body.page - 1) * body.pageSize, body.page * body.pageSize) })); });
        let items = filtered.slice((body.page - 1) * body.pageSize, body.page * body.pageSize);
        if (readbackMode === 'duplicate' && body.page === 2) items = filtered.slice(0, body.pageSize);
        if (readbackMode === 'old-version') items = items.map(row => row.code === '999' ? { ...row, version: 1 } : row);
        if (readbackMode === 'missing') items = items.map(row => row.code === '999' ? { ...row, id: sid(850) } : row);
        return json({ page: readbackMode === 'wrong-page' && body.page === 2 ? 1 : body.page, pageSize: body.pageSize, total: filtered.length + (readbackMode === 'drift' && body.page === 2 ? 1 : 0), items });
      }
      return json({ page: body.page, pageSize: body.pageSize, total: filtered.length, items: filtered.slice((body.page - 1) * body.pageSize, body.page * body.pageSize) });
    }
    if (endpoint.startsWith('/catalogue/colors/receipts/')) {
      const receipt = receipts.get(decodeURIComponent(endpoint.split('/').at(-1))); return receipt ? json(receipt) : json({ error: { code: 'RECEIPT_NOT_FOUND' } }, 404);
    }
    if (/^\/catalogue\/(colors|fits)\/commands$/.test(endpoint)) {
      const rows = endpoint.includes('/colors/') ? colors : fits;
      if (receipts.has(body.requestKey)) return json(receipts.get(body.requestKey).result);
      const previous = body.action === 'CREATE' ? null : rows.find(row => row.id === body.id);
      if (body.action !== 'CREATE') { assert.ok(previous); assert.equal(body.expectedVersion, previous.version); }
      const targetId = previous?.id ?? sid(100 + rows.length), version = previous ? previous.version + 1 : 1;
      const result = { kind: endpoint.includes('/colors/') ? 'COLOR' : 'FIT', operationId: sid(++sequence + 1000), targetId, version };
      if (body.action === 'CREATE') rows.push({ id: targetId, ...body.values, version });
      else if (body.action === 'EDIT') Object.assign(previous, body.values, { version });
      else { assert.equal(body.action, 'DELETE'); rows.splice(rows.indexOf(previous), 1); }
      receipts.set(body.requestKey, { requestKey: body.requestKey, action: body.action, status: 'COMMITTED', completedAt: '2026-10-25T00:00:00Z', result });
      if (disconnect) { disconnect = false; throw new Error('synthetic lost command response'); } return json(result);
    }
    if (endpoint === '/catalogue/categories/commands') {
      assert.equal(body.action, 'EDIT'); assert.equal(body.expectedVersion, category.version); category.name = body.values.name; category.version++;
      return json({ kind: 'CATEGORY', operationId: sid(++sequence + 1000), targetId: category.id, version: category.version });
    }
    throw new Error('Unexpected test HTTP operation: ' + endpoint);
  } };
  session = createReplicaSession(http); await act(async () => session.auth.resolveSession());
  const host = document.getElementById('page');
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  const click = async node => { assert.ok(node); await act(async () => node.click()); await settle(); };
  const type = async (node, value) => { assert.ok(node); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); }); await settle(); };
  const commandCalls = () => calls.filter(call => call.endpoint.endsWith('/commands'));
  function factory(maintenance) {
    return createReadyPageMounts({ session, routes: { inventory: false, sales: false, transfers: false, productCategories: true, productSettings: { colors: true, fits: true, groups: true, seasons: true, initialTab: 'colors' }, ...(maintenance ? { maintenance } : {}) }, newRequestKey: () => sid(++keys), inventory: { ledgerDialog: document.createElement('dialog'), createWorkbook: () => { throw new Error('Not inventory'); } }, catalogue: { onChanged: kind => changes.push(kind) } }, () => {});
  }
  async function enter(route) {
    if (current) await act(async () => { current.dispose(); scope.dispose(); });
    scope = session.reads.createScope('normal-page-' + ++sequence); await act(async () => { current = await pages.mount(host, route, scope); }); await settle();
  }
  pages = factory(); const before = calls.length; assert.equal(calls.length, before, 'normal route factory does not prefetch');
  await enter('product-settings'); assert.equal(button('新增颜色').disabled, true); assert.equal(commandCalls().length, 0);
  await act(async () => { current.dispose(); scope.dispose(); pages.dispose(); }); current = null;
  pages = factory({ categories: true, colors: true, fits: false, categoryOrderReady: false });
  await enter('product-settings'); assert.equal(button('新增颜色').disabled, false);
  await click(button('新增颜色')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC WHITE'); await type(document.querySelector('#pc-dict-code input'), '031');
  disconnect = true; await click(button('确定')); const original = commandCalls().at(-1).body;
  assert.equal(pages.hasUnresolvedWrite(), true); assert.equal(current.canLeave(), false); assert.ok(button('查回原请求结果'));
  const writesBeforeReentry = commandCalls().length;
  await enter('product-settings'); assert.equal(commandCalls().length, writesBeforeReentry, 'page re-entry cannot resubmit a command');
  assert.equal(document.querySelector('#pc-dict-name input').value, original.values.name); assert.equal(document.querySelector('#pc-dict-code input').value, original.values.code);
  await click(button('查回原请求结果'));
  assert.equal(calls.findLast(call => call.endpoint.includes('/receipts/')).endpoint.split('/').at(-1), original.requestKey);
  assert.equal(document.querySelector('#pc-dict-form'), null); assert.equal(pages.hasUnresolvedWrite(), false); assert.equal(keys, 501); assert.deepEqual(changes, ['COLOR']);
  await click(button('编辑')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC WHITE EDITED'); await click(button('确定'));
  assert.equal(commandCalls().at(-1).body.action, 'EDIT'); assert.equal(commandCalls().at(-1).body.expectedVersion, 1); assert.equal(document.querySelector('#pc-dict-form'), null); assert.equal(pages.hasUnresolvedWrite(), false);
  await click(button('编辑')); await click(button('删除')); await click(button('确认删除'));
  assert.equal(commandCalls().at(-1).body.action, 'DELETE'); assert.equal(commandCalls().at(-1).body.expectedVersion, 2); assert.equal(colors.length, 0); assert.equal(pages.hasUnresolvedWrite(), false);
  colors.push(...Array.from({ length: 21 }, (_, i) => ({ id: sid(200 + i), code: String(i).padStart(3, '0'), name: 'SYNTHETIC MATCH 999', enabled: true, version: 1 })));
  await click(button('新增颜色')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC TARGET'); await type(document.querySelector('#pc-dict-code input'), '999');
  const writesBeforePagedSave = commandCalls().length;
  await click(button('确定'));
  assert.equal(commandCalls().length, writesBeforePagedSave + 1, 'paged verification never submits a second command');
  assert.ok(!document.querySelector('#pc-dict-form'), 'committed target on search page two must close after exact version readback');
  assert.equal(pages.hasUnresolvedWrite(), false);
  assert.ok(calls.some(call => call.endpoint === '/catalogue-settings-read/colors/query' && call.body.search === '999' && call.body.page === 2 && call.body.pageSize === 20));
  colors.unshift(...Array.from({ length: 20 }, (_, i) => ({ id: sid(300 + i), code: `0${i}`, name: 'SYNTHETIC MATCH 999', enabled: true, version: 1 })));
  await type(host.querySelector('#pc-dict-search'), 'SYNTHETIC TARGET');
  await click(button('编辑')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC TARGET EDITED');
  readbackMode = 'duplicate'; const beforeUnconfirmed = commandCalls().length;
  await click(button('确定'));
  for (const mode of ['duplicate', 'drift', 'wrong-page', 'old-version', 'missing', 'network', 'timeout']) {
    if (mode !== 'duplicate') { readbackMode = mode; await click(button('重新读取资料')); }
    if (mode === 'timeout') { await act(async () => { await new Promise(resolve => setTimeout(resolve, 130)); }); }
    assert.ok(document.querySelector('#pc-dict-form'), `${mode} must retain committed editor`);
    assert.equal(pages.hasUnresolvedWrite(), true);
    assert.equal(commandCalls().length, beforeUnconfirmed + 1, `${mode} read retry must not write`);
  }
  readbackMode = 'normal'; await click(button('重新读取资料'));
  lateRead?.(); await settle();
  assert.ok(!document.querySelector('#pc-dict-form'), 'last page exact target version confirms the original committed edit');
  assert.equal(pages.hasUnresolvedWrite(), false);
  assert.equal(commandCalls().length, beforeUnconfirmed + 1);
  assert.ok(calls.some(call => call.endpoint === '/catalogue-settings-read/colors/query' && call.body.search === '999' && call.body.page === 3));
  await click(button('编辑')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC TARGET CANCELLED READ');
  readbackMode = 'late'; await click(button('确定')); const writesBeforeAbort = commandCalls().length;
  await act(async () => { current.dispose(); scope.dispose(); }); current = null;
  lateRead(); await settle(); assert.equal(host.childElementCount, 0);
  assert.equal(pages.hasUnresolvedWrite(), true, 'page cancellation keeps the session committed owner');
  readbackMode = 'normal'; await enter('product-settings'); await settle();
  assert.equal(pages.hasUnresolvedWrite(), false); assert.equal(commandCalls().length, writesBeforeAbort);
  colors.length = 0;
  await click(button('版型')); assert.equal(button('新增版型').disabled, true); assert.equal(commandCalls().filter(call => call.endpoint.includes('/fits/')).length, 0);
  await enter('product-categories'); assert.equal(host.querySelector('[data-cat="name"]').disabled, false); await type(host.querySelector('[data-cat="name"]'), 'SYNTHETIC RENAMED'); await click(button('保存'));
  assert.equal(category.name, 'SYNTHETIC RENAMED'); assert.equal(pages.hasUnresolvedWrite(), false);
  const orderSession = createCatalogueCommandSession(session, { categories: true, categoryOrderReady: true }, () => sid(++keys), () => { throw new Error('No pending test command'); });
  assert.equal(orderSession.maintenance.CATEGORY.categoryOrderReady, true); assert.ok(orderSession.maintenance.CATEGORY.allowedActions.includes('UNDO_REORDER')); assert.equal(orderSession.maintenance.COLOR, undefined); orderSession.dispose();
  const boundedSession = createCatalogueCommandSession(session, { categories: true, colors: false, fits: true, categoryOrderReady: false }, () => sid(++keys), () => { throw new Error('No pending test command'); });
  assert.equal(boundedSession.maintenance.COLOR, undefined); assert.equal(boundedSession.maintenance.FIT.client.kind, 'FIT'); assert.equal(boundedSession.maintenance.CATEGORY.categoryOrderReady, undefined); assert.equal(boundedSession.maintenance.CATEGORY.allowedActions.includes('REORDER'), false); boundedSession.dispose();
  await enter('product-settings'); await click(button('新增颜色')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC SECOND'); await type(document.querySelector('#pc-dict-code input'), '032'); disconnect = true; await click(button('确定'));
  const abandoned = commandCalls().at(-1).body; await act(async () => session.auth.expire()); await settle();
  assert.equal(host.childElementCount, 0); const retained = pages.retainedCatalogueCommands(); assert.equal(retained.at(-1).command.requestKey, abandoned.requestKey); assert.deepEqual(JSON.parse(JSON.stringify(retained.at(-1).command)), abandoned);
  role = 'SALESPERSON'; authVersion++; await act(async () => session.auth.resolveSession());
  const writesBeforeIdentity = commandCalls().length; await enter('product-settings'); assert.equal(button('新增颜色').disabled, true); assert.equal(commandCalls().length, writesBeforeIdentity); assert.equal(document.querySelector('#pc-dict-form'), null, 'old identity cannot recover by reusing old capability');
  await act(async () => { current.dispose(); scope.dispose(); pages.dispose(); }); current = null;
  role = 'ADMIN'; authVersion++; await act(async () => session.auth.resolveSession());
  pages = factory({ colors: true, fits: true }); await enter('product-settings'); await click(button('版型'));
  fits.length = 0; fits.push(...Array.from({ length: 21 }, (_, i) => ({ id: sid(400 + i), code: String.fromCharCode(65 + i), name: 'SYNTHETIC Z MATCH', enabled: true, version: 1 })));
  await click(button('新增版型')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC Z TARGET'); await type(document.querySelector('#pc-dict-code input'), 'Z');
  const beforeFit = commandCalls().length; await click(button('确定'));
  assert.ok(!document.querySelector('#pc-dict-form')); assert.equal(commandCalls().length, beforeFit + 1);
  assert.equal(commandCalls().at(-1).body.action, 'CREATE');
  assert.ok(calls.some(call => call.endpoint === '/catalogue-settings-read/fits/query' && call.body.search === 'Z' && call.body.page === 2));
  await click(button('颜色')); await click(button('新增颜色')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC DENIED READ'); await type(document.querySelector('#pc-dict-code input'), '999');
  readbackMode = 'forbidden'; const beforeDenied = commandCalls().length; await click(button('确定'));
  assert.equal(scope.active, false); assert.equal(host.childElementCount, 0);
  assert.equal(commandCalls().length, beforeDenied + 1);
  assert.equal(receipts.get(commandCalls().at(-1).body.requestKey).status, 'COMMITTED', 'permission loss does not alter the original committed receipt');
  assert.ok(calls.every(call => !call.endpoint.startsWith('/catalogue-settings-read/') || !call.body.pageSize || call.body.pageSize === 20), 'verification uses existing bounded page size');
  console.log('PASS normal catalogue route: existing receipt/re-entry/DELETE checks; F03 COLOR second/last page and FIT second page exact ID/version; duplicate/total drift/wrong page/stale version/wrong ID/network/timeout retain committed owner, read-only retry, unmount/late result and permission-loss cancellation. Finite synthetic HTTP only; no real PG/deployment claim.');
} finally {
  await act(async () => { current?.dispose(); scope?.dispose(); pages?.dispose(); session?.dispose(); }); dom.window.close(); await rm(temp, { recursive: true, force: true });
}
