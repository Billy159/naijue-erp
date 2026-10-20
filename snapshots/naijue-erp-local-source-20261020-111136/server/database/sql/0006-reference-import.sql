SET LOCAL ROLE __RUNTIME_OWNER__;
CREATE TABLE __RUNTIME__.reference_import_batch (
  batch_id text PRIMARY KEY,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  actor_id text NOT NULL,
  source jsonb NOT NULL,
  response jsonb NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE __RUNTIME__.reference_import_row (
  batch_id text NOT NULL REFERENCES __RUNTIME__.reference_import_batch(batch_id),
  row_key text NOT NULL,
  kind text NOT NULL,
  target_id text NOT NULL,
  input_hash text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY (batch_id,row_key)
);
GRANT SELECT, INSERT ON __RUNTIME__.reference_import_batch, __RUNTIME__.reference_import_row TO __APP__;
REVOKE UPDATE, DELETE, TRUNCATE ON __RUNTIME__.reference_import_batch, __RUNTIME__.reference_import_row FROM PUBLIC, __APP__;
CREATE TRIGGER reference_import_batch_immutable BEFORE UPDATE OR DELETE ON __RUNTIME__.reference_import_batch
  FOR EACH ROW EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();
CREATE TRIGGER reference_import_batch_no_truncate BEFORE TRUNCATE ON __RUNTIME__.reference_import_batch
  FOR EACH STATEMENT EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();
CREATE TRIGGER reference_import_row_immutable BEFORE UPDATE OR DELETE ON __RUNTIME__.reference_import_row
  FOR EACH ROW EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();
CREATE TRIGGER reference_import_row_no_truncate BEFORE TRUNCATE ON __RUNTIME__.reference_import_row
  FOR EACH STATEMENT EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();
RESET ROLE;
