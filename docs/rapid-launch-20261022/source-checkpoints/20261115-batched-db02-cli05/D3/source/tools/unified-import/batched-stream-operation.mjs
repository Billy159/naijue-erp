import {prepareBatchedStreamPlan, openBatchedStreamPlan} from './batched-stream-plan.mjs';
import {executeBatchedStreamImport} from './batched-stream-client.mjs';
import {createBatchedStreamSqlKernel} from './batched-stream-sql-kernel.mjs';
import {requestHash} from '../../../../../T45/revisions/20261115-r3-party-single-projection-carrier-local-01/source/packages/application/src/request-hash.ts';

// CLI seam after the existing pinned plan/program preparation. A caller
// resumes the retained planPath with the original identity and no program.
// D1 supplies the durable kernel and reviewed connection host. This leaf does
// not import the old whole-package kernel or authorize a database connection.
export async function runBatchedStreamOperation({planPath, identity, program, preparedPlan, openClient, encodedScrypt, borrowedClient = false,
  createKernel = () => createBatchedStreamSqlKernel(encodedScrypt)}) {
  if (preparedPlan && (program || requestHash(preparedPlan.metadata.identity) !== requestHash(identity))) {
    throw Error('BATCH_PLAN_IDENTITY_MISMATCH');
  }
  if (program) await prepareBatchedStreamPlan(planPath, program);
  const plan = preparedPlan ?? await openBatchedStreamPlan(planPath, identity);
  try { return await executeBatchedStreamImport(plan, openClient, createKernel, {borrowedClient}); }
  finally { if (!preparedPlan) plan.close(); }
}
