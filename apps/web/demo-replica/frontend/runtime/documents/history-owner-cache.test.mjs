/** ACTUAL session factories + owner, synthetic identity/transport only. No network/browser/PG. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createReplicaSalesSession} from './sales-session.ts';
import {createReplicaTransferSession} from './transfers-session.ts';
import {ReadContext} from '../../../../src/loading/read-scope.ts';
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const identity={accountId:id(90),sessionRevision:'1',permissionRevision:'1'};
function setup(kind){
 const reads=new ReadContext(identity),created=[],create=reads.createScope.bind(reads),calls=[];
 reads.createScope=(...args)=>{const scope=create(...args);created.push(scope);return scope;};
 const runtime={auth:{getSnapshot:()=>({phase:'authenticated',principal:{accountId:id(90),staffId:id(91),staffName:null,role:'WAREHOUSE',hallId:null}})},reads,http:{origin:'https://history-owner.synthetic.test',basePath:'/api',fetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return Response.json({error:{code:'SERVICE_UNAVAILABLE',message:'Synthetic unknown write outcome'}},{status:503});}},onAccessFailure:()=>{throw Error('Unexpected access failure');}};
 const session=(kind==='sales'?createReplicaSalesSession:createReplicaTransferSession)(runtime,{instanceId:'owner-cache-'+kind,newRequestKey:()=>{throw Error('History lookup must not allocate a native request key');}}),target={kind,batchId:id(2),documentId:id(1),effectiveVersion:1};
 return {reads,created,calls,session,target,children:()=>created.filter(scope=>scope.routeInstanceId.startsWith('replica-history:')),cleanup(){session.dispose();reads.clear();}};
}
for(const kind of ['sales','transfers']){
 test(`owner cache existing seam ${kind}: concurrent same-target imports return the SAME owner and create exactly one retained child scope`,async()=>{
  const f=setup(kind);
  try{const [first,second]=await Promise.all([f.session.historyOwner(f.target),f.session.historyOwner(f.target)]);assert.equal(first,second);assert.equal(f.session.historyOwners.size,1);assert.equal(f.children().length,1);assert.equal(f.children()[0].active,true);assert.equal([...f.session.historyOwners.values()][0].owner,first);assert.equal(f.calls.length,0);}
  finally{f.cleanup();}
 });
 test(`owner cache existing seam ${kind}: cancelled route plus new edit lookup shares one inert owner without disposing the session or cached owner`,async()=>{
  const f=setup(kind),page=f.reads.createScope('cancelled-history-page',id(1));
  try{const first=f.session.historyOwner(f.target);page.dispose();const second=f.session.historyOwner(f.target),[a,b]=await Promise.all([first,second]);assert.equal(a,b);assert.equal(page.active,false);assert.equal(f.session.scope.active,true);assert.equal(f.children().length,1);assert.equal(f.children()[0].active,true);assert.equal(a.getSnapshot().phase,'idle');assert.equal(f.calls.length,0);}
  finally{f.cleanup();}
 });
 test(`owner cache existing seam ${kind}: identity retirement while imports are pending publishes no active owner or child scope`,async()=>{
  const f=setup(kind);
  try{const first=f.session.historyOwner(f.target),second=f.session.historyOwner(f.target);f.reads.replaceIdentity({...identity,sessionRevision:'2'});const results=await Promise.allSettled([first,second]);assert.ok(results.every(result=>result.status==='rejected'&&result.reason instanceof Error&&result.reason.message==='登录身份已改变。'));assert.equal(f.session.scope.active,false);assert.equal(f.session.historyOwners.size,0);assert.equal(f.children().length,0);assert.equal(f.calls.length,0);}
  finally{f.cleanup();}
 });
 test(`owner cache existing seam ${kind}: an existing uncertain owner and original key are reused without disposal, new scope or second write`,async()=>{
  const f=setup(kind);
  try{const owner=await f.session.historyOwner(f.target),command={kind,documentId:id(1),expectedVersion:1,requestKey:'SYNTHETIC-ORIGINAL-HISTORY-KEY',reason:'Synthetic source correction',lines:[{lineId:id(1001),quantity:'2'}],totals:null,settlements:[]};assert.equal(await owner.submit(command),false);assert.equal(owner.getSnapshot().phase,'uncertain');const original=owner.getSnapshot().command;const [first,second]=await Promise.all([f.session.historyOwner(f.target),f.session.historyOwner(f.target)]);assert.equal(first,owner);assert.equal(second,owner);assert.equal(owner.unresolved,true);assert.equal(owner.getSnapshot().command,original);assert.equal(original.requestKey,command.requestKey);assert.equal(f.children().length,1);assert.equal(f.children()[0].active,true);assert.equal(f.calls.length,1);assert.ok(f.calls[0].url.endsWith('/imported-history/'+kind+'/revise'));}
  finally{f.cleanup();}
 });
}
