# Incremental unified-business schema 0027

**Status: corrected 0027 independently installed by the parent on its owned isolated PG17.11 target, schema/catalog verified. Business lifecycle, importer/runtime ACL and standard writer remain unverified/unimplemented as detailed below. Not deployable on the strength of schema/source tests.**

The 2026-11-02 authorization covers code and isolated validation, including necessary schema/constraints. It does not cover production migration, data deletion, deployment, Mac access or real-file cleaning. Cleaning tools must not change database structure.

## Inputs and boundaries

- Current implementation checkout: `erp-unified-github-20261102`, branch `handoff/erp-unified-github-20261102`, initial implementation HEAD `d5604d154685282901d3390fd8854b59952c6d9e` (latest GitHub base plus the parent-reviewed source fixes). The complete reviewed 40-SQL predecessor (26 migrations + 14 selected successors), 137 final routines, remains byte-identical to the earlier aa10 SQL cohort. Numbered 0001–0026 alone is **not** the predecessor.
- Adds exactly six columns; no tables: `import_record.source_system`, sales/transfer `created_by_staff_id` + `approved_by_staff_id`, ledger `baseline_anchor_operation_id`.
- All four staff columns reference actual staff independently of historical login-account knowledge. The anchor references `operation_receipt`, never an overloaded ledger UUID.
- Keeps business dates, typed required amounts, quantity constraints, warehouse/customer/SKU/payment-account FKs and the reciprocal audit/receipt FKs.
- Allows only the plan's explicitly unknown creator/time/role, gift/allocated-discount and display-name facts to be NULL. No automatic historical actor/time/zero/false backfill.
- Reuses header `import_batch_id` and `stock_basis`. Origin cannot change; origin is not an ordinary-command prohibition.
- Eleven dependency-bearing history tables remain physical, with new unconditional read-only triggers. Old generated FK columns, ledger source references, versions and immutable original data are not rewritten or dropped. Logical 35-table target is not physical retirement permission.

## Fail-closed admission

0027 pins all 137 predecessor function-body hashes. Its preflight requires schema versions 1–26 and the full selected predecessor profile. It deliberately rejects **any nonempty retained `import_record`** with `UNIFIED27_SOURCE_NAMESPACE_REVIEW_REQUIRED` before changing structure. Old `source_name` can mean an export/run label, so copying it silently would fabricate durable identity. A separately reviewed namespace/collision backfill migration is needed for an existing populated installation. There is no data UPDATE in 0027.

`source_system` is NOT NULL and has a composite FK `(import_batch_id,source_system)` to retained batch `(id,source_name)`. A partial unique index claims a global `(source_system,source_entity_type,source_key)` across batches for destination-bound ACCEPTED/IMPORTED records. All records remain immutable. Changed hashes are conflicts, not UPSERTs. Ordinary document/line/settlement destinations are one-to-one; the removed blanket destination index is replaced so legitimate master/SKU aliases are not categorically forbidden.

## Closed document-conversion profile

`inventory_mode=DOCUMENT_CONVERSION`, `mapping_version=DOCUMENT_CONVERSION_V1` is distinct from `CUTOFF_STOCK_BASELINE`.

- Requires one already published baseline at the exact cutoff; cannot create a second baseline or post ledger/balance changes.
- Exactly six counters: SALES_HEADER, SALES_LINE, SALES_SETTLEMENT, TRANSFER_HEADER, TRANSFER_LINE, IMPORT_BATCH. They remain nonnegative integer, immutable-expected, monotonic and cursor-reconciled, with exact committed-target count readback.
- Stage starts zero. Each checkpoint has the exact same-transaction import audit/receipt and actual current administrator/time. Original source/hash/manifest/cutoff/namespace/mapping cannot change.
- Publication requires complete counts, no unresolved decisions, every ordinary header's migration anchor and a retained `FINAL_DOCUMENT_CONVERSION` manifest approval. The manifest binds current-effective conversion, archive restore verification and exact baseline coverage.
- Legacy fixed-customer/season/raw-workbook publishers retain their old non-conversion bodies. Explicit conversion dispatch is independent and rejects legacy source carriers; it is not a blanket disabled-security path.
- Converted documents remain unavailable for ordinary mutations until this batch publishes. Afterwards they use the same current-state/version/actor guards as native rows.

### Explicit integration boundary

This profile is **document-only conversion against a published baseline**, not a new standard-package initial-inventory/master-data writer. Fresh initial inventory publication and validated master initialization still require a separately integrated standard importer/profile. Nonempty-online namespace adoption is also intentionally blocked. Do not label either path complete because 0027 installs on an empty synthetic predecessor.

## Real migration anchor, not invented approval

Each document has exactly one indexed `MIGRATE_DOCUMENT` receipt by `(target_type,target_id)`. It records the migration's actual current administrator, transaction timestamp, request key/hash and COMMITTED result. It emits no ledger effects and cannot be a balance's last operation.

Audit `old_version=NULL`, `before_values=NULL`, `new_version=v>0` is legal only for this action and a typed ordinary target. Native ordinary actions retain increment-by-one. Imported APPROVED remains APPROVED even when original account/staff/time or pricing intent is genuinely unknown. Original mismatched amounts/status remain in CLEANED evidence plus exceptions; they are neither fabricated nor admitted as a READY/MIGRATE APPROVED target. Every final APPROVED target—including migration—and every new actual APPROVE requires settlement receive-minus-refund equals net due. DRAFT may remain unbalanced. No arbitrary three-row cap remains in the database. This follows `docs/DECISIONS.md:10` and plan sections 1.4 and 14.3; the withdrawn unpaid-approval experiment is not restored.

### Evidence codec

Migration `audit.after_values`:

```text
{
  header: full ordinary snake_case typed row,
  lines: full ordinary rows (quantity and money exact decimal strings),
  settlements: all ordinary occurrences (amount exact decimal strings),
  baseline: {
    state: "CONFIRMED", baselineBatchId, baselineManifestSha256,
    cutoffAt, coverageDigest
  },
  sourceRecordId
}
```

The transfer derived `current_line_no` is omitted. The typed snapshot function fixes TimeZone to UTC. `exposureDigest` is SHA-256 of the PostgreSQL `jsonb::text` UTF-8 representation of `{header,lines,settlements}`, **not** arbitrary JavaScript `JSON.stringify` and not a raw-source digest. The importer must use the reviewed codec, bind immutable source records and verified coverage, and never infer the baseline batch ID from a synthetic package ID.

The regular typed receipt result additionally contains `batchId`, `sourceRecordId`, `exposureDigest`, the identical `baseline`, and `ledgerEntryIds: []`. The domain stock-effect kernel uses an explicit snake_case-to-camelCase adapter; no implicit JSON coercion is part of this schema contract.

## Common lifecycle constraints

- Every new native document starts actual version-1 DRAFT with known current creator/account/time. Current APPROVE records actual account, staff and time; leaving APPROVED clears current staff approval evidence along with account/time. Original approval facts remain in immutable migration audit/archive.
- Current account login/employment/hall/role is checked. Salespeople retain own-hall, own-created approval and no-sales-unapprove restrictions. Warehouse/admin sales permission remains. Transfer visibility retains its distinct salesperson creator-hall/endpoint rule; nullable unknown creator evidence never grants visibility.
- Identity, original origin/creator metadata and number are immutable. Posting actions cannot edit business fields; every actual header/line/settlement delta has sparse before/after evidence and its ordinary command. Source rows and current document versions are not switched to a historical command route.
- First baseline-backed UNAPPROVE uses `baseline_anchor_operation_id` XOR actual `reverses_entry_id`; it must match the sealed approved version, actual line, SKU, warehouse, endpoint, date and exact quantity. Partial unique indexes allow each anchor/line/endpoint once. Later approval cycles use actual new APPROVE ledger rows.
- The complete nonzero sales effect set and both transfer endpoints are validated. Zero quantities create no ledger entries. Existing recorded before/after balance guards and aggregate per-operation/key closure remain; negative balances remain legal.
- Proven sparse-zero first reversal is admitted only with original complete published key coverage, no prior ledger, exact anchor evidence, current command audit and cumulative ledger/balance count/quantity closure. Missing is never assumed zero.
- Current settlement removal is an ordinary audited SAVE. Source occurrence content survives in migration snapshot and exact deletion audit; its permanent source-bound canonical ID cannot be recycled. No new nullable active-state column was invented. An import-record destination for a removed occurrence denotes that retained retired occurrence, not an assertion that a current settlement row still exists.

## Verification recorded by this change

- Test-first RED captured before migration existed: `erp-unified-implementation-20261102/schema-evidence/red-source-tests.log` (outside repository).
- Focused source contracts: `tests/unified-business-schema-source.test.ts` (14 SQL-source checks plus 2 explicitly labelled protocol-oracle checks after the GitHub-base UoW/staff-audit and engine42601 syntax correction; not PostgreSQL acceptance).
- Original migration source regressions: 6/6. Combined focused source/model run after the UoW/staff-audit and header-nesting corrections: 22/22; this is not a database lifecycle result.
- All original 40 SQL byte hashes still match the frozen source plan; evidence `original40-byte-preservation.json` outside repository.
- No database connection or DDL execution was performed by the schema implementation worker. No production import, deletion, deployment or runner registration was performed.

## Required before enablement

1. **Schema/catalog stage completed by parent** for exact40 then corrected 0027 (d42954…): version27 / 56 tables / 590 columns / 152 routines / 213 triggers. Importer/runtime ACL, populated-adoption and preflight-negative matrices remain separate; owner-only installation is not their proof.
2. Real synthetic transaction matrix: both document kinds, known/unknown original facts, 16+ complete balanced settlements, rejection of both incomplete and genuinely unbalanced approved source without changing original facts, first anchor reversal, repeated reversal rejection, SAVE/reapprove/later actual reversal, sparse-zero key, mixed/foreign line/endpoint/version attacks, actor/scope/audit mismatch, rollback/unknown COMMIT.
3. Integrate current UoW/readers/domain/service nullability and full settlement retention; new shared stock kernel plus explicit anchor reconstruction; no old historical routing or fake CREATE/APPROVE.
4. Integrate standard initial baseline and master initialization independently of frozen old publication data, plus approved nonempty namespace adoption. 0027 is not a loophole around these missing proofs.
5. Exact27 capability/permission review and source registration. Existing old fixed source checks remain authoritative for old sources, not a green signal for the new schema or importer.
6. Production-specific facts, source cutoff bytes, restore evidence, backup/rollback and explicit execution/deployment permission remain separate. After new writes, old-backup restore is not a lossless rollback.


## GitHub-base UoW compatibility corrections

These changes touch only 0027, its source tests and this document. Existing UoW code and all 40 old SQL files remain unchanged by the schema worker.

### Temporary sales-position release

The existing ordinary sales UoW first releases occupied positions with `UPDATE is_current=false`, then UPSERTs final rows. A deferred row trigger receives each physical OLD/NEW event, so intermediate NEW must not be mistaken for final business evidence.

The corrected validator reads the current native final row and requires one exact sparse after entry. Each UPDATE event must be one of:

1. **Direct**: actual event OLD equals the exact audit before; event NEW equals exact final after.
2. **Release**: actual event OLD equals exact audit before, was current=true, and NEW changes **only** `isCurrent` to false.
3. **Continuation**: event OLD was created by this same top-level transaction, equals the exact audit before except `isCurrent=false`, and event NEW equals final after.

A previous inactive row cannot masquerade as a release: its OLD.xmin is from the previous transaction. Blind no-op early return was removed too, because an attacker could otherwise no-op rewrite an inactive row to warm xmin before forging active-before evidence. A no-op without a sparse delta is allowed only if no before/after delta exists and actual OLD=NEW=final native row; a later real delta makes that warming event fail the same final-audit validation.

The parent independently ran a **temp-only PG17.11 primitive probe**, not the ERP schema/lifecycle: expected OLD.xmin classification `false,true,false` was observed for first release, same-transaction UPSERT continuation and preexisting inactive reactivation. New tuples all had current xmin. Evidence: `erp-unified-implementation-20261102/parent-verification/deferred-xmin-result-v2.json`; transaction rollback verified and client closed. This confirms the tuple primitive only. The full corrected ERP trigger still requires parent engine validation. The protocol assumes the existing ordinary top-level READ COMMITTED command without SAVEPOINT subtransactions; an unsupported subtransaction must fail closed rather than broaden proof.

### Existing retained-settlement UPSERT

PostgreSQL BEFORE INSERT fires before ON CONFLICT resolves an existing row. A source-bound settlement now passes this identity guard only when its **current canonical row still exists under the same sales owner**. A genuinely retired or foreign-owner ID remains rejected.

The guard takes the sales-header lock **before** observing current-row existence, matching DELETE/UPDATE ownership locking and closing concurrent delete/reinsert reuse. All exact settlement before/after, immutable same-account snapshots, current ordinary SAVE audit/receipt and owner guards remain. This is not a source-based edit prohibition or an unconditional UPSERT exception.

## Minimal remaining standard-baseline/master seam — design only

No code in 0027 may turn `EXPLICIT_KEYS` into the legacy `ABSENT_IS_ZERO` contract. This is a technical evidence-layout task under existing rules, not a new business ruling.

1. **Current administrator provisioning is separate from package historical actors.** The standard package deliberately cannot manufacture USER_ACCOUNT identities. Define a dedicated reviewed fresh-install/bootstrap capability tied to the actual private target and a newly provisioned current administrator, not the old fixed CORE 49-account/22-hall dataset, a guessed historical actor, raw admin seed, disabled trigger or mutable GUC. Staff/account creation and real actor audit must close in one explicit protocol before ordinary maintenance/import can run.
2. **Independent standard initial profile.** Reuse `CUTOFF_STOCK_BASELINE` and the existing one-initial-baseline index, but add a separately closed standard mapping/profile and validators. Preserve old V2 raw/history publishers unchanged for their old profile; standard source/hash/registry/cutoff/counts cannot inherit fixed old customer/season/cardinality assumptions. Conversion remains `DOCUMENT_CONVERSION`, never a second opening baseline.
3. **Exact explicit key evidence.** Every provided `(warehouse_id,sku_id)` row, including explicit quantity `0`, needs immutable source identity and a typed same-operation coverage proof. Nonzero rows alone produce CUTOFF_BASELINE ledger effects. Explicit zero produces no zero-delta ledger and is not confused with missing or read failure. Missing keys remain unknown/not admitted. A standard initial writer must not emit the old `FINAL_COMPLETE_SCOPE`/`ABSENT_IS_ZERO` approval for this package.
4. **Six-column-compatible proof-carrier proposal requiring source review.** Extend the existing closed `import_record` target union with a typed inventory-key destination (and the selected standard master targets), not a new table/column. Give each key a stable generated destination ID using the existing reviewed ID algorithm. A bounded initial-import audit chunk retains exact source-record ID, key identity, warehouse/SKU IDs and canonical quantity; its receipt lists the exact coverage/effect sets. Define an explicit compact operation-pointer encoding in existing decision metadata for this new target kind so indexed target lookup can resolve `audit(operation_id)` without full-history scans. Do not silently repurpose opaque source keys, source-file archival pointers, or old reason strings; the new encoding and SQL codec must be versioned, validated and reviewed before implementation. If this cannot be proved within the six columns, report the precise missing fact instead of bypassing coverage.
5. **Standard key admission branch.** `inventory_key_admission`, first-use/sparse balance checks and recorded-pair guards must dispatch on the new baseline profile. Require an actual explicit key proof (or independently audited post-cutoff new native identity), not just warehouse membership × SKU membership. Bind each migration-approved document effect endpoint to that same selected baseline coverage and cutoff.
6. **Package semantic check.** Before READY/MIGRATE, every nonzero stock endpoint of an APPROVED ordinary document must have an explicit covered key. The current synthetic fixture has one FROM key=100 and an APPROVED transfer to a missing TO key: that missing key is unknown, not zero. A later positive test variant may declare a genuinely synthetic explicit TO=0 source row with repinned manifests/reconciliation; it must not pretend the current fixture or real source proved zero.
7. **Bounded atomic publication.** Cross-check full typed source/master/document/key coverage, exact counters, source digests and restore/cutoff alignment, then publish atomically; no ledger/balance overwrite after publication. Bootstrap/master/key imports need actual negative ACL/scope/row-identity/audit matrices, not owner-created bypass fixtures.

Until these seams and the shared ordinary adapters/services are integrated, the valid immediate engine objective is exact40→0027 schema/constraint installation and meaningful fail-closed negatives. Full business positives remain explicitly pending; the source tests and temp xmin probe cannot establish import readiness.


### Current staff header audit shape

For new schema27 commands, both ordinary header projections include `createdByStaffId` and `approvedByStaffId`, including explicit JSON null when genuinely unknown. Sales keeps its exact sparse changed-field protocol; transfer keeps its exact full typed-header comparison. New UoW codecs read the actual staff columns on schema27 and services preserve original creator staff / capture actual current approver staff / clear current approval staff on UNAPPROVE. The predecessor transfer projection is replaced in 0027, not edited in old SQL. No old receipt or audit JSON is rewritten, and no unknown historical staff is inferred from the current actor. The count stays 152 routines: this is one additional existing-routine replacement, not a new routine/column/table.


### Actual engine syntax failure and correction

The parent executed frozen source `d6a9b7b5b4d6e5f0bc5eed6fd848ed6ad25dd8a6d7545e87ff0595c9d3f74714` against the isolated exact40 target. PostgreSQL rejected it with SQLSTATE `42601` at an extra `END IF` in `validate_unified_sales_header_commit`; ROLLBACK acknowledgement and version26 readback were confirmed (`parent-verification/unified27-engine-attempt1.json`). The failing file was preserved independently as `schema-evidence/github-base-fixes/0027-failed-d6a9b7b5.sql`.

A new structural IF-nesting test first failed on that exact body, then the timestamp/header ELSIF was reformatted to close each nested IF once. The regression additionally rejects reinsertion of the extra END IF. This is a narrow structural regression, not a full SQL parser and not proof that the candidate installs. Parent must use a fresh bounded source/target/window-bound operation for the new source hash; no automatic rerun or reuse of an expired approval.

## Concrete next vertical slice: 42nd SQL source (DESIGN, NOT IMPLEMENTED)

Parent has now independently installed corrected 0027 candidate `d42954acf56445b803ae126b364b1b2a7b0cfe70a98accaeef5cc13a9082c317` on its owned isolated PG17.11 target: actual version27 / 56 tables / 590 columns / 152 routines / 213 non-internal triggers (`parent-verification/unified27-engine-attempt2.json`). This is schema/catalog acceptance only, not a business positive, importer ACL, runtime capability or production proof. Keep this installed source frozen; the following is a separate proposed patch.

### Proposed bounded bill of materials

- New source: `adapters/postgres/patches/0027_standard_import_initialization.sql`, applied **after** the exact frozen 41-source profile. This is the 42nd source, not a replacement for an old SQL file.
- **0 new tables, 0 new columns, 10 added routines, 21 deliberately replaced existing routines, 3 added indexes.** Physical tables/columns stay 56/590; logical operational target stays 35. Projected routine count is 162, subject to actual catalog verification after source implementation. No DROP of old carriers/FKs and no new master-data shadow store.
- New closed mappings: `STANDARD_INITIAL_EXPLICIT_KEYS_V1` for initial CUTOFF_STOCK_BASELINE; ordinary documents retain DOCUMENT_CONVERSION and normal SALES/TRANSFER targets, with standard publication metadata. A technical NAMESPACE_REGISTRATION mode is separate and emits no stock.
- New IMPORT action only where needed: `IMPORT_INITIALIZE_CURRENT_ADMIN` / `IMPORT_REGISTER_NAMESPACE`; ordinary stage/chunk/publish reuse their actual IMPORT_STAGE / IMPORT_CHUNK / IMPORT_PUBLISH meanings. No fake historical CREATE/APPROVE.
- Existing receipt/audit action/result CHECKs gain exact profile-specific alternatives. Existing import-record target CHECK gains the finite standard master kinds and INVENTORY_KEY. Existing base FK `import_record.import_batch_id -> import_batch.id` remains.

**Added routines (10):**

1. `standard_inventory_key_id(uuid,uuid)` — pure, tested SQL codec for the existing `stableImportId("inventory-key-v1",warehouseId,skuId)` algorithm, with exact cross-language vectors. This ID names a proof/key destination, not a new physical business-row ID.
2. `standard_import_record_proof(uuid)` — indexed record ID -> versioned compact operation pointer -> immutable audit/receipt proof; finite typed target/key lookup and namespace binding. No arbitrary SQL target or unbounded history reconstruction.
3. `standard_import_row_intent(text,jsonb)` — exact same-transaction prepared row intent, shared by the narrow standard INSERT branches of existing master guards. It is not a caller boolean or GUC. Bootstrap's temporary intent is additionally restricted to the separate initializer permission and empty-business-target proof; final closure must contain the real newly provisioned current actor.
4. `assert_standard_import_operation(uuid)` — deferred exact record/effect/count/native-row/audit/receipt closure, including explicit zero/missing distinctions and current actor scope.
5. `standard_inventory_key_proof(uuid,uuid)` — returns explicit states UNKNOWN / EXPLICIT_ZERO / NONZERO with immutable baseline/key/source/operation evidence; read failures throw, not UNKNOWN or zero.
6. `standard_initialize_current_admin(jsonb,text)` — EXECUTE-only security entrypoint for fresh bootstrap or separately authorized namespace registration; the secret parameter is not standard-package data and never enters audit/result/log JSON.
7. `standard_import_master_chunk(jsonb)` — finite 20-master-file typed INSERT or exact EXISTING_VERIFIED attachment. No overwrite/UPSERT of changed existing master facts; a mismatch is a conflict. Native values and FKs remain authoritative.
8. `standard_import_baseline_keys(jsonb)` — one bounded transaction binds actual source key records, exact coverage audit, derived nonzero baseline ledger and balances. Explicit zeros have proof but no zero ledger/balance seed.
9. `standard_import_document_chunk(jsonb)` — zero-stock ordinary current-row conversion; one real MIGRATE_DOCUMENT per document, complete lines/settlements/source mapping and baseline endpoint proof. Generated batch IDs must match the frozen execution plan, not be guessed from fixture IDs.
10. `standard_publish_import(jsonb)` — finite BASELINE_SEAL or DOCUMENT_PUBLISH phase, exact reconciliation and immutable activation link. A sealed initial baseline alone does not activate business writes.

**Existing routines replaced (21), old non-standard branches retained:**

`guard_import_batch`, `validate_import_batch_commit`, `validate_import_operation`, `guard_import_record`, `validate_import_source_commit`, `validate_baseline_source_commit`, `guard_cutoff_ledger`, `validate_sparse_balance_commit`, `inventory_key_admission`, `published_inventory_key`, `guard_recorded_live_balance_pair`, `native_creation_operation_valid`, `guard_native_creation_identity`, `is_native_party_import_insert`, `guard_maintenance_before_root`, `validate_maintenance_root_commit`, `guard_maintenance_child_write`, `guard_product_season_selection`, `is_exact_historical_customer_only`, `assert_document_conversion_batch`, `assert_document_migration`.

Each new master INSERT branch must prove its exact source/typed snapshot, version, native identity, role and current operation through routines 2–4. Ordinary maintenance UPDATE/DELETE and its existing permissions remain unchanged. The old customer-ID/season/raw-file publication profile is never the admission rule for a new standard batch. The six existing barcode configurations remain the already-approved business identities; they are not replaced by a new barcode system.

**Indexes (3):**

- `standard_inventory_key_once`: unique `(import_batch_id,target_id)` for imported INVENTORY_KEY records. Multiple source aliases remain legal only where the master registry explicitly permits them, not for stock keys.
- `standard_baseline_activation_once`: unique expression on the linked baseline ID for the single standard DOCUMENT_PUBLISH receipt that initially activates that baseline. Later ordinary conversion batches need not claim a second initial activation. Runtime lookup is bounded by this index, not a full receipt scan.
- `import_batch_namespace_binding_once`: unique legacy batch ID for an immutable BATCH_NAMESPACE_BINDING record, resolved through its retained registration audit/receipt. No old batch source_name rewrite.

### Compact proof layout, not additional columns

A new standard `import_record.decision_reason` format is explicitly versioned JSON, for example `{format:"STANDARD_IMPORT_POINTER_V1",code:"SOURCE_BOUND",operationId:"..."}`. Only new standard-profile records use it; old human reason strings are not reinterpreted. It contains no raw workbook cells, credentials or duplicated document snapshot.

The pointed audit has bounded `rows` / `coverageKeys` arrays. Each entry binds source-record ID, source row hash, typed native destination or composite key, and exact canonical facts. Receipt result lists the exact source-record and derived ledger IDs. One source inventory row claims one INVENTORY_KEY destination; its derived ledger ID is part of that proof, **not** a second original-source identity claim that would violate global source uniqueness. The source file archival pointer stays an archival pointer and source_key stays the stable original identity.

Counters are closed per profile: the 20 standard master targets, explicit coverage keys, derived baseline effects, actual generated bootstrap identities and final approval. Generated current-security rows are counted separately from cleaner source rows; the package's original table counts are not rewritten to conceal them. One public chunk has one final checkpoint/audit/receipt and bounded payload; large packages use bounded real chunks, never truncation. The initial synthetic slice fits one master chunk and one two-key baseline transaction.

### Exact initial transaction sequence

0. Validate frozen READY bytes/manifest/registry and actual target/profile/role facts. Compile a target-bound execution plan with actual baseline and document batch IDs, registered source namespace, selected-file manifest digest, verified cutoff and source/coverage/alignment digests. The real cutoff comes from the latest registered local evidence, not an earlier afternoon label or a hardcoded clock value.
1. **Initialize current administrator + stage** atomically on an empty-business target. Create an explicitly CURRENT_PROVISIONING staff/account (or bind an independently verified current identity), then its actual actor receipt/audit and stage metadata. The historical package still has no credentials and no invented original creator/approver. Use the repository's current Node scrypt/password-policy flow; credential handoff is an owner-controlled security input/ephemeral channel, not a file emitted by the cleaner or a value printed in a report.
2. Import/attach the **20 master files** with exact typed intent/source/row closure. The existing fixture has 26 master occurrences across these 20 files (six barcode schemes, two warehouses). Security provisioning records are separate current technical identities, not extra invented source employees.
3. Stage actual explicit baseline keys atomically with record/pointer/audit and derived effects. For the positive synthetic variant, FROM=100 creates its one real baseline ledger/balance; an explicitly supplied TO=0 creates retained key proof only. The current fixture's absent TO key is not zero and must fail READY/anchor endpoint coverage until a genuinely synthetic explicit source variant is prepared and repinned.
4. **Seal** the baseline with exact key/effect/master reconciliation and selected source/cutoff. Its status may become IMPORTED so DOCUMENT_CONVERSION can reference it, but standard runtime key admission stays false until step 6. No current ordinary business slips into a partially converted package.
5. Stage/import ordinary documents against that exact baseline/cutoff: the fixture's two headers, two lines and all 16 settlements; preserve unknown original actors/times/pricing/display facts. Real migration actor/time is the actual initialized/current app user. Each MIGRATE_DOCUMENT has zero ledger/balance effects and exact approved settlement balance.
6. Publish the document conversion atomically. The standard IMPORT_PUBLISH result binds baseline ID, manifest, namespace, cutoff, complete current-effective closure and `activatesBaseline=true`. The activation index makes this a bounded runtime proof. Ordinary staged documents must also be excluded from normal list/detail until their import batch is published; this is publication visibility, not a permanent source-based history route.
7. Use the real current app login and common ordinary service/UoW for first UNAPPROVE, SAVE, APPROVE and later actual-ledger reversal. No runtime capability is inferred merely from having installed DDL.

### Permissions / typed capability / recovery

- New `UNIFIED_STANDARD_IMPORT27_V1` and `UNIFIED_RUNTIME27_V1` capabilities must bind the exact 42-source hash chain, actual system/database birth identity, 162-routine/trigger/index/constraint inventory, all owners/ACLs, runtime purpose and initial activation state. Counts alone are insufficient. Old exact26 capability is not renamed or widened.
- A dedicated initializer can EXECUTE the fresh-init entrypoint only; a dedicated importer can EXECUTE the four finite master/key/document/publish entrypoints. Neither gets arbitrary table DML, schema CREATE/ALTER, trigger control, owner membership or generic SQL execution. Helpers stay private. The authenticated app identity is resolved server-side and checked as a live authorized administrator in the same transaction; the caller does not choose an actor by changing a JSON flag.
- The initialization permission is distinct from ordinary import permission. Existing-target mode never re-runs root-account initialization. Parent-isolated synthetic credentials prove a real current test login, not a historical account or production credential.
- Same original actor/request key plus identical hash replays the committed result; different contents conflict. Unknown COMMIT outcome quarantines the client and resolves the original key on the exact target; no new key or blind replay. Failed chunks leave no partial record/proof/ledger/balance set.

### Existing-target and namespace adoption, without pretending labels are namespaces

Three modes are explicit: NEW_EMPTY; EXISTING_SAME_BASELINE (same verified selected baseline/cutoff/coverage, no stock repost); INCOMPATIBLE_BASELINE (different or unproved cutoff/source, denied—no second opening baseline or overwrite).

The composite `(import_batch_id,source_system)->(id,source_name)` FK introduced by this draft 0027 is **our new restriction**, not an old invariant. A zero-column successor can replace it with the retained batch-ID FK plus a deferred namespace-coherence constraint that verifies immutable REGISTER_NAMESPACE metadata. A technical registration batch/audit binds each old batch ID, unchanged old source_name/source hash, approved canonical namespace and exact old record IDs/hashes; the namespace-binding index makes lookup bounded. This avoids inventing a namespace from an export label or changing old source_name.

Because current 0027 intentionally rejects a nonempty old carrier before adding source_system, populated-target admission needs a separately reviewed **version27 adoption variant before this 42nd patch**, not an attempt to apply fresh0027 and ignore its error. It may backfill only the newly introduced source_system column from the frozen registration mapping under exclusive locks, with a temporary strict guard that proves every old column unchanged; all other ledger/audit/receipt immutability remains. No disabling of triggers, changing old receipt targets or source-name rewriting is permitted. The fresh and adoption paths must converge to the exact same source27/postpatch catalog and source contract.

If canonicalizing namespaces reveals duplicate destination-bound source identities, enumerate the exact record/batch/hash conflicts and stop. Do not weaken the global unique index, rewrite immutable source status/reasons, suffix run labels as fake namespaces, or add a column/table merely to force this unproved case through. This is an identified data-domain/adoption blocker, not evidence that an extra column is necessarily required for the collision-free case.

### First actual engine acceptance for this slice

New temporary-only tests are not enough. On the parent's isolated exact27 target, the implemented patch must prove: fresh initializer has a real current test login; importer DDL/direct-DML are denied; all 26 source files and 16 settlements retain exact values/IDs; explicit zero has proof without ledger; absent key blocks; baseline seal alone is inactive; conversion creates no stock effects; final activation is bounded and immutable; common sales 100→116→96→116 and two-ended transfer cycles; original-key replay and mismatched-key conflict; wrong actor/role/namespace/source/key/endpoint/audit/manifest/cutoff are rejected atomically. Existing-same-baseline mode must show zero stock repost and namespace adoption must preserve every old byte except its newly added canonical namespace column. Until these are real observed results, this section remains an implementable plan, not a PASS claim.
