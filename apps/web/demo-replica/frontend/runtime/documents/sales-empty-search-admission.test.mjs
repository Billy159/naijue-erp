// Synthetic DOM/session only. No server, database, actual browser geometry or performance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('empty sales search is local intent; directional totals never relabel a SALE as exchange',async t=>{
 const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.empty-search-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic-empty-sales.invalid',pretendToBeVisual:true}),saved=new Map();
 const globals=['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLFormElement','HTMLIFrameElement','HTMLTextAreaElement','HTMLSelectElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'];
 for(const key of globals){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});}
 for(const[key,value]of Object.entries({navigator:dom.window.navigator,innerWidth:1188,innerHeight:761,pageXOffset:0,pageYOffset:0,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value});}
 dom.window.matchMedia=media=>({matches:false,media,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
 class ResizeObserver{observe(){}unobserve(){}disconnect(){}}globalThis.ResizeObserver=dom.window.ResizeObserver=ResizeObserver;
 dom.window.HTMLCanvasElement.prototype.getContext=()=>({measureText:s=>({width:String(s).length*7})});
 let root=null,liveScope=null;
 try{
  const out=path.join(temp,'entry.mjs');await build({stdin:{contents:`export {SalesProposalForm as CanonicalForm} from './proposal-form.tsx';export {SalesProposalForm as SharedForm} from '../../../../src/current-form/sales-proposal-form.tsx';export {SalesProposalSession} from '../../../../src/current-form/sales-proposal.ts';export {ReadScope} from '../../../../src/loading/read-scope.ts';export {LatestQuery} from '../../../../src/loading/latest-query.ts';export {SalesList,newSalesListViewState} from './sales-list.tsx';`,resolveDir:here,loader:'tsx'},outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],banner:{js:"import{createRequire}from'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'css-only-no-control-substitutes',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({loader:'js',contents:'export default "";'}));}}]});
  const api=await import(pathToFileURL(out).href),{act,createElement:h}=await import('react'),{createRoot}=await import('react-dom/client'),host=document.getElementById('root');
  const settle=async()=>{for(let n=0;n<2;n++)await act(async()=>new Promise(r=>setTimeout(r,15)));};
  const unmount=async()=>{if(root){await act(async()=>root.unmount());root=null;}if(liveScope){liveScope.dispose();liveScope=null;}};
  const mount=async(Component,props)=>{root=createRoot(host);await act(async()=>root.render(h(Component,props)));await settle();};
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const scope=()=>new api.ReadScope({accountId:id(90),sessionRevision:'test',permissionRevision:'test'},'empty-search',null,()=>{});
  const hall={id:id(1),name:'SYNTHETIC HALL',code:null,hallId:id(1),hallName:'SYNTHETIC HALL',paymentMethodId:null,paymentMethodName:null};
  const deep=(selector,node=host)=>[...node.querySelectorAll(selector),...[...node.querySelectorAll('*')].flatMap(n=>n.shadowRoot?deep(selector,n.shadowRoot):[])];
  const fixture=async(kind,{deferHall=false}={})=>{
   liveScope=scope();const calls=[],pendingHall=[],referenceSignals=[],session=new api.SalesProposalSession(liveScope,{readSalesReferences:async(q,signal)=>{calls.push({kind:'reference',query:structuredClone(q)});referenceSignals.push(signal);const result={page:1,pageSize:20,exactTotal:q.kind==='hall'?1n:0n,items:q.kind==='hall'?[hall]:[]};if(deferHall&&q.kind==='hall')return new Promise(resolve=>pendingHall.push({signal,resolve:()=>resolve(result)}));return result;},readProducts:async q=>{calls.push({kind:'product',query:structuredClone(q)});return {page:1,pageSize:20,exactTotal:0n,items:[]};},readProductSkus:async()=>assert.fail('no product or SKU was selected')});
   const props=kind==='canonical'?{scope:liveScope,session,productReader:{},denied(e){throw e;},busy:false,actions:null}:{scope:liveScope,session,close(){},preparation:{save(){assert.fail('no SAVE')},preparing:false,notice:null,cancel(){}}};
   const Component=kind==='canonical'?api.CanonicalForm:api.SharedForm;await mount(Component,props);
   const inputs=()=>[...host.querySelectorAll('input.sale-product-input')];
   const type=async(input,value)=>{await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});await settle();};
   return {calls,session,props,Component,inputs,type,pendingHall,referenceSignals};
  };
  for(const kind of ['canonical','shared'])await t.test(kind+' empty input is editable, reversible and never queries without a hall',async()=>{
   const f=await fixture(kind);
   try{
    const input=f.inputs()[0];assert.ok(input);assert.equal(input.disabled,false,'empty hall is not a local text-entry lock');
    const raw=' SYN 未选厅 001 ';await f.type(input,raw);assert.equal(f.session.getSnapshot().entries.OUT[0].query,raw);assert.equal(input.value,raw);assert.equal(f.calls.length,0);
    assert.match(f.session.getSnapshot().notice,/请先选择营业厅/);assert.equal(f.session.getSnapshot().picker,null);
    await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));await settle();assert.equal(input.value,raw,'Escape closes a picker, never clears local intent');
    await f.type(input,'');assert.equal(f.session.getSnapshot().entries.OUT[0].query,'');assert.equal(f.calls.length,0);
    await f.type(input,raw);await act(async()=>f.session.openPicker('hall'));await act(async()=>assert.equal(await f.session.select(hall.id),true));await settle();
    assert.equal(f.session.getSnapshot().entries.OUT[0].query,raw,'first hall selection preserves pre-hall text');
    await act(async()=>f.session.openEntryPicker('OUT','product',f.session.getSnapshot().entries.OUT[0].key));await settle();
    assert.deepEqual(f.calls.filter(c=>c.kind==='product').map(c=>c.query),[{context:{kind:'SALES',hallId:hall.id},search:raw,page:1,pageSize:20}]);
    assert.equal(f.session.getSnapshot().draft.lines.length,0);assert.equal(f.session.getSnapshot().entries.OUT[0].quantity,'1');assert.equal(f.session.getSnapshot().entries.IN[0].quantity,'-1');
    await act(async()=>assert.equal(f.session.saveProposal(null),null));
    await act(async()=>assert.equal(f.session.reset(true),true));await settle();assert.equal(f.inputs()[0].value,'');assert.equal(f.session.getSnapshot().draft.hall,null);
   }finally{await unmount();}
  });
  for(const kind of ['canonical','shared'])await t.test(kind+' retains real busy/closed guards, dependent spec locks and scoped payment',async()=>{
   const f=await fixture(kind);
   try{
    assert.equal(host.querySelector('input[aria-label="本行数量"],input[data-entry-field="quantity"]').disabled,true);
    const method=deep(kind==='canonical'?'[aria-label="第1笔支付方式"]':'[aria-label="付款方式 1"]')[0];assert.ok(method);assert.equal(method.getAttribute('aria-disabled'),'true','payment is not fake-enabled before scoped contract is approved');
    await act(async()=>root.render(h(f.Component,kind==='canonical'?{...f.props,busy:true}:{...f.props,preparation:{...f.props.preparation,preparing:true}})));await settle();assert.ok(f.inputs().every(i=>i.disabled),'preparing/busy still locks input');
    await act(async()=>f.session.dispose());await settle();assert.equal(f.calls.length,0);assert.equal(f.session.getSnapshot().disposed,true);
   }finally{await unmount();}
  });
  for(const kind of ['canonical','shared'])for(const deferHall of [false,true])await t.test(kind+' cancels a '+(deferHall?'pending':'ready')+' hall picker before local product input',async()=>{
   const f=await fixture(kind,{deferHall});
   try{
    const control=deep(kind==='canonical'?'[aria-label="营业厅"]':'[aria-label="选择营业厅"]').find(n=>n.classList.contains('arco-select'));assert.ok(control,'original hall Select, not a control substitute');
    await act(async()=>control.click());await settle();assert.equal(f.session.getSnapshot().picker?.kind,'hall');assert.equal(f.session.getSnapshot().picker?.phase,deferHall?'loading':'ready');assert.equal(f.calls.length,1);
    const signal=f.referenceSignals[0],input=f.inputs()[0];await f.type(input,'SYN-LOCAL-A');
    assert.equal(f.session.getSnapshot().picker,null,'foreign reference must not become a product popup');if(deferHall)assert.equal(signal.aborted,true,'switching to a local product intent cancels the exact in-flight foreign read');assert.equal(input.getAttribute('aria-expanded'),'false');
    await f.type(input,'SYN-LOCAL-B');await act(async()=>{input.focus();input.blur();input.focus();});await settle();
    assert.equal(f.calls.length,1,'next key/repeated focus never searches the previous hall kind');assert.equal(f.session.getSnapshot().entries.OUT[0].query,'SYN-LOCAL-B');assert.match(f.session.getSnapshot().notice,/请先选择营业厅/);
    for(const pending of f.pendingHall)pending.resolve();await settle();
    assert.equal(f.session.getSnapshot().picker,null,'ignored-abort late reference success cannot revive a popup');assert.equal(f.session.getSnapshot().entries.OUT[0].query,'SYN-LOCAL-B');assert.equal(f.session.getSnapshot().draft.hall,null);assert.equal(f.calls.filter(c=>c.kind==='product').length,0);
   }finally{for(const pending of f.pendingHall)pending.resolve();await unmount();}
  });
  await t.test('closing a local unsaved draft prevents a late entry read or save',async()=>{
   const f=await fixture('canonical');try{await f.type(f.inputs()[0],'SYN pending');await act(async()=>assert.equal(f.session.cancel(true),true));await act(async()=>f.session.openEntryPicker('OUT','product'));assert.equal(f.calls.length,0);assert.equal(f.session.saveProposal(null),null);}finally{await unmount();}
  });
  for(const kind of ['canonical','shared'])await t.test(kind+' pending search cannot edit another row during a real line replacement',async()=>{
   const f=await fixture(kind);
   try{
    const product={id:id(10),code:'SYN-10',name:'SYNTHETIC PRODUCT',sizeGroupId:id(15),retailPrice:'10.00',minimumPriceAvailability:'UNAVAILABLE'},sku={id:id(11),skuCode:'SYN-10-RED-A-M',productId:product.id,productCode:product.code,productName:product.name,colorId:id(12),colorName:'红',fitId:id(13),fitName:'A',sizeId:id(14),sizeName:'M',sizeGroupId:id(15),barcodeAvailability:'UNAVAILABLE'};
    const draft={...f.session.getSnapshot().draft,hall,lines:[{key:'saved-line',sku,product,quantity:'1',dealPrice:'10.00',pricingRule:'UNIT_PRICE',discount:'',isGift:false,zeroConfirmed:false}]};
    await act(async()=>assert.equal(f.session.initializeFromSaved(draft),true));await settle();assert.ok(f.inputs().every(i=>!i.disabled),'selected hall alone does not lock local pending search');
    await act(async()=>assert.equal(f.session.beginLineEdit('saved-line'),true));await settle();
    assert.ok([...host.querySelectorAll('.sale-entry-row input.sale-product-input')].every(i=>i.disabled),'only the selected replacement row owns interaction');
    const before=f.session.getSnapshot().draft;await act(async()=>f.session.openEntryPicker('OUT','product'));assert.equal(f.calls.length,0);assert.equal(f.session.getSnapshot().draft,before);
    await act(async()=>f.session.cancelLineEdit());await settle();assert.ok(f.inputs().every(i=>!i.disabled),'cancel restores the pending local input');assert.equal(f.session.getSnapshot().draft.lines[0].quantity,'1');
   }finally{await unmount();}
  });
  const row=(n,type,quantity,incoming,outgoing,dataset='LIVE')=>({id:id(n),documentId:id(n),dataset,batchId:dataset==='HISTORY'?id(99):null,effectiveVersion:1,number:'SYN-'+n,status:'DRAFT',version:1,businessType:type,businessDate:'2026-11-01',hallName:'SYN H',salespersonName:null,quantity,incomingQuantity:incoming,outgoingQuantity:outgoing,netDue:(BigInt(quantity)*100n).toString(),updatedAt:null});
  for(const c of [
   {name:'pure SALE',items:[row(101,'SALE','1','0','1')],q:'1',incoming:'0',outgoing:'1'},
   {name:'pure RETURN',items:[row(102,'RETURN','-2','2','0')],q:'-2',incoming:'2',outgoing:'0'},
   {name:'historical EXCHANGE',items:[row(103,'EXCHANGE','1','2','3','HISTORY')],q:'1',incoming:'2',outgoing:'3'},
   {name:'mixed filter with exact large totals',items:[row(104,'SALE','9007199254740994','0','9007199254740994'),row(105,'RETURN','-2','2','0'),row(106,'EXCHANGE','1','2','3','HISTORY')],q:'9007199254740993',incoming:'4',outgoing:'9007199254740997'}
  ])await t.test(c.name+' uses neutral outgoing caption and preserves signed facts',async()=>{
   liveScope=scope();const amount=c.items.reduce((n,r)=>n+BigInt(r.netDue),0n).toString(),data={page:1,pageSize:20,exactTotal:String(c.items.length),items:c.items,historyCoverage:'NOT_PUBLISHED',totals:{quantity:c.q,incomingQuantity:c.incoming,outgoingQuantity:c.outgoing,grossAmount:amount,orderDiscount:'0',netDue:amount}},before=structuredClone(data),query=new api.LatestQuery({scope:liveScope,execute:async()=>data});
   try{await mount(api.SalesList,{session:{scope:liveScope,list:{list:query}},view:api.newSalesListViewState(),references:{readReferences:async()=>assert.fail('no filter read')},canCreate:false,open(){assert.fail('no document action')},create(){assert.fail('no CREATE')},onAccessFailure(e){throw e;}});
    const summary=host.querySelector('[aria-label="销货单筛选合计"]');assert.ok(summary);assert.match(summary.textContent,new RegExp('数量 '+c.q));assert.ok(summary.textContent.includes('退回 '+c.incoming));assert.ok(summary.textContent.includes('出库 '+c.outgoing));assert.doesNotMatch(summary.textContent,/换出/);
    const quantities=[...host.querySelectorAll('tbody tr td:nth-child(8)')].map(n=>n.textContent);assert.deepEqual(quantities,c.items.map(r=>r.businessType==='SALE'?r.quantity:`退${r.incomingQuantity} · 换${r.outgoingQuantity}`),'historical row display and sign facts are not reclassified');assert.deepEqual(data,before);
   }finally{await act(async()=>query.dispose());await unmount();}
  });
 }finally{
  if(root)await (await import('react')).act(async()=>root.unmount());liveScope?.dispose();dom.window.close();for(const[k,d]of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];delete globalThis.ResizeObserver;await rm(temp,{recursive:true,force:true});
 }
});
