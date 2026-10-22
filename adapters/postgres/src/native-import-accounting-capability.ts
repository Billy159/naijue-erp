import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { GUARD_CAPABILITY } from "./inventory-publication-guards.ts";
import type { PgSalesClient } from "./sales-unit-of-work.ts";

// Exact table/trigger/function/event/deferred tuples, not a same-name count.
// This is runtime capability evidence, not protection against a privileged owner
// rewriting functions or disabling/re-enabling guards between observations.
const triggers: readonly (readonly [string, string, string, number, boolean])[] = [
  ...["import_source_row", "import_sku_alias", "history_sales_header", "history_transfer_header",
    "history_sales_line", "history_transfer_line", "history_sales_settlement"].flatMap(table => [
    [table, `${table}_stage`, "guard_history_insert", 7, false] as const,
    [table, `${table}_immutable`, "reject_immutable_change", 27, false] as const,
    [table, `${table}_no_truncate`, "reject_immutable_change", 34, false] as const,
  ]),
  ["import_stock_contributor", "import_stock_contributor_stage", "guard_history_insert", 7, false],
  ["import_stock_contributor", "import_stock_contributor_immutable", "reject_immutable_change", 11, false],
  ["import_stock_contributor", "import_stock_contributor_no_truncate", "reject_immutable_change", 34, false],
  ["import_stock_contributor", "import_stock_contributor_link", "guard_contributor_link", 19, false],
  ["history_revision", "history_revision_closed", "history_revision_not_enabled", 7, false],
  ["history_revision", "history_revision_immutable", "reject_immutable_change", 27, false],
  ["history_revision", "history_revision_no_truncate", "reject_immutable_change", 34, false],
  ["import_batch", "import_batch_history_publication", "guard_history_publication", 23, false],
  ["import_header_native_reference", "import_header_native_reference_stage", "guard_header_native_reference", 7, false],
  ["import_header_native_reference", "import_header_native_reference_immutable", "reject_immutable_change", 27, false],
  ["import_header_native_reference", "import_header_native_reference_no_truncate", "reject_immutable_change", 34, false],
  ["import_batch", "import_batch_history_header_native_reference_publication", "guard_header_native_reference_publication", 23, false],
  ["native_party_import_evidence", "native_party_import_evidence_immutable", "reject_immutable_change", 27, false],
  ["native_party_import_evidence", "native_party_import_evidence_no_truncate", "reject_immutable_change", 34, false],
  ["native_party_import_evidence", "native_party_import_intent_guard", "guard_native_party_import_intent", 7, false],
  ["native_party_import_evidence", "native_party_import_commit", "validate_native_party_import_commit", 5, true],
  ["import_native_catalogue_binding", "native_catalogue_binding_stage", "guard_native_catalogue_binding", 7, false],
  ["import_native_catalogue_binding", "native_catalogue_binding_immutable", "reject_immutable_change", 27, false],
  ["import_native_catalogue_binding", "native_catalogue_binding_no_truncate", "reject_immutable_change", 34, false],
  ["import_batch", "native_catalogue_publication", "guard_native_catalogue_publication", 23, false],
  ["import_record_accounting_claim", "import_accounting_claim_immutable", "reject_immutable_change", 27, false],
  ["import_record_accounting_claim", "import_accounting_claim_no_truncate", "reject_immutable_change", 34, false],
  ["import_record_accounting_claim", "import_accounting_claim_identity", "guard_import_accounting_claim", 7, false],
  ["import_record_accounting_claim", "import_accounting_claim_consistency", "validate_import_accounting_claim_commit", 5, true],
  ["import_batch", "import_accounting_checkpoint_consistency", "validate_import_accounting_checkpoint_commit", 21, true],
  ["inventory_ledger", "import_accounting_baseline_consistency", "validate_import_accounting_baseline_commit", 5, true],
  ["import_record", "import_accounting_final_record_consistency", "validate_import_accounting_final_record_commit", 5, true],
  ["import_batch", "import_accounting_publication", "guard_import_accounting_publication", 19, false],
];
const literal = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const columns = (table: string, keys: string): string => `ARRAY(SELECT a.attname::text FROM unnest(${keys}) WITH ORDINALITY k(attnum,ordinality)
  JOIN pg_catalog.pg_attribute a ON a.attrelid=${table} AND a.attnum=k.attnum ORDER BY k.ordinality)`;
const PAYMENT17_CAPABILITY = `
  NOT EXISTS(SELECT 1 FROM (VALUES
    ('import_native_payment_binding','native_payment_binding_stage','guard_native_payment_binding',7),
    ('import_native_payment_binding','native_payment_binding_immutable','reject_immutable_change',27),
    ('import_native_payment_binding','native_payment_binding_no_truncate','reject_immutable_change',34),
    ('import_batch','native_payment_publication','guard_native_payment_publication',23)) required(table_name,trigger_name,function_name,event_type)
    WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=to_regclass('naijue_erp.'||required.table_name)
      AND t.tgname=required.trigger_name AND t.tgenabled='O' AND t.tgtype=required.event_type AND NOT t.tgdeferrable
      AND t.tgfoid=to_regprocedure('naijue_erp.'||required.function_name||'()')))
  AND NOT EXISTS(SELECT 1 FROM (VALUES
    ('p',ARRAY['batch_id','entity_type','source_key']),('u',ARRAY['batch_id','source_row_id'])) required(kind,key_columns)
    WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid=to_regclass('naijue_erp.import_native_payment_binding')
      AND c.contype::text=required.kind AND c.convalidated AND NOT c.condeferrable AND ${columns("c.conrelid","c.conkey")}=required.key_columns))
  AND NOT EXISTS(SELECT 1 FROM (VALUES
    ('import_batch',ARRAY['batch_id'],ARRAY['id']),('import_source_row',ARRAY['batch_id','source_row_id'],ARRAY['batch_id','id']),
    ('payment_method',ARRAY['native_payment_method_id'],ARRAY['id']),('payment_account',ARRAY['native_payment_account_id'],ARRAY['id']),
    ('hall',ARRAY['native_hall_id'],ARRAY['id']),('payment_account_hall',ARRAY['native_payment_account_id','native_hall_id'],ARRAY['payment_account_id','hall_id'])) required(target_table,local_columns,target_columns)
    WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid=to_regclass('naijue_erp.import_native_payment_binding')
      AND c.confrelid=to_regclass('naijue_erp.'||required.target_table) AND c.contype='f' AND c.convalidated AND NOT c.condeferrable
      AND c.confdeltype='a' AND c.confupdtype='a' AND ${columns("c.conrelid","c.conkey")}=required.local_columns AND ${columns("c.confrelid","c.confkey")}=required.target_columns))
  AND NOT EXISTS(SELECT 1 FROM (VALUES
    ('native_payment_method_identity',ARRAY['batch_id','native_payment_method_id'],'PAYMENT_METHOD'),
    ('native_payment_account_identity',ARRAY['batch_id','native_payment_account_id'],'PAYMENT_ACCOUNT'),
    ('native_payment_hall_identity',ARRAY['batch_id','native_payment_account_id','native_hall_id'],'PAYMENT_ACCOUNT_HALL')) required(index_name,key_columns,entity)
    WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class x ON x.oid=i.indexrelid
      WHERE i.indrelid=to_regclass('naijue_erp.import_native_payment_binding') AND x.relname=required.index_name
      AND i.indisvalid AND i.indisready AND i.indisunique AND i.indnkeyatts=cardinality(required.key_columns)
      AND ${columns("i.indrelid","i.indkey::smallint[]")}=required.key_columns
      AND pg_get_expr(i.indpred,i.indrelid)=format('(entity_type = %L::text)',required.entity)))
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('naijue_erp.import_native_payment_binding')
    AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0))`;


// Exact current18 source pins, including all original0013 creation/XID/time/no-adoption functions.
// Full native15/16/17 guards still precede this additive conjunction. Not permission to migrate.
export const HISTORY18_CLOSURE_CAPABILITY = `
 NOT EXISTS(SELECT 1 FROM (VALUES ('reject_immutable_change()','7fd92638ea5903af835fd52e2740df66','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('cutoff_import_lock()','7aa5e2e7fbe4580302c34a8b678aba0c','sql','v',false,true,'search_path=pg_catalog,naijue_erp'),('import_source_key_lock(text,text,text)','01e33162d751072a8104f8f53c154bd9','sql','v',false,true,'search_path=pg_catalog,naijue_erp'),('guard_history_insert()','300eb6c65679f408959a717015494f00','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('guard_contributor_link()','ecc0554f1e8914067c7bed3c4fe74534','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('validate_history_product_proofs(uuid)','7cc32bfbd28af764d83b26c8bedd466b','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('guard_history_publication()','5f6862cc8715c07622e1ba6b14f9aa68','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('guard_header_native_reference()','faf47176d49c0d978face1a778bf36f2','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('guard_header_native_reference_publication()','44a507eed6e2e976a268e8527b010228','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('guard_native_party_import_intent()','47a9d34680c90a31a9dfbda5e1ac608c','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('is_native_party_import_insert(text,jsonb)','7ee15ace84a76a9af4bcd8e17c91a2cc','sql','v',true,true,'search_path=pg_catalog,naijue_erp'),('validate_native_party_import_commit()','8dca79c15351860d83772154739f87f1','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('keep_party_native_identity()','48d51502fec9f9160d3ef6e710bd7e3f','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('validate_party_native_commit()','d345ac470c4b19f1d54bd14f05a5b9d3','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('guard_native_catalogue_binding()','debe8d23a074918b063fb0056197f4a1','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('guard_native_catalogue_publication()','b3369c4c85ae5f59a826f8c5fd684b3b','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('guard_import_accounting_claim()','834dc852808d74913841772fe00e32f0','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('validate_import_accounting_claim_commit()','0f9be3cc9a993043144cfadd657f45d2','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('validate_import_accounting_checkpoint_commit()','2eb1bc28552c1e5cb8d74cc2a4ae95e5','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('validate_import_accounting_baseline_commit()','2d612a969054a1936bcbbe8d32d4fc18','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('validate_import_accounting_final_record_commit()','8dc8e20662be36d8f84473a3bfc7420f','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('guard_import_accounting_publication()','43d9bb4436e19fa4df94c1b51e08246e','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('guard_native_payment_binding()','bb21b120553fa5b866bb8033a123a19c','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('guard_native_payment_publication()','c51d89d40d0fcf5de709f75047ca75ce','plpgsql','v',false,true,'search_path=pg_catalog,naijue_erp'),('history_closure_encode(jsonb,integer)','12ec166bc7ee379141cfe9095920754f','plpgsql','i',false,false,'search_path=pg_catalog,naijue_erp'),('history_closure_row_hash(text,text,jsonb)','804cae577014c088549e72af8e6472da','plpgsql','i',false,false,'search_path=pg_catalog,naijue_erp'),('history_closure_seed(text)','9f53b456f3e68d449d30ec590b28f8f3','plpgsql','i',false,false,'search_path=pg_catalog,naijue_erp'),('history_closure_fold(bytea,text)','f0f846476a0a37f256ac7e6d52f1842a','plpgsql','i',false,false,'search_path=pg_catalog,naijue_erp'),('history_closure_finish(text,bigint,bytea)','459720c834ed3991aa837112d8540552','plpgsql','i',false,false,'search_path=pg_catalog,naijue_erp'),('history_closure_count_map(jsonb,text[])','1d973666367e7c5f2c4a42202056a3dd','plpgsql','i',false,false,'search_path=pg_catalog'),('history_closure_projection_columns(text)','ca93d1438f9bde53fe4f5cafe09b2c37','plpgsql','i',false,false,'search_path=pg_catalog,naijue_erp'),('history_closure_projection(text,jsonb)','4b53ca33edbe417cbe1eb16c5b85b6b0','plpgsql','i',false,false,'search_path=pg_catalog,naijue_erp'),('history_closure_projection_key(text,jsonb)','22ba6f524c7c40d597fdb52ac4b79b0e','plpgsql','i',false,false,'search_path=pg_catalog,naijue_erp'),('history_closure_rows(uuid)','70ecff2a73dd659dca4cc52589bda85d','sql','s',false,false,'search_path=pg_catalog,naijue_erp'),('history_closure_document_rows(uuid,text,uuid,boolean)','68aca88b40b72f2829f4e1cb44b46bfb','plpgsql','s',false,false,'search_path=pg_catalog,naijue_erp'),('history_closure_digest(uuid,text,text,text,uuid,jsonb)','0addd270d5265c53aaeeaff8458bdb16','plpgsql','s',false,false,'search_path=pg_catalog,naijue_erp'),('assert_history_typed_closure(uuid,jsonb,jsonb)','0d7ea7603816f2ea9c80b4f554b006a5','plpgsql','v',false,false,'search_path=pg_catalog,naijue_erp'),('guard_history_closure_stage()','19d2125ffd289eebb0ec5c8e04528cff','plpgsql','v',false,false,'search_path=pg_catalog,naijue_erp'),('validate_history_closure_commit()','b42220adaac3e2e46ecc9feb8a3ec735','plpgsql','v',false,false,'search_path=pg_catalog,naijue_erp'),('guard_history_typed_publication()','2fa571b4582b80c131b45efeb8f76d48','plpgsql','v',false,false,'search_path=pg_catalog,naijue_erp')) required(signature,body_md5,language_name,volatility,is_definer,public_execute,search_path)
 WHERE NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('naijue_erp.'||required.signature)
  AND md5(p.prosrc)=required.body_md5 AND l.lanname=required.language_name AND p.provolatile::text=required.volatility
  AND p.prosecdef=required.is_definer AND NOT p.proisstrict AND cardinality(p.proconfig)=1
  AND regexp_replace(p.proconfig[1],'[[:space:]]','','g')=required.search_path
  AND EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')=required.public_execute
  AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee NOT IN(0,p.proowner) OR a.privilege_type<>'EXECUTE' OR(a.grantee=0 AND a.is_grantable))))
 AND NOT EXISTS(SELECT 1 FROM (VALUES ('import_history_closure_manifest','history_closure_stage','guard_history_closure_stage',7,false),('import_history_document_manifest','history_document_closure_stage','guard_history_closure_stage',7,false),('import_history_closure_manifest','history_closure_immutable','reject_immutable_change',27,false),('import_history_document_manifest','history_document_closure_immutable','reject_immutable_change',27,false),('import_history_closure_manifest','history_closure_no_truncate','reject_immutable_change',34,false),('import_history_document_manifest','history_document_closure_no_truncate','reject_immutable_change',34,false),('import_history_closure_manifest','history_closure_complete','validate_history_closure_commit',5,true),('import_batch','history_typed_publication','guard_history_typed_publication',23,false)) required(table_name,trigger_name,function_name,event_type,is_deferred)
 WHERE NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('naijue_erp.'||required.table_name) AND t.tgname=required.trigger_name
  AND t.tgenabled='O' AND t.tgtype=required.event_type AND t.tgdeferrable=required.is_deferred AND t.tginitdeferred=required.is_deferred
  AND t.tgfoid=to_regprocedure('naijue_erp.'||required.function_name||'()')))
 AND NOT EXISTS(SELECT 1 FROM (VALUES ('import_history_closure_manifest','p',ARRAY['batch_id']),('import_history_document_manifest','p',ARRAY['batch_id','document_kind','source_key']),('import_history_document_manifest','u',ARRAY['batch_id','header_source_row_id']),('import_history_document_manifest','u',ARRAY['batch_id','sales_header_id']),('import_history_document_manifest','u',ARRAY['batch_id','transfer_header_id'])) required(table_name,kind,key_columns)
 WHERE NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('naijue_erp.'||required.table_name) AND c.contype::text=required.kind
  AND c.convalidated AND NOT c.condeferrable AND ${columns("c.conrelid","c.conkey")}=required.key_columns))
 AND NOT EXISTS(SELECT 1 FROM (VALUES ('import_history_closure_manifest','import_batch',ARRAY['batch_id'],ARRAY['id']),('import_history_document_manifest','import_history_closure_manifest',ARRAY['batch_id'],ARRAY['batch_id']),('import_history_document_manifest','import_source_row',ARRAY['batch_id','header_source_row_id'],ARRAY['batch_id','id']),('import_history_document_manifest','history_sales_header',ARRAY['batch_id','sales_header_id'],ARRAY['batch_id','id']),('import_history_document_manifest','history_transfer_header',ARRAY['batch_id','transfer_header_id'],ARRAY['batch_id','id'])) required(table_name,target_table,key_columns,target_columns)
 WHERE NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('naijue_erp.'||required.table_name)
  AND c.confrelid=to_regclass('naijue_erp.'||required.target_table) AND c.contype='f' AND c.convalidated AND NOT c.condeferrable
  AND c.confdeltype='a' AND c.confupdtype='a' AND ${columns("c.conrelid","c.conkey")}=required.key_columns AND ${columns("c.confrelid","c.confkey")}=required.target_columns))
 AND NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid IN(to_regclass('naijue_erp.import_history_closure_manifest'),to_regclass('naijue_erp.import_history_document_manifest'),to_regclass('naijue_erp.native_party_import_evidence'))
  AND EXISTS(SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0))
`;

export const NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY = `/* native-accounting:guards */ SELECT
  NOT EXISTS(SELECT 1 FROM (VALUES ${triggers.map(([table, trigger, fn, events, deferred]) =>
    `(${literal(table)},${literal(trigger)},${literal(fn)},${events},${deferred})`).join(",")})
    required(table_name,trigger_name,function_name,event_type,is_deferred)
    WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp'
      AND c.relname=required.table_name AND t.tgname=required.trigger_name AND t.tgenabled='O'
      AND t.tgtype=required.event_type AND t.tgdeferrable=required.is_deferred AND t.tginitdeferred=required.is_deferred
      AND t.tgfoid=to_regprocedure('naijue_erp.'||required.function_name||'()')))
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid=to_regclass('naijue_erp.import_record_accounting_claim')
    AND c.contype='p' AND c.convalidated AND NOT c.condeferrable
    AND ${columns("c.conrelid", "c.conkey")}=ARRAY['import_batch_id','import_record_id'])
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid=to_regclass('naijue_erp.import_record')
    AND c.conname='import_record_accounting_identity' AND c.contype='u' AND c.convalidated AND NOT c.condeferrable
    AND ${columns("c.conrelid", "c.conkey")}=ARRAY['import_batch_id','id','target_type','target_id'])
  AND NOT EXISTS(SELECT 1 FROM (VALUES
    ('operation_receipt',ARRAY['operation_id'],ARRAY['id'],true),
    ('import_record',ARRAY['import_batch_id','import_record_id','target_type','target_id'],ARRAY['import_batch_id','id','target_type','target_id'],false),
    ('import_batch',ARRAY['import_batch_id'],ARRAY['id'],false)) required(target_table,local_columns,target_columns,is_deferred)
    WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c
      WHERE c.conrelid=to_regclass('naijue_erp.import_record_accounting_claim')
      AND c.confrelid=to_regclass('naijue_erp.'||required.target_table) AND c.contype='f' AND c.convalidated
      AND c.condeferrable=required.is_deferred AND c.condeferred=required.is_deferred AND c.confdeltype='a' AND c.confupdtype='a'
      AND ${columns("c.conrelid", "c.conkey")}=required.local_columns AND ${columns("c.confrelid", "c.confkey")}=required.target_columns))
  AND NOT EXISTS(SELECT 1 FROM (VALUES
    ('import_accounting_operation_claims',ARRAY['operation_id','target_type','import_batch_id','checkpoint_sequence']),
    ('import_accounting_checkpoint_claims',ARRAY['import_batch_id','checkpoint_sequence','operation_id'])) required(index_name,key_columns)
    WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class x ON x.oid=i.indexrelid
      WHERE i.indrelid=to_regclass('naijue_erp.import_record_accounting_claim') AND x.relname=required.index_name
      AND i.indisvalid AND i.indisready AND NOT i.indisunique AND i.indnkeyatts=cardinality(required.key_columns)
      AND ${columns("i.indrelid", "i.indkey::smallint[]")}=required.key_columns))
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('naijue_erp.import_record_accounting_claim')
    AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0))
  AND ((SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration)=ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]
    OR ((SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration)=ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('naijue_erp.guard_history_insert()')
        AND md5(prosrc)='300eb6c65679f408959a717015494f00'))
    OR ((SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration)=ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('naijue_erp.guard_history_insert()')
        AND md5(prosrc)='300eb6c65679f408959a717015494f00') AND (${PAYMENT17_CAPABILITY}))
    OR ((SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration)=ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('naijue_erp.guard_history_insert()')
        AND md5(prosrc)='300eb6c65679f408959a717015494f00') AND (${PAYMENT17_CAPABILITY}) AND (${HISTORY18_CLOSURE_CAPABILITY})))
  AS accounting_guards_present`;

/** Additive19 changes exactly one routine body pin. Frozen18 remains an exact
 * closed-publication profile; every other routine/ACL/FK/trigger pin is retained. */
function replaceOne(source: string, before: string, after: string): string {
  if (source.split(before).length !== 2) throw new Error("Expected exactly one frozen history capability anchor");
  return source.replace(before, after);
}
export const HISTORY19_CLOSURE_CAPABILITY = replaceOne(HISTORY18_CLOSURE_CAPABILITY,
  "2fa571b4582b80c131b45efeb8f76d48", "8f949220a449bd0184b995d95a7c6334");
const schemaSelector = "  AND ((SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration)=";
const selectorOffset = NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY.indexOf(schemaSelector);
if (selectorOffset < 0 || NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY.lastIndexOf(schemaSelector) !== selectorOffset)
  throw new Error("Frozen accounting capability selector changed");
/** SELECT-only probe usable in a READ ONLY snapshot; never invokes the lock-taking closure assertion. */
export const NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY =
  NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY.slice(0, selectorOffset)
  + `  AND (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration)=ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19]
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('naijue_erp.guard_history_insert()')
    AND md5(prosrc)='300eb6c65679f408959a717015494f00')
  AND (${PAYMENT17_CAPABILITY}) AND (${HISTORY19_CLOSURE_CAPABILITY}) AS accounting_guards_present`;

export async function assertNativeImportAccountingSchema19Guards(client: PgSalesClient): Promise<void> {
  const base = (await client.query(GUARD_CAPABILITY)).rows;
  requireDomain(base.length === 1 && base[0]!.integrity_guards_present === true,
    "NATIVE_IMPORT_GUARDS_NOT_READY", "Original inventory/source/receipt/audit capability must remain enabled");
  const current = (await client.query(NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY)).rows;
  requireDomain(current.length === 1 && current[0]!.accounting_guards_present === true,
    "NATIVE_IMPORT_GUARDS_NOT_READY", "Exact schema19 publication routine and all original native/accounting/closure capabilities required");
}

export async function assertNativeImportAccountingGuards(client: PgSalesClient): Promise<void> {
  const base = (await client.query(GUARD_CAPABILITY)).rows;
  requireDomain(base.length === 1 && base[0]!.integrity_guards_present === true,
    "NATIVE_IMPORT_GUARDS_NOT_READY", "Original inventory/source/receipt/audit capability must remain enabled");
  const native = (await client.query(NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY)).rows;
  // Prior successful profiles keep their exact two-query path. Only an explicit
  // complete19 profile can pass the separately pinned successor probe.
  const current = native.length === 1 && native[0]!.accounting_guards_present === true ? native
    : (await client.query(NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY)).rows;
  requireDomain(current.length === 1 && current[0]!.accounting_guards_present === true,
    "NATIVE_IMPORT_GUARDS_NOT_READY", "Exact history/native/accounting triggers, deferred identities, receipt FK, unique ownership, indexes and private grants required");
}
