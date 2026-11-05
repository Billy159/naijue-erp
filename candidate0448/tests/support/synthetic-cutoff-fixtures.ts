import { stableImportId } from "../../packages/application/src/inventory-cutoff-import.ts";
import type { CutoffImportBatch, CutoffImportCommand, CutoffImportItem } from "../../packages/application/src/inventory-cutoff-import.ts";
import { businessDate, entityId, quantity } from "../../packages/domain/src/values.ts";

export const cutoffTime = "2026-10-20T00:00:00.000000Z";
export const cutoffIds = { batch: stableImportId("batch", "synthetic"), account: entityId("account", stableImportId("account", "synthetic")),
  warehouse: entityId("warehouse", stableImportId("warehouse", "synthetic")), sku: entityId("sku", stableImportId("sku", "synthetic")) };
export const cutoffExpected = { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 1 } as const;
export const cutoffStage: Extract<CutoffImportCommand, { action: "IMPORT_STAGE" }> = { action: "IMPORT_STAGE", actorAccountId: cutoffIds.account,
  requestKey: "synthetic-stage", batchId: cutoffIds.batch, sourceName: "synthetic.fixed-source", sourceHash: "a".repeat(64),
  sourceManifestRef: "synthetic:manifest-immutable", cutoffAt: cutoffTime, mappingVersion: "synthetic-approved-v1", expected: cutoffExpected };
export const cutoffItems: readonly CutoffImportItem[] = [
  { targetType: "WAREHOUSE", targetId: cutoffIds.warehouse, sourceEntityType: "WAREHOUSE", sourceKey: "original-warehouse-1", sourceRecordHash: "1".repeat(64), sourceFileRef: "synthetic:warehouse-original" },
  { targetType: "SKU", targetId: cutoffIds.sku, sourceEntityType: "SKU", sourceKey: "original-sku-1", sourceRecordHash: "2".repeat(64), sourceFileRef: "synthetic:sku-original" },
  { targetType: "INVENTORY_LEDGER", warehouseId: cutoffIds.warehouse, skuId: cutoffIds.sku, quantity: quantity("7"), businessDate: businessDate("2026-10-20"),
    sourceEntityType: "INVENTORY_BASELINE", sourceKey: "original-stock-1", sourceRecordHash: "3".repeat(64), sourceFileRef: "synthetic:stock-original" }
];
export const cutoffChunk: Extract<CutoffImportCommand, { action: "IMPORT_CHUNK" }> = { action: "IMPORT_CHUNK", actorAccountId: cutoffIds.account,
  requestKey: "synthetic-chunk-1", batchId: cutoffIds.batch, expectedSequence: 0, expectedCursor: 0, items: cutoffItems };
export const cutoffPublish: Extract<CutoffImportCommand, { action: "IMPORT_PUBLISH" }> = { action: "IMPORT_PUBLISH", actorAccountId: cutoffIds.account,
  requestKey: "synthetic-publish", batchId: cutoffIds.batch, expectedSequence: 1, expectedCursor: 3,
  approval: { completeScope: true, absentMeansZero: true, allFilesVerified: true, finalDeltaVerified: true, noUnresolvedExceptions: true,
    sourceHash: cutoffStage.sourceHash, sourceManifestRef: cutoffStage.sourceManifestRef } };
export function syntheticCutoffBatch(status: CutoffImportBatch["status"] = "IMPORTED"): CutoffImportBatch {
  return { id: cutoffIds.batch, sourceName: cutoffStage.sourceName, sourceHash: cutoffStage.sourceHash, sourceManifestRef: cutoffStage.sourceManifestRef,
    cutoffAt: cutoffTime, mappingVersion: cutoffStage.mappingVersion, inventoryMode: "CUTOFF_STOCK_BASELINE", status,
    checkpoint: { sequence: 2, cursor: 4, expected: cutoffExpected, counts: cutoffExpected }, createdAt: cutoffTime, completedAt: status === "IMPORTED" ? cutoffTime : null };
}
