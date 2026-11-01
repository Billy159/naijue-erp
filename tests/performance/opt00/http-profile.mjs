/** Pure synthetic HTTP DTOs for ORIGINAL application. No listener, database or write simulation. */
import {createFixture,syntheticId,dataHash,canonicalJson} from './fixture-generator.mjs';
import {BASELINE} from './scenario-spec.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {sha256} from './fixture-generator.mjs';
import {parseCurrentFormSkuBatchQuery,parseCurrentFormProductQuery,parseCurrentFormProductSkuQuery,parseCurrentSalesReferenceQuery,parseCurrentTransferWarehouseQuery} from '../../../packages/application/src/current-form-validation.ts';
import {parseSalesListQuery,parseSalesDetailQuery} from '../../../packages/application/src/sales-query-validation.ts';
import {parseTransferListQuery,parseTransferDetailQuery} from '../../../packages/application/src/transfer-query-validation.ts';
import {parseDictionaryListQuery} from '../../../packages/application/src/dictionary-read-validation.ts';
import {parseCatalogueSettingsListQuery} from '../../../packages/application/src/catalogue-settings-read-validation.ts';
export const PROFILE_SHAPES=Object.freeze({few:{products:3,lines:12},distinct30:{products:30,lines:120},lines200:{products:30,lines:200}});
const page=(items,q)=>({page:q.page,pageSize:q.pageSize,exactTotal:String(items.length),items:items.slice((q.page-1)*q.pageSize,q.page*q.pageSize)});
const dictPage=(items,q)=>({page:q.page,pageSize:q.pageSize,total:items.length,items:items.slice((q.page-1)*q.pageSize,q.page*q.pageSize)});
const omit=(row,names)=>Object.fromEntries(Object.entries(row).filter(([key])=>!names.includes(key)));
const ref=(id,name,extra={})=>({id,name,code:null,hallId:null,hallName:null,paymentMethodId:null,paymentMethodName:null,...extra});
export function createHttpProfile(kind,shape='distinct30'){
 if(!['sales','transfer'].includes(kind)||!Object.hasOwn(PROFILE_SHAPES,shape))throw new TypeError('Explicit synthetic kind/shape required');
 const fixture=createFixture(),dimensions=PROFILE_SHAPES[shape],principal=fixture.actors[0],id=syntheticId(kind,shape==='few'?0:shape==='distinct30'?1:2),h=fixture.halls[0],w=fixture.warehouses;
 const lines=Array.from({length:dimensions.lines},(_,i)=>{
  const p=i%dimensions.products,sku=fixture.skus[p*8+Math.floor(i/dimensions.products)%8],product=fixture.products[p],count=String(1+i%5);
  const snapshot={productCode:sku.productCode,productName:`SYNTHETIC 原单名 ${p}`,colorName:sku.colorName,fitName:sku.fitName,sizeName:sku.sizeName,barcode:null};
  const base={id:syntheticId(kind==='sales'?'salesLine':'transferLine',(shape==='few'?0:shape==='distinct30'?1000:2000)+i),[kind==='sales'?'salesId':'transferId']:id,lineNo:i+1,skuId:sku.id,quantity:count,snapshot,isCurrent:true};
  if(kind==='transfer')return base;
  const referencePrice=(BigInt(product.retailPriceMinor)+33n).toString(),isGift=i%19===18,discountTenths=!isGift&&i%5===0?85:null;
  const dealPrice=isGift?'0':discountTenths===null?(BigInt(product.retailPriceMinor)+11n).toString():((BigInt(referencePrice)*BigInt(discountTenths)+50n)/100n).toString();
  return {...base,referencePrice,dealPrice,pricingRule:discountTenths===null?'UNIT_PRICE':'DISCOUNT',discountTenths,zeroConfirmed:isGift,isGift,lineAmount:(BigInt(count)*BigInt(dealPrice)).toString(),allocatedDiscount:'0'};
 });
 const count=rows=>rows.reduce((sum,row)=>sum+BigInt(row.quantity),0n).toString(),allLineQuantity=count(lines),counted=kind==='sales'?lines.filter(row=>!row.isGift):lines,quantity=count(counted);
 const common={id,number:`OPT00-${kind.toUpperCase()}-${shape}`,businessDate:'2026-10-20',status:'DRAFT',version:1,responsibleStaffId:null,note:'SYNTHETIC OPT00 READ BASELINE ONLY',createdByAccountId:principal.accountId,createdHallId:null,createdAt:BASELINE.fixedClock,updatedAt:BASELINE.fixedClock,approvedByAccountId:null,approvedAt:null};
 let detail,listItem;
 if(kind==='sales'){
  const gross=lines.reduce((sum,row)=>sum+BigInt(row.lineAmount),0n).toString();
  const header={...common,businessType:'SALE',hallId:h.id,salespersonId:null,customerId:syntheticId('customer',0),warehouseId:w[0].id,grossAmount:gross,orderDiscount:'0',netDue:gross};
  const names={hallName:h.name,warehouseName:w[0].name,customerName:'SYNTHETIC 客户',salespersonName:null,responsibleName:null,createdByName:principal.loginName};
  detail={stockBasis:'RUNTIME_LEDGER',referenceNames:names,settlementNames:[],document:{header,lines,settlements:[]}};
  listItem={...omit(header,['note','createdByAccountId','createdHallId','createdAt','approvedByAccountId','approvedAt']),...names,quantity,incomingQuantity:'0',outgoingQuantity:quantity};
 }else{
  const header={...common,fromWarehouseId:w[0].id,toWarehouseId:w[1].id,createdRole:'ADMIN'};
  const names={fromWarehouseName:w[0].name,toWarehouseName:w[1].name,fromHallName:w[0].hallName,toHallName:w[1].hallName,createdByName:principal.loginName,approvedByName:null,responsibleName:null};
  const ids=new Set(lines.map(row=>row.skuId)),actual=fixture.skus.filter(s=>ids.has(s.id)),tuples=new Set(actual.map(s=>JSON.stringify([s.productId,s.colorId,s.fitId])));
  const catalogSkus=fixture.skus.filter(s=>tuples.has(JSON.stringify([s.productId,s.colorId,s.fitId]))).map(s=>({skuId:s.id,...omit(s,['id','skuCode','sizeName','barcodeAvailability'])}));
  const groupIds=new Set(catalogSkus.map(s=>s.sizeGroupId));
  const groups=fixture.groups.filter(g=>groupIds.has(g.id)).map(g=>({sizeGroupId:g.id,code:`OPT00-GROUP-${fixture.groups.indexOf(g)}`,name:g.name,members:g.sizes.map(s=>({sizeId:s.id,code:s.name,name:s.name,displayOrder:s.displayOrder}))}));
  detail={stockBasis:'RUNTIME_LEDGER',references:names,document:{header,lines},catalog:{skus:catalogSkus,sizeGroups:groups}};
  listItem={...omit(header,['note','createdHallId','createdRole','approvedByAccountId','approvedAt']),...names,totalQuantity:quantity};
 }
 const products=fixture.products.map(p=>({id:p.id,code:p.code,name:p.name,retailPrice:p.retailPrice,sizeGroupId:p.sizeGroupId,minimumPriceAvailability:'UNAVAILABLE'}));
 const salesReferences={hall:[ref(h.id,h.name,{hallId:h.id,hallName:h.name})],customer:[ref(syntheticId('customer',0),'SYNTHETIC 客户',{code:'OPT00-CUSTOMER'})],salesperson:[],warehouse:[ref(w[0].id,w[0].name,{hallId:h.id,hallName:h.name})],paymentMethod:[ref(syntheticId('paymentMethod',0),'SYNTHETIC 现金')],paymentAccount:[ref(syntheticId('paymentAccount',0),'SYNTHETIC 收款账户',{paymentMethodId:syntheticId('paymentMethod',0),paymentMethodName:'SYNTHETIC 现金'})]};
 const payload={format:'opt00-synthetic-http-profile-v1',datasetVersion:BASELINE.datasetVersion,logicalDataSha256:dataHash(fixture),kind,shape,principal,detail,listItem,products,skus:fixture.skus,sizeGroups:fixture.groups,fits:fixture.fits,warehouses:fixture.warehouses.map(row=>omit(row,['source'])),salesReferences,oracle:{productCount:dimensions.products,lineCount:lines.length,uniqueSkuCount:new Set(lines.map(l=>l.skuId)).size,allLineQuantity,quantity,expectedOriginalInitializationRequests:dimensions.products+3,dbTiming:null,saveAndApproval:'NOT_IMPLEMENTED_FAIL_CLOSED'},scope:'Real browser + synthetic HTTP only, NO real DB, NO write acceptance'};
 return {...payload,profileSha256:dataHash(payload)};
}
function salesMatches(row,f){return(!f.startDate||row.businessDate>=f.startDate)&&(!f.endDate||row.businessDate<=f.endDate)&&(!f.number||row.number.toLowerCase().includes(f.number.toLowerCase()))&&[['statuses','status'],['businessTypes','businessType'],['hallIds','hallId'],['salespersonIds','salespersonId'],['customerIds','customerId'],['warehouseIds','warehouseId']].every(([list,key])=>!f[list].length||f[list].includes(row[key]));}
function transferMatches(row,f){return(!f.startDate||row.businessDate>=f.startDate)&&(!f.endDate||row.businessDate<=f.endDate)&&(!f.number||row.number.toLowerCase().includes(f.number.toLowerCase()))&&[['statuses','status'],['fromWarehouseIds','fromWarehouseId'],['toWarehouseIds','toWarehouseId']].every(([list,key])=>!f[list].length||f[list].includes(row[key]));}
export function routeProfile(profile,endpoint,body){
 const ok=body=>({status:200,body});
 const deny=(status,code)=>({status,body:{error:{code,message:'Explicit isolated synthetic read-only fixture boundary'}}});
 try{
  if(endpoint==='/auth/session')return ok({principal:profile.principal});
  if(endpoint==='/auth/logout')return deny(501,'NOT_IMPLEMENTED');
  if(/\/commands$|\/prepare-|\/receipts\//.test(endpoint))return deny(501,'NOT_IMPLEMENTED');
  if(endpoint==='/current-form/sku-batch/query'){
   const q=parseCurrentFormSkuBatchQuery(body),byId=new Map(profile.skus.map(s=>[s.id,s]));
   if(q.context.kind==='SALES'&&q.context.hallId!==profile.salesReferences.hall[0].id)return deny(403,'FORBIDDEN');
   if(q.skuIds.some(id=>!byId.has(id)))return deny(409,'SKU_UNAVAILABLE');
   return ok(q.skuIds.map(id=>byId.get(id)));
  }
  if(endpoint==='/current-form/products/query'){
   const q=parseCurrentFormProductQuery(body);
   if(q.context.kind==='SALES'&&q.context.hallId!==profile.salesReferences.hall[0].id)return deny(403,'FORBIDDEN');
   return ok(page(profile.products.filter(p=>(p.code+' '+p.name).toLowerCase().includes(q.search.toLowerCase())).sort((a,b)=>a.code<b.code?-1:a.code>b.code?1:a.id.localeCompare(b.id)),q));
  }
  if(endpoint==='/current-form/product-skus/query'){
   const q=parseCurrentFormProductSkuQuery(body);if(q.context.kind==='SALES'&&q.context.hallId!==profile.salesReferences.hall[0].id)return deny(403,'FORBIDDEN');return ok(page(profile.skus.filter(s=>s.productId===q.productId),q));
  }
  if(endpoint==='/current-form/sales-references/query'){
   const q=parseCurrentSalesReferenceQuery(body),items=profile.salesReferences[q.kind]??[];
   return ok({...page(items.filter(r=>r.name.includes(q.search)),q),...(q.kind==='paymentAccount'?{recommendationAvailability:'UNAVAILABLE'}:{})});
  }
  if(endpoint==='/current-form/transfer-warehouses/query'){
   const q=parseCurrentTransferWarehouseQuery(body);return ok(page(profile.warehouses.filter(w=>w.name.includes(q.search)),q));
  }
  if(endpoint==='/dictionary-read/size-groups/query'){const q=parseDictionaryListQuery(body);return ok(dictPage(profile.sizeGroups.filter(g=>g.name.includes(q.search)),q));}
  if(endpoint==='/catalogue-settings-read/fits/query'){const q=parseCatalogueSettingsListQuery(body);return ok(dictPage(profile.fits.filter(g=>(g.code+' '+g.name).includes(q.search)),q));}
  if(endpoint==='/sales/detail/query'){
   const q=parseSalesDetailQuery(body);return profile.kind==='sales'&&profile.detail.document.header.id===q.salesId?ok(profile.detail):deny(404,'DOCUMENT_NOT_FOUND');
  }
  if(endpoint==='/transfers/detail/query'){
   const q=parseTransferDetailQuery(body);return profile.kind==='transfer'&&profile.detail.document.header.id===q.transferId?ok(profile.detail):deny(404,'DOCUMENT_NOT_FOUND');
  }
  if(endpoint==='/sales/query'){
   const q=parseSalesListQuery(body);return ok(page(profile.kind==='sales'&&salesMatches(profile.listItem,q.filter)?[profile.listItem]:[],q));
  }
  if(endpoint==='/transfers/query'){
   const q=parseTransferListQuery(body);return ok(page(profile.kind==='transfer'&&transferMatches(profile.listItem,q.filter)?[profile.listItem]:[],q));
  }
  if(endpoint==='/sales/references/query')return ok({page:body.page,exactTotal:'0',items:[]});
  if(endpoint==='/transfers/warehouses/query')return ok(page(profile.warehouses.map(w=>omit(w,['hasNonzeroInventory'])),body));
  return deny(501,'NOT_IMPLEMENTED');
 }catch{return deny(400,'INVALID_QUERY');}
}
export function profileDigest(profile){const {profileSha256,...payload}=profile;if(dataHash(payload)!==profileSha256)throw new TypeError('Synthetic profile drift');return profileSha256;}
export const serializeProfile=profile=>canonicalJson(profile)+'\n';
export async function writeHttpProfiles(outdir){
 if(!path.isAbsolute(outdir))throw new TypeError('Absolute fresh output directory required');await mkdir(outdir,{recursive:false});const rows=[];
 for(const kind of ['sales','transfer'])for(const shape of Object.keys(PROFILE_SHAPES)){
  const profile=createHttpProfile(kind,shape),bytes=serializeProfile(profile),name=`${kind}-${shape}.json`;
  await writeFile(path.join(outdir,name),bytes,{flag:'wx',mode:0o444});rows.push({path:name,profileSha256:profile.profileSha256,fileSha256:sha256(bytes),logicalDataSha256:profile.logicalDataSha256,kind,shape,oracle:profile.oracle});
 }
 const manifest={format:'opt00-http-profile-manifest-v1',baseline:BASELINE,profiles:rows,actualBrowser:'PENDING',actualDatabase:'NOT_USED',network:'PENDING_UI_OWNER_FIXED_DELAY_PROFILE',reset:'Read-only profile hash must be verified before/after each sample; writes all rejected'};
 await writeFile(path.join(outdir,'profiles-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o444});return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){if(process.argv.length!==4||process.argv[2]!=='--outdir')throw new TypeError('Use --outdir ABS_FRESH_DIRECTORY');process.stdout.write(JSON.stringify(await writeHttpProfiles(process.argv[3]),null,2)+'\n');}
