-- Version 0004: immutable cutover coverage and the only mutable opening-run flag.
SET LOCAL ROLE __RUNTIME_OWNER__;

CREATE TABLE __RUNTIME__.inventory_opening_prior_document (
    run_id text NOT NULL REFERENCES __RUNTIME__.inventory_opening_run(id),
    document_id uuid NOT NULL,
    revision integer NOT NULL,
    effect_identity text NOT NULL,
    CONSTRAINT inventory_opening_prior_document_pkey PRIMARY KEY (run_id, document_id, revision),
    CONSTRAINT inventory_opening_prior_document_effect_key UNIQUE (run_id, effect_identity),
    CONSTRAINT inventory_opening_prior_document_revision_fkey FOREIGN KEY (document_id, revision)
      REFERENCES __RUNTIME__.revision(document_id, revision)
);

CREATE INDEX inventory_opening_prior_document_lookup
  ON __RUNTIME__.inventory_opening_prior_document USING btree (run_id, document_id);

CREATE FUNCTION __RUNTIME__.protect_opening_run() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog
AS $immutable$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'IMMUTABLE_OPENING_MANIFEST'; END IF;
  IF (NEW.id,NEW.source_sha256,NEW.source_file,NEW.mode,NEW.body,NEW.activated_at)
      IS DISTINCT FROM (OLD.id,OLD.source_sha256,OLD.source_file,OLD.mode,OLD.body,OLD.activated_at) THEN
    RAISE EXCEPTION 'IMMUTABLE_OPENING_MANIFEST';
  END IF;
  RETURN NEW;
END $immutable$;

CREATE TRIGGER inventory_opening_run_immutable BEFORE UPDATE OR DELETE ON __RUNTIME__.inventory_opening_run
  FOR EACH ROW EXECUTE FUNCTION __RUNTIME__.protect_opening_run();
CREATE TRIGGER inventory_opening_run_no_truncate BEFORE TRUNCATE ON __RUNTIME__.inventory_opening_run
  FOR EACH STATEMENT EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();

CREATE TRIGGER inventory_opening_cell_immutable BEFORE UPDATE OR DELETE ON __RUNTIME__.inventory_opening_cell
  FOR EACH ROW EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();
CREATE TRIGGER inventory_opening_cell_no_truncate BEFORE TRUNCATE ON __RUNTIME__.inventory_opening_cell
  FOR EACH STATEMENT EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();
CREATE TRIGGER inventory_opening_checkpoint_immutable BEFORE UPDATE OR DELETE ON __RUNTIME__.inventory_opening_delta_checkpoint
  FOR EACH ROW EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();
CREATE TRIGGER inventory_opening_checkpoint_no_truncate BEFORE TRUNCATE ON __RUNTIME__.inventory_opening_delta_checkpoint
  FOR EACH STATEMENT EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();
CREATE TRIGGER inventory_opening_prior_posting_immutable BEFORE UPDATE OR DELETE ON __RUNTIME__.inventory_opening_prior_posting
  FOR EACH ROW EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();
CREATE TRIGGER inventory_opening_prior_posting_no_truncate BEFORE TRUNCATE ON __RUNTIME__.inventory_opening_prior_posting
  FOR EACH STATEMENT EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();
CREATE TRIGGER inventory_opening_prior_document_immutable BEFORE UPDATE OR DELETE ON __RUNTIME__.inventory_opening_prior_document
  FOR EACH ROW EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();
CREATE TRIGGER inventory_opening_prior_document_no_truncate BEFORE TRUNCATE ON __RUNTIME__.inventory_opening_prior_document
  FOR EACH STATEMENT EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();

REVOKE UPDATE, DELETE ON __RUNTIME__.inventory_opening_run,
  __RUNTIME__.inventory_opening_cell, __RUNTIME__.inventory_opening_delta_checkpoint,
  __RUNTIME__.inventory_opening_prior_posting, __RUNTIME__.inventory_opening_prior_document FROM __APP__;
GRANT UPDATE(active) ON __RUNTIME__.inventory_opening_run TO __APP__;

RESET ROLE;
