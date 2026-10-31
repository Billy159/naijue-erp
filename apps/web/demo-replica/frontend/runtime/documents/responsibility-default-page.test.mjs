/** Actual NewTransfer/NewDocument effects + actual proposal models/controls; synthetic inert write owners. NOT EXECUTED by preparer. */
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {build} from 'esbuild';import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('actual transfer and sales default effects remain clean, editable, and ignore late/manual/identity/write-loss races',{timeout:20000},async()=>{
 const temp=await mkdtemp(path.join(here,'.responsibility-default-')),dom=new JSDOM('<div id="root"></div>',{url:'https://responsibility.test',pretendToBeVisual:true});
 for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.innerWidth=1400;globalThis.innerHeight=900;HTMLElement.prototype.scrollTo=function(){};dom.window.matchMedia=media=>({matches:false,media,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
 // JSDOM does not implement native dialog methods. This emulates DOM only,
 // never a business command/result, for the uncertain-write presentation case.
 if(dom.window.HTMLDialogElement){dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};}
 const {act,createElement:h}=await import('react'),{createRoot}=await import('react-dom/client');let root,activeFixture;const deferred=[];
 const person={id:uid(10),name:'SYN current staff'},other={id:uid(11),name:'SYN manual staff'},ref=p=>({...p,code:null,hallId:null,hallName:null,paymentMethodId:null,paymentMethodName:null}),page=items=>({page:1,pageSize:20,exactTotal:BigInt(items.length),items}),candidatePage={page:1,pageSize:20,total:2,items:[person,other]};
 const deep=(selector,node=document)=>[...node.querySelectorAll(selector),...[...node.querySelectorAll('*')].flatMap(el=>el.shadowRoot?deep(selector,el.shadowRoot):[])];
 const settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,30));});
 async function until(predicate,label){const deadline=Date.now()+2000;while(Date.now()<deadline){if(predicate())return;await settle();}assert.equal(Boolean(predicate()),true,label);}
 try{
  const output=path.join(temp,'entry.mjs');await build({stdin:{contents:"export {default as NewTransfer} from './transfers-create-page.tsx';export {default as NewSales} from './sales-new-page.tsx';export {TransferProposalSession} from '../../../../src/current-form/transfer-proposal.ts';export {SalesProposalSession} from '../../../../src/current-form/sales-proposal.ts';export {ReadContext} from '../../../../src/loading/read-scope.ts';",resolveDir:here,loader:'tsx'},outfile:output,bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'css',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({loader:'js',contents:'export default "";'}));}}]});
  const {NewTransfer,NewSales,TransferProposalSession,SalesProposalSession,ReadContext}=await import(pathToFileURL(output).href),host=document.getElementById('root');
  const stable=value=>({getSnapshot:()=>value,subscribe:()=>()=>{}});
  function transfer(name,delay=false,directory=candidatePage){const context=new ReadContext({accountId:uid(99),sessionRevision:'1',permissionRevision:'1'}),scope=context.createScope('transfer-default');let calls=0,writes=0,command={write:{phase:'idle'},editor:null,notice:null};const listeners=new Set();let finish;
   const proposal=new TransferProposalSession(scope,{readProducts:async()=>page([]),readProductSkus:async()=>page([]),readTransferWarehouses:async()=>page([])});
   const capability={allowedRoles:['ADMIN'],readCandidates:async()=>{calls++;if(delay&&calls===1)return new Promise(resolve=>{finish=resolve;deferred.push(()=>resolve(directory));});return directory;}};
   const workspace={...stable(command),getSnapshot:()=>command,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},responsibleStaff:capability,get hasUnresolvedWrite(){return command.write.phase==='uncertain';},canLeave:()=>true};
   const session={scope,proposal,currentEmployee:{id:person.id,name},workspace,create:{...stable({preparing:false,notice:null}),save:async()=>{writes++;throw Error('unexpected SAVE');}}};
   return {session,proposal,context,scope,get calls(){return calls;},get writes(){return writes;},release:()=>finish?.(directory),existing(){command={...command,editor:{mode:'EXISTING'}};},writeLoss(){command={...command,write:{phase:'uncertain'}};for(const fn of listeners)fn();}};}
  async function mountTransfer(f){activeFixture=f;root=createRoot(host);await act(async()=>root.render(h(NewTransfer,{session:f.session,scope:f.scope,productReader:{},denied(){throw Error('unexpected denial');},navigate(){},reset(){}})));await settle();}
  async function clear(){if(root){await act(async()=>root.unmount());root=null;}activeFixture?.context.clear();activeFixture=null;}
  // A nonempty session display name still requires the paired current staff
  // directory; it is never used as a substitute for a genuine current candidate.
  let f=transfer(person.name);await mountTransfer(f);assert.equal(f.proposal.getSnapshot().draft.responsible?.id,person.id);assert.equal(f.proposal.getSnapshot().dirty,false);assert.equal(f.calls,1);assert.equal(f.writes,0);assert.equal('createdByAccountId'in f.proposal.getSnapshot().draft,false);await clear();
  f=transfer(person.name);f.existing();await mountTransfer(f);assert.equal(f.proposal.getSnapshot().draft.responsible===undefined,true,'existing editor never starts a new-document default');assert.equal(f.proposal.getSnapshot().dirty,false);assert.equal(f.calls,0);await clear();
  f=transfer(person.name,false,{page:1,pageSize:20,total:1,items:[other]});await mountTransfer(f);assert.equal(f.calls,1);assert.equal(f.proposal.getSnapshot().draft.responsible===undefined,true,'nonempty session name cannot substitute for an absent staff candidate');assert.equal(f.proposal.getSnapshot().dirty,false);assert.equal(host.textContent.includes('未在可选资料中找到'),true);await clear();
  // Slow current employee lookup versus a real selector open/choice. Opening
  // alone must stop a late default, even before the user picks an option.
  f=transfer(null,true);await mountTransfer(f);await until(()=>f.calls===1,'default lookup starts');const control=deep('[aria-label="负责人"]')[0];assert.equal(!!control,true);await act(async()=>control.click());await until(()=>f.calls>=2,'manual candidate lookup starts');f.release();await settle();assert.equal(f.proposal.getSnapshot().draft.responsible===undefined,true,'manual open blocks late initialization');
  const option=deep('.arco-select-option').find(el=>el.textContent.includes(other.name));assert.equal(!!option,true);await act(async()=>option.click());await until(()=>f.proposal.getSnapshot().draft.responsible?.id===other.id,'manual responsible remains editable');assert.equal(f.proposal.getSnapshot().dirty,true);assert.equal(f.writes,0);await clear();
  for(const intent of ['clear','write-loss','identity-loss']){f=transfer(null,true);await mountTransfer(f);await until(()=>f.calls===1,'default lookup starts before '+intent);await act(async()=>{if(intent==='clear')f.proposal.clearResponsibleStaff();if(intent==='write-loss')f.writeLoss();if(intent==='identity-loss')f.context.clear();});f.release();await settle();assert.equal(f.proposal.getSnapshot().draft.responsible?.id,undefined,'late response cannot restore actor after '+intent);if(intent==='clear')assert.equal(f.proposal.getSnapshot().draft.responsible===null,true);if(intent==='write-loss')assert.equal(f.proposal.getSnapshot().dirty,false);assert.equal(f.writes,0);await clear();}
  // The sales page uses its existing current in-job reference API rather than
  // the transfer responsibility catalogue; default/edit semantics stay separate.
  const context=new ReadContext({accountId:uid(99),sessionRevision:'1',permissionRevision:'1'}),scope=context.createScope('sales-default'),hall={...ref({id:uid(20),name:'SYN hall'}),hallId:uid(20),hallName:'SYN hall'},proposal=new SalesProposalSession(scope,{readProducts:async()=>page([]),readProductSkus:async()=>page([]),readSalesReferences:async q=>page(q.kind==='hall'?[hall]:[ref(person),ref(other)])});
  const command={write:{phase:'idle'},editor:null},sales={scope,proposal,currentEmployee:person,presentation:{businessChoice:'SALE',salespersonDefault:{attempted:false,touched:false,notice:null}},current:{readSalesReferences:async()=>page([ref(person),ref(other)])},editor:{...stable({preparing:false,command,notice:null}),commands:{hasUnresolvedWrite:false}},create:stable({preparing:false,notice:null})};
  activeFixture={context};root=createRoot(host);await act(async()=>root.render(h(NewSales,{session:sales,scope,productReader:{},denied(){throw Error('unexpected denial');},navigate(){},onCommitted(){},onDiscarded(){}})));await until(()=>proposal.getSnapshot().draft.salesperson?.id===person.id,'actual SalesNewPage defaults current staff');assert.equal(proposal.getSnapshot().dirty,false);
  await act(async()=>{await proposal.openPicker('hall');await proposal.select(hall.id);});const salesperson=deep('[aria-label="营业员"]')[0];assert.equal(!!salesperson,true);await act(async()=>salesperson.click());await settle();const alternate=deep('.arco-select-option').find(el=>el.textContent.includes(other.name));assert.equal(!!alternate,true);await act(async()=>alternate.click());await until(()=>proposal.getSnapshot().draft.salesperson?.id===other.id,'salesperson editable after hall selection');assert.equal(sales.presentation.salespersonDefault.touched,true);await clear();

  const context2=new ReadContext({accountId:uid(99),sessionRevision:'1',permissionRevision:'1'}),scope2=context2.createScope('sales-late'),proposal2=new SalesProposalSession(scope2,{readProducts:async()=>page([]),readProductSkus:async()=>page([]),readSalesReferences:async q=>page(q.kind==='hall'?[hall]:[ref(person),ref(other)])});let salesReadStarted=false,finishSales;
  const sales2={...sales,scope:scope2,proposal:proposal2,presentation:{businessChoice:'SALE',salespersonDefault:{attempted:false,touched:false,notice:null}},current:{readSalesReferences:async()=>new Promise(resolve=>{salesReadStarted=true;finishSales=resolve;deferred.push(()=>resolve(page([ref(person),ref(other)])));})}};
  activeFixture={context:context2};root=createRoot(host);await act(async()=>root.render(h(NewSales,{session:sales2,scope:scope2,productReader:{},denied(){throw Error('unexpected denial');},navigate(){},onCommitted(){},onDiscarded(){}})));await until(()=>salesReadStarted,'actual sales default request starts');
  await act(async()=>{await proposal2.openPicker('hall');await proposal2.select(hall.id);});const manualSalesperson=deep('[aria-label="营业员"]')[0];assert.equal(!!manualSalesperson,true);await act(async()=>manualSalesperson.click());await settle();const chosenSalesperson=deep('.arco-select-option').find(el=>el.textContent.includes(other.name));assert.equal(!!chosenSalesperson,true);await act(async()=>chosenSalesperson.click());await until(()=>proposal2.getSnapshot().draft.salesperson?.id===other.id,'manual choice beats slow sales default');finishSales(page([ref(person),ref(other)]));await settle();assert.equal(proposal2.getSnapshot().draft.salesperson?.id,other.id);assert.equal(sales2.presentation.salespersonDefault.touched,true);await clear();

 }finally{for(const release of deferred)release();if(root)await act(async()=>root.unmount());activeFixture?.context.clear();dom.window.close();await rm(temp,{recursive:true,force:true});}
});

test('F02 actual feature renews only clean idle EXISTING owner and retains list view',async()=>{
 const {ReadContext}=await import('../../../../src/loading/read-scope.ts');
 const {detail,result}=await import('../../../../src/sales/commands/fixtures.test-support.ts');
 const initial=detail(),principal={accountId:initial.document.header.createdByAccountId,staffId:null,hallId:null,loginName:'TEST F02',role:'ADMIN',authVersion:1};
 const reads=new ReadContext({accountId:principal.accountId,sessionRevision:'F02',permissionRevision:'F02'});
 const temp=await mkdtemp(path.join(here,'.sales-owner-'));
 try{
  const output=path.join(temp,'feature.mjs');
  await build({stdin:{contents:"export {createSalesFeature} from './sales-feature.ts';export * from './sales-session.ts';",resolveDir:here,loader:'ts'},outfile:output,bundle:true,platform:'node',format:'esm',plugins:[{name:'capture-leaf-only',setup(b){
   b.onLoad({filter:/sales-entry\.tsx$/},()=>({loader:'ts',contents:"export {newSalesListViewState} from './sales-list-state.ts';export function mountSales(host,route,options){return {session:options.session,view:options.view,dispose(){},canLeave(){return true}};}"}));
   b.onLoad({filter:/document-activation\.ts$/},()=>({loader:'ts',contents:'export function createDocumentProductActivation(){throw Error("not used");}'}));
  }}]});
  const {createSalesFeature,salesCanStartFreshCreate}=await import(pathToFileURL(output).href);
  let current=initial;const writes=[];
  const runtime={auth:{getSnapshot:()=>({principal})},reads,http:{origin:'https://synthetic-f02.invalid',basePath:'/api',fetch:async(input,init)=>{const route=new URL(input).pathname;let body;if(route==='/api/sales/detail/query')body=current;else{assert.equal(route,'/api/sales/commands');const command=JSON.parse(init.body);assert.equal(command.action,'APPROVE');writes.push(command);current=detail('APPROVED',3);body=result(command);}return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});}},onAccessFailure(){assert.fail('unexpected denied');}};
  const feature=createSalesFeature({session:runtime,routes:{sales:true},newRequestKey:()=> 'TEST.F02'},()=>{});
  try{
   const mount=route=>feature.mount({},route,reads.createScope('route:'+route));
   const first=await mount('sales'),old=first.session;
   first.view.scrollTop=347;first.view.pageSize=50;const view=first.view;
   assert.equal(await old.editor.openExisting(initial.document.header.id),true);
   assert.equal(old.editor.getSnapshot().command.editor.mode,'EXISTING');assert.equal(old.editor.getSnapshot().command.write.phase,'idle');
   const fresh=await mount('sales/new');assert.equal(fresh.session===old,false,'clean old owner must be replaced');assert.equal(old.scope.active,false);assert.equal(fresh.session.editor.getSnapshot().command.editor,null);assert.equal(fresh.session.create.getSnapshot().nativeHandoff,false);assert.equal(fresh.view===view,true);assert.equal(view.scrollTop,347);assert.equal(view.pageSize,50);
   assert.equal((await mount('sales/new')).session===fresh.session,true,'do not clear an already new owner');
   await fresh.session.editor.openExisting(initial.document.header.id);
   const approvedOwner=fresh.session;assert.equal(await approvedOwner.editor.submit('APPROVE'),true);assert.equal(approvedOwner.editor.getSnapshot().command.write.phase,'committed');
   assert.equal((await mount('sales/new')).session===approvedOwner,true,'committed is not an idle clean boundary');
   assert.equal(await approvedOwner.editor.commands.readCurrent(),true);assert.equal(approvedOwner.editor.adoptCurrent(),true);assert.equal(approvedOwner.editor.getSnapshot().command.write.phase,'idle');
   const afterApproval=await mount('sales/new');assert.equal(afterApproval.session===approvedOwner,false);assert.equal(approvedOwner.scope.active,false);assert.equal(afterApproval.view===view,true);assert.equal(writes.length,1);assert.equal(writes[0].salesId,initial.document.header.id);
   current=initial;await afterApproval.session.editor.openExisting(initial.document.header.id);
   const owner=afterApproval.session,state=owner.editor.getSnapshot(),command=state.command;
   const clean=owner.editor.getSnapshot().input;owner.editor.updateInput({...clean,note:'raw changed',businessDate:'invalid'});const raw=owner.editor.getSnapshot().input;
   assert.equal((await mount('sales/new')).session===owner,true,'raw invalid edit stays owned');assert.equal(owner.editor.getSnapshot().input,raw);owner.editor.updateInput(clean);

   const wrap=(change={})=>({...owner,editor:{getSnapshot:()=>state,canLeave:()=>true,hasDirtyDraft:false,commands:{hasUnresolvedWrite:false},existingDocument:null,...change}});
   assert.equal(salesCanStartFreshCreate(wrap()),true);
   for(const phase of ['submitting','checking','replaying','uncertain','committed','rejected']){const original={...command,write:{...command.write,phase,command:{requestKey:'TEST.original',expectedVersion:2}}};const candidate=wrap({getSnapshot:()=>({...state,command:original})});assert.equal(salesCanStartFreshCreate(candidate),false,phase);assert.equal(candidate.editor.getSnapshot().command,original);assert.equal(original.write.command.requestKey,'TEST.original');}
   for(const change of [{hasDirtyDraft:true},{commands:{hasUnresolvedWrite:true}},{getSnapshot:()=>({...state,preparing:true})},{existingDocument:{getSnapshot:()=>({preparing:true})}}])assert.equal(salesCanStartFreshCreate(wrap(change)),false);
   assert.equal(salesCanStartFreshCreate({...wrap(),create:{getSnapshot:()=>({preparing:true})}}),false);
   assert.equal(salesCanStartFreshCreate({...wrap(),historyOwners:new Map([['test',{owner:{unresolved:true}}]])}),false);
   const proposal=owner.proposal.getSnapshot();
   for(const patch of [{dirty:true},{lineEdit:{key:'raw'}},{entries:{OUT:[{product:null,query:'raw pending query'}]}}])assert.equal(salesCanStartFreshCreate({...wrap(),proposal:{getSnapshot:()=>({...proposal,...patch})}}),false);
   owner.proposal.updateEntry('OUT',{query:'retain raw search'});
   const before=owner.proposal.getSnapshot();assert.equal((await mount('sales/new')).session===owner,true);assert.equal(owner.scope.active,true);assert.equal(owner.proposal.getSnapshot(),before);
  }finally{feature.dispose();}
 }finally{reads.clear();await rm(temp,{recursive:true,force:true});}
});
