-- Dedicated correction identity. Existing documents/history and Source are unchanged.
SET LOCAL ROLE __RUNTIME_OWNER__;
ALTER TABLE __RUNTIME__.document DROP CONSTRAINT document_document_type_check;
ALTER TABLE __RUNTIME__.document ADD CONSTRAINT document_document_type_check
  CHECK (document_type IN ('SALE','TRANSFER','PURCHASE','CORRECTION'));
ALTER TABLE __RUNTIME__.posting DROP CONSTRAINT posting_reason_check;
ALTER TABLE __RUNTIME__.posting ADD CONSTRAINT posting_reason_check
  CHECK (reason IN ('BASELINE_EFFECT_REVERSAL','REVISION_APPROVAL','ACTIVE_EFFECT_REVERSAL','INVENTORY_CORRECTION'));
RESET ROLE;
