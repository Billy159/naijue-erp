import type { ImportedHistoryDetail, ImportedHistoryHeader, ImportedHistoryKind, ImportedHistoryLine, ImportedHistoryList, ImportedHistoryPage, ImportedHistoryPageSize, ImportedHistoryPerson, ImportedHistoryReadGrant, ImportedHistoryReader, ImportedHistorySalesLine, ImportedHistoryScopedRead, ImportedHistorySettlement } from '../../../packages/application/src/imported-history-query-ports.ts';
import { activeImportedHistoryRead, checkedImportedHistoryActor, checkedImportedHistoryGrant, checkedImportedHistoryIntent, validateImportedHistoryDetail, validateImportedHistoryHeader, validateImportedHistoryLine, validateImportedHistoryList, validateImportedHistorySettlement } from '../../../packages/application/src/imported-history-query-validation.ts';
import { assertHistoryPublicationSchema19 } from '../../../packages/application/src/history-typed-publication.ts';
import { COMPLETE_SCOPE_DECISION } from '../../../packages/application/src/inventory-cutoff-import.ts';
import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { assertNativeImportAccountingSchema19Guards } from './native-import-accounting-capability.ts';
import type { PgSalesClient, PgSalesPool, PgSalesResult } from './sales-unit-of-work.ts';

type Query = (sql: string, values?: unknown[]) => Promise<PgSalesResult>;
const tables = { sales: 'history_sales_header', transfers: 'history_transfer_header' } as const;
const lineTables = { sales: 'history_sales_line', transfers: 'history_transfer_line' } as const;
/** This predicate is shared by COUNT, ordered page and target selection. It never
 * treats a committed STAGE manifest as a publication certificate. All identifiers
 * are source constants, while every user/grant value is bound separately. */
const published = `b.mapping_version='V2_HISTORY_NULLABLE_1' AND b.status='IMPORTED'
 AND b.history_validation_passed IS TRUE AND b.history_actual_counts=b.history_expected_counts
 AND b.checkpoint->'counts'=b.checkpoint->'expected' AND b.checkpoint->'counts'->>'IMPORT_BATCH'='1'
 AND b.completed_at IS NOT NULL AND m.validator_version='HISTORY_TYPED_CLOSURE_V1'
 AND m.selection_sha256=b.source_hash AND m.authorized_payload_hash=b.history_payload_hash
 AND m.expected_counts=b.history_expected_counts
 AND m.document_count=(SELECT count(*) FROM naijue_erp.import_history_document_manifest md WHERE md.batch_id=b.id)
 AND EXISTS(SELECT 1 FROM naijue_erp.import_record f
  JOIN naijue_erp.import_record_accounting_claim c ON c.import_batch_id=f.import_batch_id AND c.import_record_id=f.id AND c.target_type=f.target_type AND c.target_id=f.target_id
  JOIN naijue_erp.operation_receipt r ON r.id=c.operation_id
  JOIN naijue_erp.audit_change a ON a.operation_id=r.id AND a.object_type='IMPORT' AND a.object_id=b.id AND a.action='IMPORT_PUBLISH' AND a.actor_account_id=r.actor_account_id
  WHERE f.import_batch_id=b.id AND f.target_type='IMPORT_BATCH' AND f.target_id=b.id AND f.status='IMPORTED'
   AND f.source_entity_type='INVENTORY_SCOPE_APPROVAL' AND f.source_key='FINAL_COMPLETE_SCOPE'
   AND f.source_record_hash=b.source_hash AND f.source_file_ref=b.source_manifest_ref AND f.decision_reason=$1::text
   AND c.checkpoint_sequence=(b.checkpoint->>'sequence')::integer
   AND r.target_type='IMPORT' AND r.target_id=b.id AND r.action='IMPORT_PUBLISH' AND r.status='COMMITTED'
   AND r.result_data->>'status'='IMPORTED' AND r.result_data->>'batchId'=b.id::text
   AND r.result_data->>'sequence'=b.checkpoint->>'sequence' AND r.result_data->>'cursor'=b.checkpoint->>'cursor')`;
function from(kind: ImportedHistoryKind): string {
  const target = kind === 'sales' ? 'sales_header_id' : 'transfer_header_id', documentKind = kind === 'sales' ? 'SALES' : 'TRANSFER';
  return `naijue_erp.${tables[kind]} h JOIN naijue_erp.import_batch b ON b.id=h.batch_id
   JOIN naijue_erp.import_history_closure_manifest m ON m.batch_id=b.id
   JOIN naijue_erp.import_history_document_manifest d ON d.batch_id=h.batch_id AND d.${target}=h.id AND d.document_kind='${documentKind}'`;
}
function count(rows: readonly Record<string, unknown>[]): string {
  requireDomain(rows.length === 1 && typeof rows[0]!.total === 'string' && /^(0|[1-9]\d{0,127})$/.test(rows[0]!.total), 'INVALID_DATABASE_VALUE', 'Exact historical count required');
  return rows[0]!.total as string;
}
const dateSql = (column: string, instant = false): string => `to_char(${column}${instant ? " AT TIME ZONE 'UTC'" : ''},'YYYY-MM-DD"T"HH24:MI:SS.US${instant ? '"Z"' : ''}')`;
function headerColumns(kind: ImportedHistoryKind): string {
  return `h.id,h.batch_id,h.version,h.number,to_char(h.business_date,'YYYY-MM-DD') business_date,h.source_status,h.note,
   h.created_hall_id,h.created_hall_provenance,
   (h.created_by_source_key IS NOT NULL) creator_known,(h.approved_by_source_key IS NOT NULL) approver_known,
   (SELECT e.native_staff_id FROM naijue_erp.import_header_native_reference e WHERE e.batch_id=h.batch_id AND e.entity_type='STAFF' AND e.source_key=h.created_by_source_key) created_by_staff_id,
   (SELECT e.native_staff_id FROM naijue_erp.import_header_native_reference e WHERE e.batch_id=h.batch_id AND e.entity_type='STAFF' AND e.source_key=h.approved_by_source_key) approved_by_staff_id,
   ${['created', 'updated', 'approved'].flatMap(k => [`${dateSql(`h.${k}_local_at`)} ${k}_local_at`, `${dateSql(`h.${k}_instant`, true)} ${k}_instant`]).join(',')},
   ${kind === 'sales' ? 'h.business_type,h.hall_id,h.customer_id,h.warehouse_id,h.salesperson_id,h.gross_amount::text,h.order_discount::text,h.net_due::text' : 'h.from_warehouse_id,h.to_warehouse_id'}`;
}
function person(known: unknown, staffId: unknown): ImportedHistoryPerson {
  requireDomain(typeof known === 'boolean' && (staffId === null || typeof staffId === 'string') && (known || staffId === null), 'INVALID_DATABASE_VALUE', 'Exact historical person binding required');
  return { state: !known ? 'UNKNOWN' : staffId === null ? 'UNRESOLVED' : 'BOUND', staffId: staffId as string | null };
}
function header(row: Record<string, unknown>, kind: ImportedHistoryKind, grant: ImportedHistoryReadGrant): ImportedHistoryHeader {
  return validateImportedHistoryHeader({ dataset: 'HISTORY', kind, documentId: row.id, batchId: row.batch_id, version: row.version, number: row.number, businessDate: row.business_date, sourceStatus: row.source_status, note: row.note,
    createdBy: person(row.creator_known, row.created_by_staff_id), approvedBy: person(row.approver_known, row.approved_by_staff_id), createdHallId: row.created_hall_id, createdHallProvenance: row.created_hall_provenance,
    createdLocalAt: row.created_local_at, updatedLocalAt: row.updated_local_at, approvedLocalAt: row.approved_local_at,
    createdInstant: row.created_instant, updatedInstant: row.updated_instant, approvedInstant: row.approved_instant,
    ...(kind === 'sales' ? { businessType: row.business_type, hallId: row.hall_id, customerId: row.customer_id, warehouseId: row.warehouse_id, salespersonId: row.salesperson_id, grossAmount: row.gross_amount, orderDiscount: row.order_discount, netDue: row.net_due } : { fromWarehouseId: row.from_warehouse_id, toWarehouseId: row.to_warehouse_id }) }, kind, grant);
}
function line(row: Record<string, unknown>, kind: ImportedHistoryKind): ImportedHistoryLine | ImportedHistorySalesLine {
  return validateImportedHistoryLine({ id: row.id, lineNo: row.line_no, skuId: row.sku_id, quantity: row.quantity,
    productCodeSnapshot: row.product_code_snapshot, productNameSnapshot: row.product_name_snapshot, colorNameSnapshot: row.color_name_snapshot,
    fitNameSnapshot: row.fit_name_snapshot, sizeNameSnapshot: row.size_name_snapshot, barcodeSnapshot: row.barcode_snapshot,
    ...(kind === 'sales' ? { referencePrice: row.reference_price, dealPrice: row.deal_price, lineAmount: row.line_amount, allocatedDiscount: row.allocated_discount, isGift: row.is_gift, pricingMethodSource: row.pricing_method_source, discountTenths: row.discount_tenths, ordinaryZeroConfirmed: row.ordinary_zero_confirmed } : {}) }, kind);
}
function settlement(row: Record<string, unknown>): ImportedHistorySettlement {
  return validateImportedHistorySettlement({ id: row.id, lineNo: row.line_no, paymentAccountId: row.payment_account_id, direction: row.direction, amount: row.amount, accountNameSnapshot: row.account_name_snapshot, methodNameSnapshot: row.method_name_snapshot, paymentMethodIdSnapshot: row.payment_method_id_snapshot });
}
function page<T>(n: number, size: ImportedHistoryPageSize, total: string, items: readonly T[]): ImportedHistoryPage<T> { return { page: n, pageSize: size, total, items }; }

/** Inert standalone reader. It never migrates, writes, grants access or invokes
 * the STAGE closure function (which takes write/table locks). Exact19
 * publication/runtime capability is mandatory; frozen18 remains closed. Future
 * profiles never enter through a maximum-version comparison.
 * Host bounded pool/timeouts remain responsible for in-flight query cancellation. */
export class PostgresImportedHistoryQueryReader implements ImportedHistoryReader {
  private readonly pool: PgSalesPool;
  constructor(pool: PgSalesPool) { if (typeof pool?.connect !== 'function') throw new TypeError('Explicit historical read pool required'); this.pool = pool; }
  private validate(read: ImportedHistoryScopedRead, operation: 'list' | 'detail') {
    const actor = checkedImportedHistoryActor(read.actor), intent = checkedImportedHistoryIntent(read.intent), grant = checkedImportedHistoryGrant(read.grant, intent, actor);
    activeImportedHistoryRead(read.signal); requireDomain(intent.operation === operation, 'IMPORTED_HISTORY_FORBIDDEN', 'Mismatched historical operation'); return { intent, grant };
  }
  private async snapshot<T>(signal: AbortSignal, work: (query: Query) => Promise<T>): Promise<T> {
    activeImportedHistoryRead(signal); const client = await this.pool.connect();
    let began = false, committing = false, discard: Error | undefined;
    const query: Query = (sql, values = []) => { activeImportedHistoryRead(signal); return client.query(sql, values); };
    try {
      await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true;
      const versions = (await query('/* imported-history:schema */ SELECT array_agg(version ORDER BY version) versions FROM naijue_erp.schema_migration')).rows;
      requireDomain(versions.length === 1, 'HISTORY_CLOSURE_SCHEMA_NOT_READY', 'One finite historical schema required');
      assertHistoryPublicationSchema19(versions[0]!.versions);
      const guardedClient: PgSalesClient = { query, release() { throw new Error('Capability cannot release the read client'); } };
      await assertNativeImportAccountingSchema19Guards(guardedClient);
      const result = await work(query); activeImportedHistoryRead(signal);
      committing = true; await query('COMMIT'); activeImportedHistoryRead(signal); return result;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : Error('Historical read outcome uncertain');
      else try { await client.query('ROLLBACK'); } catch (rollback) { discard = rollback instanceof Error ? rollback : Error('Historical rollback failed'); throw new AggregateError([error, rollback], 'Historical read and rollback failed; client discarded'); }
      throw error;
    } finally { client.release(discard); }
  }
  async readList(read: ImportedHistoryScopedRead): Promise<ImportedHistoryList> {
    const { intent, grant } = this.validate(read, 'list'); if (intent.operation !== 'list') throw Error('Historical list required');
    return this.snapshot(read.signal, async query => {
      const q = intent.parameters, values: unknown[] = [COMPLETE_SCOPE_DECISION], predicates = [published];
      const bind = (value: unknown): string => { values.push(value); return '$' + values.length; };
      if (grant.scope.kind === 'HALL_IDS') predicates.push(`h.hall_id=ANY(${bind([...grant.scope.hallIds])}::uuid[])`);
      if (q.batchId !== null) predicates.push(`h.batch_id=${bind(q.batchId)}::uuid`);
      if (q.number !== '') predicates.push(`strpos(h.number,${bind(q.number)}::text)>0`);
      if (q.businessDateFrom !== null) predicates.push(`h.business_date>=${bind(q.businessDateFrom)}::date`);
      if (q.businessDateTo !== null) predicates.push(`h.business_date<=${bind(q.businessDateTo)}::date`);
      if (q.sourceStatus !== null) predicates.push(`h.source_status=${bind(q.sourceStatus)}::text`);
      for (const [key, column] of (intent.kind === 'sales' ? [['hallId', 'hall_id'], ['warehouseId', 'warehouse_id'], ['customerId', 'customer_id'], ['salespersonId', 'salesperson_id']] : [['fromWarehouseId', 'from_warehouse_id'], ['toWarehouseId', 'to_warehouse_id']]) as [keyof typeof q, string][]) {
        if (q[key] !== null) predicates.push(`h.${column}=${bind(q[key])}::uuid`);
      }
      const source = from(intent.kind), predicate = predicates.join(' AND '), total = count((await query(`/* imported-history:list-count */ SELECT count(*)::text total FROM ${source} WHERE ${predicate}`, [...values])).rows);
      const rows = (await query(`/* imported-history:list-page */ SELECT ${headerColumns(intent.kind)} FROM ${source} WHERE ${predicate} ORDER BY h.business_date DESC NULLS LAST,h.number COLLATE "C",h.id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, q.pageSize, (q.page - 1) * q.pageSize])).rows;
      return validateImportedHistoryList({ dataset: 'HISTORY', kind: intent.kind, documents: page(q.page, q.pageSize, total, rows.map(r => header(r, intent.kind, grant))) }, intent, grant);
    });
  }
  async readDetail(read: ImportedHistoryScopedRead): Promise<ImportedHistoryDetail> {
    const { intent, grant } = this.validate(read, 'detail'); if (intent.operation !== 'detail') throw Error('Historical detail required');
    return this.snapshot(read.signal, async query => {
      const q = intent.parameters, values: unknown[] = [COMPLETE_SCOPE_DECISION, q.documentId];
      const scoped = grant.scope.kind === 'HALL_IDS' ? ' AND h.hall_id=ANY($3::uuid[])' : '';
      if (grant.scope.kind === 'HALL_IDS') values.push([...grant.scope.hallIds]);
      const rows = (await query(`/* imported-history:detail */ SELECT ${headerColumns(intent.kind)},d.line_count,d.settlement_count FROM ${from(intent.kind)} WHERE ${published} AND h.id=$2::uuid${scoped} LIMIT 2`, values)).rows;
      requireDomain(rows.length <= 1, 'INVALID_DATABASE_VALUE', 'Repeated historical target');
      if (!rows.length) return validateImportedHistoryDetail({ dataset: 'HISTORY', kind: intent.kind, document: null, lines: page(q.linePage, q.linePageSize, '0', []), settlements: page(q.settlementPage, q.settlementPageSize, '0', []) }, intent, grant);
      const r = rows[0]!, document = header(r, intent.kind, grant), lineTable = lineTables[intent.kind];
      const lineCount = count((await query(`/* imported-history:line-count */ SELECT count(*)::text total FROM naijue_erp.${lineTable} WHERE batch_id=$1::uuid AND header_id=$2::uuid`, [document.batchId, document.documentId])).rows);
      requireDomain(Number.isSafeInteger(r.line_count) && lineCount === String(r.line_count), 'INVALID_DATABASE_VALUE', 'Historical document line closure differs');
      const lineRows = (await query(`/* imported-history:line-page */ SELECT id,line_no,sku_id,quantity::text,product_code_snapshot,product_name_snapshot,color_name_snapshot,fit_name_snapshot,size_name_snapshot,barcode_snapshot${intent.kind === 'sales' ? ',reference_price::text,deal_price::text,line_amount::text,allocated_discount::text,is_gift,pricing_method_source,discount_tenths,ordinary_zero_confirmed' : ''} FROM naijue_erp.${lineTable} WHERE batch_id=$1::uuid AND header_id=$2::uuid ORDER BY line_no,id LIMIT $3 OFFSET $4`, [document.batchId, document.documentId, q.linePageSize, (q.linePage - 1) * q.linePageSize])).rows;
      let settlementCount = '0', settlementRows: Record<string, unknown>[] = [];
      if (intent.kind === 'sales') {
        settlementCount = count((await query('/* imported-history:settlement-count */ SELECT count(*)::text total FROM naijue_erp.history_sales_settlement WHERE batch_id=$1::uuid AND header_id=$2::uuid', [document.batchId, document.documentId])).rows);
        settlementRows = (await query('/* imported-history:settlement-page */ SELECT id,line_no,payment_account_id,direction,amount::text,account_name_snapshot,method_name_snapshot,payment_method_id_snapshot FROM naijue_erp.history_sales_settlement WHERE batch_id=$1::uuid AND header_id=$2::uuid ORDER BY line_no,id LIMIT $3 OFFSET $4', [document.batchId, document.documentId, q.settlementPageSize, (q.settlementPage - 1) * q.settlementPageSize])).rows;
      }
      requireDomain(Number.isSafeInteger(r.settlement_count) && settlementCount === String(r.settlement_count), 'INVALID_DATABASE_VALUE', 'Historical settlement closure differs');
      return validateImportedHistoryDetail({ dataset: 'HISTORY', kind: intent.kind, document, lines: page(q.linePage, q.linePageSize, lineCount, lineRows.map(r => line(r, intent.kind))), settlements: page(q.settlementPage, q.settlementPageSize, settlementCount, settlementRows.map(settlement)) }, intent, grant);
    });
  }
}
