import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedRuntime27CommandCapability } from '../packages/application/src/runtime27-command-capability.ts';
import { PostgresPostingBalances } from '../adapters/postgres/src/inventory-posting-balances.ts';
import { entityId } from '../packages/domain/src/values.ts';
const warehouseId=entityId('warehouse','00000000-0000-4000-8000-000000000001'), skuId=entityId('sku','00000000-0000-4000-8000-000000000002');
const batch='00000000-0000-4000-8000-000000000003';
const capability={profile:'EXACT27' as const,contract:'STANDARD_RUNTIME27_COMMAND_V1' as const,async assertReady(_client:object,_purpose:string){}};
test('27 rejects absent,26 and boolean substitutes without pretending to issue host proof',async()=>{
 for(const value of [undefined,{...capability,profile:'EXACT26'},true]) assert.throws(()=>checkedRuntime27CommandCapability(value as never));
 await assert.rejects(checkedRuntime27CommandCapability({...capability,assertReady:async()=>true} as never).assertReady({},'DOCUMENT_COMMAND'));
});
test('27 absent stock remains unknown without looking up a source proof',async()=>{
 const calls:string[]=[];const client={release(){},async query(sql:string){calls.push(sql);if(/standard_inventory_key_proof|inventory_key_admission|import_record/.test(sql))throw Error('SOURCE_ACCESS_FORBIDDEN');return {rows:[],rowCount:0};}};
 const manager=PostgresPostingBalances.forRuntime27(client,capability,()=>{});await manager.lock([{warehouseId,skuId}]);
 await assert.rejects(manager.assertZero(warehouseId,skuId),{code:'INVENTORY_NOT_READY'});
 assert.ok(calls.every(sql=>!/standard_inventory_key_proof|inventory_key_admission|import_record/.test(sql)));
});
import { PostgresSalesUnitOfWork } from '../adapters/postgres/src/sales-unit-of-work.ts';
import { PostgresTransferUnitOfWork } from '../adapters/postgres/src/transfer-unit-of-work.ts';
for(const kind of ['sales','transfers'])test(`27 ${kind} checks original client inside transaction and before commit`,async()=>{
 const events:string[]=[];const client={release(){},async query(sql:string){events.push(sql);return {rows:sql.includes('current-schema')?[{current_sales_schema_ready:true}]:[],rowCount:0};}};
 const proof={...capability,async assertReady(actual:object,purpose:string){assert.equal(actual,client);events.push(purpose);}};
 const pool={async connect(){return client;}};
 const uow=kind==='sales'?new PostgresSalesUnitOfWork(pool,{runtime27:proof}):new PostgresTransferUnitOfWork(pool,{runtime27:proof});
 await uow.transaction(async()=>{events.push('WORK');});
 assert.equal(events[0],'BEGIN ISOLATION LEVEL READ COMMITTED');
 assert.equal(events.filter(x=>x==='DOCUMENT_COMMAND').length,2);
 assert.ok(events.indexOf('DOCUMENT_COMMAND')<events.indexOf('WORK'));
 assert.equal(events.at(-2),'DOCUMENT_COMMAND');assert.equal(events.at(-1),'COMMIT');
});
test('27 cannot use stale or forged source proof to materialize missing stock',async()=>{
 const calls:string[]=[];const client={release(){},async query(sql:string){calls.push(sql);if(/standard_inventory_key_proof|inventory_key_admission|import_record/.test(sql))throw Error('SOURCE_ACCESS_FORBIDDEN');return {rows:[],rowCount:0};}};
 const manager=PostgresPostingBalances.forRuntime27(client,capability,()=>{});await manager.lock([{warehouseId,skuId}]);
 await assert.rejects(manager.assertZero(warehouseId,skuId),{code:'INVENTORY_NOT_READY'});
 assert.ok(calls.every(sql=>!/standard_inventory_key_proof|inventory_key_admission|import_record/.test(sql)));
});
test('27 missing-stock decision cannot outlive its transaction',async()=>{
 let active=true;const client={release(){},async query(){return {rows:[],rowCount:0};}};
 const proof={...capability,async assertReady(){if(!active)throw Error('closed');}};
 const manager=PostgresPostingBalances.forRuntime27(client,proof,()=>{if(!active)throw Error('closed');});await manager.lock([{warehouseId,skuId}]);active=false;
 // Issued capability enforces its lease; a missing balance never becomes zero after closure.
 await assert.rejects(manager.assertZero(warehouseId,skuId),/closed/);
});
for(const kind of ['sales','transfers'])test(`27 ${kind} host denial rolls back before work`,async()=>{
 const events:string[]=[];const client={release(){},async query(sql:string){events.push(sql);return {rows:[],rowCount:0};}};
 const pool={async connect(){return client;}};const proof={...capability,async assertReady(){throw Error('host evidence unavailable');}};
 const uow=kind==='sales'?new PostgresSalesUnitOfWork(pool,{runtime27:proof}):new PostgresTransferUnitOfWork(pool,{runtime27:proof});
 await assert.rejects(uow.transaction(async()=>{throw Error('must not work');}),/host evidence unavailable/);
 assert.deepEqual(events,['BEGIN ISOLATION LEVEL READ COMMITTED','ROLLBACK']);
});
test('27 cannot be combined with legacy catalogue or26 authority',()=>{
 const pool={async connect(){throw Error('no connection');}};
 assert.throws(()=>new PostgresSalesUnitOfWork(pool,{runtime27:capability,catalogueCompleteness:{async assertComplete(){}}} as never));
 assert.throws(()=>new PostgresTransferUnitOfWork(pool,{runtime27:capability,runtime26:capability} as never));
});
for(const kind of ['sales','transfers'])test(`runtime27 host composition contract: ${kind} explicit option rejects missing/read-only/mismatched authority before connecting`,()=>{
 let connects=0;const pool={async connect(){connects++;throw Error('must not connect');}};
 for(const runtime27 of [undefined,{...capability,profile:'EXACT26'},
   {profile:'EXACT27',contract:'UNIFIED_ORDINARY_RUNTIME27_V1',async assertReady(){} }]){
   // The27 host must call checkedRuntime27CommandCapability on required input;
   // legacy omitted constructors intentionally remain outside27 composition.
   assert.throws(()=>checkedRuntime27CommandCapability(runtime27 as never));
   assert.throws(()=>kind==='sales'?new PostgresSalesUnitOfWork(pool,{runtime27} as never):new PostgresTransferUnitOfWork(pool,{runtime27} as never));
 }
 assert.equal(connects,0);
});
