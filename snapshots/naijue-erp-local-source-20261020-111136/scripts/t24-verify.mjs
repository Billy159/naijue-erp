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
import {sizeGroups} from '../server/domain/products/definitions.ts';

const pg = process.env.T24_PG_BIN;
if (!pg || !isAbsolute(pg)) throw new Error('T24_PG_BIN must explicitly select local PostgreSQL 17');
const out = join(root, 'outputs/T24'), logs = join(root, 'logs/T24');
mkdirSync(out, {recursive: true}); mkdirSync(logs, {recursive: true}); chmodSync(logs, 0o700);
const suite = mkdtempSync(join(logs, 'postgres-suite-'));
chmodSync(suite, 0o700);
const data = join(suite, 'data'), admin = 't24_bootstrap', port = '55495';
const socket = mkdtempSync(join(tmpdir(), 'naijue-t24-socket-'));
chmodSync(socket, 0o700);
assert.ok(Buffer.byteLength(join(socket, '.s.PGSQL.' + port)) < 104, 'Private PostgreSQL socket path exceeds platform limit');
assert.equal(existsSync(join(socket, '.s.PGSQL.' + port)), false, 'Never reuse an existing socket');
const checks = [], targets = [], result = {task_id: 'T24', status: 'RUNNING', suite, socket, checks,
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
  assert.equal(run.status, 0, name + ' failed; see private T24 log ' + file);
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
const warehouseIds = [uid(201),uid(202)], productId = uid(101), skuId = uid(102), hallId = uid(301);
const categoryId=uid(110),supplierId=uid(120),colorId=uid(130),colorDim=uid(131),sizeDim=uid(132),old900=uid(140),old910=uid(141),sku910=uid(103);
const digest = text => createHash('sha256').update(text).digest('hex');
const runSuffix = randomUUID().replaceAll('-','').slice(0,8);
const prefix = 't24qa_' + runSuffix;
const databaseName = 'demo_8877_t24_qa_' + runSuffix;
const environment = {
  APP_ENV: 'qa', APP_DATABASE_MODE: 'required', POSTGRES_HOST: socket, POSTGRES_PORT: port,
  POSTGRES_DB: databaseName, POSTGRES_USER: prefix + '_app', POSTGRES_ROLE_PREFIX: prefix,
  POSTGRES_SOURCE_SCHEMA: 't24_source', POSTGRES_RUNTIME_SCHEMA: 't24_runtime', POSTGRES_AUTH_SCHEMA: 't24_auth', POSTGRES_CONTROL_SCHEMA: 't24_control',
  POSTGRES_INSTANCE_ID: randomUUID(), POSTGRES_CLUSTER_ID: '', POSTGRES_BOOTSTRAP_USER: admin,
  PSQL_BIN: join(pg, 'psql'), SESSION_ORIGIN: 'https://t24.invalid', SESSION_SECRET_FILE: join(suite, 'synthetic-session.key'),
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
const accounts={admin:{id:'t24-admin',name:'Synthetic Admin',role:'管理员',operatorRole:'ADMIN'},warehouse:{id:'t24-warehouse',name:'Synthetic Warehouse',role:'仓库人员',operatorRole:'WAREHOUSE'},salesperson:{id:'t24-sales',name:'Synthetic Sales',role:'营业员',operatorRole:'SALESPERSON',hallId}};
const password=randomUUID()+'-synthetic-only';
const json=value=>literal(JSON.stringify(value))+'::jsonb';
function seed(){
 const s=ident(config.schemas.source),r=ident(config.schemas.runtime),a=ident(config.schemas.auth);
 const pack={revision:'SYNTHETIC-T24',packSha256:digest('Synthetic T24'),items:{}};
 for(const [sku,code]of [[skuId,'900'],[sku910,'910']])pack.items[sku]={source:{sku,product:'OLD900910',color:'001',sourceGroup:'原尺码组',sourceCode:code,sourceSize:'无尺码'},target:{group:'PANTS',fit:'A',code:'900',size:'无尺码'}};
 adminSql(config,`SET ROLE ${ident(config.roles.source)};
 INSERT INTO ${s}.category(id,code,code_normalized,name) VALUES(${literal(categoryId)},'CAT','CAT','合成分类');
 INSERT INTO ${s}.unit(id,code,code_normalized,name) VALUES(${literal(categoryId)},'PIECE','PIECE','件');
 INSERT INTO ${s}.counterparty(id,code,code_normalized,name) VALUES(${literal(supplierId)},'SUP','SUP','合成供应商');
 INSERT INTO ${s}.product(id,code,code_normalized,name,category_id,unit_id,counterparty_id) VALUES(${literal(productId)},'OLD900910','OLD900910','历史规格',${literal(categoryId)},${literal(categoryId)},${literal(supplierId)});
 INSERT INTO ${s}.spec_dimension(id,code,code_normalized,name) VALUES(${literal(colorDim)},'COLOR','COLOR','颜色'),(${literal(sizeDim)},'SIZE','SIZE','尺码');
 INSERT INTO ${s}.spec_value(id,dimension_id,code,code_normalized,name) VALUES(${literal(colorId)},${literal(colorDim)},'001','001','黑'),(${literal(old900)},${literal(sizeDim)},'900','900','无尺码'),(${literal(old910)},${literal(sizeDim)},'910','910','无尺码');
 INSERT INTO ${s}.variant(id,product_id,option_key) VALUES(${literal(skuId)},${literal(productId)},'900'),(${literal(sku910)},${literal(productId)},'910');
 INSERT INTO ${s}.variant_option(variant_id,dimension_id,spec_value_id) VALUES(${literal(skuId)},${literal(colorDim)},${literal(colorId)}),(${literal(skuId)},${literal(sizeDim)},${literal(old900)}),(${literal(sku910)},${literal(colorDim)},${literal(colorId)}),(${literal(sku910)},${literal(sizeDim)},${literal(old910)});
 ${warehouseIds.map((id,i)=>`INSERT INTO ${s}.warehouse(id,code,code_normalized,name,type) VALUES(${literal(id)},'W${i}','W${i}','合成仓库${i}','WAREHOUSE');`).join('')}
 INSERT INTO ${s}.tplus_import_run(batch_id,space_key,schema_name,database_name,manifest_path,manifest_sha256,preflight_batch_id,importer_version,status,git_sha,workspace_state_sha256) VALUES('T24','SYNTHETIC',${literal(config.schemas.source)},${literal(config.database)},'SYNTHETIC',repeat('0',64),'SYNTHETIC','T24','COMMITTED','SYNTHETIC',repeat('0',64));
 INSERT INTO ${s}.tplus_hall(batch_id,id,source_id,source_code,name,warehouse_ids,source_payload) VALUES('T24',${literal(hallId)},'HALL','HALL','合成厅',ARRAY[${warehouseIds.map(id=>literal(id)+'::uuid').join(',')}],'{}');
 INSERT INTO ${s}.tplus_product_source(batch_id,product_id,source_id,source_code,category_decision,source_payload) VALUES('T24',${literal(productId)},'OLD900910','OLD900910','{}','{"sourceSizeGroupCode":"原尺码组","year":"2020","season":"春","barcodeItemCode":"0000001"}');
 INSERT INTO ${s}.system_setting(key,value) VALUES('inventory.standard-size-mappings',${json(pack)});
 INSERT INTO ${s}.tplus_product_barcode(batch_id,source_id,product_id,barcode,is_default,binding_scope,sku_id,sku_binding_known,source_payload) VALUES
 ('T24','OLD900',${literal(productId)},'000900aB',true,'SKU',${literal(skuId)},true,'{}'),('T24','OLD910',${literal(productId)},'000910Ab',true,'SKU',${literal(sku910)},true,'{}');
 INSERT INTO ${s}.tplus_inventory_balance_source(batch_id,source_id,variant_id,warehouse_id,quantity,unit,opening_quantity,cutoff_source_date,snapshot_used,apply_historical_documents_again,source_event_count,components,source_payload) VALUES
 ('T24','PLUS',${literal(skuId)},${literal(warehouseIds[0])},5,'件',5,'2026-10-01',true,false,0,'{}','{}'),('T24','MINUS',${literal(skuId)},${literal(warehouseIds[1])},-5,'件',-5,'2026-10-01',true,false,0,'{}','{}');
 RESET ROLE;SET ROLE ${ident(config.roles.runtime)};
 INSERT INTO ${r}.operator(id,name,role,enabled) VALUES${Object.values(accounts).map(a=>`(${literal(a.id)},${literal(a.name)},${literal(a.operatorRole)},true)`).join(',')};
 INSERT INTO ${r}.master_data_entity(kind,id,body,source_facts,version,updated_by) VALUES${warehouseIds.map((id,i)=>`('warehouses',${literal(id)},${json({code:'W'+i,name:'合成仓库'+i,enabled:true,type:'WAREHOUSE',hallRelations:[hallId],sourceOwnershipUnknown:false})},'{}',1,'T24-fixture')`).join(',')};
 RESET ROLE;`);
 for(const account of Object.values(accounts)){
  const salt=randomBytes(24).toString('hex'),hash=pbkdf2Sync(password,salt,210000,32,'sha256').toString('hex');
  adminSql(config,`SET ROLE ${ident(config.roles.auth)};INSERT INTO ${a}.employee_login(id,login_name,body,password_salt,password_hash) VALUES(${literal(account.id)},${literal(account.id)},${json({name:account.name,role:account.role,employmentStatus:'在职',loginEnabled:true,enabled:true,loginName:account.id,...(account.hallId?{hallId:account.hallId,storeId:account.hallId}:{})})},${literal(salt)},${literal(hash)});RESET ROLE;`);
 }
}
async function login(name){const res=await app.inject({method:'POST',url:'/api/runtime/session',headers:{origin:environment.SESSION_ORIGIN},payload:{loginName:name,password}});assert.equal(res.statusCode,200,res.body);return {cookie:res.headers['set-cookie'].split(';')[0],csrf:res.json().data.csrfToken};}
async function get(session,url){return app.inject({method:'GET',url,headers:session?{cookie:session.cookie,origin:environment.SESSION_ORIGIN}:{}});}
async function post(session,url,input){return app.inject({method:'POST',url,headers:{cookie:session.cookie,origin:environment.SESSION_ORIGIN,'content-type':'application/json','x-csrf-token':session.csrf},payload:input});}
function success(res,label){assert.equal(res.statusCode,200,label+': '+res.body);return res.json().data;}
function fullFingerprint() {
  const schemas=Object.values(config.schemas), tables=adminValue(config,`SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname) ORDER BY n.nspname,c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN (${schemas.map(literal).join(',')})`);
  const rows=tables.map(t=>JSON.parse(adminSql(config,`SELECT jsonb_build_object('schema',${literal(t.schema)},'table',${literal(t.table)},'count',count(*),'digest',md5(coalesce(string_agg(h,'' ORDER BY h),'')))
    FROM (SELECT md5(to_jsonb(x)::text) h FROM ${ident(t.schema)}.${ident(t.table)} x) hashed`)));
  const sequences=adminValue(config,`SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname) ORDER BY n.nspname,c.relname),'[]'::jsonb)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname IN (${schemas.map(literal).join(',')})`);
  return {rows,sequences:sequences.map(t=>JSON.parse(adminSql(config,`SELECT jsonb_build_object('name',${literal(t.schema+'.'+t.name)},'value',last_value::text,'called',is_called) FROM ${ident(t.schema)}.${ident(t.name)}`)))};
}
import {exerciseIdentityUI} from '../tests/t24-ui.mjs';
try {
  assert.match(tool('postgres',['--version'],'version.log'),/PostgreSQL\) 17\./);
  tool('initdb',['-D',data,'-U',admin,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C','--wal-segsize=1','--set','min_wal_size=2MB','--set','max_wal_size=8MB'],'initdb.log');
  tool('pg_ctl',['-D',data,'-l',join(suite,'postgres.log'),'-o',`-c listen_addresses='' -c min_wal_size=2MB -c max_wal_size=8MB -c unix_socket_permissions=0700 -c unix_socket_directories=${socket} -p ${port}`,'-w','start'],'start.log');started=true;
  const cluster=JSON.parse(tool('psql',['-X','-w','-qAt',...conn('postgres'),'-c',"SELECT jsonb_build_object('clusterId',system_identifier::text,'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses')) FROM pg_control_system()"],'identity.log'));
  assert.equal(cluster.dataDirectory,data);assert.equal(cluster.listenAddresses,'');environment.POSTGRES_CLUSTER_ID=cluster.clusterId;result.cluster=cluster;
  tool('createdb',['-h',socket,'-p',port,'-U',admin,'-T','template0',databaseName],'qa-create.log');
  writeFileSync(environment.SESSION_SECRET_FILE,randomBytes(48),{mode:0o600});
  config=readDatabaseConfig(environment);assertIsolatedTarget(config);targets.push({environment:'qa',database:config.database,instanceId:config.instanceId});
  await maintenance(environment,'bootstrap','qa-bootstrap.log');await maintenance(environment,'migrate','qa-migrate.log');
  seed();app=createApp(readConfig(environment));
  const session=await login(accounts.admin.id),sales=await login(accounts.salesperson.id);
  const s=ident(config.schemas.source),group=sizeGroups().find(g=>g.id==='UPPER'),fresh=uid(500);
  success(await post(session,'/api/runtime/product-profile',{requestKey:randomUUID(),productId:fresh,newCode:'QA-MULTIFIT',expectedVersion:0,
    profile:{name:'合成多版型',categoryId:'CAT',supplierId,unitId:categoryId,year:'2026',season:'春',barcodeItemCode:'0123456',schemeId:'2026',fitId:'A',groupId:'UPPER',enabled:true,price:'10.00'},
    specs:{colors:[colorId],fits:['A','B'],sizes:group.sizes.map(s=>({...s,groupName:group.name}))},aliases:[],removedAliases:[]}), 'create synthetic A/B');
  let cat=success(await get(session,'/api/runtime/catalog'),'catalog');const a=cat.skus.find(x=>x.product_id===fresh&&x.fit_id==='A'&&x.options.SIZE.name==='170/M'),b=cat.skus.find(x=>x.product_id===fresh&&x.fit_id==='B'&&x.options.SIZE.name==='170/M');
  const alias='00aB-OLD';const profile=cat.profiles.find(x=>x.product_id===fresh);
  success(await post(session,'/api/runtime/product-profile',{requestKey:randomUUID(),productId:fresh,expectedVersion:profile.version,profile:{name:'合成多版型'},aliases:[{skuId:b.id,code:alias,note:'登记旧码'},{skuId:b.id,code:'07',note:'已登记短旧码'}],removedAliases:[]}), 'register alias');
  // A source ambiguity and product-only code are deliberately synthetic. No inference from digits.
  adminSql(config,`SET ROLE ${ident(config.roles.source)};
    INSERT INTO ${s}.tplus_product_barcode(batch_id,source_id,product_id,barcode,is_default,binding_scope,sku_id,sku_binding_known,source_payload) VALUES
    ('T24','AMB900',${literal(productId)},'AMB-000',false,'SKU',${literal(skuId)},true,'{}'),
    ('T24','AMB910',${literal(productId)},'AMB-000',false,'SKU',${literal(sku910)},true,'{}'),
    ('T24','SHORT',${literal(productId)},'01',false,'PRODUCT',NULL,false,'{}');
    RESET ROLE;`);
  const original=fullFingerprint(),api=async path=>success(await get(sales,'/api'+path),path);
  const snapshot=await api('/runtime/product-identity');assert.equal(snapshot.version,1);assert.notEqual(a.id,b.id);
  for(const [code,id]of [['000900aB',skuId],['000910Ab',sku910],[alias,b.id],['07',b.id]]){
    const hit=await api('/runtime/product-identity?code='+encodeURIComponent('  '+code+'  '));assert.equal(hit.kind,'sku');assert.equal(hit.skuId,id);
    assert.deepEqual(await api('/runtime/barcode?code='+encodeURIComponent(code)),await api('/runtime/product-identity?code='+encodeURIComponent(code)));
  }
  assert.equal((await api('/runtime/product-identity?code=00AB-OLD')).kind,'not-found');
  assert.equal((await api('/runtime/product-identity?code=900aB')).kind,'not-found');
  const ambiguous=await api('/runtime/product-identity?code=AMB-000');assert.equal(ambiguous.kind,'ambiguous');assert.equal(ambiguous.skuId,undefined);assert.equal(ambiguous.candidates.length,2);
  assert.equal((await api('/runtime/product-identity?code=01')).kind,'product');assert.equal((await api('/runtime/product-identity?code=QA-MULTIFIT')).kind,'product');
  assert.equal((await get(null,'/api/runtime/product-identity')).statusCode,401);
  assert.deepEqual(fullFingerprint(),original,'catalog/resolve queries change no table or sequence');
  checked('A1 exact original SKU, fit A/B, leading zeros, case-sensitive registered alias; old endpoint has identical result',{aSku:a.id,bSku:b.id,sku900:skuId,sku910,alias});
  checked('A2 ambiguity has no unique SKU; product-only and missing codes cannot add quantity');
  checked('Identity snapshot and matrix candidates are authenticated read-only; full database fingerprint unchanged');
  cat=await api('/runtime/catalog');
  result.ui=await exerciseIdentityUI({catalog:cat,snapshot,api,warehouses:warehouseIds.map(id=>({id,name:id})),sku900:skuId,sku910,alias,aSku:a.id,bSku:b.id});
  assert.deepEqual(fullFingerprint(),original,'candidate selection, scan and matrix editing remain drafts; original inventory/identity tables unchanged');
  checked('A3 display-merged 900/910 quantities remain independent original UUIDs; covered entrypoints use one identity contract',result.ui);
  checked('A4 repeated scan event is ignored; explicit new scan adds one; different prices require selection; matrix requires explicit quantity');
  const stoppedBefore=await api('/runtime/catalog'),version=stoppedBefore.profiles.find(x=>x.product_id===fresh).version;
  success(await post(session,'/api/runtime/product-profile',{requestKey:randomUUID(),productId:fresh,expectedVersion:version,profile:{disabledSkuIds:[b.id]},aliases:[],removedAliases:[]}), 'stop B SKU');
  const stopped=await api('/runtime/product-identity?code='+alias);assert.equal(stopped.skuId,b.id);assert.equal(stopped.candidates[0].enabled,false);
  result.stoppedUI=await exerciseIdentityUI({catalog:await api('/runtime/catalog'),snapshot:await api('/runtime/product-identity'),api,warehouses:[],sku900:skuId,sku910,alias,aSku:a.id,bSku:b.id,stopped:true});
  const nextVersion=(await api('/runtime/catalog')).profiles.find(x=>x.product_id===fresh).version;
  success(await post(session,'/api/runtime/product-profile',{requestKey:randomUUID(),productId:fresh,expectedVersion:nextVersion,profile:{enabled:false},aliases:[],removedAliases:[]}), 'stop product');
  assert.equal((await api('/runtime/product-identity?code='+cat.barcodes.find(x=>x.sku_id===a.id).barcode)).candidates[0].enabled,false);
  checked('Disabled SKU/product still resolves to its original identity; scan and matrix refuse new use');
  // Readonly role can resolve, never create identities.
  assert.equal((await post(sales,'/api/runtime/product-profile',{requestKey:randomUUID(),productId:fresh,expectedVersion:999,profile:{name:'forbidden'}})).statusCode,403);
  result.status='PASS';result.identityCount=snapshot.skus.length;result.syntheticOnly=true;
} catch(error){result.status='FAIL';result.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{
  try{await app?.close();}catch(error){result.closeError=error.message;result.status='FAIL';process.exitCode=1;}
  if(started){try{tool('pg_ctl',['-D',data,'-m','immediate','-w','stop'],'stop.log');result.clusterStopped=true;}catch(error){result.stopError=error.message;result.status='FAIL';process.exitCode=1;}}
  result.targets=targets;writeJson(join(out,'qa-verification.json'),result);
}
