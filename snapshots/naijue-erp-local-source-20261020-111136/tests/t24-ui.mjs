import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {product as adaptProduct,FITS} from '../frontend/legacy-adapter.mjs';
import {currentSpecView} from '../frontend/product-spec-view.mjs';
import {currentSizeGroups} from '../frontend/product-size-groups.mjs';
import {fitView,fitViewId} from '../frontend/business-product-view.mjs';

export async function exerciseIdentityUI({catalog,snapshot,api,warehouses,sku900,sku910,alias,aSku,bSku,stopped=false}){
 const dom=new JSDOM('<body><input id="lookup"><main id="page"></main></body>',{url:'https://t24.invalid/#sales/new',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,ctx=dom.getInternalVMContext(),root=new URL('../frontend/',import.meta.url);
 w.structuredClone=structuredClone;w.REAL_DATA_MODE=true;w.HTMLElement.prototype.scrollIntoView=function(){};
 const C=w.PRODUCT_CATALOG={initialize(){},categoryNodes:()=>[],groups:currentSizeGroups(),group(id){return this.groups.find(g=>g.id===id)},colors:[],fits:FITS,fit:id=>FITS.find(f=>f.id===id)};
 for(const sku of catalog.skus){const color=sku.options.COLOR;if(color&&!C.colors.some(c=>c.id===color.id))C.colors.push(color)}
 const products=catalog.products.map(row=>{
  const skus=catalog.skus.filter(s=>s.product_id===row.id),p=adaptProduct(row,skus,catalog.barcodes.filter(b=>b.product_id===row.id)),profile=catalog.profiles.find(x=>x.product_id===row.id);
  Object.assign(p,profile?.body||{},{profileVersion:profile?.version||0});currentSpecView(p,skus,C);
  for(const alias of catalog.aliases.filter(a=>a.product_id===row.id)){const binding=Object.values(p.barcodes).find(b=>b.skuId===alias.sku_id);if(binding){binding.compatible??=[];binding.compatible.push({code:alias.barcode,source:alias.origin})}}
  p.stock=Object.fromEntries(warehouses.map(w=>[w.id,p.colorIds.map(()=>p.sizeIds.map(()=>0))]));return p;
 });
 C.businessProduct=id=>{const direct=products.find(p=>p.id===id);if(direct)return direct;const [code,fit]=id.split('::fit:');const p=products.find(p=>p.id===code);return p&&fitView(p,fit,C,[],warehouses)};
 const lookup=(code,fit)=>{const p=products.find(p=>p.id===code);return p&&C.businessProduct(fitViewId(p,fit))};
 w.ERP_API={request:api};w.ERP_DEMO={products,warehouses};
 for(const file of ['product-identity.js','product-finder.js','sales-core.js','sales-model.js','engine.js'])vm.runInContext(readFileSync(new URL(file,root),'utf8'),ctx,{filename:file});
 const I=w.PRODUCT_IDENTITY,F=w.PRODUCT_FINDER,M=w.SALES_MODEL,K=w.SALES_CORE;
 I.install(snapshot,lookup);C.resolve=raw=>I.resolve(raw);w.LEGACY_REAL={resolveIdentity:raw=>I.resolveFresh(raw)};
 try{
  const live=await I.resolveFresh(alias);assert.equal(live.matches[0].skuId,bSku);assert.equal(live.matches[0].p.fitId,'B');
  const productB=live.matches[0].p,bs=live.matches[0].s,bc=live.matches[0].c;
  if(stopped){
   assert.equal(live.matches[0].enabled,false);assert.equal(F.validSpec(productB,bc,bs),false);assert.equal(K.validSpec(productB,bc,bs),false);
   const doc={status:'未审核',q:{},items:[],hiddenColors:[],scans:[]};assert(w.GOLD.scan(doc,alias,live).error);assert.deepEqual(Object.keys(doc.q),[]);
   const sale={lines:[]};assert(M.scan(sale,productB,bc,bs,[],alias,null,'stopped').error);assert.equal(sale.lines.length,0);assert(M.batch(sale,productB,{[bc+'|'+bs]:1},1000).error);
   return {status:'PASS',stoppedScanAndMatrix:true,originalSku:bSku};
  }
  const hit=I.resolve('000900aB'),old=hit.matches[0].p,c=hit.matches[0].c,s900=hit.matches[0].s,s910=I.resolve('000910Ab').matches[0].s;
  assert.notEqual(s900,s910);assert.equal(old.sizes[s900],old.sizes[s910]);assert.equal(I.cell(old,c,s900).skuId,sku900);assert.equal(I.cell(old,c,s910).skuId,sku910);
  const doc={status:'未审核',q:{},items:[],hiddenColors:[],scans:[]};
  for(const code of ['AMB-000','01','unknown','900aB']){assert(w.GOLD.scan(doc,code).error);assert.equal(Object.keys(doc.q).length,0)}
  // Actual finder UI leaves quantities alone and requires a selected ambiguous row.
  let chosen=null;const anchor=w.document.querySelector('#lookup'),finder=F.create({previewRenderer:()=>'',getProducts:()=>products,resolve:C.resolve,onSelect:id=>{chosen=id}});anchor.value='AMB-000';anchor.focus();
  await finder.show(anchor,'AMB-000');assert.equal(finder.popup.querySelectorAll('[data-finder-option]').length,2);assert.equal(w.document.activeElement,anchor);
  anchor.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(chosen,null);
  finder.popup.querySelector('[data-finder-option="1"]').click();assert.equal(chosen.skuId,sku910);assert.equal(chosen.sizeId,old.sizeIds[s910]);assert.equal(Object.keys(doc.q).length,0);
  // A unique full code preselects B's original cell even if indices differ from A.
  chosen=null;await finder.show(anchor,alias);finder.popup.querySelector('[data-finder-option="0"]').click();assert.equal(chosen.skuId,bSku);assert.equal(chosen.productId,productB.id);assert.equal(chosen.sizeId,productB.sizeIds[bs]);
  const sale={lines:[],businessType:'销售'},records=[];
  assert(M.scan(sale,productB,bc,bs,records,alias,null,'event-1').line);assert.equal(sale.lines[0].quantity,1);
  assert.equal(M.scan(sale,productB,bc,bs,records,alias,null,'event-1').duplicate,true);assert.equal(sale.lines[0].quantity,1);
  M.scan(sale,productB,bc,bs,records,alias,null,'event-2');assert.equal(sale.lines[0].quantity,2);
  sale.lines.push(M.line(productB,bc,bs,4,2000));const before=JSON.stringify(sale.lines);
  assert.equal(M.scan(sale,productB,bc,bs,records,alias,null,'choice').choose.length,2);assert.equal(JSON.stringify(sale.lines),before);
  M.scan(sale,productB,bc,bs,records,alias,sale.lines[1].id,'choice');assert.equal(sale.lines[0].quantity,2);assert.equal(sale.lines[1].quantity,5);
  const batch={lines:[]};M.batch(batch,old,{[c+'|'+s900]:2,[c+'|'+s910]:3},1000);assert.equal(batch.lines.length,2);assert.equal(batch.lines[0].quantity+batch.lines[1].quantity,5);assert.notEqual(batch.lines[0].skuId,batch.lines[1].skuId);
  M.batch(batch,old,{[c+'|'+s900]:''},1000);assert.equal(batch.lines[0].quantity,2);
  // Execute the production sales scan boundary, including fresh lookup and stale-document guard.
  w.U={doc:{id:'scan-sale',lines:[],businessType:'销售'},section:'out',records:[]};w.C=C;w.M=M;w.K=K;w.canEdit=()=>true;w.allowedProducts=()=>products;
  w.entryDoc=()=>w.U.doc;w.recordFailure=(code,error)=>{w.U.message=error};w.persistRecord=()=>{};w.update=()=>{};w.refresh=()=>{};w.focusScan=()=>{};w.modal=title=>{w.choice=title};w.h=String;w.b=String;
  const source=readFileSync(new URL('sales-current.js',root),'utf8'),i=source.indexOf('async function scan(value'),j=source.indexOf('function matrix(',i);assert(i>=0&&j>i);vm.runInContext(source.slice(i,j)+'\nwindow.productionSalesScan=scan;',ctx);
  await w.productionSalesScan(alias,'actual-1');await w.productionSalesScan(alias,'actual-1');assert.equal(w.U.doc.lines[0].quantity,1);
  await w.productionSalesScan('AMB-000','actual-amb');await w.productionSalesScan('01','actual-short');assert.equal(w.U.doc.lines[0].quantity,1);
  const pending=api('/runtime/product-identity?code='+alias),resolve=w.LEGACY_REAL.resolveIdentity;w.LEGACY_REAL.resolveIdentity=async()=>{await pending;w.U.doc={id:'other',lines:[]};return I.resolve(alias)};
  await w.productionSalesScan(alias,'after-switch');assert.equal(w.U.doc.lines.length,0);w.LEGACY_REAL.resolveIdentity=resolve;
  // Execute the production transfer scan boundary against the same real QA identity API.
  w.T={doc:{id:'scan-transfer',status:'未审核',q:{},items:[],hiddenColors:[],scans:[]},lease:{expires:Date.now()+60000},scanEvents:new Set(),touched:{}};
  w.G=w.GOLD;w.locked=()=>false;w.heartbeat=async()=>{};w.workEvent=async()=>({event:{actor:{id:'synthetic'},time:new Date().toISOString()}});w.recordWork=async log=>{log.workRecorded=true};w.find=()=>[];w.product=id=>C.businessProduct(id);w.scanRefresh=()=>{};w.$=()=>null;
  const transfer=readFileSync(new URL('transfer-current.js',root),'utf8'),ti=transfer.indexOf('async function scan(value'),tj=transfer.indexOf('async function recordWork(',ti);assert(ti>=0&&tj>ti);vm.runInContext(transfer.slice(ti,tj)+'\nwindow.productionTransferScan=scan;',ctx);
  await w.productionTransferScan(alias,'transfer-1',{exactOnly:true});await w.productionTransferScan(alias,'transfer-1',{exactOnly:true});assert.equal(Object.values(w.T.doc.q)[0],1);
  await w.productionTransferScan(alias,'transfer-2',{exactOnly:true});assert.equal(Object.values(w.T.doc.q)[0],2);
  await w.productionTransferScan('AMB-000','transfer-amb',{exactOnly:true});assert.equal(Object.values(w.T.doc.q)[0],2);await w.productionTransferScan('07','transfer-short-valid',{exactOnly:true});assert.equal(Object.values(w.T.doc.q)[0],3);
  finder.destroy();
  return {status:'PASS',driver:'JSDOM actual finder and production sales/transfer scan boundaries, real private QA identity API',candidateCount:2,selectedOriginalSku:chosen.skuId,displayMergedOriginalSkus:[sku900,sku910],independentQuantities:[2,3],repeatedEventIgnored:true,explicitNewScanAddsOne:true,registeredTwoCharacterCodeAccepted:true,priceChoicePreserved:true,focusPreserved:true,staleDocumentIgnored:true};
 }finally{w.close()}
}
