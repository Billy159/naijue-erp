import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { STANDARD_MASTER_TABLES } from '../packages/application/src/unified-import-execution.ts';
import { compareWholePackageSource, reconcileWholePackage } from '../tools/unified-import/whole-package-reconcile.mjs';
const secret='naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128);
const init={plan_sha256:'a'.repeat(64),batch_id:'00000000-0000-4000-8000-000000000001',payload:{document_batch_id:'00000000-0000-4000-8000-000000000002'}};
const counts=Object.fromEntries([...STANDARD_MASTER_TABLES,'sales_header','sales_line','sales_settlement','transfer_header','transfer_line','inventory_baseline'].map(t=>[t,0]));
counts.sales_header=1;counts.inventory_baseline=1;
const totals={sales_quantity:'0',sales_line_amount_cents:'0',sales_net_due_cents:'0',settlement_amount_cents:'0',transfer_quantity:'0',inventory_quantity:'0'};
function response(){return {verified:true,verification_profile:'STANDARD_WHOLE_PACKAGE_VERIFY_V2',protocol:'STANDARD_IMPORT_SQL_V1',plan_sha256:init.plan_sha256,baseline_batch_id:init.batch_id,batch_id:init.payload.document_batch_id,scope:'CURRENT_NATIVE_AND_IMMUTABLE_IMPORT_PROOF_FENCED',unknown_keys_materialized:false,
source_counts:{...Object.fromEntries(Object.entries(counts).filter(([k])=>k!=='inventory_baseline').map(([k,v])=>[k.toUpperCase(),v])),INVENTORY_KEY:1,IMPORT_BATCH:3},
source_totals:{inventory_quantity:'0',sales_quantity:'0',sales_line_amount:'0.00',sales_net_due:'0.00',sales_settlement_amount:'0.00',transfer_quantity:'0'},
current_totals:{inventory_quantity:'2',sales_quantity:'3',sales_line_amount:'123.45',sales_net_due:'120.00',sales_settlement_amount:'10.00',transfer_quantity:'0'},
document_summary:{verified_count:1,changed_after_import_count:1},inventory_summary:{verified_key_count:1},inventory_coverage:{scope:'EXPLICIT_SOURCE_KEYS_PLUS_VERIFIED_POST_CUTOFF_EFFECT_KEYS',explicit_source_keys:1,explicit_zero_keys:1,post_cutoff_effect_keys:0,unknown_combinations_not_enumerated:true,complete_total_inventory:false}}}
function client(value=response(),fail=''){const calls=[];let discarded=0;return {calls,get discarded(){return discarded},async query(sql){calls.push(sql);if(sql.startsWith('BEGIN'))return{command:fail==='begin'?'?':'BEGIN'};if(sql.startsWith('SET'))return{command:fail==='role'?'?':'SET'};if(sql.startsWith('SELECT'))return{command:'SELECT',rows:[{result_json:typeof value==='string'?value:JSON.stringify(value)}]};if(sql==='ROLLBACK'){if(fail==='rollback-throw')throw Error('private');return{command:fail==='rollback'?'?':'ROLLBACK'}}throw Error('unexpected SQL')},async discard(){discarded++}}}
test('independent verification compares source, permits audited current differences and rolls back',async()=>{const c=client();const r=await reconcileWholePackage(c,init,secret,counts,totals);assert.equal(r.state,'VERIFIED');assert.equal(r.source_truth_verified,false);assert.equal(r.summary.current_totals.inventory_quantity,'2');assert.equal(c.calls.at(-1),'ROLLBACK');assert.equal(c.calls.length,4);assert.equal(c.calls.some(s=>s==='COMMIT'||/prepare_v2|step_v2|finish_v2/.test(s)),false)});
for(const [name,change]of [
 ['wrong batch',v=>v.batch_id='wrong'],['wrong plan',v=>v.plan_sha256='b'.repeat(64)],['wrong count',v=>v.source_counts.SALES_HEADER++],['extra count',v=>v.source_counts.EXTRA=0],['missing count',v=>delete v.source_counts.FIT],['total mismatch',v=>v.source_totals.sales_net_due='0.01'],['precision',v=>v.source_totals.sales_line_amount='0.001'],['number total',v=>v.source_totals.sales_line_amount=0],['exponent',v=>v.source_totals.sales_line_amount='0e1'],['missing total',v=>delete v.source_totals.sales_net_due],['unknown becomes zero',v=>v.unknown_keys_materialized=true],['coverage',v=>v.inventory_coverage.complete_total_inventory=true],['missing zero key',v=>v.inventory_summary.verified_key_count=0],['bad documents',v=>v.document_summary.changed_after_import_count=2]
])test(name+' fails closed with rollback',async()=>{const v=response();change(v);const c=client(v);const r=await reconcileWholePackage(c,init,secret,counts,totals);assert.equal(r.state,'VERIFICATION_FAILED');assert.equal(c.calls.at(-1),'ROLLBACK');assert.equal(c.discarded,0)});
for(const mode of ['begin','rollback','rollback-throw'])test(mode+' uncertainty discards without retry',async()=>{const c=client(response(),mode),r=await reconcileWholePackage(c,init,secret,counts,totals);assert.equal(r.state,'VERIFICATION_UNKNOWN');assert.equal(c.discarded,1);assert.ok(c.calls.filter(s=>s==='ROLLBACK').length<=1)});
test('invalid credentials rejected before SQL',async()=>{const c=client();await assert.rejects(reconcileWholePackage(c,init,'bad',counts,totals),/PRIVATE_CREDENTIAL/);assert.deepEqual(c.calls,[])});
test('large precise totals and negative values never use floating point',()=>{const v=response(),t={...totals,sales_line_amount_cents:'-900719925474099312345'};v.source_totals.sales_line_amount='-9007199254740993123.4500';compareWholePackageSource(v,init,counts,t);v.source_totals.sales_line_amount='-9007199254740993123.46';assert.throws(()=>compareWholePackageSource(v,init,counts,t),/TOTAL_MISMATCH/)});
test('standalone CLI help and setup rejection never claim verification',()=>{for(const [args,exit]of [[['--help'],0],[[],1]]){const r=spawnSync(process.execPath,['tools/unified-import/cli.mjs','stream-verify',...args],{encoding:'utf8'});assert.equal(r.status,exit);const out=JSON.parse(r.stdout);if(exit)assert.equal(out.state,'NOT_STARTED');else{assert.match(out.usage,/stream-verify/);assert.equal(out.postgresql_acceptance,'NOT_RUN');assert.doesNotMatch(out.usage,/inspect-only/)}}});

test('safe mismatch diagnostics expose category and known field, not source values',async()=>{
 const v=response();v.source_counts.SALES_HEADER=987654321;
 const r=await reconcileWholePackage(client(v),init,secret,counts,totals);
 assert.equal(r.code,'VERIFY_SOURCE_COUNT_MISMATCH');assert.equal(r.field,'SALES_HEADER');assert.equal(JSON.stringify(r).includes('987654321'),false);
 const v2=response();v2.source_totals.sales_net_due='123456.78';
 const r2=await reconcileWholePackage(client(v2),init,secret,counts,totals);
 assert.equal(r2.code,'VERIFY_SOURCE_TOTAL_MISMATCH');assert.equal(r2.field,'sales_net_due');assert.equal(JSON.stringify(r2).includes('123456'),false);
});
test('database errors never echo SQL, credentials, or arbitrary fields',async()=>{
 const c=client();const query=c.query.bind(c);c.query=async(sql)=>{if(sql.startsWith('SELECT'))throw Object.assign(Error('private-source-secret'),{field:'private-field'});return query(sql)};
 const r=await reconcileWholePackage(c,init,secret,counts,totals);
 assert.equal(r.state,'VERIFICATION_FAILED');assert.equal(r.code,'VERIFY_DATABASE_OR_PROTOCOL_FAILED');assert.equal(r.field,undefined);assert.equal(JSON.stringify(r).includes('private'),false);assert.equal(c.calls.at(-1),'ROLLBACK');
});

test('inventory verification rejects unsafe aggregate counts even when exactly representable',async()=>{
 const v=response();
 v.inventory_coverage.post_cutoff_effect_keys=Number.MAX_SAFE_INTEGER;
 v.inventory_summary.verified_key_count=Number.MAX_SAFE_INTEGER+1;
 const c=client(v),r=await reconcileWholePackage(c,init,secret,counts,totals);
 assert.equal(r.state,'VERIFICATION_FAILED');
 assert.equal(r.code,'VERIFY_COVERAGE_INVALID');
 assert.equal(c.calls.at(-1),'ROLLBACK');
});
test('inventory verification accepts the largest exact aggregate count',()=>{
 const v=response();
 v.inventory_coverage.post_cutoff_effect_keys=Number.MAX_SAFE_INTEGER-1;
 v.inventory_summary.verified_key_count=Number.MAX_SAFE_INTEGER;
 assert.equal(compareWholePackageSource(v,init,counts,totals).inventory_summary.verified_key_count,Number.MAX_SAFE_INTEGER);
});
for(const bad of [null,'1',-1,0.5,Number.MAX_SAFE_INTEGER+1])test(`invalid verified inventory count ${JSON.stringify(bad)} fails closed`,async()=>{
 const v=response();v.inventory_summary.verified_key_count=bad;
 const r=await reconcileWholePackage(client(v),init,secret,counts,totals);
 assert.equal(r.state,'VERIFICATION_FAILED');assert.equal(r.code,'VERIFY_COVERAGE_INVALID');
});
test('each source financial, settlement and stock total independently detects a mismatch',()=>{
 for(const field of Object.keys(response().source_totals)){
  const v=response();v.source_totals[field]='1';
  assert.throws(()=>compareWholePackageSource(v,init,counts,totals),e=>e.message==='VERIFY_SOURCE_TOTAL_MISMATCH'&&e.field===field);
 }
});
test('caller mutations during BEGIN cannot replace independently bound source facts',async()=>{
 const request=structuredClone(init),sourceCounts={...counts},sourceTotals={...totals};
 const c=client();const query=c.query.bind(c);
 c.query=async(sql)=>{
  if(sql.startsWith('BEGIN')){
   request.plan_sha256='b'.repeat(64);request.payload.document_batch_id='changed';
   sourceCounts.sales_header=99;sourceTotals.settlement_amount_cents='123';
  }
  return query(sql);
 };
 const r=await reconcileWholePackage(c,request,secret,sourceCounts,sourceTotals);
 assert.equal(r.state,'VERIFIED');assert.equal(c.calls.at(-1),'ROLLBACK');
});
test('inventory verification rejects genuinely rounded aggregate equality',async()=>{
 const v=response(),sourceCounts={...counts,inventory_baseline:2};
 v.source_counts.INVENTORY_KEY=2;
 v.inventory_coverage.explicit_source_keys=2;
 v.inventory_coverage.post_cutoff_effect_keys=Number.MAX_SAFE_INTEGER;
 v.inventory_summary.verified_key_count=Number.MAX_SAFE_INTEGER+2;
 // The true integer sum ends in 993, while Number addition rounds it to 992.
 assert.notEqual(BigInt(v.inventory_summary.verified_key_count),BigInt(Number.MAX_SAFE_INTEGER)+2n);
 const c=client(v),r=await reconcileWholePackage(c,init,secret,sourceCounts,totals);
 assert.equal(r.state,'VERIFICATION_FAILED');assert.equal(r.code,'VERIFY_COVERAGE_INVALID');
 assert.equal(c.calls.at(-1),'ROLLBACK');
});
