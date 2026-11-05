/** Auth cleanup protocol only, not PostgreSQL or real-login evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresAuthenticationStore } from "../adapters/postgres/src/auth-store.ts";
import {createAuthenticationService} from '../packages/authentication/src/service.ts';
import {createSourceAuthenticationPolicy} from '../packages/authentication/src/source-policy.ts';
import {CapacityAdmissionRejected} from '../apps/api/src/capacity-admission.ts';
function setup(failAt?: string) {
  const statements: string[] = [], releases: unknown[] = []; let connects = 0; const failure = Error("SYNTHETIC_AUTH_" + failAt);
  const store = new PostgresAuthenticationStore({ async connect() { connects++; return { async query(sql: string) {
    statements.push(sql); if (sql === failAt) throw failure; return { rows: [], rowCount: 0 };
  }, release(error) { releases.push(error); } }; } }); return { store, statements, releases, failure, connects: () => connects };
}
test("auth unknown COMMIT preserves original error and discards once without rollback/retry", async () => {
  const p = setup("COMMIT"); let work = 0;
  await assert.rejects(p.store.transaction(async () => { work++; return "done"; }), error => error === p.failure);
  assert.equal(work, 1); assert.equal(p.connects(), 1); assert.deepEqual(p.releases, [p.failure]);
  assert.equal(p.statements.filter(sql => sql === "COMMIT").length, 1); assert.equal(p.statements.includes("ROLLBACK"), false);
});
test("auth ordinary failure rolls back; acknowledged commit retains original result", async () => {
  const p = setup(), failure = Error("SYNTHETIC_WORK"); await assert.rejects(p.store.transaction(async () => { throw failure; }), error => error === failure);
  assert.equal(p.statements.filter(sql => sql === "ROLLBACK").length, 1); assert.deepEqual(p.releases, [undefined]);
  const success = setup(); assert.equal(await success.store.transaction(async () => "same-result"), "same-result"); assert.equal(success.statements.includes("ROLLBACK"), false); assert.deepEqual(success.releases, [undefined]);
});
test("auth BEGIN and rollback failure discard with exact failure semantics", async () => {
  const begin = setup("BEGIN ISOLATION LEVEL READ COMMITTED"); await assert.rejects(begin.store.transaction(async () => "never"), error => error === begin.failure);
  assert.deepEqual(begin.releases, [begin.failure]); assert.equal(begin.statements.includes("ROLLBACK"), false);
  const p = setup("ROLLBACK"), first = Error("SYNTHETIC_WORK"); await assert.rejects(p.store.transaction(async () => { throw first; }), error => error instanceof AggregateError && error.errors[0] === first && error.errors[1] === p.failure);
  assert.deepEqual(p.releases, [p.failure]);
});
for(const unknownCommit of [true,false])test(`A02 issuance ${unknownCommit?'unknown COMMIT':'expiry after INSERT'} keeps capacity until original PG cleanup settles`,async()=>{
  const statements:string[]=[],order:string[]=[];let pgActive=0,capacityActive=0,checks=0,valid=true,commitEntered!:()=>void,failCommit!:(e:Error)=>void;
  const started=new Promise<void>(done=>{commitEntered=done;}),commit=new Promise<void>((_done,reject)=>{failCommit=reject;});
  const row={account_id:'00000000-0000-0000-0000-000000000001',staff_id:'00000000-0000-0000-0000-000000000002',login_name:'SYNTHETIC_A02',password_hash:'SYNTHETIC_ONLY',login_enabled:true,auth_version:1,role:'ADMIN',employment_status:'在职',hall_id:null};
  const store=new PostgresAuthenticationStore({async connect(){pgActive++;return {async query(sql:string){
    statements.push(sql);
    if(sql.includes('auth:login-snapshot')||sql.includes('FROM naijue_erp.user_account a JOIN'))return {rows:[row],rowCount:1};
    if(sql.startsWith('INSERT INTO naijue_erp.auth_session')){if(!unknownCommit)valid=false;return {rows:[],rowCount:1};}
    if(sql==='COMMIT'){commitEntered();await commit;}
    return {rows:[],rowCount:0};
  },release(){pgActive--;order.push('pg.release');}};}});
  const service=createAuthenticationService({store,now:()=> '2026-10-29T00:00:00.000Z',policy:createSourceAuthenticationPolicy(900),
    passwords:{async verify(){return true;},async hash(){throw Error('Not selected');}},
    sessionAdmission:{async acquire(){assert.equal(pgActive,0);capacityActive++;return {
      assertValid(){checks++;if(!valid)throw new CapacityAdmissionRejected('WINDOW_EXPIRED',2);},release(){assert.equal(pgActive,0);capacityActive--;order.push('capacity.release');}
    };}}});
  const failure=Error('SYNTHETIC_UNKNOWN_COMMIT');
  const pending=service.login(row.login_name,'SYNTHETIC_PASSWORD');
  const rejected=assert.rejects(pending,e=>unknownCommit?e===failure:e instanceof CapacityAdmissionRejected);
  if(unknownCommit){await started;assert.equal(capacityActive,1);assert.equal(pgActive,1);failCommit(failure);}
  await rejected;assert.equal(capacityActive,0);assert.equal(pgActive,0);assert.equal(checks,3);
  assert.equal(statements.filter(s=>s==='COMMIT').length,unknownCommit?1:0);assert.equal(statements.filter(s=>s==='ROLLBACK').length,unknownCommit?0:1);
  assert.deepEqual(order.slice(-2),['pg.release','capacity.release']);
});
