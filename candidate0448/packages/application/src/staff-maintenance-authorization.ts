import type { ActorContext } from "./ports.ts";
import type { MaintenanceEvidenceSession } from "./maintenance-commit-ports.ts";
import { checkedProductActor } from "./product-query-validation.ts";
export async function authorizeStaffMaintenance(evidence: MaintenanceEvidenceSession, actor: ActorContext, action: string): Promise<void> {
  await evidence.assertAllowed(checkedProductActor(actor), "STAFF", action);
}
