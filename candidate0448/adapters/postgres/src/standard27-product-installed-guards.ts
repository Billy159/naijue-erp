/** Exact installed-candidate metadata prerequisite only. No installation or
 * authority is issued here. Both source candidates remain uninstallable and
 * the caller is the closed capacity issuer. A matching result cannot establish
 * complete writer reachability, catalog stability or actual concurrency safety.
 * Function hashes bind source bytes, not deployment approval. */
export const STANDARD27_PRODUCT_INSTALLED_GUARDS_SQL = `
/* standard27-product:installed-guards */ WITH
 expected_functions(signature,sha) AS (VALUES
 ('naijue_erp.serialize_standard27_product_writer_candidate()','d399bc683f939ac081d98af3b16f86b4e0fa83139447f9b91a218662fbd748e2'),
 ('naijue_erp.lock_standard27_product_provenance_candidate()','11f2a4cdf3028bc4585da48122c7b4e80ea964e61b5e9b8593ae6e2b6d8ccbb1')),
 expected_triggers(relation,name,signature,kind) AS (VALUES
 ('product','standard27_product_writer_serialization','naijue_erp.serialize_standard27_product_writer_candidate()',31),
 ('sku','standard27_product_writer_serialization','naijue_erp.serialize_standard27_product_writer_candidate()',31),
 ('sku_barcode','standard27_product_writer_serialization','naijue_erp.serialize_standard27_product_writer_candidate()',31),
 ('product_image','standard27_product_writer_serialization','naijue_erp.serialize_standard27_product_writer_candidate()',31),
 ('audit_change','standard27_product_writer_serialization','naijue_erp.serialize_standard27_product_writer_candidate()',31),
 ('operation_receipt','standard27_product_writer_serialization','naijue_erp.serialize_standard27_product_writer_candidate()',31),
 ('import_batch','standard27_product_provenance_barrier','naijue_erp.lock_standard27_product_provenance_candidate()',31),
 ('import_batch','standard27_product_provenance_barrier_truncate','naijue_erp.lock_standard27_product_provenance_candidate()',34),
 ('import_record','standard27_product_provenance_barrier','naijue_erp.lock_standard27_product_provenance_candidate()',31),
 ('import_record','standard27_product_provenance_barrier_truncate','naijue_erp.lock_standard27_product_provenance_candidate()',34),
 ('audit_change','standard27_product_provenance_barrier','naijue_erp.lock_standard27_product_provenance_candidate()',31),
 ('audit_change','standard27_product_provenance_barrier_truncate','naijue_erp.lock_standard27_product_provenance_candidate()',34),
 ('operation_receipt','standard27_product_provenance_barrier','naijue_erp.lock_standard27_product_provenance_candidate()',31),
 ('operation_receipt','standard27_product_provenance_barrier_truncate','naijue_erp.lock_standard27_product_provenance_candidate()',34)),
 unexpected_bindings AS (SELECT t.oid FROM pg_catalog.pg_trigger t
   JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE t.tgfoid IN (SELECT pg_catalog.to_regprocedure(signature) FROM expected_functions)
     AND NOT EXISTS(SELECT 1 FROM expected_triggers e WHERE n.nspname='naijue_erp' AND c.relname=e.relation
       AND t.tgname=e.name AND t.tgfoid=pg_catalog.to_regprocedure(e.signature)))
 SELECT (SELECT count(*) FROM expected_triggers)=14
  AND NOT EXISTS(SELECT 1 FROM expected_functions e WHERE NOT EXISTS(
   SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE p.oid=pg_catalog.to_regprocedure(e.signature)
    AND n.nspname='naijue_erp' AND p.proowner=n.nspowner AND p.prokind='f' AND p.pronargs=0 AND p.pronargdefaults=0
    AND p.provariadic=0 AND p.proargnames IS NULL AND p.proargmodes IS NULL AND p.proallargtypes IS NULL
    AND p.prorettype='pg_catalog.trigger'::regtype AND NOT p.proretset AND NOT p.proisstrict AND NOT p.prosecdef
    AND p.provolatile='v' AND p.proparallel='u' AND NOT p.proleakproof AND p.prosupport=0
    AND p.prosqlbody IS NULL AND l.lanname='plpgsql' AND p.proconfig=ARRAY['search_path=pg_catalog, naijue_erp, pg_temp']
    AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')=e.sha
    AND p.proacl IS NOT NULL
    AND (SELECT count(*)=1 AND bool_and(x.grantee=p.proowner AND x.grantor=p.proowner
      AND x.privilege_type='EXECUTE' AND NOT x.is_grantable) FROM pg_catalog.aclexplode(p.proacl) x)))
  AND NOT EXISTS(SELECT 1 FROM expected_triggers e WHERE NOT EXISTS(
   SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp' AND c.relname=e.relation
    AND c.relkind='r' AND c.relowner=n.nspowner AND t.tgname=e.name AND t.tgfoid=pg_catalog.to_regprocedure(e.signature)
    AND t.tgtype=e.kind AND t.tgenabled='O' AND NOT t.tgisinternal AND NOT t.tgdeferrable AND NOT t.tginitdeferred
    AND t.tgqual IS NULL AND t.tgattr=''::int2vector AND t.tgnargs=0 AND t.tgargs=''::bytea
    AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL AND t.tgparentid=0
    AND t.tgconstraint=0 AND t.tgconstrrelid=0 AND t.tgconstrindid=0))
  AND NOT EXISTS(SELECT 1 FROM unexpected_bindings)
 AS guards_present`;
