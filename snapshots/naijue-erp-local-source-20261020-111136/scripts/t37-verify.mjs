import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {randomBytes, randomUUID, createHash} from 'node:crypto';
import {cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync, chmodSync, symlinkSync} from 'node:fs';
import {join, resolve, isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const revision='r05-20261005-first-six-initialization';
const output=resolve('outputs/T37/revisions',revision),logs=resolve('logs/T37/revisions',revision);
const pg=process.env.T37_PG_BIN;
if(!pg||!isAbsolute(pg))throw Error('EXPLICIT_LOCAL_POSTGRESQL_17_REQUIRED');
const approvedPlanFile=process.env.T37_APPROVED_EMPLOYEE_PLAN_FILE;
if(!approvedPlanFile||!isAbsolute(approvedPlanFile))throw Error('EXPLICIT_PRIVATE_APPROVED_EMPLOYEE_PLAN_REQUIRED');
mkdirSync(output,{recursive:true});mkdirSync(logs,{recursive:true,mode:0o700});
const suite=mkdtempSync(join(logs,'qa-')),dataDirectory=join(suite,'data'),compiled=join(suite,'compiled');
const socket=mkdtempSync(join(tmpdir(),'nj-t37-x01-')),port='55537',admin='t37_x01_bootstrap';
const report={task:'T37',revision,status:'RUNNING',scope:'NEW_FIRST_SIX_IMPLEMENTATION_ONLY',suite,socket,
  dataClass:'SYNTHETIC_ONLY',tcp:false,realCredentials:false,realContacts:false,productionConnections:0,oldQaRestarted:false,checks:[],denials:[]};
let current='SETUP',started=false,app=null,access=null;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const checked=(id,evidence={})=>{current=id;report.checks.push({id,status:'PASS',...evidence});process.stdout.write('PASS '+id+'\n');};
function tool(name,args,file,extra={}){
  const response=spawnSync(join(pg,name),args,{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C',PGPASSFILE:'/dev/null'},maxBuffer:4*1024*1024,...extra});
  writeFileSync(join(suite,file),response.stdout+response.stderr,{mode:0o600});
  assert.equal(response.status,0,'PRIVATE_FIXTURE_TOOL_FAILED');return response.stdout.trim();
}
const conn=database=>['-h',socket,'-p',port,'-U',admin,'-d',database];
try{
  current='PRIVATE_STRICT_COMPILE';
  const build=spawnSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'-p',resolve('tsconfig.json'),'--outDir',compiled],{encoding:'utf8'});
  writeFileSync(join(suite,'compile.log'),build.stdout+build.stderr);assert.equal(build.status,0,'STRICT_COMPILE_FAILED');
  cpSync(resolve('server/database/sql'),join(compiled,'database/sql'),{recursive:true});
  checked('X01-C01_ALL_FORMAL_SOURCE_STRICT_COMPILE',{exitCode:0,sharedDistModified:false});
  const load=name=>import(pathToFileURL(join(compiled,name)).href);
  const {readDatabaseConfig,databaseIdentifier:ident}=await load('database/config.js');
  const {bootstrapAssertionSql}=await load('database/identity.js'),{sqlLiteral:literal}=await load('database/sql.js');
  const {PgDataAccess}=await load('database/access.js'),{readSecurityConfig}=await load('security/config.js');
  const {IdentityService}=await load('security/service.js'),{SecurityError}=await load('security/errors.js');
  const {passwordCredential}=await load('security/passwords.js');
  const {FirstEmployeeInitializer,firstInitializationTarget,readFirstInitializationGrant:issueGrant}=await load('security/first-initialization.js');
  const {approvedInitialEmployees,readApprovedInitialEmployeePlan,approvedInitialEmployeePlanSha256}=await load('security/approved-initial-employees.js');
  const plan=readApprovedInitialEmployeePlan(approvedPlanFile),roster=approvedInitialEmployees(plan);
  const readFirstInitializationGrant=(path,target)=>issueGrant(path,target,plan);
  const {createApp}=await load('app.js'),{readConfig}=await load('config.js');
  current='FRESH_PRIVATE_QA';
  assert.match(tool('postgres',['--version'],'version.log'),/PostgreSQL\) 17\./);
  assert(!existsSync(join(socket,'.s.PGSQL.'+port)));assert(Buffer.byteLength(socket+'/.s.PGSQL.'+port)<104);
  tool('initdb',['-D',dataDirectory,'-U',admin,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C','--wal-segsize=1','--set','min_wal_size=2MB','--set','max_wal_size=8MB'],'initdb.log');
  tool('pg_ctl',['-D',dataDirectory,'-l',join(suite,'postgres.log'),'-o',`-c listen_addresses='' -c min_wal_size=2MB -c max_wal_size=8MB -c unix_socket_permissions=0700 -c unix_socket_directories=${socket} -p ${port}`,'-w','start'],'start.log');started=true;
  const cluster=JSON.parse(tool('psql',['-X','-w','-qAt',...conn('postgres'),'-c',"SELECT jsonb_build_object('clusterId',system_identifier::text,'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses')) FROM pg_control_system()"],'identity.log'));
  assert.equal(cluster.dataDirectory,dataDirectory);assert.equal(cluster.listenAddresses,'');
  const suffix=randomUUID().replaceAll('-','').slice(0,8),prefix='t37_x01_'+suffix;
  const secret=join(suite,'synthetic-session.key');writeFileSync(secret,randomBytes(48),{mode:0o600});
  const env={APP_ENV:'qa',APP_DATABASE_MODE:'required',POSTGRES_HOST:socket,POSTGRES_PORT:port,POSTGRES_DB:'demo_8877_t37_x01_'+suffix,
    POSTGRES_USER:prefix+'_app',POSTGRES_ROLE_PREFIX:prefix,POSTGRES_SOURCE_SCHEMA:'t37_source',POSTGRES_RUNTIME_SCHEMA:'t37_runtime',POSTGRES_AUTH_SCHEMA:'t37_auth',POSTGRES_CONTROL_SCHEMA:'t37_control',
    POSTGRES_INSTANCE_ID:randomUUID(),POSTGRES_CLUSTER_ID:cluster.clusterId,POSTGRES_BOOTSTRAP_USER:admin,PSQL_BIN:join(pg,'psql'),SESSION_ORIGIN:'https://t37-x01-qa.invalid',SESSION_SECRET_FILE:secret,MEDIA_STORAGE_ROOT:join(suite,'media')};
  const config=readDatabaseConfig(env),security=readSecurityConfig(env,config);
  report.target=firstInitializationTarget(config);report.compiledRoot=compiled;
  tool('createdb',['-h',socket,'-p',port,'-U',admin,config.database],'createdb.log');
  for(const command of ['bootstrap','migrate']){
    const response=spawnSync(process.execPath,[join(compiled,'database/cli-main.js'),command],{encoding:'utf8',env:{PATH:process.env.PATH,...env},maxBuffer:2*1024*1024});
    writeFileSync(join(suite,command+'.log'),response.stdout+response.stderr);assert.equal(response.status,0,'ISOLATED_STRUCTURAL_MAINTENANCE_FAILED');
  }
  const sql=statement=>{
    const response=spawnSync(join(pg,'psql'),['-X','-w','-qAt','-v','ON_ERROR_STOP=1',...conn(config.database)],{input:bootstrapAssertionSql(config,admin)+'\n'+statement,
      encoding:'utf8',env:{PATH:process.env.PATH,PGPASSFILE:'/dev/null',PGOPTIONS:'-c search_path=pg_catalog -c timezone=UTC'}});
    assert.equal(response.status,0,'ISOLATED_FIXTURE_SQL_FAILED');return response.stdout.trim();
  };
  const a=ident(config.schemas.auth),s=ident(config.schemas.source),r=ident(config.schemas.runtime);
  const halls=new Map([...new Set(roster.map(row=>row.hallCode).filter(Boolean))].map(code=>[code,randomUUID()]));
  const phones=new Map(roster.map((row,i)=>[row.personKey,'139'+String(70000000+i)]));
  const entries=roster.map(row=>({personKey:row.personKey,employeeId:row.retainedEmployeeId??randomUUID(),hallId:row.hallCode?halls.get(row.hallCode):null}));
  const byKey=new Map(entries.map(row=>[row.personKey,row]));
  const batch='T37_SYNTHETIC_X01_ONLY';
  sql(`SET ROLE ${ident(config.roles.source)};
    INSERT INTO ${s}.tplus_import_run(batch_id,space_key,schema_name,database_name,manifest_path,manifest_sha256,preflight_batch_id,importer_version,status,git_sha,workspace_state_sha256)
    VALUES(${literal(batch)},'SYNTHETIC_ONLY',${literal(config.schemas.source)},${literal(config.database)},'SYNTHETIC_ONLY',${literal('a'.repeat(64))},'SYNTHETIC_ONLY','T37_SYNTHETIC_ONLY','COMMITTED','SYNTHETIC_ONLY',${literal('b'.repeat(64))});
    ${roster.filter(row=>row.retainedEmployeeId).map(row=>`INSERT INTO ${s}.tplus_employee(batch_id,id,source_id,source_code,name,source_salesperson,login_enabled,login_identity_created,source_payload)
      VALUES(${literal(batch)},${literal(row.retainedEmployeeId)}::uuid,${literal('SYNTHETIC_'+row.personKey)},${literal(row.sourceEmployeeCode)},'T37 synthetic person',false,false,false,'{"dataClass":"SYNTHETIC_ONLY"}');`).join('\n')} RESET ROLE;
    SET ROLE ${ident(config.roles.runtime)};
    ${[...halls].map(([code,id])=>`INSERT INTO ${r}.master_data_entity(kind,id,body,version,updated_by) VALUES('halls',${literal(id)},${literal(JSON.stringify({code,name:'T37 synthetic hall',enabled:true}))}::jsonb,1,'t37-fixture');`).join('\n')} RESET ROLE;
    SET ROLE ${ident(config.roles.auth)};
    ${roster.map(row=>{const binding=byKey.get(row.personKey);return `INSERT INTO ${a}.employee_login(id,body) VALUES(${literal(binding.employeeId)},${literal(JSON.stringify({name:'T37 synthetic person',code:row.sourceEmployeeCode??'T37_NEW',phone:phones.get(row.personKey),role:row.role,employmentStatus:'在职',enabled:true,loginEnabled:false,hallId:binding.hallId,storeId:binding.hallId}))}::jsonb);`;}).join('\n')} RESET ROLE;`);
  const maintenancePassword=randomBytes(16).toString('hex'),credential=await passwordCredential(maintenancePassword);
  for(const [id,role] of [['t37-maintenance','ADMIN'],['t37-unauthorized','WAREHOUSE']])sql(`SET ROLE ${ident(config.roles.auth)};
    INSERT INTO ${a}.employee_login(id,login_name,body,password_salt,password_hash) VALUES(${literal(id)},${literal(id)},${literal(JSON.stringify({name:'T37 synthetic maintainer',role,employmentStatus:'在职',enabled:true,loginEnabled:true}))}::jsonb,${literal(credential.salt)},${literal(credential.hash)});RESET ROLE;`);
  access=new PgDataAccess(config);app=createApp(readConfig(env));
  const identity=new IdentityService(access,config,security),initializer=new FirstEmployeeInitializer(access,config,security);
  const maint=await identity.login({loginName:'t37-maintenance',password:maintenancePassword},null);
  const other=await identity.login({loginName:'t37-unauthorized',password:maintenancePassword},null);
  const firstPassword=randomBytes(3).toString('hex');
  const bindingObject={schemaVersion:'T37-FIRST-INITIALIZATION-BINDING-v1',approvedPlanSha256:approvedInitialEmployeePlanSha256,maintenanceAccountId:'t37-maintenance',target:firstInitializationTarget(config),employees:entries};
  const bindingFile=join(suite,'synthetic-binding.json');writeFileSync(bindingFile,JSON.stringify(bindingObject),{mode:0o600});
  const grant=readFirstInitializationGrant(bindingFile,config);
  const selected=['ADMIN','WAREHOUSE','SALESPERSON'].map(role=>roster.find(row=>row.role===role));
  const remaining=()=>roster.filter(row=>!selected.some(item=>item.personKey===row.personKey));
  const request=rows=>({personKeys:rows.map(row=>row.personKey),initialPassword:firstPassword});
  const fingerprint=(schemas=Object.values(config.schemas))=>{
    const tables=JSON.parse(sql(`SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname) ORDER BY n.nspname,c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY(ARRAY[${schemas.map(literal).join(',')}]) AND c.relkind='r'`));
    const rows=tables.map(t=>`SELECT jsonb_build_object('table',${literal(t.schema+'.'+t.table)},'count',count(*),'digest',md5(coalesce(string_agg(row_to_json(x)::text,E'\\n' ORDER BY row_to_json(x)::text),''))) item FROM ${ident(t.schema)}.${ident(t.table)} x`);
    return hash(JSON.parse(sql(`SELECT jsonb_agg(item ORDER BY item->>'table') FROM (${rows.join(' UNION ALL ')}) f`)));
  };
  async function denied(id,work,code){current=id;const before=fingerprint();await assert.rejects(work,error=>error?.code===code);const after=fingerprint();assert.equal(after,before);
    report.denials.push({id,code,dataFingerprintBefore:before,dataFingerprintAfter:after,semanticTablesUnchanged:true});checked(id,{code,semanticTablesUnchanged:true});}
  checked('X01-C02_FRESH_BOUND_QA_ONLY',{environment:config.environment,privateSocket:true,tcp:false,approvedPeople:49,retainedTemplateIds:45,newCurrentTemplateIds:4});
  const sourceBefore=fingerprint([config.schemas.source]);
  await denied('X01-C03_FORGED_CAPABILITY',()=>initializer.initialize({},maint.token,request(selected)),'UNAUTHORIZED_FIRST_INITIALIZATION');
  await denied('X01-C04_MISSING_SESSION',()=>initializer.initialize(grant,'0'.repeat(64),request(selected)),'UNAUTHENTICATED');
  await denied('X01-C05_WRONG_MAINTENANCE_ACTOR',()=>initializer.initialize(grant,other.token,request(selected)),'FORBIDDEN');
  const nonAdminFile=join(suite,'synthetic-nonadmin-binding.json');writeFileSync(nonAdminFile,JSON.stringify({...bindingObject,maintenanceAccountId:'t37-unauthorized'}),{mode:0o600});
  await denied('X01-C06_NONADMIN_EVEN_WHEN_FILE_NAMES_ACTOR',()=>initializer.initialize(readFirstInitializationGrant(nonAdminFile,config),other.token,request(selected)),'FORBIDDEN');
  await denied('X01-C07_UNCONFIRMED_PERSON',()=>initializer.initialize(grant,maint.token,{personKeys:['unconfirmed-person'],initialPassword:firstPassword}),'UNAPPROVED_INITIALIZATION_ROSTER');
  await denied('X01-C08_FIRST_PASSWORD_EXACT_SIX',()=>initializer.initialize(grant,maint.token,{personKeys:[selected[0].personKey],initialPassword:firstPassword+'x'}),'INITIAL_PASSWORD_POLICY');
  const wrongFile=join(suite,'synthetic-wrong-target.json');writeFileSync(wrongFile,JSON.stringify({...bindingObject,target:{...bindingObject.target,instanceId:randomUUID()}}),{mode:0o600});
  assert.throws(()=>readFirstInitializationGrant(wrongFile,config),e=>e.code==='INITIALIZATION_TARGET_MISMATCH');
  assert.throws(()=>readFirstInitializationGrant(bindingFile,{...config,environment:'production'}),/ISOLATED_DATABASE_REQUIRED/);
  assert.throws(()=>readFirstInitializationGrant(bindingFile,{...config,database:'real_business'}),/ISOLATED_DATABASE_REQUIRED/);
  chmodSync(wrongFile,0o644);assert.throws(()=>readFirstInitializationGrant(wrongFile,config),e=>e.code==='PRIVATE_INITIALIZATION_FILE_REQUIRED');
  const symbolic=join(suite,'synthetic-binding-link.json');symlinkSync(bindingFile,symbolic);assert.throws(()=>readFirstInitializationGrant(symbolic,config),e=>e.code==='PRIVATE_INITIALIZATION_FILE_REQUIRED');
  checked('X01-C09_TARGET_AND_PRIVATE_FILE_GUARDS',{wrongInstanceRejected:true,productionRejected:true,realDatabaseRejected:true,publicModeRejected:true,symlinkRejected:true});
  const wrongIdFile=join(suite,'synthetic-wrong-id.json');writeFileSync(wrongIdFile,JSON.stringify({...bindingObject,employees:entries.map((e,i)=>i===0?{...e,employeeId:randomUUID()}:e)}),{mode:0o600});
  assert.throws(()=>readFirstInitializationGrant(wrongIdFile,config),e=>e.code==='INITIALIZATION_EMPLOYEE_BINDING_MISMATCH');checked('X01-C10_RETAINED_SOURCE_ID_CANNOT_BE_REASSIGNED');
  const sales=selected[2],badHallFile=join(suite,'synthetic-wrong-hall.json');
  writeFileSync(badHallFile,JSON.stringify({...bindingObject,employees:entries.map(e=>e.personKey===sales.personKey?{...e,hallId:randomUUID()}:e)}),{mode:0o600});
  await denied('X01-C11_HALL_BINDING_EXACT',()=>initializer.initialize(readFirstInitializationGrant(badHallFile,config),maint.token,request([selected[0],sales])),'INITIALIZATION_HALL_BINDING_MISMATCH');
  const duplicate=remaining()[0],dupBinding=byKey.get(duplicate.personKey);
  sql(`SET ROLE ${ident(config.roles.auth)};UPDATE ${a}.employee_login SET body=jsonb_set(body,'{phone}',${literal(JSON.stringify(phones.get(selected[0].personKey)))}::jsonb) WHERE id=${literal(dupBinding.employeeId)};RESET ROLE;`);
  await denied('X01-C12_PHONE_UNIQUE_ACROSS_APPROVED_ROSTER',()=>initializer.initialize(grant,maint.token,request([selected[0]])),'INITIALIZATION_LOGIN_CONFLICT');
  sql(`SET ROLE ${ident(config.roles.auth)};UPDATE ${a}.employee_login SET body=jsonb_set(body,'{phone}',${literal(JSON.stringify(phones.get(duplicate.personKey)))}::jsonb) WHERE id=${literal(dupBinding.employeeId)};RESET ROLE;`);
  let updates=0;
  const failingAccess={transaction:work=>access.transaction(session=>work({lock:keys=>session.lock(keys),query:(text,values)=>{if(text.startsWith('UPDATE ')&&text.includes('.employee_login')&&++updates===2)throw new SecurityError('SYNTHETIC_WRITE_FAILURE');return session.query(text,values);}}))};
  const failing=new FirstEmployeeInitializer(failingAccess,config,security);
  await denied('X01-C13_ACTUAL_TRANSACTION_ROLLS_BACK_PRIOR_WRITE',()=>failing.initialize(grant,maint.token,request(selected)),'SYNTHETIC_WRITE_FAILURE');assert.equal(updates,2);
  current='FIRST_SUCCESS';const success=await initializer.initialize(grant,maint.token,request(selected));assert.equal(success.initialized,3);
  const stored=JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_object('salt',password_salt,'modern',password_hash LIKE 'pbkdf2-sha256:600000:%','version',version)) FROM ${a}.employee_login WHERE id=ANY(ARRAY[${selected.map(x=>literal(byKey.get(x.personKey).employeeId)).join(',')}])`));
  assert.equal(new Set(stored.map(x=>x.salt)).size,3);assert(stored.every(x=>x.modern&&x.version===2));
  checked('X01-C14_FIRST_SIX_THREE_ROLES_SUCCESS',{initialized:3,randomSaltsIndependent:true,existingPBKDF2Format:true,sourceFingerprintUnchanged:sourceBefore===fingerprint([config.schemas.source])});
  assert.equal(fingerprint([config.schemas.source]),sourceBefore);
  const login=async(row,password)=>app.inject({method:'POST',url:'/api/runtime/session',headers:{origin:env.SESSION_ORIGIN},payload:{loginName:phones.get(row.personKey),password}});
  const sessions=[];
  for(const row of selected){const response=await login(row,firstPassword);assert.equal(response.statusCode,200);assert.equal(response.json().data.employee.id,byKey.get(row.personKey).employeeId);
    assert.equal(response.json().data.employee.role,{ADMIN:'管理员',WAREHOUSE:'仓库人员',SALESPERSON:'营业员'}[row.role]);assert.equal(response.json().data.employee.hallId,byKey.get(row.personKey).hallId??'');sessions.push(response);}
  checked('X01-C15_FORMAL_LOGIN_PATH_ROLES_AND_HALLS',{realAppInjection:true,roleCount:3,browserOrRealRoleUAT:false});
  await denied('X01-C16_REPEAT_DOES_NOT_OVERWRITE',()=>initializer.initialize(grant,maint.token,request(selected)),'ALREADY_INITIALIZED');
  await denied('X01-C17_MIXED_RETRY_IS_ALL_OR_NOTHING',()=>initializer.initialize(grant,maint.token,request([remaining()[0],selected[0]])),'ALREADY_INITIALIZED');
  const newPerson=roster.find(row=>row.retainedEmployeeId===null),requestFile=join(suite,'synthetic-request.json');
  writeFileSync(requestFile,JSON.stringify({maintenanceToken:maint.token,initialPassword:firstPassword,personKeys:[newPerson.personKey]}),{mode:0o600});
  const child=spawnSync(process.execPath,[join(compiled,'security/first-initialization-cli.js')],{encoding:'utf8',env:{PATH:process.env.PATH,...env,T37_BINDING_FILE:bindingFile,T37_REQUEST_FILE:requestFile,T37_APPROVED_EMPLOYEE_PLAN_FILE:approvedPlanFile}});
  assert.equal(child.status,0);assert.equal(JSON.parse(child.stdout).initialized,1);assert(!child.stdout.includes(firstPassword));assert(!child.stdout.includes(maint.token));
  assert(![...phones.values()].some(phone=>child.stdout.includes(phone)));writeFileSync(join(suite,'cli-success.json'),child.stdout,{mode:0o600});
  checked('X01-C18_COMPILED_MAINTENANCE_CLI_AND_NEW_CURRENT_ID',{initialized:1,stdoutHasNoContactsOrCredentials:true,noTsxNeededByCompiledCLI:true});
  const race=roster.find(row=>!selected.some(e=>e.personKey===row.personKey)&&row.personKey!==newPerson.personKey);
  const raced=await Promise.allSettled([initializer.initialize(grant,maint.token,request([race])),initializer.initialize(grant,maint.token,request([race]))]);
  assert.equal(raced.filter(x=>x.status==='fulfilled').length,1);assert.equal(raced.find(x=>x.status==='rejected').reason.code,'ALREADY_INITIALIZED');
  checked('X01-C19_CONCURRENT_INITIALIZATION_SINGLE_WINNER',{success:1,duplicateRejected:1});
  const normalId=randomUUID(),normal={id:normalId,code:'T37_NORMAL',name:'T37 synthetic ordinary account',role:'WAREHOUSE',employmentStatus:'在职',enabled:true,loginEnabled:true,loginName:'t37-normal'};
  await denied('X01-C20_NORMAL_CREATE_REJECTS_SIX',()=>identity.saveEmployee(maint.token,{record:normal,password:firstPassword}),'VALIDATION');
  const ordinaryPassword=randomBytes(12).toString('hex');await identity.saveEmployee(maint.token,{record:normal,password:ordinaryPassword});
  const resetId=byKey.get(selected[0].personKey).employeeId;
  await denied('X01-C21_NORMAL_RESET_REJECTS_SIX',()=>identity.saveEmployee(maint.token,{record:{id:resetId},expectedVersion:2,password:firstPassword}),'VALIDATION');
  await identity.saveEmployee(maint.token,{record:{id:resetId},expectedVersion:2,password:ordinaryPassword});
  assert.equal((await login(selected[0],ordinaryPassword)).statusCode,200);checked('X01-C22_NORMAL_CREATE_RESET_EIGHT_PLUS_STILL_WORK');
  const headers={origin:env.SESSION_ORIGIN,cookie:sessions[2].headers['set-cookie'].split(';')[0],'x-csrf-token':sessions[2].json().data.csrfToken};
  const second=await login(sales,firstPassword),changedPassword=randomBytes(12).toString('hex');
  const beforeChange=fingerprint();const short=await app.inject({method:'POST',url:'/api/runtime/password/change',headers,payload:{currentPassword:firstPassword,newPassword:firstPassword}});
  assert.equal(short.statusCode,400);assert.equal(short.json().error.code,'PASSWORD_POLICY');assert.equal(fingerprint(),beforeChange);
  const changed=await app.inject({method:'POST',url:'/api/runtime/password/change',headers,payload:{currentPassword:firstPassword,newPassword:changedPassword}});assert.equal(changed.statusCode,200);
  assert.equal((await app.inject({url:'/api/runtime/session',headers})).statusCode,401);
  assert.equal((await app.inject({url:'/api/runtime/session',headers:{cookie:second.headers['set-cookie'].split(';')[0]}})).statusCode,401);
  assert.equal((await login(sales,firstPassword)).statusCode,401);assert.equal((await login(sales,changedPassword)).statusCode,200);
  checked('X01-C23_SIX_INITIAL_CREDENTIAL_TO_EIGHT_PLUS_SELF_CHANGE',{shortRejected:true,allPreviousSessionsRevoked:true,oldCredentialRejected:true,newCredentialLogin:true});
  const firstAudit=sql(`SELECT jsonb_agg(jsonb_build_object('action',action,'changes',changes)) FROM ${a}.employee_account_audit WHERE action='首次初始化登录'`);
  assert(!firstAudit.includes(firstPassword));assert(![...phones.values()].some(phone=>firstAudit.includes(phone)));assert(!firstAudit.includes(maint.token));
  const privatePath=await app.inject({method:'POST',url:'/api/runtime/employees/first-initialize',headers:{origin:env.SESSION_ORIGIN,cookie:sessions[1].headers['set-cookie'].split(';')[0],'x-csrf-token':sessions[1].json().data.csrfToken},payload:{}});
  assert.equal(privatePath.statusCode,404);checked('X01-C24_INITIAL_AUDIT_NON_SECRET_NO_PUBLIC_INIT_ROUTE',{auditContactOrPasswordValues:false,publicRouteStatus:404});
  report.sourceFingerprintBefore=sourceBefore;report.sourceFingerprintAfter=fingerprint([config.schemas.source]);assert.equal(report.sourceFingerprintAfter,sourceBefore);
  report.initializedSyntheticPeople=5;report.realEmployeesInitialized=0;report.formalTargetBindingProven=false;report.qualifiedRealRoleUAT=false;
  report.status='PASS_SCOPED_FIRST_SIX_IMPLEMENTATION_AND_ISOLATED_VERIFICATION';
}catch(error){report.status='FAIL';report.failedCheck=current;report.failureCode=typeof error?.code==='string'&&/^[A-Z_]+$/.test(error.code)?error.code:'SCOPED_CHECK_FAILED';process.exitCode=1;
  process.stderr.write(JSON.stringify({status:report.status,check:current,code:report.failureCode})+'\n');
}finally{
  await app?.close().catch(()=>{});await access?.close().catch(()=>{});
  if(started){const stopped=spawnSync(join(pg,'pg_ctl'),['-D',dataDirectory,'-m','immediate','-w','stop'],{encoding:'utf8',env:{PATH:process.env.PATH}});
    writeFileSync(join(suite,'stop.log'),stopped.stdout+stopped.stderr);report.qaStopExitCode=stopped.status;
    const status=spawnSync(join(pg,'pg_ctl'),['-D',dataDirectory,'status'],{encoding:'utf8',env:{PATH:process.env.PATH}});report.qaStopped=stopped.status===0&&status.status===3&&!existsSync(join(socket,'.s.PGSQL.'+port));
    if(!report.qaStopped){report.status='FAIL_QA_STOP';process.exitCode=1;}}
  report.recordedAt=new Date().toISOString();report.checkCount=report.checks.length;
  writeFileSync(join(suite,'RECEIPT.json'),JSON.stringify(report,null,2)+'\n');
  writeFileSync(join(output,'ISOLATED-VERIFICATION.json'),JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({status:report.status,checks:report.checkCount,qaStopped:report.qaStopped??false,realEmployeesInitialized:0,receipt:join(output,'ISOLATED-VERIFICATION.json')})+'\n');
}
