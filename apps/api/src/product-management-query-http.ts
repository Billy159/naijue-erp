import type { IncomingHttpHeaders } from "node:http";
import type { FastifyPluginAsync } from "fastify";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { ProductManagementQueryDependencies } from "../../../packages/application/src/product-management-query-ports.ts";
import { createProductManagementQueryService } from "../../../packages/application/src/product-management-query-service.ts";
import { invalidProductManagementQuery } from "../../../packages/application/src/product-management-query-validation.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";

export interface ProductManagementQueryAuthenticationInput {
  readonly headers: Readonly<IncomingHttpHeaders>; readonly ip: string; readonly method: string; readonly url: string;
}
export interface ProductManagementQueryHttpOptions {
  /** Required current trusted session callback, including the host's POST Origin enforcement. */
  readonly authenticate: (input: ProductManagementQueryAuthenticationInput) => Promise<ActorContext | null>;
  readonly dependencies: ProductManagementQueryDependencies;
}
/** Two genuine read endpoints. Does not create a listener, role policy, database or route registration. */
export function createProductManagementQueryHttpPlugin(options: ProductManagementQueryHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Product management HTTP requires explicit trusted authentication");
  const authenticate = options.authenticate, service = createProductManagementQueryService(options.dependencies);
  return async function productManagementQueryHttp(app) {
    const actors = new WeakMap<object, ActorContext>();
    const reads = new WeakMap<object, { readonly controller: AbortController; readonly cleanup: () => void }>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      const controller = new AbortController(), aborted = () => controller.abort(), closed = () => { if (!reply.raw.writableFinished) controller.abort(); };
      request.raw.once("aborted", aborted); reply.raw.once("close", closed);
      reads.set(request, { controller, cleanup: () => { request.raw.off("aborted", aborted); reply.raw.off("close", closed); } });
      let actor: ActorContext | null;
      try { actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch { throw new Error("Trusted product management authentication failed"); }
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      actors.set(request, actor);
    });
    app.addHook("onResponse", async request => { reads.get(request)?.cleanup(); reads.delete(request); actors.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof DomainError) {
        const statuses: Readonly<Record<string, number>> = { INVALID_PRODUCT_MANAGEMENT_QUERY: 400, FORBIDDEN: 403,
          PRODUCT_MANAGEMENT_READ_TOO_LARGE: 413, PRODUCT_MANAGEMENT_READ_ABORTED: 408, PRODUCT_MANAGEMENT_STOCK_NOT_READY: 503 };
        const status = Object.hasOwn(statuses, error.code) ? statuses[error.code] : undefined;
        if (status !== undefined) return reply.code(status).send({ error: { code: error.code,
          message: status === 403 ? "Access denied" : status === 503 ? "Complete stock scope is unavailable" : "Product management read rejected" } });
      }
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The product management read could not be completed" } });
    });
    for (const [url, read] of [["/product-management/query", service.readList], ["/product-management/candidates/query", service.readCandidates]] as const) {
      app.post(url, { bodyLimit: 65_536 }, async (request, reply) => {
        if (!request.query || typeof request.query !== "object" || Array.isArray(request.query) || Object.keys(request.query).length) invalidProductManagementQuery();
        if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
        const actor = actors.get(request), state = reads.get(request); if (!actor || !state) throw new Error("Missing trusted product management context");
        return reply.type("application/json").send(await read(actor, request.body, state.controller.signal));
      });
    }
  };
}
