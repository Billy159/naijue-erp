import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {native35Closure,native35DefaultSourceProfile,native35Admin154SourceProfile,runtimeSqlPatches,allowedMember,native35Contract} from './manifest.mjs';
import {buildProduction,main} from './build-production.mjs';
import {loadFresh35Admin154Source,describeFresh35CombinedSource,resolveFresh35ReferenceInputPaths} from './unified-install/fresh35-combined-source-v1.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
const reference=process.env.FRESH35_TEST_REFERENCE_DIRECTORY;
const patch='adapters/postgres/patches/0036_admin_provision_only_successor.sql';

test('native35 default closure preserves the exact 152 selection and original runtime migration set',async()=>{
 const original=await native35Closure(root,reference),explicit=await native35Closure(root,reference,native35DefaultSourceProfile);
 assert.deepEqual(explicit,original);assert.equal(original.pins.length,219);
 assert.equal(original.sourceSetSha256,'35d6ffc35ea9171a8c13a81539ecf7fbec40f441322d4dfdee612b6486b82471');
 assert.deepEqual(Object.keys(original),['sourceSetSha256','pins','referenceIndexSha256']);
 assert.equal(original.pins.some(p=>p.path===patch),false);assert.equal(runtimeSqlPatches.has(patch),false);assert.equal(runtimeSqlPatches.size,13);
});
test('native35 explicit154 copies all 220 same-source members and the relocated native loader can read SQL36',async()=>{
 const closure=await native35Closure(root,reference,native35Admin154SourceProfile);
 const paths=await resolveFresh35ReferenceInputPaths(reference),descriptor=describeFresh35CombinedSource(await loadFresh35Admin154Source(root,paths));
 assert.equal(closure.sourceProfile,native35Admin154SourceProfile);assert.equal(closure.pins.length,220);assert.deepEqual(closure.pins,descriptor.currentSourcePins);
 assert.equal(closure.sourceSetSha256,descriptor.sourceSetSha256);assert.equal(closure.sourceSetSha256,'0ba2beef0446879f02dc8a75678a9a2bbb241d6be5bc501fc25057443c1d8c32');
 assert.equal(closure.pins.find(p=>p.path===patch)?.sha256,'6d051a5f4a8dce3183a8c01074e43dadf73942d60ca8a6c99287950dc9c62c9b');
 const stage=await realpath(await mkdtemp(path.join(tmpdir(),'native154-members-')));
 try{
  for(const pin of closure.pins){allowedMember(native35Contract.root+'/'+pin.path,'native35');const member=path.join(stage,pin.path);await mkdir(path.dirname(member),{recursive:true});await copyFile(path.join(root,pin.path),member);}
  const producer=await import(pathToFileURL(path.join(stage,'scripts/release/unified-install/fresh35-combined-source-v1.mjs')).href);
  const copied=producer.describeFresh35CombinedSource(await producer.loadFresh35Admin154Source(stage,paths));
  assert.equal(copied.sourceSetSha256,closure.sourceSetSha256);assert.deepEqual(copied.currentSourcePins,closure.pins);
 }finally{await rm(stage,{recursive:true,force:true});}
});
test('native35 unknown source selections are refused by closure and actual build/CLI entry before file or build operations',async()=>{
 await assert.rejects(native35Closure('/NONEXISTENT','/NONEXISTENT','FRESH35_UNKNOWN'),/NATIVE35_UNKNOWN_SOURCE_PROFILE/);
 await assert.rejects(buildProduction({native35SourceProfile:'FRESH35_UNKNOWN'}),/NATIVE35_UNKNOWN_SOURCE_PROFILE/);
 await assert.rejects(main(['--source-root','/NONEXISTENT','--source-commit','a'.repeat(40),'--build-id','TEST_ONLY','--public-config','/NONEXISTENT','--build-root','/NONEXISTENT','--manifest-dir','/NONEXISTENT','--native35-reference-inputs','/NONEXISTENT','--native35-source-profile','FRESH35_UNKNOWN']),/NATIVE35_UNKNOWN_SOURCE_PROFILE/);
});
