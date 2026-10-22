/** Real reader/resolver composition. A registry pin must come from C after independent
 * review; this module never derives an authorization pin from a supplied file. */
import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { historySettlementRequestHash } from '../../packages/application/src/import-v3-history-settlement.ts';
import { validatePreparedNativePartyImportChunk } from '../../packages/application/src/native-party-import.ts';
import { openAuthorizedV3Reader } from '../import-v2/authorized-reader.mjs';
import { openAuthorizedV3HeaderReader } from '../import-v2/authorized-header-reader.mjs';
import { NATIVE_BINDING_PACKAGE_VERSION } from './prepare-native-bindings.mjs';
const must = (ok, code) => { if (!ok) throw Object.assign(Error(code), { code }); };
const digest = b => createHash('sha256').update(b).digest('hex');
const hash = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const uuid = s => typeof s === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const key = (entity, sourceKey) => JSON.stringify([entity, sourceKey]);
const same = (a, b) => ['dev', 'ino', 'size', 'mode', 'mtimeMs', 'ctimeMs'].every(k => a[k] === b[k]);
async function load(path, pin, limit) {
  must(hash(pin), 'NATIVE_SOURCE_OUTSIDE_PIN_REQUIRED');
  const before = await lstat(path); must(before.isFile() && !before.isSymbolicLink() && before.size <= limit, 'NATIVE_SOURCE_FILE');
  const bytes = await readFile(path), after = await lstat(path);
  must(bytes.length === before.size && same(before, after) && digest(bytes) === pin, 'NATIVE_SOURCE_FILE_CHANGED');
  return { value: JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)), path, stat: after };
}
/** Snapshot resolver only. Exact source readers MUST additionally recheck raw bytes,
 * row/provenance/selection and prepared payloads. normalizedHash is not a source grant. */
export async function openNativeBindingRegistry({ directory, trustedManifestSha256, binding }) {
  must(typeof directory === 'string' && isAbsolute(directory) && uuid(binding?.batchId), 'NATIVE_SOURCE_REGISTRY_CONFIG');
  const manifest = await load(join(directory, 'review-candidate-manifest.json'), trustedManifestSha256, 4194304), m = manifest.value;
  must(m.version === NATIVE_BINDING_PACKAGE_VERSION && m.batchId === binding.batchId && m.fixedSourceNamespace === binding.fixedSourceNamespace
    && m.selectionSha256 === binding.selectionSha256 && m.cutoffAt === binding.cutoffAt && Array.isArray(m.files) && m.files.length <= 16, 'NATIVE_SOURCE_REGISTRY_BINDING');
  const opened = new Map(); let total = 0;
  for (const f of m.files) {
    must(typeof f.name === 'string' && /^[a-z][a-z0-9-]*\.json$/.test(f.name) && !opened.has(f.name) && Number.isSafeInteger(f.bytes)
      && f.bytes >= 0 && f.bytes <= 134217728 && (total += f.bytes) <= 268435456, 'NATIVE_SOURCE_FILE_LIMIT');
    const item = await load(join(directory, f.name), f.sha256, f.bytes); must(item.stat.size === f.bytes, 'NATIVE_SOURCE_FILE_CHANGED'); opened.set(f.name, item);
  }
  const identityRows = opened.get(m.registryFile)?.value, partyRows = opened.get('party-reference-candidates.json')?.value;
  must(Array.isArray(identityRows) && identityRows.length <= 600000 && Array.isArray(partyRows) && partyRows.length <= 10000, 'NATIVE_SOURCE_REGISTRY_ROWS');
  const identities = new Map(), parties = new Map(), nativeIds = new Set();
  for (const row of identityRows) {
    const k = key(row.entity, row.sourceKey); must(typeof row.entity === 'string' && typeof row.sourceKey === 'string' && row.sourceKey.length > 0 && uuid(row.nativeId)
      && row.nativeId !== row.sourceKey && hash(row.normalizedHash) && !identities.has(k) && !nativeIds.has(row.nativeId), 'NATIVE_SOURCE_REGISTRY_IDENTITY');
    identities.set(k, Object.freeze({ ...row })); nativeIds.add(row.nativeId);
  }
  for (const input of partyRows) { const k = key(input.source?.entityType, input.source?.sourceKey); must(!parties.has(k) && identities.has(k), 'NATIVE_SOURCE_PARTY_IDENTITY'); parties.set(k, input); }
  let closed = false;
  const active = () => must(!closed, 'NATIVE_SOURCE_REGISTRY_CLOSED');
  const lookup = (entity, sourceKey) => { active(); const row = identities.get(key(entity, sourceKey)); must(row, 'NATIVE_SOURCE_REFERENCE_MISSING'); return row; };
  const checked = q => { historySettlementRequestHash(q); const row = lookup(q.entity, q.sourceKey); must(requestHash(q.normalizedFields) === row.normalizedHash, 'NATIVE_SOURCE_NORMALIZED_CHANGED'); return row; };
  async function verify() {
    active(); for (const item of [manifest, ...opened.values()]) must(same(item.stat, await lstat(item.path)), 'NATIVE_SOURCE_FILE_CHANGED'); active();
  }
  async function resolveNativeBinding(q) {
    await verify(); const row = checked(q), n = q.normalizedFields;
    if (q.entity === 'PRODUCT') return { product: { sourceKey: q.sourceKey, nativeId: row.nativeId, expectedVersion: 1 }, blankPricePolicy: 'V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET' };
    if (q.entity === 'TRANSFER_LINE') return { header: { sourceKey: n['单据来源编号'], nativeId: lookup('TRANSFER_HEADER', n['单据来源编号']).nativeId }, sku: { sourceKey: n['SKU来源编号'], nativeId: lookup('SKU', n['SKU来源编号']).nativeId } };
    if (q.entity === 'SALES_HEADER' || q.entity === 'TRANSFER_HEADER') {
      const targets = q.entity === 'SALES_HEADER'
        ? { '所属厅来源编号': 'HALL', '客户来源编号': 'CUSTOMER', '仓库来源编号': 'WAREHOUSE', '营业员来源编号': 'STAFF', '原创建厅编号': 'HALL' }
        : { '调出仓来源编号': 'WAREHOUSE', '调入仓来源编号': 'WAREHOUSE', '原创建厅编号': 'HALL' };
      return Object.fromEntries(Object.entries(targets).filter(([field]) => n[field] !== '').map(([field, entity]) => {
        must(typeof n[field] === 'string', 'NATIVE_SOURCE_REFERENCE_MISSING'); return [field, { sourceKey: n[field], nativeId: lookup(entity, n[field]).nativeId }];
      }));
    }
    throw Object.assign(Error('NATIVE_SOURCE_KIND_REQUIRES_TYPED_BINDING_PRODUCER'), { code: 'NATIVE_SOURCE_KIND_REQUIRES_TYPED_BINDING_PRODUCER' });
  }
  return {
    verify, resolveNativeBinding,
    async resolveNativeReferenceBinding(q) {
      await verify(); checked(q); const p = parties.get(key(q.entity, q.sourceKey));
      must(p && ['HALL', 'CUSTOMER', 'STAFF'].includes(q.entity) && requestHash(p.source.rawFields) === requestHash(q.rawFields), 'NATIVE_SOURCE_PARTY_CHANGED');
      return structuredClone({ nativeSnapshot: p.nativeSnapshot, bindings: p.bindings, enumMappings: p.enumMappings });
    },
    async authorizePartyChunk(chunk) {
      await verify(); validatePreparedNativePartyImportChunk(chunk);
      for (const row of chunk.rows) { const p = parties.get(key(row.entity, row.input.source.sourceKey)); must(p && requestHash(p) === requestHash(row.input), 'NATIVE_SOURCE_PARTY_CHANGED'); }
      await verify();
    },
    close() { closed = true; identities.clear(); parties.clear(); opened.clear(); }
  };
}
/** Opens the EXISTING actual source readers with the frozen resolver, rather than
 * treating a prepared JSON or the source manifest hash as row authorization. */
export async function openBoundProductTransferReader(options, registry) {
  must(typeof registry?.resolveNativeBinding === 'function' && typeof registry.verify === 'function', 'NATIVE_SOURCE_REGISTRY_REQUIRED');
  await registry.verify(); return openAuthorizedV3Reader({ ...options, resolveNativeBinding: q => registry.resolveNativeBinding(q) });
}
export async function openBoundHeaderReader(options, registry) {
  must(typeof registry?.resolveNativeBinding === 'function' && typeof registry.resolveNativeReferenceBinding === 'function', 'NATIVE_SOURCE_REGISTRY_REQUIRED');
  await registry.verify(); return openAuthorizedV3HeaderReader({ ...options, includeNativeReferenceSources: true,
    resolveNativeBinding: q => registry.resolveNativeBinding(q), resolveNativeReferenceBinding: q => registry.resolveNativeReferenceBinding(q) });
}
export const NATIVE_SOURCE_STEP_KINDS = Object.freeze(['PARTY', 'CATALOGUE', 'PRODUCT', 'SKU', 'BARCODE', 'STOCK_CONTRIBUTOR', 'PAYMENT', 'HEADER_REFERENCE', 'HEADER', 'SALES_DETAIL', 'SETTLEMENT', 'TRANSFER_LINES', 'MAIN', 'CLOSURE']);
/** The runner calls stores directly, so this dispatch MUST execute all source/native
 * authorizers before target connection. Missing even one real producer is closed.
 * Callers bind actual reader.authorize/authorizeReferences and reviewed native writers;
 * a truthy return, no-op fallback or report object is never supplied by this module. */
export function createNativeSourceStepAuthorizer(handlers) {
  must(handlers && Object.getPrototypeOf(handlers) === Object.prototype && Reflect.ownKeys(handlers).length === NATIVE_SOURCE_STEP_KINDS.length, 'NATIVE_SOURCE_ALL_AUTHORITIZERS_REQUIRED');
  const captured = {};
  for (const kind of NATIVE_SOURCE_STEP_KINDS) { const d = Object.getOwnPropertyDescriptor(handlers, kind); must(d?.enumerable && Object.hasOwn(d, 'value') && typeof d.value === 'function', 'NATIVE_SOURCE_ALL_AUTHORITIZERS_REQUIRED'); captured[kind] = d.value; }
  return async original => {
    historySettlementRequestHash(original); must(original && Reflect.ownKeys(original).length === 2 && Object.hasOwn(original, 'kind') && Object.hasOwn(original, 'payload')
      && Object.hasOwn(captured, original.kind), 'NATIVE_SOURCE_UNKNOWN_STEP');
    const step = structuredClone(original), before = historySettlementRequestHash(step);
    const result = await captured[step.kind](step.payload);
    must(result === undefined && historySettlementRequestHash(step) === before, 'NATIVE_SOURCE_AUTHORIZER_PROTOCOL');
  };
}
