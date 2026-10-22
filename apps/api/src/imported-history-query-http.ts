import type { IncomingHttpHeaders } from 'node:http';
import type { FastifyPluginAsync } from 'fastify';
import type { ActorContext } from '../../../packages/application/src/ports.ts';
import type { ImportedHistoryReadDependencies } from '../../../packages/application/src/imported-history-query-ports.ts';
import { createImportedHistoryQueryService } from '../../../packages/application/src/imported-history-query-service.ts';
import { invalidImportedHistoryQuery } from '../../../packages/application/src/imported-history-query-validation.ts';
import { DomainError } from '../../../packages/domain/src/errors.ts';

export interface ImportedHistoryReadAuthenticationInput { readonly headers: Readonly<IncomingHttpHeaders>; readonly ip: string; readonly method: string; readonly url: string }
export interface ImportedHistoryReadHttpOptions {
  /** Trusted current session callback, with POST Origin checks enforced by host. */
  readonly authenticate: (input: ImportedHistoryReadAuthenticationInput) => Promise<ActorContext | null>;
  readonly dependencies: ImportedHistoryReadDependencies;
}
/** Four read-only POST queries; no listener, built-in policy, database or defaults. */
export function createImportedHistoryQueryHttpPlugin(options: ImportedHistoryReadHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== 'function') throw new TypeError('Imported history HTTP requires explicit trusted authentication');
  const service = createImportedHistoryQueryService(options.dependencies), authenticate = options.authenticate;
  return async app => {
    const actors = new WeakMap<object, ActorContext>();
    const reads = new WeakMap<object, { readonly controller: AbortController; readonly cleanup: () => void }>();
    app.addHook('onRequest', async (request, reply) => {
      reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
      const controller = new AbortController(), aborted = () => controller.abort(), closed = () => { if (!reply.raw.writableFinished) controller.abort(); };
      request.raw.once('aborted', aborted); reply.raw.once('close', closed);
      reads.set(request, { controller, cleanup: () => { request.raw.off('aborted', aborted); reply.raw.off('close', closed); } });
      let actor: ActorContext | null;
      try { actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); } catch (error) { const code = (error as { code?: string }).code; if (code === 'ORIGIN_REJECTED' || code === 'INVALID_AUTH_INPUT') throw error; throw new Error('Trusted imported history authentication failed'); }
      if (actor === null) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
      actors.set(request, actor);
    });
    app.addHook('onResponse', async request => { reads.get(request)?.cleanup(); reads.delete(request); actors.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof DomainError) {
        const statuses: Readonly<Record<string, number>> = { IMPORTED_HISTORY_INVALID_QUERY: 400, IMPORTED_HISTORY_FORBIDDEN: 403, FORBIDDEN: 403, IMPORTED_HISTORY_READ_ABORTED: 408 };
        const status = Object.hasOwn(statuses, error.code) ? statuses[error.code] : undefined;
        if (status) return reply.code(status).send({ error: { code: error.code, message: status === 403 ? 'Access denied' : 'Imported history read rejected' } });
      }
      const code = (error as { code?: string }).code;
      if (code === 'ORIGIN_REJECTED' || code === 'FORBIDDEN') return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
      if (code === 'INVALID_AUTH_INPUT') return reply.code(400).send({ error: { code: 'INVALID_AUTH_INPUT', message: 'Authentication request rejected' } });
      if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') return reply.code(413).send({ error: { code: 'BODY_TOO_LARGE', message: 'Request body is too large' } });
      if (code === 'FST_ERR_CTP_INVALID_JSON_BODY' || code === 'FST_ERR_CTP_EMPTY_JSON_BODY') return reply.code(400).send({ error: { code: 'INVALID_JSON', message: 'A valid JSON body is required' } });
      if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return reply.code(415).send({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Use application/json' } });
      if (error instanceof DomainError && ['HISTORY_CLOSURE_SCHEMA_NOT_READY', 'HISTORY_PUBLICATION_SCHEMA_NOT_READY', 'NATIVE_IMPORT_GUARDS_NOT_READY'].includes(error.code)) return reply.code(503).send({ error: { code: 'IMPORTED_HISTORY_UNAVAILABLE', message: 'Historical data is unavailable' } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'The imported history read could not be completed' } });
    });
    for (const kind of ['sales', 'transfers'] as const) for (const operation of ['list', 'detail'] as const) {
      app.post(`/imported-history/${kind}/${operation === 'list' ? '' : 'detail/'}query`, { bodyLimit: 8192 }, async (request, reply) => {
        if (!request.query || typeof request.query !== 'object' || Array.isArray(request.query) || Object.keys(request.query).length) invalidImportedHistoryQuery();
        if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return reply.code(415).send({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Use application/json' } });
        const actor = actors.get(request), state = reads.get(request); if (!actor || !state) throw new Error('Missing trusted imported history context');
        return reply.type('application/json').send(await (operation === 'list' ? service.readList(actor, kind, request.body, state.controller.signal) : service.readDetail(actor, kind, request.body, state.controller.signal)));
      });
    }
  };
}
