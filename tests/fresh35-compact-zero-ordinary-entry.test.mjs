import '../tools/unified-import/stream-plan.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {stripTypeScriptTypes} from 'node:module';
import {admitFresh35CompactZeroOrdinaryPoolV2} from '../tools/unified-import/fresh35-host-session.mjs';
const source=await readFile(new URL('../apps/api/src/postgres-read-api.ts',import.meta.url),'utf8'),start=source.indexOf('    if(productionV2){'),end=source.indexOf('      const actual=describeFresh35OrdinaryAdmissionV2',start),proof=source.indexOf('/** Proof-derived CORE directory policy.'),catchStart=source.lastIndexOf('  } catch (error) {',proof),ownStart=source.indexOf('function ownData('),helperEnd=source.indexOf('function method<',ownStart);
assert.ok(start>0&&end>start&&catchStart>end&&ownStart>0);
const prefix=source.slice(ownStart,helperEnd);
const selection=source.slice(start,end);
const cleanup=source.slice(catchStart,proof);
const model=stripTypeScriptTypes(prefix+"\nexport async function select(args,ports){const {productionV2,synthetic35,ordinaryMaintenance,host,options,ownedPool}=args;let admission35,app;const revoke35=()=>{if(admission35)ports.revoke(admission35,ownedPool)};const {admitFresh35SyntheticOrdinaryPoolV1,admitFresh35OrdinaryPoolV2,admitFresh35CompactZeroOrdinaryPoolV2}=ports;try{"+selection+"}return admission35;"+cleanup,{mode:'strip'});
const api=await import('data:text/javascript;base64,'+Buffer.from(model).toString('base64'));
const sha=c=>c.repeat(64),base={sha256:sha('a'),capacityExpiresAt:Date.now()+60000},parent={sha256:sha('b'),sourceSetSha256:sha('c'),catalogSpecSha256:sha('d')},compact={...base,compactZero:{profile:'FRESH35_COMPACT_ZERO_ORDINARY_V2',parentPins:parent,successorSha256:sha('e')}};
function fixture(currentService,synthetic35=false,fail=false){const calls=[],events=[],pool={async dispose(){events.push('dispose')}},cap={};const f=route=>async(...args)=>{calls.push({route,args});if(fail)throw Error('MODEL_VERIFY_FAILED');return cap};return {calls,events,pool,cap,args:{productionV2:{currentService,capacityTarget:{}},synthetic35,ordinaryMaintenance:true,host:{capacityRuntimePoolBinder(){},capacityAdmission:{close(){events.push('capacity-close')}}},options:{postgres:{target:{host:'synthetic.invalid',port:5432,database:'SYNTHETIC',user:'MODEL'}}},ownedPool:pool},ports:{admitFresh35SyntheticOrdinaryPoolV1:f('synthetic'),admitFresh35OrdinaryPoolV2:f('old'),admitFresh35CompactZeroOrdinaryPoolV2:f('compact'),revoke(){events.push('revoke')}}};}
test('actual production API selection uses the one owned pool and exact compact pins, with prior routes retained',async()=>{
 for(const [current,synthetic,route]of [[compact,false,'compact'],[{...base,admin154SuccessorSha256:sha('b')},false,'old'],[base,false,'old'],[undefined,true,'synthetic']]){const f=fixture(current,synthetic);assert.equal(await api.select(f.args,f.ports),f.cap);assert.equal(f.calls.length,1);assert.equal(f.calls[0].route,route);assert.equal(f.calls[0].args[0],f.pool);assert.deepEqual(f.events,[]);if(route==='compact'){assert.deepEqual(f.calls[0].args.slice(2),[base,parent,sha('e')]);}}
});
test('actual API rejects mixed/unknown/synthetic compact selection, and its original catch disposes the pool and capacity once on verification failure',async()=>{
 for(const value of [{...compact,admin154SuccessorSha256:sha('f')},{...base,compactZero:{...compact.compactZero,profile:'UNKNOWN'}}]){const f=fixture(value);await assert.rejects(api.select(f.args,f.ports));assert.equal(f.calls.length,0);assert.deepEqual(f.events,['capacity-close','dispose']);}
 const synthetic=fixture(compact,true);await assert.rejects(api.select(synthetic.args,synthetic.ports));assert.equal(synthetic.calls.length,0);assert.deepEqual(synthetic.events,['capacity-close','dispose']);
 const failed=fixture(compact,false,true);await assert.rejects(api.select(failed.args,failed.ports),/MODEL_VERIFY_FAILED/);assert.deepEqual(failed.calls.map(c=>c.route),['compact']);assert.deepEqual(failed.events,['capacity-close','dispose']);
});
test('real compact admission rejects missing, malformed or extra parent pins before any pool acquisition',async()=>{
 let connects=0;const pool={async connect(){connects++;throw Error('MUST_NOT_CONNECT')}};for(const pins of [{},{...parent,extra:sha('f')},{...parent,sha256:'bad'}])await assert.rejects(admitFresh35CompactZeroOrdinaryPoolV2(pool,{},base,pins,sha('e')),/COMPACT_ZERO_PARENT_AND_SUCCESSOR_PINS_REQUIRED/);assert.equal(connects,0);
});
