/** Source/predicate equivalence only. Actual PostgreSQL plan and timed recovery are T45's scope. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NATIVE_RUNTIME26_V19_METADATA_PROBE, NATIVE_RUNTIME26_V20_METADATA_PROBE } from "../adapters/postgres/src/native-import-accounting-capability.ts";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const oldFile=read("../adapters/postgres/migrations/0016_history_insert_dispatch.sql");
const patch=read("../adapters/postgres/patches/0026-v20-history-insert-source-identity.sql");
const body=(s:string)=>s.match(/AS \$\$([^]*?)\$\$;/)![1]!;
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
const oldQuery="SELECT EXISTS (SELECT 1 FROM naijue_erp.%I p JOIN naijue_erp.import_source_row s ON s.id = p.source_row_id WHERE p.batch_id = $1 AND s.source_key = $2)";
const newQuery="SELECT EXISTS (SELECT 1 FROM naijue_erp.import_source_row s JOIN naijue_erp.%I p ON p.source_row_id = s.id WHERE p.batch_id = $1 AND s.batch_id = $1 AND s.entity_type = $3 AND s.source_key = $2)";
test("v20 duplicate guard changes only source index-prefix predicates and original type argument",()=>{
 const old=body(oldFile),following=body(patch);
 assert.equal(hash(old),"bbd40680f3196904c9c9e986c6f8cef0bee77c4cbb19663b8333e8b6150e1f2f");
 assert.equal(following.replace(newQuery,oldQuery).replace("INTO duplicate_found USING NEW.batch_id, source.source_key, TG_ARGV[0];","INTO duplicate_found USING NEW.batch_id, source.source_key;"),old);
 assert.ok(NATIVE_RUNTIME26_V20_METADATA_PROBE.includes(`('guard_history_insert','${hash(following)}')`));
 assert.ok(NATIVE_RUNTIME26_V19_METADATA_PROBE.includes(`('guard_history_insert','${hash(old)}')`));
 assert.ok(NATIVE_RUNTIME26_V20_METADATA_PROBE.includes("jsonb_array_length(manifest->'routines')=131"));
 assert.equal((patch.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
 assert.equal(/^\s*(?:CREATE (?:UNIQUE )?INDEX|CREATE TABLE|ALTER TABLE|GRANT|REVOKE|SET (?:statement_timeout|work_mem))/im.test(patch),false);
 assert.ok(patch.includes("IF n<>131"));
 const schema=read("../adapters/postgres/migrations/0011_history_storage.sql");
 assert.ok(schema.includes("CREATE INDEX import_source_identity ON naijue_erp.import_source_row(batch_id, entity_type, source_key)"));
 for(const [table,kind] of [["history_sales_header","SALES_HEADER"],["history_transfer_header","TRANSFER_HEADER"],["history_sales_line","SALES_LINE"],["history_transfer_line","TRANSFER_LINE"],["history_sales_settlement","SETTLEMENT"]]){
  const definition=schema.split(`CREATE TABLE naijue_erp.${table} (`)[1]!.split("\n);")[0]!;
  assert.ok(definition.includes("source_row_id uuid NOT NULL UNIQUE"),table);
  assert.ok(definition.includes("FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id)"),table);
  assert.ok(schema.includes(`guard_history_insert('${kind}')`),kind);
 }
});
type Source={id:string;batch:string;entity:string;key:string};type Projection={batch:string;sourceId:string};
const oldDuplicate=(s:Source[],p:Projection[],batch:string,key:string)=>p.some(h=>h.batch===batch&&s.some(r=>r.id===h.sourceId&&r.key===key));
const newDuplicate=(s:Source[],p:Projection[],batch:string,kind:string,key:string)=>s.some(r=>r.batch===batch&&r.entity===kind&&r.key===key&&p.some(h=>h.batch===batch&&h.sourceId===r.id));
test("v20 source predicates preserve duplicates across original occurrences, kinds and batches under original immutable FK facts",()=>{
 for(const kind of ["SALES_HEADER","TRANSFER_HEADER","SALES_LINE","TRANSFER_LINE","SETTLEMENT"]){
  const sources:Source[]=[{id:"first-original-occurrence",batch:"A",entity:kind,key:"001"},{id:"second-original-occurrence",batch:"A",entity:kind,key:"001"},
   {id:"other-key",batch:"A",entity:kind,key:"1"},{id:"other-batch",batch:"B",entity:kind,key:"001"},
   {id:"other-entity",batch:"A",entity:"DIFFERENT_ENTITY",key:"001"}];
  const possible=sources.filter(s=>s.entity===kind).map(s=>({batch:s.batch,sourceId:s.id}));
  for(let mask=0;mask<1<<possible.length;mask++){
   const projections=possible.filter((_,i)=>mask&(1<<i));
   for(const batch of ["A","B","ABSENT_BATCH"])for(const key of ["001","1","ABSENT_KEY"])
    assert.equal(newDuplicate(sources,projections,batch,kind,key),oldDuplicate(sources,projections,batch,key),JSON.stringify({kind,mask,batch,key}));
  }
  assert.equal(newDuplicate(sources,[{batch:"A",sourceId:"second-original-occurrence"}],"A",kind,"001"),true);
  assert.equal(newDuplicate(sources,[{batch:"B",sourceId:"other-batch"}],"A",kind,"001"),false);
  assert.equal(newDuplicate(sources,[{batch:"A",sourceId:"other-key"}],"A",kind,"001"),false);
 }
});
