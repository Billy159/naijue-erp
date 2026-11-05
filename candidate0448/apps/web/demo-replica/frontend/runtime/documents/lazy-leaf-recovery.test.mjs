import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.lazy-recovery-'));
const dom=new JSDOM('<div id="root"></div>',{url:'https://matrix.test',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','innerWidth','innerHeight'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});dom.window.matchMedia=media=>({matches:false,media,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {act,createElement}=await import('react'),{createRoot}=await import('react-dom/client');let root;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const warehouse=n=>({id:id(n),name:'QA warehouse '+n,hallId:id(90),hallName:'QA',enabled:true,hallEnabled:true,hasNonzeroInventory:false});
const sku={id:id(4),skuCode:'QA-SKU',productId:id(3),productCode:'QA',productName:'QA product',colorId:id(5),colorName:'red',fitId:id(6),fitName:'fit',sizeId:id(7),sizeName:'165/S',sizeGroupId:id(8),barcodeAvailability:'UNAVAILABLE'};
const group={id:sku.sizeGroupId,name:'QA group',sizes:[{id:sku.sizeId,name:sku.sizeName,displayOrder:1}]};
let scope;
const page=items=>({page:1,pageSize:20,exactTotal:BigInt(items.length),items});
const {readFile}=await import('node:fs/promises');
let requests=[];globalThis.__b05Load=()=>new Promise((resolve,reject)=>requests.push({resolve,reject}));
const quiet=console.error;console.error=(...args)=>{if(args.some(value=>value instanceof Error&&['chunk failed','still failed','entry chunk','output chunk','history chunk','editor chunk','render failed'].includes(value.message)))return;quiet(...args);};
try{
 const output=path.join(temp,'form.mjs');await build({stdin:{contents:"export {TransferProposalForm} from './transfer-proposal-form.tsx';export {mountTransfers} from './transfers-entry.tsx';export {default as NativeTransfer} from './transfers-detail-page.tsx';export {mountSales} from './sales-entry.tsx';export {default as ReadDocument} from './sales-detail-page.tsx';export {AsyncLeaf} from '../common/async-leaf.tsx';export {TransferProposalSession} from '../../../../src/current-form/transfer-proposal.ts';export {ReadContext} from '../../../../src/loading/read-scope.ts';export {detail as transferDetail} from '../../../../src/transfers/tests/fixtures.ts';export {detail as salesDetail} from '../../../../src/sales/tests/fixtures.ts';",resolveDir:here,loader:'tsx'},outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'controlled-scanner-import',setup(b){
 b.onLoad({filter:/(transfers-entry|sales-entry|transfers-detail-page|sales-detail-page)\.tsx$/},async a=>({loader:'tsx',contents:(await readFile(a.path,'utf8')).replace(/const load(\w+)=\(\)=>import\('([^']+)'\)/g,(_,name)=>"const load"+name+"=()=>globalThis.__b05EntryLoad('"+path.basename(a.path)+':'+name+"')")}));
 b.onLoad({filter:/transfer-proposal-form\.tsx$/},async a=>({loader:'tsx',contents:(await readFile(a.path,'utf8')).replace("import('./transfer-scanner.tsx')","globalThis.__b05Load()") }));
 b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({loader:'js',contents:'export default "";'}));b.onLoad({filter:/products\/preview\.tsx$/},()=>({loader:'tsx',contents:'export const ProductCandidatePreview=()=>null;'}));
 }}]});
 const {TransferProposalForm,mountTransfers,mountSales,NativeTransfer,ReadDocument,AsyncLeaf,TransferProposalSession,ReadContext,transferDetail,salesDetail}=await import(pathToFileURL(output).href),host=document.getElementById('root');
 const context=new ReadContext({accountId:id(99),sessionRevision:'test',permissionRevision:'test'});scope=context.createScope('matrix');
 const session=new TransferProposalSession(scope,{readTransferWarehouses:async()=>page([warehouse(1),warehouse(2)]),readProducts:async()=>page([]),readProductSkus:async()=>page([]),readSizeGroups:async()=>({page:1,pageSize:100,total:1,items:[group]})});
 assert.equal(session.initializeFromSaved({businessDate:'2026-10-28',note:'retained note',from:warehouse(1),to:warehouse(2),lines:[{sku,quantity:'8',existingLineId:id(85)}]}),true);session.setHeader({note:'dirty note'});
 let writes=0;const actions=createElement('div',{'data-parent-actions':true},createElement('button',{onClick:()=>writes++},'保存'),createElement('button',null,'取消修改'));
 root=createRoot(host,{onUncaughtError:()=>{}});await act(async()=>root.render(createElement(TransferProposalForm,{session,scope,productReader:{},denied:e=>{throw e;},busy:false,actions})));
 const draft=session.getSnapshot().draft;
 await act(async()=>[...host.querySelectorAll('button')].find(x=>x.textContent==='扫码录入').click());assert.equal(requests.length,1);
 try{await act(async()=>requests[0].reject(Error('chunk failed')));}catch(error){assert.match(String(error),/chunk failed/);}
 assert.ok(host.querySelector('[data-parent-actions]'),'parent actions survive rejected Scanner import');assert.equal(session.getSnapshot().draft,draft);assert.equal(writes,0);

 const button=text=>[...host.querySelectorAll('button')].find(x=>x.textContent===text);
 const scannerViews=[];
 const fakeModule={default:props=>{scannerViews.push(props.controller);return createElement('div',{'data-loaded-scanner':true},createElement('button',{onClick:props.close},'关闭扫码测试'));}};
 await act(async()=>button('重试扫码录入').click());assert.equal(requests.length,2);await act(async()=>requests[1].resolve(fakeModule));
 assert.ok(host.querySelector('[data-loaded-scanner]'));assert.equal(scannerViews.at(-1).getSnapshot().phase,'idle');
 const firstController=scannerViews.at(-1);
 await act(async()=>button('关闭扫码测试').click());assert.equal(firstController.getSnapshot().phase,'disposed');assert.equal(session.getSnapshot().draft,draft);
 await act(async()=>button('扫码录入').click());assert.equal(requests.length,3);await act(async()=>requests[2].reject(Error('still failed')));
 assert.ok(button('重试扫码录入'));assert.ok(button('关闭'));assert.equal(host.querySelector('[data-parent-actions]')!==null,true);
 await act(async()=>button('关闭').click());assert.ok(!button('重试扫码录入'));assert.equal(document.body.classList.contains('transfer-scan-open'),false);assert.equal(document.activeElement,button('扫码录入'));
 await act(async()=>button('扫码录入').click());assert.equal(requests.length,4);await act(async()=>button('关闭').click());await act(async()=>requests[3].resolve(fakeModule));assert.equal(host.querySelector('[data-loaded-scanner]'),null);
 await act(async()=>button('扫码录入').click());assert.equal(requests.length,5);await act(async()=>scope.dispose());await act(async()=>requests[4].resolve(fakeModule));assert.equal(host.querySelector('[data-loaded-scanner]'),null);assert.equal(writes,0);
 console.log('PASS actual Scanner reject/retry-success/reject/close, fresh controller, focus, pending-close, scope-abort and late success; same draft/actions, no writes');


 await act(async()=>root.unmount());root=null;
 const entryContext=new ReadContext({accountId:id(99),sessionRevision:'entry',permissionRevision:'entry'});
 const entryScope=entryContext.createScope('entry');
 const entryRequests=[];globalThis.__b05EntryLoad=tag=>new Promise((resolve,reject)=>entryRequests.push({tag,resolve,reject}));
 const common={scope:entryScope,manualCreate:true,existingEdit:true,historyRevision:true,newRequestKey:()=>id(99),http:{origin:'https://test',basePath:'/api',fetch:()=>{throw Error('no HTTP');}},productReader:{},denied:e=>{throw e;},navigate:()=>{},reset:()=>{},view:{reload:false},references:{},principal:{role:'WAREHOUSE',accountId:id(99),hallId:null}};
 // Actual route wrappers: loading, failure, retry and close stay inside the original guard owner.
 for(const [mount,route,leaf,list] of [[mountTransfers,'transfer/new','NewTransfer','transfer'],[mountTransfers,`transfer/history/${id(80)}/${id(81)}/1`,'SourceHistory','transfer'],[mountSales,`sales/history/${id(80)}/${id(81)}/1`,'ImportedHistory','sales']]){
  let canLeaveCalls=0,navigations=0;
  const proposal={getSnapshot:()=>({dirty:true,lineEdit:null,entries:{},pending:{product:null,query:''},replacement:null,matrixQuantities:{}})};
  const session={scope:entryScope,historyOwners:new Map(),proposal,create:{getSnapshot:()=>({preparing:false}),cancelPreparation(){}},workspace:{hasUnresolvedWrite:false,suspend(){},getSnapshot:()=>({write:{phase:'idle'}}),canLeave:()=>true,existingDocument:null},editor:{getSnapshot:()=>({command:{write:{phase:'idle'}}}),canLeave:()=>{canLeaveCalls++;return true;},suspend(){}}};
  let page;await act(async()=>{page=mount(host,route,{...common,session,navigate:()=>{navigations++;page.canLeave();}});});
  let request=entryRequests.at(-1);assert.ok(request.tag.endsWith(':'+leaf));await act(async()=>request.reject(Error('entry chunk')));assert.match(host.textContent,/加载失败/);
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='返回列表').click());assert.equal(navigations,1);assert.equal(page.canLeave(),false,'dirty owner guard survives leaf failure');
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent.startsWith('重试')).click());request=entryRequests.at(-1);assert.notEqual(request,entryRequests.at(-2));
  await act(async()=>request.resolve({default:()=>createElement('div',{'data-entry-loaded':true},leaf)}));assert.ok(host.querySelector('[data-entry-loaded]'));
  await act(async()=>page.dispose());
  console.log('PASS actual '+leaf+' route reject/retry/safe return keeps parent dirty guard');
 }
 const fullProposal=new TransferProposalSession(entryScope,{readTransferWarehouses:async()=>page([]),readProducts:async()=>page([]),readProductSkus:async()=>page([])});
 const td=transferDetail(),sd=salesDetail();
 const workspaceState={write:{phase:'idle'},notice:null,editor:{detail:td,draft:{},input:{}}};
 const full={getSnapshot:()=>({phase:'ready',proposal:fullProposal,preparing:false}),initialize:async()=>{}};
 const workspace={subscribe:()=>()=>{},getSnapshot:()=>workspaceState,existingDocument:full,hasDirtyDraft:true,openExisting:async()=>true,prepareExistingDocument:()=>full,submit:async()=>{writes++;},discardEditor:()=>true};
 const editorState={preparing:false,command:{write:{phase:'idle'},editor:null,notice:null},notice:null};
 const sessions={transfer:{selection:{row:null},scope:entryScope,workspace,reader:{readDetail:async()=>td,readHistory:async()=>({})}},sales:{scope:entryScope,editor:{subscribe:()=>()=>{},getSnapshot:()=>editorState,canLeave:()=>true,commands:{}},reader:{readDetail:async()=>sd,readHistory:async()=>({})}}};
 for(const kind of ['transfer','sales']){
  root=createRoot(host);await act(async()=>root.render(createElement(kind==='transfer'?NativeTransfer:ReadDocument,{...common,session:sessions[kind],id:kind==='transfer'?td.document.header.id:sd.document.header.id})));
  let output=entryRequests.at(-1);assert.ok(output.tag.endsWith(':DocumentOutputActions'));await act(async()=>output.reject(Error('output chunk')));assert.match(host.textContent,/输出功能加载失败/);assert.ok(host.querySelector('.tc-head h1'));
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='重试输出功能').click());output=entryRequests.at(-1);await act(async()=>output.resolve({DocumentOutputActions:()=>createElement('button',{'data-output-loaded':true},'export ready')}));assert.ok(host.querySelector('[data-output-loaded]'));
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='操作历史').click());let history=entryRequests.at(-1);assert.ok(history.tag.endsWith(':History'));await act(async()=>history.reject(Error('history chunk')));assert.match(host.textContent,/操作历史加载失败/);
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='重试操作历史').click());history=entryRequests.at(-1);await act(async()=>history.resolve({default:props=>createElement('button',{'data-history-loaded':true,onClick:props.close},'close history')}));assert.ok(host.querySelector('[data-history-loaded]'));await act(async()=>host.querySelector('[data-history-loaded]').click());assert.equal(host.querySelector('[data-history-loaded]'),null);
  if(kind==='transfer'){
   await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='修改').click());let form=entryRequests.at(-1);assert.ok(form.tag.endsWith(':ProposalForm'));await act(async()=>form.reject(Error('editor chunk')));assert.match(host.textContent,/调拨编辑页加载失败/);assert.ok([...host.querySelectorAll('button')].some(b=>b.textContent==='保存'));assert.ok([...host.querySelectorAll('button')].some(b=>b.textContent==='取消修改'));
   await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='重试调拨编辑页').click());form=entryRequests.at(-1);await act(async()=>form.resolve({TransferProposalForm:props=>createElement('div',{'data-editor-loaded':true},props.actions)}));assert.ok(host.querySelector('[data-editor-loaded]'));
  }
  await act(async()=>root.unmount());root=null;console.log('PASS actual '+kind+' output/history'+(kind==='transfer'?'/edit-form':'')+' reject/retry retains document/actions');
 }
 assert.equal(writes,0);entryScope.dispose();
 for(const mode of ['unmount-success','unmount-error','abort-error']){
  const ownScope=entryContext.createScope(mode);let resolve,reject,mounts=0;
  const load=()=>new Promise((a,b)=>{resolve=a;reject=b;});
  root=createRoot(host);await act(async()=>root.render(createElement(AsyncLeaf,{scope:ownScope,load,label:'迟到测试',children:Leaf=>createElement(Leaf)})));
  if(mode.startsWith('unmount')){await act(async()=>root.unmount());root=null;}else await act(async()=>ownScope.dispose());
  await act(async()=>{if(mode.endsWith('success'))resolve({default:()=>{mounts++;return createElement('div',{'data-late':true});}});else reject(Error('late ignored'));});
  assert.equal(mounts,0);assert.equal(host.textContent,'');if(root){await act(async()=>root.unmount());root=null;}ownScope.dispose();
 }
 console.log('PASS detached/invalidated AsyncLeaf discards late success and rejection');
 const renderScope=entryContext.createScope('render-error');let attempts=0;
 const renderLoad=async()=>({default:()=>{if(attempts===1)throw Error('render failed');return createElement('div',{'data-render-recovered':true});}});
 const countedLoad=()=>{attempts++;return renderLoad();};
 root=createRoot(host);await act(async()=>root.render(createElement(AsyncLeaf,{scope:renderScope,load:countedLoad,label:'渲染测试',children:Leaf=>createElement(Leaf)})));
 assert.match(host.textContent,/渲染测试加载失败/);await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='关闭').click());assert.equal(attempts,1);
 await act(async()=>host.querySelector('button').click());assert.equal(attempts,2);assert.ok(host.querySelector('[data-render-recovered]'));
 await act(async()=>root.unmount());root=null;renderScope.dispose();console.log('PASS leaf render error stays local; explicit close/reopen creates fresh loader');



}finally{console.error=quiet;if(root)await act(async()=>root.unmount());scope?.dispose();dom.window.close();await rm(temp,{recursive:true,force:true});}
