/** Pure source-policy MOCKS only; not actual ACL/role/metadata or issuer proof. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {loadPairedSourcePlan} from '../reference-compiler-cohort-v2/source-cohort.mjs';
import {compileFinitePolicy,cellKey,compareRuntimeCellObservations} from '../reference-compiler-cohort-v2/universe.mjs';
import {renderFiniteGrants} from '../reference-compiler-cohort-v2/render.mjs';
import {compileAliasFourReadPolicy,assertAliasFourReadPolicy,renderAliasFourGrants,compareAliasFourCells,expectedAliasFourBoundary,compareAliasFourBoundary} from './alias4-policy.mjs';
assert.equal(typeof process.env.NAIJUE_SOURCE_COHORT_ROOT,'string','Explicit immutable source cohort required');
const {plan}=await loadPairedSourcePlan({sourceRoot:process.env.NAIJUE_SOURCE_COHORT_ROOT});
const M=new URL('../../../../../../development-results-20261031/current-runtime-feasibility-independent-review/',import.meta.url);
const inputs={materialText:await readFile(new URL('PLANNED-CURRENT-ISSUER-CREATE-STOCK-ACL-v1.json',M),'utf8'),addendumText:await readFile(new URL('SOURCE-CLOSURE-AND-LOCK-SELECTION-ADDENDUM-v1.json',M),'utf8'),closureText:await readFile(new URL('SOURCE-DECLARED-SELECTED-TRIGGERS-AND-EXECUTE-v1.json',M),'utf8'),universeText:await readFile(new URL('SOURCE-DECLARED-SYNTHETIC-ACL-UNIVERSE-v1.json',M),'utf8')};
const base=await compileFinitePolicy(plan,inputs), args={addendumText:await readFile(new URL('./ALIAS4-SOURCE-ADDENDUM.json',import.meta.url),'utf8'),maintenanceSourceText:await readFile(new URL('../../../../../adapters/postgres/src/product-maintenance-store.ts',import.meta.url),'utf8'),schemaSourceText:await readFile(new URL('../../../../../adapters/postgres/migrations/0011_history_storage.sql',import.meta.url),'utf8')};
const successor=compileAliasFourReadPolicy(base,args);
const observation=()=>({role:base.logical.runtime,cells:successor.runtimeCells.map(({schema,relation,objectKind,column,privilege,allowed})=>({schema,relation,objectKind,column,privilege,allowed}))});

test('exact genuine335 base gains precisely four source-required read cells; old base remains335',()=>{
 assert.equal(base.directGrantCells.length,335);assert.equal(successor.directGrantCells.length,339);assert.equal(successor.runtimeCells.length,4140);
 const changes=base.runtimeCells.filter((c,i)=>c.allowed!==successor.runtimeCells[i].allowed);
 assert.deepEqual(changes.map(c=>[c.relation,c.objectKind,c.column,c.privilege]).sort(),['batch_id','canonical_sku_id','canonical_source_key','source_row_id'].map(c=>['import_sku_alias','COLUMN',c,'SELECT']));
 assert.equal(successor.runtimeCells.filter(c=>c.allowed).length,339);assert.equal(base.runtimeCells.filter(c=>c.allowed).length,335);
});
test('all other4136 fullcell records and original335 grants remain unchanged, not just same allowcount',()=>{
 let n=0;for(let i=0;i<4140;i++){const a=base.runtimeCells[i],b=successor.runtimeCells[i];if(a.allowed===b.allowed){assert.deepEqual(a,b);n++;}}
 assert.equal(n,4136);assert.deepEqual(successor.directGrantCells.slice(0,335),base.directGrantCells);
});
test('all137 function/default/roles/database/schema/locks/source objects preserved by reference',()=>{
 for(const key of ['functionExecute','defaults','roles','database','schemas','knownWriteExposures','sourceTables','sourceViews','sourceSequences','negativeClosure'])assert.equal(successor[key],base[key]);
 assert.deepEqual(successor.finiteEffectiveVectorCounts,{cells:4277,allowed:446,denied:3831,directSourceGrantCells:339,inheritedSourcePublicExecute:107});
 assert.equal(successor.authority,'NONE');assert.equal(successor.engineExecutable,false);assert.equal(successor.completeOrdinaryErpBaseline,false);assert.equal(Object.isFrozen(successor.runtimeCells),true);
});
test('separate successor brand rejects copies/getters and cannot masquerade as original335 policy',()=>{
 assert.equal(assertAliasFourReadPolicy(successor),successor);assert.throws(()=>assertAliasFourReadPolicy({...successor}),/ORIGINAL_ALIAS4_POLICY_REQUIRED/);
 assert.throws(()=>compileAliasFourReadPolicy({...base},args),/ORIGINAL_SOURCE_COMPILED_FINITE_POLICY/);
 assert.throws(()=>renderFiniteGrants(successor),/ORIGINAL_SOURCE_COMPILED_FINITE_POLICY/);
 assert.throws(()=>renderAliasFourGrants({...successor}),/ORIGINAL_ALIAS4_POLICY_REQUIRED/);
 assert.throws(()=>renderAliasFourGrants(base),/ORIGINAL_ALIAS4_POLICY_REQUIRED/);
 let seen=0;assert.throws(()=>compileAliasFourReadPolicy(base,{...args,get addendumText(){seen++;return args.addendumText;}}));assert.equal(seen,0);
});
test('only immutable exact addendum/source bytes accepted, not same fields reserialized or foreign source',()=>{
 for(const field of Object.keys(args))assert.throws(()=>compileAliasFourReadPolicy(base,{...args,[field]:args[field]+'\n'}));
 const modified=JSON.parse(args.addendumText);modified.newReadCells.push({...modified.newReadCells[0],column:'mapping_basis'});
 assert.throws(()=>compileAliasFourReadPolicy(base,{...args,addendumText:JSON.stringify(modified)}));
});
test('old335 renderer output is exactprefix, append is one sorted4column SELECT with same intendedowner/runtime',()=>{
 const before=renderFiniteGrants(base),after=renderAliasFourGrants(successor);
 assert.deepEqual(after.statements.slice(0,-1),before.statements);assert.equal(after.statements.length,before.statements.length+1);
 assert.equal(after.statements.at(-1),'GRANT SELECT ("batch_id","canonical_sku_id","canonical_source_key","source_row_id") ON TABLE naijue_erp."import_sku_alias" TO "'+base.logical.runtime+'"');
 assert.equal(after.directSourceCells,339);assert.equal(after.intendedGrantor,before.intendedGrantor);assert.equal(after.functionAclStatements,0);assert.equal(after.defaultAclStatements,0);assert.equal(after.publicSchemaAclStatements,0);
 assert.doesNotMatch(after.statements.at(-1),/WITH GRANT OPTION|old_source_sku_id|mapping_basis|xmin|INSERT|UPDATE|DELETE|EXECUTE/);
});
test('all other52 alias cells stay explicitly DENY including both excluded ordinarycols/system/DML/tableSELECT',()=>{
 const rows=successor.runtimeCells.filter(c=>c.relation==='import_sku_alias');assert.equal(rows.length,56);assert.equal(rows.filter(c=>c.allowed).length,4);
 for(const c of rows)if(c.objectKind!=='COLUMN'||c.privilege!=='SELECT'||!['batch_id','canonical_sku_id','canonical_source_key','source_row_id'].includes(c.column))assert.equal(c.allowed,false);
});
test('complete4140 mock matches new expected vector but carries no actualidentity/canonical or grant authority',()=>{
 const result=compareAliasFourCells(successor,observation());assert.equal(result.cells,4140);assert.equal(result.mismatches,0);assert.equal(result.authority,'NONE');assert.equal(result.independentlyProvesSessionRole,false);
 assert.throws(()=>compareRuntimeCellObservations(base,observation()),/SOURCE_PRIVILEGE_EXPECTATION_MISMATCH/);
});
test('any4 required undergrant or excluded aliases overgrant is rejected, never normalized or repaired',()=>{
 const keys=successor.runtimeCells.filter(c=>c.relation==='import_sku_alias');for(const cell of keys){const o=observation(),i=o.cells.findIndex(c=>cellKey(c)===cellKey(cell));o.cells[i].allowed=!o.cells[i].allowed;assert.throws(()=>compareAliasFourCells(successor,o));}
});
test('overgrant anywhere else or dropped oldpositive is refused; source335 cannot be silently shrunk',()=>{
 for(const allowed of [true,false]){const o=observation(),c=o.cells.find(c=>c.relation!=='import_sku_alias'&&c.allowed===allowed);c.allowed=!allowed;assert.throws(()=>compareAliasFourCells(successor,o));}
});
test('NULL/duplicate/missing/foreigncell/extra fields/accessors and wrong role never qualify',()=>{
 for(const change of [o=>o.cells.pop(),o=>o.cells[1]={...o.cells[0]},o=>o.cells[0].allowed=null,o=>o.cells[0].relation='foreign',o=>o.cells[0].extra=true,o=>o.role=base.logical.sourceOwner]){const o=observation();change(o);assert.throws(()=>compareAliasFourCells(successor,o));}
 let calls=0;const o=observation();Object.defineProperty(o.cells,'0',{enumerable:true,get(){calls++;return {};}});assert.throws(()=>compareAliasFourCells(successor,o));assert.equal(calls,0);
});
test('module is inert pure compiler/renderer/comparator, not host/SQLexecutor or runtime canonical normalizer',async()=>{
 const s=await readFile(new URL('./alias4-policy.mjs',import.meta.url),'utf8');assert.doesNotMatch(s,/new (?:Pool|Client)\s*\(|\.(?:connect|query|listen)\s*\(|process\.argv|createNativeRuntime26Issuer|child_process|observed_canonical_text/);
});

test('rawACL sourceexpected has exactly341 grants with4 owner-granted nongrantable additions; otherboundary remains same',()=>{
 const expected=expectedAliasFourBoundary(successor),added=expected.explicitRuntimeGrants.filter(g=>g.relation==='import_sku_alias');
 assert.equal(expected.explicitRuntimeGrants.length,341);assert.equal(added.length,4);
 for(const g of added){assert.equal(g.grantor,base.logical.sourceOwner);assert.equal(g.grantee,base.logical.runtime);assert.equal(g.grantOption,false);assert.equal(g.privilege,'SELECT');assert.equal(g.objectKind,'COLUMN');}
 assert.equal(compareAliasFourBoundary(successor,structuredClone(expected)).functions,137);
});
test('rawACL wronggrantor/role/option/extra or missing right is rejected without alteringobservations',()=>{
 for(const change of [
  x=>x.explicitRuntimeGrants.find(g=>g.relation==='import_sku_alias').grantor=base.logical.admin,
  x=>x.explicitRuntimeGrants.find(g=>g.relation==='import_sku_alias').grantee='PUBLIC',
  x=>x.explicitRuntimeGrants.find(g=>g.relation==='import_sku_alias').grantOption=true,
  x=>x.explicitRuntimeGrants.push({...x.explicitRuntimeGrants[0]}),x=>x.explicitRuntimeGrants.pop(),
 ]){const x=structuredClone(expectedAliasFourBoundary(successor)),before=JSON.stringify(x);change(x);const mutated=JSON.stringify(x);assert.notEqual(before,mutated);assert.throws(()=>compareAliasFourBoundary(successor,x));assert.equal(JSON.stringify(x),mutated);}
});
test('old ownership/default/function/schema/session negatives remain mandatory in full boundary',()=>{
 for(const change of [x=>x.schemas.public.runtimeCreate=true,x=>x.database.runtime.push('TEMP'),x=>x.roleFlags[0].superuser=true,
  x=>x.userDefaultAclRows.push({}),x=>x.functions[0].runtimeGrantOption=true,x=>x.sourceOwnership.runtimeOwnsAnyDatabaseSchemaRelationRoutine=true,
  x=>x.roleMembershipEdges.push({}),x=>x.explicitRuntimeParameterPrivilegeGrants.push({})]){
  const x=structuredClone(expectedAliasFourBoundary(successor));change(x);assert.throws(()=>compareAliasFourBoundary(successor,x));
 }
});
test('boundary accessor/extra hidden field is refused and no fake same-shaped policy has access to expected',()=>{
 let calls=0;const x=structuredClone(expectedAliasFourBoundary(successor));Object.defineProperty(x,'functions',{enumerable:true,get(){calls++;return [];}});
 assert.throws(()=>compareAliasFourBoundary(successor,x));assert.equal(calls,0);
 const y=structuredClone(expectedAliasFourBoundary(successor));Object.defineProperty(y,'hidden',{value:true});assert.throws(()=>compareAliasFourBoundary(successor,y));
 assert.throws(()=>expectedAliasFourBoundary({...successor}),/ORIGINAL_ALIAS4_POLICY_REQUIRED/);
});
