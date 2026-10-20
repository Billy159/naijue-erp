import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {createHash, pbkdf2Sync, randomBytes, randomUUID} from 'node:crypto';
import {chmodSync,copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {build} from 'vite';
import {createCorrectionController} from '../frontend/inventory-correction-service.mjs';
import {runInNewContext} from 'node:vm';
import {join, isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import pgPackage from 'pg';
import {root, writeJson} from './files.mjs';

const pg = process.env.T23_PG_BIN;
if (!pg || !isAbsolute(pg)) throw new Error('T23_PG_BIN must explicitly select local PostgreSQL 17');
const runId = process.env.T23_VERIFY_RUN_ID ?? `run-${Date.now()}-${randomUUID().slice(0,8)}`;
assert.match(runId, /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/, 'Invalid T23 verification run ID');
const out = join(root, 'outputs/T23/post-review-remediation', runId, 'verification'), logs = join(root, 'logs/T23/post-review-remediation', runId);
assert.equal(existsSync(out), false, 'T23 verification evidence already exists; select a new run ID');
mkdirSync(out, {recursive: true}); mkdirSync(logs, {recursive: true}); chmodSync(logs, 0o700);
const suite = mkdtempSync(join(logs, 'postgres-suite-'));
chmodSync(suite, 0o700);
const compilation=join(suite,'backend');
const compiled=spawnSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'-p',join(root,'tsconfig.json'),'--outDir',compilation],{cwd:root,encoding:'utf8'});
writeFileSync(join(suite,'compile.log'),(compiled.stdout||'')+(compiled.stderr||''));assert.equal(compiled.status,0,'T23 strict private backend compilation failed');
mkdirSync(join(compilation,'database/sql'),{recursive:true});for(const name of readdirSync(join(root,'server/database/sql')))copyFileSync(join(root,'server/database/sql',name),join(compilation,'database/sql',name));
const module=name=>import(pathToFileURL(join(compilation,name)).href);
const {runDatabaseCommand}=await module('database/cli.js');
const {readDatabaseConfig,assertIsolatedTarget,databaseIdentifier:ident}=await module('database/config.js');
const {bootstrapAssertionSql}=await module('database/identity.js');
const {sqlLiteral:literal}=await module('database/sql.js');
const {createApp}=await module('app.js');const {readConfig}=await module('config.js');
const {migrationSql,loadMigrations}=await module('database/migrations.js');
const data = join(suite, 'data'), admin = 't23_bootstrap', port = '55523';
const socket = mkdtempSync(join(tmpdir(), 'naijue-t23-socket-'));
chmodSync(socket, 0o700);
assert.ok(Buffer.byteLength(join(socket, '.s.PGSQL.' + port)) < 104, 'Private PostgreSQL socket path exceeds platform limit');
assert.equal(existsSync(join(socket, '.s.PGSQL.' + port)), false, 'Never reuse an existing socket');
const checks = [], targets = [], result = {task_id: 'T23', status: 'RUNNING', suite, socket, checks,
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
  assert.equal(run.status, 0, name + ' failed; see private T23 log ' + file);
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

const context=JSON.parse(readFileSync(join(root,'outputs/T23/task-context.json'),'utf8'));
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const authority={plan:join(root,'references/planning-20261002/主计划.md'),taskList:join(root,'references/planning-20261002/任务清单.json')};
authority.planSHA256=sha(authority.plan);authority.taskListSHA256=sha(authority.taskList);
const task=JSON.parse(readFileSync(authority.taskList,'utf8')).tasks.find(task=>task.id==='T23');
for(const key of ['id','scope','title','actions_and_deliverables','dependencies','model','acceptance','requires_gates'])
  assert.deepEqual(task?.[key],context.task[key],`T23 ${key} changed; stop before DB setup`);
writeJson(join(out,'task-context.json'),{runId,task,authority,dispatchAuthorization:context.dispatchAuthorization,
  originalContextSha256:sha(join(root,'outputs/T23/task-context.json')),statusFieldsAreNotAcceptanceDecisions:true});
for(const [path,sha] of [[authority.plan,authority.planSHA256],[authority.taskList,authority.taskListSHA256]])
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),sha,'T23 authority changed; stop before DB setup');
const uid=n=>`23000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const skuId=uid(101),productId=uid(102),hallId=uid(201),warehouseId=uid(301),otherWarehouse=uid(302),disabledWarehouse=uid(303),unknownWarehouse=uid(304);
const fractionalProduct=uid(110),fractionalSku=uid(111),unknownUnitProduct=uid(120),unknownUnitSku=uid(121),disabledSku=uid(122),newSku=uid(123),browserSku=uid(124);
const colorId=uid(130),sizeId=uid(131),colorDimension=uid(132),sizeDimension=uid(133),legacyId=uid(401);
const suffix=randomUUID().replaceAll('-','').slice(0,8),prefix='t23qa_'+suffix,databaseName='demo_8877_t23_qa_'+suffix;
const environment={APP_ENV:'qa',APP_DATABASE_MODE:'required',POSTGRES_HOST:socket,POSTGRES_PORT:port,POSTGRES_DB:databaseName,
  POSTGRES_USER:prefix+'_app',POSTGRES_ROLE_PREFIX:prefix,POSTGRES_SOURCE_SCHEMA:'t23_source',POSTGRES_RUNTIME_SCHEMA:'t23_runtime',POSTGRES_AUTH_SCHEMA:'t23_auth',POSTGRES_CONTROL_SCHEMA:'t23_control',
  POSTGRES_INSTANCE_ID:randomUUID(),POSTGRES_CLUSTER_ID:'',POSTGRES_BOOTSTRAP_USER:admin,PSQL_BIN:join(pg,'psql'),SESSION_ORIGIN:'https://t23.invalid',
  SESSION_SECRET_FILE:join(suite,'synthetic-session.key'),MEDIA_STORAGE_ROOT:join(suite,'media')};
const accounts={admin:{id:'t23-admin',name:'Synthetic Admin',role:'管理员'},warehouse:{id:'t23-warehouse',name:'Synthetic Warehouse',role:'仓库人员'},salesperson:{id:'t23-sales',name:'Synthetic Sales',role:'营业员'}};
const password=randomUUID()+'-synthetic-only',sessions={},requests=[],fingerprints={},samples={};
let config=null,app=null,started=false,uiServer=null;
const r=ident(environment.POSTGRES_RUNTIME_SCHEMA),s=ident(environment.POSTGRES_SOURCE_SCHEMA),a=ident(environment.POSTGRES_AUTH_SCHEMA);
function seed(){
  adminSql(config,`SET ROLE ${ident(config.roles.source)};
    INSERT INTO ${s}.category(id,code,code_normalized,name) VALUES(${literal(productId)},'T23','T23','合成分类');
    INSERT INTO ${s}.unit(id,code,code_normalized,name,quantity_scale) VALUES(${literal(productId)},'PCS','PCS','件',4),(${literal(fractionalProduct)},'M','M','米',3);
    INSERT INTO ${s}.product(id,code,code_normalized,name,category_id,unit_id) VALUES
      (${literal(productId)},'T23','T23','合成服装',${literal(productId)},${literal(productId)}),
      (${literal(fractionalProduct)},'T23-M','T23-M','合成布料',${literal(productId)},${literal(fractionalProduct)});
    INSERT INTO ${s}.spec_dimension(id,code,code_normalized,name) VALUES(${literal(colorDimension)},'COLOR','COLOR','颜色'),(${literal(sizeDimension)},'SIZE','SIZE','尺码');
    INSERT INTO ${s}.spec_value(id,dimension_id,code,code_normalized,name) VALUES(${literal(colorId)},${literal(colorDimension)},'01','01','合成蓝'),(${literal(sizeId)},${literal(sizeDimension)},'910','910','无尺码');
    ${[[skuId,productId],[fractionalSku,fractionalProduct],[disabledSku,productId],[newSku,productId],[browserSku,productId]].map(([id,p])=>`
      INSERT INTO ${s}.variant(id,product_id,option_key,enabled) VALUES(${literal(id)},${literal(p)},${literal('T23-'+id)},${id!==disabledSku});
      INSERT INTO ${s}.variant_option(variant_id,dimension_id,spec_value_id) VALUES(${literal(id)},${literal(colorDimension)},${literal(colorId)}),(${literal(id)},${literal(sizeDimension)},${literal(sizeId)});`).join('\n')}
    ${[warehouseId,otherWarehouse,disabledWarehouse,unknownWarehouse].map((id,i)=>`INSERT INTO ${s}.warehouse(id,code,code_normalized,name,type,enabled) VALUES(${literal(id)},'T23-W${i}','T23-W${i}','合成仓库${i}','WAREHOUSE',${id!==disabledWarehouse});`).join('\n')}
    INSERT INTO ${s}.tplus_import_run(batch_id,space_key,schema_name,database_name,manifest_path,manifest_sha256,preflight_batch_id,importer_version,status,git_sha,workspace_state_sha256)
      VALUES('T23','SYNTHETIC',${literal(config.schemas.source)},${literal(databaseName)},'SYNTHETIC-T23',repeat('2',64),'SYNTHETIC','T23-fixture','COMMITTED','SYNTHETIC',repeat('2',64));
    INSERT INTO ${s}.tplus_hall(batch_id,id,source_id,source_code,name,warehouse_ids,source_payload) VALUES('T23',${literal(hallId)},'T23-HALL','T23-HALL','合成营业厅',ARRAY[${[warehouseId,otherWarehouse,disabledWarehouse].map(id=>literal(id)+'::uuid').join(',')}],'{}');
    ${[[skuId,warehouseId,'10','件'],[browserSku,warehouseId,'10','件'],[newSku,warehouseId,'0','件'],[fractionalSku,warehouseId,'2.250','米']].map(([sku,w,q,u])=>`INSERT INTO ${s}.tplus_inventory_balance_source(batch_id,source_id,variant_id,warehouse_id,quantity,unit,opening_quantity,cutoff_source_date,snapshot_used,apply_historical_documents_again,source_event_count,components,source_payload)
      VALUES('T23',${literal('T23-OPENING-'+sku)},${literal(sku)},${literal(w)},${literal(q)}::numeric,${literal(u)},${literal(q)}::numeric,'2026-10-01',true,false,0,'{}','{"fixture":"SYNTHETIC_T23"}');`).join('\n')}
    RESET ROLE;SET ROLE ${ident(config.roles.runtime)};
    INSERT INTO ${r}.product_overlay(id,code,body) VALUES(${literal(unknownUnitProduct)},'T23-U','{"name":"计量精度未知合成商品","unit":"未知单位"}');
    INSERT INTO ${r}.variant_overlay(id,product_id,color_id,size_id,size_name,group_name) VALUES(${literal(unknownUnitSku)},${literal(unknownUnitProduct)},${literal(colorId)},${literal(sizeId)},'无尺码','合成组');
    INSERT INTO ${r}.operator(id,name,role,enabled) VALUES ${Object.entries(accounts).map(([key,x])=>`(${literal(x.id)},${literal(x.name)},${literal({admin:'ADMIN',warehouse:'WAREHOUSE',salesperson:'SALESPERSON'}[key])},true)`).join(',')};
    INSERT INTO ${r}.master_data_entity(kind,id,body,source_facts,version,updated_by) VALUES ${[warehouseId,otherWarehouse,disabledWarehouse,unknownWarehouse].map((id,i)=>`('warehouses',${literal(id)},${literal(JSON.stringify({code:'T23-W'+i,name:'合成仓库'+i,enabled:id!==disabledWarehouse,hallRelations:id===unknownWarehouse?[]:[hallId],sourceOwnershipUnknown:id===unknownWarehouse,type:'WAREHOUSE'}))}::jsonb,'{"fixture":"T23"}',1,'T23-fixture')`).join(',')};
    INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision,version,business_day) VALUES(${literal(legacyId)},'SALE','T23-LEGACY','UNAUDITED',true,false,1,17,'2026-10-01');
    INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id) VALUES(${literal(legacyId)},1,true,${literal(JSON.stringify({header:{hall_id:hallId,source_warehouse_id:warehouseId,business_date:'2026-10-01'},lines:[],sourceFacts:{createdBy:null,auditedBy:null,auditedAt:null}}))}::jsonb,NULL);
    RESET ROLE;`);
  for(const account of Object.values(accounts)){
    const salt=randomBytes(24).toString('hex'),hash=pbkdf2Sync(password,salt,210000,32,'sha256').toString('hex');
    const body={name:account.name,role:account.role,employmentStatus:'在职',enabled:true,loginEnabled:true,loginName:account.id,storeId:hallId,hallId};
    adminSql(config,`SET ROLE ${ident(config.roles.auth)};INSERT INTO ${a}.employee_login(id,login_name,body,password_salt,password_hash) VALUES(${literal(account.id)},${literal(account.id)},${literal(JSON.stringify(body))}::jsonb,${literal(salt)},${literal(hash)});RESET ROLE;`);
  }
}
function fingerprint(){
  const schemas=Object.values(config.schemas).map(literal).join(','),tables=adminValue(config,`SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN (${schemas})`);
  const sequences=adminValue(config,`SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname) ORDER BY n.nspname,c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname IN (${schemas})`);
  const rows=adminValue(config,`SELECT jsonb_agg(x ORDER BY x->>'schema',x->>'table') FROM (${tables.map(t=>`SELECT jsonb_build_object('schema',${literal(t.schema)},'table',${literal(t.table)},'count',count(*),'digest',md5(coalesce(string_agg(h,'' ORDER BY h),''))) x FROM (SELECT md5(to_jsonb(v)::text) h FROM ${ident(t.schema)}.${ident(t.table)} v) hashed`).join(' UNION ALL ')}) all_tables`);
  const seq=sequences.length?adminValue(config,`SELECT jsonb_agg(x ORDER BY x->>'name') FROM (${sequences.map(t=>`SELECT jsonb_build_object('name',${literal(t.schema+'.'+t.name)},'value',last_value::text,'called',is_called) x FROM ${ident(t.schema)}.${ident(t.name)}`).join(' UNION ALL ')}) all_sequences`):[];
  return {rows,sequences:seq};
}
async function login(key){const reply=await app.inject({method:'POST',url:'/api/runtime/session',headers:{origin:environment.SESSION_ORIGIN,'content-type':'application/json'},payload:{loginName:accounts[key].id,password}});
  assert.equal(reply.statusCode,200);const cookie=reply.headers['set-cookie'],data=reply.json().data;return {cookie:(Array.isArray(cookie)?cookie[0]:cookie).split(';')[0],csrf:data.csrfToken};}
async function call(key,url,payload,extra={}){
  const method=payload===undefined?'GET':'POST',session=sessions[key],headers=session?{cookie:session.cookie,origin:environment.SESSION_ORIGIN,...(payload===undefined?{}:{'content-type':'application/json','x-csrf-token':session.csrf,'x-request-id':payload.requestKey})}:{};
  const reply=await app.inject({method,url,headers:{...headers,...extra},...(payload!==undefined?{payload}: {})});
  requests.push({actor:key||'anonymous',method,url,...(payload!==undefined?{body:payload}:{}),status:reply.statusCode,response:reply.json()});return reply;
}
function success(reply,label){assert.equal(reply.statusCode,200,label+' '+reply.body);assert.equal(reply.json().ok,true);return reply.json().data;}
const fixtureUnits=new Map([[skuId,'件'],[fractionalSku,'米'],[unknownUnitSku,'未知单位'],[disabledSku,'件'],[newSku,'件'],[browserSku,'件']]);
const input=(actual,sku=skuId,warehouse=warehouseId)=>({warehouseId:warehouse,skuId:sku,unit:fixtureUnits.get(sku),actualQuantity:String(actual),reason:'T23 合成校正原因'});
const preview=async(key,body)=>success(await call(key,'/api/correction/preview?'+new URLSearchParams(body)),'preview');
const command=(p,extra={})=>({warehouseId:p.warehouseId,skuId:p.skuId,unit:p.unit,actualQuantity:p.actualQuantity,reason:p.reason,expectedVersion:0,expectedBalanceVersion:p.balanceVersion,correctionId:randomUUID(),requestKey:randomUUID(),...extra});
const stock=async(sku=skuId,w=warehouseId)=>{
  const unit=fixtureUnits.get(sku);assert.ok(unit,'Synthetic stock read requires a declared fixture unit');
  const data=success(await call('admin','/api/inventory?'+new URLSearchParams({skuId:sku,warehouseId:w,unit,size:1})),'stock');
  const cell=data.items.find(row=>row.skuId===sku&&row.warehouseId===w&&row.unit===unit);
  assert.ok(cell,'Original warehouse / SKU / unit cell missing');assert.equal(data.total,1);return cell.quantity;
};
async function reject(name,work,status,code){const before=fingerprint(),reply=await work();assert.equal(reply.statusCode,status,name+' '+reply.body);if(code)assert.equal(reply.json().error.code,code);const after=fingerprint();assert.deepEqual(after,before,name+' mutated database');fingerprints[name]={before,after,unchanged:true};checked(name,{statusCode:status,errorCode:reply.json().error.code});return reply.json();}
function counts(){return adminValue(config,`SELECT jsonb_build_object('corrections',(SELECT count(*) FROM ${r}.document WHERE document_type='CORRECTION'),'postings',(SELECT count(*) FROM ${r}.posting),'movements',(SELECT count(*) FROM ${r}.movement),'history',(SELECT count(*) FROM ${r}.version_history),'requests',(SELECT count(*) FROM ${r}.idempotency_request))`);}
async function transfer(sku,q='2'){
  const id=randomUUID(),body={header:{business_date:'2026-10-02',source_from_warehouse_id:warehouseId,source_to_warehouse_id:otherWarehouse},lines:[{sku_id:sku,from_warehouse_id:warehouseId,to_warehouse_id:otherWarehouse,source_quantity:q,unit:'件'}],fundsRecords:[]};
  success(await call('admin','/api/runtime/command',{documentId:id,documentType:'TRANSFER',operation:'create',expectedVersion:0,requestKey:randomUUID(),body}),'transfer create');
  success(await call('admin','/api/runtime/command',{documentId:id,documentType:'TRANSFER',operation:'approve',expectedVersion:1,requestKey:randomUUID()}),'transfer approve');return id;
}
async function buildUI(){
  const web=join(suite,'web');mkdirSync(web,{recursive:true});
  await build({configFile:join(root,'frontend/vite.inventory-correction.config.mjs'),build:{outDir:join(web,'assets'),emptyOutDir:false}});
  copyFileSync(join(root,'frontend/service-client.js'),join(web,'service-client.js'));return web;
}
async function controllerVerification(){
  const memory=new Map(),storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
  let activeRole='admin',lose=false,requestLog=[];
  const actor=()=>accounts[activeRole];
  const browser={fetch:async(url,options={})=>{const body=options.body===undefined?undefined:JSON.parse(options.body);requestLog.push({url,method:options.method||'GET'});
    const reply=await call(activeRole,url,body);if(lose&&url==='/api/correction/confirm'){lose=false;throw new Error('synthetic response lost after commit');}
    return {ok:reply.statusCode<400,status:reply.statusCode,json:async()=>reply.json()};},crypto:{randomUUID},sessionStorage:storage,MASTER_DATA:{current:actor},AbortController,URLSearchParams,setTimeout,clearTimeout,navigator:{onLine:true}};
  runInNewContext(readFileSync(join(root,'frontend/service-client.js'),'utf8'),browser);
  const api=browser.ERP_API,c=createCorrectionController({api,actor,storage,uuid:randomUUID});
  await c.open();await c.change('warehouseId',warehouseId);await c.change('skuId',newSku);assert.equal(c.state.input.unit,fixtureUnits.get(newSku));c.change('actualQuantity','4');c.change('reason','合成响应丢失校正');await c.preview();
  lose=true;await assert.rejects(()=>c.confirm());assert.ok(c.state.pendingId);assert.equal(c.state.input.actualQuantity,'4');const firstId=c.state.pendingId,afterCommit=counts();
  const reloaded=createCorrectionController({api:api.createClient({fetcher:browser.fetch,actor:()=>actor().id,storage}),actor,storage,uuid:randomUUID});
  await reloaded.open();assert.equal(reloaded.state.pendingId,firstId);assert.equal(reloaded.state.input.actualQuantity,'4');assert.equal(reloaded.state.input.unit,fixtureUnits.get(newSku));requestLog=[];
  const recovered=await reloaded.recoverRequest(firstId);assert.equal(recovered.ok,true);assert.equal(recovered.record.correction.actualQuantity,'4.0000');assert.equal(reloaded.state.balance.quantity,'4.0000');assert.deepEqual(counts(),afterCommit);
  assert.ok(requestLog.every(item=>item.method==='GET'));assert.equal(reloaded.pending().length,0);
  assert.equal(recovered.record.correction.unit,fixtureUnits.get(newSku));assert.equal(reloaded.state.balance.unit,fixtureUnits.get(newSku));
  samples.recovery={requestId:firstId,record:recovered.record,balance:recovered.balance,requests:requestLog,countsUnchanged:true,unitPreserved:true};
  checked('T11 response-loss recovery survives refresh, preserves input, queries only GETs, and adds no record');
  // A second browser identity cannot inherit the first actor's draft or pending request.
  activeRole='warehouse';const other=createCorrectionController({api:api.createClient({fetcher:browser.fetch,actor:()=>actor().id,storage}),actor,storage});await other.open();assert.equal(other.state.input.actualQuantity,'');
  activeRole='salesperson';assert.equal(other.permitted(),false);assert.equal(await other.open(),false);checked('Correction input and request recovery stay actor-owned; salesperson UI cannot open');
}

try{
  assert.match(tool('postgres',['--version'],'version.log'),/PostgreSQL\) 17\./);
  tool('initdb',['-D',data,'-U',admin,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C','--wal-segsize=1','--set','min_wal_size=2MB','--set','max_wal_size=8MB'],'initdb.log');
  tool('pg_ctl',['-D',data,'-l',join(suite,'postgres.log'),'-o',`-c listen_addresses='' -c min_wal_size=2MB -c max_wal_size=8MB -c unix_socket_permissions=0700 -c unix_socket_directories=${socket} -p ${port}`,'-w','start'],'start.log');started=true;
  const cluster=JSON.parse(tool('psql',['-X','-w','-qAt',...conn('postgres'),'-c',"SELECT jsonb_build_object('clusterId',system_identifier::text,'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses')) FROM pg_control_system()"],'identity.log'));
  assert.equal(cluster.dataDirectory,data);assert.equal(cluster.listenAddresses,'');environment.POSTGRES_CLUSTER_ID=cluster.clusterId;result.cluster=cluster;
  tool('createdb',['-h',socket,'-p',port,'-U',admin,'-T','template0',databaseName],'qa-create.log');config=readDatabaseConfig(environment,'qa');assertIsolatedTarget(config);targets.push({database:databaseName,environment:'qa',host:socket,instanceId:config.instanceId,clusterId:config.clusterId});
  await maintenance(environment,'bootstrap','bootstrap.log');
  // Upgrade a populated 0004 database without modifying old migration resources or imported identities.
  tool('psql',['-X','-w','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-p',port,'-U',config.roles.migrator,'-d',databaseName,'-c',migrationSql(config,loadMigrations(config).slice(0,4))],'migrate-first-four.log');
  seed();const beforeUpgrade=fingerprint(),legacyBefore=adminValue(config,`SELECT to_jsonb(d) FROM ${r}.document d WHERE id=${literal(legacyId)}::uuid`);
  const upgrade=await maintenance(environment,'migrate','migrate.log');const afterUpgrade=fingerprint();
  assert.deepEqual(afterUpgrade.rows.filter(row=>row.schema===config.schemas.source),beforeUpgrade.rows.filter(row=>row.schema===config.schemas.source));
  const legacyAfter=adminValue(config,`SELECT to_jsonb(d) FROM ${r}.document d WHERE id=${literal(legacyId)}::uuid`);
  assert.deepEqual(legacyAfter,{...legacyBefore,transfer_creator_account_id:null,transfer_creator_hall_id:null,transfer_creator_role:null});
  const repeatBefore=fingerprint();assert.deepEqual((await maintenance(environment,'migrate','migrate-repeat.log')).applied,[]);assert.deepEqual(fingerprint(),repeatBefore);
  samples.migration={upgrade,legacyBefore,legacyAfter,sourceUnchanged:true,repeatUnchanged:true};checked('Current migration upgrade preserves Source, old version 17 and unknown historical actors/creation scope; repeating migration is a no-op');
  writeFileSync(environment.SESSION_SECRET_FILE,randomBytes(48),{mode:0o600});app=createApp(readConfig(environment));await app.ready();
  for(const key of Object.keys(accounts))sessions[key]=await login(key);
  const sourceBefore=fingerprint().rows.filter(row=>row.schema===config.schemas.source);
  const readBefore=fingerprint(),p=await preview('admin',input('7'));assert.equal(p.bookQuantity,'10.0000');assert.equal(p.delta,'-3.0000');assert.deepEqual(fingerprint(),readBefore);
  fingerprints.preview={before:readBefore,after:fingerprint(),unchanged:true};checked('Preview is a read-only 10 / actual 7 / difference -3 snapshot');
  await transfer(skuId);assert.equal(await stock(),'8.0000');
  const first=command(p),stale=await reject('Stale 10-to-7 confirmation returns fresh 8 / -1 without any writes',()=>call('admin','/api/correction/confirm',first),409,'BALANCE_CONFLICT');
  assert.equal(stale.error.latest.bookQuantity,'8.0000');assert.equal(stale.error.latest.delta,'-1.0000');assert.notEqual(stale.error.latest.balanceVersion,p.balanceVersion);
  const fresh={...first,expectedBalanceVersion:stale.error.latest.balanceVersion};const confirmed=success(await call('admin','/api/correction/confirm',fresh),'latest confirmation');assert.equal(await stock(),'7.0000');assert.equal(confirmed.correction.delta,'-1.0000');assert.equal(confirmed.actorId,accounts.admin.id);
  samples.recomputed={preview:p,staleRequest:first,staleResponse:stale,freshRequest:fresh,confirmed,balance:await stock()};checked('Explicit latest confirmation posts -1 and finishes at 7 with trusted actor and basis source');
  const ledger=success(await call('salesperson','/api/inventory/ledger?'+new URLSearchParams({warehouseId,skuId,unit:p.unit})),'ledger');
  const target=ledger.items.find(row=>row.postingId===confirmed.postingId);assert.equal(target.stockDelta,'-1.0000');assert.equal(target.sourceTarget.documentType,'CORRECTION');
  const trace=success(await call('salesperson',target.sourceTarget.url),'correction trace');assert.equal(trace.reason,'INVENTORY_CORRECTION');assert.equal(trace.operationVersion,1);assert.equal(trace.document.body.correction.reason,input('7').reason);samples.trace={ledger,trace};checked('T19 ledger opens the immutable correction revision, operation version, actor and original SKU');
  const beforeZero=counts(),deltaBefore=adminValue(config,`SELECT jsonb_agg(to_jsonb(x) ORDER BY warehouse_id,sku_id) FROM ${r}.inventory_delta x`);
  const zeroInput=command(await preview('warehouse',input('7'))),zero=success(await call('warehouse','/api/correction/confirm',zeroInput),'zero confirmation');
  assert.equal(zero.correction.delta,'0.0000');assert.equal(await stock(),'7.0000');assert.equal(counts().corrections,beforeZero.corrections+1);assert.equal(counts().movements,beforeZero.movements);
  assert.deepEqual(adminValue(config,`SELECT jsonb_agg(to_jsonb(x) ORDER BY warehouse_id,sku_id) FROM ${r}.inventory_delta x`),deltaBefore);
  const zeroFingerprint=fingerprint();assert.deepEqual(success(await call('warehouse','/api/correction/confirm',zeroInput),'zero retry'),zero);assert.deepEqual(fingerprint(),zeroFingerprint);
  samples.zero={request:zeroInput,record:zero,before:beforeZero,after:counts(),projectionUnchanged:true};checked('Zero difference creates exactly one record and confirmation audit, adds no movement and changes no projection');
  const duplicateBefore=fingerprint();assert.deepEqual(success(await call('admin','/api/correction/confirm',fresh),'original retry after other correction'),confirmed);assert.deepEqual(fingerprint(),duplicateBefore);
  fingerprints.duplicate={before:duplicateBefore,after:fingerprint(),unchanged:true};checked('Committed retry returns original success even after a later zero correction; full database fingerprint unchanged');
  await reject('Same key with a changed reason is an idempotency conflict',()=>call('admin','/api/correction/confirm',{...fresh,reason:'different'}),409,'IDEMPOTENCY_CONFLICT');
  const valid=command(await preview('admin',input('6')));
  await reject('Salesperson direct confirmation is forbidden',()=>call('salesperson','/api/correction/confirm',valid),403,'FORBIDDEN');
  await reject('Salesperson preview is forbidden',()=>call('salesperson','/api/correction/preview?'+new URLSearchParams(input('6'))),403,'FORBIDDEN');
  await reject('Anonymous correction is rejected',()=>call(null,'/api/correction/confirm',valid),401,'UNAUTHENTICATED');
  await reject('Invalid CSRF token is rejected',()=>call('admin','/api/correction/confirm',valid,{'x-csrf-token':'invalid'}),403,'CSRF');
  await reject('Actor spoofing is rejected as an unknown field',()=>call('admin','/api/correction/confirm',{...valid,actorId:'spoofed-admin'}),400,'VALIDATION');
  await reject('Request header mismatch is rejected',()=>call('admin','/api/correction/confirm',valid,{'x-request-id':'different'}),400,'VALIDATION');
  await reject('Blank reason is rejected',()=>call('admin','/api/correction/confirm',{...valid,reason:'  '}),400,'VALIDATION');
  for(const actual of ['1.25','1.00001','1e3','','NaN','100000000000000',7])await reject('Invalid clothing quantity '+JSON.stringify(actual),()=>call('admin','/api/correction/confirm',{...valid,actualQuantity:actual}),400,'VALIDATION');
  await reject('Disabled warehouse is rejected',()=>call('admin','/api/correction/preview?'+new URLSearchParams(input('1',skuId,disabledWarehouse))),403,'SCOPE');
  await reject('Unknown warehouse ownership is rejected',()=>call('admin','/api/correction/preview?'+new URLSearchParams(input('1',skuId,unknownWarehouse))),403,'SCOPE');
  await reject('Disabled SKU is rejected',()=>call('admin','/api/correction/preview?'+new URLSearchParams(input('1',disabledSku))),409,'REFERENCE_CONFLICT');
  await reject('Unconfirmed unit precision is rejected',()=>call('admin','/api/correction/preview?'+new URLSearchParams(input('1',unknownUnitSku))),409,'REFERENCE_CONFLICT');
  const contenders=await Promise.all([preview('admin',input('6')),preview('warehouse',input('5'))]),concurrentInputs=contenders.map(p=>command(p)),concurrentBefore=counts();
  const concurrent=await Promise.all(concurrentInputs.map((body,i)=>call(i?'warehouse':'admin','/api/correction/confirm',body)));
  assert.deepEqual(concurrent.map(reply=>reply.statusCode).sort(),[200,409]);assert.equal(counts().corrections,concurrentBefore.corrections+1);
  const winner=concurrent.find(reply=>reply.statusCode===200).json().data,loser=concurrent.find(reply=>reply.statusCode===409).json();assert.equal(loser.error.code,'BALANCE_CONFLICT');assert.equal(await stock(),winner.correction.actualQuantity);
  samples.concurrent={inputs:concurrentInputs,responses:concurrent.map(reply=>reply.json()),before:concurrentBefore,after:counts(),balance:await stock()};checked('Two actors confirming the same cell version serialize: one commits, one must re-confirm, no lost update');
  const sameRequest=command(await preview('admin',input(await stock()))),sameBefore=counts();const sameResponses=await Promise.all([call('admin','/api/correction/confirm',sameRequest),call('admin','/api/correction/confirm',sameRequest)]);
  assert.ok(sameResponses.every(reply=>reply.statusCode===200));assert.deepEqual(sameResponses[0].json(),sameResponses[1].json());assert.equal(counts().corrections,sameBefore.corrections+1);assert.equal(counts().movements,sameBefore.movements);checked('Concurrent identical retries create one zero-difference record and one audit');
  const aba=await preview('admin',input('4')),abaQuantity=await stock(),transferId=await transfer(skuId);
  success(await call('admin','/api/runtime/command',{documentId:transferId,documentType:'TRANSFER',operation:'unapprove',expectedVersion:2,requestKey:randomUUID()}),'ABA unapprove');assert.equal(await stock(),abaQuantity);
  await reject('Ledger version catches ABA quantity changes',()=>call('admin','/api/correction/confirm',command(aba)),409,'BALANCE_CONFLICT');
  const failureInput=command(await preview('admin',input('3')));
  adminSql(config,`SET ROLE ${ident(config.roles.runtime)};CREATE FUNCTION ${r}.t23_fail_movement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'T23_SYNTHETIC_MOVEMENT_FAILURE'; END $$;
    CREATE TRIGGER t23_synthetic_failure BEFORE INSERT ON ${r}.movement FOR EACH ROW EXECUTE FUNCTION ${r}.t23_fail_movement();RESET ROLE;`);
  await reject('Failure after document, posting and projection insert rolls back the entire correction',()=>call('admin','/api/correction/confirm',failureInput),503,'CONNECTION');
  adminSql(config,`SET ROLE ${ident(config.roles.runtime)};DROP TRIGGER t23_synthetic_failure ON ${r}.movement;DROP FUNCTION ${r}.t23_fail_movement();RESET ROLE;`);
  const negative=success(await call('warehouse','/api/correction/confirm',command(await preview('warehouse',input('-2')))),'negative actual');assert.equal(await stock(),'-2.0000');
  const actualZero=success(await call('admin','/api/correction/confirm',command(await preview('admin',input('0')))),'zero actual');assert.equal(await stock(),'0.0000');
  const fractional=success(await call('warehouse','/api/correction/confirm',command(await preview('warehouse',input('1.125',fractionalSku)))),'fractional actual');assert.equal(await stock(fractionalSku),'1.1250');
  await reject('Decimal-unit precision rejects extra fractional places',()=>call('warehouse','/api/correction/preview?'+new URLSearchParams(input('1.1251',fractionalSku))),400,'VALIDATION');
  samples.signs={negative,actualZero,fractional};checked('Positive, zero and negative actual quantities are accepted; per-SKU confirmed unit precision is enforced');
  await controllerVerification();
  const readHistory=fingerprint();samples.history=success(await call('salesperson','/api/corrections?size=200'),'list');assert.ok(samples.history.items.some(x=>x.correctionId===zero.correctionId));
  assert.deepEqual(success(await call('salesperson','/api/corrections/'+zero.correctionId),'zero detail'),zero);assert.deepEqual(fingerprint(),readHistory);
  assert.deepEqual(fingerprint().rows.filter(row=>row.schema===config.schemas.source),sourceBefore);checked('List/detail include zero corrections and are read-only; all Source facts and original SKU identities unchanged');
  samples.audit=adminValue(config,`SELECT jsonb_build_object('documents',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM ${r}.document d WHERE document_type='CORRECTION'),
    'versions',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.document_id,h.version) FROM ${r}.version_history h JOIN ${r}.document d ON d.id=h.document_id WHERE d.document_type='CORRECTION'),
    'postings',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM ${r}.posting p JOIN ${r}.document d ON d.id=p.document_id WHERE d.document_type='CORRECTION'),
    'movements',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.posting_id,m.line_index) FROM ${r}.movement m JOIN ${r}.posting p ON p.id=m.posting_id JOIN ${r}.document d ON d.id=p.document_id WHERE d.document_type='CORRECTION'))`);
  assert.equal(fractional.correction.unit,fixtureUnits.get(fractionalSku));
  if(process.env.T23_BROWSER_VERIFY==='1')await runBrowserVerification(await buildUI());
  result.status='PASS';result.completedAt=new Date().toISOString();result.targets=targets;result.verification={task_id:'T23',status:'PASS',checks,syntheticDatabase:databaseName,postgresVersion:'17',listenAddresses:'',productionConnections:0,existingBusinessConnections:0,serverOperations:0,realCredentialsUsed:false,tableCount:sourceBefore.length,clusterStopped:false};
}catch(error){result.status='FAIL';result.failure=error instanceof Error?error.message:'T23_VERIFY_FAILED';result.completedAt=new Date().toISOString();throw error;
}finally{
  writeJson(join(out,'request-evidence.json'),requests);writeJson(join(out,'acceptance-samples.json'),samples);writeJson(join(out,'rejection-fingerprints.json'),fingerprints);
  if(uiServer)await new Promise(resolve=>uiServer.close(resolve));if(app)await app.close();
  if(started){const stop=spawnSync(join(pg,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C'}});writeFileSync(join(suite,'stop.log'),(stop.stdout||'')+(stop.stderr||''),{mode:0o600});result.clusterStopped=stop.status===0;if(result.verification)result.verification.clusterStopped=result.clusterStopped;}
  writeJson(join(suite,'RESULT.json'),result);writeJson(join(out,'database-verification.json'),result.verification||result);if(started&&!result.clusterStopped)throw new Error('T23_PRIVATE_POSTGRESQL_STOP_FAILED');
}

async function runBrowserVerification(web){
  let finish,loss=false,changedBook;const done=new Promise(resolve=>{finish=resolve;});
  uiServer=createServer(async(req,res)=>{try{
    const url=new URL(req.url,'http://localhost'),role=/T23_UI_ACTOR=(admin|warehouse|salesperson)/.exec(req.headers.cookie||'')?.[1]||'admin';
    if(url.pathname==='/__t23_fixture/change-book'){changedBook??=transfer(browserSku);await changedBook;res.end('合成账面已从10变8');return;}
    if(url.pathname==='/__t23_fixture/lose-response'){loss=true;res.end('下一次合成确认将丢失响应');return;}
    if(url.pathname==='/__t23_fixture/finish'){res.end('T23 QA stopped');finish();return;}
    if(url.pathname.startsWith('/api/')){
      let raw='';for await(const chunk of req)raw+=chunk;const payload=raw?JSON.parse(raw):undefined;
      const reply=await call(role,req.url,payload);
      if(loss&&url.pathname==='/api/correction/confirm'&&reply.statusCode===200){loss=false;req.socket.destroy();return;}
      res.writeHead(reply.statusCode,{'content-type':'application/json','cache-control':'no-store'});res.end(reply.body);return;
    }
    if(url.pathname==='/'){
      const chosen=Object.hasOwn(accounts,url.searchParams.get('actor'))?url.searchParams.get('actor'):'admin',account=accounts[chosen];
      const page=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>T23 合成 QA</title><style>body{font-family:system-ui,sans-serif;margin:32px;color:#1d2129}button{height:32px;padding:0 16px;margin-right:8px;cursor:pointer}a{margin-right:16px}aside{margin-top:28px;color:#666}</style><h1>库存状况表</h1><p>合成 QA 数据 · ${account.role}</p>${chosen==='salesperson'?'':`<button data-i="correction">库存校正</button>`}<a href="?actor=admin">管理员</a><a href="?actor=warehouse">仓库人员</a><a href="?actor=salesperson">营业员</a><aside>仅本页测试工具：<button onclick="fetch('/__t23_fixture/change-book').then(()=>this.textContent='合成账面已变8')">模拟账面变8</button><button onclick="fetch('/__t23_fixture/lose-response').then(()=>this.textContent='已设置响应丢失')">模拟响应丢失</button></aside><script>window.MASTER_DATA={current:()=>(${JSON.stringify(account)})};</script><script src="service-client.js"></script><script src="assets/inventory-correction.bundle.js"></script></html>`;
      res.writeHead(200,{'content-type':'text/html;charset=utf-8','set-cookie':`T23_UI_ACTOR=${chosen}; SameSite=Strict; Path=/`});res.end(page);return;
    }
    const file=url.pathname==='/service-client.js'?join(web,'service-client.js'):url.pathname==='/assets/inventory-correction.bundle.js'?join(web,'assets/inventory-correction.bundle.js'):null;
    if(!file){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':'text/javascript'});res.end(readFileSync(file));
  }catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}});
  await new Promise(resolve=>uiServer.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+uiServer.address().port;
  writeJson(join(out,'browser-server.json'),{url,loopbackOnly:true,syntheticOnly:true,suite,db:databaseName,skuId:browserSku,fixtureBridge:'Local HTTP test bridge injects existing synthetic sessions and configured synthetic HTTPS origin; not an HTTPS deployment test'});
  console.log('T23_SYNTHETIC_BROWSER_READY '+url);
  const deadline=setTimeout(()=>{finish();},15*60*1000);await done;clearTimeout(deadline);
  samples.browserReadback={balance:await stock(browserSku),records:success(await call('admin','/api/corrections?'+new URLSearchParams({skuId:browserSku,size:200})),'browser records')};
  assert.equal(samples.browserReadback.balance,'7.0000','Browser should complete the 10 / 8 / 7 scenario');
  const browserRecords=samples.browserReadback.records.items.map(item=>item.correction);
  assert.equal(browserRecords.length,2,'Browser must confirm one -1 correction and one zero correction');
  assert.equal(browserRecords.filter(row=>row.bookQuantity==='8.0000'&&row.actualQuantity==='7.0000'&&row.delta==='-1.0000').length,1);
  assert.equal(browserRecords.filter(row=>row.bookQuantity==='7.0000'&&row.actualQuantity==='7.0000'&&row.delta==='0.0000').length,1);
  checked('Actual Arco modal with synthetic QA API completed 10 / changed 8 / confirmed 7; browser requests retained');
}
