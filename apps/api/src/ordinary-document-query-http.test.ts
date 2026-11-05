import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { createSalesQueryHttpPlugin } from './sales-query-http.ts';
import { createTransferQueryHttpPlugin } from './transfer-query-http.ts';
import { DomainError } from '../../../packages/domain/src/errors.ts';
import { actor, ids } from '../../../tests/support/synthetic-fixtures.ts';
const revision = 'a'.repeat(64);
const salesFilter = { startDate:null,endDate:null,statuses:[],businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[],number:null };
const transferFilter = { startDate:null,endDate:null,statuses:[],fromWarehouseIds:[],toWarehouseIds:[],number:null };
for (const kind of ['sales','transfers'] as const) {
 test(`SYNTHETIC ordinary ${kind}: separate totals, neutral LIST scope, strict wire and fail closed`, async t => {
  const filter = kind==='sales'?salesFilter:transferFilter;
  const intents: unknown[]=[]; let calls=0; let failure:string|null=null;
  const page={profile:'ORDINARY_DOCUMENT_LIST_V1' as const,page:3,pageSize:20,exactTotal:9007199254740993n,readRevision:revision,items:[]};
  const reader={async readList(){return page;},async readTotals(read: {parameters: unknown;scope: unknown}){calls++;assert.deepEqual(read.parameters,{filter,expectedRevision:revision});assert.deepEqual(read.scope,{kind:'restricted',clauses:[kind==='sales'?{hallId:ids.hall}:{fromHallId:ids.hall}]});if(failure)throw new DomainError(failure,'PRIVATE SQL');return {profile:'ORDINARY_DOCUMENT_TOTALS_V1' as const,readRevision:revision,exactTotal:9007199254740993n,totals:kind==='sales'?{quantity:null,incomingQuantity:null,outgoingQuantity:null,grossAmount:2n,orderDiscount:0n,netDue:2n}:{totalQuantity:2n}};},async readReferences(){throw Error();},async readDetail(){throw Error();},async readHistory(){throw Error();},async readSettlementStatistics(){throw Error();},async readWarehouses(){throw Error();}};
  const options={listProfile:'ordinary-v1' as const,authenticate:async()=>({...actor,role:'ADMIN' as const}),dependencies:{authorization:{async authorize(_actor:unknown,intent:unknown){intents.push(intent);return {kind:'restricted' as const,clauses:[kind==='sales'?{hallId:ids.hall}:{fromHallId:ids.hall}]};}},reader}};
  const app=Fastify();t.after(()=>app.close());
  // The kind-specific synthetic reader returns only its matching totals shape.
  app.register(kind==='sales'?createSalesQueryHttpPlugin(options as unknown as Parameters<typeof createSalesQueryHttpPlugin>[0]):createTransferQueryHttpPlugin(options as unknown as Parameters<typeof createTransferQueryHttpPlugin>[0]));
  const post=(url:string,body:unknown,profile: string|undefined='ordinary-v1')=>app.inject({method:'POST',url,payload:body as object,headers:profile?{'x-naijue-document-list':profile}:{}});
  const listed=await post(`/${kind}/query`,{filter,page:3,pageSize:20});assert.equal(listed.statusCode,200);assert.deepEqual(Object.keys(listed.json()).sort(),['profile','page','pageSize','exactTotal','readRevision','items'].sort());assert.equal(listed.json().exactTotal,'9007199254740993');
  assert.equal((await post(`/${kind}/query`,{filter,page:3,pageSize:20},'wrong')).statusCode,400);
  assert.equal((await post(`/${kind}/query`,{filter,page:3,pageSize:20},'')).statusCode,400);
  assert.equal((await post(`/${kind}/totals/query`,{filter,expectedRevision:revision},'')).statusCode,400);
  const totals=await post(`/${kind}/totals/query`,{filter,expectedRevision:revision});assert.equal(totals.statusCode,200);assert.equal(totals.json().exactTotal,'9007199254740993');assert.equal(totals.headers['cache-control'],'no-store');assert.deepEqual(intents.at(-1),{kind:'list',parameters:{filter,page:1,pageSize:20}});
  const before=calls;for(const invalid of [{filter,expectedRevision:revision,page:1},{filter,expectedRevision:'x'},{filter,expectedRevision:revision,scope:{kind:'all'}}])assert.equal((await post(`/${kind}/totals/query`,invalid)).statusCode,400);assert.equal(calls,before);
  for(const [code,status] of [['ORDINARY_DOCUMENTS_NOT_READY',503],['ORDINARY_READ_CHANGED',409],['DOCUMENT_READ_CHANGED',409]] as const){failure=code;const res=await post(`/${kind}/totals/query`,{filter,expectedRevision:revision});assert.equal(res.statusCode,status);assert.ok(!res.body.includes('PRIVATE'));}
 });
}
for (const kind of ['sales','transfers'] as const) {
 test(`SYNTHETIC ${kind}: ordinary omits history route entirely; independent legacy retains it`, async t => {
  for (const ordinary of [true,false]) {
   let histories=0;let policies=0;
   const readHistory=async()=>{histories++;return {page:1,pageSize:20,exactTotal:0n,items:[]};};
   const reader={async readList(){throw Error();},async readTotals(){throw Error();},async readReferences(){throw Error();},async readDetail(){throw Error();},async readSettlementStatistics(){throw Error();},async readWarehouses(){throw Error();},readHistory};
   const options={...(ordinary?{listProfile:'ordinary-v1' as const}:{}),authenticate:async()=>({...actor,role:'ADMIN' as const}),dependencies:{authorization:{async authorize(){policies++;return {kind:'all' as const};}},reader}};
   const app=Fastify();t.after(()=>app.close());app.register(kind==='sales'?createSalesQueryHttpPlugin(options as unknown as Parameters<typeof createSalesQueryHttpPlugin>[0]):createTransferQueryHttpPlugin(options as unknown as Parameters<typeof createTransferQueryHttpPlugin>[0]));await app.ready();
   const url=`/${kind}/history/query`;assert.equal(app.hasRoute({method:'POST',url}),!ordinary);
   const response=await app.inject({method:'POST',url,payload:{[kind==='sales'?'salesId':'transferId']:ids.sales,page:1,pageSize:20}});
   assert.equal(response.statusCode,ordinary?404:200);assert.equal(histories,ordinary?0:1);assert.equal(policies,ordinary?0:1);
  }
 });
 test(`SYNTHETIC ${kind}: ordinary plugin requires no historical provider`,async t=>{
  const reader={async readList(){return {profile:'ORDINARY_DOCUMENT_LIST_V1' as const,page:1,pageSize:20,exactTotal:0n,readRevision:revision,items:[]};},async readTotals(){throw Error();},async readReferences(){throw Error();},async readDetail(){throw Error();},async readSettlementStatistics(){throw Error();},async readWarehouses(){throw Error();}};
  const options={listProfile:'ordinary-v1' as const,authenticate:async()=>({...actor,role:'ADMIN' as const}),dependencies:{authorization:{async authorize(){return {kind:'all' as const};}},reader}};
  const app=Fastify();t.after(()=>app.close());app.register(kind==='sales'?createSalesQueryHttpPlugin(options as unknown as Parameters<typeof createSalesQueryHttpPlugin>[0]):createTransferQueryHttpPlugin(options as unknown as Parameters<typeof createTransferQueryHttpPlugin>[0]));await app.ready();
  assert.equal(app.hasRoute({method:'POST',url:`/${kind}/history/query`}),false);
  const {listProfile: _profile,...legacyOptions}=options;
  const legacy=Fastify();t.after(()=>legacy.close());legacy.register(kind==='sales'?createSalesQueryHttpPlugin(legacyOptions as unknown as Parameters<typeof createSalesQueryHttpPlugin>[0]):createTransferQueryHttpPlugin(legacyOptions as unknown as Parameters<typeof createTransferQueryHttpPlugin>[0]));
  const missing=await legacy.inject({method:'POST',url:`/${kind}/history/query`,payload:{[kind==='sales'?'salesId':'transferId']:ids.sales,page:1,pageSize:20}});
  assert.equal(missing.statusCode,503);assert.equal(missing.json().error.code,kind==='sales'?'SALES_HISTORY_UNAVAILABLE':'TRANSFER_HISTORY_UNAVAILABLE');
 });
}
