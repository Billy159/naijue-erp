import test from'node:test';import assert from'node:assert/strict';import{readFile,mkdtemp,writeFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join,resolve}from'node:path';import{pathToFileURL}from'node:url';
const root=resolve('.'),source=await readFile(join(root,'tools/unified-import/stream-import-cli.mjs'),'utf8'),stub=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
async function moduleFor(redact,postCommitFailure=false,hostFailure=false,verifyFailure=false,importState='COMMITTED',verificationState,programFailure){let s=source.replace("const root=fileURLToPath(new URL('../../',import.meta.url));","const root='/synthetic';");const replace=(path,value)=>{s=s.replaceAll(path,value)};replace('./historical-settlement-retention-cli-input.mjs',pathToFileURL(resolve('tools/unified-import/historical-settlement-retention-cli-input.mjs')).href);for(const path of ['../../scripts/release/unified-install/fresh35-retained-backends-v1.mjs','./fresh35-host-session.mjs','../../scripts/release/unified-install/fresh35-combined-record-v1.mjs','./historical-line-amount-cli-input.mjs','./historical-hall-cli-input.mjs','./current-effective-alignment-cli-input.mjs','./source-reconciliation-cli-input.mjs'])replace(path,pathToFileURL(resolve('tools/unified-import',path)).href);for(const path of ['../../packages/application/src/unified-import-contract.ts','../../packages/authentication/src/passwords.ts'])replace(path,pathToFileURL(resolve('tools/unified-import',path)).href);replace('./stream-preflight.mjs',stub("export function streamPreflightFailureDiagnostic(){return null}export async function streamPreflight(){return{checks_passed:true,complete_package_validation:true,manifest_sha256:'a'.repeat(64),counts:{synthetic_source_count:987654321}}}"));replace('./stream-plan.mjs',stub("export async function prepareStreamPlan(){return{totals:{synthetic_source_amount:'123456.78'},async dispose(){throw Error('cleanup failed')}}}"));replace('./stream-program.mjs',stub(programFailure?`export async function buildStreamProgram(){throw Error(${JSON.stringify(programFailure)})}`:"export async function buildStreamProgram(){return{identity:{planSha256:'b'.repeat(64)},initialize:{},steps:{}}}"));replace('./whole-package-host.mjs',stub(hostFailure?"export async function openReviewedWholeHost(){throw Error('SYNTHETICSECRET')}":postCommitFailure?"export async function openReviewedWholeHost(c,r,t,work){await work({});throw Error('post commit host failed')}":"export async function openReviewedWholeHost(c,r,t,work){return{result:await work({}),cleanup:'CLOSED'}}"));const reconciliation=stub(`export const calls=[]; export async function reconcileWholePackage(client,initialize,encoded,counts,totals){calls.push({initialize,counts,totals});if(counts?.synthetic_source_count!==987654321||totals?.synthetic_source_amount!=='123456.78')throw Error('SOURCE_FACTS_NOT_FORWARDED');return ${JSON.stringify(verifyFailure?{state:'VERIFICATION_FAILED',code:'VERIFY_SOURCE_TOTAL_MISMATCH',field:'sales_net_due'}:{state:verificationState??'VERIFIED'})}}`);replace('./whole-package-reconcile.mjs',reconciliation);replace('./whole-sales-host.mjs',pathToFileURL(resolve('tools/unified-import/whole-sales-host.mjs')).href);replace('./whole-package-inspect.ts',stub("export async function inspectWholePackage(){return{state:'ABSENT'}}"));replace('./whole-package-client.ts',stub(`export async function executeWholePackage(){return{state:${JSON.stringify(importState)},summary:{ok:true}}}`));replace('./whole-package-sql-kernel.ts',stub("export function createWholePackageSqlKernel(){return{}}"));replace('./whole-package-verify.ts',stub("export async function verifyWholePackageAfterCommit(){return{state:'VERIFICATION_FAILED'}}"));replace('./execution-client.ts',stub(`export function assertPublicValuesExcludePrivateInputs(){${redact?"throw Error('secret')":''}}`));const spy=await import(reconciliation);spy.calls.length=0;return {...await import('data:text/javascript;base64,'+Buffer.from(s).toString('base64')),reconciliationCalls:spy.calls}}
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

let realModelSerial=0;
async function productionCliModel(mode='COMMITTED'){
 const stateUrl=stub(`export const events=[];export const mode=${JSON.stringify(mode)};export const serial=${++realModelSerial};`),state=await import(stateUrl);
 let s=source.replace("const root=fileURLToPath(new URL('../../',import.meta.url));","const root='/SYNTHETIC_REAL_CLI_MODEL';");
 const inject=(path,value)=>{s=s.replaceAll(path,stub(`import {events,mode} from ${JSON.stringify(stateUrl)};${value}`))};
 inject('./fresh35-host-session.mjs',`export async function openReviewedFresh35Host(){throw Error('HISTORICAL_FALLBACK_PROHIBITED')}let n=0;export async function openReviewedFresh35ProductionHost(c,r,t,prepare,work,options){if(options.requestKey!=='t45-r4-real-prepare-20261107-01')throw Error('MODEL_REQUEST_KEY_NOT_FORWARDED');const client={modelConnection:++n};events.push('open:'+n);const p=await prepare({modelAdmission:n});events.push('prepared:'+n);if(options.inspectOnly){events.push('readonly-authorize');if(p.steps!==undefined||!p.preflight)throw Error('UNEXPECTED_STEPS');if(mode==='INSPECT_AUTH_FAIL')throw Error('DESCRIPTION_MISMATCH');const result=await work(client,{});events.push('close:'+n);return{result,cleanup:mode==='INSPECT_CLOSE_FAIL'?'CLOSE_FAILED':'CLOSED'}}let count=0;for await(const step of p.steps)count++;events.push('compiled:'+count);if(options.prepareOnly){events.push('close:'+n);return{result:{state:'PRODUCTION_REAL_IMPORT_PREPARED',binding:{model:true},business_database_writes:false,verification:{state:'NOT_RUN'}},cleanup:'CLOSED'}}events.push('authorize:'+n);if(mode==='NO_AUTH')throw Error('FRESH35_HOST_PRODUCTION_BATCH_AUTHORIZATION_REQUIRED');if(mode==='EXCLUSIVE_BACKENDS'||mode==='OTHER_SQLSTATE')throw Object.assign(Error('FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS_EXCLUSIVE_BACKENDS'),{code:mode==='EXCLUSIVE_BACKENDS'?'55000':'XX000',detail:'PRIVATE_PROCESS_FACTS'});if(mode==='READBACK_FAIL'&&n===2)throw Error('READBACK_MODEL_FAILURE');const result=await work(client,{});events.push('close:'+n);return{result,cleanup:mode==='CLOSE_FAIL'&&n===1?'CLOSE_FAILED':'CLOSED',host_verification:{modelConnection:n}}}`);
 inject('../../scripts/release/unified-install/fresh35-combined-record-v1.mjs',`export async function loadFresh35CombinedRecordEnvelope(){return{format:'FRESH35_COMBINED_INSTALLATION_RECORD_V2'}}`);
 inject('./stream-preflight.mjs',`export function streamPreflightFailureDiagnostic(){return null}export async function streamPreflight(){events.push('preflight');return{checks_passed:true,complete_package_validation:true,manifest_sha256:'a'.repeat(64),counts:{sales_header:25,sales_settlement:27}}}`);
 inject('./stream-plan.mjs',`export async function prepareStreamPlan(p,s,m,o){events.push('plan:'+o.historicalSalesAdmission.modelAdmission);return{totals:{sales_net_due_cents:'123'},async dispose(){events.push('dispose')}}}`);
 inject('./stream-program.mjs',`export async function prepareStreamInitializerFromIndex(index,summary,manifest,options){events.push('retained-plan:'+options.historicalSalesAdmission.modelAdmission);if(!index.endsWith('/index.sqlite')||summary.counts.sales_header!==25)throw Error('RETAINED_INPUT_DIFFERS');return{identity:{planSha256:'b'.repeat(64)},initialize:{modelOriginalKey:'unchanged'}}}export async function buildStreamProgram(){events.push('program-build');function createSteps(){events.push('steps-factory');return (async function*(){yield{method:'publish',request:{request_key:'original-1'}};yield{method:'publish',request:{request_key:'original-2'}}})()}return{identity:{planSha256:'b'.repeat(64)},initialize:{modelOriginalKey:'unchanged'},steps:createSteps(),createSteps}}`);
 inject('./whole-package-client.ts',`export async function executeWholePackage(client,id,initialize,steps){events.push('execute:'+client.modelConnection);for await(const s of steps)events.push(s.request.request_key);return{state:mode==='READBACK_FAIL'||mode==='CLOSE_FAIL'?'COMMITTED':mode}}`);
 inject('./whole-package-reconcile.mjs',`export async function reconcileWholePackage(client,init,encoded,counts,totals){events.push('verify:'+client.modelConnection);if(counts.sales_header!==25||counts.sales_settlement!==27||totals.sales_net_due_cents!=='123'||init.modelOriginalKey!=='unchanged')throw Error('SOURCE_MODEL_FACTS_DIFFER');return{state:'VERIFIED'}}`);
 inject('./whole-package-inspect.ts',`export async function inspectWholePackage(client){events.push('inspect:'+client.modelConnection);return{state:mode==='INSPECT_CLOSE_FAIL'?'ABSENT':mode.startsWith('INSPECT_')?mode.slice(8):'ABSENT',summary:{mustNotExport:'PRIVATE_INITIALIZER'}}}`);
 inject('./whole-package-sql-kernel.ts',`export function createWholePackageSqlKernel(){events.push('kernel');return{}}`);
 inject('./execution-client.ts',`export function assertPublicValuesExcludePrivateInputs(){}`);
 s=s.replace(/from\s*(['"])(\.{1,2}\/[^'"]+)\1/g,(_m,_q,path)=>'from '+JSON.stringify(pathToFileURL(resolve('tools/unified-import',path)).href));
 s=s.replace(/import\((['"])(\.{1,2}\/[^'"]+)\1\)/g,(_m,_q,path)=>'import('+JSON.stringify(pathToFileURL(resolve('tools/unified-import',path)).href)+')');
 return{...await import(stub(s)),events:state.events};
}
async function withProductionCliInputs(work,packageKind='REAL'){
 const fs=await import('node:fs/promises'),{HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256:profile}=await import('../packages/application/src/unified-import-contract.ts'),d=await mkdtemp(join(tmpdir(),'production-cli-model-'));
 try{
  const pkg=join(d,'pkg');await fs.mkdir(pkg);await writeFile(join(pkg,'manifest.json'),JSON.stringify({package_kind:packageKind,schema_contract:{source_declarations_sha256:profile}}));
  for(const [name,value]of [['target','{}'],['admin','{}'],['connection',JSON.stringify({password:'SYNTHETIC_MODEL_PRIVATE'})],['scrypt','naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128)]])await writeFile(join(d,name),value,{mode:0o600});
  const args=['--package',pkg,'--report','/var/lib/naijue-erp/fresh35-production/real-r3/reports/t45-r4-real-prepare-20261107-01/runtime/stream','--manifest-sha256','a'.repeat(64),'--target',join(d,'target'),'--admin',join(d,'admin'),'--connection',join(d,'connection'),'--scrypt-file',join(d,'scrypt'),'--target-profile','FRESH35_PRODUCTION_REAL_IMPORT_V1','--fresh35-reference-inputs',d,'--ack-exclusive-ddl-window'];
  await work(args,d);
 }finally{await rm(d,{recursive:true,force:true})}
}
test('REAL preparation and missing authority never invoke a writer; original steps are repeatable (CLI model)',async()=>{
 await withProductionCliInputs(async args=>{
  const prep=await productionCliModel();const p=await prep.runStreamImport([...args,'--prepare-only']);
  assert.equal(p.state,'PRODUCTION_REAL_IMPORT_PREPARED');assert.equal(prep.events.filter(x=>x==='program-build').length,1);assert.equal(p.business_database_writes,false);assert.equal(p.verification.state,'NOT_RUN');assert.equal(p.connection_cleanup,'CLOSED');assert(!prep.events.some(x=>/authorize|execute|kernel|verify/.test(x)));
  const rejected=await productionCliModel('NO_AUTH'),r=await rejected.runStreamImport(args);assert.equal(r.state,'NOT_STARTED');assert.equal(r.code,'FRESH35_HOST_PRODUCTION_BATCH_AUTHORIZATION_REQUIRED');assert.equal(rejected.events.filter(x=>x==='program-build').length,1);assert(!rejected.events.some(x=>/execute|kernel|verify/.test(x)));
 });
 await withProductionCliInputs(async args=>{const m=await productionCliModel(),r=await m.runStreamImport(args);assert.equal(r.state,'NOT_STARTED');assert.equal(r.code,'FRESH35_HOST_REAL_PREPARED_PROGRAM_REQUIRED');assert.deepEqual(m.events,[])},'SYNTHETIC');
});
test('REAL commit and same-key replay close their original connection before independent source reconciliation (CLI model)',async()=>{
 await withProductionCliInputs(async args=>{
  for(const mode of ['COMMITTED','ALREADY_COMMITTED']){
   const m=await productionCliModel(mode),r=await m.runStreamImport(args);assert.equal(r.state,mode);assert.equal(r.verification.state,'VERIFIED');assert.equal(r.readback_connection_cleanup,'CLOSED');
   assert(m.events.indexOf('close:1')<m.events.indexOf('open:2'));assert(m.events.indexOf('authorize:1')<m.events.indexOf('execute:1'));assert(m.events.indexOf('authorize:2')<m.events.indexOf('verify:2'));
   assert.equal(m.events.filter(x=>x==='program-build').length,2);assert.equal(m.events.filter(x=>x.startsWith('execute:')).length,1);assert.equal(m.events.filter(x=>x.startsWith('verify:')).length,1);assert(m.events.includes('original-1'));assert(m.events.includes('original-2'));assert.equal(r.host_verification.modelConnection,1);assert.equal(r.readback_host_verification.modelConnection,2);
  }
 });
});
test('REAL unknown or rollback never opens a readback or auto-retries; post-commit failures retain commit (CLI model)',async()=>{
 await withProductionCliInputs(async args=>{
  for(const mode of ['UNKNOWN','ROLLED_BACK','CLOSE_FAIL','READBACK_FAIL']){
   const m=await productionCliModel(mode),r=await m.runStreamImport(args);assert.equal(r.state,mode==='CLOSE_FAIL'||mode==='READBACK_FAIL'?'COMMITTED':mode);assert.equal(m.events.filter(x=>x.startsWith('execute:')).length,1);
   if(mode!=='READBACK_FAIL'){assert(!m.events.includes('open:2'));assert(!m.events.some(x=>x.startsWith('verify:')))}
   if(mode==='CLOSE_FAIL'||mode==='READBACK_FAIL')assert.equal(r.verification.state,'VERIFICATION_UNKNOWN');
  }
 });
});

test('REAL only projects the exact exclusive-backend guard failure (CLI model)',async()=>{
 await withProductionCliInputs(async args=>{
  for(const [mode,code] of [
   ['EXCLUSIVE_BACKENDS','FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS_EXCLUSIVE_BACKENDS'],
   ['OTHER_SQLSTATE','IMPORT_FAILED']
  ]){
   const m=await productionCliModel(mode),result=await m.runStreamImport(args);
   assert.equal(result.state,'NOT_STARTED');
   assert.equal(result.code,code);
   assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PROCESS_FACTS/);
   assert(!m.events.some(event=>/execute|kernel|verify/.test(event)));
  }
 });
});

test('oversized request keeps its static error code without exposing unexpected failures',async()=>{
 const d=await mkdtemp(join(tmpdir(),'stream-request-size-outcome-'));
 try{
  const pkg=join(d,'pkg');await(await import('node:fs/promises')).mkdir(pkg);await writeFile(join(pkg,'manifest.json'),'{}');
  for(const[name,value]of [['target','{}'],['admin','{}'],['connection',JSON.stringify({password:'synthetic-secret'})],['scrypt','naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128)]])await writeFile(join(d,name),value,{mode:0o600});
  const args=['--package',pkg,'--report',join(d,'report'),'--manifest-sha256','a'.repeat(64),'--target',join(d,'target'),'--admin',join(d,'admin'),'--connection',join(d,'connection'),'--scrypt-file',join(d,'scrypt'),'--ack-exclusive-ddl-window'];
  const sized=await(await moduleFor(false,false,false,false,'COMMITTED',undefined,'STREAM_REQUEST_TOO_LARGE')).runStreamImport(args);
  assert.equal(sized.state,'NOT_STARTED');assert.equal(sized.code,'STREAM_REQUEST_TOO_LARGE');assert.equal(sized.verification,'NOT_RUN');
  const unexpected=await(await moduleFor(false,false,false,false,'COMMITTED',undefined,'SYNTHETICSECRET')).runStreamImport(args);
  assert.equal(unexpected.state,'NOT_STARTED');assert.equal(unexpected.code,'IMPORT_FAILED');assert.doesNotMatch(JSON.stringify(unexpected),/SYNTHETICSECRET|synthetic-secret/);
 }finally{await rm(d,{recursive:true,force:true})}
});

test('retained inspection CLI uses the original summary/index path without source preflight, steps or writer (model)',async()=>withProductionCliInputs(async(args,d)=>{
 const fs=await import('node:fs/promises'),retained=join(d,'retained');await fs.mkdir(retained);
 await fs.writeFile(join(retained,'summary.json'),JSON.stringify({checks_passed:true,complete_package_validation:true,index_sha256:'e'.repeat(64),index_bytes:4096,manifest_sha256:'a'.repeat(64),counts:{sales_header:25}}));
 for(const state of ['ABSENT','COMMITTED_RECEIPT_FOUND','UNKNOWN','INSPECT_FAILED']){
  const m=await productionCliModel('INSPECT_'+state),r=await m.runStreamImport([...args,'--inspect-only','--retained-preflight',retained]);
  assert.equal(r.state,state==='INSPECT_FAILED'?'UNKNOWN':state);assert.equal(r.business_database_writes,false);assert.equal(r.connection_cleanup,'CLOSED');
  assert.deepEqual(m.events,['open:1','retained-plan:1','prepared:1','readonly-authorize','kernel','inspect:1','close:1']);
  assert.equal(r.summary,undefined);assert.equal(r.source_totals,undefined);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_INITIALIZER/);
 }
 const closeFail=await productionCliModel('INSPECT_CLOSE_FAIL'),closed=await closeFail.runStreamImport([...args,'--inspect-only','--retained-preflight',retained]);assert.equal(closed.state,'UNKNOWN');assert.equal(closed.connection_cleanup,'CLOSE_FAILED');
 const bad=await productionCliModel('INSPECT_AUTH_FAIL');assert.equal((await bad.runStreamImport([...args,'--inspect-only','--retained-preflight',retained])).state,'UNKNOWN');assert(!bad.events.includes('inspect:1'));
 await assert.rejects(bad.runStreamImport([...args,'--retained-preflight',retained]),/OPTION_INVALID/);
 await assert.rejects(bad.runStreamVerify([...args,'--inspect-only','--retained-preflight',retained]),/OPTION_INVALID/);
}));

for(const inspectOnly of [false,true])test(`explicit empty retained-preflight is rejected before any work, inspectOnly=${inspectOnly}`,async()=>withProductionCliInputs(async args=>{
 const m=await productionCliModel('COMMITTED');
 await assert.rejects(m.runStreamImport([...args,...(inspectOnly?['--inspect-only']:[]),'--retained-preflight','']),error=>error.message==='OPTION_INVALID');
 assert.deepEqual(m.events,[]);
}));
