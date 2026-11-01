/** Rebuildable synthetic host, pinned runtime and separately frozen harness. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {sha256,verifiedFile,pinnedRuntimeImport,frozenServerRelative} from './host-core.mjs';
import {isBuiltin} from 'node:module';
import {buildCanonicalBrowser} from './canonical-build.mjs';
import {createPhaseBinding} from './phase-binding.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),sourceRoot=path.resolve(here,'../../../..');
const canonical=value=>JSON.stringify(value);
export async function buildBrowserHost({runtimeRepo,runtimeCommit,outdir,helperManifest,helperManifestSha256,phase='BEFORE_OPT00',reviewedRuntimeManifest=null,reviewedRuntimeManifestSha256=null}){
  assert.equal(process.version,'v24.21.0');assert.equal(execFileSync('npm',['--version'],{encoding:'utf8'}).trim(),'11.9.0');assert.ok([runtimeRepo,outdir,helperManifest].every(path.isAbsolute));runtimeRepo=await realpath(runtimeRepo);assert.match(runtimeCommit,/^[a-f0-9]{40}$/);
  const git=(...args)=>execFileSync('git',['-C',runtimeRepo,...args],{encoding:'utf8'}).trim();assert.equal(git('rev-parse','HEAD'),runtimeCommit);assert.equal(git('status','--porcelain'),'','Runtime must be clean');
  const runtimeTree=git('rev-parse','HEAD^{tree}'),lock=await readFile(path.join(runtimeRepo,'package-lock.json'));const helperBytes=await readFile(helperManifest);assert.equal(sha256(helperBytes),helperManifestSha256);const helper=JSON.parse(helperBytes);
  let reviewedManifest=null,reviewedManifestBytes=null,phaseApprovalSource=null;
  if(phase==='AFTER_OPT01_A_R2'){
    assert.ok(path.isAbsolute(reviewedRuntimeManifest??''),'AFTER needs controller-supplied absolute reviewed source manifest');
    reviewedManifestBytes=await verifiedFile(path.dirname(reviewedRuntimeManifest),{path:path.basename(reviewedRuntimeManifest),sha256:reviewedRuntimeManifestSha256});reviewedManifest=JSON.parse(reviewedManifestBytes);
  }else{assert.equal(reviewedRuntimeManifest,null);assert.equal(reviewedRuntimeManifestSha256,null);}
  const phaseBinding=createPhaseBinding({phase,runtimeCommit,runtimeTree,reviewedManifest,reviewedManifestSha256:reviewedRuntimeManifestSha256});
  for(const file of phaseBinding.reviewedProductionSources)await verifiedFile(runtimeRepo,file);
  for(const file of helper.files)await verifiedFile(sourceRoot,file);const helperPaths=new Set(helper.files.map(file=>file.path));
  // Fresh immutable build directory. Never overwrite another checkpoint's build.
  await mkdir(outdir,{recursive:false});await writeFile(path.join(outdir,'package.json'),'{"type":"module"}\n');
  if(reviewedManifestBytes){await writeFile(path.join(outdir,'reviewed-runtime-manifest.json'),reviewedManifestBytes);phaseApprovalSource={path:'reviewed-runtime-manifest.json',bytes:reviewedManifestBytes.length,sha256:reviewedRuntimeManifestSha256};}
  const entries=(await readdir(here,{withFileTypes:true})).filter(entry=>entry.isFile()).map(entry=>entry.name).sort();const harness=[];for(const name of entries){const bytes=await readFile(path.join(here,name));harness.push({path:'tests/performance/opt00/browser-host/'+name,sha256:sha256(bytes),bytes:bytes.length});}const harnessManifestSha256=sha256(canonical(harness)),frozenNewInputs=new Map([...harness,...helper.files].map(file=>[file.path,file]));await writeFile(path.join(outdir,'harness-source-manifest.json'),JSON.stringify({files:harness,sha256:harnessManifestSha256},null,2)+'\n');
  const tracked=new Map();for(const record of execFileSync('git',['-C',runtimeRepo,'ls-tree','-rz','--full-tree','HEAD']).toString().split('\0').filter(Boolean)){const [,,type,blob,relative]=/^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/.exec(record);if(type==='blob')tracked.set(relative,blob);}
  const runtimeInputs=new Map(),dependencyInputs=new Map(),newInputs=new Map();
  async function observe(filename,bytes){const absolute=await realpath(filename);const candidateRelative=path.relative(runtimeRepo,absolute),activeRelative=path.relative(sourceRoot,absolute);
    if(!candidateRelative.startsWith('..')&&!path.isAbsolute(candidateRelative)&&candidateRelative.includes('node_modules/')){dependencyInputs.set(candidateRelative,{path:candidateRelative,sha256:sha256(bytes),bytes:bytes.length});return;}
    const relative=!candidateRelative.startsWith('..')&&!path.isAbsolute(candidateRelative)?candidateRelative:activeRelative;
    if(relative.startsWith('tests/performance/opt00/')){const frozen=frozenNewInputs.get(relative);assert.ok(frozen,'Unfrozen harness helper');assert.equal(sha256(bytes),frozen.sha256,'Harness/helper changed during build: '+relative);assert.equal(bytes.length,frozen.bytes);newInputs.set(relative,{path:relative,sha256:sha256(bytes),bytes:bytes.length});return;}
    if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Unowned build input '+absolute);
    const blob=createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])).digest('hex');assert.equal(blob,tracked.get(relative),'Runtime input differs from pinned Git object: '+relative);runtimeInputs.set(relative,{path:relative,sha256:sha256(bytes),bytes:bytes.length});
  }
  // Replace complete quoted import paths rather than depending on working-dir
  // resolution. Entry does not import React; every framework import belongs to
  // the ONE pinned candidate dependency root.
  const importFromBuild=filename=>{const relative=path.relative(outdir,filename).split(path.sep).join('/');return JSON.stringify(relative.startsWith('.')?relative:'./'+relative);};
  const entry=(await verifiedFile(sourceRoot,frozenNewInputs.get('tests/performance/opt00/browser-host/entry.tsx'))).toString().replace(/'\.\.\/\.\.\/\.\.\/\.\.\/(apps\/[^']+)'/g,(_all,relative)=>importFromBuild(path.join(runtimeRepo,relative))).replace("'./readiness.mjs'",importFromBuild(path.join(here,'readiness.mjs'))).replace("'./action-boundary.mjs'",importFromBuild(path.join(here,'action-boundary.mjs')));
  const generated=path.join(outdir,'entry.tsx');await writeFile(generated,entry);newInputs.set('generated-entry.tsx',{path:'generated-entry.tsx',sha256:sha256(entry),bytes:Buffer.byteLength(entry)});
  const {manifest,productionGraph,reactRoots}=await buildCanonicalBrowser({runtimeRepo,runtimeCommit,outdir,entry:generated,observe});
  // Typecheck the ACTUAL generated host against that SAME candidate dependency
  // tree. esbuild success alone is not a TypeScript contract check.
  const tsconfig={extends:path.join(runtimeRepo,'apps/web/demo-replica/tsconfig.runtime.json'),compilerOptions:{allowJs:true,checkJs:false,typeRoots:[path.join(runtimeRepo,'node_modules/@types')]},include:[generated,path.join(runtimeRepo,'apps/web/src/styles.d.ts'),path.join(runtimeRepo,'apps/web/demo-replica/frontend/runtime/inventory/assets.d.ts'),path.join(runtimeRepo,'apps/web/demo-replica/frontend/runtime/common/inventory-drawer-imports.d.ts')],exclude:[]};await writeFile(path.join(outdir,'tsconfig.host.json'),JSON.stringify(tsconfig,null,2));
  const typeOutput=execFileSync(process.execPath,[path.join(runtimeRepo,'node_modules/typescript/bin/tsc'),'--noEmit','-p',path.join(outdir,'tsconfig.host.json')],{encoding:'utf8'});await writeFile(path.join(outdir,'typecheck.log'),typeOutput||'PASS strict generated canonical host typecheck\n');
  const browserRuntimeClosure=[...runtimeInputs.values()].sort((a,b)=>a.path.localeCompare(b.path)),serverRuntimeInputs=new Map();
  // Discover the real Node server import closure WITHOUT executing/bundling its
  // CLI guards. Copy individual source modules preserving import.meta.url.
  const {build}=await import(pathToFileURL(path.join(runtimeRepo,'node_modules/esbuild/lib/main.js')).href);const graph=await build({absWorkingDir:sourceRoot,entryPoints:[path.join(here,'serve.mjs')],bundle:true,platform:'node',format:'esm',write:false,metafile:true,packages:'external',logLevel:'silent',plugins:[{name:'pinned-node-runtime-source',setup(builder){builder.onResolve({filter:/./},args=>{if(!args.importer)return;const target=pinnedRuntimeImport(sourceRoot,runtimeRepo,args.importer,args.path);if(target)return {path:target};});}}]});
  for(const input of Object.values(graph.metafile.inputs))for(const imported of input.imports??[])if(imported.external)assert.ok(isBuiltin(imported.path),'Node test-server closure permits builtins only, not unbound dependencies: '+imported.path);
  for(const filename of Object.keys(graph.metafile.inputs)){const absolute=path.resolve(sourceRoot,filename),bytes=await readFile(absolute);await observe(absolute,bytes);const relative=frozenServerRelative(sourceRoot,runtimeRepo,absolute);if(!relative.startsWith('tests/performance/opt00/'))serverRuntimeInputs.set(relative,{path:relative,sha256:sha256(bytes),bytes:bytes.length});const target=path.join(outdir,'server-source',relative);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);}
  await writeFile(path.join(outdir,'server-source/package.json'),'{"type":"module"}\n');
  for(const file of frozenNewInputs.values())await verifiedFile(sourceRoot,file);for(const file of [...runtimeInputs.values(),...dependencyInputs.values()])await verifiedFile(runtimeRepo,file);assert.equal(git('rev-parse','HEAD'),runtimeCommit);assert.equal(git('status','--porcelain'),'','Runtime changed during build');assert.equal(sha256(await readFile(helperManifest)),helperManifestSha256);
  for(const file of phaseBinding.reviewedProductionSources)await verifiedFile(runtimeRepo,file);if(reviewedManifestBytes)assert.equal(sha256(await readFile(reviewedRuntimeManifest)),reviewedRuntimeManifestSha256,'Reviewed AFTER manifest drift');
  const runtimeClosure=[...runtimeInputs.values()].sort((a,b)=>a.path.localeCompare(b.path)),dependencies=[...dependencyInputs.values()].sort((a,b)=>a.path.localeCompare(b.path)),harnessInputs=[...newInputs.values()].sort((a,b)=>a.path.localeCompare(b.path));
  const artifacts=[];async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(entry.isFile()){const bytes=await readFile(file);artifacts.push({path:path.relative(outdir,file),bytes:bytes.length,sha256:sha256(bytes)});}else throw Error('No build symlink');}}await walk(path.join(outdir,'assets'));await walk(path.join(outdir,'server-source'));const shell=await readFile(path.join(outdir,'host-shell.html'));artifacts.push({path:'host-shell.html',bytes:shell.length,sha256:sha256(shell)});if(phaseApprovalSource)artifacts.push(phaseApprovalSource);artifacts.sort((a,b)=>a.path.localeCompare(b.path));
  const serverRuntimeClosure=[...serverRuntimeInputs.values()].sort((a,b)=>a.path.localeCompare(b.path));
  const identity={format:'opt00-synthetic-browser-build-v2-A4',browserRuntimeClosure,browserRuntimeClosureSha256:sha256(canonical(browserRuntimeClosure)),serverRuntimeClosure,serverRuntimeClosureSha256:sha256(canonical(serverRuntimeClosure)),phaseBinding,phaseApprovalSource,runtimeCommit,runtimeTree,runtimeRepo,runtimeClosureSha256:sha256(canonical(runtimeClosure)),runtimeClosure,harnessManifestSha256,harnessSource:harness,harnessInputs,helperManifestSha256,dependencyLockSha256:sha256(lock),dependencyClosureSha256:sha256(canonical(dependencies)),dependencyInputs:dependencies,reactDependencyRoot:reactRoots[0],productionGraph,node:process.version,npm:execFileSync('npm',['--version'],{encoding:'utf8'}).trim(),assets:manifest,artifacts,artifactBuildSha256:sha256(canonical(artifacts)),serverEntry:'server-source/tests/performance/opt00/browser-host/serve.mjs',scope:'CANONICAL COPIED renderer + original shared sessions, separately frozen TEST HARNESS/loopback adapter; not a production release/performance pass'};
  await writeFile(path.join(outdir,'build-identity.json'),JSON.stringify(identity,null,2)+'\n');return identity;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const [runtimeRepo,runtimeCommit,outdir,helperManifest,helperManifestSha256,phase='BEFORE_OPT00',reviewedRuntimeManifest=null,reviewedRuntimeManifestSha256=null]=process.argv.slice(2);const identity=await buildBrowserHost({runtimeRepo,runtimeCommit,outdir,helperManifest,helperManifestSha256,phase,reviewedRuntimeManifest,reviewedRuntimeManifestSha256});console.log(JSON.stringify({runtimeCommit:identity.runtimeCommit,runtimeTree:identity.runtimeTree,harnessManifestSha256:identity.harnessManifestSha256,artifactBuildSha256:identity.artifactBuildSha256,reactDependencyRoot:identity.reactDependencyRoot,serverEntry:identity.serverEntry}));}
