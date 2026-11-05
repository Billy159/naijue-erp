/** Layer2 SCRIPTED HTTP contracts only: Fastify.inject + synthetic trusted reader.
 * No listener, PostgreSQL, new-column SELECT, persistence or deployment proof. */
import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type { IncomingMessage } from 'node:http';
import { DomainError } from '../packages/domain/src/errors.ts';
import type { InventoryLedgerEntry, InventoryLedgerScopedRead } from '../packages/application/src/inventory-ledger-query-contracts.ts';
import { createInventoryLedgerQueryHttpPlugin } from '../apps/api/src/inventory-ledger-query-http.ts';
import { inventoryActor, inventoryId, inventoryScope, ledgerDisplayEntry, ledgerEntry, ledgerNumberedParameters, ledgerParameters, ledgerSnapshot } from './support/synthetic-inventory-ledger-query.ts';
const path='/inventory/ledger/query',header='x-naijue-ledger-transition',version='recorded-v1';
function known():InventoryLedgerEntry {
  const e=ledgerDisplayEntry(1);
  Object.assign(e.display!,{balanceTransition:{state:'KNOWN',before:'9007199254740993',after:'9007199254740995',reason:'RECORDED_BALANCE_TRANSITION'}});
  return e;
}
function mixed():InventoryLedgerEntry[] {
  const old=ledgerDisplayEntry(2),history=ledgerDisplayEntry(3),baseline=ledgerDisplayEntry(4);
  Object.assign(history,{eventKind:'HISTORY_REVISION',source:{kind:'HISTORY_REVISION',documentKind:'SALES',revisionId:inventoryId('operation',700),salesId:inventoryId('sales',701),salesLineId:inventoryId('salesLine',702),endpoint:'SALES_WAREHOUSE'}});
  Object.assign(baseline,{eventKind:'CUTOFF_BASELINE',sourceDocumentVersion:null,source:{kind:'CUTOFF_BASELINE',importBatchId:inventoryId('operation',450),endpoint:'IMPORT_BASELINE'}});
  return [known(),old,history,baseline];
}
function snapshot(read:InventoryLedgerScopedRead,entries:readonly InventoryLedgerEntry[]) {
  const s=ledgerSnapshot(read,entries);
  return {...s,data:{...s.data,...(read.parameters.page===undefined?{}:{page:read.parameters.page,filteredTotal:String(entries.length)})}};
}
async function setup(t:TestContext,options:{entries?:readonly InventoryLedgerEntry[];unauthenticated?:boolean;forbidden?:boolean;error?:Error;vary?:string;read?: (read:InventoryLedgerScopedRead)=>Promise<ReturnType<typeof snapshot>>}={}) {
  const app=Fastify({logger:false});t.after(()=>app.close());const calls={auth:0,authorize:0,read:0};let raw:IncomingMessage|undefined;
  app.addHook('onRequest',async(request,reply)=>{raw=request.raw;if(options.vary!==undefined)reply.header('Vary',options.vary);});
  app.register(createInventoryLedgerQueryHttpPlugin({authenticate:async()=>{calls.auth++;return options.unauthenticated?null:inventoryActor;},dependencies:{
    authorization:{async authorize(){calls.authorize++;if(options.forbidden)throw new DomainError('FORBIDDEN','PRIVATE policy');return inventoryScope;}},
    reader:{async readLedger(read){calls.read++;if(options.error)throw options.error;return options.read?options.read(read):snapshot(read,structuredClone(options.entries??[ledgerDisplayEntry(1)]));}}
  }}));await app.ready();
  const post=(headers:Record<string,string|string[]>={},body:unknown=ledgerNumberedParameters())=>app.inject({method:'POST',url:path,headers:{'content-type':'application/json',...headers},payload:JSON.stringify(body)});
  return {app,calls,post,raw:()=>raw};
}
test('LIVE layer2 legacy HTTP: genuinely unknown numbered rows keep exact original body; old keyset body/header behavior stays unchanged',async t=>{
  const f=await setup(t),legacy=await f.post();assert.equal(legacy.statusCode,200,legacy.body);
  assert.deepEqual(legacy.json().entries[0].display.balanceTransition,{state:'UNKNOWN',before:null,after:null,reason:'NO_RECORDED_BALANCE_TRANSITION'});
  assert.equal(legacy.headers[header],undefined);assert.equal(legacy.headers['cache-control'],'no-store');
  const q=ledgerParameters(),keyset=await setup(t,{read:async read=>snapshot(read,[ledgerEntry(1)])}),reply=await keyset.post({},q);
  assert.equal(reply.statusCode,200);assert.deepEqual(reply.json(),snapshot({actor:inventoryActor,scope:inventoryScope,parameters:q,signal:new AbortController().signal},[ledgerEntry(1)]).data);
  assert.equal(reply.headers[header],undefined);assert.equal(reply.headers.vary,undefined);assert.equal(reply.headers['x-inventory-readiness'],'ready');
});
test('LIVE layer2 RED legacy HTTP: a recorded pair requires explicit upgrade409, never partial page or false UNKNOWN',async t=>{
  const f=await setup(t,{entries:mixed()}),r=await f.post();assert.equal(r.statusCode,409,r.body);
  assert.deepEqual(Object.keys(r.json()),['error']);assert.equal(r.json().error.code,'INVENTORY_LEDGER_CONTRACT_UPGRADE_REQUIRED');
  assert.match(r.json().error.message,/Reload/);assert.equal(r.json().entries,undefined);
  for(const h of [header,'x-inventory-read-reference','x-inventory-readiness'])assert.equal(r.headers[h],undefined);
  assert.equal(r.headers['cache-control'],'no-store');assert.deepEqual(f.calls,{auth:1,authorize:1,read:1});
});
test('LIVE layer2 RED recorded HTTP: exact opt-in echoes contract and preserves mixed known/native-old/history/baseline facts',async t=>{
  const f=await setup(t,{entries:mixed()}),r=await f.post({[header]:version});assert.equal(r.statusCode,200,r.body);
  assert.equal(r.headers[header],version);assert.equal(r.headers.vary,'X-Naijue-Ledger-Transition');
  assert.equal(r.headers['x-inventory-readiness'],'ready');assert.equal(r.json().filteredTotal,'4');
  assert.deepEqual(r.json().entries.map((e:{display:{balanceTransition:{state:string}}})=>e.display.balanceTransition.state),['KNOWN','UNKNOWN','UNKNOWN','UNKNOWN']);
  assert.deepEqual(r.json().entries[0].display.balanceTransition,{state:'KNOWN',before:'9007199254740993',after:'9007199254740995',reason:'RECORDED_BALANCE_TRANSITION'});
  assert.equal(r.json().entries[2].source.kind,'HISTORY_REVISION');assert.equal(r.json().entries[3].source.kind,'CUTOFF_BASELINE');
});
test('LIVE layer2 RED HTTP version: unsupported/empty/comma/duplicate versions and opt-in keyset reject before business read',async t=>{
  const f=await setup(t);
  for(const value of ['', 'recorded-v2','RECORDED-V1','recorded-v1, recorded-v1',['recorded-v1','recorded-v1']]){
    const r=await f.post({[header]:value});assert.equal(r.statusCode,400,r.body);assert.equal(r.json().error.code,'INVALID_INVENTORY_LEDGER_QUERY');
  }
  const keyset=await f.post({[header]:version},ledgerParameters());assert.equal(keyset.statusCode,400,keyset.body);
  assert.equal(f.calls.authorize,0);assert.equal(f.calls.read,0);
});
test('LIVE layer2 RED HTTP Vary: merge existing fields, preserve wildcard and avoid case-insensitive duplicate',async t=>{
  const cases: readonly (readonly [prior: string | undefined, expected: string])[] = [['Accept-Encoding','Accept-Encoding, X-Naijue-Ledger-Transition'],['*','*'],['x-naijue-ledger-transition','x-naijue-ledger-transition']];
  for(const [prior,expected]of cases){
    const options: { vary?: string } = prior === undefined ? {} : { vary: prior };
    const f=await setup(t,options),r=await f.post({[header]:version});assert.equal(r.statusCode,200,r.body);assert.equal(r.headers.vary,expected);
  }
});
test('LIVE layer2 HTTP auth/errors: authentication still precedes invalid header; opt-in does not bypass current policy or mask statuses',async t=>{
  const unauth=await setup(t,{unauthenticated:true}),u=await unauth.post({[header]:'bad'});assert.equal(u.statusCode,401);assert.deepEqual(unauth.calls,{auth:1,authorize:0,read:0});
  const denied=await setup(t,{forbidden:true}),d=await denied.post({[header]:version});assert.equal(d.statusCode,403);assert.equal(d.headers[header],undefined);assert.equal(denied.calls.read,0);assert.ok(!d.body.includes('PRIVATE'));
  for(const [error,status]of [[new DomainError('INVENTORY_NOT_READY','PRIVATE readiness'),503],[new Error('PRIVATE driver'),500]] as const){
    const f=await setup(t,{error}),r=await f.post({[header]:version});assert.equal(r.statusCode,status);assert.equal(r.headers[header],undefined);assert.equal(r.headers['x-inventory-readiness'],undefined);assert.ok(!r.body.includes('PRIVATE'));
  }
});
test('LIVE layer2 HTTP integrity: version opt-in cannot legitimize a forged KNOWN historical transition',async t=>{
  const e=mixed()[2]!;Object.assign(e.display!,{balanceTransition:{state:'KNOWN',before:'1',after:'3',reason:'RECORDED_BALANCE_TRANSITION'}});
  const f=await setup(t,{entries:[e]}),r=await f.post({[header]:version});assert.equal(r.statusCode,500);assert.equal(r.json().error.code,'INTERNAL_ERROR');
  assert.equal(r.headers[header],undefined);assert.equal(r.headers['x-inventory-readiness'],undefined);assert.equal(r.json().entries,undefined);
});
test('LIVE layer2 HTTP abort: disconnect during opted read forwards original abort and never publishes echo or late facts',async t=>{
  let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;});let signal:AbortSignal|undefined;
  const f=await setup(t,{read:async read=>{signal=read.signal;entered();await gate;return snapshot(read,[known()]);}});
  const pending=f.post({[header]:version});await started;f.raw()!.emit('aborted');assert.equal(signal!.aborted,true);release();const r=await pending;
  assert.equal(r.statusCode,408);assert.equal(r.headers[header],undefined);assert.equal(r.json().entries,undefined);
});
