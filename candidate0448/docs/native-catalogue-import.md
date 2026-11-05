# Native dictionary creation — guarded import slice

**Status: source implementation + synthetic SQL-protocol tests. Real PostgreSQL: NOT_RUN.** No real database connection, migration execution, actual source import, service registration, publication or deployment is performed. No private records are included in this document or the tests.

## Files and contract

- `packages/application/src/native-catalogue-import.ts`: bounded preparation and default **connection-free DRY_RUN** orchestration.
- `adapters/postgres/src/native-catalogue-import.ts`: executable native `INSERT` + immutable source + typed binding SQL, in one client/transaction.
- New `0014_native_catalogue_import.sql`: typed dictionary/member FKs, source/native uniqueness, immutable/closed-batch guards and an additive source-binding publication guard. Frozen 0011/0012 are not edited. This adapter requires the exact reviewed migration prefix 1–14, not `>=14`.

The seven output entities are CATEGORY, COLOR, FIT, SIZE, SIZE_GROUP, SEASON and SIZE_GROUP_MEMBER. They are **not** added to the 18-table business CSV contract by guessing source columns. The separate versioned `REVIEWED_DICTIONARY_OCCURRENCES_V1` selection must be independently authenticated against exact original/new-dictionary bytes, original file digest and locator, manifest selection, occurrence contract, source identity, native allocation, every property decision and dependency binding. A matching name or aggregate preflight flag is not authority. A trusted exact-source loader/authorizer for these occurrences **is not yet implemented**; therefore this slice alone is not a runnable real-data import.

Every row includes unmodified raw/normalized original cells with ORIGINAL provenance, a literal original identity field, and a separately supplied native ID (members use their existing composite group/size key). No IDs are allocated by this module. For JSON/nested dictionary sources, an approved occurrence contract must describe exact parent/child locators and membership edges, without fabricating workbook sheet/row positions or duplicating a source position under different invented labels. Any source decomposition needed to produce both a size and a membership must be reviewed against the original artifact before authorization.

Every non-technical native property needs one explicit decision:

1. `SOURCE_FIELD`: exact, semantically corresponding original property, with its original field name and raw value retained. Canonical integer text may become a PostgreSQL integer display order without changing its value. This is **not** permission to call an original identifier an original business code.
2. `REVIEWED_VALUE`: separately approved **new native property**, retaining `MIGRATION_DERIVED` origin, exact original input fields/values, versioned rule ID, reason, evidence reference and approval digest. Examples requiring this route include allocating a new group code from an original group ID, choosing new array-based display order, interpreting an original blank size code as NULL, or enabling a new dictionary. These rules are **not approved by this implementation** and are never filled by defaults.

Creation version 1 for CATEGORY/COLOR/FIT is a technical version, not an invented business property. The native FIT one-uppercase-letter constraint remains unchanged. Native SIZE code remains nullable and not globally unique; exact empty strings do not automatically become NULL. No `enabled=true`, invented name/code/order, name matching, category reclassification, size-group reassignment or SKU mapping transformation is performed. Existing approved canonical SKU mappings are inputs to later work, not recomputed here.

CATEGORY parent source/native bindings are explicit and preserve the existing acyclic one/two-level catalogue contract. Members require exact group and size source/native bindings. References must resolve either to another exactly matching row in this chunk or to a full, locked, same-batch typed binding. Native existence alone is insufficient. A created group must have at least one actual member+size before evidence writing; all creation rolls back if that check fails.

## Transaction and replay

1. Global cutoff lock → exact selection/namespace-bound open batch lock (reject any already-published batch).
2. Lock **all pre-existing native identities by stable ID/composite key**, including unique-code collision candidates, then lock native dependency identities. Retain current-versus-creation equality only as an observation, not as an early replay rejection. An absent intended ID with a competing unique code still fails; it cannot adopt that competing row.
3. After all these native locks, read and classify **every** immutable source/typed-binding pair before any INSERT. Exact original source, full creation snapshot/decisions/fingerprint and binding, plus the same existing native identity, produce **REPLAYED** even if that native or its dependencies have since been legitimately maintained. Current rows are never restored, renamed, reparented, re-enabled or version-reset. An old code legitimately reused by a different native ID is not mistaken for the original operation's target. Missing/partial/orphan/changed immutable evidence still fails; an existing native ID without the exact operation proof cannot be adopted.
4. For **first creation only**, require every locked current dependency to match the separately approved dependency snapshot exactly. An old parent's replay proof cannot authorize a new child/member using a stale current mapping, including mixed replay/new chunks. Create absent targets in FK/topological order, with groups/sizes before members. All native INSERTs complete before any new source/binding INSERT. A newly created group must have an actual member+size in the same transaction; operation replay does not certify current group completeness.
5. Insert each new source and typed binding on the same transaction/client in dependency order. The migration guard checks binding-time native snapshots, original cells/provenance, property decisions, selection digest and same-batch dependency bindings. Existing operation evidence is never updated.

`inserted` counts actual **CREATED** native rows; `replayed` counts **REPLAYED** immutable operation records. Both imply **BINDING_VERIFIED**, but only CREATED means native INSERTs ran. `nativeCurrentMatchesCreation` records whether this chunk's locked native targets and explicit dependencies currently matched their creation projections; it may be `false` on successful REPLAYED results. DRY_RUN does not read current native state and omits this observation. It is not a current catalogue completeness or readiness claim.

Effective lock protocol remains cutoff → batch → all pre-existing native identity/dependency locks → immutable evidence reads/classification. Native INSERTs for previously absent identities follow classification, and all new source/binding INSERTs follow all native creation. Missing-target races against live writers fail native uniqueness/transaction checks and roll back rather than adopting a competitor.

Any failure rolls back the entire chunk (up to 200 rows / 4 MiB UTF-8 JSON), including all newly created native rows. Once COMMIT has been attempted, a lost acknowledgement discards the client and rethrows the original uncertain-COMMIT error: it does not attempt ROLLBACK, replace uncertainty with a rollback result, or automatically retry. Explicit identical replay can resolve a known committed outcome without duplication; a caller must first handle the uncertain result appropriately.

The **trusted adapter** enforces “native created by this transaction, not adopted.” The typed SQL binding guard independently certifies the **binding-time** native snapshot and immutable evidence, but does not itself prove the native row was inserted rather than updated/previously created. An owner/direct-SQL actor could register a matching existing row; SQL permissions/controlled write entry points remain part of production hardening. An `xmin` check alone would not distinguish same-transaction UPDATE from INSERT. This boundary is not advertised as database-independent creation attestation.

**Publication-time current reconciliation is a separate required step.** Successful operation replay deliberately does not re-certify current native fields or dependencies against an old creation snapshot, and cannot replace that reconciliation. The additive publication trigger only rejects unbound dictionary source rows. It neither publishes nor replaces existing complete-scope, final-delta, count, history, barcode, stock conservation or PRODUCT price-proof gates. Snapshots certify binding-time facts; future authorized native maintenance is not blocked by comparing mutable current rows at publication. Results always retain `published:false, importReady:false`.

## Source readiness: verified structural gaps, not guessed data

The current v2 manifest hash-binds the three dictionary payload files. The group file was copied from the preserved uploaded supplement's current-size-group array; color/fit identity files were aggregated from the original SKU snapshot. Their structures are not equivalent to full native dictionaries:

| Artifact | Available original/approved structure | Missing explicit creation decision |
|---|---|---|
| current size groups | Group `id`, `name`, nested members with `id`, `name`, `code` | New native group code; membership order; explicit original-blank-code → NULL policy where applicable; independently allocated native IDs; precise original occurrence/member-edge source mapping |
| source color identities | Literal color identity and candidate name set | Reviewed use of a single candidate name or conflict resolution; new dictionary enablement; native IDs |
| source fit identities | Literal fit identity | New/authoritative name, new dictionary enablement, native IDs |
| category / season | Literal PRODUCT category-path and season-reference fields; original template documents one/two-level category path syntax, but not independent native IDs/order/codes | Explicitly approved path-component/new-configuration occurrence contract may derive exact category nodes, without product-name guessing; season labels, including combined labels, must be retained or explicitly reviewed rather than choosing one component. Native order/season code and source-occurrence identity need reviewed new-configuration decisions |

Previously captured UI dictionary material explicitly labels itself **observed frozen Demo runtime UI** and marks native import unapproved. It is not silently promoted to original user-database authority. It can only serve as a candidate new-configuration artifact if separately approved. An original business label referenced by PRODUCT is also not sufficient dictionary-creation authority.

No user data, private dictionary values, source filenames/digests, native IDs or generated mapping records belong in Git. Real decision counts/examples and approval packets are handled privately by the integration owner.

## Verification

`tests/native-catalogue-import.test.ts` is a copy-on-write **SQL protocol fake**, not a PostgreSQL substitute. It covers actual native INSERT statements for all six dictionaries/member, exact contiguous parameter binding, default dry run, denial, callback isolation, explicit derived decisions, preserved SIZE null/nonunique code semantics, post-maintenance target/dependency replay without writes, immutable source/binding/creation-decision drift and orphans, stable native-lock-before-evidence classification ordering, first-time stale dependency and unique-code collision rejection, whole-chunk rollback, schema/batch mismatch, empty groups and explicit replay after lost COMMIT acknowledgement. SQL-source assertions check typed FKs, unique/immutable/closed-batch guards and member empty-reference fail-closed logic.

Run:

```sh
npm run typecheck
npm run build
node --test tests/native-catalogue-import.test.ts
```

Real PostgreSQL syntax/function resolution, migration application, constraints/triggers, permissions, isolation, uniqueness races, concurrency/deadlocks, restore and read-back remain **NOT_RUN**. Synthetic protocol checks cannot justify a real import/readiness claim.
