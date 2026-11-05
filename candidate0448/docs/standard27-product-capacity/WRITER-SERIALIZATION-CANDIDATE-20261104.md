# Product writer serialization candidate

Status: source-only, uninstalled, and deliberately impossible to execute as an installation. An unconditional exception precedes every CREATE statement inside BEGIN. It is absent from the installer/catalog cohort. No existing import behavior, grants, triggers, locks or issuer admission are changed.

## Observed source paths

- `adapters/postgres/src/product-maintenance-store.ts`: `load` takes the product advisory key and root/child row locks; product, SKU, barcode and media mutation methods write the aggregate. Maintenance preparation/completion uses `maintenance-command-unit-of-work.ts` for PRODUCT audit/receipt rows.
- `adapters/postgres/src/native-document-specification.ts`: document append takes the same product advisory key and root lock, then borrows the maintenance path. This has its own document completion protocol, not the managed product precommit lifecycle.
- `adapters/postgres/src/native-product-import.ts`, `native-sku-import.ts`, `native-barcode-import.ts`: native import code takes batch/identity locks. It cannot be declared to use the same product serialization merely because it writes the same relations. These are candidate source paths, not claims that legacy import entry points are reachable by standard27. Their actual exclusion or authorized reachability must be proven.
- `adapters/postgres/src/inventory-cutoff-import-store.ts`: import batch/record and shared audit/receipt writes use separate import lifecycle semantics. `native-party-import.ts` also writes import records.
- `sales-unit-of-work.ts`, `transfer-unit-of-work.ts`, `party-maintenance-store.ts`, `history-revision-store.ts`: shared audit/receipt write paths have other target families. Their target restrictions and privileged reachability need review, not blanket treatment as product writers.
- `adapters/postgres/patches/0027_standard_import_initialization.sql` and whole-package successor SQL contain database-side import/guard paths. Exact current routines, dynamic target selection, role grants and all later replacements must be bound to the target catalog before declaring finite closure.

## Narrow candidate behavior

The invoker trigger candidate covers INSERT/UPDATE/DELETE on product, SKU, barcode, image and PRODUCT audit/receipt rows. It resolves old and new product identities, deduplicates/sorts them, uses the existing canonical `naijue:product:<uuid>` advisory key, and takes the existing product root FOR UPDATE. Shared non-PRODUCT evidence rows are ignored. Missing parents fail, except the absent product INSERT and its first CREATE audit that must precede it. A barcode's SKU-to-product mapping is rechecked after the root locks.

BEFORE-row triggers can already hold a row lock before acquiring an advisory lock. Therefore the candidate uses `pg_try_advisory_xact_lock` and `FOR UPDATE NOWAIT`, rejecting contention immediately rather than adding a blocking lock-order inversion. This is not a claim of global deadlock freedom: existing triggers, statements, foreign keys and all other locks remain to be analyzed and tested. The guard performs no retry. Exact user-facing contention/rollback behavior needs a reviewed policy before future activation.

## Still blocking any installation/admission

- Exact authorization, predecessor/catalog pins and target role/ACL/RLS/function ownership.
- Import batch/source-record immutability and complete privileged/SECURITY DEFINER/owner/superuser writer exclusion or cooperation. This six-table guard does not close those paths.
- Canonical UUID lock-key agreement, trigger ordering, child/parent remap races and absent CREATE uniqueness.
- Live SQL parsing, invoker permission checks (especially root row locks), rollback after contention, concurrent multi-product order and interaction with existing import/document paths.
- Proven source visibility and baseline/maintenance replay, plus catalog and writer stability through commit.

Source tests verify retained stop, intended six-table scope, both parent images, fail-fast locks and mapping recheck. They do not execute PostgreSQL or certify behavioral acceptance. Do not remove the hard stop to run them.
