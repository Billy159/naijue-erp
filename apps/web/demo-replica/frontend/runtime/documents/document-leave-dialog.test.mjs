/** Actual edit pages/dialogs with bounded model/read doubles; no writes or browser. */
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createRequire} from 'node:module';import {build} from 'esbuild';import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
test('document cancel matches Demo: no dialog for clean edit, retained dirty confirmation and blocked unresolved writes',{timeout:15000},async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'document-leave-')),dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});let root;
 for(const key of ['window','document','HTMLElement','HTMLDialogElement','Event'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const {act,createElement:h}=await import('react'),{createRoot}=await import('react-dom/client');
 try{
  const out=path.join(dir,'pages.mjs');await build({stdin:{contents:"export {ExistingForm as Sales} from './sales-edit-page.tsx';export {default as Transfer} from './transfers-detail-page.tsx';export {ReadContext} from '../../../../src/loading/read-scope.ts';export {detail as transferDetail} from '../../../../src/transfers/tests/fixtures.ts';export {detail as salesDetail} from '../../../../src/sales/tests/fixtures.ts';",resolveDir:here,loader:'tsx'},outfile:out,bundle:true,format:'esm',platform:'node',jsx:'automatic',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'nonvisual-form-and-output',setup(b){
   b.onLoad({filter:/sales-edit-page\.tsx$/},async a=>({loader:'tsx',contents:(await readFile(a.path,'utf8'))+'\nexport {ExistingForm};'}));
   b.onResolve({filter:/^react(?:-dom)?(?:\/.*)?$/},a=>({path:require.resolve(a.path),external:true}));
   b.onLoad({filter:/\/(proposal-form|transfer-proposal-form)\.tsx$/},()=>({loader:'tsx',contents:'export const SalesProposalForm=p=><div data-edit-body>{p.actions}</div>;export const TransferProposalForm=p=><div data-edit-body>{p.actions}</div>;export const salesPaymentSummary=()=>"";'}));
   b.onLoad({filter:/\/(sales-read-body|transfers-view)\.tsx$/},()=>({loader:'tsx',contents:'export const SalesReadBody=p=><div data-read-body>{p.actions}</div>;export const TransferReadBody=p=><div data-read-body>{p.actions}</div>;'}));
   b.onLoad({filter:/sales-write-recovery\.tsx$/},()=>({loader:'tsx',contents:'export const WriteRecovery=()=>null;'}));
   b.onLoad({filter:/\/document-output\.tsx$/},()=>({loader:'tsx',contents:'export const DocumentOutputActions=()=>null;'}));
  }}]});const a=await import(pathToFileURL(out).href),host=document.getElementById('root');
  for(const sales of [true,false])for(const scenario of ['clean','dirty','pending-spec','query-text','uncertain','submitting','invalid-scope','dialog-then-uncertain'])await t.test((sales?'sales ':'transfer ')+scenario,async sub=>{
   const context=new a.ReadContext({accountId:'SYN',sessionRevision:'1',permissionRevision:'1'}),scope=context.createScope('leave'),detail=a[sales?'salesDetail':'transferDetail'](),dirty=['dirty','pending-spec','query-text','dialog-then-uncertain'].includes(scenario),routes=[],listeners=new Set();let discards=0,writes=0,phase='idle';
   sub.after(async()=>{if(root){await act(async()=>root.unmount());root=null;}context.clear();});
   const snapshot={phase:'ready',proposal:{retained:'same draft'},preparing:false},full={getSnapshot:()=>snapshot,subscribe:()=>()=>{},original:detail,get hasDirtyDraft(){return dirty;},initialize:async()=>{},save:async()=>{writes++;}};
   let command=sales?{preparing:false,command:{write:{phase},notice:null}}:{write:{phase},editor:{detail,draft:{retained:'draft'},input:{}},notice:null};
   const emitPhase=next=>{phase=next;command=sales?{...command,command:{...command.command,write:{phase}}}:{...command,write:{phase}};for(const fn of listeners)fn();};
   const owner={getSnapshot:()=>command,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},get hasDirtyDraft(){return dirty;},get existingDocument(){return full;},openExisting:async()=>true,prepareExistingDocument:()=>full,canLeave:()=>!dirty,discardEditor:()=>{if(['uncertain','submitting'].includes(phase))return false;discards++;return true;},submit:async()=>{writes++;},readCurrent:async()=>true,adoptCurrent:()=>true};
   const session={scope,editor:owner,workspace:owner,selection:{row:null},reader:{readDetail:async()=>detail},currentEmployee:{id:null}};
   root=createRoot(host);await act(async()=>root.render(h(a[sales?'Sales':'Transfer'],{id:detail.document.header.id,model:full,session,scope,view:{reload:false},principal:{role:'WAREHOUSE'},existingEdit:true,productReader:{},denied:e=>{throw e;},navigate:route=>routes.push(route),onCommitted(){},retry(){}})));
   const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text),click=async text=>{assert.ok(button(text),text);await act(async()=>button(text).click());};
   if(!sales)await click('修改');assert.ok(host.querySelector('[data-edit-body]'));
   if(scenario==='uncertain'||scenario==='submitting')await act(async()=>emitPhase(scenario));if(scenario==='invalid-scope')await act(async()=>scope.dispose());
   if(scenario!=='invalid-scope'||button('取消修改'))await click('取消修改');
   if(scenario==='clean'){assert.equal(host.querySelector('dialog')===null,true,'unchanged edit must cancel without an extra confirmation');assert.equal(discards,1);if(sales)assert.deepEqual(routes,['sales/view/'+detail.document.header.id]);else assert.equal(host.querySelector('[data-edit-body]')===null,true);}
   else if(['uncertain','submitting','invalid-scope'].includes(scenario)){assert.equal(host.querySelector('dialog.sale-confirm,dialog.tc-danger')===null,true);assert.equal(discards,0);assert.deepEqual(routes,[]);}
   else{
    let dialog=host.querySelector('dialog');assert.ok(dialog);assert.equal(discards,0);assert.equal(full.getSnapshot().proposal,snapshot.proposal);
    const stay=sales?'继续录单':'继续编辑';assert.ok([...dialog.querySelectorAll('button')].some(b=>b.textContent===stay));await click(stay);assert.equal(host.querySelector('dialog')===null,true);assert.equal(discards,0);await click('取消修改');dialog=host.querySelector('dialog');
    if(scenario==='dialog-then-uncertain')await act(async()=>emitPhase('uncertain'));
    const abandon=sales?'放弃修改并离开':'放弃修改';await click(abandon);
    assert.equal(discards,scenario==='dialog-then-uncertain'?0:1);if(scenario==='dialog-then-uncertain')assert.deepEqual(routes,[]);
   }
   assert.equal(writes,0,'cancel never saves or replays');await act(async()=>root.unmount());root=null;context.clear();
  });
 }finally{if(root)await act(async()=>root.unmount());dom.window.close();await rm(dir,{recursive:true,force:true});}
});
