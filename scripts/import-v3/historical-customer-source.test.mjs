import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { stableImportId } from '../../packages/application/src/inventory-cutoff-import.ts';
import { prepareNativePartyImportChunk } from '../../packages/application/src/native-party-import.ts';
import { openHistoricalCustomerSource } from './historical-customer-source.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = b => createHash('sha256').update(b).digest('hex'), pin = 'a'.repeat(64);

async function fixture(t) {
  const dir = await mkdtemp(join(await realpath(tmpdir()), 'synthetic-historical-customer-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const binding = { batchId: id(1), fixedSourceNamespace: 'synthetic:exact2:no-native-grant', selectionSha256: pin };
  const paths = { sourceFile: join(dir, 'source.json'), candidateFile: join(dir, 'candidate.json'), reviewFile: join(dir, 'review.json'), contractFile: join(dir, 'contract.json') };
  const raw = [2, 3].map(n => ({ sourceKey: `HIST-CUSTOMER:${id(n)}`, originalCode: `SYN-${n}`, originalName: `Synthetic historical ${n}`, enabled: false,
    historicalOnly: true, visibleInCurrentCustomerList: false, originalPartyIdentity: id(n), sourceDocumentNumber: `SYN-INVOICE-${n}` }));
  const contract = { taskId: 'B06-HISTORICAL-CUSTOMER-EXACT2-EXISTING-FIELDS-PROPOSAL', controllerAdoption: {
    status: 'EXISTING_FIELDS_IMPLEMENTATION_CONTRACT_ACCEPTED_PENDING_EXACT_SOURCE_PIN_AND_SCOPED_QA', executionGrant: false } };
  const contractBytes = Buffer.from(JSON.stringify(contract)); await writeFile(paths.contractFile, contractBytes, { mode: 0o600 });
  const sourceBytes = Buffer.from(JSON.stringify(raw)), sourcePin = hash(sourceBytes);
  const rows = raw.map((r, i) => ({ source: {
    id: stableImportId('source-row', binding.fixedSourceNamespace, 'CUSTOMER', r.sourceKey), batchId: binding.batchId, entityType: 'CUSTOMER', sourceKey: r.sourceKey,
    fileRef: 'dictionaries/historical-customers.json', sheet: 'JSON_ARRAY_ITEMS', rowNo: String(i + 1), sourceFileSha256: sourcePin, rowSha256: hash(JSON.stringify(r)),
    rawFields: r, normalizedFields: r, fieldProvenance: { schema_version: 1, fields: Object.fromEntries(Object.entries(r).map(([k, v]) => [k,
      { origin: 'ORIGINAL', reason: 'EXACT_ORIGINAL_JSON_ARRAY_ITEM_VALUE', raw: v }])), source_row_encoding: 'SHA256_JSON_STRINGIFY_ORIGINAL_ARRAY_ITEM_UTF8_V1' } },
    selection: { entity: 'CUSTOMER', source: 'HISTORICAL_CUSTOMER_SUPPLEMENT_V1', path: 'dictionaries/historical-customers.json', baseManifestSha256: pin, selectionSha256: binding.selectionSha256, sourceFileSha256: sourcePin },
    nativeId: id(100 + i), nativeSnapshot: { id: id(100 + i), code: r.originalCode, name: r.originalName, enabled: false, version: 1, created_at: null, updated_at: null },
    historyHeaderBinding: { sourceKey: r.sourceKey, originalPartyIdentity: r.originalPartyIdentity, sourceDocumentNumber: r.sourceDocumentNumber, nativeCustomerId: id(100 + i) }, currentListExcluded: true }));
  const candidate = { version: 'NATIVE_HISTORICAL_CUSTOMER_EXACT2_CANDIDATE_V1', ...binding, contractSha256: hash(contractBytes), sourceFileSha256: sourcePin,
    sourceFile: paths.sourceFile, rows, currentOrdinaryCustomersRetained: 261, newNativeUUIDsAllocatedOnce: 2, ordinaryCSVRewritten: false, noNewSchema: true, sql: false };
  const identities = rows.map(r => ({ sourceKey: r.source.sourceKey, sourceRowId: r.source.id, sourceRowSha256: r.source.rowSha256, rowNo: r.source.rowNo, nativeCustomerId: r.nativeId, historicalOnly: true, currentListExcluded: true }));
  const review = { version: 'C_HISTORICAL_CUSTOMER_EXACT2_REVIEW_V1', decision: 'ACCEPT_QB50_EXACT2_SOURCE_NATIVE_MAPPING_ONLY', binding, sourceFileSha256: sourcePin,
    contractSha256: hash(contractBytes), identities, review: { result: 'PASS', sha256: pin }, realExecutionAuthorizedByThisPinAlone: false, candidate: {} };
  async function save() {
    const sb = Buffer.from(JSON.stringify(raw)); await writeFile(paths.sourceFile, sb, { mode: 0o600 });
    candidate.sourceFileSha256 = review.sourceFileSha256 = hash(sb);
    for (let i = 0; i < rows.length; i++) { rows[i].source.sourceFileSha256 = rows[i].selection.sourceFileSha256 = hash(sb);
      rows[i].source.rowSha256 = identities[i].sourceRowSha256 = hash(JSON.stringify(raw[i])); }
    const cb = Buffer.from(JSON.stringify(candidate)); await writeFile(paths.candidateFile, cb, { mode: 0o600 });
    review.candidate = { path: paths.candidateFile, sha256: hash(cb), bytes: cb.length };
    const rb = Buffer.from(JSON.stringify(review)); await writeFile(paths.reviewFile, rb, { mode: 0o600 });
    return { ...paths, binding, trustedReviewSha256: hash(rb) };
  }
  return { raw, rows, candidate, review, paths, binding, save, options: await save() };
}

test('exact2 historical source preserves English fields and derives independent approval without granting native stage', async t => {
  const f = await fixture(t), original = await readFile(f.paths.candidateFile), reader = await openHistoricalCustomerSource(f.options); t.after(() => reader.close());
  const rows = []; for await (const row of reader.rows()) { await reader.authorizeRow(row); rows.push(row); }
  assert.equal(rows.length, 2); assert.equal(reader.report.noSql, true); assert.equal(reader.report.importReady, false);
  assert.equal(reader.report.currentListExclusionImplemented, false); assert.equal(reader.report.nativeHeaderBindingsVerified, false);
  assert.deepEqual(rows[0].source.rawFields, f.raw[0]); assert.deepEqual(rows[0].source.normalizedFields, f.raw[0]);
  assert.equal(rows[0].selection.approvalSha256, f.options.trustedReviewSha256); assert.equal(rows[0].nativeSnapshot.created_at, null);
  assert.deepEqual(await readFile(f.paths.candidateFile), original); assert.equal(Object.hasOwn(f.rows[0].selection, 'approvalSha256'), false);
  const identity = { sourceKey: f.raw[0].sourceKey, originalPartyIdentity: f.raw[0].originalPartyIdentity, sourceDocumentNumber: f.raw[0].sourceDocumentNumber };
  assert.deepEqual(await reader.referenceCandidateFor(identity), rows[0]);
  await assert.rejects(reader.referenceCandidateFor({ ...identity, sourceDocumentNumber: 'SOME-OTHER-INVOICE' }), /HEADER_IDENTITY/);
  await assert.rejects(reader.referenceCandidateFor({ ...identity, originalPartyIdentity: id(99) }), /HEADER_IDENTITY/);
  const changed = structuredClone(rows[0]); changed.source.rawFields.originalName = 'renamed'; await assert.rejects(reader.authorizeRow(changed), /DERIVED_ROW_CHANGED/);
  // Generic source-reader fixtures are not the two independently pinned native identities.
  assert.throws(() => prepareNativePartyImportChunk([{ ...rows[0], ...f.binding, bindings: {}, enumMappings: { enabled: { raw: false, native: false, evidenceRef: f.options.trustedReviewSha256 } } }]), /EXACT2_HISTORICAL_CUSTOMER_SELECTION/);
});

test('exact2 historical source rejects re-pinned wrong flags, CSV disguise, extra original keys and native remapping', async t => {
  const f = await fixture(t);
  f.review.realExecutionAuthorizedByThisPinAlone = true; await assert.rejects(openHistoricalCustomerSource(await f.save()), /REVIEW/); f.review.realExecutionAuthorizedByThisPinAlone = false;
  f.raw[0].historicalOnly = false; await assert.rejects(openHistoricalCustomerSource(await f.save()), /ORIGINAL/); f.raw[0].historicalOnly = true;
  f.raw[0].extra = 'not-original'; await assert.rejects(openHistoricalCustomerSource(await f.save()), /ORIGINAL/); delete f.raw[0].extra;
  f.rows[0].selection.source = 'BASE_V2'; await assert.rejects(openHistoricalCustomerSource(await f.save()), /SELECTION/); f.rows[0].selection.source = 'HISTORICAL_CUSTOMER_SUPPLEMENT_V1';
  f.rows[0].nativeId = id(999); await assert.rejects(openHistoricalCustomerSource(await f.save()), /EXACT_SOURCE/); f.rows[0].nativeId = id(100);
  f.rows[0].nativeSnapshot.updated_at = '2026-10-22T00:00:00Z'; await assert.rejects(openHistoricalCustomerSource(await f.save()), /NATIVE_MAPPING/);
});

test('exact2 historical source rejects missing outside pin, getters, changed file and closed lifetime', async t => {
  const f = await fixture(t); await assert.rejects(openHistoricalCustomerSource({ ...f.options, trustedReviewSha256: undefined }), /OUTSIDE_PIN/);
  let calls = 0; const getter = { ...f.options }; Object.defineProperty(getter, 'sourceFile', { enumerable: true, get() { calls++; return f.paths.sourceFile; } });
  await assert.rejects(openHistoricalCustomerSource(getter), /CONFIG/); assert.equal(calls, 0);
  const reader = await openHistoricalCustomerSource(f.options); t.after(() => reader.close());
  const originalPin = f.options.trustedReviewSha256; f.options.trustedReviewSha256 = 'b'.repeat(64);
  const rows = []; for await (const row of reader.rows()) rows.push(row); assert.equal(rows[0].selection.approvalSha256, originalPin);
  const identity = { sourceKey: f.raw[0].sourceKey, originalPartyIdentity: f.raw[0].originalPartyIdentity, sourceDocumentNumber: f.raw[0].sourceDocumentNumber };
  Object.defineProperty(identity, 'sourceKey', { enumerable: true, get() { calls++; return f.raw[0].sourceKey; } });
  await assert.rejects(reader.referenceCandidateFor(identity)); assert.equal(calls, 0);
  await writeFile(f.paths.sourceFile, '[]'); await assert.rejects(reader.verify(), /FILE_CHANGED/);
  reader.close(); await assert.rejects(reader.rows().next(), /CLOSED/);
});
