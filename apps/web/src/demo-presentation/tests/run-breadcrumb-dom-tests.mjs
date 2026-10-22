import assert from 'node:assert/strict';import{mkdtemp,rm}from'node:fs/promises';import path from'node:path';import{fileURLToPath,pathToFileURL}from'node:url';import{build}from'esbuild';import{JSDOM}from'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.breadcrumb-dom-'));const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.test/',pretendToBeVisual:true});
for(const k of ['window','document','navigator','HTMLElement','Element','SVGElement','Node','Event','MouseEvent','KeyboardEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,k,{configurable:true,value:dom.window[k]});globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);dom.window.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
let root,cleanupAct;
try{
 const out=path.join(temp,'entry.mjs');await build({stdin:{resolveDir:here,contents:"export{act,createElement,StrictMode}from'react';export{createRoot}from'react-dom/client';export{createDemoFrameWorkspaceRenderer}from'../../application/demo-frame-presentation.tsx';export{useDocumentNavigation}from'../document-navigation.tsx';export{StandardBreadcrumb}from'../../components/standard-breadcrumb.tsx';",loader:'tsx'},outfile:out,bundle:true,platform:'node',format:'esm',external:['react','react/*','react-dom','react-dom/*'],jsx:'automatic',loader:{'.css':'empty'},banner:{js:"import{createRequire}from'node:module';const require=createRequire(import.meta.url);"},logLevel:'warning'});
 const{act,createElement:h,StrictMode,createRoot,createDemoFrameWorkspaceRenderer,useDocumentNavigation,StandardBreadcrumb}=await import(pathToFileURL(out).href);cleanupAct=act;const host=document.getElementById('root');root=createRoot(host);let navigations=0;const renderWorkspace=createDemoFrameWorkspaceRenderer();
 const controller={routes:['inventory','sales','transfers','products','product-categories','product-settings','barcode-schemes','customers','suppliers','store-settings'],navigate:()=>{navigations++;}};
 const render=async(route,child='SYNTHETIC')=>{await act(async()=>root.render(h(StrictMode,null,renderWorkspace({controller,state:{route},routeContent:child}))));await act(async()=>new Promise(r=>setTimeout(r,20)));};
 await render('inventory');
 assert.ok(host.querySelector('.topbar .arco-breadcrumb'),'Actual production topbar must use root Arco Breadcrumb, not a slash string span');
 const labels=()=>Array.from(host.querySelectorAll('.topbar .arco-breadcrumb-item')).map(e=>e.textContent);
 assert.deepEqual(labels(),['库存管理','库存状况表']);assert.equal(host.querySelector('.topbar a'),null,'No fabricated link for management category');assert.equal(navigations,0);
 await render('store-settings');assert.deepEqual(labels(),['基础设置','营业厅与仓库']);
 function Doc(){useDocumentNavigation({kind:'sales',view:'new',canCreate:true,showList:()=>false,openCreate:()=>false});return h('p',null,'SYNTHETIC');}
 await render('sales',h(Doc));assert.deepEqual(labels(),['销售管理','新增销货单']);
 await render('products');assert.deepEqual(labels(),['商品管理','商品信息'],'Document unmount releases override instead of stale breadcrumb');assert.equal(navigations,0);
 await render(null);assert.equal(host.querySelector('.topbar .arco-breadcrumb-item'),null);
 await act(async()=>root.render(h(StandardBreadcrumb,{label:'合成路径',segments:[{id:'one',label:'SYN / 原标签'}]})));
 assert.equal(host.querySelectorAll('.arco-breadcrumb-item').length,1,'Slash within a business label remains one explicit segment');assert.equal(host.querySelector('.arco-breadcrumb-item').textContent,'SYN / 原标签');assert.equal(host.querySelector('a'),null);
 console.log('PASS Breadcrumb: actual production renderer uses explicit root Arco segments, no invented navigation, document NEW override+StrictMode cleanup, empty route inert.');
}finally{if(root)await cleanupAct(async()=>root.unmount());dom.window.close();await rm(temp,{recursive:true,force:true});}

