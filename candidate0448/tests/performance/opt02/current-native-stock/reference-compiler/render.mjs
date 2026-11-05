/** Render exact predesigned grants only; no client, credential, execution or adaptive repair. */
import { assertFinitePolicy, LOGICAL } from './universe.mjs';
import { identifier } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';

export function renderFiniteGrants(input) {
  const policy = assertFinitePolicy(input), grouped = new Map();
  for (const cell of policy.directGrantCells) {
    const key = [cell.objectKind, cell.relation, cell.privilege].join('\0');
    if (!grouped.has(key)) grouped.set(key, { kind: cell.objectKind, relation: cell.relation, privilege: cell.privilege, columns: [] });
    if (cell.objectKind === 'COLUMN') grouped.get(key).columns.push(cell.column);
  }
  const statements = [
    `GRANT CONNECT ON DATABASE ${identifier(LOGICAL.database)} TO ${identifier(LOGICAL.runtime)}`,
    `GRANT USAGE ON SCHEMA naijue_erp TO ${identifier(LOGICAL.runtime)}`,
  ];
  for (const [, row] of [...grouped].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const columns = row.kind === 'COLUMN' ? ` (${row.columns.sort().map(identifier).join(',')})` : '';
    statements.push(`GRANT ${row.privilege}${columns} ON ${row.kind === 'SEQUENCE' ? 'SEQUENCE' : 'TABLE'} naijue_erp.${identifier(row.relation)} TO ${identifier(LOGICAL.runtime)}`);
  }
  return Object.freeze({
    status: 'RENDERED_ONLY_NOT_EXECUTED_OR_METADATA_APPROVAL',
    authority: 'NONE', directSourceCells: 335, additionalDatabaseSchemaCells: 2,
    intendedGrantor: LOGICAL.sourceOwner,
    statements: Object.freeze(statements),
    functionAclStatements: 0, publicSchemaAclStatements: 0, defaultAclStatements: 0,
    prerequisite: 'NEW_ROLE_WITH_ZERO_DIRECT_SOURCE_PRIVILEGES_AND_REVIEWED_POST_CUTOFF_OWNED_TARGET_REQUIRED; NEVER_REPAIR_EXISTING_ROLE',
  });
}
