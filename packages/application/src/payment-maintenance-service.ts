import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { checkedProductActor } from "./product-query-validation.ts";
import { partyRequestKey } from "./party-maintenance-validation.ts";
import { requestHash } from "./request-hash.ts";
import { authorizePaymentMaintenance } from "./payment-maintenance-authorization.ts";
import { parsePaymentCommand, paymentKind } from "./payment-maintenance-validation.ts";
import type { MaintenanceJsonObject, MaintenanceJsonValue } from "./maintenance-commit-ports.ts";
import type { PaymentAccountValues, PaymentMaintenanceDependencies, PaymentMaintenanceService, PaymentRecord } from "./payment-maintenance-ports.ts";
function facts(row: PaymentRecord): MaintenanceJsonObject {
  return { id: row.id, name: row.name, enabled: row.enabled, version: row.version,
    ...(row.kind === "PAYMENT_ACCOUNT" ? { payment_method_id: row.paymentMethodId, payment_halls: row.hallIds.map(hallId => ({ payment_account_id: row.id, hall_id: hallId })) } : {}) };
}
/** Root and relationship changes share the same D1 transaction and strict original-key receipt. */
export function createPaymentMaintenanceService(dependencies: PaymentMaintenanceDependencies): PaymentMaintenanceService {
  if (typeof dependencies?.unitOfWork?.transaction !== "function" || typeof dependencies?.newId !== "function" || typeof dependencies?.now !== "function")
    throw new TypeError("Payment maintenance requires transaction/clock/identifier providers");
  const service: PaymentMaintenanceService = {
    async execute(actorInput, kindInput, input) {
      const actor = checkedProductActor(actorInput), kind = paymentKind(kindInput), command = parsePaymentCommand(kind, input);
      const hash = requestHash({ actorAccountId: actor.accountId, kind, command });
      return dependencies.unitOfWork.transaction(async tx => {
        await authorizePaymentMaintenance(tx.evidence, actor, kind, command.action);
        const receipt = await tx.evidence.getReceipt(actor.accountId, command.requestKey, kind);
        if (receipt) {
          requireDomain(receipt.requestHash === hash && receipt.action === command.action && receipt.result.kind === kind, "IDEMPOTENCY_CONFLICT", "Original payment key differs");
          await authorizePaymentMaintenance(tx.evidence, actor, kind, command.action); return receipt.result;
        }
        const id = command.action === "CREATE" ? entityId(kind === "PAYMENT_METHOD" ? "paymentMethod" : "paymentAccount", dependencies.newId(kind === "PAYMENT_METHOD" ? "paymentMethod" : "paymentAccount")) : command.id;
        const previous = await tx.load(kind, id);
        requireDomain(command.action === "CREATE" ? previous === undefined : previous !== undefined, command.action === "CREATE" ? "VERSION_CONFLICT" : "PAYMENT_NOT_FOUND", "Native payment identity unavailable");
        if (command.action !== "CREATE") requireDomain(previous!.kind === kind && previous!.version === command.expectedVersion, "VERSION_CONFLICT", "Payment record changed");
        requireDomain(!previous || previous.version < 2147483647, "VERSION_STORAGE_OVERFLOW", "Payment version exhausted");
        let next: PaymentRecord;
        if (command.action === "CREATE" || command.action === "EDIT") {
          const base = { id, name: command.values.name, enabled: command.values.enabled, version: (previous?.version ?? 0) + 1 };
          if (kind === "PAYMENT_ACCOUNT") {
            const values = command.values as PaymentAccountValues;
            requireDomain(previous === undefined || previous.kind === "PAYMENT_ACCOUNT" && previous.paymentMethodId === values.paymentMethodId,
              "IMMUTABLE_PAYMENT_METHOD", "Account method is immutable; create another account instead");
            next = { ...base, kind, paymentMethodId: values.paymentMethodId, hallIds: values.hallIds };
          } else next = { ...base, kind };
        } else {
          requireDomain(command.action !== "DISABLE" || previous!.enabled, "INVALID_PAYMENT_STATE", "Payment record already disabled");
          requireDomain(command.action !== "RESTORE" || !previous!.enabled, "INVALID_PAYMENT_STATE", "Payment record already enabled");
          next = { ...previous!, enabled: command.action === "RESTORE", version: previous!.version + 1 };
        }
        const timestamp = dependencies.now(), operationId = entityId("operation", dependencies.newId("operation"));
        requireDomain(Number.isFinite(Date.parse(timestamp)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp), "INVALID_ACTION_TIME", "Trusted completion time required");
        const oldFacts = previous ? facts(previous) : null, newFacts = facts(next), before: Record<string, MaintenanceJsonValue> = {}, after: Record<string, MaintenanceJsonValue> = {};
        for (const [k, v] of Object.entries(newFacts)) if (oldFacts === null || requestHash(v) !== requestHash(oldFacts[k])) { after[k] = v; if (oldFacts !== null) before[k] = oldFacts[k]!; }
        requireDomain(previous === undefined || Object.keys(after).some(k => k !== "version"), "NO_PAYMENT_CHANGE", "No actual payment changes supplied");
        await tx.validateChange(previous, next); await tx.put(previous, next);
        const result = await tx.evidence.complete({ operationId, actorAccountId: actor.accountId, requestKey: command.requestKey, requestHash: hash, kind, action: command.action,
          targetId: id, oldVersion: previous?.version ?? null, newVersion: next.version, beforeValues: previous ? before : null, afterValues: after, completedAt: timestamp });
        requireDomain(result.kind === kind && result.targetId === id && result.operationId === operationId && result.version === next.version, "INVALID_DATABASE_VALUE", "Receipt differs from actual payment save"); return result;
      });
    },
    async receipt(actorInput, kindInput, requestKeyInput) {
      const actor = checkedProductActor(actorInput), kind = paymentKind(kindInput), key = partyRequestKey(requestKeyInput);
      return dependencies.unitOfWork.transaction(async tx => {
        await authorizePaymentMaintenance(tx.evidence, actor, kind, "RECEIPT"); const receipt = await tx.evidence.getReceipt(actor.accountId, key, kind);
        requireDomain(receipt && receipt.result.kind === kind, "RECEIPT_NOT_FOUND", "Original payment receipt unavailable");
        await authorizePaymentMaintenance(tx.evidence, actor, kind, receipt.action);
        return { requestKey: key, action: receipt.action, status: "COMMITTED", completedAt: receipt.completedAt, result: receipt.result };
      });
    }
  }; return Object.freeze(service);
}
