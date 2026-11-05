/** Exact connection-free test entry. Never glob engine *.integration.ts files. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {loadSourceInventory,SHA,ROOT,splitSql,stripSqlComments,functionDefinitions,mergeDefinitions} from './source-inventory.mjs';
import {createAclCandidate,assertCompleteAclCandidate} from './acl-matrix.mjs';
import {validatePlan,renderGenesisReadonlyPreflight,renderV22SourcePinnedCandidate,renderCompleteBaseline} from './renderer.mjs';
const inventory=await loadSourceInventory(),NOW=1793476000000;
const plan=(profile='V6')=>({format:'DOT_RUNTIME26_BASELINE_PLAN_ONLY_V1',mode:'OFFLINE_RENDER_ONLY_NO_EXECUTION',profile,sourceFingerprint:inventory.sourceFingerprint,startsAt:NOW-1000,expiresAt:NOW+60000,target:{clusterSystemIdentifier:'8888888888000000001',host:'127.0.0.1',port:55440,database:'naijue_erp_test_abcd20261101',databaseOid:'17001',adminRole:'dot_rt26_admin_abcd0001',ownerRole:'dot_rt26_owner_abcd0001',runtimeRole:'dot_rt26_runtime_abcd0001',preparationRole:'dot_rt26_prepare_abcd0001',postmasterStart:'2026-10-31 19:00:00.123456+00'}});

test('explicit source chain preserves every original final V6/V7/V8/HISTORY body pin with declaration provenance',()=>{
 for(const [name,count]of [['V6',135],['V7',137],['V8',137],['HISTORY',137]]){const p=inventory.profiles[name];assert.equal(p.expectedRoutineCount,count);assert.equal(p.routines.length,count);assert.equal(new Set(p.routines.map(r=>r.name)).size,count);assert.ok(p.routines.every(r=>r.source.statementSha256&&r.source.spanEnd>r.source.spanStart&&r.declarationSignature&&r.language!=='UNRESOLVED'));assert.ok(p.sourceChain.every(p=>!p.path.includes('repair')&&!p.path.includes('v12-')));}
 assert.equal(inventory.v22.parents.length,131);assert.equal(inventory.v22.oldGuardPreserved,true);assert.equal(inventory.knownAcl.ordinaryV6XminTables.length,23);assert.equal(inventory.knownAcl.preparation13XminTables.length,13);
 assert.equal(inventory.profiles.V6.schema.tables.length,56);assert.ok(inventory.profiles.V6.schema.unresolved.length>0);assert.equal(inventory.profiles.V7.schema.tables.reduce((n,t)=>n+t.columns.length,0)-inventory.profiles.V6.schema.tables.reduce((n,t)=>n+t.columns.length,0),2);
});

test('SQL scanner preserves quoted/dollar semicolons and complete function suffix declaration provenance',()=>{
 const source="-- leading;comment\ncreate function naijue_erp.example(selected uuid) returns text as\n$body$ SELECT '--; literal'::text; $body$ language sql stable security definer set search_path=pg_catalog;\nSELECT 'still;one';";
 const statements=splitSql(source);assert.equal(statements.length,2);const [fn]=functionDefinitions(source,'synthetic.sql');assert.equal(fn.language,'sql');assert.equal(fn.volatility,'STABLE');assert.equal(fn.securityDefiner,true);assert.equal(fn.searchPathDeclaration,'pg_catalog');assert.equal(fn.source.statementSha256,SHA(statements[0].text));assert.ok(fn.source.spanEnd>source.indexOf('language sql'));assert.equal(fn.identityArgumentsState,'DECLARED_ARGUMENTS_NOT_PG_NORMALIZED');
 assert.throws(()=>splitSql("SELECT $bad$unterminated"),/UNTERMINATED/);assert.throws(()=>splitSql('SELECT (1'),/UNBALANCED/);
 assert.equal(stripSqlComments("SELECT '-- literal' /* hidden */"),"SELECT '-- literal'             ");
 const fake="-- CREATE FUNCTION naijue_erp.fake() RETURNS text AS $$ SELECT 'fake'; $$;\n"+source;
 assert.equal(functionDefinitions(fake,'synthetic.sql')[0].name,'example');
});

test('routine same-name overload/argument identity drift refuses instead of overwriting a matching body',()=>{
 const map=new Map(),a={name:'same',argumentsSource:'selected uuid'},b={name:'same',argumentsSource:'selected text'};mergeDefinitions(map,a);assert.throws(()=>mergeDefinitions(map,b),/UNRESOLVED_ROUTINE_OVERLOAD/);assert.equal(map.get('same'),a);
});

test('every declared positive column has explicit ordinary/preparation privilege cells; unknown is not grant/deny',()=>{
 const matrix=createAclCandidate(inventory,'V8'),columns=inventory.profiles.V8.schema.tables.reduce((n,t)=>n+t.columns.length,0);
 assert.equal(matrix.cells.filter(c=>c.objectKind==='COLUMN').length,columns*2*4);assert.ok(matrix.decisionsRequired.columnAndFunctionAndSequenceCells>4000);
 const positive=matrix.cells.filter(c=>c.role==='ORDINARY_ROLE'&&c.table==='inventory_ledger'&&['quantity_before','quantity_after'].includes(c.column)&&c.objectKind==='COLUMN'&&['SELECT','INSERT'].includes(c.privilege));assert.equal(positive.length,4);assert.ok(positive.every(c=>c.decision==='SOURCE_EXPLICIT_ALLOW'));
 assert.ok(matrix.cells.some(c=>c.role==='ORDINARY_ROLE'&&c.table==='sales_header'&&c.column==='id'&&c.privilege==='INSERT'&&c.decision==='UNDETERMINED'));
 assert.equal(matrix.cells.filter(c=>c.objectKind==='SEQUENCE').length,24);assert.ok(matrix.cells.filter(c=>c.objectKind==='SEQUENCE').every(c=>c.decision==='UNDETERMINED'));
 assert.ok(matrix.cells.filter(c=>c.role==='PREPARATION_ROLE'&&c.objectKind==='SYSTEM_COLUMN'&&c.column==='cmin').every(c=>c.decision==='UNDETERMINED'));
 assert.ok(matrix.cells.some(c=>c.role==='PREPARATION_ROLE'&&c.objectKind==='SYSTEM_COLUMN'&&c.table==='color'&&c.column==='xmin'&&c.privilege==='INSERT'&&c.decision==='UNDETERMINED'));
 const exception=matrix.cells.find(c=>c.role==='PUBLIC'&&c.routine==='naijue_erp.is_native_party_import_insert(text,jsonb)');assert.equal(exception.decision,'SOURCE_EXPLICIT_ALLOW');assert.ok(matrix.cells.some(c=>c.role==='PUBLIC'&&c.decision==='UNDETERMINED'));assert.equal(matrix.excludedUnwiredModuleTables[0].table,'read_dataset_version');
});

test('complete baseline renderer always refuses unresolved ACL/schema and has no fabricated-review bypass',()=>{
 const matrix=createAclCandidate(inventory);assert.throws(()=>renderCompleteBaseline(plan(),inventory,matrix,NOW),/REFUSE_COMPLETE_BASELINE_UNDETERMINED/);
 const fake={...matrix,cells:[],decisionsRequired:{schemaStatements:[],policies:[]}};assert.throws(()=>assertCompleteAclCandidate(fake),/PHASE1_HAS_NO_COMPLETE_BASELINE/);
 assert.throws(()=>validatePlan({...plan(),independentReview:{decision:'REVIEWED_EXPECTED_METADATA'}},inventory,NOW),/CLOSED_PHASE1/);
});

test('closed plan rejects old/nonloopback/ambiguous identities, foreign source and stale/unbounded windows',()=>{
 for(const patch of [{host:'example.invalid'},{host:'127.0.0.2'},{port:5432},{port:55438},{database:'demo_8877_v7_r1_rehearsal_20261031_01'},{databaseOid:'1027659'},{clusterSystemIdentifier:'7701337335828107278'},{runtimeRole:'erp_rewrite_runtime_20261022'},{ownerRole:'dot_rt26_runtime_abcd0001'},{postmasterStart:'unknown'}])assert.throws(()=>validatePlan({...plan(),target:{...plan().target,...patch}},inventory,NOW));
 for(const patch of [{sourceFingerprint:'a'.repeat(64)},{profile:'V5'},{startsAt:NOW+1},{expiresAt:NOW},{startsAt:NOW-1200001},{mode:'EXECUTE'}])assert.throws(()=>validatePlan({...plan(),...patch},inventory,NOW));
 assert.equal(validatePlan(plan(),inventory,NOW).target.port,55440);
});

test('closed plan captures own data without evaluating getters or accepting hidden fields',()=>{
 let getters=0;const value=plan();Object.defineProperty(value,'target',{enumerable:true,get(){getters++;throw Error('Do not call');}});assert.throws(()=>validatePlan(value,inventory,NOW),/CLOSED_PHASE1/);assert.equal(getters,0);
 const hidden=plan();Object.defineProperty(hidden,Symbol('hidden'),{value:1});assert.throws(()=>validatePlan(hidden,inventory,NOW),/CLOSED_PHASE1/);
});

test('frozen inventory envelope rejects rewritten body/parent pins under unchanged file-list fingerprint',()=>{
 assert.throws(()=>{inventory.v22.parents[0].body='a'.repeat(64);},TypeError);
 const forged=structuredClone(inventory);forged.v22.parents[0].body='a'.repeat(64);forged.v22.definition+='\nDROP TABLE naijue_erp.staff;';forged.v22.definitionSha256=SHA(forged.v22.definition);
 assert.throws(()=>renderV22SourcePinnedCandidate(plan(),forged,NOW),/ORIGINAL_FROZEN_SOURCE_INVENTORY_REQUIRED/);
});

test('genesis preflight is readonly and binds exact cluster/DB/roles/port/time plus no foreign clients or objects',()=>{
 const sql=renderGenesisReadonlyPreflight(plan(),inventory,NOW);assert.match(sql,/BEGIN READ ONLY/);assert.match(sql,/pg_control_system/);assert.match(sql,/pg_stat_activity/);assert.match(sql,/pg_prepared_xacts/);assert.match(sql,/pg_default_acl/);assert.ok(sql.endsWith('ROLLBACK;\n'));assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|GRANT|INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
});

test('v22 offline member preserves all131 full-signature/body/definition guards and unchanged source definition, fenced before DDL',async()=>{
 const before=await readFile(ROOT+inventory.v22.sourcePath,'utf8'),r=renderV22SourcePinnedCandidate(plan(),inventory,NOW);
 assert.equal(r.parents,131);assert.equal(r.status,'SOURCE_PINNED_CANDIDATE_NOT_EXECUTABLE');assert.ok(r.sql.indexOf(r.executionFence)<r.sql.indexOf('CREATE OR REPLACE FUNCTION'));
 assert.ok(r.sql.includes(inventory.v22.definition));assert.ok(r.sql.includes(JSON.stringify(inventory.v22.parents).replaceAll("'","''")));assert.match(r.sql,/pg_get_functiondef/);assert.match(r.sql,/p\.prosrc/);assert.match(r.sql,/history_expected_counts','UPDATE'/);assert.match(r.sql,/history_payload_hash','UPDATE'/);assert.match(r.sql,/generate_series\(1,26\)/);assert.ok(r.sql.endsWith('ROLLBACK;\n'));assert.doesNotMatch(r.sql,/\bCOMMIT\s*;/i);assert.ok(!r.sql.includes('erp_rewrite_20261022_r1'));
 assert.equal(SHA(before),inventory.v22.sourceSha256);assert.equal(SHA(await readFile(ROOT+inventory.v22.sourcePath,'utf8')),SHA(before));
});

test('CLI is connection-free inspect only and refuses every execution/approval selector',()=>{
 for(const args of [[],['--run'],['--approve'],['--inspect','--run']]){const r=spawnSync(process.execPath,['tests/integration/runtime26-baseline/plan.mjs',...args],{cwd:ROOT,encoding:'utf8'});assert.equal(r.status,2,r.stderr);}
});
