# Native PRODUCT creation — guarded import slice

Status: source implementation and synthetic protocol verification only. No database connection, migration execution, real-data import, service registration or publication is performed by this work. The frozen Mac version1 archive is unchanged.

## Entry points and required evidence

`prepareNativeProductImportChunk` and `stageNativeProductImportChunk` live in `packages/application/src/native-product-import.ts`; `PostgresNativeProductImportStore` is the PostgreSQL transaction adapter. This is a separate **historical import** path, not live product CREATE and not a change to frontend required fields.

The input retains the existing `ProductEvidenceChunk` exact effective selection and original row contracts (up to 200 rows / 4 MiB actual UTF-8 JSON). Each row additionally requires:

- An explicit original `sourceKey` → independently allocated native product ID mapping, with new native `expectedVersion:1`. The importer never allocates IDs, derives an ID from the legacy key, or copies the source key into a native identity.
- All normalized PRODUCT columns and **all original price columns as own keys**. Missing, unknown, whitespace or extra-precision price input cannot be completed with null or zero. The existing reviewed exact-price-column blank policy is the only blank-to-unset price interpretation. Raw and normalized nine-price values must yield the same versioned proof; changed approved amounts need a separate reviewed transformation rule.
- Exact raw provenance for **every** PRODUCT column. Missing non-price source columns or raw-versus-normalized non-price changes fail closed in this first version. Required values cannot have `UNKNOWN` provenance. Approved corrections are not silently relabeled as original values; an unsupported correction remains a blocker until a separately versioned transformation is implemented.
- Explicit `EXACT_BLANK_IS_HISTORICAL_NULL_V1` policy. Only actual exact empty strings in the known nullable historical fields can become SQL NULL: year, system item code, thickness, collar/pants type, supplier and season. Required references stay required. Whitespace is not a blank. This policy grants no nullable exception to live forms or live commands.
- Explicit category, size-group, supplier and season decisions. Category supplies an opaque original path value plus the reviewed **complete root-to-leaf native ID/name/version chain**, limited to the existing one/two-level catalogue contract; no path separator or category is guessed. Other nonblank references supply the exact source value, native ID, code/name snapshot and mapping-file digest; supplier includes version/enabled snapshot. Blank optional supplier/season requires explicit null; nonblank unresolved values fail. A size group must contain at least one actual member→size, share-locked through commit; an empty group would violate the existing native reader contract. This minimum check does not claim complete SKU/member mapping. The adapter does not create dictionaries or suppliers. Disabled original supplier references may be retained only when the exact supplied snapshot matches.

`stageNativeProductImportChunk` defaults to genuinely connection-free `DRY_RUN`. `STAGE` requires a trusted independent `authorize` implementation that verifies the actual effective CSV and original snapshot bytes/digests, exact selected row, source→native identity, and every reference mapping/digest. The callback receives a clone and cannot rewrite storage input. A preflight aggregate success or a caller-supplied boolean is not that authorization. **The exact-file/row authorizer and real source loader are still absent; this adapter alone is not a runnable real import.** Direct store calls are a trusted internal integration seam, not an authorization boundary or public API.

## Transaction and replay

The adapter requires exactly the reviewed schema migration prefix 1–11 and an existing `STAGED`/`VALIDATING` batch bound to the exact selection hash and fixed namespace. It never creates a batch or changes its status.

One bounded original transaction does:

1. Acquire global cutoff lock, then reviewed batch row lock.
2. Lock all pre-existing native targets in canonical ID order, rejecting ID/code conflicts and **any** full-native-field drift. Independently recheck and share-lock actual reference snapshots and category parents.
3. Create all absent, explicitly mapped native products using only validated source projections. Initial native version 1 is a technical creation version, not an invented business value.
4. Only after every native target is held/created, examine immutable source identities/positions/native bindings. Exact previously committed native+source pairs replay without inserts. Existing products without this exact creation evidence cannot be adopted; use the separately reviewed existing-target `product-evidence-staging` path instead. A source-only orphan cannot be repaired by inventing/recreating its product.
5. Call existing `insertValidatedCatalogueSourceProof` **on the same client and transaction**. It compares all nine actual native prices and inserts the original source row and complete immutable proof together. No immutable source is written first for later proof patching. Selection, every reference mapping, nullable policy and complete initial native projection are recorded inside versioned field metadata.

Effective lock order is cutoff → batch → **all product targets** → source rows. The proof writer reacquires only the cutoff/batch/product locks already held by the same transaction. Missing-target races against other native writers fail uniqueness/transaction validation rather than overwriting or adopting the competing row.

Failure anywhere rolls back the entire chunk, including native products and any earlier proof inserts. A lost COMMIT acknowledgement discards the client and never triggers automatic retry; after resolving the outcome, a caller may explicitly resubmit the identical chunk. Both a committed exact pair and an uncommitted empty attempt resolve without duplicate native creation. Changed evidence, target fields/version, reference snapshots or mapping digests fail rather than inheriting old authority.

## Not included / verification limit

- No SKU, stock, image, barcode or other entity mapper writes; the 2,958 excluded PRODUCT-bound barcode rows remain excluded and no product-barcode schema is introduced.
- No dictionary seeds, fake products, guessed prices, generated hashes, production connection, credentials, schema application, frontend requirement changes, deployment or publication.
- Results always retain `published:false, importReady:false`. Native products in an open batch do **not** become published catalogue authority. Existing publication complete-scope/final-delta/count/proof/source-lineage checks and the sales completeness verifier are unchanged.
- `tests/native-product-import.test.ts` uses fictional inputs and a transactional copy-on-write **SQL protocol fake**, covering guarded dry-run/authorization, source/provenance/reference failures, exact nine-price completeness, full-field replay drift, lock/write ordering, whole-chunk rollback and explicit replay after simulated lost COMMIT acknowledgement. This is not real PostgreSQL locking, uniqueness, trigger, isolation or concurrency evidence. Those acceptance runs remain required before a real import or readiness claim.

Focused local verification:

```sh
npm run typecheck
npm run build
node --test tests/native-product-import.test.ts tests/product-evidence-staging.test.ts tests/catalogue-completeness.test.ts
```
