/** Actual Application + existing reader/controllers, explicit synthetic transport.
 * Deliberately abort-ignoring delayed responses exercise the public UI boundary. */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),temporary=await mkdtemp(path.join(here,'.stores-dom-'));
const dom=new JSDOM('<!doctype html><style data-unified-harness-style data-management-harness-style data-harness-style></style><div id="root"></div>',{url:'https://synthetic-management.invalid/',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
dom.window.matchMedia=query=>({matches:false,media:query,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}});
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};dom.window.ResizeObserver=globalThis.ResizeObserver;dom.window.HTMLElement.prototype.scrollIntoView=()=>{};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const originalFetch=globalThis.fetch;let network=0;globalThis.fetch=async()=>{network++;throw new Error('Real network forbidden');};
let harness,act;
try{
 const output=path.join(temporary,'entry.mjs');await build({entryPoints:[path.join(here,'application-entry.tsx')],outfile:output,bundle:true,platform:'node',format:'esm',external:['react','react/*','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},jsx:'automatic',loader:{'.css':'empty'},logLevel:'warning'});
 const module=await import(pathToFileURL(output).href);({act}=module);const root=document.getElementById('root');
 const settle=async(ms=20)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});
 const until=async(test,label)=>{for(let i=0;i<150;i++){if(test())return;await settle();}assert.ok(test(),`Timed out: ${label}; ${root.textContent.slice(-1000)}`);};
 const button=text=>[...root.querySelectorAll('button,[role=tab]')].find(el=>el.textContent.trim()===text&&!el.closest('[hidden]'));
 const nav=text=>[...root.querySelectorAll('a.nav')].find(el=>el.textContent.trim()===text);
 const click=async el=>{assert.ok(el,'Expected control');assert.ok(!el.disabled,'Expected enabled control');await act(async()=>{el.focus?.();el.click();});await settle();};
 const change=async(el,value)=>{assert.ok(el,'Expected Arco input');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});await settle();};
 const submit=async()=>{const form=root.querySelector('.store-settings-workbench form');assert.ok(form);await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await settle();};
 const rows=()=>root.querySelectorAll('.store-settings-workbench tbody tr');
 const count=target=>harness.transport.calls().filter(call=>call.path===target).length;
 const detail=()=>root.querySelector('.arco-modal.erp-store-settings-modal');
 const firstView=()=>root.querySelector('button[aria-label^="查看营业厅："],button[aria-label^="查看仓库："]');
 const esc=async()=>{await act(async()=>detail().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));await settle(40);};
 await act(async()=>{harness=module.mountUnifiedHarness(root);});await settle();assert.equal(harness.transport.calls().length,0);
 await act(async()=>harness.enter());assert.equal(count('/store-settings-read/stores/query'),0);
 const controller=harness.app.controller,principal=controller.authentication.getSnapshot().principal;
 await click(nav('营业厅与仓库'));await until(()=>rows().length===20&&root.textContent.includes('共 37 条'),'initial real store reader');
 assert.equal(controller.getSnapshot().route,'store-settings');assert.equal(controller.authentication.getSnapshot().principal,principal);assert.equal(root.querySelectorAll('.demo-frame').length,1);assert.equal(root.querySelectorAll('iframe').length,0);
 assert.equal(count('/store-settings-read/stores/query'),1);assert.equal(count('/store-settings-read/stores/detail/query'),0);
 for(const text of ['新增营业厅','操作记录','编辑'])assert.ok(button(text).disabled,'Unavailable writes/history stay disabled');
 assert.ok(root.querySelector('input[aria-label="搜索营业厅名称"]').classList.contains('arco-input'));assert.ok(root.querySelector('.arco-table'));
 console.log('PASS stores 1: inert construction, one actual Application/identity/route, first bounded 20/37 read, actual Arco inputs/table, unavailable writes disabled.');

 for(const method of ['Escape','close','cancel']){
  const opener=firstView(),before=count('/store-settings-read/stores/detail/query');await click(opener);await until(()=>detail()?.querySelector('[aria-label="默认出库仓"]'),'exact store detail');
  assert.equal(count('/store-settings-read/stores/detail/query'),before+1);assert.equal(root.querySelectorAll('dialog').length,0);
  assert.equal(detail().querySelector('[aria-label="默认出库仓"]').value,'名称未提供');assert.equal(detail().querySelector('[aria-label="默认零售客户"]').value,'未配置');
  assert.match(detail().textContent,/创建时间未提供/);assert.ok(detail().querySelector('.arco-switch').disabled);assert.ok(button('确定').disabled);
  assert.ok(document.activeElement===detail().querySelector('[data-erp-overlay-close]'),'Initial focus actual close button');
  if(method==='Escape')await esc();else await click(method==='close'?detail().querySelector('[data-erp-overlay-close]'):button('取消'));
  await until(()=>!detail(),'closed detail');assert.ok(document.activeElement===opener,'Exact original row focus restored');
 }
 await click(firstView());await until(()=>detail(),'mask test');const mask=root.querySelector('.erp-overlay-anchor .arco-modal-mask');await click(mask);assert.ok(detail(),'Frozen readonly dialog keeps mask nonclosable');await esc();
 const next=root.querySelector('[aria-label="下一页"]');await click(next);await until(()=>rows().length===17,'second bounded page');assert.match(root.textContent,/当前第 21–37 条/);
 await change(root.querySelector('[aria-label="搜索营业厅名称"]'),'NO_MATCH_SYNTHETIC');assert.match(root.textContent,/上次成功读取/);await submit();await until(()=>root.textContent.includes('暂无符合条件的数据'),'genuine empty');assert.match(root.textContent,/共 0 条/);
 await click(button('重置'));await until(()=>rows().length===20&&root.textContent.includes('共 37 条'),'reset');
 console.log('PASS stores 2: exact fresh detail reads, missing facts remain unknown, Arco Modal Esc/close/cancel restore exact row, nonclosable mask, pagination/search/empty/reset.');

 await click(button('仓库'));await until(()=>rows().length===20&&root.textContent.includes('共 23 条'),'warehouse tab');assert.equal(controller.getSnapshot().route,'store-settings');assert.equal(count('/store-settings-read/warehouses/query'),1);
 await click(firstView());await until(()=>detail()?.querySelector('[aria-label="所属营业厅"]'),'warehouse exact detail');assert.equal(detail().querySelector('[aria-label="所属营业厅"]').value,'名称未提供');assert.match(detail().textContent,/未提供完整库存与引用检查/);assert.equal(count('/store-settings-read/warehouses/detail/query'),1);await esc();
 const hall=root.querySelector('[aria-label="所属营业厅"]');await click(hall);await until(()=>root.querySelectorAll('.arco-select-option').length===21,'hall directory bounded first page');assert.match(root.textContent,/目录共43个，第1页/);
 await click(button('下一页'));await until(()=>root.textContent.includes('目录共43个，第2页'),'hall directory second page');
 const option=[...root.querySelectorAll('.arco-select-option')].find(el=>el.textContent.includes('合成营业厅 21（非正式）'));assert.ok(option);await click(option);await submit();await until(()=>root.textContent.includes('共 1 条'),'warehouse hall filter');assert.ok(firstView().textContent.includes('合成仓库 21（非正式）'));await click(button('重置'));await until(()=>root.textContent.includes('共 23 条'),'warehouse reset');
 console.log('PASS stores 3: same-route warehouse tab, exact warehouse detail, explicit paged stores-directory read and hall filter; no transaction candidate or write fallback.');

 harness.transport.setNextReadFailure('unavailable');await submit();await until(()=>root.textContent.includes('资料尚未准备好'),'503');assert.match(root.textContent,/上次成功读取/);assert.ok(firstView().disabled);await click(button('重试'));await until(()=>firstView()&&!firstView().disabled,'503 retry');
 harness.transport.setNextReadDelay(180);harness.transport.setNextReadFailure('forbidden');await submit();await click(button('取消本次读取'));await submit();await until(()=>firstView()&&!firstView().disabled,'newer query after cancel');await settle(220);assert.equal(controller.getSnapshot().phase,'ready');assert.equal(controller.authentication.getSnapshot().principal,principal,'Late cancelled 403 cannot clear current identity');
 harness.transport.setNextReadDelay(180);await submit();await click(button('营业厅'));await until(()=>root.textContent.includes('共 37 条'),'tab replacement');await settle(220);assert.equal(root.querySelector('[aria-label="搜索仓库名称"]'),null);assert.match(root.textContent,/共 37 条/);
 harness.transport.setNextReadDelay(180);await click(firstView());await until(()=>detail(),'pending detail');await esc();await click(nav('商品信息'));await settle(220);assert.ok(!detail(),'Closed late detail cannot revive after navigation');
 await click(nav('营业厅与仓库'));await until(()=>firstView()&&!firstView().disabled,'fresh route');harness.transport.setNextReadFailure('forbidden');await click(firstView());await until(()=>controller.getSnapshot().phase==='error','current detail 403');assert.ok(!root.querySelector('.store-settings-workbench'));assert.ok(!detail());assert.ok(controller.authentication.getSnapshot().principal,'403 does not invent logout');
 await click(button('重试当前页面'));await until(()=>firstView(),'explicit route retry');harness.transport.setNextReadDelay(180);await click(firstView());await act(async()=>harness.revoke());await settle(220);assert.ok(!root.querySelector('.demo-frame'));assert.ok(!root.querySelector('table'));assert.ok(!detail());assert.equal(controller.authentication.getSnapshot().principal,null);
 assert.equal(network,0);assert.ok(harness.transport.calls().every(call=>call.path==='/auth/session'||call.path.startsWith('/store-settings-read/')||call.path.startsWith('/product-management/')),'Only explicit readonly paths exercised');
 console.log('PASS stores 4: 503 retains labelled old results, retry, cancellation/late403, tab replacement, closed late detail, current403 clear/retry, identity disposal, zero real fetch/write.');
}finally{
 if(harness){if(act)await act(async()=>harness.dispose());else harness.dispose();}globalThis.fetch=originalFetch;dom.window.close();await rm(temporary,{recursive:true,force:true});
}
