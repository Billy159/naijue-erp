-- Local follow-on to CONTEXT-VALIDATE-ONLY.sql. Keep the full checker as fallback.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
CREATE INDEX d2_init_audit_authority_probe ON naijue_erp.audit_change (
  (operation_id::text COLLATE "C"),
  (CASE WHEN jsonb_typeof(after_values->'whole_package_v2')='object'
      AND octet_length((after_values->'whole_package_v2')::text)<=512
    THEN after_values->'whole_package_v2' END),
  ((CASE WHEN octet_length(after_values #>> '{request,operation_id}')=36
    THEN after_values #>> '{request,operation_id}' END) COLLATE "C"),
  ((CASE WHEN octet_length(after_values #>> '{request,payload,admin,account_id}')=36
    THEN after_values #>> '{request,payload,admin,account_id}' END) COLLATE "C")
) WHERE object_type='IMPORT' AND action='IMPORT_INITIALIZE_CURRENT_ADMIN';

DO $apply$
DECLARE
  helper regprocedure := 'naijue_erp.standard_whole_package_validate_context_v2(uuid,boolean)'::regprocedure;
  before_body text;
  after_body text;
  definition text;
  before_metadata jsonb;
  anchor constant text := ' SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=root_operation;';
  positive_proof constant text := $proof$
 IF NOT include_request THEN
  proof_xid:=pg_current_xact_id_if_assigned();
  IF proof_xid IS NOT NULL THEN
   proof_low_xid:=mod(proof_xid::text::numeric,4294967296)::bigint;
   SELECT rr.* INTO r FROM naijue_erp.operation_receipt rr
   WHERE rr.id=root_operation AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
     AND rr.target_type='IMPORT' AND rr.completed_at=transaction_timestamp()
     AND rr.xmin::text::bigint=proof_low_xid;
   IF FOUND THEN
    proof_marker:=jsonb_build_object('root_operation',r.id,'ordinal',0,
      'full_xid',proof_xid::text,'backend_pid',pg_backend_pid(),'controller',session_user);
    EXECUTE $authority_query$SELECT 1 FROM naijue_erp.audit_change aa
    WHERE (aa.operation_id::text COLLATE "C")=$1::text
      AND aa.object_type='IMPORT' AND aa.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
      AND (CASE WHEN jsonb_typeof(aa.after_values->'whole_package_v2')='object'
          AND octet_length((aa.after_values->'whole_package_v2')::text)<=512
        THEN aa.after_values->'whole_package_v2' END)=$2
      AND ((CASE WHEN octet_length(aa.after_values #>> '{request,operation_id}')=36
        THEN aa.after_values #>> '{request,operation_id}' END) COLLATE "C")=$1::text
      AND ((CASE WHEN octet_length(aa.after_values #>> '{request,payload,admin,account_id}')=36
        THEN aa.after_values #>> '{request,payload,admin,account_id}' END) COLLATE "C")=$3::text
      AND aa.actor_account_id=$3 AND aa.object_id=$4
      AND aa.occurred_at=$5 AND aa.xmin::text::bigint=$6$authority_query$
      INTO proof_hit USING r.id,proof_marker,r.actor_account_id,r.target_id,r.completed_at,proof_low_xid;
    IF proof_hit=1 THEN RETURN NULL; END IF;
   END IF;
  END IF;
 END IF;
$proof$;
BEGIN
  SELECT pg_get_functiondef(oid),prosrc,to_jsonb(p)-'prosrc'
  INTO STRICT definition,before_body,before_metadata FROM pg_proc p WHERE oid=helper;
  IF encode(sha256(convert_to(before_body,'UTF8')),'hex') <>
      '0f0ea9cc4ee1c341aa9d64b5e0154ac95fe4b14217aa7b8ea5493d9fd6958b2c'
    OR (before_metadata->>'proowner')::oid IS DISTINCT FROM current_user::regrole::oid
    OR (length(before_body)-length(replace(before_body,anchor,''))) <> length(anchor)
  THEN RAISE EXCEPTION 'INDEXED_AUTHORITY_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
  after_body:=replace(before_body,' root_values jsonb;',
    ' root_values jsonb; proof_xid xid8; proof_low_xid bigint; proof_marker jsonb; proof_hit integer;');
  after_body:=replace(after_body,anchor,positive_proof||anchor);
  EXECUTE replace(definition,before_body,after_body);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=helper) IS DISTINCT FROM before_metadata
  THEN RAISE EXCEPTION 'INDEXED_AUTHORITY_METADATA_DIFFERS' USING ERRCODE='55000'; END IF;
END $apply$;
COMMIT;
