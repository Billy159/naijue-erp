import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { checkedProductActor } from "./product-query-validation.ts";
import { partyRequestKey } from "./party-maintenance-validation.ts";
import { requestHash } from "./request-hash.ts";
import { authorizeCatalogueMaintenance } from "./catalogue-maintenance-authorization.ts";
import { catalogueMaintenanceKind, parseCatalogueMaintenanceCommand, isCategoryOrderCommand, checkedCategoryOrderResult } from "./catalogue-maintenance-validation.ts";
import type { MaintenanceJsonObject, MaintenanceJsonValue } from "./maintenance-commit-ports.ts";
import type { CatalogueMaintenanceDependencies, CatalogueMaintenanceService, CatalogueMaintenanceTransaction, CatalogueWriteRecord, CategoryWriteRecord, CategoryOrderCommand, CategoryOrderEvidence, CategoryOrderResult, CategoryWriteValues, CatalogueEntryWriteValues } from "./catalogue-maintenance-ports.ts";
import type { ActorContext } from "./ports.ts";
function facts(row: CatalogueWriteRecord): MaintenanceJsonObject {
  return { id: row.id, name: row.name, version: row.version, deleted_at: row.deletedAt, ...(row.kind === "CATEGORY" ? { parent_id: row.parentId, display_order: row.displayOrder } : { code: row.code, enabled: row.enabled }) };
}
const byId = (a: { id: string }, b: { id: string }): number => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const byOrder = (a: { id: string; displayOrder: number }, b: { id: string; displayOrder: number }): number => a.displayOrder - b.displayOrder || byId(a, b);
function orderEvidence(rows: readonly CategoryWriteRecord[], parentId: string | null, movedId: string, undoOf: string | null): CategoryOrderEvidence {
  return { parent_id: parentId, moved_id: movedId, undo_of_operation_id: undoOf,
    rows: [...rows].sort(byId).map(r => ({ id: r.id, version: r.version, display_order: r.displayOrder })) };
}
export function createCatalogueMaintenanceService(dependencies: CatalogueMaintenanceDependencies): CatalogueMaintenanceService {
  if (typeof dependencies?.unitOfWork?.transaction !== "function" || typeof dependencies?.now !== "function" || typeof dependencies?.newId !== "function") throw new TypeError("Catalogue maintenance requires explicit transaction/time/identifiers");
  async function executeOrder(tx: CatalogueMaintenanceTransaction, actor: ActorContext, command: CategoryOrderCommand, hash: string): Promise<CategoryOrderResult> {
    const order = tx.categoryOrder!;
    const original = command.action === "UNDO_REORDER" ? await order.loadOriginal(command.originalOperationId, actor.accountId) : undefined;
    if (command.action === "UNDO_REORDER") requireDomain(original, "CATALOGUE_NOT_FOUND", "Original category reorder is unavailable");
    const parentId = command.action === "REORDER" ? command.parentId : original!.after.parent_id;
    const movedId = command.action === "REORDER" ? command.movedId : original!.after.moved_id;
    if (original) {
      const before = original.before, after = original.after, result = checkedCategoryOrderResult(original.result);
      const next = new Map(after.rows.map(r => [r.id, r]));
      requireDomain(original.actorAccountId === actor.accountId && command.action === "UNDO_REORDER" && result.operationId === command.originalOperationId
        && before.parent_id === after.parent_id && before.moved_id === after.moved_id && before.undo_of_operation_id === null && after.undo_of_operation_id === null
        && before.rows.length === after.rows.length && before.rows.every(r => { const n = next.get(r.id); return n && n.version === r.version + (n.display_order === r.display_order ? 0 : 1); })
        && result.order.parentId === parentId && result.order.undoOfOperationId === null
        && requestHash([...result.order.members].sort(byId).map(r => ({ id: r.id, version: r.version, display_order: r.displayOrder }))) === requestHash(after.rows),
      "INVALID_DATABASE_VALUE", "Original reorder proof is incoherent");
    }
    const rows = [...await order.loadSiblings(parentId)].sort(byOrder), code = command.action === "REORDER" ? "CATEGORY_ORDER_CONFLICT" : "CATEGORY_UNDO_CONFLICT";
    requireDomain(rows.length === command.expectedSiblings.length && rows.every((r, i) => r.kind === "CATEGORY" && r.parentId === parentId && r.deletedAt === null
      && r.id === command.expectedSiblings[i]!.id && r.version === command.expectedSiblings[i]!.expectedVersion), code, "Complete category siblings or versions changed");
    const currentIds = rows.map(r => r.id);
    let targetOrders: Map<string, number>;
    if (command.action === "REORDER") {
      requireDomain(currentIds.includes(movedId) && requestHash(currentIds.filter(id => id !== movedId)) === requestHash(command.orderedIds.filter(id => id !== movedId)), code, "Only the selected sibling may move");
      requireDomain(requestHash(currentIds) !== requestHash(command.orderedIds), "NO_CATALOGUE_CHANGE", "Category order is unchanged");
      targetOrders = new Map(command.orderedIds.map((id, index) => [id, index]));
    } else {
      requireDomain(requestHash(orderEvidence(rows, parentId, movedId, null).rows) === requestHash(original!.after.rows), code, "Category poststate changed after the original reorder");
      targetOrders = new Map(original!.before.rows.map(r => [r.id, r.display_order]));
    }
    const next = rows.map(r => {
      const displayOrder = targetOrders.get(r.id); requireDomain(displayOrder !== undefined, code, "Missing category order target");
      if (displayOrder === r.displayOrder) return r;
      requireDomain(r.version < 2147483647, "VERSION_STORAGE_OVERFLOW", "Category version exhausted");
      return { ...r, displayOrder, version: r.version + 1 };
    });
    const changed = next.filter((r, i) => r.version !== rows[i]!.version).sort(byId);
    requireDomain(changed.length > 0, "NO_CATALOGUE_CHANGE", "No category order change");
    const anchor = original ? next.find(r => r.id === original.result.targetId) : changed[0];
    requireDomain(anchor && changed.some(r => r.id === anchor.id), "INVALID_DATABASE_VALUE", "Actual changed category anchor required");
    const old = rows.find(r => r.id === anchor.id)!;
    const undoOf = command.action === "UNDO_REORDER" ? command.originalOperationId : null;
    const before = orderEvidence(rows, parentId, movedId, undoOf), after = orderEvidence(next, parentId, movedId, undoOf);
    const timestamp = dependencies.now(), operationId = entityId("operation", dependencies.newId("operation"));
    requireDomain(Number.isFinite(Date.parse(timestamp)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp), "INVALID_ACTION_TIME", "Trusted completion time required");
    const completion = { operationId, actorAccountId: actor.accountId, requestKey: command.requestKey, requestHash: hash,
      kind: "CATEGORY" as const, action: command.action, targetId: anchor.id, oldVersion: old.version, newVersion: anchor.version,
      beforeValues: { version: old.version, display_order: old.displayOrder, category_order: before as unknown as MaintenanceJsonObject },
      afterValues: { version: anchor.version, display_order: anchor.displayOrder, category_order: after as unknown as MaintenanceJsonObject }, completedAt: timestamp };
    await tx.evidence.prepare!(completion);
    for (const r of changed) await order.put(rows.find(old => old.id === r.id)!, r);
    const result = checkedCategoryOrderResult(await tx.evidence.complete(completion));
    const expected: CategoryOrderResult = { operationId, kind: "CATEGORY", targetId: anchor.id, version: anchor.version,
      order: { parentId, undoOfOperationId: undoOf, members: [...next].sort(byOrder).map(r => ({ id: r.id, version: r.version, displayOrder: r.displayOrder })) } };
    requireDomain(requestHash(result) === requestHash(expected), "INVALID_DATABASE_VALUE", "Category receipt differs from the actual complete sibling save");
    return result;
  }
  return Object.freeze({
    async execute(actorInput, kindInput, input) {
      const actor = checkedProductActor(actorInput), kind = catalogueMaintenanceKind(kindInput), command = parseCatalogueMaintenanceCommand(kind, input), hash = requestHash({ actorAccountId: actor.accountId, kind, command });
      return dependencies.unitOfWork.transaction(async tx => {
        await tx.lockDirectory();
        if (isCategoryOrderCommand(command)) {
          requireDomain(tx.categoryOrder && typeof tx.evidence.prepare === "function", "CATALOGUE_ORDER_NOT_READY", "Verified category order transaction is unavailable");
          await tx.categoryOrder.assertReady();
        }
        await authorizeCatalogueMaintenance(tx.evidence, actor, kind, command.action);
        const receipt = await tx.evidence.getReceipt(actor.accountId, command.requestKey, kind);
        if (receipt) { requireDomain(receipt.requestHash === hash && receipt.action === command.action && receipt.result.kind === kind, "IDEMPOTENCY_CONFLICT", "Original catalogue key differs"); await authorizeCatalogueMaintenance(tx.evidence, actor, kind, command.action); return isCategoryOrderCommand(command) ? checkedCategoryOrderResult(receipt.result) : receipt.result; }
        if (isCategoryOrderCommand(command)) return executeOrder(tx, actor, command, hash);
        const entityKind = kind === "CATEGORY" ? "category" : kind === "COLOR" ? "color" : "fit", id = command.action === "CREATE" ? entityId(entityKind, dependencies.newId(entityKind)) : command.id;
        const previous = await tx.load(kind, id);
        requireDomain(command.action === "CREATE" ? previous === undefined : previous !== undefined, command.action === "CREATE" ? "VERSION_CONFLICT" : "CATALOGUE_NOT_FOUND", "Native catalogue identity unavailable");
        if (command.action !== "CREATE") requireDomain(previous!.kind === kind && previous!.version === command.expectedVersion, "VERSION_CONFLICT", "Catalogue entry changed");
        requireDomain(!previous || previous.deletedAt === null, "CATALOGUE_DELETED", "Deleted identity cannot be restored or modified"); requireDomain(!previous || previous.version < 2147483647, "VERSION_STORAGE_OVERFLOW", "Version exhausted");
        const timestamp = dependencies.now(), operationId = entityId("operation", dependencies.newId("operation")); requireDomain(Number.isFinite(Date.parse(timestamp)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp), "INVALID_ACTION_TIME", "Trusted completion time required");
        let next: CatalogueWriteRecord;
        if (command.action === "CREATE" || command.action === "EDIT") {
          const base = { id, version: (previous?.version ?? 0) + 1, deletedAt: null };
          next = kind === "CATEGORY" ? { ...command.values as CategoryWriteValues, ...base, kind } : { ...command.values as CatalogueEntryWriteValues, ...base, kind };
        } else if (command.action === "DELETE") { await tx.assertUnreferenced(previous!); next = { ...previous!, version: previous!.version + 1, deletedAt: timestamp }; }
        else {
          const entry = previous!; requireDomain(entry.kind !== "CATEGORY", "INVALID_CATALOGUE_COMMAND", "Categories have no enabled state");
          requireDomain(command.action === "DISABLE" ? entry.enabled : !entry.enabled, "INVALID_CATALOGUE_STATE", "State already applied"); next = { ...entry, version: entry.version + 1, enabled: command.action === "RESTORE" };
        }
        const old = previous ? facts(previous) : null, current = facts(next), before: Record<string, MaintenanceJsonValue> = {}, after: Record<string, MaintenanceJsonValue> = {};
        for (const [k, v] of Object.entries(current)) if (old === null || requestHash(v) !== requestHash(old[k])) { after[k] = v; if (old !== null) before[k] = old[k]!; }
        requireDomain(previous === undefined || Object.keys(after).some(k => k !== "version"), "NO_CATALOGUE_CHANGE", "No catalogue change supplied");
        await tx.validateChange(previous, next); await tx.put(previous, next);
        const result = await tx.evidence.complete({ operationId, actorAccountId: actor.accountId, requestKey: command.requestKey, requestHash: hash, kind, action: command.action, targetId: id, oldVersion: previous?.version ?? null, newVersion: next.version, beforeValues: previous ? before : null, afterValues: after, completedAt: timestamp });
        requireDomain(result.kind === kind && result.targetId === id && result.operationId === operationId && result.version === next.version, "INVALID_DATABASE_VALUE", "Receipt differs from actual catalogue save"); return result;
      });
    },
    async receipt(actorInput, kindInput, keyInput) {
      const actor = checkedProductActor(actorInput), kind = catalogueMaintenanceKind(kindInput), key = partyRequestKey(keyInput);
      return dependencies.unitOfWork.transaction(async tx => { await authorizeCatalogueMaintenance(tx.evidence, actor, kind, "RECEIPT"); const original = await tx.evidence.getReceipt(actor.accountId, key, kind); requireDomain(original && original.result.kind === kind, "RECEIPT_NOT_FOUND", "Original catalogue receipt unavailable"); await authorizeCatalogueMaintenance(tx.evidence, actor, kind, original.action);
        const order = original.action === "REORDER" || original.action === "UNDO_REORDER";
        if (order) { requireDomain(kind === "CATEGORY" && tx.categoryOrder, "CATALOGUE_ORDER_NOT_READY", "Verified category order receipt is unavailable"); await tx.categoryOrder.assertReady(); }
        return { requestKey: key, action: original.action, status: "COMMITTED" as const, completedAt: original.completedAt, result: order ? checkedCategoryOrderResult(original.result) : original.result }; });
    }
  } satisfies CatalogueMaintenanceService);
}
