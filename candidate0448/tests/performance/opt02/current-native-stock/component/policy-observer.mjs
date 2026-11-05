/** Actual finite-policy observations via caller-owned fenced queries. No Pool,
 * transaction, GRANT, expected-catalog generation or review authority. */
import { assertFinitePolicy, compareRuntimeCellObservations, compareBoundaryObservations, cellKey } from '../reference-compiler-cohort-v2/universe.mjs';
import { assertAliasFourReadPolicy, compareAliasFourCells, compareAliasFourBoundary } from '../reference-compiler-alias4-v1/alias4-policy.mjs';

const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function data(value, keys) {
  need(value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === keys.length, 'CLOSED_POLICY_OBSERVER_DATA_REQUIRED');
  const result = {};
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(value, key); need(d?.enumerable && Object.hasOwn(d, 'value'), 'OWN_DATA_POLICY_OBSERVER_REQUIRED'); result[key] = d.value; }
  return result;
}
// Accept the real pg Result (which has its own prototype/additional technical
// fields), without invoking accessors or inventing absent database row counts.
const rows = result => {
  const r = result && Object.getOwnPropertyDescriptor(result, 'rows'), n = result && Object.getOwnPropertyDescriptor(result, 'rowCount');
  need(r && n && Object.hasOwn(r, 'value') && Object.hasOwn(n, 'value') && Array.isArray(r.value)
    && Object.getPrototypeOf(r.value) === Array.prototype && n.value === r.value.length, 'EXACT_POLICY_OBSERVER_ROW_COUNT_REQUIRED');
  need(Reflect.ownKeys(r.value).length === r.value.length + 1, 'DENSE_POLICY_OBSERVER_ROWS_REQUIRED');
  for (let i = 0; i < r.value.length; i++) { const d = Object.getOwnPropertyDescriptor(r.value, String(i));
    need(d?.enumerable && Object.hasOwn(d, 'value'), 'OWN_DATA_POLICY_OBSERVER_ROW_REQUIRED'); }
  return r.value;
};
const one = result => { const r = rows(result); need(r.length === 1, 'ONE_POLICY_OBSERVER_ROW_REQUIRED'); return r[0]; };
function jsonData(value, ancestors = new Set()) {
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) {
    need(typeof value !== 'number' || Number.isFinite(value), 'JSON_POLICY_OBSERVATION_REQUIRED'); return value;
  }
  need(value && typeof value === 'object' && !ancestors.has(value), 'JSON_POLICY_OBSERVATION_REQUIRED');
  const array = Array.isArray(value), keys = array ? Array.from({ length: value.length }, (_, i) => String(i)) : Reflect.ownKeys(value);
  need(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype)
    && Reflect.ownKeys(value).length === keys.length + (array ? 1 : 0), 'CLOSED_JSON_POLICY_OBSERVATION_REQUIRED');
  const next = new Set(ancestors); next.add(value); const copy = array ? [] : {};
  for (const key of keys) { need(typeof key === 'string', 'JSON_POLICY_OBSERVATION_KEYS_REQUIRED');
    const d = Object.getOwnPropertyDescriptor(value, key); need(d?.enumerable && Object.hasOwn(d, 'value'), 'OWN_DATA_POLICY_OBSERVATION_REQUIRED');
    // defineProperty also keeps a hostile __proto__ key as data, not a setter.
    Object.defineProperty(copy, key, { value: jsonData(d.value, next), enumerable: true, configurable: true, writable: true }); }
  return copy;
}

export const POLICY_IDENTITY_SQL = `/* finite-policy:identity */ SELECT session_user::text AS session_user,current_user::text AS current_user,
 current_database()::text AS database,pg_backend_pid() AS pid,current_setting('search_path') AS search_path,
 current_setting('session_replication_role') AS replication_role`;

/** Enumerate actual catalog objects, not the expected vector: extra/missing
 * relations/columns must change the returned closed set, never be filtered out. */
export const POLICY_RUNTIME_CELLS_SQL = `/* finite-policy:runtime-cells */ WITH rels AS (
 SELECT c.oid,c.relname,c.relkind FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='naijue_erp' AND c.relkind IN('r','p','v','m','f','S'))
 SELECT 'naijue_erp'::text AS schema,r.relname AS relation,'COLUMN'::text AS "objectKind",a.attname AS "column",v.privilege,
 pg_catalog.has_column_privilege(current_user,r.oid,a.attnum,v.privilege) AS allowed
 FROM rels r JOIN pg_catalog.pg_attribute a ON a.attrelid=r.oid AND NOT a.attisdropped
 CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) v(privilege)
 WHERE r.relkind<>'S' AND a.attnum<>0
 UNION ALL SELECT 'naijue_erp',r.relname,'TABLE',NULL,v.privilege,pg_catalog.has_table_privilege(current_user,r.oid,v.privilege)
 FROM rels r CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) v(privilege) WHERE r.relkind<>'S'
 UNION ALL SELECT 'naijue_erp',r.relname,'SEQUENCE',NULL,v.privilege,pg_catalog.has_sequence_privilege(current_user,r.oid,v.privilege)
 FROM rels r CROSS JOIN (VALUES('SELECT'),('UPDATE'),('USAGE')) v(privilege) WHERE r.relkind='S'`;

export const POLICY_RUNTIME_FUNCTIONS_SQL = `/* finite-policy:runtime-functions */ SELECT p.oid::regprocedure::text AS signature,
 pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE') AS execute
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='naijue_erp' ORDER BY (p.oid::regprocedure::text) COLLATE "C"`;

// All five values are primitive logical names from the branded source policy.
// No observed flag/ACL/value is populated from that policy in this SELECT.
export const POLICY_ADMIN_BOUNDARY_SQL = `/* finite-policy:admin-boundary */ WITH
 roles(kind,name,ordinal) AS (VALUES('runtime',$1::text,1),('sourceOwner',$2::text,2),('sentinel',$3::text,3),('preparation',$4::text,4)),
 ns AS (SELECT * FROM pg_catalog.pg_namespace WHERE nspname IN('naijue_erp','public')),
 rels AS (SELECT c.*,n.nspname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp'),
 funcs AS (SELECT p.*,p.oid::regprocedure::text AS signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='naijue_erp'),
 acls AS (
 SELECT NULL::text AS schema,d.datname::text AS relation,'DATABASE'::text AS "objectKind",NULL::text AS "column",x.privilege_type AS privilege,
 x.grantee,x.grantor,x.is_grantable AS "grantOption",d.datdba AS owner FROM pg_catalog.pg_database d
 CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(d.datacl,pg_catalog.acldefault('d',d.datdba))) x WHERE d.datname=current_database()
 UNION ALL SELECT n.nspname,NULL,'SCHEMA',NULL,x.privilege_type,x.grantee,x.grantor,x.is_grantable,n.nspowner FROM ns n
 CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) x
 UNION ALL SELECT r.nspname,r.relname,CASE WHEN r.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,NULL,x.privilege_type,x.grantee,x.grantor,x.is_grantable,r.relowner FROM rels r
 CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(r.relacl,pg_catalog.acldefault(CASE WHEN r.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,r.relowner))) x WHERE r.relkind IN('r','p','v','m','f','S')
 UNION ALL SELECT r.nspname,r.relname,'COLUMN',a.attname,x.privilege_type,x.grantee,x.grantor,x.is_grantable,r.relowner FROM rels r
 JOIN pg_catalog.pg_attribute a ON a.attrelid=r.oid AND NOT a.attisdropped CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x),
 named_acls AS (SELECT schema,relation,"objectKind","column",privilege,CASE WHEN grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(grantee) END AS grantee,
 pg_catalog.pg_get_userbyid(grantor) AS grantor,"grantOption",pg_catalog.pg_get_userbyid(owner) AS owner FROM acls),
 ownership AS (
 SELECT pg_catalog.pg_get_userbyid(datdba) AS owner FROM pg_catalog.pg_database UNION ALL SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace
 UNION ALL SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class UNION ALL SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
 UNION ALL SELECT pg_catalog.pg_get_userbyid(typowner) FROM pg_catalog.pg_type),
 extras AS (
 SELECT 'SCHEMA'::text AS kind,nspname::text AS name FROM pg_catalog.pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN('information_schema','public','naijue_erp')
 UNION ALL SELECT 'RELATION',n.nspname||'.'||c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 UNION ALL SELECT 'ROUTINE',p.oid::regprocedure::text FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 UNION ALL SELECT 'TYPE',n.nspname||'.'||t.typname FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'
 /* No source CREATE TYPE/DOMAIN: retain only actual relation-generated row
    types and their mutually linked automatic arrays, never standalone c types. */
 UNION ALL SELECT 'ERP_INDEPENDENT_TYPE',n.nspname||'.'||t.typname FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
 WHERE n.nspname='naijue_erp' AND NOT (
   (t.typtype='c' AND EXISTS(SELECT 1 FROM rels r WHERE r.oid=t.typrelid AND r.reltype=t.oid AND t.typowner=r.relowner AND r.relkind IN('r','p','v','m','f','S')))
   OR (t.typtype='b' AND t.typcategory='A' AND t.typlen=-1 AND EXISTS(
     SELECT 1 FROM pg_catalog.pg_type element JOIN rels r ON r.oid=element.typrelid AND r.reltype=element.oid
     WHERE element.oid=t.typelem AND element.typarray=t.oid AND element.typtype='c' AND element.typowner=r.relowner AND t.typowner=r.relowner AND r.relkind IN('r','p','v','m','f','S'))))),
 fn_acls AS (SELECT f.oid,x.* FROM funcs f CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))) x)
 SELECT pg_catalog.jsonb_build_object(
 'database',(SELECT pg_catalog.jsonb_build_object('name',d.datname,'owner',pg_catalog.pg_get_userbyid(d.datdba),
   'runtime',ARRAY(SELECT v FROM unnest(ARRAY['CONNECT','CREATE','TEMPORARY']) v WHERE pg_catalog.has_database_privilege($1,d.oid,v)),
   'public',ARRAY(SELECT privilege FROM named_acls WHERE "objectKind"='DATABASE' AND grantee='PUBLIC' ORDER BY privilege COLLATE "C"),
   'sentinel',ARRAY(SELECT v FROM unnest(ARRAY['CONNECT','CREATE','TEMPORARY']) v WHERE pg_catalog.has_database_privilege($3,d.oid,v)),
   'preparation',ARRAY(SELECT v FROM unnest(ARRAY['CONNECT','CREATE','TEMPORARY']) v WHERE pg_catalog.has_database_privilege($4,d.oid,v))) FROM pg_catalog.pg_database d WHERE d.datname=current_database()),
 'schemas',pg_catalog.jsonb_build_object(
   'naijue_erp',(SELECT pg_catalog.jsonb_build_object('owner',pg_catalog.pg_get_userbyid(n.nspowner),
     'runtime',ARRAY(SELECT v FROM unnest(ARRAY['CREATE','USAGE']) v WHERE pg_catalog.has_schema_privilege($1,n.oid,v)),
     'public',ARRAY(SELECT privilege FROM named_acls WHERE "objectKind"='SCHEMA' AND schema=n.nspname AND grantee='PUBLIC' ORDER BY privilege COLLATE "C"),
     'sentinel',ARRAY(SELECT v FROM unnest(ARRAY['CREATE','USAGE']) v WHERE pg_catalog.has_schema_privilege($3,n.oid,v)),
     'preparation',ARRAY(SELECT v FROM unnest(ARRAY['CREATE','USAGE']) v WHERE pg_catalog.has_schema_privilege($4,n.oid,v))) FROM ns n WHERE nspname='naijue_erp'),
   'public',(SELECT pg_catalog.jsonb_build_object('owner',pg_catalog.pg_get_userbyid(n.nspowner),
     'public',ARRAY(SELECT privilege FROM named_acls WHERE "objectKind"='SCHEMA' AND schema=n.nspname AND grantee='PUBLIC' ORDER BY privilege COLLATE "C"),
     'runtimeEffective',ARRAY(SELECT v FROM unnest(ARRAY['CREATE','USAGE']) v WHERE pg_catalog.has_schema_privilege($1,n.oid,v)),
     'runtimeCreate',pg_catalog.has_schema_privilege($1,n.oid,'CREATE'),'nonSourceObjects',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY kind,name) FROM extras e WHERE kind IN('RELATION','ROUTINE','TYPE')),'[]'::jsonb)) FROM ns n WHERE nspname='public')),
 'roleFlags',(SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,'superuser',r.rolsuper,'inherit',r.rolinherit,
   'createRole',r.rolcreaterole,'createDatabase',r.rolcreatedb,'replication',r.rolreplication,'bypassRls',r.rolbypassrls,
   'connectionLimit',r.rolconnlimit,'objectOwner',EXISTS(SELECT 1 FROM ownership o WHERE o.owner=r.rolname)) ORDER BY roles.ordinal) FROM roles JOIN pg_catalog.pg_roles r ON r.rolname=roles.name),
 'bootstrapAdmin',(SELECT jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,'superuser',r.rolsuper,'ordinaryMeasurement',r.rolname=$1) FROM pg_catalog.pg_roles r WHERE r.rolname=$5),
 'roleMembershipEdges',coalesce((SELECT jsonb_agg(jsonb_build_object('role',pg_catalog.pg_get_userbyid(a.roleid),'member',pg_catalog.pg_get_userbyid(a.member),'grantor',pg_catalog.pg_get_userbyid(a.grantor)))
   FROM pg_catalog.pg_auth_members a WHERE pg_catalog.pg_get_userbyid(a.roleid)=ANY(ARRAY[$1,$2,$3,$4,$5]) OR pg_catalog.pg_get_userbyid(a.member)=ANY(ARRAY[$1,$2,$3,$4,$5])),'[]'::jsonb),
 'userDefaultAclRows',coalesce((SELECT jsonb_agg(jsonb_build_object('owner',pg_catalog.pg_get_userbyid(d.defaclrole),'namespace',d.defaclnamespace::text,'kind',d.defaclobjtype,'acl',d.defaclacl::text)) FROM pg_catalog.pg_default_acl d),'[]'::jsonb),
 'explicitRuntimeParameterPrivilegeGrants',coalesce((SELECT jsonb_agg(jsonb_build_object('parameter',p.parname,'privilege',a.privilege_type,'grantor',pg_catalog.pg_get_userbyid(a.grantor),'grantOption',a.is_grantable)) FROM pg_catalog.pg_parameter_acl p CROSS JOIN LATERAL pg_catalog.aclexplode(p.paracl) a WHERE pg_catalog.pg_get_userbyid(a.grantee)=$1),'[]'::jsonb),
 'runtimeRoleSettings',coalesce((SELECT jsonb_agg(jsonb_build_object('database',d.setdatabase::text,'settingName',split_part(v,'=',1))) FROM pg_catalog.pg_db_role_setting d CROSS JOIN LATERAL unnest(d.setconfig) v WHERE pg_catalog.pg_get_userbyid(d.setrole)=$1),'[]'::jsonb),
 'nonSourceObjects',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY kind,name) FROM extras e),'[]'::jsonb),
 'explicitRuntimeGrants',coalesce((SELECT jsonb_agg(to_jsonb(a)-'owner' ORDER BY coalesce(schema,''),coalesce(relation,''),"objectKind",coalesce("column",''),privilege) FROM named_acls a WHERE grantee=$1),'[]'::jsonb),
 'sourcePublicColumnTableSequenceAclRows',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM named_acls a WHERE schema='naijue_erp' AND "objectKind" IN('COLUMN','TABLE','SEQUENCE') AND grantee='PUBLIC'),'[]'::jsonb),
 'sentinelOrPreparationDirectSourceAclRows',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM named_acls a WHERE grantee IN($3,$4)),'[]'::jsonb),
 'unexpectedSourceObjectAclRows',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM named_acls a WHERE "grantOption" OR grantor<>owner OR NOT(grantee=owner OR grantee=$1 OR ("objectKind"='SCHEMA' AND schema='public' AND grantee='PUBLIC' AND privilege='USAGE'))),'[]'::jsonb),
 'sourceOwnership',pg_catalog.jsonb_build_object(
   'databaseOwner',(SELECT pg_catalog.pg_get_userbyid(datdba) FROM pg_catalog.pg_database WHERE datname=current_database()),
   'erpSchemaOwner',(SELECT pg_catalog.pg_get_userbyid(nspowner) FROM ns WHERE nspname='naijue_erp'),
   'tables',coalesce((SELECT jsonb_agg(jsonb_build_object('name',relname,'owner',pg_catalog.pg_get_userbyid(relowner)) ORDER BY relname COLLATE "C") FROM rels WHERE relkind IN('r','p','v','m','f')),'[]'::jsonb),
   'sequences',coalesce((SELECT jsonb_agg(jsonb_build_object('name',relname,'owner',pg_catalog.pg_get_userbyid(relowner)) ORDER BY relname COLLATE "C") FROM rels WHERE relkind='S'),'[]'::jsonb),
   'routines',coalesce((SELECT jsonb_agg(jsonb_build_object('signature',signature,'owner',pg_catalog.pg_get_userbyid(proowner)) ORDER BY signature COLLATE "C") FROM funcs),'[]'::jsonb),
   'runtimeOwnsAnyDatabaseSchemaRelationRoutine',EXISTS(SELECT 1 FROM ownership WHERE owner=$1)),
 'functions',coalesce((SELECT jsonb_agg(jsonb_build_object('signature',f.signature,'bodySha256',encode(sha256(convert_to(f.prosrc,'UTF8')),'hex'),'securityDefiner',f.prosecdef,
   'publicExecute',EXISTS(SELECT 1 FROM fn_acls x WHERE x.oid=f.oid AND x.grantee=0 AND x.privilege_type='EXECUTE'),
   'publicGrantOption',EXISTS(SELECT 1 FROM fn_acls x WHERE x.oid=f.oid AND x.grantee=0 AND x.is_grantable),
   'runtimeExecute',pg_catalog.has_function_privilege($1,f.oid,'EXECUTE'),'runtimeGrantOption',pg_catalog.has_function_privilege($1,f.oid,'EXECUTE WITH GRANT OPTION'),
   'directRuntimeExecuteGrant',EXISTS(SELECT 1 FROM fn_acls x WHERE x.oid=f.oid AND pg_catalog.pg_get_userbyid(x.grantee)=$1),
   'unexpectedGrantees',ARRAY(SELECT DISTINCT CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END FROM fn_acls x WHERE x.oid=f.oid AND x.grantee<>0 AND pg_catalog.pg_get_userbyid(x.grantee)<>$2 ORDER BY 1),
   'aclGrantors',ARRAY(SELECT DISTINCT pg_catalog.pg_get_userbyid(x.grantor) FROM fn_acls x WHERE x.oid=f.oid ORDER BY 1),
   'sentinelExecute',pg_catalog.has_function_privilege($3,f.oid,'EXECUTE'),'preparationExecute',pg_catalog.has_function_privilege($4,f.oid,'EXECUTE'),
   'ownerExecute',pg_catalog.has_function_privilege($2,f.oid,'EXECUTE'),'adminExecute',pg_catalog.has_function_privilege($5,f.oid,'EXECUTE')) ORDER BY f.signature COLLATE "C") FROM funcs f),'[]'::jsonb)
 ) AS boundary,
 coalesce((SELECT jsonb_agg(jsonb_build_object('signature',f.signature,'grantee',x.grantee::text,'grantor',x.grantor::text)) FROM funcs f JOIN fn_acls x ON x.oid=f.oid WHERE x.is_grantable OR x.grantor<>f.proowner),'[]'::jsonb) AS function_acl_issues`;

export const POLICY_OBSERVER_QUERIES = freeze({ identity: POLICY_IDENTITY_SQL, runtimeCells: POLICY_RUNTIME_CELLS_SQL,
  runtimeFunctions: POLICY_RUNTIME_FUNCTIONS_SQL, adminBoundary: POLICY_ADMIN_BOUNDARY_SQL });

function identity(row, name, database) {
  const actual = data(row, ['session_user', 'current_user', 'database', 'pid', 'search_path', 'replication_role']);
  need(actual.session_user === name && actual.current_user === name && actual.database === database
    && Number.isSafeInteger(actual.pid) && actual.pid > 0 && actual.search_path === 'pg_catalog' && actual.replication_role === 'origin', 'ACTUAL_DIRECT_POLICY_IDENTITY_REQUIRED');
  return actual;
}

/** Query callbacks MUST be bound to already captured physical clients, fenced
 * synchronously by the host before every send. Pure mocks prove protocol only. */
const ORIGINAL_335_OBSERVATION = Object.freeze({ assertPolicy: assertFinitePolicy, compareCells: compareRuntimeCellObservations, compareBoundary: compareBoundaryObservations });
const ALIAS4_339_OBSERVATION = Object.freeze({ assertPolicy: assertAliasFourReadPolicy, compareCells: compareAliasFourCells, compareBoundary: compareAliasFourBoundary });
/** Named fixed source profiles, never caller-supplied comparison callbacks. */
export async function observeFinitePolicy(input) {
  return await observePolicyOnProfile(input, ORIGINAL_335_OBSERVATION);
}
export async function observeAliasFourPolicy(input) {
  return await observePolicyOnProfile(input, ALIAS4_339_OBSERVATION);
}
async function observePolicyOnProfile(input, profile) {
  const args = data(input, ['policy', 'runtimeQuery', 'adminQuery']), policy = profile.assertPolicy(args.policy);
  need(typeof args.runtimeQuery === 'function' && typeof args.adminQuery === 'function', 'TWO_CAPTURED_POLICY_QUERIES_REQUIRED');
  const l = policy.logical, values = [l.runtime, l.sourceOwner, l.sentinel, l.preparation, l.admin];
  const runtimeBefore = identity(one(await args.runtimeQuery(POLICY_IDENTITY_SQL, [])), l.runtime, l.database);
  const adminBefore = identity(one(await args.adminQuery(POLICY_IDENTITY_SQL, [])), l.admin, l.database);
  need(runtimeBefore.pid !== adminBefore.pid, 'SEPARATE_RUNTIME_ADMIN_CLIENTS_REQUIRED');
  const cells = rows(await args.runtimeQuery(POLICY_RUNTIME_CELLS_SQL, []));
  const cellComparison = profile.compareCells(policy, { role: runtimeBefore.current_user, cells });
  const executed = rows(await args.runtimeQuery(POLICY_RUNTIME_FUNCTIONS_SQL, []));
  const observed = jsonData(data(one(await args.adminQuery(POLICY_ADMIN_BOUNDARY_SQL, values)), ['boundary', 'function_acl_issues']));
  need(Array.isArray(observed.function_acl_issues) && observed.function_acl_issues.length === 0, 'UNREVIEWED_FUNCTION_RAW_ACL_REQUIRED_TO_BE_EMPTY');
  // SQL ordering is normalized only on observed rows, never by filtering to an
  // expected ID set. Missing/extra/duplicate cells remain visible to comparison.
  need(observed.boundary && Array.isArray(observed.boundary.explicitRuntimeGrants), 'ACTUAL_BOUNDARY_GRANTS_REQUIRED');
  observed.boundary.explicitRuntimeGrants.sort((a,b) => cellKey(a) < cellKey(b) ? -1 : cellKey(a) > cellKey(b) ? 1 : 0);
  const boundaryComparison = profile.compareBoundary(policy, observed.boundary);
  need(executed.length === observed.boundary.functions.length, 'EXACT_RUNTIME_FUNCTION_OBSERVATIONS_REQUIRED');
  const seen = new Set();
  for (const raw of executed) { const fn = data(raw, ['signature', 'execute']);
    need(typeof fn.signature === 'string' && typeof fn.execute === 'boolean' && !seen.has(fn.signature), 'CLOSED_RUNTIME_FUNCTION_OBSERVATION_REQUIRED');
    const catalog = observed.boundary.functions.find(f => f.signature === fn.signature);
    need(catalog && catalog.runtimeExecute === fn.execute, 'DIRECT_LOGIN_FUNCTION_PRIVILEGE_DIFFERS'); seen.add(fn.signature);
  }
  const adminAfter = identity(one(await args.adminQuery(POLICY_IDENTITY_SQL, [])), l.admin, l.database);
  const runtimeAfter = identity(one(await args.runtimeQuery(POLICY_IDENTITY_SQL, [])), l.runtime, l.database);
  need(adminAfter.pid === adminBefore.pid && runtimeAfter.pid === runtimeBefore.pid, 'CAPTURED_POLICY_CLIENT_CHANGED');
  return freeze({ status: 'ACTUAL_QUERY_OBSERVATIONS_MATCH_SOURCE_POLICY_NOT_CANONICAL_REVIEW_OR_ISSUER', authority: 'NONE',
    sourceFingerprint: policy.sourceFingerprint, cellComparison, boundaryComparison,
    observations: { runtimeIdentity: runtimeBefore, adminIdentity: adminBefore, cells, functions: executed, boundary: observed.boundary },
    requiresIndependentReferenceAndAcceptance: true, originalSuccessorCanonicalProbeStillRequired: true });
}
