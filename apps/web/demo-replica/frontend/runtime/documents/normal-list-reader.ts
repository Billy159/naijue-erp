import type { SalesUnifiedListPage, SalesUnifiedSummary, DocumentListIdentity } from '../../../../../../packages/application/src/sales-query-ports.ts';
import type { TransferUnifiedListPage, TransferUnifiedSummary } from '../../../../../../packages/application/src/transfer-query-ports.ts';
import { parseSalesListQuery } from '../../../../../../packages/application/src/sales-query-validation.ts';
import { parseTransferListQuery } from '../../../../../../packages/application/src/transfer-query-validation.ts';
import { businessDate, entityId, type EntityKind } from '../../../../../../packages/domain/src/values.ts';
import { salesListResponse } from '../../../../src/sales/response-validation.ts';
import { transferListResponse } from '../../../../src/transfers/response-validation.ts';
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
/** Version belongs to row identity too; different datasets never collapse the same UUID. */
export function documentRowKey(row:Pick<DocumentListIdentity,'dataset'|'batchId'|'documentId'|'effectiveVersion'>):string{return JSON.stringify([row.dataset,row.batchId,row.documentId,row.effectiveVersion]);}
function identity(row:Record<string,unknown>){if(row.dataset!=='LIVE'&&row.dataset!=='HISTORY')invalid();uuid(row.documentId);integer(row.effectiveVersion);if(row.documentId!==row.id||row.effectiveVersion!==row.version)invalid();if(row.dataset==='LIVE'){if(row.batchId!==null)invalid();}else uuid(row.batchId);products(row.productSummary);return JSON.stringify([row.dataset,row.batchId,row.documentId,row.effectiveVersion]);}
function page(value:unknown,p:{page:number;pageSize:number},totalFields:readonly string[]){const row=record(value,['page','pageSize','exactTotal','items','historyCoverage','totals']);integer(row.page);integer(row.pageSize);exact(row.exactTotal,true);if(row.page!==p.page||row.pageSize!==p.pageSize||!Array.isArray(row.items)||row.items.length>p.pageSize)invalid();const remain=BigInt(row.exactTotal)-BigInt(p.page-1)*BigInt(p.pageSize),expected=remain<0n?0n:remain>BigInt(p.pageSize)?BigInt(p.pageSize):remain;if(BigInt(row.items.length)!==expected)invalid();if(!['PUBLISHED_AUTHORIZED','NOT_PUBLISHED','AUTHORIZATION_UNAVAILABLE'].includes(String(row.historyCoverage)))invalid();const totals=record(row.totals,totalFields);for(const field of totalFields)nullableExact(totals[field],field==='incomingQuantity'||field==='outgoingQuantity');return {row,items:row.items,totals};}
function salesQuantities(row:Record<string,unknown>){for(const field of ['quantity','incomingQuantity','outgoingQuantity'])nullableExact(row[field],field!=='quantity');const values=[row.quantity,row.incomingQuantity,row.outgoingQuantity];if(values.some(value=>value===null)){if(!values.every(value=>value===null))invalid();}else if(BigInt(String(row.quantity))!==BigInt(String(row.outgoingQuantity))-BigInt(String(row.incomingQuantity)))invalid();}
function nativeFields(row:Record<string,unknown>,keys:readonly string[]){return Object.fromEntries(keys.map(key=>[key,row[key]]));}
export function normalSalesResponse(value:unknown,p:Readonly<SalesListQuery>):NormalSalesPage{
 const {row:envelope,items,totals}=page(value,p,salesTotals),seen=new Set<string>();salesQuantities(totals);
 for(const value of items){const history=!!value&&typeof value==='object'&&'dataset'in value&&value.dataset==='HISTORY';const row=record(value,[...salesFields,...identityFields,...(history?['createdLocalAt','updatedLocalAt']:[])]),key=identity(row);if(history&&envelope.historyCoverage!=='PUBLISHED_AUTHORIZED')invalid();if(seen.has(key))invalid();seen.add(key);
  if(!history){salesListResponse({page:1,pageSize:p.pageSize,exactTotal:'1',items:[nativeFields(row,salesFields)]},{...p,page:1});continue;}
  if((value as Record<string,unknown>).dataset!=='HISTORY')invalid();
  id('sales',row.id);text(row.number);nullableDate(row.businessDate);nullableStamp(row.updatedAt);nullableText(row.createdLocalAt);nullableText(row.updatedLocalAt);integer(row.version);
  if(!['SALE','RETURN','EXCHANGE'].includes(String(row.businessType))||!['DRAFT','APPROVED','VOID'].includes(String(row.status)))invalid();
  id('hall',row.hallId);id('warehouse',row.warehouseId);id('customer',row.customerId);nullableId('staff',row.salespersonId);nullableId('staff',row.responsibleStaffId);
  for(const label of ['hallName','warehouseName','customerName','salespersonName','responsibleName','createdByName'])nullableText(row[label]);salesQuantities(row);for(const field of ['grossAmount','orderDiscount','netDue'])nullableExact(row[field]);
  const f=p.filter;for(const [expected,actual] of [[f.statuses,row.status],[f.businessTypes,row.businessType],[f.hallIds,row.hallId],[f.salespersonIds,row.salespersonId],[f.customerIds,row.customerId],[f.warehouseIds,row.warehouseId]] as const)if(expected.length&&!(expected as readonly unknown[]).includes(actual))invalid();
  if((f.startDate!==null&&(row.businessDate===null||String(row.businessDate)<f.startDate))||(f.endDate!==null&&(row.businessDate===null||String(row.businessDate)>f.endDate))||(f.number!==null&&!row.number.toLowerCase().includes(f.number.toLowerCase())))invalid();
 }
 return value as NormalSalesPage;
}
export function normalTransferResponse(value:unknown,p:Readonly<TransferListQuery>):NormalTransferPage{
 const {row:envelope,items}=page(value,p,['totalQuantity']),seen=new Set<string>();
 for(const value of items){const history=!!value&&typeof value==='object'&&'dataset'in value&&value.dataset==='HISTORY';const row=record(value,[...transferFields,...identityFields,...(history?['createdLocalAt','updatedLocalAt']:[])]),key=identity(row);if(history&&envelope.historyCoverage!=='PUBLISHED_AUTHORIZED')invalid();if(seen.has(key))invalid();seen.add(key);
  if(!history){transferListResponse({page:1,pageSize:p.pageSize,exactTotal:'1',items:[nativeFields(row,transferFields)]},{...p,page:1});continue;}
  id('transfer',row.id);text(row.number);nullableDate(row.businessDate);if(row.createdByAccountId!==null)invalid();nullableStamp(row.createdAt);nullableStamp(row.updatedAt);nullableText(row.createdLocalAt);nullableText(row.updatedLocalAt);integer(row.version);if(!['DRAFT','APPROVED','VOID'].includes(String(row.status)))invalid();
  id('warehouse',row.fromWarehouseId);id('warehouse',row.toWarehouseId);nullableId('staff',row.responsibleStaffId);for(const label of ['fromWarehouseName','toWarehouseName','fromHallName','toHallName','createdByName','approvedByName','responsibleName'])nullableText(row[label]);nullableExact(row.totalQuantity);
  const f=p.filter;for(const [expected,actual] of [[f.statuses,row.status],[f.fromWarehouseIds,row.fromWarehouseId],[f.toWarehouseIds,row.toWarehouseId]] as const)if(expected.length&&!(expected as readonly unknown[]).includes(actual))invalid();
  if((f.startDate!==null&&(row.businessDate===null||String(row.businessDate)<f.startDate))||(f.endDate!==null&&(row.businessDate===null||String(row.businessDate)>f.endDate))||(f.number!==null&&!row.number.toLowerCase().includes(f.number.toLowerCase())))invalid();
 }
 return value as NormalTransferPage;
}
export function createNormalListReader(options:HttpQueryOptions){const http=createHttpJsonQuery(options);return Object.freeze({readSales(read:QueryRead<SalesListQuery>){const p=parseSalesListQuery({...read.parameters,filter:{...read.parameters.filter}});return http.post('/sales/query',p,read.signal,value=>normalSalesResponse(value,p));},readTransfers(read:QueryRead<TransferListQuery>){const p=parseTransferListQuery({...read.parameters,filter:{...read.parameters.filter}});return http.post('/transfers/query',p,read.signal,value=>normalTransferResponse(value,p));}});}
