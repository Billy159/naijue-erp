import test from 'node:test';
import assert from 'node:assert/strict';
import {
 compareWholePackageRuntimeProjection,readWholePackageRuntimeProjection,runtimeReadbackSql
} from '../tools/unified-import/whole-package-runtime-readback.mjs';

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const binding={
 database:'synthetic_erp',baselineBatchId:id(1),documentBatchId:id(2),rootOperationId:id(3),publishOperationId:id(4),
 manifestSha256:'1'.repeat(64),planSha256:'2'.repeat(64),scopeSha256:'3'.repeat(64)
};
const cutoff='2026-11-01T04:00:00Z',warehouseId=id(10),emptyWarehouseId=id(11);
const stockCounts={
 explicit_keys:1,source_listed_keys:1,source_listed_zero_keys:0,approved_absence_zero_keys:0,positive_keys:0,
 negative_keys:1,zero_quantity_keys:0,signed_quantity:'-9007199254740993',positive_quantity:'0',negative_quantity:'-9007199254740993'
};
const exactKeySha='4'.repeat(64);

function fixture(){
 const warehouses={format:'R3_WAREHOUSE_SOURCE_EXPECTATIONS_V1',manifest:{sha256:binding.manifestSha256},cutoff_at:cutoff,
  warehouse_expectations:[
   {warehouse_id:warehouseId,counts_and_totals:stockCounts,exact_key_sha256:exactKeySha},
   {warehouse_id:emptyWarehouseId,counts_and_totals:Object.fromEntries(Object.keys(stockCounts).map(k=>[k,k.endsWith('_keys')?0:null])),
    exact_key_sha256:null}
  ]};
 const aggregate={references:{manifest:{sha256:binding.manifestSha256}},fixed_source_expectations:{cash_source_aggregates:{
  receive_rows:1,receive_amount:'9007199254740993.01',refund_rows:1,refund_absolute_amount:'19.99'
 }}};
 const originalCash=[
  {direction:'RECEIVE',rows:'1',amount_cents:'900719925474099301',nonpositive_rows:'0'},
  {direction:'REFUND',rows:'1',amount_cents:'1999',nonpositive_rows:'0'}
 ];
 const row={
  database:binding.database,snapshot:'101:103:',publish_id:binding.publishOperationId,cutoff_at:cutoff,
  scope_sha256:binding.scopeSha256,scope_explicit_values_sha256:'5'.repeat(64),
  scope_explicit_keys:'1',scope_warehouse_count:'2',scope_sku_count:'3',sku_count:'3',scope_universe_count:'6',
  inventory_records:'1',current_extra_keys:'0',settlement_records:'2',immutable_settlement_records:'2',
  scope_witness:{omitted:{state:'EXPLICIT_ZERO',basis:'PUBLISHED_BASELINE_SCOPE_OR_NATIVE_CREATION',baseline_batch_id:binding.baselineBatchId},
   balance_exists:false,ledger_exists:false,outside_warehouse:'UNKNOWN',outside_sku:'UNKNOWN'},
  warehouses:[
   {warehouse_id:warehouseId,warehouse_present:true,...Object.fromEntries(Object.entries(stockCounts).map(([k,v])=>[k,String(v)])),
    distinct_keys:'1',exact_key_sha256:exactKeySha,current_present_keys:'1',current_missing_keys:'0',current_changed_keys:'0',
    current_known_signed_quantity:stockCounts.signed_quantity},
   {warehouse_id:emptyWarehouseId,warehouse_present:true}
  ],
  original_cash:originalCash,current_cash:originalCash.map(({direction,rows,amount_cents})=>({direction,rows,amount_cents}))
 };
 return {row,warehouses,aggregate};
}

function model(row,mode){
 const calls=[];
 const client={async query(sql,args){
  calls.push([sql,args]);
  if(sql.startsWith('BEGIN'))return {command:mode==='unknown-begin'?'OTHER':'BEGIN'};
  if(sql==='ROLLBACK')return {command:mode==='unknown-rollback'?'OTHER':'ROLLBACK'};
  assert.equal(sql,runtimeReadbackSql);
  return {command:'SELECT',rows:row?[row]:[]};
 },release(discard){calls.push(['release',discard]);}};
 return {calls,issuer:{
  pool:{async connect(){return client;}},
  ordinaryRead:{async assertReady(lease,purpose){
   assert.equal(lease,client);
   assert.equal(purpose,'ORDINARY_DOCUMENT_READ');
   calls.push(['read-lease']);
   if(mode==='revoked'&&calls.length===4)throw Error('REVOKED');
  }}
 }};
}

test('first-import reconciliation uses the original published batch and one ordinary read-only snapshot',async()=>{
 const {row,warehouses,aggregate}=fixture(),m=model(row);
 const actual=await readWholePackageRuntimeProjection(m.issuer,binding);
 assert.deepEqual(compareWholePackageRuntimeProjection(actual,warehouses,aggregate),{
  state:'FIRST_IMPORT_RECONCILED',warehouseMismatches:[],cashMismatches:[],
  currentExplicitInventory:{missingKeys:'0',changedKeys:'0',extraKeys:'0'},currentCashDirectionsDiffer:[],omittedKeyHasEffects:false,
  cashNetCents:{expected:'900719925474097302',original:'900719925474097302',current:'900719925474097302'}
 });
 assert.deepEqual(m.calls,[
  ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',undefined],['read-lease'],
  [runtimeReadbackSql,[binding.baselineBatchId,binding.documentBatchId,binding.manifestSha256,binding.planSha256,binding.rootOperationId,
   binding.publishOperationId,binding.scopeSha256]],
  ['read-lease'],['ROLLBACK',undefined],['release',false]
 ]);
});

test('matching totals cannot hide shifted inventory keys or reversed cash groups',async()=>{
 const {row,warehouses,aggregate}=fixture();
 row.warehouses[0].exact_key_sha256='6'.repeat(64);
 [row.original_cash[0].amount_cents,row.original_cash[1].amount_cents]=[row.original_cash[1].amount_cents,row.original_cash[0].amount_cents];
 const actual=await readWholePackageRuntimeProjection(model(row).issuer,binding);
 const comparison=compareWholePackageRuntimeProjection(actual,warehouses,aggregate);
 assert.equal(comparison.state,'FIRST_IMPORT_DIFFERS');
 assert.deepEqual(comparison.warehouseMismatches,[{warehouse_id:warehouseId,state:'IMMUTABLE_KEY_FACT_DIFFERS',fields:['exact_key_sha256']}]);
 assert.deepEqual(comparison.cashMismatches,['RECEIVE','REFUND']);
});

test('differences in current balances and settlements fail first-import reconciliation',async()=>{
 const {row,warehouses,aggregate}=fixture();
 Object.assign(row.warehouses[0],{current_missing_keys:'1',current_changed_keys:'2'});
 row.current_extra_keys='3';
 row.scope_witness.ledger_exists=true;
 row.current_cash.pop();
 const actual=await readWholePackageRuntimeProjection(model(row).issuer,binding);
 const comparison=compareWholePackageRuntimeProjection(actual,warehouses,aggregate);
 assert.equal(comparison.state,'FIRST_IMPORT_DIFFERS');
 assert.deepEqual(comparison.currentExplicitInventory,{missingKeys:'1',changedKeys:'2',extraKeys:'3'});
 assert.deepEqual(comparison.currentCashDirectionsDiffer,['REFUND']);
 assert.equal(comparison.omittedKeyHasEffects,true);
});

test('rejects absent publication, wrong scope, incorrect scope witnesses and revoked lease',async()=>{
 for(const [change,code,mode] of [
  [()=>null,/PUBLISHED_BATCH_REQUIRED/],
  [r=>({...r,publish_id:id(99)}),/BINDING_DIFFERS/],
  [r=>({...r,scope_sku_count:'4'}),/SCOPE_DIFFERS/],
  [r=>({...r,scope_witness:{...r.scope_witness,omitted:{state:'UNKNOWN'}}}),/SCOPE_WITNESS_DIFFERS/],
  [r=>({...r,scope_witness:{...r.scope_witness,outside_sku:'EXPLICIT_ZERO'}}),/SCOPE_WITNESS_DIFFERS/],
  [r=>r,/REVOKED/,'revoked']
 ]){
  const m=model(change(fixture().row),mode);
  await assert.rejects(readWholePackageRuntimeProjection(m.issuer,binding),code);
  assert.deepEqual(m.calls.slice(-2),[['ROLLBACK',undefined],['release',false]]);
 }
});

test('uncertain BEGIN or ROLLBACK discards the lease without repeating rollback',async()=>{
 for(const mode of ['unknown-begin','unknown-rollback']){
  const m=model(fixture().row,mode);
  await assert.rejects(readWholePackageRuntimeProjection(m.issuer,binding),/UNACKNOWLEDGED/);
  assert.deepEqual(m.calls.at(-1),['release',true]);
  assert(m.calls.filter(([sql])=>sql==='ROLLBACK').length<=1);
 }
});
