import { entityId } from '../../../../packages/domain/src/values.ts';
import { AuthClientError, validLoginInput, validPasswordInput, type AuthClient, type AuthenticationPrincipal, type LoginResult } from './contracts.ts';

export interface AuthHttpOptions {
  /** Exact configured HTTPS application origin, normally the trusted host's location.origin. */
  readonly origin: string;
  /** Explicit deployment prefix, e.g. '' or '/api'. Never an absolute URL. */
  readonly basePath: string;
  readonly fetch: (input: string, init: RequestInit) => Promise<Response>;
  /** Technical timeout only; writes are never retried automatically. Default 30 seconds. */
  readonly timeoutMs?: number;
}
const MAX_RESPONSE_BYTES = 16_384;
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) throw new AuthClientError('invalid-response');
  return value as Record<string, unknown>;
}
function principal(value: unknown): AuthenticationPrincipal {
  const row = record(value, ['accountId', 'staffId', 'loginName', 'role', 'hallId', 'authVersion']);
  if (typeof row.accountId !== 'string' || typeof row.staffId !== 'string' || typeof row.loginName !== 'string' || !row.loginName
    || new TextEncoder().encode(row.loginName).byteLength > 256 || typeof row.role !== 'string' || !row.role || row.role.length > 1024
    || !Number.isSafeInteger(row.authVersion) || (row.authVersion as number) < 1 || (row.hallId !== null && typeof row.hallId !== 'string')) throw new AuthClientError('invalid-response');
  try {
    return Object.freeze({ accountId: entityId('account', row.accountId), staffId: entityId('staff', row.staffId), loginName: row.loginName,
      role: row.role, hallId: row.hallId === null ? null : entityId('hall', row.hallId), authVersion: row.authVersion as number });
  } catch { throw new AuthClientError('invalid-response'); }
}
function loginResult(value: unknown): LoginResult {
  const row = record(value, ['principal', 'expiresAt']);
  if (typeof row.expiresAt !== 'string' || !Number.isFinite(Date.parse(row.expiresAt)) || new Date(row.expiresAt).toISOString() !== row.expiresAt) throw new AuthClientError('invalid-response');
  return Object.freeze({ principal: principal(row.principal), expiresAt: row.expiresAt });
}
function cancelBody(response: Response): void {
  try { void response.body?.cancel().catch(() => {}); } catch { /* Best effort; never retain response data. */ }
}
function waitFor<T>(pending: Promise<T>, signal: AbortSignal, interrupted: () => AuthClientError): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(interrupted()); };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
  });
}
async function json(response: Response, signal: AbortSignal, interrupted: () => AuthClientError, checkpoint: () => void): Promise<unknown> {
  checkpoint();
  if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json' || !response.body) {
    cancelBody(response); throw new AuthClientError('invalid-response');
  }
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > MAX_RESPONSE_BYTES)) {
    cancelBody(response); throw new AuthClientError('invalid-response');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0, complete = false;
  const abort = () => { try { void reader.cancel().catch(() => {}); } catch { /* Best effort. */ } };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      checkpoint();
      const chunk = await waitFor(reader.read(), signal, interrupted);
      checkpoint();
      if (chunk.done) { complete = true; break; }
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES || chunks.length >= MAX_RESPONSE_BYTES) throw new AuthClientError('invalid-response');
      chunks.push(chunk.value);
    }
    checkpoint();
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let decoded: string;
    try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { checkpoint(); throw new AuthClientError('invalid-response'); }
    checkpoint();
    let parsed: unknown;
    try { parsed = JSON.parse(decoded) as unknown; }
    catch { checkpoint(); throw new AuthClientError('invalid-response'); }
    checkpoint();
    return parsed;
  } finally {
    signal.removeEventListener('abort', abort);
    if (!complete) abort();
    try { reader.releaseLock(); } catch { /* Detach a cancelled stream. */ }
  }
}
function errorKind(status: number, body: unknown): AuthClientError {
  let code: unknown;
  if (body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object' && 'code' in body.error) code = body.error.code;
  if (status === 401) return new AuthClientError(code === 'INVALID_CREDENTIALS' ? 'credentials' : 'unauthenticated');
  if (status === 422 && code === 'PASSWORD_REJECTED') return new AuthClientError('password-rejected');
  if (status === 403) return new AuthClientError('forbidden');
  if ([400, 413, 415].includes(status)) return new AuthClientError('invalid-input');
  return new AuthClientError('server');
}
/** Inert construction; each explicit action invokes one fixed same-origin endpoint at most once. */
export function createAuthHttpClient(options: AuthHttpOptions): AuthClient {
  let origin: URL;
  try { origin = new URL(options?.origin); } catch { throw new TypeError('An explicit HTTPS application origin is required.'); }
  if (origin.protocol !== 'https:' || origin.origin !== options.origin || origin.username || origin.password
    || typeof options.fetch !== 'function' || typeof options.basePath !== 'string'
    || (options.basePath !== '' && !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(options.basePath))) throw new TypeError('An explicit same-origin HTTPS authentication client is required.');
  const fetch = options.fetch, base = `${origin.origin}${options.basePath.replace(/\/$/, '')}`;
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new TypeError('Invalid authentication timeout.');
  async function request<T>(path: '/auth/login' | '/auth/session' | '/auth/logout' | '/auth/password', body: unknown, callerSignal: AbortSignal, validate: (value: unknown) => T): Promise<T> {
    if (callerSignal.aborted) throw new AuthClientError('aborted');
    const controller = new AbortController(); let timedOut = false;
    // A timer alone can be starved by synchronously resolved fetch/body microtasks.
    const deadline = performance.now() + timeoutMs;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const signal = AbortSignal.any([callerSignal, controller.signal]);
    const interrupted = () => new AuthClientError(timedOut && !callerSignal.aborted ? 'timeout' : 'aborted');
    const checkpoint = () => {
      if (!callerSignal.aborted && performance.now() >= deadline) { timedOut = true; controller.abort(); }
      if (signal.aborted) throw interrupted();
    };
    let response: Response | null = null;
    const url = `${base}${path}`;
    try {
      const init: RequestInit = { method: path === '/auth/session' ? 'GET' : 'POST', mode: 'same-origin', credentials: 'same-origin',
        cache: 'no-store', redirect: 'error', headers: path === '/auth/session' ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' }, signal };
      if (path !== '/auth/session') init.body = JSON.stringify(body);
      checkpoint();
      const pending = Promise.resolve().then(() => { checkpoint(); return fetch(url, init); });
      void pending.then(response => { if (signal.aborted) cancelBody(response); }, () => {});
      response = await waitFor(pending, signal, interrupted);
      checkpoint();
      if (response.redirected || response.type === 'opaqueredirect' || (response.url && response.url !== url)) {
        cancelBody(response); throw new AuthClientError('invalid-response');
      }
      if (!response.ok) {
        let data: unknown = null;
        try { data = await json(response, signal, interrupted, checkpoint); } catch { checkpoint(); }
        checkpoint();
        throw errorKind(response.status, data);
      }
      if (path === '/auth/logout' || path === '/auth/password') {
        cancelBody(response);
        if (response.status !== 204) throw new AuthClientError('invalid-response');
        const result = validate(undefined); checkpoint(); return result;
      }
      if (response.status !== 200) { cancelBody(response); throw new AuthClientError('invalid-response'); }
      const data = await json(response, signal, interrupted, checkpoint);
      checkpoint();
      const result = validate(data);
      checkpoint(); return result;
    } catch (error: unknown) {
      try { checkpoint(); } catch (interruption: unknown) { if (response) cancelBody(response); throw interruption; }
      if (error instanceof AuthClientError) throw error;
      throw new AuthClientError('network');
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({
    async login(input, signal) {
      if (!validLoginInput(input)) throw new AuthClientError('invalid-input');
      return request('/auth/login', { loginName: input.loginName, password: input.password }, signal, loginResult);
    },
    session: signal => request('/auth/session', undefined, signal, value => {
      const row = record(value, ['principal']); return row.principal === null ? null : principal(row.principal);
    }),
    logout: signal => request('/auth/logout', {}, signal, () => undefined),
    async changeOwnPassword(input, signal) {
      if (!validPasswordInput(input?.currentPassword) || !validPasswordInput(input?.newPassword)) throw new AuthClientError('invalid-input');
      return request('/auth/password', { currentPassword: input.currentPassword, newPassword: input.newPassword }, signal, () => undefined);
    },
  } satisfies AuthClient);
}
