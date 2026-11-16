// Stage inside scripts/release/unified-install, within the original same-client callback.
import {performance} from 'node:perf_hooks';
import {executeWholePackage,describeWholePackageFailure} from '../../../tools/unified-import/whole-package-client.ts';
import {requestHash} from '../../../packages/application/src/request-hash.ts';

export async function* limitedSteps(steps,until,progress) {
  const iterator=steps[Symbol.asyncIterator]();
  try {
    for(let ordinal=1;ordinal<=512;ordinal++) {
      if(Date.now()>=until) {progress.stopReason='TIME_BUDGET';return;}
      const next=await iterator.next();
      if(next.done) {progress.stopReason='SOURCE_EXHAUSTED';return;}
      if(Date.now()>=until) {progress.stopReason='TIME_BUDGET';return;}
      if(next.value.method==='publish'&&next.value.request.payload.phase!=='BASELINE')
        throw Error('PREFIX_FINAL_PUBLISH_FORBIDDEN');
      yield next.value;
    }
    progress.stopReason='PREFIX_LIMIT';
  } finally {
    if(typeof iterator.return==='function') await iterator.return();
  }
}

export async function measurePrefix(client,program,kernel,binding,until) {
  if(binding.packageSha256!=='7d403ffcf72a5e1d849004ed97df624850e525dff09bebfa777633a69633deab'||
      binding.stepCount!==44682||!Number.isSafeInteger(until)||Date.now()>=until)
    throw Error('PREFIX_BINDING_OR_WINDOW_REQUIRED');
  const started=performance.now();
  const acknowledgements=[];
  let currentAttempt=null;
  const progress={stopReason:null};
  const measured=Object.freeze({
    async lockAndInspect(actual,identity,initialize) {
      const existing=await kernel.lockAndInspect(actual,identity,initialize);
      if(existing.state!=='ABSENT') throw Error('PREFIX_REQUIRES_ABSENT_ORIGINAL');
      return existing;
    },
    async initialize(actual,identity,request) {
      const before=performance.now();
      await kernel.initialize(actual,identity,request);
      acknowledgements.push({stage:'INITIALIZE',elapsedMs:performance.now()-before,
        requestSha256:binding.initializeRequestSha256,wireBytes:binding.initializeWireBytes});
    },
    async applyStep(actual,step,ordinal) {
      const before=performance.now();
      const payload=step.request.payload;
      const metadata={stage:step.method,phase:payload.phase??payload.mode??null,ordinal,
        requestSha256:requestHash(step.request),wireBytes:Buffer.byteLength(JSON.stringify(step.request)),
        rows:Array.isArray(payload.rows)?payload.rows.length:null};
      currentAttempt=Object.freeze({state:'ATTEMPT',stage:'STEP',kind:metadata.stage??null,
        ordinal:metadata.ordinal??null,rowCount:metadata.rows,
        wireBytes:metadata.wireBytes,requestSha256:metadata.requestSha256});
      await kernel.applyStep(actual,step,ordinal);
      acknowledgements.push({...metadata,rows:metadata.rows??0,elapsedMs:performance.now()-before});
      currentAttempt=null;
    },
    async summarize() {throw Error('PREFIX_FINISH_FORBIDDEN');},
  });
  const result=await executeWholePackage(client,program.identity,program.initialize,
    limitedSteps(program.steps,until,progress),measured);
  const failure=describeWholePackageFailure(result);
  return {state:result.state,code:'code' in result?result.code:null,failure,
    expectedPrefixRollback:result.state==='ROLLED_BACK'&&result.code==='PUBLISH_INCOMPLETE'&&
      ['PREFIX_LIMIT','TIME_BUDGET'].includes(progress.stopReason),
    acknowledgedSteps:acknowledgements.filter(row=>row.ordinal!==undefined).length,
    acknowledgements,currentAttempt,stopReason:progress.stopReason,elapsedMs:performance.now()-started,
    requiresIndependentAbsenceCheck:true};
}
