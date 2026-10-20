-- VERSION 0003: additive authentication-session schema and migration-version metadata only.
-- Review-only artifact, not executed. No accounts, credentials, session rows or business-data backfill.
BEGIN;
CREATE TABLE naijue_erp.auth_session (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  account_id uuid NOT NULL REFERENCES naijue_erp.user_account(id),
  auth_version integer NOT NULL CHECK (auth_version > 0),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_session_account ON naijue_erp.auth_session (account_id);
CREATE INDEX auth_session_expiry ON naijue_erp.auth_session (expires_at);
INSERT INTO naijue_erp.schema_migration (version, description) VALUES (3, 'Opaque session hashes and authentication-version invalidation; no account seeds');
COMMIT;
