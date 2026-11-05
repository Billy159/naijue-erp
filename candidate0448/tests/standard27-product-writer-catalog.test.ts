import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRuntime27CommandIssuer} from '../adapters/postgres/src/runtime27-command-issuer.ts';
import {PostgresMaintenanceCommandUnitOfWork} from '../adapters/postgres/src/maintenance-command-unit-of-work.ts';
import {collectStandard27ProductWriterCatalog} from '../adapters/postgres/src/standard27-product-writer-catalog.ts';
function fixture(observation:Record<string,unknown>){let status='I';const calls:string[]=[];const raw={getTransactionStatus(){return status;},release(){},async query(sql:string){calls.push(sql);const command=sql.startsWith('SET ')?'SET':sql.startsWith('BEGIN')?'BEGIN':sql==='COMMIT'?'COMMIT':sql==='ROLLBACK'?'ROLLBACK':'SELECT';if(command==='BEGIN')status='T';if(command==='COMMIT'||command==='ROLLBACK')status='I';return {command,rowCount:command==='SELECT'?1:0,rows:sql.includes('standard27-product:writer-catalog')?[observation]:command==='SELECT'?[{database:'synthetic_test',role:'erp_unified27_runtime_2393dbc6db9581c2',session_user:'runtime',server_port:5432,row_security:'on',search_path:'pg_catalog',replication_role:'origin',superuser:false,bypass:false,session_superuser:false,session_bypass:false,runtime_inherit:false,runtime_membership:false,can_create:false,version_ok:true,gate_ok:true,read_only:'off',isolation:'read committed',policies_ok:true}]:[]};}};const issued=createRuntime27CommandIssuer({async connect(){return raw;}},{database:'synthetic_test',user:'runtime',port:5432});return {...issued,calls,driver:new PostgresMaintenanceCommandUnitOfWork(issued.pool)};}
const observation=()=>({catalog_text:'{"synthetic":true}',database_oid:'42',backend_pid:'99',transaction_id:'123',snapshot:'123:124:',catalog_bytes:'18'});
test('collector requires actual issuer and active managed context before any SQL',async()=>{
 let called=0;const pool={async connect(){called++;throw Error('not allowed');}};
 await assert.rejects(collectStandard27ProductWriterCatalog(pool,{async assertReady(){called++;}} as never,{}));assert.equal(called,0);
});
test('one bounded catalog statement includes role edges and effective-write observations, never authorizes writes',async()=>{
 const f=fixture(observation());await f.driver.transaction(async context=>{
  const result=await collectStandard27ProductWriterCatalog(f.pool,f.runtime27,context);
  assert.equal(result.verification,'UNVERIFIED_WRITER_CATALOG_ONLY');assert.equal('assertReady' in result,false);
  assert.equal(result.sha256,createHash('sha256').update(observation().catalog_text).digest('hex'));
  assert.ok(Object.isFrozen(result));
 });
 const sql=f.calls.find(s=>s.includes('standard27-product:writer-catalog'))!;
 assert.equal(f.calls.filter(s=>s.includes('standard27-product:writer-catalog')).length,1);
 for(const name of ['pg_auth_members','pg_roles','pg_policy','pg_trigger','aclexplode','has_table_privilege','has_column_privilege','prosecdef','inherit_option','set_option','pg_current_xact_id_if_assigned','pg_current_snapshot'])assert.ok(sql.includes(name),name);
 assert.match(sql,/CASE WHEN[\s\S]*catalog_text/);assert.doesNotMatch(sql,/rolpassword|import_source_row|FOR SHARE|FOR UPDATE/);
});
test('missing, overflowing and mismatched catalog bytes fail closed',async()=>{
 for(const patch of [{catalog_text:null},{catalog_bytes:'19'},{catalog_bytes:'16777217'},{transaction_id:null},{snapshot:''}]){
  const f=fixture({...observation(),...patch});await assert.rejects(f.driver.transaction(context=>collectStandard27ProductWriterCatalog(f.pool,f.runtime27,context)));
 }
});
test('driver catalog getter is never executed and returned scalar evidence is detached',async()=>{
 let gets=0;const hostile={...observation(),get catalog_text(){gets++;return '{}';}};
 const f=fixture(hostile);await assert.rejects(f.driver.transaction(context=>collectStandard27ProductWriterCatalog(f.pool,f.runtime27,context)));assert.equal(gets,0);
 const row=observation(),g=fixture(row);await g.driver.transaction(async context=>{const out=await collectStandard27ProductWriterCatalog(g.pool,g.runtime27,context);row.catalog_text='changed';assert.equal(out.catalogText,'{"synthetic":true}');});
});
