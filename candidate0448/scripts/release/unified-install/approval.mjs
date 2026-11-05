/** External controller approval parser; this module never writes an approval. */
import {captureData} from '../../../tests/integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import {describeUnifiedInstallPlan,need,hash,freeze} from './source-plan.mjs';
import {targetDescriptor} from './target-contract.mjs';
const approvals=new WeakMap();
export function readSchemaExecutionApproval(input,now=Date.now()){
 const a=captureData(input,['bytes','trustedSha256','plan','target']);need(Buffer.isBuffer(a.bytes)&&a.bytes.length<=65536&&/^[a-f0-9]{64}$/.test(a.trustedSha256)&&hash(a.bytes)===a.trustedSha256,'INDEPENDENT_EXECUTION_APPROVAL_BYTES_REQUIRED');
 const p=describeUnifiedInstallPlan(a.plan),t=targetDescriptor(a.target);need(p.requestedScope==='SCHEMA_ONLY','REQUESTED_ACL_SCOPE_NOT_IMPLEMENTED_NO_SQL');
 const v=captureData(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(a.bytes)),['version','decision','scope','planSha256','targetSha256','sourceCommit','startsAt','expiresAt','productionAuthorized','unknownOutcomePolicy','resourcePolicy']);
 need(v.version==='UNIFIED_NEW_EMPTY_SCHEMA_EXECUTION_V1'&&v.decision==='AUTHORIZE_EXACT_FRESH_SCHEMA_SOURCE_ONLY'&&v.scope==='FRESH_ISOLATED_SCHEMA_ONLY_NOT_RUNTIME'&&v.productionAuthorized===false,'SCHEMA_ONLY_INDEPENDENT_APPROVAL_REQUIRED');
 need(v.planSha256===p.planSha256&&v.targetSha256===hash(JSON.stringify(t))&&/^[a-f0-9]{40}$/.test(v.sourceCommit)&&v.sourceCommit!==p.base.commit,'REVIEWED_SUCCESSOR_SOURCE_COMMIT_AND_EXACT_PLAN_TARGET_REQUIRED');
 need(v.startsAt===t.startsAt&&v.expiresAt===t.expiresAt&&Number.isSafeInteger(now)&&v.startsAt<=now&&now<v.expiresAt,'ORIGINAL_TARGET_APPROVAL_WINDOW_REQUIRED');
 need(v.unknownOutcomePolicy==='QUARANTINE_CLOSE_READBACK_ORIGINAL_KEYS_NO_REPLAY'&&v.resourcePolicy==='CLOSE_CAPTURED_CLIENT_PRESERVE_DATABASE_AND_JOURNAL','EXPLICIT_OUTCOME_AND_RESOURCE_POLICY_REQUIRED');
 const token=Object.freeze({profile:'UNIFIED_SCHEMA_EXECUTION_APPROVAL_V1'});approvals.set(token,freeze({...v,sha256:a.trustedSha256,plan:a.plan,target:a.target}));return token;
}
export function assertSchemaExecutionApproval(token,plan,target){const a=approvals.get(token);need(a&&a.plan===plan&&a.target===target,'ORIGINAL_EXTERNAL_SCHEMA_APPROVAL_REQUIRED');need(Date.now()<a.expiresAt,'SCHEMA_APPROVAL_EXPIRED');return a;}
