import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {createHash, pbkdf2Sync, randomBytes, randomUUID} from 'node:crypto';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
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
import {formatScaled, parseScaled} from '../server/domain/transactions/decimal.ts';

const pg = process.env.T17_PG_BIN;
if (!pg || !isAbsolute(pg)) throw new Error('T17_PG_BIN must explicitly select local PostgreSQL 17');
const phase = process.env.T17_FIX_PHASE;
if (!['red','green'].includes(phase)) throw new Error('T17_FIX_PHASE must be red or green; it selects evidence paths only');
const revision = '20261005-transaction-acceptance-fix-v1';
const out = join(root, 'outputs/T17/revisions', revision, phase), logs = join(root, 'logs/T17/revisions', revision, phase);
mkdirSync(out, {recursive: true}); mkdirSync(logs, {recursive: true}); chmodSync(logs, 0o700);
const suite = mkdtempSync(join(logs, 'postgres-suite-'));
chmodSync(suite, 0o700);
const data = join(suite, 'data'), admin = 't17_fix_bootstrap', port = '55494';
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
async function checked(name, action) {
  try {const details = await action(); checks.push({name,status:'PASS',...details}); console.log('PASS: ' + name);}
  catch (error) {checks.push({name,status:'FAIL',failure:error instanceof Error?error.message:'ASSERTION_FAILED'}); console.log('FAIL: ' + name);}
}
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
const warehouseIds = [uid(201),uid(202),uid(203)], productId = uid(101), skuId = uid(102), hallId = uid(301);
const digest = text => createHash('sha256').update(text).digest('hex');
const runSuffix = randomUUID().replaceAll('-','').slice(0,8);
const prefix = 't17fix_' + runSuffix;
const databaseName = 'demo_8877_t17_fix_' + runSuffix;
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
const account = {id:'t17-fix-admin',name:'Synthetic T17 Fix Admin',role:'管理员'};
const password = randomUUID() + '-synthetic-only';
const imported = [401,402,403,404].map(n => ({id:uid(n),body:transferBody('1'),
  auditor:n===404?'SOURCE-AUDITOR':null,auditedAt:n===404?'2026-09-29T06:20:00.000Z':null}));
function transferBody(quantity) {
  return {header:{business_date:'2026-10-02',source_from_warehouse_id:warehouseIds[0],source_to_warehouse_id:warehouseIds[1]},
    lines:[{source_id:'SYNTHETIC-T17-LINE',sku_id:skuId,product_id:productId,unit:'双',
      from_warehouse_id:warehouseIds[0],to_warehouse_id:warehouseIds[1],source_quantity:quantity}],fundsRecords:[]};
}
function seed() {
  const s=ident(config.schemas.source),r=ident(config.schemas.runtime),a=ident(config.schemas.auth);
  adminSql(config,`SET ROLE ${ident(config.roles.source)};
    INSERT INTO ${s}.category(id,code,code_normalized,name) VALUES(${literal(productId)},'T17FIX','T17FIX','Synthetic category');
    INSERT INTO ${s}.unit(id,code,code_normalized,name,quantity_scale) VALUES(${literal(productId)},'T17FIX','T17FIX','双',4);
    INSERT INTO ${s}.product(id,code,code_normalized,name,category_id,unit_id) VALUES(${literal(productId)},'T17FIX','T17FIX','Synthetic product',${literal(productId)},${literal(productId)});
    INSERT INTO ${s}.variant(id,product_id,option_key) VALUES(${literal(skuId)},${literal(productId)},'SYNTHETIC-T17FIX');
    ${warehouseIds.map((id,i)=>`INSERT INTO ${s}.warehouse(id,code,code_normalized,name,type,enabled) VALUES(${literal(id)},'T17FIX-W${i}','T17FIX-W${i}','Synthetic warehouse ${i}','WAREHOUSE',true);`).join('\n')}
    INSERT INTO ${s}.tplus_import_run(batch_id,space_key,schema_name,database_name,manifest_path,manifest_sha256,preflight_batch_id,importer_version,status,git_sha,workspace_state_sha256)
      VALUES('T17FIX','SYNTHETIC',${literal(config.schemas.source)},${literal(config.database)},'SYNTHETIC-T17FIX',repeat('0',64),'SYNTHETIC','T17FIX','COMMITTED','SYNTHETIC',repeat('0',64));
    INSERT INTO ${s}.tplus_hall(batch_id,id,source_id,source_code,name,warehouse_ids,source_payload)
      VALUES('T17FIX',${literal(hallId)},'T17FIX-HALL','T17FIX-HALL','Synthetic hall',ARRAY[${warehouseIds.map(id=>literal(id)+'::uuid').join(',')}],'{}');
    INSERT INTO ${s}.tplus_inventory_balance_source(batch_id,source_id,variant_id,warehouse_id,quantity,unit,opening_quantity,cutoff_source_date,
      snapshot_used,apply_historical_documents_again,source_event_count,components,source_payload)
      VALUES('T17FIX','T17FIX-OPENING',${literal(skuId)},${literal(warehouseIds[0])},100,'双',100,'2026-10-01',true,false,0,'{"opening":"100"}','{"fixture":"synthetic"}');
    RESET ROLE;
    SET ROLE ${ident(config.roles.runtime)};
    INSERT INTO ${r}.operator(id,name,role,enabled) VALUES(${literal(account.id)},${literal(account.name)},'ADMIN',true);
    INSERT INTO ${r}.master_data_entity(kind,id,body,source_facts,version,updated_by)
      VALUES ${warehouseIds.map((id,i)=>`('warehouses',${literal(id)},${literal(JSON.stringify({code:`T17FIX-W${i}`,name:`Synthetic warehouse ${i}`,enabled:true,type:'WAREHOUSE',hallRelations:[hallId],sourceOwnershipUnknown:false}))}::jsonb,'{"fixture":"synthetic"}',1,'T17FIX')`).join(',')};
    ${imported.map(x=>`INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision,version,business_day,original_auditor,original_audited_at)
      VALUES(${literal(x.id)},'TRANSFER','SYNTHETIC-IMPORTED-${x.id}','UNAUDITED',false,false,1,1,'2026-10-02',${x.auditor?literal(x.auditor):'NULL'},${x.auditedAt?literal(x.auditedAt)+'::timestamptz':'NULL'});
      INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id) VALUES(${literal(x.id)},1,true,${literal(JSON.stringify(x.body))}::jsonb,NULL);`).join('\n')}
    RESET ROLE;`);
  const salt=randomBytes(24).toString('hex'),hash=pbkdf2Sync(password,salt,210000,32,'sha256').toString('hex');
  const body={name:account.name,role:account.role,employmentStatus:'在职',loginEnabled:true,loginName:account.id,enabled:true};
  adminSql(config,`SET ROLE ${ident(config.roles.auth)};
    INSERT INTO ${a}.employee_login(id,login_name,body,password_salt,password_hash) VALUES(${literal(account.id)},${literal(account.id)},${literal(JSON.stringify(body))}::jsonb,${literal(salt)},${literal(hash)});
    RESET ROLE;`);
}
async function login() {
  const response=await app.inject({method:'POST',url:'/api/runtime/session',headers:{origin:environment.SESSION_ORIGIN,'content-type':'application/json'},payload:{loginName:account.id,password}});
  assert.equal(response.statusCode,200,'Synthetic login failed');
  const data=response.json().data,cookieHeader=response.headers['set-cookie'];
  const cookie=Array.isArray(cookieHeader)?cookieHeader[0]:cookieHeader;
  assert.ok(cookie&&typeof data?.csrfToken==='string');
  return {cookie:cookie.split(';')[0],csrf:data.csrfToken};
}
async function command(session,input,raw) {
  return app.inject({method:'POST',url:'/api/runtime/command',headers:{origin:environment.SESSION_ORIGIN,'content-type':'application/json',cookie:session.cookie,
    'x-csrf-token':session.csrf,'x-request-id':input.requestKey},payload:raw??input});
}
function request(documentId,operation,expectedVersion,body) {
  return {documentId,documentType:'TRANSFER',operation,expectedVersion,requestKey:'T17FIX-'+operation+'-'+randomUUID(),...(body?{body}:{})};
}
function success(response,label) {
  assert.equal(response.statusCode,200,label+' failed: '+response.body);
  const value=response.json();assert.equal(value.ok,true,label);return value.data;
}
function fingerprint() {
  const r=ident(config.schemas.runtime);
  const tables=['document','revision','version_history','posting','movement','inventory_delta','idempotency_request'];
  const fields=tables.map(t=>`${literal(t)},coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text) FROM ${r}.${t} x),'[]'::jsonb)`).join(',');
  return digest(adminSql(config,`SELECT jsonb_build_object(${fields})`));
}
function auditProof(id) {
  const r=ident(config.schemas.runtime);
  return adminValue(config,`SELECT jsonb_build_object('originalAuditor',d.original_auditor,'originalAuditedAt',d.original_audited_at,
    'baselineIncluded',d.baseline_was_included,'status',d.status,'version',d.version,'revision',d.current_revision,
    'originalBody',(SELECT body FROM ${r}.revision WHERE document_id=d.id AND revision=1),
    'currentImported',(SELECT original_imported FROM ${r}.revision WHERE document_id=d.id AND revision=d.current_revision),
    'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('operation',operation,'actor',actor_id,'at',created_at) ORDER BY version),'[]'::jsonb) FROM ${r}.version_history WHERE document_id=d.id),
    'postings',(SELECT coalesce(jsonb_agg(jsonb_build_object('actor',actor_id,'at',created_at,'reason',reason)),'[]'::jsonb) FROM ${r}.posting WHERE document_id=d.id))
    FROM ${r}.document d WHERE d.id=${literal(id)}::uuid`);
}
function assertImportedAudit(fixture) {
  const proof=auditProof(fixture.id);
  assert.equal(proof.baselineIncluded,false);
  assert.equal(proof.originalAuditor,fixture.auditor,'original auditor must retain its source fact, including NULL');
  assert.equal(proof.originalAuditedAt===null?null:new Date(proof.originalAuditedAt).toISOString(),fixture.auditedAt,'original audit time must retain its source fact, including NULL');
  assert.deepEqual(proof.originalBody,fixture.body,'immutable imported revision must retain its source facts');
  const audit=proof.history.at(-1);
  assert.equal(audit.operation,'approve');assert.equal(audit.actor,account.id);assert.ok(Number.isFinite(Date.parse(audit.at)));
  assert.equal(proof.postings.at(-1).actor,account.id);assert.ok(Number.isFinite(Date.parse(proof.postings.at(-1).at)));
  return proof;
}
async function balance(warehouseId) {
  return app.dataAccess.read(session=>readInventoryBalance(session,ident(config.schemas.runtime),warehouseId,skuId));
}
try {
  assert.match(tool('postgres',['--version'],'version.log'),/PostgreSQL\) 17\./);
  tool('initdb',['-D',data,'-U',admin,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C','--wal-segsize=1','--set','min_wal_size=2MB','--set','max_wal_size=8MB'],'initdb.log');
  tool('pg_ctl',['-D',data,'-l',join(suite,'postgres.log'),'-o',`-c listen_addresses='' -c min_wal_size=2MB -c max_wal_size=8MB -c unix_socket_permissions=0700 -c unix_socket_directories=${socket} -p ${port}`,'-w','start'],'start.log');started=true;
  const cluster=JSON.parse(tool('psql',['-X','-w','-qAt',...conn('postgres'),'-c',"SELECT jsonb_build_object('clusterId',system_identifier::text,'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses')) FROM pg_control_system()"],'identity.log'));
  assert.equal(cluster.dataDirectory,data);assert.equal(cluster.listenAddresses,'');
  environment.POSTGRES_CLUSTER_ID=cluster.clusterId;result.cluster=cluster;
  tool('createdb',['-h',socket,'-p',port,'-U',admin,'-T','template0',databaseName],'qa-create.log');
  writeFileSync(environment.SESSION_SECRET_FILE,randomBytes(48),{mode:0o600});chmodSync(environment.SESSION_SECRET_FILE,0o600);
  config=readDatabaseConfig(environment);assertIsolatedTarget(config);targets.push({environment:'qa',database:config.database,instanceId:config.instanceId});
  assert.equal((await maintenance(environment,'bootstrap','qa-bootstrap.log')).bootstrapped,true);
  const migrated=await maintenance(environment,'migrate','qa-migrate.log');
  assert.ok(migrated.versions.some(v=>v.id==='0012_current_export_inventory'));
  result.migrationVersions=migrated.versions.map(({id,checksum})=>({id,checksum}));
  seed();app=createApp(readConfig(environment));const session=await login();
  await checked('F01 imported unaudited transfer preserves unknown original audit on approval and reapproval',async()=>{
    const fixture=imported[0],approval=request(fixture.id,'approve',1);
    const approved=success(await command(session,approval),'imported no-body approval');
    let proof=assertImportedAudit(fixture);
    const before=fingerprint();assert.deepEqual(success(await command(session,approval),'exact approval retry'),approved);assert.equal(fingerprint(),before);
    success(await command(session,request(fixture.id,'unapprove',2)),'historical reversal');
    success(await command(session,request(fixture.id,'approve',3)),'historical reapproval');proof=assertImportedAudit(fixture);
    return {proof,retryBusinessUnchanged:true};
  });
  await checked('F01 approval with a replacement body preserves unknown original audit',async()=>{
    const fixture=imported[1];success(await command(session,request(fixture.id,'approve',1,transferBody('2'))),'replacement-body approval');
    const proof=assertImportedAudit(fixture);assert.equal(proof.currentImported,false);assert.equal(proof.revision,2);return {proof};
  });
  await checked('F01 saved later revision preserves unknown original audit on no-body approval',async()=>{
    const fixture=imported[2];success(await command(session,request(fixture.id,'save',1,transferBody('2'))),'save imported later revision');
    success(await command(session,request(fixture.id,'approve',2)),'approve saved later revision');
    const proof=assertImportedAudit(fixture);assert.equal(proof.currentImported,false);assert.equal(proof.revision,2);return {proof};
  });
  await checked('F01 known original auditor and timestamp survive runtime approval',async()=>{
    const fixture=imported[3];success(await command(session,request(fixture.id,'approve',1)),'approve imported known audit');return {proof:assertImportedAudit(fixture)};
  });
  await checked('F01 native first approval retains its current auditor and exact reversible posting',async()=>{
    const id=randomUUID(),body=transferBody('2'),before=await balance(warehouseIds[0]);
    success(await command(session,request(id,'create',0,body)),'native create');
    const approval=request(id,'approve',1);const approved=success(await command(session,approval),'native first approval');
    const first=auditProof(id);assert.equal(first.originalAuditor,account.id);assert.ok(Number.isFinite(Date.parse(first.originalAuditedAt)));
    assert.equal(await balance(warehouseIds[0]),formatScaled(parseScaled(before,4)-20000n,4));
    const snap=fingerprint();assert.deepEqual(success(await command(session,approval),'native approval retry'),approved);assert.equal(fingerprint(),snap);
    success(await command(session,request(id,'unapprove',2)),'native reversal');assert.equal(await balance(warehouseIds[0]),before);
    success(await command(session,request(id,'save',3,transferBody('3'))),'native later revision');
    success(await command(session,request(id,'approve',4)),'native reapproval');
    const proof=auditProof(id);assert.equal(proof.originalAuditor,first.originalAuditor);assert.equal(proof.originalAuditedAt,first.originalAuditedAt);
    return {proof,firstAuditorRetained:true,retryBusinessUnchanged:true,reversalRestoredBalance:true};
  });
  const invalid=[
    ['numeric quantity','source_quantity','1'],
    ['over-precision numeric quantity rounded by JSON','source_quantity','1.000000000000000001'],
    ['numeric zero adjustment','adjustment','0'],
    ['over-precision numeric adjustment rounded by JSON','adjustment','0.100000000000000001'],
    ['numeric source rounding fallback','rounding','0.100000000000000001'],
    ['over-precision quantity string','source_quantity','"1.00001"'],
    ['over-precision adjustment string','adjustment','"0.001"'],
    ['over-precision rounding string','rounding','"0.001"'],
  ];
  for(const [label,field,literalText] of invalid) await checked('F02 rejects '+label+' with zero business DML',async()=>{
    const body=transferBody('1');
    if(field==='source_quantity')body.lines[0].source_quantity='DECIMAL_PROBE';
    else if(field==='rounding')body.header.source_payload={rounding:'DECIMAL_PROBE'};
    else body.header.adjustment='DECIMAL_PROBE';
    const input=request(randomUUID(),'create',0,body),raw=JSON.stringify(input).replace('"DECIMAL_PROBE"',literalText),before=fingerprint();
    const response=await command(session,input,raw);
    assert.equal(response.statusCode,400,'invalid decimal must be rejected at the real JSON boundary');
    assert.equal(response.json().error.code,'VALIDATION');assert.equal(fingerprint(),before);
    return {statusCode:response.statusCode,errorCode:response.json().error.code,rawDecimalLiteral:literalText,businessDmlUnchanged:true};
  });
  await checked('F02 save and approve reject numeric quantity without changing a valid draft',async()=>{
    const id=randomUUID();success(await command(session,request(id,'create',0,transferBody('1'))),'valid rejection-control draft');
    for(const operation of ['save','approve']){
      const body=transferBody(1),input=request(id,operation,1,body),before=fingerprint(),response=await command(session,input);
      assert.equal(response.statusCode,400);assert.equal(response.json().error.code,'VALIDATION');assert.equal(fingerprint(),before);
    }
    return {operations:['save','approve'],businessDmlUnchanged:true};
  });
  await checked('F02 exact fractional quantity and signed cent strings round trip through approval',async()=>{
    const body=transferBody('0.0001');body.header.adjustment='-0.01';
    const id=randomUUID(),created=success(await command(session,request(id,'create',0,body)),'valid decimal-string create');
    assert.equal(created.document.body.lines[0].source_quantity,'0.0001');assert.equal(created.document.body.header.adjustment,'-0.01');
    success(await command(session,request(id,'approve',1)),'valid fractional approval');
    const r=ident(config.schemas.runtime),legs=adminValue(config,`SELECT jsonb_agg(jsonb_build_object('warehouse',m.warehouse_id,'quantity',m.quantity::text) ORDER BY m.warehouse_id)
      FROM ${r}.movement m JOIN ${r}.posting p ON p.id=m.posting_id WHERE p.document_id=${literal(id)}::uuid`);
    assert.deepEqual(legs,[{warehouse:warehouseIds[0],quantity:'-0.0001'},{warehouse:warehouseIds[1],quantity:'0.0001'}]);
    return {legs,adjustment:'-0.01'};
  });
  await checked('F02 exact large adjustment and source rounding strings remain supported',async()=>{
    for(const header of [{adjustment:'90071992547409.91'},{source_payload:{rounding:'0.01'}}]){
      const body=transferBody('1');Object.assign(body.header,header);
      const saved=success(await command(session,request(randomUUID(),'create',0,body)),'exact monetary-string create');
      assert.deepEqual(saved.document.body.header,{...body.header});
    }
    return {exactAdjustment:'90071992547409.91',exactRounding:'0.01'};
  });
  result.sourceFiles=['server/domain/transactions/command.ts','server/domain/transactions/decimal.ts','frontend/real-data-bridge.mjs','scripts/t17-acceptance-fix-verify.mjs']
    .map(path=>({path,sha256:digest(readFileSync(join(root,path)))}));
  result.targets=targets;result.phase=phase;result.revision=revision;result.status=checks.every(c=>c.status==='PASS')?'PASS':'FAIL';
  result.passed=checks.filter(c=>c.status==='PASS').length;result.failed=checks.filter(c=>c.status==='FAIL').length;result.completedAt=new Date().toISOString();
} catch(error) {
  result.status='FAIL';result.failure=error instanceof Error?error.message:'T17_FIX_VERIFY_FAILED';result.completedAt=new Date().toISOString();
} finally {
  if(app)await app.close();
  if(started){
    const stop=spawnSync(join(pg,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C'},maxBuffer:1024*1024});
    writeFileSync(join(suite,'stop.log'),(stop.stdout??'')+(stop.stderr??''),{mode:0o600});result.clusterStopped=stop.status===0;
    if(stop.status!==0){result.status='FAIL';result.failure='T17_FIX_PRIVATE_CLUSTER_STOP_FAILED';}
  }
  writeJson(join(suite,'RESULT.json'),result);writeJson(join(out,'database-verification.json'),result);
}
console.log(JSON.stringify({status:result.status,phase,passed:result.passed??0,failed:result.failed??0,clusterStopped:result.clusterStopped??false,evidence:join(out,'database-verification.json')}));
if(result.status!=='PASS')process.exitCode=1;
