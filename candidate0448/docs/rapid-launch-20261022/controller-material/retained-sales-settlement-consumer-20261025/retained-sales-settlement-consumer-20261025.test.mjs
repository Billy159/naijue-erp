import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {openRetainedSalesSettlementFiles,checkSalesSettlementReadback,withSalesSettlementReadback,runRetainedSalesSettlement,salesSettlementReadbackSql} from './retained-sales-settlement-consumer-20261025.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'sales-retained-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
async function ref(dir,name,rows,options={}){const bytes=Buffer.from(rows.map(r=>JSON.stringify(r)+'\n').join(''));const path=join(dir,name);await writeFile(path,bytes,{mode:0o600});return{path,rows:rows.length,bytes:bytes.length,sha256:hash(bytes),...options};}
test('retained locator joins independently sorted keys; full EOF and post-close revocation',()=>fixture(async dir=>{
 const source=await ref(dir,'source',[{key:'a',typed:'z'},{key:'b',typed:'a'}]),typed=await ref(dir,'typed',[{key:'a',value:'001'},{key:'z',value:null}]);
 const files=await openRetainedSalesSettlementFiles({source,typed});try{await files.buildTypedIndex();const got=[];for await(const s of files.sourceRows(source))got.push(await files.typedRow(typed,s.typed));assert.deepEqual(got,[{key:'z',value:null},{key:'a',value:'001'}]);
 await assert.rejects(files.typedRow(typed,'missing'),/TYPED_KEY_MISSING/);await assert.rejects(files.buildTypedIndex(),/ALREADY_BUILT/);
 }finally{await files.close();}await assert.rejects(files.verify(),/CLOSED/);
}));
test('retained truncated/hash-invalid/duplicate typed rows fail before writes',()=>fixture(async dir=>{
 const source=await ref(dir,'source',[{key:'a'}]);
 for(const [name,rows,override]of [['hash',[{key:'a'}],{sha256:'0'.repeat(64)}],['duplicate',[{key:'a'},{key:'a'}],{}]]){
 const typed=await ref(dir,name,rows,override),f=await openRetainedSalesSettlementFiles({source,typed});try{await assert.rejects(f.buildTypedIndex(),/EXACT_EOF|KEY_ORDER/);}finally{await f.close();}}
}));
const expected=[{source:{id:'s'},typed:{id:'t'}}];
const exact={ordinal:'1',source_id:'s',typed_id:'t',source_candidates:'1',typed_candidates:'1',source_equal:true,typed_equal:true};
test('keyed readback rejects partial pair, alternate source key, typed drift, missing FINAL and extra candidate',()=>{
 checkSalesSettlementReadback([exact],expected,true);
 const absent={ordinal:'1',source_id:null,typed_id:null,source_candidates:'0',typed_candidates:'0'};checkSalesSettlementReadback([absent],expected,false);
 for(const row of [absent,{...exact,source_id:'other'},{...exact,typed_equal:false},{...exact,source_candidates:'2'},{...exact,typed_candidates:'2'}])assert.throws(()=>checkSalesSettlementReadback([row],expected,true),/PARTIAL_CONFLICT/);
 assert.throws(()=>salesSettlementReadbackSql('TRANSFER_LINE'),/ENTITY/);
});
test('one global RR transaction includes all FINAL windows and both count checks',async()=>{
 const calls=[];let released;const client={query:async(sql)=>{calls.push(sql);if(sql.startsWith('SELECT (SELECT'))return{rows:[{source_count:'2',typed_count:'2'}]};return{rows:[exact]};},release:e=>{released=e;}};
 await withSalesSettlementReadback({pool:{connect:async()=>client},runtime26:{assertReady:async()=>{}},entity:'SETTLEMENT'},async tx=>{await tx.counts('batch',2);await tx.window(expected,true);await tx.window(expected,true);await tx.counts('batch',2);});
 assert.match(calls[0],/REPEATABLE READ READ ONLY/);assert.equal(calls.at(-1),'COMMIT');assert.equal(calls.filter(s=>s.startsWith('SELECT (SELECT')).length,2);assert.equal(released,undefined);
});
test('FINAL count mismatch rolls back; rollback failure discards client',async()=>{
 let released,commit=false;const client={query:async sql=>{if(sql==='COMMIT')commit=true;if(sql==='ROLLBACK')throw Error('rollback');return{rows:[{source_count:'2',typed_count:'1'}]};},release:e=>{released=e;}};
 await assert.rejects(withSalesSettlementReadback({pool:{connect:async()=>client},runtime26:{assertReady:async()=>{}},entity:'SALES_LINE'},tx=>tx.counts('b',2)),AggregateError);assert.equal(commit,false);assert.ok(released);
});
function protocol({stage=async()=>({inserted:100,replayed:0}),resolve=async()=>({header:{},sku:{}}),after=false}={}){
 let closed=0,staged=0;const source=i=>({id:'s'+i,sourceKey:'key'+i,batchId:'b',fileRef:'f',sheet:'s',rowNo:String(i),sourceFileSha256:'h',rowSha256:'r',rawFields:{},normalizedFields:{}});
 const selection={selectionSha256:'selection'},moneyApprovals=new Map();
 const original={project:(relation,projection)=>({relation,projection}),prepare:input=>({input,rows:input.rows.map(r=>({...r,line:{id:'t'+r.source.id},fieldProvenance:{},fingerprint:'fp'}))}),validate:()=>{},resolveNativeBinding:resolve,
  store:{stage:async c=>{staged++;return stage(c);}},openReader:async()=>({async *rows(){for(let i=0;i<100;i++)yield{source:source(i),selection,moneyApprovals};if(after)throw Error('source eof');},authorize:async()=>{},close:async()=>{closed++;}})};
 const args={entity:'SALES_LINE',scope:{rows:80918,binding:{batchId:'b',fixedSourceNamespace:'ns',selectionSha256:'selection'}},executionInput:{executionEnabled:true,action:'SALES_SETTLEMENT_RETAINED_ORIGINAL_STAGE_ONLY',writerSourceCommit:'34eff658e4caef590a77326c75917e391357529d'},readerOptions:{batchId:'b',fixedSourceNamespace:'ns',capturedSource:{selection,verify:async()=>{},close:async()=>{}}},original,
  retained:{buildTypedIndex:async()=>{},verify:async()=>{},close:async()=>{closed++;}},authority:{verifyInputs:async()=>{},assertExecutionAllowed:async()=>{},authorizeStep:async()=>{},close:async()=>{closed++;}},readback:async work=>work({window:async()=>{}}),recordProgress:async()=>{}};
 return{args,closed:()=>closed,staged:()=>staged};
}
test('original stage unknown outcome preserves keys, stops without retry and closes resources',async()=>{
 const p=protocol({stage:async()=>{throw Error('commit response lost');}}),r=await runRetainedSalesSettlement(p.args);
 assert.equal(p.staged(),1);assert.equal(r.status,'STOPPED_CURRENT_CHUNK_OUTCOME_UNKNOWN_NO_RETRY');assert.equal(r.current.keys.length,100);assert.equal(r.commitReturnedRows,0);assert.equal(p.closed(),3);
});
test('missing actual parent refuses before stage; source-count failure preserves returned commits',async()=>{
 const missing=protocol({resolve:async()=>{throw Object.assign(Error('parent missing'),{code:'MISSING_ACTUAL_SALES_HEADER'});}});const a=await runRetainedSalesSettlement(missing.args);assert.equal(missing.staged(),0);assert.equal(a.firstError.code,'MISSING_ACTUAL_SALES_HEADER');
 const committed=protocol();const b=await runRetainedSalesSettlement(committed.args);assert.equal(committed.staged(),1);assert.equal(b.commitReturnedRows,100);assert.equal(b.readbackConfirmedRows,100);assert.match(b.status,/STOPPED_PRESERVE/);assert.equal(b.PUBLISH,false);
});
const SOURCE='/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-control/reports/controller/rapid-launch-20261022/replica-production-source447-20261025-01/source447';
const moduleAt=p=>import(pathToFileURL(SOURCE+'/'+p).href);
for(const entity of ['SALES_LINE','SETTLEMENT'])test('actual SOURCE447 '+entity+' reader/mapper roundtrip through new retained transport',()=>fixture(async dir=>{
 const sales=entity==='SALES_LINE',fixtureModule=await moduleAt('tests/support/'+(sales?'synthetic-sales-detail-fixtures':'history-settlement-fixtures')+'.ts');
 const input=sales?fixtureModule.syntheticSalesDetailChunk():fixtureModule.settlementChunk(false);
 const mapper=await moduleAt('packages/application/src/import-v3-history-'+(sales?'sales-detail':'settlement')+'.ts');
 const {stableImportId}=await moduleAt('packages/application/src/inventory-cutoff-import.ts'),{historyClosureProjectionRow26:project}=await moduleAt('packages/application/src/history-typed-closure.ts');
 const s=input.rows[0].source;s.id=stableImportId('source-row',input.fixedSourceNamespace,entity,s.sourceKey);
 const fields=Object.fromEntries(Object.entries(s.rawFields).map(([k,v])=>[k,{origin:'ORIGINAL',reason:'EXACT_ORIGINAL_SNAPSHOT_CELL',raw:v}]));
 if(sales){fields.SKU来源编号={origin:'MIGRATION_DERIVED',reason:'VERIFIED_OLD_TO_CANONICAL_ALIAS',raw:s.rawFields.SKU来源编号,evidence_ref:'mappings/old-to-canonical-sku-15121.csv'};fields.__source_row_hash={origin:'ORIGINAL',reason:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1',raw:s.rowSha256};}
 s.fieldProvenance={schema_version:1,fields};
 const prepare=mapper[sales?'prepareHistorySalesDetailChunk':'prepareHistorySettlementChunk'],chunk=prepare(input),r=chunk.rows[0],stageKey=sales?'history_sales_detail_staging':'history_settlement_staging';
 const sourceProjection=project('import_source_row',{id:s.id,batch_id:s.batchId,entity_type:entity,source_key:s.sourceKey,file_ref:s.fileRef,sheet:s.sheet,row_no:s.rowNo,source_file_sha256:s.sourceFileSha256,row_sha256:s.rowSha256,raw_fields:s.rawFields,normalized_fields:s.normalizedFields,field_provenance:{...r.fieldProvenance,[stageKey]:{validator_version:sales?mapper.HISTORY_SALES_DETAIL_VERSION:mapper.HISTORY_SETTLEMENT_VERSION,fingerprint:r.fingerprint,selection:input.selection,header:r.header,...(sales?{sku:r.sku}:{account:r.account,method:r.method})}}});
 const typedProjection=project(sales?'history_sales_line':'history_sales_settlement',sales?r.line:r.settlement);
 assert.equal(typedProjection.key,stableImportId(sales?'history-sales-line':'history-sales-settlement',input.fixedSourceNamespace,s.sourceKey));
 const source=await ref(dir,'source',[sourceProjection],{mode:'0600',entity,actualColumns:12}),typed=await ref(dir,'typed',[typedProjection],{mode:'0600',entity,actualColumns:sales?21:11});
 const manifest={status:'ACTUAL_SOURCE_TYPED_PROJECTIONS_COMPLETED_REFERENCE_ONLY',referenceOnly:true,nativeBindingsVerified:false,PG:false,MAIN:false,PUBLISH:false,all11:false,actualPayloadHash:null,sourceRows:1,typedRows:1,artifacts:[source,typed]};
 const manifestFile=join(dir,'MANIFEST.json'),bytes=Buffer.from(JSON.stringify(manifest));await writeFile(manifestFile,bytes,{mode:0o600});
 const retained=await openRetainedSalesSettlementFiles({source,typed});await retained.buildTypedIndex();
 const readers=await moduleAt('scripts/import-v2/authorized-'+(sales?'sales-detail':'settlement')+'-reader.mjs');
 const openReader=readers[sales?'openAuthorizedSalesDetailReader':'openAuthorizedSettlementReader'];
 const reader=await openReader({batchId:input.batchId,fixedSourceNamespace:input.fixedSourceNamespace,trustedApprovalSha256:input.selection.approvalSha256,approvedMoneyOverlaySha256:input.selection.moneyApprovalSha256,
  resolveNativeBinding:async()=>sales?{header:r.header,sku:r.sku}:{header:r.header,account:r.account,method:r.method},capturedSource:{manifestFile,trustedManifestSha256:hash(bytes),selection:input.selection,moneyApprovals:input.moneyApprovals,read:{sourceRows:retained.sourceRows,typedRow:retained.typedRow},verify:async()=>{await retained.verify();},close:retained.close}});
 try{let rows=0;for await(const item of reader.rows()){assert.equal(item.source.rawFields.来源编号,s.sourceKey);rows++;}assert.equal(rows,1);await reader.authorize(chunk);
  if(sales){assert.equal(r.line.quantity,'-2');assert.equal(r.line.barcode_snapshot,'0000123');}else assert.equal(r.settlement.payment_method_id_snapshot,null);
 }finally{await reader.close();}
}));
