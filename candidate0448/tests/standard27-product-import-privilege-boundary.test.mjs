import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=()=>readFileSync(new URL('../adapters/postgres/src/standard27-product-import-privilege-boundary.ts',import.meta.url),'utf8');
const issuer=()=>readFileSync(new URL('../adapters/postgres/src/standard27-product-capacity-issuer.ts',import.meta.url),'utf8');
test('known privileged import mutation surface is fixed in source, not caller supplied',()=>{const s=source();for(const name of ['standard_import_command','standard_initialize_current_admin','standard_import_master_chunk','standard_import_baseline_keys','standard_import_document_chunk','standard_publish_import','standard_whole_package_command_v2','standard_whole_package_prepare_v2','standard_whole_package_step_v2','standard_whole_package_finish_v2'])assert.ok(s.includes(name),name);assert.match(s,/required_missing/);assert.match(s,/p\.proname=g\.name/);assert.doesNotMatch(s,/\$1|(?:^|\n)\s*GRANT\b|CREATE FUNCTION|SECURITY DEFINER/);});
test('effective execute checks include session reset, inherited privileges and SET ROLE reachability',()=>{const s=source();assert.match(s,/pg_has_role\(session_user,r\.oid,'SET'\)/);assert.match(s,/pg_has_role\(session_user,r\.oid,'USAGE'\)/);assert.match(s,/pg_has_role\(current_user,r\.oid,'USAGE'\)/);assert.match(s,/has_function_privilege\(r\.oid,p\.oid,'EXECUTE'\)/);assert.match(s,/r\.rolname IN \(current_user,session_user\)/);});
test('ownership, grant manipulation and privileged role attributes cannot count as isolated runtime',()=>{const s=source();for(const flag of ['rolsuper','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls'])assert.ok(s.includes(flag));assert.match(s,/has_schema_privilege\(r\.oid,'naijue_erp','CREATE'\)/);assert.match(s,/has_database_privilege/);assert.match(s,/c\.relowner=r\.oid/);});
test('new boundary is only a prerequisite behind unchanged closed capacity admission',()=>{const s=issuer();assert.match(s,/CLOSURE_ADMITTED: boolean = false/);assert.match(s,/client\.query\(STANDARD27_PRODUCT_IMPORT_PRIVILEGE_BOUNDARY_SQL\)/);assert.match(s,/import_surface_closed === true/);assert.ok(s.indexOf('assertClosureAdmitted(); // Before')<s.indexOf('client.query(STANDARD27_PRODUCT_IMPORT_PRIVILEGE_BOUNDARY_SQL)'));assert.match(source(),/not[\s\S]*complete[\s\S]*closure/i);});
test('reachable ADMIN options reject even when target SET and INHERIT are both false',()=>{
 const s=source();
 const match=s.match(/AND NOT EXISTS\(SELECT 1 FROM reachable r JOIN pg_catalog\.pg_auth_members m ON m\.member=r\.oid\s+WHERE m\.admin_option\)/);
 assert.ok(match,'ADMIN capability must be rejected independently of target reachability and current options');
 assert.doesNotMatch(match[0],/set_option|inherit_option|roleid=r\.oid/);
 // Adversarial truth table for the exact unqualified ADMIN predicate above.
 // This documents its intended semantics; no PostgreSQL execution is claimed.
 for(const set_option of [false,true])for(const inherit_option of [false,true]){
  const edge={member:'session-role',roleid:'unreachable-importer',admin_option:true,set_option,inherit_option};
  const rejected=['session-role'].some(member=>edge.member===member&&edge.admin_option);
  assert.equal(rejected,true,JSON.stringify(edge));
 }
});
test('provenance DML boundary includes column-only grants and keeps ordinary audit INSERT separate',()=>{
 const s=source();assert.match(s,/provenance_relations AS MATERIALIZED/);assert.match(s,/has_table_privilege\(r\.oid,c\.oid,v\.privilege\)/);assert.match(s,/has_column_privilege\(r\.oid,c\.oid,a\.attnum,v\.privilege\)/);
 assert.match(s,/c\.relname IN \('audit_change','operation_receipt'\) AND v\.privilege='INSERT'/);
 assert.match(s,/has_table_privilege\(r\.oid,c\.oid,'INSERT WITH GRANT OPTION'\)/);assert.match(s,/has_column_privilege\(r\.oid,c\.oid,a\.attnum,'INSERT WITH GRANT OPTION'\)/);
});
test('only exact public V1 definer helper identities can escape the unknown-definer rejection',()=>{
 const s=source();assert.match(s,/p\.prosecdef/);assert.match(s,/n\.nspname NOT IN \('pg_catalog','information_schema'\)/);assert.match(s,/h\.public_entry AND p\.oid=pg_catalog\.to_regprocedure\(h\.signature\)/);
 for(const pin of ['prosqlbody IS NULL','pronargdefaults=0','provariadic=0','prokind=\'f\'','NOT p.proretset','p.proowner=n.nspowner','p.proconfig=h.config','p.proisstrict=h.strict','p.prosecdef=h.definer'])assert.ok(s.includes(pin),pin);
});
test('V1 helper source body pins match exact checked-in definitions, including private dependencies',()=>{
 const s=source();const initial=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_initialization.sql',import.meta.url),'utf8');
 for(const name of ['standard_business_ready','standard_import_row_intent','standard_inventory_key_proof','standard_import_record_proof','standard_inventory_key_id']){
  const definition=initial.match(new RegExp('CREATE FUNCTION naijue_erp\\.'+name+'\\([^$]+?AS \\$\\$([\\s\\S]*?)\\$\\$;'));
  assert.ok(definition,name);const hash=createHash('sha256').update(definition[1]).digest('hex');assert.ok(s.includes(hash),`${name} source body changed`);
 }
});
test('indirect writable relation paths include column rights and MAINTAIN, not just ordinary table grants',()=>{
 const s=source();assert.match(s,/writable_relations AS MATERIALIZED/);assert.match(s,/'MAINTAIN'/);assert.match(s,/c\.relkind <> 'r'/);assert.match(s,/pg_catalog\.pg_inherits/);assert.match(s,/i\.inhrelid=c\.oid OR i\.inhparent=c\.oid/);assert.match(s,/pg_catalog\.pg_rewrite/);assert.match(s,/w\.ev_type <> '1'/);
});
test('native or custom-language callable routines and unsafe user trigger classes are refused',()=>{
 const s=source();assert.match(s,/l\.lanname NOT IN \('sql','plpgsql'\)/);assert.match(s,/JOIN writable_relations c ON c\.oid=t\.tgrelid/);assert.match(s,/NOT t\.tgisinternal/);assert.match(s,/t\.tgenabled <> 'O'/);assert.match(s,/p\.prosecdef OR l\.lanname NOT IN/);
});
test('predefined file/program and maintenance capabilities cannot hide behind ordinary role flags',()=>{
 const s=source();assert.match(s,/pg_has_role\(r\.oid,dangerous\.oid,'USAGE'\)/);for(const role of ['pg_read_server_files','pg_write_server_files','pg_execute_server_program','pg_signal_backend','pg_checkpoint','pg_maintain'])assert.ok(s.includes("'"+role+"'"),role);
});
test('SELECT-only and column-only read routes enter the indirect relation boundary',()=>{
 const s=source();assert.match(s,/readable_relations AS MATERIALIZED/);assert.match(s,/has_table_privilege\(r\.oid,c\.oid,'SELECT'\)/);assert.match(s,/has_column_privilege\(r\.oid,c\.oid,a\.attnum,'SELECT'\)/);assert.match(s,/FROM writable_relations UNION SELECT oid FROM readable_relations/);assert.match(s,/FROM accessible_relations c WHERE c\.relkind <> 'r'/);
});
test('column conversion cannot silently admit custom domain, composite or array element types',()=>{
 const s=source();assert.match(s,/JOIN pg_catalog\.pg_type t ON t\.oid=a\.atttypid/);assert.match(s,/tn\.nspname <> 'pg_catalog' OR t\.typtype <> 'b'/);assert.match(s,/t\.typelem<>0/);assert.match(s,/en\.nspname='pg_catalog' AND e\.typtype='b'/);assert.match(s,/JOIN pg_catalog\.pg_collation/);assert.match(s,/cn\.nspname <> 'pg_catalog'/);
});
test('heap/btree/GIN handlers and index operator families cannot hide custom native support',()=>{
 const s=source();for(const identity of ['heap_tableam_handler(internal)','bthandler(internal)','ginhandler(internal)'])assert.ok(s.includes(identity));for(const catalog of ['pg_opclass','pg_opfamily','pg_amproc','pg_amop','pg_operator'])assert.ok(s.includes('pg_catalog.'+catalog));assert.match(s,/opcn\.nspname='pg_catalog' AND fn\.nspname='pg_catalog'\) IS NOT TRUE/);assert.match(s,/ginhandler\(internal\)'\)\) IS NOT TRUE/);
});
test('defaults/generated, checks, policies and index expression roots are bounded and dependency-filtered',()=>{
 const s=source();for(const root of ['pg_attrdef','pg_constraint','pg_policy','pg_class'])assert.ok(s.includes("'pg_catalog."+root+"'::regclass"));assert.match(s,/expression_roots AS MATERIALIZED/);assert.match(s,/LIMIT 8193/);assert.match(s,/FROM expression_roots\)<=8192/);assert.match(s,/d\.classid=e\.classid AND d\.objid=e\.objid/);assert.match(s,/pg_catalog\.pg_depend/);assert.match(s,/confupdtype NOT IN \('a','r'\)/);assert.match(s,/confdeltype NOT IN \('a','r'\)/);
});
test('expression validator pins match the real schema sources',()=>{
 const s=source();for(const [name,path] of [['valid_product_season_ids','0025_product_season_selection.sql'],['maintenance_action_allowed','0021_native_maintenance_receipts.sql'],['valid_history_counts','0011_history_storage.sql']]){
  const ddl=readFileSync(new URL('../adapters/postgres/migrations/'+path,import.meta.url),'utf8');const definition=ddl.match(new RegExp('CREATE FUNCTION naijue_erp\\.'+name+'\\([^$]+?AS \\$\\$([\\s\\S]*?)\\$\\$;'));assert.ok(definition,name);assert.ok(s.includes(createHash('sha256').update(definition[1]).digest('hex')),name);
 }
});
test('dangling opfamily support and operator references cannot disappear behind inner joins',()=>{
 const s=source();assert.match(s,/pg_catalog\.pg_amproc ap LEFT JOIN pg_catalog\.pg_proc p/);assert.match(s,/pg_catalog\.pg_amop ao LEFT JOIN pg_catalog\.pg_operator o/);assert.match(s,/ap\.amprocfamily=fam\.oid AND pn\.nspname IS DISTINCT FROM 'pg_catalog'/);assert.match(s,/onsp\.nspname IS DISTINCT FROM 'pg_catalog' OR pn\.nspname IS DISTINCT FROM 'pg_catalog'/);
});
