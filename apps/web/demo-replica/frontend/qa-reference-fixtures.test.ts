import test from 'node:test';
import assert from 'node:assert/strict';
import {qaGroups,qaSkus,qaProducts,qaWarehouses,qaOrganization,qaSalesReferences,qaPrincipal,qaSchemes,qaColors,qaFits,qaInventory,qaPrices,qaBarcodeSnapshot,QA_REFERENCE_PROFILE,qaId} from './qa-reference-fixtures.mts';
import {createReplicaPreviewTransport} from './runtime-preview-transport.ts';
import {createSyntheticUnifiedTransport} from '../../unified-browser-harness/synthetic-transport.ts';
import {createCurrentFormHttpReader} from '../../src/current-form/http-reader.ts';
import {inventoryResponse,productSpecificationsResponse,productBasicsResponse} from '../../src/transport/response-validation.ts';
import {productPricesResponse,productBarcodesResponse,productStockResponse,productStockOverviewResponse} from '../../src/products/product-page-validation.ts';
import {validateCatalogueSettingsTree,validateCatalogueSettingsPage} from '../../../../packages/application/src/catalogue-settings-read-validation.ts';
import {validateDictionaryPage,validateDictionarySizeGroup,validateDictionaryScheme} from '../../../../packages/application/src/dictionary-read-validation.ts';
import {validateStoreSettingsPage} from '../../../../packages/application/src/store-settings-read-validation.ts';
import {SalesProposalSession} from '../../src/current-form/sales-proposal.ts';
import {ReadContext} from '../../src/loading/read-scope.ts';
import {createOrganizationMaintenanceReadClient} from '../../src/settings/stores/maintenance-http-client.ts';
import {checkedProductManagementResponse,checkedProductManagementCandidates} from '../../src/products/query-controller.ts';
import {salesDocumentOutput,transferDocumentOutput} from '../../src/components/document-output-contracts.ts';
import {entityId} from '../../../../packages/domain/src/values.ts';
const signal=()=>new AbortController().signal;
const fixture=createReplicaPreviewTransport(),http=fixture.http;
async function post(path:string,body:unknown){const r=await http.fetch(http.origin+'/api'+path,{method:'POST',credentials:'same-origin',body:JSON.stringify(body)});assert.equal(r.status,200,path);return r.json();}
const filter={products:[],categories:[],warehouses:[],suppliers:[],fits:[],seasons:[]};
test('Demo-reference finite directories and graph have complete groups, isolated people, matching UUIDs and exact declared prices',()=>{
 assert.deepEqual(qaGroups.map(g=>g.sizes.length),[11,11,11,7,6,2]);assert.equal(qaSchemes.length,6);assert.equal(qaFits.length,6);assert.ok(qaColors.length>5);
 assert.equal(qaPrincipal.staffId,qaOrganization.STAFF[0]!.id);assert.equal(qaPrincipal.accountId,qaOrganization.ACCOUNT[0]!.id);
 assert.equal(qaSalesReferences.salesperson[0]!.id,qaPrincipal.staffId);
 assert.equal(new Set(qaSkus.map(s=>s.id)).size,qaSkus.length);assert.equal(new Set(qaSkus.map(s=>s.barcode)).size,qaSkus.length);
 for(const p of qaProducts){const g=qaGroups.find(g=>g.id===p.sizeGroupId)!;const skus=qaSkus.filter(s=>s.productId===p.id);assert.equal(skus.length,g.sizes.length*4);for(const s of skus){assert.ok(g.sizes.some(size=>size.id===s.sizeId));assert.match(s.barcode,/^5[35]\d{13}$/);}assert.equal(qaPrices(p.id)!.prices.retail_price,p.retailPrice);assert.equal(Object.keys(qaPrices(p.id)!.prices).length,9);}
});
test('actual new preview transport reads coherent dictionaries, current form specs and barcode; empty new draft stays blank',async()=>{
 validateCatalogueSettingsTree(await post('/catalogue-settings-read/categories/query',{}));
 for(const kind of ['colors','fits']){const q={search:'',page:1,pageSize:100 as const};validateCatalogueSettingsPage(await post('/catalogue-settings-read/'+kind+'/query',q),q);}
 const q={search:'',page:1,pageSize:100 as const};const groups=validateDictionaryPage(await post('/dictionary-read/size-groups/query',q),q,validateDictionarySizeGroup);assert.equal(groups.total,6);
 validateDictionaryPage(await post('/dictionary-read/barcode-schemes/query',q),q,validateDictionaryScheme);
 const reader=createCurrentFormHttpReader(http),context={kind:'SALES' as const,hallId:entityId('hall',qaOrganization.HALL[0]!.id)};
 const products=await reader.readProducts({context,search:'',page:1,pageSize:20},signal());assert.equal(products.exactTotal,6n);
 for(const product of products.items){const rows=[];for(let page=1;;page++){const result=await reader.readProductSkus({context,productId:product.id,page,pageSize:20},signal());rows.push(...result.items);if(BigInt(page*20)>=result.exactTotal)break;}assert.equal(rows.length,qaSkus.filter(s=>s.productId===product.id).length);}
 const refs=await reader.readSalesReferences({kind:'salesperson',hallId:null,search:'',page:1,pageSize:20},signal());assert.ok(refs.items.some(r=>r.id===qaPrincipal.staffId));
 const found=await reader.readBarcode({context:{...context,warehouseId:entityId('warehouse',qaWarehouses[0]!.id)},barcode:qaSkus[0]!.barcode},signal());assert.equal(found.state,'FOUND');
 const reads=new ReadContext({accountId:qaPrincipal.accountId,sessionRevision:'qa',permissionRevision:'qa'}),scope=reads.createScope('blank');const draft=new SalesProposalSession(scope,reader);
 assert.equal(draft.getSnapshot().draft.hall,null);assert.equal(draft.getSnapshot().entries.OUT[0]!.dealPrice,'');assert.equal(draft.getSnapshot().entries.OUT[0]!.size,null);assert.equal(draft.getSnapshot().totals,null);reads.clear();
});
test('product list/drawer/price/barcode/stock and settings reference the same finite graph; old SYN defaults remain isolated',async()=>{
 const iq={filter,page:1,pageSize:100 as const},inventory=inventoryResponse(await post('/inventory/query',iq),iq);assert.equal(inventory.exactTotalProducts,6);
 for(const p of qaProducts){const target={productId:entityId('product',p.id)};productBasicsResponse(await post('/products/basics/query',target),target);productSpecificationsResponse(await post('/products/specifications/query',target),target);productPricesResponse(await post('/products/prices/query',target),target);
  const bq={...target,page:1,pageSize:100 as const,view:'SKU' as const};const barcodes=productBarcodesResponse(await post('/products/barcodes/query',bq),bq);assert.ok(barcodes);assert.equal('totalSkus' in barcodes?barcodes.totalSkus:0,qaSkus.filter(s=>s.productId===p.id).length);
  const sq={...target,page:1,pageSize:20 as const};productStockResponse(await post('/products/stock/query',sq),sq);const oq={...target,warehouseMode:'ALL' as const};productStockOverviewResponse(await post('/products/stock-overview/query',oq),oq);
  const all=qaBarcodeSnapshot(p.id);assert.equal(all.skus.length*2,all.bindings.length);
 }
 for(const kind of ['stores','warehouses'] as const){const q={search:'',status:'all' as const,hallId:null,page:1,pageSize:20 as const};validateStoreSettingsPage(await post('/store-settings-read/'+kind+'/query',q),kind,q);}
 const defaultTransport=createSyntheticUnifiedTransport();defaultTransport.authorize();const response=await defaultTransport.http.fetch(defaultTransport.http.origin+'/api/current-form/products/query',{method:'POST',credentials:'same-origin',body:JSON.stringify({context:{kind:'SALES',hallId:'00000000-0000-0000-0000-000000000010'},search:'',page:1,pageSize:20})});assert.equal((await response.json()).items[0].code,'SYN-001');
});

test('organization, account, customer/funds references and product filters decode with original readers',async()=>{
 const reader=createOrganizationMaintenanceReadClient(http);
 for(const kind of ['HALL','WAREHOUSE','STAFF','ACCOUNT','PAYMENT_METHOD','PAYMENT_ACCOUNT'] as const){
  const page=await reader.readList(kind,{search:'',status:'all',hallId:null,page:1,pageSize:100},signal());assert.equal(page.total,qaOrganization[kind].length);
  for(const row of page.items)assert.equal((await reader.readDetail(kind,row.id,signal()))?.id,row.id);
 }
 const current=createCurrentFormHttpReader(http),hallId=entityId('hall',qaOrganization.HALL[0]!.id);
 for(const kind of ['hall','customer','warehouse','paymentMethod'] as const){const page=await current.readSalesReferences({...(kind==='hall'?{kind,hallId:null}:{kind,hallId}),search:'',page:1,pageSize:20},signal());assert.equal(page.items.length,qaSalesReferences[kind].length);}
 for(const method of qaOrganization.PAYMENT_METHOD){const page=await current.readSalesReferences({kind:'paymentAccount',hallId,paymentMethodId:entityId('paymentMethod',method.id),search:'',page:1,pageSize:20},signal());assert.equal(page.items.length,1);assert.equal(page.items[0]!.paymentMethodId,method.id);}
 const query={filter:{productIds:[],categoryIds:[],years:[],seasonIds:[],supplierIds:[],fitIds:[],thicknesses:[],shapeCodes:[]},page:1,pageSize:100 as const};
 const products=checkedProductManagementResponse(await post('/product-management/query',query),query);assert.equal(products.items.length,qaProducts.length);
 for(const kind of ['product','category','fit','supplier','season','year'] as const){const q={kind,search:'',selectedIds:[],page:1,pageSize:20 as const};checkedProductManagementCandidates(await post('/product-management/candidates/query',q),q);}
 const list=await post('/sales/query',{filter:{startDate:null,endDate:null,statuses:[],businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[],number:null},page:1,pageSize:20});assert.equal(list.exactTotal,'30');assert.ok(list.items.every((r:{number:string})=>r.number.startsWith('QA-')),'new QA has no old seeded SYN document');
});

test('warehouse selection preserves declared same-SKU quantities instead of renumbering selected warehouses',()=>{
 const all=qaInventory(filter),selected=qaInventory({...filter,warehouses:[{id:qaWarehouses[2]!.id}]});
 for(const p of selected){const original=all.find(x=>x.id===p.id)!;for(const group of p.colorFits){const match=original.colorFits.find(x=>x.color.id===group.color.id&&x.fit.id===group.fit.id)!;assert.deepEqual(group.rows[0]!.cells,match.rows.find(row=>row.warehouse.id===qaWarehouses[2]!.id)!.cells);}}
});

test('populated QA document lists have second pages, all statuses, coherent multi-product details/refunds and explicit HISTORY identities',async()=>{
 const {normalSalesResponse,normalTransferResponse}=await import('./runtime/documents/normal-list-reader.ts');
 const {salesDetailResponse}=await import('../../src/sales/response-validation.ts'),{transferDetailResponse}=await import('../../src/transfers/response-validation.ts');
 const {historyDetailResponse}=await import('./runtime/documents/history-reader.ts');
 const sf={startDate:null,endDate:null,statuses:[],businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[],number:null},tf={startDate:null,endDate:null,statuses:[],fromWarehouseIds:[],toWarehouseIds:[],number:null};
 for(const kind of ['sales','transfers'] as const){
  const rows:Record<string,any>[]=[];
  for(const page of [1,2]){
   const q={filter:kind==='sales'?sf:tf,page,pageSize:20};const raw=await post('/'+kind+'/query',q);if(kind==='sales')normalSalesResponse(raw,q as never);else normalTransferResponse(raw,q as never);
   assert.equal(raw.exactTotal,'30');assert.equal(raw.items.length,page===1?20:10);rows.push(...raw.items);
  }
  assert.deepEqual(new Set(rows.map(r=>r.status)),new Set(['DRAFT','APPROVED','VOID']));assert.equal(rows.filter(r=>r.dataset==='HISTORY').length,6);
  if(kind==='sales')assert.deepEqual(new Set(rows.map(r=>r.businessType)),new Set(['SALE','RETURN','EXCHANGE']));
  for(const row of rows){
   if(row.dataset==='HISTORY'){
    const q={documentId:row.documentId,linePage:1,linePageSize:20,settlementPage:1,settlementPageSize:20};const target={kind,documentId:row.documentId,batchId:row.batchId,effectiveVersion:row.effectiveVersion};
    const d=historyDetailResponse(await post('/imported-history/'+kind+'/detail/query',q),target,q as never);assert.equal(d.document?.sourceStatus,row.status);assert.equal(d.lines.items.length,3);assert.equal(d.document?.createdBy.state,'UNKNOWN');
   }else if(kind==='sales'){
    const q={salesId:entityId('sales',row.id)},d=salesDetailResponse(await post('/sales/detail/query',q),q);assert.equal(d.document.header.status,row.status);assert.equal(d.document.lines.length,3);
    const printed=salesDocumentOutput(d);assert.equal(printed.printSections![0]!.columns.length,5);assert.equal(printed.printSections!.at(-1)!.columns.length,4);assert.ok(printed.sections[0]!.columns.includes('SKU 编号'));assert.equal(printed.sections.slice(0,-1).flatMap(s=>s.rows).map(r=>r[7]).join(','),d.document.lines.map(l=>l.quantity).join(','),'export keeps original signed quantities');
    assert.equal(d.document.lines.reduce((sum,l)=>sum+BigInt(l.lineAmount),0n).toString(),row.netDue);
    assert.equal(d.document.settlements.reduce((sum,s)=>sum+(s.direction==='REFUND'?-1n:1n)*BigInt(s.amount),0n).toString(),row.netDue);
   }else{
    const q={transferId:entityId('transfer',row.id)},d=transferDetailResponse(await post('/transfers/detail/query',q),q);assert.equal(d.document.header.status,row.status);assert.equal(d.document.lines.reduce((sum,l)=>sum+BigInt(l.quantity),0n).toString(),row.totalQuantity);const printed=transferDocumentOutput(d);assert.deepEqual(printed.printSections![0]!.columns.slice(0,2),['商品名称','款号']);assert.equal(printed.sections[0]!.columns[2],'款号','raw export order unchanged');
   }
  }
 }
});

test('empty documents remain an independent fixture scenario and unsupported edit/status actions never report success',async()=>{
 const empty=createReplicaPreviewTransport({emptyDocuments:true});const filter={startDate:null,endDate:null,statuses:[],businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[],number:null};
 const result=await empty.http.fetch(empty.http.origin+'/api/sales/query',{method:'POST',credentials:'same-origin',body:JSON.stringify({filter,page:1,pageSize:20})});const value=await result.json();assert.equal(value.exactTotal,'0');assert.deepEqual(value.items,[]);
 const response=await http.fetch(http.origin+'/api/sales/prepare-existing',{method:'POST',credentials:'same-origin',body:'{}'});assert.equal(response.status,501,'fixtures do not implement a new SAVE/edit engine');
 const q={filter,page:1,pageSize:20},normal=await post('/sales/query',q);assert.equal(normal.exactTotal,'30','empty scenario cannot clear the populated preview');
});

test('list warehouse fixture uses exact list DTO, selected IDs and hall search without weakening production validation',async()=>{
 const {transferWarehousesResponse}=await import('../../src/transfers/response-validation.ts');
 for(const selectedIds of [[],[entityId('warehouse',qaWarehouses[1]!.id)]]){
  const parameters={selectedIds,search:'',page:1,pageSize:20 as const};
  const result=transferWarehousesResponse(await post('/transfers/warehouses/query',parameters),parameters);
  assert.equal(result.items.length,selectedIds.length||qaWarehouses.length);
  assert.ok(result.items.every(row=>!('hasNonzeroInventory'in row)));
 }
 const parameters={selectedIds:[],search:qaWarehouses[0]!.hall.name,page:1,pageSize:20 as const};
 assert.equal(transferWarehousesResponse(await post('/transfers/warehouses/query',parameters),parameters).items.length,qaWarehouses.length);
 assert.equal(qaSchemes.filter(row=>row.status==='CURRENT').length,1);assert.equal(qaSchemes.find(row=>row.status==='CURRENT')?.key,'2026');
 const seasons=await post('/dictionary-read/seasons/query',{search:'',page:1,pageSize:100});assert.deepEqual(seasons.items.map((row:{name:string})=>row.name),['春季','夏季','秋季','冬季']);assert.ok(qaProducts.every(product=>seasons.items.some((row:{id:string})=>row.id===product.seasonId)));
});

 test('maintenance candidate preview uses the existing finite graph and actual v2 reader, never fabricated edit versions',async()=>{
 const {createProductMaintenanceHttpReaderV2}=await import('../../src/products/product-maintenance-http-client.ts');const reader=createProductMaintenanceHttpReaderV2(http),context=new ReadContext({accountId:qaPrincipal.accountId,sessionRevision:'candidate',permissionRevision:'candidate'}),scope=context.createScope('maintenance');
 for(const kind of ['categories','suppliers','seasons','size-groups','colors','fits','barcode-schemes','years','thicknesses'] as const){
  const result=await reader.readCandidates({parameters:{kind,search:'',page:1,pageSize:100},signal:scope.signal,identity:scope.identity,routeInstanceId:scope.routeInstanceId,entityId:null});assert.equal(result.kind,kind);if(['thicknesses','collar-pants-types'].includes(kind))assert.equal(result.total,0,'declared QA products have null attributes');else assert.ok(result.total>0);if(kind==='categories')assert.ok(result.items.every(item=>item.version===null),'unknown maintenance versions are not invented');
 }await assert.rejects(reader.readCandidates({parameters:{kind:'collar-pants-types',search:'',page:1,pageSize:100},signal:scope.signal,identity:scope.identity,routeInstanceId:scope.routeInstanceId,entityId:null}),(error:unknown)=>(error as {kind?:string}).kind==='not-implemented');scope.dispose();
 });

test('maintenance preview registration is exact POST-only and preserves authentication, cancellation and unknown-path rejection',async()=>{
 const {createSyntheticProductPreviewTransport}=await import('./runtime/products/synthetic-preview-transport.ts');let calls=0;
 const adapter=createSyntheticProductPreviewTransport({dataset:QA_REFERENCE_PROFILE,origin:http.origin,snapshotVersion:1,existingFetch:async()=>{calls++;return Response.json({error:{code:'UNAUTHENTICATED'}},{status:401});}});
 const path='/products/maintenance/candidates/query';assert.equal(adapter.canHandle(path,'POST'),true);assert.equal(adapter.canHandle(path,'GET'),false);assert.equal(adapter.canHandle('/products/maintenance/commands','POST'),false);
 const init={method:'POST',body:JSON.stringify({kind:'categories',search:'',page:1,pageSize:20})};
 assert.equal((await adapter.request(http.origin+'/api'+path,init)).status,401);assert.equal(calls,1);
 assert.equal((await adapter.request(http.origin+'/api/products/maintenance/commands',init)).status,501);assert.equal(calls,1,'unknown/writes must not reach provider');
 const stop=new AbortController();stop.abort();await assert.rejects(adapter.request(http.origin+'/api'+path,{...init,signal:stop.signal}),{name:'AbortError'});assert.equal(calls,1);
});
test('declared current product categories survive the synthetic read projection',async()=>{
 const reader=createCurrentFormHttpReader(http),page=await reader.readProducts({context:{kind:'TRANSFER'},search:'',page:1,pageSize:20},signal());
 for(const row of page.items){const declared=qaProducts.find(p=>p.id===row.id)!;assert.deepEqual(row.category,{id:declared.categoryId,label:declared.categoryLabel});}
});

 test('current barcode QA metadata matches exact approved public scheme;2020 does not invent old widths',async()=>{const {nativeBarcodeSchemeInitializationRows26}=await import('../../../../packages/application/src/native-barcode-import.ts');const approved=nativeBarcodeSchemeInitializationRows26();const current=qaSchemes.find(s=>s.key==='2026')!,native=approved.find(s=>s.sourceSchemeKey==='2026')!.native;assert.equal(current.id,native.id);assert.equal(current.name,native.name);assert.equal(current.barcodeType,native.barcode_type);assert.equal(current.ruleVersion,native.rule_version);assert.equal(current.ruleDescription,native.rule_description);assert.equal(qaSchemes.find(s=>s.key==='2020')!.ruleDescription,approved.find(s=>s.sourceSchemeKey==='2020')!.native.rule_description);});
