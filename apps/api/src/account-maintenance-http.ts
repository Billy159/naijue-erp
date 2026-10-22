import type { FastifyPluginAsync } from "fastify";
import type { ProductQueryAuthenticationInput } from "./product-query-http.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { AccountMaintenanceDependencies } from "../../../packages/application/src/account-maintenance-ports.ts";
import { createAccountMaintenanceService } from "../../../packages/application/src/account-maintenance-service.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { assertNoQuery } from "./input.ts";
export interface AccountMaintenanceHttpOptions { readonly authenticate: (input: ProductQueryAuthenticationInput) => Promise<ActorContext | null>; readonly dependencies: AccountMaintenanceDependencies }
export function createAccountMaintenanceHttpPlugin(options: AccountMaintenanceHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Account writes require trusted authentication"); const authenticate = options.authenticate, service = createAccountMaintenanceService(options.dependencies);
  return async app => {
    const actors = new WeakMap<object, ActorContext>();
    app.addHook("onRequest", async (request, reply) => { reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      const actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); if (!actor) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }); actors.set(request, actor);
    });
    app.addHook("onResponse", async request => { actors.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof DomainError) {
        const status = ["INVALID_ACCOUNT_COMMAND", "INVALID_ACCOUNT_PASSWORD", "INVALID_PARTY_INPUT", "INVALID_ID", "INVALID_HTTP_INPUT", "INVALID_REQUEST"].includes(error.code) ? 400 : error.code === "FORBIDDEN" ? 403
          : ["ACCOUNT_NOT_FOUND", "RECEIPT_NOT_FOUND"].includes(error.code) ? 404 : ["VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "VERSION_STORAGE_OVERFLOW", "NO_ACCOUNT_CHANGE", "INVALID_ACCOUNT_STATE", "ACCOUNT_REFERENCE_UNAVAILABLE", "LAST_AVAILABLE_ADMIN", "ACCOUNT_LOGIN_CONFLICT"].includes(error.code) ? 409 : error.code === "ACCOUNT_CREDENTIALS_NOT_READY" ? 503 : undefined;
        if (status !== undefined) return reply.code(status).send({ error: { code: error.code, message: status === 403 ? "Access denied" : "Account maintenance rejected" } });
      }
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Account maintenance could not be completed; recover with original request key" } });
    });
    const actor = (request: object) => { const a = actors.get(request); if (!a) throw Error("Missing account actor"); return a; };
    app.post("/accounts/commands", { bodyLimit: 8192 }, async (request, reply) => { assertNoQuery(request.query); if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } }); return service.execute(actor(request), request.body); });
    app.get<{ Params: { requestKey: string } }>("/accounts/receipts/:requestKey", async request => { assertNoQuery(request.query); return service.receipt(actor(request), request.params.requestKey); });
  };
}
