/** Injected clocks, HTTP in-process routing and controlled workers only; no PG or deployment claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createLoginAdmission, LoginAdmissionRejected } from '../apps/api/src/login-admission.ts';
import { createAuthenticationHttpPlugin } from '../apps/api/src/authentication.ts';
import type { AuthenticationService } from '../packages/authentication/src/service.ts';
import { createAuthenticationPasswordWork, createPasswordWorkGate, gatePasswordCodec } from '../packages/authentication/src/password-work-gate.ts';
import { createNodeScryptPasswords, isNodeScryptPasswordHash, NODE_SCRYPT_DUMMY_HASH } from '../packages/authentication/src/passwords.ts';
import { isNodeMigratedPasswordHash } from '../packages/authentication/src/legacy-passwords.ts';

const rate = (burst: number) => ({burst, tokens: burst, intervalMillis: 1000});
const budgets = () => ({global: rate(100), source: rate(100), sourceAccount: rate(100), entryTtlMillis: 1000, maxEntries: 100, maxRetryAfterSeconds: 2});
const busy = (error: unknown) => error instanceof LoginAdmissionRejected && error.retryAfterSeconds >= 1 && error.retryAfterSeconds <= 2;
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return {promise, resolve}; };

for (const dimension of ['global', 'source', 'sourceAccount'] as const) test(`admission ${dimension}: rejects without refund tricks, refills with monotonic time`, () => {
  let now = 0; const config = {...budgets(), [dimension]: rate(1)};
  const limiter = createLoginAdmission({...config, now: () => now});
  limiter.acquire('socket-A', 'Exact Name').release();
  assert.throws(() => limiter.acquire('socket-A', 'Exact Name'), busy);
  now = 1000; limiter.acquire('socket-A', 'Exact Name').release();
});
test('source and source-account buckets remain independent; account in-flight is global and does not fold identity', () => {
  const limiter = createLoginAdmission({...budgets(), now: () => 0});
  const first = limiter.acquire('socket-A', 'Exact Name');
  assert.throws(() => limiter.acquire('socket-B', 'Exact Name'), busy);
  limiter.acquire('socket-A', 'exact name').release();
  limiter.acquire('socket-A', ' Exact Name').release();
  first.release(); first.release(); limiter.acquire('socket-B', 'Exact Name').release();
});
test('entry bound includes active accounts after bucket TTL expiry; attack stops without a permanent account lock', () => {
  let now = 0; const limiter = createLoginAdmission({...budgets(), maxEntries: 3, now: () => now});
  const held = limiter.acquire('source-A', 'account-A'); now = 1000;
  assert.throws(() => limiter.acquire('source-B', 'account-B'), busy);
  assert.throws(() => limiter.acquire('source-B', 'account-A'), busy);
  held.release(); limiter.acquire('source-B', 'account-A').release();
});
test('TTL cannot reset a bucket faster than full refill; clock regression and missing budgets cannot silently mint tokens', () => {
  assert.throws(() => createLoginAdmission({...budgets(), source: {burst: 10, tokens: 1, intervalMillis: 1000}, now: () => 0}), TypeError);
  assert.throws(() => createLoginAdmission({...budgets(), maxEntries: 2, now: () => 0}), TypeError);
  let now = 100; const limiter = createLoginAdmission({...budgets(), now: () => now}); limiter.acquire('A', 'B').release();
  now = 99; assert.throws(() => limiter.acquire('A', 'B'), TypeError);
});
test('external and internal login routes share pre-service admission; forged proxy headers cannot buy another source', async t => {
  let calls = 0;
  const admission = createLoginAdmission({...budgets(), global: rate(100), source: rate(1), now: () => 0});
  const service = {async login() { calls++; return {token: 'A'.repeat(43), principal: {}, expiresAt: '2026-10-29T20:00:00.000Z'}; },
    async resolve() {return null;},async logout(){},async changeOwnPassword(){}} as unknown as AuthenticationService;
  const app = Fastify({trustProxy:false});t.after(()=>app.close());
  const options = {service, trustedOrigin:'https://synthetic.invalid', loginAdmission:admission};
  app.register(createAuthenticationHttpPlugin(options));app.register(createAuthenticationHttpPlugin(options), {prefix:'/api'});await app.ready();
  const login = (url: string, name: string, forwarded: string) => app.inject({method:'POST', url, headers:{origin:options.trustedOrigin,'content-type':'application/json','x-forwarded-for':forwarded,'x-real-ip':forwarded}, payload:JSON.stringify({loginName:name,password:'synthetic'})});
  assert.equal((await login('/api/auth/login','A','198.51.100.1')).statusCode,200);
  const limited = await login('/auth/login','B','198.51.100.2');assert.equal(limited.statusCode,429);assert.equal(calls,1);
  assert.equal(limited.headers['set-cookie'],undefined);assert.ok(Number(limited.headers['retry-after'])>=1);
  assert.deepEqual(limited.json(),{error:{code:'AUTHENTICATION_BUSY',message:'Authentication capacity is temporarily unavailable'}});
});
test('login HTTP routes refuse a missing limiter instead of inventing a production budget', () => {
  const service={login(){},resolve(){},logout(){},changeOwnPassword(){}} as unknown as AuthenticationService;
  assert.throws(()=>createAuthenticationHttpPlugin({service,trustedOrigin:'https://synthetic.invalid'}),/explicit bounded login admission/);
});
test('CPU reserve is shared: anonymous saturation leaves authenticated capacity; abort never releases an unsettled native worker', async () => {
  const gate=createPasswordWorkGate({maxConcurrent:2,maxAnonymous:1,retryAfterSeconds:1}), work=deferred<boolean>(), abort=new AbortController();
  const running=gate.run('login',()=>work.promise,abort.signal);
  await assert.rejects(gate.run('login',async()=>true),{code:'PASSWORD_WORK_BUSY'});
  assert.equal(await gate.run('authenticated',async()=>42),42);
  abort.abort();await assert.rejects(gate.run('login',async()=>true),{code:'PASSWORD_WORK_BUSY'});
  work.resolve(true);await assert.rejects(running,{code:'AUTHENTICATION_CANCELLED'});
  assert.equal(await gate.run('login',async()=>true),true);
});
test('codec throw and rejected promise release their work exactly once; pre-cancelled requests never call codec', async () => {
  const gate=createPasswordWorkGate({maxConcurrent:1,maxAnonymous:1,retryAfterSeconds:1}), failure=Error('synthetic codec');let called=0;
  await assert.rejects(gate.run('login',()=>{throw failure;}),error=>error===failure);
  await assert.rejects(gate.run('authenticated',async()=>{throw failure;}),error=>error===failure);
  const abort=new AbortController();abort.abort();await assert.rejects(gate.run('login',async()=>{called++;},abort.signal),{code:'AUTHENTICATION_CANCELLED'});
  assert.equal(called,0);assert.equal(await gate.run('login',async()=>7),7);
});
test('known wrong password is one raw verify; absent/malformed hashes use one fixed dummy and never authenticate', async () => {
  const hashes:string[]=[];const gate=createPasswordWorkGate({maxConcurrent:2,maxAnonymous:1,retryAfterSeconds:1});
  const work=createAuthenticationPasswordWork({async verify(_password,encoded){hashes.push(encoded);return encoded==='dummy';},async hash(){return 'new';}},gate,{supports:value=>['known','dummy'].includes(value),dummyHash:'dummy'});
  assert.equal(await work.verify('wrong','known','login'),false);
  assert.equal(await work.verify('even-if-matches',undefined,'login'),false);
  assert.equal(await work.verify('even-if-matches','malformed','login'),false);
  assert.deepEqual(hashes,['known','dummy','dummy']);
});
test('authentication and maintenance codec facades consume the same global budget without nesting leases', async () => {
  const held=deferred<string>(),gate=createPasswordWorkGate({maxConcurrent:1,maxAnonymous:1,retryAfterSeconds:1});let calls=0;
  const raw={async verify(){calls++;return true;},hash(){calls++;return held.promise;}};
  const maintenance=gatePasswordCodec(raw,gate,'authenticated'),auth=createAuthenticationPasswordWork(raw,gate,{supports:()=>true,dummyHash:'fixed'});
  const hashing=maintenance.hash('synthetic');await assert.rejects(auth.verify('synthetic','known','login'),{code:'PASSWORD_WORK_BUSY'});
  assert.equal(calls,1);held.resolve('encoded');assert.equal(await hashing,'encoded');assert.equal(await auth.verify('synthetic','known','login'),true);
});
test('pure format recognizers preserve exact fixed costs and reject hostile/unknown work parameters', () => {
  assert.equal(isNodeScryptPasswordHash(NODE_SCRYPT_DUMMY_HASH),true);assert.equal(isNodeMigratedPasswordHash(NODE_SCRYPT_DUMMY_HASH),true);
  for(const cost of ['600000','210000'])assert.equal(isNodeMigratedPasswordHash(`naijue:pbkdf2-sha256:1:${cost}:${'a'.repeat(48)}:${'b'.repeat(64)}`),true);
  for(const value of [NODE_SCRYPT_DUMMY_HASH+'\n',NODE_SCRYPT_DUMMY_HASH.replace(':32768:',':1048576:'),'plaintext',`naijue:pbkdf2-sha256:1:999999999:${'a'.repeat(48)}:${'b'.repeat(64)}`])assert.equal(isNodeMigratedPasswordHash(value),false);
});
test('fixed dummy is an actual unchanged-cost scrypt vector; matching this public vector still cannot authenticate an absent account',async()=>{
  const raw=createNodeScryptPasswords(),value='naijue-authentication-dummy-v1-not-an-account';
  assert.equal(await raw.verify(value,NODE_SCRYPT_DUMMY_HASH),true);
  const work=createAuthenticationPasswordWork(raw,createPasswordWorkGate({maxConcurrent:1,maxAnonymous:1,retryAfterSeconds:1}),{supports:isNodeScryptPasswordHash,dummyHash:NODE_SCRYPT_DUMMY_HASH});
  assert.equal(await work.verify(value,undefined,'login'),false);
});
