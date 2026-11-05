import type { InventoryLedgerEntry, InventoryLedgerQuery, InventoryLedgerScopedRead, InventoryLedgerSnapshot, InventoryLedgerSource } from "../../packages/application/src/inventory-ledger-query-contracts.ts";
import { parseInventoryLedgerQuery } from "../../packages/application/src/inventory-ledger-query-validation.ts";
import { inventoryActor, inventoryId, inventoryScope } from "./synthetic-inventory-query.ts";
export { inventoryActor, inventoryId, inventoryScope };
export const ledgerWarehouse = inventoryScope.warehouses[0]!;
export const ledgerSkuId = inventoryId("sku", 400);
export const ledgerBatchId = inventoryId("operation", 450);
export function ledgerParameters(overrides: Partial<InventoryLedgerQuery> = {}): InventoryLedgerQuery {
  return parseInventoryLedgerQuery({ warehouseId: ledgerWarehouse.id, skuId: ledgerSkuId, pageSize: 20, after: null, ...overrides });
}
export function ledgerNumberedParameters(overrides: Partial<InventoryLedgerQuery> = {}): InventoryLedgerQuery {
  return ledgerParameters({ page: 1, filter: { dateFrom: null, dateTo: null, businessType: null, source: "" }, ...overrides });
}
export function ledgerDisplayEntry(n = 0): InventoryLedgerEntry {
  return { ...ledgerEntry(n), display: { date: "2026-10-21", businessType: "RETURN", sourceNumber: `SYNTHETIC-RETURN-${n}`,
    operator: { accountId: inventoryActor.accountId, name: "SYNTHETIC current operator", labelBasis: "CURRENT_REFERENCE" },
    balanceTransition: { state: "UNKNOWN", before: null, after: null, reason: "NO_RECORDED_BALANCE_TRANSITION" }, navigation: "NOT_CHECKED" } };
}
export function ledgerEntry(n = 0, kind: Exclude<InventoryLedgerSource["kind"], "HISTORY_REVISION"> = "SALES"): InventoryLedgerEntry {
  const source: InventoryLedgerSource = kind === "SALES" ? { kind, salesId: inventoryId("sales", 500), salesLineId: inventoryId("salesLine", 510 + n), endpoint: "SALES_WAREHOUSE" }
    : kind === "TRANSFER" ? { kind, transferId: inventoryId("transfer", 520), transferLineId: inventoryId("transferLine", 530 + n), endpoint: "TO" }
    : { kind, importBatchId: ledgerBatchId, endpoint: "IMPORT_BASELINE" };
  return { id: inventoryId("ledger", 10000 - n), operationId: inventoryId("operation", 600 + n), eventKind: kind === "CUTOFF_BASELINE" ? "CUTOFF_BASELINE" : "APPROVE",
    quantityDelta: n === 0 ? "-9223372036854775808" : "2", source, sourceDocumentVersion: kind === "CUTOFF_BASELINE" ? null : 3, reversesEntryId: null,
    businessDate: "2026-10-20" as InventoryLedgerEntry["businessDate"], postedAt: "2026-10-20T18:20:30.123456Z" };
}
export function ledgerSnapshot(read: InventoryLedgerScopedRead, entries: readonly InventoryLedgerEntry[] = [ledgerEntry()]): InventoryLedgerSnapshot {
  return { readReference: "SYNTHETIC-LEDGER-SNAPSHOT", readiness: "ready", data: {
    pageSize: read.parameters.pageSize, labelBasis: "CURRENT_REFERENCE", warehouse: ledgerWarehouse,
    sku: { id: ledgerSkuId, code: "SYNTHETIC-NATIVE-SKU", product: { id: inventoryId("product", 401), code: "NATIVE-001", name: "Synthetic native product" },
      color: { id: inventoryId("color", 402), label: "Native color" }, fit: { id: inventoryId("fit", 403), code: "Y", label: "Y版（修身）" },
      sizeGroup: { id: inventoryId("sizeGroup", 404), label: "Native size group" }, size: { id: inventoryId("size", 405), code: "900", label: "170/M full native size" } }, entries, nextCursor: null
  } };
}
export function ledgerRead(parameters = ledgerParameters(), signal = new AbortController().signal): InventoryLedgerScopedRead {
  return { actor: inventoryActor, scope: inventoryScope, parameters, signal };
}
