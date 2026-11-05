import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { entityId } from '../../../packages/domain/src/values.ts';
import { requestHash } from '../../../packages/application/src/request-hash.ts';
import type { Runtime27CommandCapability } from '../../../packages/application/src/runtime27-command-capability.ts';
import type { MaintenanceCompletion } from '../../../packages/application/src/maintenance-commit-ports.ts';
import type { PgSalesPool } from './sales-unit-of-work.ts';
import type { ProductCapacityFactory } from './product-maintenance-store.ts';
import { maintenanceContextClient, bindMaintenanceProductGuard, assertMaintenanceProductCompletion, assertMaintenanceDriverPool } from './maintenance-command-unit-of-work.ts';
import { assertProductEvidencePendingCapacity } from './catalogue-completeness.ts';
import { assertIssuedRuntime27Pool } from './runtime27-command-issuer.ts';
import { safeStandard27CapacitySnapshot } from './standard27-product-create-capacity.ts';

const issuedFactories = new WeakMap<object, {pool: PgSalesPool; runtime: Runtime27CommandCapability}>();
export function assertOrdinary27ProductDriver(driver: object, factory: ProductCapacityFactory): void {
  const issued = issuedFactories.get(factory);
  requireDomain(issued, 'NATIVE_RUNTIME27_NOT_READY', 'Actual ordinary product factory required');
  assertMaintenanceDriverPool(driver, issued.pool);
}

export async function assertOrdinary27ProductContext(factory: ProductCapacityFactory, context: object): Promise<void> {
  const issued = issuedFactories.get(factory);
  requireDomain(issued, 'NATIVE_RUNTIME27_NOT_READY', 'Actual ordinary product factory required');
  const client = maintenanceContextClient(context, issued.pool);
  await issued.runtime.assertReady(client, 'CATALOGUE_READ');
  const schema = await client.query(`/* ordinary27-product-season-contract */ SELECT
    EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid='naijue_erp.product'::regclass AND a.attname='season_ids' AND a.atttypid='uuid[]'::regtype AND NOT a.attisdropped) AS column_ok,
    EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid='naijue_erp.product'::regclass AND c.conname='product_season_ids_shape' AND c.contype='c' AND c.convalidated AND pg_catalog.pg_get_constraintdef(c.oid)='CHECK ((naijue_erp.valid_product_season_ids(season_ids) IS TRUE))') AS constraint_ok,
    NOT EXISTS(SELECT 1 FROM (VALUES
      ('product_season_selection','product','guard_product_season_selection()',23,'13b4d3e38dd2ebac9a2f5fa567538850e55651ef1c89190ecd4fd4e8f706cf67'),
      ('season_array_reference','season','guard_referenced_season_identity()',27,'8eb0b3435f063f4a653c31f632fe6751fecc3864a375a72753bcf4090bb18f2c'),
      ('season_array_no_truncate','season','reject_immutable_change()',34,'3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c')) needed(trg,tbl,fn,typ,hash)
      WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_proc f ON f.oid=t.tgfoid JOIN pg_catalog.pg_language l ON l.oid=f.prolang
        WHERE n.nspname='naijue_erp' AND c.relname=needed.tbl AND t.tgname=needed.trg AND t.tgfoid=pg_catalog.to_regprocedure('naijue_erp.'||needed.fn) AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=needed.typ AND t.tgnargs=0 AND t.tgqual IS NULL AND NOT t.tgdeferrable AND NOT t.tginitdeferred
        AND t.tgattr=CASE WHEN needed.trg='season_array_no_truncate' THEN ''::int2vector WHEN needed.tbl='product' THEN (SELECT (a.attnum::text||' '||b.attnum::text)::int2vector FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_attribute b ON b.attrelid=a.attrelid WHERE a.attrelid=t.tgrelid AND a.attname='season_ids' AND b.attname='season_id' AND NOT a.attisdropped AND NOT b.attisdropped) ELSE (SELECT a.attnum::text::int2vector FROM pg_catalog.pg_attribute a WHERE a.attrelid=t.tgrelid AND a.attname='id' AND NOT a.attisdropped) END
        AND f.prokind='f' AND f.provolatile='v' AND f.prosqlbody IS NULL AND f.proowner=n.nspowner AND l.lanname='plpgsql' AND NOT f.prosecdef AND NOT f.proretset AND f.pronargs=0 AND f.prorettype='trigger'::regtype AND f.proconfig=ARRAY['search_path=pg_catalog, naijue_erp, pg_temp'] AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(f.prosrc,'UTF8')),'hex')=needed.hash)) AS triggers_ok,
    EXISTS(SELECT 1 FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace JOIN pg_catalog.pg_language l ON l.oid=f.prolang WHERE f.oid=pg_catalog.to_regprocedure('naijue_erp.valid_product_season_ids(uuid[])') AND f.prokind='f' AND f.provolatile='i' AND f.prosqlbody IS NULL AND f.proowner=n.nspowner AND l.lanname='sql' AND NOT f.prosecdef AND NOT f.proretset AND f.pronargs=1 AND f.prorettype='boolean'::regtype AND f.proconfig=ARRAY['search_path=pg_catalog, naijue_erp, pg_temp'] AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(f.prosrc,'UTF8')),'hex')='b6b3932264857c59998025cece6241a4e819b80f9bc72e6bf0ed4e907890cc65') AS validator_ok`);
  requireDomain(schema.rows.length===1 && schema.rows[0]!.column_ok===true && schema.rows[0]!.constraint_ok===true && schema.rows[0]!.triggers_ok===true && schema.rows[0]!.validator_ok===true, 'PRODUCT_SEASON_NOT_READY', 'Actual season array schema and enabled guards required');
  const write = await client.query(`/* ordinary27-product-write-contract */ SELECT
   NOT EXISTS(SELECT 1 FROM (VALUES
  ('guard_retained_catalogue_delete()','dec785b8b1f818b2daa3af4d3872139710cae32178516839e669f59aa6609758'),
  ('guard_retained_catalogue_reference()','91cc169d60ca6db2700ed97e49632504cfba9d957ea467a4777137f946c6923c'),
  ('guard_maintenance_before_root()','76d30c01785877cfab4bb2bf167e1cdcd583677d204b7d7efa0c2cc2c79fa05c'),
  ('validate_maintenance_root_commit()','bf853800c33c492dd0b8224e489c42dfb1c9a046231001a3d42be830a257f479'),
  ('guard_maintenance_child_write()','ceef464210d22280de7bc92ed900eebd3156ec65089ecdd8c55bbaca9c975d95'),
  ('guard_native_creation_identity()','765f060da0e51a0a18309502a412cc2196dcde633c3e9db0cbe4a2b6383d5111'),
  ('guard_maintenance_audit_actor()','1635b883d65abb3938b277287ff7b0b1bf28cdae367b54b282b3e81810486e89'),
  ('keep_barcode_binding_identity()','14f6d02bca58955681e8d03236fb236cbfe3d041d35ecdb326cd3fa7e38d2733')
 ) v(signature,sha) WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE p.oid=pg_catalog.to_regprocedure('naijue_erp.'||v.signature) AND p.prokind='f' AND p.provolatile='v' AND p.prosqlbody IS NULL AND p.pronargs=0 AND p.prorettype='trigger'::regtype AND NOT p.proretset AND NOT p.prosecdef AND p.proowner=n.nspowner AND l.lanname='plpgsql' AND p.proconfig=ARRAY['search_path=pg_catalog, naijue_erp, pg_temp'] AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')=v.sha)) AND NOT (NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgnargs=0 AND tgrelid='naijue_erp.product'::regclass AND tgname='product_maintenance_before_root' AND tgfoid='naijue_erp.guard_maintenance_before_root()'::regprocedure AND tgtype=23 AND tgenabled='O' AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr=''::int2vector)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgnargs=0 AND tgrelid='naijue_erp.product'::regclass AND tgname='product_maintenance_final_consistency' AND tgfoid='naijue_erp.validate_maintenance_root_commit()'::regprocedure AND tgtype=21 AND tgenabled='O' AND tgdeferrable AND tginitdeferred AND tgqual IS NULL AND tgattr=''::int2vector)

 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgnargs=0 AND tgrelid='naijue_erp.product'::regclass AND tgname='product_retained_delete' AND tgfoid='naijue_erp.guard_retained_catalogue_delete()'::regprocedure AND tgtype=31 AND tgenabled='O' AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr=''::int2vector)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgnargs=0 AND tgrelid='naijue_erp.product'::regclass AND tgname='product_retained_reference' AND tgfoid='naijue_erp.guard_retained_catalogue_reference()'::regprocedure AND tgtype=23 AND tgenabled='O' AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr=''::int2vector)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgnargs=0 AND tgrelid='naijue_erp.sku'::regclass AND tgname='sku_retained_reference' AND tgfoid='naijue_erp.guard_retained_catalogue_reference()'::regprocedure AND tgtype=23 AND tgenabled='O' AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr=''::int2vector)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgnargs=0 AND tgrelid='naijue_erp.sku'::regclass AND tgname='sku_maintenance_write' AND tgfoid='naijue_erp.guard_maintenance_child_write()'::regprocedure AND tgtype=31 AND tgenabled='O' AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr=''::int2vector)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgnargs=0 AND tgrelid='naijue_erp.sku'::regclass AND tgname='sku_creation_identity' AND tgfoid='naijue_erp.guard_native_creation_identity()'::regprocedure AND tgtype=23 AND tgenabled='O' AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr=''::int2vector)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgnargs=0 AND tgrelid='naijue_erp.sku_barcode'::regclass AND tgname='barcode_maintenance_write' AND tgfoid='naijue_erp.guard_maintenance_child_write()'::regprocedure AND tgtype=31 AND tgenabled='O' AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr=''::int2vector)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgnargs=0 AND tgrelid='naijue_erp.sku_barcode'::regclass AND tgname='sku_barcode_retains_identity' AND tgfoid='naijue_erp.keep_barcode_binding_identity()'::regprocedure AND tgtype=27 AND tgenabled='O' AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr=''::int2vector)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgnargs=0 AND tgrelid='naijue_erp.audit_change'::regclass AND tgname='maintenance_audit_actor' AND tgfoid='naijue_erp.guard_maintenance_audit_actor()'::regprocedure AND tgtype=7 AND tgenabled='O' AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr=''::int2vector)) AS guards,
   EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE p.oid=pg_catalog.to_regprocedure('naijue_erp.reject_document_runtime_reference_id_update_v1()') AND p.prokind='f' AND NOT p.prosecdef AND NOT p.proretset AND p.pronargs=0 AND p.prorettype='trigger'::regtype AND p.proowner=n.nspowner AND l.lanname='plpgsql' AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')='c7eeff622fa4921991bae5b65c865402b3dbc3ee3fb310beafdf12b28dfddea6') AND NOT EXISTS(
 SELECT 1 FROM unnest(ARRAY['product_category','supplier','size_group','season','barcode_scheme','product_image']) tab(name)
 WHERE NOT pg_catalog.has_column_privilege(current_user,'naijue_erp.'||tab.name,'id','UPDATE') OR NOT EXISTS(
  SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=pg_catalog.to_regclass('naijue_erp.'||tab.name) AND t.tgname='document_runtime_reference_id_lock_only' AND t.tgfoid=pg_catalog.to_regprocedure('naijue_erp.reject_document_runtime_reference_id_update_v1()') AND t.tgtype=19 AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgnargs=0 AND t.tgqual IS NULL AND t.tgattr=(SELECT a.attnum::text::int2vector FROM pg_catalog.pg_attribute a WHERE a.attrelid=t.tgrelid AND a.attname='id' AND NOT a.attisdropped))) AS reference_guards,
   (SELECT coalesce(bool_and(pg_catalog.has_column_privilege(current_user,'naijue_erp.product',name,'INSERT')),false) FROM unnest(ARRAY['id','product_code','name','category_id','supplier_id','season_id','size_group_id','year','system_item_code','thickness','collar_pants_type','default_barcode_scheme_id','enabled','version','deleted_at','purchase_price','retail_price','wholesale5_price','wholesale6_price','wholesale7_price','wholesale8_price','wholesale9_price','wholesale10_price','minimum_price','season_ids']) name) AND
   (SELECT coalesce(bool_and(pg_catalog.has_column_privilege(current_user,'naijue_erp.product',name,'UPDATE')),false) FROM unnest(ARRAY['product_code','name','category_id','supplier_id','size_group_id','year','system_item_code','thickness','collar_pants_type','default_barcode_scheme_id','enabled','version','deleted_at','purchase_price','retail_price','wholesale5_price','wholesale6_price','wholesale7_price','wholesale8_price','wholesale9_price','wholesale10_price','minimum_price','season_ids']) name) AND
   (SELECT coalesce(bool_and(pg_catalog.has_column_privilege(current_user,'naijue_erp.sku',name,'INSERT')),false) FROM unnest(ARRAY['id','product_id','sku_code','color_id','fit_id','size_id','enabled','version','created_operation_id']) name) AND
   (SELECT coalesce(bool_and(pg_catalog.has_column_privilege(current_user,'naijue_erp.sku',name,'UPDATE')),false) FROM unnest(ARRAY['enabled','version']) name) AND
   (SELECT coalesce(bool_and(pg_catalog.has_column_privilege(current_user,'naijue_erp.sku_barcode',name,'INSERT')),false) FROM unnest(ARRAY['id','barcode','sku_id','barcode_kind','scheme_id','enabled']) name) AND
   (SELECT coalesce(bool_and(pg_catalog.has_column_privilege(current_user,'naijue_erp.sku_barcode',name,'UPDATE')),false) FROM unnest(ARRAY['enabled']) name) AS columns,
   EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attname='barcode' AND NOT a.attisdropped
     WHERE i.indrelid='naijue_erp.sku_barcode'::regclass AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum AND a.attcollation='pg_catalog."C"'::regcollation AND i.indcollation[0]=a.attcollation)
   AND EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attname='sku_id' AND NOT a.attisdropped
     WHERE i.indrelid='naijue_erp.sku_barcode'::regclass AND c.relname='sku_barcode_one_current_main' AND i.indisunique AND i.indisvalid AND i.indisready AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum AND pg_catalog.pg_get_expr(i.indpred,i.indrelid)='(enabled AND (barcode_kind = ''MAIN''::text))') AS indexes`);
  requireDomain(write.rows.length===1 && write.rows[0]!.guards===true && write.rows[0]!.reference_guards===true && write.rows[0]!.columns===true && write.rows[0]!.indexes===true, 'PRODUCT_MAINTENANCE_NOT_READY', 'Actual product write guards and column permissions required');
  maintenanceContextClient(context, issued.pool);
}

/** Uses published business audit rows on the exact active runtime lease. Product
 * load already holds the transaction advisory lock and product/child row locks.
 * Database uniqueness constraints remain the final arbiter for cross-product
 * barcode races. This does not establish permissions or install triggers. */
export function createOrdinary27ProductCapacityFactory(pool: PgSalesPool, runtime: Runtime27CommandCapability): ProductCapacityFactory {
  assertIssuedRuntime27Pool(runtime, pool);
  const contexts = new WeakMap<object, (completion: MaintenanceCompletion) => Promise<void>>();
  const factory: ProductCapacityFactory = context => {
    const client = maintenanceContextClient(context, pool);
    const prior = contexts.get(context); if (prior) return prior;
    let admitted: string | undefined, busy = false, failed = false;
    const ready = async () => { await assertOrdinary27ProductContext(factory, context); };
    const invoke = async (input: MaintenanceCompletion) => {
      requireDomain(!busy && !failed, 'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Product admission scope busy or failed'); busy = true;
      try {
        const p = safeStandard27CapacitySnapshot(input) as MaintenanceCompletion;
        entityId('product', p.targetId);
        requireDomain(p.kind === 'PRODUCT' && ['CREATE','EDIT','DISABLE','RESTORE','DELETE'].includes(p.action) && p.newVersion === (p.oldVersion ?? 0) + 1 && (p.action === 'CREATE' ? p.oldVersion === null && p.beforeValues === null : p.oldVersion !== null && p.beforeValues !== null), 'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Exact product maintenance completion required');
        const fingerprint = requestHash(p);
        if (admitted) { requireDomain(admitted === fingerprint, 'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Admitted operation cannot change'); await ready(); return; }
        await ready();
        const result = await client.query(`/* ordinary27-product-history */ SELECT count(*)::text AS count,
          coalesce(sum(octet_length('[' || coalesce(before_values::text,'null') || ',' || coalesce(after_values::text,'null') || ']')),0)::text AS bytes
          FROM (SELECT before_values,after_values FROM naijue_erp.audit_change WHERE object_type='PRODUCT' AND object_id=$1::uuid LIMIT 1025) history`, [p.targetId]);
        const row = result.rows[0];
        requireDomain(result.rows.length === 1 && typeof row?.count === 'string' && /^\d+$/.test(row.count) && typeof row.bytes === 'string' && /^\d+$/.test(row.bytes), 'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Exact bounded audit summary required');
        const count = Number(row.count), bytes = Number(row.bytes);
        requireDomain(Number.isSafeInteger(count) && Number.isSafeInteger(bytes), 'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Audit summary exceeds numeric bounds');
        assertProductEvidencePendingCapacity({count, bytes}, p.beforeValues, p.afterValues);
        await ready(); admitted = fingerprint;
        bindMaintenanceProductGuard(context, pool, async () => { requireDomain(!failed && !busy, 'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Product admission scope failed'); assertMaintenanceProductCompletion(context, pool, fingerprint); await ready(); });
      } catch (error) { failed = true; throw error; } finally { busy = false; }
    };
    contexts.set(context, invoke); return invoke;
  };
  issuedFactories.set(factory, {pool, runtime}); return factory;
}
