import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.list-query-'));
const dom=new JSDOM('<div id="root"></div>',{url:'https://list.test',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLFormElement','Node','Event','MouseEvent','Element'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {act,createElement}=await import('react'),{createRoot}=await import('react-dom/client');
let root;
try{
 const out=path.join(temp,'lists.mjs');
 await build({stdin:{contents:"export {SalesList,newSalesListViewState} from './sales-list.tsx';export {TransfersList,newTransferListViewState} from './transfers-list.tsx';export {LatestQuery} from '../../../../src/loading/latest-query.ts';export {ReadScope} from '../../../../src/loading/read-scope.ts';",resolveDir:here,loader:'tsx'},outfile:out,bundle:true,platform:'node',format:'esm',external:['react','react-dom','react-dom/*'],jsx:'automatic',logLevel:'warning',plugins:[{name:'nonvisual-controls',setup(b){
 b.onLoad({filter:/source-controls\.tsx$/},()=>({loader:'tsx',contents:'export const SourceDate=()=>null;export const SourceMulti=()=>null;export const SalesReferenceFilter=()=>null;'}));
 b.onLoad({filter:/inventory\/pagination\.tsx$/},()=>({loader:'tsx',contents:'export function Pagination(p){return <div data-pagination={`${p.page}/${p.size}/${p.total}`}><button data-size onClick={()=>p.sizeChange(100)}>100/页</button><button data-page onClick={()=>p.change(2)}>下一页</button></div>}'}));
 }}]});
 const api=await import(pathToFileURL(out).href),host=document.getElementById('root');
 const tick=()=>act(async()=>{await Promise.resolve();});
 for(const kind of ['sales','transfers']){
  const sales=kind==='sales',view=api[sales?'newSalesListViewState':'newTransferListViewState']();view.more=true;
  const pending=[],scope=new api.ReadScope({accountId:'test',sessionRevision:'1',permissionRevision:'1'},kind,null,()=>{});
  const query=new api.LatestQuery({scope,execute:read=>new Promise((resolve,reject)=>pending.push({...read,resolve,reject}))});
  const session=sales?{scope,list:{list:query}}:{scope,list:query,references:{}};
  const props={session,view,references:{},canCreate:false,create(){},open(){},denied(e){throw e;},onAccessFailure(e){throw e;}};
  const mount=async()=>{root=createRoot(host);await act(async()=>root.render(createElement(api[sales?'SalesList':'TransfersList'],props)));};
  const unmount=async()=>{await act(async()=>root.unmount());root=null;};
  const click=async(selector)=>{const el=host.querySelector(selector);assert.ok(el,selector);await act(async()=>el.click());};
  const submit=async()=>act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  const edit=async(value)=>act(async()=>{const input=host.querySelector('input[name=q]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
  const result=(request,tag)=>({page:request.parameters.page,pageSize:request.parameters.pageSize,exactTotal:'120',items:[{dataset:'LIVE',batchId:null,documentId:tag,effectiveVersion:1,number:tag,businessDate:null,status:'DRAFT',businessType:'SALE',hallName:null,salespersonName:null,fromWarehouseName:null,toWarehouseName:null,responsibleName:null,quantity:'1',incomingQuantity:'0',outgoingQuantity:'0',totalQuantity:'1',netDue:'100',updatedAt:null,productSummary:{productCount:'0',items:[],hasMore:false}}],historyCoverage:'PUBLISHED_AUTHORIZED',totals:{quantity:tag,incomingQuantity:'0',outgoingQuantity:'0',netDue:'100',totalQuantity:tag}});
  const finish=async(request,tag)=>act(async()=>request.resolve(result(request,tag)));
  const pagination=()=>host.querySelector('[data-pagination]')?.dataset.pagination;
  const applied=()=>view.applied.number;
  await mount();assert.equal(host.querySelector('table'),null,'initial loading has no fabricated empty table');
  await act(async()=>pending[0].reject(Error('first failure')));assert.equal(host.querySelector('table'),null);assert.match(host.textContent,/读取失败/);assert.doesNotMatch(host.textContent,/没有符合条件/);
  await click('[role=alert] button');await finish(pending.at(-1),'A');assert.equal(pagination(),'1/20/120');
  await click('[data-size]');const canceledSize=pending.at(-1);await unmount();await mount();assert.equal(pagination(),'1/20/120');assert.equal(view.size,20);await finish(canceledSize,'CANCELED100');assert.equal(pagination(),'1/20/120');
  // A20 stays authoritative through B100 failure; retry uses original A parameters, even after editing B.
  await click('[data-size]');const failed=pending.at(-1);await edit('B');await act(async()=>failed.reject(Error('size failed')));
  assert.equal(pagination(),'1/20/120');assert.ok(host.querySelector('tbody').textContent.includes('A'));assert.equal(view.size,20);assert.equal(applied(),'');
  await click('[role=alert] button');const retried=pending.at(-1);assert.deepEqual(retried.parameters,failed.parameters);await finish(retried,'A100');assert.equal(pagination(),'1/100/120');assert.equal(applied(),'');assert.equal(host.querySelector('[data-pending]').dataset.pending,'true');
  // Request snapshots must not adopt edits made during the request.
  await submit();const b=pending.at(-1);assert.equal(b.parameters.filter.number,'B');await edit('C');await finish(b,'B');assert.equal(applied(),'B');assert.equal(host.querySelector('[data-pending]').dataset.pending,'true');
  // Cancel on leave, reuse successful B, preserve unapplied C and discard delayed response.
  await submit();const c=pending.at(-1);await unmount();await mount();assert.equal(applied(),'B');assert.equal(host.querySelector('input[name=q]').value,'C');assert.equal(host.querySelector('[data-pending]').dataset.pending,'true');await finish(c,'LATE');assert.doesNotMatch(host.querySelector('tbody').textContent,/LATE/);
  // A superseding reset succeeds before C; old result cannot change applied or totals.
  await submit();const old=pending.at(-1);await click('button[type=button].btn:not(.tc-filter-toggle)');const reset=pending.at(-1);assert.equal(reset.parameters.filter.number,null);assert.equal(applied(),'B');await finish(reset,'RESET');await finish(old,'OLD');assert.equal(applied(),'');assert.equal(host.querySelector('[data-pending]').dataset.pending,'false');assert.doesNotMatch(host.querySelector('tbody').textContent,/OLD/);
  await click('[data-page]');assert.equal(pending.at(-1).parameters.pageSize,100);await finish(pending.at(-1),'PAGE2');assert.equal(pagination(),'2/100/120');
  await unmount();scope.dispose();await tick();console.log('PASS '+kind+': first failure, original retry, delayed labels, canceled reentry, late response, reset and authoritative pagination');
 }
}finally{if(root)await act(async()=>root.unmount());dom.window.close();await rm(temp,{recursive:true,force:true});}
