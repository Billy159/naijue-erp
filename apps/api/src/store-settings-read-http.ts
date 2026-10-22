import type { IncomingHttpHeaders } from 'node:http';
import type { FastifyPluginAsync } from 'fastify';
import type { ActorContext } from '../../../packages/application/src/ports.ts';
import type { StoreSettingsReadDependencies } from '../../../packages/application/src/store-settings-read-ports.ts';
import { createStoreSettingsReadService } from '../../../packages/application/src/store-settings-read-service.ts';
import { invalidStoreSettingsQuery } from '../../../packages/application/src/store-settings-read-validation.ts';
import { DomainError } from '../../../packages/domain/src/errors.ts';

export interface StoreSettingsReadAuthenticationInput { readonly headers: Readonly<IncomingHttpHeaders>; readonly ip: string; readonly method: string; readonly url: string }
export interface StoreSettingsReadHttpOptions {
  /** Trusted current session callback, with POST Origin checks enforced by host. */
  readonly authenticate: (input: StoreSettingsReadAuthenticationInput) => Promise<ActorContext | null>;
  readonly dependencies: StoreSettingsReadDependencies;
}
/** Four read-only POST queries; no listener, built-in policy, database or defaults. */
export function createStoreSettingsReadHttpPlugin(options: StoreSettingsReadHttpOptions): FastifyPluginAsync {
  if (typeof options?.authenticate !== 'function') throw new TypeError('Store settings HTTP requires explicit trusted authentication');
  const service = createStoreSettingsReadService(options.dependencies), authenticate = options.authenticate;
  return async app => {
    const actors = new WeakMap<object, ActorContext>();
    const reads = new WeakMap<object, { readonly controller: AbortController; readonly cleanup: () => void }>();
    app.addHook('onRequest', async (request, reply) => {
      reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
      const controller = new AbortController(), aborted = () => controller.abort(), closed = () => { if (!reply.raw.writableFinished) controller.abort(); };
      request.raw.once('aborted', aborted); reply.raw.once('close', closed);
      reads.set(request, { controller, cleanup: () => { request.raw.off('aborted', aborted); reply.raw.off('close', closed); } });
      let actor: ActorContext | null;
      try { actor = await authenticate({ headers: Object.freeze({ ...request.headers }), ip: request.ip, method: request.method, url: request.url }); } catch { throw new Error('Trusted store settings authentication failed'); }
      if (actor === null) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
      actors.set(request, actor);
    });
    app.addHook('onResponse', async request => { reads.get(request)?.cleanup(); reads.delete(request); actors.delete(request); });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof DomainError) {
        const statuses: Readonly<Record<string, number>> = { STORE_SETTINGS_INVALID_QUERY: 400, STORE_SETTINGS_FORBIDDEN: 403, FORBIDDEN: 403, STORE_SETTINGS_READ_ABORTED: 408 };
        const status = Object.hasOwn(statuses, error.code) ? statuses[error.code] : undefined;
        if (status) return reply.code(status).send({ error: { code: error.code, message: status === 403 ? 'Access denied' : 'Store settings read rejected' } });
      }
      const code = (error as { code?: string }).code;
      if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') return reply.code(413).send({ error: { code: 'BODY_TOO_LARGE', message: 'Request body is too large' } });
      if (code === 'FST_ERR_CTP_INVALID_JSON_BODY' || code === 'FST_ERR_CTP_EMPTY_JSON_BODY') return reply.code(400).send({ error: { code: 'INVALID_JSON', message: 'A valid JSON body is required' } });
      if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return reply.code(415).send({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Use application/json' } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'The store settings read could not be completed' } });
    });
    for (const kind of ['stores', 'warehouses'] as const) for (const operation of ['list', 'detail'] as const) {
      app.post(`/store-settings-read/${kind}/${operation === 'list' ? '' : 'detail/'}query`, { bodyLimit: 8192 }, async (request, reply) => {
        if (!request.query || typeof request.query !== 'object' || Array.isArray(request.query) || Object.keys(request.query).length) invalidStoreSettingsQuery();
        if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return reply.code(415).send({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Use application/json' } });
        const actor = actors.get(request), state = reads.get(request); if (!actor || !state) throw new Error('Missing trusted store settings context');
        return reply.type('application/json').send(await (operation === 'list' ? service.readList(actor, kind, request.body, state.controller.signal) : service.readDetail(actor, kind, request.body, state.controller.signal)));
      });
    }
  };
}
