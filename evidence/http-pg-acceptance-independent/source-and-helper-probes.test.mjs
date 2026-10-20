/** Independent source/static/fabricated-helper review only.
 * Never imports the actual acceptance helper, pg, any driver or network module.
 * Helper fault probes erase TypeScript from the final source's small private functions
 * and supply fabricated in-memory objects. They are NOT HTTP or PostgreSQL acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { MIGRATIONS } from '../../tests/integration/migration-manifest.ts';

const http = readFileSync('tests/integration/http-read-acceptance.ts', 'utf8');
const syntax = ts.createSourceFile('http-read-acceptance.ts', http, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
function nodes(predicate) {
  const result = [];
  function visit(node) { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); }
  visit(syntax); return result;
}
function erased(source) {
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.None } }).outputText;
}
function jsonHelper() {
  const node = nodes(node => ts.isFunctionDeclaration(node) && node.name?.text === 'json')[0];
  assert.ok(node, 'safe response parser exists');
  return runInNewContext(`${erased(node.getText(syntax))}; json`, {}, { timeout: 1000 });
}
function cleanupHelper(owned) {
  const node = nodes(node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'closeOwned')[0];
  assert.ok(node?.initializer, 'cleanup helper exists');
  return runInNewContext(`${erased(`const closeOwned = ${node.initializer.getText(syntax)};`)}; closeOwned`, { owned }, { timeout: 1000 });
}

test('SOURCE ONLY: real composition is imported and both construction calls omit the driver-double argument', () => {
  const constructors = nodes(node => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'createPostgresReadApi');
  assert.equal(constructors.length, 2);
  assert.ok(constructors.every(node => node.arguments.length === 1));
  assert.match(http, /import \{ createPostgresReadApi \} from "\.\.\/\.\.\/apps\/api\/src\/postgres-read-api\.ts"/);
  const pgImport = syntax.statements.find(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === 'pg');
  assert.equal(pgImport?.importClause?.isTypeOnly, true);
  const composition = readFileSync('apps/api/src/postgres-read-api.ts', 'utf8');
  assert.match(composition, /store: new PostgresAuthenticationStore\(pool\)/);
  assert.match(composition, /passwords: createNodeScryptPasswords\(\)/);
  assert.match(composition, /const pool = new BoundedPostgresPool\(options.postgres, createDriver\)/);
  assert.match(readFileSync('adapters/postgres/src/bounded-pool.ts', 'utf8'), /createDriver: PostgresPoolDriverFactory = options => new Pool\(options\)/);
});

test('SOURCE ONLY: explicit validated target, bounded fresh synthetic identity, and no credential output/listener/reset seam', () => {
  assert.match(http, /host: settings\.host, port: settings\.port, database: settings\.database, user: settings\.user,\s*password: settings\.password, ssl: false/);
  assert.match(http, /max: 2, maxPendingAcquisitions: 4/);
  assert.match(http, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(http, /createNodeScryptPasswords\(\)\.hash\(password\)/);
  assert.match(http, /syntheticId\("account", 4700\), staffId = syntheticId\("staff", 4701\)/);
  assert.doesNotMatch(http, /process\.env|DATABASE_URL|new Pool|createDriver|\.listen\(|console\.|writeFile|appendFile|toMatchSnapshot|DROP DATABASE|DROP SCHEMA|TRUNCATE|DISABLE TRIGGER/);
  assert.doesNotMatch(http, /UPDATE naijue_erp\.(?:user_account|staff)|DELETE FROM/);
  assert.match(http, /Synthetic HTTP account setup failed; database detail omitted/);
});

test('SOURCE ONLY: gates, original backend/sparse helpers, fixture source and all migration bytes unchanged from c48eba1', () => {
  const files = ['tests/integration/safety.ts', 'tests/integration/database.ts', 'scripts/run-postgres-integration.mjs',
    'tests/integration/backend-acceptance.ts', 'tests/integration/sparse-acceptance.ts', 'tests/integration/fixtures.ts',
    ...MIGRATIONS.map(([, filename]) => `adapters/postgres/migrations/${filename}`)];
  for (const file of files) {
    const baseline = execFileSync('git', ['show', `c48eba1:${file}`]);
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), createHash('sha256').update(baseline).digest('hex'), file);
  }
  assert.equal(MIGRATIONS.length, 8);
  for (const [, filename, expected] of MIGRATIONS) assert.equal(createHash('sha256').update(readFileSync(`adapters/postgres/migrations/${filename}`)).digest('hex'), expected, filename);
});

test('SOURCE ONLY: backend dispatch follows current-suite/fresh-target gates, sparse remains separate, default discovery remains pure', () => {
  const entry = readFileSync('tests/integration/postgres.integration.test.ts', 'utf8');
  assert.ok(entry.indexOf('requireCurrentIntegrationSuite(suite)') < entry.indexOf('await openFreshDatabase(settings'));
  assert.match(entry, /if \(suite === "backend-0001-0008"\) \{\s*await runBackendAcceptance\(t, pool\);\s*await runHttpReadAcceptance\(t, pool, settings\);\s*\}\s*else await runSparseAcceptance\(t, pool\);/);
  const script = JSON.parse(readFileSync('package.json', 'utf8')).scripts.test;
  assert.equal(script.split(/\s+/).filter(value => value === 'tests/integration/backend-source.test.ts').length, 1);
  assert.doesNotMatch(script, /postgres\.integration\.test|http-read-acceptance|tests\/integration\/\*|run-postgres-integration/);
});

test('SOURCE ONLY: failed login prerequisite cannot pass through; fixed policies reject unknown identity and preserve transfer role', () => {
  assert.match(http, /let authorizationCalls = 0, loginVerified = false/);
  assert.equal((http.match(/loginVerified = true/g) ?? []).length, 1);
  assert.match(http, /assert\.equal\(stored, 1\); assert\.equal\(authorizationCalls, 0\);\s*password = "";\s*loginVerified = true;/);
  assert.match(http, /if \(!loginVerified \|\| !api \|\| !cookie\)/);
  assert.match(http, /actor\.accountId !== accountId \|\| actor\.hallId !== ids\.hall/);
  assert.match(http, /actor\.role !== "SALESPERSON"/);
  assert.match(http, /NOT a production provider/);
  assert.match(http, /roleHallScopes: \{ SALESPERSON: "REQUIRED_HALL" \}/);
});

test('SOURCE ONLY: all native read routes and logout/session/revocation/owned-resource checks are represented', () => {
  for (const route of ['/inventory/query', '/inventory/candidates/query', '/inventory/ledger/query', '/sales/query', '/sales/references/query',
    '/sales/detail/query', '/sales/history/query', '/sales/settlement-statistics/query', '/transfers/query', '/transfers/warehouses/query',
    '/transfers/detail/query', '/products/basics/query', '/products/specifications/query', '/products/images/query', '/products/image/query',
    '/auth/login', '/auth/session', '/auth/logout']) assert.ok(http.includes(`"${route}"`), route);
  assert.match(http, /await closeOwned\(\); await closeOwned\(\)/);
  assert.match(http, /all API-owned actual PostgreSQL connections are closed/);
  assert.match(http, /revoked session cannot reach any read policy/);
  assert.match(http, /rejected cross-origin logout cannot revoke session/);
  assert.match(http, /spoofed authentication must not reach business policy/);
  assert.equal(nodes(node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'json').length, 0);
  assert.equal(nodes(node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(syntax) === 'JSON' && node.expression.name.text === 'parse').length, 1);
});

test('FABRICATED HELPER ONLY: exact source JSON wrapper suppresses parser excerpts and preserves successful parsed data', () => {
  const json = jsonHelper(), marker = 'SYNTHETIC_REVIEW_FAILURE_MARKER_NOT_A_CREDENTIAL';
  assert.equal(json({ body: '{"principal":null}' }).principal, null);
  let failure;
  try { json({ body: marker }); } catch (error) { failure = error; }
  assert.equal(failure?.message, 'Synthetic HTTP response was not valid JSON; response detail omitted');
  assert.equal(failure?.cause, undefined);
  assert.ok(!String(failure?.stack).includes(marker));
  assert.ok(!JSON.stringify(failure).includes(marker));
});

test('FABRICATED HELPER ONLY: exact source cleanup drains async rejection and emits only fixed diagnostics', async () => {
  const calls = [], marker = 'SYNTHETIC_REVIEW_FAILURE_MARKER_NOT_A_CREDENTIAL';
  const close = cleanupHelper([
    { async close() { calls.push(1); throw new Error(marker); } },
    { async close() { await Promise.resolve(); calls.push(2); } },
    { async close() { calls.push(3); } }
  ]);
  let failure; try { await close(); } catch (error) { failure = error; }
  assert.deepEqual(calls.sort(), [1, 2, 3]);
  assert.equal(failure?.message, 'Synthetic HTTP API cleanup failed; provider detail omitted');
  assert.equal(failure?.cause, undefined); assert.ok(!String(failure?.stack).includes(marker));
});

test('FABRICATED HELPER ONLY: exact source cleanup also contains a synchronous throw before closing remaining APIs', async () => {
  const calls = [];
  const close = cleanupHelper([
    { close() { calls.push(1); throw new Error('SYNTHETIC_REVIEW_SYNC_FAILURE'); } },
    { async close() { calls.push(2); } }
  ]);
  let failure; try { await close(); } catch (error) { failure = error; }
  assert.deepEqual(calls, [1, 2]);
  assert.equal(failure?.message, 'Synthetic HTTP API cleanup failed; provider detail omitted');
});


test('SOURCE ONLY: bounded fixed14-table business digests compare values without dumping rows or auth material', () => {
  const tables = JSON.parse(http.match(/for \(const table of (\[[\s\S]*?\]) as const\)/)[1]);
  assert.deepEqual(tables, ['sales_header', 'sales_line', 'sales_settlement', 'transfer_header', 'transfer_line', 'inventory_balance',
    'inventory_ledger', 'operation_receipt', 'audit_change', 'product', 'sku', 'product_image', 'import_batch', 'import_record']);
  assert.match(http, /jsonb_agg\(to_jsonb\(facts\) ORDER BY to_jsonb\(facts\)::text\)/);
  assert.match(http, /ok\(after\.length === before\.length && after\.every\(\(digest, index\) => digest === before\[index\]\)/);
  assert.doesNotMatch(http, /assert\.(?:equal|deepEqual)\((?:before|after|password|cookie|tokenHash|setCookie|login\.body)/);
});

function disconnectHelper(read) {
  const node = nodes(node => ts.isFunctionDeclaration(node) && node.name?.text === 'assertApiDisconnected')[0];
  assert.ok(node, 'disconnect observation helper exists');
  let elapsed = 0, delays = 0;
  const observe = runInNewContext(`${erased(node.getText(syntax))}; assertApiDisconnected`, {
    apiConnections: read, assert,
    performance: { now: () => elapsed },
    delay: async milliseconds => { assert.equal(milliseconds, 25); elapsed += milliseconds; delays++; }
  }, { timeout: 1000 });
  return { observe, state: () => ({ elapsed, delays }) };
}

test('SOURCE ONLY: terminal disconnect observation is finite, read-only, and does not catch/retry failed queries or closes', () => {
  const node = nodes(node => ts.isFunctionDeclaration(node) && node.name?.text === 'assertApiDisconnected')[0];
  const text = node.getText(syntax);
  assert.match(text, /const deadline = performance\.now\(\) \+ 3000/);
  assert.match(text, /while \(remaining !== 0 && performance\.now\(\) < deadline\)/);
  assert.match(text, /await delay\(25\)/);
  assert.doesNotMatch(text, /catch|close\(|\.query\(|\.end\(|INSERT|UPDATE|DELETE/);
  assert.match(http, /await closeOwned\(\); await closeOwned\(\);\s*await assertApiDisconnected\(pool\)/);
});

test('FABRICATED HELPER ONLY: exact disconnect observer waits for a delayed zero and then stops', async () => {
  let calls = 0; const values = [2, 1, 0];
  const { observe, state } = disconnectHelper(async () => values[calls++]);
  await observe({}); assert.equal(calls, 3); assert.deepEqual(state(), { elapsed: 50, delays: 2 });
});

test('FABRICATED HELPER ONLY: exact disconnect observer fails, rather than passing, at its finite deadline', async () => {
  let calls = 0;
  const { observe, state } = disconnectHelper(async () => { calls++; return 1; });
  await assert.rejects(observe({}), error => error.code === 'ERR_ASSERTION' && error.actual === 1 && error.expected === 0);
  assert.equal(state().elapsed, 3000); assert.equal(state().delays, 120); assert.equal(calls, 121);
});

test('FABRICATED HELPER ONLY: exact disconnect observer propagates a failed observation without retry', async () => {
  let calls = 0; const failure = new Error('SYNTHETIC_REVIEW_OBSERVATION_FAILURE');
  const { observe, state } = disconnectHelper(async () => { calls++; throw failure; });
  await assert.rejects(observe({}), error => error === failure);
  assert.equal(calls, 1); assert.equal(state().delays, 0);
});
