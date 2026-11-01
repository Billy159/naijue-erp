/** Pure fake sends only. No target/SQL execution and NO actual latency claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createCurrentRuntimeQueryMetrics, assertCurrentRuntimeQueryMetrics, observeCapturedRuntimeQuery } from './current-runtime-query-metrics.mjs';
import { NATIVE_RUNTIME26_HISTORY_DRAFT_SEQUENCE_SYSTEM_METADATA_PROBE } from '../../../../../adapters/postgres/src/native-import-accounting-capability.ts';
import { COMPLETE_SCOPE_DECISION } from '../../../../../packages/application/src/inventory-cutoff-import.ts';
const id = '10000000-0000-4000-8000-000000000001';
const q = (text = 'SELECT $1::uuid', values = [id]) => ({ text, values, query_timeout: 45000 });
const fake = async () => ({ rows: [] });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const take = async (m, work) => { await m.sampleService('pure-fake-not-latency', work); return m.takeSample(); };

test('brand, explicit window and pure JSON report; no injected clock or service result retained', async () => {
  const m = createCurrentRuntimeQueryMetrics(); assert.equal(assertCurrentRuntimeQueryMetrics(m), m);
  assert.throws(() => assertCurrentRuntimeQueryMetrics({ ...m })); assert.throws(() => createCurrentRuntimeQueryMetrics({ safeSourceTextValues: [], now: () => 1n }));
  const secretResult = { client: { password: 'MUST_NOT_BE_LOGGED' } };
  assert.equal(await m.sampleService('pure-fake', async () => { await observeCapturedRuntimeQuery(m, q(), async () => secretResult); return secretResult; }), undefined);
  const r = m.takeSample(); assert.equal(r.status, 'VALID_SAMPLE'); assert.equal(r.queryCount, 1); assert.equal(r.events[0].sql, q().text);
  assert.equal(r.events[0].sqlSha256, createHash('sha256').update(q().text).digest('hex')); assert.deepEqual(r.events[0].bindings, [id]);
  assert.match(r.serviceWallNs, /^[0-9]+$/); assert.match(r.events[0].capturedQueryWallNs, /^[0-9]+$/);
  assert.equal(JSON.stringify(r).includes('MUST_NOT_BE_LOGGED'), false); assert.deepEqual(JSON.parse(JSON.stringify(r)), r); assert.ok(Object.isFrozen(r.events[0].bindings));
  assert.throws(() => m.takeSample());
});
test('outside a sampling window returns the original promise without collection or value inspection', () => {
  const m = createCurrentRuntimeQueryMetrics(), p = Promise.resolve({}); let reads = 0;
  const bad = { get text() { reads++; throw Error('NO'); } };
  assert.equal(observeCapturedRuntimeQuery(m, bad, () => p), p); assert.equal(reads, 0); assert.throws(() => m.takeSample());
});
test('active tap preserves original Promise/config/binding identities and never freezes or mutates caller arrays', async () => {
  const m = createCurrentRuntimeQueryMetrics(), values = [[id]], config = q('SELECT $1', values), original = Promise.resolve({ rows: [] });
  await m.sampleService('identity-fake', async () => {
    const returned = observeCapturedRuntimeQuery(m, config, () => { assert.equal(config.values, values); return original; });
    assert.equal(returned, original); await returned;
  });
  const r = m.takeSample(); assert.equal(Object.isFrozen(values), false); assert.equal(Object.isFrozen(values[0]), false); values[0].push(id); assert.deepEqual(r.events[0].bindings, [[id]]);
});
test('no observed runtime sends is invalid; retain only one completed sample', async () => {
  const m = createCurrentRuntimeQueryMetrics(); await m.sampleService('empty', async () => {});
  await assert.rejects(m.sampleService('second', async () => {}), /TAKE_PREVIOUS_SAMPLE/);
  const r = m.takeSample(); assert.equal(r.status, 'INVALID_SAMPLE'); assert.equal(r.queryCount, null); assert.ok(r.reasons.includes('NO_CAPTURED_RUNTIME_QUERY_IN_WINDOW'));
});
test('safe exact primitives/arrays/source literals retained for separate EXPLAIN, not toPostgres objects', async () => {
  const m = createCurrentRuntimeQueryMetrics({ safeSourceTextValues: ['SOURCE_REVIEWED_ENUM'] });
  const values = [null, true, false, 5, '-12.34', '2026-11-01T00:00:00.000Z', [id, []], 'SOURCE_REVIEWED_ENUM'];
  const r = await take(m, () => observeCapturedRuntimeQuery(m, q('SELECT $1', values), fake)); assert.equal(r.status, 'VALID_SAMPLE'); assert.deepEqual(r.events[0].bindings, values);
});
test('original full34216-byte metadata probe and only fixed source decision/basis literals fit; MOCK not PG timing', async () => {
  const probe = NATIVE_RUNTIME26_HISTORY_DRAFT_SEQUENCE_SYSTEM_METADATA_PROBE;
  assert.equal(Buffer.byteLength(probe), 34216); assert.equal(createHash('sha256').update(probe).digest('hex'), '91e6bb912cc409e68f91be5123aae44667c8b7f3db109ffa5910cd8a641ec4ae');
  const m = createCurrentRuntimeQueryMetrics({ safeSourceTextValues: [COMPLETE_SCOPE_DECISION, 'CUTOFF_MEMBER', 'POST_CUTOFF_CREATED'] });
  const r = await take(m, async () => { await observeCapturedRuntimeQuery(m, q(probe, []), fake); await observeCapturedRuntimeQuery(m, q('SELECT $1,$2,$3', [COMPLETE_SCOPE_DECISION, 'CUTOFF_MEMBER', 'POST_CUTOFF_CREATED']), fake); });
  assert.equal(r.status, 'VALID_SAMPLE'); assert.equal(r.queryCount, 2); assert.equal(r.events[0].sql, probe);
});
test('unsafe objects, text, getters, holes, nonintegers and credential SQL invalidate without logging input or changing send', async () => {
  let getters = 0;
  const accessor = []; Object.defineProperty(accessor, '0', { enumerable: true, get() { getters++; throw Error('GETTER'); } }); accessor.length = 1;
  const holes = Array(1); const dangerous = { toPostgres() { throw Error('MUST_NOT_CALL'); }, password: 'HIDDEN' };
  for (const config of [q('SELECT $1', [dangerous]), q('SELECT $1', ['ARBITRARY_SECRET_VALUE']), q('SELECT $1', accessor), q('SELECT $1', holes), q('SELECT $1', [NaN]), q('SELECT $1', [-0]), q('SELECT $1', [1.5]), q("ALTER ROLE x PASSWORD 'HIDDEN'", [])]) {
    const m = createCurrentRuntimeQueryMetrics(); let sent = 0;
    const r = await take(m, () => observeCapturedRuntimeQuery(m, config, async () => { sent++; return {}; }));
    assert.equal(sent, 1); assert.equal(r.status, 'INVALID_SAMPLE'); assert.ok(r.reasons.includes('COLLECTION_INPUT_REJECTED')); assert.equal(r.events[0].bindings, null);
    assert.equal(JSON.stringify(r).includes('HIDDEN'), false); assert.equal(JSON.stringify(r).includes('ARBITRARY_SECRET'), false);
  }
  assert.equal(getters, 0); assert.throws(() => createCurrentRuntimeQueryMetrics({ safeSourceTextValues: ['a password'] }));
});
test('query rejection and service failure preserve exact original error, cancellation code only; never result/error messages', async () => {
  const m = createCurrentRuntimeQueryMetrics(), cause = Object.assign(Error('CREDENTIAL_MUST_NOT_LOG'), { code: '57014' }); let sent = 0;
  await assert.rejects(m.sampleService('cancelled', () => observeCapturedRuntimeQuery(m, q(), async () => { sent++; throw cause; })), e => e === cause);
  const r = m.takeSample(); assert.equal(sent, 1); assert.equal(r.status, 'INVALID_SAMPLE'); assert.equal(r.events[0].errorCode, '57014'); assert.equal(r.events[0].status, 'REJECTED'); assert.equal(JSON.stringify(r).includes(cause.message), false);
});
test('a hostile error code descriptor cannot replace the original rejection', async () => {
  const m = createCurrentRuntimeQueryMetrics(), error = new Proxy({}, { getOwnPropertyDescriptor() { throw Error('metadata trap'); } });
  await assert.rejects(m.sampleService('error-proxy', () => observeCapturedRuntimeQuery(m, q(), async () => { throw error; })), e => e === error);
  const r = m.takeSample(); assert.equal(r.status, 'INVALID_SAMPLE'); assert.ok(r.reasons.includes('COLLECTION_ERROR_CODE_REJECTED'));
});
test('synchronous fence failure has no proved wire count and retains the exact original error', async () => {
  const m = createCurrentRuntimeQueryMetrics(), cause = Error('NO_PHYSICAL_SQL_AFTER_UNKNOWN_COMMIT');
  await assert.rejects(m.sampleService('sync-throw', () => observeCapturedRuntimeQuery(m, q(), () => { throw cause; })), e => e === cause);
  const r = m.takeSample(); assert.equal(r.queryCount, null); assert.equal(r.events[0].status, 'SYNC_THROW_UNCONFIRMED_SEND');
});
test('concurrent calls are not serialized or retried and must invalidate the sample', async () => {
  const m = createCurrentRuntimeQueryMetrics(), a = deferred(); let sends = 0;
  const r = await take(m, async () => {
    const first = observeCapturedRuntimeQuery(m, q(), () => { sends++; return a.promise; });
    const second = observeCapturedRuntimeQuery(m, q(), async () => { sends++; return {}; }); a.resolve({}); await Promise.all([first, second]);
  });
  assert.equal(sends, 2); assert.equal(r.status, 'INVALID_SAMPLE'); assert.equal(r.observedCapturedQueryCalls, 2); assert.ok(r.reasons.includes('CONCURRENT_CAPTURED_QUERIES'));
});
test('concurrent service windows invalidate the active sample; second work does not pretend to be measured', async () => {
  const m = createCurrentRuntimeQueryMetrics(), hold = deferred(); let second = false;
  const first = m.sampleService('first', async () => { await observeCapturedRuntimeQuery(m, q(), fake); await hold.promise; });
  await assert.rejects(m.sampleService('second', async () => { second = true; }), /CONCURRENT_SERVICE_WINDOWS/); hold.resolve(); await first;
  assert.equal(second, false); assert.ok(m.takeSample().reasons.includes('CONCURRENT_SERVICE_WINDOWS'));
});
test('pending send outliving the explicit window is invalid and cannot mutate returned report', async () => {
  const m = createCurrentRuntimeQueryMetrics(), done = deferred(); let pending;
  await m.sampleService('too-short', () => { pending = observeCapturedRuntimeQuery(m, q(), () => done.promise); });
  const r = m.takeSample(), before = JSON.stringify(r); assert.ok(r.reasons.includes('QUERY_OUTLIVED_SERVICE_WINDOW')); done.resolve({}); await pending; assert.equal(JSON.stringify(r), before);
  await assert.rejects(m.sampleService('next', async () => {}), /METRICS_WINDOW_BOUNDARY_LOST/);
});
test('recoverable recording failure invalidates but still sends the untouched original once', async t => {
  const m = createCurrentRuntimeQueryMetrics(); let sent = 0;
  t.mock.method(Buffer, 'byteLength', () => { throw Error('collector fault'); });
  const r = await take(m, () => observeCapturedRuntimeQuery(m, q(), async () => { sent++; return {}; }));
  assert.equal(sent, 1); assert.equal(r.status, 'INVALID_SAMPLE'); assert.ok(r.reasons.includes('COLLECTION_RECORDING_FAILED')); assert.equal(r.unrecordedEvents, 1);
});
test('secondary finalization failure never replaces original service/unknown-COMMIT error or claims a valid sample', async t => {
  for (const failed of [true, false]) {
    const m = createCurrentRuntimeQueryMetrics(), original = Error('ORIGINAL_UNKNOWN_COMMIT');
    const restore = Object.values;
    t.mock.method(Object, 'values', () => { throw Error('secondary collector failure'); });
    const run = () => m.sampleService('finalize-fault', async () => { await observeCapturedRuntimeQuery(m, q(), fake); if (failed) throw original; });
    if (failed) await assert.rejects(run(), error => error === original); else await run();
    const r = m.takeSample(); assert.equal(r.status, 'INVALID_SAMPLE'); assert.deepEqual(r.reasons, ['COLLECTION_FINALIZATION_FAILED']); assert.equal(r.queryCount, null);
    Object.values = restore;
  }
});
test('query count overflow keeps all sends but invalidates rather than returning truncated PASS', async () => {
  const m = createCurrentRuntimeQueryMetrics(); let sends = 0;
  const r = await take(m, async () => { for (let i = 0; i < 513; i++) await observeCapturedRuntimeQuery(m, q(), async () => { sends++; return {}; }); });
  assert.equal(sends, 513); assert.equal(r.events.length, 512); assert.equal(r.observedCapturedQueryCalls, 513); assert.equal(r.unrecordedEvents, 1); assert.equal(r.status, 'INVALID_SAMPLE'); assert.ok(r.reasons.includes('QUERY_COUNT_LIMIT'));
});
test('SQL, aggregate binding elements/bytes and sample RAM limits fail closed without suppressing sends', async () => {
  for (const config of [q('x'.repeat(128 * 1024 + 1), []), q('SELECT $1', [Array(20000).fill(Array(2).fill(1))]), q('SELECT $1', [Array(100).fill('9'.repeat(8192))])]) {
    const m = createCurrentRuntimeQueryMetrics(); let sent = 0; const r = await take(m, () => observeCapturedRuntimeQuery(m, config, async () => { sent++; return {}; })); assert.equal(sent, 1); assert.equal(r.status, 'INVALID_SAMPLE');
  }
  const m = createCurrentRuntimeQueryMetrics({ safeSourceTextValues: ['a'.repeat(2048)] });
  const r = await take(m, async () => { for (let i = 0; i < 50; i++) await observeCapturedRuntimeQuery(m, q('SELECT $1', [Array(50).fill('a'.repeat(2048))]), fake); });
  assert.equal(r.status, 'INVALID_SAMPLE'); assert.ok(r.reasons.includes('SAMPLE_BYTE_LIMIT')); assert.ok(r.unrecordedEvents > 0);
});
test('non-Promise/callback-style send remains unchanged but cannot qualify a timed sample', async () => {
  const m = createCurrentRuntimeQueryMetrics(), raw = {};
  const r = await take(m, () => { assert.equal(observeCapturedRuntimeQuery(m, q(), () => raw), raw); }); assert.ok(r.reasons.includes('NONPROMISE_QUERY_RESULT'));
});
test('module has real monotonic clock but no driver/connection/files/process/SQL execution or injected clock', async () => {
  const text = await readFile(new URL('./current-runtime-query-metrics.mjs', import.meta.url), 'utf8');
  assert.match(text, /const now = hrtime\.bigint/); assert.doesNotMatch(text, /from ['"]pg['"]|new (?:Client|Pool)\(|\.connect\(|\.query\(|writeFile|spawn\(|Date\.now\(|setTimeout\(/);
});
