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
import {activateOpeningSnapshot, openingManifestDigest} from '../server/domain/transactions/opening.ts';

const pg = process.env.T19_PG_BIN;
if (!pg || !isAbsolute(pg)) throw new Error('T19_PG_BIN must explicitly select local PostgreSQL 17');
const out = join(root, 'outputs/T19'), logs = join(root, 'logs/T19');
mkdirSync(out, {recursive: true}); mkdirSync(logs, {recursive: true}); chmodSync(logs, 0o700);
const suite = mkdtempSync(join(logs, 'postgres-suite-'));
chmodSync(suite, 0o700);
const data = join(suite, 'data'), admin = 't19_bootstrap', port = '55495';
const socket = mkdtempSync(join(tmpdir(), 'naijue-t19-socket-'));
chmodSync(socket, 0o700);
assert.ok(Buffer.byteLength(join(socket, '.s.PGSQL.' + port)) < 104, 'Private PostgreSQL socket path exceeds platform limit');
assert.equal(existsSync(join(socket, '.s.PGSQL.' + port)), false, 'Never reuse an existing socket');
const checks = [], targets = [], result = {task_id: 'T19', status: 'RUNNING', suite, socket, checks,
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
  assert.equal(run.status, 0, name + ' failed; see private T19 log ' + file);
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
const prefix = 't19qa_' + runSuffix;
const databaseName = 'demo_8877_t19_qa_' + runSuffix;
const environment = {
  APP_ENV: 'qa', APP_DATABASE_MODE: 'required', POSTGRES_HOST: socket, POSTGRES_PORT: port,
  POSTGRES_DB: databaseName, POSTGRES_USER: prefix + '_app', POSTGRES_ROLE_PREFIX: prefix,
  POSTGRES_SOURCE_SCHEMA: 't19_source', POSTGRES_RUNTIME_SCHEMA: 't19_runtime', POSTGRES_AUTH_SCHEMA: 't19_auth', POSTGRES_CONTROL_SCHEMA: 't19_control',
  POSTGRES_INSTANCE_ID: randomUUID(), POSTGRES_CLUSTER_ID: '', POSTGRES_BOOTSTRAP_USER: admin,
  PSQL_BIN: join(pg, 'psql'), SESSION_ORIGIN: 'https://t19.invalid', SESSION_SECRET_FILE: join(suite, 'synthetic-session.key'),
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
const accounts = {admin: {id: 't19-admin', name: 'Synthetic Admin', role: '管理员', operatorRole: 'ADMIN'},
  salesperson: {id: 't19-sales', name: 'Synthetic Sales', role: '营业员', operatorRole: 'SALESPERSON', hallId}};
const password = randomUUID() + '-synthetic-only';
function seed() {
  const s = ident(config.schemas.source), r = ident(config.schemas.runtime), a = ident(config.schemas.auth);
  adminSql(config, `SET ROLE ${ident(config.roles.source)};
    INSERT INTO ${s}.category(id,code,code_normalized,name) VALUES(${literal(productId)},'T19','T19','Synthetic category');
    INSERT INTO ${s}.unit(id,code,code_normalized,name,quantity_scale) VALUES(${literal(productId)},'T19','T19','件',4);
    INSERT INTO ${s}.product(id,code,code_normalized,name,category_id,unit_id) VALUES(${literal(productId)},'T19','T19','Synthetic product',${literal(productId)},${literal(productId)});
    INSERT INTO ${s}.variant(id,product_id,option_key) VALUES(${literal(skuId)},${literal(productId)},'T19-ONE');
    ${warehouseIds.map((id,index) => `INSERT INTO ${s}.warehouse(id,code,code_normalized,name,type,enabled) VALUES(${literal(id)},'T19-W${index}','T19-W${index}','Synthetic warehouse ${index}','WAREHOUSE',true);`).join('\n')}
    INSERT INTO ${s}.tplus_import_run(batch_id,space_key,schema_name,database_name,manifest_path,manifest_sha256,preflight_batch_id,importer_version,status,git_sha,workspace_state_sha256)
      VALUES('T19','SYNTHETIC',${literal(config.schemas.source)},${literal(config.database)},'SYNTHETIC-T19',repeat('0',64),'SYNTHETIC','T19-fixture','COMMITTED','SYNTHETIC',repeat('0',64));
    INSERT INTO ${s}.tplus_hall(batch_id,id,source_id,source_code,name,warehouse_ids,source_payload)
      VALUES('T19',${literal(hallId)},'T19-HALL','T19-HALL','Synthetic hall',ARRAY[${warehouseIds.map(id => literal(id) + '::uuid').join(',')}],'{}');
    INSERT INTO ${s}.tplus_inventory_balance_source(batch_id,source_id,variant_id,warehouse_id,quantity,unit,opening_quantity,cutoff_source_date,
      snapshot_used,apply_historical_documents_again,source_event_count,components,source_payload)
      VALUES('T19','T19-OPENING-1',${literal(skuId)},${literal(warehouseIds[0])},100,'件',100,'2026-10-01',true,false,0,'{"opening":"100"}','{"fixture":"T19"}');
    RESET ROLE;
    SET ROLE ${ident(config.roles.runtime)};
    INSERT INTO ${r}.operator(id,name,role,enabled) VALUES
      (${literal(accounts.admin.id)},${literal(accounts.admin.name)},'ADMIN',true),
      (${literal(accounts.salesperson.id)},${literal(accounts.salesperson.name)},'SALESPERSON',true);
    INSERT INTO ${r}.master_data_entity(kind,id,body,source_facts,version,updated_by)
      VALUES ${warehouseIds.map((id,index) => `('warehouses',${literal(id)},${literal(JSON.stringify({code:`T19-W${index}`,name:`Synthetic warehouse ${index}`,enabled:true,type:'WAREHOUSE',hallRelations:[hallId],sourceOwnershipUnknown:false}))}::jsonb,'{"fixture":"T19"}',1,'T19-fixture')`).join(',')};
    INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,active_effect_identity,active_effect_revision,current_revision,version,business_day)
      VALUES(${literal(baselineId)},'SALE','T19-HISTORY-1','APPROVED',true,true,'baseline:T19-HISTORY-1',1,1,1,'2026-10-01');
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
  lines: [{source_id: 'T19-HISTORY-LINE-1', sku_id: skuId, warehouse_id: warehouseIds[0], source_quantity: '2', stock_quantity_contribution: '-2'}], fundsRecords: []};
function transferBody(quantity) {
  return {header: {business_date: '2026-10-02', source_from_warehouse_id: warehouseIds[0], source_to_warehouse_id: warehouseIds[1]},
    lines: [{sku_id: skuId, from_warehouse_id: warehouseIds[0], to_warehouse_id: warehouseIds[1], source_quantity: String(quantity)}], fundsRecords: []};
}
function saleBody(quantity) {
  const amount = (Number(quantity) * 10).toFixed(2);
  return {header: {business_date: '2026-10-02', hall_id: hallId, source_warehouse_id: warehouseIds[0]},
    lines: [{source_id: 'T19-SALE-LINE-1', sku_id: skuId, warehouse_id: warehouseIds[0], source_quantity: String(quantity), unit_price: '10.00', amount}], fundsRecords: []};
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
const secondSku = uid(103), pairProduct = uid(110), pairSku = uid(111), overlaySkus = [uid(120),uid(121)];
const colorId = uid(130), sizeId = uid(131), otherSizeId = uid(132), colorDimension = uid(133), sizeDimension = uid(134);
function extendedSeed() {
  const s = ident(config.schemas.source), r = ident(config.schemas.runtime);
  const mapping = (sku,code,name) => ({source:{sku,product:'T19',color:'001',sourceGroup:'原尺码组',sourceCode:code,sourceSize:name},target:{group:'UPPER',fit:'A',code:'203',size:'170/M'}});
  const pack = {revision:'SYNTHETIC-T19-ONLY',packSha256:digest('synthetic T19 standard pack'),items:{[skuId]:mapping(skuId,'01','170/31'),[secondSku]:mapping(secondSku,'02','170/88A')}};
  adminSql(config,`SET ROLE ${ident(config.roles.source)};
    INSERT INTO ${s}.spec_dimension(id,code,code_normalized,name) VALUES
      (${literal(colorDimension)},'COLOR','COLOR','颜色'),(${literal(sizeDimension)},'SIZE','SIZE','尺码');
    INSERT INTO ${s}.spec_value(id,dimension_id,code,code_normalized,name) VALUES
      (${literal(colorId)},${literal(colorDimension)},'001','001','黑'),
      (${literal(sizeId)},${literal(sizeDimension)},'01','01','170/31'),(${literal(otherSizeId)},${literal(sizeDimension)},'02','02','170/88A');
    INSERT INTO ${s}.variant(id,product_id,option_key) VALUES(${literal(secondSku)},${literal(productId)},'T19-TWO');
    INSERT INTO ${s}.variant_option(variant_id,dimension_id,spec_value_id) VALUES
      (${literal(skuId)},${literal(colorDimension)},${literal(colorId)}),(${literal(skuId)},${literal(sizeDimension)},${literal(sizeId)}),
      (${literal(secondSku)},${literal(colorDimension)},${literal(colorId)}),(${literal(secondSku)},${literal(sizeDimension)},${literal(otherSizeId)});
    INSERT INTO ${s}.tplus_product_source(batch_id,product_id,source_id,source_code,category_decision,source_payload)
      VALUES('T19',${literal(productId)},'T19-PRODUCT','T19','{}','{"sourceSizeGroupCode":"原尺码组"}');
    INSERT INTO ${s}.system_setting(key,value) VALUES('inventory.standard-size-mappings',${literal(JSON.stringify(pack))}::jsonb);
    INSERT INTO ${s}.unit(id,code,code_normalized,name,quantity_scale) VALUES(${literal(pairProduct)},'PAIR','PAIR','双',4);
    INSERT INTO ${s}.product(id,code,code_normalized,name,category_id,unit_id,enabled)
      VALUES(${literal(pairProduct)},'PAIR','PAIR','停用鞋',${literal(productId)},${literal(pairProduct)},false);
    INSERT INTO ${s}.variant(id,product_id,option_key,enabled) VALUES(${literal(pairSku)},${literal(pairProduct)},'PAIR',false);
    INSERT INTO ${s}.tplus_inventory_balance_source(batch_id,source_id,variant_id,warehouse_id,quantity,unit,opening_quantity,cutoff_source_date,snapshot_used,apply_historical_documents_again,source_event_count,components,source_payload) VALUES
      ('T19','second',${literal(secondSku)},${literal(warehouseIds[0])},5,'件',5,'2026-10-01',true,false,0,'{}','{}'),
      ('T19','disabled-positive',${literal(skuId)},${literal(warehouseIds[2])},5,'件',5,'2026-10-01',true,false,0,'{}','{}'),
      ('T19','disabled-negative',${literal(secondSku)},${literal(warehouseIds[2])},-5,'件',-5,'2026-10-01',true,false,0,'{}','{}'),
      ('T19','pair',${literal(pairSku)},${literal(warehouseIds[0])},3.125,'双',3.125,'2026-10-01',true,false,0,'{}','{}'),
      ('T19','overlay-a',${literal(overlaySkus[0])},${literal(warehouseIds[0])},7,'件',7,'2026-10-01',true,false,0,'{}','{}'),
      ('T19','overlay-b',${literal(overlaySkus[1])},${literal(warehouseIds[0])},8,'件',8,'2026-10-01',true,false,0,'{}','{}');
    INSERT INTO ${s}.tplus_history_document(batch_id,source_dataset,source_id,target_document_id,document_kind,source_number,business_date,line_count,read_only,runtime_audit_replay_allowed,stock_effect,source_sha256,source_record_sha256,source_payload)
      VALUES('T19','history-sale','T19-HISTORY-1',${literal(baselineId)},'sale','HIST-001','2026-10-01',1,true,false,true,repeat('0',64),repeat('1',64),'{}');
    INSERT INTO ${s}.tplus_history_line(batch_id,source_dataset,source_id,source_document_id,target_document_id,line_kind,product_id,color_id,size_id,sku_id,warehouse_id,source_product_code,source_product_name,source_quantity,stock_quantity_contribution,unit,stock_effect,read_only,source_sha256,source_record_sha256)
      VALUES('T19','history-sale','T19-LINE-1','T19-HISTORY-1',${literal(baselineId)},'sale',${literal(productId)},${literal(colorId)},${literal(sizeId)},${literal(skuId)},${literal(warehouseIds[0])},'T19','Synthetic product',2,-2,'件',true,true,repeat('0',64),repeat('1',64));
    RESET ROLE; SET ROLE ${ident(config.roles.runtime)};
    INSERT INTO ${r}.variant_overlay(id,product_id,color_id,size_id,size_name,group_name,fit_id,size_code) VALUES
      ${overlaySkus.map((id,i)=>`(${literal(id)},${literal(productId)},${literal(colorId)},${literal(i ? otherSizeId : sizeId)},'170/M','UPPER','A','203')`).join(',')};
    UPDATE ${r}.master_data_entity SET body=jsonb_set(body,'{enabled}','false') WHERE kind='warehouses' AND id=${literal(warehouseIds[2])}; RESET ROLE;`);
}
async function get(session,url) {return app.inject({method:'GET',url,headers:session ? {cookie:session.cookie,origin:environment.SESSION_ORIGIN} : {}});}
const queryUrl = (path,values={}) => path+'?'+new URLSearchParams(values);
function fullFingerprint() {
  const schemas=Object.values(config.schemas), tables=adminValue(config,`SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname) ORDER BY n.nspname,c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN (${schemas.map(literal).join(',')})`);
  const rows=tables.map(t=>JSON.parse(adminSql(config,`SELECT jsonb_build_object('schema',${literal(t.schema)},'table',${literal(t.table)},'count',count(*),'digest',md5(coalesce(string_agg(h,'' ORDER BY h),'')))
    FROM (SELECT md5(to_jsonb(x)::text) h FROM ${ident(t.schema)}.${ident(t.table)} x) hashed`)));
  const sequences=adminValue(config,`SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname) ORDER BY n.nspname,c.relname),'[]'::jsonb)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname IN (${schemas.map(literal).join(',')})`);
  return {rows,sequences:sequences.map(t=>JSON.parse(adminSql(config,`SELECT jsonb_build_object('name',${literal(t.schema+'.'+t.name)},'value',last_value::text,'called',is_called) FROM ${ident(t.schema)}.${ident(t.name)}`)))};
}
try {
  assert.match(tool('postgres',['--version'],'version.log'),/PostgreSQL\) 17\./);
  tool('initdb',['-D',data,'-U',admin,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C','--wal-segsize=1','--set','min_wal_size=2MB','--set','max_wal_size=8MB'],'initdb.log');
  tool('pg_ctl',['-D',data,'-l',join(suite,'postgres.log'),'-o',`-c listen_addresses='' -c min_wal_size=2MB -c max_wal_size=8MB -c unix_socket_permissions=0700 -c unix_socket_directories=${socket} -p ${port}`,'-w','start'],'start.log'); started=true;
  const cluster=JSON.parse(tool('psql',['-X','-w','-qAt',...conn('postgres'),'-c',"SELECT jsonb_build_object('clusterId',system_identifier::text,'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses')) FROM pg_control_system()"],'identity.log'));
  assert.equal(cluster.dataDirectory,data);assert.equal(cluster.listenAddresses,'');environment.POSTGRES_CLUSTER_ID=cluster.clusterId;result.cluster=cluster;
  tool('createdb',['-h',socket,'-p',port,'-U',admin,'-T','template0',databaseName],'qa-create.log');
  writeFileSync(environment.SESSION_SECRET_FILE,randomBytes(48),{mode:0o600});chmodSync(environment.SESSION_SECRET_FILE,0o600);
  config=readDatabaseConfig(environment);assertIsolatedTarget(config);targets.push({environment:'qa',database:config.database,instanceId:config.instanceId});
  await maintenance(environment,'bootstrap','qa-bootstrap.log');await maintenance(environment,'migrate','qa-migrate.log');
  seed();extendedSeed();app=createApp(readConfig(environment));
  const adminSession=await login(accounts.admin.id), salespersonSession=await login(accounts.salesperson.id);
  checked('Fresh private PostgreSQL 17 QA cluster, synthetic identities, versioned migrations; no TCP');
  const readBefore=fullFingerprint();
  const original=success(await get(adminSession,'/api/inventory?size=200'),'original inventory');
  assert.equal(original.total,7);assert.equal(original.reconciled,true);
  const sourceCell=original.items.find(x=>x.skuId===skuId&&x.warehouseId===warehouseIds[0]);
  assert.equal(sourceCell.quantity,'100.0000');assert.equal(sourceCell.original.size.code,'01');assert.equal(sourceCell.standard.code,'203');
  assert.equal(sourceCell.original.size.name,'170/31');assert.equal(sourceCell.standard.mappingStatus,'CONFIRMED_SOURCE');
  assert.equal(sourceCell.basis.reconstructedQuantity,sourceCell.quantity);
  checked('Source basis reconciles without replaying the historical -2; original code/name and standard display coexist');
  const disabled=success(await get(salespersonSession,queryUrl('/api/inventory',{warehouseId:warehouseIds[2],nonzero:'true'})),'disabled warehouse');
  assert.equal(disabled.total,2);assert.ok(disabled.items.every(x=>x.warehouseEnabled===false));assert.equal(disabled.unitTotals[0].quantity,'0.0000');assert.equal(disabled.unitTotals[0].nonzeroCellCount,2);
  const pairs=success(await get(adminSession,queryUrl('/api/inventory',{unit:'双'})),'pair units');assert.equal(pairs.total,1);
  assert.equal(pairs.items[0].productEnabled,false);assert.equal(pairs.items[0].skuEnabled,false);assert.equal(pairs.unitTotals[0].quantity,'3.1250');
  assert.deepEqual(original.unitTotals.map(x=>x.unit).sort(),['件','双']);assert.equal(Object.hasOwn(original,'quantityTotal'),false);
  checked('Disabled warehouse/product/SKU remain readable; +5/-5 do not hide nonzero cells; 120件 and 3.1250双 stay separate');
  const standard=success(await get(adminSession,queryUrl('/api/inventory',{view:'standard',warehouseId:warehouseIds[0],productId})),'standard layer');
  assert.equal(standard.total,1);assert.equal(standard.items[0].quantity,'120.0000');assert.equal(standard.items[0].members.length,4);
  assert.equal(new Set(standard.items[0].members.map(x=>x.skuId)).size,4);
  const sourceFiltered=success(await get(adminSession,queryUrl('/api/inventory',{skuId,warehouseId:warehouseIds[0]})),'single identity');assert.equal(sourceFiltered.items[0].quantity,'100.0000');
  checked('Standard display combines four original SKU members while original balance identity remains exact');
  const pages=[];for(let p=1;p<=original.total;p++){const page=success(await get(adminSession,`/api/inventory?size=1&page=${p}`),'page');assert.equal(page.total,original.total);assert.deepEqual(page.unitTotals,original.unitTotals);pages.push(page.items[0].warehouseId+':'+page.items[0].skuId);}
  assert.equal(new Set(pages).size,original.total);assert.equal(success(await get(adminSession,'/api/inventory?page=99&size=200'),'empty page').items.length,0);
  assert.equal(success(await get(adminSession,'/api/inventory?q=停用鞋'),'literal search').total,1);assert.equal(success(await get(adminSession,'/api/inventory?q=%27%20OR%201=1--'),'SQL probe').total,0);
  checked('Server filters and deterministic pagination cover each cell once; totals describe all matches, including an empty page');
  const ledgerBefore=success(await get(adminSession,queryUrl('/api/inventory/ledger',{skuId,warehouseId:warehouseIds[0]})),'source ledger');
  assert.equal(ledgerBefore.reconstructedQuantity,'100.0000');assert.equal(ledgerBefore.items.find(x=>x.kind==='SOURCE_HISTORY').stockDelta,'0');
  assert.equal(ledgerBefore.items.find(x=>x.kind==='SOURCE_HISTORY').source.createdBy,null);assert.ok(ledgerBefore.items.find(x=>x.kind==='SOURCE_HISTORY').sourceTarget.available);
  const readAfter=fullFingerprint();assert.deepEqual(readAfter,readBefore);
  const readEvidence={successfulQueries:{before:readBefore,after:readAfter}};
  checked('All successful inventory/ledger reads leave every Source/Runtime/Auth/Control table and sequence unchanged');
  const transferId=randomUUID();success(await command(adminSession,{documentId:transferId,documentType:'TRANSFER',operation:'create',expectedVersion:0,requestKey:'T19-shared-key',body:transferBody(6)}),'draft transfer');
  success(await command(adminSession,{documentId:transferId,documentType:'TRANSFER',operation:'approve',expectedVersion:1,requestKey:'T19-shared-key',body:transferBody(6)}),'approve transfer');
  const priorPosting=adminSql(config,`SELECT id FROM ${ident(config.schemas.runtime)}.posting WHERE document_id=${literal(transferId)}::uuid`);
  const prior=success(await get(adminSession,'/api/inventory/postings/'+priorPosting),'transfer posting trace');
  assert.equal(prior.movements.length,2);assert.equal(prior.operationVersion,2);assert.equal(prior.document.revision,2);
  checked('Transfer posting resolves both warehouses and the immutable revision plus operation version');
  const cellInputs=[...warehouseIds.map((warehouseId,i)=>({warehouseId,skuId,quantity:i===0?'100.0000':i===2?'5.0000':'0.0000',unit:'件'})),
    {warehouseId:warehouseIds[0],skuId:secondSku,quantity:'5.0000',unit:'件'},{warehouseId:warehouseIds[2],skuId:secondSku,quantity:'-5.0000',unit:'件'},
    {warehouseId:warehouseIds[0],skuId:pairSku,quantity:'3.1250',unit:'双'},...overlaySkus.map((skuId,i)=>({warehouseId:warehouseIds[0],skuId,quantity:String(i+7)+'.0000',unit:'件'}))];
  const planBase={revision:'T19-OPENING',businessDay:'2026-10-01',sourceSha256:digest('T19 opening'),sourceFile:'SYNTHETIC:T19:opening.csv',rulesSha256:digest('T19 rules'),standardPackSha256:digest('T19 pack'),expectedActiveRevision:null,
    expectedCellCount:cellInputs.length,expectedCoveredBaselineDocumentCount:1,manifestSha256:'',issues:[],cells:cellInputs.map((x,i)=>({...x,sourceCell:'T19!A'+i,sourceRecord:{fixture:'SYNTHETIC_T19',row:i}})),
    coveredBaselineDocuments:[{documentId:baselineId,revision:1,effectIdentity:'baseline:T19-HISTORY-1'}]};
  const plan={...planBase,manifestSha256:openingManifestDigest(planBase)};
  await app.dataAccess.transaction(session=>activateOpeningSnapshot(session,{runtime:ident(config.schemas.runtime),source:ident(config.schemas.source)},plan));
  let ledger=success(await get(adminSession,queryUrl('/api/inventory/ledger',{skuId,warehouseId:warehouseIds[0]})),'opening covered ledger');
  assert.equal(ledger.reconstructedQuantity,'100.0000');assert.equal(ledger.items.find(x=>x.postingId===priorPosting).stockDelta,'0');assert.equal(ledger.items.find(x=>x.postingId===priorPosting).after,null);
  assert.equal(ledger.items.find(x=>x.kind==='OPENING_SNAPSHOT').source.sourceCell,'T19!A0');
  checked('Activated opening carries provenance and excludes checkpointed pre-opening postings from current balance');
  success(await command(adminSession,{documentId:baselineId,documentType:'SALE',operation:'unapprove',expectedVersion:1,requestKey:'T19-unapprove-'+randomUUID()}),'historical reversal');
  const reversed=success(await get(adminSession,queryUrl('/api/inventory',{skuId,warehouseId:warehouseIds[0]})),'reversal balance');assert.equal(reversed.items[0].quantity,'102.0000');
  success(await command(adminSession,{documentId:baselineId,documentType:'SALE',operation:'save',expectedVersion:2,requestKey:'T19-save-'+randomUUID(),body:saleBody(3)}),'historical change');
  success(await command(adminSession,{documentId:baselineId,documentType:'SALE',operation:'approve',expectedVersion:3,requestKey:'T19-reapprove-'+randomUUID(),body:saleBody(3)}),'historical reapproval');
  ledger=success(await get(adminSession,queryUrl('/api/runtime/ledger',{sku:skuId,warehouse:warehouseIds[0],size:'200'})),'period ledger');
  assert.equal(ledger.reconstructedQuantity,'99.0000');assert.equal(ledger.balance.items[0].quantity,'99.0000');assert.equal(ledger.balance.reconciled,true);
  const newMovement=ledger.items.find(x=>x.stockDelta==='-3.0000'), reversalMovement=ledger.items.find(x=>x.stockDelta==='2.0000');
  assert.equal(reversalMovement.before,'100.0000');assert.equal(reversalMovement.after,'102.0000');assert.equal(newMovement.before,'102.0000');assert.equal(newMovement.after,'99.0000');
  const oldTrace=success(await get(adminSession,reversalMovement.sourceTarget.url),'immutable reversal trace');
  assert.equal(oldTrace.document.revision,1);assert.equal(oldTrace.document.body.lines[0].stock_quantity_contribution,'-2');assert.equal(oldTrace.document.actorId,null);assert.equal(oldTrace.operationVersion,2);assert.equal(oldTrace.document.currentVersion,4);
  assert.equal(success(await get(adminSession,newMovement.sourceTarget.url),'new trace').document.body.lines[0].source_quantity,'3');
  const narrow=success(await get(adminSession,queryUrl('/api/inventory/ledger',{skuId,warehouseId:warehouseIds[0],start:'2026-10-02',end:'2026-10-02',size:'1'})),'filtered ledger');
  assert.equal(narrow.reconstructedQuantity,'99.0000');assert.equal(narrow.balance.items[0].quantity,'99.0000');
  const allAfter=success(await get(adminSession,'/api/inventory?size=200'),'all-cell reconciliation');
  assert.equal(allAfter.total,cellInputs.length);assert.equal(allAfter.reconciled,true);
  for(const expected of cellInputs) {
    const actual=allAfter.items.find(x=>x.warehouseId===expected.warehouseId&&x.skuId===expected.skuId);
    const quantity=expected.warehouseId===warehouseIds[0]&&expected.skuId===skuId?'99.0000':expected.quantity;
    assert.equal(actual.quantity,quantity);assert.equal(actual.basis.reconstructedQuantity,quantity);assert.match(actual.basis.difference,/^0(?:\.0+)?$/);
  }
  checked('100 → 102 → 99 reconciles opening plus effective reversal/reapproval; saved revisions and unknown historical actors remain exact');
  const r=ident(config.schemas.runtime),otherHall=uid(302),foreignDoc=uid(410),foreignPosting=uid(411);
  const foreignBody={...saleBody(1),header:{...saleBody(1).header,hall_id:otherHall}};
  adminSql(config,`SET ROLE ${ident(config.roles.runtime)};INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision,version,business_day)
    VALUES(${literal(foreignDoc)},'SALE','FOREIGN','UNAUDITED',false,false,2,2,'2026-10-02');
    INSERT INTO ${r}.revision(document_id,revision,original_imported,body) VALUES(${literal(foreignDoc)},1,false,${literal(JSON.stringify(foreignBody))}::jsonb),(${literal(foreignDoc)},2,false,${literal(JSON.stringify(saleBody(1)))}::jsonb);
    INSERT INTO ${r}.posting(id,document_id,revision,reason,actor_id,request_key) VALUES(${literal(foreignPosting)},${literal(foreignDoc)},1,'REVISION_APPROVAL',${literal(accounts.admin.id)},'T19-foreign');
    INSERT INTO ${r}.movement(posting_id,line_index,warehouse_id,sku_id,quantity) VALUES(${literal(foreignPosting)},0,${literal(warehouseIds[0])},${literal(skuId)},-1),(${literal(foreignPosting)},1,${literal(warehouseIds[0])},${literal(skuId)},0);
    UPDATE ${r}.inventory_delta SET quantity=quantity-1 WHERE warehouse_id=${literal(warehouseIds[0])}::uuid AND sku_id=${literal(skuId)}::uuid;RESET ROLE;`);
  const rejectionBefore=fullFingerprint();
  const scoped=success(await get(salespersonSession,queryUrl('/api/inventory/ledger',{skuId,warehouseId:warehouseIds[0],size:'200'})),'salesperson ledger');
  const hidden=scoped.items.find(x=>x.postingId===foreignPosting);assert.equal(hidden.sourceTarget.available,false);assert.equal(hidden.sourceTarget.reason,'SCOPE');assert.equal(Object.hasOwn(hidden,'documentId'),false);
  assert.equal((await get(salespersonSession,'/api/inventory/postings/'+foreignPosting)).statusCode,403);
  assert.equal((await get(salespersonSession,`/api/inventory/documents/${foreignDoc}/revisions/1`)).statusCode,403);
  assert.equal((await get(salespersonSession,`/api/inventory/documents/${foreignDoc}/revisions/2`)).statusCode,200);
  const zero=scoped.items.find(x=>x.postingId===foreignPosting&&x.lineIndex===1);assert.equal(zero.historicalOnly,false);assert.equal(zero.before,zero.after);
  checked('Global inventory visibility never bypasses document permissions: historical foreign-hall revision is masked and direct access is refused');
  for(const path of ['/api/inventory','/api/inventory/ledger','/api/inventory/postings/'+priorPosting])assert.equal((await get(null,path)).statusCode,401);
  for(const args of [{page:'0'},{size:'201'},{page:'1e2'},{warehouseId:'not-an-id'},{view:'bad'},{nonzero:'yes'},{unknown:'x'}])assert.equal((await get(adminSession,queryUrl('/api/inventory',args))).statusCode,400);
  assert.equal((await get(adminSession,queryUrl('/api/inventory/ledger',{skuId,warehouseId:warehouseIds[0],start:'2026-02-30'}))).statusCode,400);
  assert.equal((await get(adminSession,'/api/inventory/postings/'+uid(999))).statusCode,404);
  const rejectionAfter=fullFingerprint();assert.deepEqual(rejectionAfter,rejectionBefore);readEvidence.rejectedAndScopedQueries={before:rejectionBefore,after:rejectionAfter};
  checked('Anonymous, invalid filter/date/page, unavailable source and unauthorized revision probes do not write any table or sequence');
  const sourceSchema=ident(config.schemas.source);
  const savedPack=adminValue(config,`SELECT value FROM ${sourceSchema}.system_setting WHERE key='inventory.standard-size-mappings'`);
  for(const field of ['sku','product','color','sourceGroup','sourceCode','sourceSize']) {
    const badPack=structuredClone(savedPack);badPack.items[skuId].source[field]='wrong-'+field;
    adminSql(config,`SET ROLE ${ident(config.roles.source)};UPDATE ${sourceSchema}.system_setting SET value=${literal(JSON.stringify(badPack))}::jsonb WHERE key='inventory.standard-size-mappings';RESET ROLE;`);
    const protectedCell=success(await get(adminSession,queryUrl('/api/inventory',{skuId,warehouseId:warehouseIds[0]})),'identity guard '+field).items[0];
    assert.equal(protectedCell.standard.mappingStatus,'SOURCE_IDENTITY_MISMATCH');assert.equal(protectedCell.standard.size,null);
  }
  // An explicitly matching source identity still cannot reinterpret historical 910 无尺码 as size 40.
  const old910=structuredClone(savedPack);old910.items[skuId].source.sourceCode='910';old910.items[skuId].source.sourceSize='无尺码';old910.items[skuId].target.size='40';
  adminSql(config,`SET ROLE ${ident(config.roles.source)};UPDATE ${sourceSchema}.spec_value SET code='910',name='无尺码' WHERE id=${literal(sizeId)}::uuid;
    UPDATE ${sourceSchema}.system_setting SET value=${literal(JSON.stringify(old910))}::jsonb WHERE key='inventory.standard-size-mappings';RESET ROLE;`);
  const noSize=success(await get(adminSession,queryUrl('/api/inventory',{skuId,warehouseId:warehouseIds[0]})),'old 910').items[0];
  assert.equal(noSize.original.size.code,'910');assert.equal(noSize.original.size.name,'无尺码');assert.equal(noSize.standard.size,null);
  adminSql(config,`SET ROLE ${ident(config.roles.source)};UPDATE ${sourceSchema}.spec_value SET code='01',name='170/31' WHERE id=${literal(sizeId)}::uuid;
    UPDATE ${sourceSchema}.system_setting SET value=${literal(JSON.stringify(savedPack))}::jsonb WHERE key='inventory.standard-size-mappings';RESET ROLE;`);
  checked('All six mapping identity fields fail closed; historical 910 无尺码 cannot become new size 40');
  // Change one of the six source identity fields. The approved old map must fail closed.
  adminSql(config,`SET ROLE ${ident(config.roles.source)};UPDATE ${ident(config.schemas.source)}.spec_value SET name='changed-source' WHERE id=${literal(otherSizeId)}::uuid;RESET ROLE;`);
  const changed=success(await get(adminSession,queryUrl('/api/inventory',{skuId:secondSku,warehouseId:warehouseIds[0]})),'mapping drift');
  assert.equal(changed.items[0].standard.mappingStatus,'SOURCE_IDENTITY_MISMATCH');assert.equal(changed.items[0].standard.size,null);assert.equal(changed.items[0].quantity,'5.0000');
  const driftDisplay=success(await get(adminSession,queryUrl('/api/inventory',{view:'standard',productId,warehouseId:warehouseIds[0]})),'drift display');assert.equal(driftDisplay.items.length,2);
  checked('Source identity drift invalidates the standard projection while preserving original SKU balance');
  adminSql(config,`SET ROLE ${ident(config.roles.runtime)};UPDATE ${r}.inventory_delta SET quantity=quantity+0.0001 WHERE warehouse_id=${literal(warehouseIds[0])}::uuid AND sku_id=${literal(skuId)}::uuid;RESET ROLE;`);
  const badBefore=fullFingerprint(),mismatch=success(await get(adminSession,queryUrl('/api/inventory',{skuId,warehouseId:warehouseIds[0]})),'mismatch detection');
  assert.equal(mismatch.reconciled,false);assert.equal(mismatch.items[0].basis.difference,'0.0001');const badAfter=fullFingerprint();assert.deepEqual(badAfter,badBefore);readEvidence.mismatchQuery={before:badBefore,after:badAfter};
  checked('Projection/movement mismatch is explicitly reported with exact 0.0001 difference; query never repairs the ledger');
  writeJson(join(out,'query-read-fingerprints.json'),readEvidence);
  writeJson(join(out,'query-samples.json'),{original,standard,sourceLedger:ledgerBefore,periodLedger:ledger,allCellsAfterReapproval:allAfter,scopedLedger:scoped,mismatch});
  result.status='PASS';result.completedAt=new Date().toISOString();result.targets=targets;result.readFingerprint={tables:readBefore.rows.length,sequences:readBefore.sequences.length,unchanged:true};
  result.verification={task_id:'T19',status:'PASS',checks,syntheticDatabase:databaseName,postgresVersion:'17',listenAddresses:'',
    productionConnections:0,existingBusinessConnections:0,serverOperations:0,realCredentialsUsed:false,tableCount:readBefore.rows.length,sequenceCount:readBefore.sequences.length,clusterStopped:false};
} catch(error) {
  result.status='FAIL';result.failure=error instanceof Error?error.message:'T19_VERIFY_FAILED';result.completedAt=new Date().toISOString();throw error;
} finally {
  if(app)await app.close().catch(()=>{});
  if(started){const stop=spawnSync(join(pg,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C'}});
    writeFileSync(join(suite,'stop.log'),(stop.stdout??'')+(stop.stderr??''),{mode:0o600});result.clusterStopped=stop.status===0;
    if(result.verification)result.verification.clusterStopped=result.clusterStopped;
    writeJson(join(suite,'RESULT.json'),result);writeJson(join(out,'database-verification.json'),result.verification??result);
    if(stop.status!==0)throw new Error('T19_PRIVATE_POSTGRESQL_STOP_FAILED');
  }else writeJson(join(suite,'RESULT.json'),result);
}
