import {prepareStreamPlan} from './stream-plan.mjs';
import {
 openReviewedFresh35RetainedCompactZeroHost,prepareFresh35Admin154RetainedImport,
 assertFresh35RetainedOriginalInitializer,
 openReviewedFresh35CompactZeroHost,prepareFresh35Admin154Import,restoreFresh35FinalPreparedImport,
} from './fresh35-host-session.mjs';
import {prepareCliBatchedState,openCliBatchedState,retainedCliBatchedProgram,describeFinalR3InputBinding,FINAL_R3_SOURCE,FINAL_R3_PREPARATION_KEY} from './batched-stream-cli-state.mjs';
import {runBatchedStreamOperation} from './batched-stream-operation.mjs';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {lstat} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {reconcileWholePackage} from './whole-package-reconcile.mjs';
import {sha256,parseStrictJson,decodeUtf8} from '../../packages/application/src/unified-import-contract.ts';

function finalInputBinding(target,inputs){
 const {options,provision,batchBinding}=inputs;
 if(options?.allowSynthetic!==false||requestHash(options.target)!==requestHash(target)
  ||requestHash(options.registration??null)!==requestHash(batchBinding?.registration))throw Error('FINAL_R3_REAL_OPTIONS_REQUIRED');
 return describeFinalR3InputBinding(target,options.initialization_identity,provision,batchBinding);
}
async function finalPlanFile(path){
 if(typeof path!=='string'||resolve(path)!==path)throw Error('FINAL_R3_CANONICAL_PLAN_PATH_REQUIRED');
 const stat=await lstat(path);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||(stat.mode&0o777)!==0o600
  ||stat.uid!==process.getuid?.())throw Error('FINAL_R3_PRIVATE_PLAN_REQUIRED');
}

/** Reuse the PASS index and six approved readers in the genuine host callback.
 * Returns a binding, never mutation authority. The external caller retains the
 * private initializer and plan at its existing private result channel. */
export async function runFinalR3Prepare03(config,sourceRoot,target,inputs,hostOptions,onPrivateInitializer){
 const operationStartedAt=Date.now();
 const working=()=>{if(Date.now()>=operationStartedAt+650000)throw Error('FINAL_R3_PREPARATION_WORK_DEADLINE_EXPIRED')};
 if(inputs.preparationRequestKey!==FINAL_R3_PREPARATION_KEY)throw Error('FINAL_R3_PREPARATION_SCOPE_REQUIRED');
 const inputBinding=finalInputBinding(target,inputs);
 const {summaryBytes,manifestBytes,indexPath,batchPlanPath,options,provision,encodedScrypt}=inputs;
 if(sha256(summaryBytes)!==FINAL_R3_SOURCE.summarySha256||sha256(manifestBytes)!==FINAL_R3_SOURCE.manifestSha256
  ||parseStrictJson(decodeUtf8(manifestBytes)).schema_contract?.source_declarations_sha256!==FINAL_R3_SOURCE.sourceProfileSha256
  ||hostOptions?.sourceProfileSha256!==FINAL_R3_SOURCE.sourceProfileSha256
  ||typeof batchPlanPath!=='string'||resolve(batchPlanPath)!==batchPlanPath
  ||typeof indexPath!=='string'||resolve(indexPath)!==indexPath)throw Error('FINAL_R3_PREPARED_SOURCE_REQUIRED');
 if(onPrivateInitializer!==undefined&&typeof onPrivateInitializer!=='function')throw Error('R3_PRIVATE_INITIALIZER_CONSUMER_INVALID');
 try{await lstat(batchPlanPath);throw Error('FINAL_R3_PLAN_ALREADY_EXISTS_READ_ORIGINAL_RESULT')}catch(error){if(error?.code!=='ENOENT')throw error}
 const summary=JSON.parse(decodeUtf8(summaryBytes));
 if(summary.index_sha256!==FINAL_R3_SOURCE.indexSha256)throw Error('FINAL_R3_INDEX_DIFFERS');
 let plan,batchState,result;
 try{
  result=await openReviewedFresh35CompactZeroHost(config,sourceRoot,target,async admission=>{
   working();
   plan=await prepareStreamPlan(indexPath,summary,manifestBytes,{...options,historicalSalesAdmission:admission});
   working();
   const prepared=await prepareFresh35Admin154Import(plan,indexPath,summary,options.initialization_identity,provision,encodedScrypt,{coalesce:false,batched:true});
   working();
   const originalSteps=prepared.steps;
   prepared.steps={async *[Symbol.asyncIterator](){for await(const step of originalSteps){working();yield step;}working();}};
   batchState=await prepareCliBatchedState(batchPlanPath,prepared,inputs.batchBinding,summary,plan.totals);
   working();
   await finalPlanFile(batchPlanPath);
   const retained=retainedCliBatchedProgram(batchState,encodedScrypt);
   if(requestHash(retained.identity)!==requestHash(prepared.identity)
    ||requestHash(retained.initialize)!==requestHash(prepared.initialize))throw Error('FINAL_R3_PERSISTED_PROGRAM_DIFFERS');
   prepared.steps=retained.steps;prepared.transactionMode='BATCHED_V1';prepared.batchedPlan=batchState;
   if(onPrivateInitializer)await onPrivateInitializer(structuredClone(prepared.initialize));
   return prepared;
  },async()=>{throw Error('FINAL_R3_PREPARATION_WRITER_REFUSED')},
  {...hostOptions,purpose:'FIRST_REAL_BUSINESS_IMPORT',transactionMode:'BATCHED_V1',prepareOnly:true,
   explicitZeroApproval:options.explicitZeroApproval,finalSource:{mode:'PREPARE',inputBinding,operationStartedAt,
    preparationScope:{requestKey:inputs.preparationRequestKey,batchPlanPath},
    preparationAuthorizationSha256:inputs.preparationAuthorizationSha256}});
  return result;
 }finally{
  let failed=false;try{batchState?.close()}catch{failed=true}try{await plan?.dispose()}catch{failed=true}
  if(failed){if(result)result.local_cleanup='FAILED';else throw Error('FINAL_R3_PREPARATION_LOCAL_CLEANUP_FAILED')}
 }
}

/** First writer and explicit committed-root resume both consume the exact
 * prepared database. Neither mode opens the source index or recompiles steps. */
export async function runFinalR3Writer03(config,sourceRoot,target,inputs,hostOptions){
 return runFinalR3Persisted03(config,sourceRoot,target,inputs,hostOptions,false);
}
export async function runFinalR3Readback03(config,sourceRoot,target,inputs,hostOptions){
 return runFinalR3Persisted03(config,sourceRoot,target,inputs,hostOptions,true);
}
async function runFinalR3Persisted03(config,sourceRoot,target,inputs,hostOptions,readback){
 const inputBinding=finalInputBinding(target,inputs),mode=readback||inputs.resume===true?'RESUME':'FIRST_WRITE';
 if(inputs.resume!==undefined&&typeof inputs.resume!=='boolean')throw Error('FINAL_R3_RESUME_MODE_INVALID');
 if(hostOptions?.sourceProfileSha256!==FINAL_R3_SOURCE.sourceProfileSha256)throw Error('FINAL_R3_SOURCE_PROFILE_DIFFERS');
 let state,prepared,result,operationResult;
 try{
  await finalPlanFile(inputs.batchPlanPath);
  state=await openCliBatchedState(inputs.batchPlanPath,inputs.batchBinding);
  result=await openReviewedFresh35CompactZeroHost(config,sourceRoot,target,async admission=>{
   prepared=await restoreFresh35FinalPreparedImport(state,inputs.encodedScrypt,target,admission,inputBinding,inputs.preparedBinding,mode);
   return prepared;
  },async client=>operationResult=readback
   ?await reconcileWholePackage(client,prepared.initialize,inputs.encodedScrypt,state.metadata.context.summary.counts,state.metadata.context.totals)
   :await runBatchedStreamOperation({planPath:inputs.batchPlanPath,identity:prepared.identity,
    preparedPlan:state,openClient:async()=>client,encodedScrypt:inputs.encodedScrypt,borrowedClient:true}),
  {...hostOptions,purpose:'FIRST_REAL_BUSINESS_IMPORT',transactionMode:'BATCHED_V1',prepareOnly:false,
   explicitZeroApproval:inputs.options.explicitZeroApproval,finalSource:{mode,inputBinding,preparedBinding:inputs.preparedBinding}});
  return result;
 }catch(error){
  if(!operationResult)throw error;
  result={result:operationResult,cleanup:'UNKNOWN'};return result;
 }finally{
  try{state?.close()}catch{if(result)result.local_cleanup='FAILED';else throw Error('FINAL_R3_WRITER_LOCAL_CLEANUP_FAILED')}
 }
}

/** Retained original09 index/summary, never a new streamPreflight or batch.
 * The fixed physical host verifies source/catalog/service and issues a fresh
 * same-client admission before the original planner can build an active plan.
 * Original init/plan/step hash checks run before mutation authority and SQL.
 * No connection, authority, credential or input is minted by this function. */
export async function runOriginalR3Writer03(config,sourceRoot,target,privateInputs,hostOptions,onPrivateInitializer){
 if(!hostOptions?.currentService)throw Error('R3_RETAINED_CURRENT_SERVICE_REQUIRED');
 if(onPrivateInitializer!==undefined&&typeof onPrivateInitializer!=='function')throw Error('R3_PRIVATE_INITIALIZER_CONSUMER_INVALID');
 const {indexPath,summary,manifestBytes,options,provision,encodedScrypt}=privateInputs;
 const batchPlanPath=privateInputs.batchPlanPath??join(dirname(indexPath),'batched-plan.sqlite');
 const batchBinding=privateInputs.batchBinding;
 if(!batchBinding||Object.keys(batchBinding).sort().join(',')!=='admin,manifestSha256,registration,sourceOptions,target'
  ||batchBinding.manifestSha256!==summary?.manifest_sha256
  ||requestHash(batchBinding.target)!==requestHash(target)
  ||requestHash(batchBinding.admin)!==requestHash(options.initialization_identity)
  ||requestHash(batchBinding.registration)!==requestHash(options.registration??null)
  ||batchBinding.sourceOptions?.['--target-profile']!=='FRESH35_COMPACT_ZERO_FIRST_IMPORT_V2'
  ||Object.entries(batchBinding.sourceOptions).some(([key,value])=>key!=='--target-profile'
   &&(!(key.endsWith('-approval-sha256')||key==='--historical-line-amount-evidence-sha256'||key==='--current-effective-alignment-sha256')
    ||typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))))throw Error('R3_RETAINED_BATCH_BINDING_REQUIRED');
 if(hostOptions.transactionMode!==undefined&&hostOptions.transactionMode!=='BATCHED_V1')throw Error('R3_RETAINED_BATCHED_MODE_REQUIRED');
 let plan,prepared,result,operationResult,batchState;
 // A retained durable plan belongs to the existing normal --resume route.
 // Do not rebuild source/program over it from this first-writer entry.
 try{await lstat(batchPlanPath);throw Error('R3_RETAINED_BATCH_PLAN_ALREADY_EXISTS')}catch(error){if(error?.code!=='ENOENT')throw error}
 try{
  result=await openReviewedFresh35RetainedCompactZeroHost(config,sourceRoot,target,async admission=>{
   if(prepared)throw Error('R3_RETAINED_PLAN_ALREADY_PREPARED');
   plan=await prepareStreamPlan(indexPath,summary,manifestBytes,{...options,historicalSalesAdmission:admission});
   prepared=await prepareFresh35Admin154RetainedImport(plan,indexPath,summary,options.initialization_identity,provision,encodedScrypt);
   batchState=await prepareCliBatchedState(batchPlanPath,prepared,batchBinding,summary,plan.totals);
   const retained=retainedCliBatchedProgram(batchState,encodedScrypt);
   if(requestHash(retained.identity)!==requestHash(prepared.identity)
    ||requestHash(retained.initialize)!==requestHash(prepared.initialize))throw Error('R3_RETAINED_ORIGINAL_PROGRAM_DIFFERS');
   // Keep the exact factory-registered object. Independent later cursors read
   // the persisted original requests, not the source index/compiler again.
   prepared.steps=retained.steps;
   prepared.transactionMode='BATCHED_V1';prepared.batchedPlan=batchState;
   // Optional existing private channel, never part of the returned/public result.
   // This is the original request, not a commit receipt or execution authority.
   if(onPrivateInitializer)await onPrivateInitializer(structuredClone(prepared.initialize));
   return prepared;
  },async client=>operationResult=await runBatchedStreamOperation({planPath:batchPlanPath,identity:prepared.identity,
   preparedPlan:batchState,openClient:async()=>client,encodedScrypt,borrowedClient:true}),
  {...hostOptions,purpose:'FIRST_REAL_BUSINESS_IMPORT',transactionMode:'BATCHED_V1',prepareOnly:false,explicitZeroApproval:options.explicitZeroApproval});
  return result;
 }catch(error){
  // Same boundary as the existing admin setup runner: a host cleanup failure
  // cannot erase an acknowledged operation outcome or certify connection cleanup.
  if(!operationResult)throw error;
  result={result:operationResult,cleanup:'UNKNOWN'};return result;
 }finally{
  let cleanupFailed=false;
  try{batchState?.close()}catch{cleanupFailed=true}
  try{await plan?.dispose()}catch{cleanupFailed=true}
  if(cleanupFailed){if(result)result.local_cleanup='FAILED';else throw Error('R3_RETAINED_LOCAL_CLEANUP_FAILED')}

 }
}

/** Separate post-COMMITTED original-key readback. The caller's independently
 * admitted current-service exclusive client must permit the existing verify-v2
 * ordinary BEGIN/locks/ROLLBACK sequence. This function grants no live authority.
 * Counts/totals come from the pinned original09 source result, never new rows.
 * It cannot import, publish or COMMIT. */
export async function reconcileOriginalR3Readback20(client,{initialize,encodedScrypt,sourceCounts,sourceTotals}){
 assertFresh35RetainedOriginalInitializer(initialize,encodedScrypt);
 return reconcileWholePackage(client,initialize,encodedScrypt,sourceCounts,sourceTotals);
}
