-- SOURCE-ONLY candidate. Not registered in the installation chain or executed.
-- Remove the unconditional legacy composite-type binding from the historical
-- balance trigger. Historical receipt dispatch and its entire validator remain.
-- Exact predecessor and non-body metadata are checked before/after replacement.
-- Requires an independently reviewed exclusive schema-writer window and exact
-- chain/ACL/trigger admission; preserving an ACL does not certify its contents.
-- Legacy capability and downstream body-hash pins need separate reconciliation.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $change$
DECLARE before_routine record; after_routine record; definition text; changed text;
  old_declaration constant text := 'revision naijue_erp.history_revision%ROWTYPE';
  new_declaration constant text := 'revision record';
BEGIN
  SELECT p.* INTO STRICT before_routine FROM pg_catalog.pg_proc p
    WHERE p.oid=pg_catalog.to_regprocedure('naijue_erp.validate_history_numeric_balance_commit()');
  IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_routine.prosrc,'UTF8')),'hex')
       IS DISTINCT FROM 'fab0bf7a3f1681d6034b09dbb5c7ad8efa606c6fa82f24fc101bc5b70636a837'
    OR before_routine.proowner IS DISTINCT FROM (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp')
    OR before_routine.proowner IS DISTINCT FROM current_user::regrole::oid
    OR before_routine.prosecdef OR before_routine.prokind IS DISTINCT FROM 'f'
    OR before_routine.prorettype IS DISTINCT FROM 'pg_catalog.trigger'::regtype::oid
    OR before_routine.prolang IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
    OR before_routine.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, naijue_erp, pg_temp']
  THEN RAISE EXCEPTION 'HISTORY_BALANCE_ROWTYPE_PREDECESSOR_DIFFERS' USING ERRCODE='23514'; END IF;
  definition := pg_catalog.pg_get_functiondef(before_routine.oid);
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_declaration,'')))
       IS DISTINCT FROM pg_catalog.length(old_declaration)
  THEN RAISE EXCEPTION 'HISTORY_BALANCE_ROWTYPE_DECLARATION_DIFFERS' USING ERRCODE='23514'; END IF;
  changed := pg_catalog.replace(definition,old_declaration,new_declaration);
  EXECUTE changed;
  SELECT p.* INTO STRICT after_routine FROM pg_catalog.pg_proc p WHERE p.oid=before_routine.oid;
  IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_routine.prosrc,'UTF8')),'hex')
       IS DISTINCT FROM 'e7c3b1082f5c5fd5b6634c8db26df08af2e6e7296a7297a5b1af28aa76e6d703'
    OR (pg_catalog.to_jsonb(after_routine)-'prosrc') IS DISTINCT FROM (pg_catalog.to_jsonb(before_routine)-'prosrc')
  THEN RAISE EXCEPTION 'HISTORY_BALANCE_ROWTYPE_UNEXPECTED_CHANGE' USING ERRCODE='23514'; END IF;
END $change$;
COMMIT;
