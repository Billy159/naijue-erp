# Original organization / party native import

Status: implementation plus synthetic SQL-protocol/source contracts. **Real PostgreSQL migration/trigger/concurrency execution NOT_RUN. No real import, production connection, deployment or publication has occurred.**

## Boundaries

New files are `packages/application/src/native-party-import.ts`, `adapters/postgres/src/native-party-import.ts`, migration `0013_native_party_import.sql` and focused synthetic tests. This is a private, explicitly authorized historical import path, not `PartyService.CREATE`. The original service's generated CUSTOMER/SUPPLIER numbering, actor checks and ordinary database command/audit requirements are unchanged. Frontend required fields are unchanged.

Supported native targets: HALL, CUSTOMER, SUPPLIER, business STAFF and, to close the explicitly approved default-warehouse cycle, WAREHOUSE. No SKU, stock, barcode, auth account, login/password/API key, fake online actor/operation/audit, batch creation/status change or publication is performed. Business STAFF does not create a `user_account`. The approved original-created-hall derivation remains the existing employee→所属厅 rule in the header mapper; this importer does not replace it.

## Exact inputs and authority

`prepareNativePartyImportChunk(inputs)` accepts at most 100 rows / 4 MiB actual UTF-8 serialized JSON. Each row requires the exact BASE_V2 selection, original row identity/digests, complete unmodified normalized source columns, complete explicit native record with independently mapped UUID and technical initial version 1, and explicit reviewed enum/relation mappings. No IDs are looked up by name. HALL/CUSTOMER/STAFF reuse the existing 0012 application contract and same-client reference writer; SUPPLIER is **not** disguised as a historical-header entity.

Original CUSTOMER/SUPPLIER codes are retained exactly, including leading zeroes or meaningful surrounding whitespace; original enabled/disabled states are inserted directly, not enabled first and falsified by an update. Required native fields remain required. Exact historical empty optional fields can stay NULL; unknown required fields, guessed IDs, normalized name/code changes and invented values fail closed. BASE_V2 CUSTOMER/SUPPLIER has no historical created/updated timestamp fields, so both native historical values must be NULL. A separate evidence `imported_at` records actual server transaction time and must never be presented as the original historical date. Existing application records, PostgreSQL reader, web DTO and response validator already accept these NULL timestamps; no read/live contract is relaxed.

`stageNativePartyImports` defaults to **DRY_RUN**, which never calls authorization or connects. STAGE requires an independent `authorizeRow` for **every** exact row. It receives a clone and must verify original/effective file bytes, selected source row, approved target ID, every enum/relation decision and (for warehouse) reviewed import-record metadata. Its returned grant must exactly bind sourceRowId/sourceKey/nativeId/rowFingerprint/selectionSha256/approvalSha256. Hash-shaped fields and aggregate preflight success are not authorization. There is no permissive default authorizer or public HTTP route. Direct store calls are trusted internal integration seams, not an authorization boundary.

HALL/CUSTOMER/STAFF source authentication can reuse the opt-in authorized-header-reader reference source lane. That reader alone is **not yet** a complete party creator authorizer. Exact SUPPLIER/WAREHOUSE source-loader/grant integration and historical-only amendment customer evidence remain required before a real import; unsupported rows are not accepted merely because this adapter exists.

## One transaction, including the HALL / WAREHOUSE cycle

The store requires the exact schema prefix 1–13 (unknown later migrations are not silently accepted), an existing selection/namespace-bound STAGED/VALIDATING batch and no published batch. Lock order is cutoff → batch → all native targets/relations → immutable source/reference evidence. It performs no automatic retries.

1. Lock all existing explicit native targets and referenced targets. Unique-code/ID conflicts and pre-existing natives without the exact creation evidence are rejected, not adopted.
2. Insert private immutable creation intents for absent targets. Typed source/native FKs are deferred solely to allow the source and native row to be created in this same transaction. Each intent records the exact source/final-native snapshots, row grant, selection, actual transaction ID and real import timestamp. An intent cannot adopt a pre-existing row. Fixed namespace + entity + original source key is serialized and checked across batches; the adapter also refuses any prior source ID/locator for a genuinely new creation, after all final native targets are complete. Deferred SQL proves the final exact immutable binding rather than independently attesting a business INSERT event; an earlier destination must resume its original batch, not create a second HALL/STAFF with a new UUID.
3. Create new CUSTOMER/SUPPLIER, then HALL, WAREHOUSE and STAFF in native FK order. For a genuinely new HALL whose original default warehouse is nonempty, the immediate native FK pair is closed by inserting only that new HALL with temporary `default_sales_warehouse_id=NULL`, inserting its explicitly mapped new WAREHOUSE, and restoring the **original** default warehouse on that same new HALL at version 1. Existing HALLs are never nulled/updated by this path; any failure rolls back everything. No intermediate state is externally committed.
4. Only after **every** final native target is complete, insert WAREHOUSE original source and exact same-batch `import_record` (`WAREHOUSE→WAREHOUSE`, IMPORTED), followed by CUSTOMER/HALL/STAFF source/reference proofs through the shared 0012 writer. Warehouse hall identity must resolve to the exact same-batch HALL source. WAREHOUSE source `切换范围` must be exactly the existing approved `本次完整核准` contract; excluded/pending/unknown scope cannot become an IMPORTED target. Nonempty unresolved HALL defaults still fail; they are never dropped to bypass dependencies.
5. Deferred guards require the final complete native snapshot, actual immutable source, open batch, same-transaction identity, HALL/CUSTOMER/STAFF 0012 coverage and complete WAREHOUSE import_record to agree. Missing source/native/reference/record or changed final fields rolls the entire transaction back.

Migration 0013 changes exactly two existing 0006 functions by adding a same-transaction, full-snapshot, INSERT-only branch. Every original runtime body after that branch is preserved byte-for-byte. The original per-kind party-code advisory lock is still acquired before import INSERT returns; numbering is never called/changed. Ordinary future UPDATE—including one retaining an unknown NULL `created_at`—always follows the original live actor/receipt/audit/version logic. The import evidence never freezes later legitimate maintenance.

The private evidence table is immutable and inaccessible to PUBLIC. The only PUBLIC-executable helper is a fixed-search-path SECURITY DEFINER **read-only boolean predicate**, so ordinary non-owner runtime trigger calls do not fail privilege checks. That predicate cannot create evidence, source, native rows or grant authority; it is true only for the private exact same-transaction intent. Deployment must still use reviewed least-privilege role grants; this work does not create roles or credentials.

## Exact replay and unknown COMMIT

A prior successful import replays only if its immutable intent/final-native snapshot, source, 0012 reference and warehouse import_record are complete and identical. Orphan/partial evidence is rejected, never repaired into a new claim. Replay does not overwrite subsequently maintained current native rows and does not require current names/versions to remain frozen forever.

A failed step rolls back the full bounded chunk. An uncertain COMMIT discards the connection, performs no automatic reconnect/retry and does not pretend ROLLBACK resolved the outcome. After independently resolving that outcome, an explicitly authorized identical resubmission can return the original result. A final pre-publication reconciliation must independently prove current target state matches the cutover plan or its explicitly authorized later changes; a replay success is not that reconciliation.

## Verification

```sh
node --test tests/native-party-import.test.ts tests/native-party-import-migration.test.ts
npm run typecheck
```

Focused tests cover all native shapes, original disabled codes/NULL dates, DRY_RUN/no connection, per-row grants, source/projection tampering, lock/write order, one-client 0012 integration, source/reference/record completeness, new HALL/WAREHOUSE cycle, mid-cycle failure/record conflict rollback, existing HALL protection, exact replay and uncertain COMMIT. These use fictional records and a SQL protocol fake; source-text tests are **not** PostgreSQL parsing, permissions, triggers, FK, isolation or concurrency evidence. Migration execution, real engine acceptance, source-loader integration, final reconciliation and controlled publication remain separate gates.
