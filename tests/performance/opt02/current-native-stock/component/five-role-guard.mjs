/** Render-only administrative boundary for NEW post-cutoff reference/acceptance.
 * Not freshness/ACL/review/issuer authority. The host must prove private physical
 * birth, completed original publication, source pins and captured client PIDs.
 * Old four-role installation guard and its module brands remain unchanged. */
import { captureData, literal } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { LOGICAL } from '../reference-compiler/universe.mjs';
const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
const fields = Object.freeze(['systemIdentifier', 'database', 'databaseOid', 'admin', 'owner', 'sentinel', 'prepare',
  'port', 'postmasterStart', 'startsAt', 'expiresAt', 'runtime']);
const roleFields = Object.freeze(['admin', 'owner', 'sentinel', 'prepare', 'runtime']);
const names = Object.freeze({ admin: LOGICAL.admin, owner: LOGICAL.sourceOwner,
  sentinel: LOGICAL.sentinel, prepare: LOGICAL.preparation, runtime: LOGICAL.runtime });
const oldIds = new Set(['7701337335828107278','7702857766154043447','7702904939491061813','7702914707883278365',
  '7702940727697694749','7702952985003487270','7702954360436662301','7702980619903721547',
  '7703007244289476775','7703041642528404119','7703045911272542916']);
export function captureFiveRoleTarget(input, now = Date.now()) {
  const t = captureData(input, fields, 'EXACT_POST_CUTOFF_FIVE_ROLE_TARGET_REQUIRED');
  need(Number.isSafeInteger(now) && Number.isSafeInteger(t.startsAt) && Number.isSafeInteger(t.expiresAt)
    && t.startsAt <= now && now < t.expiresAt && t.expiresAt - t.startsAt > 0 && t.expiresAt - t.startsAt <= 1200000,
  'FINITE_CURRENT_FIVE_ROLE_WINDOW_REQUIRED');
  need(typeof t.systemIdentifier === 'string' && /^[1-9][0-9]{8,19}$/.test(t.systemIdentifier)
    && BigInt(t.systemIdentifier) <= 18446744073709551615n && !oldIds.has(t.systemIdentifier), 'OLD_OR_INVALID_SYSTEM_IDENTIFIER_REFUSED');
  need(t.database === LOGICAL.database && roleFields.every(key => t[key] === names[key])
    && new Set(roleFields.map(key => t[key])).size === 5, 'EXACT_FIVE_DISTINCT_LOGICAL_SOURCE_ROLES_REQUIRED');
  need(typeof t.databaseOid === 'string' && /^[1-9][0-9]{0,9}$/.test(t.databaseOid)
    && Number(t.databaseOid) <= 4294967295, 'CANONICAL_DATABASE_OID_REQUIRED');
  need(typeof t.port === 'number' && Number.isInteger(t.port) && t.port > 1024 && t.port < 65536
    && ![5432,55437,55438,55439,55440,55441,55442,55443,55444,55445,55446,55447,55448].includes(t.port),
  'NEW_REFERENCE_ACCEPTANCE_PORT_REQUIRED');
  need(typeof t.postmasterStart === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\+00$/.test(t.postmasterStart)
    && Number.isFinite(Date.parse(t.postmasterStart.replace(' ', 'T').replace(/\+00$/, 'Z'))), 'EXACT_POSTMASTER_UTC_START_REQUIRED');
  return t;
}
function capturedPids(value) {
  need(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && value.length > 0 && value.length <= 5
    && Reflect.ownKeys(value).length === value.length + 1, 'CLOSED_CAPTURED_ADMIN_RUNTIME_PID_SET_REQUIRED');
  const pids = [];
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    need(d && d.enumerable && Object.hasOwn(d, 'value') && Number.isInteger(d.value) && d.value > 1 && d.value <= 2147483647,
      'OWN_PRIMITIVE_BACKEND_PID_REQUIRED'); pids.push(d.value);
  }
  need(new Set(pids).size === pids.length, 'DISTINCT_CAPTURED_BACKEND_PIDS_REQUIRED');
  return Object.freeze(pids);
}

/** Execute only on a captured admin connection. NO runtime pg_control grant is
 * required or implied. Failure raises before any following business statement. */
export function renderPostCutoffFiveRoleGuard(input, allowedPids, now = Date.now()) {
  const t = captureFiveRoleTarget(input, now), pids = capturedPids(allowedPids), q = literal;
  const allRoles = roleFields.map(key => q(t[key])).join(','), noLogin = [t.owner,t.sentinel,t.prepare].map(q).join(',');
  const pidSql = `ARRAY[${pids.join(',')}]::int[]`;
  return `/* DOT_POST_CUTOFF_FIVE_ROLE_ADMIN_BOUNDARY_NOT_RUNTIME_AUTHORITY */
DO $dot_five_roles$ BEGIN IF (
 current_database()=${q(t.database)} AND (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database())=${q(t.databaseOid)}
 AND current_user=${q(t.admin)} AND session_user=${q(t.admin)}
 AND (SELECT system_identifier::text FROM pg_catalog.pg_control_system())=${q(t.systemIdentifier)}
 AND pg_catalog.inet_server_addr()=inet '127.0.0.1' AND pg_catalog.inet_server_port()=${t.port}
 AND pg_catalog.pg_postmaster_start_time()::text=${q(t.postmasterStart)}
 AND pg_catalog.current_setting('server_version_num')='170011' AND NOT pg_catalog.pg_is_in_recovery()
 AND pg_catalog.current_setting('session_replication_role')='origin'
 AND extract(epoch FROM pg_catalog.clock_timestamp())*1000>=${t.startsAt}
 AND extract(epoch FROM pg_catalog.clock_timestamp())*1000<${t.expiresAt}
 AND pg_catalog.pg_backend_pid()=ANY(${pidSql})
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE backend_type='client backend' AND pid<>ALL(${pidSql}))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE backend_type='client backend' AND pid=ANY(${pidSql})
   AND (datname IS DISTINCT FROM ${q(t.database)} OR usename NOT IN(${q(t.admin)},${q(t.runtime)})))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_database WHERE datname NOT IN('postgres','template0','template1',${q(t.database)}))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE left(rolname,3)<>'pg_' AND rolname NOT IN(${allRoles}))
 AND (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN(${allRoles}))=5
 AND EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=${q(t.admin)} AND rolcanlogin AND rolsuper)
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN(${noLogin})
   AND (rolcanlogin OR rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolconnlimit<>0))
 AND EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=${q(t.runtime)} AND rolcanlogin AND rolconnlimit=4
   AND NOT(rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN(${allRoles}) AND coalesce(pg_catalog.cardinality(rolconfig),0)<>0)
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN(${allRoles}))
   OR roleid IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN(${allRoles})))
 AND (SELECT pg_catalog.pg_get_userbyid(datdba) FROM pg_catalog.pg_database WHERE datname=current_database())=${q(t.owner)}
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_database d CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(d.datacl,pg_catalog.acldefault('d',d.datdba))) a
   WHERE d.datname=current_database() AND a.grantee=0)
 AND pg_catalog.has_database_privilege(${q(t.runtime)},current_database(),'CONNECT')
 AND NOT pg_catalog.has_database_privilege(${q(t.runtime)},current_database(),'CREATE,TEMPORARY')
 AND NOT pg_catalog.has_database_privilege(${q(t.sentinel)},current_database(),'CONNECT')
 AND NOT pg_catalog.has_database_privilege(${q(t.prepare)},current_database(),'CONNECT')
 AND EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp' AND pg_catalog.pg_get_userbyid(nspowner)=${q(t.owner)})
 AND pg_catalog.has_schema_privilege(${q(t.runtime)},'naijue_erp','USAGE')
 AND NOT pg_catalog.has_schema_privilege(${q(t.runtime)},'naijue_erp','CREATE')
 AND NOT pg_catalog.has_schema_privilege(${q(t.sentinel)},'naijue_erp','USAGE,CREATE')
 AND NOT pg_catalog.has_schema_privilege(${q(t.prepare)},'naijue_erp','USAGE,CREATE')
 AND EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='public' AND pg_catalog.pg_get_userbyid(nspowner)='pg_database_owner')
 /* exact_postgres17_public_schema_acl */
 AND EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='public'
   AND (SELECT count(*) FROM pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))))=3
   AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
     WHERE a.grantor<>n.nspowner OR a.is_grantable
       OR NOT((a.grantee=0 AND a.privilege_type='USAGE')
         OR (a.grantee=n.nspowner AND a.privilege_type IN('CREATE','USAGE'))))
   AND (SELECT count(*) FROM pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
     WHERE a.grantee=0 AND a.privilege_type='USAGE')=1
   AND (SELECT count(*) FROM pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
     WHERE a.grantee=n.nspowner AND a.privilege_type='CREATE')=1
   AND (SELECT count(*) FROM pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
     WHERE a.grantee=n.nspowner AND a.privilege_type='USAGE')=1)
 AND pg_catalog.has_schema_privilege(${q(t.runtime)},'public','USAGE')
 AND NOT pg_catalog.has_schema_privilege(${q(t.runtime)},'public','CREATE')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN('information_schema','public','naijue_erp'))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_type p JOIN pg_catalog.pg_namespace n ON n.oid=p.typnamespace WHERE n.nspname='public')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl)
 AND NOT pg_catalog.has_parameter_privilege(${q(t.runtime)},'session_replication_role','SET')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_database WHERE pg_catalog.pg_get_userbyid(datdba)=${q(t.runtime)})
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE pg_catalog.pg_get_userbyid(nspowner)=${q(t.runtime)})
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE pg_catalog.pg_get_userbyid(relowner)=${q(t.runtime)})
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE pg_catalog.pg_get_userbyid(proowner)=${q(t.runtime)})
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_type WHERE pg_catalog.pg_get_userbyid(typowner)=${q(t.runtime)})
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='naijue_erp' AND pg_catalog.pg_get_userbyid(c.relowner)<>${q(t.owner)})
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='naijue_erp' AND pg_catalog.pg_get_userbyid(p.proowner)<>${q(t.owner)})
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   CROSS JOIN (VALUES(${q(t.sentinel)}),(${q(t.prepare)})) roles(name)
   WHERE n.nspname='naijue_erp' AND CASE WHEN c.relkind='S'
     THEN pg_catalog.has_sequence_privilege(roles.name,c.oid,'SELECT,UPDATE,USAGE')
     WHEN c.relkind IN('r','p','v','m') THEN
       (pg_catalog.has_table_privilege(roles.name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR pg_catalog.has_any_column_privilege(roles.name,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))
     ELSE false END)
 ) IS DISTINCT FROM true THEN RAISE EXCEPTION 'DOT_EXACT_POST_CUTOFF_FIVE_ROLE_BOUNDARY_CHANGED'; END IF; END $dot_five_roles$;`;
}
