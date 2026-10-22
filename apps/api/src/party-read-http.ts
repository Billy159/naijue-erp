import type { FastifyPluginAsync } from "fastify";
import type { PartyActor, PartyReadDependencies } from "../../../packages/application/src/party-read-ports.ts";
import { createPartyReadService } from "../../../packages/application/src/party-read-service.ts";
import { checkedPartyActor, parsePartySearch } from "../../../packages/application/src/party-maintenance-validation.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import type { PartyAuthenticationInput } from "./party-maintenance-http.ts";
import { assertNoQuery } from "./input.ts";
export interface PartyReadHttpOptions {
  readonly authenticate: (input: PartyAuthenticationInput) => Promise<PartyActor | null>;
  readonly dependencies: PartyReadDependencies;
}
/** Six GET only. No maintenance service/UoW, command, receipt, allocator or fallback authorization. */
export function createPartyReadHttpPlugin(options: PartyReadHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw TypeError("Explicit party read authentication required");
  const authenticate = options.authenticate, service = createPartyReadService(options.dependencies);
  return async function partyReadHttp(app) {
    const contexts = new WeakMap<object, { actor: PartyActor | null; controller: AbortController; cleanup(): void }>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      const controller = new AbortController(), aborted = () => controller.abort(), closed = () => { if (!reply.raw.writableFinished) controller.abort(); };
      request.raw.once("aborted", aborted); reply.raw.once("close", closed);
      const state = { actor: null as PartyActor | null, controller, cleanup() { request.raw.off("aborted", aborted); reply.raw.off("close", closed); } };
      contexts.set(request, state);
      let actor: PartyActor | null;
      try { actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch { throw Error("Party read authentication failed"); }
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      state.actor = checkedPartyActor(actor);
    });
    app.addHook("onResponse", async request => { contexts.get(request)?.cleanup(); contexts.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      const statuses: Readonly<Record<string, number>> = { INVALID_PARTY_INPUT: 400, INVALID_ID: 400, INVALID_HTTP_INPUT: 400,
        FORBIDDEN: 403, PARTY_NOT_FOUND: 404, PARTY_READ_TOO_LARGE: 422, PARTY_READ_ABORTED: 408 };
      if (error instanceof DomainError && Object.hasOwn(statuses, error.code)) return reply.code(statuses[error.code]!).send({ error: {
        code: error.code, message: error.code === "FORBIDDEN" ? "Access denied" : "Party read rejected" } });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The party read could not be completed" } });
    });
    const context = (request: object) => { const value = contexts.get(request); if (!value?.actor) throw Error("Missing trusted party read context"); return { ...value, actor: value.actor }; };
    for (const [path, kind] of [["customers", "CUSTOMER"], ["suppliers", "SUPPLIER"]] as const) {
      app.get(`/${path}`, async request => {
        const { actor, controller } = context(request);
        return service.search(actor, kind, parsePartySearch(request.query, false, true), false, controller.signal);
      });
      app.get(`/${path}/candidates`, async request => {
        const { actor, controller } = context(request), { enabled: _enabled, ...query } = parsePartySearch(request.query, true, true);
        return service.search(actor, kind, query, true, controller.signal);
      });
      app.get<{ Params: { id: string } }>(`/${path}/:id`, async request => {
        assertNoQuery(request.query); const { actor, controller } = context(request);
        return service.detail(actor, kind, request.params.id, controller.signal);
      });
    }
  };
}
