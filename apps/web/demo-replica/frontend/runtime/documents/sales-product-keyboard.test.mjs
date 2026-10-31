import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {SalesProposalSession} from '../../../../src/current-form/sales-proposal.ts';
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
 const output=path.join(temp,'form.mjs');await build({entryPoints:[path.join(here,'proposal-form.tsx')],outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'nonvisual-preview-and-css',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({loader:'js',contents:'export default "";'}));b.onLoad({filter:/products\/preview\.tsx$/},()=>({loader:'tsx',contents:'export const ProductCandidatePreview=()=>null;'}));}}]});
 const {SalesProposalForm}=await import(pathToFileURL(output).href),host=document.getElementById('root');
 const product={id:sku.productId,code:sku.productCode,name:sku.productName,sizeGroupId:sku.sizeGroupId,retailPrice:'1.00'};
 const hall={id:id(20),name:'测试厅',paymentMethodId:null};
 const session=new SalesProposalSession(scope,{readSalesReferences:async query=>page(query.kind==='paymentMethod'?[{...hall,id:id(21),name:'现金'}]:query.kind==='paymentAccount'?[{...hall,id:id(22),name:'现金账户',paymentMethodId:id(21)}]:[hall]),readProducts:async()=>page([product]),readProductSkus:async()=>page([sku])});
 await session.openPicker('hall');await session.select(hall.id);
 root=createRoot(host);await act(async()=>root.render(createElement(SalesProposalForm,{session,scope,productReader:{},denied:e=>{throw e;},busy:false,actions:null})));
 const settle=()=>act(async()=>new Promise(r=>setTimeout(r,40)));
 const discount=host.querySelector('input[aria-label="整单优惠 / 抹零"]');
 // Raw must commit synchronously; only an actual formatted-to-raw rewrite
 // deliberately selects all raw text for replacement. Unchanged/invalid text
 // keeps its range. Native direct-fill and pointer/Tab tests remain authoritative.
 const focusCases=[
  ['20','-20.00',0,6],['20','-20.00',2,3],['20','-20.00',2,2],
  ['20','-20.00',0,1],['20','-20.00',4,6],['0','0.00',0,4],['0.00','0.00',0,4],
  ['0010.1','-10.10',2,5],[' 0010.1 ','-10.10',2,5],
  ['-10','-10',1,3],['10.','10.',1,3],['NaN','NaN',1,2],
 ];
 for(const [raw,shown,start,end] of focusCases)for(let repeat=0;repeat<2;repeat++){
  await act(async()=>{discount.blur();session.setHeader({orderDiscount:raw});});await settle();assert.equal(discount.value,shown);
  const beforeFocus=session.getSnapshot();
  await act(async()=>{
   if(start===0&&end===shown.length)discount.select();else discount.setSelectionRange(start,end,'backward');
   const nativeRange=discount.setSelectionRange,hadOwnRange=Object.hasOwn(discount,'setSelectionRange');let focusRangeWrites=0;
   discount.setSelectionRange=function(...args){focusRangeWrites++;return nativeRange.apply(this,args);};
   try{discount.focus();}finally{if(hadOwnRange)discount.setSelectionRange=nativeRange;else delete discount.setSelectionRange;}
   assert.equal(focusRangeWrites,raw===shown?0:1,'only a changed presentation may deliberately select raw text');
   assert.deepEqual([discount.selectionStart,discount.selectionEnd],raw===shown?[start,end]:[0,raw.length],'changed projection selects all; unchanged text preserves partial/caret');
   if(raw===shown&&start!==end&&!(start===0&&end===shown.length))assert.equal(discount.selectionDirection,'backward');
   assert.equal(discount.value,raw,'raw must commit synchronously before selection-based input resumes');
   assert.equal(session.getSnapshot(),beforeFocus,'focus must not publish/normalize the draft or dirty state');
  });
  await act(async()=>discount.blur());await settle();assert.equal(discount.value,shown);assert.equal(session.getSnapshot().draft.orderDiscount,raw);
 }
 await act(async()=>session.setHeader({orderDiscount:'20'}));await settle();assert.equal(discount.value,'-20.00');
 await act(async()=>{
  discount.setSelectionRange(0,0);discount.focus();
  assert.equal(discount.value,'20','raw is synchronous before a subsequent editing operation');
  assert.deepEqual([discount.selectionStart,discount.selectionEnd],[0,2],'changed projection deliberately selects all even when focus captured a collapsed caret');
  discount.setRangeText('0',discount.selectionStart,discount.selectionEnd,'end');discount.dispatchEvent(new Event('input',{bubbles:true}));
 });await settle();assert.equal(discount.value,'0');assert.equal(session.getSnapshot().draft.orderDiscount,'0');
 await act(async()=>discount.blur());await settle();assert.equal(discount.value,'0.00','zero remains unsigned after projection-select-all replacement');
 await act(async()=>session.setHeader({orderDiscount:'20'}));await settle();
 await act(async()=>{
  discount.focus();assert.deepEqual([discount.selectionStart,discount.selectionEnd],[0,2]);
  discount.setSelectionRange(1,2);discount.setRangeText('5',discount.selectionStart,discount.selectionEnd,'end');discount.dispatchEvent(new Event('input',{bubbles:true}));
 });await settle();assert.equal(discount.value,'25');assert.equal(session.getSnapshot().draft.orderDiscount,'25','partial editing after focus must retain the intended raw digits');
 await act(async()=>discount.blur());await settle();assert.equal(discount.value,'-25.00');
 for(const [raw,expected] of [['10','-10.00'],['10.1','-10.10'],['9007199254740993.01','-9007199254740993.01'],['0','0.00'],['-10','-10'],['10.','10.'],['x','x'],['','']]){
  await act(async()=>{discount.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(discount,raw);discount.dispatchEvent(new Event('input',{bubbles:true}));});await settle();assert.equal(discount.value,raw,'typing must retain raw draft');
  await act(async()=>discount.blur());await settle();assert.equal(discount.value,expected,'valid blur displays Demo deduction sign and exact cents; invalid input stays raw');assert.equal(session.getSnapshot().draft.orderDiscount,raw,'presentation must never rewrite the semantic discount');
  for(let repeat=0;repeat<2;repeat++){await act(async()=>discount.focus());await settle();assert.equal(discount.value,raw,'focus restores exact raw input, not the generated minus');await act(async()=>discount.blur());await settle();assert.equal(discount.value,expected);assert.equal(session.getSnapshot().draft.orderDiscount,raw);}
 }
 await act(async()=>session.setHeader({orderDiscount:'0.00'}));
 const input=host.querySelector('input[aria-label="商品款号 / 名称 / 条码"]');assert.ok(input);assert.equal(input.disabled,false);
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'QA');input.dispatchEvent(new Event('input',{bubbles:true}));});await settle();assert.equal(document.querySelectorAll('[data-sale-candidate]').length,1);
 await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));await settle();assert.equal(session.getSnapshot().picker,null);assert.equal(input.value,'QA');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'QA2');input.dispatchEvent(new Event('input',{bubbles:true}));});await settle();assert.equal(document.querySelectorAll('[data-sale-candidate]').length,1);
 await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));await settle();assert.equal(session.getSnapshot().entries.OUT[0].product?.id,product.id);
 await act(async()=>session.setBusinessMode('RETURN_EXCHANGE'));await settle();assert.equal(host.querySelectorAll('.sale-entry-section').length,1);const selected=session.getSnapshot().entries.IN.find(row=>row.product);assert.ok(selected);
 await act(async()=>session.updateEntry('IN',{dealPrice:'1.00',quantity:'-2'},selected.key));await settle();assert.match(host.querySelector('#sale-summary').textContent,/应退 ¥2.00/);const negativeInput=host.querySelector('input[aria-label="本行数量"]');assert.equal(negativeInput.value,'-2');const quantityGroup=negativeInput.closest('.sale-quantity-control');assert.ok(quantityGroup,'direction and signed input have one inline visual owner');const directionHost=quantityGroup.querySelector('[data-line-direction]');assert.equal(Boolean(directionHost),true,'selected quantity direction host remains mounted');assert.equal(directionHost.parentElement===quantityGroup,true,'direction stays in the same quantity visual owner');assert.ok(host.querySelector('.sale-return-exchange-table'));
 const walk=(selector,node=host)=>[...node.querySelectorAll(selector),...[...node.querySelectorAll('*')].flatMap(el=>el.shadowRoot?walk(selector,el.shadowRoot):[])];const direction=walk('[aria-label="本行方向"]')[0];assert.ok(direction,'selected return/exchange line exposes actual direction control');await act(async()=>direction.click());await settle();const outgoing=walk('.arco-select-option').find(el=>el.textContent==='换出');assert.ok(outgoing);const beforeDirection=session.getSnapshot().draft.settlements;await act(async()=>outgoing.click());await settle();assert.deepEqual(session.getSnapshot().draft.settlements,beforeDirection,'direction must not invent payment adjustments');await settle();assert.equal(host.querySelectorAll('.sale-entry-section').length,1);assert.equal(host.querySelector('input[aria-label="本行数量"]')===negativeInput,true,'stable row DOM across direction change');assert.equal(negativeInput.value,'2');assert.equal(negativeInput.closest('.sale-quantity-control')===quantityGroup,true,'direction switch preserves visual owner and native input');assert.match(host.querySelector('#sale-summary').textContent,/应收 ¥2.00/);assert.equal(session.getSnapshot().entries.OUT.find(row=>row.key===selected.key).quantity,'2');
 const deep=(selector,node=host)=>[...node.querySelectorAll(selector),...[...node.querySelectorAll('*')].flatMap(el=>el.shadowRoot?deep(selector,el.shadowRoot):[])];
 const method=deep('[aria-label="第1笔支付方式"]')[0];assert.ok(method);
 await act(async()=>method.focus());await settle();const methodInput=method.querySelector('input');assert.ok(methodInput);assert.equal(method.getRootNode().activeElement,methodInput);assert.equal(method.tabIndex,-1,'searchable reference wrapper must not be a backward-tab stop before its already focused input');assert.equal(methodInput.tabIndex,0,'the search input remains natively tabbable');
 await act(async()=>method.click());await settle();const option=deep('.arco-select-option').find(el=>el.textContent==='现金');assert.ok(option);await act(async()=>option.click());await settle();assert.equal(session.getSnapshot().draft.settlements[0]?.method?.id,id(21));
 const account=deep('[aria-label="第1笔资金账户"]')[0];assert.ok(account);assert.ok(account===document.activeElement||account.contains(account.getRootNode().activeElement),'payment method selection moves focus to account');await act(async()=>account.click());await settle();const accountOption=deep('.arco-select-option').find(el=>el.textContent==='现金账户');assert.ok(accountOption);await act(async()=>accountOption.click());await settle();assert.equal(document.activeElement,host.querySelector('input[aria-label="第1笔收款金额"]'));
 console.log('PASS actual SalesProposalForm: Esc closes candidate without losing query, single-candidate Enter selects real proposal product');
}finally{if(root)await act(async()=>root.unmount());scope.dispose();dom.window.close();await rm(temp,{recursive:true,force:true});}
