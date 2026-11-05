/** Synthetic protocol/source tests only. No PostgreSQL or production data. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {PostgresPostingBalances} from '../adapters/postgres/src/inventory-posting-balances.ts';
import {entityId} from '../packages/domain/src/values.ts';
const w=entityId('warehouse','00000000-0000-4000-8000-000000000001'),s=entityId('sku','00000000-0000-4000-8000-000000000002'),o=entityId('operation','00000000-0000-4000-8000-000000000003');
const capability={profile:'EXACT27' as const,contract:'STANDARD_RUNTIME27_COMMAND_V1' as const,async assertReady(){}};
for(const quantity of ['0','-9','9007199254740993'] as const)test(`current27 known balance ${quantity} is sufficient without offline source reads`,async()=>{
 const calls:string[]=[];const client={release(){},async query(sql:string){calls.push(sql);if(/import_record|import_source_row|standard_inventory_key_proof|inventory_key_admission|inventory_runtime_key_admitted/i.test(sql))throw Error('OFFLINE_SOURCE_UNAVAILABLE');
  return {rows:sql.includes('FROM naijue_erp.inventory_balance b JOIN unnest')?[{warehouse_id:w,sku_id:s,quantity,version:1,last_operation_id:o,updated_at:'2026-01-01T00:00:00.000000Z'}]:[],rowCount:0};}};
 const m=PostgresPostingBalances.forRuntime27(client,capability,()=>{});await m.lock([{warehouseId:w,skuId:s}]);assert.equal(m.get(w,s)?.quantity,BigInt(quantity));
 m.assertCanAppend({warehouseId:w,skuId:s,operationId:o,quantityDelta:1n as never,postedAt:'2026-01-01T00:00:00.000000Z',eventKind:'UNAPPROVE',reversesEntryId:null,baselineAnchorOperationId:o});
 assert.ok(calls.every(sql=>!/import_record|import_source_row|standard_inventory_key_proof|inventory_key_admission|inventory_runtime_key_admitted/i.test(sql)));
});
test('current27 absent balance remains unknown and rejects without querying unavailable source proof',async()=>{
 const calls:string[]=[];const client={release(){},async query(sql:string){calls.push(sql);if(/import_record|import_source_row|standard_inventory_key_proof|inventory_key_admission|inventory_runtime_key_admitted/i.test(sql))throw Error('OFFLINE_SOURCE_UNAVAILABLE');return {rows:sql.includes('runtime27:publication')?[{id:o,ready:true}]:[],rowCount:0};}};
 const m=PostgresPostingBalances.forRuntime27(client,capability,()=>{});await m.lock([{warehouseId:w,skuId:s}]);
 await assert.rejects(m.assertZero(w,s),e=>e instanceof Error&&'code' in e&&e.code==='INVENTORY_NOT_READY');
 assert.ok(calls.every(sql=>!/import_record|import_source_row|standard_inventory_key_proof|inventory_key_admission|inventory_runtime_key_admitted/i.test(sql)));
});
test('current27 SQL successor uses existing locked balance, never a source proof to post or synthesize a missing key',()=>{
 const sql=readFileSync(new URL('../adapters/postgres/patches/0027_standard_known_balance_runtime_v2.sql',import.meta.url),'utf8');
 for(const name of ['guard_cutoff_ledger','guard_recorded_live_balance_pair','validate_sparse_balance_commit','validate_transfer_effect'])assert.match(sql,new RegExp(`CREATE OR REPLACE FUNCTION naijue_erp\\.${name}\\(`));
 for(const name of ['guard_cutoff_ledger','guard_recorded_live_balance_pair','validate_sparse_balance_commit','validate_transfer_effect']){
  const body=sql.split(`-- ORDINARY_KNOWN_BALANCE_${name}_BEGIN`)[1]?.split(`-- ORDINARY_KNOWN_BALANCE_${name}_END`)[0];assert.ok(body,name);
  assert.match(body,/standard_business_ready\(\)/);assert.doesNotMatch(body,/import_record|import_source_row|standard_inventory_key_proof|inventory_key_admission|inventory_runtime_key_admitted/);
 }
});
test('current27 known zero gives exact live before/after while an unknown second key blocks every append',async()=>{
 const {quantity,version,businessDate}=await import('../packages/domain/src/values.ts');const second=entityId('sku','00000000-0000-4000-8000-000000000004');
 const client={release(){},async query(sql:string){if(/import_record|standard_inventory_key_proof|inventory_key_admission/i.test(sql))throw Error('OFFLINE_SOURCE_UNAVAILABLE');return {rows:sql.includes('FROM naijue_erp.inventory_balance b JOIN unnest')?[{warehouse_id:w,sku_id:s,quantity:'0',version:1,last_operation_id:o,updated_at:'2026-01-01T00:00:00.000000Z'}]:[],rowCount:0};}};
 const row={id:entityId('ledger','00000000-0000-4000-8000-000000000005'),operationId:o,eventKind:'UNAPPROVE' as const,warehouseId:w,skuId:s,quantityDelta:quantity('2'),source:{kind:'SALES' as const,salesId:entityId('sales','00000000-0000-4000-8000-000000000006'),salesLineId:entityId('salesLine','00000000-0000-4000-8000-000000000007'),endpoint:'SALES_WAREHOUSE' as const},sourceDocumentVersion:version(2),reversesEntryId:null,baselineAnchorOperationId:o,businessDate:businessDate('2026-01-01'),postedAt:'2026-01-01T00:00:00.000000Z'};
 const single=PostgresPostingBalances.forRuntime27(client,capability,()=>{});await single.lock([{warehouseId:w,skuId:s}]);const prepared=single.prepareLiveAppend(row);assert.equal(prepared.quantityBefore,0n);assert.equal(prepared.quantityAfter,2n);
 const mixed=PostgresPostingBalances.forRuntime27(client,capability,()=>{});await mixed.lock([{warehouseId:w,skuId:s},{warehouseId:w,skuId:second}]);assert.throws(()=>mixed.prepareLiveAppend(row),{code:'INVENTORY_NOT_READY'});
});
test('runtime trigger successor preserves predecessor bodies and the pre-existing balance-retention/trigger order',()=>{
 const sql=readFileSync(new URL('../adapters/postgres/patches/0027_standard_known_balance_runtime_v2.sql',import.meta.url),'utf8');
 const source=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_initialization.sql',import.meta.url),'utf8');
 const zero=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_whole_package_zero_balance_v2.sql',import.meta.url),'utf8');
 const body=(text:string,name:string,tag:string)=>{const start=text.indexOf(`CREATE OR REPLACE FUNCTION naijue_erp.${name}()`);assert.ok(start>=0,name);const open=text.indexOf(` AS ${tag}`,start);assert.ok(open>start,name);const from=open+4+tag.length,to=text.indexOf(`${tag};`,from);assert.ok(to>from,name);return text.slice(from,to);};
 for(const [name,prior,tag] of [['guard_cutoff_ledger',source,'$$'],['guard_recorded_live_balance_pair',source,'$pair$'],['validate_sparse_balance_commit',zero,'$$'],['validate_transfer_effect',readFileSync(new URL('../adapters/postgres/migrations/0027_unified_business_documents.sql',import.meta.url),'utf8'),'$$']] as const){
  const next=body(sql,name,tag),indent=name==='validate_transfer_effect'?'    ':'  ',begin=`${indent}-- ORDINARY_KNOWN_BALANCE_${name}_BEGIN\n`,end=`${indent}-- ORDINARY_KNOWN_BALANCE_${name}_END\n`,a=next.indexOf(begin),b=next.indexOf(end);assert.ok(a>=0&&b>a);
  assert.equal(next.slice(0,a)+next.slice(b+end.length),body(prior,name,tag));
 }
 const foundation=readFileSync(new URL('../adapters/postgres/migrations/0007_sparse_inventory_cutoff.sql',import.meta.url),'utf8');
 const transfer=readFileSync(new URL('../adapters/postgres/migrations/0004_transfer_runtime.sql',import.meta.url),'utf8');
 assert.match(foundation,/CREATE TRIGGER cutoff_ledger_guard BEFORE INSERT ON naijue_erp\.inventory_ledger FOR EACH ROW EXECUTE FUNCTION naijue_erp\.guard_cutoff_ledger/);
 assert.match(foundation,/IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'inventory balances are retained/);
 assert.match(transfer,/CREATE TRIGGER validate_transfer_ledger_source BEFORE INSERT/);assert.ok('cutoff_ledger_guard'<'validate_transfer_ledger_source');
});
