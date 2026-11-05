/** Observation SQL renderer only. No pg import, client, engine, grant or metadata review. */
import { createHash } from 'node:crypto';

export const ORIGINAL = Object.freeze({
  path: 'adapters/postgres/src/native-import-accounting-capability.ts',
  sourceSha256: 'c41bdd26d29a414468676a2a5e858d128595761ba73f5ff8cbf4f561d0cf6413',
  exportName: 'NATIVE_RUNTIME26_HISTORY_DRAFT_LINESET_METADATA_PROBE',
  probeBytes: 32563,
  probeSha256: '49a9c8224213f2523c6aa93ba593bd0077d66e6e0ad4781ec38b4d676fd6a5bb',
});
export const FINAL_PROJECTION = "SELECT manifest->'identity' AS identity,manifest->'migration_versions' AS migration_versions,";
export const OBSERVATION_PROJECTION = "SELECT (manifest-'identity')::text AS observed_canonical_text,\n manifest->'identity' AS identity,manifest->'migration_versions' AS migration_versions,";
const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');

/** Exact hash + unique boundary; every original CTE, predicate and final output is preserved. */
export function renderCanonicalObservation(originalProbe) {
  need(typeof originalProbe === 'string' && originalProbe.isWellFormed(), 'PRIMITIVE_ORIGINAL_PROBE_REQUIRED');
  need(Buffer.byteLength(originalProbe) === ORIGINAL.probeBytes && sha(originalProbe) === ORIGINAL.probeSha256,
    'EXACT_ORIGINAL_HISTORY_PROBE_BYTES_REQUIRED');
  const parts = originalProbe.split(FINAL_PROJECTION);
  need(parts.length === 2, 'UNIQUE_PINNED_FINAL_PROJECTION_REQUIRED');
  const sql = parts[0] + OBSERVATION_PROJECTION + parts[1];
  need(sql.replace(OBSERVATION_PROJECTION, FINAL_PROJECTION) === originalProbe,
    'OBSERVATION_PROJECTION_ONLY_NO_ORIGINAL_PROBE_CHANGE');
  return Object.freeze({
    status: 'OBSERVATION_QUERY_ONLY_NOT_METADATA_REVIEW',
    originalProbeSha256: ORIGINAL.probeSha256,
    sql, sqlSha256: sha(sql),
    addedOutput: 'observed_canonical_text',
    authority: 'NONE',
  });
}

/** Digest parity is not source approval. Never serialize a JS object as canonical input. */
export function inspectCanonicalObservation(input) {
  need(input !== null && typeof input === 'object' && Object.getPrototypeOf(input) === Object.prototype
    && Reflect.ownKeys(input).length === 2, 'CLOSED_CANONICAL_OBSERVATION_REQUIRED');
  const values = {};
  for (const key of ['observed_canonical_text', 'catalog_sha256']) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    need(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'),
      'OWN_DATA_CANONICAL_OBSERVATION_REQUIRED');
    values[key] = descriptor.value;
  }
  const text = values.observed_canonical_text, digest = values.catalog_sha256;
  need(typeof text === 'string' && text.isWellFormed() && Buffer.byteLength(text) > 0
    && Buffer.byteLength(text) <= 16 * 1024 * 1024 && typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest),
  'BOUNDED_UTF8_CANONICAL_TEXT_AND_SHA256_REQUIRED');
  need(sha(text) === digest, 'ORIGINAL_SERVER_DIGEST_CANONICAL_UTF8_PARITY_REQUIRED');
  return Object.freeze({
    status: 'OBSERVATION_ONLY_DIGEST_PARITY_NOT_SOURCE_REVIEW',
    sha256: digest, utf8Bytes: Buffer.byteLength(text), authority: 'NONE',
    doesNotEstablishIndependentOrigin: true,
  });
}
