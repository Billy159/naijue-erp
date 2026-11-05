/** Opt-in source routing only. No executable SQL, target admission or connections. */
import { readFile, realpath, lstat } from 'node:fs/promises';
import { resolve, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import pins from './fresh35-source-pins.json' with { type: 'json' };
import { loadPublicationIsolationPlan, renderPublicationIsolation } from './fresh27-publication-isolation.mjs';
const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
const sha = value => createHash('sha256').update(value).digest('hex');
const need = (ok, code) => { if (!ok) throw Error(code); };
export const FRESH35_SOURCE_PROFILE = 'FRESH35_ORDINARY_EMPTY_SOURCE_ONLY_V1';
export const FRESH35_SOURCE_PINS = freeze(pins);
export const FRESH35_PREREQUISITES = freeze([
  'FINAL_35_TABLE_DEFINITION_AND_REMAINING_ROUTINE_TYPE_DEPENDENCIES',
  'EXACT_COMBINED_CATALOG_AND_ACL_PROFILE_NOT_LEGACY_PIN_RELAXATION',
  'CAPABILITY_AND_EMBEDDED_BODY_PIN_SUCCESSORS',
  'SINGLE_ATOMIC_INSTALL_WRAPPER_WITH_READ_COMMITTED_AND_EXCLUSIVE_SCHEMA_WINDOW',
  'ISOLATED_ENGINE_INSTALL_IMPORT_ROLLBACK_REPLAY_AND_ORDINARY_BUSINESS_EVIDENCE',
]);
const tokens = new WeakMap();
/** Missing selection preserves the existing route; it never silently opts in. */
export function selectFresh35SourceRoute(profile) {
  if (profile === undefined) return freeze({ route: 'EXISTING_INSTALLER_UNCHANGED', installationReady: false });
  need(profile === FRESH35_SOURCE_PROFILE, 'FRESH35_EXPLICIT_SOURCE_PROFILE_REQUIRED');
  return freeze({ route: FRESH35_SOURCE_PROFILE, installationReady: false });
}
export function verifyFresh35SourceSet(sources) {
  need(Array.isArray(sources) && sources.length === pins.length, 'FRESH35_EXACT_SOURCE_SET_REQUIRED');
  for (let i = 0; i < pins.length; i++) {
    const item = sources[i];
    need(item && item.path === pins[i].path && (typeof item.bytes === 'string' || Buffer.isBuffer(item.bytes)) && sha(item.bytes) === pins[i].sha256,
      'FRESH35_SOURCE_PIN_MISMATCH:' + pins[i].path);
  }
  return true;
}
export async function loadFresh35SourceRoute(options) {
  need(options && Object.getPrototypeOf(options) === Object.prototype && Reflect.ownKeys(options).length === 2 &&
    Object.hasOwn(options, 'sourceRoot') && Object.hasOwn(options, 'profile'), 'FRESH35_CLOSED_OPTIONS_REQUIRED');
  selectFresh35SourceRoute(options.profile);
  need(options.profile === FRESH35_SOURCE_PROFILE, 'FRESH35_EXPLICIT_SOURCE_PROFILE_REQUIRED');
  need(typeof options.sourceRoot === 'string' && isAbsolute(options.sourceRoot), 'FRESH35_ABSOLUTE_SOURCE_ROOT_REQUIRED');
  const root = resolve(options.sourceRoot);
  need(await realpath(root) === root, 'FRESH35_CANONICAL_SOURCE_ROOT_REQUIRED');
  const sources = [];
  for (const pin of pins) {
    const path = resolve(root, pin.path);
    need(path.startsWith(root + sep) && await realpath(path) === path && (await lstat(path)).isFile(), 'FRESH35_REGULAR_SOURCE_REQUIRED');
    sources.push({ path: pin.path, bytes: await readFile(path) });
  }
  verifyFresh35SourceSet(sources);
  const publication = await loadPublicationIsolationPlan(root);
  need(sha(await renderPublicationIsolation(root)) === pins.find(x => x.path.endsWith('/0027_publication_legacy_isolation_successor.sql')).sha256,
    'FRESH35_GENERATED_PUBLICATION_DIFFERS');
  const descriptor = freeze({
    format: FRESH35_SOURCE_PROFILE,
    sourceSetSha256: sha(JSON.stringify(pins)), sources: pins,
    predecessor: { tableCount: 56, migrationVersions: Array.from({ length: 27 }, (_, i) => i + 1), emptyExceptSchemaMigration: true },
    target: { desiredTableCount: 35, implementedTableCount: null },
    // This is dependency order for review, NOT executable install sequencing.
    reviewStages: [
      { ordinal: 1, kind: 'EXISTING_67_INPUT_WHOLE_PACKAGE_SOURCE', paths: pins.slice(0, 67).map(x => x.path) },
      { ordinal: 2, kind: 'FRESH_PUBLICATION_CANDIDATE', path: pins[67].path, replacements: publication.map(({ signature, before_sha256, after_sha256 }) => ({ signature, before_sha256, after_sha256 })) },
      { ordinal: 3, kind: 'FRESH_CORE_HISTORY_FK_CANDIDATE', path: pins[68].path, oldEdges: 7, replacementValidatedNullChecks: 7 },
      { ordinal: 4, kind: 'ROWTYPE_CANDIDATE_REQUIRES_EMBEDDED_PIN_RECONCILIATION', path: pins[69].path },
    ],
    prerequisites: FRESH35_PREREQUISITES,
    installationReady: false, targetAdmitted: false, engineVerified: false, oldTablesRemoved: false,
    existingProfilesChanged: false, executableSqlProvided: false,
  });
  const token = Object.freeze({ profile: FRESH35_SOURCE_PROFILE });
  tokens.set(token, descriptor);
  return token;
}
export function describeFresh35SourceRoute(token) {
  need(tokens.has(token), 'GENUINE_FRESH35_SOURCE_ROUTE_REQUIRED');
  return tokens.get(token);
}
/** A candidate plan is not permission or a complete installer. Never touch args. */
export async function runFresh35Install() {
  throw Object.assign(Error('FRESH35_INSTALL_PREREQUISITES_UNIMPLEMENTED'), {
    code: 'FRESH35_INSTALL_PREREQUISITES_UNIMPLEMENTED', prerequisites: FRESH35_PREREQUISITES,
  });
}
