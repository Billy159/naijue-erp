import { requireDomain } from "../../domain/src/errors.ts";
import { checkedProductActor } from "./product-query-validation.ts";
import type { ActorContext } from "./ports.ts";
import type { ProductMaintenanceAction, ProductMaintenanceEvidence } from "./product-maintenance-ports.ts";
/** D1 must recheck current account/staff/hall inside its transaction; no client role is accepted. */
export async function authorizeProductMaintenance(evidence: ProductMaintenanceEvidence, actor: ActorContext, action: ProductMaintenanceAction | "RECEIPT" | "DETAIL" | "CANDIDATES"): Promise<void> {
  requireDomain(typeof evidence?.assertAllowed === "function", "FORBIDDEN", "Current maintenance authority is unavailable");
  await evidence.assertAllowed(checkedProductActor(actor), "PRODUCT", action);
}
