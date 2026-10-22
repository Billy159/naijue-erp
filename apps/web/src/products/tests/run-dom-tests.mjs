import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Actual React19 components under StrictMode. This is event/lifecycle evidence,
// NOT Chromium execution, visual matching, computed layout or live PostgreSQL proof.
const here=path.dirname(fileURLToPath(import.meta.url)), temporary=await mkdtemp(path.join(here,'.products-dom-'));
const dom=new JSDOM('<!doctype html><style data-inventory-inline data-demo-single-select-inline data-demo-multi-select-inline data-inventory-product-select-inline></style><div id="root" class="demo-ui"></div><button id="outside">outside</button>',{url:'https://synthetic.test/',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLDialogElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
dom.window.matchMedia=query=>({matches:false,media:query,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}});
dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,act;
try{
  const output=path.join(temporary,'entry.mjs');
  await build({entryPoints:[path.join(here,'entry.tsx')],outfile:output,bundle:true,platform:'browser',format:'esm',external:['react','react-dom','react-dom/*'],banner:{js:"import { createRequire } from 'node:module'; const require=createRequire(import.meta.url);"},jsx:'automatic',loader:{'.css':'empty'},logLevel:'warning'});
  const module=await import(pathToFileURL(output).href),{createElement:h,StrictMode,createRoot,ProductsPageView,ReadContext,HttpQueryError}=module;({act}=module);
  const host=document.getElementById('root'), requests=[], products=[];let failures=0;
  const pending=kind=>read=>new Promise((resolve,reject)=>requests.push({kind,read,resolve,reject}));
  const reader={readList:pending('list'),readCandidates:pending('candidate')},onAccessFailure=()=>failures++;
  const identity=(account='ACCOUNT',revision='1')=>({accountId:account,sessionRevision:revision,permissionRevision:revision});
  const context=new ReadContext(identity());let scope=context.createScope('PRODUCTS'), capability;
  const productReader={
    readProductBasics:async read=>{products.push(['basics',read]);return{productId:read.parameters.productId,code:'DRAWER-CODE',name:'REAL TARGET DRAWER',categoryLabel:null,yearLabel:null,seasonLabel:null,supplierLabel:null,systemCode:null,retailPrice:null};},
    readProductSpecifications:async read=>{products.push(['specifications',read]);return{productId:read.parameters.productId,sizeGroup:null,colors:[],fits:[],sizes:[],skus:[]};},
    readProductImages:async read=>{products.push(['images',read]);return{productId:read.parameters.productId,images:[]};},readProductImage:async()=>{throw new Error('No original prefetch');},
  };
  root=createRoot(host);
  const settle=async(ms=20)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});
  const render=async()=>act(async()=>root.render(h(StrictMode,null,h(ProductsPageView,{scope,reader,onAccessFailure,...(capability?{product:capability}:{})}))));
  const clear=async()=>act(async()=>root.render(null));
  const button=text=>[...host.querySelectorAll('button')].find(el=>el.textContent.trim()===text);
  const click=async el=>{assert.ok(el,'Expected clickable control');await act(async()=>el.click());};
  const submit=async()=>act(async()=>host.querySelector('form[aria-label="商品信息筛选"]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  const type=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
  const latest=kind=>requests.findLast(r=>r.kind===kind),count=kind=>requests.filter(r=>r.kind===kind).length;
  const resolve=async(request,value)=>{await act(async()=>request.resolve(value));await settle();};
  const reject=async(request,error)=>{await act(async()=>request.reject(error));await settle();};
  const id=number=>`${number.toString(16).padStart(8,'0')}-1111-4111-8111-111111111111`;
  const item=(number,name)=>({id:id(number),code:`P-${number}`,name,categoryLabel:null,year:2026,seasonLabel:null,supplierLabel:null,fits:[],thickness:null,retailPrice:null,totalStock:null});
  const list=(request,names,total=names.length)=>({page:request.read.parameters.page,pageSize:request.read.parameters.pageSize,exactTotal:total,items:names.map((name,index)=>item((request.read.parameters.page-1)*request.read.parameters.pageSize+index+1,name))});
  await render();await settle();assert.equal(count('list'),1,'Source default list reads exactly one bounded first page after StrictMode activation');assert.equal(count('candidate'),0);assert.equal(products.length,0);
  assert.deepEqual([...host.querySelectorAll('th')].map(el=>el.textContent),['款号','商品名称','商品分类','年份 / 季节','供应商','版型','厚薄','零售价','总库存','操作']);
  assert.equal(button('新增商品').disabled,true);assert.equal(host.querySelectorAll('.pm-filter-row>.iw-field').length,4);
  await click(button('高级筛选 ▾'));assert.equal(host.querySelectorAll('.pm-more-filters>.iw-field').length,4);
  assert.deepEqual([...host.querySelectorAll('.pm-more-filters>.iw-field>label')].map(el=>el.textContent),['供应商','版型','厚薄','领型 / 裤型']);
  await click(button('收起筛选 ▴'));const first=latest('list');assert.equal(count('list'),1);
  assert.deepEqual(Object.keys(first.read.parameters.filter),['productIds','categoryIds','years','seasonIds','supplierIds','fitIds','thicknesses','shapeCodes']);
  const initial=list(first,['NULL FACTS','ZERO FACTS']);initial.items[1]={...initial.items[1],retailPrice:'0.00',totalStock:'-5'};
  await resolve(first,initial);const rows=[...host.querySelectorAll('tbody tr')];assert.equal(rows.length,2);assert.equal(rows[0].children[7].textContent,'');assert.equal(rows[0].children[8].textContent,'未提供');assert.equal(rows[1].children[7].textContent,'0.00');assert.equal(rows[1].children[8].textContent,'-5');assert.equal(button('查看').disabled,true);assert.equal(products.length,0);
  console.log('PASS source contract: 10 original columns, 4+4 filter order, no construction-time I/O, read-only actions, null price/unknown stock never zero.');

  // Single current query owns results; cancelled/late transports intentionally ignore AbortSignal.
  await submit();const superseded=latest('list');await submit();const newest=latest('list');assert.equal(superseded.read.signal.aborted,true);
  await resolve(newest,list(newest,['NEWEST ONLY']));await resolve(superseded,list(superseded,['LATE OLD LIST']));assert.match(host.textContent,/NEWEST ONLY/);assert.doesNotMatch(host.textContent,/LATE OLD LIST/);
  await submit();const cancelled=latest('list');await click(button('取消本次读取'));assert.equal(cancelled.read.signal.aborted,true);await reject(cancelled,new HttpQueryError('forbidden','FORBIDDEN',403));assert.equal(failures,0);assert.match(host.textContent,/NEWEST ONLY/);
  await submit();const failed=latest('list');await reject(failed,new Error('PRIVATE RAW DB MESSAGE'));assert.match(host.querySelector('[role=alert]').textContent,/保留上次成功结果/);assert.doesNotMatch(host.textContent,/PRIVATE RAW DB/);
  await click(button('重试'));await resolve(latest('list'),list(latest('list'),['RECOVERED']));assert.equal(host.querySelector('[role=alert]'),null);
  console.log('PASS list lifecycle: newest-only, cancellation aborts, late403 cannot revoke current identity, safe error retains labelled prior results and one retry recovers.');

  // Real source product-search shell, backed by this module's separate query contract.
  const input=()=>host.querySelector('.iw-product-field input:not([type="hidden"])');await click(input());await settle();await type(input(),'one');await type(input(),'two');await settle(220);
  assert.ok(host.querySelector('[data-product-viewport-popup]'),'Product popup remains local but is viewport-positioned');const search=latest('candidate');assert.equal(search.read.parameters.kind,'product');assert.equal(search.read.parameters.search,'two');assert.deepEqual(search.read.parameters.selectedIds,[]);
  await resolve(search,{page:1,pageSize:20,exactTotal:1,items:[{id:id(99),label:'P-99 Search Fact',code:'P-99',name:'Search Fact'}]});
  assert.ok(host.querySelector('[data-product-id]'));await click(host.querySelector('[data-product-id]'));assert.match(host.querySelector('.inv-tag').textContent,/P-99/);assert.equal(count('list'),6);
  await submit();const selected=latest('list');assert.deepEqual(selected.read.parameters.filter.productIds,[id(99)]);await resolve(selected,list(selected,['SELECTED RESULT']));
  await act(async()=>document.getElementById('outside').dispatchEvent(new Event('pointerdown',{bubbles:true})));await settle();
  console.log('PASS source product search: debounced independent candidates, native code/name, explicit multi-selection changes draft only, subsequent list sends IDs not labels.');

  // Generic source TreeSelect dimensions read only their authorized dictionary window.
  const yearHost=()=>host.querySelector('[data-multi-label="年份"]');
  await click(yearHost().querySelector('.iw-control,.arco-tree-select-view'));await settle();await settle();await settle();
  const years=latest('candidate');assert.equal(years.read.parameters.kind,'year');assert.deepEqual(years.read.parameters.selectedIds,[]);
  await resolve(years,{page:1,pageSize:20,exactTotal:2,items:[{id:'2025',label:'2025年'},{id:'2026',label:'2026年'}]});
  const yearRow=[...yearHost().querySelectorAll('.arco-tree-node')].find(row=>row.querySelector('.arco-tree-node-title')?.textContent==='2025年');
  await click(yearRow.querySelector('input[type=checkbox]'));assert.match(yearHost().querySelector('.arco-tag').textContent,/2026年/);
  await submit();const byYear=latest('list');assert.deepEqual(byYear.read.parameters.filter.years,['2026']);await resolve(byYear,list(byYear,['YEAR RESULT']));
  await act(async()=>document.getElementById('outside').dispatchEvent(new Event('pointerdown',{bubbles:true})));await settle();
  assert.equal(host.querySelector('[data-product-viewport-popup]'),null);
  console.log('PASS generic filter: bounded independent year candidates, explicit true-subset tags, exact year values submitted only on query; popup viewport lease releases on close.');

  // Pagination acts on executed filters, not a freshly edited draft.
  await submit();const page1=latest('list');await resolve(page1,list(page1,Array.from({length:100},(_,i)=>`PAGE1-${i}`),101));
  await click(button('重置'));await click(host.querySelector('[aria-label="下一页"]'));const page2=latest('list');assert.equal(page2.read.parameters.page,2);assert.deepEqual(page2.read.parameters.filter.productIds,[id(99)]);
  await resolve(page2,list(page2,['PAGE2 LAST'],101));assert.match(host.textContent,/PAGE2 LAST/);assert.ok(host.querySelector('[aria-label="下一页"]').classList.contains('arco-pagination-item-disabled'));
  console.log('PASS pagination: exact count, next/last boundary, page navigation retains executed IDs while reset only changes the draft.');

  capability={reader:productReader,loadStyles:async()=>{}};await render();await click(button('查看'));await settle(100);await settle(100);assert.match(host.querySelector('.erp-product-drawer').textContent,/只读/);assert.ok(products.length>0);assert.equal(products[0][1].parameters.productId,host.querySelector('tbody tr').dataset.productId??id(101));
  await click(host.querySelector('button[aria-label="关闭商品资料"]'));assert.equal(host.querySelector('.erp-product-drawer'),null);assert.ok(document.activeElement===button('查看'),'Drawer close must restore the clicked view trigger');
  await click(button('查看'));await settle();const previousCapability=capability;capability=undefined;await render();assert.equal(host.querySelector('.erp-product-drawer'),null);
  capability=previousCapability;await render();assert.equal(host.querySelector('.erp-product-drawer'),null,'Restoring a capability must not resurrect the old target');
  console.log('PASS target drawer: only explicit capability/click reads independently authorized target, source read-only drawer/close focus reused; removing/restoring capability never resurrects an old target.');

  await submit();const pendingIdentity=latest('list');await act(async()=>context.replaceIdentity(identity('ACCOUNT','2')));assert.equal(pendingIdentity.read.signal.aborted,true);assert.equal(host.querySelector('form'),null);assert.doesNotMatch(host.textContent,/PAGE2 LAST/);assert.match(host.textContent,/旧身份结果已清除/);
  await resolve(pendingIdentity,list(pendingIdentity,['LATE REVOKED']));assert.doesNotMatch(host.textContent,/LATE REVOKED/);
  scope=context.createScope('RESTORED');await render();await submit();await resolve(latest('list'),list(latest('list'),['BEFORE DENIAL']));await submit();const denied=latest('list');await reject(denied,new HttpQueryError('forbidden','FORBIDDEN',403));assert.equal(failures,1);assert.equal(host.querySelector('form'),null);assert.doesNotMatch(host.textContent,/BEFORE DENIAL/);
  await clear();scope=context.createScope('REMOUNT');await render();assert.equal(host.querySelectorAll('tbody tr:not(.arco-table-empty-row)').length,0);assert.match(host.textContent,/正在读取商品信息/);await submit();const unmounted=latest('list');await clear();assert.equal(unmounted.read.signal.aborted,true);await reject(unmounted,new Error('late unmount'));assert.equal(host.childElementCount,0);context.clear();
  console.log('PASS identity/access/unmount: revision change and current403 clear all page facts, pending reads abort, fresh mount never reuses prior results and late responses cannot reattach.');
}finally{if(root&&act)await act(async()=>root.unmount());dom.window.close();await rm(temporary,{recursive:true,force:true});}
