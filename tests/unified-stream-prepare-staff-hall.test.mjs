import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,lstat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {writeSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {writeExplicitZeroStreamPackage} from './fixtures/unified-import/explicit-zero-stream-package.mjs';
import {sha256,SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256} from '../packages/application/src/unified-import-contract.ts';
import {runStreamPrepare} from '../tools/unified-import/stream-prepare-cli.mjs';
import {readExplicitZeroCliApproval,readStaffHallCliApproval} from '../tools/unified-import/explicit-zero-cli-input.mjs';
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
import {prepareStreamPlan} from '../tools/unified-import/stream-plan.mjs';
import {buildStreamProgram} from '../tools/unified-import/stream-program.mjs';

const cli=resolve('tools/unified-import/cli.mjs');
async function fixture(options,work){
 const dir=await mkdtemp(join(tmpdir(),'prepare-staff-hall-'));
 try{
  const pkg=join(dir,'package');let zero;
  if(options.combined)zero=await writeExplicitZeroStreamPackage(pkg,2);else await writeSyntheticPackage(pkg);
  const manifest=JSON.parse(await readFile(join(pkg,'manifest.json'),'utf8')),staff=JSON.parse((await readFile(join(pkg,'staff.jsonl'),'utf8')).trim());
  assert.equal(manifest.schema_contract.source_declarations_sha256,SCHEMA_DECLARATIONS_SHA256);
  staff.fields.employment_status=options.active?'在职':'离职';staff.fields.hall_id=null;
  if(options.historical){manifest.schema_contract.source_declarations_sha256=HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256;staff.fields.departure_date=null;}
  const staffBytes=Buffer.from(JSON.stringify(staff)+'\n');await writeFile(join(pkg,'staff.jsonl'),staffBytes);Object.assign(manifest.files.find(p=>p.table==='staff'),{bytes:staffBytes.length,sha256:sha256(staffBytes)});
  const manifestBytes=Buffer.from(JSON.stringify(manifest)+'\n'),manifestHash=sha256(manifestBytes);await writeFile(join(pkg,'manifest.json'),manifestBytes);
  const approved={format_version:'HISTORICAL_STAFF_NULL_HALL_APPROVAL_V1',source_namespace:manifest.source_namespace,evidence_sha256:staff.source_refs[0].file_sha256,staff:[{source_key:staff.source_key,target_id:staff.fields.id,source_refs:structuredClone(staff.source_refs)}]};
  const approvalBytes=Buffer.from(JSON.stringify(approved)+'\n'),approvalPath=join(dir,'staff-approved.json'),approvalHash=sha256(approvalBytes);await writeFile(approvalPath,approvalBytes);
  const target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_staff_prepare',catalog_sha256:'a'.repeat(64)},admin={staff_id:'10000000-0000-0000-0000-000000000001',account_id:'20000000-0000-0000-0000-000000000001',login_name:'synthetic-admin',staff_name:'SYNTHETIC admin'};
  await writeFile(join(dir,'target.json'),JSON.stringify(target));await writeFile(join(dir,'admin.json'),JSON.stringify(admin));
  const report=join(dir,'report'),args=['--package',pkg,'--report',report,'--manifest-sha256',manifestHash,'--target',join(dir,'target.json'),'--admin',join(dir,'admin.json'),'--allow-synthetic'];
  await work({dir,pkg,manifest,manifestBytes,manifestHash,staff,approved,approvalBytes,approvalPath,approvalHash,zero,target,admin,report,args,staffArgs:['--staff-hall-approval',approvalPath,'--staff-hall-approval-sha256',approvalHash],zeroArgs:zero?['--explicit-zero-approval',zero.approvalPath,'--explicit-zero-approval-sha256',zero.approvalSha256]:[]});
 }finally{await rm(dir,{recursive:true,force:true});}
}
function invoke(args){
 const run=spawnSync(process.execPath,['--max-old-space-size=192',cli,'stream-prepare',...args],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024});assert.equal(run.error,undefined);assert.equal(run.signal,null);assert.equal(run.stdout.trim().split('\n').length,1);
 const output=JSON.parse(run.stdout);assert.equal(output.execution_ready,false);assert.equal(output.business_database_writes,false);assert.doesNotMatch(run.stdout,/staff:01|CONFIRMED_ABSENT_IS_ZERO|approval_line|merkle_proof|HISTORICAL_STAFF_NULL_HALL_APPROVAL_V1/);return {exit:run.status,output};
}
const noReport=report=>assert.rejects(lstat(report),e=>e.code==='ENOENT');
function rejected(result,code){assert.equal(result.exit,1);assert.equal(result.output.state,'PREPARATION_FAILED');assert.equal(result.output.code,code);}
async function issueCodes(result){assert.equal(result.exit,1);assert.equal(result.output.state,'PREFLIGHT_REJECTED');return (await readFile(result.output.issues_file,'utf8')).trim().split('\n').map(JSON.parse).map(i=>i.code);}

test('prepare help offers the independent staff-hall approval pair',async()=>{const r=await runStreamPrepare(['--help']);assert.match(r.usage,/--staff-hall-approval FILE --staff-hall-approval-sha256 SHA/);assert.equal(r.scope,'OFFLINE_ONLY_NO_DATABASE');});

for(const combined of [false,true])for(const coalesce of [false,true])test(`public prepare binds staff approval with combined=${combined}, coalesce=${coalesce}`,async()=>fixture({combined},async f=>{
 const actual=invoke([...f.args,...f.staffArgs,...f.zeroArgs,...(coalesce?['--coalesce']:[])]);assert.equal(actual.exit,0);assert.equal(actual.output.state,'OFFLINE_PREPARED');
 const historicalStaffHallApproval=await readStaffHallCliApproval(f.pkg,f.manifest,f.approvalPath,f.approvalHash),explicitZeroApproval=f.zero?await readExplicitZeroCliApproval(f.pkg,f.manifest,f.zero.approvalPath,f.zero.approvalSha256):undefined;
 const approvalOptions={historicalStaffHallApproval,...(explicitZeroApproval?{explicitZeroApproval}:{})},report=join(f.dir,'direct-report'),summary=await streamPreflight(f.pkg,report,{expectedManifestSha256:f.manifestHash,allowSynthetic:true,...approvalOptions});assert.equal(summary.checks_passed,true);assert.equal(summary.issue_count,0);
 let plan;try{plan=await prepareStreamPlan(join(report,'index.sqlite'),summary,f.manifestBytes,{target:f.target,initialization_identity:f.admin,allowSynthetic:true,...approvalOptions});const program=await buildStreamProgram(plan,join(report,'index.sqlite'),summary,f.admin,{coalesce});
  assert.deepEqual(program.initialize.payload.historical_staff_hall_approval,{utf8:f.approvalBytes.toString('utf8'),sha256:f.approvalHash});assert.equal(program.initialize.payload.explicit_zero_approval?.record_count,combined?2:undefined);
  let steps=0,rows=0,staff=0,accounts=0,zero=0;for await(const step of program.steps){steps++;for(const row of step.request.payload.rows??[]){rows++;if(row.entity_type==='STAFF'){staff++;assert.deepEqual(row.fields,f.staff.fields);assert.deepEqual(row.source_refs,f.staff.source_refs);}if(row.entity_type==='USER_ACCOUNT')accounts++;if(row.explicit_zero_evidence)zero++;}}
  assert.equal(staff,1);assert.equal(accounts,0);assert.equal(zero,combined?2:0);assert.equal(actual.output.plan_sha256,program.identity.planSha256);assert.equal(actual.output.requests,steps+1);assert.equal(actual.output.request_rows,rows);
 }finally{await plan?.dispose();}
}));

test('unapproved departed null-hall staff still fails preflight',async()=>fixture({},async f=>{assert.deepEqual(await issueCodes(invoke(f.args)),['STAFF_HALL_REQUIRED']);}));
test('a valid approval never exempts an active salesperson from hall mapping',async()=>fixture({active:true},async f=>{assert.deepEqual(await issueCodes(invoke([...f.args,...f.staffArgs])),['STAFF_HALL_REQUIRED']);}));
test('valid staff approval does not bypass historical source host admission',async()=>fixture({historical:true},async f=>{
 rejected(invoke([...f.args,...f.staffArgs]),'STREAM_SOURCE_PROFILE_OFFLINE_ONLY');
 const summary=JSON.parse(await readFile(join(f.report,'summary.json'),'utf8'));assert.equal(summary.checks_passed,true);assert.equal(summary.complete_package_validation,true);assert.equal(summary.import_eligible,false);
}));

test('both approval pairs remain mandatory independently in a combined package',async()=>fixture({combined:true},async f=>{
 const noStaff=invoke([...f.args,...f.zeroArgs]);assert.deepEqual(await issueCodes(noStaff),['STAFF_HALL_REQUIRED']);
 const other=f.args.map(v=>v===f.report?join(f.dir,'no-zero-report'):v);assert.deepEqual(await issueCodes(invoke([...other,...f.staffArgs])),['EXPLICIT_ZERO_APPROVAL_REQUIRED','EXPLICIT_ZERO_APPROVAL_REQUIRED']);
}));

test('staff approval parameters are paired and unique independently of zero parameters',async()=>fixture({combined:true},async f=>{
 await assert.rejects(runStreamPrepare([...f.args,...f.zeroArgs,'--staff-hall-approval',f.approvalPath]),/OPTION_REQUIRED/);
 await assert.rejects(runStreamPrepare([...f.args,...f.zeroArgs,'--staff-hall-approval-sha256',f.approvalHash]),/OPTION_REQUIRED/);
 await assert.rejects(runStreamPrepare([...f.args,...f.staffArgs,'--staff-hall-approval',f.approvalPath]),/OPTION_INVALID/);await noReport(f.report);
}));

test('wrong staff approval hash cannot be excused by valid explicit-zero approval',async()=>fixture({combined:true},async f=>{rejected(invoke([...f.args,...f.zeroArgs,'--staff-hall-approval',f.approvalPath,'--staff-hall-approval-sha256','f'.repeat(64)]),'STAFF_HALL_APPROVAL_HASH');await noReport(f.report);}));
test('wrong explicit-zero hash cannot be excused by valid staff approval',async()=>fixture({combined:true},async f=>{rejected(invoke([...f.args,...f.staffArgs,'--explicit-zero-approval',f.zero.approvalPath,'--explicit-zero-approval-sha256','f'.repeat(64)]),'EXPLICIT_ZERO_APPROVAL_HASH');await noReport(f.report);}));

for(const variant of ['namespace','source-hash','locator'])test(`staff approval ${variant} mismatch fails closed`,async()=>fixture({},async f=>{
 const value=structuredClone(f.approved);if(variant==='namespace')value.source_namespace='synthetic.other';else if(variant==='source-hash')value.evidence_sha256='f'.repeat(64);else value.staff[0].source_refs[0].row++;
 const bytes=Buffer.from(JSON.stringify(value)+'\n'),file=join(f.dir,'mismatched.json');await writeFile(file,bytes);const result=invoke([...f.args,'--staff-hall-approval',file,'--staff-hall-approval-sha256',sha256(bytes)]);
 if(variant==='locator')assert.deepEqual(await issueCodes(result),['STAFF_HALL_REQUIRED']);else{rejected(result,'STAFF_HALL_APPROVAL_SOURCE');await noReport(f.report);}
}));

for(const variant of ['package-contained','symlink'])test(`staff approval ${variant} file is rejected by the existing reader`,async()=>fixture({},async f=>{
 const file=join(variant==='package-contained'?f.pkg:f.dir,'untrusted-approval.json');if(variant==='symlink')await symlink(f.approvalPath,file);else await writeFile(file,f.approvalBytes);
 rejected(invoke([...f.args,'--staff-hall-approval',file,'--staff-hall-approval-sha256',f.approvalHash]),variant==='symlink'?'INPUT_FILE_INVALID':'STAFF_HALL_APPROVAL_OUTSIDE_PACKAGE_REQUIRED');await noReport(f.report);
}));

test('staff-only preparation verifies manifest pin before reading approval',async()=>fixture({},async f=>{
 const args=f.args.map(v=>v===f.manifestHash?'f'.repeat(64):v);rejected(invoke([...args,'--staff-hall-approval',join(f.dir,'missing-approval'),'--staff-hall-approval-sha256',f.approvalHash]),'MANIFEST_HASH_MISMATCH');await noReport(f.report);
}));
