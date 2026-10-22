import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryRevisionService, parseHistoryRevisionCommand, planHistoryRevision } from '../packages/application/src/history-revision-service.ts';
import type { HistoryRevisionCommand, HistoryRevisionCurrent, HistoryRevisionDependencies } from '../packages/application/src/history-revision-contracts.ts';
import { historyActor as actor } from './support/imported-history-query-fixtures.ts';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
function current(kind: 'sales' | 'transfers' = 'sales'): HistoryRevisionCurrent {
  return { kind, documentId: id(1), version: 1, previousRevisionId: null, importBatchId: id(2), publishedOperationId: id(3), documentManifestHash: 'a'.repeat(64),
    sourceStatus: 'APPROVED', baselineEffect: 'INCLUDED_APPROVED', businessDate: '2026-10-04', warehouseId: kind === 'sales' ? id(4) : null,
    fromWarehouseId: kind === 'transfers' ? id(4) : null, toWarehouseId: kind === 'transfers' ? id(5) : null,
    lines: [{ lineId: id(6), skuId: id(7), quantity: '2', ...(kind === 'sales' ? { dealPrice: '10.00', lineAmount: '20.00', allocatedDiscount: null } : {}) }],
    totals: kind === 'sales' ? { grossAmount: '20.00', orderDiscount: '0.00', netDue: '20.00' } : null,
    settlements: kind === 'sales' ? [{ settlementId: id(8), direction: 'RECEIVE', amount: '20.00' }] : [] };
}
function command(kind: 'sales' | 'transfers' = 'sales'): HistoryRevisionCommand {
  return { kind, documentId: id(1), expectedVersion: 1, requestKey: 'synthetic-history-revise', reason: 'Correct known quantity',
    lines: [{ lineId: id(6), quantity: '3' }], totals: null, settlements: [] };
}
const plan = (c = current(), q = command()) => planHistoryRevision(c, q, id(99));

test('history correction captures sparse fields without turning omitted money into null; rejects getters/hidden/unknown/duplicate rows', () => {
  assert.deepEqual(parseHistoryRevisionCommand(command()), command()); let gets = 0;
  const getter = Object.defineProperty(command(), 'reason', { enumerable: true, get() { gets++; return 'reason'; } });
  for (const q of [getter, { ...command(), status: 'APPROVED' }, { ...command(), lines: [command().lines[0], command().lines[0]] },
    { ...command(), lines: [{ lineId: id(6), quantity: '1.5' }] }, { ...command(), lines: [{ lineId: id(6), dealPrice: '10.001' }] },
    { ...command(), lines: [{ lineId: id(6), quantity: 3 }] }, { ...command(), lines: [{ lineId: id(6) }] },
    { ...command(), lines: Object.assign([], { hidden: true }) }, { ...command(), reason: '' }]) assert.throws(() => parseHistoryRevisionCommand(q));
  assert.equal(gets, 0);
});
test('baseline-included sales increases/decreases only the effective quantity difference; original facts stay unchanged', () => {
  const c = current(), original = structuredClone(c), first = plan(c);
  assert.deepEqual(first.effects.map(e => e.quantityDelta), ['-1']); assert.equal(first.after.version, 2);
  assert.equal(first.after.previousRevisionId, id(99)); assert.deepEqual(c, original);
  const second = planHistoryRevision(first.after, { ...command(), expectedVersion: 2, lines: [{ lineId: id(6), quantity: '1' }] }, id(100));
  assert.deepEqual(second.effects.map(e => e.quantityDelta), ['2']);
  assert.equal(7n + BigInt(first.effects[0]!.quantityDelta) + BigInt(second.effects[0]!.quantityDelta), 8n);
});
test('signed independent return/exchange quantity is not flipped again by business type', () => {
  const c = current(); (c.lines[0] as { quantity: string }).quantity = '-2';
  assert.deepEqual(plan(c, { ...command(), lines: [{ lineId: id(6), quantity: '-3' }] }).effects.map(e => e.quantityDelta), ['1']);
});
test('transfer quantity differences conserve both ends and retain each actual line identity', () => {
  const p = plan(current('transfers'), command('transfers'));
  assert.deepEqual(p.effects.map(e => [e.endpoint, e.quantityDelta]), [['FROM', '-1'], ['TO', '1']]);
  assert.equal(p.effects.reduce((sum, e) => sum + BigInt(e.quantityDelta), 0n), 0n); assert.ok(p.effects.every(e => e.lineId === id(6)));
});
test('money-only correction creates no stock effects and requires revised settlement equality without balancing old history', () => {
  const p = plan(current(), { ...command(), lines: [{ lineId: id(6), dealPrice: '11.00', lineAmount: '22.00' }],
    totals: { grossAmount: '22.00', orderDiscount: '0.00', netDue: '22.00' }, settlements: [{ settlementId: id(8), amount: '22.00' }] });
  assert.deepEqual(p.effects, []); assert.equal(p.moneyChanged, true);
  assert.throws(() => plan(current(), { ...command(), lines: [{ lineId: id(6), lineAmount: '22.00' }], totals: { grossAmount: '22.00', orderDiscount: '0.00', netDue: '22.00' } }), { code: 'SETTLEMENT_MISMATCH' });
  const legacy = current(); (legacy.settlements[0] as { amount: string }).amount = '18.50';
  assert.equal(plan(legacy).after.settlements[0]!.amount, '18.50');
});
test('explicit nullable discount stays null while an omitted field retains its effective value', () => {
  const c = current(); (c.lines[0] as { allocatedDiscount: string | null }).allocatedDiscount = '1.00';
  assert.equal(plan(c).after.lines[0]!.allocatedDiscount, '1.00');
  const p = plan(c, { ...command(), lines: [{ lineId: id(6), allocatedDiscount: null }] });
  assert.equal(p.after.lines[0]!.allocatedDiscount, null); assert.deepEqual(p.effects, []);
});
test('original DRAFT/VOID facts cannot become approved or affect stock merely by revision', () => {
  for (const sourceStatus of ['DRAFT', 'VOID'] as const) {
    const c = { ...current(), sourceStatus, baselineEffect: 'EXCLUDED_NOT_EFFECTIVE' as const };
    const p = plan(c); assert.deepEqual(p.effects, []); assert.equal(p.after.sourceStatus, sourceStatus);
  }
});
test('unproven baseline, stale version, foreign row, no change and overflowing differences reject', () => {
  assert.throws(() => plan({ ...current(), documentManifestHash: '' }), { code: 'HISTORY_REVISION_BASELINE_UNPROVEN' });
  assert.throws(() => plan({ ...current(), baselineEffect: 'EXCLUDED_NOT_EFFECTIVE' }), { code: 'HISTORY_REVISION_BASELINE_UNPROVEN' });
  assert.throws(() => plan({ ...current(), version: 2 }), { code: 'VERSION_CONFLICT' });
  assert.throws(() => plan(current(), { ...command(), lines: [{ lineId: id(66), quantity: '3' }] }), { code: 'HISTORY_REVISION_FOREIGN_ROW' });
  assert.throws(() => plan(current(), { ...command(), lines: [{ lineId: id(6), quantity: '2' }] }), { code: 'HISTORY_REVISION_EMPTY' });
  const c = current(); (c.lines[0] as { quantity: string }).quantity = '-9223372036854775808';
  assert.throws(() => plan(c, { ...command(), lines: [{ lineId: id(6), quantity: '9223372036854775807' }] }), { code: 'HISTORY_REVISION_QUANTITY_OVERFLOW' });
});
test('transfer rejects money/settlement/warehouse/status additions at the command boundary', () => {
  for (const q of [{ ...command('transfers'), lines: [{ lineId: id(6), lineAmount: '1.00' }] },
    { ...command('transfers'), totals: current().totals }, { ...command('transfers'), settlements: [{ settlementId: id(8), amount: '1.00' }] },
    { ...command(), warehouseId: id(45) }, { ...command(), sourceStatus: 'DRAFT' }]) assert.throws(() => parseHistoryRevisionCommand(q));
});
test('service requires exact HISTORY write grant; no default authority/store or permission fallback', async () => {
  let calls = 0;
  const deps: HistoryRevisionDependencies = { authorization: { async authorize(_a, q) { return { dataset: 'HISTORY', kind: q.kind, documentId: q.documentId, actorAccountId: actor.accountId }; } },
    store: { async revise(_a, q) { calls++; return { operationId: id(90), dataset: 'HISTORY', kind: q.kind, documentId: q.documentId, revisionId: id(99), version: q.expectedVersion + 1, ledgerEntryIds: [id(91)] }; } }, now: () => '2026-10-22T05:00:00.000Z' };
  assert.throws(() => createHistoryRevisionService({} as HistoryRevisionDependencies));
  const result = await createHistoryRevisionService(deps).execute(actor, command(), new AbortController().signal);
  assert.equal(result.dataset, 'HISTORY'); assert.equal(calls, 1); assert.ok(Object.isFrozen(result.ledgerEntryIds));
  await assert.rejects(createHistoryRevisionService({ ...deps, authorization: { async authorize(_a, q) { return { dataset: 'HISTORY', kind: q.kind, documentId: id(77), actorAccountId: actor.accountId }; } } }).execute(actor, command(), new AbortController().signal), { code: 'FORBIDDEN' });
  const cancel = new AbortController(); cancel.abort(); await assert.rejects(createHistoryRevisionService(deps).execute(actor, command(), cancel.signal), { code: 'HISTORY_REVISION_ABORTED' }); assert.equal(calls, 1);
});
test('authorized provider mutation cannot alter captured write; invalid receipt cannot become success', async () => {
  const deps: HistoryRevisionDependencies = { authorization: { async authorize(_a, q) { const g = { dataset: 'HISTORY' as const, kind: q.kind, documentId: q.documentId, actorAccountId: actor.accountId }; (q.lines[0] as { quantity: string }).quantity = '999'; return g; } },
    store: { async revise(_a, q) { assert.equal(q.lines[0]!.quantity, '3'); return { operationId: id(90), dataset: 'HISTORY', kind: q.kind, documentId: q.documentId, revisionId: id(99), version: 999, ledgerEntryIds: [] }; } }, now: () => '2026-10-22T05:00:00.000Z' };
  await assert.rejects(createHistoryRevisionService(deps).execute(actor, command(), new AbortController().signal), { code: 'HISTORY_REVISION_INVALID_RECEIPT' });
});
