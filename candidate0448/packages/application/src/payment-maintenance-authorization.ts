import { checkedProductActor } from "./product-query-validation.ts";
import type { ActorContext } from "./ports.ts";
import type { MaintenanceEvidenceSession } from "./maintenance-commit-ports.ts";
import type { PaymentMaintenanceKind } from "./payment-maintenance-ports.ts";
export async function authorizePaymentMaintenance(evidence: MaintenanceEvidenceSession, actor: ActorContext, kind: PaymentMaintenanceKind, action: string): Promise<void> {
  await evidence.assertAllowed(checkedProductActor(actor), kind, action);
}
