import type { DocumentInventoryAnchor, DocumentInventorySnapshot } from '../../../packages/domain/src/document-inventory-effects.ts';
import { canonicalDocumentInventorySnapshot, planDocumentInventoryMigration } from '../../../packages/domain/src/document-inventory-effects.ts';
import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { businessDate, entityId } from '../../../packages/domain/src/values.ts';
import type { EntityId, EntityKind } from '../../../packages/domain/src/values.ts';
import { booleanValue, integerValue, jsonObject, quantityFromSql, stringValue, versionFromSql } from './codec.ts';
import type { PgSalesResult } from './sales-unit-of-work.ts';

type Query = (sql: string, values?: unknown[]) => Promise<PgSalesResult>;
const id = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> => entityId(kind, stringValue(value));
const stamp = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  requireDomain(typeof value === 'string' && choices.includes(value as T), 'INVALID_BASELINE_ANCHOR', 'Unexpected sealed migration enum');
  return value as T;
}

/** Verify the SEALED original ordinary snapshot, not the mutable current read
 * model. PostgreSQL computes SHA256 of its own UTF8 jsonb::text: JS JSON order,
 * the package coverage digest and the inventory-only kernel key are NOT that
 * digest. This reader issues no runtime authority, grants or schema upgrades. */
export async function readVerifiedDocumentMigration(query: Query, kind: 'SALES' | 'TRANSFER',
  documentId: EntityId<'sales'> | EntityId<'transfer'>): Promise<{readonly anchor:DocumentInventoryAnchor;readonly snapshot:Record<string,unknown>} | undefined> {
  const rows = (await query(`/* document-inventory:anchor */ WITH current_document AS (
    SELECT to_jsonb(h) AS h FROM naijue_erp.sales_header h WHERE $1::text='SALES' AND h.id=$2::uuid
    UNION ALL SELECT to_jsonb(h) FROM naijue_erp.transfer_header h WHERE $1::text='TRANSFER' AND h.id=$2::uuid
  ), sealed AS (
    SELECT r.*, a.operation_id AS audit_operation_id, a.actor_account_id AS audit_actor, a.occurred_at,
      a.old_version, a.new_version, a.object_type, a.object_id, a.action AS audit_action, a.before_values,
      a.after_values, a.after_values-ARRAY['baseline','sourceRecordId'] AS snapshot,
      a.after_values->'baseline' AS coverage, c.h AS current_header
    FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id
    CROSS JOIN current_document c WHERE r.target_type=$1::text AND r.target_id=$2::uuid AND r.action='MIGRATE_DOCUMENT'
  ) SELECT r.id, r.target_type, r.target_id, r.actor_account_id, r.new_version AS target_version,
    ${stamp('r.completed_at')} AS completed_at, ${stamp('r.occurred_at')} AS occurred_at,
    r.audit_operation_id, r.audit_actor, r.old_version, r.new_version, r.snapshot,
    jsonb_build_object('header',r.snapshot->'header'||jsonb_build_object(
      'gross_amount',r.snapshot->'header'->>'gross_amount','order_discount',r.snapshot->'header'->>'order_discount','net_due',r.snapshot->'header'->>'net_due'),
      'lines',(SELECT COALESCE(jsonb_agg(item||jsonb_build_object('quantity',item->>'quantity','reference_price',item->>'reference_price',
        'deal_price',item->>'deal_price','line_amount',item->>'line_amount','allocated_discount',item->>'allocated_discount')),'[]'::jsonb) FROM jsonb_array_elements(r.snapshot->'lines') item),
      'settlements',(SELECT COALESCE(jsonb_agg(item||jsonb_build_object('amount',item->>'amount')),'[]'::jsonb) FROM jsonb_array_elements(r.snapshot->'settlements') item)) AS financial_snapshot,
    b.id AS batch_id, s.id AS source_record_id, s.source_system, s.source_entity_type, s.source_key,
    s.source_record_hash, baseline.id AS baseline_batch_id, baseline.source_hash AS baseline_manifest_sha256,
    ${stamp('baseline.cutoff_at')} AS cutoff_at,
    (EXISTS(SELECT 1 FROM naijue_erp.schema_migration WHERE version=27)
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='naijue_erp.inventory_ledger'::regclass
        AND attname='baseline_anchor_operation_id' AND NOT attisdropped)
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='naijue_erp.inventory_ledger'::regclass
        AND conname='ledger_reversal_evidence_xor' AND convalidated)
      AND NOT EXISTS(SELECT 1 FROM (VALUES
        ('import_record','import_document_target_once'), ('operation_receipt','document_migration_anchor_once'),
        ('inventory_ledger','baseline_sales_reversal_once'), ('inventory_ledger','baseline_transfer_reversal_once')) required(table_name,index_name)
        WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class x ON x.oid=i.indexrelid
          WHERE i.indrelid=to_regclass('naijue_erp.'||required.table_name) AND x.relname=required.index_name
            AND i.indisunique AND i.indisvalid AND i.indisready))
      AND NOT EXISTS(SELECT 1 FROM (VALUES
        ('sales_header','sales_cutoff_freeze','guard_unified_document'),
        ('transfer_header','transfer_header_provenance','guard_unified_document'),
        ('inventory_ledger','baseline_reversal_source','validate_unified_baseline_reversal'),
        ('operation_receipt','unified_ordinary_operation_consistency','validate_unified_ordinary_operation'),
        ('operation_receipt','immutable_receipt','reject_immutable_change'),
        ('audit_change','immutable_audit','reject_immutable_change'),
        ('import_record','immutable_import_record','reject_immutable_change')) required(table_name,trigger_name,function_name)
        WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
          JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE t.tgrelid=to_regclass('naijue_erp.'||required.table_name)
          AND t.tgname=required.trigger_name AND t.tgenabled='O' AND n.nspname='naijue_erp' AND p.proname=required.function_name))) AS schema_ready,
    ((r.status='COMMITTED' AND r.target_type=$1::text AND r.target_id=$2::uuid
      AND r.current_header->>'id'=$2::text AND r.current_header->>'stock_basis'='CUTOFF_HISTORY'
      AND r.current_header->>'import_batch_id'=b.id::text
      AND r.snapshot->'header'->>'id'=$2::text AND r.snapshot->'header'->>'stock_basis'='CUTOFF_HISTORY'
      AND r.snapshot->'header'->>'import_batch_id'=b.id::text
      AND r.result_data->>'operationId'=r.id::text
      AND r.result_data->>CASE $1::text WHEN 'SALES' THEN 'salesId' ELSE 'transferId' END=$2::text
      AND r.result_data->>'batchId'=b.id::text AND r.result_data->>'sourceRecordId'=s.id::text
      AND r.after_values->>'sourceRecordId'=s.id::text AND r.result_data->'baseline'=r.coverage
      AND r.result_data->'ledgerEntryIds'='[]'::jsonb AND r.result_data->>'version'=r.new_version::text
      AND r.snapshot->'header'->>'version'=r.new_version::text
      AND r.result_data->>'status'=r.snapshot->'header'->>'status'
      AND r.audit_operation_id=r.id AND r.audit_actor=r.actor_account_id AND r.occurred_at=r.completed_at
      AND r.object_type=r.target_type AND r.object_id=r.target_id AND r.audit_action=r.action
      AND r.old_version IS NULL AND r.before_values IS NULL
      AND r.result_data->>'exposureDigest'=encode(sha256(convert_to(r.snapshot::text,'UTF8')),'hex')
      AND jsonb_typeof(r.snapshot->'header')='object' AND jsonb_typeof(r.snapshot->'lines')='array'
      AND jsonb_typeof(r.snapshot->'settlements')='array'
      AND (r.snapshot-ARRAY['header','lines','settlements'])='{}'::jsonb
      AND b.inventory_mode='DOCUMENT_CONVERSION' AND b.mapping_version='DOCUMENT_CONVERSION_V1' AND b.status='IMPORTED'
      AND s.import_batch_id=b.id AND s.source_system=b.source_name AND s.status='IMPORTED' AND s.reviewed_at IS NOT NULL
      AND s.target_id=r.target_id AND s.target_type=CASE $1::text WHEN 'SALES' THEN 'SALES_HEADER' ELSE 'TRANSFER_HEADER' END
      AND s.source_entity_type=s.target_type AND s.source_record_hash ~ '^[0-9a-f]{64}$'
      AND baseline.inventory_mode='CUTOFF_STOCK_BASELINE' AND baseline.status='IMPORTED'
      AND baseline.completed_at IS NOT NULL AND baseline.cutoff_at=b.cutoff_at
      AND r.coverage->>'state'='CONFIRMED' AND r.coverage->>'baselineBatchId'=baseline.id::text
      AND r.coverage->>'baselineManifestSha256'=baseline.source_hash
      AND (r.coverage->>'cutoffAt')::timestamptz=baseline.cutoff_at
      AND r.coverage->>'coverageDigest' ~ '^[0-9a-f]{64}$'
      AND (r.coverage-ARRAY['state','baselineBatchId','baselineManifestSha256','cutoffAt','coverageDigest'])='{}'::jsonb
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.snapshot->'lines') item WHERE NOT EXISTS(
        SELECT 1 FROM naijue_erp.import_record m WHERE m.import_batch_id=b.id AND m.status='IMPORTED'
          AND m.source_system=b.source_name AND m.target_type=CASE $1::text WHEN 'SALES' THEN 'SALES_LINE' ELSE 'TRANSFER_LINE' END
          AND m.source_entity_type=m.target_type AND m.target_id=(item->>'id')::uuid))
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.snapshot->'settlements') item WHERE NOT EXISTS(
        SELECT 1 FROM naijue_erp.import_record m WHERE m.import_batch_id=b.id AND m.status='IMPORTED'
          AND m.source_system=b.source_name AND m.target_type='SALES_SETTLEMENT' AND m.source_entity_type=m.target_type
          AND m.target_id=(item->>'id')::uuid))
      AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.operation_id=r.id)
      AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_balance balance WHERE balance.last_operation_id=r.id)) IS TRUE) AS anchor_valid
    FROM sealed r JOIN naijue_erp.import_batch b ON b.id=(r.snapshot->'header'->>'import_batch_id')::uuid
    JOIN naijue_erp.import_record s ON s.id=(r.result_data->>'sourceRecordId')::uuid
    JOIN naijue_erp.import_batch baseline ON baseline.id=(r.coverage->>'baselineBatchId')::uuid`, [kind, documentId])).rows;
  requireDomain(rows.length <= 1, 'INVALID_BASELINE_ANCHOR', 'One immutable migration anchor per ordinary document is required');
  const row = rows[0];
  if (!row) return undefined;
  requireDomain(row.schema_ready === true && row.anchor_valid === true, 'INVALID_BASELINE_ANCHOR', 'Sealed ordinary migration, source, baseline and PostgreSQL snapshot digest must all verify');
  requireDomain(row.target_type === kind && row.target_id === documentId && row.old_version === null,
    'INVALID_BASELINE_ANCHOR', 'Migration anchor must match the loaded ordinary document');
  const snapshot = decodeInventorySnapshot(row.snapshot, kind, documentId);
  const anchor = planDocumentInventoryMigration({ snapshot,
    source: { batchId: stringValue(row.batch_id), sourceRecordId: stringValue(row.source_record_id), sourceSystem: stringValue(row.source_system),
      sourceEntityType: stringValue(row.source_entity_type), sourceKey: stringValue(row.source_key), sourceRecordSha256: stringValue(row.source_record_hash) },
    receipt: { id: id('operation', row.id), action: 'MIGRATE_DOCUMENT', status: 'COMMITTED', targetKind: kind,
      targetId: documentId, targetVersion: versionFromSql(row.target_version), actorAccountId: id('account', row.actor_account_id), completedAt: stringValue(row.completed_at) },
    audit: { operationId: id('operation', row.audit_operation_id), actorAccountId: id('account', row.audit_actor), occurredAt: stringValue(row.occurred_at),
      oldVersion: null, newVersion: versionFromSql(row.new_version) },
    // This projection is derived ONLY AFTER the full original PG snapshot and
    // explicit baseline binding have verified. It is not the stored SHA256.
    coverage: { state: 'CONFIRMED', baselineBatchId: stringValue(row.baseline_batch_id), baselineManifestSha256: stringValue(row.baseline_manifest_sha256),
      cutoffAt: stringValue(row.cutoff_at), snapshotKey: canonicalDocumentInventorySnapshot(snapshot) }
  }).anchor;
  return {anchor,snapshot:jsonObject(row.financial_snapshot ?? row.snapshot)};
}

/** Inventory API remains unchanged; full financial snapshot is used only by the authenticated sales origin reader. */
export async function readDocumentInventoryAnchor(query:Query,kind:'SALES'|'TRANSFER',documentId:EntityId<'sales'>|EntityId<'transfer'>):Promise<DocumentInventoryAnchor|undefined>{
  return (await readVerifiedDocumentMigration(query,kind,documentId))?.anchor;
}

export function decodeInventorySnapshot(value: unknown, kind: 'SALES' | 'TRANSFER', documentId: EntityId<'sales'> | EntityId<'transfer'>): DocumentInventorySnapshot {
  const snapshot = jsonObject(value), header = jsonObject(snapshot.header);
  requireDomain(Array.isArray(snapshot.lines) && Array.isArray(snapshot.settlements), 'INVALID_BASELINE_ANCHOR', 'Complete original ordinary detail and settlement arrays required');
  requireDomain(header.id === documentId, 'INVALID_BASELINE_ANCHOR', 'Sealed snapshot document identity differs');
  const shared = { businessDate: businessDate(stringValue(header.business_date)), status: choice(header.status, ['DRAFT','APPROVED','VOID']), version: versionFromSql(header.version) };
  const ids = new Set<string>(), positions = new Set<number>();
  const lines = snapshot.lines.map(value => {
    const line = jsonObject(value), lineNo = integerValue(line.line_no), lineId = stringValue(line.id);
    requireDomain(lineNo > 0 && !ids.has(lineId) && (!booleanValue(line.is_current) || !positions.has(lineNo)), 'INVALID_BASELINE_ANCHOR', 'Sealed current line identity and position must be unique');
    ids.add(lineId); if (line.is_current) positions.add(lineNo);
    const owner = kind === 'SALES' ? line.sales_id : line.transfer_id;
    requireDomain(owner === documentId, 'INVALID_BASELINE_ANCHOR', 'Sealed line owner differs');
    return { line, lineNo, lineId };
  });
  if (kind === 'SALES') return { kind, header: { ...shared, id: id('sales', header.id), businessType: choice(header.business_type, ['SALE','RETURN','EXCHANGE']), warehouseId: id('warehouse', header.warehouse_id) },
    lines: lines.map(({line,lineNo,lineId}) => ({ id: id('salesLine',lineId), salesId:id('sales',line.sales_id), lineNo, skuId:id('sku',line.sku_id), quantity:quantityFromSql(line.quantity), isCurrent:booleanValue(line.is_current) })) };
  requireDomain(snapshot.settlements.length === 0, 'INVALID_BASELINE_ANCHOR', 'Transfer migration cannot contain sales settlements');
  return { kind, header: { ...shared, id:id('transfer',header.id), fromWarehouseId:id('warehouse',header.from_warehouse_id), toWarehouseId:id('warehouse',header.to_warehouse_id) },
    lines: lines.map(({line,lineNo,lineId}) => ({ id:id('transferLine',lineId), transferId:id('transfer',line.transfer_id), lineNo, skuId:id('sku',line.sku_id), quantity:quantityFromSql(line.quantity), isCurrent:booleanValue(line.is_current) })) };
}
