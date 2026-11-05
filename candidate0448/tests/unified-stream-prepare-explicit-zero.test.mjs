import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,lstat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {writeExplicitZeroStreamPackage} from './fixtures/unified-import/explicit-zero-stream-package.mjs';
import {sha256} from '../packages/application/src/unified-import-contract.ts';
import {runStreamPrepare} from '../tools/unified-import/stream-prepare-cli.mjs';
import {readExplicitZeroCliApproval} from '../tools/unified-import/explicit-zero-cli-input.mjs';
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
import {prepareStreamPlan} from '../tools/unified-import/stream-plan.mjs';
import {buildStreamProgram} from '../tools/unified-import/stream-program.mjs';

const cli=resolve('tools/unified-import/cli.mjs');
async function fixture(work){
 const dir=await mkdtemp(join(tmpdir(),'prepare-zero-approval-'));
 try{
  const pkg=join(dir,'package'),data=await writeExplicitZeroStreamPackage(pkg,3);
  const target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_offline_approval',catalog_sha256:'a'.repeat(64)};
  const admin={staff_id:'10000000-0000-0000-0000-000000000001',account_id:'20000000-0000-0000-0000-000000000001',login_name:'synthetic-admin',staff_name:'SYNTHETIC admin'};
  await writeFile(join(dir,'target.json'),JSON.stringify(target));await writeFile(join(dir,'admin.json'),JSON.stringify(admin));
  const report=join(dir,'report'),args=['--package',pkg,'--report',report,'--manifest-sha256',data.manifestSha256,'--target',join(dir,'target.json'),'--admin',join(dir,'admin.json'),'--allow-synthetic'];
  await work({dir,pkg,data,target,admin,report,args,approvalArgs:['--explicit-zero-approval',data.approvalPath,'--explicit-zero-approval-sha256',data.approvalSha256]});
 }finally{await rm(dir,{recursive:true,force:true});}
}
function invoke(args){
 const run=spawnSync(process.execPath,['--max-old-space-size=192',cli,'stream-prepare',...args],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
 assert.equal(run.error,undefined);assert.equal(run.signal,null);assert.equal(run.stdout.trim().split('\n').length,1);
 const output=JSON.parse(run.stdout);assert.equal(output.execution_ready,false);assert.equal(output.business_database_writes,false);
 assert.doesNotMatch(run.stdout,/CONFIRMED_ABSENT_IS_ZERO|approval_line|merkle_proof|synthetic-zero:/);
 return {exit:run.status,output};
}
async function noReport(report){await assert.rejects(lstat(report),e=>e.code==='ENOENT');}
function expectedFailure(result,code){assert.equal(result.exit,1);assert.equal(result.output.state,'PREPARATION_FAILED');assert.equal(result.output.code,code);}

test('offline prepare help advertises the paired explicit-zero approval inputs',async()=>{
 const result=await runStreamPrepare(['--help']);assert.match(result.usage,/--explicit-zero-approval FILE --explicit-zero-approval-sha256 SHA/);assert.equal(result.scope,'OFFLINE_ONLY_NO_DATABASE');
});

for(const coalesce of [false,true])test(`public preparation uses the verified approval and original bound plan, coalesce=${coalesce}`,async()=>fixture(async f=>{
 const result=invoke([...f.args,...f.approvalArgs,...(coalesce?['--coalesce']:[])]);assert.equal(result.exit,0);assert.equal(result.output.state,'OFFLINE_PREPARED');assert.equal(result.output.counts.inventory_baseline,5);
 const approval=await readExplicitZeroCliApproval(f.pkg,JSON.parse(f.data.manifest),f.data.approvalPath,f.data.approvalSha256),directReport=join(f.dir,'direct-report');
 const summary=await streamPreflight(f.pkg,directReport,{expectedManifestSha256:f.data.manifestSha256,allowSynthetic:true,explicitZeroApproval:approval});assert.equal(summary.checks_passed,true);assert.equal(summary.issue_count,0);
 let plan;try{
  plan=await prepareStreamPlan(join(directReport,'index.sqlite'),summary,f.data.manifest,{target:f.target,initialization_identity:f.admin,allowSynthetic:true,explicitZeroApproval:approval});
  const program=await buildStreamProgram(plan,join(directReport,'index.sqlite'),summary,f.admin,{coalesce});let steps=0,zeroRows=0,rows=0;
  for await(const step of program.steps){steps++;rows+=(step.request.payload.rows??[]).length;zeroRows+=(step.request.payload.rows??[]).filter(r=>r.explicit_zero_evidence).length;}
  assert.equal(zeroRows,3);assert.equal(program.initialize.payload.explicit_zero_approval.record_count,3);assert.equal(program.initialize.payload.explicit_zero_approval.sha256,f.data.approvalSha256);
  assert.equal(result.output.plan_sha256,program.identity.planSha256);assert.equal(result.output.requests,steps+1);assert.equal(result.output.request_rows,rows);
 }finally{await plan?.dispose();}
}));

test('absence of independent approval still rejects source self-asserted zero evidence',async()=>fixture(async f=>{
 const result=invoke(f.args);assert.equal(result.exit,1);assert.equal(result.output.state,'PREFLIGHT_REJECTED');assert.equal(result.output.issue_count,3);
 const issues=(await readFile(result.output.issues_file,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(issues.filter(i=>i.code==='EXPLICIT_ZERO_APPROVAL_REQUIRED').length,3);
}));

test('approval arguments must be paired and cannot be duplicated',async()=>fixture(async f=>{
 await assert.rejects(runStreamPrepare([...f.args,'--explicit-zero-approval',f.data.approvalPath]),/OPTION_REQUIRED/);
 await assert.rejects(runStreamPrepare([...f.args,'--explicit-zero-approval-sha256',f.data.approvalSha256]),/OPTION_REQUIRED/);
 await assert.rejects(runStreamPrepare([...f.args,...f.approvalArgs,'--explicit-zero-approval',f.data.approvalPath]),/OPTION_INVALID/);
 await noReport(f.report);
}));

test('a mismatched approval digest fails closed before report creation',async()=>fixture(async f=>{
 expectedFailure(invoke([...f.args,'--explicit-zero-approval',f.data.approvalPath,'--explicit-zero-approval-sha256','f'.repeat(64)]),'EXPLICIT_ZERO_APPROVAL_HASH');await noReport(f.report);
}));

test('a hash-valid approval for another source namespace fails closed',async()=>fixture(async f=>{
 const file=join(f.dir,'other-source.jsonl'),raw=(await readFile(f.data.approvalPath,'utf8')).trim().split('\n').map(JSON.parse);for(const fact of raw)fact.source_namespace='synthetic.other-source';const bytes=Buffer.from(raw.map(JSON.stringify).join('\n')+'\n');await writeFile(file,bytes);
 expectedFailure(invoke([...f.args,'--explicit-zero-approval',file,'--explicit-zero-approval-sha256',sha256(bytes)]),'EXPLICIT_ZERO_APPROVAL_FACT');await noReport(f.report);
}));

test('a hash-valid forged approval decision fails closed',async()=>fixture(async f=>{
 const file=join(f.dir,'forged-decision.jsonl'),raw=(await readFile(f.data.approvalPath,'utf8')).trim().split('\n').map(JSON.parse);raw[0].decision='SOURCE_ASSERTION_ONLY';const bytes=Buffer.from(raw.map(JSON.stringify).join('\n')+'\n');await writeFile(file,bytes);
 expectedFailure(invoke([...f.args,'--explicit-zero-approval',file,'--explicit-zero-approval-sha256',sha256(bytes)]),'EXPLICIT_ZERO_APPROVAL_FACT');await noReport(f.report);
}));

test('approval evidence inside the package is not independent approval',async()=>fixture(async f=>{
 const file=join(f.pkg,'untrusted-approval.jsonl');await writeFile(file,await readFile(f.data.approvalPath));
 expectedFailure(invoke([...f.args,'--explicit-zero-approval',file,'--explicit-zero-approval-sha256',f.data.approvalSha256]),'EXPLICIT_ZERO_APPROVAL_OUTSIDE_PACKAGE_REQUIRED');await noReport(f.report);
}));

test('a symbolic-link approval file fails the shared reader policy',async()=>fixture(async f=>{
 const file=join(f.dir,'approval-link.jsonl');await symlink(f.data.approvalPath,file);
 expectedFailure(invoke([...f.args,'--explicit-zero-approval',file,'--explicit-zero-approval-sha256',f.data.approvalSha256]),'INPUT_FILE_INVALID');await noReport(f.report);
}));

test('manifest digest is checked before reading approval or creating a report',async()=>fixture(async f=>{
 const args=f.args.map(v=>v===f.data.manifestSha256?'f'.repeat(64):v);
 expectedFailure(invoke([...args,'--explicit-zero-approval',join(f.dir,'missing-approval'),'--explicit-zero-approval-sha256',f.data.approvalSha256]),'MANIFEST_HASH_MISMATCH');await noReport(f.report);
}));
