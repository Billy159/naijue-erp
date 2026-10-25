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
 await build({...buildOptions,outfile:leaveOutput,plugins:[...buildOptions.plugins,{name:'host-leave-page-double',setup(b){b.onLoad({filter:/ready-pages\.tsx$/},()=>({loader:'tsx',contents:'export function createReadyPageMounts(){return {hasUnresolvedWrite:()=>false,dispose(){},async mount(host){host.textContent="UNSAVED TEST PAGE";return {canLeave:()=>false,canDiscard:()=>true,discard:()=>true,dispose:()=>host.replaceChildren()};}};}'}));}}]});
 const leaf=await import(pathToFileURL(leaveOutput).href);
 const session2=leaf.createReplicaSession({origin:'https://catalogue.test',basePath:'/api',fetch:async()=>json({principal:{accountId:id(900),staffId:id(901),loginName:'SYNTHETIC-ONLY',role:'ADMIN',hallId:null,authVersion:1}})});
 await act(async()=>{runtime=leaf.mountNormalReplica({session:session2,page,app:document.getElementById('app'),accountHost:document.getElementById('account'),breadcrumb:document.getElementById('breadcrumb'),transportMode:'same-origin-https',routes:{},newRequestKey:()=>id(600),inventory:{ledgerDialog:document.createElement('dialog'),createWorkbook(){}},catalogue:{onChanged(){}}});});await settle();
 await act(async()=>runtime.navigate('sales/new'));await settle();
 assert.match(document.querySelector('[data-document-leave]')?.textContent??'',/有未保存的修改/);
 await act(async()=>session2.onAccessFailure({kind:'forbidden'}));await settle();
 assert.equal(document.querySelector('[data-document-leave]').childElementCount,0,'invalidated page closes independent leave confirmation');
 assert.ok(page.querySelector('[role=alert] button'),'permission verification cannot be blocked by stale leave modal');
 console.log('PASS normal host403 explicit recovery/no retry, navigation/identity cleanup/no write replay; host-owned dirty-leave dialog closes on access loss. Synthetic HTTP and isolated page double only.');
}finally{await act(async()=>runtime?.dispose());dom.window.close();await rm(temp,{recursive:true,force:true});}
