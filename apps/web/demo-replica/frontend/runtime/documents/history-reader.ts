import type { ImportedHistoryDetail,ImportedHistoryHeader,ImportedHistoryKind,ImportedHistoryDetailQuery,ImportedHistoryPage,ImportedHistoryLineCatalog,ImportedHistoryLine } from '../../../../../../packages/application/src/imported-history-query-ports.ts';
import {IMPORTED_HISTORY_CATALOG_MAX_GROUP_MEMBERS} from '../../../../../../packages/application/src/imported-history-query-ports.ts';
import { parseImportedHistoryDetailQuery,validateImportedHistoryLine,validateImportedHistorySettlement } from '../../../../../../packages/application/src/imported-history-query-validation.ts';
import { isExactHistoryMoney } from '../../../../../../packages/application/src/history-storage-contract.ts';
import { businessDate } from '../../../../../../packages/domain/src/values.ts';
import { createHttpJsonQuery,type HttpQueryOptions } from '../../../../src/transport/http-query.ts';
import type { QueryRead } from '../../../../src/loading/latest-query.ts';
export interface HistoryTarget {readonly kind:ImportedHistoryKind;readonly batchId:string;readonly documentId:string;readonly effectiveVersion:number}
function bad():never{throw new TypeError('Invalid historical detail response.');}
function record(value:unknown,fields:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==fields.length)bad();const row:Record<string,unknown>={};for(const field of fields){const d=Object.getOwnPropertyDescriptor(value,field);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();row[field]=d.value;}return row;}
function text(value:unknown):asserts value is string{if(typeof value!=='string'||value.includes('\0')||value.length>65536)bad();}
function nullableText(value:unknown){if(value!==null)text(value);}
function uuid(value:unknown):asserts value is string{text(value);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value))bad();}
function nullableId(value:unknown){if(value!==null)uuid(value);}
function positive(value:unknown):asserts value is number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>2147483645)bad();}
function stamp(value:unknown,instant:boolean){if(value===null)return;text(value);if(!(instant?/^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/:/^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}$/).test(value))bad();const ms=value.slice(0,23)+'Z';if(!Number.isFinite(Date.parse(ms))||new Date(ms).toISOString()!==ms)bad();}
function person(value:unknown){const row=record(value,['state','staffId']);if(!['UNKNOWN','UNRESOLVED','BOUND'].includes(String(row.state)))bad();nullableId(row.staffId);if((row.state==='BOUND')!==(row.staffId!==null))bad();}
/** Response shape/target validation only. Server grant validation is never simulated in the browser. */
function header(value:unknown,target:HistoryTarget):ImportedHistoryHeader{
 const kind=target.kind,keys=['dataset','kind','batchId','documentId','version','number','businessDate','sourceStatus','note','createdBy','approvedBy','responsibleStaffId','responsibleName','createdHallId','createdHallProvenance','createdLocalAt','updatedLocalAt','approvedLocalAt','createdInstant','updatedInstant','approvedInstant'];
 const row=record(value,[...keys,...(kind==='sales'?['businessType','hallId','customerId','warehouseId','salespersonId','grossAmount','orderDiscount','netDue']:['fromWarehouseId','toWarehouseId'])]);
 if(row.dataset!=='HISTORY'||row.kind!==kind||row.documentId!==target.documentId||row.batchId!==target.batchId)bad();uuid(row.documentId);uuid(row.batchId);positive(row.version);text(row.number);if(row.businessDate!==null){text(row.businessDate);businessDate(row.businessDate);}nullableText(row.note);if(!['DRAFT','APPROVED','VOID'].includes(String(row.sourceStatus)))bad();person(row.createdBy);person(row.approvedBy);nullableId(row.responsibleStaffId);nullableText(row.responsibleName);if(row.responsibleStaffId===null&&row.responsibleName!==null)bad();nullableId(row.createdHallId);if(!['ORIGINAL','MIGRATION_DERIVED','UNKNOWN'].includes(String(row.createdHallProvenance))||(row.createdHallProvenance==='UNKNOWN')!==(row.createdHallId===null))bad();
 for(const key of ['createdLocalAt','updatedLocalAt','approvedLocalAt'])stamp(row[key],false);for(const key of ['createdInstant','updatedInstant','approvedInstant'])stamp(row[key],true);
 if(kind==='sales'){if(!['SALE','RETURN','EXCHANGE'].includes(String(row.businessType)))bad();for(const key of ['hallId','customerId','warehouseId'])uuid(row[key]);nullableId(row.salespersonId);for(const key of ['grossAmount','orderDiscount','netDue'])if(!isExactHistoryMoney(row[key]))bad();}else{uuid(row.fromWarehouseId);uuid(row.toWarehouseId);}
 return value as ImportedHistoryHeader;
}
function page<T extends {id:string;lineNo:number}>(value:unknown,n:number,size:number,decode:(value:unknown)=>T):ImportedHistoryPage<T>{const row=record(value,['page','pageSize','total','items']);if(row.page!==n||row.pageSize!==size||typeof row.total!=='string'||!/^(0|[1-9]\d{0,127})$/.test(row.total)||!Array.isArray(row.items)||row.items.length>size)bad();const items=row.items.map(decode),remain=BigInt(row.total)-BigInt(n-1)*BigInt(size),expected=remain<0n?0n:remain>BigInt(size)?BigInt(size):remain;if(BigInt(items.length)!==expected||new Set(items.map(item=>item.id)).size!==items.length||items.some((item,index)=>index>0&&items[index-1]!.lineNo>=item.lineNo))bad();return {page:n,pageSize:size as ImportedHistoryPage<T>['pageSize'],total:row.total,items};}
/** New optional source-bound display projection; never a synthesized HISTORY grant. */
export function historyLineCatalogResponse(value:unknown,lines:readonly ImportedHistoryLine[]):ImportedHistoryLineCatalog{
 const row=record(value,['basis','items','groups']);if(row.basis!=='PUBLISHED_SOURCE_SKU_IDENTITY_V1'||!Array.isArray(row.items)||row.items.length!==lines.length||!Array.isArray(row.groups)||row.groups.length>lines.length)bad();
 const groups=row.groups.map(value=>{const group=record(value,['groupId','name','sizes']);uuid(group.groupId);text(group.name);if(!Array.isArray(group.sizes)||!group.sizes.length||group.sizes.length>IMPORTED_HISTORY_CATALOG_MAX_GROUP_MEMBERS)bad();const sizes=group.sizes.map(value=>{const size=record(value,['sizeId','name','displayOrder']);uuid(size.sizeId);text(size.name);if(typeof size.displayOrder!=='number'||!Number.isSafeInteger(size.displayOrder))bad();return {sizeId:size.sizeId,name:size.name,displayOrder:size.displayOrder};});if(new Set(sizes.map(size=>size.sizeId)).size!==sizes.length||sizes.some((size,index)=>index>0&&(sizes[index-1]!.displayOrder>size.displayOrder||sizes[index-1]!.displayOrder===size.displayOrder&&sizes[index-1]!.sizeId>=size.sizeId)))bad();return {groupId:group.groupId,name:group.name,sizes};});
 const byGroup=new Map(groups.map(group=>[group.groupId,group]));if(byGroup.size!==groups.length)bad();const used=new Set<string>();
 const items:ImportedHistoryLineCatalog['items']=row.items.map((value,index)=>{const item=record(value,['lineId','skuId','identity','sourceGroup']),line=lines[index];if(!line||item.lineId!==line.id||item.skuId!==line.skuId)bad();const state=Object.getOwnPropertyDescriptor(item.identity??{},'state')?.value,identity=record(item.identity,state==='UNKNOWN'?['state']:['state','productId','colorId','fitId','sizeId']);if(identity.state!=='UNKNOWN'&&identity.state!=='BOUND')bad();const groupState=Object.getOwnPropertyDescriptor(item.sourceGroup??{},'state')?.value,source=record(item.sourceGroup,groupState==='UNKNOWN'?['state']:['state','groupId']);if(source.state!=='UNKNOWN'&&source.state!=='BOUND')bad();const parsedIdentity:ImportedHistoryLineCatalog['items'][number]['identity']=identity.state==='UNKNOWN'?{state:'UNKNOWN'}:(()=>{for(const key of ['productId','colorId','fitId','sizeId'])uuid(identity[key]);return {state:'BOUND',productId:identity.productId as string,colorId:identity.colorId as string,fitId:identity.fitId as string,sizeId:identity.sizeId as string};})();
  let parsedGroup:ImportedHistoryLineCatalog['items'][number]['sourceGroup']={state:'UNKNOWN'};if(source.state==='BOUND'){uuid(source.groupId);if(parsedIdentity.state!=='BOUND'||!byGroup.get(source.groupId)?.sizes.some(size=>size.sizeId===parsedIdentity.sizeId))bad();used.add(source.groupId);parsedGroup={state:'BOUND',groupId:source.groupId};}return {lineId:line.id,skuId:line.skuId,identity:parsedIdentity,sourceGroup:parsedGroup};});
 if(used.size!==groups.length)bad();return {basis:'PUBLISHED_SOURCE_SKU_IDENTITY_V1',items,groups};
}
export function historyDetailResponse(value:unknown,target:HistoryTarget,q:ImportedHistoryDetailQuery):ImportedHistoryDetail{
 const hasCatalog=!!value&&typeof value==='object'&&Object.hasOwn(value,'lineCatalog');const row=record(value,['dataset','kind','document','lines','settlements',...(hasCatalog?['lineCatalog']:[])]);if(row.dataset!=='HISTORY'||row.kind!==target.kind)bad();const document=row.document===null?null:header(row.document,target);
 const lines=page(row.lines,q.linePage,q.linePageSize,item=>validateImportedHistoryLine(item,target.kind)),settlements=page(row.settlements,q.settlementPage,q.settlementPageSize,validateImportedHistorySettlement);
 if(document===null&&(lines.total!=='0'||settlements.total!=='0')||target.kind==='transfers'&&settlements.total!=='0')bad();
 return {dataset:'HISTORY',kind:target.kind,document,lines,settlements,...(hasCatalog?{lineCatalog:historyLineCatalogResponse(row.lineCatalog,lines.items)}:{})};
}
export function createHistoryReader(options:HttpQueryOptions){const http=createHttpJsonQuery(options);return Object.freeze({readDetail(target:HistoryTarget,read:QueryRead<ImportedHistoryDetailQuery>){const query=parseImportedHistoryDetailQuery({...read.parameters},target.kind);if(query.documentId!==target.documentId)bad();return http.post('/imported-history/'+target.kind+'/detail/query',query,read.signal,value=>historyDetailResponse(value,target,query));},
 /** A click-only identity lookup through the existing authorized detail read.
  * The response supplies the current batch/version, never the ledger event. */
 readTarget(kind:ImportedHistoryKind,read:QueryRead<{readonly documentId:string}>):Promise<HistoryTarget|null>{
  const query=parseImportedHistoryDetailQuery({documentId:read.parameters.documentId,linePage:1,linePageSize:20,settlementPage:1,settlementPageSize:20},kind);
  return http.post('/imported-history/'+kind+'/detail/query',query,read.signal,value=>{
   const hasCatalog=!!value&&typeof value==='object'&&Object.hasOwn(value,'lineCatalog');
   const row=record(value,['dataset','kind','document','lines','settlements',...(hasCatalog?['lineCatalog']:[])]);
   if(row.dataset!=='HISTORY'||row.kind!==kind)bad();
   if(row.document===null){
    const lines=page(row.lines,1,20,item=>validateImportedHistoryLine(item,kind)),settlements=page(row.settlements,1,20,validateImportedHistorySettlement);
    if(lines.total!=='0'||settlements.total!=='0')bad();
    if(hasCatalog)historyLineCatalogResponse(row.lineCatalog,lines.items);
    return null;
   }
   const candidate=row.document as Record<string,unknown>;uuid(candidate.batchId);positive(candidate.version);
   const target:HistoryTarget={kind,documentId:query.documentId,batchId:candidate.batchId,effectiveVersion:candidate.version};
   const detail=historyDetailResponse(value,target,query);if(!detail.document)bad();
   return {kind,documentId:detail.document.documentId,batchId:detail.document.batchId,effectiveVersion:detail.document.version};
  });
 }});}
export interface CompleteHistoryDocument {readonly document:ImportedHistoryHeader;readonly lines:ImportedHistoryDetail['lines']['items'];readonly settlements:ImportedHistoryDetail['settlements']['items'];readonly lineCatalog?:ImportedHistoryLineCatalog}
/** Explicit edit action only: consume all bounded pages before enabling a revision. Never replace from a partial page. */
export async function collectHistoryDocument(reader:ReturnType<typeof createHistoryReader>,target:HistoryTarget,read:QueryRead<ImportedHistoryDetailQuery>):Promise<CompleteHistoryDocument>{
 let catalogPresent:boolean|undefined;const catalogItems:ImportedHistoryLineCatalog['items'][number][]=[],catalogGroups=new Map<string,ImportedHistoryLineCatalog['groups'][number]>();
 let linePage=1,settlementPage=1,headerValue:ImportedHistoryHeader|null=null,lineTotal:string|null=null,settlementTotal:string|null=null;const lines:ImportedHistoryDetail['lines']['items'][number][]=[],settlements:ImportedHistoryDetail['settlements']['items'][number][]=[],lineIds=new Set<string>(),settlementIds=new Set<string>();let linesDone=false,settlementsDone=false;
 while(!linesDone||!settlementsDone){if(read.signal.aborted)throw read.signal.reason??new DOMException('已取消读取','AbortError');const data=await reader.readDetail(target,{...read,parameters:{documentId:target.documentId,linePage,linePageSize:200,settlementPage,settlementPageSize:200}});if(read.signal.aborted)throw read.signal.reason??new DOMException('已取消读取','AbortError');if(!data.document||data.document.version!==target.effectiveVersion)throw new Error('历史单据版本已更新，请返回列表重新查询。');if(headerValue&&JSON.stringify(headerValue)!==JSON.stringify(data.document))throw new Error('读取期间历史单据已变化，尚未进入修改。');headerValue=data.document;
  if(lineTotal!==null&&lineTotal!==data.lines.total||settlementTotal!==null&&settlementTotal!==data.settlements.total)throw new Error('历史明细数量已变化，尚未进入修改。');lineTotal=data.lines.total;settlementTotal=data.settlements.total;const present=data.lineCatalog!==undefined;if(catalogPresent!==undefined&&catalogPresent!==present)throw new Error('读取期间原规格资料已变化，尚未进入修改。');catalogPresent=present;if(data.lineCatalog){for(const group of data.lineCatalog.groups){const previous=catalogGroups.get(group.groupId);if(previous&&JSON.stringify(previous)!==JSON.stringify(group))throw new Error('原尺码组快照在读取期间发生矛盾。');catalogGroups.set(group.groupId,group);}if(!linesDone)catalogItems.push(...data.lineCatalog.items);}
  if(!linesDone){for(const item of data.lines.items){if(lineIds.has(item.id)||lines.length&&lines[lines.length-1]!.lineNo>=item.lineNo)bad();lineIds.add(item.id);lines.push(item);}linesDone=BigInt(lines.length)===BigInt(lineTotal);if(!linesDone)linePage++;}
  if(!settlementsDone){for(const item of data.settlements.items){if(settlementIds.has(item.id)||settlements.length&&settlements[settlements.length-1]!.lineNo>=item.lineNo)bad();settlementIds.add(item.id);settlements.push(item);}settlementsDone=BigInt(settlements.length)===BigInt(settlementTotal);if(!settlementsDone)settlementPage++;}
 }
 if(!headerValue)bad();return {document:headerValue,lines,settlements,...(catalogPresent?{lineCatalog:{basis:'PUBLISHED_SOURCE_SKU_IDENTITY_V1' as const,items:catalogItems,groups:[...catalogGroups.values()]}}:{})};
}
