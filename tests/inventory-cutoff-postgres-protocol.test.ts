/** Synthetic pg protocol sequencing ONLY. No SQL parser, engine, isolation, or durability proof. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresCutoffImportStore } from "../adapters/postgres/src/inventory-cutoff-import-store.ts";
import { PostgresCutoffScopeReader } from "../adapters/postgres/src/inventory-cutoff-scope-reader.ts";
import type { PgSalesClient, PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";
import { COMPLETE_SCOPE_DECISION } from "../packages/application/src/inventory-cutoff-import.ts";
import type { CutoffImportCommand, CutoffImportResult } from "../packages/application/src/inventory-cutoff-import.ts";
import { cutoffTime, cutoffIds, cutoffExpected, cutoffStage, cutoffChunk, cutoffPublish, syntheticCutoffBatch } from "./support/synthetic-cutoff-fixtures.ts";

interface Step { readonly match: RegExp; readonly rows?: Record<string, unknown>[]; readonly count?: number; readonly error?: Error; readonly inspect?: (values: unknown[], sql: string) => void }
class ProtocolClient implements PgSalesClient {
  readonly calls: { sql: string; values: unknown[] }[] = []; readonly releases: (Error | boolean | undefined)[] = [];
  private readonly steps: Step[];
  constructor(steps: Step[]) { this.steps = steps; }
  async query(sql: string, values: unknown[] = []): Promise<PgSalesResult> {
    this.calls.push({ sql, values }); const step = this.steps.shift(); assert.ok(step, `Unexpected protocol query: ${sql}`); assert.match(sql, step.match);
    step.inspect?.(values, sql); if (step.error) throw step.error;
    return { rows: step.rows ?? [], rowCount: step.count ?? 1 };
  }
  release(error?: Error | boolean): void { this.releases.push(error); }
  done(): void { assert.equal(this.steps.length, 0); assert.equal(this.releases.length, 1); }
}
const begin = (): Step => ({ match: /^BEGIN ISOLATION LEVEL READ COMMITTED$/ });
const commit = (): Step => ({ match: /^COMMIT$/ });
const rollback = (): Step => ({ match: /^ROLLBACK$/ });
const lock = (): Step => ({ match: /^SELECT pg_advisory_xact_lock/ });
const sourceLock = (): Step => ({ match: /^SELECT naijue_erp.import_source_key_lock/ });
const receipt = (rows: Record<string, unknown>[] = []): Step[] => [lock(), { match: /FROM naijue_erp.operation_receipt/, rows }];
function batchRow(status = "STAGED", cursor = 0, sequence = 0): Record<string, unknown> {
  return { id: cutoffIds.batch, source_name: cutoffStage.sourceName, source_manifest_ref: cutoffStage.sourceManifestRef, source_hash: cutoffStage.sourceHash,
    cutoff_at: cutoffTime, mapping_version: cutoffStage.mappingVersion, inventory_mode: "CUTOFF_STOCK_BASELINE", status,
    checkpoint: { sequence, cursor, counts: cursor === 0 ? { WAREHOUSE: 0, SKU: 0, INVENTORY_LEDGER: 0, IMPORT_BATCH: 0 }
      : { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: status === "IMPORTED" ? 1 : 0 }, expected: cutoffExpected },
    created_at: cutoffTime, completed_at: status === "IMPORTED" ? cutoffTime : null };
}
const batch = (row?: Record<string, unknown>): Step[] => [{ match: /^SELECT naijue_erp.cutoff_import_lock/ }, lock(), { match: /FROM naijue_erp.import_batch WHERE id = \$1 FOR UPDATE/, rows: row ? [row] : [] }];
const evidence = (): Step[] => [{ match: /^INSERT INTO naijue_erp.audit_change/ }, { match: /^INSERT INTO naijue_erp.operation_receipt/ }];
const store = (client: ProtocolClient) => new PostgresCutoffImportStore({ async connect() { return client; } });
const execute = (client: ProtocolClient, command: CutoffImportCommand) => store(client).execute(command, cutoffTime);
function chunkWrites(): Step[] {
  return [...Array.from({ length: 3 }, sourceLock), { match: /^SELECT naijue_erp.inventory_key_lock/ },
    sourceLock(), { match: /^INSERT INTO naijue_erp.import_record/, inspect(v) { assert.equal(v[6], "WAREHOUSE"); } },
    sourceLock(), { match: /^INSERT INTO naijue_erp.import_record/, inspect(v) { assert.equal(v[6], "SKU"); } },
    sourceLock(), { match: /^INSERT INTO naijue_erp.import_record/, inspect(v) { assert.equal(v[6], "INVENTORY_LEDGER"); } },
    { match: /^INSERT INTO naijue_erp.inventory_ledger/, inspect(v, sql) { assert.equal(v[4], "7"); assert.match(sql, /'CUTOFF_BASELINE'/); assert.equal(v[5], cutoffIds.batch); } },
    { match: /^INSERT INTO naijue_erp.inventory_balance/, inspect(v, sql) { assert.equal(v[2], "7"); assert.doesNotMatch(sql, /ON CONFLICT|UPDATE/); } },
    { match: /^UPDATE naijue_erp.import_batch/, inspect(v) { const checkpoint = JSON.parse(String(v[2])); assert.equal(checkpoint.sequence, 1); assert.equal(checkpoint.cursor, 3); assert.equal(v[1], "VALIDATING"); } }];
}
test("cutoff pg protocol: staging freezes reviewed manifest and checkpoints with native receipt/audit", async () => {
  const client = new ProtocolClient([begin(), ...receipt(), ...batch(), { match: /^INSERT INTO naijue_erp.import_batch/,
    inspect(v) { assert.equal(v[1], cutoffStage.sourceName); assert.equal(v[3], cutoffStage.sourceHash); assert.equal(JSON.parse(String(v[6])).cursor, 0); } }, ...evidence(), commit()]);
  const result = await execute(client, cutoffStage); assert.equal(result.status, "STAGED"); assert.equal(result.cursor, 0); assert.deepEqual(result.ledgerEntryIds, []); client.done();
});
test("cutoff pg protocol: one bounded chunk atomically creates only nonzero stock and advances checkpoint", async () => {
  const client = new ProtocolClient([begin(), ...receipt(), ...batch(batchRow()), ...chunkWrites(), ...evidence(), commit()]);
  const result = await execute(client, cutoffChunk); assert.equal(result.cursor, 3); assert.equal(result.ledgerEntryIds.length, 1);
  assert.equal(client.calls.filter(c => /^INSERT INTO naijue_erp.inventory_balance/.test(c.sql)).length, 1);
  assert.ok(client.calls.findIndex(c => /^SELECT naijue_erp.inventory_key_lock/.test(c.sql)) < client.calls.findIndex(c => /^INSERT INTO/.test(c.sql))); client.done();
});
test("cutoff pg protocol: final explicit approval and publication use the same checkpoint transaction", async () => {
  const client = new ProtocolClient([begin(), ...receipt(), ...batch(batchRow("VALIDATING", 3, 1)), sourceLock(),
    { match: /^INSERT INTO naijue_erp.import_record/, inspect(v) { assert.equal(v[2], "INVENTORY_SCOPE_APPROVAL"); assert.equal(v[8], COMPLETE_SCOPE_DECISION); } },
    { match: /^UPDATE naijue_erp.import_batch/, inspect(v) { assert.equal(v[1], "IMPORTED"); assert.equal(v[3], cutoffTime); const c = JSON.parse(String(v[2])); assert.equal(c.counts.IMPORT_BATCH, 1); assert.equal(c.cursor, 4); } }, ...evidence(), commit()]);
  assert.equal((await execute(client, cutoffPublish)).status, "IMPORTED"); client.done();
});
test("cutoff pg protocol: same original key/hash replays immutable result without any stock/checkpoint writes", async () => {
  const first = new ProtocolClient([begin(), ...receipt(), ...batch(), { match: /^INSERT INTO naijue_erp.import_batch/ }, ...evidence(), commit()]);
  const result = await execute(first, cutoffStage); first.done();
  const replay = new ProtocolClient([begin(), ...receipt([{ request_hash: requestHash(cutoffStage), target_type: "IMPORT", target_id: cutoffIds.batch,
    action: cutoffStage.action, result_data: result }]), commit()]);
  assert.deepEqual(await execute(replay, cutoffStage), result); assert.ok(replay.calls.every(c => !/^(INSERT|UPDATE|DELETE)/.test(c.sql))); replay.done();
});
for (const mismatch of [{ request_hash: "f".repeat(64) }, { target_type: "SALES" }, { target_id: cutoffIds.account }, { action: "IMPORT_CHUNK" }]) {
  test(`cutoff pg protocol: conflicting existing receipt ${Object.keys(mismatch)[0]} never resumes/rewrites`, async () => {
    const client = new ProtocolClient([begin(), ...receipt([{ request_hash: requestHash(cutoffStage), target_type: "IMPORT", target_id: cutoffIds.batch, action: "IMPORT_STAGE", ...mismatch }]), rollback()]);
    await assert.rejects(execute(client, cutoffStage), { code: "IDEMPOTENCY_CONFLICT" }); client.done();
  });
}
test("cutoff pg protocol: stale checkpoint or frozen scope fails before source/stock writes", async () => {
  for (const row of [batchRow("VALIDATING", 3, 1), batchRow("IMPORTED", 4, 2)]) {
    const client = new ProtocolClient([begin(), ...receipt(), ...batch(row), rollback()]);
    await assert.rejects(execute(client, cutoffChunk), { code: row.status === "IMPORTED" ? "IMPORT_BATCH_FROZEN" : "IMPORT_CHECKPOINT_CONFLICT" });
    assert.ok(client.calls.every(c => !/^(INSERT|UPDATE|DELETE)/.test(c.sql))); client.done();
  }
});
test("cutoff pg protocol: incomplete counts and mismatched approval manifest never publish", async () => {
  const incomplete = new ProtocolClient([begin(), ...receipt(), ...batch(batchRow()), rollback()]);
  await assert.rejects(execute(incomplete, { ...cutoffPublish, expectedCursor: 0, expectedSequence: 0 }), { code: "INCOMPLETE_IMPORT_SCOPE" }); incomplete.done();
  const mismatch = new ProtocolClient([begin(), ...receipt(), ...batch(batchRow("VALIDATING", 3, 1)), rollback()]);
  await assert.rejects(execute(mismatch, { ...cutoffPublish, approval: { ...cutoffPublish.approval, sourceHash: "f".repeat(64) } }), { code: "IMPORT_MANIFEST_CONFLICT" }); mismatch.done();
});
for (const point of ["source", "ledger", "balance", "checkpoint", "audit", "receipt"] as const) {
  test(`cutoff pg protocol: ${point} failure requests rollback, never advances a committed synthetic checkpoint`, async () => {
    const writes = [...chunkWrites(), ...evidence()]; const pattern = { source: /^INSERT INTO naijue_erp.import_record/, ledger: /^INSERT INTO naijue_erp.inventory_ledger/,
      balance: /^INSERT INTO naijue_erp.inventory_balance/, checkpoint: /^UPDATE naijue_erp.import_batch/, audit: /^INSERT INTO naijue_erp.audit_change/, receipt: /^INSERT INTO naijue_erp.operation_receipt/ }[point];
    const position = writes.findIndex(step => step.match.source === pattern.source); assert.ok(position >= 0); const failure = new Error(`synthetic ${point} failure`);
    const prefix = writes.slice(0, position + 1); prefix[position] = { ...prefix[position]!, error: failure };
    const client = new ProtocolClient([begin(), ...receipt(), ...batch(batchRow()), ...prefix, rollback()]);
    await assert.rejects(execute(client, cutoffChunk), error => error === failure); client.done();
  });
}
test("cutoff pg protocol: uncertain COMMIT discards connection and never automatically retries", async () => {
  const failure = new Error("synthetic commit acknowledgment lost");
  const client = new ProtocolClient([begin(), ...receipt(), ...batch(), { match: /^INSERT INTO naijue_erp.import_batch/ }, ...evidence(), { match: /^COMMIT$/, error: failure }]);
  await assert.rejects(execute(client, cutoffStage), error => error === failure); assert.equal(client.releases[0], failure); assert.ok(!client.calls.some(c => c.sql === "ROLLBACK")); client.done();
});
for (const point of ["source", "ledger", "balance", "checkpoint"] as const) {
  test(`cutoff pg protocol: zero-row ${point} result rolls back without advancing checkpoint/evidence`, async () => {
    const writes = chunkWrites(); const pattern = { source: /^INSERT INTO naijue_erp.import_record/, ledger: /^INSERT INTO naijue_erp.inventory_ledger/,
      balance: /^INSERT INTO naijue_erp.inventory_balance/, checkpoint: /^UPDATE naijue_erp.import_batch/ }[point];
    const position = writes.findIndex(step => step.match.source === pattern.source); assert.ok(position >= 0);
    const prefix = writes.slice(0, position + 1); prefix[position] = { ...prefix[position]!, count: 0 };
    const client = new ProtocolClient([begin(), ...receipt(), ...batch(batchRow()), ...prefix, rollback()]);
    await assert.rejects(execute(client, cutoffChunk), { code: point === "checkpoint" ? "IMPORT_CHECKPOINT_CONFLICT" : "IMPORT_INSERT_FAILED" }); client.done();
  });
}
test("cutoff pg protocol: zero-row stage insert cannot create a false successful receipt", async () => {
  const client = new ProtocolClient([begin(), ...receipt(), ...batch(), { match: /^INSERT INTO naijue_erp.import_batch/, count: 0 }, rollback()]);
  await assert.rejects(execute(client, cutoffStage), { code: "IMPORT_INSERT_FAILED" }); client.done();
});
test("cutoff pg protocol: key-lock/source identities are deterministic after source filename rename", async () => {
  const renamed = { ...cutoffChunk, items: cutoffChunk.items.map(item => ({ ...item, sourceFileRef: "synthetic:renamed-file" })) };
  const clients = [cutoffChunk, renamed].map(() => new ProtocolClient([begin(), ...receipt(), ...batch(batchRow()), ...chunkWrites(), ...evidence(), commit()]));
  await execute(clients[0]!, cutoffChunk); await execute(clients[1]!, renamed);
  const ids = (client: ProtocolClient) => client.calls.filter(c => /^INSERT INTO naijue_erp.import_record/.test(c.sql)).map(c => c.values[0]);
  assert.deepEqual(ids(clients[0]!), ids(clients[1]!)); clients.forEach(c => c.done());
});
test("cutoff pg protocol: scope read uses one repeatable snapshot, W+SKU members, and native guard capability", async () => {
  const client = new ProtocolClient([{ match: /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$/ }, { match: /FROM naijue_erp.import_batch WHERE status/, rows: [batchRow("IMPORTED", 4, 2)] },
    { match: /pg_catalog.pg_constraint/, rows: [{ integrity_guards_present: true }] }, { match: /FROM naijue_erp.import_record r/, rows: [
      { target_type: "WAREHOUSE", target_id: cutoffIds.warehouse, target_exists: true }, { target_type: "SKU", target_id: cutoffIds.sku, target_exists: true }] }, commit()]);
  const result = await new PostgresCutoffScopeReader({ async connect() { return client; } }).read(); assert.equal(result.skuIds.length, 1);
  assert.ok(client.calls.every(c => !/^(INSERT|UPDATE|DELETE)/.test(c.sql))); client.done();
});
test("D3 read outcome: cutoff scope unknown COMMIT is discarded without rollback or retry", async () => {
  const failure = new Error("SYNTHETIC scope commit acknowledgment lost");
  const client = new ProtocolClient([{ match: /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$/ },
    { match: /FROM naijue_erp.import_batch WHERE status/, rows: [batchRow("IMPORTED", 4, 2)] },
    { match: /pg_catalog.pg_constraint/, rows: [{ integrity_guards_present: true }] },
    { match: /FROM naijue_erp.import_record r/, rows: [
      { target_type: "WAREHOUSE", target_id: cutoffIds.warehouse, target_exists: true },
      { target_type: "SKU", target_id: cutoffIds.sku, target_exists: true }] },
    { match: /^COMMIT$/, error: failure }]);
  await assert.rejects(new PostgresCutoffScopeReader({ async connect() { return client; } }).read(), error => error === failure);
  assert.equal(client.calls.at(-1)!.sql, "COMMIT"); assert.deepEqual(client.releases, [failure]); client.done();
});

test("cutoff pg protocol: no published scope and missing native integrity guards fail whole read", async () => {
  const absent = new ProtocolClient([{ match: /^BEGIN/ }, { match: /FROM naijue_erp.import_batch WHERE status/, rows: [] }, rollback()]);
  await assert.rejects(new PostgresCutoffScopeReader({ async connect() { return absent; } }).read(), { code: "INVENTORY_NOT_READY" }); absent.done();
  const broken = new ProtocolClient([{ match: /^BEGIN/ }, { match: /FROM naijue_erp.import_batch WHERE status/, rows: [batchRow("IMPORTED", 4, 2)] },
    { match: /pg_catalog.pg_constraint/, rows: [{ integrity_guards_present: false }] }, { match: /FROM naijue_erp.import_record r/, rows: [] }, rollback()]);
  await assert.rejects(new PostgresCutoffScopeReader({ async connect() { return broken; } }).read(), { code: "INVENTORY_INTEGRITY_FAILED" }); broken.done();
});
