import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {writeExplicitZeroStreamPackage} from './fixtures/unified-import/explicit-zero-stream-package.mjs';
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
import {prepareStreamPlan} from '../tools/unified-import/stream-plan.mjs';
import {buildStreamProgram} from '../tools/unified-import/stream-program.mjs';
import {wholePackageMaterializationLimit} from '../tools/unified-import/stream-import-cli.mjs';
const count=process.env.RUN_ZERO_STREAM_SCALE==='1'?105433:3;
test('explicit zero full package preflight and bounded request iteration ('+count+' approved rows)',async()=>{
 const d=await mkdtemp(join(tmpdir(),'explicit-zero-stream-'));let plan;
 try{
  const start=performance.now(),p=await writeExplicitZeroStreamPackage(join(d,'input'),count),report=join(d,'report');
  const summary=await streamPreflight(join(d,'input'),report,{expectedManifestSha256:p.manifestSha256,allowSynthetic:true,explicitZeroApproval:p.approval});
  assert.equal(summary.checks_passed,true,await readFile(join(report,'issues.jsonl'),'utf8'));assert.equal(summary.complete_package_validation,true);assert.equal(summary.counts.inventory_baseline,count+2);
  const admin={staff_id:'10000000-0000-0000-0000-000000000001',account_id:'20000000-0000-0000-0000-000000000001',login_name:'synthetic-admin',staff_name:'SYNTHETIC admin'},target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_profile',catalog_sha256:'a'.repeat(64)};
  plan=await prepareStreamPlan(join(report,'index.sqlite'),summary,p.manifest,{allowSynthetic:true,explicitZeroApproval:p.approval,target,initialization_identity:admin});
  const program=await buildStreamProgram(plan,join(report,'index.sqlite'),summary,admin,{coalesce:true});
  assert.equal(program.initialize.payload.explicit_zero_approval.record_count,count);assert.ok(Buffer.byteLength(JSON.stringify(program.initialize))<8*1024*1024);
  let zeroRows=0,steps=0,maxRequest=0;
  for await(const step of program.steps){steps++;const n=Buffer.byteLength(JSON.stringify(step.request));maxRequest=Math.max(maxRequest,n);assert.ok(n<=8*1024*1024);for(const row of step.request.payload.rows??[]){if(row.explicit_zero_evidence){zeroRows++;assert.equal(row.ledger_entry_id,null)}}}
  assert.equal(zeroRows,count);
  if(count===105433)assert.equal(wholePackageMaterializationLimit(JSON.parse(p.manifest),p.manifest.length),'FILE_BYTES');
  console.log(JSON.stringify({syntheticOnly:true,approvedRows:count,baselineRows:summary.counts.inventory_baseline,baselineBytes:p.baselineBytes,approvalBytes:p.approvalBytes,requestCount:steps,maxRequestBytes:maxRequest,elapsedMs:performance.now()-start,peakRssBytes:process.resourceUsage().maxRSS*1024,scope:'REAL_STREAM_PREFLIGHT_PLAN_REQUESTS_ONLY_NO_HOST_OR_DATABASE'}));
 }finally{await plan?.dispose();await rm(d,{recursive:true,force:true})}
});
test('public stream CLI carries an external approval through real preflight/plan to protected host refusal',async()=>{
 const {runStreamImport}=await import('../tools/unified-import/stream-import-cli.mjs');
 const {writeFile,lstat}=await import('node:fs/promises');
 // No record, identity or database capability is fabricated. If an authorized
 // deployment exists, do not use it as a test environment.
 const fixed=process.platform==='darwin'?'/private/etc/naijue-erp/whole-installation.json':'/etc/naijue-erp/whole-installation.json';
 try{await lstat(fixed);return}catch(e){if(e.code!=='ENOENT')throw e}
 const d=await mkdtemp(join(tmpdir(),'explicit-zero-cli-'));
 try{
  const p=await writeExplicitZeroStreamPackage(join(d,'input'),3);
  const admin={staff_id:'10000000-0000-0000-0000-000000000001',account_id:'20000000-0000-0000-0000-000000000001',login_name:'synthetic-admin',staff_name:'SYNTHETIC admin'},target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_profile',catalog_sha256:'a'.repeat(64)};
  for(const [name,value] of [['target',JSON.stringify(target)],['admin',JSON.stringify(admin)],['connection',JSON.stringify({host:'127.0.0.1',port:5555,database:'synthetic_profile',user:'synthetic_controller',password:'synthetic-never-transmitted'})],['scrypt','naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128)]])await writeFile(join(d,name),value,{mode:0o600});
  const args=['--package',join(d,'input'),'--report',join(d,'report'),'--manifest-sha256',p.manifestSha256,'--target',join(d,'target'),'--admin',join(d,'admin'),'--connection',join(d,'connection'),'--scrypt-file',join(d,'scrypt'),'--explicit-zero-approval',p.approvalPath,'--explicit-zero-approval-sha256',p.approvalSha256,'--allow-synthetic','--inspect-only','--ack-exclusive-ddl-window'];
  const r=await runStreamImport(args);assert.equal(r.state,'NOT_STARTED');assert.equal(r.code,'WHOLE_INSTALLATION_RECORD_UNTRUSTED');
  const preflight=JSON.parse(await readFile(join(d,'report','summary.json'),'utf8'));assert.equal(preflight.checks_passed,true);assert.equal(preflight.counts.inventory_baseline,5);
 }finally{await rm(d,{recursive:true,force:true})}
});
