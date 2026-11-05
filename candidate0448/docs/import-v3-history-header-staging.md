# Approved historical headers → typed staging (not an executed import)

`authorized-header-reader.mjs` is separate from the frozen PRODUCT/TRANSFER_LINE reader. It requires independent external approval and 32-cell money-overlay SHA256 pins, original workbook root, out-of-input/repository spool parent, explicit batch UUID and fixed namespace. It cannot use an aggregate report, caller cell map or package-local approval as authority.

Before returning an iterator or authorizer it:

1. Runs the fixed reviewed OOXML extractor with `/usr/bin/python3`, no shell/custom executable. The extractor rereads original XLSX bytes bound by approval → selection → base manifest → source workbook/selected header CSV SHA. It preserves original cell t/s/v, format, 1900/1904 basis, location and exact raw decimal.
2. Runs the complete approved-v3 preflight, with the independent exact 32-money-cell pin and creator-hall source/rule verification. This retains the explicit barcode exclusions; no excluded archive rows become database source rows.
3. Joins every selected SALES_HEADER/TRANSFER_HEADER CSV row with its exact original JSONL record, full original source position/hash, authenticated creator overlay and regenerated per-cell evidence. Source SHA256 is over original valid UTF-8 JSONL bytes excluding LF but retaining CR, before JSON parsing.
4. Creates its own private 0700/0600 bounded spool. Original and normalized fields remain separate; full OOXML row evidence is retained in source provenance, not only a digest or evidence reference. No iterator escapes before all hash/EOF/coverage checks complete.

`rows()` provides mapper inputs except explicit native bindings. `authorize()` revalidates the prepared chunk, compares the complete source/context against its independently built index, checks the exact authenticated approval Map entries, calls a reviewed native resolver, and rederives every typed field. Changing even a same-shaped source/selection/overlay/cell/native target rejects. `close()` revokes authorization, including in-flight resolver calls, and removes only that reader's reconstructible directory. Use `finally`.

Limits: 4 MiB JSONL record, one million raw records, 256 MiB retained packed index text, 512 MiB source spool, fixed 15-minute extractor timeout. These are bounds on explicit data, not a measured process-RSS guarantee. The default source reader is connection-free and every report remains `nativeBindingsVerified:false`, `importReady:false`, `noSql:true`.

## Staging boundary

`prepareV3HistoryHeaderChunk` / `stageV3HistoryHeaders` accept homogeneous chunks of at most 100 headers / 4 MiB (including approval Map entries). The default is `DRY_RUN`: no authorizer, connection or write is invoked. Explicit `STAGE` requires both a store and exact-row authorizer. Store-bound DTOs retain original mapper inputs, allowing full rederivation at the SQL boundary rather than trusting a fingerprint.

`PostgresV3HistoryHeaderStagingStore` inserts immutable source evidence and the typed schema-11 header in one transaction. It requires an existing open, exact-selection-bound `V2_HISTORY_NULLABLE_1` batch; it never creates a batch, catalogue entity, live document, ledger, balance or publication. Locks follow cutoff → batch → native references → immutable source/header. Exact replay compares every real SQL composite column, casting expected date/timestamp/instant/numeric fields through the actual table types. Duplicate source identity/position, partial replay or changed evidence rejects. Whole chunks roll back; failed COMMIT has unknown outcome, discards the connection and is never retried or misleadingly rolled back.

Unknown original creator/approver/time remains NULL where schema-11 permits. Known source references cannot be cleared to evade missing bindings. Local wall times never become UTC; date-only audit values never become midnight. Unsupported sub-microsecond timestamps remain typed NULL with exact raw/provenance. Frontend and live-document required fields are unchanged.

## Verification and remaining boundaries

The synthetic full-chain reader fixture includes a complete v3 barcode selection, 32 exact money approvals, 33 headers, original XLSX regeneration and 66 numeric-cell proofs. Negative cases cover source/selection/cell/overlay/approval Map/native/context mutation, missing independent pins, self-approval, bad workbook SHA, cleanup and in-flight revocation. Protocol tests cover typed insert/replay, wrong bindings, atomic rollback and unknown COMMIT. These are not PostgreSQL engine, production, full private import, read-back, restore or release evidence.

## Explicit native reference directory (schema 12)

Old import_record remains unchanged. `0012_history_header_native_reference.sql` adds an immutable typed directory with same-batch source-row FK, entity/source identity, exactly one real HALL/CUSTOMER/STAFF FK, full binding-time snapshot/version, and source/native uniqueness. Its first-write trigger locks cutoff → batch → native targets/relations → source and checks full typed snapshot, exact original identity/name/code/contact, reviewed enum mapping and same-batch relations. No native maintenance trigger freezes later names, roles, hall membership or versions.

`prepareV3HistoryHeaderNativeReferenceChunk` and `PostgresV3HistoryHeaderNativeReferenceStore` bind existing natives only, default DRY_RUN. Full current snapshots and reviewed enums/relations must agree at first binding; exact replay retains its original point-in-time proof instead of demanding that editable native data never change. Header staging uses the immutable directory identity, not a future current-native snapshot. Warehouses still require exact same-batch IMPORTED import_record identities.

Enable `includeNativeReferenceSources:true` on the source reader to require complete HALL/CUSTOMER/STAFF selected-CSV and original-JSONL coverage in the same verification pass. `referenceRows()` returns only these independently authenticated source DTOs; `authorizeReferences()` compares complete immutable source/selection and rederives the reference mapper from a reviewed explicit native snapshot/enum/relation resolver. Native source IDs are never UUID guesses. The synthetic fixture covers all three dictionary entities and source/native mutation rejection. An arbitrary caller Map or claimed SHA is not the source authorizer.

Schema12 adds, rather than replaces, a publication trigger covering every nonempty header hall/customer/salesperson/creator-hall and warehouse source reference, plus the directory's original default customer/default warehouse/staff-hall relations. It never compares later mutable native versions. All original schema11 count, business-date, stock, evidence and validation gates remain mandatory. There is no automatic publish or application batch-create/validate/publish entrypoint here: the old schema7 service does not supply schema11 history metadata and cannot substitute.

Native catalogue creation, reviewed complete real target bindings and actual database execution remain separate prerequisites. Historical-only customer supplement rows do not have the ordinary CUSTOMER JSONL proof route: they are explicitly unsupported here, never manufactured or cleared. Missing any same-batch source/native binding rejects. Schema12-specific fresh-database guarded acceptance is separate from the frozen schema11 wrapper; migration, trigger, lock-contention, read-back, rollback-durability and restore execution remain NOT_RUN.
