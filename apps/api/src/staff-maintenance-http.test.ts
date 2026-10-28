/** Synthetic HTTP boundary only; no listener, actual credentials or database. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createStaffMaintenanceHttpPlugin } from "./staff-maintenance-http.ts";
import type { StaffMaintenanceDependencies } from "../../../packages/application/src/staff-maintenance-ports.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { actor, sid } from "../../../tests/support/synthetic-fixtures.ts";
import { createPasswordWorkGate, gatePasswordCodec, PasswordWorkRejected } from '../../../packages/authentication/src/password-work-gate.ts';
test("staff HTTP: exact authenticated contract, credential readiness and no-cache sanitized failures", async t => {
  let loggedIn = true, allow = true, fault = false, preparationReady = true, sequence = 100;
  const dependencies: StaffMaintenanceDependencies = { credentials: null, now: () => "2026-10-22T08:30:00Z", newId: kind => sid(kind, sequence++), unitOfWork: { async transaction(work) { return work({ evidence: {
    async assertAllowed() { if (!allow) throw new DomainError("FORBIDDEN", "PRIVATE"); }, async getReceipt() { if (!allow) throw new DomainError("FORBIDDEN", "PRIVATE"); return undefined; }, async prepare() { if (!preparationReady) throw new DomainError("MAINTENANCE_PREPARE_NOT_READY", "PRIVATE PROVIDER"); }, async complete(c) { if (fault) throw Error("PRIVATE SQL"); return { operationId: c.operationId, kind: c.kind, targetId: c.targetId, version: c.newVersion }; }
  }, async load(id) { return { staff: { id, name: "合成员工", role: "WAREHOUSE", hallId: null, contact: null, employmentStatus: "在职", version: 1 }, account: null }; }, async validateChange() {}, async putStaff() {}, async putAccount() {} }); } } };
  const app = Fastify({ logger: false }); t.after(() => app.close()); app.register(createStaffMaintenanceHttpPlugin({ authenticate: async () => loggedIn ? actor : null, dependencies })); await app.ready();
  const payload = { action: "LEAVE", requestKey: "leave", id: sid("staff", 10), expectedVersion: 1 };
  const saved = await app.inject({ method: "POST", url: "/staff/commands", payload }); assert.equal(saved.statusCode, 200, saved.body); assert.equal(saved.json().kind, "STAFF"); assert.equal(saved.headers["cache-control"], "no-store");
  preparationReady = false; const unavailable = await app.inject({ method: "POST", url: "/staff/commands", payload }); assert.equal(unavailable.statusCode, 503); assert.equal(unavailable.json().error.code, "MAINTENANCE_PREPARE_NOT_READY"); assert.doesNotMatch(unavailable.body, /PRIVATE PROVIDER/); preparationReady = true;
  assert.equal((await app.inject({ method: "POST", url: "/staff/commands", payload: { ...payload, loginEnabled: true } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/staff/commands?hallId=forged", payload })).statusCode, 400);
  const create = { action: "CREATE", requestKey: "create", values: { name: "合成员工", role: "WAREHOUSE", hallId: null, contact: null }, account: { id: null, expectedVersion: null, loginName: "LOGIN", loginEnabled: true, password: "SYNTHETIC-PASSWORD" } };
  assert.equal((await app.inject({ method: "POST", url: "/staff/commands", payload: create })).statusCode, 503);
  assert.equal((await app.inject({ method: "GET", url: "/staff/receipts/missing" })).statusCode, 404);
  fault = true; const failure = await app.inject({ method: "POST", url: "/staff/commands", payload }); assert.equal(failure.statusCode, 500); assert.doesNotMatch(failure.body, /PRIVATE SQL/);
  allow = false; assert.equal((await app.inject({ method: "POST", url: "/staff/commands", payload })).statusCode, 403); loggedIn = false; assert.equal((await app.inject({ method: "POST", url: "/staff/commands", payload })).statusCode, 401); assert.equal(app.server.listening, false);
});
test('staff HTTP shares authenticated CPU budget and returns bounded429 before writes; fake busy or unknown COMMIT stays generic500',async t=>{
  const gate=createPasswordWorkGate({maxConcurrent:1,maxAnonymous:1,retryAfterSeconds:2});let complete=0,rawHash=0;let failure:unknown;
  let finish!:()=>void;const hold=new Promise<void>(done=>{finish=done;});const occupied=gate.run('authenticated',()=>hold);
  const credentials={passwords:gatePasswordCodec({async hash(){rawHash++;return `naijue:scrypt:1:32768:8:1:${'a'.repeat(32)}:${'b'.repeat(128)}`;},async verify(){return false;}},gate,'authenticated'),credentialRequestTag:()=> 'a'.repeat(64),assertNewPassword:()=>undefined};
  const dependencies:StaffMaintenanceDependencies={credentials,now:()=> '2026-10-29T00:00:00Z',newId:kind=>sid(kind,100),unitOfWork:{async transaction(work){if(failure)throw failure;return work({evidence:{async getReceipt(){return undefined;},async assertAllowed(){},async prepare(){},async complete(c){complete++;return {operationId:c.operationId,kind:c.kind,targetId:c.targetId,version:c.newVersion};}},async load(){return undefined;},async validateChange(){},async putStaff(){assert.fail('No writes under saturated work budget');},async putAccount(){assert.fail('No writes under saturated work budget');}});}}};
  const app=Fastify({logger:false});t.after(()=>app.close());app.register(createStaffMaintenanceHttpPlugin({authenticate:async()=>actor,dependencies}));await app.ready();
  const payload={action:'CREATE',requestKey:'p02-staff-budget',values:{name:'合成员工',role:'WAREHOUSE',hallId:null,contact:null},account:{id:null,expectedVersion:null,loginName:'SYNTHETIC',loginEnabled:true,password:'synthetic-password'}};
  try{const response=await app.inject({method:'POST',url:'/staff/commands',payload});assert.equal(response.statusCode,429);assert.equal(response.headers['retry-after'],'2');assert.equal(response.headers['set-cookie'],undefined);assert.equal(complete,0);assert.equal(rawHash,0);assert.deepEqual(response.json(),{error:{code:'AUTHENTICATION_BUSY',message:'Authentication capacity is temporarily unavailable'}});}
  finally{finish();await occupied;}
  for(const error of [Object.assign(Error('PRIVATE'),{code:'PASSWORD_WORK_BUSY',retryAfterSeconds:2}),new PasswordWorkRejected('AUTHENTICATION_CANCELLED',0),Error('PRIVATE UNKNOWN COMMIT')]){
    failure=error;const response=await app.inject({method:'POST',url:'/staff/commands',payload});assert.equal(response.statusCode,500);assert.equal(response.headers['retry-after'],undefined);assert.doesNotMatch(response.body,/PRIVATE|UNKNOWN COMMIT/);
  }
});
