/** Actual new-document completion callbacks; body/command doubles, no network/PG. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
test('confirmed new sales/transfer commit clears stale list filters only; size and noncommit/discard state survive',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'document-save-list-')),dom=new JSDOM('<div id="root"></div>');
 for(const k of ['window','document','HTMLElement','Event'])Object.defineProperty(globalThis,k,{configurable:true,value:dom.window[k]});Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const {act,createElement:h}=await import('react'),{createRoot}=await import('react-dom/client');let root;
 try{
  const out=path.join(dir,'pages.mjs');await build({stdin:{contents:"export {default as Sales} from './sales-new-page.tsx';export {default as Transfer} from './transfers-create-page.tsx';export {newSalesListViewState as salesView} from './sales-list-state.ts';export {newTransferListViewState as transferView} from './transfers-list-state.ts';",resolveDir:here,loader:'tsx'},outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',plugins:[{name:'isolated-command-presentation',setup(b){
   b.onResolve({filter:/^react(?:-dom)?(?:\/.*)?$/},a=>({path:require.resolve(a.path),external:true}));
   b.onLoad({filter:/\/(proposal-form|transfer-proposal-form)\.tsx$/},()=>({loader:'tsx',contents:'export const SalesProposalForm=p=><div>{p.actions}</div>;export const TransferProposalForm=p=><div>{p.actions}</div>;export const salesPaymentSummary=()=>"";'}));
   b.onLoad({filter:/sales-write-recovery\.tsx$/},()=>({loader:'tsx',contents:'export const WriteRecovery=()=>null;'}));
   b.onLoad({filter:/native-dialog\.tsx$/},()=>({loader:'tsx',contents:'export const SaleDialog=p=><div role="dialog">{p.children}{p.footer}</div>;'}));
  }}]});
  const a=await import(pathToFileURL(out).href),host=document.getElementById('root');
  for(const sales of [true,false])for(const outcome of ['committed','uncertain','rejected','cancel']){
   const view=a[sales?'salesView':'transferView']();view.applied.number='OLD-NUMBER';view.draft.number='UNAPPLIED-SEARCH';view.applied.startDate='2020-01-01';view.draft.startDate='2020-01-01';view.size=100;view.more=true;view.scrollTop=200;view.scrollLeft=50;view.requested={sequence:7,draft:structuredClone(view.applied)};
   const before=structuredClone(view),scope={active:true,identity:{},signal:new AbortController().signal};let command=sales?{command:{write:{phase:'idle'}}}:{write:{phase:'idle'}},writes=0,resets=0;const routes=[];
   const stable=getSnapshot=>({getSnapshot,subscribe:()=>()=>{}}),draft={note:'retained draft',salesperson:{id:'staff'}},proposalState={draft,dirty:true,lineEdit:null,replacement:null,entries:{},pending:{product:null,query:'',quantities:{}}},created={preparing:false};
   const proposal={...stable(()=>proposalState),reset:()=>{resets++;return true;}},editor={...stable(()=>command),commands:{hasUnresolvedWrite:false},discardEditor:()=>true,canLeave:()=>false},workspace={...stable(()=>command),hasUnresolvedWrite:false,discardEditor:()=>true,canLeave:()=>false};
   const create={...stable(()=>created),save:async()=>{writes++;if(outcome==='rejected')throw Error('synthetic rejection');const write={phase:outcome,result:outcome==='committed'?(sales?{salesId:'new-id'}:{transferId:'new-id'}):null};command=sales?{command:{write}}:{write};}};
   const session={scope,proposal,create,editor,workspace,currentEmployee:{id:null},presentation:{businessChoice:'SALE',salespersonDefault:{attempted:true}},historyOwners:new Map()};
   root=createRoot(host);await act(async()=>root.render(h(a[sales?'Sales':'Transfer'],{session,scope,view,reset(){resets++;},onCommitted(){resets++;},onDiscarded(){resets++;},navigate:route=>routes.push(route),productReader:{},denied(){throw Error('unexpected access failure');}})));
   const click=async text=>{const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(button,text);await act(async()=>button.click());};
   if(outcome==='cancel'){await click('返回列表');await click('放弃修改并离开');}else await click('保存');
   if(outcome==='committed'){
    assert.equal(view.applied.number,'');assert.equal(view.draft.number,'');assert.equal(view.applied.startDate,'');assert.equal(view.draft.startDate,'');assert.equal(view.requested,undefined);assert.equal(view.scrollTop,0);assert.equal(view.scrollLeft,0);assert.equal(view.reload,true);assert.equal(view.size,100);assert.equal(view.more,true);assert.ok(resets>0);assert.equal(routes[0],sales?'sales/view/new-id':'transfer/view/new-id');
   }else{assert.deepEqual(view,before,'only confirmed new commit resets query state');if(outcome!=='cancel'){assert.equal(resets,0);assert.deepEqual(routes,[]);assert.equal(session.proposal.getSnapshot().draft,draft);}}
   assert.equal(writes,outcome==='cancel'?0:1,'no automatic write replay');await act(async()=>root.unmount());root=null;
  }
 }finally{if(root)await act(async()=>root.unmount());dom.window.close();await rm(dir,{recursive:true,force:true});}
});
