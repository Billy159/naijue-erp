-- Scope: isolated/reviewed target only. Retains fit IDs, rows, references and
-- source code values. Does not migrate or rewrite any data or barcode binding.
-- Existing uppercase source codes remain valid for historical readability;
-- the six confirmed numeric business codes are also accepted.
ALTER TABLE naijue_erp.fit DROP CONSTRAINT fit_code_check;
ALTER TABLE naijue_erp.fit ADD CONSTRAINT fit_code_check
  CHECK (code ~ '^[A-Z356789]$');
