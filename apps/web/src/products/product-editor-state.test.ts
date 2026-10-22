import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../loading/read-scope.ts';
import { ProductEditorController } from './product-editor-state.ts';
import { ProductMaintenanceError, type ProductMaintenanceCommand, type ProductMaintenanceClient } from './product-editor-contracts.ts';
import { createProductMaintenanceHttpClient, createProductMaintenanceHttpReader, validateProductMaintenanceDetail } from './product-maintenance-http-client.ts';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = () => new ReadContext({ accountId: id(1), sessionRevision: '1', permissionRevision: '1' });
const command = (requestKey = 'product-key-1') => ({ action: 'DISABLE' as const, id: id(2), expectedVersion: 1, requestKey });
const result = { operationId: id(3), kind: 'PRODUCT' as const, targetId: id(2), version: 2 };
const receipt = () => ({ requestKey: 'product-key-1', action: 'DISABLE', status: 'COMMITTED', completedAt: '2026-10-22T06:00:00Z', result });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

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

function maintenanceDetail(){return {productId:id(2),version:1,deletedAt:null,values:{productCode:'P01',name:'商品',categoryId:id(4),supplierId:id(5),seasonId:id(6),sizeGroupId:id(7),year:2026,systemItemCode:'0001',thickness:null,collarPantsType:null,defaultBarcodeSchemeId:id(8),enabled:true,prices:{purchase_price:null,retail_price:'0.00',wholesale5_price:null,wholesale6_price:null,wholesale7_price:null,wholesale8_price:null,wholesale9_price:null,wholesale10_price:null,minimum_price:null}},skus:[{id:id(9),expectedVersion:1,skuCode:'P01-BLUE-A-S',colorId:id(10),fitId:id(11),sizeId:id(12),enabled:true}],barcodes:[{id:id(13),barcode:'00001234',colorId:id(10),fitId:id(11),sizeId:id(12),kind:'MAIN',schemeId:id(8),enabled:true}],references:{categoryPath:[{id:id(4),name:'上装'}],supplier:{id:id(5),name:'供应商',enabled:true},season:{id:id(6),name:'秋季'},sizeGroup:{id:id(7),name:'上装组'},defaultBarcodeScheme:{id:id(8),name:'已确认方案',ruleVersion:'1',status:'CURRENT'}}};}
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
