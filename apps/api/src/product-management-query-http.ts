import { observeRequestStage } from './request-diagnostics.ts';
import { performance } from 'node:perf_hooks';
import { PassThrough } from 'node:stream';
import { awaitRead } from '../../../adapters/postgres/src/cancellable-read.ts';
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
  /** Trusted composition/test budget; never supplied by a client. Maximum 20 seconds. */
  readonly readBudgetMs?: number;
}
interface ProductManagementReadState {
  readonly controller: AbortController; readonly deadline: number; readonly expired: () => boolean; readonly cancelled: () => DomainError; readonly cleanup: () => void;
  bodyCleanup: () => void;
}
/** Two genuine read endpoints. Does not create a listener, role policy, database or route registration. */
export function createProductManagementQueryHttpPlugin(options: ProductManagementQueryHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Product management HTTP requires explicit trusted authentication");
  const authenticate = options.authenticate, service = createProductManagementQueryService(options.dependencies);
  const budget = options.readBudgetMs ?? 20_000;
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 20_000) throw new TypeError("Bounded product read budget required");
  return async function productManagementQueryHttp(app) {
    const actors = new WeakMap<object, ActorContext>();
    const reads = new WeakMap<object, ProductManagementReadState>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      const controller = new AbortController();
      // Release owned resources immediately, but retain weak cancellation state
      // until onResponse so a parent's held onSend cannot revive a success.
      const finished = () => { reads.get(request)?.cleanup(); actors.delete(request); };
      const aborted = () => { controller.abort(); finished(); };
      const closed = () => { if (!reply.raw.writableFinished) controller.abort(); finished(); };
      const deadline = performance.now() + budget;
      let budgetExpired = false;
      const expired = () => budgetExpired || performance.now() >= deadline;
      const cancelled = () => new DomainError(expired() ? "PRODUCT_MANAGEMENT_READ_TIMEOUT" : "PRODUCT_MANAGEMENT_READ_ABORTED", "Product management read budget ended");
      // The configured timer is itself a timeout cause. Do not reclassify it as
      // a client abort when a separate monotonic-clock sample is just earlier.
      const timer = setTimeout(() => { budgetExpired = true; controller.abort(); }, budget); timer.unref();
      request.raw.once("aborted", aborted); reply.raw.once("close", closed);
      const state: ProductManagementReadState = { controller, deadline, expired, cancelled, bodyCleanup: () => {}, cleanup: () => {
        clearTimeout(timer); request.raw.off("aborted", aborted); reply.raw.off("close", closed); state.bodyCleanup();
      } };
      reads.set(request, state);
      let actor: ActorContext | null;
      try { actor = await awaitRead(authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }), controller.signal, cancelled); }
      catch (error) { if (controller.signal.aborted) throw cancelled(); throw new Error("Trusted product management authentication failed"); }
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      actors.set(request, actor);
    });
    app.addHook("preParsing", (request, _reply, payload, done) => {
      const state = reads.get(request);
      if (!state) return done(new Error("Missing trusted product management context"));
      if (state.controller.signal.aborted) return done(state.cancelled());
      // Abort the parser's owned stream, not the socket or a second reply. The
      // normal Fastify parser error path removes its listeners and sends once.
      const body = new PassThrough(); let disposed = false;
      Object.defineProperty(body, "receivedEncodedLength", { get: () => payload.receivedEncodedLength });
      const abort = () => { body.destroy(state.cancelled()); };
      const failed = (error: Error) => { body.destroy(error); };
      const cleanup = () => {
        if (disposed) return; disposed = true;
        state.controller.signal.removeEventListener("abort", abort);
        payload.off("error", failed); payload.unpipe(body); body.destroy();
      };
      // Keep our error listener until close: destroy(error) emits asynchronously,
      // including when an earlier parser rejection already removed its listener.
      const closed = () => { cleanup(); body.off("end", cleanup); body.off("error", cleanup); };
      body.once("end", cleanup); body.once("error", cleanup); body.once("close", closed);
      state.bodyCleanup = cleanup;
      state.controller.signal.addEventListener("abort", abort, { once: true }); payload.once("error", failed);
      done(null, body);
      if (state.controller.signal.aborted) abort();
      else if (!body.destroyed) payload.pipe(body);
    });
    app.addHook("onResponse", async request => { reads.get(request)?.cleanup(); reads.delete(request); actors.delete(request); });
    app.addHook("onSend", async (request, reply, payload) => {
      const state = reads.get(request);
      if (state && !reply.raw.destroyed && (state.controller.signal.aborted || state.expired()) && reply.statusCode < 400) {
        const error = state.cancelled();
        observeRequestStage('SERIALIZE',error);
        state.controller.abort(); reply.code(error.code === "PRODUCT_MANAGEMENT_READ_TIMEOUT" ? 503 : 408).type("application/json");
        return JSON.stringify({ error: { code: error.code, message: "Product management read budget ended" } });
      }
      return payload;
    });
    app.setErrorHandler((error, _request, reply) => {
      const state = reads.get(_request); state?.bodyCleanup();
      if (reply.sent || reply.raw.destroyed) return;
      if (state && performance.now() >= state.deadline) error = state.cancelled() as typeof error;
      if (error instanceof DomainError) {
        const statuses: Readonly<Record<string, number>> = { INVALID_PRODUCT_MANAGEMENT_QUERY: 400, FORBIDDEN: 403,
          PRODUCT_MANAGEMENT_READ_TOO_LARGE: 413, PRODUCT_MANAGEMENT_READ_ABORTED: 408, PRODUCT_MANAGEMENT_STOCK_NOT_READY: 503, PRODUCT_MANAGEMENT_READ_TIMEOUT: 503 };
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
        const result = await awaitRead<unknown>(read(actor, request.body, state.controller.signal), state.controller.signal, state.cancelled);
        if (performance.now() >= state.deadline) { state.controller.abort(); throw state.cancelled(); }
        return reply.type("application/json").send(result);
      });
    }
  };
}
