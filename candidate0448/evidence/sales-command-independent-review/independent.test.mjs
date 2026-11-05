import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../../apps/web/src/loading/read-scope.ts';
import { SalesCommandError } from '../../apps/web/src/sales/commands/contracts.ts';
import { SalesCommandWorkspace } from '../../apps/web/src/sales/commands/controller.ts';
import { createSalesCommandHttpClient } from '../../apps/web/src/sales/commands/http-client.ts';
import { validateSalesCommand,validateSalesResult,validateSalesReceipt,validateSalesDraft } from '../../apps/web/src/sales/commands/validation.ts';
import { parseSalesCommand } from '../../apps/api/src/input.ts';
import { detail,draft,result,receipt,save,stateCommand,json,uuid,deferred,flush } from '../../apps/web/src/sales/commands/fixtures.test-support.ts';
const sig=()=>new AbortController().signal;
const uncertain=()=>new SalesCommandError('network','NETWORK_ERROR','uncertain');
function setup(first=detail(),overrides={}) {
 const context=new ReadContext({accountId:'INDEPENDENT',sessionRevision:'1',permissionRevision:'1'}),scope=context.createScope('INDEPENDENT');
 let current=first,keys=0,access=0;const sent=[],checked=[];
 const client={execute:async c=>{sent.push(c);return result(c)},receipt:async c=>{checked.push(c);return receipt(c)},...overrides};
 const w=new SalesCommandWorkspace({scope,client,reader:{readDetail:async()=>current},newRequestKey:()=>`independent-${++keys}`,onAccessFailure:()=>{access++;assert.equal(w.getSnapshot().editor,null)}});
 return {w,context,scope,sent,checked,setCurrent:d=>{current=d},keys:()=>keys,access:()=>access};
}

test('history provenance cannot be promoted to runtime during refresh/adoption',async()=>{
 const h=setup({...detail(),stockBasis:'CUTOFF_HISTORY'});await h.w.openExisting(uuid(1));h.setCurrent(detail('DRAFT',3));
 assert.equal(await h.w.readCurrent(),false);assert.equal(h.w.adoptCurrent(),false);assert.equal(await h.w.submit('APPROVE'),false);assert.equal(h.sent.length,0);h.w.dispose();
});
test('runtime provenance cannot downgrade to historical during readback',async()=>{
 const h=setup();await h.w.openExisting(uuid(1));h.setCurrent({...detail('DRAFT',3),stockBasis:'CUTOFF_HISTORY'});
 assert.equal(await h.w.readCurrent(),false);assert.equal(h.w.adoptCurrent(),false);h.w.dispose();
});
test('new SAVE pins runtime provenance before its first authorized readback',async()=>{
 const h=setup();h.w.openCreate(draft());await h.w.submit('SAVE');h.setCurrent({...detail('DRAFT',1),stockBasis:'CUTOFF_HISTORY'});
 assert.equal(await h.w.readCurrent(),false);assert.equal(h.w.adoptCurrent(),false);h.w.dispose();
});
test('same-version command status contradictions cannot become editable facts',async()=>{
 for(const action of ['APPROVE','VOID']) {const h=setup();await h.w.openExisting(uuid(1));await h.w.submit(action);h.setCurrent(detail('DRAFT',3));
  assert.equal(await h.w.readCurrent(),false);assert.equal(h.w.adoptCurrent(),false);assert.equal(h.w.replaceDraft(draft()),false);h.w.dispose();}
});
test('known VOID is terminal even when an impossible response increments its version',async()=>{
 const h=setup();await h.w.openExisting(uuid(1));await h.w.submit('VOID');h.setCurrent(detail('DRAFT',4));
 assert.equal(await h.w.readCurrent(),false);assert.equal(h.w.adoptCurrent(),false);h.w.dispose();
});
test('legitimate later unapproval does not get rejected as a same-version contradiction',async()=>{
 const h=setup();await h.w.openExisting(uuid(1));await h.w.submit('APPROVE');h.setCurrent(detail('DRAFT',4));
 assert.equal(await h.w.readCurrent(),true);assert.equal(h.w.getSnapshot().write.result.version,3);assert.equal(h.w.adoptCurrent(),true);h.w.dispose();
});
test('unknown outcome and receipt404 retain one immutable original key/payload/CAS without retry',async()=>{
 const calls=[];const h=setup(detail(),{execute:async c=>{calls.push(c);throw uncertain()},receipt:async()=>{throw new SalesCommandError('not-found','RECEIPT_NOT_FOUND','read',404)}});
 await h.w.openExisting(uuid(1));h.w.replaceDraft({...draft(),header:{...draft().header,note:'original independent draft'}});await h.w.submit('SAVE');const original=h.w.getSnapshot().write.command;
 assert.ok(Object.isFrozen(original.draft.lines[0].snapshot));assert.equal(h.keys(),1);assert.equal(calls.length,1);assert.equal(await h.w.submit('SAVE'),false);
 assert.equal(await h.w.checkReceipt(),false);assert.equal(h.w.getSnapshot().write.phase,'uncertain');assert.equal(h.w.getSnapshot().write.recovery,'absent');assert.strictEqual(h.w.getSnapshot().write.command,original);
 assert.equal(h.w.discardEditor(),false);assert.equal(h.w.canLeave(),false);await h.w.replayOriginal();assert.equal(calls.length,2);assert.strictEqual(calls[0],calls[1]);assert.equal(h.keys(),1);h.w.dispose();
});
test('a reentrant subscription can cancel before dispatch and dispose without revival',async()=>{
 const h=setup();h.w.openCreate(draft());let cancel=false;
 h.w.subscribe(()=>{if(h.w.getSnapshot().write.phase==='submitting'){cancel=h.w.cancelWaiting();}});
 assert.equal(await h.w.submit('SAVE'),false);assert.equal(cancel,true);assert.equal(h.sent.length,0);assert.equal(h.w.getSnapshot().write.error.outcome,'not-sent');
 h.w.subscribe(()=>{h.w.dispose();});h.w.discardEditor();assert.equal(h.w.getSnapshot().disposed,true);assert.equal(h.w.getSnapshot().editor,null);assert.equal(await h.w.submit('SAVE'),false);
});
test('post-dispatch cancel is unknown, and late results cannot override new identity',async()=>{
 const late=deferred();let original;const h=setup(detail(),{execute:async c=>{original=c;return late.promise}});h.w.openCreate(draft());const pending=h.w.submit('SAVE');await flush();
 assert.equal(h.w.cancelWaiting(),true);assert.equal(h.w.getSnapshot().write.phase,'uncertain');h.context.replaceIdentity({accountId:'OTHER',sessionRevision:'2',permissionRevision:'1'});
 late.resolve(result(original));assert.equal(await pending,false);assert.equal(h.w.getSnapshot().disposed,true);assert.equal(h.w.getSnapshot().write.command,null);assert.equal(h.w.getSnapshot().editor,null);
});
test('provider exceptions and native response messages do not retain raw secrets',async()=>{
 const h=setup(detail(),{execute:async()=>{throw new Error('private-token-and-SQL-secret')}});h.w.openCreate(draft());await h.w.submit('SAVE');
 assert.doesNotMatch(JSON.stringify(h.w.getSnapshot()),/private-token|SQL-secret/);h.w.dispose();
 const client=createSalesCommandHttpClient({origin:'https://synthetic.test',basePath:'',fetch:async()=>json({error:{code:'VERSION_CONFLICT',message:'private-token-and-SQL-secret'}},409)});
 await assert.rejects(client.execute(save(),sig()),e=>e.outcome==='rejected'&&!/private-token|SQL-secret/.test(JSON.stringify(e)));
});
test('receipt-only error on POST is not a definitive original-command rejection',async()=>{
 let calls=0;const client=createSalesCommandHttpClient({origin:'https://synthetic.test',basePath:'',fetch:async()=>{calls++;return json({error:{code:'RECEIPT_NOT_FOUND',message:'not applicable to POST'}},404)}});
 await assert.rejects(client.execute(save(),sig()),e=>e.outcome==='uncertain');assert.equal(calls,1);
});
test('unaddressable dot-only operation keys are rejected before a mutating fetch',async()=>{
 for(const key of ['.','..']){let calls=0;const client=createSalesCommandHttpClient({origin:'https://synthetic.test',basePath:'',fetch:async()=>{calls++;return json(result(save()))}});
  await assert.rejects(client.execute({...save(),requestKey:key},sig()),e=>e.outcome==='not-sent');assert.equal(calls,0);}
});
test('safe-integer CAS and complete exact native request shapes agree with existing parser',()=>{
 const actor={accountId:uuid(91),hallId:null};
 for(const command of [save(),save(2),stateCommand('APPROVE'),stateCommand('UNAPPROVE'),stateCommand('VOID'),stateCommand('VOID',Number.MAX_SAFE_INTEGER-1)]){
  const checked=validateSalesCommand(command),parsed=parseSalesCommand(checked,actor);assert.equal(parsed.expectedVersion,command.expectedVersion);assert.equal(parsed.requestKey,command.requestKey);assert.equal(parsed.action,command.action);
 }
 for(const bad of [0,-1,1.5,'2',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>validateSalesCommand({...stateCommand(),expectedVersion:bad}));
});
test('wrong action/key/target/CAS/status/ledger receipts cannot confirm an operation',()=>{
 const command=stateCommand('APPROVE');const good=receipt(command);
 for(const wrong of [{...good,action:'SAVE'},{...good,requestKey:'wrong'},{...good,result:{...good.result,salesId:uuid(99)}},{...good,result:{...good.result,version:99}},{...good,result:{...good.result,status:'DRAFT'}},{...good,result:{...good.result,ledgerEntryIds:[]}}])assert.throws(()=>validateSalesReceipt(wrong,command));
 assert.throws(()=>validateSalesResult({...good.result,version:Number.MAX_SAFE_INTEGER+1},command));
});
test('approval uses exact saved funds and independently signed integer return quantities',async()=>{
 const value=detail();const h=setup({...value,document:{...value.document,settlements:[]},settlementNames:[]});await h.w.openExisting(uuid(1));
 assert.equal(await h.w.submit('APPROVE'),false);assert.equal(h.keys(),0);assert.equal(h.sent.length,0);h.w.dispose();
 const d=draft();assert.doesNotThrow(()=>validateSalesDraft(d));assert.throws(()=>validateSalesDraft({...d,lines:d.lines.map(l=>({...l,quantity:'-0.5'}))}));
 assert.throws(()=>validateSalesDraft({...d,originalSaleId:uuid(99)}));
});
test('observed auth status clears old identity facts even when its JSON body stalls',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const status of [401,403])for(const mode of ['execute','receipt']){
  const ready=deferred();
  const native=createSalesCommandHttpClient({origin:'https://synthetic.test',basePath:'',timeoutMs:10,fetch:async()=>{ready.resolve();return new Response(new ReadableStream({}),{status,headers:{'Content-Type':'application/json'}})}});
  const h=setup(detail(),mode==='execute'?{execute:native.execute}:{execute:async()=>{throw uncertain()},receipt:native.receipt});
  h.w.openCreate(draft());let pending;
  if(mode==='execute')pending=h.w.submit('SAVE');else{await h.w.submit('SAVE');pending=h.w.checkReceipt();}
  await ready.promise;await flush();t.mock.timers.tick(10);assert.equal(await pending,false);
  assert.equal(h.scope.active,false,`${mode} ${status} must invalidate the old scope`);assert.equal(h.w.getSnapshot().editor,null);assert.equal(h.w.getSnapshot().write.command,null);assert.equal(h.access(),1);h.w.dispose();
 }
});
