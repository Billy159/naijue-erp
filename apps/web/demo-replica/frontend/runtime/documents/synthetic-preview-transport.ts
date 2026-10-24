import {DomainError} from '../../../../../../packages/domain/src/errors.ts';
import {HttpQueryError} from '../../../../src/transport/http-query.ts';
import {entityId} from '../../../../../../packages/domain/src/values.ts';
import {parseSalesListQuery,parseSalesDetailQuery} from '../../../../../../packages/application/src/sales-query-validation.ts';
import {parseTransferListQuery,parseTransferDetailQuery} from '../../../../../../packages/application/src/transfer-query-validation.ts';
import {parseSalesFilterReferenceQuery} from '../../../../../../packages/application/src/sales-reference-query-validation.ts';
import {parseCurrentFormProductQuery,parseCurrentFormSkuBatchQuery,parseCurrentFormBarcodeQuery} from '../../../../../../packages/application/src/current-form-validation.ts';
import {parseDictionaryListQuery,validateDictionaryPage,validateDictionarySizeGroup} from '../../../../../../packages/application/src/dictionary-read-validation.ts';
import type {CurrentFormContext,CurrentFormSku} from '../../../../../../packages/application/src/current-form-ports.ts';
import {createCurrentFormHttpReader} from '../../../../src/current-form/http-reader.ts';
import {createSalesPreparationHttpClient} from '../../../../src/current-form/sales-create.ts';
import {createTransferPreparationHttpClient} from '../../../../src/current-form/transfer-create.ts';
import {validateSalesCommand} from '../../../../src/sales/commands/validation.ts';
import {validateTransferCommand} from '../../../../src/transfers/commands/validation.ts';
import {salesDetailResponse,salesReferencesResponse} from '../../../../src/sales/response-validation.ts';
import {transferDetailResponse} from '../../../../src/transfers/response-validation.ts';
import type {SalesDetailDto} from '../../../../src/sales/contracts.ts';
import type {TransferDetailDto} from '../../../../src/transfers/contracts.ts';
import {normalSalesResponse,normalTransferResponse,type NormalSalesRow,type NormalTransferRow} from './normal-list-reader.ts';
import {detail as declaredTransferFixture} from '../../../../src/transfers/tests/fixtures.ts';

interface Options{readonly syntheticOnly:true;readonly origin:string;readonly existingFetch:(input:string,init:RequestInit)=>Promise<Response>}
const paths=new Set(['/sales/query','/transfers/query','/sales/detail/query','/transfers/detail/query','/current-form/products/query','/current-form/sku-batch/query','/current-form/barcode/query','/dictionary-read/size-groups/query','/sales/references/query','/sales/commands','/transfers/commands','/sales/prepare-existing','/transfers/prepare-existing','/sales/history/query','/transfers/history/query']);
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-data-source':'SYNTHETIC-DOCUMENT-PREVIEW-ONLY'}});
const unavailable=(code='SYNTHETIC_DOCUMENT_OPERATION_NOT_DECLARED')=>json({error:{code,message:'Finite preview fixture does not provide this operation; no real service or alternative business store was called.'}},501);
class FixtureRejected extends Error{constructor(readonly response:Response){super('Original synthetic fixture rejected this operation.');}}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Invalid synthetic document input');return value as Record<string,unknown>;}
function text(value:unknown):string{if(typeof value!=='string')throw new TypeError('Missing declared synthetic text');return value;}
function items(value:unknown):Record<string,unknown>[]{const rows=object(value).items;if(!Array.isArray(rows))throw new TypeError('Missing finite fixture page');return rows.map(object);}
const salesFilter={startDate:null,endDate:null,statuses:[],businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[],number:null};
const transferFilter={startDate:null,endDate:null,statuses:[],fromWarehouseIds:[],toWarehouseIds:[],number:null};

/** C injects this only into its explicit synthetic preview. The original finite
 * fixture remains the sole SAVE/receipt store. No HTTP/network/storage fallback. */
export function createSyntheticDocumentPreviewTransport(options:Options){
 if(options.syntheticOnly!==true||options.origin!=='https://synthetic-management.invalid')throw new TypeError('Original explicit unified synthetic instance required');
 const http={origin:options.origin,basePath:'/api',fetch:options.existingFetch},current=createCurrentFormHttpReader(http);
 const original=declaredTransferFixture();
 // Explicit synthetic product/group binding uses the original fixture catalog,
 // including its complete four members. It is not reconstructed from two SKUs.
 const declaredGroups=original.catalog.sizeGroups.map(group=>({id:group.sizeGroupId,name:group.name,sizes:group.members.map(size=>({id:size.sizeId,name:size.name,displayOrder:size.displayOrder}))}));
 const declaredProductGroups=new Map(original.catalog.skus.map(sku=>[sku.productId,sku.sizeGroupId]));
 const prepared=new Map<string,{fingerprint:string;body:Promise<string>}>();
 const canHandle=(path:string,method:string)=>method==='POST'&&paths.has(path.startsWith('/api/')?path.slice(4):path);
 return Object.freeze({canHandle,async request(input:string|URL,init:RequestInit):Promise<Response>{
  const url=new URL(String(input)),path=url.pathname.slice(4);
  if(url.origin!==options.origin||url.username||url.password||url.search||url.hash||!url.pathname.startsWith('/api/')||!canHandle(path,init.method??'GET'))throw new TypeError('Closed synthetic document preview route');
  const signal=init.signal??new AbortController().signal,active=()=>{if(signal.aborted)throw new DOMException('Synthetic document read aborted','AbortError');};
  const load=async(leaf:string,body:unknown,method='POST')=>{active();const request:RequestInit={...init,method};if(method==='POST')request.body=JSON.stringify(body);else delete request.body;const response=await options.existingFetch(options.origin+'/api'+leaf,request);active();if(!response.ok)throw new FixtureRejected(response);const value:unknown=await response.json();active();return value;};
  try{
   active();const auth=object(await load('/auth/session',null,'GET')),principal=object(auth.principal);let body:unknown;try{body=JSON.parse(String(init.body));}catch{return json({error:{code:'INVALID_SYNTHETIC_DOCUMENT_JSON'}},400);}
   const allProducts=async(context:CurrentFormContext)=>{const result=[];for(let page=1;;page++){const data=await current.readProducts({context,search:'',page,pageSize:20},signal);result.push(...data.items);if(BigInt(page)*20n>=data.exactTotal)break;}return result;};
   const allSkus=async(context:CurrentFormContext)=>{const result:CurrentFormSku[]=[];for(const product of await allProducts(context))for(let page=1;;page++){const data=await current.readProductSkus({context,productId:product.id,page,pageSize:20},signal);result.push(...data.items);if(BigInt(page)*20n>=data.exactTotal)break;}return result;};
   const creator=(header:Record<string,unknown>,names:Record<string,unknown>)=>{if(typeof names.createdByName==='string')return names.createdByName;if(header.createdByAccountId!==principal.accountId)throw new TypeError('No declared creator label');return text(principal.loginName);};
   const saleDetail=async(id:string):Promise<SalesDetailDto>=>{const value=object(await load('/sales/detail/query',{salesId:id})),document=object(value.document),header=object(document.header),names=object(value.referenceNames);let salespersonName=names.salespersonName;
    if(header.salespersonId!==null&&salespersonName==null){const refs=await current.readSalesReferences({kind:'salesperson',hallId:entityId('hall',text(header.hallId)),search:'',page:1,pageSize:20},signal);salespersonName=refs.items.find(row=>row.id===header.salespersonId)?.name;if(!salespersonName)throw new TypeError('No declared salesperson label');}
    return salesDetailResponse({...value,referenceNames:{...names,createdByName:creator(header,names),responsibleName:header.responsibleStaffId===null?null:names.responsibleName,salespersonName}},{salesId:parseSalesDetailQuery({salesId:id}).salesId});};
   const transferDetail=async(id:string):Promise<TransferDetailDto>=>{const value=object(await load('/transfers/detail/query',{transferId:id})),header=object(object(value.document).header),names=object(value.references);return transferDetailResponse({...value,references:{...names,createdByName:creator(header,names),responsibleName:header.responsibleStaffId===null?null:names.responsibleName}},parseTransferDetailQuery({transferId:id}));};
   const preview=(lines:readonly {skuId:string;snapshot:{productCode:string;productName:string}}[],skus:readonly CurrentFormSku[])=>{const products=new Map<string,{productId:string|null;productCodeSnapshot:string;productNameSnapshot:string}>();for(const line of lines){const sku=skus.find(sku=>sku.id===line.skuId);if(!sku)throw new TypeError('Undeclared synthetic product identity');if(!products.has(sku.productId))products.set(sku.productId,{productId:sku.productId,productCodeSnapshot:line.snapshot.productCode,productNameSnapshot:line.snapshot.productName});}return {productCount:String(products.size),items:[...products.values()].slice(0,3),hasMore:products.size>3};};
   const allListIds=async(kind:'sales'|'transfers')=>{const ids:string[]=[];for(let page=1;;page++){const data=object(await load('/'+kind+'/query',{filter:kind==='sales'?salesFilter:transferFilter,page,pageSize:200}));const rows=items(data);ids.push(...rows.map(row=>text(row.id)));if(!/^\d+$/.test(text(data.exactTotal)))throw new TypeError('Invalid finite total');if(BigInt(page)*200n>=BigInt(text(data.exactTotal)))break;}if(new Set(ids).size!==ids.length)throw new TypeError('Duplicate finite document ID');return ids;};
   if(path==='/sales/detail/query')return json(await saleDetail(parseSalesDetailQuery(body).salesId));
   if(path==='/transfers/detail/query')return json(await transferDetail(parseTransferDetailQuery(body).transferId));
   if(path==='/sales/query'){
    const query=parseSalesListQuery(body),skus=await allSkus({kind:'TRANSFER'}),rows:NormalSalesRow[]=[];
    for(const id of await allListIds('sales')){const d=await saleDetail(id);if(d.stockBasis!=='RUNTIME_LEDGER')continue;const h=d.document.header,n=d.referenceNames,lines=d.document.lines.filter(line=>!line.isGift),incoming=lines.reduce((sum,line)=>sum+(BigInt(line.quantity)<0n?-BigInt(line.quantity):0n),0n),outgoing=lines.reduce((sum,line)=>sum+(BigInt(line.quantity)>0n?BigInt(line.quantity):0n),0n);
     rows.push({id:h.id,number:h.number,businessType:h.businessType,businessDate:h.businessDate,hallId:h.hallId,salespersonId:h.salespersonId,customerId:h.customerId,warehouseId:h.warehouseId,status:h.status,version:h.version,grossAmount:h.grossAmount,orderDiscount:h.orderDiscount,netDue:h.netDue,responsibleStaffId:h.responsibleStaffId,...n,quantity:(outgoing-incoming).toString(),incomingQuantity:incoming.toString(),outgoingQuantity:outgoing.toString(),updatedAt:h.updatedAt,dataset:'LIVE',batchId:null,documentId:h.id,effectiveVersion:h.version,productSummary:preview(d.document.lines,skus)});
    }
    const f=query.filter,filtered=rows.filter(row=>(!f.startDate||row.businessDate!>=f.startDate)&&(!f.endDate||row.businessDate!<=f.endDate)&&(!f.number||row.number.toLowerCase().includes(f.number.toLowerCase()))&&(!f.statuses.length||f.statuses.includes(row.status))&&(!f.businessTypes.length||f.businessTypes.includes(row.businessType))&&(!f.hallIds.length||f.hallIds.includes(row.hallId))&&(!f.customerIds.length||f.customerIds.includes(row.customerId))&&(!f.warehouseIds.length||f.warehouseIds.includes(row.warehouseId))&&(!f.salespersonIds.length||row.salespersonId!==null&&f.salespersonIds.includes(row.salespersonId)));
    filtered.sort((a,b)=>b.updatedAt!.localeCompare(a.updatedAt!)||a.documentId.localeCompare(b.documentId));const totals=Object.fromEntries((['quantity','incomingQuantity','outgoingQuantity','grossAmount','orderDiscount','netDue'] as const).map(field=>[field,filtered.reduce((sum,row)=>sum+BigInt(row[field]!),0n).toString()]));
    return json(normalSalesResponse({page:query.page,pageSize:query.pageSize,exactTotal:String(filtered.length),items:filtered.slice((query.page-1)*query.pageSize,query.page*query.pageSize),historyCoverage:'NOT_PUBLISHED',totals},query));
   }
   if(path==='/transfers/query'){
    const query=parseTransferListQuery(body),rows:NormalTransferRow[]=[];
    for(const id of await allListIds('transfers')){const d=await transferDetail(id);if(d.stockBasis!=='RUNTIME_LEDGER')continue;const h=d.document.header,n=d.references,known=new Map(d.catalog.skus.map(sku=>[sku.skuId,sku]));const products=new Map<string,{productId:string;productCodeSnapshot:string;productNameSnapshot:string}>();for(const line of d.document.lines){const sku=known.get(line.skuId);if(!sku)throw new TypeError('Undeclared original transfer product');if(!products.has(sku.productId))products.set(sku.productId,{productId:sku.productId,productCodeSnapshot:line.snapshot.productCode,productNameSnapshot:line.snapshot.productName});}
     rows.push({id:h.id,number:h.number,businessDate:h.businessDate,fromWarehouseId:h.fromWarehouseId,toWarehouseId:h.toWarehouseId,status:h.status,version:h.version,createdByAccountId:h.createdByAccountId,createdAt:h.createdAt,updatedAt:h.updatedAt,responsibleStaffId:h.responsibleStaffId,...n,totalQuantity:d.document.lines.reduce((sum,line)=>sum+BigInt(line.quantity),0n).toString(),dataset:'LIVE',batchId:null,documentId:h.id,effectiveVersion:h.version,productSummary:{productCount:String(products.size),items:[...products.values()].slice(0,3),hasMore:products.size>3}});
    }
    const f=query.filter,filtered=rows.filter(row=>(!f.startDate||row.businessDate!>=f.startDate)&&(!f.endDate||row.businessDate!<=f.endDate)&&(!f.number||row.number.toLowerCase().includes(f.number.toLowerCase()))&&(!f.statuses.length||f.statuses.includes(row.status))&&(!f.fromWarehouseIds.length||f.fromWarehouseIds.includes(row.fromWarehouseId))&&(!f.toWarehouseIds.length||f.toWarehouseIds.includes(row.toWarehouseId)));
    filtered.sort((a,b)=>b.updatedAt!.localeCompare(a.updatedAt!)||a.documentId.localeCompare(b.documentId));return json(normalTransferResponse({page:query.page,pageSize:query.pageSize,exactTotal:String(filtered.length),items:filtered.slice((query.page-1)*query.pageSize,query.page*query.pageSize),historyCoverage:'NOT_PUBLISHED',totals:{totalQuantity:filtered.reduce((sum,row)=>sum+BigInt(row.totalQuantity!),0n).toString()}},query));
   }
   if(path==='/current-form/products/query'){
    const q=parseCurrentFormProductQuery(body),data=await current.readProducts(q,signal),skus=await allSkus(q.context);return json({...data,exactTotal:data.exactTotal.toString(),items:data.items.map(product=>{const group=declaredProductGroups.get(product.id);return group&&skus.filter(sku=>sku.productId===product.id).every(sku=>sku.sizeGroupId===group)?{...product,sizeGroupId:group}:product;})});
   }
   if(path==='/current-form/barcode/query'){parseCurrentFormBarcodeQuery(body);return unavailable('SYNTHETIC_BARCODE_BINDINGS_NOT_DECLARED');}
   if(path==='/current-form/sku-batch/query'){const q=parseCurrentFormSkuBatchQuery(body),skus=await allSkus(q.context),result=q.skuIds.map(id=>skus.find(sku=>sku.id===id));if(result.some(row=>!row))return unavailable('SYNTHETIC_SKU_ID_NOT_DECLARED');return json(result);}
   if(path==='/dictionary-read/size-groups/query'){
    const q=parseDictionaryListQuery(body),all=[];for(let page=1;;page++){const query={search:'',page,pageSize:100 as const},data=validateDictionaryPage(await load(path,query),query,validateDictionarySizeGroup);all.push(...data.items);if(page*100>=data.total)break;}
    for(const group of declaredGroups){const existing=all.find(row=>row.id===group.id);if(existing&&JSON.stringify(existing)!==JSON.stringify(group))return unavailable('SYNTHETIC_GROUP_ID_CONFLICT');if(!existing)all.push(group);}const filtered=all.filter(group=>group.name.toLowerCase().includes(q.search.toLowerCase()));return json(validateDictionaryPage({page:q.page,pageSize:q.pageSize,total:filtered.length,items:filtered.slice((q.page-1)*q.pageSize,q.page*q.pageSize)},q,validateDictionarySizeGroup));
   }
   if(path==='/sales/references/query'){
    const q=parseSalesFilterReferenceQuery(body),all=new Map<string,string>();
    if(q.kind==='hall'||q.kind==='salesperson')for(let page=1;;page++){const data=await current.readSalesReferences({kind:q.kind,hallId:null,search:q.search,page,pageSize:20},signal);for(const row of data.items)all.set(row.id,row.name);if(BigInt(page)*20n>=data.exactTotal)break;}
    else {const halls=[];for(let page=1;;page++){const data=await current.readSalesReferences({kind:'hall',hallId:null,search:'',page,pageSize:20},signal);halls.push(...data.items);if(BigInt(page)*20n>=data.exactTotal)break;}for(const hall of halls)for(let page=1;;page++){const data=await current.readSalesReferences({kind:q.kind,hallId:entityId('hall',hall.id),search:q.search,page,pageSize:20},signal);for(const row of data.items){if(all.has(row.id)&&all.get(row.id)!==row.name)throw new TypeError('Conflicting native fixture reference');all.set(row.id,row.name);}if(BigInt(page)*20n>=data.exactTotal)break;}}
    const filtered=[...all].map(([id,label])=>({id,label})).filter(row=>row.label.toLowerCase().includes(q.search.toLowerCase()));return json(salesReferencesResponse({page:q.page,exactTotal:String(filtered.length),items:filtered.slice((q.page-1)*q.pageSize,q.page*q.pageSize)},q));
   }
   if(path==='/sales/commands'||path==='/transfers/commands'){
    const kind=path.startsWith('/sales/')?'sales':'transfers',command=kind==='sales'?validateSalesCommand(body):validateTransferCommand(body);
    if(command.action!=='SAVE'||command.expectedVersion!==null)return unavailable('SYNTHETIC_EXISTING_CAS_OR_STATUS_NOT_IMPLEMENTED');
    if(!('proposal'in command))return options.existingFetch(String(url),init);
    const proposal=command.proposal;if(proposal.responsibleStaffId!==undefined)return unavailable('SYNTHETIC_RESPONSIBLE_SAVE_NOT_IMPLEMENTED');
    const key=kind+':'+command.requestKey,fingerprint=JSON.stringify(command),prior=prepared.get(key);if(prior&&prior.fingerprint!==fingerprint)return json({error:{code:'SYNTHETIC_REQUEST_KEY_REUSED'}},409);
    if(!prior){const entry={fingerprint,body:(async()=>{const skus=await allSkus({kind:'TRANSFER'}),resolve=(selection:typeof proposal.lines[number])=>{if('skuId'in selection){if(!skus.some(sku=>sku.id===selection.skuId))throw new TypeError('Undeclared exact synthetic SKU');return selection.skuId;}const spec=selection.spec,matches=skus.filter(sku=>sku.productId===spec.productId&&sku.colorId===spec.colorId&&sku.fitId===spec.fitId&&sku.sizeId===spec.sizeId);if(matches.length!==1)throw new TypeError('Synthetic fixture cannot create or guess a SKU');return matches[0]!.id;};
      if(kind==='transfers'){const original=validateTransferCommand(body);if(original.action!=='SAVE'||!('proposal'in original))throw new TypeError('Wrong transfer preview command');const {transferId,lines,...header}=original.proposal;if(transferId!==null||lines.some(line=>line.existingLineId!==null))throw new TypeError('Existing preview target not supported');const draft=await createTransferPreparationHttpClient(http).prepareCreate({...header,lines:lines.map(line=>({skuId:resolve(line),quantity:line.quantity}))},signal);return JSON.stringify({action:'SAVE',requestKey:command.requestKey,expectedVersion:null,draft});}
      const original=validateSalesCommand(body);if(original.action!=='SAVE'||!('proposal'in original))throw new TypeError('Wrong sales preview command');const {salesId,lines,settlements,...header}=original.proposal;if(salesId!==null||lines.some(line=>line.existingLineId!==null)||settlements.some(row=>row.existingSettlementId!==null))throw new TypeError('Existing preview target not supported');const draft=await createSalesPreparationHttpClient(http).prepareCreate({...header,lines:lines.map(line=>({skuId:resolve(line),quantity:line.quantity,dealPrice:line.dealPrice,pricingRule:line.pricingRule,discountTenths:line.discountTenths,isGift:line.isGift,zeroConfirmed:line.zeroConfirmed})),settlements:settlements.map(({existingSettlementId,...row})=>row)},signal);return JSON.stringify({action:'SAVE',requestKey:command.requestKey,expectedVersion:null,draft});
     })()};prepared.set(key,entry);void entry.body.catch(()=>{if(prepared.get(key)===entry)prepared.delete(key);});}
    const translated=await prepared.get(key)!.body;active();return options.existingFetch(String(url),{...init,body:translated});
   }
   return unavailable();
  }catch(error){if(error instanceof FixtureRejected)return error.response;if(signal.aborted)throw new DOMException('Synthetic document operation aborted','AbortError');if(error instanceof HttpQueryError){if(error.status!==null)return json({error:{code:error.code,message:'Original finite synthetic provider rejected this read.'}},error.status);throw error;}if(error instanceof DomainError)return json({error:{code:error.code,message:'Original document contract rejected this preview input.'}},400);if(error instanceof TypeError)return unavailable('SYNTHETIC_DOCUMENT_INPUT_OR_FACTS_UNAVAILABLE');throw error;}
 }});
}
