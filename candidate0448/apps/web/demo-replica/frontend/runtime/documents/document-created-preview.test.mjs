/** Actual finite preview factories only; no listener, browser or database. */
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'document-created-preview-')),bundle=join(dir,'entry.mjs');
after(()=>rmSync(dir,{recursive:true,force:true}));
await build({stdin:{contents:"export {createReplicaPreviewTransport} from '../../runtime-preview-transport.ts';export {qaCurrentSkus,qaHalls,qaCustomers,qaWarehouses,qaStaff} from '../../qa-reference-fixtures.mts';",resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:bundle,logLevel:'silent'});
const {createReplicaPreviewTransport,qaCurrentSkus,qaHalls,qaCustomers,qaWarehouses,qaStaff}=await import(pathToFileURL(bundle).href);
function fixture(){const transport=createReplicaPreviewTransport();return {transport,async request(path,body,method='POST'){
 const response=await transport.http.fetch(transport.http.origin+'/api'+path,{method,credentials:'same-origin',headers:{'content-type':'application/json','x-naijue-document-summary':'category-v2'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;
}};}
const salesFilter={startDate:null,endDate:null,statuses:[],businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[],number:null};
const transferFilter={startDate:null,endDate:null,statuses:[],fromWarehouseIds:[],toWarehouseIds:[],number:null};
test('saved sales is returned at the globally ordered first page even when its business date is older',async()=>{
 const f=fixture(),sku=qaCurrentSkus()[0],requestKey='SYNTHETIC.created.sales';
 const draft=await f.request('/sales/prepare-create',{businessType:'SALE',businessDate:'2020-01-01',hallId:qaHalls[0].id,customerId:qaCustomers[0].id,salespersonId:qaStaff[0].id,warehouseId:qaWarehouses[0].id,note:null,orderDiscount:'0.00',lines:[{skuId:sku.id,quantity:'1',pricingRule:'UNIT_PRICE',dealPrice:'10.00',discountTenths:null,isGift:false,zeroConfirmed:false}],settlements:[]});
 const result=await f.request('/sales/commands',{action:'SAVE',expectedVersion:null,requestKey,draft});
 const receipt=await f.request('/sales/receipts/'+requestKey,null,'GET');
 const listed=await f.request('/sales/query',{filter:salesFilter,page:1,pageSize:20});
 assert.equal(listed.items[0].documentId,result.salesId);assert.equal(listed.items[0].businessDate,'2020-01-01');
 assert.equal(listed.items[0].updatedAt,receipt.completedAt);assert.equal('createdAt' in listed.items[0],false,'Do not widen the strict sales-list wire');
 const second=await f.request('/sales/query',{filter:salesFilter,page:2,pageSize:20});
 assert.equal(second.items.some(row=>row.documentId===result.salesId),false);
 assert.equal(new Set([...listed.items,...second.items].map(row=>JSON.stringify([row.dataset,row.batchId,row.documentId]))).size,listed.items.length+second.items.length);
});
test('saved transfer is returned at the globally ordered first page with its receipt creation instant',async()=>{
 const f=fixture(),sku=qaCurrentSkus()[0],requestKey='SYNTHETIC.created.transfer';
 const draft=await f.request('/transfers/prepare-create',{businessDate:'2020-01-01',fromWarehouseId:qaWarehouses[0].id,toWarehouseId:qaWarehouses[1].id,note:null,lines:[{skuId:sku.id,quantity:'1'}]});
 const result=await f.request('/transfers/commands',{action:'SAVE',expectedVersion:null,requestKey,draft});
 const receipt=await f.request('/transfers/receipts/'+requestKey,null,'GET');
 const listed=await f.request('/transfers/query',{filter:transferFilter,page:1,pageSize:20});
 assert.equal(listed.items[0].documentId,result.transferId);assert.equal(listed.items[0].businessDate,'2020-01-01');
 assert.equal(listed.items[0].createdAt,receipt.completedAt);assert.equal(listed.items[0].updatedAt,receipt.completedAt);
});
