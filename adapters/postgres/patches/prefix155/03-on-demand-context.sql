-- Local SQL39 follow-on to CONTEXT-SINGLE-READ.sql.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $apply$
DECLARE
  original regprocedure := 'naijue_erp.standard_whole_package_context_v2(uuid)'::regprocedure;
  definitions constant jsonb := $callers$[{"signature":"naijue_erp.assert_document_conversion_batch(naijue_erp.import_batch,pg_catalog.jsonb,pg_catalog.text,pg_catalog.bool)","bodySha256":"f72c7138e67e5d1460f6ad704a809fff981bb553de5c8f0c29600b234ef5e887","calls":[{"line":7,"text":"IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;","use":"AUTHORITY_ONLY"}]},{"signature":"naijue_erp.assert_standard_import_operation(uuid)","bodySha256":"1f649917a82e00192b28ca77aff760976e2d29c3d83b82b98f6d5e3237d8dbfa","calls":[{"line":10,"text":"PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid);","use":"AUTHORITY_ONLY"}]},{"signature":"naijue_erp.guard_header_native_reference_publication()","bodySha256":"e61e07b05d2e3b1695abc81ec9cc6b3407d6c3675f7458b2c92bc93a10cc3184","calls":[{"line":56,"text":"IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;","use":"AUTHORITY_ONLY"}]},{"signature":"naijue_erp.guard_history_publication()","bodySha256":"deb5e8506e8d8afa0ed02a3d7a04d84c990b938774b251ccc932b0c79d8017fe","calls":[{"line":57,"text":"IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;","use":"AUTHORITY_ONLY"}]},{"signature":"naijue_erp.guard_history_typed_publication()","bodySha256":"ccc5be6db8f4101b2fbd151d13c3aa0feacdc44fd07d04b8bfcf673d3cf10f47","calls":[{"line":57,"text":"IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;","use":"AUTHORITY_ONLY"}]},{"signature":"naijue_erp.guard_import_accounting_publication()","bodySha256":"deb5e8506e8d8afa0ed02a3d7a04d84c990b938774b251ccc932b0c79d8017fe","calls":[{"line":57,"text":"IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;","use":"AUTHORITY_ONLY"}]},{"signature":"naijue_erp.guard_native_catalogue_publication()","bodySha256":"e61e07b05d2e3b1695abc81ec9cc6b3407d6c3675f7458b2c92bc93a10cc3184","calls":[{"line":56,"text":"IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;","use":"AUTHORITY_ONLY"}]},{"signature":"naijue_erp.guard_native_payment_publication()","bodySha256":"e61e07b05d2e3b1695abc81ec9cc6b3407d6c3675f7458b2c92bc93a10cc3184","calls":[{"line":56,"text":"IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;","use":"AUTHORITY_ONLY"}]},{"signature":"naijue_erp.guard_successor_publication26()","bodySha256":"e6a14deae57f6f63e203566f8cd3acb6944f6ae6415a1660f180175e4b7378d5","calls":[{"line":57,"text":"IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;","use":"AUTHORITY_ONLY"}]},{"signature":"naijue_erp.is_native_party_import_insert(text,jsonb)","bodySha256":"8561c5a4837eb85e0a13a8ec63a7326b2cf3c9df4d0da5d371534d3ddee3368e","calls":[{"line":15,"text":"IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;","use":"AUTHORITY_ONLY"}]},{"signature":"naijue_erp.standard_import_row_intent(text,jsonb)","bodySha256":"4ea68e6eee19a05be7ad9aaa7eefcfb33bbf9af2d41a790c808e3b2693aef3ed","calls":[{"line":16,"text":"PERFORM naijue_erp.standard_whole_package_context_v2((exact_audit.after_values->'whole_package_v2'->>'root_operation')::uuid);","use":"AUTHORITY_ONLY"}]},{"signature":"naijue_erp.standard_whole_package_finish_v2(uuid)","bodySha256":"f0786b4001d586a6d268aa579a68e338d12522dc4b7aec88578d2d9289b1cb58","calls":[{"line":4,"text":"PERFORM naijue_erp.standard_whole_package_context_v2(init_operation);","use":"AUTHORITY_ONLY"}]},{"signature":"naijue_erp.validate_import_source_commit()","bodySha256":"72d8f8bb1e78de21848df2be29ba75dd8e5c97c5349164ca32c432b433e007ae","calls":[{"line":9,"text":"PERFORM naijue_erp.standard_whole_package_context_v2(member_root);","use":"AUTHORITY_ONLY"}]},{"signature":"naijue_erp.validate_sparse_balance_commit()","bodySha256":"dc98d189239d97774a3b319813e27e37eb04489a517d81de2d9cca85b6019714","calls":[{"line":26,"text":"PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid);","use":"AUTHORITY_ONLY"}]}]$callers$;
  item jsonb;
  routine regprocedure;
  body text;
  next_body text;
  original_definition text;
  meta jsonb;
  marker_unused text;
  context_call text;
  marker constant text := ' RETURN jsonb_build_object(''actor'',r.actor_account_id,''request'',root_values->''request'',''marker'',marker);';
BEGIN
  SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO STRICT body,original_definition,meta
    FROM pg_proc p WHERE p.oid=original;
  IF encode(sha256(convert_to(body,'UTF8')),'hex') IS DISTINCT FROM '6988c561933e27cf204bddaa390f10c63ad933b908a6da79563bf6bf491b5892'
    OR (meta->>'proowner')::oid IS DISTINCT FROM current_user::regrole::oid
    OR strpos(body,marker)=0
  THEN RAISE EXCEPTION 'CONTEXT_PROJECTION_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
  -- One implementation owns every role, receipt, marker, PID and xmin check.
  -- Only the final, unused JSON construction may be omitted.
  next_body:=replace(body,marker,E' IF NOT include_request THEN RETURN NULL; END IF;\n'||marker);
  EXECUTE replace(replace(original_definition,
    '.standard_whole_package_context_v2(root_operation uuid)', '.standard_whole_package_validate_context_v2(root_operation uuid, include_request boolean)'),
    body,next_body);
  REVOKE ALL ON FUNCTION naijue_erp.standard_whole_package_validate_context_v2(uuid,boolean)
    FROM PUBLIC, erp_unified27_initializer_2393dbc6db9581c2, erp_unified27_importer_2393dbc6db9581c2, erp_unified27_runtime_2393dbc6db9581c2;
  EXECUTE replace(original_definition,body,E'\nBEGIN\n RETURN naijue_erp.standard_whole_package_validate_context_v2(root_operation,true);\nEND ');
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=original) IS DISTINCT FROM meta THEN
    RAISE EXCEPTION 'CONTEXT_PROJECTION_METADATA_DIFFERS' USING ERRCODE='55000';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(definitions) LOOP
    routine:=(item->>'signature')::regprocedure;
    SELECT p.prosrc,to_jsonb(p)-'prosrc' INTO STRICT body,meta FROM pg_proc p WHERE p.oid=routine;
    IF encode(sha256(convert_to(body,'UTF8')),'hex') IS DISTINCT FROM item->>'bodySha256'
      OR (meta->>'proowner')::oid IS DISTINCT FROM current_user::regrole::oid
    THEN RAISE EXCEPTION 'CONTEXT_PROJECTION_CALLER_DIFFERS: %',routine USING ERRCODE='55000'; END IF;
    marker_unused := item->'calls'->0->>'text';
    context_call := substring(marker_unused FROM 'PERFORM naijue_erp[.]standard_whole_package_context_v2\((.*)\);');
    IF context_call IS NULL OR strpos(body,marker_unused)=0 THEN
      RAISE EXCEPTION 'CONTEXT_PROJECTION_CALLSITE_DIFFERS: %',routine USING ERRCODE='55000';
    END IF;
    next_body:=replace(body,
      'PERFORM naijue_erp.standard_whole_package_context_v2('||context_call||');',
      'PERFORM naijue_erp.standard_whole_package_validate_context_v2('||context_call||',false);');
    EXECUTE replace(pg_get_functiondef(routine),body,next_body);
    IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=routine) IS DISTINCT FROM meta THEN
      RAISE EXCEPTION 'CONTEXT_PROJECTION_METADATA_DIFFERS: %',routine USING ERRCODE='55000';
    END IF;
  END LOOP;
END $apply$;
COMMIT;
