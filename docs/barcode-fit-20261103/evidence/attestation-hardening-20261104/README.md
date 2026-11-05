# Historical attestation parser hardening

Synthetic source/unit checks only, 2026-11-04 UTC. No PostgreSQL run, schema installation, production access, source-byte authentication, writer activation, or typecheck is claimed.

The direct declaration parser previously accepted lone UTF-16 surrogates and performed reflective operations on Proxy inputs. The new negative cases reproduced both issues before the fix. The parser now rejects proxy containers using Node's native `isProxy` before reflection, and rejects unpaired surrogates in product source keys, product segments, and source sheet names. Well-formed supplementary Unicode is retained exactly, without normalization. Existing scanner length semantics are unchanged.

The source is used by the Node compiler and PostgreSQL declaration reader, not a browser runtime import. These changes do not upgrade `LOCAL_DECLARATION_ONLY` to source proof or enable any writer.

Command:

    node --test tests/historical-barcode-attestation.test.ts tests/historical-barcode-coordinate-projection.test.ts tests/historical-barcode-postgres-reader.test.ts tests/unified-import-barcode-v2.test.ts tests/unified-import-barcode-whole-package.test.ts tests/historical-v2-five-scheme-offline.test.ts

Result: 40 tests passed, 0 failed, 0 skipped. The focused red log is preserved separately; it is intentional before-fix evidence. Source hashes identify the final implementation and focused tests.

## Future SKU size-group closure

A separate synthetic regression proved that a valid V1 package could carry an extra size with the same display code and pinned source reference, then have a V2 declaration propose that size for a future SKU outside the product's declared size group. The new V2 check requires exact `(product.size_group_id, entry.size_id)` membership before producing any coordinate intent. A positive test adds that exact membership and proves no SKU ID is invented and the V1 program stays unchanged.

The initial fixture-only failure log remains in `/tmp/historical-v2-size-group-fixture.log` as diagnostic history. The preserved size-group red log uses a valid, correctly reconciled fixture and fails because the old compiler accepted the invalid coordinate. The combined green run after both fixes reports 42 passed, 0 failed, 0 skipped. Command is the same six test files listed above. This closes an offline compiler gap only; the separately gated SQL writer must still enforce actual same-transaction coordinates and membership.
