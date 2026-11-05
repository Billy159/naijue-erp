import type { ActorContext } from "./ports.ts";
import type { ProductManagementQueryDependencies } from "./product-management-query-ports.ts";
import { checkedProductActor } from "./product-query-validation.ts";
import { activeProductManagementRead, checkedProductManagementCandidatePage, checkedProductManagementGrant,
  checkedProductManagementListPage, parseProductManagementCandidateQuery, parseProductManagementListQuery } from "./product-management-query-validation.ts";

/** Inert composition only. No permissive role policy, database, fixture or route registration. */
export function createProductManagementQueryService(dependencies: ProductManagementQueryDependencies) {
  if (typeof dependencies?.authorization?.authorize !== "function" || typeof dependencies?.reader?.readList !== "function"
    || typeof dependencies?.reader?.readCandidates !== "function") throw new TypeError("Product management reads require explicit authorization and snapshot reader");
  return Object.freeze({
    async readList(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseProductManagementListQuery(input), trustedActor = checkedProductActor(actor); activeProductManagementRead(signal);
      const grant = checkedProductManagementGrant(await dependencies.authorization.authorize(trustedActor, Object.freeze({ kind: "list", parameters }), signal)); activeProductManagementRead(signal);
      const value = await dependencies.reader.readList(Object.freeze({ actor: trustedActor, grant, parameters, signal })); activeProductManagementRead(signal);
      let result;
      try { result = checkedProductManagementListPage(value); } catch { throw new Error("Invalid trusted product management response"); }
      if (result.page !== parameters.page || result.pageSize !== parameters.pageSize || result.items.some(item => grant.kind === "products" && !grant.productIds.includes(item.id))
        || result.items.some(item => grant.totalStock === "unavailable" ? item.totalStock !== null : item.totalStock === null)) throw new Error("Mismatched trusted product management response");
      return result;
    },
    async readCandidates(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseProductManagementCandidateQuery(input), trustedActor = checkedProductActor(actor); activeProductManagementRead(signal);
      const grant = checkedProductManagementGrant(await dependencies.authorization.authorize(trustedActor, Object.freeze({ kind: "candidates", parameters }), signal)); activeProductManagementRead(signal);
      const value = await dependencies.reader.readCandidates(Object.freeze({ actor: trustedActor, grant, parameters, signal })); activeProductManagementRead(signal);
      let result;
      try { result = checkedProductManagementCandidatePage(value, parameters.kind); } catch { throw new Error("Invalid trusted product management candidates"); }
      if (result.page !== parameters.page || (parameters.kind === "product" && result.items.some(item => grant.kind === "products" && !grant.productIds.includes(item.id)))
        || (parameters.selectedIds.length && result.items.some(item => !parameters.selectedIds.includes(item.id)))) throw new Error("Mismatched trusted product management candidates");
      return result;
    }
  });
}
