/** Synthetic projection and generated SQL checks, not PostgreSQL execution. */
import test from 'node:test';import assert from 'node:assert/strict';
import {buildHistoricalSalesHallEvidence} from '../packages/application/src/historical-sales-hall-evidence.ts';
import {decodeHistoricalSalesHallProjection,HISTORICAL_SALES_HALL_PROJECTION_SQL,HISTORICAL_SALES_HALL_BATCH_CTES} from '../adapters/postgres/src/sales-historical-hall-projection.ts';
import {validateImportedHistoryHeader} from '../packages/application/src/imported-history-query-validation.ts';
import {historyHeader,historyGrant,historyListQuery} from './support/imported-history-query-fixtures.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const e=buildHistoricalSalesHallEvidence({originalHallId:null,warehouseId:id(1),warehouseHallId:id(2),warehouseVersion:7,capturedAt:'2026-11-05T03:00:00Z'});
const row=()=>({stock_basis:'CUTOFF_HISTORY',hall_id:id(2),warehouse_id:id(1),historical_hall_proofs:[{verified:true,evidence:e}]});
test('sealed derived readback preserves original null and capture; later current changes are explicit without refreshing it',()=>{
 assert.deepEqual(decodeHistoricalSalesHallProjection(row()),{historicalHallEvidence:e,historicalHallDiffersFromCurrent:false});
 const moved=decodeHistoricalSalesHallProjection({...row(),hall_id:id(3),warehouse_id:id(4)});
 assert.deepEqual(moved,{historicalHallEvidence:e,historicalHallDiffersFromCurrent:true});assert.equal(moved.historicalHallEvidence?.original_hall_id,null);assert.equal(moved.historicalHallEvidence?.warehouse_version,7);
});
test('old absent evidence remains absent; present invalid, duplicate or nonhistorical evidence fails closed',()=>{
 for(const historical_hall_proofs of [undefined,null,[]])assert.deepEqual(decodeHistoricalSalesHallProjection({...row(),historical_hall_proofs}),{});
 for(const bad of [{...row(),historical_hall_proofs:[{verified:false,evidence:e}]},{...row(),historical_hall_proofs:[{verified:true,evidence:{...e,basis:'ORIGINAL'}}]},{...row(),historical_hall_proofs:[{verified:true,evidence:e},{verified:true,evidence:e}]},{...row(),stock_basis:'RUNTIME_LEDGER'}])assert.throws(()=>decodeHistoricalSalesHallProjection(bad),{code:'INVALID_DATABASE_VALUE'});
});
test('readback SQL follows committed sealed import source on already scoped h, never current warehouse inference or privileges',()=>{
 const sql=HISTORICAL_SALES_HALL_PROJECTION_SQL;assert.match(sql,/MIGRATE_DOCUMENT/);assert.match(sql,/IMPORT_CHUNK/);assert.match(sql,/sourceRecordId/);assert.match(sql,/source_hash/);assert.match(sql,/source_receipt_status='COMMITTED'/);assert.match(sql,/exposureDigest/);assert.match(sql,/m.object_id=h.id/);assert.match(sql,/source_record->'historical_hall_evidence'/);assert.doesNotMatch(sql,/naijue_erp\.warehouse|naijue_erp\.staff|SECURITY DEFINER|GRANT|INSERT|UPDATE|DELETE/);
});
test('legacy historical DTO preserves observation/current difference and rejects false current-equality assertions',()=>{
 const h=historyHeader('sales'),grant=historyGrant({kind:'sales',operation:'list',parameters:historyListQuery()});
 const source={...h,historicalHallEvidence:e,historicalHallDiffersFromCurrent:true};
 assert.deepEqual(validateImportedHistoryHeader(source,'sales',grant),source);
 assert.throws(()=>validateImportedHistoryHeader({...source,historicalHallDiffersFromCurrent:false},'sales',grant),{code:'IMPORTED_HISTORY_INVALID_RESPONSE'});
 assert.throws(()=>validateImportedHistoryHeader({...source,historicalHallEvidence:{...e,basis:'ORIGINAL'}},'sales',grant),{code:'IMPORTED_HISTORY_INVALID_RESPONSE'});
});

test('batch projection pins source chunk operation IDs before expansion after the authorized page; not engine validation',()=>{
 assert.match(HISTORICAL_SALES_HALL_BATCH_CTES,/authorized_hall_headers AS MATERIALIZED \(SELECT \* FROM page_headers\)/);
 assert.match(HISTORICAL_SALES_HALL_BATCH_CTES,/hall_pointers AS MATERIALIZED/);
 assert.match(HISTORICAL_SALES_HALL_BATCH_CTES,/JOIN naijue_erp\.import_record s ON s\.id=\(m\.source_record_id\)::uuid/);
 assert.match(HISTORICAL_SALES_HALL_BATCH_CTES,/a\.operation_id IN\(SELECT \(pointer->>'operationId'\)::uuid FROM hall_pointers/);
 assert.match(HISTORICAL_SALES_HALL_BATCH_CTES,/FROM hall_chunks a CROSS JOIN LATERAL/);
 assert.equal(HISTORICAL_SALES_HALL_BATCH_CTES.match(/jsonb_array_elements\(a.after_values->'records'\)/g)?.length,1);
 assert.match(HISTORICAL_SALES_HALL_BATCH_CTES,/item.value->>'id' IN\(SELECT source_record_id FROM hall_migration\)/);
 for(const sql of [HISTORICAL_SALES_HALL_PROJECTION_SQL,HISTORICAL_SALES_HALL_BATCH_CTES]){
  let balance=0;for(const char of sql.replace(/'(?:[^']|'')*'/g,'')){if(char==='(')balance++;else if(char===')')balance--;assert.ok(balance>=0,'SQL closing delimiter has an opener');}assert.equal(balance,0);
 }
});


test('required new-profile missing, damaged or wrong-batch proof sentinels fail closed while old absence remains compatible',()=>{
 for(const reason of ['MISSING_POINTER','MISSING_SOURCE_ITEM','WRONG_BASELINE','DAMAGED_INIT']){
  assert.throws(()=>decodeHistoricalSalesHallProjection({...row(),historical_hall_proofs:[{verified:false,evidence:null,reason}]}),{code:'INVALID_DATABASE_VALUE'});
 }
 assert.deepEqual(decodeHistoricalSalesHallProjection({...row(),historical_hall_proofs:[]}),{});
 const sql=HISTORICAL_SALES_HALL_BATCH_CTES;
 assert.match(sql,/hall_roots AS MATERIALIZED/);
 assert.match(sql,/FROM authorized_hall_headers h JOIN naijue_erp\.import_batch b/);
 assert.match(sql,/init_a\.after_values->'request'->'payload'->>'document_batch_id'=b\.id::text/);
 assert.match(sql,/m\.after_values->'baseline'->>'baselineBatchId'=baseline\.id::text/);
 assert.match(sql,/baseline\.source_hash=b\.source_hash/);
 assert.match(sql,/roots\.standard_family AND roots\.root_verified IS NOT TRUE/);
 assert.match(sql,/known_baseline\.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'/);
 assert.match(sql,/NOT EXISTS\(SELECT 1 FROM hall_proofs p WHERE p\.document_id=roots\.document_id\)/);
 assert.match(sql,/f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66/);
});

test('V2 final readback preserves source zero and dual history while refusing an unobserved target even with a true proof flag',()=>{
 const evidence={format_version:'HISTORICAL_SALES_HALL_EVIDENCE_V2',basis:'MIGRATION_DERIVED',original_hall_id:null,selected_hall_id:id(2),warehouse_id:id(1),
  target_snapshot:{warehouse_id:id(1),hall_id:id(2),version:1,captured_at:'2026-11-05T03:02:00.123456Z'},
  source_capture:{capture_evidence_sha256:'1'.repeat(64),source_namespace:'synthetic:source',warehouse_source_key:'old-code',runtime_warehouse_id:id(10),source_native_version:0,effective_version:0,runtime_hall_ids:[id(20),id(21)],captured_at:'2026-11-05T03:00:00Z',transaction_snapshot:'100:102:101',relation_basis:'OBSERVED_EXACT_RUNTIME_RELATIONS'},
  identity_bridge:{evidence_sha256:'2'.repeat(64),record_key:'bridge'},resolution:{evidence_sha256:'3'.repeat(64),record_key:'resolution'},has_difference:true,review_required:false};
 const projected=decodeHistoricalSalesHallProjection({...row(),historical_hall_proofs:[{verified:true,evidence}]});
 assert.deepEqual(projected.historicalHallEvidence,evidence);assert.equal(projected.historicalHallDiffersFromCurrent,false);
 assert.throws(()=>decodeHistoricalSalesHallProjection({...row(),historical_hall_proofs:[{verified:true,evidence:{...evidence,target_snapshot:{...evidence.target_snapshot,captured_at:null}}}]}),{code:'INVALID_DATABASE_VALUE'});
 assert.equal(decodeHistoricalSalesHallProjection({...row(),hall_id:id(5),historical_hall_proofs:[{verified:true,evidence}]}).historicalHallDiffersFromCurrent,true);
});
test('authorized V2 projection checks original null input and immutable capture/master linkage before the completed target DTO',()=>{
 const sql=HISTORICAL_SALES_HALL_BATCH_CTES;
 for(const token of ['hall_capture_proofs AS','historicalHallTargetCapturesSha256',"c.capture->>'input_source_record_hash'=s.pointer_hash",'ms.source_record_hash=encode(sha256',"master.item->'fields'->'version'=c.capture->'version'",'ma.xmin=roots.root_xmin',"ms.source_key=approved.item->'target_initialization'->>'warehouse_source_key'",'captured.capture_verified IS TRUE',"jsonb_set(s.source_record->'historical_hall_evidence','{target_snapshot}'"])assert(sql.includes(token),token);
 assert.doesNotMatch(sql,/clock_timestamp|transaction_timestamp|naijue_erp\.warehouse/,'readback does not recapture current target');
});
