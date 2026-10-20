import test from 'node:test';
import assert from 'node:assert/strict';
import {listMasterRecords} from '../server/security/master-data.ts';
import {SecurityRepository} from '../server/security/repository.ts';
import {SyntheticFundAccountReader, readSyntheticFundAccountConfig} from '../server/security/synthetic-fund-accounts.ts';
import {readConfig} from '../server/config.ts';
import {createApp} from '../server/app.ts';
import {IdentityService} from '../server/security/service.ts';
import {enforceRouteRegistration, installIdentity} from '../server/security/http.ts';
import {passwordCredential} from '../server/security/passwords.ts';
import Fastify from 'fastify';
import {createHash, randomBytes} from 'node:crypto';
import {mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

// This test worker must never inherit a reference to a real private input.
delete process.env.APPROVED_FUND_ACCOUNTS_FILE;
delete process.env.APPROVED_PARTY_ROLES_FILE;

const database={environment:'qa',database:'demo_8877_reader_free_unit',instanceId:'11111111-1111-4111-8111-111111111111',clusterId:'12345',
  schemas:{source:'synthetic_source',runtime:'synthetic_runtime',auth:'synthetic_auth',control:'synthetic_control'},
  roles:{app:'synthetic_app'},host:'/no-postgres-used',port:55490,user:'synthetic_app',sslmode:'disable'};
const warehouse={id:'22222222-2222-4222-8222-222222222222',code:'SYNTHETIC-WH',name:'Synthetic warehouse',enabled:true,type:'WAREHOUSE'};
const hallId='33333333-3333-4333-8333-333333333333',fundId='44444444-4444-4444-8444-444444444444',methodId='55555555-5555-4555-8555-555555555555';
const patch={name:'Synthetic test account',type:'checking',bank:'Synthetic bank',accountNumber:'SYNTHETIC-NONPAYABLE',department:'SYNTHETIC',enabled:true};
const profile={schemaVersion:'QA_SYNTHETIC_FUND_ACCOUNTS_V1',database:database.database,instanceId:database.instanceId,accounts:[{id:fundId,code:'SYNTHETIC-FA1',patch}],parties:[
  {id:'77777777-7777-4777-8777-777777777777',code:'SYNTHETIC-C1',name:'Synthetic customer',role:'customer'},
  {id:'88888888-8888-4888-8888-888888888888',code:'SYNTHETIC-S1',name:'Synthetic supplier',role:'supplier'},
]};

function syntheticFixture(t,input=profile){
  const dir=mkdtempSync(join(tmpdir(),'naijue-reader-free-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'synthetic-fund-accounts.json'),raw=JSON.stringify(input);
  writeFileSync(file,raw,{mode:0o600});
  const sha256=createHash('sha256').update(raw).digest('hex');
  const env={APP_ENV:'qa',QA_SYNTHETIC_FUND_ACCOUNTS_FILE:file,QA_SYNTHETIC_FUND_ACCOUNTS_SHA256:sha256};
  const config=readSyntheticFundAccountConfig(env,database);
  return {dir,file,raw,env,config};
}

function isolatedSession(){
  const queries=[];
  return {queries,query:async(sql)=>{
    queries.push(sql);
    assert(!sql.includes('tplus_fund_account'),'non-fund request must not read the fund table');
    let rows;
    if(sql.includes('.warehouse '))rows=[warehouse];
    else if(sql.includes('.tplus_import_run '))rows=[];
    else if(sql.includes('.master_data_entity '))rows=[];
    else if(sql.includes('.master_data_state '))rows=[{revision:7}];
    else throw new Error('Unexpected synthetic query: '+sql);
    return {rows,rowCount:rows.length};
  }};
}

test('warehouse-only master query works without private fund configuration',async t=>{
  const previous=process.env.APPROVED_FUND_ACCOUNTS_FILE;
  delete process.env.APPROVED_FUND_ACCOUNTS_FILE;
  t.after(()=>{if(previous===undefined)delete process.env.APPROVED_FUND_ACCOUNTS_FILE;else process.env.APPROVED_FUND_ACCOUNTS_FILE=previous;});
  const session=isolatedSession(),repo=new SecurityRepository(session,database);
  const result=await listMasterRecords(session,repo,{kinds:['warehouses']});
  assert.equal(result.revision,7);
  assert.equal(result.records.length,1);
  assert.equal(result.records[0].id,warehouse.id);
  assert.deepEqual(result.records[0].body.hallRelations,[]);
  assert.equal(result.records[0].body.sourceOwnershipUnknown,true);
  assert(!session.queries.some(sql=>sql.includes('tplus_fund_account')));
});

test('default complete master query retains required approved-fund guard',async t=>{
  const previous=process.env.APPROVED_FUND_ACCOUNTS_FILE;
  delete process.env.APPROVED_FUND_ACCOUNTS_FILE;
  t.after(()=>{if(previous===undefined)delete process.env.APPROVED_FUND_ACCOUNTS_FILE;else process.env.APPROVED_FUND_ACCOUNTS_FILE=previous;});
  const session=isolatedSession(),repo=new SecurityRepository(session,database);
  await assert.rejects(listMasterRecords(session,repo),error=>error.code==='APPROVED_FUND_DATA_REQUIRED'&&error.statusCode===503);
  assert.equal(session.queries.length,0);
});

test('default party query keeps the private classification requirement even for synthetic-looking codes',async()=>{
  const session=sourceSession(),repo=new SecurityRepository(session,database);
  await assert.rejects(listMasterRecords(session,repo,{kinds:['parties']}),e=>e.code==='APPROVED_PARTY_DATA_REQUIRED'&&e.statusCode===503);
  assert(!session.queries.some(sql=>sql.includes('tplus_fund_account')));
});

test('synthetic source is explicit, QA-only, instance-bound and cannot be mixed with a private source',t=>{
  const {env,config}=syntheticFixture(t);
  assert.equal(readSyntheticFundAccountConfig({},database),null);
  for(const environment of ['local','stage','production'])assert.throws(()=>readSyntheticFundAccountConfig({...env,APP_ENV:environment},{...database,environment}),/QA_ONLY/);
  assert.throws(()=>readSyntheticFundAccountConfig(env,{...database,database:'business_database'}),/QA_ONLY/);
  assert.throws(()=>readSyntheticFundAccountConfig({...env,APPROVED_FUND_ACCOUNTS_FILE:'/not-opened/private-accounts.json'},database),/MIXED_PRIVATE/);
  assert.throws(()=>readSyntheticFundAccountConfig({...env,APPROVED_PARTY_ROLES_FILE:'/not-opened/private-party-roles.json'},database),/MIXED_PRIVATE/);
  assert.throws(()=>readSyntheticFundAccountConfig({APP_ENV:'qa',QA_SYNTHETIC_FUND_ACCOUNTS_FILE:config.file},database),/EXPLICIT_QA_SYNTHETIC/);
  assert.throws(()=>new SyntheticFundAccountReader(config,{...database,instanceId:'66666666-6666-4666-8666-666666666666'}),/QA_ONLY/);
  assert.throws(()=>createApp({...readConfig({APP_ENV:'local'}),environment:'production',syntheticFundAccounts:config}),/QA_ONLY/);
});

test('synthetic profile loads declared nonpayable data without falling back to production approval',t=>{
  const {config}=syntheticFixture(t);
  const value=new SyntheticFundAccountReader(config,database).load();
  assert.equal(value.syntheticSource,true);
  assert.equal(value.accounts.length,1);
  assert.equal(value.accounts[0].patch.accountNumber,'SYNTHETIC-NONPAYABLE');
  assert(Object.isFrozen(value)&&Object.isFrozen(value.accounts)&&Object.isFrozen(value.accounts[0].patch));
});

test('changed, wrong-instance, symlinked and broadly readable synthetic profiles are refused',t=>{
  const {file,dir,raw,config}=syntheticFixture(t),reader=new SyntheticFundAccountReader(config,database);
  reader.load();
  writeFileSync(file,raw+' ');
  assert.throws(()=>reader.load(),e=>e.code==='QA_SYNTHETIC_FUND_PROFILE_CHANGED');
  writeFileSync(file,raw);chmodSync(file,0o644);
  assert.throws(()=>reader.load(),e=>e.code==='QA_SYNTHETIC_FUND_PROFILE_NOT_PRIVATE');
  chmodSync(file,0o600);const alias=join(dir,'alias.json');symlinkSync(file,alias);
  assert.throws(()=>new SyntheticFundAccountReader({...config,file:alias},database).load(),e=>e.code==='QA_SYNTHETIC_FUND_PROFILE_REQUIRED');
  const changed=syntheticFixture(t,{...profile,instanceId:'66666666-6666-4666-8666-666666666666'});
  assert.throws(()=>new SyntheticFundAccountReader(changed.config,database).load(),e=>e.code==='QA_SYNTHETIC_FUND_PROFILE_IDENTITY_MISMATCH');
});

test('real-looking account fields, undeclared profile metadata and duplicate identities are not accepted as synthetic',t=>{
  const cases=[
    {...profile,accounts:[{...profile.accounts[0],patch:{...patch,accountNumber:'1234567890123456'}}]},
    {...profile,accounts:[{...profile.accounts[0],patch:{...patch,bank:'Unclassified bank'}}]},
    {...profile,accounts:[{...profile.accounts[0],patch:{...patch,name:'Unclassified business account'}}]},
    {...profile,accounts:[{...profile.accounts[0],code:'UNCLASSIFIED-FUND'}]},
    {...profile,accounts:[profile.accounts[0],profile.accounts[0]]},
    {...profile,undeclaredMetadata:'must-not-be-returned'},
  ];
  for(const input of cases){const {config}=syntheticFixture(t,input);assert.throws(()=>new SyntheticFundAccountReader(config,database).load(),e=>/^QA_SYNTHETIC_FUND_PROFILE_/.test(e.code));}
});

function sourceSession({fundBody=patch,sourceFacts={origin:'QA_SYNTHETIC'},account=null}={}){
  const queries=[],tokens=new Set();
  const accounts=[{id:fundId,code:'SYNTHETIC-FA1',name:fundBody.name,account_type:fundBody.type,bank:fundBody.bank,account_number:fundBody.accountNumber,source_department_id:fundBody.department,primary_payment_method_id:methodId,hall_ids:[hallId],payload:{...sourceFacts,enabled:fundBody.enabled}}];
  const halls=[{id:hallId,source_code:'SYNTHETIC-H1',name:'Synthetic hall',default_customer_id:null,default_warehouse_id:warehouse.id,warehouse_ids:[warehouse.id],source_payload:{origin:'QA_SYNTHETIC'}}];
  return {queries,lock:async()=>{},query:async(sql,params=[])=>{
    queries.push(sql);let rows;
    if(sql.includes('.employee_login ')&&sql.includes('WHERE login_name='))rows=account&&params[0]===account.login_name?[account]:[];
    else if(sql.includes('INSERT INTO ')&&sql.includes('.employee_session')){tokens.add(params[0]);rows=[];}
    else if(sql.includes('.employee_session '))rows=account&&tokens.has(params[0])?[account]:[];
    else if(sql.includes('.employee_login '))rows=account?[account]:[];
    else if(sql.includes('.warehouse '))rows=[warehouse];
    else if(sql.includes('.tplus_import_run '))rows=[{batch_id:'SYNTHETIC-ONLY-BATCH'}];
    else if(sql.includes('.tplus_hall ')&&sql.includes('unnest'))rows=[{warehouse_id:warehouse.id,hall_ids:[hallId]}];
    else if(sql.includes('.tplus_hall '))rows=halls;
    else if(sql.includes('.tplus_party_role '))rows=[{id:'77777777-7777-4777-8777-777777777777',code:'SYNTHETIC-C1',name:'Synthetic customer',usage:['customer'],payloads:[{origin:'QA_SYNTHETIC'}]},{id:'88888888-8888-4888-8888-888888888888',code:'SYNTHETIC-S1',name:'Synthetic supplier',usage:['supplier'],payloads:[{origin:'QA_SYNTHETIC'}]}];
    else if(sql.includes('.tplus_payment_method '))rows=[{id:methodId,code:'SYNTHETIC-PM',name:'Synthetic payment',payload:{}}];
    else if(sql.includes('.tplus_fund_account '))rows=accounts;
    else if(sql.includes('.tplus_employee '))rows=[];
    else if(sql.includes('.master_data_entity '))rows=[];
    else if(sql.includes('.master_data_state '))rows=[{revision:7}];
    else throw new Error('Unexpected synthetic query: '+sql);
    return {rows,rowCount:rows.length};
  }};
}

test('all needed master categories read declared synthetic rows and preserve warehouse/party/payment identities',async t=>{
  const {config}=syntheticFixture(t),reader=new SyntheticFundAccountReader(config,database),session=sourceSession();
  const repo=new SecurityRepository(session,database,()=>reader.load(),(code,body,id)=>reader.partyRole(code,body,id));
  const data=await listMasterRecords(session,repo);
  assert.equal(data.records.length,6);
  assert.deepEqual(data.records.find(x=>x.kind==='warehouses').body.hallRelations,[hallId]);
  const funds=data.records.filter(x=>x.kind==='fundAccounts');assert.equal(funds.length,1);assert.equal(funds[0].id,fundId);assert.equal(funds[0].body.primaryPaymentMethodId,methodId);
  assert.equal(data.records.find(x=>x.body.code==='SYNTHETIC-C1').body.usage[0],'customer');
  assert.equal(data.records.find(x=>x.body.code==='SYNTHETIC-S1').body.usage[0],'supplier');
});

test('synthetic profile refuses rather than masks mismatched source fields or unclassified source facts',async t=>{
  const {config}=syntheticFixture(t),reader=new SyntheticFundAccountReader(config,database);
  for(const setup of [{fundBody:{...patch,bank:'Unclassified bank'}},{sourceFacts:{origin:'QA_SYNTHETIC',privateBankingData:'must-not-return'}}]){
    const session=sourceSession(setup),repo=new SecurityRepository(session,database,()=>reader.load(),(code,body,id)=>reader.partyRole(code,body,id));
    await assert.rejects(listMasterRecords(session,repo),e=>e.code==='QA_SYNTHETIC_FUND_SOURCE_MISMATCH');
  }
});

test('synthetic customer/supplier classification refuses undeclared IDs, changed roles and unclassified source fields',t=>{
  const {config}=syntheticFixture(t),reader=new SyntheticFundAccountReader(config,database),party=profile.parties[0];
  const body={name:party.name,usage:[party.role],sourceFacts:{records:[{origin:'QA_SYNTHETIC'}]}};
  assert.equal(reader.partyRole(party.code,body,party.id),'customer');
  for(const [code,value,id] of [[party.code,body,fundId],['SYNTHETIC-UNKNOWN',body,party.id],[party.code,{...body,usage:['customer','supplier']},party.id],[party.code,{...body,sourceFacts:{records:[{origin:'QA_SYNTHETIC',privateContact:'must-not-return'}]}},party.id]])
    assert.throws(()=>reader.partyRole(code,value,id),e=>e.code==='QA_SYNTHETIC_PARTY_SOURCE_MISMATCH');
});

test('real authenticated reference routes and full masters work with the bound synthetic source',async t=>{
  const {config,dir,env}=syntheticFixture(t),secret=join(dir,'synthetic-session.key');writeFileSync(secret,randomBytes(48),{mode:0o600});
  const syntheticPassword='Synthetic-only-test-phrase-9',credential=await passwordCredential(syntheticPassword);
  const account={id:'99999999-9999-4999-8999-999999999999',login_name:'synthetic-admin',body:{code:'SYNTHETIC-ADMIN',name:'Synthetic admin',role:'管理员',employmentStatus:'在职',loginEnabled:true},password_salt:credential.salt,password_hash:credential.hash,version:1};
  const session=sourceSession({account}),access={read:work=>work(session),transaction:work=>work(session),close:async()=>{}};
  const security={origin:'https://synthetic-qa.invalid',secretFile:secret,ttlMs:60000};
  const service=new IdentityService(access,database,security,config),app=Fastify({logger:false});app.decorate('identity',service);enforceRouteRegistration(app);installIdentity(app,service);t.after(()=>app.close());
  const anonymous=await app.inject({url:'/api/reference/warehouses'});assert.equal(anonymous.statusCode,401);
  const login=await app.inject({method:'POST',url:'/api/runtime/session',headers:{origin:security.origin,'content-type':'application/json'},payload:{loginName:account.login_name,password:syntheticPassword}});
  assert.equal(login.statusCode,200,login.json().error?.code);
  const cookie=login.headers['set-cookie'].split(';')[0];
  for(const path of ['/api/reference/warehouses?size=500&page=1','/api/runtime/hall-config','/api/reference/halls','/api/reference/customers','/api/reference/suppliers','/api/reference/payment-methods','/api/reference/fund-accounts','/api/reference/employees','/api/runtime/masters']){
    const response=await app.inject({url:path,headers:{cookie,origin:security.origin}});assert.equal(response.statusCode,200,path+': '+response.json().error?.code);assert.equal(response.json().ok,true);
    const data=response.json().data;if(Array.isArray(data.items))assert(data.items.length>0,path+' must read actual declared test rows');
  }
  const dbEnv={APP_ENV:'qa',POSTGRES_HOST:'/no-postgres-used',POSTGRES_PORT:'55490',POSTGRES_DB:database.database,POSTGRES_USER:'synthetic_app',POSTGRES_ROLE_PREFIX:'synthetic',POSTGRES_SOURCE_SCHEMA:'synthetic_source',POSTGRES_RUNTIME_SCHEMA:'synthetic_runtime',POSTGRES_AUTH_SCHEMA:'synthetic_auth',POSTGRES_CONTROL_SCHEMA:'synthetic_control',POSTGRES_INSTANCE_ID:database.instanceId,POSTGRES_CLUSTER_ID:database.clusterId,SESSION_ORIGIN:security.origin,SESSION_SECRET_FILE:secret,MEDIA_STORAGE_ROOT:join(dir,'media'),...env};
  const appConfig=readConfig(dbEnv);assert.equal(appConfig.syntheticFundAccounts.sha256,config.sha256);
  const configured=createApp(appConfig);t.after(()=>configured.close());assert.equal((await configured.inject({url:'/api/health'})).statusCode,200);assert.equal(configured.dataAccess.statistics().total,0,'startup/health must not open a database connection');
});
