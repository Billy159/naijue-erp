/** Scripted transaction protocol, not PostgreSQL execution or real data acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresCutoffImportStore } from "../adapters/postgres/src/inventory-cutoff-import-store.ts";
import { stableImportId } from "../packages/application/src/inventory-cutoff-import.ts";
import type { BarcodeSchemeInitializationCommand } from "../packages/application/src/inventory-cutoff-import.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";
import { entityId } from "../packages/domain/src/values.ts";
const now="2026-01-01T00:00:00.000Z";
function command(): BarcodeSchemeInitializationCommand {
 return {action:"IMPORT_INITIALIZE_BARCODE_SCHEMES",batchId:stableImportId("synthetic","batch"),actorAccountId:entityId("account",stableImportId("synthetic","actor")),
 requestKey:"SYNTHETIC_INIT_V19",expectedSequence:1,expectedCursor:22,schemeInitialization:{version:"BARCODE_SCHEME_INITIALIZATION_V19",coreReceiptId:stableImportId("synthetic","core"),coreSourceDigest:"a".repeat(64),
 fixedSourceNamespace:"synthetic:schemes",selectionSha256:"b".repeat(64),cutoffAt:now,target:{database:"SYNTHETIC",role:"synthetic_import",serverAddress:null,serverPort:null,postmasterStartedAt:"SYNTHETIC_PROCESS"},
 approvalPins:{proposalSha256:"c".repeat(64),approvalSha256:"d".repeat(64),writeContractReplySha256:"e".repeat(64)},schemes:["2018","2020","2021","2021fit","2023","2026"].map(k=>({sourceSchemeKey:k,native:{id:stableImportId("synthetic",k),name:k,barcode_type:"Code128",rule_description:"SYNTHETIC ONLY",code_length:15,rule_version:"SYNTHETIC",status:k==="2026"?"CURRENT":"HISTORICAL"}}))}};
}
function fixture() {
 const c=command(), calls:string[]=[], releases:unknown[]=[], events:string[]=[];
 let receipt:any, audit:any, schemes:any[]=[], initialized=0, authorization=0, reject=false, actor=true, commitUnknown=false, badCallback=false, escaped:any;
 let checkpoint:any={sequence:1,cursor:22,counts:{WAREHOUSE:22,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0},expected:{}};
 let saved:any;
 const client={async query(sql:string,values:unknown[]=[]):Promise<any>{calls.push(sql);
  let rows:any[]=[],rowCount=1;
  if(sql.startsWith("BEGIN")) saved=structuredClone({receipt,audit,schemes,checkpoint});
  else if(sql==="ROLLBACK"){({receipt,audit,schemes,checkpoint}=saved);events.push("ROLLBACK");}
  else if(sql==="COMMIT"){events.push("COMMIT");if(commitUnknown)throw Error("SYNTHETIC_UNKNOWN_COMMIT");}
  else if(sql.includes("barcode-init:actor"))rows=actor?[{id:c.actorAccountId}]:[];
  else if(sql.includes("barcode-init:target"))rows=[c.schemeInitialization.target];
  else if(sql.includes("barcode-init:batch"))rows=[{id:c.batchId,mapping_version:"V2_HISTORY_NULLABLE_1",source_name:c.schemeInitialization.fixedSourceNamespace,source_hash:c.schemeInitialization.selectionSha256,cutoff_at:now,status:"STAGED",completed_at:null,history_validation_passed:false,checkpoint}];
  else if(sql.includes("barcode-init:receipt"))rows=receipt&&receipt.request_key===values[1]?[receipt]:[];
  else if(sql.includes("barcode-init:existing"))rows=receipt?[{id:receipt.id}]:[];
  else if(sql.includes("barcode-init:effects"))rows=[{barcode_source:false,barcode_rows:false,scheme_rows:schemes.length>0}];
  else if(sql.includes("barcode-init:readback"))rows=[...schemes].sort((a,b)=>a.id.localeCompare(b.id));
  else if(sql.includes("barcode-init:checkpoint")){assert.deepEqual(checkpoint,JSON.parse(values[2] as string));checkpoint=JSON.parse(values[1] as string);events.push("CHECKPOINT");}
  else if(sql.startsWith("INSERT INTO naijue_erp.barcode_scheme")){const [id,name,barcode_type,rule_description,code_length,rule_version,status]=values;schemes.push({id,name,barcode_type,rule_description,code_length,rule_version,status});rows=[{id}];events.push("SCHEME");}
  else if(sql.startsWith("INSERT INTO naijue_erp.audit_change")){audit={before_values:JSON.parse(values[7] as string),after_values:JSON.parse(values[8] as string)};events.push("AUDIT");}
  else if(sql.startsWith("INSERT INTO naijue_erp.operation_receipt")){receipt={id:values[0],request_key:values[2],request_hash:values[3],action:values[4],target_type:"IMPORT",target_id:values[5],status:"COMMITTED",result_data:JSON.parse(values[6] as string)};events.push("RECEIPT");}
  else if(sql.includes("barcode-init:replay-proof"))rows=audit?[audit]:[];
  else if(sql.includes("assert_barcode_scheme_initialization_v19")){events.push("VERIFY");const expected=[...c.schemeInitialization.schemes].map(s=>s.native).sort((a,b)=>a.id.localeCompare(b.id));if(requestHash([...schemes].sort((a,b)=>a.id.localeCompare(b.id)))!==requestHash(expected))throw Error("SYNTHETIC_EXACT6_DRIFT");}
  return {rows,rowCount};
 },release(error?:unknown){releases.push(error);}};
 const runtime={profile:"EXACT26" as const,contract:"NATIVE_RUNTIME26_V1" as const,async assertReady(value:unknown,purpose:string){assert.equal(value,client);assert.equal(purpose,"IMPORT_STAGE");}};
 const provider={async assertAllowed(_actor:unknown,_cmd:unknown){authorization++;if(reject)throw Error("SYNTHETIC_SOURCE_REVOKED");},async initializeSchemes26(borrowed:any,input:any,proof:any){initialized++;escaped=borrowed;await proof.assertReady(borrowed,"IMPORT_STAGE");assert.notEqual(borrowed,client);assert.equal(input.command.requestKey,c.requestKey);
  if(badCallback){await borrowed.query("DELETE FROM naijue_erp.barcode_scheme");return;}
  for(const {native:n} of input.command.schemeInitialization.schemes) await borrowed.query("INSERT INTO naijue_erp.barcode_scheme(id,name,barcode_type,rule_description,code_length,rule_version,status) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7) RETURNING id",[n.id,n.name,n.barcode_type,n.rule_description,n.code_length,n.rule_version,n.status]);
 }};
 const store=new PostgresCutoffImportStore({async connect(){return client;}},{runtime26:runtime,barcodeSchemeInitialization26:provider});
 return {c,store,calls,releases,events,state:()=>({receipt,audit,schemes,checkpoint,initialized,authorization,escaped}),
  reject:()=>{reject=true;},inactive:()=>{actor=false;},unknown:(v:boolean)=>{commitUnknown=v;},bad:()=>{badCallback=true;},drift:()=>{schemes[0].name="DRIFT";},missing:()=>{schemes.pop();},extra:()=>{schemes.push({...schemes[0],id:stableImportId("synthetic","extra")});}};
}
test("v19 same-client creation commits exact6, paired audit/receipt and sequence-only checkpoint once",async()=>{
 const f=fixture(),r=await f.store.execute(f.c,now),s=f.state();assert.equal(r.sequence,2);assert.equal(r.cursor,22);assert.deepEqual(r.ledgerEntryIds,[]);assert.equal(Object.keys(r).length,6);
 assert.equal(s.initialized,1);assert.equal(s.schemes.length,6);assert.deepEqual(s.checkpoint,{...s.audit.before_values.checkpoint,sequence:2});
 assert.equal(s.audit.after_values.commandHash,requestHash(f.c));assert.deepEqual(f.events.slice(-5),["CHECKPOINT","AUDIT","RECEIPT","VERIFY","COMMIT"]);
 const before=f.events.length;assert.deepEqual(await f.store.execute(f.c,now),r);assert.equal(f.state().initialized,1);assert.equal(f.state().authorization,2);
 assert.ok(f.events.slice(before).includes("VERIFY"));assert.ok(!f.events.slice(before).includes("SCHEME"));assert.ok(f.calls.some(q=>q==="LOCK TABLE naijue_erp.barcode_scheme IN SHARE MODE"));
 await assert.rejects(s.escaped.query("SELECT id,name,barcode_type,rule_description,code_length,rule_version,status FROM naijue_erp.barcode_scheme ORDER BY id FOR SHARE"),{code:"BARCODE_SCHEME_CALLBACK_SCOPE"});
});
test("v19 replay always authorizes current actor/source and validates whole-table drift, missing and extra",async()=>{
 for(const change of ["drift","missing","extra","reject","inactive"] as const){const f=fixture();await f.store.execute(f.c,now);f[change]();await assert.rejects(f.store.execute(f.c,now));assert.equal(f.state().initialized,1);assert.equal(f.events.at(-1),"ROLLBACK");}
});
test("v19 original key hash and different-key non-adoption, checkpoint CAS and restricted callback fail atomically",async()=>{
 const f=fixture();await f.store.execute(f.c,now);
 await assert.rejects(f.store.execute({...f.c,expectedSequence:9},now),{code:"IDEMPOTENCY_CONFLICT"});
 await assert.rejects(f.store.execute({...f.c,requestKey:"OTHER",expectedSequence:2},now),{code:"BARCODE_SCHEME_INITIALIZATION_CONFLICT"});
 const g=fixture();await assert.rejects(g.store.execute({...g.c,expectedCursor:21},now),{code:"IMPORT_CHECKPOINT_CONFLICT"});assert.equal(g.state().schemes.length,0);
 const h=fixture();h.bad();await assert.rejects(h.store.execute(h.c,now),{code:"BARCODE_SCHEME_CALLBACK_SCOPE"});assert.equal(h.state().schemes.length,0);assert.equal(h.state().receipt,undefined);
});
test("v19 unknown COMMIT retains original committed key and requires explicit receipt recovery without second write",async()=>{
 const f=fixture();f.unknown(true);await assert.rejects(f.store.execute(f.c,now),/SYNTHETIC_UNKNOWN_COMMIT/);assert.ok(f.releases.at(-1) instanceof Error);
 assert.equal(f.state().initialized,1);assert.equal(f.state().receipt.request_hash,requestHash(f.c));assert.equal(f.calls.filter(q=>q==="ROLLBACK").length,0);
 f.unknown(false);await f.store.execute(f.c,now);assert.equal(f.state().initialized,1);assert.equal(f.state().schemes.length,6);
});
