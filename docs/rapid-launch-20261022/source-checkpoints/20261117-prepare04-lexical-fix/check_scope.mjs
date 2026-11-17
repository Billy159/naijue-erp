/** Parse and bind actual source only. Never import the inspected application. */
import ts from '../20261116-r3-final-source-prepare-01/work/node_modules/typescript/lib/typescript.js';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=resolve('outputs/D1/20261117-r3-prepare04-lexical-fix-source-01');
const work=resolve('outputs/D1/20261116-r3-final-source-prepare-01/work');
const bundle=resolve('outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL38-SOURCE-SUCCESSOR-03');
const host='tools/unified-import/fresh35-host-session.mjs';
const names=['fresh35-host-session','whole-host-session','r3-service20-retained-import','stream-plan','first-admin-setup','stream-program','batched-stream-cli-state','batched-stream-plan'];
const files=names.map(n=>work+'/tools/unified-import/'+n+'.mjs');
const candidate=here+'/source/'+host;
const options={allowJs:true,checkJs:true,noResolve:true,noEmit:true,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext};
// Scope diagnostics only; no emit, installer, loader, compiler or catalog API.
const program=ts.createProgram([...files,candidate],options);
const missing=[];
for(const file of [...files,candidate]){
 const sf=program.getSourceFile(file);assert.ok(sf);assert.equal(sf.parseDiagnostics.length,0);
 for(const d of program.getSemanticDiagnostics(sf))if([2304,2552,18004].includes(d.code)){
  const where=sf.getLineAndCharacterOfPosition(d.start);
  missing.push({file:relative(resolve('.'),file),line:where.line+1,code:d.code,text:ts.flattenDiagnosticMessageText(d.messageText,' ')});
 }
}
const originalMissing=missing.filter(d=>d.file.endsWith('/work/'+host));
assert.equal(originalMissing.length,2);
assert.deepEqual(originalMissing.map(d=>d.line),[1065,1066]);
assert.ok(originalMissing[0].text.includes('buildFresh35BatchedCatalogV1'));
assert.ok(originalMissing[1].text.includes('buildFresh35BatchedCommandSuccessorCatalogV1'));
assert.equal(missing.filter(d=>d.file!==relative(resolve('.'),work+'/'+host)).length,0);
const a=await readFile(work+'/'+host,'utf8'),b=await readFile(candidate,'utf8');
const local=" const {buildFresh35BatchedCatalogV1,buildFresh35BatchedCommandSuccessorCatalogV1}=await import('../../scripts/release/unified-install/fresh35-combined-catalog-v1.mjs');\n";
const prefix='import {buildFresh35CombinedCatalog,buildFresh35Admin154Catalog,buildFresh35CompactZeroCatalog,';
assert.equal(b,a.replace(prefix,prefix+'buildFresh35BatchedCatalogV1,buildFresh35BatchedCommandSuccessorCatalogV1,').replace(local,''));
const runner=await readFile(bundle+'/prepare/bundle/final33-run.mjs','utf8');
const nextRunner=await readFile(here+'/diagnostic/final33-run.mjs','utf8');
assert.equal(nextRunner,runner.replace("error instanceof SyntaxError?'SyntaxError':","error instanceof SyntaxError?'SyntaxError':error instanceof ReferenceError?'ReferenceError':"));
const originalTree=ts.createSourceFile('original.mjs',runner,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const nextTree=ts.createSourceFile('candidate.mjs',nextRunner,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
assert.equal(originalTree.parseDiagnostics.length,0);assert.equal(nextTree.parseDiagnostics.length,0);
const catalogText=await readFile(work+'/scripts/release/unified-install/fresh35-combined-catalog-v1.mjs','utf8');
const catalogTree=ts.createSourceFile('catalog.mjs',catalogText,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
for(const name of ['buildFresh35BatchedCatalogV1','buildFresh35BatchedCommandSuccessorCatalogV1']){
 const declaration=catalogTree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
 assert.ok(declaration?.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword),name);
}
const functions=tree=>new Map(tree.statements.filter(ts.isFunctionDeclaration).map(n=>[n.name.text,n]));
const oldFns=functions(originalTree),newFns=functions(nextTree);
for(const [name,node]of oldFns)if(name!=='describeFailure')assert.equal(node.getText(originalTree),newFns.get(name).getText(nextTree),name);
for(const [source,target]of [['prepare/bundle/final33_host.py','final33_host.py'],['read_pending38.py','read_pending38.py']]){
 const old=await readFile(bundle+'/'+source,'utf8'),next=await readFile(here+'/diagnostic/'+target,'utf8');
 assert.equal(next,old.replace("'RangeError', 'SyntaxError', 'UNKNOWN'","'RangeError', 'SyntaxError', 'ReferenceError', 'UNKNOWN'"));
}
const inspected=[...files,candidate,work+'/scripts/release/unified-install/fresh35-combined-catalog-v1.mjs',bundle+'/prepare/bundle/final33-run.mjs',here+'/diagnostic/final33-run.mjs',here+'/diagnostic/final33_host.py',here+'/diagnostic/read_pending38.py'];
const pins=[];for(const path of inspected){const bytes=await readFile(path);pins.push({path:relative(resolve('.'),path),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
const result={state:'STATIC_SCOPE_AND_MINIMAL_DELTA_CHECKS_PASS_ONLY',method:'TypeScript parse/bind, noResolve, noEmit; only unresolved-name codes 2304/2552/18004; not general typecheck or full compile',inspectedModules:names,baselineMissing:originalMissing,candidateMissing:[],otherInspectedModulesMissing:[],businessFunctionBodiesUnchanged:true,diagnosticChanges:'ReferenceError type classification and two existing closed-enum acceptors only',actualThrowCaptured:false,actualFailureCauseConfirmed:false,nativeCalls:0,PGConnections:0,clockOrAuthorityCalls:0,faultInjectionOrErrorFixtures:0,pins};
await writeFile(here+'/LOCAL-CHECKS.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({state:result.state,baselineMissing:originalMissing,candidateMissing:[],modules:names.length}));
