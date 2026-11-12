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


// Explicit private dependency model for the actual issuer body; its cap is NOT
// accepted by the real D1 module and cannot authorize an app or a database.
async function productionIssuerModel(restored = false){
 const {readFile}=await import('node:fs/promises');const ts=await import('typescript');
 const url=new URL('../adapters/postgres/src/runtime27-command-issuer.ts',import.meta.url);
 const proofUrl='data:text/javascript,'+encodeURIComponent(`
 export const cap={profile:'MODEL_ONLY_NOT_REAL_CAP'};export const events=[];let active=true,now=0;
 const restored=${restored},expiresAt=1;
 export const expire=()=>{now=expiresAt;};
 function assertWindow(){if(restored&&now>=expiresAt){active=false;throw Error('model expired');}}
 export const revoke=()=>{active=false;};export let expectedPool;
 export const bind=p=>{expectedPool=p;};
 export function describeFresh35OrdinaryAdmissionV2(c){if(c!==cap)throw Error('model cap');assertWindow();return {database:'synthetic_test',user:'runtime',connectPort:15432,serverPort:5432,...(restored?{purpose:'RESTORED_FROM_VERIFIED_INSTALLATION',expiresAt}:{})};}
 export async function assertFresh35OrdinaryLeaseV2(c,p,raw){events.push('lease-before-role');assertWindow();if(c!==cap||p!==expectedPool||raw.getTransactionStatus()!=='I'||!active)throw Error('model lease denied');}
 export async function assertFresh35OrdinaryAdmissionCurrentV2(c,p){events.push('current');assertWindow();if(c!==cap||p!==expectedPool||!active)throw Error('model revoked');}
 `)+'#'+Math.random();
 const source=ts.transpileModule(await readFile(url,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext}}).outputText
  .replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_m,q,spec)=>'from '+JSON.stringify(spec.endsWith('fresh35-host-session.mjs')?proofUrl:new URL(spec,url).href));
 const module=await import('data:text/javascript,'+encodeURIComponent(source));const proof=await import(proofUrl);
 const calls:string[]=[];let discarded=false, connects=0;
 let pending:{started:()=>void;resume:Promise<void>}|undefined;
 const raw=statusful({async query(sql:string){calls.push(sql);if(sql.startsWith('SET'))return {rows:[],rowCount:0,command:'SET'};
  if(sql.startsWith('BEGIN')||sql==='ROLLBACK'||sql==='COMMIT')return {rows:[],rowCount:0,command:sql.split(' ')[0]};
  if(sql==='SELECT representative_inventory'){
   const query=pending;
   if(query){query.started();await query.resume;}
   return {rows:[{quantity:12}],rowCount:1,command:'SELECT'};
  }
  return {rows:[{database:'synthetic_test',role:'erp_unified27_runtime_2393dbc6db9581c2',session_user:'runtime',server_port:5432,row_security:'on',search_path:'pg_catalog',replication_role:'origin',superuser:false,bypass:false,session_superuser:false,session_bypass:false,runtime_inherit:false,runtime_membership:false,can_create:false,version_ok:true,gate_ok:true,policies_ok:true,read_only:'off',isolation:'read committed'}],rowCount:1,command:'SELECT'};
 },release(discard?:unknown){assert.equal(discard,true);discarded=true;}});
 const pool={async connect(){connects++;return raw;}};proof.bind(pool);
 function holdRepresentativeQuery(){
  const started=Promise.withResolvers<void>(),resume=Promise.withResolvers<void>();
  pending={started:started.resolve,resume:resume.promise};
  return {started:started.promise,resume:resume.resolve};
 }
 return {proof,calls,raw,pool,module,discarded:()=>discarded,connects:()=>connects,holdRepresentativeQuery};
}
test('production35 model verifies same raw idle lease before role switch and uses actual server port',async()=>{
 const m=await productionIssuerModel();const issuer=m.module.createRuntime27CommandIssuer(m.pool,{database:'synthetic_test',user:'runtime',port:15432},'WHOLE_V2',m.proof.cap);
 const c=await issuer.pool.connect();assert.equal(m.proof.events[0],'lease-before-role');assert.ok(m.calls[0]!.startsWith('SET ROLE'));
 await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');await issuer.runtime27.assertReady(c,'DOCUMENT_COMMAND');assert.ok(m.proof.events.includes('current'));
 c.release();assert.equal(m.discarded(),true);
});
test('production35 model revocation prevents queries and commit while original rollback/discard remain available',async()=>{
 const m=await productionIssuerModel();const issuer=m.module.createRuntime27CommandIssuer(m.pool,{database:'synthetic_test',user:'runtime',port:15432},'WHOLE_V2',m.proof.cap);
 const c=await issuer.pool.connect();await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');m.proof.revoke();const before=m.calls.length;
 await assert.rejects(c.query('COMMIT'),/model revoked/);assert.equal(m.calls.length,before);
 await c.query('ROLLBACK');c.release();assert.equal(m.calls.at(-1),'ROLLBACK');assert.equal(m.discarded(),true);
 await assert.rejects(issuer.pool.connect(),/model lease denied/);
});
test('restored35 model refuses an expired admission before borrowing any pool connection',async()=>{
 const m=await productionIssuerModel(true);
 const issuer=m.module.createRuntime27CommandIssuer(m.pool,{database:'synthetic_test',user:'runtime',port:15432},'WHOLE_V2',m.proof.cap);
 m.proof.expire();
 await assert.rejects(issuer.pool.connect(),/model expired/);
 assert.equal(m.connects(),0);
 assert.deepEqual(m.calls,[]);
});
test('restored35 model withholds an in-flight query result after expiry and still rolls back and discards',async()=>{
 const m=await productionIssuerModel(true);
 const issuer=m.module.createRuntime27CommandIssuer(m.pool,{database:'synthetic_test',user:'runtime',port:15432},'WHOLE_V2',m.proof.cap);
 const client=await issuer.pool.connect();
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 assert.deepEqual((await client.query('SELECT representative_inventory')).rows,[{quantity:12}]);
 const gate=m.holdRepresentativeQuery(),result=client.query('SELECT representative_inventory');
 const rejected=assert.rejects(result,/model expired/);
 await gate.started;
 m.proof.expire();
 gate.resume();
 await rejected;
 await client.query('ROLLBACK');
 client.release();
 assert.equal(m.connects(),1);
 assert.equal(m.calls.at(-1),'ROLLBACK');
 assert.equal(m.discarded(),true);
});
test('real issuer rejects JSON admission and model capability before pool access',async()=>{
 let connects=0;const pool={async connect(){connects++;throw Error('must not connect');}};const m=await productionIssuerModel();
 for(const cap of [{profile:'FRESH35_ORDINARY_POOL_ADMISSION_V2'},m.proof.cap])
  assert.throws(()=>createRuntime27CommandIssuer(pool,{database:'synthetic_test',user:'runtime',port:15432},'WHOLE_V2',cap as never),/ACTIVE_ADMISSION/);
 assert.equal(connects,0);
});
