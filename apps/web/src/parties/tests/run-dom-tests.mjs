import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)); const temp = await mkdtemp(path.join(here, '.dom-tmp-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLIFrameElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLDialogElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
dom.window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
 let root;
try {
  const output = path.join(temp, 'dom-entry.mjs');
  await build({ entryPoints: [path.join(here, 'dom-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { act, createElement, StrictMode, createRoot, CustomerPageHost, SupplierPageHost, PartyPagination, PartyCandidateSelector, createPartyWorkspace, createPartyHttpClient, ReadContext } = await import(pathToFileURL(output).href);
  const host = document.getElementById('root'); root = createRoot(host); const calls = []; let keyCount = 0; let mode = 'normal'; const receipts = new Map(); const held = [];
  const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const rows = { customers: Array.from({ length: 21 }, (_, n) => ({ id: uuid(n + 1), code: n === 0 ? ' 旧编码-001 ' : `旧客户-${n + 1}`, name: `TEST 客户 ${n + 1}`, enabled: true, version: 7, createdAt: null, updatedAt: null })), suppliers: [{ id: uuid(1), code: ' 供应商旧码 ', name: 'TEST 同名供应商', enabled: true, version: 4, createdAt: null, updatedAt: null }] };
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  const error = (code, status) => json({ error: { code, message: 'private detail never shown' } }, status);
  const client = createPartyHttpClient({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    const u = new URL(url); const [, , family, leaf, key] = u.pathname.split('/'); const source = rows[family]; assert.ok(source, url); const command = init.body ? JSON.parse(init.body) : null;
    const call = { family, leaf, key, url, command, signal: init.signal, search: u.searchParams }; calls.push(call);
    if (leaf === 'commands') {
      if (receipts.has(command.requestKey)) return json(receipts.get(command.requestKey).result);
      if (mode === 'dependency') { mode = 'normal'; return error('CUSTOMER_DEFAULT_IN_USE', 409); }
      if (mode === 'conflict') { mode = 'normal'; source[0] = { ...source[0], name: 'TEST 他人改名', version: source[0].version + 2 }; return error('VERSION_CONFLICT', 409); }
      const prior = source.find(row => row.id === command.id); const kind = family === 'customers' ? 'CUSTOMER' : 'SUPPLIER';
      const next = command.action === 'CREATE' ? { id: uuid(100 + source.length), code: family === 'customers' ? 'KH000001' : 'GYS000001', name: command.name, enabled: true, version: 1, createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' }
        : { ...prior, name: command.action === 'EDIT' ? command.name : prior.name, enabled: command.action === 'EDIT' ? command.enabled : command.action === 'DISABLE' ? false : command.action === 'RESTORE' ? true : prior.enabled, version: prior.version + 1 };
      if (command.action === 'CREATE') source.push(next); else source[source.indexOf(prior)] = next;
      const result = { operationId: uuid(999), kind, partyId: next.id, version: next.version, code: next.code, enabled: next.enabled };
      receipts.set(command.requestKey, { requestKey: command.requestKey, action: command.action, status: 'COMMITTED', completedAt: '2026-10-20T12:00:00Z', result });
      if (mode === 'lost-response') { mode = 'normal'; throw new Error('SYNTHETIC network loss after commit'); }
      if (mode === 'hold-write') return new Promise(resolve => held.push({ ...call, finish: () => resolve(json(result)) }));
      return json(result);
    }
    if (leaf === 'receipts') return mode === 'absent-receipt' ? error('RECEIPT_NOT_FOUND', 404) : receipts.has(decodeURIComponent(key)) ? json(receipts.get(decodeURIComponent(key))) : error('RECEIPT_NOT_FOUND', 404);
    if (leaf && leaf !== 'candidates') {
      const current = source.find(row => row.id === leaf); if (mode === 'hold-detail') return new Promise(resolve => held.push({ ...call, finish: () => resolve(json(current)) })); return current ? json(current) : error('PARTY_NOT_FOUND', 404);
    }
    const matching = source.filter(row => (leaf !== 'candidates' || row.enabled) && (u.searchParams.get('enabled') !== 'ENABLED' || row.enabled) && (u.searchParams.get('enabled') !== 'DISABLED' || !row.enabled) && `${row.name}${row.code}`.includes(u.searchParams.get('search') ?? ''));
    const page = Number(u.searchParams.get('page')); const pageSize = Number(u.searchParams.get('pageSize')); const data = { items: matching.slice((page - 1) * pageSize, page * pageSize).map(row => leaf === 'candidates' ? { id: row.id, code: row.code, name: row.name } : row), total: matching.length, page, pageSize };
    if (mode === 'hold-candidate' && leaf === 'candidates') return new Promise(resolve => held.push({ ...call, finish: () => resolve(json(data)) }));
    return json(data);
  } });
  const context = new ReadContext({ accountId: 'TEST-DOM', sessionRevision: '1', permissionRevision: '1' }); const scope = context.createScope('TEST-PARTIES');
  const workspace = createPartyWorkspace({ scope, client, newRequestKey: () => `TEST-DOM-${++keyCount}`, onAccessFailure: () => {} });
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); };
  const click = async element => { assert.ok(element, 'Expected clickable element'); await act(async () => element.click()); await settle(); };
  const button = text => Array.from(document.querySelectorAll('button')).find(element => element.textContent.trim() === text);
  const dialog = () => document.querySelector('[role="dialog"]');
  const text = async (element, value) => { assert.ok(element); await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); await settle(); };
  const submit = async form => { assert.ok(form); await act(async () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))); await settle(); };
  const render = async Component => { await act(async () => root.render(createElement(StrictMode, null, createElement(Component, { workspace })))); await settle(); };
  const lastCommand = () => calls.filter(call => call.command).at(-1).command;
  const selectOption = async (label, option) => { const select = host.querySelector(`[aria-label="${label}"]`).closest('.arco-select'); const values = ['正常', '已停用', '全部']; const current = values.indexOf(select.textContent.trim()); const target = values.indexOf(option); assert.ok(current >= 0 && target >= 0); const key = async (name, code) => { await act(async () => select.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, code: name, keyCode: code, which: code, bubbles: true }))); await settle(); }; await act(async () => select.focus()); await key('Enter', 13); assert.equal(select.getAttribute('aria-expanded'), 'true'); for (let n = 0; n < (target - current + values.length) % values.length; n++) await key('ArrowDown', 40); await key('Enter', 13); assert.match(select.textContent, new RegExp(option)); };
  const closeModal = () => click(dialog().querySelector('.arco-modal-close-icon'));

  await render(CustomerPageHost); assert.equal(calls.length, 1); assert.equal(calls[0].family, 'customers'); assert.equal(calls[0].search.get('enabled'), 'ENABLED'); assert.equal(calls[0].search.get('pageSize'), '20'); assert.equal(host.querySelectorAll('.arco-table-body tbody tr').length || host.querySelectorAll('tbody tr').length, 20);
  assert.deepEqual(Array.from(host.querySelectorAll('thead th')).map(element => element.textContent.trim()), ['名称', '编码', '状态', '操作']); assert.equal(host.querySelector('button[aria-label="操作记录（暂不可用）"]').disabled, true);
  await click(host.querySelector('[aria-label="下一页"]')); assert.equal(calls.at(-1).search.get('page'), '2');
  await text(host.querySelector('input[aria-label="搜索名称或编码"]'), 'draft filter'); const beforeDraft = calls.length; assert.equal(calls.length, beforeDraft); await click(button('重置')); assert.equal(calls.length, beforeDraft + 1); assert.equal(calls.at(-1).search.get('page'), '1'); assert.equal(calls.at(-1).search.get('enabled'), 'ENABLED');
  await render(SupplierPageHost); assert.equal(calls.at(-1).family, 'suppliers'); assert.match(host.textContent, /TEST 同名供应商/); assert.doesNotMatch(host.textContent, /TEST 客户/);
  console.log('PASS DOM 1: actual frozen Arco table/control structure, normal-status route-activation page only, reset applies defaults, independent kind lists; unsupported audit explicit.');
  const beforeUnapplied = calls.length;
  await render(CustomerPageHost); await text(host.querySelector('input[aria-label="搜索名称或编码"]'), ' 未执行客户筛选 '); await selectOption('客户状态', '已停用');
  assert.equal(calls.length, beforeUnapplied); assert.equal(workspace.get('CUSTOMER').list.getSnapshot().success.parameters.search, ''); assert.equal(workspace.get('CUSTOMER').list.getSnapshot().success.parameters.enabled, 'ENABLED');
  await render(SupplierPageHost); await text(host.querySelector('input[aria-label="搜索名称或编码"]'), ' 未执行供应商筛选 '); await selectOption('供应商状态', '全部');
  await render(CustomerPageHost); assert.equal(host.querySelector('input[aria-label="搜索名称或编码"]').value, ' 未执行客户筛选 '); assert.match(host.querySelector('[aria-label="客户状态"]').closest('.arco-select').textContent, /已停用/); assert.equal(calls.length, beforeUnapplied); assert.match(host.textContent, /TEST 客户/);
  await click(host.querySelector('[aria-label="下一页"]')); assert.equal(calls.at(-1).search.get('search'), ''); assert.equal(calls.at(-1).search.get('enabled'), 'ENABLED'); assert.equal(calls.at(-1).search.get('page'), '2'); assert.equal(host.querySelector('input[aria-label="搜索名称或编码"]').value, ' 未执行客户筛选 ');
  await render(SupplierPageHost); assert.equal(host.querySelector('input[aria-label="搜索名称或编码"]').value, ' 未执行供应商筛选 '); assert.match(host.querySelector('[aria-label="供应商状态"]').closest('.arco-select').textContent, /全部/);
  await render(CustomerPageHost); assert.equal(workspace.get('CUSTOMER').list.getSnapshot().success.parameters.page, 2); const beforeDraftReset = calls.length; await click(button('重置')); assert.equal(calls.length, beforeDraftReset + 1); assert.equal(host.querySelector('input[aria-label="搜索名称或编码"]').value, ''); assert.match(host.querySelector('[aria-label="客户状态"]').closest('.arco-select').textContent, /正常/); assert.equal(calls.at(-1).search.get('page'), '1');
  await render(SupplierPageHost); await click(button('重置'));
  console.log('PASS DOM 11: per-kind unapplied search/status drafts survive actual route reentry without reads; results/paging stay tied to the applied filter and Reset clears/applies only its kind.');
  const createBefore = calls.length; await click(button('新增供应商')); assert.equal(calls.length, createBefore); assert.equal(dialog().querySelector('[aria-label="供应商编码"]').getAttribute('aria-readonly'), 'true'); assert.equal(dialog().querySelector('[aria-label="供应商编码"]').textContent, '保存后生成'); assert.equal(keyCount, 0);
  await text(dialog().querySelector('input[aria-label="供应商名称"]'), ' 新供应商 '); await click(button('取消')); assert.ok(button('放弃本次填写')); await click(button('继续填写')); await click(button('确定'));
  assert.deepEqual(lastCommand(), { action: 'CREATE', requestKey: 'TEST-DOM-1', name: ' 新供应商 ' }); assert.equal(dialog(), null); assert.match(host.textContent, /GYS000001/); assert.equal(workspace.canLeave(), true); assert.equal(document.activeElement.textContent, '新增供应商');
  console.log('PASS DOM 2: actual520px source Modal/Fields readonly code, create reads nothing, exact name-only create, dirty-close guard and source-style close/refresh after confirmation.');
  await render(CustomerPageHost); const trigger = host.querySelector('.party-edit'); const region = host.querySelector('.party-results'); region.scrollTop = 180;
  await click(trigger); assert.equal(calls.at(-1).leaf, uuid(1)); assert.equal(dialog().querySelector('[aria-label="客户编码"]').textContent, ' 旧编码-001 '); assert.ok(dialog().querySelector('[role="switch"][aria-label="使用状态"]')); assert.doesNotMatch(dialog().textContent, /供应商标签|联系人|电话|地址/);
  await text(dialog().querySelector('input[aria-label="客户名称"]'), ' 客户新名 '); mode = 'conflict'; await click(button('确定')); assert.match(dialog().textContent, /被他人修改/); assert.equal(dialog().querySelector('input[aria-label="客户名称"]').value, ' 客户新名 ');
  const rejected = lastCommand(); await click(button('读取最新状态')); assert.match(dialog().textContent, /TEST 他人改名/); assert.equal(dialog().querySelector('input[aria-label="客户名称"]').value, ' 客户新名 '); await click(button('按最新版本重新准备')); await click(button('确定'));
  const revised = lastCommand(); assert.equal(revised.expectedVersion, rejected.expectedVersion + 2); assert.notEqual(revised.requestKey, rejected.requestKey); assert.equal(revised.name, rejected.name); assert.equal(revised.enabled, true); assert.equal('code' in revised, false); assert.equal(dialog(), null); assert.equal(document.activeElement.textContent, '编辑'); assert.equal(region.scrollTop, 180);
  console.log('PASS DOM 3: fresh-target edit and readonly original code, native CAS conflict preserves name+state and requires explicit reconciliation.');
  await click(host.querySelector('.party-edit')); await text(dialog().querySelector('input[aria-label="客户名称"]'), ' 不确定名称 '); mode = 'lost-response'; await click(button('确定'));
  const uncertain = lastCommand(); const originalKeyCount = keyCount; assert.ok(button('查询原操作回执')); assert.ok(button('重放原请求')); assert.equal(dialog().querySelector('input[aria-label="客户名称"]').disabled, true); assert.equal(dialog().querySelector('[role="switch"]').disabled, true); assert.equal(workspace.canLeave(), false);
  const writeCount = calls.filter(call => call.command).length; await click(button('取消')); assert.ok(dialog()); assert.equal(calls.filter(call => call.command).length, writeCount);
  mode = 'absent-receipt'; await click(button('查询原操作回执')); assert.match(dialog().textContent, /不代表未提交/); assert.equal(keyCount, originalKeyCount); mode = 'normal'; await click(button('重放原请求'));
  assert.deepEqual(lastCommand(), uncertain); assert.equal(keyCount, originalKeyCount); assert.equal(dialog(), null);
  console.log('PASS DOM 4: uncertain outcome locks name/state and original key; receipt404 not rollback proof; explicit exact atomic replay closes only on confirmation.');
  await click(host.querySelector('.party-edit')); await text(dialog().querySelector('input[aria-label="客户名称"]'), ' 原子改名与停用 '); await click(dialog().querySelector('[role="switch"]')); assert.equal(dialog().querySelector('[role="switch"]').getAttribute('aria-checked'), 'false');
  mode = 'dependency'; const beforeBlockedName = rows.customers[0].name; const beforeAtomic = calls.filter(call => call.command).length; await click(button('确定')); assert.match(dialog().textContent, /默认客户/); assert.equal(rows.customers[0].enabled, true); assert.equal(rows.customers[0].name, beforeBlockedName); assert.equal(dialog().querySelector('input[aria-label="客户名称"]').value, ' 原子改名与停用 ');
  await click(button('确定')); const combined = lastCommand(); assert.equal(combined.action, 'EDIT'); assert.equal(combined.enabled, false); assert.equal(combined.name, ' 原子改名与停用 '); assert.deepEqual(Object.keys(combined).sort(), ['action', 'enabled', 'expectedVersion', 'id', 'name', 'requestKey']); assert.equal(calls.filter(call => call.command).length, beforeAtomic + 2); assert.equal(dialog(), null);
  await selectOption('客户状态', '已停用'); await click(button('查询')); assert.equal(calls.at(-1).search.get('enabled'), 'DISABLED'); await click(host.querySelector('.party-edit')); await click(dialog().querySelector('[role="switch"]')); await click(button('确定')); assert.equal(lastCommand().action, 'EDIT'); assert.equal(lastCommand().enabled, true); assert.equal(dialog(), null); await click(button('重置'));
  console.log('PASS DOM 5: source name+state edit is one atomic EDIT/CAS/key, guard failure changes neither, restore is same single edit; no extra row/delete/tag controls.');
  await click(host.querySelector('.party-edit')); assert.ok(dialog()); const beforeCleanLeave = calls.length;
  await render(SupplierPageHost); await render(CustomerPageHost); assert.equal(dialog(), null); assert.equal(calls.length, beforeCleanLeave);
  console.log('PASS DOM 9: legitimate route leave clears a clean unchanged editor; reentry keeps bounded list/filter state without resurrecting the modal or rereading detail.');
  mode = 'hold-detail'; await click(host.querySelector('.party-edit')); const detailHeld = held.at(-1); await closeModal(); assert.equal(detailHeld.signal.aborted, true); await act(async () => detailHeld.finish()); await settle(); assert.equal(dialog(), null); mode = 'normal';
  const candidateContext = new ReadContext({ accountId: 'TEST-CANDIDATE', sessionRevision: '1', permissionRevision: '1' }); const candidateScope = candidateContext.createScope('TEST-CANDIDATE'); let selected = null;
  await act(async () => root.render(createElement(StrictMode, null, createElement(PartyCandidateSelector, { kind: 'SUPPLIER', scope: candidateScope, client, value: selected, onChange: value => { selected = value; }, onAccessFailure: () => {} })))); await settle();
  const candidateBefore = calls.length; await click(host.querySelector('button[aria-label="选择供应商"]')); assert.equal(calls.length, candidateBefore + 1); assert.equal(calls.at(-1).family, 'suppliers'); assert.equal(calls.at(-1).leaf, 'candidates'); assert.deepEqual(Array.from(calls.at(-1).search.keys()).sort(), ['page', 'pageSize', 'search']);
  await click(Array.from(host.querySelectorAll('.iw-option')).find(element => element.textContent.includes('TEST 同名供应商'))); assert.equal(selected.name, 'TEST 同名供应商'); assert.equal(dialog(), null); assert.equal(document.activeElement, host.querySelector('button[aria-label="选择供应商"]'));
  mode = 'hold-candidate'; await click(host.querySelector('button[aria-label="选择供应商"]')); const candidateHeld = held.at(-1); await act(async () => dialog().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await settle(); assert.equal(candidateHeld.signal.aborted, true); await act(async () => candidateHeld.finish()); await settle(); assert.equal(dialog(), null);
  console.log('PASS DOM 6: detail/candidate close aborts and discards late responses; enabled-only independent candidate page reads only on explicit open.');
  await act(async () => candidateContext.clear()); await settle(); assert.match(host.textContent, /身份已失效/); assert.doesNotMatch(host.textContent, /TEST 同名供应商/); mode = 'normal';
  await render(CustomerPageHost); await text(host.querySelector('input[aria-label="搜索名称或编码"]'), '身份前未执行筛选'); await click(host.querySelector('.party-edit')); await text(dialog().querySelector('input[aria-label="客户名称"]'), '待清除'); mode = 'hold-write'; await click(button('确定')); const writeHeld = held.at(-1); const beforeClear = calls.length;
  await act(async () => context.replaceIdentity({ accountId: 'TEST-DOM', sessionRevision: '2', permissionRevision: '2' })); await settle(); assert.equal(writeHeld.signal.aborted, true); assert.equal(dialog(), null); assert.equal(host.querySelector('tbody'), null); assert.match(host.textContent, /旧身份结果与草稿已清除/); await act(async () => writeHeld.finish()); await settle(); assert.equal(calls.length, beforeClear); assert.doesNotMatch(host.textContent, /待清除|TEST 客户|旧编码/);
  console.log('PASS DOM 7: identity/session/permission invalidation clears both kinds, dialog facts and atomic command; late ignored response cannot restore facts.');
  mode = 'normal'; const freshContext = new ReadContext({ accountId: 'TEST-NEW', sessionRevision: '1', permissionRevision: '1' }); const freshScope = freshContext.createScope('TEST-PARTIES'); const freshWorkspace = createPartyWorkspace({ scope: freshScope, client, newRequestKey: () => `TEST-FRESH-${++keyCount}`, onAccessFailure: () => {} });
  await act(async () => root.render(createElement(CustomerPageHost, { workspace: freshWorkspace }))); await settle(); assert.equal(host.querySelector('input[aria-label="搜索名称或编码"]').value, ''); assert.equal(dialog(), null); assert.equal(calls.length, beforeClear + 1); assert.equal(calls.at(-1).search.get('enabled'), 'ENABLED');
  console.log('PASS DOM 8: replacement workspace with reused route ID gets fresh filter/editor identity and only its newly activated bounded default page.');
  for (const [Component, label] of [[CustomerPageHost, '客户'], [SupplierPageHost, '供应商']]) {
    await act(async () => root.render(createElement(Component, { workspace: freshWorkspace, readOnly: true }))); await settle();
    const create = button(`新增${label}`), edit = host.querySelector('.party-edit');
    assert.equal(create.disabled, true); assert.equal(edit.disabled, true); assert.match(create.title, /只读/); assert.match(edit.title, /只读/);
    const beforeReadOnlyClick = calls.length, beforeReadOnlyKeys = keyCount;
    await click(create); await click(edit);
    assert.equal(dialog(), null); assert.equal(freshWorkspace.get(label === '客户' ? 'CUSTOMER' : 'SUPPLIER').getSnapshot().editor, null);
    assert.equal(calls.length, beforeReadOnlyClick); assert.equal(keyCount, beforeReadOnlyKeys);
  }
  await act(async () => root.render(createElement(CustomerPageHost, { workspace: freshWorkspace }))); await settle();
  assert.equal(button('新增客户').disabled, false); assert.equal(host.querySelector('.party-edit').disabled, false);
  await click(button('新增客户')); assert.ok(dialog()); await closeModal(); assert.equal(dialog(), null);
  console.log('PASS DOM 12: explicit readOnly disables both real Arco write triggers for each kind without read/key/command IO; omission preserves the existing create/edit workflow.');
  await act(async () => root.render(createElement(PartyPagination, { page: 6, pageSize: 20, total: 400, busy: false, onPage: () => {}, onPageSize: () => {} }))); await settle();
  const actions = host.querySelector('.party-pagination .arco-pagination'); assert.ok(actions);
  assert.equal(actions.querySelector('.arco-pagination-item-active')?.textContent.trim(), '6');
  assert.equal(actions.querySelector('[aria-label="上一页"]').tabIndex, 0); assert.equal(actions.querySelector('[aria-label="下一页"]').tabIndex, 0);
  assert.ok([...actions.querySelectorAll('.arco-pagination-item')].some(item => item.textContent.trim() === '20'));
  console.log('PASS DOM 10: actual shared Arco Pagination retains current sixth page and twentieth last page with keyboard-reachable steps; no geometry is mocked.');
  await act(async () => root.unmount()); root = null; workspace.dispose(); candidateScope.dispose(); freshWorkspace.dispose();
  console.log('All 12 synthetic behavioral DOM groups passed using actual Arco components. CSS is deliberately not rendered: no frozen-Demo pixel/geometry/browser/performance acceptance claim.');
} finally { if (root) { const { act } = await import('react'); await act(async () => root.unmount()); root = null; } dom.window.close(); await rm(temp, { recursive: true, force: true }); }
