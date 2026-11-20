-- C01-20261022-v1 group D: exactly twenty-nine approved columns.
-- WIP SCHEMA FOUNDATION ONLY. The original history_revision_closed trigger and
-- original receipt/action/ledger constraints deliberately remain in force.
-- Effective writes below are also closed until the complete revision, original
-- manifest, authorization, audit/receipt and delta guards are implemented here
-- and independently verified in a C-coordinated PostgreSQL window.
BEGIN;
ALTER TABLE naijue_erp.history_revision ADD COLUMN operation_id uuid NOT NULL UNIQUE
  REFERENCES naijue_erp.operation_receipt(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.operation_receipt
  ADD COLUMN target_history_sales_id uuid GENERATED ALWAYS AS (CASE WHEN target_type='HISTORY_SALES' THEN target_id END) STORED
    REFERENCES naijue_erp.history_sales_header(id) DEFERRABLE INITIALLY DEFERRED,
  ADD COLUMN target_history_transfer_id uuid GENERATED ALWAYS AS (CASE WHEN target_type='HISTORY_TRANSFER' THEN target_id END) STORED
    REFERENCES naijue_erp.history_transfer_header(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.audit_change
  ADD COLUMN object_history_sales_id uuid GENERATED ALWAYS AS (CASE WHEN object_type='HISTORY_SALES' THEN object_id END) STORED
    REFERENCES naijue_erp.history_sales_header(id) DEFERRABLE INITIALLY DEFERRED,
  ADD COLUMN object_history_transfer_id uuid GENERATED ALWAYS AS (CASE WHEN object_type='HISTORY_TRANSFER' THEN object_id END) STORED
    REFERENCES naijue_erp.history_transfer_header(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.inventory_ledger
  ADD COLUMN source_history_revision_id uuid REFERENCES naijue_erp.history_revision(id) DEFERRABLE INITIALLY DEFERRED,
  ADD COLUMN source_history_sales_line_id uuid REFERENCES naijue_erp.history_sales_line(id),
  ADD COLUMN source_history_transfer_line_id uuid REFERENCES naijue_erp.history_transfer_line(id);

CREATE TABLE naijue_erp.history_sales_effective (
  header_id uuid PRIMARY KEY REFERENCES naijue_erp.history_sales_header(id),
  version integer NOT NULL CHECK(version>1),
  revision_id uuid NOT NULL REFERENCES naijue_erp.history_revision(id) DEFERRABLE INITIALLY DEFERRED,
  gross_amount numeric(18,2) NOT NULL,
  order_discount numeric(18,2) NOT NULL CHECK(order_discount>=0),
  net_due numeric(18,2) NOT NULL
);
CREATE TABLE naijue_erp.history_transfer_effective (
  header_id uuid PRIMARY KEY REFERENCES naijue_erp.history_transfer_header(id),
  version integer NOT NULL CHECK(version>1),
  revision_id uuid NOT NULL REFERENCES naijue_erp.history_revision(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE naijue_erp.history_sales_line_effective (
  line_id uuid PRIMARY KEY REFERENCES naijue_erp.history_sales_line(id),
  revision_id uuid NOT NULL REFERENCES naijue_erp.history_revision(id) DEFERRABLE INITIALLY DEFERRED,
  quantity bigint NOT NULL,
  deal_price numeric(18,2) NOT NULL CHECK(deal_price>=0),
  line_amount numeric(18,2) NOT NULL,
  allocated_discount numeric(18,2) CHECK(allocated_discount>=0)
);
CREATE TABLE naijue_erp.history_transfer_line_effective (
  line_id uuid PRIMARY KEY REFERENCES naijue_erp.history_transfer_line(id),
  revision_id uuid NOT NULL REFERENCES naijue_erp.history_revision(id) DEFERRABLE INITIALLY DEFERRED,
  quantity bigint NOT NULL
);
CREATE TABLE naijue_erp.history_sales_settlement_effective (
  settlement_id uuid PRIMARY KEY REFERENCES naijue_erp.history_sales_settlement(id),
  revision_id uuid NOT NULL REFERENCES naijue_erp.history_revision(id) DEFERRABLE INITIALLY DEFERRED,
  amount numeric(18,2) NOT NULL CHECK(amount>=0)
);
CREATE FUNCTION naijue_erp.history_effective_writes_closed() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  RAISE EXCEPTION 'Complete reviewed HISTORY revision capability is not installed' USING ERRCODE='23514';
END $$;
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['history_sales_effective','history_transfer_effective','history_sales_line_effective','history_transfer_line_effective','history_sales_settlement_effective'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.%I FOR EACH ROW EXECUTE FUNCTION naijue_erp.history_effective_writes_closed()',relation_name||'_write_closed',relation_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON naijue_erp.%I EXECUTE FUNCTION naijue_erp.reject_immutable_change()',relation_name||'_no_truncate',relation_name);
    EXECUTE format('REVOKE ALL ON naijue_erp.%I FROM PUBLIC',relation_name);
  END LOOP;
END $$;
INSERT INTO naijue_erp.schema_migration(version,description) VALUES(24,'C01-v1 HISTORY projection schema foundation; controlled revision writes remain CLOSED pending complete capability');
COMMIT;
