import {prepareBatchedStreamPlan, openBatchedStreamPlan} from './batched-stream-plan.mjs';
import {executeBatchedStreamImport} from './batched-stream-client.mjs';
import {createBatchedStreamSqlKernel} from './batched-stream-sql-kernel.mjs';

// CLI seam after the existing pinned plan/program preparation. A caller
// resumes the retained planPath with the original identity and no program.
// D1 supplies the durable kernel and reviewed connection host. This leaf does
// not import the old whole-package kernel or authorize a database connection.
export async function runBatchedStreamOperation({planPath, identity, program, openClient, encodedScrypt, borrowedClient = false,
  createKernel = () => createBatchedStreamSqlKernel(encodedScrypt)}) {
  if (program) await prepareBatchedStreamPlan(planPath, program);
  const plan = await openBatchedStreamPlan(planPath, identity);
  try { return await executeBatchedStreamImport(plan, openClient, createKernel, {borrowedClient}); }
  finally { plan.close(); }
}
