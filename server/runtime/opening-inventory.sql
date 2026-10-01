-- Explicit snapshot baseline for the Demo. The T+ source schema stays immutable.
CREATE TABLE IF NOT EXISTS inventory_opening_run (
 id text PRIMARY KEY, source_sha256 text NOT NULL, source_file text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('DEMO_ONLY','CONFIRMED_CUTOVER')),
 body jsonb NOT NULL, active boolean NOT NULL DEFAULT false,
 activated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_opening_one_active ON inventory_opening_run(active) WHERE active;
CREATE TABLE IF NOT EXISTS inventory_opening_cell (
 run_id text NOT NULL REFERENCES inventory_opening_run(id),
 warehouse_id uuid NOT NULL, sku_id uuid NOT NULL, quantity numeric(18,4) NOT NULL,
 unit text NOT NULL, source_cell text NOT NULL, source_record jsonb NOT NULL,
 PRIMARY KEY(run_id,warehouse_id,sku_id)
);
CREATE TABLE IF NOT EXISTS inventory_opening_delta_checkpoint (
 run_id text NOT NULL REFERENCES inventory_opening_run(id),
 warehouse_id uuid NOT NULL, sku_id uuid NOT NULL, quantity numeric(18,4) NOT NULL,
 PRIMARY KEY(run_id,warehouse_id,sku_id)
);
CREATE TABLE IF NOT EXISTS inventory_opening_prior_posting (
 run_id text NOT NULL REFERENCES inventory_opening_run(id), posting_id uuid NOT NULL,
 PRIMARY KEY(run_id,posting_id)
);
CREATE OR REPLACE VIEW inventory_balance_base AS
 WITH active AS (SELECT id FROM inventory_opening_run WHERE active),
 snapshot_basis AS (
   SELECT warehouse_id,sku_id variant_id,quantity FROM inventory_opening_cell WHERE run_id IN (SELECT id FROM active)
   UNION ALL
   SELECT warehouse_id,sku_id,-quantity FROM inventory_opening_delta_checkpoint WHERE run_id IN (SELECT id FROM active)
 )
 SELECT warehouse_id,variant_id,quantity FROM __SOURCE__.tplus_inventory_balance_source WHERE NOT EXISTS(SELECT 1 FROM active)
 UNION ALL
 SELECT warehouse_id,variant_id,sum(quantity) quantity FROM snapshot_basis GROUP BY warehouse_id,variant_id;

