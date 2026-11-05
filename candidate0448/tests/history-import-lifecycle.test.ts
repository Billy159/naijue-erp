/** Synthetic protocol only: no SQL engine, production data, server, migration or publication acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { HISTORY_COUNT_KEYS, HISTORY_MAPPING_VERSION } from "../packages/application/src/history-storage-contract.ts";
import type { HistoryCounts } from "../packages/application/src/history-storage-contract.ts";
import { historyImportStageMetadata, validateHistoryImportStageMetadata, HISTORY_IMPORT_READBACK_VERSION } from "../packages/application/src/history-import-lifecycle.ts";
import { validateCutoffImportCommand } from "../packages/application/src/inventory-cutoff-import.ts";
import type { CutoffImportCommand } from "../packages/application/src/inventory-cutoff-import.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";
import { reconcileHistoryImport } from "../adapters/postgres/src/history-import-lifecycle.ts";
import { PostgresCutoffImportStore } from "../adapters/postgres/src/inventory-cutoff-import-store.ts";
import type { PgSalesClient, PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { cutoffStage, cutoffPublish, cutoffChunk, cutoffTime, cutoffIds, cutoffExpected } from "./support/synthetic-cutoff-fixtures.ts";

const zero = (): HistoryCounts => Object.fromEntries(HISTORY_COUNT_KEYS.map(k=>[k,0])) as HistoryCounts;
const metadata=()=>({expectedCounts:zero(),payloadHash:"b".repeat(64)});
const versions=Array.from({length:14},(_,i)=>i+1);
const stage=()=>({...cutoffStage,mappingVersion:HISTORY_MAPPING_VERSION,historyMetadata:metadata()});
const row=()=>({id:cutoffIds.batch,source_name:cutoffStage.sourceName,source_manifest_ref:cutoffStage.sourceManifestRef,source_hash:cutoffStage.sourceHash,
  cutoff_at:cutoffTime,mapping_version:HISTORY_MAPPING_VERSION,inventory_mode:"CUTOFF_STOCK_BASELINE",status:"VALIDATING",
  checkpoint:{sequence:1,cursor:3,counts:{...cutoffExpected,IMPORT_BATCH:0},expected:cutoffExpected},created_at:cutoffTime,completed_at:null,
  history_expected_counts:metadata().expectedCounts,history_payload_hash:metadata().payloadHash});
class Client implements PgSalesClient {
  readonly calls:{sql:string;values:unknown[]}[]=[]; readonly releases:unknown[]=[];
  counts=zero(); entities:string[]=[]; invalidTag:string|undefined; databaseCount:unknown; batch:Record<string,unknown>|undefined;
  schema=versions; receipt:Record<string,unknown>|undefined; failureTag:string|undefined; failure=new Error("synthetic failure"); zeroCas=false;
  recordFailure:Error|undefined;
  async query(sql:string,values:unknown[]=[]):Promise<PgSalesResult>{
    this.calls.push({sql,values});
    const tag=/\/\* history-lifecycle:([^*]+?) \*\//.exec(sql)?.[1];
    if((this.failureTag!==undefined&&tag===this.failureTag) || (sql==="COMMIT"&&this.failureTag==="COMMIT"))throw this.failure;
    if(sql.startsWith("INSERT INTO naijue_erp.import_record")&&this.recordFailure)throw this.recordFailure;
    if(tag==="schema")return {rows:[{versions:this.schema}],rowCount:1};
    if(tag?.startsWith("count:"))return {rows:[{n:this.databaseCount??String(this.counts[tag.slice(6) as keyof HistoryCounts])}],rowCount:1};
    if(tag==="source-entities")return {rows:this.entities.map(entity_type=>({entity_type})),rowCount:this.entities.length};
    if(tag)return {rows:tag===this.invalidTag?[{invalid:1}]:[],rowCount:0};
    if(sql.includes("FROM naijue_erp.operation_receipt"))return {rows:this.receipt?[this.receipt]:[],rowCount:this.receipt?1:0};
    if(sql.includes("FROM naijue_erp.import_batch WHERE"))return {rows:this.batch?[this.batch]:[],rowCount:this.batch?1:0};
    assert.match(sql,/^(BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory_xact_lock|SELECT naijue_erp\.(cutoff_import_lock|import_source_key_lock|inventory_key_lock)|INSERT INTO naijue_erp\.(import_batch|import_record|audit_change|operation_receipt)|UPDATE naijue_erp.import_batch)/);
    return {rows:[],rowCount:this.zeroCas&&sql.startsWith("UPDATE")?0:1};
  }
  release(error?:Error|boolean){this.releases.push(error);}
}
const store=(c:Client)=>new PostgresCutoffImportStore({async connect(){return c;}});
const reconcile=(c:Client,m=metadata(),v:readonly number[]=versions)=>reconcileHistoryImport(c,cutoffIds.batch,m,v);

test("history lifecycle: V2 DTO is exact, immutable-cloned, and never caller validation authority",()=>{
  const m=metadata();validateHistoryImportStageMetadata(m);const cloned=historyImportStageMetadata(HISTORY_MAPPING_VERSION,m)!;
  m.expectedCounts.import_source_row=9;assert.equal(cloned.expectedCounts.import_source_row,0);
  for(const bad of [undefined,null,{...metadata(),validationPassed:true},{...metadata(),actualCounts:zero()},
    {...metadata(),expectedCounts:{...zero(),extra:0}},{...metadata(),expectedCounts:{...zero(),barcodes:-1}},
    {...metadata(),expectedCounts:{...zero(),barcodes:Number.MAX_SAFE_INTEGER+1}},{...metadata(),payloadHash:"B".repeat(64)}])
    assert.throws(()=>validateHistoryImportStageMetadata(bad),{code:"INVALID_HISTORY_IMPORT_METADATA"});
  assert.throws(()=>historyImportStageMetadata("legacy",metadata()),{code:"HISTORY_IMPORT_MAPPING_REQUIRED"});
  assert.equal(historyImportStageMetadata("legacy",undefined),undefined);
  assert.throws(()=>validateCutoffImportCommand({...cutoffStage,mappingVersion:HISTORY_MAPPING_VERSION}),{code:"INVALID_HISTORY_IMPORT_METADATA"});
  for(const key of ["validationPassed","historyValidationPassed","history_validation_passed","historyActualCounts","history_actual_counts"]){
    assert.throws(()=>validateCutoffImportCommand({...stage(),[key]:true} as CutoffImportCommand),{code:"CALLER_HISTORY_VALIDATION_FORBIDDEN"});
    assert.throws(()=>validateCutoffImportCommand({...cutoffPublish,approval:{...cutoffPublish.approval,[key]:true}} as CutoffImportCommand),{code:"CALLER_HISTORY_VALIDATION_FORBIDDEN"});
  }
  assert.throws(()=>validateCutoffImportCommand({...cutoffChunk,historyMetadata:metadata()} as CutoffImportCommand),{code:"INVALID_HISTORY_IMPORT_METADATA"});
  assert.notEqual(requestHash(stage()),requestHash({...stage(),historyMetadata:{...metadata(),payloadHash:"c".repeat(64)}}));
});
test("history lifecycle: STAGE writes reviewed metadata once with false validation, original receipt/audit/checkpoint",async()=>{
  const c=new Client();const result=await store(c).execute(stage(),cutoffTime);
  const insert=c.calls.find(x=>x.sql.startsWith("INSERT INTO naijue_erp.import_batch"))!;
  assert.match(insert.sql,/history_expected_counts, history_payload_hash, history_actual_counts, history_validation_passed/);
  assert.match(insert.sql,/\$9::jsonb, \$10, NULL, false/);assert.equal(insert.values.length,10);
  assert.deepEqual(JSON.parse(String(insert.values[8])),zero());assert.equal(insert.values[9],metadata().payloadHash);
  assert.equal(result.status,"STAGED");assert.equal(c.calls.filter(x=>x.sql.startsWith("INSERT INTO naijue_erp.audit_change")).length,1);
  assert.equal(c.calls.filter(x=>x.sql.startsWith("INSERT INTO naijue_erp.operation_receipt")).length,1);
  assert.ok(!c.calls.some(x=>x.sql.startsWith("UPDATE")));assert.equal(c.calls.at(-1)?.sql,"COMMIT");
});
test("history lifecycle: unknown schema fails V2 STAGE closed; legacy still has no history/schema queries",async()=>{
  const bad=new Client();bad.schema=[...versions,16,17];await assert.rejects(store(bad).execute(stage(),cutoffTime),{code:"HISTORY_IMPORT_SCHEMA_NOT_READY"});
  assert.equal(bad.calls.at(-1)?.sql,"ROLLBACK");assert.ok(!bad.calls.some(x=>x.sql.startsWith("INSERT")));
  const legacy=new Client();await store(legacy).execute(cutoffStage,cutoffTime);
  assert.ok(!legacy.calls.some(x=>x.sql.includes("history-lifecycle:")));assert.equal(legacy.calls.find(x=>x.sql.startsWith("INSERT INTO naijue_erp.import_batch"))!.values.length,8);
});
test("history lifecycle: observations, authorized artifact hash and field readback are distinct; no repair writes",async()=>{
  const c=new Client();const r=await reconcile(c);assert.deepEqual(r,{actualCounts:zero(),authorizedPayloadHash:metadata().payloadHash,sourcePayloadHashRecomputed:false,sqlFieldValidation:HISTORY_IMPORT_READBACK_VERSION});
  assert.equal(c.calls.filter(x=>x.sql.includes("history-lifecycle:count:")).length,9);
  assert.ok(c.calls.every(x=>!/^\s*(UPDATE|INSERT|DELETE)/.test(x.sql)));
  assert.ok(c.calls.filter(x=>x.sql.includes("history-lifecycle:lock:")).every(x=>/ORDER BY .+ FOR SHARE/.test(x.sql)));
  assert.ok(c.calls.findIndex(x=>x.sql.includes("lock:product"))<c.calls.findIndex(x=>x.sql.includes("count:import_source_row")));
  assert.ok(c.calls.some(x=>x.sql.includes("validate_history_product_proofs")));
});
for(const key of HISTORY_COUNT_KEYS)test(`history lifecycle: independent ${key} count mismatch cannot publish or repair counters`,async()=>{
  const c=new Client();c.counts[key]=1;await assert.rejects(reconcile(c),{code:"HISTORY_IMPORT_COUNT_MISMATCH"});
  assert.ok(c.calls.every(x=>!/^\s*(UPDATE|INSERT|DELETE)/.test(x.sql)));
});
test("history lifecycle: invalid DB counts and unsupported historical source/typed capabilities fail closed",async()=>{
  for(const n of ["-1","01","1.5",null,Number.MAX_SAFE_INTEGER+1]){const c=new Client();c.databaseCount=n===null?"NaN":n;await assert.rejects(reconcile(c),{code:"HISTORY_IMPORT_DATABASE_COUNT"});}
  for(const [key,code] of [["history_sales_line","HISTORY_IMPORT_SALES_LINE_NOT_IMPLEMENTED"],["history_sales_settlement","HISTORY_IMPORT_SETTLEMENT_NOT_IMPLEMENTED"],["history_sales_header","HISTORY_IMPORT_SALES_DOCUMENT_NOT_IMPLEMENTED"]] as const){
    const c=new Client(),m=metadata();m.expectedCounts[key]=1;await assert.rejects(reconcile(c,m),{code});assert.equal(c.calls.length,0);
  }
  for(const entity of ["SALES_LINE","SETTLEMENT","PAYMENT_ACCOUNT","UNKNOWN"]){const c=new Client();c.entities=[entity];await assert.rejects(reconcile(c),{code:"HISTORY_IMPORT_SOURCE_CAPABILITY_MISSING"});}
  const c=new Client();c.entities=["CATEGORY"];await assert.rejects(reconcile(c,metadata(),versions.slice(0,11)),{code:"HISTORY_IMPORT_CATALOGUE_BINDINGS_NOT_READY"});
});
for(const tag of ["source-provenance","source-coverage-TRANSFER_LINE","transfer-line-fields","transfer-document-lines","sku-alias-lineage","product-proof-required","product-fields","barcode-fields","stock-lineage","stock-sums","modern-reference-shapes","current-reference-product-category","current-reference-sku-product","catalogue-current-CATEGORY"])
  test(`history lifecycle: ${tag} invalidity blocks even exact counts`,async()=>{const c=new Client();c.invalidTag=tag;await assert.rejects(reconcile(c),{code:"HISTORY_IMPORT_READBACK_FAILED"});});
test("history lifecycle: schema12 existing-reference path and schema13 creation directory require current snapshots",async()=>{
  for(const version of [12,13]){const c=new Client();c.entities=["HALL"];c.invalidTag="party-binding-HALL";
    await assert.rejects(reconcile(c,metadata(),versions.slice(0,version)),{code:"HISTORY_IMPORT_READBACK_FAILED"});
    const sql=c.calls.find(x=>x.sql.includes("history-lifecycle:party-binding-HALL"))!.sql;assert.match(sql,/jsonb_populate_record/);
    assert.match(sql,/import_header_native_reference/);if(version===13)assert.match(sql,/native_party_import_evidence/);
  }
});
test("history lifecycle: PUBLISH reconciles same client before one original CAS; actual/flag never supplied by caller",async()=>{
  const c=new Client();c.batch=row();const result=await store(c).execute(cutoffPublish,cutoffTime);
  const writes=c.calls.filter(x=>x.sql.startsWith("UPDATE"));assert.equal(writes.length,1);assert.match(writes[0]!.sql,/history_actual_counts=\$7::jsonb, history_validation_passed=true/);
  assert.match(writes[0]!.sql,/checkpoint->>'sequence' = \$5 AND checkpoint->>'cursor' = \$6/);assert.deepEqual(JSON.parse(String(writes[0]!.values[6])),zero());
  const checkpoint=JSON.parse(String(writes[0]!.values[2]));assert.equal(checkpoint.sequence,2);assert.equal(checkpoint.cursor,4);assert.deepEqual(checkpoint.counts,cutoffExpected);
  assert.ok(c.calls.findIndex(x=>x.sql.includes("stock-sums"))<c.calls.findIndex(x=>x.sql.startsWith("INSERT INTO naijue_erp.import_record")));
  assert.equal(result.status,"IMPORTED");assert.equal(Object.keys(result).length,6);assert.equal(c.calls.at(-1)?.sql,"COMMIT");
});
test("history lifecycle: readback failure or CAS failure rolls back; original immutable receipt replay skips reconciliation",async()=>{
  const bad=new Client();bad.batch=row();bad.invalidTag="product-fields";await assert.rejects(store(bad).execute(cutoffPublish,cutoffTime),{code:"HISTORY_IMPORT_READBACK_FAILED"});
  assert.equal(bad.calls.at(-1)?.sql,"ROLLBACK");assert.ok(!bad.calls.some(x=>/^(UPDATE|INSERT)/.test(x.sql)));
  const cas=new Client();cas.batch=row();cas.zeroCas=true;await assert.rejects(store(cas).execute(cutoffPublish,cutoffTime),{code:"IMPORT_CHECKPOINT_CONFLICT"});assert.equal(cas.calls.at(-1)?.sql,"ROLLBACK");
  const first=new Client();const result=await store(first).execute(stage(),cutoffTime);
  const replay=new Client();replay.receipt={request_hash:requestHash(stage()),target_type:"IMPORT",target_id:cutoffIds.batch,action:"IMPORT_STAGE",result_data:result};
  assert.deepEqual(await store(replay).execute(stage(),cutoffTime),result);assert.ok(!replay.calls.some(x=>x.sql.includes("history-lifecycle:")||/^(INSERT|UPDATE)/.test(x.sql)));
});
test("history lifecycle: unknown COMMIT preserves uncertainty and discards without rollback or retry",async()=>{
  for(const publish of [false,true]){const c=new Client();if(publish)c.batch=row();c.failureTag="COMMIT";
    await assert.rejects(store(c).execute(publish?cutoffPublish:stage(),cutoffTime),e=>e===c.failure);
    assert.equal(c.releases[0],c.failure);assert.equal(c.calls.filter(x=>x.sql==="COMMIT").length,1);assert.ok(!c.calls.some(x=>x.sql==="ROLLBACK"));}
});
test("history lifecycle: existing creator record duplicate stays fail-closed; no aggregate counter repair/adoption",async()=>{
  const c=new Client();c.batch={...row(),status:"STAGED",checkpoint:{sequence:0,cursor:0,counts:{WAREHOUSE:0,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0},expected:cutoffExpected}};
  const duplicate=Object.assign(new Error("synthetic existing creator import_record unique violation"),{code:"23505"});c.recordFailure=duplicate;
  await assert.rejects(store(c).execute(cutoffChunk,cutoffTime),e=>e===duplicate);
  assert.equal(c.calls.at(-1)?.sql,"ROLLBACK");assert.ok(!c.calls.some(x=>/^UPDATE/.test(x.sql)||x.sql.includes("count(*)")));
  assert.ok(!c.calls.some(x=>/ON CONFLICT|UPSERT/.test(x.sql)));assert.equal(c.calls.filter(x=>x.sql.startsWith("INSERT INTO naijue_erp.import_record")).length,1);
});
test("history lifecycle: source SQL pins exact transfer contract, nullable temporal proofs and original money spelling",async()=>{
  const source=await readFile(new URL("../adapters/postgres/src/history-import-lifecycle.ts",import.meta.url),"utf8");
  assert.match(source,/v2Cents intentionally preserves/);assert.ok(source.includes("^-?[0-9]+([.][0-9]{1,2})?$"));
  assert.match(source,/s\.normalized_fields-ARRAY\[\$\{transferColumns\}\]='\{\}'::jsonb/);assert.match(source,/parsed_date','parsed_local','parsed_instant'/);
  assert.match(source,/WITH ORDINALITY/);assert.match(source,/native_snapshot IS DISTINCT FROM to_jsonb\(n\)/);
});
test("history lifecycle regression 22P02: generated JSON value is parenthesized before integer/numeric casts",async()=>{
  const c=new Client();await reconcile(c);
  const transfer=c.calls.find(x=>x.sql.includes("history-lifecycle:transfer-line-fields"))!.sql;
  assert.ok(transfer.includes("l.line_no=(s.normalized_fields->>'原行号')::integer"));
  assert.ok(!transfer.includes("->>'原行号'::integer"),"PG must never cast the key literal, even with an empty transfer table");
  const source=await readFile(new URL("../adapters/postgres/src/history-import-lifecycle.ts",import.meta.url),"utf8");
  assert.ok(source.includes('=> `(s.normalized_fields->>${quote(key)})`'));
  assert.ok(source.includes('=> `(s.field_provenance->\'fields\'->${quote(key)}->>${quote(property)})`'));
  assert.ok(source.includes('${N(field)}::numeric'));assert.ok(source.includes('${F(field,"parsed")}::numeric'));
  // These are generated-SQL/source checks, NOT PostgreSQL parsing/execution evidence.
});
