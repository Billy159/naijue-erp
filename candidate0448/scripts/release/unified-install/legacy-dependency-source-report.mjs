/** Offline inspection only. Resolves the current final source definitions,
 * rather than counting superseded migrations. No connection or SQL execution.
 * Lexical references are review leads, not runtime reachability or DROP proof. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadFresh27Plan, describeFresh27Plan } from './fresh27-plan.mjs';
import { WHOLE_INSTALL_PATCHES } from './render-whole-package-local.mjs';
import { loadWholeCatalogSpec } from './whole-catalog-gate.mjs';

// Candidate list for review, not an approved physical table-removal list.
export const LEGACY_RETIREMENT_CANDIDATE_TABLES = Object.freeze([
  'history_sales_header', 'history_sales_line', 'history_sales_settlement',
  'history_transfer_header', 'history_transfer_line', 'history_revision',
  'history_sales_effective', 'history_transfer_effective',
  'history_sales_line_effective', 'history_transfer_line_effective',
  'history_sales_settlement_effective', 'import_source_row', 'import_sku_alias',
  'import_stock_contributor', 'import_header_native_reference',
  'native_party_import_evidence', 'import_native_catalogue_binding',
  'import_native_payment_binding', 'import_record_accounting_claim',
  'import_history_closure_manifest', 'import_history_document_manifest',
]);
const hash = value => createHash('sha256').update(value).digest('hex');
const need = (value, code) => { if (!value) throw new Error(code); };
const aliases = { boolean: 'bool', integer: 'int4', int: 'int4', bigint: 'int8', smallint: 'int2' };
function normalizedType(type) {
  const value = type.toLowerCase();
  if (value.endsWith('[]')) return normalizedType(value.slice(0, -2)) + '[]';
  if (value.startsWith('naijue_erp.') || value.startsWith('pg_catalog.')) return value;
  return 'pg_catalog.' + (aliases[value] ?? value);
}
function signature(name, args) {
  const types = args.trim() ? args.split(',').map(arg => {
    const parts = arg.trim().replace(/\s+DEFAULT[\s\S]*$/i, '').replace(/^IN\s+/i, '').split(/\s+/);
    need(parts.length === 2, 'LEGACY_AUDIT_UNSUPPORTED_ARGUMENT');
    return normalizedType(parts[1]);
  }) : [];
  return `naijue_erp.${name}(${types.join(',')})`;
}
const canonicalPin = pin => pin.signature.replace(/\(([^)]*)\)$/, (_, types) =>
  '(' + (types ? types.split(',').map(normalizedType).join(',') : '') + ')');

/** Split only outer statements. Function/DO bodies and SQL strings are opaque;
 * commented or quoted CREATE text must never become a routine definition. */
function outerStatements(sql) {
  const statements = []; let tokens = [], i = 0;
  const push = (kind, start, end, value = sql.slice(start, end)) => tokens.push({ kind, start, end, value });
  while (i < sql.length) {
    if (/\s/.test(sql[i])) { i++; continue; }
    if (sql.startsWith('--', i)) { i = sql.indexOf('\n', i + 2); if (i < 0) break; continue; }
    if (sql.startsWith('/*', i)) {
      let depth = 1; i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) { depth++; i += 2; }
        else if (sql.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      need(depth === 0, 'LEGACY_AUDIT_UNTERMINATED_COMMENT'); continue;
    }
    const start = i, c = sql[i];
    const delimiter = c === '$' ? sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0] : null;
    if (delimiter) {
      const end = sql.indexOf(delimiter, i + delimiter.length);
      need(end >= 0, 'LEGACY_AUDIT_UNTERMINATED_DOLLAR_BODY');
      i = end + delimiter.length; push('dollar', start, i, sql.slice(start + delimiter.length, end)); continue;
    }
    if (c === "'" || c === '"') {
      const escapeString = c === "'" && /[Ee]/.test(sql[i - 1] ?? '') && (i < 2 || !/[A-Za-z0-9_$]/.test(sql[i - 2]));
      i++; let ended = false;
      while (i < sql.length) {
        if (escapeString && sql[i] === '\\') { i += 2; continue; }
        if (sql[i] === c) {
          if (sql[i + 1] === c) { i += 2; continue; }
          i++; ended = true; break;
        }
        i++;
      }
      need(ended, 'LEGACY_AUDIT_UNTERMINATED_QUOTE'); push('quoted', start, i); continue;
    }
    if (c === ';') { if (tokens.length) statements.push(tokens); tokens = []; i++; continue; }
    const word = sql.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];
    if (word) { i += word.length; push('word', start, i); }
    else { i++; push('symbol', start, i); }
  }
  if (tokens.length) statements.push(tokens);
  return statements;
}

function literalRoutineDefinitions(sql) {
  const definitions = [];
  for (const tokens of outerStatements(sql)) {
    const word = index => tokens[index]?.kind === 'word' ? tokens[index].value.toUpperCase() : null;
    if (['DROP', 'ALTER'].includes(word(0)) && ['FUNCTION', 'PROCEDURE', 'ROUTINE', 'SCHEMA'].includes(word(1))) {
      throw new Error('LEGACY_AUDIT_UNMODELED_ROUTINE_DDL');
    }
    if (word(0) !== 'CREATE') continue;
    let at = 1;
    if (word(at) === 'OR' && word(at + 1) === 'REPLACE') at += 2;
    need(word(at) !== 'PROCEDURE', 'LEGACY_AUDIT_UNMODELED_ROUTINE_DDL');
    if (word(at) !== 'FUNCTION') continue;
    const schema = tokens[++at], dot = tokens[++at], name = tokens[++at], open = tokens[++at];
    need(schema?.kind === 'word' && schema.value.toLowerCase() === 'naijue_erp' && dot?.value === '.' &&
      name?.kind === 'word' && /^[a-z_][a-z0-9_]*$/i.test(name.value) && open?.value === '(',
    'LEGACY_AUDIT_UNSUPPORTED_ROUTINE_DECLARATION');
    let depth = 1;
    while (++at < tokens.length && depth) {
      if (tokens[at].value === '(') depth++;
      if (tokens[at].value === ')') depth--;
    }
    need(depth === 0, 'LEGACY_AUDIT_UNSUPPORTED_ROUTINE_DECLARATION');
    const close = tokens[at - 1];
    // AS is a real outer token, never text inside a comment or a quoted value.
    const as = tokens.findIndex((token, index) => index >= at && token.kind === 'word' && token.value.toUpperCase() === 'AS');
    const body = tokens[as + 1];
    need(as >= at && body?.kind === 'dollar' && tokens.filter(token => token.kind === 'dollar').length === 1,
      'LEGACY_AUDIT_UNSUPPORTED_ROUTINE_BODY');
    need(!tokens.slice(as + 2).some(token => token.kind === 'word' && ['CREATE', 'DROP', 'ALTER'].includes(token.value.toUpperCase())),
      'LEGACY_AUDIT_UNMODELED_ROUTINE_DDL');
    definitions.push({ signature: signature(name.value.toLowerCase(), sql.slice(open.end, close.start)), body: body.value });
  }
  return definitions;
}

function sourceRoutineDefinitions(source) {
  const literal = literalRoutineDefinitions(source.sql);
  // One existing immutable source carries a replacement inside an EXECUTE
  // literal. Never interpret arbitrary DO blocks or accept a caller opt-in.
  if (source.path !== 'adapters/postgres/patches/0027_standard_import_master_chunks_v2_successor.sql') return literal;
  need(hash(source.sql) === '970ce6bf96832816d3fd97020e2d7e3db2e3fa5db87e463c39708646b186cca4',
    'LEGACY_AUDIT_SOURCE49_CARRIER_DIFFERS');
  const carriers = [];
  for (const statement of outerStatements(source.sql)) {
    if (statement[0]?.value.toUpperCase() !== 'DO') continue;
    const block = statement[1];
    if (block?.kind !== 'dollar') continue;
    for (const tokens of outerStatements(block.value)) {
      for (let index = 0; index < tokens.length - 1; index++) {
        if (tokens[index].kind === 'word' && tokens[index].value.toUpperCase() === 'EXECUTE' && tokens[index + 1].kind === 'dollar') {
          carriers.push(tokens[index + 1].value);
        }
      }
    }
  }
  need(carriers.length === 1, 'LEGACY_AUDIT_SOURCE49_CARRIER_DIFFERS');
  const nested = literalRoutineDefinitions(carriers[0]);
  need(nested.length === 1 && nested[0].signature === 'naijue_erp.standard_import_command(pg_catalog.jsonb,pg_catalog.text,pg_catalog.text)',
    'LEGACY_AUDIT_SOURCE49_CARRIER_DIFFERS');
  return [...literal, ...nested];
}

/** This deliberately narrow extractor is only accepted when the complete final
 * routine cohort and each final body/signature match the supplied exact pins.
 * The helper's output is never an installation/admission capability. */
export function inspectLegacyRoutineSources({ sources, pins }) {
  need(Array.isArray(sources) && Array.isArray(pins), 'LEGACY_AUDIT_INPUT_REQUIRED');
  const latest = new Map();
  for (const source of sources) {
    need(typeof source.path === 'string' && typeof source.sql === 'string', 'LEGACY_AUDIT_SOURCE_REQUIRED');
    for (const routine of sourceRoutineDefinitions(source)) {
      latest.set(routine.signature, {
        ...routine, source: source.path,
        body_sha256: hash(routine.body),
      });
    }
  }
  const normalizedPins = pins.map(pin => ({ ...pin, signature: canonicalPin(pin) }));
  need(latest.size === pins.length && new Set(normalizedPins.map(p => p.signature)).size === pins.length,
    'LEGACY_AUDIT_FINAL_COHORT_DIFFERS');
  const routines = [];
  for (const pin of normalizedPins) {
    const routine = latest.get(pin.signature);
    need(routine && routine.signature === pin.signature && routine.body_sha256 === pin.sha256,
      'LEGACY_AUDIT_FINAL_ROUTINE_PIN_DIFFERS:' + pin.signature);
    const rowtypes = [], compositeArguments = [], mentions = [];
    for (const table of LEGACY_RETIREMENT_CANDIDATE_TABLES) {
      if (new RegExp(`\\bnaijue_erp\\.${table}\\s*%ROWTYPE\\b`, 'i').test(routine.body)) rowtypes.push(table);
      if (new RegExp(`[(,]naijue_erp\\.${table}(?:\\[\\])?(?=[,)])`).test(routine.signature)) compositeArguments.push(table);
      if (new RegExp(`\\bnaijue_erp\\.${table}\\b`, 'i').test(routine.body)) mentions.push(table);
    }
    if (rowtypes.length || compositeArguments.length || mentions.length) {
      routines.push({ signature: routine.signature, source: routine.source,
        body_sha256: routine.body_sha256, lexical_rowtype_references: rowtypes,
        composite_argument_references: compositeArguments, qualified_body_mentions: mentions });
    }
  }
  return routines.sort((a, b) => a.signature.localeCompare(b.signature));
}

export async function buildLegacyDependencySourceReport(root) {
  const sourceRoot = resolve(root);
  const spec = await loadWholeCatalogSpec(sourceRoot);
  const plan = describeFresh27Plan(await loadFresh27Plan({ sourceRoot, profile: 'FRESH27_SOURCE47_PLUS49_CODE_ONLY' }));
  const paths = [...plan.graph.map(item => item.path), ...WHOLE_INSTALL_PATCHES.map(name => 'adapters/postgres/patches/' + name)];
  const sourcePins = new Map(spec.installation_sources.map(item => [item.path, item.sha256]));
  const sources = [];
  for (const path of paths) {
    const sql = await readFile(resolve(sourceRoot, path), 'utf8');
    need(hash(sql) === sourcePins.get(path), 'LEGACY_AUDIT_SOURCE_CHANGED');
    sources.push({ path, sql });
  }
  const routines = inspectLegacyRoutineSources({ sources, pins: spec.pins });
  need((await loadWholeCatalogSpec(sourceRoot)).source_spec_sha256 === spec.source_spec_sha256,
    'LEGACY_AUDIT_SOURCE_SET_CHANGED');
  return {
    format: 'LEGACY_DEPENDENCY_SOURCE_REVIEW_V1',
    scope: 'OFFLINE_SOURCE_ONLY_NOT_RUNTIME_REACHABILITY_OR_PHYSICAL_RETIREMENT_PROOF',
    source_spec_sha256: spec.source_spec_sha256,
    reporter_sha256: hash(await readFile(fileURLToPath(import.meta.url))),
    ordered_sql_sources: sources.map(({ path, sql }) => ({ path, sha256: hash(sql) })),
    final_routine_count: spec.pins.length,
    candidate_tables: [...LEGACY_RETIREMENT_CANDIDATE_TABLES],
    balance_record_candidate_registered: WHOLE_INSTALL_PATCHES.includes('0027_history_balance_rowtype_successor.sql'),
    routines,
    limitations: [
      'Qualified lexical mentions can include comments and literals; unqualified and dynamically assembled names can be missed.',
      'Only outer literal CREATE FUNCTION statements and the exact hash-pinned Source49 EXECUTE literal are resolved. Other dynamic DDL is not interpreted; literal DROP/ALTER routine or schema statements are rejected.',
      'Return and OUT composite types are not enumerated; this report is not a complete dependency graph.',
      'No PostgreSQL parser, catalog, trigger reachability, branch execution, FK, RLS, ACL, archival or restore verification.',
      'An empty reference list is not evidence that a table can be removed.',
      'The source-only balance RECORD candidate does not authorize installation, table retirement or a new catalog profile.',
    ],
    database_accessed: false, retirement_authorized: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  need(process.argv.length === 2, 'Usage: node scripts/release/unified-install/legacy-dependency-source-report.mjs');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  process.stdout.write(JSON.stringify(await buildLegacyDependencySourceReport(root), null, 2) + '\n');
}
