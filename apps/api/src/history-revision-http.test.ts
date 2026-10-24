import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createHistoryRevisionHttpPlugin } from './history-revision-http.ts';
import { DomainError } from '../../../packages/domain/src/errors.ts';
import type { HistoryRevisionDependencies } from '../../../packages/application/src/history-revision-contracts.ts';
import { historyActor } from '../../../tests/support/imported-history-query-fixtures.ts';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const command = (kind: 'sales' | 'transfers' = 'sales') => ({ kind, documentId: id(1), expectedVersion: 1, requestKey: 'synthetic-original-key', reason: 'Correct original quantity',
  lines: [{ lineId: id(2), quantity: '3' }], totals: null, settlements: [] });
function fixture() {
  const app = Fastify(); let calls = 0, failure: Error | null = null, authenticated = true, origin = true, allowed = true;
  const dependencies: HistoryRevisionDependencies = { now: () => '2026-10-22T00:00:00Z', authorization: { async authorize(actor, q) {
    if (!allowed) throw new DomainError('FORBIDDEN', 'PRIVATE authorization details');
    return { actorAccountId: actor.accountId, dataset: 'HISTORY', kind: q.kind, documentId: q.documentId };
  } }, store: { async revise(actor, q, grant, _now, signal) { calls++; assert.equal(actor.accountId, historyActor.accountId); assert.equal(grant.dataset, 'HISTORY'); assert.equal(signal.aborted, false);
    if (failure) throw failure; return { operationId: id(3), dataset: 'HISTORY', kind: q.kind, documentId: q.documentId, revisionId: id(4), version: 2, ledgerEntryIds: [id(5)] };
  } } };
  app.register(createHistoryRevisionHttpPlugin({ authenticate: async input => { assert.equal(input.method, 'POST'); if (!origin) throw Object.assign(Error('PRIVATE origin'), { code: 'ORIGIN_REJECTED' }); return authenticated ? historyActor : null; }, dependencies }), { prefix: '/api' });
  return { app, get calls() { return calls; }, set failure(e: Error | null) { failure = e; }, set authenticated(v: boolean) { authenticated = v; }, set origin(v: boolean) { origin = v; }, set allowed(v: boolean) { allowed = v; } };
}
test('HISTORY HTTP forwards only exact command and trusted actor; original operation identity/version/ledger receipt survives', async t => {
  const f = fixture(); t.after(() => f.app.close());
  for (const kind of ['sales', 'transfers'] as const) {
    const response = await f.app.inject({ method: 'POST', url: `/api/imported-history/${kind}/revise`, payload: command(kind) });
    assert.equal(response.statusCode, 200); assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(response.json(), { operationId: id(3), dataset: 'HISTORY', kind, documentId: id(1), revisionId: id(4), version: 2, ledgerEntryIds: [id(5)] });
  }
  assert.equal(f.calls, 2);
});
test('HISTORY HTTP auth/origin and exact dataset/route/field boundaries reject before store', async t => {
  const f = fixture(); t.after(() => f.app.close());
  f.authenticated = false; assert.equal((await f.app.inject({ method: 'POST', url: '/api/imported-history/sales/revise', payload: command() })).statusCode, 401);
  f.authenticated = true; f.origin = false; assert.equal((await f.app.inject({ method: 'POST', url: '/api/imported-history/sales/revise', payload: command() })).statusCode, 403);
  f.origin = true; f.allowed = false; assert.equal((await f.app.inject({ method: 'POST', url: '/api/imported-history/sales/revise', payload: command() })).statusCode, 403); f.allowed = true;
  for (const payload of [{ ...command(), actorAccountId: id(99) }, { ...command(), dataset: 'NATIVE' }, command('transfers'), { ...command(), lines: [{ lineId: id(2), quantity: '1.5' }] }])
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/imported-history/sales/revise', payload })).statusCode, 400);
  assert.equal((await f.app.inject({ method: 'POST', url: '/api/imported-history/sales/revise?hallId=forged', payload: command() })).statusCode, 400);
  assert.equal(f.calls, 0);
});
test('HISTORY HTTP preserves version/original-key unknown outcome errors and never exposes private exception text', async t => {
  const f = fixture(); t.after(() => f.app.close());
  for (const [code, status] of [['VERSION_CONFLICT', 409], ['IDEMPOTENCY_CONFLICT', 409], ['HISTORY_REVISION_COMMIT_OUTCOME_UNKNOWN', 503], ['HISTORY_REVISION_BASELINE_UNPROVEN', 503]] as const) {
    f.failure = new DomainError(code, 'PRIVATE credentials/rows must never leak');
    const response = await f.app.inject({ method: 'POST', url: '/api/imported-history/sales/revise', payload: command() });
    assert.equal(response.statusCode, status); assert.equal(response.json().error.code, code); assert.ok(!response.body.includes('PRIVATE'));
  }
  f.failure = Error('PRIVATE database details'); const response = await f.app.inject({ method: 'POST', url: '/api/imported-history/sales/revise', payload: command() });
  assert.equal(response.statusCode, 500); assert.equal(response.json().error.code, 'INTERNAL_ERROR'); assert.ok(!response.body.includes('PRIVATE'));
});
test('HISTORY HTTP refuses invalid JSON/media and payload overflow with no write', async t => {
  const f = fixture(); t.after(() => f.app.close());
  assert.equal((await f.app.inject({ method: 'POST', url: '/api/imported-history/sales/revise', headers: { 'content-type': 'application/json' }, payload: '{broken' })).statusCode, 400);
  assert.equal((await f.app.inject({ method: 'POST', url: '/api/imported-history/sales/revise', headers: { 'content-type': 'text/plain' }, payload: 'not json' })).statusCode, 415);
  assert.equal((await f.app.inject({ method: 'POST', url: '/api/imported-history/sales/revise', headers: { 'content-type': 'application/json' }, payload: ' '.repeat(4 * 1024 * 1024 + 1) })).statusCode, 413);
  assert.equal(f.calls, 0);
});

test('v16 HISTORY HTTP: same route accepts finite responsible header and rejects creator or clearing input', async t => {
  const f = fixture(); t.after(() => f.app.close());
  const payload = { ...command('transfers'), lines: [], header: { businessDate: '2026-10-24', fromWarehouseId: id(40), toWarehouseId: id(41), responsibleStaffId: id(42) } };
  assert.equal((await f.app.inject({ method: 'POST', url: '/api/imported-history/transfers/revise', payload })).statusCode, 200);
  for (const header of [{ responsibleStaffId: null }, { createdByStaffId: id(42) }, { actorAccountId: id(42) }])
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/imported-history/transfers/revise', payload: { ...payload, header } })).statusCode, 400);
  assert.equal(f.calls, 1);
});
