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

const pg = process.env.T26_PG_BIN;
if (!pg || !isAbsolute(pg)) throw new Error('T26_PG_BIN must explicitly select local PostgreSQL 17');
const out = join(root, 'outputs/T26'), logs = join(root, 'logs/T26');
mkdirSync(out, {recursive: true}); mkdirSync(logs, {recursive: true}); chmodSync(logs, 0o700);
const suite = mkdtempSync(join(logs, 'postgres-suite-'));
chmodSync(suite, 0o700);
const data = join(suite, 'data'), admin = 't26_bootstrap', port = '55486';
const socket = mkdtempSync(join(tmpdir(), 'naijue-t26-socket-'));
chmodSync(socket, 0o700);
assert.ok(Buffer.byteLength(join(socket, '.s.PGSQL.' + port)) < 104, 'Private PostgreSQL socket path exceeds platform limit');
assert.equal(existsSync(join(socket, '.s.PGSQL.' + port)), false, 'Never reuse an existing socket');
const checks = [], targets = [], result = {task_id: 'T26', status: 'RUNNING', suite, socket, checks,
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
  assert.equal(run.status, 0, name + ' failed; see private T26 log ' + file);
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
import {verifyReferenceImportUI} from '../tests/t26-ui.mjs';
const uid = n => `26000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const warehouseIds = [uid(201),uid(202)], productId = uid(101), skuId = uid(102), hallId = uid(301);
const categoryId=uid(110),supplierId=uid(120),colorId=uid(130),colorDim=uid(131),sizeDim=uid(132),old900=uid(140),old910=uid(141),sku910=uid(103);
const digest = text => createHash('sha256').update(text).digest('hex');
const runSuffix = randomUUID().replaceAll('-','').slice(0,8);
const prefix = 't26qa_' + runSuffix;
const databaseName = 'demo_8877_t26_qa_' + runSuffix;
const environment = {
  APP_ENV: 'qa', APP_DATABASE_MODE: 'required', POSTGRES_HOST: socket, POSTGRES_PORT: port,
  POSTGRES_DB: databaseName, POSTGRES_USER: prefix + '_app', POSTGRES_ROLE_PREFIX: prefix,
  POSTGRES_SOURCE_SCHEMA: 't26_source', POSTGRES_RUNTIME_SCHEMA: 't26_runtime', POSTGRES_AUTH_SCHEMA: 't26_auth', POSTGRES_CONTROL_SCHEMA: 't26_control',
  POSTGRES_INSTANCE_ID: randomUUID(), POSTGRES_CLUSTER_ID: '', POSTGRES_BOOTSTRAP_USER: admin,
  PSQL_BIN: join(pg, 'psql'), SESSION_ORIGIN: 'https://t26.invalid', SESSION_SECRET_FILE: join(suite, 'synthetic-session.key'),
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
const accounts={admin:{id:'t26-admin',name:'Synthetic Admin',role:'管理员',operatorRole:'ADMIN'},warehouse:{id:'t26-warehouse',name:'Synthetic Warehouse',role:'仓库人员',operatorRole:'WAREHOUSE'},salesperson:{id:'t26-sales',name:'Synthetic Sales',role:'营业员',operatorRole:'SALESPERSON',hallId}};
const password=randomUUID()+'-synthetic-only';
const json=value=>literal(JSON.stringify(value))+'::jsonb';
function seed(){
 const s=ident(config.schemas.source),r=ident(config.schemas.runtime),a=ident(config.schemas.auth);
 const pack={revision:'SYNTHETIC-T26',packSha256:digest('Synthetic T26'),items:{}};
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
 INSERT INTO ${s}.tplus_import_run(batch_id,space_key,schema_name,database_name,manifest_path,manifest_sha256,preflight_batch_id,importer_version,status,git_sha,workspace_state_sha256) VALUES('T26','SYNTHETIC',${literal(config.schemas.source)},${literal(config.database)},'SYNTHETIC',repeat('0',64),'SYNTHETIC','T26','COMMITTED','SYNTHETIC',repeat('0',64));
 INSERT INTO ${s}.tplus_hall(batch_id,id,source_id,source_code,name,warehouse_ids,source_payload) VALUES('T26',${literal(hallId)},'HALL','HALL','合成厅',ARRAY[${warehouseIds.map(id=>literal(id)+'::uuid').join(',')}],'{}');
 INSERT INTO ${s}.tplus_product_source(batch_id,product_id,source_id,source_code,category_decision,source_payload) VALUES('T26',${literal(productId)},'OLD900910','OLD900910','{}','{"sourceSizeGroupCode":"原尺码组","year":"2020","season":"春","barcodeItemCode":"0000001"}');
 INSERT INTO ${s}.system_setting(key,value) VALUES('inventory.standard-size-mappings',${json(pack)});
 INSERT INTO ${s}.tplus_product_barcode(batch_id,source_id,product_id,barcode,is_default,binding_scope,sku_id,sku_binding_known,source_payload) VALUES
 ('T26','OLD900',${literal(productId)},'000900aB',true,'SKU',${literal(skuId)},true,'{}'),('T26','OLD910',${literal(productId)},'000910Ab',true,'SKU',${literal(sku910)},true,'{}');
 INSERT INTO ${s}.tplus_inventory_balance_source(batch_id,source_id,variant_id,warehouse_id,quantity,unit,opening_quantity,cutoff_source_date,snapshot_used,apply_historical_documents_again,source_event_count,components,source_payload) VALUES
 ('T26','PLUS',${literal(skuId)},${literal(warehouseIds[0])},5,'件',5,'2026-10-01',true,false,0,'{}','{}'),('T26','MINUS',${literal(skuId)},${literal(warehouseIds[1])},-5,'件',-5,'2026-10-01',true,false,0,'{}','{}');
 RESET ROLE;SET ROLE ${ident(config.roles.runtime)};
 INSERT INTO ${r}.operator(id,name,role,enabled) VALUES${Object.values(accounts).map(a=>`(${literal(a.id)},${literal(a.name)},${literal(a.operatorRole)},true)`).join(',')};
 INSERT INTO ${r}.master_data_entity(kind,id,body,source_facts,version,updated_by) VALUES${warehouseIds.map((id,i)=>`('warehouses',${literal(id)},${json({code:'W'+i,name:'合成仓库'+i,enabled:true,type:'WAREHOUSE',hallRelations:[hallId],sourceOwnershipUnknown:false})},'{}',1,'T26-fixture')`).join(',')};
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
const source={name:'SYNTHETIC-T26.json',sha256:digest('SYNTHETIC-T26')};
const batch=(rows,batchId=randomUUID())=>({batchId,source,rows});
const row=(kind,payload,rowKey='Sheet1:2')=>({rowKey,kind,payload});
const payments=id=>row('payments',{id,expectedVersion:0,body:{code:'PAY-'+id.slice(-3),name:'合成方式',enabled:true}});
let adminSession,warehouseSession,salesSession;
const pre=async b=>success(await post(warehouseSession,'/api/imports/references/preflight',b),'preflight');
const commitBatch=(b,p,extra={})=>post(warehouseSession,'/api/imports/references/commit',{...b,preflightHash:p.preflightHash,selectedRowKeys:p.rows.filter(r=>r.status!=='FAILED').map(r=>r.rowKey),confirmed:true,requestKey:randomUUID(),...extra});
function protectedFacts(){return adminValue(config,`SELECT jsonb_build_object('source',(SELECT jsonb_agg(row_to_json(v) ORDER BY id) FROM ${ident(config.schemas.source)}.variant v),'sourceBarcodes',(SELECT jsonb_agg(row_to_json(b) ORDER BY barcode) FROM ${ident(config.schemas.source)}.tplus_product_barcode b),'balances',(SELECT jsonb_agg(row_to_json(b) ORDER BY warehouse_id,variant_id) FROM ${ident(config.schemas.runtime)}.inventory_balance_base b),'delta',(SELECT jsonb_agg(row_to_json(b) ORDER BY warehouse_id,sku_id) FROM ${ident(config.schemas.runtime)}.inventory_delta b),'opening',(SELECT jsonb_agg(row_to_json(o)) FROM ${ident(config.schemas.runtime)}.inventory_opening_run o),'postings',(SELECT jsonb_agg(row_to_json(p)) FROM ${ident(config.schemas.runtime)}.posting p),'movements',(SELECT jsonb_agg(row_to_json(m)) FROM ${ident(config.schemas.runtime)}.movement m))`);}
try{
 assert.match(tool('postgres',['--version'],'version.log'),/PostgreSQL\) 17\./);
 tool('initdb',['-D',data,'-U',admin,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C','--wal-segsize=1','--set','min_wal_size=2MB','--set','max_wal_size=8MB'],'initdb.log');
 tool('pg_ctl',['-D',data,'-l',join(suite,'postgres.log'),'-o',`-c listen_addresses='' -c min_wal_size=2MB -c max_wal_size=8MB -c unix_socket_permissions=0700 -c unix_socket_directories=${socket} -p ${port}`,'-w','start'],'start.log');started=true;
 const cluster=JSON.parse(tool('psql',['-X','-w','-qAt',...conn('postgres'),'-c',"SELECT jsonb_build_object('clusterId',system_identifier::text,'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses')) FROM pg_control_system()"],'identity.log'));
 assert.equal(cluster.dataDirectory,data);assert.equal(cluster.listenAddresses,'');environment.POSTGRES_CLUSTER_ID=cluster.clusterId;result.cluster=cluster;
 tool('createdb',['-h',socket,'-p',port,'-U',admin,'-T','template0',databaseName],'qa-create.log');
 writeFileSync(environment.SESSION_SECRET_FILE,randomBytes(48),{mode:0o600});config=readDatabaseConfig(environment);assertIsolatedTarget(config);targets.push({database:databaseName,instanceId:config.instanceId});
 await maintenance(environment,'bootstrap','bootstrap.log');await maintenance(environment,'migrate','migrate.log');
 await maintenance(environment,'inspect','inspect.log');seed();app=createApp(readConfig(environment));
 adminSession=await login(accounts.admin.id);warehouseSession=await login(accounts.warehouse.id);salesSession=await login(accounts.salesperson.id);
 checked('Private PostgreSQL 17 synthetic QA; TCP off; versioned migration and permission inspection passed');
 const protectedBefore=protectedFacts(),pay=payments(uid(801)),bad=row('opening',{id:uid(802),expectedVersion:0,body:{enabled:true,quantity:'999'}}),mixed=batch([pay,{...bad,rowKey:'Sheet1:3'}]);
 const before=fullFingerprint(),preview=await pre(mixed);assert.deepEqual(preview.rows.map(r=>r.status),['READY','FAILED'],JSON.stringify(preview));assert.match(preview.rows[1].message,/期初/);assert.deepEqual(fullFingerprint(),before,'preflight is read-only including sequences');
 const response=success(await commitBatch(mixed,preview),'commit valid row');assert.deepEqual(response.rows.map(r=>r.status),['COMMITTED','FAILED']);assert.equal(response.source.sha256,source.sha256);
 checked('Preflight exposes failed row reason, enabled status and source; mixed batch commits explicitly selected valid row only',{preview,response});
 const retried=success(await commitBatch(mixed,preview),'same batch new request retry');assert.deepEqual(retried,response);
 const persisted=success(await get(adminSession,'/api/imports/references/result?batchId='+mixed.batchId),'persisted result');assert.deepEqual(persisted,response);
 const duplicate=batch([pay]),duplicatePre=await pre(duplicate);assert.equal(duplicatePre.rows[0].status,'UNCHANGED');success(await commitBatch(duplicate,duplicatePre),'new batch duplicate no-op');
 assert.equal(adminValue(config,`SELECT count(*) FROM ${ident(config.schemas.runtime)}.master_data_history WHERE id=${literal(pay.payload.id)}`),1);
 checked('Batch replay with a new request and new-batch identical row never recreate or increment master version',{batchId:mixed.batchId});
 const refuseBefore=fullFingerprint();
 assert.equal((await post(salesSession,'/api/imports/references/preflight',mixed)).statusCode,403);
 assert.equal((await get(null,'/api/imports/references/result?batchId='+mixed.batchId)).statusCode,401);
 assert.equal((await post(warehouseSession,'/api/imports/references/commit',{...mixed,preflightHash:preview.preflightHash,selectedRowKeys:['Sheet1:3'],confirmed:true,requestKey:randomUUID()})).statusCode,409);
 const fresh=batch([payments(uid(803))]),freshPre=await pre(fresh);
 assert.equal((await commitBatch(fresh,freshPre,{confirmed:false})).statusCode,400);
 assert.equal((await commitBatch(fresh,freshPre,{selectedRowKeys:['missing']})).statusCode,409);
 assert.equal((await post(warehouseSession,'/api/imports/references/preflight',{...fresh,opening:{quantity:1}})).statusCode,400);
 assert.deepEqual(fullFingerprint(),refuseBefore,'authorization/envelope/selection refusals leave all rows and sequences unchanged');
 checked('Anonymous, salesperson, unconfirmed, unknown selected row, forbidden opening envelope and batch conflict rejected without writes');
 const group=sizeGroups().find(g=>g.id==='UPPER'),newId=uid(901),profile={name:'T26 新商品',categoryId:'CAT',supplierId,unitId:categoryId,year:'2026',season:'春',barcodeItemCode:'0260001',schemeId:'2026',fitId:'A',groupId:'UPPER',enabled:true,...Object.fromEntries(priceFields.map(k=>[k,k==='price'?'10.00':null]))};
 const specs={colors:[colorId],fits:['A'],sizes:group.sizes.map(s=>({...s,groupName:group.name}))};
 const productBatch=batch([row('product',{productId:newId,newCode:'T26-NEW',expectedVersion:0,profile,specs})]);
 const productBefore=fullFingerprint(),productPre=await pre(productBatch);assert.equal(productPre.rows[0].status,'READY');assert.deepEqual(fullFingerprint(),productBefore);
 const productResult=success(await commitBatch(productBatch,productPre),'new product with current SKU matrix');
 let cat=success(await get(adminSession,'/api/runtime/catalog'),'catalog');assert.equal(cat.skus.filter(s=>s.product_id===newId).length,11);
 const firstCodes=cat.barcodes.filter(b=>b.product_id===newId);const dupProduct=batch(productBatch.rows),dupProductPre=await pre(dupProduct);assert.equal(dupProductPre.rows[0].status,'UNCHANGED');success(await commitBatch(dupProduct,dupProductPre),'duplicate product');
 cat=success(await get(adminSession,'/api/runtime/catalog'),'catalog');assert.deepEqual(cat.barcodes.filter(b=>b.product_id===newId),firstCodes);
 checked('Product import uses T18 complete specification and price validation; duplicate product preserves UUIDs and all primary codes',{productResult,skuCount:11});
 const skuBatch=batch([row('sku',{id:uid(902),productId:newId,expectedVersion:1,body:{colorId,fitId:'B',sizeName:'无尺码',sizeCode:'910',groupName:'原尺码组',enabled:true,barcode:'000T26aB-910'}})]);
 const skuBefore=fullFingerprint(),skuPre=await pre(skuBatch);assert.equal(skuPre.rows[0].status,'READY',JSON.stringify(skuPre));assert.deepEqual(fullFingerprint(),skuBefore);
 success(await commitBatch(skuBatch,skuPre),'explicit original SKU');
 assert.equal(success(await get(salesSession,'/api/runtime/barcode?code=000T26aB-910'),'exact raw code').skuId,uid(902));
 const stopBatch=batch([row('sku',{...skuBatch.rows[0].payload,expectedVersion:2,body:{...skuBatch.rows[0].payload.body,enabled:false}})]),stopPre=await pre(stopBatch);success(await commitBatch(stopBatch,stopPre),'disable sku');
 assert.equal(success(await get(salesSession,'/api/runtime/barcode?code=000T26aB-910'),'stopped raw code').candidates[0].enabled,false);
 cat=success(await get(adminSession,'/api/runtime/catalog'),'catalog');const extraSku=cat.skus.find(s=>s.id===uid(902));assert.equal(extraSku.options.SIZE.sourceCode,'910');assert.equal(extraSku.options.SIZE.sourceName,'无尺码');
 checked('Explicit original SKU identity, 910 text and exact leading-zero mixed-case barcode survive creation, stop and readback',{skuId:uid(902)});
 const rejectedRows=[row('sku',{...skuBatch.rows[0].payload,expectedVersion:3,productId,body:{...skuBatch.rows[0].payload.body}},'bad-bind'),
 row('sku',{...skuBatch.rows[0].payload,expectedVersion:3,body:{...skuBatch.rows[0].payload.body,barcode:'000900aB'}},'bad-code'),
 row('product',{productId:newId,expectedVersion:3,profile:{...profile,unitId:supplierId}},'bad-unit'),
 row('product',{productId:newId,expectedVersion:3,profile:{...profile,quantity:'999'}},'bad-stock'),
 row('payments',{id:pay.payload.id,expectedVersion:1,action:'delete',body:pay.payload.body},'bad-delete')];
 for(const rr of rejectedRows){const fp=fullFingerprint(),p=await pre(batch([rr]));assert.equal(p.rows[0].status,'FAILED',JSON.stringify(p));assert.deepEqual(fullFingerprint(),fp);}
 checked('SKU/product/unit rebinding, exact barcode collision, stock payload and deletion have visible row failures and zero writes');
 const referencedStop=batch([row('sku',{id:skuId,productId,expectedVersion:0,body:{colorId,fitId:'A',sizeName:'无尺码',sizeCode:'900',groupName:'原尺码组',enabled:false,barcode:'000900aB'}})]),referencedStopPre=await pre(referencedStop);
 assert.equal(referencedStopPre.rows[0].status,'READY',JSON.stringify(referencedStopPre));success(await commitBatch(referencedStop,referencedStopPre),'stop referenced SKU without deleting identity');
 assert.equal(success(await get(salesSession,'/api/runtime/barcode?code=000900aB'),'referenced stopped barcode').candidates[0].enabled,false);
 const warehouseStop=batch([row('warehouses',{id:warehouseIds[0],expectedVersion:1,body:{code:'W0',name:'合成仓库0',enabled:false,type:'WAREHOUSE',hallRelations:[hallId],sourceOwnershipUnknown:false}})]),warehouseStopPre=await pre(warehouseStop);
 assert.equal(warehouseStopPre.rows[0].status,'FAILED');assert.match(warehouseStopPre.rows[0].message,/库存/);
 checked('Referenced source SKU can stop without losing identity, exact code or per-warehouse stock; nonzero warehouse stop rejects');
 const staleBatch=batch([payments(uid(804))]),stalePre=await pre(staleBatch),otherBatch=batch([payments(uid(805))]),otherPre=await pre(otherBatch);success(await commitBatch(otherBatch,otherPre),'concurrent reference edit');
 const staleBefore=fullFingerprint();const staleResponse=await commitBatch(staleBatch,stalePre);assert.equal(staleResponse.statusCode,409,staleResponse.body);assert.equal(staleResponse.json().error.code,'PREFLIGHT_CHANGED');assert.deepEqual(fullFingerprint(),staleBefore);
 checked('Reference change after preflight refuses old confirmation and leaves batch uncommitted');
 const atomicBatch=batch([payments(uid(806)),{...payments(uid(807)),rowKey:'Sheet1:3'}]),atomicPre=await pre(atomicBatch),runtime=ident(config.schemas.runtime);
 adminSql(config,`SET ROLE ${ident(config.roles.runtime)};CREATE FUNCTION ${runtime}.t26_inject() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.id=${literal(uid(807))} THEN RAISE EXCEPTION 'T26_SYNTHETIC_FAULT'; END IF; RETURN NEW; END$$;CREATE TRIGGER t26_inject BEFORE INSERT ON ${runtime}.master_data_entity FOR EACH ROW EXECUTE FUNCTION ${runtime}.t26_inject();RESET ROLE;`);
 const atomicBefore=fullFingerprint();const atomicResponse=await commitBatch(atomicBatch,atomicPre);assert.equal(atomicResponse.statusCode,503,atomicResponse.body);assert.deepEqual(fullFingerprint(),atomicBefore);
 adminSql(config,`SET ROLE ${ident(config.roles.runtime)};DROP TRIGGER t26_inject ON ${runtime}.master_data_entity;DROP FUNCTION ${runtime}.t26_inject();RESET ROLE;`);
 success(await commitBatch(atomicBatch,atomicPre),'retry after synthetic fault');
 checked('Injected second-row write fault rolls back first row, histories, idempotency and batch ledger; retry succeeds');
 const concurrentBatch=batch([payments(uid(808))]),concurrentPre=await pre(concurrentBatch),concurrentRequest={...concurrentBatch,preflightHash:concurrentPre.preflightHash,selectedRowKeys:[concurrentBatch.rows[0].rowKey],confirmed:true,requestKey:randomUUID()};
 const responses=await Promise.all([post(warehouseSession,'/api/imports/references/commit',concurrentRequest),post(warehouseSession,'/api/imports/references/commit',concurrentRequest)]);assert.deepEqual(success(responses[0],'concurrent 1'),success(responses[1],'concurrent 2'));
 assert.equal(adminValue(config,`SELECT count(*) FROM ${runtime}.master_data_history WHERE id=${literal(uid(808))}`),1);
 const requestResult=success(await get(warehouseSession,'/api/requests/result?'+new URLSearchParams({requestKey:concurrentRequest.requestKey,operationId:'imports.referenceCommit'})),'request recovery');assert.equal(requestResult.resolution,'COMMITTED');
 await app.close();app=createApp(readConfig(environment));assert.deepEqual(success(await get(warehouseSession,'/api/imports/references/result?batchId='+concurrentBatch.batchId),'restart readback'),success(responses[0],'prior'));
 checked('Concurrent same request commits once, request recovery and application restart return original persisted row results');
 const basicIds={hall:uid(830),warehouse:uid(831),party:uid(832),account:uid(833)};
 const basicRows=[row('halls',{id:basicIds.hall,expectedVersion:0,body:{code:'T26-H',name:'合成新厅',enabled:true,defaultCustomerId:'',defaultWarehouseId:''}}),
 row('warehouses',{id:basicIds.warehouse,expectedVersion:0,body:{code:'T26-W',name:'合成新仓',enabled:true,type:'WAREHOUSE',hallRelations:[basicIds.hall],sourceOwnershipUnknown:false}}),
 row('parties',{id:basicIds.party,expectedVersion:0,body:{code:'T26-P',name:'合成供应商',enabled:true,usage:['supplier'],tags:['supplier']}}),
 row('fundAccounts',{id:basicIds.account,expectedVersion:0,body:{code:'T26-F',name:'合成资金账户',enabled:true,primaryPaymentMethodId:pay.payload.id,type:'',bank:'',accountNumber:'',department:''}})];
 for(const rr of basicRows){const b=batch([rr]),p=await pre(b);assert.equal(p.rows[0].status,'READY',JSON.stringify(p));success(await commitBatch(b,p),'base kind '+rr.kind);}
 const accountRebind=batch([row('fundAccounts',{...basicRows[3].payload,expectedVersion:1,body:{...basicRows[3].payload.body,primaryPaymentMethodId:uid(805)}})]);assert.equal((await pre(accountRebind)).rows[0].status,'FAILED');
 const masters=success(await get(adminSession,'/api/runtime/masters'),'masters');assert.deepEqual(masters.records.find(r=>r.id===basicIds.warehouse).body.hallRelations,[basicIds.hall]);
 checked('All five base record kinds import with preserved hall/warehouse/supplier/payment/account relations; account payment rebinding rejected');
 const duplicateCodes=batch([payments(uid(811)),{...payments(uid(812)),rowKey:'Sheet1:3',payload:{...payments(uid(812)).payload,body:payments(uid(811)).payload.body}}]);assert.deepEqual((await pre(duplicateCodes)).rows.map(r=>r.status),['FAILED','FAILED']);
 const uiBatch=batch([payments(uid(820)),{...bad,rowKey:'Sheet1:3'}]);
 result.ui=await verifyReferenceImportUI({suite,batch:uiBatch,actorId:accounts.warehouse.id,csrf:warehouseSession.csrf,inject:async(url,method,payload,headers)=>app.inject({url,method,payload,headers:{...headers,cookie:warehouseSession.cookie,origin:environment.SESSION_ORIGIN}})});
 checked('Actual built Arco import modal and service transport preflight, explicit confirmation, submit and result readback',result.ui);
 assert.deepEqual(protectedFacts(),protectedBefore,'stock/opening/source SKU/source barcode facts unchanged by all imports');
 result.protectedFacts=protectedBefore;result.status='PASS';result.completedAt=new Date().toISOString();
}catch(error){result.status='FAIL';result.failure=error.message;throw error;}
finally{if(app)await app.close().catch(()=>{});if(started){const stop=spawnSync(join(pg,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C'}});writeFileSync(join(suite,'stop.log'),(stop.stdout??'')+(stop.stderr??''),{mode:0o600});result.clusterStopped=stop.status===0;}writeJson(join(suite,'RESULT.json'),result);writeJson(join(out,'database-verification.json'),result);}
