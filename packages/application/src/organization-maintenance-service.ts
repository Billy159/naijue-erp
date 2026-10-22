import { requireDomain } from "../../domain/src/errors.ts";
import { checkedProductActor } from "./product-query-validation.ts";
import { organizationKind, parseOrganizationDetailQuery, parseOrganizationListQuery, projectOrganizationRecord } from "./organization-maintenance-validation.ts";
import type { OrganizationReadService, OrganizationReadUnitOfWork } from "./organization-maintenance-ports.ts";
/** Read-only B05 slice: staff/account require current ADMIN through the D1 evidence boundary. */
export function createOrganizationMaintenanceReadService(unitOfWork: OrganizationReadUnitOfWork): OrganizationReadService {
  if (typeof unitOfWork?.transaction !== "function") throw new TypeError("Settings reads require an explicit current-identity transaction");
  const service: OrganizationReadService = {
    async list(actorInput, kindInput, input) {
      const actor = checkedProductActor(actorInput), kind = organizationKind(kindInput), query = parseOrganizationListQuery(input, kind);
      return unitOfWork.transaction(async tx => {
        await tx.evidence.assertAllowed(actor, kind, "LIST"); const page = await tx.readList(kind, query);
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
