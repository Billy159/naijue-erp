import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
 compareWholePackageRuntimeProjection,readWholePackageRuntimeProjection,runtimeReadbackSql
} from '../tools/unified-import/whole-package-runtime-readback.mjs';

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const binding={database:'synthetic_erp',baselineBatchId:id(1),documentBatchId:id(2),manifestSha256:'1'.repeat(64),planSha256:'2'.repeat(64),rootOperationId:id(3)};
const cutoff='2026-11-01T04:00:00Z',warehouseId=id(10),emptyWarehouseId=id(11);
const exact=createHash('sha256').update(JSON.stringify([warehouseId,id(20),'-9007199254740993','SOURCE_LISTED'])+'\n'+
 JSON.stringify([warehouseId,id(21),'0','APPROVED_ABSENCE_ZERO'])+'\n').digest('hex');
const stockCounts={explicit_keys:2,source_listed_keys:1,source_listed_zero_keys:0,approved_absence_zero_keys:1,positive_keys:0,
 negative_keys:1,zero_quantity_keys:1,signed_quantity:'-9007199254740993',positive_quantity:'0',negative_quantity:'-9007199254740993'};
const countsAsText=counts=>Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v===null?null:String(v)]));
const zeroCounts=Object.fromEntries(Object.keys(stockCounts).map(k=>[k,k.endsWith('_keys')?0:null]));
function fixture(){
 const warehouses={format:'R3_WAREHOUSE_SOURCE_EXPECTATIONS_V1',manifest:{sha256:binding.manifestSha256},cutoff_at:cutoff,
  warehouse_expectations:[
   {warehouse_id:warehouseId,counts_and_totals:stockCounts,exact_key_sha256:exact},
   {warehouse_id:emptyWarehouseId,counts_and_totals:zeroCounts,exact_key_sha256:null}
  ]};
 const aggregate={references:{manifest:{sha256:binding.manifestSha256}},fixed_source_expectations:{cash_source_aggregates:{
  receive_rows:1,receive_amount:'9007199254740993.01',refund_rows:1,refund_absolute_amount:'19.99',zero_archive_rows:1
 }}};
 const row={database:binding.database,snapshot:'101:103:',publish_id:id(4),cutoff_at:cutoff,inventory_records:'2',
  settlement_records:'2',immutable_settlement_records:'2',warehouses:[
   {warehouse_id:warehouseId,warehouse_present:true,...countsAsText(stockCounts),distinct_keys:'2',
    exact_key_sha256:exact,current_present_keys:'1',current_missing_keys:'1',current_changed_keys:'1',current_known_signed_quantity:'-2'},
   {warehouse_id:emptyWarehouseId,warehouse_present:true}
  ],original_cash:[{direction:'RECEIVE',rows:'1',amount_cents:'900719925474099301',nonpositive_rows:'0'},
   {direction:'REFUND',rows:'1',amount_cents:'1999',nonpositive_rows:'0'}],
  current_cash:[{direction:'RECEIVE',rows:'1',amount_cents:'900719925474099301'}]};
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
  ordinaryRead:{async assertReady(lease,purpose){assert.equal(lease,client);assert.equal(purpose,'ORDINARY_DOCUMENT_READ');calls.push(['read-lease']);}}
 }};
}

test('one owned read-only snapshot compares immutable signed facts and reports current differences separately',async()=>{
 const f=fixture(),m=model(f.row);
 const actual=await readWholePackageRuntimeProjection(m.issuer,binding);
 const comparison=compareWholePackageRuntimeProjection(actual,f.warehouses,f.aggregate);
 assert.deepEqual(comparison,{state:'SOURCE_PROJECTION_MATCHED',warehouseMismatches:[],cashMismatches:[],
  currentExplicitInventory:{missingKeys:'1',changedKeys:'1'},currentCashDirectionsDiffer:['REFUND']});
 assert.deepEqual(m.calls,[
  ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',undefined],['read-lease'],
  [runtimeReadbackSql,[binding.baselineBatchId,binding.documentBatchId,binding.manifestSha256,binding.planSha256,binding.rootOperationId]],
  ['ROLLBACK',undefined],['release',false]
 ]);
});

test('unchanged global totals cannot hide a warehouse key-digest change or reversed cash groups',async()=>{
 const f=fixture();
 f.row.warehouses[0].exact_key_sha256='3'.repeat(64);
 [f.row.original_cash[0].amount_cents,f.row.original_cash[1].amount_cents]=[f.row.original_cash[1].amount_cents,f.row.original_cash[0].amount_cents];
 const actual=await readWholePackageRuntimeProjection(model(f.row).issuer,binding);
 const compared=compareWholePackageRuntimeProjection(actual,f.warehouses,f.aggregate);
 assert.equal(compared.state,'SOURCE_PROJECTION_DIFFERS');
 assert.deepEqual(compared.warehouseMismatches,[{warehouse_id:warehouseId,state:'IMMUTABLE_KEY_FACT_DIFFERS',fields:['exact_key_sha256']}]);
 assert.deepEqual(compared.cashMismatches,['RECEIVE','REFUND']);
 f.warehouses.cutoff_at='2026-11-02T04:00:00Z';
 assert.throws(()=>compareWholePackageRuntimeProjection(actual,f.warehouses,f.aggregate),/SOURCE_MANIFEST_DIFFERS/);
});

test('staged, incomplete and wrong target results cannot become a source comparison',async()=>{
 for(const [change,code] of [
  [()=>null,/PUBLISHED_BATCH_REQUIRED/],
  [r=>({...r,database:'wrong'}),/BINDING_DIFFERS/],
  [r=>({...r,inventory_records:'3'}),/INVENTORY_PROJECTION_INCOMPLETE/],
  [r=>({...r,immutable_settlement_records:'1'}),/SETTLEMENT_PROJECTION_INCOMPLETE/]
 ]){
  const m=model(change(fixture().row));
  await assert.rejects(readWholePackageRuntimeProjection(m.issuer,binding),code);
  assert.deepEqual(m.calls.slice(-2),[['ROLLBACK',undefined],['release',false]]);
 }
});

test('uncertain BEGIN or ROLLBACK discards the lease and never repeats rollback',async()=>{
 for(const mode of ['unknown-begin','unknown-rollback']){
  const m=model(fixture().row,mode);
  await assert.rejects(readWholePackageRuntimeProjection(m.issuer,binding),/UNACKNOWLEDGED/);
  assert.deepEqual(m.calls.at(-1),['release',true]);
  assert(m.calls.filter(([sql])=>sql==='ROLLBACK').length<=1);
 }
});
