/** Real reader/resolver composition. A registry pin must come from C after independent
 * review; this module never derives an authorization pin from a supplied file. */
import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { historySettlementRequestHash } from '../../packages/application/src/import-v3-history-settlement.ts';
import { validatePreparedNativePartyImportChunk, prepareNativePartyImportChunk, nativePartyStandaloneImportSource, NATIVE_PARTY_IMPORT_VERSION } from '../../packages/application/src/native-party-import.ts';
import { openAuthorizedV3Reader } from '../import-v2/authorized-reader.mjs';
import { openAuthorizedV3HeaderReader } from '../import-v2/authorized-header-reader.mjs';
import { NATIVE_BINDING_PACKAGE_VERSION } from './prepare-native-bindings.mjs';
import { stableImportId } from '../../packages/application/src/inventory-cutoff-import.ts';
import { prepareNativeCatalogueImportChunk, validatePreparedNativeCatalogueImportChunk, nativeCatalogueSourceEvidence } from '../../packages/application/src/native-catalogue-import.ts';
import { nativeCatalogueBindingEvidence } from '../../adapters/postgres/src/native-catalogue-import.ts';
import { historyClosureProjectionRow } from '../../packages/application/src/history-typed-closure.ts';
import { historyHeaderNativeReferenceEvidence } from '../../adapters/postgres/src/import-v3-history-header-native-reference-store.ts';
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
export async function openNativeBindingRegistry({ directory, trustedManifestSha256, reviewRecordFile, trustedReviewRecordSha256, binding }) {
  must(typeof directory === 'string' && isAbsolute(directory) && uuid(binding?.batchId), 'NATIVE_SOURCE_REGISTRY_CONFIG');
  const manifest = await load(join(directory, 'review-candidate-manifest.json'), trustedManifestSha256, 4194304), m = manifest.value;
  must(m.version === NATIVE_BINDING_PACKAGE_VERSION && m.batchId === binding.batchId && m.fixedSourceNamespace === binding.fixedSourceNamespace
    && m.selectionSha256 === binding.selectionSha256 && m.cutoffAt === binding.cutoffAt && Array.isArray(m.files) && m.files.length <= 16, 'NATIVE_SOURCE_REGISTRY_BINDING');
  must(typeof reviewRecordFile === 'string' && isAbsolute(reviewRecordFile), 'NATIVE_SOURCE_REVIEW_SCOPE_REQUIRED');
  const review = await load(reviewRecordFile, trustedReviewRecordSha256, 4194304), a = review.value;
  must(a.version === 'C_NATIVE_BINDING_PARTIAL_REVIEW_PIN_V1' && a.decision === 'ACCEPT_EXACT_QB_REVIEWED_PARTIAL_ARTIFACT_SCOPE'
    && a.manifestSha256 === trustedManifestSha256 && a.manifestBytes === manifest.stat.size && a.closedToUnreviewedComponents === true
    && a.realNativeCommandsOrImportAuthorizedByThisPinAlone === false && Array.isArray(a.components)
    && ['batchId', 'fixedSourceNamespace', 'cutoffAt', 'selectionSha256'].every(k => a.binding?.[k] === binding[k]), 'NATIVE_SOURCE_REVIEW_SCOPE_REQUIRED');
  const components = new Map();
  for (const c of a.components) {
    must(['native-identity-registry.json', 'party-reference-candidates.json', 'product-source-candidates.json', 'reference-inputs-for-review.json'].includes(c.component)
      && !components.has(c.component) && hash(c.sha256) && typeof c.scope === 'string' && c.scope.length > 0, 'NATIVE_SOURCE_REVIEW_COMPONENT');
    components.set(c.component, c);
  }
  const opened = new Map(); let total = 0;
  for (const f of m.files) {
    must(typeof f.name === 'string' && /^[a-z][a-z0-9-]*\.json$/.test(f.name) && !opened.has(f.name) && Number.isSafeInteger(f.bytes)
      && f.bytes >= 0 && f.bytes <= 134217728 && (total += f.bytes) <= 268435456, 'NATIVE_SOURCE_FILE_LIMIT');
    must(components.get(f.name)?.sha256 === f.sha256, 'NATIVE_SOURCE_REVIEW_COMPONENT');
    const item = await load(join(directory, f.name), f.sha256, f.bytes); must(item.stat.size === f.bytes, 'NATIVE_SOURCE_FILE_CHANGED'); opened.set(f.name, item);
  }
  const identityRows = opened.get(m.registryFile)?.value, partyRows = opened.get('party-reference-candidates.json')?.value;
  must(Array.isArray(identityRows) && identityRows.length <= 600000 && Array.isArray(partyRows) && partyRows.length <= 10000, 'NATIVE_SOURCE_REGISTRY_ROWS');
  const identities = new Map(), parties = new Map(), products = new Map(), nativeIds = new Set();
  for (const row of identityRows) {
    const k = key(row.entity, row.sourceKey); must(typeof row.entity === 'string' && typeof row.sourceKey === 'string' && row.sourceKey.length > 0 && uuid(row.nativeId)
      && row.nativeId !== row.sourceKey && hash(row.normalizedHash) && !identities.has(k) && !nativeIds.has(row.nativeId), 'NATIVE_SOURCE_REGISTRY_IDENTITY');
    identities.set(k, Object.freeze({ ...row })); nativeIds.add(row.nativeId);
  }
  for (const input of partyRows) { const k = key(input.source?.entityType, input.source?.sourceKey); must(!parties.has(k) && identities.has(k), 'NATIVE_SOURCE_PARTY_IDENTITY'); parties.set(k, input); }
  for (const source of opened.get('product-source-candidates.json')?.value ?? []) {
    const k = key('PRODUCT', source.sourceKey); must(source.entityType === 'PRODUCT' && !products.has(k) && identities.has(k), 'NATIVE_SOURCE_PRODUCT_IDENTITY'); products.set(k, source);
  }
  let closed = false;
  const active = () => must(!closed, 'NATIVE_SOURCE_REGISTRY_CLOSED');
  const lookup = (entity, sourceKey) => { active(); const row = identities.get(key(entity, sourceKey)); must(row, 'NATIVE_SOURCE_REFERENCE_MISSING'); return row; };
  const checked = q => { historySettlementRequestHash(q); const row = lookup(q.entity, q.sourceKey); must(requestHash(q.normalizedFields) === row.normalizedHash, 'NATIVE_SOURCE_NORMALIZED_CHANGED'); return row; };
  async function verify() {
    active(); for (const item of [manifest, review, ...opened.values()]) must(same(item.stat, await lstat(item.path)), 'NATIVE_SOURCE_FILE_CHANGED'); active();
  }
  async function resolveNativeBinding(q) {
    await verify();
    // C partial review covers PRODUCT source/UUID/blank policy and the628party
    // mappings only. All other468871 registry rows are UUID allocation evidence.
    // A matching hash is deliberately insufficient to activate another kind.
    must(q?.entity === 'PRODUCT' && components.has('product-source-candidates.json'), 'NATIVE_SOURCE_REVIEW_SCOPE_FORBIDDEN');
    const row = checked(q), source = products.get(key('PRODUCT', q.sourceKey));
    must(source && requestHash(source.rawFields) === requestHash(q.rawFields) && requestHash(source.normalizedFields) === requestHash(q.normalizedFields), 'NATIVE_SOURCE_PRODUCT_CHANGED');
    if (q.entity === 'PRODUCT') return { product: { sourceKey: q.sourceKey, nativeId: row.nativeId, expectedVersion: 1 }, blankPricePolicy: 'V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET' };
    throw Object.assign(Error('NATIVE_SOURCE_KIND_REQUIRES_TYPED_BINDING_PRODUCER'), { code: 'NATIVE_SOURCE_KIND_REQUIRES_TYPED_BINDING_PRODUCER' });
  }
  function partyChunks() {
    const groups = [];
    // Existing native FKs require one 43 hall +53 warehouse transaction. Customer
    // defaults are created first; neither half of the hall/warehouse cycle is split.
    for (const entity of ['CUSTOMER', 'SUPPLIER']) {
      const rows = partyRows.filter(p => p.source.entityType === entity);
      for (let i = 0; i < rows.length; i += 100) groups.push(rows.slice(i, i + 100));
    }
    const hallsAndWarehouses = partyRows.filter(p => ['HALL', 'WAREHOUSE'].includes(p.source.entityType));
    must(hallsAndWarehouses.length <= 100, 'NATIVE_SOURCE_ATOMIC_HALL_WAREHOUSE_BOUND');
    if (hallsAndWarehouses.length) groups.push(hallsAndWarehouses);
    const staff = partyRows.filter(p => p.source.entityType === 'STAFF'); for (let i = 0; i < staff.length; i += 100) groups.push(staff.slice(i, i + 100));
    return groups.map(g => prepareNativePartyImportChunk(g));
  }
  return {
    verify, resolveNativeBinding,
    async *partyChunks() { await verify(); for (const chunk of partyChunks()) { active(); yield chunk; } },
    async resolveNativeReferenceBinding(q) {
      await verify(); must(components.has('party-reference-candidates.json'), 'NATIVE_SOURCE_REVIEW_SCOPE_FORBIDDEN'); checked(q); const p = parties.get(key(q.entity, q.sourceKey));
      must(p && ['HALL', 'CUSTOMER', 'STAFF'].includes(q.entity) && requestHash(p.source.rawFields) === requestHash(q.rawFields), 'NATIVE_SOURCE_PARTY_CHANGED');
      return structuredClone({ nativeSnapshot: p.nativeSnapshot, bindings: p.bindings, enumMappings: p.enumMappings });
    },
    async authorizePartyChunk(chunk) {
      await verify(); validatePreparedNativePartyImportChunk(chunk);
      for (const row of chunk.rows) { const p = parties.get(key(row.entity, row.input.source.sourceKey)); must(p && requestHash(p) === requestHash(row.input), 'NATIVE_SOURCE_PARTY_CHANGED'); }
      await verify();
    },
    async openPartyClosure(scope, context) {
      await verify(); must(context?.group === 'PARTIES' && !context.signal?.aborted && scope.batchId === binding.batchId
        && scope.fixedSourceNamespace === binding.fixedSourceNamespace && scope.selectionSha256 === binding.selectionSha256
        && hash(binding.authorizedPayloadHash) && scope.authorizedPayloadHash === binding.authorizedPayloadHash, 'NATIVE_SOURCE_PARTY_CLOSURE_SCOPE');
      let sessionClosed = false; const check = () => { active(); must(!sessionClosed && !context.signal?.aborted, 'NATIVE_SOURCE_REGISTRY_CLOSED'); };
      const sources = [], typed = [], rows = partyChunks().flatMap(c => c.rows);
      for (const row of rows) {
        const original = row.headerReference ? historyHeaderNativeReferenceEvidence(row.headerReference, 0) : { source: nativePartyStandaloneImportSource(row) };
        sources.push(historyClosureProjectionRow('import_source_row', original.source));
        if (original.reference) typed.push(historyClosureProjectionRow('import_header_native_reference', original.reference));
        const intent = { batch_id: binding.batchId, source_row_id: row.input.source.id, entity_type: row.entity, source_key: row.input.source.sourceKey,
          native_id: row.nativeId, native_snapshot: row.nativeSnapshot, source_snapshot: original.source, selection: row.input.selection,
          warehouse_record: row.input.warehouseRecord ?? null, authorization: row.authorization, row_fingerprint: row.fingerprint, validator_version: NATIVE_PARTY_IMPORT_VERSION };
        for (const [entity, column] of [['HALL', 'native_hall_id'], ['WAREHOUSE', 'native_warehouse_id'], ['CUSTOMER', 'native_customer_id'], ['SUPPLIER', 'native_supplier_id'], ['STAFF', 'native_staff_id']]) intent[column] = row.entity === entity ? row.nativeId : null;
        typed.push(historyClosureProjectionRow('native_party_import_evidence', intent), historyClosureProjectionRow(row.entity.toLowerCase(), row.nativeSnapshot));
      }
      const order = (a, b) => Buffer.compare(Buffer.from(a.relation + '\0' + a.key), Buffer.from(b.relation + '\0' + b.key)); sources.sort(order); typed.sort(order);
      return { async verify() { check(); await verify(); check(); },
        async *sourceRows() { for (const row of sources) { check(); yield structuredClone(row); } },
        async *typedRows() { for (const row of typed) { check(); yield structuredClone(row); } },
        async *documents() { check(); }, async close() { sessionClosed = true; } };
    },
    close() { closed = true; identities.clear(); parties.clear(); products.clear(); opened.clear(); identityRows.length = 0; partyRows.length = 0; }
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
/** Actual new dictionary mapping bytes are reviewed independently from the old
 * barcode-exclusion approval. C supplies both external pins after QB's source/rule
 * review. No absent code/order/enablement is filled by this source factory. */
export async function openReviewedCatalogueSource({ mappingFile, trustedMappingSha256, reviewApprovalFile, trustedReviewApprovalSha256, binding }) {
  must(typeof mappingFile === 'string' && isAbsolute(mappingFile) && typeof reviewApprovalFile === 'string' && isAbsolute(reviewApprovalFile), 'NATIVE_SOURCE_CATALOGUE_PATHS');
  const mapping = await load(mappingFile, trustedMappingSha256, 16777216), review = await load(reviewApprovalFile, trustedReviewApprovalSha256, 4194304);
  const m = mapping.value, a = review.value;
  must(m.version === 'NATIVE_CATALOGUE_OCCURRENCE_CANDIDATE_V1' && Array.isArray(m.groups) && m.groups.length > 0 && m.groups.length <= 10000,
    'NATIVE_SOURCE_CATALOGUE_MAPPING');
  must(a.version === 'NATIVE_CATALOGUE_TECHNICAL_REVIEW_V1' && a.mappingSha256 === trustedMappingSha256
    && [m, a].every(v => v.batchId === binding.batchId && v.fixedSourceNamespace === binding.fixedSourceNamespace && v.selectionSha256 === binding.selectionSha256), 'NATIVE_SOURCE_CATALOGUE_REVIEW_BINDING');
  const selection = { source: 'REVIEWED_DICTIONARY_OCCURRENCES_V1', baseManifestSha256: m.baseManifestSha256,
    selectionSha256: binding.selectionSha256, approvalSha256: trustedReviewApprovalSha256, occurrenceContractSha256: trustedMappingSha256 };
  let rowNo = 0, closed = false; const sourceKeys = new Set(), targets = new Set(), prepared = [], entries = [];
  for (const group of m.groups) {
    must(Array.isArray(group) && group.length > 0 && group.length <= 200, 'NATIVE_SOURCE_CATALOGUE_GROUP_BOUND');
    const rows = group.map(entry => {
      historySettlementRequestHash(entry); const { entity, sourceKey, nativeId, values, references, originalEvidence } = entry;
      must(typeof entity === 'string' && typeof sourceKey === 'string' && sourceKey.length > 0 && values && Object.getPrototypeOf(values) === Object.prototype
        && originalEvidence && Object.getPrototypeOf(originalEvidence) === Object.prototype && Reflect.ownKeys(entry).length === 6
        && !Object.hasOwn(values, 'sourceKey') && !Object.hasOwn(values, 'originalEvidence'), 'NATIVE_SOURCE_CATALOGUE_ENTRY');
      const raw = { sourceKey, ...values, originalEvidence }, fields = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key,
        { origin: 'ORIGINAL', reason: 'EXACT_NEW_REVIEWED_DICTIONARY_MAPPING_JSON_VALUE_NOT_OLD_NATIVE_CLAIM', raw: value }]));
      const s = { id: stableImportId('source-row', binding.fixedSourceNamespace, entity, sourceKey), batchId: binding.batchId,
        entityType: entity, sourceKey, fileRef: mappingFile, sheet: 'reviewed-new-native-dictionary', rowNo: String(++rowNo), sourceFileSha256: trustedMappingSha256,
        rowSha256: digest(Buffer.from(JSON.stringify(entry))), rawFields: raw, normalizedFields: raw, fieldProvenance: { schema_version: 1, fields } };
      const k = key(entity, sourceKey); must(!sourceKeys.has(k), 'NATIVE_SOURCE_CATALOGUE_DUPLICATE'); sourceKeys.add(k);
      const row = { source: s, sourceKeyField: 'sourceKey', nativeId, decisions: Object.fromEntries(Object.keys(values).map(k => [k, { kind: 'SOURCE_FIELD', field: k }])), references };
      entries.push(entry); return row;
    });
    const chunk = prepareNativeCatalogueImportChunk({ batchId: binding.batchId, fixedSourceNamespace: binding.fixedSourceNamespace, selection, rows });
    for (const row of chunk.rows) { const k = key(row.entity, row.targetKey); must(!targets.has(k), 'NATIVE_SOURCE_CATALOGUE_DUPLICATE'); targets.add(k); }
    prepared.push(chunk);
  }
  const fingerprints = new Set(prepared.map(c => c.fingerprint)), flat = prepared.flatMap(c => c.rows);
  const assertOpen = () => must(!closed, 'NATIVE_SOURCE_CATALOGUE_CLOSED');
  async function verify() {
    assertOpen(); await load(mappingFile, trustedMappingSha256, 16777216); await load(reviewApprovalFile, trustedReviewApprovalSha256, 4194304); assertOpen();
  }
  const tables = { CATEGORY: 'product_category', COLOR: 'color', FIT: 'fit', SIZE: 'size', SIZE_GROUP: 'size_group', SEASON: 'season', SIZE_GROUP_MEMBER: 'size_group_member' };
  const order = (a, b) => Buffer.compare(Buffer.from(a.relation + '\0' + a.key), Buffer.from(b.relation + '\0' + b.key));
  return {
    verify, async *chunks() { await verify(); for (const chunk of prepared) { assertOpen(); yield structuredClone(chunk); } },
    async authorize(chunk) { await verify(); validatePreparedNativeCatalogueImportChunk(chunk); must(fingerprints.has(chunk.fingerprint), 'NATIVE_SOURCE_CATALOGUE_NOT_AUTHORIZED'); await verify(); },
    async openClosure(scope, context) {
      await verify(); must(context?.group === 'CATALOGUE' && !context.signal?.aborted && scope.batchId === binding.batchId
        && scope.fixedSourceNamespace === binding.fixedSourceNamespace && scope.selectionSha256 === binding.selectionSha256
        && hash(binding.authorizedPayloadHash) && scope.authorizedPayloadHash === binding.authorizedPayloadHash, 'NATIVE_SOURCE_CATALOGUE_CLOSURE_SCOPE');
      let sessionClosed = false; const active = () => { assertOpen(); must(!sessionClosed && !context.signal?.aborted, 'NATIVE_SOURCE_CATALOGUE_CLOSED'); };
      const sourceRows = flat.map(row => historyClosureProjectionRow('import_source_row', nativeCatalogueSourceEvidence(row))).sort(order);
      const typedRows = flat.flatMap(row => [historyClosureProjectionRow('import_native_catalogue_binding', nativeCatalogueBindingEvidence(row)),
        historyClosureProjectionRow(tables[row.entity], row.nativeSnapshot)]).sort(order);
      return {
        async verify() { active(); await verify(); active(); },
        async *sourceRows() { for (const row of sourceRows) { active(); yield structuredClone(row); } },
        async *typedRows() { for (const row of typedRows) { active(); yield structuredClone(row); } },
        async *documents() { active(); }, async close() { sessionClosed = true; }
      };
    },
    async close() { closed = true; prepared.length = 0; entries.length = 0; flat.length = 0; sourceKeys.clear(); targets.clear(); fingerprints.clear(); }
  };
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
