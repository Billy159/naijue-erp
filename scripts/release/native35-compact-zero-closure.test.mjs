import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {native35Closure,native35SourceProfile,native35DefaultSourceProfile,native35Admin154SourceProfile,native35CompactZeroSourceProfile,native35Contract,allowedMember,runtimeSqlPatches} from './manifest.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),reference=process.env.FRESH35_TEST_REFERENCE_DIRECTORY;
test('the explicit V2 release closure consumes all222 native members with exact SQL36/38 and preserves native packaging boundaries',async()=>{
 const c=await native35Closure(root,reference,native35CompactZeroSourceProfile);assert.equal(c.sourceProfile,native35CompactZeroSourceProfile);assert.equal(c.pins.length,222);const pins=new Map(c.pins.map(p=>[p.path,p.sha256]));
 assert.equal(pins.get('adapters/postgres/patches/0036_admin_provision_only_successor.sql'),'6d051a5f4a8dce3183a8c01074e43dadf73942d60ca8a6c99287950dc9c62c9b');assert.equal(pins.get('adapters/postgres/patches/0038_inventory_baseline_scope_successor.sql'),'4d42ed00553f088854ce75a615786da6c91332fe4d9637d9fb0da0fa9f078f25');assert.ok(pins.has('scripts/release/unified-install/fresh35-baseline-scope-candidate.mjs'));assert.equal(pins.has('adapters/postgres/patches/0037_compact_zero_scope_successor.sql'),false);
 for(const p of c.pins)allowedMember(native35Contract.root+'/'+p.path,'native35');assert.equal(runtimeSqlPatches.has('adapters/postgres/patches/0038_inventory_baseline_scope_successor.sql'),false);
});
test('the two prior profiles retain their original cardinalities and selection; no implicit compact patch or default change',async()=>{
 const a=await native35Closure(root,reference,native35DefaultSourceProfile),b=await native35Closure(root,reference,native35Admin154SourceProfile);assert.equal(a.pins.length,218);assert.equal(b.pins.length,219);assert.equal(Object.hasOwn(a,'sourceProfile'),false);assert.equal(b.sourceProfile,native35Admin154SourceProfile);
 for(const c of [a,b])assert.equal(c.pins.some(p=>p.path==='adapters/postgres/patches/0038_inventory_baseline_scope_successor.sql'),false);
 assert.equal(native35SourceProfile(),native35DefaultSourceProfile);assert.equal(native35SourceProfile(native35CompactZeroSourceProfile),native35CompactZeroSourceProfile);assert.throws(()=>native35SourceProfile('FRESH35_COMPACT_ZERO_SOURCE_V3'),/NATIVE35_UNKNOWN_SOURCE_PROFILE/);
});
