import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)), temp = await mkdtemp(path.join(here, '.dom-tmp-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLIFrameElement', 'Element', 'SVGElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// JSDOM has the native carrier but not its top-layer methods.
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; dom.window.ResizeObserver = globalThis.ResizeObserver;
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); dom.window.HTMLElement.prototype.scrollIntoView = () => {};
let root;
try {
  const output = path.join(temp, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'dom-entry.tsx')], outfile: output, bundle: true, platform: 'node', format: 'esm', external: ['react', 'react/*', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { act, createElement, createRoot, ReadContext, createCurrentFormHttpReader, TransferProposalSession, TransferProposalForm, SalesProposalSession, SalesProposalForm } = await import(pathToFileURL(output).href);
  const host = document.getElementById('root'); root = createRoot(host);
  const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const warehouse = n => ({ id: uuid(n), name: `TEST warehouse ${n}`, hallId: uuid(90), hallName: 'TEST hall', enabled: true, hallEnabled: true, hasNonzeroInventory: false });
  const product = { id: uuid(3), code: 'TEST', name: 'TEST product', retailPrice: null, sizeGroupId: uuid(8), minimumPriceAvailability: 'UNAVAILABLE' };
  const sku = { id: uuid(4), skuCode: 'TEST-SKU', productId: uuid(3), productCode: 'TEST', productName: 'TEST product', colorId: uuid(5), colorName: 'TEST red', fitId: uuid(6), fitName: 'TEST fit', sizeId: uuid(7), sizeName: '165/S', sizeGroupId: uuid(8), barcodeAvailability: 'UNAVAILABLE' };
  const calls = []; let closed = 0;
  const reader = createCurrentFormHttpReader({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, body });
    if (url.endsWith('/dictionary-read/size-groups/query')) return new Response(JSON.stringify({ page: body.page, pageSize: body.pageSize, total: 1, items: [{ id: uuid(8), name: 'TEST sizes', sizes: [{ id: uuid(7), name: '165/S', displayOrder: 1 }] }] }), { headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/catalogue-settings-read/fits/query')) return new Response(JSON.stringify({ page: body.page, pageSize: body.pageSize, total: 1, items: [{ id: uuid(6), code: 'TEST', name: 'TEST fit', enabled: true, version: 1 }] }), { headers: { 'content-type': 'application/json' } });
    const items = url.endsWith('/transfer-warehouses/query') ? [warehouse(1), warehouse(2)] : url.endsWith('/products/query') ? [product] : url.endsWith('/product-skus/query') ? [sku] : assert.fail('Unexpected network command');
    return new Response(JSON.stringify({ page: body.page, pageSize: 20, exactTotal: String(items.length), items }), { headers: { 'content-type': 'application/json' } });
  } });
  const context = new ReadContext({ accountId: uuid(99), sessionRevision: 'test', permissionRevision: 'test' });
  const proposalScope = context.createScope('proposal'); const session = new TransferProposalSession(proposalScope, reader);
  await act(async () => root.render(createElement(TransferProposalForm, { session, scope: proposalScope, close: () => closed++ })));
  assert.equal(calls.length, 0);
  assert.ok(host.querySelector('.transfer-proposal-editor.tc-editor'));
  assert.deepEqual([...host.querySelectorAll('.tc-gold-doc-fields > .tc-gold-field > span:first-child')].map(node => node.textContent), ['单据日期 *', '调出仓库 *', '调入仓库 *', '单号', '创建者', '负责人']);
  assert.equal(host.querySelector('.tc-head h1').textContent, '新增调拨单');
  assert.ok(host.querySelector('.tc-head .actions'));
  assert.ok(host.querySelector('.transfer-proposal-matrix'));
  assert.ok(host.querySelector('.tc-gold-footer'));
  const button = label => [...host.querySelectorAll('button')].find(el => el.textContent === label);
  const click = async el => { assert.ok(el, host.innerHTML); assert.equal(Boolean(el.disabled), false); assert.notEqual(el.getAttribute('aria-disabled'), 'true'); await act(async () => { el.focus(); el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 10)); }); };
  const change = async (el, value) => { assert.ok(el); await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }); };
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  const until = async (test, label) => { for (let i = 0; i < 100 && !test(); i++) await settle(); assert.ok(test(), label); };
  const select = label => host.querySelector(`[role=combobox][aria-label="${label}"]`);
  const option = label => [...host.querySelectorAll('[role=option]')].find(node => node.textContent.trim() === label);
  const key = async (node, value) => { assert.ok(node); await act(async () => node.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }))); await settle(); };
  await click(select('选择调出仓库')); await click(option('TEST warehouse 1'));
  await click(select('选择调入仓库'));
  assert.ok(option('TEST warehouse 1').classList.contains('arco-select-option-disabled'), 'The opposite warehouse is visibly unavailable');
  await act(async () => option('TEST warehouse 1').click()); assert.equal(session.getSnapshot().draft.to, null);
  await click(option('TEST warehouse 2'));
  await click(host.querySelector('[aria-label="调拨行内找货"]')); await until(() => host.querySelector('[data-finder-option]'), 'Native bounded product finder');
  await click(host.querySelector('[data-finder-option]')); await until(() => session.getSnapshot().pending.phase === 'ready', 'Actual product SKU relation');
  await click(select('录入颜色')); await click(option('TEST red'));
  await click(select('录入版型')); await click(option('TEST fit'));
  await until(() => host.querySelector('[data-transfer-entry-sku]'), 'Canonical size-group dictionary gates the real quantity input');
  await change(host.querySelector('[data-transfer-entry-sku]'), '3'); await key(host.querySelector('[data-transfer-entry-sku]'), 'Enter');
  await until(() => session.getSnapshot().draft.lines.length === 1, 'Enter commits only the selected exact SKU');
  assert.equal(session.getSnapshot().draft.lines[0].sku.id, sku.id);
  assert.deepEqual([...host.querySelectorAll('.mx-section:not(.mx-draft-section) th')].map(th => th.textContent), ['款号／商品名称', '颜色', '版型', '165/S', '小计', '操作']);
  await change(host.querySelector('[aria-label="单据日期"]'), '2026-10-21');
  await change(host.querySelector('[data-transfer-row-sku]'), '1.5'); await act(async () => { assert.equal(session.validate(), null); });
  assert.ok(host.querySelector('[role=alert]')); assert.equal(session.getSnapshot().draft.lines[0].quantity, '1.5');
  await change(host.querySelector('[data-transfer-row-sku]'), '3'); await act(async () => { assert.ok(session.validate()); });
  assert.match(host.textContent, /本地草稿校验通过/); assert.equal(button('保存').disabled, true, 'No preparation capability means no save command');
  // The current continuous-entry UI replaces the retired disabled SKU button
  // with an explicit duplicate-append confirmation; cancel must preserve both.
  await click(host.querySelector('[aria-label="调拨行内找货"]')); await until(() => host.querySelector('[data-finder-option]'), 'Repeated product finder'); await click(host.querySelector('[data-finder-option]'));
  await until(() => session.getSnapshot().pending.phase === 'ready', 'Repeated exact SKU read');
  await click(select('录入颜色')); await click(option('TEST red')); await click(select('录入版型')); await click(option('TEST fit'));
  await until(() => host.querySelector('[data-transfer-entry-sku]'), 'Repeated exact quantity input'); await change(host.querySelector('[data-transfer-entry-sku]'), '2'); await key(host.querySelector('[data-transfer-entry-sku]'), 'Enter');
  assert.ok(session.getSnapshot().appendRequest); assert.equal(session.getSnapshot().draft.lines[0].quantity, '3', 'Duplicate never silently appends'); await click(button('取消'));
  assert.equal(session.getSnapshot().draft.lines[0].quantity, '3'); assert.equal(session.getSnapshot().pending.quantities[sku.id], '2', 'Cancelling append retains pending raw quantity');
  await click(host.querySelector('[data-transfer-pending-clear]')); assert.equal(session.getSnapshot().pending.product, null);

  assert.equal(calls.filter(call => call.url.includes('/current-form/')).length, 6); assert.ok(calls.every(call => call.body.pageSize > 0 && !('actor' in call.body)));
  await act(async () => { assert.equal(session.reset(), false); }); assert.equal(session.getSnapshot().draft.lines.length, 1);
  await click(button('返回列表')); assert.equal(host.querySelector('dialog[role=alertdialog]').open, true); await click(button('继续编辑')); assert.equal(session.getSnapshot().draft.lines.length, 1);
  await click([...host.querySelectorAll('.mx-section:not(.mx-draft-section) .mx-actions button')].find(node => node.textContent === '删除')); assert.equal(session.getSnapshot().draft.lines.length, 0);
  await act(async () => { assert.equal(session.reset(true), true); }); assert.equal(session.getSnapshot().dirty, false);
  await change(host.querySelector('[aria-label="备注"]'), 'unsaved'); await click(button('返回列表')); assert.equal(closed, 0);
  await click(button('放弃修改并离开')); assert.equal(closed, 1); assert.equal(session.getSnapshot().disposed, true);
  console.log('PASS current transfer proposal DOM: real inline warehouses/product finder/specification controls and native dictionary, raw validation, guarded reset/discard, no save capability or command.');
  const salesCalls = [];
  const reference = (n, more = {}) => ({ id: uuid(n), name: `TEST reference ${n}`, code: null, hallId: null, hallName: null, paymentMethodId: null, paymentMethodName: null, ...more });
  const salesReader = createCurrentFormHttpReader({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    const body = JSON.parse(init.body); salesCalls.push({ url, body }); let items, extra = {};
    if (url.endsWith('/dictionary-read/size-groups/query')) return new Response(JSON.stringify({ page: body.page, pageSize: body.pageSize, total: 1, items: [{ id: uuid(8), name: 'TEST sizes', sizes: [{ id: uuid(7), name: '165/S', displayOrder: 1 }] }] }), { headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/catalogue-settings-read/fits/query')) return new Response(JSON.stringify({ page: body.page, pageSize: body.pageSize, total: 1, items: [{ id: uuid(6), code: 'TEST', name: 'TEST fit', enabled: true, version: 1 }] }), { headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/sales-references/query')) {
      if (body.kind === 'hall') items = [reference(20, { hallId: uuid(20), hallName: 'TEST hall' })];
      else if (body.kind === 'salesperson') items = [reference(25)];
      else if (body.kind === 'customer') items = [reference(21, { code: 'TEST-CUSTOMER' })];
      else if (body.kind === 'warehouse') items = [reference(22, { hallId: uuid(20), hallName: 'TEST hall' })];
      else if (body.kind === 'paymentMethod') items = [reference(23)];
      else if (body.kind === 'paymentAccount') {
        assert.equal(body.paymentMethodId, uuid(23)); items = [reference(24, { paymentMethodId: uuid(23), paymentMethodName: 'TEST reference 23' })]; extra = { recommendationAvailability: 'UNAVAILABLE' };
      } else assert.fail('Unexpected reference');
    } else if (url.endsWith('/products/query')) items = [product];
    else if (url.endsWith('/product-skus/query')) items = [sku];
    else assert.fail('Unexpected network command');
    return new Response(JSON.stringify({ page: body.page, pageSize: 20, exactTotal: String(items.length), items, ...extra }), { headers: { 'content-type': 'application/json' } });
  } });
  const salesScope = context.createScope('sales-proposal'); const sales = new SalesProposalSession(salesScope, salesReader);
  await act(async () => root.render(createElement(SalesProposalForm, { session: sales, scope: salesScope, close: () => closed++ })));
  assert.equal(salesCalls.length, 0); assert.equal(select('选择客户').getAttribute('aria-disabled'), 'true');
  assert.ok(host.querySelector('.tc-editor.sale-editor.sales-proposal-editor'));
  assert.equal(host.querySelector('.sale-head h1').textContent, '新增销货单'); assert.equal(button('保存').disabled, true);
  assert.equal(host.querySelectorAll('.sale-doc-fields > .tc-gold-field').length, 12);
  assert.deepEqual([...host.querySelectorAll('.sale-lines-table thead th')].map(el => el.textContent), ['款号／商品名称', '颜色', '版型', '尺码', '数量', '参考零售价', '折扣', '成交单价', '金额', '操作']);
  assert.ok(host.querySelector('.sale-doc-fields .sale-payment-field')); assert.ok(host.querySelector('.sale-summary .sale-summary-primary'));
  for (const [label, name] of [['选择营业厅', 'TEST reference 20'], ['选择营业员', 'TEST reference 25'], ['选择客户', 'TEST reference 21'], ['选择出库仓', 'TEST reference 22']]) {
    await click(select(label)); await click(option(name));
  }
  await click(host.querySelector('.sale-entry-row .sale-product-input')); await until(() => host.querySelector('[data-finder-option]'), 'Actual sale product finder'); await click(host.querySelector('[data-finder-option]'));
  for (const [part, name] of [['color', 'TEST red'], ['fit', 'TEST fit'], ['size', '165/S']]) {
    await click(host.querySelector(`[data-entry-control$="-${part}"]`)); await until(() => host.querySelector('[data-candidate-option]'), `Actual ${part} candidates`);
    await click([...host.querySelectorAll('[data-candidate-option]')].find(node => node.textContent.trim().replace(/✓$/, '') === name));
  }
  const entryPrice = host.querySelector('[data-entry-field=price]'); assert.equal(entryPrice.value, '', 'No retail price must not invent a unit price');
  assert.equal(entryPrice.closest('tr').querySelector('.sale-discount-control'), null, 'Discount input is unavailable when no native reference price exists');
  await change(host.querySelector('[aria-label="单据日期"]'), '2026-10-21'); await change(host.querySelector('[data-entry-field=quantity]'), '1'); await change(entryPrice, '10.05'); await key(entryPrice, 'Enter');
  assert.equal(sales.getSnapshot().draft.lines.length, 1); assert.equal(sales.getSnapshot().draft.lines[0].sku.id, sku.id); assert.equal(sales.getSnapshot().draft.lines[0].pricingRule, 'UNIT_PRICE');
  await change(host.querySelector('[aria-label="整单优惠"]'), '0.05');
  await click(select('付款方式 1')); await click(option('TEST reference 23'));
  assert.equal(sales.getSnapshot().draft.settlements[0].account, null, 'Unavailable recommendation never guesses the account');
  await click(select('资金账户 1')); await click(option('TEST reference 24'));
  await change(host.querySelector('[aria-label="第1笔收款金额"]'), '10'); await act(async () => { assert.ok(sales.validate()); });
  assert.equal(sales.getSnapshot().totals.netDueMinor, '1000'); assert.equal(sales.getSnapshot().totals.balanced, true);
  assert.match(host.textContent, /不代表可审核/); assert.equal(button('保存').disabled, true);
  await change(host.querySelector('[data-proposal-quantity]').closest('tr').querySelector('input[aria-label$=" 单价"]'), '0'); await act(async () => { assert.equal(sales.validate(), null); }); assert.equal(sales.getSnapshot().totals, null);
  await click(select('付款方式 1').querySelector('.arco-select-clear-icon')); assert.equal(sales.getSnapshot().draft.settlements.length, 0);
  assert.ok(salesCalls.every(call => !('actor' in call.body) && !call.url.endsWith('/commands')));
  await act(async () => context.clear()); assert.equal(sales.getSnapshot().disposed, true); assert.doesNotMatch(host.textContent, /TEST-CUSTOMER/);
  console.log('PASS current SALE proposal DOM: native references, SKU identity, blank explicit price, method-scoped account, exact settlement totals and immediate identity cleanup; no command.');
  await act(async () => root.unmount()); root = null;
} finally {
  if (root) root.unmount(); dom.window.close(); await rm(temp, { recursive: true, force: true });
}
