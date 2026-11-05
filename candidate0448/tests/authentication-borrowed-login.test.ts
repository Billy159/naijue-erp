/** Protocol/codec tests only. No PostgreSQL, credentials, grants or engine proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {withAuthenticationInCurrentTransaction,sessionTokenHash} from '../packages/authentication/src/service.ts';
import {withPostgresAuthenticationInCurrentTransaction} from '../adapters/postgres/src/auth-store.ts';
import type {PgBorrowedAuthenticationContext} from '../adapters/postgres/src/auth-store.ts';
import type {BorrowedAuthenticationLoginStore,BorrowedAuthenticationCredentials,ProvisionalAuthenticationSession,AuthenticationLoginTransaction} from '../packages/authentication/src/ports.ts';
import {createNodeScryptPasswords,isNodeScryptPasswordHash,NODE_SCRYPT_DUMMY_HASH} from '../packages/authentication/src/passwords.ts';
import {createAuthenticationPasswordWork,createPasswordWorkGate} from '../packages/authentication/src/password-work-gate.ts';
import {createSourceAuthenticationPolicy} from '../packages/authentication/src/source-policy.ts';
import {entityId} from '../packages/domain/src/values.ts';

const ACCOUNT=entityId('account','00000000-0000-4000-8000-000000000001'),STAFF=entityId('staff','00000000-0000-4000-8000-000000000002');
const OTHER='00000000-0000-4000-8000-000000000003',PASSWORD='SYNTHETIC_ONLY_20261103',NOW='2026-11-03T06:50:00.000Z';
const RUNTIME='erp_unified27_runtime_2393dbc6db9581c2',IMPORTER='erp_unified27_importer_2393dbc6db9581c2';
const codec=createNodeScryptPasswords(),passwordHash=await codec.hash(PASSWORD);
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return{promise,resolve};}
function fixture(){
 const calls:{sql:string;values:unknown[]}[]=[],sessions:unknown[][]=[];
 let wire:string|null='T',callbackCount=0,permitValid=true,permitChecks=0;
 let verified:(()=>void|Promise<void>)|undefined,queryHook:((sql:string)=>void|Promise<void>)|undefined;
 const identity:Record<string,unknown>={backend_pid:4101,transaction_id:'90071992547409930',controller:'synthetic-controller',current_user:RUNTIME,selected_role:RUNTIME,isolation:'read committed',read_only:'off',row_security:'on',replication_role:'origin',safe_runtime_role:true};
 const snapshot:Record<string,unknown>={account_id:ACCOUNT,login_name:'synthetic-admin',password_hash:passwordHash,auth_version:1};
 const account:Record<string,unknown>={...snapshot,staff_id:STAFF,login_enabled:true,role:'ADMIN',employment_status:'在职',hall_id:null,staff_name:'Synthetic Admin'};
 let missingSnapshot=false,insertCount=1;let observed:ProvisionalAuthenticationSession|undefined;
 const client={getTransactionStatus:()=>wire,async query(sql:string,values:unknown[]=[]){
  calls.push({sql,values:[...values]});await queryHook?.(sql);
  if(sql.includes('auth:borrowed-context'))return{rows:[{...identity}],rowCount:1};
  if(sql.includes('auth:login-snapshot'))return{rows:missingSnapshot?[]:[{...snapshot}],rowCount:missingSnapshot?0:1};
  if(sql.includes('FOR UPDATE OF a, s'))return{rows:[{...account}],rowCount:1};
  if(sql.startsWith('SELECT enabled FROM'))return{rows:[{enabled:true}],rowCount:1};
  if(sql.startsWith('INSERT INTO naijue_erp.auth_session')){sessions.push([...values]);return{rows:[],rowCount:insertCount};}
  throw Error('Unexpected synthetic auth SQL');
 }};
 const context:PgBorrowedAuthenticationContext={client,backendPid:4101,transactionId:'90071992547409930',controller:'synthetic-controller',runtimeRole:RUNTIME};
 const credentials:BorrowedAuthenticationCredentials={loginName:'synthetic-admin',password:PASSWORD,accountId:ACCOUNT,staffId:STAFF};
 const passwords=createAuthenticationPasswordWork({hash:codec.hash,async verify(password:string,encoded:string){const ok=await codec.verify(password,encoded);await verified?.();return ok;}},createPasswordWorkGate({maxConcurrent:1,maxAnonymous:1,retryAfterSeconds:1}),{supports:isNodeScryptPasswordHash,dummyHash:NODE_SCRYPT_DUMMY_HASH});
 const issuance={kind:'PARENT_HELD_CAPACITY' as const,assertValid(){permitChecks++;if(!permitValid)throw Error('SYNTHETIC_CAPACITY_EXPIRED');}};
 const dependencies={now:()=>NOW,policy:createSourceAuthenticationPolicy(900),passwords,issuance};
 async function run(callback:(session:ProvisionalAuthenticationSession)=>Promise<void>=async()=>{}):Promise<void>{
  await withPostgresAuthenticationInCurrentTransaction(context,store=>withAuthenticationInCurrentTransaction({...dependencies,store},credentials,async session=>{
   callbackCount++;observed=session;await callback(session);
  }));
 }
 return{calls,sessions,identity,snapshot,account,client,context,credentials,dependencies,run,
  get callbackCount(){return callbackCount;},get observed(){return observed;},get permitChecks(){return permitChecks;},
  set wire(value:string|null){wire=value;},set permitValid(value:boolean){permitValid=value;},
  set verified(value:typeof verified){verified=value;},set queryHook(value:typeof queryHook){queryHook=value;},
  set missingSnapshot(value:boolean){missingSnapshot=value;},set insertCount(value:number){insertCount=value;}};
}
function noOwnership(f:ReturnType<typeof fixture>){
 assert.equal(f.calls.some(c=>/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|SET)\b/.test(c.sql)),false);
 assert.equal('connect'in f.client,false);assert.equal('release'in f.client,false);
}
test('real borrowed login retains source policy/locks/random token/hash and original full xid without transaction ownership',async()=>{
 const f=fixture();const returned=await f.run(async session=>{
  assert.equal(session.state,'PROVISIONAL_CURRENT_TRANSACTION');assert.equal(session.principal.accountId,ACCOUNT);
  assert.equal(session.principal.staffId,STAFF);assert.equal(session.principal.role,'ADMIN');assert.equal(session.principal.authVersion,1);assert.equal(session.principal.hallId,null);
  assert.match(session.token,/^[A-Za-z0-9_-]{43}$/);assert.equal(f.sessions[0]![0],sessionTokenHash(session.token));
  assert.equal(f.calls.some(c=>c.values.includes(session.token)||c.values.includes(PASSWORD)),false);
  f.identity.current_user=IMPORTER;f.identity.selected_role=IMPORTER;
 });
 assert.equal(returned,undefined);assert.equal(f.callbackCount,1);assert.equal(f.sessions.length,1);
 assert.ok(f.permitChecks>=5);assert.ok(f.calls.some(c=>c.sql.includes('FOR UPDATE OF a, s')));
 assert.equal(f.calls.some(c=>c.sql.startsWith('SELECT enabled FROM')),false);noOwnership(f);
});
test('isolated capacity-free mode must be deliberately named; ordinary admission acquire/release is never used',async()=>{
 const f=fixture();await withPostgresAuthenticationInCurrentTransaction(f.context,store=>withAuthenticationInCurrentTransaction({...f.dependencies,store,issuance:{kind:'ISOLATED_SYNTHETIC_NO_CAPACITY_POLICY'}},f.credentials,async()=>{}));assert.equal(f.permitChecks,0);noOwnership(f);
});
for(const variant of ['wrong-password','missing-account','malformed-hash'] as const)test('no session or callback for '+variant,async()=>{
 const f=fixture();if(variant==='wrong-password')(f.credentials as {password:string}).password=PASSWORD+'wrong';
 if(variant==='missing-account')f.missingSnapshot=true;if(variant==='malformed-hash')f.snapshot.password_hash='not-a-password-hash';
 await assert.rejects(f.run(),{code:'INVALID_CREDENTIALS'});assert.equal(f.sessions.length,0);assert.equal(f.callbackCount,0);noOwnership(f);
});
for(const[key,value]of [['account_id',OTHER],['staff_id',OTHER],['login_name','other-admin'],['login_enabled',false],['role','SALESPERSON'],['role','UNKNOWN'],['employment_status','离职'],['auth_version',2],['password_hash','invalid'],['hall_id',OTHER]] as const)test('locked current INIT binding rejects '+key+'='+String(value),async()=>{
 const f=fixture();f.verified=()=>{f.account[key]=value;};await assert.rejects(f.run(),{code:'INVALID_CREDENTIALS'});assert.equal(f.sessions.length,0);assert.equal(f.callbackCount,0);noOwnership(f);
});
for(const[key,value]of [['backend_pid',4102],['transaction_id','90071992547409931'],['transaction_id',null],['controller','other-controller'],['current_user',IMPORTER],['selected_role','none'],['isolation','repeatable read'],['read_only','on'],['row_security','off'],['replication_role','replica'],['safe_runtime_role',false]] as const)test('native current transaction rejects '+key,async()=>{
 const f=fixture();f.identity[key]=value;await assert.rejects(f.run(),/Borrowed authentication/);assert.equal(f.sessions.length,0);assert.equal(f.callbackCount,0);
 assert.equal(f.calls.filter(c=>!c.sql.includes('auth:borrowed-context')).length,0);noOwnership(f);
});
for(const status of ['I','E',null])test('non-active native transaction state '+String(status)+' stops before query',async()=>{const f=fixture();f.wire=status;await assert.rejects(f.run(),/Borrowed authentication/);assert.equal(f.calls.length,0);});
test('wrong initial caller binding and noncanonical/overflow full xids reject without driver queries',async()=>{
 for(const transactionId of ['0','01','-1','1.0','18446744073709551616']){const f=fixture();await assert.rejects(withPostgresAuthenticationInCurrentTransaction({...f.context,transactionId},async()=>{}),/Original private/);assert.equal(f.calls.length,0);}
});
test('role/identity changes during real password work cannot reach insert',async()=>{const f=fixture();f.verified=()=>{f.identity.current_user=IMPORTER;f.identity.selected_role=IMPORTER;};await assert.rejects(f.run(),/Borrowed authentication/);assert.equal(f.sessions.length,0);assert.equal(f.callbackCount,0);});
test('binding/credential configuration is copied before an await',async()=>{
 const f=fixture();f.verified=()=>{Object.assign(f.context,{backendPid:999,transactionId:'2',controller:'other',runtimeRole:'other'});Object.assign(f.credentials,{accountId:OTHER,staffId:OTHER,loginName:'other',password:'other'});};
 await f.run();assert.equal(f.callbackCount,1);assert.equal(f.sessions[0]![1],ACCOUNT);
});
test('context change after INSERT rejects without claiming rollback or invoking callback',async()=>{const f=fixture();f.queryHook=sql=>{if(sql.startsWith('INSERT'))f.identity.transaction_id='90071992547409931';};await assert.rejects(f.run(),/Borrowed authentication/);assert.equal(f.sessions.length,1);assert.equal(f.callbackCount,0);noOwnership(f);});
test('insert row count failure remains parent rollback responsibility',async()=>{const f=fixture();f.insertCount=0;await assert.rejects(f.run(),/Session was not persisted/);assert.equal(f.callbackCount,0);noOwnership(f);});
test('capacity expiry after INSERT propagates without release, callback or inner rollback',async()=>{const f=fixture();f.queryHook=sql=>{if(sql.startsWith('INSERT'))f.permitValid=false;};await assert.rejects(f.run(),/SYNTHETIC_CAPACITY_EXPIRED/);assert.equal(f.sessions.length,1);assert.equal(f.callbackCount,0);noOwnership(f);});
test('cancellation after INSERT propagates, never returning a successful session',async()=>{const f=fixture(),abort=new AbortController();f.queryHook=sql=>{if(sql.startsWith('INSERT'))abort.abort();};await assert.rejects(withPostgresAuthenticationInCurrentTransaction(f.context,store=>withAuthenticationInCurrentTransaction({...f.dependencies,store},f.credentials,async()=>{assert.fail('No callback');},abort.signal)),{code:'AUTHENTICATION_CANCELLED'});assert.equal(f.sessions.length,1);noOwnership(f);});
test('callback throw preserves original failure and leaves all rollback to parent',async()=>{const f=fixture(),failure=Error('SYNTHETIC_IMPORT_FAILURE');await assert.rejects(f.run(async()=>{throw failure;}),e=>e===failure);assert.equal(f.sessions.length,1);noOwnership(f);});
test('ending outer transaction inside callback is detected without leaf rollback/retry',async()=>{const f=fixture();await assert.rejects(f.run(async()=>{f.wire='I';}),/Borrowed authentication/);assert.equal(f.sessions.length,1);noOwnership(f);});
test('caught login failure poisons scope and escaped store fails after closing without driver calls',async()=>{
 const f=fixture();let escaped!:BorrowedAuthenticationLoginStore;
 await assert.rejects(withPostgresAuthenticationInCurrentTransaction(f.context,async store=>{escaped=store;await withAuthenticationInCurrentTransaction({...f.dependencies,store},{...f.credentials,password:PASSWORD+'wrong'},async()=>{}).catch(()=>{});}),{code:'INVALID_CREDENTIALS'});
 const count=f.calls.length;await assert.rejects(escaped.runInCurrentTransaction(async()=>{}));assert.equal(f.calls.length,count);
});
test('escaped transaction facade cannot query after its lock callback closes',async()=>{
 const f=fixture();let escaped!:AuthenticationLoginTransaction;
 await withPostgresAuthenticationInCurrentTransaction(f.context,store=>store.runInCurrentTransaction(async operations=>{await operations.readLoginSnapshot('synthetic-admin');await operations.withLockedAccount(async tx=>{escaped=tx;await tx.getAccount(ACCOUNT);});}));
 const count=f.calls.length;await assert.rejects(escaped.getAccount(ACCOUNT),/closed/);assert.equal(f.calls.length,count);
});
test('reentrant scope use is sticky even if caller catches it',async()=>{
 const f=fixture();await assert.rejects(withPostgresAuthenticationInCurrentTransaction(f.context,async store=>{
  const first=withAuthenticationInCurrentTransaction({...f.dependencies,store},f.credentials,async()=>{});
  const second=store.runInCurrentTransaction(async()=>{});await Promise.allSettled([first,second]);
 }),/Borrowed authentication/);assert.equal(f.callbackCount,0);noOwnership(f);
});
test('unawaited whole login remains tracked until real password work settles',async()=>{
 const f=fixture(),entered=deferred(),release=deferred();let settled=false;
 f.verified=async()=>{entered.resolve();await release.promise;};
 const pending=withPostgresAuthenticationInCurrentTransaction(f.context,async store=>{void withAuthenticationInCurrentTransaction({...f.dependencies,store},f.credentials,async()=>{});}).then(()=>{settled=true;});
 await entered.promise;assert.equal(settled,false);release.resolve();await pending;assert.equal(f.sessions.length,1);noOwnership(f);
});
test('unawaited leaf query is drained before failure returns and no later driver query is permitted',async()=>{
 const f=fixture(),entered=deferred(),release=deferred();let settled=false;
 f.queryHook=async sql=>{if(sql.includes('FOR UPDATE OF a, s')){entered.resolve();await release.promise;}};
 const pending=withPostgresAuthenticationInCurrentTransaction(f.context,store=>store.runInCurrentTransaction(async operations=>{
  await operations.readLoginSnapshot('synthetic-admin');await operations.withLockedAccount(async tx=>{void tx.getAccount(ACCOUNT);await entered.promise;});
 })).catch(()=>{settled=true;});
 await entered.promise;await new Promise(resolve=>setTimeout(resolve,0));assert.equal(settled,false);release.resolve();await pending;assert.equal(settled,true);noOwnership(f);
});
test('synchronous pre-acquired capacity assertion rejects an async permit instead of opening a lazy probe',async()=>{
 const f=fixture();await assert.rejects(withPostgresAuthenticationInCurrentTransaction(f.context,store=>withAuthenticationInCurrentTransaction({...f.dependencies,store,issuance:{kind:'PARENT_HELD_CAPACITY',assertValid:()=>Promise.resolve() as unknown as void}},f.credentials,async()=>{})),/Synchronous parent-held/);assert.equal(f.sessions.length,0);noOwnership(f);
});
test('callback return values including a token are not returned by either borrowed factory',async()=>{
 const f=fixture();const result=await withPostgresAuthenticationInCurrentTransaction(f.context,store=>withAuthenticationInCurrentTransaction({...f.dependencies,store},f.credentials,async session=>session.token as unknown as void));assert.equal(result,undefined);
});
test('wrapper rechecks active native state after outer work finishes beyond awaited login',async()=>{
 const f=fixture();await assert.rejects(withPostgresAuthenticationInCurrentTransaction(f.context,async store=>{
  await withAuthenticationInCurrentTransaction({...f.dependencies,store},f.credentials,async()=>{});f.wire='I';
 }),/Borrowed authentication/);noOwnership(f);
});
test('wrapper rechecks full original xid after outer work finishes beyond awaited login',async()=>{
 const f=fixture();await assert.rejects(withPostgresAuthenticationInCurrentTransaction(f.context,async store=>{
  await withAuthenticationInCurrentTransaction({...f.dependencies,store},f.credentials,async()=>{});f.identity.transaction_id='90071992547409931';
 }),/Borrowed authentication/);noOwnership(f);
});
test('NEW_EMPTY binding requires actual active staff even if a broader host policy accepts inactive staff',async()=>{
 const f=fixture();f.verified=()=>{f.account.employment_status='离职';};
 await assert.rejects(withPostgresAuthenticationInCurrentTransaction(f.context,store=>withAuthenticationInCurrentTransaction({...f.dependencies,store,policy:{...f.dependencies.policy,activeEmploymentStatuses:['在职','离职']}},f.credentials,async()=>{assert.fail('No inactive INIT callback');})),{code:'INVALID_CREDENTIALS'});assert.equal(f.sessions.length,0);
});
test('invalid borrowed operation callback rejects before a native query',async()=>{
 const f=fixture();await assert.rejects(withPostgresAuthenticationInCurrentTransaction(f.context,store=>store.runInCurrentTransaction(undefined as never)));assert.equal(f.calls.length,0);
});
test('unawaited whole login failure is observed and still rejects the original borrowed owner',async()=>{
 const f=fixture();await assert.rejects(withPostgresAuthenticationInCurrentTransaction(f.context,async store=>{
  void withAuthenticationInCurrentTransaction({...f.dependencies,store},{...f.credentials,password:PASSWORD+'wrong'},async()=>{assert.fail('No wrong-password callback');});
 }),{code:'INVALID_CREDENTIALS'});assert.equal(f.sessions.length,0);noOwnership(f);
 await new Promise(resolve=>setTimeout(resolve,0));
});
test('escaped locked facade is closed before async postcheck and cannot overlap the context driver lane',async()=>{
 const f=fixture(),entered=deferred(),release=deferred();let escaped!:AuthenticationLoginTransaction,hold=false,held=false;
 f.queryHook=async sql=>{if(sql.includes('auth:borrowed-context')&&hold&&!held){held=true;entered.resolve();await release.promise;}};
 const pending=withPostgresAuthenticationInCurrentTransaction(f.context,store=>store.runInCurrentTransaction(async operations=>{
  await operations.readLoginSnapshot('synthetic-admin');await operations.withLockedAccount(async tx=>{escaped=tx;await tx.getAccount(ACCOUNT);hold=true;});
 }));
 void pending.catch(()=>{});await entered.promise;
 const count=f.calls.length;const escapedResult=await escaped.getAccount(ACCOUNT).then(()=>({rejected:false}),()=>({rejected:true}));
 release.resolve();const ownerResult=await pending.then(()=>({rejected:false}),()=>({rejected:true}));
 assert.equal(escapedResult.rejected,true);assert.equal(ownerResult.rejected,true);assert.equal(f.calls.length,count);noOwnership(f);
});
test('escaped session INSERT cannot mutate after locked callback ends during async postcheck',async()=>{
 const f=fixture(),entered=deferred(),release=deferred();let escaped!:AuthenticationLoginTransaction,hold=false,held=false;
 f.queryHook=async sql=>{if(sql.includes('auth:borrowed-context')&&hold&&!held){held=true;entered.resolve();await release.promise;}};
 const pending=withPostgresAuthenticationInCurrentTransaction(f.context,store=>store.runInCurrentTransaction(async operations=>{
  await operations.readLoginSnapshot('synthetic-admin');await operations.withLockedAccount(async tx=>{escaped=tx;await tx.getAccount(ACCOUNT);hold=true;});
 }));
 void pending.catch(()=>{});await entered.promise;
 const count=f.calls.length;const escapedResult=await escaped.insertSession({tokenHash:'a'.repeat(64),accountId:ACCOUNT,authVersion:1,createdAt:NOW,expiresAt:'2026-11-03T07:05:00.000Z',revokedAt:null}).then(()=>({rejected:false}),()=>({rejected:true}));
 release.resolve();const ownerResult=await pending.then(()=>({rejected:false}),()=>({rejected:true}));
 assert.equal(escapedResult.rejected,true);assert.equal(ownerResult.rejected,true);assert.equal(f.calls.length,count);assert.equal(f.sessions.length,0);noOwnership(f);
});
