import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
// Synthetic event/state checks only; not browser layout, API, production grant or PostgreSQL acceptance.
const here=path.dirname(fileURLToPath(import.meta.url)),temporary=await mkdtemp(path.join(here,'.modal-cancel-parity-'));
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://synthetic-modal.invalid/',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLDialogElement','HTMLButtonElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.matchMedia=query=>({matches:false,media:query,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}});
let root,act,context;
try {
 const output=path.join(temporary,'entry.mjs');
 await build({stdin:{contents:`export {createElement,StrictMode,useState,act} from 'react';export {createRoot} from 'react-dom/client';export {ReadContext} from '../../../loading/read-scope.ts';export {CatalogueEntryEditor} from '../entry-view.tsx';export {ProductCategoriesPage} from '../../../product-categories/product-categories-page.tsx';`,resolveDir:here,sourcefile:'cancel-parity-entry.tsx',loader:'tsx'},outfile:output,bundle:true,platform:'browser',format:'esm',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},jsx:'automatic',loader:{'.css':'empty'},logLevel:'warning'});
 const m=await import(pathToFileURL(output).href);({act}=m);const {createElement:h,StrictMode,useState,createRoot,ReadContext,CatalogueEntryEditor,ProductCategoriesPage}=m;
 const host=document.getElementById('root');root=createRoot(host);
 const settle=async()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,35));});
 const click=async node=>{assert.ok(node,'click target');await act(async()=>node.click());await settle();};
 const type=async(node,value)=>{assert.ok(node,'input target');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});await settle();};
 const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===text),modal=()=>host.querySelector('.catalogue-entry-modal');
 let serial=0,writes=0,keys=0,guard=null;
 const deny=()=>assert.fail('unexpected access failure'),receive=value=>{guard=value;},uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const renew=async()=>{await act(async()=>root.render(null));context?.clear();context=new ReadContext({accountId:'SYNTHETIC',sessionRevision:String(++serial),permissionRevision:'1'});return context.createScope('cancel-parity');};
 for(const [kind,label] of [['COLOR','颜色'],['FIT','版型']])for(const editing of [false,true])for(const mode of ['cancel','icon','escape']) {
  const scope=await renew(),capability={kind,allowedActions:['CREATE','EDIT','DELETE'],newRequestKey:()=>{keys++;return uuid(99);},onRecoveryRequired(){assert.fail('cancel must not create a recovery command');},client:{kind,async execute(){writes++;throw Error('cancel must not write');},async receipt(){assert.fail('cancel must not query receipt');}}};
  function Wrapper(){const [open,setOpen]=useState(true);return open?h(CatalogueEntryEditor,{scope,capability,entry:editing?{id:uuid(1),version:3,name:'原资料',code:kind==='FIT'?'A':'001',enabled:true}:null,label,close:()=>setOpen(false),onCommitted(){assert.fail('cancel must not commit');},reload(){assert.fail('ordinary cancel must not reload');},onAccessFailure:deny,onCanLeaveChange:receive}):null;}
  await act(async()=>root.render(h(StrictMode,null,h(Wrapper))));await settle();await type(modal().querySelector('input[name="name"]'),'未保存资料');assert.equal(guard(),false,'full-page dirty guard remains installed');
  if(mode==='cancel')await click(button('取消'));else if(mode==='icon')await click(modal().querySelector('[data-erp-overlay-close]'));else {await act(async()=>modal().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));await settle();}
  assert.equal(modal() === null,true,`${kind}/${editing}/${mode}: one dismissal only`);assert.equal(button('继续填写') === undefined,true,'no extra popup leave action');assert.equal(button('放弃填写') === undefined,true,'no extra popup leave action');assert.equal(writes,0);assert.equal(keys,0);
 }
 // A pending or uncertain write remains non-dismissable; the original owner retains recovery.
 const scope=await renew();let rejectWrite,recovery=0;
 const capability={kind:'COLOR',allowedActions:['CREATE','EDIT','DELETE'],newRequestKey:()=>{keys++;return uuid(99);},onRecoveryRequired(){recovery++;},client:{kind:'COLOR',execute(){writes++;return new Promise((resolve,reject)=>{rejectWrite=reject;});},async receipt(){throw Error('not requested');}}};
 function Pending(){const [open,setOpen]=useState(true);return open?h(CatalogueEntryEditor,{scope,capability,entry:null,label:'颜色',close:()=>setOpen(false),onCommitted(){},reload(){},onAccessFailure:deny,onCanLeaveChange:receive}):null;}
 await act(async()=>root.render(h(Pending)));await settle();await type(modal().querySelector('input[name="name"]'),'待确认');await type(modal().querySelector('input[name="code"]'),'001');await click(button('确定'));await click(modal().querySelector('[data-erp-overlay-close]'));assert.equal(modal() !== null,true,'pending modal retained');assert.equal(writes,1);assert.equal(keys,1);
 await act(async()=>rejectWrite(new Error('synthetic unknown outcome')));await settle();await click(modal().querySelector('[data-erp-overlay-close]'));assert.equal(modal() !== null,true,'pending modal retained');assert.equal(Boolean(button('查回保存结果')),true,'recovery action present');assert.equal(writes,1);await renew();assert.equal(recovery,1);
 // Demo category-cancel is direct, unlike category navigation/new-item allowLeave.
 const categoryScope=context.createScope('category-cancel'),categoryCapability={kind:'CATEGORY',allowedActions:['CREATE','EDIT','DELETE'],newRequestKey(){assert.fail('cancel must not create a request key');},onRecoveryRequired(){},client:{kind:'CATEGORY',async execute(){assert.fail('cancel must not write');},async receipt(){assert.fail('cancel must not read a receipt');}}};
 const reader={async readCategories(){return {total:2,items:[1,2].map(n=>({id:uuid(n),parentId:null,name:'原分类'+n,displayOrder:n,version:1,code:null,productCount:0,childCount:0}))};}};
 await act(async()=>root.render(h(ProductCategoriesPage,{scope:categoryScope,reader,maintenance:categoryCapability,onCanLeaveChange:receive,onAccessFailure:deny})));await settle();await type(host.querySelector('input[aria-label="分类名称"]'),'未保存分类');await click(button('取消'));assert.equal(host.querySelector('input[aria-label="分类名称"]').value,'原分类1');assert.equal(button('继续填写') === undefined,true,'no extra popup leave action');assert.equal(button('放弃填写') === undefined,true,'no extra popup leave action');
 await type(host.querySelector('input[aria-label="分类名称"]'),'保留导航保护');await click(button('新增一级分类'));assert.equal(Boolean(button('继续填写')),true,'category navigation guard must not be removed');await click(button('继续填写'));assert.equal(host.querySelector('input[aria-label="分类名称"]').value,'保留导航保护');
 console.log('PASS modal cancellation parity: COLOR/FIT create/edit Cancel, icon and Escape; zero writes/keys; pending/unknown write retained; category Cancel direct but navigation dirty guard preserved.');
} finally {if(root&&act)await act(async()=>root.unmount());context?.clear();dom.window.close();await rm(temporary,{recursive:true,force:true});}
