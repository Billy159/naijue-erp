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
 let verified;
 let closed=false,failed=false,busy=false,poisoned=false,rollbackUsed=false,closeFailed=false,closePromise,result,problem,hasProblem=false,cleanup='CLOSED';
 const close=()=>{if(!closePromise){closed=true;closePromise=closePhysical(client).catch(e=>{closeFailed=true;throw e})}return closePromise};
 const ready=()=>typeof client.getTransactionStatus==='function'&&client.readyForQuery===true&&client._queryable===true&&client._ending===false&&client.pipeline===false&&client._activeQuery==null&&Array.isArray(client._queryQueue)&&client._queryQueue.length===0&&Array.isArray(client._sentQueryQueue)&&client._sentQueryQueue.length===0;
 const ack=(r,command)=>{const d=r&&Object.getOwnPropertyDescriptor(r,'command');return !!d&&Object.hasOwn(d,'value')&&d.value===command};
 client.on('error',()=>{failed=true;poisoned=true;void close().catch(()=>{})});
 try{if(!['ORIGINAL177','WHOLE_SALES_V1'].includes(profile))throw Error('WHOLE_HOST_PROFILE_INVALID');reviewed=structuredClone(reviewed);target=structuredClone(target);if(!ready()||client.getTransactionStatus()!=='I')throw Error('WHOLE_CONNECTION_NOT_IDLE');let gateError,hasGateError=false;
  try{const start=await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');if(!ack(start,'BEGIN')||!ready()||client.getTransactionStatus()!=='T')throw Error('WHOLE_CATALOG_BEGIN_UNCERTAIN');const gateClient={async query(sql,values){if(!ready()||client.getTransactionStatus()!=='T'||failed)throw Error('WHOLE_CATALOG_WIRE_INVALID');const r=await client.query(sql,values);if(!ready()||client.getTransactionStatus()!=='T'||failed)throw Error('WHOLE_CATALOG_WIRE_INVALID');return r}};if(trustedPhysical)sessionClients.set(gateClient,sessionBinding);verified=await verifyCatalog(gateClient,spec,reviewed)}catch(e){gateError=e;hasGateError=true}
  try{if(!ready()||!['T','E'].includes(client.getTransactionStatus()))throw Error('WHOLE_CATALOG_ROLLBACK_UNCERTAIN');const r=await client.query('ROLLBACK');if(!ack(r,'ROLLBACK')||!ready()||client.getTransactionStatus()!=='I')throw Error('WHOLE_CATALOG_ROLLBACK_UNCERTAIN')}catch{throw Error('WHOLE_CATALOG_ROLLBACK_UNCERTAIN')}if(hasGateError)throw gateError;
  if(closed||failed)throw Error('WHOLE_CONNECTION_UNCERTAIN');validateStandardImportTarget(target);if(!target||target.protocol!=='STANDARD_IMPORT_SQL_V1'||target.system_identifier!==reviewed.system_identifier||target.database_oid!==reviewed.database_oid||target.database_name!==reviewed.database_name||target.catalog_sha256!==reviewed.catalog_sha256)throw Error('WHOLE_TARGET_BINDING_MISMATCH');
  const controlled=Object.freeze({async query(sql,values){const cleaning=sql==='ROLLBACK'&&poisoned&&!rollbackUsed;if(closed||failed||busy||(poisoned&&!cleaning)){poisoned=true;throw Error('WHOLE_CONNECTION_UNAVAILABLE')}try{values=ownedSqlParameters(values)}catch(error){poisoned=true;throw error}const salesRead=profile==='WHOLE_SALES_V1'&&sql==='SELECT * FROM naijue_erp.standard_zero_amount_archive_trace($1::uuid)'&&Array.isArray(values)&&values.length===1&&typeof values[0]==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(values[0]);if(!allowed.has(sql)&&!salesRead){poisoned=true;throw Error('WHOLE_SQL_NOT_ALLOWED')}try{checkApproval(sql,values)}catch(error){poisoned=true;throw error}if(!ready()){poisoned=true;throw Error('WHOLE_WIRE_STATE_INVALID')}const before=client.getTransactionStatus();if(sql.startsWith('BEGIN')?before!=='I':sql==='ROLLBACK'?!['T','E'].includes(before):before!=='T'){poisoned=true;throw Error('WHOLE_WIRE_STATE_INVALID')}if(cleaning)rollbackUsed=true;busy=true;try{const r=await client.query(sql,values);const after=client.getTransactionStatus(),expected=(sql==='COMMIT'||sql==='ROLLBACK')?'I':'T',command=sql.startsWith('BEGIN')?'BEGIN':sql==='COMMIT'?'COMMIT':sql==='ROLLBACK'?'ROLLBACK':sql.startsWith('SET ')?'SET':'SELECT';if(closed||failed||(poisoned&&!cleaning)||!ready()||after!==expected||!ack(r,command))throw Error('WHOLE_CONNECTION_UNCERTAIN');return r}catch(e){poisoned=true;throw e}finally{busy=false}},async discard(){failed=true;poisoned=true;await close()}});
  if(trustedPhysical)sessionClients.set(controlled,sessionBinding);result=await work(controlled,verified);if(!closed&&(!ready()||client.getTransactionStatus()!=='I'))throw Error('WHOLE_TRANSACTION_NOT_CLOSED');
 }catch(e){problem=e;hasProblem=true}finally{sessionBinding.active=false;try{await close()}catch{}if(closeFailed)cleanup='CLOSE_FAILED'}if(hasProblem){if(closeFailed)throw Error('WHOLE_CONNECTION_CLEANUP_FAILED');throw problem}return{result,cleanup}}


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
