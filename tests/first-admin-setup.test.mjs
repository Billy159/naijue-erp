import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {buildAdminProvisionRequest,buildProvisionedAdminStreamProgram,PROVISIONED_ADMIN_IMPORT_MODE} from '../tools/unified-import/first-admin-setup.mjs';
import {createSyntheticPackage,repinSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {deriveStandardSourceRegistration} from '../packages/application/src/unified-source-registration.ts';
import {sha256} from '../packages/application/src/unified-import-contract.ts';
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
import {prepareStreamPlan} from '../tools/unified-import/stream-plan.mjs';
import {buildStreamProgram} from '../tools/unified-import/stream-program.mjs';
const admin={staff_id:'71000000-0000-0000-0000-000000000001',account_id:'72000000-0000-0000-0000-000000000001',staff_name:'SYNTHETIC first administrator',login_name:'synthetic-first-admin'};
const origin={operation_id:'73000000-0000-0000-0000-000000000001',request_sha256:'d'.repeat(64)};
const target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_source_only_admin',catalog_sha256:'a'.repeat(64)};
const input=()=>({admin:structuredClone(admin),operationId:origin.operation_id,installationRecordSha256:'b'.repeat(64),setupReference:'SYNTHETIC setup approval reference'});

test('setup request contains only the new explicit identity and setup evidence, with no import or password input',()=>{
 const r=buildAdminProvisionRequest(input());assert.equal(r.mode,'ADMIN_PROVISION_ONLY');
 assert.deepEqual(r.admin,admin);assert.equal(r.request_key,'admin-provision-only-v1:'+origin.operation_id);
 assert.deepEqual(Object.keys(r).sort(),['admin','format_version','installation_record_sha256','mode','operation_id','request_key','setup_reference']);
 assert(!JSON.stringify(r).includes('snapshot'));assert(!Object.hasOwn(r,'batch_id'));
 const v=input();const owned=buildAdminProvisionRequest(v);v.admin.login_name='changed';assert.equal(owned.admin.login_name,admin.login_name);
 for(const bad of [{...input(),rows:[]},{...input(),password:'SYNTHETIC forbidden'},{...input(),operationId:'historical-name'},
  {...input(),admin:{...admin,hall_id:null}},{...input(),admin:{...admin,login_name:''}},
  {...input(),setupReference:'postgresql://user:secret@localhost/db'}])assert.throws(()=>buildAdminProvisionRequest(bad),/ADMIN_PROVISION/);
});

// The complete fixture is fabricated. REAL selects the receiver path under
// test; this never certifies any human source, physical target or execution.
async function fixture(kind='REAL'){
 const d=await mkdtemp(join(tmpdir(),'first-admin-source-')),pkg=join(d,'pkg'),report=join(d,'report');let plan;
 try{
  let p=createSyntheticPackage();
  if(kind==='REAL'){
   p.manifest.package_kind='REAL';p.manifest.inventory_source.kind='NEW_AFTERNOON_SNAPSHOT';
   p.reports['decisions.json'].package_kind='REAL';p.reports['reconciliation.json'].package_kind='REAL';
   const reg=deriveStandardSourceRegistration({source_namespace:p.manifest.source_namespace,source_files:p.manifest.source_files,cutoff_at:p.manifest.inventory_source.cutoff_at});
   for(const t of ['sales_header','transfer_header'])for(const r of p.records[t])r.fields.import_batch_id=reg.batch_id;
   p=repinSyntheticPackage(p);
  }
  for(const [path,bytes] of Object.entries(p.artifacts)){await mkdir(dirname(join(pkg,path)),{recursive:true});await writeFile(join(pkg,path),bytes);}
  const bytes=Buffer.from(JSON.stringify(p.manifest)+'\n');await writeFile(join(pkg,'manifest.json'),bytes);
  const summary=await streamPreflight(pkg,report,{expectedManifestSha256:sha256(bytes),allowSynthetic:kind==='SYNTHETIC'});
  assert.equal(summary.checks_passed,true,JSON.stringify(summary));assert.equal(summary.complete_package_validation,true);
  const index=join(report,'index.sqlite');plan=await prepareStreamPlan(index,summary,bytes,{target,initialization_identity:admin,allowSynthetic:kind==='SYNTHETIC'});
  return {plan,index,summary,async close(){await plan.dispose();await rm(d,{recursive:true,force:true});}};
 }catch(e){await plan?.dispose();await rm(d,{recursive:true,force:true});throw e;}
}
async function collect(stream){const out=[];for await(const s of stream)out.push(s);return out;}

test('proven-admin REAL compilation preserves every source row, money, stock effect and both complete publication steps',async()=>{
 const f=await fixture();try{
  const original=await buildStreamProgram(f.plan,f.index,f.summary,admin),oldSteps=await collect(original.steps);
  const next=await buildProvisionedAdminStreamProgram(f.plan,f.index,f.summary,admin,origin),steps=await collect(next.steps);
  assert.equal(original.initialize.payload.mode,'NEW_EMPTY');assert.equal(next.initialize.payload.mode,PROVISIONED_ADMIN_IMPORT_MODE);
  const expected=structuredClone(original.initialize.payload);expected.mode=PROVISIONED_ADMIN_IMPORT_MODE;
  expected.provision_operation_id=origin.operation_id;expected.provision_request_sha256=origin.request_sha256;
  assert.deepEqual(next.initialize.payload,expected);assert.notEqual(next.identity.planSha256,original.identity.planSha256);
  assert.deepEqual({...next.identity,planSha256:original.identity.planSha256},original.identity);
  assert.equal(steps.length,oldSteps.length);assert(steps.some(s=>s.method==='baselineKeys'&&s.request.payload.rows.some(r=>r.fields.quantity!=='0')));
  assert.deepEqual(steps.map(s=>s.method),oldSteps.map(s=>s.method));
  for(let i=0;i<steps.length;i++){
   assert.deepEqual(steps[i].request.payload,oldSteps[i].request.payload,'exact business values and approvals must survive');
   assert.equal(steps[i].request.plan_sha256,next.identity.planSha256);assert.notEqual(steps[i].request.operation_id,oldSteps[i].request.operation_id);
  }
  assert.deepEqual(steps.filter(s=>s.method==='publish').map(s=>s.request.payload.phase),['BASELINE','DOCUMENTS']);
  const replay=await buildProvisionedAdminStreamProgram(f.plan,f.index,f.summary,admin,origin);assert.deepEqual(replay.initialize,next.initialize);
  assert.deepEqual(await collect(replay.steps),steps,'same setup/source binds deterministic replay');
  const other=await buildProvisionedAdminStreamProgram(f.plan,f.index,f.summary,admin,{...origin,request_sha256:'e'.repeat(64)});
  assert.notEqual(other.identity.planSha256,next.identity.planSha256);await collect(other.steps);
  await assert.rejects(buildProvisionedAdminStreamProgram({...f.plan},f.index,f.summary,admin,origin),/STREAM_PLAN_NOT_ACTIVE/);
  await assert.rejects(buildProvisionedAdminStreamProgram(f.plan,f.index,f.summary,{...admin,staff_name:'different'},origin),/STREAM_INITIALIZATION_IDENTITY_MISMATCH/);
  await assert.rejects(buildProvisionedAdminStreamProgram(f.plan,f.index,f.summary,admin,{...origin,request_sha256:'unbound'}),/RECEIPT_BINDING/);
 }finally{await f.close();}
});

test('SYNTHETIC preparation cannot enter the production first-business mode',async()=>{
 const f=await fixture('SYNTHETIC');try{await assert.rejects(buildProvisionedAdminStreamProgram(f.plan,f.index,f.summary,admin,origin),/ADMIN_PROVISION_REAL_PLAN_REQUIRED/);}finally{await f.close();}
});
