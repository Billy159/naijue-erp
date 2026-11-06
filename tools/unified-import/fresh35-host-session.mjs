/** Fixed Fresh35 host. A record, a parsed catalog, or a supplied client alone
 * cannot mint execution authority. Only the owned physical session can do so. */
import {readFile,open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {canonicalRequestValue} from '../../packages/application/src/canonical-request-value.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {validateStandardImportRequest} from '../../packages/application/src/unified-import-execution.ts';
import {isNodeScryptPasswordHash} from '../../packages/authentication/src/passwords.ts';
import {streamTypedHash,typedHashArray} from './stream-typed-hash.mjs';
import {watch} from 'node:fs';
import {assertTrustedRootPath,assertTrustedRootTree} from '../../scripts/release/unified-install/trusted-install-path.mjs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describeFresh35CatalogSpec} from '../../scripts/release/unified-install/fresh35-catalog-contract.mjs';
import {loadFresh35CombinedRecordEnvelope,validateFresh35CombinedRecord,describeFresh35ProtectedRecordSnapshot,assertFresh35ProtectedRecordSnapshotCurrent,FRESH35_COMBINED_RECORD_PATH,FRESH35_COMBINED_RECORD_MODULE_SHA256} from '../../scripts/release/unified-install/fresh35-combined-record-v1.mjs';
import {resolveFresh35ReferenceInputPaths,loadFresh35CombinedSource,describeFresh35CombinedSource,assertFresh35CombinedSourcesCurrent,combinedSha256 as hash} from '../../scripts/release/unified-install/fresh35-combined-source-v1.mjs';
import {bindFresh35CombinedTarget,describeFresh35CombinedTarget,reconstructFresh35InstalledProductionTargetV2,reconstructFresh35RestoredTarget} from '../../scripts/release/unified-install/fresh35-combined-target-v1.mjs';
import {buildFresh35CombinedCatalog,assertFresh35CombinedCatalogCurrent} from '../../scripts/release/unified-install/fresh35-combined-catalog-v1.mjs';
import {compileFresh35RestorationProgram,fresh35RestorationOrdinaryProofSql,validateFresh35RestorationOrdinaryProof} from '../../scripts/release/unified-install/fresh35-restoration-v1.mjs';
import {compileFresh35CombinedProgram} from '../../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs';
import {parseStrictJson,HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256,isHistoricalSalesHallSourceProfile} from '../../packages/application/src/unified-import-contract.ts';
import {sameActiveWholeHostSession} from './whole-host-session.mjs';
const loadedHostSha256=hash(await readFile(new URL(import.meta.url)));
const moduleRoot=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const contexts=new WeakMap(),verifications=new WeakMap();
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_HOST_'+code)};
const ack=(r,tag)=>need(Object.getOwnPropertyDescriptor(r??{},'command')?.value===tag,'CATALOG_ACK_INVALID');
export function describeFresh35HostReadiness(spec){
 const source=describeFresh35CatalogSpec(spec);
 return Object.freeze({profile:source.profile,sourceSpecSha256:source.sourceSpecSha256,hostWired:true,fixedInstallationRecordImplemented:true,installationReady:false,targetAdmitted:false,blockers:Object.freeze(['EXACT_PROTECTED_COMBINED_RECORD','CURRENT_SOURCE_AND_RUNTIME_CATALOG','ISOLATED_POSTGRESQL_ACCEPTANCE_NOT_RUN'])});
}
/** No caller-provided record or target descriptor enters this constructor. */
export async function loadFresh35HostContext(sourceRoot,referenceDirectory){
 need(typeof sourceRoot==='string'&&resolve(sourceRoot)===moduleRoot,'RUNNING_SOURCE_ROOT_REQUIRED');
 const envelope=await loadFresh35CombinedRecordEnvelope();
 const paths=await resolveFresh35ReferenceInputPaths(referenceDirectory);
 // A production installation record is not a real-import authorization.
 need(envelope.format==='FRESH35_COMBINED_INSTALLATION_RECORD_V1','PRODUCTION_OR_RESTORED_IMPORT_SEPARATE_AUTHORIZATION_REQUIRED');
 const {proposal,physical,startsAt,expiresAt}=envelope.target??{};
 const target=bindFresh35CombinedTarget({proposal,physical,startsAt,expiresAt});
 const source=await loadFresh35CombinedSource(sourceRoot,{baselineDirectory:paths.baselineDirectory});
 const pins=describeFresh35CombinedSource(source).currentSourcePins;
 for(const [path,sha256] of [['tools/unified-import/fresh35-host-session.mjs',loadedHostSha256],['scripts/release/unified-install/fresh35-combined-record-v1.mjs',FRESH35_COMBINED_RECORD_MODULE_SHA256]])need(pins.some(p=>p.path===path&&p.sha256===sha256),'LOADED_IMPLEMENTATION_SOURCE_DIFFERS');
 const catalog=await buildFresh35CombinedCatalog(source,target,paths);
 const program=await compileFresh35CombinedProgram({source,target,catalog});
 const record=validateFresh35CombinedRecord(envelope,program);
 const token=Object.freeze({profile:'FRESH35_FIXED_HOST_CONTEXT_V1'});
 contexts.set(token,Object.freeze({source,target,catalog,program,record,recordSha256:hash(JSON.stringify(record))}));
 await assertFresh35HostCurrent(token);return token;
}
export function fresh35HostContext(token){need(contexts.has(token),'GENUINE_FIXED_CONTEXT_REQUIRED');return contexts.get(token)}
export async function assertFresh35HostCurrent(token){
 const c=fresh35HostContext(token),t=describeFresh35CombinedTarget(c.target);
 if(c.productionImport)await assertFresh35ProtectedRecordSnapshotCurrent(c.envelope);
 need(Date.now()>=t.startsAt&&Date.now()<t.expiresAt,'WINDOW_EXPIRED');
 await assertFresh35CombinedSourcesCurrent(c.source);await assertFresh35CombinedCatalogCurrent(c.catalog);
 const current=validateFresh35CombinedRecord(await loadFresh35CombinedRecordEnvelope(),c.program);
 need(hash(JSON.stringify(current))===c.recordSha256,'FIXED_RECORD_CHANGED');
 return c;
}
/** The generic/model wire helper never registers a trusted gate, even if given
 * a real-looking catalog and a callback. It therefore cannot reach this issuer. */
export async function verifyFresh35InstalledV1(client,context,sourceProfile=HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256){
 need(sameActiveWholeHostSession(client,client),'PHYSICAL_SESSION_REQUIRED');
 need(isHistoricalSalesHallSourceProfile(sourceProfile),'SOURCE_PROFILE_REQUIRED');
 const c=await assertFresh35HostCurrent(context);
 const module=await import('../../scripts/release/unified-install/fresh35-combined-catalog-v1.mjs');
 need(typeof module.fresh35CombinedRuntimeCatalogSql==='function'&&typeof module.validateFresh35CombinedRuntimeCatalogObservation==='function','RUNTIME_CATALOG_NOT_WIRED');
 const sql=module.fresh35CombinedRuntimeCatalogSql(c.catalog,c.source,c.target);
 const guards=await client.query(sql.guardSql);
 need(Array.isArray(guards)&&guards.length===2,'CATALOG_GUARD_ACK_INVALID');
 for(const result of guards)ack(result,'DO');
 const result=await client.query(sql.observationSql);ack(result,'SELECT');
 need(result.rows?.length===1&&typeof result.rows[0].catalog_json==='string','CATALOG_PACKET_INVALID');
 const actual=module.validateFresh35CombinedRuntimeCatalogObservation(result.rows[0].catalog_json,c.catalog,c.source,c.target);
 await assertFresh35HostCurrent(context);
 const t=describeFresh35CombinedTarget(c.target);
 const verified=Object.freeze({profile:'FRESH35_COMBINED_INSTALLED_INSTANCE_MATCH',system_identifier:t.physical.systemIdentifier,database_oid:t.physical.databaseOid,database_name:t.proposal.database,catalog_sha256:c.record.catalogSha256,source_profile_sha256:sourceProfile,live_catalog_sha256:actual.catalogSha256,expires_at:t.expiresAt,starts_at:t.startsAt});
 verifications.set(verified,client);return verified;
}
export function consumeFresh35VerificationV1(verified,client){
 need(verified&&verifications.get(verified)===client&&sameActiveWholeHostSession(client,client),'VERIFIED_INSTANCE_REQUIRED');
 verifications.delete(verified);
 need(Date.now()>=verified.starts_at&&Date.now()<verified.expires_at,'WINDOW_EXPIRED');
 return verified;
}
export async function openReviewedFresh35Host(config,sourceRoot,target,work,options={}){
 const {openReviewedFresh35PhysicalHost}=await import('./whole-host-session.mjs');
 return openReviewedFresh35PhysicalHost(config,sourceRoot,target,work,options);
}


// Independent REAL-batch authority. Installation, source registration and an
// ordinary-runtime capability never authorize this fixed production entry.
export const FRESH35_PRODUCTION_IMPORT_AUTHORIZATION_PATH=(process.platform==='darwin'?'/private/etc':'/etc')+'/naijue-erp/fresh35-production-import-v1.json';
const productionImportAuthorities=new WeakMap(),productionImportBindings=new WeakMap();
const importFileIdentity=s=>[s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
const exactImportKeys=(x,keys)=>x&&Object.getPrototypeOf(x)===Object.prototype&&Reflect.ownKeys(x).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(x,k);return d?.enumerable&&Object.hasOwn(d,'value')});
export async function loadFresh35ProductionImportContext(sourceRoot,referenceDirectory){
 need(typeof sourceRoot==='string'&&resolve(sourceRoot)===moduleRoot,'RUNNING_SOURCE_ROOT_REQUIRED');
 const envelope=await loadFresh35CombinedRecordEnvelope();
 need(envelope.format==='FRESH35_COMBINED_INSTALLATION_RECORD_V2','PRODUCTION_V2_RECORD_REQUIRED');
 const target=await reconstructFresh35InstalledProductionTargetV2(envelope),t=describeFresh35CombinedTarget(target);
 need(referenceDirectory===t.ordinary.referenceDirectory,'PRODUCTION_REFERENCE_DIRECTORY_DIFFERS');
 // The first REAL import retains the original installation birth and window.
 // Historical production reconstruction alone cannot open a new write window.
 need(Date.now()>=t.startsAt&&Date.now()<t.expiresAt,'WINDOW_EXPIRED');
 await assertTrustedRootPath(process.execPath);await assertTrustedRootPath(moduleRoot);await assertTrustedRootTree(referenceDirectory);
 const paths=await resolveFresh35ReferenceInputPaths(referenceDirectory),source=await loadFresh35CombinedSource(sourceRoot,{baselineDirectory:paths.baselineDirectory});
 const pins=describeFresh35CombinedSource(source).currentSourcePins;
 for(const pin of pins)await assertTrustedRootPath(resolve(sourceRoot,pin.path));
 for(const [path,digest]of [['tools/unified-import/fresh35-host-session.mjs',loadedHostSha256],['scripts/release/unified-install/fresh35-combined-record-v1.mjs',FRESH35_COMBINED_RECORD_MODULE_SHA256]])need(pins.some(p=>p.path===path&&p.sha256===digest),'LOADED_IMPLEMENTATION_SOURCE_DIFFERS');
 const catalog=await buildFresh35CombinedCatalog(source,target,paths),program=await compileFresh35CombinedProgram({source,target,catalog});
 const record=validateFresh35CombinedRecord(envelope,program),snapshot=describeFresh35ProtectedRecordSnapshot(envelope);
 await assertFresh35ProtectedRecordSnapshotCurrent(envelope,true);
 const token=Object.freeze({profile:'FRESH35_PRODUCTION_IMPORT_CONTEXT_V1'});
 contexts.set(token,Object.freeze({productionImport:true,envelope,source,target,catalog,program,record,recordSha256:hash(JSON.stringify(record)),recordFileSha256:snapshot.sha256}));
 await assertFresh35HostCurrent(token);return token;
}
export async function describeFresh35ProductionImportBinding(context,prepared){
 const c=fresh35HostContext(context);need(c.productionImport===true,'PRODUCTION_IMPORT_CONTEXT_REQUIRED');
 need(prepared?.packageKind==='REAL'&&isNodeScryptPasswordHash(prepared.encodedScrypt)&&prepared.steps&&typeof prepared.steps[Symbol.asyncIterator]==='function','REAL_PREPARED_PROGRAM_REQUIRED');
 const init=prepared.initialize,id=prepared.identity;validateStandardImportRequest(init);
 need(init.payload.document_batch_id===id?.documentBatchId&&init.batch_id===id?.batchId&&init.package_manifest_sha256===id?.packageSha256&&init.plan_sha256===id?.planSha256&&init.namespace===id?.namespace&&init.cutoff_at===id?.cutoffAt,'REAL_PROGRAM_IDENTITY_DIFFERS');
 let count=0;
 const checked={async *[Symbol.asyncIterator](){for await(const incoming of prepared.steps){const step=structuredClone(incoming);validateStandardImportRequest(step?.request);const r=step.request;need(exactImportKeys(step,['method','request'])&&['masterChunk','baselineKeys','documentChunk','publish'].includes(step.method)&&r.package_manifest_sha256===id.packageSha256&&r.plan_sha256===id.planSha256&&r.namespace===id.namespace&&r.cutoff_at===id.cutoffAt&&[id.batchId,id.documentBatchId].includes(r.batch_id),'REAL_STEP_BINDING_DIFFERS');count++;need(Number.isSafeInteger(count),'REAL_STEP_COUNT_INVALID');yield step}}};
 const stepsSha256=await streamTypedHash(typedHashArray(checked));need(count>0,'REAL_STEPS_REQUIRED');
 await assertFresh35HostCurrent(context);
 const binding=Object.freeze({format:'FRESH35_PRODUCTION_REAL_IMPORT_BINDING_V1',installationRecordSha256:c.recordFileSha256,installProgramSha256:c.record.programSha256,sourceSetSha256:c.record.binding.sourceSetSha256,targetSha256:c.record.binding.targetSha256,catalogSha256:c.record.catalogSha256,manifestSha256:id.packageSha256,planSha256:id.planSha256,initializerSha256:requestHash({initialize:init,encodedScrypt:prepared.encodedScrypt}),stepsSha256,stepCount:count,sourceNamespace:id.namespace,cutoffAt:id.cutoffAt,baselineBatchId:id.batchId,documentBatchId:id.documentBatchId,initializerOperationId:init.operation_id,initializerRequestKey:init.request_key});
 productionImportBindings.set(binding,{context,prepared});return binding;
}
export async function loadFresh35ProductionImportAuthorization(context,binding){
 const c=fresh35HostContext(context);need(c.productionImport===true&&productionImportBindings.get(binding)?.context===context,'GENUINE_PRODUCTION_IMPORT_BINDING_REQUIRED');await assertFresh35HostCurrent(context);
 let file;try{await assertTrustedRootPath(FRESH35_PRODUCTION_IMPORT_AUTHORIZATION_PATH);
 file=await open(FRESH35_PRODUCTION_IMPORT_AUTHORIZATION_PATH,constants.O_RDONLY|constants.O_NOFOLLOW)}catch{throw Error('FRESH35_HOST_PRODUCTION_BATCH_AUTHORIZATION_REQUIRED')}
 try{
  const before=await file.stat({bigint:true});need(before.isFile()&&before.uid===0n&&before.nlink===1n&&(before.mode&0o022n)===0n&&before.size>0n&&before.size<=65536n,'PRODUCTION_BATCH_PROTECTED_AUTHORIZATION_REQUIRED');
  const bytes=await file.readFile(),after=await file.stat({bigint:true}),pathStat=await lstat(FRESH35_PRODUCTION_IMPORT_AUTHORIZATION_PATH,{bigint:true});
  need(BigInt(bytes.length)===before.size&&importFileIdentity(before)===importFileIdentity(after)&&importFileIdentity(before)===importFileIdentity(pathStat),'PRODUCTION_BATCH_AUTHORIZATION_CHANGED');
  const value=parseStrictJson(bytes.toString('utf8')),t=describeFresh35CombinedTarget(c.target);
  need(exactImportKeys(value,['format','decision','binding','startsAt','expiresAt','independentSafetyReviewSha256','authorizationReference'])&&value.format==='FRESH35_PRODUCTION_REAL_IMPORT_AUTHORIZATION_V1'&&value.decision==='AUTHORIZE_EXACT_REAL_BATCH_IMPORT_AND_READBACK','PRODUCTION_BATCH_AUTHORIZATION_FORMAT_REQUIRED');
  need(exactImportKeys(value.binding,Object.keys(binding))&&requestHash(value.binding)===requestHash(binding),'PRODUCTION_BATCH_AUTHORIZATION_BINDING_DIFFERS');
  need(Number.isSafeInteger(value.startsAt)&&Number.isSafeInteger(value.expiresAt)&&value.startsAt>=t.startsAt&&value.expiresAt<=t.expiresAt&&value.startsAt<value.expiresAt&&Date.now()>=value.startsAt&&Date.now()<value.expiresAt,'PRODUCTION_BATCH_AUTHORIZATION_WINDOW_EXPIRED');
  need(typeof value.independentSafetyReviewSha256==='string'&&/^[a-f0-9]{64}$/.test(value.independentSafetyReviewSha256)&&typeof value.authorizationReference==='string'&&value.authorizationReference.trim().length>0&&value.authorizationReference.length<=512,'PRODUCTION_BATCH_AUTHORIZATION_REFERENCE_REQUIRED');
  const token=Object.freeze({profile:'FRESH35_PRODUCTION_REAL_IMPORT_AUTHORIZATION_V1'});
  productionImportAuthorities.set(token,{context,bindingOriginal:binding,binding:Object.freeze(structuredClone(binding)),startsAt:value.startsAt,expiresAt:value.expiresAt,identity:importFileIdentity(before),sha256:hash(bytes)});return token;
 }finally{await file.close()}
}
async function currentProductionImportAuthority(context,authorization){
 const a=productionImportAuthorities.get(authorization),c=fresh35HostContext(context);
 need(c.productionImport===true&&a?.context===context,'GENUINE_PRODUCTION_BATCH_AUTHORIZATION_REQUIRED');
 need(Date.now()>=a.startsAt&&Date.now()<a.expiresAt,'PRODUCTION_BATCH_AUTHORIZATION_WINDOW_EXPIRED');
 await assertFresh35ProtectedRecordSnapshotCurrent(c.envelope);
 need(importFileIdentity(await lstat(FRESH35_PRODUCTION_IMPORT_AUTHORIZATION_PATH,{bigint:true}))===a.identity,'PRODUCTION_BATCH_AUTHORIZATION_CHANGED');
 need(Date.now()>=a.startsAt&&Date.now()<a.expiresAt,'PRODUCTION_BATCH_AUTHORIZATION_WINDOW_EXPIRED');return a;
}
/** Request checks are added to the original controlled client, not a second
 * writer or SQL interface. Cleanup stays available when the authority expires. */
export function fresh35ProductionImportQueryGuard(context,authorization,prepared){
 const c=fresh35HostContext(context),a=productionImportAuthorities.get(authorization);
 need(c.productionImport===true&&a?.context===context&&productionImportBindings.get(a.bindingOriginal)?.prepared===prepared,'GENUINE_PRODUCTION_BATCH_AUTHORIZATION_REQUIRED');
 let iterator,streamHash,ordinal=0,initialized=false,finished=false;
 const close=async()=>{try{if(iterator?.return)await iterator.return()}finally{iterator=undefined}};
 const check=async(sql,values)=>{
  if(sql==='ROLLBACK'){await close();return;}
  await currentProductionImportAuthority(context,authorization);
  if(sql.startsWith('BEGIN')){await close();ordinal=0;initialized=false;finished=false;return;}
  if(/^SELECT naijue_erp\.standard_whole_package_(inspect|prepare|verify)_v2\(/.test(sql)){
   need(requestHash({initialize:parseStrictJson(values?.[0]),encodedScrypt:values?.[1]})===a.binding.initializerSha256,'PRODUCTION_INITIALIZER_BINDING_DIFFERS');
   if(sql.includes('_prepare_v2(')){need(!initialized,'PRODUCTION_ORIGINAL_STEP_REQUIRED');initialized=true;streamHash=createHash('sha256').update('[')}return;
  }
  if(sql==='SELECT naijue_erp.standard_whole_package_step_v2($1::uuid,$2::integer,$3::text,$4::jsonb)::text AS result_json'){
   need(initialized&&values?.[0]===a.binding.initializerOperationId&&values?.[1]===ordinal+1,'PRODUCTION_ORIGINAL_STEP_REQUIRED');
   iterator??=prepared.steps[Symbol.asyncIterator]();const next=await iterator.next();
   const step=next.value,phase=step?.method==='masterChunk'?'MASTER':step?.method==='baselineKeys'?'KEYS':step?.method==='documentChunk'?'DOCUMENTS':step?.method==='publish'?'PUBLISH':null;
   need(!next.done&&phase===values[2]&&requestHash(parseStrictJson(values[3]))===requestHash(step.request),'PRODUCTION_ORIGINAL_STEP_REQUIRED');if(ordinal)streamHash.update(',');streamHash.update(canonicalRequestValue(step));ordinal++;return;
  }
  if(sql==='SELECT naijue_erp.standard_whole_package_finish_v2($1::uuid)::text AS result_json'){
   need(initialized&&values?.[0]===a.binding.initializerOperationId&&ordinal===a.binding.stepCount&&iterator&&(await iterator.next()).done,'PRODUCTION_COMPLETE_ORIGINAL_STEPS_REQUIRED');need(streamHash.update(']').digest('hex')===a.binding.stepsSha256,'PRODUCTION_ORIGINAL_STEP_REQUIRED');finished=true;await close();return;
  }
  if(sql==='COMMIT'||sql==='SET CONSTRAINTS ALL IMMEDIATE'){need(!initialized||finished,'PRODUCTION_COMPLETE_ORIGINAL_STEPS_REQUIRED');if(sql==='COMMIT')await close();return;}
  need(sql==='SET LOCAL ROLE erp_unified27_initializer_2393dbc6db9581c2'||sql==='SET LOCAL ROLE erp_unified27_importer_2393dbc6db9581c2','PRODUCTION_SQL_NOT_ALLOWED');
 };
 return Object.freeze({check,close,expiresAt:a.expiresAt,authorizationSha256:a.sha256});
}
export async function openReviewedFresh35ProductionHost(config,sourceRoot,target,prepare,work,options={}){
 const {openReviewedFresh35ProductionPhysicalHost}=await import('./whole-host-session.mjs');
 return openReviewedFresh35ProductionPhysicalHost(config,sourceRoot,target,prepare,work,options);
}

const ordinaryAdmissions=new WeakMap(),ordinaryPendingPools=new WeakSet(),ordinaryUsedPools=new WeakSet();
const ordinaryRole='erp_unified27_runtime_2393dbc6db9581c2';
const ordinaryIdentitySql=`/* fresh35-ordinary:physical-before-role */ SELECT
 (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS "systemIdentifier",
 (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS "databaseOid",
 current_database() AS database,current_user AS "currentUser",session_user AS "sessionUser",
 host(inet_server_addr()) AS "serverAddress",inet_server_port() AS "serverPort",
 pg_postmaster_start_time()::text AS "postmasterStart",pg_backend_pid() AS "backendPid",
 current_setting('server_version_num') AS "serverVersionNum",
 current_setting('row_security') AS "rowSecurity",current_setting('session_replication_role') AS "replicationRole",
 pg_is_in_recovery() AS recovery,
 (NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolcanlogin AND r.rolconnlimit=2) AS "ordinaryAttributes",
 (CASE WHEN $1::text IS NULL THEN (r.rolvaliduntil IS NULL OR r.rolvaliduntil='infinity'::timestamptz) ELSE r.rolvaliduntil=$1::timestamptz END AND (r.rolvaliduntil IS NULL OR r.rolvaliduntil>clock_timestamp())) AS "lifetimeMatches",
 (SELECT coalesce(jsonb_agg(jsonb_build_array(parent.rolname,m.admin_option,m.inherit_option,m.set_option) ORDER BY parent.rolname),'[]'::jsonb)
 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid WHERE m.member=r.oid) AS memberships
 FROM pg_catalog.pg_roles r WHERE r.rolname=session_user`;
const syntheticIdentitySql=ordinaryIdentitySql.replace("(CASE WHEN $1::text IS NULL THEN (r.rolvaliduntil IS NULL OR r.rolvaliduntil='infinity'::timestamptz) ELSE r.rolvaliduntil=$1::timestamptz END AND (r.rolvaliduntil IS NULL OR r.rolvaliduntil>clock_timestamp())) AS \"lifetimeMatches\",", "(r.rolvaliduntil>clock_timestamp() AND r.rolvaliduntil<=to_timestamp($1::double precision/1000)) AS \"lifetimeMatches\",r.rolvaliduntil::text AS \"observedLoginValidUntil\",");
const ordinaryStatus=client=>client?.getTransactionStatus?.();
function syntheticWindow(state){
 if(!state.synthetic)return;
 const deadline=Math.min(state.t.expiresAt,state.t.ordinary.runtimeLoginValidUntil===null?state.t.expiresAt:Date.parse(state.t.ordinary.runtimeLoginValidUntil));
 try{need(Date.now()>=state.t.startsAt&&Date.now()<deadline,'SYNTHETIC_ORDINARY_WINDOW_EXPIRED')}catch(error){revokeOrdinary(state);throw error}
 return deadline;
}
const identityQuery=state=>state.synthetic?syntheticIdentitySql:ordinaryIdentitySql;
const identityParameter=state=>state.synthetic?state.t.expiresAt:state.t.ordinary.runtimeLoginValidUntil;
function ordinaryState(cap,pool){const state=ordinaryAdmissions.get(cap);need(state&&state.active&&state.pool===pool,'ORDINARY_ACTIVE_SAME_POOL_REQUIRED');syntheticWindow(state);return state;}
function revokeOrdinary(state){state.active=false;for(const w of state.watchers)w.close();state.watchers.length=0;}
function matchOrdinaryIdentity(row,t,currentStart){
 need(row&&row.systemIdentifier===t.physical.systemIdentifier&&row.databaseOid===t.physical.databaseOid&&row.database===t.proposal.database&&row.currentUser===t.proposal.runtime&&row.sessionUser===t.proposal.runtime&&row.serverAddress===t.ordinary.serverAddress&&row.serverPort===t.ordinary.serverPort&&row.serverVersionNum===t.physical.serverVersionNum&&row.rowSecurity==='on'&&row.replicationRole==='origin'&&row.recovery===false&&row.ordinaryAttributes===true&&row.lifetimeMatches===true&&JSON.stringify(row.memberships)===JSON.stringify([[ordinaryRole,false,false,true]])&&typeof row.postmasterStart==='string'&&row.postmasterStart.length>0&&Number.isSafeInteger(row.backendPid)&&row.backendPid>0&&(!currentStart||row.postmasterStart===currentStart)&&(t.purpose!=='RESTORED_FROM_VERIFIED_INSTALLATION'||row.postmasterStart===t.physical.postmasterStart)&&(!t.syntheticOnly||(row.postmasterStart===t.physical.postmasterStart&&typeof row.observedLoginValidUntil==='string'&&Number.isFinite(Date.parse(row.observedLoginValidUntil))&&Date.parse(row.observedLoginValidUntil)<=t.expiresAt&&Date.parse(row.observedLoginValidUntil)>Date.now()&&(!t.ordinary.runtimeLoginValidUntil||row.observedLoginValidUntil===t.ordinary.runtimeLoginValidUntil))),'ORDINARY_PHYSICAL_OR_LOGIN_DIFFERS');return row;
}
/** One startup verification on the original owned pool. No caller record,
 * reference path, catalog observation or capability may replace the fixed record. */
export async function admitFresh35OrdinaryPoolV2(pool,connection){return admitOrdinaryPool(pool,connection,false)}
/** Original isolated V1 installation only; never a production purpose or an
 * import authorization. Uses the same private pool-bound lease implementation. */
export async function admitFresh35SyntheticOrdinaryPoolV1(pool,connection){return admitOrdinaryPool(pool,connection,true)}
async function admitOrdinaryPool(pool,connection,synthetic){
 need(pool&&typeof pool.connect==='function'&&!ordinaryPendingPools.has(pool)&&!ordinaryUsedPools.has(pool),'ORDINARY_EXCLUSIVE_STARTUP_REQUIRED');
 need(connection&&Object.getPrototypeOf(connection)===Object.prototype&&Object.keys(connection).sort().join(',')==='database,host,port,user','ORDINARY_CONNECTION_KEYS_REQUIRED');
 const fixed=Object.freeze({...connection});ordinaryPendingPools.add(pool);ordinaryUsedPools.add(pool);
 let client,began=false,state;
 try{
  const envelope=await loadFresh35CombinedRecordEnvelope();
  let target,t;
  if(synthetic){
   need(envelope.format==='FRESH35_COMBINED_INSTALLATION_RECORD_V1'&&envelope.target?.format==='FRESH35_COMBINED_TARGET_BINDING_V1'&&!envelope.target.purpose,'SYNTHETIC_V1_RECORD_REQUIRED');
   const {proposal,physical,startsAt,expiresAt}=envelope.target;
   target=bindFresh35CombinedTarget({proposal,physical,startsAt,expiresAt});const bound=describeFresh35CombinedTarget(target);
   need(bound.format==='FRESH35_COMBINED_TARGET_BINDING_V1'&&!bound.purpose&&/^synthetic_fresh35_[0-9]{8}_r[1-9][0-9]{0,3}$/.test(bound.proposal.database)&&bound.proposal.host==='127.0.0.1','SYNTHETIC_V1_TARGET_REQUIRED');
   t={...bound,syntheticOnly:true,ordinary:{connectHost:bound.proposal.host,connectPort:bound.proposal.port,serverAddress:bound.proposal.host,serverPort:bound.proposal.port,runtimeLoginValidUntil:null,referenceDirectory:resolve(moduleRoot,'reference-inputs')}};
  }else{target=envelope.format==='FRESH35_RESTORED_INSTALLATION_RECORD_V1'?await reconstructFresh35RestoredTarget(envelope):await reconstructFresh35InstalledProductionTargetV2(envelope);t=describeFresh35CombinedTarget(target);}
  need(fixed.database===t.proposal.database&&fixed.user===t.proposal.runtime&&fixed.host===t.ordinary.connectHost&&fixed.port===t.ordinary.connectPort,'ORDINARY_CONNECTION_DIFFERS');
  await assertTrustedRootPath(process.execPath);await assertTrustedRootPath(moduleRoot);await assertTrustedRootTree(t.ordinary.referenceDirectory);
  const paths=await resolveFresh35ReferenceInputPaths(t.ordinary.referenceDirectory),source=await loadFresh35CombinedSource(moduleRoot,{baselineDirectory:paths.baselineDirectory});
  const pins=describeFresh35CombinedSource(source).currentSourcePins;
  for(const pin of pins)await assertTrustedRootPath(resolve(moduleRoot,pin.path));
  for(const [path,digest]of [['tools/unified-import/fresh35-host-session.mjs',loadedHostSha256],['scripts/release/unified-install/fresh35-combined-record-v1.mjs',FRESH35_COMBINED_RECORD_MODULE_SHA256]])need(pins.some(p=>p.path===path&&p.sha256===digest),'LOADED_IMPLEMENTATION_SOURCE_DIFFERS');
  const catalog=await buildFresh35CombinedCatalog(source,target,paths),program=envelope.format==='FRESH35_RESTORED_INSTALLATION_RECORD_V1'?await compileFresh35RestorationProgram({source,target,catalog,origin:envelope.origin}):await compileFresh35CombinedProgram({source,target,catalog});
  const record=validateFresh35CombinedRecord(envelope,program),snapshot=describeFresh35ProtectedRecordSnapshot(envelope),recordSha256=snapshot.sha256;
  state={pool,active:true,watchers:[],envelope,t,source,target,catalog,record,synthetic};
  // Invalidations only: no source hashing/catalog scans on business requests.
  // Watch the finite existing source/reference pin set, not the workspace tree.
  const watched=new Set([FRESH35_COMBINED_RECORD_PATH,...pins.map(p=>resolve(moduleRoot,p.path)),paths.modelPath,paths.functionsPath,paths.baselineDirectory,resolve(t.ordinary.referenceDirectory,'INDEX.json')].filter(x=>typeof x==='string'));
  // The synthetic record's root0711 authority parent is not listable. Keep
  // the readable record inode watch and exact generation checks below.
  for(const path of [...watched])if(!synthetic||path!==FRESH35_COMBINED_RECORD_PATH)watched.add(dirname(path));
  watched.add(moduleRoot);
  // The isolated workspace is root0711: watch the readable fixed inode only,
  // never its non-listable parent. Existing change/rename/error revokes the lease.
  if(synthetic)watched.add(resolve(t.proposal.workspaceDirectory,'bootstrap-network-observation.json'));
  for(const path of watched){const watcher=watch(path,()=>revokeOrdinary(state));watcher.on('error',()=>revokeOrdinary(state));watcher.unref();state.watchers.push(watcher);}
  await assertFresh35CombinedSourcesCurrent(source);await assertFresh35CombinedCatalogCurrent(catalog);
  await assertFresh35ProtectedRecordSnapshotCurrent(envelope,true);need(state.active,'ORDINARY_STARTUP_SOURCE_CHANGED');
  syntheticWindow(state);client=await pool.connect();need(ordinaryStatus(client)==='I','ORDINARY_IDLE_LEASE_REQUIRED');
  const first=await client.query(identityQuery(state),[identityParameter(state)]);need(first.rows?.length===1,'ORDINARY_ONE_PHYSICAL_ROW_REQUIRED');
  const physical=matchOrdinaryIdentity(first.rows[0],t);if(synthetic)t.ordinary.runtimeLoginValidUntil=physical.observedLoginValidUntil;
  ack(await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'),'BEGIN');began=true;
  const again=await client.query(identityQuery(state),[identityParameter(state)]);need(again.rows?.length===1,'ORDINARY_ONE_PHYSICAL_ROW_REQUIRED');matchOrdinaryIdentity(again.rows[0],t,physical.postmasterStart);need(again.rows[0].backendPid===physical.backendPid,'ORDINARY_BACKEND_CHANGED');
  ack(await client.query('SET LOCAL ROLE '+ordinaryRole),'SET');
  const module=await import('../../scripts/release/unified-install/fresh35-combined-catalog-v1.mjs'),sql=synthetic?module.fresh35CombinedSyntheticOrdinaryCatalogSql(catalog,source,target,physical):module.fresh35CombinedOrdinaryCatalogSql(catalog,source,target,physical);
  const guards=await client.query(sql.guardSql);need(Array.isArray(guards)&&guards.length===2,'ORDINARY_CATALOG_GUARD_ACK_INVALID');for(const result of guards)ack(result,'DO');
  const observed=await client.query(sql.observationSql);need(observed.rows?.length===1,'ORDINARY_CATALOG_PACKET_REQUIRED');(synthetic?module.validateFresh35CombinedSyntheticOrdinaryCatalogObservation:module.validateFresh35CombinedOrdinaryCatalogObservation)(observed.rows[0].catalog_json,catalog,source,target);
  if(envelope.format==='FRESH35_RESTORED_INSTALLATION_RECORD_V1'){
   ack(await client.query("SET LOCAL TimeZone TO 'UTC'"),'SET');const proof=await client.query(fresh35RestorationOrdinaryProofSql(program));ack(proof,'SELECT');need(proof.rows?.length===1,'RESTORED_ROLE_ACL_ONE_ROW_REQUIRED');validateFresh35RestorationOrdinaryProof(proof.rows[0].restoration_json,record);
  }
  ack(await client.query('ROLLBACK'),'ROLLBACK');began=false;
  need(ordinaryStatus(client)==='I'&&state.active,'ORDINARY_STARTUP_INVALIDATED');
  const effectiveExpiry=syntheticWindow(state);state.description=Object.freeze({...(synthetic?{purpose:'SYNTHETIC_ISOLATED_ORDINARY_V1',expiresAt:effectiveExpiry}:{}),systemIdentifier:t.physical.systemIdentifier,databaseOid:t.physical.databaseOid,database:t.proposal.database,user:t.proposal.runtime,connectHost:t.ordinary.connectHost,connectPort:t.ordinary.connectPort,serverAddress:t.ordinary.serverAddress,serverPort:t.ordinary.serverPort,postmasterStart:physical.postmasterStart,recordSha256,sourceSetSha256:record.binding.sourceSetSha256});
  const cap=Object.freeze({profile:'FRESH35_ORDINARY_POOL_ADMISSION_V2'});ordinaryAdmissions.set(cap,state);return cap;
 }catch(error){if(state)revokeOrdinary(state);throw error}finally{try{if(client){try{if(began)await client.query('ROLLBACK')}finally{client.release(true)}}if(state?.description){syntheticWindow(state);await assertFresh35ProtectedRecordSnapshotCurrent(state.envelope);syntheticWindow(state);need(state.active,'ORDINARY_STARTUP_INVALIDATED');}}catch(error){if(state)revokeOrdinary(state);throw error}finally{ordinaryPendingPools.delete(pool)}}
}
export function describeFresh35OrdinaryAdmissionV2(cap){const state=ordinaryAdmissions.get(cap);need(state?.active,'ORDINARY_ACTIVE_ADMISSION_REQUIRED');syntheticWindow(state);return state.description;}
export async function assertFresh35OrdinaryAdmissionCurrentV2(cap,pool){
 const state=ordinaryState(cap,pool);
 try{await assertFresh35ProtectedRecordSnapshotCurrent(state.envelope);syntheticWindow(state);need(state.active,'ORDINARY_RECORD_CHANGED');}catch(error){revokeOrdinary(state);throw error}
}
export async function assertFresh35OrdinaryLeaseV2(cap,pool,client){
 const state=ordinaryState(cap,pool);await assertFresh35OrdinaryAdmissionCurrentV2(cap,pool);
 try{need(ordinaryStatus(client)==='I','ORDINARY_IDLE_LEASE_REQUIRED');const observed=await client.query(identityQuery(state),[identityParameter(state)]);need(observed.rows?.length===1,'ORDINARY_ONE_PHYSICAL_ROW_REQUIRED');matchOrdinaryIdentity(observed.rows[0],state.t,state.description.postmasterStart);await assertFresh35OrdinaryAdmissionCurrentV2(cap,pool);need(ordinaryStatus(client)==='I'&&state.active,'ORDINARY_LEASE_INVALIDATED');}catch(error){revokeOrdinary(state);throw error}
}
export function closeFresh35OrdinaryAdmissionV2(cap,pool){const state=ordinaryAdmissions.get(cap);need(state&&state.pool===pool,'ORDINARY_SAME_POOL_REQUIRED');revokeOrdinary(state);}
