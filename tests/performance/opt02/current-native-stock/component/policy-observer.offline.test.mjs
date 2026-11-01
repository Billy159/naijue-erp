/** Pure callback/malformed-observation tests. No pg import, connection, SQL
 * execution, target, credential or fabricated independent-review authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPairedSourcePlan } from '../reference-compiler-cohort-v2/source-cohort.mjs';
import { compileFinitePolicy, expectedBoundaryObservations, SHA } from '../reference-compiler-cohort-v2/universe.mjs';
import { MATERIAL, ADDENDUM } from '../contract.mjs';
import { compileAliasFourReadPolicy, expectedAliasFourBoundary } from '../reference-compiler-alias4-v1/alias4-policy.mjs';
import { observeFinitePolicy, observeAliasFourPolicy, POLICY_OBSERVER_QUERIES as Q } from './policy-observer.mjs';

const dir = new URL('../../../../../../development-results-20261031/current-runtime-feasibility-independent-review/', import.meta.url);
const texts = { materialText: readFileSync(new URL(MATERIAL.filename,dir),'utf8'), addendumText: readFileSync(new URL(ADDENDUM.filename,dir),'utf8'),
  closureText: readFileSync(new URL('SOURCE-DECLARED-SELECTED-TRIGGERS-AND-EXECUTE-v1.json',dir),'utf8'),
  universeText: readFileSync(new URL('SOURCE-DECLARED-SYNTHETIC-ACL-UNIVERSE-v1.json',dir),'utf8') };
assert.equal(typeof process.env.NAIJUE_SOURCE_COHORT_ROOT,'string','Explicit immutable C12 installation cohort required');
const { plan } = await loadPairedSourcePlan({ sourceRoot: process.env.NAIJUE_SOURCE_COHORT_ROOT });
const policy = await compileFinitePolicy(plan,texts);
const boundaryText = readFileSync(new URL('reference-policy-v1/EXPECTED-BOUNDARY-PROJECTION.json',dir),'utf8');
assert.equal(SHA(boundaryText),'fa385c6f23790defe0e564854527fba92ebe224748f61a853451a230f5858436');
const mockBoundary = JSON.parse(boundaryText).projection;
assert.deepEqual(mockBoundary,expectedBoundaryObservations(policy),'Test fixture is frozen static source design, NOT actual PG observations');
const universe = JSON.parse(texts.universeText);
const mockCells = universe.runtimeTableColumnSequenceCells.map(c=>({schema:'naijue_erp',relation:c.relation,objectKind:c.kind,column:c.column,
  privilege:c.privilege,allowed:c.expectedRuntimeEffective}));
const mockFunctions = mockBoundary.functions.map(f=>({signature:f.signature,execute:f.runtimeExecute}));
const copy = v=>structuredClone(v);
class PgLikeResult { constructor(rows) { this.rows=rows;this.rowCount=rows.length;this.command='SELECT';this.fields=[]; } }
function fixture(change = ()=>{}) {
  const l=policy.logical,calls=[], state={cells:copy(mockCells),functions:copy(mockFunctions),boundary:copy(mockBoundary),function_acl_issues:[]};change(state);
  const identity=(role,pid)=>({session_user:role,current_user:role,database:l.database,pid,search_path:'pg_catalog',replication_role:'origin'});
  const runtimeId=identity(l.runtime,101),adminId=identity(l.admin,102);
  const runtimeQuery=async(sql,values)=>{calls.push({client:'runtime',sql,values:copy(values)});
    if(sql===Q.identity)return new PgLikeResult([copy(runtimeId)]);
    if(sql===Q.runtimeCells)return new PgLikeResult(state.cells);
    if(sql===Q.runtimeFunctions)return new PgLikeResult(state.functions);
    assert.fail('Unenumerated runtime SQL');};
  const adminQuery=async(sql,values)=>{calls.push({client:'admin',sql,values:copy(values)});
    if(sql===Q.identity)return new PgLikeResult([copy(adminId)]);
    if(sql===Q.adminBoundary)return new PgLikeResult([{boundary:state.boundary,function_acl_issues:state.function_acl_issues}]);
    assert.fail('Unenumerated admin SQL');};
  return {state,calls,runtimeId,adminId,options:{policy,runtimeQuery,adminQuery}};
}

test('MOCK only: real branded policy accepts4140 observations plus137functions and complete independent static boundary fixture',async()=>{
  const f=fixture(),out=await observeFinitePolicy(f.options);
  assert.equal(out.authority,'NONE');assert.equal(out.cellComparison.cells,4140);assert.equal(out.boundaryComparison.functions,137);
  assert.equal(out.requiresIndependentReferenceAndAcceptance,true);assert.equal(out.originalSuccessorCanonicalProbeStillRequired,true);
  assert.equal(f.calls.length,7);assert.deepEqual(f.calls.map(c=>c.client),['runtime','admin','runtime','runtime','admin','admin','runtime']);
  assert.deepEqual(f.calls.find(c=>c.sql===Q.adminBoundary).values,[policy.logical.runtime,policy.logical.sourceOwner,policy.logical.sentinel,policy.logical.preparation,policy.logical.admin]);
  assert.ok(Object.isFrozen(out.observations.boundary));assert.equal(out.observations.cells.filter(c=>c.allowed).length,335);
});
test('SQL enumerates actual catalogs without expected-ID lists; all four rights,PG17 MAINTAIN,all6attributes and four-sequence domain observed',()=>{
  assert.match(Q.runtimeCells,/a.attnum<>0/);assert.match(Q.runtimeCells,/r.relkind<>'S'/);assert.match(Q.runtimeCells,/'MAINTAIN'/);
  assert.match(Q.runtimeCells,/has_column_privilege\(current_user/);assert.match(Q.runtimeCells,/has_sequence_privilege\(current_user/);
  assert.doesNotMatch(Q.runtimeCells,/\$[0-9]|ANY\(|LIMIT|OFFSET/);
  assert.match(Q.adminBoundary,/aclexplode\(a.attacl\)/);assert.match(Q.adminBoundary,/pg_default_acl/);assert.match(Q.adminBoundary,/pg_parameter_acl/);
  assert.match(Q.adminBoundary,/x.is_grantable OR x.grantor<>f.proowner/);assert.match(Q.adminBoundary,/sha256\(convert_to\(f.prosrc/);
  for(const sql of Object.values(Q))assert.doesNotMatch(sql,/(?:^|;)\s*(?:BEGIN|COMMIT|ROLLBACK|SET|GRANT|REVOKE|CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i);
});
test('source vector never replaced by observed allowances: denied cell,missing/duplicate/unknown cells fail before catalog observation',async t=>{
  for(const [name,change] of [ ['grant',s=>{s.cells.find(c=>!c.allowed).allowed=true;}],['missing',s=>s.cells.pop()],
    ['duplicate',s=>{s.cells[0]=copy(s.cells[1]);}],['unknown',s=>{s.cells[0].relation='not_source';}],['null',s=>{s.cells[0].allowed=null;}] ])
    await t.test(name,async()=>{const f=fixture(change);await assert.rejects(observeFinitePolicy(f.options));assert.equal(f.calls.length,3);});
});
test('all named boundary negatives are actual observations,not policy-filled empty defaults',async t=>{
  for(const [name,change] of [ ['extraGrant',s=>s.boundary.explicitRuntimeGrants.push(copy(s.boundary.explicitRuntimeGrants[0]))],
    ['owner',s=>{s.boundary.sourceOwnership.databaseOwner='foreign';}],['membership',s=>s.boundary.roleMembershipEdges.push({member:'foreign'})],
    ['defaults',s=>s.boundary.userDefaultAclRows.push({owner:'foreign'})],['publicSchemaCreate',s=>s.boundary.schemas.public.public.push('CREATE')],
    ['publicUsageRepair',s=>{s.boundary.schemas.public.public=[];}],['sequenceRawGrant',s=>s.boundary.unexpectedSourceObjectAclRows.push({column:'xmin'})],
    ['parameter',s=>s.boundary.explicitRuntimeParameterPrivilegeGrants.push({parameter:'session_replication_role'})],
    ['missingRole',s=>s.boundary.roleFlags.pop()],['extraObject',s=>s.boundary.nonSourceObjects.push({kind:'TYPE',name:'public.foreign'})] ])
    await t.test(name,async()=>{const f=fixture(change);await assert.rejects(observeFinitePolicy(f.options));assert.equal(f.calls.length,5);});
});
test('all137body/SD/PUBLIC/private/grantor/option facts must match frozen source policy',async t=>{
  for(const [name,change] of [ ['body',s=>{s.boundary.functions[0].bodySha256='0'.repeat(64);}],['SD',s=>{s.boundary.functions[0].securityDefiner=!s.boundary.functions[0].securityDefiner;}],
    ['privateEXEC',s=>{s.boundary.functions.find(f=>!f.publicExecute).publicExecute=true;}],['direct',s=>{s.boundary.functions[0].directRuntimeExecuteGrant=true;}],
    ['grantor',s=>{s.boundary.functions[0].aclGrantors=['foreign'];}],['option',s=>s.function_acl_issues.push({signature:'owner_option'})],
    ['missing',s=>s.boundary.functions.pop()] ])await t.test(name,async()=>{const f=fixture(change);await assert.rejects(observeFinitePolicy(f.options));assert.equal(f.calls.length,5);});
});
test('directLOGIN actual function observations cannot be substituted by admin effective calculations',async t=>{
  for(const change of [s=>{s.functions[0].execute=!s.functions[0].execute;},s=>s.functions.pop(),s=>{s.functions[0]=copy(s.functions[1]);}])
    await t.test('wrong actual runtime function',async()=>{const f=fixture(change);await assert.rejects(observeFinitePolicy(f.options));assert.equal(f.calls.length,5);});
});
test('wrong runtime/admin identity,SET ROLE,replication and client movement refuse without extra query',async t=>{
  for(const key of ['session_user','current_user','database','search_path','replication_role'])await t.test(key,async()=>{
    const f=fixture();f.runtimeId[key]='foreign';await assert.rejects(observeFinitePolicy(f.options),{code:'ACTUAL_DIRECT_POLICY_IDENTITY_REQUIRED'});assert.equal(f.calls.length,1);
  });
  const f=fixture();f.adminId.current_user=policy.logical.sourceOwner;await assert.rejects(observeFinitePolicy(f.options));assert.equal(f.calls.length,2);
  const moved=fixture(),old=moved.options.runtimeQuery;let n=0;moved.options.runtimeQuery=async(...a)=>{if(a[0]===Q.identity&&++n===2)moved.runtimeId.pid=999;return old(...a);};
  await assert.rejects(observeFinitePolicy(moved.options),{code:'CAPTURED_POLICY_CLIENT_CHANGED'});
});
test('plain policy clone/getters/extra input rejected before any query; pg-like Result supported but absent counts/accessors refuse',async()=>{
  const f=fixture();await assert.rejects(observeFinitePolicy({...f.options,policy:{...policy}}));assert.equal(f.calls.length,0);
  await assert.rejects(observeFinitePolicy({...f.options,extra:true}));assert.equal(f.calls.length,0);
  const options={...f.options};Object.defineProperty(options,'policy',{enumerable:true,get(){assert.fail('getter invoked');}});await assert.rejects(observeFinitePolicy(options));
  for(const result of [{rows:[]},Object.defineProperty({rowCount:1},'rows',{get(){assert.fail('rows getter invoked');}})]){
    await assert.rejects(observeFinitePolicy({...f.options,runtimeQuery:async()=>result}),{code:'EXACT_POLICY_OBSERVER_ROW_COUNT_REQUIRED'});
  }
});
test('failed/unknown caller query propagates original failure; collector never sends cleanup,observation fallback or retries',async()=>{
  const f=fixture(),failure=Object.assign(new Error('UNCERTAIN_QUERY_OUTCOME_NO_REPLAY'),{code:'SYNTHETIC_ORIGINAL_ERROR'}),original=f.options.runtimeQuery;
  f.options.runtimeQuery=async(sql,...rest)=>{if(sql===Q.runtimeCells)throw failure;return original(sql,...rest);};
  await assert.rejects(observeFinitePolicy(f.options),e=>e===failure);assert.equal(f.calls.length,2);
});
test('nested observation getters and sparse rows never execute or become normalized actual data',async()=>{
  const f=fixture();Object.defineProperty(f.state.boundary,'explicitRuntimeGrants',{enumerable:true,get(){assert.fail('nested getter invoked');}});
  await assert.rejects(observeFinitePolicy(f.options),{code:'OWN_DATA_POLICY_OBSERVATION_REQUIRED'});assert.equal(f.calls.length,5);
  const sparse=fixture();delete sparse.state.cells[0];await assert.rejects(observeFinitePolicy(sparse.options));assert.equal(sparse.calls.length,3);
});
test('source40 declares no independent TYPE/DOMAIN; actual ERP type closure excludes standalone types but retains linked rowtype/array only',async()=>{
  assert.equal(plan.files.length,40);
  for(const file of plan.files)for(const statement of file.statements)assert.doesNotMatch(statement.sql,/\bCREATE\s+(?:TYPE|DOMAIN)\b/i);
  assert.match(Q.adminBoundary,/'ERP_INDEPENDENT_TYPE'/);
  assert.match(Q.adminBoundary,/r\.oid=t\.typrelid AND r\.reltype=t\.oid AND t\.typowner=r\.relowner AND r\.relkind IN\('r','p','v','m','f','S'\)/);
  assert.match(Q.adminBoundary,/element\.oid=t\.typelem AND element\.typarray=t\.oid AND element\.typtype='c'/);
  assert.match(Q.adminBoundary,/t\.typtype='b' AND t\.typcategory='A' AND t\.typlen=-1/);
  for(const kind of ['DOMAIN','ENUM','STANDALONE_COMPOSITE','UNRELATED_ARRAY']){
    const f=fixture(s=>s.boundary.nonSourceObjects.push({kind:'ERP_INDEPENDENT_TYPE',name:'naijue_erp.synthetic_'+kind}));
    await assert.rejects(observeFinitePolicy(f.options));assert.equal(f.calls.length,5);
  }
});

const alias4=compileAliasFourReadPolicy(policy,{addendumText:readFileSync(new URL('../reference-compiler-alias4-v1/ALIAS4-SOURCE-ADDENDUM.json',import.meta.url),'utf8'),maintenanceSourceText:readFileSync(new URL('../../../../../adapters/postgres/src/product-maintenance-store.ts',import.meta.url),'utf8'),schemaSourceText:readFileSync(new URL('../../../../../adapters/postgres/migrations/0011_history_storage.sql',import.meta.url),'utf8')});
function aliasFixture(change=()=>{}){
 const f=fixture();f.options.policy=alias4;
 f.state.cells=alias4.runtimeCells.map(({schema,relation,objectKind,column,privilege,allowed})=>({schema,relation,objectKind,column,privilege,allowed}));
 f.state.boundary=copy(expectedAliasFourBoundary(alias4));change(f.state);return f;
}
test('separate alias4 observer MOCK directly accepts339 and raw341 grants without normalization; default335 rejects it',async()=>{
 const f=aliasFixture(),out=await observeAliasFourPolicy(f.options);
 assert.equal(out.observations.cells.filter(c=>c.allowed).length,339);assert.equal(out.observations.boundary.explicitRuntimeGrants.length,341);
 assert.equal(out.observations.cells.filter(c=>c.relation==='import_sku_alias'&&c.allowed).length,4);assert.equal(out.boundaryComparison.functions,137);assert.equal(out.authority,'NONE');assert.equal(f.calls.length,7);
 const wrong=aliasFixture();await assert.rejects(observeFinitePolicy(wrong.options),/ORIGINAL_SOURCE_COMPILED_FINITE_POLICY_REQUIRED/);assert.equal(wrong.calls.length,0);
 const old=fixture();await assert.rejects(observeAliasFourPolicy(old.options),/ORIGINAL_ALIAS4_POLICY_REQUIRED/);assert.equal(old.calls.length,0);
});
test('new observer requires all4 exactreads and denies alias othercols/system/DML/tableSELECT before laterquery',async()=>{
 for(const cell of alias4.runtimeCells.filter(c=>c.relation==='import_sku_alias')){
  const f=aliasFixture(s=>{const c=s.cells.find(c=>c.relation===cell.relation&&c.objectKind===cell.objectKind&&c.column===cell.column&&c.privilege===cell.privilege);c.allowed=!c.allowed;});
  await assert.rejects(observeAliasFourPolicy(f.options));assert.equal(f.calls.length,3);
 }
});
test('new observer all341 rawACLs retain exact ownergrantor/nongrantable plus old default and function negatives',async()=>{
 for(const change of [s=>s.boundary.explicitRuntimeGrants.find(c=>c.relation==='import_sku_alias').grantor=policy.logical.admin,
  s=>s.boundary.explicitRuntimeGrants.find(c=>c.relation==='import_sku_alias').grantOption=true,
  s=>s.boundary.explicitRuntimeGrants.pop(),s=>s.boundary.schemas.public.runtimeCreate=true,
  s=>s.boundary.userDefaultAclRows.push({}),s=>s.boundary.functions[0].runtimeExecute=!s.boundary.functions[0].runtimeExecute]){
  const f=aliasFixture(change);await assert.rejects(observeAliasFourPolicy(f.options));assert.equal(f.calls.length,5);
 }
});
test('new observer copiedbrand or callerprofile/functions/SQL/role injection rejected beforequery; originalerror never retried',async()=>{
 const f=aliasFixture();await assert.rejects(observeAliasFourPolicy({...f.options,policy:{...alias4}}));
 for(const key of ['profile','compareCells','compareBoundary','sql','role'])await assert.rejects(observeAliasFourPolicy({...f.options,[key]:()=>{assert.fail('injected callback');}}));assert.equal(f.calls.length,0);
 const failure=new Error('UNKNOWN_ORIGINAL_ALIAS4_QUERY'),g=aliasFixture(),original=g.options.runtimeQuery;
 g.options.runtimeQuery=async(sql,...rest)=>{if(sql===Q.runtimeCells)throw failure;return original(sql,...rest);};
 await assert.rejects(observeAliasFourPolicy(g.options),e=>e===failure);assert.equal(g.calls.length,2);
});
