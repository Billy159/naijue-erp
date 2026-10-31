import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Existing project DOM-test pattern: only this page package, synthetic readers/commands.
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const require = createRequire(path.join(source, 'package.json'));
const { build } = require('esbuild'), { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="page"></div>', { url: 'https://settings.synthetic.invalid', pretendToBeVisual: true });
for (const key of ['window','document','HTMLElement','HTMLIFrameElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLInputElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__settingsRuntimeEvaluated = [];
dom.window.matchMedia = media => ({ media, matches:false, addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;} });
const temporary = await mkdtemp(path.join(tmpdir(), 'erp-settings-runtime-'));
const built = await build({ stdin:{ contents:`export {act,createElement,StrictMode} from 'react';export {createRoot} from 'react-dom/client';export {StoreSettingsRuntime} from './apps/web/demo-replica/frontend/runtime/settings/stores-page.tsx';export {ReadContext} from './apps/web/src/loading/read-scope.ts';export {createStoreMaintenanceWorkspace} from './apps/web/src/settings/stores/maintenance-controller.ts';export {StoreCommandError} from './apps/web/src/settings/stores/maintenance-contracts.ts';export {HttpQueryError} from './apps/web/src/transport/http-query.ts';`,resolveDir:source,loader:'tsx' }, outfile:path.join(temporary,'page.mjs'), bundle:true,metafile:true,platform:'browser',format:'esm',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'existing-project-react',setup(api){api.onResolve({filter:/\.css(?:\?inline)?$/},args=>({path:args.path,namespace:'test-css'}));api.onLoad({filter:/.*/,namespace:'test-css'},()=>({contents:'export default "";',loader:'js'}));api.onResolve({filter:/^(react|react-dom)(\/.*)?$/},args=>({path:require.resolve(args.path),external:true}));api.onLoad({filter:/runtime\/settings\/(store-form|audit-drawer)\.tsx$/},async args=>({contents:`globalThis.__settingsRuntimeEvaluated.push(${JSON.stringify(path.basename(args.path))});\n`+await (await import('node:fs/promises')).readFile(args.path,'utf8'),loader:'tsx'}));}}],banner:{js:`import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(path.join(source,'package.json'))});`},logLevel:'warning' });
assert.equal(Object.keys(built.metafile.inputs).some(file=>/apps\/web\/src\/(application\/|settings\/stores\/(stores-page|demo-store-view|maintenance-form)|settings\/audit\/audit-entry)/.test(file)),false,'replica bundle imports no old page body/application root');
const { act, createElement:h, StrictMode, createRoot, StoreSettingsRuntime, ReadContext, createStoreMaintenanceWorkspace, StoreCommandError, HttpQueryError } = await import(pathToFileURL(path.join(temporary,'page.mjs')).href);
const root = createRoot(document.getElementById('page'));
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const halls = Array.from({length:41},(_,index)=>({ kind:'stores',id:uuid(index+1),name:`合成营业厅${index+1}`,enabled:true,version:3,createdAt:null,updatedAt:null,defaultCustomer:null,defaultWarehouse:null }));
const warehouses = [{ kind:'warehouses',id:uuid(200),name:'合成仓库',enabled:true,version:4,createdAt:null,updatedAt:null,hall:{id:uuid(1),name:halls[0].name},stockFacts:null }];
const calls = [], directoryCalls = [], commands = [], receipts = [];
let context, workspace, serial=0, auditReads=0, keyCount=0, failList=false;
const settle = (ms=25) => act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});
const button = text => [...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
const modal = () => document.querySelector('.bs-modal');
const shadowAll=(selector,root=document)=>[...root.querySelectorAll(selector),...[...root.querySelectorAll('*')].flatMap(node=>node.shadowRoot?shadowAll(selector,node.shadowRoot):[])];
const selectView=host=>host?.querySelector('.arco-select-view')??(host?.shadowRoot?.querySelector('.arco-select-view'))??(host&&shadowAll('.arco-select-view',host)[0]);
const click = async node => { assert.ok(node,'click target');await act(async()=>node.click());await settle(); };
const input = async (node,value) => { assert.ok(node,'input target');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});await settle(); };
async function fresh() {
  await act(async()=>root.render(null));context?.clear();calls.length=0;directoryCalls.length=0;commands.length=0;receipts.length=0;auditReads=0;keyCount=0;failList=false;
  context=new ReadContext({accountId:'SYNTHETIC',sessionRevision:String(++serial),permissionRevision:'1'});
  const scope=context.createScope('settings-route'), session=context.createScope('session');
  workspace=createStoreMaintenanceWorkspace({scope:session,writesEnabled:()=>true,newRequestKey:()=>`original-${++keyCount}`,onAccessFailure(){},client:{
    async execute(kind,command){commands.push(command);throw new StoreCommandError('network','NETWORK_ERROR','uncertain');},
    async receipt(kind,command){receipts.push(command);return {requestKey:command.requestKey,action:command.action,status:'COMMITTED',completedAt:'2026-10-24T18:00:00Z',result:{operationId:uuid(900),kind:kind==='stores'?'HALL':'WAREHOUSE',targetId:command.id??uuid(901),version:command.action==='CREATE'?1:command.expectedVersion+1}};}
  }});
  const reader={async readList(kind,read){calls.push({kind,query:read.parameters,signal:read.signal});if(failList)throw new HttpQueryError('unavailable','SERVICE_UNAVAILABLE');const q=read.parameters,items=(kind==='stores'?halls:warehouses).filter(row=>row.name.includes(q.search)&&(!q.hallId||row.hall?.id===q.hallId));return {page:q.page,pageSize:q.pageSize,total:items.length,items:items.slice((q.page-1)*q.pageSize,q.page*q.pageSize)};},async readDetail(kind,read){return {item:(kind==='stores'?halls:warehouses).find(row=>row.id===read.parameters.id)??null};}};
  const directory={async read(kind,q){directoryCalls.push({kind,q});const items=kind==='halls'?halls:[];return {page:q.page,pageSize:q.pageSize,total:items.length,items:items.slice((q.page-1)*q.pageSize,q.page*q.pageSize).map(row=>({id:row.id,name:row.name}))};}};
  const audit={allowedModules:['HALL','WAREHOUSE'],hasUnresolvedWrite:()=>workspace.hasUnresolvedWrite(),reader:{async readQuery(read){auditReads++;return {items:[],total:0,page:read.parameters.page,pageSize:read.parameters.pageSize};}}};
  await act(async()=>root.render(h(StrictMode,null,h(StoreSettingsRuntime,{scope,reader,maintenance:{workspace,directory},audit,allowHallDirectoryRead:true,onAccessFailure(){}}))));await settle(60);
}
test('replica first tab is lazy and server total/page use executed query while filter draft survives',async()=>{
  await fresh();assert.ok(document.querySelector('tbody'));assert.deepEqual(globalThis.__settingsRuntimeEvaluated,[]);assert.equal(calls.every(call=>call.kind==='stores'),true);assert.equal(directoryCalls.length,0);assert.equal(auditReads,0);assert.match(document.body.textContent,/共 41 条/);
  await input(document.querySelector('input[aria-label="搜索营业厅名称"]'),'未应用草稿');failList=true;await click(document.querySelector('button[aria-label="第2页"]'));assert.match(document.body.textContent,/资料尚未准备好/);failList=false;await click(button('重试'));
  assert.equal(calls.at(-1).query.page,2);assert.equal(calls.at(-1).query.search,'');assert.equal(document.querySelector('input[aria-label="搜索营业厅名称"]').value,'未应用草稿');
  const hallTable=document.querySelector('.bs-table-wrap');hallTable.scrollTop=77;await act(async()=>hallTable.dispatchEvent(new Event('scroll',{bubbles:true})));
  await click([...document.querySelectorAll('[role="tab"]')].find(node=>node.textContent==='仓库'));assert.equal(calls.at(-1).kind,'warehouses');assert.equal(directoryCalls.length,0);assert.equal(document.querySelector('.bs-table-wrap').scrollTop,0);
  await click([...document.querySelectorAll('[role="tab"]')].find(node=>node.textContent==='营业厅'));assert.equal(document.querySelector('.bs-table-wrap').scrollTop,77);assert.equal(document.querySelector('input[aria-label="搜索营业厅名称"]').value,'未应用草稿');
  await click(shadowAll('.arco-select-view',document.querySelector('.bs-pager'))[0]);await click(shadowAll('.arco-select-option').find(node=>node.textContent.trim()==='50条/页'));assert.equal(calls.at(-1).query.pageSize,50);await click(button('查询'));assert.equal(calls.at(-1).query.pageSize,50);await click(button('重置'));assert.equal(calls.at(-1).query.pageSize,50);
  await click(button('操作记录'));await settle(60);assert.equal(auditReads,1);
});
test('replica warehouse is single hall and unknown save only reads original receipt',async()=>{
  await fresh();
  await click([...document.querySelectorAll('[role="tab"]')].find(node=>node.textContent==='仓库'));await click(button('编辑'));await settle(60);
  assert.equal(modal().querySelectorAll('[aria-label="所属营业厅"] .arco-input-tag').length,0);assert.equal(workspace.getSnapshot().warehouses.record.version,4);
  await input(modal().querySelector('input[aria-label="名称"]'),'结果待确认仓');await click(button('确定'));assert.equal(commands.length,1);const original=commands[0];assert.equal(original.values.hallId,uuid(1));assert.equal(workspace.getSnapshot().warehouses.getSnapshot().write.phase,'uncertain');
  await click(button('取消'));assert.ok(Boolean(button('查询提交结果')));assert.equal(commands.length,1);await click(button('查询提交结果'));await settle(60);assert.equal(receipts[0],original);assert.equal(keyCount,1);assert.equal(workspace.getSnapshot().warehouses,null);
});
test('store and warehouse dirty Cancel, close icon and Escape dismiss directly with no write or extra prompt',async()=>{
  await fresh();
  for(const [kind,label] of [['stores','营业厅'],['warehouses','仓库']]) {
    await click([...document.querySelectorAll('[role="tab"]')].find(node=>node.textContent===label));
    for(const mode of ['cancel','icon','escape']) {
      await click(button('新增'+label));await settle(60);
      const editor=workspace.getSnapshot()[kind];await input(modal().querySelector('input[aria-label="名称"]'),'未保存'+label);
      assert.equal(button('继续填写') === undefined,true,'no extra popup leave action');assert.equal(button('放弃本次填写') === undefined,true,'no extra popup leave action');
      if(mode==='cancel')await click(button('取消'));
      else if(mode==='icon')await click(modal().querySelector('.arco-modal-close-icon'));
      else {await act(async()=>modal().querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,bubbles:true})));await settle();}
      assert.equal(modal() === null,true,'modal dismissed');assert.equal(workspace.getSnapshot()[kind],null);assert.equal(editor.getSnapshot().draft,null);
      assert.equal(commands.length,0);assert.equal(keyCount,0);assert.equal(receipts.length,0);
    }
    await click(button('新增'+label));await settle(60);assert.equal(modal().querySelector('input[aria-label="名称"]').value,'');await click(button('取消'));
  }
});
test.after(async()=>{await act(async()=>root.unmount());context?.clear();dom.window.close();await rm(temporary,{recursive:true,force:true});});
