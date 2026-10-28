import {qaBarcodeSnapshot,qaPrices,type QaReferenceProfile} from '../../qa-reference-fixtures.mts';
import { CATALOGUE_PRICE_KEYS } from '../../../../../../packages/application/src/catalogue-price-input.ts';
import { parseProductQuery } from '../../../../../../packages/application/src/product-query-validation.ts';
import { parseProductBarcodeQuery,parseProductDetailsPageQuery,parseProductStockOverviewQuery } from '../../../../../../packages/application/src/product-details-query-validation.ts';
import type { ProductBarcodeDetails,ProductBarcodeSkuRow,ProductDefaultScheme,ProductWarehouseStockItem,ProductStockOverviewItem } from '../../../../../../packages/application/src/product-details-query-ports.ts';
import { productPricesResponse,productBarcodesResponse,productStockResponse,productStockOverviewResponse } from '../../../../src/products/product-page-validation.ts';
import { productBasicsResponse,productSpecificationsResponse,inventoryResponse } from '../../../../src/transport/response-validation.ts';
import { parseInventoryOutputQuery } from '../../../../../../packages/application/src/inventory-query-validation.ts';
import type { InventoryFilter } from '../../../../src/inventory/contracts.ts';
import { emptyInventoryFilter } from '../../../../src/inventory/contracts.ts';

/** Explicit PREVIEW ONLY declaration. No inferred codes, enabled flags or absent bindings. */
export interface SyntheticBarcodeSnapshot {
 readonly productId:string;readonly version:number;readonly defaultScheme:ProductDefaultScheme;
 readonly skus:readonly ProductBarcodeSkuRow[];readonly bindings:readonly ProductBarcodeDetails[];
}
export interface SyntheticProductPreviewOptions {
 readonly dataset?:QaReferenceProfile;
 /** The SAME existing unified fixture instance, before C's new details wrapper.
  * Do not supply global fetch, a production client or a newly generated identity map. */
 readonly existingFetch:(url:string,init:RequestInit)=>Promise<Response>;
 readonly origin:string;
 /** Explicit synthetic read revision; never represented as a database version. */
 readonly snapshotVersion:number;
 /** Only declared same-target native-ID barcode facts. Missing target is 501. */
 readonly barcodeSnapshots?:ReadonlyMap<string,SyntheticBarcodeSnapshot>;
 /** C explicitly declares UI-only unbound rows, not original codes/status/bindings. */
 readonly syntheticUnboundBarcodeFixture?:true;
 /** Explicit complete finite preview output, never a production fallback. */
 readonly syntheticFiniteInventoryOutput?:true;
}
const paths=new Set(['/inventory/output/query','/products/prices/query','/products/barcodes/query','/products/stock/query','/products/stock-overview/query']);
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-data-source':'SYNTHETIC-PREVIEW-ONLY'}});
const unavailable=()=>json({error:{code:'SYNTHETIC_PRODUCT_FACTS_NOT_DECLARED',message:'This synthetic target has no complete declared facts for this read; no real service was called.'}},501);
class FixtureResponse extends Error {readonly response:Response;constructor(response:Response){super('Existing synthetic fixture rejected this read.');this.response=response;}}

/** Isolated leaf: C injects into preview bootstrap only. No writes, network
 * fallback, storage, generated identities, fixture instance or eager reads. */
export function createSyntheticProductPreviewTransport(options:SyntheticProductPreviewOptions){
 if(!Number.isSafeInteger(options.snapshotVersion)||options.snapshotVersion<1||options.snapshotVersion>2147483647)throw new TypeError('Explicit synthetic snapshot revision required.');
 const canHandle=(path:string,method:string)=>method==='POST'&&paths.has(path.startsWith('/api/')?path.slice(4):path);
 return Object.freeze({canHandle,async request(input:URL|string,init:RequestInit):Promise<Response>{
  const url=new URL(String(input)),path=url.pathname.slice(4);
  if(url.origin!==options.origin||url.search||url.hash||!url.pathname.startsWith('/api/')||!canHandle(path,init.method??'GET'))return unavailable();
  let operationInit=init;
  const active=()=>{if(operationInit.signal?.aborted)throw new DOMException('Synthetic preview read aborted','AbortError');};
  active();let body:unknown;try{body=JSON.parse(String(init.body));}catch{return json({error:{code:'INVALID_PRODUCT_DETAILS_QUERY'}},400);}
  const load=async(leaf:string,parameters:unknown)=>{active();const response=await options.existingFetch(options.origin+'/api'+leaf,{...operationInit,method:'POST',body:JSON.stringify(parameters)});active();if(!response.ok)throw new FixtureResponse(response);const data:unknown=await response.json();active();return data;};
  try{
   if(path==='/inventory/output/query'){
    if(options.syntheticFiniteInventoryOutput!==true)return unavailable();
    parseInventoryOutputQuery(body);const {filter}=body as {filter:InventoryFilter};
    const cancellation=new AbortController();operationInit={...init,signal:init.signal?AbortSignal.any([init.signal,cancellation.signal]):cancellation.signal};
    const parameters={filter,page:1,pageSize:100 as const};
    const first=inventoryResponse(await load('/inventory/query',parameters),parameters);
    async function* frames(){
     const summary={readReference:first.readReference,exactTotalProducts:first.exactTotalProducts,warehouseLabels:first.warehouseLabels,allMatchesTotal:first.allMatchesTotal};
     yield {kind:'summary',...summary};let page=first,emitted=0,sum=0n;
     for(;;){
      active();if(page.exactTotalProducts!==summary.exactTotalProducts||page.readReference!==summary.readReference||JSON.stringify(page.warehouseLabels)!==JSON.stringify(summary.warehouseLabels)||JSON.stringify(page.allMatchesTotal)!==JSON.stringify(summary.allMatchesTotal))throw new Error('Synthetic finite output changed between pages.');
      for(const product of page.products){active();emitted++;sum+=BigInt(product.total.knownQuantity);yield {kind:'product',product};}
      if(emitted===summary.exactTotalProducts)break;
      if(!page.products.length||emitted>summary.exactTotalProducts)throw new Error('Synthetic finite output did not finish its declared scope.');
      const next={...parameters,page:page.page+1};page=inventoryResponse(await load('/inventory/query',next),next);
     }
     active();if(sum.toString()!==summary.allMatchesTotal.knownQuantity)throw new Error('Synthetic complete output summary mismatch.');
     yield {kind:'complete',readReference:summary.readReference,exactTotalProducts:summary.exactTotalProducts,emittedProducts:emitted,allMatchesTotal:summary.allMatchesTotal};
    }
    const iterator=frames(),encoder=new TextEncoder();let cancelled=false;
    const stream=new ReadableStream<Uint8Array>({async pull(controller){try{const item=await iterator.next();active();if(cancelled)return;if(item.done)controller.close();else controller.enqueue(encoder.encode(JSON.stringify(item.value)+'\n'));}catch(error){if(!cancelled)controller.error(error);}},cancel(){cancelled=true;cancellation.abort();void iterator.return(undefined).catch(()=>{});}});
    return new Response(stream,{headers:{'content-type':'application/x-ndjson','cache-control':'no-store','x-data-source':'SYNTHETIC-PREVIEW-ONLY','x-inventory-read-reference':first.readReference}});
   }
   if(path==='/products/prices/query'){
    const query=parseProductQuery(body),base=productBasicsResponse(await load('/products/basics/query',query),query);if(!base)return unavailable();
    const prices=options.dataset?qaPrices(query.productId)!.prices:Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key=>[key,key==='retail_price'?base.retailPrice:null]));
    return json(productPricesResponse({productId:query.productId,version:options.snapshotVersion,prices},query));
   }
   if(path==='/products/barcodes/query'){
    const query=parseProductBarcodeQuery(body);let snapshot=options.dataset?qaBarcodeSnapshot(query.productId):options.barcodeSnapshots?.get(query.productId);if(!snapshot&&options.syntheticUnboundBarcodeFixture!==true)return unavailable();if(snapshot&&snapshot.productId!==query.productId)return unavailable();
    const specs=productSpecificationsResponse(await load('/products/specifications/query',{productId:query.productId}),query);if(!specs)return unavailable();
    if(!snapshot){snapshot={productId:query.productId,version:1,defaultScheme:{state:'NOT_SET'},bindings:[],skus:specs.skus.map(sku=>({skuId:sku.id,skuCode:'SYNTHETIC-SKU-'+sku.id,skuEnabled:true,colorId:sku.colorId,colorLabel:specs.colors.find(x=>x.id===sku.colorId)?.label??null,fitId:sku.fitId,fitLabel:specs.fits.find(x=>x.id===sku.fitId)?.label??null,sizeId:sku.sizeId,sizeLabel:specs.sizes.find(x=>x.id===sku.sizeId)?.label??null,bindingCount:0,main:null,disabledMainCount:0,confirmedOldCount:0,firstConfirmedOld:null}))};}
    const actual=new Map(specs.skus.map(sku=>[sku.id,sku]));if(actual.size!==snapshot.skus.length||snapshot.skus.some(sku=>{const original=actual.get(sku.skuId);return !original||original.colorId!==sku.colorId||original.fitId!==sku.fitId||original.sizeId!==sku.sizeId;}))return unavailable();
    if(snapshot.bindings.some(binding=>{const sku=actual.get(binding.skuId);return !sku||sku.colorId!==binding.colorId||sku.fitId!==binding.fitId||sku.sizeId!==binding.sizeId;}))return unavailable();
    const start=(query.page-1)*query.pageSize;
    if(query.view==='SKU')return json(productBarcodesResponse({kind:'SKU_PAGE',productId:query.productId,version:snapshot.version,page:query.page,pageSize:query.pageSize,totalSkus:snapshot.skus.length,defaultScheme:snapshot.defaultScheme,items:snapshot.skus.slice(start,start+query.pageSize)},query));
    if(query.skuId&&!actual.has(query.skuId))return unavailable();
    const records=query.skuId?snapshot.bindings.filter(row=>row.skuId===query.skuId):snapshot.bindings;
    return json(productBarcodesResponse({productId:query.productId,version:snapshot.version,page:query.page,pageSize:query.pageSize,total:records.length,defaultScheme:snapshot.defaultScheme,items:records.slice(start,start+query.pageSize),...(query.skuId?{skuId:query.skuId}:{})},query));
   }
   const overview=path==='/products/stock-overview/query',query=overview?parseProductStockOverviewQuery(body):parseProductDetailsPageQuery(body);
   const specs=productSpecificationsResponse(await load('/products/specifications/query',{productId:query.productId}),query);if(!specs)return unavailable();
   const parameters={filter:{...emptyInventoryFilter(),products:[{id:query.productId,label:'Explicit synthetic target'}]},page:1,pageSize:100 as const};
   const inventory=inventoryResponse(await load('/inventory/query',parameters),parameters),matrix=inventory.products[0];
   if(inventory.exactTotalProducts!==1||!matrix||matrix.id!==query.productId)return unavailable();
   const actual=new Map(specs.skus.map(sku=>[sku.id,sku])),warehouses=new Map<string,string>(),keys=new Set<string>(),items:ProductWarehouseStockItem[]=[];
   for(const group of matrix.colorFits)for(const row of group.rows){warehouses.set(row.warehouse.id,row.warehouse.label);for(const [sizeId,cell] of Object.entries(row.cells)){
    if(cell.state==='not-applicable')continue;const sku=actual.get(cell.skuId),key=JSON.stringify([row.warehouse.id,cell.skuId]);
    if(!sku||sku.colorId!==group.color.id||sku.fitId!==group.fit?.id||sku.sizeId!==sizeId||keys.has(key))return unavailable();keys.add(key);
    items.push({warehouseId:row.warehouse.id,warehouseName:row.warehouse.label,skuId:cell.skuId,state:'KNOWN',quantity:cell.quantity});
   }}
   // Only this already-complete finite matrix supplies zero. Never fill a hole.
   if(!warehouses.size||items.length!==actual.size*warehouses.size)return unavailable();
   if(!overview){const page=query as ReturnType<typeof parseProductDetailsPageQuery>,start=(page.page-1)*page.pageSize;return json(productStockResponse({productId:query.productId,page:page.page,pageSize:page.pageSize,total:items.length,items:items.slice(start,start+page.pageSize)},page));}
   const scoped=query as ReturnType<typeof parseProductStockOverviewQuery>,totals:ProductStockOverviewItem[]=[...warehouses].map(([warehouseId,warehouseName])=>({warehouseId,warehouseName,state:'KNOWN',quantity:items.filter(item=>item.warehouseId===warehouseId).reduce((sum,item)=>sum+BigInt(item.quantity!),0n).toString(),unknownSkuCount:0}));
   const sum=totals.reduce((value,row)=>value+BigInt(row.quantity!),0n).toString();if(sum!==matrix.total.knownQuantity)return unavailable();
   const visible=scoped.warehouseMode==='ALL'?totals:totals.filter(row=>row.quantity!=='0');
   return json(productStockOverviewResponse({kind:'PRODUCT_STOCK_OVERVIEW_V1',productId:query.productId,warehouseMode:scoped.warehouseMode,readReference:inventory.readReference,coverage:'AUTHORIZED_SUBSET',counts:{authorizedWarehouses:totals.length,nonZeroWarehouses:totals.filter(row=>row.quantity!=='0').length,zeroWarehouses:totals.filter(row=>row.quantity==='0').length,unknownWarehouses:0,returnedWarehouses:visible.length},total:{state:'KNOWN',quantity:sum,unknownSkuWarehouseKeys:0},items:visible},scoped));
  }catch(error){active();if(error instanceof FixtureResponse)return error.response;if(error&&typeof error==='object'&&'code'in error&&error.code==='INVALID_PRODUCT_DETAILS_QUERY')return json({error:{code:'INVALID_PRODUCT_DETAILS_QUERY'}},400);throw error;}
 }});
}
