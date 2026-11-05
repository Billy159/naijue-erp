import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyntheticPackage, repinSyntheticPackage } from './fixtures/unified-import/synthetic-package.ts';
import { sha256 } from '../packages/application/src/unified-import-contract.ts';
import { buildUnifiedImportPlan, executeUnifiedImportPlan, recoverUnifiedImportOperation, UnifiedImportExecutionError } from '../packages/application/src/unified-import-execution.ts';
import { createStandardImportClient } from '../tools/unified-import/execution-client.ts';

const packageInput = () => {
  const pkg=createSyntheticPackage();
  const manifestBytes=Buffer.from(JSON.stringify(pkg.manifest,null,2)+'\n');
  return {pkg,manifestBytes,expectedManifestSha256:sha256(manifestBytes),allowSynthetic:true};
};

test('plan is deterministic, closed ordinary data, preserves all occurrences and has no credential fields',()=>{
  const input=packageInput(), a=buildUnifiedImportPlan(input), b=buildUnifiedImportPlan(input);
  assert.deepEqual(a,b);assert.equal(a.source_namespace,'synthetic.unified.v1');
  assert.equal(a.counts.master_occurrences,26);assert.equal(a.counts.master_files,20);
  assert.equal(a.counts.sales_settlements,16);assert.equal(a.counts.explicit_keys,2);
  assert.ok(!JSON.stringify(a).includes('session_token'));assert.ok(!JSON.stringify(a).includes('password'));
});
test('plan refuses non-ready, wrong manifest hash, bad source and unproved cutoff before invoking a client',()=>{
  const input=packageInput();
  assert.throws(()=>buildUnifiedImportPlan({...input,expectedManifestSha256:'0'.repeat(64)}),/MANIFEST/);
  input.pkg.manifest.stage='CLEANED';assert.throws(()=>buildUnifiedImportPlan(input),UnifiedImportExecutionError);
  const bad=packageInput();bad.pkg.records.sales_settlement!.pop();repinSyntheticPackage(bad.pkg);
  bad.manifestBytes=Buffer.from(JSON.stringify(bad.pkg.manifest,null,2)+'\n');bad.expectedManifestSha256=sha256(bad.manifestBytes);
  assert.throws(()=>buildUnifiedImportPlan(bad),/PREFLIGHT/);
});
test('plan requires explicit synthetic opt-in and preserves explicit zero without inventing a key',()=>{
  const input=packageInput();assert.throws(()=>buildUnifiedImportPlan({...input,allowSynthetic:false}),/PREFLIGHT/);
  const p=buildUnifiedImportPlan(input);assert.deepEqual(p.baseline_rows.map(r=>r.fields.quantity),['100','0']);
});
test('unsafe arbitrary SQL API is not exposed by the finite adapter',()=>{
  const c=createStandardImportClient({query:async()=>({rows:[]}),discard(){}});
  assert.equal('query' in c,false);assert.equal('executeSql' in c,false);
});

import { STANDARD_IMPORT_PROTOCOL, standardImportRequest, decodeStandardImportReply } from '../packages/application/src/unified-import-execution.ts';
import type { StandardImportRequest, StandardImportReply, StandardImportExecutionClient, StandardImportTarget } from '../packages/application/src/unified-import-execution.ts';
import { StandardImportTransportError } from '../tools/unified-import/execution-client.ts';
const target:StandardImportTarget={protocol:STANDARD_IMPORT_PROTOCOL,system_identifier:'123456789',database_oid:'42',database_name:'synthetic_isolated',catalog_sha256:'a'.repeat(64)};
const planned=()=>buildUnifiedImportPlan({...packageInput(),target});
function response(r:StandardImportRequest,state:'ABSENT'|'COMMITTED'='COMMITTED'):StandardImportReply {
  const common={protocol:STANDARD_IMPORT_PROTOCOL,operation_id:r.operation_id,batch_id:r.batch_id};
  if(state==='ABSENT')return{...common,state,request_sha256:null,sequence:null,cursor:null,receipt:null};
  const zero=r.payload.mode==='NEW_EMPTY'||r.payload.mode==='STAGE';
  return{...common,state,request_sha256:'b'.repeat(64),sequence:zero?0:typeof r.payload.expected_sequence==='number'?r.payload.expected_sequence+1:1,cursor:zero?0:26,receipt:{status:'COMMITTED'}};
}
function fakeClient(plan=planned()) {
  const called:string[]=[];
  const client:StandardImportExecutionClient={protocol:STANDARD_IMPORT_PROTOCOL,inspectTarget:async()=>{called.push('inspect');return{...plan.target!,current_user:'owner',session_user:'owner',role_mode:'isolated_importer',proof_scope:'SET_ROLE_ONLY_NOT_NONOWNER_LOGIN'};},initialize:async r=>response(r),masterChunk:async r=>{called.push('master');return response(r);},baselineKeys:async r=>{called.push('keys');return response(r);},documentChunk:async r=>{called.push('documents');return response(r);},publish:async r=>{called.push('publish');return response(r);},status:async r=>{called.push('status');return response(r);},verify:async()=>{throw new Error('not configured');}};
  return{client,called};
}
test('execute binds exact target and stops after failed atomic chunk without replaying or publishing',async()=>{
  const p=planned(),{client,called}=fakeClient(p),r=standardImportRequest(p,'MASTER',0,{expected_sequence:0,rows:[]});
  client.baselineKeys=async()=>{called.push('keys');throw new StandardImportTransportError('ROLLED_BACK',r.operation_id);};
  await assert.rejects(executeUnifiedImportPlan(p,client,[{method:'masterChunk',request:r},{method:'baselineKeys',request:r},{method:'publish',request:r}]),/ROLLED_BACK/);
  assert.deepEqual(called,['inspect','master','keys']);
});
test('changed target or tampered plan is rejected before any write',async()=>{
  const p=planned(),{client,called}=fakeClient(p),r=standardImportRequest(p,'MASTER',0,{});
  client.inspectTarget=async()=>({...target,database_oid:'43',current_user:'owner',session_user:'owner',role_mode:'isolated_importer',proof_scope:'SET_ROLE_ONLY_NOT_NONOWNER_LOGIN'});
  await assert.rejects(executeUnifiedImportPlan(p,client,[{method:'masterChunk',request:r}]),/TARGET_CHANGED/);assert.deepEqual(called,[]);
  p.baseline_rows[0]!.fields.quantity='999';await assert.rejects(executeUnifiedImportPlan(p,client,[]),/PLAN_CONTENT_MISMATCH/);
});
test('unknown operation resolves only original key; ABSENT never triggers automatic retry',async()=>{
  const p=planned(),{client,called}=fakeClient(p),r=standardImportRequest(p,'MASTER',0,{expected_sequence:0,rows:[]});
  client.status=async original=>{assert.deepEqual(original,r);called.push('status');return response(original,'ABSENT');};
  assert.equal((await recoverUnifiedImportOperation(p,client,r)).state,'ABSENT');assert.deepEqual(called,['inspect','status']);
  await assert.rejects(recoverUnifiedImportOperation(p,client,{...r,plan_sha256:'c'.repeat(64)}),/RECOVERY_REQUEST_MISMATCH/);
});
test('finite adapter commits parameterized function calls and never exposes or embeds session secret',async()=>{
  const p=planned(),r=standardImportRequest(p,'MASTER',0,{}),seen:{sql:string;values?:unknown[]}[]=[],secret='s'.repeat(43);
  const c=createStandardImportClient({async query(sql,values){seen.push({sql,...(values?{values}:{})});return{rows:sql.startsWith('SELECT')?[{result_json:JSON.stringify(response(r))}]:[]};},discard(){throw new Error('must not discard success');}},{sessionToken:()=>secret});
  assert.equal((await c.masterChunk(r)).state,'COMMITTED');assert.equal(seen[0]!.sql,'BEGIN ISOLATION LEVEL READ COMMITTED');assert.equal(seen.at(-1)!.sql,'COMMIT');
  assert.ok(seen[1]!.sql.startsWith('SELECT naijue_erp.standard_import_master_chunk('));assert.equal(seen[1]!.values![1],secret);assert.ok(!seen.map(x=>x.sql).join('\n').includes(secret));
});
test('statement failure rolls back and redacts driver messages, including credentials',async()=>{
  const p=planned(),r=standardImportRequest(p,'MASTER',0,{}),seen:string[]=[];
  const c=createStandardImportClient({async query(sql){seen.push(sql);if(sql.startsWith('SELECT'))throw new Error('password=PRIVATE_RAW_TOKEN');return{rows:[]};},discard(){}},{sessionToken:()=>'t'.repeat(43)});
  await assert.rejects(c.masterChunk(r),e=>e instanceof StandardImportTransportError&&e.outcome==='ROLLED_BACK'&&!String(e).includes('PRIVATE_RAW_TOKEN'));
  assert.equal(seen.at(-1),'ROLLBACK');assert.ok(!seen.includes('COMMIT'));
});
test('unknown COMMIT quarantines original connection and never silently retries',async()=>{
  const p=planned(),r=standardImportRequest(p,'MASTER',0,{}),seen:string[]=[];let discards=0;
  const c=createStandardImportClient({async query(sql){seen.push(sql);if(sql==='COMMIT')throw new Error('transport gone');return{rows:sql.startsWith('SELECT')?[{result_json:JSON.stringify(response(r))}]:[]};},discard(){discards++;}},{sessionToken:()=>'u'.repeat(43)});
  await assert.rejects(c.masterChunk(r),e=>e instanceof StandardImportTransportError&&e.outcome==='UNKNOWN'&&e.operation_id===r.operation_id);
  const count=seen.length;await assert.rejects(c.masterChunk(r),/REJECTED/);assert.equal(seen.length,count);assert.equal(discards,1);assert.ok(!seen.includes('ROLLBACK'));
});
test('invalid or credential-bearing server response rolls back rather than printing/publishing it',async()=>{
  const p=planned(),r=standardImportRequest(p,'MASTER',0,{}),seen:string[]=[],secret='v'.repeat(43);
  const c=createStandardImportClient({async query(sql){seen.push(sql);return{rows:sql.startsWith('SELECT')?[{result_json:JSON.stringify({...response(r),receipt:{extra:secret}})}]:[]};},discard(){}},{sessionToken:()=>secret});
  await assert.rejects(c.masterChunk(r),/ROLLED_BACK/);assert.equal(seen.at(-1),'ROLLBACK');
  assert.throws(()=>decodeStandardImportReply({...response(r),actor:'forged'},r),/SQL_RESPONSE_INVALID/);
});

import { compileStandardImportProgram } from '../packages/application/src/unified-import-execution.ts';
const admin={staff_id:'01234567-0000-0000-0000-000000000001',account_id:'01234567-0000-0000-0000-000000000002',login_name:'SYNTHETIC_CURRENT_ADMIN',staff_name:'SYNTHETIC current provisioned administrator'};
test('actual fresh program stages baseline inactive, separately stages documents, retains 16 settlements and activates last',()=>{
  const p=planned(),program=compileStandardImportProgram(p,admin);
  assert.equal(program.initialize.payload.mode,'NEW_EMPTY');assert.equal(program.initialize.payload.document_batch_id,p.document_batch_id);
  const phases=program.steps.map(s=>[s.method,s.request.payload.phase??s.request.payload.mode??'CHUNK']);
  assert.deepEqual(phases,[['masterChunk','CHUNK'],['baselineKeys','CHUNK'],['publish','BASELINE'],['documentChunk','STAGE'],['documentChunk','CHUNK'],['documentChunk','CHUNK'],['publish','DOCUMENTS']]);
  const masters=program.steps[0]!.request.payload.rows as Record<string,unknown>[];assert.equal(masters.length,26);
  const keys=program.steps[1]!.request.payload.rows as Record<string,unknown>[];assert.equal(keys[1]!.ledger_entry_id,null);assert.equal(typeof keys[0]!.ledger_entry_id,'string');
  const sales=program.steps[4]!.request.payload.rows as Record<string,unknown>[];assert.equal(sales.filter(r=>r.entity_type==='SALES_SETTLEMENT').length,16);
  assert.ok(!JSON.stringify(program).includes('history_'));assert.ok(!JSON.stringify(program).includes('encoded_scrypt'));
  assert.deepEqual(program,compileStandardImportProgram(p,admin));
});

// Public DB commands must have real guarded handlers, never a success fallback.
import { spawnSync } from 'node:child_process';
test('public execution commands fail closed before any connection without explicit private target/config/auth inputs',()=>{
  for(const command of ['inspect-target','apply','status','resume','verify']){
    const r=spawnSync(process.execPath,['tools/unified-import/cli.mjs',command],{encoding:'utf8'});
    assert.notEqual(r.status,0);assert.notEqual(JSON.parse(r.stdout).code,'NOT_IMPLEMENTED');
  }
});

import { resumeUnifiedImportStep, verifyUnifiedImportReceipts } from '../packages/application/src/unified-import-execution.ts';
test('fresh recovery client status lock barrier permits only exact original-key replay after acknowledged ABSENT',async()=>{
  const p=planned(),{client,called}=fakeClient(p),r=standardImportRequest(p,'MASTER',0,{expected_sequence:0,rows:[]});
  client.status=async original=>{called.push('status-barrier');assert.equal(original,r);return response(original,'ABSENT');};
  assert.equal((await resumeUnifiedImportStep(p,client,{method:'masterChunk',request:r})).state,'COMMITTED');
  assert.deepEqual(called,['inspect','status-barrier','inspect','master']);
});
test('committed original-key replay is read back without resending business write; receipt hash mismatch blocks verify',async()=>{
  const p=planned(),{client,called}=fakeClient(p),r=standardImportRequest(p,'MASTER',0,{});
  assert.equal((await resumeUnifiedImportStep(p,client,{method:'masterChunk',request:r})).state,'COMMITTED');
  assert.deepEqual(called,['inspect','status']);
  await assert.rejects(verifyUnifiedImportReceipts(p,client,[r],new Map([[r.operation_id,'c'.repeat(64)]])),/ORIGINAL_REQUEST_HASH_CHANGED/);
});

import { validateStandardImportConnectionConfig } from '../tools/unified-import/execution-client.ts';
test('isolated connection pins actual approved PG57403, never tool persistent-session ID6618',()=>{
  const c={format_version:'STANDARD_IMPORT_CONNECTION_V1',scope:'ISOLATED_SET_ROLE_PROOF',host:'127.0.0.1',port:57403,database:'opt03_synthetic_profile_20261102_v1',user:'SYNTHETIC_PARENT_TEST_LOGIN',password:'SYNTHETIC_PRIVATE_CONFIG_ONLY',role:'erp_unified27_importer_2393dbc6db9581c2'};
  assert.equal(validateStandardImportConnectionConfig(c).port,57403);
  assert.throws(()=>validateStandardImportConnectionConfig({...c,port:6618}),/CONFIG_INVALID/);
  assert.throws(()=>validateStandardImportConnectionConfig({...c,database:'arbitrary_local_database'}),/CONFIG_INVALID/);
  assert.throws(()=>validateStandardImportConnectionConfig({...c,scope:'PRODUCTION_NONOWNER_LOGIN'}),/PROFILE_UNVERIFIED/);
});

test('mutating entrypoint returning ABSENT is rejected before COMMIT, not treated as a successful transaction',async()=>{
  const p=planned(),r=standardImportRequest(p,'MASTER',0,{}),seen:string[]=[];
  const c=createStandardImportClient({async query(sql){seen.push(sql);return{rows:sql.startsWith('SELECT')?[{result_json:JSON.stringify(response(r,'ABSENT'))}]:[]};},discard(){}},{sessionToken:()=>'w'.repeat(43)});
  await assert.rejects(c.masterChunk(r),/ROLLED_BACK/);assert.equal(seen.at(-1),'ROLLBACK');assert.ok(!seen.includes('COMMIT'));
});

import { createNodeScryptPasswords } from '../packages/authentication/src/passwords.ts';
test('initializer uses real current credential codec only as private second argument, never request or receipt',async()=>{
  const p=planned(),r=compileStandardImportProgram(p,admin).initialize,encoded=await createNodeScryptPasswords().hash('SYNTHETIC-unit-only-not-an-account');
  const seen:{sql:string;values?:unknown[]}[]=[];
  const c=createStandardImportClient({async query(sql,values){seen.push({sql,...(values?{values}:{})});return{rows:sql.startsWith('SELECT')?[{result_json:JSON.stringify(response(r))}]:[]};},discard(){}});
  await assert.rejects(c.initialize(r,'legacy-or-invented-hash'),/PRIVATE_CREDENTIAL_FORMAT_INVALID/);assert.equal(seen.length,0);
  const result=await c.initialize(r,encoded);assert.equal(seen[1]!.values![1],encoded);assert.ok(!String(seen[1]!.values![0]).includes(encoded));assert.ok(!JSON.stringify(result).includes(encoded));
});

import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeSyntheticPackage } from './fixtures/unified-import/synthetic-package.ts';
import { loadUnifiedImportPlan } from '../tools/unified-import/execution-plan.ts';
test('offline CLI plan uses same frozen byte loader and exclusive report outside immutable package',async()=>{
  const root=await mkdtemp(join(tmpdir(),'standard-execution-'));
  try{const dir=join(root,'package'),report=join(root,'report');await writeSyntheticPackage(dir);const bytes=await readFile(join(dir,'manifest.json')),hash=sha256(bytes);
    const loaded=await loadUnifiedImportPlan(dir,{expectedManifestSha256:hash,allowSynthetic:true});assert.equal(loaded.counts.sales_settlements,16);
    const args=['tools/unified-import/cli.mjs','plan','--package',dir,'--manifest-sha256',hash,'--offline','--allow-synthetic','--report',report];
    const out=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(out.status,0,out.stdout+out.stderr);assert.equal(JSON.parse(out.stdout).target_bound,false);
    assert.equal(JSON.parse(await readFile(join(report,'execution-plan.json'),'utf8')).manifest_sha256,hash);
    const again=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(again.status,1);assert.deepEqual(await readFile(join(dir,'manifest.json')),bytes);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('registration cutoff comparison retains six fractional digits and accepts only truly equal offset instants',()=>{
  const input=packageInput(),batch=String(input.pkg.records.sales_header![0]!.fields.import_batch_id);
  const registration={batch_id:batch,source_namespace:input.pkg.manifest.source_namespace,source_metadata_sha256:'a'.repeat(64),cutoff_at:'2026-11-02T08:00:00.000001Z'};
  assert.throws(()=>buildUnifiedImportPlan({...input,registration}),/REGISTERED_SOURCE_MISMATCH/);
  assert.equal(buildUnifiedImportPlan({...input,registration:{...registration,cutoff_at:'2026-11-02T08:00:00.000000Z'}}).cutoff_at,'2026-11-02T16:00:00+08:00');
});

import { verifyUnifiedImportState } from '../packages/application/src/unified-import-execution.ts';
test('full verification uses finite native/stock/source server readback, not receipt-only success',async()=>{
  const p=planned(),program=compileStandardImportProgram(p,admin),final=program.steps.at(-1)!.request,{client}=fakeClient(p);
  const documents=[...p.document_rows.sales_header!.map(r=>({kind:'SALES' as const,id:String(r.fields.id),initial_version:Number(r.fields.version),current_version:Number(r.fields.version),state:'UNCHANGED' as const,audit_steps:0})),...p.document_rows.transfer_header!.map(r=>({kind:'TRANSFER' as const,id:String(r.fields.id),initial_version:Number(r.fields.version),current_version:Number(r.fields.version),state:'UNCHANGED' as const,audit_steps:0}))];
  client.verify=async request=>{assert.equal(request,final);return{protocol:STANDARD_IMPORT_PROTOCOL,plan_sha256:p.plan_sha256,batch_id:p.document_batch_id,baseline_batch_id:p.baseline_batch_id,verified:true,documents,source_counts:{...Object.fromEntries([...new Set(p.master_rows.map(r=>r.table))].map(t=>[t.toUpperCase(),p.master_rows.filter(r=>r.table===t).length])),...Object.fromEntries(Object.entries(p.document_rows).map(([t,rows])=>[t.toUpperCase(),rows.length])),INVENTORY_KEY:2,IMPORT_BATCH:3},inventory_keys:p.baseline_rows.map(r=>({warehouse_id:String(r.fields.warehouse_id),sku_id:String(r.fields.sku_id),coverage:r.fields.quantity==='0'?'EXPLICIT_ZERO' as const:'NONZERO' as const,baseline_quantity:String(r.fields.quantity),ledger_total:String(r.fields.quantity),ledger_entries:r.fields.quantity==='0'?0:1,balance_quantity:r.fields.quantity==='0'?null:String(r.fields.quantity),balance_version:r.fields.quantity==='0'?null:1,verified:true as const})),scope:'CURRENT_NATIVE_AND_IMMUTABLE_IMPORT_PROOF_FENCED',proof_scope:'SET_ROLE_ONLY_NOT_NONOWNER_LOGIN'};};
  const result=await verifyUnifiedImportState(p,client,final);assert.equal(result.verified,true);assert.equal(result.inventory_keys[1]!.balance_quantity,null);
  const original=client.verify;client.verify=async r=>({...await original(r),documents:[]});
  await assert.rejects(verifyUnifiedImportState(p,client,final),/VERIFY_DOCUMENT_COVERAGE_MISMATCH/);
});

import { assertStandardImportRoleFacts } from '../tools/unified-import/execution-client.ts';
test('protected NOLOGIN proof rejects owner, superuser, schema create, table writes and unexpected role privileges',()=>{
  const role='erp_unified27_importer_2393dbc6db9581c2',facts={server_version_num:'170011',role_name:role,rolsuper:false,rolcanlogin:false,rolcreaterole:false,rolcreatedb:false,rolbypassrls:false,rolinherit:false,rolreplication:false,rolconnlimit:0,owns_schema:false,owns_database:false,schema_create:false,table_writes:false};
  assert.doesNotThrow(()=>assertStandardImportRoleFacts(facts,role));
  for(const key of ['rolsuper','rolcanlogin','rolcreaterole','rolcreatedb','rolbypassrls','rolinherit','rolreplication','owns_schema','owns_database','schema_create','table_writes'])assert.throws(()=>assertStandardImportRoleFacts({...facts,[key]:true},role),/PROTECTED_ROLE_PROFILE_UNVERIFIED/);
});

import { parseStandardImportWireJson } from '../tools/unified-import/execution-client.ts';
test('PostgreSQL JSON wire is inspected before JSON.parse so bigint/money cannot silently round',()=>{
  assert.throws(()=>parseStandardImportWireJson('{"quantity":9223372036854775807}'),/WIRE_NUMBER/);
  assert.throws(()=>parseStandardImportWireJson('{"amount":99999999999999.99}'),/WIRE_NUMBER/);
  assert.throws(()=>parseStandardImportWireJson('{"count":1e3}'),/WIRE_NUMBER/);
  assert.deepEqual(parseStandardImportWireJson('{"quantity":"9223372036854775807","amount":"99999999999999.99","count":1}'),{quantity:'9223372036854775807',amount:'99999999999999.99',count:1});
});

test('committed replies must preserve the original operation sequence, not a later batch checkpoint',async()=>{
  const p=planned(),r=standardImportRequest(p,'MASTER',0,{expected_sequence:0,rows:[]}),seen:string[]=[];
  const c=createStandardImportClient({async query(sql){seen.push(sql);return{rows:sql.startsWith('SELECT')?[{result_json:JSON.stringify({...response(r),sequence:3})}]:[]};},discard(){}},{sessionToken:()=>'x'.repeat(43)});
  await assert.rejects(c.masterChunk(r),/ROLLED_BACK/);assert.equal(seen.at(-1),'ROLLBACK');
});

test('ABSENT original-key readback preserves NULL unknown hash/checkpoint, never invented digest or zero',()=>{
  const r=standardImportRequest(planned(),'MASTER',0,{});
  const absent={protocol:STANDARD_IMPORT_PROTOCOL,operation_id:r.operation_id,batch_id:r.batch_id,state:'ABSENT',request_sha256:null,sequence:null,cursor:null,receipt:null};
  assert.deepEqual(decodeStandardImportReply(absent,r),absent);
  assert.throws(()=>decodeStandardImportReply({...absent,request_sha256:'a'.repeat(64),sequence:0,cursor:0},r),/SQL_RESPONSE_INVALID/);
});

import { resumeUnifiedImportInitialization } from '../packages/application/src/unified-import-execution.ts';
import { installStandardImportTransportErrorHandler } from '../tools/unified-import/execution-client.ts';
import { EventEmitter } from 'node:events';
test('initializer recovery crosses original-key barrier then validates the same private hash through idempotent initializer replay',async()=>{
  const p=planned(),init=compileStandardImportProgram(p,admin).initialize,{client,called}=fakeClient(p),privateHash=await createNodeScryptPasswords().hash('SYNTHETIC-initializer-recovery-only');
  client.initialize=async(request,encoded)=>{called.push('initialize-original');assert.equal(request,init);assert.equal(encoded,privateHash);return response(request);};
  const out=await resumeUnifiedImportInitialization(p,client,init,privateHash);assert.equal(out.state,'COMMITTED');assert.deepEqual(out,response(init));assert.deepEqual(called,['inspect','status','initialize-original']);
});
test('idle pg error is handled without printing private driver error and fences every later query',async()=>{
  const emitter=new EventEmitter();let closes=0;
  const failed=installStandardImportTransportErrorHandler({on(_event,listener){emitter.on('error',listener);}},async()=>{closes++;});
  assert.equal(failed(),false);assert.doesNotThrow(()=>emitter.emit('error',new Error('SYNTHETIC_PRIVATE_DRIVER_CONTENT')));
  await Promise.resolve();await Promise.resolve();assert.equal(failed(),true);assert.equal(closes,1);
});

test('known active opaque session is rejected in otherwise valid public business fields before SQL or journaling',async()=>{
  const input=packageInput(),secret='Y'.repeat(43);input.pkg.records.customer![0]!.fields.name=secret;repinSyntheticPackage(input.pkg);input.manifestBytes=Buffer.from(JSON.stringify(input.pkg.manifest,null,2)+'\n');input.expectedManifestSha256=sha256(input.manifestBytes);
  const p=buildUnifiedImportPlan({...input,target}),r=compileStandardImportProgram(p,admin).steps[0]!.request;let queries=0;
  const c=createStandardImportClient({async query(){queries++;return{rows:[]};},discard(){}},{sessionToken:()=>secret});
  await assert.rejects(c.masterChunk(r),/PRIVATE_VALUE_IN_PUBLIC_REQUEST/);assert.equal(queries,0);
});

test('READY consistency is not fresh-target admission: preserve deleted facts and disabled default customer as explicit blockers',()=>{
  const input=packageInput();input.pkg.records.color![0]!.fields.deleted_at='2026-10-01T00:00:00Z';input.pkg.records.customer![0]!.fields.enabled=false;repinSyntheticPackage(input.pkg);input.manifestBytes=Buffer.from(JSON.stringify(input.pkg.manifest,null,2)+'\n');input.expectedManifestSha256=sha256(input.manifestBytes);
  const p=buildUnifiedImportPlan({...input,target});assert.equal(p.admission_issues.length,2);assert.equal(p.master_rows.find(r=>r.table==='color')!.record.fields.deleted_at,'2026-10-01T00:00:00Z');
  assert.throws(()=>compileStandardImportProgram(p,admin),/TARGET_PROFILE_ADMISSION_BLOCKED/);
});

import { CURRENT_REAL_TPLUS_REGISTRATION, assertCurrentRealSourceRegistration } from '../packages/application/src/unified-import-execution.ts';
import { assertStandardImportPackageScope } from '../tools/unified-import/execution-client.ts';
test('REAL identity is the recorded selected registration, not an arbitrary self-consistent invented namespace',()=>{
  assert.doesNotThrow(()=>assertCurrentRealSourceRegistration({...CURRENT_REAL_TPLUS_REGISTRATION}));
  assert.throws(()=>assertCurrentRealSourceRegistration({...CURRENT_REAL_TPLUS_REGISTRATION,source_namespace:'invented.namespace'}),/UNREGISTERED_REAL_SOURCE_METADATA/);
  assert.throws(()=>assertCurrentRealSourceRegistration({...CURRENT_REAL_TPLUS_REGISTRATION,source_metadata_sha256:'f'.repeat(64)}),/UNREGISTERED_REAL_SOURCE_METADATA/);
  assert.throws(()=>assertCurrentRealSourceRegistration({...CURRENT_REAL_TPLUS_REGISTRATION,cutoff_at:'2026-11-02T04:00:00.000001Z'}),/UNREGISTERED_REAL_SOURCE_METADATA/);
  assert.doesNotThrow(()=>assertStandardImportPackageScope('SYNTHETIC','ISOLATED_SET_ROLE_PROOF'));
  assert.throws(()=>assertStandardImportPackageScope('REAL','ISOLATED_SET_ROLE_PROOF'),/REAL_DATA_NOT_AUTHORIZED_FOR_TEST_SCOPE/);
});

import { requestHash } from '../packages/application/src/request-hash.ts';
test('shared execution and readback orchestration rejects REAL mode before any isolated client call',async()=>{
  const p=planned(),{client,called}=fakeClient(p);
  // Deliberately relabel a synthetic test double; this is not an actual REAL file.
  p.package_kind='REAL';const{plan_sha256,...payload}=p;void plan_sha256;p.plan_sha256=requestHash(payload);
  const r=standardImportRequest(p,'MASTER',0,{});
  await assert.rejects(executeUnifiedImportPlan(p,client,[]),/REAL_DATA_NOT_AUTHORIZED_FOR_TEST_SCOPE/);
  await assert.rejects(recoverUnifiedImportOperation(p,client,r),/REAL_DATA_NOT_AUTHORIZED_FOR_TEST_SCOPE/);
  await assert.rejects(verifyUnifiedImportState(p,client,r),/REAL_DATA_NOT_AUTHORIZED_FOR_TEST_SCOPE/);
  assert.deepEqual(called,[]);
});

import { admitReviewedStandardImportSuccessor, REVIEWED_STANDARD44_TRANSITION } from '../packages/application/src/unified-import-execution.ts';
import type { StandardImportSuccessorProof, StandardImportSuccessorObservation } from '../packages/application/src/unified-import-execution.ts';
function successorCase(){
 const old={...target,system_identifier:'7703451823620812828',database_oid:'16409',database_name:'opt03_synthetic_profile_20261102_v1',catalog_sha256:'357cc19ab54edf2672f5275ce6926b846f7c5755ac36606a5ae7fc28c0b69a16'};
 const p=buildUnifiedImportPlan({...packageInput(),target:old}),program=compileStandardImportProgram(p,admin),current={...old,catalog_sha256:'c'.repeat(64)};
 const source=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_initialization.sql',import.meta.url),'utf8');
 const captures=REVIEWED_STANDARD44_TRANSITION.routines.map((r,index)=>{
  const name=r.routine_identity.slice('naijue_erp.'.length).split('(')[0]!,start=source.indexOf('FUNCTION naijue_erp.'+name+'('),as=source.indexOf('AS $$',start),body=source.slice(as+5,source.indexOf('$$;',as+5));
  const args=name==='assert_standard_import_operation'?'operation uuid':name==='assert_document_conversion_batch'?'next_row import_batch, prior jsonb, mutation text, final_state boolean':'';
  const prefix='CREATE OR REPLACE FUNCTION naijue_erp.'+name+'('+args+')\n RETURNS '+(name==='validate_baseline_source_commit'?'trigger':'void')+'\n LANGUAGE plpgsql\n'+(name==='assert_standard_import_operation'?' SECURITY DEFINER\n':'')+" SET search_path TO 'pg_catalog', 'naijue_erp'\n"+(name==='assert_standard_import_operation'?" SET \"TimeZone\" TO 'UTC'\n":'')+'AS $function$';
  const definition=prefix+body+'$function$\n';assert.equal(sha256(definition),r.predecessor_definition_sha256);
  return{format_version:'STANDARD_IMPORT_SUCCESSOR_PREDECESSOR_V1' as const,routine_identity:r.routine_identity,function_oid:String(999+index),predecessor_definition:definition,predecessor_definition_sha256:sha256(definition),predecessor_body_sha256:r.predecessor_body_sha256,invariant_attributes_sha256:r.invariant_attributes_sha256};
 });
 const proof:StandardImportSuccessorProof={format_version:'STANDARD_IMPORT_REVIEWED_SUCCESSOR_V1',transition_id:REVIEWED_STANDARD44_TRANSITION.id,source_sha256:REVIEWED_STANDARD44_TRANSITION.source_sha256,original_plan_sha256:p.plan_sha256,package_manifest_sha256:p.manifest_sha256,predecessor_target:old,successor_target:current,captures,init_operation_id:program.initialize.operation_id,init_public_request_sha256:requestHash(program.initialize),init_committed_request_sha256:'b'.repeat(64),failed_operation_id:program.steps[0]!.request.operation_id,failed_public_request_sha256:requestHash(program.steps[0]!.request),prior_absence_evidence_sha256:'e'.repeat(64)};
 const observation:StandardImportSuccessorObservation={current_catalog_sha256:current.catalog_sha256,counterfactual_catalog_sha256:old.catalog_sha256,routines:REVIEWED_STANDARD44_TRANSITION.routines.map((r,i)=>({routine_identity:r.routine_identity,body_sha256:r.successor_body_sha256,invariant_attributes_sha256:r.invariant_attributes_sha256,function_oid:String(999+i)}))};
 const {client,called}=fakeClient(p);client.inspectTarget=async()=>({...current,current_user:'owner',session_user:'owner',role_mode:'isolated_importer',proof_scope:'SET_ROLE_ONLY_NOT_NONOWNER_LOGIN'});client.inspectSuccessorCatalog=async captures=>{assert.equal(captures.length,3);called.push('catalog-proof');return observation;};client.status=async r=>{called.push('status');return response(r,r.operation_id===program.initialize.operation_id?'COMMITTED':'ABSENT');};
 return{p,program,proof,observation,client,called,current};
}
test('explicit reviewed successor preserves original plan/requests/keys while validating actual new and counterfactual old catalog',async()=>{
 const f=successorCase(),before=JSON.stringify(f.p),step=f.program.steps[0]!;
 await assert.rejects(executeUnifiedImportPlan(f.p,f.client,[step]),/TARGET_CHANGED/);
 const admission=await admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,step.request);
 assert.equal((await f.client.inspectTarget()).catalog_sha256,f.current.catalog_sha256);
 const result=await resumeUnifiedImportStep(f.p,f.client,step,admission);assert.equal(result.operation_id,step.request.operation_id);assert.equal(JSON.stringify(f.p),before);assert.equal(step.request.plan_sha256,f.p.plan_sha256);
});
test('successor rejects wrong old/new/birth/plan/source/counterfactual/body/attributes and changed init before any write',async()=>{
 for(const change of ['old','new','system','database','name','protocol','plan','source','counterfactual','body','attributes','init','drop','duplicate','unreviewed'] as const){const f=successorCase();
  if(change==='old')f.proof.predecessor_target.catalog_sha256='a'.repeat(64);
  if(change==='new')f.proof.successor_target.catalog_sha256='a'.repeat(64);
  if(change==='system')f.proof.successor_target.system_identifier='123';
  if(change==='database')f.proof.successor_target.database_oid='123';
  if(change==='name')f.proof.successor_target.database_name='other';
  if(change==='protocol')Object.assign(f.proof.successor_target,{protocol:'OTHER'});
  if(change==='drop')f.proof.captures.pop();
  if(change==='duplicate')f.proof.captures[1]=structuredClone(f.proof.captures[0]!);
  if(change==='unreviewed')f.proof.captures[0]!.routine_identity='naijue_erp.unreviewed(uuid)';
  if(change==='plan')f.proof.original_plan_sha256='a'.repeat(64);
  if(change==='source')f.proof.source_sha256='a'.repeat(64);
  if(change==='counterfactual')f.observation.counterfactual_catalog_sha256='a'.repeat(64);
  if(change==='body')f.observation.routines[0]!.body_sha256='a'.repeat(64);
  if(change==='attributes')f.observation.routines[0]!.invariant_attributes_sha256='a'.repeat(64);
  if(change==='init')f.proof.init_committed_request_sha256='a'.repeat(64);
  await assert.rejects(admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,f.program.steps[0]!.request),/SUCCESSOR|TARGET_PROOF/);assert.ok(!f.called.includes('master'));
 }
});
test('successor admission cannot be copied or survive another catalog transition; committed original failed step is read back',async()=>{
 const f=successorCase(),step=f.program.steps[0]!,admission=await admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,step.request);
 await assert.rejects(executeUnifiedImportPlan(f.p,f.client,[step],{...admission}),/SUCCESSOR/);
 f.client.status=async r=>response(r);const r=await resumeUnifiedImportStep(f.p,f.client,step,admission);assert.equal(r.state,'COMMITTED');assert.ok(!f.called.includes('master'));
 f.client.inspectTarget=async()=>({...f.current,catalog_sha256:'f'.repeat(64),current_user:'owner',session_user:'owner',role_mode:'isolated_importer',proof_scope:'SET_ROLE_ONLY_NOT_NONOWNER_LOGIN'});
 await assert.rejects(executeUnifiedImportPlan(f.p,f.client,[step],admission),/TARGET_CHANGED/);
});

test('reviewed44 failed barrier cannot be swapped to a different compiled phase',async()=>{
 const f=successorCase(),later=f.program.steps[1]!.request;f.proof.failed_operation_id=later.operation_id;f.proof.failed_public_request_sha256=requestHash(later);
 await assert.rejects(admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,later),/SUCCESSOR/);
 assert.ok(!f.called.includes('status'));
});

test('reviewed successor cannot use apply to resend committed work; explicit resume required before file/DB access',()=>{
 const r=spawnSync(process.execPath,['tools/unified-import/cli.mjs','apply','--reviewed-successor','SYNTHETIC_NOT_A_FILE','--target-proof','SYNTHETIC_NOT_A_FILE','--connection-file','SYNTHETIC_NOT_A_FILE'],{encoding:'utf8'});
 assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).code,'SUCCESSOR_RESUME_REQUIRED');
});

import { REVIEWED_STANDARD45_TRANSITION } from '../packages/application/src/unified-import-execution.ts';
function successor45Case(){
 const f=successorCase(),t=REVIEWED_STANDARD45_TRANSITION,r=t.routines.at(-1)!;
 const source=readFileSync(new URL('../adapters/postgres/migrations/0027_unified_business_documents.sql',import.meta.url),'utf8'),start=source.indexOf('CREATE FUNCTION naijue_erp.guard_retained_settlement_identity()'),as=source.indexOf('AS $$',start),body=source.slice(as+5,source.indexOf('$$;',as+5));
 const definition="CREATE OR REPLACE FUNCTION naijue_erp.guard_retained_settlement_identity()\n RETURNS trigger\n LANGUAGE plpgsql\n SET search_path TO 'pg_catalog', 'naijue_erp'\nAS $function$"+body+'$function$\n';
 assert.equal(sha256(definition),r.predecessor_definition_sha256);
 const proof:StandardImportSuccessorProof&{committed_prefix:NonNullable<StandardImportSuccessorProof['committed_prefix']>}={...f.proof,transition_id:t.id,source_sha256:t.source_sha256,captures:[...f.proof.captures,{format_version:'STANDARD_IMPORT_SUCCESSOR_PREDECESSOR_V1' as const,routine_identity:r.routine_identity,function_oid:'1002',predecessor_definition:definition,predecessor_definition_sha256:sha256(definition),predecessor_body_sha256:r.predecessor_body_sha256,invariant_attributes_sha256:r.invariant_attributes_sha256}],failed_operation_id:f.program.steps[4]!.request.operation_id,failed_public_request_sha256:requestHash(f.program.steps[4]!.request),committed_prefix:f.program.steps.slice(0,4).map(s=>({operation_id:s.request.operation_id,public_request_sha256:requestHash(s.request),committed_reply_sha256:requestHash(response(s.request))}))};
 f.observation.routines.push({routine_identity:r.routine_identity,body_sha256:r.successor_body_sha256,invariant_attributes_sha256:r.invariant_attributes_sha256,function_oid:'1002'});
 f.client.inspectSuccessorCatalog=async captures=>{assert.equal(captures.length,4);f.called.push('catalog-proof');return f.observation;};
 f.client.status=async request=>{f.called.push('status:'+request.operation_id);return response(request,request.operation_id===f.program.initialize.operation_id||proof.committed_prefix.some(p=>p.operation_id===request.operation_id)?'COMMITTED':'ABSENT');};
 return{...f,proof};
}
test('reviewed45 preserves source43 plan and all committed prefix receipts; resumes only original first document key',async()=>{
 const f=successor45Case(),before=JSON.stringify(f.p),step=f.program.steps[4]!,admission=await admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,step.request);
 assert.deepEqual(f.called.filter(c=>c.startsWith('status:')),[f.program.initialize,...f.program.steps.slice(0,5).map(s=>s.request)].map(r=>'status:'+r.operation_id));
 for(const done of f.program.steps.slice(0,4))await resumeUnifiedImportStep(f.p,f.client,done,admission);
 assert.ok(!f.called.some(c=>['master','keys','publish','documents'].includes(c)));
 const result=await resumeUnifiedImportStep(f.p,f.client,step,admission);assert.equal(result.operation_id,step.request.operation_id);assert.equal(f.called.filter(c=>c==='documents').length,1);assert.equal(JSON.stringify(f.p),before);
});
test('reviewed45 rejects missing, reordered, extra or modified committed prefix and non-first-document barrier',async()=>{
 for(const change of ['missing','reordered','extra','operation','request','reply','master-barrier','second-document'] as const){const f=successor45Case();let step=f.program.steps[4]!;
  if(change==='missing')f.proof.committed_prefix.pop();
  if(change==='reordered')f.proof.committed_prefix.reverse();
  if(change==='extra')f.proof.committed_prefix.push({...f.proof.committed_prefix[0]!});
  if(change==='operation')f.proof.committed_prefix[0]!.operation_id=f.program.steps[5]!.request.operation_id;
  if(change==='request')f.proof.committed_prefix[0]!.public_request_sha256='1'.repeat(64);
  if(change==='reply')f.proof.committed_prefix[0]!.committed_reply_sha256='1'.repeat(64);
  if(change==='master-barrier'||change==='second-document'){step=f.program.steps[change==='master-barrier'?0:5]!;f.proof.failed_operation_id=step.request.operation_id;f.proof.failed_public_request_sha256=requestHash(step.request);}
  await assert.rejects(admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,step.request),/SUCCESSOR/);assert.ok(!f.called.includes('documents'));
 }
});
test('reviewed45 rejects absent or changed actual committed receipt before the failed document status or writer',async()=>{
 for(const change of ['absent','request-sha','sequence','cursor','receipt'] as const){const f=successor45Case(),first=f.program.steps[0]!.request;
  const status=f.client.status;f.client.status=async r=>{if(r.operation_id!==first.operation_id)return status(r);f.called.push('status:'+r.operation_id);if(change==='absent')return response(r,'ABSENT');const result=response(r);assert.equal(result.state,'COMMITTED');if(change==='request-sha')result.request_sha256='1'.repeat(64);if(change==='sequence')result.sequence++;if(change==='cursor')result.cursor++;if(change==='receipt')result.receipt={status:'DIFFERENT'};return result;};
  await assert.rejects(admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,f.program.steps[4]!.request),/SUCCESSOR|CHECKPOINT/);assert.ok(!f.called.includes('status:'+f.program.steps[4]!.request.operation_id));assert.ok(!f.called.includes('documents'));
 }
});
test('reviewed45 pins fourth routine and retains finite original44 behavior',async()=>{
 for(const change of ['body','attributes','oid','drop','duplicate','definition','source'] as const){const f=successor45Case();
  if(change==='body')f.observation.routines[3]!.body_sha256='1'.repeat(64);
  if(change==='attributes')f.observation.routines[3]!.invariant_attributes_sha256='1'.repeat(64);
  if(change==='oid')f.observation.routines[3]!.function_oid='123';
  if(change==='drop')f.proof.captures.pop();
  if(change==='duplicate')f.proof.captures[3]={...f.proof.captures[0]!};
  if(change==='definition')f.proof.captures[3]!.predecessor_definition+='-- changed';
  if(change==='source')f.proof.source_sha256='1'.repeat(64);
  await assert.rejects(admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,f.program.steps[4]!.request),/SUCCESSOR/);assert.ok(!f.called.includes('documents'));
 }
 const old=successorCase();await admitReviewedStandardImportSuccessor(old.p,old.client,old.proof,old.program.initialize,old.program.steps[0]!.request);
});
test('reviewed45 later exact COMMITTED first document is read back without resending it',async()=>{
 const f=successor45Case(),step=f.program.steps[4]!,status=f.client.status;f.client.status=async r=>r.operation_id===step.request.operation_id?response(r):status(r);
 const admission=await admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,step.request);assert.equal(admission.failed_step_observed_state,'COMMITTED');
 assert.equal((await resumeUnifiedImportStep(f.p,f.client,step,admission)).state,'COMMITTED');assert.ok(!f.called.includes('documents'));
});
test('finite catalog observer permits only exact reviewed three/four sets and keeps predecessor SQL inert',async()=>{
 const f=successor45Case(),seen:{sql:string;values?:unknown[]}[]=[],client=createStandardImportClient({async query(sql,values){seen.push({sql,...(values?{values}:{})});return{rows:sql.startsWith('WITH input AS')?[{result_json:JSON.stringify(f.observation)}]:[]};},discard(){throw new Error('no discard expected');}});
 assert.deepEqual(await client.inspectSuccessorCatalog!(f.proof.captures),f.observation);
 assert.equal(seen[0]!.sql,'BEGIN ISOLATION LEVEL READ COMMITTED');assert.equal(seen[1]!.sql,'SET LOCAL search_path=pg_catalog,naijue_erp');assert.equal(seen.at(-1)!.sql,'COMMIT');
 assert.ok(!seen.some(s=>s.sql.includes(f.proof.captures[3]!.predecessor_definition)));assert.equal(seen[2]!.values![1],null);
 const before=seen.length;await assert.rejects(client.inspectSuccessorCatalog!(f.proof.captures.slice(1)),/CAPTURE_SET/);assert.equal(seen.length,before);
});

import { REVIEWED_STANDARD46_TRANSITION } from '../packages/application/src/unified-import-execution.ts';
function successor46Case(){
 const f=successor45Case(),t=REVIEWED_STANDARD46_TRANSITION,r=t.routines.at(-2)!;
 const source=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_initialization_precedence_successor.sql',import.meta.url),'utf8'),start=source.indexOf('CREATE OR REPLACE FUNCTION naijue_erp.standard_import_command('),as=source.indexOf('AS $$',start),body=source.slice(as+5,source.indexOf('$$;',as+5));
 const definition="CREATE OR REPLACE FUNCTION naijue_erp.standard_import_command(request jsonb, private_parameter text, command_phase text)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'pg_catalog', 'naijue_erp'\n SET \"TimeZone\" TO 'UTC'\nAS $function$"+body+'$function$\n';assert.equal(sha256(definition),r.predecessor_definition_sha256);
 const proof:StandardImportSuccessorProof&{committed_prefix:NonNullable<StandardImportSuccessorProof['committed_prefix']>}={...f.proof,transition_id:t.id,source_sha256:t.source_sha256,captures:[...f.proof.captures,{format_version:'STANDARD_IMPORT_SUCCESSOR_PREDECESSOR_V1',routine_identity:r.routine_identity,function_oid:'1003',predecessor_definition:definition,predecessor_definition_sha256:sha256(definition),predecessor_body_sha256:r.predecessor_body_sha256,invariant_attributes_sha256:r.invariant_attributes_sha256}],failed_operation_id:f.program.steps[6]!.request.operation_id,failed_public_request_sha256:requestHash(f.program.steps[6]!.request),committed_prefix:f.program.steps.slice(0,6).map(s=>({operation_id:s.request.operation_id,public_request_sha256:requestHash(s.request),committed_reply_sha256:requestHash(response(s.request))}))};
 f.observation.routines.push({routine_identity:r.routine_identity,body_sha256:r.successor_body_sha256,invariant_attributes_sha256:r.invariant_attributes_sha256,function_oid:'1003'});
 const v=t.routines.at(-1)!,verifySource=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_initialization.sql',import.meta.url),'utf8'),verifyStart=verifySource.indexOf('CREATE FUNCTION naijue_erp.standard_import_verify('),verifyAs=verifySource.indexOf('AS $$',verifyStart),verifyBody=verifySource.slice(verifyAs+5,verifySource.indexOf('$$;',verifyAs+5));
 const verifyDefinition="CREATE OR REPLACE FUNCTION naijue_erp.standard_import_verify(request jsonb, session_token text)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'pg_catalog', 'naijue_erp'\n SET \"TimeZone\" TO 'UTC'\nAS $function$"+verifyBody+'$function$\n';assert.equal(sha256(verifyDefinition),v.predecessor_definition_sha256);
 proof.captures.push({format_version:'STANDARD_IMPORT_SUCCESSOR_PREDECESSOR_V1',routine_identity:v.routine_identity,function_oid:'1004',predecessor_definition:verifyDefinition,predecessor_definition_sha256:sha256(verifyDefinition),predecessor_body_sha256:v.predecessor_body_sha256,invariant_attributes_sha256:v.invariant_attributes_sha256});
 f.observation.routines.push({routine_identity:v.routine_identity,body_sha256:v.successor_body_sha256,invariant_attributes_sha256:v.invariant_attributes_sha256,function_oid:'1004'});
 f.client.inspectSuccessorCatalog=async captures=>{assert.equal(captures.length,6);f.called.push('catalog-proof');return f.observation;};
 f.client.status=async request=>{f.called.push('status:'+request.operation_id);return response(request,request.operation_id===f.program.initialize.operation_id||proof.committed_prefix.some(p=>p.operation_id===request.operation_id)?'COMMITTED':'ABSENT');};
 return{...f,proof};
}
test('reviewed46 preserves all six staged commits and resumes only original final publication key',async()=>{
 const f=successor46Case(),step=f.program.steps[6]!,before=JSON.stringify(f.p),admission=await admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,step.request);
 assert.deepEqual(f.called.filter(c=>c.startsWith('status:')),[f.program.initialize,...f.program.steps.map(s=>s.request)].map(r=>'status:'+r.operation_id));
 for(const done of f.program.steps.slice(0,6))await resumeUnifiedImportStep(f.p,f.client,done,admission);
 assert.ok(!f.called.some(c=>['master','keys','publish','documents'].includes(c)));
 const result=await resumeUnifiedImportStep(f.p,f.client,step,admission);assert.equal(result.operation_id,step.request.operation_id);assert.equal(f.called.filter(c=>c==='publish').length,1);assert.equal(JSON.stringify(f.p),before);
});
test('reviewed46 rejects missing or changed staged document proof and a non-final barrier',async()=>{
 for(const change of ['missing','reordered','request','receipt','sales-barrier','transfer-barrier'] as const){const f=successor46Case();let step=f.program.steps[6]!;
  if(change==='missing')f.proof.committed_prefix.pop();if(change==='reordered')f.proof.committed_prefix.reverse();if(change==='request')f.proof.committed_prefix[4]!.public_request_sha256='1'.repeat(64);if(change==='receipt')f.proof.committed_prefix[5]!.committed_reply_sha256='1'.repeat(64);
  if(change==='sales-barrier'||change==='transfer-barrier'){step=f.program.steps[change==='sales-barrier'?4:5]!;f.proof.failed_operation_id=step.request.operation_id;f.proof.failed_public_request_sha256=requestHash(step.request);}
  await assert.rejects(admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,step.request),/SUCCESSOR/);assert.ok(!f.called.includes('publish'));
 }
 const f=successor46Case(),status=f.client.status;f.client.status=async r=>r.operation_id===f.program.steps[5]!.request.operation_id?response(r,'ABSENT'):status(r);
 await assert.rejects(admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,f.program.steps[6]!.request),/SUCCESSOR/);assert.ok(!f.called.includes('publish'));
});
test('reviewed46 rejects unreviewed command/verifier changes and skips exact already committed publication',async()=>{
 for(const index of [4,5])for(const change of ['body','attributes','oid','definition','source'] as const){const f=successor46Case();if(change==='body')f.observation.routines[index]!.body_sha256='1'.repeat(64);if(change==='attributes')f.observation.routines[index]!.invariant_attributes_sha256='1'.repeat(64);if(change==='oid')f.observation.routines[index]!.function_oid='123';if(change==='definition')f.proof.captures[index]!.predecessor_definition+='--changed';if(change==='source')f.proof.source_sha256='1'.repeat(64);
  await assert.rejects(admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,f.program.steps[6]!.request),/SUCCESSOR/);assert.ok(!f.called.includes('publish'));
 }
 const f=successor46Case(),step=f.program.steps[6]!,status=f.client.status;f.client.status=async r=>r.operation_id===step.request.operation_id?response(r):status(r);const admission=await admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,step.request);assert.equal((await resumeUnifiedImportStep(f.p,f.client,step,admission)).state,'COMMITTED');assert.ok(!f.called.includes('publish'));
});
test('finite catalog observer accepts exact reviewed46 six-set only, rejects five or arbitrary functions before SQL',async()=>{
 const f=successor46Case(),seen:string[]=[],client=createStandardImportClient({async query(sql){seen.push(sql);return{rows:sql.startsWith('WITH input AS')?[{result_json:JSON.stringify(f.observation)}]:[]};},discard(){throw new Error('no discard expected');}});
 assert.deepEqual(await client.inspectSuccessorCatalog!(f.proof.captures),f.observation);const count=seen.length;
 await assert.rejects(client.inspectSuccessorCatalog!(f.proof.captures.slice(0,5)),/CAPTURE_SET/);assert.equal(seen.length,count);
 const arbitrary=structuredClone(f.proof.captures);arbitrary[5]!.routine_identity='naijue_erp.arbitrary(jsonb,text)';await assert.rejects(client.inspectSuccessorCatalog!(arbitrary),/CAPTURE_SET/);assert.equal(seen.length,count);
});

import { REVIEWED_STANDARD47_TRANSITION, assertReviewedStandardImportSuccessorCommand } from '../packages/application/src/unified-import-execution.ts';
import type { StandardImportPostPublicationSuccessorProof } from '../packages/application/src/unified-import-execution.ts';
function successor47Case(){
 const f=successor46Case(),t=REVIEWED_STANDARD47_TRANSITION,r=t.routines.at(-1)!;
 const source=readFileSync(new URL('../adapters/postgres/patches/0026-history-revision-set-guards-successor.sql',import.meta.url),'utf8'),start=source.indexOf('CREATE FUNCTION naijue_erp.history_numeric_ledger_set_guard()'),as=source.indexOf('AS $ledger$',start),body=source.slice(as+11,source.indexOf('$ledger$;',as+11));
 const definition="CREATE OR REPLACE FUNCTION naijue_erp.history_numeric_ledger_set_guard()\n RETURNS trigger\n LANGUAGE plpgsql\n SET search_path TO 'pg_catalog', 'naijue_erp'\nAS $function$"+body+'$function$\n';assert.equal(sha256(definition),r.predecessor_definition_sha256);
 const {failed_operation_id:_oldFailed,failed_public_request_sha256:_oldFailedHash,prior_absence_evidence_sha256:_oldAbsence,...prior}=f.proof,final=f.program.steps[6]!.request;
 const proof:StandardImportPostPublicationSuccessorProof={...prior,format_version:'STANDARD_IMPORT_POST_PUBLICATION_SUCCESSOR_V1',transition_id:t.id,source_sha256:t.source_sha256,captures:[...prior.captures,{format_version:'STANDARD_IMPORT_SUCCESSOR_PREDECESSOR_V1',routine_identity:r.routine_identity,function_oid:'1005',predecessor_definition:definition,predecessor_definition_sha256:sha256(definition),predecessor_body_sha256:r.predecessor_body_sha256,invariant_attributes_sha256:r.invariant_attributes_sha256}],init_committed_reply_sha256:requestHash(response(f.program.initialize)),publication_operation_id:final.operation_id,publication_public_request_sha256:requestHash(final),publication_evidence_sha256:'e'.repeat(64),committed_prefix:f.program.steps.map(s=>({operation_id:s.request.operation_id,public_request_sha256:requestHash(s.request),committed_reply_sha256:requestHash(response(s.request))}))};
 f.observation.routines.push({routine_identity:r.routine_identity,body_sha256:r.successor_body_sha256,invariant_attributes_sha256:r.invariant_attributes_sha256,function_oid:'1005'});
 f.client.inspectSuccessorCatalog=async captures=>{assert.equal(captures.length,7);f.called.push('catalog-proof');return f.observation;};f.client.status=async request=>{f.called.push('status:'+request.operation_id);return response(request);};
 return{...f,proof};
}
test('reviewed47 is post-publication read-only: all eight original receipts, exact final COMMITTED, plan unchanged',async()=>{
 const f=successor47Case(),final=f.program.steps[6]!.request,before=JSON.stringify(f.p),admission=await admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,final);
 assert.equal(admission.access_mode,'POST_PUBLICATION_READ_ONLY');assert.equal(admission.failed_step_observed_state,'COMMITTED');
 assert.deepEqual(f.called.filter(c=>c.startsWith('status:')),[f.program.initialize,...f.program.steps.map(s=>s.request)].map(r=>'status:'+r.operation_id));
 assert.equal((await recoverUnifiedImportOperation(f.p,f.client,final,admission)).state,'COMMITTED');
 assert.deepEqual(await verifyUnifiedImportReceipts(f.p,f.client,[f.program.initialize,...f.program.steps.map(s=>s.request)],new Map(),admission),{state:'RECEIPTS_VERIFIED',verified_operations:8});
 assert.equal(JSON.stringify(f.p),before);assert.ok(!f.called.some(c=>['master','keys','publish','documents'].includes(c)));
 const count=f.called.length;await assert.rejects(executeUnifiedImportPlan(f.p,f.client,[],admission),/SUCCESSOR_READ_ONLY/);await assert.rejects(resumeUnifiedImportStep(f.p,f.client,f.program.steps[6]!,admission),/SUCCESSOR_READ_ONLY/);assert.equal(f.called.length,count);
});
test('reviewed47 requires INIT and every original step fully COMMITTED, including final publication',async()=>{
 for(const change of ['absent-final','changed-final-receipt','absent-prefix','changed-init','missing-final','wrong-phase','legacy-absence'] as const){const f=successor47Case(),final=f.program.steps[6]!.request,status=f.client.status;let barrier=final;
  if(change==='absent-final')f.client.status=async r=>r.operation_id===final.operation_id?response(r,'ABSENT'):status(r);
  if(change==='changed-final-receipt')f.client.status=async r=>{if(r.operation_id!==final.operation_id)return status(r);const result=response(r);assert.equal(result.state,'COMMITTED');result.receipt={status:'DIFFERENT'};return result;};
  if(change==='absent-prefix')f.client.status=async r=>r.operation_id===f.program.steps[4]!.request.operation_id?response(r,'ABSENT'):status(r);
  if(change==='changed-init')f.proof.init_committed_reply_sha256='1'.repeat(64);
  if(change==='missing-final')f.proof.committed_prefix.pop();
  if(change==='wrong-phase'){barrier=f.program.steps[5]!.request;f.proof.publication_operation_id=barrier.operation_id;f.proof.publication_public_request_sha256=requestHash(barrier);}
  if(change==='legacy-absence')Object.assign(f.proof,{prior_absence_evidence_sha256:'1'.repeat(64)});
  await assert.rejects(admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,barrier),/SUCCESSOR/);assert.ok(!f.called.includes('publish'));
 }
});
test('reviewed47 fixed seventh function and catalog proof reject body/attributes/OID/definition/source/counterfactual tampering',async()=>{
 for(const change of ['body','attributes','oid','definition','source','counterfactual'] as const){const f=successor47Case();if(change==='body')f.observation.routines[6]!.body_sha256='1'.repeat(64);if(change==='attributes')f.observation.routines[6]!.invariant_attributes_sha256='1'.repeat(64);if(change==='oid')f.observation.routines[6]!.function_oid='123';if(change==='definition')f.proof.captures[6]!.predecessor_definition+='--changed';if(change==='source')f.proof.source_sha256='1'.repeat(64);if(change==='counterfactual')f.observation.counterfactual_catalog_sha256='1'.repeat(64);
  await assert.rejects(admitReviewedStandardImportSuccessor(f.p,f.client,f.proof,f.program.initialize,f.program.steps[6]!.request),/SUCCESSOR/);assert.ok(!f.called.includes('publish'));
 }
});
test('reviewed47 command scope allows only verify/receipt-check/status, never recovery or initialization',()=>{
 const f=successor47Case();for(const command of ['verify','receipt-check','status'])assert.doesNotThrow(()=>assertReviewedStandardImportSuccessorCommand(f.proof,command));
 for(const command of ['initialize','resume-initialize','apply','resume','inspect-target'])assert.throws(()=>assertReviewedStandardImportSuccessorCommand(f.proof,command),/SUCCESSOR_READ_ONLY/);
});
test('finite catalog observer accepts exact47 seven only, without arbitrary functions',async()=>{
 const f=successor47Case(),seen:string[]=[],client=createStandardImportClient({async query(sql){seen.push(sql);return{rows:sql.startsWith('WITH input AS')?[{result_json:JSON.stringify(f.observation)}]:[]};},discard(){throw new Error('no discard expected');}});
 assert.deepEqual(await client.inspectSuccessorCatalog!(f.proof.captures),f.observation);const count=seen.length;const bad=structuredClone(f.proof.captures);bad[6]!.routine_identity='naijue_erp.arbitrary()';await assert.rejects(client.inspectSuccessorCatalog!(bad),/CAPTURE_SET/);assert.equal(seen.length,count);
});
test('reviewed47 CLI resume rejects read-only proof before target/config/package access',async()=>{
 const root=await mkdtemp(join(tmpdir(),'standard-readonly47-'));try{const proof=join(root,'proof.json');await writeFile(proof,JSON.stringify({format_version:'STANDARD_IMPORT_POST_PUBLICATION_SUCCESSOR_V1'}),{mode:0o600});
  const result=spawnSync(process.execPath,['tools/unified-import/cli.mjs','resume','--reviewed-successor',proof,'--target-proof','SYNTHETIC_NOT_A_FILE','--connection-file','SYNTHETIC_NOT_A_FILE'],{encoding:'utf8'});assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).code,'SUCCESSOR_READ_ONLY');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('reviewed47 native verification accepts independently verified legitimate post-import document versions without reimport',async()=>{
 const f=successor47Case(),p=f.p,final=f.program.steps[6]!.request,admission=await admitReviewedStandardImportSuccessor(p,f.client,f.proof,f.program.initialize,final);
 f.client.verify=async()=>({protocol:STANDARD_IMPORT_PROTOCOL,plan_sha256:p.plan_sha256,batch_id:p.document_batch_id,baseline_batch_id:p.baseline_batch_id,verified:true,documents:[...p.document_rows.sales_header!.map(r=>({kind:'SALES' as const,id:String(r.fields.id),initial_version:Number(r.fields.version),current_version:Number(r.fields.version)+1,state:'VERIFIED_CHANGED_AFTER_IMPORT' as const,audit_steps:1})),...p.document_rows.transfer_header!.map(r=>({kind:'TRANSFER' as const,id:String(r.fields.id),initial_version:Number(r.fields.version),current_version:Number(r.fields.version),state:'UNCHANGED' as const,audit_steps:0}))],source_counts:{...Object.fromEntries([...new Set(p.master_rows.map(r=>r.table))].map(t=>[t.toUpperCase(),p.master_rows.filter(r=>r.table===t).length])),...Object.fromEntries(Object.entries(p.document_rows).map(([t,rows])=>[t.toUpperCase(),rows.length])),INVENTORY_KEY:2,IMPORT_BATCH:3},inventory_keys:p.baseline_rows.map(r=>({warehouse_id:String(r.fields.warehouse_id),sku_id:String(r.fields.sku_id),coverage:r.fields.quantity==='0'?'EXPLICIT_ZERO' as const:'NONZERO' as const,baseline_quantity:String(r.fields.quantity),ledger_total:String(r.fields.quantity),ledger_entries:r.fields.quantity==='0'?0:1,balance_quantity:r.fields.quantity==='0'?null:String(r.fields.quantity),balance_version:r.fields.quantity==='0'?null:1,verified:true as const})),scope:'CURRENT_NATIVE_AND_IMMUTABLE_IMPORT_PROOF_FENCED',proof_scope:'SET_ROLE_ONLY_NOT_NONOWNER_LOGIN'});
 const result=await verifyUnifiedImportState(p,f.client,final,admission);assert.equal(result.documents[0]!.state,'VERIFIED_CHANGED_AFTER_IMPORT');assert.ok(!f.called.some(c=>['master','keys','publish','documents'].includes(c)));
});
