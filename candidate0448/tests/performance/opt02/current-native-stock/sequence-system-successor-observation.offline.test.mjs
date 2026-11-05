/** Offline protocol/source tests. No PG, SQL execution, target, role or review. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as native from '../../../../adapters/postgres/src/native-import-accounting-capability.ts';
import { renderCanonicalObservation, FINAL_PROJECTION, OBSERVATION_PROJECTION } from './canonical-extractor.mjs';
import { SUCCESSOR_OBSERVATION, renderSequenceSystemCanonicalObservation, inspectSequenceSystemCanonicalObservation } from './sequence-system-successor-observation.mjs';
const hash = s => createHash('sha256').update(s).digest('hex');
const source = readFileSync(new URL('../../../../adapters/postgres/src/native-import-accounting-capability.ts', import.meta.url), 'utf8');
const probe = native.NATIVE_RUNTIME26_HISTORY_DRAFT_SEQUENCE_SYSTEM_METADATA_PROBE;
const input = () => ({ successorSourceText: source, successorProbeText: probe });

test('pinned new application source/probe are explicit, old installation source is not falsely verified', () => {
  assert.equal(hash(source), SUCCESSOR_OBSERVATION.sourceSha256);
  assert.equal(hash(probe), SUCCESSOR_OBSERVATION.probeSha256);
  const output = renderSequenceSystemCanonicalObservation(input());
  assert.equal(output.applicationSourceSha256, SUCCESSOR_OBSERVATION.sourceSha256);
  assert.notEqual(output.applicationSourceSha256, output.installationSourceSha256NotVerifiedHere);
  assert.equal(output.doesNotEstablishInstallationPlanOrModuleBrand, true);
  assert.equal(output.authority, 'NONE'); assert.equal(output.doesNotEstablishIndependentOrigin, true);
});
test('only unique final projection is added and reverse restores full34216 exact bytes', () => {
  const result = renderSequenceSystemCanonicalObservation(input());
  assert.equal(result.sql.replace(OBSERVATION_PROJECTION, FINAL_PROJECTION), probe);
  assert.equal(result.sql.split(OBSERVATION_PROJECTION).length, 2);
  assert.equal(result.sqlSha256, hash(result.sql));
  for (const token of ['sequence_system_column_acls', 'sequence_system_raw_acl_match', 'complete_write_system_acl_match_v8', 'recorded_live_balance_contract_match', 'normal_delete_acl_match_v8'])
    assert.ok(result.sql.includes(token));
});
test('old renderer keeps rejecting new probe and new renderer refuses old/changed/mixed bytes', () => {
  assert.throws(() => renderCanonicalObservation(probe), /EXACT_ORIGINAL_HISTORY_PROBE/);
  for (const changed of [{ ...input(), successorProbeText: native.NATIVE_RUNTIME26_HISTORY_DRAFT_LINESET_METADATA_PROBE },
    { ...input(), successorProbeText: probe + '\n' }, { ...input(), successorSourceText: source + '\n' }])
    assert.throws(() => renderSequenceSystemCanonicalObservation(changed), /EXACT_REVIEWED_SUCCESSOR/);
});
test('getters, primitive coercion, inherited/extra keys fail without invoking input code', () => {
  let reads = 0;
  const getter = { ...input(), get successorSourceText() { reads++; return source; } };
  for (const changed of [getter, Object.create(input()), { ...input(), extra: true },
    { ...input(), successorSourceText: { toString() { reads++; return source; } } }])
    assert.throws(() => renderSequenceSystemCanonicalObservation(changed));
  assert.equal(reads, 0);
});
test('exact server UTF8 digest parity is retained without manufacturing expected/ACL/source authority', () => {
  // Deliberately NOT a valid complete catalog. Observing parity is not approving it.
  const text = JSON.stringify({ format: SUCCESSOR_OBSERVATION.format, sequence_system_column_acls: [{ privileges: [{ grantee: 'foreign', privilege: 'SELECT' }] }], notice: '纯合成观察' });
  const value = inspectSequenceSystemCanonicalObservation({ observed_canonical_text: text, catalog_sha256: hash(text) });
  assert.equal(value.authority, 'NONE'); assert.equal(value.doesNotEstablishIndependentOrigin, true);
  assert.equal(value.rowProofsAndInstallationNotValidated, true);
  assert.throws(() => inspectSequenceSystemCanonicalObservation({ observed_canonical_text: text, catalog_sha256: 'a'.repeat(64) }), /PARITY/);
});
test('old format/missing sequence export or malformed/coerced/extra observation is not silently upgraded', () => {
  for (const body of [{ format: native.NATIVE_RUNTIME26_HISTORY_DRAFT_LINESET_FORMAT }, { format: SUCCESSOR_OBSERVATION.format }, []]) {
    const text = JSON.stringify(body);
    assert.throws(() => inspectSequenceSystemCanonicalObservation({ observed_canonical_text: text, catalog_sha256: hash(text) }), /EXPLICIT_SUCCESSOR/);
  }
  const text = '{'; assert.throws(() => inspectSequenceSystemCanonicalObservation({ observed_canonical_text: text, catalog_sha256: hash(text) }), /JSON_REQUIRED/);
  assert.throws(() => inspectSequenceSystemCanonicalObservation({ observed_canonical_text: '{}', catalog_sha256: hash('{}'), extra: true }), /CLOSED_SUCCESSOR/);
});
