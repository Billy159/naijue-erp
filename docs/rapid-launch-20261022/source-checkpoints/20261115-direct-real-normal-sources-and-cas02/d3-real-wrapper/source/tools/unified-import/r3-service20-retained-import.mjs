import {prepareStreamPlan} from './stream-plan.mjs';
import {
 openReviewedFresh35RetainedCompactZeroHost,prepareFresh35Admin154RetainedImport,
 assertFresh35RetainedOriginalInitializer,
} from './fresh35-host-session.mjs';
import {prepareCliBatchedState,retainedCliBatchedProgram} from './batched-stream-cli-state.mjs';
import {runBatchedStreamOperation} from './batched-stream-operation.mjs';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {lstat} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {reconcileWholePackage} from './whole-package-reconcile.mjs';

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
