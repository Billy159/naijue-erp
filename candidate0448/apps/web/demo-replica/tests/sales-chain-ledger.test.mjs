/** Candidate regression: real commands + one finite synthetic store; no PG or production. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pathToFileURL,fileURLToPath} from 'node:url';
// Default when installed at apps/web/demo-replica/tests; override for off-repo execution.
const repo=process.env.LEDGER_REPO??fileURLToPath(new URL('../../../../',import.meta.url));
const load=path=>import(pathToFileURL(repo+'/'+path).href);
const {createSalesChainFixture}=await load('apps/web/demo-replica/tests/sales-chain-fixture.mjs');
const {seedSalesPreview}=await load('apps/web/demo-replica/tests/sales-preview-seed.mjs');
const {qaHalls,qaCustomers,qaStaff,qaWarehouses,qaSkus,qaPaymentAccounts,qaMethods,qaId}=await load('apps/web/demo-replica/frontend/qa-reference-fixtures.mts');
const {checkedLedgerPage}=await load('apps/web/src/inventory/ledger-http-reader.ts');
const endpoint='https://synthetic-management.invalid/api/inventory/ledger/query';
const parameters=(warehouse=qaWarehouses[3],patch={})=>({warehouseId:warehouse.id,skuId:qaSkus[0].id,pageSize:20,after:null,page:1,filter:{dateFrom:'2026-09-30',dateTo:'2026-10-30',businessType:null,source:''},...patch});
const read=async(h,q=parameters(),headers={})=>{const response=await h.request({url:endpoint,method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(q)});return {...response,json:JSON.parse(response.body)};};
const proposal=(quantity='1',gift=false)=>({salesId:null,businessType:'SALE',businessDate:'2026-10-29',note:'合成真实库存流水回归',hallId:qaHalls[0].id,customerId:qaCustomers[0].id,salespersonId:qaStaff[2].id,warehouseId:qaWarehouses[3].id,orderDiscount:'0.00',lines:[{existingLineId:null,skuId:qaSkus[0].id,quantity,dealPrice:gift?'0.00':'239.00',pricingRule:'UNIT_PRICE',discountTenths:null,isGift:gift,zeroConfirmed:gift}],settlements:gift?[]:[{existingSettlementId:null,paymentAccountId:qaPaymentAccounts[0].id,paymentMethodId:qaMethods[0].id,direction:'RECEIVE',amount:(BigInt(quantity)*239n).toString()+'.00'}]});
async function post(h,key,quantity='1',gift=false){
 const saved=await h.command({action:'SAVE',requestKey:key+'-save',expectedVersion:null,proposal:proposal(quantity,gift)});assert.equal(saved.status,200,JSON.stringify(saved));
 const approved=await h.command({action:'APPROVE',requestKey:key+'-approve',salesId:saved.body.salesId,expectedVersion:1});assert.equal(approved.status,200,JSON.stringify(approved));return saved.body.salesId;
}
test('SYNTHETIC ledger exact route and genuinely empty known key do not write or fabricate rows',async t=>{
 const h=await createSalesChainFixture();t.after(()=>h.close());assert.equal(h.canHandle('/api/inventory/ledger/query','POST'),true,'missing exact fixture route caused unsupported-operation 500');
 assert.equal(h.canHandle('/api/inventory/ledger/query','GET'),false);const before=h.snapshot(),q=parameters(qaWarehouses[0]);const r=await read(h,q);
 assert.equal(r.status,200,r.body);assert.equal(r.headers['x-inventory-readiness'],'ready');assert.equal(r.headers['cache-control'],'no-store');assert.match(r.headers['x-inventory-read-reference'],/^SYNTHETIC-/);
 assert.deepEqual(checkedLedgerPage(r.json,q),r.json);assert.equal(r.json.filteredTotal,'0');assert.deepEqual(r.json.entries,[]);assert.equal(r.json.warehouse.id,qaWarehouses[0].id);assert.deepEqual(h.snapshot(),before,'read must not seed a baseline or a business event');
});
test('SYNTHETIC seeded nonempty ledger retains actual operation/source IDs, exact DTO and unknown facts',async t=>{
 const h=await createSalesChainFixture();t.after(()=>h.close());await seedSalesPreview(h);const before=h.snapshot(),q=parameters(),r=await read(h,q);assert.equal(r.status,200,r.body);checkedLedgerPage(r.json,q);
 const actual=before.ledger.filter(x=>x.warehouseId===q.warehouseId&&x.skuId===q.skuId);assert.equal(actual.length,4);assert.equal(r.json.filteredTotal,'4');assert.equal(r.json.entries.length,4);
 for(const entry of r.json.entries){const source=actual.find(x=>x.id===entry.id);assert.ok(source);assert.equal(entry.operationId,source.operationId);assert.deepEqual(entry.source,source.source);assert.equal(entry.sourceDocumentVersion,source.sourceDocumentVersion);assert.equal(entry.quantityDelta,source.quantityDelta.toString());assert.equal(entry.postedAt,source.postedAt,'timestamp must be stored exact, not guessed on read');assert.match(entry.postedAt,/\.\d{6}Z$/);const document=before.headers.get(entry.source.salesId);assert.equal(entry.display.sourceNumber,document.number);assert.equal(entry.display.businessType,document.businessType);assert.equal(entry.display.operator.accountId,h.actor.accountId);assert.equal(entry.display.operator.name,qaStaff[0].name);assert.deepEqual(entry.display.balanceTransition,{state:'UNKNOWN',before:null,after:null,reason:'NO_RECORDED_BALANCE_TRANSITION'});assert.equal(entry.display.navigation,'NOT_CHECKED');}
 assert.deepEqual(h.snapshot(),before);const empty=await read(h,parameters(qaWarehouses[0]));assert.equal(empty.status,200,empty.body);assert.equal(empty.json.filteredTotal,'0');assert.deepEqual(empty.json.entries,[]);
});
test('SYNTHETIC actual command quantities above JS precision and reversals remain exact and original',async t=>{
 const h=await createSalesChainFixture();t.after(()=>h.close());const id=await post(h,'large','9007199254740993',true);const r=await read(h);assert.equal(r.status,200,r.body);assert.equal(r.json.entries[0].quantityDelta,'-9007199254740993');const original=r.json.entries[0];
 const reversed=await h.command({action:'UNAPPROVE',salesId:id,expectedVersion:2,requestKey:'large-reverse'});assert.equal(reversed.status,200,JSON.stringify(reversed));const before=h.snapshot(),again=await read(h);assert.equal(again.status,200,again.body);assert.equal(again.json.filteredTotal,'2');const reversal=again.json.entries.find(x=>x.eventKind==='UNAPPROVE');assert.equal(reversal.quantityDelta,'9007199254740993');assert.equal(reversal.reversesEntryId,original.id);assert.deepEqual(reversal.source,original.source);assert.deepEqual(h.snapshot(),before);
});
test('SYNTHETIC exact 20-row paging, cursor order and literal date/type/source filters read only committed rows',async t=>{
 const h=await createSalesChainFixture();t.after(()=>h.close());for(let i=0;i<21;i++)await post(h,'page-'+i);const before=h.snapshot();
 const q=parameters(),first=await read(h,q);assert.equal(first.status,200,first.body);checkedLedgerPage(first.json,q);assert.equal(first.json.filteredTotal,'21');assert.equal(first.json.entries.length,20);
 const q2=parameters(qaWarehouses[3],{page:2}),second=await read(h,q2);assert.equal(second.status,200,second.body);checkedLedgerPage(second.json,q2);assert.equal(second.json.entries.length,1);assert.equal(new Set([...first.json.entries,...second.json.entries].map(x=>x.id)).size,21);
 const q3=parameters(qaWarehouses[3],{page:Number.MAX_SAFE_INTEGER}),out=await read(h,q3);assert.equal(out.status,200,out.body);checkedLedgerPage(out.json,q3);assert.equal(out.json.filteredTotal,'21');assert.deepEqual(out.json.entries,[]);
 const cursor={warehouseId:q.warehouseId,skuId:q.skuId,pageSize:2,after:null},legacy=await read(h,cursor);assert.equal(legacy.status,200,legacy.body);checkedLedgerPage(legacy.json,cursor);assert.ok(legacy.json.nextCursor);const cursorNext={...cursor,after:legacy.json.nextCursor},next=await read(h,cursorNext);assert.equal(next.status,200,next.body);checkedLedgerPage(next.json,cursorNext);assert.equal(new Set([...legacy.json.entries,...next.json.entries].map(x=>x.id)).size,4);
 const filter=async patch=>{const request=parameters(qaWarehouses[3],{filter:{...q.filter,...patch}}),response=await read(h,request);assert.equal(response.status,200,response.body);checkedLedgerPage(response.json,request);return response.json;};
 const number=first.json.entries[0].display.sourceNumber;assert.equal((await filter({source:number.toLowerCase()})).filteredTotal,'1');assert.equal((await filter({source:'%_'})).filteredTotal,'0','literal filter must not act as SQL wildcard');assert.equal((await filter({businessType:'RETURN'})).filteredTotal,'0');assert.equal((await filter({dateFrom:'2026-10-30'})).filteredTotal,'0');assert.deepEqual(h.snapshot(),before);
});
test('SYNTHETIC malformed, unknown, denied and revoked ledger reads never become successful empty',async t=>{
 const h=await createSalesChainFixture();t.after(()=>h.close());await seedSalesPreview(h);const before=h.snapshot();
 for(const q of [{...parameters(),actor:h.actor},{...parameters(),pageSize:100},{...parameters(),filter:{...parameters().filter,dateFrom:'2026-02-30'}}]){const r=await read(h,q);assert.equal(r.status,400,r.body);assert.equal(r.json.entries,undefined);}
 const sku=await read(h,{...parameters(),skuId:qaId(999999)});assert.equal(sku.status,404,sku.body);assert.equal(sku.json.entries,undefined);
 const warehouse=await read(h,{...parameters(),warehouseId:qaId(999998)});assert.equal(warehouse.status,403,warehouse.body);assert.equal(warehouse.json.entries,undefined);
 const media=await read(h,parameters(),{'content-type':'text/plain'});assert.equal(media.status,415,media.body);assert.equal(media.json.entries,undefined);
 assert.deepEqual(h.snapshot(),before);h.revoke();const revokedState=h.snapshot(),revoked=await read(h);assert.equal(revoked.status,403,revoked.body);assert.equal(revoked.json.entries,undefined);assert.deepEqual(h.snapshot(),revokedState);
 await assert.rejects(h.request({url:endpoint+'?warehouse=all',method:'POST',body:JSON.stringify(parameters())}),/Closed synthetic sales chain/);
 await assert.rejects(h.request({url:'https://not-allowed.invalid/api/inventory/ledger/query',method:'POST',body:JSON.stringify(parameters())}),/Closed synthetic sales chain/);
});

test('SYNTHETIC historical ledger survives real unapprove then warehouse change and SKU replacement',async t=>{
 const h=await createSalesChainFixture();t.after(()=>h.close());const id=await post(h,'history');const original=h.snapshot().ledger[0];
 assert.equal((await h.command({action:'UNAPPROVE',salesId:id,expectedVersion:2,requestKey:'history-unapprove'})).status,200);
 const oldLine=h.snapshot().lines.get(original.source.salesLineId),edited=proposal();edited.salesId=id;edited.warehouseId=qaWarehouses[0].id;
 edited.lines[0].existingLineId=oldLine.id;edited.lines[0].skuId=qaSkus[1].id;
 const save=await h.command({action:'SAVE',requestKey:'history-edit',expectedVersion:3,proposal:edited});assert.equal(save.status,200,JSON.stringify(save));
 const before=h.snapshot();assert.equal(before.lines.get(oldLine.id).isCurrent,false,'original source line is retained, not reconstructed');assert.equal(before.headers.get(id).warehouseId,qaWarehouses[0].id);
 const r=await read(h);assert.equal(r.status,200,r.body);assert.equal(r.json.filteredTotal,'2');assert.ok(r.json.entries.some(e=>e.id===original.id));
 for(const entry of r.json.entries){assert.equal(entry.source.salesId,id);assert.equal(entry.source.salesLineId,oldLine.id);}assert.deepEqual(h.snapshot(),before);
});
