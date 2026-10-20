import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {assertNoAmbientDatabase, assertTarget, checkedPsqlArguments, cleanEnvironment, readContract, assertInteractivePsqlLine} from '../scripts/t14/safety.mjs';
import {verifyEvidenceDirectory} from '../scripts/t14/evidence.mjs';
import {runProcess} from '../scripts/t14/process.mjs';
import {root, fileRecords} from '../scripts/files.mjs';
import {assertReleasePath} from '../scripts/release-policy.mjs';

const contract = {kind: 'managed-local', phase: 'provisioned', controlled: true, database: 'demo_8877_t14_unit',
  host: '/isolated/socket', port: 55414, user: 't14_fixture', environment: 'qa', clusterId: '7691754635362465003',
  instanceId: randomUUID(), dataDirectory: '/isolated/data', psql: '/isolated/bin/psql'};

test('T14 rejects production, unknown and inherited targets or secrets before any connection', () => {
  for (const env of [{APP_ENV: 'production'}, {NODE_ENV: 'production'}, {APP_ENV: 'unknown'},
    {POSTGRES_DB: 'business_management'}, {POSTGRES_DB: 'demo_8877_other'}, {DATABASE_URL: 'synthetic'},
    {PGPASSWORD: 'synthetic'}, {PGSERVICEFILE: '/synthetic'}, {POSTGRES_PASSFILE: ''}, {DB_HOST: 'unknown'}]) {
    assert.throws(() => assertNoAmbientDatabase(env));
  }
  assert.doesNotThrow(() => assertNoAmbientDatabase({APP_ENV: 'qa'}));
  const cleaned = cleanEnvironment({PATH: '/bin', HOME: '/fixture', PGPASSWORD: 'synthetic', DATABASE_URL: 'synthetic', POSTGRES_DB: 'erp_prod'});
  assert.deepEqual(cleaned, {PATH: '/bin', HOME: '/fixture'});
});

test('T14 pins every target field and controlled stage/qa requires a provisioned local contract', () => {
  assert.doesNotThrow(() => assertTarget(contract, contract));
  for (const patch of [{environment: 'production'}, {environment: 'preview'}, {database: 'erp_prod'}, {database: 'business_management'},
    {clusterId: '123'}, {instanceId: randomUUID()}, {user: 'billy'}, {host: '/another/socket'}, {port: 5432}, {password: 'synthetic'}, {passfile: '/synthetic'}]) {
    assert.throws(() => assertTarget({...contract, ...patch}, contract));
  }
  const stage = {...contract, environment: 'stage', database: 'erp_stage'};
  assert.doesNotThrow(() => assertTarget(stage, stage));
  assert.throws(() => assertTarget(stage, {...stage, controlled: false}));
  assert.throws(() => assertTarget(stage, {...stage, phase: 'unknown'}));
  assert.throws(() => assertTarget({...stage, host: 'pg-stage'}, {...stage, host: 'pg-stage'}));
});

test('T14 psql shim rejects URI, duplicate arguments, cleanup retargeting and reconnect metacommands', () => {
  const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', contract.host, '-p', String(contract.port), '-U', contract.user, '-d', contract.database];
  const checked = checkedPsqlArguments([...args, '-c', 'SELECT 1'], contract);
  assert.match(checked.args.at(-1), /T14_DATABASE_IDENTITY_MISMATCH[\s\S]*SELECT 1/);
  for (const suffix of [['-d', 'erp_prod'], ['postgresql://localhost/erp_prod'], ['--dbname=erp_prod'], ['-f', '/synthetic'],
    ['-c', '\\connect erp_prod'], ['-c', 'SELECT 1', '-c', 'SELECT 2']]) {
    assert.throws(() => checkedPsqlArguments([...args, ...suffix], contract));
  }
  assert.throws(() => checkedPsqlArguments(args.map(a => a === contract.database ? 'erp_prod' : a), contract));
  for (const line of ['\\connect erp_prod', '\\ir synthetic.sql', '\\include_relative synthetic.sql', '\\g |synthetic', '\\edit', '\\set ON_ERROR_STOP off']) {
    assert.throws(() => assertInteractivePsqlLine(line));
  }
  assert.doesNotThrow(() => assertInteractivePsqlLine("SELECT code ~ '^\\d{3}$';"));
});

test('T14 fails closed on readable-by-others identity contracts', () => {
  const dir = mkdtempSync(join(root, 'work/t14-contract-test-'));
  const file = join(dir, 'contract.json'); writeFileSync(file, JSON.stringify(contract)); chmodSync(file, 0o644);
  assert.throws(() => readContract(file), /T14_CONTRACT_MUST_BE_PRIVATE/);
});

test('T14 real failing child exit remains failure even if stdout says PASS', async () => {
  const dir = mkdtempSync(join(root, 'work/t14-process-test-'));
  await assert.rejects(runProcess(process.execPath, ['-e', 'console.log("PASS"); process.exit(17)'],
    {cwd: root, log: join(dir, 'failure.log')}), e => e.exitCode === 17);
  assert.match(readFileSync(join(dir, 'failure.log'), 'utf8'), /PASS/);
});

test('T14 evidence refuses missing files, wrong digest, omitted requirements and empty archives', () => {
  const dir = mkdtempSync(join(root, 'work/t14-archive-test-'));
  const required = ['pipeline.json', 'fingerprints.json', 'negative-cases.json', 'protection.json', 'source-state.json', 'regression-results.json'];
  for (const file of required) writeFileSync(join(dir, file), '{}\n');
  const manifest = {files: fileRecords(dir), required};
  assert.equal(verifyEvidenceDirectory(dir, manifest).status, 'PASS');
  assert.throws(() => verifyEvidenceDirectory(dir, {files: [], required}));
  assert.throws(() => verifyEvidenceDirectory(dir, {...manifest, files: manifest.files.slice(1)}));
  assert.throws(() => verifyEvidenceDirectory(dir, {...manifest, files: manifest.files.map((f, i) => i ? f : {...f, sha256: '0'.repeat(64)})}));
  writeFileSync(join(dir, required[0]), 'tampered\n');
  assert.throws(() => verifyEvidenceDirectory(dir, manifest));
  mkdirSync(join(dir, 'unexpected'));
  writeFileSync(join(dir, 'unexpected/file'), 'unexpected');
  assert.throws(() => verifyEvidenceDirectory(dir, manifest));
});

test('T14 permits only the compiled credential reader while refusing credential data and adjacent names', () => {
  assert.doesNotThrow(() => assertReleasePath('server/database/credentials.js'));
  for (const path of ['server/database/credentials.json', 'server/database/credentials.local.js',
    'web/credentials.js', 'server/security/credentials.js', 'server/database/credentials.ts',
    'server/database/.env', 'server/database/secrets.js', 'server/database/private.key']) {
    assert.throws(() => assertReleasePath(path));
  }
});
