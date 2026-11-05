/** Native captured-client adapter. Creating/connecting the client remains the
 * separately authorized controller's job. No callback can claim native origin. */
import {physicalClientFence} from '../../../tests/performance/opt02/legacy-cutoff/physical-send.mjs';
import {createGlobalGate,outcomeBoundary} from '../../../tests/performance/opt02/current-native-stock/sequence-acl-micro/contract.mjs';
import {budgetedQuery,settleClient,captureData} from '../../../tests/integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import {assertSchemaExecutionApproval} from './approval.mjs';
import {assertFreshTarget,targetDescriptor,freshTargetGuard} from './target-contract.mjs';
import {need,assertUnifiedInstallSources} from './source-plan.mjs';
import {assertUnifiedExecutionSource,assertUnifiedExecutionFiles} from './commit-proof.mjs';
const adapters=new WeakMap();
/** Pure protocol-state predicate, NOT a native-client/target authority brand. */
export function assertInstallClientProtocolState(client,{idle=false}={}){const data=key=>{const d=Object.getOwnPropertyDescriptor(client,key);need(d&&Object.hasOwn(d,'value'),'OWN_NATIVE_PROTOCOL_DATA_REQUIRED');return d.value;};const active=data('_activeQuery');need(data('pipeline')===false&&data('readyForQuery')===true&&(active===null||active===undefined)&&Array.isArray(data('_queryQueue'))&&data('_queryQueue').length===0&&Array.isArray(data('_sentQueryQueue'))&&data('_sentQueryQueue').length===0&&data('_queryable')===true&&data('_ending')===false&&data('_ended')===false&&(!idle||data('_txStatus')==='I'),'EXCLUSIVE_IDLE_NATIVE_INSTALL_PROTOCOL_REQUIRED');}
export async function captureUnifiedInstallClient(input){
 need(process.version==='v24.21.0'&&!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&process.env.NODE_PG_FORCE_NATIVE===undefined,'PINNED_NODE_AND_NO_PRELOAD_OR_NATIVE_OVERRIDE_REQUIRED');
 const a=captureData(input,['client','plan','target','program','approval','sourceProof']);assertFreshTarget(a.target);const approval=assertSchemaExecutionApproval(a.approval,a.plan,a.target);assertUnifiedExecutionSource(a.sourceProof,approval.sourceCommit);await assertUnifiedInstallSources(a.plan);
 const {schemaProgramAllowedQueries}=await import('./runner.mjs');const allowedSql=new Set(await schemaProgramAllowedQueries(a.program,a.plan,a.target));
 const {Client}=await import('pg'),t=targetDescriptor(a.target),c=a.client;
 need(c instanceof Client&&Object.getPrototypeOf(c)===Client.prototype&&c.query===Client.prototype.query&&c._connected===true,'CONNECTED_ORIGINAL_NATIVE_PG_CLIENT_REQUIRED');
 assertInstallClientProtocolState(c,{idle:true});
 const p=c.connectionParameters;need(p&&p.database===t.intent.database&&p.user===t.intent.admin&&p.host==='127.0.0.1'&&Number(p.port)===t.intent.port&&!p.ssl,'CLIENT_CONFIGURATION_MUST_MATCH_NEW_TARGET_BEFORE_ANY_QUERY');
 const gate=createGlobalGate(),physical=physicalClientFence(c,gate),fenced=Object.freeze({connection:physical.connection,query(...args){try{assertInstallClientProtocolState(c);}catch(error){gate.quarantine(error);throw error;}return physical.query(...args);}}),budget={remaining(){const now=Date.now();need(now>=t.startsAt&&now<t.expiresAt,'ORIGINAL_INSTALL_WINDOW_EXPIRED');return t.expiresAt-now;}};
 const token=Object.freeze({profile:'UNIFIED_CAPTURED_INSTALL_CLIENT_V1'});adapters.set(token,{client:c,plan:a.plan,target:a.target,approval:a.approval,sourceProof:a.sourceProof,gate,fenced,budget,allowedSql,closed:false});
 try{
  // First wire operation is the exact owned/EMPTY guard, not a timeout SET on
  // an unverified connection. Every subsequent physical send has the same gate.
  try{await fenced.query({text:freshTargetGuard(a.target,{requireEmpty:true}),values:[],query_timeout:Math.min(45000,budget.remaining())});}
  catch(error){if(error?.message==='Query read timeout')try{fenced.connection?.stream?.destroy();}catch{}throw error;}
  assertInstallClientProtocolState(c,{idle:true});
  return token;
 }catch(error){const closed=await closeUnifiedInstallClient(token);if(!closed.confirmed)throw new AggregateError([error,new Error('INSTALL_CAPTURE_CLOSE_UNCONFIRMED')],'TARGET_REFUSED_AND_CLOSE_UNCONFIRMED',{cause:error});throw error;}
}
function installAdapterState(token,plan,target){const s=adapters.get(token);need(s&&!s.closed&&s.plan===plan&&s.target===target,'GENUINE_LIVE_CAPTURED_INSTALL_CLIENT_REQUIRED');return s;}
export function assertUnifiedInstallAdapter(token,plan,target){const s=installAdapterState(token,plan,target);return Object.freeze({quarantined:()=>s.gate.quarantined()});}
export async function assertInstallAdapterSources(token,plan,target){const s=installAdapterState(token,plan,target),a=assertSchemaExecutionApproval(s.approval,plan,target);await assertUnifiedExecutionFiles(s.sourceProof,a.sourceCommit);await assertUnifiedInstallSources(plan);s.budget.remaining();}
export async function installQuery(token,plan,target,sql,{commit=false,cleanup=false}={}){const s=installAdapterState(token,plan,target);need(typeof sql==='string'&&s.allowedSql.has(sql)&&(!cleanup||sql==='ROLLBACK'),'EXACT_SCHEMA_PROGRAM_SQL_OR_ROLLBACK_REQUIRED');if(!cleanup)assertSchemaExecutionApproval(s.approval,plan,target);const work=()=>budgetedQuery(s.fenced,sql,[],s.budget,cleanup);return commit?outcomeBoundary(s.gate,work,'MICRO_COMMIT_OUTCOME_UNKNOWN_NO_REPLAY'):work();}
export async function closeUnifiedInstallClient(token){const s=adapters.get(token);need(s,'CAPTURED_INSTALL_CLIENT_REQUIRED');if(!s.closePromise)s.closePromise=(async()=>{s.closed=true;return settleClient(s.client);})();return s.closePromise;}
