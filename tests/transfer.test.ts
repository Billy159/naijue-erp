import assert from "node:assert/strict";
import test from "node:test";
import { planTransferEffects } from "../packages/domain/src/inventory.ts";
import { businessDate, quantity, version } from "../packages/domain/src/values.ts";
import { ids, sid, snapshot } from "./support/synthetic-fixtures.ts";
import type { TransferHeaderRow, TransferLineRow } from "../packages/domain/src/documents.ts";
const header: TransferHeaderRow = { id: sid("transfer", 80), number: "SYNTHETIC-TRANSFER", businessDate: businessDate("2026-10-20"), fromWarehouseId: ids.warehouse, toWarehouseId: sid("warehouse", 81), status: "DRAFT", version: version(1) };
const line: TransferLineRow = { id: sid("transferLine", 82), transferId: header.id, lineNo: 1, skuId: ids.sku, quantity: quantity("9007199254740993"), snapshot, isCurrent: true };
test("SYNTHETIC: transfer pure plan has the exact same canonical SKU and equal opposite integer endpoints", () => {
  const effects = planTransferEffects(header, [line]);
  assert.equal(effects.length, 2); assert.equal(effects[0]?.skuId, effects[1]?.skuId);
  assert.equal(effects.reduce((sum, row) => sum + row.quantityDelta, 0n), 0n);
  assert.equal(effects[0]?.warehouseId, header.fromWarehouseId); assert.equal(effects[1]?.warehouseId, header.toWarehouseId);
});
test("SYNTHETIC: transfer cannot use the same warehouse or nonpositive actual line", () => {
  assert.throws(() => planTransferEffects({ ...header, toWarehouseId: header.fromWarehouseId }, [line]), { code: "SAME_WAREHOUSE" });
  for (const value of ["0", "-1"]) assert.throws(() => planTransferEffects(header, [{ ...line, quantity: quantity(value) }]), { code: "INVALID_TRANSFER_LINE" });
});
test("SYNTHETIC: transfer rejects empty/currentless, approved and foreign/duplicate lines", () => {
  assert.throws(() => planTransferEffects(header, []), { code: "EMPTY_DOCUMENT" });
  assert.throws(() => planTransferEffects({ ...header, status: "APPROVED" }, [line]), { code: "INVALID_STATE" });
  assert.throws(() => planTransferEffects(header, [{ ...line, transferId: sid("transfer", 83) }]), { code: "INVALID_TRANSFER_LINE" });
  assert.throws(() => planTransferEffects(header, [line, line]), { code: "INVALID_TRANSFER_LINE" });
});
