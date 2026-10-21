import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)), temp = await mkdtemp(path.join(here, '.dom-tmp-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'innerWidth', 'innerHeight', 'pageXOffset', 'pageYOffset']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
dom.window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; dom.window.ResizeObserver = globalThis.ResizeObserver;
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: text => ({ width: text.length * 7 }) });
let root;
try {
  const output = path.join(temp, 'dom-entry.mjs');
  await build({ entryPoints: [path.join(here, 'dom-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { act, createElement, createRoot, SalesCommandForm, SalesCommandPageHost, SalesEditorSession, SalesCommandError, ReadContext, ApplicationController, detail, draft, receipt, result, summary, uuid } = await import(pathToFileURL(output).href);
  const host = document.getElementById('root'); root = createRoot(host);
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); };
  const button = label => [...host.querySelectorAll('button')].find(node => node.textContent === label);
  const click = async node => { assert.ok(node, 'Expected a clickable element'); await act(async () => { node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }); await settle(); };
  const input = async (node, value) => {
    assert.ok(node); await act(async () => { const proto = node.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); }); await settle();
  };
  function setup({ uncertain = false, preparation } = {}) {
    let current = detail(), reads = 0, listReads = 0, keys = 0; const commands = [];
    const header = current.document.header;
    const context = new ReadContext({ accountId: header.createdByAccountId, sessionRevision: '1', permissionRevision: '1' });
    const scope = context.createScope('TEST-COMMAND-SESSION'), routeScope = context.createScope('TEST-COMMAND-ROUTE');
    const reader = { readDetail: async () => { reads++; return current; }, readList: async () => { listReads++; return { page: 1, pageSize: 20, exactTotal: '1', items: [summary()] }; }, readHistory: async () => { throw new Error('Unexpected history'); }, readSettlementStatistics: async () => { throw new Error('Unexpected statistics'); } };
    const session = new SalesEditorSession({ scope, principal: { accountId: header.createdByAccountId, staffId: header.salespersonId, hallId: header.hallId, loginName: 'TEST', role: 'ADMIN', authVersion: 1 }, reader,
      client: { execute: async command => { commands.push(command); if (uncertain) throw new SalesCommandError('network', 'NETWORK_ERROR', 'uncertain'); return result(command); }, receipt: async command => receipt(command) },
      newRequestKey: () => `TEST.dom:${++keys}`, onAccessFailure: () => {}, ...(preparation ? { preparation } : {}) });
    return { session, context, scope, routeScope, reader, commands, setCurrent: next => { current = next; }, get reads() { return reads; }, get listReads() { return listReads; }, get keys() { return keys; } };
  }
  let closed = 0; const h = setup(); await h.session.openExisting(uuid(1));
  await act(async () => root.render(createElement(SalesCommandForm, { session: h.session, close: () => { closed++; } }))); await settle();
  assert.equal(host.querySelector('h1').textContent, '编辑销货单');
  assert.deepEqual([...host.querySelectorAll('.sale-doc-fields > .tc-gold-field')].slice(0, 6).map(node => node.querySelector('.sale-field-label').textContent), ['单据日期', '业务类型', '营业厅', '营业员', '客户', '出库仓']);
  assert.deepEqual([...host.querySelectorAll('.sale-lines-table th')].map(node => node.textContent), ['款号／商品名称', '颜色', '版型', '尺码', '数量', '参考零售价', '折扣', '退货单价', '金额', '操作']);
  await input(host.querySelector('input[aria-label$=" 成交单价"]'), '1.'); await click(button('保存'));
  assert.equal(h.commands.length, 0); assert.equal(h.keys, 0); assert.equal(h.session.canLeave(), false); assert.equal(h.session.getSnapshot().input.lines[0].dealPrice, '1.');
  await click(button('返回列表')); assert.ok(button('放弃修改并返回')); await click(button('取消')); assert.equal(closed, 0); assert.equal(h.session.getSnapshot().input.lines[0].dealPrice, '1.');
  await click(button('返回列表')); await click(button('放弃修改并返回')); assert.equal(closed, 1); assert.equal(h.session.getSnapshot().command.editor, null);
  console.log('PASS SALES COMMAND DOM 1: source header/columns, invalid raw input never sends old facts, Back requires explicit discard and Cancel preserves input.');

  await act(async () => h.session.openExisting(uuid(1))); await settle(); await input(host.querySelector('textarea[aria-label="备注"]'), 'TEST 保存输入'); await click(button('保存'));
  assert.equal(h.commands.length, 1); assert.equal(h.commands[0].action, 'SAVE'); assert.equal(h.commands[0].expectedVersion, 2); assert.equal(button('保存').disabled, true); assert.equal(h.keys, 1);
  assert.equal(h.commands[0].draft.settlements[0].paymentMethodId, uuid(25)); assert.equal(h.commands[0].draft.settlements[0].paymentAccountId, draft().settlements[0].paymentAccountId);
  assert.equal(h.session.getSnapshot().command.editor.detail.document.header.version, 2); assert.ok(button('读取当前单据'));
  h.setCurrent(detail('DRAFT', 3)); await click(button('读取当前单据')); await click(button('采用当前单据'));
  assert.equal(h.session.getSnapshot().command.editor.detail.document.header.version, 3); await click(button('审核')); assert.equal(h.commands.length, 1); await click(button('确认审核')); assert.equal(h.commands[1].action, 'APPROVE');
  h.setCurrent(detail('APPROVED', 4)); await click(button('读取当前单据')); await click(button('采用当前单据')); assert.equal(button('保存').disabled, true); assert.equal(button('弃审').disabled, false);
  await click(button('弃审')); await click(button('确认弃审')); assert.equal(h.commands[2].action, 'UNAPPROVE');
  h.setCurrent(detail('DRAFT', 5)); await click(button('读取当前单据')); await click(button('采用当前单据')); assert.equal(h.session.editable, true); await act(async () => h.session.dispose());
  console.log('PASS SALES COMMAND DOM 2: SAVE is separate from approval, exact CAS and explicit action confirmations, committed content stays stale until current read/adopt, approved edit requires confirmed unapprove/readback.');

  const unknown = setup({ uncertain: true }); await unknown.session.openExisting(uuid(1)); await act(async () => root.render(createElement(SalesCommandForm, { session: unknown.session, close: () => {} }))); await settle();
  await input(host.querySelector('textarea[aria-label="备注"]'), 'TEST 不确定原输入'); await click(button('保存')); const original = unknown.commands[0];
  assert.equal(button('返回列表').disabled, true); assert.equal(button('保存').disabled, true); assert.ok(button('重放原请求')); await click(button('重放原请求'));
  assert.strictEqual(unknown.commands[1], original); assert.equal(unknown.keys, 1); await click(button('核实原操作回执')); assert.equal(unknown.session.getSnapshot().command.write.phase, 'committed');
  await act(async () => unknown.context.replaceIdentity({ accountId: uuid(999), sessionRevision: '2', permissionRevision: '2' })); await settle();
  assert.equal(unknown.session.getSnapshot().input, null); assert.equal(host.querySelectorAll('input,textarea').length, 0); await act(async () => unknown.session.dispose());
  console.log('PASS SALES COMMAND DOM 3: unknown results block repeat actions/navigation, original-key replay is exact, receipt recovery and identity disposal clear safely.');

  const unknownMethod = setup(), methodDetail = detail(); unknownMethod.setCurrent({ ...methodDetail, document: { ...methodDetail.document,
    settlements: methodDetail.document.settlements.map(row => ({ ...row, paymentMethodId: null })) } });
  await unknownMethod.session.openExisting(uuid(1)); await act(async () => root.render(createElement(SalesCommandForm, { session: unknownMethod.session, close: () => {} }))); await settle();
  assert.match(host.textContent, /原付款方式编号/); assert.match(host.textContent, /TEST 保存方式/);
  assert.equal(button('保存').disabled, true); assert.equal(button('审核').disabled, true); assert.equal(host.querySelectorAll('input,textarea').length, 0);
  await click(button('保存')); await click(button('审核')); assert.equal(unknownMethod.commands.length, 0); assert.equal(unknownMethod.keys, 0);
  await act(async () => unknownMethod.session.dispose());
  console.log('PASS SALES METHOD DOM: explicit nullable original method stays readable without inferring current/name facts; unknown method never enables runtime editing or approval.');

  const page = setup(); const references = { readReferences: async () => { throw new Error('Unexpected filter candidate read'); } };
  await act(async () => root.render(createElement(SalesCommandPageHost, { scope: page.routeScope, reader: page.reader, references, session: page.session, loadDetailStyles: async () => {} }))); await settle();
  assert.equal(button('新增销货单').disabled, true); assert.equal(page.listReads, 0); await click(button('查询')); assert.equal(page.listReads, 1);
  await click(button('查看')); assert.ok(host.querySelector('.sales-command-editor')); assert.equal(host.querySelector('[data-document-list="sales"]').hidden, true);
  await input(host.querySelector('textarea[aria-label="备注"]'), 'TEST 列表过期'); await click(button('保存')); await click(button('返回列表'));
  assert.equal(host.querySelector('[data-document-list="sales"]').hidden, false); assert.match(host.textContent, /操作前的查询结果/); assert.equal(page.listReads, 1);
  await click(button('查询')); assert.equal(page.listReads, 2); assert.doesNotMatch(host.textContent, /操作前的查询结果/); await act(async () => page.session.dispose());
  console.log('PASS SALES COMMAND DOM 4: no native preparer keeps NEW disabled, detail/write only on click, retained list is explicitly stale after mutation and refresh is manual.');

  const failed = setup({ preparation: { prepareCreate: async () => draft(), prepareEdit: async () => draft() } });
  await act(async () => root.render(createElement(SalesCommandPageHost, { scope: failed.routeScope, reader: failed.reader, references, session: failed.session, loadDetailStyles: async () => { throw new Error('TEST STYLE'); } }))); await settle();
  await click(button('新增销货单')); assert.match(host.textContent, /样式未准备完成/); assert.equal(failed.commands.length, 0);
  await click(button('返回列表')); await click(button('放弃修改并返回')); assert.equal(failed.session.getSnapshot().command.editor, null); assert.equal(failed.session.canLeave(), true); await act(async () => failed.session.dispose());
  console.log('PASS SALES COMMAND DOM 5: explicit complete preparer only, failed action CSS never enables form or traps dirty new input, no guessed number or silent business write.');

  const native = detail(), principal = { accountId: native.document.header.createdByAccountId, staffId: uuid(14), hallId: native.document.header.hallId, loginName: 'TEST-APP-SALES', role: 'ADMIN', authVersion: 1 };
  let posted = null, posts = 0, appKeys = 0; const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const sheet = { load: async () => {}, dispose() {} };
  const app = new ApplicationController({ http: { origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    if (url.endsWith('/auth/login')) return json({ principal, expiresAt: '2026-10-22T00:00:00.000Z' });
    if (url.endsWith('/sales/query')) return json({ page: 1, pageSize: 20, exactTotal: '1', items: [summary()] });
    if (url.endsWith('/sales/detail/query')) return json(native);
    if (url.endsWith('/sales/commands')) { posts++; posted = JSON.parse(init.body); return json({ error: { code: 'INTERNAL_ERROR' } }, 500); }
    if (url.includes('/sales/receipts/')) return json(receipt(posted));
    throw new Error(`Unexpected synthetic endpoint ${url}`);
  } }, presentation: { renderWorkspace: () => null, renderRouteState: () => null }, routes: { sales: { stylesheet: sheet, detailStylesheet: sheet, commands: { newRequestKey: () => `TEST.app:${++appKeys}` } } } });
  assert.equal(await app.authentication.login({ loginName: 'TEST-APP-SALES', password: 'TEST-NOT-REAL-PASSWORD' }), true);
  assert.equal(await app.navigate('sales'), true);
  const renderRoute = async () => { const current = app.getSnapshot(); await act(async () => root.render(createElement(current.prepared.View, { scope: current.scope }))); await settle(); };
  await renderRoute(); await click(button('查询')); await click(button('查看')); await input(host.querySelector('textarea[aria-label="备注"]'), 'TEST APP raw');
  assert.equal(await app.navigate(null), false); assert.equal(app.getSnapshot().notice, 'cannot-leave'); await click(button('保存')); assert.equal(posts, 1); assert.equal(appKeys, 1);
  const appOriginal = JSON.stringify(posted); await act(async () => app.failRoute(app.getSnapshot().scope));
  assert.equal(await app.navigate('sales'), true); await renderRoute(); assert.ok(button('核实原操作回执')); assert.equal(button('返回列表').disabled, true);
  assert.equal(JSON.stringify(posted), appOriginal); assert.equal(posts, 1); await click(button('核实原操作回执')); assert.equal(await app.navigate(null), true);
  await act(async () => app.dispose());
  console.log('PASS SALES COMMAND DOM 6: real application opt-in branch retains session raw/unknown operation across leaf failure/remount, blocks dirty navigation and resolves only the original receipt without new keys.');
} finally {
  if (root) { const { act } = await import('react'); await act(async () => root.unmount()); }
  dom.window.close(); await rm(temp, { recursive: true, force: true });
}
