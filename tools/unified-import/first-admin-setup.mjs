/** Source candidate only. No CLI, connection, installer dispatch or authorization
 * issuer. The fixed host must bind the successor catalog, exact physical target,
 * current epoch and separate setup/real-import authority before executing these.
 * Password encodings remain the existing kernel's separate private parameter. */
import {findCredentialPath} from '../../packages/application/src/unified-import-contract.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {stableImportId} from '../../packages/application/src/inventory-cutoff-import.ts';
import {assertActiveStreamPlan} from './stream-plan.mjs';
import {buildStreamProgram} from './stream-program.mjs';

export const PROVISIONED_ADMIN_IMPORT_MODE='PROVISIONED_ADMIN_EMPTY_BUSINESS';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const closed=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys;
function adminIdentity(value){
 if(!closed(value,'account_id,login_name,staff_id,staff_name')||!uuid(value.staff_id)||!uuid(value.account_id)
  ||!['login_name','staff_name'].every(k=>typeof value[k]==='string'&&value[k].trim()&&value[k].isWellFormed()&&!value[k].includes('\0'))
  ||Buffer.byteLength(value.login_name)>256||findCredentialPath(value))throw Error('ADMIN_PROVISION_IDENTITY_INVALID');
 return structuredClone(value);
}
export function buildAdminProvisionRequest(input){
 if(!closed(input,'admin,installationRecordSha256,operationId,setupReference')||!uuid(input.operationId)||!digest(input.installationRecordSha256)
  ||typeof input.setupReference!=='string'||!input.setupReference.trim()||!input.setupReference.isWellFormed()
  ||input.setupReference.includes('\0'))throw Error('ADMIN_PROVISION_REQUEST_INVALID');
 const request={format_version:'FIRST_ADMIN_SETUP_V1',mode:'ADMIN_PROVISION_ONLY',operation_id:input.operationId,
  request_key:'admin-provision-only-v1:'+input.operationId,admin:adminIdentity(input.admin),
  installation_record_sha256:input.installationRecordSha256,setup_reference:input.setupReference};
 if(findCredentialPath(request))throw Error('ADMIN_PROVISION_PUBLIC_CREDENTIAL');
 return Object.freeze(request);
}

/** Compile only from the original active, fully preflighted REAL stream plan.
 * Every source row/counter/effect and historical authorization is retained.
 * This changes initialization origin, never source identities or stock facts. */
export async function buildProvisionedAdminStreamProgram(plan,indexPath,summary,admin,provision,options={}){
 assertActiveStreamPlan(plan);
 if(plan.common.package_kind!=='REAL')throw Error('ADMIN_PROVISION_REAL_PLAN_REQUIRED');
 admin=adminIdentity(admin);
 if(!closed(provision,'operation_id,request_sha256')||!uuid(provision.operation_id)||!digest(provision.request_sha256))throw Error('ADMIN_PROVISION_RECEIPT_BINDING_INVALID');
 provision=structuredClone(provision);
 const original=await buildStreamProgram(plan,indexPath,summary,admin,options);
 const planSha256=requestHash({format_version:'PROVISIONED_ADMIN_STANDARD_PROGRAM_V1',source_plan_sha256:original.identity.planSha256,
  mode:PROVISIONED_ADMIN_IMPORT_MODE,provision_operation_id:provision.operation_id,provision_request_sha256:provision.request_sha256,admin});
 const rebind=request=>{
  const r=structuredClone(request);r.plan_sha256=planSha256;
  r.operation_id=stableImportId('provisioned-admin-import-operation-v1',planSha256,request.operation_id);r.request_key=r.operation_id;
  return r;
 };
 const initialize=rebind(original.initialize);
 initialize.payload.mode=PROVISIONED_ADMIN_IMPORT_MODE;
 initialize.payload.provision_operation_id=provision.operation_id;
 initialize.payload.provision_request_sha256=provision.request_sha256;
 async function* steps(){for await(const step of original.steps)yield {...step,request:rebind(step.request)};}
 return {identity:{...original.identity,planSha256},initialize,steps:steps()};
}
