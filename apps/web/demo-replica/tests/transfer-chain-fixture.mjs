/** TEST ONLY: isolated transfer real-service transactions. Not a shared sales ledger, SQL or production identity. */
import Fastify from 'fastify';
import {randomUUID} from 'node:crypto';
import {createTransferHttpPlugin} from '../../../api/src/transfer-http.ts';
import {createNativeTransferPreparation,createNativeTransferExistingPreparation,createNativeManualTransferReferences} from '../../../../packages/application/src/native-transfer-preparation.ts';
import {createSourceConfirmedTransferAuthorization} from '../../../../packages/application/src/transfer-policy.ts';
import {SyntheticTransferStore,balanceKey} from '../../../../tests/support/synthetic-transfer.ts';
import {requireDomain} from '../../../../packages/domain/src/errors.ts';
import {quantity,version} from '../../../../packages/domain/src/values.ts';
import {qaPrincipal,qaWarehouses,qaSkus,qaInventory,qaStaff,qaTransferCatalog,qaReferenceRead,QA_REFERENCE_PROFILE} from '../frontend/qa-reference-fixtures.mts';
import {exactJson} from '../../../api/src/sales-http.ts';
import {parseTransferHistoryQuery,parseTransferListQuery} from '../../../../packages/application/src/transfer-query-validation.ts';
import {createSyntheticUnifiedTransport} from '../../unified-browser-harness/synthetic-transport.ts';
import {createSyntheticDocumentPreviewTransport} from '../frontend/runtime/documents/synthetic-preview-transport.ts';
import {createSyntheticProductPreviewTransport} from '../frontend/runtime/products/synthetic-preview-transport.ts';
export async function createTransferChainFixture(options={}){
 const responsibleStaffValidation=options.responsibleStaffValidation===true;
 // Opt-in finite pagination scenario: every header/receipt is produced by the original SAVE.
 const pagination=options.pagination===true;let seeding=pagination,documentSequence=0;
 let clock='2026-10-29T12:00:00.000000Z';
 const newId=kind=>pagination&&kind==='transfer'?`${(seeding?0x20000000-++documentSequence:0xf0000000+ ++documentSequence).toString(16)}-0000-4000-8000-000000000001`:randomUUID();
 const store=new SyntheticTransferStore(),actor={accountId:qaPrincipal.accountId,hallId:null,role:'ADMIN'},identity={...actor,staffId:qaPrincipal.staffId,loginEnabled:true,employmentStatus:'在职',hallEnabled:null};store.seedIdentity(identity);
 const baseline=new Map();for(const p of qaInventory({}))for(const group of p.colorFits)for(const row of group.rows)for(const cell of Object.values(row.cells)){
  requireDomain(cell.state==='known','INVENTORY_NOT_READY','Only explicit known seed cells');const key=balanceKey(row.warehouse.id,cell.skuId),value=quantity(cell.quantity);requireDomain(!baseline.has(key)||baseline.get(key)===value,'INVENTORY_NOT_READY','Conflicting seed');baseline.set(key,value);store.seedBalance({warehouseId:row.warehouse.id,skuId:cell.skuId,quantity:value,version:version(1),lastOperationId:null,updatedAt:'2026-10-29T00:00:00Z'});
 }
 for(const w of qaWarehouses)store.seedWarehouse({id:w.id,hallId:w.hall.id,enabled:w.enabled,hallEnabled:w.hall.enabled,hasNonzeroInventory:[...store.snapshot().balances.values()].some(b=>b.warehouseId===w.id&&b.quantity!==0n)});
 const skuMap=new Map(qaSkus.map(row=>[row.id,structuredClone(row)]));for(const sku of qaSkus)store.seedSku({id:sku.id,enabled:true});
 const getSku=id=>{const row=skuMap.get(id);requireDomain(row,'SKU_UNAVAILABLE','Only predeclared synthetic SKU');requireDomain(typeof row.barcode==='string'&&row.barcode.length>0,'NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE','Declared MAIN required');return row;};
 const dependencies={now:()=>pagination?clock:'2026-10-29T12:00:00Z',newId,authorization:createSourceConfirmedTransferAuthorization(),references:createNativeManualTransferReferences(),unitOfWork:{transaction(work){return store.transaction(tx=>work({...tx,
  async putRuntimeTransfer(document){
   if(responsibleStaffValidation){
    const selected=document.header.responsibleStaffId,previous=store.snapshot().transfers.get(document.header.id)?.document;
    requireDomain(selected===null||qaStaff.some(row=>row.id===selected),'RESPONSIBLE_STAFF_UNAVAILABLE','Actual finite QA staff required');
    if(previous&&selected!==previous.header.responsibleStaffId)requireDomain(previous.header.status==='DRAFT'&&document.header.status==='DRAFT'&&selected!==null,'INVALID_STATE','Existing responsible change requires draft SAVE and actual staff, matching the SQL boundary');
   }
   return tx.putRuntimeTransfer(document);
  },
  async resolveDocumentSkus(input){requireDomain(input.scope.kind==='TRANSFER','FORBIDDEN','Transfer-only scenario');return input.selections.map(selection=>{if('skuId'in selection)return getSku(selection.skuId).id;const matches=[...skuMap.values()].filter(row=>['productId','colorId','fitId','sizeId'].every(k=>row[k]===selection.spec[k]));requireDomain(matches.length===1,'SKU_UNAVAILABLE','Exact predeclared specification required');return getSku(matches[0].id).id;});},
  async getCurrentTransferSnapshots(ids){return new Map(ids.map(id=>{const row=getSku(id);return [id,{productCode:row.productCode,productName:row.productName,colorName:row.colorName,fitName:row.fitName,sizeName:row.sizeName,barcode:row.barcode}];}));}
 }));}}};
 const app=Fastify({logger:false});app.register(createTransferHttpPlugin({authenticate:async()=>actor,dependencies,preparation:createNativeTransferPreparation(dependencies),existingPreparation:createNativeTransferExistingPreparation(dependencies)}));await app.ready();
 if(pagination){
  try{for(let index=0;index<25;index++){
   const response=await app.inject({method:'POST',url:'/transfers/commands',payload:{action:'SAVE',requestKey:`SYN.pagination.seed.${index}`,expectedVersion:null,proposal:{transferId:null,businessDate:'2026-10-29',note:'SYN finite pagination',responsibleStaffId:qaStaff[0].id,fromWarehouseId:qaWarehouses[3].id,toWarehouseId:qaWarehouses[2].id,lines:[{existingLineId:null,skuId:qaSkus[0].id,quantity:'2'}]}}});
   requireDomain(response.statusCode===200,'SYNTHETIC_SEED_FAILED',response.body);
  }}catch(error){await app.close();throw error;}
  seeding=false;clock='2026-10-29T12:00:01.000000Z';
 }
 // Native protocol keeps its production number/C ordering; normal preview sorts materialized records separately.
 const nativeList=(parameters,state=store.snapshot())=>{
  const {filter:f,page,pageSize}=parseTransferListQuery(parameters);
  const selected=(values,value)=>values.length===0||values.includes(value);
  const headers=[...state.transfers.values()].map(row=>row.document.header);
  const rows=headers.filter(h=>(f.startDate===null||h.businessDate>=f.startDate)&&(f.endDate===null||h.businessDate<=f.endDate)&&(f.number===null||h.number.toLowerCase().includes(f.number.toLowerCase()))&&selected(f.statuses,h.status)&&selected(f.fromWarehouseIds,h.fromWarehouseId)&&selected(f.toWarehouseIds,h.toWarehouseId));
  const timestamp=value=>value.replace(/(?:\.(\d+))?Z$/,(_,fraction='')=>'.'+fraction.padEnd(6,'0')+'Z');
  rows.sort((a,b)=>{const at=timestamp(a.createdAt),bt=timestamp(b.createdAt);return (at<bt?1:at>bt?-1:0)||Buffer.compare(Buffer.from(a.number),Buffer.from(b.number))||(a.id<b.id?-1:a.id>b.id?1:0);});
  return {exactTotal:String(rows.length),items:rows.slice((page-1)*pageSize,page*pageSize).map(h=>({id:h.id}))};
 };

 const base=createSyntheticUnifiedTransport(undefined,'standard',QA_REFERENCE_PROFILE);base.authorize();
 const json=(value,status=200)=>new Response(exactJson(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-data-source':'SYNTHETIC-REAL-TRANSFER-SERVICE-MEMORY-NOT-PG'}});
 const raw=async(input,init,state)=>{
  const path=new URL(input).pathname.slice(4),q=init.body?JSON.parse(String(init.body)):{};
  if(path==='/transfers/query')return json(nativeList(q,state));
  if(path==='/transfers/detail/query'){
   const stored=state.transfers.get(q.transferId);if(!stored)return json({error:{code:'DOCUMENT_NOT_FOUND',message:'Only documents actually saved by this scenario'}},404);
   const {document}=stored,header=document.header,from=qaWarehouses.find(w=>w.id===header.fromWarehouseId),to=qaWarehouses.find(w=>w.id===header.toWarehouseId);requireDomain(from&&to,'WAREHOUSE_UNAVAILABLE','Finite directory required');
   const currentDocument={...structuredClone(document),lines:structuredClone(document.lines.filter(line=>line.isCurrent))};
   return json({...stored,document:currentDocument,references:{fromWarehouseName:from.name,toWarehouseName:to.name,fromHallName:from.hall.name,toHallName:to.hall.name,createdByName:qaStaff.find(s=>s.id===identity.staffId)?.name??null,approvedByName:header.approvedByAccountId===actor.accountId?qaStaff.find(s=>s.id===identity.staffId)?.name??null:null,responsibleName:header.responsibleStaffId?qaStaff.find(s=>s.id===header.responsibleStaffId)?.name??null:null},catalog:qaTransferCatalog(currentDocument.lines)});
  }
  if(path==='/transfers/history/query'){
   const query=parseTransferHistoryQuery(q);requireDomain(state.transfers.has(query.transferId),'DOCUMENT_NOT_FOUND','No stored target');const rows=state.audit.filter(row=>row.transferId===query.transferId).reverse().map(({id,operationId,actorAccountId,action,occurredAt,before,after})=>({id,operationId,actorAccountId,action,occurredAt,oldVersion:before?.header.version??null,newVersion:after.header.version}));return json({transferId:query.transferId,page:query.page,pageSize:query.pageSize,exactTotal:String(rows.length),items:rows.slice((query.page-1)*query.pageSize,query.page*query.pageSize)});
  }
  if(path==='/inventory/query'||path==='/product-management/query')return qaReferenceRead(path,q,false,null,(warehouse,sku)=>{const row=state.balances.get(balanceKey(warehouse,sku));requireDomain(row,'INVENTORY_NOT_READY','Missing balance is unknown');return String(row.quantity);});
  return base.http.fetch(input,{...init,credentials:'same-origin'});
 };
 const canHandle=(path,method)=>method==='POST'&&['/api/transfers/commands','/api/transfers/prepare-create','/api/transfers/prepare-existing','/api/transfers/query','/api/transfers/detail/query','/api/transfers/history/query','/api/inventory/query','/api/inventory/output/query','/api/product-management/query','/api/products/stock/query','/api/products/stock-overview/query'].includes(path)||method==='GET'&&path.startsWith('/api/transfers/receipts/');
 async function request(request){
  const url=new URL(request.url),method=request.method??'GET';requireDomain(url.origin==='https://synthetic-management.invalid'&&!url.username&&!url.password&&!url.hash&&!url.search&&canHandle(url.pathname,method),'FORBIDDEN','Closed isolated transfer scenario');
  if(url.pathname==='/api/transfers/commands'||url.pathname.startsWith('/api/transfers/receipts/')||url.pathname==='/api/transfers/prepare-create'||url.pathname==='/api/transfers/prepare-existing'){
   const response=await app.inject({method,url:url.pathname.slice(4),headers:{'content-type':'application/json',...request.headers},...(request.body?{payload:request.body}:{})});return {status:response.statusCode,headers:response.headers,body:response.body};
  }
  try{const state=store.snapshot();requireDomain(state.identities.get(actor.accountId)?.loginEnabled,'FORBIDDEN','Identity revoked');const readFetch=(input,init)=>raw(input,init,state),reads=createSyntheticDocumentPreviewTransport({syntheticOnly:true,origin:base.http.origin,existingFetch:readFetch,dataset:QA_REFERENCE_PROFILE,includeSyntheticHistory:false}),products=createSyntheticProductPreviewTransport({origin:base.http.origin,existingFetch:readFetch,dataset:QA_REFERENCE_PROFILE,snapshotVersion:1,syntheticFiniteInventoryOutput:true}),init={method,credentials:'same-origin',headers:request.headers,body:request.body,signal:new AbortController().signal};
   const response=url.pathname==='/api/transfers/history/query'?await readFetch(url.href,init):reads.canHandle(url.pathname,method)?await reads.request(url,init):products.canHandle(url.pathname,method)?await products.request(url,init):await readFetch(url.href,init);return {status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()};
  }catch(error){return {status:error.code==='FORBIDDEN'?403:error.code==='DOCUMENT_NOT_FOUND'?404:500,headers:{'content-type':'application/json'},body:exactJson({error:{code:error.code??'SYNTHETIC_READ_FAILED',message:'Synthetic read rejected'}})};}
 }
 return {responsibilityProfile:responsibleStaffValidation?'FINITE_QA_STAFF_SQL_BOUNDARY_MEMORY_V1':null,actor,dependencies,request,canHandle,nativeList,snapshot:()=>store.snapshot(),baseline:()=>structuredClone(baseline),failNextAt(point){store.failNextAt=point;},removeBalance(warehouse,sku){store.removeBalance(warehouse,sku);},revoke(){store.seedIdentity({...identity,loginEnabled:false});},async close(){await app.close();},async command(command){const response=await app.inject({method:'POST',url:'/transfers/commands',payload:command});return {status:response.statusCode,body:response.json()};}};
}
