/** Scripted protocol/codec tests only; no PostgreSQL or business acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { verifyCoreStagedPrefix22, captureCoreStagedPrefixBinding22, CORE_PREFIX_GROUPS22 } from "../adapters/postgres/src/native-core-staged-prefix-bind.ts";
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
 return{verify,expected,actual,calls,sourceLists,typedLists,command,client,authority};
}

import { PostgresCutoffImportStore } from "../adapters/postgres/src/inventory-cutoff-import-store.ts";
import { stableImportId, validateCutoffImportCommand } from "../packages/application/src/inventory-cutoff-import.ts";
function storeFixture(){
 const f=fixture(),members:any[]=[];
 for(const [entity,count]of [["STAFF",49],["HALL",22],["WAREHOUSE",22],["CUSTOMER",22]] as const)for(let i=0;i<count;i++){const n=members.length+500;members.push({entity,sourceRowId:id(n),sourceKey:`SYNTHETIC_${entity}_${i}`,nativeId:id(n+1000),version:1,nativeSnapshot:{id:id(n+1000),version:1},operations:[]});}
 Object.assign(f.command,{fullBinding:{authorizedPayloadHash:"b".repeat(64),historyExpectedCounts:{import_source_row:9,import_sku_alias:1,history_sales_header:1,history_transfer_header:1,history_sales_line:0,history_transfer_line:1,history_sales_settlement:0,import_stock_contributor:1,barcodes:0},inventoryExpectedCounts:{WAREHOUSE:22,SKU:1,INVENTORY_LEDGER:0,IMPORT_BATCH:1},sourceClosurePins:Array.from({length:11},(_,i)=>({group:`SYNTHETIC_${i}`,sha256:"a".repeat(64)})),coreReceiptId:id(4),coreSourceDigest:"a".repeat(64),coreMaintenanceBinding:{version:"CORE_MAINTENANCE_BINDING_V1",members}}});
 (f.expected.binding as any).commandHash=requestHash(f.command);validateCutoffImportCommand(f.command);
 const counts={WAREHOUSE:22,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0},coreCounts={STAFF:49,HALL:22,WAREHOUSE:22,CUSTOMER:22,USER_ACCOUNT:49};
 const original={checkpoint:{sequence:2,cursor:22,counts,expected:{}},audit:undefined as any,receipt:undefined as any};let state=structuredClone(original),saved=structuredClone(original),captures=0,authorizations=0,released:unknown[]=[];let unknown=false,denied=false;
 const calls:string[]=[];
 const client={async query(sql:string,v:unknown[]=[]):Promise<any>{calls.push(sql);
  if(sql.startsWith("/* core-prefix22:"))return f.client.query(sql,v);
  if(sql.startsWith("BEGIN")){saved=structuredClone(state);return{rows:[],rowCount:0};}
  if(sql==="ROLLBACK"){state=structuredClone(saved);return{rows:[],rowCount:0};}
  if(sql==="COMMIT"){if(unknown){unknown=false;throw Error("SYNTHETIC_COMMIT_OUTCOME_UNKNOWN");}return{rows:[],rowCount:0};}
  if(sql.startsWith("SELECT request_hash"))return{rows:state.receipt?[state.receipt]:[],rowCount:0};
  if(sql.includes("FROM naijue_erp.import_batch WHERE id = $1 FOR UPDATE"))return{rows:[{id:batch,source_name:f.expected.binding.fixedSourceNamespace,source_hash:f.expected.binding.selectionSha256,cutoff_at:now,status:"STAGED",history_payload_hash:null,history_expected_counts:null,checkpoint:state.checkpoint}],rowCount:1};
  if(sql.includes("native-core:birth"))return{rows:[{id:id(4),after_values:{phase:"CORE_INITIALIZED_V1",coreSourceDigest:"a".repeat(64),coreCounts}}],rowCount:1};
  if(sql.includes("native-core:bind-full")){state.checkpoint=JSON.parse(v[1] as string);return{rows:[],rowCount:1};}
  if(sql.startsWith("INSERT INTO naijue_erp.audit_change")){state.audit=JSON.parse(v[8] as string);return{rows:[],rowCount:1};}
  if(sql.startsWith("INSERT INTO naijue_erp.operation_receipt")){state.receipt={request_hash:v[3],target_type:"IMPORT",target_id:batch,action:f.command.action,result_data:JSON.parse(v[6] as string)};return{rows:[],rowCount:1};}
  assert.ok(sql.startsWith("SELECT pg_advisory_xact_lock")||sql==="SELECT naijue_erp.cutoff_import_lock()",sql);return{rows:[],rowCount:1};
 },release(error?:unknown){released.push(error);}};
 const runtime={profile:"EXACT26" as const,contract:"NATIVE_RUNTIME26_V1" as const,async assertReady(value:unknown){assert.equal(value,client);}};
 const port={async capture(command:BindFullSourceCommand){captures++;if(denied)throw Error("SYNTHETIC_SOURCE_DENIED");return f.authority.capture(command);}};
 const store=new PostgresCutoffImportStore({async connect(){return client;}},{runtime26:runtime,coreAuthorization:{async assertAllowed(){authorizations++;}},stagedPrefixBinding26:port});
 return{f,store,calls,released,state:()=>state,captures:()=>captures,authorizations:()=>authorizations,unknown:()=>{unknown=true;},deny:()=>{denied=true;},original};
}
test("v22 original transaction checks full prefix before checkpoint and records one audit proof without changing original key/hash/result",async()=>{
 const x=storeFixture(),digest=requestHash(x.f.command),result=await x.store.execute(x.f.command,now);assert.equal(requestHash(x.f.command),digest);assert.equal(result.sequence,3);assert.equal(result.cursor,22);assert.equal(Object.keys(result).length,9);
 assert.equal(x.state().audit.stagedPrefixProof.binding.commandHash,digest);assert.equal(x.state().audit.stagedPrefixProof.skuRecords.rows,1);assert.equal(x.state().receipt.request_hash,digest);
 assert.ok(x.calls.findIndex(s=>s.includes("core-prefix22:members"))<x.calls.findIndex(s=>s.includes("native-core:bind-full")));assert.equal(x.calls.filter(s=>s==="COMMIT").length,1);assert.deepEqual(x.released,[undefined]);
 const index=x.calls.length;assert.deepEqual(await x.store.execute(x.f.command,now),result);assert.equal(x.captures(),1);assert.equal(x.authorizations(),2);assert.ok(x.calls.slice(index).every(s=>!s.startsWith("INSERT")&&!s.includes("native-core:bind-full")&&!s.includes("core-prefix22:members")));
});
test("v22 revoked source or complete native field mismatch rolls back before bind/audit/receipt and preserves committed prefix",async t=>{
 for(const mode of ["source","native"]as const)await t.test(mode,async()=>{const x=storeFixture(),prefix=structuredClone([...x.f.actual]);if(mode==="source")x.deny();else{const r=[...x.f.actual.values()].find(r=>r.relation==="product")!;(r.projection as any).name="BAD";}
 const before=structuredClone([...x.f.actual]);await assert.rejects(x.store.execute(x.f.command,now));assert.deepEqual(x.state(),x.original);assert.equal(x.calls.at(-1),"ROLLBACK");assert.ok(x.calls.every(s=>!s.startsWith("INSERT")&&!s.includes("native-core:bind-full")));assert.deepEqual([...x.f.actual],before);assert.ok(prefix.length>0);});
});
test("v22 unknown COMMIT is discarded, never auto-rolled back or retried, original receipt recovery is read-only",async()=>{
 const x=storeFixture();x.unknown();await assert.rejects(x.store.execute(x.f.command,now),/SYNTHETIC_COMMIT_OUTCOME_UNKNOWN/);assert.equal(x.calls.filter(s=>s==="COMMIT").length,1);assert.equal(x.calls.includes("ROLLBACK"),false);assert.ok(x.released[0] instanceof Error);assert.equal(x.captures(),1);
 // The fake models a committed receipt before a lost response. Explicit same-key
 // recovery exercises only existing receipt lookup, not an automatic retry.
 const index=x.calls.length;const result=await x.store.execute(x.f.command,now);assert.equal(result.sequence,3);assert.equal(x.captures(),1);assert.ok(x.calls.slice(index).every(s=>!s.startsWith("INSERT")&&!s.includes("native-core:bind-full")));assert.equal(x.calls.filter(s=>s==="COMMIT").length,2);
});
test("v22 private port requires genuine runtime and captures own-data methods without executing getters",()=>{
 let connected=false;const pool={async connect(){connected=true;throw Error("Unexpected activation");}};
 assert.throws(()=>new PostgresCutoffImportStore(pool,{stagedPrefixBinding26:{async capture(){throw Error("Unexpected capture");}}}),{code:"IMPORT_BOOTSTRAP_REQUIRED"});assert.equal(connected,false);
});
