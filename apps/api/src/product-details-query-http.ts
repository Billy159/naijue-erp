import type { FastifyPluginAsync } from "fastify";
import type { ProductQueryAuthenticationInput } from "./product-query-http.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { ProductDetailsQueryDependencies } from "../../../packages/application/src/product-details-query-ports.ts";
import { createProductDetailsQueryService } from "../../../packages/application/src/product-details-query-service.ts";
import { invalidProductDetailsQuery } from "../../../packages/application/src/product-details-query-validation.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";

export interface ProductDetailsQueryHttpOptions {
  readonly authenticate: (input: ProductQueryAuthenticationInput) => Promise<ActorContext | null>;
  readonly dependencies: ProductDetailsQueryDependencies;
}
/** Complements the existing basics/specifications/images plugin; never registers its routes twice. */
export function createProductDetailsQueryHttpPlugin(options: ProductDetailsQueryHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Product details require trusted authentication");
  const authenticate = options.authenticate, service = createProductDetailsQueryService(options.dependencies);
  return async app => {
    const contexts = new WeakMap<object, { actor: ActorContext | null; controller: AbortController; cleanup(): void }>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      const controller = new AbortController(), abort = () => controller.abort(), close = () => { if (!reply.raw.writableFinished) controller.abort(); };
      request.raw.once("aborted", abort); reply.raw.once("close", close);
      const state = { actor: null as ActorContext | null, controller, cleanup() { request.raw.off("aborted", abort); reply.raw.off("close", close); } };
      contexts.set(request, state);
      let actor: ActorContext | null;
      try { actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch { throw Error("Trusted product details authentication failed"); }
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      state.actor = actor;
    });
    app.addHook("onResponse", async request => { contexts.get(request)?.cleanup(); contexts.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      const statuses: Readonly<Record<string, number>> = { INVALID_PRODUCT_QUERY: 400, INVALID_PRODUCT_DETAILS_QUERY: 400,
        FORBIDDEN: 403, PRODUCT_READ_ABORTED: 408, PRODUCT_STOCK_NOT_READY: 503, INVENTORY_NOT_READY: 503,
        INVALID_PRODUCT_STOCK_OVERVIEW_DATA: 503 };
      if (_request.url.split("?")[0] === "/products/stock-overview/query" && error instanceof DomainError
        && ["INVENTORY_INTEGRITY_FAILED", "INVENTORY_READ_TOO_LARGE"].includes(error.code))
        return reply.code(503).send({ error: { code: "INVENTORY_NOT_READY", message: "Product stock overview is unavailable" } });
      if (error instanceof DomainError && Object.hasOwn(statuses, error.code)) return reply.code(statuses[error.code]!).send({ error: {
        code: error.code, message: error.code === "FORBIDDEN" ? "Access denied" : "Product details read rejected" } });
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The product details read could not be completed" } });
    });
    for (const [url, read] of [["/products/prices/query", service.readPrices], ["/products/barcodes/query", service.readBarcodes], ["/products/stock/query", service.readStock], ["/products/stock-overview/query", service.readStockOverview]] as const) {
      app.post(url, { bodyLimit: 8192 }, async (request, reply) => {
        if (!request.query || typeof request.query !== "object" || Reflect.ownKeys(request.query).length) invalidProductDetailsQuery();
        if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
        const state = contexts.get(request); if (!state?.actor) throw Error("Missing trusted product details context");
        const result = await read(state.actor, request.body, state.controller.signal);
        if (url === "/products/stock-overview/query" && result === null) return reply.code(404).send({ error: { code: "PRODUCT_NOT_FOUND", message: "Product was not found" } });
        return reply.type("application/json").send(result);
      });
    }
  };
}
