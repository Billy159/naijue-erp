import type { FastifyPluginAsync } from "fastify";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { InventoryLedgerQueryDependencies } from "../../../packages/application/src/inventory-ledger-query-contracts.ts";
import { createInventoryLedgerQueryService } from "../../../packages/application/src/inventory-ledger-query-service.ts";
import { checkedInventoryActor } from "../../../packages/application/src/inventory-query-service.ts";
import { invalidInventoryLedgerQuery } from "../../../packages/application/src/inventory-ledger-query-validation.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import type { InventoryAuthenticationInput } from "./inventory-http.ts";

export interface InventoryLedgerQueryHttpOptions {
  /** Existing trusted session/identity and Origin/CSRF provider; no request-selected actor or scope. */
  readonly authenticate: (input: InventoryAuthenticationInput) => Promise<ActorContext | null>;
  readonly dependencies: InventoryLedgerQueryDependencies;
}
/** Separate opt-in read-only plugin. Never registered here and never creates a server listener or pool. */
export function createInventoryLedgerQueryHttpPlugin(options: InventoryLedgerQueryHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Inventory ledger HTTP requires explicit trusted authentication");
  const authenticate = options.authenticate; const service = createInventoryLedgerQueryService(options.dependencies);
  return async function inventoryLedgerQueryHttp(app) {
    const actors = new WeakMap<object, ActorContext>();
    const reads = new WeakMap<object, { readonly controller: AbortController; readonly cleanup: () => void }>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      const controller = new AbortController(); const aborted = () => controller.abort(); const closed = () => { if (!reply.raw.writableFinished) controller.abort(); };
      request.raw.once("aborted", aborted); reply.raw.once("close", closed);
      reads.set(request, { controller, cleanup: () => { request.raw.off("aborted", aborted); reply.raw.off("close", closed); } });
      let actor: ActorContext | null;
      try { actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch { throw new Error("Trusted inventory ledger authentication failed"); }
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      actors.set(request, checkedInventoryActor(actor));
    });
    app.addHook("onResponse", async request => { reads.get(request)?.cleanup(); reads.delete(request); actors.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof DomainError) {
        const statuses: Readonly<Record<string, number>> = { INVALID_INVENTORY_LEDGER_QUERY: 400, FORBIDDEN: 403, SKU_NOT_FOUND: 404, INVENTORY_NOT_READY: 503, INVENTORY_READ_ABORTED: 408 };
        const status = Object.hasOwn(statuses, error.code) ? statuses[error.code] : undefined;
        if (status !== undefined) return reply.code(status).send({ error: { code: error.code, message: status === 403 ? "Access denied" : "Inventory ledger read rejected" } });
      }
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The inventory ledger read could not be completed" } });
    });
    app.post("/inventory/ledger/query", { bodyLimit: 65_536 }, async (request, reply) => {
      if (!request.query || typeof request.query !== "object" || Array.isArray(request.query) || Object.keys(request.query).length) invalidInventoryLedgerQuery();
      if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      const actor = actors.get(request); const state = reads.get(request); if (!actor || !state) throw new Error("Missing trusted inventory ledger request context");
      const snapshot = await service.readLedger(actor, request.body, state.controller.signal);
      return reply.header("X-Inventory-Read-Reference", snapshot.readReference).header("X-Inventory-Readiness", snapshot.readiness).send(snapshot.data);
    });
  };
}
