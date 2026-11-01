/** Offline test-host contracts, NOT an actual browser/HTTP/PG measurement. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHttpProfile,routeProfile,profileDigest} from '../http-profile.mjs';
import {encodeCurrentFormSavedEditSkuBatchWireV2} from '../../../../apps/api/src/current-form-http.ts';
import {createCurrentFormHttpReader} from '../../../../apps/web/src/current-form/http-reader.ts';
import {routeCanonicalProfile} from './canonical-profile.mjs';
import {BEFORE_ORIGIN,AFTER_PROTOCOL,AFTER_PRODUCTION_PATHS,createPhaseBinding,assertProfilePhase} from './phase-binding.mjs';
import {SAVED_EDIT_ENDPOINT} from './saved-edit-profile.mjs';
import {summarizeReadPhases} from './action-boundary.mjs';
import {sha256} from './host-core.mjs';
const context=p=>p.kind==='sales'?{kind:'SALES',hallId:p.salesReferences.hall[0].id}:{kind:'TRANSFER'};
const query=p=>({context:context(p),skuIds:p.detail.document.lines.map(line=>line.skuId)});
const after={phase:'AFTER_OPT01_A_R2',encodeSavedEditBatch:encodeCurrentFormSavedEditSkuBatchWireV2};
const request=(p,change=x=>x)=>{
  const calls=[];
  const reader=createCurrentFormHttpReader({origin:'https://synthetic-opt00.invalid',basePath:'/api',fetch:async(url,init)=>{
    const endpoint=new URL(url).pathname.slice(4),body=JSON.parse(init.body);calls.push({endpoint,body});const result=routeCanonicalProfile(p,endpoint,body,{},after);return new Response(JSON.stringify(change(result.body)),{status:result.status,headers:{'Content-Type':'application/json'}});
  }});return {reader,calls};
};
for(const kind of ['sales','transfer'])for(const shape of ['few','distinct30','lines200'])test(`A4 ${kind}/${shape}: frozen fact projection through actual AFTER strict decoder; legacy array unchanged`,async()=>{
  const p=createHttpProfile(kind,shape),digest=profileDigest(p),q=query(p),f=request(p);
  const result=await f.reader.readSavedEditSkuBatch(q,new AbortController().signal);
  const wire=routeCanonicalProfile(p,SAVED_EDIT_ENDPOINT,q,{},after).body;assert.equal(wire.version,2);assert.ok(wire.skus.every(row=>Array.isArray(row)&&row.length===13&&row[12]==='UNAVAILABLE'));assert.ok(wire.products.every(row=>Array.isArray(row)&&row.length===3&&row[1]==='ELIGIBLE'));
  assert.equal(result.version,1);assert.deepEqual(result.skus,routeProfile(p,'/current-form/sku-batch/query',q).body);assert.deepEqual(result.products.map(x=>x.productId),[...new Set(result.skus.map(x=>x.productId))]);assert.equal(result.products.length,p.oracle.productCount);
  for(const row of result.products){const original=p.products.find(product=>product.id===row.productId);assert.ok(original);assert.deepEqual(row,{productId:original.id,state:'ELIGIBLE',sizeGroupId:original.sizeGroupId});}
  assert.deepEqual(f.calls,[{endpoint:SAVED_EDIT_ENDPOINT,body:q}]);
  const legacy=await f.reader.readSkuBatch(q,new AbortController().signal);assert.ok(Array.isArray(legacy));assert.deepEqual(legacy,result.skus);assert.equal(profileDigest(p),digest);
  assert.equal(routeCanonicalProfile(p,SAVED_EDIT_ENDPOINT,q).status,501,'BEFORE never enables AFTER route');
});
test('A4 admission is readable product evidence, not SKU group: absent product is UNAVAILABLE; inconsistent facts reject',async()=>{
  const p=createHttpProfile('sales','few'),target=p.skus.find(s=>s.id===query(p).skuIds[0]),missing=structuredClone(p);missing.products=missing.products.filter(x=>x.id!==target.productId);
  const result=await request(missing).reader.readSavedEditSkuBatch(query(p),new AbortController().signal);assert.deepEqual(result.products[0],{productId:target.productId,state:'UNAVAILABLE'});assert.equal(Object.hasOwn(result.products[0],'sizeGroupId'),false);
  const unknownGroup=structuredClone(p);delete unknownGroup.products.find(x=>x.id===target.productId).sizeGroupId;const unknown=await request(unknownGroup).reader.readSavedEditSkuBatch(query(p),new AbortController().signal);assert.deepEqual(unknown.products[0],{productId:target.productId,state:'UNAVAILABLE'});
  for(const mutate of [
    value=>{value.products.find(x=>x.id===target.productId).sizeGroupId=value.sizeGroups[1].id;},
    value=>{value.products.find(x=>x.id===target.productId).code='OTHER-CODE';},
    value=>{value.products.find(x=>x.id===target.productId).name='OTHER-NAME';},
    value=>{const product=value.products.find(x=>x.id===target.productId);delete product.sizeGroupId;product.code='OTHER-CODE';},
    value=>{value.products.push(value.products[0]);},
    value=>{value.sizeGroups=value.sizeGroups.filter(x=>x.id!==target.sizeGroupId);},
    value=>{const wanted=value.skus.find(s=>s.id===query(p).skuIds[3]);wanted.sizeGroupId=value.sizeGroups[1].id;},
  ]){const bad=structuredClone(p);mutate(bad);assert.equal(routeCanonicalProfile(bad,SAVED_EDIT_ENDPOINT,query(p),{},after).status,400);}
});
test('A4 eligible facts equal the actual old paged readable-product decoder, including target behind50 substring collisions',async()=>{
  const p=createHttpProfile('sales','few'),q=query(p),f=request(p),actual=await f.reader.readSavedEditSkuBatch(q,new AbortController().signal);let pages=0;
  for(const product of actual.products){const sku=actual.skus.find(x=>x.productId===product.productId);let found=null;
    for(let page=1;page<=30;page++){const result=await f.reader.readProducts({context:q.context,search:sku.productCode,page,pageSize:20},new AbortController().signal);pages++;found=result.items.find(x=>x.id===product.productId);if(found||(page*20)>=Number(result.exactTotal))break;}
    assert.ok(found,'Original admitted product must really be visible in the same context');assert.equal(found.sizeGroupId,product.sizeGroupId);assert.equal(found.code,sku.productCode);assert.equal(found.name,sku.productName);
  }
  assert.equal(pages,5,'Original few-case code collision really requires three pages for product0, plus two other products');
});
for(const kind of ['SKU identity','size-group identity','size member identity'])test(`A4 duplicate frozen ${kind} is rejected, even when duplicate values are identical`,()=>{
  const original=createHttpProfile('sales','few'),p=structuredClone(original),q=query(original);
  if(kind==='SKU identity')p.skus.push(p.skus.find(row=>row.id===q.skuIds[0]));
  if(kind==='size-group identity')p.sizeGroups.push(p.sizeGroups[0]);
  if(kind==='size member identity')p.sizeGroups[0].sizes.push(p.sizeGroups[0].sizes[0]);
  assert.equal(routeCanonicalProfile(p,SAVED_EDIT_ENDPOINT,q,{},after).status,400,'An unambiguous unique frozen fact set is required, not Map/.find first/last wins');
});
test('A4 uses unchanged original query/authority boundaries: missing SKU409, wrong hall403, extra/duplicate/empty IDs400',()=>{
  const p=createHttpProfile('sales','few'),q=query(p);
  assert.equal(routeCanonicalProfile(p,SAVED_EDIT_ENDPOINT,{...q,skuIds:['00000000-0000-4000-8000-000000000099']},{},after).status,409);
  assert.equal(routeCanonicalProfile(p,SAVED_EDIT_ENDPOINT,{...q,context:{kind:'SALES',hallId:'00000000-0000-4000-8000-000000000099'}},{},after).status,403);
  for(const bad of [{...q,actor:p.principal},{...q,skuIds:[]},{...q,skuIds:[q.skuIds[0],q.skuIds[0]]}])assert.equal(routeCanonicalProfile(p,SAVED_EDIT_ENDPOINT,bad,{},after).status,400);
  assert.throws(()=>routeCanonicalProfile(p,SAVED_EDIT_ENDPOINT,q,{}, {phase:'UNKNOWN'}));
  assert.equal(routeCanonicalProfile(p,SAVED_EDIT_ENDPOINT,q,{}, {phase:'AFTER_OPT01_A_R2'}).status,503,'No locally invented fallback encoder');assert.equal(routeCanonicalProfile(p,'/current-form/saved-edit-sku-batch/query',q,{},after).status,501,'Superseded envelope endpoint never enabled');
  for(const endpoint of ['/sales/prepare-existing','/transfers/prepare-existing','/sales/commands'])assert.equal(routeCanonicalProfile(p,endpoint,q,{},after).status,501);
});
test('A4 actual AFTER decoder still rejects malformed union/order/group/coverage and legacy decoder rejects envelope',async()=>{
  const p=createHttpProfile('sales','few'),q=query(p);
  for(const change of [
    x=>({...x,version:1}),x=>({...x,grant:'all'}),x=>({...x,skus:[...x.skus].reverse()}),x=>({...x,products:x.products.slice(1)}),x=>({...x,products:[...x.products].reverse()}),
    x=>({...x,products:x.products.map((row,i)=>i?row:[row[0],row[1],'00000000-0000-4000-8000-000000000099'])}),
    x=>({...x,products:x.products.map((row,i)=>i?row:[row[0],'UNAVAILABLE',row[2]])}),
    x=>({...x,products:x.products.map((row,i)=>i?row:[row[0],1,row[2]])}),
    x=>({...x,skus:x.skus.map((row,i)=>i?row:[...row.slice(0,12),0])}),
    x=>({...x,skus:x.skus.map((row,i)=>i?row:row.slice(0,12))}),
    x=>({...x,skus:x.skus.map((row,i)=>i?row:{...row})}),
  ])await assert.rejects(request(p,change).reader.readSavedEditSkuBatch(q,new AbortController().signal),{kind:'malformed-response'});
  const f=request(p,()=>routeCanonicalProfile(p,SAVED_EDIT_ENDPOINT,q,{},after).body);await assert.rejects(f.reader.readSkuBatch(q,new AbortController().signal),{kind:'malformed-response'});
});
// All IDs/hashes below are unit-test placeholders, NEVER an AFTER build receipt.
const unitCommit='1'.repeat(40),unitTree='2'.repeat(40),unitHash='3'.repeat(64);
const approval=()=>({format:'opt00-controller-reviewed-after-runtime-v2',phase:'AFTER_OPT01_A_R2',protocol:{...AFTER_PROTOCOL},beforeOrigin:{...BEFORE_ORIGIN},runtimeCommit:unitCommit,runtimeTree:unitTree,productionSources:AFTER_PRODUCTION_PATHS.map(path=>({path,bytes:10,sha256:unitHash}))});
const binding=manifest=>createPhaseBinding({phase:'AFTER_OPT01_A_R2',runtimeCommit:unitCommit,runtimeTree:unitTree,reviewedManifest:manifest,reviewedManifestSha256:unitHash});
const profileManifest=()=>({baseline:{candidateCommit:BEFORE_ORIGIN.commit,candidateTree:BEFORE_ORIGIN.tree,datasetVersion:BEFORE_ORIGIN.datasetVersion},profiles:Array.from({length:6},()=>({logicalDataSha256:BEFORE_ORIGIN.logicalDataSha256}))});
test('A4 phase binding: exact BEFORE pin; separate reviewed AFTER actual runtime and unchanged v2 provenance',()=>{
  const before=createPhaseBinding({phase:'BEFORE_OPT00',runtimeCommit:BEFORE_ORIGIN.commit,runtimeTree:BEFORE_ORIGIN.tree});assert.equal(before.reviewedRuntimeManifestSha256,null);assertProfilePhase(before,profileManifest(),BEFORE_ORIGIN.profilesManifestSha256);
  const after=binding(approval());assert.equal(after.actualRuntime.commit,unitCommit);assert.deepEqual(after.beforeOrigin,BEFORE_ORIGIN);assert.equal(after.reviewedProductionSources.length,7);assertProfilePhase(after,profileManifest(),BEFORE_ORIGIN.profilesManifestSha256);
});
test('A4 unknown/missing/unreviewed or wrong source phases fail closed; no profile relabeling to AFTER',()=>{
  for(const input of [{phase:'AFTER_OPT01_A',runtimeCommit:unitCommit,runtimeTree:unitTree},{phase:'UNKNOWN',runtimeCommit:unitCommit,runtimeTree:unitTree},{phase:'AFTER_OPT01_A_R2',runtimeCommit:unitCommit,runtimeTree:unitTree},{phase:'BEFORE_OPT00',runtimeCommit:unitCommit,runtimeTree:unitTree}])assert.throws(()=>createPhaseBinding(input));
  for(const mutate of [x=>{x.protocol.wireVersion=1;},x=>{x.protocol.endpoint='/current-form/saved-edit-sku-batch/query';},x=>{x.format='opt00-controller-reviewed-after-runtime-v1';},x=>{x.productionSources.push({path:'packages/application/src/current-form-saved-edit-wire.ts',bytes:10,sha256:unitHash});},x=>{x.runtimeCommit='4'.repeat(40);},x=>{x.beforeOrigin.tree=unitTree;},x=>{x.productionSources.pop();},x=>{x.productionSources[0].path='../unreviewed';},x=>{x.productionSources[0].sha256='bad';},x=>{x.productionSources.push(x.productionSources[0]);},x=>{x.productionSources[0].extra='unknown';},x=>{x.unreviewed=true;}]){const manifest=approval();mutate(manifest);assert.throws(()=>binding(manifest));}
  const actual=binding(approval()),bad=profileManifest();bad.baseline.candidateTree=unitTree;assert.throws(()=>assertProfilePhase(actual,bad,BEFORE_ORIGIN.profilesManifestSha256));assert.throws(()=>assertProfilePhase(actual,profileManifest(),unitHash));
});
test('A4 cannot relabel the known rejected C08 envelope-v1 source as approved R2 AFTER',()=>{
  const manifest=approval();manifest.runtimeCommit='548b852155b58781b2f609f583492474623a43d1';manifest.runtimeTree='4079101b3b21e6d042c04c7ab8f1d0249e63d1c2';
  assert.throws(()=>createPhaseBinding({phase:'AFTER_OPT01_A_R2',runtimeCommit:manifest.runtimeCommit,runtimeTree:manifest.runtimeTree,reviewedManifest:manifest,reviewedManifestSha256:unitHash}),/Superseded C08/);
});
test('A4 generic timing includes saved-edit metadata in BOTH full and after-detail windows; three A3 observation leaves byte-identical',async()=>{
  const calls=[{endpoint:'/transfers/detail/query',started:1,completed:2,serverRequestId:'1'},{endpoint:'/transfers/detail/query',started:3,completed:4,serverRequestId:'2'},{endpoint:SAVED_EDIT_ENDPOINT,started:5,completed:6,serverRequestId:'3'},{endpoint:'/dictionary-read/size-groups/query',started:7,completed:8,serverRequestId:'4'}].map(x=>({...x,status:200,phase:'completed'}));
  const result=summarizeReadPhases(calls,0,10,'transfer');assert.equal(result.allRequiredApiRequestCount,4);assert.equal(result.afterDetailApiRequestCount,2);assert.deepEqual(result.afterDetailServerRequestIds,['3','4']);
  for(const [name,expected] of [['entry.tsx','2732689a449dcf6c036519c07e6ad12e1577800e3d24dab0c3392d3fe1eda392'],['readiness.mjs','f9aa8a199fb07adccf3bba8eddc225c097637d27acee8673a76951dc1a5a50b7'],['action-boundary.mjs','a8071afb238027131969aadd1219d26b05b14126738df13fbc43780a69f011f5']])assert.equal(sha256(await readFile(new URL(name,import.meta.url))),expected,'A3 actual-click/complete-readiness/timing code must not drift');
});
