import assert from 'node:assert/strict';
import test from 'node:test';
import { AsyncLeafRegistry, InactiveReadScopeError, LatestQuery, ReadContext, snapshotQueryParameters } from './index.ts';

// All identities, modules, parameters and results in this file are SYNTHETIC.
const identity = { accountId: 'synthetic-account-a', sessionRevision: 'session-1', permissionRevision: 'permission-1' };
function scope() { return new ReadContext(identity).createScope('synthetic-route-1', 'synthetic-entity-1'); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

test('registration is inert; only activated leaf and its styles load, then code is reused', async () => {
  const calls: string[] = [];
  const styles = deferred<void>();
  const registry = new AsyncLeafRegistry({
    opened: { load: async () => { calls.push('opened-code'); return { name: 'synthetic-module' }; }, loadStyles: () => { calls.push('opened-style'); return styles.promise; } },
    hidden: { load: async () => { calls.push('hidden-code'); return {}; } },
  }, { maxRetainedEntries: 1 });
  assert.deepEqual(calls, []);
  const result = registry.load('opened', scope());
  await tick();
  assert.deepEqual(calls, ['opened-code', 'opened-style']);
  assert.equal(registry.status('opened'), 'loading');
  assert.equal(registry.status('hidden'), 'unloaded');
  styles.resolve();
  assert.equal((await result).name, 'synthetic-module');
  await registry.load('opened', scope());
  assert.deepEqual(calls, ['opened-code', 'opened-style']);
});

test('shared code load keeps consumer cancellation separate', async () => {
  const module = deferred<string>();
  let starts = 0;
  const registry = new AsyncLeafRegistry({ drawer: { load: () => { starts += 1; return module.promise; } } }, { maxRetainedEntries: 1 });
  const a = scope();
  const b = scope();
  const first = registry.load('drawer', a);
  const second = registry.load('drawer', b);
  const rejected = assert.rejects(first, InactiveReadScopeError);
  a.dispose();
  await rejected;
  module.resolve('synthetic-drawer');
  assert.equal(await second, 'synthetic-drawer');
  assert.equal(starts, 1);
});

test('failed code or style leaves can retry without exposing a half-ready module', async () => {
  let attempts = 0;
  const registry = new AsyncLeafRegistry({
    leaf: { load: async () => 'synthetic-code', loadStyles: async () => { if (++attempts === 1) throw new Error('synthetic-style-failure'); } },
  }, { maxRetainedEntries: 1 });
  await assert.rejects(registry.load('leaf', scope()), /synthetic-style-failure/);
  assert.equal(registry.status('leaf'), 'unloaded');
  assert.equal(await registry.load('leaf', scope()), 'synthetic-code');
});

test('retained module references are LRU bounded; no cache eviction starts a load', async () => {
  const calls: string[] = [];
  const registry = new AsyncLeafRegistry({
    a: { load: async () => { calls.push('a'); return 'a'; } },
    b: { load: async () => { calls.push('b'); return 'b'; } },
    c: { load: async () => { calls.push('c'); return 'c'; } },
  }, { maxRetainedEntries: 2 });
  await registry.load('a', scope());
  await registry.load('b', scope());
  await registry.load('a', scope());
  await registry.load('c', scope());
  assert.equal(registry.status('b'), 'unloaded');
  assert.equal(registry.status('a'), 'loaded');
  assert.deepEqual(calls, ['a', 'b', 'c']);
  registry.clear();
  assert.equal(registry.status('a'), 'unloaded');
});

test('inactive scopes do not start imports', async () => {
  let starts = 0;
  const inactive = scope();
  inactive.dispose();
  const registry = new AsyncLeafRegistry({ leaf: { load: async () => { starts += 1; return 'never'; } } }, { maxRetainedEntries: 1 });
  await assert.rejects(registry.load('leaf', inactive), InactiveReadScopeError);
  assert.equal(starts, 0);
});

test('reads start only on run; frozen executed parameters do not follow editable draft', async () => {
  const reply = deferred<string>();
  const draft = { term: 'synthetic-a', page: 1, selected: ['id-1'] };
  let observed: Readonly<typeof draft> | null = null;
  const query = new LatestQuery<typeof draft, string>({ scope: scope(), execute: async ({ parameters }) => { observed = parameters; return reply.promise; } });
  assert.equal(query.getSnapshot().phase, 'idle');
  assert.equal(observed, null);
  const running = query.run(draft);
  draft.term = 'synthetic-unexecuted';
  draft.selected.push('id-2');
  assert.equal(query.getSnapshot().request?.parameters.term, 'synthetic-a');
  assert.equal(Object.isFrozen(query.getSnapshot().request?.parameters.selected), true);
  reply.resolve('synthetic-page-a');
  assert.deepEqual(await running, { status: 'success', data: 'synthetic-page-a' });
  assert.deepEqual(query.getSnapshot().success?.parameters.selected, ['id-1']);
});

test('newer query aborts old transport; ignored cancellation cannot overwrite newest result', async () => {
  const a = deferred<string>();
  const b = deferred<string>();
  const signals: AbortSignal[] = [];
  const query = new LatestQuery<{ term: string }, string>({ scope: scope(), execute: ({ parameters, signal }) => { signals.push(signal); return parameters.term === 'a' ? a.promise : b.promise; } });
  const first = query.run({ term: 'a' });
  const second = query.run({ term: 'b' });
  assert.equal(signals[0]?.aborted, true);
  assert.deepEqual(await first, { status: 'discarded', reason: 'superseded' });
  b.resolve('synthetic-b');
  await second;
  a.resolve('synthetic-a-late');
  await tick();
  assert.equal(query.getSnapshot().success?.data, 'synthetic-b');
});

test('refresh failure retains last successful facts and their own executed range', async () => {
  let fail = false;
  const error = new Error('synthetic-network-failure');
  const query = new LatestQuery<{ page: number }, string>({ scope: scope(), execute: async () => { if (fail) throw error; return 'synthetic-page-one'; } });
  await query.run({ page: 1 });
  fail = true;
  assert.deepEqual(await query.run({ page: 2 }), { status: 'error', error });
  assert.equal(query.getSnapshot().phase, 'error');
  assert.equal(query.getSnapshot().request?.parameters.page, 2);
  assert.equal(query.getSnapshot().success?.parameters.page, 1);
  assert.equal(query.getSnapshot().success?.data, 'synthetic-page-one');
});

test('switching account clears references immediately; late response cannot reopen a closed region', async () => {
  const context = new ReadContext(identity);
  const oldScope = context.createScope('synthetic-route');
  const reply = deferred<string>();
  const query = new LatestQuery<{ page: number }, string>({ scope: oldScope, execute: () => reply.promise });
  const running = query.run({ page: 1 });
  context.replaceIdentity({ ...identity, accountId: 'synthetic-account-b' });
  assert.equal(query.getSnapshot().phase, 'disposed');
  assert.equal(query.getSnapshot().success, null);
  assert.deepEqual(await running, { status: 'discarded', reason: 'disposed' });
  reply.resolve('synthetic-old-account-data');
  await tick();
  assert.equal(query.getSnapshot().phase, 'disposed');
  assert.equal(context.createScope('synthetic-route').identity.accountId, 'synthetic-account-b');
});

test('permission/session refresh invalidates even the same account; clear blocks new scopes', () => {
  const context = new ReadContext(identity);
  const first = context.createScope('synthetic-route');
  context.replaceIdentity({ ...identity });
  assert.equal(first.active, false);
  const second = context.createScope('synthetic-route');
  context.clear();
  assert.equal(second.active, false);
  assert.throws(() => context.createScope('synthetic-route'), /identity/);
});

test('different entity scopes have no shared result state, and closing one leaves another alive', async () => {
  const context = new ReadContext(identity);
  const a = context.createScope('synthetic-drawer-1', 'entity-a');
  const b = context.createScope('synthetic-drawer-2', 'entity-b');
  const first = new LatestQuery<{}, string>({ scope: a, execute: async ({ entityId }) => entityId! });
  const second = new LatestQuery<{}, string>({ scope: b, execute: async ({ entityId }) => entityId! });
  await Promise.all([first.run({}), second.run({})]);
  a.dispose();
  assert.equal(first.getSnapshot().success, null);
  assert.equal(second.getSnapshot().success?.data, 'entity-b');
  assert.equal(b.active, true);
});

test('authoritative command result beats old detail read and rejects later older entity versions', async () => {
  const read = deferred<{ version: bigint; label: string }>();
  const query = new LatestQuery<{ id: string }, { version: bigint; label: string }>({ scope: scope(), execute: () => read.promise, versionOf: (data) => data.version });
  const old = query.run({ id: 'synthetic-entity-1' });
  query.acceptAuthoritative({ id: 'synthetic-entity-1' }, { version: 4n, label: 'synthetic-command-result' });
  assert.deepEqual(await old, { status: 'discarded', reason: 'superseded' });
  read.resolve({ version: 3n, label: 'synthetic-old-detail' });
  await tick();
  assert.equal(query.getSnapshot().success?.data.version, 4n);
  assert.deepEqual(await query.run({ id: 'synthetic-entity-1' }), { status: 'discarded', reason: 'older-version' });
  assert.equal(query.getSnapshot().phase, 'stale');
  assert.equal(query.getSnapshot().success?.data.version, 4n);
  assert.throws(() => query.acceptAuthoritative({ id: 'synthetic-entity-1' }, { version: 2n, label: 'wrong' }), /regress/);
});

test('cancel read is not dispose and does not clear previous successful facts', async () => {
  let pending = false;
  const reply = deferred<string>();
  const query = new LatestQuery<{}, string>({ scope: scope(), execute: async () => pending ? reply.promise : 'synthetic-success' });
  await query.run({});
  pending = true;
  const reading = query.run({});
  query.cancel();
  assert.deepEqual(await reading, { status: 'discarded', reason: 'superseded' });
  assert.equal(query.getSnapshot().phase, 'success');
  assert.equal(query.getSnapshot().success?.data, 'synthetic-success');
  reply.reject(new Error('synthetic-late-failure'));
  await tick();
  assert.equal(query.getSnapshot().phase, 'success');
});

test('invalid parameter snapshot does not supersede a valid pending request', async () => {
  const reply = deferred<string>();
  const query = new LatestQuery<{ term: unknown }, string>({ scope: scope(), execute: () => reply.promise });
  const running = query.run({ term: 'synthetic-valid' });
  await assert.rejects(query.run({ term: new Date() }), /plain read parameters/);
  reply.resolve('synthetic-valid-result');
  assert.deepEqual(await running, { status: 'success', data: 'synthetic-valid-result' });
  assert.equal(query.getSnapshot().success?.parameters.term, 'synthetic-valid');
});

test('subscriber errors and reentrant disposal cannot bypass cleanup or start an unwanted read', async () => {
  const current = scope();
  const errors: unknown[] = [];
  let reads = 0;
  const query = new LatestQuery<{}, string>({ scope: current, execute: async () => { reads += 1; return 'never'; }, onSubscriberError: (error) => errors.push(error) });
  query.subscribe(() => { throw new Error('synthetic-render-error'); });
  query.subscribe(() => { if (query.getSnapshot().phase === 'loading') current.dispose(); });
  assert.deepEqual(await query.run({}), { status: 'discarded', reason: 'disposed' });
  assert.equal(reads, 0);
  assert.equal(query.getSnapshot().phase, 'disposed');
  assert.equal(errors.length, 2);
});

test('plain parameter snapshots reject cyclic, nonfinite and accessor input without invoking getters', () => {
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert.throws(() => snapshotQueryParameters(cyclic), /cyclic/);
  assert.throws(() => snapshotQueryParameters({ value: Number.NaN }), /plain finite/);
  let invoked = false;
  const accessor = { get value() { invoked = true; return 'unexpected'; } };
  assert.throws(() => snapshotQueryParameters(accessor), /accessors/);
  assert.equal(invoked, false);
});

test('disposing during success notification returns discarded rather than actionable old data', async () => {
  const current = scope();
  const query = new LatestQuery<{}, string>({ scope: current, execute: async () => 'synthetic-sensitive-result' });
  query.subscribe(() => { if (query.getSnapshot().phase === 'success') current.dispose(); });
  assert.deepEqual(await query.run({}), { status: 'discarded', reason: 'disposed' });
  assert.equal(query.getSnapshot().success, null);
});

test('cancel before any successful read returns waiting state rather than false empty success', async () => {
  const reply = deferred<string[]>();
  const query = new LatestQuery<{}, string[]>({ scope: scope(), execute: () => reply.promise });
  const pending = query.run({});
  query.cancel();
  assert.deepEqual(await pending, { status: 'discarded', reason: 'superseded' });
  assert.equal(query.getSnapshot().phase, 'idle');
  assert.equal(query.getSnapshot().success, null);
  reply.resolve([]);
});

test('registration snapshots factories and validates the retained-reference budget', async () => {
  const definition = { load: async () => 'synthetic-original' };
  const registry = new AsyncLeafRegistry({ leaf: definition }, { maxRetainedEntries: 1 });
  definition.load = async () => 'synthetic-replaced';
  assert.equal(await registry.load('leaf', scope()), 'synthetic-original');
  assert.throws(() => new AsyncLeafRegistry({}, { maxRetainedEntries: 0 }), /positive safe integer/);
  assert.throws(() => new AsyncLeafRegistry({}, { maxRetainedEntries: Number.POSITIVE_INFINITY }), /positive safe integer/);
});

test('clearing references during an import does not create unbounded duplicate in-flight loads', async () => {
  const reply = deferred<string>();
  let starts = 0;
  const registry = new AsyncLeafRegistry({ leaf: { load: () => { starts += 1; return reply.promise; } } }, { maxRetainedEntries: 1 });
  const first = registry.load('leaf', scope());
  await tick();
  registry.clear();
  const second = registry.load('leaf', scope());
  await tick();
  assert.equal(starts, 1);
  reply.resolve('synthetic-shared');
  assert.deepEqual(await Promise.all([first, second]), ['synthetic-shared', 'synthetic-shared']);
  assert.equal(registry.status('leaf'), 'loaded');
});

test('clear without reactivation does not retain an import after settlement', async () => {
  const reply = deferred<string>();
  const registry = new AsyncLeafRegistry({ leaf: { load: () => reply.promise } }, { maxRetainedEntries: 1 });
  const first = registry.load('leaf', scope());
  registry.clear();
  reply.resolve('synthetic-detached');
  assert.equal(await first, 'synthetic-detached');
  assert.equal(registry.status('leaf'), 'unloaded');
});
