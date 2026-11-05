import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {explicitZeroApprovalDescriptor,explicitZeroApproved} from '../../packages/application/src/unified-explicit-zero-approval.ts';
import {parseStrictJson} from '../../packages/application/src/unified-import-contract.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
/** Shared exclusive wire state machine. Fixed hosts own record and catalog admission. */
import {validateStandardImportTarget} from '../../packages/application/src/unified-import-execution.ts';
function ownedSqlParameters(values){
 if(values===undefined)return undefined;
 if(!Array.isArray(values)||types.isProxy(values)||Object.getPrototypeOf(values)!==Array.prototype)throw Error('WHOLE_SQL_PARAMETERS_INVALID');
 const descriptors=Object.getOwnPropertyDescriptors(values),length=descriptors.length?.value;
 if(!Number.isSafeInteger(length)||length<0||length>16||Reflect.ownKeys(descriptors).length!==length+1)throw Error('WHOLE_SQL_PARAMETERS_INVALID');
 const owned=[];for(let i=0;i<length;i++){const d=descriptors[String(i)];if(!d||!Object.hasOwn(d,'value')||!d.enumerable)throw Error('WHOLE_SQL_PARAMETERS_INVALID');const v=d.value;if(v!==null&&typeof v!=='string'&&typeof v!=='boolean'&&!(typeof v==='number'&&Number.isSafeInteger(v)))throw Error('WHOLE_SQL_PARAMETERS_INVALID');owned.push(v);}return Object.freeze(owned);
}
const loadedPhysicalHostSha256=import.meta.url.startsWith('file:')?createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'):null;
const sessionClients=new WeakMap();
export function sameActiveWholeHostSession(gate,execution){const a=sessionClients.get(gate),b=sessionClients.get(execution);return !!a&&a===b&&a.active===true}
const CLOSE_TIMEOUT_MS=5000;
export async function closePhysical(client){let timer;try{await Promise.race([Promise.resolve().then(()=>client.end()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('WHOLE_CONNECTION_CLOSE_TIMEOUT')),CLOSE_TIMEOUT_MS)})])}catch(error){try{client.connection?.stream?.destroy()}catch{}throw error}finally{if(timer)clearTimeout(timer)}}
const allowed=new Set(['BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY','COMMIT','ROLLBACK','SET CONSTRAINTS ALL IMMEDIATE','SET LOCAL ROLE erp_unified27_initializer_2393dbc6db9581c2','SET LOCAL ROLE erp_unified27_importer_2393dbc6db9581c2','SELECT naijue_erp.standard_whole_package_inspect_v2($1::jsonb,$2::text)::text AS result_json','SELECT naijue_erp.standard_whole_package_prepare_v2($1::jsonb,$2::text)::text AS result_json','SELECT naijue_erp.standard_whole_package_step_v2($1::uuid,$2::integer,$3::text,$4::jsonb)::text AS result_json','SELECT naijue_erp.standard_whole_package_finish_v2($1::uuid)::text AS result_json','SELECT naijue_erp.standard_whole_package_verify_v2($1::jsonb,$2::text)::text AS result_json']);
/** Owns one connected exclusive pg Client. Caller must separately ensure no
 * concurrent DDL/ACL change for the entire window. No arbitrary SQL escapes. */
export async function withReviewedWholeSession(client,spec,reviewed,target,work,verifyCatalog,profile='ORIGINAL177',options={}){
 return runWholeSession(client,spec,reviewed,target,work,verifyCatalog,profile,false,options);
}
// Trust is granted only by the fixed physical factory below, never by the
// exported state-machine helper or caller-provided clients/verifiers.
async function runWholeSession(client,spec,reviewed,target,work,verifyCatalog,profile,trustedPhysical,options={}){
 const approval=options.explicitZeroApproval;let descriptor;try{descriptor=approval?explicitZeroApprovalDescriptor(approval):null;}catch(error){await closePhysical(client);throw error}
 const checkApproval=(sql,values)=>{
  if(/^SELECT naijue_erp\.standard_whole_package_(inspect|prepare|verify)_v2\(/.test(sql)){
   const r=parseStrictJson(values?.[0]);if(requestHash(r?.payload?.explicit_zero_approval??null)!==requestHash(descriptor)||descriptor&&(r.namespace!==descriptor.source_namespace||r.cutoff_at!==descriptor.cutoff_at))throw Error('EXPLICIT_ZERO_APPROVAL_BINDING_INVALID');
  }else if(sql==='SELECT naijue_erp.standard_whole_package_step_v2($1::uuid,$2::integer,$3::text,$4::jsonb)::text AS result_json'){
   const r=parseStrictJson(values?.[3]);for(const row of r?.payload?.rows??[]){if(Object.hasOwn(row,'explicit_zero_evidence')&&(!descriptor||values[2]!=='KEYS'||!explicitZeroApproved(approval,descriptor.source_namespace,descriptor.inventory_file_sha256,descriptor.cutoff_at,row)))throw Error('EXPLICIT_ZERO_APPROVAL_BINDING_INVALID');}
  }
 };
 const sessionBinding={active:true};
 let verified,deadlineTimer;
 let closed=false,failed=false,busy=false,poisoned=false,rollbackUsed=false,closeFailed=false,closePromise,result,problem,hasProblem=false,cleanup='CLOSED';
 const close=()=>{if(!closePromise){closed=true;closePromise=closePhysical(client).catch(e=>{closeFailed=true;throw e})}return closePromise};
 const ready=()=>typeof client.getTransactionStatus==='function'&&client.readyForQuery===true&&client._queryable===true&&client._ending===false&&client.pipeline===false&&client._activeQuery==null&&Array.isArray(client._queryQueue)&&client._queryQueue.length===0&&Array.isArray(client._sentQueryQueue)&&client._sentQueryQueue.length===0;
 const ack=(r,command)=>{const d=r&&Object.getOwnPropertyDescriptor(r,'command');return !!d&&Object.hasOwn(d,'value')&&d.value===command};
 client.on('error',()=>{failed=true;poisoned=true;void close().catch(()=>{})});
 const armDeadline=()=>{if(deadlineTimer)clearTimeout(deadlineTimer);deadlineTimer=setTimeout(()=>{failed=true;poisoned=true;void close().catch(()=>{})},Math.max(0,options.fresh35ExpiresAt-Date.now()));deadlineTimer.unref?.()};
 const tightenDeadline=expiresAt=>{if(profile!=='FRESH35_RETIRED152_V1'||!Number.isSafeInteger(expiresAt)||expiresAt>options.fresh35ExpiresAt||expiresAt<=Date.now())throw Error('FRESH35_HOST_WINDOW_EXPIRED');options={...options,fresh35ExpiresAt:expiresAt};armDeadline()};
 if(profile==='FRESH35_RETIRED152_V1'&&Number.isSafeInteger(options.fresh35ExpiresAt))armDeadline();
 try{if(!['ORIGINAL177','WHOLE_SALES_V1','FRESH35_RETIRED152_V1'].includes(profile))throw Error('WHOLE_HOST_PROFILE_INVALID');reviewed=structuredClone(reviewed);target=structuredClone(target);if(!ready()||client.getTransactionStatus()!=='I')throw Error('WHOLE_CONNECTION_NOT_IDLE');let gateError,hasGateError=false;
  try{const start=await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');if(!ack(start,'BEGIN')||!ready()||client.getTransactionStatus()!=='T')throw Error('WHOLE_CATALOG_BEGIN_UNCERTAIN');const gateClient={async query(sql,values){if(!ready()||client.getTransactionStatus()!=='T'||failed)throw Error('WHOLE_CATALOG_WIRE_INVALID');const r=await client.query(sql,values);if(!ready()||client.getTransactionStatus()!=='T'||failed)throw Error('WHOLE_CATALOG_WIRE_INVALID');return r}};if(trustedPhysical)sessionClients.set(gateClient,sessionBinding);verified=await verifyCatalog(gateClient,spec,reviewed)}catch(e){gateError=e;hasGateError=true}
  try{if(!ready()||!['T','E'].includes(client.getTransactionStatus()))throw Error('WHOLE_CATALOG_ROLLBACK_UNCERTAIN');const r=await client.query('ROLLBACK');if(!ack(r,'ROLLBACK')||!ready()||client.getTransactionStatus()!=='I')throw Error('WHOLE_CATALOG_ROLLBACK_UNCERTAIN')}catch{throw Error('WHOLE_CATALOG_ROLLBACK_UNCERTAIN')}if(hasGateError)throw gateError;
  if(closed||failed)throw Error('WHOLE_CONNECTION_UNCERTAIN');validateStandardImportTarget(target);if(!target||target.protocol!=='STANDARD_IMPORT_SQL_V1'||target.system_identifier!==reviewed.system_identifier||target.database_oid!==reviewed.database_oid||target.database_name!==reviewed.database_name||target.catalog_sha256!==reviewed.catalog_sha256)throw Error('WHOLE_TARGET_BINDING_MISMATCH');
  const controlled=Object.freeze({async query(sql,values){const expired=profile==='FRESH35_RETIRED152_V1'&&Date.now()>=options.fresh35ExpiresAt;const cleaning=sql==='ROLLBACK'&&(poisoned||expired)&&!rollbackUsed;if(expired&&!cleaning){poisoned=true;throw Error('FRESH35_HOST_WINDOW_EXPIRED')}if(closed||failed||busy||(poisoned&&!cleaning)){poisoned=true;throw Error('WHOLE_CONNECTION_UNAVAILABLE')}try{values=ownedSqlParameters(values)}catch(error){poisoned=true;throw error}const salesRead=['WHOLE_SALES_V1','FRESH35_RETIRED152_V1'].includes(profile)&&sql==='SELECT * FROM naijue_erp.standard_zero_amount_archive_trace($1::uuid)'&&Array.isArray(values)&&values.length===1&&typeof values[0]==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(values[0]);if(!allowed.has(sql)&&!salesRead){poisoned=true;throw Error('WHOLE_SQL_NOT_ALLOWED')}try{checkApproval(sql,values)}catch(error){poisoned=true;throw error}if(!ready()){poisoned=true;throw Error('WHOLE_WIRE_STATE_INVALID')}const before=client.getTransactionStatus();if(sql.startsWith('BEGIN')?before!=='I':sql==='ROLLBACK'?!['T','E'].includes(before):before!=='T'){poisoned=true;throw Error('WHOLE_WIRE_STATE_INVALID')}if(cleaning)rollbackUsed=true;busy=true;try{if(options.authorizedQuery){await options.authorizedQuery(sql,values);if(!cleaning&&(closed||failed||poisoned||Date.now()>=options.fresh35ExpiresAt))throw Error('FRESH35_HOST_WINDOW_EXPIRED')}const r=await client.query(sql,values);const after=client.getTransactionStatus(),expected=(sql==='COMMIT'||sql==='ROLLBACK')?'I':'T',command=sql.startsWith('BEGIN')?'BEGIN':sql==='COMMIT'?'COMMIT':sql==='ROLLBACK'?'ROLLBACK':sql.startsWith('SET ')?'SET':'SELECT';if(closed||failed||(poisoned&&!cleaning)||!ready()||after!==expected||!ack(r,command))throw Error('WHOLE_CONNECTION_UNCERTAIN');return r}catch(e){poisoned=true;throw e}finally{busy=false}},async discard(){failed=true;poisoned=true;await close()}});
  if(trustedPhysical)sessionClients.set(controlled,sessionBinding);result=await work(controlled,verified,tightenDeadline);if(!closed&&(!ready()||client.getTransactionStatus()!=='I'))throw Error('WHOLE_TRANSACTION_NOT_CLOSED');
 }catch(e){problem=e;hasProblem=true}finally{sessionBinding.active=false;if(deadlineTimer)clearTimeout(deadlineTimer);try{await close()}catch{}if(closeFailed)cleanup='CLOSE_FAILED'}if(hasProblem){if(closeFailed)throw Error('WHOLE_CONNECTION_CLEANUP_FAILED');throw problem}return{result,cleanup}}


/** Fixed supported sales entry. Physical client and verifier never escape.
 * Assumes the trusted Node runtime/dependencies/source required by publication;
 * does not claim protection against runtime tampering or arbitrary code execution. */
export async function openReviewedWholeSalesHost(config,sourceRoot,target,work,options={}){
 if(options.explicitZeroApproval)explicitZeroApprovalDescriptor(options.explicitZeroApproval);
 const {loadWholeSalesSpecV1,verifyWholeSalesInstalledV1}=await import('../../scripts/release/unified-install/whole-sales-catalog-v1.mjs');
 const {loadWholeSalesRecordV1}=await import('../../scripts/release/unified-install/whole-sales-record-v1.mjs');
 const {withVerifiedWholeSalesAdmissionV1}=await import('../../scripts/release/unified-install/whole-sales-admission-v1.mjs');
 config=structuredClone(config);target=structuredClone(target);if(!config||!['database,host,password,port,user','database,host,password,port,statement_timeout_ms,user'].includes(Object.keys(config).sort().join(','))||(config.statement_timeout_ms!==undefined&&(!Number.isSafeInteger(config.statement_timeout_ms)||config.statement_timeout_ms<1000||config.statement_timeout_ms>3600000))||typeof config.host!=='string'||!(config.host==='127.0.0.1'||config.host.startsWith('/'))||!Number.isSafeInteger(config.port)||config.port<1||config.port>65535||typeof config.database!=='string'||!config.database||typeof config.user!=='string'||!config.user||typeof config.password!=='string')throw Error('WHOLE_CONNECTION_CONFIG_INVALID');if(Object.keys(process.env).some(k=>k==='DATABASE_URL'||/^PG[A-Z_]+$/.test(k)))throw Error('AMBIENT_DATABASE_CONFIGURATION_PROHIBITED');const spec=await loadWholeSalesSpecV1(sourceRoot),reviewed=await loadWholeSalesRecordV1(spec);validateStandardImportTarget(target);if(target.system_identifier!==reviewed.system_identifier||target.database_oid!==reviewed.database_oid||target.database_name!==reviewed.database_name||target.catalog_sha256!==reviewed.catalog_sha256)throw Error('WHOLE_TARGET_BINDING_MISMATCH');const{Client}=await import('pg');const client=new Client({host:config.host,port:config.port,database:config.database,user:config.user,password:()=>config.password,ssl:false,application_name:'unified-whole-package',connectionTimeoutMillis:5000,statement_timeout:config.statement_timeout_ms??900000,query_timeout:(config.statement_timeout_ms??900000)+5000,lock_timeout:5000,options:'-c search_path=pg_catalog'});let connectFailed=false;client.on('error',()=>{connectFailed=true});try{await client.connect();if(connectFailed)throw Error('WHOLE_CONNECTION_FAILED')}catch{try{await closePhysical(client)}catch{throw Error('WHOLE_CONNECTION_CLEANUP_FAILED')}throw Error('WHOLE_CONNECTION_FAILED')}let gateClient;
 return runWholeSession(client,spec,reviewed,target,(controlled,verified)=>
  withVerifiedWholeSalesAdmissionV1(verified,gateClient,controlled,target,(admission)=>work(controlled,admission)),
  async(c,s)=>{gateClient=c;return verifyWholeSalesInstalledV1(c,s)},'WHOLE_SALES_V1',true,options)}

/** Fresh35 uses the same wire lifecycle, but only its own fixed record and
 * verifier. This factory accepts neither clients, catalog callbacks nor records. */
export async function openReviewedFresh35PhysicalHost(config,sourceRoot,target,work,options={}){return openFresh35PhysicalHost(config,sourceRoot,target,work,options)}
export async function openReviewedFresh35ProductionPhysicalHost(config,sourceRoot,target,prepare,work,options={}){
 if(typeof prepare!=='function'||typeof work!=='function'||!options||Object.keys(options).some(k=>!['explicitZeroApproval','referenceDirectory','sourceProfileSha256','prepareOnly'].includes(k))||('prepareOnly'in options&&typeof options.prepareOnly!=='boolean'))throw Error('FRESH35_HOST_OPTIONS_INVALID');
 return openFresh35PhysicalHost(config,sourceRoot,target,work,options,prepare);
}
async function openFresh35PhysicalHost(config,sourceRoot,target,work,options={},productionPrepare){
 const host=await import('./fresh35-host-session.mjs');const {loadFresh35HostContext,loadFresh35ProductionImportContext,fresh35HostContext,verifyFresh35InstalledV1,assertFresh35HostCurrent}=host;
 const {describeFresh35CombinedTarget}=await import('../../scripts/release/unified-install/fresh35-combined-target-v1.mjs');
 const {withVerifiedFresh35AdmissionV1,WHOLE_SALES_ADMISSION_MODULE_SHA256}=await import('../../scripts/release/unified-install/whole-sales-admission-v1.mjs');
 if(!options||Object.keys(options).some(k=>!['explicitZeroApproval','referenceDirectory','sourceProfileSha256',...(productionPrepare?['prepareOnly']:[])].includes(k)))throw Error('FRESH35_HOST_OPTIONS_INVALID');
 if(options.explicitZeroApproval)explicitZeroApprovalDescriptor(options.explicitZeroApproval);
 const context=await (productionPrepare?loadFresh35ProductionImportContext:loadFresh35HostContext)(sourceRoot,options.referenceDirectory),c=fresh35HostContext(context),t=describeFresh35CombinedTarget(c.target);
 const {describeFresh35CombinedSource}=await import('../../scripts/release/unified-install/fresh35-combined-source-v1.mjs');
 const pins=describeFresh35CombinedSource(c.source).currentSourcePins;
 if(!loadedPhysicalHostSha256||!pins.some(p=>p.path==='tools/unified-import/whole-host-session.mjs'&&p.sha256===loadedPhysicalHostSha256)||!pins.some(p=>p.path==='scripts/release/unified-install/whole-sales-admission-v1.mjs'&&p.sha256===WHOLE_SALES_ADMISSION_MODULE_SHA256))throw Error('FRESH35_HOST_LOADED_IMPLEMENTATION_SOURCE_DIFFERS');
 const reviewed={system_identifier:t.physical.systemIdentifier,database_oid:t.physical.databaseOid,database_name:t.proposal.database,catalog_sha256:c.record.catalogSha256};
 validateStandardImportTarget(target);target=structuredClone(target);
 if(Object.keys(reviewed).some(k=>target[k]!==reviewed[k]))throw Error('FRESH35_HOST_TARGET_BINDING_MISMATCH');
 config=structuredClone(config);
 if(!config||!['database,host,password,port,user','database,host,password,port,statement_timeout_ms,user'].includes(Object.keys(config).sort().join(','))||config.host!==t.proposal.host||config.port!==t.proposal.port||config.database!==t.proposal.database||config.user!==t.proposal.controller||typeof config.password!=='string'||!config.password||(config.statement_timeout_ms!==undefined&&(!Number.isSafeInteger(config.statement_timeout_ms)||config.statement_timeout_ms<1000||config.statement_timeout_ms>3600000)))throw Error('WHOLE_CONNECTION_CONFIG_INVALID');
 if(Object.keys(process.env).some(k=>k==='DATABASE_URL'||/^PG[A-Z_]+$/.test(k)))throw Error('AMBIENT_DATABASE_CONFIGURATION_PROHIBITED');
 const {Client}=await import('pg');
 const timeout=Math.min(config.statement_timeout_ms??900000,t.expiresAt-Date.now());
 if(timeout<=0)throw Error('FRESH35_HOST_WINDOW_EXPIRED');
 const client=new Client({host:config.host,port:config.port,database:config.database,user:config.user,password:()=>config.password,ssl:false,application_name:'unified-fresh35-package',connectionTimeoutMillis:Math.min(5000,timeout),statement_timeout:timeout,query_timeout:timeout+5000,lock_timeout:Math.min(5000,timeout),options:'-c search_path=pg_catalog'});
 let connectFailed=false;client.on('error',()=>{connectFailed=true});
 try{await client.connect();if(connectFailed)throw Error('WHOLE_CONNECTION_FAILED')}catch{try{await closePhysical(client)}catch{throw Error('WHOLE_CONNECTION_CLEANUP_FAILED')}throw Error('WHOLE_CONNECTION_FAILED')}
 let gateClient,hostVerification,queryGuard;
 try{const result=await runWholeSession(client,context,reviewed,target,async(controlled,verified,tightenDeadline)=>{
  await assertFresh35HostCurrent(context);
  hostVerification=Object.freeze({profile:'FRESH35_SAME_CLIENT_CATALOG_VERIFICATION_V1',program_sha256:c.record.programSha256,catalog_spec_sha256:c.record.catalogSpecSha256,installation_catalog_sha256:c.record.catalogSha256,live_catalog_sha256:verified.live_catalog_sha256,source_profile_sha256:verified.source_profile_sha256});
  return withVerifiedFresh35AdmissionV1(verified,gateClient,controlled,target,async admission=>{
   if(!productionPrepare)return work(controlled,admission);
   // Preparation receives only planner admission, never a client that can write.
   const prepared=await productionPrepare(admission),binding=await host.describeFresh35ProductionImportBinding(context,prepared);
   if(options.prepareOnly)return {state:'PRODUCTION_REAL_IMPORT_PREPARED',binding,business_database_writes:false,verification:{state:'NOT_RUN'}};
   const authorization=await host.loadFresh35ProductionImportAuthorization(context,binding);
   queryGuard=host.fresh35ProductionImportQueryGuard(context,authorization,prepared);tightenDeadline(queryGuard.expiresAt);
   hostVerification=Object.freeze({...hostVerification,production_import_authorization_sha256:queryGuard.authorizationSha256,production_import_binding:binding});
   return work(controlled,admission,binding);
  });
 },async gate=>{gateClient=gate;return verifyFresh35InstalledV1(gate,context,options.sourceProfileSha256)},'FRESH35_RETIRED152_V1',true,{explicitZeroApproval:options.explicitZeroApproval,fresh35ExpiresAt:t.expiresAt,...(productionPrepare?{async authorizedQuery(sql,values){
   if(sql==='ROLLBACK'){if(queryGuard)await queryGuard.check(sql,values);return;}
   if(!queryGuard)throw Error('FRESH35_HOST_PRODUCTION_BATCH_AUTHORIZATION_REQUIRED');
   await queryGuard.check(sql,values);
  }}:{})});
 return {...result,host_verification:hostVerification};
 }finally{await queryGuard?.close()}
}
