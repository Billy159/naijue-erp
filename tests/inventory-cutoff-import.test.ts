/** Pure synthetic application/policy tests. Not PostgreSQL or real import evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { CUTOFF_IMPORT_CHUNK_LIMIT, createCutoffImportService, stableImportId, validateCutoffImportCommand } from "../packages/application/src/inventory-cutoff-import.ts";
import type { CutoffImportBatch, CutoffImportCommand, CutoffImportItem, CutoffImportResult } from "../packages/application/src/inventory-cutoff-import.ts";
import { publishedCutoffScope, sparseInventoryQuantity } from "../packages/application/src/inventory-cutoff-scope.ts";
import { businessDate, entityId, quantity, version } from "../packages/domain/src/values.ts";

import { cutoffTime, cutoffIds, cutoffExpected, cutoffStage, cutoffItems, cutoffChunk, cutoffPublish, syntheticCutoffBatch } from "./support/synthetic-cutoff-fixtures.ts";
const members = [{ targetType: "WAREHOUSE" as const, targetId: cutoffIds.warehouse, targetExists: true }, { targetType: "SKU" as const, targetId: cutoffIds.sku, targetExists: true }];
test("cutoff synthetic: explicitly published full scope resolves absent real stock to exactly zero", () => {
  const scope = publishedCutoffScope(syntheticCutoffBatch(), members, true);
  assert.equal(sparseInventoryQuantity(scope, cutoffIds.warehouse, cutoffIds.sku, undefined), 0n);
  const balance = { warehouseId: cutoffIds.warehouse, skuId: cutoffIds.sku, quantity: quantity("-7"), version: version(1),
    lastOperationId: entityId("operation", stableImportId("operation", "synthetic")), updatedAt: cutoffTime };
  assert.equal(sparseInventoryQuantity(scope, cutoffIds.warehouse, cutoffIds.sku, balance), -7n);
  assert.throws(() => sparseInventoryQuantity(scope, entityId("warehouse", stableImportId("other", "synthetic")), cutoffIds.sku, undefined), { code: "INVENTORY_NOT_READY" });
  assert.throws(() => sparseInventoryQuantity(scope, cutoffIds.warehouse, cutoffIds.sku, { ...balance, lastOperationId: null }), { code: "INVENTORY_INTEGRITY_FAILED" });
});
for (const state of ["STAGED", "VALIDATING", "PASSED", "FAILED"] as const) test(`cutoff synthetic: ${state} is whole-read not-ready, never an absent-zero proof`, () => {
  assert.throws(() => publishedCutoffScope(syntheticCutoffBatch(state), members, true), { code: "INVENTORY_NOT_READY" });
});
test("cutoff synthetic: missing/duplicate/mismatched members and disabled constraints fail the entire scope", () => {
  const batch = syntheticCutoffBatch();
  for (const bad of [members.slice(0, 1), [...members, members[0]!], members.map(m => ({ ...m, targetExists: false }))]) {
    assert.throws(() => publishedCutoffScope(batch, bad, true), { code: "INVENTORY_INTEGRITY_FAILED" });
  }
  assert.throws(() => publishedCutoffScope(batch, members, false), { code: "INVENTORY_INTEGRITY_FAILED" });
  assert.throws(() => publishedCutoffScope({ ...batch, checkpoint: { ...batch.checkpoint, cursor: 3 } }, members, true), { code: "INVENTORY_INTEGRITY_FAILED" });
});
test("cutoff synthetic: scope members grow W+SKU rather than storing the zero Cartesian product", () => {
  const warehouseIds = Array.from({ length: 50 }, (_, i) => entityId("warehouse", stableImportId("warehouse", String(i))));
  const skuIds = Array.from({ length: 2000 }, (_, i) => entityId("sku", stableImportId("sku", String(i))));
  const counts = { WAREHOUSE: warehouseIds.length, SKU: skuIds.length, INVENTORY_LEDGER: 0, IMPORT_BATCH: 1 };
  const batch = syntheticCutoffBatch(); const scope = publishedCutoffScope({ ...batch, checkpoint: { sequence: 10, cursor: 2051, counts, expected: counts } },
    [...warehouseIds.map(targetId => ({ targetType: "WAREHOUSE" as const, targetId, targetExists: true })), ...skuIds.map(targetId => ({ targetType: "SKU" as const, targetId, targetExists: true }))], true);
  assert.equal(scope.warehouseIds.length + scope.skuIds.length, 2050);
  assert.equal(sparseInventoryQuantity(scope, warehouseIds[49]!, skuIds[1999]!, undefined), 0n);
});
test("cutoff synthetic: zero baselines, duplicate source/target identities and over-bounded chunks are rejected", () => {
  const baseline = cutoffItems[2]!; assert.equal(baseline.targetType, "INVENTORY_LEDGER");
  assert.throws(() => validateCutoffImportCommand({ ...cutoffChunk, items: [{ ...baseline, quantity: quantity("0") } as CutoffImportItem] }), { code: "INVALID_SPARSE_BASELINE" });
  assert.throws(() => validateCutoffImportCommand({ ...cutoffChunk, items: [cutoffItems[0]!, cutoffItems[0]!] }), { code: "DUPLICATE_IMPORT_SOURCE" });
  assert.throws(() => validateCutoffImportCommand({ ...cutoffChunk, items: [cutoffItems[0]!, { ...cutoffItems[0]!, sourceKey: "different-original" }] }), { code: "DUPLICATE_IMPORT_TARGET" });
  assert.throws(() => validateCutoffImportCommand({ ...cutoffChunk, items: Array.from({ length: CUTOFF_IMPORT_CHUNK_LIMIT + 1 }, () => cutoffItems[0]!) }), { code: "INVALID_IMPORT_CHUNK" });
});
test("cutoff synthetic: explicit missing final-delta attestation cannot be inferred from EOF/counts", () => {
  assert.throws(() => validateCutoffImportCommand({ ...cutoffPublish, approval: { ...cutoffPublish.approval, finalDeltaVerified: false } } as unknown as CutoffImportCommand), { code: "INCOMPLETE_IMPORT_SCOPE" });
  assert.throws(() => validateCutoffImportCommand({ ...cutoffStage, expected: { ...cutoffExpected, IMPORT_BATCH: 0 } }), { code: "INVALID_IMPORT_COUNTS" });
});
test("cutoff synthetic: stable source identity ignores filename, preserves namespace/category/key distinctions", () => {
  const first = stableImportId("source", "fixed", "SKU", "old-primary-key");
  assert.equal(first, stableImportId("source", "fixed", "SKU", "old-primary-key"));
  assert.notEqual(first, stableImportId("source", "other", "SKU", "old-primary-key"));
  assert.notEqual(first, stableImportId("source", "fixed", "WAREHOUSE", "old-primary-key"));
  assert.notEqual(first, stableImportId("source", "fixed", "SKU", "old-primary-key-2"));
});
test("cutoff synthetic: current authorization is required before store execution, even a receipt replay", async () => {
  let writes = 0; const result: CutoffImportResult = { operationId: entityId("operation", stableImportId("op", "test")), batchId: cutoffIds.batch, sequence: 0, cursor: 0, status: "STAGED", ledgerEntryIds: [] };
  const service = createCutoffImportService({ store: { async execute() { writes++; return result; } }, now: () => cutoffTime,
    authorization: { async assertAllowed() { throw new Error("synthetic revoked"); } } });
  await assert.rejects(service.execute(cutoffStage), /synthetic revoked/); assert.equal(writes, 0);
});
