/** Shared DocumentScan/controller regression harness, not a user-facing sales entry.
 * The 2026-10-29 instruction excludes a sales scan workspace. Old normal-page
 * entry/save assertions moved to sales-no-scan-workspace.test.mjs; FIFO, stale
 * scope, timeout, cancellation and recovery assertions remain here. Actual
 * transfer pending-save guards stay in transfer-matrix-scan-edit.test.mjs.
 * Synthetic component readers only; no browser or PG. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
test('shared scanner: FIFO recovery, timeout, stale scope and legacy compatibility',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://sales-scan.synthetic.test',pretendToBeVisual:true}),saved=new Map();
 for(const k of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Element','SVGElement','Node','Event','MouseEvent','KeyboardEvent','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']){saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{configurable:true,value:k==='requestAnimationFrame'||k==='cancelAnimationFrame'?dom.window[k].bind(dom.window):dom.window[k]});}
 dom.window.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
 const {act,createElement:h,StrictMode}=require('react'),{createRoot}=require('react-dom/client'),temp=await mkdtemp(path.join(here,'.sales-scan-'));let root;
 const tick=()=>new Promise(r=>setImmediate(r));
 const until=async predicate=>{for(let i=0;i<100;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(predicate())return;}assert.ok(predicate(),'actual Portal/control was not ready');};
 try{
  const output=path.join(temp,'entry.mjs');await build({stdin:{resolveDir:here,loader:'tsx',contents:"export {DocumentScan} from '../../../../src/components/document-scan.tsx';export {SalesProposalSession} from '../../../../src/current-form/sales-proposal.ts';export {ReadContext} from '../../../../src/loading/read-scope.ts';"},outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',loader:{'.css':'empty'},external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'unrelated-read-controls',setup(b){b.onLoad({filter:/source-controls\.tsx$/},()=>({loader:'tsx',contents:'export const SourceDate=()=>null;export const SourceSingle=()=>null;'}));b.onLoad({filter:/proposal-picker\.tsx$/},()=>({loader:'tsx',contents:'export const ProposalReference=()=>null;export const ProposalPopup=()=>null;export const ProposalTrigger=p=>p.children;'}));b.onLoad({filter:/sales-write-recovery\.tsx$/},()=>({loader:'tsx',contents:'export const WriteRecovery=()=>null;'}));}}]});
  const api=await import(pathToFileURL(output).href),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const hall={id:id(1),name:'Hall',code:null,hallId:id(1),hallName:'Hall',paymentMethodId:null,paymentMethodName:null},warehouse={...hall,id:id(2),name:'Warehouse'},staff={...hall,id:id(3)},sku={id:id(4),skuCode:'SCAN-SKU',productId:id(5),productCode:'SCAN-P',productName:'Synthetic',colorId:id(6),colorName:'白',fitId:id(7),fitName:'Y',sizeId:id(8),sizeName:'M',sizeGroupId:id(9),barcodeAvailability:'UNAVAILABLE'};
  const page=items=>({page:1,pageSize:20,exactTotal:BigInt(items.length),items}),found=barcode=>({state:'FOUND',barcode,binding:{id:id(10),kind:'MAIN'},sku});
  const buttons=()=>[...document.querySelectorAll('button')],button=name=>buttons().find(x=>x.textContent.trim()===name||x.getAttribute('aria-label')===name);
  const click=async name=>{assert.ok(button(name),'missing '+name);await act(async()=>{button(name).click();await tick();});};
  const input=()=>document.querySelector('.document-scan-input input');
  const submit=async value=>{await until(()=>input());await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input(),value);input().dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>{input().closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await tick();});};
  async function fixture(mode='SALE'){
   const context=new api.ReadContext({accountId:id(99),sessionRevision:'s',permissionRevision:'p'}),scope=context.createScope('sales-scanner'),requests=[];
   const session=new api.SalesProposalSession(scope,{async readSalesReferences(q){return page(q.kind==='hall'?[hall]:q.kind==='warehouse'?[warehouse]:[staff]);},async readProducts(){return page([]);},async readProductSkus(){return page([]);},readBarcode(q,signal){return new Promise(resolve=>requests.push({q,signal,resolve}));}});
   session.setHeader({businessDate:'2026-10-31',note:'raw note'});await session.openPicker('hall');await session.select(hall.id);await session.openPicker('warehouse');await session.select(warehouse.id);await session.openPicker('salesperson');await session.select(staff.id);session.closePicker();session.setBusinessMode(mode);
   let pending=0,controller=null;
   root=createRoot(document.getElementById('root'));
   const open=async(direction='OUT')=>{
    if(controller)controller.dispose();controller=session.createScanner(direction);
    const activeController=controller;
    function SharedHarness(){const state=require('react').useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot);return h(api.DocumentScan,{controller:activeController,title:'Shared scanner regression',rows:state.draft.lines.filter(line=>line.sku&&line.quantity.startsWith('-')===(direction==='IN')).map(line=>({key:line.key,sku:line.sku,quantity:line.quantity})),queueContext:{getDraft:()=>session.getSnapshot().draft,busy:false,onPendingChange:count=>{pending=count;}},close(){root.render(null);},update:(key,quantity)=>session.updateLine(key,{quantity}),remove:key=>session.removeLine(key)});}
    await act(async()=>root.render(h(StrictMode,null,h(SharedHarness))));await until(()=>input());
   };
   return {context,scope,session,requests,open,get pending(){return pending;},async settle(index,result){await act(async()=>{requests[index].resolve(result??found(requests[index].q.barcode));await tick();});},async close(){await act(async()=>root.unmount());root=null;context.clear();}};
  }
  await t.test('shared FIFO pause/retry and explicit cancellation',async()=>{
   const f=await fixture();try{
    await f.open();await submit('A');await submit('UNKNOWN');await submit('A');assert.equal(f.requests.length,1);assert.equal(f.pending,3,'all accepted scans are reported to the owning consumer');
    await f.settle(0);await until(()=>f.requests.length===2);await f.settle(1,{state:'NOT_FOUND',barcode:'UNKNOWN',binding:null,sku:null});await until(()=>document.body.textContent.includes('已暂停'));assert.equal(f.requests.length,2,'queued tail discarded');assert.equal(input().disabled,true);assert.equal(f.session.getSnapshot().draft.lines[0].quantity,'1');assert.equal(f.session.getSnapshot().draft.lines[0].dealPrice,'');assert.equal(f.session.getSnapshot().draft.lines[0].product.retailPrice,null);
    await click('重新扫码');assert.equal(input().value,'UNKNOWN');assert.equal(f.requests.length,2);await submit('A');await f.settle(2);assert.equal(f.session.getSnapshot().draft.lines[0].quantity,'2');
    await act(async()=>f.session.updateLine(f.session.getSnapshot().draft.lines[0].key,{dealPrice:'200.',quantity:'2'}));const raw=f.session.getSnapshot().draft.lines[0];await submit('A');await f.settle(3);assert.equal(f.session.getSnapshot().draft.lines[0].dealPrice,'200.');assert.equal(f.session.getSnapshot().draft.lines[0].quantity,'3');assert.equal(raw.dealPrice,'200.');
    await submit('A');const pending=f.requests[4];await click('关闭扫码抽屉');assert.equal(pending.signal.aborted,true);await f.settle(4);assert.equal(f.session.getSnapshot().draft.lines[0].quantity,'3');assert.equal(f.session.getSnapshot().draft.note,'raw note');assert.equal(f.pending,0,'explicit cancellation clears accepted scan ownership');
   }finally{await f.close();}
  });
  await t.test('shared visible timeout drops tail; late success cannot add before explicit retry',async()=>{
   const f=await fixture();try{await f.open();await submit('TIMEOUT');await submit('TAIL');await act(async()=>{await new Promise(r=>setTimeout(r,3250));await tick();});assert.match(document.body.textContent,/超时/);assert.equal(f.requests.length,1);assert.equal(f.requests[0].signal.aborted,true);assert.equal(f.session.getSnapshot().draft.lines.length,0);await f.settle(0);assert.equal(f.session.getSnapshot().draft.lines.length,0);await click('重新扫码');assert.equal(input().value,'TIMEOUT');assert.equal(f.requests.length,1);await submit('TIMEOUT');await f.settle(1);assert.equal(f.session.getSnapshot().draft.lines[0].quantity,'1');}finally{await f.close();}
  });
  await t.test('standard consumer without normal queue context retains original single-read and failed-code semantics',async()=>{
   const f=await fixture();const controller=f.session.createScanner('OUT');try{await act(async()=>root.render(h(api.DocumentScan,{controller,title:'Standard legacy',rows:[],close(){controller.dispose();},update(){},remove(){}})));await submit('UNKNOWN');assert.equal(input().disabled,true);assert.equal(f.requests.length,1);await f.settle(0,{state:'NOT_FOUND',barcode:'UNKNOWN',binding:null,sku:null});assert.equal(input().value,'UNKNOWN');assert.equal(input().disabled,false);assert.equal(button('重新扫码'),undefined);await submit('A');await f.settle(1);assert.equal(input().value,'');assert.equal(f.session.getSnapshot().draft.lines[0].quantity,'1');}finally{await act(async()=>controller.dispose());await f.close();}
  });
  await t.test('unfinished line replacement and permission expiry cannot accept an older scan',async()=>{
   const f=await fixture();try{await f.open();await submit('A');await f.settle(0);const line=f.session.getSnapshot().draft.lines[0];await submit('A');await act(async()=>assert.equal(f.session.beginLineEdit(line.key),true));await f.settle(1);await until(()=>document.body.textContent.includes('已暂停'));assert.equal(f.session.getSnapshot().draft.lines[0],line);assert.equal(f.session.getSnapshot().lineEdit.original,line);await act(async()=>f.session.cancelLineEdit());await click('忽略并继续');await submit('A');await act(async()=>f.scope.dispose());assert.equal(f.requests[2].signal.aborted,true);await f.settle(2);assert.equal(f.session.getSnapshot().disposed,true);assert.equal(f.session.getSnapshot().draft.lines.length,0);await until(()=>!input());}finally{await f.close();}
  });
  await t.test('shared signed-direction consumer; target changes and unmount invalidate accepted reads',async()=>{
   const f=await fixture('RETURN_EXCHANGE');try{await f.open('IN');await submit('IN');await f.settle(0);assert.equal(f.session.getSnapshot().draft.lines[0].quantity,'-1');await f.open('OUT');await submit('OUT');await f.settle(1);assert.deepEqual(f.session.getSnapshot().draft.lines.map(x=>x.quantity),['-1','1']);await submit('OUT');await act(async()=>f.session.setHeader({note:'changed while resolving'}));await f.settle(2);assert.deepEqual(f.session.getSnapshot().draft.lines.map(x=>x.quantity),['-1','1']);await until(()=>document.body.textContent.includes('已暂停'));await click('忽略并继续');await submit('OUT');const pending=f.requests[3];await act(async()=>root.unmount());root=null;assert.equal(pending.signal.aborted,true);pending.resolve(found('OUT'));await tick();assert.deepEqual(f.session.getSnapshot().draft.lines.map(x=>x.quantity),['-1','1']);}finally{if(root)await act(async()=>root.unmount());root=null;f.context.clear();}
  });
 }finally{if(root)await act(async()=>root.unmount());await rm(temp,{recursive:true,force:true});dom.window.close();for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];delete globalThis.ResizeObserver;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
