/** OFFLINE contracts only: no browser, listener, PostgreSQL or timing evidence. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createFixture,canonicalJson,dataHash,syntheticId,minorToYuan} from './fixture-generator.mjs';
import {createHttpProfile,routeProfile,PROFILE_SHAPES,profileDigest} from './http-profile.mjs';
import {routeSavedEditProfile,SAVED_EDIT_ENDPOINT} from './browser-host/saved-edit-profile.mjs';
import {encodeCurrentFormSavedEditSkuBatchWireV2} from '../../../apps/api/src/current-form-http.ts';
import {salesDetailResponse,salesListResponse} from '../../../apps/web/src/sales/response-validation.ts';
import {transferDetailResponse,transferListResponse} from '../../../apps/web/src/transfers/response-validation.ts';
import {createCurrentFormHttpReader} from '../../../apps/web/src/current-form/http-reader.ts';
import {SalesExistingDocumentSession} from '../../../apps/web/src/current-form/sales-existing-document.ts';
import {TransferExistingDocumentSession} from '../../../apps/web/src/current-form/transfer-existing-document.ts';
import {draftFromSalesDetail} from '../../../apps/web/src/sales/commands/validation.ts';
import {salesFormInput,salesInputMoney} from '../../../apps/web/src/sales/commands/form-model.ts';
import {draftFromTransferDetail,inputFromTransferDraft} from '../../../apps/web/src/transfers/commands/validation.ts';
import {ReadScope} from '../../../apps/web/src/loading/read-scope.ts';
const signal=()=>new AbortController().signal;
// Current-runtime integration uses the reviewed synthetic admission projection
// and actual API encoder. Frozen BEFORE DTOs/legacy routes remain unchanged.
const routeCurrentProfile=(profile,endpoint,body)=>endpoint===SAVED_EDIT_ENDPOINT?routeSavedEditProfile(profile,body,{encodeSavedEditBatch:encodeCurrentFormSavedEditSkuBatchWireV2}):routeProfile(profile,endpoint,body);
function setup(profile,override){const calls=[];const reader=createCurrentFormHttpReader({origin:'https://synthetic.invalid',basePath:'/api',fetch:async(url,init)=>{const endpoint=new URL(url).pathname.slice(4),body=JSON.parse(init.body);calls.push({endpoint,body});assert.equal(init.mode,'same-origin');assert.equal(init.credentials,'same-origin');if(override)return override(endpoint,body,init);const result=routeCurrentProfile(profile,endpoint,body);return new Response(JSON.stringify(result.body),{status:result.status,headers:{'content-type':'application/json'}});}});return{calls,reader};}
function sessionFor(profile,reader){const scope=new ReadScope({accountId:profile.principal.accountId,sessionRevision:'OPT00_TEST_ONLY',permissionRevision:'OPT00_TEST_ONLY'},'opt00-test',profile.detail.document.header.id,()=>{}),preparation={prepareExisting(){throw Error('NO WRITE SIMULATION');}};let session,input;
 if(profile.kind==='sales'){input=salesFormInput(draftFromSalesDetail(profile.detail));const owner={getSnapshot:()=>({input}),commands:{getSnapshot:()=>({write:{phase:'idle'}})}};session=new SalesExistingDocumentSession({owner,scope,reader,preparation,original:profile.detail,input,dirty:false});}
 else{input=inputFromTransferDraft(draftFromTransferDetail(profile.detail));const owner={getSnapshot:()=>({editor:{input},write:{phase:'idle'}})};session=new TransferExistingDocumentSession({owner,scope,reader,preparation,original:profile.detail,input,dirty:false});}
 return{session,scope,input};}
const filterSales={startDate:null,endDate:null,statuses:[],businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[],number:null};
const filterTransfer={startDate:null,endDate:null,statuses:[],fromWarehouseIds:[],toWarehouseIds:[],number:null};

test('deterministic synthetic fixture has600products4800SKUs260logicaldocuments and never claims seeded PG',()=>{const a=createFixture();assert.equal(dataHash(a),dataHash(createFixture()));assert.equal(a.products.length,600);assert.equal(a.skus.length,4800);assert.equal(a.documents.length,260);assert.equal(a.safety.databaseSeeded,false);assert.deepEqual(a.inventoryCases.map(c=>c.rowCount),[100,200,500]);assert.equal(a.publicationSpec.cutoffSkuIds.length,3200);assert.ok(a.stockVariants.filter(r=>r.fact.state!=='CONFIRMED').every(r=>!Object.hasOwn(r.fact,'quantity')));});
test('canonical strings/null/exact large amounts preserved, sparse/undefined/bigint rejected',()=>{assert.notEqual(dataHash({q:null}),dataHash({q:'0'}));assert.equal(minorToYuan('9007199254740993'),'90071992547409.93');assert.notEqual(syntheticId('sales',1),syntheticId('transfer',1));for(const value of [undefined,1n,NaN,Array(2),{x:undefined}])assert.throws(()=>canonicalJson(value));});
for(const kind of ['sales','transfer'])for(const shape of Object.keys(PROFILE_SHAPES))test(`current ${kind} saved ${shape} session v2 model-ready: original DTO/identities/prices/200line completeness`,async()=>{
 const p=createHttpProfile(kind,shape),q={page:1,pageSize:20,filter:kind==='sales'?filterSales:filterTransfer},digest=profileDigest(p);
 const id=p.detail.document.header.id;
 if(kind==='sales'){salesDetailResponse(p.detail,{salesId:id});salesListResponse(routeProfile(p,'/sales/query',q).body,q);}else{transferDetailResponse(p.detail,{transferId:id});transferListResponse(routeProfile(p,'/transfers/query',q).body,q);}
 const {reader,calls}=setup(p),{session,scope,input}=sessionFor(p,reader),inputHash=dataHash(input);
 try{await session.initialize();assert.equal(session.getSnapshot().phase,'ready');assert.equal(dataHash(input),inputHash);const draft=session.getSnapshot().proposal.getSnapshot().draft;assert.equal(draft.lines.length,PROFILE_SHAPES[shape].lines);assert.equal(new Set(draft.lines.map(l=>l.sku.id)).size,draft.lines.length);assert.equal(new Set(draft.lines.map(l=>l.sku.productId)).size,PROFILE_SHAPES[shape].products);
  // Metadata initialization only, not canonical DOM/paint/dictionary readiness
  // or a measured before/after latency. Transfer's original dictionary remains
  // independently required by the actual renderer and its unchanged reader.
  assert.equal(calls.filter(c=>c.endpoint===SAVED_EDIT_ENDPOINT).length,1);
  assert.equal(calls.filter(c=>c.endpoint==='/current-form/sku-batch/query').length,0);
  assert.equal(calls.filter(c=>c.endpoint==='/current-form/products/query').length,0);
  assert.equal(calls.length,1);assert.deepEqual(calls[0].body.skuIds,p.detail.document.lines.map(line=>line.skuId));
  draft.lines.forEach((l,i)=>{const old=p.detail.document.lines[i];assert.equal(l.quantity,old.quantity);assert.equal(l.sku.id,old.skuId);assert.deepEqual(l.sourceSnapshot,old.snapshot);assert.equal(l.product.sizeGroupId,l.sku.sizeGroupId);if(kind==='sales'){assert.equal(l.dealPrice,salesInputMoney(old.dealPrice));assert.equal(l.product.retailPrice,salesInputMoney(old.referencePrice));assert.equal(l.isGift,old.isGift);}});
  assert.equal(profileDigest(p),digest);
 }finally{session.dispose();scope.dispose();}
});
for(const kind of ['sales','transfer'])for(const shape of Object.keys(PROFILE_SHAPES))test(`legacy ${kind}/${shape} SKU-array and product-page decoder oracle contract, NOT a C03 session measurement`,async()=>{
 const p=createHttpProfile(kind,shape),digest=profileDigest(p),{reader,calls}=setup(p),context=kind==='sales'?{kind:'SALES',hallId:p.detail.document.header.hallId}:{kind:'TRANSFER'},skuIds=p.detail.document.lines.map(line=>line.skuId);
 const rows=await reader.readSkuBatch({context,skuIds},signal());assert.deepEqual(rows.map(row=>row.id),skuIds);
 const products=new Map();
 // Explicit legacy route/decoder traversal preserves the frozen search/paging
 // oracle. This contract model is NOT the immutable original C03 initializer
 // or its separately collected actual A3 browser baseline.
 for(const sku of rows){if(products.has(sku.productId))continue;let page=1,found=null;
  while(!found){const result=await reader.readProducts({context,search:sku.productCode,page,pageSize:20},signal());found=result.items.find(product=>product.id===sku.productId)??null;if(found||BigInt(page*20)>=result.exactTotal)break;page++;}
  assert.ok(found,'Original admitted product must remain reachable through the legacy paged decoder');assert.deepEqual(found,p.products.find(product=>product.id===sku.productId));products.set(sku.productId,found);
 }
 assert.equal(products.size,PROFILE_SHAPES[shape].products);
 assert.equal(calls.filter(call=>call.endpoint===SAVED_EDIT_ENDPOINT).length,0);
 assert.equal(calls.filter(call=>call.endpoint==='/current-form/sku-batch/query').length,1);
 assert.equal(calls.length,p.oracle.expectedOriginalInitializationRequests);
 assert.deepEqual(calls.filter(call=>call.endpoint==='/current-form/products/query'&&call.body.search==='OPT00-00000').map(call=>call.body.page),[1,2,3]);
 assert.equal(profileDigest(p),digest);
});
test('strict SKU batch requires complete naked array in requested order; extra eligibility fields never forged on wire',async()=>{const p=createHttpProfile('sales'),ids=p.detail.document.lines.slice(0,3).map(l=>l.skuId),context={kind:'SALES',hallId:p.detail.document.header.hallId};const {reader}=setup(p);const rows=await reader.readSkuBatch({context,skuIds:[...ids].reverse()},signal());assert.deepEqual(rows.map(r=>r.id),[...ids].reverse());for(const s of rows){assert.equal(s.barcodeAvailability,'UNAVAILABLE');assert.equal(Object.hasOwn(s,'enabled'),false);assert.equal(Object.hasOwn(s,'source'),false);}for(const skuIds of [[],[ids[0],ids[0]],Array(201).fill(ids[0])])await assert.rejects(async()=>reader.readSkuBatch({context,skuIds},signal()));const altered=setup(p,()=>new Response(JSON.stringify([...rows].reverse()),{headers:{'content-type':'application/json'}}));await assert.rejects(()=>altered.reader.readSkuBatch({context,skuIds:[...ids].reverse()},signal()),{kind:'malformed-response'});});
test('missing SKU refuses whole saved session rather than dropping lines or guessing zero',async()=>{const p=createHttpProfile('sales'),id=p.detail.document.lines[0].skuId;p.skus=p.skus.filter(s=>s.id!==id);const {reader}=setup(p),{session,scope}=sessionFor(p,reader);try{await session.initialize();assert.equal(session.getSnapshot().phase,'unavailable');assert.equal(session.getSnapshot().proposal,null);}finally{session.dispose();scope.dispose();}});
test('cancel during current SKU read consumes valid late v2 response without products or premature ready publication',async()=>{const p=createHttpProfile('transfer');let release,entered;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const {reader,calls}=setup(p,async(endpoint,body)=>{entered();await gate;const r=routeCurrentProfile(p,endpoint,body);assert.equal(r.status,200);assert.equal(r.body.version,2);return new Response(JSON.stringify(r.body),{status:r.status,headers:{'content-type':'application/json'}});});const {session,scope}=sessionFor(p,reader),pending=session.initialize();await waiting;scope.dispose();release();await pending;assert.equal(session.getSnapshot().disposed,true);assert.equal(session.getSnapshot().proposal,null);assert.equal(calls.length,1);assert.equal(calls[0].endpoint,SAVED_EDIT_ENDPOINT);});
test('dictionary projections pass original reader and sales gifts excluded only from list quantity, not line quantity',async()=>{const p=createHttpProfile('sales','lines200'),{reader}=setup(p),q={search:'',page:1,pageSize:100};assert.equal((await reader.readSizeGroups(q,signal())).items.length,2);assert.equal((await reader.readFits(q,signal())).items.length,2);assert.notEqual(p.oracle.quantity,p.oracle.allLineQuantity);assert.equal(p.listItem.quantity,p.oracle.quantity);assert.ok(p.detail.document.lines.some(l=>l.pricingRule==='DISCOUNT'));assert.ok(p.detail.document.lines.some(l=>l.isGift));});
test('pure HTTP profile fails closed for writes, foreign hall and unsupported/invalid input; never starts listener/DB',()=>{const p=createHttpProfile('sales');for(const endpoint of ['/sales/commands','/sales/prepare-existing','/transfers/commands','/transfers/prepare-existing'])assert.equal(routeProfile(p,endpoint,{}).status,501);assert.equal(routeProfile(p,'/current-form/sku-batch/query',{context:{kind:'SALES',hallId:syntheticId('hall',1)},skuIds:[p.skus[0].id]}).status,403);assert.equal(routeProfile(p,'/current-form/products/query',{context:{kind:'TRANSFER'},search:'',page:1,pageSize:20,actor:p.principal}).status,400);});
test('history unknown/revision logical descriptors7/8 never masquerade as LIVE/native runtime seeds',()=>{const f=createFixture();for(const kind of ['sales','transfer']){const unknown=f.documents.find(d=>d.kind===kind&&d.ordinal===7),revision=f.documents.find(d=>d.kind===kind&&d.ordinal===8);assert.equal(unknown.source,'CUTOFF_HISTORY');assert.equal(unknown.createdAt,null);assert.equal(unknown.createdByAccountId,null);assert.equal(revision.source,'CUTOFF_HISTORY');assert.equal(revision.historyRevision,1);}});
