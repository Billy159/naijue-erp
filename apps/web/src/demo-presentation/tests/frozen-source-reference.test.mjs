import assert from 'node:assert/strict';
import test from 'node:test';
import {cp,mkdir,mkdtemp,readFile,rm,symlink,unlink,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveFrozenSourceReference,referenceManifestPath,referenceNames} from './frozen-source-reference.mjs';
const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../..');
const source=path.join(repository,'handoff/local-wip-20261022-082411/reference-demo');
const temporary=await mkdtemp(path.join(os.tmpdir(),'erp-frozen-eight-'));
const absent=path.join(temporary,'missing-default');
try{
  const replica=path.join(temporary,'repo');await mkdir(path.dirname(path.join(replica,referenceManifestPath)),{recursive:true});await cp(path.join(repository,referenceManifestPath),path.join(replica,referenceManifestPath));
  const fixture=path.join(replica,'handoff/local-wip-20261022-082411/reference-demo');await mkdir(path.join(fixture,'frontend'),{recursive:true});
  for(const name of referenceNames)await cp(path.join(source,'frontend',name),path.join(fixture,'frontend',name));
  await test('missing default uses exactly eight pinned source leaves without a Demo/Git claim',async()=>{const evidence=await resolveFrozenSourceReference({repository:replica,defaultRepository:absent});assert.equal(evidence.kind,'committed-verified-eight-source-fallback');assert.equal(await evidence.order(),await readFile(path.join(fixture,'frontend/index.html'),'utf8'));await assert.rejects(()=>evidence.original('../app.js'));});
  await test('an existing default with unavailable Git evidence is not silently replaced',async()=>{const existing=path.join(temporary,'existing-default');await mkdir(existing);const evidence=await resolveFrozenSourceReference({repository:replica,defaultRepository:existing});assert.equal(evidence.kind,'exact-git-commit');await assert.rejects(()=>evidence.original('styles.css'));});
  const leaf=path.join(fixture,'frontend/styles.css'),original=await readFile(leaf);
  await test('changed bytes fail closed even at unchanged byte length',async()=>{const changed=Buffer.from(original);changed[0]^=1;await writeFile(leaf,changed);await assert.rejects(()=>resolveFrozenSourceReference({repository:replica,defaultRepository:absent}),/SHA256/);await writeFile(leaf,original);});
  await test('missing source does not fall back or fabricate',async()=>{await unlink(leaf);await assert.rejects(()=>resolveFrozenSourceReference({repository:replica,defaultRepository:absent}),{code:'ENOENT'});await writeFile(leaf,original);});
  await test('symlink source and changed pinned manifest are rejected',async()=>{await unlink(leaf);await symlink(path.join(source,'frontend/styles.css'),leaf);await assert.rejects(()=>resolveFrozenSourceReference({repository:replica,defaultRepository:absent}),/symlinks/);await unlink(leaf);await writeFile(leaf,original);const manifest=path.join(replica,referenceManifestPath),bytes=await readFile(manifest);await writeFile(manifest,Buffer.concat([bytes,Buffer.from('\n')]));await assert.rejects(()=>resolveFrozenSourceReference({repository:replica,defaultRepository:absent}),/manifest bytes changed/);await writeFile(manifest,bytes);});
  await test('explicit invalid fixture is never silently replaced by valid committed fallback',async()=>{await assert.rejects(()=>resolveFrozenSourceReference({repository:replica,defaultRepository:absent,explicitDirectory:path.join(temporary,'bad-explicit')}),{code:'ENOENT'});});
  await test('explicit load-order alias is exact original index bytes, never reconstructed',async()=>{await writeFile(path.join(fixture,'LOAD_ORDER.md'),await readFile(path.join(fixture,'frontend/index.html')));assert.equal((await resolveFrozenSourceReference({repository:replica,defaultRepository:absent,explicitDirectory:fixture})).kind,'explicit-verified-eight-source-fixture');await writeFile(path.join(fixture,'LOAD_ORDER.md'),'styles.css\nfinal-ui.css');await assert.rejects(()=>resolveFrozenSourceReference({repository:replica,defaultRepository:absent,explicitDirectory:fixture}),/exact original index bytes/);});
}finally{await rm(temporary,{recursive:true,force:true});}
