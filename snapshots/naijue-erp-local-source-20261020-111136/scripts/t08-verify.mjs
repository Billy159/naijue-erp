import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,cpSync} from 'node:fs';
import {resolve,join,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync,spawn} from 'node:child_process';
import {readDatabaseConfig,assertIsolatedTarget,databaseIdentifier as ident} from '../dist/server/database/config.js';
import {maintenanceSql} from '../dist/server/database/psql.js';
import {bootstrapAssertionSql} from '../dist/server/database/identity.js';
import {migrationSql,loadMigrations,inspectSql} from '../dist/server/database/migrations.js';
import {sqlLiteral as literal} from '../dist/server/database/sql.js';
import {createApp} from '../dist/server/app.js';
import {readConfig} from '../dist/server/config.js';
import {root,writeJson} from './files.mjs';

const pg=process.env.T08_PG_BIN;
if (!pg || !isAbsolute(pg)) throw new Error('T08_PG_BIN must explicitly select the local PostgreSQL 17 tool directory');
const out=resolve(root,'outputs/T08'); const log=resolve(root,'logs/T08');
mkdirSync(out,{recursive:true}); mkdirSync(log,{recursive:true});
const suite=mkdtempSync(join(log,'postgres-suite-')); const socket=mkdtempSync(join(tmpdir(),'naijue-t08-socket-'));
const port='55488'; const admin='t08_bootstrap'; const checks=[]; const result={status:'RUNNING',suite,socket,checks};
const checked=(name,details={})=>{checks.push({name,status:'PASS',...details});console.log('PASS: '+name);};
function tool(name,args,filename) {
  const r=spawnSync(join(pg,name),args,{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C',PGPASSFILE:'/dev/null'},maxBuffer:4*1024*1024});
  writeFileSync(join(suite,filename),r.stdout+r.stderr);
  assert.equal(r.status,0,`${name} failed; see ${filename}`); return r.stdout;
}
const conn=(database,user=admin)=>['-h',socket,'-p',port,'-U',user,'-d',database];
function adminSql(config,statement) {
  assertIsolatedTarget(config);
  // Check the cluster and target on this same connection before any submitted statement.
  const r=spawnSync(join(pg,'psql'),['-X','-w','-qAt','-v','ON_ERROR_STOP=1',...conn(config.database)],{
    env:{PATH:process.env.PATH,PGPASSFILE:'/dev/null',PGOPTIONS:'-c search_path=pg_catalog -c timezone=UTC'},
    input:bootstrapAssertionSql(config,admin)+'\n'+statement,encoding:'utf8',maxBuffer:10*1024*1024});
  assert.equal(r.status,0,'isolated SQL failed (row contents are not printed)');return r.stdout.trim();
}
const query=(c,statement)=>JSON.parse(adminSql(c,statement));
const sql=(c,user,statement)=>maintenanceSql(c,user,statement,join(pg,'psql'));
async function rejected(c,user,statement,name,marker) {
  await assert.rejects(sql(c,user,statement),marker); checked(name);
}
function cli(env,command,name) {
  const r=spawnSync(process.execPath,[resolve(root,'scripts/database.mjs'),command],{env:{PATH:process.env.PATH,...env},encoding:'utf8',maxBuffer:1024*1024});
  writeFileSync(join(suite,name+'.log'),r.stdout+r.stderr);assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
}
function asyncCli(env,command,name) {
  return new Promise((yes,no)=>{
    const p=spawn(process.execPath,[resolve(root,'scripts/database.mjs'),command],{env:{PATH:process.env.PATH,...env},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);
    p.on('error',no);p.on('close',code=>{writeFileSync(join(suite,name+'.log'),stdout+stderr);if(code!==0)no(new Error(stderr));else yes(JSON.parse(stdout));});
  });
}
function fingerprints(c,tables,timeZone='UTC') {
  const statements=tables.map(t=>`SELECT jsonb_build_object('schema',${literal(t.schema)},'table',${literal(t.table)},'rows',count(*),'digest',md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM (SELECT md5(row_to_json(r)::text) h FROM ${ident(t.schema)}.${ident(t.table)} r)x;`);
  return adminSql(c,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL TIMEZONE='+literal(timeZone)+';'+statements.join('\n')+'ROLLBACK;').split('\n').map(x=>JSON.parse(x));
}
function catalog(c) {
  return adminSql(c,`BEGIN READ ONLY;
    SELECT jsonb_build_object('classes',(SELECT jsonb_agg(to_jsonb(x) ORDER BY schema,name) FROM (
      SELECT n.nspname schema,t.relname name,t.relkind,t.relowner::regrole::text owner,t.relacl::text acl,
        CASE WHEN t.relkind IN ('v','m') THEN pg_get_viewdef(t.oid,true) END view
      FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname IN (${Object.values(c.schemas).map(literal).join(',')}) AND t.relkind IN ('r','p','v','m','S'))x),
      'namespaces',(SELECT jsonb_agg(jsonb_build_object('name',nspname,'owner',nspowner::regrole::text,'acl',nspacl::text) ORDER BY nspname) FROM pg_namespace WHERE nspname IN (${Object.values(c.schemas).map(literal).join(',')})),
      'functions',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',proowner::regrole::text,'acl',proacl::text) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN (${Object.values(c.schemas).map(literal).join(',')})),
      'triggers',(SELECT jsonb_agg(pg_get_triggerdef(g.oid) ORDER BY g.oid) FROM pg_trigger g JOIN pg_class t ON t.oid=g.tgrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE NOT g.tgisinternal AND n.nspname IN (${Object.values(c.schemas).map(literal).join(',')})),
      'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY rolname) FROM pg_roles r WHERE rolname IN (${Object.values(c.roles).map(literal).join(',')})),
      'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY oid) FROM pg_default_acl d WHERE defaclrole IN (SELECT oid FROM pg_roles WHERE rolname IN (${Object.values(c.roles).map(literal).join(',')}))),
      'databaseAcl',(SELECT datacl::text FROM pg_database WHERE datname=current_database()),
      'roleSettings',(SELECT jsonb_agg(to_jsonb(d) ORDER BY setrole) FROM pg_db_role_setting d WHERE setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database())));
    ROLLBACK;`);
}
function allTables(c) { return query(c,`SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',t.relname) ORDER BY n.nspname,t.relname) FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname IN (${Object.values(c.schemas).map(literal).join(',')}) AND t.relkind='r';`); }
function sequences(c) {
  const names=query(c,`SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.relname) ORDER BY n.nspname,t.relname),'[]'::jsonb) FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname IN (${Object.values(c.schemas).map(literal).join(',')}) AND t.relkind='S'`);
  return names.map(n=>({schema:n.schema,name:n.name,...query(c,`SELECT jsonb_build_object('lastValue',last_value::text,'isCalled',is_called) FROM ${ident(n.schema)}.${ident(n.name)}`)}));
}
let started=false;
try {
  assert.match(tool('postgres',['--version'],'version.log'),/PostgreSQL\) 17\./);
  tool('initdb',['-D',join(suite,'data'),'-U',admin,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C'],'initdb.log');
  tool('pg_ctl',['-D',join(suite,'data'),'-l',join(suite,'postgres.log'),'-o',`-c listen_addresses='' -c unix_socket_permissions=0700 -c unix_socket_directories=${socket} -p ${port}`,'-w','start'],'start.log');started=true;
  const identity=JSON.parse(tool('psql',['-X','-w','-qAt',...conn('postgres'),'-c',"SELECT jsonb_build_object('clusterId',system_identifier::text,'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses')) FROM pg_control_system()"],'cluster-identity.log'));
  assert.equal(identity.dataDirectory,join(suite,'data'));assert.equal(identity.listenAddresses,'');result.clusterIdentity=identity;
  checked('独立本地实例身份、数据目录和禁用 TCP 已核对');
  const backup=resolve(root,'../奈爵服饰-8877-Demo/backup/business-management-current-20261001.dump');
  const metadata=JSON.parse(readFileSync(resolve(root,'../奈爵服饰-8877-Demo/data-cleaning/verification/database-backup-current.json'),'utf8'));
  const digest=createHash('sha256').update(readFileSync(backup)).digest('hex');assert.equal(digest,metadata.sha256);result.backupSha256=digest;
  checked('只读备份 SHA256 与已封存摘要一致',{bytes:metadata.bytes});
  const make=(label)=>{
    const suffix=randomUUID().replaceAll('-','').slice(0,10);const database='demo_8877_t08_'+label+'_'+suffix;
    assert.match(database,/^demo_8877_[a-z0-9_]+$/);
    tool('createdb',['-h',socket,'-p',port,'-U',admin,database],'create-'+label+'.log');
    const env={APP_ENV:'qa',APP_DATABASE_MODE:'required',POSTGRES_HOST:socket,POSTGRES_PORT:port,POSTGRES_DB:database,POSTGRES_ROLE_PREFIX:'t08_'+label+'_'+suffix,
      POSTGRES_USER:'t08_'+label+'_'+suffix+'_app',POSTGRES_SOURCE_SCHEMA:label==='restore'?metadata.schemas[0]:'t08_source',POSTGRES_RUNTIME_SCHEMA:label==='restore'?metadata.schemas[1]:'t08_runtime',
      POSTGRES_AUTH_SCHEMA:'t08_auth',POSTGRES_CONTROL_SCHEMA:'t08_control',POSTGRES_INSTANCE_ID:randomUUID(),POSTGRES_CLUSTER_ID:identity.clusterId,POSTGRES_BOOTSTRAP_USER:admin,PSQL_BIN:join(pg,'psql')};
    return {env,config:readDatabaseConfig(env)};
  };
  const empty=make('empty'), restored=make('restore');
  result.targets={empty:empty.config,restore:restored.config};
  writeJson(join(out,'verification-targets.json'),{cluster:identity,empty:empty.env,restore:restored.env,suite,socket,credentials:'none; isolated private Unix socket with a new test-only cluster'});
  tool('pg_restore',[...conn(restored.config.database),'--exit-on-error','--no-owner','--no-acl',backup],'restore.log');
  // The legacy backup hashes use Asia/Shanghai timestamp rendering. New before/after hashes use UTC.
  const backupMatched=fingerprints(restored.config,metadata.tableFingerprints,'Asia/Shanghai');
  assert.deepEqual(backupMatched,metadata.tableFingerprints);writeJson(join(out,'restored-backup-match.json'),{timeZone:'Asia/Shanghai',tables:backupMatched});
  const before=fingerprints(restored.config,metadata.tableFingerprints);
  result.legacyFingerprintTimezone='Asia/Shanghai';result.beforeAfterFingerprintTimezone='UTC';writeJson(join(out,'restored-before.json'),before);
  const originalSeq=sequences(restored.config);
  checked('冻结备份实际隔离恢复，89 表行数与内容摘要一致',{tables:before.length});
  for(const item of [empty,restored]) cli(item.env,'bootstrap',item===empty?'empty-bootstrap':'restore-bootstrap');
  checked('空库及恢复库建立独立环境身份与六个环境角色，业务账号种子为 0');
  const migrations=loadMigrations(empty.config);
  await rejected(empty.config,empty.config.roles.migrator,migrationSql(empty.config,[...migrations,{id:'0003_rollback_probe',checksum:'1'.repeat(64),sql:`SET LOCAL ROLE ${ident(empty.config.roles.runtime)}; CREATE TABLE ${ident(empty.config.schemas.runtime)}.rollback_probe(id integer); SELECT 1/0;`}]),'中途失败退出非零',/MAINTENANCE_SQL_FAILED/);
  assert.equal(query(empty.config,`SELECT count(*) FROM ${ident(empty.config.schemas.control)}.schema_version`),0);
  assert.equal(query(empty.config,`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN (${[empty.config.schemas.source,empty.config.schemas.runtime,empty.config.schemas.auth].map(literal).join(',')})`),0);
  checked('中途失败完整回滚表结构及迁移版本，无半成品');
  const concurrent=await Promise.all([asyncCli(empty.env,'migrate','empty-upgrade-a'),asyncCli(empty.env,'migrate','empty-upgrade-b')]);
  assert.deepEqual(concurrent.map(x=>x.applied.length).sort(),[0,2]);
  checked('新空库并发升级恰好执行一次，另一连接等待后跳过',{appliedCounts:concurrent.map(x=>x.applied.length)});
  result.emptyUpgrade=concurrent;
  const restoredUpgrade=cli(restored.env,'migrate','restore-upgrade');assert.equal(restoredUpgrade.applied.length,2);result.restoredUpgrade=restoredUpgrade;
  checked('隔离恢复库升级并使用非超级用户迁移及应用身份');
  const after=fingerprints(restored.config,metadata.tableFingerprints);assert.deepEqual(after,before);writeJson(join(out,'restored-after.json'),after);
  const existingSeq=sequences(restored.config).filter(s=>originalSeq.some(x=>x.schema===s.schema&&x.name===s.name));assert.deepEqual(existingSeq,originalSeq);
  checked('89 表全部原行及原序列状态保留，身份、版本、条码、期初与库存内容差异 0',{tableDifferences:0,sequenceDifferences:0});
  for(const item of [empty,restored]) {
    const c=item.config;const tables=allTables(c);const data=fingerprints(c,tables);const structure=catalog(c);const seq=sequences(c);
    assert.deepEqual(cli(item.env,'migrate',item===empty?'empty-repeat':'restore-repeat').applied,[]);
    assert.equal(cli(item.env,'bootstrap',item===empty?'empty-bootstrap-repeat':'restore-bootstrap-repeat').alreadyBootstrapped,true);
    assert.deepEqual(fingerprints(c,tables),data);assert.equal(catalog(c),structure);assert.deepEqual(sequences(c),seq);
    checked((item===empty?'空库':'恢复库')+'重复迁移及初始化：数据、控制记录、权限、触发器及序列均无变化');
    assert.equal(query(c,`SELECT count(*) FROM ${ident(c.schemas.auth)}.employee_login`),0);
  }
  assert.equal(query(empty.config,`SELECT count(*) FROM ${ident(empty.config.schemas.runtime)}.operator`),0);
  checked('新库无伪管理员；新 Auth 层无自动创建、复制或重整登录账号');
  const c=restored.config;const s=ident(c.schemas.source),r=ident(c.schemas.runtime),a=ident(c.schemas.auth),ctl=ident(c.schemas.control);
  for(const [name,statement] of [
    ['来源 UPDATE 拒绝',`UPDATE ${s}.tplus_employee SET name=name`],['来源 DELETE 拒绝',`DELETE FROM ${s}.tplus_employee`],
    ['来源 INSERT 拒绝',`INSERT INTO ${s}.app_user DEFAULT VALUES`],['来源 TRUNCATE 拒绝',`TRUNCATE ${s}.tplus_employee`],
    ['来源 DDL 拒绝',`CREATE TABLE ${s}.t08_forbidden(id int)`],['运行 DDL 拒绝',`CREATE TABLE ${r}.t08_forbidden(id int)`],
    ['public DDL 拒绝','CREATE TABLE public.t08_forbidden(id int)'],['角色切换拒绝',`SET ROLE ${ident(c.roles.source)}`],
    ['历史修订 UPDATE 拒绝',`UPDATE ${r}.revision SET body=body`],['历史版本 DELETE 拒绝',`DELETE FROM ${r}.version_history`],
    ['流水 TRUNCATE 拒绝',`TRUNCATE ${r}.movement`],['控制身份更改拒绝',`UPDATE ${ctl}.environment_identity SET identity=identity`],
    ['迁移版本更改拒绝',`UPDATE ${ctl}.schema_version SET checksum=checksum`],['旧登录凭据访问拒绝',`SELECT 1 FROM ${r}.employee_login LIMIT 0`],
    ['认证审计 DELETE 拒绝',`DELETE FROM ${a}.employee_account_audit`],
  ]) await rejected(c,c.roles.app,statement,name,/MAINTENANCE_SQL_FAILED/);
  await sql(c,c.roles.app,`SELECT count(*) FROM ${s}.variant;SELECT count(*) FROM ${r}.inventory_balance_base;`);
  await sql(c,c.roles.app,`BEGIN;INSERT INTO ${r}.edit_lease(document_key,token,expires_at) VALUES('T08-APP-WRITE-PROBE','synthetic-test-token',now());ROLLBACK;`);
  checked('应用身份可读取来源与库存视图，可在运行层办理事务并回滚');
  await rejected(c,c.roles.migrator,`SET ROLE ${ident(c.roles.runtime)};TRUNCATE ${r}.revision`,'所有者路径也受历史 TRUNCATE 触发器保护',/IMMUTABLE_RUNTIME_HISTORY/);
  await rejected(c,c.roles.migrator,`SET ROLE ${ident(c.roles.runtime)};UPDATE ${r}.revision SET body=body WHERE document_id=(SELECT document_id FROM ${r}.revision LIMIT 1)`,'所有者路径也受原修订修改触发器保护',/IMMUTABLE_RUNTIME_HISTORY/);
  const versions=loadMigrations(c);
  await rejected(c,c.roles.migrator,migrationSql(c,[{...versions[0],checksum:'f'.repeat(64)},versions[1]]),'迁移校验摘要改变被拒绝',/T08_MIGRATION_JOURNAL_MISMATCH/);
  for(const [name,changed] of [['环境身份错误拒绝',{instanceId:randomUUID()}],['集群身份错误拒绝',{clusterId:'1'}],['环境串用拒绝',{environment:'stage'}],['数据层配置串用拒绝',{schemas:{...c.schemas,auth:'other_auth'}}]]) {
    await rejected(changed?{...c,...changed}:c,c.roles.migrator,migrationSql({...c,...changed}),name,/T08_DATABASE_IDENTITY_MISMATCH/);
  }
  adminSql(c,`ALTER ROLE ${ident(c.roles.app)} SUPERUSER`);
  try {await rejected(c,c.roles.app,inspectSql(c),'应用超级用户身份明确拒绝',/T08_UNSAFE_LOGIN_ROLE/);}
  finally {adminSql(c,`ALTER ROLE ${ident(c.roles.app)} NOSUPERUSER`);}
  const ec=empty.config;const es=ident(ec.schemas.source);
  adminSql(ec,`SET ROLE ${ident(ec.roles.source)}; CREATE TABLE ${es}.t08_future_acl_probe(id text PRIMARY KEY); INSERT INTO ${es}.t08_future_acl_probe VALUES('fixture'); CREATE FUNCTION ${es}.t08_future_function_probe() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'; RESET ROLE;`);
  assert.equal(await sql(ec,ec.roles.app,`SELECT count(*) FROM ${es}.t08_future_acl_probe`),'1');
  await rejected(ec,ec.roles.app,`UPDATE ${es}.t08_future_acl_probe SET id=id`,'未来来源表默认权限仍只读',/MAINTENANCE_SQL_FAILED/);
  await rejected(ec,ec.roles.app,`SELECT ${es}.t08_future_function_probe()`,'未来 SECURITY DEFINER 函数默认不向应用开放',/MAINTENANCE_SQL_FAILED/);
  const httpBefore=catalog(c),httpData=fingerprints(c,allTables(c));
  const app=createApp(readConfig(restored.env));
  try {for(let i=0;i<3;i++){assert.equal((await app.inject('/api/health')).statusCode,200);assert.equal((await app.inject({method:'POST',url:'/api/initialize',payload:{actorId:'local-admin'}})).statusCode,404);}}
  finally {await app.close();}
  assert.equal(catalog(c),httpBefore);assert.deepEqual(fingerprints(c,allTables(c)),httpData);
  checked('HTTP 启动与重复请求无建表、初始化或账号种子副作用');
  assert.deepEqual(fingerprints(c,metadata.tableFingerprints),before);
  result.finalInspections={empty:JSON.parse(await sql(ec,ec.roles.app,inspectSql(ec))),restore:JSON.parse(await sql(c,c.roles.app,inspectSql(c)))};
  result.status='PASS'; result.historicalTables=before.length;result.historicalRowDifferences=0;result.sequenceDifferences=0;
  result.sourceRoleReadOnly=true;result.accountSeeds=0;result.productionConnections=0;result.serverOperations=0;
  result.probesRetained=['empty Source t08_future_acl_probe and t08_future_function_probe are synthetic fixtures in the isolated test cluster'];
  checked('全部拒绝及 HTTP 探针后历史 89 表仍完全一致');
} catch(error) {result.status='FAIL';result.error=error instanceof Error?error.message:'unknown error';console.error(result.error);process.exitCode=1;}
finally {
  if(started){const stopped=spawnSync(join(pg,'pg_ctl'),['-D',join(suite,'data'),'-m','fast','-w','stop'],{encoding:'utf8'});writeFileSync(join(suite,'stop.log'),stopped.stdout+stopped.stderr);result.clusterStopped=stopped.status===0;if(stopped.status!==0){result.status='FAIL';process.exitCode=1;}}
  writeJson(join(out,'database-verification.json'),result);writeJson(join(suite,'result.json'),result);
  // Keep the verified SQL resources beside evidence in case another task rebuilds shared dist.
  cpSync(resolve(root,'server/database/sql'),join(suite,'verified-sql'),{recursive:true});
  console.log(`T08 database verification: ${result.status}; ${checks.length} checks; isolated cluster stopped=${result.clusterStopped}`);
}
