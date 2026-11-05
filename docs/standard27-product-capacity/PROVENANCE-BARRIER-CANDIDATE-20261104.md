# Import/source provenance barrier candidate

Status: inert source construction only. The SQL begins with an unconditional installation exception before any CREATE. The paired capacity reader is behind its existing literal-false admission gate. No database behavior, import routine, ACL, installer cohort or feature activation changed.

## Actual source linkage

The standard27 V1 product proof in `standard-catalogue-completeness27.ts` follows `import_record` → `import_batch` → IMPORT `operation_receipt`/`audit_change`. `0027_standard_import_initialization.sql` writes import records, batch checkpoints/status and IMPORT evidence. Whole-package successors replace portions of that protocol, including batch checkpoint updates. `inventory-cutoff-import-store.ts` and native import adapters contain additional batch/source writers. Their genuine runtime reachability, exact routine cohort and family scope must be established independently; mere presence in source is not authority.

The previous six-table product-root serialization candidate does not protect mutations of shared source/batch state. Enumerating every affected product from a batch could be incomplete or unbounded. This candidate instead introduces a fixed coarse provenance advisory key as an experiment to review.

## Intended protocol, not installed guarantees

- Writers to import_batch/import_record acquire an exclusive transaction advisory lock with a try-lock, as do audit/receipt changes whose OLD or NEW target family is IMPORT.
- TRUNCATE on any of those four relations takes the same exclusive barrier. This is necessary because a row-only trigger misses TRUNCATE. Existing immutable/no-truncate guards are retained and remain authoritative.
- The closed product capacity reader would acquire a shared transaction advisory lock before its provenance reads/rechecks and retain it through commit/rollback.
- A backend already holding the opposite lock mode is rejected in both directions. PostgreSQL advisory reentrancy must not silently turn a provenance reader into an import writer, or admit a reader inside an import-writing transaction. The catalog lock-tag interpretation and behavior remain untested on real PostgreSQL.
- Other product operations could share the barrier, while an import writer excludes them coarsely. This is a contention design, not authorization, source validation or an installed security boundary.

## Lock hierarchy and remaining risks

The intended host acquisition order is provenance barrier → sorted product advisory/root locks → child/reference/evidence work. Current application flows can take product or batch/row locks before reaching these candidate hooks. The candidate uses only try-advisory acquisition rather than waiting in that inverse order; contention aborts, without an automatic retry. The product serialization candidate similarly uses root NOWAIT.

This does not establish global deadlock freedom. Statement relation locks, multi-table TRUNCATE, foreign-key checks, existing trigger execution and prior row locks may occur before the new trigger runs. These paths require exact lock graphs and real multi-session contention/rollback tests before any installation. No existing acquisition order was changed in this source pass.

## Still blocking installation or readiness

Exact target authorization and reviewed source/catalog predecessor; all source dependencies and replacement routines; actual runtime privilege/RLS visibility; owner/superuser/SECURITY DEFINER and disabled-trigger exclusion; schema/ACL stability; actual installed enabled trigger identities and function bodies; direct SQL and mixed transaction entry restrictions; verified product provenance replay; contention handling and performance. No advisory lock can establish these facts by itself. The stop must not be removed for a test.

Tests inspect source construction and exercise the unchanged closed-issuer/lifecycle boundaries. They do not parse or run these SQL statements, validate pg_locks tag decoding, or demonstrate PostgreSQL isolation behavior.
