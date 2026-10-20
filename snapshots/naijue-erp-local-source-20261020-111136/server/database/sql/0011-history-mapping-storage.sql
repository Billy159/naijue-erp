-- T33: lossless bounded mapping payloads, bound to the immutable history manifest.
SET LOCAL ROLE __RUNTIME_OWNER__;
ALTER TABLE __RUNTIME__.inventory_history_run ADD CONSTRAINT history_run_manifest_binding UNIQUE(id,manifest_sha256);
CREATE TABLE __RUNTIME__.inventory_history_mapping_chunk (
  run_id text NOT NULL,
  manifest_sha256 text NOT NULL,
  ordinal integer NOT NULL CHECK(ordinal>0),
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  payload text NOT NULL CHECK(octet_length(payload) BETWEEN 1 AND 262144)
    CHECK(payload_sha256=encode(sha256(convert_to(payload,'UTF8')),'hex')),
  PRIMARY KEY(run_id,ordinal),
  FOREIGN KEY(run_id,manifest_sha256) REFERENCES __RUNTIME__.inventory_history_run(id,manifest_sha256)
);
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON __RUNTIME__.inventory_history_mapping_chunk
  FOR EACH ROW EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();
CREATE TRIGGER history_no_truncate BEFORE TRUNCATE ON __RUNTIME__.inventory_history_mapping_chunk
  FOR EACH STATEMENT EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();
REVOKE UPDATE, DELETE, TRUNCATE ON __RUNTIME__.inventory_history_mapping_chunk FROM __APP__;
GRANT SELECT, INSERT ON __RUNTIME__.inventory_history_mapping_chunk TO __APP__;
RESET ROLE;
