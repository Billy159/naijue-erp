-- Complete the immutable creation evidence without consulting an employee's current hall/role.
SET LOCAL ROLE __RUNTIME_OWNER__;
ALTER TABLE __RUNTIME__.document
  ADD COLUMN transfer_creator_account_id text REFERENCES __RUNTIME__.operator(id),
  ADD COLUMN transfer_creator_role text,
  ADD CONSTRAINT transfer_creation_snapshot_type CHECK (document_type='TRANSFER' OR
    (transfer_creator_account_id IS NULL AND transfer_creator_role IS NULL)),
  ADD CONSTRAINT transfer_creation_snapshot_complete CHECK (
    (transfer_creator_account_id IS NULL AND transfer_creator_role IS NULL) OR
    (transfer_creator_account_id IS NOT NULL AND transfer_creator_role IS NOT NULL AND transfer_creator_role IN ('ADMIN','WAREHOUSE','SALESPERSON') AND
      (transfer_creator_role='SALESPERSON' AND transfer_creator_hall_id IS NOT NULL OR
       transfer_creator_role<>'SALESPERSON' AND transfer_creator_hall_id IS NULL)));

-- 0009 only wrote a creation hall for authenticated salesperson creates.
-- Its immutable hall + actual, non-imported first revision prove these older creates.
-- Imported/unknown records are deliberately not inferred from employee_login/operator roles.
UPDATE __RUNTIME__.document d SET transfer_creator_account_id=r.actor_id,transfer_creator_role='SALESPERSON'
 FROM __RUNTIME__.revision r WHERE d.id=r.document_id AND d.document_type='TRANSFER'
 AND d.transfer_creator_hall_id IS NOT NULL AND r.revision=1 AND NOT r.original_imported AND r.actor_id IS NOT NULL;

CREATE OR REPLACE FUNCTION __RUNTIME__.deny_transfer_creator_hall_change() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.transfer_creator_hall_id IS DISTINCT FROM OLD.transfer_creator_hall_id
  OR NEW.transfer_creator_account_id IS DISTINCT FROM OLD.transfer_creator_account_id
  OR NEW.transfer_creator_role IS DISTINCT FROM OLD.transfer_creator_role THEN
  RAISE EXCEPTION 'IMMUTABLE_TRANSFER_CREATION_SNAPSHOT';
 END IF;
 RETURN NEW;
END $$;
RESET ROLE;
