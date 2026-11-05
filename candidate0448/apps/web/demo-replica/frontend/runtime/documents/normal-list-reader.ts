import { historicalHallFields, validateHistoricalHall } from '../../../../src/sales/historical-hall.ts';
import type { SalesUnifiedListPage, SalesUnifiedSummary, DocumentListIdentity } from '../../../../../../packages/application/src/sales-query-ports.ts';
import type { TransferUnifiedListPage, TransferUnifiedSummary } from '../../../../../../packages/application/src/transfer-query-ports.ts';
import { parseSalesListQuery } from '../../../../../../packages/application/src/sales-query-validation.ts';
import { parseTransferListQuery } from '../../../../../../packages/application/src/transfer-query-validation.ts';
import { businessDate, entityId, type EntityKind } from '../../../../../../packages/domain/src/values.ts';
import { salesListResponse } from '../../../../src/sales/response-validation.ts';
import { transferListResponse, transferDetailResponse } from '../../../../src/transfers/response-validation.ts';
import type { SalesListQuery } from '../../../../src/sales/contracts.ts';
import type { TransferListQuery } from '../../../../src/transfers/contracts.ts';
import { createHttpJsonQuery, type HttpQueryOptions } from '../../../../src/transport/http-query.ts';
import type { QueryRead } from '../../../../src/loading/latest-query.ts';
type Wire<T> = T extends bigint ? string : T extends string|number|boolean|null ? T : T extends readonly (infer V)[] ? readonly Wire<V>[] : T extends object ? {readonly [K in keyof T]:Wire<T[K]>} : T;
export type NormalSalesPage=Wire<SalesUnifiedListPage>;
export type NormalSalesRow=Wire<SalesUnifiedSummary>;
export type NormalTransferPage=Wire<TransferUnifiedListPage>;
export type NormalTransferRow=Wire<TransferUnifiedSummary>;
const identityFields=['dataset','batchId','documentId','effectiveVersion','productSummary'];
const salesFields=['id','number','businessType','businessDate','hallId','salespersonId','customerId','warehouseId','status','version','grossAmount','orderDiscount','netDue','responsibleStaffId','hallName','warehouseName','customerName','salespersonName','responsibleName','createdByName','quantity','incomingQuantity','outgoingQuantity','updatedAt'];
const transferFields=['id','number','businessDate','fromWarehouseId','toWarehouseId','status','version','createdByAccountId','createdAt','updatedAt','responsibleStaffId','fromWarehouseName','toWarehouseName','fromHallName','toHallName','createdByName','approvedByName','responsibleName','totalQuantity'];
const salesTotals=['quantity','incomingQuantity','outgoingQuantity','grossAmount','orderDiscount','netDue'];
function invalid():never{throw new TypeError('Invalid exact26 normal document list.');}
function record(value:unknown,fields:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)invalid();const row=value as Record<string,unknown>;if(Object.keys(row).length!==fields.length||fields.some(key=>!Object.hasOwn(row,key)))invalid();return row;}
function text(value:unknown):asserts value is string{if(typeof value!=='string')invalid();}
function nullableText(value:unknown){if(value!==null)text(value);}
function uuid(value:unknown):asserts value is string{text(value);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value))invalid();}
function id(kind:EntityKind,value:unknown){text(value);entityId(kind,value);}
function nullableId(kind:EntityKind,value:unknown){if(value!==null)id(kind,value);}
function integer(value:unknown){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1)invalid();}
function exact(value:unknown,unsigned=false):asserts value is string{text(value);if(value.length>100||!(unsigned?/^(?:0|[1-9]\d*)$/:/^(?:0|[1-9]\d*|-[1-9]\d*)$/).test(value))invalid();}
function nullableExact(value:unknown,unsigned=false){if(value!==null)exact(value,unsigned);}
function nullableDate(value:unknown){if(value!==null){text(value);businessDate(value);}}
function nullableStamp(value:unknown){if(value===null)return;text(value);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))invalid();}
function products(value:unknown){const row=record(value,['productCount','items','hasMore']);nullableExact(row.productCount,true);if(!Array.isArray(row.items)||row.items.length>3||typeof row.hasMore!=='boolean')invalid();const ids=new Set<string>();for(const item of row.items){const product=record(item,['productId','productCodeSnapshot','productNameSnapshot']);nullableId('product',product.productId);nullableText(product.productCodeSnapshot);nullableText(product.productNameSnapshot);if(product.productId!==null){text(product.productId);if(ids.has(product.productId))invalid();ids.add(product.productId);}}if(row.productCount!==null){exact(row.productCount,true);if(BigInt(row.productCount)<BigInt(row.items.length)||row.hasMore!==(BigInt(row.productCount)>BigInt(row.items.length)))invalid();}}
function categories(value:unknown,dataset:unknown,metric:'QUANTITY'|'PRODUCT_COUNT',limit=3,unknownOrdinaryQuantity=false){
 const hasCount=!!value&&typeof value==='object'&&Object.hasOwn(value,'categoryCount');const row=record(value,['basis','metric','items','hasMore',...(hasCount?['categoryCount']:[])]);
 if(row.basis!==(dataset==='LIVE'&&!unknownOrdinaryQuantity?'CURRENT':'UNKNOWN')||row.metric!==metric||!Array.isArray(row.items)||row.items.length>limit||typeof row.hasMore!=='boolean')invalid();
 if(row.basis==='UNKNOWN'&&(row.items.length!==0||row.hasMore))invalid();
 if(hasCount){if(row.basis==='UNKNOWN'){if(row.categoryCount!==null)invalid();}else{exact(row.categoryCount,true);const count=BigInt(row.categoryCount);if(BigInt(row.items.length)!==(count>BigInt(limit)?BigInt(limit):count)||row.hasMore!==(count>BigInt(row.items.length)))invalid();}}
 const seen=new Set<unknown>();for(const item of row.items){const entry=record(item,['categoryId','categoryName','value']);nullableId('category',entry.categoryId);nullableText(entry.categoryName);if((entry.categoryId===null)!==(entry.categoryName===null)||seen.has(entry.categoryId))invalid();seen.add(entry.categoryId);exact(entry.value,metric==='PRODUCT_COUNT');if(BigInt(entry.value)===0n)invalid();}
}
function categoryFields(value:unknown,metric:'QUANTITY'|'PRODUCT_COUNT'):string[]{if(value&&typeof value==='object'&&Object.hasOwn(value,'categorySummary')){const row=value as Record<string,unknown>;categories(row.categorySummary,row.dataset,metric,3,row.dataset==='LIVE'&&metric==='QUANTITY'&&row.quantity===null&&row.incomingQuantity===null&&row.outgoingQuantity===null);return ['categorySummary'];}return [];}
/** Version belongs to row identity too; different datasets never collapse the same UUID. */
export function documentRowKey(row:Pick<DocumentListIdentity,'dataset'|'batchId'|'documentId'|'effectiveVersion'>):string{return JSON.stringify([row.dataset,row.batchId,row.documentId,row.effectiveVersion]);}
function identity(row:Record<string,unknown>){if(row.dataset!=='LIVE'&&row.dataset!=='HISTORY')invalid();uuid(row.documentId);integer(row.effectiveVersion);if(row.documentId!==row.id||row.effectiveVersion!==row.version)invalid();if(row.dataset==='LIVE'){if(row.batchId!==null)invalid();}else uuid(row.batchId);products(row.productSummary);return JSON.stringify([row.dataset,row.batchId,row.documentId,row.effectiveVersion]);}
function page(value:unknown,p:{page:number;pageSize:number},totalFields:readonly string[]){const row=record(value,['page','pageSize','exactTotal','items','historyCoverage','totals']);integer(row.page);integer(row.pageSize);exact(row.exactTotal,true);if(row.page!==p.page||row.pageSize!==p.pageSize||!Array.isArray(row.items)||row.items.length>p.pageSize)invalid();const remain=BigInt(row.exactTotal)-BigInt(p.page-1)*BigInt(p.pageSize),expected=remain<0n?0n:remain>BigInt(p.pageSize)?BigInt(p.pageSize):remain;if(BigInt(row.items.length)!==expected)invalid();if(!['PUBLISHED_AUTHORIZED','NOT_PUBLISHED','AUTHORIZATION_UNAVAILABLE'].includes(String(row.historyCoverage)))invalid();const totals=record(row.totals,totalFields);for(const field of totalFields)nullableExact(totals[field],field==='incomingQuantity'||field==='outgoingQuantity');return {row,items:row.items,totals};}
function salesQuantities(row:Record<string,unknown>){for(const field of ['quantity','incomingQuantity','outgoingQuantity'])nullableExact(row[field],field!=='quantity');const values=[row.quantity,row.incomingQuantity,row.outgoingQuantity];if(values.some(value=>value===null)){if(!values.every(value=>value===null))invalid();}else if(BigInt(String(row.quantity))!==BigInt(String(row.outgoingQuantity))-BigInt(String(row.incomingQuantity)))invalid();}
function nativeFields(row:Record<string,unknown>,keys:readonly string[]){return Object.fromEntries(keys.map(key=>[key,row[key]]));}
export function normalSalesResponse(value:unknown,p:Readonly<SalesListQuery>):NormalSalesPage{
 const {row:envelope,items,totals}=page(value,p,salesTotals),seen=new Set<string>();salesQuantities(totals);
 for(const value of items){const history=!!value&&typeof value==='object'&&'dataset'in value&&value.dataset==='HISTORY';const row=record(value,[...salesFields,...historicalHallFields(value),...identityFields,...categoryFields(value,'QUANTITY'),...(history?['createdLocalAt','updatedLocalAt']:[])]),key=identity(row);if(history&&envelope.historyCoverage!=='PUBLISHED_AUTHORIZED')invalid();if(seen.has(key))invalid();seen.add(key);
  if(!history){salesListResponse({page:1,pageSize:p.pageSize,exactTotal:'1',items:[nativeFields(row,[...salesFields,...historicalHallFields(row)])]},{...p,page:1});continue;}
  if((value as Record<string,unknown>).dataset!=='HISTORY')invalid();
  id('sales',row.id);text(row.number);nullableDate(row.businessDate);nullableStamp(row.updatedAt);nullableText(row.createdLocalAt);nullableText(row.updatedLocalAt);integer(row.version);
  if(!['SALE','RETURN','EXCHANGE'].includes(String(row.businessType))||!['DRAFT','APPROVED','VOID'].includes(String(row.status)))invalid();
  nullableId('hall',row.hallId);if(historicalHallFields(row).length)validateHistoricalHall(row.historicalHallEvidence,row.hallId,row.warehouseId,row.historicalHallDiffersFromCurrent);id('warehouse',row.warehouseId);id('customer',row.customerId);nullableId('staff',row.salespersonId);nullableId('staff',row.responsibleStaffId);
  for(const label of ['hallName','warehouseName','customerName','salespersonName','responsibleName','createdByName'])nullableText(row[label]);salesQuantities(row);for(const field of ['grossAmount','orderDiscount','netDue'])nullableExact(row[field]);
  const f=p.filter;for(const [expected,actual] of [[f.statuses,row.status],[f.businessTypes,row.businessType],[f.hallIds,row.hallId],[f.salespersonIds,row.salespersonId],[f.customerIds,row.customerId],[f.warehouseIds,row.warehouseId]] as const)if(expected.length&&!(expected as readonly unknown[]).includes(actual))invalid();
  if((f.startDate!==null&&(row.businessDate===null||String(row.businessDate)<f.startDate))||(f.endDate!==null&&(row.businessDate===null||String(row.businessDate)>f.endDate))||(f.number!==null&&!row.number.toLowerCase().includes(f.number.toLowerCase())))invalid();
 }
 return value as NormalSalesPage;
}
export function normalTransferResponse(value:unknown,p:Readonly<TransferListQuery>):NormalTransferPage{
 const {row:envelope,items}=page(value,p,['totalQuantity']),seen=new Set<string>();
 for(const value of items){const history=!!value&&typeof value==='object'&&'dataset'in value&&value.dataset==='HISTORY';const row=record(value,[...transferFields,...identityFields,...categoryFields(value,'PRODUCT_COUNT'),...(history?['createdLocalAt','updatedLocalAt']:[])]),key=identity(row);if(history&&envelope.historyCoverage!=='PUBLISHED_AUTHORIZED')invalid();if(seen.has(key))invalid();seen.add(key);
  if(!history){transferListResponse({page:1,pageSize:p.pageSize,exactTotal:'1',items:[nativeFields(row,transferFields)]},{...p,page:1});continue;}
  id('transfer',row.id);text(row.number);nullableDate(row.businessDate);if(row.createdByAccountId!==null)invalid();nullableStamp(row.createdAt);nullableStamp(row.updatedAt);nullableText(row.createdLocalAt);nullableText(row.updatedLocalAt);integer(row.version);if(!['DRAFT','APPROVED','VOID'].includes(String(row.status)))invalid();
  id('warehouse',row.fromWarehouseId);id('warehouse',row.toWarehouseId);nullableId('staff',row.responsibleStaffId);for(const label of ['fromWarehouseName','toWarehouseName','fromHallName','toHallName','createdByName','approvedByName','responsibleName'])nullableText(row[label]);nullableExact(row.totalQuantity);
  const f=p.filter;for(const [expected,actual] of [[f.statuses,row.status],[f.fromWarehouseIds,row.fromWarehouseId],[f.toWarehouseIds,row.toWarehouseId]] as const)if(expected.length&&!(expected as readonly unknown[]).includes(actual))invalid();
  if((f.startDate!==null&&(row.businessDate===null||String(row.businessDate)<f.startDate))||(f.endDate!==null&&(row.businessDate===null||String(row.businessDate)>f.endDate))||(f.number!==null&&!row.number.toLowerCase().includes(f.number.toLowerCase())))invalid();
 }
 return value as NormalTransferPage;
}
export function createNormalListReader(options:HttpQueryOptions){const http=createHttpJsonQuery({...options,fetch:(input,init)=>{const headers=new Headers(init.headers);headers.set('x-naijue-document-summary','category-v2');return options.fetch(input,{...init,headers});}});return Object.freeze({readTransferCategories(read:QueryRead<{transferId:string}>){const p={transferId:entityId('transfer',read.parameters.transferId)};return http.post('/transfers/detail/query',p,read.signal,value=>{if(!value||typeof value!=='object')invalid();const {categorySummary,...base}=value as Record<string,unknown>;const detail=transferDetailResponse(base,p);if(categorySummary!==undefined)categories(categorySummary,'LIVE','PRODUCT_COUNT',2000);return {documentId:detail.document.header.id,effectiveVersion:detail.document.header.version,summary:categorySummary as NormalTransferRow['categorySummary']};});},readSales(read:QueryRead<SalesListQuery>){const p=parseSalesListQuery({...read.parameters,filter:{...read.parameters.filter}});return http.post('/sales/query',p,read.signal,value=>normalSalesResponse(value,p));},readTransfers(read:QueryRead<TransferListQuery>){const p=parseTransferListQuery({...read.parameters,filter:{...read.parameters.filter}});return http.post('/transfers/query',p,read.signal,value=>normalTransferResponse(value,p));}});}

// Ordinary27 is an explicit host-selected lane, never a relabel of the legacy oracle.
import type { OrdinaryDocumentPage, OrdinarySalesSummary, OrdinaryTransferSummary, OrdinaryDocumentTotals, OrdinarySalesTotals, OrdinarySalesTotalsQuery, OrdinaryTransferTotalsQuery } from '../../../../../../packages/application/src/ordinary-document-query-ports.ts';
import { parseOrdinarySalesTotalsQuery, parseOrdinaryTransferTotalsQuery } from '../../../../../../packages/application/src/ordinary-document-query-validation.ts';
export type OrdinarySalesPage=Wire<OrdinaryDocumentPage<OrdinarySalesSummary>>;
export type OrdinaryTransferPage=Wire<OrdinaryDocumentPage<OrdinaryTransferSummary>>;
export type OrdinarySalesTotalsPage=Wire<OrdinaryDocumentTotals<OrdinarySalesTotals>>;
export type OrdinaryTransferTotalsPage=Wire<OrdinaryDocumentTotals<{readonly totalQuantity:bigint}>>;
function readRevision(value:unknown):asserts value is string {if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))invalid();}
function ordinaryPage(value:unknown,p:{page:number;pageSize:number}) {
 const row=record(value,['profile','page','pageSize','exactTotal','readRevision','items']);
 if(row.profile!=='ORDINARY_DOCUMENT_LIST_V1')invalid();readRevision(row.readRevision);
 integer(row.page);integer(row.pageSize);exact(row.exactTotal,true);
 if(row.page!==p.page||row.pageSize!==p.pageSize||!Array.isArray(row.items))invalid();
 const remaining=BigInt(row.exactTotal)-BigInt(p.page-1)*BigInt(p.pageSize),count=remaining<0n?0n:remaining>BigInt(p.pageSize)?BigInt(p.pageSize):remaining;
 if(BigInt(row.items.length)!==count)invalid();
 for(const item of row.items){if(!item||typeof item!=='object'||item.dataset!=='LIVE'||item.batchId!==null||!Object.hasOwn(item,'categorySummary'))invalid();const summary=item.categorySummary;if(!summary||typeof summary!=='object'||!Object.hasOwn(summary,'categoryCount'))invalid();}
 return row;
}
export function ordinarySalesResponse(value:unknown,p:Readonly<SalesListQuery>):OrdinarySalesPage {
 const row=ordinaryPage(value,p);
 // Reuse strict ordinary row/filter validation, not the legacy envelope or history decoder.
 const seen=new Set<string>();for(const value of row.items as unknown[]){const item=record(value,[...salesFields,...historicalHallFields(value),...identityFields,...categoryFields(value,'QUANTITY')]);const key=identity(item);if(seen.has(key))invalid();seen.add(key);salesListResponse({page:1,pageSize:p.pageSize,exactTotal:'1',items:[nativeFields(item,[...salesFields,...historicalHallFields(item)])]},{...p,page:1});}
 return value as OrdinarySalesPage;
}
export function ordinaryTransferResponse(value:unknown,p:Readonly<TransferListQuery>):OrdinaryTransferPage {
 const row=ordinaryPage(value,p),seen=new Set<string>();for(const value of row.items as unknown[]){const item=record(value,[...transferFields,...identityFields,...categoryFields(value,'PRODUCT_COUNT')]);const key=identity(item);if(seen.has(key))invalid();seen.add(key);transferListResponse({page:1,pageSize:p.pageSize,exactTotal:'1',items:[nativeFields(item,transferFields)]},{...p,page:1});}
 return value as OrdinaryTransferPage;
}
function ordinaryTotals(value:unknown,expectedRevision:string,fields:readonly string[]){readRevision(expectedRevision);const row=record(value,['profile','readRevision','exactTotal','totals']);if(row.profile!=='ORDINARY_DOCUMENT_TOTALS_V1'||row.readRevision!==expectedRevision)invalid();exact(row.exactTotal,true);const totals=record(row.totals,fields);return totals;}
export function ordinarySalesTotalsResponse(value:unknown,expectedRevision:string):OrdinarySalesTotalsPage {const totals=ordinaryTotals(value,expectedRevision,salesTotals);salesQuantities(totals);for(const field of ['grossAmount','orderDiscount','netDue'])exact(totals[field]);return value as OrdinarySalesTotalsPage;}
export function ordinaryTransferTotalsResponse(value:unknown,expectedRevision:string):OrdinaryTransferTotalsPage {const totals=ordinaryTotals(value,expectedRevision,['totalQuantity']);exact(totals.totalQuantity,true);return value as OrdinaryTransferTotalsPage;}
export function createOrdinaryListReader(options:HttpQueryOptions){
 const http=createHttpJsonQuery({...options,fetch:(input,init)=>{const headers=new Headers(init.headers);headers.set('x-naijue-document-list','ordinary-v1');headers.set('x-naijue-document-summary','category-v2');return options.fetch(input,{...init,headers});}});
 return Object.freeze({
 readSales(read:QueryRead<SalesListQuery>){const p=parseSalesListQuery({...read.parameters,filter:{...read.parameters.filter}});return http.post('/sales/query',p,read.signal,value=>ordinarySalesResponse(value,p));},
 readTransfers(read:QueryRead<TransferListQuery>){const p=parseTransferListQuery({...read.parameters,filter:{...read.parameters.filter}});return http.post('/transfers/query',p,read.signal,value=>ordinaryTransferResponse(value,p));},
 readSalesTotals(read:QueryRead<OrdinarySalesTotalsQuery>){const p=parseOrdinarySalesTotalsQuery({...read.parameters,filter:{...read.parameters.filter}});return http.post('/sales/totals/query',p,read.signal,value=>ordinarySalesTotalsResponse(value,p.expectedRevision));},
 readTransferTotals(read:QueryRead<OrdinaryTransferTotalsQuery>){const p=parseOrdinaryTransferTotalsQuery({...read.parameters,filter:{...read.parameters.filter}});return http.post('/transfers/totals/query',p,read.signal,value=>ordinaryTransferTotalsResponse(value,p.expectedRevision));},
 });
}
