import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {productIdentities} from '../server/domain/products/identity.ts';
import {correctionChoices,createCorrectionController} from '../frontend/inventory-correction-service.mjs';

const uid=n=>`24000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const option=(id,sourceCode)=>({id,name:'无尺码',code:sourceCode,sourceName:'无尺码',sourceCode});
function fixture({duplicate=true}={}){
 const productId=uid(1),color={id:uid(2),code:'BLACK',name:'黑'},size900=option(uid(900),'900'),size910=option(uid(910),'910');
 const sku=(n,size,fit='A',enabled=true,p=productId)=>({id:uid(n),product_id:p,fit_id:fit,enabled,options:{COLOR:color,SIZE:size}});
 const catalog={products:[{id:productId,code:'000P',name:'Synthetic',enabled:true,attributes:{}},{id:uid(9),code:'OFF',name:'Stopped',enabled:false,attributes:{}}],
  skus:[sku(101,size900),sku(102,size910),sku(103,size900,'B'),...(duplicate?[sku(104,size900)]:[]),sku(105,option(uid(999),'999'),'A',false),sku(106,size900,'A',true,uid(9))],
  barcodes:[{product_id:productId,sku_id:uid(101),barcode:'AMB'},{product_id:productId,sku_id:uid(102),barcode:'AMB'},...(duplicate?[{product_id:productId,sku_id:uid(104),barcode:'AMB'}]:[]),{product_id:productId,sku_id:null,barcode:'01'}],
  aliases:[{product_id:productId,sku_id:uid(102),barcode:'000Old-aB'}],profiles:[],sourceBarcodes:[]};
 const p={id:'000P',uuid:productId,name:'Synthetic',styleNumber:'000P',fitId:'A',colorIds:[color.id],sizeIds:[size900.id,size910.id],colors:['黑'],sizes:['无尺码','无尺码'],skuByCell:{[color.id+'|'+size900.id]:uid(101),[color.id+'|'+size910.id]:uid(102)},barcodes:{}};
 const b={...p,id:'000P::fit:B',fitId:'B',skuByCell:{[color.id+'|'+size900.id]:uid(103)}};
 return {snapshot:productIdentities(catalog),p,b};
}
function replacementHarness(options){
 const {snapshot,p,b}=fixture(options),dom=new JSDOM('<body><input id="replace"></body>',{url:'https://t24-repair.invalid/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,ctx=dom.getInternalVMContext(),chosen=[];
 w.REAL_DATA_MODE=true;w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['product-identity.js','product-finder.js'])vm.runInContext(readFileSync(new URL('../frontend/'+file,import.meta.url),'utf8'),ctx,{filename:file});
 w.PRODUCT_IDENTITY.install(snapshot,(code,fit)=>code==='000P'?(fit==='B'?b:p):null);
 w.C={resolve:raw=>w.PRODUCT_IDENTITY.resolve(raw)};w.D={products:[p]};w.T={ready:true};w.F=w.PRODUCT_FINDER;w.choose=value=>chosen.push(value);
 const create=w.F.create;let finderOptions;w.F.create=value=>{finderOptions=value;return create(value)};
 const source=readFileSync(new URL('../frontend/transfer-matrix-experiment.js',import.meta.url),'utf8');
 const start=source.indexOf('function replacementMatches('),end=source.indexOf('const sharedSpecMenu=',start);
 assert(start>=0&&end>start,'Production replacement picker boundary must exist');
 vm.runInContext(source.slice(start,end)+'\nwindow.repairFinder=replacementFinder;',ctx,{filename:'production-transfer-replacement'});
 const anchor=w.document.querySelector('#replace'),finder=w.repairFinder;
 const key=value=>anchor.dispatchEvent(new w.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));
 return {w,p,chosen,finder,finderOptions,key,async show(raw){anchor.value=raw;anchor.focus();await finder.show(anchor,raw,{onSelect:w.choose});},close(){finder.destroy();w.close()}};
}
test('T24 repair: one visible row retains server ambiguity; bare Enter waits, explicit click selects original SKU',async()=>{
 const h=replacementHarness();try{
  assert.equal(h.w.C.resolve('AMB').candidates.length,3);assert.equal(h.w.C.resolve('AMB').matches.length,1);
  await h.show('AMB');assert.equal(h.finder.popup.querySelectorAll('[data-finder-option]').length,1);
  h.key('Enter');assert.equal(h.chosen.length,0);assert.equal(h.finder.active,true);
  h.finder.popup.querySelector('[data-finder-option="0"]').click();assert.equal(h.chosen.length,1);
  assert.equal(h.chosen[0].skuId,uid(102));assert.equal(h.chosen[0].sizeId,uid(910));
 }finally{h.close()}
});
test('T24 repair: arrow then Enter is explicit selection even with one visible ambiguous row',async()=>{
 const h=replacementHarness();try{await h.show('AMB');h.key('ArrowDown');h.key('Enter');assert.equal(h.chosen.length,1);assert.equal(h.chosen[0].skuId,uid(102));}finally{h.close()}
});
test('T24 repair: multi-match and missing stay unselected; unique registered old code retains exact cell',async()=>{
 const h=replacementHarness({duplicate:false});try{
  await h.show('AMB');assert.equal(h.finder.popup.querySelectorAll('[data-finder-option]').length,2);h.key('Enter');assert.equal(h.chosen.length,0);
  await h.show('missing');h.key('Enter');assert.equal(h.chosen.length,0);
  await h.show('000Old-aB');h.key('Enter');assert.equal(h.chosen.length,1);assert.equal(h.chosen[0].productId,h.p.id);assert.equal(h.chosen[0].sizeId,uid(910));
 }finally{h.close()}
});
test('T24 repair: replacement callback independently honors selection flag and resolver ambiguity',()=>{
 const h=replacementHarness();try{
  const search=h.w.F.search;h.w.F.search=(...args)=>search(...args).map(row=>({...row,requireSelection:false}));
  assert.equal(h.finderOptions.onEnter('AMB'),false);assert.equal(h.chosen.length,0);
  h.w.F.search=(...args)=>search(...args).map(row=>({...row,requireSelection:true}));
  assert.equal(h.finderOptions.onEnter('000Old-aB'),false);assert.equal(h.chosen.length,0);
 }finally{h.close()}
});
const warehouses={items:[{id:uid(301),name:'Synthetic Warehouse',enabled:true},{id:uid(302),enabled:false}]};
test('T24 repair: correction choices consume service identities without merging size or fit identities',()=>{
 const snapshot=fixture().snapshot,before=JSON.stringify(snapshot),choices=correctionChoices(snapshot,warehouses);
 assert.deepEqual(choices.warehouses.map(x=>x.id),[uid(301)]);
 assert.deepEqual(choices.skus.map(x=>x.id),[uid(101),uid(102),uid(103),uid(104)]);
 assert(choices.skus.every(x=>x.productId===uid(1)));assert.match(choices.skus[0].label,/900/);assert.match(choices.skus[1].label,/910/);assert.match(choices.skus[2].label,/B版/);
 assert.equal(new Set(choices.skus.map(x=>x.label)).size,4);assert.equal(JSON.stringify(snapshot),before);
});
// Synthetic, reconciled piece cell; never infer a unit for missing source facts.
const correctionUnit='件';
function correctionHarness(){
 const calls=[],values=new Map(),pending=[],completed=[];let actor={id:'synthetic-admin',role:'ADMIN'},behavior='success',serial=0,posted;
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const api={pending:()=>pending,complete:(requestId,owner)=>{completed.push({requestId,owner});pending.splice(0);},result:async(requestId,operationId)=>{calls.push({path:'result',requestId,operationId});return {resolution:'COMMITTED',documentId:posted.correctionId};},
  async request(path,input,options){calls.push({path,input,options});
   if(path==='/runtime/product-identity')return fixture().snapshot;
   if(path==='/reference/warehouses?size=500')return warehouses;
   if(path.startsWith('/correction/preview?'))return {...Object.fromEntries(new URLSearchParams(path.split('?')[1])),balanceVersion:3,balanceQuantity:'5.0000',actualQuantity:'4.0000',difference:'-1.0000'};
   if(path==='/correction/confirm'){
    posted=input;
    if(behavior==='conflict'){behavior='success';throw Object.assign(new Error('Balance changed'),{code:'BALANCE_CONFLICT',latest:{...input,balanceVersion:4,balanceQuantity:'6.0000',difference:'-2.0000'}})}
    if(behavior==='unknown'){pending.push({requestId:input.requestKey,operationId:'correction.confirm'});throw Object.assign(new Error('Response lost'),{code:'RESULT_UNKNOWN'})}
    return {correctionId:input.correctionId};
   }
   if(path.startsWith('/corrections/'))return {correction:{id:posted.correctionId,warehouseId:posted.warehouseId,skuId:posted.skuId,unit:posted.unit,actualQuantity:posted.actualQuantity,reason:posted.reason}};
   if(path.startsWith('/inventory?')){
    const query=new URLSearchParams(path.split('?')[1]);
    const items=query.has('unit')&&query.get('unit')!==correctionUnit?[]:[{skuId:query.get('skuId'),warehouseId:query.get('warehouseId'),unit:correctionUnit,quantity:posted?'4.0000':'5.0000',quantityScale:0,unitConflict:false,basis:{reconciled:true}}];
    return {items,total:items.length,reconciled:true};
   }
   throw new Error('Unexpected endpoint: '+path);
  }};
 const create=()=>createCorrectionController({api,actor:()=>actor,storage,uuid:()=>uid(700+serial++)});
 return {calls,completed,create,setBehavior:value=>{behavior=value},switchActor:value=>{actor=value}};
}
async function prepared(h){
 const c=h.create();await c.open();await c.change('warehouseId',uid(301));await c.change('skuId',uid(102));
 assert.deepEqual(c.state.availableUnits,[correctionUnit]);c.change('unit',correctionUnit);
 c.change('actualQuantity','4');c.change('reason','Synthetic recount');await c.preview();return c;
}
test('T24 repair: correction opens unified endpoint and original SKU survives preview, confirm and readback',async()=>{
 const h=correctionHarness(),c=await prepared(h);
 assert.equal(h.calls.filter(x=>x.path==='/runtime/product-identity').length,1);assert.equal(h.calls.some(x=>x.path==='/runtime/catalog'),false);
 assert.equal(c.state.choices.skus.length,4);const result=await c.confirm();assert.equal(result.ok,true);assert.equal(result.record.correction.skuId,uid(102));assert.equal(c.state.balance.quantity,'4.0000');
 const posted=h.calls.find(x=>x.path==='/correction/confirm');assert.equal(posted.input.skuId,uid(102));assert.equal(posted.input.unit,correctionUnit);assert.equal(posted.input.expectedBalanceVersion,3);assert.equal(posted.input.expectedVersion,0);assert.equal(posted.options.operationId,'correction.confirm');assert.equal(posted.options.readback,true);assert.equal(h.completed.length,1);
 assert.equal(result.record.correction.unit,correctionUnit);assert.equal(c.state.balance.unit,correctionUnit);
 assert.equal(new URLSearchParams(h.calls.filter(x=>x.path.startsWith('/inventory?')).at(-1).path.split('?')[1]).get('unit'),correctionUnit);
});
test('T24 repair: balance conflict still requires renewed confirmation against latest version',async()=>{
 const h=correctionHarness(),c=await prepared(h);h.setBehavior('conflict');await assert.rejects(c.confirm(),{code:'BALANCE_CONFLICT'});
 assert.equal(c.state.changed,true);assert.equal(c.state.preview.balanceVersion,4);assert.equal(c.state.result,null);assert.equal(h.calls.filter(x=>x.path==='/correction/confirm').length,1);
 await c.confirm();const posts=h.calls.filter(x=>x.path==='/correction/confirm');assert.equal(posts.length,2);assert.equal(posts[1].input.expectedBalanceVersion,4);assert.equal(posts[1].input.skuId,uid(102));assert.equal(posts[1].input.unit,correctionUnit);
});
test('T24 repair: unknown result survives reopen and recovery queries without replaying confirm',async()=>{
 const h=correctionHarness(),c=await prepared(h);h.setBehavior('unknown');await assert.rejects(c.confirm(),{code:'RESULT_UNKNOWN'});const requestId=c.state.pendingId;assert(requestId);
 const reloaded=h.create();await reloaded.open();assert.equal(reloaded.state.input.skuId,uid(102));assert.equal(reloaded.state.input.unit,correctionUnit);assert.equal(reloaded.state.pendingId,requestId);
 const posts=h.calls.filter(x=>x.path==='/correction/confirm').length,result=await reloaded.recoverRequest(requestId);
 assert.equal(result.ok,true);assert.equal(result.record.correction.skuId,uid(102));assert.equal(result.record.correction.unit,correctionUnit);assert.equal(reloaded.state.pendingId,null);assert.equal(h.calls.filter(x=>x.path==='/correction/confirm').length,posts);assert.equal(h.completed.length,1);
});
test('T24 repair: correction candidate read retains role and actor isolation',async()=>{
 const h=correctionHarness(),c=await prepared(h);h.switchActor({id:'synthetic-other',role:'WAREHOUSE'});const other=h.create();await other.open();assert.equal(other.state.input.skuId,'');assert.equal(other.state.input.unit,'');assert.equal(other.state.input.reason,'');
 const count=h.calls.length;h.switchActor({id:'synthetic-sales',role:'SALESPERSON'});assert.equal(await other.open(),false);assert.equal(h.calls.length,count);await assert.rejects(c.preview(),/登录身份已变化/);
});
