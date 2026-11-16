import {createHash} from 'node:crypto';
import {isNodeScryptPasswordHash,NODE_SCRYPT_DUMMY_HASH} from '../../../packages/authentication/src/passwords.ts';
import {requestHash} from '../../../packages/application/src/request-hash.ts';
import {historicalSettlementRetentionWire} from '../../../packages/application/src/unified-historical-settlement-retention.ts';
import {executeWholePackage,describeWholePackageFailure} from '../../../tools/unified-import/whole-package-client.ts';
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
import {bindFresh35CombinedTarget,fresh35CombinedBootstrapObserverSql} from './fresh35-combined-target-v1.mjs';
import {buildFresh35CombinedCatalog} from './fresh35-combined-catalog-v1.mjs';
import {compileFresh35CombinedProgram,describeFresh35CombinedProgram,loadFresh35CombinedAuthorization,runFresh35CombinedInstall,describeFresh35CombinedCompletion,describeFresh35CombinedInstallFailure} from './fresh35-combined-lifecycle-v1.mjs';
import {publishFresh35CombinedRecord} from './fresh35-combined-record-v1.mjs';
const root='/opt/naijue-erp/fresh35-combined-v1';
const authority='/etc/naijue-erp/fresh35-isolated-provision-v1.json';
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_ISOLATED_'+code)};
const entryFailureCodes=new Set([
 'PRIVATE_OWNER_CONNECTION_INPUT','PRIVATE_INPUT_REQUIRED','TRUSTED_ROOT_RUNTIME_REQUIRED','FIXED_ENTRY_REQUIRED','CLEAN_ENV_REQUIRED','EXTERNAL_PROVISION_AUTHORITY_REQUIRED','FIXED_WORKSPACE_REQUIRED','SYNTHETIC_V1_TARGET_REQUIRED','TARGET_PROVISION_BINDING_DIFFERS','SOURCE_SET_DIFFERS','EXACT_CONTROLLER_CREDENTIAL_REQUIRED','EXACT_OWNER_CREDENTIAL_REQUIRED','EXACT_SYNTHETIC_CREDENTIAL_REQUIRED','ORDINARY_HOST_UID_REQUIRED','SYNTHETIC_APPLICATION_CREDENTIAL_REQUIRED',
 'SYNTHETIC_RETENTION_FIXTURE_BINDING_REQUIRED','SYNTHETIC_RETENTION_STAGE_BINDING_CHANGED','SYNTHETIC_RETENTION_FIXTURE_REQUIRED','SYNTHETIC_RETENTION_INITIALIZE_BINDING_REQUIRED','SYNTHETIC_BAD_APPROVAL_ROLLBACK_REQUIRED','SYNTHETIC_BAD_APPROVAL_ABSENCE_REQUIRED','SYNTHETIC_MISSING_SETTLEMENT_ROLLBACK_REQUIRED','SYNTHETIC_MISSING_SETTLEMENT_ABSENCE_REQUIRED','SYNTHETIC_FINAL_FAILURE_ROLLBACK_REQUIRED','SYNTHETIC_FINAL_FAILURE_ABSENCE_REQUIRED','CONTROLLER_HOST_CLEANUP_UNCONFIRMED','SYNTHETIC_FAILED_BATCH_ABSENCE_REQUIRED','SYNTHETIC_IMPORT_COMMIT_REQUIRED','SYNTHETIC_ORIGINAL_KEY_REPLAY_REQUIRED','SYNTHETIC_NEW_CONNECTION_READBACK_REQUIRED','SYNTHETIC_RETENTION_READBACK_REQUIRED','SYNTHETIC_FIXTURE_CLEANUP_FAILED',
].map(code=>'FRESH35_ISOLATED_'+code));
/** Existing private failure receipt only; native text is never serialized. */
export function isolatedEntryFailure(error){
 const failure=describeWholePackageFailure(error?.validationResult),message=error!==null&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'message')?.value:undefined;
 const entryCode=entryFailureCodes.has(message)?message:null;
 const entryStage=entryCode==='FRESH35_ISOLATED_SYNTHETIC_BAD_APPROVAL_ABSENCE_REQUIRED'?'BAD_APPROVAL':entryCode==='FRESH35_ISOLATED_SYNTHETIC_MISSING_SETTLEMENT_ABSENCE_REQUIRED'?'MISSING_SETTLEMENT':entryCode==='FRESH35_ISOLATED_SYNTHETIC_FINAL_FAILURE_ABSENCE_REQUIRED'?'FINAL_PUBLISH':null;
 return {state:'INSTALL_FAILED_OR_OUTCOME_UNKNOWN',installState:['NOT_STARTED','IN_TRANSACTION','ROLLED_BACK','ROLLBACK_UNCONFIRMED','COMMIT_OUTCOME_UNKNOWN','COMMITTED_UNPUBLISHED','FAILED_NO_INSTALLED_RESULT'].includes(error?.installState)?error.installState:null,code:'FRESH35_ISOLATED_ENTRY_FAILED',...describeFresh35CombinedInstallFailure(error),validationStage:['BAD_APPROVAL','MISSING_SETTLEMENT','FINAL_PUBLISH'].includes(error?.validationStage)?error.validationStage:entryStage,validationCode:typeof error?.validationCode==='string'&&/^[A-Z][A-Z0-9_]{0,80}$/.test(error.validationCode)?error.validationCode:entryCode,validationSQLSTATE:failure?.sqlState??null,validationStep:failure?.stage??null,validationInternalCode:failure?.staticCode??null,automaticRetry:false};
}
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
 need(['--bootstrap-observer','--describe','--execute','--install-synthetic-sql39','--compile-synthetic-sql39-v2','--install-prefix155','--measure-prefix155'].includes(process.argv[2])&&process.argv.length===3&&process.argv[1]===root+'/scripts/release/unified-install/fresh35-isolated-entry-v1.mjs','FIXED_ENTRY_REQUIRED');
 need(!Object.keys(process.env).some(k=>k==='NODE_OPTIONS'||k==='NODE_PATH'||k==='DATABASE_URL'||k.startsWith('PG')||k.startsWith('LD_')||k.startsWith('DYLD_')),'CLEAN_ENV_REQUIRED');
 await assertTrustedRootTree(root);await assertTrustedRootPath(process.execPath);
 const provision=await privateText(authority),requestProvisionSha256=createHash('sha256').update(provision).digest('hex');
 const a=parseStrictJson(provision);
 need(a.format==='FRESH35_ISOLATED_PROVISION_AUTHORIZATION_V1'&&a.decision==='AUTHORIZE_EXACT_NEW35_INSTALL_RECORD_AND_SYNTHETIC_IMPORT','EXTERNAL_PROVISION_AUTHORITY_REQUIRED');
 const workspace=a.proposal.workspaceDirectory;
 need(/^\/var\/lib\/naijue-erp\/fresh35-isolated\/cloud-pg-fresh35-[0-9]{8}-r[1-9][0-9]{0,3}$/.test(workspace),'FIXED_WORKSPACE_REQUIRED');
 const input=parseStrictJson(await privateText(join(workspace,'target-binding.json')));
 need(Object.keys(input).sort().join(',')==='expiresAt,physical,proposal,startsAt','SYNTHETIC_V1_TARGET_REQUIRED');
 need(Object.keys(input.proposal).length===Object.keys(a.proposal).length&&Object.keys(a.proposal).every(k=>Object.hasOwn(input.proposal,k)&&input.proposal[k]===a.proposal[k])&&input.startsAt===a.startsAt&&input.expiresAt===a.expiresAt,'TARGET_PROVISION_BINDING_DIFFERS');
 const paths=await resolveFresh35ReferenceInputPaths(root+'/reference-inputs');
 const source=await loadFresh35CombinedSource(root,{baselineDirectory:paths.baselineDirectory});
 need(describeFresh35CombinedSource(source).sourceSetSha256===a.sourceSetSha256,'SOURCE_SET_DIFFERS');
 const target=bindFresh35CombinedTarget(input);
 if(process.argv[2]==='--bootstrap-observer'){process.stdout.write(fresh35CombinedBootstrapObserverSql(target));return;}
 const catalog=await buildFresh35CombinedCatalog(source,target,paths);
 const program=await compileFresh35CombinedProgram({source,target,catalog});
 if(process.argv[2]==='--describe'){process.stdout.write(JSON.stringify(describeFresh35CombinedProgram(program))+'\n');return;}
 if(['--install-synthetic-sql39','--compile-synthetic-sql39-v2','--install-prefix155','--measure-prefix155'].includes(process.argv[2])){
  const parent=await readFile('/proc/'+process.ppid+'/cmdline','utf8');
  need(parent.split('\0').filter(Boolean).slice(-2).join(' ')===root+'/scripts/release/unified-install/launch-fresh35-isolated-v1.py --supervise-owned-child','EXACT_SYNTHETIC_NATIVE_PARENT_REQUIRED');
  const assertProvisionCurrent=async()=>{
   need(createHash('sha256').update(await privateText(authority)).digest('hex')===requestProvisionSha256&&
    await privateText(authority+'.consumed')===requestProvisionSha256+'\n','EXACT_SYNTHETIC_PROVISION_CONSUMPTION_REQUIRED');
  };
  await assertProvisionCurrent();
  need(a.postgresUid===61035&&a.postgresGid===61035,'ORDINARY_HOST_UID_REQUIRED');
  const credential=async actor=>{
   const raw=await privateText(join(workspace,'credentials',actor+'.pgpass'));
   const prefix=`127.0.0.1:${a.proposal.port}:*:${actor}:`;
   need(raw.startsWith(prefix)&&/^[a-f0-9]{64}\n$/.test(raw.slice(prefix.length)),'EXACT_SYNTHETIC_CREDENTIAL_REQUIRED');
   return raw.slice(prefix.length,-1);
  };
  if(process.argv[2]==='--install-synthetic-sql39'||process.argv[2]==='--install-prefix155'){
   const installSyntheticSql39=process.argv[2]==='--install-prefix155'
    ?(await import('./synthetic-prefix155-install.mjs')).installSyntheticPrefix155
    :(await import('./synthetic-sql39-install.mjs')).installSyntheticSql39;
   const result=await installSyntheticSql39({root,target,paths,baseProgram:program,readPrivate:privateText,assertProvisionCurrent,
    provisionSha256:requestProvisionSha256,deploymentManifestSha256:a.deploymentManifestSha256,async openOwner(){
     const {Client}=await import('pg');const client=new Client(isolatedClientOptions(input,await credential(a.proposal.owner)));
     client.on('error',()=>{});try{await client.connect();return client}catch(error){try{await client.end()}catch{client.connection?.stream?.destroy()}throw error}
    }});
   process.stdout.write(JSON.stringify(result)+'\n');return;
  }
  let encodedScrypt;
  if(process.argv[2]==='--measure-prefix155'){
   const raw=await privateText(join(workspace,'credentials','synthetic-application-scrypt.txt'));
   encodedScrypt=raw.slice(0,-1);
   need(raw.endsWith('\n')&&isNodeScryptPasswordHash(encodedScrypt)&&encodedScrypt!==NODE_SCRYPT_DUMMY_HASH,
    'PREFIX155_APPLICATION_CREDENTIAL_REQUIRED');
  }
  const config={host:a.proposal.host,port:a.proposal.port,database:a.proposal.database,user:a.proposal.controller,
   password:await credential(a.proposal.controller),statement_timeout_ms:40000};
  process.setgroups([]);process.setgid(a.postgresGid);process.setuid(a.postgresUid);
  need(process.getuid()===61035&&process.geteuid()===61035&&process.getgid()===61035&&process.getegid()===61035&&process.getgroups().every(id=>id===61035),'ORDINARY_HOST_UID_REQUIRED');
  const result=process.argv[2]==='--measure-prefix155'
   ?await (await import('./synthetic-prefix155.mjs')).runPrefix155(root,workspace,config,encodedScrypt)
   :await (await import('./synthetic-sql39-compile-only.mjs')).runCompileOnly(root,workspace,config);
  process.stdout.write(JSON.stringify(result)+'\n');return;
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
  process.stdout.write(JSON.stringify({state:publication.state,recordSha256:publication.recordSha256,installState:result.state,sourceSetSha256:result.program.sourceSetSha256,programSha256:result.program.programSha256,targetSha256:result.program.targetSha256,catalogSha256:result.catalogSha256,transactionReceipt:result.transactionReceipt,recordPublished:true,hostEnabled:false,businessVerified:false})+'\n');
 }finally{
  // Lifecycle closes its client on success and failure. A connect failure can
  // still leave a socket, so always close it here without issuing another SQL.
  if(!connected||!client._ended)try{await client.end()}catch{client.connection?.stream?.destroy()}
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{await main()}catch(error){process.stderr.write(JSON.stringify(isolatedEntryFailure(error))+'\n');process.exitCode=1;}
}
