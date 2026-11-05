import{source49ObservationRequest,SOURCE49_SUPPLEMENTAL_SQL}from'./execution-v2-admission.ts';
import type{Source49ExecutionClient,Source49CatalogObservation}from'../../packages/application/src/unified-import-execution-v2-client.ts';
import { STANDARD_IMPORT_PROTOCOL, UnifiedImportExecutionError, decodeStandardImportReply, validateStandardImportRequest, validateStandardImportTarget, standardImportTargetIdentity, decodeStandardImportVerification, REVIEWED_STANDARD44_TRANSITION, REVIEWED_STANDARD45_TRANSITION, REVIEWED_STANDARD46_TRANSITION, REVIEWED_STANDARD47_TRANSITION } from '../../packages/application/src/unified-import-execution.ts';
import type { StandardImportExecutionClient, StandardImportRequest, StandardImportReply, StandardImportTarget, StandardImportInspection, StandardImportSuccessorCapture, StandardImportSuccessorObservation } from '../../packages/application/src/unified-import-execution.ts';
import { findCredentialPath, parseStrictJson } from '../../packages/application/src/unified-import-contract.ts';
import { isNodeScryptPasswordHash } from '../../packages/authentication/src/passwords.ts';

/** Explicit already-controlled connection. Construction never connects, loads env,
 * creates a pool or assumes owner/LOGIN privileges. discard MUST quarantine it. */
export interface StandardImportPgClient {
  query(text:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[]}>;
  discard():void|Promise<void>;
}
export interface Source49CheckpointBinding {format_version:'STANDARD_IMPORT_SQL49_CHECKPOINT_BINDING_V1';plan_sha256:string;expected:ReadonlyMap<string,{sequence:number;cursor:number}>;}
export interface StandardImportPrivateInputs {sessionToken?:()=>string|Promise<string>;source49CheckpointBinding?:Source49CheckpointBinding;}
export class StandardImportTransportError extends UnifiedImportExecutionError {
  readonly outcome:'ROLLED_BACK'|'UNKNOWN'|'REJECTED';readonly operation_id:string|null;readonly sqlstate:string|null;
  constructor(outcome:'ROLLED_BACK'|'UNKNOWN'|'REJECTED',operationId:string|null,sqlstate:string|null=null){super(`STANDARD_IMPORT_${outcome}`);this.outcome=outcome;this.operation_id=operationId;this.sqlstate=sqlstate;}
}
const SQL=Object.freeze({
  inspect:'SELECT naijue_erp.standard_import_inspect_target($1::jsonb,$2::text)::text AS result_json',
  initialize:'SELECT naijue_erp.standard_initialize_current_admin($1::jsonb,$2::text)::text AS result_json',
  masterChunk:'SELECT naijue_erp.standard_import_master_chunk($1::jsonb,$2::text)::text AS result_json',
  baselineKeys:'SELECT naijue_erp.standard_import_baseline_keys($1::jsonb,$2::text)::text AS result_json',
  documentChunk:'SELECT naijue_erp.standard_import_document_chunk($1::jsonb,$2::text)::text AS result_json',
  publish:'SELECT naijue_erp.standard_publish_import($1::jsonb,$2::text)::text AS result_json',
  verify:'SELECT naijue_erp.standard_import_verify($1::jsonb,$2::text)::text AS result_json',
  status:'SELECT naijue_erp.standard_import_status($1::jsonb,$2::text)::text AS result_json',
});
/** Finite public-catalog observation, same projection/context as the installed
 * inspector. The supplied old definitions are INERT JSON values, never SQL. */
const successorCatalogMetadata=(definition:string)=>`jsonb_build_object(
 'routines',(SELECT jsonb_agg(jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid),p.proowner,coalesce(p.proacl::text,''),${definition}) ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace),
 'relations',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relowner,c.relrowsecurity,coalesce(c.relacl::text,'')) ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace='naijue_erp'::regnamespace),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(c.conname,c.conrelid::regclass::text,pg_get_constraintdef(c.oid),c.convalidated) ORDER BY c.oid) FROM pg_constraint c WHERE c.connamespace='naijue_erp'::regnamespace),
 'policies',(SELECT jsonb_agg(jsonb_build_array(p.polrelid::regclass::text,p.polname,p.polroles,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.oid) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='naijue_erp'::regnamespace))`;
export const REVIEWED_SUCCESSOR_CATALOG_SQL=`WITH input AS (SELECT $1::jsonb AS captures,$2::text AS unused_private), allowed(identity,oid) AS (VALUES
 ('naijue_erp.assert_standard_import_operation(uuid)','naijue_erp.assert_standard_import_operation(uuid)'::regprocedure::oid),
 ('naijue_erp.validate_baseline_source_commit()','naijue_erp.validate_baseline_source_commit()'::regprocedure::oid),
 ('naijue_erp.assert_document_conversion_batch(naijue_erp.import_batch,jsonb,text,boolean)','naijue_erp.assert_document_conversion_batch(naijue_erp.import_batch,jsonb,text,boolean)'::regprocedure::oid),
 ('naijue_erp.guard_retained_settlement_identity()','naijue_erp.guard_retained_settlement_identity()'::regprocedure::oid),
 ('naijue_erp.standard_import_command(jsonb,text,text)','naijue_erp.standard_import_command(jsonb,text,text)'::regprocedure::oid),
 ('naijue_erp.standard_import_verify(jsonb,text)','naijue_erp.standard_import_verify(jsonb,text)'::regprocedure::oid),
 ('naijue_erp.history_numeric_ledger_set_guard()','naijue_erp.history_numeric_ledger_set_guard()'::regprocedure::oid)),
 captures AS (SELECT a.identity,a.oid,c.value->>'predecessor_definition' AS definition FROM allowed a CROSS JOIN input i CROSS JOIN LATERAL jsonb_array_elements(i.captures)c WHERE c.value->>'routine_identity'=a.identity),
 metadata AS (SELECT ${successorCatalogMetadata('pg_get_functiondef(p.oid)')} AS actual,${successorCatalogMetadata("coalesce((SELECT c.definition FROM captures c WHERE c.oid=p.oid),pg_get_functiondef(p.oid))")} AS prior)
 SELECT jsonb_build_object('current_catalog_sha256',encode(sha256(convert_to(m.actual::text,'UTF8')),'hex'),'counterfactual_catalog_sha256',encode(sha256(convert_to(m.prior::text,'UTF8')),'hex'),
 'routines',(SELECT jsonb_agg(jsonb_build_object('routine_identity',c.identity,'function_oid',p.oid::text,'body_sha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'invariant_attributes_sha256',encode(sha256(convert_to((to_jsonb(p)-'prosrc')::text,'UTF8')),'hex')) ORDER BY c.identity) FROM captures c JOIN pg_proc p ON p.oid=c.oid))::text AS result_json FROM metadata m`;

/** Separate49 observer: old47 projection unchanged, plus independently pinned
 * trigger/columnACL/FORCE-RLS/policy-mode supplement; no caller override. */
const SOURCE49_CATALOG_SQL=`SELECT (observed.result_json::jsonb || jsonb_build_object('supplemental_sha256',encode(sha256(convert_to(supplement.extra,'UTF8')),'hex')))::text AS result_json FROM (${REVIEWED_SUCCESSOR_CATALOG_SQL}) observed CROSS JOIN (${SOURCE49_SUPPLEMENTAL_SQL}) supplement`;

/** Read textual JSONB before pg's default JSON.parse can round a numeric token.
 * Only canonical safe integer JSON numbers are allowed; money/quantity are strings. */
export function parseStandardImportWireJson(text:string):unknown {
  if(typeof text!=='string'||Buffer.byteLength(text)>16*1024*1024)throw new UnifiedImportExecutionError('SQL_RESPONSE_INVALID');
  for(let i=0;i<text.length;i++){
    if(text[i]==='"'){for(i++;i<text.length;i++){if(text[i]==='\\'){i++;continue;}if(text[i]==='"')break;}continue;}
    if(text[i]==='-'||/[0-9]/.test(text[i]!)){
      const match=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));
      if(!match||!(/^-?(?:0|[1-9][0-9]*)$/.test(match[0]))||match[0]==='-0'||BigInt(match[0])>BigInt(Number.MAX_SAFE_INTEGER)||BigInt(match[0])<BigInt(Number.MIN_SAFE_INTEGER))throw new UnifiedImportExecutionError('SQL_WIRE_NUMBER_NOT_SAFE_INTEGER');
      i+=match[0].length-1;
    }
  }
  return parseStrictJson(text);
}
/** Context-aware boundary check: opaque private values cannot be identified by
 * business-field names alone. Run before SQL and before any public journal write. */
export function assertPublicValuesExcludePrivateInputs(value:unknown,privateValues:readonly (string|null|undefined)[]):void {
  const secrets=privateValues.filter((v):v is string=>typeof v==='string'&&v.length>0);if(!secrets.length)return;
  const pending:{value:unknown;depth:number}[]=[{value,depth:0}];let count=0;
  while(pending.length){const item=pending.pop()!;if(item.depth>64||++count>5000000)throw new UnifiedImportExecutionError('PUBLIC_REQUEST_STRUCTURE_BOUND');
    if(typeof item.value==='string'){if(secrets.some(secret=>item.value!==null&&typeof item.value==='string'&&item.value.includes(secret)))throw new UnifiedImportExecutionError('PRIVATE_VALUE_IN_PUBLIC_REQUEST');}
    else if(Array.isArray(item.value))for(const child of item.value)pending.push({value:child,depth:item.depth+1});
    else if(item.value!==null&&typeof item.value==='object')for(const[key,child]of Object.entries(item.value)){if(secrets.some(secret=>key.includes(secret)))throw new UnifiedImportExecutionError('PRIVATE_VALUE_IN_PUBLIC_REQUEST');pending.push({value:child,depth:item.depth+1});}
  }
}
/** Finite parameterized entrypoints ONLY; no SQL, DML, DDL, actor JSON or ambient
 * DATABASE_URL escape hatch is exposed. Server rechecks live app authorization. */
export function createStandardImportClient(client:StandardImportPgClient,privateInputs:StandardImportPrivateInputs={}):Source49ExecutionClient {
  if(typeof client?.query!=='function'||typeof client.discard!=='function')throw new UnifiedImportExecutionError('EXPLICIT_CONTROLLED_PG_CLIENT_REQUIRED');
  const binding=privateInputs.source49CheckpointBinding;
  if(binding&&(binding.format_version!=='STANDARD_IMPORT_SQL49_CHECKPOINT_BINDING_V1'||!/^[a-f0-9]{64}$/.test(binding.plan_sha256)||!(binding.expected instanceof Map)))throw new UnifiedImportExecutionError('V2_CHECKPOINT_BINDING_INVALID');
  const boundPlanSha256=binding?.plan_sha256;
  const expected=binding?new Map([...binding.expected].map(([key,value])=>{if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(key)||Object.keys(value).sort().join(',')!=='cursor,sequence'||![value.sequence,value.cursor].every(n=>Number.isInteger(n)&&n>=0&&n<=2147483647))throw new UnifiedImportExecutionError('V2_CHECKPOINT_BINDING_INVALID');return[key,Object.freeze({...value})] as const;})):undefined;
  function boundWriteReply(v:unknown,r:StandardImportRequest):StandardImportReply {const reply=decodeStandardImportReply(v,r);if(binding&&reply.state==='COMMITTED'){const checkpoint=expected!.get(r.operation_id);if(r.plan_sha256!==boundPlanSha256||!checkpoint||reply.sequence!==checkpoint.sequence||reply.cursor!==checkpoint.cursor)throw new UnifiedImportExecutionError('V2_ORIGINAL_CHECKPOINT_MISMATCH');}return reply;}
  let quarantined=false,busy=false;
  async function token():Promise<string|null>{
    if(!privateInputs.sessionToken)return null;
    let value:string;try{value=await privateInputs.sessionToken();}catch{throw new UnifiedImportExecutionError('PRIVATE_SESSION_UNAVAILABLE');}
    if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))throw new UnifiedImportExecutionError('PRIVATE_SESSION_INVALID');return value;
  }
  async function invoke<T>(sql:string,request:unknown,secret:string|null,decode:(v:unknown)=>T,operationId:string|null,catalogScope=false):Promise<T>{
    if(quarantined||busy)throw new StandardImportTransportError('REJECTED',operationId);
    assertPublicValuesExcludePrivateInputs(request,[secret]);
    if(findCredentialPath(request))throw new UnifiedImportExecutionError('CREDENTIAL_IN_PUBLIC_REQUEST');
    const serialized=JSON.stringify(request);if(Buffer.byteLength(serialized)>8*1024*1024)throw new UnifiedImportExecutionError('SQL_REQUEST_TOO_LARGE');
    busy=true;let began=false,commitAttempted=false;
    try{
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');began=true;
      if(catalogScope)await client.query('SET LOCAL search_path=pg_catalog,naijue_erp');
      const result=await client.query(sql,[serialized,secret]);
      if(result.rows.length!==1||!Object.hasOwn(result.rows[0]!,'result_json'))throw new UnifiedImportExecutionError('SQL_RESPONSE_INVALID');
      const raw=parseStandardImportWireJson(result.rows[0]!.result_json as string),encoded=JSON.stringify(raw);
      if(findCredentialPath(raw)||(secret!==null&&encoded?.includes(secret)))throw new UnifiedImportExecutionError('PRIVATE_VALUE_IN_RESPONSE');
      const decoded=decode(raw);commitAttempted=true;await client.query('COMMIT');return decoded;
    }catch(error){
      const sqlstate=error!==null&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code)?error.code:null;
      if(began&&!commitAttempted){try{await client.query('ROLLBACK');throw new StandardImportTransportError('ROLLED_BACK',operationId,sqlstate);}catch(error){if(error instanceof StandardImportTransportError)throw error;}}
      quarantined=true;try{await client.discard();}catch{/* Quarantine remains in force even if physical close reports failure. */}
      throw new StandardImportTransportError('UNKNOWN',operationId,sqlstate);
    }finally{busy=false;}
  }
  async function call(method:Exclude<keyof typeof SQL,'inspect'|'initialize'|'verify'>,request:StandardImportRequest):Promise<StandardImportReply>{
    validateStandardImportRequest(request);const secret=await token();
    if(secret===null)throw new UnifiedImportExecutionError('PRIVATE_SESSION_REQUIRED');
    return invoke(SQL[method],request,secret,v=>{const reply=boundWriteReply(v,request);if(reply.state!=='COMMITTED')throw new UnifiedImportExecutionError('WRITE_RESPONSE_NOT_COMMITTED');return reply;},request.operation_id);
  }
  return Object.freeze({protocol:STANDARD_IMPORT_PROTOCOL,
    async inspectTarget(){return invoke(SQL.inspect,{protocol:STANDARD_IMPORT_PROTOCOL},await token(),v=>{const raw=v as StandardImportInspection;validateStandardImportTarget(standardImportTargetIdentity(raw));if(Object.keys(raw).sort().join(',')!=='catalog_sha256,current_user,database_name,database_oid,proof_scope,protocol,role_mode,session_user,system_identifier'||typeof raw.current_user!=='string'||typeof raw.session_user!=='string'||typeof raw.role_mode!=='string'||raw.proof_scope!=='SET_ROLE_ONLY_NOT_NONOWNER_LOGIN')throw new UnifiedImportExecutionError('TARGET_INSPECTION_INVALID');return raw;},null);},
    async inspectSuccessorCatalog(captures:readonly StandardImportSuccessorCapture[]){
      const ids=(captures?.length===3?REVIEWED_STANDARD44_TRANSITION:captures?.length===4?REVIEWED_STANDARD45_TRANSITION:captures?.length===6?REVIEWED_STANDARD46_TRANSITION:REVIEWED_STANDARD47_TRANSITION).routines.map(r=>r.routine_identity);
      if(!Array.isArray(captures)||captures.length!==ids.length||new Set(captures.map(c=>c.routine_identity)).size!==ids.length||captures.some(c=>!ids.includes(c.routine_identity)))throw new UnifiedImportExecutionError('SUCCESSOR_CAPTURE_SET_INVALID');
      assertPublicValuesExcludePrivateInputs(captures,[await token()]);
      return invoke(REVIEWED_SUCCESSOR_CATALOG_SQL,captures,null,v=>{
        if(v===null||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='counterfactual_catalog_sha256,current_catalog_sha256,routines')throw new UnifiedImportExecutionError('SUCCESSOR_OBSERVATION_INVALID');
        return v as StandardImportSuccessorObservation;
      },null,true);
    },
    async inspectSource49Catalog(capture:StandardImportSuccessorCapture){const captures=source49ObservationRequest(capture);assertPublicValuesExcludePrivateInputs(captures,[await token()]);return invoke(SOURCE49_CATALOG_SQL,captures,null,v=>v as Source49CatalogObservation,null,true);},
    async initialize(request:StandardImportRequest,encodedScryptPrivate:string){validateStandardImportRequest(request);if(!isNodeScryptPasswordHash(encodedScryptPrivate))throw new UnifiedImportExecutionError('PRIVATE_CREDENTIAL_FORMAT_INVALID');return invoke(SQL.initialize,request,encodedScryptPrivate,v=>{const reply=boundWriteReply(v,request);if(reply.state!=='COMMITTED')throw new UnifiedImportExecutionError('WRITE_RESPONSE_NOT_COMMITTED');return reply;},request.operation_id);},
    masterChunk:(r:StandardImportRequest)=>call('masterChunk',r),baselineKeys:(r:StandardImportRequest)=>call('baselineKeys',r),documentChunk:(r:StandardImportRequest)=>call('documentChunk',r),publish:(r:StandardImportRequest)=>call('publish',r),
    async verify(r:StandardImportRequest){validateStandardImportRequest(r);const secret=await token();if(secret===null)throw new UnifiedImportExecutionError('PRIVATE_SESSION_REQUIRED');return invoke(SQL.verify,r,secret,v=>decodeStandardImportVerification(v,r),r.operation_id);},
    async status(r:StandardImportRequest){validateStandardImportRequest(r);return invoke(SQL.status,r,await token(),v=>decodeStandardImportReply(v,r),r.operation_id);},
  });
}

export interface StandardImportConnectionConfig {
  format_version:'STANDARD_IMPORT_CONNECTION_V1';scope:'ISOLATED_SET_ROLE_PROOF'|'PRODUCTION_NONOWNER_LOGIN';
  host:'127.0.0.1';port:57403;database:string;user:string;password:string;
  role:'erp_unified27_initializer_2393dbc6db9581c2'|'erp_unified27_importer_2393dbc6db9581c2';
}
export function validateStandardImportConnectionConfig(value:unknown):StandardImportConnectionConfig {
  if(value===null||typeof value!=='object'||Array.isArray(value))throw new UnifiedImportExecutionError('PRIVATE_CONNECTION_CONFIG_INVALID');
  const c=value as Record<string,unknown>;
  if(Object.keys(c).sort().join(',')!=='database,format_version,host,password,port,role,scope,user'||c.format_version!=='STANDARD_IMPORT_CONNECTION_V1'||!['ISOLATED_SET_ROLE_PROOF','PRODUCTION_NONOWNER_LOGIN'].includes(String(c.scope))||c.host!=='127.0.0.1'||c.port!==57403||c.database!=='opt03_synthetic_profile_20261102_v1'||typeof c.user!=='string'||c.user.length===0||typeof c.password!=='string'||!['erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2'].includes(String(c.role)))throw new UnifiedImportExecutionError('PRIVATE_CONNECTION_CONFIG_INVALID');
  if(c.scope!=='ISOLATED_SET_ROLE_PROOF')throw new UnifiedImportExecutionError('PRODUCTION_LOGIN_PROFILE_UNVERIFIED');
  return c as unknown as StandardImportConnectionConfig;
}
/** The current user grant names an isolated SYNTHETIC target, not a route for
 * real business data or a production capability. */
export function assertStandardImportPackageScope(packageKind:'REAL'|'SYNTHETIC',scope:StandardImportConnectionConfig['scope']):void {
  if(scope!=='ISOLATED_SET_ROLE_PROOF')throw new UnifiedImportExecutionError('PRODUCTION_LOGIN_PROFILE_UNVERIFIED');
  if(packageKind!=='SYNTHETIC')throw new UnifiedImportExecutionError('REAL_DATA_NOT_AUTHORIZED_FOR_TEST_SCOPE');
}
/** Actual current protected-role facts only; not a claim about parent session
 * ability to RESET/SET ROLE. NOLOGIN SET ROLE proof remains separately labelled. */
export function assertStandardImportRoleFacts(value:unknown,role:StandardImportConnectionConfig['role']):void {
  const f=value as Record<string,unknown>|null;
  if(!f||f.server_version_num!=='170011'||f.role_name!==role||f.rolsuper!==false||f.rolcanlogin!==false||f.rolcreaterole!==false||f.rolcreatedb!==false||f.rolbypassrls!==false||f.rolinherit!==false||f.rolreplication!==false||f.rolconnlimit!==0||f.owns_schema!==false||f.owns_database!==false||f.schema_create!==false||f.table_writes!==false)throw new UnifiedImportExecutionError('PROTECTED_ROLE_PROFILE_UNVERIFIED');
}
/** pg emits idle socket failures as EventEmitter 'error', outside a query's
 * rejection path. Consume without retaining/logging the raw private error, fence
 * subsequent calls, and physically discard once. */
export function installStandardImportTransportErrorHandler(connection:{on(event:'error',listener:(error:unknown)=>void):void},discard:()=>void|Promise<void>):()=>boolean {
  let failed=false;
  connection.on('error',()=>{if(failed)return;failed=true;void Promise.resolve().then(discard).catch(()=>undefined);});
  return()=>failed;
}
/** Explicit local-test connector. No production capability is minted by SET ROLE.
 * Caller must supply a reviewed birth/catalog target pin and a private config. */
export async function connectStandardImportClient(config:StandardImportConnectionConfig,target:StandardImportTarget,privateInputs:StandardImportPrivateInputs={}):Promise<{client:Source49ExecutionClient;close:()=>Promise<void>}> {
  validateStandardImportConnectionConfig(config);validateStandardImportTarget(target);
  if(target.system_identifier!=='7703451823620812828'||target.database_name!==config.database)throw new UnifiedImportExecutionError('TARGET_DATABASE_MISMATCH');
  if(Object.keys(process.env).some(k=>k==='DATABASE_URL'||/^PG[A-Z_]+$/.test(k)))throw new UnifiedImportExecutionError('AMBIENT_DATABASE_CONFIGURATION_PROHIBITED');
  const {Client}=await import('pg');
  const pg=new Client({host:config.host,port:config.port,database:config.database,user:config.user,password:()=>config.password,ssl:false,application_name:'unified-standard-import-isolated-proof',connectionTimeoutMillis:5000,statement_timeout:30000,query_timeout:35000,lock_timeout:5000,options:'-c search_path=pg_catalog'});
  let closed=false;
  const close=async()=>{if(!closed){closed=true;await pg.end();}};
  const transportFailed=installStandardImportTransportErrorHandler({on:(_event,listener)=>{pg.on('error',listener);}},close);
  try{
    await pg.connect();
    // Exact finite protected identities, never untrusted identifier interpolation.
    if(config.role==='erp_unified27_initializer_2393dbc6db9581c2')await pg.query('SET ROLE erp_unified27_initializer_2393dbc6db9581c2');
    else await pg.query('SET ROLE erp_unified27_importer_2393dbc6db9581c2');
    const facts=await pg.query("SELECT current_setting('server_version_num') AS server_version_num, current_user AS role_name, r.rolsuper, r.rolcanlogin, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolinherit, r.rolreplication, r.rolconnlimit, EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='naijue_erp' AND n.nspowner=r.oid) OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp' AND c.relowner=r.oid) AS owns_schema, EXISTS (SELECT 1 FROM pg_catalog.pg_database d WHERE d.datname=current_database() AND d.datdba=r.oid) AS owns_database, has_schema_privilege(current_user,'naijue_erp','CREATE') AS schema_create, EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp' AND has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS table_writes FROM pg_catalog.pg_roles r WHERE r.rolname=current_user");
    if(facts.rows.length!==1)throw new UnifiedImportExecutionError('PROTECTED_ROLE_PROFILE_UNVERIFIED');
    assertStandardImportRoleFacts(facts.rows[0],config.role);
    const client=createStandardImportClient({query:async(sql,values)=>{if(transportFailed())throw new UnifiedImportExecutionError('CONTROLLED_TRANSPORT_UNAVAILABLE');return{rows:(await pg.query(sql,values)).rows as Record<string,unknown>[]};},discard:close},privateInputs);
    const actual=await client.inspectTarget();if(actual.role_mode!==config.role||actual.proof_scope!=='SET_ROLE_ONLY_NOT_NONOWNER_LOGIN'||actual.system_identifier!==target.system_identifier||actual.database_oid!==target.database_oid||actual.database_name!==target.database_name||actual.catalog_sha256!==target.catalog_sha256)throw new UnifiedImportExecutionError('TARGET_PROFILE_UNVERIFIED');
    return{client,close};
  }catch{try{await close();}catch{}throw new UnifiedImportExecutionError('TARGET_PROFILE_UNVERIFIED');}
}
