import type { IncomingHttpHeaders } from "node:http";
import type { FastifyPluginAsync } from "fastify";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { InventoryQueryDependencies } from "../../../packages/application/src/inventory-query-contracts.ts";
import { checkedInventoryActor, createInventoryQueryService } from "../../../packages/application/src/inventory-query-service.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { rejectInventoryInput } from "../../../packages/application/src/inventory-query-validation.ts";

export interface InventoryAuthenticationInput {
  readonly headers: Readonly<IncomingHttpHeaders>; readonly ip: string; readonly method: string; readonly url: string;
}
export interface InventoryHttpOptions {
  /** Must resolve current server identity/session and enforce trusted Origin for these POST reads,
   * including cookie CSRF protections. Read-only does not exempt this route. Structurally compatible
   * with SalesAuthenticationInput/createSalesSessionAuthenticator. No client actor/role/default admin. */
  readonly authenticate: (input: InventoryAuthenticationInput) => Promise<ActorContext | null>;
  readonly dependencies: InventoryQueryDependencies;
}
/** Encapsulated read-only routes. POST carries structured filters, but does not mutate inventory or other business state.
 * Response bodies match apps/web/src/inventory/contracts.ts. Snapshot readiness/reference are also exposed as headers.
 * This plugin never listens, connects to PG, enables CORS, invents covered balances or chooses a synthetic fallback.
 */
export function createInventoryHttpPlugin(options: InventoryHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Inventory HTTP requires explicit trusted authentication");
  const authenticate = options.authenticate;
  const service = createInventoryQueryService(options.dependencies);
  return async function inventoryHttp(app) {
    const actors = new WeakMap<object, ActorContext>();
    const reads = new WeakMap<object, { controller: AbortController; cleanup: () => void }>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      const controller = new AbortController();
      const aborted = () => controller.abort();
      const closed = () => { if (!reply.raw.writableFinished) controller.abort(); };
      request.raw.once("aborted", aborted); reply.raw.once("close", closed);
      reads.set(request, { controller, cleanup: () => { request.raw.off("aborted", aborted); reply.raw.off("close", closed); } });
      let actor: ActorContext | null;
      try { actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch { throw new Error("Trusted inventory authentication failed"); }
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      actors.set(request, checkedInventoryActor(actor));
    });
    app.addHook("onResponse", async request => { reads.get(request)?.cleanup(); reads.delete(request); actors.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof DomainError) {
        if (error.code === "INVALID_INVENTORY_INPUT") return reply.code(400).send({ error: { code: error.code, message: "Inventory read parameters rejected" } });
        if (error.code === "FORBIDDEN") return reply.code(403).send({ error: { code: error.code, message: "Access denied" } });
        if (error.code === "INVENTORY_NOT_READY") return reply.code(503).send({ error: { code: error.code, message: "Inventory facts are not ready for this read" } });
        if (error.code === "INVENTORY_READ_ABORTED") return reply.code(408).send({ error: { code: error.code, message: "Inventory read is no longer active" } });
      }
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      // Unknown response/storage/authentication failures are never empty successful pages or leaked diagnostics.
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The inventory read could not be completed" } });
    });
    for (const [url, read] of [["/inventory/query", service.readInventory], ["/inventory/candidates/query", service.readCandidates]] as const) {
      app.post(url, { bodyLimit: 65_536 }, async (request, reply) => {
        if (!request.query || typeof request.query !== "object" || Array.isArray(request.query) || Object.keys(request.query).length) rejectInventoryInput();
        if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
          return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
        }
        const actor = actors.get(request); const state = reads.get(request);
        if (!actor || !state) throw new Error("Missing trusted inventory request context");
        const snapshot = await read(actor, request.body, state.controller.signal);
        return reply.header("X-Inventory-Read-Reference", snapshot.readReference)
          .header("X-Inventory-Readiness", snapshot.readiness).send(snapshot.data);
      });
    }
  };
}
