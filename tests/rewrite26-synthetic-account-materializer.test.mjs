import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRewrite26IdentityDraft} from './integration/rewrite26-synthetic-account-materializer.mjs';
import {buildCurrentRuntime26SalesBlueprint,CURRENT_REWRITE_SYNTHETIC_TARGET,CURRENT_REWRITE_SYNTHETIC_BATCH,CURRENT_LIVE_LEDGER_QA_BATCH} from './integration/current-runtime26-sales-fixture.ts';
const blueprint=()=>buildCurrentRuntime26SalesBlueprint({database:CURRENT_REWRITE_SYNTHETIC_TARGET,batchId:CURRENT_REWRITE_SYNTHETIC_BATCH,now:'2026-11-02T00:00:00.000Z',pins:{baseManifestSha256:'1'.repeat(64),selectionSha256:'2'.repeat(64),approvalSha256:'3'.repeat(64),occurrenceContractSha256:'4'.repeat(64)}});
test('fixed synthetic draft preserves exact 49 identities, 45 direct links and four pending plan links',()=>{
 const b=blueprint(),d=buildRewrite26IdentityDraft(b);assert.equal(d.syntheticOnly,true);assert.equal(d.executionAuthorized,false);
 assert.equal(d.sourceRows.length,49);assert.equal(d.sourceRows.filter(x=>x.planCandidate===null).length,45);assert.equal(d.planCandidate.employees.length,4);
 assert.equal(d.planCandidate.state,'PENDING_INDEPENDENT_REVIEW');assert.equal(d.importerCandidate.nativeAccountId,b.refs.importer.nativeAccountId);
 const keys=value=>value&&typeof value==='object'?Object.keys(value).concat(Object.values(value).flatMap(keys)):[];
 assert.ok(keys(d).every(k=>!/credential|password|loginName/i.test(k)));assert.doesNotMatch(JSON.stringify(d),/USER_CONFIRMED_EMPLOYEE_INPUTS|"result":"PASS"/);
 for(const row of d.sourceRows){const source=b.parties.find(p=>p.source.entityType==='STAFF'&&p.source.sourceKey===row.staffSourceKey);assert.equal(row.staffSourceRowId,source.source.id);assert.equal(row.staffSourceRowSha256,source.source.rowSha256);}
});
test('rejects wrong target, old batch, changed/duplicate account and changed staff evidence',()=>{
 const changes=[b=>{b.database='other'},b=>{b.batchId=CURRENT_LIVE_LEDGER_QA_BATCH},b=>{b.accountIdentities[1].sourceAccountId=b.accountIdentities[0].sourceAccountId},b=>{b.accountIdentities[48].approvedCurrentPerson.currentPersonKey='forged'},b=>{b.parties.find(p=>p.source.entityType==='STAFF').source.rowSha256='0'.repeat(64)},b=>{b.parties.find(p=>p.source.entityType==='STAFF').nativeSnapshot.hall_id='forged'},b=>{b.accountIdentities.pop()}];
 for(const mutate of changes){const b=blueprint();mutate(b);assert.throws(()=>buildRewrite26IdentityDraft(b));}
});
test('candidate cannot be used as original private bootstrap capture or approved plan',()=>{
 const d=buildRewrite26IdentityDraft(blueprint());assert.notEqual(d.version,'PRIVATE_OLD_ACCOUNT_SOURCE_CAPTURE_V1');
 assert.notEqual(d.planCandidate.state,'USER_CONFIRMED_EMPLOYEE_INPUTS');assert.ok(d.missing.includes('INDEPENDENT_IDENTITY_REVIEW'));
});
