-- Personal display metadata belongs to Auth, never Source or business documents.
SET LOCAL ROLE __AUTH_OWNER__;
CREATE TABLE __AUTH__.user_preference (
  actor_id text NOT NULL REFERENCES __AUTH__.employee_login(id),
  view_id text NOT NULL CHECK (view_id = 'inventory.columns'),
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
  version integer NOT NULL CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, view_id)
);
CREATE TABLE __AUTH__.preference_request (
  actor_id text NOT NULL REFERENCES __AUTH__.employee_login(id),
  request_key text NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  response jsonb NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, request_key)
);
GRANT SELECT, INSERT, UPDATE ON __AUTH__.user_preference TO __APP__;
GRANT SELECT, INSERT ON __AUTH__.preference_request TO __APP__;
REVOKE UPDATE, DELETE, TRUNCATE ON __AUTH__.preference_request FROM PUBLIC, __APP__;
CREATE TRIGGER preference_request_immutable BEFORE UPDATE OR DELETE ON __AUTH__.preference_request
  FOR EACH ROW EXECUTE FUNCTION __AUTH__.deny_audit_mutation();
CREATE TRIGGER preference_request_no_truncate BEFORE TRUNCATE ON __AUTH__.preference_request
  FOR EACH STATEMENT EXECUTE FUNCTION __AUTH__.deny_audit_mutation();
RESET ROLE;
