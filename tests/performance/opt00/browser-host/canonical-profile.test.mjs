import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpProfile,routeProfile,profileDigest} from '../http-profile.mjs';
import {routeCanonicalProfile} from './canonical-profile.mjs';
import {normalSalesResponse,normalTransferResponse,createNormalListReader} from '../../../../apps/web/demo-replica/frontend/runtime/documents/normal-list-reader.ts';
const salesFilter={startDate:null,endDate:null,statuses:[],businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[],number:null};
const transferFilter={startDate:null,endDate:null,statuses:[],fromWarehouseIds:[],toWarehouseIds:[],number:null};
for(const kind of ['sales','transfer'])for(const shape of ['few','distinct30','lines200'])test(`canonical ${kind}/${shape}: actual normal decoder/HTTP reader, snapshots, full-filter totals, no frozen DTO mutation`,async()=>{
  const profile=createHttpProfile(kind,shape),digest=profileDigest(profile),endpoint=kind==='sales'?'/sales/query':'/transfers/query',q={page:1,pageSize:20,filter:kind==='sales'?salesFilter:transferFilter};
  const decode=kind==='sales'?normalSalesResponse:normalTransferResponse,headers={'x-naijue-document-summary':'category-v2'};
  const normal=routeCanonicalProfile(profile,endpoint,q,headers);decode(normal.body,q);assert.equal(normal.body.historyCoverage,'NOT_PUBLISHED');assert.equal(normal.body.items[0].dataset,'LIVE');assert.equal(normal.body.items[0].batchId,null);assert.equal(normal.body.items[0].productSummary.productCount,String(profile.oracle.productCount));assert.equal(normal.body.items[0].productSummary.items[0].productNameSnapshot,profile.detail.document.lines[0].snapshot.productName);assert.equal(Object.hasOwn(normal.body.items[0],'categorySummary'),false);
  const page2={...q,page:2};const next=routeCanonicalProfile(profile,endpoint,page2,headers);decode(next.body,page2);assert.deepEqual(next.body.items,[]);assert.deepEqual(next.body.totals,normal.body.totals);
  const missing={...q,filter:{...q.filter,number:'DOES-NOT-EXIST'}};const empty=routeCanonicalProfile(profile,endpoint,missing,headers);decode(empty.body,missing);assert.equal(empty.body.exactTotal,'0');assert.ok(Object.values(empty.body.totals).every(value=>value==='0'));
  assert.deepEqual(routeCanonicalProfile(profile,endpoint,q).body,routeProfile(profile,endpoint,q).body,'Original native readers do not receive the normal envelope');
  const calls=[];const reader=createNormalListReader({origin:'https://synthetic-opt00.invalid',basePath:'/api',fetch:async(url,init)=>{const body=JSON.parse(init.body);const header=new Headers(init.headers).get('x-naijue-document-summary');calls.push(header);const value=routeCanonicalProfile(profile,new URL(url).pathname.slice(4),body,{'x-naijue-document-summary':header});return new Response(JSON.stringify(value.body),{status:value.status,headers:{'content-type':'application/json'}});}});
  const read={parameters:q,signal:new AbortController().signal,identity:{accountId:profile.principal.accountId,sessionRevision:'SYNTHETIC',permissionRevision:'SYNTHETIC'},routeInstanceId:'OPT00-TEST',entityId:null};await (kind==='sales'?reader.readSales(read):reader.readTransfers(read));assert.deepEqual(calls,['category-v2']);assert.equal(profileDigest(profile),digest);
});
