import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyntheticUnifiedTransport,UNIFIED_SYNTHETIC_ORIGIN} from './synthetic-transport.ts';
import {syntheticId as id} from '../management-browser-harness/synthetic-transport.ts';
import {createInventoryHttpReader} from '../src/transport/inventory-http-reader.ts';
import {createProductHttpReader} from '../src/transport/product-http-reader.ts';
import {emptyInventoryFilter} from '../src/inventory/contracts.ts';
import {createPartyHttpClient} from '../src/parties/http-client.ts';
import {createStoreSettingsHttpReader} from '../src/settings/stores/http-reader.ts';
import {validateSalesDraft,validateSalesCommand,validateSalesResult,validateSalesReceipt} from '../src/sales/commands/validation.ts';
import {validateTransferDraft,validateTransferCommand,validateTransferResult,validateTransferReceipt} from '../src/transfers/commands/validation.ts';
import type {NativeSalesCreateProposal} from '../../../packages/application/src/native-sales-preparation.ts';
const init=(method='POST',body?:unknown):RequestInit=>({method,credentials:'same-origin',mode:'same-origin',redirect:'error',...(body===undefined?{}:{body:JSON.stringify(body)})});
const call=(transport:ReturnType<typeof createSyntheticUnifiedTransport>,path:string,body?:unknown,method='POST')=>transport.http.fetch(`${UNIFIED_SYNTHETIC_ORIGIN}/api${path}`,init(method,body));
const read=<P>(parameters:P)=>({parameters,signal:new AbortController().signal,identity:{accountId:id(900),sessionRevision:'TEST',permissionRevision:'TEST'},routeInstanceId:'SYNTHETIC-TEST',entityId:null});
test('one closed inert boundary refuses network/password/unsupported methods and writes before retaining any body',async()=>{
 const transport=createSyntheticUnifiedTransport();assert.equal(transport.calls().length,0);
 assert.equal((await call(transport,'/auth/session',undefined,'GET')).status,401);
 for(const [url,options]of [[`https://example.com/api/sales/query`,init('POST',{})],[`${UNIFIED_SYNTHETIC_ORIGIN}/api/auth/login`,init('POST',{password:'NEVER-LOG'})],[`${UNIFIED_SYNTHETIC_ORIGIN}/api/auth/password`,init('POST',{password:'NEVER-LOG'})],[`${UNIFIED_SYNTHETIC_ORIGIN}/api/customers/commands`,init('POST',{password:'NEVER-LOG'})],[`${UNIFIED_SYNTHETIC_ORIGIN}/api/inventory/commands`,init('POST',{})],[`${UNIFIED_SYNTHETIC_ORIGIN}/api/sales/query?x=1`,init('POST',{})],[`${UNIFIED_SYNTHETIC_ORIGIN}/api/sales/query`,{...init('POST',{}),credentials:'include'}]]as const)await assert.rejects(transport.http.fetch(url,options));
 assert.equal(transport.calls().length,1);assert.doesNotMatch(JSON.stringify(transport.calls()),/password|NEVER-LOG/);
 transport.authorize();const session=await(await call(transport,'/auth/session',undefined,'GET')).json();assert.equal(session.principal.loginName,'SYNTHETIC-UNIFIED-ONLY');
 transport.revoke();assert.equal((await call(transport,'/sales/query',{})).status,401);
});
test('reused complete inventory fixture crosses actual HTTP validators with native UUIDs and target-only media',async()=>{
 const transport=createSyntheticUnifiedTransport();transport.authorize();const reader=createInventoryHttpReader(transport.http),parameters={filter:emptyInventoryFilter(),page:1,pageSize:100 as const};
 const page=await reader.readInventory(read(parameters));assert.equal(page.products.length,100);assert.equal(page.exactTotalProducts,103);assert.match(page.products[0]!.id,/^[a-f0-9-]{36}$/);
 const next=await reader.readInventory(read({...parameters,page:2}));assert.equal(next.products.length,3);assert.equal(next.allMatchesTotal.knownQuantity,page.allMatchesTotal.knownQuantity);
 const product=page.products[0]!,target=createProductHttpReader(transport.http),basics=await target.readProductBasics(read({productId:product.id}));assert.ok(basics);assert.equal(basics.productId,product.id);
 const specs=await target.readProductSpecifications(read({productId:product.id}));assert.ok(specs);assert.ok(specs.skus.length);assert.match(specs.skus[0]!.id,/^[a-f0-9-]{36}$/);
 const images=await target.readProductImages(read({productId:product.id}));assert.ok(images);assert.equal(images.images.length,1);assert.match((await target.readProductImage(read({productId:product.id,imageId:images.images[0]!.id}))).url,/^data:image/);
 const candidates=await reader.readCandidates(read({kind:'product' as const,search:'测试上衣1',page:1,pageSize:20 as const,selectedIds:[],categoryIds:[]}));assert.ok(candidates.items.length);
 const selected=await reader.readInventory(read({...parameters,filter:{...parameters.filter,products:[{id:product.id,label:product.name}]}}));assert.equal(selected.exactTotalProducts,1);assert.equal(selected.products[0]!.id,product.id);
});
test('customers and suppliers use independent actual read clients, all party writes fail closed',async()=>{
 const transport=createSyntheticUnifiedTransport();transport.authorize();const client=createPartyHttpClient(transport.http),signal=new AbortController().signal;
 for(const kind of ['CUSTOMER','SUPPLIER']as const){const page=await client.list(kind,{search:'',enabled:'ALL',page:1,pageSize:20},signal);assert.equal(page.total,23);assert.equal(page.items.length,20);assert.equal((await client.detail(kind,page.items[0]!.id,signal)).id,page.items[0]!.id);assert.equal((await client.candidates(kind,{search:'',page:2,pageSize:20},signal)).items.length,3);await assert.rejects(client.execute(kind,{action:'CREATE',requestKey:'SYNTHETIC.party',name:'合成禁止写'},signal));}
 assert.equal(transport.calls().filter(row=>row.path.endsWith('/commands')).length,0);
});
const salesProposal:NativeSalesCreateProposal={businessType:'SALE',businessDate:'2026-10-21',hallId:id(10),customerId:id(11),salespersonId:null,warehouseId:id(20),note:'合成只在内存',orderDiscount:'0.01',lines:[{skuId:id(70),quantity:'1',pricingRule:'DISCOUNT',dealPrice:null,discountTenths:95,zeroConfirmed:false,isGift:false}],settlements:[{paymentMethodId:id(30),paymentAccountId:id(31),direction:'RECEIVE',amount:'37.90'}]};
test('SALE preserves native pricing/allocation/new SAVE idempotency, uncertain receipt and no approval',async()=>{
 const transport=createSyntheticUnifiedTransport();transport.authorize();const prepared=validateSalesDraft(await(await call(transport,'/sales/prepare-create',salesProposal)).json());assert.equal(prepared.header.grossAmount,'3791');assert.equal(prepared.header.netDue,'3790');assert.equal(prepared.lines[0]!.allocatedDiscount,'1');
 const command=validateSalesCommand({action:'SAVE',expectedVersion:null,requestKey:'SYNTHETIC.sale:1',draft:prepared});transport.setTransactionFailure('saveUncertain');await assert.rejects(call(transport,'/sales/commands',command));assert.equal(transport.savedCounts().sales,1);
 const receipt=validateSalesReceipt(await(await call(transport,'/sales/receipts/SYNTHETIC.sale:1',undefined,'GET')).json(),command);assert.equal(receipt.status,'COMMITTED');validateSalesResult(await(await call(transport,'/sales/commands',command)).json(),command);assert.equal(transport.savedCounts().sales,1);
 assert.equal((await call(transport,'/sales/commands',{action:'APPROVE',salesId:prepared.header.id,expectedVersion:1,requestKey:'SYNTHETIC.no-stock'})).status,409);assert.equal(transport.savedCounts().sales,1);
 transport.setTransactionFailure('proofMissing');assert.equal((await call(transport,'/sales/prepare-create',salesProposal)).status,409);
});
test('TRANSFER preserves native prepare/new SAVE receipt and rejects edit or stock commands',async()=>{
 const transport=createSyntheticUnifiedTransport();transport.authorize();const prepared=validateTransferDraft(await(await call(transport,'/transfers/prepare-create',{businessDate:'2026-10-21',fromWarehouseId:id(20),toWarehouseId:id(21),note:null,lines:[{skuId:id(70),quantity:'2'}]})).json());
 assert.equal(prepared.lines[0]!.snapshot.barcode,'SYNTHETIC-MAIN-SYN-SKU-70');const command=validateTransferCommand({action:'SAVE',expectedVersion:null,requestKey:'SYNTHETIC.transfer:1',draft:prepared});transport.setTransactionFailure('saveUncertain');await assert.rejects(call(transport,'/transfers/commands',command));assert.equal(transport.savedCounts().transfers,1);
 validateTransferReceipt(await(await call(transport,'/transfers/receipts/SYNTHETIC.transfer:1',undefined,'GET')).json(),command);validateTransferResult(await(await call(transport,'/transfers/commands',command)).json(),command);assert.equal(transport.savedCounts().transfers,1);
 assert.equal((await call(transport,'/transfers/commands',{...command,expectedVersion:1,requestKey:'SYNTHETIC.edit'})).status,409);assert.equal((await call(transport,'/transfers/commands',{action:'APPROVE',transferId:prepared.header.id,expectedVersion:1,requestKey:'SYNTHETIC.no-stock'})).status,409);
});

test('synthetic new sales creation/readback time is the original SAVE receipt time, never an inherited fixture clock',async()=>{
 const transport=createSyntheticUnifiedTransport();transport.authorize();
 const prepared=validateSalesDraft(await(await call(transport,'/sales/prepare-create',salesProposal)).json());
 const command=validateSalesCommand({action:'SAVE',expectedVersion:null,requestKey:'SYNTHETIC.sale:creation-time',draft:prepared});
 await call(transport,'/sales/commands',command);
 const receipt=await(await call(transport,'/sales/receipts/SYNTHETIC.sale:creation-time',undefined,'GET')).json();
 const first=await(await call(transport,'/sales/detail/query',{salesId:prepared.header.id})).json();
 assert.equal(first.document.header.createdAt,receipt.completedAt);assert.equal(first.document.header.updatedAt,receipt.completedAt);
 assert.ok(Number.isFinite(Date.parse(first.document.header.createdAt)));
 await call(transport,'/sales/commands',command);
 const second=await(await call(transport,'/sales/detail/query',{salesId:prepared.header.id})).json();
 assert.equal(second.document.header.createdAt,first.document.header.createdAt);assert.equal(second.document.header.updatedAt,first.document.header.updatedAt);
 const listed=await(await call(transport,'/sales/query',{filter:{startDate:null,endDate:null,statuses:[],businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[],number:null},page:1,pageSize:20})).json();
 assert.equal(listed.items.find((row:{id:string})=>row.id===prepared.header.id).updatedAt,receipt.completedAt);
});

test('synthetic new transfer creation/readback time is stable through receipt replay',async()=>{
 const transport=createSyntheticUnifiedTransport();transport.authorize();
 const prepared=validateTransferDraft(await(await call(transport,'/transfers/prepare-create',{businessDate:'2026-10-21',fromWarehouseId:id(20),toWarehouseId:id(21),note:null,lines:[{skuId:id(70),quantity:'2'}]})).json());
 const command=validateTransferCommand({action:'SAVE',expectedVersion:null,requestKey:'SYNTHETIC.transfer:creation-time',draft:prepared});
 await call(transport,'/transfers/commands',command);
 const receipt=await(await call(transport,'/transfers/receipts/SYNTHETIC.transfer:creation-time',undefined,'GET')).json();
 const first=await(await call(transport,'/transfers/detail/query',{transferId:prepared.header.id})).json();
 assert.equal(first.document.header.createdAt,receipt.completedAt);assert.equal(first.document.header.updatedAt,receipt.completedAt);
 await call(transport,'/transfers/commands',command);
 const second=await(await call(transport,'/transfers/detail/query',{transferId:prepared.header.id})).json();
 assert.equal(second.document.header.createdAt,first.document.header.createdAt);assert.equal(second.document.header.updatedAt,first.document.header.updatedAt);
});
test('management data is reused without copying and one-shot cancellation/failure stays synthetic',async()=>{
 const transport=createSyntheticUnifiedTransport();transport.authorize();transport.setNextReadFailure('forbidden');assert.equal((await call(transport,'/catalogue-settings-read/categories/query',{})).status,403);const tree=await(await call(transport,'/catalogue-settings-read/categories/query',{})).json();assert.ok(tree.items.every((row:{productCount:null})=>row.productCount===null));
 transport.setNextReadFailure('empty');assert.equal((await(await call(transport,'/dictionary-read/size-groups/query',{search:'',page:1,pageSize:20})).json()).total,0);
 const aborted=new AbortController();aborted.abort();await assert.rejects(transport.http.fetch(`${UNIFIED_SYNTHETIC_ORIGIN}/api/auth/session`,{...init('GET'),signal:aborted.signal}),{name:'AbortError'});
});
test('store settings has four explicit typed read operations; unknown facts stay unknown and maintenance never falls back',async()=>{
 const transport=createSyntheticUnifiedTransport();transport.authorize();const reader=createStoreSettingsHttpReader(transport.http),parameters={search:'',status:'normal' as const,hallId:null,page:1,pageSize:20 as const};
 const stores=await reader.readList('stores',read(parameters));assert.equal(stores.total,37);assert.equal(stores.items.length,20);
 const store=await reader.readDetail('stores',read({id:stores.items[0]!.id}));assert.equal(store.item?.kind,'stores');if(store.item?.kind==='stores'){assert.equal(store.item.defaultWarehouse?.name,null);assert.equal(store.item.createdAt,null);}
 const warehouses=await reader.readList('warehouses',read(parameters));assert.equal(warehouses.total,23);const warehouse=await reader.readDetail('warehouses',read({id:warehouses.items[0]!.id}));if(warehouse.item?.kind==='warehouses'){assert.equal(warehouse.item.hall.name,null);assert.equal(warehouse.item.stockFacts,null);}else assert.fail('Exact warehouse kind required');
 const before=transport.calls().length;for(const path of ['/store-settings-read/stores/commands','/store-settings-read/warehouses/commands'])await assert.rejects(call(transport,path,{action:'CREATE'}));assert.equal(transport.calls().length,before);
 transport.setNextReadFailure('empty');assert.equal((await reader.readDetail('stores',read({id:stores.items[0]!.id}))).item,null);
 transport.setNextReadFailure('forbidden');await assert.rejects(reader.readList('stores',read(parameters)),{kind:'forbidden'});
});
