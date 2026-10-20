import assert from "node:assert/strict";
import test from "node:test";
import { bindHistoricalBarcode, resolveBarcode } from "../packages/domain/src/barcodes.ts";
import type { SkuBarcodeRow } from "../packages/domain/src/barcodes.ts";
import { validateSkuUniqueness } from "../packages/domain/src/catalog.ts";
import { ids, sid, syntheticSku } from "./support/synthetic-fixtures.ts";

const skus = [syntheticSku(), syntheticSku(ids.sku2, 99)];
const primary: SkuBarcodeRow = { id: sid("barcode", 50), barcode: "000SYNTHETIC-01", skuId: ids.sku, kind: "PRIMARY", enabled: true };
test("SYNTHETIC: fit is an independent SKU dimension, not merged with product/color/size", () => {
  assert.doesNotThrow(() => validateSkuUniqueness(skus));
  assert.throws(() => validateSkuUniqueness([skus[0]!, { ...skus[0]!, id: ids.sku2, skuCode: "OTHER_SYNTHETIC_CODE" }]), { code: "SKU_CONFLICT" });
});
test("SYNTHETIC: multiple raw historical codes bind directly to one canonical SKU and retain primary", () => {
  let rows: readonly SkuBarcodeRow[] = [primary];
  for (const [index, barcode] of ["000SYNTHETIC-OLD", " SYNTHETIC RAW "].entries()) rows = bindHistoricalBarcode(rows, skus, { id: sid("barcode", 60 + index), barcode, skuId: ids.sku });
  assert.deepEqual(rows[0], primary);
  assert.equal(rows.length, 3);
  assert.equal(resolveBarcode(rows, skus, "000SYNTHETIC-OLD").id, ids.sku);
  assert.equal(resolveBarcode(rows, skus, " SYNTHETIC RAW ").id, ids.sku);
  assert.throws(() => resolveBarcode(rows, skus, "SYNTHETIC RAW"), { code: "BARCODE_NOT_FOUND" });
});
test("SYNTHETIC: raw barcode leading zeros and string identity are never numeric-normalized", () => {
  assert.equal(resolveBarcode([primary], skus, "000SYNTHETIC-01").id, ids.sku);
  assert.throws(() => resolveBarcode([primary], skus, "SYNTHETIC-01"), { code: "BARCODE_NOT_FOUND" });
  assert.throws(() => resolveBarcode([primary], skus, 123 as unknown as string), { code: "INVALID_BARCODE" });
});
test("SYNTHETIC: cross-SKU binding and corrupt conflicting lookup fail closed", () => {
  assert.throws(() => bindHistoricalBarcode([primary], skus, { id: sid("barcode", 70), barcode: primary.barcode, skuId: ids.sku2 }), { code: "BARCODE_CONFLICT" });
  assert.throws(() => resolveBarcode([primary, { ...primary, id: sid("barcode", 71), skuId: ids.sku2, enabled: false }], skus, primary.barcode), { code: "BARCODE_CONFLICT" });
});
test("SYNTHETIC: binding requires an existing enabled SKU, no guessed/matrix-created identity", () => {
  assert.throws(() => bindHistoricalBarcode([], skus, { id: sid("barcode", 72), barcode: "SYNTHETIC", skuId: sid("sku", 999) }), { code: "SKU_UNAVAILABLE" });
  assert.throws(() => bindHistoricalBarcode([], [{ ...skus[0]!, enabled: false }], { id: sid("barcode", 72), barcode: "SYNTHETIC", skuId: ids.sku }), { code: "SKU_UNAVAILABLE" });
});
test("SYNTHETIC: identical binding is idempotent; disabled code is not silently reactivated", () => {
  assert.deepEqual(bindHistoricalBarcode([primary], skus, { id: sid("barcode", 77), barcode: primary.barcode, skuId: ids.sku }), [primary]);
  assert.throws(() => bindHistoricalBarcode([{ ...primary, enabled: false }], skus, { id: sid("barcode", 77), barcode: primary.barcode, skuId: ids.sku }), { code: "BARCODE_DISABLED" });
  assert.throws(() => resolveBarcode([{ ...primary, enabled: false }], skus, primary.barcode), { code: "BARCODE_DISABLED" });
});
