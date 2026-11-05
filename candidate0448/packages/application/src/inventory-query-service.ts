import type { ActorContext } from "./ports.ts";
import { DomainError } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import type { InventoryCandidateQuery, InventoryQuery, InventoryQueryDependencies, InventoryReadIntent, InventoryReadScope } from "./inventory-query-contracts.ts";
import { checkedCandidateSnapshot, checkedInventorySnapshot, checkedInventoryOutputFrames } from "./inventory-query-response.ts";
import { checkedInventoryScope, parseInventoryCandidateQuery, parseInventoryQuery, parseInventoryOutputQuery } from "./inventory-query-validation.ts";

export function checkedInventoryActor(actor: ActorContext): ActorContext {
  try {
    if (!actor || !Object.hasOwn(actor, "hallId")) throw new Error("Missing hall fact");
    return Object.freeze({ accountId: entityId("account", actor.accountId), hallId: actor.hallId === null ? null : entityId("hall", actor.hallId) });
  } catch { throw new Error("Invalid trusted inventory actor"); }
}
function active(signal: AbortSignal): void {
  if (signal.aborted) throw new DomainError("INVENTORY_READ_ABORTED", "Inventory read no longer active");
}
export function createInventoryQueryService(dependencies: InventoryQueryDependencies) {
  if (typeof dependencies?.authorization?.authorize !== "function" || typeof dependencies?.reader?.readInventory !== "function"
    || typeof dependencies?.reader?.readCandidates !== "function") {
    throw new TypeError("Inventory queries require explicit trusted authorization and snapshot reader providers");
  }
  // Capture explicit providers. No runtime fixture, role default or catalog preload is installed here.
  const authorize = dependencies.authorization.authorize.bind(dependencies.authorization);
  const readInventory = dependencies.reader.readInventory.bind(dependencies.reader);
  const readCandidates = dependencies.reader.readCandidates.bind(dependencies.reader);
  const readOutput = dependencies.reader.readInventoryOutput?.bind(dependencies.reader);
  async function scopeFor(actor: ActorContext, intent: InventoryReadIntent, signal: AbortSignal): Promise<InventoryReadScope> {
    active(signal);
    const scope = checkedInventoryScope(await authorize(actor, Object.freeze(intent), signal));
    active(signal);
    return scope;
  }
  return Object.freeze({
    async *readOutput(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const trustedActor = checkedInventoryActor(actor), parameters = parseInventoryOutputQuery(input);
      let scope = await scopeFor(trustedActor, { kind: "inventory", parameters }, signal);
      if (parameters.filter.warehouseIds.some(id => !scope.warehouses.some(w => w.id === id))) throw new DomainError("FORBIDDEN", "Requested output warehouse is outside authorized scope");
      if (parameters.filter.warehouseIds.length) scope = Object.freeze({ hallIds: scope.hallIds, warehouses: Object.freeze(scope.warehouses.filter(w => parameters.filter.warehouseIds.includes(w.id))) });
      if (!readOutput) throw new DomainError("INVENTORY_NOT_READY", "Complete inventory output provider is unavailable");
      for await (const frame of checkedInventoryOutputFrames(readOutput(Object.freeze({ actor: trustedActor, scope, parameters, signal })), parameters, scope)) { active(signal); yield frame; active(signal); }
    },
    async readInventory(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const trustedActor = checkedInventoryActor(actor); const parameters: InventoryQuery = parseInventoryQuery(input);
      let scope = await scopeFor(trustedActor, { kind: "inventory", parameters }, signal);
      if (parameters.filter.warehouseIds.some(id => !scope.warehouses.some(warehouse => warehouse.id === id))) {
        throw new DomainError("FORBIDDEN", "Requested warehouse is outside authorized scope");
      }
      if (parameters.filter.warehouseIds.length) scope = Object.freeze({ hallIds: scope.hallIds,
        warehouses: Object.freeze(scope.warehouses.filter(warehouse => parameters.filter.warehouseIds.includes(warehouse.id))) });
      const response = await readInventory(Object.freeze({ actor: trustedActor, scope, parameters, signal }));
      active(signal);
      return checkedInventorySnapshot(response, parameters, scope);
    },
    async readCandidates(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const trustedActor = checkedInventoryActor(actor); const parameters: InventoryCandidateQuery = parseInventoryCandidateQuery(input);
      const scope = await scopeFor(trustedActor, { kind: "candidates", parameters }, signal);
      if (parameters.kind === "warehouse" && parameters.selectedIds.some(id => !scope.warehouses.some(warehouse => warehouse.id === id))) {
        throw new DomainError("FORBIDDEN", "Selected warehouse is outside authorized scope");
      }
      const response = await readCandidates(Object.freeze({ actor: trustedActor, scope, parameters, signal }));
      active(signal);
      return checkedCandidateSnapshot(response, parameters, scope);
    }
  });
}
