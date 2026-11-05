/** Finite acceptance protocol/guard tests only. No PG, connection, port binding,
 * child spawn, publication, service execution or review authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { createBudget } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { parseAcceptanceArgs, ACCEPTANCE, EXPECTED, buildReviewRequest, assertAcceptanceReview,
  assertExpectedCanonical, assertAcceptanceObservation, waitReviewHash, auditError, acceptanceTerminal } from './current-runtime-acceptance-run.mjs';
import { SUCCESSOR_OBSERVATION } from '../sequence-system-successor-observation.mjs';
import { BUSINESS_PURPOSES } from './current-runtime-business.mjs';
import { LOGICAL } from '../reference-compiler-cohort-v2/universe.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const target={systemIdentifier:'NEW_SYNTHETIC_NOT_E001',database:LOGICAL.database,databaseOid:'16387',owner:LOGICAL.sourceOwner,port:18572,postmasterStart:'2026-11-01 07:00:00+00',startsAt:1,expiresAt:1200001};
const identity=()=>({database:target.database,database_oid:target.databaseOid,database_owner:target.owner,current_user:LOGICAL.runtime,session_user:LOGICAL.runtime,server_addr:'127.0.0.1/32',server_port:18572,server_version_num:'170011',postmaster_start:target.postmasterStart,replication_role:'origin'});
function review(){const r=buildReviewRequest({target,identity:identity(),pinsSha256:'a'.repeat(64),expiresAt:target.expiresAt});return {version:'C_NATIVE_RUNTIME26_REVIEW_V1',decision:'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA',target:r.issuerTarget,catalog:r.catalog,purposes:[...BUSINESS_PURPOSES],scope:'EXACT_TARGET_METADATA_ONLY',independentReview:{path:ACCEPTANCE.base+'/independent-review.json',sha256:'b'.repeat(64),result:'PASS'},realImportExecutionAuthorized:false};}
test('only explicit e002 SHA command; no reference/old/acceptance arguments, arbitrary path or deadline',()=>{
 assert.equal(parseAcceptanceArgs([]),null);assert.equal(parseAcceptanceArgs(['--help']),null);
 assert.deepEqual(parseAcceptanceArgs(['--run-current-runtime-acceptance','a'.repeat(64)]),{trustedPinsSha256:'a'.repeat(64)});
 for(const a of [['--run-current-runtime-reference','a'.repeat(64)],['--run-current-runtime-acceptance','A'.repeat(64)],['--run-current-runtime-acceptance','a'.repeat(64),'--port','18571'],['--help','--help'],[7]])assert.throws(()=>parseAcceptanceArgs(a));
 const a=[];Object.defineProperty(a,'0',{enumerable:true,get(){assert.fail('CLI getter invoked');}});assert.throws(()=>parseAcceptanceArgs(a));
 assert.equal(ACCEPTANCE.runId,'c20261101e002');assert.equal(ACCEPTANCE.port,18572);assert.match(ACCEPTANCE.base,/pg-current-runtime-acceptance-c20261101e002$/);assert.match(ACCEPTANCE.pinsPath,/current-acceptance-e002\/SOURCE-PINS.json$/);
});
test('request is PENDING/authorityNONE, fixed review files, independent pre-frozen e001 not acceptance-derived',()=>{
 const request=buildReviewRequest({target,identity:identity(),pinsSha256:'a'.repeat(64),expiresAt:target.expiresAt});
 assert.equal(request.status,'PENDING_EXTERNAL_REVIEW_NOT_AUTHORITY');assert.equal(request.authority,'NONE');assert.equal(request.referenceExpected.sha256,EXPECTED.catalogSha256);assert.equal(request.expectedAndIssuerReviewMustBeCreatedByIndependentController,true);
 assert.equal(request.fixedIssuerReviewPath,ACCEPTANCE.base+'/issuer-review.json');assert.deepEqual(request.purposes,BUSINESS_PURPOSES);
 assert.throws(()=>buildReviewRequest({target:{...target,systemIdentifier:'7703089336081934099'},identity:identity(),pinsSha256:'a'.repeat(64),expiresAt:target.expiresAt}));
 assert.throws(()=>buildReviewRequest({target,identity:identity(),pinsSha256:'a'.repeat(64),expiresAt:target.expiresAt+1}));
});
test('original review shape exact three purposes/new catalog/metadata-only target accepted; no authority issued',()=>{
 const accepted=assertAcceptanceReview(review(),target,identity());assert.equal(accepted.result,'PASS');assert.equal(accepted.path,ACCEPTANCE.base+'/independent-review.json');
 for(const [key,value]of Object.entries({version:'invented',decision:'APPROVED',scope:'ALL',realImportExecutionAuthorized:true,extra:true})){const r=review();r[key]=value;assert.throws(()=>assertAcceptanceReview(r,target,identity()));}
 for(const key of Object.keys(review())){const r=review();delete r[key];assert.throws(()=>assertAcceptanceReview(r,target,identity()));}
});
test('review cannot use owner/foreign target/old catalog/purpose expansion/foreign receipt or malformed own-data',()=>{
 for(const [key,value]of Object.entries({database:'foreign',databaseOid:'9',actingRole:LOGICAL.sourceOwner,sessionUser:LOGICAL.admin,serverAddress:null,serverPort:18571,postmasterStart:'old'})){const r=review();r.target[key]=value;assert.throws(()=>assertAcceptanceReview(r,target,identity()));}
 for(const field of ['format','sha256','patchLevel']){const r=review();r.catalog[field]='old';assert.throws(()=>assertAcceptanceReview(r,target,identity()));}
 for(const values of [[...BUSINESS_PURPOSES,'IMPORT_PUBLISH'],[...BUSINESS_PURPOSES].reverse(),['PRODUCT_MAINTENANCE'],new Array(3)]){const r=review();r.purposes=values;assert.throws(()=>assertAcceptanceReview(r,target,identity()));}
 for(const [key,value]of Object.entries({path:'/foreign/PASS.json',sha256:'bad',result:'PENDING'})){const r=review();r.independentReview[key]=value;assert.throws(()=>assertAcceptanceReview(r,target,identity()));}
 const r=review();Object.defineProperty(r.target,'database',{enumerable:true,get(){assert.fail('target getter invoked');}});assert.throws(()=>assertAcceptanceReview(r,target,identity()));
});
test('real independent e001 UTF8 bytes pinned; no reserialization, unknown actual or self-copy accepted',async()=>{
 const expected=await readFile(EXPECTED.canonicalPath,'utf8');assert.equal(hash(expected),EXPECTED.catalogSha256);assert.equal(Buffer.byteLength(expected),1358459);
 assertExpectedCanonical({catalog_sha256:EXPECTED.catalogSha256,observed_canonical_text:expected},expected);
 assert.throws(()=>assertExpectedCanonical({catalog_sha256:EXPECTED.catalogSha256,observed_canonical_text:expected+' '},expected));
 assert.throws(()=>assertExpectedCanonical({catalog_sha256:hash(expected+' '),observed_canonical_text:expected+' '},expected+' '));
 assert.throws(()=>assertExpectedCanonical({catalog_sha256:'0'.repeat(64),observed_canonical_text:expected},expected));
});
test('mock canonical observation retains exact ten-field actual LOGIN/new raw proof/all five original booleans',()=>{
 const text=JSON.stringify({format:SUCCESSOR_OBSERVATION.format,sequence_system_column_acls:[]});const row={identity:identity(),migration_versions:Array.from({length:26},(_,i)=>i+1),catalog_sha256:hash(text),source_routines_match:true,recorded_live_balance_contract_match:true,normal_delete_acl_match_v8:true,complete_write_system_acl_match_v8:true,sequence_system_raw_acl_match:true,observed_canonical_text:text};
 assert.equal(assertAcceptanceObservation(row,target).authority,'NONE');
 for(const key of ['source_routines_match','recorded_live_balance_contract_match','normal_delete_acl_match_v8','complete_write_system_acl_match_v8','sequence_system_raw_acl_match'])assert.throws(()=>assertAcceptanceObservation({...row,[key]:false},target));
 assert.throws(()=>assertAcceptanceObservation({...row,identity:{...identity(),server_port:18571}},target));assert.throws(()=>assertAcceptanceObservation({...row,identity:{...identity(),current_user:LOGICAL.sourceOwner}},target));
});
test('stdin accepts only one independently supplied SHA line; bytes may arrive in bounded chunks',async()=>{
 const s=new PassThrough(),c=new AbortController(),pending=waitReviewHash(s,createBudget(Date.now(),1000),c.signal);s.write('a'.repeat(32));s.write('a'.repeat(32)+'\n');assert.equal(await pending,'a'.repeat(64));assert.equal(s.listenerCount('data'),0);assert.equal(s.listenerCount('end'),0);assert.equal(s.listenerCount('error'),0);s.destroy();
});
test('stdin rejects missing EOF, extra bytes, duplicate lines, uppercase/nonASCII; never retries',async()=>{
 for(const bytes of ['','a'.repeat(64),'A'.repeat(64)+'\n','a'.repeat(64)+'\nX','a'.repeat(64)+'\n'+'b'.repeat(64)+'\n','a'.repeat(63)+'é\n']){
  const s=new PassThrough(),c=new AbortController(),p=waitReviewHash(s,createBudget(Date.now(),1000),c.signal);s.end(bytes);await assert.rejects(p);assert.equal(s.listenerCount('data'),0);s.destroy();
 }
});
test('review wait absolute deadline/abort fails with no renewal and removes handlers',async()=>{
 const s=new PassThrough(),c=new AbortController(),p=waitReviewHash(s,createBudget(Date.now(),20),c.signal);await assert.rejects(p,/ABSOLUTE_DEADLINE/);assert.equal(s.listenerCount('data'),0);s.destroy();
 const a=new PassThrough(),d=new AbortController(),q=waitReviewHash(a,createBudget(Date.now(),1000),d.signal);d.abort();await assert.rejects(q,/REVIEW_WAIT_ABORTED/);a.destroy();
 const b=new PassThrough(),e=new AbortController();e.abort();await assert.rejects(waitReviewHash(b,createBudget(Date.now(),1000),e.signal),/REVIEW_WAIT_ABORTED/);b.destroy();
});
test('error audit preserves nested cause and both AggregateError causes/code without secret/getter access',()=>{
 const first=Object.assign(new Error('SECRET original SQL'),{code:'42501'}),close=Object.assign(new Error('close rejected'),{code:'CLIENT_CLOSE'}),aggregate=new AggregateError([first,close],'publication and close',{cause:first}),outer=new Error('outer',{cause:aggregate});
 const out=auditError(outer,s=>s.replaceAll('SECRET','[REDACTED]'));assert.equal(out.cause.cause.code,'42501');assert.equal(out.cause.errors[0].code,'42501');assert.equal(out.cause.errors[1].code,'CLIENT_CLOSE');assert.doesNotMatch(JSON.stringify(out),/SECRET/);
 const getters={};Object.defineProperty(getters,'message',{get(){assert.fail('error getter invoked');}});assert.deepEqual(auditError(getters),{});
 const circular=new Error('circular');circular.cause=circular;assert.equal(auditError(circular).cause.circular,true);
});
test('terminal needs reviewed original business success AND every physical/client/source cleanup proof',()=>{
 const good={observationPassed:true,independentReviewAccepted:true,businessPassed:true,otherClients:0,clientsClosed:true,stopExitCode:0,foregroundDefinitiveClose:true,portState:'CLOSED',pidFileAbsent:true,processAbsent:true,controlShutDown:true,sourcePostflight:true};assert.equal(acceptanceTerminal(good),'PASS_FINITE_ORIGINAL_NATIVE_CREATE_AND_STOCK_NOT_PERFORMANCE');
 for(const [k,v]of Object.entries({observationPassed:false,independentReviewAccepted:false,businessPassed:false,otherClients:1,clientsClosed:false,stopExitCode:1,foregroundDefinitiveClose:false,portState:'UNKNOWN',pidFileAbsent:false,processAbsent:false,controlShutDown:false,sourcePostflight:false,unknownOutcome:true,firstFailure:{code:'42501'}}))assert.match(acceptanceTerminal({...good,[k]:v}),/^FAILED/);
});
test('source preserves lifecycle/cadence/physical-send/real services and review ordering, never writes issuer review',async()=>{
 const src=await readFile(new URL('./current-runtime-acceptance-run.mjs',import.meta.url),'utf8');
 for(const fragment of ['preparePublishedCurrentReference({plan,policy,target','createCapturedQueryBoundary({budget})','boundary.commit(()=>query(`CREATE DATABASE',"if(main&&!boundary.gate.quarantined())",'stopForeground(foreground)',"await birthCheck();if(foreground)","unix_socket_directories=''",'scram-sha-256','--pwfile=/dev/stdin','pipeCommand',"await fullSources('post-stop',true);result.sourcePostflight=true",'noExpectedOrReviewCreated:true'])assert.ok(src.includes(fragment),fragment);
 const canonical=src.indexOf('assertExpectedCanonical(actual.rows[0],expectedText)'),wait=src.indexOf('const reviewSha=await waitReviewHash'),check=src.indexOf('const external=await readIndependentAcceptanceReview'),business=src.indexOf('const business=await runCurrentRuntimeBusiness');assert.ok(canonical<wait&&wait<check&&check<business);
 assert.doesNotMatch(src,/save\(['"](?:issuer-review|independent-review)\.json/);assert.doesNotMatch(src,/\bassertReady\s*:\s*(?:async\s*)?\(/);
 assert.match(src,/budget=createBudget\(Date.now\(\)\)/);assert.match(src,/auditError\(error,sanitize\)/);assert.match(src,/ORIGINAL_TRIGGER_CHANGED_AFTER_REAL_CREATE/);
});
