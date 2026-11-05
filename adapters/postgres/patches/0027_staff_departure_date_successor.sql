-- Explicit additive successor. Run only as part of the reviewed target install.
-- No backfill, default, role change, login creation, or guessed historical date.
BEGIN;
ALTER TABLE naijue_erp.staff ADD COLUMN departure_date date;
COMMENT ON COLUMN naijue_erp.staff.departure_date IS 'Source departure calendar date; NULL means unknown. Not an audit timestamp.';
COMMIT;
