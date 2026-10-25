import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../../..'),require=createRequire(path.join(source,'package.json')),{build}=require('esbuild'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><div id="page"></div>',{url:'https://parties.synthetic.invalid',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLIFrameElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLInputElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.matchMedia=media=>({media,matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}});
const folder=await mkdtemp(path.join(tmpdir(),'erp-party-runtime-'));
const output=await build({stdin:{contents:`export {act,createElement,StrictMode} from 'react';export {createRoot} from 'react-dom/client';export {PartyRuntime,PartiesRuntime} from './apps/web/demo-replica/frontend/runtime/settings/parties-page.tsx';export {ReadContext} from './apps/web/src/loading/read-scope.ts';export {createPartyWorkspace} from './apps/web/src/parties/controller.ts';export {PartyClientError} from './apps/web/src/parties/contracts.ts';`,resolveDir:source,loader:'tsx'},outfile:path.join(folder,'entry.mjs'),bundle:true,metafile:true,platform:'browser',format:'esm',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'project-react',setup(api){api.onResolve({filter:/\.css(?:\?inline)?$/},args=>({path:args.path,namespace:'test-css'}));api.onLoad({filter:/.*/,namespace:'test-css'},()=>({contents:'export default "";',loader:'js'}));api.onResolve({filter:/^(react|react-dom)(\/.*)?$/},args=>({path:require.resolve(args.path),external:true}));}}],banner:{js:`import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(path.join(source,'package.json'))});`},logLevel:'warning'});
assert.equal(Object.keys(output.metafile.inputs).some(file=>/apps\/web\/src\/(application\/|parties\/(party-route|party-form)\.tsx)/.test(file)),false);
const {act,createElement:h,StrictMode,createRoot,PartyRuntime,PartiesRuntime,ReadContext,createPartyWorkspace,PartyClientError}=await import(pathToFileURL(path.join(folder,'entry.mjs')).href);
const shadowAll=(selector,root=document)=>[...root.querySelectorAll(selector),...[...root.querySelectorAll('*')].flatMap(node=>node.shadowRoot?shadowAll(selector,node.shadowRoot):[])];
const selectView=host=>host?.querySelector('.arco-select-view')??(host?.shadowRoot?.querySelector('.arco-select-view'))??(host&&shadowAll('.arco-select-view',host)[0]);
const root=createRoot(document.getElementById('page')),uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const records={CUSTOMER:{id:uuid(1),code:'000001',name:'合成同名单位',enabled:true,version:3,createdAt:null,updatedAt:null},SUPPLIER:{id:uuid(2),code:'000007',name:'合成同名单位',enabled:true,version:5,createdAt:null,updatedAt:null}};
const reads=[],commands=[],receipts=[],context=new ReadContext({accountId:'SYNTHETIC',sessionRevision:'1',permissionRevision:'1'});let keys=0,uncertain=true;
const workspace=createPartyWorkspace({scope:context.createScope('session'),newRequestKey:()=>`party-original-${++keys}`,onAccessFailure(){},client:{
 async list(kind,q){reads.push({kind,q});const item=records[kind],items=item.name.includes(q.search)?[item]:[];return {items,total:items.length,page:q.page,pageSize:q.pageSize};},async detail(kind){return records[kind];},async candidates(kind,q){return {items:[records[kind]],total:1,page:q.page,pageSize:q.pageSize};},
 async execute(kind,command){commands.push({kind,command});if(uncertain){uncertain=false;throw new PartyClientError('network','NETWORK_ERROR','uncertain');}return {operationId:uuid(100),kind,partyId:command.id??uuid(90),version:command.action==='CREATE'?1:command.expectedVersion+1,code:records[kind].code,enabled:'enabled'in command?command.enabled:true};},
 async receipt(kind,key){receipts.push({kind,key});throw new PartyClientError('not-found','RECEIPT_NOT_FOUND','read',404);}
}});
const settle=(ms=25)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});
async function draw(kind){await act(async()=>root.render(h(StrictMode,null,h(PartyRuntime,{workspace,kind}))));await settle(60);}
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text),modal=()=>document.querySelector('.bs-modal');
async function click(node){assert.ok(node);await act(async()=>node.click());await settle();}
async function input(node,value){assert.ok(node);await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});await settle();}
test('split replica routes isolate kind identity and draft; approved tag removal keeps frozen fields and codes',async()=>{
 await draw('CUSTOMER');assert.equal(reads.every(read=>read.kind==='CUSTOMER'),true);assert.equal(document.querySelector('h1').textContent,'客户');assert.equal(document.querySelectorAll('[aria-label="标签"]').length,0);assert.match(document.body.textContent,/000001/);
 await input(document.querySelector('input[aria-label="搜索名称或编码"]'),'未应用客户草稿');await draw('SUPPLIER');assert.equal(document.querySelector('h1').textContent,'供应商');assert.match(document.body.textContent,/000007/);assert.equal(document.querySelector('input[aria-label="搜索名称或编码"]').value,'');
 await draw('CUSTOMER');assert.equal(document.querySelector('input[aria-label="搜索名称或编码"]').value,'未应用客户草稿');assert.equal(reads.at(-1).q.search,'');
 await click(button('新增客户'));await settle(60);await input(modal().querySelector('input[aria-label="名称"]'),'客户草稿');await act(async()=>modal().querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,bubbles:true})));await settle();assert.ok(button('继续填写'));await click(button('继续填写'));assert.equal(modal().querySelector('input[aria-label="名称"]').value,'客户草稿');assert.equal(keys,0);await click(button('取消'));await click(button('放弃本次填写'));
});
test('supplier native atomic edit stays supplier through absent receipt and explicit original replay',async()=>{
 await draw('SUPPLIER');await click(button('编辑'));await settle(60);assert.equal(modal().querySelector('[role="textbox"][aria-label="编码"]').textContent,'000007');await input(modal().querySelector('input[aria-label="名称"]'),'供应商改名');await click(button('确定'));
 assert.equal(commands.length,1);assert.equal(commands[0].kind,'SUPPLIER');const original=commands[0].command;assert.equal(original.id,records.SUPPLIER.id);assert.equal(original.expectedVersion,5);assert.equal('code'in original,false);
 await click(button('查询原操作回执'));assert.equal(receipts[0].kind,'SUPPLIER');assert.equal(receipts[0].key,original.requestKey);assert.equal(workspace.get('SUPPLIER').getSnapshot().write.phase,'uncertain');await click(button('取消'));assert.ok(button('重放原请求'));
 await click(button('重放原请求'));await settle(60);assert.equal(commands[1].command,original);assert.equal(keys,1);assert.equal(workspace.get('SUPPLIER').getSnapshot().editor,null);assert.equal(workspace.get('CUSTOMER').getSnapshot().editor,null);
});
test('combined party tabs retain separate identities and block leaving a dirty editor',async()=>{
 await act(async()=>root.render(h(StrictMode,null,h(PartiesRuntime,{workspace}))));await settle(60);
 assert.equal(document.querySelector('h1').textContent,'往来单位');
 await click(shadowAll('[class*="-clear-icon"]').find(node=>node.getRootNode() instanceof ShadowRoot));await click(button('查询'));assert.equal(reads.at(-1).q.enabled,'ALL');await click(button('重置'));
 const tab=label=>[...document.querySelectorAll('[role="tab"]')].find(node=>node.textContent===label);
 await click(button('新增客户'));await settle(60);await input(modal().querySelector('input[aria-label="名称"]'),'切换保护草稿');
 const before=reads.length;await click(tab('供应商'));assert.equal(tab('客户').getAttribute('aria-selected'),'true');assert.equal(reads.length,before);assert.equal(modal().querySelector('input[aria-label="名称"]').value,'切换保护草稿');
 await click(button('继续填写'));await click(button('取消'));await click(button('放弃本次填写'));await click(tab('供应商'));assert.equal(tab('供应商').getAttribute('aria-selected'),'true');assert.match(document.body.textContent,/000007/);assert.doesNotMatch(document.body.textContent,/000001/);
});
test.after(async()=>{await act(async()=>root.unmount());context.clear();dom.window.close();await rm(folder,{recursive:true,force:true});});
