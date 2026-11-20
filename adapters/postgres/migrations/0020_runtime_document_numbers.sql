-- C01-20261022-v1 group A. SQL source only; execution requires C's database window.
-- Existing/history numbers are never backfilled or changed. Gaps are intentional.
BEGIN;

CREATE SEQUENCE naijue_erp.runtime_sales_document_number_seq AS bigint START WITH 1 MINVALUE 1 NO CYCLE;
CREATE SEQUENCE naijue_erp.runtime_transfer_document_number_seq AS bigint START WITH 1 MINVALUE 1 NO CYCLE;
CREATE TABLE naijue_erp.runtime_document_number_allocation (
  document_kind text NOT NULL CHECK (document_kind IN ('SALES','TRANSFER')),
  document_id uuid NOT NULL,
  number text NOT NULL UNIQUE,
  actor_account_id uuid NOT NULL REFERENCES naijue_erp.user_account(id),
  allocated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (document_kind,document_id)
);

-- PostgreSQL refuses pre-existing LIVE duplicates rather than renumbering them.
-- Original cutoff/history numbers deliberately have no new uniqueness scope.
CREATE UNIQUE INDEX runtime_sales_number_unique ON naijue_erp.sales_header(number) WHERE stock_basis='RUNTIME_LEDGER';
CREATE UNIQUE INDEX runtime_transfer_number_unique ON naijue_erp.transfer_header(number) WHERE stock_basis='RUNTIME_LEDGER';

CREATE FUNCTION naijue_erp.assign_runtime_document_number() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, naijue_erp AS $$
DECLARE identity_row record; hall_normal boolean; sequence_value text; candidate text;
BEGIN
  IF NEW.number IS NOT NULL OR NEW.allocated_at IS DISTINCT FROM transaction_timestamp()
    OR NEW.document_kind NOT IN ('SALES','TRANSFER') THEN
    RAISE EXCEPTION 'Document number must be assigned by the database' USING ERRCODE='23514';
  END IF;
  SELECT a.login_enabled,s.role,s.employment_status,s.hall_id INTO STRICT identity_row
    FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
    WHERE a.id=NEW.actor_account_id FOR SHARE OF a,s;
  IF NOT identity_row.login_enabled OR identity_row.employment_status<>'在职'
    OR identity_row.role NOT IN ('ADMIN','WAREHOUSE','SALESPERSON')
    OR (identity_row.role='SALESPERSON' AND identity_row.hall_id IS NULL) THEN
    RAISE EXCEPTION 'Current account cannot allocate a document number' USING ERRCODE='23514';
  END IF;
  IF identity_row.hall_id IS NOT NULL THEN
    SELECT enabled INTO STRICT hall_normal FROM naijue_erp.hall WHERE id=identity_row.hall_id FOR SHARE;
    IF NOT hall_normal THEN RAISE EXCEPTION 'Current hall unavailable' USING ERRCODE='23514'; END IF;
  END IF;
  IF (NEW.document_kind='SALES' AND EXISTS(SELECT 1 FROM naijue_erp.sales_header WHERE id=NEW.document_id))
    OR (NEW.document_kind='TRANSFER' AND EXISTS(SELECT 1 FROM naijue_erp.transfer_header WHERE id=NEW.document_id)) THEN
    RAISE EXCEPTION 'Cannot adopt an existing document into a new allocation' USING ERRCODE='23514';
  END IF;
  LOOP
    IF NEW.document_kind='SALES' THEN
      sequence_value:=nextval('naijue_erp.runtime_sales_document_number_seq'::regclass)::text;
      candidate:='V2-XS-'||lpad(sequence_value,greatest(12,length(sequence_value)),'0');
    ELSE
      sequence_value:=nextval('naijue_erp.runtime_transfer_document_number_seq'::regclass)::text;
      candidate:='V2-DB-'||lpad(sequence_value,greatest(12,length(sequence_value)),'0');
    END IF;
    -- An operator may have older manually numbered runtime rows. Skip only the
    -- actual collision, keeping every old number and the full sequence value.
    EXIT WHEN NOT EXISTS(SELECT 1 FROM naijue_erp.runtime_document_number_allocation WHERE number=candidate)
      AND NOT EXISTS(SELECT 1 FROM naijue_erp.sales_header WHERE stock_basis='RUNTIME_LEDGER' AND number=candidate)
      AND NOT EXISTS(SELECT 1 FROM naijue_erp.transfer_header WHERE stock_basis='RUNTIME_LEDGER' AND number=candidate);
  END LOOP;
  NEW.number:=candidate; RETURN NEW;
END $$;
CREATE TRIGGER runtime_document_number_assign BEFORE INSERT ON naijue_erp.runtime_document_number_allocation
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.assign_runtime_document_number();
CREATE TRIGGER runtime_document_number_immutable BEFORE UPDATE OR DELETE ON naijue_erp.runtime_document_number_allocation
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER runtime_document_number_no_truncate BEFORE TRUNCATE ON naijue_erp.runtime_document_number_allocation
  EXECUTE FUNCTION naijue_erp.reject_immutable_change();

CREATE FUNCTION naijue_erp.guard_runtime_document_number() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, naijue_erp AS $$
DECLARE kind text;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.number IS DISTINCT FROM OLD.number THEN
      RAISE EXCEPTION 'A saved document number is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.stock_basis<>'RUNTIME_LEDGER' THEN RETURN NEW; END IF;
  kind:=CASE TG_TABLE_NAME WHEN 'sales_header' THEN 'SALES' WHEN 'transfer_header' THEN 'TRANSFER' END;
  IF kind IS NULL OR NOT EXISTS(SELECT 1 FROM naijue_erp.runtime_document_number_allocation a
    WHERE a.document_kind=kind AND a.document_id=NEW.id AND a.number=NEW.number AND a.actor_account_id=NEW.created_by_account_id) THEN
    RAISE EXCEPTION 'New runtime document requires its original database allocation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sales_runtime_number BEFORE INSERT OR UPDATE ON naijue_erp.sales_header
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_runtime_document_number();
CREATE TRIGGER transfer_runtime_number BEFORE INSERT OR UPDATE ON naijue_erp.transfer_header
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_runtime_document_number();

INSERT INTO naijue_erp.schema_migration(version,description)
VALUES(20,'C01-v1 immutable database runtime document number allocation; preserved history numbers');
COMMIT;
