/** Actual shared driver and account leaf against scripted replies, not engine evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { createAccountMaintenanceService } from "../packages/application/src/account-maintenance-service.ts";
import { PostgresAccountMaintenanceUnitOfWork } from "../adapters/postgres/src/account-maintenance-store.ts";
import { PostgresMaintenanceCommandUnitOfWork } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
import {readFile} from 'node:fs/promises';
import Fastify from 'fastify';
import {createAccountMaintenanceHttpPlugin} from '../apps/api/src/account-maintenance-http.ts';
import {PostgresQueryError} from '../adapters/postgres/src/bounded-pool.ts';
import {createNodeScryptPasswords,createNodeCredentialRequestTag} from '../packages/authentication/src/passwords.ts';
import {createSourceAuthenticationPolicy} from '../packages/authentication/src/source-policy.ts';
const id = (n: number) => sid("account", n), target = id(10), staffId = id(20), timestamp = "2026-10-21T01:00:00.123456Z";
function setup(options: { otherAdmin?: boolean; employment?: string; role?: string; ownerRole?: string; receiptFault?: boolean; commitFault?: boolean; create?:boolean; credentials?:boolean; columns?:{insert:string[];update:string[]}; receiptRecovery?:boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [], releases: unknown[] = []; let sequence = 100;
  let finiteSqlstate:string|null=null,receipt:Record<string,unknown>|undefined;
  const driver = new PostgresMaintenanceCommandUnitOfWork({ async connect() { return { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values: structuredClone(values) });
    if(options.columns){
      const insert=/^INSERT INTO naijue_erp\.user_account\(([^)]+)\)/.exec(sql),update=/^UPDATE naijue_erp\.user_account SET ([\s\S]+?)\s+WHERE/.exec(sql);
      const columns=insert?insert[1]!.split(','):update?update[1]!.split(',').map(v=>v.trim().split('=')[0]!):[];
      if(columns.some(c=>!(insert?options.columns!.insert:options.columns!.update).includes(c))){finiteSqlstate='42501';throw new PostgresQueryError({code:'42501'});}
    }
    if (sql.includes("maintenance:identity")) return { rows: [{ account_id: actor.accountId, staff_id: id(99), login_enabled: true, employment_status: "在职", role: options.role ?? "ADMIN", hall_id: actor.hallId }], rowCount: 1 };
    if (sql.includes("maintenance:hall")) return { rows: [{ id: actor.hallId, enabled: true }], rowCount: 1 };
    if (sql.startsWith("SELECT id,staff_id,login_name")) return { rows: options.create?[]:[{ id: target, staff_id: staffId, login_name: "SOURCE LOGIN", login_enabled: true, auth_version: 7, version: 9, created_at: timestamp, updated_at: timestamp }], rowCount: options.create?0:1 };
    if (sql.startsWith("SELECT id,role,employment_status")) return { rows: [{ id: staffId, role: options.ownerRole ?? "ADMIN", employment_status: options.employment ?? "在职", hall_id: null }], rowCount: 1 };
    if (sql.includes("account-maintenance:other-admin")) return { rows: [{ available: options.otherAdmin ?? true }], rowCount: 1 };
    if (sql.includes("maintenance:audit")) return { rows: [], rowCount: 1 };
    if (sql.includes("maintenance:receipt")&&options.receiptRecovery) return {rows:receipt&&receipt.request_key===values[1]?[receipt]:[],rowCount:receipt?1:0};
    if (sql.includes("maintenance:complete")) { if (options.receiptFault) throw Error("SYNTHETIC RECEIPT FAULT");const result_data=JSON.parse(values[7] as string) as unknown;
      if(options.receiptRecovery)receipt={id:values[0],request_key:values[2],request_hash:values[3],action:values[4],target_type:values[5],target_id:values[6],result_data,completed_at:values[8]};
      return { rows: [{ result_data }], rowCount: 1 }; }
    if (sql === "COMMIT" && options.commitFault) throw Error("UNKNOWN COMMIT");
    return { rows: [], rowCount: sql.startsWith("UPDATE") || sql.startsWith("INSERT") ? 1 : 0 };
  }, release(error?: unknown) { releases.push(error); } }; } });
  const credentials=options.credentials?{passwords:createNodeScryptPasswords(),credentialRequestTag:createNodeCredentialRequestTag(new Uint8Array(32).fill(9)),assertNewPassword:createSourceAuthenticationPolicy(3600).assertNewPassword}:null;
  const dependencies={ unitOfWork: new PostgresAccountMaintenanceUnitOfWork(driver), credentials, now: () => "2026-10-22T08:30:00Z", newId: (kind:Parameters<typeof sid>[0]) => sid(kind, sequence++) };
  return { calls, releases, dependencies,sqlstate:()=>finiteSqlstate, service: createAccountMaintenanceService(dependencies) };
}
const disable = { action: "DISABLE", requestKey: "disable", id: target, expectedVersion: 9 };
test("account PG protocol: global-admin/key/current/target lock order, CAS+auth invalidation and audit/receipt share one client", async () => {
  const f = setup(); const result = await f.service.execute(actor, disable); assert.equal(result.version, 10);
  const admin = f.calls.findIndex(c => c.sql.includes("maintenance:administrator-lock")), key = f.calls.findIndex(c => c.values[0]?.toString().startsWith("naijue:receipt:")), identity = f.calls.findIndex(c => c.sql.includes("maintenance:identity")), targetLock = f.calls.findIndex(c => c.sql.startsWith("SELECT id,staff_id"));
  assert.ok(admin < key && key < identity && identity < targetLock); assert.match(f.calls[targetLock]!.sql, /ORDER BY id FOR UPDATE/);
  const update = f.calls.find(c => c.sql.startsWith("UPDATE naijue_erp.user_account"))!; assert.match(update.sql, /auth_version=\$9 AND version=\$10/); assert.doesNotMatch(update.sql, /password_hash/); assert.equal(update.values[4], 8); assert.equal(update.values[5], 10); assert.equal(update.values[6], timestamp);
  const session = f.calls.find(c => c.sql.startsWith("UPDATE naijue_erp.auth_session"))!; assert.deepEqual(session.values, [target, "2026-10-22T08:30:00.000000Z"]); assert.match(session.sql, /revoked_at IS NULL/);
  assert.ok(f.calls.findIndex(c => c.sql.includes("maintenance:audit")) < f.calls.indexOf(update)); assert.ok(f.calls.findIndex(c => c.sql.includes("maintenance:complete")) > f.calls.indexOf(session)); assert.equal(f.calls.at(-1)!.sql, "COMMIT"); assert.deepEqual(f.releases, [undefined]);
  assert.ok(f.calls.filter(c => c.sql.includes("maintenance:audit") || c.sql.includes("maintenance:complete")).every(c => !JSON.stringify(c.values).includes("password")));
});
test("account PG protocol: last usable admin/current role/inactive staff rejection precedes root mutation", async () => {
  const last = setup({ otherAdmin: false }); await assert.rejects(last.service.execute(actor, disable), { code: "LAST_AVAILABLE_ADMIN" }); assert.equal(last.calls.at(-1)!.sql, "ROLLBACK"); assert.ok(!last.calls.some(c => c.sql.startsWith("UPDATE")));
  const denied = setup({ role: "WAREHOUSE" }); await assert.rejects(denied.service.execute(actor, disable), { code: "FORBIDDEN" }); assert.ok(!denied.calls.some(c => c.sql.startsWith("SELECT id,staff_id")));
  const inactive = setup({ employment: "离职" }); await assert.rejects(inactive.service.execute(actor, { action: "EDIT", requestKey: "edit", id: target, expectedVersion: 9, values: { loginName: "CHANGED", loginEnabled: true } }), { code: "ACCOUNT_REFERENCE_UNAVAILABLE" }); assert.ok(!inactive.calls.some(c => c.sql.startsWith("UPDATE")));
});
test("account PG protocol: receipt failure rolls back session/root; unknown COMMIT discards with no rollback", async () => {
  const f = setup({ receiptFault: true }); await assert.rejects(f.service.execute(actor, disable)); assert.ok(f.calls.some(c => c.sql.startsWith("UPDATE naijue_erp.auth_session"))); assert.equal(f.calls.at(-1)!.sql, "ROLLBACK");
  const g = setup({ commitFault: true }); await assert.rejects(g.service.execute(actor, disable), /UNKNOWN COMMIT/); assert.equal(g.calls.at(-1)!.sql, "COMMIT"); assert.ok(!g.calls.some(c => c.sql === "ROLLBACK")); assert.ok(g.releases[0] instanceof Error);
});

/** HTTP/service/SQL-leaf model only: no PG triggers or real ACL execution. */
test('fresh35 account writer CREATE RESET receipt replay and ADMIN refusal use exact declared column permissions without secret output',async()=>{
 const source=await readFile(new URL('../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs',import.meta.url),'utf8');
 const granted=(action:string)=>new RegExp('GRANT '+action+' \\(([^)]+)\\) ON TABLE naijue_erp\\.user_account TO erp_unified27_runtime_2393dbc6db9581c2;').exec(source)?.[1]?.split(',').map(v=>v.trim())??[];
 const columns={insert:granted('INSERT'),update:granted('UPDATE')};
 assert.deepEqual(columns.insert,['id','staff_id','login_name','password_hash','login_enabled','auth_version','version','created_at','updated_at']);
 assert.deepEqual(columns.update,['login_name','login_enabled','auth_version','version','updated_at','password_hash']);
 const password='SYNTHETIC-ONLY-PASSWORD';
 for(const action of ['CREATE','RESET_PASSWORD'] as const)for(const captured of [true,false]){
  const f=setup({create:action==='CREATE',credentials:true,columns:captured?{insert:[],update:['id']}:columns,receiptRecovery:true}),app=Fastify({logger:false});
  try{
   app.register(createAccountMaintenanceHttpPlugin({authenticate:async()=>actor,dependencies:f.dependencies}));await app.ready();
   const payload=action==='CREATE'?{action,requestKey:'fresh35-model-create',values:{staffId,loginName:'SYNTHETIC-ONLY',loginEnabled:true,password}}:{action,requestKey:'fresh35-model-reset',id:target,expectedVersion:9,password};
   const saved=await app.inject({method:'POST',url:'/accounts/commands',payload});assert.equal(saved.statusCode,captured?500:200);assert.equal(app.server.listening,false);
   if(captured){assert.equal(saved.json<{error:{code:string}}>().error.code,'INTERNAL_ERROR');assert.equal(f.sqlstate(),'42501');assert.equal(f.calls.at(-1)!.sql,'ROLLBACK');assert.equal(f.releases.length,1);}
   else{
    const result=saved.json(),mutations=f.calls.filter(c=>/^(?:INSERT INTO|UPDATE) naijue_erp\.user_account/.test(c.sql)).length;
    const readback=await app.inject({method:'GET',url:'/accounts/receipts/'+payload.requestKey});assert.equal(readback.statusCode,200);assert.deepEqual(readback.json().result,result);
    const replay=await app.inject({method:'POST',url:'/accounts/commands',payload});assert.equal(replay.statusCode,200);assert.deepEqual(replay.json(),result);
    assert.equal(f.calls.filter(c=>/^(?:INSERT INTO|UPDATE) naijue_erp\.user_account/.test(c.sql)).length,mutations);
    const missing=await app.inject({method:'GET',url:'/accounts/receipts/other-model-key'});assert.equal(missing.statusCode,404);
    assert.equal(JSON.stringify({result,receipt:readback.json()}).includes(password),false);
   }
   assert(f.calls.filter(c=>c.sql.includes('maintenance:audit')||c.sql.includes('maintenance:complete')).every(c=>!JSON.stringify(c.values).includes(password)));
  }finally{await app.close();}
 }
 const denied=setup({role:'WAREHOUSE',create:true,credentials:true,columns});
 await assert.rejects(denied.service.execute(actor,{action:'CREATE',requestKey:'denied-model',values:{staffId,loginName:'SYNTHETIC-ONLY',loginEnabled:true,password}}),{code:'FORBIDDEN'});
 assert(!denied.calls.some(c=>/^(?:INSERT INTO|UPDATE) naijue_erp\.user_account/.test(c.sql)));
});
