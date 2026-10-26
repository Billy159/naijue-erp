/** Exact reviewed historical-only customer source, with no database access.
 * The original English JSON and candidate stay immutable. The derived selection
 * carries C's separate outside approval; it is not a MAIN or runtime grant. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { stableImportId } from '../../packages/application/src/inventory-cutoff-import.ts';
import { historySettlementRequestHash as evidenceHash } from '../../packages/application/src/import-v3-history-settlement.ts';

const must = (ok, code) => { if (!ok) throw Object.assign(Error(code), { code }); };
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const text = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 65536 && !v.includes('\0');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => ['dev', 'ino', 'size', 'mode', 'mtimeMs', 'ctimeMs'].every(k => a[k] === b[k]);
const exact = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).length === keys.length
  && keys.every(k => { const d = Object.getOwnPropertyDescriptor(v, k); return d?.enumerable && Object.hasOwn(d, 'value'); });
const rawKeys = ['sourceKey', 'originalCode', 'originalName', 'enabled', 'historicalOnly', 'visibleInCurrentCustomerList', 'originalPartyIdentity', 'sourceDocumentNumber'];
const encoding = 'SHA256_JSON_STRINGIFY_ORIGINAL_ARRAY_ITEM_UTF8_V1';
const sourcePath = 'dictionaries/historical-customers.json';

async function load(path, pin, limit, io={}) {
  const logicalPath=path,physical=io.resolveFile?await io.resolveFile({path,sha256:pin}):{path};path=physical.path;
  must(typeof path === 'string' && isAbsolute(path) && hash(pin), 'HISTORICAL_CUSTOMER_OUTSIDE_PIN');
  const before = await lstat(path);
  must(before.isFile() && !before.isSymbolicLink() && (physical.bytes===undefined||before.size===physical.bytes) && before.size > 0 && before.size <= limit, 'HISTORICAL_CUSTOMER_FILE');
  const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    must(same(before, await fd.stat()), 'HISTORICAL_CUSTOMER_FILE_CHANGED');
    const bytes = await fd.readFile();
    must(bytes.length === before.size && same(before, await fd.stat()) && same(before, await lstat(path)) && digest(bytes) === pin, 'HISTORICAL_CUSTOMER_FILE_CHANGED');
    return { path:logicalPath, pin, limit, stat: before, value: JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)) };
  } finally { await fd.close(); }
}

export async function openHistoricalCustomerSource(options,io={}) {
  must(exact(options, ['sourceFile', 'candidateFile', 'reviewFile', 'contractFile', 'trustedReviewSha256', 'binding']), 'HISTORICAL_CUSTOMER_CONFIG');
  const o = { ...options }; evidenceHash(o.binding); const b = structuredClone(o.binding);
  must(exact(b, ['batchId', 'fixedSourceNamespace', 'selectionSha256']) && uuid(b.batchId) && text(b.fixedSourceNamespace) && hash(b.selectionSha256), 'HISTORICAL_CUSTOMER_BINDING');
  const review = await load(o.reviewFile, o.trustedReviewSha256, 262144,io), a = review.value;
  const bound = value => ['batchId', 'fixedSourceNamespace', 'selectionSha256'].every(k => value?.[k] === b[k]);
  must(a.version === 'C_HISTORICAL_CUSTOMER_EXACT2_REVIEW_V1' && a.decision === 'ACCEPT_QB50_EXACT2_SOURCE_NATIVE_MAPPING_ONLY'
    && a.realExecutionAuthorizedByThisPinAlone === false && a.review?.result === 'PASS' && hash(a.review.sha256) && bound(a.binding)
    && exact(a.candidate, ['path', 'sha256', 'bytes']) && a.candidate.path === o.candidateFile && hash(a.candidate.sha256)
    && Number.isSafeInteger(a.candidate.bytes) && a.candidate.bytes > 0 && a.candidate.bytes <= 262144
    && hash(a.sourceFileSha256) && hash(a.contractSha256) && Array.isArray(a.identities) && a.identities.length === 2, 'HISTORICAL_CUSTOMER_REVIEW');
  const candidate = await load(o.candidateFile, a.candidate.sha256, 262144,io);
  const source = await load(o.sourceFile, a.sourceFileSha256, 65536,io);
  const contract = await load(o.contractFile, a.contractSha256, 262144,io);
  const c = candidate.value;
  must(candidate.stat.size === a.candidate.bytes && c.version === 'NATIVE_HISTORICAL_CUSTOMER_EXACT2_CANDIDATE_V1'
    && bound(c) && c.contractSha256 === a.contractSha256 && c.sourceFileSha256 === a.sourceFileSha256 && c.sourceFile === o.sourceFile
    && c.currentOrdinaryCustomersRetained === 261 && c.newNativeUUIDsAllocatedOnce === 2 && c.ordinaryCSVRewritten === false && c.noNewSchema === true && c.sql === false
    && Array.isArray(c.rows) && c.rows.length === 2 && Array.isArray(source.value) && source.value.length === 2, 'HISTORICAL_CUSTOMER_CANDIDATE');
  must(contract.value.taskId === 'B06-HISTORICAL-CUSTOMER-EXACT2-EXISTING-FIELDS-PROPOSAL'
    && contract.value.controllerAdoption?.status === 'EXISTING_FIELDS_IMPLEMENTATION_CONTRACT_ACCEPTED_PENDING_EXACT_SOURCE_PIN_AND_SCOPED_QA'
    && contract.value.controllerAdoption.executionGrant === false, 'HISTORICAL_CUSTOMER_CONTRACT');
  const reviewed = new Map(), natives = new Set(), sourceIds = new Set(), codes = new Set();
  for (const identity of a.identities) {
    must(exact(identity, ['sourceKey', 'sourceRowId', 'sourceRowSha256', 'rowNo', 'nativeCustomerId', 'historicalOnly', 'currentListExcluded'])
      && text(identity.sourceKey) && uuid(identity.sourceRowId) && hash(identity.sourceRowSha256) && ['1', '2'].includes(identity.rowNo)
      && uuid(identity.nativeCustomerId) && identity.historicalOnly === true && identity.currentListExcluded === true && !reviewed.has(identity.sourceKey)
      && !natives.has(identity.nativeCustomerId) && !sourceIds.has(identity.sourceRowId), 'HISTORICAL_CUSTOMER_IDENTITY');
    reviewed.set(identity.sourceKey, identity); natives.add(identity.nativeCustomerId); sourceIds.add(identity.sourceRowId);
  }
  const rows = [], rowIndex = new Map();
  for (let i = 0; i < 2; i++) {
    const raw = source.value[i], row = c.rows[i], identity = reviewed.get(raw?.sourceKey);
    must(exact(raw, rawKeys) && text(raw.originalCode) && text(raw.originalName) && uuid(raw.originalPartyIdentity)
      && raw.sourceKey === `HIST-CUSTOMER:${raw.originalPartyIdentity}` && text(raw.sourceDocumentNumber)
      && raw.enabled === false && raw.historicalOnly === true && raw.visibleInCurrentCustomerList === false
      && identity && identity.rowNo === String(i + 1) && !codes.has(raw.originalCode) && !rowIndex.has(raw.sourceKey), 'HISTORICAL_CUSTOMER_ORIGINAL');
    const expectedSource = { id: stableImportId('source-row', b.fixedSourceNamespace, 'CUSTOMER', raw.sourceKey), batchId: b.batchId,
      entityType: 'CUSTOMER', sourceKey: raw.sourceKey, fileRef: sourcePath, sheet: 'JSON_ARRAY_ITEMS', rowNo: String(i + 1),
      sourceFileSha256: a.sourceFileSha256, rowSha256: digest(Buffer.from(JSON.stringify(raw))), rawFields: raw, normalizedFields: raw,
      fieldProvenance: { schema_version: 1, fields: Object.fromEntries(Object.entries(raw).map(([field, value]) => [field,
        { origin: 'ORIGINAL', reason: 'EXACT_ORIGINAL_JSON_ARRAY_ITEM_VALUE', raw: value }])), source_row_encoding: encoding } };
    must(exact(row, ['source', 'selection', 'nativeId', 'nativeSnapshot', 'historyHeaderBinding', 'currentListExcluded'])
      && expectedSource.id === identity.sourceRowId && expectedSource.rowSha256 === identity.sourceRowSha256
      && evidenceHash(row.source) === evidenceHash(expectedSource) && row.nativeId === identity.nativeCustomerId
      && row.nativeId !== raw.originalPartyIdentity && row.nativeId !== expectedSource.id && row.currentListExcluded === true, 'HISTORICAL_CUSTOMER_EXACT_SOURCE');
    must(exact(row.selection, ['entity', 'source', 'path', 'baseManifestSha256', 'selectionSha256', 'sourceFileSha256'])
      && row.selection.entity === 'CUSTOMER' && row.selection.source === 'HISTORICAL_CUSTOMER_SUPPLEMENT_V1' && row.selection.path === sourcePath
      && hash(row.selection.baseManifestSha256) && row.selection.selectionSha256 === b.selectionSha256 && row.selection.sourceFileSha256 === a.sourceFileSha256
      && (i === 0 || row.selection.baseManifestSha256 === rows[0].selection.baseManifestSha256), 'HISTORICAL_CUSTOMER_SELECTION');
    const native = { id: row.nativeId, code: raw.originalCode, name: raw.originalName, enabled: false, version: 1, created_at: null, updated_at: null };
    const header = { sourceKey: raw.sourceKey, originalPartyIdentity: raw.originalPartyIdentity, sourceDocumentNumber: raw.sourceDocumentNumber, nativeCustomerId: row.nativeId };
    must(evidenceHash(row.nativeSnapshot) === evidenceHash(native) && evidenceHash(row.historyHeaderBinding) === evidenceHash(header), 'HISTORICAL_CUSTOMER_NATIVE_MAPPING');
    // Only this new derived selection gets the outside approval pin; original
    // candidate bytes and its original six-field selection are never rewritten.
    const derived = structuredClone({ ...row, selection: { ...row.selection, approvalSha256: o.trustedReviewSha256 } });
    rows.push(derived); rowIndex.set(raw.sourceKey, derived); codes.add(raw.originalCode);
  }
  let closed = false; const active = () => must(!closed, 'HISTORICAL_CUSTOMER_CLOSED');
  const files = [review, candidate, source, contract];
  async function verify() {
    active(); for (const file of files) { const current = await load(file.path, file.pin, file.limit,io); must(same(file.stat, current.stat), 'HISTORICAL_CUSTOMER_FILE_CHANGED'); } active();
  }
  await verify();
  return {
    report: Object.freeze({ kind: 'EXACT2_HISTORICAL_CUSTOMER_SOURCE_ONLY_V1', rows: 2, originalEnglishFields: 8,
      derivedApprovalSha256: o.trustedReviewSha256, currentListExclusionImplemented: false, nativeHeaderBindingsVerified: false, importReady: false, noSql: true }),
    verify,
    async *rows() { await verify(); for (const row of rows) { active(); yield structuredClone(row); } await verify(); },
    async authorizeRow(value) { evidenceHash(value); value = structuredClone(value); await verify(); const row = rowIndex.get(value?.source?.sourceKey);
      must(row && evidenceHash(value) === evidenceHash(row), 'HISTORICAL_CUSTOMER_DERIVED_ROW_CHANGED'); },
    async referenceCandidateFor(identity) {
      evidenceHash(identity); must(exact(identity, ['sourceKey', 'originalPartyIdentity', 'sourceDocumentNumber']), 'HISTORICAL_CUSTOMER_HEADER_IDENTITY'); identity = structuredClone(identity);
      await verify(); const row = rowIndex.get(identity.sourceKey);
      must(row && ['sourceKey', 'originalPartyIdentity', 'sourceDocumentNumber'].every(k => row.historyHeaderBinding[k] === identity[k]), 'HISTORICAL_CUSTOMER_HEADER_IDENTITY');
      return structuredClone(row);
    },
    close() { closed = true; rows.length = 0; rowIndex.clear(); reviewed.clear(); natives.clear(); sourceIds.clear(); codes.clear(); }
  };
}
