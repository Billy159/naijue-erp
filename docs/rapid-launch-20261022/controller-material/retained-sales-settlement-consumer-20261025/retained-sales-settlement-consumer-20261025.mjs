// C144 retained transport + original readers/mappers/stores. No driver, job, MAIN or publication.
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,lstat,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const MAX=4194304,FRAME=65536;
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const sha=b=>createHash('sha256').update(b).digest('hex');
const same=(a,b)=>['dev','ino','size','mode','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);
const relation=e=>e==='SALES_LINE'?'history_sales_line':'history_sales_settlement';
const staging=e=>e==='SALES_LINE'?'history_sales_detail_staging':'history_settlement_staging';
const clean=e=>({code:/^[A-Z0-9_]{2,100}$/.test(e?.code??'')?e.code:'RETAINED_SALES_SETTLEMENT_FAILED'});

/** Compact key/offset/length/hash only; no complete typed/source payload retained.
 * The actual authorized run builds the missing typed locator once, never recaptures.
 * Each full stream checks its original C144 bytes/hash/EOF. No local real-data scan. */
export async function openRetainedSalesSettlementFiles({source,typed},signal){
 const files=new Map(),index=new Map();let closed=false,indexed=false;
 const active=()=>need(!closed&&!signal?.aborted,'SALES_RETAINED_CLOSED');
 const close=async()=>{if(closed)return;closed=true;index.clear();const r=await Promise.allSettled([...files.values()].map(f=>f.fd.close()));files.clear();const errors=r.filter(x=>x.status==='rejected');if(errors.length)throw new AggregateError(errors.map(x=>x.reason),'Retained close failed');};
 try{
  for(const [role,ref]of Object.entries({source,typed})){
   active();need(ref?.path?.startsWith('/')&&Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&Number.isSafeInteger(ref.rows)&&ref.rows>0&&ref.rows<=106697&&/^[a-f0-9]{64}$/.test(ref.sha256),'SALES_RETAINED_REF');
   const stat=await lstat(ref.path);need(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0&&stat.size===ref.bytes,'SALES_RETAINED_PRIVATE_FILE');
   const fd=await open(ref.path,constants.O_RDONLY|constants.O_NOFOLLOW);files.set(role,{ref:structuredClone(ref),stat,fd});need(same(stat,await fd.stat()),'SALES_RETAINED_CHANGED');
  }
  const verify=async()=>{active();for(const f of files.values())need(same(f.stat,await f.fd.stat())&&same(f.stat,await lstat(f.ref.path)),'SALES_RETAINED_CHANGED');active();};
  async function range(role,offset,bytes){active();const f=files.get(role);need(f&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(bytes)&&bytes>0&&bytes<=MAX&&offset+bytes<=f.stat.size,'SALES_RETAINED_RANGE');
   const out=Buffer.allocUnsafe(bytes);let n=0;while(n<bytes){const r=await f.fd.read(out,n,bytes-n,offset+n);active();need(r.bytesRead>0,'SALES_RETAINED_EOF');n+=r.bytesRead;}return out;
  }
  async function* scan(role){await verify();const f=files.get(role),digest=createHash('sha256');let position=0,start=0,pending=Buffer.alloc(0),rows=0,previous;
   while(position<f.ref.bytes){const bytes=await range(role,position,Math.min(FRAME,f.ref.bytes-position));digest.update(bytes);position+=bytes.length;pending=Buffer.concat([pending,bytes]);let at;
    while((at=pending.indexOf(10))>=0){need(at>0&&at+1<=MAX,'SALES_RETAINED_LINE_BOUND');const raw=pending.subarray(0,at+1),value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));
     need(value&&typeof value.key==='string'&&value.key.length<=128&&(previous===undefined||Buffer.compare(Buffer.from(previous),Buffer.from(value.key))<0),'SALES_RETAINED_KEY_ORDER');previous=value.key;
     need(++rows<=f.ref.rows,'SALES_RETAINED_ROWS');yield{value,offset:start,bytes:raw.length,sha256:sha(raw)};start+=raw.length;pending=pending.subarray(at+1);
    }need(pending.length<MAX,'SALES_RETAINED_LINE_BOUND');
   }
   need(pending.length===0&&start===f.ref.bytes&&rows===f.ref.rows&&digest.digest('hex')===f.ref.sha256,'SALES_RETAINED_EXACT_EOF');await verify();
  }
  return {verify,close,
   async buildTypedIndex(){need(!indexed,'SALES_RETAINED_INDEX_ALREADY_BUILT');for await(const r of scan('typed'))index.set(r.value.key,{offset:r.offset,bytes:r.bytes,sha256:r.sha256});indexed=true;},
   async *sourceRows(descriptor){need(indexed,'SALES_RETAINED_INDEX_REQUIRED');assert.deepEqual(descriptor,source);for await(const r of scan('source'))yield r.value;},
   async typedRow(descriptor,key){need(indexed,'SALES_RETAINED_INDEX_REQUIRED');assert.deepEqual(descriptor,typed);const at=index.get(key);need(at,'SALES_RETAINED_TYPED_KEY_MISSING');const raw=await range('typed',at.offset,at.bytes);need(sha(raw)===at.sha256,'SALES_RETAINED_TYPED_CHANGED');const row=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));need(row.key===key,'SALES_RETAINED_TYPED_KEY_MISMATCH');return row;},
  };
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Retained open cleanup failed');}throw error;}
}

export async function loadOriginalSalesSettlement(sourceRoot,entity,pool,runtime26,binding){
 need(['SALES_LINE','SETTLEMENT'].includes(entity)&&sourceRoot.startsWith('/'),'SALES_ORIGINAL_ENTITY');
 const load=p=>import(pathToFileURL(sourceRoot+'/'+p).href),sales=entity==='SALES_LINE';
 const [reader,mapper,stores,closure,identity]=await Promise.all([
  load('scripts/import-v2/authorized-'+(sales?'sales-detail':'settlement')+'-reader.mjs'),
  load('packages/application/src/import-v3-history-'+(sales?'sales-detail':'settlement')+'.ts'),
  load('adapters/postgres/src/import-v3-history-'+(sales?'sales-detail':'settlement')+'-staging-store.ts'),
  load('packages/application/src/history-typed-closure.ts'),load('packages/application/src/inventory-cutoff-import.ts')]);
 const scope={batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selectionSha256:binding.selectionSha256};
 const Store=stores[sales?'PostgresHistorySalesDetailStagingStore26':'PostgresHistorySettlementStagingStore26'];
 return {typedKey:(key,namespace,entity)=>identity.stableImportId(entity==='SALES_LINE'?'history-sales-line':'history-sales-settlement',namespace,key),openReader:reader[sales?'openAuthorizedSalesDetailReader':'openAuthorizedSettlementReader'],
  prepare:mapper[sales?'prepareHistorySalesDetailChunk':'prepareHistorySettlementChunk'],
  validate:mapper[sales?'validatePreparedHistorySalesDetailChunk':'validatePreparedHistorySettlementChunk'],
  resolveNativeBinding:stores[sales?'createPostgresHistorySalesDetailBindingResolver26':'createPostgresHistorySettlementBindingResolver26'](pool,scope,runtime26),
  project:closure.historyClosureProjectionRow26,store:new Store(pool,runtime26)};
}

// Full SQL row images, including NULL/JSON/numeric types, compared to original retained projections.
export function salesSettlementReadbackSql(entity){
 need(['SALES_LINE','SETTLEMENT'].includes(entity),'SALES_READBACK_ENTITY');const table=relation(entity);
 return `WITH expected AS(SELECT value facts,ordinality FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY)
 SELECT e.ordinality::text ordinal,s.id source_id,t.id typed_id,
 (SELECT count(*)::text FROM naijue_erp.import_source_row x WHERE x.id=(e.facts->'source'->>'id')::uuid
 OR(x.batch_id=(e.facts->'source'->>'batch_id')::uuid AND((x.entity_type='${entity}' AND x.source_key=e.facts->'source'->>'source_key')
 OR(x.source_file_sha256=e.facts->'source'->>'source_file_sha256' AND x.sheet=e.facts->'source'->>'sheet' AND x.row_no=(e.facts->'source'->>'row_no')::bigint)))) source_candidates,
 (SELECT count(*)::text FROM naijue_erp.${table} x WHERE x.id=(e.facts->'typed'->>'id')::uuid OR(x.batch_id=(e.facts->'source'->>'batch_id')::uuid AND x.source_row_id=(e.facts->'source'->>'id')::uuid)) typed_candidates,
 to_jsonb(s) IS NOT DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.facts->'source')) source_equal,
 to_jsonb(t) IS NOT DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.${table},e.facts->'typed')) typed_equal
 FROM expected e LEFT JOIN naijue_erp.import_source_row s ON s.id=(e.facts->'source'->>'id')::uuid
 LEFT JOIN naijue_erp.${table} t ON t.id=(e.facts->'typed'->>'id')::uuid ORDER BY e.ordinality`;
}
export function checkSalesSettlementReadback(rows,expected,complete){
 need(Array.isArray(rows)&&rows.length===expected.length,'SALES_READBACK_CARDINALITY');
 rows.forEach((r,i)=>{const e=expected[i];need(r.ordinal===String(i+1),'SALES_READBACK_ORDER');
  const exact=r.source_id===e.source.id&&r.typed_id===e.typed.id&&r.source_candidates==='1'&&r.typed_candidates==='1'&&r.source_equal===true&&r.typed_equal===true;
  const absent=r.source_id===null&&r.typed_id===null&&r.source_candidates==='0'&&r.typed_candidates==='0';need(exact||!complete&&absent,'SALES_READBACK_PARTIAL_CONFLICT_OR_MISSING');});
}
export async function withSalesSettlementReadback({pool,runtime26,entity,signal},work){
 need(['SALES_LINE','SETTLEMENT'].includes(entity),'SALES_READBACK_ENTITY');
 let client,began=false,committing=false,discard;const active=()=>need(!signal?.aborted,'SALES_CONSUMER_ABORTED');
 try{active();client=await pool.connect();await runtime26.assertReady(client,'IMPORT_STAGE');await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;
  const api={async window(expected,complete){active();need(expected.length>0&&expected.length<=100&&Buffer.byteLength(JSON.stringify(expected))<=MAX,'SALES_READBACK_BOUND');checkSalesSettlementReadback((await client.query(salesSettlementReadbackSql(entity),[JSON.stringify(expected)])).rows,expected,complete);active();},
   async counts(batchId,count){active();const r=(await client.query(`SELECT (SELECT count(*)::text FROM naijue_erp.import_source_row WHERE batch_id=$1::uuid AND entity_type=$2) source_count,(SELECT count(*)::text FROM naijue_erp.${relation(entity)} WHERE batch_id=$1::uuid) typed_count`,[batchId,entity])).rows;
    need(r.length===1&&r[0].source_count===String(count)&&r[0].typed_count===String(count),'SALES_FINAL_EXACT_COUNTS');}};
  await work(api);active();committing=true;await client.query('COMMIT');
 }catch(error){if(!began||committing)discard=error instanceof Error?error:true;if(client&&began&&!committing)try{await client.query('ROLLBACK');}catch(rollback){discard=rollback;throw new AggregateError([error,rollback],'Sales readback rollback failed');}throw error;}
 finally{client?.release(discard);}
}

/** One entity per T45 call. All rows remain required: missing/nullable-v5 parent is
 * rejected by original resolver, never skipped or relabelled COMPLETE. */
export async function runRetainedSalesSettlement({entity,scope,executionInput,readerOptions,original,retained,authority,readback,recordProgress,signal}){
 const result={status:'STARTED',phase:'INPUT',preparedRows:0,attemptedRows:0,commitReturnedRows:0,inserted:0,replayed:0,readbackConfirmedRows:0,finalConfirmedRows:0,current:null,automaticRetry:false,MAIN:false,PUBLISH:false};let raw;
 const active=()=>need(!signal?.aborted,'SALES_CONSUMER_ABORTED');
 const grant=async(name,...args)=>{active();const v=structuredClone(args),before=structuredClone(v);need(await authority[name](...v)===undefined,'SALES_AUTHORITY_RETURN');assert.deepEqual(v,before);active();};
 const emit=async event=>{await recordProgress(structuredClone(event));active();};
 try{
  scope=structuredClone(scope);executionInput=structuredClone(executionInput);
  need(['SALES_LINE','SETTLEMENT'].includes(entity)&&scope.rows===(entity==='SALES_LINE'?80918:25779),'SALES_FIXED_ENTITY_ROWS');
  need(executionInput.executionEnabled===true&&executionInput.action==='SALES_SETTLEMENT_RETAINED_ORIGINAL_STAGE_ONLY'&&executionInput.writerSourceCommit==='34eff658e4caef590a77326c75917e391357529d','SALES_T45_FIXED_ENABLED_INPUT');
  need(readerOptions.batchId===scope.binding.batchId&&readerOptions.fixedSourceNamespace===scope.binding.fixedSourceNamespace&&readerOptions.capturedSource.selection.selectionSha256===scope.binding.selectionSha256,'SALES_FIXED_BINDING');
  await grant('verifyInputs',{entity,scope,executionInput});await grant('assertExecutionAllowed',scope.binding);
  result.phase='RETAINED_TYPED_LOCATOR';await retained.buildTypedIndex();active();
  const opts={...readerOptions,resolveNativeBinding:original.resolveNativeBinding,capturedSource:{...readerOptions.capturedSource,read:{sourceRows:retained.sourceRows,typedRow:retained.typedRow},close:async()=>{try{await readerOptions.capturedSource.close();}finally{await retained.close();}},
   verify:async context=>{await retained.verify();need(await readerOptions.capturedSource.verify(context)===undefined,'SALES_CAPTURED_VERIFY');active();}}};
  raw=await original.openReader(opts);let input=[],selection,moneyApprovals;
  const prepare=rows=>original.prepare({batchId:scope.binding.batchId,fixedSourceNamespace:scope.binding.fixedSourceNamespace,selection,moneyApprovals,rows});
  function expected(chunk){return chunk.rows.map(row=>({source:original.project('import_source_row',{id:row.source.id,batch_id:row.source.batchId,entity_type:entity,source_key:row.source.sourceKey,file_ref:row.source.fileRef,sheet:row.source.sheet,row_no:row.source.rowNo,source_file_sha256:row.source.sourceFileSha256,row_sha256:row.source.rowSha256,raw_fields:row.source.rawFields,normalized_fields:row.source.normalizedFields,
   field_provenance:{...row.fieldProvenance,[staging(entity)]:{validator_version:entity==='SALES_LINE'?'V3_SALES_LINE_STAGE_1':'V3_HISTORY_SETTLEMENT_STAGE_1',fingerprint:row.fingerprint,selection:{...selection},header:{...row.header},...(entity==='SALES_LINE'?{sku:{...row.sku}}:{account:{...row.account},method:row.method?{...row.method}:null})}}}).projection,typed:original.project(relation(entity),entity==='SALES_LINE'?row.line:row.settlement).projection}));}
  async function flush(){if(!input.length)return;const chunk=prepare(input);original.validate(chunk);const facts=expected(chunk);need(Buffer.byteLength(JSON.stringify(facts))<=MAX,'SALES_PREPARED_WINDOW_BYTES');
   result.current={firstIndex:result.preparedRows-input.length,rows:input.length,commitReturned:false,keys:chunk.rows.map(r=>({sourceRowId:r.source.id,sourceKey:r.source.sourceKey,typedId:(entity==='SALES_LINE'?r.line:r.settlement).id,fingerprint:r.fingerprint}))};
   result.phase='BEFORE_KEYED_RR';await readback(async tx=>tx.window(facts,false));active();
   result.phase='ORIGINAL_AUTHORIZE';await raw.authorize(chunk);await grant('verifyInputs',{entity,scope,executionInput});await grant('assertExecutionAllowed',scope.binding);await grant('authorizeStep',{kind:entity==='SALES_LINE'?'SALES_DETAIL':'SETTLEMENT',payload:chunk},scope.binding);
   await emit({event:'SALES_CHUNK_AUTHORIZED_BEFORE_STAGE',entity,...result.current});result.phase='ORIGINAL_STAGE';result.current.outcome='IN_FLIGHT_OR_UNCONFIRMED';result.attemptedRows+=chunk.rows.length;
   const r=await original.store.stage(chunk);result.current.commitReturned=true;result.current.outcome='COMMIT_RETURNED';result.commitReturnedRows+=chunk.rows.length;
   need(Number.isSafeInteger(r.inserted)&&r.inserted>=0&&Number.isSafeInteger(r.replayed)&&r.replayed>=0&&r.inserted+r.replayed===chunk.rows.length,'SALES_ORIGINAL_STAGE_RETURN');result.inserted+=r.inserted;result.replayed+=r.replayed;
   await emit({event:'SALES_CHUNK_COMMIT_RETURNED',entity,...result.current,returned:r});result.phase='AFTER_KEYED_RR';await readback(async tx=>tx.window(facts,true));result.readbackConfirmedRows+=chunk.rows.length;input=[];
  }
  result.phase='ORIGINAL_READER';for await(const r of raw.rows()){
   active();if(!selection){selection=r.selection;moneyApprovals=r.moneyApprovals;}else{assert.deepEqual(r.selection,selection);assert.deepEqual(r.moneyApprovals,moneyApprovals);}
   const native=await original.resolveNativeBinding({entity,sourceKey:r.source.sourceKey,rawFields:r.source.rawFields,normalizedFields:r.source.normalizedFields});active();
   // One-row original validation proves both input/prepared limits. Keep original
   // <=100 bound, additionally conservative 1MiB input window for expanded proofs.
   const next={source:r.source,...native};prepare([next]);
   if(input.length&&(input.length===100||Buffer.byteLength(JSON.stringify([...input,next]))>1048576))await flush();
   input.push(next);result.preparedRows++;need(result.preparedRows<=scope.rows,'SALES_SOURCE_COUNT');
  }await flush();need(result.preparedRows===scope.rows&&result.readbackConfirmedRows===scope.rows,'SALES_STAGE_EXACT_COUNT');
  result.phase='FINAL_GLOBAL_REPEATABLE_READ';await grant('verifyInputs',{entity,scope,executionInput});
  await readback(async tx=>{await tx.counts(scope.binding.batchId,scope.rows);let facts=[],bytes=0;
   // Reconsume retained projections only, never reopen source snapshots/factories.
   for await(const s of retained.sourceRows(scope.source)){active();const p=s.projection;
    const typedKey=original.typedKey(p.source_key,scope.binding.fixedSourceNamespace,entity);
    const t=await retained.typedRow(scope.typed,typedKey),fact={source:original.project('import_source_row',p).projection,typed:original.project(relation(entity),t.projection).projection};
    const n=Buffer.byteLength(JSON.stringify(fact));need(n<=MAX,'SALES_FINAL_ROW_BYTES');if(facts.length&&(facts.length===100||bytes+n+1>MAX)){await tx.window(facts,true);result.finalConfirmedRows+=facts.length;facts=[];bytes=0;}facts.push(fact);bytes+=n+1;
   }if(facts.length){await tx.window(facts,true);result.finalConfirmedRows+=facts.length;}await tx.counts(scope.binding.batchId,scope.rows);need(result.finalConfirmedRows===scope.rows,'SALES_FINAL_COMPLETE');await retained.verify();
  });
  result.status='COMPLETE_ORIGINAL_STAGE_AND_FULL_GLOBAL_RR_FINAL_NOT_PUBLICATION';
 }catch(error){result.firstError={phase:result.phase,...clean(error)};result.status=result.current?.outcome==='IN_FLIGHT_OR_UNCONFIRMED'?'STOPPED_CURRENT_CHUNK_OUTCOME_UNKNOWN_NO_RETRY':'STOPPED_PRESERVE_RETURNED_COMMITS_NO_RETRY';}
 finally{for(const [name,obj]of [['reader',raw],['retained',retained],['authority',authority]])try{await obj?.close?.();}catch(error){(result.cleanupErrors??=[]).push({name,...clean(error)});}if(result.cleanupErrors){result.statusBeforeCleanupFailure=result.status;result.status='STOPPED_CLEANUP_FAILURE_PRESERVE_COMMIT_FACTS';}}
 return result;
}

/** Concrete invocation seam for T45's already-issued pool/runtime and original
 * capturedOptions (same full32 map/selection/verify/close as provider26).
 * This function creates neither credentials nor authority and opens no snapshot.
 */
export async function consumeRetainedSalesSettlement({sourceRoot,entity,binding,executionInput,capturedOptions,issued,authority,recordProgress,signal}){
 const c=capturedOptions.capturedSource;
 need(c?.manifestFile?.startsWith('/')&&c.trustedManifestSha256==='107ba2909e041d7f1e974138b8894e2765f77585a95f6b92cdba66acbbf160ed','SALES_C144_MANIFEST');
 const st=await lstat(c.manifestFile);need(st.isFile()&&!st.isSymbolicLink()&&st.size===2555,'SALES_C144_MANIFEST');
 const bytes=await readFile(c.manifestFile);need(bytes.length===2555&&sha(bytes)===c.trustedManifestSha256&&same(st,await lstat(c.manifestFile)),'SALES_C144_MANIFEST');
 const manifest=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));
 const source=manifest.artifacts.find(d=>d.entity===entity&&d.actualColumns===12),typed=manifest.artifacts.find(d=>d.entity===entity&&d.actualColumns===(entity==='SALES_LINE'?21:11));
 need(source&&typed&&source.rows===typed.rows,'SALES_C144_DESCRIPTORS');
 const scope={binding:structuredClone(binding),source,typed,rows:source.rows};
 const original=await loadOriginalSalesSettlement(sourceRoot,entity,issued.pool,issued.runtime26,binding);
 const retained=await openRetainedSalesSettlementFiles({source,typed},signal);
 return runRetainedSalesSettlement({entity,scope,executionInput,readerOptions:capturedOptions,original,retained,authority,recordProgress,signal,
  readback:work=>withSalesSettlementReadback({pool:issued.pool,runtime26:issued.runtime26,entity,signal},work)});
}
