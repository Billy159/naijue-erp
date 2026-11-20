import type { FastifyPluginAsync } from "fastify";
import type { ProductQueryAuthenticationInput } from "./product-query-http.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { SettingsAuditReader } from "../../../packages/application/src/settings-audit-ports.ts";
import { createSettingsAuditService } from "../../../packages/application/src/settings-audit-service.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";

export interface SettingsAuditHttpOptions {
  readonly authenticate: (input: ProductQueryAuthenticationInput) => Promise<ActorContext | null>;
  readonly reader: SettingsAuditReader;
}
/** Registered explicitly by the composition owner; no default provider or hidden mount. */
export function createSettingsAuditHttpPlugin(options: SettingsAuditHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Settings audit require trusted authentication");
  const authenticate = options.authenticate, service = createSettingsAuditService(options.reader);
  return async app => {
    const contexts = new WeakMap<object, { actor: ActorContext | null; controller: AbortController; cleanup(): void }>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      const controller = new AbortController(), abort = () => controller.abort(), close = () => { if (!reply.raw.writableFinished) controller.abort(); };
      request.raw.once("aborted", abort); reply.raw.once("close", close);
      const state = { actor: null as ActorContext | null, controller, cleanup() { request.raw.off("aborted", abort); reply.raw.off("close", close); } };
      contexts.set(request, state);
      let actor: ActorContext | null;
      try { actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch { throw Error("Trusted settings audit authentication failed"); }
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      state.actor = actor;
    });
    app.addHook("onResponse", async request => { contexts.get(request)?.cleanup(); contexts.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      const statuses: Readonly<Record<string, number>> = { INVALID_SETTINGS_AUDIT_QUERY: 400,
        FORBIDDEN: 403, SETTINGS_AUDIT_ABORTED: 408 };
      if (error instanceof DomainError && Object.hasOwn(statuses, error.code)) return reply.code(statuses[error.code]!).send({ error: {
        code: error.code, message: error.code === "FORBIDDEN" ? "Access denied" : "Settings audit read rejected" } });
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The settings audit read could not be completed" } });
    });
    for (const [url, read] of [["/settings/audit/query", service.query]] as const) {
      app.post(url, { bodyLimit: 8192 }, async (request, reply) => {
        if (!request.query || typeof request.query !== "object" || Reflect.ownKeys(request.query).length) throw new DomainError("INVALID_SETTINGS_AUDIT_QUERY", "Query string is not supported");
        if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
        const state = contexts.get(request); if (!state?.actor) throw Error("Missing trusted settings audit context");
        return reply.type("application/json").send(await read(state.actor, request.body, state.controller.signal));
      });
    }
  };
}
