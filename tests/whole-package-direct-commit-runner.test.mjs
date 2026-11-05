import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const exclusiveWindow = { exclusiveClients: true, noConcurrentDdlAclAdminChanges: true };
const url = new URL('./integration/whole-package-direct-commit.mjs', import.meta.url);
test('direct COMMIT acceptance cases register without invoking setup or database work', async () => {
  const { registerWholePackageDirectCommit, WHOLE_DIRECT_COMMIT_MODES } = await import(url);
  const registrations = [];
  const bindings = Object.fromEntries(WHOLE_DIRECT_COMMIT_MODES.map((mode, i) => [mode, { database_name: 'synthetic_whole_case' + i, database_oid: String(i + 1), system_identifier: '12345', server_address: '127.0.0.1', server_port: 55432 }]));
  registerWholePackageDirectCommit((name, run) => registrations.push({ name, run }), () => assert.fail('No setup during registration'), bindings, undefined, exclusiveWindow);
  assert.deepEqual(WHOLE_DIRECT_COMMIT_MODES, ['prepare-direct-commit-failure', 'baseline-direct-commit-failure', 'complete-direct-commit-success']);
  assert.equal(registrations.length, 3);
  assert.ok(registrations.every(x => typeof x.run === 'function'));
});
test('real-client runner never substitutes finish, constraint forcing or synthetic SQL replies for direct COMMIT', async () => {
  const s = await readFile(url, 'utf8');
  assert.doesNotMatch(s, /standard_whole_package_finish_v2|SET CONSTRAINTS|process\.env|new Client|new Pool|\.connect\(/);
  assert.match(s, /await control\(writer, 'COMMIT', 'COMMIT'\)/);
  assert.match(s, /assert\.rejects\([\s\S]*?writer\.query\('COMMIT'\)/);
  assert.match(s, /error\.code === '23514'/);
  assert.match(s, /snapshot\(observer\), before/);
  assert.match(s, /await f\.assertPublished\(observer, receipt\.summary\)/);
  assert.match(s, /await f\.close\(\)/);
});

test('no target binding or non-synthetic target is rejected before registration', async () => {
  const { registerWholePackageDirectCommit, WHOLE_DIRECT_COMMIT_MODES } = await import(url);
  const forbidden = () => assert.fail('Must not register or open a target');
  assert.throws(() => registerWholePackageDirectCommit(forbidden, forbidden), /EXPLICIT_SYNTHETIC_TARGET_BINDINGS_REQUIRED/);
  const bindings = Object.fromEntries(WHOLE_DIRECT_COMMIT_MODES.map(mode => [mode, { database_name: 'production', database_oid: '1', system_identifier: '12345', server_address: '127.0.0.1', server_port: 55432 }]));
  assert.throws(() => registerWholePackageDirectCommit(forbidden, forbidden, bindings), /EXPLICIT_SYNTHETIC_TARGET_BINDINGS_REQUIRED/);
});
test('physical target uses PostgreSQL host normalization rather than CIDR text', async () => {
  const s = await readFile(url, 'utf8');
  assert.match(s, /pg_catalog\.host\(pg_catalog\.inet_server_addr\(\)\) AS server_address/);
  assert.doesNotMatch(s, /inet_server_addr\(\)::text/);
  assert.match(s, /\['127\.0\.0\.1', '::1'\]\.includes\(row\.server_address\)/);
});
test('loopback aliases cannot admit the same physical database twice', async () => {
  const { registerWholePackageDirectCommit, WHOLE_DIRECT_COMMIT_MODES } = await import(url);
  const bindings = Object.fromEntries(WHOLE_DIRECT_COMMIT_MODES.map((mode, i) => [mode, { database_name: 'synthetic_whole_case' + i, database_oid: '42', system_identifier: '12345', server_address: i ? '::1' : '127.0.0.1', server_port: 55432 + i }]));
  assert.throws(() => registerWholePackageDirectCommit(() => {}, () => {}, bindings), /DISTINCT_PHYSICAL_SYNTHETIC_TARGETS_REQUIRED/);
});
test('one explicitly selected case can use one independently installed trusted target record', async () => {
  const { registerWholePackageDirectCommit, WHOLE_DIRECT_COMMIT_MODES } = await import(url);
  const bindings = Object.fromEntries(WHOLE_DIRECT_COMMIT_MODES.map((mode, i) => [mode, { database_name: 'synthetic_whole_case' + i, database_oid: String(i + 1), system_identifier: '12345', server_address: '127.0.0.1', server_port: 55432 }]));
  const registered = [];
  registerWholePackageDirectCommit(name => registered.push(name), () => assert.fail('Not executed'), bindings, WHOLE_DIRECT_COMMIT_MODES[1], exclusiveWindow);
  assert.deepEqual(registered, ['actual SQL deferred direct commit: baseline-direct-commit-failure']);
  assert.throws(() => registerWholePackageDirectCommit(() => {}, () => {}, bindings, 'unknown'), /DIRECT_COMMIT_CASE_INVALID/);
});
test('exclusive-client and no-admin-change window acknowledgment is required before registration', async () => {
  const { registerWholePackageDirectCommit, WHOLE_DIRECT_COMMIT_MODES } = await import(url);
  const bindings = Object.fromEntries(WHOLE_DIRECT_COMMIT_MODES.map((mode, i) => [mode, { database_name: 'synthetic_whole_case' + i, database_oid: String(i + 1), system_identifier: '12345', server_address: '127.0.0.1', server_port: 55432 }]));
  for (const acknowledgment of [undefined, {}, { exclusiveClients: true }, { noConcurrentDdlAclAdminChanges: true }])
    assert.throws(() => registerWholePackageDirectCommit(() => assert.fail('Must not register'), () => assert.fail('Must not open'), bindings, undefined, acknowledgment), /EXCLUSIVE_ACCEPTANCE_WINDOW_ACK_REQUIRED/);
});
test('successor admission selection is a fixed enum, not a callback or approval boolean', async () => {
  const { registerWholePackageDirectCommit, WHOLE_DIRECT_COMMIT_MODES } = await import(url);
  const bindings = Object.fromEntries(WHOLE_DIRECT_COMMIT_MODES.map((mode, i) => [mode, { database_name: 'synthetic_whole_case' + i, database_oid: String(i + 1), system_identifier: '12345', server_address: '127.0.0.1', server_port: 55432 }]));
  for (const profile of [true, {}, () => {}, 'unknown']) assert.throws(() => registerWholePackageDirectCommit(() => {}, () => {}, bindings, undefined, exclusiveWindow, profile), /ACCEPTANCE_CATALOG_PROFILE_INVALID/);
  let registered = 0;
  registerWholePackageDirectCommit(() => registered++, () => assert.fail('No execution'), bindings, WHOLE_DIRECT_COMMIT_MODES[0], exclusiveWindow, 'WHOLE_BATCH_CLOSURE_V1');
  assert.equal(registered, 1);
});
test('overlapping setup closes only its fresh client without touching the active shared client', async () => {
  // Cleanup-only adversarial fixture: no SQL response, admission or import success
  // is simulated. The first read is held and then deliberately rejected.
  const { registerWholePackageDirectCommit, WHOLE_DIRECT_COMMIT_MODES } = await import(url);
  const bindings = Object.fromEntries(WHOLE_DIRECT_COMMIT_MODES.map((mode, i) => [mode, { database_name: 'synthetic_whole_case' + i, database_oid: String(i + 1), system_identifier: '12345', server_address: '127.0.0.1', server_port: 55432 }]));
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise((_, reject) => { release = () => reject(Error('EXPECTED_EARLY_READ_FAILURE')); });
  let sharedClosed = 0, originalClosed = 0, freshClosed = 0, overlapCloseCalled = 0;
  const shared = { query() { entered(); return pending; }, async end() { sharedClosed++; } };
  const original = { async end() { originalClosed++; } };
  const fresh = { query() { assert.fail('Rejected overlap must not query'); }, async end() { freshClosed++; } };
  const callbacks = [];
  registerWholePackageDirectCommit((_, run) => callbacks.push(run), async mode => mode === WHOLE_DIRECT_COMMIT_MODES[0]
    ? { writer: shared, observer: original, syntheticIsolated: true, async close() { await shared.end(); await original.end(); } }
    : { writer: shared, observer: fresh, syntheticIsolated: true, async close() { overlapCloseCalled++; await shared.end(); await fresh.end(); } }, bindings, undefined, exclusiveWindow);
  const first = assert.rejects(callbacks[0](), /EXPECTED_EARLY_READ_FAILURE/);
  await started;
  try {
    await assert.rejects(callbacks[1](), /ACCEPTANCE_CLIENT_ALREADY_IN_USE/);
    assert.equal(sharedClosed, 0); assert.equal(originalClosed, 0); assert.equal(freshClosed, 1); assert.equal(overlapCloseCalled, 0);
  } finally { release(); await first; }
  assert.equal(sharedClosed, 1); assert.equal(originalClosed, 1);
});
