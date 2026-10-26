import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {identitySql,birthSql,memberSql,maintenanceSql,warehousesSql,claimsSql,columns,proofShape,memberKeys} from './projection-sql.mjs';
const must=(v,message)=>{if(!v)throw Error(message);};
const exact=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const positive=v=>(typeof v==='number'&&Number.isSafeInteger(v)&&v>0)||(typeof v==='string'&&/^[1-9][0-9]*$/.test(v));
export function matchesShape(value,shape){
 if(typeof shape==='string')return shape.split('|').includes(value===null?'null':typeof value);
 if(Array.isArray(shape))return Array.isArray(value)&&value.length===1&&matchesShape(value[0],shape[0]);
 return exact(value,Object.keys(shape))&&Object.entries(shape).every(([k,s])=>matchesShape(value[k],s));
}
export function assembleProjection({birth,members,warehouses,claims},projectNative){
 const missing=[],coreMembers=[],staffProofs=[],maintained=[],items=[];
 const missingItem=(code,sourceRowId)=>missing.push(sourceRowId?{code,sourceRowId}:{code});
 const counts={HALL:0,WAREHOUSE:0,STAFF:0,CUSTOMER:0};
 const seen=new Set(),nativeIds=new Set(),proofAccounts=new Set();let direct=0,currentPerson=0;
 for(const m of birth.members??[]){
  if(!exact(m,memberKeys)||!Object.hasOwn(counts,m.entity)||!uuid(m.sourceRowId)||!uuid(m.nativeId)||!m.sourceKey||seen.has(m.sourceRowId)||nativeIds.has(m.nativeId)){missingItem('INVALID_OR_DUPLICATE_CORE_BIRTH_MEMBER');continue;}
  seen.add(m.sourceRowId);nativeIds.add(m.nativeId);counts[m.entity]++;coreMembers.push(structuredClone(m));
  const rows=members.filter(r=>r.source_row_id===m.sourceRowId);
  if(rows.length!==1){missingItem('CORE_EVIDENCE_OR_CURRENT_NATIVE_MISSING',m.sourceRowId);continue;}
  const r=rows[0];
  if(r.entity_type!==m.entity||r.source_key!==m.sourceKey||r.native_id!==m.nativeId||r.source_equal!==true){missingItem('CORE_SOURCE_IDENTITY_CHANGED',m.sourceRowId);continue;}
  try{projectNative(m.entity.toLowerCase(),r.birth_snapshot);projectNative(m.entity.toLowerCase(),r.current_snapshot);}catch{missingItem('ORIGINAL_NATIVE_PROJECTION_REJECTED',m.sourceRowId);continue;}
  if(r.birth_snapshot.id!==m.nativeId||r.birth_snapshot.version!==1||r.current_snapshot.id!==m.nativeId||!Number.isSafeInteger(r.current_snapshot.version)||r.current_snapshot.version<1){missingItem('NATIVE_VERSION_OR_ID_CHANGED',m.sourceRowId);continue;}
  if(m.entity==='CUSTOMER'&&[r.birth_snapshot.created_at,r.birth_snapshot.updated_at,r.current_snapshot.created_at,r.current_snapshot.updated_at].some(v=>v!==null)){missingItem('HISTORICAL_CUSTOMER_TIME_MUST_REMAIN_NULL',m.sourceRowId);continue;}
  const chain=r.chain;
  if(!chain||chain.matches_current!==true||chain.depth!==r.current_snapshot.version-1||!Array.isArray(chain.operations)||chain.operations.length!==chain.depth){missingItem('ORIGINAL_MAINTENANCE_CHAIN_MISSING_OR_OVER_256',m.sourceRowId);continue;}
  let version=1;const ops=new Set();let valid=true;
  for(const op of chain.operations){if(!exact(op,['operationId','fromVersion','toVersion'])||!uuid(op.operationId)||ops.has(op.operationId)||op.fromVersion!==version||op.toVersion!==version+1){valid=false;break;}ops.add(op.operationId);version++;}
  if(!valid){missingItem('MAINTENANCE_CHAIN_NOT_CONTIGUOUS',m.sourceRowId);continue;}
  maintained.push({...structuredClone(m),version:r.current_snapshot.version,nativeSnapshot:structuredClone(r.current_snapshot),operations:structuredClone(chain.operations)});
  if(m.entity==='STAFF'){
   const p=r.bootstrap_accounts;
   if(r.proof_link_ok!==true||!matchesShape(p,proofShape)){missingItem('ORIGINAL_SAFE_BOOTSTRAP_PROOF_MISSING',m.sourceRowId);continue;}
   const a=p.raw.accounts[0],s=a.native_snapshot;
   const linked=a.identity_link_kind==='DIRECT_ORIGINAL_EMPLOYEE_V1'&&typeof a.source_employee_native_id==='string'&&a.source_employee_native_id.length>0&&typeof a.source_employee_code==='string'&&a.source_employee_code.length>0&&a.current_person_key===null&&a.source_plan_row===null;
   const planned=a.identity_link_kind==='APPROVED_CURRENT_PERSON_PLAN_V1'&&a.source_employee_native_id===null&&a.source_employee_code===null&&typeof a.current_person_key==='string'&&a.current_person_key.length>0&&positive(a.source_plan_row);
   if(!uuid(s.id)||s.staff_id!==m.nativeId||s.version!==1||s.auth_version!==1||!uuid(a.source_account_id)||!positive(a.source_account_version)||proofAccounts.has(s.id)||!(linked||planned)){
    missingItem('ORIGINAL_BOOTSTRAP_IDENTITY_LINK_INVALID',m.sourceRowId);continue;
   }
   proofAccounts.add(s.id);if(linked)direct++;else currentPerson++;
   // Preserve the entire original object. No redaction/reconstruction is treated as proof.
   staffProofs.push({sourceRowId:m.sourceRowId,bootstrapAccounts:structuredClone(p)});
  }
 }
 if(!isDeepStrictEqual(counts,{HALL:22,WAREHOUSE:22,STAFF:49,CUSTOMER:22}))missingItem('CORE_BIRTH_ENTITY_COUNTS_NOT_22_22_49_22');
 if(direct!==45||currentPerson!==4)missingItem('BOOTSTRAP_LINK_COUNTS_NOT_45_4');
 const recordIds=new Set(),warehouseIds=new Set(),keys=new Set();
 for(const r of warehouses){
  const n=r.warehouse_record;
  if(r.source_equal!==true||!uuid(r.native_id)||!hash(r.row_sha256)||typeof r.file_ref!=='string'||!r.file_ref||typeof r.source_key!=='string'||!r.source_key||!exact(n,['id','reviewedAt','decisionReason'])||!uuid(n.id)||typeof n.reviewedAt!=='string'||!Number.isFinite(Date.parse(n.reviewedAt))||typeof n.decisionReason!=='string'||!n.decisionReason||recordIds.has(n.id)||warehouseIds.has(r.native_id)||keys.has(r.source_key)){
   missingItem('WAREHOUSE_ORIGINAL_ITEM_MISSING_OR_CONFLICTING',r.source_row_id);continue;
  }
  recordIds.add(n.id);warehouseIds.add(r.native_id);keys.add(r.source_key);
  items.push({targetType:'WAREHOUSE',targetId:r.native_id,sourceEntityType:'WAREHOUSE',sourceKey:r.source_key,sourceRecordHash:r.row_sha256,sourceFileRef:r.file_ref,nativeRecord:structuredClone(n)});
 }
 const claimIds=new Set(),claimTargets=new Set();
 for(const c of claims){if(c.claim_ok!==true||claimIds.has(c.import_record_id)||claimTargets.has(c.target_id)||!items.some(w=>w.targetId===c.target_id&&w.nativeRecord.id===c.import_record_id)){missingItem('ORIGINAL_CORE_CLAIM_MISMATCH');continue;}claimIds.add(c.import_record_id);claimTargets.add(c.target_id);}
 if(claimIds.size!==22||claims.length!==22)missingItem('ORIGINAL_CORE_22_CLAIMS_MISSING');
 if(items.length!==53||warehouses.length!==53)missingItem('FULL_WAREHOUSE_53_ITEMS_MISSING_OR_OVERFLOW');
 if(coreMembers.length!==115||maintained.length!==115||staffProofs.length!==49)missingItem('CORE_115_OR_PROOF_49_INCOMPLETE');
 return {coreMembers,staffProofs,coreMaintenanceBinding:{version:'CORE_MAINTENANCE_BINDING_V1',members:maintained},warehouses:items,
  originalCoreClaimRecordIds:[...claimIds],dataComplete:missing.length===0,missing,
  authorityPending:['actual full authorizedPayloadHash','original independent coreProjection.verify callback','original locked readCoreImportContinuation26 and later full-binding verification'],
  publicationAuthorized:false};
}
// T45 supplies the ORIGINAL leased client already inside its RR READ ONLY transaction.
// This function never opens a pool, starts/ends a transaction, issues a capability or writes a receipt.
export async function exportProjection26({input,client,runtime26}){
 must(input?.executionEnabled===true,'READ_PROJECTION_DISABLED');
 must(typeof input.sourceRoot==='string'&&input.sourceRoot.startsWith('/')&&typeof input.sourceRef==='string'&&input.sourceRef.length>0,'ORIGINAL_SOURCE_REFERENCE_REQUIRED');
 must(typeof input.runtimeReviewFile==='string'&&hash(input.runtimeReviewSha256)&&input.expectedCheckpoint!==null&&input.cutoffAt,'DYNAMIC_ORIGINAL_REVIEW_CHECKPOINT_CUTOFF_REQUIRED');
 const t=input.target;
 must(t&&typeof t.database==='string'&&t.databaseOid&&t.role&&t.sessionUser&&Object.hasOwn(t,'serverAddress')&&Object.hasOwn(t,'serverPort')&&typeof t.postmasterStartedAt==='string','EXACT_CURRENT_TARGET_REQUIRED');
 const b=input.identity;
 must(b&&uuid(b.batchId)&&uuid(b.coreReceiptId)&&uuid(b.actorAccountId)&&hash(b.selectionSha256)&&hash(b.coreSourceDigest)&&typeof b.fixedSourceNamespace==='string','ORIGINAL_BATCH_BINDING_REQUIRED');
 const url=p=>pathToFileURL(resolve(input.sourceRoot,p)).href;
 const {checkedNativeRuntime26Capability}=await import(url('packages/application/src/native-import-schema-contract.ts'));
 const {historyClosureProjectionRow26}=await import(url('packages/application/src/history-typed-closure.ts'));
 const runtime=checkedNativeRuntime26Capability(runtime26);must(runtime,'ORIGINAL_RUNTIME26_REQUIRED');
 const initial=(await client.query(identitySql)).rows;must(initial.length===1,'ONE_TARGET_IDENTITY_REQUIRED');const observed=initial[0].identity;
 must(observed.readOnly==='on'&&observed.isolation==='repeatable read'&&observed.replicationRole==='origin','EXISTING_RR_READ_ONLY_REQUIRED');
 for(const k of ['database','databaseOid','role','sessionUser','serverAddress','serverPort','postmasterStartedAt'])must(observed[k]===t[k],`TARGET_MISMATCH_${k}`);
 await runtime.assertReady(client,'IMPORT_STAGE');
 // Original capability verifies this borrowed lease before/after the bounded pass;
 // the original issued client retains its own query/lease checks throughout.
 const query=async(sql,parameters)=>(await client.query(sql,parameters)).rows;
 const births=await query(birthSql,[b.batchId,b.coreReceiptId,b.coreSourceDigest]);must(births.length===1,'ORIGINAL_CORE_BIRTH_NOT_UNIQUE');const birth=births[0];
 must(birth.birth_link_ok===true&&birth.batch_id===b.batchId&&birth.source_name===b.fixedSourceNamespace&&birth.source_hash===b.selectionSha256&&birth.actor_account_id===b.actorAccountId&&birth.core_source_digest===b.coreSourceDigest&&birth.status==='STAGED','ORIGINAL_CORE_BIRTH_BINDING_CHANGED');
 must(Date.parse(birth.cutoff_at)===Date.parse(input.cutoffAt)&&isDeepStrictEqual(birth.checkpoint,input.expectedCheckpoint),'CURRENT_CUTOFF_CHECKPOINT_CHANGED');
 must(Array.isArray(birth.members)&&birth.members.length===115,'ORIGINAL_CORE_115_NOT_SAFE');
 must(birth.checkpoint.cursor===22&&birth.checkpoint.sequence>=1&&isDeepStrictEqual(birth.checkpoint.counts,{WAREHOUSE:22,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0}),'PRE_MAIN_CORE_CHECKPOINT_REQUIRED');
 const members=[];
 for(const m of birth.members){
  must(exact(m,memberKeys)&&Object.hasOwn(columns,m.entity)&&uuid(m.sourceRowId)&&uuid(m.nativeId),'ORIGINAL_CORE_MEMBER_INVALID');
  const rows=await query(memberSql,[b.batchId,m.sourceRowId,m.nativeId,m.entity,b.coreReceiptId,b.coreSourceDigest]);
  if(rows.length!==1)continue;const r=rows[0];
  if(r.birth_snapshot&&r.current_snapshot&&Number.isSafeInteger(r.current_snapshot.version)&&r.current_snapshot.version>=1&&r.current_snapshot.version<=257){
   const chains=await query(maintenanceSql(m.entity),[m.entity,m.nativeId,JSON.stringify(r.birth_snapshot),JSON.stringify(r.current_snapshot),birth.completed_at]);
   // Unique version indexes are part of the original reviewed schema. Keep only the deepest exact chain.
   r.chain=chains[0]??null;
  }
  members.push(r);
 }
 const warehouses=await query(warehousesSql,[b.batchId]);const claims=await query(claimsSql,[b.batchId,b.coreReceiptId]);
 const data=assembleProjection({birth,members,warehouses,claims},historyClosureProjectionRow26);
 await runtime.assertReady(client,'IMPORT_STAGE');const final=(await client.query(identitySql)).rows;
 must(final.length===1&&isDeepStrictEqual(final[0].identity,observed),'LEASE_OR_TARGET_CHANGED');
 const output={sourceRef:input.sourceRef,runtimeReviewFile:input.runtimeReviewFile,runtimeReviewSha256:input.runtimeReviewSha256,
  identity:structuredClone(b),target:observed,cutoffAt:birth.cutoff_at,mappingVersion:birth.mapping_version,checkpoint:birth.checkpoint,
  originalCoreCommandHash:birth.command_hash,originalCoreCompletedAt:birth.completed_at,...data};
 must(Buffer.byteLength(JSON.stringify(output))<=4*1024*1024,'FINITE_PROJECTION_OVER_4_MIB_NO_TRUNCATION');return output;
}
