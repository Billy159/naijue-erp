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
import { validatePreparedNativeBarcode, NATIVE_BARCODE_MAIN_DEMOTION_VERSION } from '../../packages/application/src/native-barcode-import.ts';
import { historyHeaderNativeReferenceEvidence } from '../../adapters/postgres/src/import-v3-history-header-native-reference-store.ts';
import { validatePreparedProductEvidenceChunk } from '../../packages/application/src/product-evidence-staging.ts';
const must = (ok, code) => { if (!ok) throw Object.assign(Error(code), { code }); };
const digest = b => createHash('sha256').update(b).digest('hex');
const hash = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const uuid = s => typeof s === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const key = (entity, sourceKey) => JSON.stringify([entity, sourceKey]);
const same = (a, b) => ['dev', 'ino', 'size', 'mode', 'mtimeMs', 'ctimeMs'].every(k => a[k] === b[k]);
const exactData = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === keys.length
  && keys.every(k => { const d = Object.getOwnPropertyDescriptor(value, k); return d?.enumerable && Object.hasOwn(d, 'value'); });
async function load(path, pin, limit) {
  must(hash(pin), 'NATIVE_SOURCE_OUTSIDE_PIN_REQUIRED');
  const before = await lstat(path); must(before.isFile() && !before.isSymbolicLink() && before.size <= limit, 'NATIVE_SOURCE_FILE');
  const bytes = await readFile(path), after = await lstat(path);
  must(bytes.length === before.size && same(before, after) && digest(bytes) === pin, 'NATIVE_SOURCE_FILE_CHANGED');
  return { value: JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)), path, stat: after };
}
/** Genuine exact-source consumer of the already reviewed PRODUCT component.
 * It does not reopen workbooks/materialized snapshots or approve native refs.
 * The outer explicit product26 authorizer separately binds all target decisions. */
export async function openReviewedProductEvidenceSource(options) {
  must(exactData(options,['directory','trustedManifestSha256','reviewRecordFile','trustedReviewRecordSha256','binding']), 'PRODUCT_SOURCE_OPTIONS');
  const o=Object.fromEntries(Object.keys(options).map(k=>[k,Object.getOwnPropertyDescriptor(options,k).value]));
  historySettlementRequestHash(o.binding);const binding=structuredClone(o.binding);
  must(exactData(binding,['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'])&&uuid(binding.batchId)&&typeof binding.fixedSourceNamespace==='string'
    &&binding.fixedSourceNamespace.length>0&&typeof binding.cutoffAt==='string'&&hash(binding.selectionSha256)&&typeof o.directory==='string'&&isAbsolute(o.directory)
    &&typeof o.reviewRecordFile==='string'&&isAbsolute(o.reviewRecordFile),'PRODUCT_SOURCE_BINDING');
  const manifest=await load(join(o.directory,'review-candidate-manifest.json'),o.trustedManifestSha256,4194304),m=manifest.value;
  const review=await load(o.reviewRecordFile,o.trustedReviewRecordSha256,4194304),a=review.value;
  must(m.version===NATIVE_BINDING_PACKAGE_VERSION&&['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'].every(k=>m[k]===binding[k])
    &&Array.isArray(m.files)&&Number.isSafeInteger(m.products)&&m.products>0&&m.products<=50000,'PRODUCT_SOURCE_BINDING');
  must(a.version==='C_NATIVE_BINDING_PARTIAL_REVIEW_PIN_V1'&&a.decision==='ACCEPT_EXACT_QB_REVIEWED_PARTIAL_ARTIFACT_SCOPE'
    &&a.manifestSha256===o.trustedManifestSha256&&a.manifestBytes===manifest.stat.size&&a.closedToUnreviewedComponents===true
    &&a.realNativeCommandsOrImportAuthorizedByThisPinAlone===false&&Array.isArray(a.components)
    &&['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'].every(k=>a.binding?.[k]===binding[k]),'PRODUCT_SOURCE_COMPONENT_REVIEW_REQUIRED');
  const selected=m.files.filter(f=>f.name==='product-source-candidates.json'),accepted=a.components.filter(c=>c.component==='product-source-candidates.json');
  must(selected.length===1&&accepted.length===1&&selected[0].sha256===accepted[0].sha256&&Number.isSafeInteger(selected[0].bytes)
    &&selected[0].bytes>0&&selected[0].bytes<=33554432,'PRODUCT_SOURCE_COMPONENT_REVIEW_REQUIRED');
  const opened=await load(join(o.directory,'product-source-candidates.json'),selected[0].sha256,33554432),rows=opened.value;
  must(opened.stat.size===selected[0].bytes&&Array.isArray(rows)&&rows.length===m.products,'PRODUCT_SOURCE_COMPONENT_COVERAGE');
  const sources=new Map(),ids=new Set();
  for(const s of rows){historySettlementRequestHash(s);must(exactData(s,['id','batchId','entityType','sourceKey','fileRef','sheet','rowNo','sourceFileSha256','rowSha256','rawFields','normalizedFields','fieldProvenance'])
    &&s.entityType==='PRODUCT'&&s.batchId===binding.batchId&&uuid(s.id)&&typeof s.sourceKey==='string'&&s.sourceKey.length>0&&!sources.has(s.sourceKey)&&!ids.has(s.id),'PRODUCT_SOURCE_COMPONENT_ROW');sources.set(s.sourceKey,s);ids.add(s.id);}
  let closed=false;const active=()=>must(!closed,'PRODUCT_SOURCE_CLOSED');
  async function verify(){active();for(const item of [manifest,review,opened])must(same(item.stat,await lstat(item.path)),'PRODUCT_SOURCE_FILE_CHANGED');active();}
  return {report:Object.freeze({kind:'REVIEWED_PRODUCT_EVIDENCE_SOURCE_V1',products:rows.length,sourceComponentSha256:selected[0].sha256,noSql:true,nativeReferenceAuthority:false}),verify,
    async *rows(){await verify();for(const source of rows){active();yield structuredClone(source);}await verify();},
    async authorize(input){active();const before=historySettlementRequestHash(input),chunk=structuredClone(input);
      must(exactData(chunk,['batchId','fixedSourceNamespace','selection','rows','mappingVersion','fingerprint'])&&chunk.rows.every(r=>exactData(r,['source','product','blankPricePolicy'])),'PRODUCT_SOURCE_EXACT_PROJECTION');
      validatePreparedProductEvidenceChunk(chunk);await verify();
      must(chunk.batchId===binding.batchId&&chunk.fixedSourceNamespace===binding.fixedSourceNamespace&&chunk.selection.selectionSha256===binding.selectionSha256,'PRODUCT_SOURCE_SCOPE_CHANGED');
      for(const row of chunk.rows){const expected=sources.get(row.source.sourceKey);must(expected&&requestHash(expected)===requestHash(row.source),'PRODUCT_SOURCE_ORIGINAL_CHANGED');}
      await verify();must(historySettlementRequestHash(input)===before,'PRODUCT_SOURCE_INPUT_CHANGED');
    },async close(){closed=true;sources.clear();ids.clear();rows.length=0;}};
}
/** Narrow source conversion proof only. It cannot authorize a native PRODUCT,
 * choose an old scalar season, issue a runtime profile or publish a batch. */
export async function openReviewedProductSeasonSource(options) {
  must(exactData(options, ['mappingFile', 'trustedMappingSha256', 'reviewFile', 'trustedReviewSha256',
    'dictionaryFile', 'trustedDictionarySha256', 'dictionaryReviewFile', 'trustedDictionaryReviewSha256', 'binding']), 'PRODUCT_SEASON_CONFIG');
  options = { ...options };
  requestHash(options.binding); const b = structuredClone(options.binding);
  must(uuid(b.batchId) && typeof b.fixedSourceNamespace === 'string' && b.fixedSourceNamespace.length > 0 && hash(b.selectionSha256), 'PRODUCT_SEASON_BINDING');
  const paths = ['mappingFile', 'reviewFile', 'dictionaryFile', 'dictionaryReviewFile'];
  must(paths.every(k => typeof options[k] === 'string' && isAbsolute(options[k])), 'PRODUCT_SEASON_PATH');
  const mapping = await load(options.mappingFile, options.trustedMappingSha256, 4194304);
  const review = await load(options.reviewFile, options.trustedReviewSha256, 4194304);
  const dictionary = await load(options.dictionaryFile, options.trustedDictionarySha256, 16777216);
  const dictionaryReview = await load(options.dictionaryReviewFile, options.trustedDictionaryReviewSha256, 4194304);
  const m = mapping.value, a = review.value, d = dictionary.value, da = dictionaryReview.value;
  const bound = v => ['batchId', 'fixedSourceNamespace', 'selectionSha256'].every(k => v?.[k] === b[k]);
  must(a.version === 'C_PRODUCT_REFERENCE_DELTA_AND_SEASON_REVIEW_V1' && a.decision === 'ACCEPT_EXACT_QB49_SCOPED_CANDIDATES'
    && a.realNativeCommandsOrImportAuthorizedByThisPinAlone === false && a.independentReview?.result === 'PASS'
    && a.independentReview.qualification === 'NEW2_REF_PLUS_OLD2644_PRESERVATION_AND_2956_SEASON_SOURCE_CANDIDATE_ONLY'
    && bound(a.binding) && Array.isArray(a.components), 'PRODUCT_SEASON_REVIEW');
  const components = a.components.filter(c => c.path === options.mappingFile);
  must(components.length === 1 && components[0].sha256 === options.trustedMappingSha256 && components[0].bytes === mapping.stat.size, 'PRODUCT_SEASON_REVIEW_COMPONENT');
  must(m.version === 'NATIVE_PRODUCT_SEASON_IDS_SOURCE_CONVERSION_CANDIDATE_V1' && bound(m)
    && m.dictionaryMappingSha256 === options.trustedDictionarySha256 && hash(m.sourceProductsSha256) && hash(m.fieldApprovalSha256)
    && m.containsNewUUIDs === false && m.databaseWrites === 0 && m.importAuthorized === false
    && Array.isArray(m.rows) && m.rows.length === 2956, 'PRODUCT_SEASON_MAPPING');
  must(d.version === 'NATIVE_CATALOGUE_OCCURRENCE_CANDIDATE_V1' && bound(d) && Array.isArray(d.groups)
    && d.groups.every(g => Array.isArray(g) && g.length > 0 && g.length <= 200)
    && da.version === 'NATIVE_CATALOGUE_TECHNICAL_REVIEW_V1' && bound(da) && da.mappingSha256 === options.trustedDictionarySha256, 'PRODUCT_SEASON_DICTIONARY_REVIEW');
  const entries = d.groups.flat().filter(e => e.entity === 'SEASON').sort((x, y) => x.values?.display_order - y.values?.display_order);
  const names = ['春', '夏', '秋', '冬'], codes = ['SEASON_SPRING', 'SEASON_SUMMER', 'SEASON_AUTUMN', 'SEASON_WINTER'];
  must(entries.length === 4 && new Set(entries.map(e => e.nativeId)).size === 4, 'PRODUCT_SEASON_DICTIONARY');
  const atoms = new Map(entries.map((e, i) => {
    must(exactData(e, ['entity', 'sourceKey', 'nativeId', 'values', 'references', 'originalEvidence']) && uuid(e.nativeId)
      && e.sourceKey === names[i] && exactData(e.values, ['code', 'name', 'display_order']) && e.values.name === names[i]
      && e.values.code === codes[i] && e.values.display_order === i && exactData(e.references, [])
      && e.originalEvidence && Object.getPrototypeOf(e.originalEvidence) === Object.prototype, 'PRODUCT_SEASON_DICTIONARY');
    return [e.sourceKey, { sourceKey: e.sourceKey, nativeId: e.nativeId, nativeSnapshot: { id: e.nativeId, ...e.values } }];
  }));
  const choices = new Map([['', null], ...names.map(n => [n, [n]]), ['春、夏', ['春', '夏']], ['秋、冬', ['秋', '冬']]]);
  const expectedRaw = { '秋': 1099, '冬': 566, '': 48, '春': 404, '秋、冬': 291, '夏': 529, '春、夏': 19 };
  const counts = { UNKNOWN: 0, SINGLE: 0, MULTIPLE: 0 }, rawCounts = {}, rows = new Map(), ids = new Set(), sourceIds = new Set();
  for (const row of m.rows) {
    must(exactData(row, ['sourceRowId', 'sourceKey', 'sourceEvidenceHash', 'nativeProductId', 'sourceFileSha256', 'sheet', 'rowNo',
      'rawSeason', 'normalizedSeason', 'seasonIds', 'dictionaryNames', 'dictionaryMappingSha256', 'oldScalarWrite'])
      && uuid(row.sourceRowId) && typeof row.sourceKey === 'string' && row.sourceKey.length > 0 && hash(row.sourceEvidenceHash)
      && uuid(row.nativeProductId) && row.nativeProductId !== row.sourceKey && hash(row.sourceFileSha256)
      && typeof row.sheet === 'string' && row.sheet.length > 0 && typeof row.rowNo === 'string' && /^[1-9]\d*$/.test(row.rowNo)
      && row.dictionaryMappingSha256 === options.trustedDictionarySha256 && row.oldScalarWrite === 'UNCHANGED_BY_THIS_CANDIDATE'
      && choices.has(row.rawSeason) && row.normalizedSeason === row.rawSeason && !rows.has(row.sourceKey)
      && !ids.has(row.nativeProductId) && !sourceIds.has(row.sourceRowId), 'PRODUCT_SEASON_ROW');
    const selected = choices.get(row.rawSeason), expectedIds = selected?.map(n => atoms.get(n).nativeId) ?? null;
    must(requestHash(row.dictionaryNames) === requestHash(selected) && requestHash(row.seasonIds) === requestHash(expectedIds), 'PRODUCT_SEASON_MEMBERS');
    counts[selected === null ? 'UNKNOWN' : selected.length === 1 ? 'SINGLE' : 'MULTIPLE']++;
    rawCounts[row.rawSeason] = (rawCounts[row.rawSeason] ?? 0) + 1;
    rows.set(row.sourceKey, row); ids.add(row.nativeProductId); sourceIds.add(row.sourceRowId);
  }
  must(requestHash(counts) === requestHash({ UNKNOWN: 48, SINGLE: 2598, MULTIPLE: 310 }) && requestHash(counts) === requestHash(m.knownCounts)
    && requestHash(rawCounts) === requestHash(expectedRaw) && requestHash(rawCounts) === requestHash(m.rawCounts), 'PRODUCT_SEASON_COUNTS');
  let closed = false; const active = () => must(!closed, 'PRODUCT_SEASON_CLOSED');
  async function verify() {
    active(); for (const item of [mapping, review, dictionary, dictionaryReview]) must(same(item.stat, await lstat(item.path)), 'NATIVE_SOURCE_FILE_CHANGED'); active();
  }
  async function proofFor(source, product) {
    await verify(); requestHash(source); requestHash(product); const row = rows.get(source?.sourceKey);
    must(row && source.entityType === 'PRODUCT' && source.batchId === b.batchId && source.id === row.sourceRowId
      && source.sourceFileSha256 === row.sourceFileSha256 && source.sheet === row.sheet && source.rowNo === row.rowNo
      && source.rawFields?.['季节'] === row.rawSeason && source.normalizedFields?.['季节'] === row.normalizedSeason
      && requestHash(source) === row.sourceEvidenceHash && exactData(product, ['sourceKey', 'nativeId', 'expectedVersion'])
      && product.sourceKey === row.sourceKey && product.nativeId === row.nativeProductId && product.expectedVersion === 1, 'PRODUCT_SEASON_EXACT_SOURCE');
    const selected = choices.get(row.rawSeason);
    // The reviewed mapping keeps dictionary order. The approved storage contract
    // derives UUID order without changing that mapping or claiming its hash is
    // the hash of this derived object. Display remains dictionary ordered.
    const references = selected?.map(n => atoms.get(n)).sort((a, b) => a.nativeId < b.nativeId ? -1 : a.nativeId > b.nativeId ? 1 : 0) ?? [];
    return structuredClone({ version: 'NATIVE_PRODUCT_SEASON_SELECTION_V1', mapping_sha256: options.trustedMappingSha256,
      source_key: row.sourceKey, source_season: row.rawSeason, state: selected === null ? 'UNKNOWN' : 'KNOWN',
      season_ids: selected === null ? null : references.map(r => r.nativeId), references });
  }
  await verify();
  return { report: Object.freeze({ kind: 'PRODUCT_SEASON_SOURCE_PROOF_ONLY_V1', products: rows.size, unknown: counts.UNKNOWN,
    single: counts.SINGLE, multiple: counts.MULTIPLE, multipleMembers: counts.MULTIPLE * 2, noSql: true, nativeProductAuthorized: false, importReady: false }),
    verify, proofFor, async authorizeProof(source, product, proof) {
      requestHash(proof); must(requestHash(proof) === requestHash(await proofFor(source, product)), 'PRODUCT_SEASON_PROOF_CHANGED');
    }, close() { closed = true; rows.clear(); atoms.clear(); ids.clear(); sourceIds.clear(); m.rows.length = 0; } };
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
    async bootstrapPartyClosure(staffSourceKey) {
      await verify(); must(typeof staffSourceKey === 'string' && staffSourceKey.length > 0, 'NATIVE_SOURCE_BOOTSTRAP_STAFF_REQUIRED');
      const selected = new Map(), root = parties.get(key('STAFF', staffSourceKey)); must(root, 'NATIVE_SOURCE_REFERENCE_MISSING');
      const targets = { HALL: { '默认客户来源编号': 'CUSTOMER', '默认销货仓来源编号': 'WAREHOUSE' },
        WAREHOUSE: { '所属厅来源编号': 'HALL' }, STAFF: { '所属厅来源编号': 'HALL' }, CUSTOMER: {}, SUPPLIER: {} };
      const visit = input => {
        const entity = input.source.entityType, k = key(entity, input.source.sourceKey); if (selected.has(k)) return;
        must(selected.size < 100 && lookup(entity, input.source.sourceKey).nativeId === input.nativeSnapshot.id, 'NATIVE_SOURCE_BOOTSTRAP_CLOSURE_BOUND');
        selected.set(k, input);
        for (const [field, bound] of Object.entries(input.bindings)) {
          const target = targets[entity]?.[field]; must(target && bound && typeof bound.sourceKey === 'string', 'NATIVE_SOURCE_BOOTSTRAP_RELATION');
          const dependency = parties.get(key(target, bound.sourceKey)); must(dependency && dependency.nativeSnapshot.id === bound.nativeId, 'NATIVE_SOURCE_BOOTSTRAP_RELATION'); visit(dependency);
        }
      };
      visit(root); const chunk = prepareNativePartyImportChunk([...selected.values()]); await verify();
      return { chunk, staff: structuredClone({ sourceKey: root.source.sourceKey, nativeId: root.nativeSnapshot.id, source: root.source,
        role: root.nativeSnapshot.role, hallId: root.nativeSnapshot.hall_id, employmentStatus: root.nativeSnapshot.employment_status }) };
    },
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

/** Narrow proof layer for the human-approved exact21. This is not a native SKU,
 * scheme or barcode identity grant and cannot replace the actual source authorizer. */
export async function openApprovedBarcodeMainDemotions({mappingFile,trustedMappingSha256,humanApprovalFile,trustedHumanApprovalSha256,binding}) {
  must(typeof mappingFile==='string'&&isAbsolute(mappingFile)&&typeof humanApprovalFile==='string'&&isAbsolute(humanApprovalFile),'NATIVE_BARCODE_DEMOTION_PATH');
  const mapping=await load(mappingFile,trustedMappingSha256,4194304),approval=await load(humanApprovalFile,trustedHumanApprovalSha256,4194304),m=mapping.value,a=approval.value;
  must(m.schemaVersion===1&&m.selectionBinding?.selection?.sha256===binding.selectionSha256&&m.rows?.length===21&&m.groups?.length===15
    &&a.version==='B06_SOURCE_DECISIONS_20261022_V1'&&a.selectionSha256===binding.selectionSha256&&a.A?.status==='APPROVED_EXACT_21_ROWS_15_GROUPS'
    &&a.source?.kind==='direct_human_async_question_reply','NATIVE_BARCODE_DEMOTION_APPROVAL');
  const groups=new Map(),rows=new Map();
  for(const g of m.groups){const k=g.keptMain;
    must(typeof g.canonicalSkuSourceKey==='string'&&!groups.has(g.canonicalSkuSourceKey)&&k?.rawKind==='主码'&&k.proposedKind==='MAIN'
      &&k.canonicalSkuSourceKey===g.canonicalSkuSourceKey&&k.rawSkuSourceKey===g.canonicalSkuSourceKey&&typeof k.sourceKey==='string'&&typeof k.rawBarcode==='string','NATIVE_BARCODE_DEMOTION_GROUP');groups.set(g.canonicalSkuSourceKey,g);
  }
  for(const r of m.rows){const g=groups.get(r.canonicalSkuSourceKey),alias=r.approvedCanonicalAlias,o=r.originalOccurrence;
    must(g&&!rows.has(r.sourceKey)&&r.rawKind==='主码'&&r.proposedKind==='CONFIRMED_OLD'&&r.proposedKindDisplay==='已确认旧码'
      &&r.rawBarcode===r.proposedOldBarcode&&r.rawState===r.proposedState&&r.rawSkuSourceKey!==r.canonicalSkuSourceKey
      &&alias?.oldSourceSkuId===r.rawSkuSourceKey&&alias.canonicalSourceSkuId===r.canonicalSkuSourceKey&&hash(alias.mappingFileSha256)
      &&r.keptMain?.sourceKey===g.keptMain.sourceKey&&r.keptMain.rawBarcode===g.keptMain.rawBarcode
      &&g.proposedOldSourceKeys.includes(r.sourceKey)&&g.proposedOldBarcodes.includes(r.rawBarcode)
      &&o&&hash(o.sourceFileSha256)&&hash(o.snapshotRawLineSha256ExcludingLf)&&typeof o.file==='string'&&typeof o.sheet==='string'
      &&Number.isSafeInteger(o.row)&&o.row>0,'NATIVE_BARCODE_DEMOTION_ROW');rows.set(r.sourceKey,r);
  }
  must([...groups.values()].every(g=>g.proposedOldSourceKeys.length>0&&g.proposedOldSourceKeys.every(k=>rows.get(k)?.canonicalSkuSourceKey===g.canonicalSkuSourceKey)),'NATIVE_BARCODE_DEMOTION_GROUP');
  let closed=false;const active=()=>must(!closed,'NATIVE_BARCODE_DEMOTION_CLOSED');
  async function verify(){active();await load(mappingFile,trustedMappingSha256,4194304);await load(humanApprovalFile,trustedHumanApprovalSha256,4194304);active();}
  function expected(source,sku){const r=rows.get(source.sourceKey),o=r?.originalOccurrence;
    must(r&&source.batchId===binding.batchId&&source.entityType==='BARCODE'&&source.fileRef===o.file&&source.sheet===o.sheet&&source.rowNo===String(o.row)
      &&source.sourceFileSha256===o.sourceFileSha256&&source.rowSha256===o.snapshotRawLineSha256ExcludingLf&&source.rawFields['条码']===r.rawBarcode
      &&source.rawFields['条码性质']===r.rawKind&&source.rawFields['状态']===r.rawState&&source.rawFields['SKU来源编号']===r.rawSkuSourceKey
      &&sku.oldSourceSkuKey===r.rawSkuSourceKey&&sku.canonicalSourceKey===r.canonicalSkuSourceKey,'NATIVE_BARCODE_DEMOTION_EXACT_SOURCE');
    return{version:NATIVE_BARCODE_MAIN_DEMOTION_VERSION,mappingSha256:trustedMappingSha256,approvalSha256:trustedHumanApprovalSha256,entrySha256:requestHash(r),sourceKey:r.sourceKey,
      originalSourceRowSha256:o.snapshotRawLineSha256ExcludingLf,oldSourceSkuKey:r.rawSkuSourceKey,canonicalSourceSkuKey:r.canonicalSkuSourceKey,barcode:r.rawBarcode,
      keptMainSourceKey:r.keptMain.sourceKey,keptMainBarcode:r.keptMain.rawBarcode};
  }
  return{report:{kind:'EXACT21_MAIN_DEMOTION_PROOF_LAYER',rows:21,groups:15,importReady:false,noSql:true},verify,
    async proofFor(source,sku){await verify();return expected(source,sku);},
    async authorizeProof(row){await verify();validatePreparedNativeBarcode(row);must(row.fixedSourceNamespace===binding.fixedSourceNamespace&&row.selection.selectionSha256===binding.selectionSha256
      &&requestHash(row.mainDemotion)===requestHash(expected(row.source,row.sku)),'NATIVE_BARCODE_DEMOTION_PROOF_CHANGED');await verify();},
    async close(){closed=true;rows.clear();groups.clear();}};
}
