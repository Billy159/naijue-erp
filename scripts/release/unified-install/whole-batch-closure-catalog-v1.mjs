/** Unactivated versioned successor admission. Same full catalog/ACL query; only
 * the exact reviewed closure body pin changes. A separately installed root-owned
 * record is mandatory and never inferred from the current observation.
 * Caller must own an exclusive physical client in REPEATABLE READ READ ONLY and
 * prevent concurrent DDL/ACL/admin changes through the complete operation. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadWholeCatalogSpec, WHOLE_CATALOG_QUERY, verifyWholeCatalogPacket } from './whole-catalog-gate.mjs';
import { renderWholeBatchClosureIntegrationCandidate } from './whole-closure-integration-candidate.mjs';
import { loadWholeBatchClosureRecordV1 } from './whole-batch-closure-record-v1.mjs';
const sourceSpecs = new WeakSet();
const hash = value => createHash('sha256').update(value).digest('hex');
const need = (condition, code) => { if (!condition) throw Error(code); };
export async function loadWholeBatchClosureSpecV1(root) {
  const predecessor = await loadWholeCatalogSpec(root);
  const candidate = await renderWholeBatchClosureIntegrationCandidate(root);
  need(candidate.manifest.routineChanges.length === 1, 'WHOLE_BATCH_PIN_DELTA_INVALID');
  const change = candidate.manifest.routineChanges[0];
  need(change.signature === 'naijue_erp.standard_whole_package_closed_v2(uuid)', 'WHOLE_BATCH_PIN_DELTA_INVALID');
  let replaced = 0;
  const pins = Object.freeze(predecessor.pins.map(pin => {
    if (pin.signature !== change.signature) return pin;
    need(pin.sha256 === change.before, 'WHOLE_BATCH_PREDECESSOR_PIN_DIFFERS'); replaced++;
    return Object.freeze({ ...pin, sha256: change.after });
  }));
  need(replaced === 1 && pins.length === predecessor.pins.length, 'WHOLE_BATCH_PIN_DELTA_INVALID');
  const extensionSources = [];
  for (const path of ['scripts/release/unified-install/whole-batch-closure-catalog-v1.mjs', 'scripts/release/unified-install/whole-batch-closure-record-v1.mjs', 'scripts/release/unified-install/whole-closure-integration-candidate.mjs', 'scripts/release/unified-install/finalize-whole-batch-closure-v1.mjs'])
    extensionSources.push(Object.freeze({ path, sha256: hash(await readFile(resolve(root, path))) }));
  const sourcePaths = new Map();
  for (const pin of [...predecessor.installation_sources, ...candidate.manifest.sourcePins, ...extensionSources]) {
    const prior = sourcePaths.get(pin.path);
    need(!prior || prior.sha256 === pin.sha256, 'WHOLE_BATCH_SOURCE_PATH_CONFLICT');
    sourcePaths.set(pin.path, Object.freeze({ ...pin }));
  }
  const installation_sources = Object.freeze([...sourcePaths.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const binding = { format: 'WHOLE_BATCH_CLOSURE_SOURCE_SPEC_V1', pins, installation_sources,
    predecessor_source_spec_sha256: predecessor.source_spec_sha256, closure_body_sha256: change.after,
    combined_sql_sha256: candidate.manifest.sqlSha256 };
  const spec = Object.freeze({ ...binding, source_spec_sha256: hash(JSON.stringify(binding) + '\n' + WHOLE_CATALOG_QUERY) });
  sourceSpecs.add(spec); return spec;
}
export async function verifyWholeBatchClosureInstalledV1(client, spec) {
  need(sourceSpecs.has(spec), 'WHOLE_BATCH_GENUINE_SOURCE_SPEC_REQUIRED');
  // No reviewed/caller packet parameter: authority comes only from the fixed
  // root-owned OS record, whose source and physical identity must match exactly.
  const reviewed = await loadWholeBatchClosureRecordV1(spec);
  const ack = (result, command) => {
    const descriptor = result && Object.getOwnPropertyDescriptor(result, 'command');
    need(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.value === command, 'WHOLE_BATCH_CATALOG_ACK_INVALID');
  };
  ack(await client.query('SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp'), 'SET');
  const result = await client.query(WHOLE_CATALOG_QUERY, [JSON.stringify(spec.pins)]);
  ack(result, 'SELECT');
  need(result.rows?.length === 1 && typeof result.rows[0].catalog_json === 'string', 'WHOLE_BATCH_CATALOG_PACKET_INVALID');
  const verified = verifyWholeCatalogPacket(result.rows[0].catalog_json, reviewed, spec.source_spec_sha256);
  return Object.freeze({ ...verified, profile: 'WHOLE177_BATCH_CLOSURE_V1_INSTALLED_INSTANCE_MATCH', predecessor_source_spec_sha256: spec.predecessor_source_spec_sha256 });
}
