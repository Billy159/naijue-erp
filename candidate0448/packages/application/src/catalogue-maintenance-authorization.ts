import type { ActorContext } from "./ports.ts";
import type { MaintenanceEvidenceSession } from "./maintenance-commit-ports.ts";
import type { CatalogueMaintenanceKind } from "./catalogue-maintenance-ports.ts";
import { checkedProductActor } from "./product-query-validation.ts";
export async function authorizeCatalogueMaintenance(evidence: MaintenanceEvidenceSession, actor: ActorContext, kind: CatalogueMaintenanceKind, action: string): Promise<void> {
  await evidence.assertAllowed(checkedProductActor(actor), kind, action);
}
