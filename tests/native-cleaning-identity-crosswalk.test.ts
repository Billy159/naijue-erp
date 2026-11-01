import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIdentityCrosswalk } from '../scripts/import-v3/native-cleaning/identity-crosswalk.mjs';
const A='20000000-0000-0000-0000-000000000001', B='20000000-0000-0000-0000-000000000002';
const demand=(sourceKind='FIT',sourceId='A',targetKind='FIT')=>({sourceKind,sourceId,targetKind});
const mapping=(sourceKind='FIT',sourceId='A',targetKind='FIT',targetId=A)=>({...demand(sourceKind,sourceId,targetKind),targetId});
const ref=(referenceId='sku-1.fit',sourceKind='FIT',sourceId='A',targetKind='FIT')=>({referenceId,...demand(sourceKind,sourceId,targetKind)});
const input=(changes:Record<string,unknown>={})=>({sourceNamespace:'old-rdb-exact-cohort',targetNamespace:'new-native-candidate',demands:[demand()],mappings:[mapping()],references:[ref()],...changes});
const reject=(f:()=>unknown,code:string)=>assert.throws(f,{code});
test('explicit crosswalk resolves only exact supplied mapping and reference, no ID allocation',()=>{
 const r=validateIdentityCrosswalk(input());
 assert.equal(r.status,'CONSISTENT_GIVEN_COHORT_NOT_AUTHORIZED');
 assert.deepEqual(r.identities,[{demandIndex:0,mappingIndex:0,...mapping()}]);
 assert.deepEqual(r.references,[{referenceIndex:0,demandIndex:0,mappingIndex:0,...ref(),targetId:A}]);
 assert.deepEqual(r.counts,{demands:1,mappings:1,references:1});
 assert.equal(r.sourceNamespace,'old-rdb-exact-cohort');assert.equal(r.targetNamespace,'new-native-candidate');
});
test('opaque text preserves original fit/size identities, whitespace, case and unicode without normalization',()=>{
 for(const id of ['A','900','legacy910',' original\nID ','É','E\u0301','__proto__','a|b']){
  const r=validateIdentityCrosswalk(input({demands:[demand('SIZE',id,'SIZE')],mappings:[mapping('SIZE',id,'SIZE')],references:[ref('line.size','SIZE',id,'SIZE')]}));
  assert.equal(r.identities[0]!.sourceId,id);
 }
});
test('same source text in different entity domains does not collide; tuple separator collisions do not alias',()=>{
 const ds=[demand('FIT','a|b','FIT'),demand('FIT|a','b','SIZE'),demand('SIZE','a|b','SIZE')];
 const ms=ds.map((d,i)=>({...d,targetId:`20000000-0000-0000-0000-00000000000${i+1}`}));
 const r=validateIdentityCrosswalk(input({demands:ds,mappings:ms,references:[]}));assert.equal(r.identities.length,3);
});
test('explicit party split into separate target kinds is preserved, not inferred or merged by name',()=>{
 const ds=[demand('PARTY','source-party','CUSTOMER'),demand('PARTY','source-party','SUPPLIER')];
 const r=validateIdentityCrosswalk(input({demands:ds,mappings:ds.map(d=>({...d,targetId:A})),references:[]}));
 assert.deepEqual(r.identities.map(x=>x.targetKind),['CUSTOMER','SUPPLIER']);
});
test('target-kind-local many-to-one is refused; reviewed SKU aliases need their dedicated contract',()=>{
 reject(()=>validateIdentityCrosswalk(input({demands:[demand(),demand('FIT','B')],mappings:[mapping(),mapping('FIT','B')]})),'UNREVIEWED_MANY_TO_ONE_MAPPING');
});
test('missing, extra and duplicate mapping slots refuse rather than generate/drop/overwrite',()=>{
 reject(()=>validateIdentityCrosswalk(input({mappings:[]})),'MISSING_EXPLICIT_IDENTITY_MAPPING');
 reject(()=>validateIdentityCrosswalk(input({mappings:[mapping(),mapping('FIT','B','FIT',B)]})),'MAPPING_OUTSIDE_GIVEN_COHORT');
 reject(()=>validateIdentityCrosswalk(input({mappings:[mapping(),mapping()]})),'DUPLICATE_IDENTITY_MAPPING');
 reject(()=>validateIdentityCrosswalk(input({demands:[demand(),demand()]})),'DUPLICATE_IDENTITY_DEMAND');
});
test('dangling references, wrong source kind and wrong target kind are not repaired by same ID/name',()=>{
 for(const r of [ref('line.fit','FIT','B'),ref('line.fit','SIZE','A'),ref('line.fit','FIT','A','SIZE')])
  reject(()=>validateIdentityCrosswalk(input({references:[r]})),'REFERENCE_OUTSIDE_GIVEN_COHORT');
});
test('multiple independent references may resolve one mapping; duplicate reference slots refuse',()=>{
 const r=validateIdentityCrosswalk(input({references:[ref('line1.fit'),ref('line2.fit')]}));assert.equal(r.references.length,2);
 reject(()=>validateIdentityCrosswalk(input({references:[ref(),ref()]})),'DUPLICATE_REFERENCE_ID');
});
test('case/whitespace variants do not match implicitly, and target UUID must already be canonical',()=>{
 for(const id of ['a',' A','A '])reject(()=>validateIdentityCrosswalk(input({references:[ref('line.fit','FIT',id)]})),'REFERENCE_OUTSIDE_GIVEN_COHORT');
 for(const id of ['A','20000000-0000-0000-0000-00000000000A',A+' ',A+'\n',null,42])
  reject(()=>validateIdentityCrosswalk(input({mappings:[{...mapping(),targetId:id}]})),'CANONICAL_TARGET_UUID_REQUIRED');
});
test('explicit same old/new UUID is a consistency fact only, never bypasses writer-specific independent allocation',()=>{
 const r=validateIdentityCrosswalk(input({demands:[demand('PRODUCT',A,'PRODUCT')],mappings:[mapping('PRODUCT',A,'PRODUCT',A)],references:[]}));
 assert.equal(r.identities[0]!.targetId,A);assert.equal(r.status,'CONSISTENT_GIVEN_COHORT_NOT_AUTHORIZED');
});
test('complete empty declared cohort is not proof of empty database or target existence',()=>{
 const r=validateIdentityCrosswalk(input({demands:[],mappings:[],references:[]}));assert.deepEqual(r.counts,{demands:0,mappings:0,references:0});assert.equal(r.status,'CONSISTENT_GIVEN_COHORT_NOT_AUTHORIZED');
});
test('input exact fields reject unknown flags, missing scopes and cross-scope row injections',()=>{
 const missing:Record<string,unknown>=input();delete missing.sourceNamespace;
 for(const v of [input({authorized:true}),missing,input({demands:[{...demand(),sourceNamespace:'different'}]})])reject(()=>validateIdentityCrosswalk(v),'INVALID_CROSSWALK_RECORD');
});
test('accessors and proxies are rejected without invoking them, sparse arrays and primitive rows refuse',()=>{
 let calls=0;const d=Object.defineProperty({sourceKind:'FIT',targetKind:'FIT'},'sourceId',{enumerable:true,get(){calls++;return 'A';}});
 reject(()=>validateIdentityCrosswalk(input({demands:[d]})),'INVALID_CROSSWALK_RECORD');assert.equal(calls,0);
 reject(()=>validateIdentityCrosswalk(new Proxy(input(),{get(){throw Error('must not touch');}})),'INVALID_CROSSWALK_RECORD');
 for(const rows of [new Array(1),[null],[42],Object.assign([],{extra:true})])assert.throws(()=>validateIdentityCrosswalk(input({demands:rows})));
});
test('bounded labels and rows refuse NUL/empty/oversized metadata, no business values in error text',()=>{
 for(const id of ['', 'secret\0id','x'.repeat(4097)])reject(()=>validateIdentityCrosswalk(input({demands:[demand('FIT',id)]})),'INVALID_CROSSWALK_TEXT');
 reject(()=>validateIdentityCrosswalk(input({demands:new Array(100001)})),'BOUNDED_DENSE_CROSSWALK_ARRAY_REQUIRED');
 try{validateIdentityCrosswalk(input({references:[ref('private-reference','FIT','private-source')]}));assert.fail();}catch(e){assert.equal(String(e).includes('private-'),false);}
});
test('immutable inputs remain unchanged; frozen output cannot mutate original mapping or reference',()=>{
 const i=input();Object.freeze((i.demands as object[])[0]);Object.freeze((i.mappings as object[])[0]);Object.freeze((i.references as object[])[0]);Object.freeze(i.demands);Object.freeze(i.mappings);Object.freeze(i.references);Object.freeze(i);
 const before=JSON.stringify(i);const r=validateIdentityCrosswalk(i);assert.equal(JSON.stringify(i),before);assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.identities)&&Object.isFrozen(r.identities[0])&&Object.isFrozen(r.references[0])&&Object.isFrozen(r.counts));
});
test('output order follows declared demand/reference order, not mapping array or hidden sorting',()=>{
 const r=validateIdentityCrosswalk(input({demands:[demand('FIT','B'),demand()],mappings:[mapping(),mapping('FIT','B','FIT',B)],references:[ref('second','FIT','B'),ref('first')]}));
 assert.deepEqual(r.identities.map(x=>x.mappingIndex),[1,0]);assert.deepEqual(r.references.map(x=>x.referenceId),['second','first']);
});

test('composite-key and unknown target kinds cannot be laundered into invented UUID rows',()=>{
 for(const kind of ['SIZE_GROUP_MEMBER','PAYMENT_ACCOUNT_HALL','INVENTORY_BALANCE','UNKNOWN','fit'])reject(()=>validateIdentityCrosswalk(input({demands:[demand('source','id',kind)]})),'UNSUPPORTED_UUID_TARGET_KIND');
});
test('aggregate metadata byte budget refuses large admitted rows before building an unbounded identity plan',()=>{
 const prefix='x'.repeat(4080);
 const demands=Array.from({length:8300},(_,i)=>demand('FIT',prefix+i,'FIT'));
 reject(()=>validateIdentityCrosswalk(input({demands,mappings:[],references:[]})),'CROSSWALK_METADATA_BUDGET_EXCEEDED');
});
