#!/usr/bin/env node
// Source-only validation. No native resolver, database pool, stage call, or publication.
import { openAuthorizedV3Reader } from './authorized-reader.mjs';
if(process.argv.length!==9){console.error('Usage: node authorized-reader-cli.mjs BASE_V2 AMENDMENT EXTERNAL_APPROVAL TRUSTED_APPROVAL_SHA256 OUTGIT_SPOOL_PARENT BATCH_UUID FIXED_NAMESPACE');process.exitCode=2;}
else {
  let reader;
  try {
    const [base,v3Amendment,v3Approval,trustedApprovalSha256,spoolParent,batchId,fixedSourceNamespace]=process.argv.slice(2);
    reader=await openAuthorizedV3Reader({base,v3Amendment,v3Approval,trustedApprovalSha256,spoolParent,batchId,fixedSourceNamespace});
    let rowsReadBack=0;for await(const _ of reader.rows())rowsReadBack++;
    const report={...reader.report,rowsReadBack,spoolReadBackVerified:true,spoolCleaned:true};
    await reader.close();reader=undefined;console.log(JSON.stringify(report,null,2));
  }catch(error){console.error(JSON.stringify({kind:'V3_SOURCE_ROW_READER',importReady:false,noSql:true,error:error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)?error.message:'INPUT_READ_OR_PARSE_FAILURE'}));process.exitCode=1;}
  finally {if(reader)await reader.close();}
}
