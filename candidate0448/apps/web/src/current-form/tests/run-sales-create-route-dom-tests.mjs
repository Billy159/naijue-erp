import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)), temp = await mkdtemp(path.join(here, '.dom-tmp-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLIFrameElement', 'Element', 'SVGElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'getComputedStyle']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window); globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); dom.window.HTMLElement.prototype.scrollIntoView = () => {};
// Same native-dialog method shim as the repository current-form DOM harness; not native-browser acceptance.
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
let root;
try {
  const output = path.join(temp, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'sales-create-route-entry.tsx')], outfile: output, bundle: true, platform: 'node', format: 'esm', external: ['react', 'react/*', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { act, createElement, createRoot, ReadContext, prepareSalesCommandSession, prepareSalesRoute, draft, result, DemoFrame, currentBusinessDate } = await import(pathToFileURL(output).href);
  const host = document.getElementById('root'); root = createRoot(host);
  const inFrame = view => createElement(DemoFrame, { navigation: { sales: { selected: true, onActivate() {} } }, breadcrumb: [{id:'sales-management',label:'销售管理'},{id:'sales',label:'销货单列表'}] }, view);
  const nav = label => Array.from(host.querySelectorAll('.sidebar a')).find(el => el.textContent === label);
  const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const original = draft(), native = { header: { ...original.header, businessType: 'SALE', salespersonId: uuid(25), grossAmount: '1000', netDue: '1000', orderDiscount: '0' }, lines: [{ ...original.lines[0], quantity: '1', referencePrice: '1005', dealPrice: '1000', lineAmount: '1000', allocatedDiscount: '0' }], settlements: [{ ...original.settlements[0], direction: 'RECEIVE', amount: '1000' }] };
  const product = { id: uuid(50), code: 'TEST', name: 'TEST product', retailPrice: '10.05', minimumPriceAvailability: 'UNAVAILABLE', sizeGroupId: uuid(8) };
  const sku = { id: native.lines[0].skuId, skuCode: 'TEST-SKU', productId: product.id, productCode: 'TEST', productName: 'TEST product', colorId: uuid(5), colorName: 'TEST red', fitId: uuid(6), fitName: 'TEST fit', sizeId: uuid(7), sizeName: '165/S', sizeGroupId: uuid(8), barcodeAvailability: 'UNAVAILABLE' };
  const ref = (id, name, more = {}) => ({ id, name, code: null, hallId: null, hallName: null, paymentMethodId: null, paymentMethodName: null, ...more });
  const calls = []; let styles = 0, keys = 0, mode = 'success', candidateGate = null;
  const holdCandidate = kind => {
    assert.equal(candidateGate, null); let release;
    const promise = new Promise(resolve => { release = resolve; });
    const gate = { kind, promise, release, signal: null }; candidateGate = gate; return gate;
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const http = { origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, body });
    if (url.endsWith('/dictionary-read/size-groups/query')) return json({page:body.page,pageSize:body.pageSize,total:1,items:[{id:uuid(8),name:'TEST sizes',sizes:[{id:uuid(7),name:'165/S',displayOrder:1},{id:uuid(9),name:'170/M',displayOrder:2}]}]});
    if (url.endsWith('/catalogue-settings-read/fits/query')) return json({page:body.page,pageSize:body.pageSize,total:1,items:[{id:uuid(6),code:'TEST',name:'TEST fit',enabled:true,version:1}]});
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
      else if (body.kind === 'salesperson') items = [ref(h.salespersonId, 'TEST salesperson')];
      else if (body.kind === 'customer') items = [ref(h.customerId, 'TEST customer', { code: 'TEST-C' })];
      else if (body.kind === 'warehouse') items = [ref(h.warehouseId, 'TEST warehouse', { hallId: h.hallId, hallName: 'TEST hall' })];
      else if (body.kind === 'paymentMethod') items = [ref(s.paymentMethodId, 'TEST method')];
      else if (body.kind === 'paymentAccount') { assert.equal(body.paymentMethodId, s.paymentMethodId); items = [ref(s.paymentAccountId, 'TEST account', { paymentMethodId: s.paymentMethodId, paymentMethodName: 'TEST method' })]; }
      else assert.fail(`Unexpected kind ${body.kind}`);
    } else if (url.endsWith('/products/query')) items = [product];
    else if (url.endsWith('/product-skus/query')) items = [sku, { ...sku, id: uuid(777), skuCode: 'TEST-SECOND', sizeId: uuid(9), sizeName: '170/M' }];
    else assert.fail(`Unexpected request ${url}`);
    const candidateKind = url.endsWith('/product-skus/query') ? 'sku' : body.kind;
    if (candidateGate && candidateGate.kind === candidateKind) {
      const gate = candidateGate; candidateGate = null; gate.signal = init.signal;
      // Intentionally ignore abort until released: cancellation must suppress late UI resurrection.
      if (await gate.promise === 'error') return json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'SYNTHETIC candidate failure' } }, 503);
    }
    return json({ page: body.page, pageSize: 20, exactTotal: String(items.length), items, ...(body.kind === 'paymentAccount' ? { recommendationAvailability: 'UNAVAILABLE' } : {}) });
  } };
  const context = new ReadContext({ accountId: uuid(99), sessionRevision: 'test', permissionRevision: 'test' }), scope = context.createScope('app-session');
  const input = { scope, http, principal: { accountId: uuid(99), staffId: uuid(98), loginName: 'TEST', role: 'ADMIN', hallId: null, authVersion: 1 }, configuration: { sales: { stylesheet: { async load() {}, dispose() {} }, detailStylesheet: { async load() { styles++; }, dispose() {} }, commands: { newRequestKey: () => `TEST.sale:${++keys}`, manualCreate: true } } } };
  let access = 0; const session = prepareSalesCommandSession(input, () => { access++; context.clear(); }), route = session.prepare(input);
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  const select = label => host.querySelector('[role="combobox"][aria-label="' + label + '"]');
  const button = label => [...host.querySelectorAll('button')].find(el => el.textContent.trim() === label && !el.closest('[hidden]'));
  const until = async (test, label) => { for (let i = 0; i < 100 && !test(); i++) await settle(); assert.ok(test(), label + ' DOM=' + host.textContent.slice(-5000)); };
  const click = async el => { assert.ok(el); assert.equal(Boolean(el.disabled), false, el.textContent); await act(async () => { el.focus(); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await settle(); };
  const change = async (el, value) => { assert.ok(el); assert.equal(el.disabled,false,'do not simulate disabled input'); await act(async () => { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }); };
  const option = (trigger, name) => [...trigger.closest('.ui-single-host').querySelectorAll('[role=option]')].find(el => el.textContent.trim() === name);
  const addProduct = async (value,quantity) => {
    await click(host.querySelector('.sale-entry-row .sale-product-input'));await until(()=>host.querySelector('[data-finder-option]'),'product candidate');await click(host.querySelector('[data-finder-option]'));
    for(const [part,name] of [['color','TEST red'],['fit','TEST fit'],['size','165/S']]){
      await click(host.querySelector(`[data-entry-control$="-${part}"]`));await until(()=>[...host.querySelectorAll('[data-candidate-option]')].some(el=>el.textContent.trim().replace(/✓$/,'')===name),part+' candidate');await click([...host.querySelectorAll('[data-candidate-option]')].find(el=>el.textContent.trim().replace(/✓$/,'')===name));
    }
    const price=host.querySelector('[data-entry-field=price]');await change(host.querySelector('[data-entry-field=quantity]'),quantity);await change(price,value);await act(async()=>price.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));await settle();
  };
  const fill = async () => {
    for (const [label,name] of [['选择营业厅','TEST hall'],['选择营业员','TEST salesperson'],['选择客户','TEST customer'],['选择出库仓','TEST warehouse']]) {
      const trigger=select(label); await click(trigger); await until(()=>option(trigger,name),label+' exact option'); await click(option(trigger,name));
    }
    await addProduct('10.00','1');
    await change(host.querySelector('[aria-label="单据日期"]'),native.header.businessDate);await change(host.querySelector('[aria-label="备注"]'),native.header.note);
    for(const [label,name] of [['付款方式 1','TEST method'],['资金账户 1','TEST account']]){const trigger=select(label);await click(trigger);await until(()=>option(trigger,name),label+' exact option');await click(option(trigger,name));}
    await change(host.querySelector('[aria-label="第1笔收款金额"]'),'10.00');
  };
  await act(async () => root.render(inFrame(createElement(route.View, { scope: context.createScope('route') })))); await settle(); assert.equal(styles, 0); assert.deepEqual(calls, [{ url: 'https://synthetic.test/api/sales/query', body: { page: 1, pageSize: 20, filter: { startDate: null, endDate: null, statuses: [], businessTypes: [], hallIds: [], salespersonIds: [], customerIds: [], warehouseIds: [], number: null } } }]);
  assert.equal(calls.filter(call => /\/(?:prepare-create|commands)$|\/current-form\//.test(call.url)).length, 0);
  await click(nav('新增销货单')); await until(() => select('选择营业厅'), 'actual SALE NEW route'); assert.equal(styles, 1);
  assert.equal(Array.from(host.querySelectorAll('[aria-label="当前页面路径"] .arco-breadcrumb-item')).map(item=>item.textContent).join(' / '), '销售管理 / 新增销货单'); assert.equal(host.querySelector('.sidebar [aria-current=page]').textContent, '新增销货单');
  const hallTrigger = select('选择营业厅'); await act(async()=>hallTrigger.focus());
  await click(hallTrigger);
  assert.deepEqual(calls.at(-1),{url:'https://synthetic.test/api/current-form/sales-references/query',body:{kind:'hall',hallId:null,search:'',page:1,pageSize:20}});
  assert.equal(host.querySelector('.arco-modal.sales-proposal-picker'), null, 'current reference uses inline Arco Select, not removed modal');
  assert.equal(hallTrigger.getAttribute('aria-expanded'), 'true');
  assert.ok(hallTrigger.contains(document.activeElement), 'inline select retains focus in its actual input');
  const focusedHallInput=document.activeElement;
  await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  await settle();
  assert.equal(host.querySelector('[role="dialog"][aria-label="当前候选"]'), null);
  assert.equal(hallTrigger.getAttribute('aria-expanded'), 'false');
  assert.ok(hallTrigger.contains(document.activeElement), 'Escape retains original select input focus: '+JSON.stringify({activeTag:document.activeElement.tagName,activeLabel:document.activeElement.getAttribute('aria-label'),inputConnected:focusedHallInput.isConnected,inputSame:hallTrigger.querySelector('input')===focusedHallInput,connected:hallTrigger.isConnected,triggerExpanded:hallTrigger.getAttribute('aria-expanded')}));
  await fill(); assert.equal(session.canLeave(), false);
  // Current UI separates method/account references and product/specification
  // popups. Preserve cancellation/retry/focus/no-mutation checks per real owner.
  for (const kind of ['paymentAccount','sku']) {
    const beforeLines=host.querySelectorAll('[data-proposal-quantity]').length,beforeSettlements=host.querySelectorAll('.sale-payment-row').length;
    if(kind==='sku')await click(host.querySelector('[aria-label="修改尺码 TEST-SKU"]'));
    const trigger=kind==='sku'?host.querySelector('[data-entry-control$="-size"]'):select('资金账户 1');
    const owner=kind==='sku'?host:trigger.closest('.ui-single-host');
    const popup=()=>kind==='sku'?host.querySelector('[role=dialog][aria-label="尺码候选"]'):owner.querySelector('.arco-select-popup');
    const expected=()=>kind==='sku'?[...host.querySelectorAll('[data-candidate-option]')].find(el=>el.textContent.trim().replace(/✓$/,'')==='165/S'):option(trigger,'TEST account');
    const assertFocus=()=>{assert.ok(popup(),'current owner popup');assert.ok((kind==='sku'?popup():owner).contains(document.activeElement),'focus within current owner, not BODY');};
    const escape=async()=>{assertFocus();await act(async()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));await until(()=>!popup(),kind+' popup unmounted after Escape');assert.ok(kind==='sku'?document.activeElement===trigger:trigger.contains(document.activeElement),'Escape restores live trigger/input');};
    const begin=async()=>{const gate=holdCandidate(kind);await click(trigger);assert.ok(gate.signal);assertFocus();return gate;};
    const cancelled=await begin();await escape();assert.equal(cancelled.signal.aborted,true);await act(async()=>cancelled.release('ready'));await settle();assert.equal(popup()===null,true,'popup remains absent');
    const ready=await begin();await act(async()=>ready.release('ready'));await until(expected,kind+' ready');assertFocus();
    if(kind==='paymentAccount'){const search=trigger.querySelector('input');await act(async()=>search.focus());await change(search,'TEST');assert.equal(document.activeElement,search,'search refresh retains surviving input');}
    await escape();
    const failed=await begin();await act(async()=>failed.release('error'));await until(()=>[...owner.querySelectorAll('button')].find(el=>el.textContent==='重试'),kind+' retry control');assertFocus();
    const retry=[...owner.querySelectorAll('button')].find(el=>el.textContent==='重试');await act(async()=>retry.focus());const retried=holdCandidate(kind);await click(retry);assert.equal(retry.isConnected,false);assertFocus();
    await act(async()=>retried.release('ready'));await until(expected,kind+' retried ready');assertFocus();await escape();
    if(kind==='sku')await click(button('取消'));
    assert.equal(host.querySelectorAll('[data-proposal-quantity]').length,beforeLines,'cancel does not add a native line');assert.equal(host.querySelectorAll('.sale-payment-row').length,beforeSettlements,'cancel does not add settlement');
    assert.equal(host.querySelector('[aria-label="TEST-SKU 单价"]').value,'10.00');
  }
  console.log('PASS current inline account/spec popups: pending abort, late no-resurrection, repeated opens, error/retry and owner focus, unchanged line/payment intent.');
  await click(nav('新增销货单')); assert.equal(host.querySelector('[aria-label="TEST-SKU 单价"]').value, '10.00');
  await click(nav('销货单列表')); assert.ok(host.querySelector('.sales-proposal-editor')); assert.match(host.textContent, /有未保存的修改/);assert.equal(calls.filter(call=>/\/(?:prepare-create|commands)$/.test(call.url)).length,0,'dirty navigation never prepares or saves');await click(button('继续录单'));assert.equal(host.querySelector('dialog[open]'),null);
  mode = 'proof-missing'; await click(button('保存')); assert.equal(calls.filter(call => call.url.endsWith('/sales/commands')).length, 0); assert.match(host.textContent, /九价完整性/); assert.equal(host.querySelector('[aria-label="TEST-SKU 单价"]').value, '10.00');
  mode = 'success'; await click(button('保存')); await until(() => session.workspace.getSnapshot().command.write.phase === 'committed', 'native SALE SAVE committed');
  assert.equal(calls.filter(call => call.url.endsWith('/sales/commands')).length, 1); assert.ok(host.querySelector('.sales-command-editor')); assert.match(host.textContent, /原操作已确认/); assert.equal(host.querySelector('.sales-command-editor h1').textContent,'查看销货单'); assert.equal(host.querySelector('.sale-number-value').textContent,'已保存，待读取单号');
  await act(async () => root.render(null)); const revisited = session.prepare(input);
  await act(async () => root.render(inFrame(createElement(revisited.View, { scope: context.createScope('revisited') })))); await until(() => button('返回列表'), 'retained native editor after route detour');
  await click(nav('销货单列表')); assert.equal(Array.from(host.querySelectorAll('[aria-label="当前页面路径"] .arco-breadcrumb-item')).map(item=>item.textContent).join(' / '), '销售管理 / 销货单列表');
  await click(nav('新增销货单')); await until(() => select('选择营业厅'), 'clean next SALE NEW'); assert.equal(host.querySelector('[aria-label="单据日期"]').value, currentBusinessDate());
  const selectValue = async (el, value) => {
    assert.ok(el); await click(el);
    const label = { RETURN_EXCHANGE: '退货/换货', REFUND: '退款' }[value];
    const container = el.closest('.ui-single-host');
    await until(() => [...container.querySelectorAll('[role="option"]')].some(item => item.textContent.trim() === label), `Arco option ${label}`);
    await click([...container.querySelectorAll('[role="option"]')].find(item => item.textContent.trim() === label));
  };
  for (const businessType of ['RETURN', 'EXCHANGE']) {
    await fill(); await selectValue(host.querySelector('[aria-label="业务类型"]'), 'RETURN_EXCHANGE');assert.ok(host.querySelector('[role=dialog][aria-label="切换业务类型"],dialog[aria-label="切换业务类型"]'));await click(button('确定'));assert.equal(host.querySelector('[aria-label="整单优惠"]'),null,'return/exchange has no editable order adjustment');assert.equal(host.querySelectorAll('.sale-payment-row').length,1,'mode reset shows one empty funds placeholder');
    await change(host.querySelector('[aria-label="TEST-SKU 数量"]'), '-2'); for(const [label,name] of [['付款方式 1','TEST method'],['资金账户 1','TEST account']]){const trigger=select(label);await click(trigger);await click(option(trigger,name));}await change(host.querySelector('[aria-label="第1笔收款金额"]'),'-20.00');
    native.header.businessType = businessType; native.lines[0].quantity = '-2'; native.lines[0].lineAmount = '-2000'; native.header.grossAmount = '-2000'; native.header.netDue = '-2000'; native.settlements[0].direction = 'REFUND';native.settlements[0].amount='2000';
    if (businessType === 'EXCHANGE') {
      await addProduct('8.00','1');await addProduct('10.00','1');
      await click(host.querySelectorAll('[aria-label="删除 TEST-SKU"]')[2]); assert.equal(host.querySelectorAll('[aria-label="TEST-SKU 数量"]').length, 2); assert.equal(host.querySelectorAll('[aria-label="TEST-SKU 数量"]')[0].value, '-2'); assert.equal(host.querySelectorAll('[aria-label="TEST-SKU 单价"]')[1].value, '8.00');
      native.lines.push({ ...native.lines[0], id: uuid(778), lineNo: 2, quantity: '1', dealPrice: '800', lineAmount: '800' }); native.header.grossAmount = '-1200'; native.header.netDue = '-1200';native.settlements[0].amount='1200';await change(host.querySelector('[aria-label="第1笔收款金额"]'),'-12.00');
    }
    await click(button('保存')); await until(() => session.workspace.getSnapshot().command.write.phase === 'committed', businessType + ' actual route committed');
    await click(button('返回列表')); await click(button('新增销货单')); await until(() => select('选择营业厅'), businessType + ' clean reopen');
  }
  native.header.businessType = 'SALE'; native.lines.splice(1); native.lines[0].quantity = '1'; native.lines[0].lineAmount = '1000'; native.header.grossAmount = '1000'; native.header.netDue = '1000'; native.settlements[0].direction = 'RECEIVE';native.settlements[0].amount='1000';
  await fill(); mode = 'forbidden'; await click(button('保存')); await until(() => access === 1, 'preparation403 invokes existing application invalidation'); assert.equal(session.workspace.getSnapshot().command.disposed, true); assert.equal(calls.filter(call => call.url.endsWith('/sales/commands')).length, 3);
  await act(async () => root.unmount()); root = createRoot(host);
  const readonlyContext = new ReadContext({ accountId: uuid(99), sessionRevision: 'new', permissionRevision: 'new' });
  const readonly = prepareSalesRoute({ ...input, configuration: { sales: { ...input.configuration.sales, commands: undefined } } });
  await act(async () => root.render(inFrame(createElement(readonly.View, { scope: readonlyContext.createScope('readonly') })))); await settle(); assert.equal(button('新增销货单').disabled, true); assert.equal(nav('新增销货单'), undefined);
  assert.ok(calls.every(call=>!('actor' in call.body)),'no client actor authority');
  console.log('PASS actual SALE/RETURN/EXCHANGE route: opt-in NEW, native references/account intent, missing-proof rejection retaining input, explicit retry→prepare→SAVE, clean reopen,403 cleanup and default read-only guard.');
  await act(async () => root.unmount()); root = null; readonlyContext.clear();
} finally { if (root) root.unmount(); dom.window.close(); await rm(temp, { recursive: true, force: true }); }
