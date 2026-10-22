/** Fictional SQL protocol/readback only. No files authenticated and no PostgreSQL execution. */
import test from "node:test";
import assert from "node:assert/strict";
import { reconcileNativeImportStockConservation } from "../adapters/postgres/src/native-import-record-accounting.ts";
import type { NativeRecordAccountingTransaction } from "../adapters/postgres/src/native-import-record-accounting.ts";
import type { PgSalesClient, PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { stableImportId } from "../packages/application/src/inventory-cutoff-import.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";
import { IMPORT_V2_TABLES } from "../packages/application/src/import-v2-contract.ts";
import { prepareNativeStockGroup, nativeStockSourceEvidence } from "../packages/application/src/native-stock-contributor-import.ts";
import type { ImportSourceEvidence, JsonObject } from "../packages/application/src/history-storage-contract.ts";
import { NATIVE_IMPORT_STOCK_CONSERVATION_VERSION, nativeImportAccountingRequestHash, nativeStockContributorsManifestHash,
  nativeStockEffectiveGroupsManifestHash, validateNativeImportAccountingCommand } from "../packages/application/src/native-import-record-accounting.ts";
import type { NativeAccountingPublishCommand, NativeStockContributorObservation, NativeStockEffectiveGroupObservation,
  NativeStockConservationPlan } from "../packages/application/src/native-import-record-accounting.ts";
import { accountingBatch, accountingPublish, accountingTime } from "./support/native-record-accounting-fixtures.ts";

type Row = Record<string, unknown>;
function fixture() {
  const base = accountingBatch();
  const wh = ["WH-A", "WH-B", "WH-EMPTY"].map(sourceKey => ({ sourceKey, nativeId: stableImportId("warehouse", sourceKey) }));
  const batch = { ...base, status: "VALIDATING" as const, checkpoint: { sequence: 1, cursor: 7,
    counts: { WAREHOUSE: 3, SKU: 2, INVENTORY_LEDGER: 2, IMPORT_BATCH: 0 }, expected: { WAREHOUSE: 3, SKU: 2, INVENTORY_LEDGER: 2, IMPORT_BATCH: 1 } },
    historyMetadata: { payloadHash: "f".repeat(64), expectedCounts: { history_sales_header: 0, history_sales_line: 0, history_sales_settlement: 0,
      history_transfer_header: 0, history_transfer_line: 0, import_source_row: 3, import_sku_alias: 0, import_stock_contributor: 3, barcodes: 0 } } };
  const contributors: Row[] = [], coverage: Row[] = [], native: Row[] = [], balances: Row[] = [];
  const contributorObservations: NativeStockContributorObservation[] = [], groupObservations: NativeStockEffectiveGroupObservation[] = [];
  for (const [groupIndex, quantities] of [[0, ["-7", "0"]], [1, ["10"]]] as const) {
    const warehouse = wh[groupIndex]!, skuKey = `SKU-${groupIndex}`, skuId = stableImportId("sku", skuKey), stockKey = `stock-${groupIndex}`;
    const quantity = quantities.reduce((sum, value) => sum + BigInt(value), 0n).toString();
    const canonicalStock = { ...Object.fromEntries(IMPORT_V2_TABLES.find(t => t.entity === "INVENTORY_BASELINE")!.columns.map(column => [column.name, ""])),
      来源编号: stockKey, 仓库来源编号: warehouse.sourceKey, SKU来源编号: skuKey, 核准库存数量: quantity, 核准依据: "Synthetic complete signed selection",
      合并输入库存行数: String(quantities.length), 来源单位集合快照: '["件"]' };
    const inputs = quantities.map((signedQuantity, index) => {
      const sourceKey = `${stockKey}:old:${index}`, oldSku = `${skuKey}:old:${index}`;
      const raw: JsonObject = { 来源编号: sourceKey, SKU来源编号: oldSku, 仓库来源编号: warehouse.sourceKey, 核准库存数量: signedQuantity };
      const source: ImportSourceEvidence = { id: stableImportId("source-row", sourceKey), batchId: batch.id, entityType: "INVENTORY_BASELINE", sourceKey,
        fileRef: "synthetic-original.xlsx", sheet: "SYNTHETIC", rowNo: String(groupIndex * 10 + index + 1), sourceFileSha256: "b".repeat(64), rowSha256: "c".repeat(64),
        rawFields: raw, normalizedFields: raw, fieldProvenance: { schema_version: 1, fields: Object.fromEntries(Object.entries(raw).map(([field, value]) =>
          [field, { origin: "ORIGINAL", reason: "Synthetic exact original signed cell", raw: value }])) } };
      return { source, lineage: { validator_version: "STOCK_CONTRIBUTOR_LINEAGE_V1" as const, oldStockSourceId: sourceKey, canonicalStockRowSourceId: stockKey,
        warehouseSourceId: warehouse.sourceKey, oldSkuSourceId: oldSku, canonicalSkuSourceId: skuKey, productSourceId: "synthetic-product",
        signedQuantity, sourceUnit: "件", sourceFile: source.fileRef, sourceSheet: source.sheet, sourceRow: source.rowNo, sourceSha256: source.sourceFileSha256 } };
    });
    const prepared = prepareNativeStockGroup({ batchId: batch.id, fixedSourceNamespace: batch.sourceName,
      selection: { source: "BASE_V2", entity: "INVENTORY_BASELINE", path: "business/12切换库存.csv", baseManifestSha256: "d".repeat(64),
        selectionSha256: batch.sourceHash, approvalSha256: "e".repeat(64), csvSha256: "b".repeat(64), lineageCsvSha256: "c".repeat(64) },
      canonicalStock, warehouse, sku: { canonicalSourceKey: skuKey, nativeId: skuId }, contributors: inputs });
    const baselineId = stableImportId("baseline", batch.sourceName, "INVENTORY_BASELINE", stockKey);
    for (const item of inputs) {
      const s = item.source, l = item.lineage;
      contributors.push({ source_row_id: s.id, warehouse_id: warehouse.nativeId, canonical_sku_id: skuId, old_source_sku_id: l.oldSkuSourceId,
        canonical_stock_source_key: stockKey, source_unit: l.sourceUnit, signed_quantity: l.signedQuantity, baseline_ledger_id: baselineId,
        source_row: nativeStockSourceEvidence(prepared, item), canonical_sku_source_key: skuKey, warehouse_source_key: warehouse.sourceKey });
      coverage.push({ id: s.id, source_row_id: s.id });
      contributorObservations.push({ sourceRowId: s.id, sourceKey: s.sourceKey, sourceFileSha256: s.sourceFileSha256, rowSha256: s.rowSha256,
        fileRef: s.fileRef, sheet: s.sheet, rowNo: s.rowNo, warehouseSourceKey: warehouse.sourceKey, canonicalSkuSourceKey: skuKey,
        oldSkuSourceId: l.oldSkuSourceId, canonicalStockSourceKey: stockKey, warehouseId: warehouse.nativeId, skuId,
        signedQuantity: l.signedQuantity, sourceUnit: l.sourceUnit });
    }
    groupObservations.push({ canonicalStockSourceKey: stockKey, warehouseSourceKey: warehouse.sourceKey, canonicalSkuSourceKey: skuKey,
      warehouseId: warehouse.nativeId, skuId, signedQuantity: quantity, sourceUnit: "件", contributorCount: quantities.length, effectiveRowHash: requestHash(canonicalStock) });
    native.push({ id: baselineId, operation_id: stableImportId("baseline-operation", stockKey), event_kind: "CUTOFF_BASELINE", source_import_batch_id: batch.id,
      warehouse_id: warehouse.nativeId, sku_id: skuId, signed_quantity: quantity, record_id: stableImportId("source", batch.sourceName, "INVENTORY_BASELINE", stockKey),
      source_key: stockKey, warehouse_source_key: warehouse.sourceKey, canonical_sku_source_key: skuKey, balance_equal: true, claim_count: "1", sku_claim_count: "1" });
    balances.push({ warehouse_id: warehouse.nativeId, sku_id: skuId, signed_quantity: quantity });
  }
  const plan: NativeStockConservationPlan = { version: NATIVE_IMPORT_STOCK_CONSERVATION_VERSION, selectionSha256: batch.sourceHash,
    effectiveStockCsvSha256: "b".repeat(64), contributorLineageCsvSha256: "c".repeat(64), contributorCount: 3, effectiveGroupCount: 2,
    contributorsManifestHash: nativeStockContributorsManifestHash(contributorObservations), effectiveGroupsManifestHash: nativeStockEffectiveGroupsManifestHash(groupObservations),
    warehouses: wh.map((row, index) => ({ ...row, signedQuantity: ["-7", "10", "0"][index]! })),
    warehouseUnits: wh.slice(0, 2).map((row, index) => ({ warehouseSourceKey: row.sourceKey, sourceUnit: "件", signedQuantity: ["-7", "10"][index]! })) };
  const command: NativeAccountingPublishCommand = { ...accountingPublish(), expectedSequence: 1, expectedCursor: 7, stockConservation: plan };
  const tables: Record<string, Row[]> = {
    "conservation-warehouses": wh.map(row => ({ id: row.nativeId, source_key: row.sourceKey, claim_count: "1" })),
    "conservation-source-coverage": coverage, "conservation-contributors": contributors, "conservation-native": native, "conservation-balances": balances
  };
  return { batch, command, tables, plan };
}
async function run(f = fixture()) {
  const calls: string[] = [];
  const input: NativeRecordAccountingTransaction = { command: f.command, batch: f.batch, commandHash: nativeImportAccountingRequestHash(f.command),
    operationId: stableImportId("operation", f.command.actorAccountId, f.command.requestKey), now: accountingTime };
  const client: PgSalesClient = { async query(sql: string, values: unknown[] = []): Promise<PgSalesResult> {
    calls.push(sql); assert.ok(!/^(BEGIN|COMMIT|ROLLBACK|INSERT|UPDATE|DELETE)/.test(sql));
    assert.deepEqual([...new Set([...sql.matchAll(/\$(\d+)/g)].map(match => Number(match[1])))].sort((a, b) => a - b), values.map((_, i) => i + 1));
    if (sql.includes("native-accounting:schema")) return { rows: [{ versions: Array.from({ length: 15 }, (_, i) => i + 1) }], rowCount: 1 };
    if (sql.includes("native-accounting:batch")) return { rows: [{ id: f.batch.id, mapping_version: f.batch.mappingVersion, status: f.batch.status,
      source_name: f.batch.sourceName, source_hash: f.batch.sourceHash, source_manifest_ref: f.batch.sourceManifestRef, checkpoint: f.batch.checkpoint, already_published: false }], rowCount: 1 };
    for (const [name, rows] of Object.entries(f.tables)) if (sql.includes(`native-accounting:${name} `)) return { rows, rowCount: rows.length };
    if (sql.includes("native-accounting:cutoff") || sql.includes("native-accounting:source-lock")) return { rows: [], rowCount: 1 };
    throw Error(`Unexpected synthetic conservation query: ${sql}`);
  }, release() { assert.fail("conservation cannot release original client"); } };
  const report = await reconcileNativeImportStockConservation(client, input); return { report, calls };
}
test("three-way full warehouse/unit conservation retains negative and individual-zero rows; explicit authorized empty warehouse is distinct", async () => {
  const { report, calls } = await run();
  assert.equal(report.contributorCount, 3); assert.equal(report.effectiveGroupCount, 2); assert.equal(report.nativeBaselineCount, 2);
  assert.equal(report.sourcePayloadHashRecomputed, false);
  assert.deepEqual(report.warehouses.map(row => [row.sourceKey, row.sourceSignedQuantity, row.effectiveSignedQuantity, row.nativeSignedQuantity, row.authorizedEmptyScope]),
    [["WH-A", "-7", "-7", "-7", false], ["WH-B", "10", "10", "10", false], ["WH-EMPTY", "0", "0", "0", true]]);
  assert.equal(report.warehouseUnits.length, 2); assert.ok(calls.every(sql => !/COALESCE/.test(sql)));
});
test("full conservation plan lives in MAIN hash, including exact warehouse/unit sums and source manifests", () => {
  const f = fixture(); const digest = nativeImportAccountingRequestHash(f.command);
  for (const change of [{ contributorsManifestHash: "a".repeat(64) }, { effectiveGroupsManifestHash: "a".repeat(64) },
    { warehouseUnits: [{ warehouseSourceKey: "WH-A", sourceUnit: "件", signedQuantity: "-7" }] }])
    assert.notEqual(nativeImportAccountingRequestHash({ ...f.command, stockConservation: { ...f.plan, ...change } }), digest);
  assert.throws(() => validateNativeImportAccountingCommand({ ...f.command, stockConservation: Object.assign([], f.plan) }));
});
test("cross-warehouse differences cannot cancel under an equal global signed total", async () => {
  const f = fixture(); (f.plan.warehouses[0] as { signedQuantity: string }).signedQuantity = "-6";
  (f.plan.warehouses[1] as { signedQuantity: string }).signedQuantity = "9";
  await assert.rejects(run(f), /Per-warehouse/);
});
for (const mutation of ["missingWarehouse", "wrongWarehouse", "missingUnit", "unknownUnit", "unknownEmpty", "missingZeroContribution", "duplicateSource", "orphanSource",
  "unknownQuantity", "wrongNativeKey", "duplicateClaim", "missingClaim", "extraBalance", "missingBalance", "wrongManifest", "wrongArtifact", "wrongSkuClaim"] as const)
  test(`conservation rejects ${mutation}, never silently fills missing/unknown values with zero`, async () => {
    const f = fixture();
    if (mutation === "missingWarehouse") (f.plan.warehouses as unknown[]).pop();
    if (mutation === "wrongWarehouse") f.tables["conservation-warehouses"]![0]!.id = stableImportId("warehouse", "wrong");
    if (mutation === "missingUnit") (f.plan.warehouseUnits as unknown[]).pop();
    if (mutation === "unknownUnit") (f.plan.warehouseUnits[0] as { sourceUnit: string }).sourceUnit = "unknown unit";
    if (mutation === "unknownEmpty") (f.plan.warehouses[2] as { signedQuantity: string }).signedQuantity = "1";
    if (mutation === "missingZeroContribution") f.tables["conservation-contributors"]!.splice(1, 1);
    if (mutation === "duplicateSource") f.tables["conservation-contributors"]![1] = structuredClone(f.tables["conservation-contributors"]![0]!);
    if (mutation === "orphanSource") f.tables["conservation-source-coverage"]![0]!.source_row_id = null;
    if (mutation === "unknownQuantity") f.tables["conservation-contributors"]![0]!.signed_quantity = null;
    if (mutation === "wrongNativeKey") f.tables["conservation-native"]![0]!.warehouse_id = f.tables["conservation-native"]![1]!.warehouse_id;
    if (mutation === "duplicateClaim") f.tables["conservation-native"]![0]!.claim_count = "2";
    if (mutation === "missingClaim") f.tables["conservation-warehouses"]![0]!.claim_count = "0";
    if (mutation === "wrongSkuClaim") f.tables["conservation-native"]![0]!.sku_claim_count = "0";
    if (mutation === "extraBalance") f.tables["conservation-balances"]!.push(structuredClone(f.tables["conservation-balances"]![0]!));
    if (mutation === "missingBalance") f.tables["conservation-balances"]!.pop();
    if (mutation === "wrongManifest") (f.plan as { contributorsManifestHash: string }).contributorsManifestHash = "a".repeat(64);
    if (mutation === "wrongArtifact") (f.plan as { effectiveStockCsvSha256: string }).effectiveStockCsvSha256 = "a".repeat(64);
    await assert.rejects(run(f));
  });
test("zero-NET group is explicitly closed, without deleting its contributors or inventing a zero ledger", async () => {
  const f = fixture();
  for (const [index, row] of f.tables["conservation-contributors"]!.slice(0, 2).entries()) {
    const source = row.source_row as JsonObject, provenance = source.field_provenance as JsonObject;
    const proof = provenance.native_stock_import as JsonObject; (proof.canonical_stock_row as JsonObject)["核准库存数量"] = "0";
    if (index === 1) {
      row.signed_quantity = "7"; (provenance.stock_contribution as JsonObject).signedQuantity = "7";
      (source.raw_fields as JsonObject)["核准库存数量"] = "7"; (source.normalized_fields as JsonObject)["核准库存数量"] = "7";
      (((provenance.fields as JsonObject)["核准库存数量"]) as JsonObject).raw = "7";
    }
  }
  await assert.rejects(run(f), { code: "NATIVE_STOCK_KEY" });
});
