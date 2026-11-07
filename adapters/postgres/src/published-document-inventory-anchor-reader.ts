import type { DocumentInventoryAnchor } from '../../../packages/domain/src/document-inventory-effects.ts';
import { canonicalDocumentInventorySnapshot, planPublishedDocumentInventoryAnchor } from '../../../packages/domain/src/document-inventory-effects.ts';
import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { entityId } from '../../../packages/domain/src/values.ts';
import type { EntityId, EntityKind } from '../../../packages/domain/src/values.ts';
import { stringValue, versionFromSql, jsonObject } from './codec.ts';
import type { PgSalesResult } from './sales-unit-of-work.ts';
import { decodeInventorySnapshot } from './document-inventory-anchor-reader.ts';
type Query=(sql:string,values?:unknown[])=>Promise<PgSalesResult>;
export type PublishedDocumentAnchorProfile = 'EXACT27' | 'EXACT35';
const guardUnifiedDocumentDigest: Readonly<Record<PublishedDocumentAnchorProfile, string>> = {
  EXACT27: 'fa51aa3c79074a829c685127f6638152e26def788d919c19eb38bfffcb50f961',
  EXACT35: 'ff462d6a8a30eadea0d98991818cf15c9fd907db0d00956b3be51193846d3e83',
};
const id=<K extends EntityKind>(kind:K,value:unknown):EntityId<K>=>entityId(kind,stringValue(value));
const stamp=(column:string):string=>`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
/** Runtime reads only the published ordinary audit, receipt and baseline control facts.
 * Import-time source validation is retained; no source identity is invented here. */
export async function readVerifiedPublishedDocumentMigration(query:Query,kind:'SALES'|'TRANSFER',documentId:EntityId<'sales'>|EntityId<'transfer'>,profile:PublishedDocumentAnchorProfile='EXACT27'):Promise<{readonly anchor:DocumentInventoryAnchor;readonly snapshot:Record<string,unknown>}|undefined>{
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
    b.id AS batch_id, baseline.id AS baseline_batch_id, baseline.source_hash AS baseline_manifest_sha256,
    ${stamp('baseline.cutoff_at')} AS cutoff_at,
    (EXISTS(SELECT 1 FROM naijue_erp.schema_migration WHERE version=27)
      AND NOT EXISTS(SELECT 1 FROM (VALUES
        ('naijue_erp.guard_retained_settlement_identity()','73bde63d2dd84da3c5ad491f2b073344c2c6639e667f443f622c5b8d5ed006f6'),
        ('naijue_erp.guard_unified_document()',$3::text),
        ('naijue_erp.reject_immutable_change()','3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c'),
        ('naijue_erp.validate_unified_baseline_reversal()','e79f446269183dc9af235f7408344462e933f4ddd687231a671fc8b195923aed'),
        ('naijue_erp.validate_unified_ordinary_operation()','4df5ec2f7c3a25d2461a56586f83f20d63773f01e6ca80b9c45429676a1969a4')
      ) pin(signature,sha256) WHERE NOT EXISTS(
        SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language lang ON lang.oid=p.prolang
        JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
        WHERE p.oid=to_regprocedure(pin.signature) AND p.proowner=ns.nspowner AND NOT p.prosecdef
          AND p.prokind='f' AND p.provolatile='v' AND NOT p.proleakproof AND p.prosqlbody IS NULL
          AND lang.lanname='plpgsql' AND p.prorettype='pg_catalog.trigger'::regtype
          AND p.proconfig=ARRAY['search_path=pg_catalog, naijue_erp, pg_temp']
          AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=pin.sha256))
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='naijue_erp.inventory_ledger'::regclass
        AND attname='baseline_anchor_operation_id' AND NOT attisdropped)
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint con WHERE con.conrelid='naijue_erp.inventory_ledger'::regclass
        AND con.conname='ledger_reversal_evidence_xor' AND con.convalidated AND con.contype='c'
        AND con.conislocal AND con.coninhcount=0 AND NOT con.connoinherit
        AND ARRAY(SELECT att.attname::text FROM unnest(con.conkey) k(attnum) JOIN pg_catalog.pg_attribute att
          ON att.attrelid=con.conrelid AND att.attnum=k.attnum ORDER BY att.attname)=ARRAY['baseline_anchor_operation_id','event_kind','reverses_entry_id']
        AND pg_catalog.pg_get_expr(con.conbin,con.conrelid,false)=$xor$((((event_kind = 'UNAPPROVE'::text) AND (num_nonnulls(reverses_entry_id, baseline_anchor_operation_id) = 1)) OR ((event_kind <> 'UNAPPROVE'::text) AND (reverses_entry_id IS NULL) AND (baseline_anchor_operation_id IS NULL))) IS TRUE)$xor$)
      AND NOT EXISTS(SELECT 1 FROM (VALUES
        ('operation_receipt','document_migration_anchor_once',ARRAY['target_type','target_id'], $predicate$(action = 'MIGRATE_DOCUMENT'::text)$predicate$),
        ('inventory_ledger','baseline_sales_reversal_once',ARRAY['baseline_anchor_operation_id','source_sales_line_id','endpoint'], $predicate$((baseline_anchor_operation_id IS NOT NULL) AND (source_sales_line_id IS NOT NULL))$predicate$),
        ('inventory_ledger','baseline_transfer_reversal_once',ARRAY['baseline_anchor_operation_id','source_transfer_line_id','endpoint'], $predicate$((baseline_anchor_operation_id IS NOT NULL) AND (source_transfer_line_id IS NOT NULL))$predicate$)) required(table_name,index_name,columns,predicate)
        WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class x ON x.oid=i.indexrelid
          JOIN pg_catalog.pg_am am ON am.oid=x.relam
          WHERE i.indrelid=to_regclass('naijue_erp.'||required.table_name) AND x.relname=required.index_name
            AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate
            AND am.amname='btree' AND i.indexprs IS NULL AND i.indnkeyatts=cardinality(required.columns) AND i.indnatts=i.indnkeyatts
            AND ARRAY(SELECT att.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum,position)
              JOIN pg_catalog.pg_attribute att ON att.attrelid=i.indrelid AND att.attnum=k.attnum ORDER BY k.position)=required.columns
            AND NOT EXISTS(SELECT 1 FROM unnest(i.indkey) WITH ORDINALITY k(attnum,position)
              JOIN pg_catalog.pg_attribute att ON att.attrelid=i.indrelid AND att.attnum=k.attnum
              LEFT JOIN pg_catalog.pg_opclass opc ON opc.oid=i.indclass[(k.position-1)::integer]
              LEFT JOIN pg_catalog.pg_opfamily family ON family.oid=opc.opcfamily
              WHERE (att.atttypid=CASE WHEN att.attname IN ('target_type','endpoint') THEN 'pg_catalog.text'::regtype ELSE 'pg_catalog.uuid'::regtype END
                AND opc.opcnamespace='pg_catalog'::regnamespace AND opc.opcdefault AND opc.opcmethod=x.relam
                AND opc.opcintype=att.atttypid AND opc.opcname=CASE WHEN att.atttypid='pg_catalog.text'::regtype THEN 'text_ops' ELSE 'uuid_ops' END
                AND family.opfnamespace='pg_catalog'::regnamespace AND family.opfname=opc.opcname AND family.opfmethod=x.relam
                AND i.indcollation[(k.position-1)::integer]=att.attcollation
                AND att.attcollation=CASE WHEN att.atttypid='pg_catalog.text'::regtype THEN 'pg_catalog.default'::regcollation::oid ELSE 0::oid END) IS DISTINCT FROM true)
            AND pg_catalog.pg_get_expr(i.indpred,i.indrelid,false)=required.predicate))
      AND NOT EXISTS(SELECT 1 FROM (VALUES
        ('sales_header','sales_cutoff_freeze','guard_unified_document',31,false),
        ('transfer_header','transfer_header_provenance','guard_unified_document',31,false),
        ('inventory_ledger','baseline_reversal_source','validate_unified_baseline_reversal',7,false),
        ('operation_receipt','unified_ordinary_operation_consistency','validate_unified_ordinary_operation',5,true),
        ('operation_receipt','immutable_receipt','reject_immutable_change',27,false),
        ('audit_change','immutable_audit','reject_immutable_change',27,false),
        ('sales_settlement','retained_settlement_identity','guard_retained_settlement_identity',7,false)) required(table_name,trigger_name,function_name,trigger_type,deferred)
        WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
          JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE t.tgrelid=to_regclass('naijue_erp.'||required.table_name)
          AND t.tgname=required.trigger_name AND t.tgenabled='O' AND n.nspname='naijue_erp' AND p.proname=required.function_name
          AND NOT t.tgisinternal AND t.tgtype=required.trigger_type AND t.tgdeferrable=required.deferred AND t.tginitdeferred=required.deferred
          AND t.tgnargs=0 AND octet_length(t.tgargs)=0 AND t.tgattr=''::pg_catalog.int2vector
          AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL
          AND CASE WHEN required.deferred THEN split_part(split_part(pg_catalog.pg_get_triggerdef(t.oid,false),' WHEN ',2),' EXECUTE FUNCTION ',1)=$trigger$((new.target_type = ANY (ARRAY['SALES'::text, 'TRANSFER'::text])))$trigger$
            ELSE t.tgqual IS NULL END))) AS schema_ready,
    ((r.status='COMMITTED' AND r.target_type=$1::text AND r.target_id=$2::uuid
      AND r.current_header->>'id'=$2::text AND r.current_header->>'stock_basis'='CUTOFF_HISTORY'
      AND r.current_header->>'import_batch_id'=b.id::text
      AND r.snapshot->'header'->>'id'=$2::text AND r.snapshot->'header'->>'stock_basis'='CUTOFF_HISTORY'
      AND r.snapshot->'header'->>'import_batch_id'=b.id::text
      AND r.result_data->>'operationId'=r.id::text
      AND r.result_data->>CASE $1::text WHEN 'SALES' THEN 'salesId' ELSE 'transferId' END=$2::text
      AND r.result_data->>'batchId'=b.id::text
      AND r.result_data->'baseline'=r.coverage
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
      AND baseline.inventory_mode='CUTOFF_STOCK_BASELINE' AND baseline.status='IMPORTED'
      AND baseline.completed_at IS NOT NULL AND baseline.cutoff_at=b.cutoff_at
      AND r.coverage->>'state'='CONFIRMED' AND r.coverage->>'baselineBatchId'=baseline.id::text
      AND r.coverage->>'baselineManifestSha256'=baseline.source_hash
      AND (r.coverage->>'cutoffAt')::timestamptz=baseline.cutoff_at
      AND r.coverage->>'coverageDigest' ~ '^[0-9a-f]{64}$'
      AND (r.coverage-ARRAY['state','baselineBatchId','baselineManifestSha256','cutoffAt','coverageDigest'])='{}'::jsonb
      AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.operation_id=r.id)
      AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_balance balance WHERE balance.last_operation_id=r.id)) IS TRUE) AS anchor_valid
    FROM sealed r JOIN naijue_erp.import_batch b ON b.id=(r.snapshot->'header'->>'import_batch_id')::uuid
    JOIN naijue_erp.import_batch baseline ON baseline.id=(r.coverage->>'baselineBatchId')::uuid`, [kind, documentId, guardUnifiedDocumentDigest[profile]])).rows;
  requireDomain(rows.length <= 1, 'INVALID_BASELINE_ANCHOR', 'One immutable migration anchor per ordinary document is required');
  const row = rows[0];
  if (!row) return undefined;
  requireDomain(row.schema_ready === true && row.anchor_valid === true, 'INVALID_BASELINE_ANCHOR', 'Sealed ordinary migration, baseline and PostgreSQL snapshot digest must all verify');
  requireDomain(row.target_type === kind && row.target_id === documentId && row.old_version === null,
    'INVALID_BASELINE_ANCHOR', 'Migration anchor must match the loaded ordinary document');
  const snapshot = decodeInventorySnapshot(row.snapshot, kind, documentId);
  const anchor = planPublishedDocumentInventoryAnchor({ snapshot,
    receipt: { id: id('operation', row.id), action: 'MIGRATE_DOCUMENT', status: 'COMMITTED', targetKind: kind,
      targetId: documentId, targetVersion: versionFromSql(row.target_version), actorAccountId: id('account', row.actor_account_id), completedAt: stringValue(row.completed_at) },
    audit: { operationId: id('operation', row.audit_operation_id), actorAccountId: id('account', row.audit_actor), occurredAt: stringValue(row.occurred_at),
      oldVersion: null, newVersion: versionFromSql(row.new_version) },
    // This projection is derived ONLY AFTER the full original PG snapshot and
    // explicit baseline binding have verified. It is not the stored SHA256.
    coverage: { state: 'CONFIRMED', baselineBatchId: stringValue(row.baseline_batch_id), baselineManifestSha256: stringValue(row.baseline_manifest_sha256),
      cutoffAt: stringValue(row.cutoff_at), snapshotKey: canonicalDocumentInventorySnapshot(snapshot) }
  });
  return {anchor,snapshot:jsonObject(row.financial_snapshot ?? row.snapshot)};
}

export async function readPublishedDocumentInventoryAnchor(query:Query,kind:'SALES'|'TRANSFER',documentId:EntityId<'sales'>|EntityId<'transfer'>,profile:PublishedDocumentAnchorProfile='EXACT27'):Promise<DocumentInventoryAnchor|undefined>{
 return (await readVerifiedPublishedDocumentMigration(query,kind,documentId,profile))?.anchor;
}
