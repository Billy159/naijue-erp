/** Offline routing/early refusal only. No pool mock, fake proof, real review,
 * source grant, credentials, database or actual publication is constructed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildCurrentRuntime26SalesBlueprint,CURRENT_LIVE_LEDGER_QA_TARGET,CURRENT_LIVE_LEDGER_QA_BATCH} from './integration/current-runtime26-sales-fixture.ts';
import {nativeBarcodeSchemeInitializationRows26} from '../packages/application/src/native-barcode-import.ts';
import {validateCurrentRuntime26PreparationInput as validate,runCurrentRuntime26PreparedPublication as run,CURRENT_PREPARATION_ROLE} from './integration/current-runtime26-preparation-host.ts';
import type {CurrentRuntime26PreparationInput} from './integration/current-runtime26-preparation-host.ts';
const H=(c:string)=>c.repeat(64);
function unitInput():CurrentRuntime26PreparationInput{
 const blueprint=buildCurrentRuntime26SalesBlueprint({database:CURRENT_LIVE_LEDGER_QA_TARGET,batchId:CURRENT_LIVE_LEDGER_QA_BATCH,now:'2026-10-31T00:00:00.000Z',pins:{baseManifestSha256:H('1'),selectionSha256:H('2'),approvalSha256:H('3'),occurrenceContractSha256:H('4')}});
 const target={database:blueprint.database,role:CURRENT_PREPARATION_ROLE,serverAddress:null,serverPort:null,postmasterStartedAt:'2026-10-31 00:00:00+00'},binding={batchId:blueprint.batchId,fixedSourceNamespace:blueprint.namespace,cutoffAt:blueprint.now,selectionSha256:blueprint.pins.selectionSha256};
 return {authorization:'CONFIRMED_NEW_ISOLATED_PREPARATION_135_V4',blueprint,expectedDatabaseOid:'987654',runtime26Review:{reviewFile:'/UNIT_NONEXISTENT_REVIEW',trustedReviewSha256:H('a')},postgres:{target:{database:blueprint.database,user:CURRENT_PREPARATION_ROLE,host:'/qa-socket',port:5432,password:'UNIT_UNUSED_NOT_A_CREDENTIAL',ssl:false},max:1,maxPendingAcquisitions:1,connectionTimeoutMillis:1000,acquisitionTimeoutMillis:1000,queryTimeoutMillis:1000,statementTimeoutMillis:1000,lockTimeoutMillis:100,idleInTransactionTimeoutMillis:1000,idlePoolTimeoutMillis:1000,disposeGraceMillis:1000,disposeTimeoutMillis:1000},partySourceOptions:{binding},bootstrapOptions:{binding:{...binding,version:'NATIVE_IMPORT_EXECUTION_26_V1',phase:'CORE_INITIALIZATION_26_V1',coreSourceDigest:H('b'),authorizedPayloadHash:null,actorAccountId:blueprint.refs.importer.nativeAccountId,target}},catalogueSourceOptions:{binding},schemeSourceOptions:{binding},schemeInitialization:{writeContractReplyFile:'/UNIT_UNREAD_CONTRACT',trustedWriteContractReplySha256:H('c'),command:{action:'IMPORT_INITIALIZE_BARCODE_SCHEMES',actorAccountId:blueprint.refs.importer.nativeAccountId,batchId:blueprint.batchId,requestKey:'UNIT_INIT_ONLY',expectedSequence:1,expectedCursor:22,schemeInitialization:{version:'BARCODE_SCHEME_INITIALIZATION_V19',coreReceiptId:'00000000-0000-4000-8000-000000000001',coreSourceDigest:H('b'),fixedSourceNamespace:binding.fixedSourceNamespace,selectionSha256:binding.selectionSha256,cutoffAt:binding.cutoffAt,target,approvalPins:{proposalSha256:H('d'),approvalSha256:H('e'),writeContractReplySha256:H('c')},schemes:nativeBarcodeSchemeInitializationRows26()}}},publication:{configFile:'/UNIT_UNREAD_JOB',signal:new AbortController().signal,maxSteps:100,append:async()=>{throw Error('MUST_NOT_APPEND');}}};
}
test('preparation host import is dormant; finite135/V4 routing accepts only original constructor inputs',()=>{
 assert.equal(typeof run,'function');assert.equal(validate(unitInput()),undefined);
});
test('wrong target, runtime/admin identity, old OID, source binding or callback injection refuses before IO',()=>{
 const edits:((i:CurrentRuntime26PreparationInput)=>CurrentRuntime26PreparationInput)[]=[
 i=>({...i,authorization:'NOT_APPROVED' as never}),i=>({...i,expectedDatabaseOid:'21551'}),i=>({...i,postgres:{...i.postgres,target:{...i.postgres.target,user:'v7_r1_runtime_20261031_01'}}}),i=>({...i,postgres:{...i.postgres,target:{...i.postgres.target,user:'t15_prod_bootstrap'}}}),i=>({...i,postgres:{...i.postgres,target:{...i.postgres.target,host:'/tmp'}}}),i=>({...i,bootstrapOptions:{...i.bootstrapOptions,partySource:{}}}),i=>({...i,partySourceOptions:{binding:{}}}),i=>({...i,catalogueSourceOptions:{binding:{}}}),i=>({...i,publication:{...i.publication,maxSteps:0}}),i=>({...i,schemeInitialization:{...i.schemeInitialization,command:{...i.schemeInitialization.command,actorAccountId:'00000000-0000-4000-8000-000000000099' as typeof i.schemeInitialization.command.actorAccountId}}})];
 for(const edit of edits)assert.throws(()=>validate(edit(unitInput())));
});
test('preparation never substitutes an absent independent review or cancelled source context',async()=>{
 await assert.rejects(run(unitInput()),{code:'ENOENT'});
 const i=unitInput(),controller=new AbortController();controller.abort();await assert.rejects(run({...i,publication:{...i.publication,signal:controller.signal}}));
});
test('independently pinned normal V8/owner review cannot select a preparation issuer, before factory or pool construction',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'unit-preparation-review-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 for(const edit of [(r:Record<string,unknown>)=>({...r,catalog:{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V8',patchLevel:'26_hv2_live_pairs_complete_write_acl_v8_from_v7'}}),(r:Record<string,unknown>)=>({...r,target:{...(r.target as object),actingRole:'v7_r1_owner_20261031_01'}})]){
  const i=unitInput(),r={catalog:{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V4',patchLevel:'26_hv2_history_set_guards_preparation_xmin_from_v22'},target:{database:i.blueprint.database,databaseOid:i.expectedDatabaseOid,actingRole:CURRENT_PREPARATION_ROLE,sessionUser:CURRENT_PREPARATION_ROLE}},bytes=JSON.stringify(edit(r)),path=join(directory,'UNIT_PROTOCOL_ONLY.json');await writeFile(path,bytes);
  await assert.rejects(run({...i,runtime26Review:{reviewFile:path,trustedReviewSha256:createHash('sha256').update(bytes).digest('hex')}}));
 }
});

import {validateCurrentRuntime26Preparation13Input as validate13,runCurrentRuntime26Preparation13Publication as run13} from './integration/current-runtime26-preparation-host.ts';
test('PREPARATION13 new routing marker is explicit and never changes original V4 meaning',async()=>{
 const i={...unitInput(),authorization:'CONFIRMED_NEW_ISOLATED_PREPARATION_135_PREPARATION13_V1' as const};assert.equal(validate13(i),undefined);
 assert.throws(()=>validate(i as never));assert.throws(()=>validate13(unitInput() as never));await assert.rejects(run13(i),{code:'ENOENT'});
});
test('PREPARATION13 entry rejects old V4 review, retains old refusal of new profile, and needs original job',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'unit-preparation13-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const old=unitInput(),base={target:{database:old.blueprint.database,databaseOid:old.expectedDatabaseOid,actingRole:CURRENT_PREPARATION_ROLE,sessionUser:CURRENT_PREPARATION_ROLE}};
 const save=async(catalog:object)=>{const bytes=JSON.stringify({...base,catalog}),reviewFile=join(directory,'UNIT_GRAMMAR_ONLY.json');await writeFile(reviewFile,bytes);return {reviewFile,trustedReviewSha256:createHash('sha256').update(bytes).digest('hex')};};
 const v4=await save({format:'EXACT26_RUNTIME_CATALOG_EXPORT_V4',patchLevel:'26_hv2_history_set_guards_preparation_xmin_from_v22'});
 await assert.rejects(run13({...old,authorization:'CONFIRMED_NEW_ISOLATED_PREPARATION_135_PREPARATION13_V1',runtime26Review:v4}),/EXACT26_RUNTIME_CATALOG_EXPORT_PREPARATION13_V1/);
 const p13=await save({format:'EXACT26_RUNTIME_CATALOG_EXPORT_PREPARATION13_V1',patchLevel:'26_hv2_history_set_guards_preparation13_xmin_from_v22'});
 await assert.rejects(run({...old,runtime26Review:p13}),/EXACT26_RUNTIME_CATALOG_EXPORT_V4/);
 await assert.rejects(run13({...old,authorization:'CONFIRMED_NEW_ISOLATED_PREPARATION_135_PREPARATION13_V1',runtime26Review:p13}),{code:'ENOENT'});
});
