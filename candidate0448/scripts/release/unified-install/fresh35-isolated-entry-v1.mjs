import {isNodeScryptPasswordHash,NODE_SCRYPT_DUMMY_HASH} from '../../../packages/authentication/src/passwords.ts';
import {requestHash} from '../../../packages/application/src/request-hash.ts';
import {historicalSettlementRetentionWire} from '../../../packages/application/src/unified-historical-settlement-retention.ts';
/** Root-deployed bridge for one disposable validation instance. It uses the
 * unchanged genuine combined authorization/install path. It never publishes a
 * record from JSON, grants privileges or issues authorization. Host inspection
 * is a separate ordinary-UID phase after actual durable publication. */
import {readFile,lstat,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';
import {assertTrustedRootPath,assertTrustedRootTree} from './trusted-install-path.mjs';
import {loadFresh35CombinedSource,describeFresh35CombinedSource,resolveFresh35ReferenceInputPaths} from './fresh35-combined-source-v1.mjs';
import {bindFresh35CombinedTarget} from './fresh35-combined-target-v1.mjs';
import {buildFresh35CombinedCatalog} from './fresh35-combined-catalog-v1.mjs';
import {compileFresh35CombinedProgram,describeFresh35CombinedProgram,loadFresh35CombinedAuthorization,runFresh35CombinedInstall,describeFresh35CombinedCompletion,describeFresh35CombinedInstallFailure} from './fresh35-combined-lifecycle-v1.mjs';
import {publishFresh35CombinedRecord} from './fresh35-combined-record-v1.mjs';
const root='/opt/naijue-erp/fresh35-combined-v1';
const authority='/etc/naijue-erp/fresh35-isolated-provision-v1.json';
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_ISOLATED_'+code)};
export function isolatedClientOptions(target,password){
 need(target?.proposal?.host==='127.0.0.1'&&typeof password==='string'&&/^[a-f0-9]{64}$/.test(password),'PRIVATE_OWNER_CONNECTION_INPUT');
 const p=target.proposal;return {host:p.host,port:p.port,database:p.database,user:p.owner,password,ssl:false,application_name:'fresh35-isolated-v1',connectionTimeoutMillis:5000,query_timeout:45000,options:'-c search_path=pg_catalog -c TimeZone=UTC -c lock_timeout=5000 -c statement_timeout=40000'};
}
async function privateText(path){
 await assertTrustedRootPath(path);const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await file.stat();need(s.isFile()&&s.uid===0&&s.nlink===1&&(s.mode&0o077)===0&&s.size>0&&s.size<4*1024*1024,'PRIVATE_INPUT_REQUIRED');return await file.readFile('utf8')}finally{await file.close()}
}
export async function main(){
 need(process.platform==='linux'&&process.getuid?.()===0&&process.geteuid?.()===0&&process.version==='v24.21.0','TRUSTED_ROOT_RUNTIME_REQUIRED');
 need(['--describe','--execute','--verify-host','--verify-host-rollback','--verify-host-commit'].includes(process.argv[2])&&process.argv.length===(process.argv[2]==='--verify-host-commit'?4:3)&&(process.argv[2]!=='--verify-host-commit'||/^[a-f0-9]{64}$/.test(process.argv[3]))&&process.argv[1]===root+'/scripts/release/unified-install/fresh35-isolated-entry-v1.mjs','FIXED_ENTRY_REQUIRED');
 need(!Object.keys(process.env).some(k=>k==='NODE_OPTIONS'||k==='NODE_PATH'||k==='DATABASE_URL'||k.startsWith('PG')||k.startsWith('LD_')||k.startsWith('DYLD_')),'CLEAN_ENV_REQUIRED');
 await assertTrustedRootTree(root);await assertTrustedRootPath(process.execPath);
 const a=parseStrictJson(await privateText(authority));
 need(a.format==='FRESH35_ISOLATED_PROVISION_AUTHORIZATION_V1'&&a.decision==='AUTHORIZE_EXACT_NEW35_INSTALL_RECORD_AND_SYNTHETIC_IMPORT','EXTERNAL_PROVISION_AUTHORITY_REQUIRED');
 const workspace=a.proposal.workspaceDirectory;
 need(/^\/var\/lib\/naijue-erp\/fresh35-isolated\/cloud-pg-fresh35-[0-9]{8}-r[1-9][0-9]{0,3}$/.test(workspace),'FIXED_WORKSPACE_REQUIRED');
 const input=parseStrictJson(await privateText(join(workspace,'target-binding.json')));
 need(Object.keys(input.proposal).length===Object.keys(a.proposal).length&&Object.keys(a.proposal).every(k=>Object.hasOwn(input.proposal,k)&&input.proposal[k]===a.proposal[k])&&input.startsAt===a.startsAt&&input.expiresAt===a.expiresAt,'TARGET_PROVISION_BINDING_DIFFERS');
 const paths=await resolveFresh35ReferenceInputPaths(root+'/reference-inputs');
 const source=await loadFresh35CombinedSource(root,{baselineDirectory:paths.baselineDirectory});
 need(describeFresh35CombinedSource(source).sourceSetSha256===a.sourceSetSha256,'SOURCE_SET_DIFFERS');
 const target=bindFresh35CombinedTarget(input);
 const catalog=await buildFresh35CombinedCatalog(source,target,paths);
 const program=await compileFresh35CombinedProgram({source,target,catalog});
 if(process.argv[2]==='--describe'){process.stdout.write(JSON.stringify(describeFresh35CombinedProgram(program))+'\n');return;}
 if(['--verify-host','--verify-host-rollback','--verify-host-commit'].includes(process.argv[2])){
  const raw=await privateText(join(workspace,'credentials',a.proposal.controller+'.pgpass'));
  const prefix=`127.0.0.1:${a.proposal.port}:*:${a.proposal.controller}:`;
  need(raw.startsWith(prefix)&&/^[a-f0-9]{64}\n$/.test(raw.slice(prefix.length)),'EXACT_CONTROLLER_CREDENTIAL_REQUIRED');
  need(Number.isSafeInteger(a.postgresUid)&&a.postgresUid>0&&Number.isSafeInteger(a.postgresGid)&&a.postgresGid>0,'ORDINARY_HOST_UID_REQUIRED');
  const applicationInput=await privateText(join(workspace,'credentials','synthetic-application-scrypt.txt'));
  const encodedScrypt=applicationInput.slice(0,-1);
  need(applicationInput.endsWith('\n')&&isNodeScryptPasswordHash(encodedScrypt)&&encodedScrypt!==NODE_SCRYPT_DUMMY_HASH,'SYNTHETIC_APPLICATION_CREDENTIAL_REQUIRED');
  const config={host:a.proposal.host,port:a.proposal.port,database:a.proposal.database,user:a.proposal.controller,password:raw.slice(prefix.length,-1)};
  process.setgroups([]);process.setgid(a.postgresGid);process.setuid(a.postgresUid);
  need(process.getuid()===a.postgresUid&&process.geteuid()===a.postgresUid,'ORDINARY_HOST_UID_REQUIRED');
  const {loadFresh35HostContext,fresh35HostContext,openReviewedFresh35Host}=await import('../../../tools/unified-import/fresh35-host-session.mjs');
  const {assertWholeSalesAdmissionV1}=await import('./whole-sales-admission-v1.mjs');
  const {HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256}=await import('../../../packages/application/src/unified-import-contract.ts');
  const {buildSyntheticFresh35WholePackageFixture}=await import('../../../tests/fixtures/unified-import/whole-package-synthetic.ts');
  const {executeWholePackage}=await import('../../../tools/unified-import/whole-package-client.ts');
  const {inspectWholePackage}=await import('../../../tools/unified-import/whole-package-inspect.ts');
  const {createWholePackageSqlKernel}=await import('../../../tools/unified-import/whole-package-sql-kernel.ts');
  const {reconcileWholePackage}=await import('../../../tools/unified-import/whole-package-reconcile.mjs');
  const context=fresh35HostContext(await loadFresh35HostContext(root,root+'/reference-inputs'));
  const standardTarget={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:input.physical.systemIdentifier,database_oid:input.physical.databaseOid,database_name:input.proposal.database,catalog_sha256:context.record.catalogSha256};
  const stage=process.argv[2]==='--verify-host-rollback'?'rollback':process.argv[2]==='--verify-host-commit'?'commit':'all';
  const options={referenceDirectory:root+'/reference-inputs',sourceProfileSha256:HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256};
  let fixture,fixtureBinding,fixtureBindingSha256;
  try{
   // This one small, explicit synthetic fixture is separate from the real
   // cleaning package. Its planned warehouse binding is checked by SQL in the
   // same transaction; it is not an observation of a real imported warehouse.
   const failed=await openReviewedFresh35Host(config,root,standardTarget,async(client,admission)=>{
    assertWholeSalesAdmissionV1(admission,standardTarget,client);
    fixture=await buildSyntheticFresh35WholePackageFixture(standardTarget,encodedScrypt,{historicalSalesAdmission:admission,workspaceDirectory:join(workspace,'pg-private'),targetCapturedAt:null,variant:'settlement-retention25'});
    const f=fixture.fixtureBinding;
    need(f&&Object.keys(f).sort().join(',')==='initializerSha256,manifestSha256,planSha256,stepsSha256'&&Object.values(f).every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))&&f.manifestSha256===fixture.program.initialize.package_manifest_sha256&&f.planSha256===fixture.program.initialize.plan_sha256&&f.initializerSha256===requestHash({initialize:fixture.program.initialize,encodedScrypt}),'SYNTHETIC_RETENTION_FIXTURE_BINDING_REQUIRED');
    const installed=describeFresh35CombinedProgram(program);
    fixtureBinding={format:'FRESH35_SYNTHETIC_RETENTION25_STAGE_BINDING_V1',sourceSetSha256:installed.sourceSetSha256,installProgramSha256:installed.programSha256,targetSha256:installed.targetSha256,...fixture.fixtureBinding};
    fixtureBindingSha256=requestHash(fixtureBinding);
    if(stage==='commit'){need(fixtureBindingSha256===process.argv[3],'SYNTHETIC_RETENTION_STAGE_BINDING_CHANGED');}
    need(fixture.retainedSalesIds?.length===25&&fixture.historicalSettlementRetentionApproval,'SYNTHETIC_RETENTION_FIXTURE_REQUIRED');
    const retainedWire=historicalSettlementRetentionWire(fixture.historicalSettlementRetentionApproval),initializedWire=fixture.program.initialize.payload.historical_settlement_retention_approval;
    need(initializedWire?.sha256===retainedWire.sha256&&initializedWire.utf8===retainedWire.utf8,'SYNTHETIC_RETENTION_INITIALIZE_BINDING_REQUIRED');
    if(stage==='commit')return {state:'FIXTURE_BOUND',fixtureBindingSha256};
    // Negative SQL paths start from the same valid, pure synthetic program.
    // These changes cannot supply an alternative approval or a physical target.
    const badApproval=structuredClone(fixture.program.initialize);
    badApproval.payload.historical_settlement_retention_approval.sha256='0'.repeat(64);
    const badApprovalResult=await executeWholePackage(client,fixture.identity,badApproval,fixture.program.steps,createWholePackageSqlKernel(encodedScrypt));
    if(!(badApprovalResult.state==='ROLLED_BACK'&&badApprovalResult.code==='HISTORICAL_SETTLEMENT_APPROVAL_HASH'))throw Object.assign(Error('FRESH35_ISOLATED_SYNTHETIC_BAD_APPROVAL_ROLLBACK_REQUIRED'),{validationStage:'BAD_APPROVAL',validationCode:badApprovalResult.code});
    need((await inspectWholePackage(client,fixture.identity,fixture.program.initialize,createWholePackageSqlKernel(encodedScrypt))).state==='ABSENT','SYNTHETIC_BAD_APPROVAL_ABSENCE_REQUIRED');
    let removedSettlement=0;
    const missingSteps={async *[Symbol.asyncIterator](){for await(const step of fixture.program.steps){if(step.method==='documentChunk'&&step.request.payload.mode==='CHUNK')step.request.payload.rows=step.request.payload.rows.filter(row=>{if(removedSettlement===0&&row.entity_type==='SALES_SETTLEMENT'&&row.fields.sales_id===fixture.retainedSalesIds[0]){removedSettlement++;return false;}return true;});yield step;}}};
    const missingResult=await executeWholePackage(client,fixture.identity,fixture.program.initialize,missingSteps,createWholePackageSqlKernel(encodedScrypt));
    if(!(removedSettlement===1&&missingResult.state==='ROLLED_BACK'&&['HISTORICAL_SETTLEMENT_MIGRATION_SOURCE_DIFFERS','HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED','STANDARD_PUBLICATION_INCOMPLETE'].includes(missingResult.code)))throw Object.assign(Error('FRESH35_ISOLATED_SYNTHETIC_MISSING_SETTLEMENT_ROLLBACK_REQUIRED'),{validationStage:'MISSING_SETTLEMENT',validationCode:missingResult.code});
    need((await inspectWholePackage(client,fixture.identity,fixture.program.initialize,createWholePackageSqlKernel(encodedScrypt))).state==='ABSENT','SYNTHETIC_MISSING_SETTLEMENT_ABSENCE_REQUIRED');
    let reachedFinalPublish=false;
    const badSteps={async *[Symbol.asyncIterator](){for await(const step of fixture.program.steps){if(step.method==='publish'&&step.request.payload.phase==='DOCUMENTS'){reachedFinalPublish=true;step.request.payload.expected_sequence=Number(step.request.payload.expected_sequence)+1;}yield step;}}};
    const result=await executeWholePackage(client,fixture.identity,fixture.program.initialize,badSteps,createWholePackageSqlKernel(encodedScrypt));
    if(!(reachedFinalPublish&&result.state==='ROLLED_BACK'&&result.code==='STANDARD_BATCH_CAS_OR_SOURCE_CONFLICT'))throw Object.assign(Error('FRESH35_ISOLATED_SYNTHETIC_FINAL_FAILURE_ROLLBACK_REQUIRED'),{validationStage:'FINAL_PUBLISH',validationCode:result.code});
    need((await inspectWholePackage(client,fixture.identity,fixture.program.initialize,createWholePackageSqlKernel(encodedScrypt))).state==='ABSENT','SYNTHETIC_FINAL_FAILURE_ABSENCE_REQUIRED');
    return {state:result.state,reachedFinalPublish,finalFailureStage:'FINAL_PUBLISH',finalFailureCode:result.code,badApprovalRollback:true,badApprovalCode:badApprovalResult.code,missingSettlementRollback:true,missingSettlementCode:missingResult.code,originalBatchAbsent:true};
   },options);
   need(failed.cleanup==='CLOSED','CONTROLLER_HOST_CLEANUP_UNCONFIRMED');
   if(stage==='rollback'){
    await fixture.dispose();
    process.stdout.write(JSON.stringify({state:'FRESH35_SYNTHETIC_ROLLBACK_VERIFIED',stage,fixtureBinding,fixtureBindingSha256,rollbackVerified:true,originalBatchAbsent:true,failedAttempt:failed.result,connectionCleanup:failed.cleanup,syntheticImportVerified:false,businessVerified:false})+'\n');return;
   }
   const imported=await openReviewedFresh35Host(config,root,standardTarget,async(client,admission)=>{
    assertWholeSalesAdmissionV1(admission,standardTarget,client);
    const before=await inspectWholePackage(client,fixture.identity,fixture.program.initialize,createWholePackageSqlKernel(encodedScrypt));
    need(before.state==='ABSENT','SYNTHETIC_FAILED_BATCH_ABSENCE_REQUIRED');
    const result=await executeWholePackage(client,fixture.identity,fixture.program.initialize,fixture.program.steps,createWholePackageSqlKernel(encodedScrypt));
    need(result.state==='COMMITTED','SYNTHETIC_IMPORT_COMMIT_REQUIRED');
    return {state:result.state};
   },options);
   need(imported.cleanup==='CLOSED','CONTROLLER_HOST_CLEANUP_UNCONFIRMED');
   const verification=await openReviewedFresh35Host(config,root,standardTarget,async(client,admission)=>{
    assertWholeSalesAdmissionV1(admission,standardTarget,client);
    const replay=await executeWholePackage(client,fixture.identity,fixture.program.initialize,fixture.program.steps,createWholePackageSqlKernel(encodedScrypt));
    need(replay.state==='ALREADY_COMMITTED','SYNTHETIC_ORIGINAL_KEY_REPLAY_REQUIRED');
    const readback=await reconcileWholePackage(client,fixture.program.initialize,encodedScrypt,fixture.expectedCounts,fixture.totals);
    need(readback.state==='VERIFIED','SYNTHETIC_NEW_CONNECTION_READBACK_REQUIRED');
    return {state:'FRESH35_CONTROLLER_HOST_VERIFIED',importState:imported.result.state,replayState:replay.state,readbackState:readback.state,syntheticImportVerified:true,settlementRetentionVerified:true,retainedHeaders:25,retainedSettlements:27,businessVerified:false};
   },options);
   await fixture.dispose();
   need(verification.cleanup==='CLOSED','CONTROLLER_HOST_CLEANUP_UNCONFIRMED');
   need(verification.result.settlementRetentionVerified===true&&verification.result.retainedHeaders===25&&verification.result.retainedSettlements===27,'SYNTHETIC_RETENTION_READBACK_REQUIRED');
   process.stdout.write(JSON.stringify({state:'FRESH35_CONTROLLER_HOST_VERIFIED',hostVerification:verification.host_verification,ordinaryUid:process.getuid(),syntheticImportVerified:true,stage,fixtureBinding,fixtureBindingSha256,settlementRetentionVerified:verification.result.settlementRetentionVerified,retainedHeaders:verification.result.retainedHeaders,retainedSettlements:verification.result.retainedSettlements,failedAttempt:stage==='commit'?null:failed.result,importState:verification.result.importState,replayState:verification.result.replayState,readbackState:verification.result.readbackState,connectionCleanup:'CLOSED',businessVerified:false})+'\n');return;
  }finally{await fixture?.dispose()}
 }
 const authorization=await loadFresh35CombinedAuthorization(program);
 const raw=await privateText(join(workspace,'credentials',a.proposal.owner+'.pgpass'));
 const prefix=`127.0.0.1:${a.proposal.port}:*:${a.proposal.owner}:`;
 need(raw.startsWith(prefix)&&/^[a-f0-9]{64}\n$/.test(raw.slice(prefix.length)),'EXACT_OWNER_CREDENTIAL_REQUIRED');
 const {Client}=await import('pg');const client=new Client(isolatedClientOptions(input,raw.slice(prefix.length,-1)));
 let connected=false;
 try{
  await client.connect();connected=true;
  const completion=await runFresh35CombinedInstall({program,authorization,client,journalDirectory:join(workspace,'installation-journal')});
  const result=describeFresh35CombinedCompletion(completion);
  const publication=await publishFresh35CombinedRecord(completion);
  process.stdout.write(JSON.stringify({state:publication.state,installState:result.state,sourceSetSha256:result.program.sourceSetSha256,programSha256:result.program.programSha256,targetSha256:result.program.targetSha256,catalogSha256:result.catalogSha256,transactionReceipt:result.transactionReceipt,recordPublished:true,hostEnabled:false,businessVerified:false})+'\n');
 }finally{
  // Lifecycle closes its client on success and failure. A connect failure can
  // still leave a socket, so always close it here without issuing another SQL.
  if(!connected||!client._ended)try{await client.end()}catch{client.connection?.stream?.destroy()}
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{await main()}catch(error){process.stderr.write(JSON.stringify({state:'INSTALL_FAILED_OR_OUTCOME_UNKNOWN',installState:['NOT_STARTED','IN_TRANSACTION','ROLLED_BACK','ROLLBACK_UNCONFIRMED','COMMIT_OUTCOME_UNKNOWN','COMMITTED_UNPUBLISHED','FAILED_NO_INSTALLED_RESULT'].includes(error?.installState)?error.installState:null,code:'FRESH35_ISOLATED_ENTRY_FAILED',...describeFresh35CombinedInstallFailure(error),validationStage:['BAD_APPROVAL','MISSING_SETTLEMENT','FINAL_PUBLISH'].includes(error?.validationStage)?error.validationStage:null,validationCode:typeof error?.validationCode==='string'&&/^[A-Z][A-Z0-9_]{0,80}$/.test(error.validationCode)?error.validationCode:null,automaticRetry:false})+'\n');process.exitCode=1;}
}
