import type { ImportedHistoryDetail, ImportedHistoryHeader, ImportedHistoryKind, ImportedHistoryLine, ImportedHistoryLineCatalog, ImportedHistoryList, ImportedHistoryPage, ImportedHistoryPageSize, ImportedHistoryPerson, ImportedHistoryReadGrant, ImportedHistoryReader, ImportedHistorySalesLine, ImportedHistoryScopedRead, ImportedHistorySettlement } from '../../../packages/application/src/imported-history-query-ports.ts';
import { activeImportedHistoryRead, checkedImportedHistoryActor, checkedImportedHistoryGrant, checkedImportedHistoryIntent, validateImportedHistoryDetail, validateImportedHistoryHeader, validateImportedHistoryLine, validateImportedHistoryList, validateImportedHistorySettlement } from '../../../packages/application/src/imported-history-query-validation.ts';
import { assertHistoryPublicationSchema19 } from '../../../packages/application/src/history-typed-publication.ts';
import { COMPLETE_SCOPE_DECISION } from '../../../packages/application/src/inventory-cutoff-import.ts';
import { IMPORTED_HISTORY_CATALOG_MAX_GROUP_MEMBERS } from '../../../packages/application/src/imported-history-query-ports.ts';
import { entityId } from '../../../packages/domain/src/values.ts';
import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { assertNativeImportAccountingSchema19Guards } from './native-import-accounting-capability.ts';
import { checkedNativeRuntime26Capability } from '../../../packages/application/src/native-import-schema-contract.ts';
import type { NativeRuntime26Capability } from '../../../packages/application/src/native-import-schema-contract.ts';
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
const manifestJoin = 'JOIN naijue_erp.import_history_closure_manifest m ON m.batch_id=b.id';
function from(kind: ImportedHistoryKind, effective = false): string {
  const target = kind === 'sales' ? 'sales_header_id' : 'transfer_header_id', documentKind = kind === 'sales' ? 'SALES' : 'TRANSFER';
  return `naijue_erp.${tables[kind]} h JOIN naijue_erp.import_batch b ON b.id=h.batch_id
   ${manifestJoin}
   JOIN naijue_erp.import_history_document_manifest d ON d.batch_id=h.batch_id AND d.${target}=h.id AND d.document_kind='${documentKind}'${effective ? `
   LEFT JOIN naijue_erp.history_${kind === 'sales' ? 'sales' : 'transfer'}_effective e ON e.header_id=h.id
   LEFT JOIN naijue_erp.history_revision er ON er.id=e.revision_id
   LEFT JOIN naijue_erp.staff responsible_staff ON responsible_staff.id=(er.after_facts->>'responsibleStaffId')::uuid` : ''}`;
}
function headColumn(column: string, effective: boolean): string {
  const key = ({ business_date: 'businessDate', from_warehouse_id: 'fromWarehouseId', to_warehouse_id: 'toWarehouseId' } as Record<string, string>)[column];
  return effective && key ? `(CASE WHEN e.header_id IS NULL THEN h.${column} ELSE (er.after_facts->>'${key}')::${column === 'business_date' ? 'date' : 'uuid'} END)` : `h.${column}`;
}
function revisionPredicate(kind: ImportedHistoryKind, alias: string, document: string): string {
  return `${alias}.id IS NOT NULL AND ${alias}.document_kind='${kind === 'sales' ? 'SALES' : 'TRANSFER'}'
    AND ${alias}.${kind === 'sales' ? 'sales_id' : 'transfer_id'}=${document}
    AND ${alias}.${kind === 'sales' ? 'transfer_id' : 'sales_id'} IS NULL AND ${alias}.operation_id IS NOT NULL
    AND ${alias}.from_version>0 AND ${alias}.to_version=${alias}.from_version+1
    AND ${alias}.stock_effect_basis='CUTOFF_BASELINE_DELTA_V1'`;
}
function count(rows: readonly Record<string, unknown>[]): string {
  requireDomain(rows.length === 1 && typeof rows[0]!.total === 'string' && /^(0|[1-9]\d{0,127})$/.test(rows[0]!.total), 'INVALID_DATABASE_VALUE', 'Exact historical count required');
  return rows[0]!.total as string;
}
const dateSql = (column: string, instant = false): string => `to_char(${column}${instant ? " AT TIME ZONE 'UTC'" : ''},'YYYY-MM-DD"T"HH24:MI:SS.US${instant ? '"Z"' : ''}')`;
function headerValidity(kind: ImportedHistoryKind): string {
  const responsible = `(er.after_facts->>'responsibleStaffId')::uuid`;
  return `(e.header_id IS NULL OR (${revisionPredicate(kind, 'er', 'h.id')} AND er.to_version=e.version AND e.version>h.version
     AND er.after_facts->>'kind'='${kind}' AND er.after_facts->>'documentId'=h.id::text
     AND er.after_facts->>'importBatchId'=h.batch_id::text AND er.after_facts->>'version'=e.version::text
     AND er.after_facts->>'sourceStatus'=h.source_status
     AND (${responsible} IS NULL OR responsible_staff.id IS NOT NULL)
     AND (h.source_status='DRAFT' OR (${responsible} IS NULL
       AND ${headColumn('business_date', true)} IS NOT DISTINCT FROM h.business_date
       ${kind === 'transfers' ? `AND ${headColumn('from_warehouse_id', true)} IS NOT DISTINCT FROM h.from_warehouse_id AND ${headColumn('to_warehouse_id', true)} IS NOT DISTINCT FROM h.to_warehouse_id` : ''}))))`;
}
function headerColumns(kind: ImportedHistoryKind, effective = false): string {
  const amounts = ['gross_amount', 'order_discount', 'net_due'].map(name => effective ? `coalesce(e.${name},h.${name})::text ${name}` : `h.${name}::text`).join(',');
  const responsible = effective ? `(er.after_facts->>'responsibleStaffId')::uuid` : 'NULL::uuid';
  const warehouseColumns = ['from_warehouse_id', 'to_warehouse_id'].map(column => `${headColumn(column, effective)} AS ${column}`).join(',');
  return `h.id,h.batch_id,${effective ? 'coalesce(e.version,h.version) AS version' : 'h.version'},h.number,to_char(${headColumn('business_date', effective)},'YYYY-MM-DD') business_date,h.source_status,h.note,
   ${responsible} AS responsible_staff_id,${effective ? 'responsible_staff.name' : 'NULL::text'} AS responsible_name,
   h.created_hall_id,h.created_hall_provenance,
   (h.created_by_source_key IS NOT NULL) creator_known,(h.approved_by_source_key IS NOT NULL) approver_known,
   (SELECT e.native_staff_id FROM naijue_erp.import_header_native_reference e WHERE e.batch_id=h.batch_id AND e.entity_type='STAFF' AND e.source_key=h.created_by_source_key) created_by_staff_id,
   (SELECT e.native_staff_id FROM naijue_erp.import_header_native_reference e WHERE e.batch_id=h.batch_id AND e.entity_type='STAFF' AND e.source_key=h.approved_by_source_key) approved_by_staff_id,
   ${['created', 'updated', 'approved'].flatMap(k => [`${dateSql(`h.${k}_local_at`)} ${k}_local_at`, `${dateSql(`h.${k}_instant`, true)} ${k}_instant`]).join(',')},
   ${kind === 'sales' ? `h.business_type,h.hall_id,h.customer_id,h.warehouse_id,h.salesperson_id,${amounts}` : warehouseColumns}${effective ? `,
   ${headerValidity(kind)} AS effective_valid` : ''}`;
}
function lineEffectiveJoins(kind: ImportedHistoryKind): string {
  return `LEFT JOIN naijue_erp.history_${kind === 'sales' ? 'sales' : 'transfer'}_line_effective le ON le.line_id=l.id
        LEFT JOIN naijue_erp.history_revision lr ON lr.id=le.revision_id`;
}
function lineValidity(kind: ImportedHistoryKind, version: string): string {
  return `(le.line_id IS NULL OR (${revisionPredicate(kind, 'lr', 'l.header_id')} AND lr.to_version<=${version}))`;
}
function effectiveLineColumns(kind: ImportedHistoryKind, version: string): string {
  return `l.id,l.line_no,l.sku_id,coalesce(le.quantity,l.quantity)::text quantity,
        l.product_code_snapshot,l.product_name_snapshot,l.color_name_snapshot,l.fit_name_snapshot,l.size_name_snapshot,l.barcode_snapshot${kind === 'sales' ? `,
        l.reference_price::text,coalesce(le.deal_price,l.deal_price)::text deal_price,coalesce(le.line_amount,l.line_amount)::text line_amount,
        (CASE WHEN le.line_id IS NULL THEN l.allocated_discount ELSE le.allocated_discount END)::text allocated_discount,
        l.is_gift,l.pricing_method_source,l.discount_tenths,l.ordinary_zero_confirmed` : ''},
        ${lineValidity(kind, version)} AS effective_valid`;
}

export interface ImportedHistoryReadSql {
  /** Append at approvalParameterIndex; all aliases below are fixed trusted SQL, not request input. */
  readonly values: readonly [typeof COMPLETE_SCOPE_DECISION];
  readonly publicationFrom: string; readonly headerFrom: string; readonly publishedPredicate: string; readonly headerColumns: string;
  readonly headerValidityPredicate: string; readonly versionExpression: string; readonly baselineEffectExpression: string;
  readonly businessDateExpression: string; readonly fromWarehouseIdExpression: string; readonly toWarehouseIdExpression: string;
  readonly lineTable: string; readonly lineEffectiveJoins: string; readonly lineColumns: string; readonly lineValidityPredicate: string;
  readonly sourceWarehouseBindingsPredicate: string; readonly originalCreatedHallPredicate: string;
}
/** Inert SQL fragments, NOT a grant, snapshot, schema proof or query executor.
 * Caller owns the original RR client and must prove HISTORY_READ, publication,
 * effective validity and its explicit source-specific role scope before paging.
 * Fixed aliases: header h,b,m,d,e,er,responsible_staff; line l,le,lr.
 * No new transfer HALL_IDS authority is issued by these source-fact predicates. */
export function importedHistoryReadSql(kind: ImportedHistoryKind, approvalParameterIndex = 1): ImportedHistoryReadSql {
  requireDomain(kind === 'sales' || kind === 'transfers', 'IMPORTED_HISTORY_INVALID_QUERY', 'Exact historical kind required');
  requireDomain(Number.isSafeInteger(approvalParameterIndex) && approvalParameterIndex > 0, 'IMPORTED_HISTORY_INVALID_QUERY', 'Positive approval parameter position required');
  const version = 'coalesce(e.version,h.version)';
  const warehouseFields = kind === 'sales' ? [['仓库来源编号', 'warehouse_id']] : [['调出仓来源编号', 'from_warehouse_id'], ['调入仓来源编号', 'to_warehouse_id']];
  const sourceWarehouseBindingsPredicate = `EXISTS (SELECT 1 FROM naijue_erp.import_source_row hs_read
    WHERE hs_read.id=h.source_row_id AND hs_read.batch_id=h.batch_id AND hs_read.entity_type='${kind === 'sales' ? 'SALES_HEADER' : 'TRANSFER_HEADER'}'
      AND ${warehouseFields.map(([field, column]) => `EXISTS (SELECT 1 FROM naijue_erp.import_record wr_read
        JOIN naijue_erp.warehouse wh_read ON wh_read.id=wr_read.target_id
        WHERE wr_read.import_batch_id=h.batch_id AND wr_read.status='IMPORTED' AND wr_read.target_type='WAREHOUSE'
          AND wr_read.source_entity_type='WAREHOUSE' AND wr_read.source_key=hs_read.normalized_fields->>'${field}'
          AND wr_read.target_id=h.${column})`).join(' AND ')})`;
  const originalCreatedHallPredicate = `(h.created_hall_provenance='ORIGINAL' AND h.created_hall_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM naijue_erp.import_source_row ch_source
      JOIN naijue_erp.import_header_native_reference ch_ref ON ch_ref.batch_id=ch_source.batch_id
        AND ch_ref.entity_type='HALL' AND ch_ref.source_key=ch_source.normalized_fields->>'原创建厅编号'
        AND ch_ref.native_hall_id=h.created_hall_id
      WHERE ch_source.id=h.source_row_id AND ch_source.batch_id=h.batch_id AND ch_source.entity_type='${kind === 'sales' ? 'SALES_HEADER' : 'TRANSFER_HEADER'}'
        AND ch_source.field_provenance->'fields'->'created_hall_id'->>'origin'='ORIGINAL'
        AND ch_source.field_provenance->'fields'->'created_hall_id'->>'parsed'=h.created_hall_id::text))`;
  return Object.freeze({ values: Object.freeze([COMPLETE_SCOPE_DECISION] as const), publicationFrom: `naijue_erp.import_batch b ${manifestJoin}`, headerFrom: from(kind, true),
    publishedPredicate: published.replace('$1::text', `$${approvalParameterIndex}::text`), headerColumns: headerColumns(kind, true),
    headerValidityPredicate: headerValidity(kind), versionExpression: version,
    baselineEffectExpression: `CASE h.source_status WHEN 'APPROVED' THEN 'INCLUDED_APPROVED' ELSE 'EXCLUDED_NOT_EFFECTIVE' END`,
    businessDateExpression: headColumn('business_date', true), fromWarehouseIdExpression: kind === 'transfers' ? headColumn('from_warehouse_id', true) : 'h.warehouse_id',
    toWarehouseIdExpression: kind === 'transfers' ? headColumn('to_warehouse_id', true) : 'NULL::uuid',
    lineTable: `naijue_erp.${lineTables[kind]}`, lineEffectiveJoins: lineEffectiveJoins(kind), lineColumns: effectiveLineColumns(kind, version),
    lineValidityPredicate: lineValidity(kind, version), sourceWarehouseBindingsPredicate, originalCreatedHallPredicate });
}
/** Same approved transfer source rule as normal lists. This SQL is not a grant.
 * Fixed header alias h; effective reads additionally use e/er. Revision callers
 * bind their locked current/proposed endpoints instead, retaining original h
 * for source binding. Every position is a trusted positive bind index. */
export function importedHistoryTransferHallScopeSql(hallIdsParameterIndex: number, effective: boolean, endpointParameterIndices?: readonly [number, number]): string {
  requireDomain(typeof effective === 'boolean' && [hallIdsParameterIndex, ...(endpointParameterIndices ?? [])].every(n => Number.isSafeInteger(n) && n > 0)
    && (endpointParameterIndices === undefined || endpointParameterIndices.length === 2), 'IMPORTED_HISTORY_INVALID_QUERY', 'Exact transfer scope bind positions required');
  const facts = importedHistoryReadSql('transfers'), halls = `$${hallIdsParameterIndex}::uuid[]`;
  const fromId = endpointParameterIndices ? `$${endpointParameterIndices[0]}::uuid` : headColumn('from_warehouse_id', effective);
  const toId = endpointParameterIndices ? `$${endpointParameterIndices[1]}::uuid` : headColumn('to_warehouse_id', effective);
  return `((${facts.sourceWarehouseBindingsPredicate} AND (
    EXISTS(SELECT 1 FROM naijue_erp.warehouse scope_fw WHERE scope_fw.id=${fromId} AND scope_fw.hall_id=ANY(${halls})) OR
    EXISTS(SELECT 1 FROM naijue_erp.warehouse scope_tw WHERE scope_tw.id=${toId} AND scope_tw.hall_id=ANY(${halls})))) OR
    (${facts.originalCreatedHallPredicate} AND h.created_hall_id=ANY(${halls}) AND h.created_role_source='SALESPERSON' AND h.created_by_source_key IS NOT NULL))`;
}
export interface ImportedHistoryReadScopeSql { readonly predicate: string; readonly values: readonly unknown[] }
/** Explicit checked grant only. Legacy transfer HALL_IDS continues to reject.
 * TRANSFER_HALL_IDS returns the effective source-bound predicate, never ALL. */
export function importedHistoryReadScopeSql(read: ImportedHistoryScopedRead, firstParameterIndex: number): ImportedHistoryReadScopeSql {
  const actor = checkedImportedHistoryActor(read.actor), intent = checkedImportedHistoryIntent(read.intent), grant = checkedImportedHistoryGrant(read.grant, intent, actor);
  activeImportedHistoryRead(read.signal);
  requireDomain(Number.isSafeInteger(firstParameterIndex) && firstParameterIndex > 0, 'IMPORTED_HISTORY_INVALID_QUERY', 'Positive scope parameter position required');
  return grant.scope.kind === 'ALL' ? Object.freeze({ predicate: 'TRUE', values: Object.freeze([]) })
    : Object.freeze({ predicate: grant.scope.kind === 'TRANSFER_HALL_IDS' ? importedHistoryTransferHallScopeSql(firstParameterIndex, true) : `h.hall_id=ANY($${firstParameterIndex}::uuid[])`, values: Object.freeze([Object.freeze([...grant.scope.hallIds])]) });
}

type CatalogRow = Record<string, unknown>;
const catalogMust = (ok: unknown): void => requireDomain(ok, 'INVALID_DATABASE_VALUE', 'Historical line catalogue contradicts its published source identity');
function catalogObject(value: unknown): CatalogRow | null {
  if (value === null || value === undefined) return null;
  catalogMust(typeof value === 'object' && !Array.isArray(value)); return value as CatalogRow;
}
function catalogId(value: unknown): string {
  catalogMust(typeof value === 'string'); return entityId('sku', value as string);
}
interface CatalogCandidate {
  readonly lineId: string; readonly skuId: string; readonly identity: ImportedHistoryLineCatalog['items'][number]['identity'];
  readonly groupId: string | null; readonly groupSnapshot: CatalogRow | null; readonly sizeSnapshot: CatalogRow | null;
}
function catalogCandidate(row: CatalogRow, line: ImportedHistoryLine): CatalogCandidate {
  catalogMust(row.line_id === line.id && row.sku_id === line.skuId);
  const unknown: CatalogCandidate = { lineId: line.id, skuId: line.skuId, identity: { state: 'UNKNOWN' }, groupId: null, groupSnapshot: null, sizeSnapshot: null };
  if (row.line_source_id == null) return unknown;
  catalogMust(row.line_source_entity === row.expected_line_entity);
  if (row.line_header_key == null || row.header_source_key == null || row.old_sku_key == null || row.canonical_sku_key == null) return unknown;
  catalogMust(row.line_header_key === row.header_source_key);
  if (row.alias_source_id == null) return unknown;
  catalogMust(row.alias_sku_id === line.skuId && row.alias_canonical_key === row.canonical_sku_key
    && typeof row.mapping_basis === 'string' && row.mapping_basis.trim().length > 0);
  if (row.alias_source_entity == null || row.native_sku_id == null) return unknown;
  catalogMust(row.alias_source_entity === 'SKU' && row.alias_source_key === row.old_sku_key && row.alias_raw_key === row.old_sku_key && row.native_sku_id === line.skuId);
  const evidence = catalogObject(row.sku_evidence);
  if (!evidence) return unknown;
  catalogMust(evidence.validator_version === 'NATIVE_SKU_IMPORT_V1' && evidence.native_sku_id === line.skuId && evidence.canonical_source_key === row.canonical_sku_key);
  const mapping = catalogObject(evidence.mapping), native = catalogObject(evidence.native_sku), selection = catalogObject(evidence.selection);
  if (!mapping || !native || !selection || row.canonical_source_id == null || row.record_count === '0') return unknown;
  catalogMust(mapping.oldSourceSkuId === row.old_sku_key && mapping.canonicalSourceSkuId === row.canonical_sku_key && mapping.mappingBasis === row.mapping_basis
    && selection.selectionSha256 === row.selection_sha256 && row.record_count === '1' && row.record_valid === true && native.id === line.skuId);
  for (const key of ['product_id', 'color_id', 'fit_id', 'size_id']) catalogMust(native[key] === row[key]);
  const identity = { state: 'BOUND' as const, productId: catalogId(row.product_id), colorId: catalogId(row.color_id), fitId: catalogId(row.fit_id), sizeId: catalogId(row.size_id) };
  const refs = catalogObject(evidence.references);
  const product = catalogObject(refs?.product), size = catalogObject(refs?.size), group = catalogObject(refs?.sizeGroup);
  for (const [key, expected] of [['product', identity.productId], ['color', identity.colorId], ['fit', identity.fitId], ['size', identity.sizeId]] as const) {
    const ref = catalogObject(refs?.[key]); if (ref) {
      catalogMust(ref.nativeId === expected); const snapshot = catalogObject(ref.nativeSnapshot); if (snapshot) catalogMust(snapshot.id === expected);
    }
  }
  const result = { ...unknown, identity };
  const productSnapshot = catalogObject(product?.nativeSnapshot), groupSnapshot = catalogObject(group?.nativeSnapshot), sizeSnapshot = catalogObject(size?.nativeSnapshot);
  if (!product || !group || !size || !productSnapshot || !groupSnapshot || !sizeSnapshot) return result;
  const groupId = catalogId(group.nativeId);
  catalogMust(groupSnapshot.id === groupId && productSnapshot.size_group_id === groupId);
  return { ...result, groupId, groupSnapshot, sizeSnapshot };
}
/** Same authorized detail snapshot, current page only. Missing proof stays
 * UNKNOWN; enabled/current names/current product group never rebind history. */
async function readLineCatalog(query: Query, kind: ImportedHistoryKind, document: ImportedHistoryHeader, lines: readonly ImportedHistoryLine[]): Promise<ImportedHistoryLineCatalog> {
  if (lines.length === 0) return { basis: 'PUBLISHED_SOURCE_SKU_IDENTITY_V1', items: [], groups: [] };
  const rows = (await query(`/* imported-history:line-catalog */ SELECT l.id line_id,l.sku_id,
    ls.id line_source_id,ls.entity_type line_source_entity,'${kind === 'sales' ? 'SALES_LINE' : 'TRANSFER_LINE'}'::text expected_line_entity,
    ls.normalized_fields->>'单据来源编号' line_header_key,hs.source_key header_source_key,
    ls.raw_fields->>'SKU来源编号' old_sku_key,ls.normalized_fields->>'SKU来源编号' canonical_sku_key,
    a.source_row_id alias_source_id,a.canonical_sku_id alias_sku_id,a.canonical_source_key alias_canonical_key,a.mapping_basis,
    als.entity_type alias_source_entity,als.source_key alias_source_key,als.raw_fields->>'来源编号' alias_raw_key,
    als.field_provenance->'native_sku_import' sku_evidence,k.id native_sku_id,k.product_id,k.color_id,k.fit_id,k.size_id,
    b.source_hash selection_sha256,cs.id canonical_source_id,proof.record_count,proof.record_valid
    FROM naijue_erp.${lineTables[kind]} l JOIN naijue_erp.${tables[kind]} h ON h.id=l.header_id AND h.batch_id=l.batch_id
    JOIN naijue_erp.import_batch b ON b.id=l.batch_id
    LEFT JOIN naijue_erp.import_source_row hs ON hs.id=h.source_row_id AND hs.batch_id=h.batch_id
    LEFT JOIN naijue_erp.import_source_row ls ON ls.id=l.source_row_id AND ls.batch_id=l.batch_id
    LEFT JOIN naijue_erp.import_sku_alias a ON a.batch_id=l.batch_id AND a.old_source_sku_id=ls.raw_fields->>'SKU来源编号'
    LEFT JOIN naijue_erp.import_source_row als ON als.id=a.source_row_id AND als.batch_id=a.batch_id
    LEFT JOIN naijue_erp.sku k ON k.id=l.sku_id
    LEFT JOIN naijue_erp.import_source_row cs ON cs.batch_id=a.batch_id AND cs.entity_type='SKU' AND cs.source_key=a.canonical_source_key
    LEFT JOIN LATERAL (SELECT count(*)::text record_count,
      bool_and(r.status='IMPORTED' AND r.target_id=l.sku_id AND r.source_record_hash=cs.row_sha256 AND r.source_file_ref=cs.file_ref) record_valid
      FROM naijue_erp.import_record r WHERE r.import_batch_id=l.batch_id AND r.source_entity_type='SKU'
        AND r.source_key=a.canonical_source_key AND r.target_type='SKU') proof ON TRUE
    WHERE l.batch_id=$1::uuid AND l.header_id=$2::uuid AND l.id=ANY($3::uuid[]) ORDER BY l.line_no,l.id LIMIT $4`,
    [document.batchId, document.documentId, lines.map(line => line.id), lines.length + 1])).rows;
  catalogMust(rows.length === lines.length);
  const byLine = new Map(rows.map(row => [row.line_id, row])); catalogMust(byLine.size === rows.length);
  const candidates = lines.map(line => { const row = byLine.get(line.id); catalogMust(row); return catalogCandidate(row!, line); });
  const groupIds = [...new Set(candidates.flatMap(row => row.groupId === null ? [] : [row.groupId]))].sort();
  const groups: ImportedHistoryLineCatalog['groups'][number][] = [];
  if (groupIds.length) {
    const maximum = groupIds.length * IMPORTED_HISTORY_CATALOG_MAX_GROUP_MEMBERS;
    const groupRows = (await query(`/* imported-history:line-catalog-groups */ SELECT g.size_group_id group_id,g.native_snapshot group_snapshot,
      m.member_size_id,m.native_snapshot member_snapshot,z.native_snapshot size_snapshot
      FROM naijue_erp.import_native_catalogue_binding g
      LEFT JOIN naijue_erp.import_native_catalogue_binding m ON m.batch_id=g.batch_id AND m.entity_type='SIZE_GROUP_MEMBER' AND m.member_group_id=g.size_group_id
      LEFT JOIN naijue_erp.import_native_catalogue_binding z ON z.batch_id=g.batch_id AND z.entity_type='SIZE' AND z.size_id=m.member_size_id
      WHERE g.batch_id=$1::uuid AND g.entity_type='SIZE_GROUP' AND g.size_group_id=ANY($2::uuid[])
      ORDER BY g.size_group_id,m.member_size_id LIMIT $3`, [document.batchId, groupIds, maximum + 1])).rows;
    requireDomain(groupRows.length <= maximum, 'IMPORTED_HISTORY_CATALOG_TOO_LARGE', 'Original historical group member bound exceeded; no truncated catalogue returned');
    const byGroup = new Map<string, CatalogRow[]>();
    for (const row of groupRows) { const id = catalogId(row.group_id); catalogMust(groupIds.includes(id)); const values = byGroup.get(id) ?? []; values.push(row); byGroup.set(id, values); }
    for (const groupId of groupIds) {
      const facts = byGroup.get(groupId); if (!facts) continue;
      requireDomain(facts.length <= IMPORTED_HISTORY_CATALOG_MAX_GROUP_MEMBERS, 'IMPORTED_HISTORY_CATALOG_TOO_LARGE', 'Original historical group member bound exceeded; no truncated catalogue returned');
      let missing = false; const sizes: ImportedHistoryLineCatalog['groups'][number]['sizes'][number][] = [];
      const sourceGroup = catalogObject(facts[0]!.group_snapshot); if (!sourceGroup) continue;
      catalogMust(sourceGroup.id === groupId && typeof sourceGroup.name === 'string');
      for (const row of facts) {
        const snapshot = catalogObject(row.group_snapshot); catalogMust(snapshot?.id === groupId && snapshot.name === sourceGroup.name);
        if (row.member_size_id == null) { missing = true; continue; }
        const sizeId = catalogId(row.member_size_id), member = catalogObject(row.member_snapshot), size = catalogObject(row.size_snapshot);
        if (!member || !size) { missing = true; continue; }
        catalogMust(member.size_group_id === groupId && member.size_id === sizeId && size.id === sizeId
          && typeof size.name === 'string' && typeof member.display_order === 'number' && Number.isSafeInteger(member.display_order));
        sizes.push({ sizeId, name: size.name as string, displayOrder: member.display_order as number });
      }
      catalogMust(new Set(sizes.map(z => z.sizeId)).size === sizes.length);
      for (const candidate of candidates.filter(c => c.groupId === groupId)) {
        catalogMust(candidate.identity.state === 'BOUND' && candidate.groupSnapshot?.name === sourceGroup.name);
        if (candidate.identity.state === 'BOUND') {
          const sizeId = candidate.identity.sizeId, member = sizes.find(z => z.sizeId === sizeId);
          if (!member) missing = true; else catalogMust(member.name === candidate.sizeSnapshot?.name);
        }
      }
      if (!missing) groups.push({ groupId, name: sourceGroup.name as string, sizes: sizes.sort((a, b) => a.displayOrder - b.displayOrder || (a.sizeId < b.sizeId ? -1 : a.sizeId > b.sizeId ? 1 : 0)) });
    }
  }
  const provenGroups = new Set(groups.map(g => g.groupId));
  return { basis: 'PUBLISHED_SOURCE_SKU_IDENTITY_V1', items: candidates.map(c => ({ lineId: c.lineId, skuId: c.skuId, identity: c.identity,
    sourceGroup: c.groupId !== null && provenGroups.has(c.groupId) ? { state: 'BOUND', groupId: c.groupId } : { state: 'UNKNOWN' } })), groups };
}

function person(known: unknown, staffId: unknown): ImportedHistoryPerson {
  requireDomain(typeof known === 'boolean' && (staffId === null || typeof staffId === 'string') && (known || staffId === null), 'INVALID_DATABASE_VALUE', 'Exact historical person binding required');
  return { state: !known ? 'UNKNOWN' : staffId === null ? 'UNRESOLVED' : 'BOUND', staffId: staffId as string | null };
}
function header(row: Record<string, unknown>, kind: ImportedHistoryKind, grant: ImportedHistoryReadGrant, effective = false): ImportedHistoryHeader {
  if (grant.scope.kind === 'TRANSFER_HALL_IDS') requireDomain(row.transfer_scope_valid === true, 'INVALID_DATABASE_VALUE', 'Historical transfer source scope must be proved on this snapshot');
  if (effective) requireDomain(row.effective_valid === true, 'INVALID_DATABASE_VALUE', 'Historical effective header revision differs from its original document');
  return validateImportedHistoryHeader({ dataset: 'HISTORY', kind, documentId: row.id, batchId: row.batch_id, version: row.version, number: row.number, businessDate: row.business_date, sourceStatus: row.source_status, note: row.note,
    createdBy: person(row.creator_known, row.created_by_staff_id), approvedBy: person(row.approver_known, row.approved_by_staff_id), createdHallId: row.created_hall_id, createdHallProvenance: row.created_hall_provenance,
    responsibleStaffId: effective ? row.responsible_staff_id : null, responsibleName: effective ? row.responsible_name : null,
    createdLocalAt: row.created_local_at, updatedLocalAt: row.updated_local_at, approvedLocalAt: row.approved_local_at,
    createdInstant: row.created_instant, updatedInstant: row.updated_instant, approvedInstant: row.approved_instant,
    ...(kind === 'sales' ? { businessType: row.business_type, hallId: row.hall_id, customerId: row.customer_id, warehouseId: row.warehouse_id, salespersonId: row.salesperson_id, grossAmount: row.gross_amount, orderDiscount: row.order_discount, netDue: row.net_due } : { fromWarehouseId: row.from_warehouse_id, toWarehouseId: row.to_warehouse_id }) }, kind, grant);
}
function line(row: Record<string, unknown>, kind: ImportedHistoryKind, effective = false): ImportedHistoryLine | ImportedHistorySalesLine {
  if (effective) requireDomain(row.effective_valid === true, 'INVALID_DATABASE_VALUE', 'Historical effective line revision differs from its current document');
  return validateImportedHistoryLine({ id: row.id, lineNo: row.line_no, skuId: row.sku_id, quantity: row.quantity,
    productCodeSnapshot: row.product_code_snapshot, productNameSnapshot: row.product_name_snapshot, colorNameSnapshot: row.color_name_snapshot,
    fitNameSnapshot: row.fit_name_snapshot, sizeNameSnapshot: row.size_name_snapshot, barcodeSnapshot: row.barcode_snapshot,
    ...(kind === 'sales' ? { referencePrice: row.reference_price, dealPrice: row.deal_price, lineAmount: row.line_amount, allocatedDiscount: row.allocated_discount, isGift: row.is_gift, pricingMethodSource: row.pricing_method_source, discountTenths: row.discount_tenths, ordinaryZeroConfirmed: row.ordinary_zero_confirmed } : {}) }, kind);
}
function settlement(row: Record<string, unknown>, effective = false): ImportedHistorySettlement {
  if (effective) requireDomain(row.effective_valid === true, 'INVALID_DATABASE_VALUE', 'Historical effective settlement revision differs from its current document');
  return validateImportedHistorySettlement({ id: row.id, lineNo: row.line_no, paymentAccountId: row.payment_account_id, direction: row.direction, amount: row.amount, accountNameSnapshot: row.account_name_snapshot, methodNameSnapshot: row.method_name_snapshot, paymentMethodIdSnapshot: row.payment_method_id_snapshot });
}
function page<T>(n: number, size: ImportedHistoryPageSize, total: string, items: readonly T[]): ImportedHistoryPage<T> { return { page: n, pageSize: size, total, items }; }

/** Inert standalone reader. It never migrates, writes, grants access or invokes
 * the STAGE closure function (which takes write/table locks). Exact19
 * publication/runtime capability remains the default. Explicit26 requires the
 * independently issued original-client HISTORY_READ capability on every read;
 * frozen18 and future profiles never enter through a maximum-version comparison.
 * Host bounded pool/timeouts remain responsible for in-flight query cancellation. */
export class PostgresImportedHistoryQueryReader implements ImportedHistoryReader {
  private readonly pool: PgSalesPool;
  private readonly runtime26: NativeRuntime26Capability | undefined;
  constructor(pool: PgSalesPool, options?: { readonly runtime26: NativeRuntime26Capability }) {
    if (typeof pool?.connect !== 'function') throw new TypeError('Explicit historical read pool required');
    if (options !== undefined) {
      const descriptor = options && Object.getOwnPropertyDescriptor(options, 'runtime26');
      if (!options || Object.getPrototypeOf(options) !== Object.prototype || Reflect.ownKeys(options).length !== 1
        || !descriptor?.enumerable || !('value' in descriptor) || descriptor.value === undefined)
        throw new TypeError('Explicit historical exact26 runtime options required');
      this.runtime26 = checkedNativeRuntime26Capability(descriptor.value);
    }
    this.pool = pool;
  }
  private validate(read: ImportedHistoryScopedRead, operation: 'list' | 'detail') {
    const actor = checkedImportedHistoryActor(read.actor), intent = checkedImportedHistoryIntent(read.intent), grant = checkedImportedHistoryGrant(read.grant, intent, actor);
    activeImportedHistoryRead(read.signal); requireDomain(intent.operation === operation, 'IMPORTED_HISTORY_FORBIDDEN', 'Mismatched historical operation'); return { intent, grant };
  }
  private async snapshot<T>(signal: AbortSignal, work: (query: Query) => Promise<T>): Promise<T> {
    activeImportedHistoryRead(signal); const client = await this.pool.connect();
    let began = false, committing = false, committed = false, discard: Error | undefined;
    const query: Query = (sql, values = []) => { activeImportedHistoryRead(signal); return client.query(sql, values); };
    try {
      if (this.runtime26) await this.runtime26.assertReady(client, 'HISTORY_READ');
      await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true;
      const versions = (await query('/* imported-history:schema */ SELECT array_agg(version ORDER BY version) versions FROM naijue_erp.schema_migration')).rows;
      requireDomain(versions.length === 1, 'HISTORY_CLOSURE_SCHEMA_NOT_READY', 'One finite historical schema required');
      if (this.runtime26) {
        const profile: unknown = versions[0]!.versions;
        requireDomain(Array.isArray(profile) && profile.length === 26 && profile.every((n, i) => n === i + 1),
          'HISTORY_CLOSURE_SCHEMA_NOT_READY', 'Exact26 historical schema required');
      } else {
        assertHistoryPublicationSchema19(versions[0]!.versions);
        const guardedClient: PgSalesClient = { query, release() { throw new Error('Capability cannot release the read client'); } };
        await assertNativeImportAccountingSchema19Guards(guardedClient);
      }
      const result = await work(query); activeImportedHistoryRead(signal);
      committing = true; await query('COMMIT'); committed = true; activeImportedHistoryRead(signal); return result;
    } catch (error) {
      if (!committed && (!began || committing)) discard = error instanceof Error ? error : Error('Historical read outcome uncertain');
      if (began && !committing) try { await client.query('ROLLBACK'); } catch (rollback) { discard = rollback instanceof Error ? rollback : Error('Historical rollback failed'); throw new AggregateError([error, rollback], 'Historical read and rollback failed; client discarded'); }
      throw error;
    } finally { client.release(discard); }
  }
  async readList(read: ImportedHistoryScopedRead): Promise<ImportedHistoryList> {
    const { intent, grant } = this.validate(read, 'list'); if (intent.operation !== 'list') throw Error('Historical list required');
    return this.snapshot(read.signal, async query => {
      const q = intent.parameters, values: unknown[] = [COMPLETE_SCOPE_DECISION], predicates = [published], effective = this.runtime26 !== undefined;
      const bind = (value: unknown): string => { values.push(value); return '$' + values.length; };
      let transferScope: string | undefined;
      if (grant.scope.kind !== 'ALL') {
        const position = values.length + 1; bind([...grant.scope.hallIds]);
        if (grant.scope.kind === 'TRANSFER_HALL_IDS') { transferScope = importedHistoryTransferHallScopeSql(position, effective); predicates.push(transferScope); }
        else predicates.push(`h.hall_id=ANY($${position}::uuid[])`);
      }
      if (q.batchId !== null) predicates.push(`h.batch_id=${bind(q.batchId)}::uuid`);
      if (q.number !== '') predicates.push(`strpos(h.number,${bind(q.number)}::text)>0`);
      if (q.businessDateFrom !== null) predicates.push(`${headColumn('business_date', effective)}>=${bind(q.businessDateFrom)}::date`);
      if (q.businessDateTo !== null) predicates.push(`${headColumn('business_date', effective)}<=${bind(q.businessDateTo)}::date`);
      if (q.sourceStatus !== null) predicates.push(`h.source_status=${bind(q.sourceStatus)}::text`);
      for (const [key, column] of (intent.kind === 'sales' ? [['hallId', 'hall_id'], ['warehouseId', 'warehouse_id'], ['customerId', 'customer_id'], ['salespersonId', 'salesperson_id']] : [['fromWarehouseId', 'from_warehouse_id'], ['toWarehouseId', 'to_warehouse_id']]) as [keyof typeof q, string][]) {
        if (q[key] !== null) predicates.push(`${headColumn(column, effective)}=${bind(q[key])}::uuid`);
      }
      const source=from(intent.kind,effective),predicate=predicates.join(' AND ');
      const result=(await query(`/* imported-history:list-shared */ WITH filtered AS MATERIALIZED (
        SELECT ${headerColumns(intent.kind,effective)}${transferScope?`,${transferScope} AS transfer_scope_valid`:''} FROM ${source} WHERE ${predicate}),
        total AS (SELECT count(*)::text AS total FROM filtered),
        paged AS (SELECT * FROM filtered ORDER BY business_date DESC NULLS LAST,number COLLATE "C",id LIMIT $${values.length+1} OFFSET $${values.length+2}::bigint)
        SELECT total.total,coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.business_date DESC NULLS LAST,p.number COLLATE "C",p.id) FROM paged p),'[]'::jsonb) AS items FROM total`,[...values,q.pageSize,String((q.page-1)*q.pageSize)])).rows;
      const total=count(result);requireDomain(result.length===1&&Array.isArray(result[0]!.items),'INVALID_DATABASE_VALUE','Exact historical summary and bounded items required');
      const rows=result[0]!.items as Record<string,unknown>[];
      return validateImportedHistoryList({ dataset: 'HISTORY', kind: intent.kind, documents: page(q.page, q.pageSize, total, rows.map(r => header(r, intent.kind, grant, effective))) }, intent, grant);
    });
  }
  async readDetail(read: ImportedHistoryScopedRead): Promise<ImportedHistoryDetail> {
    const { intent, grant } = this.validate(read, 'detail'); if (intent.operation !== 'detail') throw Error('Historical detail required');
    return this.snapshot(read.signal, async query => {
      const q = intent.parameters, values: unknown[] = [COMPLETE_SCOPE_DECISION, q.documentId];
      const effective = this.runtime26 !== undefined;
      const transferScope = grant.scope.kind === 'TRANSFER_HALL_IDS' ? importedHistoryTransferHallScopeSql(3, effective) : undefined;
      const scoped = transferScope ? ` AND ${transferScope}` : grant.scope.kind === 'HALL_IDS' ? ' AND h.hall_id=ANY($3::uuid[])' : '';
      if (grant.scope.kind !== 'ALL') values.push([...grant.scope.hallIds]);
      const rows = (await query(`/* imported-history:detail */ SELECT ${headerColumns(intent.kind, effective)}${transferScope ? `,${transferScope} AS transfer_scope_valid` : ''},d.line_count,d.settlement_count FROM ${from(intent.kind, effective)} WHERE ${published} AND h.id=$2::uuid${scoped} LIMIT 2`, values)).rows;
      requireDomain(rows.length <= 1, 'INVALID_DATABASE_VALUE', 'Repeated historical target');
      if (!rows.length) return validateImportedHistoryDetail({ dataset: 'HISTORY', kind: intent.kind, document: null, lines: page(q.linePage, q.linePageSize, '0', []), settlements: page(q.settlementPage, q.settlementPageSize, '0', []) }, intent, grant);
      const r = rows[0]!, document = header(r, intent.kind, grant, effective), lineTable = lineTables[intent.kind];
      const lineCount = count((await query(`/* imported-history:line-count */ SELECT count(*)::text total FROM naijue_erp.${lineTable} WHERE batch_id=$1::uuid AND header_id=$2::uuid`, [document.batchId, document.documentId])).rows);
      requireDomain(Number.isSafeInteger(r.line_count) && lineCount === String(r.line_count), 'INVALID_DATABASE_VALUE', 'Historical document line closure differs');
      const lineValues = [document.batchId, document.documentId, q.linePageSize, (q.linePage - 1) * q.linePageSize];
      const lineSql = effective ? `SELECT ${effectiveLineColumns(intent.kind, '$5::integer')}
        FROM naijue_erp.${lineTable} l ${lineEffectiveJoins(intent.kind)}
        WHERE l.batch_id=$1::uuid AND l.header_id=$2::uuid ORDER BY l.line_no,l.id LIMIT $3 OFFSET $4`
        : `SELECT id,line_no,sku_id,quantity::text,product_code_snapshot,product_name_snapshot,color_name_snapshot,fit_name_snapshot,size_name_snapshot,barcode_snapshot${intent.kind === 'sales' ? ',reference_price::text,deal_price::text,line_amount::text,allocated_discount::text,is_gift,pricing_method_source,discount_tenths,ordinary_zero_confirmed' : ''} FROM naijue_erp.${lineTable} WHERE batch_id=$1::uuid AND header_id=$2::uuid ORDER BY line_no,id LIMIT $3 OFFSET $4`;
      const lineRows = (await query(`/* imported-history:line-page */ ${lineSql}`, effective ? [...lineValues, document.version] : lineValues)).rows;
      let settlementCount = '0', settlementRows: Record<string, unknown>[] = [];
      if (intent.kind === 'sales') {
        settlementCount = count((await query('/* imported-history:settlement-count */ SELECT count(*)::text total FROM naijue_erp.history_sales_settlement WHERE batch_id=$1::uuid AND header_id=$2::uuid', [document.batchId, document.documentId])).rows);
        const settlementValues = [document.batchId, document.documentId, q.settlementPageSize, (q.settlementPage - 1) * q.settlementPageSize];
        settlementRows = (await query(effective ? `/* imported-history:settlement-page */ SELECT s.id,s.line_no,s.payment_account_id,s.direction,
          coalesce(se.amount,s.amount)::text amount,s.account_name_snapshot,s.method_name_snapshot,s.payment_method_id_snapshot,
          (se.settlement_id IS NULL OR (${revisionPredicate('sales', 'sr', 's.header_id')} AND sr.to_version<=$5::integer)) AS effective_valid
          FROM naijue_erp.history_sales_settlement s LEFT JOIN naijue_erp.history_sales_settlement_effective se ON se.settlement_id=s.id
          LEFT JOIN naijue_erp.history_revision sr ON sr.id=se.revision_id
          WHERE s.batch_id=$1::uuid AND s.header_id=$2::uuid ORDER BY s.line_no,s.id LIMIT $3 OFFSET $4`
          : '/* imported-history:settlement-page */ SELECT id,line_no,payment_account_id,direction,amount::text,account_name_snapshot,method_name_snapshot,payment_method_id_snapshot FROM naijue_erp.history_sales_settlement WHERE batch_id=$1::uuid AND header_id=$2::uuid ORDER BY line_no,id LIMIT $3 OFFSET $4', effective ? [...settlementValues, document.version] : settlementValues)).rows;
      }
      requireDomain(Number.isSafeInteger(r.settlement_count) && settlementCount === String(r.settlement_count), 'INVALID_DATABASE_VALUE', 'Historical settlement closure differs');
      const lineItems = lineRows.map(r => line(r, intent.kind, effective));
      const lineCatalog = effective ? await readLineCatalog(query, intent.kind, document, lineItems) : undefined;
      return validateImportedHistoryDetail({ dataset: 'HISTORY', kind: intent.kind, document, lines: page(q.linePage, q.linePageSize, lineCount, lineItems), settlements: page(q.settlementPage, q.settlementPageSize, settlementCount, settlementRows.map(r => settlement(r, effective))),
        ...(lineCatalog === undefined ? {} : { lineCatalog }) }, intent, grant);
    });
  }
}
