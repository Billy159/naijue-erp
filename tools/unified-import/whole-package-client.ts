import { validateStandardImportRequest } from '../../packages/application/src/unified-import-execution.ts';
import type { StandardImportRequest, StandardImportStep } from '../../packages/application/src/unified-import-execution.ts';
/** Streaming transaction coordinator only. It is not a DB kernel, installer,
 * validator or authorization capability. Do not wire to CLI until the concrete
 * same-client kernel, actor and target pass real PostgreSQL verification. */
export interface WholePackageIdentity { readonly batchId:string; readonly documentBatchId:string; readonly packageSha256:string; readonly planSha256:string; readonly namespace:string; readonly cutoffAt:string }
export interface WholePackageClient { query(sql:string,values?:unknown[]):Promise<{readonly command?:string;readonly rows?:readonly Record<string,unknown>[]}>; discard():void|Promise<void> }
export interface WholePackageKernel<C extends WholePackageClient> {
 /** Lock existing batch/key inside this transaction; conflicting hashes fail. */
 lockAndInspect(client:C,identity:WholePackageIdentity,initialize:StandardImportRequest):Promise<{readonly state:'ABSENT'}|{readonly state:'COMMITTED';readonly packageSha256:string;readonly planSha256:string;readonly summary:unknown}>;
 /** Initialize original request in this transaction; secret stays inside kernel. */
 initialize(client:C,identity:WholePackageIdentity,request:StandardImportRequest):Promise<void>;
 /** Apply the full original request on this exact client with no transaction control. */
 applyStep(client:C,step:StandardImportStep,ordinal:number):Promise<void>;
 /** Read actual counts/totals after both in-transaction publication steps. */
 summarize(client:C,identity:WholePackageIdentity):Promise<unknown>;
}
export type WholePackageResult={readonly state:'COMMITTED'|'ALREADY_COMMITTED';readonly summary:unknown}|{readonly state:'ROLLED_BACK'|'UNKNOWN';readonly code:string};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const activeClients=new WeakSet<object>(),quarantinedClients=new WeakSet<object>();
/** Holds at most the current bounded request. Caller owns preflight and source
 * immutability; a simulated kernel is not proof of SQL atomicity or access. */
export async function executeWholePackage<C extends WholePackageClient>(client:C,identity:WholePackageIdentity,initialize:StandardImportRequest,steps:AsyncIterable<StandardImportStep>,kernel:WholePackageKernel<C>):Promise<WholePackageResult>{
 if(!client||typeof client.query!=='function'||typeof client.discard!=='function'||!identity||typeof identity.batchId!=='string'||!UUID.test(identity.batchId)||typeof identity.documentBatchId!=='string'||!UUID.test(identity.documentBatchId)||identity.batchId===identity.documentBatchId||typeof identity.packageSha256!=='string'||!/^[a-f0-9]{64}$/.test(identity.packageSha256)||typeof identity.planSha256!=='string'||!/^[a-f0-9]{64}$/.test(identity.planSha256)||typeof identity.namespace!=='string'||!identity.namespace||typeof identity.cutoffAt!=='string'||!steps||typeof steps[Symbol.asyncIterator]!=='function'||!kernel||typeof kernel.lockAndInspect!=='function'||typeof kernel.initialize!=='function'||typeof kernel.applyStep!=='function'||typeof kernel.summarize!=='function')throw new TypeError('WHOLE_PACKAGE_INPUT_INVALID');
 identity=Object.freeze({...identity}); initialize=structuredClone(initialize);
 const bind=(r:StandardImportRequest,batch:string)=>{validateStandardImportRequest(r);if(r.batch_id!==batch||r.package_manifest_sha256!==identity.packageSha256||r.plan_sha256!==identity.planSha256||r.namespace!==identity.namespace||r.cutoff_at!==identity.cutoffAt)throw Error('REQUEST_BINDING_INVALID');};
 bind(initialize,identity.batchId);if(initialize.payload.document_batch_id!==identity.documentBatchId)throw TypeError('INITIALIZE_DOCUMENT_BATCH_INVALID');
 if(activeClients.has(client)||quarantinedClients.has(client))throw Error('CLIENT_UNAVAILABLE');
 activeClients.add(client);let began=false,commitAttempted=false,controlUncertain=false;
 try{
  const start=await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');if(start?.command!=='BEGIN')throw Error('BEGIN_ACK_INVALID');began=true;
  const existing=await kernel.lockAndInspect(client,identity,initialize);
  if(existing.state==='COMMITTED'){
   if(existing.packageSha256!==identity.packageSha256||existing.planSha256!==identity.planSha256)throw Error('BATCH_ID_CONFLICT');
   commitAttempted=true;const ack=await client.query('COMMIT');if(ack?.command!=='COMMIT')throw Error('COMMIT_ACK_INVALID');return {state:'ALREADY_COMMITTED',summary:existing.summary};
  }
  if(existing.state!=='ABSENT')throw Error('BATCH_STATE_INVALID');
  await kernel.initialize(client,identity,initialize);
  let phase=0,ordinal=1,baselinePublished=false,documentStaged=false,documentPublished=false;
  for await(const incoming of steps){
   const step=structuredClone(incoming);
   if(!step||!step.request||typeof step.method!=='string')throw Error('STEP_INVALID');
   const payload=step.request.payload;let rank:number,batch:string;
   if(step.method==='masterChunk'){rank=0;batch=identity.batchId;}
   else if(step.method==='baselineKeys'){rank=1;batch=identity.batchId;}
   else if(step.method==='publish'&&payload?.phase==='BASELINE'){rank=2;batch=identity.batchId;if(baselinePublished)throw Error('STEP_ORDER_INVALID');baselinePublished=true;}
   else if(step.method==='documentChunk'&&payload?.mode==='STAGE'){rank=3;batch=identity.documentBatchId;if(documentStaged||!baselinePublished)throw Error('STEP_ORDER_INVALID');documentStaged=true;}
   else if(step.method==='documentChunk'&&payload?.mode==='CHUNK'){rank=4;batch=identity.documentBatchId;if(!documentStaged)throw Error('STEP_ORDER_INVALID');}
   else if(step.method==='publish'&&payload?.phase==='DOCUMENTS'){rank=5;batch=identity.documentBatchId;if(documentPublished||!documentStaged)throw Error('STEP_ORDER_INVALID');documentPublished=true;}
   else throw Error('STEP_INVALID');
   if(rank<phase||documentPublished&&rank!==5)throw Error('STEP_ORDER_INVALID');phase=rank;bind(step.request,batch);
   if('rows' in payload&&(!Array.isArray(payload.rows)||payload.rows.length>500))throw Error('CHUNK_BOUND_INVALID');
   if(!Number.isSafeInteger(ordinal))throw Error('STEP_LIMIT_EXCEEDED');
   await kernel.applyStep(client,step,ordinal++);
  }
  if(!baselinePublished||!documentStaged||!documentPublished)throw Error('PUBLISH_INCOMPLETE');
  const summary=await kernel.summarize(client,identity);
  const constraintAck=await client.query('SET CONSTRAINTS ALL IMMEDIATE');if(constraintAck?.command!=='SET'){controlUncertain=true;throw Error('CONSTRAINTS_ACK_INVALID');}
  commitAttempted=true;const ack=await client.query('COMMIT');if(ack?.command!=='COMMIT')throw Error('COMMIT_ACK_INVALID');return {state:'COMMITTED',summary};
 }catch(error){
  if(began&&!commitAttempted&&!controlUncertain){try{const ack=await client.query('ROLLBACK');if(ack?.command==='ROLLBACK')return {state:'ROLLED_BACK',code:error instanceof Error&&/^[A-Z][A-Z0-9_]{0,80}$/.test(error.message)?error.message:'IMPORT_FAILED'};}catch{/* no acknowledgement: outcome unknown */}}
  quarantinedClients.add(client);try{await client.discard();}catch{/* remains unusable */}return {state:'UNKNOWN',code:'TRANSACTION_OUTCOME_UNKNOWN'};
 }finally{activeClients.delete(client);}
}
