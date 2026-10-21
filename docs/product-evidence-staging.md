# PRODUCT evidence staging — safe minimal slice

Status: implemented source and synthetic protocol tests, not a real import/publication. This work is later than the frozen Mac bundle version1; that archive is unchanged.

## Existing interfaces

`prepareProductEvidenceChunk(input)` checks at most 200 rows / 4 MiB actual UTF-8 JSON. Each row supplies:
- Full `ImportSourceEvidence`: real original file/sheet/row/source key/hash, exact normalized PRODUCT columns, raw original cells and field provenance.
- Explicit `{sourceKey,nativeId,expectedVersion}` mapping to an **already existing** native product. Never use the legacy source key as UUID or generate a native product placeholder.
- Reviewed blank-price policy. All nine original price columns must be own keys. Unknown/absent/whitespace cannot become unset. Raw and normalized nine-price semantics must agree.
- Effective PRODUCT selection (`BASE_V2`, `business/01商品.csv`) with manifest, selection, approval and effective CSV hashes. Batch `source_hash` binds the **selection hash**, not the original workbook hash, and `source_name` binds the fixed namespace.

`stageProductEvidenceChunk(input,{mode,store,authorize})` defaults to `DRY_RUN` and does not connect. `STAGE` needs an independently implemented exact-file/row/native-target authorizer; passing a preflight aggregate boolean is not this contract. The authorizer receives a clone, not mutable storage input.

`PostgresProductEvidenceStagingStore.stage(prepared)` opens one bounded original transaction. Lock order is cutoff → reviewed open batch → actual native product. It checks id/version/product code/name, then calls `insertValidatedCatalogueSourceProof` on the **same client**, which compares every native price with raw validated inputs and atomically inserts the immutable source and proof together. It does not create products, change catalogue prices, update batch status, create baseline stock, or publish. Exact immutable evidence replay succeeds without an insert; changed input, binding, version or price fails. A lost COMMIT acknowledgement discards the connection and does not automatically retry. A caller may explicitly retry the exact chunk and resolve through immutable evidence after the outcome is established.

## Deliberate blockers, not hidden defaults

1. **This store only handles existing native targets.** Missing targets fail. The separate native product creation adapter is documented in `native-product-import.md`; it validates explicit category, supplier, season and size-group bindings and writes the product and proof in one transaction. It still requires independently authorized source and reference mappings and has not been verified against real PostgreSQL or used for a real import. This existing-target store does not offer a fake product-creation callback.
2. **End-to-end file and native mapping authorization is not yet connected.** The shared `scripts/import-v2/authorized-reader.mjs` verifies approved effective CSV and original snapshot bytes/hashes for PRODUCT and TRANSFER_LINE. Its source-only validation does not establish native bindings or authorize a real database import by itself. A trusted caller must supply and verify the exact native mapping before STAGE. Stored hashes remain provenance, not proof that this store independently opened those files.
3. **Approved price transformations need a new proof rule.** If an approved precision correction changes raw versus normalized price, `NINE_PRICE_EXPLICIT_V1` rejects it. Preserve original raw inputs and approvals, introduce separately reviewed versioned transformation evidence, and update publication validation together; do not rewrite raw cells or relabel a changed amount as original.
4. **Publication is not implemented here.** After all entities, source rows and baseline contributors are staged, publication must satisfy existing cutoff complete-scope/final-delta/receipt checks plus schema11 fixed expected/actual counts, actual target bindings, proof/raw values and per-source stock lineage. Do not set IMPORTED/validation flags to bypass those gates.
5. **No live readiness claim.** STAGED rows do not pass `PostgresImportedCatalogueCompletenessVerifier`; only correctly published evidence does. Return values always carry `published:false, importReady:false`.

Frontend requirements and native barcode semantics are unchanged; excluded PRODUCT-bound barcode rows are not staged as PRODUCT evidence. A native product row is a catalogue product, not a PRODUCT barcode carrier.
