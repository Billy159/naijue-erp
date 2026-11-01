/** Source/pure protocol only: no PG, subprocess, connection or role/target setup. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {DIAGNOSTIC,EXPECTED,parseDiagnosticArgs,diagnosticTerminal,assertDiagnosticObservation,auditError,INTERNAL_TRIGGER_BINDINGS_SQL} from './current-runtime-catalog-diagnostic-run.mjs';
import {SUCCESSOR_OBSERVATION} from '../sequence-system-successor-observation.mjs';import {LOGICAL} from '../reference-compiler-cohort-v2/universe.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('e003-only diagnostic command is inert by default; no issuer/acceptance/old target/arbitrary scope args',()=>{
 assert.equal(parseDiagnosticArgs([]),null);assert.equal(parseDiagnosticArgs(['--help']),null);assert.deepEqual(parseDiagnosticArgs(['--run-current-runtime-catalog-diagnostic','a'.repeat(64)]),{trustedPinsSha256:'a'.repeat(64)});
 for(const a of [['--run-current-runtime-acceptance','a'.repeat(64)],['--run-current-runtime-reference','a'.repeat(64)],['--run-current-runtime-catalog-diagnostic','A'.repeat(64)],['--run-current-runtime-catalog-diagnostic','a'.repeat(64),'--port','18572'],['--help','--help'],[1]])assert.throws(()=>parseDiagnosticArgs(a));
 assert.equal(DIAGNOSTIC.runId,'c20261101e003');assert.equal(DIAGNOSTIC.port,18573);assert.match(DIAGNOSTIC.base,/pg-current-runtime-catalog-diagnostic-c20261101e003$/);assert.match(DIAGNOSTIC.pinsPath,/current-catalog-diagnostic-e003\/SOURCE-PINS.json$/);
});
test('original strict expected remains the exact immutable e001 text, not normalized/rewritten target data',async()=>{
 assert.equal(EXPECTED.catalogSha256,'2b950148a6f5afb155d30931a2917965a747153bd0cd654b4e4502164395d95d');const original=await readFile(EXPECTED.canonicalPath);assert.equal(original.length,1358459);assert.equal(hash(original),EXPECTED.catalogSha256);
});
test('mock observation preserves original all5 proof predicates, closed10 identity and e003 directLOGIN',()=>{
 const target={database:LOGICAL.database,databaseOid:'16387',owner:LOGICAL.sourceOwner,postmasterStart:'2026-11-01 07:00:00+00'},text=JSON.stringify({format:SUCCESSOR_OBSERVATION.format,sequence_system_column_acls:[]});
 const row={identity:{database:target.database,database_oid:target.databaseOid,database_owner:target.owner,current_user:LOGICAL.runtime,session_user:LOGICAL.runtime,server_addr:'127.0.0.1/32',server_port:18573,server_version_num:'170011',postmaster_start:target.postmasterStart,replication_role:'origin'},migration_versions:Array.from({length:26},(_,i)=>i+1),catalog_sha256:hash(text),source_routines_match:true,recorded_live_balance_contract_match:true,normal_delete_acl_match_v8:true,complete_write_system_acl_match_v8:true,sequence_system_raw_acl_match:true,observed_canonical_text:text};
 assert.equal(assertDiagnosticObservation(row,target).authority,'NONE');for(const k of ['source_routines_match','recorded_live_balance_contract_match','normal_delete_acl_match_v8','complete_write_system_acl_match_v8','sequence_system_raw_acl_match'])assert.throws(()=>assertDiagnosticObservation({...row,[k]:false},target));assert.throws(()=>assertDiagnosticObservation({...row,identity:{...row.identity,server_port:18572}},target));
});
test('actual canonical/proofs/parity +RRbefore/after +allinternal bindings wx save precede strict expected rejection',async()=>{
 const s=await readFile(new URL('./current-runtime-catalog-diagnostic-run.mjs',import.meta.url),'utf8');
 const sequence=["await save('diagnostic-rr-before.json'","await save('canonical-query-result.json'","await save('canonical-observation.json'","await save('canonical-parity.json'","await save('diagnostic-rr-snapshot.json'","await save('internal-trigger-bindings.json'","assertDiagnosticObservation(row,target)","await save('strict-original-expected-comparison.json'","need(result.expectedCanonicalMatched,'E003_CANONICAL_DIFFERS"];
 const offsets=sequence.map(x=>{const n=s.indexOf(x);assert.ok(n>=0,x);return n;});assert.deepEqual(offsets,[...offsets].sort((a,b)=>a-b));
 assert.match(s,/observed_canonical_text===expectedText/);assert.match(s,/catalog_sha256===EXPECTED.catalogSha256/);assert.match(s,/noNormalizationOrExpectedReplacement:true/);assert.match(s,/flag:'wx'/);
 assert.doesNotMatch(s,/runCurrentRuntimeBusiness|createNativeRuntime26Issuer|WAIT_REVIEW|issuer-review\.json|process\.stdin/);
});
test('allinternal SQL is ERP scoped read-only; raw pg_trigger/constraint/index retain every field including unique_key_recheck',()=>{
 const q=INTERNAL_TRIGGER_BINDINGS_SQL;
 assert.match(q,/to_jsonb\(t\) AS raw_trigger/);assert.match(q,/to_jsonb\(con\) AS raw_constraint/);assert.match(q,/to_jsonb\(ixdata\) AS raw_index/);
 assert.match(q,/LEFT JOIN pg_constraint con/);assert.match(q,/WHERE n\.nspname='naijue_erp' AND t\.tgisinternal\nORDER BY/);assert.doesNotMatch(q,/contype\s*=|RI_FKey|unique_key_recheck|regexp_replace|substr\(|right\(/);
 for(const token of ['t.oid::text','t.tgname','function_signature','pg_get_triggerdef(t.oid)','pg_get_expr(t.tgqual,t.tgrelid)','con.oid::text','constraint_schema','constraint_name','constraint_type','pg_get_constraintdef(con.oid)','owning_relation','referenced_relation','pg_get_indexdef(con.conindid)'])assert.ok(q.includes(token),token);
 assert.doesNotMatch(q,/\b(?:UPDATE|INSERT|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL)\b/i);
});
test('diagnostic strict mismatch neverPASS; cleanup/source/unknown failures remain fatal even if actual text captured',()=>{
 const good={observationPassed:true,otherClients:0,clientsClosed:true,stopExitCode:0,foregroundDefinitiveClose:true,portState:'CLOSED',pidFileAbsent:true,processAbsent:true,controlShutDown:true,sourcePostflight:true};assert.equal(diagnosticTerminal(good),'PASS_DIAGNOSTIC_EXACT_ORIGINAL_EXPECTED_ONLY_NO_ISSUER');
 for(const [k,v]of Object.entries({observationPassed:false,otherClients:1,clientsClosed:false,stopExitCode:1,foregroundDefinitiveClose:false,portState:'UNKNOWN',pidFileAbsent:false,processAbsent:false,controlShutDown:false,sourcePostflight:false,unknownOutcome:true,firstFailure:{code:'MISMATCH'}}))assert.match(diagnosticTerminal({...good,[k]:v}),/^FAILED/);
});
test('retained original finite birth/physical fence/absolute20min/sourcecadence/close-onlyunknown/ownedstop',async()=>{
 const s=await readFile(new URL('./current-runtime-catalog-diagnostic-run.mjs',import.meta.url),'utf8');
 for(const token of ['budget=createBudget(Date.now())','preparePublishedCurrentReference({plan,policy,target','createCapturedQueryBoundary({budget})',"if(main&&!boundary.gate.quarantined())",'boundary.commit(()=>query(`CREATE DATABASE',"await birthCheck();if(foreground)",'stopForeground(foreground)',"unix_socket_directories=''",'scram-sha-256','--pwfile=/dev/stdin',"await fullSources('post-stop',true);result.sourcePostflight=true",'noIssuerCreated:true','noExpectedOrReviewCreated:true','7703089336081934099','7703096890285320019','mtimeNs','ctimeNs'])assert.ok(s.includes(token),token);
 assert.match(s,/beforeTriggers\.length===954/);assert.match(s,/JSON\.stringify\(afterTriggers\)===JSON\.stringify\(beforeTriggers\)/);assert.match(s,/await runtimeLease.query\('COMMIT'\)/);
});
test('audited original error and close cause remain separate and redacted',()=>{
 const a=Object.assign(new Error('SECRET SQL'),{code:'42501'}),b=Object.assign(new Error('close'),{code:'CLOSE'}),e=new AggregateError([a,b],'both',{cause:a}),out=auditError(e,s=>s.replaceAll('SECRET','[REDACTED]'));
 assert.equal(out.cause.code,'42501');assert.equal(out.errors[0].code,'42501');assert.equal(out.errors[1].code,'CLOSE');assert.doesNotMatch(JSON.stringify(out),/SECRET/);
});

test('mandatory self pins name the actual catalog-diagnostic leaves, never fake shorter aliases',async()=>{
 const s=await readFile(new URL('./current-runtime-catalog-diagnostic-run.mjs',import.meta.url),'utf8');
 assert.ok(s.includes("const required=['current-runtime-catalog-diagnostic-run.mjs','current-runtime-catalog-diagnostic-run.offline.test.mjs'"));
 assert.doesNotMatch(s,/'current-runtime-diagnostic-run(?:\.offline\.test)?\.mjs'/);
});

test('raw dependency export covers both directions of trigger/constraint/index without filtering kind or subid',()=>{
 const q=INTERNAL_TRIGGER_BINDINGS_SQL;assert.match(q,/FROM pg_depend d WHERE/);assert.match(q,/to_jsonb\(d\)/);
 for(const text of ["d.classid='pg_trigger'::regclass AND d.objid=t.oid","d.refclassid='pg_trigger'::regclass AND d.refobjid=t.oid","d.classid='pg_constraint'::regclass AND d.objid=con.oid","d.refclassid='pg_constraint'::regclass AND d.refobjid=con.oid","d.classid='pg_class'::regclass AND d.objid=con.conindid","d.refclassid='pg_class'::regclass AND d.refobjid=con.conindid",'pg_identify_object(d.classid,d.objid,d.objsubid)','pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid)'])assert.ok(q.includes(text),text);
 assert.doesNotMatch(q,/d\.(?:deptype|objsubid|refobjsubid)\s*=/);assert.match(q,/coalesce\(jsonb_agg/);
});
