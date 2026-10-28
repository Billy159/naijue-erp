/** Synthetic race barriers plus the real PG adapter with scripted leases. No database execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthenticationService, sessionTokenHash } from '../packages/authentication/src/service.ts';
import { createAuthenticationPasswordWork, createPasswordWorkGate } from '../packages/authentication/src/password-work-gate.ts';
import { createSourceAuthenticationPolicy } from '../packages/authentication/src/source-policy.ts';
import { PostgresAuthenticationStore } from '../adapters/postgres/src/auth-store.ts';
import type { AuthenticationAccount, AuthenticationStore, AuthenticationTransaction, AuthenticationSession, PasswordCodec } from '../packages/authentication/src/ports.ts';
import { entityId } from '../packages/domain/src/values.ts';

const time='2026-10-29T00:00:00.000Z',later='2026-10-29T01:00:00.000Z',old='synthetic-current-password',next='synthetic-replacement-password';
const accountId=entityId('account','00000000-0000-4000-8000-000000000001'),staffId=entityId('staff','00000000-0000-4000-8000-000000000002');
const token='A'.repeat(43),tokenHash=sessionTokenHash(token)!;
const initial:AuthenticationAccount={accountId,staffId,loginName:' Exact Login ',passwordHash:'old',authVersion:1,loginEnabled:true,role:'ADMIN',employmentStatus:'在职',hallId:null,hallEnabled:null};
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};
class Store implements AuthenticationStore {
  account:{-readonly[K in keyof AuthenticationAccount]:AuthenticationAccount[K]}=structuredClone(initial);sessions=new Map<string,AuthenticationSession>([[tokenHash,{tokenHash,accountId,authVersion:1,createdAt:time,expiresAt:later,revokedAt:null}]]);
  active=0;transactions=0;commits=0;changes=0;events:string[]=[];readError:Error|undefined;private serial=Promise.resolve();
  async readLoginSnapshot(name:string){if(this.readError)throw this.readError;return name===this.account.loginName?structuredClone({accountId:this.account.accountId,loginName:this.account.loginName,passwordHash:this.account.passwordHash,authVersion:this.account.authVersion}):undefined;}
  async readPasswordChangeSnapshot(hash:string){if(this.readError)throw this.readError;const session=this.sessions.get(hash);return session?structuredClone({account:this.account,session}):undefined;}
  async transaction<T>(work:(tx:AuthenticationTransaction)=>Promise<T>):Promise<T>{
    const previous=this.serial;let release!:()=>void;this.serial=new Promise<void>(done=>{release=done;});await previous;
    this.active++;this.transactions++;let account=structuredClone(this.account);const sessions=structuredClone(this.sessions);
    const tx:AuthenticationTransaction={
      findAccountByLogin:async name=>name===account.loginName?account:undefined,
      getAccount:async id=>{this.events.push('account');return id===account.accountId?account:undefined;},
      getSession:async hash=>{this.events.push('session-read');return sessions.get(hash);},
      lockSession:async(hash,id)=>{this.events.push('session-lock');const s=sessions.get(hash);return s?.accountId===id?s:undefined;},
      insertSession:async s=>{this.events.push('insert');sessions.set(s.tokenHash,s);},
      revokeSession:async(hash,revokedAt)=>{const s=sessions.get(hash);if(s)sessions.set(hash,{...s,revokedAt});},
      changePassword:async(id,version,encoded,replacement,changedAt)=>{
        this.events.push('change');if(id!==account.accountId||version!==account.authVersion||encoded!==account.passwordHash)return false;
        account={...account,passwordHash:replacement,authVersion:account.authVersion+1};
        for(const [key,s]of sessions)sessions.set(key,{...s,revokedAt:changedAt});this.changes++;return true;
      }
    };
    try{const value=await work(tx);this.account=account;this.sessions=sessions;this.commits++;return value;}finally{this.active--;release();}
  }
}
function setup(options:{verify?:(password:string,encoded:string)=>Promise<boolean>;hash?:(password:string)=>Promise<string>}={}){
  const store=new Store();let now=time,verify=0,hash=0;
  const raw:PasswordCodec={async verify(password,encoded){assert.equal(store.active,0,'Password verify must not retain a transaction');verify++;return options.verify?options.verify(password,encoded):password===old&&encoded==='old';},
    async hash(password){assert.equal(store.active,0,'Password hash must not retain a transaction');hash++;return options.hash?options.hash(password):'new';}};
  const work=createAuthenticationPasswordWork(raw,createPasswordWorkGate({maxConcurrent:2,maxAnonymous:1,retryAfterSeconds:1}),{supports:value=>['old','new','dummy'].includes(value),dummyHash:'dummy'});
  const service=createAuthenticationService({store,now:()=>now,policy:createSourceAuthenticationPolicy(3600),passwords:work});
  return{store,service,setTime:(value:string)=>{now=value;},counts:()=>({verify,hash})};
}
for(const field of ['passwordHash','authVersion','loginName','loginEnabled','role','employmentStatus','hallEnabled'] as const)test(`login locks current ${field} only after released computation and rejects stale/invalid facts`,async()=>{
  const entered=deferred<void>(),finish=deferred<boolean>();const f=setup({verify:async()=>{entered.resolve();return finish.promise;}});
  const before=f.store.sessions.size,pending=f.service.login(initial.loginName,old);await entered.promise;assert.equal(f.store.transactions,0);
  if(field==='passwordHash')f.store.account.passwordHash='changed';
  else if(field==='authVersion')f.store.account.authVersion++;
  else if(field==='loginName')f.store.account.loginName='different';
  else if(field==='loginEnabled')f.store.account.loginEnabled=false;
  else if(field==='role')f.store.account.role='UNKNOWN';
  else if(field==='employmentStatus')f.store.account.employmentStatus='离职';
  else {f.store.account.hallId=entityId('hall','00000000-0000-4000-8000-000000000003');f.store.account.hallEnabled=false;}
  finish.resolve(true);await assert.rejects(pending,{code:'INVALID_CREDENTIALS'});assert.equal(f.store.sessions.size,before);assert.equal(f.store.events.includes('insert'),false);assert.deepEqual(f.counts(),{verify:1,hash:0});
});
test('valid role/hall transitions use original authVersion fence, not a cached principal',async()=>{
  const entered=deferred<void>(),finish=deferred<boolean>();const f=setup({verify:async()=>{entered.resolve();return finish.promise;}});
  const pending=f.service.login(initial.loginName,old);await entered.promise;f.store.account={...f.store.account,role:'WAREHOUSE',authVersion:2};finish.resolve(true);
  await assert.rejects(pending,{code:'INVALID_CREDENTIALS'});assert.equal(f.store.events.includes('insert'),false);
});
test('unknown or malformed snapshot never authenticates even when dummy returns true; wrong password does not start a transaction',async()=>{
  const f=setup({verify:async()=>true});await assert.rejects(f.service.login('missing',old),{code:'INVALID_CREDENTIALS'});
  f.store.account.passwordHash='malformed';await assert.rejects(f.service.login(initial.loginName,old),{code:'INVALID_CREDENTIALS'});assert.equal(f.store.transactions,0);assert.equal(f.counts().verify,2);
  const wrong=setup();await assert.rejects(wrong.service.login(initial.loginName,'wrong'),{code:'INVALID_CREDENTIALS'});assert.equal(wrong.store.transactions,0);assert.equal(wrong.counts().verify,1);
});
test('snapshot errors remain storage errors and do not trigger dummy/credential work',async()=>{
  const f=setup(),failure=Error('synthetic snapshot unavailable');f.store.readError=failure;
  await assert.rejects(f.service.login(initial.loginName,old),error=>error===failure);assert.deepEqual(f.counts(),{verify:0,hash:0});assert.equal(f.store.transactions,0);
});
test('cancel during real pending work cannot enter final transaction or release the anonymous slot early',async()=>{
  const entered=deferred<void>(),finish=deferred<boolean>(),abort=new AbortController();const f=setup({verify:async()=>{entered.resolve();return finish.promise;}});
  const pending=f.service.login(initial.loginName,old,abort.signal);await entered.promise;abort.abort();
  await assert.rejects(f.service.login(initial.loginName,old),{code:'PASSWORD_WORK_BUSY'});assert.equal(f.store.transactions,0);
  finish.resolve(true);await assert.rejects(pending,{code:'AUTHENTICATION_CANCELLED'});assert.equal(f.store.transactions,0);
});
for(const race of ['logout','expiry','password','version','login-name','disabled','left','hall','role'] as const)test(`own-password ${race} during unlocked hash preparation cannot change credentials or resurrect a session`,async()=>{
  const entered=deferred<void>(),finish=deferred<string>();const f=setup({hash:async()=>{entered.resolve();return finish.promise;}});
  const pending=f.service.changeOwnPassword(token,old,next);await entered.promise;assert.equal(f.store.transactions,0);
  if(race==='logout')f.store.sessions.set(tokenHash,{...f.store.sessions.get(tokenHash)!,revokedAt:time});
  else if(race==='expiry')f.setTime(later);
  else if(race==='password')f.store.account.passwordHash='changed';
  else if(race==='version')f.store.account.authVersion++;
  else if(race==='login-name')f.store.account.loginName='changed';
  else if(race==='disabled')f.store.account.loginEnabled=false;
  else if(race==='left')f.store.account.employmentStatus='离职';
  else if(race==='hall'){f.store.account.hallId=entityId('hall','00000000-0000-4000-8000-000000000003');f.store.account.hallEnabled=true;}
  else f.store.account.role='WAREHOUSE';
  finish.resolve('new');await assert.rejects(pending,{code:'UNAUTHENTICATED'});assert.equal(f.store.changes,0);assert.equal(f.store.account.passwordHash==='new',false);assert.deepEqual(f.counts(),{verify:1,hash:1});
});
test('two concurrent own-password computations cannot both commit; all old sessions revoke only with the winning CAS',async()=>{
  const both=deferred<void>(),finish=deferred<string>();let ready=0;
  const f=setup({hash:async()=>{if(++ready===2)both.resolve();return finish.promise;}});
  const a=f.service.changeOwnPassword(token,old,next),b=f.service.changeOwnPassword(token,old,next);await both.promise;
  assert.equal(f.store.transactions,0);finish.resolve('new');const results=await Promise.allSettled([a,b]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.store.changes,1);assert.equal(f.store.account.authVersion,2);
  assert.ok([...f.store.sessions.values()].every(s=>s.revokedAt===time));assert.deepEqual(f.store.events.slice(0,4),['session-read','account','session-lock','change']);
});
test('successful login uses the post-computation clock; own password retains original final session lock order and does not sign in again',async()=>{
  const f=setup();f.setTime('2026-10-29T00:05:00.000Z');const login=await f.service.login(initial.loginName,old);assert.equal(login.expiresAt,'2026-10-29T01:05:00.000Z');
  f.store.events=[];await f.service.changeOwnPassword(login.token,old,next);assert.deepEqual(f.store.events,['session-read','account','session-lock','change']);assert.equal(await f.service.resolve(login.token),null);
});
test('actual PG store snapshot promise settles only after releasing its lease; failures discard without BEGIN/rollback or false unknown-account',async()=>{
  let active=0,releases=0,verify=0;const statements:string[]=[];const failure=Error('synthetic query failure');let fail=false;
  const store=new PostgresAuthenticationStore({async connect(){active++;return{async query(sql:string){statements.push(sql);assert.equal(active,1);assert.match(sql,/auth:login-snapshot/);assert.doesNotMatch(sql,/FOR UPDATE|FOR SHARE|BEGIN/);if(fail)throw failure;return{rows:[{account_id:accountId,login_name:initial.loginName,password_hash:'old',auth_version:1}],rowCount:1};},release(error){active--;releases++;assert.equal(error,fail?failure:undefined);}};}});
  const service=createAuthenticationService({store,now:()=>time,policy:createSourceAuthenticationPolicy(3600),passwords:createAuthenticationPasswordWork({async verify(){assert.equal(active,0);verify++;return false;},async hash(){assert.fail('Not used');}},createPasswordWorkGate({maxConcurrent:1,maxAnonymous:1,retryAfterSeconds:1}),{supports:()=>true,dummyHash:'dummy'})});
  await assert.rejects(service.login(initial.loginName,old),{code:'INVALID_CREDENTIALS'});assert.equal(releases,1);fail=true;
  await assert.rejects(service.login(initial.loginName,old),error=>error===failure);assert.equal(active,0);assert.equal(releases,2);assert.equal(verify,1);assert.equal(statements.length,2);
});
test('actual own-password snapshot uses one unlocked statement and releases before any codec; missing hall is unavailable, never invented',async()=>{
  let leases=0,releases=0;const sqls:string[]=[];
  const store=new PostgresAuthenticationStore({async connect(){leases++;return{async query(sql:string,values?:unknown[]){
    sqls.push(sql);assert.match(sql,/auth:password-snapshot/);assert.doesNotMatch(sql,/FOR UPDATE|FOR SHARE|BEGIN/);assert.deepEqual(values,[tokenHash]);
    return{rows:[{account_id:accountId,staff_id:staffId,login_name:initial.loginName,password_hash:'old',login_enabled:true,auth_version:1,role:'ADMIN',employment_status:'在职',hall_id:'00000000-0000-4000-8000-000000000003',hall_enabled:null,staff_name:'合成员工',token_hash:tokenHash,session_account_id:accountId,session_auth_version:1,created_at:time,expires_at:later,revoked_at:null}],rowCount:1};
  },release(){leases--;releases++;}};}});
  const snapshot=await store.readPasswordChangeSnapshot(tokenHash);assert.equal(leases,0);assert.equal(releases,1);assert.equal(sqls.length,1);assert.equal(snapshot?.account.hallEnabled,false);assert.equal(snapshot?.session.accountId,accountId);
});
test('cancelled own-password hashing settles once without entering the final transaction or changing any account/session',async()=>{
  const entered=deferred<void>(),finish=deferred<string>(),abort=new AbortController();const f=setup({hash:async()=>{entered.resolve();return finish.promise;}});
  const pending=f.service.changeOwnPassword(token,old,next,abort.signal);await entered.promise;abort.abort();assert.equal(f.store.transactions,0);
  finish.resolve('new');await assert.rejects(pending,{code:'AUTHENTICATION_CANCELLED'});assert.equal(f.store.transactions,0);assert.equal(f.store.account.passwordHash,'old');assert.equal(f.store.sessions.get(tokenHash)?.revokedAt,null);
});
test('codec failures propagate without a final transaction, successful session or credential update',async()=>{
  const failure=Error('synthetic native codec failure'),verify=setup({verify:async()=>{throw failure;}}),hash=setup({hash:async()=>{throw failure;}});
  await assert.rejects(verify.service.login(initial.loginName,old),error=>error===failure);assert.equal(verify.store.transactions,0);
  await assert.rejects(hash.service.changeOwnPassword(token,old,next),error=>error===failure);assert.equal(hash.store.transactions,0);assert.equal(hash.store.account.passwordHash,'old');
});
test('login and password-change final COMMIT ambiguity preserves the original error without replaying work or making an outcome claim',async()=>{
  for(const kind of ['login','password']as const){
    const f=setup(),failure=Error('synthetic ambiguous COMMIT'),original=f.store.transaction.bind(f.store);
    f.store.transaction=async work=>{await original(work);throw failure;};
    await assert.rejects(kind==='login'?f.service.login(initial.loginName,old):f.service.changeOwnPassword(token,old,next),error=>error===failure);
    assert.equal(f.store.transactions,1);assert.equal(f.store.commits,1);
    assert.deepEqual(f.counts(),kind==='login'?{verify:1,hash:0}:{verify:1,hash:1});
    // The fixture intentionally models a possibly committed operation. Do not pretend it rolled back.
    assert.equal(kind==='login'?f.store.events.filter(e=>e==='insert').length:f.store.changes,1);
  }
});
