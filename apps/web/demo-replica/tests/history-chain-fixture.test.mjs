/** Original HTTP/service/planner consumption with finite memory only: NOT PG or real authorization. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHistoryChainFixture,SYNTHETIC_HISTORY_TARGET} from './history-chain-fixture.mjs';
import {createUnifiedServiceFixture,UNIFIED_ORIGIN} from './unified-service-fixture.mjs';
import {createHistorySyntheticPublicConfiguration} from './history-synthetic-public-config.mjs';
import {qaPrincipal,qaSkus,qaGroups,qaStaff,qaTransferWarehouses} from '../frontend/qa-reference-fixtures.mts';
import {requireDomain} from '../../../../packages/domain/src/errors.ts';
import {createHistoryReader,collectHistoryDocument} from '../frontend/runtime/documents/history-reader.ts';
import {historicalTransferProjection} from '../frontend/runtime/documents/history-transfer-model.ts';
const id=n=>`72000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={accountId:qaPrincipal.accountId,hallId:null};
const detailQuery=(documentId=SYNTHETIC_HISTORY_TARGET.documentId)=>({documentId,linePage:1,linePageSize:200,settlementPage:1,settlementPageSize:200});
const listQuery={page:1,pageSize:20,filter:{startDate:null,endDate:null,number:null,statuses:[],fromWarehouseIds:[],toWarehouseIds:[]}};
const command=patch=>({kind:'transfers',documentId:SYNTHETIC_HISTORY_TARGET.documentId,expectedVersion:1,requestKey:'synthetic-history-command',reason:'SYNTHETIC fixture correction only',lines:[],totals:null,settlements:[],...patch});
const call=async(h,path,body,headers={})=>{const r=await h.request({url:UNIFIED_ORIGIN+'/api'+path,method:'POST',headers:{'content-type':'application/json',origin:UNIFIED_ORIGIN,...headers},body:JSON.stringify(body)});return {...r,body:JSON.parse(r.body)};};
const revise=(h,c,headers)=>call(h,'/imported-history/transfers/revise',c,headers);
const detail=h=>call(h,'/imported-history/transfers/detail/query',detailQuery());
async function fixture(t,options={}){
 const skus=structuredClone(qaSkus),groups=structuredClone(qaGroups);
 const references={skus:()=>skus,staff:()=>qaStaff,catalog:()=>({sizeGroups:groups.map(g=>({sizeGroupId:g.id,name:g.name,members:g.sizes.map(s=>({sizeId:s.id,name:s.name,displayOrder:s.displayOrder}))}))})};
 let permitted=true;
 const h=await createHistoryChainFixture({syntheticOnly:true,origin:UNIFIED_ORIGIN,actor,sourceSkuId:skus[0].id,warehouses:qaTransferWarehouses,references,assertAllowed(input,signal){requireDomain(permitted&&!signal.aborted&&input.accountId===actor.accountId&&input.hallId===null,'FORBIDDEN','Explicit synthetic test identity required');},...options});
 t.after(()=>h.close());return {h,skus,groups,deny:()=>{permitted=false;}};
}
const fetchFor=h=>async(url,init={})=>{const r=await h.request({url:String(url),method:init.method??'GET',headers:Object.fromEntries(new Headers(init.headers)),...(init.body===undefined?{}:{body:String(init.body)})});return new Response(r.body,{status:r.status,headers:r.headers});};

test('history presentation is explicit synthetic-only; unchanged unified default has no producer',async t=>{
 const base=JSON.parse(await readFile(new URL('./unified-service-public-config.json',import.meta.url),'utf8'));
 const before=structuredClone(base),config=createHistorySyntheticPublicConfiguration(base);
 assert.deepEqual(base,before);assert.equal(base.routes.historyRevision,undefined);assert.deepEqual(config.routes.historyRevision,{transfers:true});
 assert.throws(()=>createHistorySyntheticPublicConfiguration({...base,http:{...base.http,origin:'https://production.example'}}));
 assert.throws(()=>createHistorySyntheticPublicConfiguration({...base,routes:{...base.routes,transfers:false,transferManualCreate:false,transferExistingEdit:false,transferProductFullPage:false}}));
 const h=await createUnifiedServiceFixture();t.after(()=>h.close());assert.equal(h.history,undefined);
 assert.equal((await detail(h)).status,501);
 await assert.rejects(createUnifiedServiceFixture({syntheticHistory:'true'}),{code:'FORBIDDEN'});
 await assert.rejects(createHistoryChainFixture({syntheticOnly:false,origin:UNIFIED_ORIGIN}),{code:'FORBIDDEN'});
});

test('explicit unified profile uses original HISTORY producer/readback and normal list, without inventory effects',async t=>{
 const h=await createUnifiedServiceFixture({syntheticHistory:true});t.after(()=>h.close());const initial=h.inventory.snapshot(),source=h.history.snapshot().source;
 const before=await detail(h);assert.equal(before.status,200,JSON.stringify(before.body));assert.match(before.headers['x-data-source'],/NOT-PG-NOT-PRODUCTION/);
 assert.deepEqual(before.body.document.createdBy,{state:'UNKNOWN',staffId:null});assert.equal(before.body.document.createdInstant,null);
 const list=await call(h,'/transfers/query',listQuery,{'x-naijue-document-summary':'category-v2'});assert.equal(list.status,200,JSON.stringify(list.body));
 const row=list.body.items.find(row=>row.dataset==='HISTORY');assert.equal(row.documentId,source.documentId);assert.equal(row.createdAt,null);assert.equal(row.categorySummary.categoryCount,null);
 const saved=await revise(h,command({header:{note:'SYNTHETIC revised note'}}));assert.equal(saved.status,200,JSON.stringify(saved.body));assert.deepEqual(saved.body.ledgerEntryIds,[]);
 const after=await detail(h);assert.equal(after.body.document.note,'SYNTHETIC revised note');assert.equal(after.body.document.version,2);assert.deepEqual(after.body.lines,before.body.lines);
 assert.deepEqual(h.history.snapshot().source,source);assert.deepEqual(h.inventory.snapshot(),initial);
 const changed=await call(h,'/transfers/query',listQuery);assert.equal(changed.body.items.find(row=>row.dataset==='HISTORY').effectiveVersion,2);
 assert.equal((await call(h,'/transfers/query',{...listQuery,extra:true})).status,400);
 const malformed=await h.request({url:UNIFIED_ORIGIN+'/api/transfers/query',method:'POST',headers:{'content-type':'application/json'},body:'{'});assert.equal(malformed.status,400);
 h.revoke();assert.equal((await revise(h,command({header:{note:'denied'}}))).status,403);assert.deepEqual(h.inventory.snapshot(),initial);
});

test('full lines preserve source identity and duplicate SKU lanes; V2 has complete frozen groups',async t=>{
 const {h,skus,groups}=await fixture(t),before=h.snapshot(),sourceLine=before.source.lines[0],sourceRead=(await detail(h)).body;
 const c=command({header:{note:'SYNTHETIC duplicate SKU'},lineSet:[{...sourceLine,quantity:'3'},{lineId:null,skuId:sourceLine.skuId,quantity:'4'},{lineId:null,skuId:sourceLine.skuId,quantity:'5'}]});
 const saved=await revise(h,c);assert.equal(saved.status,200,JSON.stringify(saved.body));const read=(await detail(h)).body;
 assert.equal(read.lineCatalog.basis,'HISTORY_EFFECTIVE_SKU_IDENTITY_V2');assert.equal(read.lines.total,'3');assert.equal(new Set(read.lines.items.map(row=>row.id)).size,3);
 assert.deepEqual(read.lineCatalog.items[0].origin,{kind:'SOURCE',sourceLineId:sourceLine.lineId});assert.equal(read.lines.items[0].id,sourceLine.lineId);
 assert.deepEqual(read.lineCatalog.items.slice(1).map(row=>row.origin),Array(2).fill({kind:'REVISION',createdRevisionId:saved.body.revisionId}));
 assert.equal(read.lineCatalog.currentGroups[0].sizes.length,groups[0].sizes.length);assert.deepEqual(read.lineCatalog.groups,sourceRead.lineCatalog.groups);
 const projection=historicalTransferProjection({lines:read.lines.items,lineCatalog:read.lineCatalog});assert.equal(projection.state,'COMPLETE');assert.equal(projection.sections.flatMap(s=>s.rows).length,3);assert.equal(projection.productCount,1);
 skus[0].productName='CURRENT NAME MUST NOT REWRITE HISTORY';groups[0].sizes[0].name='CURRENT SIZE MUST NOT REWRITE HISTORY';
 const stable=(await detail(h)).body;assert.deepEqual(stable,read);assert.deepEqual(h.snapshot().source,before.source);
 const reader=createHistoryReader({origin:UNIFIED_ORIGIN,basePath:'/api',fetch:fetchFor(h)});
 const complete=await collectHistoryDocument(reader,{...h.target,effectiveVersion:2},{parameters:detailQuery(),signal:new AbortController().signal});assert.equal(complete.lines.length,3);assert.deepEqual(complete.lineCatalog,read.lineCatalog);
});

test('replacement allocates a new independent line, then retains its original revision identity on later saves',async t=>{
 const {h,skus}=await fixture(t),source=h.snapshot().source,old=source.lines[0],replacement=skus.find(s=>s.id!==old.skuId);
 const first=await revise(h,command({lineSet:[{lineId:old.lineId,skuId:replacement.id,quantity:'7'}]}));assert.equal(first.status,200,JSON.stringify(first.body));
 const one=(await detail(h)).body,line=one.lines.items[0];assert.notEqual(line.id,old.lineId);assert.equal(line.skuId,replacement.id);assert.equal(one.lineCatalog.groups.length,0);
 const second=await revise(h,command({requestKey:'second',expectedVersion:2,lineSet:[{lineId:line.id,skuId:line.skuId,quantity:'8'},{lineId:null,skuId:line.skuId,quantity:'9'}]}));assert.equal(second.status,200,JSON.stringify(second.body));
 const two=(await detail(h)).body;assert.equal(two.lines.items[0].id,line.id);assert.deepEqual(two.lineCatalog.items[0].origin,one.lineCatalog.items[0].origin);assert.equal(two.lineCatalog.currentGroups.length,2);assert.deepEqual(h.snapshot().source,source);
});

test('foreign or forged identities, repeated line IDs, zero/empty sets and no-op never mutate memory',async t=>{
 const {h}=await fixture(t),before=h.snapshot(),old=before.source.lines[0];
 const cases=[
  {lineSet:[{lineId:id(90),skuId:old.skuId,quantity:'2'}]},
  {lineSet:[{lineId:null,skuId:id(91),quantity:'2'}]},
  {lineSet:[{...old},{...old}]},
  {lineSet:[{...old,origin:{kind:'SOURCE',sourceLineId:old.lineId}}]},
  {lineSet:[{...old,quantity:'0'}]},
  {lineSet:[]},
  {header:{note:before.source.note}},
  {header:{fromWarehouseId:before.source.toWarehouseId}},
  {header:{responsibleStaffId:id(92)}}
 ];
 for(const [index,patch]of cases.entries()){
  const result=await revise(h,command({requestKey:'bad-'+index,...patch}));assert.equal(result.status,400,JSON.stringify(result.body));assert.deepEqual(h.snapshot(),before);
 }
 const unknown=await call(h,'/imported-history/transfers/detail/query',detailQuery(id(99)));assert.equal(unknown.status,200);assert.equal(unknown.body.document,null);
 assert.equal((await revise(h,command({documentId:id(99),header:{note:'unknown'}}))).status,404);assert.deepEqual(h.snapshot(),before);
});

test('exact receipt replay, stale versions, conflicting keys and lost-response recovery preserve one commit',async t=>{
 const {h}=await fixture(t),c=command({header:{note:'SYNTHETIC one commit'}});h.loseNextResponse();
 await assert.rejects(revise(h,c),/RESPONSE_LOST_AFTER_COMMIT/);const committed=h.snapshot();assert.equal(committed.current.version,2);assert.equal(committed.revisions.length,1);
 const replay=await revise(h,c);assert.equal(replay.status,200);assert.equal(replay.body.revisionId,committed.current.previousRevisionId);assert.deepEqual(h.snapshot(),committed);
 assert.equal((await revise(h,{...c,header:{note:'different'}})).status,409);assert.deepEqual(h.snapshot(),committed);
 assert.equal((await revise(h,{...c,requestKey:'stale'})).status,409);assert.deepEqual(h.snapshot(),committed);
});

test('concurrent original requests serialize CAS and same-key retries into one revision',async t=>{
 const {h}=await fixture(t),c=command({header:{note:'SYNTHETIC concurrent correction'}});
 const [first,replay]=await Promise.all([revise(h,c),revise(h,c)]);assert.equal(first.status,200);assert.deepEqual(replay,first);assert.equal(h.snapshot().revisions.length,1);
 const a={...c,expectedVersion:2,requestKey:'concurrent-a',header:{note:'SYNTHETIC CAS A'}},b={...a,requestKey:'concurrent-b',header:{note:'SYNTHETIC CAS B'}};
 const results=await Promise.all([revise(h,a),revise(h,b)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(h.snapshot().current.version,3);assert.equal(h.snapshot().revisions.length,2);
});

test('permission denial and Origin rejection protect original reads, writes and receipt replay',async t=>{
 const {h,deny}=await fixture(t),c=command({header:{note:'SYNTHETIC saved'}});
 assert.equal((await revise(h,c,{origin:'https://untrusted.invalid'})).status,403);assert.equal(h.snapshot().revisions.length,0);
 assert.equal((await revise(h,c)).status,200);const committed=h.snapshot();deny();
 assert.equal((await detail(h)).status,403);assert.equal((await revise(h,c)).status,403);assert.deepEqual(h.snapshot(),committed);
});

test('unknown historical identity stays unknown even when current SKU exists and a full line set retains it',async t=>{
 const {h}=await fixture(t,{sourceIdentityUnknown:true}),before=(await detail(h)).body,old=h.snapshot().source.lines[0];
 assert.deepEqual(before.lineCatalog.items[0].identity,{state:'UNKNOWN'});assert.deepEqual(before.lineCatalog.groups,[]);
 const saved=await revise(h,command({lineSet:[{...old,quantity:'3'},{lineId:null,skuId:old.skuId,quantity:'4'}]}));assert.equal(saved.status,200,JSON.stringify(saved.body));
 const read=(await detail(h)).body;assert.deepEqual(read.lineCatalog.items[0].identity,{state:'UNKNOWN'});assert.deepEqual(read.lineCatalog.items[0].sourceGroup,{state:'UNKNOWN'});assert.deepEqual(read.lineCatalog.items[0].origin,{kind:'SOURCE',sourceLineId:old.lineId});
 assert.equal(read.lineCatalog.items[1].identity.state,'BOUND');const projected=historicalTransferProjection({lines:read.lines.items,lineCatalog:read.lineCatalog});assert.equal(projected.state,'PARTIAL');assert.equal(projected.productCount,null);assert.equal(projected.unknown[0].id,old.lineId);
 const merged=await h.mergeNormalList({url:UNIFIED_ORIGIN+'/api/transfers/query',method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(listQuery)},async()=>({status:200,headers:{'content-type':'application/json'},body:JSON.stringify({page:1,pageSize:200,exactTotal:'0',items:[],historyCoverage:'NOT_PUBLISHED',totals:{totalQuantity:'0'}})}));
 assert.equal(merged.status,200);assert.equal(JSON.parse(merged.body).items[0].productSummary.productCount,null);
});

test('unknown date is not guessed: full-line writes reject without state or allocation leaks',async t=>{
 const {h}=await fixture(t,{sourceBusinessDateUnknown:true}),before=h.snapshot(),old=before.source.lines[0];
 assert.equal((await detail(h)).body.document.businessDate,null);
 const result=await revise(h,command({lineSet:[{...old,quantity:'3'}]}));assert.equal(result.status,409);assert.equal(result.body.error.code,'HISTORY_REVISION_BUSINESS_DATE_UNKNOWN');assert.deepEqual(h.snapshot(),before);
 const note=await revise(h,command({header:{note:'SYNTHETIC retains unknown date'}}));assert.equal(note.status,200);assert.equal((await detail(h)).body.document.businessDate,null);
});

for(const sourceStatus of ['APPROVED','VOID'])test(sourceStatus+' cannot use this draft-only full-line/header fixture or create inventory effects',async t=>{
 const {h}=await fixture(t,{sourceStatus}),before=h.snapshot(),old=before.source.lines[0];
 for(const patch of [{header:{note:'denied'}},{lineSet:[{...old,quantity:'3'}]}]){assert.equal((await revise(h,command(patch))).status,400);assert.deepEqual(h.snapshot(),before);}
});
