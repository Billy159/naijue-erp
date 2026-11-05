import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {launchCommands, parseLaunchArgs, main, requiredAcceptance, runLaunch, fixedCheckoutCommit} from './check-launch.mjs';
import {historicalClosureDescriptor} from '../tests/historical-runtime26/oracle.mjs';

const commit = 'a'.repeat(40), bytes = Buffer.from('fixed independently accepted receipt');
const acceptance = {candidateCommit: commit, entries: requiredAcceptance.map(taskId => ({taskId,
  status: 'PASS', level: 'ACTUAL_REQUIRED_SCOPE', receipt: {path: '/synthetic/receipt.json', bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')}}))};
const base = {nodeVersion: '24.21.0', npmVersion: '11.9.0', commit, acceptance,
  commands: [{id: 'one'}, {id: 'two'}], readReceipt: () => bytes};

test('launch gate enumerates actual replica/import/release and preserves original root gate once', () => {
  const rows = launchCommands();
  assert.equal(rows.filter(row => row.id === 'existing-root-check-all').length, 1);
  assert.deepEqual(rows.find(row => row.id === 'module-boundaries').args, ['scripts/check-module-boundaries.mjs']);
  for (const file of ['filter-selection-runtime.test.mjs', 'normal-entry.test.mjs', 'production-source-provider26.test.mjs', 'production-source-host.test.mjs'])
    assert.ok(rows.some(row => row.args.some(arg => arg.endsWith(file))), file);
  assert.ok(rows.some(row => row.args.includes('tsconfig.launch-api.json')));
  assert.ok(rows.some(row => row.args.includes('scripts/release/build-production.test.mjs')));
  assert.ok(rows.find(row => row.id === 'commit-outcomes').args.includes('tests/cross-layer-contract-fixtures.test.mjs'));
});

test('aggregate web gate reaches the original unified saved-edit service regression exactly once', () => {
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  const checked = value => {
    assert.equal(value['test:web:unified-service'], 'node --test apps/web/demo-replica/tests/unified-service-fixture.test.mjs');
    assert.equal(value['check:all'].split(' && ').filter(command => command === 'npm run check:web').length, 1);
    const web = value['check:web'].split(' && ');
    assert.equal(web.filter(command => command === 'npm run test:web:unified-service').length, 1);
    assert.equal(web.at(-1), 'npm run test:web:unified-service');
  };
  checked(scripts);
  assert.deepEqual(launchCommands().find(row => row.id === 'existing-root-check-all').args.slice(-2), ['run', 'check:all']);
  for (const change of [
    value => { delete value['test:web:unified-service']; },
    value => { value['test:web:unified-service'] += ' --test-name-pattern=unused'; },
    value => { value['check:all'] = value['check:all'].replace('npm run check:web', 'true'); },
    value => { value['check:web'] = value['check:web'].replace(' && npm run test:web:unified-service', ''); },
    value => { value['check:web'] += ' && npm run test:web:unified-service'; }
  ]) {
    const altered = { ...scripts }; change(altered);
    assert.throws(() => checked(altered), { name: 'AssertionError' });
  }
});

test('explicit runtime resource selection inserts one flag and preserves the original list and other nine stages', () => {
  const original = launchCommands(), originalRuntime = original.find(row => row.id === 'replica-runtime-tests');
  assert.equal(original.length, 10);
  assert.equal(originalRuntime.args[0], '--test');
  assert.ok(originalRuntime.args.slice(1).every(arg => arg.startsWith('apps/web/demo-replica/frontend/runtime/') && /\.test\.(?:mjs|ts)$/.test(arg)));
  assert.ok(!originalRuntime.args.some(arg => arg.startsWith('--test-concurrency')));
  assert.deepEqual(launchCommands({runtimeConcurrency: undefined}), original);
  for (const runtimeConcurrency of [1, 2, 64]) {
    const selected = launchCommands({runtimeConcurrency});
    assert.deepEqual(selected.map(row => row.id), original.map(row => row.id));
    for (let i = 0; i < original.length; i++) {
      if (original[i].id !== 'replica-runtime-tests') assert.deepEqual(selected[i], original[i]);
      else {
        assert.equal(selected[i].command, original[i].command);
        assert.deepEqual(selected[i].args, ['--test', `--test-concurrency=${runtimeConcurrency}`, ...original[i].args.slice(1)]);
      }
    }
  }
  assert.equal(requiredAcceptance.length, 31);
});

test('runtime API requires an own primitive safe integer from 1 through 64 without coercion or unknown fields', () => {
  let invoked = false;
  const coercible = {valueOf() { invoked = true; return 2; }, toString() { invoked = true; return '2'; }};
  for (const value of [null, false, true, '2', 0, -1, 2.5, 65, NaN, Infinity, Number.MAX_SAFE_INTEGER, coercible]) {
    assert.throws(() => launchCommands({runtimeConcurrency: value}), /INVALID_RUNTIME_TEST_CONCURRENCY/);
  }
  assert.equal(invoked, false);
  const getter = {};
  Object.defineProperty(getter, 'runtimeConcurrency', {enumerable: true, get() { invoked = true; return 2; }});
  for (const options of [null, [], {unknown: 2}, getter, Object.create({runtimeConcurrency: 2})]) {
    assert.throws(() => launchCommands(options), /INVALID_RUNTIME_TEST_RESOURCES/);
  }
  assert.equal(invoked, false);
});

test('CLI preserves exact absolute acceptance paths and combines a resource option with either original mode', () => {
  const filename = path.resolve('synthetic receipts', '验收 with spaces..json');
  assert.deepEqual(parseLaunchArgs([]), {plan: false, acceptancePath: undefined, runtimeConcurrency: undefined});
  assert.deepEqual(parseLaunchArgs(['--plan']), {plan: true, acceptancePath: undefined, runtimeConcurrency: undefined});
  assert.deepEqual(parseLaunchArgs(['--acceptance', filename]), {plan: false, acceptancePath: filename, runtimeConcurrency: undefined});
  for (const args of [['--runtime-test-concurrency', '2', '--acceptance', filename], ['--acceptance', filename, '--runtime-test-concurrency', '2']]) {
    const value = parseLaunchArgs(args);
    assert.equal(value.acceptancePath, filename, 'Do not split, trim, normalize or consume the original complete path as an option');
    assert.equal(value.runtimeConcurrency, 2); assert.equal(value.plan, false);
  }
  for (const args of [['--plan', '--runtime-test-concurrency', '2'], ['--runtime-test-concurrency', '2', '--plan']]) {
    assert.deepEqual(parseLaunchArgs(args), {plan: true, acceptancePath: undefined, runtimeConcurrency: 2});
  }
});

test('CLI rejects invalid, duplicate, missing or unknown values before any command can spawn', () => {
  const filename = path.resolve('synthetic receipt.json');
  const invalid = [
    ['--runtime-test-concurrency'], ['--runtime-test-concurrency', '--plan'],
    ...['0', '-1', '+2', '02', '2.0', '2e0', '2junk', ' 2', '2 ', 'NaN', 'Infinity', '65', '9007199254740993']
      .map(value => ['--runtime-test-concurrency', value]),
    ['--runtime-test-concurrency', '2', '--runtime-test-concurrency', '2'],
    ['--plan', '--plan'], ['--acceptance', filename, '--acceptance', filename],
    ['--acceptance'], ['--acceptance', 'relative.json'], ['--unknown'],
    ['--runtime-test-concurrency=2'], ['--plan', '--acceptance', filename],
    ['--runtime-test-concurrency', '2', '--plan', '--acceptance', filename],
    ['--plan', 'extra'], [2], {0: '--plan', length: 1}
  ];
  let spawns = 0, outputs = 0;
  for (const args of invalid) {
    assert.throws(() => main(args, {spawn: () => { spawns++; throw Error('must not spawn'); }, output: () => { outputs++; }}), /USAGE/);
  }
  let invoked = false;
  const getter = [];
  Object.defineProperty(getter, '0', {enumerable: true, get() { invoked = true; return '--plan'; }});
  assert.throws(() => parseLaunchArgs(getter), /USAGE/); assert.equal(invoked, false);
  assert.equal(spawns, 0); assert.equal(outputs, 0);
});

test('default and explicit resource plans never spawn or change exit status and clearly label only explicit resources', () => {
  let spawns = 0; const beforeExit = process.exitCode;
  for (const runtimeConcurrency of [undefined, 2, 64]) {
    const lines = [], args = runtimeConcurrency === undefined ? ['--plan'] : ['--plan', '--runtime-test-concurrency', String(runtimeConcurrency)];
    main(args, {spawn: () => { spawns++; throw Error('a plan cannot spawn'); }, output: text => lines.push(text)});
    assert.equal(lines.length, 1);
    const value = JSON.parse(lines[0]);
    assert.equal(value.status, 'PLAN_NOT_RUN');
    assert.deepEqual(value.commands, launchCommands({runtimeConcurrency}));
    assert.deepEqual(value.requiredAcceptance, requiredAcceptance);
    if (runtimeConcurrency === undefined) assert.equal(Object.hasOwn(value, 'runtimeResources'), false);
    else assert.deepEqual(value.runtimeResources, {replicaRuntimeTestConcurrency: runtimeConcurrency});
  }
  assert.equal(spawns, 0); assert.equal(process.exitCode, beforeExit);
});

test('a selected resource profile still executes all ten stages once and aggregates failures without retry or acceptance changes', () => {
  for (const failure of [7, null, undefined, 'throw']) {
    const commands = launchCommands({runtimeConcurrency: 2}), called = [];
    const result = runLaunch({...base, commands, run: row => {
      called.push(row.id);
      if (called.length === 1) {
        if (failure === 'throw') throw Error('synthetic first-stage failure');
        return failure;
      }
      return 0;
    }});
    assert.deepEqual(called, commands.map(row => row.id));
    assert.equal(result.local.length, 10); assert.equal(result.status, 'FAIL');
    assert.equal(result.local[0].status, 'FAIL'); assert.ok(result.local.slice(1).every(row => row.status === 'PASS'));
    assert.equal(result.acceptance.length, 31); assert.ok(result.acceptance.every(row => row.status === 'PASS')); // Synthetic receipts only.
  }
});

const sourceOnly = Object.freeze([
  'tests/integration/migration-source.test.ts', 'tests/integration/safety.test.ts',
  'tests/integration/proof.test.ts', 'tests/integration/backend-source.test.ts',
  'tests/integration/runtime26-baseline/offline.test.mjs',
  'tests/integration/runtime26-baseline/schema-objects-only/offline.test.mjs'
]);
const preparationUnitTests = Object.freeze([
  'tests/performance/opt00/fixture-generator.test.mjs',
  'tests/performance/opt00/evidence.test.mjs',
  'tests/performance/opt00/bundle-graph.test.mjs',
  'tests/performance/opt00/browser-host/canonical-profile.test.mjs',
  'tests/performance/opt00/browser-host/host.test.mjs',
  'tests/performance/opt00/pg-component/offline.test.mjs',
  'tests/performance/opt01/default-regression.test.mjs'
]);
// These two original complete leaves remain required effective units. They run
// only through the source-verified paired oracle, not the active successor graph.
const historicalOriginalEntrypoints = Object.freeze([
  'tests/integration/runtime26-baseline/schema-objects-only/offline.test.mjs',
  'tests/performance/opt00/pg-component/offline.test.mjs'
]);
const historicalTestUnits = Object.freeze([
  'tests/historical-runtime26/oracle-integrity.test.mjs',
  'tests/historical-runtime26/original-oracle.test.mjs'
]);
const packageScripts = () => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
const rootTestCommand = () => packageScripts().test;
function effectiveTestUnits(tokens) {
  assert.deepEqual(tokens.filter(token => token.startsWith('tests/historical-runtime26/')).sort(), [...historicalTestUnits].sort(),
    'Select exactly the two reviewed historical wrappers, never a directory or wildcard');
  return tokens.flatMap(token => token === historicalTestUnits[1] ? historicalOriginalEntrypoints :
    token === historicalTestUnits[0] ? [] : [token]);
}
function assertSafeDefaultTestEntry(command) {
  const tokens = command.trim().split(/\s+/);
  assert.deepEqual(tokens.slice(0, 2), ['node', '--test'], 'Preserve the default native Node test entry');
  const effective = effectiveTestUnits(tokens);
  const selected = effective.filter(token => token.startsWith('tests/integration/'));
  assert.deepEqual(selected.sort(), [...sourceOnly].sort());
  assert.deepEqual(effective.filter(token => token.startsWith('tests/performance/')).sort(), [...preparationUnitTests].sort());
  const allowed = new Set(['tests/*.test.ts', ...sourceOnly, ...preparationUnitTests, ...historicalTestUnits]);
  for (const token of tokens.filter(token => token.startsWith('tests/')))
    assert.ok(allowed.has(token), `Default tests must not implicitly select an engine, collector or benchmark: ${token}`);
}
function assertSafeHistoricalTestEntry(command) {
  const tokens = command.trim().split(/\s+/);
  effectiveTestUnits(tokens);
  assert.deepEqual(tokens, ['node', '--test', ...historicalTestUnits,
    'tests/native-runtime26-sequence-system-acl-successor.test.ts', 'tests/unified-new-target-install.test.ts']);
}

test('default root tests explicitly select source-only integration and exact offline preparation units', () => {
  assertSafeDefaultTestEntry(rootTestCommand());
});

test('default test entry refuses engine/collector/browser/recursive-glob additions and missing or duplicate required units', () => {
  const command = rootTestCommand();
  for (const forbidden of [
    'tests/integration/**/*.test.mjs',
    'tests/integration/authentication-component.integration.ts',
    'tests/integration/runtime26-baseline/schema-objects-only/run.mjs',
    'tests/integration/runtime26-baseline/schema-objects-only/v22-carrier.mjs',
    'tests/integration/runtime26-baseline/schema-objects-only/stdin-pipe-bridge.native-test.mjs',
    'tests/performance/opt00/*.test.mjs',
    'tests/performance/opt00/collect-readonly-pg.mjs',
    'tests/performance/opt00/collect-bundles.mjs',
    'tests/performance/opt00/bundle-graph.mjs',
    'tests/performance/opt00/browser-host/run-browser-baseline.mjs',
    'tests/performance/opt00/browser-host/serve.mjs',
    'tests/performance/opt00/browser-host/build.mjs',
    'tests/performance/opt00/browser-host/canonical-build.mjs',
    'tests/performance/opt00/browser-host/entry.tsx',
    'tests/performance/opt00/browser-host/*.test.mjs',
    'tests/performance/opt00/pg-component/run.mjs',
    'tests/performance/opt00/pg-component/component.mjs',
    'tests/performance/opt00/pg-component/*.test.mjs',
    'tests/performance/opt01/invariants.green.mjs',
    'tests/performance/opt01/request-budget.red.mjs',
    'tests/performance/opt01/phase-a-protocol.green.mjs',
    'tests/performance/opt01/phase-a-eligibility.green.mjs',
    'tests/performance/opt01/phase-a-capacity.green.mjs',
    'tests/performance/opt01/phase-a-initialization.green.mjs',
    'tests/performance/opt01/default*.test.mjs',
    'tests/performance/opt01/*.mjs',
    'tests/**/*.test.mjs'
  ]) assert.throws(() => assertSafeDefaultTestEntry(command + ' ' + forbidden), {name: 'AssertionError'}, forbidden);
  for (const required of [...sourceOnly, ...preparationUnitTests, ...historicalTestUnits]) {
    const token = historicalOriginalEntrypoints.includes(required) ? historicalTestUnits[1] : required;
    assert.throws(() => assertSafeDefaultTestEntry(command.replace(token, '')), {name: 'AssertionError'}, 'Missing effective unit ' + required);
    assert.throws(() => assertSafeDefaultTestEntry(command + ' ' + required), {name: 'AssertionError'}, 'Duplicate ' + required);
  }
});

test('historical wrapper closes exactly two complete original source leaves and preserves both required unit sets', async () => {
  // The real helper checks its unchanged manifest digest; it does not accept a
  // caller-supplied entry list. Its paired graph verifies the original leaf bytes.
  const closure = await historicalClosureDescriptor();
  assert.deepEqual(closure.entrypoints, historicalOriginalEntrypoints);
  const manifest = JSON.parse(readFileSync(new URL('../tests/historical-runtime26/HISTORICAL-TEST-CLOSURE.json', import.meta.url), 'utf8'));
  for (const entry of historicalOriginalEntrypoints) {
    assert.ok([...sourceOnly, ...preparationUnitTests].includes(entry));
    const records = manifest.files.filter(row => row.path === entry);
    assert.equal(records.length, 1);
    const bytes = readFileSync(new URL('../' + entry, import.meta.url));
    assert.equal(bytes.length, records[0].bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), records[0].sha256);
  }
  assert.deepEqual(effectiveTestUnits(historicalTestUnits), historicalOriginalEntrypoints);
});

test('root and dedicated source entries reject missing duplicate unknown or wildcard historical selection', () => {
  const commands = [[rootTestCommand(), assertSafeDefaultTestEntry],
    [packageScripts()['test:historical-runtime26'], assertSafeHistoricalTestEntry]];
  for (const [command, check] of commands) {
    check(command);
    for (const required of historicalTestUnits) {
      assert.throws(() => check(command.replace(required, '')), {name: 'AssertionError'}, 'Missing ' + required);
      assert.throws(() => check(command + ' ' + required), {name: 'AssertionError'}, 'Duplicate ' + required);
      for (const forbidden of ['tests/historical-runtime26/*.test.mjs',
        'tests/historical-runtime26/**/*.test.mjs', 'tests/historical-runtime26',
        'tests/historical-runtime26/new-unknown.test.mjs',
        'tests/historical-runtime26/collector.test.mjs', 'tests/historical-runtime26/native.test.mjs']) {
        assert.throws(() => check(command.replace(required, forbidden)), {name: 'AssertionError'}, forbidden);
        assert.throws(() => check(command + ' ' + forbidden), {name: 'AssertionError'}, forbidden);
      }
    }
    for (const entry of historicalOriginalEntrypoints) {
      assert.throws(() => check(command + ' ' + entry), {name: 'AssertionError'}, 'Duplicate effective original ' + entry);
      assert.throws(() => check(command.replace(historicalTestUnits[1], entry)), {name: 'AssertionError'}, 'Unpaired original ' + entry);
    }
  }
});

test('local failure propagates and does not hide later command results', () => {
  let calls = 0;
  const value = runLaunch({...base, run: () => ++calls === 1 ? 7 : 0});
  assert.equal(calls, 2); assert.equal(value.status, 'FAIL'); assert.equal(value.local[0].exitCode, 7);
});

test('missing/stale/source-only proof or wrong receipt blocks even when local checks pass', () => {
  for (const input of [undefined, {...acceptance, candidateCommit: 'b'.repeat(40)},
    {...acceptance, entries: acceptance.entries.map(row => ({...row, level: 'SOURCE_ONLY'}))}]) {
    assert.equal(runLaunch({...base, acceptance: input, run: () => 0}).status, 'BLOCKED_ENV');
  }
  assert.equal(runLaunch({...base, readReceipt: () => Buffer.from('changed'), run: () => 0}).status, 'BLOCKED_ENV');
  assert.equal(runLaunch({...base, run: () => 0}).status, 'PASS'); // Synthetic checker fixture, no actual release acceptance.
});

test('wrong tool versions block before commands and never report a green candidate', () => {
  for (const change of [{nodeVersion: '24.19.0'}, {npmVersion: '11.19.0'}]) {
    assert.equal(runLaunch({...base, ...change, run: () => {throw Error('must not execute');}}).reason,
      'EXACT_NODE_NPM_AND_FIXED_COMMIT_REQUIRED');
  }
});

test('fixed candidate uses its own clean checkout, never parent HEAD or changed tracked files', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'naijue-launch-identity-'));
  try {
    const git = args => {const value = spawnSync('git', args, {cwd: directory, encoding: 'utf8'}); assert.equal(value.status, 0, value.stderr); return value.stdout.trim();};
    git(['init', '-q']); writeFileSync(path.join(directory, 'source.mjs'), 'original');
    git(['add', 'source.mjs']); git(['-c', 'user.name=Launch Test', '-c', 'user.email=launch-test@example.invalid', 'commit', '-qm', 'synthetic identity fixture']);
    const head = git(['rev-parse', 'HEAD']); assert.equal(fixedCheckoutCommit(directory), head);
    const archive = path.join(directory, 'archive'); mkdirSync(archive);
    assert.equal(fixedCheckoutCommit(archive), '');
    writeFileSync(path.join(directory, 'source.mjs'), 'changed'); assert.equal(fixedCheckoutCommit(directory), '');
    git(['add', 'source.mjs']); assert.equal(fixedCheckoutCommit(directory), '');
  } finally { rmSync(directory, {recursive: true, force: true}); }
});
