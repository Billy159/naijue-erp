import type { FastifyPluginAsync } from "fastify";
import type { ProductQueryAuthenticationInput } from "./product-query-http.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { OrganizationMaintenanceKind, OrganizationReadUnitOfWork } from "../../../packages/application/src/organization-maintenance-ports.ts";
import { createOrganizationMaintenanceReadService } from "../../../packages/application/src/organization-maintenance-service.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { assertNoQuery } from "./input.ts";
export interface OrganizationMaintenanceReadHttpOptions {
  readonly authenticate: (input: ProductQueryAuthenticationInput) => Promise<ActorContext | null>;
  readonly unitOfWork: OrganizationReadUnitOfWork;
}
/** Read slice only. No unimplemented command route returns success. */
export function createOrganizationMaintenanceReadHttpPlugin(options: OrganizationMaintenanceReadHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Settings reads require current authentication");
  const authenticate = options.authenticate, service = createOrganizationMaintenanceReadService(options.unitOfWork);
  const families: readonly (readonly [string, OrganizationMaintenanceKind])[] = [
    ["/organization/halls", "HALL"], ["/organization/warehouses", "WAREHOUSE"], ["/staff", "STAFF"], ["/accounts", "ACCOUNT"], ["/payment/methods", "PAYMENT_METHOD"], ["/payment/accounts", "PAYMENT_ACCOUNT"]
  ];
  return async app => {
    const actors = new WeakMap<object, ActorContext>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      let actor: ActorContext | null;
      try { actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch { throw Error("Trusted settings authentication failed"); }
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }); actors.set(request, actor);
    });
    app.addHook("onResponse", async request => { actors.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof DomainError) {
        const status = ["INVALID_ORGANIZATION_QUERY", "INVALID_HTTP_INPUT", "INVALID_ID"].includes(error.code) ? 400 : error.code === "FORBIDDEN" ? 403 : undefined;
        if (status !== undefined) return reply.code(status).send({ error: { code: error.code, message: status === 403 ? "Access denied" : "Settings read rejected" } });
      }
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Settings could not be read" } });
    });
    for (const [path, kind] of families) for (const operation of ["list", "detail"] as const) {
      app.post(`${path}/${operation === "detail" ? "detail/" : ""}query`, { bodyLimit: 8192 }, async (request, reply) => {
        assertNoQuery(request.query);
        if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
        const actor = actors.get(request); if (!actor) throw Error("Missing current settings actor");
        return operation === "list" ? service.list(actor, kind, request.body) : service.detail(actor, kind, request.body);
      });
    }
  };
}
