-- Versioned isolated-install companion V1. No function body or trigger changes.
-- Exact source cohort only; failure rolls back this reduction with the caller's transaction.
BEGIN;
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
COMMIT;
