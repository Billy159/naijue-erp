import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {relocateOriginalChild,runOriginalChild,waitForPurposeGate,pinned,prepareOrdinaryConfiguration,ordinaryDriver,runB07QaIdentityParent,loadEffectiveValueInputs,applyEffectiveValueSuccessor,assertOnlyEffectiveValueBodyChanged,EFFECTIVE_VALUE_PROFILE} from './qa-identity-parent.mjs';
import {SQL as fixtureSql} from './qa-identity-schema19.mjs';
const P='/Users/billy/Desktop/Workspace/project-007-业务管理系统';
const B=P+'/work/local-takeover-20261021-control/reports/controller/rapid-launch-20261022/server-execution';
test('unfilled live registration template refuses before client import or private output creation',async()=>{
 const template=JSON.parse(await readFile(new URL('./QA-IDENTITY-PARENT-REGISTRATION.template.json',import.meta.url),'utf8'));
 await assert.rejects(runB07QaIdentityParent(template),/^Error: B07_LIVE_FIXTURE_REGISTRATION_REQUIRED$/);
});
test('04 missing v21 ref or changed approved pin refuses before connection',async()=>{
 const template=JSON.parse(await readFile(new URL('./QA-IDENTITY-PARENT-REGISTRATION.template.json',import.meta.url),'utf8'));
 template.fixtureInput.target.postmaster_started_at='2026-10-26 00:00:00+00';template.fixtureInput.sourceActorAccountId='b0700000-0000-4000-8000-000000000099';template.fixtureInput.createdAt='2026-10-26T00:01:00.000Z';template.fixtureInput.preservedSnapshotReference='SYNTHETIC_ONLY';
 delete template.effectiveValue.metadata;
 await assert.rejects(runB07QaIdentityParent(template),/^Error: B07_EFFECTIVE_VALUE_INPUTS_REQUIRED$/);
 const refs=JSON.parse(await readFile(new URL('./QA-IDENTITY-PARENT-REGISTRATION.template.json',import.meta.url),'utf8')).effectiveValue;
 refs.patch.sha256='f'.repeat(64);await assert.rejects(loadEffectiveValueInputs(refs),/^Error: B07_EFFECTIVE_VALUE_EXACT_PIN_REQUIRED$/);
});
async function successorFixture(options={}){
 const template=JSON.parse(await readFile(new URL('./QA-IDENTITY-PARENT-REGISTRATION.template.json',import.meta.url),'utf8'));
 const plan={...template,outputDirectory:await mkdtemp(join(tmpdir(),'b07-v21-parent-offline-only-'))};
 await mkdir(join(plan.outputDirectory,'role'));
 const input=plan.fixtureInput;input.target.postmaster_started_at='2026-10-26 00:00:00+00';
 const oldSource=await readFile(P+'/work/erp-local-source-20261022/adapters/postgres/patches/0026-history-revision-current-base.sql','utf8');
 const patchSource=await readFile(plan.effectiveValue.patch.path,'utf8');
 const body=s=>s.match(/CREATE OR REPLACE FUNCTION naijue_erp\.history_effective_writes_closed\(\)[\s\S]*?AS \$\$(.*?)\$\$;/s)[1];
 const routine=(source,definition)=>({name:'history_effective_writes_closed',identity_arguments:'',owner:'naijue_erp_test',acl:'SYNTHETIC_UNCHANGED',source,body_sha256:createHash('sha256').update(source).digest('hex'),body_md5:createHash('md5').update(source).digest('hex'),definition_sha256:definition.repeat(64)});
 const before={identity:{notice:'SYNTHETIC_METADATA_ONLY'},relations:[{name:'SYNTHETIC_UNCHANGED'}],routines:[routine(body(oldSource),'a'),...Array.from({length:128},(_,i)=>({name:'synthetic_'+i}))]};
 const after=structuredClone(before);after.routines[0]=routine(body(patchSource),'b');
 const beforeBytes=JSON.stringify(before),oldMetadata={catalog_sha256:'a'.repeat(64),source_routines_match:true};
 await writeFile(join(plan.outputDirectory,'role','ACTUAL-ORDINARY-V16-FULL-CATALOG.json'),beforeBytes,{mode:0o600});
 await writeFile(join(plan.outputDirectory,'role','ACTUAL-ORDINARY-V16-METADATA.json'),JSON.stringify(oldMetadata),{mode:0o600});
 const sql=await loadEffectiveValueInputs(plan.effectiveValue),catalogSql=await readFile(plan.role.files.find(x=>x.name==='CATALOGUE-V16-FROM-V14.sql').ref.path,'utf8');
 const metadata={identity:{database:input.target.database,database_oid:input.target.oid,current_user:'t45_b07_hrev_runtime_20261026',session_user:'t45_b07_hrev_runtime_20261026',postmaster_start:input.target.postmaster_started_at,server_addr:null,server_port:null,replication_role:'origin'},migration_versions:Array.from({length:26},(_,i)=>i+1),catalog_sha256:'b'.repeat(64),source_routines_match:!options.badMetadata};
 const calls=[],clients=[];
 class Client{
  constructor(config){this.user=config.user;this.role=config.user;this.connectionParameters={host:config.host,port:config.port};this.ended=false;clients.push(this);}
  async connect(){}
  async query(query){calls.push(query);
   if(query==='SET ROLE naijue_erp_test')this.role='naijue_erp_test';
   if(query===fixtureSql.target){const {unix_socket_directories,...target}=input.target;return {rows:[{...target,role:this.role,session_role:this.user}]};}
   if(query===sql.patch){if(options.unknownCommit)throw Object.assign(Error('PRIVATE_DATABASE_DETAIL'),{code:'08006'});return [{command:'BEGIN'},{command:'COMMIT'}];}
   if(query===sql.finiteCheck)return [{command:'DO'},{command:'ROLLBACK'}];
   if(query===sql.metadata)return {rows:[{row_to_json:metadata}]};
   if(query===catalogSql)return {rows:[{manifest:after,canonical_sha256:metadata.catalog_sha256}]};
   return {rows:[],command:query};
  }
  async end(){this.ended=true;if(options.closeFail&&this.user===input.target.session_role)throw Error('PRIVATE_CLOSE_DETAIL');}
 }
 return {plan,input,Client,calls,clients,sql,before,after,beforeBytes};
}
test('04 exact successor commits once then finite rollback and new metadata; old receipt files retained',async()=>{
 const f=await successorFixture(),out=await applyEffectiveValueSuccessor(f);
 assert.equal(out.profile,EFFECTIVE_VALUE_PROFILE);assert.equal(out.commitReturned,true);assert.equal(out.finiteRollbackReturned,true);assert.equal(out.clientsClosed,true);assert.ok(f.clients.every(c=>c.ended));
 assert.ok(f.calls.indexOf(f.sql.patch)<f.calls.indexOf(f.sql.finiteCheck)&&f.calls.indexOf(f.sql.finiteCheck)<f.calls.indexOf(f.sql.metadata));
 assert.equal(f.calls.filter(q=>q===f.sql.patch).length,1);assert.ok(out.metadataRef.path.includes('history-effective-value/ACTUAL-V21-METADATA.json'));
 assert.equal(await readFile(join(f.plan.outputDirectory,'role','ACTUAL-ORDINARY-V16-FULL-CATALOG.json'),'utf8'),f.beforeBytes);
 const changed=structuredClone(f.after);changed.relations[0].name='UNRELATED_CHANGE';assert.throws(()=>assertOnlyEffectiveValueBodyChanged(f.before,changed),/^Error: B07_UNRELATED_CATALOG_CHANGE_REFUSED$/);
});
test('04 unknown install, failed metadata or nested cleanup cannot yield ready metadata',async()=>{
 for(const options of [{unknownCommit:true},{badMetadata:true},{closeFail:true}]){
  const f=await successorFixture(options);
  await assert.rejects(applyEffectiveValueSuccessor(f),error=>{
   assert.equal(error.message,'B07_V21_SUCCESSOR_NOT_READY');const r=error.successorResult;
   assert.equal(r.status.startsWith('STOP_'),true);assert.ok(!JSON.stringify(r).includes('PRIVATE_'));
   if(options.unknownCommit){assert.equal(r.commitReturned,false);assert.equal(r.databaseErrorCode,'08006');assert.equal(f.calls.includes(f.sql.finiteCheck),false);}
   if(options.badMetadata){assert.equal(r.commitReturned,true);assert.equal(r.metadataFailureRollbackReturned,true);assert.equal(r.metadataRef,undefined);}
   if(options.closeFail)assert.equal(r.clientsClosed,false);
   return true;
  });
  assert.ok(f.clients.every(c=>c.ended));assert.equal(f.calls.filter(q=>q===f.sql.patch).length,1);
  await assert.rejects(readFile(join(f.plan.outputDirectory,'CURRENT-METADATA-READY.json')),{code:'ENOENT'});
 }
});
test('original two child sources change only exact unique B literal and still parse without executing',async()=>{
 for(const [dir,name] of [['B07-EXISTING-COPY-V16-UPGRADE-SUCCESSOR-20261026','upgrade-v16-only.mjs'],['B07-ORDINARY-RUNTIME-ACL-PREPARATION-20261026','ordinary-role-only.mjs']]){
  const source=await readFile(join(B,dir,name),'utf8');const old="B=P+'/work/local-takeover-20261021-control/reports/controller/rapid-launch-20261022/server-execution/"+dir+"'";
  const relocated=relocateOriginalChild(source,old,'/private/tmp/b07-synthetic-only-child-output');
  assert.equal(relocated.replace('B="/private/tmp/b07-synthetic-only-child-output"',old),source);
  assert.equal(spawnSync(process.execPath,['--check','--input-type=module'],{input:relocated}).status,0);
  assert.throws(()=>relocateOriginalChild(source+old,old,'/private/tmp/b07-synthetic-only-child-output'));
 }
});
test('bounded child awaits actual process completion and refuses failure or timeout without driver output',async()=>{
 await runOriginalChild({node:process.execPath,source:'process.exitCode=0',timeoutMs:1000});
 await assert.rejects(runOriginalChild({node:process.execPath,source:'console.error("SYNTHETIC_PRIVATE_DETAIL");process.exitCode=2',timeoutMs:1000}),/^Error: B07_ORIGINAL_CHILD_FAILED_OR_UNKNOWN$/);
 await assert.rejects(runOriginalChild({node:process.execPath,source:'setInterval(()=>{},1000)',timeoutMs:1000}),/^Error: B07_ORIGINAL_CHILD_FAILED_OR_UNKNOWN$/);
});
test('missing gate never admits a fake review; changed private input fails pin',async()=>{
 const d=await mkdtemp(join(tmpdir(),'b07-parent-offline-only-'));
 await assert.rejects(waitForPurposeGate(join(d,'not-written-gate.json'),0),/^Error: B07_CURRENT_PURPOSE_GATE_NOT_READY$/);
 const path=join(d,'synthetic-config.json'),bytes=Buffer.from('{"synthetic":true}');await writeFile(path,bytes,{mode:0o600,flag:'wx'});
 const ref={path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};assert.deepEqual(await pinned(ref),bytes);
 await writeFile(path,Buffer.alloc(bytes.length,32));await assert.rejects(pinned(ref),/^Error: B07_PARENT_PIN_CHANGED$/);
});
test('PG trust config uses distinct RAM-only shape values and ordinary sessions override diagnostic read-only locally',()=>{
 const target={database:'naijue_erp_test_19e00102',unix_socket_directories:'/private/tmp/nj-b07-synthetic-only',port:55676};
 const template={postgres:{target:{database:target.database,host:target.unix_socket_directories,port:target.port,user:'synthetic_nonowner',ssl:false,password:null}}};
 const a=prepareOrdinaryConfiguration(template,target),b=prepareOrdinaryConfiguration(template,target);
 assert.equal(template.postgres.target.password,null);assert.ok(a.postgres.target.password.length>0);assert.notEqual(a.postgres.target.password,b.postgres.target.password);
 assert.throws(()=>prepareOrdinaryConfiguration({...template,postgres:{target:{...template.postgres.target,password:'not-permitted-on-disk'}}},target));
 class FakePool{constructor(config){this.config=config;}}
 const pool=ordinaryDriver(FakePool)({...a.postgres.target,options:'untrusted-ignored'});
 assert.equal(pool.config.options,'-c default_transaction_read_only=off');assert.equal(pool.config.user,'synthetic_nonowner');assert.equal(pool.config.host,target.unix_socket_directories);
});

test('credential continuation parent refuses absent permission proof and arbitrary output before connection',async()=>{
 const {runB07QaIdentityCommittedContinuationParent,COMMITTED_CONTINUATION_OUTPUT}=await import('./qa-identity-parent.mjs');
 await assert.rejects(runB07QaIdentityCommittedContinuationParent({contract:'B07_QA_COMMITTED_CONTINUATION_PARENT_1',outputDirectory:'/tmp/OTHER',purposeGateFile:'/tmp/OTHER/CURRENT-PURPOSE-GATE.json'}),/^Error: B07_RENEWAL_PARENT_REGISTRATION_REQUIRED$/);
 await assert.rejects(runB07QaIdentityCommittedContinuationParent({contract:'B07_QA_COMMITTED_CONTINUATION_PARENT_1',outputDirectory:COMMITTED_CONTINUATION_OUTPUT,purposeGateFile:join(COMMITTED_CONTINUATION_OUTPUT,'CURRENT-PURPOSE-GATE.json'),purposeWaitMs:300000}),/^Error: B07_RENEWAL_EXACT_PERMISSION_PROOF_REQUIRED$/);
});

test('remaining-money parent requires explicit child02 contract and never falls back to child01',async()=>{
 const {runB07QaIdentityRemainingMoneyParent,runB07QaIdentityCommittedContinuationParent,REMAINING_MONEY_OUTPUT,COMMITTED_CONTINUATION_OUTPUT}=await import('./qa-identity-parent.mjs');
 await assert.rejects(runB07QaIdentityRemainingMoneyParent({contract:'B07_QA_REMAINING_MONEY_PARENT_1',outputDirectory:COMMITTED_CONTINUATION_OUTPUT,purposeGateFile:join(COMMITTED_CONTINUATION_OUTPUT,'CURRENT-PURPOSE-GATE.json')}),/^Error: B07_RENEWAL_PARENT_REGISTRATION_REQUIRED$/);
 const plan={contract:'B07_QA_REMAINING_MONEY_PARENT_1',outputDirectory:REMAINING_MONEY_OUTPUT,purposeGateFile:join(REMAINING_MONEY_OUTPUT,'CURRENT-PURPOSE-GATE.json'),purposeWaitMs:300000};
 await assert.rejects(runB07QaIdentityCommittedContinuationParent(plan),/^Error: B07_RENEWAL_PARENT_REGISTRATION_REQUIRED$/);
 await assert.rejects(runB07QaIdentityRemainingMoneyParent(plan),/^Error: B07_RENEWAL_EXACT_PERMISSION_PROOF_REQUIRED$/);
});

test('registered retry parent requires unique child03 and preserves original request record bytes',async()=>{
 const {runB07QaIdentityRegisteredMoneyRetryParent,runB07QaIdentityRemainingMoneyParent,REGISTERED_MONEY_RETRY_OUTPUT,REMAINING_MONEY_OUTPUT,originalRequestRecordBytes}=await import('./qa-identity-parent.mjs');
 await assert.rejects(runB07QaIdentityRegisteredMoneyRetryParent({contract:'B07_QA_REGISTERED_MONEY_RETRY_PARENT_1',outputDirectory:REMAINING_MONEY_OUTPUT,purposeGateFile:join(REMAINING_MONEY_OUTPUT,'CURRENT-PURPOSE-GATE.json')}),/^Error: B07_RENEWAL_PARENT_REGISTRATION_REQUIRED$/);
 const plan={contract:'B07_QA_REGISTERED_MONEY_RETRY_PARENT_1',outputDirectory:REGISTERED_MONEY_RETRY_OUTPUT,purposeGateFile:join(REGISTERED_MONEY_RETRY_OUTPUT,'CURRENT-PURPOSE-GATE.json'),purposeWaitMs:300000};
 await assert.rejects(runB07QaIdentityRemainingMoneyParent(plan),/^Error: B07_RENEWAL_PARENT_REGISTRATION_REQUIRED$/);await assert.rejects(runB07QaIdentityRegisteredMoneyRetryParent(plan),/^Error: B07_RENEWAL_EXACT_PERMISSION_PROOF_REQUIRED$/);
 const value={phase:'DRAFT_SALES_MONEY_ONLY_NO_STOCK',command:{requestKey:'SYNTHETIC_ORIGINAL',expectedVersion:2}},bytes=Buffer.from(JSON.stringify(value,null,3)+'\n'),pin={requestBytes:bytes,sha256:createHash('sha256').update(bytes).digest('hex')};
 const copy=originalRequestRecordBytes(pin,{command:value.command,phase:value.phase});assert.ok(copy.equals(bytes));assert.notStrictEqual(copy,bytes);
 assert.throws(()=>originalRequestRecordBytes(pin,{...value,phase:'OTHER'}));assert.throws(()=>originalRequestRecordBytes({...pin,sha256:'0'.repeat(64)},value));
});

// New source714 tests are explicitly protocol fakes, not PostgreSQL evidence.
import {rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {APPROVED_SYN_DATABASE,APPROVED_SYN_OUTPUT,APPROVED_SYN_QA,validateApprovedSynParentPlan,withB07ApprovedSynIdentity,runB07ApprovedSynSessionParent} from './qa-identity-parent.mjs';
async function synFixture(t,options={}){
 const root=await mkdtemp(join(tmpdir(),'b07-syn-session-source714-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const plan={contract:'B07_SYN_APPROVED_SESSION_PARENT_V1',sourceKind:'SYNTHETIC_ONLY',realSourceImportVerified:false,
  outputDirectory:APPROVED_SYN_OUTPUT,purposeGateFile:join(APPROVED_SYN_OUTPUT,'CURRENT-PURPOSE-GATE.json'),sourceRoot:P+'/work/erp-local-source-20261022',purposeWaitMs:0,
  ordinaryRole:'t45_b07_syn_approved_protocol_fake',createdAt:'2026-10-27T00:00:00.000Z',registrationReference:'SOURCE714_PROTOCOL_FAKE_ONLY',
  target:{database:APPROVED_SYN_DATABASE,oid:'711001',role:'naijue_erp_test',session_role:'publication19_bootstrap',server_address:null,server_port:null,port:55679,postmaster_started_at:'2026-10-27 00:00:00+00',unix_socket_directories:'/private/tmp/nj-b07-syn-approved-protocol-fake'}};
 const pub={profile:'B07_SYN_APPROVED_V1',sourceKind:'SYNTHETIC_ONLY',realSourceImportVerified:false,target:{database:plan.target.database,oid:plan.target.oid,role:plan.target.role},publicationResult:{status:'IMPORTED'},
  references:{batchId:'00000000-0000-0000-0000-000000000001',publishedOperationId:'00000000-0714-4000-8000-000000000001',cases:[{kind:'sales',capturedSourceStatus:'APPROVED',capturedVersion:1},{kind:'transfers',capturedSourceStatus:'APPROVED',capturedVersion:1}]}};
 const bytes=Buffer.from(JSON.stringify(pub)),path=join(root,'PUBLICATION.json');await writeFile(path,bytes,{mode:0o600});plan.publication={path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const calls=[],records=[],facts={accountHash:null,staffInserts:0,accountInserts:0,logins:0,logouts:0,password:null};
 const client={connectionParameters:{host:plan.target.unix_socket_directories,port:plan.target.port},async query(sql,args){calls.push(sql);let rows=[],rowCount=0;
  if(sql===fixtureSql.target){const {unix_socket_directories,...actual}=plan.target;rows=[actual];}
  else if(sql===fixtureSql.versions)rows=Array.from({length:19},(_,i)=>({version:i+1}));
  else if(sql===fixtureSql.guards)rows=[{count:options.guards??0}];
  else if(sql===fixtureSql.before)rows=[{accounts:1,sessions:0,disabled_source:1,qa_staff:0,qa_account:0}];
  else if(sql.includes('/* b07-syn:original-publication */'))rows=[{id:pub.references.batchId}];
  else if(sql===fixtureSql.staff){facts.staffInserts++;rowCount=1;assert.deepEqual(args,[APPROVED_SYN_QA.staffId,APPROVED_SYN_QA.name]);}
  else if(sql===fixtureSql.account){facts.accountInserts++;facts.accountHash=args[3];rowCount=1;assert.equal(args[0],APPROVED_SYN_QA.accountId);assert.equal(args[2],APPROVED_SYN_QA.loginName);}
  else if(sql===fixtureSql.readback)rows=[{accounts:2,sessions:0,qa_staff_present:1,qa_account_present:1,disabled_source:1,qa_staff:1,qa_account:1}];
  else if(sql==='COMMIT'&&options.unknownCommit){const error=Error('PROTOCOL_FAKE_ACK_LOST');error.code='08006';throw error;}
  return {rows,rowCount:rowCount||rows.length};},async end(){}};
 const api={trustedOrigin:'https://syn-only.invalid',app:{server:{listening:false},async inject(req){
  if(req.url==='/auth/login'){facts.logins++;facts.password=req.payload.password;assert.equal(req.payload.loginName,APPROVED_SYN_QA.loginName);
   const {createNodeScryptPasswords}=await import(pathToFileURL(join(plan.sourceRoot,'packages/authentication/src/passwords.ts')).href);assert.equal(await createNodeScryptPasswords().verify(facts.password,facts.accountHash),true);
   return {statusCode:200,headers:{'set-cookie':'synSession=PROTOCOL_FAKE_PRIVATE; HttpOnly; Secure'}};}
  if(req.url==='/auth/logout'){facts.logouts++;return {statusCode:204};}
  assert.equal(req.url,'/auth/session');return {statusCode:200,json:()=>({principal:{...APPROVED_SYN_QA,staffId:APPROVED_SYN_QA.staffId,authVersion:1}})};
 }}};
 return {plan,client,api,calls,records,facts,recordPreparation:async v=>records.push(v)};
}
test('SYN source714 plan is closed to one new DB/output and rejects old07/real scope before client calls',async t=>{
 const f=await synFixture(t);assert.equal(validateApprovedSynParentPlan(f.plan).target.database,APPROVED_SYN_DATABASE);
 for(const mutate of [p=>p.target.database='naijue_erp_test_19e00102',p=>p.outputDirectory=join(APPROVED_SYN_OUTPUT,'other'),p=>p.sourceKind='REAL',p=>p.realSourceImportVerified=true,p=>p.ordinaryRole='postgres',p=>p.target.unix_socket_directories='/tmp/old07']){
  const plan=structuredClone(f.plan);mutate(plan);await assert.rejects(runB07ApprovedSynSessionParent({plan,setupClient:f.client,afterSeedUpgrade:async()=>{throw Error('MUST_NOT_RUN');}}),/^Error: B07_SYN_/);
 }
 assert.equal(f.calls.length,0);
});
test('SYN source714 one fixture INSERT pair plus one normal login/logout, no secret/hash/cookie in recorder',async t=>{
 const f=await synFixture(t);let escaped;
 const out=await withB07ApprovedSynIdentity({...f,afterSeed:async({withNormalSession,qaIdentity,publication})=>{
  assert.equal(qaIdentity,APPROVED_SYN_QA);assert.equal(publication.sourceKind,'SYNTHETIC_ONLY');escaped=withNormalSession;
  await withNormalSession(f.api,async({actor,privateCookie})=>{assert.equal(actor.accountId,APPROVED_SYN_QA.accountId);assert.match(privateCookie,/^synSession=/);});
  await assert.rejects(withNormalSession(f.api,async()=>{}),/^Error: B07_SYN_ONE_NORMAL_SESSION_ONLY$/);
 }});
 assert.equal(out.logoutConfirmed,true);assert.equal(f.facts.staffInserts,1);assert.equal(f.facts.accountInserts,1);assert.equal(f.facts.logins,1);assert.equal(f.facts.logouts,1);
 assert.equal(f.calls.filter(s=>s==='COMMIT').length,1);assert.equal(f.calls.some(s=>/\b(UPDATE|ALTER|GRANT|TRUNCATE|DELETE)\b/.test(s)),false);
 const serialized=JSON.stringify(f.records);for(const secret of [f.facts.password,f.facts.accountHash,'PROTOCOL_FAKE_PRIVATE'])assert.equal(serialized.includes(secret),false);
 await assert.rejects(escaped(f.api,async()=>{}),/^Error: B07_SYN_ONE_NORMAL_SESSION_ONLY$/);
});
test('SYN source714 actual-work failure still logs out and does not seed/login again',async t=>{
 const f=await synFixture(t);
 await assert.rejects(withB07ApprovedSynIdentity({...f,afterSeed:async({withNormalSession})=>withNormalSession(f.api,async()=>{throw Error('PROTOCOL_FAKE_WORK_FAILED');})}),/PROTOCOL_FAKE_WORK_FAILED/);
 assert.equal(f.facts.logouts,1);assert.equal(f.facts.accountInserts,1);assert.equal(f.facts.logins,1);
});
test('SYN source714 unknown seed COMMIT preserves outcome without rollback/reinsert/login/upgrade',async t=>{
 const f=await synFixture(t,{unknownCommit:true});let upgrades=0,error;
 try{await withB07ApprovedSynIdentity({...f,afterSeed:async()=>{upgrades++;}});}catch(e){error=e;}
 assert.equal(error.message,'B07_SYN_SEED_COMMIT_UNKNOWN_READBACK_ONLY');assert.equal(error.seedFailure.commitAttempted,true);
 assert.equal(f.calls.filter(s=>s==='COMMIT').length,1);assert.equal(f.calls.filter(s=>s==='ROLLBACK').length,0);
 assert.equal(f.facts.accountInserts,1);assert.equal(f.facts.logins,0);assert.equal(upgrades,0);
});
test('SYN source714 existing guards reject preupgrade seed, with rollback and zero writes',async t=>{
 const f=await synFixture(t,{guards:1});
 await assert.rejects(withB07ApprovedSynIdentity({...f,afterSeed:async()=>{throw Error('MUST_NOT_RUN');}}),/^Error: B07_SYN_SEED_FAILED_NO_RETRY$/);
 assert.equal(f.facts.staffInserts,0);assert.equal(f.facts.accountInserts,0);assert.equal(f.calls.filter(s=>s==='ROLLBACK').length,1);
});

// source732 uses protocol fakes ONLY; no PostgreSQL or actual private output.
import {RENEWAL_SQL} from './qa-identity-credential-renewal.mjs';
import {validateSyn26Auth1Continuation,withB07Syn26Auth1Continuation,withB07Syn26ManagedNormalSession,runB07ExistingSyn26SessionContinuationParent,SYN26_CONTINUATION_OUTPUT} from './qa-identity-parent.mjs';
async function syn26Fixture(t,options={}){
 const base=await synFixture(t),q=APPROVED_SYN_QA,id=n=>`00000000-0732-4000-8000-${String(n).padStart(12,'0')}`;
 const target={...base.plan.target,oid:'16385'},functions=[{name:'guard_maintenance_account_event',sha256:'965d9d3433b929ccd151b9a147eeef713770d7b7311e49c80cfaa3d17b118549'},{name:'validate_available_administrator_commit',sha256:'3a9a1bea930614761185af90b8591a539b855647974b68b004869c80f5e5ba18'},{name:'validate_maintenance_root_commit',sha256:'8556d1ed234adb3bae1d99c9bb8e867db4070eadafa39dbb8b31752c7e24b512'}];
 const triggers=[['account_maintenance_event','guard_maintenance_account_event',false],['user_account_maintenance_final_consistency','validate_maintenance_root_commit',true],['account_available_administrator','validate_available_administrator_commit',true]].map(([name,routine,deferred],i)=>({oid:String(900+i),name,table_name:'user_account',routine,enabled:'O',internal:false,deferrable:deferred,initially_deferred:deferred}));
 const approvedInput={contract:'B07_SYN_APPROVED_NORMAL_HISTORY_V1',profile:'B07_SYN_APPROVED_V1',sourceKind:'SYNTHETIC_ONLY',realSourceImportVerified:false,sourceRoot:base.plan.sourceRoot,origin:'https://syn-only.invalid',target:{database:target.database,oid:target.oid,role:base.plan.ordinaryRole},actor:{accountId:q.accountId,hallId:null},maxRows:100,
  references:{batchId:'00000000-0000-0000-0000-000000000001',publishedOperationId:'89d8e3cb-5b42-4637-ed8c-0adf2091344a',cases:['sales','transfers'].map((kind,i)=>({kind,documentId:id(10+i),lineId:id(20+i),capturedVersion:1,capturedSourceStatus:'APPROVED',capturedQuantity:i?'3':'2',proposedQuantity:i?'4':'3'}))},keys:Object.fromEntries(['sales','salesCas','transfers','transfersCas','rollback'].map(k=>[k,'B07_SYN_APPROVED_V1_'+k.toUpperCase()]))};
 const proof={format:'B07_SYN26_QA_AUTH1_READONLY_PROOF_V1',target:{database:target.database,oid:target.oid,role:target.role},profile:EFFECTIVE_VALUE_PROFILE,catalogSha256:'a'.repeat(64),businessDML:0,credentialRead:false,rollbackReturned:true,clientsEnded:true,qa:{accountId:q.accountId,staffId:q.staffId,version:1,authVersion:1,notSource:true,sourceActorDisabled:true,liveSessions:0},noOriginalHistoryKeys:true,can_read_identity:true,can_update_credential:true,can_revoke_sessions:true,functions,triggers};
 const input={...base.plan,target,contract:'B07_SYN26_QA_AUTH1_CONTINUATION_V1',expectedVersion:1,expectedAuthVersion:1,changedAt:'2026-10-27T00:01:00.000Z',approvedInput,permissionProof:proof};
 const calls=[],records=[],events=[],state={version:options.version??1,hash:'PROTOCOL_FAKE_OLD_UNREAD',updatedAt:input.createdAt,updates:0,logins:0,logouts:0,recoveryCalls:0,recoveryEnded:0,setupEnded:0,newPassword:null};
 const makeClient=readonly=>({connectionParameters:{host:target.unix_socket_directories,port:target.port},async query(sql,args=[]){calls.push({sql,readonly});let rows=[],rowCount=0;
  if(sql===RENEWAL_SQL.target){const {unix_socket_directories,...value}=target;rows=[value];}
  else if(sql===RENEWAL_SQL.admission)rows=[{versions:Array.from({length:26},(_,i)=>i+1),functions,triggers,management_role_safe:options.guard!==false,can_read_identity:true,can_update_credential:options.permission!==false,can_revoke_sessions:true}];
  else if(sql===RENEWAL_SQL.lock)rows=[{id:q.accountId}];
  else if(sql.includes('/* syn26-auth1:original-keys */'))rows=options.originalKey?[{request_key:approvedInput.keys.sales}]:[];
  else if(sql.includes('/* syn26-auth1:heads */'))rows=[{version:1,source_status:'APPROVED',effective_count:0}];
  else if(sql.includes('/* syn26-auth1:original-publication */'))rows=[{id:approvedInput.references.publishedOperationId}];
  else if(sql.includes('/* syn26-auth1:source-absence */'))rows=[{parties:0,header_staff:0,records:0,claims:0}];
  else if(sql.includes('/* syn26-auth1:facts:'))rows=[];
  else if(sql===RENEWAL_SQL.state){rows=[{account:{id:q.accountId,staff_id:q.staffId,login_name:q.loginName,login_enabled:true,version:state.version,auth_version:state.version,created_at:input.createdAt,updated_at:state.updatedAt},staff:{id:q.staffId,name:q.name,role:'WAREHOUSE',hall_id:null,employment_status:'在职',contact:null,version:1},live_sessions:0,source_disabled:true,qa_not_source:true,no_colliding_audit:true,other_accounts:[{id:'00000000-0000-0000-0000-000000000802',login_enabled:false}],credential_matches:args[3]===state.hash}];}
  else if(sql===RENEWAL_SQL.update){state.updates++;events.push('CAS');assert.equal(args[0],q.accountId);assert.equal(args[3],1);assert.equal(args[4],1);
   if(!options.casConflict){state.hash=args[5];state.version=2;state.updatedAt=input.changedAt;rows=[{id:q.accountId,version:2,auth_version:2}];rowCount=1;}}
  else if(sql===RENEWAL_SQL.sessions)rowCount=0;
  else if(sql==='COMMIT'&&!readonly&&options.unknownCommit){if(options.unknownAbsent){state.version=1;state.hash='PROTOCOL_FAKE_OLD_UNREAD';state.updatedAt=input.createdAt;}const e=Error('PROTOCOL_FAKE_COMMIT_ACK_LOST');e.code='08006';throw e;}
  else assert.ok(sql==='BEGIN'||sql.startsWith('SET LOCAL')||sql.startsWith('LOCK TABLE')||sql==='COMMIT'||sql==='ROLLBACK'||sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','Unexpected continuation query');
  return {rows,rowCount:rowCount||rows.length};},async end(){state.setupEnded++;}});
 const api={trustedOrigin:approvedInput.origin,app:{server:{listening:false},async inject(req){
  if(req.url==='/auth/login'){state.logins++;events.push('LOGIN');state.newPassword=req.payload.password;assert.equal(req.payload.loginName,q.loginName);
   const {createNodeScryptPasswords}=await import(pathToFileURL(join(input.sourceRoot,'packages/authentication/src/passwords.ts')).href);assert.equal(await createNodeScryptPasswords().verify(req.payload.password,state.hash),true);return {statusCode:200,headers:{'set-cookie':'syn26=PROTOCOL_FAKE_COOKIE; Secure; HttpOnly'}};}
  if(req.url==='/auth/logout'){state.logouts++;return {statusCode:204};}
  assert.equal(req.url,'/auth/session');return {statusCode:200,json:()=>({principal:{accountId:q.accountId,staffId:q.staffId,role:'WAREHOUSE',hallId:null,authVersion:state.version}})};
 }}};
 return {input,api,client:makeClient(false),calls,records,events,state,recordPreparation:async v=>records.push(v),runNormalSession:withB07Syn26ManagedNormalSession,
  withRecoveryClient:async work=>{state.recoveryCalls++;try{return await work(makeClient(true));}finally{state.recoveryEnded++;}}};
}
test('SYN source732 closed input cannot reuse old07 proof, auth2/3/4, other account or arbitrary target',async t=>{
 const f=await syn26Fixture(t);assert.equal(validateSyn26Auth1Continuation(f.input).expectedVersion,1);
 for(const mutate of [x=>x.target.database='naijue_erp_test_19e00102',x=>x.expectedVersion=2,x=>x.expectedAuthVersion=4,x=>x.permissionProof.format='B07_QA_CREDENTIAL_RENEWAL_READONLY_PROOF_1',x=>x.approvedInput.actor.accountId='b0700000-0000-4000-8000-000000000002',x=>x.permissionProof.functions[0].sha256='f'.repeat(64)]){
  const input=structuredClone(f.input);mutate(input);await assert.rejects(withB07Syn26Auth1Continuation({...f,input,afterRenewal:async()=>{throw Error('MUST_NOT_RUN');}}));}
 assert.equal(f.calls.length,0);assert.equal(f.state.updates,0);
});
test('SYN source732 one existing QA CAS1to2 then one normal login/logout, with no credential in records',async t=>{
 const f=await syn26Fixture(t);let escaped;
 const result=await withB07Syn26Auth1Continuation({...f,afterRenewal:async({withNormalSession,authVersion})=>{assert.equal(authVersion,2);escaped=withNormalSession;await withNormalSession(f.api,async()=>{});await assert.rejects(withNormalSession(f.api,async()=>{}),/SINGLE_SESSION/);}});
 assert.equal(result.authVersion,2);assert.equal(f.state.updates,1);assert.deepEqual(f.events,['CAS','LOGIN']);assert.equal(f.state.logins,1);assert.equal(f.state.logouts,1);assert.equal(f.state.recoveryCalls,0);
 assert.equal(f.calls.some(c=>/^\s*(?:INSERT|ALTER|CREATE|GRANT|DELETE|TRUNCATE)\b/.test(c.sql)),false);
 const text=JSON.stringify(f.records);for(const secret of [f.state.hash,f.state.newPassword,'PROTOCOL_FAKE_COOKIE'])assert.equal(text.includes(secret),false);
 await assert.rejects(escaped(f.api,async()=>{}),/SINGLE_SESSION/);
});
test('SYN source732 current guard/privilege/preimage/original-key/CAS conflict stops without login or retry',async t=>{
 for(const options of [{guard:false},{permission:false},{version:2},{originalKey:true},{casConflict:true}]){
  const f=await syn26Fixture(t,options);await assert.rejects(withB07Syn26Auth1Continuation({...f,afterRenewal:async()=>{throw Error('MUST_NOT_RUN');}}),/PRECOMMIT_STOP_NO_RETRY/);
  assert.equal(f.state.updates,options.casConflict?1:0);assert.equal(f.state.logins,0);assert.equal(f.state.recoveryCalls,0);assert.equal(f.calls.filter(c=>c.sql==='ROLLBACK').length,1);}
});
test('SYN source732 unknown COMMIT recovers original same RAM secret by readonly only and never issues second CAS',async t=>{
 const f=await syn26Fixture(t,{unknownCommit:true});const result=await withB07Syn26Auth1Continuation({...f,afterRenewal:async({withNormalSession})=>withNormalSession(f.api,async()=>{})});
 assert.equal(result.commitRecovered,true);assert.equal(f.state.updates,1);assert.equal(f.state.recoveryCalls,1);assert.equal(f.state.recoveryEnded,1);assert.equal(f.state.logins,1);assert.equal(f.state.logouts,1);
 assert.equal(f.calls.filter(c=>c.sql==='COMMIT'&&!c.readonly).length,1);assert.equal(f.calls.some(c=>c.sql==='ROLLBACK'&&!c.readonly),false);assert.equal(f.calls.filter(c=>c.sql==='ROLLBACK'&&c.readonly).length,1);
 assert.equal(f.calls.filter(c=>c.readonly).some(c=>/^\s*UPDATE/.test(c.sql)),false);
});
test('SYN source732 unknown unconfirmed COMMIT stops without rekey, second CAS, login or upgrade',async t=>{
 const f=await syn26Fixture(t,{unknownCommit:true,unknownAbsent:true});let entered=0;
 await assert.rejects(withB07Syn26Auth1Continuation({...f,afterRenewal:async()=>{entered++;}}),/COMMIT_UNKNOWN_STOP_NO_RETRY/);
 assert.equal(f.state.updates,1);assert.equal(f.state.recoveryCalls,1);assert.equal(f.state.recoveryEnded,1);assert.equal(f.state.logins,0);assert.equal(entered,0);assert.equal(f.calls.some(c=>c.sql==='ROLLBACK'&&!c.readonly),false);
});
test('SYN source732 normal-work failure logs out, expires closure and preserves committed auth2 boundary',async t=>{
 const f=await syn26Fixture(t);let escaped,error;
 try{await withB07Syn26Auth1Continuation({...f,afterRenewal:async({withNormalSession})=>{escaped=withNormalSession;await withNormalSession(f.api,async()=>{throw Error('PROTOCOL_FAKE_WORK_FAILED');});}});}catch(e){error=e;}
 assert.equal(error.syn26Failure.commitAttempted,true);assert.equal(f.state.version,2);assert.equal(f.state.updates,1);assert.equal(f.state.logins,1);assert.equal(f.state.logouts,1);await assert.rejects(escaped(f.api,async()=>{}),/SINGLE_SESSION/);
});
test('SYN source732 accepted carrier closes setup on invalid prior evidence before purpose, secret or any write',async t=>{
 const f=await syn26Fixture(t),path=join(await mkdtemp(join(tmpdir(),'b07-syn732-invalid-prior-')),'PRIOR.json');t.after(()=>rm(join(path,'..'),{recursive:true,force:true}));
 const bytes=Buffer.from('{}');await writeFile(path,bytes,{mode:0o600});const ref={path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const plan={...f.input,contract:'B07_SYN26_QA_AUTH1_CONTINUATION_PARENT_V1',sourceKind:'SYNTHETIC_ONLY',realSourceImportVerified:false,outputDirectory:SYN26_CONTINUATION_OUTPUT,purposeGateFile:join(SYN26_CONTINUATION_OUTPUT,'CURRENT-PURPOSE-GATE.json'),priorTerminalResult:ref,priorLifecycle:ref};
 await assert.rejects(runB07ExistingSyn26SessionContinuationParent({plan,setupClient:f.client,withRecoveryClient:f.withRecoveryClient}),/PARENT_STOPPED/);
 assert.equal(f.state.setupEnded,1);assert.equal(f.state.updates,0);assert.equal(f.calls.length,0);
});

// Owned targeted diagnosis increment only. No original current-purpose/PG replay.
import {syn26SafeFailure} from './qa-identity-parent.mjs';
test('SYN diagnostic preserves distinct factory/read-pool/issuer phase and finite actual error codes',()=>{
 const catalog=Object.assign(Error('Actual exact schema, source bodies or catalog differs from independent review'),{code:'NATIVE_RUNTIME26_NOT_READY'});
 const factory=syn26SafeFailure(catalog,'CREATE_NORMAL_FACTORY');assert.equal(factory.phase,'CREATE_NORMAL_FACTORY');assert.equal(factory.errorCode,'NATIVE_RUNTIME26_NOT_READY');assert.equal(factory.reason,'RUNTIME_CATALOG_OR_SOURCE_MISMATCH');
 const pool=syn26SafeFailure(Object.assign(Error('PRIVATE_CONFIG_BODY'),{code:'PG_INVALID_CONFIG'}),'CREATE_READ_POOL');assert.equal(pool.phase,'CREATE_READ_POOL');assert.equal(pool.errorCode,'PG_INVALID_CONFIG');assert.equal(pool.reason,null);
 const issuer=syn26SafeFailure(Object.assign(Error('Actual runtime target, process or role differs from independent review'),{code:'NATIVE_RUNTIME26_NOT_READY'}),'CREATE_ISSUER');assert.equal(issuer.phase,'CREATE_ISSUER');assert.equal(issuer.reason,'RUNTIME_TARGET_MISMATCH');
 assert.equal(syn26SafeFailure(Object.assign(Error('/private/SECRET_MODULE'),{code:'ERR_MODULE_NOT_FOUND'}),'LOAD_RUNTIME_MODULES').errorCode,'ERR_MODULE_NOT_FOUND');
});
test('SYN diagnostic never emits messages/config/SQL/actual-expected/private paths and bounds aggregate causes',()=>{
 const secret='PRIVATE_SECRET_CONFIG_TOKEN_PASSWORD';const error=Object.assign(new TypeError(secret),{code:secret,actual:{password:secret},expected:secret,config:{password:secret},sql:secret});
 error.stack=`TypeError: ${secret}\n at secret (/private/${secret}/secret.mjs:9:1)\n at host (file:///private/${secret}/production-provider-composition.ts:188:4)`;
 const aggregate=new AggregateError([error,error,error,error],secret),result=syn26SafeFailure(aggregate,'PRIVATE_PHASE_'+secret);
 const text=JSON.stringify(result);assert.equal(text.includes(secret),false);assert.equal(text.includes('/private/'),false);assert.equal(result.phase,'UNCLASSIFIED');assert.equal(result.causes.length,3);
 for(const c of result.causes){assert.equal(c.errorCode,null);assert.equal(c.reason,null);assert.deepEqual(c.sourceFrames,[{file:'production-provider-composition.ts',line:188,column:4}]);assert.equal(Object.hasOwn(c,'message'),false);assert.equal(Object.hasOwn(c,'stack'),false);}
});
test('SYN diagnostic retains precommit and uncertain recovery cause through the existing safe wrapper without CAS replay',async t=>{
 for(const options of [{guard:false},{unknownCommit:true,unknownAbsent:true}]){
  const f=await syn26Fixture(t,options);let error;try{await withB07Syn26Auth1Continuation({...f,afterRenewal:async()=>{throw Error('MUST_NOT_RUN');}});}catch(e){error=e;}
  assert.ok(error.syn26Failure.diagnostic);assert.equal(error.syn26Failure.diagnostic.phase,options.guard===false?'CURRENT_ADMISSION':'SAME_RAM_READONLY_COMMIT_RECOVERY');
  assert.equal(error.syn26Failure.diagnostic.errorCode,options.guard===false?'B07_SYN26_CURRENT_GUARDS_OR_PRIVILEGES_CHANGED':'B07_SYN26_CAS_READBACK_CHANGED');
  assert.equal(f.state.updates,options.guard===false?0:1);assert.equal(f.state.logins,0);assert.equal(JSON.stringify(error.syn26Failure).includes(f.state.hash),false);
 }
});
test('SYN diagnostic actual parent error keeps safe prior phase while closing setup and doing no credential work',async t=>{
 const f=await syn26Fixture(t),dir=await mkdtemp(join(tmpdir(),'b07-syn-diagnostic-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'PRIOR.json'),bytes=Buffer.from('{}');await writeFile(path,bytes,{mode:0o600});
 const ref={path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};const plan={...f.input,contract:'B07_SYN26_QA_AUTH1_CONTINUATION_PARENT_V1',sourceKind:'SYNTHETIC_ONLY',realSourceImportVerified:false,outputDirectory:SYN26_CONTINUATION_OUTPUT,purposeGateFile:join(SYN26_CONTINUATION_OUTPUT,'CURRENT-PURPOSE-GATE.json'),priorTerminalResult:ref,priorLifecycle:ref};
 let error;try{await runB07ExistingSyn26SessionContinuationParent({plan,setupClient:f.client,withRecoveryClient:f.withRecoveryClient});}catch(e){error=e;}
 assert.equal(error.syn26ParentFailure.phase,'PRIOR_TERMINAL');assert.equal(error.syn26ParentFailure.errorCode,'B07_SYN26_ORIGINAL_TERMINAL_BOUNDARY_REQUIRED');assert.equal(f.state.setupEnded,1);assert.equal(f.state.updates,0);assert.equal(f.calls.length,0);
});
