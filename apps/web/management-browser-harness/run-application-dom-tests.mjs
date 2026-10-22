import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
// Real Application with the closed synthetic in-memory HTTP boundary. JSDOM proves
// event/lifecycle composition, never pixels, geometry, browser CSS or PostgreSQL.
const here=path.dirname(fileURLToPath(import.meta.url)),temporary=await mkdtemp(path.join(here,'.management-dom-'));
const dom=new JSDOM('<!doctype html><style data-management-harness-style data-harness-style data-inventory-inline data-demo-single-select-inline data-demo-multi-select-inline data-inventory-product-select-inline></style><header>合成演示数据 / 非正式 / 不输入真实密码<button id="other-connected-control" type="button">另一个合法控件</button></header><div id="management-root"></div>',{url:'https://synthetic-management.invalid/',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLDialogElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});dom.window.matchMedia=query=>({matches:false,media:query,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}});
dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){const wasOpen=this.hasAttribute('open');this.removeAttribute('open');if(wasOpen){document.body.tabIndex=-1;document.body.focus();}};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const originalFetch=globalThis.fetch;let accidentalNetwork=0;globalThis.fetch=async()=>{accidentalNetwork++;throw new Error('A synthetic acceptance test must never call global fetch');};
let harness,act;
try{
  const output=path.join(temporary,'entry.mjs');await build({entryPoints:[path.join(here,'application-entry.tsx')],outfile:output,bundle:true,platform:'browser',format:'esm',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},jsx:'automatic',loader:{'.css':'empty'},logLevel:'warning'});
  const module=await import(pathToFileURL(output).href);({act}=module);const root=document.getElementById('management-root');
  const settle=async(ms=20)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});
  const wait=async(test,label)=>{for(let index=0;index<60;index++){if(test())return;await settle();}assert.ok(test(),`Timed out waiting for ${label}`);};
  const click=async element=>{assert.ok(element,'Expected clickable element');await act(async()=>{element.focus?.();element.click();});};
  const button=text=>[...root.querySelectorAll('button,[role=tab]')].find(element=>element.textContent.trim()===text),nav=text=>[...root.querySelectorAll('a.nav')].find(element=>element.textContent.trim()===text);
  const key=async(element,value)=>{await act(async()=>element.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));await settle();};
  const count=path=>harness.transport.calls().filter(call=>call.path===path).length;
  await act(async()=>{harness=module.mountManagementHarness(root);});await settle();assert.equal(harness.transport.calls().length,0,'Mount must not implicitly authenticate or query');
  const login=root.querySelector('.auth-form');assert.ok(login.hidden);assert.ok([...login.querySelectorAll('input')].every(input=>input.disabled));assert.equal(login.querySelector('button[type=submit]').disabled,true);
  await act(async()=>harness.enter());await wait(()=>root.querySelectorAll('.pm-products tbody tr').length===100,'source product first page');
  assert.equal(harness.app.controller.getSnapshot().route,'products');assert.equal(nav('商品信息').getAttribute('aria-current'),'page');assert.match(root.querySelector('.breadcrumb').textContent,/商品管理.*商品信息/);
  assert.deepEqual([...root.querySelectorAll('.pm-products th')].map(element=>element.textContent),['款号','商品名称','商品分类','年份 / 季节','供应商','版型','厚薄','零售价','总库存','操作']);assert.equal(count('/product-management/query'),1);assert.equal(root.querySelector('.pm-products tbody td:nth-child(9)').textContent,'未提供');assert.equal(button('新增商品').disabled,true);
  await click(root.querySelector('button[aria-label="下一页"]'));await wait(()=>root.querySelectorAll('.pm-products tbody tr').length===5,'last product page');assert.equal(count('/product-management/query'),2);
  const productView=button('查看');await click(productView);await wait(()=>root.querySelector('.erp-overlay .pd-fields'),'target product drawer');assert.match(root.querySelector('.erp-overlay').textContent,/只读/);assert.equal(count('/products/basics/query'),1);
  await key(root.querySelector('.erp-overlay'),'Escape');assert.equal(root.querySelector('.erp-overlay'),null);assert.ok(document.activeElement===productView,`Product Escape must restore trigger after Arco layer teardown; got ${document.activeElement?.tagName}`);
  await click(productView);await wait(()=>root.querySelector('.erp-overlay .pd-fields'),'product other-control race');const otherControl=document.getElementById('other-connected-control');
  await act(async()=>{root.querySelector('.erp-overlay').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));otherControl.focus();});await settle();
  assert.ok(document.activeElement===otherControl,`Connected legal button must beat stale product focus restore; got ${document.activeElement?.tagName}`);
  console.log('PASS actual Application products: explicit synthetic session, source menu/breadcrumb, 100+5 paging, ten columns, null facts, disabled write, independent target drawer.');

  await click(nav('商品设置'));await wait(()=>root.querySelectorAll('table[aria-label="尺码组"] tbody tr').length===20,'size groups');
  assert.equal(harness.app.controller.getSnapshot().route,'product-settings');assert.equal(nav('商品设置').getAttribute('aria-current'),'page');assert.notEqual(button('颜色').getAttribute('aria-disabled'),'true');assert.notEqual(button('版型').getAttribute('aria-disabled'),'true');assert.notEqual(button('季节').getAttribute('aria-disabled'),'true');
  await click(button('季节'));await wait(()=>root.querySelectorAll('table[aria-label="季节"] tbody tr').length===3,'seasons tab');assert.equal(harness.app.controller.getSnapshot().route,'product-settings');assert.equal(button('季节').getAttribute('aria-selected'),'true');assert.equal(count('/dictionary-read/seasons/query'),1);
  await click(button('尺码组'));await wait(()=>root.querySelectorAll('table[aria-label="尺码组"] tbody tr').length===20,'groups restored');assert.notEqual(button('颜色').getAttribute('aria-disabled'),'true');assert.notEqual(button('版型').getAttribute('aria-disabled'),'true');
  console.log('PASS actual product-settings: one source-level menu, explicit groups/seasons tabs, explicit enabled read-only colors/fits destinations, real dictionary HTTP paths and fresh tab scopes.');

  await click(nav('条码方案'));await wait(()=>root.querySelectorAll('.pc-schemes tbody tr').length===2,'barcode schemes');assert.equal(nav('条码方案').getAttribute('aria-current'),'page');assert.match(root.querySelector('.breadcrumb').textContent,/商品管理.*条码方案/);assert.match(root.querySelector('.pc-schemes tbody tr:nth-child(2)').textContent,/未提供/);
  const schemeView=root.querySelector('button[aria-label^="查看方案："]');await click(schemeView);await wait(()=>root.querySelector('.erp-overlay .pc-rule'),'scheme detail');assert.equal(count('/dictionary-read/barcode-scheme/query'),1);assert.equal(root.querySelector('.erp-overlay').querySelectorAll('input,select,textarea').length,0);
  await key(root.querySelector('.erp-overlay'),'Escape');assert.equal(root.querySelector('.erp-overlay'),null);assert.ok(document.activeElement===schemeView,`Scheme Escape must restore trigger after Arco layer teardown; got ${document.activeElement?.tagName}`);
  await click(schemeView);await wait(()=>root.querySelector('.erp-overlay .pc-rule'),'scheme other-control race');
  await act(async()=>{root.querySelector('.erp-overlay').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));otherControl.focus();});await settle();
  assert.ok(document.activeElement===otherControl,`Connected legal button must beat stale scheme focus restore; got ${document.activeElement?.tagName}`);
  // Escape and a newer menu activation occur in one user-event turn. The old
  // dialog's cleanup/microtask must not steal focus back into the previous route.
  await click(schemeView);await wait(()=>root.querySelector('.erp-overlay .pc-rule'),'scheme reopened for focus race');
  const productsNav=nav('商品信息');await act(async()=>{root.querySelector('.erp-overlay').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));productsNav.focus();productsNav.click();});
  await wait(()=>root.querySelectorAll('.pm-products tbody tr').length===100,'newer product navigation after Escape');await settle();
  assert.ok(document.activeElement===productsNav,`New navigation focus must beat stale scheme restore; got ${document.activeElement?.tagName}`);
  const raceProductView=button('查看');await click(raceProductView);await wait(()=>root.querySelector('.erp-overlay .pd-fields'),'product reopened for focus race');
  const schemesNav=nav('条码方案');await act(async()=>{root.querySelector('.erp-overlay').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));schemesNav.focus();schemesNav.click();});
  await wait(()=>root.querySelectorAll('.pc-schemes tbody tr').length===2,'newer scheme navigation after Escape');await settle();
  assert.ok(document.activeElement===schemesNav,`New navigation focus must beat stale product restore; got ${document.activeElement?.tagName}`);
  console.log('PASS actual barcode scheme/product focus: Arco layer Escape restores original triggers after commit; newer navigation retains its own focus.');

  const denialTrigger=root.querySelector('button[aria-label^="查看方案："]');await click(denialTrigger);await wait(()=>root.querySelector('.erp-overlay .pc-rule'),'scheme before current403 race');harness.transport.setNextFailure('forbidden');
  await act(async()=>{root.querySelector('.erp-overlay').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));nav('商品信息').focus();nav('商品信息').click();});await wait(()=>harness.app.controller.getSnapshot().phase==='error','current403 route-local clear');assert.equal(root.querySelector('.pm-products'),null);assert.equal(root.querySelector('.pc-schemes'),null);assert.equal(root.querySelector('.erp-overlay'),null);assert.ok(harness.app.controller.authentication.getSnapshot().principal,'403 does not invent global unauthentication');
  const denialRetry=button('重试当前只读页面');denialRetry.focus();await settle();assert.ok(document.activeElement===denialRetry&&document.activeElement!==denialTrigger,'403 recovery focus cannot be stolen by old dialog target');await click(denialRetry);await wait(()=>root.querySelectorAll('.pm-products tbody tr').length===100,'explicit route retry after denial');
  harness.transport.setNextDelay(160);await act(async()=>{root.querySelector('form[aria-label="商品信息筛选"]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await click(nav('条码方案'));await wait(()=>root.querySelectorAll('.pc-schemes tbody tr').length===2,'newer route');await settle(200);assert.equal(root.querySelector('.pm-products'),null);assert.equal(harness.app.controller.getSnapshot().route,'barcode-schemes');
  const revokedSchemeTrigger=root.querySelector('button[aria-label^="查看方案："]');await click(revokedSchemeTrigger);await wait(()=>root.querySelector('.erp-overlay .pc-rule'),'scheme before identity clear');
  await act(async()=>harness.revoke());await wait(()=>!harness.app.controller.authentication.getSnapshot().principal,'identity revoke');assert.equal(root.querySelector('.pc-schemes'),null);assert.equal(root.querySelector('table'),null);assert.equal(root.querySelector('.erp-overlay'),null);assert.ok(document.activeElement!==revokedSchemeTrigger,'Identity clear cannot revive a revoked scheme target');assert.ok(root.querySelector('.auth-form').hidden);assert.equal(accidentalNetwork,0);
  await act(async()=>harness.enter('product-settings'));await wait(()=>root.querySelector('table[aria-label="尺码组"]'),'re-enter new identity');assert.equal(button('季节').getAttribute('aria-selected'),'false');
  console.log('PASS actual lifecycle: current403 clears route only and retries explicitly; newer navigation ignores delayed reads; identity revoke clears all facts/targets and re-entry is fresh; zero global fetch calls.');
  await act(async()=>harness.dispose());harness=null;assert.equal(root.childElementCount,0);
}finally{if(harness&&act)await act(async()=>harness.dispose());globalThis.fetch=originalFetch;dom.window.close();await rm(temporary,{recursive:true,force:true});}
