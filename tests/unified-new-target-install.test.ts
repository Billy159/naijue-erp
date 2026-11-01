/** Source/dispatch fault models only. No PostgreSQL connection or engine. */
import test,{after} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
// URL imports deliberately load the actual JS modules rather than test copies.
const source=await import(new URL('../scripts/release/unified-install/source-plan.mjs',import.meta.url).href);
const targets=await import(new URL('../scripts/release/unified-install/target-contract.mjs',import.meta.url).href);
const runner=await import(new URL('../scripts/release/unified-install/runner.mjs',import.meta.url).href);
const approval=await import(new URL('../scripts/release/unified-install/approval.mjs',import.meta.url).href);
const adapters=await import(new URL('../scripts/release/unified-install/physical-adapter.mjs',import.meta.url).href);
const cli=await import(new URL('../scripts/release/unified-install/cli.mjs',import.meta.url).href);
let cohortRoot=process.env.UNIFIED_INSTALL_SOURCE_ROOT;
if(cohortRoot===undefined){
 const {materializeHistoricalOracle,historicalOracleData,closeHistoricalOracle}=await import(new URL('./historical-runtime26/oracle.mjs',import.meta.url).href);
 const oracle=await materializeHistoricalOracle();cohortRoot=historicalOracleData(oracle).root;
 after(async()=>{await closeHistoricalOracle(oracle);});
}
assert.equal(typeof cohortRoot,'string','Explicit or source-verified portable oracle required, never active-root fallback');
const plan=await source.loadUnifiedInstallPlan({sourceRoot:cohortRoot,baseCommit:source.BASE.commit,baseTree:source.BASE.tree,requestedScope:'SCHEMA_ONLY'});
const now=Date.now(),intent={database:'erp_comparison_fresh',admin:'fresh_admin',owner:'fresh_owner',sentinel:'fresh_sentinel',prepare:'fresh_prepare',runtime:'fresh_runtime',host:'127.0.0.1',port:18578};
const birth={systemIdentifier:'7703999999999999999',databaseOid:'16391',postmasterStart:'2026-11-01 00:00:00+00',serverVersionNum:'170011'};
const targetInput={intent,birth,startsAt:now,expiresAt:now+1200000},target=targets.captureFreshTarget(targetInput,now),program=runner.compileUnifiedSchemaProgram({plan,target});
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
test('actual install root is accepted by the unchanged release canonical-path validator',async()=>{
 const {canonicalAbsolute}=await import(new URL('../scripts/release/manifest.mjs',import.meta.url).href);
 await canonicalAbsolute(source.ROOT,'directory');
});
function scripted(options:{failQuery?:(sql:string)=>unknown;failCommit?:(sql:string)=>unknown;failEmit?:(event:Record<string,unknown>)=>unknown}={}){
 const sql:string[]=[],events:Record<string,unknown>[]=[];let quarantined=false;
 const ops={async query(text:string){assert.equal(quarantined,false,'No SQL after uncertain COMMIT');sql.push(text);const e=options.failQuery?.(text);if(e)throw e;return{rows:[]};},async commit(text:string){assert.equal(quarantined,false);sql.push(text);const e=options.failCommit?.(text);if(e){quarantined=true;throw e;}return{rows:[]};},async emit(event:Record<string,unknown>){events.push(event);const e=options.failEmit?.(event);if(e)throw e;},async assertSources(){},quarantined:()=>quarantined};
 return{ops,sql,events};
}
test('true paired40 source plan/complete137/DAG and V6-V7-V8 nonreplay lineage',()=>{
 const p=source.describeUnifiedInstallPlan(plan);assert.equal(p.expected.files,40);assert.equal(p.expected.finalRoutines,137);assert.equal(p.graph.length,40);assert.equal(p.graph.filter((r:{migrationId:number|null})=>r.migrationId!==null).length,26);assert.equal(p.routines.length,137);assert.ok(p.preparationTransitions.every((r:{replayAfterFinal40:boolean})=>r.replayAfterFinal40===false));assert.equal(p.installed,false);assert.equal(p.phaseA.rawReceiptLocallyVerified,false);
 assert.throws(()=>source.describeUnifiedInstallPlan({...plan}));
});
test('generic custom names and cross-cluster reused OID accepted, full target bound',()=>{
 const t=targets.targetDescriptor(target);assert.equal(t.intent.database,'erp_comparison_fresh');assert.equal(t.birth.databaseOid,'16391');
 const guard=targets.freshTargetGuard(target,{requireEmpty:true});for(const text of [intent.database,birth.systemIdentifier,birth.databaseOid,birth.postmasterStart,"session_replication_role","pg_control_system","pg_stat_activity","pg_auth_members","pg_default_acl","pg_prepared_xacts"])assert.ok(guard.includes(text));assert.ok(guard.includes("nspname='naijue_erp'"));assert.throws(()=>targets.targetDescriptor({...target}));
});
test('old cluster, unsafe names, live defaults, aliasroles, incomplete or expired target rejected',()=>{
 for(const changed of [{birth:{...birth,systemIdentifier:'7703158405630191866'}},{intent:{...intent,database:'postgres'}},{intent:{...intent,owner:intent.admin}},{intent:{...intent,host:'prod.example'}},{intent:{...intent,port:5432}},{intent:{...intent,database:'x;DROP DATABASE postgres'}},{birth:{...birth,serverVersionNum:'150000'}},{expiresAt:now+1200001},{expiresAt:now-1}])assert.throws(()=>targets.captureFreshTarget({...targetInput,...changed},now));
 let accessed=0;assert.throws(()=>targets.captureFreshTarget({...targetInput,get intent(){accessed++;return intent;}},now));assert.equal(accessed,0);
});
test('dryrun accepts only source flags, never connect/apply or legacy continuation',async()=>{
 assert.equal(cli.parseInstallArgs(['--source-root','/source']).requestedScope,'SCHEMA_ONLY');assert.throws(()=>cli.parseInstallArgs(['--apply','/approval']));assert.throws(()=>cli.parseInstallArgs(['--source-root','/source','--source-root','/other']));
 await assert.rejects(source.loadUnifiedInstallPlan({sourceRoot:cohortRoot,baseCommit:'a'.repeat(40),baseTree:source.BASE.tree,requestedScope:'SCHEMA_ONLY'}));
});
test('non-schema scope precisely blocked before apply and no generic339/full-app claim',async()=>{
 const p=await source.loadUnifiedInstallPlan({sourceRoot:cohortRoot,baseCommit:source.BASE.commit,baseTree:source.BASE.tree,requestedScope:'FULL_APPLICATION'});assert.equal(source.describeUnifiedInstallPlan(p).status,'BLOCKED_REVIEWED_ACL_INPUTS_REQUIRED');assert.throws(()=>runner.compileUnifiedSchemaProgram({plan:p,target}),/ACL_SCOPE_UNREVIEWED/);
});
test('explicit external approval binds plan target successorcommit/window, not e007 SHA reuse',()=>{
 const p=source.describeUnifiedInstallPlan(plan),t=targets.targetDescriptor(target);
 const v={version:'UNIFIED_NEW_EMPTY_SCHEMA_EXECUTION_V1',decision:'AUTHORIZE_EXACT_FRESH_SCHEMA_SOURCE_ONLY',scope:'FRESH_ISOLATED_SCHEMA_ONLY_NOT_RUNTIME',planSha256:p.planSha256,targetSha256:sha(JSON.stringify(t)),sourceCommit:'b'.repeat(40),startsAt:t.startsAt,expiresAt:t.expiresAt,productionAuthorized:false,unknownOutcomePolicy:'QUARANTINE_CLOSE_READBACK_ORIGINAL_KEYS_NO_REPLAY',resourcePolicy:'CLOSE_CAPTURED_CLIENT_PRESERVE_DATABASE_AND_JOURNAL'};
 const bytes=Buffer.from(JSON.stringify(v)),a=approval.readSchemaExecutionApproval({bytes,trustedSha256:sha(bytes),plan,target},now);assert.ok(a);assert.throws(()=>approval.assertSchemaExecutionApproval({...a},plan,target));
 for(const change of [{productionAuthorized:true},{sourceCommit:source.BASE.commit},{targetSha256:'a'.repeat(64)},{planSha256:'a'.repeat(64)},{unknownOutcomePolicy:'RETRY'}]){const b=Buffer.from(JSON.stringify({...v,...change}));assert.throws(()=>approval.readSchemaExecutionApproval({bytes:b,trustedSha256:sha(b),plan,target},now));}
});
test('fake adapter/query/gate cannot enter actual runner or capture authority',async()=>{
 await assert.rejects(runner.runUnifiedSchemaInstall({program,adapter:{query:async()=>({rows:[]})},journalDirectory:'/tmp/not-created-by-test'}),/GENUINE_LIVE_CAPTURED/);
 await assert.rejects(adapters.captureUnifiedInstallClient({client:{query:async()=>({rows:[]})},plan,target,program,approval:{},sourceProof:{}}),/ORIGINAL_EXTERNAL_SCHEMA_APPROVAL/);
});
test('native adapter allowlist contains fixed source/canonical only, never arbitrary SQL',async()=>{
 const allowed=await runner.schemaProgramAllowedQueries(program,plan,target);assert.ok(allowed.includes('ROLLBACK'));assert.ok(allowed.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));assert.ok(!allowed.includes('DROP DATABASE postgres'));assert.ok(allowed.some((sql:string)=>sql.includes('observed_canonical_text')));
});
test('connected is insufficient: idle ReadyForQuery and exclusive empty queues required',()=>{
 const good={pipeline:false,readyForQuery:true,_activeQuery:null,_queryQueue:[],_sentQueryQueue:[],_queryable:true,_ending:false,_ended:false,_txStatus:'I'};assert.equal(adapters.assertInstallClientProtocolState(good,{idle:true}),undefined);assert.equal(adapters.assertInstallClientProtocolState({...good,_activeQuery:undefined},{idle:true}),undefined);
 for(const change of [{_txStatus:'T'},{_txStatus:'E'},{_queryQueue:[{}]},{_sentQueryQueue:[{}]},{_activeQuery:{}},{readyForQuery:false},{pipeline:true},{_ending:true}])assert.throws(()=>adapters.assertInstallClientProtocolState({...good,...change},{idle:true}));
 let called=0;assert.throws(()=>adapters.assertInstallClientProtocolState({...good,get _txStatus(){called++;return'I';}},{idle:true}));assert.equal(called,0);
});
test('scripted source dispatch counts714+original131 carrier only, not installation',async()=>{
 const f=scripted(),result=await runner.modelUnifiedSchemaDispatchForTests(program,f.ops);assert.equal(result.submittedOriginalStatements,714);assert.equal(result.installed,false);assert.equal(result.status,'SCRIPTED_DISPATCH_MODEL_NOT_DATABASE_INSTALLATION');assert.equal(f.events.filter(e=>e.phase==='COMMIT_ACKNOWLEDGED').length,41);assert.equal(new Set(f.events.filter(e=>e.phase==='COMMIT_ACKNOWLEDGED').map(e=>e.commitKey)).size,41);assert.equal(f.events.filter(e=>e.phase==='SOURCE_STATEMENT_ACKNOWLEDGED').length,714);
 const carrier=f.sql.find(s=>s.includes('DO $unified_parent$'));assert.ok(carrier);assert.ok(carrier.includes('UNIFIED_V22_FULL_PARENT_MISMATCH'));assert.ok(carrier.includes('REVOKE UPDATE(history_expected_counts,history_payload_hash)'));assert.equal(sha(carrier),runner.describeUnifiedSchemaProgram(program).carrierSha256);
});
test('ordinary and carrier uncertain ACK stop all SQL including rollback and later files',async()=>{
 for(const carrier of [false,true]){const error=new Error('SCRIPTED_UNKNOWN_ACK'),f=scripted({failCommit:sql=>carrier===sql.includes('DO $unified_parent$')?error:undefined});await assert.rejects(runner.modelUnifiedSchemaDispatchForTests(program,f.ops),(e:unknown)=>e===error);assert.equal(f.ops.quarantined(),true);assert.ok(!f.sql.includes('ROLLBACK'));assert.ok(f.events.some(e=>e.phase==='COMMIT_PENDING'));}
});
test('ordinary source failure rolls back once, original error preserved; rollback error aggregates',async()=>{
 const original=new Error('SCRIPTED_DDL_FAILURE'),rollback=new Error('SCRIPTED_ROLLBACK_FAILURE');
 for(const failRollback of [false,true]){let failed=false;const f=scripted({failQuery:sql=>{if(sql==='ROLLBACK')return failRollback?rollback:undefined;if(!failed&&sql.startsWith('SET LOCAL search_path')){failed=true;return original;}}});await assert.rejects(runner.modelUnifiedSchemaDispatchForTests(program,f.ops),(e:unknown)=>failRollback?e instanceof AggregateError&&e.cause===original&&e.errors[1]===rollback:e===original);assert.equal(f.sql.at(-1),'ROLLBACK');}
});
test('journal failure before commit rolls back; after ACK never replay/rollback committed file',async()=>{
 for(const phase of ['COMMIT_PENDING','COMMIT_ACKNOWLEDGED']){const error=new Error('SCRIPTED_DISK_FAILURE'),f=scripted({failEmit:event=>event.phase===phase?error:undefined});await assert.rejects(runner.modelUnifiedSchemaDispatchForTests(program,f.ops),(e:unknown)=>e===error);assert.equal(f.sql.includes('ROLLBACK'),phase==='COMMIT_PENDING');}
});
test('durable new journal wx/nooverwrite and recovery inspect never authorizes replay',async()=>{
 const parent=await mkdtemp(path.join(tmpdir(),'unified-install-pure-'));try{const directory=path.join(parent,'journal'),j=await runner.createInstallJournal(directory,program),checkpoint=runner.describeUnifiedSchemaProgram(program).commitCheckpoints[0];await j.append({phase:'COMMIT_PENDING',...checkpoint});const raw=await readFile(path.join(directory,'000001.json')),row=JSON.parse(raw.toString());assert.equal(j.summary().lastSha256,sha(raw));const r=runner.inspectInstallRecovery(program,[row]);assert.deepEqual(r.unresolvedCommitFiles,[1]);assert.equal(r.automaticResumeAuthorized,false);await assert.rejects(runner.createInstallJournal(directory,program));assert.throws(()=>runner.inspectInstallRecovery(program,[{...row,program:{...row.program,targetSha256:'a'.repeat(64)}}]));}finally{await rm(parent,{recursive:true,force:true});}
});
