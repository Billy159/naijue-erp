import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from '/workspace/shared/naijue-erp-rewrite/node_modules/fastify/fastify.js';
import { createInventoryHttpPlugin } from '/workspace/shared/naijue-erp-rewrite/apps/api/src/inventory-http.ts';
import { inventoryActor, inventoryScope, inventoryParameters, inventoryId, syntheticInventorySnapshot, syntheticCandidateSnapshot } from '/workspace/shared/naijue-erp-rewrite/tests/support/synthetic-inventory-query.ts';
import { inventoryResponse } from '/workspace/shared/naijue-erp-rewrite/apps/web/src/transport/response-validation.ts';
import { createInventoryQuery, totalOf } from '/workspace/shared/naijue-erp-rewrite/apps/web/src/inventory/model.ts';
import { ReadContext } from '/workspace/shared/naijue-erp-rewrite/apps/web/src/loading/read-scope.ts';
const firstCell = s => s.data.products[0].colorFits[0].rows[0].cells[inventoryId('size',10)];
const mutations = [
 ['missing readiness',s=>delete s.readiness,500],
 ['corrupt readiness',s=>s.readiness='maybe',500],
 ['explicit incomplete',s=>s.readiness='incomplete',503],
 ['unknown cell',s=>Object.assign(firstCell(s),{state:'unknown',quantity:'0'}),500],
 ['missing cell',s=>delete s.data.products[0].colorFits[0].rows[0].cells[inventoryId('size',10)],500],
 ['incomplete off-page summary',s=>Object.assign(s.data.allMatchesTotal,{completeness:'incomplete',unknownCells:1}),500],
 ['corrupt visible total',s=>s.data.products[0].total.knownQuantity='0',500],
 ['cell integer exceeds signed bigint',s=>firstCell(s).quantity='9223372036854775808',500],
];
for(const [name,mutate,status] of mutations) test(`independent HTTP whole-query rejection: ${name}`,async()=>{
 const app=Fastify({logger:false});
 app.register(createInventoryHttpPlugin({authenticate:async()=>inventoryActor,dependencies:{authorization:{authorize:async()=>inventoryScope},reader:{readInventory:async read=>{const s=structuredClone(syntheticInventorySnapshot(read,103));mutate(s);return s;},readCandidates:async read=>syntheticCandidateSnapshot(read)}}}));
 try {const r=await app.inject({method:'POST',url:'/inventory/query',payload:inventoryParameters()});assert.equal(r.statusCode,status);const body=r.json();assert.deepEqual(Object.keys(body),['error']);assert.equal(r.headers['x-inventory-readiness'],undefined);assert.equal(r.headers['x-inventory-read-reference'],undefined);assert.equal(body.products,undefined);assert.equal(app.server.listening,false);} finally {await app.close();}
});
test('independent complete source has real zero only and exact negative total',()=>{
 const read={parameters:{page:1,pageSize:100,filter:{productIds:[],categoryId:null,warehouseIds:[],supplierIds:[],fitIds:[],seasonIds:[]}},scope:inventoryScope};
 const data=syntheticInventorySnapshot(read,1).data;const checked=inventoryResponse(data,inventoryParameters());
 const cells=Object.values(checked.products[0].colorFits[0].rows[0].cells);
 assert.deepEqual(cells.map(c=>c.state==='known'?c.quantity:c.state),['-2','0','0','not-applicable']);assert.equal(checked.allMatchesTotal.knownQuantity,'-2');
});
test('independent client rejects unknown, missing, partial and malformed totals rather than filling zero',()=>{
 const read={parameters:{page:1,pageSize:100,filter:{productIds:[],categoryId:null,warehouseIds:[],supplierIds:[],fitIds:[],seasonIds:[]}},scope:inventoryScope};
 for(const [name,mutate] of mutations.filter(([name])=>!name.includes('readiness')&&name!=='explicit incomplete')) {const s=structuredClone(syntheticInventorySnapshot(read,103));mutate(s);assert.throws(()=>inventoryResponse(s.data,inventoryParameters()),undefined,name);}
 assert.throws(()=>totalOf([{state:'unknown',quantity:'0'}]));assert.throws(()=>totalOf([undefined]));
});
test('independent client failed read keeps prior successful data and its executed page',async()=>{
 const context=new ReadContext({accountId:'test-account',sessionRevision:'test-session',permissionRevision:'test-permissions'});let n=0;
 const read={parameters:{page:1,pageSize:100,filter:{productIds:[],categoryId:null,warehouseIds:[],supplierIds:[],fitIds:[],seasonIds:[]}},scope:inventoryScope};
 const good=syntheticInventorySnapshot(read,1).data;
 const query=createInventoryQuery(context.createScope('independent-zero-query'),{readInventory:async()=>{if(++n===1)return good;const bad=structuredClone(good);bad.allMatchesTotal.completeness='incomplete';return bad;}});
 try {assert.equal((await query.run(inventoryParameters())).status,'success');assert.equal((await query.run(inventoryParameters(2))).status,'error');assert.equal(query.getSnapshot().success.data,good);assert.equal(query.getSnapshot().success.parameters.page,1);assert.equal(query.getSnapshot().phase,'error');} finally {context.clear();}
});
