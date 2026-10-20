-- T33: explicitly NON_FINAL current-export calibration; no invented historical timeline.
SET LOCAL ROLE __RUNTIME_OWNER__;
CREATE TABLE __RUNTIME__.inventory_quantity_identity (
  kind text NOT NULL CHECK(kind IN ('WAREHOUSE','SKU')),
  target_key text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  generated_in_target boolean NOT NULL,
  evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[a-f0-9]{64}$'),
  body jsonb NOT NULL,
  PRIMARY KEY(kind,target_key),
  UNIQUE(kind,id)
);
CREATE TABLE __RUNTIME__.inventory_current_export_run (
  id text PRIMARY KEY,
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK(singleton),
  manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
  body jsonb NOT NULL CHECK(body->>'dataClass'='NON_FINAL')
    CHECK(body->>'sourceQuantityPolicy'='USER_CONFIRMED_CURRENT_EXPORT_TARGET_CALIBRATION')
    CHECK(body->>'quantityMethod'='DERIVED_FROM_TARGET_INVENTORY')
    CHECK(body->>'historicalTimelineCompletenessClaimed'='false'),
  target jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,manifest_sha256)
);
CREATE TABLE __RUNTIME__.inventory_current_export_chunk (
  run_id text NOT NULL,
  manifest_sha256 text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('ENDPOINTS','OPENINGS','MAPPINGS')),
  ordinal integer NOT NULL CHECK(ordinal>0),
  row_count integer NOT NULL CHECK(row_count>0),
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload text NOT NULL CHECK(octet_length(payload) BETWEEN 1 AND 262144)
    CHECK(payload_sha256=encode(sha256(convert_to(payload,'UTF8')),'hex')),
  PRIMARY KEY(run_id,kind,ordinal),
  FOREIGN KEY(run_id,manifest_sha256) REFERENCES __RUNTIME__.inventory_current_export_run(id,manifest_sha256)
);
CREATE TABLE __RUNTIME__.inventory_current_export_cell (
  run_id text NOT NULL REFERENCES __RUNTIME__.inventory_current_export_run(id),
  source_key text NOT NULL,
  warehouse_id uuid NOT NULL,
  sku_id uuid NOT NULL,
  warehouse_kind text NOT NULL DEFAULT 'WAREHOUSE' CHECK(warehouse_kind='WAREHOUSE'),
  sku_kind text NOT NULL DEFAULT 'SKU' CHECK(sku_kind='SKU'),
  unit text NOT NULL CHECK(length(unit) BETWEEN 1 AND 64),
  confirmed_opening numeric(18,4) NOT NULL,
  source_net numeric(18,4) NOT NULL,
  endpoint_count integer NOT NULL CHECK(endpoint_count>=0),
  proof jsonb NOT NULL,
  PRIMARY KEY(run_id,source_key),
  UNIQUE(run_id,warehouse_id,sku_id,unit),
  FOREIGN KEY(warehouse_kind,warehouse_id) REFERENCES __RUNTIME__.inventory_quantity_identity(kind,id),
  FOREIGN KEY(sku_kind,sku_id) REFERENCES __RUNTIME__.inventory_quantity_identity(kind,id)
);
CREATE VIEW __RUNTIME__.inventory_current_export_projection AS
  SELECT c.run_id,c.source_key,c.warehouse_id,c.sku_id,c.unit,c.confirmed_opening,c.source_net,c.endpoint_count,c.proof,
    c.confirmed_opening+c.source_net quantity
  FROM __RUNTIME__.inventory_current_export_cell c;
DO $protect$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_quantity_identity','inventory_current_export_run','inventory_current_export_chunk','inventory_current_export_cell'] LOOP
    EXECUTE format('CREATE TRIGGER current_export_immutable BEFORE UPDATE OR DELETE ON __RUNTIME__.%I FOR EACH ROW EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation()',t);
    EXECUTE format('CREATE TRIGGER current_export_no_truncate BEFORE TRUNCATE ON __RUNTIME__.%I FOR EACH STATEMENT EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation()',t);
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON __RUNTIME__.%I FROM __APP__',t);
    EXECUTE format('GRANT SELECT, INSERT ON __RUNTIME__.%I TO __APP__',t);
  END LOOP;
END $protect$;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON __RUNTIME__.inventory_current_export_projection FROM __APP__;
GRANT SELECT ON __RUNTIME__.inventory_current_export_projection TO __APP__;
RESET ROLE;
