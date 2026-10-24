import { requireDomain } from "../../domain/src/errors.ts";
import { checkedProductActor } from "./product-query-validation.ts";
import { organizationKind, parseOrganizationDetailQuery, parseOrganizationListQuery, projectOrganizationRecord } from "./organization-maintenance-validation.ts";
import type { OrganizationReadService, OrganizationReadUnitOfWork } from "./organization-maintenance-ports.ts";
import type { HallWriteValues, WarehouseWriteValues, OrganizationWriteRecord, OrganizationWriteDependencies, OrganizationWriteService } from "./organization-maintenance-ports.ts";
import type { MaintenanceJsonObject, MaintenanceJsonValue } from "./maintenance-commit-ports.ts";
import { organizationWriteKind, parseOrganizationWriteCommand } from "./organization-maintenance-validation.ts";
import { authorizeOrganizationMaintenance } from "./organization-maintenance-authorization.ts";
import { entityId } from "../../domain/src/values.ts";
import { partyRequestKey } from "./party-maintenance-validation.ts";
import { requestHash } from "./request-hash.ts";

function organizationFacts(row: OrganizationWriteRecord): MaintenanceJsonObject {
  return { id: row.id, name: row.name, enabled: row.enabled, version: row.version, ...(row.kind === "HALL"
    ? { default_customer_id: row.defaultCustomerId, default_sales_warehouse_id: row.defaultSalesWarehouseId }
    : { hall_id: row.hallId, created_operation_id: row.createdOperationId }) };
}
/** New command service; read service/DTO remain unchanged. */
export function createOrganizationMaintenanceService(dependencies: OrganizationWriteDependencies): OrganizationWriteService {
  if (typeof dependencies?.unitOfWork?.transaction !== "function" || typeof dependencies?.now !== "function" || typeof dependencies?.newId !== "function") throw new TypeError("Hall/warehouse writes require explicit providers");
  return Object.freeze({
    async execute(actorInput, kindInput, input) {
      const actor = checkedProductActor(actorInput), kind = organizationWriteKind(kindInput), command = parseOrganizationWriteCommand(kind, input), hash = requestHash({ actorAccountId: actor.accountId, kind, command });
      return dependencies.unitOfWork.transaction(async tx => {
        await tx.lockTopology(); const original = await tx.evidence.getReceipt(actor.accountId, command.requestKey, kind);
        await authorizeOrganizationMaintenance(tx.evidence, actor, kind, command.action);
        if (original) { requireDomain(original.requestHash === hash && original.action === command.action && original.result.kind === kind, "IDEMPOTENCY_CONFLICT", "Original hall/warehouse key differs"); await authorizeOrganizationMaintenance(tx.evidence, actor, kind, command.action); return original.result; }
        const id = command.action === "CREATE" ? entityId(kind === "HALL" ? "hall" : "warehouse", dependencies.newId(kind === "HALL" ? "hall" : "warehouse")) : command.id;
        const previous = await tx.load(kind, id);
        requireDomain(command.action === "CREATE" ? previous === undefined : previous !== undefined, command.action === "CREATE" ? "VERSION_CONFLICT" : "ORGANIZATION_NOT_FOUND", "Native hall/warehouse identity unavailable");
        if (command.action !== "CREATE") requireDomain(previous!.kind === kind && previous!.version === command.expectedVersion, "VERSION_CONFLICT", "Hall/warehouse changed");
        requireDomain(!previous || previous.version < 2147483647, "VERSION_STORAGE_OVERFLOW", "Version exhausted");
        const operationId = entityId("operation", dependencies.newId("operation")), timestamp = dependencies.now();
        requireDomain(Number.isFinite(Date.parse(timestamp)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp), "INVALID_ACTION_TIME", "Trusted completion time required");
        let next: OrganizationWriteRecord;
        if (command.action === "CREATE" || command.action === "EDIT") {
          const base = { id, version: (previous?.version ?? 0) + 1 };
          next = kind === "HALL" ? { ...command.values as HallWriteValues, ...base, kind }
            : { ...command.values as WarehouseWriteValues, ...base, kind, createdOperationId: previous?.kind === "WAREHOUSE" ? previous.createdOperationId : operationId };
        } else {
          requireDomain(command.action === "DISABLE" ? previous!.enabled : !previous!.enabled, "INVALID_ORGANIZATION_STATE", "State already applied"); next = { ...previous!, enabled: command.action === "RESTORE", version: previous!.version + 1 };
        }
        const old = previous ? organizationFacts(previous) : null, facts = organizationFacts(next), before: Record<string, MaintenanceJsonValue> = {}, after: Record<string, MaintenanceJsonValue> = {};
        for (const [k, v] of Object.entries(facts)) if (old === null || requestHash(v) !== requestHash(old[k])) { after[k] = v; if (old !== null) before[k] = old[k]!; }
        requireDomain(previous === undefined || Object.keys(after).some(k => k !== "version"), "NO_ORGANIZATION_CHANGE", "No actual hall/warehouse changes");
        await tx.validateChange(previous, next);
        const completion = { operationId, actorAccountId: actor.accountId, requestKey: command.requestKey, requestHash: hash, kind, action: command.action, targetId: id, oldVersion: previous?.version ?? null, newVersion: next.version, beforeValues: previous ? before : null, afterValues: after, completedAt: timestamp };
        requireDomain(typeof tx.evidence.prepare === "function", "MAINTENANCE_PREPARE_NOT_READY", "Original audit preparation is unavailable");
        await tx.evidence.prepare(completion); await tx.put(previous, next);
        const result = await tx.evidence.complete(completion);
        requireDomain(result.operationId === operationId && result.kind === kind && result.targetId === id && result.version === next.version, "INVALID_DATABASE_VALUE", "Receipt differs from actual hall/warehouse save"); return result;
      });
    },
    async receipt(actorInput, kindInput, keyInput) {
      const actor = checkedProductActor(actorInput), kind = organizationWriteKind(kindInput), key = partyRequestKey(keyInput);
      return dependencies.unitOfWork.transaction(async tx => { const original = await tx.evidence.getReceipt(actor.accountId, key, kind); await authorizeOrganizationMaintenance(tx.evidence, actor, kind, "RECEIPT");
        requireDomain(original && original.result.kind === kind, "RECEIPT_NOT_FOUND", "Original receipt unavailable"); await authorizeOrganizationMaintenance(tx.evidence, actor, kind, original.action);
        return { requestKey: key, action: original.action, status: "COMMITTED" as const, completedAt: original.completedAt, result: original.result };
      });
    }
  } satisfies OrganizationWriteService);
}
/** Read-only B05 slice: staff/account require current ADMIN through the D1 evidence boundary. */
export function createOrganizationMaintenanceReadService(unitOfWork: OrganizationReadUnitOfWork): OrganizationReadService {
  if (typeof unitOfWork?.transaction !== "function") throw new TypeError("Settings reads require an explicit current-identity transaction");
  const service: OrganizationReadService = {
    async list(actorInput, kindInput, input) {
      const actor = checkedProductActor(actorInput), kind = organizationKind(kindInput), query = parseOrganizationListQuery(input, kind);
      return unitOfWork.transaction(async tx => {
        await tx.evidence.assertAllowed(actor, kind, "LIST");
        requireDomain(!("loginStatus" in query) || query.loginStatus !== "closed", "STAFF_LOGIN_FILTER_NOT_READY", "Closed-login no-account classification is pending");
        const page = await tx.readList(kind, query);
        requireDomain(page.kind === kind && page.page === query.page && page.pageSize === query.pageSize && Number.isSafeInteger(page.total) && page.total >= 0
          && Array.isArray(page.items) && page.items.length === Math.min(query.pageSize, Math.max(0, page.total - (query.page - 1) * query.pageSize)), "INVALID_DATABASE_VALUE", "Invalid settings page");
        const items = page.items.map(item => projectOrganizationRecord(item, kind));
        requireDomain(new Set(items.map(item => item.id)).size === items.length, "INVALID_DATABASE_VALUE", "Duplicate native settings identity");
        return { kind, page: query.page, pageSize: query.pageSize, total: page.total, items };
      });
    },
    async detail(actorInput, kindInput, input) {
      const actor = checkedProductActor(actorInput), kind = organizationKind(kindInput), id = parseOrganizationDetailQuery(input);
      return unitOfWork.transaction(async tx => {
        await tx.evidence.assertAllowed(actor, kind, "DETAIL"); const row = await tx.readDetail(kind, id);
        if (row === null) return null; const item = projectOrganizationRecord(row, kind);
        requireDomain(item.id === id, "INVALID_DATABASE_VALUE", "Mismatched settings target"); return item;
      });
    }
  };
  return Object.freeze(service);
}
