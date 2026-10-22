import test from "node:test";
import assert from "node:assert/strict";
import { requestHash } from "../packages/application/src/request-hash.ts";
import { stableImportId } from "../packages/application/src/inventory-cutoff-import.ts";
import { assertNativeRecordAccountingSchema, authorizeNativeImportAccountingCommand, checkpointFromNativeImportClaims,
  isCanonicalNativeRecordReviewTime, nativeImportAccountingRequestHash, validateNativeImportAccountingCommand,
  NATIVE_IMPORT_RECORD_ACCOUNTING_SCHEMA } from "../packages/application/src/native-import-record-accounting.ts";
import type { NativeAccountingMembershipItem, NativeImportAccountingCommand } from "../packages/application/src/native-import-record-accounting.ts";
import { prepareNativeStockGroup } from "../packages/application/src/native-stock-contributor-import.ts";
import { IMPORT_V2_TABLES } from "../packages/application/src/import-v2-contract.ts";
import type { ImportSourceEvidence, JsonObject } from "../packages/application/src/history-storage-contract.ts";
import { accountingBatch, accountingChunk, accountingIds, accountingMemberships, accountingPublish, accountingTime, membershipClaims } from "./support/native-record-accounting-fixtures.ts";

test("native record accounting preserves original15 constant and explicitly accepts reviewed15 through additive19 only", () => {
  const versions = Array.from({ length: 15 }, (_, i) => i + 1); assert.doesNotThrow(() => assertNativeRecordAccountingSchema(versions));
  assert.deepEqual(NATIVE_IMPORT_RECORD_ACCOUNTING_SCHEMA, versions);
  assert.doesNotThrow(() => assertNativeRecordAccountingSchema([...versions, 16]));
  assertNativeRecordAccountingSchema([...versions, 16, 17]);
  assertNativeRecordAccountingSchema([...versions, 16, 17, 18]);
  assertNativeRecordAccountingSchema([...versions, 16, 17, 18, 19]);
  for (const bad of [null, [], versions.slice(0, 14), [...versions, 16, 17, 18, 19, 20], [...versions, 15], versions.map(String), versions.filter(v => v !== 7)])
    assert.throws(() => assertNativeRecordAccountingSchema(bad), { code: "NATIVE_RECORD_ACCOUNTING_SCHEMA_NOT_READY" });
});
test("review text is exact creator-plan UTC microsecond representation, never timestamp readback reconstruction", () => {
  assert.equal(isCanonicalNativeRecordReviewTime(accountingTime), true);
  assert.equal(isCanonicalNativeRecordReviewTime("2024-02-29T23:59:59.999999Z"), true);
  for (const value of ["2023-02-29T00:00:00.000000Z", "2026-02-30T00:00:00.000000Z", "2026-10-21T24:00:00.000000Z",
    "2026-10-21T00:00:00Z", "2026-10-21T00:00:00.123Z", "2026-10-21T08:00:00.123456+08:00", "0000-01-01T00:00:00.000000Z"])
    assert.equal(isCanonicalNativeRecordReviewTime(value), false, value);
});
test("version and every nativeRecord field are inside the original MAIN typed request hash", () => {
  const command = accountingChunk(); const digest = nativeImportAccountingRequestHash(command); assert.equal(digest, requestHash(command));
  for (const field of ["id", "reviewedAt", "decisionReason"] as const) {
    const changed = structuredClone(command); const item = changed.items[0] as NativeAccountingMembershipItem;
    (item.nativeRecord as unknown as Record<string, unknown>)[field] = field === "id" ? stableImportId("record", "different-synthetic-record")
      : field === "reviewedAt" ? "2026-10-21T00:00:00.123457Z" : "different independent approval";
    assert.notEqual(nativeImportAccountingRequestHash(changed), digest);
  }
  const { accountingVersion: _version, ...legacy } = command;
  assert.throws(() => validateNativeImportAccountingCommand(legacy), { code: "INVALID_NATIVE_RECORD_ACCOUNTING_COMMAND" });
});
test("named-property array item/approval/root cannot create a hash collision", () => {
  const command = accountingChunk();
  for (const bad of [Object.assign([], command), { ...command, items: [Object.assign([], command.items[0])] },
    { ...accountingPublish(), approval: Object.assign([], accountingPublish().approval) }])
    assert.throws(() => nativeImportAccountingRequestHash(bad as unknown as NativeImportAccountingCommand));
  const items = [...command.items]; Object.assign(items, { ignoredByArrayHash: "not allowed" });
  assert.throws(() => nativeImportAccountingRequestHash({ ...command, items }));
});
test("sparse arrays, symbol metadata, getters and class instances cannot escape data-only command hashing", () => {
  const command = accountingChunk();
  const sparse = new Array(2); sparse[1] = command.items[0];
  assert.throws(() => validateNativeImportAccountingCommand({ ...command, items: sparse }));
  assert.throws(() => validateNativeImportAccountingCommand({ ...command, [Symbol("unhashed")]: "no" }));
  const getter = { ...command }; Object.defineProperty(getter, "requestKey", { enumerable: true, get: () => "different on every access" });
  assert.throws(() => validateNativeImportAccountingCommand(getter));
  class Command { constructor() { Object.assign(this, command); } }
  assert.throws(() => validateNativeImportAccountingCommand(new Command()));
  class HashBlindArray<T> extends Array<T> { override map<U>(): U[] { return []; } }
  assert.throws(() => validateNativeImportAccountingCommand({ ...command, items: HashBlindArray.from(command.items) }));
});
test("independent authorization receives a clone of the complete exact command, never a caller passed flag", async () => {
  const command = accountingChunk(); let observed = false;
  const authorized = await authorizeNativeImportAccountingCommand(command, { async assertAllowed(actor, value) {
    assert.equal(actor, command.actorAccountId); assert.deepEqual(value, command); observed = true;
    (value as unknown as { requestKey: string }).requestKey = "mutated-authorizer-clone";
  } });
  assert.equal(observed, true); assert.deepEqual(authorized, command);
  const failure = Error("original creator plan not authenticated");
  await assert.rejects(authorizeNativeImportAccountingCommand(command, { async assertAllowed() { throw failure; } }), error => error === failure);
});
test("independent authorization rejects symbols/getters/class data before a clone can erase their invalid shape", async () => {
  let called = 0, getterRead = false;
  const getter = accountingChunk();
  Object.defineProperty(getter, "requestKey", { enumerable: true, get() { getterRead = true; return "synthetic-hidden-getter"; } });
  class Command { constructor() { Object.assign(this, accountingChunk()); } }
  for (const command of [{ ...accountingChunk(), [Symbol("unhashed")]: true }, getter, new Command()]) {
    await assert.rejects(authorizeNativeImportAccountingCommand(command as NativeImportAccountingCommand,
      { async assertAllowed() { called++; } }), { code: "INVALID_NATIVE_RECORD_ACCOUNTING_COMMAND" });
  }
  assert.equal(called, 0); assert.equal(getterRead, false);
});
test("canonical membership records increment once, not once for the historical alias count", () => {
  const command = accountingChunk(); const claims = membershipClaims(command); const before = accountingBatch().checkpoint;
  const next = checkpointFromNativeImportClaims(before, command, claims[0]!.operationId, claims);
  assert.deepEqual(next.counts, { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 0, IMPORT_BATCH: 0 });
  assert.equal(next.cursor, 2); assert.equal(next.sequence, 1); assert.equal(before.cursor, 0);
  (next.expected as unknown as { SKU: number }).SKU = 999; assert.equal(before.expected.SKU, 1);
});
test("zero individual contribution is retained beside a negative contribution, never dropped from the complete signed group", () => {
  const batch = accountingBatch();
  const contributors = ["-7", "0"].map((signedQuantity, index) => {
    const key = `synthetic-contribution-${index}`, sourceId = stableImportId("contribution", key);
    const raw: JsonObject = { 来源编号: key, SKU来源编号: "synthetic-old-sku", 仓库来源编号: "synthetic-warehouse", 核准库存数量: signedQuantity };
    const source: ImportSourceEvidence = { id: sourceId, batchId: batch.id, entityType: "INVENTORY_BASELINE", sourceKey: key,
      fileRef: "synthetic-original.xlsx", sheet: "SYNTHETIC", rowNo: String(index + 1), sourceFileSha256: "b".repeat(64), rowSha256: "c".repeat(64),
      rawFields: raw, normalizedFields: raw, fieldProvenance: { schema_version: 1, fields: Object.fromEntries(Object.entries(raw).map(([field, value]) =>
        [field, { origin: "ORIGINAL", reason: "Synthetic exact original signed cell", raw: value }])) } };
    return { source, lineage: { validator_version: "STOCK_CONTRIBUTOR_LINEAGE_V1" as const, oldStockSourceId: key,
      canonicalStockRowSourceId: "synthetic-stock-group", warehouseSourceId: "synthetic-warehouse", oldSkuSourceId: "synthetic-old-sku",
      canonicalSkuSourceId: "synthetic-canonical-sku", productSourceId: "synthetic-product", signedQuantity, sourceUnit: "件",
      sourceFile: source.fileRef, sourceSheet: source.sheet, sourceRow: source.rowNo, sourceSha256: source.sourceFileSha256 } };
  });
  const canonicalStock = { ...Object.fromEntries(IMPORT_V2_TABLES.find(table => table.entity === "INVENTORY_BASELINE")!.columns.map(column => [column.name, ""])),
    来源编号: "synthetic-stock-group", 仓库来源编号: "synthetic-warehouse", SKU来源编号: "synthetic-canonical-sku", 核准库存数量: "-7",
    核准依据: "Synthetic complete signed group", 合并输入库存行数: "2", 来源单位集合快照: '["件"]' };
  const prepared = prepareNativeStockGroup({ batchId: batch.id, fixedSourceNamespace: batch.sourceName,
    selection: { source: "BASE_V2", entity: "INVENTORY_BASELINE", path: "business/12切换库存.csv", baseManifestSha256: "a".repeat(64),
      selectionSha256: batch.sourceHash, approvalSha256: "b".repeat(64), csvSha256: "c".repeat(64), lineageCsvSha256: "d".repeat(64) },
    canonicalStock, warehouse: { sourceKey: "synthetic-warehouse", nativeId: accountingIds.warehouse },
    sku: { canonicalSourceKey: "synthetic-canonical-sku", nativeId: accountingIds.sku }, contributors });
  assert.equal(prepared.signedQuantity, "-7"); assert.equal(prepared.contributors.length, 2);
  assert.equal(prepared.contributors[1]!.lineage.signedQuantity, "0");
  assert.equal(prepared.contributors[1]!.source.rawFields["核准库存数量"], "0");
});
test("pure checkpoint helper rejects type/target/record substitutions despite identical owner and total", () => {
  const command = accountingChunk([accountingMemberships[0]!]); const claims = membershipClaims(command);
  for (const replacement of [{ targetType: "SKU" as const, targetId: accountingIds.sku, importRecordId: accountingIds.skuRecord },
    { targetId: accountingIds.sku }, { importRecordId: accountingIds.skuRecord }])
    assert.throws(() => checkpointFromNativeImportClaims(accountingBatch().checkpoint, command, claims[0]!.operationId,
      [{ ...claims[0]!, ...replacement }]), { code: "INVALID_NATIVE_RECORD_ACCOUNTING_CLAIM" });
});
test("duplicate, missing, foreign batch/operation/sequence claims cannot advance the checkpoint", () => {
  const command = accountingChunk(); const claims = membershipClaims(command); const before = accountingBatch().checkpoint; const operation = claims[0]!.operationId;
  for (const bad of [[], claims.slice(0, 1), [claims[0]!, claims[0]!], [{ ...claims[0]!, batchId: accountingIds.sku }, claims[1]!],
    [{ ...claims[0]!, operationId: accountingIds.sku }, claims[1]!], [{ ...claims[0]!, checkpointSequence: 2 }, claims[1]!]])
    assert.throws(() => checkpointFromNativeImportClaims(before, command, operation, bad));
});
test("prior progress must be exact4 bounded with cursor=sum(counts); old nonzero progress is not repaired", () => {
  const command = accountingChunk(); const claims = membershipClaims(command); const before = accountingBatch().checkpoint;
  for (const bad of [{ ...before, cursor: 1 }, { ...before, sequence: -1 }, { ...before, counts: { ...before.counts, SKU: NaN } },
    { ...before, counts: { ...before.counts, SKU: -1 } }, { ...before, counts: { ...before.counts, aliases: 15121 } }])
    assert.throws(() => checkpointFromNativeImportClaims(bad, command, claims[0]!.operationId, claims));
  const nonzero = { ...before, cursor: 1, counts: { ...before.counts, SKU: 1 } };
  assert.throws(() => checkpointFromNativeImportClaims(nonzero, command, claims[0]!.operationId, claims), { code: "IMPORT_CHECKPOINT_CONFLICT" });
});
test("FINAL increments IMPORT_BATCH once with no new receipt action or receipt result shape", () => {
  const command = accountingPublish(); const before = { ...accountingBatch().checkpoint, sequence: 1, cursor: 3,
    counts: { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 0 } };
  const operationId = stableImportId("operation", command.actorAccountId, command.requestKey);
  const claim = { batchId: command.batchId, importRecordId: stableImportId("final", "synthetic"), targetType: "IMPORT_BATCH" as const,
    targetId: command.batchId, operationId, checkpointSequence: 2 };
  const next = checkpointFromNativeImportClaims(before, command, operationId, [claim]);
  assert.equal(next.cursor, 4); assert.equal(next.counts.IMPORT_BATCH, 1); assert.equal(next.sequence, 2);
  assert.throws(() => checkpointFromNativeImportClaims({ ...before, counts: { ...before.counts, INVENTORY_LEDGER: 0 }, cursor: 2 },
    { ...command, expectedCursor: 2 }, operationId, [claim]), { code: "INCOMPLETE_IMPORT_SCOPE" });
});
