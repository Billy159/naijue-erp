/** Offline renderer for an explicitly selected new-empty synthetic or bound local database.
 * Does not connect, create a database, discover credentials or grant membership.
 * Installing generated SQL is a separate, explicit local action. */
import {readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{resolve}from'node:path';
import{loadFresh27Plan,describeFresh27Plan}from'./fresh27-plan.mjs';
import{PORTABLE_SUCCESSORS,renderPortableFresh27Successor}from'./fresh27-portable-successors.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
export async function renderFresh27SqlBundle(root,targetBinding){
 const plan=describeFresh27Plan(await loadFresh27Plan({sourceRoot:root,profile:'FRESH27_SOURCE47_PLUS49_CODE_ONLY'}));const files=[];
 for(const f of plan.graph){let sql=await readFile(resolve(root,f.path),'utf8');if(hash(sql)!==f.sha256)throw Error('FRESH27_BUNDLE_SOURCE_CHANGED');let kind='ORIGINAL_SQL';
  if(PORTABLE_SUCCESSORS[f.path]){sql=renderPortableFresh27Successor(f.path,sql);kind='PORTABLE_SUCCESSOR';}
  if(f.path.includes('0026-v22-staged-prefix-bind.sql')){
   const match=sql.match(/\$routines\$(\[[\s\S]*?\])\$routines\$/);if(!match||JSON.parse(match[1]).length!==131)throw Error('V22_EXACT_PARENT_MISSING');
   const start=sql.indexOf('CREATE OR REPLACE FUNCTION naijue_erp.assert_core_initialization_v14('),end=sql.indexOf('$v22$;',start);if(start<0||end<0)throw Error('V22_EXACT_MEMBER_MISSING');const member=sql.slice(start,end+6);
   sql=`BEGIN;SET LOCAL search_path=pg_catalog;
DO $v22_parent$ DECLARE f jsonb; BEGIN
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY(SELECT generate_series(1,26)) OR (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>131 OR current_user::regrole::oid<>(SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp') THEN RAISE EXCEPTION 'FRESH27_V22_PARENT_REQUIRED'; END IF;
 FOR f IN SELECT value FROM jsonb_array_elements($parents$${match[1]}$parents$::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f->>'signature') AND p.proowner=current_user::regrole::oid AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=f->>'body' AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=f->>'definition') THEN RAISE EXCEPTION 'FRESH27_V22_EXACT_PARENT_BODY_METADATA_REQUIRED'; END IF;
 END LOOP;
END $v22_parent$;
SET LOCAL search_path=pg_catalog,naijue_erp;
${member}
COMMIT;`;kind='NEW_EMPTY_V22_CARRIER';
  }
  files.push({path:f.path,sourceSha256:f.sha256,renderedSha256:hash(sql),kind,sql});
 }
 let targetCheck="current_database() !~ '^synthetic_whole_[a-z0-9_]+$'";
 if(targetBinding!==undefined){if(!targetBinding||Object.keys(targetBinding).sort().join(',')!=='database_name,database_oid'||!/^[a-z][a-z0-9_]{0,62}$/.test(targetBinding.database_name)||['postgres','template0','template1'].includes(targetBinding.database_name)||!/^[1-9][0-9]{0,9}$/.test(targetBinding.database_oid))throw Error('EXACT_LOCAL_NEW_EMPTY_TARGET_REQUIRED');targetCheck="current_database()<>'"+targetBinding.database_name+"' OR (SELECT oid::text<>'"+targetBinding.database_oid+"' FROM pg_catalog.pg_database WHERE datname=current_database())";}
 const roles=['erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2','erp_unified27_runtime_2393dbc6db9581c2'];
 const guard=`DO $new_empty$ BEGIN IF ${targetCheck} OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='naijue_erp') OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN RAISE EXCEPTION '${targetBinding?'LOCAL_NEW_EMPTY_INSTALL_REQUIRED':'SYNTHETIC_NEW_EMPTY_INSTALL_REQUIRED'}'; END IF; IF (SELECT count(*) FROM pg_roles WHERE rolname=ANY(ARRAY[${roles.map(x=>"'"+x+"'").join(',')}]) AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)<>3 THEN RAISE EXCEPTION 'THREE_PRECREATED_NOLOGIN_ROLES_REQUIRED'; END IF; END $new_empty$;\n`;
 return {format:targetBinding?'FRESH27_BOUND_LOCAL_SQL_BUNDLE_V1':'FRESH27_SYNTHETIC_SQL_BUNDLE_V1',files,sql:'-- Generated source-only bundle. Run psql with ON_ERROR_STOP; do not resume after failure.\n'+guard+files.map(f=>'\n-- '+f.path+' source '+f.sourceSha256+'\n'+f.sql).join('\n')};
}
