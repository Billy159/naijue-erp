/** Small read-only HTTP boundary. Authentication is the server's same-origin session,
 * never QueryRead.identity, a browser role, or a synthetic fallback. */
export type QueryFetch = (input: string, init: RequestInit) => Promise<Response>;
export interface HttpQueryOptions {
  readonly fetch: QueryFetch;
  /** Explicit current application origin, normally location.origin. No credentials/path. */
  readonly origin: string;
  /** Explicit deployment prefix, e.g. '' or '/api'. Not a URL, query, or fragment. */
  readonly basePath: string;
  /** Technical decoded JSON limit, not an approved catalog/performance budget. Default 8 MiB. */
  readonly maxResponseBytes?: number;
  /** Includes fetch and streamed body. Default 30 seconds; never starts a retry. */
  readonly timeoutMs?: number;
}
export type HttpQueryErrorKind = 'unauthenticated' | 'forbidden' | 'conflict' | 'unavailable'
  | 'not-found' | 'not-implemented' | 'invalid-request' | 'too-large' | 'network'
  | 'aborted' | 'timeout' | 'malformed-response' | 'http';
const messages: Readonly<Record<HttpQueryErrorKind, string>> = {
  unauthenticated: 'Authentication is required for this read.', forbidden: 'This read is not authorized.',
  conflict: 'This read conflicts with the current server state.', unavailable: 'The requested facts are not available yet.',
  'not-found': 'The requested read target was not found.', 'not-implemented': 'This read capability is not configured.',
  'invalid-request': 'The read parameters were rejected.', 'too-large': 'The read exceeds a technical size limit.',
  network: 'The read could not reach the server.', aborted: 'The read was cancelled.', timeout: 'The read timed out.',
  'malformed-response': 'The server did not return a valid read response.', http: 'The server could not complete this read.',
};
/** Safe to show or inspect. Never retains a server message, URL, body, or raw exception/cause. */
export class HttpQueryError extends Error {
  readonly kind: HttpQueryErrorKind;
  readonly code: string;
  readonly status: number | null;
  constructor(kind: HttpQueryErrorKind, code: string, status: number | null = null) {
    super(messages[kind]); this.name = kind === 'aborted' ? 'AbortError' : 'HttpQueryError';
    this.kind = kind; this.code = code; this.status = status;
  }
}
const MAX_REQUEST_BYTES = 65_536;
const MAX_RESPONSE_CHUNKS = 65_536;
const serverCodes: Readonly<Record<number, readonly string[]>> = {
  400: ['INVALID_INVENTORY_INPUT', 'INVALID_PRODUCT_QUERY', 'INVALID_JSON'], 401: ['UNAUTHENTICATED'],
  403: ['FORBIDDEN'], 404: ['PRODUCT_IMAGE_NOT_FOUND'], 408: ['INVENTORY_READ_ABORTED', 'PRODUCT_READ_ABORTED'],
  409: ['CONFLICT'], 413: ['BODY_TOO_LARGE', 'PRODUCT_READ_TOO_LARGE'], 415: ['UNSUPPORTED_MEDIA_TYPE'],
  500: ['INTERNAL_ERROR'], 501: ['PRODUCT_MEDIA_NOT_IMPLEMENTED'], 503: ['INVENTORY_NOT_READY', 'SERVICE_UNAVAILABLE'],
};
function statusError(status: number, code?: string): HttpQueryError {
  const kinds: Readonly<Record<number, HttpQueryErrorKind>> = { 400: 'invalid-request', 401: 'unauthenticated',
    403: 'forbidden', 404: 'not-found', 408: 'aborted', 409: 'conflict', 413: 'too-large', 415: 'invalid-request',
    501: 'not-implemented', 503: 'unavailable' };
  const fallback: Readonly<Record<number, string>> = { 400: 'INVALID_QUERY', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN',
    404: 'NOT_FOUND', 408: 'READ_ABORTED', 409: 'CONFLICT', 413: 'READ_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE',
    500: 'INTERNAL_ERROR', 501: 'NOT_IMPLEMENTED', 503: 'SERVICE_UNAVAILABLE' };
  return new HttpQueryError(kinds[status] ?? 'http', code ?? fallback[status] ?? 'HTTP_ERROR', status);
}
function boundedOption(value: number | undefined, fallback: number, maximum: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new TypeError('Invalid HTTP query resource limit.');
  return result;
}
function endpointBase(origin: string, basePath: string): string {
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new TypeError('An explicit HTTP application origin is required.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) {
    throw new TypeError('An explicit HTTP application origin without credentials or path is required.');
  }
  // Deliberately disallow URL escapes, dot segments, backslashes, encoded separators and whitespace.
  if (typeof basePath !== 'string' || (basePath !== '' && !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(basePath))) {
    throw new TypeError('A same-origin deployment basePath is required.');
  }
  return `${parsed.origin}${basePath.replace(/\/$/, '')}`;
}
function interrupted(timedOut: () => boolean): HttpQueryError {
  return timedOut() ? new HttpQueryError('timeout', 'QUERY_TIMEOUT') : new HttpQueryError('aborted', 'QUERY_ABORTED');
}
function abortable<T>(pending: Promise<T>, signal: AbortSignal, timedOut: () => boolean): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => { cleanup(); reject(interrupted(timedOut)); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    // Install handlers even on an already-aborted read so late rejection is always consumed.
    pending.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
  });
}
function cancelBody(response: Response): void {
  try { void response.body?.cancel().catch(() => {}); } catch { /* Cleanup must not mask the safe error. */ }
}
function jsonContent(response: Response): boolean {
  return response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() === 'application/json';
}
async function boundedJson(response: Response, signal: AbortSignal, timedOut: () => boolean, limit: number, ensureActive: () => void): Promise<unknown> {
  try { ensureActive(); } catch (error) { cancelBody(response); throw error; }
  if (!jsonContent(response) || !response.body) { cancelBody(response); throw new HttpQueryError('malformed-response', 'INVALID_RESPONSE'); }
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) {
    cancelBody(response); throw new HttpQueryError('malformed-response', 'INVALID_RESPONSE');
  }
  if (declared !== null && Number(declared) > limit) { cancelBody(response); throw new HttpQueryError('too-large', 'RESPONSE_TOO_LARGE'); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0, count = 0, finished = false;
  const abort = () => { try { void reader.cancel().catch(() => {}); } catch { /* Best-effort detach. */ } };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      ensureActive();
      const part = await abortable(reader.read(), signal, timedOut);
      ensureActive();
      if (part.done) { finished = true; break; }
      length += part.value.byteLength; count++;
      if (length > limit || count > MAX_RESPONSE_CHUNKS) throw new HttpQueryError('too-large', 'RESPONSE_TOO_LARGE');
      chunks.push(part.value);
    }
    ensureActive();
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { ensureActive(); bytes.set(chunk, offset); offset += chunk.byteLength; }
    let text: string, data: unknown;
    ensureActive();
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { ensureActive(); throw new HttpQueryError('malformed-response', 'INVALID_RESPONSE'); }
    ensureActive();
    try { data = JSON.parse(text) as unknown; }
    catch { ensureActive(); throw new HttpQueryError('malformed-response', 'INVALID_RESPONSE'); }
    ensureActive();
    return data;
  } finally {
    signal.removeEventListener('abort', abort);
    if (!finished) abort();
    try { reader.releaseLock(); } catch { /* A broken/aborted stream must not retain the query. */ }
  }
}
export interface HttpJsonQuery {
  post<T>(path: string, body: unknown, signal: AbortSignal, validate: (value: unknown) => T): Promise<T>;
}
/** Construction is inert. One explicit call makes at most one structured JSON POST. */
export function createHttpJsonQuery(options: HttpQueryOptions): HttpJsonQuery {
  if (typeof options?.fetch !== 'function') throw new TypeError('An injected fetch implementation is required.');
  const fetch = options.fetch, base = endpointBase(options.origin, options.basePath);
  const limit = boundedOption(options.maxResponseBytes, 8 * 1024 * 1024, 32 * 1024 * 1024);
  const timeoutMs = boundedOption(options.timeoutMs, 30_000, 120_000);
  return Object.freeze({ async post<T>(path: string, body: unknown, callerSignal: AbortSignal, validate: (value: unknown) => T): Promise<T> {
    // Only local fixed route suffixes, never a caller-supplied absolute URL.
    if (!/^\/(?:[a-z-]+\/)*[a-z-]+$/.test(path)) throw new HttpQueryError('invalid-request', 'INVALID_QUERY_ROUTE');
    if (callerSignal.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    let payload: string;
    try {
      const serialized = JSON.stringify(body);
      if (typeof serialized !== 'string') throw new Error();
      payload = serialized;
    } catch { throw new HttpQueryError('invalid-request', 'INVALID_QUERY_BODY'); }
    if (new TextEncoder().encode(payload).byteLength > MAX_REQUEST_BYTES) throw new HttpQueryError('too-large', 'REQUEST_TOO_LARGE');
    const controller = new AbortController();
    const deadline = performance.now() + timeoutMs;
    let timeout = false;
    const timer = setTimeout(() => { timeout = true; controller.abort(); }, timeoutMs);
    const signal = AbortSignal.any([callerSignal, controller.signal]);
    const timedOut = () => timeout && !callerSignal.aborted;
    // Immediate stream promises can starve the timer's task queue. Check the same
    // monotonic budget synchronously as well; timers still detach stalled promises.
    const ensureActive = () => {
      if (callerSignal.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
      if (timeout || performance.now() >= deadline) { timeout = true; controller.abort(); throw interrupted(timedOut); }
      if (signal.aborted) throw interrupted(timedOut);
    };
    const url = `${base}${path}`;
    try {
      const pending = Promise.resolve().then(() => {
        ensureActive();
        return fetch(url, { method: 'POST', mode: 'same-origin', credentials: 'same-origin', cache: 'no-store',
          redirect: 'error', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: payload, signal });
      });
      void pending.then(response => { if (signal.aborted) cancelBody(response); }, () => {});
      const response = await abortable(pending, signal, timedOut);
      try { ensureActive(); } catch (error) { cancelBody(response); throw error; }
      if (response.redirected || response.type === 'opaqueredirect' || (response.url && response.url !== url)) {
        cancelBody(response); throw new HttpQueryError('malformed-response', 'UNEXPECTED_REDIRECT');
      }
      if (!response.ok) {
        let code: string | undefined;
        try {
          const data = await boundedJson(response, signal, timedOut, Math.min(limit, 16_384), ensureActive);
          if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 1 && 'error' in data) {
            const error = data.error;
            if (error && typeof error === 'object' && !Array.isArray(error) && Object.keys(error).length === 2
              && 'code' in error && typeof error.code === 'string' && 'message' in error && typeof error.message === 'string'
              && serverCodes[response.status]?.includes(error.code)) code = error.code;
          }
        } catch { ensureActive(); /* Status remains authoritative for malformed error bodies. */ }
        throw statusError(response.status, code);
      }
      if (response.status !== 200) { cancelBody(response); throw new HttpQueryError('malformed-response', 'INVALID_RESPONSE'); }
      const data = await boundedJson(response, signal, timedOut, limit, ensureActive);
      ensureActive();
      let result: T;
      try { result = validate(data); } catch { ensureActive(); throw new HttpQueryError('malformed-response', 'INVALID_RESPONSE'); }
      // Synchronous decode/validation cannot be preempted, but may never publish
      // a success after the elapsed budget has expired.
      ensureActive();
      return result;
    } catch (error: unknown) {
      ensureActive();
      if (error instanceof HttpQueryError) throw error;
      throw new HttpQueryError('network', 'NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  } });
}
