import { requireDomain } from "./errors.ts";
import type { TransferHeaderRow, TransferLineRow } from "./documents.ts";
import { negateQuantity } from "./values.ts";
import type { BusinessDate, EntityId, Quantity, Version } from "./values.ts";

export interface InventoryBalanceRow {
  readonly warehouseId: EntityId<"warehouse">; readonly skuId: EntityId<"sku">; readonly quantity: Quantity;
  readonly version: Version; readonly lastOperationId: EntityId<"operation"> | null; readonly updatedAt: string;
}
export type InventoryRead = { readonly state: "KNOWN"; readonly balance: InventoryBalanceRow }
  | { readonly state: "NOT_READY" } | { readonly state: "NO_SUCH_SKU" } | { readonly state: "FAILED"; readonly reason: string };
export type InventorySource = { readonly kind: "SALES"; readonly salesId: EntityId<"sales">; readonly salesLineId: EntityId<"salesLine">; readonly endpoint: "SALES_WAREHOUSE" }
  | { readonly kind: "TRANSFER"; readonly transferId: EntityId<"transfer">; readonly transferLineId: EntityId<"transferLine">; readonly endpoint: "FROM" | "TO" };
export interface InventoryLedgerRow {
  readonly id: EntityId<"ledger">; readonly operationId: EntityId<"operation">; readonly eventKind: "APPROVE" | "UNAPPROVE";
  readonly warehouseId: EntityId<"warehouse">; readonly skuId: EntityId<"sku">; readonly quantityDelta: Quantity;
  readonly source: InventorySource; readonly sourceDocumentVersion: Version; readonly reversesEntryId: EntityId<"ledger"> | null;
  readonly businessDate: BusinessDate; readonly postedAt: string;
}
export interface TransferEffect { readonly warehouseId: EntityId<"warehouse">; readonly skuId: EntityId<"sku">; readonly quantityDelta: Quantity; readonly source: Extract<InventorySource, { kind: "TRANSFER" }> }
/** A pure posting plan only, not a database transaction or an enabled transfer command. */
export function planTransferEffects(header: TransferHeaderRow, lines: readonly TransferLineRow[]): readonly TransferEffect[] {
  requireDomain(header.fromWarehouseId !== header.toWarehouseId, "SAME_WAREHOUSE", "Transfer endpoints must be different");
  requireDomain(header.status === "DRAFT", "INVALID_STATE", "Only a draft transfer can be approved");
  const current = lines.filter(line => line.isCurrent);
  requireDomain(current.length > 0, "EMPTY_DOCUMENT", "A transfer requires actual current lines");
  const ids = new Set<string>(); const positions = new Set<number>();
  return current.flatMap(line => {
    requireDomain(line.transferId === header.id && line.quantity > 0n && Number.isSafeInteger(line.lineNo) && line.lineNo > 0
      && !ids.has(line.id) && !positions.has(line.lineNo), "INVALID_TRANSFER_LINE", "Expected unique, owned, positive-integer transfer lines");
    ids.add(line.id); positions.add(line.lineNo);
    return [
      { warehouseId: header.fromWarehouseId, skuId: line.skuId, quantityDelta: negateQuantity(line.quantity), source: { kind: "TRANSFER" as const, transferId: header.id, transferLineId: line.id, endpoint: "FROM" as const } },
      { warehouseId: header.toWarehouseId, skuId: line.skuId, quantityDelta: line.quantity, source: { kind: "TRANSFER" as const, transferId: header.id, transferLineId: line.id, endpoint: "TO" as const } }
    ];
  });
}
