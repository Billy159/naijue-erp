# Independent sparse cutoff/import foundation review

## Disposition

**PASS at the explicitly limited source/synthetic/protocol boundary after two owner corrections.** No remaining blocking finding was identified within this foundation. This is not PostgreSQL migration, concurrency, isolation, query-planner, durability, production-permission, real-import, or end-to-end inventory-read approval.

The reviewer changed only independent review evidence. The implementation owner changed its source and refroze it after the findings below. No implementation edit, real database/connection, SQL engine/parser, migration runner, server, browser, network, dependency install, commit, or push was performed by this review. Existing large suites were not rerun.

## Findings, communicated immediately and resolved

1. **Blocking functional composition failure in the original freeze.** Migration 0004's unconditional deferred `ledger_receipt_source_coherence` trigger called `validate_ledger_receipt_source` for every ledger insert. The function handles a non-NULL sales source and otherwise performs `SELECT transfer_id INTO STRICT ... WHERE id = NEW.source_transfer_line_id`. A `CUTOFF_BASELINE` has both native source IDs NULL, so the strict transfer lookup has no row and prevents the baseline transaction from committing. Original 0007 added an import validator but did not remove that conflicting dispatch. The owner corrected only 0007: the old native function remains unchanged, its recreated constraint trigger dispatches only APPROVE/UNAPPROVE, and the baseline trigger dispatches only CUTOFF_BASELINE. The event-kind CHECK closes the union. Source composition probes verify the corrected disjoint dispatch, not engine execution.

2. **Blocking scalability gap in original per-chunk checkpoint validation.** `validate_import_batch_commit` finds the audit by IMPORT object ID and native version. The original composed migrations had no IMPORT object/version access path: existing audit uniqueness leads with operation ID, and version partial indexes covered other kinds. That requires growing audit scans for repeated checkpoints, giving quadratic cumulative work for a long import. The owner added the partial unique `audit_import_checkpoint_version(object_id, new_version) WHERE object_type = 'IMPORT'`, and changed the lookup to an uncast indexed `new_version` equality with the checkpoint expression cast instead. This establishes a suitable source-level access path; no planner/performance measurement is claimed.

Original 0007 SHA256: `8c17b6152b16ecf12090983f1410e6bcac680febf9bc9c8c490af845b71bc9bb`.

Reviewed corrected 0007 SHA256: `ba99885d7c8cbb01e2a5cda6c6fce99a82c7c8691c26ba52c2137010430709e7`.

## Reviewed properties and limits

- **Approved storage only:** exactly `import_batch` and `import_record`, their declared catalogue fields, plus the three approved provenance columns. No new balance column, baseline pointer, contribution store, whole-document JSON, native-zero event, or warehouse×SKU zero rows. Migrations 0001–0006 matched their captured review dependency hashes.
- **Publication completeness:** the service requires a supplied authorization policy for the exact manifest and fixed namespace; it snapshots before asynchronous authorization. Publication requires the explicit final manifest/hash attestation, exact expected/actual source counts, only resolved source decisions, complete retained native membership including inactive IDs, and per-key source→ledger→balance quantity/version/operation reconciliation. Unexplained stock or unrelated ledger effects block it. IMPORTED is the only usable scope; PASSED is not a zero proof. This cannot establish that real source files, last increments, or real human approval are correct.
- **Locking and race protocol:** READ COMMITTED receipt locks precede replay lookup, then the global initial-cutoff lock and batch lock; sorted source and stock-key locks precede INSERTs. The global import lock serializes baseline work/publication, and master SHARE table locks cover final scope membership validation. All post-publication baseline insertion paths are closed. These are inspected SQL/protocol requests only, not multi-session or deadlock evidence.
- **Atomic application checkpoint:** source inserts, nonzero ledger and balance inserts, checkpoint CAS, audit and receipt are in one requested transaction. Actual source/ledger/balance inserts and checkpoint updates require one affected row. Deferred reciprocal receipt/audit FKs and the import-specific validators bind the evidence. COMMIT acknowledgement loss discards the connection and is not automatically replayed; rollback failure preserves both errors and discards. Protocol fakes cannot prove rollback or durable commit.
- **Immutable provenance:** source destination/reference/hash rows and receipts/audits/ledger are append-only. Batch namespace/manifest/mapping metadata and expected counts cannot change; cross-batch source identity uses fixed namespace/category/original key, not filenames. Existing targets cannot be rebound under the same source identity. This relies on the required exact trusted authorization policy to keep the namespace fixed. Historical-header provenance integration is still unused/unfinished, not claimed as implemented by adding its approved nullable fields.
- **Bounded work:** at most 500 items per application chunk; exact effect aggregation is once per bounded receipt; source and balance lookups use key-oriented indexes. Full growing source/balance reconciliation occurs at publication, not each chunk. The corrected import audit lookup removes the found growing checkpoint scan. No per-write full historical ledger sum or Cartesian-zero scan is introduced. No real query plan or scale test was run.
- **Retained balances:** append-only ledger plus deferred noncascading warehouse/SKU balance FK retains used keys, including later zero balances. Balance deletion/identity changes are rejected, and statement-level TRUNCATE guards protect retained relations. Fresh import balances must match the actual nonzero baseline/version-1 operation; import receipts cannot overwrite stock. Generic arbitrary direct-SQL mutation proof is explicitly outside scope and must not be granted to the runtime caller.
- **Closed native evidence union:** IMPORT is added to the existing closed SALES/TRANSFER/CUSTOMER/SUPPLIER receipt and audit kinds/actions. Prior non-import result predicates are preserved dynamically, and reciprocal same-kind evidence FKs remain. The source composition correction preserves the original native ledger validator body rather than weakening it for import.
- **Read proof:** the helper obtains one published batch, guard presence, and W+SKU native scope in the caller's consistent snapshot. Absent quantity is exact zero only inside that proven scope; negatives remain negatives, invalid proof fails the whole read. The standalone reader is scope inspection, not a full PG inventory query, and must not be combined with independently snapshotted balance data.

## Independent bounded verification

Command: `node --test --test-concurrency=1 evidence/inventory-cutoff-independent-probes.mjs`.

Result: **6 tests passed, 0 failed**, 571.948468 ms. Exact log: `evidence/inventory-cutoff-independent-probes.log`.

The six tests cover:

1. Composed native/baseline deferred trigger dispatch and preservation of the original native function.
2. The indexed IMPORT checkpoint audit access path and absence of growing source/ledger queries in the checkpoint guard.
3. A full 500-record, shuffled, positive/negative baseline chunk: all 500 source and inventory locks before INSERTs, exactly 500 source/ledger/balance writes, exact cursor 501→1001 and sequence 1→2, sorted receipt effect IDs, no upsert or zero baseline.
4. Rejection of record 501 and zero stock before starting a transaction.
5. Uncertain COMMIT: requested rollback, discarded connection, one transaction/receipt attempt, no automatic replay.
6. Baseline failure plus rollback failure: both errors retained, connection discarded, no requested checkpoint/audit/receipt/commit after the failure.

One preliminary independent-probe assertion expected exactly 500 source-lock calls before the first INSERT. The adapter intentionally repeats the first already-held lock in `insertRecord`, giving 501 calls but 500 unique held identities. The probe was corrected to assert 500 distinct covered locks; the observation log is retained separately. This was a probe-shape correction, not an implementation failure.

Checksum commands verified all 11 files against the owner's corrected freeze and all six prior-migration dependencies against the review capture. All 17 comparisons were OK. The full exact values are in `inventory-cutoff-independent-reviewed-source-sha256.txt` and `inventory-cutoff-independent-dependency-sha256.txt`; initial values are retained in `inventory-cutoff-independent-initial-source-sha256.txt`.

Owner-reported refreeze checks, **not independently rerun**: focused typecheck passed, focused source/application/protocol 44/44, legacy sales/transfer plus new source regressions 158/158 at concurrency 2. The prior root typecheck blocker in concurrent pool work is not reclassified as passing here.

## Explicitly still unfinished and closed

- Historical native header/line import and first historical unapprove. The frozen example 7→first unapprove +2=9→resave quantity 3 stays 9→approve −3=6 has **not** been integrated/executed.
- Native new warehouse/SKU CREATE proof and sparse first-use SALES/TRANSFER stock insertion. No missing balance is silently created, and unclear/imported identities cannot be called proven native-new.
- Full PostgreSQL inventory query/HTTP import routes, approved real source ingestion, actual cutoff/last old-system increment verification, grants/roles, real SQL parsing/migration execution, multi-session locking/isolation, crash/durability and production validation.

The source-only disposition must not be represented as completing any of those items.
