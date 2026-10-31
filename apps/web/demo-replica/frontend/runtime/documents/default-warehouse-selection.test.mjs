/** Actual form/session/reference controls; synthetic bounded reader, no services or PG. */
import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('actual sales hall selection consumes only eligible warehouse recommendation and protects manual/late edits',async t=>{
 const dir=await mkdtemp(path.join(here,'.default-warehouse-')),dom=new JSDOM('<div id="root"></div>',{url:'https://warehouse.test',pretendToBeVisual:true});let root,fixture;
 for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','innerWidth','innerHeight'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.IS_REACT_ACT_ENVIRONMENT=true;dom.window.matchMedia=media=>({matches:false,media,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});HTMLElement.prototype.scrollTo=function(){};
 const {act,createElement:h}=await import('react'),{createRoot}=await import('react-dom/client');
 const deep=(selector,node=document)=>[...node.querySelectorAll(selector),...[...node.querySelectorAll('*')].flatMap(el=>el.shadowRoot?deep(selector,el.shadowRoot):[])];
 const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
 try{
  const output=path.join(dir,'form.mjs');await build({stdin:{contents:"export {SalesProposalForm} from './proposal-form.tsx';export {SalesProposalSession} from '../../../../src/current-form/sales-proposal.ts';export {ReadContext} from '../../../../src/loading/read-scope.ts';",resolveDir:here,loader:'tsx'},outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'css-preview-only',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({loader:'js',contents:'export default "";'}));b.onLoad({filter:/products\/preview\.tsx$/},()=>({loader:'tsx',contents:'export const ProductCandidatePreview=()=>null;'}));}}]});
  const {SalesProposalForm,SalesProposalSession,ReadContext}=await import(pathToFileURL(output).href),host=document.getElementById('root'),ref=(n,name,hallId=null,extra={})=>({id:id(n),name,code:null,hallId,hallName:hallId?'SYN hall':null,paymentMethodId:null,paymentMethodName:null,...extra}),hall=ref(1,'SYN hall A',id(1)),otherHall=ref(2,'SYN hall B',id(2)),manual=ref(10,'SYN manual',hall.id,{isRecommended:false}),recommended=ref(11,'SYN recommended',hall.id,{isRecommended:true}),page=(items,extra={})=>({page:1,pageSize:20,exactTotal:BigInt(items.length),items,...extra});
  async function mount(scenario){
   const context=new ReadContext({accountId:id(99),sessionRevision:'1',permissionRevision:'1'}),scope=context.createScope(scenario),calls=[],pending=[];let count=0;
   const session=new SalesProposalSession(scope,{readProducts:async()=>page([]),readProductSkus:async()=>page([]),readSalesReferences:async(query,signal)=>{calls.push({...query});if(query.kind==='hall')return page([hall,otherHall]);if(query.kind==='salesperson')return page([ref(70,'SYN staff')]);if(query.kind==='customer')return page([ref(71,'SYN customer',null,{code:'SYN-KH'})]);if(query.kind!=='warehouse')throw Error('unexpected reference');count++;const response=scenario==='unavailable'?page([manual],{recommendationAvailability:'UNAVAILABLE'}):scenario==='legacy'?page([ref(10,'SYN manual',hall.id)]):scenario==='no-default'?page([manual],{recommendationAvailability:'AVAILABLE'}):scenario==='paged-no-default'?page(Array.from({length:20},(_,n)=>ref(20+n,'SYN '+n,hall.id,{isRecommended:false})),{exactTotal:21n,recommendationAvailability:'AVAILABLE'}):scenario==='wrong-hall'?page([{...recommended,hallId:otherHall.id}],{recommendationAvailability:'AVAILABLE'}):page([manual,recommended],{recommendationAvailability:'AVAILABLE'});
    if(['manual-open','manual-choice','clear','switch-hall','unmount','busy','abort'].includes(scenario)&&count===1)return new Promise(resolve=>pending.push(()=>resolve(response)));
    return response;}});
   const props={session,scope,productReader:{},denied:e=>{throw e;},busy:false,actions:null,...(['existing','existing-retained'].includes(scenario)?{number:'SYN-SAVED'}:{})};if(scenario==='existing-retained'){await session.openPicker('hall');await session.select(hall.id);await session.openPicker('warehouse');await session.select(manual.id);}
   fixture={context,scope,session,calls,pending,props};root=createRoot(host);await act(async()=>root.render(h(SalesProposalForm,props)));return fixture;
  }
  async function open(label){const control=deep('[aria-label="'+label+'"]').find(node=>node.classList.contains('arco-select'));assert.ok(control,label);await act(async()=>control.click());await settle();}
  async function choose(name){const option=deep('.arco-select-option').find(node=>node.textContent===name);assert.ok(option,name);await act(async()=>option.click());await settle();}
  await t.test('DOC01 blank-hall controls explain context without fake empty menus, then allow real selections',async sub=>{
   const f=await mount('no-default');sub.after(async()=>{if(root){await act(async()=>root.unmount());root=null;}f.context.clear();fixture=null;});
   await act(async()=>root.render(h(SalesProposalForm,{...f.props,notice:'SYN existing notice'})));
   const control=label=>deep('[aria-label="'+label+'"]').find(node=>node.classList.contains('arco-select'));
   for(const label of ['营业员','客户','出库仓']){
    assert.equal(control(label).classList.contains('arco-select-disabled'),false,label+' must remain actionable before hall');
    await open(label);assert.match(host.querySelector('#sale-error').textContent,/请先选择营业厅/);assert.match(host.querySelector('#sale-error').textContent,/SYN existing notice/);
    assert.notEqual(control(label).getAttribute('aria-expanded'),'true','missing context is not an empty candidate menu');assert.equal(f.calls.length,0,'no unscoped reference query');assert.equal(f.session.getSnapshot().picker,null);
   }
   await open('营业厅');await choose(hall.name);await open('营业员');await choose('SYN staff');await open('客户');await choose('SYN customer');await open('出库仓');await choose(manual.name);
   assert.equal(f.session.getSnapshot().draft.salesperson.id,id(70));assert.equal(f.session.getSnapshot().draft.customer.id,id(71));assert.equal(f.session.getSnapshot().draft.warehouse.id,manual.id);
   await act(async()=>root.render(h(SalesProposalForm,{...f.props,busy:true})));
   for(const label of ['营业员','客户','出库仓'])assert.equal(control(label).classList.contains('arco-select-disabled'),true,'busy still blocks '+label);
  });
  for(const scenario of ['recommended','no-default','legacy','unavailable','paged-no-default','wrong-hall','existing','existing-retained','manual-open','manual-choice','clear','switch-hall','unmount','busy','abort'])await t.test(scenario,async sub=>{
   const f=await mount(scenario);sub.after(async()=>{if(root){await act(async()=>root.unmount());root=null;}for(const release of f.pending)release();f.context.clear();fixture=null;});
   if(scenario==='existing-retained'){assert.equal(f.session.getSnapshot().draft.warehouse?.id,manual.id);assert.equal(f.calls.filter(q=>q.kind==='warehouse').length,1);return;}
   await open('营业厅');await choose(hall.name);
   if(scenario==='recommended'){assert.equal(f.session.getSnapshot().draft.warehouse?.id,recommended.id,'select the proven default even when it is not the first row');await open('出库仓');await choose(manual.name);assert.equal(f.session.getSnapshot().draft.warehouse?.id,manual.id,'a nondefault warehouse remains manually selectable');}
   else if(['no-default','legacy','unavailable','paged-no-default','wrong-hall','existing'].includes(scenario)){assert.equal(f.session.getSnapshot().draft.warehouse,null,'no unique-candidate/name fallback');if(scenario==='paged-no-default')assert.equal(f.calls.filter(q=>q.kind==='warehouse').length,1,'backend orders defaults first; do not enumerate warehouses');if(scenario==='existing')assert.equal(f.calls.some(q=>q.kind==='warehouse'),false);}
   else{
    assert.equal(f.pending.length,1);
    if(scenario==='manual-open'||scenario==='manual-choice'){await open('出库仓');if(scenario==='manual-choice')await choose(manual.name);}
    if(scenario==='clear')await act(async()=>f.session.clearReference('warehouse'));
    if(scenario==='switch-hall'){await open('营业厅');await choose(otherHall.name);}
    if(scenario==='unmount'){await act(async()=>root.unmount());root=null;}
    if(scenario==='busy')await act(async()=>root.render(h(SalesProposalForm,{...f.props,busy:true})));
    if(scenario==='abort')await act(async()=>f.context.clear());
    await act(async()=>f.pending[0]());await settle();
    if(scenario==='manual-choice')assert.equal(f.session.getSnapshot().draft.warehouse?.id,manual.id);
    else assert.equal(f.session.getSnapshot().draft.warehouse,null,'late default must not overwrite current intent');
    if(scenario==='manual-open')assert.equal(f.session.getSnapshot().picker?.kind,'warehouse','default must not close the manual menu');
   }
  });
 }finally{if(root)await act(async()=>root.unmount());fixture?.context.clear();dom.window.close();await rm(dir,{recursive:true,force:true});}
});
