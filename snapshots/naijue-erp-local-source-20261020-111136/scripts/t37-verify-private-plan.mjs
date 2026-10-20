import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync, symlinkSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const revision='r06-20261005-private-approved-employee-plan';
const output=resolve('outputs/T37/revisions',revision),logs=resolve('logs/T37/revisions',revision);
mkdirSync(logs,{recursive:true,mode:0o700});
const suite=mkdtempSync(join(logs,'synthetic-private-plan-')),compiled=join(suite,'compiled');
const receipt={task:'T37',revision,scope:'NEW_PRIVATE_PLAN_LOAD_AND_EXACT_BINDING_ONLY',status:'RUNNING',dataClass:'SYNTHETIC_ONLY',
  databaseConnections:0,serverConnections:0,realEmployeesInitialized:0,original24ChecksRerun:false,sharedDistModified:false,suite,checks:[]};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const writePrivate=(name,value)=>{const path=join(suite,name);writeFileSync(path,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{mode:0o600});return path;};
const checked=(id,evidence={})=>{receipt.checks.push({id,status:'PASS',...evidence});process.stdout.write('PASS '+id+'\n');};
const denies=(run,code)=>assert.throws(run,error=>error?.code===code);
const load=path=>import(pathToFileURL(path).href);
try {
  const build=spawnSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'-p',resolve('tsconfig.json'),'--outDir',compiled],{encoding:'utf8'});
  writePrivate('compile.log',build.stdout+build.stderr);assert.equal(build.status,0,'FORMAL_SOURCE_STRICT_COMPILE_FAILED');
  receipt.strictCompile={exitCode:0,allFormalSourceIncluded:true,compiledRoot:compiled};
  const policyPath=join(compiled,'security/approved-initial-employees.js'),policySource=readFileSync(policyPath,'utf8');
  const real=await load(policyPath);
  checked('P01_IMPORT_REQUIRES_NO_PRIVATE_DATA',{sourceSha256:sha(readFileSync(resolve('server/security/approved-initial-employees.ts'))),compiledSha256:sha(Buffer.from(policySource)),privateFileRead:false});
  denies(()=>real.readApprovedInitialEmployeePlan(join(suite,'missing.json')),'PRIVATE_APPROVED_EMPLOYEE_PLAN_REQUIRED');
  denies(()=>real.readApprovedInitialEmployeePlan('relative.json'),'PRIVATE_APPROVED_EMPLOYEE_PLAN_REQUIRED');
  const unsafe=writePrivate('synthetic-public-file.json',{});chmodSync(unsafe,0o644);
  denies(()=>real.readApprovedInitialEmployeePlan(unsafe),'PRIVATE_APPROVED_EMPLOYEE_PLAN_REQUIRED');
  const link=join(suite,'synthetic-link.json');symlinkSync(unsafe,link);
  denies(()=>real.readApprovedInitialEmployeePlan(link),'PRIVATE_APPROVED_EMPLOYEE_PLAN_REQUIRED');
  checked('P02_MISSING_AND_UNCONTROLLED_FILE_REFUSED',{missing:true,relative:true,publicPermissions:true,symlink:true});
  const rows=Array.from({length:49},(_,i)=>({personKey:'synthetic-person-'+i,retainedEmployeeId:i<45?randomUUID():null,
    sourceEmployeeCode:i<45?'SYN-'+i:null,role:i<3?'ADMIN':i<6?'WAREHOUSE':'SALESPERSON',hallCode:i<6?null:'SYN-HALL-'+i}));
  const originalBytes=Buffer.from(JSON.stringify({schemaVersion:'SYNTHETIC-ORIGINAL',employees:rows.map(row=>({personKey:row.personKey})),initialPasswordPolicy:{length:6}}));
  const schemeBytes=Buffer.from(JSON.stringify({employees:rows.map(row=>({currentPersonKey:row.personKey,plannedPreservedEmployeeId:row.retainedEmployeeId,
    primarySourceEmployeeCode:row.sourceEmployeeCode,role:row.role,hallCode:row.hallCode}))}));
  const fixture={schemaVersion:'T37-PRIVATE-APPROVED-EMPLOYEE-PLAN-v1',sourcePlan:{sha256:sha(originalBytes),bytesBase64:originalBytes.toString('base64')},
    sourceScheme:{sha256:sha(schemeBytes),bytesBase64:schemeBytes.toString('base64')},authorization:{source:'SYNTHETIC_TEST_ONLY'},employees:rows};
  const fixtureFile=writePrivate('synthetic-approved-plan.json',fixture),fixtureSha=sha(readFileSync(fixtureFile));
  denies(()=>real.readApprovedInitialEmployeePlan(fixtureFile),'UNAPPROVED_PRIVATE_EMPLOYEE_PLAN');
  const claimed=writePrivate('synthetic-self-declared-digest.json',{...fixture,sourcePlan:{...fixture.sourcePlan,sha256:real.approvedInitialEmployeePlanSha256},approvedPrivateResourceSha256:real.approvedInitialPrivateResourceSha256});
  denies(()=>real.readApprovedInitialEmployeePlan(claimed),'UNAPPROVED_PRIVATE_EMPLOYEE_PLAN');
  checked('P03_FORMAL_LOADER_REJECTS_UNKNOWN_AND_SELF_DECLARED_PLAN',{arbitraryExternalRosterRejected:true,inputClaimedDigestDoesNotAuthorize:true});
  // Synthetic success uses a private copy of the exact compiled loader with ONLY its two trust-anchor constants changed.
  // No production API accepts an expected hash, replacement roster, or test profile.
  assert.equal(policySource.split(real.approvedInitialPrivateResourceSha256).length-1,1);
  assert.equal(policySource.split(real.approvedInitialEmployeePlanSha256).length-1,1);
  const syntheticPolicySource=policySource.replace(real.approvedInitialPrivateResourceSha256,fixtureSha).replace(real.approvedInitialEmployeePlanSha256,sha(originalBytes));
  const syntheticPolicyPath=join(compiled,'security/approved-initial-employees.synthetic.js');writeFileSync(syntheticPolicyPath,syntheticPolicySource,{mode:0o600});
  const synthetic=await load(syntheticPolicyPath),plan=synthetic.readApprovedInitialEmployeePlan(fixtureFile),loaded=synthetic.approvedInitialEmployees(plan);
  assert.deepEqual(loaded,rows);assert(Object.isFrozen(loaded)&&loaded.every(Object.isFrozen));
  checked('P04_PINNED_SYNTHETIC_PLAN_PRESERVES_COMPLETE_MAPPING',{people:49,retainedIds:45,newPeople:4,roles:{ADMIN:3,WAREHOUSE:3,SALESPERSON:43},idsRolesHallsEqual:true});
  const wrongVersion=writePrivate('synthetic-wrong-version.json',{...fixture,schemaVersion:'UNKNOWN-v2'});
  const changedHall=writePrivate('synthetic-replaced-hall.json',{...fixture,employees:rows.map((row,i)=>i===6?{...row,hallCode:'OTHER-HALL'}:row)});
  const changedOriginal=writePrivate('synthetic-replaced-source-plan.json',{...fixture,sourcePlan:{...fixture.sourcePlan,bytesBase64:Buffer.from('unknown').toString('base64')}});
  for(const path of [wrongVersion,changedHall,changedOriginal])denies(()=>synthetic.readApprovedInitialEmployeePlan(path),'UNAPPROVED_PRIVATE_EMPLOYEE_PLAN');
  denies(()=>synthetic.approvedInitialEmployees(Object.freeze({employees:rows})),'UNAPPROVED_PRIVATE_EMPLOYEE_PLAN');
  checked('P05_WRONG_VERSION_SOURCE_OR_ROSTER_AND_FORGED_CAPABILITY_REFUSED',{wrongVersion:true,replacedHall:true,replacedOriginal:true,forgedPlan:true});
  const firstPath=join(compiled,'security/first-initialization.js'),firstSource=readFileSync(firstPath,'utf8');
  assert.equal(firstSource.split("'./approved-initial-employees.js'").length-1,1);
  const syntheticFirstPath=join(compiled,'security/first-initialization.synthetic.js');
  writeFileSync(syntheticFirstPath,firstSource.replace("'./approved-initial-employees.js'","'./approved-initial-employees.synthetic.js'"),{mode:0o600});
  const first=await load(syntheticFirstPath),{readDatabaseConfig}=await load(join(compiled,'database/config.js'));
  const env={APP_ENV:'qa',APP_DATABASE_MODE:'required',POSTGRES_HOST:join(suite,'never-opened-socket'),POSTGRES_PORT:'55537',POSTGRES_DB:'demo_8877_t37_private_plan',
    POSTGRES_USER:'t37_private_app',POSTGRES_ROLE_PREFIX:'t37_private',POSTGRES_SOURCE_SCHEMA:'t37_private_source',POSTGRES_RUNTIME_SCHEMA:'t37_private_runtime',
    POSTGRES_AUTH_SCHEMA:'t37_private_auth',POSTGRES_CONTROL_SCHEMA:'t37_private_control',POSTGRES_INSTANCE_ID:randomUUID(),POSTGRES_CLUSTER_ID:'1234567890'};
  const config=readDatabaseConfig(env),binding={schemaVersion:'T37-FIRST-INITIALIZATION-BINDING-v1',approvedPlanSha256:sha(originalBytes),maintenanceAccountId:'synthetic-admin',
    target:first.firstInitializationTarget(config),employees:rows.map(row=>({personKey:row.personKey,employeeId:row.retainedEmployeeId??randomUUID(),hallId:row.hallCode?randomUUID():null}))};
  const bindingFile=writePrivate('synthetic-target-binding.json',binding);
  assert(first.readFirstInitializationGrant(bindingFile,config,plan));
  denies(()=>first.readFirstInitializationGrant(bindingFile,config,Object.freeze({employees:rows})),'UNAPPROVED_PRIVATE_EMPLOYEE_PLAN');
  const wrongBinding=writePrivate('synthetic-plan-digest-binding.json',{...binding,approvedPlanSha256:'0'.repeat(64)});
  denies(()=>first.readFirstInitializationGrant(wrongBinding,config,plan),'UNAPPROVED_INITIALIZATION_ROSTER');
  checked('P06_APPROVED_PLAN_TO_EXISTING_TARGET_GRANT',{exact49BindingAccepted:true,forgedPlanAndWrongPlanDigestRefused:true,databaseConnections:0});
  const secret=join(suite,'synthetic-session.key');writeFileSync(secret,randomBytes(48),{mode:0o600});
  const cliEnv={PATH:process.env.PATH,...env,SESSION_ORIGIN:'https://t37-private-plan-qa.invalid',SESSION_SECRET_FILE:secret,T37_BINDING_FILE:bindingFile,T37_REQUEST_FILE:join(suite,'unused-request.json')};
  const cli=join(compiled,'security/first-initialization-cli.js');
  for(const [planFile,code]of [[undefined,'EXPLICIT_INITIALIZATION_CONFIGURATION_REQUIRED'],[fixtureFile,'UNAPPROVED_PRIVATE_EMPLOYEE_PLAN']]){
    const result=spawnSync(process.execPath,[cli],{encoding:'utf8',env:{...cliEnv,...(planFile?{T37_APPROVED_EMPLOYEE_PLAN_FILE:planFile}:{})}});
    assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(JSON.parse(result.stderr).code,code);
  }
  checked('P07_CLI_REQUIRES_PRIVATE_PLAN_BEFORE_DATAACCESS',{missingPlanRefused:true,unapprovedPlanRefused:true,sanitizedOutput:true,databaseConnections:0});
  receipt.syntheticTrustProfile={productionLoaderCompiledSha256:sha(Buffer.from(policySource)),syntheticLoaderCompiledSha256:sha(Buffer.from(syntheticPolicySource)),
    syntheticResourceSha256:fixtureSha,onlyTwoConstantsChanged:true,grantOnlyPrivateImportRedirected:true,productionOverrideHookAdded:false,realPrivatePlanLoadedDuringTests:false};
  receipt.status='PASS_SCOPED_PRIVATE_EMPLOYEE_PLAN_SEPARATION';
} catch(error) {
  receipt.status='FAIL';receipt.failureCode=typeof error?.code==='string'&&/^[A-Z_]+$/.test(error.code)?error.code:'NEW_PRIVATE_PLAN_CHECK_FAILED';
  process.stderr.write(JSON.stringify({status:receipt.status,code:receipt.failureCode})+'\n');process.exitCode=1;
} finally {
  receipt.recordedAt=new Date().toISOString();receipt.checkCount=receipt.checks.length;
  writeFileSync(join(suite,'RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  writeFileSync(join(output,'PRIVATE-PLAN-VERIFICATION.json'),JSON.stringify(receipt,null,2)+'\n');
  process.stdout.write(JSON.stringify({status:receipt.status,checks:receipt.checkCount,original24ChecksRerun:false,databaseConnections:0})+'\n');
}
