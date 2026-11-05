/** Synthetic protocol only: real service policy + PG adapter, no database/credentials. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthenticationService, createReadOnlyAuthenticationResolver, sessionTokenHash } from '../packages/authentication/src/service.ts';
import { createSourceAuthenticationPolicy } from '../packages/authentication/src/source-policy.ts';
import { PostgresAuthenticationStore } from '../adapters/postgres/src/auth-store.ts';
const token='A'.repeat(43),hash=sessionTokenHash(token)!,now='2026-11-02T19:00:00.000Z';
const id='00000000-0000-4000-8000-000000000001',staff='00000000-0000-4000-8000-000000000002',hall='00000000-0000-4000-8000-000000000003';
const base={account_id:id,staff_id:staff,login_name:'SYNTHETIC',staff_name:'Synthetic staff',login_enabled:true,auth_version:2,
 role:'ADMIN',employment_status:'在职',hall_id:null,hall_enabled:null,token_hash:hash,session_account_id:id,session_auth_version:2,
 created_at:'2026-11-02T18:00:00.000Z',expires_at:'2026-11-02T20:00:00.000Z',revoked_at:null};
function setup(rows:Record<string,unknown>[]=[base]){
 let clock=now;const calls:string[]=[],releases:unknown[]=[];
 const store=new PostgresAuthenticationStore({async connect(){return {async query(sql:string,values?:unknown[]){calls.push(sql);assert.deepEqual(values,[hash]);return {rows:structuredClone(rows),rowCount:rows.length};},release(error?:unknown){releases.push(error);}};}});
 const dependencies={store,now:()=>{assert.equal(releases.length,calls.length);return clock;},policy:createSourceAuthenticationPolicy(3600),passwords:{async hash(){throw Error('no hash');},async verify(){throw Error('no verify');}}};
 return {resolver:createReadOnlyAuthenticationResolver(dependencies),dependencies,calls,releases,setTime:(time:string)=>{clock=time;}};
}
test('read-only resolver uses one released joined SELECT, no locks/XID/session writes or credential reads',async()=>{
 const f=setup();const principal=await f.resolver.resolveReadOnly(token);assert.equal(principal?.accountId,id);assert.equal(principal?.staffName,'Synthetic staff');assert.equal(f.calls.length,1);
 assert.match(f.calls[0]!,/JOIN naijue_erp.user_account/);assert.match(f.calls[0]!,/JOIN naijue_erp.staff/);assert.match(f.calls[0]!,/LEFT JOIN naijue_erp.hall/);
 assert.doesNotMatch(f.calls[0]!,/FOR UPDATE|FOR SHARE|BEGIN|COMMIT|INSERT|UPDATE|DELETE|pg_current_xact_id|txid_current|password_hash/i);
 assert.deepEqual(Object.keys(f.resolver),['resolveReadOnly']);assert.ok(Object.isFrozen(principal));
});
for(const [name,patch] of Object.entries({revoked:{revoked_at:now},expired:{expires_at:now},future:{created_at:'2026-11-02T19:01:00.000Z'},version:{session_auth_version:1},disabled:{login_enabled:false},departed:{employment_status:'离职'},unknownRole:{role:'UNKNOWN'},missingRequiredHall:{role:'SALESPERSON',hall_id:null},disabledHall:{hall_id:hall,hall_enabled:false},missingHall:{hall_id:hall,hall_enabled:null},wrongHash:{token_hash:'f'.repeat(64)},wrongAccount:{session_account_id:staff},invalidInterval:{created_at:now,expires_at:now}}))test(`read-only identity rejects ${name}`,async()=>{
 const f=setup([{...base,...patch}]);assert.equal(await f.resolver.resolveReadOnly(token),null);assert.equal(f.calls.length,1);
});
test('invalid/missing tokens never borrow a client, missing session returns null',async()=>{
 const f=setup([]);assert.equal(await f.resolver.resolveReadOnly('bad'),null);assert.equal(f.calls.length,0);assert.equal(await f.resolver.resolveReadOnly(token),null);
});
test('read resolution is not cached and checks expiry after each completed read',async()=>{
 const f=setup();assert.ok(await f.resolver.resolveReadOnly(token));f.setTime(base.expires_at);assert.equal(await f.resolver.resolveReadOnly(token),null);assert.equal(f.calls.length,2);
});
test('ambiguous storage fails closed and discards lease',async()=>{
 const f=setup([base,base]);await assert.rejects(f.resolver.resolveReadOnly(token));assert.ok(f.releases[0] instanceof Error);
});
test('read-only factory refuses missing seam; original command service stays separately available',()=>{
 const f=setup();const store={readLoginSnapshot:f.dependencies.store.readLoginSnapshot.bind(f.dependencies.store),readPasswordChangeSnapshot:f.dependencies.store.readPasswordChangeSnapshot.bind(f.dependencies.store),transaction:f.dependencies.store.transaction.bind(f.dependencies.store)};
 assert.throws(()=>createReadOnlyAuthenticationResolver({...f.dependencies,store} as never));assert.equal(typeof createAuthenticationService({...f.dependencies,store}).resolve,'function');
});
test('known required-hall role admits only its current enabled hall',async()=>{
 const f=setup([{...base,role:'SALESPERSON',hall_id:hall,hall_enabled:true}]);const result=await f.resolver.resolveReadOnly(token);
 assert.equal(result?.role,'SALESPERSON');assert.equal(result?.hallId,hall);
});
test('clock is observed after an awaited read, so expiry during a read cannot authorize',async()=>{
 let finish!:(value:typeof base)=>void;const pending=new Promise<typeof base>(resolve=>{finish=resolve;});let time=now,released=false;
 const store=new PostgresAuthenticationStore({async connect(){return {async query(){return {rows:[await pending],rowCount:1};},release(){released=true;}};}});
 const f=setup();const resolver=createReadOnlyAuthenticationResolver({...f.dependencies,store,now:()=>{assert.ok(released);return time;}});
 const resolving=resolver.resolveReadOnly(token);time=base.expires_at;finish(base);assert.equal(await resolving,null);
});
test('storage query failure propagates without fallback and releases poisoned lease once',async()=>{
 const failure=Error('SYNTHETIC read failed'),released:unknown[]=[];let calls=0;
 const store=new PostgresAuthenticationStore({async connect(){return {async query(){calls++;throw failure;},release(error?:unknown){released.push(error);}};}});
 const f=setup();const resolver=createReadOnlyAuthenticationResolver({...f.dependencies,store});await assert.rejects(resolver.resolveReadOnly(token),error=>error===failure);
 assert.equal(calls,1);assert.deepEqual(released,[failure]);
});
test('read-only and command services expose distinct authority surfaces',()=>{
 const f=setup();assert.deepEqual(Object.keys(createAuthenticationService(f.dependencies)).sort(),['changeOwnPassword','login','logout','resolve']);
 assert.deepEqual(Object.keys(f.resolver),['resolveReadOnly']);
});
