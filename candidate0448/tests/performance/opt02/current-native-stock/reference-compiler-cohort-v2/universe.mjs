/** Exact-source finite policy, not a metadata approval, driver or executable host. */
import { createHash } from 'node:crypto';
import { assertPlan, sourceBytes } from './source-cohort.mjs';
import { stripSqlComments } from '../../../../integration/runtime26-baseline/source-inventory.mjs';
import { captureData } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { readPlannedMaterial, readClosureAddendum, expandSuccessorContract } from '../contract.mjs';

export const CLOSURE_SHA256 = '5dbecde8b688f639922ec680e711864c40175d1be05d5b9cb371aff709138ea0';
export const UNIVERSE_SHA256 = 'b8fc51338a5db0cd9383a4b1a65d83c348570a3f1ddca9c1daa70d66c2ad8174';
export const LOGICAL = Object.freeze({
  status: 'PLANNED_LOGICAL_NAMES_ONLY_NO_PHYSICAL_TARGET_ASSIGNED',
  database: 'naijue_erp_test_c20261101cafe',
  admin: 'dot_rt26_admin_c20261101cafe',
  sourceOwner: 'dot_rt26_owner_c20261101cafe',
  sentinel: 'dot_rt26_runtime_c20261101cafe',
  preparation: 'dot_rt26_prepare_c20261101cafe',
  runtime: 'dot_opt02_runtime_c20261101cafe',
});
export const COLUMN_RIGHTS = Object.freeze(['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']);
export const TABLE_RIGHTS = Object.freeze(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']);
export const SEQUENCE_RIGHTS = Object.freeze(['SELECT', 'UPDATE', 'USAGE']);
export const SYSTEM_COLUMNS = Object.freeze(['ctid', 'xmin', 'cmin', 'xmax', 'cmax', 'tableoid']);
const policies = new WeakSet();
const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
export const SHA = value => createHash('sha256').update(value).digest('hex');
const freeze = value => {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const cellKey = cell => [cell.schema, cell.relation, cell.objectKind, cell.column ?? '', cell.privilege].join('\0');
export function assertFinitePolicy(policy) { need(policies.has(policy), 'ORIGINAL_SOURCE_COMPILED_FINITE_POLICY_REQUIRED'); return policy; }

function closureMaterial(text, plan) {
  need(typeof text === 'string' && text.isWellFormed() && Buffer.byteLength(text) <= 4 * 1024 * 1024
    && SHA(text) === CLOSURE_SHA256, 'EXACT_SOURCE_TRIGGER_EXECUTE_CLOSURE_REQUIRED');
  const closure = JSON.parse(text);
  need(closure.status === 'STATIC_SOURCE_DERIVATION_NOT_ENGINE_OR_CANONICAL_APPROVAL'
    && closure.finalRoutineCount === 137 && closure.finalSourceDeclaredUserTriggerCount === 196
    && closure.publicExecuteRoutineCountFromSource === 107 && closure.publicDeniedRoutineCountFromSource === 30
    && closure.unresolvedRootTriggerOrDefaultAclMutations.length === 0,
  'CLOSED_ORIGINAL_ROUTINE_TRIGGER_POLICY_REQUIRED');
  need(closure.sourceInputs.length === plan.files.length && closure.sourceInputs.every((source, index) =>
    source.path === plan.files[index].path && source.sha256 === plan.files[index].sha256),
  'EXACT_40_SOURCE_FILES_FOR_FUNCTION_ACL_REQUIRED');
  need(closure.routineExecuteMatrix.length === 137, 'EXACT_137_SOURCE_FUNCTION_ACLS_REQUIRED');
  for (const row of closure.routineExecuteMatrix) {
    const fn = plan.routines.find(fn => fn.signature === row.sourceFullSignature);
    need(fn && fn.bodySha256 === row.bodySha256 && fn.securityDefiner === row.securityDefiner
      && typeof row.publicExecute === 'boolean', 'FULL_SIGNATURE_BODY_ATTRIBUTE_EXECUTE_SOURCE_MATCH_REQUIRED');
  }
  return closure;
}

/** The caller supplies only exact immutable text and the original branded M06 source plan. */
export async function compileFinitePolicy(plan, input) {
  assertPlan(plan);
  const args = captureData(input, ['materialText', 'addendumText', 'closureText', 'universeText']);
  const selected = expandSuccessorContract(readPlannedMaterial(args.materialText), readClosureAddendum(args.addendumText));
  const closure = closureMaterial(args.closureText, plan);
  const schema = plan.inventory.profiles.HISTORY.schema;
  need(schema.tables.length === 56 && schema.tables.reduce((n, table) => n + table.columns.length, 0) === 584,
    'SOURCE_56_TABLES_584_COLUMNS_REQUIRED');
  const views = new Set();
  for (const file of plan.files) {
    await sourceBytes(file);
    for (const statement of file.statements) {
      const text = stripSqlComments(statement.sql).trim();
      const match = text.match(/^CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+naijue_erp\.([a-z_][a-z0-9_]*)\b/i);
      if (match) views.add(match[1]);
      need(!/\bALTER\s+DEFAULT\s+PRIVILEGES\b/i.test(text), 'NO_SOURCE_DEFAULT_ACL_MUTATION_ALLOWED');
    }
  }
  need(views.size === 0, 'CURRENT_SOURCE_VIEW_SET_MUST_BE_EMPTY');
  const sequences = schema.sequences.map(s => s.name).sort();
  need(JSON.stringify(sequences) === JSON.stringify(['customer_code_sequence', 'runtime_sales_document_number_seq',
    'runtime_transfer_document_number_seq', 'supplier_code_sequence']), 'EXACT_FOUR_SOURCE_SEQUENCES_REQUIRED');
  const direct = [...selected.requiredCells, ...selected.selectedLockCells];
  const positive = new Set(direct.map(cellKey));
  need(positive.size === 335, 'EXACT_335_SOURCE_DESIGNED_DIRECT_CELLS_REQUIRED');
  const runtimeCells = [];
  const add = cell => runtimeCells.push({ ...cell, allowed: positive.has(cellKey(cell)), basis: 'EXPLICIT_STATIC_DESIGN_ELSE_DENY' });
  for (const table of schema.tables) {
    for (const column of table.columns) for (const privilege of COLUMN_RIGHTS)
      add({ schema: 'naijue_erp', relation: table.name, objectKind: 'COLUMN', column: column.name, privilege, system: false });
    for (const column of SYSTEM_COLUMNS) for (const privilege of COLUMN_RIGHTS)
      add({ schema: 'naijue_erp', relation: table.name, objectKind: 'COLUMN', column, privilege, system: true });
    for (const privilege of TABLE_RIGHTS)
      add({ schema: 'naijue_erp', relation: table.name, objectKind: 'TABLE', column: null, privilege });
  }
  for (const sequence of sequences) for (const privilege of SEQUENCE_RIGHTS)
    add({ schema: 'naijue_erp', relation: sequence, objectKind: 'SEQUENCE', column: null, privilege });
  need(new Set(runtimeCells.map(cellKey)).size === runtimeCells.length
    && runtimeCells.length === 4140 && runtimeCells.filter(cell => cell.allowed).length === 335
    && direct.every(cell => runtimeCells.some(candidate => cellKey(candidate) === cellKey(cell))),
  'COMPLETE_SOURCE_CELL_UNIVERSE_AND_NO_UNKNOWN_ALLOW_REQUIRED');
  const functionExecute = closure.routineExecuteMatrix.map(fn => ({
    signature: fn.sourceFullSignature, bodySha256: fn.bodySha256, securityDefiner: fn.securityDefiner,
    publicExecute: fn.publicExecute,
    runtimeExecutePrivilege: fn.publicExecute,
    sentinelExecutePrivilege: fn.publicExecute,
    preparationExecutePrivilege: fn.publicExecute,
    ownerExecutePrivilege: true,
    adminExecutePrivilege: true,
    directRuntimeGrant: false,
    source: fn.source, events: fn.events,
    scope: 'EXECUTE_PRIVILEGE_IS_DISTINCT_FROM_SCHEMA_USAGE_NO_ZERO_PUBLIC_EXECUTE_CLAIM',
  }));
  need(typeof args.universeText === 'string' && args.universeText.isWellFormed()
    && Buffer.byteLength(args.universeText) <= 2 * 1024 * 1024 && SHA(args.universeText) === UNIVERSE_SHA256,
  'EXACT_INDEPENDENT_SOURCE_FINITE_UNIVERSE_REQUIRED');
  const independent = JSON.parse(args.universeText);
  need(independent.status === 'PROPOSED_NOT_EXECUTED_NOT_METADATA_OR_ENGINE_AUTHORITY'
    && independent.authority === 'NONE' && independent.sourceStatementShaMatches === 718
    && independent.runtimeTableColumnSequenceCells.length === 4140
    && independent.runtimeFunctionEffectiveCells.length === 137,
  'PASSIVE_SOURCE_FINITE_UNIVERSE_ONLY');
  const independentlyNamed = new Map(independent.runtimeTableColumnSequenceCells.map(cell => [cellKey({
    schema: 'naijue_erp', relation: cell.relation, objectKind: cell.kind, column: cell.column, privilege: cell.privilege,
  }), cell.expectedRuntimeEffective]));
  need(independentlyNamed.size === 4140 && runtimeCells.every(cell => independentlyNamed.get(cellKey(cell)) === cell.allowed),
    'ALL_4140_SOURCE_DERIVED_CELLS_MUST_MATCH_INDEPENDENT_VECTOR');
  const independentlyExecuted = new Map(independent.runtimeFunctionEffectiveCells.map(cell => [cell.signature, cell.expectedRuntimeEffective]));
  need(independentlyExecuted.size === 137 && functionExecute.every(fn => independentlyExecuted.get(fn.signature) === fn.runtimeExecutePrivilege),
    'ALL_137_FUNCTION_EXECUTE_CELLS_MUST_MATCH_INDEPENDENT_VECTOR');
  const noAuthority = { superuser: false, inherit: false, createRole: false, createDatabase: false,
    replication: false, bypassRls: false, memberOf: [], objectOwner: false };
  const policy = freeze({
    format: 'SOURCE_COMPLETE_FINITE_SYNTHETIC_ROLE_DESIGN_V1',
    status: 'SOURCE_POLICY_ONLY_NOT_CANONICAL_REVIEW_OR_ENGINE_GO',
    authority: 'NONE', engineExecutable: false,
    completeFiniteSourceCellDesign: true, completeOrdinaryErpBaseline: false,
    logical: LOGICAL,
    sourceFingerprint: plan.sourceFingerprint,
    sourceClosureSha256: CLOSURE_SHA256,
    sourceFiniteUniverseSha256: UNIVERSE_SHA256,
    sourceMaterialSha256: selected.sourceMaterialSha256,
    sourceAddendumSha256: selected.sourceAddendumSha256,
    sourceTables: schema.tables.map(table => ({ name: table.name, columns: table.columns.map(column => column.name) })),
    sourceViews: [...views], sourceSequences: sequences,
    directGrantCells: direct, runtimeCells, functionExecute,
    finiteEffectiveVectorCounts: { cells: 4277, allowed: 442, denied: 3835,
      directSourceGrantCells: 335, inheritedSourcePublicExecute: 107 },
    sourceDeclaredUserTriggers: 196,
    roles: {
      runtime: { name: LOGICAL.runtime, ...noAuthority, login: true, connectionLimit: 4 },
      sourceOwner: { name: LOGICAL.sourceOwner, ...noAuthority, login: false, connectionLimit: 0,
        objectOwner: true, ownership: 'NEW_DATABASE_SCHEMA_AND_ALL_SOURCE_RELATIONS_ROUTINES_SEQUENCES_ONLY' },
      sentinel: { name: LOGICAL.sentinel, ...noAuthority, login: false, connectionLimit: 0 },
      preparation: { name: LOGICAL.preparation, ...noAuthority, login: false, connectionLimit: 0 },
      admin: { name: LOGICAL.admin, login: true, superuser: true, role: 'BOOTSTRAP_ONLY_NEVER_MEASURED_RUNTIME' },
    },
    database: { name: LOGICAL.database, owner: LOGICAL.sourceOwner, public: [], runtime: ['CONNECT'],
      sentinel: [], preparation: [], runtimeCreate: false, runtimeTemporary: false },
    schemas: {
      naijue_erp: { owner: LOGICAL.sourceOwner, runtime: ['USAGE'], public: [], sentinel: [], preparation: [] },
      public: { owner: 'pg_database_owner', preservePostgres17DefaultPublicUsage: true,
        public: ['USAGE'], runtimeEffective: ['USAGE'], runtimeCreate: false,
        newGrantOrRevoke: false, nonSourceObjectsAllowed: false },
    },
    defaults: { ownerDefaultAclRows: [], allUserDefaultAclRows: [],
      alterDefaultPrivilegesAllowed: false,
      sourceFunctionPolicy: 'ORIGINAL_POSTGRES_OWNER_PUBLIC_DEFAULT_WITH_EXACT_SOURCE_REVOKES_AND_PUBLIC_EXCEPTION',
      explicitParameterPrivilegeGrantsToRuntime: [],
    },
    negativeClosure: {
      unlistedColumnCells: 'DENY', unlistedSourceRelations: 'REJECT_NOT_SOURCE',
      allSourceViewPrivileges: 'DENY_EMPTY_VIEW_SET_NO_ACTUAL_DERIVED_EXPECTATIONS',
      tableGrantOptions: false, columnGrantOptions: false, sequenceGrantOptions: false,
      runtimeFunctionGrantOptions: false, runtimeSchemaCreate: false, runtimeDatabaseCreateOrTemp: false,
      runtimeOwnershipOrRoleMembership: false,
      sentinelAndPreparationDatabaseSchemaColumnTableSequenceAuthority: false,
      sentinelAndPreparationInheritedFunctionPublicExecute: 'SOURCE_PUBLIC107_REMAINS_BUT_NO_ERP_SCHEMA_USAGE_OR_CONNECT',
    },
    order: selected.successorOrder,
    knownWriteExposures: selected.selectedLockCells,
    referenceProtocol: closure.newReferenceProtocol,
    unresolvedBeyondFinitePolicy: [
      'Actual independently source-compiled full canonical schema/default/constraint/trigger/ACL text and reproducibility.',
      'Actual effective privileges/role flags/default ACL, source body/trigger closure and genuine service execution.',
      'Distinct fresh physical reference/acceptance scopes and real peer review before original issuer admission.',
    ],
  });
  policies.add(policy); return policy;
}

/** Compare an observation to source expectations, never the other way around.
 * A matching role label is NOT proof of a real database session's identity. */
export function compareRuntimeCellObservations(input, observation) {
  const policy = assertFinitePolicy(input);
  const observed = captureData(observation, ['role', 'cells']);
  need(observed.role === LOGICAL.runtime && Array.isArray(observed.cells)
    && Object.getPrototypeOf(observed.cells) === Array.prototype
    && observed.cells.length === policy.runtimeCells.length
    && Reflect.ownKeys(observed.cells).length === observed.cells.length + 1,
  'EXACT_RUNTIME_OBSERVATION_ROW_COUNT_REQUIRED');
  const expected = new Map(policy.runtimeCells.map(cell => [cellKey(cell), cell.allowed]));
  const seen = new Set();
  for (let index = 0; index < observed.cells.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(observed.cells, String(index));
    need(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'OWN_DATA_RUNTIME_OBSERVATION_ROW_REQUIRED');
    const cell = captureData(descriptor.value, ['schema', 'relation', 'objectKind', 'column', 'privilege', 'allowed']);
    need(typeof cell.schema === 'string' && typeof cell.relation === 'string'
      && typeof cell.objectKind === 'string' && (cell.column === null || typeof cell.column === 'string')
      && typeof cell.privilege === 'string' && typeof cell.allowed === 'boolean',
    'PRIMITIVE_TYPED_PRIVILEGE_OBSERVATION_REQUIRED');
    const key = cellKey(cell);
    need(expected.has(key) && !seen.has(key), 'NO_UNKNOWN_OR_DUPLICATE_PRIVILEGE_OBSERVATIONS');
    need(cell.allowed === expected.get(key), 'SOURCE_PRIVILEGE_EXPECTATION_MISMATCH');
    seen.add(key);
  }
  return Object.freeze({ status: 'OBSERVATION_MATCH_ONLY_NOT_CANONICAL_OR_EXECUTION_AUTHORITY',
    cells: seen.size, mismatches: 0, authority: 'NONE', independentlyProvesSessionRole: false });
}

/** Named finite observations required IN ADDITION to4140 cells and original canonical probe.
 * These expected booleans are source design, not a claim that any SQL ran. */
export function expectedBoundaryObservations(input) {
  const policy = assertFinitePolicy(input);
  const roleFlags = ['runtime', 'sourceOwner', 'sentinel', 'preparation'].map(kind => {
    const role = policy.roles[kind];
    return { name: role.name, login: role.login, superuser: role.superuser, inherit: role.inherit,
      createRole: role.createRole, createDatabase: role.createDatabase, replication: role.replication,
      bypassRls: role.bypassRls, connectionLimit: role.connectionLimit, objectOwner: role.objectOwner };
  });
  const explicitRuntimeGrants = policy.directGrantCells.map(cell => ({
    schema: cell.schema, relation: cell.relation, objectKind: cell.objectKind,
    column: cell.column, privilege: cell.privilege,
    grantee: LOGICAL.runtime, grantor: LOGICAL.sourceOwner, grantOption: false,
  }));
  explicitRuntimeGrants.push(
    { schema: null, relation: LOGICAL.database, objectKind: 'DATABASE', column: null, privilege: 'CONNECT',
      grantee: LOGICAL.runtime, grantor: LOGICAL.sourceOwner, grantOption: false },
    { schema: 'naijue_erp', relation: null, objectKind: 'SCHEMA', column: null, privilege: 'USAGE',
      grantee: LOGICAL.runtime, grantor: LOGICAL.sourceOwner, grantOption: false },
  );
  explicitRuntimeGrants.sort((a, b) => cellKey(a) < cellKey(b) ? -1 : cellKey(a) > cellKey(b) ? 1 : 0);
  return freeze({
    database: { name: LOGICAL.database, owner: LOGICAL.sourceOwner,
      runtime: ['CONNECT'], public: [], sentinel: [], preparation: [] },
    schemas: {
      naijue_erp: { owner: LOGICAL.sourceOwner, runtime: ['USAGE'], public: [], sentinel: [], preparation: [] },
      public: { owner: 'pg_database_owner', public: ['USAGE'], runtimeEffective: ['USAGE'],
        runtimeCreate: false, nonSourceObjects: [] },
    },
    roleFlags,
    bootstrapAdmin: { name: LOGICAL.admin, login: true, superuser: true, ordinaryMeasurement: false },
    roleMembershipEdges: [], userDefaultAclRows: [], explicitRuntimeParameterPrivilegeGrants: [],
    runtimeRoleSettings: [], nonSourceObjects: [],
    explicitRuntimeGrants,
    sourcePublicColumnTableSequenceAclRows: [], sentinelOrPreparationDirectSourceAclRows: [],
    unexpectedSourceObjectAclRows: [],
    sourceOwnership: {
      databaseOwner: LOGICAL.sourceOwner, erpSchemaOwner: LOGICAL.sourceOwner,
      tables: policy.sourceTables.map(table => ({ name: table.name, owner: LOGICAL.sourceOwner })),
      sequences: policy.sourceSequences.map(name => ({ name, owner: LOGICAL.sourceOwner })),
      routines: policy.functionExecute.map(fn => ({ signature: fn.signature, owner: LOGICAL.sourceOwner })),
      runtimeOwnsAnyDatabaseSchemaRelationRoutine: false,
    },
    functions: policy.functionExecute.map(fn => ({
      signature: fn.signature, bodySha256: fn.bodySha256, securityDefiner: fn.securityDefiner,
      publicExecute: fn.publicExecute, publicGrantOption: false,
      runtimeExecute: fn.runtimeExecutePrivilege, runtimeGrantOption: false,
      directRuntimeExecuteGrant: false, unexpectedGrantees: [],
      aclGrantors: [LOGICAL.sourceOwner],
      sentinelExecute: fn.sentinelExecutePrivilege, preparationExecute: fn.preparationExecutePrivilege,
      ownerExecute: true, adminExecute: true,
    })),
  });
}

function sameClosedObservation(actual, expected, where) {
  if (expected === null || typeof expected !== 'object') {
    need(typeof actual === typeof expected && actual === expected, 'BOUNDARY_SOURCE_EXPECTATION_MISMATCH:' + where);
    return;
  }
  if (Array.isArray(expected)) {
    need(Array.isArray(actual) && Object.getPrototypeOf(actual) === Array.prototype
      && actual.length === expected.length && Reflect.ownKeys(actual).length === expected.length + 1,
    'CLOSED_BOUNDARY_OBSERVATION_ARRAY_REQUIRED:' + where);
    for (let index = 0; index < expected.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(actual, String(index));
      need(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'),
        'OWN_DATA_BOUNDARY_OBSERVATION_REQUIRED:' + where);
      sameClosedObservation(descriptor.value, expected[index], where + '[' + index + ']');
    }
    return;
  }
  const fields = Object.keys(expected), value = captureData(actual, fields);
  for (const field of fields) sameClosedObservation(value[field], expected[field], where + '.' + field);
}

export function compareBoundaryObservations(input, actual) {
  sameClosedObservation(actual, expectedBoundaryObservations(input), 'boundary');
  return Object.freeze({ status: 'BOUNDARY_OBSERVATION_MATCH_ONLY_NOT_CANONICAL_OR_ISSUER_REVIEW',
    authority: 'NONE', independentlyProvesDatabaseExecution: false,
    originalCanonicalProbeStillRequired: true, functions: 137, roleFlagRows: 4 });
}
