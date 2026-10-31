/** NOT production, auth-store, PG, ordinary DB role, issuer, durability or browser proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createProductEntryServiceHost,ORIGIN,REF,VALUES} from './support/product-entry-service-host-fixture.mjs';
import {createProductMaintenanceHttpClientV2,createProductMaintenanceHttpReaderV2,createProductMediaUploadHttpClient,createProductEditorMediaHttpReader} from '../apps/web/src/products/product-maintenance-http-client.ts';
import {createCatalogueMaintenanceHttpClient} from '../apps/web/src/product-settings/catalogue-maintenance-http-client.ts';
import {createProductFullPageHttpReader} from '../apps/web/src/products/product-page-http-reader.ts';
import {createDictionaryHttpReader} from '../apps/web/src/product-settings/size-groups/http-reader.ts';
import {createProductHttpReader} from '../apps/web/src/transport/product-http-reader.ts';
import {ProductEditorController} from '../apps/web/src/products/product-editor-state.ts';
import {ReadContext} from '../apps/web/src/loading/read-scope.ts';
import {parseProductionHostConfiguration} from '../apps/web/src/production-host/configuration.ts';
const command=(key,colorId=REF.color)=>({action:'CREATE',requestKey:key,values:structuredClone(VALUES),skus:[],barcodes:[],skuSelection:{colorIds:[colorId],fitIds:[REF.fit]}});
const setup=async(t,options)=>{const host=await createProductEntryServiceHost({syntheticOnly:true,...options});t.after(()=>host.close());const context=new ReadContext({accountId:REF.account,sessionRevision:'1',permissionRevision:'1'}),scope=context.createScope('product-entry-host');t.after(()=>{scope.dispose();context.clear();});return {host,scope,read:parameters=>({parameters,identity:scope.identity,routeInstanceId:scope.routeInstanceId,entityId:scope.entityId,signal:scope.signal})};};

test('whole finite service host: actual COLOR create -> readback -> PRODUCT selection SAVE -> receipt/detail/reopen all11 real SKUs',async t=>{
 const {host,scope,read}=await setup(t,{productWrite:true,colorWrite:true,mediaStage:false});
 const config=parseProductionHostConfiguration({kind:'naijue-erp-production-host',http:{origin:ORIGIN,basePath:'/api'},assets:{basePath:'/assets/synthetic0053/'},session:{verifyOnMount:true},routes:host.frontendRoutes});
 assert.equal(config.routes.maintenance.products,true);assert.equal(config.routes.maintenance.colors,true);assert.equal(config.routes.maintenance.fits,undefined);assert.equal(config.routes.maintenance.categories,undefined);assert.equal(config.routes.productMediaReady,undefined);
 assert.equal(host.app.server.listening,false);assert.equal(host.app.hasRoute({method:'POST',url:'/products/media/uploads'}),false);
 const colors=createCatalogueMaintenanceHttpClient(host.http,'COLOR'),products=createProductMaintenanceHttpClientV2(host.http),reader=createProductMaintenanceHttpReaderV2(host.http),peek=createProductHttpReader(host.http);
 const colorCommand={action:'CREATE',requestKey:'SYN-COLOR-0053',values:{name:'SYNTHETIC 新增青色',code:'002',enabled:true}};
 const color=await colors.execute(colorCommand,scope.signal);assert.equal(color.kind,'COLOR');assert.equal(color.version,1);assert.equal(host.snapshot().state.products.size,0,'catalogue create does not save a product');
 const candidate=await reader.readCandidates(read({kind:'colors',search:'002',page:1,pageSize:100}));assert.equal(candidate.total,1);assert.equal(candidate.items[0].id,color.targetId);assert.equal(candidate.items[0].name,'SYNTHETIC 新增青色');
 const input=command('SYN-PRODUCT-0053',color.targetId),before=structuredClone(input),result=await products.execute(input,scope.signal);assert.deepEqual(input,before,'service cannot rewrite UI draft payload');assert.equal(result.version,1);
 const after=host.snapshot();assert.equal(after.state.products.size,1);assert.equal(after.state.receipts.size,2);assert.equal(after.state.audits.filter(row=>row.kind==='PRODUCT').length,1);assert.ok(after.events.indexOf('PREPARE:PRODUCT')<after.events.indexOf('PUT_PRODUCT'));
 const aggregate=after.state.products.get(result.targetId);assert.equal(aggregate.skus.length,11);assert.equal(aggregate.barcodes.length,11);assert.ok(aggregate.skus.every(sku=>sku.id&&sku.skuCode&&sku.colorId===color.targetId&&sku.createdOperationId===result.operationId));assert.ok(aggregate.barcodes.every(row=>row.id&&row.kind==='MAIN'));
 const full=createProductFullPageHttpReader(host.http,['barcodes','prices','stock']),dictionary=createDictionaryHttpReader(host.http);const actualGroup=await dictionary.readSizeGroups(read({search:'',page:1,pageSize:100}));assert.equal(actualGroup.items[0].sizes.length,11);const skuPage=await full.barcodes.read(read({productId:result.targetId,view:'SKU',page:1,pageSize:50}));assert.equal(skuPage.totalSkus,11);assert.ok(skuPage.items.every(row=>row.main&&row.main.barcode));assert.equal((await full.prices.read(read({productId:result.targetId}))).prices.retail_price,'568.00');await assert.rejects(full.stock.read(read({productId:result.targetId,page:1,pageSize:20})),error=>error.kind==='unavailable','unimplemented stock is unavailable, never manufactured zero');
 const receipt=await products.receipt(input,scope.signal);assert.deepEqual(receipt.result,result);const detail=await reader.readDetail(read({productId:result.targetId}));assert.equal(detail.version,1);assert.equal(detail.skus.length,11);assert.equal(detail.barcodes.length,11);assert.deepEqual(detail.values.seasonIds,[REF.season]);assert.equal(detail.values.prices.retail_price,'568.00');
 const specs=await peek.readProductSpecifications(read({productId:result.targetId}));assert.equal(specs.colors.length,1);assert.equal(specs.colors[0].id,color.targetId);assert.equal(specs.fits[0].label,'A版（标准）');assert.equal(specs.sizes.length,11);
 const writes=after.state.writes;assert.deepEqual(await products.execute(input,scope.signal),result);assert.equal(host.snapshot().state.writes,writes,'same-key replay reads original receipt, not a second aggregate');
});

test('actual original private stage:5role uploads prepare files only; one SAVE consumes on product transaction; metadata + controlled bytes reopen',async t=>{
 const {host,scope,read}=await setup(t,{productWrite:true,colorWrite:false,mediaStage:true});
 const cfg=parseProductionHostConfiguration({kind:'naijue-erp-production-host',http:{origin:ORIGIN,basePath:'/api'},assets:{basePath:'/assets/synthetic0053/'},session:{verifyOnMount:true},routes:host.frontendRoutes});assert.equal(cfg.routes.productMediaReady,true);assert.equal(cfg.routes.maintenance.colors,undefined);
 const upload=createProductMediaUploadHttpClient(host.http),client=createProductMaintenanceHttpClientV2(host.http),reader=createProductMaintenanceHttpReaderV2(host.http),media=createProductEditorMediaHttpReader(host.http),peek=createProductHttpReader(host.http);
 const bytes=await sharp({create:{width:8,height:4,channels:3,background:'#123456'}}).png().toBuffer(),imageChanges=[];
 for(const [i,role]of ['MAIN','WHITE_BACKGROUND','HANG_TAG','DETAIL','COLOR'].entries()){
  const staged=await upload({file:new File([bytes],`synthetic-${i}.png`,{type:'image/png'}),productId:null,commandKey:'SYN-PRODUCT-MEDIA-0053',uploadKey:'SYN-UPLOAD-'+i,signal:scope.signal});
  imageChanges.push({action:'ADD',uploadId:staged.uploadId,role,colorId:role==='COLOR'?REF.color:null,displayOrder:i});
  const before=host.snapshot().state;assert.equal(before.products.size,0);assert.equal(before.images.size,0);assert.equal(before.receipts.size,0);assert.equal(before.writes,0,'stage cannot write product/native images before SAVE');
 }
 const input={...command('SYN-PRODUCT-MEDIA-0053'),imageChanges},saved=await client.execute(input,scope.signal),state=host.snapshot();assert.equal(state.state.products.size,1);assert.equal(state.state.images.get(saved.targetId).length,5);assert.equal(state.events.filter(x=>x==='STAGE_CONSUME_ON_PRODUCT_TX').length,5);assert.equal(state.inFlight,0);
 const detail=await reader.readDetail(read({productId:saved.targetId}));assert.equal(detail.skus.length,11);assert.equal(detail.barcodes.length,11);
 const metadata=await media.readImages(read({productId:saved.targetId}));assert.equal(metadata.version,saved.version);assert.equal(metadata.images.length,5);assert.deepEqual(new Set(metadata.images.map(image=>image.role)),new Set(['MAIN','WHITE_BACKGROUND','HANG_TAG','DETAIL','COLOR']));assert.ok(metadata.images.every(image=>image.thumbnailState==='READY'&&image.thumbnailUrl));assert.equal(metadata.images.find(image=>image.role==='COLOR').colorId,REF.color);
 const photos=await peek.readProductImages(read({productId:saved.targetId}));assert.equal(photos.images.length,5);const thumbnail=await host.http.fetch(photos.images[0].thumbnailUrl,{credentials:'include',signal:scope.signal});assert.equal(thumbnail.status,200);assert.match(thumbnail.headers.get('content-type'),/image\/webp/);assert.ok((await thumbnail.arrayBuffer()).byteLength>0);
 const original=await media.readOriginal(read({productId:saved.targetId,imageId:metadata.images[0].id}));const delivered=await host.http.fetch(original.url,{credentials:'include',signal:scope.signal});assert.equal(delivered.status,200);assert.deepEqual(Buffer.from(await delivered.arrayBuffer()),bytes,'original controlled route delivers actual staged bytes');
 assert.doesNotMatch(JSON.stringify(metadata),/fileRef|staged-product-media|synthetic0053|\/tmp\//,'private storage refs never leak');
 const before=host.snapshot().state.writes;assert.deepEqual(await client.execute(input,scope.signal),saved);assert.equal(host.snapshot().state.writes,before,'receipt replay cannot attach images twice');
});

test('unknown-after-commit recovers original receipt with one aggregate and no second request key',async t=>{
 const {host,scope}=await setup(t,{productWrite:true,colorWrite:true,mediaStage:false});const client=createProductMaintenanceHttpClientV2(host.http);let keys=0;
 const controller=new ProductEditorController({scope,client,newRequestKey:()=>`SYN-UNKNOWN-${++keys}`,onRecoveryRequired(){},onAccessFailure(){throw Error('unexpected access failure');}});t.after(()=>controller.dispose());
 host.loseNextResponse('/products/v2/commands');const {requestKey,...draft}=command('unused');await controller.submit(draft);assert.equal(controller.getSnapshot().phase,'uncertain');assert.equal(host.snapshot().state.products.size,1);assert.equal(keys,1);await controller.recover();assert.equal(controller.getSnapshot().phase,'committed');assert.equal(keys,1);assert.equal(host.snapshot().state.products.size,1);assert.equal(host.snapshot().state.receipts.size,1);
});

test('completion fault rolls back entire memory transaction; fresh current role/auth denial preserves zero business writes',async t=>{
 const {host,scope}=await setup(t,{productWrite:true,colorWrite:true,mediaStage:false});const products=createProductMaintenanceHttpClientV2(host.http),colors=createCatalogueMaintenanceHttpClient(host.http,'COLOR');host.faultCompletion(true);await assert.rejects(products.execute(command('SYN-FAULT-0053'),scope.signal));const rollback=host.snapshot().state;assert.equal(rollback.products.size,0);assert.equal(rollback.receipts.size,0);assert.equal(rollback.audits.length,0);assert.equal(rollback.writes,0);host.faultCompletion(false);
 host.setIdentity({role:'SALESPERSON'});await assert.rejects(products.execute(command('SYN-DENIED-0053'),scope.signal),error=>error.kind==='forbidden');await assert.rejects(colors.execute({action:'CREATE',requestKey:'SYN-COLOR-DENIED',values:{name:'SYNTHETIC DENIED',code:'003',enabled:true}},scope.signal),error=>error.kind==='forbidden');assert.equal(host.snapshot().state.writes,0);
 host.setIdentity({enabled:false});await assert.rejects(products.execute(command('SYN-UNAUTH-0053'),scope.signal),error=>error.kind==='unauthenticated');assert.equal(host.snapshot().state.writes,0);
});


test('COLOR response lost after actual commit resolves original receipt and refreshes the exact persisted target without another CREATE',async t=>{
 const {host,scope,read}=await setup(t,{productWrite:true,colorWrite:true,mediaStage:false}),client=createCatalogueMaintenanceHttpClient(host.http,'COLOR'),reader=createProductMaintenanceHttpReaderV2(host.http);
 const input={action:'CREATE',requestKey:'SYN-COLOR-UNKNOWN',values:{name:'SYNTHETIC 结果未知颜色',code:'004',enabled:true}};host.loseNextResponse('/catalogue/colors/commands');await assert.rejects(client.execute(input,scope.signal),error=>error.outcome==='uncertain');const after=host.snapshot();assert.equal(after.state.colors.size,2);assert.equal(after.state.receipts.size,1);const receipt=await client.receipt(input,scope.signal);assert.equal(receipt.action,'CREATE');const rows=await reader.readCandidates(read({kind:'colors',search:'004',page:1,pageSize:100}));assert.equal(rows.items.length,1);assert.equal(rows.items[0].id,receipt.result.targetId);assert.equal(host.snapshot().state.writes,after.state.writes,'receipt and refresh cannot write');assert.equal(host.snapshot().calls.filter(call=>call.path==='/catalogue/colors/commands').length,1);
});
