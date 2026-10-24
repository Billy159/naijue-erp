import { catalogueMaintenanceKind, parseCatalogueMaintenanceCommand, checkedCategoryOrderResult } from '../../../../packages/application/src/catalogue-maintenance-validation.ts';
import { entityId } from '../../../../packages/domain/src/values.ts';
import type { HttpQueryOptions } from '../transport/http-query.ts';
import type { CatalogueMaintenanceKind, CatalogueMaintenanceAction, CatalogueMaintenanceCommand, CategoryOrderResult } from '../../../../packages/application/src/catalogue-maintenance-ports.ts';
export type { CatalogueMaintenanceKind, CatalogueMaintenanceAction, CatalogueMaintenanceCommand, CategoryWriteValues, CatalogueEntryWriteValues } from '../../../../packages/application/src/catalogue-maintenance-ports.ts';
export type CatalogueMaintenanceResult = {readonly operationId:string;readonly kind:CatalogueMaintenanceKind;readonly targetId:string;readonly version:number} | CategoryOrderResult;
export type { CategoryOrderResult } from '../../../../packages/application/src/catalogue-maintenance-ports.ts';
export interface CatalogueMaintenanceReceipt {readonly requestKey:string;readonly action:CatalogueMaintenanceAction;readonly status:'COMMITTED';readonly completedAt:string;readonly result:CatalogueMaintenanceResult}
export interface CatalogueMaintenanceClient {readonly kind:CatalogueMaintenanceKind;execute(command:CatalogueMaintenanceCommand,signal:AbortSignal):Promise<CatalogueMaintenanceResult>;receipt(command:CatalogueMaintenanceCommand,signal:AbortSignal):Promise<CatalogueMaintenanceReceipt>}
export type CatalogueErrorKind='invalid-request'|'unauthenticated'|'forbidden'|'not-found'|'conflict'|'network'|'timeout'|'aborted'|'malformed-response'|'server';
export class CatalogueMaintenanceError extends Error {
 readonly kind:CatalogueErrorKind;readonly code:string;readonly outcome:'not-sent'|'rejected'|'uncertain'|'read';readonly status:number|null;
 constructor(kind:CatalogueErrorKind,code:string,outcome:'not-sent'|'rejected'|'uncertain'|'read',status:number|null=null){
  const messages:Readonly<Record<string,string>>={CATALOGUE_ORDER_NOT_READY:'分类排序暂未就绪，请稍后重试。',CATEGORY_ORDER_CONFLICT:'同级分类集合、顺序或版本已变化，请读取最新目录后重排。',CATEGORY_UNDO_CONFLICT:'该次排序后的分类已变化，无法撤销，请读取最新目录。',VERSION_CONFLICT:'资料已被其他操作修改，请读取最新版本。',CATALOGUE_IN_USE:'仍有商品、规格、图片或下级分类引用，无法删除。',CATALOGUE_NAME_CONFLICT:'名称或编码已存在。',CATEGORY_CYCLE:'分类不能移到自身或下级分类。',CATEGORY_DEPTH:'新增或调整父级时只能选择一级分类。',NO_CATALOGUE_CHANGE:'资料没有变化。',CATALOGUE_DELETED:'资料已删除，请刷新目录。',INVALID_CATALOGUE_COMMAND:'请检查名称、编码和必填资料。'};
  super(messages[code]??({ 'invalid-request':'请求未通过校验。',unauthenticated:'登录已失效。',forbidden:'无权执行当前操作。','not-found':'未找到资料或回执。',conflict:'资料版本或状态已变化。',network:'连接中断。',timeout:'请求超时。',aborted:'已停止等待请求。','malformed-response':'服务器返回无效。',server:'服务器暂未完成请求。'}as const)[kind]);this.name=kind==='aborted'?'AbortError':'CatalogueMaintenanceError';this.kind=kind;this.code=code;this.outcome=outcome;this.status=status;
 }
}
/** Same bounded command/outcome protocol as the existing sales/transfer clients; target validation stays catalogue-specific. */
const CATALOGUE_COMMAND_MAX_REQUEST_BYTES = 8192;
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Invalid catalogue response');
  const row = value as Record<string, unknown>;
  if (Reflect.ownKeys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) throw new TypeError('Invalid catalogue response');
  return row;
}
export function validateCatalogueResult(value: unknown, command: CatalogueMaintenanceCommand, kind: CatalogueMaintenanceKind): CatalogueMaintenanceResult {
  if (command.action === 'REORDER' || command.action === 'UNDO_REORDER') {
    if (kind !== 'CATEGORY') throw new TypeError('Invalid catalogue order kind');
    const result = checkedCategoryOrderResult(value), order = result.order;
    if (order.members.length !== command.expectedSiblings.length || (command.action === 'REORDER'
      ? order.parentId !== command.parentId || order.undoOfOperationId !== null : order.undoOfOperationId !== command.originalOperationId)) throw new TypeError('Invalid catalogue order');
    const expected = new Map(command.expectedSiblings.map(item=>[item.id,item.expectedVersion]));
    const positions = command.action === 'REORDER' ? new Map(command.orderedIds.map((id,index)=>[id,index])) : null;
    if (order.members.some(member=>{const previous=expected.get(member.id);return previous===undefined||(member.version!==previous&&member.version!==previous+1)||positions&&member.displayOrder!==positions.get(member.id);})
      || result.version !== expected.get(result.targetId)! + 1) throw new TypeError('Invalid catalogue order members');
    if (command.action==='REORDER'&&result.targetId!==order.members.filter(member=>member.version===expected.get(member.id)!+1).map(member=>member.id).sort()[0]) throw new TypeError('Invalid catalogue order anchor');
    return result;
  }
  const row = record(value, ['operationId','kind','targetId','version']);
  if (row.kind !== kind || typeof row.operationId !== 'string' || typeof row.targetId !== 'string'
    || typeof row.version !== 'number' || !Number.isSafeInteger(row.version) || row.version < 1 || row.version > 2147483647
    || row.version !== (command.action === 'CREATE' ? 1 : command.expectedVersion + 1) || command.action !== 'CREATE' && row.targetId !== command.id) throw new TypeError('Invalid catalogue result');
  return { operationId: entityId('operation', row.operationId), kind, targetId: entityId('category', row.targetId), version: row.version as number };
}
export function validateCatalogueReceipt(value: unknown, command: CatalogueMaintenanceCommand, kind: CatalogueMaintenanceKind): CatalogueMaintenanceReceipt {
  const row = record(value, ['requestKey','action','status','completedAt','result']);
  if (row.requestKey !== command.requestKey || row.action !== command.action || row.status !== 'COMMITTED' || typeof row.completedAt !== 'string'
    || !/(?:Z|[+-]\d{2}:\d{2})$/.test(row.completedAt) || !Number.isFinite(Date.parse(row.completedAt))) throw new TypeError('Invalid catalogue receipt');
  return { requestKey: command.requestKey, action: command.action, status: 'COMMITTED', completedAt: row.completedAt, result: validateCatalogueResult(row.result, command, kind) };
}
const MAX_RESPONSE_CHUNKS = 65_536;
const commandCodes: Readonly<Record<number, readonly string[]>> = {
  400: ['INVALID_CATALOGUE_COMMAND','INVALID_PARTY_INPUT','INVALID_ID','INVALID_HTTP_INPUT','INVALID_REQUEST','INVALID_JSON'],
  401: ['UNAUTHENTICATED'],403:['FORBIDDEN'],404:['CATALOGUE_NOT_FOUND'],
  409: ['VERSION_CONFLICT','IDEMPOTENCY_CONFLICT','CATALOGUE_DELETED','VERSION_STORAGE_OVERFLOW','INVALID_CATALOGUE_STATE','NO_CATALOGUE_CHANGE','CATEGORY_CYCLE','CATEGORY_DEPTH','CATALOGUE_NAME_CONFLICT','CATALOGUE_IN_USE','CATEGORY_ORDER_CONFLICT','CATEGORY_UNDO_CONFLICT'],
  413:['BODY_TOO_LARGE'],415:['UNSUPPORTED_MEDIA_TYPE'],500:['INTERNAL_ERROR'],503:['CATALOGUE_ORDER_NOT_READY'],
};
const receiptCodes: Readonly<Record<number, readonly string[]>> = {400:['INVALID_HTTP_INPUT','INVALID_PARTY_INPUT'],401:['UNAUTHENTICATED'],403:['FORBIDDEN'],404:['RECEIPT_NOT_FOUND'],500:['INTERNAL_ERROR'],503:['CATALOGUE_ORDER_NOT_READY']};
function resourceLimit(value: number | undefined, fallback: number, maximum: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new TypeError('Invalid catalogue command HTTP resource limit.');
  return result;
}
function endpointBase(options: HttpQueryOptions): string {
  let origin: URL;
  try { origin = new URL(options?.origin); } catch { throw new TypeError('An explicit HTTP application origin is required.'); }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== options.origin || origin.username || origin.password
    || typeof options.fetch !== 'function' || typeof options.basePath !== 'string'
    || (options.basePath !== '' && !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(options.basePath))) {
    throw new TypeError('An explicit same-origin catalogue command HTTP client is required.');
  }
  return `${origin.origin}${options.basePath.replace(/\/$/, '')}`;
}
function cancelBody(response: Response): void {
  try { void response.body?.cancel().catch(() => {}); } catch { /* Cleanup never replaces a safe failure. */ }
}
function waitFor<T>(pending: Promise<T>, signal: AbortSignal, interrupted: () => CatalogueMaintenanceError): Promise<T> {
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
function statusKind(status: number): CatalogueMaintenanceError['kind'] {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if ([400, 413, 415, 422].includes(status)) return 'invalid-request';
  return 'server';
}

/** Inert, exact two-operation command boundary. Same-origin credentials, bounded
 * streaming/timeout and no automatic retry. The existing read-only POST primitive
 * cannot represent GET receipts or distinguish uncertain command outcomes. */
export function createCatalogueMaintenanceHttpClient(options: HttpQueryOptions, kind: CatalogueMaintenanceKind): CatalogueMaintenanceClient {
  catalogueMaintenanceKind(kind);
  const prefix = ({CATEGORY:"/catalogue/categories",COLOR:"/catalogue/colors",FIT:"/catalogue/fits"} as const)[kind];
  const base = endpointBase(options), fetch = options.fetch;
  const limit = resourceLimit(options.maxResponseBytes, 512 * 1024, 2 * 1024 * 1024);
  const timeoutMs = resourceLimit(options.timeoutMs, 30_000, 120_000);
  function checked<T>(read: () => T, write = false): T {
    try { return read(); }
    catch { throw new CatalogueMaintenanceError('invalid-request', 'INVALID_CATALOGUE_COMMAND_INPUT', write ? 'not-sent' : 'read'); }
  }
  async function request<T>(path: string, callerSignal: AbortSignal, validate: (value: unknown) => T, body?: unknown): Promise<T> {
    const write = body !== undefined;
    let dispatched = false, status: number | null = null;
    const outcome = () => write ? (dispatched ? 'uncertain' : 'not-sent') : 'read';
    const fail = (kind: CatalogueMaintenanceError['kind'], code: string) => new CatalogueMaintenanceError(
      status === 401 ? 'unauthenticated' : status === 403 ? 'forbidden' : kind,
      status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : code, outcome(), status);
    if (callerSignal.aborted) throw fail('aborted', 'CATALOGUE_COMMAND_ABORTED');
    let payload: string | undefined;
    if (write) {
      try { payload = JSON.stringify(body); if (typeof payload !== 'string') throw new Error(); }
      catch { throw fail('invalid-request', 'INVALID_CATALOGUE_COMMAND_INPUT'); }
      if (new TextEncoder().encode(payload).byteLength > (kind === 'CATEGORY' ? 1024 * 1024 : CATALOGUE_COMMAND_MAX_REQUEST_BYTES)) throw fail('invalid-request', 'REQUEST_TOO_LARGE');
    }
    const controller = new AbortController();
    const signal = AbortSignal.any([callerSignal, controller.signal]);
    const deadline = performance.now() + timeoutMs;
    let timedOut = false;
    const interrupted = () => fail(timedOut && !callerSignal.aborted ? 'timeout' : 'aborted', timedOut && !callerSignal.aborted ? 'CATALOGUE_COMMAND_TIMEOUT' : 'CATALOGUE_COMMAND_ABORTED');
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
      // Authentication failure is authoritative at headers. Never wait for an
      // absent/malformed/oversized body before invalidating the current scope.
      // No verified rejection body is read, so a dispatched write stays uncertain.
      if (status === 401 || status === 403) { cancelBody(response); throw fail(status === 401 ? 'unauthenticated' : 'forbidden', status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN'); }
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
        // Codes are route-specific. A receipt absence is always only a read outcome.
        const rejected = response.status >= 400 && response.status < 500 || code === 'CATALOGUE_ORDER_NOT_READY';
        throw new CatalogueMaintenanceError(statusKind(response.status), code, write ? (rejected ? 'rejected' : 'uncertain') : 'read', response.status);
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
      if (error instanceof CatalogueMaintenanceError) throw error;
      throw fail('network', 'NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({
    kind,
    async execute(command, signal) {
      const input = checked(() => parseCatalogueMaintenanceCommand(kind, command), true);
      return request(`${prefix}/commands`, signal, value => validateCatalogueResult(value, input, kind), input);
    },
    async receipt(command, signal) {
      const input = checked(() => parseCatalogueMaintenanceCommand(kind, command));
      return request(`${prefix}/receipts/${encodeURIComponent(input.requestKey)}`, signal, value => validateCatalogueReceipt(value, input, kind));
    },
  } satisfies CatalogueMaintenanceClient);
}
