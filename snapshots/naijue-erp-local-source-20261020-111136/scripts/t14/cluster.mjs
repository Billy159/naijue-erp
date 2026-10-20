import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chmodSync, lstatSync, mkdirSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runProcess} from './process.mjs';
import {assertTarget, assertPrivateSocket, cleanEnvironment} from './safety.mjs';

export const ident = s => { if (!/^[a-z][a-z0-9_]{0,62}$/.test(s)) throw Error('T14_INVALID_IDENTIFIER'); return '"' + s + '"'; };
export const literal = s => "'" + String(s).replaceAll("'", "''") + "'";

export class LocalCluster {
  constructor(root, run, pg, log, environment = 'qa') {
    this.root = root; this.run = run; this.pg = pg; this.log = log; this.environment = environment;
    this.data = join(run, 'data'); this.port = 55414; this.admin = 't14_bootstrap'; this.counter = 0;
    this.databases = new Set(); this.started = false;
  }
  async tool(name, args, input) {
    return await runProcess(join(this.pg, name), args, {cwd: this.root, input,
      env: {...cleanEnvironment(), PGPASSFILE: '/dev/null', PGCONNECT_TIMEOUT: '5', PGSSLMODE: 'disable',
        PGOPTIONS: '-c timezone=UTC -c search_path=pg_catalog -c statement_timeout=180000 -c lock_timeout=10000'},
      log: join(this.log, `${String(++this.counter).padStart(3, '0')}-${name}.log`)});
  }
  async start() {
    const version = await this.tool('postgres', ['--version']); assert.match(version.stdout, /PostgreSQL\) 17\./);
    // A short socket path is required by macOS. It still stays inside the sole writable project root.
    for (let i = 0; i < 100; i++) {
      const name = randomUUID().replaceAll('-', '').slice(0, 2);
      try { this.host = join(this.root, 'work', name); mkdirSync(this.host, {mode: 0o700}); break; }
      catch (e) { if (e.code !== 'EEXIST') throw e; this.host = undefined; }
    }
    if (!this.host || Buffer.byteLength(join(this.host, `.s.PGSQL.${this.port}`)) >= 104) throw Error('T14_PRIVATE_SOCKET_PATH_TOO_LONG');
    await this.tool('initdb', ['-D', this.data, '-U', this.admin, '--auth-local=trust', '--auth-host=reject', '--encoding=UTF8', '--locale=C']);
    writeFileSync(join(this.data, 'postgresql.auto.conf'), `listen_addresses = ''\nunix_socket_permissions = 0700\nunix_socket_directories = ${literal(this.host)}\nport = ${this.port}\n`, {mode: 0o600});
    const control = await this.tool('pg_controldata', ['-D', this.data]);
    this.clusterId = control.stdout.match(/Database system identifier:\s+(\d+)/)?.[1];
    if (!this.clusterId) throw Error('T14_OFFLINE_CLUSTER_ID_REQUIRED');
    this.started = true; // stop is attempted even if pg_ctl starts a server but then reports an error.
    await this.tool('pg_ctl', ['-D', this.data, '-l', join(this.log, 'postgres.log'), '-o',
      `-c listen_addresses='' -c unix_socket_permissions=0700 -c unix_socket_directories='${this.host}' -p ${this.port}`, '-w', 'start']);
    const state = await this.systemSql('postgres', 'SELECT jsonb_build_object(\'clusterId\',system_identifier::text,\'dataDirectory\',current_setting(\'data_directory\'),\'listenAddresses\',current_setting(\'listen_addresses\')) FROM pg_control_system();');
    this.identity = JSON.parse(state);
    assert.equal(this.identity.clusterId, this.clusterId); assert.equal(this.identity.dataDirectory, this.data); assert.equal(this.identity.listenAddresses, '');
    await this.systemSql('postgres', 'REVOKE CONNECT ON DATABASE postgres FROM PUBLIC; REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;');
  }
  clusterGuard(database) {
    if (this.environment === 'production' || !this.clusterId) throw Error('T14_PROVISIONED_IDENTITY_REQUIRED');
    return `DO $cluster$ BEGIN IF current_database() <> ${literal(database)} OR session_user <> ${literal(this.admin)}
      OR (SELECT system_identifier::text FROM pg_control_system()) <> ${literal(this.clusterId)}
      OR current_setting('data_directory') <> ${literal(this.data)} OR current_setting('listen_addresses') <> ''
      THEN RAISE EXCEPTION 'T14_CLUSTER_IDENTITY_MISMATCH'; END IF; END $cluster$;`;
  }
  async systemSql(database, sql) {
    if (!['postgres', ...this.databases].includes(database)) throw Error('T14_UNREGISTERED_DATABASE');
    if (database !== 'postgres' && !/^demo_8877_t14_[a-z0-9_]+$/.test(database)) throw Error('T14_ISOLATED_DATABASE_REQUIRED');
    const r = await this.tool('psql', ['-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', this.host,
      '-p', String(this.port), '-U', this.admin, '-d', database], this.clusterGuard(database) + '\n' + sql);
    return r.stdout;
  }
  async create(label) {
    const name = 'demo_8877_t14_' + label + '_' + randomUUID().replaceAll('-', '').slice(0, 8);
    ident(name); await this.systemSql('postgres', `CREATE DATABASE ${ident(name)} TEMPLATE template0;`);
    this.databases.add(name); return name;
  }
  async restore(database, backup) {
    await this.systemSql(database, 'SELECT 1;');
    await this.tool('pg_restore', ['-h', this.host, '-p', String(this.port), '-U', this.admin, '-d', database,
      '--exit-on-error', '--no-owner', '--no-acl', backup]);
  }
  async fingerprint(database, tables, timezone = 'UTC') {
    const sql = tables.map(t => `SELECT jsonb_build_object('schema',${literal(t.schema)},'table',${literal(t.table)},'rows',count(*),
      'digest',md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM (SELECT md5(row_to_json(r)::text) h FROM ${ident(t.schema)}.${ident(t.table)} r)x;`).join('\n');
    const rows = await this.systemSql(database, `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL TIMEZONE=${literal(timezone)};\n${sql}\nROLLBACK;`);
    return rows.split('\n').filter(Boolean).map(s => JSON.parse(s));
  }
  async sequences(database, schemas) {
    const names = JSON.parse(await this.systemSql(database, `SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname) ORDER BY n.nspname,c.relname),'[]'::jsonb)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname IN (${schemas.map(literal).join(',')});`));
    const rows = [];
    for (const n of names) rows.push({...n, ...JSON.parse(await this.systemSql(database,
      `SELECT jsonb_build_object('lastValue',last_value::text,'isCalled',is_called) FROM ${ident(n.schema)}.${ident(n.name)};`))});
    return rows;
  }
  async legacyContract(database, schemas) {
    const user = 't14_legacy_' + randomUUID().replaceAll('-', '').slice(0, 8);
    const stat = lstatSync(this.host);
    const c = {kind: 'managed-local', phase: 'provisioned', controlled: true, database, host: this.host, port: this.port, user,
      environment: this.environment, clusterId: this.clusterId, instanceId: randomUUID(), dataDirectory: this.data,
      psql: join(this.pg, 'psql'), socketDevice: stat.dev, socketInode: stat.ino};
    c.identity = {database, environment: c.environment, instanceId: c.instanceId, clusterId: c.clusterId, user, schemas};
    assertTarget(c, c); assertPrivateSocket(c);
    await this.systemSql(database, `CREATE ROLE ${ident(user)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
      REVOKE ALL ON DATABASE ${ident(database)} FROM PUBLIC; GRANT CONNECT,CREATE,TEMP ON DATABASE ${ident(database)} TO ${ident(user)};
      REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO ${ident(user)};
      ${schemas.map(s => `REVOKE ALL ON SCHEMA ${ident(s)} FROM PUBLIC; GRANT USAGE ON SCHEMA ${ident(s)} TO ${ident(user)};
        GRANT SELECT ON ALL TABLES IN SCHEMA ${ident(s)} TO ${ident(user)};
        GRANT SELECT ON ALL SEQUENCES IN SCHEMA ${ident(s)} TO ${ident(user)};`).join('\n')}
      CREATE SCHEMA t14_guard; CREATE TABLE t14_guard.environment_identity(singleton boolean PRIMARY KEY CHECK(singleton),identity jsonb NOT NULL);
      INSERT INTO t14_guard.environment_identity VALUES(true,${literal(JSON.stringify(c.identity))}::jsonb);
      CREATE FUNCTION t14_guard.cluster_identifier() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS 'SELECT system_identifier::text FROM pg_control_system()';
      CREATE FUNCTION t14_guard.data_directory() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS 'SELECT current_setting(''data_directory'')';
      REVOKE ALL ON SCHEMA t14_guard FROM PUBLIC; REVOKE ALL ON ALL TABLES IN SCHEMA t14_guard FROM PUBLIC;
      REVOKE ALL ON FUNCTION t14_guard.cluster_identifier() FROM PUBLIC;
      REVOKE ALL ON FUNCTION t14_guard.data_directory() FROM PUBLIC;
      GRANT USAGE ON SCHEMA t14_guard TO ${ident(user)}; GRANT SELECT ON t14_guard.environment_identity TO ${ident(user)};
      GRANT EXECUTE ON FUNCTION t14_guard.cluster_identifier() TO ${ident(user)};`);
    await this.systemSql(database, `GRANT EXECUTE ON FUNCTION t14_guard.data_directory() TO ${ident(user)};`);
    await this.systemSql(database, `REVOKE SELECT ON ${ident(schemas[1])}.employee_login,${ident(schemas[1])}.employee_session,${ident(schemas[1])}.employee_account_audit FROM ${ident(user)};`);
    const path = join(this.run, 'legacy-contract.json'); writeFileSync(path, JSON.stringify(c, null, 2), {mode: 0o600}); chmodSync(path, 0o600);
    const shim = join(this.run, 'guarded-psql');
    writeFileSync(shim, `#!${process.execPath}\nimport {runGuardedPsql} from ${JSON.stringify(pathToFileURL(resolve(this.root, 'scripts/t14/safety.mjs')).href)};\ntry { runGuardedPsql(${JSON.stringify(path)},process.argv.slice(2)); } catch(e) { console.error(e.message); process.exitCode=1; }\n`, {mode: 0o700});
    // Extensionless node entry inherits this run's ESM package.
    writeFileSync(join(this.run, 'package.json'), '{"type":"module"}\n');
    return {contract: c, path, shim, env: {...cleanEnvironment(), APP_ENV: c.environment, POSTGRES_HOST: c.host,
      POSTGRES_PORT: String(c.port), POSTGRES_DB: c.database, POSTGRES_USER: c.user, PSQL_BIN: shim,
      PGPASSFILE: '/dev/null', PGSSLMODE: 'disable', PGOPTIONS: '-c timezone=UTC'}};
  }
  async probe(legacy, sql, name) {
    return await runProcess(legacy.shim, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', legacy.contract.host,
      '-p', String(legacy.contract.port), '-U', legacy.contract.user, '-d', legacy.contract.database, '-c', sql],
    {cwd: this.root, env: legacy.env, log: join(this.log, name + '.log')});
  }
  async barcodeFixture(legacy, runtime) {
    const schema = 'v2_runtime_t14_barcodes';
    await this.systemSql(legacy.contract.database, `CREATE SCHEMA ${ident(schema)} AUTHORIZATION ${ident(legacy.contract.user)};
      ${['generated_barcode', 'product_barcode_alias', 'barcode_authority_policy', 'barcode_authority_product', 'barcode_authority_record', 'barcode_scheme_supplement'].map(t =>
      `CREATE TABLE ${ident(schema)}.${ident(t)} (LIKE ${ident(runtime)}.${ident(t)} INCLUDING ALL);
       INSERT INTO ${ident(schema)}.${ident(t)} SELECT * FROM ${ident(runtime)}.${ident(t)};
       ALTER TABLE ${ident(schema)}.${ident(t)} OWNER TO ${ident(legacy.contract.user)};`).join('\n')}`);
    return schema;
  }
  async stop() {
    if (!this.started) return;
    await this.tool('pg_ctl', ['-D', this.data, '-m', 'fast', '-w', 'stop']); this.started = false;
    const status = await runProcess(join(this.pg, 'pg_ctl'), ['-D', this.data, 'status'],
      {cwd: this.root, log: join(this.log, 'stopped-status.log')}).then(() => 0).catch(e => e.exitCode);
    assert.equal(status, 3, 'PostgreSQL must be stopped');
  }
}
