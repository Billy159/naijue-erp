import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

export const cfg = JSON.parse(await readFile(new URL('./TARGET.json', import.meta.url), 'utf8'));
const require = createRequire(join(cfg.modules, '__d3_sql_core_transport__.cjs'));
const {Client} = require('pg');
const source = name => import(pathToFileURL(join(cfg.sourceRoot, name)));
const d3 = name => import(pathToFileURL(join(cfg.d3Source, name)));
export const {normal} = await import(pathToFileURL(join(cfg.parent12, 'derive155.mjs')));
export const {NODE_SCRYPT_DUMMY_HASH: encodedScrypt} = await source('packages/authentication/src/passwords.ts');
export const {createBatchedStreamSqlKernel} = await d3('batched-stream-sql-kernel.mjs');
export const {executeBatchedStreamImport} = await d3('batched-stream-client.mjs');
export const {reconcileWholePackage} = await source('tools/unified-import/whole-package-reconcile.mjs');
const sha = value => createHash('sha256').update(value).digest('hex');

export async function connect(user = cfg.controller) {
  const raw = new Client({host: cfg.workRoot, port: cfg.socketPort, database: cfg.database, user, password: '',
    ssl: false, connectionTimeoutMillis: 5000, statement_timeout: 40000, query_timeout: 42000,
    application_name: 'd3-batched-sql-core-only'});
  await raw.connect();
  let closed = false, closeError;
  return {raw, async query(sql, values) { return raw.query(sql, values); },
    async discard() {
      if(closeError)throw closeError;
      if(!closed){try{await raw.end();closed=true;}catch(error){closeError=error;throw error;}}
    }};
}

export async function checkCatalog(client, expectedFile, expectedCount) {
  const model = JSON.parse(await readFile(expectedFile, 'utf8'));
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query('SET LOCAL search_path=pg_catalog');
    const actual = (await client.query(`SELECT n.nspname||'.'||p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')' AS signature,
      encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS "bodySha256",
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS "definitionSha256",
      pg_get_userbyid(p.proowner) AS owner,
      (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(p.proacl) a) AS acl
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='naijue_erp' ORDER BY 1`)).rows;
    assert.equal(actual.length, expectedCount, 'exact installed function cohort');
    const expected = new Map(model.routines.map(row => [normal(row.signature), row]));
    assert.equal(expected.size, expectedCount);
    for (const row of actual) {
      const want = expected.get(normal(row.signature));
      assert.ok(want, 'unexpected installed signature');
      for(const key of ['bodySha256','definitionSha256','owner'])if(row[key]!==want[key]){
        throw Object.assign(Error('CATALOG_ROUTINE_MISMATCH'),{code:'CATALOG_ROUTINE_MISMATCH',catalogSignature:normal(row.signature),catalogField:key});
      }
      assert.deepEqual(row.acl?.toSorted() ?? null, want.acl?.toSorted() ?? null, 'installed routine ACL');
    }
    const tables = (await client.query(`SELECT c.relname AS name,pg_get_userbyid(c.relowner) AS owner,
      c.relrowsecurity AS "rowSecurity",c.relforcerowsecurity AS "forceRowSecurity",
      (SELECT count(*)::integer FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS "columnCount"
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp' AND c.relkind IN('r','p') ORDER BY c.relname`)).rows;
    assert.equal(tables.length, 35);
    assert.deepEqual(tables, model.tables.map(({schema, ...row}) => row).toSorted((a,b) => a.name.localeCompare(b.name)));
    const inventory = (await client.query(`SELECT
      (SELECT count(*)::integer FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace='naijue_erp'::regnamespace AND c.relkind IN('r','p') AND a.attnum>0 AND NOT a.attisdropped) AS columns,
      (SELECT count(*)::integer FROM pg_indexes WHERE schemaname='naijue_erp') AS indexes,
      (SELECT count(*)::integer FROM pg_constraint WHERE connamespace='naijue_erp'::regnamespace) AS constraints,
      (SELECT count(*)::integer FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='naijue_erp'::regnamespace) AS triggers`)).rows[0];
    for (const key of ['columns', 'indexes', 'constraints', 'triggers']) assert.equal(inventory[key], model[key].length, 'installed inventory ' + key);
    await client.query('ROLLBACK');
    return {functions: actual.length, tables: tables.length, ...inventory,
      routineDefinitionsAndOwnerAclMatched: true, fullPhysicalProductionAdmission: false};
  } catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
}

export async function compileFixture(observer, work) {
  const physical = (await observer.query(`SELECT current_database() AS database_name,
    (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid,
    (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
    encode(sha256(convert_to((SELECT string_agg(pg_get_functiondef(p.oid),E'\n' ORDER BY p.oid)
      FROM pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace),'UTF8')),'hex') AS catalog_sha256`)).rows[0];
  assert.equal(physical.database_name, cfg.database);
  const target = {protocol: 'STANDARD_IMPORT_SQL_V1', ...physical};
  const fixture = JSON.parse(await readFile(join(cfg.fixtureRoot, 'fixture.json'), 'utf8'));
  const pkg = join(cfg.fixtureRoot, 'package');
  const manifestBytes = await readFile(join(pkg, 'manifest.json'));
  assert.equal(sha(manifestBytes), cfg.fixtureManifestSha256);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.package_kind, 'SYNTHETIC');
  assert.equal(fixture.expected.rows, 162);
  const {readExplicitZeroCliApproval} = await source('tools/unified-import/explicit-zero-cli-input.mjs');
  const {closeExplicitZeroApproval} = await source('packages/application/src/unified-explicit-zero-approval.ts');
  const scope = fixture.evidence.scope;
  const approval = await readExplicitZeroCliApproval(pkg, manifest, join(cfg.fixtureRoot, 'approvals', scope.relative_path), scope.sha256);
  let sourcePlan;
  try {
    const report = join(work, 'preflight');
    const {streamPreflight} = await source('tools/unified-import/stream-preflight.mjs');
    const summary = await streamPreflight(pkg, report, {expectedManifestSha256: cfg.fixtureManifestSha256,
      allowSynthetic: true, explicitZeroApproval: approval});
    assert.equal(summary.checks_passed, true);
    assert.equal(summary.complete_package_validation, true);
    assert.equal(summary.import_eligible, false);
    const {prepareStreamPlan} = await source('tools/unified-import/stream-plan.mjs');
    sourcePlan = await prepareStreamPlan(join(report,'index.sqlite'), summary, manifestBytes,
      {target, initialization_identity: fixture.admin, allowSynthetic: true, explicitZeroApproval: approval});
    const {buildStreamProgram} = await d3('stream-program.mjs');
    const program = await buildStreamProgram(sourcePlan, join(report,'index.sqlite'), summary, fixture.admin, {coalesce: false, batched: true});
    const {prepareBatchedStreamPlan, openBatchedStreamPlan} = await d3('batched-stream-plan.mjs');
    const path = join(work, 'batched-plan.sqlite');
    await prepareBatchedStreamPlan(path, program, {summary: {counts: summary.counts}, totals: sourcePlan.totals});
    const plan = await openBatchedStreamPlan(path, program.identity);
    return {plan, initialize: program.initialize, identity: {...program.identity, rootOperationId: program.initialize.operation_id},
      sourceCounts: summary.counts, sourceTotals: sourcePlan.totals, target};
  } finally { await sourcePlan?.dispose(); closeExplicitZeroApproval(approval); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const parent = process.argv[2] === 'parent155';
  const client = await connect(cfg.bootstrap);
  try {
    const result = await checkCatalog(client, parent ? join(cfg.parent12,'MODEL155.json')
      : join(cfg.candidate02,'EXPECTED161-MODEL.json'), parent ? 155 : 161);
    process.stdout.write(JSON.stringify({stage: parent ? 'PARENT155' : 'INSTALLED161', ...result})+'\n');
  } catch (error) { process.stdout.write(JSON.stringify({stage:'CATALOG_FAILURE', errorType:error.name, code:error.code??null,catalogSignature:error.catalogSignature,catalogField:error.catalogField})+'\n');process.exitCode=1; }
  finally { await client.discard(); }
}
