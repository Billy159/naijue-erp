# Unknown warehouse source review: proposed persistent contract

Status: DESIGN FOR INDEPENDENT REVIEW. Not implemented or installed. This is not part of the completed hall/amount candidate and does not claim that unknown-warehouse rows are already persisted. No real rows were examined or changed.

## Observed predecessor and compatibility

The immutable r2 35-table schema is `/workspace/shared/fresh35-install-review-plan-20261105-r2/01-schema-REVIEW-ONLY.sql`, SHA256 `5fc8508ea96062898a42dc4c03c3a6ebe166158037cc6c7c3130a13d3ee14931`. The accompanying `source-review-predecessor-objects.json` is extracted from this schema, not an assumed schema.

- `import_record` already allows QUARANTINED and a null target_type/target_id pair. It is append-only: UPDATE, DELETE and TRUNCATE remain forbidden. It stores a hash/pointer, not full original contents.
- `import_batch.inventory_mode` allows only CUTOFF_STOCK_BASELINE and DOCUMENT_CONVERSION; cutoff_at is NOT NULL. Its status set is STAGED/VALIDATING/PASSED/IMPORTED/FAILED. `completed_at` is nonnull iff IMPORTED. The checkpoint has exactly sequence/cursor/counts/expected.
- Existing batch publication guards and deferred validators reject a third mode. The current STANDARD_IMPORT_POINTER_V1 and standard_import_record_proof require IMPORTED records and cannot authenticate a quarantine record.
- Runtime has SELECT on the four reuse tables, with RLS enabled. Their existing policies only test standard_business_ready(), so adding raw quarantine contents without tightening all four policies would disclose them through the runtime database identity after publication. Application-side filtering alone is insufficient.
- Ordinary sales_header.warehouse_id remains NOT NULL. Its current hall/warehouse reference and permissions rules must stay unchanged.
- The new f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66 hall profile is for materializable headers with a bound warehouse. Its proof shape must NOT be weakened to accept a fabricated warehouse or a null warehouse. SOURCE_REVIEW is a separate protocol and capture shape.

## Bootstrap boundary

The first persistence successor is limited to a target with an already initialized current ADMIN and a published stock baseline. It cannot run before INITIALIZE: the current initial batch guard rejects any pre-existing import_batch, including review batches, and a source review cannot create its own account/session. It does not by itself make a fresh whole-package import containing pending rows executable. A fresh package needs a separately reviewed initial partition/root-plan successor that binds ready versus pending occurrence sets and permits document publication with complete persisted quarantine, without calling pending rows imported or excluded. Until that successor exists, fresh-bootstrap partition/publication is explicitly incomplete. Existing pre-review baseline/initialization rows are not rewritten.

## Scope and storage

Reuse only import_batch, import_record, audit_change and operation_receipt; add no table, ordinary-header column, department or warehouse placeholder. Introduce a separately admitted successor with:

- inventory_mode=SOURCE_REVIEW; mapping_version=HISTORICAL_SALES_SOURCE_REVIEW_V1.
- `cutoff_at` nullable only for SOURCE_REVIEW, enforced by a replacement CHECK requiring nonnull cutoff for both old modes. A review batch always stores NULL cutoff. Original source times remain raw source facts. Database receipt time is explicitly capture time, never source export or accounting cutoff time.
- Existing STAGED -> VALIDATING -> PASSED statuses. PASSED means the immutable capture is complete, not business import success. Never use IMPORTED or IMPORT_PUBLISH for review capture. completed_at remains NULL. The sealed receipt time is the capture-completion time.
- history_expected_counts/history_actual_counts/history_payload_hash remain null and history_validation_passed remains false. Do not borrow retired history tables or their accounting proof.
- import_record.status is permanently QUARANTINED, targets permanently NULL, reviewed_at NULL. The current review state is projected from immutable capture/resolution audits, not by rewriting source records. There is no inventory, receivable, settlement or ordinary-document effect.

## Approved source package

A new opaque host capability is read from independently pinned UTF-8 bytes outside the package, with source namespace and exact file hashes. Its profile is HISTORICAL_SALES_SOURCE_REVIEW_APPROVAL_V1. It binds the entire pending partition and the original package/manifest hash. It cannot be substituted by an envelope-provided self-declaration.

For each occurrence preserve:

- original source entity kind and original source key, original header-group key, file SHA256/sheet/row and occurrence ordinal;
- exact original cell values (strings/null, preserving blank versus missing according to the source reader), and separately any normalized representation and its declared transform version; normalization never replaces raw fields;
- raw warehouse token, any reliable original hall evidence and source references, unresolved reason WAREHOUSE_UNRESOLVED; no guessed UUID, same-name/code lookup or actor-derived value;
- the complete affected header group: header plus each original line and settlement occurrence. A group cannot be partly materialized and partly quarantined. Orphan/ambiguous members remain separately flagged pending, never silently assigned;
- optional independently sourced observed mapping evidence, kept separate from original facts. A reviewer selecting a warehouse does not make it an original historical fact.

A review record key is a deterministic occurrence identity derived from namespace/entity/file hash/sheet/row/occurrence ordinal. The original business source key remains a separate value in the capture. This avoids coalescing repeated source rows with the same business key. Exact duplicate occurrence identities are rejected; two distinct rows with identical values both count.

The full exact approved UTF-8 is retained once across ordered immutable REVIEW_APPROVAL audit byte segments, with its externally approved SHA256 and exact byte length declared in the stage audit. Each segment is base64 of <=1 MiB exact bytes with an ordinal and offset, so splitting cannot corrupt a UTF-8 boundary. No segment may overlap or be skipped. After the final segment, concatenate bytes in ordinal order and verify the full external hash and strict UTF-8 before allowing any capture. Chunk audits then store the selected complete raw occurrences and their source hashes. Size bounds are explicit: approval <=64 MiB, <=250000 occurrences; command <=8 MiB, <=1000 occurrences; a single occurrence <=1 MiB. Large groups may span capture chunks but are not sealed or exposed as complete until every expected occurrence is present. No byte truncation or lossy sampling is permitted.

The source hash algorithm is separately versioned (SOURCE_REVIEW_RECORD_HASH_V1): SHA256 over UTF-8 JSON.stringify of a declared ordered tuple of namespace, source entity, original source key, group key, file hash, sheet, row, occurrence ordinal and original/normalized payload. SQL retains the exact serialized UTF-8 string and verifies its SHA plus parsed JSON equality. PostgreSQL jsonb::text and JavaScript JSON.stringify are not treated as identical encodings.

## Command and audit closure

New public finite API: source_review_command_v1(request jsonb, session_token text), plus a bounded read API source_review_read_v1(request jsonb, session_token text). These are narrowly scoped SECURITY DEFINER routines owned by the verified schema owner, with fixed search_path=pg_catalog,naijue_erp,pg_temp (pg_temp explicitly last), TimeZone=UTC and trusted plpgsql/sql language; no dynamic caller-chosen relation or function. Revoke default PUBLIC EXECUTE on each new routine in the same installation transaction. New helpers are private and callable only by the owner. Do not substitute SECURITY INVOKER or grant the IMPORTER direct SELECT/DML to work around missing table permissions. Only the existing protected IMPORTER role receives these exact API EXECUTEs; no direct table grant, login, membership, schema ownership or general function EXECUTE is added. Source-only candidate flags permissionsChanged=true and cannot reuse old catalog evidence.

Every call requires standard_import_identity(session_token,'IMPORTER'), yielding a live enabled current ADMIN. The actor UUID is derived from that check, not accepted from request. Target batch ID and package/source SHA are exact. Initial capture requires a separately initialized current ADMIN; no account or session is created from source rows. Calls after publication are still explicitly ADMIN-only. A generic runtime connection, salesperson, anonymous caller or package claimant receives no access.

Requests carry protocol, operation_id, request_key, batch_id, expected_sequence, package_manifest_sha256, approval_sha256 and a closed phase/payload. Session tokens never enter audit, request hash or source files. Lock the batch and namespace occurrence identities, reject an already captured occurrence in another review batch (except an exact idempotent request), and then use existing request-key uniqueness. Identical committed request returns the same receipt; changed payload under the same key fails; unexpected sequence fails. All commands are atomic and force deferred checks before success.

Use target_type/object_type IMPORT with new result profile HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1. Preserve existing actions IMPORT_STAGE (REVIEW_STAGE) and IMPORT_CHUNK (REVIEW_APPROVAL, REVIEW_CAPTURE, REVIEW_SEAL, REVIEW_RESOLVE). The receipt/result and audit constraints receive an exact new-profile branch, not a broad relaxation. The receipt always has ledgerEntryIds=[] and no target document creation. Audit/receipt actor, action, batch, timestamp, operation, request hash and sequence must agree.

- REVIEW_STAGE: insert STAGED batch, zero sequence/cursor/counts, immutable expected occurrence/group counts and manifest/approval SHA. Append stage audit and committed receipt containing the exact approved byte length/hash and immutable expected counts. No raw approval is omitted or silently replaced by a file path.
- REVIEW_APPROVAL: retain immutable ordered approval byte segments under the declared hash, with seq increment but occurrence cursor unchanged; counts track approval bytes separately. Reject repeated/overlapping offsets and any final hash/UTF-8 mismatch. The stage cannot become capture-ready until all exact approved bytes verify. This keeps every command below the chunk limit even when the total approval is 64 MiB.
- REVIEW_CAPTURE: append only the approved exact occurrences for this chunk and QUARANTINED import_record pointers `{format:'SOURCE_REVIEW_POINTER_V1',operationId,recordOrdinal}`. Advance sequence once and cursor/counts by the actual distinct captured set. Validate full source hash, namespace and expected membership. No caller-supplied count is trusted.
- REVIEW_SEAL: require complete occurrence-set equality, not only equal count; group closure and raw hash equality; verify no document/line/settlement/ledger target was created for the batch. Move VALIDATING to PASSED (or STAGED to PASSED only for an explicitly empty partition). Append immutable seal receipt/digest. Failure rolls back the seal and does not delete earlier capture.
- REVIEW_RESOLVE: append a new decision for an exact sealed group under a batch lock with expected resolution version. Preserve every original capture and every committed review decision. An authenticated, well-formed but unresolvable business decision commits an explicit REJECTED/PENDING decision receipt with its reason and no target effect. Authentication failures, malformed requests, constraint violations and transaction errors roll back and are observable only in external execution logs; they are not claimed as retained database audit records. A failed/invalid mapping leaves the effective state PENDING. A valid proposal is REVIEWED_READY, not MATERIALIZED. Mark MATERIALIZED only when an independently verified, committed, published ordinary migration target with the exact source occurrence set exists. One group can have at most one successful target; duplicate/split/mismatched links fail. This phase never silently edits the pending source or claims business success itself.

The storage is durable immediately after each successful capture receipt. During CAPTURING, report expected-but-not-yet-received occurrences separately from durable pending occurrences; never claim complete partition conservation until seal verifies the full set. The administrative UI/read API distinguishes CAPTURING, PENDING_REVIEW, REVIEWED_READY and MATERIALIZED. QUARANTINED is an immutable capture classification, so source rows with an eventual linked target are not mistakenly counted as still pending.

## Reprocessing and ordinary import boundary

Reprocessing is two-phase, not a bypass around ordinary validators:

1. Read the sealed source with ADMIN authority. Collect an explicit warehouse binding and its reliable source/evidence; capture current warehouse id/hall/version and capture time. Produce a new reviewed materialization artifact with raw input hashes, the separate resolution evidence, and the required f5d4 hall approval for every eventual header. Preserve original-vs-derived-vs-conflict labels. Revalidate current warehouse/hall and all other ordinary references, exact monetary/source approvals and actor authority. A stale/disabled/inconsistent observation fails and leaves PENDING.
2. Execute through a separately reviewed **resolution conversion successor**, not the currently closed whole-package INITIALIZE/DOCUMENTS path. That successor creates a new DOCUMENT_CONVERSION batch bound to the existing published stock baseline and the sealed review group plus exact resolution approval. Before creating any ordinary target, it must take a global lock on the sealed source group and all occurrence identities, check committed materialization/consumption proofs even when no REVIEW_RESOLVE link exists yet, and reserve the deterministic target identity. Create the source records, MIGRATE_DOCUMENT receipts, atomic consumption proof and complete ordinary target in one transaction, then publish only after normal closure/source census; retain the locks through publish commit. Rejecting a duplicate only at later REVIEW_RESOLVE linkage is too late and is prohibited. It must not mutate an already published original batch, establish another stock baseline, invent a cutoff, write inventory effects, or reuse a legacy profile. Only after publication can REVIEW_RESOLVE link it as MATERIALIZED.

The existing one-initial-plan assertions cannot admit this delta batch unchanged. Therefore initial persistence may be implemented independently, but the feature must remain explicitly **reprocessing incomplete** until the conversion successor and its native-reference/source-proof/readback paths are implemented and engine-tested. An executable artifact alone is not a successful reprocessing result. Committed REJECTED/PENDING business decisions are auditable and retryable with new operation IDs; transaction-rejected attempts remain only in execution logs. Successful requests are idempotent.

## Read permissions and census

Replace (not supplement) the four existing runtime RLS policies, preserving every old non-review predicate. A second permissive policy would OR with the old one and leak review rows. Independently check the complete effective policy/ACL/PUBLIC/role-membership set, not only the changed names:

- import_batch excludes SOURCE_REVIEW;
- import_record requires a visible matching batch whose inventory_mode is not SOURCE_REVIEW;
- audit_change/operation_receipt permit non-IMPORT rows under the old predicate, but IMPORT rows require a visible matching batch whose inventory_mode is not SOURCE_REVIEW, regardless of claimed JSON profile (prevent malformed-profile leakage).

These are positive EXISTS predicates against the matching batch, not NOT EXISTS(review batch): because batch RLS itself hides review batches, the latter would incorrectly evaluate true and leak review child rows. Missing batch also denies access. Keep the existing WITH CHECK semantics for non-review runtime operations; runtime cannot create review receipts/audits directly.

The dedicated authenticated ADMIN read API checks exact batch ownership/namespace and permits bounded, cursor-based pages. It obtains audit by the immutable record pointer and exact operation ID, not scanning all source chunks for every row. It emits raw values only after authorization; ordinary sales lists never union pending rows or infer hall permission. No current warehouse/staff lookup may relabel the capture.

Use a separate review/census DTO rather than SalesSummaryDTO. Counts are distinct source occurrences, grouped by entity, and retain classifications ORIGINAL/MIGRATION_DERIVED/PENDING/DIFFERENCE where applicable. Source closure must prove disjoint union: materialized occurrences + currently pending occurrences = original complete occurrence set. This first version does NOT support exclusions: the approved-exclusion set must be empty. A future exclusion decision requires a separate reviewed authorization/evidence/state contract and cannot be inferred from a rejection or unresolved mapping. A resolved occurrence counts once as materialized and zero as pending, while its capture remains retained. Pending is never reported as imported, EXCLUDED, zero stock or zero amount.

## Exact object work and acceptance gates

No old source pin, old refusal entry or frozen source capture is rewritten. A new source candidate must declare every altered column constraint, routine, RLS policy and API grant, and increase routine count honestly. The currently combined hall+amount installer does not yet include this successor.

Minimum persistence closure to inspect/change:

- import_batch cutoff nullability and mode CHECK; a new mode-specific invariant CHECK; operation_receipt receipt_result_by_kind and audit_change audit shape constraints (exact new profile only).
- All attached batch admission/publication guards: guard_import_batch, guard_history_typed_publication, guard_import_accounting_publication, guard_header_native_reference_publication, guard_history_publication, guard_native_catalogue_publication, guard_native_payment_publication, guard_successor_publication26. Each SOURCE_REVIEW branch invokes the same strict prepared-review validator; none simply returns NEW because a mode string matches.
- validate_import_batch_commit, validate_import_accounting_checkpoint_commit, guard_import_record, validate_import_source_commit, validate_import_operation. The old branches remain unchanged. reject_immutable_change and all ordinary sales/ledger guards remain unchanged.
- New command/read/proof/operation-validator helper signatures and exact security/ACL; four RLS policy changes described above. No new role or table is required.
- Resolution conversion additionally needs an explicit source-proof/root-plan branch in assert_document_conversion_batch, its dependent prepared-operation validators, guard_unified_document and migration/provenance readers. This is a separate implementation/review gate, not hidden in a persistence patch.

Required tests before admission: unknown warehouse + raw empty warehouse survives DB disconnect/readback; no ordinary target or ledger effect; no invented source/export time; exact raw blank/null and decimal strings; group/occurrence conservation with duplicate business keys; chunk rollback/idempotent retry/conflict key; missing/corrupt/bogus SHA; forged pointer/profile/actor rejection; direct DML rejection; runtime/SALESPERSON zero visibility even after business readiness; ADMIN paged read; seal incomplete set rejection; successful capture versus pending versus resolved counts; stale mapping rejection; eventual real target proof prevents duplicate materialization; full pre-existing business/profile regression.

Independent reviewer must approve the contract and enumerate additional affected objects before implementation. PostgreSQL engine tests on an explicitly authorized disposable synthetic target, plus independent resulting catalog/ACL/RLS review, are required before calling the persistent/reprocessing path complete.
