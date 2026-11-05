/** Scripted protocol/codec tests only; no PostgreSQL or business acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { verifyCoreStagedPrefix22, verifyCommittedCoreStagedPrefix22, captureCoreStagedPrefixBinding22, CORE_PREFIX_GROUPS22 } from "../adapters/postgres/src/native-core-staged-prefix-bind.ts";
import type { CoreStagedPrefixExpected22 } from "../adapters/postgres/src/native-core-staged-prefix-bind.ts";
import { NATIVE_RUNTIME26_V20_METADATA_PROBE, NATIVE_RUNTIME26_V22_METADATA_PROBE } from "../adapters/postgres/src/native-import-accounting-capability.ts";
import { historyClosureProjectionRow26, historyClosureProjectionSpec26 } from "../packages/application/src/history-typed-closure.ts";
import type { HistoryClosureRow } from "../packages/application/src/history-typed-closure.ts";
import type { BindFullSourceCommand } from "../packages/application/src/inventory-cutoff-import.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";
const id=(n:number)=>`22000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const now="2026-10-01T00:00:00.123456Z", batch=id(1), actor=id(2);
function fixture(){
 let number=10;const actual=new Map<string,HistoryClosureRow>(),calls:string[]=[];
 const command={action:"IMPORT_BIND_FULL_SOURCE",actorAccountId:actor,batchId:batch,requestKey:"SYNTHETIC_ORIGINAL_V22",expectedSequence:2,expectedCursor:22,fullBinding:{}} as BindFullSourceCommand;
 function row(relation:string,extra:Record<string,unknown>={}){
  const spec=historyClosureProjectionSpec26().find(s=>s.relation===relation)!;
  const projection:Record<string,unknown>=Object.fromEntries(spec.columns.map(c=>[c,null]));
  Object.assign(projection,{id:id(number++),batch_id:batch,version:1},extra);
  for(const k of Object.keys(projection))if(!spec.columns.includes(k))delete projection[k];
  for(const key of spec.keys)if(projection[key]===null)projection[key]=key==="batch_id"?batch:`SYNTHETIC_${number}`;
  for(const key of ["row_no","quantity","signed_quantity"])if(spec.columns.includes(key))projection[key]="1";
  const result=historyClosureProjectionRow26(relation,projection);actual.set(relation+":"+result.key,structuredClone(result));return result;
 }
 const entities=["SALES_HEADER","TRANSFER_LINE","PRODUCT","SKU","INVENTORY_BASELINE"];
 const relations=[["history_sales_header","history_transfer_header"],["history_transfer_line"],["product"],["import_sku_alias","sku"],["import_stock_contributor"]];
 const sourceLists:HistoryClosureRow[][]=[],typedLists:HistoryClosureRow[][]=[];
 const stream=(rows:HistoryClosureRow[])=>async function*(){for(const x of rows)yield structuredClone(x);};
 const groups=CORE_PREFIX_GROUPS22.map((name,i)=>{
  const sources=[row("import_source_row",{entity_type:entities[i],source_key:`SYNTHETIC_${name}`,file_ref:"SYNTHETIC",row_sha256:"a".repeat(64),source_file_sha256:"b".repeat(64)})];
  const typed=relations[i]!.map(rel=>row(rel,{source_row_id:(sources[0]!.projection as any).id,old_source_sku_id:"SYNTHETIC_SKU",canonical_source_key:"SYNTHETIC_SKU",mapping_basis:"ORIGINAL",name:"SYNTHETIC",created_operation_id:null}));
  sourceLists.push(sources);typedLists.push(typed);return{name,sourceRows:stream(sources),typedRows:stream(typed)};
 });
 const schemes=Array.from({length:6},(_,i)=>row("barcode_scheme",{name:`SYNTHETIC_${i}`,barcode_type:"Code128",rule_description:"SYNTHETIC",code_length:15,rule_version:"SYNTHETIC",status:i===5?"CURRENT":"HISTORICAL"}).projection as Record<string,unknown>);
 const record={id:id(number++),import_batch_id:batch,source_entity_type:"SKU",source_key:"SYNTHETIC_SKU",source_record_hash:"a".repeat(64),source_file_ref:"SYNTHETIC",target_type:"SKU",target_id:id(9),status:"IMPORTED",decision_reason:"SYNTHETIC_APPROVED",reviewed_at:now};
 const recordRow={relation:"import_record",key:record.id,projection:record};actual.set("import_record:"+record.id,structuredClone(recordRow));
 const expected:CoreStagedPrefixExpected22={version:"CORE_STAGED_PREFIX_BIND_V22",binding:{batchId:batch,actorAccountId:actor,fixedSourceNamespace:"synthetic.prefix22",cutoffAt:now,selectionSha256:"c".repeat(64),commandHash:requestHash(command)},preparation:{inputDigest:"d".repeat(64),manifestSha256:"e".repeat(64)},groups,schemes,skuRecords:stream([recordRow]),schemeInitialization:{operationId:id(3),requestKey:"SYNTHETIC_ORIGINAL_SCHEME",requestHash:"f".repeat(64),approvalPins:{proposalSha256:"a".repeat(64),approvalSha256:"b".repeat(64),writeContractReplySha256:"c".repeat(64)}}};
 const client={async query(sql:string,values:unknown[]=[]):Promise<any>{calls.push(sql);
  const relation=/core-prefix22:members:([a-z_]+)/.exec(sql)?.[1];
  if(relation)return{rowCount:1,rows:JSON.parse(values[0] as string).map((e:HistoryClosureRow)=>{const a=actual.get(relation+":"+e.key);return{key:e.key,present:Boolean(a),projection:a?.projection};})};
  assert.ok(sql.includes("core-prefix22:scheme-receipt"));return{rowCount:1,rows:[{id:expected.schemeInitialization.operationId,actor_account_id:actor,target_id:batch,request_key:expected.schemeInitialization.requestKey,request_hash:expected.schemeInitialization.requestHash,action:"IMPORT_INITIALIZE_BARCODE_SCHEMES",status:"COMMITTED",after_values:{schemeInitialization:{approvalPins:expected.schemeInitialization.approvalPins,fixedSourceNamespace:expected.binding.fixedSourceNamespace,selectionSha256:expected.binding.selectionSha256,cutoffAt:now,schemes:schemes.map(native=>({native}))}}}]};
 },release(){throw Error("Adapter must not release or replace original lease");}};
 const authority={async capture(c:BindFullSourceCommand){assert.deepEqual(c,command);assert.notEqual(c,command);return expected;}};
 const verify=()=>verifyCoreStagedPrefix22(client,command,{source_name:expected.binding.fixedSourceNamespace,source_hash:expected.binding.selectionSha256,cutoff_at:now},authority);
 return{verify,expected,actual,calls,sourceLists,typedLists};
}
test("v22 compares complete eight-table and original SKU-record projections using source-owned streams and original read-only lease",async()=>{
 const f=fixture(),proof=await f.verify();assert.equal(proof.groups.length,6);assert.equal(proof.skuRecords.rows,1);assert.equal(proof.groups[5]!.typed.rows,6);assert.equal(proof.groups[5]!.source.rows,0);
 assert.ok(f.calls.every(s=>s.startsWith("/* core-prefix22:")));assert.ok(f.calls.every(s=>!/(?:INSERT|UPDATE|DELETE|COMMIT|BEGIN|ROLLBACK|FOR SHARE|FOR UPDATE)/.test(s)));
 assert.deepEqual(proof.binding,f.expected.binding);assert.ok(!("capture" in proof));
});

function currentClient(f: ReturnType<typeof fixture>) {
 const calls:string[]= []; let pending:HistoryClosureRow[]|null=null;
 const entities:Record<string,string[]>={HEADERS:["SALES_HEADER","TRANSFER_HEADER"],TRANSFER_LINES:["TRANSFER_LINE"],PRODUCTS:["PRODUCT"],SKUS:["SKU"],STOCK_CONTRIBUTORS:["INVENTORY_BASELINE"],SCHEMES:["BARCODE"]};
 const relations:Record<string,string[]>={HEADERS:["history_sales_header","history_transfer_header"],TRANSFER_LINES:["history_transfer_line"],PRODUCTS:["product"],SKUS:["import_sku_alias","sku"],STOCK_CONTRIBUTORS:["import_stock_contributor"],SCHEMES:["barcode_scheme"],SKU_RECORDS:["import_record"]};
 const client={async query(sql:string,values:unknown[]=[]):Promise<any>{
  calls.push(sql);const declared=/core-prefix22:current:([A-Z_]+):(source|typed)/.exec(sql);
  if(declared){
   assert.equal(pending,null);const group=declared[1]!,source=declared[2]==="source";
   assert.ok(sql.includes("NO SCROLL CURSOR FOR SELECT"));assert.ok(!/batch_id\s*=|import_batch_id\s*=/.test(sql));
   assert.deepEqual(values,source?[entities[group]]:[]);
   pending=[...f.actual.values()].filter(row=>source?row.relation==="import_source_row"&&entities[group]!.includes((row.projection as any).entity_type):relations[group]!.includes(row.relation))
    .sort((a,b)=>Buffer.compare(Buffer.from(a.relation+"\0"+a.key),Buffer.from(b.relation+"\0"+b.key)));
   return{rows:[],rowCount:0};
  }
  if(sql==="FETCH FORWARD 128 FROM core_prefix22_current"){
   assert.ok(pending);const rows=pending.splice(0,128).map(row=>structuredClone(row));return{rows,rowCount:rows.length};
  }
  assert.equal(sql,"CLOSE core_prefix22_current");assert.deepEqual(pending,[]);pending=null;return{rows:[],rowCount:0};
 },release(){throw Error("Original transaction owns lease");}};
 return{client,calls};
}
test("committed prefix reads complete current seven sets with original codec and bounded same-client cursor",async()=>{
 const f=fixture();const original=f.sourceLists[0]![0]!;
 for(let i=0;i<130;i++){
  const row={...structuredClone(original),key:id(1000+i)};(row.projection as any).id=row.key;
  f.sourceLists[0]!.push(row);f.actual.set(row.relation+":"+row.key,row);
 }
 const proof=await f.verify(),c=currentClient(f);
 const read=await verifyCommittedCoreStagedPrefix22(c.client,proof,{...proof.binding,cutoffAt:"2026-10-01T00:00:00.123456+00:00"});
 assert.deepEqual(read,proof);assert.notEqual(read,proof);
 assert.equal(c.calls.filter(sql=>sql.startsWith("/* core-prefix22:current:")).length,13);
 assert.equal(c.calls.filter(sql=>sql==="FETCH FORWARD 128 FROM core_prefix22_current").length,14);
 assert.ok(c.calls.every(sql=>!/(?:INSERT|UPDATE|DELETE|COMMIT|BEGIN|ROLLBACK|GRANT)/.test(sql)));
});
test("committed prefix rejects extra missing and changed members without deriving expected roots from actual rows",async t=>{
 for(const kind of ["extra","missing","field","sku-record","stock-link"]){await t.test(kind,async()=>{
  const f=fixture(),proof=await f.verify();
  const row=[...f.actual.values()].find(r=>r.relation===(kind==="sku-record"?"import_record":kind==="stock-link"?"import_stock_contributor":"product"))!;
  if(kind==="missing")f.actual.delete(row.relation+":"+row.key);
  else if(kind==="extra"){const extra={...structuredClone(row),key:id(999)};(extra.projection as any).id=extra.key;f.actual.set(extra.relation+":"+extra.key,extra);}
  else (row.projection as any)[kind==="sku-record"?"decision_reason":kind==="stock-link"?"baseline_ledger_id":"name"]="CHANGED";
  await assert.rejects(verifyCommittedCoreStagedPrefix22(currentClient(f).client,proof,proof.binding),{code:"CORE_STAGED_PREFIX_MISMATCH"});
 });}
});
test("committed prefix rejects binding and malformed audit proof before reading current data",async()=>{
 const f=fixture(),proof=await f.verify();
 for(const mutate of [(p:any)=>{p.binding.commandHash="0".repeat(64);},(p:any)=>{p.groups[0].source.rows=0;},(p:any)=>{p.groups.reverse();},(p:any)=>{p.preparation.extra=true;}]){
  const changed=structuredClone(proof);mutate(changed);const c=currentClient(f);
  await assert.rejects(verifyCommittedCoreStagedPrefix22(c.client,changed,proof.binding),{code:"CORE_STAGED_PREFIX_MISMATCH"});assert.equal(c.calls.length,0);
 }
});
test("v22 rejects real member full-field drift in every admitted table, including SKU record review identity",async t=>{
 for(const relation of ["history_sales_header","history_transfer_header","history_transfer_line","product","sku","barcode_scheme","import_sku_alias","import_stock_contributor","import_record"]){await t.test(relation,async()=>{const f=fixture(),r=[...f.actual.values()].find(x=>x.relation===relation)!;const p=r.projection as Record<string,unknown>;if(relation==="import_record")p.decision_reason="OTHER";else if(relation==="import_stock_contributor")p.signed_quantity="-7";else if(relation==="import_sku_alias")p.mapping_basis="OTHER";else if(relation==="barcode_scheme")p.name="OTHER";else p.version=99;await assert.rejects(f.verify());});}
});
test("v22 missing actual source, wrong batch/group, duplicate approved rows and absent original SKU record stream fail closed",async t=>{
 await t.test("source missing",async()=>{const f=fixture();f.actual.delete("import_source_row:"+f.sourceLists[0]![0]!.key);await assert.rejects(f.verify(),{code:"CORE_STAGED_PREFIX_MISMATCH"});});
 await t.test("foreign batch",async()=>{const f=fixture();(f.sourceLists[0]![0]!.projection as any).batch_id=id(900);await assert.rejects(f.verify());});
 await t.test("wrong command",async()=>{const f=fixture();(f.expected.binding as any).commandHash="0".repeat(64);await assert.rejects(f.verify());assert.equal(f.calls.length,0);});
 await t.test("duplicates",async()=>{const f=fixture();f.typedLists[0]!.push(f.typedLists[0]![0]!);await assert.rejects(f.verify());});
 await t.test("record missing",async()=>{const f=fixture();delete(f.expected as any).skuRecords;await assert.rejects(f.verify());assert.equal(f.calls.length,0);});
});
test("v22 private source port rejects permissive booleans/accessors before activation",()=>{
 assert.throws(()=>captureCoreStagedPrefixBinding22({capture:true} as any));let read=false;assert.throws(()=>captureCoreStagedPrefixBinding22(Object.defineProperty({},"capture",{enumerable:true,get(){read=true;return()=>{};}}) as any));assert.equal(read,false);
});
test("v22 SQL installs only one exact-parent function; new profile pins that actual source body and retains old v20 probe",()=>{
 const sql=readFileSync(new URL("../adapters/postgres/patches/0026-v22-staged-prefix-bind.sql",import.meta.url),"utf8"),body=sql.split("$v22$")[1]!;
 const sha=createHash("sha256").update(body).digest("hex");assert.ok(NATIVE_RUNTIME26_V22_METADATA_PROBE.includes(sha));
 assert.equal(NATIVE_RUNTIME26_V22_METADATA_PROBE,NATIVE_RUNTIME26_V20_METADATA_PROBE.replace("('assert_core_initialization_v14','5ca42bcac20e7ad3affb3ac09829fd27c481752a303b1090133f23ecee3ad99d')",`('assert_core_initialization_v14','${sha}')`));
 assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);assert.ok(!/ALTER TABLE|CREATE TABLE|CREATE TRIGGER|GRANT |SECURITY DEFINER|INSERT INTO|DELETE FROM/.test(sql));
 assert.ok(sql.includes("IF prefix22 IS NULL THEN"));assert.ok(sql.includes("Only separately granted exact warehouse accounting may precede binding"));assert.ok(sql.includes("target_type NOT IN('WAREHOUSE','SKU')"));assert.ok(sql.includes("Actual complete prefix members differ"));assert.ok(sql.includes("'history_revision'] LOOP"));
 assert.ok(!body.includes("PERFORM naijue_erp.assert_barcode_scheme_initialization_v19("));
});
test("v22 expanded projections and stream formulas equal original codec without extra runtime EXECUTE grants",async()=>{
 const original=readFileSync(new URL("../adapters/postgres/migrations/0026_exact_historical_customer_supplement.sql",import.meta.url),"utf8");
 const adapter=readFileSync(new URL("../adapters/postgres/src/native-core-staged-prefix-bind.ts",import.meta.url),"utf8");
 const match=/projectionExpressions22: Readonly<Record<string,string>> = (\{[\s\S]*?\});\nfunction projectionSql/.exec(adapter)!;
 const expressions=JSON.parse(match[1]!) as Record<string,string>;
 const body=readFileSync(new URL("../adapters/postgres/patches/0026-v22-staged-prefix-bind.sql",import.meta.url),"utf8").split("$v22$")[1]!;
 for(const [relation,expression]of Object.entries(expressions)){
  if(relation!=="import_record"){
   const source=new RegExp("WHEN '"+relation+"' THEN result:=([\\s\\S]*?);").exec(original)![1]!;
   const base=source.replaceAll("original","to_jsonb(t)");
   assert.equal(expression,base);
  }
  assert.ok(body.includes(expression),relation);
 }
 for(const field of ["season_ids","deleted_at","default_barcode_scheme_id","created_operation_id"])assert.ok(body.includes("'"+field+"',to_jsonb(t)->'"+field+"'")||body.includes("'"+field+"',to_jsonb(to_char((to_jsonb(t)->>'"+field+"')"));
 assert.ok(body.includes("sha256(naijue_erp.history_closure_encode(jsonb_build_array('HISTORY_CLOSURE_STREAM_V1',scope22)))"));
 assert.ok(body.includes("sha256(decode('01','hex')||state22||decode(naijue_erp.history_closure_row_hash("));
 assert.ok(body.includes("jsonb_build_array('HISTORY_CLOSURE_STREAM_FINAL_V1',scope22,n,encode(state22,'hex'))"));
 for(const helper of ["history_closure_projection(","history_closure_projection_key(","history_closure_seed(","history_closure_fold(","history_closure_finish("])
  assert.equal(body.includes(helper),false,helper);
 const f=fixture();await f.verify();for(const query of f.calls)assert.ok(!/naijue_erp\.history_closure_(?:projection|projection_key|seed|fold|finish)\(/.test(query));
});
