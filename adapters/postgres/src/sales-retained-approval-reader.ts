import type {DocumentInventoryAnchor} from '../../../packages/domain/src/document-inventory-effects.ts';
import {readVerifiedPublishedDocumentMigration} from './published-document-inventory-anchor-reader.ts';
import {readVerifiedDocumentMigration} from './document-inventory-anchor-reader.ts';
import {decodeSealedSalesMigration} from './sales-migration-origin-codec.ts';
import { SALES_RETAINED_APPROVAL_MAX_HISTORY } from '../../../packages/application/src/sales-retained-approval.ts';
import type { SalesRetainedApprovalEvent, SalesRetainedApprovalHistory } from '../../../packages/application/src/sales-retained-approval.ts';
import type { SalesAction, SalesResult } from '../../../packages/application/src/ports.ts';
import type { EntityId, EntityKind, Version } from '../../../packages/domain/src/values.ts';
import { entityId } from '../../../packages/domain/src/values.ts';
import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { jsonObject, stringValue, versionFromSql } from './codec.ts';
import type { PgSalesResult } from './sales-unit-of-work.ts';
type Query=(sql:string,values?:unknown[])=>Promise<PgSalesResult>;
const id=<K extends EntityKind>(kind:K,value:unknown):EntityId<K>=>entityId(kind,stringValue(value));
const stamp=(column:string):string=>`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
function action(value:unknown):SalesAction {requireDomain(value==='SAVE'||value==='UNAPPROVE'||value==='APPROVE'||value==='VOID','INVALID_DATABASE_VALUE','Invalid retained approval action');return value;}
function result(value:unknown):SalesResult {
 const r=jsonObject(value);requireDomain(Array.isArray(r.ledgerEntryIds)&&(r.status==='DRAFT'||r.status==='APPROVED'||r.status==='VOID'),'INVALID_DATABASE_VALUE','Incomplete committed approval result');
 return {operationId:id('operation',r.operationId),salesId:id('sales',r.salesId),version:versionFromSql(r.version),status:r.status,ledgerEntryIds:r.ledgerEntryIds.map(v=>id('ledger',v))};
}
/** Called only by the bound command UOW, using its original client while the
 * document header is locked. No source flag, separate transaction, schema write,
 * inferred approval or financial-row rewrite. LEFT JOIN retains missing receipts
 * for fail-closed verification rather than silently shortening the chain. */
export async function readSalesRetainedApprovalHistory(query:Query,salesId:EntityId<'sales'>,expectedVersion:Version):Promise<readonly SalesRetainedApprovalEvent[]> {
 const rows=(await query(`/* sales-retained-approval:history */ SELECT a.id AS audit_id, a.operation_id AS audit_operation_id, a.actor_account_id AS audit_actor,
    a.object_type, a.object_id, a.action AS audit_action, ${stamp('a.occurred_at')} AS occurred_at,
    a.old_version, a.new_version, a.before_values, a.after_values,
    r.id AS receipt_id, r.actor_account_id AS receipt_actor, r.request_key, r.request_hash, r.action AS receipt_action,
    r.target_type, r.target_id, r.status AS receipt_status, r.result_data, ${stamp('r.completed_at')} AS completed_at
    FROM naijue_erp.audit_change a
    LEFT JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id
    WHERE a.object_type='SALES' AND a.object_id=$1::uuid AND a.action<>'MIGRATE_DOCUMENT' AND a.new_version BETWEEN 2 AND $2 ORDER BY a.new_version, a.id LIMIT $3`,[salesId,expectedVersion,SALES_RETAINED_APPROVAL_MAX_HISTORY+1])).rows;
 requireDomain(rows.length<=SALES_RETAINED_APPROVAL_MAX_HISTORY,'UNKNOWN_PRICING_FACTS','Retained approval history exceeds the finite verification bound; a partial chain cannot authorize approval');
 return rows.map(row=>{
  requireDomain(row.object_type==='SALES'&&id('sales',row.object_id)===salesId,'INVALID_DATABASE_VALUE','Retained audit must match the locked target');
  if(row.receipt_id!==null)requireDomain(row.target_type==='SALES'&&id('sales',row.target_id)===salesId&&row.receipt_status==='COMMITTED','INVALID_DATABASE_VALUE','Retained receipt must match the locked target');
  return {audit:{id:id('audit',row.audit_id),operationId:id('operation',row.audit_operation_id),actorAccountId:id('account',row.audit_actor),salesId,
    action:action(row.audit_action),occurredAt:stringValue(row.occurred_at),oldVersion:versionFromSql(row.old_version),newVersion:versionFromSql(row.new_version),
    before:jsonObject(row.before_values),after:jsonObject(row.after_values)},
    receipt:row.receipt_id===null?null:{id:id('operation',row.receipt_id),actorAccountId:id('account',row.receipt_actor),requestKey:stringValue(row.request_key),requestHash:stringValue(row.request_hash),
      action:action(row.receipt_action),targetSalesId:salesId,status:'COMMITTED',result:result(row.result_data),completedAt:stringValue(row.completed_at)}};
 });
}

/** Same-client optional terminal anchor; never infer it from a truncated UNAPPROVE event. */
export async function readSalesRetainedApprovalEvidence(query:Query,salesId:EntityId<'sales'>,expectedVersion:Version,published=false,requireMigrationOrigin=false):Promise<Omit<SalesRetainedApprovalHistory,'assertCurrent'> & {readonly inventoryAnchor?:DocumentInventoryAnchor}>{
 const events=await readSalesRetainedApprovalHistory(query,salesId,expectedVersion);
 const start=events[0]?.audit.oldVersion ?? expectedVersion;
 if(start===1&&!requireMigrationOrigin)return {events};
 const verified=await (published?readVerifiedPublishedDocumentMigration:readVerifiedDocumentMigration)(query,'SALES',salesId);
 if(!verified)return {events};
 const migrationOrigin=decodeSealedSalesMigration(verified.snapshot,salesId);
 requireDomain(migrationOrigin.header.version===start,'UNKNOWN_PRICING_FACTS','Sealed migration must meet the complete runtime audit prefix');
 return {events,migrationOrigin,inventoryAnchor:verified.anchor};
}
