import {requestHash} from '../../../../../T45/revisions/20261115-r3-party-single-projection-carrier-local-01/source/packages/application/src/request-hash.ts';
import {openBatchedStreamPlan, prepareBatchedStreamPlan} from './batched-stream-plan.mjs';

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
