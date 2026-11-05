import test from 'node:test';import assert from 'node:assert/strict';import{readFile,mkdtemp,mkdir,copyFile,appendFile}from'node:fs/promises';import{fileURLToPath}from'node:url';import{join,dirname}from'node:path';import{tmpdir}from'node:os';
import{renderNormalizationExperiment,normalizationCases,SOURCE_PINS,COLUMNS}from'./integration/bootstrap-normalization-equivalence/render.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');const sql=await renderNormalizationExperiment(root);
test('saved disabled specification reproduces exactly from pinned original sources',async()=>{
 assert.equal(sql,await readFile(new URL('./integration/bootstrap-normalization-equivalence/fixture.psql',import.meta.url),'utf8'));
 assert.equal(COLUMNS.split(',').length,12);assert.equal(SOURCE_PINS.length,2);
});
test('synthetic target gates, bounded timeouts and temporary objects precede experiment; only rollback cleanup',()=>{
 for(const text of ['\\set ON_ERROR_STOP on','expected_database is required','expected_user is required',"'^synthetic_normalization_[a-z0-9_]+$'","to_regnamespace('naijue_erp') IS NOT NULL","SET LOCAL statement_timeout='15s'","SET LOCAL lock_timeout='2s'","SET LOCAL idle_in_transaction_session_timeout='30s'",'rolsuper OR rolbypassrls OR rolreplication OR rolcreatedb OR rolcreaterole'])assert.ok(sql.includes(text));
 assert.ok(sql.indexOf('SYNTHETIC_NORMALIZATION_TARGET_REQUIRED')<sql.indexOf('CREATE TEMP TABLE'));
 assert.doesNotMatch(sql,/^COMMIT;|CREATE (?:OR REPLACE )?FUNCTION|CREATE SCHEMA|DROP TABLE|GRANT |REVOKE /m);
 assert.equal((sql.match(/^ROLLBACK;$/gm)||[]).length,1);assert.ok(sql.indexOf('ROLLBACK;')<sql.indexOf('BOOTSTRAP_NORMALIZATION_TEMP_STATE_REMAINS'));
 assert.ok(sql.includes('BOOTSTRAP_NORMALIZATION_ROLLBACK_COMPLETED'));
});
test('24 bounded synthetic cases include null missing extra type errors and source provenance changes',()=>{
 const cases=normalizationCases();assert.equal(cases.length,24);assert.equal(new Set(cases.map(c=>c.name)).size,24);
 for(const name of ['sql_null','json_null','missing_id','explicit_null_id','ignored_extra_field','invalid_uuid','bigint_fraction','bigint_boolean','bigint_overflow','different_source_hash','missing_provenance','null_provenance','changed_provenance','different_source_key'])assert.ok(cases.some(c=>c.name===name));
 assert.equal(cases.find(c=>c.name==='ignored_extra_field').matchesActual,true);
 assert.equal(cases.find(c=>c.name==='bigint_overflow').sqlstate,'22003');
 assert.ok(cases.filter(c=>c.status==='ERROR').every(c=>c.sqlstate.startsWith('22')));
});
test('captures full outcomes and distinct SQL null; compares value and SQLSTATE without hiding errors',()=>{
 for(const text of ['NULL::pg_temp.bootstrap_normalization_row','CASE WHEN input IS NULL THEN NULL::jsonb','GET STACKED DIAGNOSTICS','RETURNED_SQLSTATE','MESSAGE_TEXT',"'sqlNull',legacy_value IS NULL","legacy_result-'message'=candidate_result-'message'",'expected_match IS DISTINCT FROM true','BOOTSTRAP_NORMALIZATION_EQUIVALENCE_FAILED',"'sourcePins'",'experiment_snapshot'])assert.ok(sql.includes(text));
});
test('changed historical source refuses to render a specification',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'bootstrap-equivalence-source-'));
 for(const p of SOURCE_PINS){await mkdir(dirname(join(temp,p.path)),{recursive:true});await copyFile(join(root,p.path),join(temp,p.path));}
 await appendFile(join(temp,SOURCE_PINS[1].path),'\n');await assert.rejects(renderNormalizationExperiment(temp),/SOURCE_CHANGED/);
});

test('unconditional psql and SQL-only refusals precede all target actions and experiment statements',()=>{
 const commands=sql.split('\n').filter(line=>line.trim()&&!line.startsWith('--'));
 assert.equal(commands[0],'\\quit 3');
 assert.equal(commands[1],'BEGIN;');
 assert.equal(commands[2],'DO $disabled$ BEGIN');
 assert.equal(commands[3].trim(),"RAISE EXCEPTION 'BOOTSTRAP_EQUIVALENCE_TRUSTED_DISPOSABLE_TARGET_UNIMPLEMENTED';");
 assert.ok(sql.indexOf('END $disabled$;')<sql.indexOf('BEGIN ISOLATION LEVEL'));
 assert.ok(sql.indexOf('END $disabled$;')<sql.indexOf('set_config('));
 assert.ok(sql.indexOf('END $disabled$;')<sql.indexOf('CREATE TEMP TABLE'));
});
test('missing provenance truly omits the field and null provenance separately tests JSON null',()=>{
 const cases=normalizationCases();
 assert.equal(Object.hasOwn(cases.find(c=>c.name==='missing_provenance').input,'field_provenance'),false);
 assert.equal(cases.find(c=>c.name==='null_provenance').input.field_provenance,null);
});
