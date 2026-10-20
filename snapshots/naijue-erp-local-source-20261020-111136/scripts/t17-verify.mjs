import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {createHash, pbkdf2Sync, randomBytes, randomUUID} from 'node:crypto';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {join, isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import pgPackage from 'pg';
import {root, writeJson} from './files.mjs';
import {runDatabaseCommand} from '../server/database/cli.ts';
import {readDatabaseConfig, assertIsolatedTarget, databaseIdentifier as ident} from '../server/database/config.ts';
import {bootstrapAssertionSql} from '../server/database/identity.ts';
import {sqlLiteral as literal} from '../server/database/sql.ts';
import {createApp} from '../server/app.ts';
import {readConfig} from '../server/config.ts';
import {ActionSession} from '../server/database/session.ts';
import {readInventoryBalance} from '../server/domain/transactions/inventory.ts';
import {activateOpeningSnapshot, openingManifestDigest} from '../server/domain/transactions/opening.ts';

const pg = process.env.T17_PG_BIN;
if (!pg || !isAbsolute(pg)) throw new Error('T17_PG_BIN must explicitly select local PostgreSQL 17');
const out = join(root, 'outputs/T17'), logs = join(root, 'logs/T17');
mkdirSync(out, {recursive: true}); mkdirSync(logs, {recursive: true}); chmodSync(logs, 0o700);
const suite = mkdtempSync(join(logs, 'postgres-suite-'));
chmodSync(suite, 0o700);
const data = join(suite, 'data'), admin = 't17_bootstrap', port = '55493';
const socket = mkdtempSync(join(tmpdir(), 'naijue-t17-socket-'));
chmodSync(socket, 0o700);
assert.ok(Buffer.byteLength(join(socket, '.s.PGSQL.' + port)) < 104, 'Private PostgreSQL socket path exceeds platform limit');
assert.equal(existsSync(join(socket, '.s.PGSQL.' + port)), false, 'Never reuse an existing socket');
const checks = [], targets = [], result = {task_id: 'T17', status: 'RUNNING', suite, socket, checks,
  productionConnections: 0, existingBusinessConnections: 0, serverOperations: 0, realCredentialsUsed: false};
const originalPoolConnect = pgPackage.Pool.prototype.connect;
pgPackage.Pool.prototype.connect = function(...args) {
  const connected = originalPoolConnect.apply(this,args);
  if (args.length) return connected;
  return connected.then(client => {
    const query = client.query.bind(client);
    client.query = (...queryArgs) => query(...queryArgs).catch(error => {
      const state = error && typeof error === 'object' ? error.code ?? 'UNKNOWN' : 'UNKNOWN';
      const message = error && typeof error === 'object' ? error.message ?? 'database operation failed' : 'database operation failed';
      writeFileSync(join(suite,'server-error.log'),`${state} ${message}\n`,{flag:'a',mode:0o600});
      throw error;
    });
    return client;
  });
};
const checked = (name, details = {}) => {checks.push({name, status: 'PASS', ...details}); console.log('PASS: ' + name);};
function tool(name, args, file) {
  const run = spawnSync(join(pg, name), args, {encoding: 'utf8', env: {PATH: process.env.PATH, LANG: 'C', PGPASSFILE: '/dev/null'}, maxBuffer: 8 * 1024 * 1024});
  writeFileSync(join(suite, file), (run.stdout ?? '') + (run.stderr ?? ''), {mode: 0o600});
  assert.equal(run.status, 0, name + ' failed; see private T17 log ' + file);
  return run.stdout.trim();
}
const conn = database => ['-h', socket, '-p', port, '-U', admin, '-d', database];
function adminSql(config, statement) {
  assertIsolatedTarget(config);
  const run = spawnSync(join(pg, 'psql'), ['-X','-w','-qAt','-v','ON_ERROR_STOP=1',...conn(config.database)], {
    input: bootstrapAssertionSql(config, admin) + '\n' + statement, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    env: {PATH: process.env.PATH, PGPASSFILE: '/dev/null', PGOPTIONS: '-c search_path=pg_catalog -c timezone=UTC'}
  });
  if (run.status !== 0) {
    const diagnostic = (run.stderr ?? '').split(/\r?\n/).find(line => line.startsWith('ERROR:')) ?? 'psql exited unsuccessfully';
    writeFileSync(join(suite,'fixture-sql-errors.log'),diagnostic + '\n',{flag:'a',mode:0o600});
    throw new Error('Synthetic SQL assertion failed: ' + diagnostic);
  }
  return run.stdout.trim();
}
const adminValue = (config, statement) => JSON.parse(adminSql(config, statement));
async function maintenance(configEnv, command, file) {
  let captured = '';
  const oldLog = console.log;
  console.log = (...items) => {captured += items.join(' ') + '\n';};
  try {await runDatabaseCommand([command], configEnv);}
  finally {console.log = oldLog; writeFileSync(join(suite, file), captured, {mode: 0o600});}
  return JSON.parse(captured.trim());
}
const uid = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const warehouseIds = [uid(201),uid(202),uid(203)], productId = uid(101), skuId = uid(102), hallId = uid(301), baselineId = uid(401);
const digest = text => createHash('sha256').update(text).digest('hex');
const runSuffix = randomUUID().replaceAll('-','').slice(0,8);
const prefix = 't17qa_' + runSuffix;
const databaseName = 'demo_8877_t17_qa_' + runSuffix;
const environment = {
  APP_ENV: 'qa', APP_DATABASE_MODE: 'required', POSTGRES_HOST: socket, POSTGRES_PORT: port,
  POSTGRES_DB: databaseName, POSTGRES_USER: prefix + '_app', POSTGRES_ROLE_PREFIX: prefix,
  POSTGRES_SOURCE_SCHEMA: 't17_source', POSTGRES_RUNTIME_SCHEMA: 't17_runtime', POSTGRES_AUTH_SCHEMA: 't17_auth', POSTGRES_CONTROL_SCHEMA: 't17_control',
  POSTGRES_INSTANCE_ID: randomUUID(), POSTGRES_CLUSTER_ID: '', POSTGRES_BOOTSTRAP_USER: admin,
  PSQL_BIN: join(pg, 'psql'), SESSION_ORIGIN: 'https://t17.invalid', SESSION_SECRET_FILE: join(suite, 'synthetic-session.key'),
  MEDIA_STORAGE_ROOT: join(suite, 'media'),
};
let started = false, app = null, config = null;
const originalQuery = ActionSession.prototype.query;
ActionSession.prototype.query = async function(text, values) {
  try {return await originalQuery.call(this,text,values);}
  catch (error) {
    const state = error && typeof error === 'object' ? error.sqlState ?? 'UNKNOWN' : 'UNKNOWN';
    writeFileSync(join(suite,'failed-query.log'),`SQLSTATE ${state}\n${text}\n`,{flag:'a',mode:0o600});
    throw error;
  }
};
const accounts = {admin: {id: 't17-admin', name: 'Synthetic Admin', role: '管理员', operatorRole: 'ADMIN'},
  salesperson: {id: 't17-sales', name: 'Synthetic Sales', role: '营业员', operatorRole: 'SALESPERSON', hallId}};
const password = randomUUID() + '-synthetic-only';
function seed() {
  const s = ident(config.schemas.source), r = ident(config.schemas.runtime), a = ident(config.schemas.auth);
  adminSql(config, `SET ROLE ${ident(config.roles.source)};
    INSERT INTO ${s}.category(id,code,code_normalized,name) VALUES(${literal(productId)},'T17','T17','Synthetic category');
    INSERT INTO ${s}.unit(id,code,code_normalized,name,quantity_scale) VALUES(${literal(productId)},'T17','T17','件',4);
    INSERT INTO ${s}.product(id,code,code_normalized,name,category_id,unit_id) VALUES(${literal(productId)},'T17','T17','Synthetic product',${literal(productId)},${literal(productId)});
    INSERT INTO ${s}.variant(id,product_id,option_key) VALUES(${literal(skuId)},${literal(productId)},'T17-ONE');
    ${warehouseIds.map((id,index) => `INSERT INTO ${s}.warehouse(id,code,code_normalized,name,type,enabled) VALUES(${literal(id)},'T17-W${index}','T17-W${index}','Synthetic warehouse ${index}','WAREHOUSE',true);`).join('\n')}
    INSERT INTO ${s}.tplus_import_run(batch_id,space_key,schema_name,database_name,manifest_path,manifest_sha256,preflight_batch_id,importer_version,status,git_sha,workspace_state_sha256)
      VALUES('T17','SYNTHETIC',${literal(config.schemas.source)},${literal(config.database)},'SYNTHETIC-T17',repeat('0',64),'SYNTHETIC','T17-fixture','COMMITTED','SYNTHETIC',repeat('0',64));
    INSERT INTO ${s}.tplus_hall(batch_id,id,source_id,source_code,name,warehouse_ids,source_payload)
      VALUES('T17',${literal(hallId)},'T17-HALL','T17-HALL','Synthetic hall',ARRAY[${warehouseIds.map(id => literal(id) + '::uuid').join(',')}],'{}');
    INSERT INTO ${s}.tplus_inventory_balance_source(batch_id,source_id,variant_id,warehouse_id,quantity,unit,opening_quantity,cutoff_source_date,
      snapshot_used,apply_historical_documents_again,source_event_count,components,source_payload)
      VALUES('T17','T17-OPENING-1',${literal(skuId)},${literal(warehouseIds[0])},100,'件',100,'2026-10-01',true,false,0,'{"opening":"100"}','{"fixture":"T17"}');
    RESET ROLE;
    SET ROLE ${ident(config.roles.runtime)};
    INSERT INTO ${r}.operator(id,name,role,enabled) VALUES
      (${literal(accounts.admin.id)},${literal(accounts.admin.name)},'ADMIN',true),
      (${literal(accounts.salesperson.id)},${literal(accounts.salesperson.name)},'SALESPERSON',true);
    INSERT INTO ${r}.master_data_entity(kind,id,body,source_facts,version,updated_by)
      VALUES ${warehouseIds.map((id,index) => `('warehouses',${literal(id)},${literal(JSON.stringify({code:`T17-W${index}`,name:`Synthetic warehouse ${index}`,enabled:true,type:'WAREHOUSE',hallRelations:[hallId],sourceOwnershipUnknown:false}))}::jsonb,'{"fixture":"T17"}',1,'T17-fixture')`).join(',')};
    INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,active_effect_identity,active_effect_revision,current_revision,version,business_day)
      VALUES(${literal(baselineId)},'SALE','T17-HISTORY-1','APPROVED',true,true,'baseline:T17-HISTORY-1',1,1,1,'2026-10-01');
    INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id)
      VALUES(${literal(baselineId)},1,true,${literal(JSON.stringify(historicalSaleBody))}::jsonb,NULL);
    RESET ROLE;`);
  for (const account of Object.values(accounts)) {
    const salt = randomBytes(24).toString('hex');
    const hash = pbkdf2Sync(password,salt,210000,32,'sha256').toString('hex');
    const body = {name: account.name, role: account.role, employmentStatus: '在职', loginEnabled: true, loginName: account.id,
      enabled: true, ...(account.hallId ? {hallId: account.hallId, storeId: account.hallId} : {})};
    adminSql(config, `SET ROLE ${ident(config.roles.auth)};
      INSERT INTO ${a}.employee_login(id,login_name,body,password_salt,password_hash) VALUES(${literal(account.id)},${literal(account.id)},${literal(JSON.stringify(body))}::jsonb,${literal(salt)},${literal(hash)});
      RESET ROLE;`);
  }
}
const historicalSaleBody = {header: {business_date: '2026-10-01', hall_id: hallId, source_warehouse_id: warehouseIds[0]},
  lines: [{source_id: 'T17-HISTORY-LINE-1', sku_id: skuId, warehouse_id: warehouseIds[0], source_quantity: '2', stock_quantity_contribution: '-2'}], fundsRecords: []};
function transferBody(quantity) {
  return {header: {business_date: '2026-10-02', source_from_warehouse_id: warehouseIds[0], source_to_warehouse_id: warehouseIds[1]},
    lines: [{sku_id: skuId, from_warehouse_id: warehouseIds[0], to_warehouse_id: warehouseIds[1], source_quantity: String(quantity)}], fundsRecords: []};
}
function saleBody(quantity) {
  const amount = (Number(quantity) * 10).toFixed(2);
  return {header: {business_date: '2026-10-02', hall_id: hallId, source_warehouse_id: warehouseIds[0]},
    lines: [{source_id: 'T17-SALE-LINE-1', sku_id: skuId, warehouse_id: warehouseIds[0], source_quantity: String(quantity), unit_price: '10.00', amount}], fundsRecords: []};
}
async function login(name) {
  const response = await app.inject({method: 'POST', url: '/api/runtime/session',
    headers: {origin: environment.SESSION_ORIGIN, 'content-type': 'application/json'}, payload: {loginName: name, password}});
  assert.equal(response.statusCode, 200, 'Synthetic login failed');
  const data = response.json().data, cookieHeader = response.headers['set-cookie'];
  const cookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  assert.ok(cookie && typeof data?.csrfToken === 'string');
  return {cookie: cookie.split(';')[0], csrf: data.csrfToken};
}
async function command(session, input) {
  return app.inject({method: 'POST', url: '/api/runtime/command', headers: {origin: environment.SESSION_ORIGIN,
    'content-type': 'application/json', cookie: session.cookie, 'x-csrf-token': session.csrf, 'x-request-id': input.requestKey}, payload: input});
}
function success(response, label) {
  assert.equal(response.statusCode, 200, label + ' failed: ' + response.body);
  const result = response.json(); assert.equal(result.ok, true, label); return result.data;
}
function fingerprint(config) {
  const r = ident(config.schemas.runtime), a = ident(config.schemas.auth);
  const relationRows = [
    ['documents', `${r}.document`], ['revisions', `${r}.revision`], ['versionHistory', `${r}.version_history`],
    ['postings', `${r}.posting`], ['movements', `${r}.movement`], ['inventoryDelta', `${r}.inventory_delta`],
    ['idempotency', `${r}.idempotency_request`], ['openingRuns', `${r}.inventory_opening_run`],
    ['openingCells', `${r}.inventory_opening_cell`], ['openingCheckpoints', `${r}.inventory_opening_delta_checkpoint`],
    ['openingPostings', `${r}.inventory_opening_prior_posting`], ['openingDocuments', `${r}.inventory_opening_prior_document`],
    ['sessions', `${a}.employee_session`],
  ];
  const fields = relationRows.map(([name, table]) => `${literal(name)},coalesce((SELECT jsonb_agg(to_jsonb(row_data) ORDER BY to_jsonb(row_data)::text) FROM (SELECT t.* FROM ${table} t) row_data),'[]'::jsonb)`).join(',');
  return adminValue(config, `SELECT jsonb_build_object(${fields})`);
}
async function balance(warehouseId) {
  return app.dataAccess.read(session => readInventoryBalance(session,ident(config.schemas.runtime),warehouseId,skuId));
}

try {
  assert.match(tool('postgres',['--version'],'version.log'),/PostgreSQL\) 17\./);
  tool('initdb',['-D',data,'-U',admin,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C','--wal-segsize=1','--set','min_wal_size=2MB','--set','max_wal_size=8MB'],'initdb.log');
  const wal = 'min_wal_size=2MB -c max_wal_size=8MB';
  tool('pg_ctl',['-D',data,'-l',join(suite,'postgres.log'),'-o',`-c listen_addresses='' -c ${wal} -c unix_socket_permissions=0700 -c unix_socket_directories=${socket} -p ${port}`,'-w','start'],'start.log'); started = true;
  const cluster = JSON.parse(tool('psql',['-X','-w','-qAt',...conn('postgres'),'-c',"SELECT jsonb_build_object('clusterId',system_identifier::text,'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses')) FROM pg_control_system()"],'identity.log'));
  assert.equal(cluster.dataDirectory,data); assert.equal(cluster.listenAddresses,'');
  environment.POSTGRES_CLUSTER_ID = cluster.clusterId; result.cluster = cluster;
  checked('Fresh PostgreSQL 17 QA fixture uses a private socket with TCP disabled');
  tool('createdb',['-h',socket,'-p',port,'-U',admin,'-T','template0',databaseName],'qa-create.log');
  writeFileSync(environment.SESSION_SECRET_FILE,randomBytes(48),{mode:0o600}); chmodSync(environment.SESSION_SECRET_FILE,0o600);
  config = readDatabaseConfig(environment); assertIsolatedTarget(config); targets.push({environment:'qa',database:config.database,instanceId:config.instanceId});
  const bootstrapResult = await maintenance(environment,'bootstrap','qa-bootstrap.log');
  assert.equal(bootstrapResult.bootstrapped,true);
  const migrationResult = await maintenance(environment,'migrate','qa-migrate.log');
  assert.equal(migrationResult.versions.at(-1).id,'0004_transaction_core');
  checked('Explicit bootstrap and four versioned migrations include immutable opening coverage');
  seed();
  app = createApp(readConfig(environment));
  app.addHook('onError', async (_request, _reply, error) => {
    const value = error && typeof error === 'object' ? error : {};
    const entry = {name: value.name ?? null, code: value.code ?? null, sqlState: value.sqlState ?? null};
    writeFileSync(join(suite,'application-error-codes.json'),JSON.stringify(entry) + '\n',{flag:'a',mode:0o600});
  });
  const adminSession = await login(accounts.admin.id), salespersonSession = await login(accounts.salesperson.id);

  const beforeDraft = await balance(warehouseIds[0]);
  const transferId = randomUUID(), createRequest = {documentId:transferId,documentType:'TRANSFER',operation:'create',expectedVersion:0,requestKey:'T17-create-' + randomUUID(),body:transferBody(4)};
  const created = success(await command(adminSession,createRequest),'create transfer');
  assert.equal(created.document.status,'UNAUDITED');
  const createRetry = success(await command(adminSession,createRequest),'idempotent create retry');
  assert.deepEqual(createRetry,created);
  const savedBody = transferBody(6), saveRequest = {documentId:transferId,documentType:'TRANSFER',operation:'save',expectedVersion:1,requestKey:'T17-save-' + randomUUID(),body:savedBody};
  const saved = success(await command(adminSession,saveRequest),'save transfer draft');
  assert.equal(saved.document.version,2); assert.equal(await balance(warehouseIds[0]),beforeDraft);
  assert.equal(adminValue(config,`SELECT count(*) FROM ${ident(config.schemas.runtime)}.posting WHERE document_id=${literal(transferId)}::uuid`),0);
  checked('Create, save, and exact retry preserve draft status and do not post inventory');

  const approveRequest = {documentId:transferId,documentType:'TRANSFER',operation:'approve',expectedVersion:2,requestKey:'T17-approve-' + randomUUID(),body:savedBody};
  const approved = success(await command(adminSession,approveRequest),'approve transfer');
  assert.equal(approved.document.status,'APPROVED'); assert.equal(approved.document.version,3);
  assert.equal(await balance(warehouseIds[0]),'94.0000'); assert.equal(await balance(warehouseIds[1]),'6.0000');
  assert.deepEqual(success(await command(adminSession,approveRequest),'idempotent approval retry'),approved);
  const conflictRequest = {...approveRequest,body:transferBody(7)};
  const conflictBefore = fingerprint(config), conflict = await command(adminSession,conflictRequest), conflictAfter = fingerprint(config);
  assert.equal(conflict.statusCode,409); assert.equal(conflict.json().error.code,'IDEMPOTENCY_CONFLICT'); assert.deepEqual(conflictAfter,conflictBefore);
  const stale = await command(adminSession,{...saveRequest,expectedVersion:2,requestKey:'T17-stale-' + randomUUID()});
  assert.equal(stale.statusCode,409); assert.equal(stale.json().error.code,'VERSION_CONFLICT');
  const unapproved = success(await command(adminSession,{documentId:transferId,documentType:'TRANSFER',operation:'unapprove',expectedVersion:3,requestKey:'T17-unapprove-' + randomUUID()}),'unapprove transfer');
  assert.equal(unapproved.document.status,'UNAUDITED'); assert.equal(await balance(warehouseIds[0]),beforeDraft); assert.equal(await balance(warehouseIds[1]),'0.0000');
  checked('Approval posts once; replay, changed-payload conflict, stale version, and reversal preserve exact balances');

  const failingTransferId = randomUUID(), failingCreate = {documentId:failingTransferId,documentType:'TRANSFER',operation:'create',expectedVersion:0,requestKey:'T17-fail-create-' + randomUUID(),body:transferBody(1)};
  success(await command(adminSession,failingCreate),'create failure probe transfer');
  const failedApprove = {documentId:failingTransferId,documentType:'TRANSFER',operation:'approve',expectedVersion:1,requestKey:'T17-fail-approve-' + randomUUID(),body:transferBody(1)};
  const r = ident(config.schemas.runtime);
  adminSql(config,`CREATE FUNCTION ${r}.t17_reject_movement() RETURNS trigger LANGUAGE plpgsql AS $t17$ BEGIN RAISE EXCEPTION 'T17_INJECTED_MOVEMENT_FAILURE'; END $t17$;
    CREATE TRIGGER t17_reject_movement BEFORE INSERT ON ${r}.movement FOR EACH ROW EXECUTE FUNCTION ${r}.t17_reject_movement();`);
  const failureBefore = fingerprint(config), failed = await command(adminSession,failedApprove), failureAfter = fingerprint(config);
  assert.equal(failed.statusCode,409); assert.equal(failed.json().error.code,'ROLLED_BACK'); assert.deepEqual(failureAfter,failureBefore);
  adminSql(config,`DROP TRIGGER t17_reject_movement ON ${r}.movement; DROP FUNCTION ${r}.t17_reject_movement();`);
  success(await command(adminSession,failedApprove),'retry after injected failure');
  const failUnapprove = success(await command(adminSession,{documentId:failingTransferId,documentType:'TRANSFER',operation:'unapprove',expectedVersion:2,requestKey:'T17-fail-unapprove-' + randomUUID()}),'reverse failure probe transfer');
  assert.equal(failUnapprove.document.status,'UNAUDITED');
  checked('Movement failure rolls back document, posting, projection, history, and idempotency before same-key retry');

  const expectedCells = warehouseIds.map((warehouseId,index) => ({warehouseId,skuId,quantity:index === 0 ? '100.0000' : '0.0000',unit:'件',
    sourceCell:`T17!A${index + 1}`,sourceRecord:{fixture:'T17',row:index + 1}}));
  const covered = [{documentId:baselineId,revision:1,effectIdentity:'baseline:T17-HISTORY-1'}];
  const basePlan = {revision:'T17-OPENING-1',businessDay:'2026-10-01',sourceSha256:digest('synthetic:T17:source'),sourceFile:'SYNTHETIC:T17:opening.csv',
    rulesSha256:digest('synthetic:T17:rules'),standardPackSha256:digest('synthetic:T17:standard-pack'),expectedActiveRevision:null,
    expectedCellCount:expectedCells.length,expectedCoveredBaselineDocumentCount:covered.length,manifestSha256:'',issues:[],cells:expectedCells,coveredBaselineDocuments:covered};
  const plan = {...basePlan,manifestSha256:openingManifestDigest(basePlan)};
  const openResult = await app.dataAccess.transaction(session => activateOpeningSnapshot(session,{runtime:ident(config.schemas.runtime),source:ident(config.schemas.source)},plan));
  assert.deepEqual(openResult,{applied:true,revision:plan.revision,cells:3,coveredBaselineDocuments:1});
  assert.equal(await balance(warehouseIds[0]),'100.0000'); assert.equal(await balance(warehouseIds[1]),'0.0000');
  const retryOpen = await app.dataAccess.transaction(session => activateOpeningSnapshot(session,{runtime:ident(config.schemas.runtime),source:ident(config.schemas.source)},plan));
  assert.deepEqual(retryOpen,{applied:false,revision:plan.revision,cells:3,coveredBaselineDocuments:1});
  const priorPostings = adminValue(config,`SELECT count(*) FROM ${r}.inventory_opening_prior_posting WHERE run_id=${literal(plan.revision)}`);
  assert.equal(priorPostings,4);
  checked('Complete synthetic opening activates once, checkpoints prior postings, and preserves the exact 100-unit basis');

  const denialBefore = fingerprint(config);
  const denied = await command(salespersonSession,{documentId:baselineId,documentType:'SALE',operation:'unapprove',expectedVersion:1,requestKey:'T17-denied-unapprove-' + randomUUID()});
  const denialAfter = fingerprint(config);
  assert.equal(denied.statusCode,403); assert.equal(denied.json().error.code,'FORBIDDEN'); assert.deepEqual(denialAfter,denialBefore);
  writeJson(join(suite,'permission-denial.json'),{statusCode:denied.statusCode,code:denied.json().error.code,databaseUnchanged:true});
  checked('Salesperson cannot unapprove a historical sale and the denial leaves business tables unchanged');

  const historicalUnapprove = {documentId:baselineId,documentType:'SALE',operation:'unapprove',expectedVersion:1,requestKey:'T17-history-unapprove-' + randomUUID()};
  const baselineReversal = success(await command(adminSession,historicalUnapprove),'reverse opening-covered historical effect');
  assert.equal(baselineReversal.document.baselineWasIncluded,true); assert.equal(await balance(warehouseIds[0]),'102.0000');
  assert.deepEqual(success(await command(adminSession,historicalUnapprove),'idempotent historical reversal retry'),baselineReversal);
  const revisedBody = saleBody(3);
  const revised = success(await command(adminSession,{documentId:baselineId,documentType:'SALE',operation:'save',expectedVersion:2,requestKey:'T17-history-save-' + randomUUID(),body:revisedBody}),'save historical correction');
  assert.equal(revised.document.currentRevision,2); assert.equal(revised.document.baselineWasIncluded,true);
  const rereviewed = success(await command(adminSession,{documentId:baselineId,documentType:'SALE',operation:'approve',expectedVersion:3,requestKey:'T17-history-reapprove-' + randomUUID(),body:revisedBody}),'approve post-cutover revision');
  assert.equal(rereviewed.document.currentRevision,3); assert.equal(rereviewed.document.baselineWasIncluded,true);
  assert.equal(await balance(warehouseIds[0]),'99.0000');
  const historyProof = adminValue(config,`SELECT jsonb_build_object('baselineIncluded',baseline_was_included,'active',current_effect_active,
    'activeRevision',active_effect_revision,'baselineContribution',r.body->'lines'->0->>'stock_quantity_contribution',
    'coveredDocuments',(SELECT count(*) FROM ${r}.inventory_opening_prior_document WHERE run_id=${literal(plan.revision)} AND document_id=${literal(baselineId)}::uuid),
    'postingCount',(SELECT count(*) FROM ${r}.posting WHERE document_id=${literal(baselineId)}::uuid))
    FROM ${r}.document d JOIN ${r}.revision r ON r.document_id=d.id AND r.revision=1 WHERE d.id=${literal(baselineId)}::uuid`);
  assert.equal(historyProof.baselineIncluded,true); assert.equal(historyProof.active,true); assert.equal(historyProof.activeRevision,3);
  assert.equal(historyProof.baselineContribution,'-2'); assert.equal(historyProof.coveredDocuments,1); assert.equal(historyProof.postingCount,2);
  checked('Covered historical reversal uses its immutable -2 contribution; post-cutover -3 revision yields 100 → 102 → 99');

  const inspection = await maintenance(environment,'inspect','qa-inspect.log');
  assert.equal(inspection.versions.length,4); assert.equal(inspection.identity.environment,'qa');
  const proof = {task_id:'T17',status:'PASS',checks,syntheticDatabase:databaseName,clusterId:cluster.clusterId,
    postgresVersion:'17',listenAddresses:'',productionConnections:0,existingBusinessConnections:0,serverOperations:0,realCredentialsUsed:false,
    transferOpeningBalance:'100.0000',transferApprovedOut:'94.0000',transferApprovedIn:'6.0000',historicalAfterUnapprove:'102.0000',historicalAfterReapproval:'99.0000',
    migrationVersions:inspection.versions.map(({id,checksum}) => ({id,checksum})),permissionDenialUnchanged:true,
    injectedFailureUnchanged:true,openingRetryCreatedDuplicate:false,clusterStopped:false};
  result.status = 'PASS'; result.verification = proof; result.completedAt = new Date().toISOString();
  writeJson(join(suite,'RESULT.json'),result); writeJson(join(out,'database-verification.json'),proof);
} catch (error) {
  result.status = 'FAIL'; result.failure = error instanceof Error ? error.message : 'T17_VERIFY_FAILED'; result.completedAt = new Date().toISOString();
  writeJson(join(suite,'RESULT.json'),result); throw error;
} finally {
  if (app) await app.close().catch(() => {});
  if (started) {
    const stop = spawnSync(join(pg,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C'},maxBuffer:1024*1024});
    writeFileSync(join(suite,'stop.log'),(stop.stdout ?? '')+(stop.stderr ?? ''),{mode:0o600});
    result.clusterStopped = stop.status === 0;
    if (result.verification) {
      result.verification.clusterStopped = stop.status === 0;
      writeJson(join(out,'database-verification.json'),result.verification);
    }
    writeJson(join(suite,'RESULT.json'),result);
    if (stop.status !== 0) throw new Error('T17_PRIVATE_POSTGRESQL_STOP_FAILED');
  }
}
