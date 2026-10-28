#!/usr/bin/env node
/** H06 finite operator mechanism. No schedule, inferred retention or implicit apply. */
import { constants } from 'node:fs';
import { lstat, realpath, open, opendir, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { BoundedPostgresPool } from '../../adapters/postgres/src/bounded-pool.ts';
import { PRODUCT_MEDIA_STAGE_PROFILE, PRODUCT_MEDIA_STAGE_EXPIRY_SECONDS } from '../../adapters/media/src/product-media-stage.ts';
import { PRODUCT_IMAGE_CODEC_PROFILE, PRODUCT_IMAGE_CODEC_LIMITS } from '../../adapters/media/src/sharp-product-image-codec.ts';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const uuid = s => typeof s === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s);
const digest = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const positive = n => Number.isSafeInteger(n) && n > 0;
const stamp = s => typeof s === 'string' && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
function requireValue(ok, code) { if (!ok) throw Error(code); }
function one(result) { requireValue(result?.rows?.length === 1 && result.rowCount === 1, 'METADATA_UNAVAILABLE'); return result.rows[0]; }
const nativeIO = { lstat, realpath, open, opendir, unlink, rmdir };
export const RECLAIM_IDENTITY_SQL = `/* resource-reclaim:identity */ SELECT current_database() AS database,current_user AS role,
 (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid,
 pg_postmaster_start_time()::text AS postmaster_start,CURRENT_TIMESTAMP::text AS observed_at,
 current_setting('transaction_read_only') AS read_only`;
export const SESSION_ACCOUNT_SQL = `/* resource-reclaim:account */ SELECT a.id FROM naijue_erp.user_account a
 JOIN naijue_erp.staff s ON s.id=a.staff_id WHERE a.id=$1::uuid`;
export const SESSION_ROWS_SQL = `/* resource-reclaim:sessions */ SELECT token_hash,revoked_at IS NOT NULL AS revoked,
 expires_at<=$2::timestamptz AS expired FROM naijue_erp.auth_session WHERE account_id=$1::uuid ORDER BY token_hash LIMIT $3`;
export const SESSION_DELETE_SQL = `/* resource-reclaim:delete-sessions */ DELETE FROM naijue_erp.auth_session
 WHERE account_id=$1::uuid AND token_hash=ANY($2::text[]) AND revoked_at IS NOT NULL AND expires_at<=$3::timestamptz
 AND EXISTS(SELECT 1 FROM naijue_erp.auth_session k WHERE k.account_id=$1::uuid AND k.token_hash=$4::text)`;
export const MEDIA_REFERENCES_SQL = `/* resource-reclaim:media-references */ SELECT
 EXISTS(SELECT 1 FROM naijue_erp.product_image WHERE file_ref=$1::text) AS current_ref,
 EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='PRODUCT' AND
 (before_values->'images' @> jsonb_build_array(jsonb_build_object('file_ref',$1::text)) OR
 after_values->'images' @> jsonb_build_array(jsonb_build_object('file_ref',$1::text)))) AS history_ref,
 EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE actor_account_id=$2::uuid AND request_key=$3::text) AS receipt_ref,
 EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE position($1::text IN field_provenance::text)>0) AS source_ref`;
function configuration(input, mode) {
  requireValue(input && ['sessions','media'].includes(input.resource) && input.postgres && input.expected && input.limits && stamp(input.cutoff), 'EXPLICIT_CONFIGURATION_REQUIRED');
  const c = structuredClone(input), e = c.expected, l = c.limits;
  requireValue(['database','role','databaseOid','postmasterStart'].every(k => typeof e[k] === 'string' && e[k].length)
    && e.database === c.postgres.target?.database && e.role === c.postgres.target?.user, 'EXACT_TARGET_REQUIRED');
  requireValue(['maxCandidates','maxRows','maxBytes','maxDurationMillis'].every(k => positive(l[k])) && l.maxRows < Number.MAX_SAFE_INTEGER, 'FINITE_LIMITS_REQUIRED');
  requireValue(['acquisitionTimeoutMillis','queryTimeoutMillis','statementTimeoutMillis','disposeTimeoutMillis'].every(k => positive(c.postgres[k])), 'FINITE_POOL_LIMITS_REQUIRED');
  const candidates = c.resource === 'sessions' ? c.accountIds : c.media?.candidates;
  requireValue(Array.isArray(candidates) && candidates.length > 0 && candidates.length <= l.maxCandidates, 'FIXED_CANDIDATES_REQUIRED');
  if (c.resource === 'sessions') requireValue(candidates.every(uuid) && new Set(candidates).size === candidates.length, 'FIXED_ACCOUNTS_REQUIRED');
  else {
    requireValue(candidates.every(x => uuid(x.uploadId) && digest(x.manifestSha256)) && new Set(candidates.map(x => x.uploadId)).size === candidates.length, 'FIXED_MEDIA_REQUIRED');
    requireValue(typeof c.media.root === 'string' && path.isAbsolute(c.media.root) && path.resolve(c.media.root) === c.media.root
      && Array.isArray(c.media.publicRoots) && c.media.publicRoots.length > 0 && c.media.publicRoots.every(x => typeof x === 'string' && path.isAbsolute(x)), 'PRIVATE_ROOT_REQUIRED');
  }
  requireValue(mode === 'dry-run' || mode === 'apply-isolated', 'EXPLICIT_MODE_REQUIRED');
  if (mode === 'apply-isolated') requireValue(c.approval?.scope === 'ISOLATED' && typeof c.approval.id === 'string' && c.approval.id.length > 0
    && digest(c.approval.planHash) && /^demo_8877_[A-Za-z0-9_]+$/.test(e.database), 'ISOLATED_APPROVAL_REQUIRED');
  return c;
}
const inside = (root, child) => { const rel = path.relative(root, child); return rel === '' || rel !== '..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel); };
async function canonical(directory, io) {
  requireValue(path.isAbsolute(directory) && path.resolve(directory) === directory, 'CANONICAL_PATH_REQUIRED');
  let current = path.parse(directory).root;
  for (const part of path.relative(current,directory).split(path.sep).filter(Boolean)) {
    current = path.join(current,part); const info = await io.lstat(current);
    requireValue(info.isDirectory() && !info.isSymbolicLink(), 'SYMLINK_OR_NON_DIRECTORY');
  }
  requireValue(await io.realpath(directory) === directory, 'CANONICAL_PATH_CHANGED');
  const stat = await io.lstat(directory);
  requireValue((stat.mode&0o777) === 0o700 && (typeof process.getuid !== 'function' || stat.uid === process.getuid()), 'PRIVATE_DIRECTORY_REQUIRED');
}
async function boundedFile(file, maximum, io, check) {
  check(); await canonical(path.dirname(file),io); const before = await io.lstat(file);
  requireValue(before.isFile() && !before.isSymbolicLink() && (before.mode&0o777) === 0o600 && before.size > 0 && before.size <= maximum
    && (typeof process.getuid !== 'function' || before.uid === process.getuid()), 'PRIVATE_BOUNDED_FILE_REQUIRED');
  const handle = await io.open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const start = await handle.stat(); requireValue(start.dev === before.dev && start.ino === before.ino && start.size === before.size, 'FILE_CHANGED');
    const bytes = Buffer.alloc(start.size+1); let offset=0;
    while(offset<bytes.length){check();const part=await handle.read(bytes,offset,bytes.length-offset,offset);if(!part.bytesRead)break;offset+=part.bytesRead;}
    const end=await handle.stat(), current=await io.lstat(file);
    requireValue(offset===start.size && end.size===start.size && end.mtimeMs===start.mtimeMs && end.ctimeMs===start.ctimeMs
      && current.dev===start.dev && current.ino===start.ino && !current.isSymbolicLink(), 'FILE_CHANGED');
    check(); return { bytes:bytes.subarray(0,offset),dev:start.dev,ino:start.ino,nlink:start.nlink };
  } finally { await handle.close(); }
}
async function entries(directory, limit, io, check) {
  await canonical(directory,io); const dir=await io.opendir(directory), result=[];
  try { for(;;){check();const entry=await dir.read();if(!entry)break;requireValue(result.length<limit,'ENTRY_BOUND_EXCEEDED');result.push(entry);} }
  finally { await dir.close(); }
  return result;
}
async function mediaCandidate(c, candidate, client, io, check, assertHeld, assertRecoverySettled) {
  const root=c.media.root, directory=path.join(root,'stages',candidate.uploadId);
  await canonical(root,io);
  for(const p of c.media.publicRoots){const publicPath=await io.realpath(p);requireValue(!inside(publicPath,root)&&!inside(root,publicPath),'PUBLIC_ROOT_OVERLAP');}
  const names=await entries(directory,4,io,check);
  requireValue(names.length===3 && names.every(x=>['original.bin','thumbnail.webp','manifest.json'].includes(x.name)&&x.isFile()&&!x.isSymbolicLink()),'UNKNOWN_STAGE_CONTENT');
  const manifest=await boundedFile(path.join(directory,'manifest.json'),16384,io,check);
  requireValue(sha(manifest.bytes)===candidate.manifestSha256 && manifest.nlink===1,'INDEX_OR_MANIFEST_CHANGED');
  const m=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(manifest.bytes));
  requireValue(m.format===PRODUCT_MEDIA_STAGE_PROFILE && m.codecProfile===PRODUCT_IMAGE_CODEC_PROFILE && m.uploadId===candidate.uploadId
    && m.fileRef===`staged-product-media:${candidate.uploadId}` && uuid(m.actorAccountId) && (m.productId===null||uuid(m.productId))
    && [m.commandKey,m.uploadKey].every(s=>typeof s==='string'&&/^[A-Za-z0-9._:-]{1,200}$/.test(s)) && stamp(m.createdAt)&&stamp(m.expiresAt)
    && Date.parse(m.expiresAt)-Date.parse(m.createdAt)===PRODUCT_MEDIA_STAGE_EXPIRY_SECONDS*1000 && Date.parse(m.expiresAt)<=Date.parse(c.cutoff),'UNKNOWN_OR_INELIGIBLE_STAGE');
  const keys=await entries(path.join(root,'keys'),c.limits.maxRows,io,check);
  for(const entry of keys){requireValue(entry.isFile()&&!entry.isSymbolicLink()&&/^[a-f0-9]{64}\.json$/.test(entry.name),'UNKNOWN_KEY_INDEX');
    const index=await boundedFile(path.join(root,'keys',entry.name),16384,io,check),k=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(index.bytes));
    requireValue(k.format===PRODUCT_MEDIA_STAGE_PROFILE&&uuid(k.uploadId)&&uuid(k.actorAccountId)&&typeof k.commandKey==='string'&&typeof k.uploadKey==='string'
      && entry.name===sha(JSON.stringify([k.actorAccountId,k.commandKey,k.uploadKey]))+'.json','UNKNOWN_KEY_INDEX');
    requireValue(k.uploadId!==candidate.uploadId && !(k.actorAccountId===m.actorAccountId&&k.commandKey===m.commandKey&&k.uploadKey===m.uploadKey),'INDEXED_OR_ORIGINAL_KEY');
  }
  const files=[{name:'manifest.json',...manifest,hash:sha(manifest.bytes)}];
  for(const [name,record,limit] of [['original.bin',m.original,PRODUCT_IMAGE_CODEC_LIMITS.inputBytesMax],['thumbnail.webp',m.thumbnail,PRODUCT_IMAGE_CODEC_LIMITS.thumbnailBytesMax]]){
    requireValue(record&&digest(record.sha256)&&typeof record.byteSize==='string'&&/^[1-9]\d*$/.test(record.byteSize),'UNKNOWN_BLOB_RECORD');
    const f=await boundedFile(path.join(directory,name),limit,io,check);
    requireValue(f.nlink===1 && String(f.bytes.length)===record.byteSize && sha(f.bytes)===record.sha256,'UNKNOWN_BLOB');files.push({name,...f,hash:sha(f.bytes)});
  }
  requireValue(m.thumbnail?.mime==='image/webp'&&m.thumbnail.derivedFromOriginalSha256===m.original.sha256,'UNKNOWN_DERIVATION');
  check();if(assertHeld)await assertHeld();check();
  const refs=one(await client.query(MEDIA_REFERENCES_SQL,[m.fileRef,m.actorAccountId,m.commandKey]));
  requireValue(['current_ref','history_ref','receipt_ref','source_ref'].every(k=>refs[k]===false),'REFERENCE_OR_RECOVERY_PRESENT');
  if(assertRecoverySettled){check();requireValue(await assertRecoverySettled({uploadId:m.uploadId,actorAccountId:m.actorAccountId,commandKey:m.commandKey,uploadKey:m.uploadKey})===undefined,'RECOVERY_UNRESOLVED');check();}
  return {uploadId:candidate.uploadId,directory,files};
}
export async function reclaimResources(input, options = {}) {
  const mode=options.mode??'dry-run',c=configuration(input,mode),io=options.io??nativeIO;
  const readOnly=mode==='dry-run'||c.resource==='media';
  const start=performance.now(),signal=options.signal;const check=()=>{requireValue(!signal?.aborted,'CANCELLED');requireValue(performance.now()-start<c.limits.maxDurationMillis,'TIME_BUDGET_EXCEEDED');};
  const pool=options.pool??new BoundedPostgresPool(c.postgres);let client,began=false,commitAttempted=false,discard,mutations=0,mediaStarted=false;
  const report={format:'H06_RESOURCE_RECLAIM_V1',mode,resource:c.resource,status:'REFUSED',eligible:0,kept:0,mutations:0,reason:'NOT_STARTED'};
  try {
    check();client=await pool.connect();await client.query(`BEGIN ISOLATION LEVEL READ COMMITTED ${readOnly?'READ ONLY':'READ WRITE'}`);began=true;
    const id=one(await client.query(RECLAIM_IDENTITY_SQL)),e=c.expected;
    requireValue(id.database===e.database&&id.role===e.role&&id.database_oid===e.databaseOid&&id.postmaster_start===e.postmasterStart
      && id.read_only===(readOnly?'on':'off')&&Number.isFinite(Date.parse(id.observed_at))&&Date.parse(c.cutoff)<=Date.parse(id.observed_at),'EXACT_TARGET_OR_CUTOFF_MISMATCH');
    if(c.resource==='sessions'){
      const plan=[];
      for(const account of [...c.accountIds].sort()){
        check();const a=await client.query(SESSION_ACCOUNT_SQL+(mode==='apply-isolated'?' FOR UPDATE OF a,s':''),[account]);requireValue(a.rows.length===1&&a.rows[0].id===account,'ACCOUNT_UNAVAILABLE');
        const result=await client.query(SESSION_ROWS_SQL+(mode==='apply-isolated'?' FOR UPDATE':''),[account,c.cutoff,c.limits.maxRows+1]);
        requireValue(Array.isArray(result.rows)&&result.rows.length<=c.limits.maxRows,'SESSION_BOUND_EXCEEDED');
        const rows=result.rows;requireValue(rows.every(x=>digest(x.token_hash)&&typeof x.revoked==='boolean'&&typeof x.expired==='boolean')&&new Set(rows.map(x=>x.token_hash)).size===rows.length,'SESSION_METADATA_UNAVAILABLE');
        const keeper=rows[0]?.token_hash,remove=rows.slice(1).filter(x=>x.revoked&&x.expired).map(x=>x.token_hash);
        report.eligible+=remove.length;report.kept+=rows.length-remove.length;plan.push({account,keeper,remove});
      }
      requireValue(Buffer.byteLength(JSON.stringify(plan))<=c.limits.maxBytes,'BYTE_BOUND_EXCEEDED');
      report.planHash=sha(JSON.stringify({resource:c.resource,expected:c.expected,cutoff:c.cutoff,plan}));
      if(mode==='apply-isolated'){
        requireValue(report.planHash===c.approval.planHash,'APPROVED_PLAN_CHANGED');
        for(const p of plan){check();if(!p.remove.length)continue;const result=await client.query(SESSION_DELETE_SQL,[p.account,p.remove,c.cutoff,p.keeper]);requireValue(result.rowCount===p.remove.length,'DELETE_COUNT_CHANGED');mutations+=result.rowCount;}
        check();commitAttempted=true;await client.query('COMMIT');began=false;
      }
    }else{
      const perform=async (assertHeld,assertRecoverySettled)=>{
        const plans=[];let bytes=0;
        for(const candidate of c.media.candidates){check();const plan=await mediaCandidate(c,candidate,client,io,check,assertHeld,assertRecoverySettled);bytes+=plan.files.reduce((n,f)=>n+f.bytes.length,0);requireValue(bytes<=c.limits.maxBytes,'BYTE_BOUND_EXCEEDED');plans.push(plan);}
        report.eligible=plans.length;
        report.planHash=sha(JSON.stringify({resource:c.resource,expected:c.expected,cutoff:c.cutoff,root:c.media.root,
          files:plans.map(p=>({uploadId:p.uploadId,files:p.files.map(f=>({name:f.name,dev:f.dev,ino:f.ino,hash:f.hash}))}))}));
        if(mode==='dry-run')return;
        requireValue(report.planHash===c.approval.planHash,'APPROVED_PLAN_CHANGED');
        requireValue(typeof c.media.recoveryRoot==='string'&&path.isAbsolute(c.media.recoveryRoot)&&!inside(c.media.root,c.media.recoveryRoot)&&!inside(c.media.recoveryRoot,c.media.root),'SEPARATE_RECOVERY_REQUIRED');
        for(const p of plans)for(const f of p.files){const backup=await boundedFile(path.join(c.media.recoveryRoot,'stages',p.uploadId,f.name),f.bytes.length,io,check);requireValue(sha(backup.bytes)===f.hash,'RECOVERY_BYTES_UNVERIFIED');}
        for(let i=0;i<plans.length;i++){
          const p=plans[i];check();await assertHeld();
          const fresh=await mediaCandidate(c,c.media.candidates[i],client,io,check,assertHeld,assertRecoverySettled);
          requireValue(JSON.stringify(fresh.files.map(f=>[f.name,f.dev,f.ino,f.hash]))===JSON.stringify(p.files.map(f=>[f.name,f.dev,f.ino,f.hash])),'CANDIDATE_CHANGED');
          for(const f of p.files){check();await assertHeld();const current=await io.lstat(path.join(p.directory,f.name));requireValue(current.dev===f.dev&&current.ino===f.ino&&current.nlink===1&&!current.isSymbolicLink(),'CANDIDATE_CHANGED');mediaStarted=true;await io.unlink(path.join(p.directory,f.name));mutations++;}
          check();await assertHeld();await io.rmdir(p.directory);mutations++;
        }
      };
      if(mode==='dry-run')await perform();
      else {
        requireValue(typeof options.withOfflineFence==='function','REAL_OFFLINE_FENCE_UNAVAILABLE');let calls=0,completed=false,fenceActive=true;
        try {
        await options.withOfflineFence({expected:c.expected,root:c.media.root,approval:c.approval},async guard=>{
          requireValue(calls++===0&&typeof guard?.assertHeld==='function'&&typeof guard?.assertRecoverySettled==='function','REAL_OFFLINE_FENCE_UNAVAILABLE');
          const held=async()=>{check();requireValue(fenceActive,'REAL_OFFLINE_FENCE_UNAVAILABLE');requireValue(await guard.assertHeld()===undefined,'REAL_OFFLINE_FENCE_UNAVAILABLE');check();};await held();await perform(held,guard.assertRecoverySettled.bind(guard));await held();completed=true;
        });requireValue(calls===1&&completed,'REAL_OFFLINE_FENCE_UNAVAILABLE');
        } finally { fenceActive=false; }
      }
    }
    if(began){await client.query('ROLLBACK');began=false;}
    report.status=mode==='dry-run'?'DRY_RUN':'APPLIED';report.reason=mode==='dry-run'?'PREVIEW_NOT_DELETION_AUTHORITY':'EXACT_ISOLATED_SCOPE_COMPLETED';report.mutations=mode==='dry-run'?0:mutations;
  }catch(error){
    report.reason=['CANCELLED','TIME_BUDGET_EXCEEDED','APPROVED_PLAN_CHANGED','REAL_OFFLINE_FENCE_UNAVAILABLE'].includes(error?.message)?error.message:'EVIDENCE_OR_EXECUTION_UNAVAILABLE';
    if(commitAttempted){report.status='OUTCOME_UNKNOWN';report.mutations=null;report.reason='COMMIT_OUTCOME_UNKNOWN_USE_ORIGINAL_PLAN';discard=Error('RECLAIM_COMMIT_UNKNOWN');}
    else if(mediaStarted){report.status='RESTORE_REQUIRED';report.reason='PARTIAL_MEDIA_RECLAIM_RESTORE_FROM_VERIFIED_BACKUP';report.mutations=mutations;discard=Error('RECLAIM_PARTIAL_MEDIA');}
    if(began&&!commitAttempted)try{await client.query('ROLLBACK');began=false;}catch{report.status='OUTCOME_UNKNOWN';report.reason='ROLLBACK_UNCONFIRMED';discard=Error('RECLAIM_ROLLBACK_UNKNOWN');}
  }finally{
    if(client)try{client.release(discard);}catch{report.status='OUTCOME_UNKNOWN';report.reason='RELEASE_UNCONFIRMED';}
    if(!options.pool)try{await pool.dispose();}catch{report.status='OUTCOME_UNKNOWN';report.reason='POOL_DISPOSAL_UNCONFIRMED';}
  }
  return report;
}
async function privateConfig(filename){requireValue(typeof filename==='string'&&path.isAbsolute(filename),'PRIVATE_CONFIG_REQUIRED');return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode((await boundedFile(filename,65536,nativeIO,()=>{})).bytes));}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{requireValue(process.argv.length===4||process.argv.length===5,'EXPLICIT_CONFIG_REQUIRED');requireValue(process.argv[2]==='--config'&&(!process.argv[4]||process.argv[4]==='--apply-isolated'),'EXPLICIT_CONFIG_REQUIRED');
    const result=await reclaimResources(await privateConfig(process.argv[3]),{mode:process.argv[4]?'apply-isolated':'dry-run'});console.log(JSON.stringify(result));process.exitCode=['DRY_RUN','APPLIED'].includes(result.status)?0:2;
  }catch{console.error(JSON.stringify({status:'REFUSED',reason:'EXPLICIT_PRIVATE_CONFIGURATION_UNAVAILABLE'}));process.exitCode=2;}
}
