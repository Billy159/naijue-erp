import { documentListWire, salesDetailWire } from './document-list-wire.ts';
import type { IncomingHttpHeaders } from "node:http";
import type { FastifyPluginAsync } from "fastify";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { SalesQueryDependencies } from "../../../packages/application/src/sales-query-ports.ts";
import { createSalesQueryService } from "../../../packages/application/src/sales-query-service.ts";
import { invalidSalesQuery } from "../../../packages/application/src/sales-query-validation.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { exactJson } from "./sales-http.ts";

export interface SalesQueryAuthenticationInput {
  readonly headers: Readonly<IncomingHttpHeaders>; readonly ip: string; readonly method: string; readonly url: string;
}
export interface SalesQueryHttpOptions {
  /** Required current trusted session/identity provider. Client actor/roles/scope are never accepted. */
  readonly authenticate: (input: SalesQueryAuthenticationInput) => Promise<ActorContext | null>;
  readonly dependencies: SalesQueryDependencies;
}
/** Read-only POST routes accept structured bounded filters, not commands. No server/listener or pool is created. */
export function createSalesQueryHttpPlugin(options: SalesQueryHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Sales query HTTP requires explicit trusted authentication");
  const authenticate = options.authenticate;
  const service = createSalesQueryService(options.dependencies);
  return async function salesQueryHttp(app) {
    const actors = new WeakMap<object, ActorContext>();
    const reads = new WeakMap<object, { readonly controller: AbortController; readonly cleanup: () => void }>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      const controller = new AbortController();
      const aborted = () => controller.abort(); const closed = () => { if (!reply.raw.writableFinished) controller.abort(); };
      request.raw.once("aborted", aborted); reply.raw.once("close", closed);
      reads.set(request, { controller, cleanup: () => { request.raw.off("aborted", aborted); reply.raw.off("close", closed); } });
      let actor: ActorContext | null;
      try { actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch { throw new Error("Trusted sales query authentication failed"); }
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      actors.set(request, actor);
    });
    app.addHook("onResponse", async request => { reads.get(request)?.cleanup(); reads.delete(request); actors.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof DomainError) {
        const statuses: Readonly<Record<string, number>> = { INVALID_SALES_QUERY: 400, FORBIDDEN: 403, DOCUMENT_NOT_FOUND: 404, SALES_READ_TOO_LARGE: 413, SALES_READ_ABORTED: 408 };
        const status = Object.hasOwn(statuses, error.code) ? statuses[error.code] : undefined;
        if (status !== undefined) return reply.code(status).send({ error: { code: error.code, message: status === 403 ? "Access denied" : "Sales read rejected" } });
      }
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      // Malformed trusted facts, unknown SQL failures and provider details never become successful empty pages or leaked errors.
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The sales read could not be completed" } });
    });
    for (const [url, read] of [["/sales/query", service.readList], ["/sales/references/query", service.readReferences], ["/sales/detail/query", service.readDetail],
      ["/sales/history/query", service.readHistory], ["/sales/settlement-statistics/query", service.readSettlementStatistics]] as const) {
      app.post(url, { bodyLimit: 65_536 }, async (request, reply) => {
        if (!request.query || typeof request.query !== "object" || Array.isArray(request.query) || Object.keys(request.query).length) invalidSalesQuery();
        if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
          return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
        }
        const actor = actors.get(request); const state = reads.get(request);
        if (!actor || !state) throw new Error("Missing trusted sales query context");
        const result=await read(actor, request.body, state.controller.signal);
        return reply.type("application/json").send(exactJson(url==='/sales/query'?documentListWire(result,request.headers['x-naijue-document-summary']):url==='/sales/detail/query'?salesDetailWire(result,request.headers['x-naijue-document-summary']):result));
      });
    }
  };
}
