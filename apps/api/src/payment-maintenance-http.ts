import type { FastifyPluginAsync } from "fastify";
import type { ProductQueryAuthenticationInput } from "./product-query-http.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { PaymentMaintenanceDependencies, PaymentMaintenanceKind } from "../../../packages/application/src/payment-maintenance-ports.ts";
import { createPaymentMaintenanceService } from "../../../packages/application/src/payment-maintenance-service.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { assertNoQuery } from "./input.ts";
export interface PaymentMaintenanceHttpOptions {
  readonly authenticate: (input: ProductQueryAuthenticationInput) => Promise<ActorContext | null>;
  readonly dependencies: PaymentMaintenanceDependencies;
}
/** Commands/receipts only; B05 read plugin owns existing list/detail routes. */
export function createPaymentMaintenanceHttpPlugin(options: PaymentMaintenanceHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Payment maintenance requires trusted authentication");
  const service = createPaymentMaintenanceService(options.dependencies), authenticate = options.authenticate;
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
        const status = ["INVALID_PAYMENT_COMMAND", "INVALID_PARTY_INPUT", "INVALID_ID", "INVALID_HTTP_INPUT", "INVALID_REQUEST"].includes(error.code) ? 400 : error.code === "FORBIDDEN" ? 403
          : ["PAYMENT_NOT_FOUND", "RECEIPT_NOT_FOUND"].includes(error.code) ? 404 : error.code === "PAYMENT_RELATION_TOO_LARGE" ? 413
          : ["IDEMPOTENCY_CONFLICT", "VERSION_CONFLICT", "VERSION_STORAGE_OVERFLOW", "IMMUTABLE_PAYMENT_METHOD", "INVALID_PAYMENT_STATE", "NO_PAYMENT_CHANGE", "PAYMENT_METHOD_IN_USE", "PAYMENT_REFERENCE_UNAVAILABLE", "PAYMENT_RELATION_IN_USE"].includes(error.code) ? 409 : undefined;
        if (status !== undefined) return reply.code(status).send({ error: { code: error.code, message: status === 403 ? "Access denied" : "Payment maintenance rejected" } });
      }
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (["FST_ERR_CTP_INVALID_JSON_BODY", "FST_ERR_CTP_EMPTY_JSON_BODY"].includes(code ?? "")) return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Payment maintenance could not be completed; recover with original request key" } });
    });
    const actor = (request: object): ActorContext => { const a = actors.get(request); if (!a) throw Error("Missing payment actor"); return a; };
    for (const [prefix, kind] of [["/payment/methods", "PAYMENT_METHOD"], ["/payment/accounts", "PAYMENT_ACCOUNT"]] as const satisfies readonly (readonly [string, PaymentMaintenanceKind])[]) {
      app.post(`${prefix}/commands`, { bodyLimit: 1_048_576 }, async (request, reply) => {
        assertNoQuery(request.query);
        if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
        return service.execute(actor(request), kind, request.body);
      });
      app.get<{ Params: { requestKey: string } }>(`${prefix}/receipts/:requestKey`, async request => { assertNoQuery(request.query); return service.receipt(actor(request), kind, request.params.requestKey); });
    }
  };
}
