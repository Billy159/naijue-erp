/* Executes the real T11/T20 transport and transfer adapter against the synthetic formal service.
 * Other bootstrap/UI modules are not under test; no substitute transfer command implementation. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import * as Adapter from '../frontend/legacy-adapter.mjs';
import {transferLines,stockRows,warehouseOccupancy} from '../frontend/transfer-contract.mjs';
import * as InventoryUnitView from '../frontend/inventory-unit-view.mjs';

export async function exerciseTransferBridge({root,app,session,origin,warehouseIds,hallId,productId,skuId,actor,dateEvidencePath}){
 const events=new EventTarget();
 const storage=new Map(),calls=[],page={innerHTML:''},p={id:'T20',uuid:productId,name:'Synthetic product',sourceUnit:'件',fitId:'A',baseFitId:'A',colorIds:['blue'],sizeIds:['44'],colors:['蓝色'],sizes:['44'],skuByCell:{'blue|44':skuId},barcodes:{},stock:{},legacySizeRecords:[{id:'44'}]};
 const masters={stores:[{id:hallId,enabled:true}],warehouses:warehouseIds.map(id=>({id,enabled:true})),staff:[actor]};
 const expectedDate='2026-10-02',dateStages=[];
 const captureDate=(stage,doc)=>dateStages.push({stage,uiDate:doc.date,bodyDate:doc._runtime.body.header.business_date,businessDay:doc._runtime.business_day,
  history:doc.history.map(h=>({version:h.version,date:h.after?.date,bodyDate:h.after?._runtime.body.header.business_date}))});
 const ctx={Adapter,transferLines,stockRows,warehouseOccupancy,...InventoryUnitView,structuredClone,crypto:globalThis.crypto,AbortController,URLSearchParams,setTimeout,clearTimeout,navigator:{onLine:true},location:{hash:'#transfer'},history:{replaceState(){}},document:{querySelector:()=>page},ERP_DEMO:{products:[p],warehouses:masters.warehouses},PRODUCT_UI:{openReadOnly(){}},PRODUCT_CATALOG:{businessProduct:code=>code==='T20'?p:null,businessVariants:()=>[p]},MASTER_DATA:{roles:['管理员','仓库人员','营业员'],data:masters,current:()=>actor,transferWarehouses:()=>masters.warehouses,routeAllowed:()=>true},SALES_SERVICE:{work:[]},TRANSFER_SERVICE:{},GOLD:{documents:[]},render(){}};
 ctx.addEventListener=events.addEventListener.bind(events);ctx.removeEventListener=events.removeEventListener.bind(events);ctx.dispatchEvent=events.dispatchEvent.bind(events);
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(readFileSync(join(root,'frontend/service-client.js'),'utf8'),ctx);
 let drop=false;
 ctx.ERP_API=ctx.ERP_API.createClient({actor:()=>actor.id,storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},fetcher:async(url,options)=>{
   calls.push({url,method:options.method||'GET',...(url==='/api/runtime/command'?{businessDate:JSON.parse(options.body).body?.header?.business_date}:{} )});
   const response=await app.inject({method:options.method||'GET',url,headers:{...options.headers,cookie:session.cookie,origin},...(options.body?{payload:options.body}:{})});
   if(drop&&url==='/api/runtime/command'){drop=false;assert.equal(response.statusCode,200,response.body);throw Error('synthetic bridge response lost');}
   return {ok:response.statusCode<400,status:response.statusCode,json:async()=>response.json()};
 }});
 ctx.sessionStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
 await ctx.ERP_API.request('/runtime/session');
 const source=readFileSync(join(root,'frontend/real-data-bridge.mjs'),'utf8').split('async function bootstrap()')[0].replace(/^import .*;\n/gm,'');
 vm.runInContext(source+`\nrefs.halls=[];refs.warehouses=MASTER_DATA.data.warehouses;refs.employees=MASTER_DATA.data.staff;refs.customers=[];
 refs['payment-methods']=[];refs['fund-accounts']=[];bridge.skus=new Map([['${skuId}',{p:ERP_DEMO.products[0],c:0,s:0,fitId:'A'}]]);
 MASTER_DATA.refreshWarehouseStocks=async()=>MASTER_DATA.warehouseStockSummary=await warehouseOccupancy(api);
 window.t20Bridge={write,getDoc,syncTransfers};`,ctx);
 const draft={id:'草稿-fe123456',date:'2026-10-02',from:warehouseIds[0],to:warehouseIds[1],note:'Synthetic UI draft',creator:actor.name,creatorId:actor.id,q:{'T20|0|0':2},items:['T20'],uuid:null,revision:0};
 const token=crypto.randomUUID();await ctx.ERP_API.request('/transfers/work',{type:'acquire',docId:draft.id,newToken:token});
 const eventId=crypto.randomUUID(),event={type:'work',docId:draft.id,token,eventId,action:'scan',input:'SYNTHETIC'};
 await ctx.ERP_API.request('/transfers/work',event);await ctx.ERP_API.request('/transfers/work',{type:'work',docId:draft.id,token,record:{id:eventId,eventId,before:1,after:2}});
 const initial=await ctx.t20Bridge.write({kind:'save',draft,token,baseRevision:0,requestId:crypto.randomUUID()},'TRANSFER');
 assert.equal(initial.ok,true,JSON.stringify(initial));assert.equal(initial.doc.status,'未审核');assert.equal(initial.doc.lines[0].skuId,skuId);assert.equal(initial.doc.scans.length,1);assert.equal(initial.doc.scans[0].draftId,draft.id);
 captureDate('create',initial.doc);
 const ui=initial.doc,approveRequest=crypto.randomUUID();drop=true;
 const uncertain=await ctx.t20Bridge.write({kind:'audit',draft:ui,token:initial.lease.token,baseRevision:ui.revision,requestId:approveRequest},'TRANSFER');
 assert.equal(uncertain.code,'PENDING_VERIFICATION');assert.equal(uncertain.requestId,approveRequest);assert.equal(ui.status,'未审核');
 const beforePostCount=calls.filter(c=>c.url==='/api/runtime/command'&&c.method==='POST').length;
 const recovered=await ctx.LEGACY_REAL.recoverRequest(approveRequest);assert.equal(recovered.ok,true);assert.equal(recovered.doc.status,'已审核');assert.equal(recovered.doc.q['T20|0|0'],2);assert.equal(ctx.ERP_API.pending().length,0);
 captureDate('approve-recovered',recovered.doc);
 assert.equal(calls.filter(c=>c.url==='/api/runtime/command'&&c.method==='POST').length,beforePostCount);
 ctx.TRANSFER_UI={state:{appliedFilter:{q:recovered.doc.id}}};
 const list=await ctx.t20Bridge.syncTransfers();assert.equal(list.ok,true);assert.ok(list.docs.some(d=>d.uuid===recovered.doc.uuid));
 captureDate('list',list.docs.find(d=>d.uuid===recovered.doc.uuid));
 const detail=await ctx.t20Bridge.getDoc(recovered.doc.id);assert.equal(detail.uuid,recovered.doc.uuid);captureDate('detail',detail);
 const reversed=await ctx.t20Bridge.write({kind:'reverse',draft:recovered.doc,baseRevision:recovered.doc.revision,token:initial.lease.token,requestId:crypto.randomUUID()},'TRANSFER');assert.equal(reversed.ok,true,JSON.stringify(reversed));assert.equal(reversed.doc.status,'未审核');
 captureDate('unapprove',reversed.doc);
 const changed=structuredClone(reversed.doc);changed.q['T20|0|0']=3;
 const saved=await ctx.t20Bridge.write({kind:'save',draft:changed,baseRevision:changed.revision,token:reversed.lease.token,requestId:crypto.randomUUID()},'TRANSFER');assert.equal(saved.ok,true,JSON.stringify(saved));
 captureDate('quantity-save',saved.doc);
 const reviewed=await ctx.t20Bridge.write({kind:'audit',draft:saved.doc,baseRevision:saved.doc.revision,token:saved.lease.token,requestId:crypto.randomUUID()},'TRANSFER');assert.equal(reviewed.ok,true,JSON.stringify(reviewed));assert.equal(reviewed.doc.q['T20|0|0'],3);
 captureDate('reapprove',reviewed.doc);
 const clear=await ctx.t20Bridge.write({kind:'reverse',draft:reviewed.doc,baseRevision:reviewed.doc.revision,token:reviewed.lease.token,requestId:crypto.randomUUID()},'TRANSFER');assert.equal(clear.ok,true,JSON.stringify(clear));
 captureDate('final-unapprove',clear.doc);
 const datePreservation={expectedDate,stages:dateStages,commandDates:calls.filter(c=>c.businessDate!==undefined).map(c=>c.businessDate)};
 if(dateEvidencePath)writeFileSync(dateEvidencePath,JSON.stringify(datePreservation,null,2)+'\n');
 for(const stage of dateStages){
  assert.equal(stage.uiDate,expectedDate,stage.stage+' UI business date');assert.equal(stage.bodyDate,expectedDate,stage.stage+' stored business date');assert.equal(stage.businessDay,expectedDate,stage.stage+' SQL business day must be date text');
  for(const h of stage.history){assert.equal(h.date,expectedDate,stage.stage+' history V'+h.version);assert.equal(h.bodyDate,expectedDate,stage.stage+' history body V'+h.version);}
 }
 assert.ok(datePreservation.commandDates.length>=3);for(const day of datePreservation.commandDates)assert.equal(day,expectedDate,'command business date');
 return {status:'PASS',scope:'actual bridge/adapter/client with synthetic formal Fastify+PG; no visual browser inspection',draftScansLinked:1,recoveryPostedAgain:false,finalDocument:clear.doc,datePreservation,calls};
}
