/** Generates a disabled source-only normalization experiment. NOT EXECUTABLE. */
import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
export const SOURCE_PINS=Object.freeze([
 {path:'adapters/postgres/migrations/0011_history_storage.sql',sha256:'67d9cb6df4e46c6807330b7ed7dd22305a4d331b111b85275f900caaf5d14965'},
 {path:'adapters/postgres/patches/0026-v14-core-initialization.sql',sha256:'78fd94e1292057736d11e7e42a5b308c036d45176c4194d8fce26bb1dd6e767d'},
]);
export const COLUMNS='id uuid, batch_id uuid, entity_type text, source_key text, file_ref text, sheet text, row_no bigint, source_file_sha256 text, row_sha256 text, raw_fields jsonb, normalized_fields jsonb, field_provenance jsonb';
const base={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',batch_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',entity_type:'STAFF',source_key:'synthetic-staff-1',file_ref:'synthetic.json',sheet:'staff',row_no:1,source_file_sha256:'1'.repeat(64),row_sha256:'2'.repeat(64),raw_fields:{name:'Synthetic'},normalized_fields:{name:'Synthetic'},field_provenance:{schema_version:1,fields:{bootstrap_accounts:{raw:{version:'NATIVE_BOOTSTRAP_ACCOUNTS_PROOF_V1',synthetic:true}}}}};
const ok=(name,input,matchesActual=false,sqlNull=false)=>({name,input,sqlNull,status:'OK',sqlstate:null,matchesActual});
const bad=(name,input,sqlstate)=>({name,input,sqlNull:false,status:'ERROR',sqlstate,matchesActual:false});
export function normalizationCases(){
 const missing={...base};delete missing.id;
 const missingProvenance={...base};delete missingProvenance.field_provenance;
 return [ok('exact_snapshot',base,true),ok('sql_null',null,false,true),bad('json_null',null,'22023'),bad('scalar_string','scalar','22023'),bad('array',[],'22023'),ok('empty_object',{}),ok('missing_id',missing),ok('explicit_null_id',{...base,id:null}),ok('ignored_extra_field',{...base,unrecognized:'must-not-become-proof'},true),ok('uuid_case_and_bigint_string',{...base,id:base.id.toUpperCase(),row_no:'1'},true),ok('bigint_max',{...base,row_no:'9223372036854775807'}),ok('bigint_min',{...base,row_no:'-9223372036854775808'}),bad('invalid_uuid',{...base,id:'not-a-uuid'},'22P02'),bad('uuid_object',{...base,id:{}},'22P02'),bad('bigint_fraction',{...base,row_no:1.5},'22P02'),bad('bigint_boolean',{...base,row_no:true},'22P02'),bad('bigint_overflow',{...base,row_no:'9223372036854775808'},'22003'),ok('different_source_hash',{...base,row_sha256:'3'.repeat(64)}),ok('missing_provenance',missingProvenance),ok('null_provenance',{...base,field_provenance:null}),ok('changed_provenance',{...base,field_provenance:{schema_version:1,fields:{}}}),ok('different_source_key',{...base,source_key:'synthetic-other'}),ok('text_number_coercion',{...base,source_key:42}),ok('jsonb_nested_nulls',{...base,raw_fields:{a:null},normalized_fields:{a:[1,null]}})];
}
export async function renderNormalizationExperiment(root){
 for(const p of SOURCE_PINS)if(hash(await readFile(resolve(root,p.path)))!==p.sha256)throw Error('BOOTSTRAP_EQUIVALENCE_SOURCE_CHANGED');
 const cases=normalizationCases();
 return `-- NOT EXECUTABLE. TRUSTED DISPOSABLE CLUSTER AND LAUNCHER PROOF MISSING.
-- psql stops before sending any SQL; the SQL-only refusal is a second boundary.
\\quit 3
BEGIN;
DO $disabled$ BEGIN
 RAISE EXCEPTION 'BOOTSTRAP_EQUIVALENCE_TRUSTED_DISPOSABLE_TARGET_UNIMPLEMENTED';
END $disabled$;
\\set ON_ERROR_STOP on
\\if :{?expected_database}
\\else
\\echo expected_database is required
\\quit 3
\\endif
\\if :{?expected_user}
\\else
\\echo expected_user is required
\\quit 3
\\endif
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='2s';
SET LOCAL idle_in_transaction_session_timeout='30s';
SET LOCAL search_path=pg_catalog,pg_temp;
SELECT set_config('bootstrap_equivalence.expected_database', :'expected_database',true),set_config('bootstrap_equivalence.expected_user', :'expected_user',true);
DO $target$ BEGIN
 IF current_database() !~ '^synthetic_normalization_[a-z0-9_]+$'
 OR current_database() IS DISTINCT FROM current_setting('bootstrap_equivalence.expected_database')
 OR current_user IS DISTINCT FROM current_setting('bootstrap_equivalence.expected_user')
 OR session_user IS DISTINCT FROM current_user
 OR current_setting('server_version_num') !~ '^17[0-9]{4}$'
 OR current_setting('session_replication_role')<>'origin'
 OR to_regnamespace('naijue_erp') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls OR rolreplication OR rolcreatedb OR rolcreaterole))
 OR EXISTS(SELECT 1 FROM pg_event_trigger)
 THEN RAISE EXCEPTION 'SYNTHETIC_NORMALIZATION_TARGET_REQUIRED'; END IF;
END $target$;
CREATE TEMP TABLE bootstrap_normalization_row (${COLUMNS}) ON COMMIT DROP;
CREATE TEMP TABLE bootstrap_normalization_results(name text PRIMARY KEY,expected jsonb,legacy jsonb,candidate jsonb,equivalent boolean,expected_match boolean) ON COMMIT DROP;
DO $experiment$ DECLARE c jsonb; input jsonb; actual jsonb:=$actual$${JSON.stringify(base)}$actual$::jsonb;
 legacy_value jsonb; candidate_value jsonb; legacy_result jsonb; candidate_result jsonb; state text; message text;
BEGIN
 FOR c IN SELECT value FROM jsonb_array_elements($cases$${JSON.stringify(cases)}$cases$::jsonb) LOOP
  input:=CASE WHEN (c->>'sqlNull')::boolean THEN NULL ELSE c->'input' END;
  BEGIN
   SELECT to_jsonb(jsonb_populate_record(NULL::pg_temp.bootstrap_normalization_row,input)) INTO legacy_value;
   legacy_result:=jsonb_build_object('status','OK','sqlstate',NULL,'sqlNull',legacy_value IS NULL,'value',legacy_value,'matchesActual',legacy_value IS NOT DISTINCT FROM actual);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
   legacy_result:=jsonb_build_object('status','ERROR','sqlstate',state,'message',message,'matchesActual',false);
  END;
  BEGIN
   SELECT CASE WHEN input IS NULL THEN NULL::jsonb ELSE (SELECT to_jsonb(r) FROM jsonb_to_record(input) AS r(${COLUMNS})) END INTO candidate_value;
   candidate_result:=jsonb_build_object('status','OK','sqlstate',NULL,'sqlNull',candidate_value IS NULL,'value',candidate_value,'matchesActual',candidate_value IS NOT DISTINCT FROM actual);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
   candidate_result:=jsonb_build_object('status','ERROR','sqlstate',state,'message',message,'matchesActual',false);
  END;
  INSERT INTO pg_temp.bootstrap_normalization_results VALUES(c->>'name',c-'input',legacy_result,candidate_result,
   legacy_result-'message'=candidate_result-'message',
   legacy_result->>'status'=c->>'status' AND legacy_result->'sqlstate'=c->'sqlstate' AND legacy_result->'matchesActual'=c->'matchesActual');
 END LOOP;
END $experiment$;
SELECT jsonb_build_object('format','BOOTSTRAP_NORMALIZATION_EXPERIMENT_V1','sourcePins',$pins$${JSON.stringify(SOURCE_PINS)}$pins$::jsonb,'database',current_database(),'user',current_user,'serverVersion',current_setting('server_version_num'),'observations',jsonb_agg(to_jsonb(r) ORDER BY name))::text AS experiment_snapshot FROM pg_temp.bootstrap_normalization_results r;
DO $assert$ BEGIN
 IF (SELECT count(*) FROM pg_temp.bootstrap_normalization_results)<>${cases.length}
 OR EXISTS(SELECT 1 FROM pg_temp.bootstrap_normalization_results WHERE equivalent IS DISTINCT FROM true OR expected_match IS DISTINCT FROM true)
 THEN RAISE EXCEPTION 'BOOTSTRAP_NORMALIZATION_EQUIVALENCE_FAILED'; END IF;
END $assert$;
ROLLBACK;
DO $cleanup$ BEGIN
 IF to_regclass('pg_temp.bootstrap_normalization_row') IS NOT NULL OR to_regclass('pg_temp.bootstrap_normalization_results') IS NOT NULL
 THEN RAISE EXCEPTION 'BOOTSTRAP_NORMALIZATION_TEMP_STATE_REMAINS'; END IF;
END $cleanup$;
SELECT 'BOOTSTRAP_NORMALIZATION_ROLLBACK_COMPLETED' AS cleanup_marker;
`;
}
