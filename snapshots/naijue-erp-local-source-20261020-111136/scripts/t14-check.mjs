import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statfsSync, writeFileSync} from 'node:fs';
import {isAbsolute, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root, fileRecords, writeJson, sha256} from './files.mjs';
import {assertNoAmbientDatabase, assertTarget, cleanEnvironment} from './t14/safety.mjs';
import {runProcess} from './t14/process.mjs';
import {loadFixtures, prepareWorkspace} from './t14/fixtures.mjs';
import {LocalCluster, ident, literal} from './t14/cluster.mjs';
import {archiveEvidence, protectedState, sourceState, verifyEvidenceDirectory} from './t14/evidence.mjs';

const args = process.argv.slice(2);
let currentRunState;
if (args.length === 1 && args[0] === '--preflight') {
  try { await import('./check-toolchain.mjs'); assertNoAmbientDatabase(process.env); console.log('T14_PREFLIGHT_PASS; connections=0'); }
  catch (e) { console.error(e.message + '; connections=0'); process.exitCode = 1; }
} else {
  try { await main(); }
  catch (e) {
    const failed = {...(currentRunState ?? {task: 'T14', databaseConnections: 0}), status: 'FAIL', startupFailure: e.message, productionReady: false};
    try { writeJson(join(root, 'outputs/T14/RESULT.json'), failed); writeJson(join(root, 'outputs/T14/latest.json'), failed); }
    catch { /* A full filesystem can prevent persistence; exit and stdout still report failure. */ }
    console.error('T14 FAIL: ' + e.message); process.exitCode = 1;
  }
}

async function main() {
  const id = new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  const output = resolve(root, 'outputs/T14'); const log = join(root, 'logs/T14', id);
  const run = join(root, 'work/T14', id); const evidence = join(output, 'runs', id);
  for (const p of [output, log, run, evidence]) mkdirSync(p, {recursive: true});
  const report = {task: 'T14', runId: id, status: 'RUNNING', startedAt: new Date().toISOString(), checks: [],
    databaseConnections: 0, productionReady: false, controllerAcceptance: 'PENDING', logDirectory: log, workDirectory: run};
  currentRunState = report;
  const negative = []; const regressions = []; let cluster; let before; let legacy; let fixtures; let fingerprints;
  let protectedBefore; let sourcesBefore; let failure;
  const save = () => { writeJson(join(evidence, 'RESULT.json'), report); writeJson(join(output, 'RESULT.json'), report); };
  const checked = (name, details = {}) => { report.checks.push({name, status: 'PASS', ...details}); console.log('PASS: ' + name); save(); };
  const rejected = async (name, action, expected) => {
    let caught; try { await action(); } catch (e) { caught = e; }
    assert(caught, name + ' must reject');
    if (expected) assert.match(caught.diagnostic ?? caught.message, expected);
    negative.push({name, status: 'PASS', exitCode: caught.exitCode ?? 1, reason: caught.message, log: caught.log});
    console.log('PASS negative: ' + name);
  };
  save();
  writeJson(join(output, 'latest.json'), {runId: id, evidenceDirectory: evidence, result: join(evidence, 'RESULT.json'), status: 'RUNNING'});
  try {
    await import('./check-toolchain.mjs');
    assertNoAmbientDatabase(process.env);
    if (args.some(a => !['--inject-failure=checks', '--inject-failure=database'].includes(a)) || args.length > 1) throw Error('T14_INVALID_ARGUMENT');
    const pg = process.env.T14_PG_BIN;
    if (!pg || !isAbsolute(pg)) throw Error('T14_EXPLICIT_POSTGRES_17_TOOLS_REQUIRED');
    const disk = statfsSync(root, {bigint: true});
    const availableBytes = disk.bavail * disk.bsize;
    report.diskPreflight = {availableBytes: availableBytes.toString(), requiredBytes: String(4 * 1024 ** 3)};
    if (availableBytes < 4n * 1024n ** 3n) throw Error('T14_INSUFFICIENT_DISK_SPACE');
    checked('连接前拒绝 production、未知环境和任何继承数据库/凭据配置', {connections: 0});
    protectedBefore = protectedState(root); sourcesBefore = sourceState(root);
    writeJson(join(evidence, 'protected-before.json'), protectedBefore);
    fixtures = loadFixtures(root); checked('冻结备份、条码原件及 19/11 组清单摘要核对');
    const prepared = prepareWorkspace(root, run, fixtures);
    writeJson(join(evidence, 'fixture-provenance.json'), {manifest: fixtures.manifest, ...prepared});
    for (const file of ['failure-verification.json', 'cleanup-verification.json']) {
      if (existsSync(join(output, file))) writeJson(join(evidence, file), JSON.parse(readFileSync(join(output, file), 'utf8')));
    }

    // Production and stale target rejection are exercised in real entrypoint subprocesses before PostgreSQL starts.
    const guards = [
      ['production environment', {APP_ENV: 'production'}, /T14_PRODUCTION_FORBIDDEN/],
      ['production node environment', {NODE_ENV: 'production'}, /T14_PRODUCTION_FORBIDDEN/],
      ['production database', {APP_ENV: 'qa', POSTGRES_DB: 'erp_prod'}, /T14_AMBIENT_DATABASE_CONFIG_FORBIDDEN/],
      ['unregistered demo cluster', {POSTGRES_DB: 'demo_8877_unknown', POSTGRES_CLUSTER_ID: '123'}, /T14_AMBIENT_DATABASE_CONFIG_FORBIDDEN/],
      ['credential fallback', {PGSERVICE: 'production', PGPASSWORD: 'synthetic-test-only'}, /T14_AMBIENT_DATABASE_CONFIG_FORBIDDEN/],
      ['incomplete TCP credentials', {POSTGRES_HOST: '127.0.0.1'}, /T14_AMBIENT_DATABASE_CONFIG_FORBIDDEN/],
      ['unknown environment', {APP_ENV: 'preview'}, /T14_UNKNOWN_ENVIRONMENT/],
    ];
    for (let i = 0; i < guards.length; i++) {
      const [name, overrides, expected] = guards[i];
      await rejected(name, () => runProcess(process.execPath, [resolve(root, 'scripts/t14-check.mjs'), '--preflight'],
        {cwd: root, env: {...cleanEnvironment(), ...overrides}, log: join(log, `guard-${i}.log`)}), expected);
      negative.at(-1).connections = 0;
    }
    await rejected('真实失败子进程必须返回非零', () => runProcess(process.execPath, ['-e', 'process.exit(23)'],
      {cwd: root, log: join(log, 'failed-child.log')}));
    assert.equal(negative.at(-1).exitCode, 23);
    const noTools = join(run, 'no-tools'); mkdirSync(noTools);
    writeJson(join(output, 'release/verification.json'), {status: 'PASS', stale: true});
    writeJson(join(output, 'release/package-status.json'), {status: 'PASS', stale: true});
    await rejected('发布打包工具失败必须清除旧 PASS 并返回非零', () => runProcess(process.execPath, [join(root, 'scripts/package-release.mjs')],
      {cwd: root, env: {...cleanEnvironment(), PATH: noTools, ERP_TASK_ID: 'T14'}, log: join(log, 'package-toolchain-failure.log')}));
    assert.equal(JSON.parse(readFileSync(join(output, 'release/verification.json'), 'utf8')).status, 'FAIL');
    assert.equal(JSON.parse(readFileSync(join(output, 'release/package-status.json'), 'utf8')).status, 'FAIL');
    negative.at(-1).stalePassInvalidated = true;
    if (args[0] === '--inject-failure=checks') await runProcess(process.execPath, ['-e', 'throw Error("T14_INJECTED_CHECK_FAILURE")'],
      {cwd: root, log: join(log, 'injected-check-failure.log')});
    const buildEnv = {...cleanEnvironment(), ERP_TASK_ID: 'T14'};
    await runProcess(join(root, 'scripts/npm.sh'), ['run', 'build'], {cwd: root, env: buildEnv, log: join(log, 'build.log')});
    await runProcess(join(root, 'scripts/npm.sh'), ['run', 'lint'], {cwd: root, env: buildEnv, log: join(log, 'lint.log')});
    await runProcess(join(root, 'scripts/npm.sh'), ['run', 'check:dependencies'], {cwd: root, env: buildEnv, log: join(log, 'dependencies.log')});
    const engineering = await runProcess(process.execPath, [join(root, 'scripts/t45/repository-test.mjs')],
      {cwd: root, env: buildEnv, log: join(log, 'check.log')});
    report.engineeringTests = Number(engineering.stdout.match(/\btests\s+(\d+)/)?.[1]);
    assert(report.engineeringTests > 0, 'T14_ENGINEERING_TEST_SUMMARY_REQUIRED');
    await runProcess(join(root, 'scripts/npm.sh'), ['run', 'typecheck'], {cwd: root, env: buildEnv, log: join(log, 'typecheck.log')});
    await runProcess(process.execPath, [join(root, 'node_modules/eslint/bin/eslint.js'), '--config', 'scripts/t14/eslint.config.mjs', 'scripts/t14/*.mjs'],
      {cwd: root, env: buildEnv, log: join(log, 't14-lint.log')});
    checked('构建、类型、lint、依赖和全部工程测试通过');
    for (const file of fixtures.manifest.frontend) {
      const r = await runRegression('frontend', file, process.execPath, [join(prepared.workspace, 'frontend/verification', file)],
        {cwd: prepared.workspace, env: cleanEnvironment(), log: join(log, 'frontend-' + file + '.log'), timeout: 240000}, regressions);
      regressions.push({group: 'frontend', file, status: 'PASS', ...r}); console.log('PASS frontend: ' + file);
    }
    checked('既有前端 19 组从当前正式源码快照运行通过', {groups: 19, environment: 'jsdom / model'});
    cluster = new LocalCluster(root, run, pg, log, process.env.APP_ENV ?? 'qa'); await cluster.start();
    report.databaseConnections = 'managed local cluster only';
    checked('新建 PostgreSQL 17 实例；离线集群 ID 已绑定；TCP 禁用', {identity: cluster.identity, socket: cluster.host});
    const database = await cluster.create('restore'); report.restoreDatabase = database; await cluster.restore(database, fixtures.backup);
    const matched = await cluster.fingerprint(database, fixtures.metadata.tableFingerprints, 'Asia/Shanghai');
    assert.deepEqual(matched, fixtures.metadata.tableFingerprints);
    before = {tables: await cluster.fingerprint(database, fixtures.metadata.tableFingerprints),
      sequences: await cluster.sequences(database, fixtures.metadata.schemas)};
    writeJson(join(evidence, 'fingerprint-before.json'), before);
    checked('新隔离库实际恢复；原备份 89 表逐表行数和内容匹配', {tables: 89});
    legacy = await cluster.legacyContract(database, fixtures.metadata.schemas);
    const barcodeSchema = await cluster.barcodeFixture(legacy, fixtures.metadata.schemas[1]);
    report.testTarget = legacy.contract;
    await cluster.probe(legacy, 'SELECT 1', 'identity-positive');
    await rejected('夹具身份不能修改来源层', () => cluster.probe(legacy,
      `UPDATE ${ident(fixtures.metadata.schemas[0])}.product SET name=name`, 'source-write-denied'), /permission denied/);
    await rejected('夹具身份不能修改恢复的历史层', () => cluster.probe(legacy,
      `UPDATE ${ident(fixtures.metadata.schemas[1])}.document SET number=number`, 'history-write-denied'), /permission denied/);
    await rejected('即使库名合法，未知集群合同也在连接前拒绝', () => assertTarget({...legacy.contract, clusterId: '123'}, legacy.contract), /T14_TARGET_CONTRACT_MISMATCH/);
    await rejected('production 目标合同在连接前拒绝', () => assertTarget({...legacy.contract, environment: 'production'}, legacy.contract), /T14_PRODUCTION_FORBIDDEN/);
    await rejected('psql 清理分支也拒绝更换数据库', () => runProcess(legacy.shim,
      ['-X', '-qAt', '-h', cluster.host, '-p', String(cluster.port), '-U', legacy.contract.user, '-d', 'erp_prod', '-c', 'SELECT 1'],
      {cwd: root, env: legacy.env, log: join(log, 'cleanup-target-denied.log')}), /T14_PSQL_TARGET_REJECTED/);
    await rejected('psql 包装器拒绝继承 production 进程身份', () => runProcess(legacy.shim,
      ['-X', '-qAt', '-h', cluster.host, '-p', String(cluster.port), '-U', legacy.contract.user, '-d', database, '-c', 'SELECT 1'],
      {cwd: root, env: {...legacy.env, APP_ENV: 'production'}, log: join(log, 'process-production-denied.log')}), /T14_PROCESS_IDENTITY_MISMATCH/);
    await rejected('交互事务拒绝 psql 重新连接元命令', () => runProcess(legacy.shim,
      ['-X', '-qAt', '-h', cluster.host, '-p', String(cluster.port), '-U', legacy.contract.user, '-d', database],
      {cwd: root, env: legacy.env, input: '\\connect erp_prod\n', log: join(log, 'stdin-reconnect-denied.log')}), /T14_PSQL_META_COMMAND_REJECTED/);
    await rejected('交互事务拒绝相对 SQL 文件和输出管道元命令', async () => {
      for (const [label, input] of [['include', '\\ir synthetic.sql\n'], ['pipe', '\\g |synthetic\n']]) {
        let error;
        try { await runProcess(legacy.shim,
          ['-X', '-qAt', '-h', cluster.host, '-p', String(cluster.port), '-U', legacy.contract.user, '-d', database],
          {cwd: root, env: legacy.env, input, log: join(log, 'stdin-' + label + '-denied.log')}); }
        catch (caught) { error = caught; }
        assert(error, 'T14_METACOMMAND_PROBE_MUST_FAIL');
        assert.match(error.diagnostic ?? error.message, /T14_PSQL_META_COMMAND_REJECTED/);
      }
      throw Error('T14_PSQL_META_COMMAND_REJECTED: both actual subprocesses rejected');
    }, /T14_PSQL_META_COMMAND_REJECTED/);
    const identity = await cluster.systemSql(database, 'SELECT identity FROM t14_guard.environment_identity WHERE singleton;');
    await cluster.systemSql(database, `UPDATE t14_guard.environment_identity SET identity=jsonb_set(identity,'{environment}','"production"');`);
    await rejected('同连接核验数据库内身份；生产身份拒绝后续写入', () => cluster.probe(legacy,
      'CREATE SCHEMA v2_runtime_guard_must_not_exist', 'persisted-production-denied'), /T14_DATABASE_IDENTITY_MISMATCH/);
    assert.equal(await cluster.systemSql(database, "SELECT to_regnamespace('v2_runtime_guard_must_not_exist') IS NULL;"), 't');
    await cluster.systemSql(database, `UPDATE t14_guard.environment_identity SET identity=${literal(identity)}::jsonb;`);
    if (args[0] === '--inject-failure=database') await cluster.probe(legacy,
      'BEGIN; CREATE SCHEMA v2_runtime_injected_failure; SELECT 1/0; COMMIT;', 'injected-database-failure');
    for (const file of fixtures.manifest.backend) {
      const r = await runRegression('backend', file, process.execPath, ['--import', 'tsx', join(prepared.workspace, 'server/runtime', file)],
        {cwd: prepared.workspace, env: file === 'supplements.test.ts' ? {...legacy.env, T14_BARCODE_FIXTURE_SCHEMA: barcodeSchema} : legacy.env,
          log: join(log, 'backend-' + file + '.log'), timeout: 240000}, regressions);
      regressions.push({group: 'backend', file, status: 'PASS', ...r}); console.log('PASS backend: ' + file);
    }
    checked('既有后端 11 组通过；所有事务和清理均经过同连接身份核验', {groups: 11, superuser: false});
    const after = {tables: await cluster.fingerprint(database, fixtures.metadata.tableFingerprints),
      sequences: await cluster.sequences(database, fixtures.metadata.schemas)};
    assert.deepEqual(after, before); fingerprints = {timezone: 'UTC', before, after, tableDifferences: 0, sequenceDifferences: 0};
    checked('测试前后 89 张恢复表和原序列指纹一致', {tableDifferences: 0, sequenceDifferences: 0});
    await verifyMigrationFixture(cluster, log, checked);
    await cluster.stop(); checked('本次测试实例已停止并回读状态');
    assert.deepEqual(sourceState(root), sourcesBefore, 'T14_SOURCE_CHANGED_DURING_CHECK');
    assert.deepEqual(protectedState(root), protectedBefore, 'T14_PROTECTED_INPUT_CHANGED');
    checked('Demo、封存参考和共享源码核对一致');

    writeJson(join(output, 'release/verification.json'), {status: 'RUNNING', runId: id});
    await runProcess(join(root, 'scripts/npm.sh'), ['run', 'release:pack'], {cwd: root, env: buildEnv, log: join(log, 'release-pack.log')});
    const release = JSON.parse(readFileSync(join(output, 'release/verification.json'), 'utf8')); assert.equal(release.status, 'PASS');
    // Negative archive probes use copies; they never damage a prior successful package.
    const releaseStage = JSON.parse(readFileSync(join(output, 'release/latest.json'), 'utf8')).staging;
    for (const kind of ['missing', 'digest']) {
      const temp = mkdtempSync(join(run, 'archive-negative-' + kind + '-'));
      const contents = join(temp, 'contents');
      cpSync(releaseStage, contents, {recursive: true, filter: path => kind !== 'missing' || path !== join(releaseStage, 'server/main.js')});
      const manifest = JSON.parse(readFileSync(join(contents, 'release-manifest.json'), 'utf8'));
      if (kind === 'digest') writeFileSync(join(contents, 'server/main.js'), 'corrupt');
      else { manifest.files = manifest.files.filter(f => f.path !== 'server/main.js'); writeJson(join(contents, 'release-manifest.json'), manifest); }
      const archive = join(temp, 'invalid.tar.gz');
      await runProcess('tar', ['-czf', archive, '-C', contents, '.'], {log: join(log, `release-negative-${kind}-pack.log`)});
      writeJson(join(temp, 'latest.json'), {archive, archiveSha256: sha256(readFileSync(archive)),
        manifestHash: sha256(readFileSync(join(contents, 'release-manifest.json')))});
      writeJson(join(temp, 'verification.json'), {status: 'PASS', stale: true});
      await rejected('发布归档' + (kind === 'missing' ? '缺少入口' : '错误摘要') + '拒绝且清除旧 PASS', () =>
        runProcess(process.execPath, [join(root, 'scripts/verify-release.mjs'), '--release-directory', temp],
          {cwd: root, env: buildEnv, log: join(log, `release-negative-${kind}-verify.log`)}));
      assert.equal(JSON.parse(readFileSync(join(temp, 'verification.json'), 'utf8')).status, 'FAIL');
      negative.at(-1).stalePassInvalidated = true;
    }
    checked('发布包实际归档回读通过', {files: release.filesVerified, archive: release.archive}); report.release = release;
  } catch (e) {
    failure = e; report.failure = {reason: e.message, log: e.log, exitCode: e.exitCode};
    console.error('FAIL: ' + e.message + (e.log ? '; see ' + e.log : ''));
  } finally {
    if (cluster?.started && before && report.restoreDatabase) {
      try {
        const after = {tables: await cluster.fingerprint(report.restoreDatabase, fixtures.metadata.tableFingerprints),
          sequences: await cluster.sequences(report.restoreDatabase, fixtures.metadata.schemas)};
        assert.deepEqual(after, before); fingerprints = {timezone: 'UTC', before, after, tableDifferences: 0, sequenceDifferences: 0, recordedAfterFailure: true};
      } catch (e) { failure ??= e; report.fingerprintFailure = e.message; }
    }
    if (cluster?.started) {
      try { await cluster.stop(); report.clusterStopped = true; }
      catch (e) { failure ??= e; report.shutdownFailure = e.message; }
    } else if (cluster) report.clusterStopped = true;
    if (protectedBefore) {
      try { assert.deepEqual(protectedState(root), protectedBefore); report.protectedFilesUnchanged = true; }
      catch (e) { failure ??= e; report.protectionFailure = e.message; }
    }
    writeJson(join(evidence, 'fingerprints.json'), fingerprints ?? {status: 'NOT_RUN', reason: 'database phase not reached'});
    writeJson(join(evidence, 'negative-cases.json'), negative);
    writeJson(join(evidence, 'regression-results.json'), regressions);
    writeJson(join(evidence, 'protection.json'), {unchanged: report.protectedFilesUnchanged ?? null});
    writeJson(join(evidence, 'source-state.json'), {before: sourcesBefore ?? null, after: sourcesBefore ? sourceState(root) : null});
  }
  if (!failure) {
    try {
      writeJson(join(evidence, 'pipeline.json'), {...report, status: 'CHECKS_PASS_ARCHIVE_PENDING'});
      const required = ['pipeline.json', 'fingerprints.json', 'negative-cases.json', 'protection.json', 'source-state.json', 'regression-results.json'];
      const archiveManifest = {version: 1, required, files: fileRecords(evidence).filter(f => f.path !== 'RESULT.json')};
      // The final result is outside the immutable evidence archive to avoid a self-referential hash.
      const staging = join(run, 'evidence-staging'); mkdirSync(staging);
      for (const record of archiveManifest.files) { const target = join(staging, record.path); mkdirSync(resolve(target, '..'), {recursive: true}); cpSync(join(evidence, record.path), target); }
      const invalidMissing = {...archiveManifest, files: archiveManifest.files.filter(f => f.path !== 'fingerprints.json')};
      await rejected('证据归档缺少必需项不得通过', () => verifyEvidenceDirectory(staging, invalidMissing), /T14_REQUIRED_EVIDENCE_MISSING/);
      const invalidDigest = {...archiveManifest, files: archiveManifest.files.map((f, i) => i === 0 ? {...f, sha256: '0'.repeat(64)} : f)};
      await rejected('证据归档摘要错误不得通过', () => verifyEvidenceDirectory(staging, invalidDigest));
      writeJson(join(staging, 'negative-cases.json'), negative);
      writeJson(join(evidence, 'negative-cases.json'), negative);
      archiveManifest.files = fileRecords(staging);
      report.evidenceArchive = await archiveEvidence(staging, archiveManifest, join(output, `evidence-${id}.tar.gz`), {path: run, log});
      checked('T14 证据归档逐文件回读一致，缺项和错摘要反例拒绝');
      writeJson(join(output, 'negative-cases.json'), negative); writeJson(join(output, 'fingerprints.json'), fingerprints);
      writeJson(join(output, 'regression-results.json'), regressions);
    } catch (e) { failure = e; report.failure = {reason: e.message, log: e.log}; }
  }
  report.status = failure ? 'FAIL' : 'PASS'; report.finishedAt = new Date().toISOString();
  if (failure) {
    report.failure ??= {reason: failure.message};
    writeJson(join(output, 'release/pipeline-status.json'), {status: 'FAIL', runId: id, reason: failure.message});
  } else writeJson(join(output, 'release/pipeline-status.json'), {status: 'PASS', runId: id});
  save(); writeJson(join(output, 'latest.json'), {runId: id, evidenceDirectory: evidence, result: join(evidence, 'RESULT.json'), status: report.status});
  console.log(`T14 ${report.status}; ${join(output, 'RESULT.json')}`); if (failure) process.exitCode = 1;
}

async function verifyMigrationFixture(cluster, log, checked) {
  const base = resolve(root, 'dist/server/database');
  const {readDatabaseConfig, assertIsolatedTarget} = await import(pathToFileURL(join(base, 'config.js')));
  const {bootstrapSql} = await import(pathToFileURL(join(base, 'bootstrap.js')));
  const {loadMigrations, migrationSql} = await import(pathToFileURL(join(base, 'migrations.js')));
  const {maintenanceSql} = await import(pathToFileURL(join(base, 'psql.js')));
  const database = await cluster.create('empty'); const prefix = 't14_' + randomUUID().replaceAll('-', '').slice(0, 8);
  const env = {APP_ENV: cluster.environment, POSTGRES_HOST: cluster.host, POSTGRES_PORT: String(cluster.port), POSTGRES_DB: database,
    POSTGRES_ROLE_PREFIX: prefix, POSTGRES_USER: prefix + '_app', POSTGRES_SOURCE_SCHEMA: 't14_source', POSTGRES_RUNTIME_SCHEMA: 't14_runtime',
    POSTGRES_AUTH_SCHEMA: 't14_auth', POSTGRES_CONTROL_SCHEMA: 't14_control', POSTGRES_INSTANCE_ID: randomUUID(), POSTGRES_CLUSTER_ID: cluster.clusterId};
  const c = readDatabaseConfig(env); assertIsolatedTarget(c);
  await cluster.systemSql(database, bootstrapSql(c, cluster.admin));
  const migrations = loadMigrations(c);
  const migrated = await maintenanceSql(c, c.roles.migrator, migrationSql(c, migrations), join(cluster.pg, 'psql'));
  writeFileSync(join(log, 'migration-fixture.log'), migrated + '\n');
  const versions = await cluster.systemSql(database, 'SELECT count(*) FROM t14_control.schema_version;'); assert.equal(versions, '10');
  const tables = JSON.parse(await cluster.systemSql(database, "SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',t.relname) ORDER BY n.nspname,t.relname) FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname IN ('t14_source','t14_runtime','t14_auth','t14_control') AND t.relkind='r';"));
  const before = await cluster.fingerprint(database, tables);
  const repeated = await maintenanceSql(c, c.roles.migrator, migrationSql(c, migrations), join(cluster.pg, 'psql'));
  writeFileSync(join(log, 'migration-repeat.log'), repeated + '\n');
  assert.deepEqual(await cluster.fingerprint(database, tables), before);
  checked('T08 版本迁移在新空库可重建，重复执行全表指纹不变', {versions: 10, tables: tables.length});
}

async function runRegression(group, file, binary, args, options, results) {
  try { return await runProcess(binary, args, options); }
  catch (e) { results.push({group, file, status: 'FAIL', exitCode: e.exitCode, log: e.log}); throw e; }
}
