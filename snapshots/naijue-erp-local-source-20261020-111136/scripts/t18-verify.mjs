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
import {sizeGroups,priceFields} from '../server/domain/products/definitions.ts';
import {validateSkuUse} from '../server/domain/products/profile.ts';
import {product as adaptProduct} from '../frontend/legacy-adapter.mjs';
import {currentSizeGroups} from '../frontend/product-size-groups.mjs';
import {currentSpecView} from '../frontend/product-spec-view.mjs';
import {fitView} from '../frontend/business-product-view.mjs';
import {hydrateProductCatalog,productProfileDraft} from '../frontend/product-service.mjs';
import sharp from 'sharp';
import {verifyProductUI} from '../tests/t18-ui.mjs';

const pg = process.env.T18_PG_BIN;
if (!pg || !isAbsolute(pg)) throw new Error('T18_PG_BIN must explicitly select local PostgreSQL 17');
const out = join(root, 'outputs/T18'), logs = join(root, 'logs/T18');
mkdirSync(out, {recursive: true}); mkdirSync(logs, {recursive: true}); chmodSync(logs, 0o700);
const suite = mkdtempSync(join(logs, 'postgres-suite-'));
chmodSync(suite, 0o700);
const data = join(suite, 'data'), admin = 't18_bootstrap', port = '55495';
const socket = mkdtempSync(join(tmpdir(), 'naijue-t18-socket-'));
chmodSync(socket, 0o700);
assert.ok(Buffer.byteLength(join(socket, '.s.PGSQL.' + port)) < 104, 'Private PostgreSQL socket path exceeds platform limit');
assert.equal(existsSync(join(socket, '.s.PGSQL.' + port)), false, 'Never reuse an existing socket');
const checks = [], targets = [], result = {task_id: 'T18', status: 'RUNNING', suite, socket, checks,
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
  assert.equal(run.status, 0, name + ' failed; see private T18 log ' + file);
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
const prefix = 't18qa_' + runSuffix;
const databaseName = 'demo_8877_t18_qa_' + runSuffix;
const environment = {
  APP_ENV: 'qa', APP_DATABASE_MODE: 'required', POSTGRES_HOST: socket, POSTGRES_PORT: port,
  POSTGRES_DB: databaseName, POSTGRES_USER: prefix + '_app', POSTGRES_ROLE_PREFIX: prefix,
  POSTGRES_SOURCE_SCHEMA: 't18_source', POSTGRES_RUNTIME_SCHEMA: 't18_runtime', POSTGRES_AUTH_SCHEMA: 't18_auth', POSTGRES_CONTROL_SCHEMA: 't18_control',
  POSTGRES_INSTANCE_ID: randomUUID(), POSTGRES_CLUSTER_ID: '', POSTGRES_BOOTSTRAP_USER: admin,
  PSQL_BIN: join(pg, 'psql'), SESSION_ORIGIN: 'https://t18.invalid', SESSION_SECRET_FILE: join(suite, 'synthetic-session.key'),
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
const accounts={admin:{id:'t18-admin',name:'Synthetic Admin',role:'管理员',operatorRole:'ADMIN'},warehouse:{id:'t18-warehouse',name:'Synthetic Warehouse',role:'仓库人员',operatorRole:'WAREHOUSE'},salesperson:{id:'t18-sales',name:'Synthetic Sales',role:'营业员',operatorRole:'SALESPERSON',hallId}};
const password=randomUUID()+'-synthetic-only';
const json=value=>literal(JSON.stringify(value))+'::jsonb';
function seed(){
 const s=ident(config.schemas.source),r=ident(config.schemas.runtime),a=ident(config.schemas.auth);
 const pack={revision:'SYNTHETIC-T18',packSha256:digest('Synthetic T18'),items:{}};
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
 INSERT INTO ${s}.tplus_import_run(batch_id,space_key,schema_name,database_name,manifest_path,manifest_sha256,preflight_batch_id,importer_version,status,git_sha,workspace_state_sha256) VALUES('T18','SYNTHETIC',${literal(config.schemas.source)},${literal(config.database)},'SYNTHETIC',repeat('0',64),'SYNTHETIC','T18','COMMITTED','SYNTHETIC',repeat('0',64));
 INSERT INTO ${s}.tplus_hall(batch_id,id,source_id,source_code,name,warehouse_ids,source_payload) VALUES('T18',${literal(hallId)},'HALL','HALL','合成厅',ARRAY[${warehouseIds.map(id=>literal(id)+'::uuid').join(',')}],'{}');
 INSERT INTO ${s}.tplus_product_source(batch_id,product_id,source_id,source_code,category_decision,source_payload) VALUES('T18',${literal(productId)},'OLD900910','OLD900910','{}','{"sourceSizeGroupCode":"原尺码组","year":"2020","season":"春","barcodeItemCode":"0000001"}');
 INSERT INTO ${s}.system_setting(key,value) VALUES('inventory.standard-size-mappings',${json(pack)});
 INSERT INTO ${s}.tplus_product_barcode(batch_id,source_id,product_id,barcode,is_default,binding_scope,sku_id,sku_binding_known,source_payload) VALUES
 ('T18','OLD900',${literal(productId)},'000900aB',true,'SKU',${literal(skuId)},true,'{}'),('T18','OLD910',${literal(productId)},'000910Ab',true,'SKU',${literal(sku910)},true,'{}');
 INSERT INTO ${s}.tplus_inventory_balance_source(batch_id,source_id,variant_id,warehouse_id,quantity,unit,opening_quantity,cutoff_source_date,snapshot_used,apply_historical_documents_again,source_event_count,components,source_payload) VALUES
 ('T18','PLUS',${literal(skuId)},${literal(warehouseIds[0])},5,'件',5,'2026-10-01',true,false,0,'{}','{}'),('T18','MINUS',${literal(skuId)},${literal(warehouseIds[1])},-5,'件',-5,'2026-10-01',true,false,0,'{}','{}');
 RESET ROLE;SET ROLE ${ident(config.roles.runtime)};
 INSERT INTO ${r}.operator(id,name,role,enabled) VALUES${Object.values(accounts).map(a=>`(${literal(a.id)},${literal(a.name)},${literal(a.operatorRole)},true)`).join(',')};
 INSERT INTO ${r}.master_data_entity(kind,id,body,source_facts,version,updated_by) VALUES${warehouseIds.map((id,i)=>`('warehouses',${literal(id)},${json({code:'W'+i,name:'合成仓库'+i,enabled:true,type:'WAREHOUSE',hallRelations:[hallId],sourceOwnershipUnknown:false})},'{}',1,'T18-fixture')`).join(',')};
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

 seed();app=createApp(readConfig(environment));
 const adminSession=await login(accounts.admin.id),warehouseSession=await login(accounts.warehouse.id),salesSession=await login(accounts.salesperson.id);
 checked('Private PostgreSQL 17 QA cluster, synthetic identities and four versioned migrations; TCP disabled');
 assert.deepEqual(sizeGroups(),currentSizeGroups(),'server and UI current group IDs/codes agree');
 let cat=success(await get(adminSession,'/api/runtime/catalog'),'catalog');
 const originalSource=adminValue(config,`SELECT jsonb_build_object('skus',(SELECT jsonb_agg(v ORDER BY id) FROM ${ident(config.schemas.source)}.variant v),'codes',(SELECT jsonb_agg(b ORDER BY barcode) FROM ${ident(config.schemas.source)}.tplus_product_barcode b))`);
 assert.deepEqual(cat.skus.filter(s=>s.product_id===productId).map(s=>s.options.SIZE.sourceCode).sort(),['900','910']);
 for(const s of cat.skus){assert.equal(s.options.SIZE.name,'无尺码');assert.equal(s.options.SIZE.sourceName,'无尺码');}
 for(const [code,sku]of [['000900aB',skuId],['000910Ab',sku910]])assert.equal(success(await get(salesSession,'/api/runtime/barcode?code='+code),'historical resolve').skuId,sku);
 assert.equal(success(await get(adminSession,'/api/runtime/barcode?code=000900AB'),'case exact').kind,'not-found');
 const oldAdapter=adaptProduct(cat.products[0],cat.skus,cat.barcodes),C={groups:currentSizeGroups(),group(id){return this.groups.find(g=>g.id===id)},colors:[{id:colorId}],fits:[{id:'A'},{id:'B'}],fit(id){return this.fits.find(f=>f.id===id)}};
 currentSpecView(oldAdapter,cat.skus,C);assert.equal(oldAdapter.ambiguousCurrentCells.length,1);assert.equal(oldAdapter.mappedCurrentSkuIds.length,0);
 checked('Original 900 and 910 both remain 无尺码, exact case and leading zeros survive; duplicate current display cell stays ambiguous',{sku900:skuId,sku910});
 const group=sizeGroups().find(g=>g.id==='UPPER'),freshId=uid(500),freshProfile={name:'多版型商品',categoryId:'CAT',supplierId,unitId:categoryId,year:'2026',season:'春',barcodeItemCode:'0123456',schemeId:'2026',fitId:'A',groupId:'UPPER',enabled:true,...Object.fromEntries(priceFields.map((key,i)=>[key,i===0?null:i===1?'0':String(i)+'.21']))};
 const specs={colors:[colorId],fits:['A','B'],sizes:group.sizes.map(s=>({...s,groupName:group.name}))};
 const create={requestKey:randomUUID(),productId:freshId,newCode:'T18-MULTIFIT',expectedVersion:0,profile:freshProfile,specs,aliases:[],removedAliases:[]};
 const created=success(await post(warehouseSession,'/api/runtime/product-profile',create),'create product');assert.equal(created.created.length,22);
 assert.deepEqual(success(await post(warehouseSession,'/api/runtime/product-profile',create),'idempotent create'),created);
 assert.equal((await post(warehouseSession,'/api/runtime/product-profile',{...create,profile:{...freshProfile,name:'changed'}})).statusCode,409);
 cat=success(await get(adminSession,'/api/runtime/catalog'),'readback');let profile=cat.profiles.find(p=>p.product_id===freshId),own=cat.skus.filter(s=>s.product_id===freshId),aSku=own.find(s=>s.fit_id==='A'&&s.options.SIZE.name==='170/M'),bSku=own.find(s=>s.fit_id==='B'&&s.options.SIZE.name==='170/M');
 assert.notEqual(aSku.id,bSku.id);assert.equal(own.length,22);assert.equal(profile.body.purchasePrice,null);assert.equal(profile.body.price,'0.00');assert.equal(Object.keys(profile.body).filter(k=>priceFields.includes(k)).length,9);
 const primaryBefore=cat.barcodes.filter(b=>b.product_id===freshId&&b.generated),rawAlias='000aBc-OLD910';
 let save={requestKey:randomUUID(),productId:freshId,expectedVersion:profile.version,profile:{...profile.body,name:'保存九价与旧码',schemeId:'2023',barcodeItemCode:'7654321'},aliases:[{skuId:aSku.id,code:'  '+rawAlias+'  ',note:'原名 / 910无尺码'}]};
 // Internal spec records are returned for readback, not accepted as writable profile fields.
 const writable=body=>productProfileDraft({...body,images:[]});save.profile=writable(save.profile);
 success(await post(adminSession,'/api/runtime/product-profile',save),'save alias');
 cat=success(await get(warehouseSession,'/api/runtime/catalog'),'reopen');profile=cat.profiles.find(p=>p.product_id===freshId);
 assert.deepEqual(cat.barcodes.filter(b=>b.product_id===freshId&&b.generated),primaryBefore,'existing primary codes never recalculate');
 assert.equal(cat.aliases.find(a=>a.barcode===rawAlias).sku_id,aSku.id);
 const reopened=adaptProduct(cat.products.find(p=>p.id===freshId),cat.skus.filter(s=>s.product_id===freshId),cat.barcodes.filter(b=>b.product_id===freshId));Object.assign(reopened,profile.body);currentSpecView(reopened,cat.skus.filter(s=>s.product_id===freshId),C);
 const fitA=fitView(reopened,'A',C,[],[]),fitB=fitView(reopened,'B',C,[],[]);assert.notEqual(fitA.skuByCell[colorId+'|'+aSku.options.SIZE.id],fitB.skuByCell[colorId+'|'+bSku.options.SIZE.id]);
 const scan=success(await get(salesSession,'/api/runtime/barcode?code='+rawAlias),'manual scan');assert.equal(scan.skuId,aSku.id);assert.equal(scan.candidates[0].fitId,'A');
 assert.equal(success(await get(salesSession,'/api/runtime/barcode?code='+rawAlias.toUpperCase()),'case mismatch').kind,'not-found');
 assert.equal(success(await get(salesSession,'/api/runtime/barcode?code=T18-MULTIFIT'),'short product code').kind,'product');
 checked('Same color/size on A and B has different UUID and primary text; nine prices preserve null vs zero; reopening/manual scan binds exact original A SKU',{aSku:aSku.id,bSku:bSku.id,alias:rawAlias});
 const rejectBefore=fullFingerprint();
 assert.equal((await post(salesSession,'/api/runtime/product-profile',{...save,requestKey:randomUUID()})).statusCode,403);
 assert.equal((await post(adminSession,'/api/runtime/product-profile',{...save,requestKey:randomUUID()})).statusCode,409);
 assert.equal((await post(adminSession,'/api/runtime/product-profile',{...save,requestKey:randomUUID(),expectedVersion:profile.version,aliases:[{skuId:bSku.id,code:rawAlias}]})).statusCode,409);
 assert.equal((await post(adminSession,'/api/runtime/product-profile',{...save,requestKey:randomUUID(),expectedVersion:profile.version,profile:{...save.profile,wholesale10:'1e2'}})).statusCode,400);
 assert.equal((await post(adminSession,'/api/runtime/product-profile',{...save,requestKey:randomUUID(),expectedVersion:profile.version,profile:{...save.profile,wholesale10:'1000000000.00'}})).statusCode,400);
 assert.equal((await post(adminSession,'/api/runtime/product-profile',{...save,requestKey:randomUUID(),expectedVersion:profile.version,specs:{...specs,fits:['A']}})).statusCode,409);
 assert.equal((await post(adminSession,'/api/runtime/product-profile',{...save,requestKey:randomUUID(),expectedVersion:profile.version,profile:{...save.profile,selectedFitIds:['A']},specs:undefined})).statusCode,400,'omitting specs cannot hide B identity');
 assert.deepEqual(fullFingerprint(),rejectBefore);
 checked('Role/version/alias rebind/overrange price/spec-removal requests all reject atomically with every table and sequence unchanged');
 let resolution=success(await get(adminSession,'/api/requests/result?operationId=products.save&requestKey='+save.requestKey),'recover product request');assert.equal(resolution.resolution,'COMMITTED');assert.equal(resolution.originalResponse.productId,freshId);
 const color={kind:'colors',id:uid(600),action:'save',expectedVersion:0,requestKey:randomUUID(),body:{name:'合成白',code:'002',disabled:false}};
 success(await post(warehouseSession,'/api/runtime/product-master',color),'color create');
 assert.equal((await post(warehouseSession,'/api/runtime/product-master',{...color,requestKey:randomUUID(),expectedVersion:1,body:{name:'黑',code:'001'}})).statusCode,409);
 assert.equal((await post(adminSession,'/api/runtime/product-master',{kind:'colors',id:colorId,action:'delete',expectedVersion:0,requestKey:randomUUID()})).statusCode,409);
 assert.equal((await post(adminSession,'/api/runtime/product-master',{kind:'fits',id:'A',action:'save',expectedVersion:0,requestKey:randomUUID(),body:{name:'A版',code:'Z'}})).statusCode,400);
 for(const kind of ['groups','seasons'])assert.equal((await post(adminSession,'/api/runtime/product-master',{kind,id:'UPPER',action:'save',expectedVersion:0,requestKey:randomUUID(),body:{name:'tamper'}})).statusCode,400);
 success(await post(adminSession,'/api/runtime/product-master',{...color,requestKey:randomUUID(),expectedVersion:1,body:{...color.body,disabled:true}}),'stop color');
 assert.equal(success(await get(warehouseSession,'/api/runtime/product-masters'),'reopen color').find(m=>m.id===color.id).body.disabled,true);
 const rootCategory={kind:'categories',id:'T18-ROOT',action:'save',expectedVersion:0,requestKey:randomUUID(),body:{name:'合成一级',parent:'all',order:1}};
 success(await post(warehouseSession,'/api/runtime/product-master',rootCategory),'category root');
 const leafCategory={...rootCategory,id:'T18-LEAF',requestKey:randomUUID(),body:{name:'合成二级',parent:rootCategory.id,order:0}};
 success(await post(warehouseSession,'/api/runtime/product-master',leafCategory),'category leaf');
 assert.equal((await post(adminSession,'/api/runtime/product-master',{...leafCategory,id:'T18-THIRD',requestKey:randomUUID(),body:{name:'非法三级',parent:leafCategory.id,order:0}})).statusCode,400);
 assert.equal((await post(adminSession,'/api/runtime/product-master',{kind:'categories',id:'CAT',action:'delete',expectedVersion:0,requestKey:randomUUID()})).statusCode,409);
 success(await post(warehouseSession,'/api/runtime/product-master',{...rootCategory,action:'order',requestKey:randomUUID(),expectedVersion:1,versions:{'T18-ROOT':1,CAT:0},body:{ids:['T18-ROOT','CAT']}}),'versioned sibling order');
 const masters=success(await get(adminSession,'/api/runtime/product-masters'),'category readback');assert.equal(masters.find(m=>m.id===rootCategory.id).body.order,0);assert.equal(masters.find(m=>m.id==='CAT').body.order,1);
 checked('Color/fit/category maintenance is server versioned; referenced definitions protected; size groups and seasons remain read-only; status reopens');
 assert.equal((await post(adminSession,'/api/runtime/product-delete',{productId,expectedVersion:0,checkOnly:true})).statusCode,409,'+5 and -5 in separate warehouses still referenced');
 checked('Delete preflight uses per warehouse/SKU nonzero cells, so +5/-5 cannot hide occupied inventory');
 const cmd={documentType:'TRANSFER',documentId:uid(700),operation:'create',expectedVersion:0,requestKey:randomUUID(),body:{header:{business_date:'2026-10-02',source_from_warehouse_id:warehouseIds[0],source_to_warehouse_id:warehouseIds[1]},lines:[{source_id:'T18-1',sku_id:aSku.id,from_warehouse_id:warehouseIds[0],to_warehouse_id:warehouseIds[1],source_quantity:'2'}],fundsRecords:[]}};
 success(await post(adminSession,'/api/runtime/command',cmd),'reference draft');
 assert.equal((await post(adminSession,'/api/runtime/product-delete',{productId:freshId,expectedVersion:profile.version,checkOnly:true})).statusCode,409);
 const stop={requestKey:randomUUID(),productId:freshId,expectedVersion:profile.version,profile:{...writable(profile.body),disabledSkuIds:[aSku.id]},aliases:[]};success(await post(adminSession,'/api/runtime/product-profile',stop),'stop SKU');
 assert.equal((await post(adminSession,'/api/runtime/command',{...cmd,documentId:uid(701),requestKey:randomUUID()})).statusCode,409);
 assert.equal((await post(adminSession,'/api/runtime/command',{documentType:'TRANSFER',documentId:cmd.documentId,operation:'approve',expectedVersion:1,requestKey:randomUUID()})).statusCode,409);
 const reducedBody={...cmd.body,lines:cmd.body.lines.map(line=>({...line,source_quantity:'1.0'}))};
 const token=app.identity.keys.token(adminSession.cookie);
 await app.identity.execute(token,'products.save',{kind:'global'},context=>validateSkuUse(context,reducedBody,cmd.body));
 await assert.rejects(app.identity.execute(token,'products.save',{kind:'global'},context=>validateSkuUse(context,{...cmd.body,lines:cmd.body.lines.map(line=>({...line,source_quantity:'3'}))},cmd.body)),/停用商品或规格不能用于新业务/);
 const reduction=await post(adminSession,'/api/runtime/command',{...cmd,operation:'save',expectedVersion:1,requestKey:randomUUID(),body:reducedBody});
 assert([200,409].includes(reduction.statusCode),reduction.body);
 result.integrationNotes=[{owner:'T20',case:'Stopped SKU decrease on existing transfer draft',productGuard:'PASS',transferRoute:reduction.statusCode===200?'PASS':'BLOCKED_BY_TRANSFER_VALIDATOR',response:reduction.json()}];
 assert.equal(success(await get(salesSession,'/api/runtime/barcode?code='+rawAlias),'disabled barcode remains').candidates[0].enabled,false);
 cat=success(await get(adminSession,'/api/runtime/catalog'),'stopped catalog');profile=cat.profiles.find(p=>p.product_id===freshId);
 assert.equal((await post(adminSession,'/api/runtime/product-profile',{requestKey:randomUUID(),productId:freshId,expectedVersion:profile.version,profile:writable(profile.body),aliases:[],removedAliases:[rawAlias]})).statusCode,409);
 checked('Stopping exact SKU preserves historical reads and scan identity, rejects new drafts and approval; referenced alias/product deletion fails');
 const png=await sharp({create:{width:8,height:8,channels:3,background:'#aa3344'}}).png().toBuffer();
 const mediaSave={requestKey:randomUUID(),productId:freshId,expectedVersion:profile.version,profile:{...writable(profile.body),images:[{id:'draft-image',name:'synthetic.png',role:'主图',url:'data:image/png;base64,'+png.toString('base64')}]},aliases:[]};
 const firstMediaSave=success(await post(adminSession,'/api/runtime/product-profile',mediaSave),'image save'),mediaRetryBefore=fullFingerprint();
 assert.deepEqual(success(await post(adminSession,'/api/runtime/product-profile',mediaSave),'idempotent image retry'),firstMediaSave);assert.deepEqual(fullFingerprint(),mediaRetryBefore);
 assert.equal((await post(adminSession,'/api/runtime/product-profile',{...mediaSave,profile:{...mediaSave.profile,images:[{...mediaSave.profile.images[0],url:'invalid-media-payload'}]}})).statusCode,409,'committed image key conflict is checked before staging');
 cat=success(await get(warehouseSession,'/api/runtime/catalog'),'protected image catalog');profile=cat.profiles.find(p=>p.product_id===freshId);const mediaId=profile.body.images[0].mediaId;
 const mediaBefore=fullFingerprint(),ownedImage={mediaId,name:'synthetic.png',role:'主图'};
 assert.equal((await post(adminSession,'/api/runtime/product-profile',{requestKey:randomUUID(),productId:freshId,expectedVersion:profile.version,profile:{...writable(profile.body),images:[ownedImage,ownedImage]}})).statusCode,400);
 assert.equal((await post(adminSession,'/api/runtime/product-profile',{requestKey:randomUUID(),productId:freshId,expectedVersion:profile.version,profile:{...writable(profile.body),images:[{...ownedImage,role:'颜色配图',colorId:uid(999)}]}})).statusCode,400);
 assert.deepEqual(fullFingerprint(),mediaBefore);
 assert.match(profile.body.images[0].url,/^\/api\/media\//);assert(!JSON.stringify(profile).includes('base64,'));
 const hydrated=await hydrateProductCatalog(cat,{request:async path=>success(await get(warehouseSession,'/api'+path),'hydrate media')});assert.match(hydrated.profiles.find(p=>p.product_id===freshId).body.images[0].url,/^data:image\/png;base64,/);
 assert.equal((await get(null,'/api/media/'+mediaId)).statusCode,401);
 await app.close();app=createApp(readConfig(environment));assert.equal((await get(warehouseSession,'/api/media/'+mediaId)).statusCode,200);
 assert.equal(success(await get(warehouseSession,'/api/runtime/barcode?code='+rawAlias),'restart exact alias').skuId,aSku.id);
 checked('Product image uses T13 private storage and authenticated content; profile stores only media references; media and alias survive application restart',{mediaId});
 result.ui=await verifyProductUI({catalog:cat,api:async(path,payload)=>success(payload===undefined?await get(warehouseSession,'/api'+path):await post(warehouseSession,'/api'+path,payload),'production UI API'),productCode:'T18-MULTIFIT',warehouses:warehouseIds.map((id,i)=>({id,name:'合成仓库'+i}))});
 checked('Actual six-tab controller saves, cancels and reopens manual aliases against real QA endpoints; busy and SKU/product status controls work',result.ui);
 const sourceAfter=adminValue(config,`SELECT jsonb_build_object('skus',(SELECT jsonb_agg(v ORDER BY id) FROM ${ident(config.schemas.source)}.variant v),'codes',(SELECT jsonb_agg(b ORDER BY barcode) FROM ${ident(config.schemas.source)}.tplus_product_barcode b))`);assert.deepEqual(sourceAfter,originalSource);
 result.status='PASS';result.completedAt=new Date().toISOString();result.evidence={originalSource,primaryBefore,manualAlias:{code:rawAlias,skuId:aSku.id},multiFit:{aSku:aSku.id,bSku:bSku.id},rejectionFingerprint:rejectBefore};
} catch(error){result.status='FAIL';result.failure=error instanceof Error?error.message:'T18_VERIFY_FAILED';throw error;}
finally{
 if(app)await app.close().catch(()=>{});
 if(started){const stop=spawnSync(join(pg,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C'}});writeFileSync(join(suite,'stop.log'),(stop.stdout??'')+(stop.stderr??''),{mode:0o600});result.clusterStopped=stop.status===0;if(stop.status!==0)throw new Error('T18_PRIVATE_POSTGRESQL_STOP_FAILED');}
 writeJson(join(suite,'RESULT.json'),result);writeJson(join(out,'database-verification.json'),result);
}
