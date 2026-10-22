import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareV3HistoryHeaderChunk, stageV3HistoryHeaders, HISTORY_HEADER_STAGING_CHUNK_LIMIT } from '../packages/application/src/import-v3-history-header-staging.ts';
import type { HistoryHeaderInput } from '../packages/application/src/import-v3-history-header.ts';
import { PostgresV3HistoryHeaderStagingStore } from '../adapters/postgres/src/import-v3-history-header-staging-store.ts';
import type { PgSalesClient, PgSalesPool, PgSalesResult } from '../adapters/postgres/src/sales-unit-of-work.ts';
import { IMPORT_V2_TABLES } from '../packages/application/src/import-v2-contract.ts';
const id = (n:number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const hash = 'a'.repeat(64);
function fixture(entity:'SALES_HEADER'|'TRANSFER_HEADER'='TRANSFER_HEADER'): HistoryHeaderInput {
  const table = IMPORT_V2_TABLES.find(t=>t.entity===entity)!;
  const n:Record<string,string> = Object.fromEntries(table.columns.map(c=>[c.name,'']));
  Object.assign(n,{'来源编号':'legacy-doc','原单号':'0000123','业务日期':'2024-02-29','原审核状态':'已审核','创建厅归属来源':'UNKNOWN','创建厅归属原因':'UNKNOWN_ORIGINAL_CREATOR_UNMATCHED'});
  const bindings:HistoryHeaderInput['bindings'] = {};
  if (entity==='TRANSFER_HEADER') Object.assign(n,{'调出仓来源编号':'old-from','调入仓来源编号':'old-to','原制单角色':'旧角色'});
  else Object.assign(n,{'单据类型':'销售','所属厅来源编号':'old-hall','客户来源编号':'old-customer','仓库来源编号':'old-wh','优惠前金额':'10.00','整单优惠':'1','应结金额':'8.50'});
  for (const [i,field] of (entity==='TRANSFER_HEADER'?['调出仓来源编号','调入仓来源编号']:['所属厅来源编号','客户来源编号','仓库来源编号']).entries()) Object.assign(bindings,{[field]:{sourceKey:n[field]!,nativeId:id(10+i)}});
  const raw = {...n,'原创建厅编号':'uploaded-warehouse-derived-hall'} as Record<string,string>;
  delete raw['创建厅归属来源']; delete raw['创建厅归属原因'];
  return {batchId:id(1),fixedSourceNamespace:'synthetic-header',selection:{baseManifestSha256:hash,selectionSha256:hash,approvalSha256:hash,csvSha256:hash,source:'BASE_V2',entity,path:table.file as HistoryHeaderInput['selection']['path']},source:{id:id(2),batchId:id(1),entityType:entity,sourceKey:'legacy-doc',fileRef:'original.xlsx',sheet:'header',rowNo:'2',sourceFileSha256:hash,rowSha256:hash,rawFields:raw,normalizedFields:n,fieldProvenance:{schema_version:1,fields:{}}},bindings,creatorHallOverlay:{evidenceRef:'approved-overlay.csv#row2',file:'original.xlsx',sheet:'header',row:'2',sourceId:'legacy-doc',documentNumber:'0000123',personField:entity==='SALES_HEADER'?'营业员来源编号':'原制单账号编号',personId:'',uploadedWarehouseDerivedHall:'uploaded-warehouse-derived-hall',candidateCreatorHall:'',provenance:'UNKNOWN',reason:'UNKNOWN_ORIGINAL_CREATOR_UNMATCHED'}};
}
function second(input:HistoryHeaderInput): HistoryHeaderInput {
  const row = structuredClone(input); row.source.id=id(3); row.source.sourceKey='second'; row.source.rowNo='3';
  row.source.rawFields['来源编号']='second'; row.source.normalizedFields['来源编号']='second';
  Object.assign(row.creatorHallOverlay,{row:'3',sourceId:'second'}); return row;
}
function change(row:HistoryHeaderInput, field:string, value:string):void {row.source.rawFields[field]=value;row.source.normalizedFields[field]=value;}
type Stored = {source:Record<string,unknown>;header:Record<string,unknown>};
/** Synthetic transaction protocol fake only. Never opens pg or proves database execution. */
class FakePool implements PgSalesPool {
  calls:Array<{sql:string;values:unknown[]}> = []; committed:Stored[]=[]; working:Stored[]=[]; pending:Record<string,unknown>|undefined;
  connects=0; discarded:Error|undefined; badBinding=false; badCatalogue=false; failHeaderAt=0; headerAttempts=0; failCommit=false; failRollback=false; closed=false; wrongHash=false; wrongNamespace=false;
  async connect():Promise<PgSalesClient> {this.connects++;return {query:async(sql,values=[])=>this.query(sql,values),release:error=>{this.discarded=error instanceof Error?error:undefined;}};}
  async query(sql:string,values:unknown[]):Promise<PgSalesResult> {
    this.calls.push({sql,values}); const answer=(rows:Record<string,unknown>[]=[]):PgSalesResult=>({rows,rowCount:rows.length});
    if(sql.startsWith('BEGIN')){this.working=structuredClone(this.committed);return answer();}
    if(sql==='COMMIT'){if(this.failCommit)throw Error('commit unknown');this.committed=this.working;return answer();}
    if(sql==='ROLLBACK'){if(this.failRollback)throw Error('rollback failed');this.working=structuredClone(this.committed);this.pending=undefined;return answer();}
    if(sql.includes('history-header-stage:batch'))return answer([{mapping_version:'V2_HISTORY_NULLABLE_1',status:this.closed?'IMPORTED':'STAGED',source_hash:this.wrongHash?'b'.repeat(64):hash,source_name:this.wrongNamespace?'other':'synthetic-header'}]);
    if(sql.includes('history-header-stage:native'))return answer([{id:values[0]}]);
    if(sql.includes('history-header-stage:catalogue'))return answer(this.badCatalogue?[]:[{source_row_id:id(100)}]);
    if(sql.includes('history-header-stage:bindings'))return answer(this.badBinding?[]:[{id:values[1]}]);
    if(sql.includes('history-header-stage:replay')) {
      const existing=this.working.filter(old=>old.source.id===values[0]||(old.source.batch_id===values[3]&&((old.source.entity_type===values[4]&&old.source.source_key===values[5])||(old.source.source_file_sha256===values[6]&&old.source.sheet===values[7]&&old.source.row_no===values[8]))));
      return answer(existing.map(old=>({source_equal:JSON.stringify(old.source)===values[1],header_equal:JSON.stringify(old.header)===values[2]})));
    }
    if(sql.includes('history-header-stage:source')){this.pending=JSON.parse(String(values[0])) as Record<string,unknown>;return answer([{id:this.pending.id}]);}
    if(sql.includes('history-header-stage:header')) {
      this.headerAttempts++;if(this.headerAttempts===this.failHeaderAt)throw Error('header failed');
      const header=JSON.parse(String(values[0])) as Record<string,unknown>;this.working.push({source:this.pending!,header});return answer([{id:header.id}]);
    }
    return answer();
  }
}
const store=(pool:FakePool)=>new PostgresV3HistoryHeaderStagingStore(pool);

test('default dry run maps full typed header/evidence but never authorizes, connects or publishes',async()=>{
  const row=fixture(),before=structuredClone(row),pool=new FakePool();let authorizations=0;
  const result=await stageV3HistoryHeaders([row],{store:store(pool),authorize:async()=>{authorizations++;}});
  assert.deepEqual(result,{mode:'DRY_RUN',rows:1,inserted:0,replayed:0,published:false,importReady:false});assert.equal(pool.connects,0);assert.equal(authorizations,0);assert.deepEqual(row,before);
  const prepared=prepareV3HistoryHeaderChunk([row]).rows[0]!.prepared;assert.equal(prepared.header.createdBySourceKey,null);assert.equal(prepared.header.approvedLocalAt,null);assert.equal(prepared.source.rawFields['原创建厅编号'],'uploaded-warehouse-derived-hall');
});
test('explicit STAGE authorization happens before connection; callback mutation cannot alter staged rows',async()=>{
  const pool=new FakePool();await assert.rejects(stageV3HistoryHeaders([fixture()],{mode:'STAGE',store:store(pool)}),/AUTHORIZATION/);
  await assert.rejects(stageV3HistoryHeaders([fixture()],{mode:'STAGE',store:store(pool),authorize:async()=>{throw Error('not authenticated');}}),/not authenticated/);assert.equal(pool.connects,0);
  await stageV3HistoryHeaders([fixture()],{mode:'STAGE',store:store(pool),authorize:async chunk=>{chunk.rows[0]!.prepared.header.number='changed';}});
  assert.equal(pool.committed[0]!.header.number,'0000123');
});
test('bounded homogeneous chunk rejects duplicate identity, IDs, occurrence, mixed selection, malformed provenance and UTF8 byte overflow',()=>{
  assert.throws(()=>prepareV3HistoryHeaderChunk([]),/CHUNK_LIMIT/);
  assert.throws(()=>prepareV3HistoryHeaderChunk(Array(HISTORY_HEADER_STAGING_CHUNK_LIMIT+1).fill(fixture())),/CHUNK_LIMIT/);
  assert.throws(()=>prepareV3HistoryHeaderChunk([fixture(),fixture()]),/DUPLICATE/);
  const row=fixture(),other=second(row);other.selection.csvSha256='b'.repeat(64);assert.throws(()=>prepareV3HistoryHeaderChunk([row,other]),/MIXED_BATCH/);
  const provenance=fixture();provenance.source.fieldProvenance.fields={bad:{origin:'MIGRATION_DERIVED',reason:'no evidence',raw:'x'}};assert.throws(()=>prepareV3HistoryHeaderChunk([provenance]),/PROVENANCE/);
  const big=fixture();big.source.rawFields.extra='汉'.repeat(1_500_000);assert.throws(()=>prepareV3HistoryHeaderChunk([big]),/BYTE_LIMIT/);
});
test('SQL boundary rederives entire prepared DTO and rejects typed/provenance/metadata tampering before connection',async()=>{
  for(const mutate of [c=>{c.rows[0]!.prepared.header.createdLocalAt='2024-01-01T00:00:00';},c=>{c.rows[0]!.prepared.header.version=2;},c=>{c.rows[0]!.prepared.fieldProvenance.fields={};},c=>{c.rows[0]!.prepared.fingerprint='b'.repeat(64);},c=>{c.selection.csvSha256='b'.repeat(64);}] satisfies Array<(c:ReturnType<typeof prepareV3HistoryHeaderChunk>)=>void>){const pool=new FakePool(),chunk=prepareV3HistoryHeaderChunk([fixture()]);mutate(chunk);await assert.rejects(store(pool).stage(chunk),/PREPARED_CHANGED/);assert.equal(pool.connects,0);}
});
test('sales and non-null creator hall require same-batch typed native catalogue, not unsupported import_record types',async()=>{
  const pool=new FakePool();assert.equal((await stageV3HistoryHeaders([fixture('SALES_HEADER')])).mode,'DRY_RUN');
  pool.badCatalogue=true;await assert.rejects(store(pool).stage(prepareV3HistoryHeaderChunk([fixture('SALES_HEADER')])),/NATIVE_CATALOGUE_BINDING_MISSING/);
  const row=fixture();Object.assign(row.source.normalizedFields,{'原创建厅编号':'old-hall','创建厅归属来源':'MIGRATION_DERIVED','创建厅归属原因':'approved hall overlay'});
  Object.assign(row.bindings,{'原创建厅编号':{sourceKey:'old-hall',nativeId:id(25)}});Object.assign(row.creatorHallOverlay,{candidateCreatorHall:'old-hall',provenance:'MIGRATION_DERIVED',reason:'approved hall overlay'});
  await assert.rejects(store(pool).stage(prepareV3HistoryHeaderChunk([row])),/NATIVE_CATALOGUE_BINDING_MISSING/);assert.equal(pool.committed.length,0);
  pool.badCatalogue=false;assert.deepEqual(await store(pool).stage(prepareV3HistoryHeaderChunk([row])),{inserted:1,replayed:0});
});
test('atomic insert and exact replay retain all 0011 typed columns and full original/provenance data',async()=>{
  const pool=new FakePool(),chunk=prepareV3HistoryHeaderChunk([fixture()]);assert.deepEqual(await store(pool).stage(chunk),{inserted:1,replayed:0});assert.deepEqual(await store(pool).stage(chunk),{inserted:0,replayed:1});
  const {source,header}=pool.committed[0]!;assert.equal(header.created_hall_id,null);assert.equal(header.created_by_source_key,null);assert.equal(header.approved_local_at,null);assert.equal(header.business_date,'2024-02-29');assert.equal(header.created_role_source,'旧角色');
  assert.deepEqual(source.raw_fields,fixture().source.rawFields);assert.deepEqual(source.normalized_fields,fixture().source.normalizedFields);assert.ok((source.field_provenance as Record<string,unknown>).history_header_mapping);
  assert.deepEqual(Object.keys(header).sort(),['id','source_row_id','batch_id','version','number','business_date','source_status','note','created_by_source_key','approved_by_source_key','created_hall_id','created_hall_provenance','created_hall_reason','created_local_at','updated_local_at','approved_local_at','created_instant','updated_instant','approved_instant','from_warehouse_id','to_warehouse_id','created_role_source'].sort());
});
test('SQL lock order is global then batch then both native warehouses; native references require exact same-batch IMPORTED source key',async()=>{
  const pool=new FakePool();await store(pool).stage(prepareV3HistoryHeaderChunk([fixture()]));
  assert.ok(pool.calls[1]!.sql.includes('global-lock'));assert.ok(pool.calls[2]!.sql.includes('stage:batch'));assert.ok(pool.calls[3]!.sql.includes('stage:native'));assert.ok(pool.calls[4]!.sql.includes('stage:native'));assert.ok(pool.calls[5]!.sql.includes('stage:bindings'));
  const queries=pool.calls.filter(c=>c.sql.includes('stage:bindings'));assert.deepEqual(queries.map(c=>c.values),[[id(1),id(10),'old-from'],[id(1),id(11),'old-to']]);
  for(const {sql} of queries){assert.match(sql,/r.import_batch_id=\$1::uuid/);assert.match(sql,/r.target_type='WAREHOUSE'/);assert.match(sql,/r.source_key=\$3/);assert.match(sql,/r.status='IMPORTED'/);assert.match(sql,/FOR SHARE/);}
});
test('replay SQL normalizes date/local timestamp/instant/numeric via real composite types and compares all columns',async()=>{
  const pool=new FakePool();await store(pool).stage(prepareV3HistoryHeaderChunk([fixture()]));const sql=pool.calls.find(c=>c.sql.includes('stage:replay'))!.sql;
  assert.match(sql,/to_jsonb\(s\) IS NOT DISTINCT FROM to_jsonb\(jsonb_populate_record\(NULL::naijue_erp.import_source_row/);
  assert.match(sql,/to_jsonb\(h\) IS NOT DISTINCT FROM to_jsonb\(jsonb_populate_record\(NULL::naijue_erp.history_transfer_header/);
  assert.ok(!sql.includes(" - '"));
});
test('changed raw evidence, dates or timestamp values reject immutable replay',async()=>{
  const pool=new FakePool();await store(pool).stage(prepareV3HistoryHeaderChunk([fixture()]));
  for(const field of ['业务日期','原创建时间','备注']){const row=fixture();change(row,field,field==='业务日期'?'2024-03-01':field==='原创建时间'?'2024-02-29 01:02:03':'changed');await assert.rejects(store(pool).stage(prepareV3HistoryHeaderChunk([row])),/REPLAY_CONFLICT/);}
});
test('duplicate same source identity under another evidence UUID/position fails; no orphan source is accepted as replay',async()=>{
  const pool=new FakePool();await store(pool).stage(prepareV3HistoryHeaderChunk([fixture()]));const row=fixture();row.source.id=id(30);row.source.rowNo='30';row.creatorHallOverlay.row='30';
  await assert.rejects(store(pool).stage(prepareV3HistoryHeaderChunk([row])),/REPLAY_CONFLICT/);
  pool.committed[0]!.header={};await assert.rejects(store(pool).stage(prepareV3HistoryHeaderChunk([fixture()])),/REPLAY_CONFLICT/);
});
test('missing bindings, closed batch, selection hash or namespace mismatch fail before insert',async()=>{
  for(const flag of ['badBinding','closed','wrongHash','wrongNamespace'] as const){const pool=new FakePool();pool[flag]=true;await assert.rejects(store(pool).stage(prepareV3HistoryHeaderChunk([fixture()])));assert.ok(!pool.calls.some(c=>c.sql.includes('stage:source')));assert.equal(pool.committed.length,0);}
});
test('second-header failure rolls back entire chunk; explicit retry and replay-prefix/new-suffix succeed',async()=>{
  const pool=new FakePool(),row=fixture(),chunk=prepareV3HistoryHeaderChunk([row,second(row)]);pool.failHeaderAt=2;
  await assert.rejects(store(pool).stage(chunk),/header failed/);assert.equal(pool.committed.length,0);assert.equal(pool.calls.at(-1)!.sql,'ROLLBACK');
  pool.failHeaderAt=0;assert.deepEqual(await store(pool).stage(prepareV3HistoryHeaderChunk([row])),{inserted:1,replayed:0});assert.deepEqual(await store(pool).stage(chunk),{inserted:1,replayed:1});assert.equal(pool.committed.length,2);
});
test('unknown COMMIT discards connection, propagates without retry or misleading rollback',async()=>{
  const pool=new FakePool();pool.failCommit=true;await assert.rejects(store(pool).stage(prepareV3HistoryHeaderChunk([fixture()])),/commit unknown/);assert.equal(pool.connects,1);assert.ok(pool.discarded);assert.equal(pool.calls.at(-1)!.sql,'COMMIT');assert.equal(pool.calls.filter(c=>c.sql==='COMMIT').length,1);
});
test('rollback failure discards connection and retains original and rollback errors',async()=>{
  const pool=new FakePool();pool.failHeaderAt=1;pool.failRollback=true;await assert.rejects(store(pool).stage(prepareV3HistoryHeaderChunk([fixture()])),error=>error instanceof AggregateError&&error.errors.length===2);assert.ok(pool.discarded);
});
test('SQL never writes native catalogue, live documents, lines, ledger, revisions, batch status or publication',async()=>{
  const pool=new FakePool();await store(pool).stage(prepareV3HistoryHeaderChunk([fixture()]));
  const writes=pool.calls.filter(c=>/\bINSERT\b|\bUPDATE\s+naijue|\bDELETE\b|\bTRUNCATE\b/.test(c.sql));assert.equal(writes.length,2);
  assert.ok(writes.every(c=>/INSERT INTO naijue_erp\.(import_source_row|history_transfer_header)\b/.test(c.sql)));
  assert.ok(!pool.calls.some(c=>/\binventory_ledger\b|\bIMPORT_PUBLISH\b|\bIMPORT_CHUNK\b|\bhistory_revision\b/.test(c.sql)));
});
test('whole multirow chunk locks all distinct natives before any source/catalogue read',async()=>{
  const row=fixture(),other=second(row);Object.assign(other.bindings,{'调出仓来源编号':{sourceKey:'old-from',nativeId:id(50)},'调入仓来源编号':{sourceKey:'old-to',nativeId:id(51)}});
  const pool=new FakePool();await store(pool).stage(prepareV3HistoryHeaderChunk([row,other]));
  const firstEvidence=pool.calls.findIndex(c=>c.sql.includes('stage:bindings')||c.sql.includes('stage:catalogue')||c.sql.includes('stage:replay'));
  const nativeIndices=pool.calls.flatMap((c,i)=>c.sql.includes('stage:native')?[i]:[]);assert.equal(nativeIndices.length,4);assert.ok(nativeIndices.every(i=>i<firstEvidence));
});
test('sales headers preserve full monetary values and map hall/customer/staff via immutable catalogue without current snapshot revalidation',async()=>{
  const row=fixture('SALES_HEADER');change(row,'营业员来源编号','old-person');row.creatorHallOverlay.personId='old-person';Object.assign(row.bindings,{'营业员来源编号':{sourceKey:'old-person',nativeId:id(40)}});
  const pool=new FakePool();await store(pool).stage(prepareV3HistoryHeaderChunk([row]));const header=pool.committed[0]!.header;assert.equal(header.gross_amount,'10.00');assert.equal(header.order_discount,'1.00');assert.equal(header.net_due,'8.50');assert.equal(header.salesperson_id,id(40));
  const joins=pool.calls.filter(c=>c.sql.includes('stage:catalogue'));assert.deepEqual(joins.map(c=>c.values[1]),['HALL','CUSTOMER','STAFF']);assert.ok(joins.every(c=>!c.sql.includes('native_snapshot')&&!c.sql.includes('native_version')));assert.match(pool.calls.find(c=>c.sql.includes('stage:replay'))!.sql,/NULL::naijue_erp.history_sales_header/);
});
