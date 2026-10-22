import type { FastifyPluginAsync } from "fastify";
import type { ProductQueryAuthenticationInput } from "./product-query-http.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { ProductMaintenanceDependencies } from "../../../packages/application/src/product-maintenance-ports.ts";
import { createProductMaintenanceService } from "../../../packages/application/src/product-maintenance-service.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { assertNoQuery } from "./input.ts";
export interface ProductMaintenanceHttpOptions {
  readonly authenticate: (input: ProductQueryAuthenticationInput) => Promise<ActorContext | null>;
  readonly dependencies: ProductMaintenanceDependencies;
}
/** New C01-approved commands only; preserves existing detail read routes and DTO v1. */
export function createProductMaintenanceHttpPlugin(options: ProductMaintenanceHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Product maintenance requires trusted authentication");
  const authenticate = options.authenticate, service = createProductMaintenanceService(options.dependencies);
  return async app => {
    const actors = new WeakMap<object, ActorContext>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      let actor: ActorContext | null;
      try { actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch { throw Error("Product authentication failed"); }
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }); actors.set(request, actor);
    });
    app.addHook("onResponse", async request => { actors.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof DomainError) {
        const bad = ["INVALID_PRODUCT_MAINTENANCE", "INVALID_PRODUCT_QUERY", "INVALID_PARTY_INPUT", "INVALID_ID", "INVALID_HTTP_INPUT", "INVALID_REQUEST", "INCOMPLETE_CATALOGUE_PRICE_INPUT", "INVALID_CATALOGUE_PRICE_INPUT", "MONEY_PRECISION", "MONEY_OVERFLOW", "PRODUCT_SCHEME_REQUIRED", "PRODUCT_REQUIRED_FIELDS", "PRODUCT_SPEC_REQUIRED"];
        const conflict = ["VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "PRODUCT_DELETED", "VERSION_STORAGE_OVERFLOW", "INVALID_PRODUCT_STATE", "IMMUTABLE_PRODUCT_CODE", "IMMUTABLE_SKU_IDENTITY", "IMMUTABLE_BARCODE_IDENTITY", "PRODUCT_SPEC_CONFLICT", "PRODUCT_CODE_CONFLICT", "BARCODE_CONFLICT", "PRODUCT_REFERENCE_UNAVAILABLE", "PRODUCT_SIZE_GROUP_MISMATCH", "PRODUCT_IN_USE", "NO_PRODUCT_CHANGE", "PRODUCT_SPEC_NOT_FOUND", "PRODUCT_EDIT_CONTRACT_UPGRADE_REQUIRED", "PRODUCT_SEASON_UNKNOWN_RESET"];
        const status = bad.includes(error.code) ? 400 : error.code === "FORBIDDEN" ? 403 : ["PRODUCT_NOT_FOUND", "RECEIPT_NOT_FOUND"].includes(error.code) ? 404
          : conflict.includes(error.code) ? 409 : error.code === "PRODUCT_MAINTENANCE_TOO_LARGE" ? 413 : ["PRODUCT_DELETE_NOT_READY", "MAINTENANCE_PREPARE_NOT_READY", "PRODUCT_SEASON_NOT_READY"].includes(error.code) ? 503 : undefined;
        if (status !== undefined) return reply.code(status).send({ error: { code: error.code, message: status === 403 ? "Access denied" : "Product maintenance rejected" } });
      }
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Product maintenance could not be completed; recover with original request key" } });
    });
    const actor = (request: object) => { const value = actors.get(request); if (!value) throw Error("Missing product actor"); return value; };
    app.post("/products/commands", { bodyLimit: 1_048_576 }, async (request, reply) => {
      assertNoQuery(request.query);
      if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return service.execute(actor(request), request.body);
    });
    app.post("/products/maintenance/detail/query", { bodyLimit: 8192 }, async (request, reply) => {
      assertNoQuery(request.query);
      if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return service.detail(actor(request), request.body);
    });
    app.post("/products/v2/commands", { bodyLimit: 1_048_576 }, async (request, reply) => {
      assertNoQuery(request.query);
      if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return service.executeV2(actor(request), request.body);
    });
    app.post("/products/maintenance/v2/detail/query", { bodyLimit: 8192 }, async (request, reply) => {
      assertNoQuery(request.query);
      if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return service.detailV2(actor(request), request.body);
    });
    app.post("/products/maintenance/candidates/query", { bodyLimit: 8192 }, async (request, reply) => {
      assertNoQuery(request.query);
      if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return service.candidates(actor(request), request.body);
    });
    app.get<{ Params: { requestKey: string } }>("/products/receipts/:requestKey", async request => { assertNoQuery(request.query); return service.receipt(actor(request), request.params.requestKey); });
  };
}
