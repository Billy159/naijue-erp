import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {assertChecks} from '../scripts/t45/lib.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = resolve(process.env.T45_CHECK_TEST_DIRECTORY ?? resolve(root, 'work/T45/check-orchestration'));
mkdirSync(evidence, {recursive: true});
const npmCli = fileURLToPath(new URL('../lib/node_modules/npm/bin/npm-cli.js', 'file://' + process.execPath));

function fixture(kind) {
  const base = mkdtempSync(resolve(evidence, kind + '-'));
  const put = (path, bytes) => {
    const target = resolve(base, path); mkdirSync(dirname(target), {recursive: true}); writeFileSync(target, bytes);
  };
  const copy = path => {
    const target = resolve(base, path); mkdirSync(dirname(target), {recursive: true}); copyFileSync(resolve(root, path), target);
  };
  for (const path of ['frontend', 'server', 'scripts', 'tests', 'config', '.github', 'references/planning-20261001',
    'references/planning-20261002', 'outputs/T31/revisions/history-contributions-v1/program']) mkdirSync(resolve(base, path), {recursive: true});
  for (const path of ['scripts/t45/check.mjs', 'scripts/t45/repository-test.mjs', 'scripts/t45/lib.mjs', 'scripts/check-toolchain.mjs',
    'config/t45/policy.json', 'config/toolchain.json', '.node-version', '.nvmrc', 'tsconfig.json', 'eslint.config.mjs']) copy(path);
  const testCommand = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts.test;
  put('package.json', JSON.stringify({private: true, type: 'module',
    scripts: {test: kind === 'command-change' ? 'node --test tests/t45.test.mjs' : testCommand}}));
  put('package-lock.json', '{"lockfileVersion":3}\n');
  put('fixture-empty-global.npmrc', '');
  put('scripts/t45/eslint.config.mjs', "export default [{files: ['**/*.mjs'], rules: {}}];\n");
  put('scripts/t14-check.mjs', "console.log('synthetic preflight; no T14 specialty suite');\n");
  put('tests/t45.test.mjs', "import test from 'node:test'; test('synthetic T45 stage', () => {});\n");
  put('tests/t45-check-orchestration.test.mjs', "import test from 'node:test'; test('synthetic T45 orchestration stage', () => {});\n");
  // Only npm test is real. Install/build/release stages are bounded substitutes;
  // release always fails so these checks can never become a promotable receipt.
  put('fixture-bin/npm', '#!' + process.execPath + '\n' + `
import {spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, symlinkSync} from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === '--version' || args[0] === 'test') {
  const r = spawnSync(process.execPath, [${JSON.stringify(npmCli)}, ...args], {stdio: 'inherit',
    env: {...process.env, NPM_CONFIG_GLOBALCONFIG: ${JSON.stringify(resolve(base, 'fixture-empty-global.npmrc'))},
      NPM_CONFIG_OFFLINE: 'true', NPM_CONFIG_UPDATE_NOTIFIER: 'false'}});
  process.exit(r.status ?? 1);
}
if (args[0] === 'ci') {
  symlinkSync(${JSON.stringify(resolve(root, 'node_modules'))}, 'node_modules', 'dir');
  console.log('synthetic install; no registry access'); process.exit(0);
}
if (args[0] === 'run' && args[1] === 'build') {
  if (${JSON.stringify(kind)} === 'race') {
    mkdirSync('dist/server/database', {recursive: true});
    cpSync('server/t45-fixture-database', 'dist/server/database', {recursive: true});
  }
  console.log('synthetic build; main dist untouched'); process.exit(0);
}
if (args[0] === 'run' && args[1] === 'release:pack') {
  console.error('T45_SYNTHETIC_RELEASE_BLOCKER'); process.exit(7);
}
if (args[0] === 'run') process.exit(0);
console.error('Unexpected fixture npm arguments', args); process.exit(9);
`);
  chmodSync(resolve(base, 'fixture-bin/npm'), 0o700);
  if (kind === 'race') {
    // Exercise the same readiness resource read as the historical ENOENT, without
    // opening a pool/client or running a database suite.
    for (const name of ['readiness', 'config', 'identity', 'access-errors', 'sql']) {
      const source = readFileSync(resolve(root, 'server/database', name + '.ts'), 'utf8');
      put('server/t45-fixture-database/' + name + '.js', ts.transpileModule(source,
        {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022}}).outputText);
    }
    cpSync(resolve(root, 'server/database/sql'), resolve(base, 'server/t45-fixture-database/sql'), {recursive: true});
    put('tests/00-build-window.test.mjs', `
import test from 'node:test';
import {cpSync, existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
test('synthetic failed build removes SQL resources, then restores them', async () => {
  mkdirSync('work/race', {recursive: true});
  rmSync('dist/server/database/sql', {recursive: true});
  writeFileSync('work/race/deleted', '1');
  try {
    for (let n = 0; n < 100 && !existsSync('work/race/read-attempt'); n++) await delay(10);
    await delay(100);
  } finally { cpSync('server/t45-fixture-database/sql', 'dist/server/database/sql', {recursive: true}); }
});
`);
    put('tests/01-resource-read.test.mjs', `
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {readinessCheck} from '../dist/server/database/readiness.js';
test('readiness resources are available when another test finishes its failed build', async () => {
  for (let n = 0; n < 200 && !existsSync('work/race/deleted'); n++) await delay(10);
  assert.equal(existsSync('work/race/deleted'), true);
  writeFileSync('work/race/read-attempt', '1');
  assert.equal(typeof readinessCheck({schemas: {control: 't45_control'}}), 'function');
});
`);
  } else if (kind === 'typescript') {
    for (const path of ['server/domain/inventory/history-plan.ts', 'server/domain/idempotency/index.ts',
      'server/domain/transactions/decimal.ts']) copy(path);
    put('tests/01-loader.test.mjs', `
import test from 'node:test';
import assert from 'node:assert/strict';
import {HistoryError} from '../server/domain/inventory/history-plan.ts';
test('the unchanged history module loads with parameter properties intact', () => {
  const error = new HistoryError('T45_LOADER_PROBE', {synthetic: true});
  assert.equal(error.code, 'T45_LOADER_PROBE'); assert.deepEqual(error.details, {synthetic: true});
});
`);
  } else put('tests/01-unrelated-failure.test.mjs', `
import test from 'node:test';
import assert from 'node:assert/strict';
test('unrelated assertions must remain failures', () => assert.equal(1, 2, 'T45_UNRELATED_ASSERTION_MUST_REMAIN_RED'));
`);
  const taskPath = resolve(base, 'scripts/t45/check.mjs');
  const env = {PATH: resolve(base, 'fixture-bin') + ':' + dirname(process.execPath) + ':' + process.env.PATH,
    HOME: resolve(base, 'fixture-home'), LANG: 'C.UTF-8', TZ: 'UTC', NPM_CONFIG_USERCONFIG: '/dev/null',
    NPM_CONFIG_GLOBALCONFIG: resolve(base, 'fixture-empty-global.npmrc'), COPYFILE_DISABLE: '1'};
  mkdirSync(env.HOME, {recursive: true});
  const result = spawnSync(process.execPath, [taskPath], {cwd: base, env, encoding: 'utf8', timeout: 30000});
  put('invocation.log', (result.stdout ?? '') + (result.stderr ?? '') + (result.error?.message ?? ''));
  assert.equal(result.error, undefined, 'fixture process should finish');
  assert.equal(result.status, 1, 'synthetic release blocker must prevent overall PASS');
  const report = JSON.parse(readFileSync(resolve(base, 'outputs/T45/checks.json'), 'utf8'));
  assert.ok(Array.isArray(report.checks), JSON.stringify(report));
  const entry = report.checks.find(c => c.name === 'test');
  const log = readFileSync(entry.log, 'utf8');
  assert.equal(report.sharedInputsUnchanged, true);
  assert.equal(report.status, 'FAIL'); assert.throws(() => assertChecks(report), /T45_CHECKS_NOT_PASS/);
  assert.equal(report.checks.find(c => c.name === 'release:pack').exitCode, 7);
  return {entry, log};
}

test('T45 test orchestration serializes the destructive-build/resource-read boundary', () => {
  const {entry, log} = fixture('race');
  assert.equal(entry.status, 'PASS', log); assert.equal(entry.exitCode, 0, log);
  assert.doesNotMatch(log, /ENOENT/);
});
test('T45 test orchestration loads existing TypeScript using the locked project loader', () => {
  const {entry, log} = fixture('typescript');
  assert.equal(entry.status, 'PASS', log); assert.equal(entry.exitCode, 0, log);
  assert.doesNotMatch(log, /ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/);
});
test('T45 test orchestration preserves unrelated assertion failures and release rejection', () => {
  const {entry, log} = fixture('assertion');
  assert.equal(entry.status, 'FAIL'); assert.equal(entry.exitCode, 1);
  assert.match(log, /T45_UNRELATED_ASSERTION_MUST_REMAIN_RED/);
});
test('T45 test orchestration refuses to reinterpret a changed repository test command', () => {
  const {entry, log} = fixture('command-change');
  assert.equal(entry.status, 'FAIL'); assert.equal(entry.exitCode, 1);
  assert.match(log, /T45_REPOSITORY_TEST_COMMAND_CHANGED/);
});

test('T45 repository signatures accept both full selections and preserve serial loading, rejection and failure propagation', () => {
  const base = mkdtempSync(resolve(evidence, 'signatures-'));
  for (const path of ['scripts/t45', 'config/t45', 'tests']) mkdirSync(resolve(base, path), {recursive: true});
  for (const path of ['scripts/t45/repository-test.mjs', 'scripts/t45/lib.mjs', 'config/t45/policy.json'])
    copyFileSync(resolve(root, path), resolve(base, path));
  symlinkSync(resolve(root, 'node_modules'), resolve(base, 'node_modules'), 'dir');
  writeFileSync(resolve(base, 'probe.ts'), 'export class Probe {constructor(public code: string) {}}\n');
  writeFileSync(resolve(base, 'tests/00-loader.test.mjs'), `
import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {Probe} from '../probe.ts';
test('first selected file uses tsx and finishes before the second', async () => {
  assert.equal(new Probe('loaded').code, 'loaded');
  writeFileSync('order.json', '"started"'); await delay(100);
  writeFileSync('order.json', '"finished"');
});
`);
  writeFileSync(resolve(base, 'tests/01-reader.test.mjs'), `
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('the complete second file observes serial completion', () => {
  assert.equal(JSON.parse(readFileSync('order.json')), 'finished');
});
`);
  const invoke = (signature, label) => {
    writeFileSync(resolve(base, 'package.json'), JSON.stringify({type: 'module', scripts: {test: signature}}));
    const env = {...process.env};
    // Launch an independent runner; inherited node:test context skips nested files.
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['scripts/t45/repository-test.mjs'],
      {cwd: base, env, encoding: 'utf8', timeout: 10000});
    const log = (result.stdout ?? '') + (result.stderr ?? '');
    writeFileSync(resolve(base, label + '.log'), log);
    assert.equal(result.error, undefined);
    return {result, log};
  };
  const signatures = ['node --test tests/*.test.mjs', 'node --import tsx --test tests/*.test.mjs'];
  for (const [index, signature] of signatures.entries()) {
    const {result, log} = invoke(signature, 'accepted-' + index);
    assert.equal(result.status, 0, log);
    assert.match(log, /first selected file uses tsx and finishes before the second/);
    assert.match(log, /the complete second file observes serial completion/);
    assert.doesNotMatch(log, /skipping running files/);
    const receipt = JSON.parse(result.stdout.split('\n')[0]);
    assert.equal(receipt.repositoryCommand, signature);
    assert.deepEqual(receipt.nodeArguments,
      ['--test', '--test-concurrency=1', '--import=tsx', 'tests/00-loader.test.mjs', 'tests/01-reader.test.mjs']);
  }
  for (const [index, signature] of ['node --import tsx --test tests/t45.test.mjs',
    'node --test --test-name-pattern=synthetic tests/*.test.mjs'].entries()) {
    const {result, log} = invoke(signature, 'rejected-' + index);
    assert.equal(result.status, 1, log);
    assert.match(log, /T45_REPOSITORY_TEST_COMMAND_CHANGED/);
    assert.doesNotMatch(result.stdout, /nodeArguments|first selected file/);
  }
  writeFileSync(resolve(base, 'tests/02-failure.test.mjs'), `
import test from 'node:test';
import assert from 'node:assert/strict';
test('selected failures remain nonzero', () => assert.fail('T45_SIGNATURE_ASSERTION_MUST_REMAIN_RED'));
`);
  for (const [index, signature] of signatures.entries()) {
    const {result, log} = invoke(signature, 'failure-' + index);
    assert.equal(result.status, 1, log);
    assert.match(log, /T45_SIGNATURE_ASSERTION_MUST_REMAIN_RED/);
    assert.deepEqual(JSON.parse(result.stdout.split('\n')[0]).nodeArguments.slice(3),
      ['tests/00-loader.test.mjs', 'tests/01-reader.test.mjs', 'tests/02-failure.test.mjs']);
  }
});
