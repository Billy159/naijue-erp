// Independent SOURCE/SYNTHETIC/PROTOCOL probes only. No PostgreSQL, server, browser, or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PostgresCutoffImportStore } from '../adapters/postgres/src/inventory-cutoff-import-store.ts';
import { stableImportId, validateCutoffImportCommand } from '../packages/application/src/inventory-cutoff-import.ts';
import { cutoffIds, cutoffTime, cutoffStage } from '../tests/support/synthetic-cutoff-fixtures.ts';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const id = (purpose, key) => stableImportId(purpose, 'independent-synthetic', String(key));
const expected = { WAREHOUSE: 1, SKU: 500, INVENTORY_LEDGER: 500, IMPORT_BATCH: 1 };
const batch = {
  id: cutoffIds.batch, source_name: cutoffStage.sourceName, source_manifest_ref: cutoffStage.sourceManifestRef,
  source_hash: cutoffStage.sourceHash, cutoff_at: cutoffTime, mapping_version: cutoffStage.mappingVersion,
  inventory_mode: 'CUTOFF_STOCK_BASELINE', status: 'VALIDATING', created_at: cutoffTime, completed_at: null,
  checkpoint: { sequence: 1, cursor: 501, counts: { WAREHOUSE: 1, SKU: 500, INVENTORY_LEDGER: 0, IMPORT_BATCH: 0 }, expected }
};
const items = Array.from({ length: 500 }, (_, index) => ({
  sourceEntityType: 'INVENTORY_BASELINE', sourceKey: `original-${500 - index}`, sourceRecordHash: 'd'.repeat(64), sourceFileRef: 'synthetic:independent-original',
  targetType: 'INVENTORY_LEDGER', warehouseId: cutoffIds.warehouse, skuId: id('sku', index),
  quantity: index % 2 === 0 ? 7n : -7n, businessDate: '2026-10-20'
}));
const command = { action: 'IMPORT_CHUNK', actorAccountId: cutoffIds.account, requestKey: 'independent-500-baselines', batchId: cutoffIds.batch,
  expectedSequence: 1, expectedCursor: 501, items };

class Client {
  calls = []; releases = []; options;
  constructor(options = {}) { this.options = options; }
  async query(sql, values = []) {
    this.calls.push({ sql, values });
    if (sql === 'COMMIT' && this.options.commitFailure) throw this.options.commitFailure;
    if (sql === 'ROLLBACK' && this.options.rollbackFailure) throw this.options.rollbackFailure;
    if (/FROM naijue_erp\.operation_receipt/.test(sql)) return { rows: this.options.saved ? [this.options.saved] : [], rowCount: this.options.saved ? 1 : 0 };
    if (/FROM naijue_erp\.import_batch WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: [batch], rowCount: 1 };
    if (/^INSERT INTO naijue_erp\.inventory_balance/.test(sql) && this.options.balanceFailure) throw this.options.balanceFailure;
    return { rows: [], rowCount: 1 };
  }
  release(error) { this.releases.push(error); }
}
const execute = (client, value = command) => new PostgresCutoffImportStore({ async connect() { return client; } }).execute(value, cutoffTime);

test('independent SQL composition: baseline cannot reach the old strict TRANSFER receipt-source branch', async () => {
  const old = await read('adapters/postgres/migrations/0004_transfer_runtime.sql');
  const added = await read('adapters/postgres/migrations/0007_sparse_inventory_cutoff.sql');
  assert.match(old, /ELSE\s+SELECT transfer_id INTO STRICT owner_id FROM naijue_erp\.transfer_line WHERE id = NEW\.source_transfer_line_id/);
  assert.match(added, /DROP TRIGGER ledger_receipt_source_coherence ON naijue_erp\.inventory_ledger/);
  const recreated = added.match(/CREATE CONSTRAINT TRIGGER ledger_receipt_source_coherence[\s\S]*?;/)?.[0];
  assert.ok(recreated, '0007 must compose the old native trigger explicitly');
  assert.match(recreated, /WHEN\s*\(NEW\.event_kind IN\s*\('APPROVE',\s*'UNAPPROVE'\)\)/);
  assert.match(recreated, /EXECUTE FUNCTION naijue_erp\.validate_ledger_receipt_source\(\)/);
  assert.match(added, /CREATE CONSTRAINT TRIGGER baseline_source_final_consistency/);
  assert.doesNotMatch(added, /(?:CREATE OR REPLACE|DROP) FUNCTION naijue_erp\.validate_ledger_receipt_source/);
});

test('independent SQL access path: import checkpoint audit lookup has an IMPORT object/version index', async () => {
  const added = await read('adapters/postgres/migrations/0007_sparse_inventory_cutoff.sql');
  assert.match(added, /CREATE UNIQUE INDEX \w+ ON naijue_erp\.audit_change\s*\(object_id,\s*new_version\)\s*WHERE object_type = 'IMPORT'/);
  const checkpoint = added.slice(added.indexOf('CREATE FUNCTION naijue_erp.validate_import_batch_commit()'), added.indexOf('CREATE FUNCTION naijue_erp.validate_import_operation()'));
  assert.match(checkpoint, /WHERE object_type = 'IMPORT' AND object_id = NEW\.id/);
  assert.doesNotMatch(checkpoint, /FROM naijue_erp\.(?:import_record|inventory_ledger)/);
});

test('independent bounded protocol: 500 shuffled signed baselines lock before writes and advance one exact checkpoint', async () => {
  const client = new Client(); const result = await execute(client);
  assert.equal(client.calls[0].sql, 'BEGIN ISOLATION LEVEL READ COMMITTED');
  assert.equal(client.calls.at(-1).sql, 'COMMIT'); assert.deepEqual(client.releases, [undefined]);
  const firstWrite = client.calls.findIndex(call => /^(INSERT|UPDATE)/.test(call.sql));
  const prewrites = client.calls.slice(0, firstWrite);
  // insertRecord safely repeats an already-held source lock immediately before its INSERT.
  const sourceLocks = prewrites.filter(call => /^SELECT naijue_erp\.import_source_key_lock/.test(call.sql));
  assert.equal(new Set(sourceLocks.map(call => JSON.stringify(call.values))).size, 500);
  const keyCalls = prewrites.filter(call => /^SELECT naijue_erp\.inventory_key_lock/.test(call.sql));
  assert.equal(keyCalls.length, 500);
  const keyOrder = keyCalls.map(call => JSON.stringify(call.values)); assert.deepEqual(keyOrder, [...keyOrder].sort());
  const sources = client.calls.filter(call => /^INSERT INTO naijue_erp\.import_record/.test(call.sql));
  const ledger = client.calls.filter(call => /^INSERT INTO naijue_erp\.inventory_ledger/.test(call.sql));
  const balances = client.calls.filter(call => /^INSERT INTO naijue_erp\.inventory_balance/.test(call.sql));
  assert.equal(sources.length, 500); assert.equal(ledger.length, 500); assert.equal(balances.length, 500);
  assert.equal(new Set(sources.map(call => call.values[0])).size, 500);
  assert.equal(ledger.filter(call => call.values[4] === '7').length, 250);
  assert.equal(ledger.filter(call => call.values[4] === '-7').length, 250);
  assert.ok(balances.every(call => ['7', '-7'].includes(call.values[2]) && !/ON CONFLICT|UPDATE/.test(call.sql)));
  assert.ok(client.calls.every(call => !/SELECT count\(\*\).*import_record/is.test(call.sql)));
  const checkpoint = JSON.parse(client.calls.find(call => /^UPDATE naijue_erp\.import_batch/.test(call.sql)).values[2]);
  assert.deepEqual(checkpoint, { sequence: 2, cursor: 1001, counts: { WAREHOUSE: 1, SKU: 500, INVENTORY_LEDGER: 500, IMPORT_BATCH: 0 }, expected });
  assert.equal(result.ledgerEntryIds.length, 500); assert.deepEqual(result.ledgerEntryIds, [...result.ledgerEntryIds].sort());
  const receipt = client.calls.find(call => /^INSERT INTO naijue_erp\.operation_receipt/.test(call.sql));
  assert.deepEqual(JSON.parse(receipt.values[6]).ledgerEntryIds, result.ledgerEntryIds);
});

test('independent bounded validation: record 501 and zero stock cannot start a transaction', async () => {
  const client = new Client();
  await assert.rejects(execute(client, { ...command, items: [...items, { ...items[0], sourceKey: 'record-501' }] }), { code: 'INVALID_IMPORT_CHUNK' });
  assert.equal(client.calls.length, 0);
  assert.throws(() => validateCutoffImportCommand({ ...command, items: [{ ...items[0], quantity: 0n }] }), { code: 'INVALID_SPARSE_BASELINE' });
});

test('independent failure protocol: uncertain COMMIT requests rollback and discards without automatic replay', async () => {
  const failure = new Error('independent synthetic lost commit acknowledgement'); const client = new Client({ commitFailure: failure });
  await assert.rejects(execute(client), error => error === failure);
  assert.deepEqual(client.calls.slice(-2).map(call => call.sql), ['COMMIT', 'ROLLBACK']);
  assert.deepEqual(client.releases, [failure]);
  assert.equal(client.calls.filter(call => /^BEGIN/.test(call.sql)).length, 1);
  assert.equal(client.calls.filter(call => /^INSERT INTO naijue_erp\.operation_receipt/.test(call.sql)).length, 1);
});

test('independent failure protocol: failed baseline plus failed rollback returns both failures and discards', async () => {
  const balanceFailure = new Error('independent synthetic balance failure'); const rollbackFailure = new Error('independent synthetic rollback failure');
  const client = new Client({ balanceFailure, rollbackFailure });
  await assert.rejects(execute(client), error => error instanceof AggregateError && error.errors[0] === balanceFailure && error.errors[1] === rollbackFailure);
  assert.deepEqual(client.releases, [rollbackFailure]); assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  assert.ok(!client.calls.some(call => /^(UPDATE naijue_erp\.import_batch|INSERT INTO naijue_erp\.(?:audit_change|operation_receipt)|COMMIT)/.test(call.sql)));
});
