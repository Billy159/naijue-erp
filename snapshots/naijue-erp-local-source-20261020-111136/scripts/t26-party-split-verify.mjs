import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {createHash, pbkdf2Sync, randomBytes, randomUUID} from 'node:crypto';
import {chmodSync, existsSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
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
import {buildPartySplitBatches} from './t26-party-split.mjs';
const sourcePackage = JSON.parse(readFileSync(join(root, 'outputs/T26/continuation-20261003/classification-package.json')));
const originalSupplier = sourcePackage.parties.find(row => row.role === 'supplier');

const pg = process.env.T26_PG_BIN;
if (!pg || !isAbsolute(pg)) throw new Error('T26_PG_BIN must explicitly select local PostgreSQL 17');
const out = join(root, 'outputs/T26/continuation-20261003'), logs = join(root, 'logs/T26/continuation-20261003');
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
const uid = n => `26000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const warehouseIds = [uid(201),uid(202)], productId = uid(101), skuId = uid(102), hallId = uid(301);
const categoryId=uid(110),supplierId=originalSupplier.id,colorId=uid(130),colorDim=uid(131),sizeDim=uid(132),old900=uid(140),old910=uid(141),sku910=uid(103);
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
 ${sourcePackage.parties.map((row,n)=>`INSERT INTO ${s}.counterparty(id,code,code_normalized,name) VALUES(${literal(row.id)},${literal(row.code)},${literal(row.code)},${literal('合成往来'+n)});`).join('')}
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
let adminSession,warehouseSession,salesSession;
const pre=async b=>success(await post(warehouseSession,'/api/imports/references/preflight',b),'preflight');
const commitBatch=(b,p,extra={})=>post(warehouseSession,'/api/imports/references/commit',{...b,preflightHash:p.preflightHash,selectedRowKeys:p.rows.filter(r=>r.status!=='FAILED').map(r=>r.rowKey),confirmed:true,requestKey:randomUUID(),...extra});
function protectedFacts(){return adminValue(config,`SELECT jsonb_build_object('source',(SELECT jsonb_agg(row_to_json(v) ORDER BY id) FROM ${ident(config.schemas.source)}.variant v),'sourceBarcodes',(SELECT jsonb_agg(row_to_json(b) ORDER BY barcode) FROM ${ident(config.schemas.source)}.tplus_product_barcode b),'balances',(SELECT jsonb_agg(row_to_json(b) ORDER BY warehouse_id,variant_id) FROM ${ident(config.schemas.runtime)}.inventory_balance_base b),'delta',(SELECT jsonb_agg(row_to_json(b) ORDER BY warehouse_id,sku_id) FROM ${ident(config.schemas.runtime)}.inventory_delta b),'opening',(SELECT jsonb_agg(row_to_json(o)) FROM ${ident(config.schemas.runtime)}.inventory_opening_run o),'postings',(SELECT jsonb_agg(row_to_json(p)) FROM ${ident(config.schemas.runtime)}.posting p),'movements',(SELECT jsonb_agg(row_to_json(m)) FROM ${ident(config.schemas.runtime)}.movement m))`);}

function seedPartyReferences() {
 const s=ident(config.schemas.source),r=ident(config.schemas.runtime);
 adminSql(config,`SET ROLE ${ident(config.roles.source)};
 ${sourcePackage.parties.map((party,n)=>party.sourceRecords.map(record=>`INSERT INTO ${s}.tplus_party_role(batch_id,party_id,source_id,role,name,source_payload) VALUES('T26',${literal(party.id)},${literal(record.source_id)},${literal(record.role)},${literal('合成往来'+n)},${json({source:{'往来单位编码':party.code,'停用':'0'},synthetic:true,originalSourceRecordId:record.source_id})});`).join('')).join('')}
 ${sourcePackage.parties.map((party,n)=>`INSERT INTO ${s}.tplus_history_document(batch_id,source_dataset,source_id,target_document_id,document_kind,source_number,business_date,source_party_id,line_count,read_only,runtime_audit_replay_allowed,stock_effect,source_sha256,source_record_sha256,source_payload) VALUES('T26','SYNTHETIC',${literal('SYNTHETIC-'+n)},${literal(uid(2000+n))},'sale',${literal('SYNTHETIC-'+n)},'2026-10-01',${literal(party.id)},0,true,false,false,repeat('0',64),repeat('0',64),${json({synthetic:true,partyId:party.id})});`).join('')}
 RESET ROLE; SET ROLE ${ident(config.roles.runtime)};
 ${sourcePackage.parties.filter(p=>p.role===null).map((party,n)=>`INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision,source_identity,business_day) VALUES(${literal(uid(4000+n))},'SALE',${literal('SYNTHETIC-EXCLUDED-'+n)},'UNAUDITED',false,false,1,'{"synthetic":true}','2026-10-01');
 INSERT INTO ${r}.revision(document_id,revision,original_imported,body) VALUES(${literal(uid(4000+n))},1,true,${json({header:{hall_id:hallId,source_party_id:party.id,customer_snapshot:{id:party.id,name:'合成历史客户'+n},source_warehouse_id:warehouseIds[0],created_by:null,created_at:null},lines:[],settlements:[]})});`).join('')}
 RESET ROLE;`);
}
function preservedFingerprint() {
 const allowed=new Set(['master_data_entity','master_data_history','master_data_state','idempotency_request','reference_import_batch','reference_import_row']);
 const fp=fullFingerprint();
 return {...fp,rows:fp.rows.filter(row=>row.schema!==config.schemas.runtime||!allowed.has(row.table))};
}
function masterFacts(){return adminValue(config,`SELECT jsonb_build_object('entities',(SELECT jsonb_agg(row_to_json(x) ORDER BY id) FROM ${ident(config.schemas.runtime)}.master_data_entity x WHERE kind='parties'),'history',(SELECT jsonb_agg(row_to_json(x) ORDER BY id,version) FROM ${ident(config.schemas.runtime)}.master_data_history x WHERE kind='parties'))`);}
try {
 assert.match(tool('postgres',['--version'],'version.log'),/PostgreSQL\) 17\./);
 tool('initdb',['-D',data,'-U',admin,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C','--wal-segsize=1','--set','min_wal_size=2MB','--set','max_wal_size=8MB'],'initdb.log');
 tool('pg_ctl',['-D',data,'-l',join(suite,'postgres.log'),'-o',`-c listen_addresses='' -c min_wal_size=2MB -c max_wal_size=8MB -c unix_socket_permissions=0700 -c unix_socket_directories=${socket} -p ${port}`,'-w','start'],'start.log');started=true;
 const cluster=JSON.parse(tool('psql',['-X','-w','-qAt',...conn('postgres'),'-c',"SELECT jsonb_build_object('clusterId',system_identifier::text,'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses')) FROM pg_control_system()"],'identity.log'));
 assert.equal(cluster.dataDirectory,data);assert.equal(cluster.listenAddresses,'');environment.POSTGRES_CLUSTER_ID=cluster.clusterId;result.cluster=cluster;
 tool('createdb',['-h',socket,'-p',port,'-U',admin,'-T','template0',databaseName],'qa-create.log');
 writeFileSync(environment.SESSION_SECRET_FILE,randomBytes(48),{mode:0o600});config=readDatabaseConfig(environment);assertIsolatedTarget(config);targets.push({database:databaseName,instanceId:config.instanceId});result.targets=targets;
 await maintenance(environment,'bootstrap','bootstrap.log');await maintenance(environment,'migrate','migrate.log');await maintenance(environment,'inspect','inspect.log');
 seed();seedPartyReferences();app=createApp(readConfig(environment));
 adminSession=await login(accounts.admin.id);warehouseSession=await login(accounts.warehouse.id);salesSession=await login(accounts.salesperson.id);
 checked('Private PostgreSQL 17 QA with source IDs and codes retained, synthetic names/credentials/documents, TCP disabled');
 const before=preservedFingerprint(),stockBefore=protectedFacts();
 const snapshot=success(await get(adminSession,'/api/runtime/masters'),'initial masters');
 assert.equal(snapshot.records.filter(r=>r.kind==='parties').length,485);
 const plan=buildPartySplitBatches(sourcePackage,snapshot);assert.deepEqual(plan.batches.map(b=>b.rows.length),[100,100,100,100,83]);
 assert.equal(plan.batches.flatMap(b=>b.rows).length,483);assert.equal(plan.excluded.length,2);
 assert.ok(sourcePackage.parties.some(p=>p.sourceRecords.some(s=>s.source_id!==p.code)),'fixture must retain hashed source row IDs');
 writeJson(join(out,'import-plan.json'),{...plan,fixtureOnly:true,database:databaseName,
   scope:'QA receipt fixture with synthetic names/source fields; prepare against actual environment masters for a future authorized import'});
 checked('485 exact source IDs/codes match; hashed import-row IDs are not used as business codes; 483 rows in five batches, two exclusions omitted');
 const drift=structuredClone(snapshot);drift.records.find(r=>r.kind==='parties').id=uid(9999);
 assert.throws(()=>buildPartySplitBatches(sourcePackage,drift),error=>error.code==='PARTY_SOURCE_CHANGED'&&error.differences.some(d=>d.reason==='IDENTITY_REBOUND'));
 const missing=structuredClone(snapshot);missing.records=missing.records.filter(r=>r.id!==sourcePackage.parties[0].id);
 assert.throws(()=>buildPartySplitBatches(sourcePackage,missing),error=>error.differences.some(d=>d.reason==='MISSING_CURRENT_IDENTITY'));
 checked('Wrong/missing source identities emit code-level differences rather than creating or rebinding identities');
 const receipts=[];
 for(const b of plan.batches) {
   const fp=fullFingerprint(),p=await pre(b);assert.ok(p.rows.every(r=>r.status==='READY'),JSON.stringify(p));assert.deepEqual(fullFingerprint(),fp);
   const request={...b,preflightHash:p.preflightHash,selectedRowKeys:p.rows.map(r=>r.rowKey),confirmed:true,requestKey:randomUUID()};
   const response=success(await post(warehouseSession,'/api/imports/references/commit',request),'classification commit');
   assert.equal(response.actorId,accounts.warehouse.id);assert.equal(response.source.sha256,plan.bindingHash);
   assert.ok(response.rows.every(r=>r.status==='COMMITTED'&&r.version===1));
   const replayBefore=fullFingerprint();assert.deepEqual(success(await post(warehouseSession,'/api/imports/references/commit',request),'same request retry'),response);assert.deepEqual(fullFingerprint(),replayBefore);
   assert.deepEqual(success(await get(adminSession,'/api/imports/references/result?batchId='+b.batchId),'batch receipt'),response);
   const recovered=success(await get(warehouseSession,'/api/requests/result?'+new URLSearchParams({operationId:'imports.referenceCommit',requestKey:request.requestKey})),'request receipt');
   assert.equal(recovered.resolution,'COMMITTED');assert.deepEqual(recovered.originalResponse,response);
   receipts.push({requestKey:request.requestKey,preflight:p,response,recovered});
 }
 writeJson(join(out,'commit-receipts.json'),receipts);
 assert.equal(receipts.flatMap(r=>r.response.rows).length,483);
 checked('Read-only API preflight then confirmed commit of all 483 rows; trusted actor, row/version/source results, original request and batch receipts persisted');
 const committedFacts=masterFacts();
 for(const b of plan.batches) {
   const original=receipts.find(r=>r.response.batchId===b.batchId).response;
   assert.deepEqual(success(await commitBatch(b,{preflightHash:'already-committed',rows:b.rows.map(r=>({...r,status:'READY'}))}),'same batch new request'),original);
   const repeated={...b,batchId:b.batchId+'-retry'},p=await pre(repeated);assert.ok(p.rows.every(r=>r.status==='UNCHANGED'));
   const res=success(await commitBatch(repeated,p),'new batch same classifications');assert.ok(res.rows.every(r=>r.status==='UNCHANGED'));
 }
 assert.deepEqual(masterFacts(),committedFacts);
 checked('Same request/batch and new-batch identical rows do not recreate identities or increment master versions/history');
 const readback={masters:success(await get(adminSession,'/api/runtime/masters'),'masters'),roles:{}};
 for(const [name,session] of Object.entries({admin:adminSession,warehouse:warehouseSession,salesperson:salesSession})) {
   const suppliers=success(await get(session,'/api/reference/suppliers?size=500'),'suppliers '+name),customers=success(await get(session,'/api/reference/customers?size=500'),'customers '+name);
   assert.equal(suppliers.total,222);assert.equal(suppliers.items.length,222);assert.equal(customers.total,261);assert.equal(customers.items.length,261);
   assert.equal(new Set([...suppliers.items,...customers.items].map(p=>p.id)).size,483);
   for(const excluded of plan.excluded)assert.ok(![...suppliers.items,...customers.items].some(p=>p.id===excluded.id||p.code===excluded.code));
   readback.roles[name]={suppliers,customers};
 }
 const parties=readback.masters.records.filter(r=>r.kind==='parties');
 assert.equal(parties.filter(p=>p.body.usage.length===1&&p.body.usage[0]==='supplier').length,222);
 assert.equal(parties.filter(p=>p.body.usage.length===1&&p.body.usage[0]==='customer').length,261);
 for(const original of snapshot.records.filter(r=>r.kind==='parties')) {
   const now=parties.find(p=>p.id===original.id);assert.equal(now.body.code,original.body.code);assert.equal(now.body.name,original.body.name);assert.deepEqual(now.sourceFacts,original.sourceFacts);
 }
 for(const p of plan.excluded){assert.equal(parties.find(r=>r.id===p.id).version,0);assert.deepEqual(parties.find(r=>r.id===p.id).body.usage,[]);}
 writeJson(join(out,'readback-receipts.json'),readback);
 checked('Three roles read API suppliers=222/customers=261, mutually exclusive; masters keep 485 original IDs/names/facts and two exclusions are unavailable');
 const negativeBefore=fullFingerprint(),supplier=plan.batches.flatMap(b=>b.rows).find(r=>r.payload.body.usage[0]==='supplier');
 const negatives=[['wrong classification',{...supplier.payload,expectedVersion:1,body:{...supplier.payload.body,usage:['customer'],tags:['customer']}}],
   ['dual classification',{...supplier.payload,expectedVersion:1,body:{...supplier.payload.body,usage:['customer','supplier'],tags:['customer','supplier']}}],
   ['missing classification',{...supplier.payload,expectedVersion:1,body:{...supplier.payload.body,usage:[],tags:[]}}],
   ...plan.excluded.map(p=>['excluded '+p.code,{id:p.id,expectedVersion:0,body:{...parties.find(r=>r.id===p.id).body,usage:['customer'],tags:['customer']}}]),
   ['identity rebind',{...supplier.payload,id:uid(9900),expectedVersion:0}],
   ['source rewrite',{...supplier.payload,expectedVersion:1,body:{...supplier.payload.body,sourceFacts:{forged:true}}}]];
 const refusals=[];
 for(const [name,payload] of negatives){const b=batch([row('parties',payload)]),p=await pre(b);assert.equal(p.rows[0].status,'FAILED',JSON.stringify(p));refusals.push({name,result:p.rows[0]});}
 assert.equal((await post(salesSession,'/api/imports/references/preflight',plan.batches[0])).statusCode,403);
 assert.equal((await get(salesSession,'/api/runtime/masters')).statusCode,403);
 assert.equal((await get(null,'/api/reference/customers')).statusCode,401);
 assert.deepEqual(fullFingerprint(),negativeBefore);writeJson(join(out,'rejection-receipts.json'),refusals);
 checked('Wrong/dual/missing/excluded classifications, identity or source rewrite and unauthorized import refuse without writes');
 const historical=[];
 for(const [n,p] of plan.excluded.entries()) {
   const doc=success(await get(warehouseSession,'/api/sales/document/'+uid(4000+n)),'excluded historical detail');
   assert.equal(doc.body.header.source_party_id,p.id);assert.equal(doc.history[0].body.header.source_party_id,p.id);assert.equal(doc.history[0].actor_id,null);
   historical.push({excluded:p,document:doc});
 }
 writeJson(join(out,'historical-readback.json'),historical);
 assert.deepEqual(preservedFingerprint(),before);assert.deepEqual(protectedFacts(),stockBefore);
 checked('Source archives, 485 synthetic historical references, excluded historical document APIs, original product supplier FK and stock/opening/postings remain unchanged');
 result.binding=plan.binding;result.counts={source:485,suppliers:222,customers:261,excluded:2,committedRows:483,batches:5};
 result.fixtureScope='Exact archive party IDs/business codes/import-row IDs; synthetic names, source fields, documents, inventory and credentials. Actual names only verified offline.';
 result.status='PASS';result.completedAt=new Date().toISOString();
} catch(error) {result.status='FAIL';result.failure=error.message;throw error;}
finally {
 if(app)await app.close().catch(()=>{});
 if(started){const stop=spawnSync(join(pg,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C'}});writeFileSync(join(suite,'stop.log'),(stop.stdout??'')+(stop.stderr??''),{mode:0o600});result.clusterStopped=stop.status===0;}
 writeJson(join(suite,'RESULT.json'),result);writeJson(join(out,'database-verification.json'),result);
}
