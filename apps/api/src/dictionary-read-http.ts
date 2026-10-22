import type { IncomingHttpHeaders } from "node:http";
import type { FastifyPluginAsync } from "fastify";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { DictionaryReadDependencies } from "../../../packages/application/src/dictionary-read-ports.ts";
import { createDictionaryReadService } from "../../../packages/application/src/dictionary-read-service.ts";
import { invalidDictionaryQuery } from "../../../packages/application/src/dictionary-read-validation.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";

export interface DictionaryReadAuthenticationInput {
  readonly headers: Readonly<IncomingHttpHeaders>; readonly ip: string; readonly method: string; readonly url: string;
}
export interface DictionaryReadHttpOptions {
  /** Mandatory current trusted callback. Compatible with createSalesSessionAuthenticator's POST Origin checks. */
  readonly authenticate: (input: DictionaryReadAuthenticationInput) => Promise<ActorContext | null>;
  readonly dependencies: DictionaryReadDependencies;
}
/** Four read-only POST queries. No listener, default identity, permission fallback or database is created. */
export function createDictionaryReadHttpPlugin(options: DictionaryReadHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Dictionary read HTTP requires explicit trusted authentication");
  const authenticate = options.authenticate; const service = createDictionaryReadService(options.dependencies);
  return async function dictionaryReadHttp(app) {
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
      catch { throw new Error("Trusted dictionary query authentication failed"); }
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      actors.set(request, actor);
    });
    app.addHook("onResponse", async request => { reads.get(request)?.cleanup(); reads.delete(request); actors.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof DomainError) {
        const statuses: Readonly<Record<string, number>> = { INVALID_DICTIONARY_QUERY: 400, FORBIDDEN: 403,
          DICTIONARY_READ_TOO_LARGE: 413, DICTIONARY_READ_ABORTED: 408 };
        const status = Object.hasOwn(statuses, error.code) ? statuses[error.code] : undefined;
        if (status !== undefined) return reply.code(status).send({ error: { code: error.code,
          message: status === 403 ? "Access denied" : "Dictionary read rejected" } });
      }
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The dictionary read could not be completed" } });
    });
    for (const [url, read] of [["/dictionary-read/size-groups/query", service.readSizeGroups], ["/dictionary-read/seasons/query", service.readSeasons],
      ["/dictionary-read/barcode-schemes/query", service.readBarcodeSchemes], ["/dictionary-read/barcode-scheme/query", service.readBarcodeScheme]] as const) {
      app.post(url, { bodyLimit: 8192 }, async (request, reply) => {
        if (!request.query || typeof request.query !== "object" || Array.isArray(request.query) || Object.keys(request.query).length) invalidDictionaryQuery();
        if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
        const actor = actors.get(request); const state = reads.get(request);
        if (!actor || !state) throw new Error("Missing trusted dictionary read context");
        return reply.type("application/json").send(await read(actor, request.body, state.controller.signal));
      });
    }
  };
}
