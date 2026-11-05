/** T45-owned execution only. D1 prepares this entry without connecting to PG.
 * No fixture mutation, substitute authorizer, owner business execution or retry. */
import {readFile,lstat,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

export const V22_BODY_SHA256='8a8374fb193ed9e5ddcc388b0141a91dc17420cef0baee4ffbb700cd9737add5';
const SOURCE_SQL_SHA256='980c4f58dd7fc92290ab104d0253880fa25937a33ac643f5858e2368dd1a5750';
const PROFILE='26_v22_staged_prefix_bind_from_v20';
const GROUPS=['history_sales_header','history_transfer_header','history_transfer_line','product','sku','barcode_scheme','import_sku_alias','import_stock_contributor','import_record'];
export const EMPTY_TABLES22=Object.freeze(['history_sales_line','history_sales_settlement','sales_header','sales_line','sales_settlement','transfer_header','transfer_line','sku_barcode','product_image','inventory_ledger','inventory_balance','import_history_closure_manifest','import_history_document_manifest','payment_method','payment_account','payment_account_hall','history_revision']);
function must(ok,code){if(!ok)throw Object.assign(Error(code),{code});}
const sha=b=>createHash('sha256').update(b).digest('hex');
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const plain=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value');});
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const equal=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
export function sourceOnlyDatabaseGate22(){return Object.freeze({ready(){throw Object.assign(Error('QA_ORIGINAL_SOURCE_DATABASE_ACCESS_PROHIBITED'),{code:'QA_ORIGINAL_SOURCE_DATABASE_ACCESS_PROHIBITED'});}});}
const code=e=>typeof e?.code==='string'&&/^[A-Z0-9_]{1,96}$/.test(e.code)?e.code:'QA_ORIGINAL_CONSUMER_ERROR';
// Frozen adapter static messages only. Emit categories, never original text or
// stack. No getters, nested causes, dynamic suffixes or arbitrary field names.
const prefixReasons22=new Map([
 ['Exact own-data private prefix fields required','INPUT_BINDING'],
 ['Explicit source-owned capture method required','INPUT_BINDING'],
 ['Exact source-approved command, batch and preparation required','INPUT_BINDING'],
 ['Five original source groups, original SKU records and exact six schemes required','INPUT_BINDING'],
 ['Exact ordered original source streams required','STREAM_VALIDATION'],
 ['Wrong prefix stream relation','STREAM_VALIDATION'],
 ['Original canonical prefix row key required','STREAM_VALIDATION'],
 ['Original bounded prefix row required','STREAM_VALIDATION'],
 ['No foreign batch prefix member','STREAM_VALIDATION'],
 ['No foreign SKU source record','STREAM_VALIDATION'],
 ['Wrong source group entity','STREAM_VALIDATION'],
 ['Complete original SKU record required','STREAM_VALIDATION'],
 ['Original SKU review UTC time required','STREAM_VALIDATION'],
 ['No missing approved prefix group','STREAM_VALIDATION'],
 ['Original canonical SKU records required','STREAM_VALIDATION'],
 ['Every expected prefix member must match one actual row','ROW_COUNT'],
 ['Missing or duplicate actual prefix member','MISSING_DUPLICATE'],
 ['All approved prefix members required','MISSING_DUPLICATE'],
 ['Actual complete prefix projection differs from approved source','COMPLETE_PROJECTION'],
 ['Original committed source-approved six-scheme initialization required','SCHEME_RECEIPT']
]);
export function safePrefixReason22(error){
 const own=k=>{const d=error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,k):undefined;return d&&Object.hasOwn(d,'value')?d.value:undefined;};
 return {reason:own('name')==='DomainError'&&own('code')==='CORE_STAGED_PREFIX_MISMATCH'
  &&typeof own('message')==='string'?(prefixReasons22.get(own('message'))??'UNKNOWN'):'UNKNOWN'};
}
/** QA raw driver observation BEFORE the real issuer leases are created. Never
 * wraps/replaces an issuer lease, SQL, values, returned object or error. */
export function createPrefixProjectionObserver22(codec){
 const relations=new Set(['import_source_row',...GROUPS.filter(t=>t!=='import_record'),'import_record']);
 const groups={history_sales_header:'HEADERS',history_transfer_header:'HEADERS',history_transfer_line:'TRANSFER_LINES',product:'PRODUCTS',sku:'SKUS',import_sku_alias:'SKUS',import_stock_contributor:'STOCK_CONTRIBUTORS',barcode_scheme:'SCHEMES',import_record:'SKU_RECORDS'};
 const entities={SALES_HEADER:'HEADERS',TRANSFER_HEADER:'HEADERS',TRANSFER_LINE:'TRANSFER_LINES',PRODUCT:'PRODUCTS',SKU:'SKUS',INVENTORY_BASELINE:'STOCK_CONTRIBUTORS'};
 const recordFields=['id','import_batch_id','source_entity_type','source_key','source_record_hash','source_file_ref','target_type','target_id','status','decision_reason','reviewed_at'];
 const specs=new Map(codec.historyClosureProjectionSpec26().map(s=>[s.relation,s.columns]));
 const attached=new WeakSet();let first,batchOrdinal=0,unavailable=false;
 function project(relation,value){
  if(relation!=='import_record')return codec.historyClosureProjectionRow26(relation,value);
  must(plain(value,recordFields)&&recordFields.every(k=>typeof value[k]==='string')&&value.source_entity_type==='SKU'&&value.target_type==='SKU'&&value.status==='IMPORTED','QA_OBSERVER_CANONICAL_RECORD_REQUIRED');
  codec.encodeHistoryClosureValue(value);
  const stamp=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/.exec(value.reviewed_at);
  must(stamp&&Number.isFinite(Date.parse(value.reviewed_at)),'QA_OBSERVER_CANONICAL_RECORD_REQUIRED');
  return {relation,key:value.id,projection:{...value,reviewed_at:`${stamp[1]}.${(stamp[2]??'').padEnd(6,'0')}Z`}};
 }
 function inspect(relation,expected,result,ordinal){
  if(first||!Array.isArray(result?.rows)||result.rows.length!==expected.length)return;
  const byKey=new Map(expected.map(e=>[e.key,e]));
  for(let index=0;index<result.rows.length;index++){
   const actual=result.rows[index],e=byKey.get(actual.key);if(actual.present!==true||!e)continue;
   const row=project(relation,actual.projection),expectedSha256=codec.historyClosureRowHash(e),actualSha256=codec.historyClosureRowHash(row);
   if(row.key!==actual.key||expectedSha256!==actualSha256){
    const fields=relation==='import_record'?recordFields:specs.get(relation);must(fields,'QA_OBSERVER_FINITE_FIELDS_REQUIRED');
    const group=relation==='import_source_row'?entities[e.projection?.entity_type]:groups[relation];
    first={group:group??'UNKNOWN',segment:relation==='import_source_row'?'source':'typed',relation,batchOrdinal:ordinal,rowIndex:index,
     keyEquality:row.key===actual.key,fields:fields.filter(k=>!codec.encodeHistoryClosureValue(e.projection[k]).equals(codec.encodeHistoryClosureValue(row.projection[k]))),
     expectedSha256,actualSha256};return;
   }
   byKey.delete(actual.key);
  }
 }
 return Object.freeze({
  attachRawClient(raw){
   if(attached.has(raw))return raw;const query=raw.query;must(typeof query==='function','QA_OBSERVER_RAW_QUERY_REQUIRED');
   // Nonmatching calls preserve the original return value synchronously too.
   raw.query=function(...args){
    const match=typeof args[0]==='string'?/^\/\* core-prefix22:members:([a-z_]+) \*\//.exec(args[0]):null;
    if(!match||!relations.has(match[1])||first)return Reflect.apply(query,this,args);
    const ordinal=++batchOrdinal;let expected;
    try{must(Array.isArray(args[1])&&args[1].length===1&&typeof args[1][0]==='string','QA_OBSERVER_FIXED_QUERY_REQUIRED');expected=JSON.parse(args[1][0]);
     must(Array.isArray(expected)&&expected.length<=128,'QA_OBSERVER_FIXED_QUERY_REQUIRED');}catch{unavailable=true;}
    const returned=Reflect.apply(query,this,args);
    if(returned&&typeof returned.then==='function'){
     // Observe the same promise; returning it leaves rejection identity/order
     // and issuer failure handling unchanged. Observer exceptions stay local.
     returned.then(result=>{if(expected)try{inspect(match[1],expected,result,ordinal);}catch{unavailable=true;}},()=>{}).catch(()=>{unavailable=true;});
    }else if(expected)try{inspect(match[1],expected,returned,ordinal);}catch{unavailable=true;}
    return returned;
   };attached.add(raw);return raw;
  },
  snapshot(){return first?structuredClone(first):{status:unavailable?'OBSERVATION_UNAVAILABLE':'NO_COMPLETE_PROJECTION_MISMATCH_OBSERVED'};}
 });
}
function ref(v){must(plain(v,['path','bytes','sha256'])&&isAbsolute(v.path)&&Number.isSafeInteger(v.bytes)&&v.bytes>0&&v.bytes<=4194304&&digest(v.sha256),'QA_EXACT_FILE_REF_REQUIRED');return v;}
async function pinned(v){ref(v);const before=await lstat(v.path);must(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&(before.mode&0o077)===0,'QA_PRIVATE_REGULAR_FILE_REQUIRED');const b=await readFile(v.path);const after=await lstat(v.path);must(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&b.length===v.bytes&&sha(b)===v.sha256,'QA_FILE_CHANGED');return b;}
async function json(v){return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await pinned(v)));}
async function independent(r){must(r?.result==='PASS','QA_CURRENT_INDEPENDENT_REVIEW_REQUIRED');await pinned({path:r.path,bytes:(await lstat(r.path)).size,sha256:r.sha256});}
function tuple(t){
 must(plain(t,['database','databaseOid','ownerRole','actingRole','sessionUser','serverAddress','serverPort','postmasterStart','systemIdentifier','socketDirectory'])
  &&(t.database==='erp_rewrite_20261022_r1'||/^naijue_erp_test_v22_[a-z0-9_]+$/.test(t.database))&&/^[1-9][0-9]*$/.test(t.databaseOid)
  &&t.ownerRole==='erp_rewrite_owner_20261022'&&t.actingRole==='erp_rewrite_runtime_20261022'&&t.sessionUser===t.actingRole
  &&t.serverAddress===null&&t.serverPort===null&&typeof t.postmasterStart==='string'&&Number.isFinite(Date.parse(t.postmasterStart))
  &&Date.parse(t.postmasterStart)!==Date.parse('2026-10-04 08:16:07.895273+00')&&/^[1-9][0-9]{1,24}$/.test(t.systemIdentifier)
  &&typeof t.socketDirectory==='string'&&isAbsolute(t.socketDirectory),'QA_ACTUAL_ISOLATED_V20_TUPLE_REQUIRED');
 return t;
}
function reviewMatches(r,t,profile){
 must(r?.version==='C_NATIVE_RUNTIME26_REVIEW_V1'&&r.decision==='ACCEPT_EXACT_RUNTIME26_TARGET_METADATA'&&r.scope==='EXACT_TARGET_METADATA_ONLY'
  &&r.realImportExecutionAuthorized===false&&r.catalog?.format==='EXACT26_RUNTIME_CATALOG_EXPORT_V1'&&r.catalog.patchLevel===profile&&digest(r.catalog.sha256)
  &&r.target?.database===t.database&&r.target.databaseOid===t.databaseOid&&r.target.actingRole===t.actingRole&&r.target.sessionUser===t.sessionUser
  &&r.target.serverAddress===null&&r.target.serverPort===null&&r.target.postmasterStart===t.postmasterStart&&r.independentReview?.result==='PASS','QA_CURRENT_INDEPENDENT_REVIEW_REQUIRED');
}
export function validateQaPrefixPlan(p,at=Date.now()){
 must(plain(p,['version','registrationId','deadlineUtc','operation','qaTuple','qaConnection','qaRuntimeReview','sourceRoot','sourceSql','parentReview','hostJob','firstBind','modules','authority','fixture','outputDirectory'])
  &&p.version==='C_V22_QA_PREFIX_BIND_PLAN_V1'&&/^[a-zA-Z0-9_.-]{1,120}$/.test(p.registrationId)
  &&typeof p.deadlineUtc==='string'&&p.deadlineUtc.endsWith('Z')&&Number.isFinite(Date.parse(p.deadlineUtc))&&Date.parse(p.deadlineUtc)>at
  &&['PREPARE_INSTALLER','RUN_FIRST_BIND','READ_ORIGINAL_KEY','READONLY_PREFIX_ADAPTER'].includes(p.operation)&&isAbsolute(p.sourceRoot)&&isAbsolute(p.outputDirectory),'QA_EXACT_REGISTRATION_REQUIRED');
 tuple(p.qaTuple);ref(p.sourceSql);ref(p.authority);ref(p.fixture);
 must(p.sourceSql.path===join(p.sourceRoot,'adapters/postgres/patches/0026-v22-staged-prefix-bind.sql')&&p.sourceSql.sha256===SOURCE_SQL_SHA256,'QA_FROZEN_SQL_REQUIRED');
 if(p.operation==='PREPARE_INSTALLER')ref(p.parentReview);
 else{ref(p.hostJob);ref(p.firstBind);ref(p.qaRuntimeReview);must(plain(p.modules,['host','provider','store','issuer','adapter']),'QA_ORIGINAL_CONSUMERS_REQUIRED');
  const paths={host:'scripts/import-v3/production-source-host.mjs',provider:'scripts/import-v3/production-source-provider26.mjs',store:'adapters/postgres/src/inventory-cutoff-import-store.ts',issuer:'adapters/postgres/src/native-import-accounting-capability.ts',adapter:'adapters/postgres/src/native-core-staged-prefix-bind.ts'};
  for(const [k,path]of Object.entries(paths)){ref(p.modules[k]);must(p.modules[k].path===join(p.sourceRoot,path),'QA_ORIGINAL_CONSUMERS_REQUIRED');}
  must(plain(p.qaConnection,['port','statementTimeoutMs'])&&Number.isInteger(p.qaConnection.port)&&p.qaConnection.port>0&&p.qaConnection.port<=65535
   &&Number.isSafeInteger(p.qaConnection.statementTimeoutMs)&&p.qaConnection.statementTimeoutMs>0&&p.qaConnection.statementTimeoutMs<=2147483647,'QA_EXACT_CONNECTION_REQUIRED');}
 return p;
}
/** Pure derivation only. Caller cannot pass new body text or erase parent checks. */
export function deriveQaInstaller(source,t){
 tuple(t);must(sha(Buffer.from(source))===SOURCE_SQL_SHA256,'QA_FROZEN_SQL_REQUIRED');
 const parts=source.split('$v22$');must(parts.length===3&&sha(Buffer.from(parts[1]))===V22_BODY_SHA256,'QA_SAME_BUSINESS_BODY_REQUIRED');
 let prefix=parts[0];
 for(const [before,after]of [["current_database()<>'erp_rewrite_20261022_r1'",`current_database()<>'${t.database}'`],
  ["datname=current_database())<>'1027659'",`datname=current_database())<>'${t.databaseOid}'`],
  ["pg_postmaster_start_time()<>'2026-10-04 08:16:07.895273+00'::timestamptz",`pg_postmaster_start_time()<>'${t.postmasterStart.replaceAll("'","''")}'::timestamptz`]]){
  must(prefix.split(before).length===2,'QA_EXACT_PARENT_REPLACEMENT_REQUIRED');prefix=prefix.replace(before,after);
 }
 const sql=[prefix,parts[1],parts[2]].join('$v22$');must(sha(Buffer.from(sql.split('$v22$')[1]))===V22_BODY_SHA256,'QA_SAME_BUSINESS_BODY_REQUIRED');return sql;
}
async function authority(p){
 const a=await json(p.authority),f=await json(p.fixture);
 must(a.version==='C_V22_QA_PREFIX_BIND_AUTHORITY_V1'&&a.decision==='ACCEPT_EXACT_ISOLATED_QA_OPERATION'
  &&a.registrationId===p.registrationId&&a.deadlineUtc===p.deadlineUtc&&a.operation===p.operation&&equal(a.qaTuple,p.qaTuple)
  &&a.outputDirectory===p.outputDirectory&&equal(a.sourceSql,p.sourceSql)&&equal(a.fixture,p.fixture)
  &&equal(a.hostJob,p.hostJob)&&equal(a.firstBind,p.firstBind)&&equal(a.modules,p.modules)&&equal(a.parentReview,p.parentReview)&&equal(a.qaRuntimeReview,p.qaRuntimeReview)&&equal(a.qaConnection,p.qaConnection)
  &&/^[1-9][0-9]{1,24}$/.test(a.originalSystemIdentifier)&&a.originalSystemIdentifier!==p.qaTuple.systemIdentifier
  &&a.originalSourceDatabaseAccess==='PROHIBITED'&&a.scope==='QA_STORE_ONLY_ORIGINAL_SOURCE_IDENTITY_RETAINED','QA_C_AUTHORITY_REQUIRED');
 must(f.version==='T45_V22_QA_PREFIX_FIXTURE_EVIDENCE_V1'&&f.registrationId===p.registrationId&&equal(f.qaTuple,p.qaTuple)
  &&['EXACT_PREFIX_SUCCESS','SOURCE_OR_NATIVE_MISMATCH','FORBIDDEN_TABLE_EFFECT','UNKNOWN_COMMIT_READBACK','READONLY_PREFIX_ADAPTER'].includes(f.scenario),'QA_ACTUAL_FIXTURE_EVIDENCE_REQUIRED');
 if(p.operation==='READONLY_PREFIX_ADAPTER')must(f.scenario==='READONLY_PREFIX_ADAPTER','QA_READONLY_PREFIX_SCOPE_REQUIRED');
 if(f.scenario==='FORBIDDEN_TABLE_EFFECT')must(EMPTY_TABLES22.includes(f.affectedRelation),'QA_FIXED17_TABLE_REQUIRED');
 if(f.scenario==='SOURCE_OR_NATIVE_MISMATCH')must(GROUPS.includes(f.affectedRelation),'QA_FIXED_PREFIX_RELATION_REQUIRED');
 if(p.operation==='READ_ORIGINAL_KEY'){must(f.scenario==='UNKNOWN_COMMIT_READBACK'&&f.priorAttempt,'QA_PRIOR_UNKNOWN_ATTEMPT_REQUIRED');const prior=await json(f.priorAttempt);must(prior.registrationId&&equal(prior.qaTuple,p.qaTuple)&&prior.outcome==='FAILED_OUTCOME_UNVERIFIED'&&equal(prior.firstBind,p.firstBind),'QA_PRIOR_UNKNOWN_ATTEMPT_REQUIRED');}
 else must(f.scenario!=='UNKNOWN_COMMIT_READBACK','QA_UNKNOWN_IS_READONLY_NO_REEXECUTION');
 return f;
}
export async function prepareQaPrefixInstaller(original){
 const p=validateQaPrefixPlan(original);must(p.operation==='PREPARE_INSTALLER','QA_INSTALLER_OPERATION_REQUIRED');await authority(p);
 const parent=await json(p.parentReview);reviewMatches(parent,p.qaTuple,'26_v20_history_insert_identity_from_v19');await independent(parent.independentReview);
 const sql=deriveQaInstaller((await pinned(p.sourceSql)).toString('utf8'),p.qaTuple);
 await mkdir(p.outputDirectory,{recursive:true,mode:0o700});const path=join(p.outputDirectory,'EXACT-QA-INSTALLER.sql');await writeFile(path,sql,{flag:'wx',mode:0o600});
 return{status:'PREPARED_EXACT_QA_INSTALLER_NOT_EXECUTED',registrationId:p.registrationId,qaTuple:p.qaTuple,bodySha256:V22_BODY_SHA256,installer:{path,bytes:Buffer.byteLength(sql),sha256:sha(Buffer.from(sql))},databaseConnected:false,guardOrAclChanged:false};
}
/** Actual original issuer pool only in the real entry; scripted clients in unit tests.
 * Fixed SELECTs, explicit RRRO+ROLLBACK. No business function or row lock. */
export async function readQaOriginalKey(pool,runtime,t,command,commandHash){
 tuple(t);must(uuid(command.actorAccountId)&&uuid(command.batchId)&&typeof command.requestKey==='string'&&digest(commandHash),'QA_ORIGINAL_KEY_REQUIRED');
 const c=await pool.connect();let began=false,discard;
 try{await runtime.assertReady(c,'IMPORT_STAGE');await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;
  const ids=(await c.query(`/* v22-qa:identity */ SELECT current_database()::text database,(SELECT oid::text FROM pg_database WHERE datname=current_database()) database_oid,
   current_user::text acting_role,session_user::text session_user,inet_server_addr()::text server_address,inet_server_port() server_port,
   pg_postmaster_start_time()::text postmaster_start,current_setting('transaction_read_only') readonly`)).rows;
  const i=ids[0];must(ids.length===1&&i.database===t.database&&i.database_oid===t.databaseOid&&i.acting_role===t.actingRole&&i.session_user===t.sessionUser
   &&i.server_address===null&&i.server_port===null&&i.postmaster_start===t.postmasterStart&&i.readonly==='on','QA_ACTUAL_READBACK_TARGET_MISMATCH');
  const receipts=(await c.query(`/* v22-qa:original-key */ SELECT r.id,r.request_hash,r.action,r.target_type,r.target_id,r.status,
   (SELECT count(*)::integer FROM naijue_erp.audit_change a WHERE a.operation_id=r.id) audit_count,
   (SELECT count(*)::integer FROM naijue_erp.audit_change a WHERE a.operation_id=r.id AND a.actor_account_id=r.actor_account_id AND a.object_type='IMPORT'
    AND a.object_id=r.target_id AND a.action=r.action AND a.after_values->>'phase'='FULL_SOURCE_BOUND_V1'
    AND a.after_values->'stagedPrefixProof'->>'version'='CORE_STAGED_PREFIX_BIND_V22') exact_prefix_audit_count
   FROM naijue_erp.operation_receipt r WHERE r.actor_account_id=$1::uuid AND r.request_key=$2`,[command.actorAccountId,command.requestKey])).rows;
  must(receipts.length<=1&&receipts.every(r=>r.request_hash===commandHash&&r.action==='IMPORT_BIND_FULL_SOURCE'&&r.target_type==='IMPORT'
   &&r.target_id===command.batchId&&r.status==='COMMITTED'&&r.audit_count===1&&r.exact_prefix_audit_count===1),'QA_ORIGINAL_RECEIPT_MISMATCH');
  const batches=(await c.query(`/* v22-qa:checkpoint */ SELECT status,(checkpoint->>'sequence')::integer sequence,(checkpoint->>'cursor')::integer cursor,
   history_payload_hash IS NOT NULL AS full_bound FROM naijue_erp.import_batch WHERE id=$1::uuid`,[command.batchId])).rows;
  must(batches.length===1,'QA_ORIGINAL_BATCH_MISSING');began=false;await c.query('ROLLBACK');
  return{receipts,batch:batches[0],rollbackReturned:true,prefixFullContentsUnchanged:'NOT_INFERRED_FROM_METADATA',automaticReplay:false};
 }catch(e){discard=e;if(began){began=false;try{await c.query('ROLLBACK');}catch{throw Object.assign(Error('QA_READBACK_ROLLBACK_UNKNOWN'),{code:'QA_READBACK_ROLLBACK_UNKNOWN'});}}throw e;}
 finally{c.release(discard);}
}
/** Actual per-member production adapter reads plus complete set coverage within
 * one RRRO snapshot. This never invokes BIND, a business guard, or COMMIT. */
export async function readQaPrefixAdapter22({pool,runtime,target,command,authority,verifyPrefix}){
 tuple(target);must(command.action==='IMPORT_BIND_FULL_SOURCE'&&typeof authority?.capture==='function'&&typeof verifyPrefix==='function','QA_ORIGINAL_PREFIX_PORT_REQUIRED');
 const c=await pool.connect();let began=false,discard;
 try{
  await runtime.assertReady(c,'IMPORT_STAGE');await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;
  const rows=(await c.query(`/* v22-qa:prefix-identity */ SELECT current_database()::text database,(SELECT oid::text FROM pg_database WHERE datname=current_database()) database_oid,
   current_user::text acting_role,session_user::text session_user,inet_server_addr()::text server_address,inet_server_port() server_port,
   pg_postmaster_start_time()::text postmaster_start,current_setting('transaction_read_only') readonly`)).rows;
  const i=rows[0];must(rows.length===1&&i.database===target.database&&i.database_oid===target.databaseOid&&i.acting_role===target.actingRole&&i.session_user===target.sessionUser
   &&i.server_address===null&&i.server_port===null&&i.postmaster_start===target.postmasterStart&&i.readonly==='on','QA_ACTUAL_READBACK_TARGET_MISMATCH');
  const batches=(await c.query(`/* v22-qa:prefix-batch */ SELECT source_name,source_hash,to_char(cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cutoff_at,
   status,history_payload_hash,history_expected_counts,(checkpoint->>'sequence')::integer sequence,(checkpoint->>'cursor')::integer cursor
   FROM naijue_erp.import_batch WHERE id=$1::uuid`,[command.batchId])).rows;
  const batch=batches[0];must(batches.length===1&&batch.status==='STAGED'&&batch.history_payload_hash===null&&batch.history_expected_counts===null
   &&batch.sequence===command.expectedSequence&&batch.cursor===command.expectedCursor,'QA_UNBOUND_ORIGINAL_CHECKPOINT_REQUIRED');
  const proof=await verifyPrefix(c,command,{source_name:batch.source_name,source_hash:batch.source_hash,cutoff_at:batch.cutoff_at},authority);
  // Unique expected keys and per-member full-field equality plus exact counts
  // prove no additional actual rows. Counts alone are never a content proof.
  const coverage=(await c.query(`/* v22-qa:prefix-fullset-counts */ SELECT name,source_rows::integer,typed_rows::integer FROM (
   SELECT 'HEADERS'::text name,(SELECT count(*) FROM naijue_erp.import_source_row WHERE entity_type IN('SALES_HEADER','TRANSFER_HEADER')) source_rows,
    (SELECT count(*) FROM naijue_erp.history_sales_header)+(SELECT count(*) FROM naijue_erp.history_transfer_header) typed_rows
   UNION ALL SELECT 'TRANSFER_LINES',(SELECT count(*) FROM naijue_erp.import_source_row WHERE entity_type='TRANSFER_LINE'),(SELECT count(*) FROM naijue_erp.history_transfer_line)
   UNION ALL SELECT 'PRODUCTS',(SELECT count(*) FROM naijue_erp.import_source_row WHERE entity_type='PRODUCT'),(SELECT count(*) FROM naijue_erp.product)
   UNION ALL SELECT 'SKUS',(SELECT count(*) FROM naijue_erp.import_source_row WHERE entity_type='SKU'),(SELECT count(*) FROM naijue_erp.sku)+(SELECT count(*) FROM naijue_erp.import_sku_alias)
   UNION ALL SELECT 'STOCK_CONTRIBUTORS',(SELECT count(*) FROM naijue_erp.import_source_row WHERE entity_type='INVENTORY_BASELINE'),(SELECT count(*) FROM naijue_erp.import_stock_contributor)
   UNION ALL SELECT 'SCHEMES',(SELECT count(*) FROM naijue_erp.import_source_row WHERE entity_type='BARCODE'),(SELECT count(*) FROM naijue_erp.barcode_scheme)
   UNION ALL SELECT 'SKU_RECORDS',0,(SELECT count(*) FROM naijue_erp.import_record WHERE target_type='SKU')) counts`)).rows;
  must(proof.version==='CORE_STAGED_PREFIX_BIND_V22'&&Array.isArray(proof.groups)&&proof.groups.length===6&&coverage.length===7,'QA_PREFIX_COVERAGE_REQUIRED');
  const expected=new Map([...proof.groups.map(g=>[g.name,{source_rows:g.source.rows,typed_rows:g.typed.rows}]),['SKU_RECORDS',{source_rows:0,typed_rows:proof.skuRecords.rows}]]);
  for(const r of coverage){const e=expected.get(r.name);must(e&&Number.isSafeInteger(r.source_rows)&&Number.isSafeInteger(r.typed_rows)
    &&e.source_rows===r.source_rows&&e.typed_rows===r.typed_rows,'QA_PREFIX_EXTRA_OR_MISSING_ACTUAL_MEMBERS');expected.delete(r.name);}
  must(expected.size===0,'QA_PREFIX_COVERAGE_REQUIRED');began=false;await c.query('ROLLBACK');
  return{status:'OBSERVED_READONLY_PREFIX_ADAPTER_COMPLETE_MEMBER_CONTENT_AND_COVERAGE',scope:'READONLY_PREFIX_ADAPTER',proof,coverage,
   rollbackReturned:true,bindExecuted:false,businessDml:false,commitAttempted:false,deferredGuardsExecuted:false,productionBodyPositiveTested:false,negativeFixturesCreated:false};
 }catch(e){discard=e;if(began){began=false;try{await c.query('ROLLBACK');}catch{throw Object.assign(Error('QA_READBACK_ROLLBACK_UNKNOWN'),{code:'QA_READBACK_ROLLBACK_UNKNOWN'});}}throw e;}
 finally{c.release(discard);}
}
export async function runQaPrefixCase(original){
 const p=validateQaPrefixPlan(original);must(p.operation!=='PREPARE_INSTALLER','QA_RUN_OPERATION_REQUIRED');
 // C's final decision: same-body independent QA cannot satisfy historical INIT
 // postmaster equality. Do not execute a known-incompatible BIND to "test" it.
 must(p.operation!=='RUN_FIRST_BIND','QA_BIND_NOT_TESTED_BINDING_IDENTITY_INCOMPATIBLE');
 const f=await authority(p);
 const job=await json(p.hostJob),command=await json(p.firstBind);
 must(command.action==='IMPORT_BIND_FULL_SOURCE'&&f.originalRequestSha256===p.firstBind.sha256&&job.binding?.batchId===command.batchId
  &&job.binding.actorAccountId===command.actorAccountId&&job.binding.target?.database==='erp_rewrite_20261022_r1'&&job.binding.target.role==='erp_rewrite_runtime_20261022'
  &&job.binding.target.serverAddress===null&&job.binding.target.serverPort===null
  &&Date.parse(job.binding.target.postmasterStartedAt)===Date.parse('2026-10-04 08:16:07.895273+00'),'QA_ORIGINAL_SOURCE_BINDING_MUST_NOT_BE_REMAPPED');
 const current=await json(p.qaRuntimeReview);reviewMatches(current,p.qaTuple,PROFILE);await independent(current.independentReview);
 for(const m of Object.values(p.modules))await pinned(m);
 must(job.providers?.path===p.modules.provider.path&&job.providers.sha256===p.modules.provider.sha256,'QA_EXACT_SOURCE_PROVIDER_REQUIRED');
 const hostModule=await import(pathToFileURL(p.modules.host.path).href),providerModule=await import(pathToFileURL(p.modules.provider.path).href);
 const {PostgresCutoffImportStore}=await import(pathToFileURL(p.modules.store.path).href),{createNativeRuntime26Issuer}=await import(pathToFileURL(p.modules.issuer.path).href);
 const {createCutoffImportService}=await import(pathToFileURL(join(p.sourceRoot,'packages/application/src/inventory-cutoff-import.ts')).href);
 const {requestHash}=await import(pathToFileURL(join(p.sourceRoot,'packages/application/src/request-hash.ts')).href),commandHash=requestHash(command);
 // Validation is of the ORIGINAL source job; it is never rewritten to QA and
 // its database settings are never used to construct a connection.
 hostModule.validateExecutableSourceHostJob26(job);
 await mkdir(p.outputDirectory,{recursive:true,mode:0o700});const intent=join(p.outputDirectory,'ATTEMPT.json');
 await writeFile(intent,JSON.stringify({registrationId:p.registrationId,operation:p.operation,qaTuple:p.qaTuple,firstBind:p.firstBind,commandHash,automaticRetry:false})+'\n',{flag:'wx',mode:0o600});
 const cancellation=new AbortController(),timer=setTimeout(()=>cancellation.abort(),Math.max(1,Date.parse(p.deadlineUtc)-Date.now()));timer.unref();
 let session,gate,projectionObserver,result={registrationId:p.registrationId,qaTuple:p.qaTuple,firstBind:p.firstBind,originalSourceBinding:job.binding,
  scope:'QA_STORE_ONLY_NOT_PRODUCTION_SOURCE_HOST_EXECUTION',originalSourceDatabaseAccess:'PROHIBITED',scenario:f.scenario,mainAttempted:false,automaticReplay:false,clientsClosed:false,businessAcceptance:false};
 try{
  if(p.operation==='RUN_FIRST_BIND'||p.operation==='READONLY_PREFIX_ADAPTER'){
   const provider=hostModule.captureNativeSourceProvider26(providerModule,job.binding.phase);
   session=await provider.openSourceSession({binding:structuredClone(job.binding),sources:structuredClone(job.sources),signal:cancellation.signal,
    database:sourceOnlyDatabaseGate22()});
   session=hostModule.captureNativeSourceSession26(session,job.binding);
   await session.preflight(structuredClone(job.binding));await session.assertExecutionAllowed(structuredClone(job.binding));
   must(typeof session.stagedPrefixBinding26?.capture==='function','QA_ORIGINAL_SOURCE_PREFIX_CAPTURE_REQUIRED');
  }
  const require=createRequire(p.modules.host.path),{Pool}=require('pg');
  const codec=await import(pathToFileURL(join(p.sourceRoot,'packages/application/src/history-typed-closure.ts')).href);
  projectionObserver=createPrefixProjectionObserver22(codec);
  class ObservedPool extends Pool{async connect(...args){const raw=await super.connect(...args);return projectionObserver.attachRawClient(raw);}}
  gate=hostModule.createSourcePreflightRuntimeGate26(()=>new ObservedPool({host:p.qaTuple.socketDirectory,port:p.qaConnection.port,
   database:p.qaTuple.database,user:p.qaTuple.actingRole,ssl:false,max:1,connectionTimeoutMillis:10000,idleTimeoutMillis:10000,
   statement_timeout:p.qaConnection.statementTimeoutMs,application_name:'naijue-v22-isolated-qa-only'}),createNativeRuntime26Issuer,
   {reviewFile:p.qaRuntimeReview.path,trustedReviewSha256:p.qaRuntimeReview.sha256});
  const runtime=await gate.activate();
  if(p.operation==='READONLY_PREFIX_ADAPTER'){
   const {verifyCoreStagedPrefix22}=await import(pathToFileURL(p.modules.adapter.path).href);
   result.adapterReadback=await readQaPrefixAdapter22({pool:runtime.pool,runtime:runtime.runtime26,target:p.qaTuple,command,
    authority:session.stagedPrefixBinding26,verifyPrefix:verifyCoreStagedPrefix22});
   result.status=result.adapterReadback.status;return result;
  }
  const before=await readQaOriginalKey(runtime.pool,runtime.runtime26,p.qaTuple,command,commandHash);result.before=before;
  if(p.operation==='READ_ORIGINAL_KEY'){result.status=before.receipts.length?'OBSERVED_ORIGINAL_KEY_COMMITTED_READONLY':'OBSERVED_NO_RECEIPT_AT_CURRENT_SNAPSHOT';return result;}
  if(before.receipts.length){result.status='RECOVERED_ORIGINAL_KEY_COMMITTED_NO_EXECUTION';return result;}
  must(before.batch.status==='STAGED'&&!before.batch.full_bound&&before.batch.sequence===command.expectedSequence&&before.batch.cursor===command.expectedCursor,'QA_UNBOUND_ORIGINAL_CHECKPOINT_REQUIRED');
  const store=new PostgresCutoffImportStore(runtime.pool,{runtime26:runtime.runtime26,
   coreAuthorization:{assertAllowed:(...args)=>session.authorizeNativeCommand(...args)},stagedPrefixBinding26:session.stagedPrefixBinding26});
  const service=createCutoffImportService({now:()=>new Date().toISOString(),authorization:{assertAllowed:(...args)=>session.assertAllowed(...args)},store});
  const events=[{ordinal:1,kind:'MAIN',digest:commandHash,state:'ATTEMPTING'}];
  try{await session.authorizeStep({kind:'MAIN',payload:structuredClone(command)});result.mainAttempted=true;const returned=await service.execute(command);
   result.storeResult={sequence:returned.sequence,cursor:returned.cursor,status:returned.status};events.push({ordinal:1,kind:'MAIN',digest:commandHash,state:'COMMITTED'});}
  catch(e){result.originalErrorCode=code(e);result.outcome='FAILED_OUTCOME_UNVERIFIED';events.push({ordinal:1,kind:'MAIN',digest:commandHash,state:'FAILED_OUTCOME_UNVERIFIED'});}
  result.events=events;
  try{result.after=await readQaOriginalKey(runtime.pool,runtime.runtime26,p.qaTuple,command,commandHash);}catch(e){result.readbackErrorCode=code(e);result.status='OUTCOME_UNVERIFIED_NO_RETRY';return result;}
  if(result.originalErrorCode){
   if(result.after.receipts.length===1){result.status=f.scenario==='EXACT_PREFIX_SUCCESS'?'OBSERVED_ORIGINAL_KEY_COMMITTED_AFTER_FAILED_RESPONSE_NO_REEXECUTION':'STOP_UNEXPECTED_COMMIT_ON_REJECTION_CASE';return result;}
   must(f.scenario!=='EXACT_PREFIX_SUCCESS'&&result.after.receipts.length===0&&equal(before.batch,result.after.batch),'QA_EXPECTED_REJECTION_OR_METADATA_ROLLBACK_NOT_OBSERVED');
   result.status='OBSERVED_REJECTION_AND_BIND_METADATA_ROLLBACK_PREFIX_BODY_NOT_RECHECKED';
  }else{must(f.scenario==='EXACT_PREFIX_SUCCESS'&&result.after.receipts.length===1&&result.after.batch.full_bound&&result.after.batch.status==='STAGED'
    &&result.after.batch.sequence===command.expectedSequence+1&&result.after.batch.cursor===command.expectedCursor,'QA_EXACT_BIND_COMMIT_NOT_OBSERVED');result.status='OBSERVED_EXACT_FIRST_BIND_COMMIT_NOT_PUBLICATION';}
  return result;
 }catch(e){result.status='STOP_NO_RETRY';result.errorCode=code(e);result.prefixDiagnostic=safePrefixReason22(e);
  if(result.prefixDiagnostic.reason==='COMPLETE_PROJECTION')result.projectionMismatch=projectionObserver?.snapshot()??{status:'OBSERVATION_UNAVAILABLE'};return result;}
 finally{clearTimeout(timer);cancellation.abort();const errors=[];for(const close of [()=>session?.close(),()=>gate?.close()])try{await close();}catch(e){errors.push(e);}
  if(errors.length){result.cleanupErrorCode=code(errors[0]);result.status='STOP_CLEANUP_UNKNOWN';}else result.clientsClosed=true;
  await writeFile(join(p.outputDirectory,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});}
}
async function main(path){must(isAbsolute(path),'QA_PLAN_PATH_REQUIRED');const p=validateQaPrefixPlan(JSON.parse(await readFile(path,'utf8')));const r=p.operation==='PREPARE_INSTALLER'?await prepareQaPrefixInstaller(p):await runQaPrefixCase(p);process.stdout.write(JSON.stringify(r)+'\n');}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main(process.argv[2]).catch(e=>{process.stderr.write(JSON.stringify({status:'STOP_NO_RETRY',code:code(e)})+'\n');process.exitCode=2;});
