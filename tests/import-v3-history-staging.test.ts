import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareV3HistoryChunk, stageV3HistoryChunk } from '../packages/application/src/import-v3-history-staging.ts';
import type { V3HistoryChunk } from '../packages/application/src/import-v3-history-staging.ts';
import { PostgresV3HistoryStagingStore, PostgresV3HistoryStagingStore26 } from '../adapters/postgres/src/import-v3-history-staging-store.ts';
import type { PgSalesClient, PgSalesPool, PgSalesResult } from '../adapters/postgres/src/sales-unit-of-work.ts';
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const h='a'.repeat(64);
function fixture(): V3HistoryChunk {
  const normalizedFields={'来源编号':'0001','单据来源编号':'0002','原行号':'1','SKU来源编号':'0003','原数量':'-2','原款号':'0007','原品名':'','原颜色名称':'','原版型名称':'','原完整尺码':'','原使用条码':'000099'};
  return {batchId:id(1),fixedSourceNamespace:'synthetic-v3',selection:{baseManifestSha256:h,selectionSha256:h,approvalSha256:h,entity:'TRANSFER_LINE',source:'BASE_V2',path:'business/17历史调拨明细.csv',csvSha256:h},
    rows:[{source:{id:id(2),batchId:id(1),entityType:'TRANSFER_LINE',sourceKey:'0001',fileRef:'synthetic.xlsx',sheet:'rows',rowNo:'2',sourceFileSha256:h,rowSha256:h,
      rawFields:{...normalizedFields},normalizedFields,fieldProvenance:{schema_version:1,fields:{quantity:{origin:'ORIGINAL',reason:'literal original signed quantity',raw:'-2'}}}},
      header:{sourceKey:'0002',nativeId:id(3)},sku:{sourceKey:'0003',nativeId:id(4)}}]};
}
class FakePool implements PgSalesPool {
  lease:PgSalesClient|undefined; schemaLength=26;
  calls:string[]=[]; committed=new Map<string,{source:Record<string,unknown>;line:Record<string,unknown>}>();
  working=new Map<string,{source:Record<string,unknown>;line:Record<string,unknown>}>();
  pending:Record<string,unknown>|undefined; failLine=false; failLineAt=0; lineAttempts=0; failCommit=false; commitAppliedBeforeFailure=false; failRollback=false;
  readonly commitError=Error('commit unknown'); badBinding=false; closed=false; discarded:Error|undefined; connects=0;
  async connect():Promise<PgSalesClient> {this.connects++;this.lease={query:async (sql,values=[])=>this.query(sql,values),release:error=>{this.discarded=error instanceof Error ? error : undefined;}};return this.lease;}
  async query(sql:string,values:readonly unknown[]):Promise<PgSalesResult> {
    this.calls.push(sql); const answer=(rows:Record<string,unknown>[]=[]):PgSalesResult=>({rows,rowCount:rows.length});
    if(sql.includes('history-stage:schema26'))return answer([{versions:Array.from({length:this.schemaLength},(_,i)=>i+1)}]);
    if(sql.startsWith('BEGIN')) {this.working=structuredClone(this.committed);return answer();}
    if(sql==='COMMIT') {if(this.failCommit){if(this.commitAppliedBeforeFailure)this.committed=structuredClone(this.working);throw this.commitError;}this.committed=this.working;return answer();}
    if(sql==='ROLLBACK') {if(this.failRollback)throw Error('rollback failed');this.working=structuredClone(this.committed);this.pending=undefined;return answer();}
    if(sql.includes('history-stage:batch')) return answer([{id:id(1),mapping_version:'V2_HISTORY_NULLABLE_1',status:this.closed?'IMPORTED':'STAGED',source_hash:h,source_name:'synthetic-v3'}]);
    if(sql.includes('history-stage:bindings')) return answer(this.badBinding?[]:[{id:id(3)}]);
    if(sql.includes('history-stage:replay')) {const old=this.working.get(String(values[0])); return answer(old?[{source_equal:JSON.stringify(old.source)===values[1],line_equal:JSON.stringify(old.line)===values[2]}]:[]);}
    if(sql.includes('history-stage:source')) {this.pending=JSON.parse(String(values[0])) as Record<string,unknown>;return answer([{id:this.pending.id}]);}
    if(sql.includes('history-stage:line')) {this.lineAttempts++;if(this.failLine || this.lineAttempts===this.failLineAt)throw Error('line failed');const line=JSON.parse(String(values[0])) as Record<string,unknown>;this.working.set(String(this.pending!.id),{source:this.pending!,line});return answer([{id:line.id}]);}
    return answer();
  }
}
test('default dry run validates but never authorizes/connects/publishes; raw and snapshots stay literal',async()=>{
  const input=fixture(), before=structuredClone(input), pool=new FakePool();let authorized=0;
  const result=await stageV3HistoryChunk(input,{store:new PostgresV3HistoryStagingStore(pool),authorize:async()=>{authorized++;}});
  assert.equal(result.mode,'DRY_RUN');assert.equal(result.published,false);assert.equal(result.importReady,false);assert.equal(pool.connects,0);assert.equal(authorized,0);assert.deepEqual(input,before);
  const p=prepareV3HistoryChunk(input);assert.equal(p.rows[0]!.line.quantity,'-2');assert.equal(p.rows[0]!.line.barcode_snapshot,'000099');assert.equal(p.rows[0]!.line.product_name_snapshot,null);
});
test('rejects unmet identity, schema, quantity, binding, exclusion, provenance and budget fields',()=>{
  const edits:Array<(c:V3HistoryChunk)=>void>=[c=>{c.selection.source='AMENDMENT_V3' as never;},c=>{c.rows[0]!.source.sourceFileSha256='bad';},c=>{delete c.rows[0]!.source.normalizedFields['原品名'];},c=>{c.rows[0]!.source.normalizedFields['原数量']='1.2';},c=>{c.rows[0]!.source.normalizedFields['原行号']='2147483648';},c=>{c.rows[0]!.header.sourceKey='other';},c=>{c.rows[0]!.source.rawFields['绑定范围']='PRODUCT';},c=>{c.rows[0]!.source.fieldProvenance.fields={x:{origin:'MIGRATION_DERIVED',raw:'a',reason:'missing evidence'}};},c=>{c.rows=Array(201).fill(c.rows[0]);},c=>{c.rows=[c.rows[0]!,c.rows[0]!];}];
  for(const edit of edits){const c=fixture();edit(c);assert.throws(()=>prepareV3HistoryChunk(c));}
});
test('STAGE requires explicit authorization before store connection and isolates authorization mutation',async()=>{
  const pool=new FakePool(),store=new PostgresV3HistoryStagingStore(pool);
  await assert.rejects(stageV3HistoryChunk(fixture(),{mode:'STAGE',store}),/AUTHORIZATION/);assert.equal(pool.connects,0);
  await assert.rejects(stageV3HistoryChunk(fixture(),{mode:'STAGE',store,authorize:async()=>{throw Error('unverified selection');}}));assert.equal(pool.connects,0);
  await stageV3HistoryChunk(fixture(),{mode:'STAGE',store,authorize:async c=>{c.rows[0]!.line.quantity='99';}});
  assert.equal([...pool.committed.values()][0]!.line.quantity,'-2');
});
test('atomic insert and exact replay use cutoff then batch then native locks; no publish/update/ledger',async()=>{
  const pool=new FakePool(),store=new PostgresV3HistoryStagingStore(pool),chunk=prepareV3HistoryChunk(fixture());
  assert.deepEqual(await store.stage(chunk),{inserted:1,replayed:0});assert.deepEqual(await store.stage(chunk),{inserted:0,replayed:1});
  assert.ok(pool.calls[1]!.includes('global-lock'));assert.ok(pool.calls[2]!.includes('stage:batch'));assert.ok(pool.calls[3]!.includes('stage:bindings'));
  assert.ok(!pool.calls.some(s=>/\bUPDATE\s+naijue|\bDELETE\b|\bIMPORT_PUBLISH\b|\binventory_ledger\b/.test(s)));
  const changed=fixture();changed.rows[0]!.source.normalizedFields['原品名']='changed';changed.rows[0]!.source.rawFields['原品名']='changed';await assert.rejects(store.stage(prepareV3HistoryChunk(changed)),/REPLAY_CONFLICT/);
});
test('failed line rolls back source and complete chunk; explicit retry succeeds',async()=>{
  const pool=new FakePool(),store=new PostgresV3HistoryStagingStore(pool),chunk=prepareV3HistoryChunk(fixture());pool.failLine=true;
  await assert.rejects(store.stage(chunk),/line failed/);assert.equal(pool.committed.size,0);assert.equal(pool.calls.at(-1),'ROLLBACK');
  pool.failLine=false;assert.deepEqual(await store.stage(chunk),{inserted:1,replayed:0});
});
test('unknown COMMIT preserves the original error, discards without rollback/retry for either actual outcome',async()=>{
  for(const applied of [false,true])for(const rollbackFails of [false,true]){
    const pool=new FakePool();pool.failCommit=true;pool.commitAppliedBeforeFailure=applied;pool.failRollback=rollbackFails;
    await assert.rejects(new PostgresV3HistoryStagingStore(pool).stage(prepareV3HistoryChunk(fixture())),error=>error===pool.commitError);
    assert.equal(pool.connects,1);assert.equal(pool.discarded,pool.commitError);assert.equal(pool.calls.filter(s=>s==='COMMIT').length,1);
    assert.ok(!pool.calls.includes('ROLLBACK'));assert.equal(pool.calls.at(-1),'COMMIT');assert.equal(pool.committed.size,applied?1:0);
  }
});
test('closed/unbound batches and missing native binding fail before source insert',async()=>{
  for(const condition of ['closed','badBinding'] as const){const pool=new FakePool();pool[condition]=true;await assert.rejects(new PostgresV3HistoryStagingStore(pool).stage(prepareV3HistoryChunk(fixture())));assert.ok(!pool.calls.some(s=>s.includes('history-stage:source')));}
});
test('SQL boundary rejects a changed prepared target before connecting',async()=>{
  const pool=new FakePool(),chunk=prepareV3HistoryChunk(fixture());chunk.rows[0]!.line.quantity='0';
  await assert.rejects(new PostgresV3HistoryStagingStore(pool).stage(chunk),/PREPARED_CHANGED/);assert.equal(pool.connects,0);
});

test('failure on second row rolls back first source and line; replayed prefix plus new suffix is safe',async()=>{
  const pool=new FakePool(),store=new PostgresV3HistoryStagingStore(pool),input=fixture();
  const second=structuredClone(input.rows[0]!);second.source.id=id(22);second.source.sourceKey='0008';second.source.rowNo='3';
  second.source.rawFields['来源编号']='0008';second.source.normalizedFields['来源编号']='0008';
  second.source.rawFields['原行号']='2';second.source.normalizedFields['原行号']='2';input.rows=[input.rows[0]!,second];
  pool.failLineAt=2;await assert.rejects(store.stage(prepareV3HistoryChunk(input)));assert.equal(pool.committed.size,0);
  pool.failLineAt=0;assert.deepEqual(await store.stage(prepareV3HistoryChunk(fixture())),{inserted:1,replayed:0});
  assert.deepEqual(await store.stage(prepareV3HistoryChunk(input)),{inserted:1,replayed:1});assert.equal(pool.committed.size,2);
});

test('raw snapshot fields cannot be missing or rewritten; only old SKU may differ with explicit alias lookup',async()=>{
  const missing=fixture();delete missing.rows[0]!.source.rawFields['原使用条码'];assert.throws(()=>prepareV3HistoryChunk(missing),/RAW_FIELDS/);
  const changed=fixture();changed.rows[0]!.source.normalizedFields['原使用条码']='new';assert.throws(()=>prepareV3HistoryChunk(changed),/RAW_FIELDS/);
  const alias=fixture();alias.rows[0]!.source.rawFields['SKU来源编号']='old-0003';const pool=new FakePool();
  await new PostgresV3HistoryStagingStore(pool).stage(prepareV3HistoryChunk(alias));
  assert.ok(pool.calls.find(s=>s.includes('history-stage:bindings'))!.includes('a.old_source_sku_id=$6'));
});

test('4 MiB chunk budget measures UTF-8 bytes, not UTF-16 characters',()=>{
  const multibyte=fixture();multibyte.rows[0]!.source.rawFields['extraEvidence']='汉'.repeat(1_500_000);
  assert.ok(JSON.stringify(multibyte).length<4*1024*1024);
  assert.throws(()=>prepareV3HistoryChunk(multibyte),/BYTE_LIMIT/);
});

function transferRuntime26(pool:FakePool,denied=false,booleanProof=false){let proofs=0;return {proofs:()=>proofs,cap:{profile:'EXACT26' as const,contract:'NATIVE_RUNTIME26_V1' as const,async assertReady(client:object,purpose:string){proofs++;assert.equal(client,pool.lease);assert.equal(purpose,'IMPORT_STAGE');assert.equal(pool.calls.length,0);if(denied)throw Error('NATIVE_RUNTIME26_NOT_READY');if(booleanProof)return true as never;}}};}
test('transfer26 proves same original client before SQL and refuses missing, boolean, expired and non26 admission',async()=>{
 const chunk=prepareV3HistoryChunk(fixture()),pool=new FakePool();assert.throws(()=>new PostgresV3HistoryStagingStore26(pool,undefined as never),/runtime capability/);assert.equal(pool.connects,0);
 for(const opts of [[true,false],[false,true]]){const p=new FakePool(),r=transferRuntime26(p,opts[0],opts[1]);await assert.rejects(new PostgresV3HistoryStagingStore26(p,r.cap).stage(chunk));assert.equal(p.calls.length,0);assert.ok(p.discarded);}
 for(const length of [19,27]){const p=new FakePool();p.schemaLength=length;await assert.rejects(new PostgresV3HistoryStagingStore26(p,transferRuntime26(p).cap).stage(chunk),/EXACT26_REQUIRED/);assert.equal(p.calls.some(c=>c.includes(':batch')),false);}
});
test('transfer26 retains signed source and complete native alias/header binding with immutable replay',async()=>{
 const p=new FakePool(),r=transferRuntime26(p),next=new PostgresV3HistoryStagingStore26(p,r.cap),chunk=prepareV3HistoryChunk(fixture());assert.deepEqual(await next.stage(chunk),{inserted:1,replayed:0});assert.equal(p.committed.get(id(2))!.line.quantity,'-2');p.calls.length=0;assert.deepEqual(await next.stage(chunk),{inserted:0,replayed:1});assert.equal(r.proofs(),2);assert.equal(p.calls.some(c=>/(?:^|\*\/)\s*(INSERT|UPDATE|DELETE)\b/.test(c)),false);p.committed.get(id(2))!.line.quantity='3';p.calls.length=0;await assert.rejects(next.stage(chunk),/REPLAY_CONFLICT/);
 const missing=new FakePool();missing.badBinding=true;await assert.rejects(new PostgresV3HistoryStagingStore26(missing,transferRuntime26(missing).cap).stage(chunk));assert.equal(missing.committed.size,0);
});
test('transfer26 rolls back failed original line and discards unknown COMMIT without rollback or retry',async()=>{
 for(const commit of [false,true]){const p=new FakePool();if(commit)p.failCommit=true;else p.failLine=true;await assert.rejects(new PostgresV3HistoryStagingStore26(p,transferRuntime26(p).cap).stage(prepareV3HistoryChunk(fixture())));assert.equal(p.connects,1);assert.equal(p.calls.some(c=>c==='ROLLBACK'),!commit);if(commit)assert.ok(p.discarded);}
});
