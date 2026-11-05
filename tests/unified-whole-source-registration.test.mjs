import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createSyntheticPackage,repinSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {sha256,validateUnifiedPackage,HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256} from '../packages/application/src/unified-import-contract.ts';
import {stableImportId} from '../packages/application/src/inventory-cutoff-import.ts';
import {requestHash} from '../packages/application/src/request-hash.ts';
import {buildUnifiedImportPlan,CURRENT_REAL_TPLUS_REGISTRATION} from '../packages/application/src/unified-import-execution.ts';
import {buildUnifiedImportPlanV2} from '../packages/application/src/unified-import-execution-v2.ts';
import {compileStandardWholePackageProfile} from '../packages/application/src/unified-import-whole-package-profile.ts';
import {deriveStandardSourceRegistration} from '../tools/unified-import/source-registration.mjs';
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
import {prepareStreamPlan} from '../tools/unified-import/stream-plan.mjs';
import {buildStreamProgram} from '../tools/unified-import/stream-program.mjs';

const target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_source_registration',catalog_sha256:'a'.repeat(64)};
const admin={staff_id:stableImportId('SYNTHETIC_V2_COMPAT','staff'),account_id:stableImportId('SYNTHETIC_V2_COMPAT','account'),login_name:'synthetic-v1-compat',staff_name:'SYNTHETIC V1 compatibility ADMIN'};
const declaration=p=>deriveStandardSourceRegistration({source_namespace:p.manifest.source_namespace,source_files:p.manifest.source_files,cutoff_at:p.manifest.inventory_source.cutoff_at});
function seal(pkg){repinSyntheticPackage(pkg);const manifestBytes=Buffer.from(JSON.stringify(pkg.manifest));const check=validateUnifiedPackage(pkg,{allowSynthetic:true});assert.equal(check.valid,true,JSON.stringify(check.issues));return {pkg,manifestBytes,expectedManifestSha256:sha256(manifestBytes),target,initialization_identity:admin,...(pkg.manifest.package_kind==='SYNTHETIC'?{allowSynthetic:true}:{})};}
// All rows and provenance are synthetic. REAL only selects the declaration contract.
function fixture(kind='new'){
 const p=createSyntheticPackage();if(kind==='synthetic')return seal(p);
 p.manifest.package_kind='REAL';p.manifest.inventory_source.kind='NEW_AFTERNOON_SNAPSHOT';for(const report of Object.values(p.reports))if(report&&!Array.isArray(report)&&Object.hasOwn(report,'package_kind'))report.package_kind='REAL';
 if(kind==='fixed'){
  p.manifest.source_namespace=CURRENT_REAL_TPLUS_REGISTRATION.source_namespace;p.manifest.inventory_source.cutoff_at=CURRENT_REAL_TPLUS_REGISTRATION.cutoff_at;
  for(const r of p.registry){r.source_namespace=p.manifest.source_namespace;r.identity_basis='EXISTING_VERIFIED';}
  for(const r of Object.values(p.reports))if(r&&!Array.isArray(r)&&Object.hasOwn(r,'source_namespace'))r.source_namespace=p.manifest.source_namespace;
 }
 const reg=kind==='fixed'?{...CURRENT_REAL_TPLUS_REGISTRATION}:declaration(p);for(const t of ['sales_header','transfer_header'])for(const row of p.records[t])row.fields.import_batch_id=reg.batch_id;
 return {...seal(p),registration:reg};
}
async function onDisk(input,work){const dir=await mkdtemp(join(tmpdir(),'whole-source-registration-'));try{const pkg=join(dir,'package');await mkdir(pkg);for(const [name,bytes] of Object.entries(input.pkg.artifacts)){await mkdir(dirname(join(pkg,name)),{recursive:true});await writeFile(join(pkg,name),bytes);}await writeFile(join(pkg,'manifest.json'),input.manifestBytes);await work({dir,pkg});}finally{await rm(dir,{recursive:true,force:true});}}
const automatic=input=>{const {registration,...rest}=input;return rest;};

test('whole compilation accepts automatic and exact explicit new source declarations identically',()=>{
 const i=fixture(),before=JSON.stringify(i),explicit=compileStandardWholePackageProfile(i),auto=compileStandardWholePackageProfile(automatic(i));assert.deepEqual(auto,explicit);assert.equal(JSON.stringify(i),before);assert.equal(explicit.initialize.payload.document_batch_id,i.registration.batch_id);
});

test('whole new-source program is identical to actual legacy stream program',async()=>{
 const i=fixture();await onDisk(i,async({dir,pkg})=>{const report=join(dir,'report'),summary=await streamPreflight(pkg,report,{expectedManifestSha256:i.expectedManifestSha256});assert.equal(summary.checks_passed,true);let plan;try{plan=await prepareStreamPlan(join(report,'index.sqlite'),summary,i.manifestBytes,{target,initialization_identity:admin,registration:i.registration});const stream=await buildStreamProgram(plan,join(report,'index.sqlite'),summary,admin);const whole=compileStandardWholePackageProfile(i);assert.equal(whole.plan_sha256,plan.planHash);assert.deepEqual(whole.initialize,stream.initialize);const steps=[];for await(const s of stream.steps)steps.push(s);assert.deepEqual(whole.steps,steps);}finally{await plan?.dispose();}});
});

for(const explicit of [false,true])test(`public whole-import passes source planning before deliberate private-input refusal, explicit=${explicit}`,async()=>{
 const i=fixture();await onDisk(i,async({dir,pkg})=>{for(const [name,value]of [['target',target],['admin',admin],['registration',i.registration],['invalid-connection',{}]])await writeFile(join(dir,name),JSON.stringify(value),{mode:0o600});await writeFile(join(dir,'invalid-scrypt'),'deliberately-not-a-password-hash',{mode:0o600});const r=spawnSync(process.execPath,['--max-old-space-size=192',resolve('tools/unified-import/cli.mjs'),'whole-import','--package',pkg,'--report',join(dir,'report'),'--manifest-sha256',i.expectedManifestSha256,'--target',join(dir,'target'),'--admin',join(dir,'admin'),'--connection',join(dir,'invalid-connection'),'--scrypt-file',join(dir,'invalid-scrypt'),'--ack-exclusive-ddl-window',...(explicit?['--registration',join(dir,'registration')]:[])],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024});assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.equal(r.status,1);assert.deepEqual(JSON.parse(r.stdout),{state:'NOT_STARTED',code:'PRIVATE_CREDENTIAL_FORMAT_INVALID',verification:'NOT_RUN'});});
});

for(const field of ['batch_id','source_namespace','source_metadata_sha256','cutoff_at'])test(`whole rejects declaration ${field} mismatch`,()=>{const i=fixture();i.registration={...i.registration,[field]:field==='batch_id'?'10000000-0000-0000-0000-000000000001':field==='cutoff_at'?'2026-11-02T08:00:00.000001Z':field==='source_namespace'?'synthetic.other':'f'.repeat(64)};assert.throws(()=>compileStandardWholePackageProfile(i),/REGISTRATION_DECLARATION_MISMATCH|REGISTERED_SOURCE_MISMATCH/);});
for(const change of ['source-bytes','source-path','source-sha'])test(`whole rejects stale declaration after valid ${change} change`,()=>{let i=fixture();if(change==='source-sha'){const old=i.pkg.manifest.source_files[0].sha256;i.pkg=JSON.parse(JSON.stringify(i.pkg).replaceAll(old,'e'.repeat(64)));}else if(change==='source-bytes')i.pkg.manifest.source_files[0].bytes++;else i.pkg.manifest.source_files[0].relative_path='SYNTHETIC-other.txt';i={...seal(i.pkg),registration:i.registration};assert.throws(()=>compileStandardWholePackageProfile(i),/REGISTRATION_DECLARATION_MISMATCH/);});

test('equivalent offset and reordered source pins retain declaration identity without rewriting input',()=>{const i=fixture(),reg=i.registration;i.pkg.manifest.source_files.reverse();i.pkg.manifest.inventory_source.cutoff_at='2026-11-02T08:00:00Z';const changed={...seal(i.pkg),registration:reg},before=JSON.stringify(changed);const a=compileStandardWholePackageProfile(changed),b=compileStandardWholePackageProfile(automatic(changed));assert.deepEqual(a,b);assert.equal(a.initialize.payload.document_batch_id,reg.batch_id);assert.equal(JSON.stringify(changed),before);});

test('legacy V1 and V2 default source restrictions cannot be bypassed by extra flags',()=>{const i=fixture();for(const build of [buildUnifiedImportPlan,buildUnifiedImportPlanV2]){assert.throws(()=>build(automatic(i)),/REGISTERED_SOURCE_METADATA_REQUIRED/);assert.throws(()=>build(i),/UNREGISTERED_REAL_SOURCE_METADATA/);assert.throws(()=>build({...i,allowNewSourceRegistration:true,registrationMode:'WHOLE',skipRegistrationValidation:true}),/UNREGISTERED_REAL_SOURCE_METADATA/);}});

test('synthetic and fixed historical registration whole plan bindings stay equal to legacy V2',()=>{for(const kind of ['synthetic','fixed']){const i=fixture(kind),source=buildUnifiedImportPlanV2(i),before=JSON.stringify(i),whole=compileStandardWholePackageProfile(i);assert.equal(whole.plan_sha256,requestHash({format_version:'STANDARD_WHOLE_PACKAGE_PROGRAM_V2',source_plan_sha256:source.plan_sha256,schema_declarations_sha256:i.pkg.manifest.schema_contract.source_declarations_sha256,document_chunk_rows:500}));assert.equal(JSON.stringify(i),before);assert.equal(buildUnifiedImportPlanV2(i).plan_sha256,source.plan_sha256);}});

test('automatic declaration cannot silently substitute a fixed historical document batch',()=>{assert.throws(()=>compileStandardWholePackageProfile(automatic(fixture('fixed'))),/REGISTERED_SOURCE_MISMATCH|REGISTERED_SOURCE_METADATA_REQUIRED/);});
test('document batch mismatch still rejects a valid manifest declaration',()=>{const i=fixture();i.pkg.records.sales_header[0].fields.import_batch_id='10000000-0000-0000-0000-000000000001';i.pkg.records.transfer_header[0].fields.import_batch_id='10000000-0000-0000-0000-000000000001';assert.throws(()=>compileStandardWholePackageProfile({...seal(i.pkg),registration:i.registration}),/REGISTERED_SOURCE_MISMATCH/);});

test('manifest pin and object mismatch remain mandatory',()=>{const i=fixture();assert.throws(()=>compileStandardWholePackageProfile({...i,expectedManifestSha256:'f'.repeat(64)}),/MANIFEST_HASH_MISMATCH/);i.pkg.manifest.source_files[0].bytes++;assert.throws(()=>compileStandardWholePackageProfile(i),/MANIFEST_OBJECT_MISMATCH/);});
test('new declaration does not grant historical host admission or forgive invalid package facts',()=>{const i=fixture();i.pkg.manifest.schema_contract.source_declarations_sha256=HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256;for(const r of i.pkg.records.staff)r.fields.departure_date=null;const historical={...seal(i.pkg),registration:i.registration};assert.throws(()=>compileStandardWholePackageProfile(historical),/WHOLE_PACKAGE_PROFILE_SOURCE_ONLY/);assert.throws(()=>compileStandardWholePackageProfile({...historical,historicalSalesAdmission:{installed:true,authorized:true}}),/WHOLE_SALES_ADMISSION_REQUIRED/);const invalid=fixture();invalid.pkg.records.staff[0].fields.hall_id=null;repinSyntheticPackage(invalid.pkg);invalid.manifestBytes=Buffer.from(JSON.stringify(invalid.pkg.manifest));invalid.expectedManifestSha256=sha256(invalid.manifestBytes);assert.throws(()=>compileStandardWholePackageProfile(invalid),/PREFLIGHT_REJECTED/);});
test('registration accessor is rejected without invoking it',()=>{const i=fixture();i.registration={...i.registration};let reads=0;Object.defineProperty(i.registration,'source_metadata_sha256',{enumerable:true,get(){reads++;return 'f'.repeat(64);}});assert.throws(()=>compileStandardWholePackageProfile(i),/WHOLE_PACKAGE_PROFILE_INPUT_DESCRIPTOR/);assert.equal(reads,0);});

// Captured from unchanged pre-fix source using these exact synthetic fixtures.
const originalHashes={"synthetic":{"v1":"04a1fe4c034dfecf4f8a11a907d36ba4138a301e941e4b6d531d6dd02823a390","v2":"5f6640e0643d239cc2690df88b9353c5b70718d43aa85e7ad0fb7de1e7c1142b","whole":"0bdcc36057645738e4a7b105bd2292154f33ad562796a983c763302669bb7b64"},"fixed":{"v1":"ae2efc447c8b3c6dbeb0b5d6f5558d7074cef9ef0683be7448c46b4fe44fe8e7","v2":"85e519a0aa361d6e539c9b52b8a52950616f6df00d19313d2ef42bc96269d1af","whole":"a94989e3fa742c7dea54073d4c43f7408a0c338503ded76f79c5ffce87c4a97a"}};
test('legacy V1/V2 and whole synthetic/fixed plan hashes retain pre-fix values',()=>{for(const kind of ['synthetic','fixed']){const i=fixture(kind),expected=originalHashes[kind];assert.equal(buildUnifiedImportPlan(i).plan_sha256,expected.v1);assert.equal(buildUnifiedImportPlanV2(i).plan_sha256,expected.v2);assert.equal(compileStandardWholePackageProfile(i).plan_sha256,expected.whole);}});
test('shared declaration reader retains Unicode scalar validation after TypeScript extraction',()=>{const p=createSyntheticPackage(),base={source_namespace:p.manifest.source_namespace,source_files:p.manifest.source_files,cutoff_at:p.manifest.inventory_source.cutoff_at};for(const source_namespace of ['synthetic.\ud800','synthetic.\udc00','synthetic.\ud800x'])assert.throws(()=>deriveStandardSourceRegistration({...base,source_namespace}),/REGISTRATION_SOURCE_INVALID/);const valid=deriveStandardSourceRegistration({...base,source_namespace:'synthetic.测🙂'});assert.equal(valid.source_namespace,'synthetic.测🙂');assert.equal(Object.isFrozen(valid),true);});
