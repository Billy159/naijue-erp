import {lstatSync, readFileSync} from 'node:fs';
import {isAbsolute, resolve} from 'node:path';
import {spawn} from 'node:child_process';

export function assertNoAmbientDatabase(env) {
  if (env.APP_ENV === 'production' || env.NODE_ENV === 'production') throw Error('T14_PRODUCTION_FORBIDDEN');
  if (env.APP_ENV && !['local', 'stage', 'qa'].includes(env.APP_ENV)) throw Error('T14_UNKNOWN_ENVIRONMENT');
  // A local rebuild never borrows a deployment's target, password, service file or URL.
  if (Object.keys(env).some(k => /^(?:POSTGRES_|PG|DATABASE_URL$|DB_|APP_DATABASE_)/.test(k))) throw Error('T14_AMBIENT_DATABASE_CONFIG_FORBIDDEN');
}

export function cleanEnvironment(env = process.env) {
  return Object.fromEntries(['PATH', 'HOME', 'LANG', 'TMPDIR', 'SYSTEMROOT'].filter(k => env[k]).map(k => [k, env[k]]));
}

export function assertTarget(target, contract) {
  if (target.environment === 'production') throw Error('T14_PRODUCTION_FORBIDDEN');
  if (!['local', 'stage', 'qa'].includes(target.environment)) throw Error('T14_UNKNOWN_ENVIRONMENT');
  const demo = /^demo_8877_[a-z0-9_]+$/.test(target.database);
  const controlled = ['stage', 'qa'].includes(target.environment) && contract.controlled === true
    && ['erp_stage', 'erp_qa'].includes(target.database);
  if (!demo && !controlled) throw Error('T14_ISOLATED_DATABASE_REQUIRED');
  if (contract.kind !== 'managed-local' || contract.phase !== 'provisioned'
    || !isAbsolute(target.host) || !isAbsolute(contract.dataDirectory)
    || !/^[1-9][0-9]{0,19}$/.test(target.clusterId ?? '')
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(target.instanceId ?? '')) throw Error('T14_PROVISIONED_IDENTITY_REQUIRED');
  for (const key of ['database', 'host', 'port', 'user', 'environment', 'clusterId', 'instanceId']) {
    if (target[key] !== contract[key]) throw Error('T14_TARGET_CONTRACT_MISMATCH');
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(target.user)) throw Error('T14_EXPLICIT_ROLE_REQUIRED');
  if (target.passfile || target.password || !isAbsolute(contract.psql)) throw Error('T14_MANAGED_SOCKET_CREDENTIALS_REQUIRED');
  return target;
}

export function assertPrivateSocket(contract) {
  const stat = lstatSync(contract.host);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.dev !== contract.socketDevice
    || stat.ino !== contract.socketInode) throw Error('T14_SOCKET_IDENTITY_MISMATCH');
  const data = lstatSync(contract.dataDirectory);
  if (!data.isDirectory() || data.isSymbolicLink() || (data.mode & 0o077)) throw Error('T14_DATA_DIRECTORY_UNSAFE');
}

const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
export function guardSql(c) {
  return `DO $t14$ BEGIN
    IF current_database() <> ${literal(c.database)} OR session_user <> ${literal(c.user)}
      OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
      OR t14_guard.data_directory() <> ${literal(c.dataDirectory)}
      OR current_setting('listen_addresses') <> ''
      OR t14_guard.cluster_identifier() <> ${literal(c.clusterId)}
      OR (SELECT identity FROM t14_guard.environment_identity WHERE singleton) IS DISTINCT FROM ${literal(JSON.stringify(c.identity))}::jsonb
    THEN RAISE EXCEPTION 'T14_DATABASE_IDENTITY_MISMATCH'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolcanlogin AND NOT rolsuper
      AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
    THEN RAISE EXCEPTION 'T14_UNSAFE_FIXTURE_ROLE'; END IF;
  END $t14$;`;
}

export function readContract(path) {
  if (!isAbsolute(path)) throw Error('T14_ABSOLUTE_CONTRACT_REQUIRED');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw Error('T14_CONTRACT_MUST_BE_PRIVATE');
  const c = JSON.parse(readFileSync(path, 'utf8'));
  assertTarget(c, c); assertPrivateSocket(c); return c;
}

export function checkedPsqlArguments(args, c) {
  const connection = {}; const result = []; let command = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (['-h', '-p', '-U', '-d'].includes(flag)) {
      if (connection[flag] !== undefined || args[i + 1] === undefined) throw Error('T14_PSQL_ARGUMENTS_REJECTED');
      connection[flag] = args[++i]; result.push(flag, connection[flag]);
    } else if (flag === '-c') {
      if (command || args[i + 1] === undefined) throw Error('T14_PSQL_ARGUMENTS_REJECTED');
      command = true;
      const sql = args[++i];
      if (/\\/.test(sql)) throw Error('T14_PSQL_META_COMMAND_REJECTED');
      result.push('-c', guardSql(c) + '\n' + sql);
    } else if (flag === '-v' && args[i + 1] === 'ON_ERROR_STOP=1') {
      result.push(flag, args[++i]);
    } else if (['-X', '-qAt'].includes(flag)) result.push(flag);
    else throw Error('T14_PSQL_ARGUMENTS_REJECTED');
  }
  if (connection['-h'] !== c.host || connection['-p'] !== String(c.port)
    || connection['-U'] !== c.user || connection['-d'] !== c.database) throw Error('T14_PSQL_TARGET_REJECTED');
  return {args: ['-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', ...result], command};
}

export function assertInteractivePsqlLine(line) {
  if (/\\(?:connect\b|c\b|!|include(?:_relative)?\b|ir?\b|g(?:exec)?\b|set(?:env)?\b|copy\b|o\b|e\b|edit\b|password\b|watch\b|lo_import\b)/i.test(line)) {
    throw Error('T14_PSQL_META_COMMAND_REJECTED');
  }
}

export function runGuardedPsql(path, args) {
  const c = readContract(resolve(path));
  if (process.env.APP_ENV !== c.environment || process.env.POSTGRES_DB !== c.database
    || process.env.POSTGRES_HOST !== c.host || process.env.POSTGRES_PORT !== String(c.port)
    || process.env.POSTGRES_USER !== c.user) throw Error('T14_PROCESS_IDENTITY_MISMATCH');
  if (Object.keys(process.env).some(k => /^(?:PGPASSWORD|PGSERVICE|POSTGRES_PASS|DATABASE_URL)/.test(k))) throw Error('T14_PROCESS_CREDENTIALS_FORBIDDEN');
  const checked = checkedPsqlArguments(args, c);
  // All legacy calls, including cleanup, receive a guard on their own connection.
  const child = spawn(c.psql, checked.args, {env: {...cleanEnvironment(), PGPASSFILE: '/dev/null', PGSSLMODE: 'disable',
    PGCONNECT_TIMEOUT: '5', PGOPTIONS: '-c timezone=UTC -c search_path=pg_catalog -c statement_timeout=120000 -c lock_timeout=10000'},
  stdio: ['pipe', 'inherit', 'inherit']});
  child.on('error', () => { process.exitCode = 1; });
  child.stdin.on('error', () => {});
  if (!checked.command) {
    child.stdin.write(guardSql(c) + '\n');
    // Preserve interactive transactions while blocking libpq reconnection and shell/file metacommands.
    let buffer = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      buffer += chunk; let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index + 1); buffer = buffer.slice(index + 1);
        try { assertInteractivePsqlLine(line); } catch {
          console.error('T14_PSQL_META_COMMAND_REJECTED'); child.kill('SIGTERM'); process.stdin.destroy(); return;
        }
        child.stdin.write(line);
      }
    });
    process.stdin.on('end', () => {
      if (buffer.trim()) { console.error('T14_INCOMPLETE_PSQL_INPUT'); child.kill('SIGTERM'); }
      else child.stdin.end();
    });
  }
  else child.stdin.end();
  child.on('close', code => { process.exitCode = code === 0 ? 0 : 1; process.stdin.destroy(); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
}
