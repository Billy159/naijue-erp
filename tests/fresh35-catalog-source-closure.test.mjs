import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile, stat, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createFresh35EvidenceV2SourceBinding, validateFresh35EvidenceV2Candidate, FRESH35_EVIDENCE_V2_PUBLIC_CLI_MODULES } from '../scripts/release/unified-install/fresh35-catalog-evidence-v2.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=v=>createHash('sha256').update(v).digest('hex');
const added=[
 'packages/application/src/unified-import-execution-v2-client.ts','packages/application/src/unified-import-master-chunks-v2.ts','packages/application/src/unified-source-registration.ts',
 'packages/authentication/src/passwords.ts','packages/authentication/src/ports.ts',
 ...['execution-client.ts','execution-v2-admission.ts','package-reader.ts','source-registration.mjs','stream-document-requests.mjs','stream-master-graph.mjs','stream-package-metadata.mjs','stream-prepare-cli.mjs','stream-typed-hash.mjs','whole-package-client.ts','whole-package-inspect.ts','whole-package-reconcile.mjs'].map(n=>'tools/unified-import/'+n),
].sort();
// TypeScript is an independent TEST parser only, never a production binding or
// PostgreSQL dependency. No module under inspection is imported or executed.
async function moduleClosure(sourceRoot,roots){
 const queue=[...roots],seen=new Set(),external=new Set(),assets=new Set();
 for(let i=0;i<queue.length;i++){
  const path=queue[i];if(seen.has(path))continue;seen.add(path);
  const source=await readFile(resolve(sourceRoot,path),'utf8'),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0,'Source parse diagnostics: '+path);const imports=[];
  function visit(n){
   if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier){assert.ok(ts.isStringLiteralLike(n.moduleSpecifier));imports.push(n.moduleSpecifier.text);}
   if(ts.isImportEqualsDeclaration(n)){assert.ok(ts.isExternalModuleReference(n.moduleReference)&&n.moduleReference.expression&&ts.isStringLiteralLike(n.moduleReference.expression),'Unreviewed import equals: '+path);imports.push(n.moduleReference.expression.text);}
   if(ts.isImportTypeNode(n)){assert.ok(ts.isLiteralTypeNode(n.argument)&&ts.isStringLiteralLike(n.argument.literal),'Unreviewed import type: '+path);imports.push(n.argument.literal.text);}
   if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==='require')){assert.equal(n.arguments.length,1,'Unreviewed import options: '+path);assert.ok(ts.isStringLiteralLike(n.arguments[0]),'Unreviewed nonliteral import: '+path);imports.push(n.arguments[0].text);}
   if(ts.isStringLiteralLike(n)&&/^(adapters|scripts|tools|packages)\/.*\.(sql|psql|json|[mc]?js|[mc]?ts)$/.test(n.text))assets.add(n.text);
   ts.forEachChild(n,visit);
  }visit(ast);
  for(const specifier of imports){
   if(!specifier.startsWith('.')){assert.ok(specifier==='pg'||specifier.startsWith('node:'),'Unreviewed external module: '+specifier);external.add(specifier);continue;}
   const raw=resolve(sourceRoot,dirname(path),specifier);let found;
   for(const candidate of [raw,raw.replace(/\.js$/,'.ts'),raw.replace(/\.mjs$/,'.mts')])try{if((await stat(candidate)).isFile()){found=candidate;break;}}catch{}
   assert.ok(found,'Missing local import: '+path+' -> '+specifier);const next=relative(sourceRoot,found);assert.ok(next&&!next.startsWith('../')&&!next.startsWith('/'),'Import outside source root');queue.push(next);
  }
 }
 return {paths:[...seen].sort(),external:[...external].sort(),assets:[...assets].sort()};
}
async function copyBinding(binding,dir){for(const pin of binding.sourcePins){const path=resolve(dir,pin.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,await readFile(resolve(root,pin.path)));}}
test('V2 public CLI local closure is explicit and includes preparation, registration and every transitive module',async()=>{
 const binding=await createFresh35EvidenceV2SourceBinding(root),pins=new Map(binding.sourcePins.map(p=>[p.path,p.sha256]));
 const graph=await moduleClosure(root,['tools/unified-import/cli.mjs','tools/unified-import/cli.ts']);
 assert.deepEqual(graph.paths,FRESH35_EVIDENCE_V2_PUBLIC_CLI_MODULES);assert.equal(graph.paths.length,72);assert.equal(binding.sourcePins.length,177);
 for(const path of graph.paths)assert.equal(pins.get(path),hash(await readFile(resolve(root,path))),'Unpinned public CLI dependency: '+path);
 for(const path of added)assert.ok(pins.has(path),path);
 for(const path of graph.assets)assert.ok(pins.has(path),'Unpinned source data asset: '+path);
 assert.deepEqual(binding.publicCliSourceScope.modulePaths,graph.paths);assert.equal(binding.sourceScope,'STRUCTURAL_AND_PUBLIC_CLI_LOCAL_SOURCE_CLOSURE_NOT_WHOLE_REPOSITORY');
 assert.equal(binding.finalSourceFreezeAuthenticated,false);assert.equal(binding.executionAuthorized,false);
});
test('every declared local code module has its static, type and literal-dynamic imports pinned',async()=>{
 const binding=await createFresh35EvidenceV2SourceBinding(root),pins=new Set(binding.sourcePins.map(p=>p.path));
 const graph=await moduleClosure(root,binding.sourcePins.filter(p=>/\.[mc]?[jt]s$/.test(p.path)).map(p=>p.path));
 for(const path of graph.paths)assert.ok(pins.has(path),'Unpinned transitive source: '+path);
 for(const path of graph.assets)assert.ok(pins.has(path),'Unpinned source asset: '+path);
 assert.equal(graph.paths.length,97);assert.ok(graph.external.includes('pg'));
});
test('missing preparation root or deep dependency cannot create a V2 source binding',async()=>{
 const binding=await createFresh35EvidenceV2SourceBinding(root),dir=await mkdtemp(resolve(tmpdir(),'fresh35-missing-closure-'));
 try{await copyBinding(binding,dir);for(const path of added){await rm(resolve(dir,path));await assert.rejects(createFresh35EvidenceV2SourceBinding(dir),/ENOENT/);await writeFile(resolve(dir,path),await readFile(resolve(root,path)));}}
 finally{await rm(dir,{recursive:true,force:true});}
});
test('all newly included files reject stale bindings and changed preparation/deep-source bytes change the digest',async()=>{
 const binding=await createFresh35EvidenceV2SourceBinding(root),dir=await mkdtemp(resolve(tmpdir(),'fresh35-drift-closure-'));
 try{await copyBinding(binding,dir);const copy=await createFresh35EvidenceV2SourceBinding(dir);assert.equal(copy.sha256,binding.sha256);
  for(const path of added){const original=await readFile(resolve(dir,path));await writeFile(resolve(dir,path),Buffer.concat([original,Buffer.from('\n// Source closure drift model.\n')]));await assert.rejects(validateFresh35EvidenceV2Candidate(copy,{}),/SOURCE_FILE_CHANGED/);
   if(path.endsWith('/stream-prepare-cli.mjs')||path.endsWith('/stream-typed-hash.mjs')||path.endsWith('/unified-source-registration.ts')){const changed=await createFresh35EvidenceV2SourceBinding(dir);assert.notEqual(changed.sha256,copy.sha256);assert.notEqual(changed.sourcePins.find(p=>p.path===path).sha256,copy.sourcePins.find(p=>p.path===path).sha256);}
   await writeFile(resolve(dir,path),original);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('the independent closure regression detects a new unlisted dependency and nonliteral imports',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'fresh35-new-closure-'));
 try{await mkdir(resolve(dir,'tools'),{recursive:true});await writeFile(resolve(dir,'tools/root.mjs'),"import './new.mjs';\n");await writeFile(resolve(dir,'tools/new.mjs'),'export const model=true;\n');const graph=await moduleClosure(dir,['tools/root.mjs']);assert.deepEqual(graph.paths,['tools/new.mjs','tools/root.mjs']);assert.notDeepEqual(graph.paths,['tools/root.mjs']);await writeFile(resolve(dir,'tools/root.mjs'),"const name='./new.mjs'; await import(name);\n");await assert.rejects(moduleClosure(dir,['tools/root.mjs']),/nonliteral import/);}
 finally{await rm(dir,{recursive:true,force:true});}
});
