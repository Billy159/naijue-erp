/** Actual Application + existing reader/controllers, explicit synthetic transport.
 * Deliberately abort-ignoring delayed responses exercise the public UI boundary. */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),temporary=await mkdtemp(path.join(here,'.tabs-dom-'));
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
 await act(async()=>{harness=module.mountUnifiedHarness(root);});await act(async()=>harness.enter());const controller=harness.app.controller;
 const tab=label=>[...root.querySelectorAll('[role=tab]')].find(el=>el.textContent===label);
 const key=async(label,value)=>{const item=tab(label);assert.ok(item);await act(async()=>{item.focus();item.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));});await settle(40);};
 const linked=()=>{const active=root.querySelector('[role=tab][aria-selected=true]');assert.ok(active?.classList.contains('arco-tabs-header-title'));const pane=document.getElementById(active.getAttribute('aria-controls'));assert.ok(pane?.getAttribute('role')==='tabpanel'&&pane.getAttribute('aria-labelledby')===active.id);assert.equal(root.querySelectorAll('[role=tab][tabindex="0"]').length,1);assert.equal(root.querySelectorAll('button[role=tab]').length,0);};
 await click(nav('商品设置'));await until(()=>root.querySelector('table[aria-label="尺码组"]'),'groups');linked();
 await key('尺码组','ArrowRight');await until(()=>root.querySelector('table[aria-label="版型"]'),'keyboard fits');await settle(40);assert.ok(document.activeElement===tab('版型'),'Lazy replacement restores selected tab focus');linked();
 await key('版型','Home');await until(()=>root.querySelector('table[aria-label="颜色"]'),'Home first tab');await settle(40);assert.ok(document.activeElement===tab('颜色'));linked();
 await key('颜色','ArrowLeft');await until(()=>root.querySelector('table[aria-label="季节"]'),'wrap final tab');await settle(40);assert.ok(document.activeElement===tab('季节'));linked();const before=count('/dictionary-read/seasons/query');await key('季节','End');await key('季节','Enter');assert.equal(count('/dictionary-read/seasons/query'),before,'Reselecting active tab must not create another query');
 console.log('PASS real Arco Tabs 1: settings share component/real TabPane associations/roving focus; Arrow/Home/End/wrap, lazy colors/fits, exact focus and no active-tab query replay.');
 await click(nav('营业厅与仓库'));await until(()=>root.textContent.includes('共 37 条'),'stores');linked();harness.transport.setNextReadFailure('forbidden');harness.transport.setNextReadDelay(180);await key('营业厅','End');await until(()=>tab('仓库')?.getAttribute('aria-selected')==='true','warehouse waiting');await key('仓库','Home');await until(()=>root.textContent.includes('共 37 条'),'stores replaced');await settle(220);assert.equal(controller.getSnapshot().phase,'ready');assert.ok(document.activeElement===tab('营业厅'));linked();
 console.log('PASS real Arco Tabs 2: stores/warehouse use same adapter, keyboard replacement disposes prior controller; late403 cannot clear the new tab or identity.');
 await click(nav('商品信息'));await until(()=>button('查看'),'products');await click(button('查看'));await until(()=>root.querySelector('.pd-fields'),'Drawer');linked();await key('基础资料','End');await until(()=>root.querySelector('.pd-images')||root.textContent.includes('暂无图片'),'images or explicit empty image state');linked();assert.ok(document.activeElement===tab('图片'));await key('图片','Home');await until(()=>root.querySelector('.pd-fields'),'basics');assert.ok(document.activeElement===tab('基础资料'));linked();await act(async()=>harness.revoke());await settle();assert.ok(!root.querySelector('[role=tab]'));assert.ok(!root.querySelector('.erp-overlay'));assert.equal(network,0);
 console.log('PASS real Arco Tabs 3: product Drawer same Tabs component, real active panel, End/Home focus and only selected read leaf; identity clears tabs/layers.');
}finally{
 if(harness){if(act)await act(async()=>harness.dispose());else harness.dispose();}globalThis.fetch=originalFetch;dom.window.close();await rm(temporary,{recursive:true,force:true});
}
