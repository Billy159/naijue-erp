/** Passive, exact-source material. This module issues no grants or capabilities. */
import { createHash } from 'node:crypto';

export const MATERIAL = Object.freeze({
  filename: 'PLANNED-CURRENT-ISSUER-CREATE-STOCK-ACL-v1.json',
  sha256: '73125aa27812dc709104155d06e28051fa659a2e97358c92678bf41797b92c69',
  status: 'PLANNED_NOT_EXECUTED',
  sourceCommit: 'a3e9fb9969d116a60856da0d2ac4d4d1ca0e8e23',
  sourceTree: 'b6815a5cd15e8bd63dd3368413423983eb2f96db',
});
export const ADDENDUM = Object.freeze({
  filename: 'SOURCE-CLOSURE-AND-LOCK-SELECTION-ADDENDUM-v1.json',
  sha256: 'a70986490269c89aad20539afbf0ac98e455934f8500b1d045ed6f252daf2d60',
});
const materials = new WeakSet();
const addenda = new WeakSet();
const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
const freeze = value => {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const identifier = value => typeof value === 'string' && /^[a-z_][a-z0-9_]*$/.test(value);
const key = cell => [cell.schema, cell.relation, cell.objectKind, cell.column ?? '', cell.privilege].join('\0');

/** Primitive UTF-8 text is captured/hash-checked before parsing. Labels cannot confer authority. */
export function readPlannedMaterial(text) {
  need(typeof text === 'string' && text.isWellFormed() && Buffer.byteLength(text) <= 1024 * 1024,
    'PRIMITIVE_BOUNDED_MATERIAL_TEXT_REQUIRED');
  need(sha(text) === MATERIAL.sha256, 'EXACT_INDEPENDENT_SOURCE_MATERIAL_BYTES_REQUIRED');
  const material = JSON.parse(text);
  need(material.status === 'PLANNED_NOT_EXECUTED' && material.authority === 'NONE'
    && material.completeGrantMatrix === false && material.executable === false
    && material.approvalIssued === false && material.engineStarted === false,
  'PASSIVE_INCOMPLETE_MATERIAL_ONLY');
  need(material.applicationSourceAnchor.commit === MATERIAL.sourceCommit
    && material.applicationSourceAnchor.tree === MATERIAL.sourceTree,
  'EXACT_MATERIAL_APPLICATION_SOURCE_ANCHOR_REQUIRED');
  freeze(material); materials.add(material); return material;
}

/** Expand each source-named privilege cell; do not infer grants from a read floor. */
export function expandPlannedContract(material) {
  need(materials.has(material), 'ORIGINAL_HASH_CHECKED_MATERIAL_REQUIRED');
  need(material.aclRequirements.length === 65 && material.proposedLockCells.length === 18,
    'EXACT_MATERIAL_REQUIREMENT_GROUPS_REQUIRED');
  const pinnedPaths = new Set(material.sourceInputPins.map(pin => pin.path));
  const cells = [];
  for (const row of material.aclRequirements) {
    need(row.schema === 'naijue_erp' && identifier(row.relation)
      && ['COLUMN', 'TABLE', 'SEQUENCE'].includes(row.objectKind)
      && ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(row.privilege)
      && row.status === 'STATIC_EXACT_REQUIREMENT' && Array.isArray(row.source) && row.source.length > 0,
    'CLOSED_SOURCE_REQUIREMENT_ROW_REQUIRED');
    for (const source of row.source) need(pinnedPaths.has(source.path)
      && Array.isArray(source.lines) && source.lines.length === 2
      && source.lines.every(Number.isSafeInteger) && source.lines[0] > 0 && source.lines[1] >= source.lines[0],
    'PINNED_SOURCE_SPAN_REQUIRED');
    const columns = row.objectKind === 'COLUMN' ? row.columns : [null];
    need(Array.isArray(columns) && columns.length > 0
      && (row.objectKind === 'COLUMN' ? columns.every(identifier) : row.columns === null),
    'EXPLICIT_COLUMN_OR_OBJECT_CELL_REQUIRED');
    for (const column of columns) cells.push({
      requirementId: row.id, schema: row.schema, relation: row.relation,
      objectKind: row.objectKind, column, privilege: row.privilege,
      status: 'SOURCE_REQUIREMENT_NOT_APPROVED_GRANT', reason: row.reason, source: row.source,
    });
  }
  need(cells.length === 316 && new Set(cells.map(key)).size === 316,
    'EXACT_316_UNIQUE_REQUIRED_CELLS');
  cells.sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  const unresolvedLockCells = material.proposedLockCells.map(row => {
    need(row.schema === 'naijue_erp' && identifier(row.relation) && row.privilege === 'UPDATE'
      && row.status === 'PROPOSED_LOCK_PRIVILEGE_COLUMN_NOT_ACCEPTED'
      && Array.isArray(row.proposedColumns) && row.proposedColumns.length === 1
      && row.proposedColumns.every(identifier), 'EXPLICIT_UNRESOLVED_LOCK_CELL_REQUIRED');
    return { schema: row.schema, relation: row.relation, column: row.proposedColumns[0],
      privilege: 'UPDATE', status: 'UNRESOLVED_REAL_WRITE_AUTHORITY_NOT_ACCEPTED',
      reason: row.reason, source: row.source };
  });
  need(new Set(unresolvedLockCells.map(row => [row.schema, row.relation, row.column].join('.'))).size === 18,
    'EXACT_18_UNRESOLVED_LOCK_CHOICES_REQUIRED');
  return freeze({
    format: 'PASSIVE_CURRENT_NATIVE_STOCK_SOURCE_REQUIREMENTS_V1',
    status: 'REFUSE_REFERENCE_EXECUTION_INCOMPLETE_DESIGN',
    authority: 'NONE', executable: false, completeGrantMatrix: false,
    sourceMaterialSha256: MATERIAL.sha256, applicationSourceAnchor: material.applicationSourceAnchor,
    requiredCells: cells, unresolvedLockCells,
    openDecisions: material.openDecisions,
    negativePolicy: material.negativePolicy,
    functionPolicy: material.functions,
    noTargetAssigned: true,
    successorOrder: {
      status: 'NEW_PASSIVE_DESIGN_NOT_EXECUTED_NOT_A_CHANGE_TO_PINNED_MATERIAL',
      stages: [
        'LIMITED_PRE_CUTOFF_OWNER_REFERENCE_SETUP_WITHOUT_RUNTIME_LOGIN',
        'ORIGINAL_SOURCE_AUTHORIZED_COMPLETE_LEGACY_CUTOFF_PUBLICATION',
        'FINAL_REVIEWED_RUNTIME_ACL_AND_GENUINE_ISSUER',
        'ORIGINAL_SUPPLIER_CREATE_WITH_SOURCE_CONFIRMED_CURRENT_ACTOR',
        'ORIGINAL_PRODUCT_CREATE_WITH_GENUINE_CAPACITY',
        'NEW_TRANSACTION_MAINTAINED_PROOF_AND_STOCK_READ',
      ],
      reason: 'Avoid exposing pre-cutoff maintenance bootstrap branches to the future runtime LOGIN; this is not a source requirement that Supplier must be created before cutoff.',
    },
    limits: [
      '316 static required cells are neither a complete ACL nor an approved GRANT script.',
      'Each proposed lock UPDATE is genuine write authority, not a read-only permission.',
      'No actual catalogue is an expected-source input to this passive expansion.',
      'Offline code cannot establish independent reference execution or peer approval.',
    ],
  });
}

/** A second immutable source input, not an approval file or an actual role observation. */
export function readClosureAddendum(text) {
  need(typeof text === 'string' && text.isWellFormed() && Buffer.byteLength(text) <= 1024 * 1024,
    'PRIMITIVE_BOUNDED_ADDENDUM_TEXT_REQUIRED');
  need(sha(text) === ADDENDUM.sha256, 'EXACT_SOURCE_CLOSURE_ADDENDUM_BYTES_REQUIRED');
  const addendum = JSON.parse(text);
  need(addendum.status === 'PLANNED_NOT_EXECUTED_SOURCE_REVIEW_NOT_RUNTIME_AUTHORITY'
    && addendum.authority === 'NONE' && addendum.engineStarted === false
    && addendum.previousMaterialSha256Unchanged === MATERIAL.sha256
    && addendum.knownNecessaryCells.completeGrantMatrix === false,
  'PASSIVE_SUCCESSOR_SOURCE_DESIGN_ONLY');
  freeze(addendum); addenda.add(addendum); return addendum;
}

/** Preserve the 316 historical requirements; add source-required1 + chosen18, without SQL. */
export function expandSuccessorContract(material, addendum) {
  const previous = expandPlannedContract(material);
  need(addenda.has(addendum), 'ORIGINAL_HASH_CHECKED_CLOSURE_ADDENDUM_REQUIRED');
  need(addendum.additionalRequirements.length === 1 && addendum.selectedLockCells.length === 18,
    'EXACT_ONE_ADDITIONAL_AND_18_SELECTED_SOURCE_CELLS_REQUIRED');
  const additional = addendum.additionalRequirements[0];
  need(additional.schema === 'naijue_erp' && additional.relation === 'inventory_ledger'
    && additional.objectKind === 'COLUMN' && additional.privilege === 'SELECT'
    && JSON.stringify(additional.columns) === '["operation_id"]'
    && additional.status === 'STATIC_SOURCE_REQUIRED_NOT_GRANTED',
  'EXACT_SUPPLIER_RECEIPT_LEDGER_OPERATION_CELL_REQUIRED');
  const requiredCells = [...previous.requiredCells, {
    requirementId: 'SUCCESSOR-SUPPLIER-RECEIPT-LEDGER-OPERATION',
    schema: additional.schema, relation: additional.relation, objectKind: 'COLUMN',
    column: 'operation_id', privilege: 'SELECT', status: 'SOURCE_REQUIREMENT_NOT_APPROVED_GRANT',
    source: additional.source, reason: additional.reason,
  }];
  const selectedLockCells = addendum.selectedLockCells.map(row => {
    need(row.schema === 'naijue_erp' && identifier(row.relation) && row.privilege === 'UPDATE'
      && row.selectionStatus === 'CONTROLLER_SELECTED_SYNTHETIC_COMPONENT_DESIGN_ONLY'
      && row.grantExecuted === false && row.tableLevelUpdateAllowed === false
      && row.zeroWriteAuthorityClaim === false && Array.isArray(row.columns) && row.columns.length === 1
      && row.columns[0] === (row.relation === 'size_group_member' ? 'display_order' : 'id'),
    'EXACT_SELECTED_COLUMN_WITH_REAL_WRITE_EXPOSURE_REQUIRED');
    return { requirementId: 'SELECTED-LOCK-' + row.relation,
      schema: row.schema, relation: row.relation, objectKind: 'COLUMN', column: row.columns[0],
      privilege: 'UPDATE', status: 'SELECTED_FINITE_SYNTHETIC_DESIGN_NOT_GRANTED',
      source: row.originalRequirementSource, guardSource: row.guardSource,
      exposureClass: row.exposureClass, sourceFinding: row.sourceFinding, exposure: row.exposure,
      futureChecks: row.futureChecks, zeroWriteAuthorityClaim: false, grantExecuted: false,
    };
  });
  need(requiredCells.length === 317 && selectedLockCells.length === 18
    && new Set(selectedLockCells.filter(cell => cell.column === 'id').map(cell => cell.relation)).size === 17
    && new Set([...requiredCells, ...selectedLockCells].map(key)).size === 335,
  'EXACT_317_PLUS_18_UNIQUE_335_KNOWN_CELLS_REQUIRED');
  return freeze({
    format: 'PASSIVE_CURRENT_NATIVE_STOCK_SELECTED_SOURCE_REQUIREMENTS_V2',
    status: 'REFUSE_REFERENCE_EXECUTION_PARTIAL_SELECTED_SOURCE_DESIGN',
    authority: 'NONE', executable: false, completeGrantMatrix: false,
    sourceMaterialSha256: MATERIAL.sha256, sourceAddendumSha256: ADDENDUM.sha256,
    applicationSourceAnchor: previous.applicationSourceAnchor,
    requiredCells, selectedLockCells,
    counts: { historicalRequired: 316, newSourceRequired: 1, knownRequired: 317, selectedUpdates: 18, knownUnique: 335 },
    successorOrder: addendum.successorOrder,
    trustedActorPlan: addendum.trustedActor,
    schemeReferencePlan: addendum.schemeMaterial,
    selectedHelperReadClosure: addendum.selectedHelperReadClosure,
    negativePolicy: previous.negativePolicy,
    functionPolicy: previous.functionPolicy,
    noTargetAssigned: true, rolesCreated: false,
    limits: [
      '335 known cells are a partial selected design, NOT a complete ACL or executed GRANT.',
      '17 id UPDATE and member.display_order UPDATE are real write exposures, never a read-only role.',
      'The current-identity helper and scheme literal are source plans, not actual authentication or installed rows.',
      'Complete selected trigger/invoker/EXECUTE/default-ACL closure and independent reference reproducibility remain open.',
      'New maintained Supplier/Product must use original services; separately reviewed owner-only retained legacy reference setup is distinct.',
      'No metadata approval, source-independent observation or business execution is issued by this module.',
    ],
  });
}
