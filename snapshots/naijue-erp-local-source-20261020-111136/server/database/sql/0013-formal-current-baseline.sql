-- T33 additive, explicitly authorized component. Core migration 0001..0012 remains unchanged.
SET LOCAL ROLE __RUNTIME_OWNER__;
CREATE TABLE __RUNTIME__.inventory_formal_baseline_schema (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  component_sha256 text NOT NULL CHECK(component_sha256 ~ '^[a-f0-9]{64}$'),
  installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO __RUNTIME__.inventory_formal_baseline_schema(singleton,component_sha256)
  VALUES(true,'__COMPONENT_SHA256__');
CREATE TABLE __RUNTIME__.inventory_formal_baseline_run (
  id text PRIMARY KEY,
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK(singleton),
  manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
  source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
  body jsonb NOT NULL CHECK(body->>'dataClass'='USER_APPROVED_FORMAL_BASELINE')
    CHECK(body->>'quantityMethod'='DERIVED_FROM_TARGET_INVENTORY')
    CHECK(body->>'historicalTimelineCompletenessClaimed'='false'),
  target jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,manifest_sha256)
);
CREATE TABLE __RUNTIME__.inventory_formal_baseline_chunk (
  run_id text NOT NULL,
  manifest_sha256 text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('ENDPOINTS','OPENINGS','MAPPINGS')),
  ordinal integer NOT NULL CHECK(ordinal>0),
  row_count integer NOT NULL CHECK(row_count>0),
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload text NOT NULL CHECK(octet_length(payload) BETWEEN 1 AND 262144)
    CHECK(payload_sha256=encode(sha256(convert_to(payload,'UTF8')),'hex')),
  PRIMARY KEY(run_id,kind,ordinal),
  FOREIGN KEY(run_id,manifest_sha256) REFERENCES __RUNTIME__.inventory_formal_baseline_run(id,manifest_sha256)
);
CREATE TABLE __RUNTIME__.inventory_formal_baseline_cell (
  run_id text NOT NULL REFERENCES __RUNTIME__.inventory_formal_baseline_run(id),
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
CREATE TABLE __RUNTIME__.inventory_formal_baseline_activation (
  run_id text PRIMARY KEY REFERENCES __RUNTIME__.inventory_formal_baseline_run(id),
  manifest_sha256 text NOT NULL,
  source_sha256 text NOT NULL,
  authorization_sha256 text NOT NULL CHECK(authorization_sha256 ~ '^[a-f0-9]{64}$'),
  target jsonb NOT NULL,
  evidence jsonb NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(run_id,manifest_sha256) REFERENCES __RUNTIME__.inventory_formal_baseline_run(id,manifest_sha256)
);
CREATE TABLE __RUNTIME__.inventory_formal_baseline_document (
  run_id text NOT NULL REFERENCES __RUNTIME__.inventory_formal_baseline_run(id),
  document_id uuid NOT NULL REFERENCES __RUNTIME__.document(id),
  source_canonical_id text NOT NULL,
  imported_revision integer NOT NULL,
  imported_body_sha256 text NOT NULL,
  stock_terms_sha256 text NOT NULL,
  leg_count integer NOT NULL CHECK(leg_count>=0),
  proof jsonb NOT NULL,
  PRIMARY KEY(run_id,document_id),
  UNIQUE(run_id,source_canonical_id)
);
CREATE TABLE __RUNTIME__.inventory_formal_baseline_document_leg (
  run_id text NOT NULL,
  document_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK(ordinal>=0),
  warehouse_id uuid NOT NULL,
  sku_id uuid NOT NULL,
  unit text NOT NULL CHECK(length(unit) BETWEEN 1 AND 64),
  counted_quantity numeric(18,4) NOT NULL,
  approval_quantity numeric(18,4) NOT NULL,
  PRIMARY KEY(run_id,document_id,ordinal),
  FOREIGN KEY(run_id,document_id) REFERENCES __RUNTIME__.inventory_formal_baseline_document(run_id,document_id)
);
CREATE TABLE __RUNTIME__.inventory_formal_baseline_movement (
  run_id text NOT NULL REFERENCES __RUNTIME__.inventory_formal_baseline_activation(run_id),
  posting_id uuid NOT NULL REFERENCES __RUNTIME__.posting(id),
  leg_index integer NOT NULL CHECK(leg_index>=0),
  warehouse_id uuid NOT NULL,
  sku_id uuid NOT NULL,
  unit text NOT NULL CHECK(length(unit) BETWEEN 1 AND 64),
  quantity numeric(18,4) NOT NULL,
  proof jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(run_id,posting_id,leg_index)
);
CREATE VIEW __RUNTIME__.inventory_formal_baseline_projection AS
  WITH run AS (SELECT id FROM __RUNTIME__.inventory_formal_baseline_run),
  changes AS (
    SELECT run_id,warehouse_id,sku_id,unit,sum(quantity) quantity
      FROM __RUNTIME__.inventory_formal_baseline_movement GROUP BY run_id,warehouse_id,sku_id,unit
  ), keys AS (
    SELECT run_id,warehouse_id,sku_id,unit FROM __RUNTIME__.inventory_formal_baseline_cell
    UNION SELECT run_id,warehouse_id,sku_id,unit FROM changes
  ) SELECT k.run_id,k.warehouse_id,k.sku_id,k.unit,
    coalesce(c.source_key,jsonb_build_array(k.warehouse_id::text,k.sku_id::text,k.unit)::text) source_key,
    coalesce(c.confirmed_opening,0) confirmed_opening,coalesce(c.source_net,0) source_net,
    coalesce(c.endpoint_count,0) endpoint_count,
    coalesce(c.proof,jsonb_build_object('kind','POST_ACTIVATION_NEW_QUANTITY_KEY','historicalTimelineCompletenessClaimed',false)) proof,
    coalesce(d.quantity,0) current_delta,
    coalesce(c.confirmed_opening,0)+coalesce(c.source_net,0)+coalesce(d.quantity,0) quantity
    FROM keys k JOIN run r ON r.id=k.run_id
    LEFT JOIN __RUNTIME__.inventory_formal_baseline_cell c USING(run_id,warehouse_id,sku_id,unit)
    LEFT JOIN changes d USING(run_id,warehouse_id,sku_id,unit);
DO $protect$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_formal_baseline_schema','inventory_formal_baseline_run','inventory_formal_baseline_chunk',
    'inventory_formal_baseline_cell','inventory_formal_baseline_activation','inventory_formal_baseline_document',
    'inventory_formal_baseline_document_leg','inventory_formal_baseline_movement'] LOOP
    EXECUTE format('CREATE TRIGGER formal_baseline_immutable BEFORE UPDATE OR DELETE ON __RUNTIME__.%I FOR EACH ROW EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation()',t);
    EXECUTE format('CREATE TRIGGER formal_baseline_no_truncate BEFORE TRUNCATE ON __RUNTIME__.%I FOR EACH STATEMENT EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation()',t);
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON __RUNTIME__.%I FROM __APP__',t);
    EXECUTE format('GRANT SELECT ON __RUNTIME__.%I TO __APP__',t);
    IF t<>'inventory_formal_baseline_schema' THEN
      EXECUTE format('GRANT INSERT ON __RUNTIME__.%I TO __APP__',t);
    END IF;
  END LOOP;
END $protect$;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON __RUNTIME__.inventory_formal_baseline_projection FROM __APP__;
GRANT SELECT ON __RUNTIME__.inventory_formal_baseline_projection TO __APP__;
RESET ROLE;
