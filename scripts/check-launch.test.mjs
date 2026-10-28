import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {launchCommands, requiredAcceptance, runLaunch, fixedCheckoutCommit} from './check-launch.mjs';

const commit = 'a'.repeat(40), bytes = Buffer.from('fixed independently accepted receipt');
const acceptance = {candidateCommit: commit, entries: requiredAcceptance.map(taskId => ({taskId,
  status: 'PASS', level: 'ACTUAL_REQUIRED_SCOPE', receipt: {path: '/synthetic/receipt.json', bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')}}))};
const base = {nodeVersion: '24.21.0', npmVersion: '11.9.0', commit, acceptance,
  commands: [{id: 'one'}, {id: 'two'}], readReceipt: () => bytes};

test('launch gate enumerates actual replica/import/release and preserves original root gate once', () => {
  const rows = launchCommands();
  assert.equal(rows.filter(row => row.id === 'existing-root-check-all').length, 1);
  for (const file of ['filter-selection-runtime.test.mjs', 'normal-entry.test.mjs', 'production-source-provider26.test.mjs', 'production-source-host.test.mjs'])
    assert.ok(rows.some(row => row.args.some(arg => arg.endsWith(file))), file);
  assert.ok(rows.some(row => row.args.includes('tsconfig.launch-api.json')));
  assert.ok(rows.some(row => row.args.includes('scripts/release/build-production.test.mjs')));
  assert.ok(rows.find(row => row.id === 'commit-outcomes').args.includes('tests/cross-layer-contract-fixtures.test.mjs'));
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
