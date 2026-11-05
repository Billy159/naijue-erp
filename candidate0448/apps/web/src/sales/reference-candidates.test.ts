import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext, ReadScope } from '../loading/read-scope.ts';
import type { SalesReferencePage, SalesReferenceReader } from './contracts.ts';
import { SalesReferenceCandidates, SALES_REFERENCE_CANDIDATE_LIMIT } from './reference-candidates.ts';
import { uuid } from './tests/fixtures.ts';

const identity = { accountId: 'TEST', sessionRevision: '1', permissionRevision: '1' };
function setup(reader: SalesReferenceReader) {
  const context = new ReadContext(identity);
  const parent = context.createScope('TEST');
  const scope = new ReadScope(parent.identity, 'TEST:reference-popup', null, () => {});
  const abort = () => scope.dispose();
  parent.signal.addEventListener('abort', abort, { once: true });
  scope.signal.addEventListener('abort', () => parent.signal.removeEventListener('abort', abort), { once: true });
  return { context, parent, scope, query: new SalesReferenceCandidates(scope, reader, 'customer') };
}
function page(total: number, page = 1): SalesReferencePage {
  return { page, exactTotal: String(total), items: Array.from({ length: Math.min(20, Math.max(0, total - (page - 1) * 20)) }, (_, index) => {
    const n = (page - 1) * 20 + index + 1;
    return { id: uuid(n), label: `TEST 客户 ${n}` };
  }) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('construction and reset are inert; the first explicit load carries bounded reference parameters and identity', async () => {
  let calls = 0;
  const { parent, scope, query } = setup({ async readReferences(read) {
    calls++;
    assert.deepEqual({ ...read.parameters }, { kind: 'customer', search: 'TEST', page: 1, pageSize: 20 });
    assert.deepEqual(read.identity, identity);
    assert.equal(read.routeInstanceId, scope.routeInstanceId);
    assert.equal(read.entityId, null);
    return page(2);
  } });
  assert.equal(query.getSnapshot().phase, 'idle');
  query.reset('  TEST  ');
  assert.equal(calls, 0);
  assert.equal(query.getSnapshot().search, 'TEST');
  await query.loadNext();
  assert.equal(calls, 1);
  const snapshot = query.getSnapshot();
  assert.equal(snapshot.phase, 'success');
  assert.deepEqual(snapshot.items, page(2).items);
  assert.equal(snapshot.exactTotal, '2');
  assert.equal(snapshot.unfilteredTotal, null);
  assert.equal(snapshot.page, 1);
  assert.equal(snapshot.hasMore, false);
  assert.equal(snapshot.completeUniverse, false);
  await query.loadNext();
  assert.equal(calls, 1);
  parent.dispose();
});

test('repeated scroll requests serialize synchronously and completion never eagerly fetches another page', async () => {
  const waiting = deferred<SalesReferencePage>();
  const calls: number[] = [];
  const { parent, query } = setup({ async readReferences(read) { calls.push(read.parameters.page); return calls.length === 1 ? waiting.promise : page(21, read.parameters.page); } });
  const pending = query.loadNext();
  await query.loadNext(); await query.loadNext();
  assert.deepEqual(calls, [1]);
  assert.equal(query.getSnapshot().phase, 'loading');
  waiting.resolve(page(21)); await pending;
  assert.deepEqual(calls, [1]);
  assert.equal(query.getSnapshot().hasMore, true);
  await query.loadNext();
  assert.deepEqual(calls, [1, 2]);
  assert.equal(query.getSnapshot().items.length, 21);
  assert.equal(query.getSnapshot().hasMore, false);
  parent.dispose();
});

test('explicit scrolls retain at most 200 candidates without changing the exact total or pretending the universe is complete', async () => {
  const calls: number[] = [];
  const { parent, query } = setup({ async readReferences(read) { calls.push(read.parameters.page); return page(214, read.parameters.page); } });
  for (let index = 0; index < 15; index++) await query.loadNext();
  const snapshot = query.getSnapshot();
  assert.deepEqual(calls, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(snapshot.items.length, SALES_REFERENCE_CANDIDATE_LIMIT);
  assert.equal(snapshot.exactTotal, '214');
  assert.equal(snapshot.unfilteredTotal, '214');
  assert.equal(snapshot.page, 10);
  assert.equal(snapshot.hasMore, true);
  assert.equal(snapshot.limitReached, true);
  assert.equal(snapshot.completeUniverse, false);
  parent.dispose();
});

test('only an unsearched single complete response proves a universe, including the empty set but never accumulated pages', async () => {
  let total = 2;
  const { parent, query } = setup({ async readReferences(read) { return page(total, read.parameters.page); } });
  await query.loadNext();
  assert.equal(query.getSnapshot().completeUniverse, true);
  query.reset('客户'); await query.loadNext();
  assert.equal(query.getSnapshot().completeUniverse, false);
  assert.equal(query.getSnapshot().unfilteredTotal, '2');
  total = 21; query.reset(''); await query.loadNext(); await query.loadNext();
  assert.equal(query.getSnapshot().items.length, 21);
  assert.equal(query.getSnapshot().hasMore, false);
  assert.equal(query.getSnapshot().completeUniverse, false);
  total = 0; query.reset('   '); await query.loadNext();
  assert.equal(query.getSnapshot().completeUniverse, true);
  assert.equal(query.getSnapshot().exactTotal, '0');
  assert.equal(query.getSnapshot().unfilteredTotal, '0');
  parent.dispose();
});

test('changed totals and duplicate IDs across pages fail closed while preserving the last validated page', async () => {
  for (const issue of ['total', 'duplicate'] as const) {
    const { parent, query } = setup({ async readReferences(read) {
      if (read.parameters.page === 1) return page(40);
      return issue === 'total' ? page(41, 2) : { ...page(40, 2), items: page(40).items };
    } });
    await query.loadNext(); await query.loadNext();
    const snapshot = query.getSnapshot();
    assert.equal(snapshot.phase, 'error');
    assert.ok(snapshot.error instanceof TypeError);
    assert.equal(snapshot.page, 1);
    assert.deepEqual(snapshot.items, page(40).items);
    assert.equal(snapshot.exactTotal, '40');
    assert.equal(snapshot.unfilteredTotal, '40');
    assert.equal(snapshot.completeUniverse, false);
    parent.dispose();
  }
});

test('invalid exact totals, unsafe or mismatched pages, malformed candidates and within-page duplicates never become empty success', async () => {
  const invalid: readonly SalesReferencePage[] = [
    { ...page(2), exactTotal: '-1' },
    { ...page(2), exactTotal: '02' },
    { ...page(2), exactTotal: '2.0' },
    { ...page(2), exactTotal: '1'.repeat(101) },
    { ...page(2), page: Number.MAX_SAFE_INTEGER + 1 },
    { ...page(2), page: 2 },
    { ...page(2), items: [{ id: 'not-an-id', label: 'TEST' }, { id: uuid(2), label: 'TEST' }] },
    { ...page(2), items: [{ id: uuid(1), label: ' ' }, { id: uuid(2), label: 'TEST' }] },
    { ...page(2), items: [{ id: uuid(1), label: 'TEST' }, { id: uuid(1), label: 'TEST duplicate' }] },
    { ...page(2), items: [] },
  ];
  for (const response of invalid) {
    const { parent, query } = setup({ async readReferences() { return response; } });
    await query.loadNext();
    assert.equal(query.getSnapshot().phase, 'error');
    assert.ok(query.getSnapshot().error instanceof Error);
    assert.deepEqual(query.getSnapshot().items, []);
    assert.equal(query.getSnapshot().exactTotal, null);
    assert.equal(query.getSnapshot().completeUniverse, false);
    parent.dispose();
  }
});

test('exact totals above the safe integer range remain strings, never rounded numbers', async () => {
  const exactTotal = '900719925474099312345';
  const { parent, query } = setup({ async readReferences() { return { ...page(20), exactTotal }; } });
  await query.loadNext();
  assert.equal(query.getSnapshot().phase, 'success');
  assert.equal(query.getSnapshot().exactTotal, exactTotal);
  assert.equal(query.getSnapshot().unfilteredTotal, exactTotal);
  assert.equal(query.getSnapshot().hasMore, true);
  parent.dispose();
});

test('a failed page is an honest error and retries only when explicitly requested', async () => {
  const failure = new Error('Synthetic reference failure');
  let fail = true; let calls = 0;
  const { parent, query } = setup({ async readReferences(read) {
    calls++;
    if (read.parameters.page === 2 && fail) throw failure;
    return page(21, read.parameters.page);
  } });
  await query.loadNext(); await query.loadNext();
  assert.equal(calls, 2);
  assert.equal(query.getSnapshot().phase, 'error');
  assert.equal(query.getSnapshot().error, failure);
  assert.equal(query.getSnapshot().items.length, 20);
  assert.equal(query.getSnapshot().page, 1);
  fail = false; await query.loadNext();
  assert.equal(calls, 3);
  assert.equal(query.getSnapshot().phase, 'success');
  assert.equal(query.getSnapshot().error, null);
  assert.equal(query.getSnapshot().items.length, 21);
  parent.dispose();
});

test('search aborts and detaches a superseded generation even when its reader ignores the signal', async () => {
  const waiting = deferred<SalesReferencePage>();
  const signals: AbortSignal[] = []; const searches: string[] = [];
  const { parent, query } = setup({ async readReferences(read) {
    signals.push(read.signal); searches.push(read.parameters.search);
    return searches.length === 1 ? waiting.promise : page(2);
  } });
  const old = query.loadNext();
  query.reset('  新客户  ');
  assert.equal(signals[0]!.aborted, true);
  await old; // Does not wait for the ignored-signal transport to settle.
  assert.equal(query.getSnapshot().phase, 'idle');
  assert.deepEqual(query.getSnapshot().items, []);
  assert.deepEqual(searches, ['']);
  await query.loadNext();
  waiting.resolve(page(21)); await Promise.resolve();
  assert.deepEqual(searches, ['', '新客户']);
  assert.equal(query.getSnapshot().phase, 'success');
  assert.equal(query.getSnapshot().search, '新客户');
  assert.equal(query.getSnapshot().items.length, 2);
  assert.equal(query.getSnapshot().exactTotal, '2');
  assert.equal(query.getSnapshot().unfilteredTotal, null);
  parent.dispose();
});

test('close, session change and permission change abort ignored-signal reads and clear every candidate fact immediately', async () => {
  for (const action of ['close', 'session', 'permission'] as const) {
    const waiting = deferred<SalesReferencePage>();
    let signal: AbortSignal | undefined;
    const { context, parent, scope, query } = setup({ async readReferences(read) {
      if (read.parameters.page === 1) return page(21);
      signal = read.signal; return waiting.promise;
    } });
    await query.loadNext();
    const pending = query.loadNext();
    if (action === 'close') scope.dispose();
    else context.replaceIdentity({ ...identity, sessionRevision: action === 'session' ? '2' : '1', permissionRevision: action === 'permission' ? '2' : '1' });
    assert.equal(signal?.aborted, true);
    await pending; // Closing is not held open by an uncooperative transport.
    assert.deepEqual(query.getSnapshot(), { search: '', phase: 'disposed', items: [], exactTotal: null, unfilteredTotal: null,
      page: 0, hasMore: false, limitReached: false, completeUniverse: false, error: null });
    waiting.resolve(page(21, 2)); await Promise.resolve();
    assert.equal(query.getSnapshot().phase, 'disposed');
    assert.deepEqual(query.getSnapshot().items, []);
    query.reset('ignored'); await query.loadNext();
    assert.equal(query.getSnapshot().search, '');
    parent.dispose();
  }
});

test('subscriber reentrancy cannot launch an old search or compromise disposal', async () => {
  let calls = 0;
  const { parent, scope, query } = setup({ async readReferences() { calls++; return page(2); } });
  const unsubscribe = query.subscribe(() => { if (query.getSnapshot().phase === 'loading') query.reset('new search'); });
  await query.loadNext();
  assert.equal(calls, 0);
  assert.equal(query.getSnapshot().search, 'new search');
  unsubscribe();
  query.subscribe(() => { throw new Error('Synthetic subscriber failure'); });
  await query.loadNext();
  assert.equal(calls, 1);
  scope.dispose();
  assert.equal(query.getSnapshot().phase, 'disposed');
  assert.deepEqual(query.getSnapshot().items, []);
  parent.dispose();
});

test('an already inactive popup scope cannot start or retain a read', async () => {
  let calls = 0;
  const context = new ReadContext(identity); const scope = context.createScope('already-closed');
  scope.dispose();
  const query = new SalesReferenceCandidates(scope, { async readReferences() { calls++; return page(2); } }, 'hall');
  query.reset('ignored'); await query.loadNext();
  assert.equal(calls, 0);
  assert.equal(query.getSnapshot().phase, 'disposed');
  assert.deepEqual(query.getSnapshot().items, []);
});
