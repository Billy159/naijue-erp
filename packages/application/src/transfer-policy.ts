import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import type { TransferAuthorization, TransferDocument, TransferReferences, TransferWarehouseFact } from "./transfer-ports.ts";

function validIdentityId(kind: "account" | "staff" | "hall", value: unknown): boolean {
  try { return typeof value === "string" && entityId(kind, value) === value; } catch { return false; }
}
/** Source-confirmed transfer policy: unlike sales, salespeople may approve others' visible transfers and unapprove them.
 * Current account role/hall and creation snapshots are trusted server facts, never client-selected personnel. */
export function createSourceConfirmedTransferAuthorization(): TransferAuthorization {
  return { async assertAllowed(actor, _action, document, previous, tx) {
    requireDomain(tx, "TRANSFER_POLICY_CONTEXT_REQUIRED", "Transfer authorization requires transaction-local trusted warehouse facts");
    requireDomain(typeof tx.getCurrentTransferIdentity === "function", "FORBIDDEN", "Transfer action requires current transaction identity");
    const identity = await tx.getCurrentTransferIdentity(actor.accountId);
    requireDomain(identity && validIdentityId("account", actor.accountId) && identity.accountId === actor.accountId
      && validIdentityId("staff", identity.staffId) && identity.loginEnabled === true && identity.employmentStatus === "在职"
      && ["ADMIN", "WAREHOUSE", "SALESPERSON"].includes(identity.role)
      && identity.role === actor.role && identity.hallId === actor.hallId
      && (identity.hallId === null ? identity.hallEnabled === null : validIdentityId("hall", identity.hallId) && identity.hallEnabled === true),
    "FORBIDDEN", "Current account is not authorized for transfer actions");
    // Both facts use this transaction's one leased client. Read them in order:
    // the bounded pool deliberately refuses overlapping queries on one client.
    const warehouses = [await tx.getWarehouseFact(document.header.fromWarehouseId),
      await tx.getWarehouseFact(document.header.toWarehouseId)];
    requireDomain(warehouses.every((row): row is TransferWarehouseFact => row !== undefined), "WAREHOUSE_UNAVAILABLE", "Both warehouses must exist");
    if (identity.role !== "SALESPERSON") return;
    requireDomain(identity.hallId !== null, "FORBIDDEN", "Salesperson requires an authoritative hall");
    const creator = previous?.header ?? ("createdRole" in document.header ? (document as TransferDocument).header : undefined);
    // New drafts acquire trusted creation facts in the service, so their eventual creator branch is known here.
    const createdHere = creator ? creator.createdRole === "SALESPERSON" && creator.createdHallId === identity.hallId
      && typeof creator.createdByAccountId === "string" : true;
    requireDomain(createdHere || warehouses.some(row => row?.hallId === identity.hallId), "FORBIDDEN", "Transfer is outside current hall visibility");
  } };
}
/** Required explicit selection by composition. No disabled-source, SKU or hall fact is inferred from syntax or labels. */
export function createSourceConfirmedTransferReferences(): TransferReferences {
  return { async assertValid(tx, _actor, action, previous, proposed) {
    const header = proposed.header;
    requireDomain(header.fromWarehouseId !== header.toWarehouseId, "SAME_WAREHOUSE", "Transfer warehouses must differ");
    for (const [index, warehouseId] of [header.fromWarehouseId, header.toWarehouseId].entries()) {
      const fact = await tx.getWarehouseFact(warehouseId);
      requireDomain(fact, "WAREHOUSE_UNAVAILABLE", "Warehouse does not exist");
      if (action === "SAVE" || action === "APPROVE") {
        requireDomain(fact.enabled || (index === 0 && fact.hasNonzeroInventory), "WAREHOUSE_UNAVAILABLE", "Disabled warehouses may only transfer out existing nonzero inventory");
      }
    }
    const remaining = new Map<string, bigint>();
    if (action === "SAVE" && previous && previous.header.fromWarehouseId === header.fromWarehouseId
      && previous.header.toWarehouseId === header.toWarehouseId) {
      for (const line of previous.lines.filter(line => line.isCurrent)) remaining.set(line.skuId, (remaining.get(line.skuId) ?? 0n) + line.quantity);
    }
    for (const line of proposed.lines.filter(line => line.isCurrent)) {
      const sku = await tx.getSkuFact(line.skuId);
      requireDomain(sku, "SKU_UNAVAILABLE", "Formal SKU is missing");
      if (sku.enabled || (action !== "SAVE" && action !== "APPROVE")) continue;
      // Approved source permits retention/reduction on SAVE only, spending the
      // trusted prior aggregate across split rows at unchanged warehouse endpoints.
      const allowance = remaining.get(line.skuId) ?? 0n;
      requireDomain(action === "SAVE" && line.quantity > 0n && line.quantity <= allowance, "SKU_UNAVAILABLE", "Disabled SKU cannot introduce or increase usage or move endpoints");
      remaining.set(line.skuId, allowance - line.quantity);
    }
  } };
}
