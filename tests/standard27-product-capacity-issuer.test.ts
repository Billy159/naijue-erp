import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime27CommandIssuer } from '../adapters/postgres/src/runtime27-command-issuer.ts';
import { PostgresMaintenanceCommandUnitOfWork } from '../adapters/postgres/src/maintenance-command-unit-of-work.ts';
import { assertStandard27ProductCapacityRuntime, createStandard27ProductCapacityIssuer } from '../adapters/postgres/src/standard27-product-capacity-issuer.ts';
function fixture(){
 let status='I';const calls:string[]=[];
 const raw={getTransactionStatus(){return status;},async query(sql:string){calls.push(sql);
  const command=sql.startsWith('SET ')?'SET':sql.startsWith('BEGIN')?'BEGIN':sql==='COMMIT'?'COMMIT':sql==='ROLLBACK'?'ROLLBACK':'SELECT';
  if(command==='BEGIN')status='T';if(command==='COMMIT'||command==='ROLLBACK')status='I';
  return {command,rowCount:command==='SELECT'?1:0,rows:command==='SELECT'?[{database:'synthetic_test',role:'erp_unified27_runtime_2393dbc6db9581c2',session_user:'runtime',server_port:5432,row_security:'on',search_path:'pg_catalog',replication_role:'origin',superuser:false,bypass:false,session_superuser:false,session_bypass:false,runtime_inherit:false,runtime_membership:false,can_create:false,version_ok:true,gate_ok:true,read_only:'off',isolation:'read committed',policies_ok:true}]:[]};},release(){}};
 const base={async connect(){return raw;}};
 return {base,calls,...createRuntime27CommandIssuer(base,{database:'synthetic_test',user:'runtime',port:5432})};
}
test('closed capacity issuer rejects before accessing caller configuration or connecting',()=>{
 let accessed=0;const trap=new Proxy({}, {get(){accessed++;throw Error('trap');},getPrototypeOf(){accessed++;throw Error('trap');}});
 assert.throws(()=>createStandard27ProductCapacityIssuer(trap as never,trap as never),{code:'PRODUCT_EVIDENCE_CAPACITY_NOT_READY'});assert.equal(accessed,0);
 const f=fixture();assert.throws(()=>createStandard27ProductCapacityIssuer(f.pool,f.runtime27),{code:'PRODUCT_EVIDENCE_CAPACITY_NOT_READY'});assert.equal(f.calls.length,0);
});
test('runtime prerequisite accepts only real issuer provenance and same active managed context',async()=>{
 const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool);let captured:object|undefined;
 await driver.transaction(async context=>{captured=context;await assertStandard27ProductCapacityRuntime(f.pool,f.runtime27,context);});
 assert.equal(f.calls.filter(sql=>sql.includes('runtime27-command:identity')).length,3);
 await assert.rejects(assertStandard27ProductCapacityRuntime(f.pool,f.runtime27,captured!));
});
test('shape-compatible capability cannot call a supplied readiness function',async()=>{
 const f=fixture();let invoked=0;const fake={profile:'EXACT27',contract:'STANDARD_RUNTIME27_COMMAND_V1',async assertReady(){invoked++;}};
 await assert.rejects(assertStandard27ProductCapacityRuntime(f.pool,fake as never,{}));assert.equal(invoked,0);assert.equal(f.calls.length,0);
});
test('base pool, different issuer and invented contexts fail without new SQL',async()=>{
 const f=fixture(),other=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool);
 await driver.transaction(async context=>{
  const before=f.calls.length;
  await assert.rejects(assertStandard27ProductCapacityRuntime(f.base,f.runtime27,context));
  await assert.rejects(assertStandard27ProductCapacityRuntime(f.pool,other.runtime27,context));
  await assert.rejects(assertStandard27ProductCapacityRuntime(f.pool,f.runtime27,{...context}));
  assert.equal(f.calls.length,before);
 });
});
test('read-only authority and legacy26 labels cannot enter product capacity runtime',async()=>{
 const f=fixture();
 for(const runtime of [f.ordinaryRead,{profile:'EXACT26',async assertReady(){throw Error('must not invoke');}}]) {
  await assert.rejects(assertStandard27ProductCapacityRuntime(f.pool,runtime as never,{}));
 }
 assert.equal(f.calls.length,0);
});
test('borrowed document contexts cannot enter a managed product precommit lifecycle',async()=>{
 const {withDocumentSpecificationMaintenanceContext}=await import('../adapters/postgres/src/maintenance-command-unit-of-work.ts');
 const f=fixture(),client=await f.pool.connect();await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
 const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 let reached=false;
 await assert.rejects(withDocumentSpecificationMaintenanceContext({pool:f.pool,client,runtime:f.runtime27,assertBound(){},append:{productId:id(1),operationId:id(2),expectedVersion:1,skuFacts:[{id:id(4)}],requestKey:`doc-spec:${id(3)}:${id(1)}`,parent:{documentId:id(5),operationId:id(3)} as never}},async context=>{
  reached=true;
  await assert.rejects(assertStandard27ProductCapacityRuntime(f.pool,f.runtime27,context),{code:'TRANSACTION_SCOPE'});
  throw Error('expected-test-stop');
 }),/expected-test-stop/);
 assert.equal(reached,true);await client.query('ROLLBACK');client.release();
});
