import assert from 'node:assert/strict';
import test from 'node:test';
import {createSyntheticManagementTransport,MANAGEMENT_SYNTHETIC_ORIGIN,syntheticId} from './synthetic-transport.ts';
import {checkedProductManagementCandidatePage,checkedProductManagementListPage} from '../../../packages/application/src/product-management-query-validation.ts';
import {validateDictionaryPage,validateDictionaryScheme,validateDictionarySeason,validateDictionarySizeGroup} from '../../../packages/application/src/dictionary-read-validation.ts';
import {validateCatalogueSettingsPage,validateCatalogueSettingsTreeGrant} from '../../../packages/application/src/catalogue-settings-read-validation.ts';
const emptyFilter={productIds:[],categoryIds:[],years:[],seasonIds:[],supplierIds:[],fitIds:[],thicknesses:[],shapeCodes:[]};
const request=(transport:ReturnType<typeof createSyntheticManagementTransport>,path:string,body?:unknown)=>transport.http.fetch(`${MANAGEMENT_SYNTHETIC_ORIGIN}/api${path}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',...(body===undefined?{}:{body:JSON.stringify(body)})});
test('closed synthetic transport is inert and rejects external origins, query URLs, unsupported operations and all credential inputs',async()=>{
  const transport=createSyntheticManagementTransport();assert.equal(transport.calls().length,0);
  for(const [url,init] of [[`https://real.invalid/api/auth/session`,{method:'GET',credentials:'same-origin'}],[`${MANAGEMENT_SYNTHETIC_ORIGIN}/api/auth/session?x=1`,{method:'GET',credentials:'same-origin'}],[`${MANAGEMENT_SYNTHETIC_ORIGIN}/api/auth/login`,{method:'POST',credentials:'same-origin',body:'{"password":"never accepted"}'}],[`${MANAGEMENT_SYNTHETIC_ORIGIN}/api/auth/password`,{method:'POST',credentials:'same-origin'}],[`${MANAGEMENT_SYNTHETIC_ORIGIN}/api/transfers/commands`,{method:'POST',credentials:'same-origin'}]] as const)await assert.rejects(()=>transport.http.fetch(url,init));
  assert.equal(transport.calls().length,0);assert.equal((await request(transport,'/auth/session')).status,401);transport.authorize();const session=await(await request(transport,'/auth/session')).json();assert.match(session.principal.loginName,/SYNTHETIC/);
});
test('actual product contract fixtures preserve 10-column fields, null/zero/negative facts, all dimensions and exact pagination',async()=>{
  const transport=createSyntheticManagementTransport();transport.authorize();
  const first=checkedProductManagementListPage(await(await request(transport,'/product-management/query',{filter:emptyFilter,page:1,pageSize:100})).json());
  assert.equal(first.items.length,100);assert.equal(first.exactTotal,105);assert.equal(first.items[0]!.retailPrice,null);assert.equal(first.items[0]!.totalStock,null);assert.ok(first.items.some(item=>item.retailPrice==='0.00'));assert.ok(first.items.some(item=>item.totalStock==='-2'));
  const second=checkedProductManagementListPage(await(await request(transport,'/product-management/query',{filter:emptyFilter,page:2,pageSize:100})).json());assert.equal(second.items.length,5);
  const filtered=checkedProductManagementListPage(await(await request(transport,'/product-management/query',{filter:{...emptyFilter,productIds:[syntheticId(1002)],categoryIds:[syntheticId(10)],years:['2025'],seasonIds:[syntheticId(20)],supplierIds:[syntheticId(40)],fitIds:[syntheticId(30)],thicknesses:['合成常规'],shapeCodes:['SYN-PANTS']},page:1,pageSize:100})).json());assert.equal(filtered.items.length,1);assert.equal(filtered.items[0]!.code,'SYN-0002');
  for(const kind of ['product','category','year','season','supplier','fit','thickness','shape'] as const){const result=checkedProductManagementCandidatePage(await(await request(transport,'/product-management/candidates/query',{kind,search:'',selectedIds:[],page:1,pageSize:20})).json(),kind);assert.ok(result.items.length>0);}
});
test('dictionary fixture list/detail responses pass real wire validators and preserve unknown scheme facts',async()=>{
  const transport=createSyntheticManagementTransport();transport.authorize();const parameters={search:'',page:1,pageSize:20 as const};
  const groups=validateDictionaryPage(await(await request(transport,'/dictionary-read/size-groups/query',parameters)).json(),parameters,validateDictionarySizeGroup);assert.equal(groups.total,23);assert.equal(groups.items.length,20);
  const seasons=validateDictionaryPage(await(await request(transport,'/dictionary-read/seasons/query',parameters)).json(),parameters,validateDictionarySeason);assert.ok(seasons.items.length>0);
  const schemes=validateDictionaryPage(await(await request(transport,'/dictionary-read/barcode-schemes/query',parameters)).json(),parameters,validateDictionaryScheme);assert.equal(schemes.items[1]!.codeLength,null);assert.equal(schemes.items[1]!.applicability,null);
  assert.deepEqual(validateDictionaryScheme(await(await request(transport,'/dictionary-read/barcode-scheme/query',{schemeId:syntheticId(401)})).json()),schemes.items[1]);
});
test('one-shot synthetic error/empty/revocation states never contact a real service or accept writes',async()=>{
  const transport=createSyntheticManagementTransport();transport.authorize();const query={filter:emptyFilter,page:1,pageSize:100};
  transport.setNextFailure('forbidden');assert.equal((await request(transport,'/product-management/query',query)).status,403);
  transport.setNextFailure('unavailable');assert.equal((await request(transport,'/product-management/query',query)).status,503);
  transport.setNextFailure('network');await assert.rejects(()=>request(transport,'/product-management/query',query));
  transport.setNextFailure('empty');assert.equal((await(await request(transport,'/product-management/query',query)).json()).exactTotal,0);
  transport.revoke();assert.equal((await request(transport,'/product-management/query',query)).status,401);
  assert.ok(transport.calls().every(call=>Object.keys(call).join(',')==='method,path,syntheticOnly'));assert.throws(()=>transport.setNextDelay(5001));
});

test('catalogue fixtures use independent real read contracts: complete null-count tree and native 23-row color/fit pages',async()=>{
  const transport=createSyntheticManagementTransport();transport.authorize();
  const tree=validateCatalogueSettingsTreeGrant(await(await request(transport,'/catalogue-settings-read/categories/query',{})).json(),{kind:'categories',operation:'tree',productCounts:'NONE'});
  assert.equal(tree.total,6);assert.ok(tree.items.every(item=>item.productCount===null&&item.code===null));
  for(const item of tree.items)assert.equal(item.childCount,tree.items.filter(child=>child.parentId===item.id).length);
  assert.equal(tree.items.find(item=>item.id===syntheticId(17))?.parentId,syntheticId(16));
  await assert.rejects(()=>request(transport,'/catalogue-settings-read/categories/query',{actor:'client cannot grant'}));
  for(const kind of ['colors','fits'] as const){
    const firstQuery={search:'',page:1,pageSize:20 as const},secondQuery={...firstQuery,page:2};
    const first=validateCatalogueSettingsPage(await(await request(transport,`/catalogue-settings-read/${kind}/query`,firstQuery)).json(),firstQuery);
    const last=validateCatalogueSettingsPage(await(await request(transport,`/catalogue-settings-read/${kind}/query`,secondQuery)).json(),secondQuery);
    assert.equal(first.total,23);assert.equal(first.items.length,20);assert.equal(last.items.length,3);assert.equal(last.items[2]!.version,7);assert.ok(first.items.some(item=>!item.enabled));
    assert.equal(new Set([...first.items,...last.items].map(item=>item.id)).size,23);
    for(const pageSize of [50,100] as const){const query={search:'',page:1,pageSize};assert.equal(validateCatalogueSettingsPage(await(await request(transport,`/catalogue-settings-read/${kind}/query`,query)).json(),query).items.length,23);}
    const query={search:kind==='colors'?'SYN-C23':'合成版型 23',page:1,pageSize:20 as const};
    assert.equal(validateCatalogueSettingsPage(await(await request(transport,`/catalogue-settings-read/${kind}/query`,query)).json(),query).total,1);
  }
});
