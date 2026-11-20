/** Fixed negative admission prerequisite, not a complete privileged-function
 * closure. It must never be treated as source provenance or sole capacity
 * authority. It rejects the known import entry surface through effective
 * privileges (including PUBLIC), RESET ROLE/session identity, inherited rights
 * and SET ROLE paths. All overloads of the listed names are checked.
 * Unknown wrappers, dynamic SQL, extension/native code, external users and
 * concurrent catalog changes still require independent exact closure review.
 * No caller allowlist, expected boolean or runtime configuration is accepted.
 * This SQL has not been parsed/executed on PostgreSQL in this source pass. */
export const STANDARD27_PRODUCT_IMPORT_PRIVILEGE_BOUNDARY_SQL = `
/* standard27-product:import-privilege-boundary */ WITH
 gateways(name,required_signature) AS (VALUES
 ('standard_import_command','naijue_erp.standard_import_command(jsonb,text,text)'),
 ('standard_initialize_current_admin','naijue_erp.standard_initialize_current_admin(jsonb,text)'),
 ('standard_import_master_chunk','naijue_erp.standard_import_master_chunk(jsonb,text)'),
 ('standard_import_baseline_keys','naijue_erp.standard_import_baseline_keys(jsonb,text)'),
 ('standard_import_document_chunk','naijue_erp.standard_import_document_chunk(jsonb,text)'),
 ('standard_publish_import','naijue_erp.standard_publish_import(jsonb,text)'),
 ('standard_import_status',NULL),('standard_import_inspect_target',NULL),('standard_import_verify',NULL),
 ('standard_whole_package_command_v2',NULL),('standard_whole_package_prepare_v2',NULL),
 ('standard_whole_package_step_v2',NULL),('standard_whole_package_finish_v2',NULL),
 ('standard_whole_package_inspect_v2',NULL),('standard_whole_package_verify_v2',NULL)),
 reachable AS MATERIALIZED (SELECT r.* FROM pg_catalog.pg_roles r WHERE
  r.rolname IN (current_user,session_user) OR pg_catalog.pg_has_role(session_user,r.oid,'SET')
  OR pg_catalog.pg_has_role(session_user,r.oid,'USAGE') OR pg_catalog.pg_has_role(current_user,r.oid,'USAGE')
  ORDER BY r.oid LIMIT 257),
 routines AS MATERIALIZED (SELECT p.* FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  JOIN gateways g ON p.proname=g.name WHERE n.nspname='naijue_erp'),
 source_helpers(signature,sha,result_type,language,volatility,strict,definer,config,public_entry) AS (VALUES
 ('naijue_erp.standard_business_ready()','4f6893cc5ef4bbee1bd74d08435763fb3bfabf7dc5888ee72f03cf3387e412db','boolean','sql','s',false,true,ARRAY['search_path=pg_catalog, naijue_erp'],true),
 ('naijue_erp.standard_import_row_intent(text,jsonb)','df6adcf79b1922517e68d0cf22e0f8cb2fe375aeca41f1f699087cef844677bd','boolean','plpgsql','s',false,true,ARRAY['search_path=pg_catalog, naijue_erp','TimeZone=UTC'],true),
 ('naijue_erp.standard_inventory_key_proof(uuid,uuid)','687848f69a5ca3e139c35aafc9b9be8c31cd23f9d70a07cb34d4bde9021d7d66','jsonb','plpgsql','s',false,true,ARRAY['search_path=pg_catalog, naijue_erp','TimeZone=UTC'],true),
 ('naijue_erp.standard_import_record_proof(uuid)','60a84418cef1b166555c9a56a5503397eea04b4c753122de00c4a254d7d5c241','jsonb','plpgsql','s',false,true,ARRAY['search_path=pg_catalog, naijue_erp','TimeZone=UTC'],false),
 ('naijue_erp.standard_inventory_key_id(uuid,uuid)','370852266a17d0c3797b1fb5d704c281c4418a99c3be0faf1bd7796ed7815720','uuid','sql','i',true,false,ARRAY['search_path=pg_catalog, naijue_erp'],true),
 ('naijue_erp.valid_product_season_ids(uuid[])','b6b3932264857c59998025cece6241a4e819b80f9bc72e6bf0ed4e907890cc65','boolean','sql','i',false,false,ARRAY['search_path=pg_catalog, naijue_erp'],true),
 ('naijue_erp.maintenance_action_allowed(text,text)','186f88822ba597874734cb3349d0b9d95f63e5f8d8a34d3d05014e3420033c17','boolean','sql','i',false,false,ARRAY['search_path=pg_catalog, naijue_erp'],true),
 ('naijue_erp.valid_history_counts(jsonb)','6c143e2bf81bcd53e2c9074aa2ab4e1781c746bc7a99bb0064f378f77de80280','boolean','sql','i',false,false,NULL::text[],true)),
 provenance_relations AS MATERIALIZED (SELECT c.* FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='naijue_erp' AND c.relname IN ('import_batch','import_record','audit_change','operation_receipt')),
 writable_relations AS MATERIALIZED (SELECT c.* FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p','v','m','f') AND EXISTS(
   SELECT 1 FROM reachable r WHERE
    EXISTS(SELECT 1 FROM (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('MAINTAIN')) v(privilege)
      WHERE pg_catalog.has_table_privilege(r.oid,c.oid,v.privilege))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a CROSS JOIN (VALUES ('INSERT'),('UPDATE')) v(privilege)
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND pg_catalog.has_column_privilege(r.oid,c.oid,a.attnum,v.privilege)))
  ORDER BY c.oid LIMIT 2049),
 readable_relations AS MATERIALIZED (SELECT c.* FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p','v','m','f') AND EXISTS(
   SELECT 1 FROM reachable r WHERE pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      AND pg_catalog.has_column_privilege(r.oid,c.oid,a.attnum,'SELECT')))
  ORDER BY c.oid LIMIT 4097),
 accessible_relations AS MATERIALIZED (SELECT c.* FROM pg_catalog.pg_class c WHERE c.oid IN
   (SELECT oid FROM writable_relations UNION SELECT oid FROM readable_relations)),
 expression_roots AS MATERIALIZED (SELECT classid,objid FROM (
  SELECT 'pg_catalog.pg_attrdef'::regclass AS classid,d.oid AS objid FROM pg_catalog.pg_attrdef d JOIN accessible_relations c ON c.oid=d.adrelid
  UNION SELECT 'pg_catalog.pg_constraint'::regclass,k.oid FROM pg_catalog.pg_constraint k JOIN accessible_relations c ON c.oid=k.conrelid WHERE k.contype='c'
  UNION SELECT 'pg_catalog.pg_policy'::regclass,p.oid FROM pg_catalog.pg_policy p JOIN accessible_relations c ON c.oid=p.polrelid
  UNION SELECT 'pg_catalog.pg_class'::regclass,i.indexrelid FROM pg_catalog.pg_index i JOIN accessible_relations c ON c.oid=i.indrelid
 ) expressions ORDER BY classid,objid LIMIT 8193),
 required_missing AS (SELECT 1 FROM gateways WHERE required_signature IS NOT NULL AND pg_catalog.to_regprocedure(required_signature) IS NULL)
 SELECT (SELECT count(*) BETWEEN 1 AND 256 FROM reachable)
  AND NOT EXISTS(SELECT 1 FROM required_missing)
  AND (SELECT count(*) FROM provenance_relations)=4
  -- Negative indirect-route filters, not a dependency graph proof. Ordinary
  -- invoker SQL/PLpgSQL trigger bodies, defaults/checks/types and system-native
  -- routines still require an independently pinned and reviewed closure.
  AND (SELECT count(*) FROM writable_relations)<=2048
  -- SELECT-only views, foreign reads and custom conversion types can introduce
  -- execution paths without a direct write grant. Refuse those classes too.
  AND (SELECT count(*) FROM readable_relations)<=4096
  AND (SELECT count(*) FROM accessible_relations)<=4096
  -- Exact method identities used by this source cohort, not arbitrary extension handlers.
  AND NOT EXISTS(SELECT 1 FROM accessible_relations c LEFT JOIN pg_catalog.pg_am a ON a.oid=c.relam
    WHERE a.amname IS DISTINCT FROM 'heap' OR a.amhandler IS DISTINCT FROM pg_catalog.to_regprocedure('pg_catalog.heap_tableam_handler(internal)'))
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN accessible_relations c ON c.oid=i.indrelid
    JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid LEFT JOIN pg_catalog.pg_am a ON a.oid=idx.relam
    WHERE (a.amname='btree' AND a.amhandler=pg_catalog.to_regprocedure('pg_catalog.bthandler(internal)')
      OR a.amname='gin' AND a.amhandler=pg_catalog.to_regprocedure('pg_catalog.ginhandler(internal)')) IS NOT TRUE)
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN accessible_relations c ON c.oid=i.indrelid
    CROSS JOIN LATERAL unnest(i.indclass::oid[]) cls(oid)
    LEFT JOIN pg_catalog.pg_opclass opc ON opc.oid=cls.oid LEFT JOIN pg_catalog.pg_namespace opcn ON opcn.oid=opc.opcnamespace
    LEFT JOIN pg_catalog.pg_opfamily fam ON fam.oid=opc.opcfamily LEFT JOIN pg_catalog.pg_namespace fn ON fn.oid=fam.opfnamespace
    WHERE (opcn.nspname='pg_catalog' AND fn.nspname='pg_catalog') IS NOT TRUE
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_amproc ap LEFT JOIN pg_catalog.pg_proc p ON p.oid=ap.amproc LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
        WHERE ap.amprocfamily=fam.oid AND pn.nspname IS DISTINCT FROM 'pg_catalog')
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_amop ao LEFT JOIN pg_catalog.pg_operator o ON o.oid=ao.amopopr LEFT JOIN pg_catalog.pg_namespace onsp ON onsp.oid=o.oprnamespace
        LEFT JOIN pg_catalog.pg_proc p ON p.oid=o.oprcode LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
        WHERE ao.amopfamily=fam.oid AND (onsp.nspname IS DISTINCT FROM 'pg_catalog' OR pn.nspname IS DISTINCT FROM 'pg_catalog')))
  -- No implicit cascading mutation of another relation through internal FK triggers.
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint k JOIN accessible_relations c ON c.oid=k.confrelid
    WHERE k.contype='f' AND (k.confupdtype NOT IN ('a','r') OR k.confdeltype NOT IN ('a','r')))
  -- pg_depend omits pinned built-ins and does not parse dynamic/literal function
  -- bodies. This only rejects unreviewed recorded expression dependencies.
  AND (SELECT count(*) FROM expression_roots)<=8192
  AND NOT EXISTS(SELECT 1 FROM expression_roots e JOIN pg_catalog.pg_depend d ON d.classid=e.classid AND d.objid=e.objid
    WHERE (d.refclassid='pg_catalog.pg_proc'::regclass AND NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.oid=d.refobjid
        AND (n.nspname='pg_catalog' OR EXISTS(SELECT 1 FROM source_helpers h WHERE p.oid=pg_catalog.to_regprocedure(h.signature)
          AND h.signature IN ('naijue_erp.standard_business_ready()','naijue_erp.valid_product_season_ids(uuid[])','naijue_erp.maintenance_action_allowed(text,text)','naijue_erp.valid_history_counts(jsonb)')))))
      OR (d.refclassid='pg_catalog.pg_operator'::regclass AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_operator o JOIN pg_catalog.pg_namespace n ON n.oid=o.oprnamespace
        JOIN pg_catalog.pg_proc p ON p.oid=o.oprcode JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace WHERE o.oid=d.refobjid AND n.nspname='pg_catalog' AND pn.nspname='pg_catalog'))
      OR (d.refclassid='pg_catalog.pg_type'::regclass AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE t.oid=d.refobjid AND n.nspname='pg_catalog'))
      OR (d.refclassid='pg_catalog.pg_collation'::regclass AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_collation col JOIN pg_catalog.pg_namespace n ON n.oid=col.collnamespace WHERE col.oid=d.refobjid AND n.nspname='pg_catalog')))
  AND NOT EXISTS(SELECT 1 FROM accessible_relations c WHERE c.relkind <> 'r'
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid))
  AND NOT EXISTS(SELECT 1 FROM accessible_relations c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    JOIN pg_catalog.pg_type t ON t.oid=a.atttypid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace
    WHERE tn.nspname <> 'pg_catalog' OR t.typtype <> 'b'
      OR (t.typelem<>0 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_type e JOIN pg_catalog.pg_namespace en ON en.oid=e.typnamespace
        WHERE e.oid=t.typelem AND en.nspname='pg_catalog' AND e.typtype='b')))
  AND NOT EXISTS(SELECT 1 FROM accessible_relations c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    JOIN pg_catalog.pg_collation col ON col.oid=a.attcollation JOIN pg_catalog.pg_namespace cn ON cn.oid=col.collnamespace
    WHERE cn.nspname <> 'pg_catalog')
  AND NOT EXISTS(SELECT 1 FROM writable_relations c WHERE c.relkind <> 'r'
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_rewrite w WHERE w.ev_class=c.oid AND w.ev_type <> '1'))
  AND NOT EXISTS(SELECT 1 FROM reachable r CROSS JOIN pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    AND l.lanname NOT IN ('sql','plpgsql')
    AND (pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') OR pg_catalog.pg_has_role(r.oid,p.proowner,'USAGE')))
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN writable_relations c ON c.oid=t.tgrelid
    JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_language l ON l.oid=p.prolang
    WHERE NOT t.tgisinternal AND (t.tgenabled <> 'O' OR p.prosecdef OR l.lanname NOT IN ('sql','plpgsql')))
  AND NOT EXISTS(SELECT 1 FROM reachable r JOIN pg_catalog.pg_roles dangerous ON pg_catalog.pg_has_role(r.oid,dangerous.oid,'USAGE')
    WHERE dangerous.rolname IN ('pg_read_server_files','pg_write_server_files','pg_execute_server_program','pg_signal_backend','pg_checkpoint','pg_maintain'))
  -- Provenance evidence is read-only except ordinary audit/receipt INSERT.
  -- Check both relation and column rights; a column grant bypasses a table-only check.
  AND NOT EXISTS(SELECT 1 FROM reachable r CROSS JOIN provenance_relations c
    CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege)
    WHERE NOT (c.relname IN ('audit_change','operation_receipt') AND v.privilege='INSERT')
      AND pg_catalog.has_table_privilege(r.oid,c.oid,v.privilege))
  AND NOT EXISTS(SELECT 1 FROM reachable r CROSS JOIN provenance_relations c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('REFERENCES')) v(privilege)
    WHERE NOT (c.relname IN ('audit_change','operation_receipt') AND v.privilege='INSERT')
      AND pg_catalog.has_column_privilege(r.oid,c.oid,a.attnum,v.privilege))
  AND NOT EXISTS(SELECT 1 FROM reachable r CROSS JOIN provenance_relations c WHERE pg_catalog.has_table_privilege(r.oid,c.oid,'INSERT WITH GRANT OPTION'))
  AND NOT EXISTS(SELECT 1 FROM reachable r CROSS JOIN provenance_relations c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE pg_catalog.has_column_privilege(r.oid,c.oid,a.attnum,'INSERT WITH GRANT OPTION'))
  -- Fixed V1 helper cohort, including private dependencies; V2 replacements
  -- deliberately fail until separately reviewed. Hashes identify code, not safety.
  AND NOT EXISTS(SELECT 1 FROM source_helpers h WHERE NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang
    WHERE p.oid=pg_catalog.to_regprocedure(h.signature) AND p.prokind='f' AND NOT p.proretset AND p.prosqlbody IS NULL
      AND p.pronargdefaults=0 AND p.provariadic=0 AND p.proowner=n.nspowner AND p.prorettype=pg_catalog.to_regtype(h.result_type)
      AND l.lanname=h.language AND p.provolatile::text=h.volatility AND p.proisstrict=h.strict AND p.prosecdef=h.definer AND (p.proconfig=h.config OR (p.proconfig IS NULL AND h.config IS NULL))
      AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')=h.sha))
  -- Unknown callable non-system definers are refused, not assumed read-only
  -- from their name or volatility. Built-in/native and indirect dependencies
  -- remain an independent catalog closure requirement.
  AND NOT EXISTS(SELECT 1 FROM reachable r CROSS JOIN pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND (pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') OR pg_catalog.pg_has_role(r.oid,p.proowner,'USAGE'))
      AND NOT EXISTS(SELECT 1 FROM source_helpers h WHERE h.public_entry AND p.oid=pg_catalog.to_regprocedure(h.signature)))
  -- ADMIN can mutate membership options even when SET/INHERIT are currently
  -- false. Reject its possession, not just currently reachable target roles.
  AND NOT EXISTS(SELECT 1 FROM reachable r JOIN pg_catalog.pg_auth_members m ON m.member=r.oid
    WHERE m.admin_option)
  AND NOT EXISTS(SELECT 1 FROM reachable r WHERE r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls
    OR pg_catalog.has_schema_privilege(r.oid,'naijue_erp','CREATE')
    OR pg_catalog.has_database_privilege(r.oid,pg_catalog.current_database(),'CREATE'))
  AND NOT EXISTS(SELECT 1 FROM reachable r CROSS JOIN routines p WHERE
    pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') OR p.proowner=r.oid OR pg_catalog.pg_has_role(r.oid,p.proowner,'USAGE'))
  AND NOT EXISTS(SELECT 1 FROM reachable r JOIN pg_catalog.pg_class c ON c.relowner=r.oid OR pg_catalog.pg_has_role(r.oid,c.relowner,'USAGE')
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp'
    AND c.relname=ANY(ARRAY['product','sku','sku_barcode','product_image','import_batch','import_record','operation_receipt','audit_change']))
 AS import_surface_closed`;
