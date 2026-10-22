/** Driver protocol doubles, not engine SQL. */
import test from "node:test";import assert from "node:assert/strict";
import { PostgresHistorySettlementStagingStore,createPostgresHistorySettlementBindingResolver } from "../adapters/postgres/src/import-v3-history-settlement-staging-store.ts";
import { prepareHistorySettlementChunk } from "../packages/application/src/import-v3-history-settlement.ts";
import { settlementChunk } from "./support/history-settlement-fixtures.ts";
import { paymentId as id,PAYMENT_HASH,PAYMENT_NAMESPACE } from "./support/native-payment-fixtures.ts";
function fixture(options:{replay?:boolean;orphan?:boolean;missingBinding?:boolean;commitFail?:boolean;insertFail?:boolean}={}){
 const chunk=prepareHistorySettlementChunk(settlementChunk()),row=chunk.rows[0]!,calls:{sql:string;values:unknown[]}[]=[],releases:unknown[]=[];let connects=0,source=!!options.replay||!!options.orphan,line=!!options.replay;
 const pool={async connect(){connects++;return{async query(sql:string,values:unknown[]=[]){calls.push({sql,values});const rows=(rows:Record<string,unknown>[])=>({rows,rowCount:rows.length});
  if(sql==="COMMIT"&&options.commitFail)throw Error("UNKNOWN_COMMIT");
  if(sql.includes("inventory:guards"))return rows([{integrity_guards_present:true}]);if(sql.includes("native-accounting:guards"))return rows([{accounting_guards_present:true}]);
  if(sql.includes("settlement:schema")||sql.includes("settlement:resolver-schema"))return rows([{versions:Array.from({length:17},(_,i)=>i+1)}]);
  if(sql.includes("settlement:batch"))return rows([{id:id(1),mapping_version:"V2_HISTORY_NULLABLE_1",status:"STAGED",source_hash:PAYMENT_HASH,source_name:PAYMENT_NAMESPACE,already_published:false}]);
  if(sql.includes("settlement:resolver-batch"))return rows([{id:id(1)}]);
  if(sql.includes("settlement:lock-"))return rows((values[0] as string[]).map(id=>({id})));
  if(sql.includes("settlement:source-replay"))return rows(source?[{id:row.source.id,source_equal:true}]:[]);
  if(sql.includes("settlement:typed-replay"))return rows(line?[{id:row.settlement.id,settlement_equal:true}]:[]);
  if(sql.includes("settlement:check-header")||sql.includes("settlement:check-payment"))return rows(options.missingBinding?[]:[{id:values[1]}]);
  if(sql.includes("settlement:resolver-header"))return rows([{id:row.header.nativeId,source_row_id:row.header.sourceRowId,source_file_sha256:PAYMENT_HASH,row_sha256:PAYMENT_HASH,version:1}]);
  if(sql.includes("settlement:resolver-payment")){const b=values[1]==="PAYMENT_ACCOUNT"?row.account:row.method!;return rows([{native_id:b.nativeId,source_row_id:b.sourceRowId,source_file_sha256:b.sourceFileSha256,row_sha256:b.rowSha256,evidence_fingerprint:b.fingerprint,native_snapshot:b.nativeSnapshot}]);}
  if(sql.includes("settlement:insert-source")){source=true;return rows([{id:row.source.id}]);}
  if(sql.includes("settlement:insert-typed")){if(options.insertFail)throw Error("TYPED_INSERT_FAILURE");line=true;return rows([{id:row.settlement.id}]);}
  return rows([]);
 },release(error?:unknown){releases.push(error);}};}};
 return {pool,store:new PostgresHistorySettlementStagingStore(pool),chunk,calls,releases,connects:()=>connects};
}
test("settlement source and typed row stage/replay together with stable native locks before source checks; no live/native/stock writes",async()=>{
 const f=fixture();assert.deepEqual(await f.store.stage(f.chunk),{inserted:1,replayed:0});assert.equal(f.calls.at(-1)!.sql,"COMMIT");
 assert.ok(f.calls.findIndex(c=>c.sql.includes("settlement:lock-accounts"))<f.calls.findIndex(c=>c.sql.includes("settlement:source-replay")));
 const inserts=f.calls.filter(c=>c.sql.includes("INSERT INTO"));assert.equal(inserts.length,2);assert.match(inserts[0]!.sql,/import_source_row/);assert.match(inserts[1]!.sql,/history_sales_settlement/);
 const r=fixture({replay:true});assert.deepEqual(await r.store.stage(r.chunk),{inserted:0,replayed:1});assert.equal(r.calls.some(c=>c.sql.includes("INSERT INTO")),false);
 const orphan=fixture({orphan:true});await assert.rejects(orphan.store.stage(orphan.chunk));assert.equal(orphan.calls.some(c=>c.sql.includes("INSERT INTO")),false);
 const missing=fixture({missingBinding:true});await assert.rejects(missing.store.stage(missing.chunk));assert.equal(missing.calls.some(c=>c.sql.includes("INSERT INTO")),false);
});
test("prepared getters/symbols reject before connection; known failure rollback and unknown COMMIT discard without rollback/retry",async()=>{
 const f=fixture();let getters=0;Object.defineProperty(f.chunk,"input",{get(){getters++;throw Error();}});await assert.rejects(f.store.stage(f.chunk));assert.equal(f.connects(),0);assert.equal(getters,0);
 for(const options of [{insertFail:true},{commitFail:true}]){const f=fixture(options);await assert.rejects(f.store.stage(f.chunk));assert.equal(f.connects(),1);assert.equal(f.calls.some(c=>c.sql==="ROLLBACK"),!!options.insertFail);if(options.commitFail)assert.ok(f.releases[0] instanceof Error);}
});
test("readonly exact selected settlement resolver retains independent method identity and refuses raw source/key mismatch before borrowing",async()=>{
 const f=fixture(),r=createPostgresHistorySettlementBindingResolver(f.pool,{batchId:id(1),fixedSourceNamespace:PAYMENT_NAMESPACE,selectionSha256:PAYMENT_HASH}),s=settlementChunk().rows[0]!.source;
 const resolved=await r({entity:"SETTLEMENT",sourceKey:s.sourceKey,rawFields:s.rawFields,normalizedFields:s.normalizedFields});assert.equal(resolved.account.nativeSnapshot.payment_method_id,id(10));assert.equal(resolved.method!.nativeId,id(11));
 assert.equal(f.calls[0]!.sql,"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");assert.equal(f.calls.some(c=>/FOR SHARE|FOR UPDATE|INSERT INTO/.test(c.sql)),false);
 for(const change of ["source","header","account","method"]){const x=fixture(),resolve=createPostgresHistorySettlementBindingResolver(x.pool,{batchId:id(1),fixedSourceNamespace:PAYMENT_NAMESPACE,selectionSha256:PAYMENT_HASH});
  const q={entity:"SETTLEMENT" as const,sourceKey:s.sourceKey,rawFields:structuredClone(s.rawFields),normalizedFields:structuredClone(s.normalizedFields)};
  if(change==="source")q.sourceKey="OTHER";else q.rawFields[change==="header"?"单据来源编号":change==="account"?"账户来源编号":"原收款方式来源编号"]="OTHER";
  await assert.rejects(resolve(q));assert.equal(x.connects(),0);
 }
});
