# History import lifecycle metadata (source / synthetic verified; PG NOT_RUN)

This is the production application/store metadata path for the existing `IMPORT_STAGE` → bounded `IMPORT_CHUNK` → `IMPORT_PUBLISH` protocol. Reconcile/validate are **logical same-transaction publication phases**, not invented persisted receipt actions. This slice does not complete native historical creation or once-only checkpoint accounting.

## Frozen STAGE contract

For mapping `V2_HISTORY_NULLABLE_1`, STAGE requires:

```ts
historyMetadata: {
  expectedCounts: { // exactly these nine nonnegative safe-integer keys
    history_sales_header: 0, history_sales_line: 0, history_sales_settlement: 0,
    history_transfer_header: 0, history_transfer_line: 0,
    import_source_row: 0, import_sku_alias: 0, import_stock_contributor: 0,
    barcodes: 0
  },
  payloadHash: "<64 lowercase hexadecimal SHA256>"
}
```

`HistoryImportStageMetadata` is exported by `packages/application/src/history-import-lifecycle.ts`. Counts shown above are shape examples, **not** approved expected values. The independent existing service authorizer must authenticate the exact selected artifact/hash/counts and command before store execution. The request hash includes this DTO. V2 missing/extra metadata keys, caller actual-count/validation flags, and history metadata on another mapping or non-STAGE action are rejected. Non-V2 legacy SQL remains unchanged. Only an exact reviewed schema11/12/13/14 prefix is accepted; unknown future versions are closed.

The original STAGE INSERT freezes `history_expected_counts`/`history_payload_hash`, sets actual counts NULL and validation false, and retains the original zero checkpoint, audit and immutable receipt. No second batch UPDATE is used.

## PUBLISH gates on the original locked client

After original receipt idempotency handling and cutoff → batch locks/CAS checks:

1. Acquire current native row `FOR SHARE` locks by fixed table/stable-ID order, including product/SKU dependencies, party/catalogue directories, members, barcode and scheme. This excludes ordinary maintenance until publication COMMIT. No native row is updated.
2. Independently count eight history/source/lineage tables and actual source-to-native barcode joins. Exact nine-key equality is an observation, **not progress-counter repair or field proof**.
3. Check source raw-cell provenance and implemented entity coverage; typed transfer-line fields/snapshots/alias lineage; resolved header date/nullable timestamp evidence/creator-hall and native-reference bindings; SKU aliases and actual canonical import scope; explicit PRODUCT binding, source identity/code/name and mandatory nine-price proof; SKU-only raw barcode identity and source-declared nature/state/scheme; stock contributor/baseline/source/warehouse/unit/signed-sum lineage. Modern creator snapshots/references are checked against current native values. Schema12 existing-reference or schema13 party creation evidence and schema14 catalogue evidence require their typed directory plus current snapshot consistency.
4. Missing typed capability is a hard failure: nonzero SALES_LINE, SETTLEMENT or SALES_HEADER currently cannot publish. A sales header with zero lines is not a valid published historical sales document. Every transfer header must have at least one checked transfer line. Unknown/raw-only source entities, missing directories, unresolved business dates and missing product proof also fail closed even if all counts match. Original DB publication guards independently remain active.
5. Only after successful readback, insert the original explicit final-scope approval record and perform **one original checkpoint CAS UPDATE**, setting actual history counts and validation true alongside status/checkpoint/completion. Keep native audit/receipt in this transaction. A failed readback/CAS/deferred guard rolls back everything.

The exported `reconcileHistoryImport` report separates `actualCounts`, `authorizedPayloadHash`, `sourcePayloadHashRecomputed:false` and `sqlFieldValidation:HISTORY_IMPORT_READBACK_V1`. The hash identifies the authorized artifact; SQL counts are **not** a recomputed whole-content digest. Readback checks retained exact fields/provenance/bindings, not a fresh download or reauthentication of original private files. Source creation/staging authorizers remain the artifact-authentication boundary. Optional source fields not claimed by an older binding-only source are not fabricated or reported as original observations; modern creator metadata receives its full current-snapshot checks. The original six-key persisted cutoff receipt/result is unchanged.

### Replay is not publication reconciliation

An exact original operation receipt replays its immutable original result without modifying current rows or rerunning publication. Similarly, native creator exact evidence replay may succeed after legitimate native maintenance. Neither means current native values still equal creation values. New PUBLISH independently requires the retained current-reference/creation snapshots to match locked current natives. Drift is rejected, not overwritten: a separately reviewed current reconciliation/approval capability is needed to publish changed dependencies; this slice does not provide one. Restoring values is not automatically authorized by this document.

## Deliberately unresolved accounting/creation gates

Native SKU/WAREHOUSE creators already insert `import_record`; the old IMPORT_CHUNK also inserts them. This slice does **not** swallow duplicate inserts, count table rows into checkpoint counters, upsert/adopt targets, or add a fake receipt action. Such a mixed path stays fail-closed. A future reviewed once-only accounting claim should associate each exact existing record with one original receipt/checkpoint increment; pre-existing nonzero counters without claims require explicit recovery review, not aggregate backfill. Canonical SKU target count is once per merged SKU; alias/contributor counts are separate nine-key observations.

The frozen stock guard still requires a real supported baseline attachment. Unsupported zero-net contributor groups are not fixed by inventing zero ledgers or discarding contributors. SALES_LINE/SETTLEMENT typed mapper/payment binding and once-only record ownership remain release blockers. Counts equality and this metadata layer cannot establish full native import readiness. The native SALE test fixture now uses this formal DTO/store without a SQL metadata decorator, but its independent lawful native setup is **not** historical native-creation acceptance.

## Transaction failure / evidence status

Before COMMIT attempt: rollback on failure, discard if rollback fails. After COMMIT attempt/ack loss: **no ROLLBACK, no retry, discard and preserve the original uncertain error**. Resolve only through independent operator readback/original idempotency protocol, never infer outcome from a disconnected client.

Synthetic tests inspect protocol order, exact DTOs, independent observation/error gates and CAS/receipt/unknown-COMMIT behavior. They do not parse/execute SQL, prove isolation/durability, authenticate real files, or publish a real batch. Cloud PostgreSQL is not started or connected. Real PostgreSQL schema11–14 field/guard/transaction acceptance is **NOT_RUN**, pending the separately authorized Mac run.
