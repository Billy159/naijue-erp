// Original historical header stage consumer only. No server job, pool/driver constructor or source factory.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { prepareRetainedTransferHeaderProjectionWindow } from './prepare-retained-transfer-header-window-20261025-v2.mjs';
const MAX=4*1024*1024, INDEX_MAX=16*1024*1024;
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const safe=e=>({code:typeof e?.code==='string'&&/^[A-Z0-9_]{2,100}$/.test(e.code)?e.code:'RETAINED_HEADER_CONSUMER_FAILED'});
// Only explicit T45 fixed private capture paths. No source loader, directory scan or cache.
export async function openRetainedTransferHeaderFiles(refs, signal) {
 const files=new Map();let closed=false;
 const active=()=>need(!closed&&!signal?.aborted,'HEADER_RETAINED_FILES_CLOSED');
 const same=(a,b)=>['dev','ino','size','mode','mtimeMs','ctimeMs'].every(key=>a[key]===b[key]);
 const close=async()=>{if(closed)return;closed=true;const results=await Promise.allSettled([...files.values()].map(f=>f.fd.close()));files.clear();const failed=results.filter(r=>r.status==='rejected');if(failed.length)throw new AggregateError(failed.map(r=>r.reason),'Retained header file close failed');};
 try {
  for(const role of ['index','source','typed','document']){
   active();const ref=refs[role];need(typeof ref?.path==='string'&&ref.path.startsWith('/')&&Number.isSafeInteger(ref.bytes)&&ref.bytes>0,'HEADER_EXPLICIT_RETAINED_FILE_REQUIRED');
   const stat=await lstat(ref.path);need(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0&&stat.size===ref.bytes,'HEADER_PRIVATE_RETAINED_FILE');
   const fd=await open(ref.path,constants.O_RDONLY|constants.O_NOFOLLOW);files.set(role,{fd,stat,ref});need(same(stat,await fd.stat()),'HEADER_RETAINED_FILE_CHANGED');
  }
  const verify=async()=>{active();for(const f of files.values()){need(same(f.stat,await f.fd.stat())&&same(f.stat,await lstat(f.ref.path)),'HEADER_RETAINED_FILE_CHANGED');active();}};
  return {verify,close,async indexBytes(){await verify();const f=files.get('index');need(f.stat.size<=INDEX_MAX,'HEADER_INDEX_BOUND');return f.fd.readFile();},
   async readRange(role,offset,bytes){active();const f=files.get(role);need(role!=='index'&&f&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(bytes)&&bytes>0&&bytes<=MAX&&offset+bytes<=f.stat.size,'HEADER_RETAINED_RANGE_BOUND');
    const value=Buffer.allocUnsafe(bytes);let n=0;while(n<bytes){const got=await f.fd.read(value,n,bytes-n,offset+n);active();need(got.bytesRead>0,'HEADER_RETAINED_RANGE_EOF');n+=got.bytesRead;}return value;}
  };
 } catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Retained header open and close failed');}throw error;}
}
export const HEADER_WINDOW_READBACK_SQL=`WITH expected AS (
 SELECT value AS facts,ordinality AS ordinal FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY
) SELECT e.ordinal::text AS ordinal,s.id AS source_id,h.id AS header_id,
 (SELECT count(*)::text FROM naijue_erp.import_source_row x
  WHERE x.id=(e.facts->'source'->>'id')::uuid OR (x.batch_id=(e.facts->'source'->>'batch_id')::uuid
   AND ((x.entity_type='TRANSFER_HEADER' AND x.source_key=e.facts->'source'->>'source_key')
    OR (x.source_file_sha256=e.facts->'source'->>'source_file_sha256' AND x.sheet=e.facts->'source'->>'sheet'
     AND x.row_no=(e.facts->'source'->>'row_no')::bigint)))) AS source_candidates,
 to_jsonb(s) IS NOT DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.facts->'source')) AS source_equal,
 to_jsonb(h) IS NOT DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.history_transfer_header,e.facts->'header')) AS header_equal
 FROM expected e LEFT JOIN naijue_erp.import_source_row s ON s.id=(e.facts->'source'->>'id')::uuid
 LEFT JOIN naijue_erp.history_transfer_header h ON h.source_row_id=s.id AND h.batch_id=s.batch_id ORDER BY e.ordinal`;
export async function readRetainedHeaderWindow(issued, expected, signal) {
 need(expected.length>0&&expected.length<=100,'HEADER_READBACK_WINDOW_BOUND');
 let client,began=false,committing=false,discard;
 try {
  need(!signal?.aborted,'HEADER_CONSUMER_ABORTED');client=await issued.pool.connect();
  await issued.runtime26.assertReady(client,'IMPORT_STAGE');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;
  need(!signal?.aborted,'HEADER_CONSUMER_ABORTED');const result=await client.query(HEADER_WINDOW_READBACK_SQL,[JSON.stringify(expected)]);
  need(!signal?.aborted,'HEADER_CONSUMER_ABORTED');committing=true;await client.query('COMMIT');return result.rows;
 } catch(error) {
  if(!began||committing)discard=error instanceof Error?error:true;
  if(client&&began&&!committing)try{await client.query('ROLLBACK');}catch(rollback){discard=rollback;throw new AggregateError([error,rollback],'Historical header readback failed');}
  throw error;
 } finally {if(client)client.release(discard);}
}
function checkedReadback(rows,expected,complete) {
 need(Array.isArray(rows)&&rows.length===expected.length,'HEADER_READBACK_CARDINALITY');
 let found=0;
 for(let i=0;i<expected.length;i++){
  const r=rows[i],e=expected[i];need(r.ordinal===String(i+1),'HEADER_READBACK_ORDER');
  const exact=r.source_id===e.source.id&&r.header_id===e.header.id&&r.source_candidates==='1'&&r.source_equal===true&&r.header_equal===true;
  const absent=r.source_id===null&&r.header_id===null&&r.source_candidates==='0';
  need(exact||!complete&&absent,'HEADER_READBACK_CONFLICT_PARTIAL_OR_MISSING');if(exact)found++;
 }return found;
}
function checkedIndex(bytes,spec){
 need(bytes instanceof Uint8Array&&bytes.byteLength===spec.index.bytes&&bytes.byteLength<=INDEX_MAX&&sha(bytes)===spec.index.sha256,'HEADER_RETAINED_INDEX_PIN');
 const text=new TextDecoder('utf8',{fatal:true}).decode(bytes);need(text.endsWith('\n'),'HEADER_INDEX_EOF');
 const rows=text.slice(0,-1).split('\n').map(line=>JSON.parse(line));need(rows.length===spec.rows&&rows.length>0&&rows.length<=14279,'HEADER_INDEX_COUNT');
 for(const field of ['headerId','headerSourceRowId','sourceKey'])need(new Set(rows.map(r=>r[field])).size===rows.length,'HEADER_INDEX_DUPLICATE');
 rows.sort((a,b)=>a.source.offset-b.source.offset);
 for(const role of ['source','typed','document']){
  let next=0;
  for(const row of rows){const ref=row[role];need(Number.isSafeInteger(ref.offset)&&ref.offset===next&&Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&ref.bytes<=MAX&&/^[a-f0-9]{64}$/.test(ref.sha256),'HEADER_ORIGINAL_ORDER_OR_RANGE');next+=ref.bytes;}
  need(next===spec[role].bytes,'HEADER_COMPLETE_FILE_RANGES');
 }return rows;
}
export async function runRetainedTransferHeaders({source,scope,executionInput,retained,authority,store,readbackWindow,recordProgress,signal}){
 const result={status:'STARTED',phase:'INPUT',rowsPrepared:0,chunksPrepared:0,authorizedRows:0,attemptedRows:0,commitReturnedRows:0,inserted:0,replayed:0,readbackConfirmedRows:0,current:null,automaticRetry:false,published:false,posted:false,cleanup:{retainedClosed:false,authorityClosed:false}};
 const active=()=>need(!signal?.aborted,'HEADER_CONSUMER_ABORTED');
 const grant=async(name,...args)=>{active();const input=structuredClone(args),before=structuredClone(input);need(await authority[name](...input)===undefined,'HEADER_AUTHORITY_RETURN');assert.deepEqual(input,before);active();};
 const emit=async event=>{await recordProgress(structuredClone(event));active();};
 try {
  scope=structuredClone(scope);executionInput=structuredClone(executionInput);
  need(executionInput?.executionEnabled===true&&executionInput.action==='TRANSFER_HEADER_RETAINED_ORIGINAL_STAGE_ONLY'&&/^[a-f0-9]{40}$/.test(executionInput.writerSourceCommit??''),'HEADER_T45_FIXED_ENABLED_INPUT_REQUIRED');
  need(scope&&scope.rows>0&&scope.rows<=14279&&scope.chunks>0&&typeof scope.preparedFingerprintStreamSha256==='string','HEADER_FIXED_SCOPE_REQUIRED');
  need(['prepareV3HistoryHeaderChunk','validatePreparedHistoryHeaderChunk','transferHeaderProjection26'].every(k=>typeof source?.[k]==='function'),'HEADER_ORIGINAL_SOURCE_EXPORTS');
  need(['verifyInputs','assertExecutionAllowed','authorizeStep','close'].every(k=>typeof authority?.[k]==='function')&&typeof store?.stage==='function'&&typeof readbackWindow==='function'&&typeof recordProgress==='function','HEADER_ORIGINAL_AUTHORITIES_REQUIRED');
  result.phase='FIXED_CAPTURE_SOURCE_AND_TARGET_AUTHORITY';await grant('verifyInputs',{scope,executionInput});await grant('assertExecutionAllowed',scope.binding);
  const index=checkedIndex(await retained.indexBytes(),scope),fold=createHash('sha256');let inputs=[],expected=[],inputBytes=2;
  async function flush(){
   if(!inputs.length)return;active();const chunk=source.prepareV3HistoryHeaderChunk(inputs);source.validatePreparedHistoryHeaderChunk(chunk);
   const firstIndex=result.rowsPrepared-inputs.length,lastIndex=result.rowsPrepared-1;
   result.chunksPrepared++;result.current={firstIndex,lastIndex,rows:inputs.length,commitReturned:false,keys:chunk.rows.map(r=>({headerId:r.prepared.header.id,sourceRowId:r.prepared.source.id,sourceKey:r.prepared.source.sourceKey,fingerprint:r.prepared.fingerprint}))};
   result.phase='BEFORE_KEYED_RR';checkedReadback(await readbackWindow(expected,signal),expected,false);active();
   result.phase='AUTHORIZE_ORIGINAL_HEADER_CHUNK';await grant('verifyInputs',{scope,executionInput,firstIndex,lastIndex});await grant('assertExecutionAllowed',scope.binding);
   await grant('authorizeStep',{kind:'HEADER',payload:chunk},scope.binding);result.authorizedRows+=chunk.rows.length;
   await emit({event:'HEADER_CHUNK_AUTHORIZED_BEFORE_STAGE',...result.current});
   result.phase='ORIGINAL_HEADER_STAGE';result.current.outcome='IN_FLIGHT_OR_UNCONFIRMED';result.attemptedRows+=chunk.rows.length;
   const actual=await store.stage(chunk);result.current.commitReturned=true;result.current.returned=actual;result.current.outcome='COMMIT_RETURNED';result.commitReturnedRows+=chunk.rows.length;
   need(Number.isSafeInteger(actual.inserted)&&Number.isSafeInteger(actual.replayed)&&actual.inserted>=0&&actual.replayed>=0&&actual.inserted+actual.replayed===chunk.rows.length,'HEADER_ORIGINAL_STAGE_RETURN');
   result.inserted+=actual.inserted;result.replayed+=actual.replayed;await emit({event:'HEADER_CHUNK_COMMIT_RETURNED',...result.current});
   result.phase='AFTER_KEYED_RR';checkedReadback(await readbackWindow(expected,signal),expected,true);active();
   result.readbackConfirmedRows+=chunk.rows.length;await emit({event:'HEADER_CHUNK_READBACK_CONFIRMED',firstIndex,lastIndex,rows:chunk.rows.length,confirmedRows:result.readbackConfirmedRows});
   inputs=[];expected=[];inputBytes=2;
  }
  for(const entry of index){
   active();await retained.verify();const values={};
   for(const role of ['source','typed','document']){const ref=entry[role],bytes=await retained.readRange(role,ref.offset,ref.bytes);active();need(bytes instanceof Uint8Array&&bytes.byteLength===ref.bytes&&sha(bytes)===ref.sha256,'HEADER_RETAINED_ROW_CHANGED');values[role]=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));}
   need(values.source.key===entry.headerSourceRowId&&values.typed.key===entry.headerId&&values.document.headerId===entry.headerId&&values.document.headerSourceRowId===entry.headerSourceRowId&&values.document.sourceKey===entry.sourceKey,'HEADER_INDEX_ROW_IDENTITY');
   const restored=prepareRetainedTransferHeaderProjectionWindow(source,{version:'EXISTING_TRANSFER_HEADER_RETAINED_SINGLE_WINDOW_V1',binding:scope.binding,sourceProjection:values.source,typedProjection:values.typed,documentAllocation:values.document});
   const row=restored.chunk.rows[0];need(row.prepared.selection.selectionSha256===scope.binding.selectionSha256,'HEADER_SELECTED_SOURCE_BINDING');
   const bytes=Buffer.byteLength(JSON.stringify(row.input));
   if(inputs.length&&(inputs.length===100||inputBytes+bytes+1>MAX))await flush();
   inputs.push(row.input);inputBytes+=bytes+1;expected.push({source:values.source.projection,header:values.typed.projection});
   result.rowsPrepared++;fold.update(row.prepared.fingerprint+'\n');
  }
  // Preserve original source chunks/order, <=100 headers/4MiB; no v18 stageBatch.
  await flush();result.phase='COMPLETE_CAPTURE_EOF';await retained.verify();active();
  need(result.rowsPrepared===scope.rows&&result.chunksPrepared===scope.chunks&&result.readbackConfirmedRows===scope.rows&&fold.digest('hex')===scope.preparedFingerprintStreamSha256,'HEADER_CAPTURE_FINAL_COUNTS_OR_FINGERPRINT_FOLD');
  result.status='COMPLETE_ORIGINAL_HEADER_STAGE_AND_PER_CHUNK_RR_READBACK_NOT_PUBLICATION';result.readbackConsistency='PER_CHUNK_RR_BEFORE_AFTER_NOT_GLOBAL_SNAPSHOT';
 } catch(error){result.firstError={phase:result.phase,...safe(error)};result.status=result.current?.outcome==='IN_FLIGHT_OR_UNCONFIRMED'?'STOPPED_CURRENT_ORIGINAL_CHUNK_OUTCOME_UNKNOWN_NO_RETRY':'STOPPED_PRESERVE_RETURNED_COMMITS_NO_RETRY';}
 finally {
  for(const [object,key] of [[retained,'retainedClosed'],[authority,'authorityClosed']])try{if(typeof object?.close==='function'){await object.close();result.cleanup[key]=true;}}catch(error){result.cleanup[key+'Error']=safe(error);}
  if(result.cleanup.retainedClosedError||result.cleanup.authorityClosedError){result.statusBeforeCleanupFailure=result.status;result.status='STOPPED_CLEANUP_FAILURE_PRESERVE_ALL_COMMIT_FACTS';}
 }return result;
}
