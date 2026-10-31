import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { BigIntStats } from "node:fs";
import { PostgresQueryError, PostgresResourceError, isKnownPostgresTransportQueryError } from "./bounded-pool.ts";
import { isAbsolute } from "node:path";
import type { NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { PgSalesPool, PgSalesResult } from "./sales-unit-of-work.ts";
import type { CatalogueRetainedDeleteCapability, ProductSeasonArrayCapability } from "./product-query-reader.ts";
import type { HistoricalCustomerExclusionCapability } from "./party-read-reader.ts";
import type { ProductMediaWriteCapability } from "./product-maintenance-store.ts";
import type { CategoryOrderWriteCapability } from "./catalogue-maintenance-store.ts";
import { assertMaintenanceDriverPool, maintenanceContextClient, assertMaintenanceProductImagesPrepared, bindMaintenanceCategoryOrderGuard } from "./maintenance-command-unit-of-work.ts";
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

/** Fixed read-only catalog query. Digest uses PostgreSQL JSONB text and built-in
 * SHA-256, never an application routine or a pretty-printed export file. */
export const NATIVE_RUNTIME26_METADATA_PROBE = `/* native-runtime26:metadata-v7 */
WITH observed AS MATERIALIZED (
WITH ns AS (SELECT oid,nspname,nspowner,nspacl FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp'),
rels AS (SELECT c.* FROM pg_catalog.pg_class c JOIN ns ON ns.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m','S')),
fns AS (SELECT p.*,l.lanname,pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_catalog.pg_proc p JOIN ns ON ns.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE p.prokind IN ('f','p')),
acl_roles AS (
  SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN(current_user,session_user,'erp_qa_owner_20261022_01')
  UNION SELECT relowner FROM rels UNION SELECT proowner FROM fns UNION SELECT nspowner FROM ns
  UNION SELECT a.grantee FROM rels r CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(r.relacl,pg_catalog.acldefault(CASE WHEN r.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,r.relowner))) a WHERE a.grantee<>0
  UNION SELECT a.grantee FROM fns f CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))) a WHERE a.grantee<>0
  UNION SELECT a.grantee FROM ns CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(ns.nspacl,pg_catalog.acldefault('n',ns.nspowner))) a WHERE a.grantee<>0
), members AS (SELECT * FROM pg_catalog.pg_auth_members WHERE member IN(SELECT oid FROM acl_roles) OR roleid IN(SELECT oid FROM acl_roles))
SELECT pg_catalog.jsonb_build_object(
 'format','EXACT26_RUNTIME_CATALOG_EXPORT_V1',
 'notice','OBSERVATION_ONLY_NOT_RUNTIME_CAPABILITY_OR_SOURCE_AUTHORITY',
 'identity',(SELECT pg_catalog.jsonb_build_object('database',d.datname,'database_oid',d.oid::text,'database_owner',pg_catalog.pg_get_userbyid(d.datdba),
   'current_user',current_user,'session_user',session_user,'server_version_num',pg_catalog.current_setting('server_version_num'),
   'server_addr',pg_catalog.inet_server_addr()::text,'server_port',pg_catalog.inet_server_port(),
   'postmaster_start',pg_catalog.pg_postmaster_start_time()::text,'replication_role',pg_catalog.current_setting('session_replication_role')) FROM pg_catalog.pg_database d WHERE d.datname=pg_catalog.current_database()),
 'migration_versions',(SELECT pg_catalog.jsonb_agg(version ORDER BY version) FROM naijue_erp.schema_migration),
 'schema',(SELECT pg_catalog.jsonb_build_object('name',nspname,'owner',pg_catalog.pg_get_userbyid(nspowner),'acl',coalesce(nspacl,pg_catalog.acldefault('n',nspowner))::text) FROM ns),
 'relations',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',relname,'kind',relkind,'owner',pg_catalog.pg_get_userbyid(relowner),
   'acl',coalesce(relacl,pg_catalog.acldefault(CASE WHEN relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,relowner))::text,
   'row_security',relrowsecurity,'force_row_security',relforcerowsecurity,'persistence',relpersistence) ORDER BY relname),'[]'::jsonb) FROM rels),
 'columns',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('table',r.relname,'number',a.attnum,'name',a.attname,
   'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
   'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl::text) ORDER BY r.relname,a.attnum),'[]'::jsonb)
   FROM rels r JOIN pg_catalog.pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
   LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=r.oid AND d.adnum=a.attnum),
 'routines',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',proname,'identity_arguments',args,'signature',oid::regprocedure::text,
   'owner',pg_catalog.pg_get_userbyid(proowner),'language',lanname,'volatility',provolatile,'security_definer',prosecdef,
   'strict',proisstrict,'leakproof',proleakproof,'parallel',proparallel,'config',proconfig,
   'acl',coalesce(proacl,pg_catalog.acldefault('f',proowner))::text,'source',prosrc,'body_md5',pg_catalog.md5(prosrc),
   'body_sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(prosrc,'UTF8')),'hex'),
   'definition_sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(oid),'UTF8')),'hex')) ORDER BY proname,args),'[]'::jsonb) FROM fns),
 'triggers',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('table',r.relname,'name',t.tgname,'routine',t.tgfoid::regprocedure::text,
   'type',t.tgtype,'enabled',t.tgenabled,'deferrable',t.tgdeferrable,'initially_deferred',t.tginitdeferred,
   'internal',t.tgisinternal,'definition',pg_catalog.pg_get_triggerdef(t.oid,true)) ORDER BY r.relname,t.tgname),'[]'::jsonb)
   FROM rels r JOIN pg_catalog.pg_trigger t ON t.tgrelid=r.oid),
 'constraints',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('table',r.relname,'name',c.conname,'type',c.contype,
   'validated',c.convalidated,'deferrable',c.condeferrable,'initially_deferred',c.condeferred,
   'reference',CASE WHEN c.confrelid=0 THEN NULL ELSE c.confrelid::regclass::text END,
   'update_action',c.confupdtype,'delete_action',c.confdeltype,'definition',pg_catalog.pg_get_constraintdef(c.oid,true)) ORDER BY r.relname,c.conname),'[]'::jsonb)
   FROM rels r JOIN pg_catalog.pg_constraint c ON c.conrelid=r.oid),
 'indexes',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('table',r.relname,'name',x.relname,'valid',i.indisvalid,'ready',i.indisready,
   'unique',i.indisunique,'primary',i.indisprimary,'immediate',i.indimmediate,'definition',pg_catalog.pg_get_indexdef(i.indexrelid),
   'predicate',pg_catalog.pg_get_expr(i.indpred,i.indrelid)) ORDER BY r.relname,x.relname),'[]'::jsonb)
   FROM rels r JOIN pg_catalog.pg_index i ON i.indrelid=r.oid JOIN pg_catalog.pg_class x ON x.oid=i.indexrelid),
 'policies',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('table',r.relname,'name',p.polname,'command',p.polcmd,
   'permissive',p.polpermissive,'roles',p.polroles,'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid),'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY r.relname,p.polname),'[]'::jsonb)
   FROM rels r JOIN pg_catalog.pg_policy p ON p.polrelid=r.oid),
 'roles',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',rolname,'superuser',rolsuper,'inherit',rolinherit,'create_role',rolcreaterole,
   'create_db',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypass_rls',rolbypassrls) ORDER BY rolname),'[]'::jsonb)
   FROM pg_catalog.pg_roles WHERE oid IN(SELECT oid FROM acl_roles UNION SELECT roleid FROM members UNION SELECT member FROM members)),
 'memberships',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role',pg_catalog.pg_get_userbyid(roleid),'member',pg_catalog.pg_get_userbyid(member),
   'grantor',pg_catalog.pg_get_userbyid(grantor),'admin',admin_option,'inherit',inherit_option,'set',set_option)
   ORDER BY pg_catalog.pg_get_userbyid(roleid),pg_catalog.pg_get_userbyid(member)),'[]'::jsonb) FROM members)
) AS manifest
)
SELECT manifest->'identity' AS identity,manifest->'migration_versions' AS migration_versions,
 pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to((manifest-'identity')::text,'UTF8')),'hex') AS catalog_sha256,
 (pg_catalog.jsonb_array_length(manifest->'routines')=122
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=to_regclass('naijue_erp.audit_change')
    AND t.tgname='document_specification_commit' AND t.tgfoid=to_regprocedure('naijue_erp.validate_document_specification_commit()')
    AND t.tgenabled='O' AND t.tgtype=5 AND t.tgdeferrable AND t.tginitdeferred AND NOT t.tgisinternal)
  AND NOT EXISTS(
   SELECT 1 FROM (VALUES
    ('assert_history_typed_closure','b0551d6a80e9fdd9709d6ed63820dc8b5a7577e8bfb9deaa19cb0e387de54bce'),
    ('assert_native_bootstrap_accounts','69b87a72c52a81aba7f9fd380f3acbcb8df8fbcaa6ca72ccca4ac20e26ab42c7'),
    ('assert_native_product_season_source','3a753b412fa4a648e26c4a2e398a4b52cc694c04dc1352a98513cb2220d4d661'),
    ('assert_retained_sku_reference','4c956a82b9531b1f385f9aecd9c6d20fa84ce6d434bb0a41d2a0c96ebb7fae5d'),
    ('assign_runtime_document_number','bca336abcd0ef4a57c22d2ee19564e7ea744257303fb8eec06c822efd551500e'),
    ('check_hall_default_customer_enabled','6a89df4342530f3a3bdd185abbdd372b3372799b341a17ae9ad65be86ded91ee'),
    ('cutoff_import_lock','82a621b9cea39c9cc273d5cb790b364fad004875760644633280d2e24e64ccc7'),
    ('exact_historical_customer_source_matches','ac26aa52f4131d996d6abe0db810a0e0817a12ffa043cdfb2250c951bfd0f011'),
    ('freeze_cutoff_sales_detail','dcfa1a3abb87368cf2f18663880f9a2ea9377a3599e985e13c7241220fd85a12'),
    ('freeze_imported_identity','0a17cf0a670ca8c9d34f2de1ec34de9b5197410fc01f82af4273a26e877a44e5'),
    ('guard_balance_identity','02f2db383ff8c5826c7148f73bb780319c977bffa5798bc233159d83d89e58fc'),
    ('guard_contributor_link','2937ecd3e974e2ad78e0bfce4790b96d97953d4bf113406a838063b366895983'),
    ('guard_cutoff_ledger','71ecb569279de61709578ffe2f29d85140993ed155fce07e7beb797307c491b5'),
    ('guard_exact_historical_customer_current_usage','78e895d72d6f806089d2bc7cb877293e1263d26ba8265dd7f3b5e2203e956245'),
    ('guard_header_native_reference','1584d2600c763f0d38cd3dd4fa7dd14ea90465ef9376d7165a58d71bce0dec3c'),
    ('guard_header_native_reference_publication','3419f73d296fcb84f77eff79edaa5034cb90f33a6363d0687d316ee697f785c0'),
    ('guard_history_closure_stage','d05947c6d7ef430d043c10038cce1d72f7e44e4efb2a2112c499ea8d107d47e0'),
    ('guard_history_insert','bbd40680f3196904c9c9e986c6f8cef0bee77c4cbb19663b8333e8b6150e1f2f'),
    ('guard_history_publication','297d9859c6efad3e48e9c8931ab11a810c6b1c73c16ddf262b34ffbc5d11001e'),
    ('guard_history_typed_publication','fc386026e40ca43d36bdb5e7422001878a7f91c95c2e36bce28272b4d792e506'),
    ('guard_import_accounting_claim','d592577abd111a82d3edcb44a7d83ece90159a19f4e396740662db59c6706956'),
    ('guard_import_accounting_publication','b41ad04a99fb7af999c22b13cdc7ad9b747e4df67e3f11bd44e7632d15a747a6'),
    ('guard_import_batch','0275164994ce931e93d334b753f0f616d039661a73239ac5dbd4482f0720e749'),
    ('guard_import_record','8a79dbc011cdaf0582e2bd1eefc7ea94fce15d24f6aa1ac0fa25c43afb4e7e16'),
    ('guard_maintenance_account_event','965d9d3433b929ccd151b9a147eeef713770d7b7311e49c80cfaa3d17b118549'),
    ('guard_maintenance_audit_actor','ac0ce9c91f34b9d8d34eb5e7d26f595319bfa6ad3dfe3ae33a4f2f5edf1eb217'),
    ('guard_maintenance_before_root','574add1ad436482c7593725ac4b1b58cabe6b982b538cf0e1f22c1783723712f'),
    ('guard_maintenance_child_write','a19def51718e008e541482dd1e6f2d2ab9257842ce7e66ad6e62aedcfa216d8a'),
    ('guard_native_catalogue_binding','7418579c0d1c3a1951696a12ad165a421d26b87f0e449d9d7d250497dc2ddc21'),
    ('guard_native_catalogue_publication','d2eaa009760d63f245d562570ca4c8fce038633da5233a8c7ab7142190a30ceb'),
    ('guard_native_creation_identity','4827b76ff4df9beae18411033d2e6e13a04eea2d648aa58bb67d179145d107dc'),
    ('guard_native_party_import_intent','262e74a37ba12883a4978c4d99b6ecca000d245186b585a9e5b35ad31ccf8d7f'),
    ('guard_native_payment_binding','774cc9b1604a8d0948f73c7298fa67a10233962af218b89fe0b9675107148d35'),
    ('guard_native_payment_publication','993b114dfbec87428a42a9f6aa7d0a6ecbeef67fd85bc00754fa4eb80c7e6797'),
    ('guard_product_image_color','a49cc6bc4c49931eb50c81dd95e08a760b2ea6de73e19a0496611fe63fe22b18'),
    ('guard_product_season_selection','bd97ac1bc0a8c9a3221c12b794f5976bf0e092a2907aa2dd9e6378b718d29560'),
    ('guard_referenced_season_identity','8eb0b3435f063f4a653c31f632fe6751fecc3864a375a72753bcf4090bb18f2c'),
    ('guard_retained_catalogue_delete','dec785b8b1f818b2daa3af4d3872139710cae32178516839e669f59aa6609758'),
    ('guard_retained_catalogue_reference','91cc169d60ca6db2700ed97e49632504cfba9d957ea467a4777137f946c6923c'),
    ('guard_runtime_document_number','52d92723d9ecb5f16eb57c5ae50e0f8cf322b4b5f3848ab88712f41aeb0887bd'),
    ('guard_successor_publication26','a055abd422ff4d81d0cf87e11cf659dcc221eda1a18b774cd62034c2c3f74c14'),
    ('guard_successor_source26','cdf91a3949d6aefbb16c67f7d82dcf99b60730f9a6884468c064102c9887b710'),
    ('history_closure_count_map','ef82c0a7124d288103df38503a849b96aa936289b2ee29166b4f0a6529f476d6'),
    ('history_closure_digest','749101b8670e32814b875adaaf753da6c50ddcd0860d5ca3ebb000f996f1b63b'),
    ('history_closure_document_rows','f8401b06df7815f63f9a83e781961f55725f82246c87d86b7a99a9c19c482ce1'),
    ('history_closure_encode','b4ad51b2b17c9248c80de0ead3ae5f50bf5fe887e36597b081ce250a94623a5c'),
    ('history_closure_finish','94b84af2d05d8a9f34c0135a8c0d70f5b633a9b43e6ec6d2bca8de554e8abac8'),
    ('history_closure_fold','31ed823c127e85537196de072b76077749d939f3241fa53b9f1c76f8fdba9062'),
    ('history_closure_projection','0af6d70c56a463c351be1dd732d345bbb533ae98b0b07e36f6ef08a4efd72011'),
    ('history_closure_projection_columns','a8a3d4d43341d86dfad188d191c3076203e06ea8f1a6919c4d0efddee76286a6'),
    ('history_closure_projection_key','6e2584dac9f079fe2061570c15b13549a3abac512a2a809835046e6fe2c50222'),
    ('history_closure_row_hash','c7ef0fdc273f23ab5ec1ae6c870746146dab90a6ecef8ecf319de0704df697bb'),
    ('history_closure_rows','098ba7215c7c893903e2b72762e2036e94bc23b763f3842e378b3d55b3d3f639'),
    ('history_closure_seed','532918606a4dd24ebae46a55dfe7d2f0803602798c63742bcd975b7e1179f2c7'),
    ('history_effective_writes_closed','1110bb0854c27ad0ae2178742e7414bf49aa5509c57bbecf4a595f9f2ed19b97'),
    ('history_revision_not_enabled','af9df40d3b0ea2128a2f879f0e6092c13ba8447ae28383742020aa9fc0bfba70'),
    ('import_source_key_lock','07404b25633a5c48ae1a530a48cdebed11107e187d660c99a7e781bb4957fa24'),
    ('inventory_key_admission','a9d7a2519941605e997e5ab59cff7cf847192ed910ef4107ba09aadc64e0fc7a'),
    ('inventory_key_lock','c6f444fbbfc527fec7f4031fd0ea7f07eb0a98202b11340e8f7da398fa117079'),
    ('inventory_runtime_key_admitted','945a2cc1e250ed1cedd3ca2083b80120174d06d015455bd4288d186e0c27f377'),
    ('is_exact_historical_customer_only','1f35799a742f402d86cde6a979511dc83ae74d62cd5c106ffcef162a68510403'),
    ('is_native_party_import_insert','a3c8dfac77e8a4f060932aded92f53da97b68bdcf48d2ede19781c3e54c86412'),
    ('keep_barcode_binding_identity','14f6d02bca58955681e8d03236fb236cbfe3d041d35ecdb326cd3fa7e38d2733'),
    ('keep_party_native_identity','44c3a7110bf40ef38e73972b493f36279b28124097b31a9a6f25e5adc13ad4b9'),
    ('keep_sales_line_owner','95f3dc678bbdc8ac47a2f1c76fe13f872bed088e7484aebc46a523fc13cfd241'),
    ('keep_transfer_header_provenance','92fe79370e044f341cf8290a6d723a588ce53f7591077ceb45f1c9a201ad08c9'),
    ('keep_transfer_line_owner','763d52e081f96f872adb50658403f5f2f7f83f7c914d002b0e771ebe9c055335'),
    ('maintenance_account_credential_action','f17617bc8f02fd0731d0a97eaca90553441235e032de1dbf9086e84c987fbe7a'),
    ('maintenance_action_allowed','186f88822ba597874734cb3349d0b9d95f63e5f8d8a34d3d05014e3420033c17'),
    ('maintenance_administrator_mutex','d6809b2abf7b3f211cd7422b517e867d0c1378f9e7fe9b98eacde2521c6d1ea8'),
    ('maintenance_audit_is_current','4537d6df2b73e17e386b100845049da08d3fab3584c87ef8d7095660198bf699'),
    ('maintenance_check_account_credential','577bf0a5de72c8dc6d080c1b4f18a669398d5738c16b75d11ecc1c89d0156ab7'),
    ('maintenance_check_product_children','c7edab87301fc05b7f33db2eb9df30b2da0d28ed9154dfa8d11cbba9fdbe6dad'),
    ('maintenance_check_staff_accounts','ea4e151ccb89d97ed40edc6e3164594bccda0fc28f2879f614f230830fdc0c22'),
    ('maintenance_complete_row_matches','34c25d78bc34ed57b1acbbdbfbca9b0adfd78dc8dcb6cc8c42cf5673f5da5d21'),
    ('maintenance_evidence_matches','cb201d859235d7af9ef52616c64b705e5586b11894d57fbc50b2b0a7615abaf3'),
    ('maintenance_exact_rows_match','8b21824423a27f20074768c09998fba819887c949b4f20b57e35db0815133161'),
    ('maintenance_payment_halls','d96c975c57af714d458275a383e0e2bdaeef9214d4bc64420207f36bcea55869'),
    ('maintenance_product_child_row','69145227348d366932814f079f0b63d1bb6109cc36d8bb8c9f8ae53fafd1b9fa'),
    ('maintenance_root_table','7ed286cf1e5bb8629b02e7cab4412dc0df502d560661be9823d234c466565fe3'),
    ('maintenance_staff_accounts','a191dc7b42cec0f41f42c6d371a2e959c90019983f4f79cef86db99d2e8fa989'),
    ('native_creation_operation_valid','118bbe55c39e00948ab087f808812522b565344b924e64916f6cfa91645a3f7a'),
    ('party_key_values','d23eb5601f984007df5d52661a101a422852e20c0bcd75f1cadd5a5bbbaef649'),
    ('published_inventory_key','fa8234711ad74b3afd250b2143840baa863f05f1e23c92b85574b48b4208adc6'),
    ('reject_immutable_change','3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c'),
    ('reject_unimplemented_cutoff_write','ac0a450bbd02ec19764b8ed3be32acde2177e394c4f9488230d39ff7c3a41509'),
    ('safe_maintenance_evidence','4a0d9d21eadf3e839d1d0c23f7efe8a0ef14123dd521a553eefcc7362ab3f927'),
    ('transfer_header_audit_values','2bd919b807e2bd27e2ef2c3c2520524c84f8ddbd81e9dfc71947c9292ea1f624'),
    ('transfer_line_audit_values','ce924832c6a9b4a762ff80e031279273f521e4e17139c7d89a4930004313f49e'),
    ('valid_history_counts','6c143e2bf81bcd53e2c9074aa2ab4e1781c746bc7a99bb0064f378f77de80280'),
    ('valid_product_season_ids','b6b3932264857c59998025cece6241a4e819b80f9bc72e6bf0ed4e907890cc65'),
    ('validate_available_administrator_commit','3a9a1bea930614761185af90b8591a539b855647974b68b004869c80f5e5ba18'),
    ('validate_baseline_source_commit','ec5e9a331d0f8148ec21e28d5e8a4ddb82ac66d923ea2490abee3f3000ed75c9'),
    ('validate_exact_historical_customer_intent','b9968150e138d455658dd7d437c8026b7bfdce466146b961d64fd2934f099c98'),
    ('validate_document_specification_commit','b02bff6115bcf2c87758f8313a57a1a693733ba3ea192fcb1657bd176c587c06'),
    ('validate_exact_native_reversal','3ef72272c6cb9b7ccbfffc393a31fdd85babdb3efb333baae839482d571f362e'),
    ('validate_history_closure_commit','e61d2c5dd34792f5ca277cada1dc12a6904b1be95031c0a6c4810080b24dd03b'),
    ('validate_history_product_proofs','dab49bb495de85d5e66350affd348f85e0595411ea7ab7378104a3963db2a38e'),
    ('validate_import_accounting_baseline_commit','678cc0b409e43e420365733b21ce8e8ce0aa88b8d3b9b48f9a842edd41120c51'),
    ('validate_import_accounting_checkpoint_commit','2da056af8fcd97e2fc046d5f6b93b668a4bd523f49e0d0d5a1073bad1b933df7'),
    ('validate_import_accounting_claim_commit','03a517d099491d51f97e50b8bbf9e5729c1fd9f67a68a9445328379391f1fdf7'),
    ('validate_import_accounting_final_record_commit','f1fca00daa56873221062706d2009293b6180156e69bfe6f5fc1ca64087ea312'),
    ('validate_import_batch_commit','1e645ed10e00b6a56ed3820fce160f54a33aa547c815c6fff5a988ef7f7fc9f2'),
    ('validate_import_operation','0bc6c348d7299fd7ce6ad1e2f98a3057b60eddce3de01e920314c0a1e3dd1e36'),
    ('validate_import_publish','873d1943b1ada13eeef43f6d28cb792755de48c461b1ebee7810e5278cd5d6e3'),
    ('validate_import_source_commit','524ec70d51970cfc79f4ec5e9a93f21bf20733781a2202121a4e91d1d6b66f3a'),
    ('validate_ledger_receipt_source','26f2f325172ef2878d4dffb4f1740d680e63458abd4b25e7a693e352664d15da'),
    ('validate_maintenance_receipt_commit','7a42aeef2738c9009bc9eaa4ecbf41feefb43b759fbed2514a005166d20ac384'),
    ('validate_maintenance_root_commit','8556d1ed234adb3bae1d99c9bb8e867db4070eadafa39dbb8b31752c7e24b512'),
    ('validate_native_creation_commit','a505ceb68946cc14a69b181cd43d6cebbedca9e9ea453c9920c243892f537cd7'),
    ('validate_native_party_import_commit','5383c9941e06c7748af6603eee56559b102b09305c11771a813c6cf859ad37e3'),
    ('validate_party_native_commit','dba217f39c61d3f4741a72a565851a41caaa18e44fb57aa2f8e3473d20810762'),
    ('validate_party_receipt_commit','fafc3389b3458b6d8ec4cad15f6f926dcc20bb059a819c496ed4db260d06b426'),
    ('validate_sales_commit','f00b31849f4f72d62103fc08cb4e157b4401717a1f2c7c05fc699663715f07a2'),
    ('validate_sales_effect','e6b2bbec00a6389ed92f9026af20f06c52168d37fe5a59d3ccfc0c29fb7cb1db'),
    ('validate_sales_settlement','d862252df7c25f0a57db82754bba56a812e3c88b8cd6150f5a198212fd47a591'),
    ('validate_sparse_balance_commit','84c96a25df3dc2442445d6bbf71444a62d231e30cf83cb635968cc8f6a0cdd09'),
    ('validate_transfer_balance_commit','9bfaa1cdf1dea76ada35bae56dd40cb3e27c6acd28a93905ee2f06d17a8b2abb'),
    ('validate_transfer_commit','e6ceac3fddef4e61f649b8ef2d71db56042dc14c7622ca0a5c321de2ab7b3f38'),
    ('validate_transfer_effect','d901f8e428c9ef2440d9fb48aca3f638eef141bd62f116e88698c6f726ad0c73'),
    ('validate_transfer_header_commit','6d50fa80e2b445bc45645ff0f5592f2ed4e00836077224c1fe3510b4e563fa0c'),
    ('validate_transfer_line_commit','1443f443a884f0073209294476daf9a7ff0f45d6d32832e5d14557d513cfc4fb')
   ) required(name,body_sha256) WHERE NOT EXISTS(
     SELECT 1 FROM pg_catalog.jsonb_array_elements(manifest->'routines') actual
     WHERE actual->>'name'=required.name AND actual->>'body_sha256'=required.body_sha256
   ))) AS source_routines_match
FROM observed`;

/** Same original catalog query with only the approved v14 routine bodies and one private helper. */
export const NATIVE_RUNTIME26_V14_METADATA_PROBE = NATIVE_RUNTIME26_METADATA_PROBE
  .replace("jsonb_array_length(manifest->'routines')=122", "jsonb_array_length(manifest->'routines')=123")
  .replace("SELECT 1 FROM (VALUES", "SELECT 1 FROM (VALUES\n    ('assert_core_initialization_v14','5ca42bcac20e7ad3affb3ac09829fd27c481752a303b1090133f23ecee3ad99d'),")
  .replace("('assert_native_bootstrap_accounts','69b87a72c52a81aba7f9fd380f3acbcb8df8fbcaa6ca72ccca4ac20e26ab42c7')", "('assert_native_bootstrap_accounts','171c59ba962a287dd02bb9eac993512e114783a470063108a07ba5e206cbabca')")
  .replace("('guard_import_batch','0275164994ce931e93d334b753f0f616d039661a73239ac5dbd4482f0720e749')", "('guard_import_batch','f0e35d2d5978c92d26c1eab6525a87d2ae3450a525daa14131b479b03856d29a')")
  .replace("('guard_history_publication','297d9859c6efad3e48e9c8931ab11a810c6b1c73c16ddf262b34ffbc5d11001e')", "('guard_history_publication','6ad32797b7fe81e6427b3abec90aca378778be9af30b014b55966fbed0bff77e')")
  .replace("('validate_import_batch_commit','1e645ed10e00b6a56ed3820fce160f54a33aa547c815c6fff5a988ef7f7fc9f2')", "('validate_import_batch_commit','dc2e8d344085056b53469be394eb9ced344db510bf6f6dc5576f4b0a9ea20140')")
  .replace("('validate_import_accounting_checkpoint_commit','2da056af8fcd97e2fc046d5f6b93b668a4bd523f49e0d0d5a1073bad1b933df7')", "('validate_import_accounting_checkpoint_commit','edef6846035f1780c632183b32f81b63919cae4703a78c4bc21c44c507441f47')")
  .replace("('validate_import_operation','0bc6c348d7299fd7ce6ad1e2f98a3057b60eddce3de01e920314c0a1e3dd1e36')", "('validate_import_operation','6ffc2561abe1bd4ff7465c82143c155bcaa0ad311b90f6679bef10ceae30c62f')")
  .replace("('guard_import_accounting_claim','d592577abd111a82d3edcb44a7d83ece90159a19f4e396740662db59c6706956')", "('guard_import_accounting_claim','298996ca170c969aa06df8dfa44219b86a9db0ae4dc1c07f726167a518f62acf')")
  .replace("('validate_import_accounting_claim_commit','03a517d099491d51f97e50b8bbf9e5729c1fd9f67a68a9445328379391f1fdf7')", "('validate_import_accounting_claim_commit','ad8e19c3f36b85ebbda107a2ca8e3c00ad10ca3005a232bd033bbab7613be756')")
  .replace("('assert_history_typed_closure','b0551d6a80e9fdd9709d6ed63820dc8b5a7577e8bfb9deaa19cb0e387de54bce')", "('assert_history_typed_closure','8556e917e6a251dd1eb97974fbb6f793d3e46a1ef10f6ef7fd77fb7ad539d00f')");

/** Exact v14 successor, with only three replaced routines and one private helper.
 * The v11/v14 probes and their consumers remain unchanged. */
export const NATIVE_RUNTIME26_V15_METADATA_PROBE = [
  ["jsonb_array_length(manifest->'routines')=123", "jsonb_array_length(manifest->'routines')=124"],
  ["SELECT 1 FROM (VALUES", "SELECT 1 FROM (VALUES\n    ('maintenance_check_category_order','77c86d2788e88f2922a66c662a91b95c0f76d6ea00587148c36421feabde281e'),"],
  ["('maintenance_action_allowed','186f88822ba597874734cb3349d0b9d95f63e5f8d8a34d3d05014e3420033c17')", "('maintenance_action_allowed','50b2fa0fbf733d7c98b40aa612107a20262cb063852cb3f2cabbefc750742c4a')"],
  ["('validate_maintenance_receipt_commit','7a42aeef2738c9009bc9eaa4ecbf41feefb43b759fbed2514a005166d20ac384')", "('validate_maintenance_receipt_commit','77679e1e21858ae64ac1225660cf7a692f63b097d538254829def8164ea33ac5')"],
  ["('validate_maintenance_root_commit','8556d1ed234adb3bae1d99c9bb8e867db4070eadafa39dbb8b31752c7e24b512')", "('validate_maintenance_root_commit','002818dfd8d764e99221bb0548da1141054871ae674aba6bb9f6ce59c9d92d1c')"],
].reduce((probe, [before, after]) => replaceOne(probe, before!, after!), NATIVE_RUNTIME26_V14_METADATA_PROBE);

/** Approved v16 successor: exact history/responsible bodies on either existing
 * base. The old v11/v14/v15 manifests remain unchanged. */
function historyResponsibleProbe(base: string, oldCount: number): string {
  let probe = replaceOne(base, `jsonb_array_length(manifest->'routines')=${oldCount}`,
    `jsonb_array_length(manifest->'routines')=${oldCount + 6}`);
  for (const [before, after] of [
  [
    "SELECT 1 FROM (VALUES",
    "SELECT 1 FROM (VALUES\n    ('history_numeric_current_facts','dadecb6cce657834ce3719eb339f56f95dbbf27d6e0a92216940ed91697cadc8'),"
  ],
  [
    "SELECT 1 FROM (VALUES",
    "SELECT 1 FROM (VALUES\n    ('history_numeric_money','8c588f3b6145cb1609898dd46e3abfb7b1bd37b3b9318f1863dcfac530ee200b'),"
  ],
  [
    "('history_revision_not_enabled','af9df40d3b0ea2128a2f879f0e6092c13ba8447ae28383742020aa9fc0bfba70')",
    "('history_revision_not_enabled','1e69497d7023ab61fdac15e358707c9b9b73b7f3b281a01c306c2fd25d3c985c')"
  ],
  [
    "('history_effective_writes_closed','1110bb0854c27ad0ae2178742e7414bf49aa5509c57bbecf4a595f9f2ed19b97')",
    "('history_effective_writes_closed','c06027597f11a9cf7f2ae06bf5e47e5c21349b54851fb21df6895ef22a2855b7')"
  ],
  [
    "SELECT 1 FROM (VALUES",
    "SELECT 1 FROM (VALUES\n    ('guard_history_numeric_ledger','b32ccd2af06876d91fe4b33a4e2309a3f79af7d012ddf301ce84b773118e5794'),"
  ],
  [
    "SELECT 1 FROM (VALUES",
    "SELECT 1 FROM (VALUES\n    ('validate_history_numeric_revision_commit','6cc941ed8ea63927fea7f372da6477c5def8e809a8dde1c348d07331ff9be0b6'),"
  ],
  [
    "SELECT 1 FROM (VALUES",
    "SELECT 1 FROM (VALUES\n    ('validate_history_numeric_receipt_commit','e69f92651dc7a8313e354d47bd4f1ffc1c97fb30aa5c56dcfc49f69511a1d7d6'),"
  ],
  [
    "SELECT 1 FROM (VALUES",
    "SELECT 1 FROM (VALUES\n    ('validate_history_numeric_balance_commit','fab0bf7a3f1681d6034b09dbb5c7ad8efa606c6fa82f24fc101bc5b70636a837'),"
  ],
  [
    "('validate_sparse_balance_commit','84c96a25df3dc2442445d6bbf71444a62d231e30cf83cb635968cc8f6a0cdd09')",
    "('validate_sparse_balance_commit','937b31d7ab0f1e5d8fb7febc26c051690b2df9dc79d451088eff73d75046399d')"
  ],
  [
    "('reject_unimplemented_cutoff_write','ac0a450bbd02ec19764b8ed3be32acde2177e394c4f9488230d39ff7c3a41509')",
    "('reject_unimplemented_cutoff_write','2e108a1bd9e9304f63cde9eb8b726c448ebcb2d2b371f8b3a8a41aebb6d21e0a')"
  ],
  [
    "('validate_sales_settlement','d862252df7c25f0a57db82754bba56a812e3c88b8cd6150f5a198212fd47a591')",
    "('validate_sales_settlement','c0ab9b6a91951a809e5fbfb6c34ed52fb164b76119d58d469d411c0b58e734a3')"
  ],
  [
    "('keep_transfer_header_provenance','92fe79370e044f341cf8290a6d723a588ce53f7591077ceb45f1c9a201ad08c9')",
    "('keep_transfer_header_provenance','68d1af54e61704be47e9fe4097592e812d3f7a910dc2d7190351c2b427267bf6')"
  ],
  [
    "('transfer_header_audit_values','2bd919b807e2bd27e2ef2c3c2520524c84f8ddbd81e9dfc71947c9292ea1f624')",
    "('transfer_header_audit_values','0c92b020490243f55132a5acb15ecee8caca92fb88db5f75e877e2f2430ec8ad')"
  ]
] as const) probe = replaceOne(probe, before, after);
  return probe;
}
export const NATIVE_RUNTIME26_V16_FROM_V14_METADATA_PROBE = historyResponsibleProbe(NATIVE_RUNTIME26_V14_METADATA_PROBE, 123);
export const NATIVE_RUNTIME26_V16_FROM_V15_METADATA_PROBE = historyResponsibleProbe(NATIVE_RUNTIME26_V15_METADATA_PROBE, 124);

/** Exact B07 v16-from-v14 successor; only the three SRF aliases in the
 * existing projection trigger change. Older profiles retain their own bodies. */
export const NATIVE_RUNTIME26_V21_EFFECTIVE_VALUE_FROM_V16_V14_METADATA_PROBE = replaceOne(NATIVE_RUNTIME26_V16_FROM_V14_METADATA_PROBE,
  "('history_effective_writes_closed','c06027597f11a9cf7f2ae06bf5e47e5c21349b54851fb21df6895ef22a2855b7')",
  "('history_effective_writes_closed','4fbbebd6b335359b80c7df38efc99a30cb666902158c3e1f911e3c869ebac363')");

/** Metadata approval only. Whole-source, batch, actor, receipt, conservation and
 * publication authorizers remain separate mandatory ports at their callers. */
/** Approved v19 exact successor only; all prior probes remain byte-for-byte derivations. */
export const NATIVE_RUNTIME26_V19_METADATA_PROBE = [
  ["jsonb_array_length(manifest->'routines')=130", "jsonb_array_length(manifest->'routines')=131"],
  ["('validate_import_batch_commit','dc2e8d344085056b53469be394eb9ced344db510bf6f6dc5576f4b0a9ea20140')", "('validate_import_batch_commit','7ce01945fcd6fd68817724cc27d8f135da82ef2f4e3929a8ad5e4cf232310b3b')"],
  ["('validate_import_accounting_checkpoint_commit','edef6846035f1780c632183b32f81b63919cae4703a78c4bc21c44c507441f47')", "('validate_import_accounting_checkpoint_commit','06ac9742cb16adb281f7610d299ef9dedb61c125038f12be55275760d4a4c0c9')"],
  ["('validate_import_operation','6ffc2561abe1bd4ff7465c82143c155bcaa0ad311b90f6679bef10ceae30c62f')", "('validate_import_operation','73d13792e2a9dde79b239cb2c059a89c5552823503a002ce1b7bdad75aa1b3ff')"],
  ["SELECT 1 FROM (VALUES", "SELECT 1 FROM (VALUES\n    ('assert_barcode_scheme_initialization_v19','8d4f7d457403d6c4737e5a9b38d6d4f48c0ef3c5e94dd2e8ff408d3b57a198ca'),"],
].reduce((probe, [before, after]) => replaceOne(probe, before!, after!), NATIVE_RUNTIME26_V16_FROM_V15_METADATA_PROBE);

/** Exact v20 retains v19 schema, actions and routines; only the original duplicate-query body changes. */
export const NATIVE_RUNTIME26_V20_METADATA_PROBE = replaceOne(NATIVE_RUNTIME26_V19_METADATA_PROBE,
  "('guard_history_insert','bbd40680f3196904c9c9e986c6f8cef0bee77c4cbb19663b8333e8b6150e1f2f')",
  "('guard_history_insert','98fcf82074f4aaf0712b2af3aca5a12a7e4975933712caffd577e652eca7e12f')");

/** Exact v22 staged-prefix first binding successor, one original function body only. */
export const NATIVE_RUNTIME26_V22_METADATA_PROBE = replaceOne(NATIVE_RUNTIME26_V20_METADATA_PROBE,
  "('assert_core_initialization_v14','5ca42bcac20e7ad3affb3ac09829fd27c481752a303b1090133f23ecee3ad99d')",
  "('assert_core_initialization_v14','8a8374fb193ed9e5ddcc388b0141a91dc17420cef0baee4ffbb700cd9737add5')");

/** HV2-B07 on the full v22 branch: exactly the nullable responsible guard changes.
 * Admission still requires a fresh complete catalog and independent review. */
export const NATIVE_RUNTIME26_HV2_RESPONSIBLE_NULL_FROM_V22_METADATA_PROBE = replaceOne(NATIVE_RUNTIME26_V22_METADATA_PROBE,
  "('history_revision_not_enabled','1e69497d7023ab61fdac15e358707c9b9b73b7f3b281a01c306c2fd25d3c985c')",
  "('history_revision_not_enabled','581a44ad13d184d594731b7c9ded219a3933fdb8a6c58f2ed63463fdc795ac4f')");

/** Approved B14 then P04 successors on the full v22/B07 branch.
 * Each profile pins the entire routine set; existing profiles stay unchanged. */
export const NATIVE_RUNTIME26_HV2_CATEGORY_FROM_V22_METADATA_PROBE = [
  ["jsonb_array_length(manifest->'routines')=131", "jsonb_array_length(manifest->'routines')=133"],
  ["SELECT 1 FROM (VALUES", "SELECT 1 FROM (VALUES\n    ('lock_category_tree_statement','fe2f9bd7ed49d52697cb8a5aab6100bc61f2246c0f8ad02f945a7dbbd4a54834'),('validate_category_final_component','f6eba82eceeaf19ad781500cebcfc5b515f38bf11ed428d41897e909b821a07d'),"],
].reduce((probe, [before, after]) => replaceOne(probe, before!, after!), NATIVE_RUNTIME26_HV2_RESPONSIBLE_NULL_FROM_V22_METADATA_PROBE);
export const NATIVE_RUNTIME26_HV2_HISTORY_SET_FROM_V22_METADATA_PROBE = [
  ["jsonb_array_length(manifest->'routines')=133", "jsonb_array_length(manifest->'routines')=135"],
  ["('history_revision_not_enabled','581a44ad13d184d594731b7c9ded219a3933fdb8a6c58f2ed63463fdc795ac4f')", "('history_revision_not_enabled','917601e4a32df8b38047094d05a581883e040876ee091c7de0f5ffe8999a5d16')"],
  ["('history_effective_writes_closed','c06027597f11a9cf7f2ae06bf5e47e5c21349b54851fb21df6895ef22a2855b7')", "('history_effective_writes_closed','5cfe1d51d7cfa4f30c5fe758ed3b203ec714fa4fc99185a901454d705ea3ba54')"],
  ["('guard_history_numeric_ledger','b32ccd2af06876d91fe4b33a4e2309a3f79af7d012ddf301ce84b773118e5794')", "('guard_history_numeric_ledger','014f98557c5fc57e5e6f0ba3d21483be5e7eb3e3adbc86c9162dcd120df40797')"],
  ["SELECT 1 FROM (VALUES", "SELECT 1 FROM (VALUES\n    ('history_effective_set_guard','a2fc6d48df9560e281a7b7a8604624d7b3219623b9dedc55a53284ad9951a900'),('history_numeric_ledger_set_guard','83d5ef1ec17d817433ac8b19b3921eba86208f2979a41581a198813bc88ddef3'),"],
].reduce((probe, [before, after]) => replaceOne(probe, before!, after!), NATIVE_RUNTIME26_HV2_CATEGORY_FROM_V22_METADATA_PROBE);

// V1 intentionally remains immutable. This finite V2 observation adds the one
// approved system-column ACL, which the positive-attnum column export omits.
function sourceXminCatalogProbe(probe: string): string {
  const versioned = replaceOne(probe, "'format','EXACT26_RUNTIME_CATALOG_EXPORT_V1'", "'format','EXACT26_RUNTIME_CATALOG_EXPORT_V2'");
  const exported = replaceOne(versioned, " 'routines',(SELECT", ` 'system_column_acls',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'schema','naijue_erp','table',r.relname,'owner',pg_catalog.pg_get_userbyid(r.relowner),
   'number',a.attnum,'name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'acl',a.attacl::text,
   'runtime_select',pg_catalog.has_column_privilege(current_user,r.oid,a.attnum,'SELECT'),
   'table_select',pg_catalog.has_table_privilege(current_user,r.oid,'SELECT'),
   'privileges',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
     'grantor',pg_catalog.pg_get_userbyid(x.grantor),'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END,
     'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
     FROM pg_catalog.aclexplode(a.attacl) x)) ORDER BY r.relname,a.attnum),'[]'::jsonb)
   FROM rels r JOIN pg_catalog.pg_attribute a ON a.attrelid=r.oid AND a.attnum=-2 AND a.attname='xmin' AND NOT a.attisdropped
   WHERE r.relname='import_source_row'),
 'routines',(SELECT`);
  return replaceOne(exported, "AS source_routines_match\nFROM observed", `AS source_routines_match,
 (pg_catalog.jsonb_array_length(manifest->'system_column_acls')=1
   AND manifest#>>'{system_column_acls,0,schema}'='naijue_erp'
   AND manifest#>>'{system_column_acls,0,table}'='import_source_row'
   AND manifest#>>'{system_column_acls,0,number}'='-2'
   AND manifest#>>'{system_column_acls,0,name}'='xmin'
   AND manifest#>>'{system_column_acls,0,type}'='xid'
   AND manifest#>'{system_column_acls,0,runtime_select}'='true'::jsonb
   AND manifest#>'{system_column_acls,0,table_select}'='false'::jsonb
   AND manifest#>'{system_column_acls,0,privileges}'=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
     'grantor',manifest#>>'{system_column_acls,0,owner}','grantee',current_user::text,'privilege','SELECT','grantable',false))) AS source_xmin_acl_match
FROM observed`);
}
export const NATIVE_RUNTIME26_SOURCE_XMIN_FROM_V22_METADATA_PROBE = sourceXminCatalogProbe(NATIVE_RUNTIME26_V22_METADATA_PROBE);
export const NATIVE_RUNTIME26_RESPONSIBLE_NULL_SOURCE_XMIN_FROM_V22_METADATA_PROBE = sourceXminCatalogProbe(NATIVE_RUNTIME26_HV2_RESPONSIBLE_NULL_FROM_V22_METADATA_PROBE);
export const NATIVE_RUNTIME26_HV2_HISTORY_SET_SOURCE_XMIN_FROM_V22_METADATA_PROBE = sourceXminCatalogProbe(NATIVE_RUNTIME26_HV2_HISTORY_SET_FROM_V22_METADATA_PROBE);

/** V1/V2 retain their original export shape. V3 observes the exact maintained
 * closure and document-specification xmin reads, without issuing any grant. */
export const NATIVE_RUNTIME26_MAINTENANCE_XMIN_TABLES = Object.freeze([
  'audit_change', 'import_batch', 'import_history_closure_manifest', 'import_record',
  'import_record_accounting_claim', 'import_source_row', 'operation_receipt',
  'product', 'product_image', 'sales_header', 'sales_line', 'sku', 'sku_barcode',
] as const);
export const NATIVE_RUNTIME26_PREPARATION_XMIN_TABLES = Object.freeze([
  'audit_change', 'import_batch', 'import_history_closure_manifest', 'import_source_row',
  'inventory_ledger', 'operation_receipt', 'payment_account', 'payment_account_hall',
  'payment_method', 'product', 'staff', 'user_account',
] as const);
/** V5 completes the original receipt closure for all ten maintained root kinds.
 * V3 normal13 and V4 preparation12 remain distinct immutable observations.
 * This finite metadata profile issues no grant and changes no business SQL rule. */
export const NATIVE_RUNTIME26_COMPLETE_MAINTENANCE_XMIN_TABLES = Object.freeze([
  'audit_change', 'color', 'fit', 'hall', 'import_batch', 'import_history_closure_manifest',
  'import_record', 'import_record_accounting_claim', 'import_source_row', 'operation_receipt',
  'payment_account', 'payment_method', 'product', 'product_category', 'product_image',
  'sales_header', 'sales_line', 'sku', 'sku_barcode', 'staff', 'user_account', 'warehouse',
] as const);
/** V6 observes the original normal-write ledger statement guard's cross-history
 * xmin dependency, including when no HISTORY_REVISION effect exists. No history
 * write purpose, mutation privilege, business rule or older profile is changed. */
export const NATIVE_RUNTIME26_COMPLETE_WRITE_XMIN_TABLES = Object.freeze([
  'audit_change', 'color', 'fit', 'hall', 'history_revision', 'import_batch',
  'import_history_closure_manifest', 'import_record', 'import_record_accounting_claim',
  'import_source_row', 'operation_receipt', 'payment_account', 'payment_method',
  'product', 'product_category', 'product_image', 'sales_header', 'sales_line',
  'sku', 'sku_barcode', 'staff', 'user_account', 'warehouse',
] as const);
function maintenanceXminCatalogProbe(
  observedTables: readonly string[] = NATIVE_RUNTIME26_MAINTENANCE_XMIN_TABLES,
  format = 'EXACT26_RUNTIME_CATALOG_EXPORT_V3',
  resultColumn = 'maintenance_xmin_acl_match',
): string {
  let probe = replaceOne(NATIVE_RUNTIME26_HV2_HISTORY_SET_SOURCE_XMIN_FROM_V22_METADATA_PROBE,
    "'format','EXACT26_RUNTIME_CATALOG_EXPORT_V2'", `'format','${format}'`);
  const tables = observedTables.map(name => `'${name}'`).join(',');
  probe = replaceOne(probe, "WHERE r.relname='import_source_row'",
    `WHERE r.relname IN (${tables}) OR pg_catalog.has_column_privilege(current_user,r.oid,a.attnum,'SELECT')`);
  const start = probe.indexOf(" (pg_catalog.jsonb_array_length(manifest->'system_column_acls')=1");
  const endMarker = ' AS source_xmin_acl_match';
  const end = probe.indexOf(endMarker, start);
  if (start < 0 || end < start) throw new Error('Original system-column observation boundary required');
  return replaceOne(probe, probe.slice(start, end + endMarker.length), `
 (pg_catalog.jsonb_array_length(manifest->'system_column_acls')=${observedTables.length}
   AND (SELECT pg_catalog.array_agg(item->>'table' ORDER BY item->>'table')
     FROM pg_catalog.jsonb_array_elements(manifest->'system_column_acls') item)=ARRAY[${tables}]::text[]
   AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(manifest->'system_column_acls') item
     WHERE NOT coalesce(item->>'schema'='naijue_erp' AND item->>'number'='-2'
       AND item->>'name'='xmin' AND item->>'type'='xid'
       AND item->'runtime_select'='true'::jsonb AND item->'table_select'='false'::jsonb
       AND (SELECT count(*) FROM pg_catalog.jsonb_array_elements(item->'privileges') privilege
         WHERE privilege->>'grantee'=current_user::text)=1
       AND EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(item->'privileges') privilege
         WHERE privilege->>'grantee'=current_user::text AND privilege->>'grantor'=item->>'owner'
           AND privilege->>'privilege'='SELECT' AND privilege->'grantable'='false'::jsonb)
       AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(item->'privileges') privilege
         WHERE privilege->>'grantee'='PUBLIC'),false))) AS ${resultColumn}`);
}
export const NATIVE_RUNTIME26_HV2_HISTORY_SET_MAINTENANCE_XMIN_FROM_V22_METADATA_PROBE = maintenanceXminCatalogProbe();
/** Preparation is a separate exact twelve-table observation, never normal13 evidence. */
export const NATIVE_RUNTIME26_HV2_HISTORY_SET_PREPARATION_XMIN_FROM_V22_METADATA_PROBE = maintenanceXminCatalogProbe(
  NATIVE_RUNTIME26_PREPARATION_XMIN_TABLES, 'EXACT26_RUNTIME_CATALOG_EXPORT_V4', 'preparation_xmin_acl_match',
);
/** Complete normal maintenance is a new exact22 profile, never a V3/V4 alias. */
export const NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_MAINTENANCE_XMIN_FROM_V22_METADATA_PROBE = maintenanceXminCatalogProbe(
  NATIVE_RUNTIME26_COMPLETE_MAINTENANCE_XMIN_TABLES, 'EXACT26_RUNTIME_CATALOG_EXPORT_V5', 'complete_maintenance_xmin_acl_match',
);
/** Complete normal writes are exact23 V6, never a V5/V4/V3 alias. */
export const NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_WRITE_XMIN_FROM_V22_METADATA_PROBE = maintenanceXminCatalogProbe(
  NATIVE_RUNTIME26_COMPLETE_WRITE_XMIN_TABLES, 'EXACT26_RUNTIME_CATALOG_EXPORT_V6', 'complete_write_xmin_acl_match',
);

/** Source-only exact137 successor. This definition grants no DDL/ACL/runtime
 * authority. A genuine new target-specific canonical catalog and independent
 * review are mandatory; an unresolved/null catalog digest never admits a pool.
 * V1..V6 meanings remain immutable, including V6's exact135 routine closure. */
export const NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_PATCH_LEVEL = "26_hv2_live_ledger_pairs_complete_write_xmin_from_v22";
export const NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_METADATA_PROBE = (() => {
  let probe = replaceOne(NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_WRITE_XMIN_FROM_V22_METADATA_PROBE,
    "'format','EXACT26_RUNTIME_CATALOG_EXPORT_V6'", "'format','EXACT26_RUNTIME_CATALOG_EXPORT_V7'");
  probe = replaceOne(probe, "jsonb_array_length(manifest->'routines')=135", "jsonb_array_length(manifest->'routines')=137");
  probe = replaceOne(probe, "SELECT 1 FROM (VALUES", "SELECT 1 FROM (VALUES\n    ('guard_recorded_live_balance_pair','58700e3775442434c910b94fa66110d0880189c530bf7fdd839131f1ca8ad63e'),('validate_recorded_live_balance_commit','b32828510d3b85ae04c9d3849bcc494abe3cf337f0908996d72142fc171fb523'),");
  // The complete reviewed catalog hash binds the exact CHECK expression and all
  // original objects/ACL. These additional fail-closed shape checks do not replace
  // that whole-catalog review or pretend to be a PostgreSQL engine test.
  return replaceOne(probe, "FROM observed", `,
 (EXISTS (SELECT 1 FROM pg_catalog.pg_class r WHERE r.oid=to_regclass('naijue_erp.inventory_ledger')
   AND (SELECT array_agg(a.attname::text ORDER BY a.attnum) FROM pg_catalog.pg_attribute a
     WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped)=ARRAY[
       'id','operation_id','event_kind','warehouse_id','sku_id','quantity_delta','source_sales_line_id','endpoint',
       'source_document_version','reverses_entry_id','business_date','posted_at','source_transfer_line_id','source_import_batch_id',
       'source_history_revision_id','source_history_sales_line_id','source_history_transfer_line_id','quantity_before','quantity_after']::text[]
   AND (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid=r.oid AND a.attname IN ('quantity_before','quantity_after')
     AND a.atttypid='pg_catalog.int8'::regtype AND NOT a.attnotnull AND NOT a.attisdropped
     AND a.attidentity='' AND a.attgenerated='' AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attrdef d WHERE d.adrelid=a.attrelid AND d.adnum=a.attnum)
     AND pg_catalog.has_column_privilege(current_user,r.oid,a.attnum,'SELECT')
     AND pg_catalog.has_column_privilege(current_user,r.oid,a.attnum,'INSERT')
     AND NOT pg_catalog.has_column_privilege(current_user,r.oid,a.attnum,'UPDATE')
     AND NOT pg_catalog.has_column_privilege(current_user,r.oid,a.attnum,'REFERENCES')
     AND (SELECT count(*) FROM pg_catalog.aclexplode(a.attacl))=2
     AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(a.attacl) privilege
       WHERE privilege.grantee IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
         OR privilege.grantor<>r.relowner OR privilege.privilege_type NOT IN ('SELECT','INSERT') OR privilege.is_grantable))=2
   AND NOT pg_catalog.has_table_privilege(current_user,r.oid,'SELECT')
   AND NOT pg_catalog.has_table_privilege(current_user,r.oid,'INSERT')
   AND NOT pg_catalog.has_table_privilege(current_user,r.oid,'UPDATE')
   AND NOT pg_catalog.has_table_privilege(current_user,r.oid,'DELETE')
   AND NOT pg_catalog.has_table_privilege(current_user,r.oid,'TRUNCATE'))
   AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid=to_regclass('naijue_erp.inventory_ledger')
     AND c.conname='ledger_recorded_balance_pair' AND c.contype='c' AND c.convalidated
     AND NOT c.condeferrable AND NOT c.condeferred AND c.conislocal AND c.coninhcount=0 AND NOT c.connoinherit
     AND 18=ANY(c.conkey) AND 19=ANY(c.conkey))
   AND NOT EXISTS(SELECT 1 FROM (VALUES
     ('inventory_ledger','zz_live_ledger_balance_snapshot','guard_recorded_live_balance_pair',7,false,false),
     ('inventory_balance','recorded_live_balance_final_consistency','validate_recorded_live_balance_commit',21,true,true)
   ) required(table_name,trigger_name,routine_name,event_type,is_deferrable,is_deferred)
     WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=to_regclass('naijue_erp.'||required.table_name)
       AND t.tgname=required.trigger_name AND t.tgfoid=to_regprocedure('naijue_erp.'||required.routine_name||'()')
       AND t.tgenabled='O' AND t.tgtype=required.event_type AND NOT t.tgisinternal
       AND t.tgdeferrable=required.is_deferrable AND t.tginitdeferred=required.is_deferred
       AND t.tgnargs=0 AND t.tgqual IS NULL AND t.tgattr=''::pg_catalog.int2vector
       AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL AND t.tgconstrrelid=0
       AND (required.is_deferrable OR t.tgconstraint=0)
       AND (NOT required.is_deferrable OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.oid=t.tgconstraint
         AND c.conname=required.trigger_name AND c.contype='t' AND c.condeferrable AND c.condeferred))))
   AND NOT EXISTS(SELECT 1 FROM (VALUES ('guard_recorded_live_balance_pair'),('validate_recorded_live_balance_commit')) required(routine_name)
     WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
       WHERE p.oid=to_regprocedure('naijue_erp.'||required.routine_name||'()') AND l.lanname='plpgsql'
         AND p.prokind='f' AND p.prorettype='pg_catalog.trigger'::regtype AND NOT p.proretset AND p.pronargs=0
         AND NOT p.prosecdef AND NOT p.proleakproof AND NOT p.proisstrict AND p.provolatile='v' AND p.proparallel='u'
         AND cardinality(p.proconfig)=1
         AND regexp_replace(p.proconfig[1],'[[:space:]]','','g')='search_path=pg_catalog,naijue_erp'
         AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) privilege
           WHERE privilege.grantee<>p.proowner)))) AS recorded_live_balance_contract_match
FROM observed`);
})();

/** Daily managed-application lease identity only. The complete catalog was awaited at startup.
 * A baseline switch stops/disposes that application before DDL/ACL changes, then creates a new issuer.
 * This signal does not claim to detect uncoordinated schema changes while an old application runs. */
export const NATIVE_RUNTIME26_IDENTITY_PROBE = `/* native-runtime26:identity-v1 */ SELECT jsonb_build_object(
 'database',current_database(),'database_oid',d.oid::text,'database_owner',pg_get_userbyid(d.datdba),
 'current_user',current_user,'session_user',session_user,'server_version_num',current_setting('server_version_num'),
 'server_addr',inet_server_addr()::text,'server_port',inet_server_port(),'postmaster_start',pg_postmaster_start_time()::text,
 'replication_role',current_setting('session_replication_role')) AS identity
 FROM pg_catalog.pg_database d WHERE d.datname=current_database()`;

type Runtime26Purpose = Parameters<NativeRuntime26Capability["assertReady"]>[1];
const runtime26Purposes: readonly Runtime26Purpose[] = Object.freeze(["IMPORT_STAGE", "IMPORT_PRODUCT_SEASONS", "IMPORT_PUBLISH", "PRODUCT_SEASONS_READ",
  "PRODUCT_MAINTENANCE", "INVENTORY_ADMISSION", "HISTORY_READ", "CURRENT_FORM_READ", "CURRENT_CUSTOMER_READ_WRITE", "HISTORY_REVISION"]);
const issuedPools = new WeakSet<object>();
const runtime26Error = (message: string): Error => Object.assign(Error(message), { code: "NATIVE_RUNTIME26_NOT_READY" });
function exactData(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== keys.length) throw runtime26Error("Closed metadata data object required");
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(value, k);
    if (!d || !("value" in d) || !d.enumerable) throw runtime26Error("Own metadata data properties required");
    result[k] = d.value;
  }
  return result;
}
function ownArray(value: unknown): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || Reflect.ownKeys(value).length !== value.length + 1) throw runtime26Error("Dense own metadata array required");
  return Array.from({ length: value.length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !("value" in d) || !d.enumerable) throw runtime26Error("Own array data entries required"); return d.value;
  });
}
const sha = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
function metadataText(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\x00-\x1f\x7f]/.test(value); }
type FilePin = { readonly path: string; readonly sha256: string; readonly signature: string };
function statSignature(s: BigIntStats): string {
  return JSON.stringify([s.dev, s.ino, s.mode, s.size, s.mtimeNs, s.ctimeNs].map(value => value.toString()));
}
function pinnedMetadataFile(path: string, expected: string, limit: number): { pin: FilePin; bytes: Buffer } {
  if (!isAbsolute(path) || !sha(expected)) throw runtime26Error("Absolute metadata path and independent SHA-256 required");
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || (before.mode & 0o022n) !== 0n || before.size === 0n || before.size > BigInt(limit)) throw runtime26Error("Bounded non-writable metadata file required");
    const bytes = readFileSync(fd), after = fstatSync(fd, { bigint: true }), named = lstatSync(path, { bigint: true });
    const signature = statSignature(before);
    if (!named.isFile() || signature !== statSignature(after) || signature !== statSignature(named) || BigInt(bytes.length) !== before.size
      || createHash("sha256").update(bytes).digest("hex") !== expected) throw runtime26Error("Metadata file pin changed");
    return { pin: Object.freeze({ path, sha256: expected, signature }), bytes };
  } finally { if (fd !== undefined) closeSync(fd); }
}
/** Content is hashed at issuance. Every later boundary still opens no-follow and
 * proves the same file identity/mode/size/nanosecond timestamps; any change revokes,
 * including a rewrite to identical bytes. No cached business authorization. */
function metadataFileUnchanged(pin: FilePin): void {
  let fd: number | undefined;
  try {
    fd = openSync(pin.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(fd, { bigint: true }), named = lstatSync(pin.path, { bigint: true }), after = fstatSync(fd, { bigint: true });
    if (!before.isFile() || !named.isFile() || statSignature(before) !== pin.signature || statSignature(named) !== pin.signature || statSignature(after) !== pin.signature)
      throw runtime26Error("Metadata file pin changed");
  } finally { if (fd !== undefined) closeSync(fd); }
}
/** These existing driver/resource errors prove a failed request/lease, not a
 * changed reviewed target. Each next request must acquire and fully verify anew. */
function transientMetadataFailure(error: unknown): boolean {
  const code = error !== null && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  if (error instanceof PostgresQueryError && code === undefined) return isKnownPostgresTransportQueryError(error);
  if (error instanceof PostgresResourceError && ["PG_POOL_OVERLOADED", "PG_ACQUIRE_TIMEOUT", "PG_ACQUIRE_FAILED", "PG_CLIENT_CLOSED", "PG_QUERY_FAILED"].includes(error.code)) return true;
  return typeof code === "string" && (/^(?:08|53)/.test(code)
    || ["57014", "55P03", "57P01", "57P02", "57P03", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EPIPE", "ENETDOWN", "ENETUNREACH", "EHOSTUNREACH", "EMFILE", "ENFILE", "ENOMEM", "EAGAIN", "EIO"].includes(code));
}
function dataMethod(target: object, key: string): (...args: unknown[]) => unknown {
  for (let current: object | null = target; current !== null; current = Object.getPrototypeOf(current) as object | null) {
    const d = Object.getOwnPropertyDescriptor(current, key);
    if (!d) continue;
    if (!("value" in d) || typeof d.value !== "function") break;
    return d.value as (...args: unknown[]) => unknown;
  }
  throw runtime26Error("Explicit original PostgreSQL data method required");
}
export interface NativeRuntime26Issuer {
  readonly pool: PgSalesPool;
  readonly runtime26: NativeRuntime26Capability;
  readonly catalogueRetainedDelete: CatalogueRetainedDeleteCapability;
  readonly productSeasonArray: ProductSeasonArrayCapability;
  readonly historicalCustomerExclusion: HistoricalCustomerExclusionCapability;
  readonly productMediaWrite: ProductMediaWriteCapability;
  readonly categoryOrderWrite?: CategoryOrderWriteCapability;
  readonly imageColorSwap: {
    readonly profile: "product-image-color-swap-v4";
    readonly assertVerified: ProductMediaWriteCapability["assertVerified"];
    readonly assertReady: ProductMediaWriteCapability["assertPrepared"];
  };
}
export async function createNativeRuntime26Issuer(originalPool: PgSalesPool, options: {
  readonly reviewFile: string; readonly trustedReviewSha256: string;
  readonly verificationProfile?: "DEPLOYMENT_BASELINE_REQUEST_IDENTITY_V1";
  /** Consumer storage compatibility, not a purpose or execution authority.
   * Omission preserves the original general-purpose legacy/import issuer. */
  readonly requiredObservation?: "RECORDED_LIVE_LEDGER_PAIRS_V7";
}): Promise<NativeRuntime26Issuer> {
  const settings = exactData(options, ["reviewFile", "trustedReviewSha256", ...(Object.hasOwn(options ?? {}, "verificationProfile") ? ["verificationProfile"] : []), ...(Object.hasOwn(options ?? {}, "requiredObservation") ? ["requiredObservation"] : [])]);
  if (Object.hasOwn(settings,"verificationProfile") && settings.verificationProfile !== "DEPLOYMENT_BASELINE_REQUEST_IDENTITY_V1")
    throw runtime26Error("Explicit managed deployment baseline verification profile required");
  if (Object.hasOwn(settings,"requiredObservation") && settings.requiredObservation !== "RECORDED_LIVE_LEDGER_PAIRS_V7")
    throw runtime26Error("Explicit supported consumer observation requirement required");
  const managedBaseline = settings.verificationProfile === "DEPLOYMENT_BASELINE_REQUEST_IDENTITY_V1";
  let baselineVerified = false;
  if (!metadataText(settings.reviewFile) || !sha(settings.trustedReviewSha256) || originalPool === null || typeof originalPool !== "object"
    || issuedPools.has(originalPool)) throw runtime26Error("One explicitly owned pool and independently pinned review required");
  const connect = dataMethod(originalPool, "connect");
  const reviewFile = pinnedMetadataFile(settings.reviewFile, settings.trustedReviewSha256, 64 * 1024);
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(reviewFile.bytes)); } catch { throw runtime26Error("UTF-8 metadata review required"); }
  const review = exactData(parsed, ["version", "decision", "target", "catalog", "purposes", "scope", "independentReview", "realImportExecutionAuthorized"]);
  if (review.version !== "C_NATIVE_RUNTIME26_REVIEW_V1" || review.decision !== "ACCEPT_EXACT_RUNTIME26_TARGET_METADATA"
    || review.scope !== "EXACT_TARGET_METADATA_ONLY" || review.realImportExecutionAuthorized !== false) throw runtime26Error("Metadata-only independent review required");
  const target = exactData(review.target, ["database", "databaseOid", "actingRole", "sessionUser", "serverAddress", "serverPort", "postmasterStart"]);
  if (![target.database, target.actingRole, target.sessionUser, target.postmasterStart].every(metadataText)
    || typeof target.databaseOid !== "string" || !/^[1-9][0-9]*$/.test(target.databaseOid)
    || target.serverAddress !== null && !metadataText(target.serverAddress)
    || target.serverPort !== null && !(typeof target.serverPort === "number" && Number.isInteger(target.serverPort) && target.serverPort >= 1 && target.serverPort <= 65535))
    throw runtime26Error("Exact database, process, role and nullable socket identity required");
  const catalog = exactData(review.catalog, ["format", "sha256", "patchLevel"]);
  const recordedLivePairs = catalog.patchLevel === NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_PATCH_LEVEL;
  const completeWriteXmin = recordedLivePairs || catalog.patchLevel === "26_hv2_history_set_guards_complete_write_xmin_from_v22";
  const completeMaintenanceXmin = catalog.patchLevel === "26_hv2_history_set_guards_complete_maintenance_xmin_from_v22";
  const preparationXmin = catalog.patchLevel === "26_hv2_history_set_guards_preparation_xmin_from_v22";
  const maintenanceXmin = catalog.patchLevel === "26_hv2_history_set_guards_maintenance_xmin_from_v22";
  const historySet = completeWriteXmin || completeMaintenanceXmin || preparationXmin || maintenanceXmin || catalog.patchLevel === "26_hv2_history_set_guards_from_v22" || catalog.patchLevel === "26_hv2_history_set_guards_source_xmin_from_v22";
  const categoryDepth = historySet || catalog.patchLevel === "26_hv2_category_depth_from_v22";
  const sourceXmin = catalog.patchLevel === "26_hv2_source_xmin_from_v22" || catalog.patchLevel === "26_hv2_responsible_null_source_xmin_from_v22" || catalog.patchLevel === "26_hv2_history_set_guards_source_xmin_from_v22";
  if (catalog.format !== (recordedLivePairs ? "EXACT26_RUNTIME_CATALOG_EXPORT_V7" : completeWriteXmin ? "EXACT26_RUNTIME_CATALOG_EXPORT_V6" : completeMaintenanceXmin ? "EXACT26_RUNTIME_CATALOG_EXPORT_V5" : preparationXmin ? "EXACT26_RUNTIME_CATALOG_EXPORT_V4" : maintenanceXmin ? "EXACT26_RUNTIME_CATALOG_EXPORT_V3" : sourceXmin ? "EXACT26_RUNTIME_CATALOG_EXPORT_V2" : "EXACT26_RUNTIME_CATALOG_EXPORT_V1") || !sha(catalog.sha256) || !(["26_v11_document_specification_save", "26_v14_core_initialization", "26_v15_category_order_undo", "26_v16_history_responsible_from_v14", "26_v16_history_responsible_from_v15", "26_v19_barcode_scheme_initialization_from_v16_v15", "26_v20_history_insert_identity_from_v19", "26_v21_history_effective_value_from_v16_v14", "26_v22_staged_prefix_bind_from_v20", "26_hv2_responsible_null_from_v22", "26_hv2_source_xmin_from_v22", "26_hv2_responsible_null_source_xmin_from_v22", "26_hv2_category_depth_from_v22", "26_hv2_history_set_guards_from_v22", "26_hv2_history_set_guards_source_xmin_from_v22", "26_hv2_history_set_guards_maintenance_xmin_from_v22", "26_hv2_history_set_guards_preparation_xmin_from_v22", "26_hv2_history_set_guards_complete_maintenance_xmin_from_v22", "26_hv2_history_set_guards_complete_write_xmin_from_v22", NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_PATCH_LEVEL] as readonly unknown[]).includes(catalog.patchLevel))
    throw runtime26Error("Exact independently reviewed v11, v14 or v15 catalog required");
  // Enforce the consumer's compiled SQL requirement before any pool borrow.
  // A genuine legacy catalog remains valid for old callers, never for new cells.
  if (settings.requiredObservation === "RECORDED_LIVE_LEDGER_PAIRS_V7" && !recordedLivePairs)
    throw runtime26Error("Recorded live ledger pairs require the exact independently reviewed V7 catalog");
  const effectiveValueDisambiguation = catalog.patchLevel === "26_v21_history_effective_value_from_v16_v14";
  const responsibleNull = categoryDepth || catalog.patchLevel === "26_hv2_responsible_null_from_v22" || catalog.patchLevel === "26_hv2_responsible_null_source_xmin_from_v22";
  const stagedPrefixBind = sourceXmin || responsibleNull || catalog.patchLevel === "26_v22_staged_prefix_bind_from_v20";
  const historyInsertIdentity = stagedPrefixBind || catalog.patchLevel === "26_v20_history_insert_identity_from_v19";
  const barcodeSchemeInitialization = historyInsertIdentity || catalog.patchLevel === "26_v19_barcode_scheme_initialization_from_v16_v15";
  const historyResponsible = effectiveValueDisambiguation || barcodeSchemeInitialization || catalog.patchLevel === "26_v16_history_responsible_from_v14" || catalog.patchLevel === "26_v16_history_responsible_from_v15";
  const metadataProbe = recordedLivePairs ? NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_METADATA_PROBE : completeWriteXmin ? NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_WRITE_XMIN_FROM_V22_METADATA_PROBE : completeMaintenanceXmin ? NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_MAINTENANCE_XMIN_FROM_V22_METADATA_PROBE : preparationXmin ? NATIVE_RUNTIME26_HV2_HISTORY_SET_PREPARATION_XMIN_FROM_V22_METADATA_PROBE : maintenanceXmin ? NATIVE_RUNTIME26_HV2_HISTORY_SET_MAINTENANCE_XMIN_FROM_V22_METADATA_PROBE : historySet ? (sourceXmin ? NATIVE_RUNTIME26_HV2_HISTORY_SET_SOURCE_XMIN_FROM_V22_METADATA_PROBE : NATIVE_RUNTIME26_HV2_HISTORY_SET_FROM_V22_METADATA_PROBE) : categoryDepth ? NATIVE_RUNTIME26_HV2_CATEGORY_FROM_V22_METADATA_PROBE : sourceXmin ? (responsibleNull ? NATIVE_RUNTIME26_RESPONSIBLE_NULL_SOURCE_XMIN_FROM_V22_METADATA_PROBE : NATIVE_RUNTIME26_SOURCE_XMIN_FROM_V22_METADATA_PROBE) : responsibleNull ? NATIVE_RUNTIME26_HV2_RESPONSIBLE_NULL_FROM_V22_METADATA_PROBE : stagedPrefixBind ? NATIVE_RUNTIME26_V22_METADATA_PROBE : effectiveValueDisambiguation ? NATIVE_RUNTIME26_V21_EFFECTIVE_VALUE_FROM_V16_V14_METADATA_PROBE : historyInsertIdentity ? NATIVE_RUNTIME26_V20_METADATA_PROBE : barcodeSchemeInitialization ? NATIVE_RUNTIME26_V19_METADATA_PROBE : catalog.patchLevel === "26_v16_history_responsible_from_v14" ? NATIVE_RUNTIME26_V16_FROM_V14_METADATA_PROBE
    : catalog.patchLevel === "26_v16_history_responsible_from_v15" ? NATIVE_RUNTIME26_V16_FROM_V15_METADATA_PROBE
    : catalog.patchLevel === "26_v15_category_order_undo" ? NATIVE_RUNTIME26_V15_METADATA_PROBE
    : catalog.patchLevel === "26_v14_core_initialization" ? NATIVE_RUNTIME26_V14_METADATA_PROBE : NATIVE_RUNTIME26_METADATA_PROBE;
  const purposes = ownArray(review.purposes);
  if (purposes.length === 0 || purposes.length > runtime26Purposes.length || new Set(purposes).size !== purposes.length
    || purposes.some(p => !runtime26Purposes.includes(p as Runtime26Purpose))) throw runtime26Error("Finite explicitly reviewed runtime purposes required");
  if (purposes.includes("HISTORY_REVISION") && !historyResponsible) throw runtime26Error("HISTORY writes require the exact current-base v16 successor");
  const allowed = new Set(purposes as Runtime26Purpose[]);
  const independent = exactData(review.independentReview, ["path", "sha256", "result"]);
  if (!metadataText(independent.path) || !sha(independent.sha256) || independent.result !== "PASS") throw runtime26Error("Pinned independent PASS receipt required");
  const independentFile = pinnedMetadataFile(independent.path, independent.sha256, 8 * 1024 * 1024);
  let revoked = false;
  const fail = (message: string): never => { revoked = true; throw runtime26Error(message); };
  function filesReady(): void {
    if (revoked) throw runtime26Error("Runtime metadata capability revoked");
    try {
      metadataFileUnchanged(reviewFile.pin);
      metadataFileUnchanged(independentFile.pin);
    } catch (error) {
      if (transientMetadataFailure(error)) throw new PostgresResourceError("PG_QUERY_FAILED");
      fail("Independent review files changed or became unavailable");
    }
  }
  type Lease = { raw: PgSalesClient; query: PgSalesClient["query"]; release: PgSalesClient["release"]; active: boolean; checking: boolean; pending: number; failed: Error | undefined };
  const leases = new WeakMap<object, Lease>(), activeRawClients = new WeakSet<object>();
  async function verify(client: object, purpose: Runtime26Purpose): Promise<void> {
    const lease = leases.get(client);
    if (lease === undefined) throw runtime26Error("Original issuer lease required");
    if (lease.failed !== undefined) throw runtime26Error("Failed runtime lease must be discarded before a new request");
    if (!allowed.has(purpose) || !lease.active || lease.checking || lease.pending !== 0) fail("Original idle live lease and explicitly reviewed purpose required");
    lease.checking = true;
    try {
      filesReady();
      const full = !managedBaseline || !baselineVerified;
      const observed = await lease.query(full ? metadataProbe : NATIVE_RUNTIME26_IDENTITY_PROBE);
      if (!lease.active || observed.rows.length !== 1 || observed.rowCount !== 1) fail("One actual verification row on the original lease required");
      const row = exactData(observed.rows[0], full ? ["identity", "migration_versions", "catalog_sha256", "source_routines_match", ...(recordedLivePairs ? ["recorded_live_balance_contract_match"] : []), ...(completeWriteXmin ? ["complete_write_xmin_acl_match"] : completeMaintenanceXmin ? ["complete_maintenance_xmin_acl_match"] : preparationXmin ? ["preparation_xmin_acl_match"] : maintenanceXmin ? ["maintenance_xmin_acl_match"] : sourceXmin ? ["source_xmin_acl_match"] : [])] : ["identity"]);
      const identity = exactData(row.identity, ["database", "database_oid", "database_owner", "current_user", "session_user", "server_version_num", "server_addr", "server_port", "postmaster_start", "replication_role"]);
      if (full && (row.catalog_sha256 !== catalog.sha256 || row.source_routines_match !== true || !exactVersions26(row.migration_versions)))
        fail("Actual exact schema, source bodies or catalog differs from independent review");
      if (full && sourceXmin && row.source_xmin_acl_match !== true)
        fail("Exact source xmin-only column grant differs from the independently reviewed boundary");
      if (full && recordedLivePairs && row.recorded_live_balance_contract_match !== true)
        fail("Exact recorded native pair schema, guards or minimum column ACL differs from independent review");
      if (full && completeWriteXmin && row.complete_write_xmin_acl_match !== true)
        fail("Exact complete write xmin column grants differ from the independently reviewed boundary");
      if (full && completeMaintenanceXmin && row.complete_maintenance_xmin_acl_match !== true)
        fail("Exact complete maintenance xmin column grants differ from the independently reviewed boundary");
      if (full && preparationXmin && row.preparation_xmin_acl_match !== true)
        fail("Exact preparation xmin column grants differ from the independently reviewed boundary");
      if (full && maintenanceXmin && row.maintenance_xmin_acl_match !== true)
        fail("Exact maintained xmin column grants differ from the independently reviewed boundary");
      if (identity.database !== target.database || identity.database_oid !== target.databaseOid || identity.current_user !== target.actingRole
        || identity.session_user !== target.sessionUser || identity.server_addr !== target.serverAddress || identity.server_port !== target.serverPort
        || identity.postmaster_start !== target.postmasterStart || identity.replication_role !== "origin") fail("Actual runtime target, process or role differs from independent review");
      filesReady();
      if (full && managedBaseline) baselineVerified = true;
    } catch (error) {
      lease.failed = error instanceof Error ? error : runtime26Error("Runtime metadata verification failed");
      if (!transientMetadataFailure(error)) revoked = true;
      throw error;
    } finally { lease.checking = false; }
  }
  const pool: PgSalesPool = Object.freeze({ async connect(): Promise<PgSalesClient> {
    filesReady();
    const raw = await connect.call(originalPool) as PgSalesClient;
    if (raw === null || typeof raw !== "object" || activeRawClients.has(raw)) fail("Original pool returned an invalid or already live lease");
    const rawQuery = dataMethod(raw, "query"), rawRelease = dataMethod(raw, "release");
    const lease: Lease = { raw, query: (sql, values) => rawQuery.call(raw, sql, values) as Promise<PgSalesResult>,
      release: error => { rawRelease.call(raw, error); }, active: true, checking: false, pending: 0, failed: undefined };
    const client: PgSalesClient = Object.freeze({ async query(sql: string, values?: unknown[]): Promise<PgSalesResult> {
      if (lease.failed !== undefined && sql !== "ROLLBACK") throw runtime26Error("Failed runtime lease permits rollback and discard only");
      if (!lease.active || lease.checking || revoked && sql !== "ROLLBACK") fail("Live verified lease required; only rollback remains available after revocation");
      // Recheck actual outside files synchronously before dispatching either PG
      // commit alias. Conservative token matching also covers comments/batches;
      // matches inside literals only add a file check, never bypass one.
      if (/\b(?:COMMIT|END)\b/i.test(sql)) {
        try { filesReady(); } catch (error) { lease.failed = error instanceof Error ? error : runtime26Error("Commit proof unavailable"); throw error; }
      }
      lease.pending++;
      try { return await lease.query(sql, values); } finally { lease.pending--; }
    }, release(error?: Error | boolean): void {
      if (!lease.active) throw runtime26Error("PostgreSQL lease already released");
      lease.active = false; activeRawClients.delete(raw);
      lease.release(lease.checking || lease.pending > 0 || revoked || lease.failed !== undefined ? error instanceof Error ? error : lease.failed ?? runtime26Error("Unusable runtime lease discarded") : error);
    } });
    leases.set(client, lease); activeRawClients.add(raw);
    try { await verify(client, purposes[0] as Runtime26Purpose); return client; }
    catch (error) { client.release(error instanceof Error ? error : true); throw error; }
  } });
  function verifiedTarget(value: object, purpose: Runtime26Purpose): void {
    filesReady(); if (!allowed.has(purpose)) throw runtime26Error("Purpose absent from independent review");
    if (value !== pool) assertMaintenanceDriverPool(value, pool);
  }
  const runtime26: NativeRuntime26Capability = Object.freeze({ profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", assertReady: verify });
  const catalogueRetainedDelete: CatalogueRetainedDeleteCapability = Object.freeze({ profile: "catalogue-retained-delete-v22", assertVerified(value: Parameters<CatalogueRetainedDeleteCapability["assertVerified"]>[0]): void {
    filesReady();
    if (value !== pool || !allowed.has("PRODUCT_SEASONS_READ")) throw runtime26Error("Original managed catalogue read pool and reviewed purpose required");
  } });
  const productSeasonArray: ProductSeasonArrayCapability = Object.freeze({ profile: "product-season-array-v1", assertVerified(value: object): void {
    verifiedTarget(value, value === pool ? "PRODUCT_SEASONS_READ" : "PRODUCT_MAINTENANCE");
  } });
  const historicalCustomerExclusion: HistoricalCustomerExclusionCapability = Object.freeze({ profile: "historical-customer-exact2-v26", assertVerified(value: object): void {
    verifiedTarget(value, "CURRENT_CUSTOMER_READ_WRITE");
  } });
  const productMediaWrite: ProductMediaWriteCapability = Object.freeze({ profile: "product-media-write-v22", assertVerified(value: object): void {
    filesReady(); if (!allowed.has("PRODUCT_MAINTENANCE")) throw runtime26Error("Product maintenance purpose absent from independent review");
    assertMaintenanceDriverPool(value, pool);
  }, async assertReady(context: Parameters<ProductMediaWriteCapability["assertReady"]>[0]): Promise<void> {
    await verify(maintenanceContextClient(context, pool), "PRODUCT_MAINTENANCE");
  }, async assertPrepared(context: Parameters<ProductMediaWriteCapability["assertPrepared"]>[0], completion: Parameters<ProductMediaWriteCapability["assertPrepared"]>[1]): Promise<void> {
    assertMaintenanceProductImagesPrepared(context, pool, completion);
    await verify(maintenanceContextClient(context, pool), "PRODUCT_MAINTENANCE");
    assertMaintenanceProductImagesPrepared(context, pool, completion);
  } });
  const imageColorSwap = Object.freeze({ profile: "product-image-color-swap-v4" as const,
    assertVerified: productMediaWrite.assertVerified, assertReady: productMediaWrite.assertPrepared });
  const categoryOrderWrite: CategoryOrderWriteCapability | undefined = (barcodeSchemeInitialization || catalog.patchLevel === "26_v15_category_order_undo" || catalog.patchLevel === "26_v16_history_responsible_from_v15") && allowed.has("PRODUCT_MAINTENANCE")
    ? Object.freeze({ profile: "CATEGORY_ORDER_UNDO_V15", async assertReady(context: Parameters<CategoryOrderWriteCapability["assertReady"]>[0]): Promise<void> {
      await verify(maintenanceContextClient(context, pool), "PRODUCT_MAINTENANCE");
      bindMaintenanceCategoryOrderGuard(context, pool, () => verify(maintenanceContextClient(context, pool), "PRODUCT_MAINTENANCE"));
    } }) : undefined;
  issuedPools.add(originalPool);
  try {
    // Complete schema/routine/ACL verification is awaited before the issuer is exposed.
    // Daily consumers cannot become the lazy first verifier or reopen a changed baseline.
    const first = await pool.connect(); first.release();
    return Object.freeze({ pool, runtime26, catalogueRetainedDelete, productSeasonArray, historicalCustomerExclusion, productMediaWrite, imageColorSwap,
      ...(categoryOrderWrite === undefined ? {} : { categoryOrderWrite }) });
  } catch (error) { revoked = true; throw error; }
}
function exactVersions26(value: unknown): boolean {
  try { const versions = ownArray(value); return versions.length === 26 && versions.every((v, i) => v === i + 1); } catch { return false; }
}
