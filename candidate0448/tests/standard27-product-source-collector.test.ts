import test from 'node:test'; import assert from 'node:assert/strict';
import { collectStandard27ProductFacts } from '../adapters/postgres/src/standard27-product-source-collector.ts';
const id='00000000-0000-4000-8000-000000000001';
const context={transaction_isolation:'read committed',database_name:'synthetic',current_role:'runtime',session_user:'controller'};
test('collector uses one exact guarded client, bounded locks and labels unverified facts',async()=>{
 const calls:{sql:string;values:unknown[]}[]=[], client={async query(sql:string,values:unknown[]=[]){calls.push({sql,values});return {rows:sql.includes('std27-product:context')?[context]:sql.includes('std27-product:root')?[{id}]:[]}}}; let proofs=0;
 const result=await collectStandard27ProductFacts(client,id,async c=>{assert.equal(c,client);proofs++});
 assert.equal(result.verification,'UNVERIFIED_CANDIDATE_ONLY');assert.equal(proofs,20);assert.equal(calls.length,10);
 assert.ok(calls.every(c=>c.values[0]===id));assert.ok(calls.every(c=>!c.sql.includes('import_source_row')));assert.ok(calls.every(c=>!/\b(INSERT|UPDATE|DELETE|GRANT|COMMIT)\b/i.test(c.sql)));
 assert.ok(calls.some(c=>c.sql.includes('LIMIT $2 FOR SHARE')));assert.ok(calls.some(c=>c.sql.includes('operation_receipt')&&c.sql.includes('audit_change')));
});
test('missing root, overflow and failed same-client guard stop collection',async()=>{
 await assert.rejects(collectStandard27ProductFacts({async query(){return {rows:[]}}},id,async()=>{}));let calls=0;
 await assert.rejects(collectStandard27ProductFacts({async query(sql){calls++;return {rows:sql.includes('std27-product:context')?[context]:sql.includes('std27-product:root')?[{id}]:[]}}},id,async()=>{throw Error('no proof')}));assert.equal(calls,0);
 const client={async query(sql:string){return {rows:sql.includes('std27-product:context')?[context]:sql.includes('std27-product:root')?[{id}]:sql.includes('std27-product:skus')?Array.from({length:5001},()=>({id})):[]}}};
 await assert.rejects(collectStandard27ProductFacts(client,id,async()=>{}));
});
test('oversized audit chain metadata stops before collecting further source facts',async()=>{
 let sourceRead=false; const client={async query(sql:string){if(sql.includes('std27-product:source'))sourceRead=true;return {rows:sql.includes('std27-product:context')?[context]:sql.includes('std27-product:root')?[{id}]:sql.includes('std27-product:maintenance')?[{audit_bytes:'16777217'}]:[]}}};
 await assert.rejects(collectStandard27ProductFacts(client,id,async()=>{}));assert.equal(sourceRead,false);
});
test('guard that returns a value cannot act as a successful proof',async()=>{
 let reads=0;const client={async query(){reads++;return {rows:[]}}};
 await assert.rejects(collectStandard27ProductFacts(client,id,async()=>false as unknown as void));assert.equal(reads,0);
});
test('orphan receipt or orphan audit cannot disappear behind a join',async()=>{
 for(const mode of ['orphan-receipt','orphan-audit']) {
  const client={async query(sql:string){return {rows:sql.includes('std27-product:context')?[context]:sql.includes('std27-product:root')?[{id}]:sql.includes('std27-product:maintenance')&&mode==='orphan-audit'?[{operation_id:'a',receipt_id:null,audit_bytes:'1'}]:sql.includes('std27-product:receipts')&&mode==='orphan-receipt'?[{id:'r'}]:[]}}};
  await assert.rejects(collectStandard27ProductFacts(client,id,async()=>{}));
 }
});
test('transaction snapshot metadata is collected on same client and cannot be replaced by a label',async()=>{
 const seen:string[]=[],client={async query(sql:string){seen.push(sql);return {rows:sql.includes('std27-product:context')?[{transaction_isolation:'read committed',database_name:'synthetic',current_role:'runtime',session_user:'controller'}]:sql.includes('std27-product:context')?[context]:sql.includes('std27-product:root')?[{id}]:[]}}};
 const result=await collectStandard27ProductFacts(client,id,async()=>{});assert.equal(result.context.transaction_isolation,'read committed');assert.equal(seen.filter(s=>s.includes('std27-product:context')).length,1);assert.equal(result.verification,'UNVERIFIED_CANDIDATE_ONLY');
});
test('context metadata is never coerced through caller-controlled objects',async()=>{
 let invoked=false;const weird={toString(){invoked=true;throw Error('getter')}};const client={async query(sql:string){return {rows:sql.includes('std27-product:context')?[{...context,transaction_isolation:weird}]:[]}}};
 await assert.rejects(collectStandard27ProductFacts(client,id,async()=>{}));assert.equal(invoked,false);
});
test('new product absence observation is scoped and cannot become a creation capability',async()=>{
 const {observeStandard27ProductAbsence}=await import('../adapters/postgres/src/standard27-product-source-collector.ts');
 let q=''; const result=await observeStandard27ProductAbsence({async query(sql){q=sql;return {rows:[{product_exists:false,source_exists:false,audit_exists:false,receipt_exists:false}]}}},id,async()=>{});
 assert.equal(result.verification,'UNVERIFIED_CANDIDATE_ONLY');assert.equal(result.absent,true);assert.match(q,/naijue_erp\.import_record/);assert.doesNotMatch(q,/import_source_row/);
 const blocked=await observeStandard27ProductAbsence({async query(){return {rows:[{product_exists:false,source_exists:true,audit_exists:false,receipt_exists:false}]}}},id,async()=>{});assert.equal(blocked.absent,false);
});
test('published V1 terminal observation must be metadata-only and is never a capability',async()=>{
 const client={async query(sql:string){return {rows:sql.includes('std27-product:context')?[context]:sql.includes('std27-product:root')?[{id}]:sql.includes('std27-product:source */')?[{id:'s',import_batch_id:'b',source_audit_bytes:'100'}]:sql.includes('source-binding-v1')?[{record_id:'s',batch_id:'b'}]:sql.includes('std27-product:publication-v1')?[{baseline_id:'b',document_id:'d',publication_id:'r'}]:[]}}};
 const result=await collectStandard27ProductFacts(client,id,async()=>{});assert.equal(result.publicationV1.length,1);assert.equal(result.verification,'UNVERIFIED_CANDIDATE_ONLY');
});
test('V1 source-binding observation is distinct from publication and never enables a write',async()=>{
 const seen:string[]=[],client={async query(sql:string){seen.push(sql);return {rows:sql.includes('std27-product:context')?[context]:sql.includes('std27-product:root')?[{id}]:sql.includes('std27-product:source */')?[{id:'r1',import_batch_id:'b',source_audit_bytes:'100'}]:sql.includes('std27-product:source-binding-v1')?[{record_id:'r1',batch_id:'b',operation_id:'o1'}]:[]}}};
 const result=await collectStandard27ProductFacts(client,id,async()=>{});assert.equal(result.sourceBindingV1.length,1);assert.equal(result.verification,'UNVERIFIED_CANDIDATE_ONLY');assert.ok(seen.some(s=>s.includes('source-binding-v1')));
});
test('V1 source expansion has its own server-side size guard for read-committed races',async()=>{
 let sourceSql='';const client={async query(sql:string){if(sql.includes('source-binding-v1'))sourceSql=sql;return {rows:sql.includes('std27-product:context')?[context]:sql.includes('std27-product:root')?[{id}]:[]}}};
 await collectStandard27ProductFacts(client,id,async()=>{});assert.match(sourceSql,/CASE WHEN octet_length\(a\.after_values::text\)<=16777216/);assert.match(sourceSql,/jsonb_typeof\(a\.after_values->'records'\)='array'/);
});
test('a conflicting or duplicate V1 source item cannot be hidden by filtering matching fields',async()=>{
 let sourceSql='';const client={async query(sql:string){if(sql.includes('source-binding-v1'))sourceSql=sql;return {rows:sql.includes('std27-product:context')?[context]:sql.includes('std27-product:root')?[{id}]:sql.includes('std27-product:source */')?[{id:'source',source_audit_bytes:'100'}]:[]}}};
 await assert.rejects(collectStandard27ProductFacts(client,id,async()=>{}));assert.match(sourceSql,/count\(\*\) OVER/);assert.match(sourceSql,/id_count=1/);
});
test('separate read-committed source observations must not silently disagree on record identity',async()=>{
 const client={async query(sql:string){return {rows:sql.includes('std27-product:context')?[context]:sql.includes('std27-product:root')?[{id}]:sql.includes('std27-product:source */')?[{id:'source-a',import_batch_id:'batch-a',source_audit_bytes:'100'}]:sql.includes('source-binding-v1')?[{record_id:'source-b',batch_id:'batch-a'}]:[]}}};
 await assert.rejects(collectStandard27ProductFacts(client,id,async()=>{}));
});
