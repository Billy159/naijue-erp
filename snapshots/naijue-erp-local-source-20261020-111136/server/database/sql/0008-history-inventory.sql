-- T33: unit-preserving history calculation basis. Only explicit isolated imports may create a run.
SET LOCAL ROLE __RUNTIME_OWNER__;

CREATE TABLE __RUNTIME__.inventory_history_run (
  id text PRIMARY KEY,
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  body jsonb NOT NULL,
  target jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE __RUNTIME__.inventory_history_cell (
  run_id text NOT NULL REFERENCES __RUNTIME__.inventory_history_run(id),
  warehouse_id uuid NOT NULL,
  sku_id uuid NOT NULL,
  unit text NOT NULL CHECK (length(unit) BETWEEN 1 AND 64),
  quantity numeric(18,4) NOT NULL,
  proof jsonb NOT NULL,
  PRIMARY KEY(run_id,warehouse_id,sku_id,unit)
);
CREATE TABLE __RUNTIME__.inventory_history_event (
  run_id text NOT NULL REFERENCES __RUNTIME__.inventory_history_run(id),
  event_id text NOT NULL,
  document_id uuid,
  body jsonb NOT NULL,
  PRIMARY KEY(run_id,event_id),
  UNIQUE(run_id,document_id)
);
CREATE TABLE __RUNTIME__.inventory_history_event_leg (
  run_id text NOT NULL,
  event_id text NOT NULL,
  boundary text NOT NULL CHECK(boundary IN ('OPENING','CUTOFF')),
  contribution_id text NOT NULL,
  warehouse_id uuid NOT NULL,
  sku_id uuid NOT NULL,
  unit text NOT NULL,
  quantity numeric(18,4) NOT NULL,
  proof jsonb NOT NULL,
  PRIMARY KEY(run_id,event_id,boundary,contribution_id),
  FOREIGN KEY(run_id,event_id) REFERENCES __RUNTIME__.inventory_history_event(run_id,event_id)
);
CREATE TABLE __RUNTIME__.inventory_history_alias (
  run_id text NOT NULL,
  source_number text NOT NULL,
  event_id text NOT NULL,
  PRIMARY KEY(run_id,source_number),
  FOREIGN KEY(run_id,event_id) REFERENCES __RUNTIME__.inventory_history_event(run_id,event_id)
);
CREATE TABLE __RUNTIME__.inventory_history_change (
  run_id text NOT NULL REFERENCES __RUNTIME__.inventory_history_run(id),
  event_id text NOT NULL,
  ordinal integer NOT NULL CHECK(ordinal>0),
  request_key text NOT NULL,
  payload_sha256 text NOT NULL,
  actor_id text NOT NULL,
  inputs jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id,event_id,ordinal),
  UNIQUE(run_id,request_key)
);
CREATE TABLE __RUNTIME__.inventory_history_movement (
  run_id text NOT NULL REFERENCES __RUNTIME__.inventory_history_run(id),
  identity text NOT NULL,
  leg_index integer NOT NULL,
  warehouse_id uuid NOT NULL,
  sku_id uuid NOT NULL,
  unit text NOT NULL CHECK (length(unit) BETWEEN 1 AND 64),
  quantity numeric(18,4) NOT NULL,
  posting_id uuid REFERENCES __RUNTIME__.posting(id),
  proof jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id,identity,leg_index)
);
CREATE TABLE __RUNTIME__.inventory_history_delta (
  run_id text NOT NULL REFERENCES __RUNTIME__.inventory_history_run(id),
  warehouse_id uuid NOT NULL,
  sku_id uuid NOT NULL,
  unit text NOT NULL CHECK (length(unit) BETWEEN 1 AND 64),
  quantity numeric(18,4) NOT NULL,
  PRIMARY KEY(run_id,warehouse_id,sku_id,unit)
);

CREATE VIEW __RUNTIME__.inventory_history_projection AS
  WITH base AS (SELECT run_id,warehouse_id,sku_id,unit,quantity FROM __RUNTIME__.inventory_history_cell),
  effective AS (SELECT run_id,warehouse_id,sku_id,unit,sum(quantity) quantity FROM __RUNTIME__.inventory_history_movement GROUP BY run_id,warehouse_id,sku_id,unit),
  keys AS (SELECT run_id,warehouse_id,sku_id,unit FROM base UNION SELECT run_id,warehouse_id,sku_id,unit FROM __RUNTIME__.inventory_history_delta
    UNION SELECT run_id,warehouse_id,sku_id,unit FROM effective)
  SELECT k.*,coalesce(b.quantity,0) opening_quantity,coalesce(d.quantity,0) current_delta,coalesce(e.quantity,0) effective_quantity,
    coalesce(b.quantity,0)+coalesce(d.quantity,0) quantity,coalesce(d.quantity,0)-coalesce(e.quantity,0) reconciliation_difference
  FROM keys k LEFT JOIN base b USING(run_id,warehouse_id,sku_id,unit)
    LEFT JOIN __RUNTIME__.inventory_history_delta d USING(run_id,warehouse_id,sku_id,unit)
    LEFT JOIN effective e USING(run_id,warehouse_id,sku_id,unit);

DO $protect$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_history_run','inventory_history_cell','inventory_history_event','inventory_history_alias',
    'inventory_history_event_leg','inventory_history_change','inventory_history_movement'] LOOP
    EXECUTE format('CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON __RUNTIME__.%I FOR EACH ROW EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation()',t);
    EXECUTE format('CREATE TRIGGER history_no_truncate BEFORE TRUNCATE ON __RUNTIME__.%I FOR EACH STATEMENT EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation()',t);
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON __RUNTIME__.%I FROM __APP__',t);
    EXECUTE format('GRANT SELECT, INSERT ON __RUNTIME__.%I TO __APP__',t);
  END LOOP;
END $protect$;
GRANT SELECT, INSERT, UPDATE ON __RUNTIME__.inventory_history_delta TO __APP__;
REVOKE DELETE, TRUNCATE ON __RUNTIME__.inventory_history_delta FROM __APP__;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON __RUNTIME__.inventory_history_projection FROM __APP__;
GRANT SELECT ON __RUNTIME__.inventory_history_projection TO __APP__;
RESET ROLE;
