/** Mocked dispatch/source-order faults only. No SQL is executed and no target exists. */
import test from 'node:test';import assert from 'node:assert/strict';
import { loadPairedSourcePlan } from '../reference-compiler-cohort-v2/source-cohort.mjs';
import { installOriginalSourceSchema } from './install-source-schema.mjs';
import { createGlobalGate } from '../sequence-acl-micro/contract.mjs';
import { LOGICAL } from '../reference-compiler-cohort-v2/universe.mjs';
const {plan,cohort}=await loadPairedSourcePlan({sourceRoot:process.env.NAIJUE_SOURCE_COHORT_ROOT});
const now=Date.now(),target={systemIdentifier:'7703999999999999999',database:LOGICAL.database,databaseOid:'30001',admin:LOGICAL.admin,
 owner:LOGICAL.sourceOwner,sentinel:LOGICAL.sentinel,prepare:LOGICAL.preparation,port:55449,
 postmasterStart:'2026-11-01 00:00:00+00',startsAt:now,expiresAt:now+1200000};
const args=(query,gate,onSourceEvent=async()=>{})=>({plan,target,query,gate,beforeFile:async()=>{},onSourceEvent});
test('mock dispatch retains714 original spans in order plus exact same-root guarded131-parent carrier',async()=>{
 const sql=[],events=[],gate=createGlobalGate();const result=await installOriginalSourceSchema(args(async text=>{assert.equal(typeof text,'string');sql.push(text);return{rows:[]};},gate,async event=>events.push(event)));
 assert.equal(result.submittedOriginalStatements,714);assert.equal(events.length,715);
 const ordinary=events.filter(event=>event.statementSha256);assert.deepEqual(ordinary.map(e=>e.statementSha256),plan.ledger.filter(s=>s.path!==cohort.sourcePlan.V22).map(s=>s.statementSha256));
 const carrier=cohort.v22Carrier.v22Carrier(plan,target);assert.equal(events.find(e=>e.replacement).submittedSha256,carrier.sha256);assert.ok(sql.includes(carrier.sql));assert.equal(gate.quarantined(),false);
});
test('mock original COMMIT uncertainty closes gate and never sends ROLLBACK/nextfile SQL',async()=>{
 const exact=plan.ledger.find(s=>s.kind==='COMMIT').sql,sql=[],gate=createGlobalGate(),cause=new Error('injected unknown COMMIT acknowledgement');
 await assert.rejects(installOriginalSourceSchema(args(async text=>{sql.push(text);if(text===exact)throw cause;return{rows:[]};},gate)),error=>error.cause===cause&&error.code==='MICRO_COMMIT_OUTCOME_UNKNOWN_NO_REPLAY');
 assert.equal(gate.quarantined(),true);assert.equal(sql.at(-1),exact);assert.equal(sql.filter(s=>s===exact).length,1);assert.ok(!sql.includes('ROLLBACK'));
});
test('mock carrier uncertain acknowledgement is never repaired by SQL/rollback/replay',async()=>{
 const carrier=cohort.v22Carrier.v22Carrier(plan,target),sql=[],gate=createGlobalGate(),cause=new Error('injected guarded carrier acknowledgement');
 await assert.rejects(installOriginalSourceSchema(args(async text=>{sql.push(text);if(text===carrier.sql)throw cause;return{rows:[]};},gate)),e=>e.cause===cause);
 assert.equal(gate.quarantined(),true);assert.equal(sql.at(-1),carrier.sql);assert.equal(sql.filter(s=>s===carrier.sql).length,1);assert.ok(!sql.includes('ROLLBACK'));
});
test('mock pre-COMMIT SQL failure rolls back directly and preserves original cause; rollback error is aggregated',async()=>{
 const first=plan.ledger.find(s=>!['BEGIN','COMMIT'].includes(s.kind)).sql,cause=new Error('injected original DDL failure'),rollback=new Error('injected rollback failure');
 for(const failRollback of[false,true]){
  const sql=[],gate=createGlobalGate();await assert.rejects(installOriginalSourceSchema(args(async text=>{sql.push(text);if(text===first)throw cause;if(text==='ROLLBACK'&&failRollback)throw rollback;return{rows:[]};},gate)),e=>failRollback?e instanceof AggregateError&&e.cause===cause&&e.errors[1]===rollback:e===cause);
  assert.equal(sql.at(-1),'ROLLBACK');assert.equal(gate.quarantined(),false);
 }
});
