-- VERSION 0010: approved original payment-method identity on native sales settlements.
-- SQL SOURCE ONLY. Not executed. No source-data read, backfill, new table or invented identity.
BEGIN;
DO $$
DECLARE installed integer[];
BEGIN
  SELECT array_agg(version ORDER BY version) INTO installed FROM naijue_erp.schema_migration;
  IF installed IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8,9] THEN
    RAISE EXCEPTION 'settlement method identity requires the exact reviewed 0001-0009 prefix' USING ERRCODE = '23514';
  END IF;
END;
$$;
ALTER TABLE naijue_erp.sales_settlement
  ADD COLUMN payment_method_id_snapshot uuid REFERENCES naijue_erp.payment_method(id);
-- Existing unknowns stay NULL. New/current server writes capture the actual method
-- from the account in their original transaction; preserved original rows keep their snapshot.
COMMENT ON COLUMN naijue_erp.sales_settlement.payment_method_id_snapshot IS
  'Original payment-method identity, captured server-side. Existing unknown NULL is never inferred from a display name or the account current method; unknown cannot qualify recent-use recommendation.';
INSERT INTO naijue_erp.schema_migration (version, description)
VALUES (10, 'Approved original sales-settlement payment-method snapshot identity; no guessed historical backfill; SQL source only');
COMMIT;
