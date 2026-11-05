/** Source/policy-only tests. No driver, target, connection, subprocess or grant execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPairedSourcePlan, assertPlan as assertPairedPlan, sourceBytes as pairedSourceBytes, sourceCohortFor } from './source-cohort.mjs';
import { fileURLToPath } from 'node:url';
import { MATERIAL, ADDENDUM } from '../contract.mjs';
import { compileFinitePolicy, compareRuntimeCellObservations, expectedBoundaryObservations, compareBoundaryObservations, LOGICAL, SHA, CLOSURE_SHA256, UNIVERSE_SHA256 } from './universe.mjs';
import { renderFiniteGrants } from './render.mjs';

const dir = new URL('../../../../../../development-results-20261031/current-runtime-feasibility-independent-review/', import.meta.url);
const inputs = {
  materialText: readFileSync(new URL(MATERIAL.filename, dir), 'utf8'),
  addendumText: readFileSync(new URL(ADDENDUM.filename, dir), 'utf8'),
  closureText: readFileSync(new URL('SOURCE-DECLARED-SELECTED-TRIGGERS-AND-EXECUTE-v1.json', dir), 'utf8'),
  universeText: readFileSync(new URL('SOURCE-DECLARED-SYNTHETIC-ACL-UNIVERSE-v1.json', dir), 'utf8'),
};
assert.equal(typeof process.env.NAIJUE_SOURCE_COHORT_ROOT, 'string', 'Supply explicit independent source root; no active/default fallback');
const { plan, cohort } = await loadPairedSourcePlan({ sourceRoot: process.env.NAIJUE_SOURCE_COHORT_ROOT });
const policy = await compileFinitePolicy(plan, inputs);
const observations = () => ({ role: LOGICAL.runtime, cells: policy.runtimeCells.map(({ schema, relation, objectKind, column, privilege, allowed }) =>
  ({ schema, relation, objectKind, column, privilege, allowed })) });

test('source56/584 plus four sequences produce complete4140 data/system/table/sequence cells with exactly335 allow', () => {
  assert.equal(SHA(inputs.closureText), CLOSURE_SHA256);
  assert.equal(policy.sourceTables.length, 56);
  assert.equal(policy.sourceTables.reduce((n, table) => n + table.columns.length, 0), 584);
  assert.deepEqual(policy.sourceViews, []);
  assert.equal(policy.sourceSequences.length, 4);
  assert.equal(policy.runtimeCells.length, 4140);
  assert.equal(policy.runtimeCells.filter(cell => cell.allowed).length, 335);
  assert.equal(policy.directGrantCells.length, 335);
});

test('all PG17 table rights include56 denied MAINTAIN; only three table DELETE cells allowed', () => {
  const tables = policy.runtimeCells.filter(cell => cell.objectKind === 'TABLE');
  assert.equal(tables.length, 56 * 8);
  assert.equal(tables.filter(cell => cell.privilege === 'MAINTAIN').length, 56);
  assert.ok(tables.filter(cell => cell.privilege === 'MAINTAIN').every(cell => !cell.allowed));
  assert.deepEqual(tables.filter(cell => cell.allowed).map(cell => [cell.relation, cell.privilege]), [
    ['payment_account_hall', 'DELETE'], ['product_image', 'DELETE'], ['sales_settlement', 'DELETE'],
  ]);
});

test('all six system attributes have four-right negatives; only exact25 SELECT cells allowed', () => {
  const system = policy.runtimeCells.filter(cell => cell.system === true);
  assert.equal(system.length, 56 * 6 * 4);
  assert.equal(system.filter(cell => cell.allowed).length, 25);
  assert.ok(system.filter(cell => cell.allowed).every(cell => cell.privilege === 'SELECT' && ['xmin', 'cmin'].includes(cell.column)));
  assert.ok(system.filter(cell => cell.privilege !== 'SELECT').every(cell => !cell.allowed));
});

test('four sequences close all twelve rights; only supplier SELECT+UPDATE, never USAGE or document sequences', () => {
  const sequence = policy.runtimeCells.filter(cell => cell.objectKind === 'SEQUENCE');
  assert.equal(sequence.length, 12);
  assert.deepEqual(sequence.filter(cell => cell.allowed).map(cell => [cell.relation, cell.privilege]), [
    ['supplier_code_sequence', 'SELECT'], ['supplier_code_sequence', 'UPDATE'],
  ]);
});

test('full137 signature/body/source ACL matrix keeps PUBLIC107/private30,SD3, no new EXECUTE grants', () => {
  assert.equal(policy.functionExecute.length, 137);
  assert.equal(new Set(policy.functionExecute.map(fn => fn.signature)).size, 137);
  assert.equal(policy.functionExecute.filter(fn => fn.publicExecute).length, 107);
  assert.equal(policy.functionExecute.filter(fn => !fn.publicExecute).length, 30);
  assert.equal(policy.functionExecute.filter(fn => fn.securityDefiner).length, 3);
  assert.ok(policy.functionExecute.every(fn => fn.runtimeExecutePrivilege === fn.publicExecute && !fn.directRuntimeGrant));
  assert.ok(policy.functionExecute.find(fn => fn.signature === 'naijue_erp.is_native_party_import_insert(text,jsonb)').publicExecute);
});

test('NOLOGIN sentinel/preparation inherit PUBLIC EXECUTE but have no ERP schema USAGE/DB CONNECT', () => {
  for (const role of ['sentinel', 'preparation']) {
    assert.equal(policy.roles[role].login, false);
    assert.equal(policy.roles[role].connectionLimit, 0);
    assert.deepEqual(policy.database[role], []);
    assert.deepEqual(policy.schemas.naijue_erp[role], []);
  }
  assert.equal(policy.functionExecute.filter(fn => fn.sentinelExecutePrivilege).length, 107);
  assert.equal(policy.functionExecute.filter(fn => fn.preparationExecutePrivilege).length, 107);
});

test('runtime nonowner/no membership flags and DB CONNECT-only/schema USAGE-only are explicit', () => {
  assert.equal(policy.roles.runtime.login, true);
  assert.equal(policy.roles.runtime.connectionLimit, 4);
  for (const key of ['superuser', 'inherit', 'createRole', 'createDatabase', 'replication', 'bypassRls', 'objectOwner'])
    assert.equal(policy.roles.runtime[key], false);
  assert.deepEqual(policy.roles.runtime.memberOf, []);
  assert.deepEqual(policy.database.runtime, ['CONNECT']);
  assert.deepEqual(policy.database.public, []);
  assert.deepEqual(policy.schemas.naijue_erp.runtime, ['USAGE']);
  assert.deepEqual(policy.defaults.allUserDefaultAclRows, []);
  assert.equal(policy.defaults.alterDefaultPrivilegesAllowed, false);
});

test('public schema default PUBLIC USAGE is preserved, not newly granted or silently counted as no authority', () => {
  const publicSchema = policy.schemas.public;
  assert.equal(publicSchema.owner, 'pg_database_owner');
  assert.deepEqual(publicSchema.public, ['USAGE']);
  assert.deepEqual(publicSchema.runtimeEffective, ['USAGE']);
  assert.equal(publicSchema.runtimeCreate, false);
  assert.equal(publicSchema.newGrantOrRevoke, false);
  assert.equal(publicSchema.nonSourceObjectsAllowed, false);
});

test('shared logical source names retain original hex guard shapes without assigning physical identity', () => {
  assert.match(LOGICAL.database, /^naijue_erp_test_[a-f0-9]{8,32}$/);
  assert.match(LOGICAL.admin, /^dot_rt26_admin_[a-f0-9]{8,16}$/);
  assert.match(LOGICAL.sourceOwner, /^dot_rt26_owner_[a-f0-9]{8,16}$/);
  assert.match(LOGICAL.sentinel, /^dot_rt26_runtime_[a-f0-9]{8,16}$/);
  assert.match(LOGICAL.preparation, /^dot_rt26_prepare_[a-f0-9]{8,16}$/);
  assert.equal(LOGICAL.status, 'PLANNED_LOGICAL_NAMES_ONLY_NO_PHYSICAL_TARGET_ASSIGNED');
  assert.equal('port' in LOGICAL, false);
  assert.equal('systemIdentifier' in LOGICAL, false);
});

test('renderer emits only exact335 grants+DB/schema2, no function/default/public schema repair or credentials', () => {
  const rendered = renderFiniteGrants(policy), sql = rendered.statements.join(';\n');
  assert.equal(rendered.directSourceCells, 335);
  assert.equal(rendered.additionalDatabaseSchemaCells, 2);
  assert.equal(rendered.functionAclStatements, 0);
  assert.equal(rendered.defaultAclStatements, 0);
  assert.equal(rendered.publicSchemaAclStatements, 0);
  assert.ok(rendered.statements.every(sql => sql.startsWith('GRANT ') && sql.endsWith('TO "' + LOGICAL.runtime + '"')));
  assert.doesNotMatch(sql, /EXECUTE|DEFAULT PRIVILEGES|PASSWORD|password_hash|ON SCHEMA public|WITH GRANT OPTION|REVOKE/);
  assert.match(sql, /GRANT UPDATE \("display_order"\) ON TABLE naijue_erp\."size_group_member"/);
  assert.doesNotMatch(sql, /GRANT UPDATE \("size_group_id"\) ON TABLE naijue_erp\."size_group_member"/);
});

test('copied policy/plan cannot render, and frozen positives cannot be widened', async () => {
  assert.throws(() => renderFiniteGrants({ ...policy }), /ORIGINAL_SOURCE_COMPILED_FINITE_POLICY/);
  await assert.rejects(compileFinitePolicy({ ...plan }, inputs), /LOAD_REAL_PAIRED_SOURCE_PLAN_FIRST_NO_CAST_OR_SELF_BRAND/);
  assert.throws(() => { policy.runtimeCells[0].allowed = true; }, TypeError);
  assert.throws(() => { policy.functionExecute[0].runtimeExecutePrivilege = true; }, TypeError);
});

test('changed closure bytes or getters cannot substitute extra grants or sources', async () => {
  await assert.rejects(compileFinitePolicy(plan, { ...inputs, closureText: inputs.closureText + '\n' }), /EXACT_SOURCE_TRIGGER_EXECUTE_CLOSURE/);
  let calls = 0;
  await assert.rejects(compileFinitePolicy(plan, { ...inputs, get closureText() { calls++; return inputs.closureText; } }), /OWN|DATA/);
  assert.equal(calls, 0);
});

test('source comparator matches all4140 exact mock rows but grants no actual-session/canonical authority', () => {
  const result = compareRuntimeCellObservations(policy, observations());
  assert.equal(result.cells, 4140);
  assert.equal(result.mismatches, 0);
  assert.equal(result.authority, 'NONE');
  assert.equal(result.independentlyProvesSessionRole, false);
  assert.equal(policy.engineExecutable, false);
  assert.equal(policy.completeOrdinaryErpBaseline, false);
});

test('one overgrant, missing needed right, unknown object, duplicate or missing row is rejected, not repaired', () => {
  for (const allowed of [false, true]) {
    const observed = observations(), cell = observed.cells.find(cell => cell.allowed === allowed);
    cell.allowed = !allowed;
    assert.throws(() => compareRuntimeCellObservations(policy, observed), /SOURCE_PRIVILEGE_EXPECTATION_MISMATCH/);
  }
  const unknown = observations(); unknown.cells[0].relation = 'not_in_source';
  assert.throws(() => compareRuntimeCellObservations(policy, unknown), /UNKNOWN_OR_DUPLICATE/);
  const duplicate = observations(); duplicate.cells[0] = { ...duplicate.cells[1] };
  assert.throws(() => compareRuntimeCellObservations(policy, duplicate), /UNKNOWN_OR_DUPLICATE/);
  const missing = observations(); missing.cells.pop();
  assert.throws(() => compareRuntimeCellObservations(policy, missing), /ROW_COUNT/);
});

test('NULL privilege, hidden/extra fields and forged logical-role labels do not coerce into authority', () => {
  const nullable = observations(); nullable.cells[0].allowed = null;
  assert.throws(() => compareRuntimeCellObservations(policy, nullable), /PRIMITIVE_TYPED_PRIVILEGE/);
  const extra = observations(); extra.cells[0].actualApproved = true;
  assert.throws(() => compareRuntimeCellObservations(policy, extra), /CLOSED|DATA/);
  const role = observations(); role.role = LOGICAL.sourceOwner;
  assert.throws(() => compareRuntimeCellObservations(policy, role), /ROW_COUNT/);
  const iterator = observations(); let called = false;
  iterator.cells[Symbol.iterator] = function* () { called = true; };
  assert.throws(() => compareRuntimeCellObservations(policy, iterator), /ROW_COUNT/);
  assert.equal(called, false);
  const getter = observations(); let reads = 0;
  Object.defineProperty(getter.cells, '0', { enumerable: true, get() { reads++; return null; } });
  assert.throws(() => compareRuntimeCellObservations(policy, getter), /OWN_DATA_RUNTIME/);
  assert.equal(reads, 0);
});

test('complete DB/schema/role/owner/default/function expected tuple remains observation-only even for exact mock', () => {
  const expected = expectedBoundaryObservations(policy);
  const result = compareBoundaryObservations(policy, structuredClone(expected));
  assert.equal(expected.functions.length, 137);
  assert.equal(expected.sourceOwnership.tables.length, 56);
  assert.equal(expected.sourceOwnership.sequences.length, 4);
  assert.equal(expected.explicitRuntimeGrants.length, 337);
  assert.equal(result.authority, 'NONE');
  assert.equal(result.independentlyProvesDatabaseExecution, false);
  assert.equal(result.originalCanonicalProbeStillRequired, true);
});

test('database TEMP/CREATE, schema CREATE/default PUBLIC usage drift and ownership overreach are rejected', () => {
  const mutations = [
    data => data.database.runtime.push('TEMPORARY'),
    data => data.database.runtime.push('CREATE'),
    data => data.schemas.naijue_erp.runtime.push('CREATE'),
    data => data.schemas.public.runtimeCreate = true,
    data => data.schemas.public.public = [],
    data => data.sourceOwnership.tables[0].owner = LOGICAL.runtime,
    data => data.sourceOwnership.runtimeOwnsAnyDatabaseSchemaRelationRoutine = true,
  ];
  for (const mutate of mutations) {
    const data = structuredClone(expectedBoundaryObservations(policy)); mutate(data);
    assert.throws(() => compareBoundaryObservations(policy, data), /BOUNDARY|CLOSED|DATA/);
  }
});

test('unexpected role membership, defaults, parameter delegation or privileged flags are never adaptive inputs', () => {
  const mutations = [
    data => data.roleFlags[0].superuser = true,
    data => data.roleFlags[0].inherit = true,
    data => data.roleFlags[0].objectOwner = true,
    data => data.roleMembershipEdges.push({ member: LOGICAL.runtime, role: LOGICAL.sourceOwner }),
    data => data.userDefaultAclRows.push({ defaultExecute: true }),
    data => data.explicitRuntimeParameterPrivilegeGrants.push('session_replication_role'),
    data => data.runtimeRoleSettings.push('session_replication_role=replica'),
    data => data.nonSourceObjects.push('public.unreviewed_function'),
    data => data.explicitRuntimeGrants[0].grantor = LOGICAL.admin,
    data => data.explicitRuntimeGrants[0].grantOption = true,
    data => data.sourcePublicColumnTableSequenceAclRows.push({ privilege: 'SELECT' }),
    data => data.sentinelOrPreparationDirectSourceAclRows.push({ privilege: 'SELECT' }),
    data => data.unexpectedSourceObjectAclRows.push({ grantee: 'unreviewed' }),
  ];
  for (const mutate of mutations) {
    const data = structuredClone(expectedBoundaryObservations(policy)); mutate(data);
    assert.throws(() => compareBoundaryObservations(policy, data), /BOUNDARY|CLOSED|DATA/);
  }
});

test('private EXECUTE, extra grantee/grant option, definer/body/source-owner drift all fail against137 source rows', () => {
  const mutations = [
    data => data.functions.find(fn => !fn.publicExecute).runtimeExecute = true,
    data => data.functions[0].publicGrantOption = true,
    data => data.functions[0].runtimeGrantOption = true,
    data => data.functions[0].directRuntimeExecuteGrant = true,
    data => data.functions[0].unexpectedGrantees.push(LOGICAL.runtime),
    data => data.functions[0].securityDefiner = !data.functions[0].securityDefiner,
    data => data.functions[0].bodySha256 = '0'.repeat(64),
    data => data.functions[0].aclGrantors = [LOGICAL.admin],
    data => data.sourceOwnership.routines[0].owner = LOGICAL.runtime,
  ];
  for (const mutate of mutations) {
    const data = structuredClone(expectedBoundaryObservations(policy)); mutate(data);
    assert.throws(() => compareBoundaryObservations(policy, data), /BOUNDARY|CLOSED|DATA/);
  }
});

test('boundary getters/hidden keys are not read and cannot become mock review authority', () => {
  const data = structuredClone(expectedBoundaryObservations(policy)); let reads = 0;
  Object.defineProperty(data.schemas.public, 'runtimeCreate', { enumerable: true, get() { reads++; return false; } });
  assert.throws(() => compareBoundaryObservations(policy, data), /OWN|DATA/);
  assert.equal(reads, 0);
  const extra = structuredClone(expectedBoundaryObservations(policy));
  Object.defineProperty(extra, 'independentApproved', { value: true });
  assert.throws(() => compareBoundaryObservations(policy, extra), /CLOSED|DATA/);
});

test('all4277 effective cells cross-check independent static source universe, not any actual catalog', async () => {
  assert.equal(SHA(inputs.universeText), UNIVERSE_SHA256);
  assert.deepEqual(policy.finiteEffectiveVectorCounts, { cells: 4277, allowed: 442, denied: 3835,
    directSourceGrantCells: 335, inheritedSourcePublicExecute: 107 });
  await assert.rejects(compileFinitePolicy(plan, { ...inputs, universeText: inputs.universeText + '\n' }), /EXACT_INDEPENDENT_SOURCE_FINITE_UNIVERSE/);
  assert.equal(policy.authority, 'NONE');
  assert.equal(policy.engineExecutable, false);
});

test('paired plan keeps the real installer module WeakSet and its same-root v22/observer, without casts', () => {
  assert.equal(assertPairedPlan(plan), plan);
  assert.equal(cohort.sourcePlan.assertPlan(plan), plan);
  assert.equal(sourceCohortFor(plan), cohort);
  assert.equal(typeof cohort.v22Carrier.v22Carrier, 'function');
  assert.equal(typeof cohort.sourceObserver.observe, 'function');
  assert.throws(() => assertPairedPlan({ ...plan }), /NO_CAST|SELF_BRAND/);
});
test('paired source bytes require genuine file objects, not copied declarations or path-shaped approvals', async () => {
  const file = plan.files[0], text = await pairedSourceBytes(file);
  assert.equal(SHA(text), file.sha256);
  await assert.rejects(pairedSourceBytes({ ...file }), /GENUINE_PAIRED_SOURCE_FILE/);
  assert.equal(cohort.sourceFingerprint, '726d84f1303bcb5deb599c19de89f8cdfad89c8f365e34fa36ca4de49051bcbb');
});
test('root input rejects getters/coercion/unknown keys before invoking filesystem/module imports', async () => {
  let reads = 0;
  await assert.rejects(loadPairedSourcePlan({ get sourceRoot() { reads++; return '/no'; } }), /OWN|DATA/);
  await assert.rejects(loadPairedSourcePlan({ sourceRoot: { toString() { reads++; return '/no'; } } }), /PRIMITIVE/);
  await assert.rejects(loadPairedSourcePlan({ sourceRoot: '/', approved: true }), /OWN|DATA/);
  await assert.rejects(loadPairedSourcePlan({ sourceRoot: 'relative-root' }), /PRIMITIVE/);
  assert.equal(reads, 0);
});
test('active new-native source cohort is refused instead of blind-repinning the old726d loader', async () => {
  const activeRoot = fileURLToPath(new URL('../../../../../', import.meta.url)).replace(/\/$/, '');
  assert.notEqual(activeRoot, process.env.NAIJUE_SOURCE_COHORT_ROOT);
  await assert.rejects(loadPairedSourcePlan({ sourceRoot: activeRoot }), /PAIRED_SOURCE_COHORT_BYTES_CHANGED/);
});
test('renderer binds only the newly paired policy brand, not a copied policy or reference status label', () => {
  assert.throws(() => renderFiniteGrants({ ...policy }), /ORIGINAL_SOURCE_COMPILED/);
  assert.equal(policy.authority, 'NONE'); assert.equal(policy.engineExecutable, false);
  assert.equal(cohort.scope, 'REAL_MODULE_WEAKSET_PAIRING_ONLY_NOT_TARGET_METADATA_OR_ISSUER_APPROVAL');
});

test('a symlink source root is rejected before imports even when it points to exact retained bytes', async () => {
  const { mkdtemp, symlink, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const parent = await mkdtemp(join(tmpdir(), 'source-cohort-no-engine-'));
  try {
    const link = join(parent, 'linked-root'); await symlink(process.env.NAIJUE_SOURCE_COHORT_ROOT, link, 'dir');
    await assert.rejects(loadPairedSourcePlan({ sourceRoot: link }), /CANONICAL_SOURCE_ROOT_REQUIRED/);
  } finally { await rm(parent, { recursive: true }); }
});
