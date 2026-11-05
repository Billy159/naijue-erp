# Sparse cutoff/import foundation

Status: source-only, synthetic application tests and simulated SQL-protocol tests. Migration 0007 has not been parsed or executed by PostgreSQL. No database connection, real import, server, migration runner, private data, deployment, installation, commit, or push was performed.

## Approved storage boundary

0007 adds only the previously approved `import_batch` and `import_record` tables with their catalogue columns, `sales_header.import_batch_id`, `transfer_header.import_batch_id`, and `inventory_ledger.source_import_batch_id`. It adds constraints, indexes, functions and triggers on those approved fields. It does not change migration 0001–0006. Other owners may independently revise 0006.

No balance columns, extra design tables, baseline-entry pointer, native-zero ledger event, complete warehouse×SKU zero rows, whole-document JSON store, historical-contribution table, old-runtime data path, funding balance or correction command is introduced.

## Implemented source foundation

- `createCutoffImportService` requires explicit trusted-server authorization of the exact approved manifest and fixed source namespace, frozen manifest/mapping metadata, exact expected counts and a stable original request key. Inputs are snapshotted before asynchronous authorization. No permissive default policy is supplied.
- `PostgresCutoffImportStore` stages one batch, appends bounded chunks of 1–500 already approved native warehouse/SKU identities or nonzero baseline facts, and explicitly publishes after final reviewed completeness approval. It does not import/create master records or historical documents. Missing official IDs are errors, never guessed mappings.
- Chunk data, immutable source destinations, actual nonzero baseline ledger/balance rows, compact receipt references, sparse progress audit and checkpoint share one application transaction. Each actual INSERT must report one inserted row before the locked checkpoint can advance. Native checkpoint checks inspect only constant-size monotonic metadata; full growing source counts are reconciled once at publication, not on every chunk. Balance writes are INSERT only, never UPSERT or overwrite. No zero baseline is accepted.
- Source IDs and baseline IDs use fixed namespace + source category + original key. Filenames do not define identity. An existing identity cannot be rebound in another batch, including under a renamed file or changed namespace metadata. Same original request/key and same body return its saved result; conflicting bodies fail. COMMIT acknowledgment loss is not automatically retried: inspect the same original request key.
- A global initial-cutoff lock prevents a concurrent batch from inserting late baseline stock after publication. Batches also lock receipt, batch, cross-batch source identities and warehouse/SKU keys. Source locks precede INSERT statements, in one deterministic order, so the next READ COMMITTED statement can observe a previous holder's commit. Production concurrency/isolation behavior is still unverified.
- Migration composition explicitly keeps 0004's native SALES/TRANSFER receipt-source validator unchanged while dispatching it only for APPROVE/UNAPPROVE. CUTOFF_BASELINE dispatches to its import provenance validator, not the native function's NULL-transfer fallback. The import checkpoint audit lookup uses a partial unique `(object_id,new_version)` index with uncast native equality.
- Final approval is one approved source record, not a new schema field. Its immutable original reference/hash must match the frozen manifest, and it explicitly attests complete scope, absent-as-zero, all files verified, final delta verified and no unresolved exceptions. EOF or equal grand totals alone cannot publish a batch.
- Publication checks every expected target count, native membership (including inactive retained IDs), all source decisions, and each nonzero key's source→ledger→quantity/version/operation chain. Existing unexplained balances or any other ledger effects block publication. Native warehouse/SKU writes are table-locked during final scope validation. The final checkpoint, complete-scope approval and IMPORTED state are atomic. PASSED is not usable.

## Sparse integrity and read proof

The ledger remains append-only. A deferred noncascading composite FK from ledger warehouse/SKU to the balance primary key retains every used balance, including balances later returning to zero. Balance deletion and identity changes are rejected; statement-level TRUNCATE guards cover retained ledger/balance/source/audit/receipt/scope relations too.

Deferred import-only native checks require each fresh baseline balance to match its single nonzero source ledger, version 1 and actual operation. Each baseline must be a member of its receipt's immutable IDs, and the exact bounded effect set is reconciled once per import operation. An import receipt cannot overwrite any existing balance. There is no xmin/xid/transaction-ID wraparound or savepoint proof, and no full historical ledger sum or per-row whole-operation scan on ordinary writes. Existing native sales/transfer transaction contracts and validators remain unchanged. Stronger generic direct-database mutation proof and sparse first-use runtime commands are not claimed by this foundation; arbitrary direct writes must not be granted to the runtime caller.

`readPublishedCutoffScope` is a helper for a future PG inventory query's existing repeatable snapshot. It reads the single IMPORTED batch, native guard capability and W+SKU scope members, not source files, old IDs, original-code mappings, all historical ledger rows or a zero Cartesian product. Its standalone reader is scope inspection only. `sparseInventoryQuantity` returns exact 0 for an absent balance only within that proven scope, preserves existing negative integers, and throws for invalid scope/key/balance. Errors must fail the whole inventory response; no UNKNOWN cell or successful all-zero fallback is emitted.

The native guards presume a properly privilege-separated application role that cannot disable/drop/replace them or write as a database owner. Presence checks are not proof against a privileged actor who corrupted data while protections were disabled and reenabled them. Real PostgreSQL testing, migration review, grants and integrity validation remain required before any production claim.

## Explicitly unfinished and closed

1. Historical native header/line import and first historical unapprove are not implemented. CUTOFF_HISTORY headers/details stay frozen, and existing application/runtime guards remain fail-closed. 0007 deliberately continues rejecting historical inserts/commands. The required frozen-version example remains 7 → first unapprove +2 = 9 → resave quantity 3 stays 9 → approve −3 = 6; this pass does not claim an integrated execution of it.
2. Native new warehouse/SKU CREATE evidence and first-use sparse runtime stock insertion are not wired into existing sales/transfer command adapters. No missing balance is silently manufactured by those adapters. The shared stable key lock and read proof exist, but commands must still be integrated and validated before first use of an absent-zero key is enabled. Imported/unclear identities cannot be mislabeled native-new.
3. A full PostgreSQL inventory query reader, HTTP import routes, cleaned master/historical data ingestion, real source verification, production permission grants, live migrations and real PG isolation/durability verification remain outside this scoped foundation.
4. Actual cutoff instant, last old-system increment and approved cleaned input remain required. Synthetic attestations are test fixtures, not real completeness approval.

## Verification

Focused commands are recorded in `evidence/inventory-cutoff-verification.json`. SQL-text tests assert declared source structure only; protocol fakes assert requested statement ordering, parameters and failure handling only. They do not demonstrate SQL syntax validity, PostgreSQL constraints, cross-session uniqueness, savepoint semantics, transaction isolation, locking, crash safety or durable commit.
