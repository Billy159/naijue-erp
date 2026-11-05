/** Explicit source/material tests; no driver/client/spawn/target. Not default CI registered. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MATERIAL, ADDENDUM, readPlannedMaterial, expandPlannedContract, readClosureAddendum, expandSuccessorContract } from './contract.mjs';
import { ORIGINAL, FINAL_PROJECTION, OBSERVATION_PROJECTION, renderCanonicalObservation, inspectCanonicalObservation } from './canonical-extractor.mjs';
import { NATIVE_RUNTIME26_HISTORY_DRAFT_LINESET_METADATA_PROBE as probe } from '../../../../adapters/postgres/src/native-import-accounting-capability.ts';

const materialText = readFileSync(new URL('../../../../../development-results-20261031/current-runtime-feasibility-independent-review/' + MATERIAL.filename, import.meta.url), 'utf8');
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
const originalModule = readFileSync(new URL('../../../../' + ORIGINAL.path, import.meta.url), 'utf8');
const material = readPlannedMaterial(materialText);
const addendumText = readFileSync(new URL('../../../../../development-results-20261031/current-runtime-feasibility-independent-review/' + ADDENDUM.filename, import.meta.url), 'utf8');
const addendum = readClosureAddendum(addendumText);

test('exact passive source material expands 65 groups into 316 unique traceable cells', () => {
  const result = expandPlannedContract(material);
  assert.equal(sha(materialText), MATERIAL.sha256);
  assert.equal(material.aclRequirements.length, 65);
  assert.equal(result.requiredCells.length, 316);
  assert.equal(new Set(result.requiredCells.map(c => JSON.stringify([c.schema, c.relation, c.objectKind, c.column, c.privilege]))).size, 316);
  assert.ok(result.requiredCells.every(c => c.source.length > 0 && c.status === 'SOURCE_REQUIREMENT_NOT_APPROVED_GRANT'));
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.requiredCells) && Object.isFrozen(result.requiredCells[0].source));
});

test('material byte mutation, copied shape and coercing input fail closed', () => {
  assert.throws(() => readPlannedMaterial(materialText + '\n'), /EXACT_INDEPENDENT_SOURCE_MATERIAL_BYTES/);
  assert.throws(() => readPlannedMaterial(materialText.replace('PLANNED_NOT_EXECUTED', 'ACCEPTED_METADATA')), /EXACT_INDEPENDENT_SOURCE_MATERIAL_BYTES/);
  assert.throws(() => expandPlannedContract(JSON.parse(materialText)), /ORIGINAL_HASH_CHECKED_MATERIAL/);
  let calls = 0;
  assert.throws(() => readPlannedMaterial({ toString() { calls++; return materialText; } }), /PRIMITIVE_BOUNDED_MATERIAL/);
  assert.equal(calls, 0);
});

test('all 18 lock choices remain unresolved genuine UPDATE exposures; no grant or execution authority', () => {
  const result = expandPlannedContract(material);
  assert.equal(result.unresolvedLockCells.length, 18);
  assert.ok(result.unresolvedLockCells.every(c => c.privilege === 'UPDATE' && c.status === 'UNRESOLVED_REAL_WRITE_AUTHORITY_NOT_ACCEPTED'));
  assert.equal(result.authority, 'NONE');
  assert.equal(result.executable, false);
  assert.equal(result.completeGrantMatrix, false);
  assert.equal(result.status, 'REFUSE_REFERENCE_EXECUTION_INCOMPLETE_DESIGN');
  assert.equal(result.noTargetAssigned, true);
  assert.equal(result.openDecisions.length, 5);
  assert.deepEqual(result.successorOrder.stages.slice(0, 4), [
    'LIMITED_PRE_CUTOFF_OWNER_REFERENCE_SETUP_WITHOUT_RUNTIME_LOGIN',
    'ORIGINAL_SOURCE_AUTHORIZED_COMPLETE_LEGACY_CUTOFF_PUBLICATION',
    'FINAL_REVIEWED_RUNTIME_ACL_AND_GENUINE_ISSUER',
    'ORIGINAL_SUPPLIER_CREATE_WITH_SOURCE_CONFIRMED_CURRENT_ACTOR',
  ]);
});

test('current successor hard floor remains 25 system SELECT, 4 ledger cells and 3 table DELETE', () => {
  const hard = expandPlannedContract(material).requiredCells.filter(c => c.requirementId.startsWith('H-'));
  assert.equal(hard.length, 32);
  assert.equal(hard.filter(c => ['xmin', 'cmin'].includes(c.column)).length, 25);
  assert.equal(hard.filter(c => c.relation === 'inventory_ledger').length, 4);
  assert.deepEqual(hard.filter(c => c.objectKind === 'TABLE').map(c => [c.relation, c.privilege]), [
    ['payment_account_hall', 'DELETE'], ['product_image', 'DELETE'], ['sales_settlement', 'DELETE'],
  ]);
});

test('source requirements never become blanket table reads, writes or extra sequence grants', () => {
  const result = expandPlannedContract(material);
  assert.ok(result.requiredCells.every(c => c.objectKind !== 'TABLE' || c.privilege === 'DELETE'));
  assert.deepEqual(result.requiredCells.filter(c => c.objectKind === 'SEQUENCE').map(c => [c.relation, c.privilege]), [
    ['supplier_code_sequence', 'SELECT'], ['supplier_code_sequence', 'UPDATE'],
  ]);
  assert.equal(result.negativePolicy.credentials.includes('No SELECT password_hash'), true);
  assert.deepEqual(result.functionPolicy.additionalRuntimeExecuteGrants, []);
});

test('original source module and evaluated current 137 HISTORY probe are exactly pinned', () => {
  assert.equal(sha(originalModule), ORIGINAL.sourceSha256);
  assert.equal(sha(probe), ORIGINAL.probeSha256);
  assert.equal(Buffer.byteLength(probe), ORIGINAL.probeBytes);
  assert.equal(probe.split(FINAL_PROJECTION).length, 2);
});

test('extractor adds only one final output; every original CTE/predicate/output byte survives', () => {
  const result = renderCanonicalObservation(probe);
  assert.equal(result.sql.replace(OBSERVATION_PROJECTION, FINAL_PROJECTION), probe);
  const before = probe.indexOf(FINAL_PROJECTION);
  assert.equal(result.sql.slice(0, before), probe.slice(0, before));
  assert.equal(result.sql.split(OBSERVATION_PROJECTION).length, 2);
  assert.equal(result.sqlSha256, sha(result.sql));
  assert.equal(result.authority, 'NONE');
  assert.equal(result.status, 'OBSERVATION_QUERY_ONLY_NOT_METADATA_REVIEW');
});

test('changed, truncated, duplicated-boundary and coerced original probes are refused', () => {
  for (const text of [probe.replace('137', '136'), probe.slice(1), probe + FINAL_PROJECTION, probe + '\n'])
    assert.throws(() => renderCanonicalObservation(text), /EXACT_ORIGINAL_HISTORY_PROBE_BYTES/);
  let called = false;
  assert.throws(() => renderCanonicalObservation({ toString() { called = true; return probe; } }), /PRIMITIVE_ORIGINAL_PROBE/);
  assert.equal(called, false);
});

test('digest parity uses exact server text UTF8 bytes, including whitespace and Unicode', () => {
  const text = '{"文字": "合成", "amount": "0.00"}';
  const result = inspectCanonicalObservation({ observed_canonical_text: text, catalog_sha256: sha(text) });
  assert.equal(result.utf8Bytes, Buffer.byteLength(text));
  assert.equal(result.sha256, sha(text));
  assert.equal(result.status, 'OBSERVATION_ONLY_DIGEST_PARITY_NOT_SOURCE_REVIEW');
  assert.equal(result.doesNotEstablishIndependentOrigin, true);
  assert.equal(result.authority, 'NONE');
});

test('JS JSON normalization cannot substitute for PostgreSQL canonical text', () => {
  const text = '{"z": 1, "a": 2}';
  assert.notEqual(sha(JSON.stringify(JSON.parse(text))), sha(text));
  assert.throws(() => inspectCanonicalObservation({ observed_canonical_text: text, catalog_sha256: sha(JSON.stringify(JSON.parse(text))) }), /DIGEST_CANONICAL_UTF8_PARITY/);
  assert.throws(() => inspectCanonicalObservation({ observed_canonical_text: JSON.parse(text), catalog_sha256: sha(text) }), /BOUNDED_UTF8_CANONICAL/);
});

test('observation getters, hidden extras, wrong digest and malformed UTF8 input are refused without coercion', () => {
  const text = '{"ok": true}', good = { observed_canonical_text: text, catalog_sha256: sha(text) };
  let reads = 0;
  assert.throws(() => inspectCanonicalObservation({ get observed_canonical_text() { reads++; return text; }, catalog_sha256: sha(text) }), /OWN_DATA_CANONICAL/);
  assert.equal(reads, 0);
  assert.throws(() => inspectCanonicalObservation(Object.defineProperty({ ...good }, 'expected', { value: true })), /CLOSED_CANONICAL/);
  assert.throws(() => inspectCanonicalObservation({ ...good, catalog_sha256: '0'.repeat(64) }), /DIGEST_CANONICAL_UTF8_PARITY/);
  assert.throws(() => inspectCanonicalObservation({ ...good, observed_canonical_text: '\ud800' }), /BOUNDED_UTF8_CANONICAL/);
});

test('digest parity cannot tell actual from independent reference origin and grants neither approval', () => {
  const text = '{"identical_observation": true}';
  const actual = inspectCanonicalObservation({ observed_canonical_text: text, catalog_sha256: sha(text) });
  const reference = inspectCanonicalObservation({ observed_canonical_text: text, catalog_sha256: sha(text) });
  assert.deepEqual(actual, reference);
  assert.equal(actual.doesNotEstablishIndependentOrigin, true);
  assert.equal(actual.authority, 'NONE');
});

test('successor requires both exact immutable materials; mutation or copied addendum cannot confer authority', () => {
  assert.equal(sha(addendumText), ADDENDUM.sha256);
  assert.equal(addendum.previousMaterialSha256Unchanged, MATERIAL.sha256);
  assert.throws(() => readClosureAddendum(addendumText + '\n'), /EXACT_SOURCE_CLOSURE_ADDENDUM_BYTES/);
  assert.throws(() => readClosureAddendum(addendumText.replace('display_order', 'size_group_id')), /EXACT_SOURCE_CLOSURE_ADDENDUM_BYTES/);
  assert.throws(() => expandSuccessorContract(material, JSON.parse(addendumText)), /ORIGINAL_HASH_CHECKED_CLOSURE_ADDENDUM/);
  let called = false;
  assert.throws(() => readClosureAddendum({ toString() { called = true; return addendumText; } }), /PRIMITIVE_BOUNDED_ADDENDUM/);
  assert.equal(called, false);
});

test('successor adds exact supplier deferred-receipt operation SELECT:317 source requirements', () => {
  const result = expandSuccessorContract(material, addendum);
  assert.equal(expandPlannedContract(material).requiredCells.length, 316);
  assert.equal(result.requiredCells.length, 317);
  const cell = result.requiredCells.find(c => c.requirementId === 'SUCCESSOR-SUPPLIER-RECEIPT-LEDGER-OPERATION');
  assert.deepEqual([cell.schema, cell.relation, cell.column, cell.privilege], ['naijue_erp', 'inventory_ledger', 'operation_id', 'SELECT']);
  assert.deepEqual(cell.source, [{ path: 'adapters/postgres/migrations/0006_party_maintenance.sql', lines: [160, 178] }]);
  assert.equal(cell.status, 'SOURCE_REQUIREMENT_NOT_APPROVED_GRANT');
});

test('successor chooses17 id and member.display_order, preserving each genuine write exposure', () => {
  const result = expandSuccessorContract(material, addendum);
  assert.deepEqual(result.counts, { historicalRequired: 316, newSourceRequired: 1, knownRequired: 317, selectedUpdates: 18, knownUnique: 335 });
  assert.equal(result.selectedLockCells.filter(c => c.column === 'id').length, 17);
  assert.equal(result.selectedLockCells.find(c => c.relation === 'size_group_member').column, 'display_order');
  assert.ok(result.selectedLockCells.every(c => c.privilege === 'UPDATE' && c.zeroWriteAuthorityClaim === false && c.grantExecuted === false && c.exposure.length > 0 && c.guardSource.length > 0));
  assert.ok(new Set(result.selectedLockCells.map(c => c.exposureClass)).size > 1);
  assert.equal(result.completeGrantMatrix, false);
  assert.equal(result.executable, false);
  assert.equal(result.authority, 'NONE');
});

test('successor real identity seam is a non-session plan and requests no credential/session ACL', () => {
  const actor = expandSuccessorContract(material, addendum).trustedActorPlan;
  assert.equal(actor.factory, 'sourceConfirmedReadIdentityOn');
  assert.deepEqual(actor.additionalSecretOrSessionAcl, []);
  assert.ok(actor.flow.includes('actual returned facts'));
  assert.ok(actor.notClaimed.includes('HTTP/session/credential authentication'));
  assert.ok(actor.notClaimed.includes('Cross-helper/Party-transaction atomic identity guarantee'));
});

test('successor retains exact seven-field source2026 scheme literal as not installed/not CORE', () => {
  const scheme = expandSuccessorContract(material, addendum).schemeReferencePlan;
  assert.equal(scheme.state, 'PUBLIC_SOURCE_LITERAL_LOCATED_NOT_INSTALLED_NOT_CORE_RECEIPT');
  assert.equal(Object.keys(scheme.nativeRow).length, 7);
  assert.equal(scheme.nativeRow.id, '0e70e45e-1a51-4d44-afe8-0002cf3fb7ef');
  assert.equal(scheme.nativeRow.name, '2026年条码方案');
  assert.equal(scheme.nativeRow.code_length, 15);
  assert.equal(scheme.nativeRow.status, 'CURRENT');
  assert.ok(scheme.scope.includes('Do NOT copy adjacent v19 proposal/approval/writeReply hashes'));
});

test('successor publishes authentic cutoff before runtime LOGIN/Supplier plan and leaves helper closure open', () => {
  const result = expandSuccessorContract(material, addendum);
  assert.equal(result.successorOrder.length, 6);
  assert.ok(result.successorOrder[0].includes('no runtime LOGIN'));
  assert.ok(result.successorOrder[1].includes('cutoff'));
  assert.ok(result.successorOrder[2].includes('genuine original issuer'));
  assert.ok(result.successorOrder[3].includes('Supplier CREATE'));
  assert.equal(result.selectedHelperReadClosure.state, 'SOURCE_BRANCH_REVIEW_PARTIAL_NOT_COMPLETE_CALL_GRAPH');
  assert.ok(result.selectedHelperReadClosure.remaining.length > 0);
  assert.equal(result.noTargetAssigned, true);
  assert.equal(result.rolesCreated, false);
  assert.equal(result.status, 'REFUSE_REFERENCE_EXECUTION_PARTIAL_SELECTED_SOURCE_DESIGN');
});
