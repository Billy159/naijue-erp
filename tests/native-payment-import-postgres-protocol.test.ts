/** Scripted pg protocol only. Does not execute SQL or establish engine constraints. */
import test from "node:test";import assert from "node:assert/strict";
import { PostgresNativePaymentImportStore, PostgresNativePaymentImportStore26 } from "../adapters/postgres/src/native-payment-import.ts";
import { prepareNativePaymentImportChunk } from "../packages/application/src/native-payment-import.ts";
import { paymentChunk,paymentId,PAYMENT_NAMESPACE,PAYMENT_HASH } from "./support/native-payment-fixtures.ts";
function fixture(options:{runtime26?:boolean;denied?:boolean;booleanProof?:boolean;existing?:boolean;replay?:boolean;drift?:boolean;missingReference?:boolean;commitFail?:boolean;sourceFail?:boolean;guards?:boolean;versions?:number[]}={}){
 const calls:{sql:string;values:unknown[]}[]=[],releases:unknown[]=[];let connects=0,proofs=0;let lease:object|undefined;
 const pool={async connect(){connects++;const client={async query(sql:string,values:unknown[]=[]){calls.push({sql,values});const result=(rows:Record<string,unknown>[])=>({rows,rowCount:rows.length});
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
 },release(error?:unknown){releases.push(error);}};lease=client;return client;}};
 const runtime={profile:"EXACT26" as const,contract:"NATIVE_RUNTIME26_V1" as const,async assertReady(client:object,purpose:string){proofs++;assert.equal(client,lease);assert.equal(purpose,"IMPORT_STAGE");assert.equal(calls.length,0);if(options.denied)throw Error("NATIVE_RUNTIME26_NOT_READY");if(options.booleanProof)return true as never;}};
 return {store:options.runtime26?new PostgresNativePaymentImportStore26(pool,runtime):new PostgresNativePaymentImportStore(pool),pool,runtime,calls,releases,connects:()=>connects,proofs:()=>proofs};
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

test('payment26 actual same-client admission precedes SQL, exact prefix26 is private and legacy path remains closed',async()=>{
 const input=prepareNativePaymentImportChunk(paymentChunk()),versions=Array.from({length:26},(_,i)=>i+1),plain=fixture({versions});
 assert.throws(()=>new PostgresNativePaymentImportStore26(plain.pool,undefined as never),/runtime capability/);assert.equal(plain.connects(),0);
 await assert.rejects(plain.store.stage(input));assert.equal(plain.calls.some(c=>c.sql.includes('native-payment:batch')),false);
 for(const options of [{denied:true},{booleanProof:true}]){const f=fixture({runtime26:true,versions,...options});await assert.rejects(f.store.stage(input));assert.equal(f.calls.length,0);assert.ok(f.releases[0]);}
 for(const length of [19,27]){const f=fixture({runtime26:true,versions:Array.from({length},(_,i)=>i+1)});await assert.rejects(f.store.stage(input));assert.equal(f.calls.some(c=>c.sql.includes('native-payment:batch')),false);}
});
test('payment26 preserves all three complete native bindings, original source and maintenance drift only on exact replay',async()=>{
 const versions=Array.from({length:26},(_,i)=>i+1);
 for(const entity of ['PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL'] as const){const c=prepareNativePaymentImportChunk(paymentChunk(entity,entity==='PAYMENT_METHOD'?10:entity==='PAYMENT_ACCOUNT'?20:40)),f=fixture({runtime26:true,versions});assert.deepEqual(await f.store.stage(c),{inserted:1,replayed:0,nativeCurrentMatchesCreation:true});assert.equal(f.proofs(),1);assert.equal(f.calls.at(-1)!.sql,'COMMIT');}
 const input=prepareNativePaymentImportChunk(paymentChunk()),replay=fixture({runtime26:true,versions,replay:true,drift:true});assert.deepEqual(await replay.store.stage(input),{inserted:0,replayed:1,nativeCurrentMatchesCreation:false});assert.equal(replay.calls.some(c=>/(?:^|\*\/)\s*(?:INSERT|UPDATE|DELETE)\b/.test(c.sql)),false);
 const adopted=fixture({runtime26:true,versions,existing:true});await assert.rejects(adopted.store.stage(input));assert.equal(adopted.calls.some(c=>c.sql.includes('native-payment:create:')),false);
 const orphan=fixture({runtime26:true,versions,missingReference:true});await assert.rejects(orphan.store.stage(prepareNativePaymentImportChunk(paymentChunk('PAYMENT_ACCOUNT',20))));assert.equal(orphan.calls.at(-1)!.sql,'ROLLBACK');
});
test('payment26 precommit source failure rolls back while uncertain COMMIT discards without retry',async()=>{
 for(const options of [{sourceFail:true},{commitFail:true}]){const f=fixture({runtime26:true,versions:Array.from({length:26},(_,i)=>i+1),...options});await assert.rejects(f.store.stage(prepareNativePaymentImportChunk(paymentChunk())));assert.equal(f.connects(),1);assert.equal(f.calls.some(c=>c.sql==='ROLLBACK'),!!options.sourceFail);if(options.commitFail)assert.ok(f.releases[0]);}
});
