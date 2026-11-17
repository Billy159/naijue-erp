import ts from '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/D1/20261116-r3-final-source-prepare-01/work/node_modules/typescript/lib/typescript.js';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve('.'),v=root+'/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01';
const base=v+'/HTTP-CANDIDATE-01/source',dir=v+'/APP-ROOT07-SOURCE-IMPACT-01';
const leaf='tools/unified-import/fresh35-host-session.mjs';
const oldPath=base+'/'+leaf,newPath=dir+'/candidate/'+leaf;
const sha=b=>createHash('sha256').update(b).digest('hex');
const receipt=await readFile(dir+'/RESULT.json');
assert.equal(sha(receipt),'1b80820a7bdb3df3b2eec4ee07f6b8d604b8246533ffd6be7731cf77600f9181');
const old=await readFile(oldPath),next=await readFile(newPath);
assert.equal(sha(old),'74d4a387c13184abb82ad26cff06f2fdb890d4c333de2f278445c3d32519ac79');assert.equal(old.length,121315);
assert.equal(sha(next),'b7246e2ab3daf55b046443a80bb9a2e7eebbbedcc6de3ccf54ffa32a6de2e62f');assert.equal(next.length,121219);
const text=old.toString(),fixed=next.toString();
const prefix='assertFresh35CombinedCatalogCurrent}';
const expanded='assertFresh35CombinedCatalogCurrent,buildFresh35BatchedCatalogV1,buildFresh35BatchedCommandSuccessorCatalogV1}';
const local=" const {buildFresh35BatchedCatalogV1,buildFresh35BatchedCommandSuccessorCatalogV1}=await import('../../scripts/release/unified-install/fresh35-combined-catalog-v1.mjs');\n";
assert.equal(text.split(prefix).length-1,1);
// String.replace removes just the first local import, keeping the second
// independent function-local binding at original1341 intact.
assert.equal(text.split(local).length-1,2);assert.equal(fixed.split(local).length-1,1);
assert.ok(fixed===text.replace(prefix,expanded).replace(local,''),'Exactly the two APP-specific edits');
assert.ok(fixed.replace(expanded,prefix).replace(' const predecessor=await buildFresh35BatchedCatalogV1(source,target,base);',local+' const predecessor=await buildFresh35BatchedCatalogV1(source,target,base);')===text,'Reverse two edits restore exact original');
const options={allowJs:true,checkJs:true,noResolve:true,noEmit:true,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext};
const program=ts.createProgram([oldPath,newPath],options);const missing={};
for(const file of [oldPath,newPath]){
 const sf=program.getSourceFile(file);assert.ok(sf);assert.equal(sf.parseDiagnostics.length,0);
 missing[file]=program.getSemanticDiagnostics(sf).filter(d=>[2304,2552,18004].includes(d.code)).map(d=>({line:sf.getLineAndCharacterOfPosition(d.start).line+1,code:d.code,text:ts.flattenDiagnosticMessageText(d.messageText,' ')}));
}
assert.deepEqual(missing[oldPath].map(d=>d.line),[1227,1228]);assert.equal(missing[newPath].length,0);
const parse=s=>ts.createSourceFile('host.mjs',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const a=parse(text),b=parse(fixed);
const imports=t=>t.statements.filter(ts.isImportDeclaration).map(n=>n.moduleSpecifier.text);
assert.deepEqual(imports(a),imports(b));
const catalogPath=base+'/scripts/release/unified-install/fresh35-combined-catalog-v1.mjs';
const catalogBytes=await readFile(catalogPath),catalog=parse(catalogBytes.toString());assert.equal(catalog.parseDiagnostics.length,0);
for(const name of ['buildFresh35BatchedCatalogV1','buildFresh35BatchedCommandSuccessorCatalogV1']){
 const declaration=catalog.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
 assert.ok(declaration?.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword));
}
const result={state:'STATIC_APP_OWN_HOST_TWO_IMPORTS_CHECKED_ONLY',original:{path:oldPath,sha256:sha(old),bytes:old.length},candidate:{path:newPath,sha256:sha(next),bytes:next.length},catalog:{path:catalogPath,sha256:sha(catalogBytes)},baselineUnresolved:missing[oldPath],candidateUnresolved:[],existingSecondLocalImportPreserved:true,reverseTwoEditsRestoreExactOriginal:true,staticESMDependencyPathsAndOrderUnchanged:true,newDependencyOrModuleEvaluationIntroduced:false,operatorLeafSubstituted:false,method:'APP own original and candidate only; TypeScript noResolve/noEmit, unresolved diagnostics2304/2552/18004 and AST export/import checks; not general typecheck or full compile',actions:{otherOperatorModulesRechecked:false,applicationModuleOrCatalogBuilderExecuted:false,clockIssuerServerPGNativeBrowserBuildPackOrFaultFixtureCalls:0}};
const out=root+'/outputs/QB/20261117-r3-app-host-lexical-fix-review-01/STATIC-EVIDENCE.json';
const raw=JSON.stringify(result,null,2)+'\n';await writeFile(out,raw,{flag:'wx'});
console.log(JSON.stringify({state:result.state,evidenceSha256:sha(raw),originalMissing:missing[oldPath],candidateMissing:[]}));
