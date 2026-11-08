import test from 'node:test';import assert from 'node:assert/strict';
import {markWholeHostFailure,wholeHostFailureDiagnostic,withReviewedWholeSession} from '../tools/unified-import/whole-host-session.mjs';
test('host diagnostics retain only fixed classifications and known relative frames',()=>{
 const e=Object.assign(new TypeError('SECRET password DSN'),{code:'EACCES',detail:'PRIVATE',hint:'PRIVATE'});Object.defineProperty(e,'stack',{value:'TypeError: PRIVATE\n    at check (file:///private/location/scripts/release/unified-install/trusted-install-path.mjs:12:3)'});
 assert.equal(markWholeHostFailure(e,'RECORD_PIN'),e);assert.deepEqual(wholeHostFailureDiagnostic(e),{phase:'RECORD_PIN',reason:'HOST_RECORD_PIN_FAILED',error_class:'TypeError',native_errno:'EACCES',source:{file:'scripts/release/unified-install/trusted-install-path.mjs',line:12,column:3}});
 const replacement=Error('WHOLE_CONNECTION_FAILED');markWholeHostFailure(e,'CONNECT',replacement);markWholeHostFailure(replacement,'CONTEXT');assert.deepEqual(wholeHostFailureDiagnostic(replacement),wholeHostFailureDiagnostic(e));assert.doesNotMatch(JSON.stringify(wholeHostFailureDiagnostic(e)),/PRIVATE|SECRET|password|DSN|private\/location/);
});
test('unknown values, getters and primitive failures never leak or change thrown identity',()=>{
 for(const e of [null,undefined,'PRIVATE',42]){assert.equal(markWholeHostFailure(e,'CONTEXT'),e);assert.equal(wholeHostFailureDiagnostic(e),null)}
 const e={get code(){throw Error('PRIVATE')},get name(){throw Error('PRIVATE')},get stack(){throw Error('PRIVATE')}};assert.equal(markWholeHostFailure(e,'CONTEXT'),e);assert.deepEqual(wholeHostFailureDiagnostic(e),{phase:'CONTEXT',reason:'HOST_CONTEXT_FAILED',error_class:'UnknownError'});
 const other=Object.assign(Error('PRIVATE'),{code:'PRIVATE_SECRET',name:'PRIVATE_CLASS'});markWholeHostFailure(other,'CONNECT');assert.deepEqual(wholeHostFailureDiagnostic(other),{phase:'CONNECT',reason:'HOST_CONNECT_FAILED',error_class:'Error'});assert.equal(wholeHostFailureDiagnostic(Error('unmarked')),null);
});
test('actual session keeps catalog SQLSTATE through successful rollback and physical close',async()=>{
 let state='I',closed=0;const calls=[],error=Object.assign(Error('PRIVATE QUERY'),{code:'42703'}),c={readyForQuery:true,_queryable:true,_ending:false,pipeline:false,_activeQuery:null,_queryQueue:[],_sentQueryQueue:[],on(){},getTransactionStatus(){return state},async query(sql){calls.push(sql);state=sql.startsWith('BEGIN')?'T':'I';return{command:sql.startsWith('BEGIN')?'BEGIN':sql}},async end(){closed++}};
 await assert.rejects(withReviewedWholeSession(c,{}, {},{},()=>{throw Error('WORK_NOT_EXPECTED')},()=>{throw error}),e=>e===error);assert.equal(closed,1);assert.deepEqual(calls,['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','ROLLBACK']);assert.deepEqual(wholeHostFailureDiagnostic(error),{phase:'CATALOG',reason:'HOST_CATALOG_FAILED',error_class:'Error',sqlstate:'42703'});
});
