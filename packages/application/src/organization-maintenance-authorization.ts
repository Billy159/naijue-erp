import type { ActorContext } from "./ports.ts";
import type { MaintenanceEvidenceSession } from "./maintenance-commit-ports.ts";
import type { OrganizationWriteKind } from "./organization-maintenance-ports.ts";
import { checkedProductActor } from "./product-query-validation.ts";
export async function authorizeOrganizationMaintenance(evidence: MaintenanceEvidenceSession, actor: ActorContext, kind: OrganizationWriteKind, action: string): Promise<void> {
  await evidence.assertAllowed(checkedProductActor(actor), kind, action);
}
