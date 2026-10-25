import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceConfirmedHistoryRevisionAuthorization } from './history-revision-authorization.ts';
import type { PgSalesPool } from '../../../adapters/postgres/src/sales-unit-of-work.ts';
import type { NativeRuntime26Capability } from '../../../packages/application/src/native-import-schema-contract.ts';
import { entityId } from '../../../packages/domain/src/values.ts';
const id=(n:number)=>`00000000-0512-4000-8000-${String(n).padStart(12,'0')}`;
const actor={accountId:entityId('account',id(1)),hallId:entityId('hall',id(2))};
const command=(kind:'sales'|'transfers'='sales')=>({kind,documentId:id(3),expectedVersion:99,requestKey:'synthetic-original-key-recovery-no-version-precheck',reason:'Synthetic correction',lines:[{lineId:id(4),quantity:'2'}],totals:null,settlements:[]});
function fixture() {
  let role='ADMIN',employed=true,login=true,memberHall:string|null=actor.hallId,allowed=true,status='DRAFT',ready=true,commitFailure=false,rollbackFailure=false;
  let connections=0,releases=0,discard:unknown;
  const calls:{sql:string;values:unknown[]}[]=[];
  const client={async query(sql:string,values:unknown[]=[]){calls.push({sql,values});
    if(sql==='COMMIT'&&commitFailure)throw Error('SYNTHETIC_UNKNOWN_READ_COMMIT');
    if(sql==='ROLLBACK'&&rollbackFailure)throw Error('SYNTHETIC_READ_ROLLBACK_FAILURE');
    const rows=sql.includes('history-write-policy:identity')?[{id:actor.accountId,login_enabled:login,role,employment_status:employed?'在职':'离职',hall_id:memberHall,hall_enabled:true}]
      :sql.includes('history-write-policy:document')&&allowed?[{id:id(3),source_status:status}]:[];
    return {rows,rowCount:rows.length};},release(error?:unknown){releases++;discard=error;}};
  const pool:PgSalesPool={async connect(){connections++;return client;}};
  const runtime:NativeRuntime26Capability={profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(actual,purpose){assert.equal(actual,client);assert.equal(purpose,'HISTORY_REVISION');if(!ready)throw Object.assign(Error('Revoked review'),{code:'NATIVE_RUNTIME26_NOT_READY'});}};
  return {policy:createSourceConfirmedHistoryRevisionAuthorization(pool,runtime),calls,state:()=>({connections,releases,discard}),set(v:{role?:string;employed?:boolean;login?:boolean;memberHall?:string|null;allowed?:boolean;status?:string;ready?:boolean;commitFailure?:boolean;rollbackFailure?:boolean}){
    role=v.role??role;employed=v.employed??employed;login=v.login??login;if('memberHall'in v)memberHall=v.memberHall!;allowed=v.allowed??allowed;status=v.status??status;ready=v.ready??ready;commitFailure=v.commitFailure??commitFailure;rollbackFailure=v.rollbackFailure??rollbackFailure;}};
}
test('historical production write policy: original roles, explicit source publication and header state; old keys are not blocked by current version',async()=>{
  for(const role of ['ADMIN','WAREHOUSE','SALESPERSON'])for(const kind of ['sales','transfers'] as const){
    const f=fixture();f.set({role});const grant=await f.policy.authorize(actor,command(kind),new AbortController().signal);
    assert.deepEqual(grant,{dataset:'HISTORY',kind,documentId:id(3),actorAccountId:actor.accountId});
    const document=f.calls.find(c=>c.sql.includes('history-write-policy:document'))!;
    assert.match(document.sql,/b.status='IMPORTED'/);assert.match(document.sql,/IMPORT_PUBLISH/);assert.match(document.sql,/FINAL_COMPLETE_SCOPE/);
    assert.ok(!document.values.includes(99));assert.ok(!document.sql.includes('expectedVersion'));
    if(role==='SALESPERSON'){assert.deepEqual(document.values.at(-1),[actor.hallId]);assert.match(document.sql,kind==='sales'?/h.hall_id=ANY/:/created_hall_provenance='ORIGINAL'/);}
    assert.equal(f.calls[0]!.sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(f.calls.at(-1)!.sql,'COMMIT');
    assert.ok(f.calls.every(c=>!/^\s*(INSERT|UPDATE|DELETE|GRANT)\b/.test(c.sql)));assert.equal(f.state().connections,f.state().releases);
  }
  for(const sourceStatus of ['DRAFT','APPROVED','VOID']){const f=fixture();f.set({status:sourceStatus});await f.policy.authorize(actor,command(),new AbortController().signal);}
  for(const sourceStatus of ['APPROVED','VOID']){const f=fixture();f.set({status:sourceStatus});await assert.rejects(f.policy.authorize(actor,{...command(),header:{businessDate:'2026-10-26'}},new AbortController().signal),{code:'FORBIDDEN'});assert.equal(f.calls.at(-1)!.sql,'ROLLBACK');}
});
test('historical production write policy: current revocation, foreign source scope, abort and uncertain reads never issue grants',async()=>{
  for(const change of [{employed:false},{login:false},{role:'UNKNOWN'},{memberHall:id(99)},{allowed:false},{role:'SALESPERSON',memberHall:null}]){
    const f=fixture();f.set(change);await assert.rejects(f.policy.authorize(actor,command(),new AbortController().signal),{code:'FORBIDDEN'});assert.equal(f.calls.at(-1)!.sql,'ROLLBACK');assert.equal(f.state().releases,1);
  }
  const revoked=fixture();revoked.set({ready:false});await assert.rejects(revoked.policy.authorize(actor,command(),new AbortController().signal),{code:'HISTORY_REVISION_SCHEMA_NOT_READY'});
  const aborted=fixture(),controller=new AbortController();controller.abort();await assert.rejects(aborted.policy.authorize(actor,command(),controller.signal),{code:'FORBIDDEN'});assert.equal(aborted.state().connections,0);
  const uncertain=fixture();uncertain.set({commitFailure:true});await assert.rejects(uncertain.policy.authorize(actor,command(),new AbortController().signal),/UNKNOWN_READ_COMMIT/);assert.ok(uncertain.state().discard instanceof Error);assert.ok(!uncertain.calls.some(c=>c.sql==='ROLLBACK'));
  const rollback=fixture();rollback.set({allowed:false,rollbackFailure:true});await assert.rejects(rollback.policy.authorize(actor,command(),new AbortController().signal),AggregateError);assert.ok(rollback.state().discard instanceof Error);
});
