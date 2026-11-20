-- Ordinary business retention successor; source validation remains import-only.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $check$
BEGIN
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_catalog.pg_proc
   WHERE oid='naijue_erp.guard_retained_settlement_identity()'::regprocedure)<>'3bd3d7cb19a1418ffe340cd72eda7fe8ec7b43023461f763b74a2d54b5ddc345'
 THEN RAISE EXCEPTION 'PUBLISHED_SETTLEMENT_PREDECESSOR_DIFFERS'; END IF;
END $check$;
CREATE OR REPLACE FUNCTION naijue_erp.guard_retained_settlement_identity() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp,pg_temp AS $$
BEGIN
 -- INSERT ... ON CONFLICT UPDATE runs this guard before conflict resolution.
 -- Lock the canonical owner first, as ordinary DELETE/UPDATE do, so a concurrent
 -- deletion cannot turn an allowed existing-row UPSERT into retired-ID reuse.
 PERFORM 1 FROM naijue_erp.sales_header WHERE id=NEW.sales_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'settlement canonical sales owner must exist' USING ERRCODE='23503'; END IF;
 -- Runtime identity retention is a business audit concern, not a source map read.
 IF current_user='erp_unified27_runtime_2393dbc6db9581c2' THEN
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.sales_settlement WHERE id=NEW.id AND sales_id=NEW.sales_id)
   AND EXISTS(SELECT 1 FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id
     WHERE a.object_type='SALES' AND r.target_type='SALES' AND r.target_id=a.object_id
       AND r.status='COMMITTED' AND r.action=a.action AND r.actor_account_id=a.actor_account_id
       AND r.completed_at=a.occurred_at AND EXISTS(
         SELECT 1 FROM jsonb_array_elements(coalesce(a.before_values->'settlements','[]'::jsonb)
           ||coalesce(a.after_values->'settlements','[]'::jsonb)) item WHERE item->>'id'=NEW.id::text)) THEN
   RAISE EXCEPTION 'retired ordinary settlement identity cannot be recycled' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 -- Import-only predecessor source checks remain unchanged.
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

COMMIT;
