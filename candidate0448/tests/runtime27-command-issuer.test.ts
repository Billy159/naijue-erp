import test from 'node:test';import assert from 'node:assert/strict';
import { createRuntime27CommandIssuer } from '../adapters/postgres/src/runtime27-command-issuer.ts';
function statusful<T extends {query:(sql:string,...args:any[])=>Promise<any>}>(raw:T):T & {getTransactionStatus:()=>string}{let status='I';const original=raw.query.bind(raw);return Object.assign(raw,{async query(sql:string,...args:any[]){const result=await original(sql,...args);if(sql.startsWith('BEGIN'))status='T';if(sql==='ROLLBACK'||sql==='COMMIT')status='I';return result;},getTransactionStatus(){return status;}})}
test('runtime27 command issuer binds each request to an actual pool lease and checks target/role/transaction',async()=>{
 let released=false;const raw={async query(sql:string){if(sql.startsWith('SET search_path')||sql.startsWith('SET ROLE')||sql.startsWith('SET LOCAL ROLE'))return {rows:[],rowCount:0,command:'SET'};if(sql.startsWith('BEGIN'))return {rows:[],rowCount:0,command:'BEGIN'};assert.match(sql,/runtime27-command:identity/);return{rows:[{database:'synthetic_test',role:'erp_unified27_runtime_2393dbc6db9581c2',session_user:'runtime',server_port:5432,row_security:'on',search_path:'pg_catalog',replication_role:'origin',superuser:false,bypass:false,session_superuser:false,session_bypass:false,runtime_inherit:false,runtime_membership:false,can_create:false,version_ok:true,gate_ok:true,read_only:'off',isolation:'read committed',policies_ok:true}],rowCount:1,command:'SELECT'}},release(){released=true}};
 const issuer=createRuntime27CommandIssuer({async connect(){return statusful(raw);}},{database:'synthetic_test',user:'runtime',port:5432});const c=await issuer.pool.connect();await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');await issuer.runtime27.assertReady(c,'DOCUMENT_COMMAND');
 await assert.rejects(issuer.runtime27.assertReady({},'DOCUMENT_COMMAND'));c.release();assert.equal(released,true);await assert.rejects(issuer.runtime27.assertReady(c,'DOCUMENT_COMMAND'));
});
test('runtime27 issuer rejects wrong target and bypass role',async()=>{for(const bad of [{database:'other'},{superuser:true},{bypass:true},{runtime_inherit:true},{runtime_membership:true},{version_ok:false},{policies_ok:false}]){
 const raw={async query(sql:string){if(sql.startsWith('SET search_path')||sql.startsWith('SET ROLE')||sql.startsWith('SET LOCAL ROLE'))return {rows:[],rowCount:0,command:'SET'};return{rows:[{database:'synthetic_test',role:'erp_unified27_runtime_2393dbc6db9581c2',session_user:'runtime',server_port:5432,row_security:'on',search_path:'pg_catalog',replication_role:'origin',superuser:false,bypass:false,session_superuser:false,session_bypass:false,runtime_inherit:false,runtime_membership:false,can_create:false,version_ok:true,gate_ok:true,read_only:'off',isolation:'read committed',policies_ok:true,...bad}],rowCount:1,command:'SELECT'}},release(){}};
 const i=createRuntime27CommandIssuer({async connect(){return statusful(raw);}},{database:'synthetic_test',user:'runtime',port:5432});await assert.rejects(i.pool.connect());
}});

test('failed query permits only rollback cleanup and discards the lease',async()=>{
 const calls:string[]=[];let discarded:unknown;const raw={async query(sql:string){calls.push(sql);if(sql.startsWith('SET search_path')||sql.startsWith('SET ROLE'))return{rows:[],rowCount:0,command:'SET'};if(sql.includes('runtime27-command:identity'))return{rows:[{database:'synthetic_test',role:'erp_unified27_runtime_2393dbc6db9581c2',session_user:'runtime',server_port:5432,row_security:'on',search_path:'pg_catalog',replication_role:'origin',superuser:false,bypass:false,session_superuser:false,session_bypass:false,runtime_inherit:false,runtime_membership:false,can_create:false,version_ok:true,gate_ok:true,policies_ok:true}],rowCount:1,command:'SELECT'};if(sql==='BAD')throw Error('db');return {rows:[],rowCount:0,command:'ROLLBACK'};},release(e?:unknown){discarded=e;}};
 const i=createRuntime27CommandIssuer({async connect(){return statusful(raw);}},{database:'synthetic_test',user:'runtime',port:5432}),c=await i.pool.connect();await assert.rejects(c.query('BAD'));await assert.rejects(c.query('SELECT 1'));await c.query('ROLLBACK');c.release();assert.deepEqual(calls.slice(-2),['BAD','ROLLBACK']);assert.equal(discarded,true);
});
test('runtime27 ordinary reads require exact same leased target in repeatable-read readonly transaction',async()=>{
 let tx='off',isolation='read committed';const raw={async query(sql:string){if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'){tx='on';isolation='repeatable read';return {rows:[],rowCount:0,command:'BEGIN'}}if(sql.startsWith('SET search_path')||sql.startsWith('SET ROLE')||sql.startsWith('SET LOCAL ROLE'))return {rows:[],rowCount:0,command:'SET'};if(sql==='ROLLBACK')return {rows:[],rowCount:0,command:'ROLLBACK'};return {rows:[{database:'synthetic_test',role:'erp_unified27_runtime_2393dbc6db9581c2',session_user:'runtime',server_port:5432,row_security:'on',search_path:'pg_catalog',replication_role:'origin',superuser:false,bypass:false,session_superuser:false,session_bypass:false,runtime_inherit:false,runtime_membership:false,can_create:false,version_ok:true,gate_ok:true,read_only:tx,isolation,policies_ok:true}],rowCount:1,command:'SELECT'}},release(){}};
 const issuer=createRuntime27CommandIssuer({async connect(){return statusful(raw);}},{database:'synthetic_test',user:'runtime',port:5432}),client=await issuer.pool.connect();
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await issuer.ordinaryRead.assertReady(client,'ORDINARY_DOCUMENT_READ'); await assert.rejects(issuer.ordinaryRead.assertReady({},'ORDINARY_DOCUMENT_READ')); await client.query('ROLLBACK'); client.release();
});

test('explicit release(false) still destroys the role-switched lease',async()=>{
 let discarded:unknown; const raw={async query(sql:string){if(sql.startsWith('SET search_path')||sql.startsWith('SET ROLE'))return{rows:[],rowCount:0,command:'SET'};return{rows:[{database:'synthetic_test',role:'erp_unified27_runtime_2393dbc6db9581c2',session_user:'runtime',server_port:5432,row_security:'on',search_path:'pg_catalog',replication_role:'origin',superuser:false,bypass:false,session_superuser:false,session_bypass:false,runtime_inherit:false,runtime_membership:false,can_create:false,version_ok:true,gate_ok:true,policies_ok:true}],rowCount:1,command:'SELECT'}},release(e?:unknown){discarded=e}};
 const i=createRuntime27CommandIssuer({async connect(){return statusful(raw);}},{database:'synthetic_test',user:'runtime',port:5432});const c=await i.pool.connect();c.release(false);assert.equal(discarded,true);
});

test('runtime27 command authority is unavailable before BEGIN or after transaction ends',async()=>{
 const raw={async query(sql:string){if(sql.startsWith('SET search_path')||sql.startsWith('SET ROLE')||sql.startsWith('SET LOCAL ROLE'))return{rows:[],rowCount:0,command:'SET'};if(sql.startsWith('BEGIN'))return{rows:[],rowCount:0,command:'BEGIN'};if(sql==='ROLLBACK')return{rows:[],rowCount:0,command:'ROLLBACK'};return{rows:[{database:'synthetic_test',role:'erp_unified27_runtime_2393dbc6db9581c2',session_user:'runtime',server_port:5432,row_security:'on',search_path:'pg_catalog',replication_role:'origin',superuser:false,bypass:false,session_superuser:false,session_bypass:false,runtime_inherit:false,runtime_membership:false,can_create:false,version_ok:true,gate_ok:true,policies_ok:true,read_only:'off',isolation:'read committed'}],rowCount:1,command:'SELECT'}},release(){}};
 const i=createRuntime27CommandIssuer({async connect(){return statusful(raw);}},{database:'synthetic_test',user:'runtime',port:5432}),c=await i.pool.connect();
 await assert.rejects(i.runtime27.assertReady(c,'DOCUMENT_COMMAND'));await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');await i.runtime27.assertReady(c,'DOCUMENT_COMMAND');await c.query('ROLLBACK');await assert.rejects(i.runtime27.assertReady(c,'DOCUMENT_COMMAND'));c.release();
});

test('whole profile pins hardened function path without widening the legacy profile',async()=>{
 const queries:string[]=[];const raw={async query(sql:string){queries.push(sql);if(sql.startsWith('SET'))return{rows:[],rowCount:0,command:'SET'};return{rows:[{database:'synthetic_test',role:'erp_unified27_runtime_2393dbc6db9581c2',session_user:'runtime',server_port:5432,row_security:'on',search_path:'pg_catalog',replication_role:'origin',superuser:false,bypass:false,session_superuser:false,session_bypass:false,runtime_inherit:false,runtime_membership:false,can_create:false,version_ok:true,gate_ok:true,policies_ok:true}],rowCount:1,command:'SELECT'}},release(){}};
 for(const profile of ['STANDARD_V1','WHOLE_V2'] as const){queries.length=0;const i=createRuntime27CommandIssuer({async connect(){return statusful(raw);}},{database:'synthetic_test',user:'runtime',port:5432},profile),c=await i.pool.connect();const sql=queries.find(q=>q.includes('runtime27-command:identity'));assert.ok(sql);assert.ok(sql.includes(profile==='WHOLE_V2'?"ARRAY['search_path=pg_catalog, naijue_erp, pg_temp']":"ARRAY['search_path=pg_catalog, naijue_erp']"));if(profile==='STANDARD_V1')assert.ok(!sql.includes("ARRAY['search_path=pg_catalog, naijue_erp, pg_temp']"));c.release();}
});

import { createRuntime27MaintenanceCapabilities } from '../adapters/postgres/src/runtime27-command-issuer.ts';
import { PostgresMaintenanceCommandUnitOfWork } from '../adapters/postgres/src/maintenance-command-unit-of-work.ts';
import type { MaintenancePgContext } from '../adapters/postgres/src/maintenance-command-unit-of-work.ts';
function nativeMaintenanceFixture(observation: Record<string, unknown> = {guards:true,triggers:true,columns:true}) {
 const calls:string[]=[];let connects=0,discarded=0;
 const pool={async connect(){connects++;
  return statusful({async query(sql:string){calls.push(sql);
   if(sql.startsWith('SET'))return {rows:[],rowCount:0,command:'SET'};
   if(sql.startsWith('BEGIN'))return {rows:[],rowCount:0,command:'BEGIN'};
   if(sql==='ROLLBACK'||sql==='COMMIT')return {rows:[],rowCount:0,command:sql};
   if(sql.includes('ordinary27-maintenance:retained-guards'))return {rows:[observation],rowCount:1,command:'SELECT'};
   assert.match(sql,/runtime27-command:identity/);
   return {rows:[{database:'synthetic_test',role:'erp_unified27_runtime_2393dbc6db9581c2',session_user:'runtime',server_port:5432,row_security:'on',search_path:'pg_catalog',replication_role:'origin',superuser:false,bypass:false,session_superuser:false,session_bypass:false,runtime_inherit:false,runtime_membership:false,can_create:false,version_ok:true,gate_ok:true,policies_ok:true,read_only:'off',isolation:'read committed'}],rowCount:1,command:'SELECT'};
  },release(discard?:unknown){assert.equal(discard,true);discarded++;}});
 }};
 const issuer=createRuntime27CommandIssuer(pool,{database:'synthetic_test',user:'runtime',port:5432},'WHOLE_V2');
 return {issuer,calls,counts:()=>({connects,discarded}),driver:new PostgresMaintenanceCommandUnitOfWork(issuer.pool),
  proof:createRuntime27MaintenanceCapabilities(issuer.pool,issuer.runtime27)};
}
test('fresh35 retained maintenance capabilities use original ordinary lease and reject borrowed or expired contexts',async()=>{
 const f=nativeMaintenanceFixture(),other=nativeMaintenanceFixture();
 assert.throws(()=>createRuntime27MaintenanceCapabilities(other.issuer.pool,f.issuer.runtime27));
 assert.throws(()=>f.proof.productMediaWrite.assertVerified(other.driver));
 f.proof.productMediaWrite.assertVerified(f.driver);
 let retained:MaintenancePgContext|undefined;
 await f.driver.transaction(async context=>{retained=context;
  await f.proof.productMediaWrite.assertReady(context);
  await f.proof.categoryOrderWrite.assertReady(context);
  await assert.rejects(f.proof.productMediaWrite.assertReady({client:context.client,evidence:context.evidence}));
  await assert.rejects(f.proof.productMediaWrite.assertPrepared(context,{} as never));
 });
 await assert.rejects(f.proof.productMediaWrite.assertReady(retained!));
 assert.deepEqual(f.counts(),{connects:1,discarded:1});
 assert.equal(f.calls.filter(s=>s.includes('ordinary27-maintenance:retained-guards')).length,2);
 assert.equal(f.calls.filter(s=>s==='COMMIT').length,1);
 assert.ok(f.calls.every(s=>!s.includes('import_source_row')&&!s.includes('history_sales')));
});
for(const bad of [{guards:false,triggers:true,columns:true},{guards:true,triggers:false,columns:true},{guards:true,triggers:true,columns:false},{guards:true,triggers:true}])
 test(`fresh35 maintenance rejects wrong guard/trigger or missing native permissions ${JSON.stringify(bad)}`,async()=>{
  const f=nativeMaintenanceFixture(bad);
  await assert.rejects(f.driver.transaction(context=>f.proof.productMediaWrite.assertReady(context)));
  assert.ok(f.calls.includes('ROLLBACK'));assert.ok(!f.calls.includes('COMMIT'));
  assert.deepEqual(f.counts(),{connects:1,discarded:1});
 });
