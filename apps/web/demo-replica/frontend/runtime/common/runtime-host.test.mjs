import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)), temp = await mkdtemp(path.join(here, '.host-access-'));
const dom = new JSDOM('<div id="app"><nav class="sidebar"><a data-route="product-categories">分类</a></nav><div id="account"></div><div id="breadcrumb"></div><main id="page"></main></div>', {url:'https://catalogue.test/#product-categories',pretendToBeVisual:true});
for(const key of ['window','document','history','location','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLDialogElement','HTMLButtonElement','HTMLIFrameElement','HTMLFormElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
dom.window.matchMedia=media=>({matches:false,media,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=await import('react');
let runtime;
try {
 const output=path.join(temp,'host.mjs');
 const buildOptions={stdin:{contents:"export {mountNormalReplica} from './runtime-host.tsx';export {createReplicaSession} from './session.ts';",resolveDir:here,sourcefile:'host.tsx',loader:'tsx'},outfile:output,bundle:true,platform:'browser',format:'esm',external:['react','react-dom','react-dom/*'],jsx:'automatic',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'nonvisual-source-css',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({contents:'export default "";',loader:'js'}));}}],logLevel:'warning'};await build(buildOptions);
 const {mountNormalReplica,createReplicaSession}=await import(pathToFileURL(output).href);
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 let allowed=false; const calls=[];
 const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 const session=createReplicaSession({origin:'https://catalogue.test',basePath:'/api',fetch:async(url,init)=>{
  const endpoint=new URL(url).pathname.slice(4);calls.push(endpoint);
  if(endpoint==='/auth/session')return json({principal:{accountId:id(900),staffId:id(901),loginName:'SYNTHETIC-ONLY',role:'ADMIN',hallId:null,authVersion:1}});
  if(endpoint==='/catalogue-settings-read/categories/query')return allowed?json({total:1,items:[{id:id(70),parentId:null,name:'SYNTHETIC ROOT',displayOrder:0,version:2,code:null,productCount:null,childCount:0}]}):json({error:{code:'FORBIDDEN'}},403);
  if(endpoint==='/catalogue-settings-read/colors/query'){const body=JSON.parse(init.body);return json({page:body.page,pageSize:body.pageSize,total:0,items:[]});}
  throw Error('Unexpected operation '+endpoint);
 }});
 const page=document.getElementById('page'),settle=async()=>{for(let i=0;i<4;i++)await act(async()=>{await new Promise(r=>setTimeout(r,20));});};
 await act(async()=>{runtime=mountNormalReplica({session,page,app:document.getElementById('app'),accountHost:document.getElementById('account'),breadcrumb:document.getElementById('breadcrumb'),transportMode:'same-origin-https',routes:{inventory:false,sales:false,transfers:false,productCategories:true,maintenance:{categories:true},productSettings:{colors:true,fits:false,groups:false,seasons:false,initialTab:'colors'}},newRequestKey:()=>id(500),inventory:{ledgerDialog:document.createElement('dialog'),createWorkbook:()=>{throw Error('Not inventory');}},catalogue:{onChanged(){}}});});
 await settle();
 assert.match(page.querySelector('[role=alert]')?.textContent??'',/访问权限或资料范围已失效/);
 assert.equal(calls.filter(p=>p.endsWith('/categories/query')).length,1,'403 does not automatically retry');
 assert.equal(session.auth.getSnapshot().principal?.role,'ADMIN');assert.equal(page.querySelector('.pc-categories'),null,'rejected data stays unmounted');
 allowed=true;
 await act(async()=>page.querySelector('[role=alert] button').click());await settle();
 assert.ok(page.querySelector('.pc-categories'),'explicit verification restores authorized reader/page');
 assert.equal(calls.filter(p=>p==='/auth/session').length,2);
 assert.equal(calls.filter(p=>p.endsWith('/categories/query')).length,2);
 await act(async()=>runtime.navigate('product-settings'));await settle();
 assert.match(page.textContent,/商品设置/);assert.equal(page.querySelector('[role=alert]'),null,'old disposed route cannot replace current content');
 await act(async()=>session.auth.expire());await settle();
 assert.equal(page.childElementCount,0);assert.ok(document.querySelector('.login-overlay'));assert.equal(page.querySelector('[role=alert]'),null,'logout uses login state, not permission retry');
 assert.equal(calls.some(p=>p.endsWith('/commands')),false,'verification never replays writes');
 await act(async()=>runtime.dispose());runtime=null;
 // A small page double isolates the host-owned leave dialog; business behaviour is covered above.
 const leaveOutput=path.join(temp,'leave-host.mjs');
 await build({...buildOptions,outfile:leaveOutput,plugins:[...buildOptions.plugins,{name:'host-leave-page-double',setup(b){b.onLoad({filter:/ready-pages\.tsx$/},()=>({loader:'tsx',contents:'export function createReadyPageMounts(){return {prepare:async()=>{},hasUnresolvedWrite:()=>false,dispose(){},async mount(host){host.textContent="UNSAVED TEST PAGE";return {canLeave:()=>false,canDiscard:()=>true,discard:()=>true,dispose:()=>host.replaceChildren()};}};}'}));}}]});
 const leaf=await import(pathToFileURL(leaveOutput).href);
 const session2=leaf.createReplicaSession({origin:'https://catalogue.test',basePath:'/api',fetch:async()=>json({principal:{accountId:id(900),staffId:id(901),loginName:'SYNTHETIC-ONLY',role:'ADMIN',hallId:null,authVersion:1}})});
 await act(async()=>{runtime=leaf.mountNormalReplica({session:session2,page,app:document.getElementById('app'),accountHost:document.getElementById('account'),breadcrumb:document.getElementById('breadcrumb'),transportMode:'same-origin-https',routes:{},newRequestKey:()=>id(600),inventory:{ledgerDialog:document.createElement('dialog'),createWorkbook(){}},catalogue:{onChanged(){}}});});await settle();
 await act(async()=>runtime.navigate('sales/new'));await settle();
 assert.match(document.querySelector('[data-document-leave]')?.textContent??'',/有未保存的修改/);
 await act(async()=>session2.onAccessFailure({kind:'forbidden'}));await settle();
 assert.equal(document.querySelector('[data-document-leave]').childElementCount,0,'invalidated page closes independent leave confirmation');
 assert.ok(page.querySelector('[role=alert] button'),'permission verification cannot be blocked by stale leave modal');
 // T27: retain list state across editor resets, but never across read identity invalidation.
 const viewsOutput=path.join(temp,'document-views.mjs');
 await build({...buildOptions,stdin:{...buildOptions.stdin,contents:buildOptions.stdin.contents+"export {createReadyPageMounts} from './ready-pages.tsx';export {ReadContext} from '../../../../src/loading/read-scope.ts';"},outfile:viewsOutput,plugins:[...buildOptions.plugins,{name:'document-view-consumers',setup(b){
  b.onLoad({filter:/documents\/(?:sales-(?:list|new|edit|detail)|transfers-(?:list|detail|create))-page\.tsx$/},()=>({loader:'tsx',contents:'export default function TestPage(){return null;}'}));
  b.onLoad({filter:/documents\/(sales|transfers)-entry\.tsx$/},a=>({loader:'tsx',contents:a.path.endsWith('sales-entry.tsx')?
   'export const newSalesListViewState=()=>({draft:{},applied:{},scrollTop:0});export function mountSales(host,route,options){host.documentView=options.view;host.resetEditor=options.onCommitted;return {dispose(){},canLeave:()=>true};}':
   'export const newTransferListViewState=()=>({draft:{},applied:{},scrollTop:0,reload:false});export function mountTransfers(host,route,options){host.documentView=options.view;host.resetEditor=options.reset;return {dispose(){},canLeave:()=>true};}'}));
  b.onLoad({filter:/documents\/(sales|transfers)-session\.ts$/},a=>({loader:'ts',contents:a.path.endsWith('sales-session.ts')?
   'export function createReplicaSalesSession(session){const scope=session.reads.createScope("test-sales-editor");return {scope,dispose:()=>scope.dispose()};}':
   'export function createReplicaTransferSession(session){const scope=session.reads.createScope("test-transfer-editor");return {scope,dispose:()=>scope.dispose()};}export const transferCanLeave=()=>true;'}));
  b.onLoad({filter:/runtime\/products\/detail-entry\.tsx$/},()=>({loader:'tsx',contents:'export async function mountProductDetail(host,options){host.openProductInventory=options.onOpenInventory;return ()=>{};}'}));
  b.onLoad({filter:/runtime\/inventory\/index\.tsx$/},()=>({loader:'tsx',contents:'export function mountInventoryPage(host,options){host.inventoryOptions=options;return ()=>{};}'}));
 }}]});
 const views=await import(pathToFileURL(viewsOutput).href);
 for(const route of ['sales','transfer']){
  let identity={accountId:id(900),sessionRevision:'s1',permissionRevision:'p1'};
  const reads=new views.ReadContext(identity),documentHost=document.createElement('div');
  const capturedScopes=[],createScope=reads.createScope.bind(reads);reads.createScope=(...args)=>{const scope=createScope(...args);capturedScopes.push(scope);return scope;};
  const documentSession={reads,http:{origin:'https://catalogue.test',basePath:'/api',fetch:async()=>{throw Error('View ownership test must not read HTTP');}},auth:{getSnapshot:()=>({phase:'authenticated',principal:{accountId:identity.accountId,role:'ADMIN'}})},onAccessFailure(){}};
  const pages=views.createReadyPageMounts({session:documentSession,routes:{sales:true,transfers:true},newRequestKey:()=>id(800),inventory:{},catalogue:{}},()=>{});
  const mount=async()=>{const scope=reads.createScope('test-page');const mounted=await pages.mount(documentHost,route,scope);return {view:documentHost.documentView,leave(){mounted.dispose();scope.dispose();}};};
  let active=await mount(),previous=active.view;
  previous.draft={query:'private-customer-A'};previous.applied={page:3};previous.scrollTop=220;
  documentHost.resetEditor();active.leave();active=await mount();
  assert.equal(active.view,previous,route+' ordinary editor reset preserves list owner');assert.equal(active.view.scrollTop,220);
  for(const change of ['account','session','permission','forbidden']){
   active.leave();
   if(change==='forbidden'){reads.clear();reads.replaceIdentity(identity);}else{identity={...identity,...(change==='account'?{accountId:id(902)}:change==='session'?{sessionRevision:'s2'}:{permissionRevision:'p2'})};reads.replaceIdentity(identity);}
   active=await mount();assert.notEqual(active.view,previous,route+' '+change+' must discard old list state');assert.equal(active.view.draft.query,undefined);assert.equal(active.view.scrollTop,0);previous=active.view;
  }
  active.leave();pages.dispose();assert.equal(capturedScopes.every(scope=>!scope.active),true,'dispose releases all list and editor scopes');reads.clear();
 }
 console.log('PASS T27 sales/transfer list state retained on editor reset and discarded on account/session/permission/forbidden changes; all owned scopes disposed. Isolated consumers with real ReadContext.');
 // P13 F01: a refused/failed navigation must not seed a later ordinary inventory visit.
 {
  const reads=new views.ReadContext({accountId:id(900),sessionRevision:'s1',permissionRevision:'p1'}),host=document.createElement('div');
  const session={reads,http:{origin:'https://catalogue.test',basePath:'/api',fetch:async()=>{throw Error('Navigation seam test must not read HTTP');}},auth:{getSnapshot:()=>({principal:{accountId:id(900),role:'ADMIN'}})},onAccessFailure(){}};
  let mode='refused',pages;
  const mountInventory=()=>pages.mount(host,'inventory',reads.createScope('inventory-context-test'));
  pages=views.createReadyPageMounts({session,routes:{products:true,productFullPage:true,inventory:true},inventory:{},catalogue:{},newRequestKey:()=>id(800)},async()=>{
   if(mode==='failed')throw Error('route failed');
   if(mode==='refused')return false;
   await mountInventory();return true;
  });
  const productScope=reads.createScope('product-context-test');
  await pages.mount(host,'products/view/'+id(401),productScope);
  const product={id:id(401),label:'actual product'};
  assert.equal(await host.openProductInventory(product),false);
  let inventory=await mountInventory();assert.equal(host.inventoryOptions.productContext,undefined,'refused jump cannot leak into sidebar inventory');inventory.dispose();
  mode='failed';await assert.rejects(host.openProductInventory(product),/route failed/);
  inventory=await mountInventory();assert.equal(host.inventoryOptions.productContext,undefined,'failed jump cannot leak into sidebar inventory');inventory.dispose();
  mode='accepted';assert.equal(await host.openProductInventory(product),true);assert.deepEqual({...host.inventoryOptions.productContext.product},product,'accepted navigation receives exact product');
  pages.dispose();reads.clear();
 }
 console.log('PASS P13 refused/failed product navigation clears pending context; successful navigation forwards exact product. Isolated route consumers only.');
 console.log('PASS normal host403 explicit recovery/no retry, navigation/identity cleanup/no write replay; host-owned dirty-leave dialog closes on access loss. Synthetic HTTP and isolated page double only.');
}finally{await act(async()=>runtime?.dispose());dom.window.close();await rm(temp,{recursive:true,force:true});}
