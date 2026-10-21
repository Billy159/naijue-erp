import type { IncomingHttpHeaders } from "node:http";
import type { FastifyPluginAsync } from "fastify";
import type { ActorContext, SalesDependencies } from "../../../packages/application/src/ports.ts";
import { createSalesService } from "../../../packages/application/src/sales-service.ts";
import { DomainError, requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { assertNoQuery, parseRequestKey, parseSalesCommand } from "./input.ts";

export interface SalesAuthenticationInput { readonly headers: Readonly<IncomingHttpHeaders>; readonly ip: string; readonly method: string; readonly url: string }
export interface SalesHttpOptions {
  /** Must verify credentials through a trusted server source. Null means unauthenticated. No built-in credential format or demo account. */
  readonly authenticate: (input: SalesAuthenticationInput) => Promise<ActorContext | null>;
  /** Mandatory transaction, authorization/reference scope, economics and identifier providers. No production policy is inferred here. */
  readonly dependencies: SalesDependencies;
}
const statuses: Readonly<Record<string, number>> = {
  INVALID_HTTP_INPUT: 400, INVALID_ID: 400, INVALID_QUANTITY: 400, QUANTITY_OVERFLOW: 422,
  INVALID_MONEY: 400, INVALID_VERSION: 400, INVALID_BUSINESS_DATE: 400,
  FORBIDDEN: 403, DESTINATION_SCOPE_FORBIDDEN: 403, DOCUMENT_NOT_FOUND: 404, RECEIPT_NOT_FOUND: 404,
  VERSION_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409, INVALID_STATE: 409,
  HISTORICAL_POSTING_NOT_IMPLEMENTED: 409, INVENTORY_NOT_READY: 409, MISSING_POSTING_PROVENANCE: 409,
  INVALID_NUMBER: 422, INVALID_BUSINESS_TYPE: 422, INVALID_DISCOUNT: 422, INVALID_LINES: 422,
  INVALID_LINE: 422, INVALID_PRICE: 422, SETTLEMENT_LIMIT: 422, INVALID_SETTLEMENT: 422,
  SETTLEMENT_MISMATCH: 422, INVALID_STOCK_EFFECT: 422, UNKNOWN_PRICING_FACTS: 409,
  PRODUCT_PRICING_UNAVAILABLE: 409, SKU_UNAVAILABLE: 409, INVALID_SALES_QUANTITY: 422,
  INVALID_LINE_DISCOUNT: 422, INVALID_ORDER_DISCOUNT: 422, DISCOUNT_PRICE_MISMATCH: 422,
  INVALID_GIFT_PRICE: 422, ZERO_PRICE_NOT_CONFIRMED: 422, BELOW_MINIMUM_PRICE: 422,
  LINE_AMOUNT_MISMATCH: 422, INVALID_ALLOCATION_ORDER: 422, INDEPENDENT_RETURN_DISCOUNT: 422,
  DISCOUNT_ALLOCATION_MISMATCH: 422, DOCUMENT_AMOUNT_MISMATCH: 422
};
/** Never coerce bigint to a JS number. Current command/receipt responses contain no amounts. */
export function exactJson(value: unknown): string {
  const encoded = JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? item.toString() : item);
  if (typeof encoded !== "string") throw new TypeError("Response must be JSON serializable");
  return encoded;
}
function checkedActor(value: ActorContext): ActorContext {
  try {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, "hallId")) throw new Error("Invalid actor");
    return Object.freeze({ accountId: entityId("account", value.accountId), hallId: value.hallId === null ? null : entityId("hall", value.hallId) });
  } catch { throw new Error("Invalid trusted authentication result"); }
}
/** Registers an encapsulated, non-listening boundary. Missing security providers fail closed at registration. */
export function createSalesHttpPlugin(options: SalesHttpOptions): FastifyPluginAsync {
  const dependencies = options?.dependencies;
  if (typeof options?.authenticate !== "function" || typeof dependencies?.unitOfWork?.transaction !== "function"
    || typeof dependencies?.authorization?.assertAllowed !== "function" || typeof dependencies?.rules?.assertDraftChange !== "function"
    || typeof dependencies?.rules?.assertReferencesAndEconomics !== "function" || typeof dependencies?.rules?.inventoryDelta !== "function"
    || typeof dependencies?.now !== "function" || typeof dependencies?.newId !== "function") {
    throw new TypeError("Sales HTTP requires explicit trusted authentication, authorization, business rules, and storage providers");
  }
  const service = createSalesService(dependencies);
  return async function salesHttp(app) {
    const actors = new WeakMap<object, ActorContext>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      let actor: ActorContext | null;
      try { actor = await options.authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch { throw new Error("Trusted authentication failed"); }
      if (actor === null) return reply.code(401).type("application/json").send(exactJson({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }));
      actors.set(request, checkedActor(actor));
    });
    app.setErrorHandler((error, _request, reply) => {
      const code = error instanceof DomainError ? error.code : undefined;
      const status = code !== undefined && Object.hasOwn(statuses, code) ? statuses[code] : undefined;
      if (status !== undefined) return reply.code(status).type("application/json").send(exactJson({ error: { code, message: status === 403 ? "Access denied" : "Sales request rejected" } }));
      // Parser/transport failures use only allowlisted codes. Never return provider/SQL errors or credentials.
      const transport = error as { code?: string };
      if (transport.code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (transport.code === "FST_ERR_CTP_INVALID_JSON_BODY" || transport.code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (transport.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed" } });
    });
    app.post("/sales/commands", { bodyLimit: 65_536 }, async (request, reply) => {
      assertNoQuery(request.query);
      if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      const actor = actors.get(request);
      if (!actor) throw new Error("Missing trusted actor");
      const result = await service.execute(parseSalesCommand(request.body, actor));
      return reply.type("application/json").send(exactJson(result));
    });
    app.get<{ Params: { requestKey: string } }>("/sales/receipts/:requestKey", async (request, reply) => {
      assertNoQuery(request.query);
      const actor = actors.get(request);
      if (!actor) throw new Error("Missing trusted actor");
      const requestKey = parseRequestKey(request.params.requestKey);
      const receipt = await dependencies.unitOfWork.transaction(async tx => {
        const found = await tx.getReceipt(actor.accountId, requestKey);
        requireDomain(found, "RECEIPT_NOT_FOUND", "Operation receipt is unavailable");
        const stored = await tx.getSales(found.targetSalesId);
        requireDomain(stored, "DOCUMENT_NOT_FOUND", "Operation target is unavailable");
        await dependencies.authorization.assertAllowed(actor, found.action, stored.document, tx);
        // Do not expose internal request hash, actor identity, audit rows, or document contents.
        return { requestKey: found.requestKey, action: found.action, status: found.status, completedAt: found.completedAt, result: found.result };
      });
      return reply.type("application/json").send(exactJson(receipt));
    });
  };
}
