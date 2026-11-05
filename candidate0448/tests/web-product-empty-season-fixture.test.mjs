/** Original synthetic-memory service regression only: no listener/PG/browser or production claims. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProductEntryServiceHost,REF,VALUES} from './support/product-entry-service-host-fixture.mjs';
import {createProductMaintenanceHttpClientV2,createProductMaintenanceHttpReaderV2,validateProductMaintenanceDetailV2} from '../apps/web/src/products/product-maintenance-http-client.ts';
import {createProductHttpReader} from '../apps/web/src/transport/product-http-reader.ts';
import {createProductManagementHttpReader} from '../apps/web/src/products/http-reader.ts';
import {productBasicsResponse} from '../apps/web/src/transport/response-validation.ts';
import {checkedProductManagementListPage} from '../packages/application/src/product-management-query-validation.ts';
import {ReadContext} from '../apps/web/src/loading/read-scope.ts';
const filter=Object.fromEntries(['productIds','categoryIds','years','seasonIds','supplierIds','fitIds','thicknesses','shapeCodes'].map(k=>[k,[]]));
async function scenario(t,seasonIds){
 const host=await createProductEntryServiceHost({syntheticOnly:true,productWrite:true,colorWrite:false,mediaStage:false});t.after(()=>host.close());
 const context=new ReadContext({accountId:REF.account,sessionRevision:'1',permissionRevision:'1'}),scope=context.createScope('empty-season-original-http');t.after(()=>{scope.dispose();context.clear();});
 const read=parameters=>({parameters,identity:scope.identity,routeInstanceId:scope.routeInstanceId,entityId:scope.entityId,signal:scope.signal});
 const client=createProductMaintenanceHttpClientV2(host.http),maintenance=createProductMaintenanceHttpReaderV2(host.http),peek=createProductHttpReader(host.http),list=createProductManagementHttpReader(host.http);
 const draft={action:'CREATE',requestKey:'SYN-SEASON-PROJECTION-CREATE',values:{...structuredClone(VALUES),seasonIds},skus:[],barcodes:[],skuSelection:{colorIds:[REF.color],fitIds:[REF.fit]}};
 const saved=await client.execute(draft,scope.signal);return {host,scope,read,client,maintenance,peek,list,saved};
}
async function assertReads(s,expectedSeasonIds,expectedLabel){
 const q={productId:s.saved.targetId},detail=await s.maintenance.readDetail(s.read(q));
 assert.deepEqual(detail.values.seasonIds,expectedSeasonIds,'original V2 empty vs unknown persisted value remains distinct');
 assert.deepEqual(detail.references.seasons.map(x=>x.id),expectedSeasonIds??[]);
 const before=s.host.snapshot().state.writes;
 const basics=await s.peek.readProductBasics(s.read(q));assert.equal(basics.seasonLabel,expectedLabel);assert.equal(basics.code,VALUES.productCode);
 const page=await s.list.readList(s.read({filter,page:1,pageSize:100}));assert.equal(page.exactTotal,1);assert.equal(page.items[0].id,s.saved.targetId);assert.equal(page.items[0].seasonLabel,expectedLabel);
 assert.equal(s.host.snapshot().state.writes,before,'read projection never changes saved product/receipts');
 assert.equal(s.host.app.server.listening,false);return {basics,page,detail};
}
test('fixture legal V2 CREATE seasonIds=[]: strict basics and list decode nullable label without requiring a season',async t=>{
 const s=await scenario(t,[]),{basics,page}=await assertReads(s,[],null);
 // Keep the existing strict boundary: fixture generation is repaired, not codecs.
 assert.throws(()=>productBasicsResponse({...basics,seasonLabel:''},{productId:s.saved.targetId}));
 assert.throws(()=>checkedProductManagementListPage({...page,items:[{...page.items[0],seasonLabel:''}]}));
 assert.equal(s.host.snapshot().state.receipts.size,1);
});
test('fixture legal empty seasons: original strict list read accepts nullable projection',async t=>{
 const s=await scenario(t,[]),page=await s.list.readList(s.read({filter,page:1,pageSize:100}));
 assert.equal(page.items[0].seasonLabel,null);assert.equal(s.host.snapshot().state.receipts.size,1);
});
test('historical unknown null remains accepted by unchanged strict wires; known seasons cannot be reset to unknown',async t=>{
 const s=await scenario(t,[REF.season]),{basics,page,detail:d}=await assertReads(s,[REF.season],'秋');
 const unknown={...d,values:{...d.values,seasonIds:null},references:{...d.references,seasons:[]}};
 assert.equal(validateProductMaintenanceDetailV2(unknown,d.productId).values.seasonIds,null);
 assert.equal(productBasicsResponse({...basics,seasonLabel:null},{productId:d.productId}).seasonLabel,null);
 assert.equal(checkedProductManagementListPage({...page,items:[{...page.items[0],seasonLabel:null}]}).items[0].seasonLabel,null);
 const source=await readFile(new URL('./support/product-entry-service-host-fixture.mjs',import.meta.url),'utf8');
 assert.equal((source.match(/seasonLabel:p\.seasonIds===null\?null:/g)??[]).length,2,'both original fixture projections preserve explicit null branch');
 // This fixture has no historical unknown seed. Do not invent one by illegally
 // transitioning a known product to unknown; the real original service refuses it.
 await assert.rejects(s.client.execute({action:'EDIT',requestKey:'SYN-SEASON-PROJECTION-UNKNOWN',id:d.productId,expectedVersion:d.version,values:unknown.values,skus:d.skus,barcodes:d.barcodes},s.scope.signal),e=>e.code==='PRODUCT_SEASON_UNKNOWN_RESET');
 assert.equal(s.host.snapshot().state.receipts.size,1);
});
test('fixture nonempty V2 seasons keep declared original label and strict detail/list identity',async t=>{
 const s=await scenario(t,[REF.season]);await assertReads(s,[REF.season],'秋');assert.equal(s.host.snapshot().state.receipts.size,1);
});

test('root required-feedback entry explicitly includes both UI and fixture regressions',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.scripts['test:web:product:required'],'node --test tests/web-product-required-feedback.test.mjs tests/web-product-empty-season-fixture.test.mjs');
});
