/** Control protocol tests; invented tuple is synthetic, never a PG observation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deriveQaInstaller,validateQaPrefixPlan,readQaOriginalKey,readQaPrefixAdapter22,sourceOnlyDatabaseGate22,V22_BODY_SHA256,EMPTY_TABLES22} from './qa-prefix-bind.mjs';
const tuple=()=>({database:'erp_rewrite_20261022_r1',databaseOid:'424242',ownerRole:'erp_rewrite_owner_20261022',actingRole:'erp_rewrite_runtime_20261022',sessionUser:'erp_rewrite_runtime_20261022',serverAddress:null,serverPort:null,postmasterStart:'2030-01-01 00:00:00.123456+00',systemIdentifier:'1234567890123456789',socketDirectory:'/SYNTHETIC_NOT_ACTUAL_QA/socket'});
const sourceRoot='/SYNTHETIC_NOT_ACTUAL_QA/source';
const ref=path=>({path,bytes:1,sha256:'a'.repeat(64)});
function plan(){return{version:'C_V22_QA_PREFIX_BIND_PLAN_V1',registrationId:'SYNTHETIC_PROTOCOL_ONLY',deadlineUtc:'2030-01-02T00:00:00Z',operation:'PREPARE_INSTALLER',qaTuple:tuple(),qaConnection:null,qaRuntimeReview:null,sourceRoot,
 sourceSql:{...ref(sourceRoot+'/adapters/postgres/patches/0026-v22-staged-prefix-bind.sql'),sha256:'980c4f58dd7fc92290ab104d0253880fa25937a33ac643f5858e2368dd1a5750'},parentReview:ref('/SYNTHETIC_NOT_ACTUAL_QA/parent.json'),hostJob:null,firstBind:null,modules:null,authority:ref('/SYNTHETIC_NOT_ACTUAL_QA/C.json'),fixture:ref('/SYNTHETIC_NOT_ACTUAL_QA/fixture.json'),outputDirectory:'/SYNTHETIC_NOT_ACTUAL_QA/output'};}
const originalSql=()=>readFile('/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022/adapters/postgres/patches/0026-v22-staged-prefix-bind.sql','utf8');
test('QA installer pure derivation replaces exact actual target prestate only and retains frozen business body/131 parent',async()=>{
 const original=await originalSql(),derived=deriveQaInstaller(original,tuple());
 assert.equal(createHash('sha256').update(derived.split('$v22$')[1]).digest('hex'),V22_BODY_SHA256);
 assert.equal(derived.split('$v22$')[1],original.split('$v22$')[1]);assert.equal(derived.split('$v22$')[2],original.split('$v22$')[2]);
 assert.ok(derived.includes("datname=current_database())<>'424242'"));assert.ok(derived.includes("pg_postmaster_start_time()<>'2030-01-01 00:00:00.123456+00'"));
 assert.ok(derived.includes("current_user<>'erp_rewrite_owner_20261022'"));assert.ok(derived.includes('inet_server_addr() IS NOT NULL'));assert.ok(derived.includes("<>131"));
 assert.equal((derived.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);assert.equal(derived.includes('SECURITY DEFINER'),false);
});
test('QA installer refuses original production instance, missing isolation identity and any changed body/parent',async()=>{
 const sql=await originalSql();for(const change of [{postmasterStart:'2026-10-04 08:16:07.895273+00'},{systemIdentifier:undefined},{socketDirectory:'relative'},{actingRole:'erp_rewrite_owner_20261022'},{serverAddress:'127.0.0.1'}])assert.throws(()=>deriveQaInstaller(sql,{...tuple(),...change}));
 assert.throws(()=>deriveQaInstaller(sql.replace('Actual complete prefix members differ','CHANGED_GUARD'),tuple()),{code:'QA_FROZEN_SQL_REQUIRED'});
 assert.throws(()=>deriveQaInstaller(sql.replace('1027659','999'),tuple()),{code:'QA_FROZEN_SQL_REQUIRED'});
});
test('QA plan requires exact isolated registration, new tuple and frozen source; arbitrary SQL/pool options cannot enter',()=>{
 assert.equal(validateQaPrefixPlan(plan(),Date.parse('2029-01-01T00:00:00Z')).operation,'PREPARE_INSTALLER');
 for(const change of [{sql:'DROP TABLE'},{pool:{}},{sourceSql:{...plan().sourceSql,sha256:'0'.repeat(64)}},{qaTuple:{...tuple(),database:'production_other'}},{deadlineUtc:'2020-01-01T00:00:00Z'}])assert.throws(()=>validateQaPrefixPlan({...plan(),...change},Date.parse('2029-01-01T00:00:00Z')));
 assert.equal(EMPTY_TABLES22.length,17);assert.equal(new Set(EMPTY_TABLES22).size,17);
});
test('source-only database gate never returns an original or QA database capability',()=>{
 const gate=sourceOnlyDatabaseGate22();assert.deepEqual(Reflect.ownKeys(gate),['ready']);assert.equal(Object.isFrozen(gate),true);
 for(let i=0;i<2;i++)assert.throws(()=>gate.ready(),{code:'QA_ORIGINAL_SOURCE_DATABASE_ACCESS_PROHIBITED'});
});
function readFixture({identity={},receipt=[],rollbackError=false}={}){
 const t=tuple(),calls=[],released=[];let checked=0;
 const command={actorAccountId:'22000000-0000-4000-8000-000000000001',batchId:'22000000-0000-4000-8000-000000000002',requestKey:'SYNTHETIC_ORIGINAL_KEY'};
 const c={async query(sql,values=[]){calls.push({sql,values});if(sql==='ROLLBACK'&&rollbackError)throw Object.assign(Error('SYNTHETIC_READBACK_ROLLBACK_LOST'),{code:'SYNTHETIC_READBACK_ROLLBACK_LOST'});
  if(sql.includes('v22-qa:identity'))return{rows:[{database:t.database,database_oid:t.databaseOid,acting_role:t.actingRole,session_user:t.sessionUser,server_address:null,server_port:null,postmaster_start:t.postmasterStart,readonly:'on',...identity}]};
  if(sql.includes('v22-qa:original-key')){assert.deepEqual(values,[command.actorAccountId,command.requestKey]);return{rows:receipt};}
  if(sql.includes('v22-qa:checkpoint'))return{rows:[{status:'STAGED',sequence:2,cursor:22,full_bound:false}]};
  assert.ok(sql.startsWith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')||sql==='ROLLBACK');return{rows:[]};},release(error){released.push(error);}};
 const runtime={async assertReady(value,purpose){assert.equal(value,c);assert.equal(purpose,'IMPORT_STAGE');checked++;}};
 return{run:()=>readQaOriginalKey({async connect(){return c;}},runtime,t,command,'f'.repeat(64)),calls,released,checked:()=>checked};
}
test('original key readback is RRRO on exact QA identity, fixed SELECT only and no source/execute retry',async()=>{
 const f=readFixture(),r=await f.run();assert.deepEqual(r.receipts,[]);assert.equal(r.rollbackReturned,true);assert.equal(r.automaticReplay,false);assert.equal(r.prefixFullContentsUnchanged,'NOT_INFERRED_FROM_METADATA');
 assert.equal(f.checked(),1);assert.equal(f.calls.at(-1).sql,'ROLLBACK');assert.equal(f.released.length,1);assert.equal(f.released[0],undefined);
 assert.equal(f.calls.filter(x=>x.sql.includes('v22-qa:')).length,3);assert.ok(f.calls.every(x=>!/INSERT|UPDATE|DELETE|FOR SHARE|FOR UPDATE|COMMIT/.test(x.sql)));
});
test('wrong actual target/session/postmaster/read-only state rejects before original key query and discards lease',async t=>{
 for(const identity of [{database_oid:'1'},{acting_role:'erp_rewrite_owner_20261022'},{session_user:'OWNER'},{postmaster_start:'OTHER'},{readonly:'off'}])await t.test(JSON.stringify(identity),async()=>{const f=readFixture({identity});await assert.rejects(f.run(),{code:'QA_ACTUAL_READBACK_TARGET_MISMATCH'});assert.equal(f.calls.some(x=>x.sql.includes('v22-qa:original-key')),false);assert.equal(f.calls.at(-1).sql,'ROLLBACK');assert.ok(f.released[0] instanceof Error);});
});
test('changed original receipt hash or missing paired prefix audit refuses committed recovery',async()=>{
 const good={id:'22000000-0000-4000-8000-000000000003',request_hash:'f'.repeat(64),action:'IMPORT_BIND_FULL_SOURCE',target_type:'IMPORT',target_id:'22000000-0000-4000-8000-000000000002',status:'COMMITTED',audit_count:1,exact_prefix_audit_count:1};
 for(const change of [{request_hash:'0'.repeat(64)},{exact_prefix_audit_count:0},{audit_count:2},{target_type:'OTHER'}]){const f=readFixture({receipt:[{...good,...change}]});await assert.rejects(f.run(),{code:'QA_ORIGINAL_RECEIPT_MISMATCH'});assert.equal(f.calls.at(-1).sql,'ROLLBACK');}
});
test('lost read-only ROLLBACK is discarded once and never retried as success',async()=>{
 const f=readFixture({rollbackError:true});await assert.rejects(f.run(),{code:'SYNTHETIC_READBACK_ROLLBACK_LOST'});assert.equal(f.calls.filter(x=>x.sql==='ROLLBACK').length,1);assert.ok(f.released[0] instanceof Error);
});
test('actual178 prepared target/installer preserve original source and exact body without claiming runnable metadata or PG execution',async()=>{
 const input=JSON.parse(await readFile(new URL('./QA178-INPUT.json',import.meta.url),'utf8'));
 const sql=await readFile(new URL('./INSTALL-QA178.sql',import.meta.url),'utf8');
 assert.equal(input.actualQaTuple.database,'erp_rewrite_20261022_r1');assert.equal(input.actualQaTuple.databaseOid,'16391');
 assert.equal(input.actualQaTuple.systemIdentifier,'7701337335828107278');assert.equal(input.originalSystemIdentifier,'7691989034661916697');
 assert.equal(input.actualQaTuple.postmasterStart,'2026-10-27 13:22:19.696753+00');
 assert.equal(input.originalSourceBinding.target.postmasterStartedAt,'2026-10-04 08:16:07.895273+00');
 assert.equal(sql,deriveQaInstaller(await originalSql(),input.actualQaTuple));assert.equal(createHash('sha256').update(sql.split('$v22$')[1]).digest('hex'),V22_BODY_SHA256);
 assert.equal(input.executionReady,false);assert.equal(input.installer.applied,false);assert.equal(input.requiredBeforeRun.qaCurrentV22CanonicalAndIndependentReview,null);
 assert.equal(input.originalSourceJobBaseline.executableAsIs,false);assert.equal(input.originalSourceDatabaseAccess,'PROHIBITED');
 assert.throws(()=>validateQaPrefixPlan(input),{code:'QA_EXACT_REGISTRATION_REQUIRED'});
});
function prefixReadFixture(extra=false){
 const t=tuple(),calls=[],released=[];let readonly=false,captured=0,verified=0;
 const command={action:'IMPORT_BIND_FULL_SOURCE',actorAccountId:'22000000-0000-4000-8000-000000000001',batchId:'22000000-0000-4000-8000-000000000002',requestKey:'SYNTHETIC_PREFIX_READ',expectedSequence:2,expectedCursor:22};
 const proof={version:'CORE_STAGED_PREFIX_BIND_V22',groups:[['HEADERS',2,2],['TRANSFER_LINES',1,1],['PRODUCTS',1,1],['SKUS',1,2],['STOCK_CONTRIBUTORS',1,1],['SCHEMES',0,6]].map(([name,s,n])=>({name,source:{rows:s,sha256:'a'.repeat(64)},typed:{rows:n,sha256:'b'.repeat(64)}})),skuRecords:{rows:1,sha256:'c'.repeat(64)}};
 const c={async query(sql,values=[]){calls.push(sql);if(sql.startsWith('BEGIN')){readonly=true;return{rows:[]};}if(sql==='ROLLBACK'){readonly=false;return{rows:[]};}assert.equal(readonly,true);
  if(sql.includes('prefix-identity'))return{rows:[{database:t.database,database_oid:t.databaseOid,acting_role:t.actingRole,session_user:t.sessionUser,server_address:null,server_port:null,postmaster_start:t.postmasterStart,readonly:'on'}]};
  if(sql.includes('prefix-batch')){assert.deepEqual(values,[command.batchId]);return{rows:[{source_name:'SYNTHETIC_ORIGINAL_SOURCE',source_hash:'a'.repeat(64),cutoff_at:'2026-01-01T00:00:00.000000Z',status:'STAGED',history_payload_hash:null,history_expected_counts:null,sequence:2,cursor:22}]};}
  assert.ok(sql.includes('prefix-fullset-counts'));return{rows:[...proof.groups.map(g=>({name:g.name,source_rows:g.source.rows,typed_rows:g.typed.rows+(extra&&g.name==='SKUS'?1:0)})),{name:'SKU_RECORDS',source_rows:0,typed_rows:1}]};
 },release(e){released.push(e);}};
 const authority={async capture(value){assert.equal(readonly,true);assert.equal(value,command);captured++;}};
 const options={pool:{async connect(){return c;}},runtime:{async assertReady(value,purpose){assert.equal(value,c);assert.equal(purpose,'IMPORT_STAGE');}},target:t,command,authority,
  async verifyPrefix(client,cmd,batch,source){assert.equal(client,c);assert.equal(readonly,true);assert.equal(batch.source_name,'SYNTHETIC_ORIGINAL_SOURCE');assert.equal(source,authority);await source.capture(cmd);verified++;return proof;}};
 return{run:()=>readQaPrefixAdapter22(options),calls,released,captured:()=>captured,verified:()=>verified};
}
test('READONLY_PREFIX_ADAPTER keeps the production verification call inside RRRO and proves coverage without BIND or COMMIT',async()=>{
 const f=prefixReadFixture(),r=await f.run();assert.equal(f.captured(),1);assert.equal(f.verified(),1);assert.equal(r.scope,'READONLY_PREFIX_ADAPTER');assert.equal(r.coverage.length,7);
 assert.equal(r.rollbackReturned,true);assert.equal(r.bindExecuted,false);assert.equal(r.businessDml,false);assert.equal(r.commitAttempted,false);assert.equal(r.deferredGuardsExecuted,false);assert.equal(r.productionBodyPositiveTested,false);
 assert.equal(f.calls[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(f.calls.at(-1),'ROLLBACK');assert.deepEqual(f.released,[undefined]);assert.ok(f.calls.every(s=>!/\b(?:INSERT|UPDATE|DELETE|COMMIT)\b|assert_core_initialization|FOR SHARE|FOR UPDATE/.test(s)));
});
test('READONLY_PREFIX_ADAPTER refuses extra actual members after per-member proof and rolls back/discards',async()=>{
 const f=prefixReadFixture(true);await assert.rejects(f.run(),{code:'QA_PREFIX_EXTRA_OR_MISSING_ACTUAL_MEMBERS'});assert.equal(f.calls.at(-1),'ROLLBACK');assert.ok(f.released[0] instanceof Error);assert.equal(f.captured(),1);
});
