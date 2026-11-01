import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

export const frozenCommit='b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3';
export const referenceManifestPath='handoff/local-wip-20261022-082411/SOURCE-MANIFEST.json';
export const referenceManifestSha256='042d30e104bc530b72104d56fcd4869d2d337dae7104904fa05975c910975189';
export const referenceNames=Object.freeze(['styles.css','sales-detail-alignment.css','golden-consistency.css','transfer-current.css','final-ui.css','final-ui.js','interaction-common.js','index.html']);
const digest=(algorithm,bytes)=>createHash(algorithm).update(bytes).digest('hex');
async function plainFile(root,relative){
  assert.ok(relative && !path.isAbsolute(relative) && !relative.split(/[\\/]/).some(part=>part==='..'||part==='.'||!part),'Unexpected frozen reference path');
  let current=path.resolve(root);
  const rootStat=await lstat(current);assert.ok(rootStat.isDirectory()&&!rootStat.isSymbolicLink(),'Frozen reference root must be a plain directory');
  const pieces=relative.split('/');
  for(let i=0;i<pieces.length;i++){current=path.join(current,pieces[i]);const info=await lstat(current);assert.ok(!info.isSymbolicLink()&&(i===pieces.length-1?info.isFile():info.isDirectory()),'Frozen reference components must not be symlinks or special files');}
  return readFile(current);
}
export async function resolveFrozenSourceReference({repository,defaultRepository,explicitDirectory}){
  let fallback=false;
  if(explicitDirectory===undefined){try{const info=await lstat(defaultRepository);assert.ok(info.isDirectory()&&!info.isSymbolicLink(),'Default frozen repository must be a plain directory');}catch(error){if(error.code!=='ENOENT')throw error;fallback=true;}}
  // An explicit FROZEN_DEMO_UI is never ignored, including empty/invalid paths.
  if(explicitDirectory===undefined&&!fallback)return Object.freeze({kind:'exact-git-commit',original:async name=>{assert.ok(referenceNames.includes(name),'Unexpected frozen reference name');return execFileSync('git',['-C',defaultRepository,'show',frozenCommit+':frontend/'+name],{encoding:'utf8',maxBuffer:2*1024*1024});},order:async()=>execFileSync('git',['-C',defaultRepository,'show',frozenCommit+':frontend/index.html'],{encoding:'utf8',maxBuffer:2*1024*1024})});
  const manifestBytes=await plainFile(repository,referenceManifestPath);
  assert.equal(digest('sha256',manifestBytes),referenceManifestSha256,'Pinned59 source manifest bytes changed');
  const manifest=JSON.parse(manifestBytes);assert.equal(manifest.frozenDemoCommit,frozenCommit);
  const fixtureRoot=explicitDirectory!==undefined?explicitDirectory:path.join(repository,'handoff/local-wip-20261022-082411/reference-demo');
  const checked=new Map();
  for(const name of referenceNames){
    const relative='frontend/'+name,entries=manifest.frozenDemoReferenceFiles.filter(item=>item.path===relative);assert.equal(entries.length,1,'Expected one pinned frozen source entry');
    const entry=entries[0],bytes=await plainFile(fixtureRoot,relative);
    assert.equal(entry.mode,'100644');assert.equal(bytes.length,entry.bytes,'Frozen source byte length changed: '+name);assert.equal(digest('sha256',bytes),entry.sha256,'Frozen source SHA256 changed: '+name);
    assert.equal(digest('sha1',Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])),entry.gitBlobSha1,'Frozen Git blob changed: '+name);checked.set(name,bytes.toString('utf8'));
  }
  if(explicitDirectory!==undefined){const alias=await plainFile(fixtureRoot,'LOAD_ORDER.md');assert.equal(alias.toString('utf8'),checked.get('index.html'),'LOAD_ORDER.md must be exact original index bytes, not reconstructed order');}
  return Object.freeze({kind:explicitDirectory!==undefined?'explicit-verified-eight-source-fixture':'committed-verified-eight-source-fallback',original:async name=>{assert.ok(checked.has(name),'Unexpected frozen reference name');return checked.get(name);},order:async()=>checked.get('index.html')});
}
