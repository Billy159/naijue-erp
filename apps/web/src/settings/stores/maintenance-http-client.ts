import type { ReadScope } from '../../loading/read-scope.ts';
import type { PartyClient } from '../../parties/contracts.ts';
import { createHttpJsonQuery, HttpQueryError, type HttpQueryOptions } from '../../transport/http-query.ts';
import type { OrganizationListQuery, OrganizationMaintenanceKind, OrganizationMaintenancePage, OrganizationMaintenanceRecord } from '../../../../../packages/application/src/organization-maintenance-ports.ts';
import { parseOrganizationDetailQuery, parseOrganizationListQuery, projectOrganizationRecord } from '../../../../../packages/application/src/organization-maintenance-validation.ts';
import type { StoreSettingsBrowserReader } from './contracts.ts';
import type { SettingsDirectoryReader } from './maintenance-contracts.ts';

/** Adapts ONLY already-existing reads; no unapproved URL or maintenance command. */
export function createStoreSettingsMaintenanceDirectory(input: {
  readonly scope: ReadScope; readonly reader: StoreSettingsBrowserReader;
  readonly customers?: Pick<PartyClient, 'candidates'>;
}): SettingsDirectoryReader {
  return Object.freeze({ async read(kind, parameters, signal) {
    const scope = input.scope;
    if (!scope.active || signal.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    const combined = AbortSignal.any([scope.signal, signal]);
    if (kind === 'customers') {
      if (!input.customers) throw new HttpQueryError('not-implemented', 'CUSTOMER_DIRECTORY_NOT_CONFIGURED');
      const page = await input.customers.candidates('CUSTOMER', { search: parameters.search, page: parameters.page, pageSize: parameters.pageSize }, combined);
      if (!scope.active || combined.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
      return { ...page, items: page.items.map(item => ({ id: item.id, name: item.name })) };
    }
    if (kind === 'payment-methods') throw new HttpQueryError('not-implemented', 'PAYMENT_DIRECTORY_NOT_CONFIGURED');
    if (kind === 'warehouses' && !parameters.hallId) throw new HttpQueryError('invalid-request', 'WAREHOUSE_HALL_REQUIRED');
    const page = await input.reader.readList(kind === 'halls' ? 'stores' : 'warehouses', {
      identity: scope.identity, routeInstanceId: scope.routeInstanceId, entityId: scope.entityId, signal: combined,
      parameters: { search: parameters.search, status: 'normal', hallId: kind === 'warehouses' ? parameters.hallId : null, page: parameters.page, pageSize: parameters.pageSize },
    });
    if (!scope.active || combined.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    return { ...page, items: page.items.map(item => ({ id: item.id, name: item.name })) };
  } } satisfies SettingsDirectoryReader);
}


const organizationPaths: Readonly<Record<OrganizationMaintenanceKind, string>> = Object.freeze({
  HALL: '/organization/halls', WAREHOUSE: '/organization/warehouses', STAFF: '/staff',
  ACCOUNT: '/accounts', PAYMENT_METHOD: '/payment/methods', PAYMENT_ACCOUNT: '/payment/accounts',
});
export interface OrganizationSettingsReadClient {
  readList(kind: OrganizationMaintenanceKind, parameters: OrganizationListQuery, signal: AbortSignal): Promise<OrganizationMaintenancePage>;
  readDetail(kind: OrganizationMaintenanceKind, id: string, signal: AbortSignal): Promise<OrganizationMaintenanceRecord | null>;
}
function organizationPath(kind: OrganizationMaintenanceKind): string {
  if (!Object.hasOwn(organizationPaths, kind)) throw new HttpQueryError('invalid-request', 'INVALID_SETTINGS_KIND');
  return organizationPaths[kind];
}
function organizationInput<T>(work: () => T): T {
  try { return work(); } catch (error) { if (error instanceof HttpQueryError) throw error; throw new HttpQueryError('invalid-request', 'INVALID_SETTINGS_QUERY'); }
}
function organizationPage(value: unknown, kind: OrganizationMaintenanceKind, query: OrganizationListQuery): OrganizationMaintenancePage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid settings page');
  const page = value as Record<string, unknown>;
  const keys = ['kind', 'page', 'pageSize', 'total', 'items'];
  if (Object.keys(page).length !== keys.length || !keys.every(key => Object.hasOwn(page, key)) || page.kind !== kind
    || page.page !== query.page || page.pageSize !== query.pageSize || typeof page.total !== 'number'
    || !Number.isSafeInteger(page.total) || page.total < 0 || !Array.isArray(page.items)
    || page.items.length !== Math.min(query.pageSize, Math.max(0, page.total - (query.page - 1) * query.pageSize))) throw new Error('Invalid settings page');
  const items = page.items.map(item => projectOrganizationRecord(item, kind));
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Duplicate settings identity');
  return { kind, page: query.page, pageSize: query.pageSize, total: page.total, items };
}
/** Frozen B05-READ-v1 only: six native families, twelve POST reads, no command
 * or receipt route. Shared HTTP retains same-origin cookies, bounds and aborts. */
export function createOrganizationMaintenanceReadClient(options: HttpQueryOptions): OrganizationSettingsReadClient {
  const http = createHttpJsonQuery(options);
  return Object.freeze<OrganizationSettingsReadClient>({
    readList(kind, parameters, signal) {
      const path = organizationPath(kind), query = organizationInput(() => parseOrganizationListQuery({ ...parameters }, kind));
      return http.post(`${path}/query`, query, signal, value => organizationPage(value, kind, query));
    },
    readDetail(kind, id, signal) {
      const path = organizationPath(kind), target = organizationInput(() => parseOrganizationDetailQuery({ id }));
      return http.post(`${path}/detail/query`, { id: target }, signal, value => {
        if (value === null) return null;
        const item = projectOrganizationRecord(value, kind);
        if (item.id !== target) throw new Error('Wrong settings detail target');
        return item;
      });
    },
  });
}
function storeReadProjection(item: OrganizationMaintenanceRecord) {
  if (item.kind === 'HALL') return { kind: 'stores' as const, id: item.id, name: item.name, enabled: item.enabled, version: item.version, createdAt: null, updatedAt: null,
    defaultCustomer: item.defaultCustomer ? { id: item.defaultCustomer.id, name: item.defaultCustomer.name } : null,
    defaultWarehouse: item.defaultSalesWarehouse ? { id: item.defaultSalesWarehouse.id, name: item.defaultSalesWarehouse.name } : null };
  if (item.kind === 'WAREHOUSE') return { kind: 'warehouses' as const, id: item.id, name: item.name, enabled: item.enabled, version: item.version, createdAt: null, updatedAt: null,
    hall: { id: item.hall.id, name: item.hall.name }, stockFacts: null };
  throw new Error('Wrong native settings kind');
}
/** Existing view projection over the new frozen native read API. Native default
 * warehouse hallId remains available from the shared client for future commands. */
export function createOrganizationStoreSettingsReader(options: HttpQueryOptions): StoreSettingsBrowserReader {
  const client = createOrganizationMaintenanceReadClient(options);
  return Object.freeze<StoreSettingsBrowserReader>({
    async readList(kind, read) {
      if (kind !== 'stores' && kind !== 'warehouses') throw new HttpQueryError('invalid-request', 'INVALID_SETTINGS_KIND');
      const page = await client.readList(kind === 'stores' ? 'HALL' : 'WAREHOUSE', read.parameters, read.signal);
      return { page: page.page, pageSize: page.pageSize, total: page.total, items: page.items.map(storeReadProjection) };
    },
    async readDetail(kind, read) {
      if (kind !== 'stores' && kind !== 'warehouses') throw new HttpQueryError('invalid-request', 'INVALID_SETTINGS_KIND');
      const item = await client.readDetail(kind === 'stores' ? 'HALL' : 'WAREHOUSE', read.parameters.id, read.signal);
      return { item: item === null ? null : storeReadProjection(item) };
    },
  });
}
export function createOrganizationSettingsDirectory(input: {
  readonly scope: ReadScope; readonly http: HttpQueryOptions; readonly customers?: Pick<PartyClient, 'candidates'>;
}): SettingsDirectoryReader {
  const client = createOrganizationMaintenanceReadClient(input.http);
  return Object.freeze<SettingsDirectoryReader>({ async read(kind, parameters, signal) {
    const combined = AbortSignal.any([input.scope.signal, signal]);
    if (!input.scope.active || combined.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    if (kind === 'customers') {
      if (!input.customers) throw new HttpQueryError('not-implemented', 'CUSTOMER_DIRECTORY_NOT_CONFIGURED');
      const result = await input.customers.candidates('CUSTOMER', { search: parameters.search, page: parameters.page, pageSize: parameters.pageSize }, combined);
      if (!input.scope.active || combined.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
      return { ...result, items: result.items.map(item => ({ id: item.id, name: item.name })) };
    }
    if (kind === 'warehouses' && !parameters.hallId) throw new HttpQueryError('invalid-request', 'WAREHOUSE_HALL_REQUIRED');
    const nativeKind = kind === 'halls' ? 'HALL' : kind === 'warehouses' ? 'WAREHOUSE' : kind === 'payment-methods' ? 'PAYMENT_METHOD' : null;
    if (!nativeKind) throw new HttpQueryError('invalid-request', 'INVALID_SETTINGS_DIRECTORY');
    const page = await client.readList(nativeKind, { search: parameters.search, status: 'normal', hallId: kind === 'warehouses' ? parameters.hallId : null, page: parameters.page, pageSize: parameters.pageSize }, combined);
    if (!input.scope.active || combined.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    return { page: page.page, pageSize: page.pageSize, total: page.total, items: page.items.map(item => {
      if (item.kind !== 'HALL' && item.kind !== 'WAREHOUSE' && item.kind !== 'PAYMENT_METHOD') throw new Error('Wrong directory kind');
      return { id: item.id, name: item.name };
    }) };
  } });
}

import { StoreCommandError, type StoreCommandClient } from './maintenance-contracts.ts';
import { validateStoreCommand, validateStoreResult, validateStoreReceipt, storeNativeKind } from './maintenance-validation.ts';
const MAX_REQUEST_BYTES = 8192;
const MAX_RESPONSE_CHUNKS = 65_536;
const commandCodes: Readonly<Record<number, readonly string[]>> = {
  400: ['INVALID_ORGANIZATION_COMMAND', 'INVALID_PARTY_INPUT', 'INVALID_ID', 'INVALID_HTTP_INPUT', 'INVALID_REQUEST', 'INVALID_JSON'],
  401: ['UNAUTHENTICATED'], 403: ['FORBIDDEN'], 404: ['ORGANIZATION_NOT_FOUND'],
  409: ['VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'INVALID_ORGANIZATION_STATE', 'NO_ORGANIZATION_CHANGE', 'VERSION_STORAGE_OVERFLOW', 'ORGANIZATION_REFERENCE_UNAVAILABLE', 'WAREHOUSE_DEFAULT_IN_USE'],
  413: ['BODY_TOO_LARGE'], 415: ['UNSUPPORTED_MEDIA_TYPE'], 500: ['INTERNAL_ERROR'],
};
const receiptCodes: Readonly<Record<number, readonly string[]>> = {
  400: commandCodes[400]!, 401: ['UNAUTHENTICATED'], 403: ['FORBIDDEN'], 404: ['RECEIPT_NOT_FOUND'], 500: ['INTERNAL_ERROR'],
};
function commandPath(kind: import('./contracts.ts').StoreSettingsKind): string {
  return storeNativeKind(kind) === 'HALL' ? '/organization/halls' : '/organization/warehouses';
}
function resourceLimit(value: number | undefined, fallback: number, maximum: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new TypeError('Invalid organization HTTP resource limit.');
  return result;
}
function endpointBase(options: HttpQueryOptions): string {
  let origin: URL;
  try { origin = new URL(options?.origin); } catch { throw new TypeError('An explicit HTTP application origin is required.'); }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== options.origin || origin.username || origin.password
    || typeof options.fetch !== 'function' || typeof options.basePath !== 'string'
    || (options.basePath !== '' && !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(options.basePath))) {
    throw new TypeError('An explicit same-origin organization HTTP client is required.');
  }
  return `${origin.origin}${options.basePath.replace(/\/$/, '')}`;
}
function cancelBody(response: Response): void {
  try { void response.body?.cancel().catch(() => {}); } catch { /* Cleanup never replaces a safe failure. */ }
}
function waitFor<T>(pending: Promise<T>, signal: AbortSignal, interrupted: () => StoreCommandError): Promise<T> {
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
function statusKind(status: number): StoreCommandError['kind'] {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if ([400, 413, 415, 422].includes(status)) return 'invalid-request';
  return 'server';
}

/** Inert, same-origin command/receipt transport. No retry or production gate is installed here. */
export function createStoreSettingsCommandClient(options: HttpQueryOptions): StoreCommandClient {
  const base = endpointBase(options), fetch = options.fetch;
  const limit = resourceLimit(options.maxResponseBytes, 8 * 1024 * 1024, 32 * 1024 * 1024);
  const timeoutMs = resourceLimit(options.timeoutMs, 30_000, 120_000);
  function checked<T>(read: () => T, write = false): T {
    try { return read(); }
    catch { throw new StoreCommandError('invalid-request', 'INVALID_ORGANIZATION_COMMAND', write ? 'not-sent' : 'read'); }
  }
  async function request<T>(path: string, callerSignal: AbortSignal, validate: (value: unknown) => T, body?: unknown): Promise<T> {
    const write = body !== undefined;
    let dispatched = false, status: number | null = null;
    const outcome = () => write ? (dispatched ? 'uncertain' : 'not-sent') : 'read';
    const fail = (kind: StoreCommandError['kind'], code: string) => new StoreCommandError(kind, code, outcome(), status);
    if (callerSignal.aborted) throw fail('aborted', 'ORGANIZATION_ABORTED');
    let payload: string | undefined;
    if (write) {
      try { payload = JSON.stringify(body); if (typeof payload !== 'string') throw new Error(); }
      catch { throw fail('invalid-request', 'INVALID_ORGANIZATION_COMMAND'); }
      if (new TextEncoder().encode(payload).byteLength > MAX_REQUEST_BYTES) throw fail('invalid-request', 'REQUEST_TOO_LARGE');
    }
    const controller = new AbortController();
    const signal = AbortSignal.any([callerSignal, controller.signal]);
    const deadline = performance.now() + timeoutMs;
    let timedOut = false;
    const interrupted = () => fail(timedOut && !callerSignal.aborted ? 'timeout' : 'aborted', timedOut && !callerSignal.aborted ? 'ORGANIZATION_TIMEOUT' : 'ORGANIZATION_ABORTED');
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
        const rejected = response.status >= 400 && response.status < 500;
        throw new StoreCommandError(statusKind(response.status), code, write ? (rejected ? 'rejected' : 'uncertain') : 'read', response.status);
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
      if (error instanceof StoreCommandError) throw error;
      throw fail('network', 'NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  return Object.freeze<StoreCommandClient>({
    async execute(kind, command, signal) {
      const input = checked(() => validateStoreCommand(kind, command), true);
      return request(`${commandPath(kind)}/commands`, signal, value => validateStoreResult(value, kind, input), input);
    },
    async receipt(kind, command, signal) {
      const original = checked(() => validateStoreCommand(kind, command));
      return request(`${commandPath(kind)}/receipts/${encodeURIComponent(original.requestKey)}`, signal, value => validateStoreReceipt(value, kind, original));
    },
  });
}
