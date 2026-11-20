import type { IncomingHttpHeaders } from 'node:http';
import type { FastifyPluginAsync } from 'fastify';
import type { ActorContext } from '../../../packages/application/src/ports.ts';
import type { HistoryRevisionDependencies } from '../../../packages/application/src/history-revision-contracts.ts';
import { createHistoryRevisionService, parseHistoryRevisionCommand } from '../../../packages/application/src/history-revision-service.ts';
import { DomainError, requireDomain } from '../../../packages/domain/src/errors.ts';

export interface HistoryRevisionAuthenticationInput { readonly headers: Readonly<IncomingHttpHeaders>; readonly ip: string; readonly method: string; readonly url: string }
export interface HistoryRevisionHttpOptions {
  /** Current trusted session and write-Origin enforcement supplied by the host. */
  readonly authenticate: (input: HistoryRevisionAuthenticationInput) => Promise<ActorContext | null>;
  readonly dependencies: HistoryRevisionDependencies;
}
/** HISTORY dataset commands only. No native document endpoint, listener, auth
 * fallback, database, artificial success or default persistence is constructed. */
export function createHistoryRevisionHttpPlugin(options: HistoryRevisionHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== 'function') throw TypeError('Historical writes require trusted authentication');
  const authenticate = options.authenticate, service = createHistoryRevisionService(options.dependencies);
  return async app => {
    const contexts = new WeakMap<object, { actor: ActorContext | null; controller: AbortController; cleanup(): void }>();
    app.addHook('onRequest', async (request, reply) => {
      reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
      const controller = new AbortController(), abort = () => controller.abort(), close = () => { if (!reply.raw.writableFinished) controller.abort(); };
      request.raw.once('aborted', abort); reply.raw.once('close', close);
      const state = { actor: null as ActorContext | null, controller, cleanup() { request.raw.off('aborted', abort); reply.raw.off('close', close); } };
      contexts.set(request, state);
      try { state.actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); }
      catch (error) {
        const code = (error as { code?: unknown }).code;
        if (code === 'ORIGIN_REJECTED' || code === 'INVALID_AUTH_INPUT') throw error;
        throw Error('Trusted historical write authentication failed');
      }
      if (state.actor === null) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    });
    app.addHook('onResponse', async request => { contexts.get(request)?.cleanup(); contexts.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      const code = (error as { code?: string }).code;
      if (code === 'ORIGIN_REJECTED') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
      if (code === 'INVALID_AUTH_INPUT') return reply.code(400).send({ error: { code, message: 'Authentication request rejected' } });
      if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') return reply.code(413).send({ error: { code: 'BODY_TOO_LARGE', message: 'Request body is too large' } });
      if (code === 'FST_ERR_CTP_INVALID_JSON_BODY' || code === 'FST_ERR_CTP_EMPTY_JSON_BODY') return reply.code(400).send({ error: { code: 'INVALID_JSON', message: 'A valid JSON body is required' } });
      if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return reply.code(415).send({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Use application/json' } });
      if (error instanceof DomainError) {
        const statuses: Readonly<Record<string, number>> = { HISTORY_REVISION_INVALID: 400, HISTORY_REVISION_EMPTY: 400, HISTORY_REVISION_FOREIGN_ROW: 400,
          HISTORY_REVISION_QUANTITY_OVERFLOW: 400, INVALID_ACTOR_CONTEXT: 403, IMPORTED_HISTORY_FORBIDDEN: 403, FORBIDDEN: 403,
          VERSION_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409, SETTLEMENT_MISMATCH: 409, HISTORY_REVISION_BUSINESS_DATE_UNKNOWN: 409,
          HISTORY_REVISION_NOT_FOUND: 404, HISTORY_REVISION_ABORTED: 408,
          HISTORY_REVISION_BASELINE_UNPROVEN: 503, HISTORY_REVISION_SCHEMA_NOT_READY: 503, HISTORY_REVISION_STORE_NOT_READY: 503 };
        if (Object.hasOwn(statuses, error.code)) return reply.code(statuses[error.code]!).send({ error: { code: error.code,
          message: statuses[error.code] === 403 ? 'Access denied' : 'Historical correction rejected' } });
        if (error.code === 'HISTORY_REVISION_COMMIT_OUTCOME_UNKNOWN') return reply.code(503).send({ error: { code: error.code,
          message: 'Operation outcome is unknown; recover with the original request key' } });
      }
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'The historical correction could not be completed' } });
    });
    for (const kind of ['sales', 'transfers'] as const) app.post(`/imported-history/${kind}/revise`, { bodyLimit: 4 * 1024 * 1024 }, async (request, reply) => {
      requireDomain(request.query && typeof request.query === 'object' && !Array.isArray(request.query) && Reflect.ownKeys(request.query).length === 0,
        'HISTORY_REVISION_INVALID', 'Historical correction rejected');
      if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return reply.code(415).send({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Use application/json' } });
      const command = parseHistoryRevisionCommand(request.body);
      requireDomain(command.kind === kind, 'HISTORY_REVISION_INVALID', 'Route and historical target kind must agree');
      const state = contexts.get(request); if (!state?.actor) throw Error('Missing historical write context');
      return reply.type('application/json').send(await service.execute(state.actor, command, state.controller.signal));
    });
  };
}
