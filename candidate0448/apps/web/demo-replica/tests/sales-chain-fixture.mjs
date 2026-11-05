/** TEST ONLY. Real service/rules/action policy over the existing synthetic transaction adapter.
 * No listener, SQL, credential, production identity or static APPROVED-document import. */
import Fastify from 'fastify';
import {randomUUID} from 'node:crypto';
import {createSalesHttpPlugin,exactJson} from '../../../api/src/sales-http.ts';
import {createInventoryLedgerQueryHttpPlugin} from '../../../api/src/inventory-ledger-query-http.ts';
import {createSalesChainLedgerDependencies} from './sales-chain-ledger-fixture.mjs';
import {createNativeSalesPreparation,createNativeSalesExistingPreparation,createNativeManualSalesBusinessRules} from '../../../../packages/application/src/native-sales-preparation.ts';
import {createSalesActionAuthorization} from '../../../../packages/application/src/sales-authorization.ts';
import {requireDomain} from '../../../../packages/domain/src/errors.ts';
import {minorAmount,quantity,version} from '../../../../packages/domain/src/values.ts';
import {SyntheticStore,balanceKey} from '../../../../tests/support/synthetic-store.ts';
import {qaPrincipal,qaHalls,qaWarehouses,qaCustomers,qaStaff,qaPaymentAccounts,qaProducts,qaSkus,qaInventory,qaId,qaReferenceRead,QA_REFERENCE_PROFILE} from '../frontend/qa-reference-fixtures.mts';
import {createSyntheticUnifiedTransport} from '../../unified-browser-harness/synthetic-transport.ts';
import {createSyntheticDocumentPreviewTransport} from '../frontend/runtime/documents/synthetic-preview-transport.ts';
import {createSyntheticProductPreviewTransport} from '../frontend/runtime/products/synthetic-preview-transport.ts';
import {parseSalesHistoryQuery,parseSalesListQuery} from '../../../../packages/application/src/sales-query-validation.ts';
export async function createSalesChainFixture(options={}){
 // Opt-in finite pagination scenario: every header/receipt is produced by the original SAVE.
 const pagination=options.pagination===true;let seeding=pagination,documentSequence=0;
 let clock='2026-10-29T12:00:00.000000Z';
 const newId=kind=>pagination&&kind==='sales'?`${(seeding?0x20000000-++documentSequence:0xf0000000+ ++documentSequence).toString(16)}-0000-4000-8000-000000000001`:randomUUID();
 const store=new SyntheticStore(options.sharedInventory),actor={accountId:qaPrincipal.accountId,hallId:qaPrincipal.hallId},identity={accountId:actor.accountId,staffId:qaPrincipal.staffId,role:'ADMIN',loginEnabled:true,employmentStatus:'在职',hallId:null,hallEnabled:null};
 store.seedIdentity(identity);
 const skuMap=new Map(qaSkus.map(row=>[row.id,structuredClone(row)])),products=new Map(qaProducts.map(row=>[row.id,{...structuredClone(row),referenceMinor:minorAmount(row.retailPrice.replace('.','')),minimumMinor:null}]));
 // Explicit synthetic declaration: these prices have known no minimum; this does NOT
 // infer null from the readonly QA minimumPriceAvailability=UNAVAILABLE field.
 const baseline=new Map();for(const p of qaInventory({}))for(const group of p.colorFits)for(const row of group.rows)for(const cell of Object.values(row.cells)){
  requireDomain(cell.state==='known','INVENTORY_NOT_READY','Only explicit known seed cells accepted');const key=balanceKey(row.warehouse.id,cell.skuId),amount=quantity(cell.quantity);requireDomain(!baseline.has(key)||baseline.get(key)===amount,'INVENTORY_NOT_READY','Conflicting seed');baseline.set(key,amount);
  store.seedBalance({warehouseId:row.warehouse.id,skuId:cell.skuId,quantity:amount,version:version(1),lastOperationId:null,updatedAt:'2026-10-29T00:00:00Z'});
 }
 const currentSkus=()=>options.references?.skus()??[...skuMap.values()],currentStaff=()=>options.references?.staff()??qaStaff,currentAccounts=()=>options.references?.paymentAccounts()??qaPaymentAccounts;
 const getSku=id=>{const row=currentSkus().find(row=>row.id===id);requireDomain(row,'SKU_UNAVAILABLE','Not a declared synthetic SKU');return row;};
 const snapshot=row=>({productCode:row.productCode,productName:row.productName,colorName:row.colorName,fitName:row.fitName,sizeName:row.sizeName,barcode:row.barcode});
 const scoped=d=>{requireDomain(qaHalls.some(x=>x.id===d.header.hallId&&x.enabled)&&qaCustomers.some(x=>x.id===d.header.customerId&&x.enabled)&&qaWarehouses.some(x=>x.id===d.header.warehouseId&&x.hall.id===d.header.hallId&&x.enabled),'FORBIDDEN','Outside finite synthetic directory');};
 const policy=createSalesActionAuthorization();
 const dependencies={now:()=>pagination?clock:'2026-10-29T12:00:00.000000Z',newId,rules:createNativeManualSalesBusinessRules(),authorization:{async assertAllowed(context,action,d,tx){await policy.assertAllowed(context,action,d,tx);scoped(d);}},unitOfWork:{transaction(work){return store.transaction(tx=>work({...tx,
  async resolveDocumentSkus(input){requireDomain(input.scope.kind==='SALES','FORBIDDEN','Sales-only scenario');return input.selections.map(selection=>{if('skuId'in selection)return getSku(selection.skuId).id;const matches=currentSkus().filter(row=>['productId','colorId','fitId','sizeId'].every(k=>row[k]===selection.spec[k]));requireDomain(matches.length===1,'SKU_UNAVAILABLE','Only predeclared exact specifications');return matches[0].id;});},
  async getCurrentSalesSnapshots(ids){return new Map(ids.map(id=>[id,snapshot(getSku(id))]));},
  async getCurrentSalesReferenceFacts(d){scoped(d);const old=await tx.getSales(d.header.id),skus=[...new Set(d.lines.map(x=>x.skuId))].map(getSku),hall=qaHalls.find(x=>x.id===d.header.hallId),warehouse=qaWarehouses.find(x=>x.id===d.header.warehouseId),customer=qaCustomers.find(x=>x.id===d.header.customerId),staff=d.header.salespersonId===null?null:currentStaff().find(x=>x.id===d.header.salespersonId);
   requireDomain(d.header.salespersonId===null||staff,'SALES_REFERENCE_UNAVAILABLE','Unknown synthetic salesperson');
   return {salesId:d.header.id,hall:{id:hall.id,enabled:hall.enabled},warehouse:{id:warehouse.id,hallId:warehouse.hall.id,enabled:warehouse.enabled},customer:{id:customer.id,enabled:customer.enabled},salesperson:staff?{id:staff.id,employmentStatus:staff.employmentStatus}:null,
    skus:skus.map(row=>({id:row.id,productId:row.productId,enabled:true,snapshot:snapshot(row)})),products:[...new Set(skus.map(x=>x.productId))].map(id=>{const p=options.references?.product(id)??products.get(id);requireDomain(p,'PRODUCT_PRICING_UNAVAILABLE','No synthetic price');return {id,enabled:true,referencePrice:p.referenceMinor,minimumPrice:p.minimumMinor};}),
    paymentAccounts:currentAccounts().filter(a=>(a.halls.length===0||a.halls.some(h=>h.id===hall.id&&h.enabled))).map(a=>({id:a.id,enabled:a.enabled,methodId:a.paymentMethod.id,methodEnabled:a.paymentMethod.enabled})),barcodes:skus.map(row=>({raw:row.barcode,skuId:row.id,enabled:true})),retainedLines:(old?.document.lines??[]).map(row=>({id:row.id,skuId:row.skuId,snapshot:row.snapshot}))};
  }
 }));}}};
 const app=Fastify({logger:false});app.register(createSalesHttpPlugin({authenticate:async()=>actor,dependencies,preparation:createNativeSalesPreparation(dependencies),existingPreparation:createNativeSalesExistingPreparation(dependencies)}));
 // Explicit fixture-only composition: same committed store and actual ledger IDs.
 app.register(createInventoryLedgerQueryHttpPlugin({authenticate:async()=>actor,dependencies:createSalesChainLedgerDependencies(store,actor)}));await app.ready();
 if(pagination){
  try{for(let index=0;index<25;index++){
   const response=await app.inject({method:'POST',url:'/sales/commands',payload:{action:'SAVE',requestKey:`SYN.pagination.seed.${index}`,expectedVersion:null,proposal:{salesId:null,businessType:'SALE',businessDate:'2026-10-29',note:'SYN finite pagination',hallId:qaHalls[0].id,customerId:qaCustomers[0].id,salespersonId:qaStaff[2].id,warehouseId:qaWarehouses[3].id,orderDiscount:'0.00',lines:[{existingLineId:null,skuId:qaSkus[0].id,quantity:'1',dealPrice:'239.00',pricingRule:'UNIT_PRICE',discountTenths:null,isGift:false,zeroConfirmed:false}],settlements:[{existingSettlementId:null,paymentAccountId:qaPaymentAccounts[0].id,paymentMethodId:qaPaymentAccounts[0].paymentMethod.id,direction:'RECEIVE',amount:'239.00'}]}}});
   requireDomain(response.statusCode===200,'SYNTHETIC_SEED_FAILED',response.body);
  }}catch(error){await app.close();throw error;}
  seeding=false;clock='2026-10-29T12:00:01.000000Z';
 }
 // Native protocol keeps its production number/C ordering; normal preview sorts materialized records separately.
 const nativeList=(parameters,state=store.snapshot())=>{
  const {filter:f,page,pageSize}=parseSalesListQuery(parameters);
  const selected=(values,value)=>values.length===0||values.includes(value);
  const headers=[...state.headers.values()];
  const rows=headers.filter(h=>(f.startDate===null||h.businessDate>=f.startDate)&&(f.endDate===null||h.businessDate<=f.endDate)&&(f.number===null||h.number.toLowerCase().includes(f.number.toLowerCase()))&&selected(f.statuses,h.status)&&selected(f.businessTypes,h.businessType)&&selected(f.hallIds,h.hallId)&&selected(f.customerIds,h.customerId)&&selected(f.warehouseIds,h.warehouseId)&&selected(f.salespersonIds,h.salespersonId));
  const timestamp=value=>value.replace(/(?:\.(\d+))?Z$/,(_,fraction='')=>'.'+fraction.padEnd(6,'0')+'Z');
  rows.sort((a,b)=>{const at=timestamp(a.createdAt),bt=timestamp(b.createdAt);return (at<bt?1:at>bt?-1:0)||Buffer.compare(Buffer.from(a.number),Buffer.from(b.number))||(a.id<b.id?-1:a.id>b.id?1:0);});
  return {exactTotal:String(rows.length),items:rows.slice((page-1)*pageSize,page*pageSize).map(h=>({id:h.id}))};
 };

 const base=createSyntheticUnifiedTransport(undefined,'standard',QA_REFERENCE_PROFILE);base.authorize();
 const json=(value,status=200)=>new Response(exactJson(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-data-source':'SYNTHETIC-REAL-SERVICE-MEMORY-NOT-PG'}});
 const raw=async(input,init,state=store.snapshot())=>{
  const url=new URL(input),path=url.pathname.slice(4),q=init.body?JSON.parse(String(init.body)):{};
  requireDomain(state.identities.get(actor.accountId)?.loginEnabled,'FORBIDDEN','Synthetic identity revoked');
  if(path==='/sales/query')return json(nativeList(q,state));
  if(path==='/sales/detail/query'){
   const header=state.headers.get(q.salesId);if(!header)return json({error:{code:'DOCUMENT_NOT_FOUND',message:'Only documents actually saved by this scenario'}},404);scoped({header});
   const lines=[...state.lines.values()].filter(l=>l.salesId===header.id&&l.isCurrent).sort((a,b)=>a.lineNo-b.lineNo),settlements=[...state.settlements.values()].filter(x=>x.salesId===header.id).sort((a,b)=>a.lineNo-b.lineNo);
   const name=(rows,id)=>id===null?null:rows.find(r=>r.id===id)?.name??null;
   return json({stockBasis:'RUNTIME_LEDGER',document:{header,lines,settlements},referenceNames:{hallName:name(qaHalls,header.hallId),customerName:name(qaCustomers,header.customerId),warehouseName:name(qaWarehouses,header.warehouseId),salespersonName:name(currentStaff(),header.salespersonId),responsibleName:name(currentStaff(),header.responsibleStaffId),createdByName:name(currentStaff(),identity.staffId)},settlementNames:settlements.map(row=>{const account=currentAccounts().find(a=>a.id===row.paymentAccountId);requireDomain(account,'SALES_REFERENCE_UNAVAILABLE','Known account required');return {settlementId:row.id,paymentAccountId:row.paymentAccountId,accountNameSnapshot:account.name,methodNameSnapshot:account.paymentMethod.name,currentAccountName:account.name,currentMethodName:account.paymentMethod.name};})});
  }
  if(path==='/sales/history/query'){
   const query=parseSalesHistoryQuery(q);requireDomain(state.headers.has(query.salesId),'DOCUMENT_NOT_FOUND','No synthetic stored document');const rows=state.audit.filter(row=>row.salesId===query.salesId).reverse().map(({id,operationId,actorAccountId,action,occurredAt,before,after})=>({id,operationId,actorAccountId,action,occurredAt,oldVersion:before?.header.version??null,newVersion:after.header.version}));return json({salesId:query.salesId,page:query.page,pageSize:query.pageSize,exactTotal:String(rows.length),items:rows.slice((query.page-1)*query.pageSize,query.page*query.pageSize)});
  }
  if(path==='/inventory/query'||path==='/product-management/query')return qaReferenceRead(path,q,false,null,(warehouseId,skuId)=>{const balance=state.balances.get(balanceKey(warehouseId,skuId));requireDomain(balance,'INVENTORY_NOT_READY','Missing synthetic balance is unknown, not zero');return String(balance.quantity);});
  return options.references?.fetch?options.references.fetch(input,init):base.http.fetch(input,{...init,credentials:'same-origin'});
 };
 const canHandle=(path,method)=>options.references&&method==='POST'&&path==='/api/sales/references/query'||method==='POST'&&['/api/sales/commands','/api/sales/prepare-create','/api/sales/prepare-existing','/api/sales/query','/api/sales/detail/query','/api/sales/history/query','/api/inventory/query','/api/inventory/ledger/query','/api/inventory/output/query','/api/product-management/query','/api/products/stock/query','/api/products/stock-overview/query'].includes(path)||method==='GET'&&path.startsWith('/api/sales/receipts/');
 async function request(request){
  const url=new URL(request.url),method=request.method??'GET';requireDomain(url.origin==='https://synthetic-management.invalid'&&!url.username&&!url.password&&!url.hash&&!url.search&&canHandle(url.pathname,method),'FORBIDDEN','Closed synthetic sales chain');
  if(url.pathname==='/api/inventory/ledger/query'||url.pathname==='/api/sales/commands'||url.pathname.startsWith('/api/sales/receipts/')||url.pathname==='/api/sales/prepare-create'||url.pathname==='/api/sales/prepare-existing'){
   const response=await app.inject({method,url:url.pathname.slice(4),headers:{'content-type':'application/json',...request.headers},...(request.body?{payload:request.body}:{})});return {status:response.statusCode,headers:response.headers,body:response.body};
  }
  if(!store.snapshot().identities.get(actor.accountId)?.loginEnabled)return {status:403,headers:{'content-type':'application/json'},body:exactJson({error:{code:'FORBIDDEN',message:'Synthetic identity revoked'}})};
  try{const readState=store.snapshot(),readFetch=(input,init)=>raw(input,init,readState);
 const reads=createSyntheticDocumentPreviewTransport({syntheticOnly:true,origin:base.http.origin,existingFetch:readFetch,dataset:QA_REFERENCE_PROFILE,includeSyntheticHistory:false});
 const productReads=createSyntheticProductPreviewTransport({origin:base.http.origin,existingFetch:readFetch,dataset:QA_REFERENCE_PROFILE,snapshotVersion:1,syntheticFiniteInventoryOutput:true});
   const init={method,credentials:'same-origin',headers:request.headers,body:request.body,signal:new AbortController().signal};const response=url.pathname==='/api/sales/history/query'?await readFetch(url.href,init):reads.canHandle(url.pathname,method)?await reads.request(url,init):productReads.canHandle(url.pathname,method)?await productReads.request(url,init):await readFetch(url.href,init);return {status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()};}
  catch(error){return {status:error.code==='FORBIDDEN'?403:error.code==='DOCUMENT_NOT_FOUND'?404:500,headers:{'content-type':'application/json'},body:exactJson({error:{code:error.code??'SYNTHETIC_READ_FAILED',message:'Synthetic store read rejected'}})};}
 }
 return {actor,dependencies,request,canHandle,nativeList,snapshot:()=>store.snapshot(),baseline:()=>structuredClone(baseline),failNextAt(point){store.failNextAt=point;},revoke(){store.seedIdentity({...identity,loginEnabled:false});},async close(){await app.close();},
  async command(command){const response=await app.inject({method:'POST',url:'/sales/commands',payload:command});return {status:response.statusCode,body:response.json()};}
 };
}
