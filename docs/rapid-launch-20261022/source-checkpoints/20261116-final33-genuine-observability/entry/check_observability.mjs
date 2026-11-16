/** Focused pure-helper/parser seam check. Never evaluates either entry main. */
import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import ts from '../20261116-r3-final-source-prepare-01/work/node_modules/typescript/lib/typescript.js';
const baseUrl=new URL('../../T45/revisions/20261116-r3-batched161-formal-run-package-local-01/RUNTIME-WINDOW-SUCCESSOR-01/start/bundle/batched161-run.mjs',import.meta.url);
const original=await readFile(baseUrl,'utf8'),candidate=await readFile(new URL('source/batched161-run.mjs',import.meta.url),'utf8');
const tree=s=>ts.createSourceFile('entry.mjs',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const before=tree(original),after=tree(candidate),printer=ts.createPrinter({removeComments:true});
const printed=(n,file)=>printer.printNode(ts.EmitHint.Unspecified,n,file);
const functions=t=>new Map(t.statements.filter(ts.isFunctionDeclaration).map(n=>[n.name.text,n]));
const oldFunctions=functions(before),newFunctions=functions(after),unchanged=[];
for(const [name,old]of oldFunctions){
 let fresh=newFunctions.get(name);assert.ok(fresh);
 if(name==='compile'){
  const transformed=ts.transform(fresh,[context=>{
   const visit=node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&ts.isIdentifier(node.expression.expression)&&node.expression.expression.text==='describeStage'?undefined:ts.visitEachChild(node,visit,context);
   return node=>ts.visitNode(node,visit);
  }]);fresh=transformed.transformed[0];
  assert.equal(printed(fresh,after),printed(old,before));transformed.dispose();
 }else {assert.equal(printed(fresh,after),printed(old,before));assert.equal(fresh.getText(after),old.getText(before));}
 unchanged.push(name);
}
const topTry=t=>t.statements.find(ts.isTryStatement);
assert.equal(printed(topTry(after).tryBlock,after),printed(topTry(before).tryBlock,before));
assert.equal(printed(topTry(after).catchClause.block.statements.at(-1),after),printed(topTry(before).catchClause.block.statements.at(-1),before));
// Isolate only the actual new pure observations. No source/target/PG factory is stubbed.
const observerNodes=after.statements.filter(n=>ts.isFunctionDeclaration(n)?n.name.text.startsWith('describe'):ts.isVariableStatement(n)&&n.declarationList.declarations.every(d=>ts.isIdentifier(d.name)&&(d.name.text.startsWith('describe')||d.name.text==='REQUEST')));
const observer="import {types} from 'node:util';\n"+observerNodes.map(n=>n.getText(after)).join('\n')+"\nexport {describeStage,describePreflightFailure,describeStages,describeErrorTypes,describeSystemCodes,describeGuardCodes,describeSafeCodes};";
const api=await import('data:text/javascript;base64,'+Buffer.from(observer).toString('base64'));
const boundary=JSON.parse(await readFile(new URL('../../T45/revisions/20261116-r3-batched161-formal-run-package-local-01/AUTH-RESTORE33-SUCCESSOR-01/ACTUAL-GENUINE-BOUNDARY-01.json',import.meta.url)));
const empty=api.describePreflightFailure(undefined);
assert.deepEqual(Object.fromEntries(Object.keys(boundary.existingNativeReply).map(k=>[k,empty[k]])),boundary.existingNativeReply);
assert.equal(Object.hasOwn(empty,'lastStage'),false);
const sentinel='REDACTION_SENTINEL_DO_NOT_EXPORT';let getters=0;
const getterError=new Error();Object.defineProperty(getterError,'message',{get(){getters++;throw Error(sentinel)}});Object.defineProperty(getterError,'stack',{get(){getters++;throw Error(sentinel)}});Object.defineProperty(getterError,'code',{get(){getters++;throw Error(sentinel)}});
const unknown=new Error('DB05_COMMAND_'+sentinel);unknown.code=sentinel;
const known=new TypeError(sentinel);known.code='ENOENT';
const guard=new Error('FRESH35_COMBINED_CATALOG_BASE_MODEL_CORE_DIFFERS:'+sentinel);
const current=new Error('FRESH35_COMBINED_CURRENT_SOURCE_CHANGED:'+sentinel);
const closed=new Error('DB05_COMMAND_FIXED_ROOT_PROCESS_REQUIRED');
const proxy=new Proxy({}, {get(){getters++;throw Error(sentinel)},getPrototypeOf(){getters++;throw Error(sentinel)}});
const failures=[undefined,known,unknown,guard,current,closed,getterError,proxy].map(e=>api.describePreflightFailure(e));
assert.equal(getters,0);assert.ok(!JSON.stringify(failures).includes(sentinel));
assert.equal(failures[1].errorType,'TypeError');assert.equal(failures[1].systemCode,'ENOENT');assert.equal(failures[2].safeCode,'DB05_COMMAND_PREFLIGHT_REFUSED');assert.equal(failures[2].systemCode,'OTHER');
assert.equal(failures[3].guardCode,'FRESH35_COMBINED_CATALOG_BASE_MODEL_CORE_DIFFERS');assert.equal(failures[4].guardCode,'FRESH35_COMBINED_CURRENT_SOURCE_CHANGED');assert.equal(failures[5].safeCode,'DB05_COMMAND_FIXED_ROOT_PROCESS_REQUIRED');
for(const value of failures)assert.deepEqual(Object.keys(value).sort(),['requestKey','state','safeCode','connectionCleanup','automaticReplay','errorType','systemCode','guardCode'].sort());
api.describeStage('IMPORT_BEGIN',false);api.describeStage(sentinel,true);
for(const stage of api.describeStages)api.describeStage(stage,true);
const terminal=api.describePreflightFailure(new Error(sentinel));
const needCodes=new Set();const visit=n=>{if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='need')needCodes.add('DB05_COMMAND_'+n.arguments[1].text);ts.forEachChild(n,visit)};visit(before);needCodes.add('DB05_COMMAND_PREFLIGHT_REFUSED');assert.deepEqual([...api.describeSafeCodes].sort(),[...needCodes].sort());
console.log(JSON.stringify({state:'PURE_OBSERVABILITY_SEAM_PASS',originalFunctionsASTUnchangedAfterStrippingMarks:unchanged,successTryBlockASTUnchanged:true,failureExitASTUnchanged:true,capturedFailureBaseFieldsCompatible:true,closedSafeCodeCount:api.describeSafeCodes.size,failures,terminal,
 enums:{stages:api.describeStages,errorTypes:[...api.describeErrorTypes],systemCodes:[...api.describeSystemCodes],guardCodes:[...api.describeGuardCodes]},noRawExceptionGetterRead:true,noSensitiveSentinelSerialized:true,originalNativeInvoked:false,PGConnections:0,fixtureTargetOrCapCreated:false}));
