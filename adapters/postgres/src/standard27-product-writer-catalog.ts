import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {requireDomain} from '../../../packages/domain/src/errors.ts';
import type {Runtime27CommandCapability} from '../../../packages/application/src/runtime27-command-capability.ts';
import type {PgSalesPool} from './sales-unit-of-work.ts';
import {maintenanceContextClient} from './maintenance-command-unit-of-work.ts';
import {assertStandard27ProductCapacityRuntime} from './standard27-product-capacity-issuer.ts';

// Single-statement observation, not a proven coherent catalog snapshot.
// Privilege/deparser helpers may consult internal caches or distinct snapshots;
// consistency under concurrent DDL/ACL changes remains unverified. Bounded
// inputs avoid unbounded cross products; overflow makes catalog_text NULL.
// These observations do not establish that functions cannot write.
const SQL=`/* standard27-product:writer-catalog */ WITH
 roles AS MATERIALIZED (SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_catalog.pg_roles ORDER BY oid LIMIT 257),
 memberships AS MATERIALIZED (SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_catalog.pg_auth_members ORDER BY roleid,member,grantor LIMIT 4097),
 relations AS MATERIALIZED (SELECT c.* FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='naijue_erp' AND c.relname=ANY(ARRAY['product','sku','sku_barcode','product_image','operation_receipt','audit_change','import_record','import_batch']) ORDER BY c.relname LIMIT 9),
 attributes AS MATERIALIZED (SELECT a.* FROM pg_catalog.pg_attribute a JOIN relations c ON c.oid=a.attrelid WHERE a.attnum>0 AND NOT a.attisdropped ORDER BY a.attrelid,a.attnum LIMIT 513),
 triggers AS MATERIALIZED (SELECT t.* FROM pg_catalog.pg_trigger t JOIN relations c ON c.oid=t.tgrelid ORDER BY t.oid LIMIT 513),
 policies AS MATERIALIZED (SELECT p.* FROM pg_catalog.pg_policy p JOIN relations c ON c.oid=p.polrelid ORDER BY p.oid LIMIT 513),
 definers AS MATERIALIZED (SELECT p.oid,p.pronamespace,p.proowner,p.proacl,p.proconfig,p.prokind,p.prosecdef,p.provolatile,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid),'UTF8')),'hex') AS definition_sha256
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prosecdef AND p.prokind IN ('f','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
  ORDER BY p.oid LIMIT 2049),
 bounded AS (SELECT (SELECT count(*) FROM roles)<=256 AND (SELECT count(*) FROM memberships)<=4096
  AND (SELECT count(*) FROM relations)=8 AND (SELECT count(*) FROM attributes)<=512
  AND (SELECT count(*) FROM triggers)<=512 AND (SELECT count(*) FROM policies)<=512 AND (SELECT count(*) FROM definers)<=2048 AS ok),
 payload AS (SELECT CASE WHEN ok THEN pg_catalog.jsonb_build_object(
  'roles',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY oid),'[]'::jsonb) FROM roles r),
  'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor),'[]'::jsonb) FROM memberships m),
  'relations',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.relname,'owner',c.relowner,'kind',c.relkind,'persistence',c.relpersistence,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl,
   'acl_entries',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY grantor,grantee,privilege_type),'[]'::jsonb) FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) x)) ORDER BY c.oid) FROM relations c),
  'columns',(SELECT jsonb_agg(jsonb_build_object('relation',a.attrelid,'number',a.attnum,'name',a.attname,'type',a.atttypid,'acl',a.attacl,
   'acl_entries',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY grantor,grantee,privilege_type),'[]'::jsonb) FROM pg_catalog.aclexplode(a.attacl) x)) ORDER BY a.attrelid,a.attnum) FROM attributes a),
  'effective_table_writes',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',r.oid,'relation',c.oid,'privilege',v.privilege,'grantable',pg_catalog.has_table_privilege(r.oid,c.oid,v.privilege||' WITH GRANT OPTION')) ORDER BY r.oid,c.oid,v.privilege),'[]'::jsonb)
   FROM roles r CROSS JOIN relations c CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege) WHERE pg_catalog.has_table_privilege(r.oid,c.oid,v.privilege)),
  'effective_column_writes',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',r.oid,'relation',a.attrelid,'column',a.attnum,'privilege',v.privilege,'grantable',pg_catalog.has_column_privilege(r.oid,a.attrelid,a.attnum,v.privilege||' WITH GRANT OPTION')) ORDER BY r.oid,a.attrelid,a.attnum,v.privilege),'[]'::jsonb)
   FROM roles r CROSS JOIN attributes a CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('REFERENCES')) v(privilege) WHERE pg_catalog.has_column_privilege(r.oid,a.attrelid,a.attnum,v.privilege)),
  'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('using',pg_catalog.pg_get_expr(p.polqual,p.polrelid),'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.oid),'[]'::jsonb) FROM policies p),
  'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('function',to_jsonb(p)-'prosrc'-'probin','definition_sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid),'UTF8')),'hex')) ORDER BY t.oid),'[]'::jsonb) FROM triggers t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid),
  'security_definers',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]'::jsonb) FROM definers d)
 )::text END AS body FROM bounded)
 SELECT (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()) AS database_oid,
 pg_catalog.pg_backend_pid()::text AS backend_pid,pg_catalog.pg_current_xact_id_if_assigned()::text AS transaction_id,
 pg_catalog.pg_current_snapshot()::text AS snapshot,pg_catalog.octet_length(body)::text AS catalog_bytes,
 CASE WHEN pg_catalog.octet_length(body)<=16777216 THEN body END AS catalog_text FROM payload`;

/** Read-only partial catalog evidence on the genuine managed runtime client.
 * No statement executes on module load. No SELECT-only role is widened.
 * A digest identifies observed bytes; it does not certify their safety. In
 * particular SECURITY DEFINER inventory needs reviewed function/dependency and
 * EXECUTE reachability analysis; relation owners/superusers and concurrent DDL
 * need controlled-host evidence. The statement snapshot descriptor does not
 * prove that privilege/deparser helpers share its view. Concurrent DDL/ACL
 * consistency and stability through commit are unverified. Do not wire this
 * result to a capacity gate. */
export async function collectStandard27ProductWriterCatalog(pool:PgSalesPool,runtime:Runtime27CommandCapability,context:object) {
 await assertStandard27ProductCapacityRuntime(pool,runtime,context);
 const client=maintenanceContextClient(context,pool);
 const result=await client.query(SQL);
 const fail=(ok:unknown)=>requireDomain(ok,'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Exact bounded writer catalog observation required');
 fail(result && typeof result==='object' && !types.isProxy(result));
 const rows=Object.getOwnPropertyDescriptor(result,'rows');fail(rows && 'value' in rows);
 const values:unknown=rows!.value;fail(Array.isArray(values)&&!types.isProxy(values));
 const list=values as unknown[];fail(list.length===1 && Reflect.ownKeys(list).length===2);
 const entry=Object.getOwnPropertyDescriptor(list,'0');fail(entry && 'value' in entry);
 const row:unknown=entry!.value;fail(row && typeof row==='object' && !types.isProxy(row) && Object.getPrototypeOf(row)===Object.prototype);
 const keys=['catalog_text','catalog_bytes','database_oid','backend_pid','transaction_id','snapshot'];
 fail(Reflect.ownKeys(row as object).length===keys.length);
 const copy:Record<string,string>={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(row,key);fail(d?.enumerable&&'value' in d&&typeof d.value==='string');copy[key]=d!.value;}
 fail(['database_oid','backend_pid','transaction_id'].every(k=>/^[1-9][0-9]*$/.test(copy[k]!)) && /^[0-9]+:[0-9]+:(?:[0-9]+(?:,[0-9]+)*)?$/.test(copy.snapshot!));
 fail(/^[1-9][0-9]*$/.test(copy.catalog_bytes!)&&BigInt(copy.catalog_bytes!)<=16777216n&&String(Buffer.byteLength(copy.catalog_text!))===copy.catalog_bytes);
 await assertStandard27ProductCapacityRuntime(pool,runtime,context);
 fail(maintenanceContextClient(context,pool)===client);
 return Object.freeze({verification:'UNVERIFIED_WRITER_CATALOG_ONLY' as const,catalogText:copy.catalog_text!,sha256:createHash('sha256').update(copy.catalog_text!).digest('hex'),databaseOid:copy.database_oid!,backendPid:copy.backend_pid!,transactionId:copy.transaction_id!,snapshot:copy.snapshot!});
}
