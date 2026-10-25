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
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=await import('react');
let runtime;
try {
 const output=path.join(temp,'host.mjs');
 await build({stdin:{contents:"export {mountNormalReplica} from './runtime-host.tsx';export {createReplicaSession} from './session.ts';",resolveDir:here,sourcefile:'host.tsx',loader:'tsx'},outfile:output,bundle:true,platform:'browser',format:'esm',external:['react','react-dom','react-dom/*'],jsx:'automatic',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'nonvisual-source-css',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({contents:'export default "";',loader:'js'}));}}],logLevel:'warning'});
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
 await act(async()=>{runtime=mountNormalReplica({session,page,app:document.getElementById('app'),accountHost:document.getElementById('account'),breadcrumb:document.getElementById('breadcrumb'),transportMode:'same-origin-https',routes:{inventory:false,sales:false,transfers:false,productCategories:true,productSettings:{colors:true,fits:false,groups:false,seasons:false,initialTab:'colors'}},newRequestKey:()=>id(500),inventory:{ledgerDialog:document.createElement('dialog'),createWorkbook:()=>{throw Error('Not inventory');}},catalogue:{onChanged(){}}});});
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
 console.log('PASS actual normal host:403 visible explicit reverify/no auto retry, authorized recovery, navigation and identity cleanup/no write replay. Synthetic HTTP only.');
}finally{await act(async()=>runtime?.dispose());dom.window.close();await rm(temp,{recursive:true,force:true});}
