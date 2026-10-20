/* Real sales transport, source adapter and request recovery against the private synthetic QA service.
 * Bootstrap catalogue and DOM rendering are outside this transport test. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import * as Adapter from '../frontend/legacy-adapter.mjs';
import {buildSaleBody,resolveSaleDocumentId} from '../frontend/sales-transport.mjs';
import {fitViewId,sourceCode} from '../frontend/business-product-view.mjs';
import * as InventoryUnitView from '../frontend/inventory-unit-view.mjs';

export async function exerciseSaleBridge({root,app,session,origin,warehouseIds,hallId,productId,skuId,colorId,sizeId,methodId,accountId,actor,historicalNumber}){
 const events=new EventTarget();
 const storage=new Map(),calls=[],page={innerHTML:''},p={id:'P1',uuid:productId,name:'Synthetic product',unit:'件',sourceUnit:'件',fitId:'A',baseFitId:'A',colorIds:[colorId],sizeIds:[sizeId],colors:['蓝色'],sizes:['M'],skuByCell:{[colorId+'|'+sizeId]:skuId},barcodes:{[colorId+'|'+sizeId]:{current:'000001'}},stock:{},legacySizeRecords:[{id:sizeId,name:'M'}]};
 const masters={stores:[{id:hallId,enabled:true}],warehouses:warehouseIds.map(id=>({id,enabled:true})),staff:[actor]};
 const ctx={Adapter,buildSaleBody,resolveSaleDocumentId,fitViewId,sourceCode,...InventoryUnitView,structuredClone,crypto:globalThis.crypto,AbortController,URLSearchParams,setTimeout,clearTimeout,navigator:{onLine:true},location:{hash:'#sales'},history:{replaceState(){}},document:{querySelector:()=>page},ERP_DEMO:{products:[p],warehouses:masters.warehouses},PRODUCT_UI:{openReadOnly(){}},PRODUCT_CATALOG:{businessProduct:code=>code==='P1'?p:null},MASTER_DATA:{roles:['管理员','仓库人员','营业员'],data:masters,current:()=>actor,transferWarehouses:()=>masters.warehouses,routeAllowed:()=>true},SALES_SERVICE:{work:[]},TRANSFER_SERVICE:{},GOLD:{documents:[]},render(){}};
 ctx.addEventListener=events.addEventListener.bind(events);ctx.removeEventListener=events.removeEventListener.bind(events);ctx.dispatchEvent=events.dispatchEvent.bind(events);
 ctx.window=ctx;vm.createContext(ctx);
 for(const file of ['service-client.js','sales-summary.js'])vm.runInContext(readFileSync(join(root,'frontend',file),'utf8'),ctx);
 let drop=false;
 ctx.ERP_API=ctx.ERP_API.createClient({actor:()=>actor.id,storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},fetcher:async(url,options)=>{
  calls.push({url,method:options.method||'GET'});
  const response=await app.inject({method:options.method||'GET',url,headers:{...options.headers,cookie:session.cookie,origin},...(options.body?{payload:options.body}:{})});
  if(drop&&url==='/api/runtime/command'){drop=false;assert.equal(response.statusCode,200,response.body);throw Error('T21_SYNTHETIC_RESPONSE_LOST');}
  return {ok:response.statusCode<400,status:response.statusCode,json:async()=>response.json()};
 }});
 ctx.sessionStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
 await ctx.ERP_API.request('/runtime/session');
 const source=readFileSync(join(root,'frontend/real-data-bridge.mjs'),'utf8').split('async function bootstrap()')[0].replace(/^import .*;\n/gm,'');
 vm.runInContext(source+`\nrefs.halls=[];refs.warehouses=MASTER_DATA.data.warehouses;refs.employees=MASTER_DATA.data.staff;refs.customers=[];
 refs['payment-methods']=[];refs['fund-accounts']=[];bridge.skus=new Map([['${skuId}',{p:ERP_DEMO.products[0],c:0,s:0,fitId:'A'}]]);
 window.t21Bridge={write,getDoc,syncSales};`,ctx);
 const draft={id:'unsaved-'+crypto.randomUUID(),date:'2026-10-02T10:01',warehouseId:warehouseIds[0],storeId:hallId,businessType:'销售',note:'T21 synthetic editor',creator:{id:actor.id,name:actor.name},adjustmentCents:0,revision:0,
  lines:[{id:'BRIDGE-LINE',productId:'P1',colorId,sizeId,fitId:'A',color:'蓝色',size:'M',quantity:2,priceCents:101,gift:false,pricingRule:'unit-price',referenceCents:null,discountTenths:null}],
  fundsRecords:[{id:'BRIDGE-FUND',methodId,accountId,amountCents:202}]};
 await ctx.ERP_API.request('/sales/work',{type:'work',docId:draft.id,record:{id:'BRIDGE-SCAN',code:'000001',lineId:'BRIDGE-LINE',before:1,after:2}});
 const saved=await ctx.t21Bridge.write({kind:'save',draft,baseRevision:0,requestId:crypto.randomUUID()},'SALE');
 assert.equal(saved.ok,true,JSON.stringify(saved));assert.equal(saved.doc.status,'未审核');assert.equal(saved.doc.lines[0].priceCents,101);assert.equal(saved.doc.lines[0].amountCents,202);assert.equal(saved.doc.scans.length,1);assert.equal(saved.doc.scans[0].draftId,draft.id);
 const approveKey=crypto.randomUUID();drop=true;
 const uncertain=await ctx.t21Bridge.write({kind:'audit',draft:saved.doc,baseRevision:saved.doc.revision,requestId:approveKey},'SALE');
 assert.equal(uncertain.code,'PENDING_VERIFICATION');assert.equal(uncertain.requestId,approveKey);assert.equal(saved.doc.status,'未审核');
 const commandCount=calls.filter(c=>c.url==='/api/runtime/command').length;
 ctx.location.hash='#inventory';
 const recovered=await ctx.LEGACY_REAL.recoverRequest(approveKey);assert.equal(recovered.ok,true);assert.equal(recovered.doc.status,'已审核');assert.equal(ctx.ERP_API.pending().length,0);assert.equal(calls.filter(c=>c.url==='/api/runtime/command').length,commandCount);
 const reversed=await ctx.t21Bridge.write({kind:'unaudit',draft:recovered.doc,baseRevision:recovered.doc.revision,requestId:crypto.randomUUID()},'SALE');assert.equal(reversed.ok,true,JSON.stringify(reversed));
 const edited=structuredClone(reversed.doc);edited.lines[0].quantity=3;edited.fundsRecords[0].amountCents=303;
 const resaved=await ctx.t21Bridge.write({kind:'save',draft:edited,baseRevision:edited.revision,requestId:crypto.randomUUID()},'SALE');assert.equal(resaved.ok,true,JSON.stringify(resaved));assert.equal(resaved.doc.lines[0].amountCents,303);
 const audited=await ctx.t21Bridge.write({kind:'audit',draft:resaved.doc,baseRevision:resaved.doc.revision,requestId:crypto.randomUUID()},'SALE');assert.equal(audited.ok,true,JSON.stringify(audited));assert.equal(audited.doc.fundsRecords[0].amountCents,303);
 const final=await ctx.t21Bridge.write({kind:'unaudit',draft:audited.doc,baseRevision:audited.doc.revision,requestId:crypto.randomUUID()},'SALE');assert.equal(final.ok,true,JSON.stringify(final));
 ctx.SALES_UI={state:{applied:{number:final.doc.id}}};const list=await ctx.t21Bridge.syncSales();assert.equal(list.ok,true);assert.ok(list.docs.some(d=>d.uuid===final.doc.uuid));
 ctx.LEGACY_REAL.docs.clear();const direct=await ctx.t21Bridge.getDoc(final.doc.id,'SALE');assert.equal(direct.uuid,final.doc.uuid);
 const history=await ctx.t21Bridge.getDoc(historicalNumber,'SALE');assert.equal(history.creator,null);assert.equal(history.created,null);assert.equal(history.history[0].time,null);assert.equal(history.fundsRecords.length,5);
 const rawBefore=structuredClone(history._runtime.body),historicalReverse=await ctx.t21Bridge.write({kind:'unaudit',draft:history,baseRevision:history.revision,requestId:crypto.randomUUID()},'SALE');assert.equal(historicalReverse.ok,true,JSON.stringify(historicalReverse));
 const historicalEdit=historicalReverse.doc;historicalEdit.note='T21 bridge history note';historicalEdit.creator={id:actor.id,name:actor.name};
 const historicalSaved=await ctx.t21Bridge.write({kind:'save',draft:historicalEdit,baseRevision:historicalEdit.revision,requestId:crypto.randomUUID()},'SALE');assert.equal(historicalSaved.ok,true,JSON.stringify(historicalSaved));
 assert.equal(historicalSaved.doc._runtime.body.lines[0].unit_price,'12.3456');assert.equal(historicalSaved.doc._runtime.body.lines[0].amount,'24.69');assert.deepEqual(historicalSaved.doc._runtime.body.fundsRecords,rawBefore.fundsRecords);
 const historicalReaudit=await ctx.t21Bridge.write({kind:'audit',draft:historicalSaved.doc,baseRevision:historicalSaved.doc.revision,requestId:crypto.randomUUID()},'SALE');assert.equal(historicalReaudit.ok,true,JSON.stringify(historicalReaudit));
 return {status:'PASS',scope:'real bridge/source adapter/request client against synthetic Fastify+PostgreSQL; no rendered browser verification',draftScansLinked:1,responseRecoveryPostedAgain:false,modifiedLineAmountCents:303,historicalPrice:'12.3456',historicalSettlementCount:5,finalDocumentId:final.doc.uuid,calls};
}
