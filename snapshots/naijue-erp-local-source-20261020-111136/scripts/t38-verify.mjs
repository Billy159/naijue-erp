import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {join, resolve, isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const pg=process.env.T38_PG_BIN;
if(!pg||!isAbsolute(pg))throw Error('T38_PG_BIN must explicitly select local PostgreSQL 17');
const log=resolve('logs/T38');mkdirSync(log,{recursive:true,mode:0o700});mkdirSync(resolve('outputs/T38'),{recursive:true});
const suite=mkdtempSync(join(log,'postgres-suite-')),dataDirectory=join(suite,'data'),runtime=join(suite,'runtime');
const socket=log,port='55491',admin='t38_bootstrap';
const report={status:'RUNNING',suite,isolated:true,tcp:false,realCredentials:false,productionConnections:0,checks:[]};
const checked=name=>{report.checks.push(name);process.stdout.write('PASS: '+name+'\n')};
function tool(name,args,file,options={}){
  const response=spawnSync(join(pg,name),args,{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C',PGPASSFILE:'/dev/null'},maxBuffer:4*1024*1024,...options});
  writeFileSync(join(suite,file),response.stdout+response.stderr);
  assert.equal(response.status,0,name+' failed: '+join(suite,file));return response.stdout.trim();
}
const connection=database=>['-h',socket,'-p',port,'-U',admin,'-d',database];
let started=false,app=null;
try{
  assert.match(tool('postgres',['--version'],'version.log'),/PostgreSQL\) 17\./);
  assert(!existsSync(join(socket,'.s.PGSQL.'+port)),'T38 private socket already exists');
  assert(Buffer.byteLength(socket+'/.s.PGSQL.'+port)<104,'Private socket path too long');
  const build=spawnSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'-p',resolve('tsconfig.json'),'--outDir',runtime],{encoding:'utf8'});
  writeFileSync(join(suite,'build.log'),build.stdout+build.stderr);assert.equal(build.status,0,'T38 private backend build failed');
  cpSync(resolve('server/database/sql'),join(runtime,'database/sql'),{recursive:true});
  const load=name=>import(pathToFileURL(join(runtime,name)).href);
  const {readDatabaseConfig,databaseIdentifier:ident}=await load('database/config.js');
  const {bootstrapAssertionSql}=await load('database/identity.js');
  const {sqlLiteral:literal}=await load('database/sql.js');
  const {passwordCredential}=await load('security/passwords.js');
  const {createApp}=await load('app.js'),{readConfig}=await load('config.js');
  tool('initdb',['-D',dataDirectory,'-U',admin,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C','--wal-segsize=1','--set','min_wal_size=2MB','--set','max_wal_size=8MB'],'initdb.log');
  tool('pg_ctl',['-D',dataDirectory,'-l',join(suite,'postgres.log'),'-o',`-c listen_addresses='' -c min_wal_size=2MB -c max_wal_size=8MB -c unix_socket_permissions=0700 -c unix_socket_directories=${socket} -p ${port}`,'-w','start'],'start.log');started=true;
  const cluster=JSON.parse(tool('psql',['-X','-w','-qAt',...connection('postgres'),'-c',"SELECT jsonb_build_object('clusterId',system_identifier::text,'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses')) FROM pg_control_system()"],'identity.log'));
  assert.equal(cluster.dataDirectory,dataDirectory);assert.equal(cluster.listenAddresses,'');
  checked('Fresh PostgreSQL 17 with private Unix socket and no TCP listener');
  const suffix=randomUUID().replaceAll('-','').slice(0,8),prefix='t38_qa_'+suffix;
  const secret=join(suite,'synthetic-session.key');writeFileSync(secret,randomBytes(48),{mode:0o600});
  const env={APP_ENV:'qa',APP_DATABASE_MODE:'required',POSTGRES_HOST:socket,POSTGRES_PORT:port,POSTGRES_DB:'demo_8877_t38_qa_'+suffix,
    POSTGRES_USER:prefix+'_app',POSTGRES_ROLE_PREFIX:prefix,POSTGRES_SOURCE_SCHEMA:'t38_source',POSTGRES_RUNTIME_SCHEMA:'t38_runtime',POSTGRES_AUTH_SCHEMA:'t38_auth',POSTGRES_CONTROL_SCHEMA:'t38_control',
    POSTGRES_INSTANCE_ID:randomUUID(),POSTGRES_CLUSTER_ID:cluster.clusterId,POSTGRES_BOOTSTRAP_USER:admin,PSQL_BIN:join(pg,'psql'),SESSION_ORIGIN:'https://t38-qa.invalid',SESSION_SECRET_FILE:secret,
    MEDIA_STORAGE_ROOT:join(suite,'media')};
  const config=readDatabaseConfig(env);
  tool('createdb',['-h',socket,'-p',port,'-U',admin,env.POSTGRES_DB],'createdb.log');
  for(const command of ['bootstrap','migrate']){
    const response=spawnSync(process.execPath,[join(runtime,'database/cli-main.js'),command],{encoding:'utf8',env:{PATH:process.env.PATH,...env},maxBuffer:2*1024*1024});
    writeFileSync(join(suite,command+'.log'),response.stdout+response.stderr);
    assert.equal(response.status,0,command+' failed: '+join(suite,command+'.log'));
  }
  function sql(statement){
    const response=spawnSync(join(pg,'psql'),['-X','-w','-qAt','-v','ON_ERROR_STOP=1',...connection(config.database)],{
      input:bootstrapAssertionSql(config,admin)+'\n'+statement,encoding:'utf8',env:{PATH:process.env.PATH,PGPASSFILE:'/dev/null',PGOPTIONS:'-c search_path=pg_catalog -c timezone=UTC'}});
    assert.equal(response.status,0,'Isolated fixture SQL failed');return response.stdout.trim();
  }
  const oldPassword='t38-synthetic-old-password',newPassword='t38-synthetic-new-password',id='t38-admin';
  const credential=await passwordCredential(oldPassword),a=ident(config.schemas.auth);
  sql(`SET ROLE ${ident(config.roles.auth)}; INSERT INTO ${a}.employee_login(id,login_name,body,password_salt,password_hash)
    VALUES(${literal(id)},${literal(id)},${literal(JSON.stringify({name:'T38 synthetic administrator',role:'管理员',employmentStatus:'在职',loginEnabled:true,enabled:true}))}::jsonb,${literal(credential.salt)},${literal(credential.hash)}); RESET ROLE;`);
  app=createApp(readConfig(env));
  const login=async password=>app.inject({method:'POST',url:'/api/runtime/session',headers:{origin:env.SESSION_ORIGIN},payload:{loginName:id,password}});
  const first=await login(oldPassword),second=await login(oldPassword);assert.equal(first.statusCode,200,first.body);assert.equal(second.statusCode,200,second.body);
  const headers={origin:env.SESSION_ORIGIN,cookie:first.headers['set-cookie'].split(';')[0],'x-csrf-token':first.json().data.csrfToken};
  const change=async payload=>app.inject({method:'POST',url:'/api/runtime/password/change',headers,payload});
  assert.equal((await change({currentPassword:'incorrect',newPassword})).json().error.code,'INVALID_CURRENT_PASSWORD');
  assert.equal((await change({employeeId:'other',currentPassword:oldPassword,newPassword})).statusCode,400);
  assert.equal(Number(sql(`SELECT count(*) FROM ${a}.employee_account_audit`)),0);
  const changed=await change({currentPassword:oldPassword,newPassword});assert.equal(changed.statusCode,200,changed.body);
  assert.equal(Number(sql(`SELECT count(*) FROM ${a}.employee_session WHERE employee_id=${literal(id)}`)),0);
  assert.equal(Number(sql(`SELECT version FROM ${a}.employee_login WHERE id=${literal(id)}`)),2);
  assert.equal((await app.inject({url:'/api/runtime/session',headers})).statusCode,401);
  assert.equal((await app.inject({url:'/api/runtime/session',headers:{cookie:second.headers['set-cookie'].split(';')[0]}})).statusCode,401);
  assert.equal((await login(oldPassword)).statusCode,401);assert.equal((await login(newPassword)).statusCode,200);
  const audit=sql(`SELECT jsonb_build_object('actor',actor_id,'employee',employee_id,'action',action,'changes',changes) FROM ${a}.employee_account_audit`);
  assert(!audit.includes(oldPassword));assert(!audit.includes(newPassword));assert.equal(JSON.parse(audit).action,'本人修改密码');
  checked('Actual PostgreSQL credential update, audit, old-session revocation and new-password login');
  report.status='PASS';
}catch(error){report.status='FAIL';report.error=error instanceof Error?error.message:'UNKNOWN';throw error;
}finally{
  await app?.close().catch(()=>{});
  if(started)tool('pg_ctl',['-D',dataDirectory,'-m','immediate','-w','stop'],'stop.log');
  writeFileSync(resolve('outputs/T38/real-postgres-verification.json'),JSON.stringify(report,null,2)+'\n');
}
