/** One narrow source/pure-predicate check. No target, identity, capability or authority is constructed. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';
import assert from 'node:assert/strict';
import ts from '../20261116-r3-final-source-prepare-01/work/node_modules/typescript/lib/typescript.js';
import {requestHash} from '../20261116-r3-final-source-prepare-01/work/packages/application/src/request-hash.ts';
const ROOT=resolve('.'),HERE=resolve('outputs/D1/20261117-r3-start34-postcompile-diagnosis-01');
const WORK=resolve('outputs/D1/20261116-r3-final-source-prepare-01/work');
const BUNDLE=resolve('outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL34-APPLY02-CLI-SUCCESSOR-UNISSUED-01/start/bundle');
const sha=b=>createHash('sha256').update(b).digest('hex'),inputs={};
async function source(path,pin){const raw=await readFile(path);if(pin)assert.equal(sha(raw),pin);inputs[relative(ROOT,path)]=sha(raw);const text=raw.toString();return {path,text,tree:ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,path.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS)}}
const before=await source(BUNDLE+'/batched161-run.mjs','820ad6f54f8ac06bceff6a5fd4903d73fe6fed033ac286e4b2bf8d0d93ce1e66');
const candidate=await source(HERE+'/source/batched161-run.mjs');
const helper=await source(BUNDLE+'/final33-run.mjs','bdb646493a204e776f211483d1af8ce70812434c1892457b616774c4c3b1498b');
const records=await source(WORK+'/scripts/release/unified-install/fresh35-combined-record-v1.mjs');
const targets=await source(WORK+'/scripts/release/unified-install/fresh35-combined-target-v1.mjs');
const host=await source(WORK+'/tools/unified-import/fresh35-host-session.mjs','0a10be276269c1aadb3420acaddaed0dce3f1a033bbf9b4d2320ddfe80ecf60b');
const state=await source(WORK+'/tools/unified-import/batched-stream-cli-state.mjs','609879727a851cf6a79a4ab589096cb0cfe560476557ae9ef5d42d826df7613c');
const entry=await source(WORK+'/tools/unified-import/r3-service20-entry.mjs','a36f2a10911f19682e488bd1432924f4616f8e7b5007691e4ac50caafe3a68f6');
const printer=ts.createPrinter({removeComments:true});
const printed=(n,s)=>printer.printNode(ts.EmitHint.Unspecified,n,s.tree);
const functions=s=>new Map(s.tree.statements.filter(ts.isFunctionDeclaration).map(n=>[n.name.text,n]));
const fn=(s,name)=>{const n=functions(s).get(name);assert.ok(n,name);return n};
function variable(s,name){for(const n of s.tree.statements)if(ts.isVariableStatement(n))for(const d of n.declarationList.declarations)if(d.name.getText(s.tree)===name)return d.initializer;assert.fail(name)}
function literal(n){
 if(ts.isCallExpression(n)&&n.expression.getText()==='Object.freeze')return literal(n.arguments[0]);
 if(ts.isStringLiteral(n))return n.text;
 if(ts.isArrayLiteralExpression(n))return n.elements.map(literal);
 if(ts.isObjectLiteralExpression(n))return Object.fromEntries(n.properties.map(p=>{assert.ok(ts.isPropertyAssignment(p));return [p.name.text,literal(p.initializer)]}));
 assert.fail('non-literal source input '+n.getText());
}
// Existing root entry cannot pass IMPORT_BEGIN unless its original uid/euid===0 guard passed.
const main=fn(before,'main').getText(before.tree);assert.ok(main.includes('process.getuid()===0&&process.geteuid()===0'));
const ordinary=fn(records,'loadFresh35CombinedRecordEnvelope');
const first=ordinary.body.statements[0].expression;assert.equal(first.expression.getText(records.tree),'need');
assert.equal(first.arguments[1].text,'ORDINARY_RUNTIME_REQUIRED');
const ordinaryExpression=first.arguments[0].getText(records.tree);
const substituted=ordinaryExpression.replaceAll('process.getuid?.()','uid').replaceAll('process.getuid()','uid').replaceAll('process.geteuid?.()','euid');
assert.ok(!substituted.includes('process'));
const predicate=new Function('uid','euid','return ('+substituted+')');
assert.equal(predicate(0,0),false);assert.equal(predicate(61035,61035),true);
const readContext=fn(host,'readFresh35BatchedContextInputs').getText(host.tree);
assert.ok(readContext.includes('const envelope=await loadFresh35CombinedRecordEnvelope()'));
assert.ok(fn(host,'describeFresh35FinalPreparationBinding').getText(host.tree).includes('await readFresh35BatchedContextInputs('));
assert.ok(fn(before,'compile').getText(before.tree).includes('await api.describeFresh35FinalPreparationBinding('));
// Only the late call changes. Original compile prefix and every other function/catch remain exact.
const oldFns=functions(before),newFns=functions(candidate);
for(const [name,node]of oldFns)if(name!=='compile')assert.equal(printed(node,before),printed(newFns.get(name),candidate),name);
const prefix='describeStage(\'COMPILE_END\',describe);';
assert.equal(fn(before,'compile').getText(before.tree).split(prefix)[0],fn(candidate,'compile').getText(candidate.tree).split(prefix)[0]);
assert.equal(before.text.slice(before.text.indexOf(' const liveFacts=')),candidate.text.slice(candidate.text.indexOf(' const liveFacts=')));
assert.ok(!fn(candidate,'compile').getText(candidate.tree).includes('api.describeFresh35FinalPreparationBinding'));
assert.ok(fn(candidate,'compile').getText(candidate.tree).includes('api.buildFinalR3PreparationBinding(publicTarget,inputBinding,s.proofSha256,s.postmasterStart,'));
assert.ok(fn(candidate,'compile').getText(candidate.tree).includes('await targets.assertFresh35Installed154UpgradeTargetCurrent(target)'));
const rootCurrent=fn(targets,'assertFresh35Installed154UpgradeTargetCurrent').getText(targets.tree);
assert.ok(rootCurrent.includes('fresh35Installed154UpgradeTargetData(target)')&&rootCurrent.includes('assertFresh35RootUpgradeRecordCurrent('));
const recordCurrent=fn(records,'assertFresh35RootUpgradeRecordCurrent').getText(records.tree);
assert.ok(recordCurrent.includes('assertFresh35CombinedSourcesCurrent(source)')&&recordCurrent.includes('assertFresh35ProtectedRecordSnapshotCurrent(envelope)')&&recordCurrent.includes('rootUpgradeService(currentServiceSha256)')&&recordCurrent.includes('service.identity===r.service.identity'));
assert.ok(entry.text.includes('buildFinalR3PreparationBinding} from \'./batched-stream-cli-state.mjs\''));
const nativeDbPin=literal(variable(host,'batchedDbCandidatePinsSha256'));
assert.ok(fn(candidate,'compile').getText(candidate.tree).includes("batchedDbCandidatePinsSha256:'"+nativeDbPin+"'"));
const builder=fn(state,'buildFinalR3PreparationBinding').getText(state.tree);
assert.ok(builder.includes('assertFinalR3CurrentEvidence(')&&builder.includes('Object.freeze('));
// Real static source options and registration only: no target/admin/provision test data.
const actualRegistration=literal(variable(helper,'REGISTRATION'));
const approvals=literal(variable(helper,'APPROVALS'));
const actualOptions={'--target-profile':'FRESH35_COMPACT_ZERO_FIRST_IMPORT_V2'};
for(const row of approvals)actualOptions[row[4]]=row[3];
const expectedOptions=literal(variable(state,'finalSourceOptions'));
assert.equal(requestHash(actualOptions),requestHash(expectedOptions));
let expectedRegistration;
const visit=n=>{if(ts.isCallExpression(n)&&n.expression.getText(state.tree)==='requestHash'&&ts.isObjectLiteralExpression(n.arguments[0])&&n.arguments[0].properties.some(p=>p.name?.getText(state.tree)==='batch_id'))expectedRegistration=literal(n.arguments[0]);ts.forEachChild(n,visit)};
visit(fn(state,'describeFinalR3InputBinding'));assert.ok(expectedRegistration);
assert.equal(requestHash(actualRegistration),requestHash(expectedRegistration));
assert.equal(literal(variable(helper,'INPUT_PINS')).manifest,literal(variable(state,'FINAL_R3_SOURCE')).manifestSha256);
const finalBatch=fn(helper,'finalBatchBinding').getText(helper.tree);
assert.ok(finalBatch.includes('target,admin,registration:{...REGISTRATION},sourceOptions'));
const safeCodes=literal(variable(before,'describeSafeCodes').arguments[0]);
const originalErrorCode='FRESH35_COMBINED_RECORD_ORDINARY_RUNTIME_REQUIRED';
assert.equal(safeCodes.includes(originalErrorCode),false);
const typedPath=resolve('outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL34-APPLY02-RUNTIME-01/start/ACTUAL-START34-RESULT.json');
const typedRaw=await readFile(typedPath);assert.equal(sha(typedRaw),'09a37c519d0ca0433191977dd9d1f2466ceb0337d7763b284e1a03c19b1afd8d');
const actual=JSON.parse(typedRaw);assert.equal(actual.describeProcess.lastReachedStage,'COMPILE_END');assert.equal(actual.describeProcess.exitCode,2);
const result={state:'POSTCOMPILE_ROOT_ORDINARY_CONFLICT_SOURCE_CONFIRMED_CANDIDATE_CHECKED',
 actualStartEvidenceSha256:sha(typedRaw),inputFileSha256:inputs,
 confirmedStaticBlock:{rootUID:0,rootEUID:0,ordinaryGuardExpression:ordinaryExpression,ordinaryRootResult:predicate(0,0),ordinary61035Result:predicate(61035,61035),errorCode:originalErrorCode},
 actualExceptionMessage:'UNKNOWN_NOT_RETAINED_BY_MASK',actualFailureProjectionCompatible:true,
 candidateUsesExistingPureExport:true,rootTargetAndCatalogComeFromUnchangedCompilePrefix:true,
 lateOriginalRecordSourceAndCurrentCChecksUseExistingRootTargetAPI:true,
 nativeOrROOT06FilesChanged:false,helperChanged:false,entryAndCatchOtherFunctionsUnchanged:true,
 realSourceOptionsAndRegistrationHashMatch:true,postcompileReturnAndJSONStringifyUnchanged:true,
 targetsCreated:0,adminOrProvisionTestObjectsCreated:0,capabilitiesOrAuthoritiesCreated:0,
 nativeEntryInvoked:false,fullSourceCompilationRepeated:false,serverConnections:0,PGConnections:0,clockIssued:false,
 runtimeCandidateValidation:'NOT_RUN',ordinaryNativeRuntimeValidation:'NOT_RUN_SOURCE_PREDICATE_ONLY'};
await writeFile(HERE+'/LOCAL-CHECKS.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({state:result.state,ordinaryRootRejected:true,ordinary61035Allowed:true,staticInputHashesMatch:true,nativeOrROOT06FilesChanged:false,targetsCreated:0,PGConnections:0,runtimeCandidateValidation:result.runtimeCandidateValidation}));
