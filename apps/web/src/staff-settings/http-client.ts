import { HttpQueryError, type HttpQueryOptions } from '../transport/http-query.ts';
import { createOrganizationMaintenanceReadClient } from '../settings/stores/maintenance-http-client.ts';
import type { StaffSettingsReader, AccountSettingsReader } from './contracts.ts';
import { projectStaffSettingsRecord, projectAccountSettingsRecord } from './response-validation.ts';

/** Paired native STAFF reads support ALL/open/closed; closed requires an existing disabled account. */
export function createStaffSettingsHttpReader(options: HttpQueryOptions): StaffSettingsReader {
  const client = createOrganizationMaintenanceReadClient(options);
  return Object.freeze<StaffSettingsReader>({ capabilities: Object.freeze({ roleFilter: true, loginStatusFilter: true, loginNameSearch: true }),
    async readList(read) {
      const query = read.parameters;
      if (query.loginStatus !== '' && query.loginStatus !== 'open' && query.loginStatus !== 'closed') throw new HttpQueryError('invalid-request', 'INVALID_STAFF_QUERY');
      if (!['在职', '离职', 'all'].includes(query.employmentStatus)) throw new HttpQueryError('invalid-request', 'INVALID_STAFF_QUERY');
      // Keep role present even for ALL; the shared native parser validates its exact enum.
      const parameters = { search: query.search, status: query.employmentStatus === '在职' ? 'normal' as const : query.employmentStatus === '离职' ? 'disabled' as const : 'all' as const,
        hallId: query.hallId, page: query.page, pageSize: query.pageSize, role: query.role, loginStatus: query.loginStatus };
      const result = await client.readList('STAFF', parameters, read.signal);
      return { page: result.page, pageSize: result.pageSize, total: result.total, items: result.items.map(projectStaffSettingsRecord) };
    },
    async readDetail(read) {
      const result = await client.readDetail('STAFF', read.parameters.id, read.signal);
      return result === null ? null : projectStaffSettingsRecord(result);
    },
  });
}
/** Separate native account identity, never a credential read. */
export function createAccountSettingsHttpReader(options: HttpQueryOptions): AccountSettingsReader {
  const client = createOrganizationMaintenanceReadClient(options);
  return Object.freeze<AccountSettingsReader>({
    async readList(read) {
      const result = await client.readList('ACCOUNT', read.parameters, read.signal);
      return { page: result.page, pageSize: result.pageSize, total: result.total, items: result.items.map(projectAccountSettingsRecord) };
    },
    async readDetail(read) {
      const result = await client.readDetail('ACCOUNT', read.parameters.id, read.signal);
      return result === null ? null : projectAccountSettingsRecord(result);
    },
  });
}

import { StaffClientError, type StaffCommandClient } from './contracts.ts';
import { validateStaffCommand, staffReceiptIdentity, validateStaffReceiptIdentity, validateStaffResult, validateStaffReceipt } from './response-validation.ts';

const MAX_REQUEST_BYTES = 16_384;
const MAX_RESPONSE_CHUNKS = 65_536;
const commandCodes: Readonly<Record<number, readonly string[]>> = {
  400: ['INVALID_STAFF_COMMAND', 'INVALID_ACCOUNT_COMMAND', 'INVALID_ACCOUNT_PASSWORD', 'INVALID_PARTY_INPUT', 'INVALID_ID', 'INVALID_HTTP_INPUT', 'INVALID_REQUEST', 'INVALID_JSON'],
  401: ['UNAUTHENTICATED'], 403: ['FORBIDDEN'], 404: ['STAFF_NOT_FOUND'],
  409: ['VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'VERSION_STORAGE_OVERFLOW', 'NO_STAFF_CHANGE', 'INVALID_STAFF_STATE', 'INVALID_STAFF_ACCOUNT_STATE', 'STAFF_REFERENCE_UNAVAILABLE', 'LAST_AVAILABLE_ADMIN', 'ACCOUNT_LOGIN_CONFLICT'],
  413: ['BODY_TOO_LARGE'], 415: ['UNSUPPORTED_MEDIA_TYPE'], 503: ['ACCOUNT_CREDENTIALS_NOT_READY'], 500: ['INTERNAL_ERROR'],
};
const receiptCodes: Readonly<Record<number, readonly string[]>> = {
  400: commandCodes[400]!, 401: ['UNAUTHENTICATED'], 403: ['FORBIDDEN'], 404: ['RECEIPT_NOT_FOUND'], 500: ['INTERNAL_ERROR'],
};
function resourceLimit(value: number | undefined, fallback: number, maximum: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new TypeError('Invalid staff HTTP resource limit.');
  return result;
}
function endpointBase(options: HttpQueryOptions): string {
  let origin: URL;
  try { origin = new URL(options?.origin); } catch { throw new TypeError('An explicit HTTP application origin is required.'); }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== options.origin || origin.username || origin.password
    || typeof options.fetch !== 'function' || typeof options.basePath !== 'string'
    || (options.basePath !== '' && !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(options.basePath))) {
    throw new TypeError('An explicit same-origin staff HTTP client is required.');
  }
  return `${origin.origin}${options.basePath.replace(/\/$/, '')}`;
}
function cancelBody(response: Response): void {
  try { void response.body?.cancel().catch(() => {}); } catch { /* Cleanup never replaces a safe failure. */ }
}
function waitFor<T>(pending: Promise<T>, signal: AbortSignal, interrupted: () => StaffClientError): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(interrupted()); };
    signal.addEventListener('abort', abort, { once: true });
    // Always consume a late result/rejection, even when the injected fetch ignores abort.
    pending.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
  });
}
function knownError(status: number, value: unknown, write: boolean): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'error')) return;
  const error = (value as { error: unknown }).error;
  if (!error || typeof error !== 'object' || Array.isArray(error) || Object.keys(error).length !== 2
    || !Object.hasOwn(error, 'code') || !Object.hasOwn(error, 'message')) return;
  const row = error as { code: unknown; message: unknown };
  if (typeof row.code === 'string' && typeof row.message === 'string' && (write ? commandCodes : receiptCodes)[status]?.includes(row.code)) return row.code;
}
function statusKind(status: number): StaffClientError['kind'] {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if ([400, 413, 415, 422].includes(status)) return 'invalid-request';
  return 'server';
}

/** Inert, same-origin command/receipt transport. No retry or production gate is installed here. */
export function createStaffSettingsCommandClient(options: HttpQueryOptions): StaffCommandClient {
  const base = endpointBase(options), fetch = options.fetch;
  const limit = resourceLimit(options.maxResponseBytes, 8 * 1024 * 1024, 32 * 1024 * 1024);
  const timeoutMs = resourceLimit(options.timeoutMs, 30_000, 120_000);
  function checked<T>(read: () => T, write = false): T {
    try { return read(); }
    catch { throw new StaffClientError('invalid-request', 'INVALID_STAFF_COMMAND', write ? 'not-sent' : 'read'); }
  }
  async function request<T>(path: string, callerSignal: AbortSignal, validate: (value: unknown) => T, body?: unknown): Promise<T> {
    const write = body !== undefined;
    let dispatched = false, status: number | null = null;
    const outcome = () => write ? (dispatched ? 'uncertain' : 'not-sent') : 'read';
    const fail = (kind: StaffClientError['kind'], code: string) => new StaffClientError(kind, code, outcome(), status);
    if (callerSignal.aborted) throw fail('aborted', 'STAFF_ABORTED');
    let payload: string | undefined;
    if (write) {
      try { payload = JSON.stringify(body); if (typeof payload !== 'string') throw new Error(); }
      catch { throw fail('invalid-request', 'INVALID_STAFF_COMMAND'); }
      if (new TextEncoder().encode(payload).byteLength > MAX_REQUEST_BYTES) throw fail('invalid-request', 'REQUEST_TOO_LARGE');
    }
    const controller = new AbortController();
    const signal = AbortSignal.any([callerSignal, controller.signal]);
    const deadline = performance.now() + timeoutMs;
    let timedOut = false;
    const interrupted = () => fail(timedOut && !callerSignal.aborted ? 'timeout' : 'aborted', timedOut && !callerSignal.aborted ? 'STAFF_TIMEOUT' : 'STAFF_ABORTED');
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
        try { code = knownError(response.status, await json(response, Math.min(limit, 16_384)), write); }
        catch { checkpoint(); }
        checkpoint();
        if (!code) {
          // Authentication status invalidates the current trusted UI scope even if a
          // proxy returned HTML. It does not prove a dispatched command was rejected.
          if (response.status === 401 || response.status === 403) throw fail(statusKind(response.status), response.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN');
          throw fail('malformed-response', 'INVALID_ERROR_RESPONSE');
        }
        // Frozen W8 checks credential availability before opening the write transaction.
        const rejected = response.status >= 400 && response.status < 500 || response.status === 503 && code === 'ACCOUNT_CREDENTIALS_NOT_READY';
        throw new StaffClientError(statusKind(response.status), code, write ? (rejected ? 'rejected' : 'uncertain') : 'read', response.status);
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
      if (error instanceof StaffClientError) throw error;
      throw fail('network', 'NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  return Object.freeze<StaffCommandClient>({
    execute(command, signal) {
      const input = checked(() => validateStaffCommand(command), true), original = staffReceiptIdentity(input);
      if ((input.action === 'CREATE' || input.action === 'EDIT') && input.account?.password != null && new URL(base).protocol !== 'https:') {
        return Promise.reject(new StaffClientError('invalid-request', 'HTTPS_REQUIRED', 'not-sent'));
      }
      // Response validation retains only the safe original identity, never a password-bearing command.
      return request('/staff/commands', signal, value => validateStaffResult(value, original), input);
    },
    receipt(identity, signal) {
      const original = checked(() => validateStaffReceiptIdentity(identity));
      return request(`/staff/receipts/${encodeURIComponent(original.requestKey)}`, signal, value => validateStaffReceipt(value, original));
    },
  });
}
