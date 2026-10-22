/** Synthetic protocol/state fake ONLY; does not parse PostgreSQL or prove durability/isolation. */
import test from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { PostgresHistorySalesDetailStagingStore } from "../adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts";
import { prepareHistorySalesDetailChunk } from "../packages/application/src/import-v3-history-sales-detail.ts";
import type { HistorySalesDetailChunk } from "../packages/application/src/import-v3-history-sales-detail.ts";
import type { PgSalesClient,PgSalesPool,PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { syntheticSalesDetailChunk, salesDetailId, salesDetailHash } from "./support/synthetic-sales-detail-fixtures.ts";
type Row=Record<string,unknown>;
class Pool implements PgSalesPool{
 calls:{sql:string;v:unknown[]}[]=[];connects=0;releases:unknown[]=[];
 committed={sources:new Map<string,Row>(),lines:new Map<string,Row>()};working=structuredClone(this.committed);
 schema=Array.from({length:14},(_,i)=>i+1);bindingsValid=true;closed=false;nativeMissing=false;failTag:string|undefined;zeroInsert=false;commitApplied=false;rollbackFails=false;failure=new Error("synthetic failure");
 async connect():Promise<PgSalesClient>{this.connects++;return {query:(sql,v=[])=>this.query(sql,v),release:e=>{this.releases.push(e);}};}
 async query(sql:string,v:unknown[]):Promise<PgSalesResult>{
  this.calls.push({sql,v});const tag=/\/\* sales-detail:([^*]+?) \*\//.exec(sql)?.[1];
  const answer=(rows:Row[]=[])=>({rows,rowCount:rows.length});
  if(sql.startsWith("BEGIN")){this.working=structuredClone(this.committed);return answer();}
  if(sql==="COMMIT"){if(this.failTag==="COMMIT"){if(this.commitApplied)this.committed=structuredClone(this.working);throw this.failure;}this.committed=this.working;return answer();}
  if(sql==="ROLLBACK"){if(this.rollbackFails)throw new Error("synthetic rollback failed");this.working=structuredClone(this.committed);return answer();}
  assert.ok(tag,`Unexpected SQL ${sql}`);if(tag===this.failTag)throw this.failure;
  if(tag==="cutoff"||tag==="source-lock")return answer();
  if(tag==="schema")return answer([{versions:this.schema}]);
  if(tag==="batch")return answer([{id:salesDetailId(1),source_name:"synthetic-sales-detail",source_hash:salesDetailHash,mapping_version:"V2_HISTORY_NULLABLE_1",status:this.closed?"IMPORTED":"STAGED",already_published:this.closed}]);
  if(tag==="lock-headers"||tag==="lock-skus")return answer(this.nativeMissing?[]:(v[0] as string[]).map(id=>({id})));
  if(tag==="new-bindings")return answer(this.bindingsValid?[{id:v[1]}]:[]);
  if(tag==="source-replay"){
   assert.equal(v.length,8);assert.match(sql,/sb.source_name=\$8/);
   const expected=JSON.parse(String(v[6]));return answer([...this.working.sources.values()].filter(s=>s.id===v[0]||(s.entity_type==="SALES_LINE"&&s.source_key===v[2])||(s.batch_id===v[1]&&s.source_file_sha256===v[3]&&s.sheet===v[4]&&s.row_no===v[5])).map(s=>({id:s.id,source_equal:isDeepStrictEqual(s,expected)})));
  }
  if(tag==="line-replay"){
   assert.equal(v.length,5);assert.match(sql,/to_jsonb\(jsonb_populate_record\(NULL::naijue_erp.history_sales_line,\$5::jsonb\)\)/);
   const expected=JSON.parse(String(v[4]));return answer([...this.working.lines.values()].filter(l=>l.id===v[0]||l.source_row_id===v[1]||(l.header_id===v[2]&&l.line_no===v[3])).map(l=>({id:l.id,line_equal:isDeepStrictEqual(l,expected)})));
  }
  if(tag==="insert-source"||tag==="insert-line"){
   if(this.zeroInsert)return {rows:[],rowCount:0};const row=JSON.parse(String(v[0]));(tag==="insert-source"?this.working.sources:this.working.lines).set(row.id,row);return answer([{id:row.id}]);
  }
  assert.fail(`Unexpected tag ${tag}`);
 }
}
const stage=(p:Pool,input=syntheticSalesDetailChunk())=>new PostgresHistorySalesDetailStagingStore(p).stage(prepareHistorySalesDetailChunk(input));
function twoRows():HistorySalesDetailChunk{
 const input=syntheticSalesDetailChunk(),next=structuredClone(input.rows[0]!);next.source.id=salesDetailId(11);next.source.sourceKey="SYNTHETIC-LINE-0002";next.source.rowNo="3";
 for(const [key,v]of [["来源编号",next.source.sourceKey],["原行号","8"]]){next.source.rawFields[key!]=v!;next.source.normalizedFields[key!]=v!;(next.source.fieldProvenance.fields as Record<string,{raw:string}>)[key!]!.raw=v!;}
 return {...input,rows:[input.rows[0]!,next]};
}
test("sales-detail pg protocol: actual source+typed INSERT/readback in one transaction, no native/stock/progress/publication writes",async()=>{
 const p=new Pool();assert.deepEqual(await stage(p),{inserted:1,replayed:0});assert.equal(p.committed.sources.size,1);assert.equal(p.committed.lines.size,1);
 assert.ok(p.calls[1]!.sql.includes("sales-detail:cutoff"));assert.ok(p.calls.findIndex(x=>x.sql.includes("lock-skus"))<p.calls.findIndex(x=>x.sql.includes("source-replay")));
 assert.ok(p.calls.findIndex(x=>x.sql.includes("new-bindings"))<p.calls.findIndex(x=>x.sql.includes("insert-source")));
 assert.equal(p.calls.filter(x=>x.sql.includes("source-replay")).length,2);assert.equal(p.calls.filter(x=>x.sql.includes("line-replay")).length,2);
 assert.ok(p.calls.filter(x=>/^\s*(INSERT|UPDATE|DELETE)/.test(x.sql.replace(/^\/\*.*?\*\/ /,""))).every(x=>/INSERT INTO naijue_erp\.(import_source_row|history_sales_line)/.test(x.sql)));
 assert.ok(!p.calls.some(x=>/\bUPDATE\s+naijue|\bDELETE\b|inventory_ledger|inventory_balance|IMPORT_PUBLISH|operation_receipt|audit_change/.test(x.sql)));
 assert.equal(p.calls.at(-1)?.sql,"COMMIT");
});
test("sales-detail pg protocol: complete exact replay survives dependency maintenance; does not reauthorize current values or overwrite",async()=>{
 const p=new Pool(),input=syntheticSalesDetailChunk();await stage(p,input);const before=structuredClone(p.committed);p.calls=[];p.bindingsValid=false;
 assert.deepEqual(await stage(p,input),{inserted:0,replayed:1});assert.deepEqual(p.committed,before);assert.ok(!p.calls.some(x=>x.sql.includes("new-bindings")||x.sql.includes("insert-")));
});
test("sales-detail pg protocol: original rows sharing one canonical SKU remain separate; entire chunk classified before writes",async()=>{
 const p=new Pool();assert.deepEqual(await stage(p,twoRows()),{inserted:2,replayed:0});assert.equal(p.committed.lines.size,2);
 const first=p.calls.findIndex(x=>x.sql.includes("insert-source"));assert.equal(p.calls.slice(0,first).filter(x=>x.sql.includes("line-replay")).length,2);
 assert.deepEqual([...p.committed.lines.values()].map(l=>l.quantity),["-2","-2"]);
});
test("sales-detail pg protocol: first-time invalid bindings and mixed replay/new stale parent are rejected without adopting",async()=>{
 const first=new Pool();first.bindingsValid=false;await assert.rejects(stage(first),{code:"HISTORY_SALES_DETAIL_NATIVE_BINDING"});assert.equal(first.committed.lines.size,0);
 const mixed=new Pool();await stage(mixed);mixed.calls=[];mixed.bindingsValid=false;await assert.rejects(stage(mixed,twoRows()),{code:"HISTORY_SALES_DETAIL_NATIVE_BINDING"});
 assert.equal(mixed.committed.lines.size,1);assert.ok(!mixed.calls.some(x=>x.sql.includes("insert-")));assert.equal(mixed.calls.at(-1)?.sql,"ROLLBACK");
});
test("sales-detail pg protocol: source-only, typed-only, changed proof or alternate target/key collision fail closed",async()=>{
 for(const mode of ["source-only","typed-only","changed","other-batch"]){const p=new Pool();await stage(p);const source=[...p.committed.sources.values()][0]!;
  if(mode==="source-only")p.committed.lines.clear();if(mode==="typed-only")p.committed.sources.clear();if(mode==="changed")source.raw_fields={corrupt:true};if(mode==="other-batch"){source.id=salesDetailId(99);source.batch_id=salesDetailId(98);}
  await assert.rejects(stage(p),{code:"HISTORY_SALES_DETAIL_REPLAY_CONFLICT"});
 }
});
test("sales-detail pg protocol: row failure rolls back whole bounded chunk; source insert cannot be mistaken for typed success",async()=>{
 for(const tag of ["insert-source","insert-line"]){const p=new Pool();p.failTag=tag;await assert.rejects(stage(p,twoRows()),e=>e===p.failure);assert.equal(p.committed.sources.size,0);assert.equal(p.committed.lines.size,0);assert.equal(p.calls.at(-1)?.sql,"ROLLBACK");}
 const p=new Pool();p.zeroInsert=true;await assert.rejects(stage(p),{code:"HISTORY_SALES_DETAIL_INSERT"});assert.equal(p.committed.lines.size,0);
});
test("sales-detail pg protocol: closed batch, unsupported schema, missing native identity and changed prepared DTO never write",async()=>{
 for(const kind of ["closed","schema","missing"]){const p=new Pool();if(kind==="closed")p.closed=true;if(kind==="schema")p.schema.push(999);if(kind==="missing")p.nativeMissing=true;
  await assert.rejects(stage(p));assert.ok(!p.calls.some(x=>x.sql.includes("insert-")));}
 const p=new Pool(),prepared=prepareHistorySalesDetailChunk(syntheticSalesDetailChunk());prepared.rows[0]!.line.quantity="99";
 await assert.rejects(new PostgresHistorySalesDetailStagingStore(p).stage(prepared),{code:"HISTORY_SALES_DETAIL_PREPARED_CHANGED"});assert.equal(p.connects,0);
});
test("sales-detail pg protocol: lost COMMIT ack preserves original uncertain error for both outcomes; discard, no rollback/retry",async()=>{
 for(const applied of [false,true])for(const rollbackFails of [false,true]){const p=new Pool();p.failTag="COMMIT";p.commitApplied=applied;p.rollbackFails=rollbackFails;
  await assert.rejects(stage(p),e=>e===p.failure);assert.equal(p.connects,1);assert.equal(p.releases[0],p.failure);assert.equal(p.calls.at(-1)?.sql,"COMMIT");
  assert.equal(p.calls.filter(x=>x.sql==="COMMIT").length,1);assert.ok(!p.calls.some(x=>x.sql==="ROLLBACK"));assert.equal(p.committed.lines.size,applied?1:0);}
});
