/** Synthetic protocol + Fastify inject, no PostgreSQL/listener/business data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { PostgresTransferQueryReader } from '../adapters/postgres/src/transfer-query-reader.ts';
import { createTransferQueryHttpPlugin } from '../apps/api/src/transfer-query-http.ts';
import { createSourceConfirmedTransferQueryAuthorization, createTransferQueryService } from '../packages/application/src/transfer-query-service.ts';
import type { TransferReadScope, TrustedTransferSnapshotReader } from '../packages/application/src/transfer-query-ports.ts';
import { actor, ids, sid } from './support/synthetic-transfer.ts';
const parameters = {transferId: ids.transfer, page: 2, pageSize: 20};
const scope: TransferReadScope = {kind:'restricted',clauses:[{fromHallId:ids.hall},{toHallId:ids.hall},{createdHallId:ids.hall,createdRole:'SALESPERSON'}]};
const stamp = '2026-10-22T00:01:02.000000Z';
const audit = () => ({id:sid('audit',801),operation_id:sid('operation',802),actor_account_id:ids.account,action:'SAVE',occurred_at:stamp,old_version:null,new_version:1});
function fixture(options: { missing?: boolean; total?: unknown; rows?: Record<string, unknown>[]; abort?: AbortController; failure?: boolean } = {}) {
  const calls: {sql:string;values:unknown[]}[]=[]; const releases: unknown[]=[]; let connects=0;
  const reader=new PostgresTransferQueryReader({async connect() {connects++; return {async query(sql:string,values:unknown[]=[]) {
    calls.push({sql,values:structuredClone(values)}); let rows: Record<string,unknown>[]=[];
    if(sql.startsWith('SELECT h.id')) rows=options.missing?[]:[{id:ids.transfer}];
    else if(sql.startsWith('SELECT COUNT')) { if(options.failure) throw Error('PRIVATE_SQL_DETAIL'); rows=[{exact_total:options.total??'9007199254740993'}]; options.abort?.abort(); }
    else if(sql.startsWith('SELECT a.id')) rows=options.rows??[audit()];
    else assert.match(sql,/^(BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY|COMMIT|ROLLBACK)$/);
    return {rows,rowCount:rows.length};
  },release(error?: Error|boolean) {releases.push(error);} };} });
  return {reader,calls,releases,connects:()=>connects};
}
const read = (signal=new AbortController().signal, granted: TransferReadScope=scope) => ({actor,scope:granted,parameters,signal});
test('transfer operation history scopes document count and stable page under one readonly snapshot',async()=>{
  const f=fixture();const result=await f.reader.readHistory(read());
  assert.equal(result.exactTotal,9007199254740993n);assert.equal(result.items[0]!.oldVersion,null);assert.equal(result.items[0]!.occurredAt,stamp);
  assert.deepEqual(Object.keys(result.items[0]!).sort(),['id','operationId','actorAccountId','action','occurredAt','oldVersion','newVersion'].sort());
  assert.equal(f.connects(),1);assert.deepEqual(f.releases,[undefined]);assert.equal(f.calls.length,5);
  const [begin,target,count,page,commit]=f.calls;
  assert.equal(begin!.sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(commit!.sql,'COMMIT');
  for(const c of [target!,count!,page!]) {
    assert.deepEqual(c.values.slice(0,5),[ids.hall,ids.hall,ids.hall,'SALESPERSON',ids.transfer]);
    assert.match(c.sql,/\(\(fw.hall_id = \$1::uuid\) OR \(tw.hall_id = \$2::uuid\) OR \(h.created_hall_id = \$3::uuid AND h.created_role = \$4\)\) AND h.id = \$5::uuid/);
    assert.doesNotMatch(c.sql,/before_values|after_values|request_hash|operation_receipt|history_transfer_header|FOR UPDATE/);
  }
  assert.ok(page!.sql.includes(count!.sql.slice(count!.sql.indexOf('FROM naijue_erp.transfer_header'))));
  assert.match(page!.sql,/a.object_type = 'TRANSFER'/);assert.match(page!.sql,/ORDER BY a.occurred_at DESC, a.id DESC LIMIT \$6 OFFSET \$7::bigint/);
  assert.deepEqual(page!.values.slice(-2),[20,'20']);
});
test('transfer operation history unavailable target stops before audit count and empty authorized page remains exact',async()=>{
  const hidden=fixture({missing:true}); await assert.rejects(hidden.reader.readHistory(read()),{code:'DOCUMENT_NOT_FOUND'});
  assert.equal(hidden.calls.length,3);assert.equal(hidden.calls.at(-1)!.sql,'ROLLBACK');assert.ok(hidden.calls.every(c=>!c.sql.includes('audit_change')));
  const empty=fixture({total:'0',rows:[]});const result=await empty.reader.readHistory(read(undefined,{kind:'all'}));
  assert.equal(result.exactTotal,0n);assert.deepEqual(result.items,[]);assert.deepEqual(empty.calls[1]!.values,[ids.transfer]);
});
test('transfer operation history malformed counts duplicate audit and missing actual metadata fail closed',async()=>{
  for(const options of [{total:3},{total:'20'},{rows:[audit(),audit()]},{rows:[{...audit(),occurred_at:null}]},{rows:[{...audit(),action:'IMPORT_PUBLISH'}]}]) {
    const f=fixture(options);await assert.rejects(f.reader.readHistory(read()),{code:'INVALID_DATABASE_VALUE'});
    assert.equal(f.calls.at(-1)!.sql,'ROLLBACK');assert.equal(f.releases.length,1);
  }
});
test('transfer operation history bounded input and denied scope fail before connection; abort stops audit page',async()=>{
  const f=fixture();
  for(const input of [{...parameters,page:0},{...parameters,pageSize:201},{...parameters,pageSize:1.5},{...parameters,actorAccountId:ids.account},{...parameters,transferId:"' OR TRUE"}]) {
    assert.throws(()=>createTransferQueryService({authorization:createSourceConfirmedTransferQueryAuthorization(),reader:f.reader}).readHistory(actor,input,new AbortController().signal),{code:'INVALID_TRANSFER_QUERY'});
  }
  await assert.rejects(f.reader.readHistory(read(undefined,{kind:'restricted',clauses:[]})),{code:'FORBIDDEN'});assert.equal(f.connects(),0);
  const abort=new AbortController(), aborted=fixture({abort});await assert.rejects(aborted.reader.readHistory(read(abort.signal)),{code:'TRANSFER_READ_ABORTED'});
  assert.equal(aborted.calls.at(-1)!.sql,'ROLLBACK');assert.ok(aborted.calls.every(c=>!c.sql.startsWith('SELECT a.id')));
});
test('transfer operation history POST authenticates each request applies source visibility and serializes exact count',async t=>{
  const f=fixture(),app=Fastify();let authenticated=true;
  await app.register(createTransferQueryHttpPlugin({authenticate:async()=>authenticated?actor:null,dependencies:{authorization:createSourceConfirmedTransferQueryAuthorization(),reader:f.reader}}),{prefix:'/api'});
  t.after(()=>app.close());await app.ready();assert.equal(app.server.listening,false);
  const post=(payload:unknown,url='/api/transfers/history/query')=>app.inject({method:'POST',url,payload:JSON.stringify(payload),headers:{'content-type':'application/json'}});
  const ok=await post(parameters);assert.equal(ok.statusCode,200);assert.equal(ok.json().exactTotal,'9007199254740993');assert.equal(ok.headers['cache-control'],'no-store');
  assert.equal(ok.json().items[0].occurredAt,stamp);assert.ok(!ok.body.includes('request_hash'));
  const before=f.connects();assert.equal((await post({...parameters,scope:{kind:'all'}})).statusCode,400);
  assert.equal((await post(parameters,'/api/transfers/history/query?scope=all')).statusCode,400);
  authenticated=false;const denied=await post(parameters);assert.equal(denied.statusCode,401);assert.equal(denied.headers['cache-control'],'no-store');assert.equal(f.connects(),before);
});
test('transfer operation history missing explicit capability and SQL failure are unavailable not successful empty history',async t=>{
  const f=fixture({failure:true}), old:TrustedTransferSnapshotReader={readList:f.reader.readList.bind(f.reader),readDetail:f.reader.readDetail.bind(f.reader),readWarehouses:f.reader.readWarehouses.bind(f.reader)};
  const service=createTransferQueryService({authorization:createSourceConfirmedTransferQueryAuthorization(),reader:old});
  await assert.rejects(service.readHistory(actor,parameters,new AbortController().signal),{code:'TRANSFER_HISTORY_UNAVAILABLE'});assert.equal(f.connects(),0);
  for(const [reader,status] of [[old,503],[f.reader,500]] as const) {
    const app=Fastify();t.after(()=>app.close());await app.register(createTransferQueryHttpPlugin({authenticate:async()=>actor,dependencies:{authorization:createSourceConfirmedTransferQueryAuthorization(),reader}}));
    const result=await app.inject({method:'POST',url:'/transfers/history/query',payload:parameters});
    assert.equal(result.statusCode,status);assert.ok(!result.body.includes('PRIVATE_SQL_DETAIL'));assert.ok(!Object.hasOwn(result.json(),'items'));
  }
});
