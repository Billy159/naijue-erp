/** DOT NEW synthetic algorithm experiment only. No ERP/production migration/issuer. */
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer, createConnection } from 'node:net';
import { mkdir, readFile, writeFile, appendFile, lstat, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { captureData, createBudget, assertPhysicalIdentity, closedPortEvidence, runChildCommand,
  trackForeground, stopForeground, settleClient, connectCaptured, identifier, literal } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { PIPE_PYTHON, pipeCommand } from '../../../../integration/runtime26-baseline/schema-objects-only/stdin-pipe-bridge.mjs';
import { stoppedControlEvidence } from '../../legacy-cutoff/physical-send.mjs';
import { WORK, ROOT, PROPOSED, MATERIAL_DIR, SOURCE_PINS_PATH, PINS, need, SHA, settings, loadMicroContract,
  renderExactFloor, layer2Setup, RAW_ATTRIBUTES_SQL, createGlobalGate, makeMicroQuery, outcomeBoundary } from './contract.mjs';
import { assertCapturedProcess, assertInheritedRawRows } from './contract.mjs';

const PG = path.join(WORK, 'toolchain/postgresql-17/root'), BIN = path.join(PG, 'usr/lib/postgresql/17/bin');
const HELP = 'DOT synthetic only; never a production/local-user DB migration.\nnode tests/performance/opt02/current-native-stock/sequence-acl-micro/run.mjs --run-sequence-acl-micro <independently-reviewed-SOURCE-PINS-sha256>\nNo engine on import/help; controller exact physical GO required.\n';
const environment = () => ({ PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC', LD_LIBRARY_PATH: path.join(PG, 'usr/lib/x86_64-linux-gnu') });
const absent = async file => { try { await lstat(file); throw Error('NEW_MICRO_PATH_ALREADY_EXISTS:' + file); } catch (error) { if (error.code !== 'ENOENT') throw error; } };
async function canonicalBytes(file, maximum = 8 * 1024 * 1024) {
  need(typeof file === 'string' && path.isAbsolute(file) && path.resolve(file) === file, 'CANONICAL_PRIMITIVE_MICRO_FILE_REQUIRED');
  const before = await lstat(file);
  need(before.isFile() && !before.isSymbolicLink() && before.size <= maximum && await realpath(file) === file, 'NONSYMLINK_REGULAR_MICRO_FILE_REQUIRED');
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const captured = await fd.stat(); need(captured.dev === before.dev && captured.ino === before.ino, 'MICRO_FILE_DESCRIPTOR_CHANGED');
    const bytes = await fd.readFile(), after = await lstat(file);
    need(after.isFile() && !after.isSymbolicLink() && after.dev === before.dev && after.ino === before.ino
      && after.size === before.size && bytes.length === before.size && await realpath(file) === file, 'MICRO_FILE_CHANGED_DURING_READ');
    return bytes;
  } finally { await fd.close(); }
}
async function pinned(file, sha, binary = false) {
  const bytes = await canonicalBytes(file, binary ? 256 * 1024 * 1024 : 8 * 1024 * 1024);
  need(SHA(bytes) === sha, 'PINNED_MICRO_SOURCE_OR_BINARY_CHANGED:' + file); return bytes;
}
async function sourcePins(trustedSha) {
  const raw = await pinned(SOURCE_PINS_PATH, trustedSha), value = JSON.parse(raw.toString('utf8'));
  need(value.format === 'DOT_SEQUENCE_ACL_MICRO_SOURCE_PINS_V1' && Array.isArray(value.files)
    && Array.isArray(value.aliases) && value.files.length > 10, 'INDEPENDENT_COMPLETE_MICRO_SOURCE_PINS_REQUIRED');
  const receiptPath = path.join(WORK, 'toolchain/postgresql-17/receipts/TOOLCHAIN-RESTORED.json');
  const receipt = JSON.parse((await pinned(receiptPath, PINS.toolchainReceipt)).toString('utf8'));
  const hostLibraries = new Map(receipt.runtimeSharedLibraries.map(file => [file.path, file.sha256]));
  const pythonRealpath = await realpath(PIPE_PYTHON), nodeRealpath = await realpath(process.execPath);
  const originalProbePath = path.join(WORK, 'development-results-20261031/current-runtime-feasibility-independent-review/offline-four-leaf-v2/ORIGINAL-PROBE.sql');
  const paths = new Set();
  for (const input of value.files) {
    const row = captureData(input, ['path', 'sha256', 'kind']);
    need(typeof row.path === 'string' && path.isAbsolute(row.path) && path.resolve(row.path) === row.path
      && typeof row.sha256 === 'string' && /^[a-f0-9]{64}$/.test(row.sha256) && ['source', 'binary'].includes(row.kind)
      && !paths.has(row.path) && row.path !== SOURCE_PINS_PATH, 'CLOSED_UNIQUE_MICRO_SOURCE_PIN_REQUIRED');
    need(row.path.startsWith(ROOT) || row.path.startsWith(path.join(WORK, 'toolchain') + path.sep)
      || row.path.startsWith(MATERIAL_DIR + path.sep) || row.path === originalProbePath
      || row.kind === 'binary' && (row.path === pythonRealpath || row.path === nodeRealpath || hostLibraries.get(row.path) === row.sha256),
    'MICRO_PIN_OUTSIDE_REVIEWED_SOURCE_AND_BINARY_SCOPE');
    paths.add(row.path); await pinned(row.path, row.sha256, row.kind === 'binary');
  }
  const mandatory = ['contract.mjs', 'run.mjs', 'offline.test.mjs', 'README.md'].map(name =>
    path.join(ROOT, 'tests/performance/opt02/current-native-stock/sequence-acl-micro', name));
  mandatory.push(path.join(ROOT, 'package.json'), path.join(ROOT, 'package-lock.json'),
    path.join(ROOT, 'adapters/postgres/src/native-import-accounting-capability.ts'),
    path.join(MATERIAL_DIR, 'SEQUENCE-SYSTEM-ATTRIBUTE-BLOCKER-AND-MICRO-PLAN-v1.json'),
    path.join(MATERIAL_DIR, 'EXACT-ORIGINAL-PROBE-FRAGMENTS-v1.json'),
    originalProbePath, receiptPath, ...hostLibraries.keys(),
    ...['postgres', 'initdb', 'pg_controldata'].map(name => path.join(BIN, name)), await realpath(process.execPath), pythonRealpath);
  need(mandatory.every(file => paths.has(file)), 'MANDATORY_MICRO_SOURCE_BINARY_LOCK_PINS_REQUIRED');
  for (const input of value.aliases) {
    const row = captureData(input, ['path', 'target']);
    need(typeof row.path === 'string' && path.isAbsolute(row.path) && path.resolve(row.path) === row.path
      && typeof row.target === 'string' && path.isAbsolute(row.target) && paths.has(row.target)
      && value.files.find(file => file.path === row.target)?.kind === 'binary'
      && (row.path.startsWith(PG + path.sep) || row.path === PIPE_PYTHON || row.path === process.execPath)
      && await realpath(row.path) === row.target, 'EXACT_APPROVED_MICRO_BINARY_ALIAS_REQUIRED');
  }
  need(value.aliases.some(alias => alias.path === PIPE_PYTHON && alias.target === pythonRealpath), 'EXPLICIT_PYTHON_ALIAS_BINDING_REQUIRED');
  return { raw, value, sha256: trustedSha };
}
async function physical(file) {
  const stat = await lstat(file);
  need(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o700
    && await realpath(file) === file, 'OWNED_PRIVATE_CANONICAL_MICRO_0700_REQUIRED');
  return Object.freeze({ path: file, uid: stat.uid, mode: stat.mode & 0o777, device: stat.dev, inode: stat.ino, canonical: true, symbolicLink: false });
}
async function freePort(port) {
  await new Promise((resolve, reject) => { const server = createServer(); server.once('error', reject);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(resolve)); });
}
async function portProbe(port) {
  return await new Promise(resolve => { let done = false; const socket = createConnection({ host: '127.0.0.1', port });
    const finish = result => { if (!done) { done = true; socket.destroy(); resolve(result); } };
    socket.setTimeout(1000); socket.once('connect', () => finish({ state: 'OPEN' }));
    socket.once('error', error => finish(closedPortEvidence(error.code))); socket.once('timeout', () => finish({ state: 'UNKNOWN', reason: 'TIMEOUT' })); });
}
async function ownedPostmaster(data, startsAt, pid) {
  try {
    const lines = (await readFile(path.join(data, 'postmaster.pid'), 'utf8')).trimEnd().split('\n');
    need(Number(lines[0]) === pid && lines[1] === data && Number(lines[2]) >= Math.floor(startsAt / 1000) - 1, 'OWNED_MICRO_PIDFILE_REQUIRED');
    const stat = await lstat('/proc/' + pid), argv = (await readFile('/proc/' + pid + '/cmdline', 'utf8')).split('\0');
    need(stat.uid === process.getuid() && argv[0] === path.join(BIN, 'postgres') && argv[argv.indexOf('-D') + 1] === data,
      'OWNED_FOREGROUND_MICRO_PROCESS_REQUIRED'); return { pid, pidFile: lines };
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
const safeError = error => ({ name: error?.name, code: error?.code, message: error?.message,
  ...(error?.cause ? { cause: safeError(error.cause) } : {}) });

async function runMicro(options) {
  const budget = createBudget(Date.now(), 300000);
  need(process.versions.node === '24.21.0' && !process.env.NODE_OPTIONS && !process.env.NODE_PATH
    && process.env.NODE_PG_FORCE_NATIVE === undefined, 'EXACT_NODE24_NO_PRELOAD_OR_NATIVE_DRIVER_REQUIRED');
  const captured = captureData(options, Object.keys({ ...PROPOSED, trustedSourceManifestSha256: '' }));
  need(Object.keys(PROPOSED).every(key => captured[key] === PROPOSED[key]), 'EXACT_NEW_DOT_MICRO_TARGET_ONLY');
  const pins = await sourcePins(captured.trustedSourceManifestSha256); budget.remaining();
  const contract = loadMicroContract({
    planText: (await pinned(path.join(MATERIAL_DIR, 'SEQUENCE-SYSTEM-ATTRIBUTE-BLOCKER-AND-MICRO-PLAN-v1.json'), PINS.plan)).toString('utf8'),
    fragmentText: (await pinned(path.join(MATERIAL_DIR, 'EXACT-ORIGINAL-PROBE-FRAGMENTS-v1.json'), PINS.fragments)).toString('utf8'),
    probeText: (await pinned(path.join(WORK, 'development-results-20261031/current-runtime-feasibility-independent-review/offline-four-leaf-v2/ORIGINAL-PROBE.sql'), PINS.originalProbe)).toString('utf8'),
  });
  await pinned(path.join(ROOT, 'adapters/postgres/src/native-import-accounting-capability.ts'), PINS.originalNativeSource);
  const floor = renderExactFloor(contract), base = PROPOSED.base, data = path.join(base, 'data');
  for (const upstream of contract.upstream.files) {
    const file = path.join(WORK, upstream.localPath);
    need(pins.value.files.some(pin => pin.path === file && pin.sha256 === upstream.sha256), 'ALL_THREE_OFFICIAL_C_DOCUMENTS_MUST_BE_SOURCE_PINNED');
    await pinned(file, upstream.sha256);
  }
  await absent(base); await freePort(PROPOSED.port); budget.remaining(); await mkdir(base, { mode: 0o700 });
  const baseBirth = await physical(base); let dataBirth = null;
  await writeFile(path.join(base, 'MICRO_ATTEMPT_STARTED'), JSON.stringify({ atUtc: new Date().toISOString(), pid: process.pid,
    sourceManifestSha256: pins.sha256, id: PROPOSED.id }) + '\n', { flag: 'wx', mode: 0o600 });
  const adminPassword = randomBytes(32).toString('base64url'), observerPassword = randomBytes(32).toString('base64url');
  const redact = input => [adminPassword, observerPassword].reduce((text, secret) => text.replaceAll(secret, '[REDACTED]'), String(input));
  const save = (name, value) => { need(/^[a-zA-Z0-9_.-]+$/.test(name), 'CLOSED_MICRO_EVIDENCE_NAME_REQUIRED');
    return writeFile(path.join(base, name), redact(typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'), { flag: 'wx', mode: 0o600 }); };
  const gate = createGlobalGate(), clients = [], allowedPids = new Set();
  const result = { format: 'DOT_SEQUENCE_ACL_MICRO_ACTUAL_V1', status: 'IN_PROGRESS_NOT_AUTHORITY',
    scope: 'PG_PERMISSION_AND_ORIGINAL_FRAGMENT_ALGORITHM_ONLY_NOT_ERP_OR_ISSUER_OR_PRODUCTION',
    startsAt: budget.startsAt, expiresAt: budget.expiresAt, sourceManifestSha256: pins.sha256,
    targetProposal: PROPOSED, clientClosures: [], completedCases: [], predictionsAreNotObservations: true };
  let admin = null, observer = null, adminQuery = null, observerQuery = null, target = null;
  let birthId = null, foreground = null, postmaster = null, transaction = false, cleanup = false, firstFailure = null;
  let configPins = null, databaseRestricted = false;
  const birthCheck = async () => {
    assertPhysicalIdentity(baseBirth, await physical(base)); if (dataBirth) assertPhysicalIdentity(dataBirth, await physical(data));
  };
  const physicalCheck = async () => {
    await birthCheck();
    if (configPins) for (const [name, sha] of Object.entries(configPins)) await pinned(path.join(data, name), sha);
  };
  const unchanged = async () => { budget.remaining(); await physicalCheck(); await sourcePins(pins.sha256); budget.remaining(); };
  const command = async (executable, args, input = '', timeout = 30000, cleaning = false) => {
    if (cleaning) await birthCheck(); else { await physicalCheck(); budget.remaining(); }
    const executableRealpath = await realpath(executable), alias = pins.value.aliases.find(alias => alias.path === executable);
    need(alias ? alias.target === executableRealpath : executable === executableRealpath, 'MICRO_EXECUTABLE_ALIAS_CHANGED');
    const record = pins.value.files.find(file => file.path === executableRealpath);
    need(record && record.kind === 'binary', 'PINNED_MICRO_NATIVE_EXECUTABLE_REQUIRED'); await pinned(record.path, record.sha256, true);
    return runChildCommand(spawn, executable, args, { cwd: ROOT, env: environment(), input,
      timeoutMs: Math.min(timeout, cleaning ? timeout : budget.remaining()), sanitize: redact });
  };
  const close = async client => { if (!client) return; const receipt = await settleClient(client); result.clientClosures.push(receipt); return receipt; };
  const connect = async (database, user, password, isAdmin) => {
    const client = await connectCaptured(() => new Client({ host: PROPOSED.host, port: PROPOSED.port, database, user, password,
      ssl: false, application_name: 'dot-sequence-acl-micro', connectionTimeoutMillis: Math.min(5000, budget.remaining()),
      query_timeout: 5000, statement_timeout: 5000, lock_timeout: 2000, idle_in_transaction_session_timeout: 20000,
      options: '-c search_path=pg_catalog' + (isAdmin ? ' -c session_replication_role=origin' : '') }),
    receipt => result.clientClosures.push(receipt));
    clients.push(client); return client;
  };
  const commit = () => outcomeBoundary(gate, () => adminQuery('COMMIT'), 'MICRO_COMMIT_OUTCOME_UNKNOWN_NO_REPLAY');
  async function mutation(label, statements, optionalColumn = false) {
    await unchanged(); await guard(); let attempted = false;
    try {
      await adminQuery('BEGIN'); transaction = true; await adminQuery(`SET LOCAL ROLE ${identifier(PROPOSED.owner)}`);
      for (const sql of statements) await adminQuery(sql);
      await adminQuery('RESET ROLE'); await guard(); attempted = true; await commit(); transaction = false;
      return { label, supported: true, acknowledged: true };
    } catch (error) {
      if (gate.quarantined() || attempted) throw error;
      if (transaction) { try { await adminQuery('ROLLBACK'); transaction = false; }
        catch (rollback) { throw new AggregateError([error, rollback], 'MICRO_MUTATION_AND_ROLLBACK_FAILED', { cause: error }); } }
      if (optionalColumn && ['0A000', '0LP01', '42809'].includes(error.code))
        return { label, supported: false, sqlstate: error.code, message: error.message, acknowledged: false, rollbackAcknowledged: true };
      throw error;
    }
  }
  async function guard() {
    need(gate.quarantined() === false, 'NO_MICRO_GUARD_AFTER_UNKNOWN'); budget.remaining(); await physicalCheck();
    const row = (await adminQuery(`SELECT (SELECT system_identifier::text FROM pg_control_system()) id,current_database() db,
      (SELECT oid::text FROM pg_database WHERE datname=current_database()) db_oid,
      (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) db_owner,
      current_user acting,session_user session,current_setting('data_directory') data,pg_postmaster_start_time()::text start,
      inet_server_addr()=inet '127.0.0.1' address_match,inet_server_port() port,current_setting('server_version_num') version,
      current_setting('session_replication_role') origin,pg_is_in_recovery() recovery,
      (SELECT count(*)::int FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>ALL($1::int[])) other_clients,
      (SELECT count(*)::int FROM pg_roles WHERE left(rolname,3)<>'pg_' AND rolname<>ALL($2::text[])) foreign_roles,
      (SELECT count(*)::int FROM pg_roles WHERE rolname=ANY($2::text[])) owned_role_count,
      (SELECT rolsuper AND rolcanlogin FROM pg_roles WHERE rolname=$3::text) admin_ok,
      (SELECT NOT(rolsuper OR rolcanlogin OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)
        AND rolconnlimit=0 FROM pg_roles WHERE rolname=$4::text) owner_ok,
      (SELECT rolcanlogin AND NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)
        AND rolconnlimit=2 FROM pg_roles WHERE rolname=$5::text) observer_ok,
      NOT EXISTS(SELECT 1 FROM pg_database WHERE datname NOT IN('postgres','template0','template1',$6::text)) databases_ok,
      NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='naijue_erp' AND pg_get_userbyid(nspowner)<>$4::text) schema_owner_ok,
      (SELECT count(*)::int FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
        WHERE d.datname=current_database() AND a.grantee=0) public_database_acl,
      (SELECT count(*)::int FROM pg_auth_members WHERE member IN(SELECT oid FROM pg_roles WHERE rolname=ANY($2::text[]))
        OR roleid IN(SELECT oid FROM pg_roles WHERE rolname=ANY($2::text[]))) memberships`,
    [[...allowedPids], [PROPOSED.admin, PROPOSED.owner, PROPOSED.observer], PROPOSED.admin, PROPOSED.owner, PROPOSED.observer, PROPOSED.database])).rows[0];
    need(row && row.id === birthId && row.db === PROPOSED.database && row.acting === PROPOSED.admin && row.session === PROPOSED.admin
      && row.db_oid === target.databaseOid && row.db_owner === PROPOSED.owner
      && row.data === data && row.start === target.postmasterStart && row.address_match === true && row.port === PROPOSED.port
      && row.version === '170011' && row.origin === 'origin' && row.recovery === false && row.other_clients === 0
      && row.foreign_roles === 0 && row.owned_role_count === 3 && row.admin_ok === true && row.owner_ok === true && row.observer_ok === true
      && row.databases_ok === true && row.schema_owner_ok === true && (!databaseRestricted || row.public_database_acl === 0)
      && row.memberships === 0, 'EXACT_MICRO_PHYSICAL_SESSION_AND_EXCLUSIVE_CLIENTS_REQUIRED');
  }
  async function observe(label, useFloor = false) {
    await guard();
    const identity = (await observerQuery(`SELECT current_user acting,session_user session,current_database() db,
      pg_backend_pid() pid,inet_server_addr()=inet '127.0.0.1' address_match,inet_server_port() port,
      current_setting('session_replication_role') origin,
      (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=current_user) extra_authority,
      (SELECT pg_get_userbyid(datdba)=current_user FROM pg_database WHERE datname=current_database()) database_owner`)).rows[0];
    need(identity && identity.acting === PROPOSED.observer && identity.session === PROPOSED.observer && identity.db === PROPOSED.database
      && allowedPids.has(identity.pid) && identity.address_match === true && identity.port === PROPOSED.port && identity.origin === 'origin'
      && identity.extra_authority === false && identity.database_owner === false, 'GENUINE_LOW_PRIVILEGE_MICRO_LOGIN_REQUIRED');
    const raw = (await observerQuery(RAW_ATTRIBUTES_SQL)).rows;
    let floorResult = null;
    if (useFloor) { const answer = await observerQuery(floor.sql); need(answer.rows.length === 1, 'ONE_EXACT_MICRO_FLOOR_ROW_REQUIRED'); floorResult = answer.rows[0]; }
    const record = { label, scope: result.scope, identity, raw, ...(useFloor ? { floor: floorResult,
      exactOriginalWrapperSha256: floor.sha256 } : {}) };
    await save(label + '.json', record); result.completedCases.push(label); return record;
  }
  function assertRaw(record, wantedSelect, wantedUpdate) {
    assertInheritedRawRows(record.raw, wantedSelect, wantedUpdate);
  }
  function assertFloor(record, count, wanted) {
    need(Array.isArray(record.floor?.system_column_acls) && record.floor.system_column_acls.length === count
      && record.floor.complete_write_system_acl_match_v8 === wanted, 'ACTUAL_ORIGINAL_FLOOR_DIFFERS_FROM_PREDICTION:' + record.label);
  }
  const seq = `naijue_erp.${identifier('supplier_code_sequence')}`, role = identifier(PROPOSED.observer);
  const revokeSeq = `REVOKE ALL PRIVILEGES ON SEQUENCE ${seq} FROM ${role}`;
  try {
    await save('source-pins-ack.json', { sha256: pins.sha256, files: pins.value.files.length, aliases: pins.value.aliases.length });
    await save('exact-original-wrapper.sql', floor.sql); await save('exact-original-wrapper-binding.json', { ...floor, sql: undefined });
    const init = pipeCommand(path.join(BIN, 'initdb'), ['-D', data, '-L', path.join(PG, 'usr/share/postgresql/17'), '-U', PROPOSED.admin,
      '--auth-local=reject', '--auth-host=scram-sha-256', '--pwfile=/dev/stdin', '--encoding=UTF8', '--locale=C']);
    const initialized = await command(init.executable, init.args, adminPassword + '\n', 60000);
    await save('initdb.json', initialized); need(initialized.code === 0 && !initialized.timedOut && !initialized.spawnError, 'NEW_MICRO_INITDB_FAILED');
    dataBirth = await physical(data);
    await appendFile(path.join(data, 'postgresql.conf'), `\nlisten_addresses='127.0.0.1'\nport=${PROPOSED.port}\nunix_socket_directories=''\nmax_connections=8\nshared_buffers='16MB'\nwork_mem='2MB'\ntimezone='UTC'\nlog_timezone='UTC'\nlogging_collector=off\nlog_statement='none'\nlog_min_error_statement=panic\nlog_error_verbosity=terse\n`);
    await writeFile(path.join(data, 'pg_hba.conf'), `local all all reject\nhost postgres ${PROPOSED.admin} 127.0.0.1/32 scram-sha-256\nhost ${PROPOSED.database} ${PROPOSED.admin} 127.0.0.1/32 scram-sha-256\nhost ${PROPOSED.database} ${PROPOSED.observer} 127.0.0.1/32 scram-sha-256\nhost all all 0.0.0.0/0 reject\nhost all all ::0/0 reject\n`, { mode: 0o600 });
    configPins = { 'postgresql.conf': SHA(await canonicalBytes(path.join(data, 'postgresql.conf'))),
      'pg_hba.conf': SHA(await canonicalBytes(path.join(data, 'pg_hba.conf'))) };
    const control = await command(path.join(BIN, 'pg_controldata'), [data]); await save('birth-control.txt', control.stdout);
    need(control.code === 0 && !control.timedOut, 'MICRO_BIRTH_CONTROL_REQUIRED'); birthId = control.stdout.match(/^Database system identifier:\s+([0-9]+)$/m)?.[1];
    need(birthId && !['7703007244289476775','7702980619903721547','7702952985003487270'].includes(birthId), 'NEW_INDEPENDENT_MICRO_SYSTEM_ID_REQUIRED');
    await unchanged(); const log = await open(path.join(base, 'postgres.log'), 'wx', 0o600);
    try { foreground = trackForeground(spawn(path.join(BIN, 'postgres'), ['-D', data], { cwd: ROOT, env: environment(), stdio: ['ignore', log.fd, log.fd] })); }
    finally { await log.close(); }
    need(Number.isInteger(foreground.child.pid) && foreground.child.pid > 1, 'OWNED_DIRECT_MICRO_CHILD_REQUIRED');
    const readyUntil = Math.min(budget.expiresAt, Date.now() + 30000);
    while (Date.now() < readyUntil) { budget.remaining(); await physicalCheck(); need(!foreground.state().closed && !foreground.state().error, 'MICRO_FOREGROUND_START_FAILED');
      const own = await ownedPostmaster(data, budget.startsAt, foreground.child.pid); if (own?.pidFile[7]?.trim() === 'ready') { postmaster = own; break; }
      await new Promise(resolve => setTimeout(resolve, 25)); }
    need(postmaster, 'MICRO_FOREGROUND_READY_DEADLINE');
    await save('birth-receipt.json', { baseBirth, dataBirth, systemIdentifier: birthId, postmaster, directChildPid: foreground.child.pid,
      configSha256: SHA(await readFile(path.join(data, 'postgresql.conf'))), hbaSha256: SHA(await readFile(path.join(data, 'pg_hba.conf'))), tcpOnly: true });
    admin = await connect('postgres', PROPOSED.admin, adminPassword, true); adminQuery = makeMicroQuery(admin, gate, budget, () => cleanup);
    const bootstrap = (await adminQuery(`SELECT (SELECT system_identifier::text FROM pg_control_system()) id,current_setting('data_directory') data,
      current_setting('server_version_num') version,inet_server_addr()=inet '127.0.0.1' address_match,inet_server_port() port,
      current_setting('unix_socket_directories') sockets`)).rows[0]; await save('bootstrap-identity.json', bootstrap);
    need(bootstrap.id === birthId && bootstrap.data === data && bootstrap.version === '170011' && bootstrap.address_match === true
      && bootstrap.port === PROPOSED.port && bootstrap.sockets === '', 'MICRO_DIRECT_BIRTH_MISMATCH');
    await adminQuery('BEGIN'); transaction = true;
    await adminQuery(`CREATE ROLE ${identifier(PROPOSED.owner)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 0`);
    await adminQuery(`CREATE ROLE ${role} LOGIN PASSWORD ${literal(observerPassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2`);
    await commit(); transaction = false;
    await outcomeBoundary(gate, () => adminQuery(`CREATE DATABASE ${identifier(PROPOSED.database)} OWNER ${identifier(PROPOSED.owner)} TEMPLATE template0 ENCODING 'UTF8'`), 'MICRO_NONTRANSACTIONAL_OUTCOME_UNKNOWN_NO_REPLAY');
    need((await close(admin)).confirmed, 'BOOTSTRAP_MICRO_CLIENT_CLOSE_REQUIRED'); admin = null;
    admin = await connect(PROPOSED.database, PROPOSED.admin, adminPassword, true); adminQuery = makeMicroQuery(admin, gate, budget, () => cleanup);
    const identity = (await adminQuery(`SELECT pg_backend_pid() pid,pg_postmaster_start_time()::text start,(SELECT oid::text FROM pg_database WHERE datname=current_database()) oid`)).rows[0];
    need(identity && Number.isInteger(identity.pid) && identity.pid > 1 && typeof identity.oid === 'string'
      && /^[1-9][0-9]*$/.test(identity.oid) && typeof identity.start === 'string'
      && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\+00$/.test(identity.start), 'CAPTURED_TYPED_MICRO_DB_PID_AND_START_REQUIRED');
    allowedPids.add(identity.pid); target = { systemIdentifier: birthId, database: PROPOSED.database, databaseOid: identity.oid,
      postmasterStart: identity.start, admin: PROPOSED.admin, owner: PROPOSED.owner, observer: PROPOSED.observer, port: PROPOSED.port };
    await save('target-identity.json', target);
    await mutation('M0_EMPTY_FIXTURE', [
      `REVOKE ALL ON DATABASE ${identifier(PROPOSED.database)} FROM PUBLIC`,
      `GRANT CONNECT ON DATABASE ${identifier(PROPOSED.database)} TO ${role}`,
      `CREATE SCHEMA naijue_erp AUTHORIZATION ${identifier(PROPOSED.owner)}`,
      `GRANT USAGE ON SCHEMA naijue_erp TO ${role}`,
      'CREATE TABLE naijue_erp.micro_extra (id integer)', 'CREATE SEQUENCE naijue_erp.supplier_code_sequence',
    ]);
    databaseRestricted = true;
    observer = await connect(PROPOSED.database, PROPOSED.observer, observerPassword, false); observerQuery = makeMicroQuery(observer, gate, budget, () => cleanup);
    const observerPid = (await observerQuery('SELECT pg_backend_pid() pid')).rows[0].pid;
    need(Number.isInteger(observerPid) && observerPid > 1 && !allowedPids.has(observerPid), 'CAPTURED_TYPED_DISTINCT_MICRO_OBSERVER_PID_REQUIRED');
    allowedPids.add(observerPid);
    assertRaw(await observe('M1_BASE'), false, false);
    await mutation('M1_SEQUENCE_SELECT', [`GRANT SELECT ON SEQUENCE ${seq} TO ${role}`]); assertRaw(await observe('M1_SEQUENCE_SELECT'), true, false);
    await mutation('M1_SEQUENCE_UPDATE', [revokeSeq, `GRANT UPDATE ON SEQUENCE ${seq} TO ${role}`]); assertRaw(await observe('M1_SEQUENCE_UPDATE'), false, true);
    await mutation('M1_SEQUENCE_SU', [`GRANT SELECT ON SEQUENCE ${seq} TO ${role}`]); const su = await observe('M1_SEQUENCE_SU'); assertRaw(su, true, true);
    const before = (await observerQuery('SELECT last_value::text last_value,is_called FROM naijue_erp.supplier_code_sequence')).rows[0];
    const allocated = await outcomeBoundary(gate, () => observerQuery("SELECT setval('naijue_erp.supplier_code_sequence'::regclass,7,true)::text allocated"), 'MICRO_NONTRANSACTIONAL_OUTCOME_UNKNOWN_NO_REPLAY');
    const after = (await observerQuery('SELECT last_value::text last_value,is_called FROM naijue_erp.supplier_code_sequence')).rows[0];
    await save('M1_SEQUENCE_SU_SETVAL.json', { before, allocated: allocated.rows, after, sequenceEffectsDoNotRollback: true });
    need(before.last_value === '1' && before.is_called === false && allocated.rows[0].allocated === '7' && after.last_value === '7' && after.is_called === true, 'FINITE_MICRO_SETVAL_ACK_REQUIRED');
    await mutation('M1_SEQUENCE_USAGE_CONTROL', [revokeSeq, `GRANT USAGE ON SEQUENCE ${seq} TO ${role}`]); assertRaw(await observe('M1_SEQUENCE_USAGE_CONTROL'), false, false);
    await mutation('M1_ZERO_SEQUENCE', [revokeSeq]);
    const column = await mutation('M1_EXPLICIT_SEQUENCE_NEGATIVE_COLUMN', [`GRANT SELECT (xmin) ON TABLE ${seq} TO ${role}`], true);
    await save('M1_EXPLICIT_SEQUENCE_GRANT_OUTCOME.json', column); result.explicitSequenceColumnGrantSupported = column.supported;
    const raw1 = await observe('M1_EXPLICIT_SEQUENCE_NEGATIVE_COLUMN');
    if (column.supported) {
      need(raw1.raw.some(row => row.kind === 'S' && row.name === 'xmin' && row.runtime_select === true && row.raw_column_privileges.some(p => p.grantee === PROPOSED.observer && p.privilege === 'SELECT' && p.grantable === false)), 'EXPLICIT_SEQUENCE_RAW_ACL_MUST_BE_OBSERVED');
      await mutation('M1_RAW_GRANT_OPTION', [`GRANT SELECT (xmin,xmax) ON TABLE ${seq} TO ${role} WITH GRANT OPTION`]);
      const options = await observe('M1_RAW_GRANT_OPTION');
      need(options.raw.filter(row => row.kind === 'S' && ['xmin','xmax'].includes(row.name)).every(row => row.raw_column_privileges.some(p => p.grantee === PROPOSED.observer && p.grantable === true)), 'RAW_SEQUENCE_GRANT_OPTION_MUST_BE_OBSERVED');
      await mutation('M1_RAW_REVOKE', [`REVOKE SELECT (xmin,xmax) ON TABLE ${seq} FROM ${role}`]);
    }
    await mutation('M2_BASELINE_SETUP', layer2Setup(contract)); assertFloor(await observe('M2_EXACT_25_BASELINE', true), 25, true);
    await mutation('M2_SEQUENCE_SU_ADD', [`GRANT SELECT,UPDATE ON SEQUENCE ${seq} TO ${role}`]); assertFloor(await observe('M2_SEQUENCE_SU_ADD', true), 31, false);
    await mutation('M2_EXTRA_TABLE_NEGATIVE', [revokeSeq, `GRANT SELECT (xmin) ON TABLE naijue_erp.micro_extra TO ${role}`]); assertFloor(await observe('M2_EXTRA_TABLE_NEGATIVE', true), 26, false);
    await mutation('M2_TABLE_RELATION_OVERGRANT', [`REVOKE SELECT (xmin) ON TABLE naijue_erp.micro_extra FROM ${role}`, `GRANT SELECT ON TABLE naijue_erp.color TO ${role}`]); assertFloor(await observe('M2_TABLE_RELATION_OVERGRANT', true), 30, false);
    await mutation('M2_MISSING_COLUMN', [`REVOKE SELECT ON TABLE naijue_erp.color FROM ${role}`, `REVOKE SELECT (xmin) ON TABLE naijue_erp.color FROM ${role}`]); assertFloor(await observe('M2_MISSING_COLUMN', true), 25, false);
    await mutation('M2_RESTORE_REQUIRED_COLUMN', [`GRANT SELECT (xmin) ON TABLE naijue_erp.color TO ${role}`]);
    if (column.supported) { await mutation('M2_SEQUENCE_EXPLICIT_RAW', [`GRANT SELECT (xmin) ON TABLE ${seq} TO ${role}`]);
      assertFloor(await observe('M2_SEQUENCE_EXPLICIT_RAW', true), 26, false);
      await mutation('M2_REVOKE_EXPLICIT_RAW', [`REVOKE SELECT (xmin) ON TABLE ${seq} FROM ${role}`]);
    } else await save('M2_SEQUENCE_EXPLICIT_RAW_UNSUPPORTED.json', { skippedOnlyConditionalRawCase: true, reason: column, notCalledSuccessful: true });
    await unchanged(); result.sourcePredictionsConfirmedWithinExecutedCases = true; result.inheritedSequenceInflationConfirmed = true;
    result.originalTableExtraOvergrantMissingNegativesPreserved = true; result.noErpOrIssuerOrBusinessOrProductionExecution = true;
  } catch (error) {
    firstFailure = error; result.firstFailure = safeError(error); await save('first-failure.json', result.firstFailure).catch(() => {});
  } finally {
    cleanup = true;
    if (observer) { const receipt = await close(observer); result.observerClosed = receipt?.confirmed === true; observer = null; }
    if (admin) {
      if (gate.quarantined()) result.cleanupSqlSkippedForUnknownOutcome = true;
      else try {
        if (transaction) { await adminQuery('ROLLBACK'); transaction = false; }
        await adminQuery('RESET ROLE');
        const state = (await adminQuery(`SELECT (SELECT system_identifier::text FROM pg_control_system()) id,current_setting('data_directory') data,
          pg_postmaster_start_time()::text start,(SELECT count(*)::int FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()) other_clients`)).rows[0];
        need(state.id === birthId && state.data === data && (!target || state.start === target.postmasterStart), 'MICRO_CLEANUP_SERVER_IDENTITY_CHANGED'); result.otherClients = state.other_clients;
      } catch (error) { result.cleanupObservationFailure = safeError(error); }
      await close(admin); admin = null;
    }
    if (gate.quarantined()) result.firstUnknownOutcome = safeError(gate.reason());
    try {
      // Configuration drift refuses SQL, not stopping our captured child. The
      // stop-specific proof requires private directory birth and the held child.
      await birthCheck();
      if (foreground) {
        if (!foreground.state().closed) {
          // Startup can fail before postmaster.pid exists. Stop only the held
          // foreground child proved by /proc +private birth, never a PID from a file.
          const pid = foreground.child.pid, stat = await lstat('/proc/' + pid);
          const argv = (await readFile('/proc/' + pid + '/cmdline', 'utf8')).split('\0');
          result.stopIdentity = assertCapturedProcess({ capturedPid: pid, observedPid: pid, processUid: stat.uid,
            expectedUid: process.getuid(), executable: argv[0], expectedExecutable: path.join(BIN, 'postgres'),
            dataArg: argv[argv.indexOf('-D') + 1], expectedData: data });
        }
        const stop = await stopForeground(foreground); await save('stop.json', stop);
        result.stopExitCode = stop.code === 0 && !stop.error && !stop.forced ? 0 : 1; result.foregroundDefinitiveClose = stop.definitiveClose;
      } else result.foregroundNeverSpawned = true;
    } catch (error) { result.stopIdentityRefused = safeError(error); }
    for (let index = 0; index < 40 && foreground; index++) { try { await lstat('/proc/' + foreground.child.pid); await new Promise(resolve => setTimeout(resolve, 50)); }
      catch (error) { if (error.code === 'ENOENT') break; result.processObservationFailure = safeError(error); break; } }
    result.portProbe = await portProbe(PROPOSED.port);
    try { await lstat(path.join(data, 'postmaster.pid')); result.pidFileAbsent = false; } catch (error) { result.pidFileAbsent = error.code === 'ENOENT'; }
    if (foreground) { try { await lstat('/proc/' + foreground.child.pid); result.processAbsent = false; } catch (error) { result.processAbsent = error.code === 'ENOENT'; } }
    try { const control = await command(path.join(BIN, 'pg_controldata'), [data], '', 30000, true); await save('control-after.txt', control.stdout);
      result.stoppedControlEvidence = stoppedControlEvidence({ stdout: control.stdout, code: control.code, timedOut: control.timedOut,
        birthId, targetId: target?.systemIdentifier ?? null }); }
    catch (error) { result.controlObservationFailure = safeError(error); }
    result.clientsClosed = result.clientClosures.length > 0 && result.clientClosures.every(receipt => receipt.confirmed === true);
    result.cleanupConfirmed = result.stopExitCode === 0 && result.foregroundDefinitiveClose === true && result.portProbe.state === 'CLOSED'
      && result.pidFileAbsent === true && result.processAbsent === true && result.stoppedControlEvidence?.controlShutDown === true
      && result.clientsClosed === true && result.otherClients === 0;
    result.status = !firstFailure && !gate.quarantined() && result.sourcePredictionsConfirmedWithinExecutedCases && result.cleanupConfirmed
      ? 'PASS_DOT_MICRO_ALGORITHM_AND_OWNED_STOP_ONLY_OLD_ISSUER_INCOMPATIBILITY_CONFIRMED'
      : 'FAILED_DOT_MICRO_QUARANTINED_NO_REPLAY_OR_CLEANUP_UNCONFIRMED';
    result.finishedAt = new Date().toISOString(); await save('RESULT.json', result);
  }
  need(result.status.startsWith('PASS_'), 'MICRO_FAILED_OR_CLEANUP_UNCONFIRMED; see ' + base); return { base, result };
}

export async function main(args) {
  let parsed; try { parsed = settings(args); } catch (error) { process.stderr.write(error.message + '\n' + HELP); return 2; }
  if (parsed === null) { process.stdout.write(HELP); return 0; }
  try { const value = await runMicro(parsed); process.stdout.write(JSON.stringify({ base: value.base, status: value.result.status,
    oldIssuerValidated: false, stopExitCode: value.result.stopExitCode }) + '\n'); return 0; }
  catch (error) { process.stderr.write(error.message + '\n'); return 1; }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = await main(process.argv.slice(2));
