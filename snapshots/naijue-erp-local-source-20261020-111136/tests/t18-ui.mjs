import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {product as adaptProduct,FITS} from '../frontend/legacy-adapter.mjs';
import {currentSpecView} from '../frontend/product-spec-view.mjs';
import {currentSizeGroups} from '../frontend/product-size-groups.mjs';
import {hydrateProductCatalog,productProfileDraft} from '../frontend/product-service.mjs';

/** Exercise the actual six-tab controller and production save boundary against the private QA API. */
export async function verifyProductUI({catalog,api,productCode,warehouses}){
 const root=new URL('../frontend/',import.meta.url),dom=new JSDOM(readFileSync(new URL('index.html',root),'utf8'),{url:'https://t18.invalid/#product/'+productCode,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document,errors=[];
 w.structuredClone=structuredClone;w.REAL_DATA_MODE=true;w.toast=()=>{};w.INVENTORY_PAGER={render:()=>''};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.addEventListener('error',event=>errors.push(event.error?.stack||event.message));
 const context=dom.getInternalVMContext();
 for(const name of ['model.js','app.js','product-legacy-sizes.js','product-catalog.js','barcode-2026.js','product-master.js','engine.js','gold.js','product-current.js'])vm.runInContext(readFileSync(new URL(name,root),'utf8'),context,{filename:name});
 const C=w.PRODUCT_CATALOG,D=w.ERP_DEMO,U=w.PRODUCT_UI.state;
 C.groups=currentSizeGroups();C.categories.splice(0,C.categories.length,{id:'all',name:'全部分类',parent:null},{id:'CAT',name:'合成分类',parent:'all',standard:true});
 const colors=await api('/reference/colors');C.colors.splice(0,C.colors.length,...colors.items);
 C.fits.splice(0,C.fits.length,...FITS.map(x=>({...x})));C.fits2026=C.fits;C.fit=id=>C.fits.find(f=>f.id===id);
 const suppliers=await api('/reference/suppliers');C.suppliers.splice(0,C.suppliers.length,...suppliers.items);
 C.units=(await api('/reference/units')).items;D.warehouses.splice(0,D.warehouses.length,...warehouses);
 const adapted=raw=>{
  const row=raw.products.find(p=>p.code===productCode),profile=raw.profiles.find(p=>p.product_id===row.id),skus=raw.skus.filter(s=>s.product_id===row.id);
  const p=currentSpecView({...adaptProduct(row,skus,raw.barcodes.filter(b=>b.product_id===row.id)),...profile.body,profileVersion:profile.version,readonly:false},skus,C);
  for(const alias of raw.aliases.filter(a=>a.product_id===row.id)){const binding=Object.values(p.barcodes).find(b=>b.skuId===alias.sku_id);if(binding){binding.compatible??=[];binding.compatible.push({code:alias.barcode,note:alias.historical_note,source:alias.origin})}}
  p.stockTotal=0;p.stock=Object.fromEntries(warehouses.map(w=>[w.id,p.colorIds.map(()=>p.sizeIds.map(()=>0))]));return p;
 };
 const p=adapted(catalog);D.products.splice(0,D.products.length,p);
 const bridge=w.LEGACY_REAL={skus:new Map(),stockLoaded:new Set(),rawSkuById:new Map(catalog.skus.map(s=>[s.id,s])),api};
 w.MASTER_DATA={canManage:()=>true};w.ERP_API={complete:()=>{},ServiceError:Error,request:api};
 Object.assign(context,{bridge,C,D,M:w.MASTER_DATA,api,copy:structuredClone,productProfileDraft,hydrateProductCatalog:raw=>hydrateProductCatalog(raw,w.ERP_API),
  indexProductSkus(){},adaptedCatalogProduct:raw=>adapted(raw)});
 const source=readFileSync(new URL('real-data-bridge.mjs',root),'utf8'),start=source.indexOf('bridge.saveProductProfile=async draft=>'),end=source.indexOf('bridge.deleteProduct=async',start);
 vm.runInContext(source.slice(start,end),context,{filename:'production-product-save-boundary'});
 const click=selector=>{const el=d.querySelector(selector);assert(el,selector);assert(!el.disabled,selector);el.click();};
 try{
  w.render();assert.equal(d.querySelectorAll('[role=tab]').length,6);
  for(const tab of ['base','specs','barcodes','prices','images','stock']){click('[data-tab='+tab+']');assert.equal(U.tab,tab);assert.equal(d.querySelector('[aria-selected=true]').dataset.tab,tab);}
  click('[data-tab=prices]');assert.equal(d.querySelectorAll('[data-price-field]').length,9);
  const priorPrice=U.edit.wholesale10;U.edit.wholesale10='1000000000.00';click('[data-pc=save-product]');
  let deadline=Date.now()+15000;while(U.saving&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(U.saving,false);assert(d.querySelector('#pc-editor-error').textContent.includes('999999999.99'),'server error survives busy-state rerender');assert.equal(U.edit.wholesale10,'1000000000.00','failed draft stays editable');U.edit.wholesale10=priorPrice;
  click('[data-tab=barcodes]');const before=JSON.stringify(U.edit.barcodes);
  click('[data-pc=compatible-new]');d.querySelector('[name=barcode]').value='CANCELLED-000';click('[data-pc=modal-close]');assert.equal(JSON.stringify(U.edit.barcodes),before,'cancel cannot mutate aliases');
  click('[data-pc=compatible-new]');d.querySelector('[name=barcode]').value='000Ui-aB';d.querySelector('[name=note]').value='界面补录 / 原 SKU';
  d.querySelector('#pc-supplemental-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert(Object.values(U.edit.barcodes).some(b=>b.compatible?.some(a=>a.code==='000Ui-aB')));
  click('[data-pc=save-product]');assert.equal(U.saving,true);assert(d.querySelector('[data-pc=save-product]').disabled);
  deadline=Date.now()+15000;while(U.saving&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(U.saving,false);assert.equal(d.querySelector('#pc-editor-error').textContent,'','UI save failed');
  const scan=await api('/runtime/barcode?code=000Ui-aB');assert.equal(scan.kind,'sku');
  const sku=scan.skuId,barcodeEntry=Object.values(U.edit.barcodes).find(b=>b.compatible?.some(a=>a.code==='000Ui-aB'));assert.equal(barcodeEntry.skuId,sku);
  assert.equal(C.by(productCode),D.products[0],'shared catalog identity');assert(Object.values(C.by(productCode).barcodes).some(b=>b.compatible?.some(a=>a.code==='000Ui-aB')),'saved readback remains in shared catalog');
  U.edit=null;U.editId=null;w.render();click('[data-tab=barcodes]');
  const reopenedKey=Object.keys(U.edit.barcodes).find(key=>U.edit.barcodes[key].skuId===sku);
  click('[data-pc=barcode-all][data-key="'+reopenedKey+'"]');assert(d.querySelector('#pc-dialog').textContent.includes('000Ui-aB'),JSON.stringify({expect:'saved alias reopens in the actual barcode dialog',errors,modal:U.modal,key:reopenedKey,entry:U.edit.barcodes[reopenedKey],dialog:d.querySelector('#pc-dialog').textContent}));click('[data-pc=modal-close]');
  click('[data-tab=specs]');const status=d.querySelector('[data-sku-id="'+sku+'"] [data-pc=sku-status]');assert(status);status.click();assert(U.edit.disabledSkuIds.includes(sku));
  click('[data-tab=base]');const enabled=U.edit.enabled;click('[data-pc=product-status]');assert.equal(U.edit.enabled,!enabled);
  const rawCells=JSON.stringify([U.edit.colorIds,U.edit.sizeIds,U.edit.skuByCell]);C.prepare(U.edit);assert.equal(U.edit.enabled,!enabled,'preparing fields cannot reactivate stopped product');assert.equal(JSON.stringify([U.edit.colorIds,U.edit.sizeIds,U.edit.skuByCell]),rawCells,'current display sizes cannot replace raw SKU matrix identities');
  click('[data-pc=save-product]');deadline=Date.now()+15000;while(U.saving&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(U.saving,false);assert.equal(U.saveError,'');
  assert.equal((await api('/runtime/catalog')).products.find(row=>row.code===productCode).enabled,!enabled,'product stop persists');
  assert.deepEqual(errors,[]);
  return {status:'PASS',tabs:6,prices:9,manualAlias:{code:'000Ui-aB',skuId:sku},cancelUnchanged:true,busyDisabled:true,reopened:true,rejectedDraftRetained:true,productStopPersists:true,roleBoundary:'server checked separately',driver:'JSDOM production controller with real private QA API',errors};
 }finally{w.close();}
}
