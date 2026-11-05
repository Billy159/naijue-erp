/** TEST ONLY: original HISTORY HTTP/services/planner with finite in-memory samples.
 * No PostgreSQL, published-source certification, real authorization or inventory effects. */
import Fastify from 'fastify';
import {randomUUID} from 'node:crypto';
import {createHistoryRevisionHttpPlugin} from '../../../api/src/history-revision-http.ts';
import {createImportedHistoryQueryHttpPlugin} from '../../../api/src/imported-history-query-http.ts';
import {parseHistoryRevisionCommand,planHistoryRevision} from '../../../../packages/application/src/history-revision-service.ts';
import {validateImportedHistoryDetail,validateImportedHistoryList} from '../../../../packages/application/src/imported-history-query-validation.ts';
import {parseTransferListQuery} from '../../../../packages/application/src/transfer-query-validation.ts';
import {normalTransferResponse} from '../frontend/runtime/documents/normal-list-reader.ts';
import {compareDocumentCreatedOrder} from '../frontend/runtime/documents/document-created-order.ts';
import {requestHash} from '../../../../packages/application/src/request-hash.ts';
import {requireDomain} from '../../../../packages/domain/src/errors.ts';
const copy=value=>structuredClone(value),must=(ok,code='HISTORY_REVISION_INVALID')=>requireDomain(ok,code,'Finite synthetic HISTORY fixture rejected');
const id=n=>`71000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const SYNTHETIC_HISTORY_TARGET=Object.freeze({kind:'transfers',batchId:id(1),documentId:id(2),effectiveVersion:1});
const originHeader='SYNTHETIC-REAL-HISTORY-SERVICE-MEMORY-NOT-PG-NOT-PRODUCTION';
export async function createHistoryChainFixture(options){
 const {origin,actor,assertAllowed,references,sourceSkuId,warehouses}=options;
 must(options.syntheticOnly===true&&origin==='https://synthetic-management.invalid','FORBIDDEN');
 must(typeof assertAllowed==='function'&&typeof references?.skus==='function'&&typeof references?.catalog==='function'&&typeof references?.staff==='function');
 must(Array.isArray(warehouses)&&warehouses.length>=2&&warehouses[0].id!==warehouses[1].id);
 let closed=false,revoked=false,lost=false,allocations=0,tail=Promise.resolve();const receipts=new Map(),revisions=[];
 const sourceSku=references.skus().find(s=>s.id===sourceSkuId);must(sourceSku,'HISTORY_REVISION_FOREIGN_ROW');
 const sourceStatus=options.sourceStatus??'DRAFT';must(['DRAFT','APPROVED','VOID'].includes(sourceStatus));
 const sourceLine={lineId:id(3),skuId:sourceSku.id,quantity:'2'};
 const sourceSnapshot={productCodeSnapshot:sourceSku.productCode,productNameSnapshot:sourceSku.productName,colorNameSnapshot:sourceSku.colorName,fitNameSnapshot:sourceSku.fitName,sizeNameSnapshot:sourceSku.sizeName,barcodeSnapshot:sourceSku.barcode??null};
 const sourceIdentity=options.sourceIdentityUnknown===true?{state:'UNKNOWN'}:{state:'BOUND',productId:sourceSku.productId,colorId:sourceSku.colorId,fitId:sourceSku.fitId,sizeId:sourceSku.sizeId};
 const sourceGroup=references.catalog([sourceLine]).sizeGroups.find(g=>g.sizeGroupId===sourceSku.sizeGroupId);must(sourceGroup);
 const groupSnapshot=g=>({groupId:g.sizeGroupId,name:g.name,sizes:g.members.map(s=>({sizeId:s.sizeId,name:s.name,displayOrder:s.displayOrder})).sort((a,b)=>a.displayOrder-b.displayOrder||a.sizeId.localeCompare(b.sizeId))});
 const originalGroup=groupSnapshot(sourceGroup);
 const source={kind:'transfers',documentId:id(2),version:1,previousRevisionId:null,importBatchId:id(1),publishedOperationId:id(4),documentManifestHash:requestHash({syntheticOnly:true,sourceLine,sourceSnapshot}),sourceStatus,baselineEffect:sourceStatus==='APPROVED'?'INCLUDED_APPROVED':'EXCLUDED_NOT_EFFECTIVE',businessDate:options.sourceBusinessDateUnknown===true?null:'2026-11-01',warehouseId:null,fromWarehouseId:warehouses[0].id,toWarehouseId:warehouses[1].id,lines:[sourceLine],totals:null,settlements:[],responsibleStaffId:null,note:'SYNTHETIC 原来源备注（非正式资料）'};
 let current=copy(source);
 const allowed=(input,signal)=>{must(!closed&&!revoked&&!signal?.aborted,'FORBIDDEN');assertAllowed(input,signal);};
 const header=()=>({dataset:'HISTORY',kind:'transfers',batchId:current.importBatchId,documentId:current.documentId,version:current.version,number:'SYNTHETIC-HISTORY-DRAFT-001',businessDate:current.businessDate,sourceStatus:current.sourceStatus,note:current.note,createdBy:{state:'UNKNOWN',staffId:null},approvedBy:{state:'UNKNOWN',staffId:null},responsibleStaffId:current.responsibleStaffId,responsibleName:current.responsibleStaffId?references.staff().find(s=>s.id===current.responsibleStaffId)?.name??null:null,createdHallId:null,createdHallProvenance:'UNKNOWN',createdLocalAt:null,updatedLocalAt:null,approvedLocalAt:null,createdInstant:null,updatedInstant:null,approvedInstant:null,fromWarehouseId:current.fromWarehouseId,toWarehouseId:current.toWarehouseId});
 const snapshotLine=(row,index)=>({id:row.lineId,lineNo:index+1,skuId:row.skuId,quantity:row.quantity,...(row.origin?.kind==='REVISION'?row.origin.snapshot:sourceSnapshot)});
 const page=(n,size,total,items)=>({page:n,pageSize:size,total:String(total),items});
 const detail=(read)=>{
  allowed(read.actor,read.signal);const q=read.intent.parameters,found=read.intent.kind==='transfers'&&q.documentId===source.documentId;
  if(!found)return {dataset:'HISTORY',kind:read.intent.kind,document:null,lines:page(q.linePage,q.linePageSize,0,[]),settlements:page(q.settlementPage,q.settlementPageSize,0,[])};
  const offset=(q.linePage-1)*q.linePageSize,all=current.lines.map(snapshotLine),items=all.slice(offset,offset+q.linePageSize),selected=current.lines.slice(offset,offset+q.linePageSize),usedGroups=new Map();
  const catalogItems=selected.map(row=>{
   if(row.origin?.kind==='REVISION'){
    const o=row.origin,key=o.createdRevisionId+':'+o.groupId,g=current.nativeGroups.find(g=>g.revisionId===o.createdRevisionId&&g.groupId===o.groupId);must(g);usedGroups.set(key,g);
    return {lineId:row.lineId,skuId:row.skuId,identity:{state:'BOUND',...o.identity},sourceGroup:{state:'UNKNOWN'},origin:{kind:'REVISION',createdRevisionId:o.createdRevisionId},currentGroup:{state:'BOUND',revisionId:o.createdRevisionId,groupId:o.groupId}};
   }
   return {lineId:row.lineId,skuId:row.skuId,identity:copy(sourceIdentity),sourceGroup:sourceIdentity.state==='UNKNOWN'?{state:'UNKNOWN'}:{state:'BOUND',groupId:originalGroup.groupId},...(current.draftLineSetVersion===1?{origin:{kind:'SOURCE',sourceLineId:row.lineId},currentGroup:{state:'UNKNOWN'}}:{})};
  });
  const groups=sourceIdentity.state==='BOUND'&&selected.some(row=>row.origin?.kind!=='REVISION')?[copy(originalGroup)]:[];
  const lineCatalog=current.draftLineSetVersion===1?{basis:'HISTORY_EFFECTIVE_SKU_IDENTITY_V2',items:catalogItems,groups,currentGroups:[...usedGroups.values()].map(copy).sort((a,b)=>a.revisionId.localeCompare(b.revisionId)||a.groupId.localeCompare(b.groupId))}:{basis:'PUBLISHED_SOURCE_SKU_IDENTITY_V1',items:catalogItems,groups};
  return validateImportedHistoryDetail({dataset:'HISTORY',kind:'transfers',document:header(),lines:page(q.linePage,q.linePageSize,all.length,items),settlements:page(q.settlementPage,q.settlementPageSize,0,[]),lineCatalog},read.intent,read.grant);
 };
 const ids=new Set([source.documentId,source.importBatchId,source.publishedOperationId,sourceLine.lineId]);
 // Stage allocation as well as document state: rejected commands leave no fixture mutation.
 const resolve=(command,revisionId,allocate)=>{
  const lines=command.lineSet.map(row=>{
   const old=row.lineId===null?null:current.lines.find(l=>l.lineId===row.lineId);must(row.lineId===null||old,'HISTORY_REVISION_FOREIGN_ROW');
   if(old&&old.skuId===row.skuId)return {...copy(old),quantity:row.quantity,origin:copy(old.origin??{kind:'SOURCE',sourceLineId:old.lineId})};
   const sku=references.skus().find(s=>s.id===row.skuId);must(sku&&sku.enabled!==false,'HISTORY_REVISION_FOREIGN_ROW');
   const group=references.catalog([{skuId:sku.id}]).sizeGroups.find(g=>g.sizeGroupId===sku.sizeGroupId);must(group&&group.members.some(z=>z.sizeId===sku.sizeId),'HISTORY_REVISION_FOREIGN_ROW');
   return {lineId:allocate(),skuId:sku.id,quantity:row.quantity,origin:{kind:'REVISION',createdRevisionId:revisionId,identity:{productId:sku.productId,colorId:sku.colorId,fitId:sku.fitId,sizeId:sku.sizeId},groupId:sku.sizeGroupId,snapshot:{productCodeSnapshot:sku.productCode,productNameSnapshot:sku.productName,colorNameSnapshot:sku.colorName,fitNameSnapshot:sku.fitName,sizeNameSnapshot:sku.sizeName,barcodeSnapshot:sku.barcode??null}}};
  });
  const groups=new Map();for(const row of lines)if(row.origin.kind==='REVISION'){
   const o=row.origin,key=o.createdRevisionId+':'+o.groupId;
   if(groups.has(key))continue;
   if(o.createdRevisionId!==revisionId){const old=current.nativeGroups?.find(g=>g.revisionId===o.createdRevisionId&&g.groupId===o.groupId);must(old);groups.set(key,copy(old));}
   else {const g=references.catalog([{skuId:row.skuId}]).sizeGroups.find(g=>g.sizeGroupId===o.groupId);must(g);groups.set(key,{revisionId,...groupSnapshot(g)});}
  }
  return {lines,nativeGroups:[...groups.values()].sort((a,b)=>a.revisionId.localeCompare(b.revisionId)||a.groupId.localeCompare(b.groupId))};
 };
 const write=async(input,value,grant,now,signal)=>{
  const run=()=>{
   allowed(input,signal);const command=parseHistoryRevisionCommand(value);must(command.kind==='transfers'&&command.documentId===source.documentId,'HISTORY_REVISION_NOT_FOUND');
   must(grant.actorAccountId===input.accountId&&grant.documentId===command.documentId&&grant.kind===command.kind&&grant.dataset==='HISTORY','FORBIDDEN');
   const key=JSON.stringify([input.accountId,command.requestKey]),hash=requestHash(command),prior=receipts.get(key);
   if(prior){must(prior.requestHash===hash,'IDEMPOTENCY_CONFLICT');return copy(prior.receipt);}
   must(current.sourceStatus==='DRAFT'&&current.baselineEffect==='EXCLUDED_NOT_EFFECTIVE','HISTORY_REVISION_INVALID');must(command.expectedVersion===current.version,'VERSION_CONFLICT');
   const from=command.header?.fromWarehouseId??current.fromWarehouseId,to=command.header?.toWarehouseId??current.toWarehouseId;
   must(from!==to&&[from,to].every(id=>warehouses.some(w=>w.id===id&&w.enabled&&w.hallEnabled)),'HISTORY_REVISION_FOREIGN_ROW');
   if(command.header?.responsibleStaffId!=null)must(references.staff().some(s=>s.id===command.header.responsibleStaffId&&s.employmentStatus==='在职'),'HISTORY_REVISION_FOREIGN_ROW');
   const pendingIds=new Set(),allocate=()=>{const value=randomUUID();must(!ids.has(value)&&!pendingIds.has(value));pendingIds.add(value);return value;};
   const operationId=allocate(),revisionId=allocate(),resolved=command.lineSet===undefined?undefined:resolve(command,revisionId,allocate);
   const plan=planHistoryRevision(current,command,revisionId,resolved);must(plan.effects.length===0);
   const receipt={operationId,dataset:'HISTORY',kind:'transfers',documentId:command.documentId,revisionId,version:plan.toVersion,ledgerEntryIds:[]};
   for(const value of pendingIds)ids.add(value);allocations+=pendingIds.size;
   current=copy(plan.after);revisions.push({operationId,command:copy(command),plan:copy(plan),now});receipts.set(key,{requestHash:hash,receipt:copy(receipt)});return copy(receipt);
  };
  const task=tail.then(run);tail=task.then(()=>{},()=>{});return task;
 };
 const authenticate=async input=>{if(input.headers.origin!==undefined)must(input.headers.origin===origin,'ORIGIN_REJECTED');return actor;};
 const app=Fastify({logger:false});app.addHook('onSend',async(_r,reply,payload)=>{reply.header('x-data-source',originHeader);return payload;});
 app.register(createHistoryRevisionHttpPlugin({authenticate,dependencies:{authorization:{async authorize(input,command,signal){allowed(input,signal);return {dataset:'HISTORY',kind:command.kind,documentId:command.documentId,actorAccountId:input.accountId};}},store:{revise:write},now:()=> '2026-11-01T00:00:00.000Z'}}));
 app.register(createImportedHistoryQueryHttpPlugin({authenticate,dependencies:{authorization:{async authorize(input,intent,signal){allowed(input,signal);return {dataset:'HISTORY',actorAccountId:input.accountId,kind:intent.kind,operation:intent.operation,targetId:intent.operation==='detail'?intent.parameters.documentId:null,scope:{kind:'ALL'}};}},reader:{async readDetail(read){return detail(read);},async readList(read){allowed(read.actor,read.signal);const q=read.intent.parameters,h=header(),match=read.intent.kind==='transfers'&&(q.batchId===null||q.batchId===h.batchId)&&(!q.number||h.number.includes(q.number))&&(q.sourceStatus===null||q.sourceStatus===h.sourceStatus)&&(q.businessDateFrom===null||h.businessDate>=q.businessDateFrom)&&(q.businessDateTo===null||h.businessDate<=q.businessDateTo)&&(q.fromWarehouseId===null||q.fromWarehouseId===h.fromWarehouseId)&&(q.toWarehouseId===null||q.toWarehouseId===h.toWarehouseId)&&q.hallId===null&&q.warehouseId===null&&q.customerId===null&&q.salespersonId===null;return validateImportedHistoryList({dataset:'HISTORY',kind:read.intent.kind,documents:page(q.page,q.pageSize,match?1:0,match&&q.page===1?[h]:[])},read.intent,read.grant);}}}}));
 await app.ready();
 const canHandle=(path,method)=>method==='POST'&&/^\/api\/imported-history\/transfers\/(query|detail\/query|revise)$/.test(path);
 return {target:copy(SYNTHETIC_HISTORY_TARGET),canHandle,
  async request(r){const u=new URL(r.url),method=r.method??'POST';must(u.origin===origin&&!u.search&&!u.hash&&canHandle(u.pathname,method),'FORBIDDEN');const response=await app.inject({method,url:u.pathname.slice(4),headers:r.headers,payload:r.body});if(lost&&u.pathname.endsWith('/revise')&&response.statusCode===200){lost=false;throw Error('SYNTHETIC_HISTORY_RESPONSE_LOST_AFTER_COMMIT');}return {status:response.statusCode,headers:response.headers,body:response.body};},
  async mergeNormalList(r,readLive){allowed(actor,new AbortController().signal);let q;try{q=parseTransferListQuery(JSON.parse(r.body));}catch{return readLive(r);}const full={...q,page:1,pageSize:200},live=await readLive({...r,body:JSON.stringify(full)});if(live.status!==200)return live;const data=normalTransferResponse(JSON.parse(live.body),full);must(data.exactTotal===String(data.items.length),'HISTORY_REVISION_STORE_NOT_READY');
   const h=header(),f=q.filter,match=(!f.startDate||h.businessDate>=f.startDate)&&(!f.endDate||h.businessDate<=f.endDate)&&(!f.number||h.number.toLowerCase().includes(f.number.toLowerCase()))&&(!f.statuses.length||f.statuses.includes(h.sourceStatus))&&(!f.fromWarehouseIds.length||f.fromWarehouseIds.includes(h.fromWarehouseId))&&(!f.toWarehouseIds.length||f.toWarehouseIds.includes(h.toWarehouseId));
   const from=warehouses.find(w=>w.id===h.fromWarehouseId),to=warehouses.find(w=>w.id===h.toWarehouseId),products=new Map();let productCountUnknown=false;
   for(const [index,row] of current.lines.entries()){const l=snapshotLine(row,index),identity=row.origin?.kind==='REVISION'?row.origin.identity:sourceIdentity;if(identity.state==='UNKNOWN'){productCountUnknown=true;continue;}products.set(identity.productId,{productId:identity.productId,productCodeSnapshot:l.productCodeSnapshot,productNameSnapshot:l.productNameSnapshot});}
   const row={id:h.documentId,number:h.number,businessDate:h.businessDate,fromWarehouseId:h.fromWarehouseId,toWarehouseId:h.toWarehouseId,status:h.sourceStatus,version:h.version,createdByAccountId:null,createdAt:null,updatedAt:null,responsibleStaffId:h.responsibleStaffId,fromWarehouseName:from.name,toWarehouseName:to.name,fromHallName:from.hallName,toHallName:to.hallName,createdByName:null,approvedByName:null,responsibleName:h.responsibleName,totalQuantity:current.lines.reduce((sum,l)=>sum+BigInt(l.quantity),0n).toString(),dataset:'HISTORY',batchId:h.batchId,documentId:h.documentId,effectiveVersion:h.version,productSummary:{productCount:String(products.size),items:[...products.values()].slice(0,3),hasMore:products.size>3},createdLocalAt:null,updatedLocalAt:null};
   if(productCountUnknown)row.productSummary.productCount=null;
   if(new Headers(r.headers).get('x-naijue-document-summary')?.startsWith('category-v'))row.categorySummary={basis:'UNKNOWN',metric:'PRODUCT_COUNT',items:[],hasMore:false,...(new Headers(r.headers).get('x-naijue-document-summary')==='category-v2'?{categoryCount:null}:{})};
   const items=[...data.items,...(match?[row]:[])].sort(compareDocumentCreatedOrder),result=normalTransferResponse({page:q.page,pageSize:q.pageSize,exactTotal:String(items.length),items:items.slice((q.page-1)*q.pageSize,q.page*q.pageSize),historyCoverage:'PUBLISHED_AUTHORIZED',totals:{totalQuantity:items.reduce((sum,row)=>sum+BigInt(row.totalQuantity),0n).toString()}},q);
   return {status:200,headers:{'content-type':'application/json','cache-control':'no-store','x-data-source':originHeader},body:JSON.stringify(result)};
  },revoke(){revoked=true;},loseNextResponse(){lost=true;},snapshot:()=>({source:copy(source),current:copy(current),receipts:copy(receipts),revisions:copy(revisions),allocations}),async close(){await tail;closed=true;await app.close();}};
}
