import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {createHash, pbkdf2Sync, randomBytes, randomUUID} from 'node:crypto';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {join, isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import pgPackage from 'pg';
import vm from 'node:vm';
import {readFileSync,cpSync} from 'node:fs';
import {transferLines,inventoryCells} from '../frontend/transfer-contract.mjs';
import {root, writeJson,fileRecords} from './files.mjs';
import {runDatabaseCommand} from '../server/database/cli.ts';
import {loadMigrations} from '../server/database/migrations.ts';
import {readDatabaseConfig, assertIsolatedTarget, databaseIdentifier as ident} from '../server/database/config.ts';
import {bootstrapAssertionSql} from '../server/database/identity.ts';
import {sqlLiteral as literal} from '../server/database/sql.ts';
import {pathToFileURL} from 'node:url';
import {exerciseTransferBridge} from './t20-bridge-harness.mjs';
import {verifyTransferHallVisibility,prepareTransferSnapshotUpgrade} from './t20-hall-checks.mjs';
import {verifyRequestResultScope} from './t20-request-result-checks.mjs';
import {verifyDisabledSkuTransfer} from './t20-disabled-sku-checks.mjs';
import {readConfig} from '../server/config.ts';
import {ActionSession} from '../server/database/session.ts';
import {formatScaled,parseScaled} from '../server/domain/transactions/decimal.ts';
import {readInventoryBalance} from '../server/domain/transactions/inventory.ts';

const pg = process.env.T20_PG_BIN;
if (!pg || !isAbsolute(pg)) throw new Error('T20_PG_BIN must explicitly select local PostgreSQL 17');
const evidenceRun=process.env.T20_EVIDENCE_RUN;
if(evidenceRun!==undefined&&!/^[a-z0-9][a-z0-9-]{0,63}$/.test(evidenceRun))throw new Error('Invalid T20 evidence run');
const out = join(root, 'outputs/T20',evidenceRun??''), logs = join(root, 'logs/T20',evidenceRun??'');
mkdirSync(out, {recursive: true}); mkdirSync(logs, {recursive: true}); chmodSync(logs, 0o700);
const suite = mkdtempSync(join(logs, 'postgres-suite-'));
chmodSync(suite, 0o700);
const compiled=join(suite,'compiled');
const compilation=spawnSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'-p',join(root,'tsconfig.json'),'--outDir',compiled],{encoding:'utf8'});
writeFileSync(join(suite,'typecheck-snapshot.log'),(compilation.stdout??'')+(compilation.stderr??''));assert.equal(compilation.status,0,'Private strict backend compilation failed');
cpSync(join(root,'server/database/sql'),join(compiled,'database/sql'),{recursive:true});
const {createApp}=await import(pathToFileURL(join(compiled,'app.js')).href);
const data = join(suite, 'data'), admin = 't20_bootstrap', port = '55496';
const socket = mkdtempSync(join(tmpdir(), 'naijue-t20-socket-'));
chmodSync(socket, 0o700);
assert.ok(Buffer.byteLength(join(socket, '.s.PGSQL.' + port)) < 104, 'Private PostgreSQL socket path exceeds platform limit');
assert.equal(existsSync(join(socket, '.s.PGSQL.' + port)), false, 'Never reuse an existing socket');
const checks = [], targets = [], result = {task_id: 'T20', status: 'RUNNING', suite, socket, checks,
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
  assert.equal(run.status, 0, name + ' failed; see private T20 log ' + file);
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
const warehouseIds = [uid(201),uid(202),uid(203)], remoteWarehouseIds=[uid(204),uid(205)], productId = uid(101), skuId = uid(102), hallId = uid(301), otherHallId=uid(302), baselineId = uid(401);
const digest = text => createHash('sha256').update(text).digest('hex');
const runSuffix = randomUUID().replaceAll('-','').slice(0,8);
const prefix = 't20qa_' + runSuffix;
const databaseName = 'demo_8877_t20_qa_' + runSuffix;
const environment = {
  APP_ENV: 'qa', APP_DATABASE_MODE: 'required', POSTGRES_HOST: socket, POSTGRES_PORT: port,
  POSTGRES_DB: databaseName, POSTGRES_USER: prefix + '_app', POSTGRES_ROLE_PREFIX: prefix,
  POSTGRES_SOURCE_SCHEMA: 't20_source', POSTGRES_RUNTIME_SCHEMA: 't20_runtime', POSTGRES_AUTH_SCHEMA: 't20_auth', POSTGRES_CONTROL_SCHEMA: 't20_control',
  POSTGRES_INSTANCE_ID: randomUUID(), POSTGRES_CLUSTER_ID: '', POSTGRES_BOOTSTRAP_USER: admin,
  PSQL_BIN: join(pg, 'psql'), SESSION_ORIGIN: 'https://t20.invalid', SESSION_SECRET_FILE: join(suite, 'synthetic-session.key'),
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
const accounts = {admin: {id: 't20-admin', name: 'Synthetic Admin', role: '管理员', operatorRole: 'ADMIN'},
  warehouse: {id:'t20-warehouse',name:'Synthetic Warehouse',role:'仓库人员',operatorRole:'WAREHOUSE'},
  salesperson: {id: 't20-sales', name: 'Synthetic Sales', role: '营业员', operatorRole: 'SALESPERSON', hallId},
  salespersonPeer: {id:'t20-sales-peer',name:'Synthetic Sales Peer',role:'营业员',operatorRole:'SALESPERSON',hallId},
  otherSalesperson: {id:'t20-sales-other',name:'Synthetic Other Hall Sales',role:'营业员',operatorRole:'SALESPERSON',hallId:otherHallId}};
const password = randomUUID() + '-synthetic-only';
function seed() {
  const s = ident(config.schemas.source), r = ident(config.schemas.runtime), a = ident(config.schemas.auth);
  adminSql(config, `SET ROLE ${ident(config.roles.source)};
    INSERT INTO ${s}.category(id,code,code_normalized,name) VALUES(${literal(productId)},'T20','T20','Synthetic category');
    INSERT INTO ${s}.unit(id,code,code_normalized,name,quantity_scale) VALUES(${literal(productId)},'T20','T20','件',4);
    INSERT INTO ${s}.product(id,code,code_normalized,name,category_id,unit_id) VALUES(${literal(productId)},'T20','T20','Synthetic product',${literal(productId)},${literal(productId)});
    INSERT INTO ${s}.variant(id,product_id,option_key) VALUES(${literal(skuId)},${literal(productId)},'T20-ONE');
    ${[...warehouseIds,...remoteWarehouseIds].map((id,index) => `INSERT INTO ${s}.warehouse(id,code,code_normalized,name,type,enabled) VALUES(${literal(id)},'T20-W${index}','T20-W${index}','Synthetic warehouse ${index}','WAREHOUSE',true);`).join('\n')}
    INSERT INTO ${s}.tplus_import_run(batch_id,space_key,schema_name,database_name,manifest_path,manifest_sha256,preflight_batch_id,importer_version,status,git_sha,workspace_state_sha256)
      VALUES('T20','SYNTHETIC',${literal(config.schemas.source)},${literal(config.database)},'SYNTHETIC-T20',repeat('0',64),'SYNTHETIC','T20-fixture','COMMITTED','SYNTHETIC',repeat('0',64));
    INSERT INTO ${s}.tplus_hall(batch_id,id,source_id,source_code,name,warehouse_ids,source_payload)
      VALUES('T20',${literal(hallId)},'T20-HALL','T20-HALL','Synthetic hall',ARRAY[${warehouseIds.map(id => literal(id) + '::uuid').join(',')}],'{}');
    INSERT INTO ${s}.tplus_hall(batch_id,id,source_id,source_code,name,warehouse_ids,source_payload)
      VALUES('T20',${literal(otherHallId)},'T20-OTHER-HALL','T20-OTHER-HALL','Synthetic other hall',ARRAY[${[warehouseIds[2],...remoteWarehouseIds].map(id=>literal(id)+'::uuid').join(',')}],'{}');
    INSERT INTO ${s}.tplus_inventory_balance_source(batch_id,source_id,variant_id,warehouse_id,quantity,unit,opening_quantity,cutoff_source_date,
      snapshot_used,apply_historical_documents_again,source_event_count,components,source_payload)
      VALUES('T20','T20-OPENING-1',${literal(skuId)},${literal(warehouseIds[0])},100,'件',100,'2026-10-01',true,false,0,'{"opening":"100"}','{"fixture":"T20"}');
    RESET ROLE;
    SET ROLE ${ident(config.roles.runtime)};
    INSERT INTO ${r}.operator(id,name,role,enabled) VALUES
      ${Object.values(accounts).map(account=>`(${literal(account.id)},${literal(account.name)},${literal(account.operatorRole)},true)`).join(',')};
    INSERT INTO ${r}.master_data_entity(kind,id,body,source_facts,version,updated_by)
      VALUES ${[...warehouseIds,...remoteWarehouseIds].map((id,index) => `('warehouses',${literal(id)},${literal(JSON.stringify({code:`T20-W${index}`,name:`Synthetic warehouse ${index}`,enabled:true,type:'WAREHOUSE',hallRelations:index===2?[hallId,otherHallId]:index>=3?[otherHallId]:[hallId],sourceOwnershipUnknown:false}))}::jsonb,'{"fixture":"T20"}',1,'T20-fixture')`).join(',')};
    INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,active_effect_identity,active_effect_revision,current_revision,version,business_day)
      VALUES(${literal(baselineId)},'SALE','T20-HISTORY-1','APPROVED',true,true,'baseline:T20-HISTORY-1',1,1,1,'2026-10-01');
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
  lines: [{source_id: 'T20-HISTORY-LINE-1', sku_id: skuId, warehouse_id: warehouseIds[0], source_quantity: '2', stock_quantity_contribution: '-2'}], fundsRecords: []};
function transferBody(quantity) {
  return {header: {business_date: '2026-10-02', source_from_warehouse_id: warehouseIds[0], source_to_warehouse_id: warehouseIds[1]},
    lines: [{sku_id: skuId, from_warehouse_id: warehouseIds[0], to_warehouse_id: warehouseIds[1], source_quantity: String(quantity)}], fundsRecords: []};
}
function transferBetween(from,to) {
  const body=transferBody(1);
  body.header.source_from_warehouse_id=from;body.header.source_to_warehouse_id=to;
  body.lines[0].from_warehouse_id=from;body.lines[0].to_warehouse_id=to;
  return body;
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
async function balance(warehouseId) {
  return formatScaled(parseScaled(await app.dataAccess.read(session => readInventoryBalance(session,ident(config.schemas.runtime),warehouseId,skuId)),4),4);
}

const samples={},policy=JSON.parse(readFileSync(join(root,'references/frozen-baseline/data-cleaning/inventory-cutover-policy.json'),'utf8'));
const correctedSku=policy.transferSupplementDecisions.correctedLine.newSkuId,oldSku=policy.transferSupplementDecisions.correctedLine.oldSkuId;
const historyIds=[uid(128),uid(157),uid(158)],doubleSku=uid(103),doubleProduct=uid(104);
const historyBodies=[{...transferBody(1),lines:[{...transferBody(1).lines[0],source_id:'0128-blue-1',sku_id:correctedSku,product_id:productId,source_color_name:'蓝色',source_size_name:'180/108A 44',source_quantity:'1',unit:'件',source_lineage:{fixture:'synthetic-policy-shape'}}]},
 ...[34,35].map((quantity,index)=>({...transferBody(quantity),lines:Array.from({length:34},(_,i)=>({...transferBody(1).lines[0],source_id:`history-${index}-${i}`,product_id:productId,source_quantity:String(i===33?quantity-33:1),unit:'件',source_lineage:{fixture:'synthetic-policy-shape',row:i+1}}))}))];
function extendedSeed(){
 const s=ident(config.schemas.source),r=ident(config.schemas.runtime);
 adminSql(config,`SET ROLE ${ident(config.roles.source)};
 INSERT INTO ${s}.variant(id,product_id,option_key) VALUES(${literal(correctedSku)},${literal(productId)},'CORRECTED-44'),(${literal(oldSku)},${literal(productId)},'OLD-43');
 INSERT INTO ${s}.unit(id,code,code_normalized,name,quantity_scale) VALUES(${literal(doubleProduct)},'T20-DOUBLE','T20-DOUBLE','双',4);
 INSERT INTO ${s}.product(id,code,code_normalized,name,category_id,unit_id) VALUES(${literal(doubleProduct)},'T20-DOUBLE','T20-DOUBLE','Synthetic decimal product',${literal(productId)},${literal(doubleProduct)});
 INSERT INTO ${s}.variant(id,product_id,option_key) VALUES(${literal(doubleSku)},${literal(doubleProduct)},'DOUBLE-ONE');
 RESET ROLE;SET ROLE ${ident(config.roles.runtime)};
 ${historyIds.map((id,i)=>`INSERT INTO ${r}.document(id,document_type,number,source_identity,status,baseline_was_included,current_effect_active,current_revision,version,business_day)
 VALUES(${literal(id)},'TRANSFER',${literal('ALAL-2026-09-'+['0128','0157','0158'][i])},'{"fixture":"synthetic-policy-shape"}','UNAUDITED',true,false,1,1,'2026-09-30');
 INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id) VALUES(${literal(id)},1,true,${literal(JSON.stringify(historyBodies[i]))}::jsonb,NULL);`).join('\n')}
 RESET ROLE;`);
}
async function get(session,url){return app.inject({method:'GET',url,headers:{cookie:session.cookie,origin:environment.SESSION_ORIGIN}});}
async function work(session,input){return app.inject({method:'POST',url:'/api/transfers/work',headers:{cookie:session.cookie,origin:environment.SESSION_ORIGIN,'content-type':'application/json','x-csrf-token':session.csrf},payload:input});}
function fullFingerprint(){
 const schemas=Object.values(config.schemas).map(literal).join(',');
 const tables=adminValue(config,`SELECT jsonb_agg(jsonb_build_object('schema',schemaname,'name',tablename) ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname IN (${schemas})`);
 return tables.map(t=>({schema:t.schema,table:t.name,sha256:digest(adminSql(config,`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM ${ident(t.schema)}.${ident(t.name)} t`))}));
}
async function rejected(input,expected='VALIDATION',session=null){
 const before=fullFingerprint(),res=await command(session||adminSessionForProbe,input);
 assert.equal(res.json().error?.code,expected,res.body);assert.deepEqual(fullFingerprint(),before);
 samples.denials??=[];samples.denials.push({input,status:res.statusCode,code:res.json().error.code,unchanged:true});
}
let adminSessionForProbe;

try {
  assert.match(tool('postgres',['--version'],'version.log'),/PostgreSQL\) 17\./);
  tool('initdb',['-D',data,'-U',admin,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C','--wal-segsize=1','--set','min_wal_size=2MB','--set','max_wal_size=8MB'],'initdb.log');
  const wal = 'min_wal_size=2MB -c max_wal_size=8MB';
  tool('pg_ctl',['-D',data,'-l',join(suite,'postgres.log'),'-o',`-c listen_addresses='' -c shared_buffers=8MB -c max_connections=24 -c ${wal} -c unix_socket_permissions=0700 -c unix_socket_directories=${socket} -p ${port}`,'-w','start'],'start.log'); started = true;
  const cluster = JSON.parse(tool('psql',['-X','-w','-qAt',...conn('postgres'),'-c',"SELECT jsonb_build_object('clusterId',system_identifier::text,'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses')) FROM pg_control_system()"],'identity.log'));
  assert.equal(cluster.dataDirectory,data); assert.equal(cluster.listenAddresses,'');
  environment.POSTGRES_CLUSTER_ID = cluster.clusterId; result.cluster = cluster;
  checked('Fresh PostgreSQL 17 QA fixture uses a private socket with TCP disabled');
  tool('createdb',['-h',socket,'-p',port,'-U',admin,'-T','template0',databaseName],'qa-create.log');
  writeFileSync(environment.SESSION_SECRET_FILE,randomBytes(48),{mode:0o600}); chmodSync(environment.SESSION_SECRET_FILE,0o600);
  config = readDatabaseConfig(environment); assertIsolatedTarget(config); targets.push({environment:'qa',database:config.database,instanceId:config.instanceId});
  const bootstrapResult = await maintenance(environment,'bootstrap','qa-bootstrap.log');
  assert.equal(bootstrapResult.bootstrapped,true);
  const transferCreationUpgrade=process.env.T20_HALL_ACCEPTANCE==='1'?prepareTransferSnapshotUpgrade({config,adminSql,hallId,warehouseIds:remoteWarehouseIds,skuId}):null;
  const migrationResult = await maintenance(environment,'migrate','qa-migrate.log');
  const expectedMigrations=loadMigrations(config);
  assert.ok(expectedMigrations.some(m=>m.id==='0004_transaction_core'));
  assert.deepEqual(migrationResult.versions.map(({id,checksum,position})=>({id,checksum,position})),expectedMigrations.map((m,i)=>({id:m.id,checksum:m.checksum,position:i+1})));
  checked(`Explicit bootstrap and all ${expectedMigrations.length} current versioned migrations include immutable opening coverage`);
  seed();extendedSeed();
  app = createApp(readConfig(environment));
  app.addHook('onError', async (_request, _reply, error) => {
    const value = error && typeof error === 'object' ? error : {};
    const entry = {name: value.name ?? null, code: value.code ?? null, sqlState: value.sqlState ?? null};
    writeFileSync(join(suite,'application-error-codes.json'),JSON.stringify(entry) + '\n',{flag:'a',mode:0o600});
  });
  const adminSession = await login(accounts.admin.id), salespersonSession = await login(accounts.salesperson.id);


  adminSessionForProbe=adminSession;
  if(process.env.T20_DISABLED_SKU_ONLY==='1'){
    samples.disabledSkuTransfer=await verifyDisabledSkuTransfer({config,adminSql,command,get,success,login,accounts,adminSession,salespersonSession,warehouseIds,skuId,productId,app,checked,fullFingerprint,evidencePath:join(out,'disabled-sku-evidence.json')});
  }else if(process.env.T20_REQUEST_RESULT_ONLY==='1'){
    samples.requestResultScope=await verifyRequestResultScope({config,adminSql,command,get,success,login,accounts,adminSession,salespersonSession,warehouseIds,remoteWarehouseIds,hallId,otherHallId,skuId,checked,fullFingerprint,evidencePath:join(out,'request-result-evidence.json')});
  }else{
  const warehouseSession=await login(accounts.warehouse.id);
  const r=ident(config.schemas.runtime);
  const fresh=(body)=>({documentId:randomUUID(),documentType:'TRANSFER',operation:'create',expectedVersion:0,requestKey:randomUUID(),body});
  for(const value of ['0','-1','1.25','100000','NaN','1.00001'])await rejected(fresh(transferBody(value)));
  const same=transferBody(1);same.header.source_to_warehouse_id=warehouseIds[0];same.lines[0].to_warehouse_id=warehouseIds[0];await rejected(fresh(same));
  const mismatched=transferBody(1);mismatched.lines[0].from_warehouse_id=warehouseIds[2];await rejected(fresh(mismatched));
  const unknownWarehouse=transferBody(1);unknownWarehouse.lines[0].to_warehouse_id=uid(999);await rejected(fresh(unknownWarehouse),'SCOPE');
  const unknownSku=transferBody(1);unknownSku.lines[0].sku_id=uid(999);await rejected(fresh(unknownSku));
  const mismatchedProduct=transferBody(1);mismatchedProduct.lines[0].product_id=doubleProduct;await rejected(fresh(mismatchedProduct));
  const forgedUnit=transferBody(1);forgedUnit.lines[0].unit='双';await rejected(fresh(forgedUnit));
  checked('Different warehouses; exact header/line scope; positive quantities, original SKU identity, precision and unit denials leave all schemas unchanged');

  const request=fresh(transferBody(4)),id=request.documentId;
  const created=success(await command(salespersonSession,request),'salesperson creates transfer');assert.equal(created.document.body.lines[0].unit,'件');
  assert.equal(await balance(warehouseIds[0]),'100.0000');assert.equal(await balance(warehouseIds[1]),'0.0000');
  for(let i=0;i<6;i++)assert.deepEqual(success(await command(salespersonSession,request),'continuous create retry'),created);
  const savedBody=transferBody(6),saveReq={documentId:id,documentType:'TRANSFER',operation:'save',expectedVersion:1,requestKey:randomUUID(),body:savedBody};
  const saved=success(await command(salespersonSession,saveReq),'save draft');
  assert.equal(saved.document.version,2);assert.equal(await balance(warehouseIds[0]),'100.0000');
  assert.equal(adminValue(config,`SELECT count(*) FROM ${r}.posting WHERE document_id=${literal(id)}::uuid`),0);
  checked('Create, draft save and six retries keep stock unchanged; real actor is a salesperson');

  const approve={documentId:id,documentType:'TRANSFER',operation:'approve',expectedVersion:2,requestKey:randomUUID()};
  const approvals=await Promise.all(Array.from({length:8},()=>command(salespersonSession,approve)));
  const approved=success(approvals[0],'approve');for(const res of approvals)assert.deepEqual(success(res,'concurrent same-key approve'),approved);
  assert.equal(await balance(warehouseIds[0]),'94.0000');assert.equal(await balance(warehouseIds[1]),'6.0000');
  const movement=adminValue(config,`SELECT jsonb_build_object('postings',(SELECT count(*) FROM ${r}.posting WHERE document_id=${literal(id)}::uuid),'sum',(SELECT sum(m.quantity)::text FROM ${r}.movement m JOIN ${r}.posting p ON p.id=m.posting_id WHERE p.document_id=${literal(id)}::uuid),'sides',(SELECT count(*) FROM ${r}.movement m JOIN ${r}.posting p ON p.id=m.posting_id WHERE p.document_id=${literal(id)}::uuid))`);
  assert.equal(movement.postings,1);assert.equal(Number(movement.sum),0);assert.equal(movement.sides,2);samples.approval={approved,movement,out:'94.0000',in:'6.0000',attempts:8};
  checked('Eight concurrent identical approvals create one posting, two opposite movements and conserve 100 pieces');
  await rejected({...saveReq,requestKey:randomUUID()},'VERSION_CONFLICT',salespersonSession);
  await rejected({...approve,body:transferBody(7)},'IDEMPOTENCY_CONFLICT',salespersonSession);
  await rejected({...saveReq,requestKey:randomUUID(),expectedVersion:3},'REVISION',salespersonSession);
  checked('Stale version, changed idempotency payload and direct modification of approved transfer are rejected without a partial document');

  const calls=[],storage=new Map(),clientSource=readFileSync(join(root,'frontend/service-client.js'),'utf8'),ctx={crypto:globalThis.crypto,AbortController,URLSearchParams,setTimeout,clearTimeout,navigator:{onLine:true}};
  vm.createContext(ctx);vm.runInContext(clientSource,ctx);let dropNext=false;
  const client=ctx.ERP_API.createClient({actor:()=>accounts.salesperson.id,storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},fetcher:async(url,options)=>{
    calls.push({url,method:options.method||'GET'});
    const res=await app.inject({method:options.method||'GET',url,headers:{...options.headers,cookie:salespersonSession.cookie,origin:environment.SESSION_ORIGIN},...(options.body?{payload:options.body}:{})});
    if(dropNext&&url==='/api/runtime/command'){dropNext=false;assert.equal(res.statusCode,200,res.body);throw Error('synthetic lost response after commit');}
    return {ok:res.statusCode<400,status:res.statusCode,json:async()=>res.json()};
  }});
  await client.request('/runtime/session');
  const reverse={documentId:id,documentType:'TRANSFER',operation:'unapprove',expectedVersion:3,requestKey:randomUUID()};
  dropNext=true;await assert.rejects(client.request('/runtime/command',reverse),e=>e.code==='PENDING_VERIFICATION');
  assert.equal(client.pending().length,1);const readBefore=fullFingerprint();
  const recovered=await client.result(reverse.requestKey),latest=await client.request('/runtime/document/'+id);
  assert.equal(recovered.resolution,'COMMITTED');assert.equal(recovered.requestKey,reverse.requestKey);assert.equal(recovered.operationId,'transfers.unapprove');
  assert.equal(latest.status,'UNAUDITED');assert.equal(latest.version,4);
  assert.equal(await balance(warehouseIds[0]),'100.0000');assert.equal(await balance(warehouseIds[1]),'0.0000');
  assert.deepEqual(fullFingerprint(),readBefore);assert.equal(calls.filter(c=>c.method==='POST').length,1);client.complete(reverse.requestKey);
  const foreign=success(await get(adminSession,'/api/requests/result?requestKey='+reverse.requestKey+'&operationId=transfers.unapprove'),'other actor request query');assert.equal(foreign.resolution,'NOT_FOUND');
  samples.recovery={recovered,latest,calls,foreign};checked('Actual T11 client retains a lost response; original actor/key/operation GET finds committed reversal and never replays POST');

  const revised=success(await command(salespersonSession,{...saveReq,expectedVersion:4,requestKey:randomUUID(),body:transferBody(7)}),'modify after unapprove');assert.equal(revised.document.version,5);
  const reapproved=success(await command(salespersonSession,{...approve,expectedVersion:5,requestKey:randomUUID()}),'reapprove modified transfer');assert.equal(reapproved.document.version,6);
  assert.equal(await balance(warehouseIds[0]),'93.0000');assert.equal(await balance(warehouseIds[1]),'7.0000');
  const detail=success(await get(warehouseSession,'/api/runtime/document/'+id),'warehouse staff history');
  assert.deepEqual(detail.history.map(h=>h.operation),['create','save','approve','unapprove','save','approve']);
  assert.equal(detail.creator.id,accounts.salesperson.id);assert.equal(detail.history[3].postings[0].reversedEffectIdentity,detail.history[2].postings[0].id);
  assert.equal(detail.history[1].body.lines[0].source_quantity,'6');assert.equal(detail.history[4].body.lines[0].source_quantity,'7');
  samples.chain=detail;checked('Salesperson unapprove → modify → reapprove restores once then applies seven; six immutable versions and reverse link retained');

  const conflictDraft=fresh(transferBody(1));success(await command(adminSession,conflictDraft),'version race draft');
  const race=await Promise.all([2,3].map(n=>command(adminSession,{documentId:conflictDraft.documentId,documentType:'TRANSFER',operation:'save',expectedVersion:1,requestKey:randomUUID(),body:transferBody(n)})));
  assert.equal(race.filter(res=>res.statusCode===200).length,1);assert.equal(race.filter(res=>res.json().error?.code==='VERSION_CONFLICT').length,1);
  const raceDetail=success(await get(adminSession,'/api/runtime/document/'+conflictDraft.documentId),'race result');assert.equal(raceDetail.version,2);assert.equal(raceDetail.history.length,2);samples.versionRace=race.map(r=>r.json());
  checked('Two different same-version saves admit one winner and reject one; no extra revision or posting');

  const failing=fresh(transferBody(2));success(await command(adminSession,failing),'atomic probe draft');
  adminSql(config,`CREATE FUNCTION ${r}.t20_fail_second_side() RETURNS trigger LANGUAGE plpgsql AS $t20$ BEGIN IF NEW.quantity>0 THEN RAISE EXCEPTION 'T20_SECOND_SIDE_FAILURE'; END IF; RETURN NEW; END $t20$;
   CREATE TRIGGER t20_fail_second_side BEFORE INSERT ON ${r}.movement FOR EACH ROW EXECUTE FUNCTION ${r}.t20_fail_second_side();`);
  const failCommand={documentId:failing.documentId,documentType:'TRANSFER',operation:'approve',expectedVersion:1,requestKey:randomUUID()};
  await rejected(failCommand,'ROLLED_BACK');
  adminSql(config,`DROP TRIGGER t20_fail_second_side ON ${r}.movement;DROP FUNCTION ${r}.t20_fail_second_side();`);
  success(await command(adminSession,failCommand),'same-key retry after rollback');
  success(await command(adminSession,{...failCommand,operation:'unapprove',expectedVersion:2,requestKey:randomUUID()}),'clear atomic test posting');
  assert.equal(await balance(warehouseIds[0]),'93.0000');assert.equal(await balance(warehouseIds[1]),'7.0000');
  checked('Injected second-side movement failure rolls back both sides, state, history and request; same key succeeds after removing fault');

  const decimal=transferBody('3.125');decimal.lines[0].sku_id=doubleSku;decimal.lines[0].product_id=doubleProduct;decimal.lines[0].unit='双';
  const decimalReq=fresh(decimal);success(await command(warehouseSession,decimalReq),'decimal transfer');
  success(await command(warehouseSession,{...decimalReq,body:undefined,operation:'approve',expectedVersion:1,requestKey:randomUUID()}),'decimal approval');
  assert.equal(await app.dataAccess.read(s=>readInventoryBalance(s,r,warehouseIds[0],doubleSku)),'-3.1250');
  assert.equal(await app.dataAccess.read(s=>readInventoryBalance(s,r,warehouseIds[1],doubleSku)),'3.1250');
  checked('Explicit four-place unit 双 conserves each SKU separately; negative source stock is allowed');

  const beforeQueries=fullFingerprint();
  const page=success(await get(salespersonSession,'/api/runtime/documents?type=TRANSFER&size=2&page=1&filters='+encodeURIComponent(JSON.stringify({status:['未审核'],start:'2026-09-01',end:'2026-09-30'}))),'filtered page');assert.equal(page.total,3);assert.equal(page.items.length,2);
  const nextPage=success(await get(salespersonSession,'/api/runtime/documents?type=TRANSFER&size=2&page=2&filters='+encodeURIComponent(JSON.stringify({status:['未审核'],start:'2026-09-01',end:'2026-09-30'}))),'next page');assert.equal(nextPage.items.length,1);assert.equal(new Set([...page.items,...nextPage.items].map(x=>x.id)).size,3);
  samples.historyDecisions=[];
  for(let i=0;i<3;i++){
   const d=success(await get(salespersonSession,'/api/runtime/document/'+historyIds[i]),'three history decisions detail');
   assert.equal(d.status,'UNAUDITED');assert.equal(d.current_effect_active,false);assert.equal(d.body.lines.length,i===0?1:34);
   assert.equal(d.body.lines.reduce((sum,l)=>sum+Number(l.source_quantity),0),[1,34,35][i]);assert.equal(d.creator,null);assert.equal(d.original_auditor,null);assert.equal(d.original_audited_at,null);assert.equal(d.history.length,0);
   if(i===0){assert.equal(d.body.lines[0].sku_id,correctedSku);assert.equal(d.body.lines[0].source_size_name,'180/108A 44');assert.equal(d.body.lines[0].source_color_name,'蓝色');}
   const p={id:'T20',uuid:productId,name:'Synthetic',colorIds:['c'],sizeIds:['s'],colors:['蓝色'],sizes:['180/108A 44'],skuByCell:{'c|s':i===0?correctedSku:skuId}};
   const draft={from:warehouseIds[0],to:warehouseIds[1],items:['T20'],q:{'T20|0|0':[1,34,35][i]},_runtime:d};
   assert.deepEqual(transferLines(draft,()=>p),d.body.lines);samples.historyDecisions.push(d);
  }
  assert.deepEqual(fullFingerprint(),beforeQueries);
  // A note-only edit must keep every imported source row rather than rebuilding a summed matrix.
  const historicalNote={...structuredClone(historyBodies[2]),header:{...historyBodies[2].header,note:'Synthetic note only'}};
  success(await command(adminSession,{documentId:historyIds[2],documentType:'TRANSFER',operation:'save',expectedVersion:1,requestKey:randomUUID(),body:historicalNote}),'history note-only draft save');
  const preserved=success(await get(adminSession,'/api/runtime/document/'+historyIds[2]),'reread 0158 note');assert.equal(preserved.status,'UNAUDITED');assert.deepEqual(preserved.body.lines,historyBodies[2].lines);assert.equal(preserved.original_auditor,null);assert.equal(preserved.history.length,1);
  samples.historyNote=preserved;
  checked('Three synthetic policy-shaped imports preserve 0128 exact corrected SKU and UNAUDITED; 0157 34/34 and 0158 34/35 including source rows and unknown actors; reads do not write');

  const draftKey='草稿-ab123456',token=randomUUID(),eventId=randomUUID();
  const leased=success(await work(salespersonSession,{type:'acquire',docId:draftKey,newToken:token}),'draft lease');assert.equal(leased.ok,true);
  const event={type:'work',docId:draftKey,token,eventId,action:'scan',input:'SYNTHETIC-BARCODE'};
  const e1=success(await work(salespersonSession,event),'first scan event'),e2=success(await work(salespersonSession,event),'repeat scan');assert.equal(e2.duplicate,true);assert.equal(e1.event.actor.id,accounts.salesperson.id);
  const record={id:eventId,eventId,key:'T20|0|0',before:0,after:1,actor:{id:'FORGED',name:'FORGED'},time:'FORGED'};
  assert.equal(success(await work(salespersonSession,{type:'work',docId:draftKey,token,record}),'scan result').ok,true);
  const logsResult=success(await work(salespersonSession,{type:'logs',docId:draftKey}),'own work logs');assert.equal(logsResult.items.length,1);assert.equal(logsResult.items[0].actor.id,accounts.salesperson.id);
  const others=success(await work(adminSession,{type:'logs',docId:draftKey}),'foreign draft work');assert.equal(others.items.length,0);
  success(await work(salespersonSession,{type:'release',docId:draftKey,token}),'release');
  const stale=success(await work(salespersonSession,{type:'renew',docId:draftKey,token}),'stale lease');assert.equal(stale.code,'LEASE');
  samples.work={e1,e2,logsResult,others};checked('Formal scan events deduplicate; result actor and time are server-derived; unsaved work is isolated by actor and stale leases are refused');

  const anonymous=await app.inject({method:'GET',url:'/api/runtime/document/'+id});assert.equal(anonymous.statusCode,401);
  const noCsrf=await app.inject({method:'POST',url:'/api/runtime/command',headers:{cookie:adminSession.cookie,origin:environment.SESSION_ORIGIN,'content-type':'application/json'},payload:fresh(transferBody(1))});assert.equal(noCsrf.statusCode,403);assert.equal(noCsrf.json().error.code,'CSRF');
  const balanceRows=await inventoryCells(async path=>success(await get(adminSession,'/api'+path),'formal inventory adapter'));
  assert.ok(balanceRows.some(x=>x.skuId===skuId&&x.quantity==='93.0000'));samples.finalInventory=balanceRows;
  checked('All three real synthetic roles operate transfers; anonymous and CSRF writes denied; formal inventory adapter returns original SKU cells');

  const peerSession=await login(accounts.salespersonPeer.id),otherSession=await login(accounts.otherSalesperson.id);
  const transferPage=async session=>success(await get(session,'/api/runtime/documents?type=TRANSFER&size=200'),'hall-scoped transfer list');
  const baselineCounts={mine:(await transferPage(salespersonSession)).total,other:(await transferPage(otherSession)).total,
    admin:(await transferPage(adminSession)).total,warehouse:(await transferPage(warehouseSession)).total};
  const remoteA=remoteWarehouseIds[0],remoteB=remoteWarehouseIds[1],shared=warehouseIds[2];
  const createVisible=async(session,body,label)=>{
    const request=fresh(body);success(await command(session,request),label);return request.documentId;
  };
  const forgedCreator=transferBetween(remoteA,remoteB);
  forgedCreator.creatorHallId=hallId;forgedCreator.createdBy=accounts.salesperson.id;
  const unseenId=await createVisible(adminSession,forgedCreator,'admin cannot forge salesperson creation hall');
  assert.equal(adminSql(config,`SELECT transfer_creator_hall_id IS NULL FROM ${r}.document WHERE id=${literal(unseenId)}::uuid`),'t');
  const creatorHallId=await createVisible(salespersonSession,transferBetween(remoteA,remoteB),'hall salesperson creates remote-endpoint transfer');
  assert.equal(adminSql(config,`SELECT transfer_creator_hall_id::text=${literal(hallId)} FROM ${r}.document WHERE id=${literal(creatorHallId)}::uuid`),'t');
  const sharedId=await createVisible(adminSession,transferBetween(remoteA,shared),'admin creates shared-warehouse transfer');
  const movedId=await createVisible(adminSession,transferBetween(remoteA,remoteB),'admin creates transfer initially outside hall');
  success(await command(adminSession,{documentId:movedId,documentType:'TRANSFER',operation:'save',expectedVersion:1,requestKey:randomUUID(),
    body:transferBetween(remoteA,shared)}),'move endpoint to shared warehouse');
  const mine=await transferPage(salespersonSession),peer=await transferPage(peerSession),other=await transferPage(otherSession),
    all=await transferPage(adminSession),warehouseAll=await transferPage(warehouseSession);
  assert.equal(mine.total,baselineCounts.mine+3);assert.equal(peer.total,mine.total);
  assert.equal(other.total,baselineCounts.other+4);assert.equal(all.total,baselineCounts.admin+4);
  assert.equal(warehouseAll.total,baselineCounts.warehouse+4);
  for(const page of [mine,peer]){
    const ids=new Set(page.items.map(row=>row.id));
    assert.equal(ids.has(unseenId),false);for(const visible of [creatorHallId,sharedId,movedId])assert.equal(ids.has(visible),true);
  }
  for(const page of [other,all,warehouseAll]){
    const ids=new Set(page.items.map(row=>row.id));
    for(const visible of [unseenId,creatorHallId,sharedId,movedId])assert.equal(ids.has(visible),true);
  }
  const denyRead=async(url)=>{const response=await get(salespersonSession,url);assert.equal(response.statusCode,403,url+': '+response.body);assert.equal(response.json().error.code,'SCOPE');};
  await denyRead('/api/runtime/document/'+unseenId);
  await denyRead('/api/runtime/history/'+unseenId);
  await denyRead('/api/outputs/documents/'+unseenId+'?intent=export');
  await denyRead('/api/outputs/documents/'+unseenId+'?intent=print');
  await denyRead('/api/inventory/documents/'+unseenId+'/revisions/1');
  const unseenWork=await work(salespersonSession,{type:'logs',docId:unseenId});
  assert.equal(unseenWork.statusCode,403);assert.equal(unseenWork.json().error.code,'SCOPE');
  success(await get(peerSession,'/api/runtime/document/'+creatorHallId),'peer sees creation-hall snapshot');
  success(await get(otherSession,'/api/runtime/document/'+unseenId),'other hall sees endpoint transfer');
  success(await get(warehouseSession,'/api/runtime/document/'+unseenId),'warehouse sees all transfers');
  const moved=success(await get(salespersonSession,'/api/runtime/document/'+movedId),'newly shared transfer detail');
  assert.equal(moved.history.length,1);assert.equal(moved.history[0].operation,'save');assert.equal(moved.history[0].previous_body,null);
  const movedAll=success(await get(adminSession,'/api/runtime/document/'+movedId),'admin sees full history');
  assert.equal(movedAll.history.length,2);assert.ok(movedAll.history[1].previous_body);
  samples.hallVisibility={baselineCounts,afterCounts:{mine:mine.total,peer:peer.total,other:other.total,admin:all.total,warehouse:warehouseAll.total},
    ids:{unseenId,creatorHallId,sharedId,movedId},deniedDirectReads:5,deniedWork:true,historyRedacted:true};
  checked('Two halls, shared warehouse, trusted creator-hall snapshot, all-role list/count and direct-read boundaries pass on isolated PostgreSQL');

  const otherSaleId=randomUUID();
  const otherSaleBody={header:{business_date:'2026-10-02',business_type:'SALE',hall_id:otherHallId,source_warehouse_id:remoteA},
    lines:[{source_id:'T20-OTHER-SALE',sku_id:skuId,warehouse_id:remoteA,source_quantity:'1',stock_quantity_contribution:'-1'}],fundsRecords:[]};
  adminSql(config,`SET ROLE ${ident(config.roles.runtime)};
    INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision,version,business_day)
      VALUES(${literal(otherSaleId)},'SALE','T20-OTHER-HALL-SALE','UNAUDITED',false,false,1,1,'2026-10-02');
    INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id)
      VALUES(${literal(otherSaleId)},1,false,${literal(JSON.stringify(otherSaleBody))}::jsonb,${literal(accounts.admin.id)});
    RESET ROLE;`);
  const salePage=async session=>success(await get(session,'/api/sales/documents?type=SALE&size=200'),'hall-scoped sale list');
  const hallSale=await salePage(salespersonSession),otherHallSale=await salePage(otherSession),
    allSales=await salePage(adminSession),warehouseSales=await salePage(warehouseSession);
  assert.equal(hallSale.total,1);assert.deepEqual(hallSale.items.map(row=>row.id),[baselineId]);
  assert.equal(otherHallSale.total,1);assert.deepEqual(otherHallSale.items.map(row=>row.id),[otherSaleId]);
  for(const page of [allSales,warehouseSales]){
    assert.equal(page.total,2);assert.deepEqual(new Set(page.items.map(row=>row.id)),new Set([baselineId,otherSaleId]));
  }
  for(const url of ['/api/sales/document/'+otherSaleId,'/api/sales/history/'+otherSaleId,
    '/api/outputs/documents/'+otherSaleId+'?intent=export','/api/inventory/documents/'+otherSaleId+'/revisions/1'])await denyRead(url);
  success(await get(otherSession,'/api/sales/document/'+otherSaleId),'other hall own sale');
  success(await get(warehouseSession,'/api/sales/document/'+otherSaleId),'warehouse sees all sales');
  samples.saleHallVisibility={hallCount:hallSale.total,otherHallCount:otherHallSale.total,adminCount:allSales.total,warehouseCount:warehouseSales.total,
    deniedDirectReads:4,otherSaleId};
  checked('Sales and returns read scope uses document hall, with cross-hall list, detail, history, output and revision denial');
  const reassignedSale={...otherSaleBody,
    header:{...otherSaleBody.header,hall_id:hallId,source_warehouse_id:warehouseIds[0]},
    lines:otherSaleBody.lines.map(line=>({...line,warehouse_id:warehouseIds[0]}))};
  adminSql(config,`SET ROLE ${ident(config.roles.runtime)};
    INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id)
      VALUES(${literal(otherSaleId)},2,false,${literal(JSON.stringify(reassignedSale))}::jsonb,${literal(accounts.admin.id)});
    UPDATE ${r}.document SET current_revision=2,version=2 WHERE id=${literal(otherSaleId)}::uuid;
    INSERT INTO ${r}.version_history(document_id,version,operation,revision,actor_id,request_key)
      VALUES(${literal(otherSaleId)},2,'save',2,${literal(accounts.admin.id)},'T20-SALE-HALL-REASSIGN');
    RESET ROLE;`);
  const reassignedDetail=success(await get(salespersonSession,'/api/sales/document/'+otherSaleId),'new hall opens reassigned sale');
  assert.equal(reassignedDetail.history.length,1);assert.equal(reassignedDetail.history[0].previous_body,null);
  assert.equal((await salePage(salespersonSession)).total,2);assert.equal((await salePage(otherSession)).total,0);
  const oldHallRead=await get(otherSession,'/api/sales/document/'+otherSaleId);
  assert.equal(oldHallRead.statusCode,403);assert.equal(oldHallRead.json().error.code,'SCOPE');
  samples.saleHallReassignment={newHallCanRead:true,oldHallDenied:true,priorRevisionRedacted:true};
  checked('A sale reassigned by an administrator opens for its new hall without leaking the former hall revision');

  if(process.env.T20_VISIBILITY_ONLY!=='1'){
    samples.bridge=await exerciseTransferBridge({root,app,session:salespersonSession,origin:environment.SESSION_ORIGIN,warehouseIds,hallId,productId,skuId,actor:{id:accounts.salesperson.id,name:accounts.salesperson.name,role:'营业员',storeId:hallId,employmentStatus:'在职'},dateEvidencePath:join(suite,'business-date-roundtrip.json')});
    assert.equal(await balance(warehouseIds[0]),'93.0000');assert.equal(await balance(warehouseIds[1]),'7.0000');
    checked('Actual frontend bridge saves and rereads by UUID, links draft scans atomically, recovers lost audit without POST, modifies and reaudits');
    checked('Business date 2026-10-02 survives create, lost-response approval, quantity save, reapproval, list/detail and every historical snapshot');
  }
  if(process.env.T20_VISIBILITY_ONLY==='1'){
    const auth=ident(config.schemas.auth);
    adminSql(config,`SET ROLE ${ident(config.roles.auth)};
      UPDATE ${auth}.employee_login SET body=body||${literal(JSON.stringify({storeId:otherHallId,hallId:otherHallId}))}::jsonb,
        version=version+1 WHERE id=${literal(accounts.salesperson.id)};
      RESET ROLE;`);
    const movedActor=await login(accounts.salesperson.id);
    success(await get(movedActor,'/api/runtime/document/'+unseenId),'moved actor now sees own current hall endpoint');
    success(await get(peerSession,'/api/runtime/document/'+creatorHallId),'original creation hall still sees transfer after creator moved');
    assert.equal(adminSql(config,`SELECT transfer_creator_hall_id::text=${literal(hallId)} FROM ${r}.document WHERE id=${literal(creatorHallId)}::uuid`),'t');
    samples.creatorHallAfterAccountMove={snapshotStayedAtOriginalHall:true,oldHallPeerCanRead:true,newHallEndpointCanRead:true};
    checked('Account hall reassignment does not rewrite the creation-time transfer visibility snapshot');
  }
  if(process.env.T20_HALL_ACCEPTANCE==='1')samples.expandedTransferHallVisibility=await verifyTransferHallVisibility({config,adminSql:(config,sql)=>adminSql(config,sql),command,get,work,success,login,accounts,
    sessions:{admin:adminSession,mine:salespersonSession,peer:peerSession,other:otherSession,warehouse:warehouseSession},warehouseIds,remoteWarehouseIds,hallId,otherHallId,skuId,checked,fullFingerprint,upgradeFixture:transferCreationUpgrade});
  }
  const inspection=await maintenance(environment,'inspect','qa-inspect.log');
  const disabledSkuOnly=process.env.T20_DISABLED_SKU_ONLY==='1';
  const focused=process.env.T20_VISIBILITY_ONLY==='1'||process.env.T20_REQUEST_RESULT_ONLY==='1'||disabledSkuOnly;
  result.status=disabledSkuOnly?'DISABLED_SKU_PASS':focused?'VISIBILITY_PASS':'PASS';result.completedAt=new Date().toISOString();
  result.verification={task_id:'T20',status:result.status,checks,syntheticDatabase:databaseName,clusterId:cluster.clusterId,listenAddresses:'',productionConnections:0,existingBusinessConnections:0,serverOperations:0,realCredentialsUsed:false,migrationVersions:inspection.versions,clusterStopped:false,scope:disabledSkuOnly?'fresh synthetic QA, disabled SKU transfer save guards and retries only; existing frontend bridge not run':process.env.T20_REQUEST_RESULT_ONLY==='1'?'fresh synthetic QA, original result and replay scope only; existing frontend bridge not run':focused?'fresh synthetic QA, focused hall visibility; existing frontend bridge not run':'fresh synthetic QA only; history is policy-shaped fixture, no actual batch migration',compiledDirectory:compiled,compiledFiles:fileRecords(compiled)};
  writeJson(join(out,'acceptance-samples.json'),samples);writeJson(join(out,'database-verification.json'),result.verification);writeJson(join(suite,'RESULT.json'),result);

} catch (error) {
  result.status = 'FAIL'; result.failure = error instanceof Error ? error.message : 'T20_VERIFY_FAILED'; result.completedAt = new Date().toISOString();
  writeJson(join(suite,'RESULT.json'),result); throw error;
} finally {
  if (app) await app.close().catch(() => {});
  if (started) {
    const stop = spawnSync(join(pg,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C'},maxBuffer:1024*1024});
    const status=spawnSync(join(pg,'pg_ctl'),['-D',data,'status'],{encoding:'utf8'});
    result.clusterStopped=stop.status===0||status.status===3;
    writeFileSync(join(suite,'stop.log'),(stop.stdout ?? '')+(stop.stderr ?? '')+(status.stdout??''),{mode:0o600});
    if (result.verification) {
      result.verification.clusterStopped = result.clusterStopped;
      writeJson(join(out,'database-verification.json'),result.verification);
    }
    writeJson(join(suite,'RESULT.json'),result);
    if (!result.clusterStopped) throw new Error('T20_PRIVATE_POSTGRESQL_STOP_FAILED');
  }
}
