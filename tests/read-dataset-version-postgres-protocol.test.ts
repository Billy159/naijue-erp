/** Scripted same-client protocol checks; no PostgreSQL/schema/role acceptance claim. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatasetVersionChanges, readDatasetVersion } from '../adapters/postgres/src/read-dataset-version.ts';
import type { DatasetVersionClient, ReadDataset } from '../adapters/postgres/src/read-dataset-version.ts';

function protocol() {
  const calls: { sql: string; values: unknown[] }[] = [];
  const versions = new Map<ReadDataset, bigint>([['SALES', 0n], ['TRANSFER', 7n], ['INVENTORY', 9007199254740993n]]);
  const client: DatasetVersionClient = { async query(sql, values = []) {
    calls.push({ sql, values }); const dataset = values[0] as ReadDataset;
    if (sql.includes(':bump')) versions.set(dataset, versions.get(dataset)! + 1n);
    return { rowCount: 1, rows: [{ dataset, revision: versions.get(dataset)!.toString() }] };
  } };
  return { client, calls, versions };
}
test('dataset version reads preserve exact PG bigint text including zero and beyond Number precision', async () => {
  const p = protocol(); assert.equal(await readDatasetVersion(p.client, 'SALES'), '0');
  assert.equal(await readDatasetVersion(p.client, 'INVENTORY'), '9007199254740993');
  assert.ok(p.calls.every(c => c.sql.includes(':read')));
});
test('new writes deduplicate and flush once in fixed dataset order on the supplied client', async () => {
  const p = protocol(), changes = createDatasetVersionChanges(p.client);
  for (const dataset of ['INVENTORY', 'TRANSFER', 'SALES', 'INVENTORY', 'SALES'] as const) changes.mark(dataset);
  await changes.flush(); assert.deepEqual(p.calls.map(c => c.values), [['SALES'], ['TRANSFER'], ['INVENTORY']]);
  assert.deepEqual([...p.versions.values()], [1n, 8n, 9007199254740994n]);
  assert.throws(() => changes.mark('SALES'), { code: 'DATASET_VERSION_CHANGES_CLOSED' });
  await assert.rejects(changes.flush(), { code: 'DATASET_VERSION_CHANGES_CLOSED' }); assert.equal(p.calls.length, 3);
});
test('receipt replay with no actual write marks sends no version SQL', async () => {
  const p = protocol(); await createDatasetVersionChanges(p.client).flush(); assert.deepEqual(p.calls, []);
});
test('original caller rollback owns all flushed changes without helper transaction statements', async () => {
  const p = protocol(), initial = new Map(p.versions), callerStatements: string[] = [];
  callerStatements.push('BEGIN');
  try { const changes = createDatasetVersionChanges(p.client); changes.mark('SALES'); changes.mark('INVENTORY');
    await changes.flush(); throw Error('SYNTHETIC later precommit failure');
  } catch { callerStatements.push('ROLLBACK'); p.versions.clear(); for (const [key, value] of initial) p.versions.set(key, value); }
  assert.deepEqual([...p.versions], [...initial]); assert.deepEqual(callerStatements, ['BEGIN', 'ROLLBACK']);
  assert.ok(p.calls.every(c => c.sql.includes(':bump')));
});
test('missing, extra, mismatched and noncanonical persisted versions reject without defaults', async () => {
  const invalid: unknown[] = [null, 0, 1n, '', '-1', '01', '+1', '1.0', ' 1', '1e3', '9223372036854775808'];
  const results = invalid.map(value => ({ rowCount: 1, rows: [{ dataset: 'SALES', revision: value }] }));
  results.push({ rowCount: 0, rows: [] }, { rowCount: 1, rows: [] },
    { rowCount: 2, rows: [{ dataset: 'SALES', revision: '1' }, { dataset: 'SALES', revision: '1' }] },
    { rowCount: 1, rows: [{ dataset: 'TRANSFER', revision: '1' }] });
  for (const result of results) await assert.rejects(readDatasetVersion({ async query() { return result; } }, 'SALES'), { code: 'INVALID_DATASET_VERSION' });
  let calls = 0; const client = { async query() { calls++; return { rowCount: 1, rows: [{ dataset: 'SALES', revision: '1' }] }; } };
  await assert.rejects(readDatasetVersion(client, 'UNKNOWN' as ReadDataset), { code: 'INVALID_READ_DATASET' });
  assert.throws(() => createDatasetVersionChanges(client).mark('UNKNOWN' as ReadDataset), { code: 'INVALID_READ_DATASET' }); assert.equal(calls, 0);
});
test('flush propagates overflow or uncertain response unchanged and closes without retry or later domain writes', async () => {
  for (const code of ['22003', 'SYNTHETIC_UNKNOWN_RESPONSE']) {
    const original = Object.assign(Error('SYNTHETIC'), { code }), calls: unknown[][] = [];
    const changes = createDatasetVersionChanges({ async query(_sql, values = []) { calls.push(values); throw original; } });
    changes.mark('SALES'); changes.mark('INVENTORY');
    await assert.rejects(changes.flush(), error => error === original);
    await assert.rejects(changes.flush(), { code: 'DATASET_VERSION_CHANGES_CLOSED' });
    assert.deepEqual(calls, [['SALES']]);
  }
});
test('flush rejects missing or invalid UPDATE RETURNING rows and remains closed', async () => {
  for (const result of [{ rowCount: 0, rows: [] }, { rowCount: 1, rows: [{ dataset: 'SALES', revision: '0' }] }]) {
    let calls = 0; const changes = createDatasetVersionChanges({ async query() { calls++; return result; } }); changes.mark('SALES');
    await assert.rejects(changes.flush(), { code: 'INVALID_DATASET_VERSION' });
    await assert.rejects(changes.flush(), { code: 'DATASET_VERSION_CHANGES_CLOSED' }); assert.equal(calls, 1);
  }
});
