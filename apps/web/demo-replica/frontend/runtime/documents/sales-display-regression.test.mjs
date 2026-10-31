import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {SalesProposalSession,salesProposalMoney,salesProposalMoneyInputDisplay} from '../../../../src/current-form/sales-proposal.ts';
import {ReadContext} from '../../../../src/loading/read-scope.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const reference=(n,name,more={})=>({id:id(n),name,code:null,hallId:null,hallName:null,paymentMethodId:null,paymentMethodName:null,...more});
const hall=reference(1,'TEST hall'),customer=reference(2,'TEST customer'),staff=reference(3,'TEST staff'),warehouse=reference(4,'TEST warehouse',{hallId:hall.id,hallName:hall.name});
const product={id:id(5),code:'TEST-PRODUCT',name:'TEST product',sizeGroupId:id(6),retailPrice:null,minimumPriceAvailability:'UNAVAILABLE'};
const sku={id:id(7),skuCode:'TEST-SKU',productId:product.id,productCode:product.code,productName:product.name,colorId:id(8),colorName:'TEST color',fitId:id(9),fitName:'TEST fit',sizeId:id(10),sizeName:'TEST size',sizeGroupId:product.sizeGroupId,barcodeAvailability:'UNAVAILABLE'};
const page=items=>({page:1,pageSize:20,exactTotal:BigInt(items.length),items});
function setup(retailPrice=null){
 const selectedProduct={...product,retailPrice};
 const context=new ReadContext({accountId:id(99),sessionRevision:'display-test',permissionRevision:'display-test'}),scope=context.createScope('sales');
 const session=new SalesProposalSession(scope,{
  readSalesReferences:async query=>page(query.kind==='hall'?[hall]:query.kind==='customer'?[customer]:query.kind==='warehouse'?[warehouse]:query.kind==='salesperson'?[staff]:[]),
  readProducts:async query=>page(!query.search||product.code.toLowerCase().includes(query.search.toLowerCase())?[selectedProduct]:[]),
  readProductSkus:async()=>page([sku]),
 });
 return {context,scope,session};
}
async function fillHeaders(session){
 session.setHeader({businessDate:'2026-10-29'});
 for(const [kind,row] of [['hall',hall],['customer',customer],['salesperson',staff],['warehouse',warehouse]]){await session.openPicker(kind);assert.equal(await session.select(row.id),true);}
}
async function selectLine(session){await session.openPicker('product');assert.equal(await session.select(product.id),true);assert.equal(await session.select(sku.id),true);session.closePicker();return session.getSnapshot().draft.lines.at(-1).key;}
function summary(Form,h){const dom=new JSDOM(renderToStaticMarkup(createElement(Form,{session:h.session,scope:h.scope,productReader:{},denied(error){throw error;},actions:null,busy:false})));try{return dom.window.document.querySelector('#sale-summary').textContent;}finally{dom.window.close();}}

test('N34-S13: deduction minus is exact presentation, zero unsigned and typed negative remains invalid',async()=>{
 for(const [raw,shown] of [['10','-10.00'],['10.1','-10.10'],['9007199254740993.01','-9007199254740993.01'],['0','0.00'],['0.00','0.00'],['-10','-10'],['+10','+10'],['10.','10.'],['',''],['NaN','NaN']])assert.equal(salesProposalMoneyInputDisplay(raw),shown,raw);
 const h=setup();try{await fillHeaders(h.session);const key=await selectLine(h.session);h.session.updateLine(key,{dealPrice:'100',quantity:'1'});h.session.setHeader({orderDiscount:'10'});
  assert.equal(salesProposalMoney(h.session.getSnapshot().draft)?.netDueMinor,'9000');assert.equal(h.session.saveProposal(null)?.orderDiscount,'10.00');assert.equal(h.session.getSnapshot().draft.orderDiscount,'10');
  h.session.setHeader({orderDiscount:'-10'});assert.equal(salesProposalMoney(h.session.getSnapshot().draft),null);assert.equal(h.session.saveProposal(null),null);assert.equal(h.session.validate(),null);assert.equal(h.session.getSnapshot().draft.orderDiscount,'-10');
 }finally{h.context.clear();}
});

test('N34-S03: runtime summary excludes only unselected queries; strict SAVE and selected unknown stay strict',async t=>{
 const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.sales-display-'));
 try{
  const output=path.join(temp,'form.mjs');await build({entryPoints:[path.join(here,'proposal-form.tsx')],outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],plugins:[{name:'unrelated-controls-only',setup(b){b.onLoad({filter:/source-controls\.tsx$/},()=>({loader:'tsx',contents:'export const SourceDate=()=>null;export const SourceSingle=()=>null;'}));b.onLoad({filter:/proposal-picker\.tsx$/},()=>({loader:'tsx',contents:'export const ProposalReference=()=>null;export const ProposalPopup=()=>null;export const ProposalTrigger=p=>p.children;'}));b.onLoad({filter:/native-dialog\.tsx$/},()=>({loader:'tsx',contents:'export const SaleDialog=p=><div>{p.children}{p.footer}</div>;'}));}}]});
  const {SalesProposalForm:Form}=await import(pathToFileURL(output).href);
  for(const mode of ['SALE','RETURN_EXCHANGE'])await t.test(mode+' empty draft + no-match search is a known empty display, not a zero-priced line',async()=>{
   const h=setup();try{await fillHeaders(h.session);h.session.setBusinessMode(mode);const direction=mode==='SALE'?'OUT':'IN',key=h.session.getSnapshot().entries[direction][0].key;
    const raw=mode==='SALE'?'ZZZ-NO-PRODUCT':'ZZZ-RETURN';h.session.updateEntry(direction,{query:raw},key);await h.session.openEntryPicker(direction,'product',key);assert.equal(h.session.getSnapshot().picker.result.exactTotal,0n);h.session.closePicker();
    assert.equal(h.session.pricingLines,null,'strict projection still blocks an unselected query');assert.equal(h.session.saveProposal(null),null);assert.equal(h.session.getSnapshot().draft.lines.length,0);assert.equal(h.session.getSnapshot().entries[direction].find(row=>row.key===key).query,raw);
    const text=summary(Form,h);if(mode==='SALE'){assert.match(text,/0款 0件/);assert.match(text,/销售金额 ¥0\.00/);assert.match(text,/优惠 ¥0\.00/);assert.match(text,/应结 ¥0\.00/);}else{assert.match(text,/退回 0件/);assert.match(text,/换出 0件/);assert.match(text,/差额 ¥0\.00/);}assert.doesNotMatch(text,/—/);
   }finally{h.context.clear();}
  });
  await t.test('selected complete SKU with unknown price remains unknown even beside pure search text',async()=>{
   const h=setup();try{await fillHeaders(h.session);const key=await selectLine(h.session);assert.equal(h.session.getSnapshot().draft.lines[0].product.retailPrice,null);assert.equal(h.session.getSnapshot().draft.lines[0].dealPrice,'');
    const queryKey=h.session.getSnapshot().entries.OUT[0].key;h.session.updateEntry('OUT',{query:'ZZZ-NO-PRODUCT'},queryKey);assert.match(summary(Form,h),/1款 1件/);assert.match(summary(Form,h),/销售金额 ¥—/);assert.equal(h.session.saveProposal(null),null);assert.equal(h.session.getSnapshot().draft.lines.find(row=>row.key===key).dealPrice,'');
    h.session.clearEntry('OUT',queryKey);h.session.updateLine(key,{dealPrice:'100'});h.session.setHeader({orderDiscount:'10'});assert.match(summary(Form,h),/销售金额 ¥100\.00优惠 ¥10\.00应结 ¥90\.00/);assert.equal(h.session.saveProposal(null).orderDiscount,'10.00');
    h.session.setBusinessMode('RETURN_EXCHANGE');h.session.updateLine(key,{quantity:'1'});assert.equal(h.session.getSnapshot().draft.businessType,'EXCHANGE');const q=h.session.getSnapshot().entries.OUT[0].key;h.session.updateEntry('OUT',{query:'ZZZ-EXCHANGE'},q);assert.match(summary(Form,h),/换出 1件/);assert.match(summary(Form,h),/应收 ¥100\.00/);assert.equal(h.session.pricingLines,null);assert.equal(h.session.saveProposal(null),null);
   }finally{h.context.clear();}
  });
 }finally{await rm(temp,{recursive:true,force:true});}
});

test('F04 actual proposal form exposes effective zero and explicit cancel/confirm without rewriting price intent',async t=>{
 const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.zero-price-'));
 try{
  const output=path.join(temp,'form.mjs');await build({entryPoints:[path.join(here,'proposal-form.tsx')],outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],plugins:[{name:'unrelated-pickers-only',setup(b){b.onLoad({filter:/source-controls\.tsx$/},()=>({loader:'tsx',contents:'export const SourceDate=()=>null;export const SourceSingle=()=>null;'}));b.onLoad({filter:/proposal-picker\.tsx$/},()=>({loader:'tsx',contents:'export const ProposalReference=()=>null;export const ProposalPopup=()=>null;export const ProposalTrigger=p=>p.children;'}));}}]});
  const {SalesProposalForm:Form}=await import(pathToFileURL(output).href);
  await t.test('existing lines and unfinished entries use displayed zero, not stale raw price',async()=>{
   for(const entryMode of [false,true])for(const [retailPrice,patch,want] of [['100.00',{pricingRule:'DISCOUNT',discount:'0',dealPrice:'100'},true],['0.01',{pricingRule:'DISCOUNT',discount:'0.1',dealPrice:''},true],['0.01',{pricingRule:'DISCOUNT',discount:'5',dealPrice:'0'},false],[null,{pricingRule:'DISCOUNT',discount:'0',dealPrice:'0'},false],['100.00',{pricingRule:'DISCOUNT',discount:'5.',dealPrice:'0'},false],['100.00',{pricingRule:'UNIT_PRICE',dealPrice:' 00.00 '},true],['100.00',{pricingRule:'UNIT_PRICE',dealPrice:'0.'},false],['100.00',{pricingRule:'DISCOUNT',discount:'0',isGift:true},false]]){
    const h=setup(retailPrice);try{await fillHeaders(h.session);
     if(entryMode){const key=h.session.getSnapshot().entries.OUT[0].key;await h.session.openEntryPicker('OUT','product',key);assert.equal(await h.session.select(product.id),true);h.session.updateEntry('OUT',patch,key);}else{const key=await selectLine(h.session);h.session.updateLine(key,patch);}
     const dom=new JSDOM(renderToStaticMarkup(createElement(Form,{session:h.session,scope:h.scope,productReader:{},denied(){assert.fail('denied');},actions:null,busy:false})));
     try{const buttons=[...dom.window.document.querySelectorAll('button')].filter(b=>b.textContent==='确认零价');assert.equal(buttons.length,want?1:0,JSON.stringify({entryMode,retailPrice,patch}));}finally{dom.window.close();}
    }finally{h.context.clear();}
   }
  });
  await t.test('actual native dialog cancel keeps false, confirm sets true and discount editing resets it',async()=>{
   const dom=new JSDOM('<div id="root"></div>',{url:'https://zero-price.test',pretendToBeVisual:true});
   const keys=['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','Event','MouseEvent','Element','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'];const saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
   for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,value:dom.window[k]});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
   dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
   const {act}=await import('react'),{createRoot}=await import('react-dom/client');const root=createRoot(document.querySelector('#root')),h=setup('100.00');
   try{
    await fillHeaders(h.session);const key=await selectLine(h.session);h.session.updateLine(key,{dealPrice:'100',pricingRule:'DISCOUNT',discount:'0'});
    await act(async()=>root.render(createElement(Form,{session:h.session,scope:h.scope,productReader:{},denied(){assert.fail('denied');},actions:null,busy:false})));
    const row=()=>h.session.getSnapshot().draft.lines.find(r=>r.key===key),button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
    assert.equal(document.querySelector('input[aria-label="本行成交单价"]').value,'0.00');assert.equal(!!button('确认零价'),true);await act(async()=>assert.equal(h.session.saveProposal(null),null));
    await act(async()=>button('确认零价').click());assert.equal(document.querySelector('dialog').open,true);await act(async()=>document.querySelector('dialog footer .btn').click());assert.equal(row().zeroConfirmed,false);
    await act(async()=>button('确认零价').click());await act(async()=>document.querySelector('dialog footer .primary').click());assert.equal(row().zeroConfirmed,true);assert.equal(button('确认零价'),undefined);
    let command;await act(async()=>{command=h.session.saveProposal(null);});assert.ok(command);assert.equal(command.lines[0].pricingRule,'DISCOUNT');assert.equal(command.lines[0].discountTenths,0);assert.equal(command.lines[0].dealPrice,'0.00');assert.equal(command.lines[0].isGift,false);assert.equal(row().dealPrice,'100');
    const input=document.querySelector('input[aria-label="本行折扣"]');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'0.1');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
    assert.equal(row().discount,'0.1');assert.equal(row().zeroConfirmed,false);assert.equal(row().pricingRule,'DISCOUNT');assert.equal(row().dealPrice,'100');
   }finally{await act(async()=>root.unmount());h.context.clear();dom.window.close();for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}
  });
 }finally{await rm(temp,{recursive:true,force:true});}
});
