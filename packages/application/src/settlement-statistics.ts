import type { SalesDocument } from "../../domain/src/documents.ts";
import { requireDomain } from "../../domain/src/errors.ts";
import { addMoney, minorAmount } from "../../domain/src/values.ts";
import type { EntityId, MinorAmount } from "../../domain/src/values.ts";

export interface DocumentSettlementTotal { readonly paymentAccountId: EntityId<"paymentAccount">; readonly received: MinorAmount; readonly refunded: MinorAmount }
/** Pure calculation over an already authorized, complete requested scope. Not an API or an account balance. */
export function summarizeApprovedSettlements(documents: readonly SalesDocument[]): readonly DocumentSettlementTotal[] {
  const result = new Map<EntityId<"paymentAccount">, DocumentSettlementTotal>();
  const seen = new Set<EntityId<"sales">>();
  for (const document of documents) {
    requireDomain(!seen.has(document.header.id), "DUPLICATE_STATISTICS_DOCUMENT", "An exact statistics scope must contain each document once");
    seen.add(document.header.id);
    if (document.header.status !== "APPROVED") continue;
    for (const row of document.settlements) {
      const current = result.get(row.paymentAccountId) ?? { paymentAccountId: row.paymentAccountId, received: minorAmount("0"), refunded: minorAmount("0") };
      result.set(row.paymentAccountId, { paymentAccountId: row.paymentAccountId,
        received: row.direction === "RECEIVE" ? addMoney(current.received, row.amount) : current.received,
        refunded: row.direction === "REFUND" ? addMoney(current.refunded, row.amount) : current.refunded });
    }
  }
  return [...result.values()];
}
