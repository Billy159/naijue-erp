import {sameActiveWholeHostSession} from '../../../tools/unified-import/whole-host-session.mjs';
/** A capability exists only during verified same-client host work. It cannot be
 * serialized, reconstructed from JSON, retained after return or self-issued. */
import {consumeWholeSalesVerificationV1} from './whole-sales-catalog-v1.mjs';
import {validateStandardImportTarget} from '../../../packages/application/src/unified-import-execution.ts';
const admissions=new WeakMap();
const need=(ok,code)=>{if(!ok)throw Error(code)};
function sameTarget(target,verified){return ['protocol','system_identifier','database_oid','database_name','catalog_sha256'].every(key=>target[key]===(key==='protocol'?'STANDARD_IMPORT_SQL_V1':verified[key]))}
export function assertWholeSalesAdmissionV1(admission,target,client){
 const binding=admission&&typeof admission==='object'?admissions.get(admission):undefined;
 need(binding?.active===true,'WHOLE_SALES_ADMISSION_REQUIRED');validateStandardImportTarget(target);
 need(sameTarget(target,binding.verified)&&(!client||client===binding.client),'WHOLE_SALES_ADMISSION_TARGET_DIFFERS');
 return binding.verified.source_profile_sha256;
}
export async function withVerifiedWholeSalesAdmissionV1(verified,verifiedClient,executionClient,target,work){
 consumeWholeSalesVerificationV1(verified,verifiedClient);
 need(sameActiveWholeHostSession(verifiedClient,executionClient),'WHOLE_SALES_SAME_SESSION_REQUIRED');
 validateStandardImportTarget(target);target=structuredClone(target);
 need(sameTarget(target,verified),'WHOLE_SALES_ADMISSION_TARGET_DIFFERS');
 const admission=Object.freeze({profile:'WHOLE_SALES_EXECUTION_ADMISSION_V1'}),binding={client:executionClient,verified,active:true};
 admissions.set(admission,binding);
 try{return await work(admission,verified)}finally{binding.active=false;admissions.delete(admission)}
}
