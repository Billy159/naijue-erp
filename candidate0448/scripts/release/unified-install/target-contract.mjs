/** Source-only fresh SCHEMA-phase target binding. No connection, provisioning,
 * installation, grants, approval, or physical-client authority is created here.
 * This is a new brand/guard; historical dot target contracts remain untouched. */

const targets = new WeakMap();
const need = (ok, code) => {
  if (!ok) throw Object.assign(new TypeError(code), { code });
};
const capture = (value, keys, code) => {
  need(value !== null && typeof value === 'object'
    && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).length === keys.length, code);
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    need(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), code);
    Object.defineProperty(result, key, { value: descriptor.value, enumerable: true });
  }
  return Object.freeze(result);
};
const sqlLiteral = value => "'" + value.replaceAll("'", "''") + "'";
const safeIdentifier = value => typeof value === 'string'
  && /^[a-z_][a-z0-9_]{0,62}$/.test(value);
const decimal = (value, maximum) => typeof value === 'string'
  && /^[1-9][0-9]*$/.test(value) && value.length <= maximum.toString().length
  && BigInt(value) <= maximum;
const roleKeys = Object.freeze(['admin', 'owner', 'sentinel', 'prepare', 'runtime']);
const oldDatabases = new Set([
  'postgres', 'template0', 'template1', 'erp_rewrite_20261022_r1',
  'demo_8877_v7_r1_rehearsal_20261031_01',
]);
const oldSystemIdentifiers = new Set([
  '7701337335828107278', '7702857766154043447',
  '7702904939491061813', '7702914707883278365',
  '7703089336081934099', '7703096890285320019',
  '7703102194329098126', '7703108941652350921',
  '7703123541136058418', '7703146531489867910',
  '7703158405630191866',
]);
// OIDs and prior experiment ports may recur in a genuinely fresh cluster. The
// exact system/database/process/endpoint composite below remains the boundary.
const oldPorts = new Set([5432, 55437, 55438, 55439]);

function validPostmasterStart(value) {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\+00$/.test(value)) return false;
  const parsed = Date.parse(value.replace(' ', 'T').replace(/\+00$/, 'Z'));
  return Number.isFinite(parsed)
    && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19).replace(' ', 'T');
}

export function captureFreshTarget(input, now = Date.now()) {
  const args = capture(input, ['intent', 'birth', 'startsAt', 'expiresAt'], 'CLOSED_FRESH_TARGET_INPUT_REQUIRED');
  const intent = capture(args.intent,
    ['database', 'admin', 'owner', 'sentinel', 'prepare', 'runtime', 'host', 'port'],
    'CLOSED_FRESH_TARGET_INTENT_REQUIRED');
  need(safeIdentifier(intent.database) && !oldDatabases.has(intent.database), 'NEW_GENERIC_DATABASE_REQUIRED');
  need(roleKeys.every(key => safeIdentifier(intent[key]) && !intent[key].startsWith('pg_'))
    && new Set(roleKeys.map(key => intent[key])).size === roleKeys.length,
  'FIVE_DISTINCT_GENERIC_NON_PG_ROLES_REQUIRED');
  need(intent.host === '127.0.0.1' && Number.isInteger(intent.port)
    && intent.port > 1024 && intent.port < 65536 && !oldPorts.has(intent.port),
  'NEW_LOOPBACK_TCP_PORT_REQUIRED');
  const birth = capture(args.birth,
    ['systemIdentifier', 'databaseOid', 'postmasterStart', 'serverVersionNum'],
    'CLOSED_FRESH_TARGET_BIRTH_REQUIRED');
  need(decimal(birth.systemIdentifier, 18446744073709551615n)
    && !oldSystemIdentifiers.has(birth.systemIdentifier), 'NEW_SYSTEM_IDENTIFIER_REQUIRED');
  need(decimal(birth.databaseOid, 4294967295n), 'CANONICAL_DATABASE_OID_REQUIRED');
  need(birth.serverVersionNum === '170011' && validPostmasterStart(birth.postmasterStart),
    'EXACT_PG17_11_UTC_BIRTH_REQUIRED');
  need(Number.isSafeInteger(now) && Number.isSafeInteger(args.startsAt)
    && Number.isSafeInteger(args.expiresAt) && args.startsAt <= now && now < args.expiresAt
    && args.expiresAt > args.startsAt && args.expiresAt - args.startsAt <= 1200000,
  'FINITE_FRESH_TARGET_WINDOW_REQUIRED');
  const target = Object.freeze({ profile: 'UNIFIED_FRESH_TARGET_V1' });
  const descriptor = Object.freeze({
    format: 'UNIFIED_FRESH_TARGET_DESCRIPTOR_V1', phase: 'SCHEMA_ONLY',
    intent, birth, startsAt: args.startsAt, expiresAt: args.expiresAt,
    authority: 'TARGET_BINDING_ONLY_NOT_PHYSICAL_CLIENT_OR_APPROVAL',
  });
  targets.set(target, descriptor);
  return target;
}

export function assertFreshTarget(target) {
  need(targets.has(target), 'ORIGINAL_FRESH_TARGET_BRAND_REQUIRED');
  return target;
}

/** A JSON descriptor is evidence data, never a replacement for the private brand. */
export function targetDescriptor(target) {
  assertFreshTarget(target);
  return targets.get(target);
}

/** Execute only through the caller's independently captured, fenced admin query.
 * Runtime is intentionally absent in this SCHEMA phase. SQL clock checks remain
 * authoritative even if a previously captured descriptor is inspected later. */
export function freshTargetGuard(target, options = { requireEmpty: false }) {
  const descriptor = targetDescriptor(target);
  const { requireEmpty } = capture(options, ['requireEmpty'], 'CLOSED_FRESH_TARGET_GUARD_OPTIONS_REQUIRED');
  need(typeof requireEmpty === 'boolean', 'EXPLICIT_SCHEMA_EMPTY_FLAG_REQUIRED');
  const { intent: t, birth: b, startsAt, expiresAt } = descriptor;
  const q = sqlLiteral;
  const setupRoles = [t.admin, t.owner, t.sentinel, t.prepare].map(q).join(',');
  const noLoginRoles = [t.owner, t.sentinel, t.prepare].map(q).join(',');
  const empty = requireEmpty ? `
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname NOT IN('public','pg_catalog','information_schema','pg_toast'))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast'))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast'))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname<>'plpgsql')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl)
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_prepared_xacts)` : '';
  return `/* UNIFIED_FRESH_SCHEMA_TARGET_GUARD_NOT_CLIENT_OR_APPROVAL_AUTHORITY */
DO $unified_fresh_target$ BEGIN IF (
 current_database()=${q(t.database)} AND (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database())=${q(b.databaseOid)}
 AND current_user=${q(t.admin)} AND session_user=${q(t.admin)}
 AND pg_catalog.inet_server_addr()=inet '127.0.0.1' AND pg_catalog.inet_server_port()=${t.port}
 AND pg_catalog.pg_postmaster_start_time()::text=${q(b.postmasterStart)}
 AND (SELECT system_identifier::text FROM pg_catalog.pg_control_system())=${q(b.systemIdentifier)}
 AND pg_catalog.current_setting('server_version_num')=${q(b.serverVersionNum)}
 AND pg_catalog.current_setting('unix_socket_directories')='' AND pg_catalog.current_setting('listen_addresses')='127.0.0.1'
 AND NOT pg_catalog.pg_is_in_recovery() AND pg_catalog.current_setting('session_replication_role')='origin'
 AND extract(epoch FROM pg_catalog.clock_timestamp())*1000>=${startsAt} AND extract(epoch FROM pg_catalog.clock_timestamp())*1000<${expiresAt}
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_catalog.pg_backend_pid())
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_database WHERE datname NOT IN('postgres','template0','template1',${q(t.database)}))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE left(rolname,3)<>'pg_' AND rolname NOT IN(${setupRoles}))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=${q(t.runtime)})
 AND (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN(${noLoginRoles}))=3
 AND EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=${q(t.admin)} AND rolcanlogin AND rolsuper)
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN(${noLoginRoles}) AND (rolcanlogin OR rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolconnlimit<>0))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN(${setupRoles})) OR roleid IN(SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN(${setupRoles})))
 AND (SELECT pg_catalog.pg_get_userbyid(datdba) FROM pg_catalog.pg_database WHERE datname=current_database())=${q(t.owner)}
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_database d CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(d.datacl,pg_catalog.acldefault('d',d.datdba))) a WHERE d.datname=current_database() AND a.grantee=0)
 AND NOT pg_catalog.has_database_privilege(${q(t.sentinel)},current_database(),'CONNECT')${empty}
 ) IS DISTINCT FROM true THEN RAISE EXCEPTION 'UNIFIED_EXACT_FRESH_SCHEMA_TARGET_CHANGED'; END IF; END $unified_fresh_target$;`;
}
