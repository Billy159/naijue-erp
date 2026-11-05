\set ON_ERROR_STOP on
-- LOCAL CODEX ONLY: a disposable synthetic target with original staff schema,
-- before installing the successor. Never run on production or real personnel.
-- Caller must independently bind its synthetic target and take a fresh postcheck.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
-- Same additive DDL as the successor, within the test-owned transaction.
ALTER TABLE naijue_erp.staff ADD COLUMN departure_date date;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='naijue_erp.staff'::regclass AND attname='departure_date' AND atttypid='date'::regtype AND NOT attnotnull AND NOT atthasdef AND NOT attisdropped) THEN RAISE EXCEPTION 'departure date catalog mismatch'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='naijue_erp.staff'::regclass AND attname='role' AND attnotnull) THEN RAISE EXCEPTION 'role requirement changed'; END IF;
END $$;
-- Independent typed storage probe; no account/staff/business rows are changed.
CREATE TEMP TABLE departure_date_vectors(value date) ON COMMIT DROP;
INSERT INTO departure_date_vectors VALUES (NULL),('2024-02-29');
DO $$
BEGIN
 IF (SELECT count(*) FROM departure_date_vectors WHERE value IS NULL)<>1 OR (SELECT count(*) FROM departure_date_vectors WHERE value=DATE '2024-02-29')<>1 THEN RAISE EXCEPTION 'date roundtrip failed'; END IF;
 BEGIN
  INSERT INTO departure_date_vectors VALUES ('2023-02-29');
  RAISE EXCEPTION 'invalid date accepted';
 EXCEPTION WHEN datetime_field_overflow THEN NULL;
 END;
END $$;
ROLLBACK;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='naijue_erp.staff'::regclass AND attname='departure_date' AND NOT attisdropped) THEN RAISE EXCEPTION 'test DDL not restored'; END IF;
END $$;
