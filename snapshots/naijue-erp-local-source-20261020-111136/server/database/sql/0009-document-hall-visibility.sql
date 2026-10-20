-- A transfer created by a salesperson remains visible to that person's hall at creation.
-- Historical/imported documents stay NULL unless their original hall can be proved.
SET LOCAL ROLE __RUNTIME_OWNER__;

ALTER TABLE __RUNTIME__.document
  ADD COLUMN transfer_creator_hall_id uuid,
  ADD CONSTRAINT transfer_creator_hall_type CHECK (document_type = 'TRANSFER' OR transfer_creator_hall_id IS NULL);

CREATE FUNCTION __RUNTIME__.deny_transfer_creator_hall_change() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.transfer_creator_hall_id IS DISTINCT FROM OLD.transfer_creator_hall_id THEN
    RAISE EXCEPTION 'IMMUTABLE_TRANSFER_CREATOR_HALL';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER transfer_creator_hall_immutable BEFORE UPDATE ON __RUNTIME__.document
  FOR EACH ROW EXECUTE FUNCTION __RUNTIME__.deny_transfer_creator_hall_change();

-- The same predicate serves paginated lists and per-document authorization.
-- A runtime warehouse record is authoritative when present; a committed source
-- batch is used only when no runtime warehouse record exists.
CREATE FUNCTION __RUNTIME__.warehouse_linked_hall(warehouse_id text, hall_id text) RETURNS boolean
  LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT warehouse_id IS NOT NULL AND hall_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM __RUNTIME__.master_data_entity m
      WHERE m.kind = 'warehouses' AND m.id = warehouse_id
        AND coalesce((m.body->>'sourceOwnershipUnknown')::boolean, true) = false
        AND jsonb_typeof(m.body->'hallRelations') = 'array'
        AND m.body->'hallRelations' ? hall_id
    ) OR (
      NOT EXISTS (SELECT 1 FROM __RUNTIME__.master_data_entity m WHERE m.kind = 'warehouses' AND m.id = warehouse_id)
      AND EXISTS (
        SELECT 1 FROM __SOURCE__.tplus_hall h
        WHERE h.id::text = hall_id AND EXISTS (
          SELECT 1 FROM unnest(h.warehouse_ids) w(id) WHERE w.id::text = warehouse_id
        ) AND h.batch_id = (
          SELECT i.batch_id FROM __SOURCE__.tplus_import_run i WHERE i.status = 'COMMITTED'
          ORDER BY i.committed_at DESC NULLS LAST, i.started_at DESC LIMIT 1
        )
      )
    )
  );
$$;

GRANT EXECUTE ON FUNCTION __RUNTIME__.warehouse_linked_hall(text,text) TO __APP__;
RESET ROLE;
