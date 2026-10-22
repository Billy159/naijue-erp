/** Protocol-level transaction cleanup, not PostgreSQL engine evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresSalesUnitOfWork } from '../adapters/postgres/src/sales-unit-of-work.ts';
import { PostgresTransferUnitOfWork } from '../adapters/postgres/src/transfer-unit-of-work.ts';
import type { PgSalesPool, PgSalesClient } from '../adapters/postgres/src/sales-unit-of-work.ts';
import { PostgresImportedCatalogueCompletenessVerifier } from '../adapters/postgres/src/catalogue-completeness.ts';
import type { NativeRuntime26Capability } from '../packages/application/src/native-import-schema-contract.ts';
import { entityId } from '../packages/domain/src/values.ts';
import { PostgresPostingBalances } from '../adapters/postgres/src/inventory-posting-balances.ts';
import { quantity, version } from '../packages/domain/src/values.ts';

for (const [kind, factory] of [
  ['sales', (pool: PgSalesPool) => new PostgresSalesUnitOfWork(pool)],
  ['transfer', (pool: PgSalesPool) => new PostgresTransferUnitOfWork(pool)]
] as const) {
  function protocol(failAt?: string) {
    const statements: string[] = [], released: unknown[] = [];
    let connections = 0;
    const failure = Error('EXPLICIT_PROTOCOL_FAILURE_' + failAt);
    const pool: PgSalesPool = { async connect() {
      connections++;
      return { async query(sql) {
        statements.push(sql);
        if (sql === failAt) throw failure;
        return { rows: sql.includes('sales:current-schema') ? [{ current_sales_schema_ready: true }] : [], rowCount: 0 };
      }, release(error) { released.push(error); } };
    } };
    return { pool, statements, released, failure, connections: () => connections };
  }
  test(`${kind}: unknown COMMIT preserves original error and discards once without rollback or retry`, async () => {
    const p = protocol('COMMIT'), uow = factory(p.pool); let work = 0;
    await assert.rejects(uow.transaction(async () => { work++; return 'done'; }), error => error === p.failure);
    assert.equal(work, 1); assert.equal(p.connections(), 1);
    assert.equal(p.statements.filter(s => s === 'COMMIT').length, 1);
    assert.equal(p.statements.filter(s => s === 'ROLLBACK').length, 0);
    assert.deepEqual(p.released, [p.failure]);
  });
  test(`${kind}: pre-COMMIT failure rolls back once; successful rollback permits client reuse`, async () => {
    const p = protocol(), failure = Error('WORK_FAILED');
    await assert.rejects(factory(p.pool).transaction(async () => { throw failure; }), error => error === failure);
    assert.equal(p.statements.at(-1), 'ROLLBACK'); assert.ok(!p.statements.includes('COMMIT'));
    assert.equal(p.connections(), 1); assert.deepEqual(p.released, [undefined]);
  });
  test(`${kind}: BEGIN failure discards without rollback; rollback failure preserves both causes`, async () => {
    const begin = protocol('BEGIN ISOLATION LEVEL READ COMMITTED'); let work = 0;
    await assert.rejects(factory(begin.pool).transaction(async () => { work++; }), error => error === begin.failure);
    assert.equal(work, 0); assert.equal(begin.statements.length, 1); assert.deepEqual(begin.released, [begin.failure]);
    const rollback = protocol('ROLLBACK'), original = Error('WORK_FAILED');
    await assert.rejects(factory(rollback.pool).transaction(async () => { throw original; }), error => {
      assert.ok(error instanceof AggregateError); assert.deepEqual(error.errors, [original, rollback.failure]); return true;
    });
    assert.deepEqual(rollback.released, [rollback.failure]);
  });
  test(`${kind}: success commits once and returns the original value`, async () => {
    const p = protocol(), value = Object.freeze({ result: 'success' });
    assert.equal(await factory(p.pool).transaction(async () => value), value);
    assert.equal(p.statements.at(-1), 'COMMIT'); assert.ok(!p.statements.includes('ROLLBACK'));
    assert.equal(p.connections(), 1); assert.deepEqual(p.released, [undefined]);
  });
}

function runtime26Uow(kind: 'sales' | 'transfer', pool: PgSalesPool, runtime26: NativeRuntime26Capability) {
  return kind === 'sales' ? new PostgresSalesUnitOfWork(pool, { catalogueCompleteness: new PostgresImportedCatalogueCompletenessVerifier(), runtime26 })
    : new PostgresTransferUnitOfWork(pool, { runtime26 });
}
for (const kind of ['sales', 'transfer'] as const) {
  function exactProtocol(commitFailure?: Error) {
    const statements: string[] = [], released: unknown[] = []; let connections = 0;
    const client: PgSalesClient = { async query(sql) {
      statements.push(sql); if (sql === 'COMMIT' && commitFailure) throw commitFailure;
      return { rows: sql.includes('sales:current-schema') ? [{ current_sales_schema_ready: true }] : [], rowCount: 0 };
    }, release(error) { released.push(error); } };
    const pool = { async connect() { connections++; return client; } };
    return { pool, client, statements, released, connections: () => connections };
  }
  test(`runtime26 ${kind}: actual original client purpose gates BEGIN/work/COMMIT and callback handle closes before the final proof`, async () => {
    const p = exactProtocol(), checkedAt: number[] = []; let late: (() => Promise<unknown>) | undefined, closed = 0;
    const runtime26: NativeRuntime26Capability = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(client, purpose) {
      assert.equal(client, p.client); assert.equal(purpose, 'INVENTORY_ADMISSION'); checkedAt.push(p.statements.length);
      if (checkedAt.length === 3) { await assert.rejects(late!(), { code: 'TRANSACTION_CLOSED' }); closed++; }
    } };
    const result = await runtime26Uow(kind, p.pool, runtime26).transaction(async tx => {
      late = () => tx.getReceipt(entityId('account', '00000000-0000-4000-8000-000000000001'), 'late'); return 'done';
    });
    assert.equal(result, 'done'); assert.deepEqual(checkedAt, kind === 'sales' ? [0, 1, 2] : [0, 1, 1]);
    assert.equal(closed, 1); assert.equal(p.statements.at(-1), 'COMMIT'); assert.deepEqual(p.released, [undefined]); assert.equal(p.connections(), 1);
  });
  test(`runtime26 ${kind}: each rejected proof phase prevents work or commit with original rollback/discard rules`, async () => {
    for (const rejectAt of [1, 2, 3]) {
      const p = exactProtocol(), failure = Error('SYNTHETIC_PROOF_REVOKED_' + rejectAt); let assertions = 0, work = 0;
      const runtime26: NativeRuntime26Capability = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(client) {
        assert.equal(client, p.client); if (++assertions === rejectAt) throw failure;
      } };
      await assert.rejects(runtime26Uow(kind, p.pool, runtime26).transaction(async () => { work++; }), error => error === failure);
      assert.equal(work, rejectAt === 3 ? 1 : 0); assert.ok(!p.statements.includes('COMMIT'));
      assert.equal(p.statements.filter(sql => sql === 'ROLLBACK').length, rejectAt === 1 ? 0 : 1);
      assert.deepEqual(p.released, [rejectAt === 1 ? failure : undefined]); assert.equal(p.connections(), 1);
    }
  });
  test(`runtime26 ${kind}: unknown COMMIT still keeps the original key outcome and error without rollback or retry`, async () => {
    const failure = Error('SYNTHETIC_COMMIT_ACK_LOST'), p = exactProtocol(failure); let ready = 0, work = 0;
    const runtime26: NativeRuntime26Capability = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(client, purpose) {
      assert.equal(client, p.client); assert.equal(purpose, 'INVENTORY_ADMISSION'); ready++;
    } };
    await assert.rejects(runtime26Uow(kind, p.pool, runtime26).transaction(async () => { work++; }), error => error === failure);
    assert.equal(ready, 3); assert.equal(work, 1); assert.equal(p.connections(), 1); assert.deepEqual(p.released, [failure]);
    assert.equal(p.statements.filter(sql => sql === 'COMMIT').length, 1); assert.ok(!p.statements.includes('ROLLBACK'));
  });
  test(`runtime26 ${kind}: malformed or boolean authority never borrows or runs command work`, async () => {
    const p = exactProtocol(); let getterCalls = 0;
    for (const capability of [null, true, { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', get assertReady() { getterCalls++; throw Error('MUST_NOT_RUN'); } }])
      assert.throws(() => runtime26Uow(kind, p.pool, capability as never), TypeError);
    assert.equal(getterCalls, 0); assert.equal(p.connections(), 0);
    const runtime26 = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady() { return false; } } as unknown as NativeRuntime26Capability;
    let work = 0; await assert.rejects(runtime26Uow(kind, p.pool, runtime26).transaction(async () => { work++; }), /without a boolean substitute/);
    assert.equal(work, 0); assert.equal(p.statements.length, 0); assert.ok(p.released[0] instanceof TypeError);
  });
}

function admission26Protocol(change: { admission?: Record<string, unknown>; publication?: readonly Record<string, unknown>[]; unused?: Record<string, unknown>; insertCount?: number } = {}) {
  const warehouseId = entityId('warehouse', '00000000-0000-4000-8000-000000000011'), skuId = entityId('sku', '00000000-0000-4000-8000-000000000012');
  const batch = '00000000-0000-4000-8000-000000000013', operation = entityId('operation', '00000000-0000-4000-8000-000000000014');
  const calls: { sql: string; values: unknown[] }[] = []; let checks = 0;
  const client: PgSalesClient = { async query(sql, values = []) {
    calls.push({ sql, values }); let rows: Record<string, unknown>[] = [];
    if (sql.includes('inventory_key_lock') || sql.includes('FOR UPDATE OF b')) {}
    else if (sql.includes('posting:publication')) rows = [...(change.publication ?? [{ id: batch, completed: true, final_approval: true,
      checkpoint: { sequence: 1, cursor: 3, expected: { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 0, IMPORT_BATCH: 1 }, counts: { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 0, IMPORT_BATCH: 1 } } }])];
    else if (sql.includes('posting:guards')) rows = [{ integrity_guards_present: true }];
    else if (sql.includes('inventory-admission:keys')) {
      assert.deepEqual(values, [[warehouseId], [skuId]]); assert.match(sql, /naijue_erp.inventory_key_admission\(k.warehouse_id,k.sku_id\)/);
      rows = [{ warehouse_id: warehouseId, sku_id: skuId, admitted: true, published_batch_id: batch, warehouse_basis: 'CUTOFF_MEMBER', sku_basis: 'POST_CUTOFF_CREATED',
        warehouse_created_operation_id: null, sku_created_operation_id: operation, ...change.admission }];
    } else if (sql.includes('posting:admitted-unused-key')) rows = [{ balance_absent: true, ledger_absent: true, ...change.unused }];
    else if (sql.startsWith('INSERT INTO naijue_erp.inventory_balance')) return { rows: [], rowCount: change.insertCount ?? 1 };
    else throw Error('Unexpected synthetic admission SQL');
    return { rows, rowCount: rows.length };
  }, release() { throw Error('Borrowed posting adapter must never release'); } };
  const runtime26: NativeRuntime26Capability = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(target, purpose) {
    assert.equal(target, client); assert.equal(purpose, 'INVENTORY_ADMISSION'); checks++;
  } };
  const balances = PostgresPostingBalances.forRuntime26(client, runtime26, () => {});
  return { balances, client, calls, checks: () => checks, warehouseId, skuId, operation, batch };
}
test('runtime26 posting: actual-client SQL admission retains native-creation evidence, sparse unknown state and exact negative first effect', async () => {
  const p = admission26Protocol(); assert.equal(p.calls.length, 0);
  await p.balances.lock([{ warehouseId: p.warehouseId, skuId: p.skuId }]);
  assert.equal(p.balances.get(p.warehouseId, p.skuId), undefined); await p.balances.assertZero(p.warehouseId, p.skuId);
  assert.equal(p.balances.get(p.warehouseId, p.skuId), undefined); assert.equal(p.checks(), 2);
  assert.ok(!p.calls.some(call => /posting:zero-key|^(INSERT|UPDATE|DELETE)/.test(call.sql)));
  const proof = { warehouseId: p.warehouseId, skuId: p.skuId, quantityDelta: quantity('-5'), operationId: p.operation,
    postedAt: '2026-10-23T00:00:00.000000Z', reversesEntryId: null, eventKind: 'APPROVE' as const };
  const balance = { warehouseId: p.warehouseId, skuId: p.skuId, quantity: quantity('-5'), version: version(1), lastOperationId: p.operation, updatedAt: proof.postedAt };
  await assert.rejects(p.balances.put(balance), { code: 'INVENTORY_NOT_READY' });
  assert.throws(() => p.balances.assertCanAppend({ ...proof, eventKind: 'UNAPPROVE' }), { code: 'INVENTORY_NOT_READY' });
  p.balances.assertCanAppend(proof); p.balances.didAppend(proof);
  await assert.rejects(p.balances.put({ ...balance, quantity: quantity('0') }), { code: 'INVENTORY_NOT_READY' });
  await p.balances.put(balance); assert.equal(p.balances.get(p.warehouseId, p.skuId)?.quantity, -5n);
  const inserted = p.calls.filter(call => call.sql.startsWith('INSERT INTO naijue_erp.inventory_balance')); assert.equal(inserted.length, 1);
  assert.deepEqual(inserted[0]!.values, [p.warehouseId, p.skuId, '-5', 1, p.operation, proof.postedAt]); assert.match(inserted[0]!.sql, /ON CONFLICT.*DO NOTHING/s);
});
test('runtime26 posting: unpublished, unknown, wrong-scope, malformed creation or already-used keys cannot become zero', async () => {
  for (const [change, code] of [
    [{ publication: [] }, 'INVENTORY_NOT_READY'], [{ admission: { admitted: false, warehouse_basis: null, sku_basis: null, sku_created_operation_id: null } }, 'INVENTORY_NOT_READY'],
    [{ admission: { published_batch_id: '00000000-0000-4000-8000-000000000099' } }, 'INVENTORY_NOT_READY'],
    [{ admission: { sku_created_operation_id: null } }, 'INVENTORY_INTEGRITY_FAILED'], [{ unused: { balance_absent: false } }, 'INVENTORY_INTEGRITY_FAILED'],
    [{ unused: { ledger_absent: false } }, 'INVENTORY_INTEGRITY_FAILED']
  ] as const) {
    const p = admission26Protocol(change); await p.balances.lock([{ warehouseId: p.warehouseId, skuId: p.skuId }]);
    await assert.rejects(p.balances.assertZero(p.warehouseId, p.skuId), { code });
    assert.equal(p.balances.get(p.warehouseId, p.skuId), undefined); assert.ok(!p.calls.some(call => /^(INSERT|UPDATE|DELETE)/.test(call.sql)));
  }
});
test('runtime26 posting: foreign client proof and closed transaction reject before locks or business writes', async () => {
  const p = admission26Protocol(), failure = Error('SYNTHETIC_FOREIGN_LEASE');
  const runtime26: NativeRuntime26Capability = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(target) {
    assert.notEqual(target, p.client); throw failure;
  } };
  const copy = { ...p.client }, balances = PostgresPostingBalances.forRuntime26(copy, runtime26, () => {});
  await assert.rejects(balances.lock([{ warehouseId: p.warehouseId, skuId: p.skuId }]), error => error === failure); assert.equal(p.calls.length, 0);
  const closed = PostgresPostingBalances.forRuntime26(p.client, { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(target) { assert.equal(target, p.client); } },
    () => { throw Error('SYNTHETIC_TRANSACTION_CLOSED'); });
  await assert.rejects(closed.lock([{ warehouseId: p.warehouseId, skuId: p.skuId }]), /SYNTHETIC_TRANSACTION_CLOSED/); assert.equal(p.calls.length, 0);
});
