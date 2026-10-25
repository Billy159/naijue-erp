import { DomainError, requireDomain } from '../../../packages/domain/src/errors.ts';
import { entityId } from '../../../packages/domain/src/values.ts';
import { parseHistoryRevisionCommand, planHistoryRevision } from '../../../packages/application/src/history-revision-service.ts';
import type { HistoryRevisionCommand, HistoryRevisionCurrent, HistoryRevisionDependencies, HistoryRevisionGrant, HistoryRevisionReceipt } from '../../../packages/application/src/history-revision-contracts.ts';
import type { ActorContext } from '../../../packages/application/src/ports.ts';
import { requestHash } from '../../../packages/application/src/request-hash.ts';
import { importedHistoryTransferHallScopeSql } from './imported-history-query-reader.ts';
import { checkedImportedHistoryActor } from '../../../packages/application/src/imported-history-query-validation.ts';
import { COMPLETE_SCOPE_DECISION } from '../../../packages/application/src/inventory-cutoff-import.ts';
import { createPostgresHistoryRevisionPosting } from './inventory-posting-balances.ts';
import { checkedNativeRuntime26Capability } from '../../../packages/application/src/native-import-schema-contract.ts';
import type { NativeRuntime26Capability } from '../../../packages/application/src/native-import-schema-contract.ts';
import type { PgSalesClient, PgSalesPool, PgSalesResult } from './sales-unit-of-work.ts';

type Query = (sql: string, values?: unknown[]) => Promise<PgSalesResult>;
type Row = Record<string, unknown>;
export interface PostgresHistoryRevisionOptions {
  /** Original independently reviewed HISTORY numeric WRITE proof, on this exact leased client.
   * HISTORY_READ / INVENTORY_ADMISSION alone cannot supply this function. */
  readonly assertWriteReady: (client: PgSalesClient) => Promise<void>;
  readonly newId: (kind: 'operation' | 'revision' | 'ledger') => string;
}
const must = (ok: unknown, code = 'HISTORY_REVISION_BASELINE_UNPROVEN'): void => requireDomain(ok, code, 'Historical correction rejected');
const uuid = (value: unknown): string => { must(typeof value === 'string'); return entityId('operation', value as string); };
const integer = (v: unknown): number => { must(typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 2147483647); return v as number; };
const text = (v: unknown): string => { must(typeof v === 'string'); return v as string; };
const one = (rows: readonly Row[]): Row => { must(rows.length === 1); return rows[0]!; };
const tables = { sales: 'sales', transfers: 'transfer' } as const;
const targetTypes = { sales: 'HISTORY_SALES', transfers: 'HISTORY_TRANSFER' } as const;
type HistoryRevisionStore = HistoryRevisionDependencies['store'];

/** Complete publication evidence is checked again inside the locked write transaction.
 * Immutable manifests/source rows are never updated or inferred from STAGED success. */
async function source(query: Query, command: HistoryRevisionCommand): Promise<Row> {
  const family = tables[command.kind], key = command.kind === 'sales' ? 'sales_header_id' : 'transfer_header_id';
  const rows = (await query(`/* history-revise:source */ SELECT h.*,to_char(h.business_date,'YYYY-MM-DD') AS business_date,
    ${command.kind === 'sales' ? 'h.gross_amount::text AS gross_amount,h.order_discount::text AS order_discount,h.net_due::text AS net_due,' : ''}
    d.line_count,d.settlement_count,d.typed_document_sha256 AS document_manifest_hash,r.id AS published_operation_id,
    (b.mapping_version='V2_HISTORY_NULLABLE_1' AND b.status='IMPORTED' AND b.inventory_mode='CUTOFF_STOCK_BASELINE'
      AND b.history_validation_passed IS TRUE AND b.history_actual_counts=b.history_expected_counts
      AND b.checkpoint->'counts'=b.checkpoint->'expected' AND b.checkpoint->'counts'->>'IMPORT_BATCH'='1'
      AND b.completed_at IS NOT NULL AND m.validator_version='HISTORY_TYPED_CLOSURE_V1'
      AND m.selection_sha256=b.source_hash AND m.authorized_payload_hash=b.history_payload_hash
      AND m.expected_counts=b.history_expected_counts
      AND m.document_count=(SELECT count(*) FROM naijue_erp.import_history_document_manifest md WHERE md.batch_id=b.id)
      AND f.status='IMPORTED' AND f.source_entity_type='INVENTORY_SCOPE_APPROVAL' AND f.source_key='FINAL_COMPLETE_SCOPE'
      AND f.source_record_hash=b.source_hash AND f.source_file_ref=b.source_manifest_ref AND f.decision_reason=$2::text
      AND c.checkpoint_sequence=(b.checkpoint->>'sequence')::integer
      AND r.target_type='IMPORT' AND r.target_id=b.id AND r.action='IMPORT_PUBLISH' AND r.status='COMMITTED'
      AND r.result_data->>'status'='IMPORTED' AND r.result_data->>'batchId'=b.id::text
      AND r.result_data->>'sequence'=b.checkpoint->>'sequence' AND r.result_data->>'cursor'=b.checkpoint->>'cursor'
      AND a.object_type='IMPORT' AND a.object_id=b.id AND a.action='IMPORT_PUBLISH' AND a.actor_account_id=r.actor_account_id
      AND a.occurred_at=r.completed_at) AS published
    FROM naijue_erp.history_${family}_header h JOIN naijue_erp.import_batch b ON b.id=h.batch_id
    JOIN naijue_erp.import_history_closure_manifest m ON m.batch_id=b.id
    JOIN naijue_erp.import_history_document_manifest d ON d.batch_id=b.id AND d.${key}=h.id
      AND d.document_kind='${command.kind === 'sales' ? 'SALES' : 'TRANSFER'}' AND d.header_source_row_id=h.source_row_id
    JOIN naijue_erp.import_record f ON f.import_batch_id=b.id AND f.target_type='IMPORT_BATCH' AND f.target_id=b.id
    JOIN naijue_erp.import_record_accounting_claim c ON c.import_batch_id=b.id AND c.import_record_id=f.id AND c.target_type=f.target_type AND c.target_id=f.target_id
    JOIN naijue_erp.operation_receipt r ON r.id=c.operation_id JOIN naijue_erp.audit_change a ON a.operation_id=r.id
    WHERE h.id=$1::uuid FOR UPDATE OF h FOR SHARE OF b,m,d,f,c,r,a`, [command.documentId, COMPLETE_SCOPE_DECISION])).rows;
  must(rows.length !== 0, 'HISTORY_REVISION_NOT_FOUND'); const row = one(rows);
  must(row.id === command.documentId && row.published === true);
  uuid(row.batch_id); uuid(row.published_operation_id);
  must(typeof row.document_manifest_hash === 'string' && /^[a-f0-9]{64}$/.test(row.document_manifest_hash));
  return row;
}

/** Original account/staff/hall and document-purpose checks are held until COMMIT.
 * The service's external grant is checked too, but cannot replace these current facts. */
async function authorize(query: Query, actor: ActorContext, command: HistoryRevisionCommand, header: Row): Promise<void> {
  const rows=(await query(`/* history-revise:identity */ SELECT a.id,a.login_enabled,s.id AS staff_id,s.role,s.employment_status,s.hall_id
    FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id WHERE a.id=$1::uuid FOR SHARE OF a,s`, [actor.accountId])).rows;
  must(rows.length===1,'FORBIDDEN'); const row=rows[0]!;
  must(row.id === actor.accountId && row.login_enabled === true && row.employment_status === '在职'
    && ['ADMIN','WAREHOUSE','SALESPERSON'].includes(text(row.role)) && row.hall_id === actor.hallId, 'FORBIDDEN');
  uuid(row.staff_id);
  if (actor.hallId !== null) {
    const hall = one((await query('/* history-revise:hall */ SELECT id,enabled FROM naijue_erp.hall WHERE id=$1::uuid FOR SHARE', [actor.hallId])).rows);
    must(hall.id === actor.hallId && hall.enabled === true, 'FORBIDDEN');
  }
  if (row.role !== 'SALESPERSON') return;
  must(actor.hallId !== null, 'FORBIDDEN');
  if (command.kind === 'sales') { must(header.hall_id === actor.hallId, 'FORBIDDEN'); return; }
  const warehouses = (await query(`/* history-revise:transfer-scope */ SELECT id,hall_id FROM naijue_erp.warehouse
    WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE`, [[header.from_warehouse_id,header.to_warehouse_id]])).rows;
  must(warehouses.length === 2, 'FORBIDDEN');
  // Both endpoint rows stay locked through COMMIT. Source facts always bind
  // original h, while these parameters are the locked current/proposed pair.
  const proof = (await query(`/* history-revise:transfer-source-scope */ SELECT ${importedHistoryTransferHallScopeSql(2, false, [3, 4])} AS allowed
    FROM naijue_erp.history_transfer_header h WHERE h.id=$1::uuid AND h.batch_id=$5::uuid`,
    [command.documentId, [actor.hallId], header.from_warehouse_id, header.to_warehouse_id, header.batch_id])).rows;
  must(proof.length === 1 && proof[0]!.allowed === true, 'FORBIDDEN');
}

async function current(query: Query, command: HistoryRevisionCommand, header: Row): Promise<HistoryRevisionCurrent> {
  const family = tables[command.kind], kind = command.kind === 'sales' ? 'SALES' : 'TRANSFER';
  const headRows = (await query(`/* history-revise:head */ SELECT *,${command.kind === 'sales' ? 'gross_amount::text AS gross_amount,order_discount::text AS order_discount,net_due::text AS net_due' : 'version'}
    FROM naijue_erp.history_${family}_effective WHERE header_id=$1::uuid FOR UPDATE`, [command.documentId])).rows;
  must(headRows.length <= 1); const head = headRows[0];
  const version = integer(head?.version ?? header.version);
  let effectiveFacts: Row | undefined;
  if (head) {
    const revision = one((await query(`/* history-revise:head-chain */ SELECT id,document_kind,sales_id,transfer_id,from_version,to_version,operation_id,after_facts
      FROM naijue_erp.history_revision WHERE id=$1::uuid FOR SHARE`, [head.revision_id])).rows);
    must(revision.after_facts !== null && typeof revision.after_facts === "object" && !Array.isArray(revision.after_facts));
    effectiveFacts = revision.after_facts as Row;
    must(revision.document_kind === kind && revision[command.kind === 'sales' ? 'sales_id' : 'transfer_id'] === command.documentId
      && revision[command.kind === 'sales' ? 'transfer_id' : 'sales_id'] === null && revision.to_version === version
      && integer(revision.from_version) + 1 === version); uuid(revision.operation_id);
  }
  const lines = (await query(`/* history-revise:lines */ SELECT l.id,l.sku_id,coalesce(e.quantity,l.quantity)::text AS quantity,
    ${command.kind === 'sales' ? `coalesce(e.deal_price,l.deal_price)::text AS deal_price,coalesce(e.line_amount,l.line_amount)::text AS line_amount,
      CASE WHEN e.line_id IS NULL THEN l.allocated_discount ELSE e.allocated_discount END::text AS allocated_discount,` : ''}
    (e.line_id IS NULL OR (r.document_kind='${kind}' AND r.${command.kind === 'sales' ? 'sales_id' : 'transfer_id'}=l.header_id
      AND r.to_version<=$2 AND r.to_version=r.from_version+1 AND r.operation_id IS NOT NULL)) AS effective_valid
    FROM naijue_erp.history_${family}_line l LEFT JOIN naijue_erp.history_${family}_line_effective e ON e.line_id=l.id
    LEFT JOIN naijue_erp.history_revision r ON r.id=e.revision_id
    WHERE l.header_id=$1::uuid ORDER BY l.line_no,l.id LIMIT 10001 FOR SHARE OF l`, [command.documentId,version])).rows;
  must(lines.length === header.line_count && lines.length > 0 && lines.length <= 10000);
  must(lines.every(row => row.effective_valid === true));
  let settlements: HistoryRevisionCurrent['settlements'] = [];
  if (command.kind === 'sales') {
    const rows = (await query(`/* history-revise:settlements */ SELECT s.id,s.direction,coalesce(e.amount,s.amount)::text AS amount,
      (e.settlement_id IS NULL OR (r.document_kind='SALES' AND r.sales_id=s.header_id AND r.transfer_id IS NULL
        AND r.to_version<=$2 AND r.to_version=r.from_version+1 AND r.operation_id IS NOT NULL)) AS effective_valid
      FROM naijue_erp.history_sales_settlement s LEFT JOIN naijue_erp.history_sales_settlement_effective e ON e.settlement_id=s.id
      LEFT JOIN naijue_erp.history_revision r ON r.id=e.revision_id WHERE s.header_id=$1::uuid ORDER BY s.line_no,s.id LIMIT 10001 FOR SHARE OF s`, [command.documentId,version])).rows;
    must(rows.length === header.settlement_count && rows.length <= 10000 && rows.every(row => row.effective_valid === true));
    settlements = rows.map(s => { must(s.direction === 'RECEIVE' || s.direction === 'REFUND'); return { settlementId: uuid(s.id), direction: s.direction as 'RECEIVE'|'REFUND', amount: text(s.amount) }; });
  } else must(header.settlement_count === 0);
  return { kind: command.kind, documentId: command.documentId, version, previousRevisionId: head ? uuid(head.revision_id) : null,
    importBatchId: uuid(header.batch_id), publishedOperationId: uuid(header.published_operation_id), documentManifestHash: text(header.document_manifest_hash),
    sourceStatus: text(header.source_status) as HistoryRevisionCurrent['sourceStatus'],
    baselineEffect: header.source_status === 'APPROVED' ? 'INCLUDED_APPROVED' : 'EXCLUDED_NOT_EFFECTIVE', businessDate: effectiveFacts ? (effectiveFacts.businessDate === null ? null : text(effectiveFacts.businessDate)) : header.business_date === null ? null : text(header.business_date),
    responsibleStaffId: effectiveFacts?.responsibleStaffId == null ? null : uuid(effectiveFacts.responsibleStaffId),
    warehouseId: command.kind === 'sales' ? uuid(header.warehouse_id) : null,
    fromWarehouseId: command.kind === 'transfers' ? uuid(effectiveFacts?.fromWarehouseId ?? header.from_warehouse_id) : null, toWarehouseId: command.kind === 'transfers' ? uuid(effectiveFacts?.toWarehouseId ?? header.to_warehouse_id) : null,
    lines: lines.map(l => ({ lineId: uuid(l.id), skuId: uuid(l.sku_id), quantity: text(l.quantity), ...(command.kind === 'sales'
      ? { dealPrice: text(l.deal_price), lineAmount: text(l.line_amount), allocatedDiscount: l.allocated_discount === null ? null : text(l.allocated_discount) } : {}) })),
    totals: command.kind === 'sales' ? { grossAmount: text(head?.gross_amount ?? header.gross_amount), orderDiscount: text(head?.order_discount ?? header.order_discount), netDue: text(head?.net_due ?? header.net_due) } : null, settlements };
}

/** Numeric-only original HISTORY correction. Owns exactly one original transaction;
 * source/effective/receipt locks, current permissions, audit, posting and CAS share it. */
export class PostgresHistoryRevisionStore implements HistoryRevisionStore {
  private readonly pool: PgSalesPool;
  private readonly ready: PostgresHistoryRevisionOptions['assertWriteReady'];
  private readonly newId: PostgresHistoryRevisionOptions['newId'];
  /** Explicit production seam. The old v11 issuer cannot grant this purpose:
   * C must first review/install the complete numeric-write successor metadata. */
  static forRuntime26(pool: PgSalesPool, options: { readonly runtime26: NativeRuntime26Capability; readonly newId: PostgresHistoryRevisionOptions['newId'] }): PostgresHistoryRevisionStore {
    const runtime=checkedNativeRuntime26Capability(options?.runtime26);
    if(!runtime)throw TypeError('Original independently reviewed HISTORY_REVISION runtime required');
    return new PostgresHistoryRevisionStore(pool,{newId:options.newId,assertWriteReady:client=>runtime.assertReady(client,'HISTORY_REVISION')});
  }
  constructor(pool: PgSalesPool, options: PostgresHistoryRevisionOptions) {
    if (typeof pool?.connect !== 'function' || typeof options?.assertWriteReady !== 'function' || typeof options?.newId !== 'function')
      throw TypeError('Original HISTORY write proof, pool and identifier provider required');
    this.pool=pool; this.ready=options.assertWriteReady; this.newId=options.newId;
  }
  async revise(actorInput: ActorContext, input: HistoryRevisionCommand, grant: HistoryRevisionGrant, now: string, signal: AbortSignal): Promise<HistoryRevisionReceipt> {
    const actor=checkedImportedHistoryActor(actorInput);
    const command=parseHistoryRevisionCommand(input);
    must(typeof now==='string' && now.endsWith('Z') && Number.isFinite(Date.parse(now)),'HISTORY_REVISION_TIME');
    must(grant.dataset==='HISTORY' && grant.kind===command.kind && grant.documentId===command.documentId && grant.actorAccountId===actor.accountId,'FORBIDDEN');
    const hash=requestHash({ actorAccountId:actor.accountId,command });
    const client=await this.pool.connect(); let began=false,commitAttempted=false,discard:Error|undefined;
    const active=()=>must(!signal.aborted,'HISTORY_REVISION_ABORTED');
    const prove=async()=>{
      try { const result:unknown=await this.ready(client);must(result===undefined,'HISTORY_REVISION_STORE_NOT_READY');active(); }
      catch(error) {
        if(error!==null && typeof error==='object' && 'code' in error && error.code==='NATIVE_RUNTIME26_NOT_READY')
          throw new DomainError('HISTORY_REVISION_SCHEMA_NOT_READY','Independently reviewed historical numeric write capability unavailable');
        throw error;
      }
    };
    const query:Query=async(sql,values=[])=>{active();const result=await client.query(sql,values);active();return result;};
    try {
      active(); await prove(); await client.query('BEGIN ISOLATION LEVEL READ COMMITTED'); began=true;
      await prove();
      await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`naijue:receipt:${JSON.stringify([actor.accountId,command.requestKey])}`]);
      const receipts=(await query(`/* history-revise:receipt */ SELECT id,actor_account_id,target_type,target_id,action,status,request_hash,result_data
        FROM naijue_erp.operation_receipt WHERE actor_account_id=$1::uuid AND request_key=$2`,[actor.accountId,command.requestKey])).rows;
      must(receipts.length<=1);
      await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`naijue:history:${command.kind}:${command.documentId}`]);
      const header=await source(query,command);
      const before=await current(query,command,header);
      const effectiveHeader={...header,from_warehouse_id:before.fromWarehouseId,to_warehouse_id:before.toWarehouseId};
      await authorize(query,actor,command,effectiveHeader);
      let result:HistoryRevisionReceipt;
      if(receipts[0]) {
        const old=receipts[0]; must(old.request_hash===hash && old.target_type===targetTypes[command.kind] && old.target_id===command.documentId
          && old.action==='HISTORY_REVISE' && old.status==='COMMITTED','IDEMPOTENCY_CONFLICT');
        const r=old.result_data as HistoryRevisionReceipt;
        must(r.operationId===old.id && r.dataset==='HISTORY' && r.kind===command.kind && r.documentId===command.documentId
          && r.version===command.expectedVersion+1 && Array.isArray(r.ledgerEntryIds)); uuid(r.revisionId); r.ledgerEntryIds.forEach(uuid);
        result=structuredClone(r);
      } else {
        if (command.header?.responsibleStaffId != null) {
          const staff=await query('/* history-revise:responsible */ SELECT id FROM naijue_erp.staff WHERE id=$1::uuid FOR SHARE',[command.header.responsibleStaffId]);
          must(staff.rows.length===1,'HISTORY_REVISION_FOREIGN_ROW');
        }
        if (command.kind==='transfers' && command.header && (command.header.fromWarehouseId!==undefined || command.header.toWarehouseId!==undefined)) {
          const from=command.header.fromWarehouseId??before.fromWarehouseId, to=command.header.toWarehouseId??before.toWarehouseId;
          const refs=await query('/* history-revise:proposed-warehouses */ SELECT w.id,w.enabled,EXISTS(SELECT 1 FROM naijue_erp.inventory_balance b WHERE b.warehouse_id=w.id AND b.quantity<>0) AS has_nonzero_inventory FROM naijue_erp.warehouse w WHERE w.id=ANY($1::uuid[]) ORDER BY w.id FOR SHARE OF w',[[from,to]]);
          must(from!==to && refs.rows.length===2 && refs.rows.every(w=> (w.id===before.fromWarehouseId || w.id===before.toWarehouseId) || w.enabled===true || w.id===from && w.has_nonzero_inventory===true),'HISTORY_REVISION_FOREIGN_ROW');
          await authorize(query,actor,command,{...header,from_warehouse_id:from,to_warehouse_id:to});
        }
        const operationId=uuid(this.newId('operation')),revisionId=uuid(this.newId('revision'));
        must(operationId!==revisionId);const plan=planHistoryRevision(before,command,revisionId);
        const effects=plan.effects.map(effect=>({...effect,ledgerEntryId:uuid(this.newId('ledger'))}));
        const evidence={schemaVersion:1,importBatchId:before.importBatchId,publishedOperationId:before.publishedOperationId,
          documentManifestHash:before.documentManifestHash,previousRevisionId:before.previousRevisionId,oldEffectiveVersion:plan.fromVersion,
          newEffectiveVersion:plan.toVersion,sourceStatus:before.sourceStatus,
          effects:effects.map(e=>{const old=before.lines.find(l=>l.lineId===e.lineId)!,next=plan.after.lines.find(l=>l.lineId===e.lineId)!;
            const sign=e.endpoint==='TO'?1n:-1n,applies=before.sourceStatus==='APPROVED';
            return {...e,oldEffect:(applies?sign*BigInt(old.quantity):0n).toString(),newEffect:(applies?sign*BigInt(next.quantity):0n).toString(),delta:e.quantityDelta};}),
          ledgerEntryIds:effects.map(e=>e.ledgerEntryId)};
        const written=await query(`/* history-revise:revision */ INSERT INTO naijue_erp.history_revision
          (id,document_kind,sales_id,transfer_id,from_version,to_version,actor_account_id,request_key,reason,changed_at,
           before_facts,after_facts,stock_effect_basis,stock_effect_evidence,operation_id)
          VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7::uuid,$8,$9,$10::timestamptz,$11::jsonb,$12::jsonb,'CUTOFF_BASELINE_DELTA_V1',$13::jsonb,$14::uuid)`,
        [revisionId,command.kind==='sales'?'SALES':'TRANSFER',command.kind==='sales'?command.documentId:null,command.kind==='transfers'?command.documentId:null,
          plan.fromVersion,plan.toVersion,actor.accountId,command.requestKey,command.reason,now,JSON.stringify(before),JSON.stringify(plan.after),JSON.stringify(evidence),operationId]);
        must(written.rowCount===1);
        const family=tables[command.kind];
        const head=await query(`/* history-revise:put-head */ INSERT INTO naijue_erp.history_${family}_effective
          (header_id,version,revision_id${command.kind==='sales'?',gross_amount,order_discount,net_due':''})
          VALUES($1::uuid,$2,$3::uuid${command.kind==='sales'?',$5::numeric,$6::numeric,$7::numeric':''})
          ON CONFLICT(header_id) DO UPDATE SET version=EXCLUDED.version,revision_id=EXCLUDED.revision_id${command.kind==='sales'?',gross_amount=EXCLUDED.gross_amount,order_discount=EXCLUDED.order_discount,net_due=EXCLUDED.net_due':''}
          WHERE history_${family}_effective.version=$4`,[command.documentId,plan.toVersion,revisionId,plan.fromVersion,...(plan.after.totals?[plan.after.totals.grossAmount,plan.after.totals.orderDiscount,plan.after.totals.netDue]:[])]);
        must(head.rowCount===1,'VERSION_CONFLICT');
        for(const patch of command.lines) {
          const l=plan.after.lines.find(l=>l.lineId===patch.lineId)!;
          const write=await query(`/* history-revise:put-line */ INSERT INTO naijue_erp.history_${family}_line_effective
            (line_id,revision_id,quantity${command.kind==='sales'?',deal_price,line_amount,allocated_discount':''})
            VALUES($1::uuid,$2::uuid,$3::bigint${command.kind==='sales'?',$4::numeric,$5::numeric,$6::numeric':''})
            ON CONFLICT(line_id) DO UPDATE SET revision_id=EXCLUDED.revision_id,quantity=EXCLUDED.quantity${command.kind==='sales'?',deal_price=EXCLUDED.deal_price,line_amount=EXCLUDED.line_amount,allocated_discount=EXCLUDED.allocated_discount':''}`,
          [l.lineId,revisionId,l.quantity,...(command.kind==='sales'?[l.dealPrice,l.lineAmount,l.allocatedDiscount]:[])]);must(write.rowCount===1);
        }
        for(const patch of command.settlements) {
          const write=await query(`/* history-revise:put-settlement */ INSERT INTO naijue_erp.history_sales_settlement_effective(settlement_id,revision_id,amount)
            VALUES($1::uuid,$2::uuid,$3::numeric) ON CONFLICT(settlement_id) DO UPDATE SET revision_id=EXCLUDED.revision_id,amount=EXCLUDED.amount`,[patch.settlementId,revisionId,patch.amount]);must(write.rowCount===1);
        }
        // The existing borrowed posting leaf also verifies through its private query view.
        // Always prove the captured original lease; never approve a supplied structural copy.
        const posted=await createPostgresHistoryRevisionPosting({profile:'EXACT24',assertReady:prove})
          .post(client,{operationId,revisionId,actorAccountId:actor.accountId,kind:command.kind,documentId:command.documentId,toVersion:plan.toVersion,businessDate:before.businessDate,postedAt:now},effects);
        result={operationId,dataset:'HISTORY',kind:command.kind,documentId:command.documentId,revisionId,version:plan.toVersion,ledgerEntryIds:posted.ledgerEntryIds};
        const audit=await query(`/* history-revise:audit */ INSERT INTO naijue_erp.audit_change
          (id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
          VALUES($1::uuid,$1::uuid,$2::uuid,$3,$4::uuid,'HISTORY_REVISE',$5,$6,$7::jsonb,$8::jsonb,$9::timestamptz)`,
        [operationId,actor.accountId,targetTypes[command.kind],command.documentId,plan.fromVersion,plan.toVersion,JSON.stringify(before),JSON.stringify(plan.after),now]);must(audit.rowCount===1);
        const receipt=await query(`/* history-revise:complete */ INSERT INTO naijue_erp.operation_receipt
          (id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
          VALUES($1::uuid,$2::uuid,$3,$4,'HISTORY_REVISE',$5,$6::uuid,'COMMITTED',$7::jsonb,$8::timestamptz)`,
        [operationId,actor.accountId,command.requestKey,hash,targetTypes[command.kind],command.documentId,JSON.stringify(result),now]);must(receipt.rowCount===1);
      }
      await prove();commitAttempted=true;await client.query('COMMIT');return Object.freeze(result);
    }catch(error){
      if(!began||commitAttempted)discard=error instanceof Error?error:Error('History transaction unavailable');
      if(began&&!commitAttempted)try{await client.query('ROLLBACK');}catch(rollbackError){discard=rollbackError instanceof Error?rollbackError:Error('History rollback failed');throw new AggregateError([error,rollbackError],'History rollback failed');}
      if(commitAttempted)throw new DomainError('HISTORY_REVISION_COMMIT_OUTCOME_UNKNOWN','Recover the original HISTORY request key');
      throw error;
    }finally{client.release(discard);}
  }
}
