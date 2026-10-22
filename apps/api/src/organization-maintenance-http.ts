import type { FastifyPluginAsync } from "fastify";
import type { ProductQueryAuthenticationInput } from "./product-query-http.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { OrganizationMaintenanceKind, OrganizationReadUnitOfWork, OrganizationWriteDependencies } from "../../../packages/application/src/organization-maintenance-ports.ts";
import { createOrganizationMaintenanceReadService, createOrganizationMaintenanceService } from "../../../packages/application/src/organization-maintenance-service.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { assertNoQuery } from "./input.ts";
export interface OrganizationMaintenanceReadHttpOptions {
  readonly authenticate: (input: ProductQueryAuthenticationInput) => Promise<ActorContext | null>;
  readonly unitOfWork: OrganizationReadUnitOfWork;
}
export interface OrganizationMaintenanceHttpOptions {
  readonly authenticate: (input: ProductQueryAuthenticationInput) => Promise<ActorContext | null>;
  readonly dependencies: OrganizationWriteDependencies;
}
/** Hall/warehouse command plugin composes alongside the existing six-family reads. */
export function createOrganizationMaintenanceHttpPlugin(options: OrganizationMaintenanceHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Organization writes require trusted authentication");
  const service = createOrganizationMaintenanceService(options.dependencies), authenticate = options.authenticate;
  return async app => {
    const actors = new WeakMap<object, ActorContext>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      const actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url });
      if (!actor) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }); actors.set(request, actor);
    });
    app.addHook("onResponse", async request => { actors.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof DomainError) {
        const status = ["INVALID_ORGANIZATION_COMMAND", "INVALID_PARTY_INPUT", "INVALID_ID", "INVALID_HTTP_INPUT", "INVALID_REQUEST"].includes(error.code) ? 400
          : error.code === "FORBIDDEN" ? 403 : ["ORGANIZATION_NOT_FOUND", "RECEIPT_NOT_FOUND"].includes(error.code) ? 404
          : ["VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "INVALID_ORGANIZATION_STATE", "NO_ORGANIZATION_CHANGE", "VERSION_STORAGE_OVERFLOW", "ORGANIZATION_REFERENCE_UNAVAILABLE", "WAREHOUSE_DEFAULT_IN_USE"].includes(error.code) ? 409 : undefined;
        if (status !== undefined) return reply.code(status).send({ error: { code: error.code, message: status === 403 ? "Access denied" : "Hall/warehouse maintenance rejected" } });
      }
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Hall/warehouse maintenance could not be completed; recover with original request key" } });
    });
    for (const [path, kind] of [["/organization/halls", "HALL"], ["/organization/warehouses", "WAREHOUSE"]] as const) {
      const actor = (request: object) => { const a = actors.get(request); if (!a) throw Error("Missing organization actor"); return a; };
      app.post(`${path}/commands`, { bodyLimit: 8192 }, async (request, reply) => { assertNoQuery(request.query);
        if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
        return service.execute(actor(request), kind, request.body);
      });
      app.get<{ Params: { requestKey: string } }>(`${path}/receipts/:requestKey`, async request => { assertNoQuery(request.query); return service.receipt(actor(request), kind, request.params.requestKey); });
    }
  };
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
