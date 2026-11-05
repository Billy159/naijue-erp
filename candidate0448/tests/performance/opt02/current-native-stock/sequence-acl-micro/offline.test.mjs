/** Source/fault tests only; never start PG, connect, create a target or change permissions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { createBudget, runChildCommand, assertPhysicalIdentity } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { stoppedControlEvidence } from '../../legacy-cutoff/physical-send.mjs';
import { loadMicroContract, renderExactFloor, layer2Setup, RAW_ATTRIBUTES_SQL, settings, createGlobalGate,
  makeMicroQuery, outcomeBoundary, PINS, PROPOSED, MATERIAL_DIR, WORK, SHA } from './contract.mjs';
import { assertCapturedProcess, assertInheritedRawRows } from './contract.mjs';
import path from 'node:path';

const input = {
  planText: readFileSync(path.join(MATERIAL_DIR, 'SEQUENCE-SYSTEM-ATTRIBUTE-BLOCKER-AND-MICRO-PLAN-v1.json'), 'utf8'),
  fragmentText: readFileSync(path.join(MATERIAL_DIR, 'EXACT-ORIGINAL-PROBE-FRAGMENTS-v1.json'), 'utf8'),
  probeText: readFileSync(path.join(WORK, 'development-results-20261031/current-runtime-feasibility-independent-review/offline-four-leaf-v2/ORIGINAL-PROBE.sql'), 'utf8'),
};
const contract = loadMicroContract(input);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
test('three exact source fragments remain bound to original49a9 UTF8 spans, not hand-retyped predicates', () => {
  assert.equal(contract.originalProbeSha256, PINS.originalProbe);
  assert.equal(contract.originalProbeBytes, 32563);
  assert.equal(contract.fragments.length, 3);
  assert.deepEqual(contract.fragments.map(fragment => fragment.bytes), [227, 2081, 1865]);
  const source = Buffer.from(input.probeText);
  for (const fragment of contract.fragments)
    assert.equal(SHA(source.subarray(fragment.startOffsetUtf8, fragment.endOffsetUtf8Exclusive)), fragment.sha256);
});
test('micro wrapper keeps exact ns/rels includingS, full system export and full25floor exactly once', () => {
  const result = renderExactFloor(contract), bytes = Buffer.from(result.sql);
  for (const fragment of contract.fragments) {
    const span = result.spans.find(span => span.name === fragment.name);
    assert.equal(SHA(bytes.subarray(span.startOffsetUtf8, span.endOffsetUtf8Exclusive)), fragment.sha256);
    assert.equal(result.sql.split(fragment.text).length, 2);
  }
  assert.match(result.sql, /'m','S'/);
  assert.match(result.sql, /__micro_unused_padding AS \(SELECT 1 AS unused\)/);
  assert.match(result.sql, /\) - '__micro_padding_only__' AS manifest/);
  assert.equal(result.authority, 'NONE');
});
test('mutated source/fragment bytes, copied contract, getters and coercion fail closed', () => {
  assert.throws(() => loadMicroContract({ ...input, probeText: input.probeText + '\n' }), /EXACT_PINNED_MICRO/);
  assert.throws(() => loadMicroContract({ ...input, fragmentText: input.fragmentText.replace("'m','S'", "'m'") }), /EXACT_PINNED_MICRO/);
  assert.throws(() => renderExactFloor({ ...contract }), /ORIGINAL_PINNED_MICRO_CONTRACT/);
  let reads = 0;
  assert.throws(() => loadMicroContract({ ...input, get planText() { reads++; return input.planText; } }), /OWN|DATA/);
  assert.equal(reads, 0);
});
test('layer2 creates only23 empty dummy tables and25original column grants, never ERP data/functions/migrations', () => {
  const statements = layer2Setup(contract);
  assert.equal(statements.length, 48);
  assert.equal(statements.filter(sql => sql.startsWith('CREATE TABLE ')).length, 23);
  assert.equal(statements.filter(sql => sql.startsWith('GRANT SELECT ')).length, 25);
  assert.ok(statements.filter(sql => sql.startsWith('CREATE')).every(sql => sql.endsWith('(id integer)')));
  assert.doesNotMatch(statements.join('\n'), /INSERT|DISABLE|TRIGGER|FUNCTION|schema_migration|UPDATE|PUBLIC/);
});
test('raw source query records sequence negative rawACL and allfour effective flags without excludingS', () => {
  for (const token of ['a.attnum<0', 'a.attacl::text', 'runtime_select', 'runtime_insert', 'runtime_update', 'runtime_references',
    'raw_column_privileges', 'supplier_code_sequence']) assert.ok(RAW_ATTRIBUTES_SQL.includes(token));
  assert.doesNotMatch(RAW_ATTRIBUTES_SQL, /relkind.*<>.*S/);
  const attrs = [['ctid', -1, 'tid'], ['xmin', -2, 'xid'], ['cmin', -3, 'cid'], ['xmax', -4, 'xid'], ['cmax', -5, 'cid'], ['tableoid', -6, 'oid']];
  const rows = ['S', 'r'].flatMap(kind => attrs.map(([name, number, type]) => ({ kind, relation: kind === 'S' ? 'supplier_code_sequence' : 'micro_extra',
    name, number, type, raw_attribute_acl: null, raw_column_privileges: [], runtime_select: kind === 'S', runtime_update: kind === 'S',
    runtime_insert: false, runtime_references: false, table_select: kind === 'S', table_update: kind === 'S' })));
  assert.doesNotThrow(() => assertInheritedRawRows(rows, true, true));
  for (const mutate of [copy => copy[0].raw_attribute_acl = '{explicit}', copy => copy[0].raw_column_privileges.push({ privilege: 'SELECT' }),
    copy => copy[0].name = 'xmin', copy => copy[0].number = -2, copy => copy[6].runtime_select = true]) {
    const copy = structuredClone(rows); mutate(copy); assert.throws(() => assertInheritedRawRows(copy, true, true), /SYSTEM_ATTRIBUTES|INHERITED_RIGHTS/);
  }
});
test('upstreamC bytes are exact documents, expressly not attested Debian build inputs', () => {
  assert.equal(contract.notDebianBuildSourceAttestation, true);
  for (const file of contract.upstream.files) {
    const bytes = readFileSync(path.join(WORK, file.localPath));
    assert.equal(bytes.length, file.bytes); assert.equal(SHA(bytes), file.sha256);
  }
});
test('explicit run requires a primitive independently supplied source manifest hash, no arbitrary target options', () => {
  assert.equal(settings([]), null); assert.equal(settings(['--help']), null);
  const result = settings(['--run-sequence-acl-micro', 'a'.repeat(64)]);
  assert.equal(result.id, PROPOSED.id); assert.equal(result.port, PROPOSED.port);
  assert.equal(result.durationMs, 300000); assert.equal(result.trustedSourceManifestSha256, 'a'.repeat(64));
  for (const args of [['--run-sequence-acl-micro'], ['--run-sequence-acl-micro', 'bad'], ['--run-sequence-acl-micro', 'a'.repeat(64), '--port=5432']])
    assert.throws(() => settings(args), /EXPLICIT_MICRO_FLAG/);
  let coerced = false;
  assert.throws(() => settings(['--run-sequence-acl-micro', { toString() { coerced = true; return 'a'.repeat(64); } }]), /OWN_PRIMITIVE/);
  assert.equal(coerced, false);
  const hidden = ['--help']; Object.defineProperty(hidden, 'hidden', { value: true });
  assert.throws(() => settings(hidden), /DENSE_PRIMITIVE/);
});
test('COMMIT uncertainty preserves first cause and synchronously closes every later physical query', async () => {
  const gate = createGlobalGate(), sent = [], cause = new Error('lost commit acknowledgement');
  const query = makeMicroQuery({ query(config) { sent.push(config.text); return Promise.resolve({ rows: [] }); } }, gate, createBudget(Date.now()));
  await assert.rejects(outcomeBoundary(gate, async () => { throw cause; }, 'MICRO_COMMIT_OUTCOME_UNKNOWN_NO_REPLAY'), error => error.cause === cause);
  const first = gate.reason();
  await assert.rejects(query('ROLLBACK'), /NO_PHYSICAL_SQL/);
  await assert.rejects(query('SELECT 1'), /NO_PHYSICAL_SQL/);
  gate.quarantine(new Error('later cleanup failure'));
  assert.equal(gate.reason(), first); assert.deepEqual(sent, []);
});
test('pending timeoutSET cannot dispatch SELECT after another captured client quarantines', async () => {
  const gate = createGlobalGate(), pending = deferred(), sent = [];
  const query = makeMicroQuery({ query(config) { sent.push(config.text); return sent.length === 1 ? pending.promise : Promise.resolve({ rows: [] }); } }, gate, createBudget(Date.now()));
  const result = query('SELECT 1'); await Promise.resolve();
  gate.quarantine(new Error('another client unknown commit')); pending.resolve({ rows: [] });
  await assert.rejects(result, /NO_PHYSICAL_SQL/);
  assert.equal(sent.length, 1); assert.match(sent[0], /^SET statement_timeout/);
});
test('postawait guard cannot dispatch a new observer query after globalunknown, and SET is also fenced', async () => {
  const gate = createGlobalGate(), guard = deferred(), sent = [];
  const query = makeMicroQuery({ query(config) { sent.push(config.text); return Promise.resolve({ rows: [] }); } }, gate, createBudget(Date.now()));
  const work = (async () => { await guard.promise; return query('SELECT observer'); })();
  gate.quarantine(new Error('unknown')); guard.resolve();
  await assert.rejects(work, /NO_PHYSICAL_SQL/); assert.deepEqual(sent, []);
});
test('unacknowledged setval/CREATE DATABASE also quarantine, without pretending transactional rollback reverses them', async () => {
  const gate = createGlobalGate(), cause = new Error('nontransactional acknowledgement lost');
  await assert.rejects(outcomeBoundary(gate, async () => { throw cause; }, 'MICRO_NONTRANSACTIONAL_OUTCOME_UNKNOWN_NO_REPLAY'), error => error.cause === cause);
  assert.equal(gate.quarantined(), true);
});
test('absolute budget expires before sourcework/queries and samecontrolID is required, not just shut-down text', () => {
  let now = 1; const budget = createBudget(1, 300000, () => now); now = 300001;
  assert.throws(() => budget.remaining(), /ABSOLUTE_DEADLINE/);
  const text = 'Database system identifier: 7703999999999999999\nDatabase cluster state: shut down\n';
  const good = { stdout: text, code: 0, timedOut: false, birthId: '7703999999999999999', targetId: '7703999999999999999' };
  assert.equal(stoppedControlEvidence(good).controlShutDown, true);
  assert.equal(stoppedControlEvidence({ ...good, targetId: '7703999999999999998' }).controlShutDown, false);
  assert.equal(stoppedControlEvidence({ ...good, birthId: null }).controlShutDown, false);
});
test('changed directory inode/UID/mode refuses physical identity and is never accepted by name alone', () => {
  const expected = { path: '/synthetic-owned-only', uid: 1000, mode: 448, device: 1, inode: 2 };
  const actual = { ...expected, canonical: true, symbolicLink: false };
  assert.doesNotThrow(() => assertPhysicalIdentity(expected, actual));
  for (const key of ['uid', 'mode', 'device', 'inode']) assert.throws(() => assertPhysicalIdentity(expected, { ...actual, [key]: actual[key] + 1 }), /IDENTITY|0700/);
  const child = { capturedPid: 700001, observedPid: 700001, processUid: 1000, expectedUid: 1000,
    executable: '/verified/postgres', expectedExecutable: '/verified/postgres', dataArg: '/private/new-data', expectedData: '/private/new-data' };
  assert.equal(assertCapturedProcess(child).pidFileRequiredForOwnedChildStop, false);
  assert.throws(() => assertCapturedProcess({ ...child, observedPid: 700002 }), /CHILD_PROCESS_IDENTITY/);
  assert.throws(() => assertCapturedProcess({ ...child, executable: '/foreign/postgres' }), /CHILD_PROCESS_IDENTITY/);
});
test('inherited commandtimeout helper waits TERM→KILL→definitive close before reporting timeout', async () => {
  const child = new EventEmitter(), scheduled = [], signals = [];
  child.exitCode = null; child.signalCode = null;
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = { on() {}, end() {} };
  child.kill = signal => { signals.push(signal); if (signal === 'SIGKILL') child.emit('close', null, 'SIGKILL'); return true; };
  const timers = { setTimeout(callback) { scheduled.push(callback); return callback; }, clearTimeout() {} };
  const work = runChildCommand(() => child, '/synthetic-no-real-process', [], { cwd: '/', env: {}, timeoutMs: 1, graceMs: 1, timers });
  scheduled.shift()(); await Promise.resolve();
  assert.deepEqual(signals, ['SIGTERM']); scheduled.shift()();
  const result = await work;
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']); assert.equal(result.definitiveClose, true); assert.equal(result.timedOut, true);
});
