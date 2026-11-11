/** Versioned one-artifact SQL36/SQL38 T45 leaf; bound to APP 6c6f6b4e.
 * Standalone maintenance code, outside the APP native source closure.
 * T45 owns protected inputs, exact external authority/one-use reservation,
 * durable emit(), root publication and fixed-path load. This creates no pool,
 * permission, installation completion, authorization issuer or retry path. */
import {createHash,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {realpath} from 'node:fs/promises';
const hash=b=>createHash('sha256').update(b).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('BASELINE_UPGRADE_'+code);};
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const oldRoot='/opt/naijue-erp/fresh35-combined-v1';
const appSourceSha='e11609061181457b7cd012a32d0b44a5d764586ee2d5353e62ce82f297db16bd',adminSourceSha='0ba2beef0446879f02dc8a75678a9a2bbb241d6be5bc501fc25057443c1d8c32';
const baseSourceSha='35d6ffc35ea9171a8c13a81539ecf7fbec40f441322d4dfdee612b6486b82471';
const compactPatchSha='b61b31b6116b3f0891dc4cd1f9182aa438d22ad987e29ac2ec73c04f72f5d0ba',compactCatalogSha='fa5b53963510566921827476e21122efc2a8ac381769fcc5b22f8c3f4b4c58cf',adminCatalogSha='8f03acec34ddbc2c5c58b3b177d264932c248d5f193da39ba60ae580b95706cd';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const limits=freeze({SQL36:{maxQueryCalls:14,queryTimeoutMs:45000,statementTimeoutMs:40000,connectionTimeoutMs:5000,closeTimeoutMs:5000,cleanupReserveMs:45000,minimumRemainingMs:695000},SQL38:{maxQueryCalls:15,queryTimeoutMs:45000,statementTimeoutMs:40000,connectionTimeoutMs:5000,closeTimeoutMs:5000,cleanupReserveMs:45000,minimumRemainingMs:740000}});
const patchSha='6d051a5f4a8dce3183a8c01074e43dadf73942d60ca8a6c99287950dc9c62c9b';
const moduleAt=(root,name)=>import(pathToFileURL(join(root,'scripts/release/unified-install',name+'.mjs')).href);
const ack=(r,command)=>need(r?.command===command,'ACK_'+command+'_REQUIRED');

// Both values have already passed their timestamp validators. Preserve all six
// PostgreSQL fractional digits; optional trailing zeros do not change the epoch.
function assertSameMaintenanceParentEpoch(parent,current){
 const canonical=value=>{
  const m=typeof value==='string'&&/^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)(?:\.(\d{1,6}))?\+00$/.exec(value);
  return m?m[1]+'.'+(m[2]||'').padEnd(6,'0')+'+00':null;
 };
 const expected=canonical(current);
 need(expected!==null&&canonical(parent)===expected,'SAME_MAINTENANCE_PARENT_EPOCH_REQUIRED');
}

function patchBody(sql,phase){
 need(['SQL36','SQL38'].includes(phase),'EXACT_PHASE_REQUIRED');
 need(hash(sql)===(phase==='SQL36'?patchSha:compactPatchSha)&&(sql.match(/^BEGIN;$/gm)||[]).length===1&&(sql.match(/^COMMIT;$/gm)||[]).length===1&&sql.endsWith('COMMIT;\n'),'EXACT_SQL_REQUIRED');
 return sql.replace(/^BEGIN;\n/m,'').slice(0,-'COMMIT;\n'.length);
}
function protocol(client,idle=false){
 const value=k=>Object.getOwnPropertyDescriptor(client,k)?.value;
 need(value('pipeline')===false&&value('readyForQuery')===true&&!value('_activeQuery')&&Array.isArray(value('_queryQueue'))&&value('_queryQueue').length===0
  &&Array.isArray(value('_sentQueryQueue'))&&value('_sentQueryQueue').length===0&&value('_queryable')===true&&value('_ending')===false&&value('_ended')===false
  &&(!idle||value('_txStatus')==='I'),'EXCLUSIVE_NATIVE_WIRE_REQUIRED');
}
async function rollbackReady(client,deadline){
 if(client.readyForQuery===true){protocol(client);need(['T','E'].includes(client._txStatus),'ROLLBACK_STATE_REQUIRED');return;}
 await new Promise((resolve,reject)=>{
  const wire=client.connection;let timer,done=false;
  const finish=error=>{if(done)return;done=true;clearTimeout(timer);wire.removeListener('readyForQuery',ready);for(const e of [client,wire]){e.removeListener('end',lost);e.removeListener('error',lost);}error?reject(error):resolve();};
  const lost=()=>finish(Error('BASELINE_UPGRADE_ROLLBACK_WIRE_LOST'));
  const ready=m=>{try{protocol(client);need(['T','E'].includes(client._txStatus)&&m?.status===client._txStatus,'ROLLBACK_STATE_REQUIRED');finish();}catch(e){finish(e);}};
  wire.on('readyForQuery',ready);for(const e of [client,wire]){e.on('end',lost);e.on('error',lost);}timer=setTimeout(lost,Math.max(0,deadline-Date.now()));
 });
}
const physicalSql=`SELECT jsonb_build_object('systemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),
 'databaseOid',(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()),'database',current_database(),
 'serverVersionNum',current_setting('server_version_num'),'postmasterStart',to_char(pg_postmaster_start_time() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS.US')||'+00',
 'actor',session_user,'currentUser',current_user,'backendPid',pg_backend_pid(),'host',host(inet_server_addr()),'port',inet_server_port(),
 'sameEpoch',pg_postmaster_start_time() AT TIME ZONE 'UTC'=$2::timestamp,'origin',current_setting('session_replication_role')='origin',
 'recovery',pg_is_in_recovery(),'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),
 'safeOwner',(SELECT rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
 AND rolconnlimit=2 AND rolvaliduntil>clock_timestamp() AND extract(epoch FROM rolvaliduntil)*1000<=$1::bigint FROM pg_catalog.pg_roles WHERE rolname=session_user))::text AS physical_json`;
const provisionSql="SELECT jsonb_build_object('operation_id',p->>'provision_operation_id','request_sha256',p->>'provision_request_sha256')::text AS provision_origin FROM (SELECT naijue_erp.standard_admin_provision_proof_v1($1::uuid,$2::text,$3::jsonb,false) AS p) verified";
const receiptSql="SELECT pg_catalog.json_build_object('nonce',$1::text,'database',current_database(),'actor',session_user,'transactionId',pg_current_xact_id()::text,'backendPid',pg_backend_pid())::text AS upgrade_receipt";
function oneJson(result,key,parse){ack(result,'SELECT');need(result.rows?.length===1&&typeof result.rows[0][key]==='string'&&Buffer.byteLength(result.rows[0][key])<=16*1024*1024,'BOUNDED_NATIVE_PACKET_REQUIRED');return {raw:result.rows[0][key],value:parse(result.rows[0][key])};}

async function prepareUpgrade(o){
 const [sources,targets,catalogs,records,successors]=await Promise.all(['fresh35-combined-source-v1','fresh35-combined-target-v1','fresh35-combined-catalog-v1','fresh35-combined-record-v1','fresh35-admin154-record-v1'].map(n=>moduleAt(o.sourceRoot,n)));
 const {parseStrictJson,validateOffsetInstant}=await import(pathToFileURL(join(o.sourceRoot,'packages/application/src/unified-import-contract.ts')).href);
 const {requestHash}=await import(pathToFileURL(join(o.sourceRoot,'packages/application/src/request-hash.ts')).href);
 need(typeof o.postmasterStart==='string'&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{1,6})?\+00$/.test(o.postmasterStart)&&validateOffsetInstant(o.postmasterStart.replace(' ','T').replace(/\+00$/,'Z')),'CURRENT_EPOCH_REQUIRED');
 const envelope=await records.loadFresh35CombinedRecordEnvelope(),snapshot=records.describeFresh35ProtectedRecordSnapshot(envelope);
 need(snapshot.sha256===successors.ADMIN154_PREDECESSOR_RECORD_SHA256&&envelope.binding.sourceSetSha256===successors.ADMIN154_PREDECESSOR_SOURCE_SHA256,'FIXED_PREDECESSOR_REQUIRED');
 const target=await targets.reconstructFresh35InstalledProductionTargetV2(envelope),t=targets.describeFresh35CombinedTarget(target);
 need(t.purpose==='PRODUCTION_NEW_EMPTY_EXACT35'&&t.proposal.database==='erp_fresh35_20261110_r3'&&o.referenceDirectory===t.ordinary.referenceDirectory,'ORIGINAL_R3_REQUIRED');
 const [os,ot,oc,op,or]=await Promise.all(['source','target','catalog','lifecycle','record'].map(n=>moduleAt(oldRoot,'fresh35-combined-'+n+'-v1'))),oe=await or.loadFresh35CombinedRecordEnvelope();
 need(or.describeFresh35ProtectedRecordSnapshot(oe).sha256===snapshot.sha256,'HISTORICAL_RECORD_DIFFERS');
 const paths=await sources.resolveFresh35ReferenceInputPaths(o.referenceDirectory),oldPaths=await os.resolveFresh35ReferenceInputPaths(o.referenceDirectory),oldSource=await os.loadFresh35CombinedSource(oldRoot,oldPaths),oldTarget=await ot.reconstructFresh35InstalledProductionTargetV2(oe),oldCatalog=await oc.buildFresh35CombinedCatalog(oldSource,oldTarget,oldPaths);
 const record=or.validateFresh35CombinedRecord(oe,await op.compileFresh35CombinedProgram({source:oldSource,target:oldTarget,catalog:oldCatalog}));
 const source=await sources.loadFresh35CompactZeroSource(o.sourceRoot,paths),s=sources.describeFresh35CombinedSource(source),catalog=await catalogs.buildFresh35CompactZeroCatalog(source,target,paths),d=catalogs.describeFresh35CombinedCatalog(catalog);
 const adminSource=sources.fresh35CompactZeroSourceData(source).base,admin=sources.describeFresh35CombinedSource(adminSource),adminCatalog=catalogs.fresh35CompactZeroParentCatalog(catalog),ad=catalogs.describeFresh35CombinedCatalog(adminCatalog);
 const adminData=sources.fresh35Admin154SourceData(adminSource),base=sources.describeFresh35CombinedSource(adminData.base);
 need(base.sourceSetSha256===baseSourceSha&&base.currentSourcePins.length===219
  &&s.sourceSetSha256===appSourceSha&&s.currentSourcePins.length===223&&d.catalogSpecSha256===compactCatalogSha&&d.patchSqlSha256===compactPatchSha
  &&admin.sourceSetSha256===adminSourceSha&&admin.currentSourcePins.length===220&&ad.catalogSpecSha256===adminCatalogSha&&ad.patchSqlSha256===patchSha
  &&ad.predecessorModelSha256===oc.describeFresh35CombinedCatalog(oldCatalog).modelSha256,'FIXED_ARTIFACT_AND_CATALOG_REQUIRED');
 const physical={systemIdentifier:t.physical.systemIdentifier,databaseOid:t.physical.databaseOid,database:t.proposal.database,serverVersionNum:t.physical.serverVersionNum,postmasterStart:o.postmasterStart};
 const adminExpected={predecessor:{recordSha256:snapshot.sha256,sourceSetSha256:record.binding.sourceSetSha256,programSha256:record.programSha256,catalogSha256:record.catalogSha256,targetSha256:record.binding.targetSha256},successor:{patchSqlSha256:ad.patchSqlSha256,sourceSetSha256:ad.sourceSetSha256,catalogSpecSha256:ad.catalogSpecSha256,modelSha256:ad.modelSha256},physical,owner:t.proposal.owner};
 let parent,expected,body,predecessorSql,successorSql,validateCatalog,validateRecord,recordFormat;
 if(o.phase==='SQL36'){
  expected=adminExpected;body=patchBody(adminData.candidate.patchSql,'SQL36');
  predecessorSql=catalogs.fresh35Admin154PredecessorCatalogSql(adminCatalog);successorSql=catalogs.fresh35CombinedCatalogSql(adminCatalog,adminSource,target);
  validateCatalog=raw=>catalogs.validateFresh35CombinedCatalogObservation(raw,adminCatalog,adminSource,target);validateRecord=value=>successors.validateFresh35Admin154Record(value,expected);recordFormat='FRESH35_A53_ADMIN154_SUCCESSOR_RECORD_V1';
 }else{
  parent=await successors.loadFresh35Admin154Record(adminExpected,o.parentRecordSha256);const p=successors.describeFresh35Admin154Record(parent);
  assertSameMaintenanceParentEpoch(p.value.physical.postmasterStart,o.postmasterStart);
  expected={predecessor:{recordSha256:p.sha256,sourceSetSha256:p.value.successor.sourceSetSha256,catalogSpecSha256:p.value.successor.catalogSpecSha256,modelSha256:p.value.successor.modelSha256,catalogSha256:p.value.successor.catalogSha256},successor:{patchSqlSha256:d.patchSqlSha256,sourceSetSha256:d.sourceSetSha256,catalogSpecSha256:d.catalogSpecSha256,modelSha256:d.modelSha256},physical,owner:t.proposal.owner};
  body=patchBody(sources.fresh35CompactZeroSourceData(source).candidate.patchSql,'SQL38');predecessorSql=catalogs.fresh35CombinedCatalogSql(adminCatalog,adminSource,target);successorSql=catalogs.fresh35CombinedCatalogSql(catalog,source,target);
  validateCatalog=raw=>catalogs.validateFresh35CombinedCatalogObservation(raw,catalog,source,target);validateRecord=value=>successors.validateFresh35CompactZeroRecord(value,expected);recordFormat='FRESH35_COMPACT_ZERO_SUCCESSOR_RECORD_V2';
 }
 expected=freeze(expected);
 const binding=freeze({format:'FRESH35_COMPACT_ZERO_MAINTENANCE_UPGRADE_BINDING_V2',phase:o.phase,artifactSourceSetSha256:appSourceSha,predecessor:expected.predecessor,successor:expected.successor,physical,
  owner:expected.owner,host:t.proposal.host,port:t.proposal.port,startsAt:o.startsAt,expiresAt:o.expiresAt,timing:limits[o.phase],
  ...(o.phase==='SQL38'?{provisionOrigin:{...o.provisionOrigin,adminIdentitySha256:requestHash(o.admin)}}:{}),...(o.authorizationSha256?{authorizationSha256:o.authorizationSha256}:{})});
 return {phase:o.phase,t,expected,binding,body,parse:parseStrictJson,predecessorSql,successorSql,validateCatalog,validateRecord,recordFormat,
  ...(o.phase==='SQL38'?{provisionOrigin:o.provisionOrigin,provisionValues:[o.provisionOrigin.operation_id,o.provisionOrigin.request_sha256,JSON.stringify(o.admin)]}:{}),
  async current(){need(Date.now()>=o.startsAt&&Date.now()<o.expiresAt-45000,'WINDOW_OR_CLEANUP_RESERVE_EXPIRED');await o.assertAuthorized(binding);
   await records.assertFresh35ProtectedRecordSnapshotCurrent(envelope,true);await or.assertFresh35ProtectedRecordSnapshotCurrent(oe,true);
   await os.assertFresh35CombinedSourcesCurrent(oldSource);await oc.assertFresh35CombinedCatalogCurrent(oldCatalog);await sources.assertFresh35CombinedSourcesCurrent(source);await catalogs.assertFresh35CombinedCatalogCurrent(catalog);
   if(parent)await successors.assertFresh35Admin154RecordCurrent(parent,true);}};
}

async function checkedOptions(input,execute){
 need(input&&Object.getPrototypeOf(input)===Object.prototype&&['SQL36','SQL38'].includes(input.phase),'EXACT_PHASE_REQUIRED');
 const fields=['phase','sourceRoot','referenceDirectory','postmasterStart','startsAt','expiresAt',...(input.phase==='SQL38'?['parentRecordSha256','provisionOrigin','admin']:[]),...(execute?['assertAuthorized','authorizationSha256','emit','openClient']:[])];
 need(Object.keys(input).sort().join(',')===fields.sort().join(','),'EXACT_OPTIONS_REQUIRED');
 const o={...input,...(input.phase==='SQL38'?{provisionOrigin:structuredClone(input.provisionOrigin),admin:structuredClone(input.admin)}:{})};
 need(process.version==='v24.21.0'&&!Object.keys(process.env).some(k=>k==='DATABASE_URL'||k.startsWith('PG')||['NODE_OPTIONS','NODE_PATH'].includes(k)||k.startsWith('LD_')||k.startsWith('DYLD_')),'PINNED_CLEAN_RUNTIME_REQUIRED');
 need(typeof o.sourceRoot==='string'&&resolve(o.sourceRoot)===o.sourceRoot&&await realpath(o.sourceRoot)===o.sourceRoot&&o.sourceRoot!==oldRoot&&Number.isSafeInteger(o.startsAt)&&Number.isSafeInteger(o.expiresAt)&&o.startsAt<o.expiresAt,'TRUSTED_INPUTS_REQUIRED');
 if(execute)need(digest(o.authorizationSha256)&&['openClient','assertAuthorized','emit'].every(k=>typeof o[k]==='function'),'EXACT_AUTHORITY_PORTS_REQUIRED');
 if(o.phase==='SQL38')need(digest(o.parentRecordSha256)&&o.provisionOrigin&&Object.keys(o.provisionOrigin).sort().join(',')==='operation_id,request_sha256'&&uuid(o.provisionOrigin.operation_id)&&digest(o.provisionOrigin.request_sha256)&&o.admin&&Object.keys(o.admin).sort().join(',')==='account_id,login_name,staff_id,staff_name'&&uuid(o.admin.staff_id)&&uuid(o.admin.account_id)&&o.admin.login_name==='admin'&&o.admin.staff_name==='系统管理员','ACTUAL_PARENT_AND_A_ORIGIN_REQUIRED');
 const trust=await moduleAt(o.sourceRoot,'trusted-install-path');await trust.assertTrustedRootTree(o.sourceRoot);await trust.assertTrustedRootTree(oldRoot);await trust.assertTrustedRootPath(process.execPath);return o;
}
/** Metadata only: no pg require, native connection, reservation or authority. */
export async function describeFresh35BaselineScopeUpgrade(input){
 const o=await checkedOptions(input,false);need(Date.now()<o.expiresAt-limits[o.phase].minimumRemainingMs,'MINIMUM_PHASE_REMAINING_REQUIRED');
 const p=await prepareUpgrade(o);return freeze({state:'READ_ONLY_PREPARATION_NOT_AUTHORIZATION',phase:o.phase,binding:p.binding,timing:limits[o.phase]});
}

/** I/O driver is private: model tests extract this body; no model capability is
 * exported. A record is returned only after both native connections close. */
async function driveUpgrade(p,io){
 let stage='BOUND',began=false,commitAttempted=false,committed=false,ddlClosed=false,ddlCloseAttempted=false,readback,readOpening=false,readTransaction=false,readRollbackAttempted=false,readClosed=false,readCloseAttempted=false,receipt,physical,precommitHash,raw;
 const event=state=>io.emit({state,stage,automaticRetry:false});
 const physicalRead=async(c,readonly)=>{
  const packet=oneJson(await io.query(c,physicalSql,[p.binding.expiresAt,p.expected.physical.postmasterStart.replace(/\+00$/,'')]),'physical_json',p.parse).value;
  need(['systemIdentifier','databaseOid','database','serverVersionNum'].every(k=>packet[k]===p.expected.physical[k])&&packet.actor===p.expected.owner&&packet.currentUser===p.expected.owner
   &&packet.host===p.t.proposal.host&&packet.port===p.t.proposal.port&&packet.sameEpoch===true&&packet.safeOwner===true&&packet.origin===true&&packet.recovery===false
   &&packet.readOnly===(readonly?'on':'off')&&packet.isolation===(readonly?'repeatable read':'read committed')&&Number.isSafeInteger(packet.backendPid)&&packet.backendPid>0,'NATIVE_PHYSICAL_OR_OWNER_DIFFERS');return packet;
 };
 try{
  await p.current();await io.emit({state:'BOUND',binding:p.binding,automaticRetry:false});
  stage='BEGIN';ack(await io.query(io.client,'BEGIN ISOLATION LEVEL READ COMMITTED'),'BEGIN');began=true;
  stage='PREDECESSOR';physical=await physicalRead(io.client,false);await p.current();ack(await io.query(io.client,p.predecessorSql.guardSql),'DO');
  if(p.phase==='SQL38'){stage='A_PROOF';const proof=oneJson(await io.query(io.client,provisionSql,p.provisionValues),'provision_origin',p.parse).value;need(Object.keys(proof).sort().join(',')==='operation_id,request_sha256'&&proof.operation_id===p.provisionOrigin.operation_id&&proof.request_sha256===p.provisionOrigin.request_sha256,'COMMITTED_A_ORIGIN_DIFFERS');}
  stage=p.phase;await p.current();await io.query(io.client,p.body);
  stage='PRECOMMIT_CATALOG';ack(await io.query(io.client,p.successorSql.guardSql),'DO');
  raw=oneJson(await io.query(io.client,p.successorSql.observationSql),'catalog_json',p.parse).raw;p.validateCatalog(raw);precommitHash=hash(raw);
  const nonce=io.nonce();receipt=oneJson(await io.query(io.client,receiptSql,[nonce]),'upgrade_receipt',p.parse).value;
  need(receipt.nonce===nonce&&/^[a-f0-9]{48}$/.test(nonce)&&Object.keys(receipt).sort().join(',')==='actor,backendPid,database,nonce,transactionId'
   &&receipt.actor===p.expected.owner&&receipt.database===p.expected.physical.database&&receipt.backendPid===physical.backendPid&&typeof receipt.transactionId==='string'&&/^[1-9][0-9]*$/.test(receipt.transactionId),'SAME_TRANSACTION_RECEIPT_REQUIRED');
  await io.emit({state:'PRECOMMIT_CATALOG_CHECKED',receipt,catalogSha256:precommitHash,automaticRetry:false});await p.current();
  stage='COMMIT';await event('COMMIT_PENDING');commitAttempted=true;ack(await io.query(io.client,'COMMIT'),'COMMIT');committed=true;began=false;
  await event('COMMITTED_UNPUBLISHED');stage='DDL_CLOSE';ddlCloseAttempted=true;await io.close(io.client);ddlClosed=true;await event('DDL_CONNECTION_CLOSED');
  stage='READBACK_CONNECT';await p.current();readOpening=true;readback=await io.openReadback();readOpening=false;need(readback!==io.client,'INDEPENDENT_READBACK_CONNECTION_REQUIRED');
  stage='READBACK';ack(await io.query(readback,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'),'BEGIN');readTransaction=true;
  const readPhysical=await physicalRead(readback,true);need(readPhysical.backendPid!==physical.backendPid,'INDEPENDENT_READBACK_BACKEND_REQUIRED');ack(await io.query(readback,p.successorSql.guardSql),'DO');
  raw=oneJson(await io.query(readback,p.successorSql.observationSql),'catalog_json',p.parse).raw;p.validateCatalog(raw);await p.current();await physicalRead(readback,true);
  readRollbackAttempted=true;ack(await io.query(readback,'ROLLBACK'),'ROLLBACK');readTransaction=false;readCloseAttempted=true;await io.close(readback);readClosed=true;
  stage='RECORD';const record=p.validateRecord({format:p.recordFormat,predecessor:p.expected.predecessor,
   successor:{...p.expected.successor,catalogSha256:hash(raw)},physical:Object.fromEntries(Object.keys(p.expected.physical).map(k=>[k,physical[k]])),transactionReceipt:receipt,
   appliedAt:io.now(),authorizationSha256:p.binding.authorizationSha256});
  const recordJson=JSON.stringify(record)+'\n',recordSha256=hash(recordJson);await io.emit({state:'COMMITTED_CATALOG_READBACK_VERIFIED_UNPUBLISHED',recordSha256,precommitCatalogSha256:precommitHash,readbackCatalogSha256:hash(raw),automaticRetry:false});
  return {state:'COMMITTED_UNPUBLISHED',catalogReadback:'VERIFIED',connectionCleanup:'CLOSED',recordPublished:false,record,recordJson,recordSha256,expected:p.expected,automaticRetry:false};
 }catch(error){
  let state=committed?'COMMITTED_UNPUBLISHED':commitAttempted?'COMMIT_OUTCOME_UNKNOWN':began?'ROLLBACK_UNCONFIRMED':'NOT_STARTED';
  if(began&&!commitAttempted)try{await io.rollbackReady(io.client);ack(await io.query(io.client,'ROLLBACK',undefined,true),'ROLLBACK');began=false;state='ROLLED_BACK';}catch{}
  if(readTransaction&&!readRollbackAttempted)try{readRollbackAttempted=true;await io.rollbackReady(readback);ack(await io.query(readback,'ROLLBACK',undefined,true),'ROLLBACK');readTransaction=false;}catch{}
  if(!ddlCloseAttempted)try{ddlCloseAttempted=true;await io.close(io.client);ddlClosed=true;}catch{}
  if(readback&&readback!==io.client&&!readCloseAttempted)try{readCloseAttempted=true;await io.close(readback);readClosed=true;}catch{}
  const code=typeof error?.message==='string'&&/^BASELINE_UPGRADE_[A-Z0-9_]+$/.test(error.message)?error.message:'BASELINE_UPGRADE_FAILED';
  const result={state,stage,code,catalogReadback:'NOT_VERIFIED',connectionCleanup:ddlClosed&&!readOpening&&(!readback||readClosed)?'CLOSED':'UNKNOWN',recordPublished:false,automaticRetry:false};
  try{await io.emit(result);}catch{result.journal='UNCONFIRMED';}return result;
 }
}

/** openClient returns a new connected original owner pg.Client per call.
 * The first call follows the full preparation and authorization check.
 * This leaf owns closing adopted clients.
 * assertAuthorized(binding) must enforce the external exact one-use job grant;
 * emit(event) must durably persist before resolving. Neither has a default. */
export async function runFresh35BaselineScopeUpgrade(input){
 const o=await checkedOptions(input,true);
 const require=createRequire(pathToFileURL(join(o.sourceRoot,'package.json'))),{Client}=require('pg');need(require('pg/package.json').version==='8.23.1','PINNED_PG_REQUIRED');
 const {closePhysical}=await import(pathToFileURL(join(o.sourceRoot,'tools/unified-import/whole-host-session.mjs')).href);
 const adopted=new Set(),closed=new Set(),closing=new Map();let p,enteredDriver=false,commitConfirmed=false,outcome;
 const adopt=c=>{need(c instanceof Client&&Object.getPrototypeOf(c)===Client.prototype&&c.query===Client.prototype.query&&c.end===Client.prototype.end&&c._connected===true&&!adopted.has(c),'ORIGINAL_NATIVE_CLIENT_REQUIRED');adopted.add(c);c.on('error',()=>{});protocol(c,true);return c;};
 const close=c=>{if(!closing.has(c))closing.set(c,(async()=>{await closePhysical(c);closed.add(c);})());return closing.get(c);};
 try{
  p=await prepareUpgrade(o);
  await p.current();need(Date.now()<o.expiresAt-limits[o.phase].minimumRemainingMs,'MINIMUM_PHASE_REMAINING_REQUIRED');
  const connect=async()=>{
   const c=adopt(await o.openClient()),v=c.connectionParameters;
   try{need(v.host===p.t.proposal.host&&Number(v.port)===p.t.proposal.port&&v.database===p.t.proposal.database&&v.user===p.expected.owner&&!v.ssl,'NATIVE_CONNECTION_DIFFERS');}
   catch(error){await close(c);throw error;}
   return c;
  };
  const client=await connect();
  enteredDriver=true;outcome=await driveUpgrade(p,{client,emit:o.emit,nonce:()=>randomBytes(24).toString('hex'),now:()=>new Date().toISOString(),close,
   openReadback:connect,
   rollbackReady:c=>rollbackReady(c,Math.min(Date.now()+5000,o.expiresAt)),
   async query(c,text,values,cleanup=false){
    need(adopted.has(c)&&!closed.has(c),'ADOPTED_CONNECTION_REQUIRED');protocol(c);if(!cleanup)await p.current();
    const timeout=cleanup?5000:Math.min(45000,o.expiresAt-45000-Date.now());need(timeout>0,'WINDOW_OR_CLEANUP_RESERVE_EXPIRED');
    const result=await Reflect.apply(Client.prototype.query,c,[{text,values,query_timeout:timeout}]);protocol(c,text==='COMMIT'||text==='ROLLBACK');if(text!=='COMMIT'&&text!=='ROLLBACK')need(c._txStatus==='T','ACTIVE_TRANSACTION_REQUIRED');if(text==='COMMIT'&&result?.command==='COMMIT')commitConfirmed=true;return result;
   }});
 }catch(error){let cleanup='CLOSED';for(const c of adopted)try{await close(c);}catch{cleanup='UNKNOWN';}
  outcome={state:commitConfirmed?'COMMITTED_UNPUBLISHED':enteredDriver?'COMMIT_OUTCOME_UNKNOWN':'NOT_STARTED',stage:enteredDriver?'DRIVER':'PREPARE',code:'BASELINE_UPGRADE_PREPARATION_FAILED',connectionCleanup:cleanup,recordPublished:false,automaticRetry:false};
 }finally{for(const c of adopted)try{await close(c);}catch{if(outcome){outcome.connectionCleanup='UNKNOWN';delete outcome.record;delete outcome.recordJson;delete outcome.recordSha256;}}}
 return outcome;
}
