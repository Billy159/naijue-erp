import type { CurrentFormAuthorization, CurrentFormContext, CurrentFormIntent } from "./current-form-ports.ts";
import { activeCurrentFormRead, checkedCurrentFormActor, parseCurrentFormProductQuery,
  parseCurrentFormProductSkuQuery, parseCurrentFormSkuBatchQuery, parseCurrentSalesReferenceQuery,
  parseCurrentTransferWarehouseQuery, parseCurrentFormBarcodeQuery } from "./current-form-validation.ts";
import { DomainError } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";

function denied(): never { throw new DomainError("FORBIDDEN", "Current form is not authorized"); }
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) denied();
  return value as Record<string, unknown>;
}
/** Validate the complete intent, not just a discriminator that could hide a malformed context. */
function formContext(intent: CurrentFormIntent): CurrentFormContext | null {
  record(intent, ["kind", "parameters"]);
  switch (intent.kind) {
    case "sales-references": {
      const query = parseCurrentSalesReferenceQuery(intent.parameters);
      return query.hallId === null ? null : { kind: "SALES", hallId: query.hallId };
    }
    case "transfer-warehouses": parseCurrentTransferWarehouseQuery(intent.parameters); return { kind: "TRANSFER" };
    case "products": return parseCurrentFormProductQuery(intent.parameters).context;
    case "product-skus": return parseCurrentFormProductSkuQuery(intent.parameters).context;
    case "sku-batch": return parseCurrentFormSkuBatchQuery(intent.parameters).context;
    case "barcode": return parseCurrentFormBarcodeQuery(intent.parameters).context;
    default: return denied();
  }
}

/** Explicit trusted-host selection for CURRENT proposals, not document visibility or commands.
 * Consumes only the reader's immutable identity from the SAME RR READ ONLY snapshot;
 * no pool, second lookup, session, route registration or client-selected role/grant.
 * Sales: SALESPERSON's own current hall; ADMIN/WAREHOUSE all. Transfer: all eligible
 * proposals for canonical roles: new salesperson drafts receive trusted creator-hall
 * facts in transfer-service.ts, irrespective of endpoint halls (transfer-policy.ts).
 * The reader retains enabled identity/sales-hall and FROM enabled-or-stock/TO enabled
 * checks. Shared customer/staff/product/method/account facts gain no hall ownership. */
export function createSourceConfirmedCurrentFormAuthorization(): CurrentFormAuthorization {
  return Object.freeze<CurrentFormAuthorization>({ async authorize(context, intent, signal) {
    activeCurrentFormRead(signal);
    try {
      record(context, ["actor", "identity"]);
      const actor = checkedCurrentFormActor(context.actor);
      const identity = record(context.identity, ["accountId", "staffId", "role", "hallId"]);
      if (typeof identity.accountId !== "string" || entityId("account", identity.accountId) !== actor.accountId
        || typeof identity.staffId !== "string") denied();
      entityId("staff", identity.staffId);
      const hallId = identity.hallId === null ? null
        : typeof identity.hallId === "string" ? entityId("hall", identity.hallId) : denied();
      if (hallId !== actor.hallId || (identity.role !== "ADMIN" && identity.role !== "WAREHOUSE" && identity.role !== "SALESPERSON")
        || (identity.role === "SALESPERSON" && hallId === null)) denied();
      const target = formContext(intent);
      if (identity.role !== "SALESPERSON" || target?.kind === "TRANSFER") return Object.freeze({ kind: "all" as const });
      if (hallId === null || (target !== null && target.hallId !== hallId)) denied();
      return Object.freeze({ kind: "halls" as const, hallIds: Object.freeze([hallId]) });
    } catch { return denied(); }
  } });
}
