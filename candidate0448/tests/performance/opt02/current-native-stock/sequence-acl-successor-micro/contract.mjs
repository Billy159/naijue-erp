/** DOT synthetic algorithm experiment only. NOT a migration or production GRANT plan. */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { captureData, identifier, budgetedQuery } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { physicalClientFence } from '../../legacy-cutoff/physical-send.mjs';

export const WORK = fileURLToPath(new URL('../../../../../../', import.meta.url));
export const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
export const MATERIAL_DIR = path.join(WORK, 'development-results-20261031/current-runtime-feasibility-independent-review/sequence-system-attribute-blocker-v1');
export const SOURCE_PINS_PATH = path.join(WORK, 'development-results-20261031/current-runtime-feasibility-independent-review/sequence-acl-successor-micro-source-v1/SOURCE-PINS.json');
export const ORIGINAL_NATIVE_PATH = path.join(WORK, 'development-results-20261031/current-runtime-feasibility-independent-review/sequence-acl-micro-source-v1/ORIGINAL-NATIVE-IMPORT-ACCOUNTING-CAPABILITY.ts');
export const SUCCESSOR_PROBE_PATH = path.join(path.dirname(SOURCE_PINS_PATH), 'NEW-SUCCESSOR-PROBE.sql');
export const PINS = Object.freeze({
  plan: '82d73a72acb85227686f91ba480b4799fb4347f95b40052b098a01f59810be1e',
  fragments: 'ae2f0dca00becb79fca6ce8c1f5dbe5e994113c9ebb9bb75c5509c48d74fe1dc',
  originalProbe: '49a9c8224213f2523c6aa93ba593bd0077d66e6e0ad4781ec38b4d676fd6a5bb',
  originalNativeSource: 'c41bdd26d29a414468676a2a5e858d128595761ba73f5ff8cbf4f561d0cf6413',
  successorNativeSource: 'bfd2a87afea3fff9f51247ce72405650148c764de13daa292df7a60cb610b502',
  successorProbe: '91e6bb912cc409e68f91be5123aae44667c8b7f3db109ffa5910cd8a641ec4ae',
  toolchainReceipt: '4c8f5c8b2699cdec2444dd6e9e838fa31b494bbed290bca1d5f1b1af33dbe7d6',
});
export const PROPOSED = Object.freeze({
  status: 'PROPOSED_DOT_SYNTHETIC_MICRO_NOT_STARTED_NOT_ENGINE_GO',
  id: 'c20261101d002', host: '127.0.0.1', port: 55448,
  database: 'naijue_erp_test_c20261101d002',
  admin: 'dot_seq_admin_c20261101d002', owner: 'dot_seq_owner_c20261101d002',
  observer: 'dot_seq_observer_c20261101d002',
  durationMs: 300000, observerConnectionLimit: 2,
  base: path.join(WORK, 'development-results-20261031/pg-sequence-acl-successor-micro-c20261101d002'),
});
export const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
export const SHA = bytes => createHash('sha256').update(bytes).digest('hex');
export const freeze = value => { if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const contracts = new WeakSet();
export const assertContract = value => { need(contracts.has(value), 'ORIGINAL_PINNED_MICRO_CONTRACT_REQUIRED'); return value; };
const boundedText = (text, sha) => {
  need(typeof text === 'string' && text.isWellFormed() && Buffer.byteLength(text) <= 2 * 1024 * 1024 && SHA(text) === sha,
    'EXACT_PINNED_MICRO_MATERIAL_TEXT_REQUIRED');
  return text;
};

export function loadMicroContract(input) {
  const { planText, fragmentText, probeText } = captureData(input, ['planText', 'fragmentText', 'probeText']);
  const plan = JSON.parse(boundedText(planText, PINS.plan));
  const original = boundedText(probeText, PINS.originalProbe), bytes = Buffer.from(original);
  const source = JSON.parse(boundedText(fragmentText, PINS.fragments));
  need(plan.engineGo === false && plan.authority === 'NONE'
    && plan.status === 'BLOCKER_SOURCE_INFERRED_NOT_ACTUAL_PG_REPRODUCED'
    && source.sourceSha256 === PINS.originalProbe && source.sourceBytes === bytes.length,
  'SOURCE_PLAN_IS_NOT_EXECUTION_OR_ISSUER_AUTHORITY');
  const names = ['ns-and-rels', 'system-export', 'v8-system-floor'];
  need(source.fragments.length === 3 && names.every(name => source.fragments.filter(fragment => fragment.name === name).length === 1),
    'EXACT_THREE_ORIGINAL_MICRO_FRAGMENTS_REQUIRED');
  for (const fragment of source.fragments) {
    need(Number.isSafeInteger(fragment.startOffsetUtf8) && Number.isSafeInteger(fragment.endOffsetUtf8Exclusive)
      && fragment.startOffsetUtf8 >= 0 && fragment.endOffsetUtf8Exclusive > fragment.startOffsetUtf8,
    'EXACT_UTF8_FRAGMENT_SPAN_REQUIRED');
    const span = bytes.subarray(fragment.startOffsetUtf8, fragment.endOffsetUtf8Exclusive);
    need(span.length === fragment.bytes && SHA(span) === fragment.sha256
      && span.equals(Buffer.from(fragment.text)), 'ORIGINAL_FRAGMENT_BYTE_SPAN_CHANGED');
  }
  need(plan.microPlan.layer2TablesFromExactOriginalFloor.length === 23
    && plan.microPlan.layer2RequiredPairs.length === 25 && plan.microPlan.cases.length === 12,
  'EXACT_SOURCE_MICRO_CASES_AND_FLOOR_REQUIRED');
  const contract = freeze({
    status: 'PINNED_SOURCE_MICRO_CONTRACT_NOT_EXECUTED', authority: 'NONE',
    sourcePlanSha256: PINS.plan, sourceFragmentSha256: PINS.fragments,
    originalProbeSha256: PINS.originalProbe, originalProbeBytes: bytes.length,
    fragments: source.fragments, layer2Tables: plan.microPlan.layer2TablesFromExactOriginalFloor,
    requiredPairs: plan.microPlan.layer2RequiredPairs, cases: plan.microPlan.cases,
    upstream: plan.sourceEvidence.upstream,
    notDebianBuildSourceAttestation: true,
  });
  contracts.add(contract); return contract;
}

/** Keep every pinned fragment byte. Two padding constructs only consume their
 * original trailing commas; the JSON padding key is removed, leaving one key. */
export function renderExactFloor(input) {
  const contract = assertContract(input), byName = new Map(contract.fragments.map(fragment => [fragment.name, fragment]));
  const ns = byName.get('ns-and-rels').text, system = byName.get('system-export').text, floor = byName.get('v8-system-floor').text;
  const sql = `/* DOT_SEQUENCE_ACL_MICRO_EXACT_FRAGMENTS_NOT_RUNTIME_PROBE */
WITH observed AS MATERIALIZED (
${ns}
__micro_unused_padding AS (SELECT 1 AS unused)
SELECT pg_catalog.jsonb_build_object(
${system}
'__micro_padding_only__',NULL) - '__micro_padding_only__' AS manifest
)
SELECT manifest->'system_column_acls' AS system_column_acls,
${floor}
FROM observed`;
  const output = Buffer.from(sql), spans = [];
  for (const fragment of contract.fragments) {
    const span = Buffer.from(fragment.text), start = output.indexOf(span);
    need(start >= 0 && output.indexOf(span, start + 1) === -1, 'UNIQUE_UNMODIFIED_FRAGMENT_IN_MICRO_WRAPPER_REQUIRED');
    spans.push({ name: fragment.name, startOffsetUtf8: start, endOffsetUtf8Exclusive: start + span.length,
      bytes: span.length, sha256: SHA(output.subarray(start, start + span.length)), originalSourceStartOffsetUtf8: fragment.startOffsetUtf8 });
  }
  return freeze({ scope: 'EXACT_ORIGINAL_FRAGMENT_ALGORITHM_ONLY_NOT_FULL_137_PROBE_OR_ISSUER',
    authority: 'NONE', originalProbeSha256: PINS.originalProbe, sql, bytes: output.length, sha256: SHA(output), spans,
    padding: 'ONE_UNUSED_CTE_AND_ONE_JSON_PADDING_KEY_REMOVED_BEFORE_MANIFEST; NO_SOURCE_PREDICATE_OR_ROW_FILTER_CHANGE' });
}

/** Exact spans from a separately frozen successor. No independent metadata or
 * whole-issuer approval is inferred from these source bytes. */
export function renderSuccessorFloor(input, probeText) {
  const contract = assertContract(input);
  const text = boundedText(probeText, PINS.successorProbe), parts = new Map(contract.fragments.map(x => [x.name, x.text]));
  const uniqueIndex = token => {
    const at = text.indexOf(token);
    need(at >= 0 && text.indexOf(token, at + token.length) < 0, 'UNIQUE_SUCCESSOR_SOURCE_BOUNDARY_REQUIRED'); return at;
  };
  const ordinaryAt = uniqueIndex(" 'system_column_acls',"), sequenceAt = uniqueIndex(" 'sequence_system_column_acls',");
  const routinesAt = uniqueIndex(" 'routines',"), rawStart = uniqueIndex(" (pg_catalog.jsonb_typeof(manifest->'sequence_system_column_acls')='array'");
  const rawAlias = ' AS sequence_system_raw_acl_match', rawEnd = uniqueIndex(rawAlias) + rawAlias.length;
  need(ordinaryAt < sequenceAt && sequenceAt < routinesAt && routinesAt < rawStart, 'ORDERED_SUCCESSOR_SOURCE_BOUNDARIES_REQUIRED');
  const ordinary = text.slice(ordinaryAt, sequenceAt), sequence = text.slice(sequenceAt, routinesAt), rawFloor = text.slice(rawStart, rawEnd);
  const before = 'a.attnum<0 AND NOT a.attisdropped\n   WHERE';
  need(parts.get('system-export').split(before).length === 2
    && ordinary === parts.get('system-export').replace(before, "a.attnum<0 AND NOT a.attisdropped AND r.relkind<>'S'\n   WHERE") + '\n',
  'ONLY_SOURCE_DECLARED_SEQUENCE_JOIN_DIFFERENCE_ALLOWED');
  for (const key of ['ns-and-rels', 'v8-system-floor']) {
    const expected = parts.get(key), at = uniqueIndex(expected);
    need(at >= 0, 'UNCHANGED_OLD_NS_AND_ORDINARY_25_REQUIRED');
  }
  need(sequence.includes("WHERE r.relkind='S'") && sequence.includes('pg_catalog.aclexplode(a.attacl)')
    && !sequence.includes('WHERE pg_catalog.has_column_privilege'), 'ALL_RAW_SEQUENCE_GRANTEES_MUST_REMAIN_EXPORTED');
  const fragments = [
    { name: 'ns-and-rels', text: parts.get('ns-and-rels') },
    { name: 'ordinary-system-export', text: ordinary },
    { name: 'sequence-system-export', text: sequence },
    { name: 'unchanged-ordinary-25-floor', text: parts.get('v8-system-floor') },
    { name: 'sequence-raw-floor', text: rawFloor },
  ];
  const sql = `/* DOT_SUCCESSOR_SOURCE_FRAGMENT_DIFFERENTIAL_ONLY_NOT_FULL_ISSUER */
WITH observed AS MATERIALIZED (
${parts.get('ns-and-rels')}
__micro_unused_padding AS (SELECT 1 AS unused)
SELECT pg_catalog.jsonb_build_object(
${ordinary}${sequence}
'__micro_padding_only__',NULL) - '__micro_padding_only__' AS manifest
)
SELECT manifest->'system_column_acls' AS system_column_acls,
manifest->'sequence_system_column_acls' AS sequence_system_column_acls,
${parts.get('v8-system-floor')},
${rawFloor}
FROM observed`;
  const bytes = Buffer.from(sql), source = Buffer.from(text), spans = fragments.map(fragment => {
    const b = Buffer.from(fragment.text), start = bytes.indexOf(b), original = source.indexOf(b);
    need(start >= 0 && original >= 0 && bytes.indexOf(b, start + b.length) < 0, 'UNIQUE_FROZEN_SUCCESSOR_FRAGMENT_REQUIRED');
    return { name: fragment.name, startOffsetUtf8: start, endOffsetUtf8Exclusive: start + b.length,
      originalSourceStartOffsetUtf8: original, bytes: b.length, sha256: SHA(b) };
  });
  return freeze({ sql, bytes: bytes.length, sha256: SHA(bytes), spans, successorProbeSha256: PINS.successorProbe,
    scope: 'SOURCE_FRAGMENT_DIFFERENTIAL_NOT_137_ISSUER_OR_CANONICAL_ACCEPTANCE', authority: 'NONE' });
}

export function layer2Setup(input) {
  const contract = assertContract(input), role = identifier(PROPOSED.observer);
  return freeze([
    ...contract.layer2Tables.map(table => `CREATE TABLE naijue_erp.${identifier(table)} (id integer)`),
    ...contract.requiredPairs.map(pair => {
      const [table, column, ...extra] = pair.split('.');
      need(!extra.length && contract.layer2Tables.includes(table) && ['xmin', 'cmin'].includes(column), 'EXACT_ORIGINAL_FLOOR_PAIR_REQUIRED');
      return `GRANT SELECT (${identifier(column)}) ON TABLE naijue_erp.${identifier(table)} TO ${role}`;
    }),
  ]);
}

export const RAW_ATTRIBUTES_SQL = `/* DOT_SEQUENCE_ACL_MICRO_RAW_SYSTEM_ATTRIBUTES_ONLY */
SELECT c.relname AS relation,c.relkind AS kind,a.attnum AS number,a.attname AS name,
 pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attacl::text AS raw_attribute_acl,
 coalesce(c.relacl,pg_catalog.acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))::text AS raw_relation_acl,
 pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,'SELECT') AS runtime_select,
 pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,'INSERT') AS runtime_insert,
 pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,'UPDATE') AS runtime_update,
 pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,'REFERENCES') AS runtime_references,
 pg_catalog.has_table_privilege(current_user,c.oid,'SELECT') AS table_select,
 pg_catalog.has_table_privilege(current_user,c.oid,'UPDATE') AS table_update,
 (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('grantor',pg_catalog.pg_get_userbyid(x.grantor),
  'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END,
  'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
  FROM pg_catalog.aclexplode(a.attacl) x) AS raw_column_privileges
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum<0 AND NOT a.attisdropped
WHERE n.nspname='naijue_erp' AND c.relname IN('micro_extra','supplier_code_sequence')
ORDER BY c.relname,a.attnum`;

export function settings(input) {
  need(Array.isArray(input) && Object.getPrototypeOf(input) === Array.prototype
    && Reflect.ownKeys(input).length === input.length + 1, 'DENSE_PRIMITIVE_MICRO_ARGUMENTS_REQUIRED');
  const args = [];
  for (let index = 0; index < input.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    need(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string',
      'OWN_PRIMITIVE_MICRO_ARGUMENT_REQUIRED'); args.push(descriptor.value);
  }
  if (args.length === 0 || args.length === 1 && args[0] === '--help') return null;
  need(args.length === 2 && args[0] === '--run-sequence-acl-successor-micro' && /^[a-f0-9]{64}$/.test(args[1]),
    'EXPLICIT_MICRO_FLAG_AND_INDEPENDENT_TRUSTED_SOURCE_MANIFEST_SHA_REQUIRED');
  return freeze({ ...PROPOSED, trustedSourceManifestSha256: args[1] });
}

/** A local experiment gate, not a runtime capability. Always use the v3
 * synchronous physical fence beneath both query/COMMIT boundaries. */
export function createGlobalGate() {
  let first = null;
  return freeze({ quarantined: () => first !== null, reason: () => first,
    quarantine(error) { first ??= error instanceof Error ? error : new Error('MICRO_OUTCOME_UNKNOWN'); } });
}
export function makeMicroQuery(rawClient, gate, budget, cleanup = () => false) {
  need(typeof cleanup === 'function', 'EXPLICIT_MICRO_CLEANUP_STATE_REQUIRED');
  const fenced = physicalClientFence(rawClient, gate);
  return (sql, values = []) => budgetedQuery(fenced, sql, values, budget, cleanup());
}
export function assertCapturedProcess(input) {
  const value = captureData(input, ['capturedPid', 'observedPid', 'processUid', 'expectedUid', 'executable', 'expectedExecutable', 'dataArg', 'expectedData']);
  need(Number.isInteger(value.capturedPid) && value.capturedPid > 1 && value.observedPid === value.capturedPid
    && Number.isInteger(value.processUid) && value.processUid === value.expectedUid
    && typeof value.executable === 'string' && value.executable === value.expectedExecutable
    && typeof value.dataArg === 'string' && value.dataArg === value.expectedData, 'CAPTURED_MICRO_CHILD_PROCESS_IDENTITY_REQUIRED');
  return Object.freeze({ capturedProcessMatches: true, pidFileRequiredForOwnedChildStop: false });
}
export function assertInheritedRawRows(rows, wantedSelect, wantedUpdate) {
  need(Array.isArray(rows) && typeof wantedSelect === 'boolean' && typeof wantedUpdate === 'boolean', 'TYPED_MICRO_RAW_OBSERVATION_REQUIRED');
  const attrs = new Map([['ctid', [-1, 'tid']], ['xmin', [-2, 'xid']], ['cmin', [-3, 'cid']],
    ['xmax', [-4, 'xid']], ['cmax', [-5, 'cid']], ['tableoid', [-6, 'oid']]]);
  for (const [kind, relation] of [['S', 'supplier_code_sequence'], ['r', 'micro_extra']]) {
    const selected = rows.filter(row => row.kind === kind && row.relation === relation);
    need(selected.length === 6 && new Set(selected.map(row => row.name)).size === 6
      && new Set(selected.map(row => row.number)).size === 6, 'EXACT_SIX_UNIQUE_SYSTEM_ATTRIBUTES_REQUIRED');
    for (const row of selected) {
      const expected = attrs.get(row.name);
      need(expected && row.number === expected[0] && row.type === expected[1]
        && row.raw_attribute_acl === null && Array.isArray(row.raw_column_privileges) && row.raw_column_privileges.length === 0
        && row.runtime_select === (kind === 'S' && wantedSelect) && row.runtime_update === (kind === 'S' && wantedUpdate)
        && row.runtime_insert === false && row.runtime_references === false
        && row.table_select === (kind === 'S' && wantedSelect) && row.table_update === (kind === 'S' && wantedUpdate),
      'INHERITED_RIGHTS_REQUIRE_EXACT_ATTRIBUTES_AND_EMPTY_RAW_COLUMN_ACL');
    }
  }
  need(rows.length === 12, 'ONLY_TWO_MICRO_RELATIONS_IN_RAW_OBSERVATION');
  return Object.freeze({ sequenceSystemAttributes: 6, tableSystemAttributes: 6, noExplicitColumnAcl: true });
}
export async function outcomeBoundary(gate, work, code) {
  need(gate && typeof gate.quarantined === 'function' && typeof work === 'function'
    && ['MICRO_COMMIT_OUTCOME_UNKNOWN_NO_REPLAY', 'MICRO_NONTRANSACTIONAL_OUTCOME_UNKNOWN_NO_REPLAY'].includes(code),
  'EXPLICIT_MICRO_UNKNOWN_OUTCOME_BOUNDARY_REQUIRED');
  need(gate.quarantined() === false, 'NO_MICRO_SQL_AFTER_UNKNOWN_OUTCOME');
  try { return await work(); } catch (cause) {
    const error = Object.assign(new Error(code, { cause }), { code }); gate.quarantine(error); throw error;
  }
}
