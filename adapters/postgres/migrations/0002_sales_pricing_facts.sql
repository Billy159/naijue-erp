-- VERSION 0002: explicit new-runtime sales pricing intent, additive to immutable 0001.
-- Review-only artifact; NOT executed against PostgreSQL.
BEGIN;
ALTER TABLE naijue_erp.sales_line
  ADD COLUMN pricing_rule text,
  ADD COLUMN discount_tenths integer,
  ADD COLUMN zero_confirmed boolean;

-- Existing-row backfill policy: deliberately NONE. Existing rows retain all three NULL.
-- A historic amount ratio cannot prove discount intent, and a historic zero cannot prove confirmation.
-- The domain preserves unknown rows for readback/reversal, but refuses active SAVE/APPROVE
-- until an explicit reviewed edit supplies all pricing facts. No original-sale links are introduced.
ALTER TABLE naijue_erp.sales_line ADD CONSTRAINT sales_line_pricing_facts CHECK (
  (pricing_rule IS NULL AND discount_tenths IS NULL AND zero_confirmed IS NULL)
  OR (pricing_rule IS NOT NULL AND zero_confirmed IS NOT NULL
    AND ((pricing_rule = 'UNIT_PRICE' AND discount_tenths IS NULL)
      OR (pricing_rule = 'DISCOUNT' AND discount_tenths IS NOT NULL AND discount_tenths BETWEEN 0 AND 100)))
);
COMMENT ON COLUMN naijue_erp.sales_line.pricing_rule IS 'UNIT_PRICE or DISCOUNT; NULL means unknown pre-0002 intent, never derived from price ratio.';
COMMENT ON COLUMN naijue_erp.sales_line.discount_tenths IS 'Explicit integer 0..100 = 0.0..10.0 折; NULL for direct price or unknown pre-0002 intent.';
COMMENT ON COLUMN naijue_erp.sales_line.zero_confirmed IS 'Explicit ordinary-zero confirmation; NULL is unknown and must not be upgraded to true by backfill.';
COMMENT ON COLUMN naijue_erp.sales_line.line_amount IS 'Signed gross: integer quantity times deal price. Net = line_amount minus allocated_discount.';
INSERT INTO naijue_erp.schema_migration (version, description) VALUES (2, 'Explicit sales pricing facts; unknown existing metadata is not backfilled');
COMMIT;
