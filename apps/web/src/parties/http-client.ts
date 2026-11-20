import type { HttpQueryOptions } from '../transport/http-query.ts';
import { PartyClientError, type PartyClient, type PartyKind } from './contracts.ts';
import { validId, validKey, validateCandidateSearch, validateCandidates, validateCommand, validateDetail, validateKind,
  validateList, validateReceipt, validateResult, validateSearch } from './response-validation.ts';

export type { HttpQueryOptions } from '../transport/http-query.ts';

const MAX_REQUEST_BYTES = 8192;
const MAX_RESPONSE_CHUNKS = 65_536;
const codes: Readonly<Record<number, readonly string[]>> = {
  400: ['INVALID_PARTY_INPUT', 'INVALID_ID', 'INVALID_VERSION', 'INVALID_HTTP_INPUT', 'INVALID_JSON'],
  401: ['UNAUTHENTICATED'], 403: ['FORBIDDEN'], 404: ['PARTY_NOT_FOUND', 'RECEIPT_NOT_FOUND'],
  409: ['VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'PARTY_CODE_CONFLICT', 'PARTY_CODE_EXHAUSTED',
    'CUSTOMER_DEFAULT_IN_USE', 'INVALID_PARTY_STATE', 'NO_PARTY_CHANGE', 'VERSION_STORAGE_OVERFLOW'],
  413: ['BODY_TOO_LARGE'], 415: ['UNSUPPORTED_MEDIA_TYPE'], 422: ['PARTY_READ_TOO_LARGE'],
  500: ['INTERNAL_ERROR'],
};
function resourceLimit(value: number | undefined, fallback: number, maximum: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new TypeError('Invalid party HTTP resource limit.');
  return result;
}
function endpointBase(options: HttpQueryOptions): string {
  let origin: URL;
  try { origin = new URL(options?.origin); } catch { throw new TypeError('An explicit HTTP application origin is required.'); }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== options.origin || origin.username || origin.password
    || typeof options.fetch !== 'function' || typeof options.basePath !== 'string'
    || (options.basePath !== '' && !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(options.basePath))) {
    throw new TypeError('An explicit same-origin party HTTP client is required.');
  }
  return `${origin.origin}${options.basePath.replace(/\/$/, '')}`;
}
function family(kind: PartyKind): '/customers' | '/suppliers' {
  validateKind(kind);
  if (kind === 'CUSTOMER') return '/customers';
  if (kind === 'SUPPLIER') return '/suppliers';
  throw new Error('Invalid party kind.');
}
function cancelBody(response: Response): void {
  try { void response.body?.cancel().catch(() => {}); } catch { /* Cleanup never replaces a safe failure. */ }
}
function waitFor<T>(pending: Promise<T>, signal: AbortSignal, interrupted: () => PartyClientError): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(interrupted()); };
    signal.addEventListener('abort', abort, { once: true });
    // Always consume a late result/rejection, even when the injected fetch ignores abort.
    pending.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
  });
}
function knownError(status: number, value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'error')) return;
  const error = (value as { error: unknown }).error;
  if (!error || typeof error !== 'object' || Array.isArray(error) || Object.keys(error).length !== 2
    || !Object.hasOwn(error, 'code') || !Object.hasOwn(error, 'message')) return;
  const row = error as { code: unknown; message: unknown };
  if (typeof row.code === 'string' && typeof row.message === 'string' && codes[status]?.includes(row.code)) return row.code;
}
function statusKind(status: number): PartyClientError['kind'] {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if ([400, 413, 415, 422].includes(status)) return 'invalid-request';
  return 'server';
}

/** Inert composition with the shared read boundary's configuration and safety pattern.
 * The existing read-only POST primitive cannot express these exact GET routes or retain
 * native party rejection codes and uncertain write outcomes. This local transport is
 * deliberately limited to the five PartyClient operations, with no generic public send
 * method, actor/role inference, automatic retries, or cross-origin route input. */
export function createPartyHttpClient(options: HttpQueryOptions): PartyClient {
  const base = endpointBase(options), fetch = options.fetch;
  const limit = resourceLimit(options.maxResponseBytes, 8 * 1024 * 1024, 32 * 1024 * 1024);
  const timeoutMs = resourceLimit(options.timeoutMs, 30_000, 120_000);
  function checked<T>(read: () => T, write = false): T {
    try { return read(); }
    catch { throw new PartyClientError('invalid-request', 'INVALID_PARTY_INPUT', write ? 'not-sent' : 'read'); }
  }
  async function request<T>(path: string, callerSignal: AbortSignal, validate: (value: unknown) => T, body?: unknown): Promise<T> {
    const write = body !== undefined;
    let dispatched = false, status: number | null = null;
    const outcome = () => write ? (dispatched ? 'uncertain' : 'not-sent') : 'read';
    const fail = (kind: PartyClientError['kind'], code: string) => new PartyClientError(kind, code, outcome(), status);
    if (callerSignal.aborted) throw fail('aborted', 'PARTY_ABORTED');
    let payload: string | undefined;
    if (write) {
      try { payload = JSON.stringify(body); if (typeof payload !== 'string') throw new Error(); }
      catch { throw fail('invalid-request', 'INVALID_PARTY_INPUT'); }
      if (new TextEncoder().encode(payload).byteLength > MAX_REQUEST_BYTES) throw fail('invalid-request', 'REQUEST_TOO_LARGE');
    }
    const controller = new AbortController();
    const signal = AbortSignal.any([callerSignal, controller.signal]);
    const deadline = performance.now() + timeoutMs;
    let timedOut = false;
    const interrupted = () => fail(timedOut && !callerSignal.aborted ? 'timeout' : 'aborted', timedOut && !callerSignal.aborted ? 'PARTY_TIMEOUT' : 'PARTY_ABORTED');
    const checkpoint = () => {
      if (callerSignal.aborted) throw interrupted();
      if (timedOut || performance.now() >= deadline) { timedOut = true; controller.abort(); throw interrupted(); }
      if (signal.aborted) throw interrupted();
    };
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    let response: Response | null = null;
    async function json(response: Response, maximum: number): Promise<unknown> {
      try { checkpoint(); } catch (error) { cancelBody(response); throw error; }
      if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json' || !response.body) {
        cancelBody(response); throw fail('malformed-response', 'INVALID_RESPONSE');
      }
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) {
        cancelBody(response); throw fail('malformed-response', 'INVALID_RESPONSE');
      }
      if (declared !== null && Number(declared) > maximum) { cancelBody(response); throw fail('malformed-response', 'RESPONSE_TOO_LARGE'); }
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let length = 0, finished = false;
      const abort = () => { try { void reader.cancel().catch(() => {}); } catch { /* Best effort detach. */ } };
      signal.addEventListener('abort', abort, { once: true });
      try {
        while (true) {
          checkpoint();
          const part = await waitFor(reader.read(), signal, interrupted);
          checkpoint();
          if (part.done) { finished = true; break; }
          length += part.value.byteLength;
          if (length > maximum || chunks.length >= MAX_RESPONSE_CHUNKS) throw fail('malformed-response', 'RESPONSE_TOO_LARGE');
          chunks.push(part.value);
        }
        checkpoint();
        const bytes = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { checkpoint(); bytes.set(chunk, offset); offset += chunk.byteLength; }
        let decoded: string, parsed: unknown;
        try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch { checkpoint(); throw fail('malformed-response', 'INVALID_RESPONSE'); }
        checkpoint();
        try { parsed = JSON.parse(decoded) as unknown; }
        catch { checkpoint(); throw fail('malformed-response', 'INVALID_RESPONSE'); }
        checkpoint(); return parsed;
      } finally {
        signal.removeEventListener('abort', abort);
        if (!finished) abort();
        try { reader.releaseLock(); } catch { /* A broken stream cannot retain a call. */ }
      }
    }
    const url = `${base}${path}`;
    try {
      const init: RequestInit = { method: write ? 'POST' : 'GET', mode: 'same-origin', credentials: 'same-origin', cache: 'no-store',
        redirect: 'error', headers: write ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' }, signal };
      if (payload !== undefined) init.body = payload;
      const pending = Promise.resolve().then(() => {
        checkpoint();
        // From this boundary onward, a missing response cannot prove the command did not commit.
        dispatched = true;
        return fetch(url, init);
      });
      void pending.then(late => { if (signal.aborted) cancelBody(late); }, () => {});
      response = await waitFor(pending, signal, interrupted);
      status = response.status;
      try { checkpoint(); } catch (error) { cancelBody(response); throw error; }
      if (response.redirected || response.type === 'opaqueredirect' || (response.url && response.url !== url)) {
        cancelBody(response); throw fail('malformed-response', 'UNEXPECTED_REDIRECT');
      }
      if (!response.ok) {
        let code: string | undefined;
        try { code = knownError(response.status, await json(response, Math.min(limit, 16_384))); }
        catch { checkpoint(); }
        checkpoint();
        if (!code) {
          // Authentication status invalidates the current trusted UI scope even if a
          // proxy returned HTML. It does not prove a dispatched command was rejected.
          if (response.status === 401 || response.status === 403) throw fail(statusKind(response.status), response.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN');
          throw fail('malformed-response', 'INVALID_ERROR_RESPONSE');
        }
        const rejected = response.status >= 400 && response.status < 500;
        throw new PartyClientError(statusKind(response.status), code, write ? (rejected ? 'rejected' : 'uncertain') : 'read', response.status);
      }
      if (response.status !== 200) { cancelBody(response); throw fail('malformed-response', 'INVALID_RESPONSE'); }
      const data = await json(response, limit);
      checkpoint();
      let result: T;
      try { result = validate(data); }
      catch { checkpoint(); throw fail('malformed-response', 'INVALID_RESPONSE'); }
      checkpoint(); return result;
    } catch (error: unknown) {
      try { checkpoint(); } catch (interruption: unknown) { if (response) cancelBody(response); throw interruption; }
      if (error instanceof PartyClientError) throw error;
      throw fail('network', 'NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({
    async list(kind, parameters, signal) {
      const { path, query } = checked(() => ({ path: family(kind), query: validateSearch(parameters) }));
      const search = new URLSearchParams({ search: query.search, enabled: query.enabled, page: String(query.page), pageSize: String(query.pageSize) });
      return request(`${path}?${search}`, signal, value => validateList(value, query));
    },
    async detail(kind, id, signal) {
      const path = checked(() => { if (!validId(id)) throw new Error(); return `${family(kind)}/${encodeURIComponent(id)}`; });
      return request(path, signal, value => validateDetail(value, id));
    },
    async candidates(kind, parameters, signal) {
      const { path, query } = checked(() => ({ path: family(kind), query: validateCandidateSearch(parameters) }));
      const search = new URLSearchParams({ search: query.search, page: String(query.page), pageSize: String(query.pageSize) });
      return request(`${path}/candidates?${search}`, signal, value => validateCandidates(value, query));
    },
    async execute(kind, command, signal) {
      const { path, input } = checked(() => ({ path: family(kind), input: validateCommand(command) }), true);
      return request(`${path}/commands`, signal, value => validateResult(value, kind, input), input);
    },
    async receipt(kind, requestKey, signal) {
      const path = checked(() => { if (!validKey(requestKey)) throw new Error(); return `${family(kind)}/receipts/${encodeURIComponent(requestKey)}`; });
      return request(path, signal, value => validateReceipt(value, kind, requestKey));
    },
  } satisfies PartyClient);
}
