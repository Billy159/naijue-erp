import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)), temp = await mkdtemp(path.join(here, '.dom-tmp-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element', 'SVGElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'getComputedStyle']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window); globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); dom.window.HTMLElement.prototype.scrollIntoView = () => {};
let root;
try {
  const output = path.join(temp, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'sales-create-route-entry.tsx')], outfile: output, bundle: true, platform: 'node', format: 'esm', external: ['react', 'react/*', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { act, createElement, createRoot, ReadContext, prepareSalesCommandSession, prepareSalesRoute, draft, result } = await import(pathToFileURL(output).href);
  const host = document.getElementById('root'); root = createRoot(host);
  const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const original = draft(), native = { header: { ...original.header, businessType: 'SALE', grossAmount: '1000', netDue: '1000', orderDiscount: '0' }, lines: [{ ...original.lines[0], quantity: '1', referencePrice: '1005', dealPrice: '1000', lineAmount: '1000', allocatedDiscount: '0' }], settlements: [{ ...original.settlements[0], direction: 'RECEIVE', amount: '1000' }] };
  const product = { id: uuid(50), code: 'TEST', name: 'TEST product', retailPrice: '10.05', minimumPriceAvailability: 'UNAVAILABLE' };
  const sku = { id: native.lines[0].skuId, skuCode: 'TEST-SKU', productId: product.id, productCode: 'TEST', productName: 'TEST product', colorId: uuid(5), colorName: 'TEST red', fitId: uuid(6), fitName: 'TEST fit', sizeId: uuid(7), sizeName: '165/S', sizeGroupId: uuid(8), barcodeAvailability: 'UNAVAILABLE' };
  const ref = (id, name, more = {}) => ({ id, name, code: null, hallId: null, hallName: null, paymentMethodId: null, paymentMethodName: null, ...more });
  const calls = []; let styles = 0, keys = 0, mode = 'success';
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const http = { origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, body });
    if (url.endsWith('/sales/query')) return json({ page: body.page, pageSize: body.pageSize, exactTotal: '0', items: [] });
    if (url.endsWith('/sales/prepare-create')) {
      if (mode === 'proof-missing') return json({ error: { code: 'NATIVE_CATALOGUE_FACTS_UNAVAILABLE', message: 'SYNTHETIC missing proof' } }, 409);
      if (mode === 'forbidden') return json({ error: { code: 'FORBIDDEN', message: 'SYNTHETIC' } }, 403);
      assert.equal(body.businessType, native.header.businessType); assert.equal(body.hallId, native.header.hallId); assert.equal(body.lines[0].dealPrice, '10.00'); assert.equal(body.lines[0].discountTenths, null);
      assert.equal(body.settlements[0].paymentMethodId, native.settlements[0].paymentMethodId); assert.equal('snapshot' in body.lines[0], false); return json(native);
    }
    if (url.endsWith('/sales/commands')) { assert.equal(body.action, 'SAVE'); assert.equal(body.expectedVersion, null); return json(result(body)); }
    let items;
    if (url.endsWith('/sales-references/query')) {
      const h = native.header, s = native.settlements[0];
      if (body.kind === 'hall') items = [ref(h.hallId, 'TEST hall', { hallId: h.hallId, hallName: 'TEST hall' })];
      else if (body.kind === 'customer') items = [ref(h.customerId, 'TEST customer', { code: 'TEST-C' })];
      else if (body.kind === 'warehouse') items = [ref(h.warehouseId, 'TEST warehouse', { hallId: h.hallId, hallName: 'TEST hall' })];
      else if (body.kind === 'paymentMethod') items = [ref(s.paymentMethodId, 'TEST method')];
      else if (body.kind === 'paymentAccount') { assert.equal(body.paymentMethodId, s.paymentMethodId); items = [ref(s.paymentAccountId, 'TEST account', { paymentMethodId: s.paymentMethodId, paymentMethodName: 'TEST method' })]; }
      else assert.fail(`Unexpected kind ${body.kind}`);
    } else if (url.endsWith('/products/query')) items = [product];
    else if (url.endsWith('/product-skus/query')) items = [sku, { ...sku, id: uuid(777), skuCode: 'TEST-SECOND', sizeName: '170/M' }];
    else assert.fail(`Unexpected request ${url}`);
    return json({ page: body.page, pageSize: 20, exactTotal: String(items.length), items, ...(body.kind === 'paymentAccount' ? { recommendationAvailability: 'UNAVAILABLE' } : {}) });
  } };
  const context = new ReadContext({ accountId: uuid(99), sessionRevision: 'test', permissionRevision: 'test' }), scope = context.createScope('app-session');
  const input = { scope, http, principal: { accountId: uuid(99), staffId: uuid(98), loginName: 'TEST', role: 'ADMIN', hallId: null, authVersion: 1 }, configuration: { sales: { stylesheet: { async load() {}, dispose() {} }, detailStylesheet: { async load() { styles++; }, dispose() {} }, commands: { newRequestKey: () => `TEST.sale:${++keys}`, manualCreate: true } } } };
  let access = 0; const session = prepareSalesCommandSession(input, () => { access++; context.clear(); }), route = session.prepare(input);
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  const button = label => [...host.querySelectorAll('button')].find(el => el.textContent.trim() === label && !el.closest('[hidden]'));
  const until = async (test, label) => { for (let i = 0; i < 100 && !test(); i++) await settle(); assert.ok(test(), label); };
  const click = async el => { assert.ok(el); assert.equal(el.disabled, false, el.textContent); await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))); await settle(); };
  const change = async (el, value) => { assert.ok(el); await act(async () => { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }); };
  const fill = async () => {
    await click(button('选择营业厅')); await click(button('TEST hall')); await click(button('选择客户')); await click(button('TEST customer')); await click(button('选择仓库')); await click(button('TEST warehouse'));
    await click(button('添加商品规格')); await click(button('TEST product')); await click(button('TEST · TEST red · TEST fit · 165/S')); await click(button('关闭候选'));
    await change(host.querySelector('[aria-label="单据日期"]'), native.header.businessDate); await change(host.querySelector('[aria-label="备注"]'), native.header.note); await change(host.querySelector('[aria-label="TEST-SKU 单价"]'), '10.00');
    await click(button('添加收退明细')); await click(button('TEST method')); await click(button('TEST account')); await change(host.querySelector('[aria-label="收退金额 1"]'), '10.00');
  };
  await act(async () => root.render(createElement(route.View, { scope: context.createScope('route') }))); await settle(); assert.equal(styles, 0); assert.equal(calls.length, 0);
  await click(button('新增销货单')); await until(() => button('选择营业厅'), 'actual SALE NEW route'); assert.equal(styles, 1); await fill(); assert.equal(session.canLeave(), false);
  mode = 'proof-missing'; await click(button('保存')); assert.equal(calls.filter(call => call.url.endsWith('/sales/commands')).length, 0); assert.match(host.textContent, /九价完整性/); assert.equal(host.querySelector('[aria-label="TEST-SKU 单价"]').value, '10.00');
  mode = 'success'; await click(button('保存')); await until(() => session.workspace.getSnapshot().command.write.phase === 'committed', 'native SALE SAVE committed');
  assert.equal(calls.filter(call => call.url.endsWith('/sales/commands')).length, 1); assert.ok(host.querySelector('.sales-command-editor')); assert.match(host.textContent, /原操作已确认/);
  await act(async () => root.render(null)); const revisited = session.prepare(input);
  await act(async () => root.render(createElement(revisited.View, { scope: context.createScope('revisited') }))); await until(() => button('返回列表'), 'retained native editor after route detour');
  await click(button('返回列表')); await click(button('新增销货单')); await until(() => button('选择营业厅'), 'clean next SALE NEW'); assert.equal(host.querySelector('[aria-label="单据日期"]').value, '');
  const select = async (el, value) => { assert.ok(el); await act(async () => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); }); await settle(); };
  for (const businessType of ['RETURN', 'EXCHANGE']) {
    await fill(); await select(host.querySelector('[aria-label="业务类型"]'), businessType); assert.equal(host.querySelector('[aria-label="整单优惠"]').readOnly, true);
    await change(host.querySelector('[aria-label="TEST-SKU 数量"]'), '-2'); await select(host.querySelector('[aria-label="收退方向 1"]'), 'REFUND');
    native.header.businessType = businessType; native.lines[0].quantity = '-2'; native.lines[0].lineAmount = '-2000'; native.header.grossAmount = '-2000'; native.header.netDue = '-2000'; native.settlements[0].direction = 'REFUND';
    if (businessType === 'EXCHANGE') {
      await click(button('添加商品规格')); await click(button('TEST product')); await click(button('TEST · TEST red · TEST fit · 165/S')); await click(button('关闭候选')); await change(host.querySelectorAll('[aria-label="TEST-SKU 单价"]')[1], '8.00');
      await click(button('添加商品规格')); await click(button('TEST product')); await click(button('TEST · TEST red · TEST fit · 165/S')); await click(button('关闭候选'));
      await click(host.querySelectorAll('[aria-label="删除 TEST-SKU"]')[2]); assert.equal(host.querySelectorAll('[aria-label="TEST-SKU 数量"]').length, 2); assert.equal(host.querySelectorAll('[aria-label="TEST-SKU 数量"]')[0].value, '-2'); assert.equal(host.querySelectorAll('[aria-label="TEST-SKU 单价"]')[1].value, '8.00');
      native.lines.push({ ...native.lines[0], id: uuid(778), lineNo: 2, quantity: '1', dealPrice: '800', lineAmount: '800' }); native.header.grossAmount = '-1200'; native.header.netDue = '-1200';
    }
    await click(button('保存')); await until(() => session.workspace.getSnapshot().command.write.phase === 'committed', businessType + ' actual route committed');
    await click(button('返回列表')); await click(button('新增销货单')); await until(() => button('选择营业厅'), businessType + ' clean reopen');
  }
  native.header.businessType = 'SALE'; native.lines.splice(1); native.lines[0].quantity = '1'; native.lines[0].lineAmount = '1000'; native.header.grossAmount = '1000'; native.header.netDue = '1000'; native.settlements[0].direction = 'RECEIVE';
  await fill(); mode = 'forbidden'; await click(button('保存')); await until(() => access === 1, 'preparation403 invokes existing application invalidation'); assert.equal(session.workspace.getSnapshot().command.disposed, true); assert.equal(calls.filter(call => call.url.endsWith('/sales/commands')).length, 3);
  await act(async () => root.unmount()); root = createRoot(host);
  const readonlyContext = new ReadContext({ accountId: uuid(99), sessionRevision: 'new', permissionRevision: 'new' });
  const readonly = prepareSalesRoute({ ...input, configuration: { sales: { ...input.configuration.sales, commands: undefined } } });
  await act(async () => root.render(createElement(readonly.View, { scope: readonlyContext.createScope('readonly') }))); await settle(); assert.equal(button('新增销货单').disabled, true);
  console.log('PASS actual SALE/RETURN/EXCHANGE route: opt-in NEW, native references/account intent, missing-proof rejection retaining input, explicit retry→prepare→SAVE, clean reopen,403 cleanup and default read-only guard.');
  await act(async () => root.unmount()); root = null; readonlyContext.clear();
} finally { if (root) root.unmount(); dom.window.close(); await rm(temp, { recursive: true, force: true }); }
