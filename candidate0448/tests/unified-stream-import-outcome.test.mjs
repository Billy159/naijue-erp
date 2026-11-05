import test from'node:test';import assert from'node:assert/strict';import{readFile,mkdtemp,writeFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join,resolve}from'node:path';import{pathToFileURL}from'node:url';
const root=resolve('.'),source=await readFile(join(root,'tools/unified-import/stream-import-cli.mjs'),'utf8'),stub=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
async function moduleFor(redact,postCommitFailure=false,hostFailure=false,verifyFailure=false,importState='COMMITTED',verificationState){let s=source.replace("const root=fileURLToPath(new URL('../../',import.meta.url));","const root='/synthetic';");const replace=(path,value)=>{s=s.replaceAll(path,value)};replace('./historical-settlement-retention-cli-input.mjs',pathToFileURL(resolve('tools/unified-import/historical-settlement-retention-cli-input.mjs')).href);for(const path of ['./fresh35-host-session.mjs','../../scripts/release/unified-install/fresh35-combined-record-v1.mjs','./historical-line-amount-cli-input.mjs','./historical-hall-cli-input.mjs','./current-effective-alignment-cli-input.mjs','./source-reconciliation-cli-input.mjs'])replace(path,pathToFileURL(resolve('tools/unified-import',path)).href);for(const path of ['../../packages/application/src/unified-import-contract.ts','../../packages/authentication/src/passwords.ts'])replace(path,pathToFileURL(resolve('tools/unified-import',path)).href);replace('./stream-preflight.mjs',stub("export async function streamPreflight(){return{checks_passed:true,complete_package_validation:true,manifest_sha256:'a'.repeat(64),counts:{synthetic_source_count:987654321}}}"));replace('./stream-plan.mjs',stub("export async function prepareStreamPlan(){return{totals:{synthetic_source_amount:'123456.78'},async dispose(){throw Error('cleanup failed')}}}"));replace('./stream-program.mjs',stub("export async function buildStreamProgram(){return{identity:{planSha256:'b'.repeat(64)},initialize:{},steps:{}}}"));replace('./whole-package-host.mjs',stub(hostFailure?"export async function openReviewedWholeHost(){throw Error('SYNTHETICSECRET')}":postCommitFailure?"export async function openReviewedWholeHost(c,r,t,work){await work({});throw Error('post commit host failed')}":"export async function openReviewedWholeHost(c,r,t,work){return{result:await work({}),cleanup:'CLOSED'}}"));const reconciliation=stub(`export const calls=[]; export async function reconcileWholePackage(client,initialize,encoded,counts,totals){calls.push({initialize,counts,totals});if(counts?.synthetic_source_count!==987654321||totals?.synthetic_source_amount!=='123456.78')throw Error('SOURCE_FACTS_NOT_FORWARDED');return ${JSON.stringify(verifyFailure?{state:'VERIFICATION_FAILED',code:'VERIFY_SOURCE_TOTAL_MISMATCH',field:'sales_net_due'}:{state:verificationState??'VERIFIED'})}}`);replace('./whole-package-reconcile.mjs',reconciliation);replace('./whole-sales-host.mjs',pathToFileURL(resolve('tools/unified-import/whole-sales-host.mjs')).href);replace('./whole-package-inspect.ts',stub("export async function inspectWholePackage(){return{state:'ABSENT'}}"));replace('./whole-package-client.ts',stub(`export async function executeWholePackage(){return{state:${JSON.stringify(importState)},summary:{ok:true}}}`));replace('./whole-package-sql-kernel.ts',stub("export function createWholePackageSqlKernel(){return{}}"));replace('./whole-package-verify.ts',stub("export async function verifyWholePackageAfterCommit(){return{state:'VERIFICATION_FAILED'}}"));replace('./execution-client.ts',stub(`export function assertPublicValuesExcludePrivateInputs(){${redact?"throw Error('secret')":''}}`));const spy=await import(reconciliation);spy.calls.length=0;return {...await import('data:text/javascript;base64,'+Buffer.from(s).toString('base64')),reconciliationCalls:spy.calls}}
test('acknowledged commit survives failed readback, redaction and scratch cleanup',async()=>{const d=await mkdtemp(join(tmpdir(),'import-outcome-'));try{const pkg=join(d,'pkg');await (await import('node:fs/promises')).mkdir(pkg);await writeFile(join(pkg,'manifest.json'),'{}');for(const [name,value]of [['target','{}'],['admin','{}'],['connection',JSON.stringify({password:'synthetic-secret'})],['scrypt','naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128)]])await writeFile(join(d,name),value,{mode:0o600});const args=['--package',pkg,'--report',join(d,'report'),'--manifest-sha256','a'.repeat(64),'--target',join(d,'target'),'--admin',join(d,'admin'),'--connection',join(d,'connection'),'--scrypt-file',join(d,'scrypt'),'--ack-exclusive-ddl-window'];const mismatch=await (await moduleFor(false,false,false,true)).runStreamVerify(args);assert.equal(mismatch.state,'VERIFICATION_FAILED');assert.equal(mismatch.field,'sales_net_due');assert.equal(mismatch.source_counts,undefined);assert.equal(mismatch.source_totals,undefined);assert.doesNotMatch(JSON.stringify(mismatch),/987654321|123456|synthetic_source/);const verified=await (await moduleFor(false)).runStreamVerify(args);assert.equal(verified.state,'VERIFIED');assert.equal(verified.local_cleanup,'FAILED');const vr=await (await moduleFor(true)).runStreamVerify(args);assert.equal(vr.state,'VERIFICATION_UNKNOWN');const vl=await (await moduleFor(false,true)).runStreamVerify(args);assert.equal(vl.state,'VERIFICATION_UNKNOWN');const vf=await (await moduleFor(false,false,true)).runStreamVerify(args);assert.equal(vf.state,'NOT_STARTED');assert.equal(vf.code,'VERIFY_FAILED');await assert.rejects((await moduleFor(false)).runStreamVerify([...args,'--inspect-only']),/OPTION_INVALID/);const normal=await (await moduleFor(false,false,false,true)).runStreamImport(args);assert.equal(normal.state,'COMMITTED');assert.equal(normal.verification.state,'VERIFICATION_FAILED');assert.equal(normal.local_cleanup,'FAILED');const redacted=await (await moduleFor(true)).runStreamImport(args);assert.equal(redacted.state,'COMMITTED');assert.equal(redacted.summary_redacted,true);assert.equal(redacted.verification.state,'REDACTED');assert.equal(redacted.local_cleanup,'FAILED');assert.equal(JSON.stringify(redacted).includes('synthetic-secret'),false);const late=await (await moduleFor(false,true)).runStreamImport(args);assert.equal(late.state,'COMMITTED');assert.equal(late.verification.state,'VERIFICATION_UNKNOWN');assert.equal(late.connection_cleanup,'FAILED');assert.equal(late.local_cleanup,'FAILED');const failed=await (await moduleFor(false,false,true)).runStreamImport(args);assert.equal(failed.state,'NOT_STARTED');assert.equal(failed.code,'IMPORT_FAILED');assert.equal(JSON.stringify(failed).includes('SYNTHETICSECRET'),false)}finally{await rm(d,{recursive:true,force:true})}});
test('committed and already committed imports run independently bound source reconciliation',async()=>{
 const d=await mkdtemp(join(tmpdir(),'import-reconcile-wiring-'));
 try{
  const pkg=join(d,'pkg');await (await import('node:fs/promises')).mkdir(pkg);
  await writeFile(join(pkg,'manifest.json'),'{}');
  for(const [name,value]of [['target','{}'],['admin','{}'],['connection',JSON.stringify({password:'synthetic-secret'})],['scrypt','naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128)]])await writeFile(join(d,name),value,{mode:0o600});
  const args=['--package',pkg,'--report',join(d,'report'),'--manifest-sha256','a'.repeat(64),'--target',join(d,'target'),'--admin',join(d,'admin'),'--connection',join(d,'connection'),'--scrypt-file',join(d,'scrypt'),'--ack-exclusive-ddl-window'];
  const inspectModule=await moduleFor(false);const inspected=await inspectModule.runStreamImport([...args,'--inspect-only']);assert.equal(inspectModule.reconciliationCalls.length,0);
  assert.equal(inspected.state,'ABSENT');assert.equal(inspected.verification.state,'NOT_RUN');
  const failedModule=await moduleFor(false,false,false,false,'ROLLED_BACK');const failed=await failedModule.runStreamImport(args);assert.equal(failedModule.reconciliationCalls.length,0);
  assert.equal(failed.state,'ROLLED_BACK');assert.equal(failed.verification.state,'NOT_RUN');
  const redactedRollbackModule=await moduleFor(true,false,false,false,'ROLLED_BACK');
  const redactedRollback=await redactedRollbackModule.runStreamImport(args);
  assert.equal(redactedRollback.state,'ROLLED_BACK');assert.equal(redactedRollback.summary_redacted,true);
  assert.equal(redactedRollback.code,'PUBLIC_OUTPUT_REDACTED');assert.equal(redactedRollback.verification.state,'NOT_RUN');
  assert.equal(redactedRollback.connection_cleanup,'CLOSED');assert.equal(redactedRollback.local_cleanup,'FAILED');
  assert.equal(redactedRollbackModule.reconciliationCalls.length,0);
  const lateRollbackModule=await moduleFor(false,true,false,false,'ROLLED_BACK');
  const lateRollback=await lateRollbackModule.runStreamImport(args);
  assert.equal(lateRollback.state,'ROLLED_BACK');assert.equal(lateRollback.code,'POST_ROLLBACK_HOST_FAILURE');
  assert.equal(lateRollback.verification.state,'NOT_RUN');assert.equal(lateRollback.connection_cleanup,'FAILED');
  assert.equal(lateRollback.local_cleanup,'FAILED');assert.equal(lateRollbackModule.reconciliationCalls.length,0);
  for(const [redact,late]of [[false,false],[true,false],[false,true]]){
   const uncertain=await(await moduleFor(redact,late,false,false,'UNKNOWN')).runStreamImport(args);
   assert.equal(uncertain.state,'UNKNOWN');
  }
  for(const importState of ['COMMITTED','ALREADY_COMMITTED']){
   const successModule=await moduleFor(false,false,false,false,importState);
   const success=await successModule.runStreamImport(args);assert.equal(successModule.reconciliationCalls.length,1);
   const unknown=await(await moduleFor(false,false,false,false,importState,'VERIFICATION_UNKNOWN')).runStreamImport(args);
   assert.equal(unknown.state,importState);assert.equal(unknown.verification.state,'VERIFICATION_UNKNOWN');
   const redacted=await(await moduleFor(true,false,false,false,importState)).runStreamImport(args);
   assert.equal(redacted.state,importState);assert.equal(redacted.summary_redacted,true);assert.equal(redacted.verification.state,'REDACTED');
   const late=await(await moduleFor(false,true,false,false,importState)).runStreamImport(args);
   assert.equal(late.state,importState);assert.equal(late.verification.state,'VERIFICATION_UNKNOWN');assert.equal(late.code,'POST_COMMIT_HOST_FAILURE');

   assert.equal(success.state,importState);assert.equal(success.verification.state,'VERIFIED');
   const mismatch=await(await moduleFor(false,false,false,true,importState)).runStreamImport(args);
   assert.equal(mismatch.state,importState);assert.equal(mismatch.verification.state,'VERIFICATION_FAILED');
   assert.equal(mismatch.verification.code,'VERIFY_SOURCE_TOTAL_MISMATCH');assert.equal(mismatch.verification.field,'sales_net_due');
  }
 }finally{await rm(d,{recursive:true,force:true})}
});
test('real synthetic preflight and planner feed exact source facts into reconciliation',async()=>{
 const {writeSyntheticPackage}=await import('./fixtures/unified-import/synthetic-package.ts');
 const {streamPreflight}=await import('../tools/unified-import/stream-preflight.mjs');
 const {prepareStreamPlan}=await import('../tools/unified-import/stream-plan.mjs');
 const {buildStreamProgram}=await import('../tools/unified-import/stream-program.mjs');
 const {compareWholePackageSource}=await import('../tools/unified-import/whole-package-reconcile.mjs');
 const {STANDARD_MASTER_TABLES}=await import('../packages/application/src/unified-import-execution.ts');
 const {stableImportId}=await import('../packages/application/src/inventory-cutoff-import.ts');
 const {sha256}=await import('../packages/application/src/unified-import-contract.ts');
 const d=await mkdtemp(join(tmpdir(),'offline-source-reconcile-'));let plan;
 try{
  const pkg=join(d,'pkg'),report=join(d,'report');await writeSyntheticPackage(pkg);
  const bytes=await readFile(join(pkg,'manifest.json'));
  const summary=await streamPreflight(pkg,report,{expectedManifestSha256:sha256(bytes),allowSynthetic:true});
  assert.equal(summary.checks_passed,true);assert.equal(summary.complete_package_validation,true);
  const admin={staff_id:stableImportId('SYNTHETIC_RECONCILE','staff'),account_id:stableImportId('SYNTHETIC_RECONCILE','account'),login_name:'synthetic-reconcile',staff_name:'SYNTHETIC reconciliation ADMIN'};
  const target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_offline_reconciliation',catalog_sha256:'a'.repeat(64)};
  plan=await prepareStreamPlan(join(report,'index.sqlite'),summary,bytes,{target,initialization_identity:admin,allowSynthetic:true});
  const program=await buildStreamProgram(plan,join(report,'index.sqlite'),summary,admin);
  // Independent expected values are pinned to the existing synthetic fixture,
  // not copied from plan.totals or inferred from a verifier's declarations.
  assert.deepEqual(plan.totals,{sales_net_due_cents:'1600',sales_quantity:'16',sales_line_amount_cents:'1600',transfer_quantity:'2',inventory_quantity:'100',settlement_amount_cents:'1600'});
  assert.equal(summary.counts.inventory_baseline,2);assert.equal(summary.counts.sales_settlement,16);
  const value={verified:true,verification_profile:'STANDARD_WHOLE_PACKAGE_VERIFY_V2',protocol:'STANDARD_IMPORT_SQL_V1',plan_sha256:program.initialize.plan_sha256,baseline_batch_id:program.initialize.batch_id,batch_id:program.initialize.payload.document_batch_id,scope:'CURRENT_NATIVE_AND_IMMUTABLE_IMPORT_PROOF_FENCED',unknown_keys_materialized:false,
   source_counts:{...Object.fromEntries([...STANDARD_MASTER_TABLES,'sales_header','sales_line','sales_settlement','transfer_header','transfer_line'].map(t=>[t.toUpperCase(),summary.counts[t]])),INVENTORY_KEY:2,IMPORT_BATCH:3},
   source_totals:{inventory_quantity:'100',sales_quantity:'16',sales_line_amount:'16.00',sales_net_due:'16.00',sales_settlement_amount:'16.00',transfer_quantity:'2'},
   current_totals:{inventory_quantity:'100',sales_quantity:'16',sales_line_amount:'16.00',sales_net_due:'16.00',sales_settlement_amount:'16.00',transfer_quantity:'2'},
   document_summary:{verified_count:2,changed_after_import_count:0},inventory_summary:{verified_key_count:2},inventory_coverage:{scope:'EXPLICIT_SOURCE_KEYS_PLUS_VERIFIED_POST_CUTOFF_EFFECT_KEYS',explicit_source_keys:2,explicit_zero_keys:1,post_cutoff_effect_keys:0,unknown_combinations_not_enumerated:true,complete_total_inventory:false}};
  assert.doesNotThrow(()=>compareWholePackageSource(value,program.initialize,summary.counts,plan.totals));
  for(const field of Object.keys(value.source_totals)){
   const changed=structuredClone(value);changed.source_totals[field]='0';
   assert.throws(()=>compareWholePackageSource(changed,program.initialize,summary.counts,plan.totals),e=>e.message==='VERIFY_SOURCE_TOTAL_MISMATCH'&&e.field===field);
  }
  const changed=structuredClone(value);changed.source_counts.SALES_SETTLEMENT=15;
  assert.throws(()=>compareWholePackageSource(changed,program.initialize,summary.counts,plan.totals),e=>e.message==='VERIFY_SOURCE_COUNT_MISMATCH'&&e.field==='SALES_SETTLEMENT');
 }finally{await plan?.dispose();await rm(d,{recursive:true,force:true})}
});
