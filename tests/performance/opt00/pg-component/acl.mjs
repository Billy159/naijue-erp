import { assertPlan, SHA } from '../../../integration/runtime26-baseline/schema-objects-only/source-plan.mjs';
/** Finite effective read-ACL checks. Observations never become grant policy. */
import { READ_COLUMNS, readerGrants } from './contract.mjs';
import { need, identifier, literal } from '../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
export function assertColumnMatrix(rows) {
 const expected=new Set(Object.entries(READ_COLUMNS).flatMap(([t,columns])=>columns.map(c=>t+'.'+c))),seen=new Set();
 for(const r of rows){need(typeof r.table_name==='string'&&typeof r.column_name==='string','COLUMN_IDENTITY_REQUIRED');const key=r.table_name+'.'+r.column_name;need(!seen.has(key),'DUPLICATE_COLUMN_OBSERVATION');seen.add(key);
 need(r.can_select===expected.has(key),'UNEXPECTED_EFFECTIVE_SELECT:'+key);for(const k of ['can_insert','can_update','can_references'])need(r[k]===false,'UNEXPECTED_EFFECTIVE_COLUMN_WRITE:'+key);}
 need([...expected].every(k=>seen.has(k)),'MISSING_EXPECTED_COLUMN_OBSERVATION');return {exactSelectCells:expected.size,observedCells:rows.length,noColumnWrites:true};
}
export function createReaderSql(role,database) { readerGrants(role);identifier(database);return [
 `CREATE ROLE ${identifier(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2`,
 `GRANT CONNECT ON DATABASE ${identifier(database)} TO ${identifier(role)}`,
 `GRANT USAGE ON SCHEMA naijue_erp TO ${identifier(role)}`,...readerGrants(role),
 `ALTER ROLE ${identifier(role)} SET default_transaction_read_only=on`
];}
export function assertRoutineSourceSecurity(rows,plan) {
 assertPlan(plan);need(rows.length===plan.routines.length&&new Set(rows.map(r=>r.signature)).size===plan.routines.length,'EXACT_SOURCE_ROUTINE_IDENTITIES_REQUIRED');
 for(const expected of plan.routines){const actual=rows.find(r=>r.signature===expected.signature);need(actual&&actual.security_definer===expected.securityDefiner&&actual.bodySha256===expected.bodySha256,'SOURCE_SECURITY_DEFINER_OR_BODY_MISMATCH:'+expected.signature);}
 return plan.routines.filter(r=>r.securityDefiner).map(r=>({signature:r.signature,bodySha256:r.bodySha256,source:r.source}));
}
export async function inspectReader(query,role,database,plan) {
 readerGrants(role);identifier(database);
 const flags=(await query(`SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,rolconnlimit FROM pg_roles WHERE rolname=$1`,[role])).rows;
 need(flags.length===1&&flags[0].rolcanlogin===true&&flags[0].rolconnlimit===2&&['rolsuper','rolcreatedb','rolcreaterole','rolinherit','rolreplication','rolbypassrls'].every(k=>flags[0][k]===false),'DIRECT_FINITE_LOGIN_ATTRIBUTES_REQUIRED');
 const cells=(await query(`SELECT c.relname table_name,a.attname column_name,
 has_column_privilege($1,c.oid,a.attnum,'SELECT') can_select,has_column_privilege($1,c.oid,a.attnum,'INSERT') can_insert,
 has_column_privilege($1,c.oid,a.attnum,'UPDATE') can_update,has_column_privilege($1,c.oid,a.attnum,'REFERENCES') can_references
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
 WHERE n.nspname='naijue_erp' AND c.relkind IN('r','p') AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,[role])).rows;
 const matrix=assertColumnMatrix(cells);
 const tables=(await query(`SELECT c.relname,has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') any_table_right FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp' AND c.relkind IN('r','p')`,[role])).rows;need(tables.length===56&&tables.every(t=>t.any_table_right===false),'NO_TABLE_LEVEL_RIGHTS_REQUIRED');
 const sequences=(await query(`SELECT c.relname,has_sequence_privilege($1,c.oid,'USAGE,SELECT,UPDATE') any_right FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp' AND c.relkind='S'`,[role])).rows;need(sequences.every(s=>s.any_right===false),'NO_SEQUENCE_RIGHTS_REQUIRED');
 const extra=(await query(`SELECT has_schema_privilege($1,'naijue_erp','USAGE') usage,has_schema_privilege($1,'naijue_erp','CREATE') create_schema,
 has_database_privilege($1,$2,'CONNECT') connect,has_database_privilege($1,$2,'CREATE,TEMP') create_temp,
 EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1) OR roleid=(SELECT oid FROM pg_roles WHERE rolname=$1)) memberships`,[role,database])).rows[0];need(extra.usage===true&&extra.connect===true&&extra.create_schema===false&&extra.create_temp===false&&extra.memberships===false,'EXACT_READER_NO_OWNER_MEMBERSHIP_REQUIRED');
 const functions=(await query(`SELECT p.oid::regprocedure::text signature,p.prosecdef security_definer,p.prosrc,has_function_privilege($1,p.oid,'EXECUTE') effective_execute,p.proacl::text acl_observation FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='naijue_erp' ORDER BY signature`,[role])).rows.map(({prosrc,...row})=>({...row,bodySha256:SHA(prosrc)}));
 const sourceSecurityDefiners=assertRoutineSourceSecurity(functions,plan);
 return {matrix,tables,sequences,attributes:flags[0],extra,functions,sourceSecurityDefiners,publicExecute:'RETAINED_SOURCE_DEFAULTS_NOT_ZERO_EXECUTE_CLAIM'};
}
export function negativeSql(f,owner) {identifier(owner);return [
 ['credential','SELECT password_hash FROM naijue_erp.user_account'],
 ['write',`UPDATE naijue_erp.product SET name=name WHERE id=${literal(f.productId)}::uuid`],
 ['insert',`INSERT INTO naijue_erp.product (id) VALUES (${literal(f.disabledProductId)}::uuid)`],
 ['lock','SELECT id FROM naijue_erp.product FOR SHARE'],
 ['sequence',"SELECT nextval('naijue_erp.runtime_sales_document_number_seq')"],
 ['create','CREATE TABLE naijue_erp.forbidden_component_write(id int)'],
 ['owner','SET ROLE '+identifier(owner)]
];}
export async function permissionNegatives(query,f,owner) {const results=[];for(const [name,sql] of negativeSql(f,owner)){await query('BEGIN READ WRITE');let error=null;try{await query(sql);}catch(e){error=e;}finally{await query('ROLLBACK');}need(error?.code==='42501','FINITE_READER_EXPECTED_42501:'+name);results.push({name,sqlstate:error.code,rolledBack:true});}return results;}
