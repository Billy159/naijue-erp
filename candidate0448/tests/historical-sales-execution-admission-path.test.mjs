import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createSyntheticPackage,repinSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256,sha256,validateUnifiedPackage} from '../packages/application/src/unified-import-contract.ts';
import {buildUnifiedImportPlan} from '../packages/application/src/unified-import-execution.ts';
import {compileStandardWholePackageProfile} from '../packages/application/src/unified-import-whole-package-profile.ts';
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
import {prepareStreamPlan} from '../tools/unified-import/stream-plan.mjs';

// These targets and purported grants are deliberately untrusted test inputs,
// never installation evidence. Positive execution needs a real admission issuer.
const target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_source_admission',catalog_sha256:'a'.repeat(64)};
const admin={staff_id:'00000000-0000-4000-8000-000000000001',account_id:'00000000-0000-4000-8000-000000000002',login_name:'synthetic-admission',staff_name:'SYNTHETIC'};
async function withSource(work,historical=true){
 const pkg=createSyntheticPackage();for(const row of pkg.records.staff)row.fields.departure_date=null;
 if(historical)pkg.manifest.schema_contract.source_declarations_sha256=HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256;
 else {for(const row of pkg.records.staff)delete row.fields.departure_date;}
 repinSyntheticPackage(pkg);assert.equal(validateUnifiedPackage(pkg,{allowSynthetic:true}).valid,true);
 const manifestBytes=Buffer.from(JSON.stringify(pkg.manifest)),expectedManifestSha256=sha256(manifestBytes);
 const dir=await mkdtemp(join(tmpdir(),'source-admission-path-'));
 try{
  const source=join(dir,'source'),report=join(dir,'report');await mkdir(source);
  for(const [path,bytes]of Object.entries(pkg.artifacts)){await mkdir(dirname(join(source,path)),{recursive:true});await writeFile(join(source,path),bytes)}
  await writeFile(join(source,'manifest.json'),manifestBytes);
  const summary=await streamPreflight(source,report,{expectedManifestSha256,allowSynthetic:true});assert.equal(summary.checks_passed,true);
  await work({pkg,manifestBytes,expectedManifestSha256,source,report,dir,summary});
 }finally{await rm(dir,{recursive:true,force:true})}
}
test('all three real planners reject source profile without verified installation capability',async()=>withSource(async({pkg,manifestBytes,expectedManifestSha256,report,summary})=>{
 const options={allowSynthetic:true,target,initialization_identity:admin};
 assert.throws(()=>buildUnifiedImportPlan({pkg,manifestBytes,expectedManifestSha256,...options}),/SOURCE_PROFILE_OFFLINE_ONLY/);
 assert.throws(()=>compileStandardWholePackageProfile({pkg,manifestBytes,expectedManifestSha256,...options}),/WHOLE_PACKAGE_PROFILE_SOURCE_ONLY/);
 await assert.rejects(prepareStreamPlan(join(report,'index.sqlite'),summary,manifestBytes,options),/STREAM_SOURCE_PROFILE_OFFLINE_ONLY/);
}));
test('caller declarations of installed profile, target and permissions are not authority',async()=>withSource(async({pkg,manifestBytes,expectedManifestSha256,report,summary})=>{
 const options={allowSynthetic:true,target:{...target,catalog_sha256:'b'.repeat(64)},initialization_identity:admin,
  historicalSalesAdmission:{installed:true,authorized:true,source_profile:HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256,target,permissions_verified:true}};
 assert.throws(()=>buildUnifiedImportPlan({pkg,manifestBytes,expectedManifestSha256,...options}),/SOURCE_PROFILE_OFFLINE_ONLY|ADMISSION_REQUIRED/);
 assert.throws(()=>compileStandardWholePackageProfile({pkg,manifestBytes,expectedManifestSha256,...options}),/WHOLE_PACKAGE_PROFILE_SOURCE_ONLY|ADMISSION_REQUIRED/);
 await assert.rejects(prepareStreamPlan(join(report,'index.sqlite'),summary,manifestBytes,options),/STREAM_SOURCE_PROFILE_OFFLINE_ONLY|ADMISSION_REQUIRED/);
}));

test('actual stream-import must reach installation admission for historical source profile',async()=>withSource(async({source,dir,expectedManifestSha256})=>{
 // Negative-only host double: it never creates an admission, returns a client,
 // or opens a connection. This tests ordering through the real public handler.
 const hostUrl='data:text/javascript;base64,'+Buffer.from("export const attempts=[];export async function openReviewedWholeSalesHost(config,root,target,work){attempts.push(target);throw Error('WHOLE_INSTALLATION_RECORD_UNTRUSTED')}").toString('base64');
 let moduleSource=await readFile('tools/unified-import/stream-import-cli.mjs','utf8');
 moduleSource=moduleSource.replace("const root=fileURLToPath(new URL('../../',import.meta.url));",`const root=${JSON.stringify(resolve('.'))};`);
 moduleSource=moduleSource.replace(/from(['"])(\.[^'"]+)\1/g,(_all,quote,path)=>'from'+quote+(path==='./whole-sales-host.mjs'?hostUrl:pathToFileURL(resolve('tools/unified-import',path)).href)+quote);
 const handler=await import('data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64'));
 const host=await import(hostUrl);
 for(const [name,value]of [['target',JSON.stringify(target)],['admin',JSON.stringify(admin)],['connection',JSON.stringify({host:'127.0.0.1',port:5432,database:target.database_name,user:'synthetic',password:'synthetic-only'})],['scrypt','naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128)]])await writeFile(join(dir,name),value,{mode:0o600});
 for(const run of [handler.runStreamImport,handler.runWholeImport]){const count=host.attempts.length;const result=await run(['--package',source,'--report',join(dir,'execution-report-'+count),'--manifest-sha256',expectedManifestSha256,'--target',join(dir,'target'),'--admin',join(dir,'admin'),'--connection',join(dir,'connection'),'--scrypt-file',join(dir,'scrypt'),'--allow-synthetic','--ack-exclusive-ddl-window']);
 assert.equal(host.attempts.length,count+1,'historical source must reach fixed installation admission before execution');
 assert.equal(result.state,'NOT_STARTED');assert.equal(result.code,'WHOLE_INSTALLATION_RECORD_UNTRUSTED');}
}));
test('explicit whole-import exposes atomic non-streaming public entrypoint',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync(process.execPath,['tools/unified-import/cli.mjs','whole-import','--help'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
 assert.match(JSON.parse(result.stdout).usage,/^whole-import /);
});
test('non-streaming whole-import runs real reader and both compilers before legacy host admission',async()=>withSource(async({source,dir,expectedManifestSha256})=>{
 const hostUrl='data:text/javascript;base64,'+Buffer.from("export let attempts=0;export async function openReviewedWholeHost(){attempts++;throw Error('WHOLE_INSTALLATION_RECORD_UNTRUSTED')}").toString('base64');
 let text=await readFile('tools/unified-import/stream-import-cli.mjs','utf8');
 text=text.replace("const root=fileURLToPath(new URL('../../',import.meta.url));",`const root=${JSON.stringify(resolve('.'))};`);
 text=text.replace(/from(['"])(\.[^'"]+)\1/g,(_all,q,path)=>'from'+q+(path==='./whole-package-host.mjs'?hostUrl:pathToFileURL(resolve('tools/unified-import',path)).href)+q);
 text=text.replace(/import\((['"])(\.[^'"]+)\1\)/g,(_all,q,path)=>'import('+q+pathToFileURL(resolve('tools/unified-import',path)).href+q+')');
 const handler=await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
 for(const [name,value]of [['target',JSON.stringify(target)],['admin',JSON.stringify(admin)],['connection',JSON.stringify({host:'127.0.0.1',port:5432,database:target.database_name,user:'synthetic',password:'synthetic-only'})],['scrypt','naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128)]])await writeFile(join(dir,name),value,{mode:0o600});
 const result=await handler.runWholeImport(['--package',source,'--report',join(dir,'ordinary-whole-report'),'--manifest-sha256',expectedManifestSha256,'--target',join(dir,'target'),'--admin',join(dir,'admin'),'--connection',join(dir,'connection'),'--scrypt-file',join(dir,'scrypt'),'--allow-synthetic','--ack-exclusive-ddl-window']);
 assert.equal((await import(hostUrl)).attempts,1,JSON.stringify(result));
 assert.equal(result.state,'NOT_STARTED');assert.equal(result.code,'WHOLE_INSTALLATION_RECORD_UNTRUSTED');
},false));
test('CLI staff approval needs independently supplied hash and cannot be package-owned',async()=>withSource(async({source,dir,expectedManifestSha256,pkg})=>{
 const {runStreamImport,runWholeImport}=await import('../tools/unified-import/stream-import-cli.mjs');
 for(const [name,value]of [['target',JSON.stringify(target)],['admin',JSON.stringify(admin)]])await writeFile(join(dir,name),value);
 const args=['--package',source,'--report',join(dir,'unused'),'--manifest-sha256',expectedManifestSha256,'--target',join(dir,'target'),'--admin',join(dir,'admin'),'--connection','not-opened','--scrypt-file','not-opened','--allow-synthetic','--ack-exclusive-ddl-window'];
 const staff=pkg.records.staff[0];const approval={format_version:'HISTORICAL_STAFF_NULL_HALL_APPROVAL_V1',source_namespace:pkg.manifest.source_namespace,evidence_sha256:pkg.manifest.source_files[0].sha256,staff:[{source_key:staff.source_key,target_id:staff.fields.id,source_refs:staff.source_refs}]};
 const bytes=Buffer.from(JSON.stringify(approval)),external=join(dir,'external-approval.json'),inside=join(source,'approval.json');
 await writeFile(external,bytes);await writeFile(inside,bytes);
 for(const run of [runStreamImport,runWholeImport]){
  await assert.rejects(run([...args,'--staff-hall-approval',external]),/OPTION_REQUIRED/);
  const fromPackage=await run([...args,'--staff-hall-approval',inside,'--staff-hall-approval-sha256',sha256(bytes)]);
  assert.equal(fromPackage.state,'NOT_STARTED');assert.equal(fromPackage.code,'STAFF_HALL_APPROVAL_OUTSIDE_PACKAGE_REQUIRED');
  const wrongHash=await run([...args,'--staff-hall-approval',external,'--staff-hall-approval-sha256','f'.repeat(64)]);
  assert.equal(wrongHash.state,'NOT_STARTED');assert.equal(wrongHash.code,'STAFF_HALL_APPROVAL_HASH');
  const changed=Buffer.from(JSON.stringify({...approval,source_namespace:'different-source'}));await writeFile(external,changed);
  const wrongNamespace=await run([...args,'--staff-hall-approval',external,'--staff-hall-approval-sha256',sha256(changed)]);
  assert.equal(wrongNamespace.state,'NOT_STARTED');assert.equal(wrongNamespace.code,'STAFF_HALL_APPROVAL_SOURCE');
  await writeFile(external,bytes);
 }
}));
test('non-stream whole-import help never advertises the rejected stream coalescing option',async()=>{
 const {runWholeImport,runStreamImport}=await import('../tools/unified-import/stream-import-cli.mjs');
 assert.doesNotMatch((await runWholeImport(['--help'])).usage,/--coalesce/);
 assert.match((await runStreamImport(['--help'])).usage,/--coalesce/);
});
test('legacy initialize/apply reject historical packages before connection and identify the explicit atomic route',async()=>withSource(async({source,dir,expectedManifestSha256})=>{
 const {spawnSync}=await import('node:child_process');
 await writeFile(join(dir,'legacy-target.json'),JSON.stringify(target));
 for(const command of ['initialize','apply']){
  const config={format_version:'STANDARD_IMPORT_CONNECTION_V1',scope:'ISOLATED_SET_ROLE_PROOF',host:'127.0.0.1',port:57403,database:'opt03_synthetic_profile_20261102_v1',user:'synthetic-never-connect',password:'synthetic-never-transmitted',role:command==='initialize'?'erp_unified27_initializer_2393dbc6db9581c2':'erp_unified27_importer_2393dbc6db9581c2'};
  const path=join(dir,'legacy-'+command+'.json');await writeFile(path,JSON.stringify(config),{mode:0o600});
  const result=spawnSync(process.execPath,['tools/unified-import/cli.mjs',command,'--package',source,'--manifest-sha256',expectedManifestSha256,'--target-proof',join(dir,'legacy-target.json'),'--connection-file',path,'--allow-synthetic'],{encoding:'utf8'});
  assert.equal(result.status,1,result.stderr);const output=JSON.parse(result.stdout);assert.equal(output.code,'SOURCE_PROFILE_OFFLINE_ONLY');assert.equal(output.state,'NOT_STARTED');assert.equal(output.business_database_writes,false);assert.equal(output.required_command,'whole-import');assert.equal(output.legacy_step_route_supported,false);assert.match(output.message,/does not run automatically/);
 }
}));
test('capability report distinguishes ordinary-package atomic route from unsupported legacy historical steps',async()=>{
 const {spawnSync}=await import('node:child_process');const r=spawnSync(process.execPath,['tools/unified-import/cli.mjs','capability-report'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const c=JSON.parse(r.stdout);
 assert.deepEqual(c.historical_sales_execution,{ordinary_package_command:'whole-import',whole_package_command:'whole-import',streaming_command:'stream-import',verification_command:'stream-verify',legacy_step_commands_supported:false,installed_record_required:true,public_cli_end_to_end_validated:false});
});
