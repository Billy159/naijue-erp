import {requestHash} from '../../packages/application/src/request-hash.ts';
import {openBatchedStreamPlan, prepareBatchedStreamPlan} from './batched-stream-plan.mjs';
import {createHash} from 'node:crypto';
import {canonicalRequestValue} from '../../packages/application/src/canonical-request-value.ts';
import {parseStrictJson} from '../../packages/application/src/unified-import-contract.ts';
import {resolve} from 'node:path';
export const FINAL_R3_PREPARATION_KEY='t45-r3-final33-plan-prepare-20261116-01';

// The new source batch is separate from the retained 11/11 original. These
// public source pins never authorize a connection or a database mutation.
export const FINAL_R3_SOURCE=Object.freeze({
  manifestSha256:'7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679',
  sourceProfileSha256:'b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b',
  indexSha256:'b5a6e1449795ccd4eef72de1599335633e2ee55cd076a7a0a920e9c4b063e9dd',
  summarySha256:'6751463c596b0330faf7851c255bf972cbede3cfad6c0fed027e5befd137336d',
});
const finalSourceOptions=Object.freeze({
  '--target-profile':'FRESH35_COMPACT_ZERO_FIRST_IMPORT_V2',
  '--historical-settlement-retention-approval-sha256':'b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05',
  '--historical-line-amount-evidence-sha256':'e6f76ffd32f7d807e433e85bd2228b65281a6dc83ec3205117661bea13fdc710',
  '--historical-hall-approval-sha256':'a2e0893e36dc3260613a0e585c896aac6dd57939da2f7345d77561dcdf5a1a42',
  '--current-effective-alignment-sha256':'5a359f66aa5d6163fbb81dd23039395afdb81c8e30ed31d308dd5418f0d3b9ab',
  '--explicit-zero-approval-sha256':'669c0e4228ee2f7d8929bcc92a1bdf4cea9d491028e518d379818a64a775b566',
  '--staff-hall-approval-sha256':'4dec9cf865099dd8a74564202fddf9ebb37648ade6f6e0e1a55b1fbf45f9bb40',
});
export function describeFinalR3InputBinding(target,admin,provision,binding){
  if(!binding||Object.keys(binding).sort().join(',')!=='admin,manifestSha256,registration,sourceOptions,target'
    ||binding.manifestSha256!==FINAL_R3_SOURCE.manifestSha256
    ||requestHash(binding.target)!==requestHash(target)||requestHash(binding.admin)!==requestHash(admin)
    ||requestHash(binding.sourceOptions)!==requestHash(finalSourceOptions)
    ||requestHash(binding.registration)!==requestHash({batch_id:'9629d837-776e-7f61-4fd4-0cebd4e1a097',
      source_namespace:'naijue:tplus:20261102',source_metadata_sha256:'f9488a2a0e148483fb985a73b177b923daf89b86df0c00179b4756fa097a098c',
      cutoff_at:'2026-11-16T11:40:00+08:00'}))throw Error('FINAL_R3_SOURCE_BINDING_DIFFERS');
  return Object.freeze({...FINAL_R3_SOURCE,batchBindingSha256:requestHash(binding),
    targetSha256:requestHash(target),adminSha256:requestHash(admin),provisionSha256:requestHash(provision)});
}
export function assertFinalR3InputBinding(input){
  if(!input||Object.keys(input).sort().join(',')!=='adminSha256,batchBindingSha256,indexSha256,manifestSha256,provisionSha256,sourceProfileSha256,summarySha256,targetSha256'
    ||!Object.entries(FINAL_R3_SOURCE).every(([key,value])=>input[key]===value)
    ||!Object.values(input).every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)))throw Error('FINAL_R3_INPUT_BINDING_REQUIRED');
}
function assertFinalR3CurrentEvidence(target,inputBinding,currentServiceSha256,postmasterStart,evidence){
  assertFinalR3InputBinding(inputBinding);
  if(requestHash(target)!==inputBinding.targetSha256)throw Error('FINAL_R3_TARGET_DIFFERS');
  if(!/^[a-f0-9]{64}$/.test(currentServiceSha256??'')
    ||typeof postmasterStart!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\+00$/.test(postmasterStart)
    ||!evidence||Object.keys(evidence).sort().join(',')!=='batchedCatalogSpecSha256,batchedDbCandidatePinsSha256,batchedModelSha256,batchedSourceSetSha256,transactionMode'
    ||evidence.transactionMode!=='BATCHED_V1'||!Object.entries(evidence).every(([key,value])=>key==='transactionMode'||typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)))throw Error('FINAL_R3_CURRENT_PREPARATION_EVIDENCE_REQUIRED');
}
export function buildFinalR3PreparationBinding(target,inputBinding,currentServiceSha256,postmasterStart,evidence,preparationScope){
  assertFinalR3CurrentEvidence(target,inputBinding,currentServiceSha256,postmasterStart,evidence);
  if(!preparationScope||Object.keys(preparationScope).sort().join(',')!=='batchPlanPath,requestKey'
    ||preparationScope.requestKey!==FINAL_R3_PREPARATION_KEY||typeof preparationScope.batchPlanPath!=='string'
    ||resolve(preparationScope.batchPlanPath)!==preparationScope.batchPlanPath)throw Error('FINAL_R3_PREPARATION_SCOPE_REQUIRED');
  return Object.freeze({format:'FRESH35_BATCHED_PREPARATION_BINDING_V1',target:structuredClone(target),
    inputBinding:structuredClone(inputBinding),currentServiceSha256,postmasterStart,...evidence,
    preparationScope:structuredClone(preparationScope)});
}
export function buildFinalR3ExecutionBinding(target,inputBinding,preparedBinding,currentServiceSha256,postmasterStart,evidence){
  assertFinalR3CurrentEvidence(target,inputBinding,currentServiceSha256,postmasterStart,evidence);
  if(preparedBinding?.format!=='FRESH35_COMPACT_ZERO_REAL_IMPORT_BINDING_V2'
    ||preparedBinding.manifestSha256!==FINAL_R3_SOURCE.manifestSha256
    ||preparedBinding.finalSourceInputSha256!==requestHash(inputBinding)
    ||Object.hasOwn(preparedBinding,'preparedBindingSha256'))throw Error('FINAL_R3_ORIGINAL_PREPARED_BINDING_REQUIRED');
  return Object.freeze({...structuredClone(preparedBinding),currentServiceSha256,postmasterStart,...evidence,
    preparedBindingSha256:requestHash(preparedBinding)});
}

/** Read the already persisted requests; never invoke a source compiler. The
 * descriptor and complete request hashes become part of the prepared binding. */
export async function describeCliBatchedContents(state,program){
  const identity={...state.metadata.identity,rootOperationId:state.metadata.rootOperationId};
  if(requestHash(state.metadata.identity)!==requestHash(program.identity)
    ||requestHash(state.initialize())!==requestHash(program.initialize)
    ||identity.rootOperationId!==program.initialize.operation_id)throw Error('BATCH_PLAN_INPUT_BINDING_DIFFERS');
  const groups=[],stepsHash=createHash('sha256').update('[');
  let next=0,count=0,previous=null;
  for(const group of state.batches()){
    const {descriptorSha256,...descriptor}=group;
    if(requestHash({identity,descriptor})!==descriptorSha256||group.first!==next||group.ordinal!==groups.length
      ||group.predecessor!==(previous?.subBatchId??null)
      ||group.previousLastOperationId!==(previous?.lastOperationId??null)
      ||group.previousDescriptorSha256!==(previous?.descriptorSha256??null))throw Error('BATCH_PLAN_DESCRIPTOR_DIFFERS');
    const hash=createHash('sha256').update('[');let groupCount=0;
    for await(const step of state.steps(group)){
      if(groupCount)hash.update(',');hash.update(canonicalRequestValue(step));groupCount++;
      if(group.phase==='CORE'){
        if(groups.length!==0||group.first!==0||group.last!==0||step.method!=='initialize'
          ||requestHash(step.request)!==requestHash(program.initialize))throw Error('BATCH_CORE_DESCRIPTOR_REQUIRED');
      }else{if(count)stepsHash.update(',');stepsHash.update(canonicalRequestValue(step));count++;}
    }
    if(groupCount!==group.last-group.first+1)throw Error('BATCH_PLAN_RANGE_INCOMPLETE');
    groups.push({descriptor:group,stepsSha256:hash.update(']').digest('hex')});next=group.last+1;previous=group;
  }
  if(groups[0]?.descriptor.phase!=='CORE'||previous?.phase!=='FINALIZE'
    ||groups.length!==state.metadata.batchCount||next!==state.metadata.stepCount)throw Error('BATCH_PLAN_RANGE_INCOMPLETE');
  return Object.freeze({stepCount:count,stepsSha256:stepsHash.update(']').digest('hex'),
    batchedPlanSha256:requestHash({identity,groups,stepCount:next,context:state.metadata.context})});
}

// No success state is stored here. These are the original public source and
// target bindings needed to resume the retained requests without recompiling.
export async function prepareCliBatchedState(path, program, binding, summary, totals) {
  await prepareBatchedStreamPlan(path, program, {
    bindingSha256: requestHash(binding), summary: {
      counts: summary.counts, manifest_sha256: summary.manifest_sha256,
      schema_declarations_sha256: summary.schema_declarations_sha256,
    }, totals,
  });
  return openCliBatchedState(path, binding);
}

export async function openCliBatchedState(path, binding) {
  const plan = await openBatchedStreamPlan(path);
  try {
    if (plan.metadata.context?.bindingSha256 !== requestHash(binding)
      || plan.metadata.identity.packageSha256 !== binding.manifestSha256) throw Error('BATCH_RESUME_BINDING_INVALID');
    return plan;
  } catch (error) { plan.close(); throw error; }
}

export function retainedCliBatchedProgram(state, encodedScrypt) {
  return {
    identity: structuredClone(state.metadata.identity), initialize: state.initialize(),
    purpose: 'FIRST_REAL_BUSINESS_IMPORT', packageKind: 'REAL', encodedScrypt,
    transactionMode: 'BATCHED_V1',
    steps: {async *[Symbol.asyncIterator]() {
      for (const batch of state.batches()) {
        if (batch.phase === 'CORE') continue;
        yield* state.steps(batch);
      }
    }},
  };
}

const finalNeed=(ok,code)=>{if(!ok)throw Error('FRESH35_HOST_'+code)};
export function assertFinalR3Initializer(prepared,input){
 assertFinalR3InputBinding(input);
 const init=prepared.initialize,id=prepared.identity;
 finalNeed(init?.payload?.mode==='PROVISIONED_ADMIN_EMPTY_BUSINESS'
  &&init.package_manifest_sha256===FINAL_R3_SOURCE.manifestSha256
  &&init.batch_id==='ee6716e0-d983-c718-bff7-98d9f872d116'
  &&init.payload.document_batch_id==='9629d837-776e-7f61-4fd4-0cebd4e1a097'
  &&init.namespace==='naijue:tplus:20261102'&&init.cutoff_at==='2026-11-16T11:40:00+08:00'
  &&init.request_key===init.operation_id&&init.plan_sha256===id?.planSha256
  &&init.batch_id===id.batchId&&init.payload.document_batch_id===id.documentBatchId
  &&init.package_manifest_sha256===id.packageSha256&&init.namespace===id.namespace&&init.cutoff_at===id.cutoffAt
  &&requestHash(init.payload.admin)===input.adminSha256
  &&requestHash({operation_id:init.payload.provision_operation_id,request_sha256:init.payload.provision_request_sha256})===input.provisionSha256,
  'FINAL_SOURCE_INITIALIZER_DIFFERS');
}


/** Pure validation returns requests only, never a registered object or authority. */
export async function verifyFinalR3PersistedProgram(state,encodedScrypt,target,inputBinding,preparedBinding){
  const prepared=retainedCliBatchedProgram(state,encodedScrypt);prepared.batchedPlan=state;
  assertFinalR3Initializer(prepared,inputBinding);
  const contents=await describeCliBatchedContents(state,prepared);
  const id=prepared.identity;
  finalNeed(requestHash(target)===inputBinding.targetSha256
    &&preparedBinding?.finalSourceInputSha256===requestHash(inputBinding)
    &&preparedBinding.initializerSha256===requestHash({initialize:prepared.initialize,encodedScrypt})
    &&preparedBinding.initializerOperationId===prepared.initialize.operation_id
    &&preparedBinding.initializerRequestKey===prepared.initialize.request_key
    &&preparedBinding.manifestSha256===id.packageSha256&&preparedBinding.planSha256===id.planSha256
    &&preparedBinding.baselineBatchId===id.batchId&&preparedBinding.documentBatchId===id.documentBatchId
    &&preparedBinding.sourceNamespace===id.namespace&&preparedBinding.cutoffAt===id.cutoffAt
    &&Object.entries(contents).every(([key,value])=>preparedBinding[key]===value),'FINAL_SOURCE_PERSISTED_PLAN_DIFFERS');
  return prepared;
}

// This checks SQL parameters only. The physical host checks the genuine
// protected authority and same-client context before calling it.
export function checkFinalR3PreparationQuery(phase,sql,values,identity,core){
  if(sql==='ROLLBACK'&&values===undefined)return 0;
  if(phase===0&&sql==='BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY'&&values===undefined)return 1;
  if(phase===1&&sql==='SET LOCAL ROLE erp_unified27_importer_2393dbc6db9581c2'&&values===undefined)return 2;
  if(phase===2&&sql==='SELECT naijue_erp.standard_batched_import_inspect_v1($1::jsonb,$2::jsonb)::text AS result_json'
    &&Array.isArray(values)&&values.length===2&&requestHash(parseStrictJson(values[0]))===requestHash(identity)
    &&requestHash(parseStrictJson(values[1]))===requestHash(core))return 3;
  throw Error('FRESH35_HOST_FINAL_PREPARATION_SQL_REFUSED');
}
