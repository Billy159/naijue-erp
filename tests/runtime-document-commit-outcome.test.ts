/** Protocol-level transaction cleanup, not PostgreSQL engine evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresSalesUnitOfWork } from '../adapters/postgres/src/sales-unit-of-work.ts';
import { PostgresTransferUnitOfWork } from '../adapters/postgres/src/transfer-unit-of-work.ts';
import type { PgSalesPool } from '../adapters/postgres/src/sales-unit-of-work.ts';

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
