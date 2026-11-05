-- Execute only after independently resolving every numeric fit code through a
-- separately approved data-preserving migration. This script never rewrites it.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM naijue_erp.fit WHERE code !~ '^[A-Z]$') THEN
    RAISE EXCEPTION 'rollback blocked: fit codes not accepted by old constraint' USING ERRCODE = '23514';
  END IF;
END $$;
ALTER TABLE naijue_erp.fit DROP CONSTRAINT fit_code_check;
ALTER TABLE naijue_erp.fit ADD CONSTRAINT fit_code_check CHECK (code ~ '^[A-Z]$');
