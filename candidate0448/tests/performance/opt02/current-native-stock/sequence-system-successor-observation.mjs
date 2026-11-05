/** Pure pinned observation renderer. No pg/client/engine, GRANT, expected catalog
 * or review authority. Installation and application module brands stay separate. */
import { createHash } from 'node:crypto';
import { FINAL_PROJECTION, OBSERVATION_PROJECTION, inspectCanonicalObservation } from './canonical-extractor.mjs';

export const SUCCESSOR_OBSERVATION = Object.freeze({
  sourcePath: 'adapters/postgres/src/native-import-accounting-capability.ts',
  sourceSha256: '87f306e32e78961c3bd7bf6a4ae2a915419402ff7d84e94e1425fc2d7ed884fe',
  probeExport: 'NATIVE_RUNTIME26_HISTORY_DRAFT_SEQUENCE_SYSTEM_METADATA_PROBE',
  probeBytes: 34216,
  probeSha256: '91e6bb912cc409e68f91be5123aae44667c8b7f3db109ffa5910cd8a641ec4ae',
  format: 'EXACT26_RUNTIME_CATALOG_EXPORT_HISTORY_DRAFT_SEQUENCE_SYSTEM_V1',
  patchLevel: '26_hv2_history_draft_sequence_system_acl_from_v1',
  requiredObservation: 'HISTORY_DRAFT_SEQUENCE_SYSTEM_ACL_V1',
  originalInstallationRuntimeSourceSha256: 'c41bdd26d29a414468676a2a5e858d128595761ba73f5ff8cbf4f561d0cf6413',
  installationCohortMustBeVerifiedSeparately: true,
});
const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
function ownData(input, keys) {
  need(input && Object.getPrototypeOf(input) === Object.prototype && Reflect.ownKeys(input).length === keys.length,
    'CLOSED_SUCCESSOR_OBSERVATION_INPUT_REQUIRED');
  const values = {};
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(input, key);
    need(field && field.enumerable && Object.hasOwn(field, 'value'), 'OWN_DATA_SUCCESSOR_OBSERVATION_REQUIRED');
    values[key] = field.value;
  }
  return values;
}
function pinnedText(text, digest, bytes) {
  need(typeof text === 'string' && text.isWellFormed() && Buffer.byteLength(text) > 0
    && Buffer.byteLength(text) <= 2 * 1024 * 1024 && (bytes === undefined || Buffer.byteLength(text) === bytes)
    && sha(text) === digest, 'EXACT_REVIEWED_SUCCESSOR_SOURCE_AND_PROBE_REQUIRED');
}

/** The sole transformation adds PostgreSQL's original canonical-text output;
 * it never recomputes/normalizes JSON or changes a source predicate/output. */
export function renderSequenceSystemCanonicalObservation(input) {
  const { successorSourceText, successorProbeText } = ownData(input, ['successorSourceText', 'successorProbeText']);
  pinnedText(successorSourceText, SUCCESSOR_OBSERVATION.sourceSha256);
  pinnedText(successorProbeText, SUCCESSOR_OBSERVATION.probeSha256, SUCCESSOR_OBSERVATION.probeBytes);
  const parts = successorProbeText.split(FINAL_PROJECTION);
  need(parts.length === 2, 'UNIQUE_SUCCESSOR_FINAL_PROJECTION_REQUIRED');
  const sql = parts[0] + OBSERVATION_PROJECTION + parts[1];
  need(sql.replace(OBSERVATION_PROJECTION, FINAL_PROJECTION) === successorProbeText,
    'SUCCESSOR_OBSERVATION_PROJECTION_ONLY_REQUIRED');
  return Object.freeze({
    status: 'PINNED_SUCCESSOR_OBSERVATION_QUERY_ONLY_NOT_EXPECTED_OR_REVIEW',
    sql, sqlSha256: sha(sql), successorProbeSha256: SUCCESSOR_OBSERVATION.probeSha256,
    applicationSourceSha256: SUCCESSOR_OBSERVATION.sourceSha256,
    installationSourceSha256NotVerifiedHere: SUCCESSOR_OBSERVATION.originalInstallationRuntimeSourceSha256,
    addedOutput: 'observed_canonical_text', authority: 'NONE', doesNotEstablishIndependentOrigin: true,
    doesNotEstablishInstallationPlanOrModuleBrand: true,
  });
}

/** Preserve the server's exact text for parity. A valid digest or this format
 * does not prove ACL predicates, source origin, a reviewed expected or issuer. */
export function inspectSequenceSystemCanonicalObservation(input) {
  const values = ownData(input, ['observed_canonical_text', 'catalog_sha256']);
  const parity = inspectCanonicalObservation(values);
  let canonical;
  try { canonical = JSON.parse(values.observed_canonical_text); } catch { throw Error('SUCCESSOR_CANONICAL_JSON_REQUIRED'); }
  need(canonical && !Array.isArray(canonical) && canonical.format === SUCCESSOR_OBSERVATION.format
    && Array.isArray(canonical.sequence_system_column_acls), 'EXPLICIT_SUCCESSOR_CANONICAL_FORMAT_REQUIRED');
  return Object.freeze({ ...parity, format: SUCCESSOR_OBSERVATION.format,
    status: 'SUCCESSOR_OBSERVATION_PARITY_ONLY_NOT_EXPECTED_REVIEW_OR_ISSUER',
    rowProofsAndInstallationNotValidated: true });
}
