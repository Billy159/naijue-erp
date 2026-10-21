import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../loading/read-scope.ts';
import type { TransferWarehousePage, TransferWarehouseReader } from './contracts.ts';
import { childTransferScope } from './scope.ts';
import { WarehouseCandidates, WAREHOUSE_CANDIDATE_LIMIT } from './warehouse-candidates.ts';
import { warehouse } from './tests/fixtures.ts';
import { HttpQueryError } from '../transport/http-query.ts';

const identity = { accountId: 'TEST', sessionRevision: '1', permissionRevision: '1' };
function setup(reader: TransferWarehouseReader) {
  const context = new ReadContext(identity); const parent = context.createScope('TEST'); const scope = childTransferScope(parent, 'candidates');
  return { context, parent, scope, query: new WarehouseCandidates(scope, parent, reader) };
}
function page(total: number, page = 1): TransferWarehousePage {
  return { page, pageSize: 20, exactTotal: String(total), items: Array.from({ length: Math.min(20, Math.max(0, total - (page - 1) * 20)) }, (_, index) => warehouse((page - 1) * 20 + index + 20)) };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test('candidate construction is inert, scroll calls fetch one page and the session has a hard finite cap', async () => {
  const calls: number[] = [];
  const { parent, query } = setup({ async readWarehouses(read) { calls.push(read.parameters.page); assert.equal(read.parameters.pageSize, 20); return page(214, read.parameters.page); } });
  assert.equal(calls.length, 0); query.reset(''); await query.loadNext(); assert.deepEqual(calls, [1]); assert.equal(query.getSnapshot().items.length, 20);
  for (let i = 0; i < 20; i++) await query.loadNext();
  const state = query.getSnapshot(); assert.equal(calls.length, 10); assert.equal(state.items.length, WAREHOUSE_CANDIDATE_LIMIT);
  assert.equal(state.exactTotal, '214'); assert.equal(state.unfilteredTotal, '214'); assert.equal(state.limitReached, true); assert.equal(state.hasMore, true); assert.equal(state.completeUniverse, false);
  parent.dispose(); assert.equal(query.getSnapshot().phase, 'disposed'); assert.deepEqual(query.getSnapshot().items, []);
});

test('repeated scrolls serialize, search aborts and a late ignored-signal page cannot append', async () => {
  const waiting = deferred<TransferWarehousePage>(); const signals: AbortSignal[] = []; let calls = 0;
  const { parent, query } = setup({ async readWarehouses(read) { calls++; signals.push(read.signal); return calls === 1 ? waiting.promise : page(2); } });
  query.reset(''); const old = query.loadNext(); await query.loadNext(); await query.loadNext(); assert.equal(calls, 1);
  query.reset('仓库'); assert.equal(signals[0]!.aborted, true); await query.loadNext(); assert.equal(calls, 2); waiting.resolve(page(21)); await old;
  assert.equal(query.getSnapshot().search, '仓库'); assert.equal(query.getSnapshot().items.length, 2); assert.equal(query.getSnapshot().exactTotal, '2'); assert.equal(query.getSnapshot().completeUniverse, false);
  parent.dispose();
});

test('only an unsearched single complete response is a proven universe, never a search subset or accumulated pages', async () => {
  let total = 2;
  const { parent, query } = setup({ async readWarehouses(read) { return page(total, read.parameters.page); } });
  query.reset(''); await query.loadNext(); assert.equal(query.getSnapshot().completeUniverse, true);
  query.reset('仓库'); await query.loadNext(); assert.equal(query.getSnapshot().completeUniverse, false); assert.equal(query.getSnapshot().unfilteredTotal, '2');
  total = 21; query.reset(''); await query.loadNext(); await query.loadNext(); assert.equal(query.getSnapshot().items.length, 21); assert.equal(query.getSnapshot().completeUniverse, false);
  parent.dispose();
});

test('a failed next page preserves previous candidates and can be explicitly retried', async () => {
  let fail = true; let calls = 0;
  const { parent, query } = setup({ async readWarehouses(read) { calls++; if (read.parameters.page === 2 && fail) throw new Error('Synthetic failure'); return page(21, read.parameters.page); } });
  query.reset(''); await query.loadNext(); await query.loadNext(); assert.equal(query.getSnapshot().phase, 'error'); assert.equal(query.getSnapshot().items.length, 20); assert.equal(query.getSnapshot().exactTotal, '21');
  fail = false; await query.loadNext(); assert.equal(calls, 3); assert.equal(query.getSnapshot().items.length, 21); assert.equal(query.getSnapshot().phase, 'success'); parent.dispose();
});

test('changed totals and cross-page duplicate IDs fail closed without silent deduplication or fake totals', async () => {
  for (const kind of ['total', 'duplicate'] as const) {
    const { parent, query } = setup({ async readWarehouses(read) {
      if (read.parameters.page === 1) return page(40);
      return kind === 'total' ? page(41, 2) : { ...page(40, 2), items: page(40).items };
    } });
    query.reset(''); await query.loadNext(); await query.loadNext(); const state = query.getSnapshot();
    assert.equal(state.phase, 'error'); assert.equal(state.page, 1); assert.equal(state.items.length, 20); assert.equal(state.exactTotal, '40'); assert.equal(state.completeUniverse, false); parent.dispose();
  }
});

test('close and identity revocation abort pending reads and clear all candidate facts', async () => {
  for (const action of ['close', 'permission'] as const) {
    const waiting = deferred<TransferWarehousePage>(); let signal!: AbortSignal;
    const { context, parent, scope, query } = setup({ async readWarehouses(read) { signal = read.signal; return waiting.promise; } });
    query.reset(''); const pending = query.loadNext();
    if (action === 'close') scope.dispose(); else context.replaceIdentity({ ...identity, permissionRevision: '2' });
    assert.equal(signal.aborted, true); assert.equal(query.getSnapshot().phase, 'disposed'); waiting.resolve(page(2)); await pending;
    assert.deepEqual(query.getSnapshot().items, []); assert.equal(query.getSnapshot().exactTotal, null); assert.equal(query.getSnapshot().unfilteredTotal, null); parent.dispose();
  }
});

test('warehouse access denial invalidates the parent rather than retaining old identity candidates', async () => {
  const { parent, query } = setup({ async readWarehouses() { throw new HttpQueryError('forbidden', 'FORBIDDEN', 403); } });
  query.reset(''); await query.loadNext(); assert.equal(parent.active, false); assert.equal(query.getSnapshot().phase, 'disposed'); assert.deepEqual(query.getSnapshot().items, []);
});
