/** Independent source and FABRICATED HELPER checks only. No actual PG, HTTP suite, credentials, network or driver import.
 * Small functions are read from final source, type-erased only in memory, and supplied synthetic objects.
 * These results must never be relabeled actual policy/HTTP/PG acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { MIGRATIONS, BACKEND_SCENARIOS, HTTP_READ_SCENARIOS, NATIVE_POLICY_SCENARIOS, SPARSE_SCENARIOS } from '../../../tests/integration/migration-manifest.ts';
import { ids, syntheticId, salesDraft } from '../../../tests/integration/fixtures.ts';
import { createSourceAuthenticationPolicy } from '../../../packages/authentication/src/source-policy.ts';

const source = readFileSync('tests/integration/native-http-read-acceptance.ts', 'utf8');
const syntax = ts.createSourceFile('native-http-read-acceptance.ts', source, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
function nodes(predicate) { const out=[]; function visit(node) { if(predicate(node)) out.push(node); ts.forEachChild(node,visit); } visit(syntax); return out; }
function erased(text) { return ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText; }
function declaration(name) { const node=nodes(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name)[0]; assert.ok(node, `${name} source declaration`); return node.getText(syntax); }
function helper(name,context={}) { return runInNewContext(`${erased(declaration(name))}; ${name}`,context,{timeout:1000}); }
const safeOk=(condition,message)=>assert.equal(condition,true,message);

const originalFiles=['tests/integration/http-read-acceptance.ts','tests/integration/backend-acceptance.ts','tests/integration/sparse-acceptance.ts',
  'tests/integration/safety.ts','tests/integration/database.ts','tests/integration/fixtures.ts','scripts/run-postgres-integration.mjs',
  ...MIGRATIONS.map(([,file])=>`adapters/postgres/migrations/${file}`)];

test('SOURCE ONLY: original16 helper/gate/sparse/fixture/runner/migration bytes remain unchanged',()=>{
  for(const file of originalFiles) assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),
    createHash('sha256').update(execFileSync('git',['show',`d24dc43:${file}`])).digest('hex'),file);
  assert.equal(MIGRATIONS.length,8);
  for(const [,file,expected] of MIGRATIONS) assert.equal(createHash('sha256').update(readFileSync(`adapters/postgres/migrations/${file}`)).digest('hex'),expected,file);
});

test('SOURCE ONLY: exact new native profile uses actual factory default driver and canonical source-auth policy, not explicit read grants',()=>{
  const calls=nodes(n=>ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='createPostgresReadApi');
  assert.equal(calls.length,1); assert.equal(calls[0].arguments.length,1);
  assert.equal(calls[0].arguments[0].getText(syntax),'nativeOptions(settings)');
  assert.match(declaration('nativeOptions'),/authorization: \{ mode: "source-confirmed-native" \}/);
  assert.match(declaration('nativeOptions'),/policy: createSourceAuthenticationPolicy\(900\)/);
  assert.doesNotMatch(declaration('nativeOptions'),/authorize|kind: "all"|clauses|warehouses:/);
  assert.match(readFileSync('apps/api/src/postgres-read-api.ts','utf8'),/createSourceConfirmedPostgresReadAuthorization\(pool\), transfers: createSourceConfirmedTransferQueryAuthorization\(\)/);
  assert.match(readFileSync('adapters/postgres/src/bounded-pool.ts','utf8'),/createDriver: PostgresPoolDriverFactory = options => new Pool\(options\)/);
});

test('FABRICATED CONFIG ONLY: native options preserve explicit bounded validated target and exact closed profile',()=>{
  const settings={host:'127.0.0.1',port:55432,database:'naijue_erp_test_a1b2c3d4',user:'naijue_erp_test',password:'SYNTHETIC_NOT_A_REAL_CREDENTIAL'};
  const options=helper('nativeOptions',{ORIGIN:'https://synthetic-native-profile.invalid',SYNTHETIC_TIME:'2026-10-20T12:00:00.000Z',createSourceAuthenticationPolicy})(settings);
  assert.equal(Object.keys(options.authorization).length,1); assert.equal(options.authorization.mode,'source-confirmed-native');
  safeOk(Object.keys(settings).every(k=>options.postgres.target[k]===settings[k]),'exact settings copied without printing credential-bearing config');
  assert.equal(options.postgres.target.ssl,false); assert.equal(options.postgres.max,2); assert.equal(options.postgres.maxPendingAcquisitions,4);
  assert.equal(options.authentication.policy.activeEmploymentStatuses[0],'在职');
  assert.equal(options.authentication.policy.roleHallScopes.ADMIN,'OPTIONAL_HALL');
  assert.equal(options.authentication.policy.roleHallScopes.WAREHOUSE,'OPTIONAL_HALL');
  assert.equal(options.authentication.policy.roleHallScopes.SALESPERSON,'REQUIRED_HALL');
});

test('SOURCE/FABRICATED DATA ONLY: four generated in-memory canonical identities are distinct and passwords are never compared or emitted directly',()=>{
  const make=helper('fixtures',{ids,syntheticId,randomBytes}); const values=make();
  assert.equal(values.length,4); assert.deepEqual(Array.from(values,v=>v.role),['SALESPERSON','SALESPERSON','ADMIN','WAREHOUSE']);
  assert.deepEqual(Array.from(values,v=>v.hallId),[ids.hall,ids.otherHall,null,null]);
  assert.equal(new Set(values.map(v=>v.accountId)).size,4); assert.equal(new Set(values.map(v=>v.staffId)).size,4);
  safeOk(values.every(v=>/^[A-Za-z0-9_-]{43}$/.test(v.password)&&v.cookie===''),'fresh bounded opaque passwords exist only in memory');
  safeOk(new Set(values.map(v=>v.password)).size===4,'independent credentials');
  assert.match(declaration('seedAccounts'),/passwords\.hash\(fixture\.password\)/);
  assert.match(declaration('seedAccounts'),/'在职'/);
  assert.match(declaration('seedAccounts'),/VALUES\(\$1,\$2,\$3,\$4,true,1,1,\$5,\$5\)/);
  for(const value of values){ value.password='';value.cookie=''; }
});

test('SOURCE/DATA ONLY: actual command services produce discriminating A125 B250 approved fixtures without creator-field forgery',()=>{
  const setup=declaration('seedSales');
  assert.match(setup,/new PostgresSalesUnitOfWork\(pool\)/); assert.match(setup,/createSalesService\(/);
  assert.match(setup,/action: "SAVE"/); assert.match(setup,/action: "APPROVE"/);
  assert.match(setup,/context\.accountId === fact!\.fixture\.accountId/);
  assert.match(setup,/created_by_account_id === fixture\.accountId && row\.created_hall_id === fixture\.hallId/);
  const one=salesDraft(6100,{quantities:['1']}),two=salesDraft(6101,{quantities:['2']});
  assert.equal(one.header.netDue,125n); assert.equal(two.header.netDue,250n);
  assert.doesNotMatch(source,/UPDATE naijue_erp\.(?:sales_header|transfer_header|import_record|import_batch)|SET[^;\n]*created_hall_id|INSERT INTO naijue_erp\.inventory_balance/);
  assert.match(declaration('seedTransfers'),/new PostgresTransferUnitOfWork\(pool\)/);
  assert.match(declaration('seedTransfers'),/references: createSourceConfirmedTransferReferences\(\)/);
  assert.match(declaration('seedTransfers'),/fromWarehouseId: ids\.toWarehouse, toWarehouseId: thirdWarehouseId/);
  assert.match(declaration('seedTransfers'),/created_by_account_id === foreign\.accountId/);
});

test('SOURCE ONLY: separate six appended groups retain original16 and explicit guarded backend enum/sparse/default discovery',()=>{
  const entry=readFileSync('tests/integration/postgres.integration.test.ts','utf8');
  assert.ok(entry.indexOf('requireCurrentIntegrationSuite(suite)')<entry.indexOf('await openFreshDatabase(settings'));
  assert.match(entry,/await runBackendAcceptance\(t, pool\);\s*await runHttpReadAcceptance\(t, pool, settings\);\s*await runNativeHttpReadAcceptance\(t, pool, settings\);/);
  assert.match(entry,/else await runSparseAcceptance\(t, pool\)/);
  assert.equal(BACKEND_SCENARIOS.length+HTTP_READ_SCENARIOS.length+2,16);
  assert.equal(NATIVE_POLICY_SCENARIOS.length,6); assert.equal(BACKEND_SCENARIOS.length+HTTP_READ_SCENARIOS.length+NATIVE_POLICY_SCENARIOS.length+2,22);
  assert.equal((source.match(/await t\.test\(NATIVE_POLICY_SCENARIOS\[/g)||[]).length,6);
  const testScript=JSON.parse(readFileSync('package.json','utf8')).scripts.test;
  assert.doesNotMatch(testScript,/native-http-read-acceptance|postgres\.integration\.test|tests\/integration\/\*|run-postgres-integration/);
  assert.equal(testScript.split(/\s+/).filter(v=>v==='tests/integration/backend-source.test.ts').length,1);
  assert.ok(SPARSE_SCENARIOS.length>0);
});

test('SOURCE ONLY: genuine visible/hidden and nonzero aggregate assertions discriminate current-hall from privileged all scope',()=>{
  assert.match(source,/statistics\.received === \(fixture === own \? "125" : fixture === foreign \? "250" : "375"\)/);
  assert.match(source,/page\.exactTotal === \(restricted \? "1" : "2"\)/);
  assert.match(source,/\[\[own, foreignSalesId\], \[foreign, ownSalesId\]\]/);
  assert.match(source,/page\.exactTotal === \(fixture === own \? "0" : "1"\)/);
  assert.match(source,/native sales references exclude actual foreign-hall facts/);
  assert.match(source,/request foreign-hall filter never expands native grant/);
  assert.match(source,/canonical own-endpoint branch remains visible independently of the B-only fixture/);
});

test('SOURCE ONLY: complete all-warehouse phase precedes late B warehouse; later inventory must fail real readiness rather than fake publication',()=>{
  const inventoryAt=source.indexOf('await t.test(NATIVE_POLICY_SCENARIOS[2]');
  const transferAt=source.indexOf('await t.test(NATIVE_POLICY_SCENARIOS[3]');
  assert.ok(inventoryAt>0&&transferAt>inventoryAt);
  assert.ok(source.indexOf('await seedTransfers(pool, foreign)',transferAt)>transferAt);
  const phase=source.slice(inventoryAt,transferAt);
  assert.ok(phase.indexOf('SET enabled=false')<phase.indexOf('const before = await snapshot(pool)'));
  assert.match(phase,/warehouseLabels\.length === 2/); assert.match(phase,/allMatchesTotal\.knownQuantity === "4"/);
  assert.match(phase,/disabled historical warehouse rows/); assert.match(phase,/finally/);
  const later=source.slice(transferAt);
  assert.match(later,/assert\.equal\(notReady\.statusCode, 503\)/); assert.match(later,/error\.code === "INVENTORY_NOT_READY"/);
  assert.doesNotMatch(source,/INSERT INTO naijue_erp\.(?:import_record|import_batch)|IMPORT_PUBLISH|IMPORT_CHUNK/);
});

test('SOURCE ONLY: stale captured actor is separate genuine-PG adapter evidence, not public HTTP race or fake grants',()=>{
  const start=source.indexOf('await t.test(NATIVE_POLICY_SCENARIOS[4]'),end=source.indexOf('await t.test(NATIVE_POLICY_SCENARIOS[5]');
  const phase=source.slice(start,end);
  const capture=phase.indexOf('Object.freeze(actor(own))'),mutation=phase.indexOf('await fixtureSql(');
  assert.ok(capture>=0&&capture<mutation);
  assert.match(phase,/createSourceConfirmedPostgresReadAuthorization\(pool\)/);
  for(const family of ['sales','inventory','products']) assert.ok(phase.includes(`policies.${family}.authorize(stale`));
  assert.match(phase,/SUPPLEMENTAL ADAPTER CASE ONLY/); assert.match(phase,/not public HTTP race coverage/);
  assert.match(phase,/error\.code === "FORBIDDEN"/);
  assert.match(phase,/login_enabled=false/); assert.match(phase,/SYNTHETIC_NOT_ACTIVE/); assert.match(phase,/SYNTHETIC_UNKNOWN/);
});

test('SOURCE ONLY: safe bounded snapshots exclude authentication data and assertion arguments never dump credential-bearing objects',()=>{
  const snap=declaration('snapshot'),tables=JSON.parse(snap.match(/for \(const table of (\[[\s\S]*?\]) as const\)/)[1]);
  assert.equal(tables.length,16); assert.ok(!tables.some(v=>/account|staff|session|password/.test(v)));
  assert.match(snap,/jsonb_agg\(to_jsonb\(facts\) ORDER BY to_jsonb\(facts\)::text\)/);
  assert.match(declaration('unchanged'),/after\.every\(\(digest, index\) => digest === before\[index\]\)/);
  assert.doesNotMatch(source,/assert\.(?:equal|deepEqual)\((?:accounts|fixture\.password|fixture\.cookie|settings|header|response\.body|before|after)/);
  assert.doesNotMatch(source,/process\.env|DATABASE_URL|new Pool|createDriver|\.listen\(|console\.|writeFile|appendFile|DROP DATABASE|DROP SCHEMA|TRUNCATE|DISABLE TRIGGER/);
  assert.equal(nodes(n=>ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='json').length,0);
});

test('FABRICATED HELPER ONLY: exact source response parser omits unexpected malformed-body excerpt/cause',()=>{
  const parse=helper('json'),marker='SYNTHETIC_NATIVE_REVIEW_MARKER_NOT_A_CREDENTIAL';
  assert.equal(parse({body:'{"principal":null}'}).principal,null);
  let failure;try{parse({body:marker});}catch(error){failure=error;}
  assert.equal(failure?.message,'Native-profile response JSON was unavailable; response detail omitted');
  assert.equal(failure?.cause,undefined);safeOk(!String(failure?.stack).includes(marker),'parser excerpt omitted');
});

test('FABRICATED HELPER ONLY: exact fixture SQL wrapper omits arbitrary failing-row/driver text',async()=>{
  const execute=helper('fixtureSql'),marker='SYNTHETIC_NATIVE_REVIEW_MARKER_NOT_A_CREDENTIAL';
  let failure;try{await execute({async query(){throw Object.assign(new Error(marker),{detail:marker});}},'SYNTHETIC NO DATABASE',[]);}catch(error){failure=error;}
  assert.equal(failure?.message,'Native synthetic fixture maintenance failed; database detail omitted');
  assert.equal(failure?.cause,undefined);safeOk(!String(failure?.stack).includes(marker),'driver detail omitted');
});

test('FABRICATED HELPER ONLY: exact account-setup catch rolls back/discards and never retains a fake hash-bearing driver error',async()=>{
  const marker='SYNTHETIC_NATIVE_REVIEW_FAKE_HASH',calls=[];let released=0,discarded=false;
  const client={async query(sql){calls.push(sql);if(sql.includes('INSERT INTO naijue_erp.user_account'))throw Object.assign(new Error(marker),{detail:marker});},release(value){released++;discarded=value===true;}};
  const seed=helper('seedAccounts',{createNodeScryptPasswords:()=>({async hash(){return marker;}}),SYNTHETIC_TIME:'2026-10-20T12:00:00.000Z'});
  let failure;try{await seed({async connect(){return client;}},[{password:'SYNTHETIC_NOT_A_REAL_PASSWORD',staffId:'s',accountId:'a',login:'l',label:'SYNTHETIC',hallId:null,role:'ADMIN'}]);}catch(error){failure=error;}
  assert.equal(failure?.message,'Native synthetic account setup failed; database detail omitted');
  assert.equal(failure?.cause,undefined);safeOk(!String(failure?.stack).includes(marker),'fake hash omitted');
  safeOk(calls.includes('ROLLBACK')&&!calls.includes('COMMIT'),'known setup failure rolls back');assert.equal(released,1);assert.equal(discarded,true);
});

function disconnectHelper(read){let elapsed=0,delays=0;const observe=helper('disconnected',{apiConnections:read,assert,performance:{now:()=>elapsed},delay:async ms=>{assert.equal(ms,25);elapsed+=ms;delays++;}});return{observe,state:()=>({elapsed,delays})};}
test('FABRICATED HELPER ONLY: exact owned-backend observer waits for zero, then stops',async()=>{let calls=0;const values=[2,1,0],{observe,state}=disconnectHelper(async()=>values[calls++]);await observe({});assert.equal(calls,3);assert.deepEqual(state(),{elapsed:50,delays:2});});
test('FABRICATED HELPER ONLY: exact owned-backend observer fails at deadline instead of inventing success',async()=>{let calls=0;const{observe,state}=disconnectHelper(async()=>{calls++;return 1;});await assert.rejects(observe({}),e=>e.code==='ERR_ASSERTION'&&e.actual===1&&e.expected===0);assert.equal(state().elapsed,3000);assert.equal(calls,121);});
test('FABRICATED HELPER ONLY: failed observation is not retried',async()=>{let calls=0;const failure=new Error('SYNTHETIC_REVIEW_QUERY_FAILURE'),{observe,state}=disconnectHelper(async()=>{calls++;throw failure;});await assert.rejects(observe({}),e=>e===failure);assert.equal(calls,1);assert.equal(state().delays,0);});

test('SOURCE ONLY: disabled historical B references remain readable only by still-valid A/null-hall principals; B-assigned identity is rejected',()=>{
  const phase=source.slice(source.indexOf('await t.test(NATIVE_POLICY_SCENARIOS[2]'),source.indexOf('await t.test(NATIVE_POLICY_SCENARIOS[3]'));
  assert.match(phase,/for \(const fixture of \[own, admin, warehouse\]\)/);
  assert.match(phase,/post\(foreign, "\/products\/basics\/query", \{ productId: ids\.product \}\)\)\.statusCode, 401/);
  assert.match(phase,/disabled own hall rejects current HTTP identity/);
  assert.match(phase,/finally[\s\S]*UPDATE naijue_erp\.hall SET enabled=true/);
  const native=readFileSync('adapters/postgres/src/source-confirmed-read-authorization.ts','utf8');
  assert.match(native,/row\.hall_enabled !== true/);
  assert.match(native,/row\.employment_status !== "在职"/);
});

test('SOURCE ONLY: successful setup is explicit, identity-maintenance interval has restoration-only label, and every role logout blocks all families',()=>{
  assert.match(source,/let api: PostgresReadApi \| undefined, ready = false/);
  assert.match(source,/if \(!ready \|\| !api\)/);
  assert.equal((source.match(/ready = true/g)||[]).length,1);
  assert.match(source,/not a write-free interval claim/);
  assert.match(source,/controlled identity maintenance restores the original current authenticated fixture/);
  const phase=source.slice(source.indexOf('await t.test(NATIVE_POLICY_SCENARIOS[5]'));
  for(const route of ['/sales/query','/inventory/query','/transfers/query','/products/basics/query']) assert.ok(phase.includes(`"${route}"`));
  assert.match(phase,/for \(const fixture of accounts\)/);
  assert.match(phase,/WHERE account_id=ANY\(\$1::uuid\[\]\) AND revoked_at IS NOT NULL/);
  assert.match(phase,/rows\[0\]\?\.count, 4/);
  assert.doesNotMatch(phase,/SELECT[^;]*token_hash|SELECT[^;]*password_hash/);
});

test('FABRICATED HELPER ONLY: exact owned-API close sanitizes rejection and remains single-owner cleanup',async()=>{
  const node=nodes(n=>ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.name.text==='close')[0];
  assert.ok(node?.initializer);let calls=0;const marker='SYNTHETIC_NATIVE_REVIEW_CLEANUP_FAILURE';
  const close=runInNewContext(`${erased(`const close=${node.initializer.getText(syntax)};`)};close`,{api:{async close(){calls++;throw new Error(marker);}}},{timeout:1000});
  let failure;try{await close();}catch(error){failure=error;}
  assert.equal(calls,1);assert.equal(failure?.message,'Native-profile API cleanup failed; provider detail omitted');
  assert.equal(failure?.cause,undefined);safeOk(!String(failure?.stack).includes(marker),'cleanup provider detail omitted');
});
