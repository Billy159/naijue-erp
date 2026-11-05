/** Pure/adversarial clock + original SDK/auth callback. No new framed decoder, endpoint, network, PG or browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCurrentFormHttpReader} from '../../../../apps/web/src/current-form/http-reader.ts';
import {createHttpJsonQuery} from '../../../../apps/web/src/transport/http-query.ts';
import {validateDictionaryPage,validateDictionarySizeGroup} from '../../../../packages/application/src/dictionary-read-validation.ts';
import {createSalesSessionAuthenticator} from '../../../../apps/api/src/authentication.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const groups=Array.from({length:101},(_,i)=>({id:id(1000+i),name:'G'+i,sizes:[{id:id(2000+i),name:'S'+i,displayOrder:0}]}));
const page=n=>({page:n,pageSize:100,total:101,items:groups.slice((n-1)*100,n*100)});
const query=n=>({search:'',page:n,pageSize:100});
const signal=()=>new AbortController().signal;
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const options=fetch=>({origin:'https://framed-research.invalid',basePath:'',fetch});
function withClock(run){
 const prior=Object.getOwnPropertyDescriptor(performance,'now');let value=0;
 Object.defineProperty(performance,'now',{configurable:true,value:()=>value});
 const clock={get now(){return value;},advance(ms){value+=ms;},reset(){value=0;}};
 return Promise.resolve().then(()=>run(clock)).finally(()=>{if(prior)Object.defineProperty(performance,'now',prior);else delete performance.now;});
}
function wholeResponse(clock,milestones){
 const encoded=[new TextEncoder().encode('['+JSON.stringify(page(1))+','),new TextEncoder().encode(JSON.stringify(page(2))+']')];let index=0;
 // Zero queue: do not pre-pull the next chunk before the SDK asks for it.
 return new Response(new ReadableStream({pull(controller){clock.advance(milestones[index]);controller.enqueue(encoded[index]);index++;if(index===encoded.length)controller.close();}},{highWaterMark:0}),{headers:{'content-type':'application/json'}});
}
const decodePages=value=>{assert.ok(Array.isArray(value));assert.equal(value.length,2);return value.map((p,i)=>validateDictionaryPage(p,query(i+1),validateDictionarySizeGroup));};
test('actual original SDK accepts two16s page calls; the same complete values in one32s response fail unchanged30s request deadline',{concurrency:false,timeout:5000},()=>withClock(async clock=>{
 let oldCalls=0;const legacy=createCurrentFormHttpReader(options(async(_url,init)=>{oldCalls++;clock.advance(16000);return json(page(JSON.parse(String(init.body)).page));}));
 const oldAccepted=[];for(const n of [1,2])oldAccepted.push(await legacy.readSizeGroups(query(n),signal()));
 assert.equal(oldCalls,2);assert.equal(clock.now,32000);assert.deepEqual(oldAccepted.map(p=>p.page),[1,2]);
 clock.reset();let aggregateCalls=0,decoderCalls=0;
 const aggregate=createHttpJsonQuery(options(async()=>{aggregateCalls++;return wholeResponse(clock,[16000,16000]);}));
 await assert.rejects(aggregate.post('/dictionary-read/proposed-framed-only/query',{sizeGroupIds:[groups[0].id,groups[100].id]},signal(),v=>{decoderCalls++;return decodePages(v);}),{kind:'timeout',code:'QUERY_TIMEOUT',status:null});
 assert.equal(aggregateCalls,1);assert.equal(clock.now,32000);assert.equal(decoderCalls,0);
 assert.ok(Buffer.byteLength(JSON.stringify([page(1),page(2)]))<8*1024*1024);
 // An incremental parser could accept page1 at16s, but cannot publish page2 at32s
 // under this same per-HTTP30s deadline. Encoding/dedup cannot change that budget fact.
 const permittedFrameTimes=[16000,32000].filter(t=>t<30000);assert.deepEqual(permittedFrameTimes,[16000]);
 console.log('FIXED_DEADLINE_COUNTEREXAMPLE',JSON.stringify({defaultRequestBudgetMs:30000,oldEachPageMs:16000,oldCalls,oldPagesAccepted:2,oldTotalMs:32000,newCalls:aggregateCalls,newError:'QUERY_TIMEOUT',newDecoderCalls:decoderCalls,maximumIncrementallyAcceptedPagesAtGivenTimes:1,realElapsedWait:false,bodyBytes:Buffer.byteLength(JSON.stringify([page(1),page(2)])),newFramedImplementation:false}));
}));
test('bounded fast subdomain can transport two full pages in one original guarded call; not a new route or semantic-equivalence proof',{concurrency:false,timeout:5000},()=>withClock(async clock=>{
 let calls=0;const aggregate=createHttpJsonQuery(options(async()=>{calls++;return wholeResponse(clock,[5000,5000]);}));
 const result=await aggregate.post('/dictionary-read/proposed-framed-only/query',{sizeGroupIds:[groups[0].id,groups[100].id]},signal(),decodePages);
 assert.equal(calls,1);assert.equal(clock.now,10000);assert.deepEqual(result.map(p=>p.page),[1,2]);assert.equal(result[0].items.length,100);assert.equal(result[1].items.length,1);
 console.log('FAST_SUBDOMAIN_ONLY',JSON.stringify({calls,pages:result.length,totalMs:clock.now,guardsUnchanged:true,newEndpoint:false,perPageAuthorityNotProven:true,universalTwoRequestClaim:false}));
}));
test('actual cookie authenticator cannot treat captured request cookie as every subsequent legacy request credential',{timeout:5000},async()=>{
 const tokenA='A'.repeat(43),tokenB='B'.repeat(43),principal={accountId:id(1),hallId:null};let revokedA=false;const resolved=[];
 // Explicit credential-resolution stub: only the cookie/origin callback itself is original.
 const service={async resolve(token){resolved.push(token===tokenA?'A':'B');return token===tokenB||token===tokenA&&!revokedA?principal:null;},async login(){throw Error('No login executed');},async logout(){throw Error('No logout executed');},async changeOwnPassword(){throw Error('No password work');}};
 const authenticate=createSalesSessionAuthenticator({service,trustedOrigin:'https://framed-research.invalid'});
 const request=token=>({headers:Object.freeze({origin:'https://framed-research.invalid',cookie:'__Host-naijue_session='+token,'sec-fetch-site':'same-origin'}),ip:'127.0.0.1',method:'POST',url:'/dictionary-read/size-groups/query'});
 const captured=request(tokenA),first=await authenticate(captured);assert.deepEqual(first,principal);
 revokedA=true;
 assert.equal(await authenticate(captured),null,'Rechecking captured cookie correctly sees its revocation');
 assert.deepEqual(await authenticate(request(tokenB)),principal,'A separate original request can carry a different valid same-account cookie');
 assert.deepEqual(first,principal,'Reusing only the first actor would miss session revocation');
 assert.deepEqual(resolved,['A','A','B']);
 console.log('CREDENTIAL_INPUT_COUNTEREXAMPLE',JSON.stringify({firstActorValid:true,capturedCredentialAfterRevocation:null,newOriginalRequestCredentialValid:true,resolverStub:true,realLoginOrBrowserRotation:false,currentActorAuthorizationIsNotSessionAuthentication:true,newFramedImplementation:false}));
});
