import test from 'node:test';
import assert from 'node:assert/strict';
import { collectStandard27ProductAuditBodies } from '../adapters/postgres/src/standard27-product-audit-body-collector.ts';
const id = '00000000-0000-4000-8000-000000000001';
const fixture = () => ({id:'audit', operation_id:'operation', object_type:'PRODUCT', object_id:id, action:'EDIT', old_version:1, new_version:2,
 actor_account_id:'actor', occurred_at:'2026-11-03T00:00:00.000000Z', receipt_id:'operation', receipt_status:'COMMITTED', target_type:'PRODUCT', target_id:id,
 receipt_action:'EDIT', receipt_actor:'actor', request_hash:'a'.repeat(64), completed_at:'2026-11-03T00:00:00.000000Z', total_rows:'1', total_bytes:'2', before_values:null, after_values:'{}'});
const collect = (rows: unknown) => collectStandard27ProductAuditBodies({async query(){return {rows} as never;}},id,async()=>{});
test('audit observation owns frozen detached scalars and never acquires write authority',async()=>{
 const row=fixture(), rows=[row]; const result=await collect(rows);
 row.after_values='tampered'; rows.length=0;
 assert.equal(result.rows[0]!.after_values,'{}');assert.equal(result.rows.length,1);
 assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.rows)&&Object.isFrozen(result.rows[0]));
 assert.equal(result.verification,'UNVERIFIED_CANDIDATE_ONLY');assert.equal('assertReady' in result,false);
});
test('driver reuse during the post-query guard cannot alter the captured observation',async()=>{
 const row=fixture();let guards=0;
 const result=await collectStandard27ProductAuditBodies({async query(){return {rows:[row]};}},id,async()=>{if(++guards===2)row.receipt_actor='changed';});
 assert.equal(result.rows[0]!.receipt_actor,'actor');
});
test('row, array and envelope accessors are rejected without invoking getters',async()=>{
 let invoked=0;
 const row={...fixture(),get after_values(){invoked++;return '{}';}};
 await assert.rejects(collect([row]));
 const rows:unknown[]=[];Object.defineProperty(rows,'0',{enumerable:true,get(){invoked++;return fixture();}});
 await assert.rejects(collect(rows));
 await assert.rejects(collectStandard27ProductAuditBodies({async query(){return {get rows(){invoked++;return [fixture()];}};}},id,async()=>{}));
 assert.equal(invoked,0);
});
test('proxy evidence is rejected before reflection traps run',async()=>{
 let traps=0;const handler={getPrototypeOf(){traps++;throw Error('trap');},ownKeys(){traps++;throw Error('trap');}};
 await assert.rejects(collect([new Proxy(fixture(),handler)]));
 await assert.rejects(collect(new Proxy([fixture()],handler)));
 assert.equal(traps,0);
});
test('duplicate audit or operation provenance cannot form a chain',async()=>{
 for(const mode of ['audit','operation']) {
  const a={...fixture(),total_rows:'2',total_bytes:'4'};
  const b={...a,id:mode==='audit'?a.id:'audit2',operation_id:mode==='operation'?a.operation_id:'operation2',receipt_id:mode==='operation'?a.operation_id:'operation2'};
  await assert.rejects(collect([a,b]));
 }
});
test('distinct provenance entries retain exact aggregate bytes',async()=>{
 const a={...fixture(),total_rows:'2',total_bytes:'4'};
 const b={...a,id:'audit2',operation_id:'operation2',receipt_id:'operation2'};
 assert.equal((await collect([a,b])).rows.length,2);
});
test('reported aggregate cannot conceal short, oversized or multibyte bodies',async()=>{
 for(const total_bytes of ['1','3','999'])await assert.rejects(collect([{...fixture(),total_bytes}]));
 const after_values='{"label":"红"}';
 await assert.rejects(collect([{...fixture(),after_values,total_bytes:String(after_values.length)}]));
 const result=await collect([{...fixture(),after_values,total_bytes:String(Buffer.byteLength(after_values))}]);
 assert.equal(result.rows[0]!.after_values,after_values);
});
test('sparse arrays, extra array properties and non-scalar row values fail closed',async()=>{
 await assert.rejects(collect(Array(1)));
 await assert.rejects(collect(Object.assign([fixture()],{extra:true})));
 await assert.rejects(collect([{...fixture(),after_values:{toString(){throw Error('coercion');}}}]));
});
test('exact 16MiB audit body is retained and one byte over is rejected',async()=>{
 const limit=16*1024*1024;
 const after_values='"'+'a'.repeat(limit-2)+'"';
 const result=await collect([{...fixture(),after_values,total_bytes:String(limit)}]);
 assert.equal(Buffer.byteLength(result.rows[0]!.after_values as string),limit);
 await assert.rejects(collect([{...fixture(),after_values:after_values+' ',total_bytes:String(limit+1)}]));
 // A forged in-bound aggregate cannot conceal the additional byte either.
 await assert.rejects(collect([{...fixture(),after_values:after_values+' ',total_bytes:String(limit)}]));
});
test('non-null before and after bodies both contribute their exact UTF-8 bytes',async()=>{
 const before_values='{"label":"红"}',after_values='{"label":"蓝色"}';
 const total_bytes=String(Buffer.byteLength(before_values)+Buffer.byteLength(after_values));
 const result=await collect([{...fixture(),before_values,after_values,total_bytes}]);
 assert.equal(result.rows[0]!.before_values,before_values);
 assert.equal(result.rows[0]!.after_values,after_values);
 for(const wrong of [String(before_values.length+after_values.length),String(Buffer.byteLength(after_values))]) {
  await assert.rejects(collect([{...fixture(),before_values,after_values,total_bytes:wrong}]));
 }
});
