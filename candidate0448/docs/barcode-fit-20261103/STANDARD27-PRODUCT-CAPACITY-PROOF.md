# Standard 27 product capacity proof: design only

Status: NOT IMPLEMENTED, NOT AN INSTALLER, NOT AN ADMISSION OR A DATABASE TEST.
The offline `standard27-product-capacity-model.ts` reconstructs caller-supplied synthetic facts only. Neither its `PUBLISHED_STANDARD_PRODUCT` marker nor its compact JSON byte count is a database publication, permission, identity or capacity proof. No runtime capability may be issued from this model.

## Required original transaction and deployment binding

A successor must bind the exact owned pool and same active database client as the product command; pin the actual server/database/role identity, catalog, source version, function and trigger bodies, ownership, column/table ACLs, membership, RLS/forced-RLS policies and security-definer search paths; recheck the required facts at the proper transaction boundary. Pin the separately reviewed observed catalog rather than a reported patch level. The exact 26 issuer and its allowlists remain unchanged. A current-context observer and independent review are still needed before an issuer or capability can be enabled.

## Imported product baseline

1. Locate exactly one original PRODUCT import record for the exact product ID in the applicable standard baseline, under a bounded query without truncation. Verify immutable record, batch, actual receipt and audit linkage via a reviewed restricted server-side proof. An absent original is not automatically a new product.
2. `standard_import_record_proof` alone is insufficient: it checks record/receipt/audit linkage but neither confirms terminal publication nor grants runtime execution. A restricted security-definer successor must additionally prove the exact baseline batch and matching document-conversion batch both reached IMPORTED and that the unique committed DOCUMENT_PUBLISH receipt and matching audit bind actor, time, operation, checkpoint, baseline/document IDs, namespace, cutoff and manifest. Verify actual catalog and ACL before any invocation; do not grant the private helper directly to runtime.
3. Recover the root baseline fields and every original SKU, SKU_BARCODE and PRODUCT_IMAGE belonging to this exact product by immutable target identity and fully verified source records. Bound each set and reject duplicates, incomplete source sets, mismatched target IDs, cross-product rows, barcode-to-SKU conflicts and unrecognized fields. Do not infer a barcode from source defaults or reinterpret historical code dictionaries.
4. Replay every subsequent committed product receipt and audit in exact contiguous version order, with exact actor/time/operation and before/after values. Verify each receipt request hash against an independently available original request; audit_change has no request_hash column and copying it from the receipt is not independent evidence, preserving SKU and barcode identity. Validate baseline and each intermediate state, including image ownership and uniqueness. Compare reconstructed root and all child families to actual locked current rows; any missing, extra, duplicate, inaccessible or mismatching fact fails. Apply the exact production capacity byte/count accounting, not the offline model's approximation.

## Newly created product

Before a create, prove the selected product ID has neither a current product, original standard PRODUCT import target nor existing product receipt/audit; lock the applicable identity and verify no related immutable source identity can collide. Then bound and fingerprint the exact pending completion and admit once in the same transaction. This is a separate path from an imported baseline, not evidence that an unfindable product is safe. Historical barcode local declaration registration and its actor/scope/product ID binding are separate unresolved protocols.

## Required negative and real-engine tests

Under an isolated synthetic database and independently reviewed catalog, cover mismatched/partial publication, missing or duplicate proof/receipt/audit, role/ACL/RLS drift, changed function body, identity substitution, hidden child, cross-product or duplicate barcode, expired capability, concurrent insert, discontinuous or reused operation, rollback/commit-ack fault and actual scan. Prove old 26 behavior unchanged and no access to `import_source_row` in the 27 path. Test 2026 and each admitted historical scheme separately. No authority to change production, and no schema/function/role/permission change is implied by this document.

## Current bounded collector candidate

`adapters/postgres/src/standard27-product-source-collector.ts` is not wired into a production adapter. It acquires product/child metadata and separately bounded audit/receipt identity metadata on one guarded client, rejects orphan identity sets, bounds audit text size before reading bodies, and labels every output `UNVERIFIED_CANDIDATE_ONLY`. It does not fetch audit bodies, prove the published terminal operation, prove a complete import baseline or protect against concurrent phantoms. Its SQL has not run against PostgreSQL, and the client guard is a seam rather than an installed metadata/authority verifier. It cannot issue a capability or admit a product write.

The collector also contains a single-statement product-ID absence observation across product, import record, audit and receipt. Its result is labelled unverified: it does not lock or reserve an absent key, prove source completeness, or authorize creation. Actual transaction isolation, identity lock, publication and ACL proofs are still required.

The candidate additionally observes fixed V1 source-record metadata linkage and the matching V1 terminal publication metadata, requires unique item IDs and checks the separately observed record/batch IDs agree. It deliberately labels this unverified: read-committed statements can see changing contents; catalog/ACL/RLS, all original values, private-helper equivalence, source record sets and serialisation remain unproved. It does not claim V2 publication.

`standard27-product-audit-body-collector.ts` is a separate unenabled same-statement audit/receipt observation. It returns JSONB bodies as text to avoid JavaScript number rounding and enforces bounded row/byte output. It still needs an exact decoder, original request proof, schema/permission/identity admission and same-transaction linkage to every other observation. It is not a V27 issuer or a PostgreSQL test.
