/** Pure source/prepared projection tests only; no SQL engine or import permission. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildHistoryTypedClosureExpected,buildHistoryTypedClosureExpected26,historyClosureProjectionRow,historyClosureProjectionRow26,historyClosureProjectionSpec,historyClosureProjectionSpec26,historyClosureRowHash,HISTORY_CLOSURE_SOURCE_ENTITIES } from "../packages/application/src/history-typed-closure.ts";
import { HISTORY_COUNT_KEYS } from "../packages/application/src/history-storage-contract.ts";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const extras:Readonly<Record<string,readonly string[]>>={product:["season_ids","deleted_at","default_barcode_scheme_id"],sku:["created_operation_id"],warehouse:["created_operation_id"],product_category:["deleted_at"],color:["deleted_at"],fit:["deleted_at"]};
function original(relation:string):Record<string,unknown>{
 const spec=historyClosureProjectionSpec().find(s=>s.relation===relation)!;
 return Object.fromEntries(spec.columns.map(k=>[k,k==="id"||k.endsWith("_id")?id(1):k.endsWith("_price")?null:k==="version"?1:k==="enabled"?true:k==="display_order"?0:k==="year"?null:"SYNTHETIC ORIGINAL"]));
}
const upgraded=(relation:string)=>({...original(relation),...Object.fromEntries(extras[relation]!.map(k=>[k,null]))});
test("closure26 full product25 SKU9 warehouse6 and dictionary snapshots preserve originals; old projection refuses successor fields",()=>{
 for(const relation of Object.keys(extras)){
  const old=original(relation),full=upgraded(relation),before=structuredClone(full),row=historyClosureProjectionRow26(relation,full);
  assert.deepEqual(row.projection,full);assert.deepEqual(full,before);
  assert.deepEqual(Object.fromEntries(Object.entries(row.projection as Record<string,unknown>).filter(([k])=>!extras[relation]!.includes(k))),old);
  assert.throws(()=>historyClosureProjectionRow26(relation,old));assert.throws(()=>historyClosureProjectionRow(relation,full));
  for(const field of extras[relation]!){const missing={...full};delete missing[field];assert.throws(()=>historyClosureProjectionRow26(relation,missing));}
 }
 assert.equal(historyClosureProjectionSpec26().find(s=>s.relation==="product")!.columns.length,25);
 assert.equal(historyClosureProjectionSpec26().find(s=>s.relation==="sku")!.columns.length,9);
 assert.equal(historyClosureProjectionSpec26().find(s=>s.relation==="warehouse")!.columns.length,6);
 const hashes=[null,[],[id(1)],[id(1),id(2)]].map(season_ids=>historyClosureRowHash(historyClosureProjectionRow26("product",{...upgraded("product"),season_ids})));
 assert.equal(new Set(hashes).size,4);
 for(const season_ids of [[id(2),id(1)],[id(1),id(1)],false,["fake"]])assert.throws(()=>historyClosureProjectionRow26("product",{...upgraded("product"),season_ids}));
 let called=0;const getter=[];Object.defineProperty(getter,"0",{enumerable:true,get(){called++;return id(1);}});
 assert.throws(()=>historyClosureProjectionRow26("product",{...upgraded("product"),season_ids:getter}));assert.equal(called,0);
});
function input(typedRows:unknown){return {batchId:id(10),fixedSourceNamespace:"SYNTHETIC_ONLY",selectionSha256:"a".repeat(64),authorizedPayloadHash:"b".repeat(64),
 expectedCounts:Object.fromEntries(HISTORY_COUNT_KEYS.map(k=>[k,0])),expectedSourceEntityCounts:Object.fromEntries(HISTORY_CLOSURE_SOURCE_ENTITIES.map(k=>[k,0])),documents:[],sourceRows:[],typedRows};}
test("closure26 expected builder hashes every added member/default and refuses old-field truncation; default builder keeps old roots",async()=>{
 const old=historyClosureProjectionRow("product",original("product")),prior=await buildHistoryTypedClosureExpected(input([old]));
 assert.equal(prior.documents.length,0);
 const row=historyClosureProjectionRow26("product",upgraded("product")),next=await buildHistoryTypedClosureExpected26(input([row]));
 assert.notEqual(prior.plan.typedManifestSha256,next.plan.typedManifestSha256);
 assert.equal(prior.plan.version,next.plan.version);assert.equal(prior.plan.sourceManifestSha256,next.plan.sourceManifestSha256);
 const selected=historyClosureProjectionRow26("product",{...upgraded("product"),season_ids:[id(1),id(2)]});
 assert.notEqual((await buildHistoryTypedClosureExpected26(input([selected]))).plan.typedManifestSha256,next.plan.typedManifestSha256);
 await assert.rejects(buildHistoryTypedClosureExpected26(input([old])));await assert.rejects(buildHistoryTypedClosureExpected(input([row])));
});
test("closure26 source SQL projection columns match pure26 exactly while all other relation branches retain original18 bytes",()=>{
 const previous=readFileSync(new URL("../adapters/postgres/migrations/0018_history_typed_publication.sql",import.meta.url),"utf8");
 const successor=readFileSync(new URL("../adapters/postgres/migrations/0026_exact_historical_customer_supplement.sql",import.meta.url),"utf8");
 for(const spec of historyClosureProjectionSpec26()){
  const escaped=spec.relation.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),cols=new RegExp(" WHEN '"+escaped+"' THEN RETURN ARRAY\\[([^\\n]+)\\];");
  const old=cols.exec(previous),current=cols.exec(successor);assert.ok(old);assert.ok(current);
  assert.deepEqual([...current[1]!.matchAll(/'([^']+)'/g)].map(m=>m[1]),spec.columns);
  if(!extras[spec.relation])assert.equal(current[0],old[0]);
  else {
   const line=new RegExp(" WHEN '"+escaped+"' THEN result:=jsonb_build_object\\(([^\\n]+)").exec(successor)![1]!;
   for(const field of extras[spec.relation]!){assert.ok(line.includes("'"+field+"'"));assert.ok(line.includes("original->"+(field==="deleted_at"?">":"")+"'"+field+"'"));}
  }
 }
});
