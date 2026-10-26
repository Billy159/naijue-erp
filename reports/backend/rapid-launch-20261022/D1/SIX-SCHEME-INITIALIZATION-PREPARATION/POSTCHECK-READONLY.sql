-- Fragments for the original T45 readonly readback. Inputs bound from durably retained ORIGINAL request.
-- :batch_id / :actor_id / :request_key / :request_hash / :operation_id, never a new key.
SELECT count(*)::text AS entire_scheme_count,
 coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb) AS entire_scheme_rows
 FROM naijue_erp.barcode_scheme s;
SELECT r.id,r.actor_account_id,r.request_key,r.request_hash,r.action,r.status,r.result_data,
 r.request_hash=:'request_hash' AS same_original_hash,a.operation_id,a.actor_account_id AS audit_actor,
 a.action AS audit_action,a.old_version,a.new_version,a.before_values,a.after_values,a.occurred_at
 FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id
 WHERE r.actor_account_id=:'actor_id'::uuid AND r.request_key=:'request_key'
 AND r.id=:'operation_id'::uuid AND r.target_type='IMPORT' AND r.target_id=:'batch_id'::uuid;
SELECT id,status,checkpoint,history_payload_hash,history_expected_counts,history_validation_passed,completed_at
 FROM naijue_erp.import_batch WHERE id=:'batch_id'::uuid;
SELECT (SELECT count(*) FROM naijue_erp.import_record_accounting_claim WHERE operation_id=:'operation_id'::uuid) AS claims,
 (SELECT count(*) FROM naijue_erp.inventory_ledger WHERE operation_id=:'operation_id'::uuid) AS ledger_entries,
 (SELECT count(*) FROM naijue_erp.inventory_balance WHERE last_operation_id=:'operation_id'::uuid) AS balance_effects;
-- Compare all six 7-field rows to approved original snapshots, paired body/key/hash and original checkpoint:
-- sequence +1 only, cursor/counts/expected unchanged; same key replay adds no row/audit/receipt/effect.
-- Do NOT call the lock-taking initialization verifier from a READ ONLY snapshot; original MAIN service already calls it.
