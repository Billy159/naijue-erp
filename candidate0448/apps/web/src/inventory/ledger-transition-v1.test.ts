/** Browser-contract/pure-view tests only. Injected fetch; no network, DOM pixels,
 * PostgreSQL, source-navigation grant or snapshot persistence evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkedLedgerPage,createInventoryLedgerHttpReader} from './ledger-http-reader.ts';
import {HttpQueryError} from '../transport/http-query.ts';
import type {QueryRead} from '../loading/latest-query.ts';
import type {InventoryLedgerEntry,InventoryLedgerQuery} from '../../../../packages/application/src/inventory-ledger-query-contracts.ts';
import {inventoryActor,inventoryId,ledgerDisplayEntry,ledgerNumberedParameters,ledgerParameters,ledgerRead,ledgerSnapshot} from '../../../../tests/support/synthetic-inventory-ledger-query.ts';
const header='X-Naijue-Ledger-Transition',version='recorded-v1';
function read(parameters=ledgerNumberedParameters(),signal=new AbortController().signal):QueryRead<InventoryLedgerQuery>{return {parameters,signal,identity:{accountId:inventoryActor.accountId,sessionRevision:'1',permissionRevision:'1'},routeInstanceId:'layer2',entityId:parameters.skuId};}
function known(before='9007199254740993',after='9007199254740995'):InventoryLedgerEntry{const e=ledgerDisplayEntry(1);Object.assign(e.display!,{balanceTransition:{state:'KNOWN',before,after,reason:'RECORDED_BALANCE_TRANSITION'}});return e;}
function page(entries:readonly InventoryLedgerEntry[]=[ledgerDisplayEntry(1)]){const q=ledgerNumberedParameters(),s=ledgerSnapshot(ledgerRead(q),entries);return {...s.data,page:1,filteredTotal:String(entries.length)};}
function response(body:unknown=page(),echo:string|null=version,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...(echo===null?{}:{[header]:echo})}});}
function client(fetch:(url:string,init:RequestInit)=>Promise<Response>){return createInventoryLedgerHttpReader({origin:'https://synthetic.example',basePath:'/api',fetch});}
const error=(kind:string,code?:string)=>(e:unknown)=>e instanceof HttpQueryError&&e.kind===kind&&(code===undefined||e.code===code);
test('LIVE layer2 RED browser known contract: native exact endpoints accept with original source/quantity/count invariants intact',()=>{
  const parsed=checkedLedgerPage(page([known()]),ledgerNumberedParameters());assert.deepEqual(parsed.entries[0]!.display!.balanceTransition,{state:'KNOWN',before:'9007199254740993',after:'9007199254740995',reason:'RECORDED_BALANCE_TRANSITION'});
  const reverse=known('-2','0');Object.assign(reverse,{eventKind:'UNAPPROVE',reversesEntryId:inventoryId('ledger',44)});assert.equal(checkedLedgerPage(page([reverse]),ledgerNumberedParameters()).entries[0]!.display!.balanceTransition.after,'0');
});
test('LIVE layer2 browser invalid pairs: malformed/null/missing/overflow/arithmetic/reason/history-known never demote to UNKNOWN or zero',()=>{
  for(const transition of [{state:'KNOWN',before:null,after:'3',reason:'RECORDED_BALANCE_TRANSITION'},
    {state:'KNOWN',before:'1',after:3,reason:'RECORDED_BALANCE_TRANSITION'},{state:'KNOWN',before:'01',after:'3',reason:'RECORDED_BALANCE_TRANSITION'},
    {state:'KNOWN',before:'-0',after:'2',reason:'RECORDED_BALANCE_TRANSITION'},{state:'KNOWN',before:'9223372036854775808',after:'9223372036854775810',reason:'RECORDED_BALANCE_TRANSITION'},
    {state:'KNOWN',before:'1',after:'4',reason:'RECORDED_BALANCE_TRANSITION'},{state:'KNOWN',before:'1',after:'3',reason:'NO_RECORDED_BALANCE_TRANSITION'},
    {state:'UNKNOWN',before:'0',after:'2',reason:'NO_RECORDED_BALANCE_TRANSITION'},{state:'KNOWN',before:'1',reason:'RECORDED_BALANCE_TRANSITION'}]){
    const e=known();Object.assign(e.display!,{balanceTransition:transition});assert.throws(()=>checkedLedgerPage(page([e]),ledgerNumberedParameters()),error('malformed-response'));
  }
  const history=known();Object.assign(history,{eventKind:'HISTORY_REVISION',source:{kind:'HISTORY_REVISION',documentKind:'SALES',revisionId:inventoryId('operation',71),salesId:inventoryId('sales',72),salesLineId:inventoryId('salesLine',73),endpoint:'SALES_WAREHOUSE'}});
  assert.throws(()=>checkedLedgerPage(page([history]),ledgerNumberedParameters()),error('malformed-response'));
  Object.assign(history.display!,{balanceTransition:{state:'UNKNOWN',before:null,after:null,reason:'NO_RECORDED_BALANCE_TRANSITION'}});
  assert.equal(checkedLedgerPage(page([history]),ledgerNumberedParameters()).entries[0]!.display!.balanceTransition.before,null);
  const baseline=known();Object.assign(baseline,{eventKind:'CUTOFF_BASELINE',sourceDocumentVersion:null,source:{kind:'CUTOFF_BASELINE',importBatchId:inventoryId('operation',450),endpoint:'IMPORT_BASELINE'}});
  assert.throws(()=>checkedLedgerPage(page([baseline]),ledgerNumberedParameters()),error('malformed-response'));
  Object.assign(baseline.display!,{balanceTransition:{state:'UNKNOWN',before:null,after:null,reason:'NO_RECORDED_BALANCE_TRANSITION'}});
  assert.equal(checkedLedgerPage(page([baseline]),ledgerNumberedParameters()).entries[0]!.display!.balanceTransition.before,null);
});
test('LIVE layer2 RED browser negotiation: numbered request opts in exactly once and successful known response requires exact echo',async()=>{
  let calls=0;const r=client(async(url,init)=>{calls++;assert.equal(url,'https://synthetic.example/api/inventory/ledger/query');assert.equal(new Headers(init.headers).get(header),version);assert.deepEqual(JSON.parse(init.body as string),ledgerNumberedParameters());return response(page([known()]));});
  assert.equal(calls,0);const value=await r.readLedger(read());assert.equal(value.entries[0]!.display!.balanceTransition.state,'KNOWN');assert.equal(calls,1);
});
test('LIVE layer2 RED browser negotiation: old-server missing/wrong/duplicate200 echo fails explicitly, cancels body and never retries/falls back',async()=>{
  for(const echo of [undefined,'recorded-v2','recorded-v1, recorded-v1']){
    let calls=0,cancelled=0;const r=client(async()=>{calls++;const served=response(page(),echo??null),body=served.body!,cancel=body.cancel.bind(body);
      body.cancel=async reason=>{cancelled++;await cancel(reason);};return served;});
    await assert.rejects(r.readLedger(read()),error('unavailable','INVENTORY_LEDGER_CONTRACT_UPGRADE_REQUIRED'));assert.equal(calls,1);assert.equal(cancelled,1);
  }
});
test('LIVE layer2 browser errors/keyset: no echo required on401/403/503 and original legacy keyset never sends a version header',async()=>{
  for(const [status,kind,code]of [[401,'unauthenticated','UNAUTHENTICATED'],[403,'forbidden','FORBIDDEN'],[503,'unavailable','INVENTORY_NOT_READY']]as const){
    let calls=0;const r=client(async()=>{calls++;return response({error:{code,message:'safe'}},null,status);});await assert.rejects(r.readLedger(read()),error(kind,code));assert.equal(calls,1);
  }
  const q=ledgerParameters(),s=ledgerSnapshot(ledgerRead(q));let calls=0;
  const legacy=client(async(_url,init)=>{calls++;assert.equal(new Headers(init.headers).has(header),false);return response(s.data,null);});
  assert.deepEqual(await legacy.readLedger(read(q)),s.data);assert.equal(calls,1);
});
test('LIVE layer2 browser abort: preabort makes no call and aborted pending fetch cannot publish late versioned facts',async()=>{
  const before=new AbortController();before.abort();let calls=0;
  await assert.rejects(client(async()=>{calls++;return response();}).readLedger(read(undefined,before.signal)),error('aborted'));assert.equal(calls,0);
  const controller=new AbortController();let deliver!:(value:Response)=>void,entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});
  const r=client(async()=>{calls++;entered();return new Promise<Response>(resolve=>{deliver=resolve;});});
  const pending=r.readLedger(read(undefined,controller.signal));await started;controller.abort();await assert.rejects(pending,error('aborted'));
  let cancelled=0;deliver(new Response(new ReadableStream({cancel(){cancelled++;}}),{status:200,headers:{'content-type':'application/json',[header]:version}}));
  await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(cancelled,1);assert.equal(calls,1);
});
test('LIVE layer2 browser abort: cancellation while streaming a correctly echoed body remains abort, never successful empty page',async()=>{
  const controller=new AbortController();let entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});let cancelled=0;
  const r=client(async()=>new Response(new ReadableStream({pull(){entered();},cancel(){cancelled++;}}),{status:200,headers:{'content-type':'application/json',[header]:version}}));
  const pending=r.readLedger(read(undefined,controller.signal));await started;controller.abort();await assert.rejects(pending,error('aborted'));assert.equal(cancelled,1);
});
test('LIVE layer2 RED pure view: exact known strings/zero/negative and unchanged unknown labels, no current inventory reconstruction',async()=>{
  const {ledgerBalanceTransitionView:view}=await import('./ledger-balance-transition-view.ts');
  assert.deepEqual(view({state:'KNOWN',before:'9007199254740993',after:'9007199254740995',reason:'RECORDED_BALANCE_TRANSITION'}),{text:'9,007,199,254,740,993 → 9,007,199,254,740,995',title:'本条流水已保存的变化前后库存'});
  assert.equal(view({state:'KNOWN',before:'-2',after:'0',reason:'RECORDED_BALANCE_TRANSITION'}).text,'-2 → 0');
  assert.deepEqual(view({state:'UNKNOWN',before:null,after:null,reason:'NO_RECORDED_BALANCE_TRANSITION'}),{text:'未知 → 未知',title:'未保存本条流水的变化前后库存'});
  const drawer=readFileSync(new URL('./ledger-drawer.tsx',import.meta.url),'utf8');assert.ok(drawer.includes('ledgerBalanceTransitionView(item.display!.balanceTransition)'));
});
