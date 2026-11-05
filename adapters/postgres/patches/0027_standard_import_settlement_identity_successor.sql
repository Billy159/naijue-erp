-- Source45: permit only a fresh same-transaction, exact protected standard
-- settlement intent; committed source identities remain retired and protected.
-- Header-owner locking, same-owner UPSERT and all deferred validation are retained.
-- Source27/42/43/44 and original initialization/import plan remain immutable.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp;
SET LOCAL TimeZone='UTC';
DO $before$
DECLARE routine_row record;
BEGIN
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY(SELECT generate_series(1,27)) OR (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>168 THEN RAISE EXCEPTION 'STANDARD45_EXACT_COHORT_REQUIRED' USING ERRCODE='23514'; END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='naijue_erp.assert_standard_import_operation(uuid)'::regprocedure)<>'aa0df41c4376343dd206361452aae3d59ff517c041e4654be52816e21c40f9f4'
  OR (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='naijue_erp.validate_baseline_source_commit()'::regprocedure)<>'c5f0eb66c654852f8cb4dfa181e594304b65400f1538135f91701afabe14b1f4'
  OR (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='naijue_erp.assert_document_conversion_batch(naijue_erp.import_batch,jsonb,text,boolean)'::regprocedure)<>'c5b7a0b4d44748df3e19491c3426d547de331385a58c839a76aea90cd5e1c2ff' THEN RAISE EXCEPTION 'STANDARD45_SOURCE44_LINEAGE_DIFFERS' USING ERRCODE='23514'; END IF;
 SELECT p.* INTO STRICT routine_row FROM pg_proc p WHERE p.oid='naijue_erp.guard_retained_settlement_identity()'::regprocedure;
 IF encode(sha256(convert_to(routine_row.prosrc,'UTF8')),'hex')<>'12c13344ab5c786db30fe3b7bc0af1ad3b270c6433bf6245311de5f9f17c2022' THEN RAISE EXCEPTION 'STANDARD45_PREDECESSOR_BODY_DIFFERS' USING ERRCODE='23514'; END IF;
 IF encode(sha256(convert_to((to_jsonb(routine_row)-'prosrc')::text,'UTF8')),'hex')<>'d7daae8e1a092b0f0c6234673d2e8278fe16b0c22ba8ff134c09104393e8694e' OR routine_row.prosecdef OR routine_row.proowner<>(SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp') THEN RAISE EXCEPTION 'STANDARD45_PREDECESSOR_METADATA_DIFFERS' USING ERRCODE='23514'; END IF;
END $before$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_retained_settlement_identity() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
 -- INSERT ... ON CONFLICT UPDATE runs this guard before conflict resolution.
 -- Lock the canonical owner first, as ordinary DELETE/UPDATE do, so a concurrent
 -- deletion cannot turn an allowed existing-row UPSERT into retired-ID reuse.
 PERFORM 1 FROM naijue_erp.sales_header WHERE id=NEW.sales_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'settlement canonical sales owner must exist' USING ERRCODE='23503'; END IF;
 -- A source-bound existing row may be updated through the common SAVE path;
 -- the owner, exact before/after and same-transaction audit guards remain.
 -- A removed occurrence survives in immutable audit and cannot be resurrected.
 IF EXISTS(SELECT 1 FROM naijue_erp.import_record retained_record
   WHERE retained_record.target_type='SALES_SETTLEMENT' AND retained_record.target_id=NEW.id AND retained_record.status IN ('ACCEPTED','IMPORTED')
    AND (retained_record.xmin::text::bigint IS DISTINCT FROM mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      OR naijue_erp.standard_import_row_intent('SALES_SETTLEMENT',to_jsonb(NEW)) IS DISTINCT FROM true))
   AND NOT EXISTS(SELECT 1 FROM naijue_erp.sales_settlement WHERE id=NEW.id AND sales_id=NEW.sales_id) THEN
  RAISE EXCEPTION 'retired source settlement identity cannot be recycled' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

DO $after$
DECLARE routine_row record;
BEGIN
 SELECT p.* INTO STRICT routine_row FROM pg_proc p WHERE p.oid='naijue_erp.guard_retained_settlement_identity()'::regprocedure;
 IF encode(sha256(convert_to(routine_row.prosrc,'UTF8')),'hex')<>'3bd3d7cb19a1418ffe340cd72eda7fe8ec7b43023461f763b74a2d54b5ddc345' THEN RAISE EXCEPTION 'STANDARD45_REPLACEMENT_BODY_DIFFERS' USING ERRCODE='23514'; END IF;
 IF encode(sha256(convert_to((to_jsonb(routine_row)-'prosrc')::text,'UTF8')),'hex')<>'d7daae8e1a092b0f0c6234673d2e8278fe16b0c22ba8ff134c09104393e8694e' THEN RAISE EXCEPTION 'STANDARD45_NONBODY_METADATA_CHANGED' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>168 THEN RAISE EXCEPTION 'STANDARD45_ROUTINE_COUNT_CHANGED' USING ERRCODE='23514'; END IF;
END $after$;
COMMIT;
