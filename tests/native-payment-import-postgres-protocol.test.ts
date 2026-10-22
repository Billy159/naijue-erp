/** Scripted pg protocol only. Does not execute SQL or establish engine constraints. */
import test from "node:test";import assert from "node:assert/strict";
import { PostgresNativePaymentImportStore } from "../adapters/postgres/src/native-payment-import.ts";
import { prepareNativePaymentImportChunk } from "../packages/application/src/native-payment-import.ts";
import { paymentChunk,paymentId,PAYMENT_NAMESPACE,PAYMENT_HASH } from "./support/native-payment-fixtures.ts";
function fixture(options:{existing?:boolean;replay?:boolean;drift?:boolean;missingReference?:boolean;commitFail?:boolean;sourceFail?:boolean;guards?:boolean;versions?:number[]}={}){
 const calls:{sql:string;values:unknown[]}[]=[],releases:unknown[]=[];let connects=0;
 const pool={async connect(){connects++;return{async query(sql:string,values:unknown[]=[]){calls.push({sql,values});const result=(rows:Record<string,unknown>[])=>({rows,rowCount:rows.length});
  if(sql==="COMMIT"&&options.commitFail)throw Error("UNKNOWN_COMMIT");
  if(sql.includes("inventory:guards"))return result([{integrity_guards_present:true}]);if(sql.includes("native-accounting:guards"))return result([{accounting_guards_present:options.guards!==false}]);
  if(sql.includes("native-payment:schema"))return result([{versions:options.versions??Array.from({length:17},(_,i)=>i+1)}]);
  if(sql.includes("native-payment:batch"))return result([{id:paymentId(1),mapping_version:"V2_HISTORY_NULLABLE_1",status:"STAGED",source_hash:PAYMENT_HASH,source_name:PAYMENT_NAMESPACE,already_published:false}]);
  if(sql.includes("native-payment:target"))return result(options.existing||options.replay?[{native_equal:!options.drift}]:[]);
  if(sql.includes("native-payment:reference-target"))return result([{native_equal:!options.drift}]);
  if(sql.includes("native-payment:reference-binding"))return result(options.missingReference?[]:[{binding_equal:true}]);
  if(sql.includes("native-payment:binding-replay"))return result(options.replay?[{binding_equal:true}]:[]);
  if(sql.includes("native-payment:source-replay"))return result(options.replay?[{source_equal:true}]:[]);
  if(sql.includes("native-payment:create:"))return result([{native_snapshot:JSON.parse(values[0] as string)}]);
  if(sql.includes("native-payment:source-create")){if(options.sourceFail)throw Error("ACTUAL_INSERT_FAILED");return result([{id:values[0]}]);}
  if(sql.includes("native-payment:binding-create"))return result([{source_row_id:values[3]}]);
  return result([]);
 },release(error?:unknown){releases.push(error);}};}};
 return {store:new PostgresNativePaymentImportStore(pool),calls,releases,connects:()=>connects};
}
test("native payment creation locks cutoff/schema/batch and real dependencies before source classification; native/source/binding commit together",async()=>{
 for(const entity of ["PAYMENT_METHOD","PAYMENT_ACCOUNT","PAYMENT_ACCOUNT_HALL"] as const){const f=fixture(),c=prepareNativePaymentImportChunk(paymentChunk(entity,entity==="PAYMENT_METHOD"?10:entity==="PAYMENT_ACCOUNT"?20:40));
  const r=await f.store.stage(c);assert.deepEqual(r,{inserted:1,replayed:0,nativeCurrentMatchesCreation:true});
  const texts=f.calls.map(c=>c.sql);assert.equal(texts[0],"BEGIN ISOLATION LEVEL READ COMMITTED");assert.match(texts[1]!,/cutoff_import_lock/);
  assert.ok(texts.findIndex(s=>s.includes("native-payment:target"))<texts.findIndex(s=>s.includes("native-payment:source-replay")));
  assert.ok(texts.findIndex(s=>s.includes("native-payment:create:"))<texts.findIndex(s=>s.includes("native-payment:source-create")));
  assert.equal(texts.at(-1),"COMMIT");assert.equal(f.releases[0],undefined);
 }
});
test("old target without creation proof refuses; exact operation replay never overwrites current maintenance",async()=>{
 const c=prepareNativePaymentImportChunk(paymentChunk());
 const old=fixture({existing:true});await assert.rejects(old.store.stage(c));assert.equal(old.calls.some(c=>c.sql.includes("native-payment:create:")),false);
 const replay=fixture({replay:true,drift:true});assert.deepEqual(await replay.store.stage(c),{inserted:0,replayed:1,nativeCurrentMatchesCreation:false});
 assert.equal(replay.calls.some(c=>/^(?:INSERT|UPDATE|DELETE)\b|\*\/\s*(?:INSERT|UPDATE|DELETE)\b/.test(c.sql)),false);
 const orphan=fixture({missingReference:true});await assert.rejects(orphan.store.stage(prepareNativePaymentImportChunk(paymentChunk("PAYMENT_ACCOUNT",20))));
 assert.equal(orphan.calls.some(c=>c.sql.includes("native-payment:create:")),false);
});
test("raw prepared getter/symbol rejects without connection, future19/missing17/disabled guards refuse before writes",async()=>{
 let getters=0;const getter=prepareNativePaymentImportChunk(paymentChunk());Object.defineProperty(getter,"input",{get(){getters++;throw Error();}});
 const f=fixture();await assert.rejects(f.store.stage(getter));assert.equal(f.connects(),0);assert.equal(getters,0);
 const symbol=prepareNativePaymentImportChunk(paymentChunk());Object.defineProperty(symbol.rows[0]!,Symbol("hidden"),{value:true});await assert.rejects(f.store.stage(symbol));assert.equal(f.connects(),0);
 for(const options of [{versions:Array.from({length:19},(_,i)=>i+1)},{versions:Array.from({length:16},(_,i)=>i+1)},{guards:false}]){
  const f=fixture(options);await assert.rejects(f.store.stage(prepareNativePaymentImportChunk(paymentChunk())));assert.equal(f.calls.some(c=>/\bINSERT\b/.test(c.sql)),false);
 }
});
test("known precommit failure rolls back; uncertain COMMIT discards and never rolls back/retries",async()=>{
 for(const options of [{sourceFail:true},{commitFail:true}]){const f=fixture(options);await assert.rejects(f.store.stage(prepareNativePaymentImportChunk(paymentChunk())));
  assert.equal(f.connects(),1);assert.equal(f.calls.some(c=>c.sql==="ROLLBACK"),!!options.sourceFail);
  if(options.commitFail)assert.ok(f.releases[0] instanceof Error);else assert.equal(f.releases[0],undefined);
 }
});
