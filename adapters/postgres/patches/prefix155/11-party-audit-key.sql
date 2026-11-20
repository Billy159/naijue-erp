-- Single-function delta after the exact frozen ten layers (155/114).
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $apply$
DECLARE routine regprocedure:='naijue_erp.is_native_party_import_insert(text,jsonb)'::regprocedure;
 original text; definition text; metadata jsonb;
 next_body constant text:=$body$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
 -- STANDARD27_BRANCH_BEGIN
 IF current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (EXISTS(SELECT 1 FROM jsonb_array_elements(after_values->'records') exact_item WHERE exact_item->>'target_type'=kind AND exact_item->>'target_id'=snapshot->>'id')));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_validate_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid,false); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values ? 'whole_package_v2' THEN b.status:=r.result_data->>'status'; END IF;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    IF (
WITH bound AS MATERIALIZED (
 SELECT a AS audit_row, r AS receipt_row, b AS batch_row,
        mod(pg_current_xact_id()::text::numeric,4294967296)::bigint AS xid_low
), current_audit AS MATERIALIZED (
 -- Restrict the real heap row by the actual UUID key before any whole-row or
 -- JSON predicates. The scalar subquery is a one-row bound value, not LIMIT 1.
 -- Keep the selected heap xmin separately: a copied composite has no xmin.
 SELECT aa AS audit_row, aa.xmin AS audit_heap_xmin
 FROM naijue_erp.audit_change aa
 WHERE aa.operation_id=(SELECT (q.audit_row).operation_id FROM bound q)
), live_context AS MATERIALIZED (
 SELECT ca.audit_row AS audit_row, rr AS receipt_row, bb AS batch_row, q.xid_low,
        (ca.audit_row).after_values#>'{records}' AS records_value
 FROM bound q
 JOIN current_audit ca ON (ca.audit_row).operation_id=(q.audit_row).operation_id
 JOIN naijue_erp.operation_receipt rr ON rr.id=(ca.audit_row).operation_id
 JOIN naijue_erp.import_batch bb ON bb.id=rr.target_id
 WHERE ca.audit_row IS NOT DISTINCT FROM q.audit_row
   AND ROW(rr.*)::naijue_erp.operation_receipt IS NOT DISTINCT FROM q.receipt_row
   -- The unchanged prefix deliberately projects b.status from this receipt.
   -- Compare the remaining REAL batch fields; do not require the physical row
   -- to already have the checkpoint status that will be written after INSERTs.
   AND ROW(bb.*)::naijue_erp.import_batch IS NOT DISTINCT FROM
       jsonb_populate_record(q.batch_row,jsonb_build_object('status',bb.status))
   AND (q.batch_row).status=rr.result_data->>'status'
   AND (ca.audit_row).id=rr.id
   AND ca.audit_heap_xmin::text::bigint=q.xid_low AND rr.xmin::text::bigint=q.xid_low
   AND (ca.audit_row).object_type='IMPORT' AND rr.target_type='IMPORT'
   AND (ca.audit_row).object_id=rr.target_id AND rr.target_id=bb.id
   AND (ca.audit_row).actor_account_id=rr.actor_account_id AND (ca.audit_row).action=rr.action
   AND (ca.audit_row).occurred_at=rr.completed_at AND rr.completed_at=transaction_timestamp()
   AND rr.status='COMMITTED' AND rr.action='IMPORT_CHUNK'
   AND jsonb_typeof((ca.audit_row).after_values)='object' AND jsonb_typeof(rr.result_data)='object'
   AND (ca.audit_row).after_values#>>'{profile}'='STANDARD_IMPORT_SQL_V1'
   AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
   AND (ca.audit_row).after_values#>>'{phase}'='MASTER'
   AND rr.result_data->>'phase'='MASTER'
   AND bb.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   AND bb.inventory_mode='CUTOFF_STOCK_BASELINE'
   AND (q.batch_row).status IN ('STAGED','VALIDATING')
   AND (ca.audit_row).after_values#>>'{request,namespace}'=bb.source_name
   AND rr.result_data->>'packageManifestSha256'=bb.source_hash
   AND jsonb_typeof((ca.audit_row).after_values#>'{whole_package_v2}')='object'
   AND jsonb_typeof((ca.audit_row).after_values#>'{whole_package_v2,root_operation}')='string'
   AND ((ca.audit_row).after_values#>>'{whole_package_v2,root_operation}') COLLATE "C"
       ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
   -- Explicit JSON null also misses: the original proof treats it as present.
   AND ((ca.audit_row).after_values->'historical_hall_target_captures') IS NULL
   AND NOT (rr.result_data ? 'historicalHallTargetCapturesSha256')
), record_array AS MATERIALIZED (
 SELECT c.*,
   CASE WHEN jsonb_typeof(c.records_value)='array' THEN c.records_value ELSE '[]'::jsonb END AS safe_array
 FROM live_context c
), record_shape AS MATERIALIZED (
 SELECT c.*, NOT EXISTS (
   SELECT 1 FROM jsonb_array_elements(c.safe_array) v(item)
   WHERE (
     jsonb_typeof(v.item)='object'
     AND jsonb_typeof(v.item->'id')='string'
     AND jsonb_typeof(v.item->'entity_type')='string'
     AND jsonb_typeof(v.item->'target_type')='string'
     AND jsonb_typeof(v.item->'target_id')='string'
     AND jsonb_typeof(v.item->'source_key')='string'
     AND jsonb_typeof(v.item->'source_hash')='string'
     AND jsonb_typeof(v.item->'file_ref')='string'
     AND jsonb_typeof(v.item->'fields')='object'
     AND NOT (v.item ?| ARRAY['historical_hall_evidence','zero_amount_archive',
                           'explicit_zero_evidence','historical_line_amount_evidence'])
     AND (
       (v.item->>'entity_type'='BATCH_NAMESPACE_BINDING' AND v.item->>'target_type'='IMPORT_BATCH'
        AND (v.item->'source_refs') IS NULL)
       OR (
         v.item->>'entity_type'=v.item->>'target_type'
         AND v.item->>'target_type' IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF',
           'PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON',
           'PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE',
           'PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL')
         AND jsonb_typeof(v.item->'source_refs')='array'
         AND jsonb_array_length(CASE WHEN jsonb_typeof(v.item->'source_refs')='array'
                                    THEN v.item->'source_refs' ELSE '[]'::jsonb END)>0
       )
     )
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.item->'source_refs')='array'
                                               THEN v.item->'source_refs' ELSE '[]'::jsonb END) AS refs(ref)
       WHERE jsonb_typeof(refs.ref) IS DISTINCT FROM 'object'
     )
     AND NOT EXISTS (
       SELECT refs.ref FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.item->'source_refs')='array'
                                                  THEN v.item->'source_refs' ELSE '[]'::jsonb END) AS refs(ref)
       GROUP BY refs.ref HAVING count(*)>1
     )
   ) IS NOT TRUE
 ) AS all_supported_shapes
 FROM record_array c
), record_members AS MATERIALIZED (
 SELECT (c.receipt_row).id AS receipt_id,
        (c.receipt_row).completed_at AS receipt_completed_at,
        (c.batch_row).id AS batch_id,
        (c.batch_row).source_name AS batch_source_name,c.xid_low,v.*
 FROM record_shape c
 CROSS JOIN LATERAL jsonb_to_recordset(
   CASE WHEN c.all_supported_shapes THEN c.safe_array ELSE '[]'::jsonb END
 ) AS v(id text,entity_type text,target_type text,target_id text,source_key text,
        source_hash text,file_ref text,fields jsonb,source_refs jsonb)
), record_checks AS MATERIALIZED (
 SELECT m.id, (
   s.id IS NOT NULL AND s.xmin::text::bigint=m.xid_low
   AND s.import_batch_id=m.batch_id
   AND s.status='IMPORTED' AND s.reviewed_at IS NOT NULL
   AND s.reviewed_at=m.receipt_completed_at
   AND s.source_system=m.batch_source_name
   AND s.source_key=m.source_key AND s.source_entity_type=m.entity_type
   AND s.target_type=m.target_type AND s.target_id::text COLLATE "C"=m.target_id COLLATE "C"
   AND s.source_record_hash=m.source_hash AND s.source_file_ref=m.file_ref
   AND CASE WHEN pg_input_is_valid(s.decision_reason,'jsonb')
            THEN s.decision_reason::jsonb ELSE NULL::jsonb END
       =jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND',
                          'operationId',m.receipt_id)
   -- Stronger than the ordinary proof: recompute the actual original MASTER digest.
   -- The namespace binding intentionally uses its original fields-only digest.
   AND m.source_hash=encode(sha256(convert_to(
     CASE WHEN m.entity_type='BATCH_NAMESPACE_BINDING' AND m.target_type='IMPORT_BATCH'
          THEN m.fields::text
          ELSE jsonb_build_object('source_key',m.source_key,'fields',m.fields,'source_refs',m.source_refs)::text
     END,'UTF8')),'hex')
   AND (m.entity_type<>'BATCH_NAMESPACE_BINDING'
        OR (m.target_id=m.batch_id::text AND m.source_key=m.batch_id::text))
 ) IS TRUE AS all_predicates_hold
 FROM record_members m
 LEFT JOIN naijue_erp.import_record s ON s.id::text COLLATE "C"=m.id COLLATE "C"
)
SELECT EXISTS(SELECT 1 FROM live_context)
   AND EXISTS(SELECT 1 FROM record_members)
   AND NOT EXISTS(SELECT 1 FROM record_array ra WHERE jsonb_typeof(ra.records_value) IS DISTINCT FROM 'array')
   AND NOT EXISTS(SELECT 1 FROM record_shape rs WHERE NOT rs.all_supported_shapes)
   -- This count checks only uniqueness, never substitutes for predicate coverage.
   AND NOT EXISTS(SELECT rm.id COLLATE "C" FROM record_members rm GROUP BY rm.id COLLATE "C" HAVING count(*)>1)
   AND NOT EXISTS(SELECT 1 FROM record_checks rc WHERE NOT rc.all_predicates_hold)
   AS entire_record_set_sufficient
    ) IS NOT TRUE THEN
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;
    END IF;

    IF kind IS NULL OR kind NOT IN ('CUSTOMER','SUPPLIER') OR phase_name IS DISTINCT FROM 'MASTER'
      OR b.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      OR b.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE' OR b.status NOT IN ('STAGED','VALIDATING')
      OR snapshot->'version' IS DISTINCT FROM '1'::jsonb THEN
      RAISE EXCEPTION 'STANDARD27_PARTY_CONTEXT_INVALID' USING ERRCODE='23514'; END IF;
    SELECT count(*) INTO intent_count FROM jsonb_array_elements(a.after_values->'records') value
      WHERE value->>'target_type'=kind AND value->>'target_id'=snapshot->>'id';
    IF intent_count<>1 THEN RAISE EXCEPTION 'STANDARD27_PARTY_INTENT_REQUIRED' USING ERRCODE='23514'; END IF;
    SELECT value INTO STRICT item FROM jsonb_array_elements(a.after_values->'records') value
      WHERE value->>'target_type'=kind AND value->>'target_id'=snapshot->>'id';
    IF item->>'entity_type' IS DISTINCT FROM kind OR item->'fields'->>'id' IS DISTINCT FROM snapshot->>'id'
      OR coalesce(length(item->>'source_key'),0)=0 OR coalesce(length(btrim(item->>'file_ref')),0)=0
      OR jsonb_typeof(item->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'source_refs')<1
      OR item->>'source_hash' IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_object(
        'source_key',item->>'source_key','fields',item->'fields','source_refs',item->'source_refs')::text,'UTF8')),'hex') THEN
      RAISE EXCEPTION 'STANDARD27_PARTY_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
    IF kind='CUSTOMER' THEN expected:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.customer,item->'fields'));
    ELSE expected:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.supplier,item->'fields')); END IF;
    IF expected IS DISTINCT FROM snapshot OR naijue_erp.standard_import_row_intent(kind,snapshot) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'STANDARD27_PARTY_ROW_INVALID' USING ERRCODE='23514'; END IF;
    RETURN true;
 END IF;
 -- A nonstandard caller cannot borrow a retained standard identity as legacy
 -- evidence. Return false (not an exception) so an UPDATE caller evaluating
 -- its INSERT predicate eagerly still reaches its unchanged runtime checks.
 IF EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE target_type=kind AND target_id::text=snapshot->>'id'
   AND decision_reason LIKE '%STANDARD_IMPORT_POINTER_V1%') THEN RETURN false; END IF;
 -- STANDARD27_BRANCH_END
 -- Fresh-only: no legacy creation intent can authorize an ordinary INSERT.
 -- False runs the caller's original live receipt/actor/time checks.
 RETURN false;
END;
$body$;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO STRICT original,definition,metadata
 FROM pg_proc p WHERE oid=routine;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '0825eeca6eadb145f05c07fe1c420289261b5e56a3ed64e5832d8c8e90fe346b'
 OR (metadata->>'proowner')::oid IS DISTINCT FROM current_user::regrole::oid
 THEN RAISE EXCEPTION 'PARTY_SET_PROOF_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
 EXECUTE replace(definition,original,next_body);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=routine) IS DISTINCT FROM metadata
 OR (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=routine)
 IS DISTINCT FROM 'd89543f7875e02c1ef202a0b63012ee6f490c0960837345394e5355f17890fbb'
 THEN RAISE EXCEPTION 'PARTY_SET_PROOF_METADATA_DIFFERS' USING ERRCODE='55000'; END IF;
END $apply$;
COMMIT;
