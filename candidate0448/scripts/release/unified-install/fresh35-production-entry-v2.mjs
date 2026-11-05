/** Fixed root entry for the existing NEW_EMPTY production V2 installer.
 * This glue never provisions PG, issues authority, manufactures an installation
 * record, imports REAL data or enables an application. Those owners stay separate. */
import {open,lstat,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseStrictJson,decodeUtf8} from '../../../packages/application/src/unified-import-contract.ts';
import {assertTrustedRootPath,assertTrustedRootTree} from './trusted-install-path.mjs';
import {resolveFresh35ReferenceInputPaths,loadFresh35CombinedSource,describeFresh35CombinedSource,assertFresh35CombinedSourcesCurrent,combinedSha256} from './fresh35-combined-source-v1.mjs';
import {bindFresh35CombinedProductionTargetV2,describeFresh35CombinedTarget,fresh35CombinedBootstrapObserverSql} from './fresh35-combined-target-v1.mjs';
import {buildFresh35CombinedCatalog} from './fresh35-combined-catalog-v1.mjs';
import {compileFresh35CombinedProgram,describeFresh35CombinedProgram,loadFresh35CombinedAuthorization,runFresh35CombinedInstall,describeFresh35CombinedCompletion,describeFresh35CombinedInstallFailure} from './fresh35-combined-lifecycle-v1.mjs';
import {publishFresh35CombinedRecord} from './fresh35-combined-record-v1.mjs';
import {closePhysical} from '../../../tools/unified-import/whole-host-session.mjs';

const root='/opt/naijue-erp/fresh35-combined-v1';
const modulePath='scripts/release/unified-install/fresh35-production-entry-v2.mjs',loadedModuleURL=import.meta.url;
const loadedEntrySha256=combinedSha256(await readFile(new URL(import.meta.url)));
export const FRESH35_PRODUCTION_ENTRY_AUTHORIZATION_PATH='/etc/naijue-erp/fresh35-production-entry-v2.json';
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_PRODUCTION_ENTRY_'+code)};
const keys=(v,expected)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===expected.length&&expected.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value')});
const identity=s=>[s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
async function privateText(path){
 await assertTrustedRootPath(path);const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=await file.stat({bigint:true});
  need(before.isFile()&&before.uid===0n&&before.nlink===1n&&(before.mode&0o7777n)===0o600n&&before.size>0n&&before.size<=65536n,'PROTECTED_INPUT_REQUIRED');
  const bytes=Buffer.alloc(Number(before.size)+1);let used=0;
  while(used<bytes.length){const {bytesRead}=await file.read(bytes,used,bytes.length-used,null);if(!bytesRead)break;used+=bytesRead;}
  const after=await file.stat({bigint:true}),current=await lstat(path,{bigint:true});
  need(BigInt(used)===before.size&&identity(before)===identity(after)&&identity(before)===identity(current),'PROTECTED_INPUT_CHANGED');
  return decodeUtf8(bytes.subarray(0,used));
 }finally{await file.close()}
}

/** Connection settings come only from the fixed private owner file and the
 * genuine V2 target. Runtime service lifetime never changes this operation window. */
export function productionClientOptions(target,connection,now=Date.now()){
 const t=describeFresh35CombinedTarget(target),p=t.proposal;
 need(t.format==='FRESH35_COMBINED_TARGET_BINDING_V2'&&t.purpose==='PRODUCTION_NEW_EMPTY_EXACT35','PRODUCTION_TARGET_REQUIRED');
 need(keys(connection,['host','port','database','user','password'])&&connection.host===p.host&&connection.port===p.port&&connection.database===p.database&&connection.user===p.owner&&typeof connection.password==='string'&&connection.password.length>0,'EXACT_PRIVATE_OWNER_CONNECTION_REQUIRED');
 need(Number.isSafeInteger(now)&&now>=t.startsAt&&now<t.expiresAt-45000,'INSTALL_WINDOW_OR_CLEANUP_RESERVE_EXPIRED');
 return {host:p.host,port:p.port,database:p.database,user:p.owner,password:connection.password,ssl:false,application_name:'fresh35-production-v2',connectionTimeoutMillis:Math.min(5000,t.expiresAt-45000-now),query_timeout:45000,options:'-c search_path=pg_catalog -c TimeZone=UTC -c lock_timeout=5000 -c statement_timeout=40000'};
}

export async function main(){
 need(process.platform==='linux'&&process.getuid?.()===0&&process.geteuid?.()===0&&process.version==='v24.21.0','TRUSTED_ROOT_RUNTIME_REQUIRED');
 need(process.argv.length===3&&['--bootstrap-observer','--describe','--execute'].includes(process.argv[2])&&process.argv[1]===join(root,modulePath)&&loadedModuleURL===pathToFileURL(join(root,modulePath)).href,'FIXED_ENTRY_REQUIRED');
 need(!Object.keys(process.env).some(k=>k==='NODE_OPTIONS'||k==='NODE_PATH'||k==='DATABASE_URL'||k.startsWith('PG')||k.startsWith('LD_')||k.startsWith('DYLD_')),'CLEAN_ENV_REQUIRED');
 await assertTrustedRootTree(root);await assertTrustedRootPath(process.execPath);
 const raw=await privateText(FRESH35_PRODUCTION_ENTRY_AUTHORIZATION_PATH),a=parseStrictJson(raw);
 need(keys(a,['format','decision','sourceSetSha256','target','independentSafetyReviewSha256','authorizationReference'])&&a.format==='FRESH35_PRODUCTION_ENTRY_AUTHORIZATION_V2'&&a.decision==='AUTHORIZE_EXACT_NEW35_PRODUCTION_INSTALL_AND_RECORD'&&typeof a.sourceSetSha256==='string'&&/^[a-f0-9]{64}$/.test(a.sourceSetSha256)&&typeof a.independentSafetyReviewSha256==='string'&&/^[a-f0-9]{64}$/.test(a.independentSafetyReviewSha256)&&typeof a.authorizationReference==='string'&&a.authorizationReference.trim().length>0&&a.authorizationReference.length<=512,'EXTERNAL_ENTRY_AUTHORIZATION_REQUIRED');
 const target=bindFresh35CombinedProductionTargetV2(a.target),t=describeFresh35CombinedTarget(target);
 need(t.ordinary.referenceDirectory===join(root,'reference-inputs'),'FIXED_REFERENCE_DIRECTORY_REQUIRED');
 await assertTrustedRootPath(t.proposal.workspaceDirectory);
 const paths=await resolveFresh35ReferenceInputPaths(t.ordinary.referenceDirectory),source=await loadFresh35CombinedSource(root,{baselineDirectory:paths.baselineDirectory});
 need(describeFresh35CombinedSource(source).sourceSetSha256===a.sourceSetSha256,'SOURCE_SET_DIFFERS');
 need(describeFresh35CombinedSource(source).currentSourcePins.some(p=>p.path===modulePath&&p.sha256===loadedEntrySha256),'LOADED_IMPLEMENTATION_SOURCE_DIFFERS');
 if(process.argv[2]==='--bootstrap-observer'){
  need(await privateText(FRESH35_PRODUCTION_ENTRY_AUTHORIZATION_PATH)===raw,'EXTERNAL_ENTRY_AUTHORIZATION_CHANGED');
  process.stdout.write(fresh35CombinedBootstrapObserverSql(target));return;
 }
 const catalog=await buildFresh35CombinedCatalog(source,target,paths),program=await compileFresh35CombinedProgram({source,target,catalog});
 if(process.argv[2]==='--describe'){
  need(await privateText(FRESH35_PRODUCTION_ENTRY_AUTHORIZATION_PATH)===raw,'EXTERNAL_ENTRY_AUTHORIZATION_CHANGED');
  process.stdout.write(JSON.stringify(describeFresh35CombinedProgram(program))+'\n');return;
 }
 // Parsing the entry description never issues the separately protected,
 // one-use execution authorization consumed by the original native installer.
 const authorization=await loadFresh35CombinedAuthorization(program);
 const connection=parseStrictJson(await privateText(join(t.proposal.workspaceDirectory,'credentials','owner-connection.json')));
 const options=productionClientOptions(target,connection);
 need(await privateText(FRESH35_PRODUCTION_ENTRY_AUTHORIZATION_PATH)===raw,'EXTERNAL_ENTRY_AUTHORIZATION_CHANGED');
 await assertFresh35CombinedSourcesCurrent(source);
 const {Client}=await import('pg'),client=new Client(options);
 try{
  await client.connect();
  const completion=await runFresh35CombinedInstall({program,authorization,client,journalDirectory:join(t.proposal.workspaceDirectory,'installation-journal')});
  const result=describeFresh35CombinedCompletion(completion),publication=await publishFresh35CombinedRecord(completion);
  if(publication.state!=='RECORD_DURABLY_PUBLISHED'){
   const error=Error('FRESH35_PRODUCTION_ENTRY_DURABLE_V2_PUBLICATION_REQUIRED');
   error.installState=publication.state==='PUBLISHED_DURABILITY_UNKNOWN'?'PUBLISHED_DURABILITY_UNKNOWN':'COMMITTED_UNPUBLISHED';throw error;
  }
  process.stdout.write(JSON.stringify({state:publication.state,installState:result.state,sourceSetSha256:result.program.sourceSetSha256,programSha256:result.program.programSha256,targetSha256:result.program.targetSha256,catalogSha256:result.catalogSha256,recordSha256:publication.recordSha256,recordPublished:true,hostEnabled:false,businessVerified:false})+'\n');
 }finally{
  // The lifecycle owns close once it starts closing. Only a connect failure or
  // an early native-precondition refusal leaves an unowned socket to close here.
  if(!client._ending&&!client._ended)await closePhysical(client);
 }
}

export function productionEntryFailure(error){
 const installState=['NOT_STARTED','IN_TRANSACTION','ROLLED_BACK','ROLLBACK_UNCONFIRMED','COMMIT_OUTCOME_UNKNOWN','COMMITTED_UNPUBLISHED','PUBLISHED_DURABILITY_UNKNOWN','FAILED_NO_INSTALLED_RESULT'].includes(error?.installState)?error.installState:null;
 const unknown=['ROLLBACK_UNCONFIRMED','COMMIT_OUTCOME_UNKNOWN','COMMITTED_UNPUBLISHED','PUBLISHED_DURABILITY_UNKNOWN'].includes(installState);
 return {exitCode:unknown?2:1,receipt:{state:'INSTALL_FAILED_OR_OUTCOME_UNKNOWN',installState,code:'FRESH35_PRODUCTION_ENTRY_FAILED',...describeFresh35CombinedInstallFailure(error),validationStage:null,validationCode:null,automaticRetry:false}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{await main()}catch(error){const failed=productionEntryFailure(error);process.stderr.write(JSON.stringify(failed.receipt)+'\n');process.exitCode=failed.exitCode;}
}
