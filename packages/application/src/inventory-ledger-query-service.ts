import { DomainError } from "../../domain/src/errors.ts";
import type { ActorContext } from "./ports.ts";
import type { InventoryQuery } from "./inventory-query-contracts.ts";
import { checkedInventoryActor } from "./inventory-query-service.ts";
import { checkedInventoryScope } from "./inventory-query-validation.ts";
import type { InventoryLedgerQueryDependencies } from "./inventory-ledger-query-contracts.ts";
import { activeInventoryLedgerRead, checkedInventoryLedgerSnapshot, parseInventoryLedgerQuery } from "./inventory-ledger-query-validation.ts";

export function createInventoryLedgerQueryService(dependencies: InventoryLedgerQueryDependencies) {
  if (typeof dependencies?.authorization?.authorize !== "function" || typeof dependencies?.reader?.readLedger !== "function") {
    throw new TypeError("Inventory ledger queries require explicit trusted inventory authorization and snapshot reader providers");
  }
  const authorize = dependencies.authorization.authorize.bind(dependencies.authorization); const readLedger = dependencies.reader.readLedger.bind(dependencies.reader);
  return Object.freeze({ async readLedger(actor: ActorContext, input: unknown, signal: AbortSignal) {
    const trustedActor = checkedInventoryActor(actor); const parameters = parseInventoryLedgerQuery(input); activeInventoryLedgerRead(signal);
    const inventory: InventoryQuery = Object.freeze({ page: 1, pageSize: 100, filter: Object.freeze({ productIds: Object.freeze([]), categoryIds: Object.freeze([]),
      warehouseIds: Object.freeze([parameters.warehouseId]), supplierIds: Object.freeze([]), fitIds: Object.freeze([]), seasonIds: Object.freeze([]) }) });
    const supplied = checkedInventoryScope(await authorize(trustedActor, Object.freeze({ kind: "inventory", parameters: inventory }), signal)); activeInventoryLedgerRead(signal);
    const warehouse = supplied.warehouses.find(item => item.id === parameters.warehouseId);
    if (!warehouse) throw new DomainError("FORBIDDEN", "Requested warehouse is outside authorized inventory scope");
    const scope = checkedInventoryScope({ hallIds: [warehouse.hallId], warehouses: [warehouse] });
    const result = await readLedger(Object.freeze({ actor: trustedActor, scope, parameters, signal })); activeInventoryLedgerRead(signal);
    return checkedInventoryLedgerSnapshot(result, parameters, scope);
  } });
}
