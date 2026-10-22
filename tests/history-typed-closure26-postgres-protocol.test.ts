/** Scripted transaction protocol only; no PostgreSQL or source authority. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresHistoryTypedClosure19Store, PostgresHistoryTypedClosure26Store } from "../adapters/postgres/src/history-typed-closure19.ts";
import { HISTORY_COUNT_KEYS } from "../packages/application/src/history-storage-contract.ts";
import { HISTORY_CLOSURE_SOURCE_ENTITIES, HISTORY_TYPED_CLOSURE_VERSION } from "../packages/application/src/history-typed-closure.ts";
import type { HistoryTypedClosureStageInput } from "../packages/application/src/history-typed-closure.ts";
const id="00000000-0000-4000-8000-000000000001";
function input(): HistoryTypedClosureStageInput { return { batchId:id,fixedSourceNamespace:"SYNTHETIC_CLOSURE",documents:[],plan:{version:HISTORY_TYPED_CLOSURE_VERSION,
 selectionSha256:"a".repeat(64),authorizedPayloadHash:"b".repeat(64),sourceManifestSha256:"c".repeat(64),typedManifestSha256:"d".repeat(64),documentManifestSha256:"e".repeat(64),
 expectedCounts:Object.fromEntries(HISTORY_COUNT_KEYS.map(k=>[k,0])) as HistoryTypedClosureStageInput["plan"]["expectedCounts"],
 sourceEntityCounts:Object.fromEntries(HISTORY_CLOSURE_SOURCE_ENTITIES.map(k=>[k,0])) as HistoryTypedClosureStageInput["plan"]["sourceEntityCounts"],documentCount:0} }; }
function protocol(options:{runtimeFailureAt?:number;booleanRuntime?:boolean;sourceDenied?:boolean;sourceBoolean?:boolean;failDeep?:boolean;badManifest?:boolean;commitUnknown?:boolean;legacy?:boolean}={}) {
 const calls:string[]=[],released:unknown[]=[];let connects=0,checks=0,manifest=false;
 const data=input(),client={async query(sql:string,values:unknown[]=[]){calls.push(sql);let rows:Record<string,unknown>[]=[];
  if(sql.includes("history19-closure:schema"))rows=[{versions:Array.from({length:19},(_,i)=>i+1)}];
  else if(sql.includes("inventory:guards"))rows=[{integrity_guards_present:true}];
  else if(sql.includes("accounting_guards_present"))rows=[{accounting_guards_present:true}];
  else if(sql.includes("history19-closure:batch"))rows=[{id,source_name:data.fixedSourceNamespace,source_hash:data.plan.selectionSha256,mapping_version:"V2_HISTORY_NULLABLE_1",status:"STAGED",history_payload_hash:data.plan.authorizedPayloadHash,exact_counts:true,published:false}];
  else if(sql.includes("history19-closure:readback")){assert.equal(values[0],id);if(options.failDeep)throw Error("SYNTHETIC deep source mismatch");}
  else if(sql.includes("history19-closure:manifest"))rows=manifest?[{exact:!options.badManifest}]:[];
  else if(sql.includes("history19-closure:insert")){manifest=true;rows=[{batch_id:id}];}
  else if(sql.includes("history19-closure:documents-exact"))rows=[{exact:true}];
  else if(sql==="COMMIT"&&options.commitUnknown)throw Error("SYNTHETIC commit unknown");
  else if(!/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)&&!sql.includes("history19-closure:lock"))throw Error("Unexpected closure protocol SQL");
  return {rows,rowCount:rows.length};},release(error?:unknown){released.push(error);}};
 const pool={async connect(){connects++;return client;}},runtime={profile:"EXACT26" as const,contract:"NATIVE_RUNTIME26_V1" as const,async assertReady(c:object,purpose:string){checks++;assert.equal(c,client);assert.equal(purpose,"IMPORT_STAGE");if(checks===options.runtimeFailureAt)throw Error("SYNTHETIC runtime denied");if(options.booleanRuntime)return true as unknown as undefined;}};
 const authorizeStage=async(copy:HistoryTypedClosureStageInput)=>{assert.deepEqual(copy,data);if(options.sourceDenied)throw Error("SYNTHETIC source denied");if(options.sourceBoolean)return true as unknown as undefined;(copy.plan as {typedManifestSha256:string}).typedManifestSha256="f".repeat(64);};
 const store=options.legacy?new PostgresHistoryTypedClosure19Store(pool,{authorizeStage}):new PostgresHistoryTypedClosure26Store(pool,{authorizeStage,runtime26:runtime});
 return {store,data,calls,released,pool,runtime,connects:()=>connects,checks:()=>checks};
}
test("closure26 same-client source-authorized stage keeps full SQL closure/readback and exact insert-free replay",async()=>{
 const p=protocol();assert.deepEqual(await p.store.stage(p.data),{inserted:1,replayed:0});assert.equal(p.checks(),2);
 assert.ok(p.calls.findIndex(s=>s.includes(":readback"))<p.calls.findIndex(s=>s.includes(":insert")));
 assert.ok(!p.calls.some(s=>s.includes("history19-closure:schema")||s.includes("accounting_guards_present")));
 assert.deepEqual(await p.store.stage(p.data),{inserted:0,replayed:1});assert.equal(p.calls.filter(s=>s.includes(":insert")).length,1);assert.deepEqual(p.released,[undefined,undefined]);
});
test("closure26 denies absent/revoked/boolean runtime or source authority before targets and rejects legacy config widening",async()=>{
 assert.throws(()=>new PostgresHistoryTypedClosure26Store({async connect(){throw Error("no connect");}},{authorizeStage:async()=>{},runtime26:undefined as never}));
 const p=protocol();assert.throws(()=>new PostgresHistoryTypedClosure19Store(p.pool,{authorizeStage:async()=>{},runtime26:p.runtime} as never));
 for(const options of [{runtimeFailureAt:1},{booleanRuntime:true},{sourceDenied:true},{sourceBoolean:true}]){const h=protocol(options);await assert.rejects(h.store.stage(h.data));assert.equal(h.calls.length,0);}
 const late=protocol({runtimeFailureAt:2});await assert.rejects(late.store.stage(late.data));assert.equal(late.calls.at(-1),"ROLLBACK");assert.ok(!late.calls.some(s=>s.includes(":batch")));
});
test("closure26 SQL drift rolls back before immutable success; unknown COMMIT discards with no replay or rollback",async()=>{
 for(const options of [{failDeep:true},{badManifest:true}]){const p=protocol(options);await assert.rejects(p.store.stage(p.data));assert.equal(p.calls.at(-1),"ROLLBACK");assert.ok(!p.calls.includes("COMMIT"));}
 const p=protocol({commitUnknown:true});await assert.rejects(p.store.stage(p.data),/commit unknown/);assert.equal(p.calls.at(-1),"COMMIT");assert.ok(p.released[0] instanceof Error);assert.equal(p.connects(),1);
});
test("closure19 affected stage retains original exact-prefix and pinned guard queries",async()=>{
 const p=protocol({legacy:true});assert.deepEqual(await p.store.stage(p.data),{inserted:1,replayed:0});assert.equal(p.checks(),0);assert.ok(p.calls.some(s=>s.includes("history19-closure:schema")));assert.ok(p.calls.some(s=>s.includes("accounting_guards_present")));
});
