import type { ProductMaintenanceDetail as ProductMaintenanceDetailV1, ProductMaintenanceDetailV2 } from '../../../../packages/application/src/product-maintenance-ports.ts';
import { parseProductMaintenanceCommand, parseProductMaintenanceCommandV2 } from '../../../../packages/application/src/product-maintenance-validation.ts';
import { entityId } from '../../../../packages/domain/src/values.ts';
import { createHttpJsonQuery, HttpQueryError, type HttpQueryOptions } from '../transport/http-query.ts';
import type { ProductEditorMediaReader, ProductEditorImages, ProductMaintenanceReader, ProductMaintenanceDetail, ProductMaintenanceCandidatePage, ProductMaintenanceCandidateQuery } from './product-editor-contracts.ts';
import { parseProductMaintenanceCandidates } from '../../../../packages/application/src/product-maintenance-validation.ts';
import { ProductMaintenanceError, type ProductMaintenanceClient, type ProductMaintenanceCommand, type ProductMaintenanceResult, type ProductMaintenanceReceipt } from './product-editor-contracts.ts';
/** Same bounded command/outcome protocol as the existing sales/transfer clients; target validation stays product-specific. */
const PRODUCT_COMMAND_MAX_REQUEST_BYTES = 1_048_576;
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Invalid product response');
  const row = value as Record<string, unknown>;
  if (Reflect.ownKeys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) throw new TypeError('Invalid product response');
  return row;
}
export function validateProductResult(value: unknown, command: ProductMaintenanceCommand): ProductMaintenanceResult {
  const row = record(value, ['operationId','kind','targetId','version']);
  if (row.kind !== 'PRODUCT' || typeof row.operationId !== 'string' || typeof row.targetId !== 'string'
    || row.version !== (command.action === 'CREATE' ? 1 : command.expectedVersion + 1) || command.action !== 'CREATE' && row.targetId !== command.id) throw new TypeError('Invalid product result');
  return { operationId: entityId('operation', row.operationId), kind: 'PRODUCT', targetId: entityId('product', row.targetId), version: row.version as number };
}
export function validateProductReceipt(value: unknown, command: ProductMaintenanceCommand): ProductMaintenanceReceipt {
  const row = record(value, ['requestKey','action','status','completedAt','result']);
  if (row.requestKey !== command.requestKey || row.action !== command.action || row.status !== 'COMMITTED' || typeof row.completedAt !== 'string'
    || !/(?:Z|[+-]\d{2}:\d{2})$/.test(row.completedAt) || !Number.isFinite(Date.parse(row.completedAt))) throw new TypeError('Invalid product receipt');
  return { requestKey: command.requestKey, action: command.action, status: 'COMMITTED', completedAt: row.completedAt, result: validateProductResult(row.result, command) };
}
const MAX_RESPONSE_CHUNKS = 65_536;
const commandCodes: Readonly<Record<number, readonly string[]>> = {
  400: ['INVALID_PRODUCT_MAINTENANCE','INVALID_PARTY_INPUT','INVALID_ID','INVALID_HTTP_INPUT','INVALID_REQUEST','INCOMPLETE_CATALOGUE_PRICE_INPUT','INVALID_CATALOGUE_PRICE_INPUT','MONEY_PRECISION','MONEY_OVERFLOW','PRODUCT_SCHEME_REQUIRED','PRODUCT_REQUIRED_FIELDS','PRODUCT_SPEC_REQUIRED','INVALID_JSON'],
  401: ['UNAUTHENTICATED'], 403: ['FORBIDDEN'], 404: ['PRODUCT_NOT_FOUND'],
  409: ['PRODUCT_EDIT_CONTRACT_UPGRADE_REQUIRED','PRODUCT_SEASON_UNKNOWN_RESET','VERSION_CONFLICT','IDEMPOTENCY_CONFLICT','PRODUCT_DELETED','VERSION_STORAGE_OVERFLOW','INVALID_PRODUCT_STATE','IMMUTABLE_PRODUCT_CODE','IMMUTABLE_SKU_IDENTITY','IMMUTABLE_BARCODE_IDENTITY','PRODUCT_SPEC_CONFLICT','PRODUCT_CODE_CONFLICT','BARCODE_CONFLICT','PRODUCT_REFERENCE_UNAVAILABLE','PRODUCT_SIZE_GROUP_MISMATCH','PRODUCT_IN_USE','NO_PRODUCT_CHANGE','PRODUCT_SPEC_NOT_FOUND'],
  413: ['BODY_TOO_LARGE','PRODUCT_MAINTENANCE_TOO_LARGE'], 415: ['UNSUPPORTED_MEDIA_TYPE'],
  500: ['INTERNAL_ERROR'], 503: ['PRODUCT_DELETE_NOT_READY','PRODUCT_SEASON_NOT_READY','MAINTENANCE_PREPARE_NOT_READY'],
};
const receiptCodes: Readonly<Record<number, readonly string[]>> = {
  400: ['INVALID_HTTP_INPUT','INVALID_PARTY_INPUT'], 401: ['UNAUTHENTICATED'], 403: ['FORBIDDEN'], 404: ['RECEIPT_NOT_FOUND'], 500: ['INTERNAL_ERROR'],
};
function resourceLimit(value: number | undefined, fallback: number, maximum: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new TypeError('Invalid product command HTTP resource limit.');
  return result;
}
function endpointBase(options: HttpQueryOptions): string {
  let origin: URL;
  try { origin = new URL(options?.origin); } catch { throw new TypeError('An explicit HTTP application origin is required.'); }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== options.origin || origin.username || origin.password
    || typeof options.fetch !== 'function' || typeof options.basePath !== 'string'
    || (options.basePath !== '' && !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(options.basePath))) {
    throw new TypeError('An explicit same-origin product command HTTP client is required.');
  }
  return `${origin.origin}${options.basePath.replace(/\/$/, '')}`;
}
function cancelBody(response: Response): void {
  try { void response.body?.cancel().catch(() => {}); } catch { /* Cleanup never replaces a safe failure. */ }
}
function waitFor<T>(pending: Promise<T>, signal: AbortSignal, interrupted: () => ProductMaintenanceError): Promise<T> {
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
function statusKind(status: number): ProductMaintenanceError['kind'] {
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
export function createProductMaintenanceHttpClient(options: HttpQueryOptions): ProductMaintenanceClient { return productMaintenanceHttpClient(options, 1); }
export function createProductMaintenanceHttpClientV2(options: HttpQueryOptions): ProductMaintenanceClient { return productMaintenanceHttpClient(options, 2); }
function productMaintenanceHttpClient(options: HttpQueryOptions, contractVersion: 1 | 2): ProductMaintenanceClient {
  const base = endpointBase(options), fetch = options.fetch;
  const limit = resourceLimit(options.maxResponseBytes, 512 * 1024, 2 * 1024 * 1024);
  const timeoutMs = resourceLimit(options.timeoutMs, 30_000, 120_000);
  function checked<T>(read: () => T, write = false): T {
    try { return read(); }
    catch { throw new ProductMaintenanceError('invalid-request', 'INVALID_PRODUCT_COMMAND_INPUT', write ? 'not-sent' : 'read'); }
  }
  async function request<T>(path: string, callerSignal: AbortSignal, validate: (value: unknown) => T, body?: unknown): Promise<T> {
    const write = body !== undefined;
    let dispatched = false, status: number | null = null;
    const outcome = () => write ? (dispatched ? 'uncertain' : 'not-sent') : 'read';
    const fail = (kind: ProductMaintenanceError['kind'], code: string) => new ProductMaintenanceError(
      status === 401 ? 'unauthenticated' : status === 403 ? 'forbidden' : kind,
      status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : code, outcome(), status);
    if (callerSignal.aborted) throw fail('aborted', 'PRODUCT_COMMAND_ABORTED');
    let payload: string | undefined;
    if (write) {
      try { payload = JSON.stringify(body); if (typeof payload !== 'string') throw new Error(); }
      catch { throw fail('invalid-request', 'INVALID_PRODUCT_COMMAND_INPUT'); }
      if (new TextEncoder().encode(payload).byteLength > PRODUCT_COMMAND_MAX_REQUEST_BYTES) throw fail('invalid-request', 'REQUEST_TOO_LARGE');
    }
    const controller = new AbortController();
    const signal = AbortSignal.any([callerSignal, controller.signal]);
    const deadline = performance.now() + timeoutMs;
    let timedOut = false;
    const interrupted = () => fail(timedOut && !callerSignal.aborted ? 'timeout' : 'aborted', timedOut && !callerSignal.aborted ? 'PRODUCT_COMMAND_TIMEOUT' : 'PRODUCT_COMMAND_ABORTED');
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
        const rejected = response.status >= 400 && response.status < 500;
        throw new ProductMaintenanceError(statusKind(response.status), code, write ? (rejected ? 'rejected' : 'uncertain') : 'read', response.status);
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
      if (error instanceof ProductMaintenanceError) throw error;
      throw fail('network', 'NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  const commandVersion = (command: ProductMaintenanceCommand) => 'values' in command ? (Object.hasOwn(command.values, 'seasonIds') ? 2 : 1) : contractVersion;
  const parseOriginal = (command: ProductMaintenanceCommand) => commandVersion(command) === 2 ? parseProductMaintenanceCommandV2(command) : parseProductMaintenanceCommand(command);
  return Object.freeze({
    contractVersion,
    async execute(command, signal) {
      const input = checked(() => { if (contractVersion === 1 && commandVersion(command) === 2) throw new TypeError('V2 capability required'); return parseOriginal(command); }, true);
      const version = commandVersion(input);
      // An explicitly retried old immutable CREATE/EDIT keeps its original v1 route/body.
      return request(version === 2 ? '/products/v2/commands' : '/products/commands', signal, value => validateProductResult(value, input), input);
    },
    async receipt(command, signal) {
      const input = checked(() => parseOriginal(command));
      return request(`/products/receipts/${encodeURIComponent(input.requestKey)}`, signal, value => validateProductReceipt(value, input));
    },
  } satisfies ProductMaintenanceClient);
}

function detailFailure(): never { throw new HttpQueryError('malformed-response','INVALID_PRODUCT_MAINTENANCE_RESPONSE'); }
export function validateProductMaintenanceDetail(value: unknown, productId: string): ProductMaintenanceDetailV1 { return validateProductDetail(value, productId, 1) as ProductMaintenanceDetailV1; }
export function validateProductMaintenanceDetailV2(value: unknown, productId: string): ProductMaintenanceDetailV2 { return validateProductDetail(value, productId, 2) as ProductMaintenanceDetailV2; }
function validateProductDetail(value: unknown, productId: string, contractVersion: 1 | 2): ProductMaintenanceDetail {
  try {
    const row=record(value,['productId','version','deletedAt','values','skus','barcodes','references']);
    if(row.productId!==productId || row.deletedAt!==null && (typeof row.deletedAt!=='string' || !Number.isFinite(Date.parse(row.deletedAt)))) return detailFailure();
    const parsed=(contractVersion === 2 ? parseProductMaintenanceCommandV2 : parseProductMaintenanceCommand)({action:'EDIT',requestKey:'validation-only',id:row.productId,expectedVersion:row.version,values:row.values,skus:row.skus,barcodes:row.barcodes});
    if(parsed.action!=='EDIT' || parsed.skus.some(s=>s.id===null||s.expectedVersion===null) || parsed.barcodes.some(b=>b.id===null)) return detailFailure();
    const refs=record(row.references,['categoryPath','supplier',contractVersion === 2 ? 'seasons' : 'season','sizeGroup','defaultBarcodeScheme']);
    const ref=(value:unknown,extra:readonly string[]=[])=>{const r=record(value,['id','name',...extra]);if(typeof r.id!=='string'||typeof r.name!=='string'||!r.name.trim())throw Error();entityId('product',r.id);return r;};
    if(!Array.isArray(refs.categoryPath)||!refs.categoryPath.length)return detailFailure();
    const categoryIds=refs.categoryPath.map(x=>ref(x).id);
    if(new Set(categoryIds).size!==categoryIds.length || categoryIds.at(-1)!==parsed.values.categoryId || ref(refs.sizeGroup).id!==parsed.values.sizeGroupId)return detailFailure();
    if(refs.supplier===null?parsed.values.supplierId!==null:ref(refs.supplier,['enabled']).id!==parsed.values.supplierId||typeof (refs.supplier as {enabled:unknown}).enabled!=='boolean')return detailFailure();
    if ('seasonIds' in parsed.values) {
      if (!Array.isArray(refs.seasons)) return detailFailure();
      const expected = new Set(parsed.values.seasonIds ?? []), actual = refs.seasons.map(value => ref(value).id);
      if (actual.length !== expected.size || new Set(actual).size !== actual.length || actual.some(id => typeof id !== 'string' || !expected.has(id))) return detailFailure();
    } else if(refs.season===null?parsed.values.seasonId!==null:ref(refs.season).id!==parsed.values.seasonId)return detailFailure();
    if(refs.defaultBarcodeScheme===null){if(parsed.values.defaultBarcodeSchemeId!==null)return detailFailure();}
    else{const r=ref(refs.defaultBarcodeScheme,['ruleVersion','status']);if(r.id!==parsed.values.defaultBarcodeSchemeId||typeof r.ruleVersion!=='string'||!r.ruleVersion.trim()||!['CURRENT','HISTORICAL'].includes(r.status as string))return detailFailure();}
    return value as ProductMaintenanceDetail;
  }catch{return detailFailure();}
}
export function validateProductMaintenanceCandidates(value:unknown, query:ProductMaintenanceCandidateQuery):ProductMaintenanceCandidatePage {
  try{
    const row=record(value,['kind','page','pageSize','total','items']);
    if(row.kind!==query.kind||row.page!==query.page||row.pageSize!==query.pageSize||typeof row.total!=='number'||!Number.isSafeInteger(row.total)||row.total<0||!Array.isArray(row.items)||row.items.length!==Math.min(query.pageSize,Math.max(0,row.total-(query.page-1)*query.pageSize)))return detailFailure();
    const ids=new Set<string>();
    for(const value of row.items){const item=record(value,['id','name','code','parentId','version']);if(typeof item.id!=='string'||!item.id.length||typeof item.name!=='string'||!item.name.trim()||ids.has(item.id)||item.code!==null&&typeof item.code!=='string'||item.version!==null&&(typeof item.version!=='number'||!Number.isSafeInteger(item.version)||item.version<1))return detailFailure();ids.add(item.id);
      if(!['years','thicknesses','collar-pants-types'].includes(query.kind))entityId('product',item.id);
      if(item.parentId!==null){if(query.kind!=='categories'||typeof item.parentId!=='string')return detailFailure();entityId('category',item.parentId);}
    }
    return value as ProductMaintenanceCandidatePage;
  }catch{return detailFailure();}
}
export function createProductMaintenanceHttpReader(options:HttpQueryOptions):ProductMaintenanceReader { return productMaintenanceHttpReader(options, 1); }
export function createProductMaintenanceHttpReaderV2(options:HttpQueryOptions):ProductMaintenanceReader { return productMaintenanceHttpReader(options, 2); }
function productMaintenanceHttpReader(options:HttpQueryOptions, contractVersion:1|2):ProductMaintenanceReader{
 const http=createHttpJsonQuery(options);
 return Object.freeze({contractVersion,readDetail:read=>http.post(contractVersion===2?'/products/maintenance/v2/detail/query':'/products/maintenance/detail/query',{productId:read.parameters.productId},read.signal,value=>validateProductDetail(value,read.parameters.productId,contractVersion)),
 readCandidates:read=>{const q=parseProductMaintenanceCandidates({...read.parameters});return http.post('/products/maintenance/candidates/query',q,read.signal,value=>validateProductMaintenanceCandidates(value,q));}} satisfies ProductMaintenanceReader);
}

function mediaFailure(): never { throw new HttpQueryError('malformed-response', 'INVALID_PRODUCT_MEDIA_RESPONSE'); }
function mediaVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483647;
}
/** The opaque revision is never derived from a row version or treated as a grant. */
function controlledMediaUrl(value: unknown, options: Pick<HttpQueryOptions, 'origin' | 'basePath'>, productId: string, imageId: string, variant: 'thumbnail' | 'original'): string {
  if (typeof value !== 'string') return mediaFailure();
  const url = new URL(value), prefix = `${options.basePath.replace(/\/$/, '')}/products/media/${productId}/${imageId}/`;
  if (url.protocol !== 'https:' || url.origin !== options.origin || url.username || url.password || url.search || url.hash
    || url.href !== value || !url.pathname.startsWith(prefix)) return mediaFailure();
  const parts = url.pathname.slice(prefix.length).split('/');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0] ?? '') || parts[1] !== variant) return mediaFailure();
  return value;
}
export function validateProductEditorImages(value: unknown, productId: string, options: Pick<HttpQueryOptions, 'origin' | 'basePath'>): ProductEditorImages {
  try {
    entityId('product', productId);
    const root = record(value, ['productId', 'version', 'images']);
    if (root.productId !== productId || !mediaVersion(root.version) || !Array.isArray(root.images)) return mediaFailure();
    const ids = new Set<string>(), colors = new Set<string>();
    let previous: { order: number; id: string } | null = null;
    for (const value of root.images) {
      const row = record(value, ['id','version','role','colorId','displayOrder','mime','byteSize','createdAt','createdByAccountId','thumbnailUrl','thumbnailState']);
      if (typeof row.id !== 'string' || !mediaVersion(row.version) || ids.has(row.id.toLowerCase())) return mediaFailure();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.id)) return mediaFailure(); ids.add(row.id);
      if (row.role !== null && !['MAIN','WHITE_BACKGROUND','HANG_TAG','DETAIL','COLOR'].includes(row.role as string)) return mediaFailure();
      if (row.role === 'COLOR') {
        if (typeof row.colorId !== 'string' || colors.has(row.colorId.toLowerCase())) return mediaFailure();
        entityId('color', row.colorId); colors.add(row.colorId.toLowerCase());
      } else if (row.colorId !== null) return mediaFailure();
      if (typeof row.displayOrder !== 'number' || !Number.isInteger(row.displayOrder) || row.displayOrder < -2147483648 || row.displayOrder > 2147483647) return mediaFailure();
      if (previous && (row.displayOrder < previous.order || row.displayOrder === previous.order && row.id.toLowerCase() <= previous.id)) return mediaFailure();
      previous = { order: row.displayOrder, id: row.id.toLowerCase() };
      if (!['image/png','image/jpeg','image/webp'].includes(row.mime as string) || typeof row.byteSize !== 'string'
        || !/^[1-9]\d{0,6}$/.test(row.byteSize) || BigInt(row.byteSize) > 8388608n) return mediaFailure();
      if (typeof row.createdAt !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(row.createdAt) || !Number.isFinite(Date.parse(row.createdAt))) return mediaFailure();
      if (row.createdByAccountId !== null) { if (typeof row.createdByAccountId !== 'string') return mediaFailure(); entityId('account', row.createdByAccountId); }
      if (row.thumbnailState === 'READY') controlledMediaUrl(row.thumbnailUrl, options, productId, row.id, 'thumbnail');
      else if (row.thumbnailState !== 'UNAVAILABLE' || row.thumbnailUrl !== null) return mediaFailure();
    }
    return value as ProductEditorImages;
  } catch { return mediaFailure(); }
}
/** Constructing this read capability performs no IO and cannot upload or save images. */
export function createProductEditorMediaHttpReader(options: HttpQueryOptions): ProductEditorMediaReader {
  const http = createHttpJsonQuery(options), mediaOptions = Object.freeze({ origin: options.origin, basePath: options.basePath });
  return Object.freeze({
    readImages: read => {
      entityId('product', read.parameters.productId);
      return http.post('/products/maintenance/images/query', { productId: read.parameters.productId }, read.signal,
        value => validateProductEditorImages(value, read.parameters.productId, mediaOptions));
    },
    readOriginal: read => {
      const { productId, imageId } = read.parameters;
      entityId('product', productId); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(imageId)) throw new HttpQueryError('invalid-request', 'INVALID_PRODUCT_IMAGE_ID');
      return http.post('/products/image/query', { productId, imageId }, read.signal, value => {
        try {
          const row = record(value, ['productId','imageId','url']);
          if (row.productId !== productId || row.imageId !== imageId) return mediaFailure();
          return { productId, imageId, url: controlledMediaUrl(row.url, mediaOptions, productId, imageId, 'original') };
        } catch { return mediaFailure(); }
      });
    },
  } satisfies ProductEditorMediaReader);
}
