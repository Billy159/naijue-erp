import type { ActorContext } from "./ports.ts";
import type { SalesListQuery, SalesQueryDependencies, SalesReadIntent, SalesScopedRead } from "./sales-query-ports.ts";
import { entityId } from "../../domain/src/values.ts";
import { parseSalesFilterReferenceQuery } from "./sales-reference-query-validation.ts";
import { activeSalesRead, checkedSalesReadScope, parseSalesDetailQuery, parseSalesHistoryQuery, parseSalesListQuery } from "./sales-query-validation.ts";

function checkedActor(actor: ActorContext): ActorContext {
  try {
    if (!actor || !Object.hasOwn(actor, "hallId")) throw new Error("Missing hall fact");
    return Object.freeze({ accountId: entityId("account", actor.accountId), hallId: actor.hallId === null ? null : entityId("hall", actor.hallId) });
  } catch { throw new Error("Invalid trusted sales actor"); }
}
export function createSalesQueryService(dependencies: SalesQueryDependencies) {
  if (typeof dependencies?.authorization?.authorize !== "function" || typeof dependencies?.reader?.readList !== "function"
    || typeof dependencies?.reader?.readDetail !== "function" || typeof dependencies?.reader?.readHistory !== "function"
    || typeof dependencies?.reader?.readSettlementStatistics !== "function" || typeof dependencies?.reader?.readReferences !== "function") throw new TypeError("Sales queries require explicit trusted authorization and snapshot reader providers");
  const authorize = dependencies.authorization.authorize.bind(dependencies.authorization);
  const reader = dependencies.reader;
  async function read<P, R>(actor: ActorContext, parameters: P, intent: SalesReadIntent, signal: AbortSignal, work: (read: SalesScopedRead<P>) => Promise<R>): Promise<R> {
    // Immutable copies are captured before the first await, so pending policy work cannot change the executed query.
    const trustedActor = checkedActor(actor); activeSalesRead(signal);
    const scope = checkedSalesReadScope(await authorize(trustedActor, Object.freeze(intent), signal));
    activeSalesRead(signal);
    const result = await work(Object.freeze({ actor: trustedActor, scope, parameters, signal }));
    activeSalesRead(signal); return result;
  }
  return Object.freeze({
    readReferences(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseSalesFilterReferenceQuery(input);
      // A filter-candidate read is a projection of readable sales, not permission to enumerate
      // master data. Current authorization runs with a neutral list intent on every invocation.
      const list: SalesListQuery = Object.freeze({ page: 1, pageSize: 20, filter: Object.freeze({ startDate: null, endDate: null,
        status: null, businessType: null, hallId: null, salespersonId: null, customerId: null, warehouseId: null, number: null }) });
      return read(actor, parameters, { kind: "list", parameters: list }, signal, reader.readReferences.bind(reader));
    },
    readList(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseSalesListQuery(input);
      return read(actor, parameters, { kind: "list", parameters }, signal, reader.readList.bind(reader));
    },
    readDetail(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseSalesDetailQuery(input);
      return read(actor, parameters, { kind: "detail", parameters }, signal, reader.readDetail.bind(reader));
    },
    readHistory(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseSalesHistoryQuery(input);
      return read(actor, parameters, { kind: "history", parameters }, signal, reader.readHistory.bind(reader));
    },
    readSettlementStatistics(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseSalesListQuery(input);
      return read(actor, parameters, { kind: "settlement-statistics", parameters }, signal, reader.readSettlementStatistics.bind(reader));
    }
  });
}
