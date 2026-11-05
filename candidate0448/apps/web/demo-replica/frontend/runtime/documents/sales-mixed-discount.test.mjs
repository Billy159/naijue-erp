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


test('formal mixed SALE UI keeps signed rows, disables discount and offers explicit clear without changing historical money',async t=>{
 const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.mixed-sales-'));
 try {
  const output=path.join(temp,'form.mjs');await build({entryPoints:[path.join(here,'proposal-form.tsx')],outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],plugins:[{name:'unrelated-controls-only',setup(b){b.onLoad({filter:/source-controls\.tsx$/},()=>({loader:'tsx',contents:'export const SourceDate=()=>null;export const SourceSingle=()=>null;'}));b.onLoad({filter:/proposal-picker\.tsx$/},()=>({loader:'tsx',contents:'export const ProposalReference=()=>null;export const ProposalPopup=()=>null;export const ProposalTrigger=p=>p.children;'}));}}]});
  const {SalesProposalForm:Form}=await import(pathToFileURL(output).href);
  const h=setup();try {
   await fillHeaders(h.session);const first=await selectLine(h.session),second=await selectLine(h.session);h.session.updateLine(first,{quantity:'2',dealPrice:'10.00'});h.session.updateLine(second,{quantity:'-1',dealPrice:'10.00'});h.session.setHeader({orderDiscount:'1.23'});
   const snapshot=h.session.getSnapshot().draft;
   const dom=new JSDOM('<div id="root"></div>',{url:'https://mixed-sales.test',pretendToBeVisual:true});const keys=['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','Event','MouseEvent','Element','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'];const saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
   for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,value:dom.window[k]});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
   const {act}=await import('react'),{createRoot}=await import('react-dom/client');const root=createRoot(document.querySelector('#root'));
   try {
    await act(async()=>root.render(createElement(Form,{session:h.session,scope:h.scope,productReader:{},denied(){assert.fail('denied');},actions:null,busy:false})));
    const adjustment=()=>document.querySelector('input[aria-label="整单优惠 / 抹零"]');
    assert.equal(document.querySelectorAll('[data-business-section]').length,1);assert.equal(adjustment().disabled,true);assert.equal(h.session.getSnapshot().draft.orderDiscount,'1.23');assert.match(document.body.textContent,/正负明细混合单不使用整单优惠/);
    await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='清除整单优惠').click());assert.equal(h.session.getSnapshot().draft.orderDiscount,'0.00');assert.equal(adjustment().disabled,true);await act(async()=>assert.ok(h.session.saveProposal(null)));
    const quantities=[...document.querySelectorAll('input[aria-label="本行数量"]')].filter(input=>!input.disabled);assert.deepEqual(quantities.map(input=>input.value),['2','-1']);
    await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(quantities[1],'-3');quantities[1].dispatchEvent(new dom.window.Event('input',{bubbles:true}));});assert.equal(h.session.getSnapshot().draft.lines[1].quantity,'-3');await act(async()=>assert.deepEqual(h.session.saveProposal(null).lines.map(row=>row.quantity),['2','-3']));
    await act(async()=>h.session.removeLine(second));assert.equal(adjustment().disabled,false,'removing the negative row reopens normal SALE discount');
   }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d]of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}
   const historical=setup();try {
    assert.equal(historical.session.initializeFromSaved({...snapshot,historicalSaleOrigin:{kind:'SIGNED_SALE',originalOrderDiscount:'123'}}),true);
    const page=new JSDOM(renderToStaticMarkup(createElement(Form,{session:historical.session,scope:historical.scope,productReader:{},denied(){assert.fail('denied');},actions:null,busy:false})));
    try{assert.equal(page.window.document.querySelector('input[aria-label="整单优惠 / 抹零"]'),null);assert.match(page.window.document.querySelector('.sale-discount-field').textContent,/-1\.23/);assert.doesNotMatch(page.window.document.body.textContent,/清除整单优惠/);assert.equal(historical.session.getSnapshot().draft.orderDiscount,'1.23');assert.equal(historical.session.saveProposal(id(500)).orderDiscount,'1.23');}finally{page.window.close();}
   }finally{historical.context.clear();}
  }finally{h.context.clear();}
 }finally{await rm(temp,{recursive:true,force:true});}
});
