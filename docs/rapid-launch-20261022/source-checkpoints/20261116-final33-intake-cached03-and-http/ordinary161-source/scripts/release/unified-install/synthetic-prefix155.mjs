// Fixed native child entry. No CLI, connection-string or actor construction.
import {open,readFile,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {performance} from 'node:perf_hooks';
import {parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';
import {closeExplicitZeroApproval} from '../../../packages/application/src/unified-explicit-zero-approval.ts';
import {readExplicitZeroCliApproval} from '../../../tools/unified-import/explicit-zero-cli-input.mjs';
import {openReviewedFresh35SyntheticPrefix155PhysicalHost} from '../../../tools/unified-import/whole-host-session.mjs';
import {createWholePackageSqlKernel} from '../../../tools/unified-import/whole-package-sql-kernel.ts';
import {inspectWholePackage} from '../../../tools/unified-import/whole-package-inspect.ts';
import {input,prepareFullSizeSynthetic,withFullSizeSynthetic} from '../../../tools/unified-import/full-size-carrier.mjs';
import {measurePrefix} from './measure-prefix.mjs';
import {assertTrustedRootPath} from './trusted-install-path.mjs';

async function nativeWindow(workspace) {
  const path=join(workspace,'prefix-work-window.json');
  await assertTrustedRootPath(path);
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const before=await file.stat({bigint:true});
    if(!before.isFile()||before.uid!==0n||before.gid!==0n||before.nlink!==1n||
        (before.mode&0o7777n)!==0o644n||before.size<=0n||before.size>1024n)
      throw Error('PREFIX_NATIVE_WINDOW_REQUIRED');
    const raw=await file.readFile();
    const after=await file.stat({bigint:true}),current=await lstat(path,{bigint:true});
    const identity=s=>[s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].join(':');
    if(identity(before)!==identity(after)||identity(before)!==identity(current))
      throw Error('PREFIX_NATIVE_WINDOW_CHANGED');
    const value=parseStrictJson(raw.toString('utf8'));
    if(Object.keys(value).sort().join(',')!=='format,workUntil'||
        value.format!=='PREFIX_MEASUREMENT_WINDOW_FROM_NATIVE_V1'||
        !Number.isSafeInteger(value.workUntil)||Date.now()>=value.workUntil)
      throw Error('PREFIX_NATIVE_WINDOW_EXPIRED');
    return value.workUntil;
  } finally {await file.close();}
}

export async function runPrefix155(root,workspace,config,encodedScrypt) {
  const scratch=join(workspace,'pg-private','mixed-smoke-a-scratch');
  if(process.platform!=='linux'||process.getuid()!==61035||process.geteuid()!==61035||
      process.getgid()!==61035||process.getegid()!==61035||tmpdir()!==scratch)
    throw Error('PREFIX_NATIVE_ISOLATION_REQUIRED');
  const workUntil=await nativeWindow(workspace);
  const writeUntil=workUntil-55000;
  const fixtureDir=join(scratch,'fixture'),reportDir=join(scratch,'preflight');
  const started=performance.now();
  await prepareFullSizeSynthetic(fixtureDir);
  const generationMs=performance.now()-started;
  const pkg=join(fixtureDir,'package');
  const manifest=parseStrictJson(await readFile(join(pkg,'manifest.json'),'utf8'));
  const approval=await readExplicitZeroCliApproval(pkg,manifest,
    join(fixtureDir,'approvals/scope/approval.json'),input.scopeSha256);
  let original,measurement,compileBinding,compileMetrics;
  const hostStarted=performance.now();
  const host=work=>openReviewedFresh35SyntheticPrefix155PhysicalHost(
    {...config,statement_timeout_ms:40000},root,workspace,approval,work);
  const kernel=()=>createWholePackageSqlKernel(encodedScrypt,{explicitZeroApproval:approval});
  try {
    const writer=await host((client,admission,target)=>
      withFullSizeSynthetic({fixtureDir,reportDir,target,client,admission},
        async(actual,program,binding,metrics)=>{
          compileBinding=binding;compileMetrics=metrics;
          original={identity:program.identity,initialize:program.initialize};
          if(Date.now()>=writeUntil)return {state:'NOT_STARTED',code:'PREFIX_NO_WRITE_BUDGET'};
          measurement=await measurePrefix(actual,program,kernel(),binding,writeUntil);
          return measurement;
        }));
    if(writer.cleanup!=='CLOSED')throw Error('PREFIX_WRITER_CLOSE_UNCONFIRMED');
    if(!measurement)return {state:'PREFIX_NOT_STARTED_NO_WRITE_BUDGET',
      binding:compileBinding,metrics:compileMetrics,generationMs,hostElapsedMs:performance.now()-hostStarted,writerCleanup:writer.cleanup};
    if(Date.now()>=workUntil)return {state:'PREFIX_READBACK_WINDOW_EXHAUSTED',measurement,
      binding:compileBinding,metrics:compileMetrics,generationMs,hostElapsedMs:performance.now()-hostStarted,writerCleanup:writer.cleanup};
    const reader=await host(client=>inspectWholePackage(
      client,original.identity,original.initialize,kernel()));
    return {state:measurement.expectedPrefixRollback&&reader.cleanup==='CLOSED'&&reader.result.state==='ABSENT'
        ?'PREFIX_ROLLED_BACK_AND_ABSENT':'PREFIX_OUTCOME_NOT_VERIFIED',
      measurement,independentReadback:reader.result,readerCleanup:reader.cleanup,
      writerCleanup:writer.cleanup,binding:compileBinding,metrics:compileMetrics,generationMs,hostElapsedMs:performance.now()-hostStarted,
      connectionCleanup:reader.cleanup,businessAcceptanceClaimed:false};
  } finally {closeExplicitZeroApproval(approval);}
}
