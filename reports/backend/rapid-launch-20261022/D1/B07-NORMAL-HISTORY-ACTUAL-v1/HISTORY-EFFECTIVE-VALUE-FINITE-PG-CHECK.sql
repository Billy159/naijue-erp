-- T45 only, after exact approved successor install/current target binding.
-- No source/history/table data writes, login or HTTP. Exact failing substatement context only.
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $projection_check$
DECLARE value jsonb; revision naijue_erp.history_revision%ROWTYPE; expected jsonb; old_ambiguity_seen boolean:=false;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('naijue_erp.history_effective_writes_closed()')
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='4fbbebd6b335359b80c7df38efc99a30cb666902158c3e1f911e3c869ebac363') THEN
  RAISE EXCEPTION 'Exact qualified trigger body must be installed first' USING ERRCODE='23514'; END IF;
 revision.after_facts:='{"lines":[{"lineId":"00000000-0000-4000-8000-000000000001","quantity":"3"},{"lineId":"00000000-0000-4000-8000-000000000002","quantity":"-2"}],"settlements":[{"settlementId":"00000000-0000-4000-8000-000000000003","amount":"1.25"}]}'::jsonb;
 value:='{"line_id":"00000000-0000-4000-8000-000000000001"}'::jsonb;
 BEGIN
  SELECT item INTO STRICT expected FROM jsonb_array_elements(revision.after_facts->'lines') item WHERE item->>'lineId'=value->>'line_id';
 EXCEPTION WHEN ambiguous_column THEN old_ambiguity_seen:=true;
 END;
 IF NOT old_ambiguity_seen THEN RAISE EXCEPTION 'Original ambiguity must reproduce in this same local-variable context' USING ERRCODE='23514'; END IF;
 SELECT fact.item INTO STRICT expected FROM jsonb_array_elements(revision.after_facts->'lines') AS fact(item) WHERE fact.item->>'lineId'=value->>'line_id';
 IF expected IS DISTINCT FROM revision.after_facts->'lines'->0 THEN RAISE EXCEPTION 'Sales projection differs' USING ERRCODE='23514'; END IF;
 value:='{"line_id":"00000000-0000-4000-8000-000000000002"}'::jsonb;
 SELECT fact.item INTO STRICT expected FROM jsonb_array_elements(revision.after_facts->'lines') AS fact(item) WHERE fact.item->>'lineId'=value->>'line_id';
 IF expected IS DISTINCT FROM revision.after_facts->'lines'->1 THEN RAISE EXCEPTION 'Transfer projection differs' USING ERRCODE='23514'; END IF;
 value:='{"settlement_id":"00000000-0000-4000-8000-000000000003"}'::jsonb;
 SELECT fact.item INTO STRICT expected FROM jsonb_array_elements(revision.after_facts->'settlements') AS fact(item) WHERE fact.item->>'settlementId'=value->>'settlement_id';
 IF expected IS DISTINCT FROM revision.after_facts->'settlements'->0 THEN RAISE EXCEPTION 'Settlement projection differs' USING ERRCODE='23514'; END IF;
END $projection_check$;
SELECT 'PASS_EXACT_THREE_SRF_SUBSTATEMENTS_NOT_BUSINESS_ACCEPTANCE'::text AS status;
ROLLBACK;
