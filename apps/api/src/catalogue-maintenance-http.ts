import type { FastifyPluginAsync } from "fastify";
import type { ProductQueryAuthenticationInput } from "./product-query-http.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { CatalogueMaintenanceDependencies } from "../../../packages/application/src/catalogue-maintenance-ports.ts";
import { createCatalogueMaintenanceService } from "../../../packages/application/src/catalogue-maintenance-service.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { assertNoQuery } from "./input.ts";
export interface CatalogueMaintenanceHttpOptions {
  readonly authenticate: (input: ProductQueryAuthenticationInput) => Promise<ActorContext | null>;
  readonly dependencies: CatalogueMaintenanceDependencies;
  /** Fixed trusted-host route selection only; never a write capability or browser option. */
  readonly categoryOnly?: true;
}
export function createCatalogueMaintenanceHttpPlugin(options: CatalogueMaintenanceHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Catalogue writes require trusted authentication");
  if (options.categoryOnly !== undefined && options.categoryOnly !== true) throw new TypeError("Category-only registration must be explicitly true or omitted");
  const categoryOnly = options.categoryOnly === true;
  const service = createCatalogueMaintenanceService(options.dependencies), authenticate = options.authenticate;
  return async app => {
    const actors = new WeakMap<object, ActorContext>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache"); const actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url });
      if (!actor) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }); actors.set(request, actor);
    });
    app.addHook("onResponse", async request => { actors.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof DomainError) {
        const status = ["INVALID_CATALOGUE_COMMAND", "INVALID_PARTY_INPUT", "INVALID_ID", "INVALID_HTTP_INPUT", "INVALID_REQUEST"].includes(error.code) ? 400 : error.code === "FORBIDDEN" ? 403
          : ["CATALOGUE_NOT_FOUND", "RECEIPT_NOT_FOUND"].includes(error.code) ? 404 : ["VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "CATALOGUE_DELETED", "VERSION_STORAGE_OVERFLOW", "INVALID_CATALOGUE_STATE", "NO_CATALOGUE_CHANGE", "CATEGORY_CYCLE", "CATEGORY_DEPTH", "CATALOGUE_NAME_CONFLICT", "CATALOGUE_IN_USE", "CATEGORY_ORDER_CONFLICT", "CATEGORY_UNDO_CONFLICT"].includes(error.code) ? 409 : error.code === "CATALOGUE_ORDER_NOT_READY" ? 503 : undefined;
        if (status !== undefined) return reply.code(status).send({ error: { code: error.code, message: status === 403 ? "Access denied" : "Catalogue maintenance rejected" } });
      }
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Catalogue maintenance could not be completed; recover with original request key" } });
    });
    const routes = categoryOnly ? [["/catalogue/categories", "CATEGORY"]] as const : [["/catalogue/categories", "CATEGORY"], ["/catalogue/colors", "COLOR"], ["/catalogue/fits", "FIT"]] as const;
    for (const [prefix, kind] of routes) {
      const actor = (request: object) => { const a = actors.get(request); if (!a) throw Error("Missing catalogue actor"); return a; };
      app.post(`${prefix}/commands`, { bodyLimit: kind === "CATEGORY" ? 1_048_576 : 8192 }, async (request, reply) => { assertNoQuery(request.query);
        if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
        return service.execute(actor(request), kind, request.body);
      });
      app.get<{ Params: { requestKey: string } }>(`${prefix}/receipts/:requestKey`, async request => { assertNoQuery(request.query); return service.receipt(actor(request), kind, request.params.requestKey); });
    }
  };
}
