import type { IncomingHttpHeaders } from "node:http";
import type { FastifyPluginAsync } from "fastify";
import type { TransferActor } from "../../../packages/application/src/transfer-ports.ts";
import type { TransferQueryDependencies } from "../../../packages/application/src/transfer-query-ports.ts";
import { createTransferQueryService } from "../../../packages/application/src/transfer-query-service.ts";
import { invalidTransferQuery } from "../../../packages/application/src/transfer-query-validation.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { exactJson } from "./sales-http.ts";

export interface TransferQueryAuthenticationInput {
  readonly headers: Readonly<IncomingHttpHeaders>; readonly ip: string; readonly method: string; readonly url: string;
}
export interface TransferQueryHttpOptions {
  /** Required current trusted session/identity provider. Client actor/roles/scope are never accepted. */
  readonly authenticate: (input: TransferQueryAuthenticationInput) => Promise<TransferActor | null>;
  readonly dependencies: TransferQueryDependencies;
}
/** Read-only POST routes accept structured bounded filters, not commands. No server/listener or pool is created. */
export function createTransferQueryHttpPlugin(options: TransferQueryHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Transfer query HTTP requires explicit trusted authentication");
  const authenticate = options.authenticate;
  const service = createTransferQueryService(options.dependencies);
  return async function transferQueryHttp(app) {
    const actors = new WeakMap<object, TransferActor>();
    const reads = new WeakMap<object, { readonly controller: AbortController; readonly cleanup: () => void }>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      const controller = new AbortController();
      const aborted = () => controller.abort(); const closed = () => { if (!reply.raw.writableFinished) controller.abort(); };
      request.raw.once("aborted", aborted); reply.raw.once("close", closed);
      reads.set(request, { controller, cleanup: () => { request.raw.off("aborted", aborted); reply.raw.off("close", closed); } });
      let actor: TransferActor | null;
      try { actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch { throw new Error("Trusted transfer query authentication failed"); }
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      actors.set(request, actor);
    });
    app.addHook("onResponse", async request => { reads.get(request)?.cleanup(); reads.delete(request); actors.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof DomainError) {
        const statuses: Readonly<Record<string, number>> = { TRANSFER_HISTORY_UNAVAILABLE: 503, INVALID_TRANSFER_QUERY: 400, FORBIDDEN: 403, DOCUMENT_NOT_FOUND: 404, TRANSFER_READ_TOO_LARGE: 413, TRANSFER_READ_ABORTED: 408 };
        const status = Object.hasOwn(statuses, error.code) ? statuses[error.code] : undefined;
        if (status !== undefined) return reply.code(status).send({ error: { code: error.code, message: status === 403 ? "Access denied" : "Transfer read rejected" } });
      }
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      // Malformed trusted facts, unknown SQL failures and provider details never become successful empty pages or leaked errors.
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The transfer read could not be completed" } });
    });
    for (const [url, read] of [["/transfers/history/query", service.readHistory], ["/transfers/query", service.readList], ["/transfers/detail/query", service.readDetail], ["/transfers/warehouses/query", service.readWarehouses]] as const) {
      app.post(url, { bodyLimit: 65_536 }, async (request, reply) => {
        if (!request.query || typeof request.query !== "object" || Array.isArray(request.query) || Object.keys(request.query).length) invalidTransferQuery();
        if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
          return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
        }
        const actor = actors.get(request); const state = reads.get(request);
        if (!actor || !state) throw new Error("Missing trusted transfer query context");
        return reply.type("application/json").send(exactJson(await read(actor, request.body, state.controller.signal)));
      });
    }
  };
}
