#!/usr/bin/env node
// H01: current source ownership only. No database, build, release or source mutations.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const matrixPath = 'docs/controller-handoff-20261028/MODULE-OWNERSHIP.json';
const posix = value => value.split(path.sep).join('/');
const normalize = expression => expression.replace(/\s+/g, '');
const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
const typeImport = node => ts.isImportDeclaration(node) && (node.importClause?.isTypeOnly
  || node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
    && node.importClause.namedBindings.elements.every(element => element.isTypeOnly));
const importNames = node => ts.isImportDeclaration(node) && node.importClause?.namedBindings
  && ts.isNamedImports(node.importClause.namedBindings)
  ? node.importClause.namedBindings.elements.map(element => (element.propertyName ?? element.name).text) : [];
const walk = (node, visit) => { visit(node); ts.forEachChild(node, child => walk(child, visit)); };
const moduleTarget = (file, specifier) => specifier.startsWith('.')
  ? path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)).replace(/\.js$/, '.ts') : specifier;

function strings(source) {
  const result = [];
  walk(source, node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) result.push({node, text: node.text});
    else if (ts.isTemplateExpression(node)) result.push({node, text: node.head.text + node.templateSpans
      .map(span => `§${normalize(span.expression.getText(source))}§${span.literal.text}`).join('')});
  });
  return result;
}

// Keep quoted data opaque: words in comments, money text and error messages are not SQL commands.
function sqlText(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''");
}
export function mutations(text, dynamicTables = {}) {
  const sql = sqlText(text);
  if (!/^\s*(?:WITH\b|INSERT\s+INTO\b|UPDATE\s+\S+\s+|DELETE\s+FROM\b|TRUNCATE\s+\S)/i.test(sql)) return [];
  const result = [];
  for (const match of sql.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(naijue_erp\.(?:[a-z_]+|§[^§]+§)+|[a-z_][a-z0-9_.]*)/gi)) {
    if (/\bFOR\s*$/i.test(sql.slice(0, match.index))) continue;
    // ON CONFLICT ... DO UPDATE SET modifies the already identified INSERT target.
    if (/^UPDATE$/i.test(match[1]) && /^SET$/i.test(match[2])) continue;
    const target = match[2];
    if (!target.startsWith('naijue_erp.')) { result.push({table: target, unresolved: true}); continue; }
    let expanded = [target.slice('naijue_erp.'.length)];
    for (const variable of [...target.matchAll(/§([^§]+)§/g)]) {
      const values = dynamicTables[variable[1]];
      if (!Array.isArray(values) || !values.length) { expanded = []; break; }
      expanded = expanded.flatMap(value => values.map(replacement => value.replace(variable[0], replacement)));
    }
    if (!expanded.length) result.push({table: target, unresolved: true});
    else for (const table of expanded) result.push({table, operation: match[1].split(/\s/)[0].toUpperCase()});
  }
  return result;
}

export function inspectSource(file, text, matrix) {
  const source = parse(file, text), errors = [], writer = matrix.writePorts.find(port => port.file === file);
  const add = (code, node, detail) => errors.push({file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, code, detail});
  const borrowed = node => {
    if (writer?.transaction === 'borrowed-client') return true;
    for (let parent = node; parent; parent = parent.parent) if (parent.name && writer?.borrowedScopes?.includes(parent.name.getText(source))) return true;
    return false;
  };
  walk(source, node => {
    let specifier;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifier = node.moduleSpecifier.text;
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === 'require') && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) specifier = node.arguments[0].text;
    if (specifier !== undefined) {
      const target = moduleTarget(file, specifier);
      const domain = file.startsWith('packages/domain/src/');
      const application = file.startsWith('packages/application/src/') || file.startsWith('packages/authentication/src/');
      const frontend = file.startsWith('apps/web/');
      if (domain && !(target.startsWith('packages/domain/src/'))) add('DOMAIN_DEPENDENCY', node, target);
      else if (application && (target.startsWith('adapters/') || target.startsWith('apps/') || ['pg', 'fastify', 'react', 'react-dom', '@arco-design/web-react'].includes(target))) add('APPLICATION_PRIVATE_ADAPTER', node, target);
      else if (frontend && (target.startsWith('adapters/') || target.startsWith('apps/api/') || target === 'pg')) add('UI_PRIVATE_BACKEND', node, target);
      else if (file.startsWith('apps/api/') && target.startsWith('adapters/')
        && !matrix.adapterImportExceptions.some(edge => edge.from === file && edge.to === target
          && (!edge.typeOnly || typeImport(node)) && (!edge.symbols || importNames(node).length > 0
            && importNames(node).every(name => edge.symbols.includes(name))))) add('HTTP_PRIVATE_ADAPTER', node, target);
      const restricted = matrix.restrictedAdapterConsumers.find(adapter => adapter.file === target);
      if (restricted && !restricted.consumers.includes(file)) add('UNREGISTERED_POLICY_CONSUMER', node, target);
      const otherWriter = matrix.writePorts.find(port => port.file === target);
      if (writer && otherWriter && writer.module !== otherWriter.module
        && !matrix.sharedClientEdges.some(edge => edge.from === file && edge.to === target
          && (!edge.typeOnly || typeImport(node)))) add('CROSS_MODULE_PRIVATE_WRITER', node, target);
      if (!writer && file.startsWith('adapters/') && otherWriter
        && !matrix.adapterHelperImports.some(edge => edge.from === file && edge.to === target
          && (!edge.typeOnly || typeImport(node)) && importNames(node).length > 0
          && importNames(node).every(name => edge.symbols.includes(name)))) add('PRIVATE_WRITER_FROM_UNREGISTERED_MODULE', node, target);
    }
    if (borrowed(node) && ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression) && ['connect', 'transaction'].includes(node.expression.name.text)) add('BORROWED_SECOND_TRANSACTION', node, node.expression.getText(source));
    if (borrowed(node) && ts.isNewExpression(node)
      && /(?:Pool|Client)$/.test(node.expression.getText(source))) add('BORROWED_NEW_CONNECTION', node, node.expression.getText(source));
  });
  for (const literal of strings(source)) {
    const sql = sqlText(literal.text);
    if (borrowed(literal.node) && /^\s*(?:BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\b/i.test(sql)) add('BORROWED_TRANSACTION_CONTROL', literal.node, sql.trim());
    for (const mutation of mutations(literal.text, writer?.dynamicTables)) {
      if (mutation.unresolved) add('UNRESOLVED_WRITE_TARGET', literal.node, mutation.table);
      else if (!writer) add('UNREGISTERED_WRITER', literal.node, mutation.table);
      else if (!matrix.tables[mutation.table] || !writer.tables.includes(mutation.table)) add('UNOWNED_TABLE_WRITE', literal.node, mutation.table);
    }
  }
  if (strings(source).some(literal => mutations(literal.text, writer?.dynamicTables).length && literal.text.includes('§'))) {
    // Values are deliberately finite, but must stay bound to the actual local selector rather than
    // trusting a stale JSON list after somebody changes TABLES/table/family to another target.
    for (const binding of writer?.dynamicTableDeclarations ?? []) {
      const initializers = new Set();
      walk(source, node => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === binding.name && node.initializer) initializers.add(normalize(node.initializer.getText(source)));
      });
      if (JSON.stringify([...initializers].sort()) !== JSON.stringify(binding.initializers.map(normalize).sort())) add('DYNAMIC_TABLE_SELECTOR_CHANGED', source, binding.name);
    }
  }
  // An exact borrowed HISTORY seam must continue to pass the captured client, never a second pool/lease.
  if (writer?.historyPostingClient) {
    let calls = 0;
    walk(source, node => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'post'
        && ts.isCallExpression(node.expression.expression) && node.expression.expression.expression.getText(source) === 'createPostgresHistoryRevisionPosting') {
        calls++;
        if (node.arguments[0]?.getText(source) !== writer.historyPostingClient) add('HISTORY_DIFFERENT_CLIENT', node, node.arguments[0]?.getText(source) ?? 'missing');
      }
    });
    if (calls !== 1) add('HISTORY_POSTING_SEAM_MISSING', source, `Expected one original posting(client, ...) call, observed ${calls}`);
  }
  return errors;
}

function sourceFiles(matrix) {
  const files = [];
  const read = directory => {
    for (const entry of readdirSync(path.join(root, directory), {withFileTypes: true})) {
      if (entry.isSymbolicLink()) throw Error(`SOURCE_SYMLINK_NOT_IN_SCOPE: ${directory}/${entry.name}`);
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) { if (!matrix.scope.excludedDirectories.includes(entry.name)) read(file); }
      else if (/\.(?:ts|tsx|mts|mjs)$/.test(entry.name) && !/\.(?:test|spec)\.[^.]+$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(file);
    }
  };
  matrix.scope.roots.forEach(read);
  files.push(...matrix.scope.files);
  return [...new Set(files)].sort();
}

export function checkMatrix(matrix, sources) {
  const errors = [], ports = new Set();
  for (const port of matrix.writePorts) {
    if (ports.has(port.file)) errors.push({file: port.file, code: 'DUPLICATE_WRITER'});
    ports.add(port.file);
    if (!matrix.modules[port.module] || !port.publicPorts.length || !port.transactionOwner.length) errors.push({file: port.file, code: 'INCOMPLETE_WRITE_OWNER'});
    const text = sources.get(port.file);
    if (text === undefined) { errors.push({file: port.file, code: 'WRITER_SOURCE_MISSING'}); continue; }
    const exported = new Set();
    walk(parse(port.file, text), node => {
      if (node.name && ts.isIdentifier(node.name) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) exported.add(node.name.text);
      if (ts.isVariableStatement(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const declaration of node.declarationList.declarations) if (ts.isIdentifier(declaration.name)) exported.add(declaration.name.text);
      }
    });
    for (const name of port.publicPorts) if (!exported.has(name)) errors.push({file: port.file, code: 'PUBLIC_WRITE_PORT_MISSING', detail: name});
    for (const table of port.tables) if (!matrix.tables[table]) errors.push({file: port.file, code: 'TABLE_OWNER_MISSING', detail: table});
  }
  for (const [table, owner] of Object.entries(matrix.tables)) {
    if (!matrix.modules[owner.module] || !owner.fact || !owner.writerAuthority) errors.push({file: matrixPath, code: 'INCOMPLETE_FACT_OWNER', detail: table});
    const writers = matrix.writePorts.filter(port => port.tables.includes(table)).map(port => port.file).sort();
    if (JSON.stringify(writers) !== JSON.stringify([...owner.allowedWriterPorts].sort())) errors.push({file: matrixPath, code: 'TABLE_PORT_REFERENCE_MISMATCH', detail: table});
  }
  for (const edge of [...matrix.adapterImportExceptions, ...matrix.sharedClientEdges, ...matrix.adapterHelperImports]) if (!edge.owner || !edge.reason || !sources.has(edge.from) || !sources.has(edge.to)) errors.push({file: matrixPath, code: 'INVALID_EXACT_EXCEPTION', detail: `${edge.from} -> ${edge.to}`});
  for (const [file, text] of sources) errors.push(...inspectSource(file, text, matrix));
  return errors;
}

export function runFixtures(matrix) {
  const fixtures = [
    ['domain imports domain', 'packages/domain/src/inventory.ts', "import {quantity} from './values.ts';", []],
    ['domain rejects PG', 'packages/domain/src/inventory.ts', "import {Pool} from 'pg';", ['DOMAIN_DEPENDENCY']],
    ['domain rejects dynamic HTTP', 'packages/domain/src/inventory.ts', "await import('../../../apps/api/src/input.ts');", ['DOMAIN_DEPENDENCY']],
    ['application rejects private adapter', 'packages/application/src/sales-service.ts', "export {PostgresSalesUnitOfWork} from '../../../adapters/postgres/src/sales-unit-of-work.ts';", ['APPLICATION_PRIVATE_ADAPTER']],
    ['HTTP rejects private SQL writer', 'apps/api/src/sales-http.ts', "import {PostgresSalesUnitOfWork} from '../../../adapters/postgres/src/sales-unit-of-work.ts';", ['HTTP_PRIVATE_ADAPTER']],
    ['exact historical PG policy adapter allowed', 'apps/api/src/history-revision-authorization.ts', "import {importedHistoryReadSql,importedHistoryTransferHallScopeSql} from '../../../adapters/postgres/src/imported-history-query-reader.ts';", []],
    ['ordinary handler cannot borrow policy adapter exception', 'apps/api/src/sales-http.ts', "import {importedHistoryReadSql} from '../../../adapters/postgres/src/imported-history-query-reader.ts';", ['HTTP_PRIVATE_ADAPTER']],
    ['policy adapter cannot select another SQL helper', 'apps/api/src/history-revision-authorization.ts', "import {PostgresImportedHistoryQueryReader} from '../../../adapters/postgres/src/imported-history-query-reader.ts';", ['HTTP_PRIVATE_ADAPTER']],
    ['policy consumer exact assembly allowed', 'apps/api/src/postgres-read-api.ts', "import {createSourceConfirmedHistoryRevisionAuthorization} from './history-revision-authorization.ts';", []],
    ['policy consumer new handler rejected', 'apps/api/src/sales-http.ts', "import {createSourceConfirmedHistoryRevisionAuthorization} from './history-revision-authorization.ts';", ['UNREGISTERED_POLICY_CONSUMER']],
    ['exact composition root allowed', 'apps/api/src/postgres-read-api.ts', "import {PostgresSalesUnitOfWork} from '../../../adapters/postgres/src/sales-unit-of-work.ts';", []],
    ['UI rejects PG', 'apps/web/demo-replica/frontend/runtime/view.ts', "import {Pool} from 'pg';", ['UI_PRIVATE_BACKEND']],
    ['known inventory borrowed write', 'adapters/postgres/src/inventory-posting-balances.ts', "await query('INSERT INTO naijue_erp.inventory_ledger(id) VALUES($1)');", []],
    ['unknown table rejects known writer', 'adapters/postgres/src/inventory-posting-balances.ts', "await query('UPDATE naijue_erp.user_account SET version=2');", ['UNOWNED_TABLE_WRITE']],
    ['new writer rejects owned table', 'adapters/postgres/src/unregistered.ts', "await client.query('INSERT INTO naijue_erp.inventory_ledger(id) VALUES($1)');", ['UNREGISTERED_WRITER']],
    ['borrowed leaf cannot commit', 'adapters/postgres/src/inventory-posting-balances.ts', "await query('COMMIT');", ['BORROWED_TRANSACTION_CONTROL']],
    ['borrowed leaf cannot acquire second lease', 'adapters/postgres/src/inventory-posting-balances.ts', 'await pool.connect();', ['BORROWED_SECOND_TRANSACTION']],
    ['borrowed leaf cannot create pool', 'adapters/postgres/src/inventory-posting-balances.ts', 'new Pool();', ['BORROWED_NEW_CONNECTION']],
    ['borrowed leaf cannot nest transaction', 'adapters/postgres/src/inventory-posting-balances.ts', 'await other.transaction(work);', ['BORROWED_SECOND_TRANSACTION']],
    ['cross-domain private writer rejected', 'adapters/postgres/src/auth-store.ts', "import {PostgresTransferUnitOfWork} from './transfer-unit-of-work.ts';", ['CROSS_MODULE_PRIVATE_WRITER']],
    ['unregistered adapter cannot acquire private writer', 'adapters/postgres/src/unregistered.ts', "import {PostgresSalesUnitOfWork} from './sales-unit-of-work.ts';", ['PRIVATE_WRITER_FROM_UNREGISTERED_MODULE']],
    ['registered pure read helper allowed', 'adapters/postgres/src/inventory-query-reader.ts', "import {decodeImportCheckpoint} from './inventory-cutoff-import-store.ts';", []],
    ['pure helper exception cannot select store', 'adapters/postgres/src/inventory-query-reader.ts', "import {PostgresCutoffImportStore} from './inventory-cutoff-import-store.ts';", ['PRIVATE_WRITER_FROM_UNREGISTERED_MODULE']],
    ['literal SQL comment/data inert', 'adapters/postgres/src/unregistered.ts', "const label = 'UPDATE';const sql=\"SELECT 'INSERT INTO naijue_erp.user_account' value\";", []],
    ['WITH mutation covered', 'adapters/postgres/src/unregistered.ts', "await query('WITH x AS (DELETE FROM naijue_erp.sales_line RETURNING id) SELECT * FROM x');", ['UNREGISTERED_WRITER']],
    ['unknown dynamic table rejected', 'adapters/postgres/src/inventory-posting-balances.ts', 'await query(`INSERT INTO naijue_erp.${unregistered} VALUES($1)`);', ['UNRESOLVED_WRITE_TARGET']],
    ['changed finite selector rejected', 'adapters/postgres/src/catalogue-maintenance-store.ts', "const table = () => 'user_account';await query(`UPDATE naijue_erp.${table(next.kind)} SET version=2`);", ['DYNAMIC_TABLE_SELECTOR_CHANGED']],
    ['exact HISTORY captured client', 'adapters/postgres/src/history-revision-store.ts', 'createPostgresHistoryRevisionPosting(runtime).post(client, context, effects);', []],
    ['HISTORY second client rejected', 'adapters/postgres/src/history-revision-store.ts', 'createPostgresHistoryRevisionPosting(runtime).post(otherClient, context, effects);', ['HISTORY_DIFFERENT_CLIENT']]
  ];
  for (const [name, file, source, expected] of fixtures) assert.deepEqual([...new Set(inspectSource(file, source, matrix).map(error => error.code))].sort(), [...expected].sort(), name);
  return fixtures.length;
}

function main() {
  if (process.argv.slice(2).some(arg => arg !== '--self-test') || process.argv.length > 3) throw Error('USAGE: node scripts/check-module-boundaries.mjs [--self-test]');
  const matrix = JSON.parse(readFileSync(path.join(root, matrixPath), 'utf8'));
  const fixtures = runFixtures(matrix);
  if (process.argv[2] === '--self-test') { console.log(JSON.stringify({fixtures, status: 'PASS_FIXTURES_ONLY'})); return; }
  const files = sourceFiles(matrix), sources = new Map(files.map(file => [file, readFileSync(path.join(root, file), 'utf8')]));
  const errors = checkMatrix(matrix, sources);
  console.log(JSON.stringify({taskId: 'H01FiniteOwnership879', status: errors.length ? 'FAIL' : 'PASS_SOURCE_BOUNDARIES', fixtures, files: files.length, writers: matrix.writePorts.length, tables: Object.keys(matrix.tables).length, errors,
    limitation: 'Static import/SQL-literal/registered-client seams only. No PostgreSQL or dynamic runtime atomicity claim; existing transaction tests remain required.'}, null, 2));
  process.exitCode = errors.length ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
