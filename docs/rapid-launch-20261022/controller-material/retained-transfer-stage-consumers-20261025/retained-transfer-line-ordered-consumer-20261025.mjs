// Original transfer-line retained stage; no source factory, new writer, pool/driver or server job.
import{createHash}from'node:crypto';import{constants}from'node:fs';import{open,lstat}from'node:fs/promises';import assert from'node:assert/strict';
import{prepareRetainedTransferLineWindow}from'./prepare-retained-transfer-line-window-20261025.mjs';
const MAX=4194304,FRAME=65536;const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const safe=e=>({code:typeof e?.code==='string'&&/^[A-Z0-9_]{2,100}$/.test(e.code)?e.code:'RETAINED_TRANSFER_LINE_FAILED'});
const uuid=b=>{const s=b.toString('hex');return`${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;};
export async function openRetainedTransferLineFiles(refs,signal){
 const files=new Map();let closed=false;const active=()=>need(!closed&&!signal?.aborted,'LINE_RETAINED_FILES_CLOSED');
 const same=(a,b)=>['dev','ino','mode','size','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);
 const close=async()=>{if(closed)return;closed=true;const results=await Promise.allSettled([...files.values()].map(f=>f.fd.close()));files.clear();const errors=results.filter(r=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Line file cleanup failed');};
 try{
  for(const role of['index','source','typed']){active();const ref=refs[role];need(ref?.path?.startsWith('/')&&Number.isSafeInteger(ref.bytes)&&ref.bytes>0,'LINE_EXPLICIT_FILE_REQUIRED');
   const stat=await lstat(ref.path);need(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0&&stat.size===ref.bytes,'LINE_PRIVATE_FILE_REQUIRED');
   const fd=await open(ref.path,constants.O_RDONLY|constants.O_NOFOLLOW);files.set(role,{ref,stat,fd});need(same(stat,await fd.stat()),'LINE_RETAINED_FILE_CHANGED');}
  const verify=async()=>{active();for(const f of files.values()){need(same(f.stat,await f.fd.stat())&&same(f.stat,await lstat(f.ref.path)),'LINE_RETAINED_FILE_CHANGED');active();}};
  const readRange=async(role,offset,bytes)=>{active();const f=files.get(role);need(f&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(bytes)&&bytes>0&&bytes<=MAX&&offset+bytes<=f.stat.size,'LINE_RANGE_BOUND');
   const b=Buffer.allocUnsafe(bytes);let n=0;while(n<bytes){const r=await f.fd.read(b,n,bytes-n,offset+n);active();need(r.bytesRead>0,'LINE_RANGE_EOF');n+=r.bytesRead;}return b;};
  return{verify,readRange,close,async verifyIndex(){await verify();const f=files.get('index'),digest=createHash('sha256');let n=0;
   while(n<f.stat.size){const b=await readRange('index',n,Math.min(FRAME,f.stat.size-n));digest.update(b);n+=b.length;}
   need(digest.digest('hex')===f.ref.sha256,'LINE_ACCEPTED_INDEX_PIN');await verify();}};
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Line file open/close failed');}throw error;}
}
export const LINE_WINDOW_READBACK_SQL=`WITH expected AS (
 SELECT value AS facts,ordinality AS ordinal FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY
) SELECT e.ordinal::text AS ordinal,s.id AS source_id,l.id AS line_id,
 (SELECT count(*)::text FROM naijue_erp.import_source_row x WHERE x.id=(e.facts->'source'->>'id')::uuid
  OR(x.batch_id=(e.facts->'source'->>'batch_id')::uuid AND((x.entity_type='TRANSFER_LINE' AND x.source_key=e.facts->'source'->>'source_key')
   OR(x.source_file_sha256=e.facts->'source'->>'source_file_sha256' AND x.sheet=e.facts->'source'->>'sheet' AND x.row_no=(e.facts->'source'->>'row_no')::bigint)))) AS source_candidates,
 to_jsonb(s) IS NOT DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.facts->'source')) AS source_equal,
 to_jsonb(l) IS NOT DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.history_transfer_line,e.facts->'line')) AS line_equal,
 EXISTS(SELECT 1 FROM naijue_erp.history_transfer_header h JOIN naijue_erp.import_source_row hs ON hs.id=h.source_row_id AND hs.batch_id=h.batch_id
  WHERE h.id=(e.facts->'line'->>'header_id')::uuid AND h.batch_id=(e.facts->'source'->>'batch_id')::uuid AND hs.entity_type='TRANSFER_HEADER'
   AND hs.source_key=e.facts->>'parentSourceKey' AND hs.id=(e.facts->>'parentSourceRowId')::uuid) AS parent_binding_match,
 EXISTS(SELECT 1 FROM naijue_erp.sku k JOIN naijue_erp.import_sku_alias a ON a.canonical_sku_id=k.id
  WHERE k.id=(e.facts->'line'->>'sku_id')::uuid AND a.batch_id=(e.facts->'source'->>'batch_id')::uuid
   AND a.canonical_source_key=e.facts->>'canonicalSourceKey' AND a.old_source_sku_id=e.facts->>'oldSkuSourceId') AS sku_alias_match
 FROM expected e LEFT JOIN naijue_erp.import_source_row s ON s.id=(e.facts->'source'->>'id')::uuid
 LEFT JOIN naijue_erp.history_transfer_line l ON l.id=(e.facts->'line'->>'id')::uuid ORDER BY e.ordinal`;
export async function readRetainedLineWindow(issued,expected,signal){
 need(expected.length>0&&expected.length<=200,'LINE_READBACK_WINDOW_BOUND');let client,began=false,committing=false,discard;
 try{need(!signal?.aborted,'LINE_CONSUMER_ABORTED');client=await issued.pool.connect();await issued.runtime26.assertReady(client,'IMPORT_STAGE');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;need(!signal?.aborted,'LINE_CONSUMER_ABORTED');
  const actual=await client.query(LINE_WINDOW_READBACK_SQL,[JSON.stringify(expected)]);need(!signal?.aborted,'LINE_CONSUMER_ABORTED');committing=true;await client.query('COMMIT');return actual.rows;
 }catch(error){if(!began||committing)discard=error instanceof Error?error:true;if(client&&began&&!committing)try{await client.query('ROLLBACK');}catch(rollback){discard=rollback;throw new AggregateError([error,rollback],'Line readback failed');}throw error;}
 finally{if(client)client.release(discard);}
}
function checkedReadback(rows,expected,complete){
 need(Array.isArray(rows)&&rows.length===expected.length,'LINE_READBACK_CARDINALITY');
 for(let i=0;i<expected.length;i++){const r=rows[i],e=expected[i];need(r.ordinal===String(i+1),'LINE_READBACK_ORDER');
  need(r.parent_binding_match===true&&r.sku_alias_match===true,'LINE_ACTUAL_PARENT_OR_SKU_ALIAS_MISSING');
  const exact=r.source_id===e.source.id&&r.line_id===e.line.id&&r.source_candidates==='1'&&r.source_equal===true&&r.line_equal===true;
  const absent=r.source_id===null&&r.line_id===null&&r.source_candidates==='0';need(exact||!complete&&absent,'LINE_READBACK_PARTIAL_CONFLICT_OR_MISSING');}
}
function indexLayout(header,scope){
 need(Buffer.isBuffer(header)&&header.length===64&&header.subarray(0,9).toString()==='TL26JOIN1'&&header.readUInt32LE(12)===1,'LINE_PACKED_INDEX_VERSION');
 const rows=header.readUInt32LE(16),parents=header.readUInt32LE(20),records=header.readUInt32LE(28),sourceOrder=header.readUInt32LE(32),typedOrder=header.readUInt32LE(36),directory=header.readUInt32LE(40);
 need(rows===scope.rows&&parents===scope.parents&&header.readUInt32LE(24)===256&&records===rows*256&&sourceOrder===rows*4&&typedOrder===rows*4&&directory===parents*36&&header.readUInt32LE(44)===64,'LINE_PACKED_INDEX_SHAPE');
 need(scope.index.bytes===64+records+sourceOrder+typedOrder+directory,'LINE_PACKED_INDEX_BYTES');return{rows,parents,directoryOffset:64+records+sourceOrder+typedOrder,directoryBytes:directory};
}
export async function runRetainedTransferLines({source,scope,executionInput,retained,authority,store,readbackWindow,recordProgress,signal}){
 const result={status:'STARTED',phase:'INPUT',preparedRows:0,preparedChunks:0,authorizedRows:0,attemptedRows:0,commitReturnedRows:0,inserted:0,replayed:0,readbackConfirmedRows:0,current:null,automaticRetry:false,posted:false,published:false,cleanup:{retainedClosed:false,authorityClosed:false}};
 const active=()=>need(!signal?.aborted,'LINE_CONSUMER_ABORTED');
 const grant=async(name,...args)=>{active();const values=structuredClone(args),before=structuredClone(values);need(await authority[name](...values)===undefined,'LINE_AUTHORITY_RETURN');assert.deepEqual(values,before);active();};
 const emit=async e=>{await recordProgress(structuredClone(e));active();};
 try{
  scope=structuredClone(scope);executionInput=structuredClone(executionInput);
  need(executionInput?.executionEnabled===true&&executionInput.action==='TRANSFER_LINE_RETAINED_ORIGINAL_STAGE_ONLY'&&/^[a-f0-9]{40}$/.test(executionInput.writerSourceCommit??''),'LINE_T45_FIXED_ENABLED_INPUT_REQUIRED');
  need(scope?.rows>0&&scope.rows<=261641&&scope.parents>0&&scope.parents<=14279&&scope.chunks>0&&/^[a-f0-9]{64}$/.test(scope.preparedFingerprintStreamSha256),'LINE_FIXED_ORIGINAL_SCOPE');
  need(['prepareV3HistoryChunk','validatePreparedHistoryChunk','historyClosureProjectionRow26','transferLineSourceEvidence26'].every(k=>typeof source?.[k]==='function'),'LINE_ORIGINAL_EXPORTS_REQUIRED');
  need(['verifyInputs','assertExecutionAllowed','authorizeStep','close'].every(k=>typeof authority?.[k]==='function')&&typeof store?.stage==='function'&&typeof readbackWindow==='function'&&typeof recordProgress==='function'&&typeof retained?.verifyIndex==='function','LINE_ORIGINAL_AUTHORITIES_REQUIRED');
  result.phase='FIXED_RETAINED_SOURCE_TARGET_AUTHORITY';await grant('verifyInputs',{scope,executionInput});await grant('assertExecutionAllowed',scope.binding);
  result.phase='AUTHENTICATE_EXISTING_PACKED_INDEX';await retained.verifyIndex();active();
  const layout=indexLayout(await retained.readRange('index',0,64),scope),directory=await retained.readRange('index',layout.directoryOffset,layout.directoryBytes);active();
  const parentCounts=new Uint32Array(scope.parents),parentIds=new Set(),parentSources=new Set();
  for(let i=0;i<scope.parents;i++){const at=i*36,id=uuid(directory.subarray(at,at+16)),sid=uuid(directory.subarray(at+16,at+32));need(!parentIds.has(id)&&!parentSources.has(sid)&&directory.readUInt32LE(at+32)>0,'LINE_PARENT_DIRECTORY');parentIds.add(id);parentSources.add(sid);}
  const fold=createHash('sha256');let inputRows=[],expected=[],selection,baseSize=0,size=0,sourceEnd=0,typedEnd=0;
  async function flush(){
   if(!inputRows.length)return;active();const chunk=source.prepareV3HistoryChunk({batchId:scope.binding.batchId,fixedSourceNamespace:scope.binding.fixedSourceNamespace,selection,rows:inputRows});source.validatePreparedHistoryChunk(chunk);
   const firstIndex=result.preparedRows-inputRows.length,lastIndex=result.preparedRows-1;result.preparedChunks++;
   result.current={firstIndex,lastIndex,rows:inputRows.length,commitReturned:false,keys:chunk.rows.map((r,i)=>({sourceRowId:r.source.id,sourceKey:r.source.sourceKey,lineId:r.line.id,headerId:r.line.header_id,parentSourceKey:r.source.normalizedFields['单据来源编号'],parentSourceRowId:expected[i].parentSourceRowId,skuId:r.line.sku_id,canonicalSourceKey:r.source.normalizedFields['SKU来源编号'],oldSkuSourceId:r.source.rawFields['SKU来源编号'],fingerprint:r.fingerprint}))};
   result.phase='BEFORE_KEYED_RR';checkedReadback(await readbackWindow(expected,signal),expected,false);active();
   result.phase='AUTHORIZE_ORIGINAL_TRANSFER_LINE_CHUNK';await grant('verifyInputs',{scope,executionInput,firstIndex,lastIndex});await grant('assertExecutionAllowed',scope.binding);await grant('authorizeStep',{kind:'TRANSFER_LINES',payload:chunk},scope.binding);result.authorizedRows+=chunk.rows.length;
   await emit({event:'TRANSFER_LINE_CHUNK_AUTHORIZED_BEFORE_STAGE',...result.current});result.phase='ORIGINAL_TRANSFER_LINE_STAGE';result.current.outcome='IN_FLIGHT_OR_UNCONFIRMED';result.attemptedRows+=chunk.rows.length;
   const actual=await store.stage(chunk);result.current.commitReturned=true;result.current.returned=actual;result.current.outcome='COMMIT_RETURNED';result.commitReturnedRows+=chunk.rows.length;
   need(Number.isSafeInteger(actual.inserted)&&Number.isSafeInteger(actual.replayed)&&actual.inserted>=0&&actual.replayed>=0&&actual.inserted+actual.replayed===chunk.rows.length,'LINE_ORIGINAL_STAGE_RETURN');result.inserted+=actual.inserted;result.replayed+=actual.replayed;
   await emit({event:'TRANSFER_LINE_CHUNK_COMMIT_RETURNED',...result.current});result.phase='AFTER_KEYED_RR';checkedReadback(await readbackWindow(expected,signal),expected,true);active();result.readbackConfirmedRows+=chunk.rows.length;
   await emit({event:'TRANSFER_LINE_CHUNK_READBACK_CONFIRMED',firstIndex,lastIndex,rows:chunk.rows.length,confirmedRows:result.readbackConfirmedRows});inputRows=[];expected=[];size=baseSize;
  }
  for(let first=0;first<layout.rows;first+=256){
   await retained.verify();const length=Math.min(256,layout.rows-first),block=await retained.readRange('index',64+first*256,length*256);active();need(block.length===length*256,'LINE_INDEX_RECORD_BLOCK');
   for(let j=0;j<length;j++){
    active();const at=j*256,parent=block.readUInt32LE(at),sourceOffset=Number(block.readBigUInt64LE(at+4)),sourceBytes=block.readUInt32LE(at+12),typedOffset=Number(block.readBigUInt64LE(at+16)),typedBytes=block.readUInt32LE(at+24);
    need(parent<scope.parents&&sourceOffset===sourceEnd&&typedOffset===typedEnd&&sourceBytes>0&&sourceBytes<=MAX&&typedBytes>0&&typedBytes<=MAX&&sourceOffset+sourceBytes<=scope.source.bytes&&typedOffset+typedBytes<=scope.typed.bytes,'LINE_ORIGINAL_ORDER_AND_RANGE');
    const values={};
    for(const role of['source','typed']){const isSource=role==='source',bytes=await retained.readRange(role,isSource?sourceOffset:typedOffset,isSource?sourceBytes:typedBytes);active();const hashAt=at+(isSource?192:224),keyAt=at+(isSource?64:128),keyLength=block[at+(isSource?60:61)];
     need(bytes instanceof Uint8Array&&bytes.length===(isSource?sourceBytes:typedBytes)&&sha(bytes)===block.subarray(hashAt,hashAt+32).toString('hex')&&keyLength>0&&keyLength<=64,'LINE_CAPTURED_RANGE_HASH');
     const row=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));need(row.key===block.subarray(keyAt,keyAt+keyLength).toString('utf8'),'LINE_PACKED_PRIMARY_KEY');values[role]=row;}
    const parentId=uuid(directory.subarray(parent*36,parent*36+16));need(values.source.key===uuid(block.subarray(at+28,at+44))&&values.typed.key===uuid(block.subarray(at+44,at+60))&&values.typed.projection.header_id===parentId,'LINE_ORIGINAL_PARENT_AND_IDENTITY');
    const restored=prepareRetainedTransferLineWindow(source,{binding:scope.binding,sourceProjection:values.source,typedProjection:values.typed}),row=restored.chunk.rows[0];
    if(!selection){selection=restored.chunk.selection;baseSize=Buffer.byteLength(JSON.stringify({batchId:scope.binding.batchId,fixedSourceNamespace:scope.binding.fixedSourceNamespace,selection,rows:[]}));size=baseSize;}else assert.deepEqual(restored.chunk.selection,selection);
    const input={source:row.source,header:{sourceKey:row.source.normalizedFields['单据来源编号'],nativeId:row.line.header_id},sku:{sourceKey:row.source.normalizedFields['SKU来源编号'],nativeId:row.line.sku_id}},bytes=Buffer.byteLength(JSON.stringify(input));
    need(bytes+baseSize<=MAX,'LINE_ORIGINAL_ROW_BYTE_BOUND');if(inputRows.length&&(inputRows.length===200||size+bytes+1>MAX))await flush();
    size+=bytes+(inputRows.length?1:0);inputRows.push(input);expected.push({source:values.source.projection,line:values.typed.projection,parentSourceKey:input.header.sourceKey,parentSourceRowId:uuid(directory.subarray(parent*36+16,parent*36+32)),canonicalSourceKey:input.sku.sourceKey,oldSkuSourceId:row.source.rawFields['SKU来源编号']});
    result.preparedRows++;parentCounts[parent]++;sourceEnd+=sourceBytes;typedEnd+=typedBytes;fold.update(row.fingerprint+'\n');
   }
  }
  await flush();result.phase='EXACT_RETAINED_EOF';await retained.verify();active();
  need(sourceEnd===scope.source.bytes&&typedEnd===scope.typed.bytes&&result.preparedRows===scope.rows&&result.preparedChunks===scope.chunks&&result.readbackConfirmedRows===scope.rows&&fold.digest('hex')===scope.preparedFingerprintStreamSha256,'LINE_EXACT_FINAL_COUNTS_OR_FINGERPRINT');
  for(let p=0;p<scope.parents;p++)need(parentCounts[p]===directory.readUInt32LE(p*36+32),'LINE_EXACT_ORIGINAL_PARENT_MEMBER_COUNTS');
  result.status='COMPLETE_ORIGINAL_TRANSFER_LINES_STAGE_AND_PER_CHUNK_RR_READBACK_NOT_PUBLICATION';result.readbackConsistency='PER_CHUNK_RR_BEFORE_AFTER_NOT_GLOBAL_SNAPSHOT';
 }catch(error){result.firstError={phase:result.phase,...safe(error)};result.status=result.current?.outcome==='IN_FLIGHT_OR_UNCONFIRMED'?'STOPPED_CURRENT_ORIGINAL_CHUNK_OUTCOME_UNKNOWN_NO_RETRY':'STOPPED_PRESERVE_RETURNED_COMMITS_NO_RETRY';}
 finally{for(const[object,key]of[[retained,'retainedClosed'],[authority,'authorityClosed']])try{if(typeof object?.close==='function'){await object.close();result.cleanup[key]=true;}}catch(error){result.cleanup[key+'Error']=safe(error);}if(result.cleanup.retainedClosedError||result.cleanup.authorityClosedError){result.statusBeforeCleanupFailure=result.status;result.status='STOPPED_CLEANUP_FAILURE_PRESERVE_COMMIT_FACTS';}}
 return result;
}
