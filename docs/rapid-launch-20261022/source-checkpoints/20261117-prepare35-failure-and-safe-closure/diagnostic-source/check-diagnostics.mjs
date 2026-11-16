import assert from 'node:assert/strict';
import {AssertionError} from 'node:assert';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {describeFailure,successful} from './final33-run.mjs';
const candidate=await readFile(new URL('./final33-run.mjs',import.meta.url),'utf8');
const original=await readFile(new URL('../../T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL35-NATIVE-SPEC-SUCCESSOR-UNISSUED-01/prepare/bundle/final33-run.mjs',import.meta.url),'utf8');
const success=s=>s.slice(s.indexOf('export function successful('),s.indexOf('\nif(process.argv[1]'));
assert.equal(success(candidate),success(original));
let checks=1;
for(const [error,type]of [[Error('private SQL /secret password'),'Error'],[TypeError('private'),'TypeError'],[RangeError('private'),'RangeError'],[SyntaxError('private'),'SyntaxError'],[new AssertionError({message:'private'}),'AssertionError']]){
 const d=describeFailure(error,'PREPARE_CALL');assert.equal(d.errorType,type);assert.equal(d.stage,'PREPARE_CALL');assert(!JSON.stringify(d).includes('private'));checks++;
}
for(const code of ['EACCES','ENOENT','ERR_MODULE_NOT_FOUND','ERR_OUT_OF_RANGE']){assert.equal(describeFailure(Object.assign(Error('private'),{code}),'PREPARE_CALL').systemCode,code);checks++}
assert.equal(describeFailure(Object.assign(Error('private'),{code:'42501'}),'PREPARE_CALL').sqlstate,'42501');checks++;
let getters=0;const error=Error('private');Object.defineProperty(error,'code',{get(){getters++;throw Error('secret')}});Object.defineProperty(error,'stack',{get(){getters++;throw Error('secret')}});Object.defineProperty(error,'cause',{get(){getters++;throw Error('secret')}});
const d=describeFailure(error,'unknown /secret');assert.equal(getters,0);assert.equal(d.stage,'UNKNOWN');assert.equal(d.systemCode,'UNKNOWN');checks++;
for(const error of [{name:'Error',message:'SECRET',code:'ENOENT'},new Proxy({},{get(){throw Error('secret')}}),Object.assign(Error('PRIVATE_PASSWORD_UPPERCASE'),{code:'PRIVATE_SECRET_CODE'}),new ReferenceError('private')]){
 const d=describeFailure(error,'PREPARE_CALL');assert.equal(d.systemCode,'UNKNOWN');assert.equal(d.guardCode,'UNKNOWN');assert(!JSON.stringify(d).includes('PRIVATE'));checks++;
}
assert.equal(describeFailure(Error('FINAL33_INPUT_CHANGED'),'PREPARE_READERS').guardCode,'FINAL33_INPUT_CHANGED');checks++;
const report={state:'PASS_PURE_FAILURE_DIAGNOSTICS_ONLY',checks,node:process.version,sourceOnly:true,serverActions:0,PGConnections:0,nativeExecuted:false,targetOrCapabilityConstructed:false,authorityIssued:false,sourceSha256:createHash('sha256').update(candidate).digest('hex'),successfulFunctionBytesUnchanged:true,noErrorPropertyGetterEvaluated:true};
await writeFile(new URL('./LOCAL-CHECKS.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
