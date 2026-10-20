import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, chmodSync, symlinkSync, rmSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {randomBytes, randomUUID, pbkdf2Sync, webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {readDatabaseConfig} from '../dist/server/database/config.js';
import {readSecurityConfig, SessionKeys} from '../dist/server/security/config.js';
import {verifyPassword, passwordCredential} from '../dist/server/security/passwords.js';
import {operations, authorizeAction, operation} from '../dist/server/security/policies.js';
import {scopeFromBody, employeeView, SecurityRepository} from '../dist/server/security/repository.js';
import {createApp} from '../dist/server/app.js';
import {readConfig} from '../dist/server/config.js';
import {IdentityService} from '../dist/server/security/service.js';

const env={APP_ENV:'qa',POSTGRES_HOST:'/private/t10-unit',POSTGRES_PORT:'55490',POSTGRES_DB:'demo_8877_t10_unit',POSTGRES_USER:'t10_unit_app',POSTGRES_ROLE_PREFIX:'t10_unit',
  POSTGRES_SOURCE_SCHEMA:'t10_source',POSTGRES_RUNTIME_SCHEMA:'t10_runtime',POSTGRES_AUTH_SCHEMA:'t10_auth',POSTGRES_CONTROL_SCHEMA:'t10_control',
  POSTGRES_INSTANCE_ID:'13f8764a-782b-4454-8375-b647e194983e',POSTGRES_CLUSTER_ID:'7691754635362465003'};
const database=readDatabaseConfig(env),base=resolve('logs/T10');mkdirSync(base,{recursive:true});
const fixture=mkdtempSync(join(base,'unit-suite-')),secret=join(fixture,'synthetic.key');writeFileSync(secret,randomBytes(48),{mode:0o600});
const settings={SESSION_ORIGIN:'https://t10-qa.invalid',SESSION_SECRET_FILE:secret};

test('T10 registry covers every business operation and frozen policy without granting maintenance HTTP access',()=>{
  const contract=JSON.parse(readFileSync('references/planning-20261001/T05/模块合同.json','utf8'));
  const expected=contract.modules.flatMap(x=>x.operations).filter(x=>!x.id.startsWith('session.')&&x.policy_id!=='migration_maintenance');
  assert.deepEqual(Object.keys(operations).sort(),expected.map(x=>x.id).sort());
  for(const row of expected) assert.deepEqual(operations[row.id],{mode:row.mode,policy:row.policy_id});
  assert.throws(()=>operation('__proto__'));assert.throws(()=>operation('migration.activateOpening'));
  for(const role of ['ADMIN','WAREHOUSE','SALESPERSON']) for(const row of expected){
    const allowed=contract.policies[row.policy_id].roles.includes(role);
    if(allowed) assert.doesNotThrow(()=>authorizeAction({id:'synthetic',role,storeId:null,version:1},row.id));
    else assert.throws(()=>authorizeAction({id:'synthetic',role,storeId:null,version:1},row.id),e=>e.code==='FORBIDDEN');
  }
});
test('Secure cookies and token/CSRF digests bind environment, instance, schema, origin and key',()=>{
  const keys=new SessionKeys(readSecurityConfig(settings,database),database),raw='a'.repeat(64);
  for(const changed of [{environment:'production'},{environment:'stage'},{instanceId:randomUUID()},{database:'demo_8877_other'},{schemas:{...database.schemas,auth:'other_auth'}}]){
    const other=new SessionKeys(readSecurityConfig(settings,database),{...database,...changed});assert.notEqual(other.cookieName,keys.cookieName);assert.notEqual(other.sessionDigest(raw),keys.sessionDigest(raw));assert.notEqual(other.csrf(raw),keys.csrf(raw));
  }
  const otherOrigin=new SessionKeys(readSecurityConfig({...settings,SESSION_ORIGIN:'https://other.invalid'},database),database);assert.notEqual(otherOrigin.sessionDigest(raw),keys.sessionDigest(raw));
  const cookie=keys.cookie(raw);assert(cookie.startsWith('__Host-'));assert(cookie.includes('HttpOnly; Secure; SameSite=Strict'));assert(!cookie.includes('Domain='));
  assert.equal(keys.token(cookie),raw);assert.equal(keys.token(keys.cookieName+'='+raw+'; '+keys.cookieName+'='+raw),null);
  assert(keys.csrfMatches(raw,keys.csrf(raw)));assert(!keys.csrfMatches('b'.repeat(64),keys.csrf(raw)));assert(!keys.csrfMatches(raw,'bad'));
  assert(!JSON.stringify(keys).includes(raw));
});
test('session configuration refuses HTTP, wildcard origin, TTL overflow, public keys and symlink files',()=>{
  for(const SESSION_ORIGIN of ['http://localhost','https://t10.invalid/','https://u:p@t10.invalid','*']) assert.throws(()=>readSecurityConfig({...settings,SESSION_ORIGIN},database));
  for(const SESSION_TTL_SECONDS of ['0','28801','1.1']) assert.throws(()=>readSecurityConfig({...settings,SESSION_TTL_SECONDS},database));
  assert.throws(()=>readSecurityConfig(settings,null));assert.equal(readSecurityConfig({},database),null);
  chmodSync(secret,0o644);assert.throws(()=>new SessionKeys(readSecurityConfig(settings,database),database),/INVALID_SESSION_SECRET_FILE/);chmodSync(secret,0o600);
  const link=join(fixture,'key-link');symlinkSync(secret,link);assert.throws(()=>new SessionKeys(readSecurityConfig({...settings,SESSION_SECRET_FILE:link},database),database),/INVALID_SESSION_SECRET_FILE/);
  assert.throws(()=>new SessionKeys({origin:'http://insecure',secretFile:secret,ttlMs:28800000},database),/HTTPS_SESSION_ORIGIN_REQUIRED/);
});
test('retained UUID and hex salts verify exact PBKDF2 210000; resets use explicit 600000 format',async()=>{
  const password='synthetic-password';
  for(const salt of [randomUUID(),randomBytes(24).toString('hex')]){const hash=pbkdf2Sync(password,salt,210000,32,'sha256').toString('hex');assert(await verifyPassword(password,salt,hash));assert(!await verifyPassword('wrong',salt,hash));}
  const credential=await passwordCredential(password);assert.match(credential.hash,/^pbkdf2-sha256:600000:/);assert(await verifyPassword(password,credential.salt,credential.hash));
  assert(!await verifyPassword(password,null,null));assert(!await verifyPassword(password,'bad','f'.repeat(64)));await assert.rejects(passwordCredential('short'));
});
test('effective identity excludes legacy disabled accounts and unsupported credentials',async()=>{
  const repo=new SecurityRepository({query:async()=>assert.fail('administrator eligibility needs no extra query')},database);
  const row={id:'synthetic',login_name:'synthetic',body:{role:'管理员',employmentStatus:'在职',loginEnabled:true},password_hash:'f'.repeat(64),password_salt:'f'.repeat(48),version:1};
  assert.equal((await repo.actor(row)).role,'ADMIN');
  for(const changed of [{body:{...row.body,enabled:false}},{body:{...row.body,loginEnabled:false}},{body:{...row.body,employmentStatus:'离职'}},{password_hash:'unsupported'},{password_salt:'bad'},{login_name:' '}])
    await assert.rejects(repo.actor({...row,...changed}),e=>e.code==='UNAUTHENTICATED');
  assert.equal(employeeView({...row,body:{...row.body,enabled:false}}).enabled,false);
});
test('document scope includes every warehouse, keeps missing creator unknown and rejects missing scope',()=>{
  const ids=['10000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000202'];
  const scope=scopeFromBody('SALE',{header:{source_warehouse_id:ids[0],hall_id:null,source_payload:{v2_creator:{id:'spoofed-admin'}}},lines:[{warehouse_id:ids[1]}]});
  assert.deepEqual(scope.warehouseIds,ids);assert.equal(scope.creatorId,null);assert.equal(scope.storeId,null);
  assert.throws(()=>scopeFromBody('SALE',{header:{}}));assert.throws(()=>scopeFromBody('TRANSFER',{header:{source_from_warehouse_id:ids[0],source_to_warehouse_id:ids[0]}}));
  const publicView=employeeView({id:'synthetic',login_name:'synthetic',body:{role:'管理员',name:'Synthetic',employmentStatus:'在职',loginEnabled:true,credential:{hash:'private'},password:'private'},password_hash:'private',password_salt:'private',version:1});
  assert(!JSON.stringify(publicView).includes('private'));assert(publicView.hasPassword);
});
test('account content in an ordinary import requires administrator even when warehouse master imports are allowed',async()=>{
  for(const role of ['WAREHOUSE','ADMIN']){
    const session={lock:async()=>{},query:async()=>({rows:[{id:'synthetic',login_name:'synthetic',body:{name:'Synthetic',role,employmentStatus:'在职',loginEnabled:true},password_hash:'f'.repeat(64),password_salt:'f'.repeat(48),version:1}],rowCount:1})};
    const access={read:work=>work(session),transaction:work=>work(session),close:async()=>{}};
    const identity=new IdentityService(access,database,readSecurityConfig(settings,database));let invoked=0;
    assert.equal(await identity.execute('a'.repeat(64),'imports.referenceCommit',{kind:'reference-import',kinds:['products','masters']},async()=>++invoked),1);
    const accounts=identity.execute('a'.repeat(64),'imports.referenceCommit',{kind:'reference-import',kinds:['employees']},async()=>++invoked);
    if(role==='WAREHOUSE'){await assert.rejects(accounts,e=>e.code==='FORBIDDEN');assert.equal(invoked,1);}else assert.equal(await accounts,2);
    await assert.rejects(identity.execute('a'.repeat(64),'imports.referenceCommit',{kind:'global'},async()=>assert.fail()),e=>e.code==='VALIDATION');
  }
});
test('health-only startup remains lazy; configured application refuses an unguarded new route',async t=>{
  const mediaRoot=mkdtempSync(join(fixture,'media-'));
  t.after(()=>rmSync(mediaRoot,{recursive:true,force:true}));
  const foundation=createApp(readConfig({APP_ENV:'local',MEDIA_STORAGE_ROOT:mediaRoot}));assert.equal(foundation.identity,null);assert.equal((await foundation.inject({url:'/api/runtime/session'})).statusCode,404);await foundation.close();
  const app=createApp(readConfig({...env,...settings,MEDIA_STORAGE_ROOT:mediaRoot}));assert.equal(app.dataAccess.statistics().total,0);assert.throws(()=>app.get('/api/unguarded',async()=>({sensitive:true})),/USE_T10_BUSINESS_ROUTE_REGISTRATION/);await app.close();
});
test('shared client keeps CSRF in memory, rotates on session refresh, clears on expiry and logout',async()=>{
  const context={crypto:webcrypto,AbortController,URLSearchParams,setTimeout,clearTimeout,navigator:{onLine:true}};vm.createContext(context);vm.runInContext(readFileSync('frontend/service-client.js','utf8'),context);
  const calls=[],storage=new Map();let token='csrf-one',fail=false;
  const client=context.ERP_API.createClient({actor:()=> 'synthetic',storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},fetcher:async(path,options)=>{
    calls.push({path,options});return {ok:!fail,status:fail?401:200,json:async()=>fail?{ok:false,error:{code:'UNAUTHENTICATED'}}:{ok:true,data:path.includes('/session')?{employee:{id:'synthetic'},csrfToken:token}:{done:true}}};}});
  await client.request('/runtime/session');await client.request('/runtime/inventory',{filters:{}},{mode:'query'});assert.equal(calls.at(-1).options.headers['X-CSRF-Token'],'csrf-one');
  token='csrf-two';await client.request('/runtime/session');await client.request('/runtime/inventory',{filters:{}},{mode:'query'});assert.equal(calls.at(-1).options.headers['X-CSRF-Token'],'csrf-two');
  fail=true;await assert.rejects(client.request('/reference/warehouses'));fail=false;await client.request('/runtime/inventory',{filters:{}},{mode:'query'});assert.equal(calls.at(-1).options.headers['X-CSRF-Token'],undefined);
  await client.request('/runtime/session');await client.request('/runtime/logout',{});await client.request('/runtime/inventory',{filters:{}},{mode:'query'});assert.equal(calls.at(-1).options.headers['X-CSRF-Token'],undefined);
  assert(![...storage.values()].join('').includes('csrf-'));assert(![...storage.values()].join('').includes('password'));
});
