import assert from 'node:assert/strict';
import test from 'node:test';
import { createSalesQueryService } from '../packages/application/src/sales-query-service.ts';
import { createTransferQueryService } from '../packages/application/src/transfer-query-service.ts';
import { parseOrdinarySalesTotalsQuery, parseOrdinaryTransferTotalsQuery } from '../packages/application/src/ordinary-document-query-validation.ts';
import { documentListWire } from '../apps/api/src/document-list-wire.ts';
import { DomainError } from '../packages/domain/src/errors.ts';
import { actor } from './support/synthetic-fixtures.ts';
const revision='a'.repeat(64);
for (const kind of ['sales','transfer'] as const) {
 const filter=kind==='sales'?{startDate:null,endDate:null,statuses:[],businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[],number:null}:{startDate:null,endDate:null,statuses:[],fromWarehouseIds:[],toWarehouseIds:[],number:null};
 test(`ordinary ${kind}: strict totals parser freezes filter, no scope grant`,()=>{
  const parse=kind==='sales'?parseOrdinarySalesTotalsQuery:parseOrdinaryTransferTotalsQuery;
  const input={filter:structuredClone(filter),expectedRevision:revision};const parsed=parse(input);input.filter.statuses.push('VOID' as never);assert.deepEqual(parsed.filter.statuses,[]);assert.ok(Object.isFrozen(parsed));assert.ok(Object.isFrozen(parsed.filter));
  for(const bad of [null,[],{filter,expectedRevision:revision,pageSize:20},{filter,expectedRevision:revision.toUpperCase()},{filter,expectedRevision:revision,actor},{filter:{...filter,scope:'all'},expectedRevision:revision}])assert.throws(()=>parse(bad),{code:kind==='sales'?'INVALID_SALES_QUERY':'INVALID_TRANSFER_QUERY'});
 });
 test(`ordinary ${kind}: absent reader fails after authorization; denial and abort prevent totals`,async()=>{
  let policies=0,reads=0;let deny=false;
  const reader={async readList(){throw Error();},async readDetail(){throw Error();},async readHistory(){throw Error();},async readReferences(){throw Error();},async readWarehouses(){throw Error();},async readSettlementStatistics(){throw Error();}};
  const dependencies={reader,authorization:{async authorize(){policies++;if(deny)throw new DomainError('FORBIDDEN','denied');return {kind:'all' as const};}}};
  const service=kind==='sales'?createSalesQueryService(dependencies):createTransferQueryService(dependencies);
  const input={filter,expectedRevision:revision};const trusted={...actor,role:'ADMIN' as const};
  await assert.rejects(()=>service.readTotals(trusted,input,new AbortController().signal),{code:'ORDINARY_DOCUMENTS_NOT_READY'});assert.equal(policies,1);
  Object.assign(reader,{async readTotals(){reads++;throw Error('must not run');}});deny=true;
  await assert.rejects(()=>service.readTotals(trusted,input,new AbortController().signal),{code:'FORBIDDEN'});assert.equal(reads,0);
  const controller=new AbortController();controller.abort();const before=policies;await assert.rejects(()=>service.readTotals(trusted,input,controller.signal));assert.equal(policies,before);
 });
}
test('ordinary wire rejects HISTORY and legacy fallback; strips per-page totals while retaining negotiated summaries',()=>{
 const item={dataset:'LIVE',batchId:null,productSummary:{productCount:0n,items:[],hasMore:false},categorySummary:{categoryCount:0n,basis:'CURRENT',metric:'QUANTITY',items:[],hasMore:false}};
 const page={profile:'ORDINARY_DOCUMENT_LIST_V1',page:1,pageSize:20,exactTotal:0n,readRevision:revision,items:[item],historyCoverage:'PUBLISHED_AUTHORIZED',totals:{quantity:1n}};
 const wire=documentListWire(page,'category-v2','ordinary-v1','ordinary-v1') as Record<string,unknown>;assert.ok(!('totals'in wire));assert.ok(!('historyCoverage'in wire));assert.deepEqual(wire.items,[item]);
 assert.throws(()=>documentListWire({...page,items:[{...item,dataset:'HISTORY'}]},'category-v2','ordinary-v1','ordinary-v1'));
 assert.throws(()=>documentListWire({...page,profile:undefined},'category-v2','ordinary-v1','ordinary-v1'));
 assert.throws(()=>documentListWire(page,'category-v2','ordinary-v1',undefined),{code:'INVALID_DOCUMENT_LIST_PROFILE'});
});
