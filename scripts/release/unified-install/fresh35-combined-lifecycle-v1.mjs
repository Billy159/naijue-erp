/** Atomic application installation on an already authorized, newly provisioned
 * target. This module never creates/connects a client, starts PG,
 * removes old objects, retries a transaction, or enables an import host. */
import {readFile,open,lstat,realpath,mkdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,dirname,join,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';
import {assertTrustedRootPath,assertTrustedRootTree} from './trusted-install-path.mjs';
import {describeFresh35CombinedSource,fresh35CombinedSourceData,assertFresh35CombinedSourcesCurrent,renderFresh35CombinedSchema,combinedSha256 as hash} from './fresh35-combined-source-v1.mjs';
import {describeFresh35CombinedTarget,assertFresh35InstallationTargetCurrent,fresh35CombinedTargetGuard,FRESH35_COMBINED_TARGET_MODULE_SHA256} from './fresh35-combined-target-v1.mjs';
const programs=new WeakMap(),approvals=new WeakMap(),completions=new WeakMap(),used=new WeakSet();
const failureDiagnostics=new WeakMap(),internalFailureCodes=new WeakMap();
const need=(ok,code)=>{if(!ok){const publicCode='FRESH35_COMBINED_'+code,error=Error(publicCode);if(/^[A-Z][A-Z0-9_]{0,80}$/.test(publicCode))internalFailureCodes.set(error,publicCode);throw error}};
const failureCode=error=>{const code=error&&Object.getOwnPropertyDescriptor(error,'code')?.value;return{sqlState:typeof code==='string'&&/^[A-Z0-9]{5}$/.test(code)?code:null,internalCode:internalFailureCodes.get(error)??null}};
function installationFailure(stage,step,original,rollback){const a=failureCode(original),b=failureCode(rollback);return Object.freeze({stage,step,originalSQLSTATE:a.sqlState,originalInternalCode:a.internalCode,rollbackSQLSTATE:b.sqlState,rollbackInternalCode:b.internalCode})}
/** Closed diagnostic from this lifecycle only; never serializes an exception. */
export function describeFresh35CombinedInstallFailure(error){return failureDiagnostics.get(error)??installationFailure('UNKNOWN',null,error,null)}
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
const etc=process.platform==='darwin'?'/private/etc':'/etc';
const modulePath='scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs',loadedModuleSha256=hash(await readFile(new URL(import.meta.url)));
export const FRESH35_COMBINED_AUTHORIZATION_PATH=etc+'/naijue-erp/fresh35-combined-execution-v1.json';
function ownData(object,keys){need(object&&Object.getPrototypeOf(object)===Object.prototype,'OWN_DATA_REQUIRED');const d=Object.getOwnPropertyDescriptors(object);need(Reflect.ownKeys(d).length===keys.length&&keys.every(k=>d[k]?.enumerable&&Object.hasOwn(d[k],'value')),'OWN_DATA_REQUIRED');return Object.fromEntries(keys.map(k=>[k,d[k].value]))}
const ack=(result,command)=>need(result&&Object.getOwnPropertyDescriptor(result,'command')?.value===command,'NATIVE_'+command+'_ACK_REQUIRED');
export async function compileFresh35CombinedProgram({source,target,catalog}){
 const s=describeFresh35CombinedSource(source),t=describeFresh35CombinedTarget(target);
 for(const [path,sha] of [[modulePath,loadedModuleSha256],['scripts/release/unified-install/fresh35-combined-target-v1.mjs',FRESH35_COMBINED_TARGET_MODULE_SHA256]])need(s.currentSourcePins.some(p=>p.path===path&&p.sha256===sha),'LOADED_IMPLEMENTATION_SOURCE_DIFFERS:'+path);
 const module=await import('./fresh35-combined-catalog-v1.mjs');
 const c=module.describeFresh35CombinedCatalog(catalog),sql=module.fresh35CombinedCatalogSql(catalog,source,target);
 need(c.sourceSetSha256===s.sourceSetSha256&&c.completeMetadataGuard===true,'COMPLETE_CURRENT_CATALOG_GUARD_REQUIRED');
 need(typeof sql.guardSql==='string'&&typeof sql.observationSql==='string'&&typeof module.validateFresh35CombinedCatalogObservation==='function','CATALOG_GUARD_AND_OBSERVATION_REQUIRED');
 const schema=renderFresh35CombinedSchema(source,t.proposal,...(t.purpose==='PRODUCTION_NEW_EMPTY_EXACT35'?[{profile:t.purpose}]:[]));
 const statements=[
  {name:'physical-empty-target',sql:fresh35CombinedTargetGuard(target,{requireEmpty:true})},
  {name:'direct-35-schema',sql:schema.schemaSql},
  {name:'migration-lineage',sql:schema.lineageSql},
  {name:'controller-lineage-column-read',sql:'GRANT SELECT (version, description) ON TABLE naijue_erp.schema_migration TO '+t.proposal.controller+';'},
  ...schema.patchBodies,
  {name:'complete-successor-catalog',sql:sql.guardSql},
  {name:'same-physical-target',sql:fresh35CombinedTargetGuard(target,{requireEmpty:false})},
 ];
 const descriptor=freeze({format:'FRESH35_COMBINED_ATOMIC_PROGRAM_V1',sourceSetSha256:s.sourceSetSha256,targetSha256:hash(JSON.stringify(t)),catalogSha256:c.catalogSpecSha256,
  statements:statements.map(step=>({name:step.name,sha256:hash(step.sql)})),observationSqlSha256:hash(sql.observationSql),applicationTransactions:1,createsCluster:false,createsRoles:false,createsCredentials:false,oldTablesRemoved:false,hostEnabled:false});
 const token=Object.freeze({profile:'FRESH35_COMBINED_ATOMIC_PROGRAM_V1'});
 programs.set(token,{source,target,catalog,catalogModule:module,statements,observationSql:sql.observationSql,descriptor:freeze({...descriptor,programSha256:hash(JSON.stringify(descriptor))})});
 await assertFresh35CombinedSourcesCurrent(source);return token;
}
export function describeFresh35CombinedProgram(program){need(programs.has(program),'GENUINE_PROGRAM_REQUIRED');return programs.get(program).descriptor}
/** Parsing is only consistency checking; it does not issue an approval brand. */
export function validateFresh35CombinedAuthorization(value,program){
 const d=describeFresh35CombinedProgram(program),t=describeFresh35CombinedTarget(programs.get(program).target);
 const a=ownData(value,['format','decision','programSha256','sourceSetSha256','targetSha256','startsAt','expiresAt','independentSafetyReviewSha256','authorizationReference']);
 need(a.format==='FRESH35_COMBINED_EXECUTION_AUTHORIZATION_V1'&&a.decision===(t.purpose==='PRODUCTION_NEW_EMPTY_EXACT35'?'AUTHORIZE_EXACT_NEW35_PRODUCTION_INSTALL_ONLY':'AUTHORIZE_EXACT_NEW35_SYNTHETIC_INSTALL_ONLY'),'EXACT_INSTALL_AUTHORIZATION_REQUIRED');
 for(const k of ['programSha256','sourceSetSha256','targetSha256'])need(a[k]===d[k],'AUTHORIZATION_BINDING_DIFFERS');
 need(a.startsAt===t.startsAt&&a.expiresAt===t.expiresAt&&typeof a.independentSafetyReviewSha256==='string'&&/^[a-f0-9]{64}$/.test(a.independentSafetyReviewSha256)&&typeof a.authorizationReference==='string'&&a.authorizationReference.length>0&&a.authorizationReference.length<=512,'AUTHORIZATION_REVIEW_REFERENCE_REQUIRED');
 return freeze(a);
}
/** Only a fixed OS-protected request can create this private authorization token.
 * The user/controller must establish its authority outside this module. */
export async function loadFresh35CombinedAuthorization(program){
 const p=programs.get(program);describeFresh35CombinedProgram(program);
 need(process.getuid?.()===0&&process.geteuid?.()===0,'TRUSTED_INSTALL_CONTROLLER_REQUIRED');
 await assertTrustedRootPath(process.execPath);await assertTrustedRootTree(fresh35CombinedSourceData(p.source).root);
 await assertTrustedRootPath(FRESH35_COMBINED_AUTHORIZATION_PATH);
 const file=await open(FRESH35_COMBINED_AUTHORIZATION_PATH,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const st=await file.stat();need(st.isFile()&&st.uid===0&&st.nlink===1&&(st.mode&0o077)===0&&st.size>0&&st.size<=65536,'PRIVATE_TRUSTED_AUTHORIZATION_REQUIRED');
  const raw=await file.readFile('utf8'),value=validateFresh35CombinedAuthorization(parseStrictJson(raw),program),token=Object.freeze({profile:'FRESH35_COMBINED_TRUSTED_AUTHORIZATION_V1'});
  approvals.set(token,{program,value,sha256:hash(raw)});return token;
 }finally{await file.close()}
}
function protocol(client,idle=false){
 const value=k=>{const d=Object.getOwnPropertyDescriptor(client,k);need(d&&Object.hasOwn(d,'value'),'NATIVE_PROTOCOL_DATA_REQUIRED');return d.value};
 need(value('pipeline')===false&&value('readyForQuery')===true&&!value('_activeQuery')&&Array.isArray(value('_queryQueue'))&&value('_queryQueue').length===0&&Array.isArray(value('_sentQueryQueue'))&&value('_sentQueryQueue').length===0&&value('_queryable')===true&&value('_ending')===false&&value('_ended')===false&&(!idle||value('_txStatus')==='I'),'EXCLUSIVE_IDLE_NATIVE_CLIENT_REQUIRED');
}
export function validateFresh35CombinedJournalPath(target,directory){
 const t=describeFresh35CombinedTarget(target);need(typeof directory==='string'&&directory===join(t.proposal.workspaceDirectory,'installation-journal'),'JOURNAL_MUST_MATCH_AUTHORIZED_TARGET_WORKSPACE');return directory;
}
async function journalAt(directory,sourceRoot,target){
 validateFresh35CombinedJournalPath(target,directory);
 need(resolve(directory)===directory&&directory!==sourceRoot&&!directory.startsWith(sourceRoot+sep),'NEW_EXTERNAL_JOURNAL_REQUIRED');
 await assertTrustedRootPath(dirname(directory));
 need(await realpath(dirname(directory))===dirname(directory)&&(await lstat(dirname(directory))).isDirectory(),'CANONICAL_JOURNAL_PARENT_REQUIRED');
 await mkdir(directory,{mode:0o700});const identity=await lstat(directory);let index=0,previous=null;
 const assertCurrent=async()=>{await assertTrustedRootPath(directory);const s=await lstat(directory);need(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o777)===0o700&&s.dev===identity.dev&&s.ino===identity.ino&&await realpath(directory)===directory,'JOURNAL_DIRECTORY_IDENTITY_CHANGED')};
 const append=async event=>{await assertCurrent();const row={format:'FRESH35_COMBINED_INSTALL_EVENT_V1',index:++index,previousSha256:previous,at:new Date().toISOString(),event},bytes=JSON.stringify(row)+'\n';const f=await open(join(directory,String(index).padStart(6,'0')+'.json'),constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o400);try{await f.writeFile(bytes);await f.sync()}finally{await f.close()}previous=hash(bytes);await assertCurrent();const dir=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await dir.sync()}finally{await dir.close()}return previous};
 append.assertCurrent=assertCurrent;return append;
}
/** The common transaction state machine is separately testable. Its model export
 * can never mint an installed record, physical client or authorization. */
async function drive(steps,io){
 let state='NOT_STARTED',transaction=false,commitAttempted=false,committed=false,observation,stage='BOUND',stepName=null;
 try{
  await io.current();await io.emit({state:'INSTALL_PENDING'});
  stage='BEGIN';ack(await io.query('BEGIN ISOLATION LEVEL READ COMMITTED'),'BEGIN');transaction=true;state='IN_TRANSACTION';
  for(const step of steps){stage='STEP';stepName=typeof step.name==='string'&&/^[A-Za-z0-9_./:-]{1,160}$/.test(step.name)?step.name:null;await io.current();await io.emit({state:'STEP_PENDING',name:step.name,sqlSha256:hash(step.sql)});await io.query(step.sql);await io.emit({state:'STEP_ACKNOWLEDGED',name:step.name});}
  stage='OBSERVE';stepName=null;observation=await io.observe();stage='COMMIT';await io.current();await io.emit({state:'COMMIT_PENDING'});
  state='COMMIT_OUTCOME_UNKNOWN';commitAttempted=true;
  ack(await io.commit(),'COMMIT');committed=true;transaction=false;state='COMMITTED_UNPUBLISHED';
  await io.emit({state});return {state,observation};
 }catch(error){
  const original=error;let rollbackFailure;
  if(transaction&&!commitAttempted){
   try{ack(await io.rollback(),'ROLLBACK');state='ROLLED_BACK';transaction=false}catch(rollback){rollbackFailure=rollback;state='ROLLBACK_UNCONFIRMED';error=new AggregateError([error,rollback],'FRESH35_COMBINED_INSTALL_AND_ROLLBACK_FAILED')}
  }else if(commitAttempted&&!committed){state='COMMIT_OUTCOME_UNKNOWN';io.quarantine()}
  const diagnostic=installationFailure(stage,stepName,original,rollbackFailure);
  try{await io.emit({state,...diagnostic,errorCode:diagnostic.originalSQLSTATE??diagnostic.originalInternalCode??'INSTALL_ERROR'})}catch(journal){error=new AggregateError([error,journal],'FRESH35_COMBINED_INSTALL_AND_JOURNAL_FAILED')}
  failureDiagnostics.set(error,diagnostic);error.installState=state;throw error;
 }
}
export async function modelFresh35CombinedTransactionForTests(steps,operations){
 const result=await drive(steps,operations);return freeze({...result,state:'MODEL_ONLY_'+result.state,installed:false});
}
export async function runFresh35CombinedInstall({program,authorization,client,journalDirectory}){
 const descriptor=describeFresh35CombinedProgram(program),p=programs.get(program),authorizationState=approvals.get(authorization),t=describeFresh35CombinedTarget(p.target);
 need(authorizationState?.program===program&&!used.has(authorization),'GENUINE_UNUSED_TRUSTED_AUTHORIZATION_REQUIRED');
 assertFresh35InstallationTargetCurrent(p.target);
 need(process.version==='v24.21.0'&&!Object.keys(process.env).some(k=>k==='DATABASE_URL'||k.startsWith('PG')||k==='NODE_OPTIONS'||k==='NODE_PATH'||k.startsWith('LD_')||k.startsWith('DYLD_')),'PINNED_CLEAN_RUNTIME_REQUIRED');
 const {Client}=await import('pg'),pgPackage=await import('pg/package.json',{with:{type:'json'}});need(pgPackage.default.version==='8.23.1','PINNED_NATIVE_PG_REQUIRED');need(client instanceof Client&&Object.getPrototypeOf(client)===Client.prototype&&client.query===Client.prototype.query&&client._connected===true,'ORIGINAL_CONNECTED_NATIVE_PG_CLIENT_REQUIRED');
 protocol(client,true);const c=client.connectionParameters;
 need(c.host===t.proposal.host&&Number(c.port)===t.proposal.port&&c.database===t.proposal.database&&c.user===t.proposal.owner&&!c.ssl,'NATIVE_CONNECTION_TARGET_DIFFERS');
 used.add(authorization);let emit,quarantined=false,primary,result,closed=false,failureState,primaryDiagnostic;
 const originalQuery=Client.prototype.query,originalEnd=Client.prototype.end;
 const remaining=()=>{const now=Date.now();need(now>=t.startsAt&&now<t.expiresAt-45000,'INSTALL_WINDOW_OR_CLEANUP_RESERVE_EXPIRED');return Math.min(45000,t.expiresAt-45000-now)};
 const query=async(sql,cleanup=false)=>{need(!quarantined,'NO_SEND_AFTER_UNKNOWN_COMMIT');protocol(client);try{return await Reflect.apply(originalQuery,client,[{text:sql,query_timeout:cleanup?5000:remaining()}])}catch(e){if(e?.message==='Query read timeout')client.connection?.stream?.destroy();throw e}};
 try{
  emit=await journalAt(journalDirectory,fresh35CombinedSourceData(p.source).root,p.target);
  await emit({state:'BOUND',program:descriptor,authorizationSha256:authorizationState.sha256});
  // Durable one-use reservation also survives a process crash. Never delete it
  // automatically or restart an unknown transaction with the same authorization.
  const marker=await open(FRESH35_COMBINED_AUTHORIZATION_PATH+'.consumed',constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o400);
  try{await marker.writeFile(JSON.stringify({programSha256:descriptor.programSha256,authorizationSha256:authorizationState.sha256,at:new Date().toISOString()})+'\n');await marker.sync()}finally{await marker.close()}
  const markerDir=await open(dirname(FRESH35_COMBINED_AUTHORIZATION_PATH),constants.O_RDONLY|constants.O_DIRECTORY);try{await markerDir.sync()}finally{await markerDir.close()}
  result=await drive(p.statements,{
   query,current:async()=>{remaining();await assertFresh35CombinedSourcesCurrent(p.source);await p.catalogModule.assertFresh35CombinedCatalogCurrent(p.catalog);need(hash(await readFile(FRESH35_COMBINED_AUTHORIZATION_PATH,'utf8'))===authorizationState.sha256,'TRUSTED_AUTHORIZATION_CHANGED')},emit,
   observe:async()=>{
    const nonce=randomBytes(24).toString('hex');
    const receiptResult=await query(`SELECT pg_catalog.json_build_object('nonce','${nonce}','database',pg_catalog.current_database(),'actor',session_user,'transactionId',pg_catalog.pg_current_xact_id()::text,'backendPid',pg_catalog.pg_backend_pid())::text AS install_receipt`);ack(receiptResult,'SELECT');
    need(receiptResult.rows?.length===1&&typeof receiptResult.rows[0].install_receipt==='string','SAME_SESSION_RECEIPT_REQUIRED');const receipt=parseStrictJson(receiptResult.rows[0].install_receipt);
    need(receipt.nonce===nonce&&receipt.database===t.proposal.database&&receipt.actor===t.proposal.owner&&/^[1-9][0-9]*$/.test(receipt.transactionId)&&Number.isSafeInteger(receipt.backendPid)&&receipt.backendPid>0,'SAME_SESSION_RECEIPT_DIFFERS');
    const result=await query(p.observationSql);ack(result,'SELECT');need(result.rows?.length===1&&typeof result.rows[0].catalog_json==='string'&&Buffer.byteLength(result.rows[0].catalog_json)<=16*1024*1024,'BOUNDED_ACTUAL_CATALOG_REQUIRED');
    const raw=result.rows[0].catalog_json;p.catalogModule.validateFresh35CombinedCatalogObservation(raw,p.catalog,p.source,p.target);
    await emit.assertCurrent();const file=await open(join(journalDirectory,'catalog-canonical.json'),constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o400);try{await file.writeFile(raw);await file.sync()}finally{await file.close()}
    await emit({state:'PRECOMMIT_CATALOG_CHECKED',sha256:hash(raw),receipt});return {raw,sha256:hash(raw),receipt};
   },
   commit:async()=>{const result=await query('COMMIT');protocol(client,true);return result},rollback:async()=>{const result=await query('ROLLBACK',true);protocol(client,true);return result},quarantine:()=>{quarantined=true},
  });
 }catch(error){primary=error;failureState=error.installState;primaryDiagnostic=failureDiagnostics.get(error)??installationFailure('BOUND',null,error,null)}
 finally{
  let timer;try{await Promise.race([Reflect.apply(originalEnd,client,[]),new Promise((_,reject)=>{timer=setTimeout(()=>{try{client.connection?.stream?.destroy()}catch{}const error=Error('CLIENT_CLOSE_TIMEOUT');internalFailureCodes.set(error,'CLIENT_CLOSE_TIMEOUT');reject(error)},5000);timer.unref?.()})]);closed=true}catch(error){primaryDiagnostic??=installationFailure('CLOSE',null,error,null);primary=primary?new AggregateError([primary,error],'FRESH35_COMBINED_INSTALL_AND_CLOSE_FAILED'):error}finally{clearTimeout(timer)}
  if(emit)try{await emit({state:'CLIENT_CLOSED',confirmed:closed,credentialsRevoked:false,clusterStopped:false})}catch(error){primaryDiagnostic??=installationFailure('CLOSE',null,error,null);primary=primary?new AggregateError([primary,error],'FRESH35_COMBINED_CLOSE_JOURNAL_FAILED'):error}
 }
 if(primary){failureDiagnostics.set(primary,primaryDiagnostic??installationFailure('UNKNOWN',null,primary,null));if(!primary.installState)primary.installState=failureState??result?.state??'FAILED_NO_INSTALLED_RESULT';throw primary}
 need(closed&&result?.state==='COMMITTED_UNPUBLISHED','COMMIT_AND_CLOSE_REQUIRED');
 const completion=Object.freeze({profile:'FRESH35_COMBINED_COMMITTED_RESULT_V1'});
 completions.set(completion,freeze({format:'FRESH35_COMBINED_INSTALL_COMPLETION_V1',state:'COMMITTED_UNPUBLISHED',program:descriptor,target:t,installedAt:new Date().toISOString(),catalogSha256:result.observation.sha256,catalogJson:result.observation.raw,journalDirectory,
  transactionReceipt:result.observation.receipt,authorizationSha256:authorizationState.sha256,sourceRoot:fresh35CombinedSourceData(p.source).root,recordModuleSha256:describeFresh35CombinedSource(p.source).currentSourcePins.find(pin=>pin.path==='scripts/release/unified-install/fresh35-combined-record-v1.mjs').sha256,credentialsRevoked:false,clusterStopped:false,hostEnabled:false,businessImportVerified:false}));
 return completion;
}
export function describeFresh35CombinedCompletion(completion){need(completions.has(completion),'GENUINE_COMMITTED_COMPLETION_REQUIRED');return completions.get(completion)}
