/* Real sales transport, source adapter and request recovery against the private synthetic QA service.
 * Bootstrap catalogue and DOM rendering are outside this transport test. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import * as Adapter from '../frontend/legacy-adapter.mjs';
import {transferLines,warehouseOccupancy} from '../frontend/transfer-contract.mjs';
import {buildSaleBody,resolveSaleDocumentId} from '../frontend/sales-transport.mjs';
import {currentSizeGroups} from '../frontend/product-size-groups.mjs';
import {hydrateProductCatalog,productProfileDraft} from '../frontend/product-service.mjs';
import {fitView,fitViewId,sourceCode} from '../frontend/business-product-view.mjs';
import {currentSpecView} from '../frontend/product-spec-view.mjs';
import * as InventoryUnitView from '../frontend/inventory-unit-view.mjs';
import {queryCellLedger,readLedgerSource} from '../frontend/inventory-ledger-service.mjs';

export async function exerciseReturnBridge({root,app,session,origin,warehouseIds,hallId,productId,skuId,colorId,sizeId,methodId,accountId,actor,protectedId,legacyId}){
 const events=new EventTarget();
 const storage=new Map(),calls=[],page={innerHTML:''},p={id:'P1',uuid:productId,name:'Synthetic product',unit:'件',sourceUnit:'件',fitId:'A',baseFitId:'A',colorIds:[colorId],sizeIds:[sizeId],colors:['蓝色'],sizes:['M'],skuByCell:{[colorId+'|'+sizeId]:skuId},barcodes:{[colorId+'|'+sizeId]:{current:'000001'}},stock:{},legacySizeRecords:[{id:sizeId,name:'M'}]};
 const masters={stores:[{id:hallId,enabled:true}],warehouses:warehouseIds.map(id=>({id,enabled:true})),staff:[actor]};
 const ctx={Adapter,transferLines,warehouseOccupancy,buildSaleBody,resolveSaleDocumentId,currentSizeGroups,hydrateProductCatalog,productProfileDraft,fitView,fitViewId,sourceCode,currentSpecView,...InventoryUnitView,queryCellLedger,readLedgerSource,structuredClone,crypto:globalThis.crypto,AbortController,URLSearchParams,setTimeout,clearTimeout,navigator:{onLine:true},location:{hash:'#sales'},history:{replaceState(){}},document:{querySelector:()=>page},ERP_DEMO:{products:[p],warehouses:masters.warehouses},PRODUCT_UI:{openReadOnly(){}},PRODUCT_CATALOG:{businessProduct:code=>code==='P1'?p:null},MASTER_DATA:{roles:['管理员','仓库人员','营业员'],data:masters,current:()=>actor,transferWarehouses:()=>masters.warehouses,routeAllowed:()=>true},SALES_SERVICE:{work:[]},TRANSFER_SERVICE:{},GOLD:{documents:[]},render(){}};
 ctx.addEventListener=events.addEventListener.bind(events);ctx.removeEventListener=events.removeEventListener.bind(events);ctx.dispatchEvent=events.dispatchEvent.bind(events);
 ctx.window=ctx;vm.createContext(ctx);
 for(const file of ['service-client.js','sales-summary.js'])vm.runInContext(readFileSync(join(root,'frontend',file),'utf8'),ctx);
 let drop=false;
 ctx.ERP_API=ctx.ERP_API.createClient({actor:()=>actor.id,storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},fetcher:async(url,options)=>{
  calls.push({url,method:options.method||'GET'});
  const response=await app.inject({method:options.method||'GET',url,headers:{...options.headers,cookie:session.cookie,origin},...(options.body?{payload:options.body}:{})});
  if(drop&&url==='/api/runtime/command'){drop=false;assert.equal(response.statusCode,200,response.body);throw Error('T22_SYNTHETIC_RESPONSE_LOST');}
  return {ok:response.statusCode<400,status:response.statusCode,json:async()=>response.json()};
 }});
 ctx.sessionStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
 await ctx.ERP_API.request('/runtime/session');
 const source=readFileSync(join(root,'frontend/real-data-bridge.mjs'),'utf8').split('async function bootstrap()')[0].replace(/^import .*;\n/gm,'');
 vm.runInContext(source+`\nrefs.halls=[];refs.warehouses=MASTER_DATA.data.warehouses;refs.employees=MASTER_DATA.data.staff;refs.customers=[];
 refs['payment-methods']=[];refs['fund-accounts']=[];bridge.skus=new Map([['${skuId}',{p:ERP_DEMO.products[0],c:0,s:0,fitId:'A'}]]);
 window.t22Bridge={write,getDoc,syncSales};`,ctx);
 const draft={id:'unsaved-'+crypto.randomUUID(),date:'2026-10-02',warehouseId:warehouseIds[0],returnWarehouseId:warehouseIds[1],storeId:hallId,businessType:'退货/换货',note:'T22 synthetic editor',creator:{id:actor.id,name:actor.name},adjustmentCents:0,revision:0,
  lines:[{id:'BRIDGE-RETURN',productId:'P1',colorId,sizeId,fitId:'A',color:'蓝色',size:'M',quantity:-2,priceCents:20000,gift:false,pricingRule:'unit-price',referenceCents:null,discountTenths:null},
   {id:'BRIDGE-OUT',productId:'P1',colorId,sizeId,fitId:'A',color:'蓝色',size:'M',quantity:1,priceCents:30000,gift:false,pricingRule:'unit-price',referenceCents:null,discountTenths:null}],
  fundsRecords:[{id:'BRIDGE-REFUND',methodId,accountId,amountCents:-10000}]};
 const saved=await ctx.t22Bridge.write({kind:'save',draft,baseRevision:0,requestId:crypto.randomUUID()},'SALE');
 assert.equal(saved.ok,true,JSON.stringify(saved));assert.equal(saved.doc.returnWarehouseId,warehouseIds[1]);assert.equal(saved.doc.warehouseId,warehouseIds[0]);
 assert.deepEqual(Array.from(saved.doc._runtime.body.lines,l=>l.warehouse_id),[warehouseIds[1],warehouseIds[0]]);assert.equal(saved.doc.fundsRecords[0].amountCents,-10000);
 const approveKey=crypto.randomUUID();drop=true;
 const uncertain=await ctx.t22Bridge.write({kind:'audit',draft:saved.doc,baseRevision:saved.doc.revision,requestId:approveKey},'SALE');assert.equal(uncertain.code,'PENDING_VERIFICATION');
 const commandCount=calls.filter(c=>c.url==='/api/runtime/command').length,recovered=await ctx.LEGACY_REAL.recoverRequest(approveKey);
 assert.equal(recovered.ok,true);assert.equal(recovered.doc.status,'已审核');assert.equal(recovered.doc.returnWarehouseId,warehouseIds[1]);
 assert.equal(calls.filter(c=>c.url==='/api/runtime/command').length,commandCount);assert.equal(ctx.ERP_API.pending().length,0);
 const reversed=await ctx.t22Bridge.write({kind:'unaudit',draft:recovered.doc,baseRevision:recovered.doc.revision,requestId:crypto.randomUUID()},'SALE');assert.equal(reversed.ok,true,JSON.stringify(reversed));
 assert.equal(reversed.doc.returnWarehouseId,warehouseIds[1]);assert.equal(reversed.doc.fundsRecords[0].amountCents,-10000);
 const protectedDoc=await ctx.t22Bridge.getDoc(protectedId,'SALE');assert.equal(protectedDoc.associationProtected,true);
 protectedDoc.note='T22 protected bridge memo';
 const memo=await ctx.t22Bridge.write({type:'write',kind:'memo',draft:protectedDoc,baseRevision:protectedDoc.revision,requestId:crypto.randomUUID()},'SALE');assert.equal(memo.ok,true,JSON.stringify(memo));assert.equal(memo.doc.status,'已审核');assert.equal(memo.doc.note,protectedDoc.note);
 const legacy=await ctx.t22Bridge.getDoc(legacyId,'SALE');assert.equal(legacy.readonly,true);assert.equal(legacy.lines[0].originalLineId,legacy._runtime.body.lines[0].original_line_id);
 const beforeOld=calls.filter(c=>c.url==='/api/runtime/command').length;
 const retired=await ctx.t22Bridge.write({type:'return',kind:'save',draft:legacy,baseRevision:legacy.revision,requestId:crypto.randomUUID()},'SALE');assert.equal(retired.code,'HISTORICAL_ONLY');assert.equal(calls.filter(c=>c.url==='/api/runtime/command').length,beforeOld);
 return {status:'PASS',scope:'actual sales bridge, source adapter and request recovery on synthetic QA; no real browser claim',documentId:saved.doc.uuid,
  warehouses:[warehouseIds[1],warehouseIds[0]],refundCents:-10000,responseRecoveryPostedAgain:false,protectedNoteSaved:true,legacyReadonly:true,retiredWritePosted:false,calls};
}
