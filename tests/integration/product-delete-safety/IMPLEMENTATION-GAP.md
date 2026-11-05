# SKU-bearing product deletion: remaining implementation

Status: not implemented or enabled. The current adapter continues to reject a
product with any SKU using `PRODUCT_DELETE_NOT_READY`. This document is not an
installer, database permission request, or evidence that deletion is safe.

## Existing pieces that can be reused

- `product-maintenance-store.ts` loads the product and its SKUs under `FOR UPDATE`
  and binds `assertCanDelete` to the original loaded aggregate.
- `assert_retained_sku_reference` takes `FOR SHARE` on the SKU, product, category,
  color and fit. The retained-reference triggers use it for new ordinary sales
  and transfer references and approval ledger entries. These ordinary writers
  therefore have a useful conflict with the product lock; this is not proof that
  every importer, historical writer or direct database writer is covered.
- `inventory_key_lock` serializes one warehouse/SKU key. It does not establish
  completeness of the warehouse set or prevent adding another warehouse.
- `guard_retained_catalogue_delete` preserves catalogue identities and rejects
  restoration after soft deletion. It does not establish that stock or business
  references are absent.

## Missing database contract

The runtime reader can have RLS-filtered document rows. A query that finds no
visible references cannot establish global absence. `SET row_security=off` is a
fail-closed check, not a way to obtain broader visibility. No existing routine
has been identified that gives this operation both complete reference visibility
and a race-safe complete inventory matrix.

The minimal enabling change must provide all of the following together:

1. A narrowly scoped database check for one locked product, with complete
   visibility of ordinary and retained legacy document references, all SKUs,
   warehouses, balances and ledger references. Its execution identity and RLS
   behavior must be explicitly reviewed; do not grant the runtime broad reads or
   BYPASSRLS merely to make this work.
2. A lock protocol shared with every writer that can add a reference, SKU,
   warehouse or inventory effect. Existing product and key locks may be reused
   where their actual writer coverage is established. Warehouse enumeration
   requires separate protection against phantoms. Merely locking the existing
   warehouse rows does not protect future rows.
3. Explicit known-zero stock for every applicable warehouse/SKU pair. Missing,
   unknown and failed reads remain refusal, never `coalesce(...,0)`.
4. The same check must protect the actual soft-delete write, not just an earlier
   application preflight. Keep the existing evidence, version, authorization and
   immutable identity constraints. Do not physically delete or cascade rows.
5. Exact installation and runtime admission must include the successor routines
   and triggers before the adapter's SKU-bearing rejection can be replaced.

Writing a new SECURITY DEFINER routine or table-lock statement alone would not
finish these requirements. Under the current no-permission-expansion scope,
there is no safe enabled implementation to substitute for the existing refusal.

## Required isolated PostgreSQL acceptance

Retain the two current negative scenarios, then add success only after the
contract above exists. The positive fixture must contain actual SKUs, complete
known-zero stock, and no business or ledger references. Verify that only the
intended product soft-delete/version/audit/receipt state changes and that all
child identities and stock remain retained.

Use independent connections to test an unpublished reference hidden from the
runtime, concurrent ordinary and import references, concurrent warehouse and
SKU creation, concurrent approval/stock writes, known-zero versus missing or
unknown stock, stale product version, rollback and repeated requests. Check the
global state with an independently authorized observer. A blocked or aborted
transaction is not a successful deletion; a timeout is not proof of correct
serialization. Keep this feature disabled until these actual database results
are reviewed.

## Application-boundary hardening, 2026-11-04

Ordinary27 `putProduct` now refuses a soft-delete write unless the same
transaction previously passed `assertCanDelete` for the original loaded root.
That check remains limited to SKU-free products. The authorization is bound to
the original root hash and consumed before a root write. Any attempted root or
SKU mutation invalidates the original deletion snapshot, preventing a caller
from reusing the earlier empty-SKU aggregate after adding a SKU. A failed
preflight clears prior authorization.

This is an application adapter guard, not the missing database-level global
reference/stock/concurrency contract. Direct SQL writers are not secured by it.
SKU-bearing product deletion remains disabled, pending the implementation and
actual PostgreSQL acceptance described above.

Verification: four new synthetic regression cases cover skipped preflight,
altered/reused root authorization, failed recheck, and an intervening SKU write
including attempted old-snapshot reauthorization. The first three failed before
the fix. The focused and related service/protocol tests passed 116/116 with
Node's test runner. No typecheck, real PostgreSQL, or browser test was run.

Reviewer-requested additions also passed: failed SQL write followed by retry and
recheck; ordinary edit followed by deletion recheck; two deletion calls in one
transaction while the first synthetic SQL write remains pending. The final
related run passed 119/119. This pending-query test proves only adapter token
consumption, not PostgreSQL multi-connection concurrency or lock behavior.
