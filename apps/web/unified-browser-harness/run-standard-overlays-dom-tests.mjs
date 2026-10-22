/** Actual Application + existing reader/controllers, explicit synthetic transport.
 * Deliberately abort-ignoring delayed responses exercise the public UI boundary. */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),temporary=await mkdtemp(path.join(here,'.overlays-dom-'));
const dom=new JSDOM('<!doctype html><style data-unified-harness-style data-management-harness-style data-harness-style data-inventory-inline data-demo-single-select-inline data-demo-multi-select-inline data-inventory-product-select-inline></style><div id="root"></div>',{url:'https://synthetic-management.invalid/',pretendToBeVisual:true});
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
 await act(async()=>{harness=module.mountUnifiedHarness(root);});await act(async()=>harness.enter());
 const controller=harness.app.controller;
 await click(nav('库存状况表'));const query=root.querySelector('form[aria-label="库存筛选"]');await act(async()=>query.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await until(()=>root.querySelector('.mx-view'),'inventory result');
 const scopeButton=button('查看范围');await click(scopeButton);await until(()=>root.querySelector('.arco-modal.iw-scope-dialog'),'actual scope Arco Modal');assert.equal(root.querySelectorAll('dialog').length,0);assert.match(root.querySelector('.iw-scope-dialog').textContent,/商品：全部/);
 for(const method of ['Escape','close']){if(!root.querySelector('.iw-scope-dialog'))await click(scopeButton);const layer=root.querySelector('.iw-scope-dialog');if(method==='Escape')await act(async()=>layer.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));else await click(layer.querySelector('[aria-label="关闭查询范围"]'));await settle(40);assert.ok(!root.querySelector('.iw-scope-dialog'));assert.ok(document.activeElement===scopeButton,'Scope exact opener return');}
 console.log('PASS standard overlays 1: inventory executed range actual Arco Modal, original filter facts, Escape/close exact return, native dialog0.');
 await click(root.querySelector('.mx-view'));await until(()=>root.querySelector('.pd-fields'),'inventory product Drawer');await click(button('图片'));await until(()=>root.querySelector('.pd-thumbnail'),'lazy thumbnails');
 const thumbnail=root.querySelector('.pd-thumbnail');
 for(const method of ['Escape','close','mask']){await click(thumbnail);await until(()=>root.querySelector('.pd-image-preview img'),'original image');const layer=root.querySelector('.pd-image-preview');assert.ok(layer.classList.contains('arco-modal'));assert.equal(root.querySelectorAll('.erp-overlay').length,2);assert.equal(root.querySelectorAll('dialog').length,0);assert.ok(document.activeElement===layer.querySelector('[data-erp-overlay-close]'));
  if(method==='Escape')await act(async()=>layer.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));else if(method==='close')await click(layer.querySelector('[aria-label="关闭图片预览"]'));else {const wrap=layer.closest('.arco-modal-wrapper');await act(async()=>{wrap.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));wrap.dispatchEvent(new MouseEvent('click',{bubbles:true}));});}
  await until(()=>!root.querySelector('.pd-image-preview'),`Only inner layer closes via ${method}`);await settle(40);assert.ok(!root.querySelector('.pd-image-preview'),'Only inner layer closes');assert.ok(root.querySelector('.erp-product-drawer'),'Outer Drawer stays open');assert.ok(document.activeElement===thumbnail,'Inner close returns exact thumbnail');
 }
 harness.transport.setNextReadDelay(180);await click(thumbnail);await until(()=>root.querySelector('.pd-image-preview'),'pending image');await click(root.querySelector('.pd-image-preview [aria-label="关闭图片预览"]'));await click(button('基础资料'));await settle(220);assert.ok(!root.querySelector('.pd-image-preview'));assert.ok(root.querySelector('.pd-fields'));
 await click(root.querySelector('[aria-label="关闭商品资料"]'));await settle(40);assert.ok(!root.querySelector('.erp-overlay'));
 console.log('PASS standard overlays 2: actual nested Arco Modal inside Drawer; inner Escape/close/mask retains parent and restores thumbnail; delayed image/tab replacement cannot revive.');
 await click(nav('商品设置'));await click(button('颜色'));await until(()=>root.querySelector('button[aria-label^="查看颜色："]'),'colors');
 for(const label of ['颜色','版型']){if(label==='版型'){await click(button('版型'));await until(()=>root.querySelector('button[aria-label^="查看版型："]'),'fits');}const view=root.querySelector(`button[aria-label^="查看${label}："]`);for(const path of ['Escape','close','cancel']){await click(view);await until(()=>root.querySelector('.arco-modal.catalogue-entry-modal'),'catalogue Arco');const layer=root.querySelector('.catalogue-entry-modal');assert.ok(layer.querySelector('input').readOnly);assert.ok(button('确定').disabled);if(path==='Escape')await act(async()=>layer.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));else await click(path==='close'?layer.querySelector('[data-erp-overlay-close]'):button('取消'));await settle(40);assert.ok(!root.querySelector('.catalogue-entry-modal'));assert.ok(document.activeElement===view,'Exact catalogue view focus');}}
 assert.equal(root.querySelectorAll('dialog').length,0);assert.equal(network,0);await act(async()=>harness.revoke());await settle();assert.ok(!root.querySelector('.erp-overlay'));assert.equal(controller.authentication.getSnapshot().principal,null);
 console.log('PASS standard overlays 3: both color/fit readonly actual Arco Modal, unavailable writes, Escape/close/cancel exact row focus; identity clears all layers.');
}finally{
 if(harness){if(act)await act(async()=>harness.dispose());else harness.dispose();}globalThis.fetch=originalFetch;dom.window.close();await rm(temporary,{recursive:true,force:true});
}
