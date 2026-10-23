import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../loading/read-scope.ts';
import { ProductEditorController } from './product-editor-state.ts';
import { ProductMaintenanceError, type ProductMaintenanceCommand, type ProductMaintenanceClient } from './product-editor-contracts.ts';
import type { ReadIdentity } from '../loading/read-scope.ts';
import { createProductMaintenanceHttpClient, createProductMaintenanceHttpReader, validateProductMaintenanceDetail } from './product-maintenance-http-client.ts';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = () => new ReadContext({ accountId: id(1), sessionRevision: '1', permissionRevision: '1' });
const command = (requestKey = 'product-key-1') => ({ action: 'DISABLE' as const, id: id(2), expectedVersion: 1, requestKey });
const result = { operationId: id(3), kind: 'PRODUCT' as const, targetId: id(2), version: 2 };
const receipt = () => ({ requestKey: 'product-key-1', action: 'DISABLE', status: 'COMMITTED', completedAt: '2026-10-22T06:00:00Z', result });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

test('restored v1/v2/media commands start uncertain without IO or a new key and retain exact immutable payloads', () => {
 const detail=maintenanceDetail(),{seasonId:_,...v2}=detail.values;
 const originals:ProductMaintenanceCommand[]=[
  {requestKey:'restore-v1',action:'EDIT',id:id(2),expectedVersion:1,values:detail.values,skus:detail.skus,barcodes:detail.barcodes},
  {requestKey:'restore-v2-unknown-season',action:'EDIT',id:id(2),expectedVersion:1,values:{...v2,seasonIds:null},skus:detail.skus,barcodes:detail.barcodes},
  {requestKey:'restore-v2-seasons-media',action:'EDIT',id:id(2),expectedVersion:1,values:{...v2,seasonIds:[id(6),id(20)]},skus:detail.skus,barcodes:detail.barcodes,imageChanges:[{action:'ADD',uploadId:id(21),role:'COLOR',colorId:id(10),displayOrder:0}]},
 ];
 for(const [index,original]of originals.entries()){
  const ctx=context(),scope=ctx.createScope('restored-product',id(2)),before=JSON.stringify(original),detached:{command:ProductMaintenanceCommand;identity:ReadIdentity}[]=[];
  const editor=new ProductEditorController({scope,originalCommand:original,client:{contractVersion:index===0?1:2,execute:async()=>assert.fail('No automatic POST'),receipt:async()=>assert.fail('No automatic receipt')},newRequestKey:()=>assert.fail('Original key must not be replaced'),onAccessFailure:()=>assert.fail(),onRecoveryRequired:(command,identity)=>detached.push({command,identity})});
  const restored=editor.getSnapshot();assert.equal(restored.phase,'uncertain');assert.equal(JSON.stringify(restored.command),before);assert.notEqual(restored.command,original);assert.equal(Object.isFrozen(restored.command),true);
  if(restored.command?.action==='EDIT'){assert.equal(Object.isFrozen(restored.command.values),true);assert.equal(Object.isFrozen(restored.command.skus),true);assert.equal(restored.command.barcodes[0]!.barcode,'00001234');assert.equal(restored.command.values.prices.retail_price,'0.00');}
  assert.throws(()=>editor.reserveRequestKey());ctx.clear();assert.equal(detached.length,1);assert.equal(JSON.stringify(detached[0]!.command),before);assert.equal(detached[0]!.identity,scope.identity);assert.equal(Object.isFrozen(detached[0]!.identity),true);editor.dispose();assert.equal(detached.length,1);
 }
});
test('restored commands use the original versioned validation and cannot attach to another product target',()=>{
 const ctx=context(),scope=ctx.createScope('restored-product',id(2)),base={scope,client:{contractVersion:1 as const,execute:async()=>result,receipt:async()=>assert.fail()},newRequestKey:()=>assert.fail(),onAccessFailure:()=>assert.fail(),onRecoveryRequired:()=>assert.fail()};
 assert.throws(()=>new ProductEditorController({...base,originalCommand:{...command(),id:id(99)}}),/does not match/);
 assert.throws(()=>new ProductEditorController({...base,originalCommand:{...command(),expectedVersion:0}}));
 const detail=maintenanceDetail(),{seasonId:_,...values}=detail.values;
 const v2:ProductMaintenanceCommand={action:'EDIT',requestKey:'v2-original',id:id(2),expectedVersion:1,values:{...values,seasonIds:null},skus:detail.skus,barcodes:detail.barcodes};
 assert.throws(()=>new ProductEditorController({...base,originalCommand:v2}));ctx.clear();
});
test('route-restored V2 media recovery preserves the original HTTP body/key through absent receipt and explicit retry',async()=>{
 const {createProductMaintenanceHttpClientV2}=await import('./product-maintenance-http-client.ts');
 const ctx=context(),scope=ctx.createScope('original-product',id(2)),calls:{path:string;init:RequestInit}[]=[];let keys=0;const held:{command:ProductMaintenanceCommand;identity:ReadIdentity}[]=[];
 const client=createProductMaintenanceHttpClientV2({origin:'https://erp.example',basePath:'/api',fetch:async(path,init)=>{calls.push({path,init});if(init.method==='GET')return json({error:{code:'RECEIPT_NOT_FOUND',message:'absent'}},404);if(calls.length===1)throw Error('lost reply');return json(result);}});
 const options={client,newRequestKey:()=>`original-media-${++keys}`,onRecoveryRequired:(command:ProductMaintenanceCommand,identity:ReadIdentity)=>held.push({command,identity}),onAccessFailure:()=>assert.fail()};
 const original=new ProductEditorController({...options,scope}),detail=maintenanceDetail(),{seasonId:_,...values}=detail.values;
 await original.submit({action:'EDIT',id:id(2),expectedVersion:1,values:{...values,seasonIds:[id(6)]},skus:detail.skus,barcodes:detail.barcodes,imageChanges:[{action:'ADD',uploadId:id(21),role:'MAIN',colorId:null,displayOrder:0}]});assert.equal(original.getSnapshot().phase,'uncertain');scope.dispose();assert.equal(held.length,1);
 const restored=new ProductEditorController({...options,scope:ctx.createScope('restored-product',id(2)),originalCommand:held[0]!.command});assert.equal(calls.length,1);assert.equal(keys,1);
 await restored.recover();assert.equal(calls[1]!.init.method,'GET');assert.ok(calls[1]!.path.endsWith('/products/receipts/original-media-1'));assert.equal(restored.getSnapshot().phase,'uncertain');assert.equal(restored.getSnapshot().recovery,'absent');
 await restored.retryOriginal();assert.equal(restored.getSnapshot().phase,'committed');assert.equal(calls[2]!.init.body,calls[0]!.init.body);assert.equal(keys,1);ctx.clear();assert.equal(held.length,1,'A confirmed commit must not be handed back as pending');
});
test('identity replacement during restored receipt hands back the old identity and ignores a late commit',async()=>{
 const ctx=context(),scope=ctx.createScope('restored-product',id(2)),held:{command:ProductMaintenanceCommand;identity:ReadIdentity}[]=[];let resolve!:(value:Awaited<ReturnType<ProductMaintenanceClient['receipt']>>)=>void;
 const editor=new ProductEditorController({scope,originalCommand:command(),client:{execute:async()=>assert.fail(),receipt:()=>new Promise(done=>{resolve=done;})},newRequestKey:()=>assert.fail(),onAccessFailure:()=>assert.fail(),onRecoveryRequired:(command,identity)=>held.push({command,identity})});
 const checking=editor.recover();assert.equal(editor.getSnapshot().phase,'checking');ctx.replaceIdentity({accountId:id(1),sessionRevision:'2',permissionRevision:'2'});resolve({...receipt(),action:'DISABLE',status:'COMMITTED'});await checking;
 assert.equal(editor.getSnapshot().phase,'disposed');assert.equal(editor.getSnapshot().result,null);assert.equal(held.length,1);assert.equal(held[0]!.identity.sessionRevision,'1');assert.equal(held[0]!.identity.permissionRevision,'1');assert.equal(held[0]!.command.requestKey,'product-key-1');ctx.clear();
});

test('unknown POST outcome, absent receipt, and explicit replay retain exactly one request key/body', async () => {
  const ctx = context(), scope = ctx.createScope('product-editor'); let allocated = 0; const sent: unknown[] = [], detached: unknown[] = [];
  const client: ProductMaintenanceClient = { execute: async cmd => { sent.push(cmd); if (sent.length === 1) throw new ProductMaintenanceError('network','NETWORK_ERROR','uncertain'); return result; }, receipt: async () => { throw new ProductMaintenanceError('not-found','RECEIPT_NOT_FOUND','read',404); } };
  const editor = new ProductEditorController({ scope, client, newRequestKey: () => `product-key-${++allocated}`, onAccessFailure: () => assert.fail(), onRecoveryRequired: cmd => detached.push(cmd) });
  await editor.submit({ action: 'DISABLE', id: id(2), expectedVersion: 1 }); assert.equal(editor.getSnapshot().phase, 'uncertain');
  await assert.rejects(() => editor.submit({ action: 'RESTORE', id: id(2), expectedVersion: 2 }));
  await editor.recover(); assert.equal(editor.getSnapshot().recovery, 'absent'); assert.equal(editor.getSnapshot().phase, 'uncertain');
  await editor.retryOriginal(); assert.equal(editor.getSnapshot().phase, 'committed'); assert.equal(allocated, 1); assert.deepEqual(sent[0], sent[1]);
  assert.throws(() => editor.resetAfterReload(id(2), Number.NaN)); editor.resetAfterReload(id(2), 2); assert.equal(editor.getSnapshot().phase,'idle'); ctx.clear(); assert.equal(detached.length,0);
});
test('committed receipt recovery finishes without a second POST; mismatched action cannot become success', async () => {
  const ctx = context(), scope = ctx.createScope('product-editor'); let posts = 0;
  const editor = new ProductEditorController({ scope, client: { execute: async () => { posts++; throw new ProductMaintenanceError('timeout','TIMEOUT','uncertain'); }, receipt: async () => ({ ...receipt(), action: 'DISABLE', status: 'COMMITTED' }) }, newRequestKey: () => 'product-key-1', onAccessFailure: () => assert.fail(), onRecoveryRequired: () => {} });
  await editor.submit({ action:'DISABLE',id:id(2),expectedVersion:1 }); await editor.recover(); assert.equal(editor.getSnapshot().phase,'committed'); assert.equal(posts,1); ctx.clear();
  const ctx2 = context(), scope2 = ctx2.createScope('other-product-editor');
  const wrong = new ProductEditorController({ scope: scope2, client: { execute: async () => { throw new ProductMaintenanceError('timeout','TIMEOUT','uncertain'); }, receipt: async () => ({ ...receipt(), action: 'EDIT', status: 'COMMITTED' }) }, newRequestKey: () => 'product-key-1', onAccessFailure: () => assert.fail(), onRecoveryRequired: () => {} });
  await wrong.submit({ action:'DISABLE',id:id(2),expectedVersion:1 }); await wrong.recover(); assert.equal(wrong.getSnapshot().phase,'uncertain'); assert.equal(wrong.getSnapshot().result,null); ctx2.clear();
});
test('identity detach preserves the original pending command and never displays a late success', async () => {
  const ctx = context(), scope = ctx.createScope('product-editor'); let resolve!: (value: typeof result) => void; const detached: unknown[] = [];
  const editor = new ProductEditorController({ scope, client: { execute: () => new Promise(yes => { resolve = yes; }), receipt: async () => assert.fail() }, newRequestKey: () => 'product-key-1', onAccessFailure: () => assert.fail(), onRecoveryRequired: cmd => { assert.equal(editor.getSnapshot().command,null); detached.push(cmd); } });
  const pending = editor.submit({ action:'DISABLE',id:id(2),expectedVersion:1 }); ctx.clear(); resolve(result); await pending;
  assert.equal(editor.getSnapshot().phase,'disposed'); assert.equal(editor.getSnapshot().result,null);
  assert.deepEqual(JSON.parse(JSON.stringify(detached)),[command()]); assert.equal(Object.getPrototypeOf(detached[0]),null); assert.equal(Object.isFrozen(detached[0]),true);
});
test('HTTP paths are exact and response loss is uncertain; receipt is a separate GET with original key', async () => {
  const calls: { path: string; init: RequestInit }[] = [];
  const client = createProductMaintenanceHttpClient({ origin:'https://erp.example',basePath:'/api',fetch:async(path,init)=>{ calls.push({path,init}); if(init.method==='POST')throw Error('response lost'); return json(receipt()); } });
  assert.equal(calls.length,0);
  await assert.rejects(()=>client.execute(command(),new AbortController().signal), error=>error instanceof ProductMaintenanceError && error.outcome==='uncertain');
  assert.equal(calls.length,1); assert.equal(calls[0]!.path,'https://erp.example/api/products/commands'); assert.deepEqual(JSON.parse(calls[0]!.init.body as string),command());
  assert.equal((await client.receipt(command(),new AbortController().signal)).result.version,2); assert.equal(calls[1]!.path,'https://erp.example/api/products/receipts/product-key-1'); assert.equal(calls[1]!.init.method,'GET'); assert.equal(calls[1]!.init.credentials,'same-origin');
});
test('known conflict is rejected; malformed POST success remains uncertain; wrong receipt key rejects', async () => {
  const signal = new AbortController().signal;
  const options = { origin:'https://erp.example',basePath:'/api' };
  const conflict = createProductMaintenanceHttpClient({ ...options,fetch:async()=>json({error:{code:'VERSION_CONFLICT',message:'not shown'}},409) });
  await assert.rejects(()=>conflict.execute(command(),signal),e=>e instanceof ProductMaintenanceError && e.outcome==='rejected' && e.kind==='conflict');
  const malformed = createProductMaintenanceHttpClient({ ...options,fetch:async()=>json({ok:true}) });
  await assert.rejects(()=>malformed.execute(command(),signal),e=>e instanceof ProductMaintenanceError && e.outcome==='uncertain');
  const wrong = createProductMaintenanceHttpClient({ ...options,fetch:async()=>json({...receipt(),requestKey:'wrong-key'}) });
  await assert.rejects(()=>wrong.receipt(command(),signal),e=>e instanceof ProductMaintenanceError && e.outcome==='read');
});
test('pre-send validation/cancel never dispatch; auth headers are authoritative despite invalid body', async () => {
  let calls=0; const options = { origin:'https://erp.example',basePath:'/api',fetch:async()=>{calls++;return new Response('gateway',{status:403});} };
  const client=createProductMaintenanceHttpClient(options), cancelled=new AbortController();cancelled.abort();
  await assert.rejects(()=>client.execute(command(),cancelled.signal),e=>e instanceof ProductMaintenanceError&&e.outcome==='not-sent'); assert.equal(calls,0);
  await assert.rejects(()=>client.execute({...command(),expectedVersion:0},new AbortController().signal),e=>e instanceof ProductMaintenanceError&&e.outcome==='not-sent'); assert.equal(calls,0);
  await assert.rejects(()=>client.execute(command(),new AbortController().signal),e=>e instanceof ProductMaintenanceError&&e.kind==='forbidden'&&e.outcome==='uncertain'); assert.equal(calls,1);
});

function maintenanceDetail(){return {productId:id(2),version:1,deletedAt:null,values:{productCode:'P01',name:'商品',categoryId:id(4),supplierId:id(5),seasonId:id(6),sizeGroupId:id(7),year:2026,systemItemCode:'0001',thickness:null,collarPantsType:null,defaultBarcodeSchemeId:id(8),enabled:true,prices:{purchase_price:null,retail_price:'0.00',wholesale5_price:null,wholesale6_price:null,wholesale7_price:null,wholesale8_price:null,wholesale9_price:null,wholesale10_price:null,minimum_price:null}},skus:[{id:id(9),expectedVersion:1,skuCode:'P01-BLUE-A-S',colorId:id(10),fitId:id(11),sizeId:id(12),enabled:true}],barcodes:[{id:id(13),barcode:'00001234',colorId:id(10),fitId:id(11),sizeId:id(12),kind:'MAIN' as const,schemeId:id(8),enabled:true}],references:{categoryPath:[{id:id(4),name:'上装'}],supplier:{id:id(5),name:'供应商',enabled:true},season:{id:id(6),name:'秋季'},sizeGroup:{id:id(7),name:'上装组'},defaultBarcodeScheme:{id:id(8),name:'已确认方案',ruleVersion:'1',status:'CURRENT'}}};}
test('new maintenance read keeps exact foreign IDs/versions/labels, raw barcode and nine price keys',()=>{
 const value=maintenanceDetail(),detail=validateProductMaintenanceDetail(value,id(2));assert.equal(detail.values.prices.retail_price,'0.00');assert.equal(detail.values.prices.purchase_price,null);assert.equal(detail.barcodes[0]!.barcode,'00001234');assert.equal(detail.skus[0]!.expectedVersion,1);
 assert.throws(()=>validateProductMaintenanceDetail({...value,productId:id(99)},id(2)));
 assert.throws(()=>validateProductMaintenanceDetail({...value,references:{...value.references,supplier:{id:id(99),name:'wrong',enabled:true}}},id(2)));
 assert.throws(()=>validateProductMaintenanceDetail({...value,skus:[{...value.skus[0],id:null,expectedVersion:null}]},id(2)));
 const missing=maintenanceDetail();delete (missing.values.prices as Record<string,unknown>).minimum_price;assert.throws(()=>validateProductMaintenanceDetail(missing,id(2)));
});
test('new maintenance read uses only the exact detail/candidate POST routes and never forwards actor fields',async()=>{
 const ctx=context(),scope=ctx.createScope('maintenance',id(2)),calls:{path:string;body:unknown}[]=[];
 const page={kind:'colors',page:1,pageSize:50,total:1,items:[{id:id(10),name:'蓝',code:'01',parentId:null,version:1}]};
 const reader=createProductMaintenanceHttpReader({origin:'https://erp.example',basePath:'/api',fetch:async(path,init)=>{calls.push({path,body:JSON.parse(init.body as string)});return json(path.endsWith('/detail/query')?maintenanceDetail():page);}});
 assert.equal(calls.length,0);
 const input={parameters:{productId:id(2),role:'ADMIN'},signal:scope.signal,identity:scope.identity,routeInstanceId:scope.routeInstanceId,entityId:id(2)};
 await reader.readDetail(input);assert.deepEqual(calls[0],{path:'https://erp.example/api/products/maintenance/detail/query',body:{productId:id(2)}});
 const data=await reader.readCandidates({...input,parameters:{kind:'colors',search:'蓝',page:1,pageSize:50}});assert.equal(data.items[0]!.name,'蓝');assert.equal(calls[1]!.path,'https://erp.example/api/products/maintenance/candidates/query');ctx.clear();
});

test('media stages raw File bytes under one reserved root key; uncertain V2 replay retains the exact media body',async()=>{
 const {createProductMaintenanceHttpClientV2,createProductMediaUploadHttpClient}=await import('./product-maintenance-http-client.ts');
 const ctx=context(),scope=ctx.createScope('product-media',id(2)),calls:{path:string;init:RequestInit}[]=[];let allocated=0,posts=0;
 const file=new File([new Uint8Array([137,80,78,71])],'transport-only.png',{type:'image/png'});
 const options={origin:'https://erp.example',basePath:'/api',fetch:async(path:string,init:RequestInit)=>{calls.push({path,init});
  if(path.endsWith('/products/media/uploads'))return json({uploadId:id(14),mime:'image/png',byteSize:String(file.size),expiresAt:'2026-10-24T06:00:00Z'});
  if(init.method==='GET')return json({error:{code:'RECEIPT_NOT_FOUND',message:'absent'}},404);
  posts++;if(posts===1)throw Error('explicit synthetic lost reply');return json(result);
 }};
 const client=createProductMaintenanceHttpClientV2(options),editor=new ProductEditorController({scope,client,newRequestKey:()=>`product-media-${++allocated}`,onRecoveryRequired:()=>assert.fail('still mounted'),onAccessFailure:()=>assert.fail('synthetic authenticated request')});
 const key=editor.reserveRequestKey();assert.equal(editor.reserveRequestKey(),key);assert.equal(allocated,1);
 const staged=await createProductMediaUploadHttpClient(options)({file,productId:id(2),commandKey:key,uploadKey:'file-one',signal:scope.signal});
 assert.equal(calls[0]!.path,'https://erp.example/api/products/media/uploads');assert.equal(calls[0]!.init.body,file);assert.equal(calls[0]!.init.credentials,'same-origin');assert.deepEqual(calls[0]!.init.headers,{Accept:'application/json','Content-Type':'image/png','x-command-key':key,'x-upload-key':'file-one','x-product-id':id(2)});
 const detail=maintenanceDetail(),{seasonId:_,...values}=detail.values;
 await editor.submit({action:'EDIT',id:id(2),expectedVersion:1,values:{...values,seasonIds:null},skus:detail.skus,barcodes:detail.barcodes,imageChanges:[{action:'ADD',uploadId:staged.uploadId,role:'MAIN',colorId:null,displayOrder:0}]});
 assert.equal(editor.getSnapshot().phase,'uncertain');assert.throws(()=>editor.reserveRequestKey());const original=editor.getSnapshot().command!;
 assert.equal(original.requestKey,key);assert.equal(calls[1]!.path,'https://erp.example/api/products/v2/commands');assert.equal('file' in JSON.parse(calls[1]!.init.body as string),false);
 await editor.recover();assert.equal(editor.getSnapshot().recovery,'absent');assert.equal(calls[2]!.path,`https://erp.example/api/products/receipts/${key}`);
 await editor.retryOriginal();assert.equal(editor.getSnapshot().phase,'committed');assert.equal(editor.getSnapshot().command,original);assert.equal(calls[3]!.init.body,calls[1]!.init.body);assert.equal(allocated,1);editor.resetAfterReload(id(2),2);assert.equal(editor.reserveRequestKey(),'product-media-2');assert.equal(allocated,2);ctx.clear();
});

test('upload CREATE omits product header and preserves actual missing/deleted server errors',async()=>{
 const {createProductMediaUploadHttpClient}=await import('./product-maintenance-http-client.ts');const calls:RequestInit[]=[];let status=200;
 const file=new File(['transport fixture only'],'transport-only.webp',{type:'image/webp'}),signal=new AbortController().signal;
 const upload=createProductMediaUploadHttpClient({origin:'https://erp.example',basePath:'/api',fetch:async(_path,init)=>{calls.push(init);return status===200?json({uploadId:id(15),mime:'image/webp',byteSize:String(file.size),expiresAt:'2026-10-24T06:00:00Z'}):json({error:{code:status===404?'PRODUCT_NOT_FOUND':'PRODUCT_DELETED',message:'explicit synthetic rejection'}},status);}});
 const input={file,productId:null,commandKey:'create-media-key',uploadKey:'create-file-key',signal};await upload(input);assert.equal(Object.hasOwn(calls[0]!.headers!,'x-product-id'),false);assert.equal(calls[0]!.body,file);
 status=404;await assert.rejects(()=>upload({...input,productId:id(2)}),e=>e instanceof ProductMaintenanceError&&e.kind==='not-found'&&e.code==='PRODUCT_NOT_FOUND');
 status=409;await assert.rejects(()=>upload({...input,productId:id(2)}),e=>e instanceof ProductMaintenanceError&&e.kind==='conflict'&&e.code==='PRODUCT_DELETED');
});


test('ordinary readonly product projection carries optional native fields without maintenance authority',async()=>{
 const {createProductHttpReader}=await import('../transport/product-http-reader.ts');const ctx=context(),scope=ctx.createScope('product-ordinary-read',id(2));let legacy=false;const paths:string[]=[];
 const base={productId:id(2),code:'000-P02',name:'来源商品',categoryLabel:null,yearLabel:null,seasonLabel:null,supplierLabel:null,systemCode:null,retailPrice:'0.00'};
 const sourceImage={id:id(16),label:'来源配图',thumbnailUrl:'https://erp.example/api/products/media/controlled-thumb'};
 const reader=createProductHttpReader({origin:'https://erp.example',basePath:'/api',fetch:async path=>{paths.push(path);return json(path.endsWith('/basics/query')?{...base,...(!legacy?{thickness:'薄',collarPantsType:'圆领'}:{})}:{productId:id(2),images:[{...sourceImage,...(!legacy?{role:'COLOR',colorId:id(10)}:{})}]});}});
 const read={parameters:{productId:id(2)},signal:scope.signal,identity:scope.identity,routeInstanceId:scope.routeInstanceId,entityId:scope.entityId};
 const details=await reader.readProductBasics(read),images=await reader.readProductImages(read);assert.equal(details!.thickness,'薄');assert.equal(details!.collarPantsType,'圆领');assert.equal(details!.retailPrice,'0.00');assert.equal(images!.images[0]!.role,'COLOR');assert.equal(images!.images[0]!.colorId,id(10));
 legacy=true;const oldBase=await reader.readProductBasics(read),oldImages=await reader.readProductImages(read);assert.equal(Object.hasOwn(oldBase!,'thickness'),false);assert.equal(Object.hasOwn(oldBase!,'collarPantsType'),false);assert.equal(Object.hasOwn(oldImages!.images[0]!,'role'),false);assert.equal(Object.hasOwn(oldImages!.images[0]!,'colorId'),false);assert.ok(paths.every(path=>!path.includes('/maintenance/')));ctx.clear();
});
