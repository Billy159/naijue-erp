import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { checkedProductActor } from "./product-query-validation.ts";
import { partyRequestKey } from "./party-maintenance-validation.ts";
import { requestHash } from "./request-hash.ts";
import { authorizeCatalogueMaintenance } from "./catalogue-maintenance-authorization.ts";
import { catalogueMaintenanceKind, parseCatalogueMaintenanceCommand } from "./catalogue-maintenance-validation.ts";
import type { MaintenanceJsonObject, MaintenanceJsonValue } from "./maintenance-commit-ports.ts";
import type { CatalogueMaintenanceDependencies, CatalogueMaintenanceService, CatalogueWriteRecord, CategoryWriteValues, CatalogueEntryWriteValues } from "./catalogue-maintenance-ports.ts";
function facts(row: CatalogueWriteRecord): MaintenanceJsonObject {
  return { id: row.id, name: row.name, version: row.version, deleted_at: row.deletedAt, ...(row.kind === "CATEGORY" ? { parent_id: row.parentId, display_order: row.displayOrder } : { code: row.code, enabled: row.enabled }) };
}
export function createCatalogueMaintenanceService(dependencies: CatalogueMaintenanceDependencies): CatalogueMaintenanceService {
  if (typeof dependencies?.unitOfWork?.transaction !== "function" || typeof dependencies?.now !== "function" || typeof dependencies?.newId !== "function") throw new TypeError("Catalogue maintenance requires explicit transaction/time/identifiers");
  return Object.freeze({
    async execute(actorInput, kindInput, input) {
      const actor = checkedProductActor(actorInput), kind = catalogueMaintenanceKind(kindInput), command = parseCatalogueMaintenanceCommand(kind, input), hash = requestHash({ actorAccountId: actor.accountId, kind, command });
      return dependencies.unitOfWork.transaction(async tx => {
        await tx.lockDirectory(); await authorizeCatalogueMaintenance(tx.evidence, actor, kind, command.action);
        const receipt = await tx.evidence.getReceipt(actor.accountId, command.requestKey, kind);
        if (receipt) { requireDomain(receipt.requestHash === hash && receipt.action === command.action && receipt.result.kind === kind, "IDEMPOTENCY_CONFLICT", "Original catalogue key differs"); await authorizeCatalogueMaintenance(tx.evidence, actor, kind, command.action); return receipt.result; }
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
        return { requestKey: key, action: original.action, status: "COMMITTED" as const, completedAt: original.completedAt, result: original.result }; });
    }
  } satisfies CatalogueMaintenanceService);
}
