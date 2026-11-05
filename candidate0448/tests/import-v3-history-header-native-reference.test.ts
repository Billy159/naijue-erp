import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPORT_V2_TABLES } from '../packages/application/src/import-v2-contract.ts';
import { prepareV3HistoryHeaderNativeReferenceChunk, stageV3HistoryHeaderNativeReferences } from '../packages/application/src/import-v3-history-header-native-reference.ts';
import type { HistoryHeaderNativeReferenceInput, HistoryHeaderNativeReferenceEntity } from '../packages/application/src/import-v3-history-header-native-reference.ts';
import { PostgresV3HistoryHeaderNativeReferenceStore, insertValidatedHistoryHeaderNativeReferences, historyHeaderNativeReferenceEvidence } from '../adapters/postgres/src/import-v3-history-header-native-reference-store.ts';
import type { PgSalesClient, PgSalesPool, PgSalesResult } from '../adapters/postgres/src/sales-unit-of-work.ts';
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`,hash='a'.repeat(64);
function fixture(entity:HistoryHeaderNativeReferenceEntity='HALL'):HistoryHeaderNativeReferenceInput {
  const table=IMPORT_V2_TABLES.find(t=>t.entity===entity)!;
  const n:Record<string,string>=Object.fromEntries(table.columns.map(c=>[c.name,'']));Object.assign(n,{'来源编号':`legacy-${entity}`});
  let nativeSnapshot:HistoryHeaderNativeReferenceInput['nativeSnapshot'];
  let enumMappings:HistoryHeaderNativeReferenceInput['enumMappings'];
  if(entity==='HALL'){
    Object.assign(n,{'厅名称':'原厅','状态':'原启用'});nativeSnapshot={id:id(10),name:'原厅',default_customer_id:null,default_sales_warehouse_id:null,enabled:true,version:3};enumMappings={'状态':{raw:'原启用',native:true,evidenceRef:'reviewed-status-map#1'}};
  }else if(entity==='CUSTOMER'){
    Object.assign(n,{'原编码':'0001','名称':'原客户','状态':'原停用'});nativeSnapshot={id:id(20),code:'0001',name:'原客户',enabled:false,version:4,created_at:null,updated_at:null};enumMappings={'状态':{raw:'原停用',native:false,evidenceRef:'reviewed-status-map#2'}};
  }else{
    Object.assign(n,{'姓名':'原员工','角色':'旧角色','任职状态':'原在职','联系方式':'001234'});nativeSnapshot={id:id(30),name:'原员工',hall_id:null,role:'REVIEWED_ROLE',contact:'001234',employment_status:'REVIEWED_EMPLOYED',version:5};enumMappings={'角色':{raw:'旧角色',native:'REVIEWED_ROLE',evidenceRef:'reviewed-role#1'},'任职状态':{raw:'原在职',native:'REVIEWED_EMPLOYED',evidenceRef:'reviewed-employment#1'}};
  }
  return {batchId:id(1),fixedSourceNamespace:'synthetic-reference',selection:{baseManifestSha256:hash,selectionSha256:hash,approvalSha256:hash,csvSha256:hash,entity,source:'BASE_V2',path:table.file},source:{id:id(2),batchId:id(1),entityType:entity,sourceKey:`legacy-${entity}`,fileRef:'original.xlsx',sheet:'dict',rowNo:'2',sourceFileSha256:hash,rowSha256:hash,rawFields:{...n},normalizedFields:n,fieldProvenance:{schema_version:1,fields:{}}},nativeSnapshot,bindings:{},enumMappings};
}
type Stored={source:Record<string,unknown>;reference:Record<string,unknown>};
/** Synthetic transaction fake, not a running database or engine proof. */
class FakePool implements PgSalesPool {
  calls:Array<{sql:string;values:unknown[]}>=[];committed:Stored[]=[];working:Stored[]=[];pending:Record<string,unknown>|undefined;
  connects=0;discarded:Error|undefined;closed=false;nativeMissing=false;snapshotChanged=false;relationMissing=false;failReferenceAt=0;attempts=0;failCommit=false;
  async connect():Promise<PgSalesClient>{this.connects++;return{query:async(sql,values=[])=>this.query(sql,values),release:error=>{this.discarded=error instanceof Error?error:undefined;}};}
  async query(sql:string,values:unknown[]):Promise<PgSalesResult>{
    this.calls.push({sql,values});const answer=(rows:Record<string,unknown>[]=[]):PgSalesResult=>({rows,rowCount:rows.length});
    if(sql.startsWith('BEGIN')){this.working=structuredClone(this.committed);return answer();}
    if(sql==='COMMIT'){if(this.failCommit)throw Error('commit unknown');this.committed=this.working;return answer();}
    if(sql==='ROLLBACK'){this.working=structuredClone(this.committed);return answer();}
    if(sql.includes('reference:batch'))return answer([{mapping_version:'V2_HISTORY_NULLABLE_1',status:this.closed?'IMPORTED':'STAGED',source_hash:hash,source_name:'synthetic-reference'}]);
    if(sql.includes('reference:native'))return answer(this.nativeMissing?[]:[{id:values[0],native_equal:!this.snapshotChanged}]);
    if(sql.includes('reference:relation-native'))return answer([{id:values[0]}]);
    if(sql.includes('reference:relation */'))return answer(this.relationMissing?[]:[{source_row_id:id(99)}]);
    if(sql.includes('reference:replay')){
      const old=this.working.filter(r=>r.source.id===values[0]||r.source.batch_id===values[3]&&(r.source.entity_type===values[4]&&r.source.source_key===values[5]||r.source.source_file_sha256===values[6]&&r.source.sheet===values[7]&&r.source.row_no===values[8]));
      return answer(old.map(r=>({source_equal:JSON.stringify(r.source)===values[1],reference_equal:JSON.stringify(r.reference)===values[2]})));
    }
    if(sql.includes('reference:source')){this.pending=JSON.parse(String(values[0])) as Record<string,unknown>;return answer([{id:this.pending.id}]);}
    if(sql.includes('reference:reference')){this.attempts++;if(this.attempts===this.failReferenceAt)throw Error('reference failed');const reference=JSON.parse(String(values[0])) as Record<string,unknown>;this.working.push({source:this.pending!,reference});return answer([{source_row_id:reference.source_row_id}]);}
    return answer();
  }
}
const store=(pool:FakePool)=>new PostgresV3HistoryHeaderNativeReferenceStore(pool);
test('all three explicit native reference shapes map source evidence and snapshots without inventing defaults',()=>{
  for(const entity of ['HALL','CUSTOMER','STAFF'] as const){const input=fixture(entity),before=structuredClone(input),row=prepareV3HistoryHeaderNativeReferenceChunk([input]).rows[0]!.prepared;assert.equal(row.entity,entity);assert.deepEqual(row.nativeSnapshot,input.nativeSnapshot);assert.equal(row.nativeVersion,input.nativeSnapshot.version);assert.deepEqual(input,before);assert.equal(row.fieldProvenance[`native_${entity.toLowerCase()}_id`],input.nativeSnapshot.id);assert.ok(row.fieldProvenance.header_native_reference);}
});
test('default DRY_RUN never authorizes or connects; explicit STAGE needs callback, and isolates callback mutations',async()=>{
  const pool=new FakePool();let called=0;assert.equal((await stageV3HistoryHeaderNativeReferences([fixture()],{store:store(pool),authorizeReferenceChunk:async()=>{called++;}})).mode,'DRY_RUN');assert.equal(called,0);assert.equal(pool.connects,0);
  await assert.rejects(stageV3HistoryHeaderNativeReferences([fixture()],{mode:'STAGE',store:store(pool)}),/AUTHORIZATION/);assert.equal(pool.connects,0);
  await assert.rejects(stageV3HistoryHeaderNativeReferences([fixture()],{mode:'STAGE',store:store(pool),authorizeReferenceChunk:async()=>{throw Error('original not authenticated');}}));assert.equal(pool.connects,0);
  await stageV3HistoryHeaderNativeReferences([fixture()],{mode:'STAGE',store:store(pool),authorizeReferenceChunk:async c=>{c.rows[0]!.prepared.nativeSnapshot.name='tamper';}});assert.equal(pool.committed[0]!.reference.native_snapshot&&((pool.committed[0]!.reference.native_snapshot as Record<string,unknown>).name),'原厅');
});
test('strict source/native shape, mappings, original raw match, versions, nulls and supplement scope fail closed',()=>{
  const changes:Array<(r:HistoryHeaderNativeReferenceInput)=>void>=[r=>{r.nativeSnapshot.name='other';},r=>{r.nativeSnapshot.version='3';},r=>{delete r.nativeSnapshot.default_customer_id;},r=>{r.nativeSnapshot.extra='x';},r=>{r.enumMappings={};},r=>{r.enumMappings={'状态':{raw:'wrong',native:true,evidenceRef:'map'}};},r=>{r.source.normalizedFields['厅名称']='normalized change';},r=>{delete r.source.rawFields['厅名称'];},r=>{r.selection.source='AMENDMENT_V3' as never;},r=>{r.nativeSnapshot.default_customer_id=id(99);},r=>{r.source.fieldProvenance.native_staff_id=id(99);}];
  for(const change of changes){const row=fixture();change(row);assert.throws(()=>prepareV3HistoryHeaderNativeReferenceChunk([row]));}
  const customer=fixture('CUSTOMER');customer.nativeSnapshot.created_at='not timestamp';assert.throws(()=>prepareV3HistoryHeaderNativeReferenceChunk([customer]),/TIMESTAMP/);
  const staff=fixture('STAFF');staff.nativeSnapshot.contact=null;assert.throws(()=>prepareV3HistoryHeaderNativeReferenceChunk([staff]),/NATIVE_FIELDS/);
});
test('nonempty native relations require explicit exact source mapping, not native UUID alone',()=>{
  const row=fixture();row.source.rawFields['默认客户来源编号']='old-customer';row.source.normalizedFields['默认客户来源编号']='old-customer';row.nativeSnapshot.default_customer_id=id(20);
  assert.throws(()=>prepareV3HistoryHeaderNativeReferenceChunk([row]),/RELATION_MAPPING/);row.bindings={'默认客户来源编号':{sourceKey:'old-customer',nativeId:id(20)}};assert.equal(prepareV3HistoryHeaderNativeReferenceChunk([row]).rows.length,1);
  row.bindings={'默认客户来源编号':{sourceKey:'other',nativeId:id(20)}};assert.throws(()=>prepareV3HistoryHeaderNativeReferenceChunk([row]),/RELATION_MAPPING/);
});
test('chunk count, UTF8 bytes, duplicate identities and mixed selection are bounded before SQL',()=>{
  assert.throws(()=>prepareV3HistoryHeaderNativeReferenceChunk([]),/CHUNK_LIMIT/);assert.throws(()=>prepareV3HistoryHeaderNativeReferenceChunk(Array(101).fill(fixture())),/CHUNK_LIMIT/);assert.throws(()=>prepareV3HistoryHeaderNativeReferenceChunk([fixture(),fixture()]),/DUPLICATE/);
  const big=fixture();big.source.rawFields.extra='汉'.repeat(1_500_000);assert.throws(()=>prepareV3HistoryHeaderNativeReferenceChunk([big]),/BYTE_LIMIT/);
});
test('prepared native ID/version/snapshot/provenance tampering is rederived and rejected before connection',async()=>{
  for(const mutate of [c=>{c.rows[0]!.prepared.nativeId=id(99);},c=>{c.rows[0]!.prepared.nativeVersion=99;},c=>{c.rows[0]!.prepared.fieldProvenance={};},c=>{c.rows[0]!.prepared.fingerprint='b'.repeat(64);}] satisfies Array<(c:ReturnType<typeof prepareV3HistoryHeaderNativeReferenceChunk>)=>void>){const pool=new FakePool(),c=prepareV3HistoryHeaderNativeReferenceChunk([fixture()]);mutate(c);await assert.rejects(store(pool).stage(c),/PREPARED_CHANGED/);assert.equal(pool.connects,0);}
});
test('existing native record snapshot is checked under native lock before first source/catalogue binding; complete exact replay works',async()=>{
  for(const entity of ['HALL','CUSTOMER','STAFF'] as const){const pool=new FakePool(),c=prepareV3HistoryHeaderNativeReferenceChunk([fixture(entity)]);assert.deepEqual(await store(pool).stage(c),{inserted:1,replayed:0});assert.deepEqual(await store(pool).stage(c),{inserted:0,replayed:1});assert.equal(pool.committed.length,1);assert.ok(pool.calls[1]!.sql.includes('global-lock'));assert.ok(pool.calls[2]!.sql.includes('reference:batch'));assert.ok(pool.calls[3]!.sql.includes('reference:native'));assert.match(pool.calls[3]!.sql,/jsonb_populate_record/);}
});
test('missing/changed native or closed batch refuses before evidence insert',async()=>{
  for(const flag of ['nativeMissing','snapshotChanged','closed'] as const){const pool=new FakePool();pool[flag]=true;await assert.rejects(store(pool).stage(prepareV3HistoryHeaderNativeReferenceChunk([fixture()])));assert.equal(pool.committed.length,0);assert.ok(!pool.calls.some(c=>c.sql.includes('reference:source')));}
});
test('normal later native edits do not change immutable point-in-time proof or break exact replay',async()=>{
  const pool=new FakePool(),c=prepareV3HistoryHeaderNativeReferenceChunk([fixture('STAFF')]);await store(pool).stage(c);pool.snapshotChanged=true;assert.deepEqual(await store(pool).stage(c),{inserted:0,replayed:1});assert.equal((pool.committed[0]!.reference.native_snapshot as Record<string,unknown>).name,'原员工');
});
test('same source with changed snapshot conflicts instead of overwriting evidence',async()=>{
  const pool=new FakePool();await store(pool).stage(prepareV3HistoryHeaderNativeReferenceChunk([fixture()]));const changed=fixture();changed.nativeSnapshot.version=4;await assert.rejects(store(pool).stage(prepareV3HistoryHeaderNativeReferenceChunk([changed])),/REPLAY_CONFLICT/);assert.equal(pool.committed[0]!.reference.native_version,3);
});
test('relations lock native before evidence/catalogue and require exact same-batch source reference',async()=>{
  const row=fixture('STAFF');row.source.rawFields['所属厅来源编号']='old-hall';row.source.normalizedFields['所属厅来源编号']='old-hall';row.nativeSnapshot.hall_id=id(10);row.bindings={'所属厅来源编号':{sourceKey:'old-hall',nativeId:id(10)}};
  const pool=new FakePool();pool.relationMissing=true;await assert.rejects(store(pool).stage(prepareV3HistoryHeaderNativeReferenceChunk([row])),/RELATION_BINDING_MISSING/);assert.ok(pool.calls[3]!.sql.includes('relation-native'));assert.ok(pool.calls[4]!.sql.includes('reference:native'));assert.ok(!pool.calls.some(c=>c.sql.includes('reference:source')));
  const relation=pool.calls.find(c=>c.sql.includes('reference:relation */'))!;assert.deepEqual(relation.values,[id(1),'HALL','old-hall',id(10)]);assert.match(relation.sql,/r.batch_id=\$1::uuid/);assert.match(relation.sql,/r.source_key=\$3/);
});
test('source and reference insert are atomic; COMMIT unknown is discarded with no retry',async()=>{
  const pool=new FakePool();pool.failReferenceAt=1;await assert.rejects(store(pool).stage(prepareV3HistoryHeaderNativeReferenceChunk([fixture()])),/reference failed/);assert.equal(pool.committed.length,0);assert.equal(pool.calls.at(-1)!.sql,'ROLLBACK');
  const unknown=new FakePool();unknown.failCommit=true;await assert.rejects(store(unknown).stage(prepareV3HistoryHeaderNativeReferenceChunk([fixture()])),/commit unknown/);assert.ok(unknown.discarded);assert.equal(unknown.connects,1);assert.equal(unknown.calls.at(-1)!.sql,'COMMIT');
});
test('reference writer never creates natives, live documents, stock, revisions or publication',async()=>{
  const pool=new FakePool();await store(pool).stage(prepareV3HistoryHeaderNativeReferenceChunk([fixture()]));const writes=pool.calls.filter(c=>/\bINSERT\b|\bUPDATE\s+naijue|\bDELETE\b/.test(c.sql));assert.equal(writes.length,2);assert.ok(writes.every(c=>/INSERT INTO naijue_erp\.(import_source_row|import_header_native_reference)\b/.test(c.sql)));assert.ok(!pool.calls.some(c=>/IMPORT_PUBLISH|inventory_ledger|history_revision/.test(c.sql)));
});

test('whole reference chunk native locks precede every source/replay read',async()=>{
  const row=fixture(),other=fixture();other.source.id=id(3);other.source.sourceKey='second-hall';other.source.rowNo='3';other.source.rawFields['来源编号']='second-hall';other.source.normalizedFields['来源编号']='second-hall';other.nativeSnapshot.id=id(11);
  const pool=new FakePool();await store(pool).stage(prepareV3HistoryHeaderNativeReferenceChunk([row,other]));
  const firstSource=pool.calls.findIndex(c=>c.sql.includes('reference:replay')||c.sql.includes('reference:relation */'));
  const natives=pool.calls.flatMap((c,i)=>c.sql.includes('reference:native')||c.sql.includes('reference:relation-native')?[i]:[]);assert.equal(natives.length,2);assert.ok(natives.every(i=>i<firstSource));
});
test('reusable existing-transaction insert helper never begins, commits, rolls back, connects or releases',async()=>{
  const pool=new FakePool();const client:PgSalesClient={query:async(sql,values=[])=>pool.query(sql,values),release:()=>{throw Error('must not release caller client');}};
  assert.deepEqual(await insertValidatedHistoryHeaderNativeReferences(client,prepareV3HistoryHeaderNativeReferenceChunk([fixture()])),{inserted:1,replayed:0});assert.equal(pool.connects,0);assert.ok(!pool.calls.some(c=>/^(BEGIN|COMMIT|ROLLBACK)/.test(c.sql)));assert.equal(pool.working.length,1);assert.equal(pool.committed.length,0);
});

test('shared pure evidence builder exactly matches writer payloads and validates prepared row before returning',async()=>{
  const chunk=prepareV3HistoryHeaderNativeReferenceChunk([fixture()]),expected=historyHeaderNativeReferenceEvidence(chunk,0),pool=new FakePool();await store(pool).stage(chunk);assert.deepEqual(pool.committed[0],expected);
  assert.throws(()=>historyHeaderNativeReferenceEvidence(chunk,1),/ROW_INDEX/);chunk.rows[0]!.prepared.nativeVersion=100;assert.throws(()=>historyHeaderNativeReferenceEvidence(chunk,0),/PREPARED_CHANGED/);
});
