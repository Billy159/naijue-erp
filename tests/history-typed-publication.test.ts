import test from 'node:test';
import assert from 'node:assert/strict';
import { captureHistoryTypedClosurePlan, assertHistoryPublicationSchema19 } from '../packages/application/src/history-typed-publication.ts';
import { reconcileHistoryTypedPublication } from '../adapters/postgres/src/history-typed-publication.ts';
import { NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY } from '../adapters/postgres/src/native-import-accounting-capability.ts';
import { PostgresHistoryTypedClosure19Store } from '../adapters/postgres/src/history-typed-closure19.ts';
import { closureInput } from './support/history-closure-fixtures.ts';
import type { CutoffImportBatch } from '../packages/application/src/inventory-cutoff-import.ts';
import type { PgSalesClient } from '../adapters/postgres/src/sales-unit-of-work.ts';

test('publication capture is pure own-data, exact bounded maps and detached clone; it grants no authorization', () => {
  const input = closureInput(), p = captureHistoryTypedClosurePlan(input.plan); assert.deepEqual(p, input.plan); assert.notEqual(p.expectedCounts, input.plan.expectedCounts);
  let gets = 0;
  const getter = Object.defineProperty(structuredClone(input.plan), 'selectionSha256', { enumerable: true, get() { gets++; return 'a'.repeat(64); } });
  const nested = structuredClone(input.plan); Object.defineProperty(nested.expectedCounts, 'history_sales_line', { enumerable: true, get() { gets++; return 1; } });
  for (const bad of [undefined, getter, nested, { ...input.plan, passed: true }, { ...input.plan, documentCount: 100001 }, { ...input.plan, documentCount: -0 }, { ...input.plan, selectionSha256: undefined }, { ...input.plan, expectedCounts: { ...input.plan.expectedCounts, history_sales_line: 2 } }]) assert.throws(() => captureHistoryTypedClosurePlan(bad), { code: 'INVALID_HISTORY_PUBLICATION_PLAN' });
  assert.equal(gets, 0);
});
test('new publication profile is finite19; old18 and future20, gaps, duplicates and accessors do not pass', () => {
  const prefix = Array.from({ length: 19 }, (_, i) => i + 1); assert.doesNotThrow(() => assertHistoryPublicationSchema19(prefix)); let gets = 0;
  const getter = Object.defineProperty([...prefix], '0', { enumerable: true, get() { gets++; return 1; } });
  for (const bad of [prefix.slice(0, 18), [...prefix, 20], prefix.filter(n => n !== 12), [...prefix, 19], [...prefix].reverse(), getter]) assert.throws(() => assertHistoryPublicationSchema19(bad), { code: 'HISTORY_PUBLICATION_SCHEMA_NOT_READY' }); assert.equal(gets, 0);
});
function batch(): CutoffImportBatch { const i = closureInput(); return { id: i.batchId, sourceName: i.fixedSourceNamespace, sourceHash: i.plan.selectionSha256, sourceManifestRef: 'synthetic-only', cutoffAt: '2026-10-04T04:00:00.000000Z', mappingVersion: 'V2_HISTORY_NULLABLE_1', inventoryMode: 'CUTOFF_STOCK_BASELINE', status: 'VALIDATING', checkpoint: { sequence: 1, cursor: 0, counts: { WAREHOUSE: 0, SKU: 0, INVENTORY_LEDGER: 0, IMPORT_BATCH: 0 }, expected: { WAREHOUSE: 0, SKU: 0, INVENTORY_LEDGER: 0, IMPORT_BATCH: 1 } }, createdAt: '2026-10-04T04:00:00.000000Z', completedAt: null, historyMetadata: { expectedCounts: i.plan.expectedCounts, payloadHash: i.plan.authorizedPayloadHash } }; }
test('same-client publication requires exact manifest, full descriptors/deep readback and observed counts; it never writes FINAL itself', async () => {
  const input = closureInput(), schema = Array.from({ length: 19 }, (_, i) => i + 1), calls: string[] = [];
  let fail = '';
  const client: PgSalesClient = { async query(sql, values = []) {
    calls.push(sql); if (fail && sql.includes(fail)) throw Error('SYNTHETIC_DEEP_REJECTION');
    let rows: Record<string, unknown>[] = [];
    if (sql.startsWith('/* inventory:guards')) rows = [{ integrity_guards_present: true }];
    if (sql === NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY) rows = [{ accounting_guards_present: true }];
    if (sql.startsWith('/* history-publication:manifest')) rows = [{ exact: true }];
    if (sql.startsWith('/* history-publication:documents')) rows = structuredClone(input.documents) as unknown as Record<string, unknown>[];
    if (sql.startsWith('/* history-publication:deep-readback')) assert.deepEqual(values, [input.batchId, JSON.stringify(input.plan), JSON.stringify(input.documents)]);
    if (sql.startsWith('/* history-publication:counts')) rows = [{ actual_counts: structuredClone(input.plan.expectedCounts), manifest_counts: structuredClone(input.plan.expectedCounts) }];
    return { rows, rowCount: rows.length };
  }, release() { throw Error('Does not own original transaction'); } };
  const result = await reconcileHistoryTypedPublication(client, batch(), input.plan, schema); assert.deepEqual(result.actualCounts, input.plan.expectedCounts);
  assert.ok(calls.some(s => s.startsWith('/* history-publication:deep-readback'))); assert.ok(!calls.some(s => /^(BEGIN|COMMIT|ROLLBACK)|INSERT INTO|UPDATE naijue/.test(s)));
  fail = 'history-publication:deep-readback'; await assert.rejects(reconcileHistoryTypedPublication(client, batch(), input.plan, schema), /SYNTHETIC_DEEP_REJECTION/);
  const before = calls.length; await assert.rejects(reconcileHistoryTypedPublication(client, batch(), { ...input.plan, selectionSha256: '0'.repeat(64) }, schema), { code: 'HISTORY_PUBLICATION_PLAN_MISMATCH' }); assert.ok(calls.slice(before).every(s => !s.startsWith('/* history-publication:')));
});
test('exact19 STAGE authorizes complete independent source before connection; original18 prefix refuses and rolls back', async () => {
  let auth = 0, connections = 0; const events: string[] = [];
  const client: PgSalesClient = { async query(sql) { events.push(sql); return { rows: sql.includes('history19-closure:schema') ? [{ versions: Array.from({ length: 18 }, (_, i) => i + 1) }] : [], rowCount: 0 }; }, release() {} };
  const store = new PostgresHistoryTypedClosure19Store({ async connect() { connections++; return client; } }, { async authorizeStage(i) { auth++; assert.deepEqual(i, closureInput()); } });
  await assert.rejects(store.stage(closureInput()), { code: 'HISTORY_PUBLICATION_SCHEMA_NOT_READY' }); assert.equal(auth, 1); assert.equal(connections, 1); assert.equal(events.at(-1), 'ROLLBACK');
});
