import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from '../20261116-r3-final-source-prepare-01/work/node_modules/typescript/lib/typescript.js';
const here=new URL('./',import.meta.url);
const origin=new URL('../../T45/revisions/20261116-r3-batched161-formal-run-package-local-01/RUNTIME-WINDOW-SUCCESSOR-01/start/bundle/batched161-run.mjs',import.meta.url);
const original=await readFile(origin,'utf8');
if(createHash('sha256').update(original).digest('hex')!=='6c7653bac1aa19e90a05ee8167e59305c906c8bdda6866ef0c562545107fe8f4')throw Error('EXACT_ACTUAL_RUNNER_REQUIRED');
const ast=ts.createSourceFile('original.mjs',original,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),codes=new Set();
function visit(n){if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='need'){
 const code=n.arguments[1];if(!code||!ts.isStringLiteral(code))throw Error('FIXED_GUARD_LITERAL_REQUIRED');codes.add('DB05_COMMAND_'+code.text);
}ts.forEachChild(n,visit)}visit(ast);
codes.add('DB05_COMMAND_PREFLIGHT_REFUSED');
const telemetry=`
// Closed observations for the existing start_owned_describe parser only.
const describeStages=Object.freeze(['IMPORT_BEGIN','IMPORT_END','TRUST_BEGIN','TRUST_END','SOURCE_LOAD_BEGIN','SOURCE_LOAD_END','TARGET_BEGIN','TARGET_END','COMPILE_BEGIN','COMPILE_END']);
const describeErrorTypes=new Set(['Error','TypeError','ReferenceError','SyntaxError','RangeError','AssertionError','AggregateError','OTHER']);
const describeSystemCodes=new Set(['ERR_ASSERTION','ERR_INVALID_ARG_TYPE','ERR_INVALID_ARG_VALUE','ENOENT','EACCES','EPERM','ENOTDIR','ELOOP','EMFILE','ENFILE','OTHER']);
const describeGuardCodes=new Set(['FRESH35_COMBINED_CATALOG_BASE_MODEL_CORE_DIFFERS','FRESH35_COMBINED_CURRENT_SOURCE_CHANGED']);
const describeSafeCodes=new Set(${JSON.stringify([...codes].sort())});
const describeStartedAt=process.hrtime.bigint();
function describeStage(stage,describe){
 if(!describe||!describeStages.includes(stage))return;
 const elapsedMilliseconds=Number((process.hrtime.bigint()-describeStartedAt)/1000000n);
 try{process.stderr.write('T45_DESCRIBE_STAGE '+JSON.stringify({stage,elapsedMilliseconds})+'\\n')}catch{/* Observations never replace a validation result. */}
}
function describeOwnData(error,key){
 if(error===null||(typeof error!=='object'&&typeof error!=='function')||types.isProxy(error))return undefined;
 try{const d=Object.getOwnPropertyDescriptor(error,key);return d&&Object.hasOwn(d,'value')?d.value:undefined}catch{return undefined}
}
function describeErrorType(error){
 try{
  for(let value=error,depth=0;value!==null&&(typeof value==='object'||typeof value==='function')&&depth<4;value=Object.getPrototypeOf(value),depth++){
   if(types.isProxy(value))return 'OTHER';
   const name=describeOwnData(value,'name');
   if(typeof name==='string')return describeErrorTypes.has(name)?name:'OTHER';
  }
 }catch{/* No arbitrary getters or error text are serialized. */}
 return 'OTHER';
}
function describePreflightFailure(error){
 const message=describeOwnData(error,'message'),code=describeOwnData(error,'code');
 const guard=typeof message==='string'?message.split(':',1)[0]:null;
 return {requestKey:REQUEST,state:'UNKNOWN',
  safeCode:describeSafeCodes.has(message)?message:'DB05_COMMAND_PREFLIGHT_REFUSED',
  connectionCleanup:'NOT_OPENED',automaticReplay:false,
  errorType:describeErrorType(error),
  systemCode:typeof code==='string'?(describeSystemCodes.has(code)?code:'OTHER'):null,
  guardCode:describeGuardCodes.has(guard)?guard:null};
}
`;
let s=original.replace("import {isDeepStrictEqual as equal} from 'node:util';","import {isDeepStrictEqual as equal,types} from 'node:util';");
s=s.replace("const REQUEST=",telemetry+"\nconst REQUEST=");
const edits=[
 [" const [sources,targets,catalogs,trust,publication]=await Promise.all(["," describeStage('IMPORT_BEGIN',describe);\n const [sources,targets,catalogs,trust,publication]=await Promise.all(["],
 [" await trust.assertTrustedRootPath(process.execPath);await trust.assertTrustedRootTree(OPERATOR);"," describeStage('IMPORT_END',describe);\n describeStage('TRUST_BEGIN',describe);\n await trust.assertTrustedRootPath(process.execPath);await trust.assertTrustedRootTree(OPERATOR);\n describeStage('TRUST_END',describe);"],
 [" const paths=await sources.resolveFresh35ReferenceInputPaths("," describeStage('SOURCE_LOAD_BEGIN',describe);\n const paths=await sources.resolveFresh35ReferenceInputPaths("],
 [" const target=await targets.loadFresh35Installed154UpgradeTargetV1("," describeStage('SOURCE_LOAD_END',describe);\n describeStage('TARGET_BEGIN',describe);\n const target=await targets.loadFresh35Installed154UpgradeTargetV1("],
 [" const base=await catalogs.buildFresh35CompactZeroCatalog(source,metadataTarget,paths);"," describeStage('TARGET_END',describe);\n describeStage('COMPILE_BEGIN',describe);\n const base=await catalogs.buildFresh35CompactZeroCatalog(source,metadataTarget,paths);"],
 [" d.programSha256=sha(JSON.stringify(d));"," d.programSha256=sha(JSON.stringify(d));\n describeStage('COMPILE_END',describe);"],
 ];
for(const [before,after]of edits){if(s.split(before).length!==2)throw Error('ONE_EXACT_OBSERVATION_SITE_REQUIRED');s=s.replace(before,after)}
const before=" process.stdout.write(JSON.stringify({requestKey:REQUEST,state:'UNKNOWN',\n  safeCode:/^DB05_COMMAND_[A-Z0-9_]{1,120}$/.test(error?.message??'')?error.message:'DB05_COMMAND_PREFLIGHT_REFUSED',\n  connectionCleanup:'NOT_OPENED',automaticReplay:false})+'\\n');";
if(s.split(before).length!==2)throw Error('EXACT_PREFLIGHT_CATCH_REQUIRED');s=s.replace(before," process.stdout.write(JSON.stringify(describePreflightFailure(error))+'\\n');");
await writeFile(new URL('source/batched161-run.mjs',here),s);
console.log(JSON.stringify({state:'OBSERVABILITY_SOURCE_GENERATED_NOT_EXECUTED',baseSha256:createHash('sha256').update(original).digest('hex'),candidateSha256:createHash('sha256').update(s).digest('hex'),candidateBytes:Buffer.byteLength(s),closedEntrySafeCodes:codes.size}));
