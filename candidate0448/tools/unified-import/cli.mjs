#!/usr/bin/env node
// Public handbook entrypoint; Node 24.21 runs the single shared TypeScript implementation.
if (process.argv[2] === 'stream-verify') {
  try { const result=await (await import('./stream-import-cli.mjs')).runStreamVerify(process.argv.slice(3)); process.stdout.write(JSON.stringify(result)+'\n'); if(result.state==='VERIFICATION_UNKNOWN')process.exitCode=2; else if(result.state==='VERIFIED')process.exitCode=result.connection_cleanup==='CLOSED'&&result.local_cleanup!=='FAILED'?0:3; else if(result.state)process.exitCode=1; }
  catch { process.stdout.write(JSON.stringify({state:'NOT_STARTED',code:'VERIFY_SETUP_FAILED'})+'\n'); process.exitCode=1; }
} else if (process.argv[2] === 'stream-import' || process.argv[2] === 'whole-import') {
  try { const result=await (await import('./stream-import-cli.mjs'))[process.argv[2] === 'whole-import' ? 'runWholeImport' : 'runStreamImport'](process.argv.slice(3)); process.stdout.write(JSON.stringify(result)+'\n'); if(result.state==='PRODUCTION_REAL_IMPORT_PREPARED')process.exitCode=result.connection_cleanup==='CLOSED'&&result.local_cleanup!=='FAILED'&&result.business_database_writes===false&&result.verification?.state==='NOT_RUN'?0:3; else if(result.state==='UNKNOWN')process.exitCode=2; else if(result.state==='ABSENT'||result.state==='COMMITTED_RECEIPT_FOUND')process.exitCode=result.connection_cleanup==='CLOSED'&&result.local_cleanup!=='FAILED'?0:3; else if(result.state==='COMMITTED'||result.state==='ALREADY_COMMITTED'){if(result.verification?.state!=='VERIFIED'||result.connection_cleanup!=='CLOSED'||result.local_cleanup==='FAILED')process.exitCode=3;} else if(result.state)process.exitCode=1; }
  catch(error) { const safe=new Set(['OPTION_REQUIRED','OPTION_INVALID','OPTION_DUPLICATE','EXCLUSIVE_DDL_WINDOW_ACK_REQUIRED','MANIFEST_HASH_INVALID','INPUT_FILE_INVALID','INPUT_FILE_CHANGED','INPUT_FILE_TOO_LARGE']); const code=typeof error?.message==='string'&&safe.has(error.message)?error.message:'IMPORT_SETUP_FAILED'; process.stdout.write(JSON.stringify({state:'NOT_STARTED',code,postgresql_acceptance:'NOT_RUN'})+'\n'); process.exitCode=1; }
} else if (process.argv[2] === 'source-registration') {
  try { const result=await (await import('./stream-prepare-cli.mjs')).runSourceRegistration(process.argv.slice(3)); process.stdout.write(JSON.stringify(result)+'\n'); }
  catch { process.stdout.write(JSON.stringify({code:'SOURCE_REGISTRATION_FAILED',source_truth_verified:false})+'\n'); process.exitCode=1; }
} else if (process.argv[2] === 'stream-prepare') {
  try { const result=await (await import('./stream-prepare-cli.mjs')).runStreamPrepare(process.argv.slice(3)); process.stdout.write(JSON.stringify(result)+'\n'); if(result.state==='OFFLINE_PREPARED')process.exitCode=result.local_cleanup==='FAILED'?3:0; else if(result.state)process.exitCode=1; }
  catch { process.stdout.write(JSON.stringify({code:'STREAM_PREPARE_FAILED',execution_ready:false,business_database_writes:false})+'\n'); process.exitCode=1; }
} else if (process.argv[2] === 'stream-preflight') {
  try { await (await import('./stream-preflight-cli.mjs')).runStreamPreflight(process.argv.slice(3)); }
  catch { process.stdout.write(JSON.stringify({code:'STREAM_PREFLIGHT_FAILED',import_eligible:false,business_database_writes:false})+'\n'); process.exitCode=1; }
} else await import('./cli.ts');
