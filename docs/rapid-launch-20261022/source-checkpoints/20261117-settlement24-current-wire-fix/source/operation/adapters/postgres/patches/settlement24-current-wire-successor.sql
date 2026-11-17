-- Exact current161 three-routine approved-wire successor. No business data DML.
-- Execution still requires the existing owner/current-target/finite admission.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
SET LOCAL quote_all_identifiers=off;
DO $settlement24_current_wire$
DECLARE changes jsonb:=$settlement24_specs$[{"signature":"naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)","beforeBodySha256":"cc11ea590f93b579a0e1286a2c28bd2fc7a6b423a366bc35ef54406a4cc46fba","beforeDefinitionSha256":"3bcc7f4bd796df962c6794e1fe2b63e1a92df269f78d431af7b0fefc7f3c97b6","afterBodySha256":"ed028cc873d9d4dd556dd60b790fca8ef912550b463a949736f214acefd5dcbd","afterDefinitionSha256":"ed9e5daa0797e7ced0caa920f4c6d8ad465c7edcf01ed20b903d5f3f1d4ee869","replacements":[{"before":"sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b'","after":"(sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' OR (sr_wire->>'sha256'='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05' AND (sr_approval->>'source_namespace') IS NOT DISTINCT FROM 'naijue:tplus:20261102' AND (request->>'package_manifest_sha256') IS NOT DISTINCT FROM '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'))"},{"before":"CASE WHEN cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' THEN 24","after":"CASE WHEN (cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' OR (cfg->'historical_settlement_retention_approval'->>'sha256'='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05' AND (initial_request->>'namespace') IS NOT DISTINCT FROM 'naijue:tplus:20261102' AND (initial_request->>'package_manifest_sha256') IS NOT DISTINCT FROM '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679')) THEN 24"},{"before":"CASE WHEN cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' THEN 26","after":"CASE WHEN (cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' OR (cfg->'historical_settlement_retention_approval'->>'sha256'='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05' AND (initial_request->>'namespace') IS NOT DISTINCT FROM 'naijue:tplus:20261102' AND (initial_request->>'package_manifest_sha256') IS NOT DISTINCT FROM '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679')) THEN 26"}]},{"signature":"naijue_erp.assert_document_migration(uuid)","beforeBodySha256":"508188784710a0bebaa7cf2d32e188f20ab82918e67a34b681d7b9d44951f5f4","beforeDefinitionSha256":"3b44e33fd7d32d1ba33b2b520a1c62ac93f04c55198475d404eb2cdadd3e31ce","afterBodySha256":"45269a5359a89ae4e36383cbf4dec7fea4017bc9677a90b96df0eaf0e011c39f","afterDefinitionSha256":"51f8516e6d82124fb440569ff7faae0c1eefff32c2d4b835b444eb190d2371eb","replacements":[{"before":"sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b'","after":"(sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' OR (sr_wire->>'sha256'='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05' AND (sr_approval->>'source_namespace') IS NOT DISTINCT FROM 'naijue:tplus:20261102' AND (sr_request->>'package_manifest_sha256') IS NOT DISTINCT FROM '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'))"}]},{"signature":"naijue_erp.standard_whole_package_verify_v2(jsonb,text)","beforeBodySha256":"8e490d4abdfaa1e8faa4a3ee3a7fe43d87c73521b1836818ae126db83acbbab8","beforeDefinitionSha256":"fcad22a97e86d0b4c0226dbd6014600a7fecd9fa4923785aaf2983ee89b53eca","afterBodySha256":"005f47f4925a9d4118d7dcc461a42fe2568a4cddd21b2e73f28bae18ba5892ee","afterDefinitionSha256":"5433d23324c4f4d999d086f22759363232ae5484de5591f0969dd37ede2b858c","replacements":[{"before":"sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b'","after":"(sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' OR (sr_wire->>'sha256'='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05' AND (sr_approval->>'source_namespace') IS NOT DISTINCT FROM 'naijue:tplus:20261102' AND (init_request->>'package_manifest_sha256') IS NOT DISTINCT FROM '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'))"}]}]$settlement24_specs$::jsonb;
 change jsonb; edit jsonb; routine_oid oid; observed_body text; observed_definition text;
 next_body text; next_definition text; metadata_before jsonb; metadata_after jsonb;
BEGIN
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  routine_oid:=to_regprocedure(change->>'signature');
  IF routine_oid IS NULL THEN RAISE EXCEPTION 'SETTLEMENT24_PREDECESSOR_MISSING' USING ERRCODE='55000'; END IF;
  SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-ARRAY['oid','prosrc']
   INTO STRICT observed_body,observed_definition,metadata_before FROM pg_proc p WHERE p.oid=routine_oid;
  IF current_user IS DISTINCT FROM pg_get_userbyid((metadata_before->>'proowner')::oid)
   OR encode(sha256(convert_to(observed_body,'UTF8')),'hex') IS DISTINCT FROM change->>'beforeBodySha256'
   OR encode(sha256(convert_to(observed_definition,'UTF8')),'hex') IS DISTINCT FROM change->>'beforeDefinitionSha256' THEN
   RAISE EXCEPTION 'SETTLEMENT24_EXACT_PREDECESSOR_REQUIRED' USING ERRCODE='55000'; END IF;
  next_body:=observed_body;
  FOR edit IN SELECT value FROM jsonb_array_elements(change->'replacements') LOOP
   IF length(edit->>'before')=0 OR (length(next_body)-length(replace(next_body,edit->>'before','')))/length(edit->>'before')<>1 THEN
    RAISE EXCEPTION 'SETTLEMENT24_EXACT_SOURCE_ANCHOR_REQUIRED' USING ERRCODE='55000'; END IF;
   next_body:=replace(next_body,edit->>'before',edit->>'after');
  END LOOP;
  IF encode(sha256(convert_to(next_body,'UTF8')),'hex') IS DISTINCT FROM change->>'afterBodySha256'
   OR (length(observed_definition)-length(replace(observed_definition,observed_body,'')))/length(observed_body)<>1 THEN
   RAISE EXCEPTION 'SETTLEMENT24_EXACT_SUCCESSOR_REQUIRED' USING ERRCODE='55000'; END IF;
  next_definition:=replace(observed_definition,observed_body,next_body);
  IF encode(sha256(convert_to(next_definition,'UTF8')),'hex') IS DISTINCT FROM change->>'afterDefinitionSha256' THEN
   RAISE EXCEPTION 'SETTLEMENT24_EXACT_DEFINITION_REQUIRED' USING ERRCODE='55000'; END IF;
  EXECUTE next_definition;
  SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-ARRAY['oid','prosrc']
   INTO STRICT observed_body,observed_definition,metadata_after FROM pg_proc p WHERE p.oid=routine_oid;
  IF metadata_after IS DISTINCT FROM metadata_before
   OR encode(sha256(convert_to(observed_body,'UTF8')),'hex') IS DISTINCT FROM change->>'afterBodySha256'
   OR encode(sha256(convert_to(observed_definition,'UTF8')),'hex') IS DISTINCT FROM change->>'afterDefinitionSha256' THEN
   RAISE EXCEPTION 'SETTLEMENT24_EXACT_READBACK_REQUIRED' USING ERRCODE='55000'; END IF;
 END LOOP;
END $settlement24_current_wire$;
COMMIT;
