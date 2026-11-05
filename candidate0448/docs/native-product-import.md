# Native PRODUCT creation — guarded import slice

Status: source implementation and synthetic protocol verification only. No database connection, migration execution, real-data import, service registration or publication is performed by this work. The frozen Library Mac version2 (`4daa73f`) archive is unchanged; the changes below are later source work, not inside that archive.

## Entry points and required evidence

`prepareNativeProductImportChunk` and `stageNativeProductImportChunk` live in `packages/application/src/native-product-import.ts`; `PostgresNativeProductImportStore` is the PostgreSQL transaction adapter. This is a separate **historical import** path, not live product CREATE and not a change to frontend required fields.

The input retains the existing `ProductEvidenceChunk` exact effective selection and original row contracts (up to 200 rows / 4 MiB actual UTF-8 JSON). Each row additionally requires:

- An explicit original `sourceKey` → independently allocated native product ID mapping, with new native `expectedVersion:1`. The importer never allocates IDs, derives an ID from the legacy key, or copies the source key into a native identity.
- All normalized PRODUCT columns and **all original price columns as own keys**. Missing, unknown, whitespace or extra-precision price input cannot be completed with null or zero. The existing reviewed exact-price-column blank policy is the only blank-to-unset price interpretation. Raw and normalized nine-price values must yield the same versioned proof; changed approved amounts need a separate reviewed transformation rule.
- Exact raw provenance for **every** PRODUCT column. Missing non-price source columns or raw-versus-normalized non-price changes fail closed in this first version. Required values cannot have `UNKNOWN` provenance. Approved corrections are not silently relabeled as original values; an unsupported correction remains a blocker until a separately versioned transformation is implemented.
- Explicit `EXACT_BLANK_IS_HISTORICAL_NULL_V1` policy. Only actual exact empty strings in the known nullable historical fields can become SQL NULL: year, system item code, thickness, collar/pants type, supplier and season. Required references stay required. Whitespace is not a blank. This policy grants no nullable exception to live forms or live commands.
- Explicit category, size-group, supplier and season decisions. Category supplies an opaque original path value plus the reviewed **complete root-to-leaf native ID/name/version chain**, limited to the existing one/two-level catalogue contract; no path separator or category is guessed. Other nonblank references supply the exact source value, native ID, code/name snapshot and mapping-file digest; supplier includes version/enabled snapshot. Blank optional supplier/season requires explicit null; nonblank unresolved values fail. A size group must contain at least one actual member→size, share-locked through commit; an empty group would violate the existing native reader contract. This minimum check does not claim complete SKU/member mapping. The adapter does not create dictionaries or suppliers. Disabled original supplier references may be retained only when the exact supplied snapshot matches.

`stageNativeProductImportChunk` defaults to genuinely connection-free `DRY_RUN`. `STAGE` requires a trusted independent `authorize` implementation that verifies the actual effective CSV and original snapshot bytes/digests, exact selected row, source→native identity, and every reference mapping/digest. The callback receives a clone and cannot rewrite storage input. A preflight aggregate success or a caller-supplied boolean is not that authorization. The new thin composition described below reuses the existing exact-source reader and independently validates complete reviewed reference decisions; **the trusted host still must supply the independently approved source/decision pins, native identity resolver, mapping files and review decisions. No production operator configuration or runnable real import is supplied.** Direct store calls are a trusted internal integration seam, not an authorization boundary or public API.

## Thin exact-source + reviewed-reference authorization

`scripts/import-v2/authorized-native-product-reader.mjs` exports `openNativeProductAuthorizer`. Pass the trusted host's already-opened `AuthorizedV3Reader`, not a caller boolean, aggregate report or public request callback. The existing reader and its resolver are unchanged. The new layer validates the complete prepared native DTO, then deliberately projects only `{source,product,blankPricePolicy}` into `prepareProductEvidenceChunk` before calling `sourceReader.authorize`. This recomputes the **old** prepared fingerprint rather than passing `nativeProducts`, references or nullable policy into the old reader's exact-hash contract.

Reference authority is separate from source authority. Required options are:

- `referenceDecisionFile`: a bounded regular JSON file with an **independently supplied** `trustedReferenceDecisionSha256`. Never extract that trust pin from the submitted file or a preflight report.
- `mappingFiles`: exact logical-name → regular local path set. The approved decision manifest records all corresponding actual byte SHA256 values; every nonnull category/supplier/season/size-group `mappingSha256` must occur in this verified set. These hashes are rechecked before and after asynchronous source authorization. Missing files, changed bytes, symlinks and extra/missing logical files reject the chunk.
- A complete decision manifest: `{schemaVersion:1,validatorVersion:'NATIVE_PRODUCT_REFERENCE_DECISIONS_V1',batchId,fixedSourceNamespace,selection,mappingFiles:[{name,sha256}],decisions:[...]}`. The batch, fixed namespace and complete effective selection must equal the chunk.
- Each decision is the **complete** output of `nativeProductReferenceDecision(row)`: source row ID/key/full source-evidence hash, exact native product binding, blank-price and historical nullable policies, full category parent/name/version chain, group code/name/ID, supplier state/version/code/name/ID, season code/name/ID, and explicit null optional-reference decisions. Its `decisionSha256` is `requestHash({validatorVersion,...body})`, the existing typed canonical SHA algorithm, not a raw-JSON file hash. A missing field, partial mapping or any full-reference drift is refused.

The pure decision helper **does not grant approval**: computing a self-consistent digest from untrusted input is insufficient. A human/trusted independent review must approve the complete semantic decisions and the external manifest byte hash. Referenced mapping bytes are retained/verified, not interpreted by a guessed generic dictionary parser. The old exact-source authorization remains mandatory even when the decision manifest and all reference files match. The native evidence stores the derived `reference_decision_sha256` together with the complete reference snapshots and source identity; the host retains the independently approved manifest/pin.

Use `authorize: composite.authorize` in `stageNativeProductImportChunk`. Close the composite when done, and separately close its source reader (the composite does not own that reader). There is no DB driver, SQL, publication, retry, source-row mutation or default resolver in this layer. Technical limits: 4 MiB decision manifest, 16 mapping files, 32 MiB/file and 64 MiB aggregate mapping bytes; limits fail, never truncate. These are resource bounds, not business maxima. This source work does not convert original workbook fields, supply missing native dictionaries, or establish real PostgreSQL compatibility.

## Transaction and replay

The adapter requires an explicitly reviewed complete schema prefix and an existing `STAGED`/`VALIDATING` batch bound to the exact selection hash and fixed namespace. `packages/application/src/native-import-schema-contract.ts` currently allows **only exact 1–11 or exact 1–12**. Schema12's additive header directory/publication coverage was checked with its owner and pins final SQL SHA `5562014c70f1045f7a81e80d950597d3917a7e3fa81f3c3381a662e6418ec544`; native product/source/price-proof shapes and product lock order are unchanged. A source test seals those bytes. This source compatibility pin is not a claim that a database owner actually ran those exact SQL bytes; the migration runner owns before-connect byte verification.

Missing11, empty/partial registries, duplicate or unknown future versions are refused before native target locks/writes. **Planned13/14 remain absent/pending review and therefore rejected**; their owners must freeze final DDL and review native/source/proof/locking/publication compatibility before an explicit new prefix is added. No `>=11`, single `EXISTS(version)` fallback or automatic future-version acceptance is used. The adapter never creates a batch or changes its status.

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
node --test tests/native-import-schema-contract.test.ts tests/native-product-authorizer.test.ts
```

Authorizer tests use fictional temporary files and a deliberately labeled exact-source **protocol fake** plus the actual old DTO validator; existing reader tests separately cover real synthetic file/preflight authorization. This is not a new claim of end-to-end real input, database execution or production grants. RealPG/real import remain NOT_RUN.
