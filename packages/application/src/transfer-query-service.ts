import { entityId } from "../../domain/src/values.ts";
import { requireDomain } from "../../domain/src/errors.ts";
import type { TransferActor } from "./transfer-ports.ts";
import type { TransferQueryAuthorization, TransferQueryDependencies, TransferReadIntent, TransferScopedRead } from "./transfer-query-ports.ts";
import { activeTransferRead, checkedTransferReadScope, parseTransferDetailQuery, parseTransferHistoryQuery, parseTransferListQuery, parseTransferWarehouseQuery } from "./transfer-query-validation.ts";

function checkedActor(actor: TransferActor): TransferActor {
  try {
    if (!actor || !Object.hasOwn(actor, "hallId") || !["ADMIN", "WAREHOUSE", "SALESPERSON"].includes(actor.role)) throw new Error("Missing actor fact");
    return Object.freeze({ accountId: entityId("account", actor.accountId), hallId: actor.hallId === null ? null : entityId("hall", actor.hallId), role: actor.role });
  } catch { throw new Error("Invalid trusted transfer actor"); }
}
/** Explicit opt-in source policy, not a default grant. Reads do not imply write/action permission. */
export function createSourceConfirmedTransferQueryAuthorization(): TransferQueryAuthorization {
  return { async authorize(actor, _intent, signal) {
    const trusted = checkedActor(actor); activeTransferRead(signal);
    if (trusted.role !== "SALESPERSON") return { kind: "all" };
    requireDomain(trusted.hallId !== null, "FORBIDDEN", "Salesperson requires an authoritative current hall");
    return { kind: "restricted", clauses: [{ fromHallId: trusted.hallId }, { toHallId: trusted.hallId },
      { createdHallId: trusted.hallId, createdRole: "SALESPERSON" }] };
  } };
}
export function createTransferQueryService(dependencies: TransferQueryDependencies) {
  if (typeof dependencies?.authorization?.authorize !== "function" || typeof dependencies?.reader?.readList !== "function"
    || typeof dependencies?.reader?.readDetail !== "function" || typeof dependencies?.reader?.readWarehouses !== "function") throw new TypeError("Transfer queries require explicit trusted authorization and snapshot reader providers");
  const authorize = dependencies.authorization.authorize.bind(dependencies.authorization); const reader = dependencies.reader;
  const history = reader.readHistory?.bind(reader);
  async function read<P, R>(actor: TransferActor, parameters: P, intent: TransferReadIntent, signal: AbortSignal, work: (read: TransferScopedRead<P>) => Promise<R>): Promise<R> {
    const trustedActor = checkedActor(actor); activeTransferRead(signal);
    const scope = checkedTransferReadScope(await authorize(trustedActor, Object.freeze(intent), signal)); activeTransferRead(signal);
    const result = await work(Object.freeze({ actor: trustedActor, scope, parameters, signal })); activeTransferRead(signal); return result;
  }
  return Object.freeze({
    readList(actor: TransferActor, input: unknown, signal: AbortSignal) {
      const parameters = parseTransferListQuery(input); return read(actor, parameters, { kind: "list", parameters }, signal, reader.readList.bind(reader));
    },
    readWarehouses(actor: TransferActor, input: unknown, signal: AbortSignal) {
      const parameters = parseTransferWarehouseQuery(input); return read(actor, parameters, { kind: "warehouses", parameters }, signal, reader.readWarehouses.bind(reader));
    },
    readHistory(actor: TransferActor, input: unknown, signal: AbortSignal) {
      const parameters = parseTransferHistoryQuery(input);
      return read(actor, parameters, { kind: "history", parameters }, signal, scoped => {
        requireDomain(history !== undefined, "TRANSFER_HISTORY_UNAVAILABLE", "Explicit operation history reader required");
        return history(scoped);
      });
    },
    readDetail(actor: TransferActor, input: unknown, signal: AbortSignal) {
      const parameters = parseTransferDetailQuery(input); return read(actor, parameters, { kind: "detail", parameters }, signal, reader.readDetail.bind(reader));
    }
  });
}
