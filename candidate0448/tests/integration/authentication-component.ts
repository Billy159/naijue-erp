/** Genuine PG adapter + original auth service/HTTP and bounded host resources.
 * Synthetic identity only. No full ERP factory, issuer, schema patch or review.
 * All five capacity labels deliberately alias this ONE verified local cluster
 * filesystem; these actual observations are not a production volume inventory. */
import assert from 'node:assert/strict';
import type {TestContext} from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {lstat,realpath,readFile,statfs} from 'node:fs/promises';
import Fastify from 'fastify';
import type {Pool} from 'pg';
import {PostgresAuthenticationStore} from '../../adapters/postgres/src/auth-store.ts';
import {createAuthenticationService,sessionTokenHash} from '../../packages/authentication/src/service.ts';
import {createNodeScryptPasswords,isNodeScryptPasswordHash,NODE_SCRYPT_DUMMY_HASH} from '../../packages/authentication/src/passwords.ts';
import {createAuthenticationPasswordWork,createPasswordWorkGate} from '../../packages/authentication/src/password-work-gate.ts';
import {createSourceAuthenticationPolicy} from '../../packages/authentication/src/source-policy.ts';
import {createAuthenticationHttpPlugin} from '../../apps/api/src/authentication.ts';
import {createLoginAdmission} from '../../apps/api/src/login-admission.ts';
import {createOwnedPoolCapacityAdmission,captureCapacityRuntimePoolBinder} from '../../apps/api/src/capacity-runtime-probe.ts';
import type {CapacityBytes} from '../../apps/api/src/capacity-admission.ts';
import type {AuthenticationComponentSettings} from './authentication-component-settings.ts';

const HALL='00000000-0000-4000-8000-000000880001',STAFF='00000000-0000-4000-8000-000000880002',ACCOUNT='00000000-0000-4000-8000-000000880003';
const LOGIN='SYNTHETIC_AUTH_COMPONENT_ONLY',ORIGIN='https://synthetic-auth-component.invalid';
const amounts=(value:bigint):CapacityBytes=>({postgres:value,wal:value,backup:value,system:value,media:value});
export async function runAuthenticationComponent(t:TestContext,pool:Pool,settings:AuthenticationComponentSettings):Promise<void>{
 const directory=settings.dataDirectory,stat=await lstat(directory);
 assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&await realpath(directory)===directory&&stat.uid===process.getuid?.()&&(stat.mode&0o077)===0,'Owned private canonical disposable cluster directory required');
 const pid=(await readFile(directory+'/postmaster.pid','utf8')).trimEnd().split('\n');
 assert.equal(pid[1],directory);assert.equal(Number(pid[3]),settings.port);assert.match(pid[0]!,/^[1-9]\d*$/);
 const identity=(await pool.query(`SELECT current_database() database,current_user role,session_user,
  (SELECT oid::text FROM pg_database WHERE datname=current_database()) database_oid,
  pg_postmaster_start_time()::text postmaster_start,extract(epoch FROM pg_postmaster_start_time())::bigint::text start_seconds`)).rows[0];
 assert.ok(identity&&identity.database===settings.database&&identity.role===settings.user&&identity.session_user===settings.user);
 assert.ok(Math.abs(Number(identity.start_seconds)-Number(pid[2]))<=1,'Local cluster start must match directly authenticated target');
 const physical='owned-auth-component-device:'+String(stat.dev),start=Date.now(),binding={candidateFingerprint:'standalone-auth-component-source-v1',targetFingerprint:settings.database+':'+String(identity.database_oid),writerTopologyFingerprint:'one-component-auth-writer',inventoryFingerprint:physical,processInstanceId:randomUUID(),restartGeneration:0,writerCount:1,physicalVolumes:{postgres:physical,wal:physical,backup:physical,system:physical,media:physical}};
 const capacity=createOwnedPoolCapacityAdmission({window:{approved:true,token:'synthetic-component-'+randomUUID(),inventoryObservedAt:start,startsAt:start,expiresAt:start+90000,binding},budgets:{session:{maxAdmissions:16,maxInFlight:1,worstCaseBytes:amounts(1048576n)},upload:{maxAdmissions:1,maxInFlight:1,worstCaseBytes:amounts(1048576n)}},minimumFreeBytes:amounts(67108864n),safetyBytes:amounts(1048576n),probeTtlMillis:1000,probeTimeoutMillis:1000,maxProbeWaiters:2,retryAfterSeconds:1,now:Date.now,currentBinding:()=>binding,runtimeProbe:{target:{host:settings.host,port:settings.port,database:settings.database,role:settings.user,databaseOid:String(identity.database_oid),postmasterStart:String(identity.postmaster_start)},async readVolumeFacts({window}){const space=await statfs(directory,{bigint:true});return {status:'KNOWN',windowToken:window.token,binding,observedAt:Date.now(),freeBytes:amounts(space.bavail*space.bsize)};}}});
 captureCapacityRuntimePoolBinder(capacity)!(pool,{host:settings.host,port:settings.port,database:settings.database,user:settings.user});
 const passwords=createNodeScryptPasswords(),password=randomBytes(24).toString('base64url'),nextPassword=randomBytes(24).toString('base64url'),hash=await passwords.hash(password),now=()=>new Date().toISOString();
 const setup=await pool.connect();let began=false;
 try{await setup.query('BEGIN');began=true;
  await setup.query('INSERT INTO naijue_erp.hall(id,name,enabled,version) VALUES($1,$2,true,1)',[HALL,'SYNTHETIC authentication hall']);
  await setup.query('INSERT INTO naijue_erp.staff(id,name,hall_id,role,employment_status,version) VALUES($1,$2,$3,\'SALESPERSON\',\'在职\',1)',[STAFF,'SYNTHETIC authentication staff',HALL]);
  await setup.query('INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at) VALUES($1,$2,$3,$4,true,1,1,$5,$5)',[ACCOUNT,STAFF,LOGIN,hash,now()]);
  // Unknown COMMIT is never rolled back/retried or overwritten.
  began=false;await setup.query('COMMIT');
 }catch{if(began)await setup.query('ROLLBACK');throw Error('Synthetic authentication setup failed; raw database/credential details omitted');}finally{setup.release(true);}
 const gate=createPasswordWorkGate({maxConcurrent:1,maxAnonymous:1,retryAfterSeconds:1});
 const service=createAuthenticationService({store:new PostgresAuthenticationStore(pool),now,policy:createSourceAuthenticationPolicy(900),passwords:createAuthenticationPasswordWork(passwords,gate,{supports:isNodeScryptPasswordHash,dummyHash:NODE_SCRYPT_DUMMY_HASH}),sessionAdmission:{acquire:signal=>capacity.acquire('session',signal)}});
 const rate={burst:32,tokens:32,intervalMillis:1000},admission=createLoginAdmission({global:rate,source:rate,sourceAccount:rate,entryTtlMillis:10000,maxEntries:32,maxRetryAfterSeconds:1,now:Date.now});
 const app=Fastify({logger:false});app.register(createAuthenticationHttpPlugin({service,trustedOrigin:ORIGIN,loginAdmission:admission}));
 t.after(async()=>{capacity.close();await app.close();});await app.ready();assert.equal(app.server.listening,false);await capacity.preflight();
 const post=(url:string,payload:unknown,cookie?:string,origin=ORIGIN)=>app.inject({method:'POST',url,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},payload:JSON.stringify(payload)});
 const count=async()=>Number((await pool.query('SELECT count(*)::integer n FROM naijue_erp.auth_session WHERE account_id=$1',[ACCOUNT])).rows[0].n);
 let cookie='';
 await t.test('wrong password and cross-origin login persist no session',async()=>{
  assert.equal((await post('/auth/login',{loginName:LOGIN,password:password+'wrong'})).statusCode,401);
  assert.equal((await post('/auth/login',{loginName:LOGIN,password},undefined,'https://foreign.invalid')).statusCode,403);assert.equal(await count(),0);
 });
 await t.test('real scrypt login commits and secure cookie resolves actual stored session',async()=>{
  const response=await post('/auth/login',{loginName:LOGIN,password});assert.equal(response.statusCode,200);
  assert.ok(!response.body.includes(password),'Authentication JSON must not disclose password');const raw=response.headers['set-cookie'];assert.equal(typeof raw,'string');assert.match(raw as string,/; Path=\/; HttpOnly; Secure; SameSite=Strict;/);cookie=(raw as string).split(';')[0]!;
  const token=cookie.slice(cookie.indexOf('=')+1),stored=(await pool.query('SELECT token_hash,revoked_at FROM naijue_erp.auth_session WHERE account_id=$1',[ACCOUNT])).rows;assert.equal(stored.length,1);assert.equal(stored[0].token_hash,sessionTokenHash(token));assert.equal(stored[0].revoked_at,null);
  const current=await app.inject({url:'/auth/session',headers:{cookie}});assert.equal(current.statusCode,200);assert.equal(current.json().principal.accountId,ACCOUNT);assert.equal(current.json().principal.hallId,HALL);
 });
 await t.test('shared password gate overload returns429 without a session write',async()=>{
  let release!:()=>void,entered!:()=>void;const inside=new Promise<void>(done=>{entered=done;}),hold=new Promise<void>(done=>{release=done;});const pending=gate.run('login',async()=>{entered();await hold;});await inside;const before=await count();
  try{assert.equal((await post('/auth/login',{loginName:LOGIN,password})).statusCode,429);assert.equal(await count(),before);}finally{release();await pending;}
 });
 await t.test('actual bounded session admission denies concurrent new login503 without writing',async()=>{
  const held=await capacity.acquire('session'),before=await count();try{const response=await post('/auth/login',{loginName:LOGIN,password});assert.equal(response.statusCode,503);assert.equal(response.headers['retry-after'],'1');assert.equal(await count(),before);}finally{held.release();}
 });
 await t.test('logout revokes persisted session and old cookie no longer resolves',async()=>{
  assert.equal((await post('/auth/logout',{},cookie)).statusCode,204);assert.equal((await app.inject({url:'/auth/session',headers:{cookie}})).json().principal,null);
  assert.equal(Number((await pool.query('SELECT count(*)::integer n FROM naijue_erp.auth_session WHERE account_id=$1 AND revoked_at IS NOT NULL',[ACCOUNT])).rows[0].n),1);
 });
 await t.test('password change commits new hash/authVersion and invalidates original sessions',async()=>{
  const login=await post('/auth/login',{loginName:LOGIN,password});assert.equal(login.statusCode,200);const oldCookie=(login.headers['set-cookie'] as string).split(';')[0]!;
  assert.equal((await post('/auth/password',{currentPassword:password,newPassword:nextPassword},oldCookie)).statusCode,204);
  assert.equal((await app.inject({url:'/auth/session',headers:{cookie:oldCookie}})).json().principal,null);
  assert.equal((await post('/auth/login',{loginName:LOGIN,password})).statusCode,401);const fresh=await post('/auth/login',{loginName:LOGIN,password:nextPassword});assert.equal(fresh.statusCode,200);cookie=(fresh.headers['set-cookie'] as string).split(';')[0]!;
  const row=(await pool.query('SELECT password_hash,auth_version FROM naijue_erp.user_account WHERE id=$1',[ACCOUNT])).rows[0];assert.equal(row.auth_version,2);assert.ok(await passwords.verify(nextPassword,row.password_hash));
 });
 await t.test('closed capacity blocks only new session writes while existing resolve/logout remain available',async()=>{
  const before=await count();capacity.close();assert.equal((await post('/auth/login',{loginName:LOGIN,password:nextPassword})).statusCode,503);assert.equal(await count(),before);assert.equal((await app.inject({url:'/auth/session',headers:{cookie}})).json().principal.accountId,ACCOUNT);assert.equal((await post('/auth/logout',{},cookie)).statusCode,204);
  for(const table of ['sales_header','transfer_header','inventory_ledger','operation_receipt','audit_change','product'] as const)assert.equal(Number((await pool.query(`SELECT count(*)::integer n FROM naijue_erp.${table}`)).rows[0].n),0,'Authentication component must not create business facts');
 });
 t.diagnostic('Actual PG authentication storage/service/HTTP, shared bounded CPU/login/session resources and actual local cluster filesystem capacity observations only. Owner-role component is NOT runtime ACL/V6/V7/V8/ERP business/browser/TLS/production acceptance.');
}
