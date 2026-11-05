\set ON_ERROR_STOP on
BEGIN;
DO $fresh35_v2_rejected$
BEGIN
 RAISE EXCEPTION 'FRESH35_V2_INSTALL_CANDIDATE_NOT_AUTHORIZED'
  USING ERRCODE='55000', DETAIL='Safety review, reviewed V2 evidence, physical target binding and execution authorization are incomplete. This review entry never installs.';
END
$fresh35_v2_rejected$;
ROLLBACK;
