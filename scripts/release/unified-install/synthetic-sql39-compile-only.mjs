import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {performance} from 'node:perf_hooks';
import {parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';
import {closeExplicitZeroApproval} from '../../../packages/application/src/unified-explicit-zero-approval.ts';
import {readExplicitZeroCliApproval} from '../../../tools/unified-import/explicit-zero-cli-input.mjs';
import {openReviewedFresh35SyntheticSql39PhysicalHost} from '../../../tools/unified-import/whole-host-session.mjs';
import {input,prepareFullSizeSynthetic,withFullSizeSynthetic} from '../../../tools/unified-import/full-size-carrier.mjs';

export async function runCompileOnly(root,workspace,config) {
  const scratch=join(workspace,'pg-private','mixed-smoke-a-scratch');
  if (process.platform!=='linux' || process.getuid()!==61035 || process.geteuid()!==61035 ||
      process.getgid()!==61035 || process.getegid()!==61035 || tmpdir()!==scratch) {
    throw Error('FRESH35_COMPILE_ONLY_ISOLATION_REQUIRED');
  }
  const fixtureDir=join(scratch,'fixture');
  const reportDir=join(scratch,'preflight');
  const start=performance.now();
  await prepareFullSizeSynthetic(fixtureDir);
  const generationMs=performance.now()-start;
  const pkg=join(fixtureDir,'package');
  const manifest=parseStrictJson(await readFile(join(pkg,'manifest.json'),'utf8'));
  const approval=await readExplicitZeroCliApproval(pkg,manifest,
    join(fixtureDir,'approvals/scope/approval.json'),input.scopeSha256);
  try {
    const connected=performance.now();
    const session=await openReviewedFresh35SyntheticSql39PhysicalHost(config,root,workspace,approval,
      (client,admission,target)=>withFullSizeSynthetic({fixtureDir,reportDir,target,client,admission},
        (_client,_program,binding,metrics)=>({binding,metrics})));
    if(session.cleanup!=='CLOSED'||!session.result?.binding||!session.host_verification)
      throw Error('FRESH35_COMPILE_ONLY_CONNECTION_CLOSE_UNCONFIRMED');
    return {state:'SYNTHETIC_SQL39_V2_COMPILED_ONLY',connectionCleanup:session.cleanup,
      hostVerification:session.host_verification,generationMs,hostElapsedMs:performance.now()-connected,
      ...session.result};
  } finally {
    closeExplicitZeroApproval(approval);
  }
}
