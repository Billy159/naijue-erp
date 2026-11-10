/** Standalone T45 maintenance leaf, outside the APP native source closure.
 * T45 owns protected inputs, exact external authority/one-use reservation,
 * durable emit(), root publication and fixed-path load. This creates no pool,
 * permission, installation completion, authorization issuer or retry path. */
import {createHash,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {realpath} from 'node:fs/promises';
const hash=b=>createHash('sha256').update(b).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('ADMIN154_UPGRADE_'+code);};
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const oldRoot='/opt/naijue-erp/fresh35-combined-v1';
const sourceSha='fdf29cd82bc54110a91d224a970537216417168792bc83b4b8f73c17a559da75';
const patchSha='6d051a5f4a8dce3183a8c01074e43dadf73942d60ca8a6c99287950dc9c62c9b';
const moduleAt=(root,name)=>import(pathToFileURL(join(root,'scripts/release/unified-install',name+'.mjs')).href);
const ack=(r,command)=>need(r?.command===command,'ACK_'+command+'_REQUIRED');

function sql36Body(sql){
 need(hash(sql)===patchSha&&(sql.match(/^BEGIN;$/gm)||[]).length===1&&(sql.match(/^COMMIT;$/gm)||[]).length===1&&sql.endsWith('COMMIT;\n'),'EXACT_SQL36_REQUIRED');
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
  const lost=()=>finish(Error('ADMIN154_UPGRADE_ROLLBACK_WIRE_LOST'));
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
const receiptSql="SELECT pg_catalog.json_build_object('nonce',$1::text,'database',current_database(),'actor',session_user,'transactionId',pg_current_xact_id()::text,'backendPid',pg_backend_pid())::text AS upgrade_receipt";
function oneJson(result,key,parse){ack(result,'SELECT');need(result.rows?.length===1&&typeof result.rows[0][key]==='string'&&Buffer.byteLength(result.rows[0][key])<=16*1024*1024,'BOUNDED_NATIVE_PACKET_REQUIRED');return {raw:result.rows[0][key],value:parse(result.rows[0][key])};}

async function prepareUpgrade(o){
 const modules=await Promise.all(['fresh35-combined-source-v1','fresh35-combined-target-v1','fresh35-combined-catalog-v1','fresh35-combined-record-v1','fresh35-admin154-record-v1'].map(n=>moduleAt(o.sourceRoot,n)));
 const [sources,targets,catalogs,records,successors]=modules;
 const {parseStrictJson,validateOffsetInstant}=await import(pathToFileURL(join(o.sourceRoot,'packages/application/src/unified-import-contract.ts')).href);
 need(typeof o.postmasterStart==='string'&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{1,6})?\+00$/.test(o.postmasterStart)
  &&validateOffsetInstant(o.postmasterStart.replace(' ','T').replace(/\+00$/,'Z')),'CURRENT_EPOCH_REQUIRED');
 const envelope=await records.loadFresh35CombinedRecordEnvelope(),snapshot=records.describeFresh35ProtectedRecordSnapshot(envelope);
 need(snapshot.sha256===successors.ADMIN154_PREDECESSOR_RECORD_SHA256&&envelope.binding.sourceSetSha256===successors.ADMIN154_PREDECESSOR_SOURCE_SHA256,'FIXED_PREDECESSOR_REQUIRED');
 const target=await targets.reconstructFresh35InstalledProductionTargetV2(envelope),t=targets.describeFresh35CombinedTarget(target);
 need(t.purpose==='PRODUCTION_NEW_EMPTY_EXACT35'&&t.proposal.database==='erp_fresh35_20261110_r3'&&o.referenceDirectory===t.ordinary.referenceDirectory,'ORIGINAL_R3_REQUIRED');
 const old=await Promise.all(['source','target','catalog','lifecycle','record'].map(n=>moduleAt(oldRoot,'fresh35-combined-'+n+'-v1')));
 const [os,ot,oc,op,or]=old,oe=await or.loadFresh35CombinedRecordEnvelope();
 need(or.describeFresh35ProtectedRecordSnapshot(oe).sha256===snapshot.sha256,'HISTORICAL_RECORD_DIFFERS');
 const paths=await sources.resolveFresh35ReferenceInputPaths(o.referenceDirectory),oldPaths=await os.resolveFresh35ReferenceInputPaths(o.referenceDirectory);
 const oldSource=await os.loadFresh35CombinedSource(oldRoot,oldPaths),oldTarget=await ot.reconstructFresh35InstalledProductionTargetV2(oe),oldCatalog=await oc.buildFresh35CombinedCatalog(oldSource,oldTarget,oldPaths);
 const record=or.validateFresh35CombinedRecord(oe,await op.compileFresh35CombinedProgram({source:oldSource,target:oldTarget,catalog:oldCatalog}));
 const source=await sources.loadFresh35Admin154Source(o.sourceRoot,paths),s=sources.describeFresh35CombinedSource(source),catalog=await catalogs.buildFresh35Admin154Catalog(source,target,paths),d=catalogs.describeFresh35CombinedCatalog(catalog);
 need(s.sourceSetSha256===sourceSha&&s.currentSourcePins.length===219&&d.patchSqlSha256===patchSha&&d.predecessorModelSha256===oc.describeFresh35CombinedCatalog(oldCatalog).modelSha256,'FIXED_SOURCE_AND_MODEL_REQUIRED');
 const candidate=sources.fresh35Admin154SourceData(source).candidate,body=sql36Body(candidate.patchSql);
 const expected=freeze({predecessor:{recordSha256:snapshot.sha256,sourceSetSha256:record.binding.sourceSetSha256,programSha256:record.programSha256,catalogSha256:record.catalogSha256,targetSha256:record.binding.targetSha256},
  successor:{patchSqlSha256:d.patchSqlSha256,sourceSetSha256:d.sourceSetSha256,catalogSpecSha256:d.catalogSpecSha256,modelSha256:d.modelSha256},
  physical:{systemIdentifier:t.physical.systemIdentifier,databaseOid:t.physical.databaseOid,database:t.proposal.database,serverVersionNum:t.physical.serverVersionNum,postmasterStart:o.postmasterStart},owner:t.proposal.owner});
 const binding=freeze({format:'FRESH35_ADMIN154_SQL36_UPGRADE_BINDING_V1',predecessor:expected.predecessor,successor:expected.successor,physical:expected.physical,
  owner:expected.owner,host:t.proposal.host,port:t.proposal.port,startsAt:o.startsAt,expiresAt:o.expiresAt,authorizationSha256:o.authorizationSha256});
 return {t,expected,binding,body,parse:parseStrictJson,predecessorSql:catalogs.fresh35Admin154PredecessorCatalogSql(catalog),successorSql:catalogs.fresh35CombinedCatalogSql(catalog,source,target),
  validateCatalog:raw=>catalogs.validateFresh35CombinedCatalogObservation(raw,catalog,source,target),validateRecord:value=>successors.validateFresh35Admin154Record(value,expected),
  async current(){need(Date.now()>=o.startsAt&&Date.now()<o.expiresAt-45000,'WINDOW_OR_CLEANUP_RESERVE_EXPIRED');await o.assertAuthorized(binding);
   await records.assertFresh35ProtectedRecordSnapshotCurrent(envelope,true);await or.assertFresh35ProtectedRecordSnapshotCurrent(oe,true);
   await os.assertFresh35CombinedSourcesCurrent(oldSource);await oc.assertFresh35CombinedCatalogCurrent(oldCatalog);await sources.assertFresh35CombinedSourcesCurrent(source);await catalogs.assertFresh35CombinedCatalogCurrent(catalog);}};
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
  stage='SQL36';await p.current();await io.query(io.client,p.body);
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
  await physicalRead(readback,true);ack(await io.query(readback,p.successorSql.guardSql),'DO');
  raw=oneJson(await io.query(readback,p.successorSql.observationSql),'catalog_json',p.parse).raw;p.validateCatalog(raw);await p.current();await physicalRead(readback,true);
  readRollbackAttempted=true;ack(await io.query(readback,'ROLLBACK'),'ROLLBACK');readTransaction=false;readCloseAttempted=true;await io.close(readback);readClosed=true;
  stage='RECORD';const record=p.validateRecord({format:'FRESH35_A53_ADMIN154_SUCCESSOR_RECORD_V1',predecessor:p.expected.predecessor,
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
  const code=typeof error?.message==='string'&&/^ADMIN154_UPGRADE_[A-Z0-9_]+$/.test(error.message)?error.message:'ADMIN154_UPGRADE_FAILED';
  const result={state,stage,code,catalogReadback:'NOT_VERIFIED',connectionCleanup:ddlClosed&&!readOpening&&(!readback||readClosed)?'CLOSED':'UNKNOWN',recordPublished:false,automaticRetry:false};
  try{await io.emit(result);}catch{result.journal='UNCONFIRMED';}return result;
 }
}

/** client is an already-connected original owner pg.Client. openReadback must
 * return a NEW connected pg.Client. This leaf owns closing adopted clients.
 * assertAuthorized(binding) must enforce the external exact one-use job grant;
 * emit(event) must durably persist before resolving. Neither has a default. */
export async function runFresh35Admin154Upgrade(o){
 need(o&&Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).sort().join(',')==='assertAuthorized,authorizationSha256,client,emit,expiresAt,openReadback,postmasterStart,referenceDirectory,sourceRoot,startsAt','EXACT_OPTIONS_REQUIRED');o={...o};
 need(process.version==='v24.21.0'&&!Object.keys(process.env).some(k=>k==='DATABASE_URL'||k.startsWith('PG')||['NODE_OPTIONS','NODE_PATH'].includes(k)||k.startsWith('LD_')||k.startsWith('DYLD_')),'PINNED_CLEAN_RUNTIME_REQUIRED');
 need(typeof o.sourceRoot==='string'&&resolve(o.sourceRoot)===o.sourceRoot&&await realpath(o.sourceRoot)===o.sourceRoot&&o.sourceRoot!==oldRoot
  &&digest(o.authorizationSha256)&&Number.isSafeInteger(o.startsAt)&&Number.isSafeInteger(o.expiresAt)&&o.startsAt<o.expiresAt
  &&['openReadback','assertAuthorized','emit'].every(k=>typeof o[k]==='function'),'TRUSTED_INPUTS_REQUIRED');
 const trust=await moduleAt(o.sourceRoot,'trusted-install-path');await trust.assertTrustedRootTree(o.sourceRoot);await trust.assertTrustedRootTree(oldRoot);await trust.assertTrustedRootPath(process.execPath);
 const require=createRequire(pathToFileURL(join(o.sourceRoot,'package.json'))),{Client}=require('pg');need(require('pg/package.json').version==='8.23.1','PINNED_PG_REQUIRED');
 const {closePhysical}=await import(pathToFileURL(join(o.sourceRoot,'tools/unified-import/whole-host-session.mjs')).href);
 const adopted=new Set(),closed=new Set(),closing=new Map();let p,enteredDriver=false,commitConfirmed=false,outcome;
 const adopt=c=>{need(c instanceof Client&&Object.getPrototypeOf(c)===Client.prototype&&c.query===Client.prototype.query&&c.end===Client.prototype.end&&c._connected===true&&!adopted.has(c),'ORIGINAL_NATIVE_CLIENT_REQUIRED');adopted.add(c);c.on('error',()=>{});protocol(c,true);return c;};
 const close=c=>{if(!closing.has(c))closing.set(c,(async()=>{await closePhysical(c);closed.add(c);})());return closing.get(c);};
 try{
  adopt(o.client);p=await prepareUpgrade(o);
  const target=c=>{const v=c.connectionParameters;need(v.host===p.t.proposal.host&&Number(v.port)===p.t.proposal.port&&v.database===p.t.proposal.database&&v.user===p.expected.owner&&!v.ssl,'NATIVE_CONNECTION_DIFFERS');};target(o.client);
  enteredDriver=true;outcome=await driveUpgrade(p,{client:o.client,emit:o.emit,nonce:()=>randomBytes(24).toString('hex'),now:()=>new Date().toISOString(),close,
   async openReadback(){const c=adopt(await o.openReadback());try{target(c);return c;}catch(e){await close(c);throw e;}},
   rollbackReady:c=>rollbackReady(c,Math.min(Date.now()+5000,o.expiresAt)),
   async query(c,text,values,cleanup=false){
    need(adopted.has(c)&&!closed.has(c),'ADOPTED_CONNECTION_REQUIRED');protocol(c);if(!cleanup)await p.current();
    const timeout=cleanup?5000:Math.min(45000,o.expiresAt-45000-Date.now());need(timeout>0,'WINDOW_OR_CLEANUP_RESERVE_EXPIRED');
    const result=await Reflect.apply(Client.prototype.query,c,[{text,values,query_timeout:timeout}]);protocol(c,text==='COMMIT'||text==='ROLLBACK');if(text!=='COMMIT'&&text!=='ROLLBACK')need(c._txStatus==='T','ACTIVE_TRANSACTION_REQUIRED');if(text==='COMMIT'&&result?.command==='COMMIT')commitConfirmed=true;return result;
   }});
 }catch(error){let cleanup='CLOSED';for(const c of adopted)try{await close(c);}catch{cleanup='UNKNOWN';}
  outcome={state:commitConfirmed?'COMMITTED_UNPUBLISHED':enteredDriver?'COMMIT_OUTCOME_UNKNOWN':'NOT_STARTED',stage:enteredDriver?'DRIVER':'PREPARE',code:'ADMIN154_UPGRADE_PREPARATION_FAILED',connectionCleanup:cleanup,recordPublished:false,automaticRetry:false};
 }finally{for(const c of adopted)try{await close(c);}catch{if(outcome){outcome.connectionCleanup='UNKNOWN';delete outcome.record;delete outcome.recordJson;delete outcome.recordSha256;}}}
 return outcome;
}
