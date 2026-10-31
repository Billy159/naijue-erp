import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {TransferProposalSession,transferProposalRowKey} from '../../../../src/current-form/transfer-proposal.ts';
import {ReadContext} from '../../../../src/loading/read-scope.ts';
const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.transfer-matrix-'));
const dom=new JSDOM('<div id="root"></div>',{url:'https://matrix.test',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','innerWidth','innerHeight'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});dom.window.matchMedia=media=>({matches:false,media,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
const {act,createElement}=await import('react'),{createRoot}=await import('react-dom/client');let root;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const warehouse=n=>({id:id(n),name:'QA warehouse '+n,hallId:id(90),hallName:'QA',enabled:true,hallEnabled:true,hasNonzeroInventory:false});
const sku={id:id(4),skuCode:'QA-SKU',productId:id(3),productCode:'QA',productName:'QA product',colorId:id(5),colorName:'red',fitId:id(6),fitName:'fit',sizeId:id(7),sizeName:'165/S',sizeGroupId:id(8),barcodeAvailability:'UNAVAILABLE'};
const group={id:sku.sizeGroupId,name:'QA group',sizes:[{id:sku.sizeId,name:sku.sizeName,displayOrder:1}]};
const context=new ReadContext({accountId:id(99),sessionRevision:'test',permissionRevision:'test'}),scope=context.createScope('matrix');
const page=items=>({page:1,pageSize:20,exactTotal:BigInt(items.length),items});
try{
 const output=path.join(temp,'form.mjs');await build({entryPoints:[path.join(here,'transfer-proposal-form.tsx')],outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'nonvisual-preview-and-css',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({loader:'js',contents:'export default "";'}));b.onLoad({filter:/products\/preview\.tsx$/},()=>({loader:'tsx',contents:'export const ProductCandidatePreview=()=>null;'}));}}]});
 const {TransferProposalForm}=await import(pathToFileURL(output).href),host=document.getElementById('root');
 for(const reopened of [false,true]){
  const session=new TransferProposalSession(scope,{readTransferWarehouses:async()=>page([warehouse(1),warehouse(2)]),readProducts:async()=>page([{id:sku.productId,code:sku.productCode,name:sku.productName,sizeGroupId:sku.sizeGroupId,retailPrice:'1.00'}]),readProductSkus:async()=>page([sku]),readBarcode:async query=>({state:'FOUND',barcode:query.barcode,binding:{id:id(89),kind:'MAIN'},sku}),readSizeGroups:async()=>({page:1,pageSize:100,total:1,items:[group]})});
  if(reopened)assert.equal(session.initializeFromSaved({businessDate:'2026-10-28',note:'retained',from:warehouse(1),to:warehouse(2),lines:[{sku,quantity:'1',existingLineId:id(85)}]}),true);
  else{session.setHeader({businessDate:'2026-10-28',note:'retained'});await session.openPicker('FROM');await session.select(id(1));await session.openPicker('TO');await session.select(id(2));const scanner=session.createScanner();assert.equal(await scanner.scan('QA-BARCODE'),true);scanner.dispose();}
  assert.equal(session.getSnapshot().draft.lines[0].product,undefined);
  root=createRoot(host);await act(async()=>root.render(createElement(TransferProposalForm,{session,scope,productReader:{},denied:e=>{throw e;},busy:false,actions:null,notice:'parent notice'})));
  // DOM structural regression only: native reverse Tab is verified separately.
  const deep=(selector,node=host)=>[...node.querySelectorAll(selector),...[...node.querySelectorAll('*')].flatMap(el=>el.shadowRoot?deep(selector,el.shadowRoot):[])];
  const draftBeforeFocus=structuredClone(session.getSnapshot().draft);
  for(const label of ['调出仓库','调入仓库']){
   const view=deep('[role="combobox"]').find(node=>node.getAttribute('aria-label')===label);assert.ok(view,label);
   await act(async()=>view.focus());
   const searchInput=view.querySelector('input');assert.ok(searchInput);
   assert.equal(view.getRootNode().activeElement,searchInput,label+' focuses actual search input');
   assert.equal(view.tabIndex,-1,label+' wrapper must not trap backward Tab');
   assert.equal(searchInput.tabIndex,0,label+' search input remains tabbable');
   assert.deepEqual(session.getSnapshot().draft,draftBeforeFocus,'focus does not change draft');
  }
  let input=host.querySelector('input[data-transfer-row][data-transfer-size]');assert.ok(input);
  const search=host.querySelector('#mx-transfer-search');await act(async()=>search.focus());await act(async()=>{await new Promise(r=>setTimeout(r,50));});assert.equal(document.querySelectorAll('[data-transfer-candidate]').length,1);await act(async()=>search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));await act(async()=>{await new Promise(r=>setTimeout(r,40));});assert.equal(session.getSnapshot().pending.product?.id,sku.productId,'single candidate Enter selects actual product');await act(async()=>session.clearPending());
  await act(async()=>host.querySelector('.mx-spec-edit').click());await act(async()=>{await new Promise(r=>setTimeout(r,30));});assert.equal(session.getSnapshot().pending.product?.sizeGroupId,sku.sizeGroupId,'SKU-only replacement reads exact current product metadata instead of inferring group');assert.equal(session.getSnapshot().pending.phase,'ready');const cancel=host.querySelector('[data-mx=replace-cancel]');assert.ok(cancel);await act(async()=>{cancel.focus();cancel.click();});await act(async()=>{await new Promise(r=>setTimeout(r,40));});assert.equal(document.activeElement,host.querySelector('[data-transfer-row][data-transfer-size]'),'cancel returns to original quantity, not product search');

  input=host.querySelector('input[data-transfer-row][data-transfer-size]');const edit=async raw=>{await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,raw);input.dispatchEvent(new Event('input',{bubbles:true}));});};
  await edit('8');assert.equal(input.value,'8');let valid;await act(async()=>{valid=session.validate();});assert.equal(valid.lines[0].quantity,'8');assert.match(host.querySelector('#tc-totals').textContent,/8件/);
  if(reopened)assert.equal(valid.lines[0].existingLineId,id(85));
  for(const raw of ['', '0','01','1.5','9223372036854775808']){await edit(raw);assert.equal(input.value,raw);assert.equal(session.getSnapshot().draft.lines[0].quantity,raw);await act(async()=>assert.equal(session.validate(),null));}
  await act(async()=>{assert.equal(session.setMatrixSizeQuantity(transferProposalRowKey(sku),{...group,id:id(88)},sku.sizeId,'8'),false);});
  assert.match(host.querySelector('#tc-error').textContent,/规格资料不匹配/);assert.match(host.querySelector('#tc-error').textContent,/parent notice/);
  assert.equal(session.cancel(),false);assert.equal(session.getSnapshot().draft.note,'retained');
  await act(async()=>host.querySelector('[data-t=delete-color]').click());assert.ok(host.querySelector('dialog'));assert.equal(session.getSnapshot().draft.lines.length,1,'opening delete must not mutate');await act(async()=>[...host.querySelectorAll('dialog button')].find(b=>b.textContent==='取消').click());assert.equal(session.getSnapshot().draft.lines.length,1);await act(async()=>host.querySelector('[data-t=delete-color]').click());await act(async()=>[...host.querySelectorAll('dialog button')].find(b=>b.textContent==='删除').click());assert.equal(session.getSnapshot().draft.lines.length,0,'explicit confirmation removes original identity');
  await act(async()=>root.unmount());root=null;session.cancel(true);
  console.log('PASS actual TransferProposalForm '+(reopened?'reopened':'scanner')+': SKU-only input 1→8, total, invalid raw, visible reject and cancel protection');
 }
 // F06: actual saved Form, empty M matrix cell, original lazy Scanner and controller.
 {
  const m={...sku,id:id(204),skuCode:'QA-M',sizeId:id(207),sizeName:'170/M'},sm={...group,sizes:[...group.sizes,{id:m.sizeId,name:m.sizeName,displayOrder:2}]},product={id:sku.productId,code:sku.productCode,name:sku.productName,sizeGroupId:sku.sizeGroupId,retailPrice:'1.00'};
  const session=new TransferProposalSession(scope,{readTransferWarehouses:async()=>page([warehouse(1),warehouse(2)]),readProducts:async()=>page([product]),readProductSkus:async()=>page([sku]),readBarcode:async query=>({state:'FOUND',barcode:query.barcode,binding:{id:id(89),kind:'MAIN'},sku:m}),readSizeGroups:async()=>({page:1,pageSize:100,total:1,items:[sm]})});
  assert.equal(session.initializeFromSaved({businessDate:'2026-10-28',note:'retained',from:warehouse(1),to:warehouse(2),lines:[{sku,product,quantity:'1',existingLineId:id(85)}]}),true);assert.equal(session.getSnapshot().entry,null);
  root=createRoot(host);await act(async()=>root.render(createElement(TransferProposalForm,{session,scope,productReader:{},denied:e=>{throw e;},busy:false,actions:null})));
  const until=async(fn,label)=>{for(let i=0;i<80;i++){if(fn())return;await act(async()=>{await new Promise(r=>setTimeout(r,20));});}assert.equal(Boolean(fn()),true,label);};
  await until(()=>host.querySelector('input[data-transfer-size="'+m.sizeId+'"]'),'M matrix loaded');const input=host.querySelector('input[data-transfer-size="'+m.sizeId+'"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'5');input.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(input.value,'5');assert.match(host.querySelector('#tc-totals').textContent,/6件/);
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='扫码录入').click());await until(()=>document.querySelector('#transfer-scan-input'),'original scanner loaded');
  const scan=document.querySelector('#transfer-scan-input');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(scan,'QA-M');scan.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>scan.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
  await until(()=>document.querySelector('[data-transfer-scan-feedback]')?.getAttribute('data-state')==='success','scan success');assert.equal(input.value,'6');assert.match(document.querySelector('[data-transfer-scan-feedback]').textContent,/5 → 6/);assert.match(host.querySelector('#tc-totals').textContent,/7件/);assert.equal(Object.keys(session.getSnapshot().matrixQuantities).length,0);
  let command;await act(async()=>{command=session.saveProposal(id(70));});assert.ok(command);assert.equal(command.lines.filter(x=>x.skuId===m.id).length,1);assert.equal(command.lines.find(x=>x.skuId===m.id).quantity,'6');assert.equal(command.lines.find(x=>x.skuId===sku.id).existingLineId,id(85));
  await act(async()=>document.querySelector('[aria-label="关闭扫码抽屉"]').click());await act(async()=>root.unmount());root=null;session.dispose();console.log('PASS F06 actual saved matrix M5 → scan M6, feedback5→6, total7, single SAVE coordinate');
 }
}finally{if(root)await act(async()=>root.unmount());scope.dispose();dom.window.close();await rm(temp,{recursive:true,force:true});}
