/** T45-only new synthetic target. This runner NEVER creates/migrates/grants/seeds/drops a database.
 * Missing authorization/configuration is a failure, not a skipped performance acceptance.
 * It verifies the actual PG adapter's unlocked CPU phase and emits bounded same-fixture observations.
 * Public-proxy/source authenticity and production SLO acceptance still require the actual host owner.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { PostgresAuthenticationStore } from '../../adapters/postgres/src/auth-store.ts';
import { createAuthenticationService, sessionTokenHash } from '../../packages/authentication/src/service.ts';
import { createSourceAuthenticationPolicy } from '../../packages/authentication/src/source-policy.ts';
import { createNodeMigratedLegacyPasswords, isNodeMigratedPasswordHash } from '../../packages/authentication/src/legacy-passwords.ts';
import { createNodeScryptPasswords, isNodeScryptPasswordHash, NODE_SCRYPT_DUMMY_HASH } from '../../packages/authentication/src/passwords.ts';
import { createAuthenticationPasswordWork, createPasswordWorkGate } from '../../packages/authentication/src/password-work-gate.ts';
import { createLoginAdmission } from '../../apps/api/src/login-admission.ts';
import type { LoginRateBudget } from '../../apps/api/src/login-admission.ts';

interface Scenario {
  readonly syntheticOnly: true;
  readonly database: string; readonly databaseOid: string; readonly runtimeRole: string; readonly postmasterStart: string;
  readonly accountId: string; readonly loginName: string; readonly password: string; readonly newPassword: string;
  readonly codec: 'scrypt' | 'legacy-pbkdf2-v1'; readonly sessionTtlSeconds: number;
  readonly poolMax: number; readonly connectionTimeoutMillis: number; readonly statementTimeoutMillis: number; readonly lockTimeoutMillis: number;
  readonly passwordWork: {maxConcurrent:number;maxAnonymous:number;retryAfterSeconds:number};
  readonly admission: {global:LoginRateBudget;source:LoginRateBudget;sourceAccount:LoginRateBudget;entryTtlMillis:number;maxEntries:number;maxRetryAfterSeconds:number};
  readonly load: {requests:number;concurrency:number;wrongPerNormal:number};
  readonly slo: {loginP95Millis:number;loginP99Millis:number;sessionReadP95Millis:number;sessionReadP99Millis:number;maxLeaseMillis:number};
  readonly before: {actualMeasured:true;databaseOid:string;codec:Scenario['codec'];requests:number;concurrency:number;
    loginP95Millis:number;loginP99Millis:number;sessionReadP95Millis:number;sessionReadP99Millis:number};
}
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};
const positive=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;

test('P02 approved nonowner PG: released snapshots, mutable-state races and fixed-cost bounded authentication load', {timeout:120000},async()=>{
  assert.equal(process.env.NAIJUE_P02_SYNTHETIC_AUTHORIZATION,'CONFIRMED_NEW_ISOLATED','Explicit new synthetic target authorization required; no old sealed/R1/P04 target');
  const filename=process.env.NAIJUE_P02_PRIVATE_SCENARIO,url=process.env.NAIJUE_P02_RUNTIME_URL;
  assert.ok(filename&&path.isAbsolute(filename)&&url,'Private local scenario and original nonowner URL must be supplied by T45');
  const stat=statSync(filename);assert.ok(stat.isFile()&&(stat.mode&0o077)===0&&stat.size<=65536,'Bounded owner-private scenario file required');
  const scenario=JSON.parse(readFileSync(filename,'utf8')) as Scenario;
  assert.equal(scenario.syntheticOnly,true);assert.match(scenario.database,/^naijue_erp_test_p02_[a-z0-9_]+$/);assert.match(scenario.runtimeRole,/^p02_runtime_[a-z0-9_]+$/);
  const target=new URL(url);
  assert.ok(['postgres:','postgresql:'].includes(target.protocol)&&['127.0.0.1','localhost','[::1]'].includes(target.hostname));
  assert.equal(decodeURIComponent(target.pathname.slice(1)),scenario.database);assert.equal(decodeURIComponent(target.username),scenario.runtimeRole);
  assert.ok(target.password&&target.port&&!target.search&&!target.hash,'Explicit loopback port and private runtime credentials only, no query-option fallback');
  for(const value of [scenario.sessionTtlSeconds,scenario.poolMax,scenario.connectionTimeoutMillis,scenario.statementTimeoutMillis,scenario.lockTimeoutMillis,
    scenario.load?.requests,scenario.load?.concurrency,scenario.load?.wrongPerNormal,...Object.values(scenario.slo??{})])assert.ok(positive(value),'Explicit finite target/codec/load/SLO values required');
  assert.ok(scenario.poolMax>=2&&scenario.load.concurrency<=scenario.poolMax&&scenario.load.requests<=10000,'Finite independently approved load/observer capacity required');
  assert.ok(['scrypt','legacy-pbkdf2-v1'].includes(scenario.codec));assert.notEqual(scenario.password,scenario.newPassword);
  const before=scenario.before;assert.equal(before?.actualMeasured,true,'Original actual before baseline required, never estimated or invented here');
  assert.equal(before.databaseOid,scenario.databaseOid);assert.equal(before.codec,scenario.codec);assert.equal(before.requests,scenario.load.requests);assert.equal(before.concurrency,scenario.load.concurrency);
  for(const name of ['loginP95Millis','loginP99Millis','sessionReadP95Millis','sessionReadP99Millis']as const)assert.ok(typeof before[name]==='number'&&Number.isFinite(before[name])&&before[name]>=0);
  const pool=new Pool({connectionString:url,max:scenario.poolMax,connectionTimeoutMillis:scenario.connectionTimeoutMillis,
    statement_timeout:scenario.statementTimeoutMillis,lock_timeout:scenario.lockTimeoutMillis});
  let leases=0,maxLeases=0,maxLeaseMillis=0,maxPoolWaiting=0,workActive=0,maxWork=0,held=false;
  const operation=new AsyncLocalStorage<{leases:number}>();
  const ownSessions:string[]=[];
  const tracked={async connect(){const raw=await pool.connect(),start=performance.now(),scope=operation.getStore();leases++;if(scope)scope.leases++;maxLeases=Math.max(maxLeases,leases);maxPoolWaiting=Math.max(maxPoolWaiting,pool.waitingCount);let returned=false;
    return{query:(sql:string,values?:unknown[])=>raw.query(sql,values),release(error?:Error|boolean){assert.equal(returned,false);returned=true;leases--;if(scope)scope.leases--;maxLeaseMillis=Math.max(maxLeaseMillis,performance.now()-start);raw.release(error);}};}};
  const store=new PostgresAuthenticationStore(tracked),raw=scenario.codec==='scrypt'?createNodeScryptPasswords():createNodeMigratedLegacyPasswords();
  let barrier:{entered:ReturnType<typeof deferred<void>>;finish:ReturnType<typeof deferred<void>>;phase:'verify'|'hash'}|undefined;
  const observed={async verify(password:string,encoded:string){assert.equal(operation.getStore()?.leases,0,'This codec operation cannot retain its own store lease; unrelated concurrent reads may hold theirs');workActive++;maxWork=Math.max(maxWork,workActive);try{if(barrier?.phase==='verify'){held=true;barrier.entered.resolve();await barrier.finish.promise;held=false;}return await raw.verify(password,encoded);}finally{workActive--; }},
    async hash(password:string){assert.equal(operation.getStore()?.leases,0,'This codec operation cannot retain its own store lease');workActive++;maxWork=Math.max(maxWork,workActive);try{if(barrier?.phase==='hash'){held=true;barrier.entered.resolve();await barrier.finish.promise;held=false;}return await raw.hash(password);}finally{workActive--;}}};
  const gate=createPasswordWorkGate(scenario.passwordWork),admission=createLoginAdmission({...scenario.admission,now:()=>performance.now()});
  const passwords=createAuthenticationPasswordWork(observed,gate,{supports:scenario.codec==='scrypt'?isNodeScryptPasswordHash:isNodeMigratedPasswordHash,dummyHash:NODE_SCRYPT_DUMMY_HASH});
  const original=createAuthenticationService({store,now:()=>new Date().toISOString(),policy:createSourceAuthenticationPolicy(scenario.sessionTtlSeconds),passwords});
  const service={...original,login:(...args:Parameters<typeof original.login>)=>operation.run({leases:0},()=>original.login(...args)),
    changeOwnPassword:(...args:Parameters<typeof original.changeOwnPassword>)=>operation.run({leases:0},()=>original.changeOwnPassword(...args))};
  const expectedIdentity=async(client:PoolClient)=>{
    const i=(await client.query(`SELECT current_database() db,current_user role,session_user,
      (SELECT oid::text FROM pg_database WHERE datname=current_database()) oid,pg_postmaster_start_time()::text postmaster,
      (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) elevated,
      (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='naijue_erp.user_account'::regclass) owner`)).rows[0];
    assert.equal(i.db,scenario.database);assert.equal(i.oid,scenario.databaseOid);assert.equal(i.role,scenario.runtimeRole);assert.equal(i.session_user,i.role);assert.equal(i.postmaster,scenario.postmasterStart);assert.equal(i.elevated,false);assert.notEqual(i.owner,i.role);
  };
  const ownLogin=async()=>{const value=await service.login(scenario.loginName,scenario.password);assert.equal(value.principal.accountId,scenario.accountId);ownSessions.push(value.token);return value;};
  try{
    const c=await pool.connect();try{await expectedIdentity(c);}finally{c.release();}
    // Baseline credentials belong to the separately prepared original synthetic account, never seeded here.
    const normal=await ownLogin();
    barrier={entered:deferred<void>(),finish:deferred<void>(),phase:'verify'};
    const pending=service.login(scenario.loginName,scenario.password);await barrier.entered.promise;
    assert.equal(held,true);assert.equal(leases,0);
    const updater=await pool.connect();try{
      await updater.query('BEGIN');
      // NOWAIT proves all original account/staff/hall locks are available while codec is suspended.
      await updater.query('SELECT a.id FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id WHERE a.id=$1::uuid FOR UPDATE OF a,s NOWAIT',[scenario.accountId]);
      await updater.query('SELECT h.id FROM naijue_erp.hall h JOIN naijue_erp.staff s ON s.hall_id=h.id JOIN naijue_erp.user_account a ON a.staff_id=s.id WHERE a.id=$1::uuid FOR UPDATE OF h NOWAIT',[scenario.accountId]);
      await updater.query('UPDATE naijue_erp.user_account SET auth_version=auth_version+1,version=version+1 WHERE id=$1::uuid',[scenario.accountId]);
      await updater.query('COMMIT');
    }catch(error){await updater.query('ROLLBACK');throw error;}finally{updater.release();barrier.finish.resolve();}
    await assert.rejects(pending,{code:'INVALID_CREDENTIALS'});barrier=undefined;
    assert.equal(await service.resolve(normal.token),null,'Changed authVersion invalidates original session');
    const fresh=await ownLogin();
    barrier={entered:deferred<void>(),finish:deferred<void>(),phase:'hash'};
    const change=service.changeOwnPassword(fresh.token,scenario.password,scenario.newPassword);await barrier.entered.promise;
    assert.equal(leases,0);await service.logout(fresh.token);barrier.finish.resolve();
    await assert.rejects(change,{code:'UNAUTHENTICATED'});barrier=undefined;
    const active=await ownLogin();const sessionTimes:number[]=[],loginTimes:number[]=[];let limited=0,incorrect=0;
    const cpuBefore=process.cpuUsage();let cursor=0;
    await Promise.all(Array.from({length:scenario.load.concurrency},async()=>{
      while(cursor<scenario.load.requests){const index=cursor++;if(index%scenario.load.wrongPerNormal===0){const start=performance.now();assert.ok(await service.resolve(active.token));sessionTimes.push(performance.now()-start);continue;}
        let permit:ReturnType<typeof admission.acquire>|undefined;const start=performance.now();
        try{permit=admission.acquire(`synthetic-socket-${index%scenario.load.concurrency}`,scenario.loginName);
          await service.login(scenario.loginName,scenario.password+'-incorrect');assert.fail('Wrong password cannot issue a session');
        }catch(error){const code=(error as{code?:string}).code;if(code==='INVALID_CREDENTIALS'){incorrect++;loginTimes.push(performance.now()-start);}else if(code==='LOGIN_ADMISSION_BUSY'||code==='PASSWORD_WORK_BUSY')limited++;else throw error;
        }finally{permit?.release();}
      }
    }));
    const cpu=process.cpuUsage(cpuBefore),percentile=(values:number[],fraction:number)=>{assert.ok(values.length,'Actual sample required; all-rejected load is not performance PASS');return[...values].sort((a,b)=>a-b)[Math.ceil(values.length*fraction)-1]!;};
    const metrics={loginP95Millis:percentile(loginTimes,.95),loginP99Millis:percentile(loginTimes,.99),sessionReadP95Millis:percentile(sessionTimes,.95),sessionReadP99Millis:percentile(sessionTimes,.99),maxLeaseMillis,maxLeases,maxPoolWaiting,maxPasswordWork:maxWork,incorrect,limited,cpuUserMicros:cpu.user,cpuSystemMicros:cpu.system};
    for(const key of ['loginP95Millis','loginP99Millis','sessionReadP95Millis','sessionReadP99Millis','maxLeaseMillis']as const)assert.ok(metrics[key]<=scenario.slo[key],`Approved ${key} not met`);
    assert.ok(maxWork<=scenario.passwordWork.maxConcurrent);assert.equal(leases,0);
    const baseline={loginP95Millis:before.loginP95Millis,loginP99Millis:before.loginP99Millis,sessionReadP95Millis:before.sessionReadP95Millis,sessionReadP99Millis:before.sessionReadP99Millis};
    console.log(JSON.stringify({taskId:'P02',scope:'APPROVED_SYNTHETIC_ADAPTER_RACES_AND_SESSION_READ_LOAD_ONLY',before:baseline,after:metrics,
      notMeasured:['public proxy/real source identity/direct-access firewall','normal business page read SLO','all role/employment/hall/expiry races on actual PG','whole deployment capacity']}));
  }finally{
    barrier?.finish.resolve();
    try { for(const session of ownSessions)await service.logout(session);assert.equal(leases,0); }
    finally { await pool.end(); }
  }
});
