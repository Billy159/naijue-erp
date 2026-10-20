import type { IncomingHttpHeaders } from "node:http";
import type { FastifyPluginAsync } from "fastify";
import type { PartyActor, PartyDependencies, PartyKind } from "../../../packages/application/src/party-maintenance-ports.ts";
import { createPartyMaintenanceService } from "../../../packages/application/src/party-maintenance-service.ts";
import { checkedPartyActor, parsePartyCommand, parsePartySearch } from "../../../packages/application/src/party-maintenance-validation.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { assertNoQuery } from "./input.ts";

export interface PartyAuthenticationInput { readonly headers: Readonly<IncomingHttpHeaders>; readonly ip: string; readonly method: string; readonly url: string }
export interface PartyHttpOptions { readonly authenticate: (input: PartyAuthenticationInput) => Promise<PartyActor | null>; readonly dependencies: PartyDependencies }
const statuses: Readonly<Record<string, number>> = { INVALID_PARTY_INPUT: 400, INVALID_ID: 400, INVALID_VERSION: 400, INVALID_HTTP_INPUT: 400,
  FORBIDDEN: 403, PARTY_NOT_FOUND: 404, RECEIPT_NOT_FOUND: 404, VERSION_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409,
  PARTY_CODE_CONFLICT: 409, PARTY_CODE_EXHAUSTED: 409, CUSTOMER_DEFAULT_IN_USE: 409, INVALID_PARTY_STATE: 409, NO_PARTY_CHANGE: 409, VERSION_STORAGE_OVERFLOW: 409, PARTY_READ_TOO_LARGE: 422 };
/** Two independent route families; no unified party mutation, dual-role field or delete route.
 * This plugin is non-listening and requires trusted current authentication and policies. */
export function createPartyMaintenanceHttpPlugin(options: PartyHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== "function") throw new TypeError("Party HTTP requires explicit trusted authentication");
  const service = createPartyMaintenanceService(options.dependencies);
  return async function partyMaintenanceHttp(app) {
    const actors = new WeakMap<object, PartyActor>();
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      let actor: PartyActor | null;
      try { actor = await options.authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch { throw new Error("Party authentication provider failed"); }
      if (actor === null) return reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
      actors.set(request, checkedPartyActor(actor));
    });
    app.setErrorHandler((error, _request, reply) => {
      const code = error instanceof DomainError ? error.code : undefined;
      if (code && Object.hasOwn(statuses, code)) return reply.code(statuses[code]!).send({ error: { code, message: code === "FORBIDDEN" ? "Access denied" : "Party request rejected" } });
      const transport = (error as { code?: string }).code;
      if (transport === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (transport === "FST_ERR_CTP_INVALID_JSON_BODY" || transport === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (transport === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed" } });
    });
    function actor(request: object): PartyActor { const result = actors.get(request); if (!result) throw new Error("Missing trusted party actor"); return result; }
    // Explicit closed mapping. No path/input is interpolated as a table name.
    for (const [path, kind] of [["customers", "CUSTOMER"], ["suppliers", "SUPPLIER"]] as const satisfies readonly (readonly [string, PartyKind])[]) {
      app.post(`/${path}/commands`, { bodyLimit: 8192 }, async (request, reply) => {
        assertNoQuery(request.query);
        if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
        return service.execute(parsePartyCommand(request.body, actor(request), kind));
      });
      app.get(`/${path}`, async request => service.search(actor(request), kind, parsePartySearch(request.query, false, true)));
      app.get(`/${path}/candidates`, async request => {
        const { enabled: _enabled, ...query } = parsePartySearch(request.query, true, true);
        return service.search(actor(request), kind, query, true);
      });
      app.get<{ Params: { id: string } }>(`/${path}/:id`, async request => { assertNoQuery(request.query); return service.detail(actor(request), kind, request.params.id); });
      app.get<{ Params: { requestKey: string } }>(`/${path}/receipts/:requestKey`, async request => { assertNoQuery(request.query); return service.receipt(actor(request), kind, request.params.requestKey); });
    }
  };
}
