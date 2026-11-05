/** Explicit pool supplied by a future owned-cluster host. No pool/engine on import. */
import {PostgresCutoffImportStore} from '../../../../adapters/postgres/src/inventory-cutoff-import-store.ts';
import {createCutoffImportService} from '../../../../packages/application/src/inventory-cutoff-import.ts';
import {requestHash} from '../../../../packages/application/src/request-hash.ts';
import {buildLegacyCutoffFixture,need} from './fixture.mjs';
import {createExactLegacySourceAuthorizer} from './source-authorizer.mjs';
export function createOriginalLegacyPublication({pool,readArtifact,now,beforeCommand,onAcknowledged}){
 need(typeof pool?.connect==='function'&&typeof now==='function'&&typeof beforeCommand==='function'&&typeof onAcknowledged==='function','EXPLICIT_CAPTURED_POOL_BUDGET_GUARD_CLOCK_AND_ACK_REQUIRED');
 const f=buildLegacyCutoffFixture(),authorization=createExactLegacySourceAuthorizer(readArtifact),service=createCutoffImportService({store:new PostgresCutoffImportStore(pool),authorization,now});let started=false;
 return Object.freeze({async execute(){need(!started,'ONE_ATTEMPT_NO_REPLAY');started=true;await authorization.verify();const results=[];for(let i=0;i<f.commands.length;i++){await beforeCommand(i);const actual=await service.execute(f.commands[i]);need(requestHash(actual)===requestHash(f.expectedResults[i]),'ACTUAL_SERVICE_RESULT_DIFFERS_FROM_SOURCE_PLAN');await onAcknowledged(i,actual);results.push(actual);}return Object.freeze({scope:f.scope,actualResults:Object.freeze(results),publishedByOriginalService:true,normalRuntimeAdmission:false,v2HistoryPublication:false});}});
}
/** Observer for an ACKNOWLEDGED command, not an unknown-COMMIT resolver. Host must
 * gate ALL wire queries (including these) and never call this on uncertain outcome. */
export async function verifyAcknowledgedReceipt(query,index,result){
 const f=buildLegacyCutoffFixture();need(Number.isInteger(index)&&index>=0&&index<f.commands.length,'CLOSED_COMMAND_INDEX_REQUIRED');need(requestHash(result)===requestHash(f.expectedResults[index]),'EXACT_ACKNOWLEDGED_RESULT_REQUIRED');const command=f.commands[index];
 const receipts=(await query(`/* opt02-legacy:ack-receipt */ SELECT id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,
 to_char(completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') completed_at FROM naijue_erp.operation_receipt WHERE id=$1::uuid`,[result.operationId])).rows;
 need(receipts.length===1,'ONE_ACTUAL_RECEIPT_REQUIRED');const r=receipts[0];need(r.id===result.operationId&&r.actor_account_id===command.actorAccountId&&r.request_key===command.requestKey&&r.request_hash===f.commandHashes[index]&&r.action===command.action&&r.target_type==='IMPORT'&&r.target_id===f.batchId&&r.status==='COMMITTED'&&requestHash(r.result_data)===requestHash(result),'ACTUAL_RECEIPT_NOT_ORIGINAL_COMMAND');
 const audits=(await query(`/* opt02-legacy:ack-audit */ SELECT operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,
 to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') occurred_at FROM naijue_erp.audit_change WHERE operation_id=$1::uuid`,[result.operationId])).rows;
 need(audits.length===1,'ONE_ACTUAL_AUDIT_REQUIRED');const a=audits[0];need(a.operation_id===result.operationId&&a.actor_account_id===command.actorAccountId&&a.object_type==='IMPORT'&&a.object_id===f.batchId&&a.action===command.action&&a.new_version===index+1&&a.old_version===(index===0?null:index)&&a.occurred_at===r.completed_at&&requestHash(a.before_values)===requestHash(index===0?null:f.checkpoints[index-1])&&requestHash(a.after_values)===requestHash(f.checkpoints[index]),'ACTUAL_AUDIT_CHECKPOINT_NOT_CLOSED');
 const effects=(await query('/* opt02-legacy:ack-ledger */ SELECT id FROM naijue_erp.inventory_ledger WHERE operation_id=$1::uuid ORDER BY id',[result.operationId])).rows.map(row=>row.id);need(requestHash(effects)===requestHash(result.ledgerEntryIds),'ACTUAL_RECEIPT_LEDGER_IDS_MISMATCH');return Object.freeze({commandIndex:index,action:command.action,sequence:result.sequence,cursor:result.cursor,ledgerEffects:effects.length,receiptObserved:true,auditObserved:true});
}
