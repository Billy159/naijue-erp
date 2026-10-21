import test from "node:test";
import assert from "node:assert/strict";
import { matchesStockContributorEvidence } from "../packages/application/src/history-storage-contract.ts";
import type { ImportSourceEvidence, ImportStockContributor, StockContributionLineage } from "../packages/application/src/history-storage-contract.ts";
const source: ImportSourceEvidence = { id: "row", batchId: "batch", entityType: "INVENTORY_BASELINE", sourceKey: "old-stock", fileRef: "original.xlsx", sheet: "stock", rowNo: "2", sourceFileSha256: "a".repeat(64), rowSha256: "b".repeat(64), rawFields: { "来源编号": "old-stock", "SKU来源编号": "old-sku", "仓库来源编号": "old-warehouse", "核准库存数量": "10" }, normalizedFields: {}, fieldProvenance: {} };
const row: ImportStockContributor = { batchId: "batch", sourceRowId: "row", warehouseId: "native-warehouse", canonicalSkuId: "native-sku", oldSourceSkuId: "old-sku", canonicalStockSourceKey: "canonical-stock", sourceUnit: "件", signedQuantity: "10", baselineLedgerId: null };
const lineage: StockContributionLineage = { validator_version: "STOCK_CONTRIBUTOR_LINEAGE_V1", oldStockSourceId: "old-stock", canonicalStockRowSourceId: "canonical-stock", warehouseSourceId: "old-warehouse", oldSkuSourceId: "old-sku", canonicalSkuSourceId: "canonical-sku", productSourceId: "original-product", signedQuantity: "10", sourceUnit: "件", sourceFile: "original.xlsx", sourceSheet: "stock", sourceRow: "2", sourceSha256: "a".repeat(64) };
const resolved = { warehouseSourceKey: "old-warehouse", canonicalSkuSourceKey: "canonical-sku" };
test("synthetic per-original-line validation rejects attribution errors even with conserved aggregate", () => {
  assert.equal(matchesStockContributorEvidence(row, source, lineage, resolved), true);
  assert.equal(matchesStockContributorEvidence(row, { ...source, rawFields: { ...source.rawFields, "来源编号": "another-original" } }, lineage, resolved), false);
  // A counterpart -1 error would preserve the baseline total; neither original may be changed.
  assert.equal(matchesStockContributorEvidence({ ...row, signedQuantity: "11" }, source, lineage, resolved), false);
  assert.equal(matchesStockContributorEvidence(row, { ...source, rawFields: { ...source.rawFields, "核准库存数量": "9" } }, lineage, resolved), false);
  assert.equal(matchesStockContributorEvidence(row, source, { ...lineage, oldSkuSourceId: "other-old-sku" }, resolved), false);
  assert.equal(matchesStockContributorEvidence(row, source, { ...lineage, sourceUnit: "箱" }, resolved), false);
  assert.equal(matchesStockContributorEvidence(row, source, lineage, { ...resolved, warehouseSourceKey: "other-warehouse" }), false);
  assert.equal(matchesStockContributorEvidence(row, source, { ...lineage, sourceRow: "3" }, resolved), false);
});
test("negative original contribution remains signed, missing quantity never becomes zero", () => {
  const negativeSource = { ...source, rawFields: { ...source.rawFields, "核准库存数量": "-10" } };
  assert.equal(matchesStockContributorEvidence({ ...row, signedQuantity: "-10" }, negativeSource, { ...lineage, signedQuantity: "-10" }, resolved), true);
  assert.equal(matchesStockContributorEvidence({ ...row, signedQuantity: "0" }, { ...source, rawFields: {} }, { ...lineage, signedQuantity: "0" }, resolved), false);
});
