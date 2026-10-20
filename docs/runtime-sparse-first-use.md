# Runtime sparse first use

Scope: native nonhistorical SALES and TRANSFER APPROVE only. Migration 0008 is SQL source only and has not been executed. It replaces exactly `validate_sparse_balance_commit` and `validate_transfer_effect`, preserves all trigger names, and adds no table, field, index, trigger, business seed or zero record. Migrations 0001–0007 remain unchanged.

## Meaning of absent stock

A missing balance is not automatically zero. The trusted transaction must hold the exact posting key lock and verify:

- One completely published cutoff batch, completed timestamp, exact final checkpoint counts/cursor and immutable final complete-scope approval tied to its manifest/hash.
- The native immutable integrity capabilities and version-8 source integration marker, with trigger names checked on their exact tables.
- The exact native warehouse/hall and formal SKU/product/color/fit/size-group relationship; warehouse and SKU membership in that same published batch. The exact size-group-member row is share-locked along with the native identities, so it cannot disappear between proof and commit.
- No existing balance or prior ledger for that exact warehouse/SKU key.

This proof is bounded to publication evidence and actual posting keys. It does not reload all warehouse/SKU members, materialize a Cartesian product, reread source files or sum historical ledger. Its cache belongs only to the current transaction. Existing authorization, sales economics, transfer hall visibility, disabled-source exception and reference policies remain responsible for business access; publication membership is not authorization.

## First actual posting

1. Actor/request-key and document locks retain existing semantics. Distinct posting keys take `inventory_key_lock` in the same binary JSON `[warehouseId, skuId]` order as the importer, before any balance row lock. Separate awaited queries make lock acquisition order explicit.
2. All missing posting keys are proven before the first business effect. Older adapters without the explicit trusted proof hook fail closed.
3. The service appends a genuine nonzero APPROVE ledger effect, then inserts that actual delta as balance version 1. There is no temporary zero/version-0 balance or synthetic opening ledger.
4. The primary key and `ON CONFLICT DO NOTHING` plus strict one-row acknowledgement reject a losing first insert. It is never an upsert or silently reported as success. A later waiter reads the preceding committed balance after the key lock and follows ordinary version CAS instead.
5. Repeated actual lines for one key retain distinct ledger sources. The first inserts; each later effect updates with version CAS. Negative quantities are legal. An actual cumulative zero from offsetting business lines is retained because it is used stock, not a manufactured zero row.
6. Header, actual details, ledger, balance, native audit and immutable receipt remain one atomic transaction. Deferred first-insert validation requires exact runtime source ownership, complete publication, receipt/audit identity, final quantity equal to this operation/key's cumulative delta and final version equal to this operation/key's actual effect count. Existing-key UPDATE and IMPORT baseline branches retain prior behavior.

Read, proof, SAVE and VOID do not create balance or ledger rows. Missing-balance UNAPPROVE remains closed. Valid runtime reversal after first approval follows the existing immutable original-entry path and leaves the used zero balance in place. Historical `CUTOFF_HISTORY` mutation/first-unapprove and post-publication catalogue CREATE membership are explicitly outside this change.

## Errors and uncertainty

Unpublished/out-of-scope absence or an unavailable exact native join (including missing size-group membership) is `INVENTORY_NOT_READY`. Inconsistent publication, contradictory returned native proof facts, prior ledger behind a missing balance, or absent integrity capabilities are `INVENTORY_INTEGRITY_FAILED`. First-insert/CAS acknowledgement other than exactly one row is `VERSION_CONFLICT`. Callback/write errors request rollback. Unknown COMMIT outcome is not a rollback proof: the connection is discarded, no automatic replay/new key is issued, and callers must retain their original request key.

## Evidence and limits

Targeted application, scripted PostgreSQL-protocol and SQL-source contract tests cover existing write compatibility, first inserts, repeated lines, negative stock, proof rejection, conflicting insert acknowledgement, failure/rollback request and unknown COMMIT handling. Scripts do not prove PostgreSQL syntax, deferred trigger behavior, live concurrency/deadlocks, actual rollback/durability or production authorization. No database, network, server, browser, installation, migration execution, commit, push or deployment was used for this slice.
