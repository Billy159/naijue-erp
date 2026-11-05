import { entityId, quantity, businessDate } from "../../packages/domain/src/values.ts";
import { stableImportId } from "../../packages/application/src/inventory-cutoff-import.ts";
import type { CutoffImportBatch } from "../../packages/application/src/inventory-cutoff-import.ts";
import { HISTORY_MAPPING_VERSION } from "../../packages/application/src/history-storage-contract.ts";
import { NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION } from "../../packages/application/src/native-import-record-accounting.ts";
import type { NativeAccountingBaselineItem, NativeAccountingChunkCommand, NativeAccountingMembershipItem,
  NativeAccountingPublishCommand, NativeImportRecordClaim } from "../../packages/application/src/native-import-record-accounting.ts";

export const accountingTime = "2026-10-21T00:00:00.123456Z";
export const accountingIds = {
  batch: stableImportId("batch", "synthetic-native-accounting"), actor: entityId("account", stableImportId("account", "synthetic-native-accounting")),
  warehouse: entityId("warehouse", stableImportId("warehouse", "synthetic-native-accounting")),
  sku: entityId("sku", stableImportId("sku", "synthetic-native-accounting")),
  warehouseRecord: stableImportId("record", "synthetic-warehouse"), skuRecord: stableImportId("record", "synthetic-canonical-sku")
};
export const accountingMemberships: readonly NativeAccountingMembershipItem[] = [
  { targetType: "WAREHOUSE", targetId: accountingIds.warehouse, sourceEntityType: "WAREHOUSE", sourceKey: "synthetic-warehouse",
    sourceRecordHash: "1".repeat(64), sourceFileRef: "synthetic:original-warehouse",
    nativeRecord: { id: accountingIds.warehouseRecord, reviewedAt: accountingTime, decisionReason: "synthetic exact original warehouse plan" } },
  { targetType: "SKU", targetId: accountingIds.sku, sourceEntityType: "SKU", sourceKey: "synthetic-canonical-sku",
    sourceRecordHash: "2".repeat(64), sourceFileRef: "synthetic:original-canonical-sku",
    nativeRecord: { id: accountingIds.skuRecord, reviewedAt: accountingTime, decisionReason: "synthetic complete canonical group; aliases counted separately" } }
];
export const accountingBaseline: NativeAccountingBaselineItem = { targetType: "INVENTORY_LEDGER", sourceEntityType: "INVENTORY_BASELINE",
  sourceKey: "synthetic-stock-group", sourceRecordHash: "3".repeat(64), sourceFileRef: "synthetic:effective-stock",
  warehouseId: accountingIds.warehouse, skuId: accountingIds.sku, quantity: quantity("-7"), businessDate: businessDate("2026-10-20") };
export function accountingChunk(items: NativeAccountingChunkCommand["items"] = accountingMemberships): NativeAccountingChunkCommand {
  return { action: "IMPORT_CHUNK", actorAccountId: accountingIds.actor, batchId: accountingIds.batch, requestKey: "synthetic-native-claim-chunk",
    accountingVersion: NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION, expectedSequence: 0, expectedCursor: 0, items: structuredClone(items) };
}
export function accountingBatch(): CutoffImportBatch {
  return { id: accountingIds.batch, sourceName: "synthetic.native-accounting", sourceManifestRef: "synthetic:approved-complete-manifest",
    sourceHash: "a".repeat(64), cutoffAt: "2026-10-20T00:00:00.000000Z", mappingVersion: HISTORY_MAPPING_VERSION,
    inventoryMode: "CUTOFF_STOCK_BASELINE", status: "STAGED", createdAt: accountingTime, completedAt: null,
    checkpoint: { sequence: 0, cursor: 0, counts: { WAREHOUSE: 0, SKU: 0, INVENTORY_LEDGER: 0, IMPORT_BATCH: 0 },
      expected: { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 1 } } };
}
export function accountingPublish(): NativeAccountingPublishCommand {
  const batch = accountingBatch();
  return { action: "IMPORT_PUBLISH", actorAccountId: accountingIds.actor, batchId: batch.id, requestKey: "synthetic-native-claim-publish",
    accountingVersion: NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION, expectedSequence: 1, expectedCursor: 3,
    approval: { completeScope: true, absentMeansZero: true, allFilesVerified: true, finalDeltaVerified: true, noUnresolvedExceptions: true,
      sourceHash: batch.sourceHash, sourceManifestRef: batch.sourceManifestRef } };
}
export function membershipClaims(command = accountingChunk()): NativeImportRecordClaim[] {
  const operationId = stableImportId("operation", command.actorAccountId, command.requestKey);
  return command.items.filter((item): item is NativeAccountingMembershipItem => item.targetType !== "INVENTORY_LEDGER").map(item => ({
    batchId: command.batchId, importRecordId: item.nativeRecord.id, targetType: item.targetType, targetId: item.targetId,
    operationId, checkpointSequence: command.expectedSequence + 1
  }));
}
