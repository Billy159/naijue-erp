import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Synthetic transport + real module DOM lifecycle only. No browser, server or DB.
const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.runtime-dom-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLDialogElement','HTMLButtonElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = media => ({ matches: false, media, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
const { act } = await import('react');
const { ReadContext } = await import(pathToFileURL(path.resolve(here, '../../../../../src/loading/read-scope.ts')).href);
const { createCatalogueMaintenanceHttpClient } = await import(pathToFileURL(path.resolve(here, '../../../../../src/product-settings/catalogue-maintenance-http-client.ts')).href);
let dispose;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.resolve(here, '../entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react','react-dom','react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', plugins: [{ name: 'source-css-test-only', setup(b) { b.onResolve({ filter: /\.css(?:\?inline)?$/ }, args => ({ path: args.path, namespace: 'test-css' })); b.onLoad({ filter: /.*/, namespace: 'test-css' }, () => ({ contents: 'export default "";', loader: 'js' })); } }], logLevel: 'warning' });
  const { mountCatalogue, mountBarcodeSchemeDetail } = await import(pathToFileURL(output).href);
  const renderPager = () => { throw new Error('catalogue must not fall back to the legacy HTML pager'); };
  const operationWidth = (await readFile(path.resolve(here, '../../../product-inventory-unified.css'), 'utf8')).split('\n').find(line => line.includes('table[data-has-operations] th:last-child'));
  assert.ok(operationWidth, 'C-owned final column rule is limited to operation tables');
  const columnStyle = document.createElement('style'); columnStyle.textContent = operationWidth; document.head.append(columnStyle);
  const requests = [], changes = [], failures = [], recoveries = [];
  const http = { origin: 'https://synthetic.test', basePath: '', fetch: (url, init) => new Promise((resolve, reject) => requests.push({ url, init, resolve, reject })) };
  const sid = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  const resolve = async (request, data, status = 200) => { await act(async () => request.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }))); await settle(); };
  const latest = suffix => requests.findLast(request => request.url.endsWith(suffix));
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  const click = async node => { assert.ok(node); await act(async () => node.click()); await settle(); };
  const type = async (node, value) => { assert.ok(node); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); }); await settle(); };
  const entry = (value, name = `颜色${value}`, version = 1) => ({ id: sid(value), code: String(value).padStart(3, '0'), name, enabled: true, version });
  const page = (request, total, name) => { const input = JSON.parse(request.init.body); return { page: input.page, pageSize: input.pageSize, total, items: Array.from({ length: Math.min(input.pageSize, Math.max(0, total - (input.page - 1) * input.pageSize)) }, (_, i) => entry((input.page - 1) * input.pageSize + i + 1, name)) }; };
  const host = document.getElementById('root');
  // Assert the real mounted region, not wording-derived severity or a helper
  // imitation. Recovery has a separate error region and is intentionally unchanged.
  const categoryNotice = (kind, message) => {
    const notice = host.querySelector('#pc-category-error');
    assert.ok(notice, 'category notice region remains mounted');
    assert.equal(notice.textContent, message);
    assert.equal(notice.getAttribute('role'), kind === 'error' ? 'alert' : 'status');
    assert.equal(notice.classList.contains('inline-error'), kind === 'error');
    assert.equal(notice.classList.contains('hint'), kind === 'status');
  };
  let scope, context, leave;
  async function mount(route, maintenance) {
    if (dispose) await act(async () => dispose());
    context?.clear();
    context = new ReadContext({ accountId: sid(900), sessionRevision: '1', permissionRevision: '1' }); scope = context.createScope(route);
    const options = { scope, http, onAccessFailure: kind => failures.push(kind), onCanLeaveChange: guard => { leave = guard; }, onChanged: kind => changes.push(kind), renderPager, categoryControlCss: '', mountEmpty: () => () => {}, ...(maintenance ? { maintenance } : {}) };
    await act(async () => { dispose = await mountCatalogue(host, route, options); }); await settle();
  }
  await mount('product-settings');
  assert.equal(requests.length, 1); assert.ok(latest('/catalogue-settings-read/colors/query'));
  const cancelled = requests.at(-1); await click(button('取消')); assert.equal(cancelled.init.signal.aborted, true);
  await resolve(cancelled, page(cancelled, 1, 'CANCELLED RESULT')); assert.doesNotMatch(host.textContent, /CANCELLED RESULT/);
  await click(button('重试加载资料'));
  await resolve(requests.at(-1), page(requests.at(-1), 21));
  assert.ok(button('新增颜色'), 'source add action remains visible when maintenance is not connected');
  assert.equal(button('新增颜色').disabled, true, 'missing capability never grants a write');
  assert.ok(button('编辑'), 'source operation column must not become blank when capability is missing');
  assert.equal(button('编辑').disabled, true);
  assert.match(host.textContent, /维护尚未接通/);
  assert.ok(host.querySelector('.iw-pagination .ui-single-host'), 'catalogue consumes the shared source pagination select');
  assert.equal(getComputedStyle(host.querySelector('th:last-child')).width, '76px', 'only actual operation columns receive the frozen operation width');
  await click(document.querySelector('.iw-pagination [aria-label="下一页"]'));
  assert.equal(JSON.parse(requests.at(-1).init.body).page, 2);
  await resolve(requests.at(-1), page(requests.at(-1), 21));
  assert.equal(host.querySelectorAll('tbody tr').length, 1); assert.match(host.textContent, /共 21 条/);
  const search = host.querySelector('#pc-dict-search'); search.focus();
  await type(search, 'old'); const old = requests.at(-1);
  await type(search, 'new'); const current = requests.at(-1);
  assert.equal(old.init.signal.aborted, true);
  await resolve(current, page(current, 1, 'NEW RESULT')); await resolve(old, page(old, 1, 'STALE RESULT'));
  assert.match(host.textContent, /NEW RESULT/); assert.doesNotMatch(host.textContent, /STALE RESULT/); assert.equal(document.activeElement, search);
  await click(button('尺码组')); const groups = requests.at(-1); assert.ok(groups.url.endsWith('/dictionary-read/size-groups/query'));
  await resolve(groups, { page: 1, pageSize: 20, total: 6, items: Array.from({ length: 6 }, (_, i) => ({ id: sid(50 + i), name: `合成合同尺码组${i}`, sizes: [{ id: sid(151 + i), name: i === 0 ? '030' : `S${i}`, displayOrder: -1 }] })) });
  assert.match(host.textContent, /030/); assert.equal(button('新增尺码组'), undefined);
  assert.equal(host.querySelectorAll('tbody tr').length, 6); assert.match(host.textContent, /共 6 条/);
  assert.equal(host.querySelector('table').hasAttribute('data-has-operations'), false);
  assert.notEqual(getComputedStyle(host.querySelector('th:last-child')).width, '76px', 'size members column is not an operation column');
  await click(button('季节')); assert.ok(requests.at(-1).url.endsWith('/dictionary-read/seasons/query'));
  await resolve(requests.at(-1), { page: 1, pageSize: 20, total: 4, items: Array.from({ length: 4 }, (_, i) => ({ id: sid(60 + i), name: `合成合同季节${i}` })) });
  assert.equal(host.querySelectorAll('tbody tr').length, 4); assert.equal(host.querySelector('table').hasAttribute('data-has-operations'), false);
  await type(host.querySelector('#pc-dict-search'), 'LATE');
  const late = requests.at(-1); await act(async () => dispose()); await resolve(late, { page: 1, pageSize: 20, total: 1, items: [{ id: sid(60), name: 'LATE CLOSED' }] }); assert.equal(host.childElementCount, 0);

  const client = createCatalogueMaintenanceHttpClient(http, 'COLOR');
  await mount('product-settings', { COLOR: { kind: 'COLOR', client, allowedActions: ['CREATE','EDIT','DELETE'], newRequestKey: () => sid(100), onRecoveryRequired: command => recoveries.push(command) } });
  await resolve(requests.at(-1), page(requests.at(-1), 0)); await click(button('新增颜色'));
  await type(document.querySelector('#pc-dict-name input'), '白色'); await type(document.querySelector('#pc-dict-code input'), '001'); await click(button('确定'));
  const unknown = latest('/catalogue/colors/commands'); assert.ok(unknown); const originalBody = unknown.init.body;
  await act(async () => unknown.reject(new Error('synthetic disconnected response'))); await settle();
  assert.equal(leave(), false); assert.ok(button('查回原请求结果')); await click(button('按原请求重试'));
  assert.equal(latest('/catalogue/colors/commands').init.body, originalBody, 'unknown retry retains exact request key/body');
  await resolve(requests.at(-1), { operationId: sid(101), kind: 'COLOR', targetId: sid(1), version: 1 });
  const verification = latest('/catalogue-settings-read/colors/query'); assert.equal(JSON.parse(verification.init.body).search, '001');
  await resolve(verification, { page: 1, pageSize: 20, total: 1, items: [entry(1, '白色')] });
  await resolve(requests.at(-1), page(requests.at(-1), 1, '白色'));
  assert.equal(document.querySelector('#pc-dict-form'), null); assert.deepEqual(changes, ['COLOR']); assert.equal(recoveries.length, 0);

  await mount('barcode-schemes');
  const scheme = { id: sid(80), name: '原历史方案', barcodeType: 'Code128', ruleDescription: '来源原值', codeLength: null, ruleVersion: 'source', status: 'HISTORICAL', applicability: null };
  await resolve(requests.at(-1), { page: 1, pageSize: 20, total: 21, items: Array.from({ length: 20 }, (_, i) => ({ ...scheme, id: sid(80 + i) })) });
  assert.ok(host.querySelector('.pc-schemes .iw-pagination .ui-single-host'), 'scheme list uses the same source pagination consumer');
  const schemeTableScroll=host.querySelector('.pc-schemes .table-scroll'),schemeNote=host.querySelector('.pc-schemes .pc-scheme-note'),schemePager=host.querySelector('.pc-schemes .iw-pagination');
  assert.equal(Boolean(schemeTableScroll&&schemeNote&&schemePager),true,'scheme table, original note and separate shared pager remain mounted');
  assert.equal(schemeTableScroll.nextElementSibling===schemeNote,true,'original note must immediately follow a nonempty table, not the viewport bottom');
  assert.equal(schemeNote.nextElementSibling===schemePager,true,'separate pagination remains after the note');
  assert.match(schemeTableScroll.textContent,/来源原值/);assert.match(schemeTableScroll.textContent,/未知/,'unknown native facts must not become Demo placeholders');
  assert.equal(latest('/dictionary-read/barcode-scheme/query'), undefined);
  await click(button('查看')); assert.equal(JSON.parse(requests.at(-1).init.body).schemeId, scheme.id);
  await resolve(requests.at(-1), scheme); assert.match(document.querySelector('.pc-rule').textContent, /来源原值/); assert.doesNotMatch(document.querySelector('.pc-rule').textContent, /识别码/);
  await click(button('关闭'));
  await click(host.querySelector('.iw-pagination [aria-label="下一页"]'));
  assert.equal(JSON.parse(requests.at(-1).init.body).page, 2);
  assert.equal(button('查看').disabled, true, 'stale scheme rows cannot open another detail while paging');
  await resolve(requests.at(-1), { page: 2, pageSize: 20, total: 21, items: [{ ...scheme, id: sid(100) }] });
  assert.equal(host.querySelectorAll('tbody tr').length, 1); assert.match(host.textContent, /共 21 条/);

  // RED first: the shared scheme size selector must remain reachable after a
  // valid size change collapses21 actual synthetic DTOs from2 pages to1.
  const schemeRows = Array.from({ length: 21 }, (_, i) => ({ ...scheme, id: sid(80 + i) }));
  const chooseSchemeSize = async size => {
    const shadow = host.querySelector('.pc-schemes .iw-pagination .ui-single-host > div')?.shadowRoot;
    assert.ok(shadow, 'scheme list must retain its shared page-size control even on one page');
    await click(shadow.querySelector('[role="combobox"]'));
    await click([...shadow.querySelectorAll('[role="option"]')].find(node => node.textContent.trim() === `${size}条/页`));
    const request = latest('/dictionary-read/barcode-schemes/query'), input = JSON.parse(request.init.body);
    assert.equal(input.page, 1, 'scheme size change must reset page2 to page1'); assert.equal(input.pageSize, size);
    return request;
  };
  const fifty = await chooseSchemeSize(50);
  await resolve(fifty, { page: 1, pageSize: 50, total: schemeRows.length, items: schemeRows });
  assert.equal(host.querySelectorAll('tbody tr').length, 21);
  assert.ok(host.querySelector('.pc-schemes .iw-pagination .ui-single-host'), 'one-page scheme result must retain size selection so users can return to20');
  assert.equal(host.querySelector('.pc-schemes .iw-pagination [aria-label="下一页"]'), null, 'one page must not invent a next page');
  const twenty = await chooseSchemeSize(20);
  await resolve(twenty, { page: 1, pageSize: 20, total: schemeRows.length, items: schemeRows.slice(0, 20) });
  assert.equal(host.querySelectorAll('tbody tr').length, 20);
  assert.ok(host.querySelector('.pc-schemes .iw-pagination [aria-label="下一页"]'));

  await act(async () => dispose()); context.clear();
  context = new ReadContext({ accountId: sid(900), sessionRevision: '2', permissionRevision: '2' }); scope = context.createScope('product-scheme-detail', sid(80));
  const listsBeforeConsumer = requests.filter(request => request.url.endsWith('/dictionary-read/barcode-schemes/query')).length;
  await act(async () => { dispose = await mountBarcodeSchemeDetail(host, scheme.id, { scope, http, onAccessFailure: kind => failures.push(kind) }, () => {}); }); await settle();
  assert.ok(requests.at(-1).url.endsWith('/dictionary-read/barcode-scheme/query'));
  assert.equal(requests.filter(request => request.url.endsWith('/dictionary-read/barcode-schemes/query')).length, listsBeforeConsumer, 'product consumer does not fetch or mount the scheme list');
  const lateDetail = requests.at(-1); await act(async () => dispose()); await resolve(lateDetail, scheme); assert.equal(document.querySelector('.pc-rule'), null);

  await mount('product-categories');
  await resolve(requests.at(-1), { total: 1, items: [{ id: sid(70), parentId: null, name: '真实根分类', displayOrder: -3, version: 2, code: null, productCount: null, childCount: 0 }] });
  assert.match(host.textContent, /未知/); assert.equal(host.querySelector('[data-cat="name"]').value, '真实根分类');
  assert.equal(host.querySelector('[data-cat="name"]').disabled, true); assert.equal(button('删除分类').disabled, true);
  assert.equal(button('新增一级分类').disabled, true); assert.match(host.textContent, /维护尚未接通/);
  // Revoked identity clears every live route leaf; no stale source fallback.
  await act(async () => context.clear()); await settle(); assert.equal(host.childElementCount, 0);

  let key = 200;
  const categoryClient = createCatalogueMaintenanceHttpClient(http, 'CATEGORY');
  await mount('product-categories', { CATEGORY: { kind: 'CATEGORY', client: categoryClient, allowedActions: ['CREATE','EDIT','DELETE'], newRequestKey: () => sid(++key), onRecoveryRequired: command => recoveries.push(command) } });
  const rootCategory = { id: sid(70), parentId: null, name: '合成合同根分类', displayOrder: -3, version: 2, code: null, productCount: null, childCount: 0 };
  const tree = items => ({ total: items.length, items });
  await resolve(requests.at(-1), tree([rootCategory]));
  assert.equal(host.querySelector('[data-cat="name"]').disabled, false); await type(host.querySelector('[data-cat="name"]'), '合成改名'); await click(button('保存'));
  const edit = requests.at(-1); assert.ok(edit.url.endsWith('/catalogue/categories/commands')); assert.equal(JSON.parse(edit.init.body).action, 'EDIT'); assert.equal(JSON.parse(edit.init.body).expectedVersion, 2);
  assert.equal(host.querySelector('[data-cat="name"]').disabled, true);
  await resolve(edit, { operationId: sid(301), kind: 'CATEGORY', targetId: rootCategory.id, version: 3 });
  categoryNotice('status', '已提交，正在读取最新目录。');
  const editedRoot = { ...rootCategory, name: '合成改名', version: 3 }; await resolve(requests.at(-1), tree([editedRoot]));
  assert.equal(host.querySelector('[data-cat="name"]').value, '合成改名');
  categoryNotice('status', '分类已保存');
  await click(button('新增下级分类')); await type(host.querySelector('[data-cat="name"]'), '合成下级'); await click(button('保存'));
  assert.equal(JSON.parse(requests.at(-1).init.body).values.parentId, rootCategory.id);
  await resolve(requests.at(-1), { operationId: sid(302), kind: 'CATEGORY', targetId: sid(71), version: 1 });
  const child = { ...rootCategory, id: sid(71), parentId: rootCategory.id, name: '合成下级', displayOrder: 0, version: 1 };
  await resolve(requests.at(-1), tree([{ ...editedRoot, childCount: 1 }, child]));
  assert.equal(host.querySelector('[data-cat="name"]').value, '合成下级');
  categoryNotice('status', '分类已保存');
  await click(button('删除分类')); await click(button('确认删除')); assert.equal(JSON.parse(requests.at(-1).init.body).action, 'DELETE');
  assert.equal(JSON.parse(requests.at(-1).init.body).expectedVersion, 1);
  await resolve(requests.at(-1), { operationId: sid(303), kind: 'CATEGORY', targetId: sid(71), version: 2 }); await resolve(requests.at(-1), tree([editedRoot]));
  assert.equal(button('新增一级分类').disabled, false, 'delete readback releases the same category command owner');
  categoryNotice('status', '已删除');
  await click(button('新增一级分类')); await type(host.querySelector('[data-cat="name"]'), '合成新根'); await click(button('保存'));
  assert.equal(JSON.parse(requests.at(-1).init.body).values.parentId, null);
  await resolve(requests.at(-1), { operationId: sid(304), kind: 'CATEGORY', targetId: sid(72), version: 1 });
  await resolve(requests.at(-1), tree([editedRoot, { ...rootCategory, id: sid(72), name: '合成新根', displayOrder: 0, version: 1 }]));
  assert.equal(host.querySelector('[data-cat="name"]').value, '合成新根');
  categoryNotice('status', '分类已保存');

  // Same wording must not downgrade a real exception to success. The throw is
  // before dispatch, inside the existing submit catch; no controller is mocked.
  let failKey = true;
  const categoryCommands = () => requests.filter(request => request.url.endsWith('/catalogue/categories/commands'));
  const categoryReads = () => requests.filter(request => request.url.endsWith('/catalogue-settings-read/categories/query'));
  const categoryChanges = () => changes.filter(kind => kind === 'CATEGORY').length;
  await mount('product-categories', { CATEGORY: { kind: 'CATEGORY', client: categoryClient, allowedActions: ['CREATE','EDIT','DELETE'], newRequestKey: () => { if (failKey) { failKey = false; throw new Error('分类已保存'); } return sid(++key); }, onRecoveryRequired: command => recoveries.push(command) } });
  await resolve(requests.at(-1), tree([rootCategory]));
  const commandsBeforeValidation = categoryCommands().length;
  await type(host.querySelector('[data-cat="name"]'), '   '); await click(button('保存'));
  categoryNotice('error', '分类名称必填');
  assert.equal(categoryCommands().length, commandsBeforeValidation, 'blank name must not dispatch a command');
  await type(host.querySelector('[data-cat="name"]'), '合成读回重试'); await click(button('保存'));
  categoryNotice('error', '分类已保存');
  assert.equal(categoryCommands().length, commandsBeforeValidation, 'request-key failure is not a dispatched write');
  assert.equal(button('保存').disabled, false);

  await click(button('保存'));
  categoryNotice('status', ''); // a fresh submit clears the old local exception
  const readbackCommand = categoryCommands().at(-1), readbackBody = readbackCommand.init.body, changesBeforeReadback = categoryChanges();
  await resolve(readbackCommand, { operationId: sid(305), kind: 'CATEGORY', targetId: rootCategory.id, version: 3 });
  categoryNotice('status', '已提交，正在读取最新目录。');
  await act(async () => categoryReads().at(-1).reject(new Error('synthetic category readback failure'))); await settle();
  categoryNotice('error', '操作已提交，最新目录读取失败，请重新读取目录。');
  assert.equal(button('保存').disabled, true, 'a readback failure must not release the committed command');
  assert.equal(leave(), false);
  const committedWrites = categoryCommands().length;
  await click(button('重新读取目录'));
  categoryNotice('status', '已提交，正在读取最新目录。');
  await resolve(categoryReads().at(-1), tree([rootCategory]));
  categoryNotice('error', '保存已提交，最新目录版本尚未确认，请重新读取目录。');
  assert.equal(button('保存').disabled, true, 'an old version is not authoritative confirmation');
  assert.equal(leave(), false);
  await click(button('重新读取目录'));
  const confirmedRoot = { ...rootCategory, name: '合成读回重试', version: 3 };
  await resolve(categoryReads().at(-1), tree([confirmedRoot]));
  categoryNotice('status', '分类已保存');
  assert.equal(button('保存').disabled, false); assert.equal(leave(), true);
  assert.equal(categoryCommands().length, committedWrites, 'readback retries never resubmit a committed command');
  assert.equal(categoryChanges(), changesBeforeReadback + 1, 'readback retries do not repeat the committed change notification');
  assert.equal(readbackCommand.init.body, readbackBody);

  // Unknown outcome remains a real Recovery error until a same-key receipt and
  // authoritative read confirm it. Notice styling must not unlock or resend it.
  await type(host.querySelector('[data-cat="name"]'), '合成未知恢复'); await click(button('保存'));
  categoryNotice('status', '');
  const unknownCategory = categoryCommands().at(-1), unknownBody = unknownCategory.init.body;
  const unknownInput = JSON.parse(unknownBody), writesBeforeReceipt = categoryCommands().length, keyBeforeReceipt = key, changesBeforeReceipt = categoryChanges();
  await act(async () => unknownCategory.reject(new Error('synthetic lost category response'))); await settle();
  assert.equal(button('保存').disabled, true); assert.equal(leave(), false);
  assert.ok([...host.querySelectorAll('.inline-error[role="alert"]')].some(node => node.textContent.includes('连接中断。')), 'unknown outcome keeps the existing error treatment');
  assert.ok(button('查回原请求结果')); assert.ok(button('按原请求重试'));
  assert.equal(host.querySelector('#pc-category-error').textContent, '', 'unknown outcome must not manufacture a success notice');
  await click(button('查回原请求结果'));
  const categoryReceipt = requests.at(-1);
  assert.ok(categoryReceipt.url.endsWith('/catalogue/categories/receipts/' + unknownInput.requestKey));
  assert.equal(categoryReceipt.init.method, 'GET');
  assert.equal(categoryCommands().length, writesBeforeReceipt); assert.equal(key, keyBeforeReceipt);
  assert.equal(categoryChanges(), changesBeforeReceipt, 'unknown outcome does not announce a confirmed change');
  await resolve(categoryReceipt, { requestKey: unknownInput.requestKey, action: 'EDIT', status: 'COMMITTED', completedAt: '2026-10-31T00:00:00Z', result: { operationId: sid(306), kind: 'CATEGORY', targetId: confirmedRoot.id, version: 4 } });
  categoryNotice('status', '已提交，正在读取最新目录。');
  assert.equal(button('保存').disabled, true, 'receipt alone still requires authoritative version readback');
  await resolve(categoryReads().at(-1), tree([{ ...confirmedRoot, name: '合成未知恢复', version: 4 }]));
  categoryNotice('status', '分类已保存');
  assert.equal(button('保存').disabled, false); assert.equal(leave(), true);
  assert.equal(button('查回原请求结果'), undefined); assert.equal(button('按原请求重试'), undefined);
  assert.equal(categoryCommands().length, writesBeforeReceipt); assert.equal(key, keyBeforeReceipt);
  assert.equal(categoryChanges(), changesBeforeReceipt + 1, 'same-key receipt recovery announces exactly one committed change');
  assert.equal(unknownCategory.init.body, unknownBody, 'receipt recovery preserves the original request body/key');
  console.log('PASS catalogue repair: source actions visible/disabled without capability; exact category edit/child/root/delete commands and version readback with capability; typed status/error DOM semantics including same-wording exception, failed/old-version readback and same-key category receipt recovery; actual operations column marker/C CSS; shared React pagination; server groups/seasons/total; cancellation/focus/unknown key recovery and lazy scheme consumers. Synthetic DOM only, not real R1 data or business acceptance.');
} finally {
  if (dispose) await act(async () => dispose());
  dom.window.close(); await rm(temporary, { recursive: true, force: true });
}
