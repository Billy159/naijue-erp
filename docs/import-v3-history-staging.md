# V3 → schema 11 historical staging: bounded first slice

## Implemented (not an executed private import)

`prepareV3HistoryChunk` maps exact v2/v3 **TRANSFER_LINE** columns to schema-11 history transfer lines. `stageV3HistoryChunk(input)` defaults to **DRY_RUN** and does not authorize, connect, write or publish. It returns aggregate counts, not source rows. Each chunk is limited to 200 records / 4 MiB. All original source fields, exact normalized fields and versioned provenance remain separate. All 11 original own-key fields must exist; every non-SKU field must match normalized text exactly. The only permitted old→canonical SKU difference must resolve through the same-batch old-SKU alias in the database. Missing original blank fields are rejected, not manufactured. Signed int64 quantities are never converted through Number; historical barcode snapshot text is retained even when a barcode archive row was excluded.

An explicit `STAGE` call requires both a store and an `authorize(preparedChunk)` callback. The callback must verify these exact rows against the approved v3 selection, original snapshot/source hashes, CSV and explicit native bindings. **Use the shared approved-file reader below for source-row authorization. An aggregate preflight PASS, a caller boolean or package self-approval is not a substitute.** Native target resolution is still an explicit caller responsibility. The prior readonly bundle preflight remains readonly; this module is not a CLI that will load a private directory into a database.

`PostgresV3HistoryStagingStore` uses an injected pool; construction does not connect. It requires an already-open `V2_HISTORY_NULLABLE_1` batch with `source_hash` equal to the exact effective-selection SHA and `source_name` equal to the fixed namespace. It does not invent cutoff/time metadata or create that batch. Explicit same-batch historical header/source and canonical SKU alias bindings must already exist. Missing dependencies fail closed.

The transaction order is `BEGIN → cutoff_import_lock → batch FOR UPDATE → existing header/source/SKU FOR SHARE → original evidence INSERT → history line INSERT → COMMIT`. Immutable evidence and target line are one transaction. An existing source identity is accepted only when **all stored source and line fields** equal the exact requested content, including selection-bound provenance. Partial or changed replay fails. A failed chunk rolls back wholly; no receipt/checkpoint is advanced. An unknown COMMIT outcome is propagated and the connection discarded, never automatically retried. Caller reconciliation may explicitly replay the same chunk later. There is no UPDATE, publication, balance/ledger mutation or live-document SAVE path.

Focused synthetic protocol tests:

```
node --test tests/import-v3-history-staging.test.ts
```

These use a deterministic fake transaction client. They are **not PostgreSQL engine tests**; migration triggers, PostgreSQL JSONB comparisons, constraints, lock contention and actual rollback durability still need isolated database validation.

## Deliberately not guessed / remaining integration

- Reviewed native binding catalogue/resolver. The shared source loader below defines and verifies `row_sha256` from original JSONL bytes, never normalized data; it cannot invent native target bindings.
- Batch creation, explicit cutoff/time metadata and approved expected history counts. Existing inventory cutoff ports support only four targets and ledger receipts; they cannot silently be reused as a full schema-11 history checkpoint.
- Header date/time encoding, local-wall-time versus instant policy, source status/business-type/settlement enum mappings and nullable boolean/discount semantics. Raw values must stay available; do not fill dates or convert a timezone by assumption.
- Native dictionaries, headers, SKU alias creation and full catalogue/product import. Their order is a real prerequisite, not an implicit default.
- PRODUCT source proof writes must use `insertValidatedCatalogueSourceProof` from `adapters/postgres/src/catalogue-completeness.ts`, in the same transaction as the validated native product write, preserving **cutoff lock → batch → product → source** order. Do not first insert a generic PRODUCT source then try to patch its immutable proof. This TRANSFER_LINE-only store cannot write PRODUCT rows, so does not bypass or duplicate that writer.
- Excluded PRODUCT barcode rows and raw/audit/exclusion evidence are never generic database source-row targets. This slice rejects non-TRANSFER_LINE entities and any known raw PRODUCT binding.
- Complete-history validation, database read-back, publication approval, restore rehearsal and native acceptance. There is no auto-publish and every entry-point result remains `importReady:false`.

## Shared approved-file reader / source authorizer

`scripts/import-v2/authorized-reader.mjs` now connects the existing complete v3 preflight to a source-only reader for PRODUCT and TRANSFER_LINE. It does **not** accept a preflight report as proof. The caller supplies an independent trusted SHA256 pin for the external approval file. That exact file must also match the packaged approval; the existing preflight checks all base/amendment payloads, the exact exclusion set and effective selection. A package-local approval, absent pin, wrong pin or aggregate-only assertion is rejected.

The reader reuses the preflight's hash-checked parsers, builds packed selected canonical rows, then scans the original JSONL once. It joins full entity/source identity, source-file SHA catalogue, original file/sheet/row and old→canonical SKU aliases. A missing/duplicate original, changed non-SKU transfer field or unapproved alias fails closed. `rowSha256` is SHA256 over the exact decoded/re-encoded valid UTF-8 JSONL record **excluding LF but retaining CR**, before JSON parsing; its versioned rule is recorded in `fields.__source_row_hash`. This is separate from the original workbook SHA and selected CSV SHA.

Verified complete records are written to a newly created private 0700 directory / 0600 spool, outside the repository and both input bundles, limited to 1 GiB. Packed canonical row/key text is capped at 192 MiB and alias key/value plus source identity/position/digest text at 96 MiB; these are explicit retained-data limits, **not a measured process RSS guarantee**. No iterator or authorizer is returned before all original-input EOF/hash/coverage checks succeed. The returned report contains only aggregate counts, spool byte count and SHA; no source IDs or private rows. A failure removes only that reader's own temporary directory. Call `close()` in `finally`; it revokes authorization and removes the reconstructible spool. Original inputs are never rewritten.

`rows(entity?)` streams original+normalized+provenance records; each record is checked against the in-memory source digest and selected-file binding. `authorize(preparedChunk)` revalidates the relevant staging shape, batch/namespace, full source digest and exact selection. It additionally requires a caller-supplied **reviewed native binding resolver**, comparing actual explicit native header/SKU or product/version bindings. No native resolver is supplied here; source-only iteration must not be called a native binding proof. PRODUCT uses the same source authorizer and its own strict nine-price validator, without bypassing unsupported original→normalized price transformations. Header entities remain outside the reader whitelist until their typed mapper is integrated.

A connection-free CLI scans and reads back the spool, reports aggregates, then cleans it:

```
node --max-old-space-size=768 scripts/import-v2/authorized-reader-cli.mjs \
  BASE_V2 AMENDMENT EXTERNAL_APPROVAL INDEPENDENT_APPROVAL_SHA256 \
  OUTGIT_EXISTING_SPOOL_PARENT EXPLICIT_BATCH_UUID FIXED_NAMESPACE
```

This CLI has no native resolver, database connection, stage call or publication path. Its `nativeBindingsVerified:false` and `importReady:false` are deliberate. The earlier missing file/source-row authorization layer is now supplied for these two entity types; native mapping resolution, prerequisite catalogue/header/batch creation, full history entity coverage and database execution remain outstanding.
