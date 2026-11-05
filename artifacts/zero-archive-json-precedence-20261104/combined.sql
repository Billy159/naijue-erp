-- UNINSTALLED COMBINED REVIEW CANDIDATE. Runtime admission REFUSED.
-- Contains 2 GRANT and 8 REVOKE statements; target-specific authorization required.
BEGIN;
-- UNINSTALLED SOURCE CANDIDATE ONLY. Not in the reviewed install/catalog cohort.
-- Requires independent review, new source/catalog pins and real PostgreSQL tests.
-- No roles, permissions, tables, triggers or existing migration files are changed.
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $predecessor$
DECLARE p record;
BEGIN
 SELECT * INTO STRICT p FROM pg_catalog.pg_proc
 WHERE oid='naijue_erp.standard_whole_package_closed_v2(uuid)'::regprocedure;
 IF p.proowner IS DISTINCT FROM current_user::regrole::oid
  OR p.proowner IS DISTINCT FROM (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp')
  OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM '71ef59766fc69b83dd6494352e4ca8a189d27a8f09fc881d3421574558823601'
  OR p.prosecdef IS DISTINCT FROM true
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, naijue_erp, pg_temp','TimeZone=UTC']
 THEN RAISE EXCEPTION 'WHOLE_CLOSURE_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
END $predecessor$;
CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_closed_v2(root_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $$
DECLARE root_a naijue_erp.audit_change%ROWTYPE; root_r naijue_erp.operation_receipt%ROWTYPE;
 a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
 init jsonb; previous jsonb:='{}'; last_status jsonb:='{}'; expected_ordinal integer:=0; ordinal integer; command_phase text;
 baseline_id uuid; documents_id uuid; final_result jsonb; rank integer; last_rank integer:=-1;
 baseline_sealed boolean:=false; documents_staged boolean:=false; documents_published boolean:=false;
BEGIN
 SELECT * INTO STRICT root_a FROM naijue_erp.audit_change WHERE operation_id=root_operation;
 SELECT * INTO STRICT root_r FROM naijue_erp.operation_receipt WHERE id=root_operation;
 init:=root_a.after_values->'request';baseline_id:=(init->>'batch_id')::uuid;documents_id:=(init->'payload'->>'document_batch_id')::uuid;
 IF root_a.after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM root_operation::text
  OR root_a.after_values->'whole_package_v2'->'ordinal' IS DISTINCT FROM '0'::jsonb
  OR root_r.action IS DISTINCT FROM 'IMPORT_INITIALIZE_CURRENT_ADMIN' OR baseline_id=documents_id
 THEN RAISE EXCEPTION 'WHOLE_ROOT_CONTEXT_INVALID' USING ERRCODE='23514'; END IF;
 FOR a IN SELECT * FROM naijue_erp.audit_change WHERE after_values->'whole_package_v2'->>'root_operation'=root_operation::text
   ORDER BY (after_values->'whole_package_v2'->>'ordinal')::integer LOOP
  ordinal:=(a.after_values->'whole_package_v2'->>'ordinal')::integer;
  IF ordinal IS DISTINCT FROM expected_ordinal THEN RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514'; END IF;
  IF ordinal>0 AND a.after_values->'whole_package_v2' IS DISTINCT FROM
    jsonb_build_object('root_operation',root_operation,'ordinal',ordinal) THEN
   RAISE EXCEPTION 'WHOLE_CHILD_MARKER_INVALID' USING ERRCODE='23514'; END IF;
  expected_ordinal:=expected_ordinal+1;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
  rank:=CASE a.after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 ELSE NULL END;
  command_phase:=CASE a.after_values->>'phase' WHEN 'BASELINE_SEAL' THEN 'PUBLISH' WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' WHEN 'DOCUMENT_STAGE' THEN 'DOCUMENTS' ELSE a.after_values->>'phase' END;
  IF rank IS NULL OR rank<last_rank OR (ordinal=0) IS DISTINCT FROM (rank=0)
   OR r.actor_account_id IS DISTINCT FROM root_r.actor_account_id OR r.status IS DISTINCT FROM 'COMMITTED'
   OR r.target_type IS DISTINCT FROM 'IMPORT' OR r.target_id NOT IN (baseline_id,documents_id)
   OR r.target_id IS DISTINCT FROM (CASE WHEN rank<=3 THEN baseline_id ELSE documents_id END)
   OR a.object_type IS DISTINCT FROM 'IMPORT' OR a.object_id IS DISTINCT FROM r.target_id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
   OR a.id IS DISTINCT FROM r.id OR a.action IS DISTINCT FROM r.action OR a.occurred_at IS DISTINCT FROM root_r.completed_at OR r.completed_at IS DISTINCT FROM root_r.completed_at
   OR a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1' OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
   OR a.after_values->'request'->>'namespace' IS DISTINCT FROM init->>'namespace'
   OR a.after_values->'request'->>'plan_sha256' IS DISTINCT FROM init->>'plan_sha256'
   OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM init->>'package_manifest_sha256'
   OR a.after_values->'request'->>'cutoff_at' IS DISTINCT FROM init->>'cutoff_at'
   OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
   OR (ordinal>0 AND r.request_hash IS DISTINCT FROM encode(sha256(convert_to(command_phase||':'||(a.after_values->'request')::text,'UTF8')),'hex'))
   OR a.before_values IS DISTINCT FROM previous->(r.target_id::text)
   OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1
  THEN RAISE EXCEPTION 'WHOLE_RECEIPT_CHAIN_INVALID' USING ERRCODE='23514'; END IF;
  -- A committed receipt must prove the whole lifecycle independently of the writer.
  -- MASTER/KEYS/DOCUMENTS chunks may repeat; boundary transitions may not.
  IF (rank=3 AND baseline_sealed) OR (rank>3 AND NOT baseline_sealed)
   OR (rank=4 AND documents_staged) OR (rank>4 AND NOT documents_staged)
   OR documents_published THEN
   RAISE EXCEPTION 'WHOLE_SINGLETON_PHASE_INVALID' USING ERRCODE='23514'; END IF;
  baseline_sealed:=baseline_sealed OR rank=3;
  documents_staged:=documents_staged OR rank=4;
  documents_published:=documents_published OR rank=6;
  last_rank:=rank;previous:=jsonb_set(previous,ARRAY[r.target_id::text],a.after_values->'checkpoint');
  last_status:=jsonb_set(last_status,ARRAY[r.target_id::text],r.result_data->'status');final_result:=r.result_data;
 END LOOP;
 IF NOT baseline_sealed OR NOT documents_staged OR NOT documents_published
  OR last_rank<>6 OR expected_ordinal<4 OR (SELECT count(*) FROM jsonb_object_keys(previous))<>2 THEN
  RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 FOR b IN SELECT * FROM naijue_erp.import_batch WHERE id IN (baseline_id,documents_id) LOOP
  IF b.status IS DISTINCT FROM 'IMPORTED' OR last_status->>b.id::text IS DISTINCT FROM 'IMPORTED'
   OR b.checkpoint IS DISTINCT FROM previous->b.id::text OR b.checkpoint->'counts' IS DISTINCT FROM b.checkpoint->'expected'
   OR b.source_hash IS DISTINCT FROM init->>'package_manifest_sha256' OR b.source_name IS DISTINCT FROM init->>'namespace'
  THEN RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM naijue_erp.import_batch WHERE id IN (baseline_id,documents_id))<>2 THEN RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 RETURN final_result;
END $$;

-- UNINSTALLED SOURCE CANDIDATE ONLY. Not in the reviewed install/catalog cohort.
-- Requires independent review, new source/catalog pins and real PostgreSQL tests.
-- No roles, permissions, tables, triggers or existing migration files are changed.
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $predecessor$
DECLARE p record;
BEGIN
 SELECT * INTO STRICT p FROM pg_catalog.pg_proc
 WHERE oid='naijue_erp.standard_whole_package_closed_v2(uuid)'::regprocedure;
 IF p.proowner IS DISTINCT FROM current_user::regrole::oid
  OR p.proowner IS DISTINCT FROM (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp')
  OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM 'd445ccee97d806f1e6a878c6a224ab01a8fd9890b685bfc85df9a7a2ee512c38'
  OR p.prosecdef IS DISTINCT FROM true
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, naijue_erp, pg_temp','TimeZone=UTC']
 THEN RAISE EXCEPTION 'WHOLE_BATCH_CLOSURE_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
END $predecessor$;
CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_closed_v2(root_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $$
DECLARE root_a naijue_erp.audit_change%ROWTYPE; root_r naijue_erp.operation_receipt%ROWTYPE;
 a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
 init jsonb; previous jsonb:='{}'; last_status jsonb:='{}'; expected_ordinal integer:=0; ordinal integer; command_phase text;
 baseline_id uuid; documents_id uuid; final_result jsonb; rank integer; last_rank integer:=-1;
 baseline_sealed boolean:=false; documents_staged boolean:=false; documents_published boolean:=false;
BEGIN
 SELECT * INTO STRICT root_a FROM naijue_erp.audit_change WHERE operation_id=root_operation;
 SELECT * INTO STRICT root_r FROM naijue_erp.operation_receipt WHERE id=root_operation;
 init:=root_a.after_values->'request';baseline_id:=(init->>'batch_id')::uuid;documents_id:=(init->'payload'->>'document_batch_id')::uuid;
 IF root_a.after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM root_operation::text
  OR root_a.after_values->'whole_package_v2'->'ordinal' IS DISTINCT FROM '0'::jsonb
  OR root_r.action IS DISTINCT FROM 'IMPORT_INITIALIZE_CURRENT_ADMIN' OR baseline_id=documents_id
 THEN RAISE EXCEPTION 'WHOLE_ROOT_CONTEXT_INVALID' USING ERRCODE='23514'; END IF;
 FOR a IN SELECT * FROM naijue_erp.audit_change WHERE after_values->'whole_package_v2'->>'root_operation'=root_operation::text
   ORDER BY (after_values->'whole_package_v2'->>'ordinal')::integer LOOP
  ordinal:=(a.after_values->'whole_package_v2'->>'ordinal')::integer;
  IF ordinal IS DISTINCT FROM expected_ordinal THEN RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514'; END IF;
  IF ordinal>0 AND a.after_values->'whole_package_v2' IS DISTINCT FROM
    jsonb_build_object('root_operation',root_operation,'ordinal',ordinal) THEN
   RAISE EXCEPTION 'WHOLE_CHILD_MARKER_INVALID' USING ERRCODE='23514'; END IF;
  expected_ordinal:=expected_ordinal+1;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
  rank:=CASE a.after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 ELSE NULL END;
  command_phase:=CASE a.after_values->>'phase' WHEN 'BASELINE_SEAL' THEN 'PUBLISH' WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' WHEN 'DOCUMENT_STAGE' THEN 'DOCUMENTS' ELSE a.after_values->>'phase' END;
  IF rank IS NULL OR rank<last_rank OR (ordinal=0) IS DISTINCT FROM (rank=0)
   OR r.actor_account_id IS DISTINCT FROM root_r.actor_account_id OR r.status IS DISTINCT FROM 'COMMITTED'
   OR r.target_type IS DISTINCT FROM 'IMPORT' OR r.target_id NOT IN (baseline_id,documents_id)
   OR r.target_id IS DISTINCT FROM (CASE WHEN rank<=3 THEN baseline_id ELSE documents_id END)
   OR a.object_type IS DISTINCT FROM 'IMPORT' OR a.object_id IS DISTINCT FROM r.target_id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
   OR a.id IS DISTINCT FROM r.id OR a.action IS DISTINCT FROM r.action OR a.occurred_at IS DISTINCT FROM root_r.completed_at OR r.completed_at IS DISTINCT FROM root_r.completed_at
   OR a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1' OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
   OR a.after_values->'request'->>'namespace' IS DISTINCT FROM init->>'namespace'
   OR a.after_values->'request'->>'plan_sha256' IS DISTINCT FROM init->>'plan_sha256'
   OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM init->>'package_manifest_sha256'
   OR a.after_values->'request'->>'cutoff_at' IS DISTINCT FROM init->>'cutoff_at'
   OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
   OR (ordinal>0 AND r.request_hash IS DISTINCT FROM encode(sha256(convert_to(command_phase||':'||(a.after_values->'request')::text,'UTF8')),'hex'))
   OR a.before_values IS DISTINCT FROM previous->(r.target_id::text)
   OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1
  THEN RAISE EXCEPTION 'WHOLE_RECEIPT_CHAIN_INVALID' USING ERRCODE='23514'; END IF;
  -- A committed receipt must prove the whole lifecycle independently of the writer.
  -- MASTER/KEYS/DOCUMENTS chunks may repeat; boundary transitions may not.
  IF (rank=3 AND baseline_sealed) OR (rank>3 AND NOT baseline_sealed)
   OR (rank=4 AND documents_staged) OR (rank>4 AND NOT documents_staged)
   OR documents_published THEN
   RAISE EXCEPTION 'WHOLE_SINGLETON_PHASE_INVALID' USING ERRCODE='23514'; END IF;
  baseline_sealed:=baseline_sealed OR rank=3;
  documents_staged:=documents_staged OR rank=4;
  documents_published:=documents_published OR rank=6;
  last_rank:=rank;previous:=jsonb_set(previous,ARRAY[r.target_id::text],a.after_values->'checkpoint');
  last_status:=jsonb_set(last_status,ARRAY[r.target_id::text],r.result_data->'status');final_result:=r.result_data;
 END LOOP;
 IF NOT baseline_sealed OR NOT documents_staged OR NOT documents_published
  OR last_rank<>6 OR expected_ordinal<4 OR (SELECT count(*) FROM jsonb_object_keys(previous))<>2 THEN
  RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 FOR b IN SELECT * FROM naijue_erp.import_batch WHERE id IN (baseline_id,documents_id) LOOP
  -- Reconcile both batch identities and declared totals to the immutable INIT,
  -- not merely to mutually agreeing live checkpoint/count values.
  IF b.source_manifest_ref IS DISTINCT FROM init->'payload'->>'manifest_ref'
   OR b.cutoff_at IS DISTINCT FROM (init->>'cutoff_at')::timestamptz
   OR b.mapping_version IS DISTINCT FROM (CASE WHEN b.id=baseline_id THEN 'STANDARD_INITIAL_EXPLICIT_KEYS_V1' ELSE 'DOCUMENT_CONVERSION_V1' END)
   OR b.inventory_mode IS DISTINCT FROM (CASE WHEN b.id=baseline_id THEN 'CUTOFF_STOCK_BASELINE' ELSE 'DOCUMENT_CONVERSION' END)
   OR b.created_at IS DISTINCT FROM root_r.completed_at
   OR b.completed_at IS DISTINCT FROM root_r.completed_at
   OR b.checkpoint->'expected' IS DISTINCT FROM
     (CASE WHEN b.id=baseline_id THEN init->'payload'->'expected' ELSE init->'payload'->'expected_documents' END)
  THEN RAISE EXCEPTION 'WHOLE_BATCH_INITIALIZATION_BINDING_INVALID' USING ERRCODE='23514'; END IF;
  IF b.status IS DISTINCT FROM 'IMPORTED' OR last_status->>b.id::text IS DISTINCT FROM 'IMPORTED'
   OR b.checkpoint IS DISTINCT FROM previous->b.id::text OR b.checkpoint->'counts' IS DISTINCT FROM b.checkpoint->'expected'
   OR b.source_hash IS DISTINCT FROM init->>'package_manifest_sha256' OR b.source_name IS DISTINCT FROM init->>'namespace'
  THEN RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM naijue_erp.import_batch WHERE id IN (baseline_id,documents_id))<>2 THEN RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 RETURN final_result;
END $$;

-- SOURCE CANDIDATE ONLY. Not installed; not PostgreSQL parsed or validated.
-- Explicit historical-sales-source-v1 successor. Existing SQL files remain unchanged.
-- READY fields stay unchanged; CLEANED classification is offline provenance declaration,
-- never independent source truth. Compiler gates remain closed until reviewed integration.
-- Run only after the reviewed whole-package cohort and its search-path hardening.
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $historical_source_profile$
DECLARE
 spec jsonb := $source_profile_changes${"predecessor_sha256":"0d0547318a5a940639f288a73f08ebd9396b079b0c88810b7fa016870652d840","successor_sha256":"febd7953e7e14ffb5c7ed84705c02d71e152ec765db8bad12b132a574649b4f8","profile_sha256":"89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e","replacements":[{"before":"payload->>'schema_declarations_sha256' NOT IN ('e929e89fe7f026d10e6fd35af37d1eb48cd07db2f7da4eed76352e497b134cb9','7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a')","after":"payload->>'schema_declarations_sha256' NOT IN ('e929e89fe7f026d10e6fd35af37d1eb48cd07db2f7da4eed76352e497b134cb9','7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e')"},{"before":"('7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a')\n       THEN '^[A-Z356789]$'","after":"('7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e')\n       THEN '^[A-Z356789]$'"},{"before":"IF cfg->>'schema_declarations_sha256'='9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a' THEN","after":"IF cfg->>'schema_declarations_sha256' IN ('9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e') THEN"},{"before":"cfg->>'schema_declarations_sha256' IS DISTINCT FROM '9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a'","after":"coalesce(cfg->>'schema_declarations_sha256','') NOT IN ('9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e')"}]}$source_profile_changes$::jsonb;
 signature text := 'naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)';
 routine oid; before_body text; after_body text; definition text; change jsonb;
 before_meta jsonb; after_meta jsonb;
BEGIN
 routine:=pg_catalog.to_regprocedure(signature);
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO before_body,before_meta
 FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_body IS NULL OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'predecessor_sha256'
 THEN RAISE EXCEPTION 'HISTORY_SOURCE_PROFILE_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
 IF before_meta->>'prosecdef' IS DISTINCT FROM 'true'
  OR (before_meta->'proconfig' @> '["search_path=pg_catalog, naijue_erp, pg_temp"]'::jsonb) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'HISTORY_SOURCE_PROFILE_METADATA_UNSAFE' USING ERRCODE='55000'; END IF;
 definition:=pg_catalog.pg_get_functiondef(routine);after_body:=before_body;
 FOR change IN SELECT value FROM pg_catalog.jsonb_array_elements(spec->'replacements') LOOP
  IF coalesce(pg_catalog.length(change->>'before'),0)=0
   OR (pg_catalog.length(after_body)-pg_catalog.length(pg_catalog.replace(after_body,change->>'before','')))/pg_catalog.length(change->>'before')<>1
   OR (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,change->>'before','')))/pg_catalog.length(change->>'before')<>1
  THEN RAISE EXCEPTION 'HISTORY_SOURCE_PROFILE_ANCHOR_DIFFERS' USING ERRCODE='55000'; END IF;
  after_body:=pg_catalog.replace(after_body,change->>'before',change->>'after');
  definition:=pg_catalog.replace(definition,change->>'before',change->>'after');
 END LOOP;
 IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'HISTORY_SOURCE_PROFILE_OUTPUT_DIFFERS' USING ERRCODE='55000'; END IF;
 EXECUTE definition;
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO after_body,after_meta
 FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_meta IS DISTINCT FROM after_meta
  OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'HISTORY_SOURCE_PROFILE_POSTCONDITION_FAILED' USING ERRCODE='55000'; END IF;
END $historical_source_profile$;

-- SOURCE CANDIDATE ONLY. Not installed or PostgreSQL parsed/tested.
-- Preserve absence only in exact original SALE migration, never ordinary approval.
-- Known settlement mismatch still rejects. No data or receipt is manufactured.
-- Requires independently reviewed whole-package cohort and search-path hardening.
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $historical_missing_settlement$
DECLARE
 spec jsonb := $source_changes${"predecessor_sha256":"149111d2da2a62f37a65578f76af7fddc156bbf3e8797e13c653d8481d294b21","successor_sha256":"fc876ce73e260cd690205d1297cbac71649ae4b2fb81d88784d260e1e2ff1f86","migration_proof_sha256":"2bed9652283f7bd640c45e16f5ac820369022f249da60678123271a649c2a9c8","replacements":[{"before":"total numeric; evidence","after":"total numeric; settlement_count bigint; preserve_missing_original boolean := false; evidence"},{"before":"SELECT coalesce(sum(CASE direction WHEN 'RECEIVE' THEN amount ELSE -amount END),0) INTO total","after":"SELECT coalesce(sum(CASE direction WHEN 'RECEIVE' THEN amount ELSE -amount END),0),count(*) INTO total,settlement_count"},{"before":" -- Preserve unresolved original amounts/status in CLEANED plus exceptions;\n -- never fabricate settlement rows or admit an unbalanced APPROVED target.\n -- DRAFT remains allowed to be unbalanced. Migration does not bypass approval.\n IF h.status='APPROVED' AND total IS DISTINCT FROM h.net_due THEN","after":" -- Missing historical settlement evidence is not an inferred zero. Only exact\n -- original migration may preserve this absence; ordinary approval stays strict.\n IF evidence.action='MIGRATE_DOCUMENT' THEN\n  PERFORM naijue_erp.assert_document_migration(r.id);\n  preserve_missing_original:=h.business_type='SALE' AND h.stock_basis='CUTOFF_HISTORY' AND settlement_count=0\n   AND evidence.after_values->'settlements'='[]'::jsonb;\n END IF;\n IF h.status='APPROVED' AND preserve_missing_original IS NOT TRUE AND total IS DISTINCT FROM h.net_due THEN"}]}$source_changes$::jsonb;
 signature text := 'naijue_erp.validate_sales_settlement()';
 routine oid; before_body text; after_body text; definition text; change jsonb;
 before_meta jsonb; after_meta jsonb;
BEGIN
 routine:=pg_catalog.to_regprocedure(signature);
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO before_body,before_meta
 FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_body IS NULL OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'predecessor_sha256'
 THEN RAISE EXCEPTION 'MISSING_SETTLEMENT_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
 IF before_meta->>'prosecdef' IS DISTINCT FROM 'false'
  OR (before_meta->'proconfig' @> '["search_path=pg_catalog, naijue_erp, pg_temp"]'::jsonb) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'MISSING_SETTLEMENT_METADATA_UNSAFE' USING ERRCODE='55000'; END IF;
 IF (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex') FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('naijue_erp.assert_document_migration(uuid)')) IS DISTINCT FROM spec->>'migration_proof_sha256'
 THEN RAISE EXCEPTION 'MISSING_SETTLEMENT_PROOF_DIFFERS' USING ERRCODE='55000'; END IF;
 definition:=pg_catalog.pg_get_functiondef(routine);after_body:=before_body;
 FOR change IN SELECT value FROM pg_catalog.jsonb_array_elements(spec->'replacements') LOOP
  IF coalesce(pg_catalog.length(change->>'before'),0)=0
   OR (pg_catalog.length(after_body)-pg_catalog.length(pg_catalog.replace(after_body,change->>'before','')))/pg_catalog.length(change->>'before')<>1
   OR (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,change->>'before','')))/pg_catalog.length(change->>'before')<>1
  THEN RAISE EXCEPTION 'MISSING_SETTLEMENT_ANCHOR_DIFFERS' USING ERRCODE='55000'; END IF;
  after_body:=pg_catalog.replace(after_body,change->>'before',change->>'after');
  definition:=pg_catalog.replace(definition,change->>'before',change->>'after');
 END LOOP;
 IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'MISSING_SETTLEMENT_OUTPUT_DIFFERS' USING ERRCODE='55000'; END IF;
 EXECUTE definition;
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO after_body,after_meta
 FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_meta IS DISTINCT FROM after_meta
  OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'MISSING_SETTLEMENT_POSTCONDITION_FAILED' USING ERRCODE='55000'; END IF;
END $historical_missing_settlement$;

-- Versioned isolated-install companion V1. No function body or trigger changes.
-- Exact source cohort only; failure rolls back this reduction with the caller's transaction.
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $restoration_acl_hardening$
DECLARE
 item jsonb; p record; snapshots jsonb:='{}'::jsonb; trigger_snapshots jsonb:='{}'::jsonb;
 expected jsonb:='[{"signature":"naijue_erp.validate_sales_settlement()","sha256":"fc876ce73e260cd690205d1297cbac71649ae4b2fb81d88784d260e1e2ff1f86"},{"signature":"naijue_erp.reject_immutable_change()","sha256":"3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c"}]'::jsonb;
BEGIN
 FOR item IN SELECT value FROM jsonb_array_elements(expected) LOOP
  SELECT * INTO STRICT p FROM pg_catalog.pg_proc WHERE oid=to_regprocedure(item->>'signature');
  IF p.proowner<>current_user::regrole::oid OR p.pronamespace<>'naijue_erp'::regnamespace::oid
   OR p.proowner<>(SELECT nspowner FROM pg_catalog.pg_namespace WHERE oid=p.pronamespace)
   OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM item->>'sha256'
   OR p.prosecdef OR p.prorettype<>'trigger'::regtype OR p.pronargs<>0 OR p.proargtypes::text<>''
   OR p.proallargtypes IS NOT NULL OR p.proargmodes IS NOT NULL OR p.proargnames IS NOT NULL
   OR p.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
   OR p.prokind<>'f' OR p.provolatile<>'v' OR p.proretset OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u'
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, naijue_erp, pg_temp']
   OR p.procost<>100 OR p.prorows<>0 OR p.prosupport<>0
   OR p.proacl IS NOT NULL
  THEN RAISE EXCEPTION 'RESTORATION_ACL_PREDECESSOR_DIFFERS: %',item->>'signature' USING ERRCODE='55000'; END IF;
  snapshots:=snapshots||jsonb_build_object(item->>'signature',to_jsonb(p)-'proacl');
  trigger_snapshots:=trigger_snapshots||jsonb_build_object(item->>'signature',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]'::jsonb) FROM pg_catalog.pg_trigger t WHERE t.tgfoid=p.oid));
 END LOOP;
 REVOKE EXECUTE ON FUNCTION naijue_erp.validate_sales_settlement() FROM PUBLIC;
 REVOKE EXECUTE ON FUNCTION naijue_erp.reject_immutable_change() FROM PUBLIC;
 FOR item IN SELECT value FROM jsonb_array_elements(expected) LOOP
  SELECT * INTO STRICT p FROM pg_catalog.pg_proc WHERE oid=to_regprocedure(item->>'signature');
  IF (to_jsonb(p)-'proacl') IS DISTINCT FROM snapshots->(item->>'signature')
   OR (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]'::jsonb) FROM pg_catalog.pg_trigger t WHERE t.tgfoid=p.oid) IS DISTINCT FROM trigger_snapshots->(item->>'signature')
   OR p.proacl IS NULL
   OR (SELECT count(*) FROM aclexplode(p.proacl))<>1
   OR NOT EXISTS(SELECT 1 FROM aclexplode(p.proacl) acl WHERE acl.grantee=p.proowner AND acl.grantor=p.proowner AND acl.privilege_type='EXECUTE' AND NOT acl.is_grantable)
  THEN RAISE EXCEPTION 'RESTORATION_ACL_METADATA_DRIFT: %',item->>'signature' USING ERRCODE='55000'; END IF;
 END LOOP;
END $restoration_acl_hardening$;

-- SOURCE CANDIDATE ONLY. Not installed, PostgreSQL parsed, or DB accepted.
-- Exact unchanged original approved SALE restoration only. Any earlier economic
-- edit, even later reversed, remains unsupported and rejects. No row is created.
-- Requires the reviewed whole-package source-profile and missing-settlement
-- successors, exact hardened dependency cohort and existing immutable guards.
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $historical_original_restoration$
DECLARE
 spec jsonb := $source_changes${"predecessor_sha256":"fc876ce73e260cd690205d1297cbac71649ae4b2fb81d88784d260e1e2ff1f86","successor_sha256":"16dea25b6153d032e9f095e709d0f5e2fc8d583ad16806403eab83b6eeb60488","dependencies":[{"name":"assert_document_migration","signature":"naijue_erp.assert_document_migration(uuid)","source":"adapters/postgres/patches/0027_standard_import_initialization.sql","sha256":"2bed9652283f7bd640c45e16f5ac820369022f249da60678123271a649c2a9c8","security_definer":false},{"name":"unified_document_snapshot","signature":"naijue_erp.unified_document_snapshot(text,uuid)","source":"adapters/postgres/migrations/0027_unified_business_documents.sql","sha256":"5b5b17b5b977321452ebe545825c2df19527a9e0072cb9ed0ab3ec102e02e7ed","security_definer":false},{"name":"unified_sales_header_audit_values","signature":"naijue_erp.unified_sales_header_audit_values(naijue_erp.sales_header)","source":"adapters/postgres/migrations/0027_unified_business_documents.sql","sha256":"cb5c332b2f8aaf99cca4a7c24234060fb74d8990a9d1cac252d13862cc23e91d","security_definer":false},{"name":"validate_unified_ordinary_operation","signature":"naijue_erp.validate_unified_ordinary_operation()","source":"adapters/postgres/migrations/0027_unified_business_documents.sql","sha256":"4df5ec2f7c3a25d2461a56586f83f20d63773f01e6ca80b9c45429676a1969a4","security_definer":false},{"name":"validate_unified_sales_header_commit","signature":"naijue_erp.validate_unified_sales_header_commit()","source":"adapters/postgres/migrations/0027_unified_business_documents.sql","sha256":"a8ce6dd5da8e1098f097ffed58304b2ab857b5b576e4e868804f76d5018a6339","security_definer":false},{"name":"validate_unified_sales_line_commit","signature":"naijue_erp.validate_unified_sales_line_commit()","source":"adapters/postgres/migrations/0027_unified_business_documents.sql","sha256":"a31692ba5b18b9da6701ccd12d3101af1a5e85ba15b60e1e7150a6e4723d8ef5","security_definer":false},{"name":"validate_unified_sales_settlement_commit","signature":"naijue_erp.validate_unified_sales_settlement_commit()","source":"adapters/postgres/migrations/0027_unified_business_documents.sql","sha256":"d2da5c47e935406e114fc06a487f128fbbe7d370d9b204ac10df956cba7d9abd","security_definer":false},{"name":"guard_unified_document","signature":"naijue_erp.guard_unified_document()","source":"adapters/postgres/patches/0027_standard_import_initialization.sql","sha256":"fa51aa3c79074a829c685127f6638152e26def788d919c19eb38bfffcb50f961","security_definer":false},{"name":"validate_unified_baseline_reversal","signature":"naijue_erp.validate_unified_baseline_reversal()","source":"adapters/postgres/migrations/0027_unified_business_documents.sql","sha256":"e79f446269183dc9af235f7408344462e933f4ddd687231a671fc8b195923aed","security_definer":false},{"name":"standard_inventory_key_id","signature":"naijue_erp.standard_inventory_key_id(uuid,uuid)","source":"adapters/postgres/patches/0027_standard_import_initialization.sql","sha256":"370852266a17d0c3797b1fb5d704c281c4418a99c3be0faf1bd7796ed7815720","security_definer":false},{"name":"reject_immutable_change","signature":"naijue_erp.reject_immutable_change()","source":"adapters/postgres/migrations/0001_runtime_sales.sql","sha256":"3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c","security_definer":false},{"name":"standard_whole_package_command_v2","signature":"naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)","source":"adapters/postgres/patches/0027_historical_sales_source_profile_successor.sql","from_candidate":true,"sha256":"febd7953e7e14ffb5c7ed84705c02d71e152ec765db8bad12b132a574649b4f8","security_definer":true}],"triggers":[{"table":"operation_receipt","name":"immutable_receipt","function":"reject_immutable_change","type":27,"deferred":false},{"table":"audit_change","name":"immutable_audit","function":"reject_immutable_change","type":27,"deferred":false},{"table":"inventory_ledger","name":"immutable_ledger","function":"reject_immutable_change","type":27,"deferred":false},{"table":"import_record","name":"immutable_import_record","function":"reject_immutable_change","type":27,"deferred":false},{"table":"inventory_ledger","name":"baseline_reversal_source","function":"validate_unified_baseline_reversal","type":7,"deferred":false},{"table":"operation_receipt","name":"unified_ordinary_operation_consistency","function":"validate_unified_ordinary_operation","type":5,"deferred":true},{"table":"sales_header","name":"sales_cutoff_freeze","function":"guard_unified_document","type":31,"deferred":false},{"table":"sales_header","name":"unified_sales_header_command_consistency","function":"validate_unified_sales_header_commit","type":21,"deferred":true},{"table":"sales_line","name":"unified_sales_line_command_consistency","function":"validate_unified_sales_line_commit","type":21,"deferred":true},{"table":"sales_settlement","name":"unified_sales_settlement_command_consistency","function":"validate_unified_sales_settlement_commit","type":29,"deferred":true}],"replacements":[{"before":"r naijue_erp.operation_receipt%ROWTYPE;","after":"r naijue_erp.operation_receipt%ROWTYPE;\n origin_receipt naijue_erp.operation_receipt%ROWTYPE; origin_audit naijue_erp.audit_change%ROWTYPE;\n documents_batch naijue_erp.import_batch%ROWTYPE; baseline_batch naijue_erp.import_batch%ROWTYPE;\n source_record naijue_erp.import_record%ROWTYPE; source_receipt naijue_erp.operation_receipt%ROWTYPE; source_audit naijue_erp.audit_change%ROWTYPE;\n origin_snapshot jsonb; origin_header jsonb; current_snapshot jsonb; baseline_evidence jsonb; source_pointer jsonb; source_item jsonb; source_entry jsonb; source_request jsonb;\n cursor_header jsonb; actual_header jsonb; before_header jsonb; after_header jsonb; actual_effect_ids jsonb; receipt_effect_ids jsonb;\n mutable_header text[]; allowed_header text[]; field text; numeric_field text;\n proof_batch record; proof_target record; step record; origin_version integer; expected_version integer; previous_time timestamptz; previous_approval uuid;\n audit_count bigint; receipt_count bigint; effect_count bigint; expected_effects bigint;"},{"before":" IF h.status='APPROVED' AND preserve_missing_original IS NOT TRUE AND total IS DISTINCT FROM h.net_due THEN","after":"$RESTORATION_PROOF"}]}$source_changes$::jsonb;
 extension text := $restoration_proof$ -- A historical empty settlement set is UNKNOWN even when net_due is zero.
 -- This narrowly admits exact original restoration; it never certifies an edit
 -- and never invokes current-importer/current-actor checks against old events.
 IF h.status='APPROVED' AND h.stock_basis='CUTOFF_HISTORY' AND settlement_count=0 AND evidence.action<>'MIGRATE_DOCUMENT' THEN
  IF current_setting('session_replication_role') IS DISTINCT FROM 'origin' OR r.action IS DISTINCT FROM 'APPROVE' OR h.version<=1 THEN
   RAISE EXCEPTION 'HISTORICAL_ORIGINAL_RESTORATION_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT origin_receipt FROM naijue_erp.operation_receipt rr
   WHERE rr.target_type='SALES' AND rr.target_id=target AND rr.action='MIGRATE_DOCUMENT';
  SELECT * INTO STRICT origin_audit FROM naijue_erp.audit_change aa WHERE aa.operation_id=origin_receipt.id;
  origin_version:=origin_audit.new_version;
  origin_snapshot:=origin_audit.after_values-ARRAY['baseline','sourceRecordId'];
  origin_header:=origin_snapshot->'header';
  current_snapshot:=naijue_erp.unified_document_snapshot('SALES',target);
  IF origin_receipt.status IS DISTINCT FROM 'COMMITTED' OR origin_audit.object_type IS DISTINCT FROM 'SALES'
   OR origin_audit.object_id IS DISTINCT FROM target OR origin_audit.action IS DISTINCT FROM 'MIGRATE_DOCUMENT'
   OR origin_audit.actor_account_id IS DISTINCT FROM origin_receipt.actor_account_id
   OR origin_audit.occurred_at IS DISTINCT FROM origin_receipt.completed_at OR origin_version IS NULL OR origin_version<1 OR origin_version>=h.version
   OR origin_audit.old_version IS NOT NULL OR origin_audit.before_values IS NOT NULL
   OR jsonb_typeof(origin_snapshot) IS DISTINCT FROM 'object' OR origin_snapshot-ARRAY['header','lines','settlements'] IS DISTINCT FROM '{}'::jsonb
   OR jsonb_typeof(origin_header) IS DISTINCT FROM 'object' OR jsonb_typeof(origin_snapshot->'lines') IS DISTINCT FROM 'array'
   OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(origin_header) key) IS DISTINCT FROM
    (SELECT array_agg(attname::text ORDER BY attname) FROM pg_catalog.pg_attribute WHERE attrelid='naijue_erp.sales_header'::regclass AND attnum>0 AND NOT attisdropped)
   OR origin_snapshot->'settlements' IS DISTINCT FROM '[]'::jsonb
   OR origin_header->>'id' IS DISTINCT FROM target::text OR origin_header->'version' IS DISTINCT FROM to_jsonb(origin_version)
   OR origin_header->>'business_type' IS DISTINCT FROM 'SALE' OR origin_header->>'status' IS DISTINCT FROM 'APPROVED'
   OR origin_header->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'
   OR origin_receipt.result_data->>'operationId' IS DISTINCT FROM origin_receipt.id::text
   OR origin_receipt.result_data->>'salesId' IS DISTINCT FROM target::text
   OR origin_receipt.result_data->'version' IS DISTINCT FROM to_jsonb(origin_version)
   OR origin_receipt.result_data->>'status' IS DISTINCT FROM 'APPROVED'
   OR origin_receipt.result_data->'ledgerEntryIds' IS DISTINCT FROM '[]'::jsonb
   OR origin_receipt.result_data->>'exposureDigest' IS DISTINCT FROM encode(sha256(convert_to(origin_snapshot::text,'UTF8')),'hex')
   OR origin_receipt.result_data->'baseline' IS DISTINCT FROM origin_audit.after_values->'baseline'
   OR origin_receipt.result_data->>'sourceRecordId' IS DISTINCT FROM origin_audit.after_values->>'sourceRecordId'
   OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.operation_id=origin_receipt.id)
   OR EXISTS(SELECT 1 FROM naijue_erp.inventory_balance q WHERE q.last_operation_id=origin_receipt.id) THEN
   RAISE EXCEPTION 'RESTORATION_ORIGIN_INVALID' USING ERRCODE='23514'; END IF;
  -- Full physical line rows, including inactive/zero rows and nullable snapshots,
  -- retain exactly their original identities, order, prices and economics.
  mutable_header:=ARRAY['version','status','updated_at','approved_by_account_id','approved_by_staff_id','approved_at','note','responsible_staff_id'];
  IF current_snapshot->'lines' IS DISTINCT FROM origin_snapshot->'lines'
   OR current_snapshot->'settlements' IS DISTINCT FROM '[]'::jsonb
   OR ((current_snapshot->'header') - mutable_header) IS DISTINCT FROM (origin_header - mutable_header)
   OR jsonb_array_length(origin_snapshot->'lines')=0 THEN
   RAISE EXCEPTION 'RESTORATION_CURRENT_ROWS_DIFFER' USING ERRCODE='23514'; END IF;
  IF h.gross_amount IS DISTINCT FROM (SELECT sum(ln.line_amount) FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current)
   OR h.net_due IS DISTINCT FROM h.gross_amount-h.order_discount
   OR EXISTS(SELECT 1 FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current
    AND (ln.line_amount IS DISTINCT FROM ln.quantity::numeric*ln.deal_price OR ln.deal_price<0))
   OR (SELECT coalesce(sum(ln.allocated_discount),0) FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current)>h.order_discount
   OR (NOT EXISTS(SELECT 1 FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current AND ln.allocated_discount IS NULL)
    AND (SELECT sum(ln.allocated_discount) FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current) IS DISTINCT FROM h.order_discount) THEN
   RAISE EXCEPTION 'RESTORATION_KNOWN_ECONOMICS_DIFFER' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT documents_batch FROM naijue_erp.import_batch bb WHERE bb.id=h.import_batch_id;
  SELECT * INTO STRICT baseline_batch FROM naijue_erp.import_batch bb WHERE bb.id=(origin_audit.after_values->'baseline'->>'baselineBatchId')::uuid;
  baseline_evidence:=origin_audit.after_values->'baseline';
  IF documents_batch.inventory_mode IS DISTINCT FROM 'DOCUMENT_CONVERSION' OR documents_batch.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
   OR documents_batch.status IS DISTINCT FROM 'IMPORTED' OR baseline_batch.status IS DISTINCT FROM 'IMPORTED'
   OR baseline_batch.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE' OR baseline_batch.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR documents_batch.source_name IS DISTINCT FROM baseline_batch.source_name OR documents_batch.source_hash IS DISTINCT FROM baseline_batch.source_hash
   OR documents_batch.cutoff_at IS DISTINCT FROM baseline_batch.cutoff_at
   OR origin_header->>'import_batch_id' IS DISTINCT FROM documents_batch.id::text
   OR origin_receipt.result_data->>'batchId' IS DISTINCT FROM documents_batch.id::text
   OR baseline_evidence-ARRAY['state','baselineBatchId','baselineManifestSha256','cutoffAt','coverageDigest'] IS DISTINCT FROM '{}'::jsonb
   OR baseline_evidence->>'state' IS DISTINCT FROM 'CONFIRMED'
   OR baseline_evidence->>'baselineManifestSha256' IS DISTINCT FROM baseline_batch.source_hash
   OR (baseline_evidence->>'cutoffAt')::timestamptz IS DISTINCT FROM baseline_batch.cutoff_at
   OR (baseline_evidence->>'coverageDigest' ~ '^[0-9a-f]{64}$') IS NOT TRUE THEN
   RAISE EXCEPTION 'RESTORATION_BASELINE_INVALID' USING ERRCODE='23514'; END IF;
  -- Both complete publications must be real immutable standard-import events.
  FOR proof_batch IN SELECT documents_batch.id AS id, 'DOCUMENT_PUBLISH'::text AS phase, documents_batch.checkpoint AS checkpoint, documents_batch.completed_at AS completed_at
   UNION ALL SELECT baseline_batch.id,'BASELINE_SEAL',baseline_batch.checkpoint,baseline_batch.completed_at LOOP
   SELECT * INTO STRICT source_receipt FROM naijue_erp.operation_receipt rr WHERE rr.target_type='IMPORT' AND rr.target_id=proof_batch.id
    AND rr.action='IMPORT_PUBLISH' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1';
   SELECT * INTO STRICT source_audit FROM naijue_erp.audit_change aa WHERE aa.operation_id=source_receipt.id;
   source_request:=source_audit.after_values->'request';
   IF source_receipt.status IS DISTINCT FROM 'COMMITTED' OR source_audit.object_type IS DISTINCT FROM 'IMPORT'
    OR source_audit.object_id IS DISTINCT FROM proof_batch.id OR source_audit.action IS DISTINCT FROM source_receipt.action
    OR source_audit.actor_account_id IS DISTINCT FROM source_receipt.actor_account_id
    OR source_audit.occurred_at IS DISTINCT FROM source_receipt.completed_at OR source_receipt.completed_at IS DISTINCT FROM proof_batch.completed_at
    OR source_receipt.result_data->>'operationId' IS DISTINCT FROM source_receipt.id::text
    OR source_receipt.result_data->>'batchId' IS DISTINCT FROM proof_batch.id::text
    OR source_receipt.result_data->>'phase' IS DISTINCT FROM proof_batch.phase
    OR source_receipt.result_data->>'baselineBatchId' IS DISTINCT FROM baseline_batch.id::text
    OR source_receipt.result_data->>'documentBatchId' IS DISTINCT FROM documents_batch.id::text
    OR source_receipt.result_data->>'packageManifestSha256' IS DISTINCT FROM documents_batch.source_hash
    OR source_receipt.result_data->>'status' IS DISTINCT FROM 'IMPORTED' OR source_receipt.result_data->'ledgerEntryIds' IS DISTINCT FROM '[]'::jsonb
    OR source_audit.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
    OR source_audit.after_values->>'phase' IS DISTINCT FROM proof_batch.phase
    OR source_audit.after_values->'checkpoint' IS DISTINCT FROM proof_batch.checkpoint
    OR proof_batch.checkpoint->'counts' IS DISTINCT FROM proof_batch.checkpoint->'expected'
    OR source_request->>'operation_id' IS DISTINCT FROM source_receipt.id::text
    OR source_request->>'request_key' IS DISTINCT FROM source_receipt.request_key
    OR source_request->>'batch_id' IS DISTINCT FROM proof_batch.id::text
    OR source_request->>'namespace' IS DISTINCT FROM documents_batch.source_name
    OR source_request->>'package_manifest_sha256' IS DISTINCT FROM documents_batch.source_hash
    OR (source_request->>'cutoff_at')::timestamptz IS DISTINCT FROM documents_batch.cutoff_at
    OR source_receipt.request_hash IS DISTINCT FROM encode(sha256(convert_to('PUBLISH:'||source_request::text,'UTF8')),'hex')
    OR source_receipt.completed_at<origin_receipt.completed_at AND proof_batch.phase='DOCUMENT_PUBLISH'
    OR source_receipt.completed_at>r.completed_at THEN
    RAISE EXCEPTION 'RESTORATION_PUBLICATION_INVALID' USING ERRCODE='23514'; END IF;
  END LOOP;
  -- The original initializer pins this document cohort and coverage digest. Its
  -- recorded actor is historical evidence; present employment is irrelevant.
  SELECT * INTO STRICT source_receipt FROM naijue_erp.operation_receipt rr WHERE rr.target_type='IMPORT' AND rr.target_id=baseline_batch.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
  SELECT * INTO STRICT source_audit FROM naijue_erp.audit_change aa WHERE aa.operation_id=source_receipt.id;
  IF source_receipt.status IS DISTINCT FROM 'COMMITTED' OR source_audit.object_type IS DISTINCT FROM 'IMPORT'
   OR source_audit.object_id IS DISTINCT FROM baseline_batch.id OR source_audit.action IS DISTINCT FROM source_receipt.action
   OR source_audit.actor_account_id IS DISTINCT FROM source_receipt.actor_account_id OR source_audit.occurred_at IS DISTINCT FROM source_receipt.completed_at
   OR source_audit.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
   OR source_audit.after_values->'request'->>'batch_id' IS DISTINCT FROM baseline_batch.id::text
   OR source_audit.after_values->'request'->>'namespace' IS DISTINCT FROM documents_batch.source_name
   OR source_audit.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM documents_batch.source_hash
   OR source_audit.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM documents_batch.id::text
   OR source_audit.after_values->'request'->'payload'->>'alignment_sha256' IS DISTINCT FROM baseline_evidence->>'coverageDigest' THEN
   RAISE EXCEPTION 'RESTORATION_BASELINE_INVALID' USING ERRCODE='23514'; END IF;
  -- Inline read-only source proof: no new routine, definer or execution grant.
  -- All source records bind exact typed fields, request rows, locations, original
  -- source-reference arrays and recomputed immutable source hashes.
  FOR proof_target IN
   SELECT documents_batch.id AS batch_id,'SALES_HEADER'::text AS kind,target AS id,origin_header AS fields
   UNION ALL SELECT documents_batch.id,'SALES_LINE',(v->>'id')::uuid,v FROM jsonb_array_elements(origin_snapshot->'lines') v
   UNION ALL SELECT DISTINCT baseline_batch.id,'INVENTORY_KEY',naijue_erp.standard_inventory_key_id(h.warehouse_id,(v->>'sku_id')::uuid),
    jsonb_build_object('warehouse_id',h.warehouse_id,'sku_id',v->>'sku_id') FROM jsonb_array_elements(origin_snapshot->'lines') v
    WHERE v->'is_current'='true'::jsonb AND (v->>'quantity')::bigint<>0 LOOP
   SELECT * INTO STRICT source_record FROM naijue_erp.import_record ss WHERE ss.import_batch_id=proof_target.batch_id AND ss.target_type=proof_target.kind
    AND ss.target_id=proof_target.id AND ss.status='IMPORTED';
   source_pointer:=source_record.decision_reason::jsonb;
   IF source_pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',source_pointer->>'operationId')
    OR (source_pointer->>'operationId')::uuid IS NULL THEN
    RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
   SELECT * INTO STRICT source_receipt FROM naijue_erp.operation_receipt rr WHERE rr.id=(source_pointer->>'operationId')::uuid;
   SELECT * INTO STRICT source_audit FROM naijue_erp.audit_change aa WHERE aa.operation_id=source_receipt.id;
   SELECT value INTO STRICT source_item FROM jsonb_array_elements(source_audit.after_values->'records') value WHERE value->>'id'=source_record.id::text;
   source_request:=source_audit.after_values->'request';
   SELECT value INTO STRICT source_entry FROM jsonb_array_elements(source_request->'payload'->'rows') value WHERE value->>'record_id'=source_record.id::text;
   IF source_record.source_system IS DISTINCT FROM documents_batch.source_name OR source_record.reviewed_at IS NULL
    OR source_record.source_entity_type IS DISTINCT FROM (CASE proof_target.kind WHEN 'INVENTORY_KEY' THEN 'INVENTORY_BASELINE' ELSE proof_target.kind END)
    OR source_receipt.target_type IS DISTINCT FROM 'IMPORT' OR source_receipt.target_id IS DISTINCT FROM proof_target.batch_id
    OR source_receipt.action IS DISTINCT FROM 'IMPORT_CHUNK' OR source_receipt.status IS DISTINCT FROM 'COMMITTED'
    OR source_audit.object_type IS DISTINCT FROM 'IMPORT' OR source_audit.object_id IS DISTINCT FROM proof_target.batch_id
    OR source_audit.action IS DISTINCT FROM source_receipt.action OR source_audit.actor_account_id IS DISTINCT FROM source_receipt.actor_account_id
    OR source_audit.occurred_at IS DISTINCT FROM source_receipt.completed_at OR source_record.reviewed_at IS DISTINCT FROM source_receipt.completed_at
    OR source_receipt.completed_at>origin_receipt.completed_at
    OR source_receipt.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
    OR source_audit.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
    OR source_receipt.result_data->>'operationId' IS DISTINCT FROM source_receipt.id::text
    OR source_receipt.result_data->>'batchId' IS DISTINCT FROM proof_target.batch_id::text
    OR source_receipt.result_data->>'packageManifestSha256' IS DISTINCT FROM documents_batch.source_hash
    OR source_receipt.result_data->>'phase' IS DISTINCT FROM (CASE proof_target.kind WHEN 'INVENTORY_KEY' THEN 'KEYS' ELSE 'DOCUMENTS' END)
    OR source_audit.after_values->>'phase' IS DISTINCT FROM source_receipt.result_data->>'phase'
    OR source_request->>'operation_id' IS DISTINCT FROM source_receipt.id::text
    OR source_request->>'request_key' IS DISTINCT FROM source_receipt.request_key
    OR source_request->>'batch_id' IS DISTINCT FROM proof_target.batch_id::text
    OR source_request->>'namespace' IS DISTINCT FROM documents_batch.source_name
    OR source_request->>'package_manifest_sha256' IS DISTINCT FROM documents_batch.source_hash
    OR (source_request->>'cutoff_at')::timestamptz IS DISTINCT FROM documents_batch.cutoff_at
    OR source_receipt.request_hash IS DISTINCT FROM encode(sha256(convert_to(CASE proof_target.kind WHEN 'INVENTORY_KEY' THEN 'KEYS:' ELSE 'DOCUMENTS:' END||source_request::text,'UTF8')),'hex')
    OR source_item->>'id' IS DISTINCT FROM source_record.id::text OR source_item->>'target_id' IS DISTINCT FROM proof_target.id::text
    OR source_item->>'entity_type' IS DISTINCT FROM source_record.source_entity_type OR source_item->>'target_type' IS DISTINCT FROM proof_target.kind
    OR source_item->>'source_key' IS DISTINCT FROM source_record.source_key OR source_item->>'source_hash' IS DISTINCT FROM source_record.source_record_hash
    OR source_item->>'file_ref' IS DISTINCT FROM source_record.source_file_ref
    OR source_item->>'source_hash' IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_object('source_key',source_item->>'source_key','fields',source_item->'fields','source_refs',source_item->'source_refs')::text,'UTF8')),'hex')
    OR jsonb_typeof(source_item->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(source_item->'source_refs')<1
    OR source_entry->>'source_key' IS DISTINCT FROM source_record.source_key OR source_entry->>'file_ref' IS DISTINCT FROM source_record.source_file_ref
    OR (proof_target.kind<>'INVENTORY_KEY' AND (source_entry->>'entity_type' IS DISTINCT FROM proof_target.kind
     OR source_entry->>'target_id' IS DISTINCT FROM proof_target.id::text OR source_entry->'identity_basis' IS DISTINCT FROM source_item->'identity_basis'))
    OR (proof_target.kind='INVENTORY_KEY' AND source_entry->'ledger_entry_id' IS DISTINCT FROM source_item->'ledger_entry_id')
    OR source_entry->'fields' IS DISTINCT FROM source_item->'fields' OR source_entry->'source_refs' IS DISTINCT FROM source_item->'source_refs'
    OR (source_receipt.result_data->'sourceRecordIds' ? source_record.id::text) IS NOT TRUE THEN
    RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
   IF proof_target.kind<>'INVENTORY_KEY' THEN
    IF jsonb_typeof(source_item->'fields') IS DISTINCT FROM 'object'
     OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(source_item->'fields') key) IS DISTINCT FROM
      (SELECT array_agg(attname::text ORDER BY attname) FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||lower(proof_target.kind COLLATE "C")) AND attnum>0 AND NOT attisdropped AND attgenerated='') THEN
     RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
    FOR numeric_field IN SELECT attname::text FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||lower(proof_target.kind COLLATE "C")) AND attnum>0 AND NOT attisdropped AND atttypid IN (20,1700) LOOP
     IF source_item->'fields'->numeric_field IS DISTINCT FROM proof_target.fields->numeric_field THEN
      RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;
   END IF;
   IF proof_target.kind='SALES_HEADER' THEN
    IF source_record.id::text IS DISTINCT FROM origin_audit.after_values->>'sourceRecordId'
     OR source_receipt.actor_account_id IS DISTINCT FROM origin_receipt.actor_account_id OR source_receipt.completed_at IS DISTINCT FROM origin_receipt.completed_at
     OR to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,source_item->'fields')) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,proof_target.fields))
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(source_request->'payload'->'documents') doc
      WHERE doc IS NOT DISTINCT FROM jsonb_build_object('kind','SALES','id',target,'operation_id',origin_receipt.id,'request_key',origin_receipt.request_key,'source_record_id',source_record.id)
       AND origin_receipt.request_hash=encode(sha256(convert_to(doc::text||origin_snapshot::text,'UTF8')),'hex')) THEN
     RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
   ELSIF proof_target.kind='SALES_LINE' THEN
    IF to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,source_item->'fields')) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,proof_target.fields)) THEN
     RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
   ELSE
    IF (source_item->'fields')-ARRAY['quantity'] IS DISTINCT FROM proof_target.fields
     OR jsonb_typeof(source_item->'fields'->'quantity') IS DISTINCT FROM 'string'
     OR (source_item->'fields'->>'quantity' ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$') IS NOT TRUE THEN
     RAISE EXCEPTION 'RESTORATION_BASELINE_INVALID' USING ERRCODE='23514'; END IF;
    IF (source_item->'fields'->>'quantity')::bigint=0 THEN
     IF source_item->>'ledger_entry_id' IS NOT NULL OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.source_import_batch_id=baseline_batch.id
       AND l.warehouse_id=h.warehouse_id AND l.sku_id=(proof_target.fields->>'sku_id')::uuid) THEN
      RAISE EXCEPTION 'RESTORATION_BASELINE_INVALID' USING ERRCODE='23514'; END IF;
    ELSIF NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.id=(source_item->>'ledger_entry_id')::uuid AND l.operation_id=source_receipt.id
     AND l.event_kind='CUTOFF_BASELINE' AND l.source_import_batch_id=baseline_batch.id AND l.warehouse_id=h.warehouse_id
     AND l.sku_id=(proof_target.fields->>'sku_id')::uuid AND l.quantity_delta=(source_item->'fields'->>'quantity')::bigint) THEN
     RAISE EXCEPTION 'RESTORATION_BASELINE_INVALID' USING ERRCODE='23514'; END IF;
   END IF;
  END LOOP;
  -- Every committed SALES event, not just a recent suffix, must be present once.
  SELECT count(*) INTO audit_count FROM naijue_erp.audit_change aa WHERE aa.object_type='SALES' AND aa.object_id=target;
  SELECT count(*) INTO receipt_count FROM naijue_erp.operation_receipt rr WHERE rr.target_type='SALES' AND rr.target_id=target;
  IF audit_count IS DISTINCT FROM h.version::bigint-origin_version::bigint+1 OR receipt_count IS DISTINCT FROM h.version::bigint-origin_version::bigint+1 THEN
   RAISE EXCEPTION 'RESTORATION_CHAIN_INCOMPLETE' USING ERRCODE='23514'; END IF;
  cursor_header:=naijue_erp.unified_sales_header_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_header,origin_header));
  expected_version:=origin_version; previous_time:=origin_receipt.completed_at; previous_approval:=origin_receipt.id;
  FOR step IN SELECT aa.*,rr.actor_account_id AS receipt_actor,rr.action AS receipt_action,rr.target_type AS receipt_kind,rr.target_id AS receipt_target,
   rr.completed_at,rr.result_data,rr.status AS receipt_status FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
   WHERE aa.object_type='SALES' AND aa.object_id=target AND aa.new_version>origin_version ORDER BY aa.new_version LOOP
   IF step.old_version IS DISTINCT FROM expected_version OR step.new_version IS DISTINCT FROM expected_version+1
    OR step.action NOT IN ('SAVE','APPROVE','UNAPPROVE') OR step.action IS DISTINCT FROM step.receipt_action
    OR step.receipt_kind IS DISTINCT FROM 'SALES' OR step.receipt_target IS DISTINCT FROM target
    OR step.actor_account_id IS DISTINCT FROM step.receipt_actor OR step.receipt_status IS DISTINCT FROM 'COMMITTED'
    OR step.occurred_at IS DISTINCT FROM step.completed_at OR step.completed_at<previous_time
    OR step.result_data->>'operationId' IS DISTINCT FROM step.operation_id::text OR step.result_data->>'salesId' IS DISTINCT FROM target::text
    OR step.result_data->'version' IS DISTINCT FROM to_jsonb(step.new_version)
    OR step.result_data->>'status' IS DISTINCT FROM (CASE step.action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'DRAFT' END) THEN
    RAISE EXCEPTION 'RESTORATION_CHAIN_INCOMPLETE' USING ERRCODE='23514'; END IF;
   IF jsonb_typeof(step.before_values) IS DISTINCT FROM 'object' OR jsonb_typeof(step.after_values) IS DISTINCT FROM 'object'
    OR step.before_values-ARRAY['header','lines','settlements'] IS DISTINCT FROM '{}'::jsonb
    OR step.after_values-ARRAY['header','lines','settlements'] IS DISTINCT FROM '{}'::jsonb
    OR step.before_values->'lines' IS DISTINCT FROM '[]'::jsonb OR step.after_values->'lines' IS DISTINCT FROM '[]'::jsonb
    OR step.before_values->'settlements' IS DISTINCT FROM '[]'::jsonb OR step.after_values->'settlements' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'RESTORATION_ECONOMIC_OR_UNSUPPORTED_DELTA' USING ERRCODE='23514'; END IF;
   before_header:=step.before_values->'header'; after_header:=step.after_values->'header';
   allowed_header:=CASE step.action WHEN 'SAVE' THEN ARRAY['version','note','responsibleStaffId','updatedAt']
    ELSE ARRAY['version','status','updatedAt','approvedByAccountId','approvedByStaffId','approvedAt'] END;
   IF jsonb_typeof(before_header) IS DISTINCT FROM 'object' OR jsonb_typeof(after_header) IS DISTINCT FROM 'object'
    OR before_header - allowed_header IS DISTINCT FROM '{}'::jsonb OR after_header - allowed_header IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'RESTORATION_ECONOMIC_OR_UNSUPPORTED_DELTA' USING ERRCODE='23514'; END IF;
   IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(before_header) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(after_header) key)
    OR (before_header ?& ARRAY['version','updatedAt']) IS NOT TRUE OR (after_header ?& ARRAY['version','updatedAt']) IS NOT TRUE
    OR before_header->'version' IS DISTINCT FROM to_jsonb(expected_version) OR after_header->'version' IS DISTINCT FROM to_jsonb(step.new_version)
    OR (after_header->>'updatedAt')::timestamptz IS DISTINCT FROM step.completed_at
    OR cursor_header->>'status' IS DISTINCT FROM (CASE step.action WHEN 'UNAPPROVE' THEN 'APPROVED' ELSE 'DRAFT' END)
    OR (step.action<>'SAVE' AND ((before_header ? 'status') IS NOT TRUE OR (after_header ? 'status') IS NOT TRUE)) THEN
    RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
   IF (after_header ? 'note') AND jsonb_typeof(after_header->'note') NOT IN ('string','null') THEN
    RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
   FOREACH field IN ARRAY ARRAY['responsibleStaffId','approvedByAccountId','approvedByStaffId'] LOOP
    IF after_header ? field THEN
     IF jsonb_typeof(after_header->field) NOT IN ('string','null') OR (jsonb_typeof(after_header->field)='string' AND (after_header->>field)::uuid IS NULL) THEN
      RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
    END IF;
   END LOOP;
   FOR field IN SELECT jsonb_object_keys(before_header) LOOP
    IF field IN ('updatedAt','approvedAt') THEN
     IF jsonb_typeof(before_header->field) NOT IN ('string','null') OR jsonb_typeof(after_header->field) NOT IN ('string','null')
      OR (before_header->>field)::timestamptz IS DISTINCT FROM (cursor_header->>field)::timestamptz THEN
      RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
    ELSIF before_header->field IS DISTINCT FROM cursor_header->field THEN
     RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
    cursor_header:=jsonb_set(cursor_header,ARRAY[field],after_header->field);
   END LOOP;
   IF cursor_header->>'status' IS DISTINCT FROM (CASE step.action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'DRAFT' END)
    OR (step.action='APPROVE' AND (cursor_header->>'approvedByAccountId' IS DISTINCT FROM step.receipt_actor::text
     OR cursor_header->>'approvedByStaffId' IS NULL OR (cursor_header->>'approvedAt')::timestamptz IS DISTINCT FROM step.completed_at))
    OR (step.action IN ('SAVE','UNAPPROVE') AND (cursor_header->'approvedByAccountId' IS DISTINCT FROM 'null'::jsonb
     OR cursor_header->'approvedByStaffId' IS DISTINCT FROM 'null'::jsonb OR cursor_header->'approvedAt' IS DISTINCT FROM 'null'::jsonb)) THEN
    RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
   SELECT coalesce(jsonb_agg(l.id::text ORDER BY l.id),'[]'::jsonb),count(*) INTO actual_effect_ids,effect_count FROM naijue_erp.inventory_ledger l WHERE l.operation_id=step.operation_id;
   IF jsonb_typeof(step.result_data->'ledgerEntryIds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'RESTORATION_EFFECTS_INVALID' USING ERRCODE='23514'; END IF;
   SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO receipt_effect_ids FROM jsonb_array_elements_text(step.result_data->'ledgerEntryIds');
   SELECT count(*) INTO expected_effects FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current AND ln.quantity<>0;
   IF actual_effect_ids IS DISTINCT FROM receipt_effect_ids OR (step.action='SAVE' AND effect_count<>0)
    OR (step.action IN ('APPROVE','UNAPPROVE') AND (effect_count<>expected_effects OR EXISTS(SELECT 1 FROM naijue_erp.sales_line ln
     WHERE ln.sales_id=target AND ln.is_current AND ln.quantity<>0 AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l
      WHERE l.operation_id=step.operation_id AND l.source_sales_line_id=ln.id AND l.source_transfer_line_id IS NULL AND l.source_import_batch_id IS NULL
       AND l.endpoint='SALES_WAREHOUSE' AND l.event_kind=step.action AND l.source_document_version=step.new_version
       AND l.warehouse_id=h.warehouse_id AND l.sku_id=ln.sku_id AND l.business_date=h.business_date AND l.posted_at=step.completed_at
       AND l.quantity_delta::numeric=ln.quantity::numeric*CASE step.action WHEN 'APPROVE' THEN -1 ELSE 1 END
       AND ((step.action='APPROVE' AND l.reverses_entry_id IS NULL AND l.baseline_anchor_operation_id IS NULL)
        OR (step.action='UNAPPROVE' AND expected_version=origin_version AND l.baseline_anchor_operation_id=origin_receipt.id AND l.reverses_entry_id IS NULL)
        OR (step.action='UNAPPROVE' AND expected_version>origin_version AND l.baseline_anchor_operation_id IS NULL AND EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger prior
         WHERE prior.id=l.reverses_entry_id AND prior.operation_id=previous_approval AND prior.source_sales_line_id=ln.id AND prior.event_kind='APPROVE'
          AND prior.quantity_delta::numeric+l.quantity_delta::numeric=0))))))) THEN
    RAISE EXCEPTION 'RESTORATION_EFFECTS_INVALID' USING ERRCODE='23514'; END IF;
   IF step.action='APPROVE' THEN previous_approval:=step.operation_id; END IF;
   expected_version:=step.new_version;previous_time:=step.completed_at;
  END LOOP;
  actual_header:=naijue_erp.unified_sales_header_audit_values(h);
  FOR field IN SELECT jsonb_object_keys(actual_header) LOOP
   IF field IN ('updatedAt','approvedAt') THEN
    IF (cursor_header->>field)::timestamptz IS DISTINCT FROM (actual_header->>field)::timestamptz THEN
     RAISE EXCEPTION 'RESTORATION_FINAL_HEADER_DIFFERS' USING ERRCODE='23514'; END IF;
   ELSIF cursor_header->field IS DISTINCT FROM actual_header->field THEN
    RAISE EXCEPTION 'RESTORATION_FINAL_HEADER_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF expected_version IS DISTINCT FROM h.version OR cursor_header->>'status' IS DISTINCT FROM 'APPROVED'
   OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l JOIN naijue_erp.sales_line ln ON ln.id=l.source_sales_line_id
    LEFT JOIN naijue_erp.operation_receipt rr ON rr.id=l.operation_id WHERE ln.sales_id=target
     AND (rr.target_type IS DISTINCT FROM 'SALES' OR rr.target_id IS DISTINCT FROM target)) THEN
   RAISE EXCEPTION 'RESTORATION_CHAIN_INCOMPLETE' USING ERRCODE='23514'; END IF;
  preserve_missing_original:=true;
 END IF;
$restoration_proof$;
 signature text := 'naijue_erp.validate_sales_settlement()';
 routine oid; before_body text; after_body text; definition text; replacement text; change jsonb; dep jsonb; guard jsonb; dep_row record;
 before_meta jsonb; after_meta jsonb;
BEGIN
 routine:=pg_catalog.to_regprocedure(signature);
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO before_body,before_meta FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_body IS NULL OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'predecessor_sha256'
 THEN RAISE EXCEPTION 'RESTORATION_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
 IF before_meta->>'prosecdef' IS DISTINCT FROM 'false'
  OR (before_meta->'proconfig' @> '["search_path=pg_catalog, naijue_erp, pg_temp"]'::jsonb) IS NOT TRUE
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
   WHERE p.oid=routine AND acl.grantee=0 AND acl.privilege_type='EXECUTE')
 THEN RAISE EXCEPTION 'RESTORATION_METADATA_UNSAFE' USING ERRCODE='55000'; END IF;
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27]
 THEN RAISE EXCEPTION 'RESTORATION_COHORT_DIFFERS' USING ERRCODE='55000'; END IF;
 FOR dep IN SELECT value FROM pg_catalog.jsonb_array_elements(spec->'dependencies') LOOP
  SELECT p.* INTO STRICT dep_row FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure(dep->>'signature');
  IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(dep_row.prosrc,'UTF8')),'hex') IS DISTINCT FROM dep->>'sha256'
   OR dep_row.prosecdef IS DISTINCT FROM (dep->>'security_definer')::boolean
   OR (pg_catalog.to_jsonb(dep_row.proconfig) @> '["search_path=pg_catalog, naijue_erp, pg_temp"]'::jsonb) IS NOT TRUE
   OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(dep_row.proacl,pg_catalog.acldefault('f',dep_row.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')
  THEN RAISE EXCEPTION 'RESTORATION_DEPENDENCY_DIFFERS: %',dep->>'signature' USING ERRCODE='55000'; END IF;
 END LOOP;
 FOR guard IN SELECT value FROM pg_catalog.jsonb_array_elements(spec->'triggers') LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=pg_catalog.to_regclass('naijue_erp.'||(guard->>'table'))
   AND t.tgname=guard->>'name' AND t.tgfoid=pg_catalog.to_regprocedure('naijue_erp.'||(guard->>'function')||'()')
   AND t.tgenabled='O' AND t.tgtype=(guard->>'type')::smallint
   AND NOT t.tgisinternal AND t.tgnargs=0 AND t.tgargs=''::bytea AND t.tgattr=''::int2vector
   AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL
   AND CASE WHEN guard->>'name'='unified_ordinary_operation_consistency' THEN t.tgqual IS NOT NULL
    AND split_part(split_part(pg_catalog.pg_get_triggerdef(t.oid,false),' WHEN ',2),' EXECUTE FUNCTION ',1)=$trigger$((new.target_type = ANY (ARRAY['SALES'::text, 'TRANSFER'::text])))$trigger$
    ELSE t.tgqual IS NULL END
   AND t.tgdeferrable=(guard->>'deferred')::boolean AND t.tginitdeferred=(guard->>'deferred')::boolean)
  THEN RAISE EXCEPTION 'RESTORATION_TRIGGER_DIFFERS: %',guard->>'name' USING ERRCODE='55000'; END IF;
 END LOOP;
 definition:=pg_catalog.pg_get_functiondef(routine);after_body:=before_body;
 FOR change IN SELECT value FROM pg_catalog.jsonb_array_elements(spec->'replacements') LOOP
  replacement:=CASE WHEN change->>'after'='$RESTORATION_PROOF' THEN extension||(change->>'before') ELSE change->>'after' END;
  IF coalesce(pg_catalog.length(change->>'before'),0)=0
   OR (pg_catalog.length(after_body)-pg_catalog.length(pg_catalog.replace(after_body,change->>'before','')))/pg_catalog.length(change->>'before')<>1
   OR (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,change->>'before','')))/pg_catalog.length(change->>'before')<>1
  THEN RAISE EXCEPTION 'RESTORATION_ANCHOR_DIFFERS' USING ERRCODE='55000'; END IF;
  after_body:=pg_catalog.replace(after_body,change->>'before',replacement);
  definition:=pg_catalog.replace(definition,change->>'before',replacement);
 END LOOP;
 IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'RESTORATION_OUTPUT_DIFFERS' USING ERRCODE='55000'; END IF;
 EXECUTE definition;
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO after_body,after_meta FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_meta IS DISTINCT FROM after_meta
  OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'RESTORATION_POSTCONDITION_FAILED' USING ERRCODE='55000'; END IF;
END $historical_original_restoration$;

-- Zero amount original source archive. No settlement INSERT and no inventory replay.
-- SOURCE CANDIDATE ONLY. Not installed; not PostgreSQL parsed or validated.
-- Explicit historical-sales-source-v1 successor. Existing SQL files remain unchanged.
-- READY fields stay unchanged; CLEANED classification is offline provenance declaration,
-- never independent source truth. Compiler gates remain closed until reviewed integration.
-- Run only after the reviewed whole-package cohort and its search-path hardening.
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $historical_source_profile$
DECLARE
 spec jsonb := $source_profile_changes${"predecessor_sha256":"febd7953e7e14ffb5c7ed84705c02d71e152ec765db8bad12b132a574649b4f8","successor_sha256":"23fbb6f80befaabac0dcccf9e3c82eb9151de154ad5cd61bed1b14a1ea752301","replacements":[{"before":"entry-ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields']","after":"entry-ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields','zero_amount_archive']"},{"before":"    parsed:=jsonb_build_object('source_key',source_key,'fields',fields,'source_refs',entry->'source_refs');source_hash:=encode(sha256(convert_to(parsed::text,'UTF8')),'hex');","after":"    IF entry ? 'zero_amount_archive' THEN\n     IF kind IS DISTINCT FROM 'SALES_HEADER' OR fields->>'business_type' IS DISTINCT FROM 'SALE'\n      OR fields->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'\n      OR jsonb_typeof(entry->'zero_amount_archive') IS DISTINCT FROM 'object'\n      OR (entry->'zero_amount_archive')-ARRAY['profile','records']<>'{}'\n      OR entry->'zero_amount_archive'->>'profile' IS DISTINCT FROM 'ZERO_AMOUNT_SOURCE_ARCHIVE_V1'\n      OR jsonb_typeof(entry->'zero_amount_archive'->'records') IS DISTINCT FROM 'array'\n     THEN RAISE EXCEPTION 'ZERO_ARCHIVE_SHAPE_INVALID' USING ERRCODE='23514'; END IF;\n     IF jsonb_array_length(entry->'zero_amount_archive'->'records') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'ZERO_ARCHIVE_COUNT_INVALID' USING ERRCODE='23514'; END IF;\n     FOR parent_row IN SELECT value AS archived FROM jsonb_array_elements(entry->'zero_amount_archive'->'records') LOOP\n      IF jsonb_typeof(parent_row.archived) IS DISTINCT FROM 'object'\n       OR parent_row.archived-ARRAY['source_key','amount','source_refs','original_values']<>'{}'\n       OR NOT(parent_row.archived ?& ARRAY['source_key','amount','source_refs','original_values'])\n       OR jsonb_typeof(parent_row.archived->'source_key') IS DISTINCT FROM 'string'\n       OR (length(parent_row.archived->>'source_key')+(SELECT count(*) FROM regexp_split_to_table(parent_row.archived->>'source_key','') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096\n       OR parent_row.archived->>'source_key' ~ '[[:cntrl:]]'\n       OR parent_row.archived->'amount' IS DISTINCT FROM '\"0.00\"'::jsonb\n       OR jsonb_typeof(parent_row.archived->'source_refs') IS DISTINCT FROM 'array'\n       OR jsonb_typeof(parent_row.archived->'original_values') IS DISTINCT FROM 'object'\n      THEN RAISE EXCEPTION 'ZERO_ARCHIVE_RECORD_INVALID' USING ERRCODE='23514'; END IF;\n      IF jsonb_array_length(parent_row.archived->'source_refs') NOT BETWEEN 1 AND 100\n       OR (SELECT count(*) FROM jsonb_each(parent_row.archived->'original_values')) NOT BETWEEN 1 AND 100\n       OR EXISTS(SELECT 1 FROM jsonb_each(parent_row.archived->'original_values') v WHERE (length(v.key)+(SELECT count(*) FROM regexp_split_to_table(v.key,'') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096 OR v.key ~ '[[:cntrl:]]' OR v.key ~* '(password|passwd|secret|token|credential|authorization|private.?key|密码|口令|令牌)' OR v.key IN ('__proto__','constructor','prototype') OR jsonb_typeof(v.value) NOT IN ('string','null') OR (length(v.value#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(v.value#>>'{}','') AS cp(ch) WHERE ascii(ch)>65535))>16384)\n       OR EXISTS(SELECT 1 FROM jsonb_array_elements(parent_row.archived->'source_refs') ref WHERE jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(ref ?& ARRAY['file_sha256','sheet','row']) OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(ref->'sheet') NOT IN ('string','null') OR (jsonb_typeof(ref->'sheet')='string' AND ((length(ref->>'sheet')+(SELECT count(*) FROM regexp_split_to_table(ref->>'sheet','') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096 OR ref->>'sheet' ~ '[[:cntrl:]]')) OR (CASE WHEN ref->>'row' ~ '^[1-9][0-9]{0,9}$' THEN (ref->>'row')::numeric>2147483647 ELSE false END) OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number' OR (ref->>'row' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true)\n      THEN RAISE EXCEPTION 'ZERO_ARCHIVE_SOURCE_INVALID' USING ERRCODE='23514'; END IF;\n     END LOOP;\n     IF EXISTS(SELECT 1 FROM jsonb_array_elements(entry->'zero_amount_archive'->'records') x GROUP BY x->>'source_key' HAVING count(*)>1) THEN RAISE EXCEPTION 'ZERO_ARCHIVE_DUPLICATE_SOURCE_KEY' USING ERRCODE='23514'; END IF;\n    END IF;\n    parsed:=jsonb_build_object('source_key',source_key,'fields',fields,'source_refs',entry->'source_refs');\n    IF entry ? 'zero_amount_archive' THEN parsed:=parsed||jsonb_build_object('zero_amount_archive',entry->'zero_amount_archive'); END IF;\n    source_hash:=encode(sha256(convert_to(parsed::text,'UTF8')),'hex');"},{"before":"    IF command_phase='KEYS' THEN item:=item||jsonb_build_object('ledger_entry_id',entry->>'ledger_entry_id'); END IF;","after":"    IF entry ? 'zero_amount_archive' THEN item:=item||jsonb_build_object('zero_amount_archive',entry->'zero_amount_archive'); END IF;\n    IF command_phase='KEYS' THEN item:=item||jsonb_build_object('ledger_entry_id',entry->>'ledger_entry_id'); END IF;"}]}$source_profile_changes$::jsonb;
 signature text := 'naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)';
 routine oid; before_body text; after_body text; definition text; change jsonb;
 before_meta jsonb; after_meta jsonb;
BEGIN
 routine:=pg_catalog.to_regprocedure(signature);
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO before_body,before_meta
 FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_body IS NULL OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'predecessor_sha256'
 THEN RAISE EXCEPTION 'ZERO_ARCHIVE_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
 IF before_meta->>'prosecdef' IS DISTINCT FROM 'true'
  OR (before_meta->'proconfig' @> '["search_path=pg_catalog, naijue_erp, pg_temp"]'::jsonb) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'ZERO_ARCHIVE_METADATA_UNSAFE' USING ERRCODE='55000'; END IF;
 definition:=pg_catalog.pg_get_functiondef(routine);after_body:=before_body;
 FOR change IN SELECT value FROM pg_catalog.jsonb_array_elements(spec->'replacements') LOOP
  IF coalesce(pg_catalog.length(change->>'before'),0)=0
   OR (pg_catalog.length(after_body)-pg_catalog.length(pg_catalog.replace(after_body,change->>'before','')))/pg_catalog.length(change->>'before')<>1
   OR (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,change->>'before','')))/pg_catalog.length(change->>'before')<>1
  THEN RAISE EXCEPTION 'ZERO_ARCHIVE_ANCHOR_DIFFERS' USING ERRCODE='55000'; END IF;
  after_body:=pg_catalog.replace(after_body,change->>'before',change->>'after');
  definition:=pg_catalog.replace(definition,change->>'before',change->>'after');
 END LOOP;
 IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'ZERO_ARCHIVE_OUTPUT_DIFFERS' USING ERRCODE='55000'; END IF;
 EXECUTE definition;
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO after_body,after_meta
 FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_meta IS DISTINCT FROM after_meta
  OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'ZERO_ARCHIVE_POSTCONDITION_FAILED' USING ERRCODE='55000'; END IF;
END $historical_source_profile$;

-- Narrow trace entry. Existing proof function remains private to its owner.
CREATE FUNCTION naijue_erp.standard_zero_amount_archive_trace(sales uuid)
RETURNS TABLE(record_id uuid,sales_id uuid,sales_source_key text,source_namespace text,proof jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $zero_archive_trace$
BEGIN
 IF current_setting('role') IS DISTINCT FROM 'erp_unified27_importer_2393dbc6db9581c2' THEN
  RAISE EXCEPTION 'ZERO_ARCHIVE_IMPORTER_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT s.id,s.target_id,s.source_key,s.source_system,
  naijue_erp.standard_import_record_proof(s.id)
 FROM naijue_erp.import_record s
 JOIN naijue_erp.sales_header h ON h.id=s.target_id AND h.import_batch_id=s.import_batch_id
 JOIN naijue_erp.import_batch b ON b.id=s.import_batch_id AND b.status='IMPORTED'
 WHERE s.target_type='SALES_HEADER' AND s.status='IMPORTED' AND s.target_id=sales
  AND h.stock_basis='CUTOFF_HISTORY' AND h.business_type='SALE';
END $zero_archive_trace$;
DO $zero_archive_owner$
DECLARE owner_name text;
BEGIN
 SELECT pg_get_userbyid(proowner) INTO STRICT owner_name FROM pg_proc
 WHERE oid='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)'::regprocedure;
 EXECUTE format('ALTER FUNCTION naijue_erp.standard_zero_amount_archive_trace(uuid) OWNER TO %I',owner_name);
END $zero_archive_owner$;
REVOKE ALL ON FUNCTION naijue_erp.standard_zero_amount_archive_trace(uuid) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2;
GRANT EXECUTE ON FUNCTION naijue_erp.standard_zero_amount_archive_trace(uuid) TO erp_unified27_importer_2393dbc6db9581c2;

-- Exact operator-approved historical departed staff null-hall successor.
-- Candidate only; requires real PostgreSQL validation and registered installation.
-- No business columns, roles, logins or fake halls are added.
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $historical_source_profile$
DECLARE
 spec jsonb := $source_profile_changes${"predecessor_sha256":"23fbb6f80befaabac0dcccf9e3c82eb9151de154ad5cd61bed1b14a1ea752301","successor_sha256":"b80d83ae257b1f09be9561ce2b68a3e36e95e8b469fe30883fe0c9284ac6faef","replacements":[{"before":"'execution_contract','schema_declarations_sha256']<>'{}'","after":"'execution_contract','schema_declarations_sha256','historical_staff_hall_approval']<>'{}'"},{"before":"  -- SQL49: the frozen eight-key planning contract is an explicit V2 opt-in.","after":"  IF payload ? 'historical_staff_hall_approval' THEN\n   expected:=payload->'historical_staff_hall_approval';\n   IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR expected-ARRAY['utf8','sha256']<>'{}'\n    OR NOT(expected ?& ARRAY['utf8','sha256']) OR jsonb_typeof(expected->'utf8') IS DISTINCT FROM 'string'\n    OR octet_length(convert_to(expected->>'utf8','UTF8')) NOT BETWEEN 1 AND 1048576\n    OR (expected->>'utf8' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true\n    OR encode(sha256(convert_to(expected->>'utf8','UTF8')),'hex') IS DISTINCT FROM expected->>'sha256'\n   THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_HASH' USING ERRCODE='23514'; END IF;\n   expected:=(expected->>'utf8')::jsonb;\n   IF jsonb_typeof(expected) IS DISTINCT FROM 'object'\n    OR expected-ARRAY['format_version','source_namespace','evidence_sha256','staff']<>'{}'\n    OR NOT(expected ?& ARRAY['format_version','source_namespace','evidence_sha256','staff'])\n    OR expected->>'format_version' IS DISTINCT FROM 'HISTORICAL_STAFF_NULL_HALL_APPROVAL_V1'\n    OR expected->>'source_namespace' IS DISTINCT FROM request->>'namespace'\n    OR (expected->>'evidence_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true\n    OR jsonb_typeof(expected->'staff') IS DISTINCT FROM 'array'\n   THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_SHAPE' USING ERRCODE='23514'; END IF;\n   IF jsonb_array_length(expected->'staff') NOT BETWEEN 1 AND 1000\n    OR (SELECT count(DISTINCT value->>'source_key') FROM jsonb_array_elements(expected->'staff'))<>jsonb_array_length(expected->'staff')\n    OR (SELECT count(DISTINCT value->>'target_id') FROM jsonb_array_elements(expected->'staff'))<>jsonb_array_length(expected->'staff')\n   THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_DUPLICATE' USING ERRCODE='23514'; END IF;\n   FOR item IN SELECT value FROM jsonb_array_elements(expected->'staff') LOOP\n    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['source_key','target_id','source_refs']<>'{}'\n     OR NOT(item ?& ARRAY['source_key','target_id','source_refs'])\n     OR jsonb_typeof(item->'source_key') IS DISTINCT FROM 'string' OR length(item->>'source_key')=0 OR item->>'source_key' ~ '[[:cntrl:]]' OR item->>'source_key' IS DISTINCT FROM btrim(item->>'source_key',U&' \\00a0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200a\\2028\\2029\\202f\\205f\\3000\\feff')\n     OR (item->>'target_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true\n     OR jsonb_typeof(item->'source_refs') IS DISTINCT FROM 'array'\n    THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_RECORD' USING ERRCODE='23514'; END IF;\n    IF jsonb_array_length(item->'source_refs')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->'source_refs') ref WHERE\n     jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(ref ?& ARRAY['file_sha256','sheet','row'])\n     OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(ref->'sheet') NOT IN ('string','null')\n     OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number' OR (ref->>'row' ~ '^[1-9][0-9]*$') IS DISTINCT FROM true OR (ref->>'row')::numeric>2147483647\n     OR (ref->'sheet'<>'null'::jsonb AND (length(ref->>'sheet')=0 OR ref->>'sheet' ~ '[[:cntrl:]]' OR ref->>'sheet' IS DISTINCT FROM btrim(ref->>'sheet',U&' \\00a0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200a\\2028\\2029\\202f\\205f\\3000\\feff'))))\n    THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;\n    IF (SELECT count(DISTINCT ref) FROM jsonb_array_elements(item->'source_refs') ref)<>jsonb_array_length(item->'source_refs') THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_DUPLICATE_REF' USING ERRCODE='23514'; END IF;\n   END LOOP;\n  END IF;\n  -- SQL49: the frozen eight-key planning contract is an explicit V2 opt-in."},{"before":"     -- WHOLE_FIT_PROFILE_GUARD_BEGIN","after":"     IF kind='STAFF' AND fields->>'role'='SALESPERSON' AND fields->'hall_id'='null'::jsonb THEN\n      IF fields->>'employment_status' IS DISTINCT FROM '离职'\n       OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(((cfg->'historical_staff_hall_approval'->>'utf8')::jsonb)->'staff','[]'::jsonb)) approved\n        WHERE approved->>'source_key'=entry->>'source_key' AND approved->>'target_id'=entry->>'target_id'\n         AND approved->'source_refs' @> entry->'source_refs' AND entry->'source_refs' @> approved->'source_refs')\n       OR EXISTS(SELECT 1 FROM naijue_erp.user_account WHERE staff_id=(entry->>'target_id')::uuid)\n      THEN RAISE EXCEPTION 'STAFF_HALL_REQUIRED' USING ERRCODE='23514'; END IF;\n     END IF;\n     -- WHOLE_FIT_PROFILE_GUARD_BEGIN"}]}$source_profile_changes$::jsonb;
 signature text := 'naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)';
 routine oid; before_body text; after_body text; definition text; change jsonb;
 before_meta jsonb; after_meta jsonb;
BEGIN
 routine:=pg_catalog.to_regprocedure(signature);
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO before_body,before_meta
 FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_body IS NULL OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'predecessor_sha256'
 THEN RAISE EXCEPTION 'STAFF_HALL_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
 IF before_meta->>'prosecdef' IS DISTINCT FROM 'true'
  OR (before_meta->'proconfig' @> '["search_path=pg_catalog, naijue_erp, pg_temp"]'::jsonb) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'STAFF_HALL_METADATA_UNSAFE' USING ERRCODE='55000'; END IF;
 definition:=pg_catalog.pg_get_functiondef(routine);after_body:=before_body;
 FOR change IN SELECT value FROM pg_catalog.jsonb_array_elements(spec->'replacements') LOOP
  IF coalesce(pg_catalog.length(change->>'before'),0)=0
   OR (pg_catalog.length(after_body)-pg_catalog.length(pg_catalog.replace(after_body,change->>'before','')))/pg_catalog.length(change->>'before')<>1
   OR (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,change->>'before','')))/pg_catalog.length(change->>'before')<>1
  THEN RAISE EXCEPTION 'STAFF_HALL_ANCHOR_DIFFERS' USING ERRCODE='55000'; END IF;
  after_body:=pg_catalog.replace(after_body,change->>'before',change->>'after');
  definition:=pg_catalog.replace(definition,change->>'before',change->>'after');
 END LOOP;
 IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'STAFF_HALL_OUTPUT_DIFFERS' USING ERRCODE='55000'; END IF;
 EXECUTE definition;
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO after_body,after_meta
 FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_meta IS DISTINCT FROM after_meta
  OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'STAFF_HALL_POSTCONDITION_FAILED' USING ERRCODE='55000'; END IF;
END $historical_source_profile$;

-- Explicit installation access, SOURCE ONLY / NOT EXECUTED.
-- No role creation, membership, login, session or table grants.
SET LOCAL search_path=pg_catalog,naijue_erp;
DO $access$ DECLARE item jsonb; p record; role_row record; recipient oid; BEGIN
 IF current_user::regrole::oid<>(SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp') THEN RAISE EXCEPTION 'WHOLE_INSTALL_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 FOR role_row IN SELECT * FROM pg_catalog.pg_roles WHERE rolname IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2') LOOP
  IF role_row.rolcanlogin OR role_row.rolsuper OR role_row.rolcreatedb OR role_row.rolcreaterole OR role_row.rolreplication OR role_row.rolbypassrls
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=role_row.oid)
   OR role_row.oid IN ((SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp'),(SELECT datdba FROM pg_catalog.pg_database WHERE datname=current_database()))
   OR has_parameter_privilege(role_row.oid,'session_replication_role','SET')
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE has_schema_privilege(role_row.oid,n.oid,'CREATE'))
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace='naijue_erp'::regnamespace AND
     (c.relowner=role_row.oid OR (c.relkind IN ('r','p','v','m','f') AND
      (has_table_privilege(role_row.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
       OR has_any_column_privilege(role_row.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
      OR (c.relkind='S' AND has_sequence_privilege(role_row.oid,c.oid,'USAGE,SELECT,UPDATE'))))
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE proowner=role_row.oid)
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_type WHERE typowner=role_row.oid)

  THEN RAISE EXCEPTION 'WHOLE_INSTALL_ROLE_UNSAFE' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2'))<>2 THEN RAISE EXCEPTION 'WHOLE_INSTALL_ROLES_REQUIRED' USING ERRCODE='42501'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements('[{"signature":"naijue_erp.standard_whole_package_context_v2(uuid)","sha256":"ef1631ee8ac06527c13253aad1eec7d8902dd6411d46b1db729fdbf589b2b4e2","new":true},{"signature":"naijue_erp.standard_whole_package_closed_v2(uuid)","sha256":"01e39386859cbb3e0617b9c89d1d7670a6b9db97af0a4e02b1d9a74460e30d5f","new":true},{"signature":"naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)","sha256":"b80d83ae257b1f09be9561ce2b68a3e36e95e8b469fe30883fe0c9284ac6faef","new":true},{"signature":"naijue_erp.assert_standard_import_operation(uuid)","sha256":"4be1b13f9eb70edca20d05941ff0205677abb312dd29063a7b6cf93386bbc9f8","new":false},{"signature":"naijue_erp.standard_whole_package_prepare_v2(jsonb,text)","sha256":"57d682fb7066de41287b6bf03d6c430cc89572c413a8aba02a7ac81a4e3c84a1","new":true},{"signature":"naijue_erp.standard_whole_package_step_v2(uuid,integer,text,jsonb)","sha256":"178d956433f015e739cf60530afc6006ff267471e8d98edb6decbeed4d87d1e4","new":true},{"signature":"naijue_erp.standard_whole_package_finish_v2(uuid)","sha256":"f0786b4001d586a6d268aa579a68e338d12522dc4b7aec88578d2d9289b1cb58","new":true},{"signature":"naijue_erp.standard_whole_package_inspect_v2(jsonb,text)","sha256":"dda2a78e740416b29f020318bb25c8a2debf4f016b3968f95a7cf86991ad1eea","new":true},{"signature":"naijue_erp.is_native_party_import_insert(text,jsonb)","sha256":"9e9842673283ceabe9b1c48a45d8a3dd829f6c1217b7e46cfb27ac0ffd65998b","new":false},{"signature":"naijue_erp.guard_history_publication()","sha256":"1368f91865d8d694fa9685e6b6c54485cb31d3d19a7deae1c8d521408ae5c84b","new":false},{"signature":"naijue_erp.guard_header_native_reference_publication()","sha256":"ba5b4b041d9986c25cb3d0b195c5e4e5a08e9c8465fc95046c96e776cd53fa62","new":false},{"signature":"naijue_erp.guard_native_catalogue_publication()","sha256":"eb30d86ff11a3ed314ab82f80bf6a4e3c840efe0f59cba9693a76af04c460844","new":false},{"signature":"naijue_erp.guard_native_payment_publication()","sha256":"5a8c4a4ae7e0fdc0c6ce2590676b18254c335be6af1d72364ffdf16e9dd791a9","new":false},{"signature":"naijue_erp.guard_history_typed_publication()","sha256":"8fb4e55740e80cea6fbe87b3419b1e1dd6c2824376d7bea990b16ed0cf464e70","new":false},{"signature":"naijue_erp.guard_import_accounting_publication()","sha256":"874e33905c6d75eceafec0c554e0b28af5ed495825b21cbc694522d7d4d57863","new":false},{"signature":"naijue_erp.guard_successor_publication26()","sha256":"edb6cbed80a77826cb2b698af14ae1ac6ee8cd99b0da3d4f8985a7c2563e0699","new":false},{"signature":"naijue_erp.standard_import_row_intent(text,jsonb)","sha256":"4ea68e6eee19a05be7ad9aaa7eefcfb33bbf9af2d41a790c808e3b2693aef3ed","new":false},{"signature":"naijue_erp.validate_import_source_commit()","sha256":"72d8f8bb1e78de21848df2be29ba75dd8e5c97c5349164ca32c432b433e007ae","new":false},{"signature":"naijue_erp.validate_import_operation()","sha256":"e500e06a4630bf0ae1fb38a40fb868d0c0df0a5ebb025beeed2314cf62fe388e","new":false},{"signature":"naijue_erp.validate_import_batch_commit()","sha256":"0975bb6321f78cbd1c6158145c4f458fe609d273d63bbe344be4ac2a5316ab9f","new":false},{"signature":"naijue_erp.validate_sparse_balance_commit()","sha256":"c071e1159a52b192e9526645c02febaaccd9c390cbe63c7850cdf2be4440077d","new":false},{"signature":"naijue_erp.standard_whole_package_verify_v2(jsonb,text)","sha256":"85a011555b44af125b4b90553719fc686300dd11fa832f7fddd8779b71f61336","new":true}]'::jsonb) LOOP
  SELECT * INTO STRICT p FROM pg_catalog.pg_proc WHERE oid=(item->>'signature')::regprocedure;
  IF encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM item->>'sha256' OR p.proowner<>current_user::regrole::oid THEN RAISE EXCEPTION 'WHOLE_INSTALL_SOURCE_DIFFERS' USING ERRCODE='55000'; END IF;
  IF (item->>'new')::boolean THEN
   IF NOT p.prosecdef OR p.proleakproof OR p.proisstrict OR p.proretset OR p.prokind<>'f' OR p.provolatile<>'v' OR p.proparallel<>'u' OR p.prorettype<>'jsonb'::regtype OR p.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
    OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, naijue_erp, pg_temp','TimeZone=UTC'] THEN RAISE EXCEPTION 'WHOLE_INSTALL_METADATA_DIFFERS' USING ERRCODE='55000'; END IF;
   recipient:=CASE WHEN p.proname IN ('standard_whole_package_prepare_v2','standard_whole_package_inspect_v2','standard_whole_package_verify_v2') THEN 'erp_unified27_initializer_2393dbc6db9581c2'::regrole::oid
    WHEN p.proname IN ('standard_whole_package_step_v2','standard_whole_package_finish_v2') THEN 'erp_unified27_importer_2393dbc6db9581c2'::regrole::oid ELSE p.proowner END;
   IF EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.privilege_type='EXECUTE' AND (acl.grantee NOT IN (p.proowner,recipient) OR (acl.grantee<>p.proowner AND acl.is_grantable))) THEN RAISE EXCEPTION 'WHOLE_INSTALL_ACL_UNSAFE' USING ERRCODE='42501'; END IF;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='naijue_erp.operation_receipt'::regclass AND tgname='import_operation_consistency' AND tgfoid='naijue_erp.validate_import_operation()'::regprocedure AND tgtype=5 AND tgenabled IN ('O','A') AND tgdeferrable AND tginitdeferred AND tgnargs=0 AND strpos(pg_get_triggerdef(oid,false),' WHEN ((new.target_type = ''IMPORT''::text)) EXECUTE FUNCTION ')>0)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='naijue_erp.import_batch'::regclass AND tgname='import_batch_command_consistency' AND tgfoid='naijue_erp.validate_import_batch_commit()'::regprocedure AND tgtype=21 AND tgenabled IN ('O','A') AND tgdeferrable AND tginitdeferred AND tgnargs=0 AND tgqual IS NULL)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='naijue_erp.import_record'::regclass AND tgname='import_source_final_consistency' AND tgfoid='naijue_erp.validate_import_source_commit()'::regprocedure AND tgtype=5 AND tgenabled IN ('O','A') AND tgdeferrable AND tginitdeferred AND tgnargs=0 AND tgqual IS NULL)
 THEN RAISE EXCEPTION 'WHOLE_INSTALL_DEFERRED_TRIGGER_REQUIRED' USING ERRCODE='55000'; END IF;

 -- Exact read-only trace metadata and ACL are separately pinned from volatile command functions.
 SELECT * INTO STRICT p FROM pg_catalog.pg_proc WHERE oid='naijue_erp.standard_zero_amount_archive_trace(uuid)'::regprocedure;
 IF encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>'f45ff8ef2c47db7e049178c04e48379bed1e2975f88a084b335e6c26ac856782' OR p.proowner<>current_user::regrole::oid OR NOT p.prosecdef OR NOT p.proretset OR p.provolatile<>'s' OR p.proleakproof OR p.proisstrict OR p.prokind<>'f' OR p.proparallel<>'u' OR p.prorettype<>'record'::regtype OR p.proargtypes::text<>'2950' OR p.proallargtypes IS DISTINCT FROM ARRAY['uuid'::regtype::oid,'uuid'::regtype::oid,'uuid'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'jsonb'::regtype::oid] OR p.proargmodes IS DISTINCT FROM ARRAY['i','t','t','t','t','t']::"char"[] OR p.proargnames IS DISTINCT FROM ARRAY['sales','record_id','sales_id','sales_source_key','source_namespace','proof'] OR p.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql') OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, naijue_erp, pg_temp','TimeZone=UTC'] THEN RAISE EXCEPTION 'ZERO_ARCHIVE_TRACE_METADATA_DIFFERS' USING ERRCODE='55000'; END IF;
 recipient:='erp_unified27_importer_2393dbc6db9581c2'::regrole::oid;
 IF NOT has_function_privilege(recipient,p.oid,'EXECUTE') OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.grantee NOT IN (p.proowner,recipient) OR (acl.grantee<>p.proowner AND acl.is_grantable)) THEN RAISE EXCEPTION 'ZERO_ARCHIVE_TRACE_ACL_DIFFERS' USING ERRCODE='42501'; END IF;
END $access$;
GRANT EXECUTE ON FUNCTION naijue_erp.standard_whole_package_prepare_v2(jsonb,text),naijue_erp.standard_whole_package_inspect_v2(jsonb,text),naijue_erp.standard_whole_package_verify_v2(jsonb,text) TO erp_unified27_initializer_2393dbc6db9581c2;
GRANT EXECUTE ON FUNCTION naijue_erp.standard_whole_package_step_v2(uuid,integer,text,jsonb),naijue_erp.standard_whole_package_finish_v2(uuid) TO erp_unified27_importer_2393dbc6db9581c2;
-- This opt-in whole installation exposes only whole entrypoints. Legacy source/installation is unchanged.
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_initialize_current_admin(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_import_master_chunk(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_import_baseline_keys(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_import_document_chunk(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_publish_import(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_import_status(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_import_inspect_target(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_import_verify(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
COMMIT;
