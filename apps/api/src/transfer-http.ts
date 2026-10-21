import { TRANSFER_PREPARE_MAX_REQUEST_BYTES, TRANSFER_COMMAND_MAX_REQUEST_BYTES, TRANSFER_PREPARE_MAX_LINES, TRANSFER_PREPARE_MAX_NOTE_LENGTH, transferPreparedDraftFitsSaveBudget } from "../../../packages/application/src/transfer-payload-budget.ts";
import type { NativeTransferCreateProposal } from "../../../packages/application/src/native-transfer-preparation.ts";
import type { TransferDraft } from "../../../packages/application/src/transfer-ports.ts";
import type { IncomingHttpHeaders } from "node:http";
import type { FastifyPluginAsync } from "fastify";
import type { TransferActor, TransferDependencies } from "../../../packages/application/src/transfer-ports.ts";
import { createTransferService } from "../../../packages/application/src/transfer-service.ts";
import { DomainError, requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { assertNoQuery, parseRequestKey } from "./input.ts";
import { exactJson } from "./sales-http.ts";
import { parseTransferCommand } from "./transfer-input.ts";

export interface TransferAuthenticationInput { readonly headers: Readonly<IncomingHttpHeaders>; readonly ip: string; readonly method: string; readonly url: string }
export interface TransferHttpOptions {
  /** Credentials and role must be verified by a trusted server source. No built-in account or role inference. */
  readonly authenticate: (input: TransferAuthenticationInput) => Promise<TransferActor | null>;
  /** Required transaction, current authorization/reference scope, clock and identifier providers. */
  readonly dependencies: TransferDependencies;
  /** Explicit native manual-SKU preparation; absent means no preparation route. */
  readonly preparation?: { prepareCreate(actor: TransferActor, proposal: NativeTransferCreateProposal): Promise<TransferDraft> };
}
const statuses: Readonly<Record<string, number>> = {
  TRANSFER_PAYLOAD_TOO_LARGE: 413, INVALID_HTTP_INPUT: 400, INVALID_ID: 400, INVALID_QUANTITY: 400, QUANTITY_OVERFLOW: 422,
  INVALID_VERSION: 400, INVALID_BUSINESS_DATE: 400,
  FORBIDDEN: 403, DESTINATION_SCOPE_FORBIDDEN: 403, DOCUMENT_NOT_FOUND: 404, RECEIPT_NOT_FOUND: 404,
  VERSION_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409, INVALID_STATE: 409,
  HISTORICAL_POSTING_NOT_IMPLEMENTED: 409, INVENTORY_NOT_READY: 409, MISSING_POSTING_PROVENANCE: 409,
  INVALID_NUMBER: 422, SAME_WAREHOUSE: 422, EMPTY_DOCUMENT: 422, INVALID_TRANSFER_LINE: 422,
  INVALID_LINES: 422, INVALID_LINE: 422, FOREIGN_LINE_ID: 422, INVALID_STOCK_EFFECT: 422,
  WAREHOUSE_UNAVAILABLE: 409, SKU_UNAVAILABLE: 409,
  NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE: 409, TRANSFER_SNAPSHOT_MISMATCH: 409
};
function checkedActor(value: TransferActor): TransferActor {
  try {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, "accountId") || !Object.hasOwn(value, "hallId")
      || !Object.hasOwn(value, "role")) throw new Error("Invalid actor");
    const { accountId, hallId, role } = value;
    if (!["ADMIN", "WAREHOUSE", "SALESPERSON"].includes(role)) throw new Error("Invalid actor");
    return Object.freeze({ accountId: entityId("account", accountId), hallId: hallId === null ? null : entityId("hall", hallId), role });
  } catch { throw new Error("Invalid trusted authentication result"); }
}
/** Encapsulated and non-listening. Absent policy providers fail closed at registration. */
export function createTransferHttpPlugin(options: TransferHttpOptions): FastifyPluginAsync {
  const dependencies = options?.dependencies;
  if (typeof options?.authenticate !== "function" || typeof dependencies?.unitOfWork?.transaction !== "function"
    || typeof dependencies?.authorization?.assertAllowed !== "function" || typeof dependencies?.references?.assertValid !== "function"
    || typeof dependencies?.now !== "function" || typeof dependencies?.newId !== "function") {
    throw new TypeError("Transfer HTTP requires explicit trusted authentication, authorization, reference validation, and storage providers");
  }
  const service = createTransferService(dependencies);
  if (options.preparation !== undefined && typeof options.preparation?.prepareCreate !== "function")
    throw new TypeError("Transfer preparation requires an explicit trusted provider");
  const prepare = options.preparation?.prepareCreate.bind(options.preparation);
  return async function transferHttp(app) {
    const actors = new WeakMap<object, TransferActor>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      let actor: TransferActor | null;
      try { actor = await options.authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch { throw new Error("Trusted authentication failed"); }
      if (actor === null) return reply.code(401).type("application/json").send(exactJson({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }));
      actors.set(request, checkedActor(actor));
    });
    app.setErrorHandler((error, _request, reply) => {
      const code = error instanceof DomainError ? error.code : undefined;
      const status = code !== undefined && Object.hasOwn(statuses, code) ? statuses[code] : undefined;
      if (status !== undefined) return reply.code(status).type("application/json").send(exactJson({ error: { code, message: status === 403 ? "Access denied" : code === "TRANSFER_PAYLOAD_TOO_LARGE" ? "Prepared transfer exceeds the supported payload size" : "Transfer request rejected" } }));
      // Provider details and credentials are never reflected. Only known parser errors are public.
      const transport = error as { code?: string };
      if (transport.code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (transport.code === "FST_ERR_CTP_INVALID_JSON_BODY" || transport.code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (transport.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed" } });
    });
    if (prepare) app.post("/transfers/prepare-create", { bodyLimit: TRANSFER_PREPARE_MAX_REQUEST_BYTES }, async (request, reply) => {
      assertNoQuery(request.query);
      if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      const actor = actors.get(request); if (!actor) throw new Error("Missing trusted actor");
      function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
        requireDomain(value !== null && typeof value === "object" && !Array.isArray(value)
          && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length
          && keys.every(key => Object.hasOwn(value, key)), "INVALID_HTTP_INPUT", "Exact preparation input required");
        return value as Record<string, unknown>;
      }
      const body = object(request.body, ["businessDate", "note", "fromWarehouseId", "toWarehouseId", "lines"]);
      requireDomain(typeof body.businessDate === "string" && (body.note === null || typeof body.note === "string")
        && typeof body.fromWarehouseId === "string" && typeof body.toWarehouseId === "string" && Array.isArray(body.lines)
        && body.lines.length > 0 && body.lines.length <= TRANSFER_PREPARE_MAX_LINES
        && (body.note === null || body.note.length <= TRANSFER_PREPARE_MAX_NOTE_LENGTH), "INVALID_HTTP_INPUT", "Bounded preparation input required");
      const lines = body.lines.map(value => {
        const line = object(value, ["skuId", "quantity"]);
        requireDomain(typeof line.skuId === "string" && typeof line.quantity === "string", "INVALID_HTTP_INPUT", "Exact line input required");
        return { skuId: line.skuId, quantity: line.quantity };
      });
      const draft = await prepare(actor, { businessDate: body.businessDate, note: body.note,
        fromWarehouseId: body.fromWarehouseId, toWarehouseId: body.toWarehouseId, lines });
      requireDomain(transferPreparedDraftFitsSaveBudget(draft), "TRANSFER_PAYLOAD_TOO_LARGE", "Prepared transfer exceeds the bounded SAVE payload budget");
      return reply.type("application/json").send(exactJson(draft));
    });
    app.post("/transfers/commands", { bodyLimit: TRANSFER_COMMAND_MAX_REQUEST_BYTES }, async (request, reply) => {
      assertNoQuery(request.query);
      if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      const actor = actors.get(request);
      if (!actor) throw new Error("Missing trusted actor");
      const result = await service.execute(parseTransferCommand(request.body, actor));
      return reply.type("application/json").send(exactJson(result));
    });
    app.get<{ Params: { requestKey: string } }>("/transfers/receipts/:requestKey", async (request, reply) => {
      assertNoQuery(request.query);
      const actor = actors.get(request);
      if (!actor) throw new Error("Missing trusted actor");
      const requestKey = parseRequestKey(request.params.requestKey);
      const receipt = await dependencies.unitOfWork.transaction(async tx => {
        const found = await tx.getReceipt(actor.accountId, requestKey);
        requireDomain(found, "RECEIPT_NOT_FOUND", "Operation receipt is unavailable");
        const stored = await tx.getTransfer(found.targetTransferId);
        requireDomain(stored, "DOCUMENT_NOT_FOUND", "Operation target is unavailable");
        await dependencies.authorization.assertAllowed(actor, found.action, stored.document, undefined, tx);
        // Exclude internal hashes, actor identities, audit rows and document contents.
        return { requestKey: found.requestKey, action: found.action, status: found.status, completedAt: found.completedAt, result: found.result };
      });
      return reply.type("application/json").send(exactJson(receipt));
    });
  };
}
